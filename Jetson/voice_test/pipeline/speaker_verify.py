# pipeline/speaker_verify.py
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple, Dict, Any, List, Literal
import json
import numpy as np

try:
    import onnxruntime as ort
except Exception:
    ort = None


# -------------------------
# Cosine helpers
# -------------------------
def l2norm(v: np.ndarray) -> np.ndarray:
    v = v.astype(np.float32).reshape(-1)
    n = float(np.linalg.norm(v) + 1e-9)
    return (v / n).astype(np.float32)


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    a = l2norm(a)
    b = l2norm(b)
    return float(np.dot(a, b))


# -------------------------
# wav -> logmel80 (T,80)
# -------------------------
def wav_to_logmel80(audio_16k: np.ndarray) -> np.ndarray:
    """
    audio_16k: float32 mono @ 16kHz, shape (N,)
    return: float32 feats shape (T, 80)  # 모델 입력: (B, T, 80)
    """
    import librosa

    sr = 16000
    n_fft = 400        # 25ms
    hop = 160          # 10ms
    win = 400
    n_mels = 80

    m = librosa.feature.melspectrogram(
        y=audio_16k.astype(np.float32),
        sr=sr,
        n_fft=n_fft,
        hop_length=hop,
        win_length=win,
        n_mels=n_mels,
        fmin=20.0,
        fmax=7600.0,
        power=2.0,
        center=False,
    ).astype(np.float32)  # (80, T)

    logm = np.log(m + 1e-10).astype(np.float32)  # (80, T)

    # CMVN (mel-bin별)
    mean = logm.mean(axis=1, keepdims=True)
    std = logm.std(axis=1, keepdims=True) + 1e-6
    logm = (logm - mean) / std

    feats = logm.T.astype(np.float32)  # (T, 80)
    return feats


# -------------------------
# Resample to 16k
# -------------------------
def resample_to_16k(x: np.ndarray, sr: int) -> np.ndarray:
    x = x.astype(np.float32).reshape(-1)
    if sr == 16000:
        return x
    target_sr = 16000

    # 1) scipy polyphase
    try:
        import math
        from scipy.signal import resample_poly
        g = math.gcd(int(sr), int(target_sr))
        up = target_sr // g
        down = sr // g
        y = resample_poly(x, up, down).astype(np.float32)
        if not np.isfinite(y).all():
            y = np.nan_to_num(y).astype(np.float32)
        return y
    except Exception:
        pass

    # 2) librosa
    try:
        import librosa
        y = librosa.resample(x, orig_sr=sr, target_sr=target_sr).astype(np.float32)
        if not np.isfinite(y).all():
            y = np.nan_to_num(y).astype(np.float32)
        return y
    except Exception:
        pass

    # 3) linear interp
    t = np.arange(len(x), dtype=np.float32) / float(sr)
    n_out = int(round(len(x) * (target_sr / float(sr))))
    t2 = np.arange(n_out, dtype=np.float32) / float(target_sr)
    y = np.interp(t2, t, x).astype(np.float32)
    if not np.isfinite(y).all():
        y = np.nan_to_num(y).astype(np.float32)
    return y


# -------------------------
# Config
# -------------------------
@dataclass
class SpeakerConfig:
    threshold: float = 0.35
    min_seg_sec: float = 1.0
    server_verify_url: str = ""
    timeout_sec: float = 1.0
    model_type: Literal["ecapa", "wespeaker"] = "ecapa"


# -------------------------
# Base ONNX Embedder (공통 부모 클래스)
# -------------------------
class BaseOnnxEmbedder:
    """ECAPA와 Wespeaker의 공통 기능"""
    
    def __init__(self, onnx_path: str, model_name: str = "Model"):
        if ort is None:
            raise RuntimeError("onnxruntime not installed")
        if not Path(onnx_path).exists():
            raise RuntimeError(f"{model_name} ONNX not found: {onnx_path}")

        # Jetson 안정성 위해 CPU 고정
        so = ort.SessionOptions()
        so.intra_op_num_threads = 1
        so.inter_op_num_threads = 1

        self.sess = ort.InferenceSession(
            onnx_path,
            sess_options=so,
            providers=["CPUExecutionProvider"],
        )
        self.in_name = self.sess.get_inputs()[0].name
        self.in_shape = self.sess.get_inputs()[0].shape
        self.out_name = self.sess.get_outputs()[0].name
        self.model_name = model_name
        self._printed = False

    def _preprocess_audio(self, audio_f32: np.ndarray, sr: int) -> np.ndarray:
        """노이즈 제거 + DC 제거 + Peak 정규화 + 리샘플링
        
        중요: voice_enroll_server.py와 정확히 동일한 전처리를 해야 함!
        그렇지 않으면 등록 임베딩과 검증 임베딩이 달라져서 유사도가 낮아짐.
        """
        # 1) 노이즈 제거
        try:
            import noisereduce as nr
            audio_f32 = nr.reduce_noise(
                y=audio_f32,
                sr=sr,
                stationary=True,
                prop_decrease=0.8
            )
        except ImportError:
            pass
        
        # 2) DC 제거 (마이크 바이어스 보정)
        audio_f32 = audio_f32 - np.mean(audio_f32)
        
        # 3) Peak 정규화 (볼륨 차이 보정)
        peak = np.max(np.abs(audio_f32))
        if peak > 1e-6:
            audio_f32 = audio_f32 / peak
        
        # 4) 16kHz로 리샘플링
        return resample_to_16k(audio_f32, sr)

    def embed(self, audio_f32: np.ndarray, sr: int) -> np.ndarray:
        raise NotImplementedError("Subclass must implement embed()")


