"""
Improved Router - 화자 검증 + 서버 피드백 대기

워크플로우:
1. WAKE 감지 → 화자 검증
2. 화자 검증 성공 → EC2에 POST /api/voice-command/trigger (uid)
3. EC2 → 앱 → 사용자 알림 → 앱 → EC2 → 젯슨
4. {'success': True} 받으면 → 명령어 대기 시작
"""
from __future__ import annotations

import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import httpx
import webrtcvad

import config as C
from pipeline.state_machine import StateMachine, StateConfig, Mode
from pipeline.kws_wake import WakeKWS, WakeKWSConfig
from pipeline.speaker_verify import SpeakerVerifier, SpeakerConfig
from pipeline.stt_llm import (
    RuntimeState,
    transcribe_via_server,
    parse_command_rule,
    llm_fallback_parse,
    save_wav,
)

STATE_DIR = Path("/run/sarvis")
CURRENT_USER_PATH = STATE_DIR / "current_user.json"


class ImprovedVoiceCommandPipeline:
    """
    개선된 음성 명령 파이프라인
    
    주요 개선점:
    - 화자 검증 후 서버 피드백 대기
    - 사용자 알림 확인 후 명령어 인식 시작
    """
    
    def __init__(self):
        self._stt_proxy_url = str(getattr(C, "STT_PROXY_URL", "")).strip()
        if not self._stt_proxy_url:
            raise RuntimeError("proxy-only mode requires STT_PROXY_URL in config.py")
        
        self.sm = StateMachine(
            StateConfig(
                active_timeout_sec=float(getattr(C, "ACTIVE_WINDOW_SEC", 4.0)),
                command_cooldown_sec=float(getattr(C, "CMD_COOLDOWN_SEC", 0.8)),
                speaker_cache_sec=float(getattr(C, "SPEAKER_CACHE_SEC", 8.0)),
            )
        )
        
        self.kws = WakeKWS(
            WakeKWSConfig(
                onnx_path=str(getattr(C, "KWS_ONNX_PATH", "models/kws/kws.onnx")),
                labels=list(getattr(C, "KWS_LABELS", ["WAKE", "UNKNOWN"])),
                clip_sec=float(getattr(C, "KWS_CLIP_SEC", 1.0)),
                n_mels=int(getattr(C, "KWS_N_MELS", 40)),
            )
        )
        self._wake_conf = float(getattr(C, "WAKE_CONF", 0.70))
        self.IDLE_ALLOWED = {"WAKE"}
        
        self.sv = SpeakerVerifier(
            SpeakerConfig(
                threshold=float(getattr(C, "SPK_THRESHOLD", 0.35)),
                min_seg_sec=float(getattr(C, "SPK_MIN_SEG_SEC", 0.8)),
                server_verify_url="",
                timeout_sec=1.0,
                model_type=getattr(C, "SPK_MODEL_TYPE", "ecapa"),
            ),
            profile_path=str(getattr(C, "USER_CACHE_PATH", "profiles/current_user.json")),
            ecapa_onnx_path=str(getattr(C, "ECAPA_ONNX_PATH", "models/speaker/ecapa.onnx")),
        )
        
        self._runtime_state = RuntimeState(mode="idle")
        
        # Command buffer
        self._cmd_buf: List[np.ndarray] = []
        self._cmd_sr: int = 0
        self._last_seg_t: float = 0.0
        
        # Active state
        self._active_enter_t: float = 0.0
        self._cmd_started: bool = False
        self._cmd_start_accum_sec: float = 0.0
        
        # ⭐ 피드백 대기 상태
        self._waiting_for_feedback: bool = False
        self._feedback_received: bool = False
        self._feedback_wait_start: float = 0.0
        self._feedback_timeout_sec: float = float(getattr(C, "FEEDBACK_TIMEOUT_SEC", 10.0))
        
        # ⭐ Pre-buffering
        self._pre_buffer: List[np.ndarray] = []
        self._pre_buffer_enabled: bool = bool(getattr(C, "PRE_BUFFER_ENABLED", True))
        
        # Timing config
        self._wake_wait_sec = float(getattr(C, "WAKE_WAIT_SEC", 15.0))
        self._cmd_start_min_sec = float(getattr(C, "CMD_START_MIN_SEC", 0.20))
        self._cmd_silence_timeout = float(getattr(C, "CMD_SILENCE_TIMEOUT", 0.7))
        self._cmd_max_sec = float(getattr(C, "ACTIVE_WINDOW_SEC", 4.0))
        self._use_llm_fallback = bool(getattr(C, "LLM_FALLBACK", True))
        
        # Dynamic threshold
        self._cmd_start_rms = float(getattr(C, "CMD_START_RMS", 120.0))
        self._cmd_ignore_rms = float(getattr(C, "CMD_IGNORE_RMS", 70.0))
        self._cmd_min_speech_ratio = float(getattr(C, "CMD_MIN_SPEECH_RATIO", 0.25))
        
        # Fallback threshold
        self._cmd_fallback_rms = float(getattr(C, "CMD_FALLBACK_RMS", 80.0))
        self._cmd_fallback_enabled = bool(getattr(C, "CMD_FALLBACK_ENABLED", True))
        
        # ⭐ 서버 피드백 URL
        self._voice_trigger_url = f"{getattr(C, 'SERVER_BASE', 'http://localhost:8080')}/api/voice-command/trigger/"

        # Wake validation
        self._wake_validation_enabled = bool(getattr(C, "WAKE_VALIDATION_ENABLED", True))
        self._wake_validation_url = str(getattr(C, "WAKE_VALIDATION_URL", "")).strip()
        self._wake_target_words = list(getattr(C, "WAKE_TARGET_WORDS", ["싸비스"]))
        self._wake_validation_threshold = float(getattr(C, "WAKE_VALIDATION_THRESHOLD", 0.7))
        
        # VAD
        self._vad = webrtcvad.Vad(int(getattr(C, "VAD_MODE", 2)))
        self._vad_frame_ms = int(getattr(C, "FRAME_MS", 20))
        if self._vad_frame_ms not in (10, 20, 30):
            self._vad_frame_ms = 20
        
        # HTTP
        timeout = httpx.Timeout(
            connect=float(getattr(C, "HTTP_CONNECT_TIMEOUT", 2.0)),
            read=float(getattr(C, "HTTP_READ_TIMEOUT", 30.0)),
            write=float(getattr(C, "HTTP_WRITE_TIMEOUT", 30.0)),
            pool=float(getattr(C, "HTTP_POOL_TIMEOUT", 30.0)),
        )
        self.http = httpx.Client(timeout=timeout)
        
        # Debug
        self._debug = bool(getattr(C, "PRINT_EVERY_SEG", True))
        self._verbose_timing = bool(getattr(C, "VERBOSE_TIMING", False))
        
        # Statistics
        self._stats = {
            "wake_detected": 0,
            "wake_validated": 0,
            "wake_validation_failed": 0,
            "sv_passed": 0,
            "sv_failed": 0,
            "feedback_sent": 0,
            "feedback_received": 0,
            "feedback_timeout": 0,
            "cmd_started": 0,
            "cmd_fallback_used": 0,
            "cmd_finalized": 0,
        }
        
        self._log("initialized (improved router with feedback)")
        self._log(
            f"CFG: WAKE_WAIT={self._wake_wait_sec}s, "
            f"CMD_START_MIN={self._cmd_start_min_sec}s, "
            f"CMD_SILENCE={self._cmd_silence_timeout}s, "
            f"FEEDBACK_TIMEOUT={self._feedback_timeout_sec}s"
        )
    
    def close(self):
        try:
            self.http.close()
        except Exception:
            pass
        
        # Print stats
        print("\n" + "="*60)
        print("Pipeline Statistics:")
        for k, v in self._stats.items():
            print(f"  {k}: {v}")
        print("="*60 + "\n")
    
    def _log(self, msg: str):
        if self._debug:
            print(f"[PIPELINE] {msg}", flush=True)
    
    def _log_timing(self, msg: str):
        if self._verbose_timing:
            print(f"[TIMING] {msg}", flush=True)
    
    def _send_trigger_and_wait_feedback(self, uid: str) -> bool:
        """
        화자 검증 성공 후 서버에 트리거 전송하고 피드백 대기
        
        Returns:
            True if feedback received successfully
        """
        try:
            self._log(f"🔔 Sending trigger to server: uid={uid}")
            
            response = self.http.post(
                self._voice_trigger_url,
                json={"uid": uid},
                timeout=self._feedback_timeout_sec
            )
            
            if response.status_code != 200:
                self._log(f"❌ Trigger failed: status={response.status_code}")
                return False
            
            data = response.json()
            success = data.get("success", False)
            
            if success:
                self._log(f"✅ Feedback received: success=True")
                self._stats["feedback_received"] += 1
                return True
            else:
                self._log(f"❌ Feedback failed: {data}")
                return False
                
        except httpx.TimeoutException:
            self._log(f"⏱️  Feedback timeout ({self._feedback_timeout_sec}s)")
            self._stats["feedback_timeout"] += 1
            return False
            
        except Exception as e:
            self._log(f"❌ Feedback error: {e}")
            return False
    
    def _validate_wake_with_stt(self, audio_f32: np.ndarray, sr: int) -> Tuple[bool, float, str]:
        """STT 기반 Wake word 2차 검증"""
        if not self._wake_validation_enabled or not self._wake_validation_url:
            return True, 1.0, "validation_disabled"
        
        try:
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp_path = Path(tmp.name)
                save_wav(tmp_path, audio_f32, sr)
                
                stt_text, _ = transcribe_via_server(self.http, tmp_path)
                
                try:
                    tmp_path.unlink()
                except Exception:
                    pass
                
                if not stt_text:
                    return False, 0.0, "empty_stt"
                
                payload = {
                    "text": stt_text,
                    "target_words": self._wake_target_words,
                }
                
                response = self.http.post(
                    self._wake_validation_url,
                    json=payload,
                    timeout=3.0
                )
                
                if response.status_code != 200:
                    self._log(f"⚠️  Validation API error: status={response.status_code}")
                    return True, 1.0, "api_error_bypass"
                
                result = response.json()
                is_valid = result.get("is_valid", False)
                confidence = result.get("confidence", 0.0)
                reason = result.get("reason", "unknown")
                matched = result.get("matched_word", "")
                
                self._log(
                    f"[VALIDATION] STT='{stt_text}' -> "
                    f"valid={is_valid}, conf={confidence:.3f}, "
                    f"reason={reason}, matched={matched}"
                )
                
                return is_valid, confidence, reason
        
        except Exception as e:
            self._log(f"❌ Wake validation error: {e}")
            return True, 1.0, f"error_bypass: {e}"
    
    def _guard_active_mode(self):
        """ACTIVE 모드 유지"""
        if self._active_enter_t > 0.0:
            if self.sm.mode == Mode.IDLE:
                self.sm.enter_active()
    
    def _reset_cmd_buf(self):
        self._cmd_buf = []
        self._pre_buffer = []
        self._cmd_sr = 0
        self._last_seg_t = 0.0
        self._active_enter_t = 0.0
        self._cmd_started = False
        self._cmd_start_accum_sec = 0.0
    
    def _reset_to_idle(self):
        self._reset_cmd_buf()
        self._waiting_for_feedback = False
        self._feedback_received = False
        self.sm.mode = Mode.IDLE
    
    def _cmd_total_sec(self) -> float:
        if not self._cmd_buf or not self._cmd_sr:
            return 0.0
        total = float(sum(x.shape[0] for x in self._cmd_buf))
        return total / float(self._cmd_sr)
    
    def _segment_stats(self, audio_f32: np.ndarray, sr: int) -> Tuple[float, float]:
        """세그먼트 통계 (RMS, speech ratio)"""
        rms_i16 = float(np.sqrt(np.mean(audio_f32 * audio_f32) + 1e-12)) * 32768.0
        x_i16 = (np.clip(audio_f32, -1.0, 1.0) * 32768.0).astype(np.int16)
        
        frame_len = int(sr * self._vad_frame_ms / 1000)
        n = x_i16.shape[0] // frame_len
        if n <= 0:
            return rms_i16, 0.0
        
        speech = 0
        for i in range(n):
            frm = x_i16[i * frame_len:(i + 1) * frame_len].tobytes()
            try:
                if self._vad.is_speech(frm, sr):
                    speech += 1
            except Exception:
                pass
        
        return rms_i16, speech / float(n)
    
    def tick_time(self) -> Optional[Dict[str, Any]]:
        """시간 기반 체크"""
        self.sm.tick()
        self._guard_active_mode()
        
        if self.sm.mode == Mode.IDLE:
            if self._cmd_buf:
                self._log("IDLE but pending cmd -> drop")
                self._reset_cmd_buf()
            return None
        
        now = time.time()
        
        # ⭐ 피드백 대기 중
        if self._waiting_for_feedback:
            elapsed = now - self._feedback_wait_start
            if elapsed >= self._feedback_timeout_sec:
                self._log(f"⏱️  Feedback timeout ({elapsed:.2f}s) -> back to IDLE")
                self._reset_to_idle()
            return None
        
        # ACTIVE but command not started
        if not self._cmd_started:
            if self._active_enter_t > 0.0:
                self.sm.refresh_active()
                elapsed = now - self._active_enter_t
                
                if elapsed >= self._wake_wait_sec:
                    if self._cmd_fallback_enabled and self._cmd_buf:
                        self._log_timing(
                            f"wake_wait timeout ({elapsed:.2f}s), "
                            f"attempting fallback start with {len(self._cmd_buf)} buffered segments"
                        )
                        self._cmd_started = True
                        self._stats["cmd_fallback_used"] += 1
                        return None
                    else:
                        self._log(f"wake wait timeout ({elapsed:.2f}s) -> exit active (no command started)")
                        self._reset_to_idle()
            return None
        
        # Command started: finalize by silence
        if self._cmd_buf and self._last_seg_t > 0.0:
            if (now - self._last_seg_t) >= self._cmd_silence_timeout:
                return self._finalize_command()
        
        return None
    
    def handle_segment(self, idx: int, sr: int, audio_int16: np.ndarray) -> Optional[Dict[str, Any]]:
        """세그먼트 처리"""
        self.sm.tick()
        self._guard_active_mode()
        
        audio_f32 = (audio_int16.astype(np.float32) / 32768.0).reshape(-1)
        now = time.time()
        
        # ⭐ 피드백 대기 중이면 명령어 무시
        if self._waiting_for_feedback:
            return None
        
        # ---------------- IDLE: WAKE + SV + FEEDBACK ----------------
        if self.sm.mode == Mode.IDLE and self._active_enter_t == 0.0:
            label, conf = self.kws.predict(audio_f32, sr, allowed=self.IDLE_ALLOWED)
            self._log(f"[KWS] seg#{idx} label={label}, conf={conf:.3f}")
            
            kws_passed = (label == "WAKE" and conf >= self._wake_conf)
            
            # ⭐ STT 기반 Wake word validation
            stt_passed = False
            val_conf = 0.0
            val_reason = "not_checked"
            
            if self._wake_validation_enabled:
                if not kws_passed or label == "WAKE":
                    is_valid, val_conf, val_reason = self._validate_wake_with_stt(audio_f32, sr)
                    stt_passed = is_valid
                    
                    if stt_passed:
                        self._log(f"✅ STT validation passed: conf={val_conf:.3f}, reason={val_reason}")
            
            # OR 조건: 둘 중 하나만 통과하면 OK
            if not (kws_passed or stt_passed):
                if label != "WAKE":
                    return None
                
                self._log(
                    f"❌ Both validations failed: "
                    f"KWS conf={conf:.3f} < {self._wake_conf}, "
                    f"STT valid={stt_passed} (conf={val_conf:.3f})"
                )
                self._stats["wake_validation_failed"] += 1
                return None
            
            # 통과!
            if kws_passed and stt_passed:
                self._log(f"✅✅ WAKE detected (both): KWS={conf:.3f}, STT={val_conf:.3f}")
            elif kws_passed:
                self._log(f"✅ WAKE detected (KWS only): conf={conf:.3f}")
            else:
                self._log(f"✅ WAKE detected (STT only): conf={val_conf:.3f}, reason={val_reason}")
            

            self._stats["wake_detected"] += 1
            self._stats["wake_validated"] += 1
            
            # ⭐ 화자 검증 로직
            bypass_sv = getattr(C, "SPEAKER_VERIFICATION_BYPASS", False)
            
            uid = None
            if bypass_sv:
                # Bypass 모드: JSON에서 uid 로드
                self._log(f"🔓 SV Bypass enabled")
                try:
                    if CURRENT_USER_PATH.exists():
                        import json
                        with open(CURRENT_USER_PATH, "r") as f:
                            user_data = json.load(f)
                            uid = user_data.get("uid")
                except Exception as e:
                    self._log(f"⚠️  Failed to load uid: {e}")
                
                if not uid:
                    uid = getattr(C, "BYPASS_DEFAULT_UID", "default_user")
                    self._log(f"⚠️  No uid found, using default: {uid}")
                
                self._log(f"✅ WAKE detected (bypass), uid={uid}")
            else:
                # 화자 검증 수행
                self._log(f"🔒 Performing speaker verification...")
                
                # Wake Word 세그먼트로 화자 검증
                verified_uid, confidence = self.sv.verify(audio_f32, sr)
                
                if verified_uid is None:
                    self._log(f"❌ Speaker verification failed (conf={confidence:.3f})")
                    self._stats["sv_failed"] += 1
                    return None
                
                uid = verified_uid
                self._log(f"✅ Speaker verified: uid={uid}, conf={confidence:.3f}")
                self._stats["sv_passed"] += 1
            
            # 서버에 피드백 요청 (Wake Word 감지 알림)
            self._stats["feedback_sent"] += 1
            feedback_ok = self._send_trigger_and_wait_feedback(uid)
            
            if not feedback_ok:
                self._log(f"❌ Feedback failed -> back to IDLE")
                return None
            
            self._log(f"🎯 Feedback received! Ready for command...")
            
            # ✅ 명령어 대기 모드로 진입
            self.sm.set_cached_speaker(uid)
            self.sm.enter_active()
            
            self._reset_cmd_buf()
            self._cmd_sr = sr
            self._active_enter_t = now
            self._cmd_started = False
            self._cmd_start_accum_sec = 0.0
            self._last_seg_t = 0.0
            
            if self._pre_buffer_enabled:
                self._pre_buffer = []
                self._log_timing(f"Pre-buffering enabled: ready to collect command segments")
            
            return None
        # ---------------- ACTIVE: collect cmd ----------------
        if (not self._cmd_started) and (not self.sm.can_execute()):
            self._log("cooldown: ignore command start")
            return None
        
        if self._cmd_sr and self._cmd_sr != sr:
            self._log(f"SR mismatch: buf_sr={self._cmd_sr} seg_sr={sr} -> reset")
            self._reset_to_idle()
            return None
        if not self._cmd_sr:
            self._cmd_sr = sr
        
        if self._active_enter_t > 0.0:
            self.sm.refresh_active()
        
        rms_i16, speech_ratio = self._segment_stats(audio_f32, sr)
        
        if self._debug:
            elapsed = now - self._active_enter_t if self._active_enter_t > 0 else 0
            self._log(
                f"seg#{idx} rms={rms_i16:.1f} speech={speech_ratio:.2f} "
                f"started={self._cmd_started} elapsed={elapsed:.2f}s"
            )
        
        # Pre-buffer에 추가
        if not self._cmd_started and self._pre_buffer_enabled:
            if rms_i16 >= self._cmd_ignore_rms:
                self._pre_buffer.append(audio_f32.copy())
                self._log_timing(f"Added to pre-buffer: {len(self._pre_buffer)} segments")
        
        is_speechlike = (speech_ratio >= self._cmd_min_speech_ratio)
        
        if not self._cmd_started:
            # Primary threshold
            if rms_i16 >= self._cmd_start_rms and is_speechlike:
                already_in_prebuffer = False
                if self._pre_buffer:
                    self._log_timing(f"Moving {len(self._pre_buffer)} pre-buffered segments to cmd_buf")
                    self._cmd_buf.extend(self._pre_buffer)
                    already_in_prebuffer = True
                    self._pre_buffer = []
                
                if not already_in_prebuffer:
                    self._cmd_buf.append(audio_f32.copy())
                
                self._cmd_start_accum_sec += float(audio_f32.shape[0]) / float(sr)
                self._last_seg_t = now
                self.sm.refresh_active()
                
                if self._cmd_start_accum_sec >= self._cmd_start_min_sec:
                    self._cmd_started = True
                    self._stats["cmd_started"] += 1
                    self._log(
                        f"🟢 CMD started (primary): "
                        f"accum={self._cmd_start_accum_sec:.2f}s, "
                        f"rms={rms_i16:.1f}, speech={speech_ratio:.2f}"
                    )
            
            # Fallback threshold
            elif self._cmd_fallback_enabled:
                elapsed = now - self._active_enter_t if self._active_enter_t > 0 else 0
                
                if elapsed >= (self._wake_wait_sec * 0.5):
                    if rms_i16 >= self._cmd_fallback_rms and is_speechlike:
                        already_in_prebuffer = False
                        if self._pre_buffer:
                            self._log_timing(f"Fallback: moving {len(self._pre_buffer)} pre-buffered segments")
                            self._cmd_buf.extend(self._pre_buffer)
                            already_in_prebuffer = True
                            self._pre_buffer = []
                        
                        if not already_in_prebuffer:
                            self._cmd_buf.append(audio_f32.copy())
                        
                        self._cmd_start_accum_sec += float(audio_f32.shape[0]) / float(sr)
                        self._last_seg_t = now
                        self.sm.refresh_active()
                        
                        if self._cmd_start_accum_sec >= self._cmd_start_min_sec:
                            self._cmd_started = True
                            self._stats["cmd_fallback_used"] += 1
                            self._log(
                                f"🟡 CMD started (fallback): "
                                f"accum={self._cmd_start_accum_sec:.2f}s, "
                                f"rms={rms_i16:.1f}, speech={speech_ratio:.2f}"
                            )
            
            return None
        
        # Command started: 계속 수집
        if rms_i16 < self._cmd_ignore_rms or not is_speechlike:
            return None
        
        self._cmd_buf.append(audio_f32.copy())
        self._last_seg_t = now
        self.sm.refresh_active()
        
        total_sec = self._cmd_total_sec()
        self._log_timing(f"Collecting seg#{idx}: total={total_sec:.2f}s")
        
        if total_sec >= self._cmd_max_sec:
            self._log("cmd_max_sec reached -> finalize")
            return self._finalize_command()
        
        return None
    
    def _finalize_command(self) -> Optional[Dict[str, Any]]:
        """명령어 종료 및 처리"""
        if not self._cmd_buf:
            self.sm.mode = Mode.IDLE
            self._reset_cmd_buf()
            return None
        
        sr = int(self._cmd_sr or getattr(C, "SR", 16000))
        audio = np.concatenate(self._cmd_buf).astype(np.float32).reshape(-1)
        
        max_n = int(sr * self._cmd_max_sec)
        if audio.shape[0] > max_n:
            audio = audio[:max_n]
        
        request_id = uuid.uuid4().hex[:12]
        speaker_id = self.sm.get_cached_speaker() or "unknown"
        
        tmp_dir = Path(getattr(C, "CMD_WAV_DIR", "/tmp"))
        tmp = tmp_dir / f"cmd_{request_id}.wav"
        
        stt_text = ""
        cmd: Dict[str, Any] = {"cmd": "REJECT", "reason": "internal_error"}
        timings: Dict[str, float] = {}
        
        self._stats["cmd_finalized"] += 1
        
        try:
            save_wav(tmp, audio, sr)
            
            self._log(f"📝 Finalizing command: duration={len(audio)/sr:.2f}s, segments={len(self._cmd_buf)}")
            
            stt_text, t = transcribe_via_server(self.http, tmp)
            timings.update(t)
            
            if not stt_text:
                cmd = {"cmd": "REJECT", "reason": "empty_asr"}
                self._log("❌ STT failed: empty text")
            else:
                self._log(f"📄 STT result: '{stt_text}'")
                cmd_rule, ok = parse_command_rule(stt_text, self._runtime_state)
                cmd = cmd_rule
                
                if (not ok) and self._use_llm_fallback:
                    self._log("🔄 Rule parse failed, trying LLM fallback...")
                    cmd = llm_fallback_parse(
                        self.http,
                        stt_text,
                        self._runtime_state,
                        speaker_id=speaker_id,
                        request_id=request_id,
                        api_key="",
                    )
            
            if cmd.get("cmd") == "YOUTUBE_OPEN":
                self._runtime_state.mode = "youtube"
            
            self._log(f"🎯 FINAL: cmd={cmd.get('cmd')}, asr='{stt_text}', timings={timings}")
            
            self.sm.mark_executed()
            
            return {
                "command": cmd.get("cmd"),
                "asr": stt_text,
                "speaker_id": speaker_id,
                "dir": cmd.get("dir"),
                "sec": cmd.get("sec"),
            }
        
        except Exception as e:
            self._log(f"finalize failed: {e}")
            return None
        
        finally:
            self._reset_cmd_buf()
            self.sm.mode = Mode.IDLE


# Alias for compatibility
VoiceCommandPipeline = ImprovedVoiceCommandPipeline
