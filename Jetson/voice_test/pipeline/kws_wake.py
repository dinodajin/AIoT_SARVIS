from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import Set, Tuple, Optional

import numpy as np
import config as C

try:
    import onnxruntime as ort
except Exception:
    ort = None

from kws.log_mel import LogMelConfig, ensure_1s_16k, wav_to_logmel, normalize_cmvn


def softmax(x: np.ndarray) -> np.ndarray:
    x = x - np.max(x)
    e = np.exp(x)
    return e / (e.sum() + 1e-9)


@dataclass
class WakeKWSConfig:
    onnx_path: str
    labels: list[str]
    clip_sec: float = 1.0
    n_mels: int = 40


class WakeKWS:
    """
    ⚠️ SEGFAULT 방지 (2026-02-03 수정):
    - ORT_FORCE_CPU=True이면 무조건 CPU만 사용
    - SessionOptions로 thread 수 제한하여 멀티스레드 충돌 방지
    """

    def __init__(self, cfg: WakeKWSConfig):
        if ort is None:
            raise ImportError("onnxruntime not installed")
        
        self.cfg = cfg
        self.labels = cfg.labels

        # Log-mel config
        self.lm_cfg = LogMelConfig(
            sr=16000,
            n_mels=cfg.n_mels,
            n_fft=400,
            hop_length=160,
            win_length=400,
            fmin=20.0,
            fmax=7600.0,
            center=False,
        )

        # ⭐ SEGFAULT 방지: CPU 전용 + thread 제한
        so = ort.SessionOptions()
        so.intra_op_num_threads = 1
        so.inter_op_num_threads = 1

        force_cpu = bool(getattr(C, "ORT_FORCE_CPU", True))
        if force_cpu:
            providers = ["CPUExecutionProvider"]
            print("[KWS] Using CPU provider (ORT_FORCE_CPU=True)", flush=True)
        else:
            available = ort.get_available_providers()
            if "CUDAExecutionProvider" in available:
                providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
            else:
                providers = ["CPUExecutionProvider"]

        self.sess = ort.InferenceSession(str(cfg.onnx_path), sess_options=so, providers=providers)
        self.in_name = self.sess.get_inputs()[0].name
        self.out_name = self.sess.get_outputs()[0].name
        self.in_shape = self.sess.get_inputs()[0].shape
        self._printed = False

    def _preprocess(self, audio_f32: np.ndarray, sr: int) -> np.ndarray:
        x = audio_f32.astype(np.float32).reshape(-1)
        # peak normalize (약한 음성 대비)
        x = x / (np.max(np.abs(x)) + 1e-9)

        x1 = ensure_1s_16k(x, sr=sr, target_sr=16000, dur_sec=float(self.cfg.clip_sec))
        logm = wav_to_logmel(x1, self.lm_cfg)          # (40, T)
        logm = normalize_cmvn(logm)                    # (40, T)

        # ⭐ 가변 길이 처리: 모델이 기대하는 시간 축 길이로 맞추기
        if self.in_shape and len(self.in_shape) >= 4:
            expected_time = self.in_shape[3]
            if isinstance(expected_time, int):
                current_time = logm.shape[1]
                if current_time < expected_time:
                    # 짧으면 zero padding
                    pad_width = expected_time - current_time
                    logm = np.pad(logm, ((0, 0), (0, pad_width)), mode='constant', constant_values=0)
                elif current_time > expected_time:
                    # 길면 자르기
                    logm = logm[:, :expected_time]

        # model input: (1,1,40,T)
        inp = logm[None, None, :, :].astype(np.float32)
        return inp

    def predict(self, audio_f32: np.ndarray, sr: int, allowed: Set[str]) -> Tuple[str, float]:
        if not self._printed:
            print(f"[KWS] input={self.in_name} shape={self.in_shape} -> assume (1,1,{self.cfg.n_mels},T)", flush=True)
            self._printed = True

        inp = self._preprocess(audio_f32, sr)
        logits = self.sess.run([self.out_name], {self.in_name: inp})[0][0]  # (num_classes,)
        probs = softmax(np.asarray(logits, dtype=np.float32))

        best = int(np.argmax(probs))
        label = self.labels[best] if best < len(self.labels) else "UNKNOWN"
        conf = float(probs[best])

        if label not in allowed or conf < float(getattr(C, "KWS_CONF_THRESHOLD", 0.6)):
            return "UNKNOWN", conf
        return label, conf

    def close(self):
        pass
