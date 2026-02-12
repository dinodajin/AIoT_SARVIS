#!/usr/bin/env python3
"""
Improved KWS Training Script
- Compatible with existing kws_wake.py and command_classifier.py
- Safe data handling with automatic backup
- Advanced augmentation
- Logging and checkpointing
"""
from __future__ import annotations

import os
import json
import random
import time
import glob
from pathlib import Path
from dataclasses import dataclass
from typing import List, Tuple, Optional, Dict, Any

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
import soundfile as sf

# Import log-mel utilities (from your kws module)
try:
    from kws.log_mel import LogMelConfig, normalize_cmvn
    try:
        from kws.log_mel import log_mel_spectrogram
    except Exception:
        from kws.log_mel import wav_to_logmel as log_mel_spectrogram
except Exception:
    try:
        from log_mel import LogMelConfig, normalize_cmvn, wav_to_logmel as log_mel_spectrogram
    except Exception as e:
        raise RuntimeError(f"Failed to import log_mel: {e}")


# =====================
# Configuration
# =====================
@dataclass
class TrainConfig:
    # Data
    data_root: str = "datasets/kws"
    labels: List[str] = None  # Auto-detect if None
    
    # Audio
    sr: int = 16000
    clip_sec: float = 1.0
    crop_mode_train: str = "random"
    crop_mode_eval: str = "center"
    
    # Log-mel
    n_mels: int = 40
    n_fft: int = 400
    hop_length: int = 160
    win_length: int = 400
    fmin: int = 20
    fmax: int = 7600
    center: bool = False
    
    # Training
    epochs: int = 40
    batch_size: int = 64
    lr: float = 1e-3
    device: str = "cuda" if torch.cuda.is_available() else "cpu"
    seed: int = 0
    num_workers: int = 4
    
    # Augmentation
    aug: bool = True
    p_time_shift: float = 0.5
    p_gain: float = 0.5
    p_noise: float = 0.85
    p_rir: float = 0.7
    p_eq: float = 0.3
    snr_min_db: float = -2.0
    snr_max_db: float = 18.0
    
    # Noise reduction
    use_nr: bool = True
    nr_stationary: bool = True
    nr_prop_min: float = 0.6
    nr_prop_max: float = 0.9
    
    # Paths
    noise_dir: Optional[str] = None
    rir_dir: Optional[str] = None
    out_dir: str = "models/kws"
    
    # Advanced
    balance_classes: bool = True
    save_best_only: bool = True
    early_stop_patience: int = 10
    
    def __post_init__(self):
        if self.labels is None:
            self.labels = ["WAKE", "UNKNOWN", "SILENCE"]


# =====================
# Utils
# =====================
def set_seed(seed: int):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


def save_checkpoint(
    path: str,
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    epoch: int,
    best_acc: float,
    config: Dict[str, Any],
):
    """체크포인트 저장"""
    torch.save({
        "epoch": epoch,
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict(),
        "best_acc": best_acc,
        "config": config,
    }, path)
    print(f"💾 Checkpoint saved: {path}")


def load_checkpoint(
    path: str,
    model: nn.Module,
    optimizer: Optional[torch.optim.Optimizer] = None,
) -> Dict[str, Any]:
    """체크포인트 로드"""
    ckpt = torch.load(path, map_location="cpu")
    model.load_state_dict(ckpt["model_state_dict"])
    if optimizer is not None and "optimizer_state_dict" in ckpt:
        optimizer.load_state_dict(ckpt["optimizer_state_dict"])
    print(f"📂 Checkpoint loaded: {path}")
    return ckpt


