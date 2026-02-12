#!/usr/bin/env python3
"""
Voice Pipeline Debug & Tuning Tool

문제 진단:
1. KWS 검출 실패 (WAKE word 놓침)
2. SV 타이밍/품질 (현재 우회 중)
3. 명령어 수집 타이밍 (ACTIVE 후 명령어 놓침)
"""
from __future__ import annotations

import os
import sys
import json
import time
import argparse
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict

import numpy as np
import soundfile as sf


# =====================
# Debug Config
# =====================
@dataclass
class DebugConfig:
    """디버깅 설정"""
    # Audio
    sr: int = 16000
    
    # KWS
    kws_onnx: str = "models/kws/kws.onnx"
    kws_labels: List[str] = None
    kws_conf_threshold: float = 0.70
    
    # SV
    sv_onnx: str = "models/speaker/ecapa.onnx"
    sv_profile: str = "profiles/current_user.json"
    sv_threshold: float = 0.35
    
    # Command timing
    cmd_start_rms: float = 120.0
    cmd_ignore_rms: float = 70.0
    cmd_min_speech_ratio: float = 0.25
    cmd_start_min_sec: float = 0.20
    cmd_silence_timeout: float = 0.7
    wake_wait_sec: float = 8.0
    
    # VAD
    vad_mode: int = 2
    frame_ms: int = 20
    
    def __post_init__(self):
        if self.kws_labels is None:
            self.kws_labels = ["WAKE", "UNKNOWN", "SILENCE"]


# =====================
# KWS Debugger
# =====================
class KWSDebugger:
    """KWS 검출 디버깅"""
    
    def __init__(self, cfg: DebugConfig):
        self.cfg = cfg
        
        # KWS 로드
        try:
            from pipeline.kws_wake import WakeKWS, WakeKWSConfig
            self.kws = WakeKWS(WakeKWSConfig(
                onnx_path=cfg.kws_onnx,
                labels=cfg.kws_labels,
                clip_sec=1.0,
                n_mels=40,
            ))
            print("✅ KWS model loaded")
        except Exception as e:
            print(f"❌ Failed to load KWS: {e}")
            self.kws = None
    
    def test_file(self, audio_path: Path) -> Dict[str, Any]:
        """단일 파일 테스트"""
        if self.kws is None:
            return {"error": "kws_not_loaded"}
        
        # 로드
        audio, sr = sf.read(str(audio_path), dtype="float32", always_2d=False)
        if audio.ndim > 1:
            audio = audio[:, 0]
        
        # 예측
        label, conf = self.kws.predict(audio, sr, allowed={"WAKE", "UNKNOWN", "SILENCE"})
        
        # 통계
        rms = float(np.sqrt(np.mean(audio ** 2)) * 32768)
        duration = len(audio) / sr
        
        result = {
            "file": str(audio_path.name),
            "duration": duration,
            "label": label,
            "confidence": conf,
            "is_wake": (label == "WAKE"),
            "passed": (label == "WAKE" and conf >= self.cfg.kws_conf_threshold),
            "rms": rms,
        }
        
        return result
    
    def test_directory(self, input_dir: Path) -> List[Dict[str, Any]]:
        """디렉토리 내 모든 wav 테스트"""
        wav_files = sorted(input_dir.glob("*.wav"))
        
        if not wav_files:
            print(f"⚠️  No wav files in {input_dir}")
            return []
        
        print(f"\n{'='*60}")
        print(f"🔍 Testing {len(wav_files)} files with KWS")
        print(f"{'='*60}\n")
        
        results = []
        
        for i, wav in enumerate(wav_files, 1):
            result = self.test_file(wav)
            results.append(result)
            
            # 출력
            status = "✅" if result["passed"] else "❌"
            print(f"[{i:04d}/{len(wav_files)}] {status} {result['file']}")
            print(f"  Label: {result['label']} (conf={result['confidence']:.3f})")
            print(f"  RMS: {result['rms']:.1f}, Duration: {result['duration']:.2f}s")
        
        # 요약
        self._print_summary(results)
        
        return results
    
    def _print_summary(self, results: List[Dict[str, Any]]):
        """결과 요약"""
        total = len(results)
        passed = sum(1 for r in results if r["passed"])
        failed = total - passed
        
        print(f"\n{'='*60}")
        print(f"📊 KWS Test Summary")
        print(f"{'='*60}")
        print(f"Total:  {total}")
        print(f"Passed: {passed} ({passed/max(1,total)*100:.1f}%)")
        print(f"Failed: {failed} ({failed/max(1,total)*100:.1f}%)")
        
        # 실패 원인 분석
        if failed > 0:
            print(f"\n❌ Failed files analysis:")
            
            low_conf = [r for r in results if not r["passed"] and r["is_wake"]]
            wrong_label = [r for r in results if not r["passed"] and not r["is_wake"]]
            
            if low_conf:
                print(f"  - Low confidence (WAKE but conf < {self.cfg.kws_conf_threshold}): {len(low_conf)}")
                avg_conf = np.mean([r["confidence"] for r in low_conf])
                print(f"    Average conf: {avg_conf:.3f}")
            
            if wrong_label:
                print(f"  - Wrong label (not WAKE): {len(wrong_label)}")
                labels = {}
                for r in wrong_label:
                    labels[r["label"]] = labels.get(r["label"], 0) + 1
                for lbl, cnt in labels.items():
                    print(f"    {lbl}: {cnt}")
        
        print(f"{'='*60}\n")


