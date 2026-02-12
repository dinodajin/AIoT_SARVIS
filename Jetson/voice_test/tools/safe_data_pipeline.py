#!/usr/bin/env python3
"""
Safe Data Pipeline for KWS Training
- 원본 파일 자동 백업
- VAD 기반 크롭
- 노이즈 제거 + 데이터 증강
- 안전한 train/val 분리
"""
from __future__ import annotations

import os
import sys
import json
import shutil
import random
import argparse
from pathlib import Path
from datetime import datetime
from typing import List, Tuple, Optional, Dict

import numpy as np
import soundfile as sf

# =====================
# 안전 백업 시스템
# =====================
class SafeBackup:
    """원본 데이터 자동 백업 관리"""
    
    def __init__(self, data_root: str):
        self.data_root = Path(data_root)
        self.backup_root = self.data_root.parent / "backups"
        self.backup_root.mkdir(parents=True, exist_ok=True)
        
    def create_backup(self, name: Optional[str] = None) -> Path:
        """타임스탬프 기반 백업 생성"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = name or f"backup_{timestamp}"
        backup_path = self.backup_root / backup_name
        
        if backup_path.exists():
            print(f"⚠️  Backup already exists: {backup_path}")
            return backup_path
        
        print(f"📦 Creating backup: {backup_path}")
        shutil.copytree(self.data_root, backup_path, dirs_exist_ok=False)
        
        # 백업 메타데이터 저장
        meta = {
            "timestamp": timestamp,
            "source": str(self.data_root),
            "file_count": self._count_wavs(backup_path),
        }
        (backup_path / "backup_meta.json").write_text(
            json.dumps(meta, indent=2, ensure_ascii=False)
        )
        
        print(f"✅ Backup created: {meta['file_count']} wav files")
        return backup_path
    
    def _count_wavs(self, path: Path) -> int:
        """재귀적으로 wav 파일 개수 세기"""
        return len(list(path.rglob("*.wav")))
    
    def list_backups(self) -> List[Dict]:
        """백업 목록 조회"""
        backups = []
        for d in sorted(self.backup_root.iterdir()):
            if d.is_dir():
                meta_path = d / "backup_meta.json"
                if meta_path.exists():
                    meta = json.loads(meta_path.read_text())
                else:
                    meta = {"timestamp": "unknown", "file_count": self._count_wavs(d)}
                meta["path"] = str(d)
                backups.append(meta)
        return backups


# =====================
# VAD 크롭 (개선 버전)
# =====================
def vad_crop_audio(
    audio_i16: np.ndarray,
    sr: int,
    vad_mode: int = 3,
    frame_ms: int = 30,
    rms_gate: float = 700.0,
    pre_roll_sec: float = 0.25,
    post_roll_sec: float = 0.20,
    silence_timeout: float = 0.50,
    min_seg_sec: float = 0.35,
    max_seg_sec: float = 3.5,
) -> List[np.ndarray]:
    """
    WebRTC VAD를 사용한 음성 구간 추출
    
    Returns:
        List of int16 audio segments
    """
    import webrtcvad
    import collections
    
    vad = webrtcvad.Vad(vad_mode)
    
    frame_len = int(sr * frame_ms / 1000)
    pre_frames = max(1, int(pre_roll_sec / (frame_ms / 1000)))
    post_frames = max(1, int(post_roll_sec / (frame_ms / 1000)))
    
    ring = collections.deque(maxlen=pre_frames)
    seg_frames: List[np.ndarray] = []
    segments: List[np.ndarray] = []
    
    in_speech = False
    last_voice_frame = 0
    post_countdown = 0
    
    def flush():
        nonlocal seg_frames, in_speech, post_countdown
        if not seg_frames:
            return
        seg = np.concatenate(seg_frames)
        seg_frames = []
        in_speech = False
        post_countdown = 0
        
        dur = len(seg) / sr
        if dur < min_seg_sec:
            return
        if dur > max_seg_sec:
            seg = seg[: int(sr * max_seg_sec)]
        segments.append(seg)
    
    n_frames = len(audio_i16) // frame_len
    for i in range(n_frames):
        fr = audio_i16[i * frame_len : (i + 1) * frame_len]
        ring.append(fr)
        
        # RMS 체크
        rms = float(np.sqrt(np.mean(fr.astype(np.float32) ** 2)))
        if rms < rms_gate:
            is_speech = False
        else:
            is_speech = vad.is_speech(fr.tobytes(), sr)
        
        if is_speech:
            last_voice_frame = i
            if not in_speech:
                in_speech = True
                seg_frames.extend(list(ring))
            seg_frames.append(fr)
            post_countdown = post_frames
        else:
            if in_speech:
                seg_frames.append(fr)
                post_countdown -= 1
                silence_sec = (i - last_voice_frame) * (frame_ms / 1000.0)
                if silence_sec > silence_timeout and post_countdown <= 0:
                    flush()
    
    if in_speech:
        flush()
    
    return segments


# =====================
# 오디오 전처리
# =====================
def load_and_resample(
    path: str,
    target_sr: int = 16000,
) -> Tuple[np.ndarray, int]:
    """
    오디오 로드 및 리샘플링
    
    Returns:
        (audio_f32, sr)
    """
    x, sr = sf.read(path, dtype="float32", always_2d=False)
    if x.ndim > 1:
        x = x[:, 0]
    
    x = np.clip(x, -1.0, 1.0)
    
    if sr != target_sr:
        x = resample_audio(x, sr, target_sr)
    
    return x.astype(np.float32), target_sr


def resample_audio(x: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    """고품질 리샘플링 (scipy > librosa > linear)"""
    if sr_in == sr_out:
        return x.astype(np.float32)
    
    # 1) scipy polyphase (가장 고품질)
    try:
        import math
        from scipy.signal import resample_poly
        g = math.gcd(sr_in, sr_out)
        up = sr_out // g
        down = sr_in // g
        y = resample_poly(x.astype(np.float32), up, down).astype(np.float32)
        return np.clip(y, -1.0, 1.0)
    except ImportError:
        pass
    
    # 2) librosa
    try:
        import librosa
        y = librosa.resample(x, orig_sr=sr_in, target_sr=sr_out).astype(np.float32)
        return np.clip(y, -1.0, 1.0)
    except ImportError:
        pass
    
    # 3) linear fallback
    t_in = np.linspace(0, 1, len(x), endpoint=False)
    n_out = int(len(x) * (sr_out / sr_in))
    t_out = np.linspace(0, 1, n_out, endpoint=False)
    y = np.interp(t_out, t_in, x).astype(np.float32)
    return np.clip(y, -1.0, 1.0)


def apply_noise_reduction(
    audio: np.ndarray,
    sr: int,
    stationary: bool = True,
    prop_decrease: float = 0.7,
) -> np.ndarray:
    """노이즈 제거 (noisereduce 사용)"""
    try:
        import noisereduce as nr
        clean = nr.reduce_noise(
            y=audio,
            sr=sr,
            stationary=stationary,
            prop_decrease=prop_decrease,
        )
        return np.clip(clean.astype(np.float32), -1.0, 1.0)
    except ImportError:
        print("⚠️  noisereduce not installed, skipping noise reduction")
        return audio
    except Exception as e:
        print(f"⚠️  Noise reduction failed: {e}")
        return audio


def ensure_fixed_length(
    audio: np.ndarray,
    sr: int,
    target_sec: float,
    mode: str = "pad",  # "pad" | "crop" | "random"
) -> np.ndarray:
    """고정 길이로 맞추기"""
    target_n = int(sr * target_sec)
    n = len(audio)
    
    if n == target_n:
        return audio
    
    if n < target_n:
        # 짧으면 패딩
        return np.pad(audio, (0, target_n - n), mode="constant")
    
    # 길면 자르기
    if mode == "crop":
        return audio[:target_n]
    elif mode == "random":
        start = random.randint(0, n - target_n)
        return audio[start : start + target_n]
    else:  # "pad" 모드는 이미 처리됨
        return audio[:target_n]


# =====================
# 데이터 증강
# =====================
class AudioAugmenter:
    """데이터 증강 파이프라인"""
    
    def __init__(
        self,
        sr: int = 16000,
        p_time_shift: float = 0.5,
        p_gain: float = 0.5,
        p_noise: float = 0.8,
        p_rir: float = 0.6,
        p_eq: float = 0.3,
        snr_range: Tuple[float, float] = (-2.0, 18.0),
        noise_files: Optional[List[str]] = None,
        rir_files: Optional[List[str]] = None,
    ):
        self.sr = sr
        self.p_time_shift = p_time_shift
        self.p_gain = p_gain
        self.p_noise = p_noise
        self.p_rir = p_rir
        self.p_eq = p_eq
        self.snr_range = snr_range
        
        self.noise_files = noise_files or []
        self.rir_files = rir_files or []
        
        # 노이즈/RIR 파일 미리 로드 (선택)
        self._noise_cache: Dict[str, np.ndarray] = {}
        self._rir_cache: Dict[str, np.ndarray] = {}
    
    def augment(self, audio: np.ndarray, label: str = "UNKNOWN") -> np.ndarray:
        """증강 적용"""
        x = audio.copy()
        
        # 1) Time shift
        if random.random() < self.p_time_shift:
            x = self._time_shift(x)
        
        # 2) Gain
        if random.random() < self.p_gain:
            x = self._apply_gain(x)
        
        # 3) RIR (reverberation)
        if random.random() < self.p_rir and self.rir_files:
            x = self._apply_rir(x)
        
        # 4) Noise mixing
        if random.random() < self.p_noise and self.noise_files:
            x = self._mix_noise(x)
        
        # 5) EQ (frequency filtering)
        if random.random() < self.p_eq:
            x = self._apply_eq(x)
        
        return np.clip(x, -1.0, 1.0).astype(np.float32)
    
    def _time_shift(self, x: np.ndarray, max_shift_sec: float = 0.08) -> np.ndarray:
        """시간 이동"""
        max_shift = int(self.sr * max_shift_sec)
        shift = random.randint(-max_shift, max_shift)
        if shift == 0:
            return x
        return np.roll(x, shift).astype(np.float32)
    
    def _apply_gain(self, x: np.ndarray) -> np.ndarray:
        """볼륨 변화"""
        gain = random.uniform(0.7, 1.3)
        return np.clip(x * gain, -1.0, 1.0).astype(np.float32)
    
    def _apply_rir(self, x: np.ndarray) -> np.ndarray:
        """Room impulse response (잔향)"""
        rir_path = random.choice(self.rir_files)
        
        if rir_path not in self._rir_cache:
            rir, _ = load_and_resample(rir_path, self.sr)
            # RIR 길이 제한 (0.5초)
            max_len = int(self.sr * 0.5)
            if len(rir) > max_len:
                rir = rir[:max_len]
            # 정규화
            rir = rir / (np.sqrt(np.mean(rir ** 2)) + 1e-9)
            self._rir_cache[rir_path] = rir
        
        rir = self._rir_cache[rir_path]
        
        try:
            from scipy.signal import fftconvolve
            y = fftconvolve(x, rir, mode="full")[:len(x)]
        except ImportError:
            y = np.convolve(x, rir, mode="full")[:len(x)]
        
        # 피크 정규화
        peak = np.max(np.abs(y)) + 1e-9
        if peak > 1.0:
            y = y / peak
        
        return np.clip(y, -1.0, 1.0).astype(np.float32)
    
    def _mix_noise(self, x: np.ndarray) -> np.ndarray:
        """노이즈 혼합"""
        noise_path = random.choice(self.noise_files)
        
        if noise_path not in self._noise_cache:
            noise, _ = load_and_resample(noise_path, self.sr)
            self._noise_cache[noise_path] = noise
        
        noise = self._noise_cache[noise_path]
        
        # 노이즈가 짧으면 반복
        if len(noise) < len(x):
            n_repeat = int(np.ceil(len(x) / len(noise)))
            noise = np.tile(noise, n_repeat)
        
        # 랜덤 시작점
        start = random.randint(0, len(noise) - len(x))
        noise_seg = noise[start : start + len(x)]
        
        # SNR 기반 혼합
        snr_db = random.uniform(*self.snr_range)
        
        rms_clean = np.sqrt(np.mean(x ** 2)) + 1e-12
        rms_noise = np.sqrt(np.mean(noise_seg ** 2)) + 1e-12
        
        scale = rms_clean / (rms_noise * (10.0 ** (snr_db / 20.0)))
        mixed = x + noise_seg * scale
        
        return np.clip(mixed, -1.0, 1.0).astype(np.float32)
    
    def _apply_eq(self, x: np.ndarray) -> np.ndarray:
        """간단한 EQ (주파수 필터링)"""
        try:
            from scipy.signal import butter, lfilter
        except ImportError:
            return x
        
        mode = random.choice(["lowcut", "highcut", "band"])
        
        try:
            if mode == "lowcut":
                fc = random.uniform(60.0, 160.0)
                b, a = butter(2, fc / (self.sr / 2), btype="highpass")
            elif mode == "highcut":
                fc = random.uniform(3500.0, min(7600.0, self.sr / 2 - 100))
                b, a = butter(2, fc / (self.sr / 2), btype="lowpass")
            else:  # band
                lo = random.uniform(80.0, 300.0)
                hi = random.uniform(2200.0, min(7600.0, self.sr / 2 - 100))
                if hi <= lo + 50:
                    return x
                b, a = butter(2, [lo / (self.sr / 2), hi / (self.sr / 2)], btype="bandpass")
            
            y = lfilter(b, a, x)
            return np.clip(y.astype(np.float32), -1.0, 1.0)
        
        except Exception:
            return x


# =====================
# 메인 파이프라인
# =====================
def process_long_recording(
    input_wav: str,
    output_dir: str,
    label: str,
    target_sr: int = 16000,
    target_sec: float = 1.0,
    apply_nr: bool = True,
    vad_params: Optional[Dict] = None,
) -> int:
    """
    긴 녹음 파일을 VAD 크롭 + 전처리하여 저장
    
    Returns:
        저장된 파일 수
    """
    vad_params = vad_params or {}
    
    print(f"\n{'='*60}")
    print(f"Processing: {input_wav}")
    print(f"Label: {label}")
    print(f"Output: {output_dir}")
    print(f"{'='*60}\n")
    
    # 1) 로드 및 리샘플
    audio_f32, sr = load_and_resample(input_wav, target_sr=16000)  # VAD용 16k
    print(f"✓ Loaded: {len(audio_f32)} samples @ {sr}Hz ({len(audio_f32)/sr:.2f}s)")
    
    # 2) 노이즈 제거
    if apply_nr:
        print("✓ Applying noise reduction...")
        audio_f32 = apply_noise_reduction(audio_f32, sr)
    
    # 3) VAD 크롭
    audio_i16 = np.clip(audio_f32 * 32767.0, -32768, 32767).astype(np.int16)
    
    print("✓ Running VAD segmentation...")
    segments = vad_crop_audio(audio_i16, sr, **vad_params)
    print(f"✓ Found {len(segments)} segments")
    
    if not segments:
        print("⚠️  No segments found!")
        return 0
    
    # 4) 출력 디렉토리 준비
    out_path = Path(output_dir) / label
    out_path.mkdir(parents=True, exist_ok=True)
    
    # 5) 세그먼트 저장
    base_name = Path(input_wav).stem
    saved = 0
    
    for i, seg_i16 in enumerate(segments):
        # int16 -> float32
        seg_f32 = seg_i16.astype(np.float32) / 32768.0
        
        # target_sr로 리샘플 (필요시)
        if target_sr != sr:
            seg_f32 = resample_audio(seg_f32, sr, target_sr)
        
        # 고정 길이
        seg_fixed = ensure_fixed_length(seg_f32, target_sr, target_sec, mode="pad")
        
        # 저장
        out_file = out_path / f"{label}_{base_name}_{i:05d}.wav"
        sf.write(str(out_file), seg_fixed, target_sr, subtype="PCM_16")
        saved += 1
    
    print(f"✅ Saved {saved} files to {out_path}")
    return saved


def split_train_val(
    data_root: str,
    val_ratio: float = 0.12,
    seed: int = 0,
    labels: Optional[List[str]] = None,
) -> Dict[str, Dict[str, int]]:
    """
    train 폴더의 파일을 train/val로 안전하게 분리
    
    Returns:
        {label: {"train": count, "val": count}}
    """
    random.seed(seed)
    
    root = Path(data_root)
    train_dir = root / "train"
    val_dir = root / "val"
    
    if not train_dir.exists():
        raise RuntimeError(f"Train directory not found: {train_dir}")
    
    # 레이블 자동 감지
    if labels is None:
        labels = sorted([d.name for d in train_dir.iterdir() if d.is_dir()])
    
    if not labels:
        raise RuntimeError(f"No labels found in {train_dir}")
    
    print(f"\n{'='*60}")
    print(f"Splitting train/val: {labels}")
    print(f"Val ratio: {val_ratio:.1%}, Seed: {seed}")
    print(f"{'='*60}\n")
    
    results = {}
    
    for label in labels:
        src_dir = train_dir / label
        dst_dir = val_dir / label
        
        if not src_dir.exists():
            print(f"⚠️  Skipping {label}: directory not found")
            continue
        
        # 파일 목록
        files = sorted(src_dir.glob("*.wav"))
        if not files:
            print(f"⚠️  Skipping {label}: no wav files")
            continue
        
        # 셔플 및 분할
        random.shuffle(files)
        n_val = max(1, int(len(files) * val_ratio))
        n_val = min(n_val, len(files) - 1)  # 최소 1개는 train에 남김
        
        val_files = files[:n_val]
        
        # val 디렉토리 생성
        dst_dir.mkdir(parents=True, exist_ok=True)
        
        # 파일 이동
        for f in val_files:
            dst = dst_dir / f.name
            if dst.exists():
                # 중복 처리
                counter = 1
                while dst.exists():
                    dst = dst_dir / f"{f.stem}_dup{counter}{f.suffix}"
                    counter += 1
            shutil.move(str(f), str(dst))
        
        n_train = len(files) - len(val_files)
        results[label] = {"train": n_train, "val": len(val_files)}
        
        print(f"✓ {label}: train={n_train}, val={len(val_files)} ({len(val_files)/len(files):.1%})")
    
    print(f"\n{'='*60}")
    print("Split complete!")
    print(f"{'='*60}\n")
    
    return results


# =====================
# CLI
# =====================
def main():
    parser = argparse.ArgumentParser(description="Safe KWS Data Pipeline")
    
    subparsers = parser.add_subparsers(dest="command", help="Command")
    
    # --- backup ---
    backup_parser = subparsers.add_parser("backup", help="Create backup")
    backup_parser.add_argument("--data_root", required=True)
    backup_parser.add_argument("--name", default=None)
    
    # --- list-backups ---
    list_parser = subparsers.add_parser("list-backups", help="List backups")
    list_parser.add_argument("--data_root", required=True)
    
    # --- crop ---
    crop_parser = subparsers.add_parser("crop", help="Crop long recording")
    crop_parser.add_argument("--input", required=True, help="Input wav file")
    crop_parser.add_argument("--output_dir", required=True, help="Output directory")
    crop_parser.add_argument("--label", required=True, help="Label name")
    crop_parser.add_argument("--sr", type=int, default=16000)
    crop_parser.add_argument("--target_sec", type=float, default=1.0)
    crop_parser.add_argument("--no-nr", action="store_true", help="Skip noise reduction")
    crop_parser.add_argument("--vad_mode", type=int, default=3, choices=[0, 1, 2, 3])
    crop_parser.add_argument("--rms_gate", type=float, default=700.0)
    
    # --- split ---
    split_parser = subparsers.add_parser("split", help="Split train/val")
    split_parser.add_argument("--data_root", required=True)
    split_parser.add_argument("--val_ratio", type=float, default=0.12)
    split_parser.add_argument("--seed", type=int, default=0)
    split_parser.add_argument("--labels", nargs="*", default=None)
    
    args = parser.parse_args()
    
    if args.command == "backup":
        backup = SafeBackup(args.data_root)
        backup.create_backup(args.name)
    
    elif args.command == "list-backups":
        backup = SafeBackup(args.data_root)
        backups = backup.list_backups()
        print("\n📦 Available backups:")
        for b in backups:
            print(f"  - {b['timestamp']}: {b['file_count']} files at {b['path']}")
    
    elif args.command == "crop":
        vad_params = {
            "vad_mode": args.vad_mode,
            "rms_gate": args.rms_gate,
        }
        process_long_recording(
            args.input,
            args.output_dir,
            args.label,
            target_sr=args.sr,
            target_sec=args.target_sec,
            apply_nr=(not args.no_nr),
            vad_params=vad_params,
        )
    
    elif args.command == "split":
        split_train_val(
            args.data_root,
            val_ratio=args.val_ratio,
            seed=args.seed,
            labels=args.labels,
        )
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()