# -------------------------
# ECAPA ONNX Embedder
# -------------------------
class EcapaOnnxEmbedder(BaseOnnxEmbedder):
    def __init__(self, onnx_path: str):
        super().__init__(onnx_path, model_name="ECAPA-TDNN")

    def embed(self, audio_f32: np.ndarray, sr: int) -> np.ndarray:
        x16 = self._preprocess_audio(audio_f32, sr)
    
        if not self._printed:
            print(f"[SV-ECAPA] ONNX input={self.in_name} shape={self.in_shape}, output={self.out_name}", flush=True)
            self._printed = True

        feats = wav_to_logmel80(x16)                 # (T, 80)
        inp = feats[None, :, :].astype(np.float32)   # (1, T, 80)

        out = self.sess.run([self.out_name], {self.in_name: inp})[0]
        emb = np.array(out[0], dtype=np.float32)
        return l2norm(emb)


# -------------------------
# Wespeaker ONNX Embedder
# -------------------------
class WespeakerOnnxEmbedder(BaseOnnxEmbedder):
    """
    Wespeaker ResNet34 임베더
    - 입력: (B, T, 80) mel spectrogram
    - 출력: (B, 256) embedding
    """
    
    def __init__(self, onnx_path: str):
        super().__init__(onnx_path, model_name="Wespeaker-ResNet34")

    def embed(self, audio_f32: np.ndarray, sr: int) -> np.ndarray:
        x16 = self._preprocess_audio(audio_f32, sr)
    
        if not self._printed:
            print(f"[SV-Wespeaker] ONNX input={self.in_name} shape={self.in_shape}, output={self.out_name}", flush=True)
            self._printed = True

        # Wespeaker도 ECAPA와 동일한 mel spectrogram 사용
        feats = wav_to_logmel80(x16)                 # (T, 80)
        inp = feats[None, :, :].astype(np.float32)   # (1, T, 80)

        out = self.sess.run([self.out_name], {self.in_name: inp})[0]
        emb = np.array(out[0], dtype=np.float32)
        return l2norm(emb)


# -------------------------
# Profile loader
# -------------------------
def _maybe_embedding_list(x: Any) -> Optional[np.ndarray]:
    """
    x가 [float,...] 또는 np-ish면 (D,) embedding으로 변환
    """
    if x is None:
        return None
    if isinstance(x, np.ndarray):
        if x.ndim == 1 and x.size > 0:
            return l2norm(x.astype(np.float32))
        return None
    if isinstance(x, list) and len(x) > 0 and all(isinstance(v, (int, float)) for v in x):
        return l2norm(np.array(x, dtype=np.float32))
    return None


def _avg_embeddings(vecs: List[Any]) -> Optional[np.ndarray]:
    """
    vecs가 [[...],[...],...] 형태면 평균 임베딩으로 만듦
    """
    embs = []
    for v in vecs:
        e = _maybe_embedding_list(v)
        if e is not None:
            embs.append(e)
    if not embs:
        return None
    m = np.mean(np.stack(embs, axis=0), axis=0)
    return l2norm(m)


def _load_profiles_from_json_obj(data: Any) -> Dict[str, List[np.ndarray]]:
    profs: Dict[str, List[np.ndarray]] = {}

    # A) dict map
    if isinstance(data, dict):
        # C) current_user 스타일 우선 처리
        if "voice_vectors" in data:
            sid = str((data.get("login_id") or data.get("uid") or "current_user")).strip() or "current_user"
            vv = data.get("voice_vectors")

            embeddings: List[np.ndarray] = []
            
            # vv가 1개 embedding이면
            emb = _maybe_embedding_list(vv)
            if emb is not None:
                embeddings.append(emb)
            # vv가 여러개 embeddings이면 각각 추가
            elif isinstance(vv, list):
                for v in vv:
                    e = _maybe_embedding_list(v)
                    if e is not None:
                        embeddings.append(e)

            if embeddings:
                profs[sid] = embeddings
            return profs

        # 일반 dict map
        for k, v in data.items():
            e = _maybe_embedding_list(v)
            if e is not None:
                profs[str(k)] = [e]
        return profs

    # B) list entries
    if isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            sid = str(item.get("speaker_id") or item.get("uid") or item.get("login_id") or "").strip()
            emb = item.get("embedding", None)
            e = _maybe_embedding_list(emb)
            if sid and e is not None:
                profs[sid] = [e]
        return profs

    return profs