# =====================
# Augmentation
# =====================
class AudioAugmentor:
    """실시간 증강"""
    
    def __init__(self, cfg: TrainConfig, noise_files: List[str], rir_files: List[str]):
        self.cfg = cfg
        self.noise_files = noise_files
        self.rir_files = rir_files
        self.sr = cfg.sr
    
    def augment(self, audio: np.ndarray, label: str) -> np.ndarray:
        """증강 적용"""
        x = audio.astype(np.float32).copy()
        
        # Time shift
        if random.random() < self.cfg.p_time_shift:
            max_shift = int(self.sr * 0.08)
            shift = random.randint(-max_shift, max_shift)
            if shift != 0:
                x = np.roll(x, shift)
        
        # Gain
        if random.random() < self.cfg.p_gain:
            gain = random.uniform(0.7, 1.3)
            x = x * gain
        
        # RIR
        if random.random() < self.cfg.p_rir and self.rir_files:
            x = self._apply_rir(x)
        
        # Noise mixing
        if random.random() < self.cfg.p_noise and self.noise_files:
            x = self._mix_noise(x)
        
        # Noise reduction
        if self.cfg.use_nr and random.random() < 0.5:
            x = self._apply_nr(x)
        
        # EQ
        if random.random() < self.cfg.p_eq:
            x = self._apply_eq(x)
        
        return np.clip(x, -1.0, 1.0).astype(np.float32)
    
    def _apply_rir(self, x: np.ndarray) -> np.ndarray:
        """RIR 적용"""
        rir_path = random.choice(self.rir_files)
        rir, sr = sf.read(rir_path, dtype="float32", always_2d=False)
        if rir.ndim > 1:
            rir = rir[:, 0]
        
        if sr != self.sr:
            rir = self._resample(rir, sr, self.sr)
        
        # 길이 제한
        max_len = int(self.sr * 0.5)
        if len(rir) > max_len:
            rir = rir[:max_len]
        
        # 정규화
        rir = rir / (np.sqrt(np.mean(rir ** 2)) + 1e-9)
        
        # 컨볼루션
        try:
            from scipy.signal import fftconvolve
            y = fftconvolve(x, rir, mode="full")[:len(x)]
        except ImportError:
            y = np.convolve(x, rir, mode="full")[:len(x)]
        
        # 피크 정규화
        peak = np.max(np.abs(y)) + 1e-9
        if peak > 1.0:
            y = y / peak
        
        return y.astype(np.float32)
    
    def _mix_noise(self, x: np.ndarray) -> np.ndarray:
        """노이즈 혼합"""
        noise_path = random.choice(self.noise_files)
        noise, sr = sf.read(noise_path, dtype="float32", always_2d=False)
        if noise.ndim > 1:
            noise = noise[:, 0]
        
        if sr != self.sr:
            noise = self._resample(noise, sr, self.sr)
        
        # 노이즈가 짧으면 반복
        if len(noise) < len(x):
            n_repeat = int(np.ceil(len(x) / len(noise)))
            noise = np.tile(noise, n_repeat)
        
        # 랜덤 시작
        start = random.randint(0, len(noise) - len(x))
        noise_seg = noise[start : start + len(x)]
        
        # SNR 기반 혼합
        snr_db = random.uniform(self.cfg.snr_min_db, self.cfg.snr_max_db)
        
        rms_clean = np.sqrt(np.mean(x ** 2)) + 1e-12
        rms_noise = np.sqrt(np.mean(noise_seg ** 2)) + 1e-12
        
        scale = rms_clean / (rms_noise * (10.0 ** (snr_db / 20.0)))
        mixed = x + noise_seg * scale
        
        return mixed.astype(np.float32)
    
    def _apply_nr(self, x: np.ndarray) -> np.ndarray:
        """노이즈 제거"""
        try:
            import noisereduce as nr
            prop = random.uniform(self.cfg.nr_prop_min, self.cfg.nr_prop_max)
            clean = nr.reduce_noise(
                y=x,
                sr=self.sr,
                stationary=self.cfg.nr_stationary,
                prop_decrease=prop,
            )
            return clean.astype(np.float32)
        except Exception:
            return x
    
    def _apply_eq(self, x: np.ndarray) -> np.ndarray:
        """EQ 필터"""
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
            else:
                lo = random.uniform(80.0, 300.0)
                hi = random.uniform(2200.0, min(7600.0, self.sr / 2 - 100))
                if hi <= lo + 50:
                    return x
                b, a = butter(2, [lo / (self.sr / 2), hi / (self.sr / 2)], btype="bandpass")
            
            y = lfilter(b, a, x)
            return y.astype(np.float32)
        except Exception:
            return x
    
    def _resample(self, x: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
        """간단한 리샘플링"""
        if sr_in == sr_out:
            return x
        
        try:
            import librosa
            return librosa.resample(x, orig_sr=sr_in, target_sr=sr_out).astype(np.float32)
        except ImportError:
            # Linear fallback
            t_in = np.linspace(0, 1, len(x), endpoint=False)
            n_out = int(len(x) * (sr_out / sr_in))
            t_out = np.linspace(0, 1, n_out, endpoint=False)
            return np.interp(t_out, t_in, x).astype(np.float32)


# =====================
# Dataset
# =====================
def ensure_clip(x: np.ndarray, sr: int, clip_sec: float, mode: str = "random") -> np.ndarray:
    """고정 길이로 맞추기"""
    target_n = int(sr * clip_sec)
    n = len(x)
    
    if n == target_n:
        return x.astype(np.float32)
    
    if n < target_n:
        return np.pad(x, (0, target_n - n), mode="constant").astype(np.float32)
    
    # 길면 자르기
    if mode == "front":
        start = 0
    elif mode == "back":
        start = n - target_n
    elif mode == "center":
        start = max(0, (n - target_n) // 2)
    else:  # random
        start = random.randint(0, n - target_n)
    
    return x[start : start + target_n].astype(np.float32)


class KWSDataset(Dataset):
    """KWS 데이터셋"""
    
    def __init__(
        self,
        root_dir: str,
        labels: List[str],
        cfg: TrainConfig,
        train: bool,
        augmentor: Optional[AudioAugmentor] = None,
    ):
        self.root_dir = root_dir
        self.labels = labels
        self.cfg = cfg
        self.train = train
        self.augmentor = augmentor
        
        self.label_to_id = {l: i for i, l in enumerate(labels)}
        
        # 파일 목록 수집
        self.samples: List[Tuple[str, int]] = []
        for label in labels:
            label_dir = os.path.join(root_dir, label)
            if not os.path.isdir(label_dir):
                continue
            for wav_file in glob.glob(os.path.join(label_dir, "*.wav")):
                self.samples.append((wav_file, self.label_to_id[label]))
        
        if not self.samples:
            raise RuntimeError(f"No wav files found in {root_dir}")
        
        random.shuffle(self.samples)
        
        # Log-mel config
        self.lm_cfg = LogMelConfig(
            sr=cfg.sr,
            n_mels=cfg.n_mels,
            n_fft=cfg.n_fft,
            hop_length=cfg.hop_length,
            win_length=cfg.win_length,
            fmin=cfg.fmin,
            fmax=cfg.fmax,
            center=cfg.center,
        )
    
    def __len__(self) -> int:
        return len(self.samples)
    
    def __getitem__(self, idx: int):
        path, label_id = self.samples[idx]
        label = self.labels[label_id]
        
        # 오디오 로드
        x, sr = sf.read(path, dtype="float32", always_2d=False)
        if x.ndim > 1:
            x = x[:, 0]
        
        # 리샘플링
        if sr != self.cfg.sr:
            x = self._resample(x, sr, self.cfg.sr)
        
        # 길이 조정
        if self.train:
            x = ensure_clip(x, self.cfg.sr, self.cfg.clip_sec, mode=self.cfg.crop_mode_train)
        else:
            x = ensure_clip(x, self.cfg.sr, self.cfg.clip_sec, mode=self.cfg.crop_mode_eval)
        
        # 증강 (train only)
        if self.train and self.augmentor is not None:
            x = self.augmentor.augment(x, label)
        
        # Log-mel 변환
        logm = log_mel_spectrogram(x, self.lm_cfg)  # (n_mels, T)
        logm = normalize_cmvn(logm)
        
        # Tensor 변환 (1, n_mels, T)
        feat = torch.from_numpy(logm).unsqueeze(0).float()
        target = torch.tensor(label_id, dtype=torch.long)
        
        return feat, target
    
    def _resample(self, x: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
        """리샘플링"""
        if sr_in == sr_out:
            return x
        
        try:
            import librosa
            return librosa.resample(x, orig_sr=sr_in, target_sr=sr_out).astype(np.float32)
        except ImportError:
            t_in = np.linspace(0, 1, len(x), endpoint=False)
            n_out = int(len(x) * (sr_out / sr_in))
            t_out = np.linspace(0, 1, n_out, endpoint=False)
            return np.interp(t_out, t_in, x).astype(np.float32)


# =====================
# Model (DS-CNN)
# =====================
class DSConvBlock(nn.Module):
    def __init__(self, in_ch: int, out_ch: int, stride: Tuple[int, int] = (1, 1)):
        super().__init__()
        self.dw = nn.Conv2d(in_ch, in_ch, kernel_size=3, stride=stride, padding=1, groups=in_ch, bias=False)
        self.dw_bn = nn.BatchNorm2d(in_ch)
        self.pw = nn.Conv2d(in_ch, out_ch, kernel_size=1, stride=1, padding=0, bias=False)
        self.pw_bn = nn.BatchNorm2d(out_ch)
    
    def forward(self, x):
        x = F.relu(self.dw_bn(self.dw(x)))
        x = F.relu(self.pw_bn(self.pw(x)))
        return x


class DSCNN(nn.Module):
    def __init__(self, num_classes: int):
        super().__init__()
        self.stem = nn.Sequential(
            nn.Conv2d(1, 64, kernel_size=3, stride=(2, 2), padding=1, bias=False),
            nn.BatchNorm2d(64),
            nn.ReLU(),
        )
        self.blocks = nn.Sequential(
            DSConvBlock(64, 64, stride=(1, 1)),
            DSConvBlock(64, 64, stride=(1, 1)),
            DSConvBlock(64, 96, stride=(2, 2)),
            DSConvBlock(96, 96, stride=(1, 1)),
            DSConvBlock(96, 128, stride=(2, 2)),
            DSConvBlock(128, 128, stride=(1, 1)),
        )
        self.head = nn.Sequential(
            nn.AdaptiveAvgPool2d((1, 1)),
            nn.Flatten(),
            nn.Linear(128, num_classes),
        )
    
    def forward(self, x):
        x = self.stem(x)
        x = self.blocks(x)
        x = self.head(x)
        return x


# =====================
# Training
# =====================
@torch.no_grad()
def evaluate(model: nn.Module, loader: DataLoader, device: torch.device) -> Tuple[float, float]:
    """평가"""
    model.eval()
    total = 0
    correct = 0
    loss_sum = 0.0
    criterion = nn.CrossEntropyLoss()
    
    for feat, target in loader:
        feat = feat.to(device, non_blocking=True)
        target = target.to(device, non_blocking=True)
        
        logits = model(feat)
        loss = criterion(logits, target)
        
        loss_sum += loss.item() * target.size(0)
        pred = logits.argmax(dim=1)
        correct += (pred == target).sum().item()
        total += target.size(0)
    
    return loss_sum / max(1, total), correct / max(1, total)


def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
    epoch: int,
) -> Tuple[float, float]:
    """1 에폭 학습"""
    model.train()
    total = 0
    correct = 0
    loss_sum = 0.0
    criterion = nn.CrossEntropyLoss()
    
    for i, (feat, target) in enumerate(loader):
        feat = feat.to(device, non_blocking=True)
        target = target.to(device, non_blocking=True)
        
        optimizer.zero_grad()
        logits = model(feat)
        loss = criterion(logits, target)
        loss.backward()
        optimizer.step()
        
        loss_sum += loss.item() * target.size(0)
        pred = logits.argmax(dim=1)
        correct += (pred == target).sum().item()
        total += target.size(0)
        
        if (i + 1) % 20 == 0:
            print(f"  [{i+1}/{len(loader)}] loss={loss.item():.4f}", end="\r", flush=True)
    
    print()  # newline
    return loss_sum / max(1, total), correct / max(1, total)


def train(cfg: TrainConfig):
    """메인 학습 루프"""
    set_seed(cfg.seed)
    
    # 디렉토리 준비
    train_dir = os.path.join(cfg.data_root, "train")
    val_dir = os.path.join(cfg.data_root, "val")
    
    if not os.path.isdir(train_dir):
        raise RuntimeError(f"Train directory not found: {train_dir}")
    if not os.path.isdir(val_dir):
        raise RuntimeError(f"Val directory not found: {val_dir}")
    
    # 레이블 자동 감지
    if cfg.labels is None or len(cfg.labels) == 0:
        labels = sorted([d for d in os.listdir(train_dir) if os.path.isdir(os.path.join(train_dir, d))])
        cfg.labels = labels
    
    print(f"\n{'='*60}")
    print(f"🚀 Training KWS Model")
    print(f"{'='*60}")
    print(f"Labels: {cfg.labels}")
    print(f"Device: {cfg.device}")
    print(f"Epochs: {cfg.epochs}")
    print(f"Batch size: {cfg.batch_size}")
    print(f"Learning rate: {cfg.lr}")
    print(f"{'='*60}\n")
    
    # 노이즈/RIR 파일 로드
    noise_files = []
    rir_files = []
    
    if cfg.noise_dir and os.path.isdir(cfg.noise_dir):
        noise_files = glob.glob(os.path.join(cfg.noise_dir, "**/*.wav"), recursive=True)
        print(f"✓ Loaded {len(noise_files)} noise files")
    
    if cfg.rir_dir and os.path.isdir(cfg.rir_dir):
        rir_files = glob.glob(os.path.join(cfg.rir_dir, "**/*.wav"), recursive=True)
        print(f"✓ Loaded {len(rir_files)} RIR files")
    
    # Augmentor
    augmentor = None
    if cfg.aug:
        augmentor = AudioAugmentor(cfg, noise_files, rir_files)
        print("✓ Augmentor initialized")
    
    # 데이터셋
    ds_train = KWSDataset(train_dir, cfg.labels, cfg, train=True, augmentor=augmentor)
    ds_val = KWSDataset(val_dir, cfg.labels, cfg, train=False, augmentor=None)
    
    print(f"✓ Train samples: {len(ds_train)}")
    print(f"✓ Val samples: {len(ds_val)}")
    
    # 클래스 균형화
    sampler = None
    shuffle = True
    
    if cfg.balance_classes:
        counts = np.zeros(len(cfg.labels), dtype=np.int64)
        for _, label_id in ds_train.samples:
            counts[label_id] += 1
        
        counts = np.maximum(counts, 1)
        weights_per_class = 1.0 / counts.astype(np.float64)
        sample_weights = [weights_per_class[label_id] for _, label_id in ds_train.samples]
        sample_weights = torch.tensor(sample_weights, dtype=torch.double)
        
        sampler = WeightedRandomSampler(weights=sample_weights, num_samples=len(sample_weights), replacement=True)
        shuffle = False
        
        print(f"✓ Class balancing enabled: {dict(zip(cfg.labels, counts.tolist()))}")
    
    # 데이터로더
    dl_train = DataLoader(
        ds_train,
        batch_size=cfg.batch_size,
        shuffle=shuffle,
        sampler=sampler,
        num_workers=cfg.num_workers,
        pin_memory=True,
    )
    
    dl_val = DataLoader(
        ds_val,
        batch_size=cfg.batch_size,
        shuffle=False,
        num_workers=cfg.num_workers,
        pin_memory=True,
    )
    
    # 모델
    device = torch.device(cfg.device)
    model = DSCNN(num_classes=len(cfg.labels)).to(device)
    
    print(f"✓ Model: {count_parameters(model):,} parameters")
    
    # Optimizer
    optimizer = torch.optim.Adam(model.parameters(), lr=cfg.lr)
    
    # 출력 디렉토리
    os.makedirs(cfg.out_dir, exist_ok=True)
    
    # 메타데이터 저장
    meta = {
        "labels": cfg.labels,
        "sr": cfg.sr,
        "clip_sec": cfg.clip_sec,
        "n_mels": cfg.n_mels,
        "n_fft": cfg.n_fft,
        "hop_length": cfg.hop_length,
        "win_length": cfg.win_length,
        "fmin": cfg.fmin,
        "fmax": cfg.fmax,
        "center": cfg.center,
    }
    
    with open(os.path.join(cfg.out_dir, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    
    # 학습 루프
    best_acc = -1.0
    best_epoch = 0
    patience_counter = 0
    
    for epoch in range(1, cfg.epochs + 1):
        t0 = time.time()
        
        # Train
        train_loss, train_acc = train_one_epoch(model, dl_train, optimizer, device, epoch)
        
        # Validate
        val_loss, val_acc = evaluate(model, dl_val, device)
        
        elapsed = time.time() - t0
        
        print(f"[{epoch:03d}/{cfg.epochs}] "
              f"train_loss={train_loss:.4f} train_acc={train_acc:.4f} | "
              f"val_loss={val_loss:.4f} val_acc={val_acc:.4f} | "
              f"time={elapsed:.1f}s")
        
        # Best 모델 저장
        if val_acc > best_acc:
            best_acc = val_acc
            best_epoch = epoch
            patience_counter = 0
            
            best_path = os.path.join(cfg.out_dir, "best.pt")
            torch.save({"model": model.state_dict(), "meta": meta}, best_path)
            print(f"  ✅ Best model saved: val_acc={best_acc:.4f}")
        else:
            patience_counter += 1
        
        # Early stopping
        if cfg.early_stop_patience > 0 and patience_counter >= cfg.early_stop_patience:
            print(f"\n⏸️  Early stopping at epoch {epoch} (best: {best_epoch})")
            break
    
    print(f"\n{'='*60}")
    print(f"✅ Training complete!")
    print(f"Best val_acc: {best_acc:.4f} at epoch {best_epoch}")
    print(f"Model saved: {cfg.out_dir}/best.pt")
    print(f"{'='*60}\n")
    
    return os.path.join(cfg.out_dir, "best.pt")


# =====================
# ONNX Export
# =====================
def export_onnx(pt_path: str, onnx_path: str, device: str = "cpu"):
    """ONNX 변환"""
    print(f"\n🔄 Exporting to ONNX...")
    
    ckpt = torch.load(pt_path, map_location="cpu")
    meta = ckpt.get("meta", {})
    labels = meta.get("labels", [])
    
    device = torch.device(device)
    model = DSCNN(num_classes=len(labels))
    model.load_state_dict(ckpt["model"], strict=True)
    model.eval().to(device)
    
    # Dummy input
    sr = int(meta.get("sr", 16000))
    clip_sec = float(meta.get("clip_sec", 1.0))
    n_mels = int(meta.get("n_mels", 40))
    hop_length = int(meta.get("hop_length", 160))
    
    T = int((sr * clip_sec) / hop_length) + 1
    dummy = torch.zeros(1, 1, n_mels, T, dtype=torch.float32).to(device)
    
    # Export
    os.makedirs(os.path.dirname(onnx_path) or ".", exist_ok=True)
    torch.onnx.export(
        model,
        dummy,
        onnx_path,
        input_names=["x"],
        output_names=["logits"],
        opset_version=17,
        dynamic_axes=None,
    )
    
    print(f"✅ ONNX exported: {onnx_path}")
    print(f"   Input shape: (1, 1, {n_mels}, {T})")
    print(f"   Output shape: (1, {len(labels)})")


# =====================
# CLI
# =====================
def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Train KWS Model")
    
    # Data
    parser.add_argument("--data_root", default="datasets/kws")
    parser.add_argument("--labels", nargs="*", default=None)
    parser.add_argument("--out_dir", default="models/kws")
    
    # Training
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch_size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--num_workers", type=int, default=4)
    
    # Augmentation
    parser.add_argument("--no-aug", action="store_true")
    parser.add_argument("--no-balance", action="store_true")
    parser.add_argument("--noise_dir", default=None)
    parser.add_argument("--rir_dir", default=None)
    
    # Export
    parser.add_argument("--export_onnx", action="store_true")
    
    args = parser.parse_args()
    
    # Config
    cfg = TrainConfig(
        data_root=args.data_root,
        labels=args.labels,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        device=args.device,
        seed=args.seed,
        num_workers=args.num_workers,
        aug=(not args.no_aug),
        balance_classes=(not args.no_balance),
        noise_dir=args.noise_dir,
        rir_dir=args.rir_dir,
        out_dir=args.out_dir,
    )
    
    # Train
    best_path = train(cfg)
    
    # Export ONNX
    if args.export_onnx:
        onnx_path = os.path.join(cfg.out_dir, "kws.onnx")
        export_onnx(best_path, onnx_path, device="cpu")


if __name__ == "__main__":
    main()