# =====================
# SV Debugger
# =====================
class SVDebugger:
    """Speaker Verification 디버깅"""
    
    def __init__(self, cfg: DebugConfig):
        self.cfg = cfg
        
        try:
            from pipeline.speaker_verify import SpeakerVerifier, SpeakerConfig
            self.sv = SpeakerVerifier(
                SpeakerConfig(
                    threshold=cfg.sv_threshold,
                    min_seg_sec=0.8,
                ),
                profile_path=cfg.sv_profile,
                ecapa_onnx_path=cfg.sv_onnx,
            )
            print("✅ SV model loaded")
        except Exception as e:
            print(f"❌ Failed to load SV: {e}")
            self.sv = None
    
    def test_file(self, audio_path: Path) -> Dict[str, Any]:
        """단일 파일 테스트"""
        if self.sv is None:
            return {"error": "sv_not_loaded"}
        
        # 로드
        audio, sr = sf.read(str(audio_path), dtype="float32", always_2d=False)
        if audio.ndim > 1:
            audio = audio[:, 0]
        
        # 검증
        sid, sim = self.sv.verify(audio, sr)
        
        result = {
            "file": str(audio_path.name),
            "speaker_id": sid,
            "similarity": sim,
            "passed": (sid is not None),
            "duration": len(audio) / sr,
        }
        
        return result
    
    def test_directory(self, input_dir: Path) -> List[Dict[str, Any]]:
        """디렉토리 내 모든 wav 테스트"""
        wav_files = sorted(input_dir.glob("*.wav"))
        
        if not wav_files:
            print(f"⚠️  No wav files in {input_dir}")
            return []
        
        print(f"\n{'='*60}")
        print(f"🔍 Testing {len(wav_files)} files with SV")
        print(f"{'='*60}\n")
        
        results = []
        
        for i, wav in enumerate(wav_files, 1):
            result = self.test_file(wav)
            results.append(result)
            
            # 출력
            status = "✅" if result["passed"] else "❌"
            print(f"[{i:04d}/{len(wav_files)}] {status} {result['file']}")
            print(f"  Speaker: {result['speaker_id']}, Sim: {result['similarity']:.3f}")
        
        # 요약
        self._print_summary(results)
        
        return results
    
    def _print_summary(self, results: List[Dict[str, Any]]):
        """결과 요약"""
        total = len(results)
        passed = sum(1 for r in results if r["passed"])
        failed = total - passed
        
        print(f"\n{'='*60}")
        print(f"📊 SV Test Summary")
        print(f"{'='*60}")
        print(f"Total:  {total}")
        print(f"Passed: {passed} ({passed/max(1,total)*100:.1f}%)")
        print(f"Failed: {failed} ({failed/max(1,total)*100:.1f}%)")
        
        if failed > 0:
            sims = [r["similarity"] for r in results if not r["passed"]]
            avg_sim = np.mean(sims) if sims else 0.0
            print(f"\n❌ Failed average similarity: {avg_sim:.3f}")
            print(f"   Threshold: {self.cfg.sv_threshold}")
            if avg_sim > 0 and avg_sim < self.cfg.sv_threshold:
                suggestion = avg_sim * 0.9
                print(f"   💡 Suggested threshold: {suggestion:.3f}")
        
        print(f"{'='*60}\n")


