from __future__ import annotations

import collections
import json
import queue
import threading
import time
import requests  # HTTP 통신용
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import alsaaudio
import webrtcvad

import config as C
from pipeline.router import VoiceCommandPipeline

# ========================
# RMS_METER Check Helper
# ========================
import math


def rms_i16(x_i16: np.ndarray) -> float:
    # x_i16: int16 mono
    if x_i16.size == 0:
        return 0.0
    xf = x_i16.astype(np.float32)
    return float(np.sqrt(np.mean(xf * xf) + 1e-12))


def dbfs_from_rms_i16(rms: float) -> float:
    # int16 full-scale = 32768
    return 20.0 * math.log10((rms / 32768.0) + 1e-12)


def level_bar(dbfs: float, width: int = 30) -> str:
    # -60dBFS ~ 0dBFS 를 0~width로 매핑
    db = max(-60.0, min(0.0, dbfs))
    n = int(round((db + 60.0) / 60.0 * width))
    return "█" * n + " " * (width - n)


# =========================
# Shared state / Config
# =========================
STATE_DIR = Path("/run/sarvis")
CURRENT_USER_PATH = STATE_DIR / "current_user.json"
ENROLL_FLAG = STATE_DIR / "enrolling.flag"

# Jetson 로컬 Flask 서버 (app_image_embedding.py의 /manual_control 엔드포인트)
JETSON_CONTROL_URL = "http://127.0.0.1:5000/button_command"
JETSON_VOICE_URL = "http://127.0.0.1:5000/voice_command"  # 추적 명령용


@dataclass
class Segment:
    idx: int
    sr: int
    audio_i16: np.ndarray


def int16_from_bytes(b: bytes) -> np.ndarray:
    return np.frombuffer(b, dtype=np.int16)


def safe_load_current_login_id() -> Optional[str]:
    try:
        if not CURRENT_USER_PATH.exists():
            return None
        txt = CURRENT_USER_PATH.read_text(encoding="utf-8")
        obj = json.loads(txt)
        # uid 혹은 login_id 중 존재하는 것을 사용
        login_id = (obj.get("uid") or obj.get("login_id") or "").strip()
        return login_id if login_id else None
    except Exception:
        return None


# =========================
# Threads
# =========================
class LoginGate(threading.Thread):
    # 로그인 상태를 주기적으로 체크하여 녹음 및 파이프라인 활성/비활성 결정
    def __init__(self, enabled_event: threading.Event, stop_evt: threading.Event, poll_sec: float = 0.2):
        super().__init__(daemon=True)
        self.enabled_event = enabled_event
        self.stop_evt = stop_evt
        self.poll_sec = poll_sec
        self.current_id: Optional[str] = None

    def run(self):
        while not self.stop_evt.is_set():
            # 등록 중일 때는 메인 파이프라인 중지
            if ENROLL_FLAG.exists():
                if self.enabled_event.is_set():
                    print("[GATE] Enrollment in progress. Pausing main pipeline.", flush=True)
                    self.enabled_event.clear()
            else:
                login_id = safe_load_current_login_id()
                if login_id:
                    if not self.enabled_event.is_set() or self.current_id != login_id:
                        print(f"[GATE] User '{login_id}' logged in. Pipeline ENABLED.", flush=True)
                        self.current_id = login_id
                        self.enabled_event.set()
                else:
                    if self.enabled_event.is_set():
                        print("[GATE] No user logged in. Pipeline DISABLED.", flush=True)
                        self.current_id = None
                        self.enabled_event.clear()

            time.sleep(self.poll_sec)


