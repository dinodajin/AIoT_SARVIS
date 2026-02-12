# kws/log_mel.py
from __future__ import annotations
import numpy as np

try:
    import librosa
except ImportError as e:
    raise ImportError("Please install librosa: pip install librosa") from e


class LogMelConfig:
    def __init__(
        self,
        sr: int = 16000,
        n_mels: int = 40,
        n_fft: int = 400,      # 25ms @16k
        hop_length: int = 160, # 10ms @16k
        win_length: int = 400,
        fmin: float = 20.0,
        fmax: float = 7600.0,
        center: bool = False,
        eps: float = 1e-10,
    ):
        self.sr = sr
        self.n_mels = n_mels
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.win_length = win_length
        self.fmin = fmin
        self.fmax = fmax
        self.center = center
        self.eps = eps


def ensure_1s_16k(audio_f32: np.ndarray, sr: int, target_sr: int = 16000, dur_sec: float = 1.0) -> np.ndarray:
    """
    - audio_f32: float32 [-1,1], mono
    - returns: float32, exactly target_sr * dur_sec samples
    """
    if audio_f32.ndim != 1:
        audio_f32 = audio_f32.reshape(-1)

    if sr != target_sr:
        audio_f32 = librosa.resample(audio_f32, orig_sr=sr, target_sr=target_sr)

    n = int(target_sr * dur_sec)
    if len(audio_f32) < n:
        pad = n - len(audio_f32)
        audio_f32 = np.pad(audio_f32, (0, pad), mode="constant")
    elif len(audio_f32) > n:
        audio_f32 = audio_f32[:n]
    return audio_f32.astype(np.float32)


def wav_to_logmel(audio_f32_1s_16k: np.ndarray, cfg: LogMelConfig) -> np.ndarray:
    """
    returns log-mel: shape (n_mels, T) with T ~= 100 for 1.0s
    """
    m = librosa.feature.melspectrogram(
        y=audio_f32_1s_16k,
        sr=cfg.sr,
        n_fft=cfg.n_fft,
        hop_length=cfg.hop_length,
        win_length=cfg.win_length,
        n_mels=cfg.n_mels,
        fmin=cfg.fmin,
        fmax=cfg.fmax,
        power=2.0,
        center=cfg.center,
    )
    logm = np.log(m + cfg.eps).astype(np.float32)
    return logm


def normalize_cmvn(logm: np.ndarray) -> np.ndarray:
    """
    Cepstral mean-variance normalization per-feature (mel-bin).
    logm: (n_mels, T)
    """
    mean = logm.mean(axis=1, keepdims=True)
    std = logm.std(axis=1, keepdims=True) + 1e-6
    return ((logm - mean) / std).astype(np.float32)

def log_mel_spectrogram(audio_f32: np.ndarray, cfg: LogMelConfig) -> np.ndarray:
    # train_dscnn.py가 기대하는 이름(호환용)
    return wav_to_logmel(audio_f32, cfg)