# =====================
# Timing Analyzer
# =====================
class TimingAnalyzer:
    """명령어 수집 타이밍 분석"""
    
    def __init__(self, cfg: DebugConfig):
        self.cfg = cfg
        
        import webrtcvad
        self.vad = webrtcvad.Vad(cfg.vad_mode)
    
    def analyze_file(self, audio_path: Path) -> Dict[str, Any]:
        """
        파일 분석:
        - WAKE 구간 (0~1s)
        - 명령어 구간 (1s~)
        """
        audio, sr = sf.read(str(audio_path), dtype="float32", always_2d=False)
        if audio.ndim > 1:
            audio = audio[:, 0]
        
        duration = len(audio) / sr
        
        # WAKE 구간 (첫 1초)
        wake_len = min(int(sr * 1.0), len(audio))
        wake_seg = audio[:wake_len]
        
        # 명령어 구간 (1초 이후)
        cmd_seg = audio[wake_len:] if len(audio) > wake_len else np.array([])
        
        # 통계
        wake_rms = float(np.sqrt(np.mean(wake_seg ** 2)) * 32768) if len(wake_seg) > 0 else 0.0
        cmd_rms = float(np.sqrt(np.mean(cmd_seg ** 2)) * 32768) if len(cmd_seg) > 0 else 0.0
        
        # VAD
        wake_speech_ratio = self._compute_speech_ratio(wake_seg, sr)
        cmd_speech_ratio = self._compute_speech_ratio(cmd_seg, sr) if len(cmd_seg) > 0 else 0.0
        
        # 명령어 시작 타이밍 시뮬레이션
        cmd_start_delay = self._simulate_cmd_start(cmd_seg, sr)
        
        result = {
            "file": str(audio_path.name),
            "duration": duration,
            "wake_rms": wake_rms,
            "wake_speech_ratio": wake_speech_ratio,
            "cmd_rms": cmd_rms,
            "cmd_speech_ratio": cmd_speech_ratio,
            "cmd_start_delay": cmd_start_delay,
            "cmd_start_ok": (cmd_rms >= self.cfg.cmd_start_rms and cmd_speech_ratio >= self.cfg.cmd_min_speech_ratio),
        }
        
        return result
    
    def _compute_speech_ratio(self, audio: np.ndarray, sr: int) -> float:
        """VAD speech ratio 계산"""
        if len(audio) == 0:
            return 0.0
        
        audio_i16 = np.clip(audio * 32768, -32768, 32767).astype(np.int16)
        
        frame_len = int(sr * self.cfg.frame_ms / 1000)
        n_frames = len(audio_i16) // frame_len
        
        if n_frames == 0:
            return 0.0
        
        speech_count = 0
        for i in range(n_frames):
            frame = audio_i16[i * frame_len : (i + 1) * frame_len]
            try:
                if self.vad.is_speech(frame.tobytes(), sr):
                    speech_count += 1
            except Exception:
                pass
        
        return speech_count / n_frames
    
    def _simulate_cmd_start(self, cmd_audio: np.ndarray, sr: int) -> float:
        """
        명령어 시작 감지 타이밍 시뮬레이션
        Returns: delay in seconds (WAKE 후 명령어 감지까지)
        """
        if len(cmd_audio) == 0:
            return -1.0
        
        # 세그먼트 단위로 나눔 (VAD 세그먼트와 유사)
        seg_len = int(sr * 0.5)  # 0.5초 세그먼트
        
        for i in range(0, len(cmd_audio), seg_len):
            seg = cmd_audio[i : i + seg_len]
            if len(seg) < seg_len // 2:
                break
            
            seg_rms = float(np.sqrt(np.mean(seg ** 2)) * 32768)
            seg_speech = self._compute_speech_ratio(seg, sr)
            
            if seg_rms >= self.cfg.cmd_start_rms and seg_speech >= self.cfg.cmd_min_speech_ratio:
                return i / sr
        
        return -1.0  # 감지 실패
    
    def analyze_directory(self, input_dir: Path) -> List[Dict[str, Any]]:
        """디렉토리 분석"""
        wav_files = sorted(input_dir.glob("*.wav"))
        
        if not wav_files:
            print(f"⚠️  No wav files in {input_dir}")
            return []
        
        print(f"\n{'='*60}")
        print(f"⏱️  Analyzing {len(wav_files)} files for timing")
        print(f"{'='*60}\n")
        
        results = []
        
        for i, wav in enumerate(wav_files, 1):
            result = self.analyze_file(wav)
            results.append(result)
            
            # 출력
            status = "✅" if result["cmd_start_ok"] else "❌"
            print(f"[{i:04d}/{len(wav_files)}] {status} {result['file']}")
            print(f"  WAKE: RMS={result['wake_rms']:.1f}, Speech={result['wake_speech_ratio']:.2f}")
            print(f"  CMD:  RMS={result['cmd_rms']:.1f}, Speech={result['cmd_speech_ratio']:.2f}")
            
            if result['cmd_start_delay'] >= 0:
                print(f"  ⏱️  Command start delay: {result['cmd_start_delay']:.2f}s")
            else:
                print(f"  ⚠️  Command start not detected!")
        
        # 요약
        self._print_summary(results)
        
        return results
    
    def _print_summary(self, results: List[Dict[str, Any]]):
        """결과 요약"""
        total = len(results)
        cmd_ok = sum(1 for r in results if r["cmd_start_ok"])
        cmd_fail = total - cmd_ok
        
        delays = [r["cmd_start_delay"] for r in results if r["cmd_start_delay"] >= 0]
        avg_delay = np.mean(delays) if delays else 0.0
        
        print(f"\n{'='*60}")
        print(f"📊 Timing Analysis Summary")
        print(f"{'='*60}")
        print(f"Total:           {total}")
        print(f"CMD start OK:    {cmd_ok} ({cmd_ok/max(1,total)*100:.1f}%)")
        print(f"CMD start fail:  {cmd_fail} ({cmd_fail/max(1,total)*100:.1f}%)")
        print(f"Avg delay:       {avg_delay:.2f}s")
        
        if cmd_fail > 0:
            print(f"\n❌ Failed to detect command start:")
            low_rms = sum(1 for r in results if not r["cmd_start_ok"] and r["cmd_rms"] < self.cfg.cmd_start_rms)
            low_speech = sum(1 for r in results if not r["cmd_start_ok"] and r["cmd_speech_ratio"] < self.cfg.cmd_min_speech_ratio)
            
            print(f"  - Low RMS (< {self.cfg.cmd_start_rms}): {low_rms}")
            print(f"  - Low speech ratio (< {self.cfg.cmd_min_speech_ratio}): {low_speech}")
            
            # 권장 설정
            failed_rms = [r["cmd_rms"] for r in results if not r["cmd_start_ok"]]
            if failed_rms:
                max_failed_rms = max(failed_rms)
                suggestion = max_failed_rms * 0.8
                print(f"\n💡 Suggested CMD_START_RMS: {suggestion:.1f} (current: {self.cfg.cmd_start_rms})")
        
        print(f"{'='*60}\n")