class VADProducer(threading.Thread):
    # ALSA 마이크에서 데이터를 읽어 VAD 후 유효한 음성 세그먼트 생성
    def __init__(self, out_q: queue.Queue[Segment], stop_evt: threading.Event, enabled_event: threading.Event):
        super().__init__(daemon=True)
        self.out_q = out_q
        self.stop_evt = stop_evt
        self.enabled_event = enabled_event

        self.vad = webrtcvad.Vad(int(getattr(C, "VAD_MODE", 3)))

        # VAD 설정 (48kHz는 반드시 10ms, 20ms, 30ms 프레임만 지원)
        self.frame_ms = 20  # 48kHz에서 안정적인 프레임 크기
        self.frame_size = int(C.SR * self.frame_ms / 1000)
        self.ring_buffer = collections.deque(maxlen=int(C.PRE_ROLL_SEC * 1000 / self.frame_ms))
        self.triggered = False
        self.voiced_frames = []
        self.silence_count = 0
        self.silence_limit = int(C.SILENCE_TIMEOUT * 1000 / self.frame_ms)
        self.max_frames = int(10.0 * 1000 / self.frame_ms)  # ⭐ 최대 10초 녹음
        self.seg_idx = 0

        # RMS meter / gate
        self._show_level = bool(getattr(C, "SHOW_LEVEL", False))
        self._rms_gate = float(getattr(C, "RMS_GATE", 0.0))
        self._lvl_last_t = 0.0
        # systemd/journal 환경이면 너무 자주 찍으면 로그가 폭주하니 0.5초 권장
        self._lvl_period_sec = 0.5
        self._rms_ema = 0.0
        self._ema_alpha = 0.25  # 0~1 (클수록 반응 빠름)

    def run(self):
        try:
            # ALSA 설정
            mic = alsaaudio.PCM(
                alsaaudio.PCM_CAPTURE,
                alsaaudio.PCM_NORMAL,
                device=getattr(C, "DEVICE_NAME", "default"),
            )
            mic.setchannels(1)
            mic.setrate(C.SR)
            mic.setformat(alsaaudio.PCM_FORMAT_S16_LE)
            mic.setperiodsize(self.frame_size)

            # 마이크 정보 출력
            print(f"[PRODUCER] Microphone device: {getattr(C, 'DEVICE_NAME', 'default')}", flush=True)
            print(f"[PRODUCER] Sample rate: {C.SR}, Frame size: {self.frame_size}", flush=True)
        except Exception as e:
            print(f"[PRODUCER] ALSA Open Error: {e}", flush=True)
            return

        print("[PRODUCER] Recording started.", flush=True)

        # 음성 감지 카운터 (디버깅용)
        frame_count = 0
        speech_frame_count = 0

        while not self.stop_evt.is_set():
            if not self.enabled_event.is_set():
                time.sleep(0.1)
                continue

            l, data = mic.read()
            if l <= 0:
                continue

            # VAD는 정확히 frame_size 바이트를 요구
            if len(data) != self.frame_size * 2:  # 2 bytes per sample (int16)
                continue

            # ⭐ 실시간 노이즈 제거 (noisereduce)
            audio_i16 = int16_from_bytes(data)
            audio_f32 = audio_i16.astype(np.float32) / 32768.0

            # noisereduce 적용 (stationary noise reduction)
            try:
                import noisereduce as nr

                audio_f32_clean = nr.reduce_noise(
                    y=audio_f32,
                    sr=C.SR,
                    stationary=True,
                    prop_decrease=0.8,  # 노이즈 제거 강도 (0.0~1.0)
                )
            except ImportError:
                audio_f32_clean = audio_f32
            except Exception:
                audio_f32_clean = audio_f32

            # 다시 int16로 변환
            audio_i16_clean = (audio_f32_clean * 32768.0).astype(np.int16)
            data_clean = audio_i16_clean.tobytes()

            # ===== RMS 계산 (gate 또는 meter용) =====
            need_rms = (self._rms_gate > 0.0) or self._show_level
            if need_rms:
                r = rms_i16(audio_i16_clean)
                self._rms_ema = (1.0 - self._ema_alpha) * self._rms_ema + self._ema_alpha * r
                db = dbfs_from_rms_i16(self._rms_ema)

                # ===== RMS 출력 (원할 때만) =====
                if self._show_level:
                    now_t = time.time()
                    if (now_t - self._lvl_last_t) >= self._lvl_period_sec:
                        gate_on = (self._rms_gate > 0.0 and self._rms_ema >= self._rms_gate)
                        bar = level_bar(db, width=30)
                        print(
                            f"[RMS] {self._rms_ema:7.1f}  {db:6.1f} dBFS |{bar}| gate={self._rms_gate:.0f} {'ON ' if gate_on else 'off'}",
                            flush=True,
                        )
                        self._lvl_last_t = now_t

            try:
                # 노이즈 제거된 데이터로 VAD
                is_speech = self.vad.is_speech(data_clean, C.SR)

                # RMS gate 적용: gate 미만이면 speech 로 인정하지 않음
                if self._rms_gate > 0.0 and self._rms_ema < self._rms_gate:
                    is_speech = False
            except Exception:
                # VAD 처리 실패 시 무시하고 계속 진행
                continue

            # 디버깅: 주기적으로 상태 출력 (5초마다)
            frame_count += 1
            if is_speech:
                speech_frame_count += 1

            if frame_count % 250 == 0:  # 약 5초마다 (20ms * 250 = 5000ms)
                print(
                    f"[PRODUCER] Frames: {frame_count}, Speech: {speech_frame_count} ({speech_frame_count*100//frame_count}%)",
                    flush=True,
                )
                speech_frame_count = 0
                frame_count = 0

            if not self.triggered:
                self.ring_buffer.append((data_clean, is_speech))  # ⭐ 노이즈 제거된 데이터 저장
                num_voiced = len([f for f, speech in self.ring_buffer if speech])
                if num_voiced > 0.8 * self.ring_buffer.maxlen:
                    self.triggered = True
                    print("🎤 [PRODUCER] Speech detected! Starting recording...", flush=True)
                    for f, s in self.ring_buffer:
                        self.voiced_frames.append(f)
                    self.ring_buffer.clear()
            else:
                self.voiced_frames.append(data_clean)  # ⭐ 노이즈 제거된 데이터 저장
                if not is_speech:
                    self.silence_count += 1
                else:
                    self.silence_count = 0

                # ⭐ 최대 길이 도달 시 강제 종료
                if len(self.voiced_frames) >= self.max_frames:
                    print("⚠️  [PRODUCER] Max length reached, forcing segment end", flush=True)
                    self.silence_count = self.silence_limit + 1

                if self.silence_count > self.silence_limit:
                    # 음성 구간 종료 (침묵 or 최대 길이)
                    full_audio = b"".join(self.voiced_frames)
                    audio_i16_seg = int16_from_bytes(full_audio)

                    # 최소 길이 체크
                    if len(audio_i16_seg) > int(C.MIN_SEG_SEC * C.SR):
                        self.seg_idx += 1
                        duration = len(audio_i16_seg) / C.SR
                        print(f"✅ [PRODUCER] Segment #{self.seg_idx} recorded ({duration:.2f}s)", flush=True)
                        try:
                            self.out_q.put(Segment(self.seg_idx, C.SR, audio_i16_seg), timeout=0.1)
                        except queue.Full:
                            print("⚠️  [PRODUCER] Queue full, segment dropped", flush=True)
                    else:
                        print("⚠️  [PRODUCER] Segment too short, ignored", flush=True)

                    self.triggered = False
                    self.voiced_frames = []
                    self.silence_count = 0