# -------------------------
# Speaker Verifier
# -------------------------
class SpeakerVerifier:
    """
    ECAPA-TDNN 또는 Wespeaker ResNet34를 사용한 화자 인증
    
    우선순위:
      1) server_verify_url 있으면: 임베딩을 서버로 보내서 ok 판정
      2) 로컬 프로필(profile_path) cosine 비교
    """

    def __init__(self, cfg: SpeakerConfig, profile_path: str, ecapa_onnx_path: str):
        self.cfg = cfg
        self.profile_path = Path(profile_path)

        self.embedder: Optional[BaseOnnxEmbedder] = None
        self._ecapa_ready = False

        self._profiles: Dict[str, List[np.ndarray]] = {}
        self._last_mtime_ns: Optional[int] = None
        self._load_profiles(force=True)

        # 모델 타입에 따라 임베더 선택
        model_type = getattr(cfg, "model_type", "ecapa").lower()
        
        if ecapa_onnx_path and Path(ecapa_onnx_path).exists() and ort is not None:
            try:
                if model_type == "wespeaker":
                    print(f"[SV] Loading Wespeaker ResNet34 from: {ecapa_onnx_path}", flush=True)
                    self.embedder = WespeakerOnnxEmbedder(ecapa_onnx_path)
                else:  # default: ecapa
                    print(f"[SV] Loading ECAPA-TDNN from: {ecapa_onnx_path}", flush=True)
                    self.embedder = EcapaOnnxEmbedder(ecapa_onnx_path)
                
                self._ecapa_ready = True
                print(f"[SV] Model loaded successfully: {model_type.upper()}", flush=True)
                
            except Exception as e:
                print(f"[SV] Model init failed: {e}", flush=True)
                import traceback
                traceback.print_exc()

        url = getattr(self.cfg, "server_verify_url", "").strip()
        if not url and not self._profiles:
            print("[SV] WARNING: server_verify_url empty AND no local profiles loaded. Speaker verify will reject.", flush=True)
        elif self._profiles:
            print(f"[SV] loaded local profiles: {list(self._profiles.keys())}", flush=True)

    def _load_profiles(self, force: bool = False):
        if not self.profile_path.exists():
            print(f"[SV] Profile path does not exist: {self.profile_path}", flush=True)
            self._profiles = {}
            self._last_mtime_ns = None
            return

        try:
            st = self.profile_path.stat()
            mtime_ns = getattr(st, "st_mtime_ns", int(st.st_mtime * 1e9))
            if (not force) and (self._last_mtime_ns is not None) and (mtime_ns == self._last_mtime_ns):
                return  # unchanged

            print(f"[SV] Loading profiles from {self.profile_path}", flush=True)
            data: Any = json.loads(self.profile_path.read_text(encoding="utf-8"))
            profs = _load_profiles_from_json_obj(data)

            # 디버그: 각 speaker의 임베딩 개수 출력
            for sid, embs in profs.items():
                print(f"[SV] Speaker '{sid}': {len(embs)} voice vectors loaded", flush=True)

            self._profiles = profs
            self._last_mtime_ns = mtime_ns
        except Exception as e:
            print(f"[SV] profile load failed: {e}", flush=True)
            import traceback
            traceback.print_exc()

    def verify(self, audio_f32: np.ndarray, sr: int) -> Tuple[Optional[str], float]:
        # 로그인/프로필이 바뀌었을 수 있으니 verify마다 갱신 체크
        self._load_profiles(force=False)

        # 0) 길이 체크
        if len(audio_f32) / float(sr) < float(self.cfg.min_seg_sec):
            return None, 0.0

        # 1) 임베더 준비 체크
        if not self._ecapa_ready or self.embedder is None:
            return None, 0.0

        # 2) 임베딩 생성
        emb = self.embedder.embed(audio_f32, sr)

        # 3) 서버 우선
        url = getattr(self.cfg, "server_verify_url", "").strip()
        if url:
            try:
                import requests
                payload = {
                    "embedding": emb.tolist(),
                    "sr": 16000,
                    "seg_sec": len(audio_f32) / float(sr),
                }
                r = requests.post(url, json=payload, timeout=float(self.cfg.timeout_sec))
                r.raise_for_status()
                data = r.json()

                ok = bool(data.get("ok", False))
                sim = float(data.get("similarity", 0.0))
                sid = data.get("speaker_id")

                if ok and isinstance(sid, str) and sid:
                    return sid, sim
                return None, sim

            except Exception as e:
                print(f"[SV] server verify failed: {e} -> fallback to local", flush=True)

        # 4) 로컬 fallback - 각 speaker의 모든 임베딩과 비교
        if not self._profiles:
            return None, 0.0

        best_sid = None
        best_sim = -1.0
        
        for sid, ref_list in self._profiles.items():
            for ref in ref_list:
                sim = cosine(emb, ref)
                if sim > best_sim:
                    best_sim = sim
                    best_sid = sid

        if best_sid is not None and best_sim >= float(self.cfg.threshold):
            print(f"[SV] Match: sid={best_sid}, sim={best_sim:.3f}", flush=True)
            return best_sid, float(best_sim)

        print(f"[SV] Reject: best_sim={best_sim:.3f}, threshold={self.cfg.threshold}", flush=True)
        return None, float(best_sim if best_sim >= 0 else 0.0)