# =====================
# Config Tuner
# =====================
class ConfigTuner:
    """설정 자동 튜닝"""
    
    @staticmethod
    def suggest_kws_threshold(results: List[Dict[str, Any]]) -> float:
        """KWS threshold 권장값"""
        wake_confs = [r["confidence"] for r in results if r["is_wake"]]
        if not wake_confs:
            return 0.7
        
        # 5th percentile
        suggested = np.percentile(wake_confs, 5)
        return max(0.3, min(0.9, suggested))
    
    @staticmethod
    def suggest_sv_threshold(results: List[Dict[str, Any]]) -> float:
        """SV threshold 권장값"""
        sims = [r["similarity"] for r in results]
        if not sims:
            return 0.35
        
        # 10th percentile * 0.9
        suggested = np.percentile(sims, 10) * 0.9
        return max(0.1, min(0.8, suggested))
    
    @staticmethod
    def suggest_cmd_rms(results: List[Dict[str, Any]]) -> float:
        """CMD_START_RMS 권장값"""
        cmd_rms_values = [r["cmd_rms"] for r in results if r["cmd_rms"] > 0]
        if not cmd_rms_values:
            return 120.0
        
        # 20th percentile * 0.8
        suggested = np.percentile(cmd_rms_values, 20) * 0.8
        return max(50.0, min(300.0, suggested))
    
    @staticmethod
    def generate_config(
        kws_results: Optional[List[Dict]] = None,
        sv_results: Optional[List[Dict]] = None,
        timing_results: Optional[List[Dict]] = None,
    ) -> Dict[str, Any]:
        """권장 설정 생성"""
        config = {}
        
        if kws_results:
            config["WAKE_CONF"] = ConfigTuner.suggest_kws_threshold(kws_results)
        
        if sv_results:
            config["SPK_THRESHOLD"] = ConfigTuner.suggest_sv_threshold(sv_results)
        
        if timing_results:
            config["CMD_START_RMS"] = ConfigTuner.suggest_cmd_rms(timing_results)
        
        return config