class PipelineWorker(threading.Thread):
    # 음성 세그먼트를 파이프라인에 전달하고 결과를 처리(RPI 전송)
    def __init__(self, in_q: queue.Queue[Segment], stop_evt: threading.Event, enabled_event: threading.Event, gate: LoginGate):
        super().__init__(daemon=True)
        self.in_q = in_q
        self.stop_evt = stop_evt
        self.enabled_event = enabled_event
        self.gate = gate
        self.pipe: Optional[VoiceCommandPipeline] = None

    def _ensure_pipe(self, login_id: str):
        if self.pipe is None:
            print(f"[WORKER] Initializing pipeline for user: {login_id}", flush=True)
            self.pipe = VoiceCommandPipeline()

    def _close_pipe(self):
        self.pipe = None

    def _send_to_rpi(self, result: dict):
        # 인식된 명령어를 적절한 곳으로 전송
        # - 로봇팔 제어: Jetson Flask → 라즈베리파이
        # - 유튜브/앱 제어: 백엔드 서버 → 앱
        cmd = result.get("command")
        if not cmd or cmd in ("REJECT", "UNKNOWN"):
            return

        # 현재 로그인된 사용자 정보 가져오기
        uid = None
        try:
            if CURRENT_USER_PATH.exists():
                with open(CURRENT_USER_PATH, "r") as f:
                    user_data = json.load(f)
                    uid = user_data.get("uid")
        except Exception as e:
            print(f"⚠️  [CMD] Failed to load user: {e}", flush=True)
            return

        if not uid:
            print("⚠️  [CMD] No user logged in, cannot send command", flush=True)
            return

        # 유튜브 명령은 백엔드 서버로 전송
        if cmd.startswith("YOUTUBE_"):
            self._send_to_backend_server(cmd, result, uid)
            return

        # 추적 명령 (FOLLOW_ME, STOP, COME_HERE, HOME)
        if cmd in ("FOLLOW_ME", "STOP", "COME_HERE", "HOME"):
            self._send_voice_command(cmd, uid)
            return

        # 로봇팔 명령은 라즈베리파이로 전송
        command_str = self._convert_voice_to_rpi_command(cmd, result)

        if not command_str:
            print(f"⚠️  [CMD] Cannot convert command: {cmd}", flush=True)
            return

        # Jetson 로컬 Flask 서버의 /button_command 엔드포인트로 전송 (6번 반복)
        payload = {"command": command_str}

        try:
            success_count = 0
            for i in range(6):
                resp = requests.post(JETSON_CONTROL_URL, json=payload, timeout=1.0)
                if resp.status_code == 200:
                    success_count += 1
                time.sleep(0.05)  # 50ms 간격
    
            if success_count == 6:
                print(f"✅ [CMD→RPI] {command_str} x6", flush=True)
            else:
                print(f"⚠️  [CMD→RPI] {command_str} partial success: {success_count}/6", flush=True)
        except Exception as e:
            print(f"❌ [CMD→RPI] Error: {e}", flush=True)

    def _send_voice_command(self, cmd: str, uid: str):
        """추적 명령 전송 (FOLLOW_ME, STOP, COME_HERE, HOME)"""
        # 명령 매핑
        command_map = {
            "FOLLOW_ME": "TRACK_ON",
            "STOP": "TRACK_OFF",
            "COME_HERE": "COME_HERE",
            "HOME": "HOME"
        }
        
        command_str = command_map.get(cmd)
        if not command_str:
            print(f"⚠️  [VOICE] Unknown voice command: {cmd}", flush=True)
            return
        
        payload = {"command": command_str}
        
        try:
            resp = requests.post(JETSON_VOICE_URL, json=payload, timeout=1.0)
            if resp.status_code == 200:
                print(f"✅ [CMD→VOICE] {command_str}", flush=True)
            else:
                print(f"❌ [CMD→VOICE] Failed: status={resp.status_code}", flush=True)
        except Exception as e:
            print(f"❌ [CMD→VOICE] Error: {e}", flush=True)

    def _send_to_backend_server(self, cmd: str, result: dict, uid: str):
        # 유튜브/앱 제어 명령을 백엔드 서버로 전송
        backend_url = getattr(C, "SERVER_BASE", "http://i14a104.p.ssafy.io:8080")
        endpoint = f"{backend_url}/api/control/voice/"

        # 모든 명령어 동일한 형식으로 전달
        payload = {"uid": uid, "command": cmd}

        try:
            resp = requests.post(endpoint, json=payload, timeout=2.0)
            if resp.status_code == 200:
                print(f"✅ [CMD→SERVER] {cmd} (to app)", flush=True)
            else:
                print(f"❌ [CMD→SERVER] Failed: status={resp.status_code}", flush=True)
        except Exception as e:
            print(f"❌ [CMD→SERVER] Error: {e}", flush=True)

    def _convert_voice_to_rpi_command(self, cmd: str, result: dict) -> Optional[str]:
        # 음성 명령을 라즈베리파이 로봇팔 이동 명령으로 변환 (MOVE만)
        if cmd == "MOVE":
            direction = result.get("dir")
            if direction == "left":
                return "LEFT"
            if direction == "right":
                return "RIGHT"
            if direction == "up":
                return "UP"
            if direction == "down":
                return "DOWN"
            if direction == "forward":
                return "FAR"
            if direction == "backward":
                return "NEAR"

        return None

    def run(self):
        while not self.stop_evt.is_set():
            login_id = self.gate.current_id
            if not login_id:
                # 큐 비우기
                while not self.in_q.empty():
                    self.in_q.get()
                self._close_pipe()
                self.enabled_event.wait(timeout=0.2)
                continue

            self._ensure_pipe(login_id)

            try:
                seg = self.in_q.get(timeout=0.1)
            except queue.Empty:
                if self.pipe:
                    tick_result = self.pipe.tick_time()
                    if tick_result:
                        self._send_to_rpi(tick_result)
                continue

            if self.pipe:
                result = self.pipe.handle_segment(seg.idx, seg.sr, seg.audio_i16)

                if result:
                    self._send_to_rpi(result)

                tick_result = self.pipe.tick_time()
                if tick_result:
                    self._send_to_rpi(tick_result)

        self._close_pipe()


def main():
    print("=" * 50)
    print("SARVIS Voice Control System Active")
    print("=" * 50)

    seg_q = queue.Queue(maxsize=5)
    stop_evt = threading.Event()
    enabled_event = threading.Event()

    gate = LoginGate(enabled_event, stop_evt)
    prod = VADProducer(seg_q, stop_evt, enabled_event)
    work = PipelineWorker(seg_q, stop_evt, enabled_event, gate)

    gate.start()
    prod.start()
    work.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[MAIN] Stopping...")
        stop_evt.set()
        gate.join()
        prod.join()
        work.join()
        print("[MAIN] All threads stopped. Bye.")


if __name__ == "__main__":
    main()