# =====================
# CLI
# =====================
def main():
    parser = argparse.ArgumentParser(description="Voice Pipeline Debug Tool")
    
    subparsers = parser.add_subparsers(dest="command", help="Command")
    
    # --- test-kws ---
    kws_parser = subparsers.add_parser("test-kws", help="Test KWS detection")
    kws_parser.add_argument("--input", required=True, help="Input directory or file")
    kws_parser.add_argument("--onnx", default="models/kws/kws.onnx")
    kws_parser.add_argument("--threshold", type=float, default=0.70)
    kws_parser.add_argument("--report", default=None)
    
    # --- test-sv ---
    sv_parser = subparsers.add_parser("test-sv", help="Test speaker verification")
    sv_parser.add_argument("--input", required=True)
    sv_parser.add_argument("--onnx", default="models/speaker/ecapa.onnx")
    sv_parser.add_argument("--profile", default="profiles/current_user.json")
    sv_parser.add_argument("--threshold", type=float, default=0.35)
    sv_parser.add_argument("--report", default=None)
    
    # --- test-timing ---
    timing_parser = subparsers.add_parser("test-timing", help="Test command timing")
    timing_parser.add_argument("--input", required=True)
    timing_parser.add_argument("--cmd-start-rms", type=float, default=120.0)
    timing_parser.add_argument("--cmd-min-speech", type=float, default=0.25)
    timing_parser.add_argument("--report", default=None)
    
    # --- tune ---
    tune_parser = subparsers.add_parser("tune", help="Auto-tune config")
    tune_parser.add_argument("--wake-dir", required=True, help="WAKE word directory")
    tune_parser.add_argument("--output", default="config_tuned.py")
    
    args = parser.parse_args()
    
    if args.command is None:
        parser.print_help()
        return
    
    # Execute
    if args.command == "test-kws":
        cfg = DebugConfig(
            kws_onnx=args.onnx,
            kws_conf_threshold=args.threshold,
        )
        
        debugger = KWSDebugger(cfg)
        
        input_path = Path(args.input)
        if input_path.is_dir():
            results = debugger.test_directory(input_path)
        else:
            results = [debugger.test_file(input_path)]
        
        if args.report:
            Path(args.report).write_text(json.dumps(results, indent=2, ensure_ascii=False))
            print(f"📄 Report saved: {args.report}")
    
    elif args.command == "test-sv":
        cfg = DebugConfig(
            sv_onnx=args.onnx,
            sv_profile=args.profile,
            sv_threshold=args.threshold,
        )
        
        debugger = SVDebugger(cfg)
        
        input_path = Path(args.input)
        if input_path.is_dir():
            results = debugger.test_directory(input_path)
        else:
            results = [debugger.test_file(input_path)]
        
        if args.report:
            Path(args.report).write_text(json.dumps(results, indent=2, ensure_ascii=False))
            print(f"📄 Report saved: {args.report}")
    
    elif args.command == "test-timing":
        cfg = DebugConfig(
            cmd_start_rms=args.cmd_start_rms,
            cmd_min_speech_ratio=args.cmd_min_speech,
        )
        
        analyzer = TimingAnalyzer(cfg)
        
        input_path = Path(args.input)
        if input_path.is_dir():
            results = analyzer.analyze_directory(input_path)
        else:
            results = [analyzer.analyze_file(input_path)]
        
        if args.report:
            Path(args.report).write_text(json.dumps(results, indent=2, ensure_ascii=False))
            print(f"📄 Report saved: {args.report}")
    
    elif args.command == "tune":
        print(f"\n{'='*60}")
        print("🎯 Auto-tuning configuration")
        print(f"{'='*60}\n")
        
        wake_dir = Path(args.wake_dir)
        
        # KWS test
        print("1️⃣ Testing KWS...")
        cfg_kws = DebugConfig()
        kws_debugger = KWSDebugger(cfg_kws)
        kws_results = kws_debugger.test_directory(wake_dir)
        
        # SV test
        print("\n2️⃣ Testing SV...")
        cfg_sv = DebugConfig()
        sv_debugger = SVDebugger(cfg_sv)
        sv_results = sv_debugger.test_directory(wake_dir)
        
        # Timing test
        print("\n3️⃣ Analyzing timing...")
        cfg_timing = DebugConfig()
        timing_analyzer = TimingAnalyzer(cfg_timing)
        timing_results = timing_analyzer.analyze_directory(wake_dir)
        
        # Generate config
        print("\n4️⃣ Generating tuned config...")
        tuned = ConfigTuner.generate_config(kws_results, sv_results, timing_results)
        
        # Save
        output = Path(args.output)
        output.write_text(
            f"# Auto-tuned configuration\n"
            f"# Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n" +
            "\n".join(f"{k} = {v}" for k, v in tuned.items())
        )
        
        print(f"\n{'='*60}")
        print(f"✅ Tuned config saved: {output}")
        print(f"{'='*60}")
        print("\nRecommended settings:")
        for k, v in tuned.items():
            print(f"  {k} = {v}")
        print("")


if __name__ == "__main__":
    main()