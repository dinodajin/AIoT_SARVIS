# pipeline/command_classifier.py
from dataclasses import dataclass
from pathlib import Path
import numpy as np
import config as C

def softmax(x: np.ndarray) -> np.ndarray:
    x = x - np.max(x)
    e = np.exp(x)
    return e / np.sum(e)

class BaseKWS:
    def predict(self, audio_f32: np.ndarray, sr: int, allowed: set[str]) -> tuple[str, float]:
        raise NotImplementedError


def _resample_to_16k(x: np.ndarray, sr: int) -> np.ndarray:
    x = x.astype(np.float32).reshape(-1)
    if sr == 16000:
        return x
    # 간단 resample: speaker_verify의 고급 resample이 필요하면 거기 걸 재사용해도 됨
    try:
        from pipeline.speaker_verify import resample_to_16k
        return resample_to_16k(x, sr)
    except Exception:
        # fallback linear
        t = np.arange(len(x), dtype=np.float32) / float(sr)
        n_out = int(round(len(x) * (16000 / float(sr))))
        t2 = np.arange(n_out, dtype=np.float32) / 16000.0
        y = np.interp(t2, t, x).astype(np.float32)
        return y


def _wav_to_logmel80(audio_16k: np.ndarray) -> np.ndarray:
    from pipeline.speaker_verify import wav_to_logmel80
    return wav_to_logmel80(audio_16k)


class OnnxKWS(BaseKWS):
    """
    ⚠️ SEGFAULT 방지 (2026-02-03 수정):
    - ORT_FORCE_CPU=True이면 무조건 CPU만 사용
    - SessionOptions로 thread 수 제한하여 멀티스레드 충돌 방지
    """
    def __init__(self, onnx_path: str, labels: list[str]):
        import onnxruntime as ort

        self.labels = labels

        # ⭐ SEGFAULT 방지: CPU 전용 + thread 제한
        so = ort.SessionOptions()
        so.intra_op_num_threads = 1
        so.inter_op_num_threads = 1

        # ORT_FORCE_CPU가 True이면 CPU만 사용 (기본값 True)
        force_cpu = bool(getattr(C, "ORT_FORCE_CPU", True))
        
        if force_cpu:
            providers = ["CPUExecutionProvider"]
            print("[CMD_KWS] Using CPU provider (ORT_FORCE_CPU=True)", flush=True)
        else:
            providers = ["CPUExecutionProvider"]
            try:
                avail = ort.get_available_providers()
                if "CUDAExecutionProvider" in avail:
                    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
                    print("[CMD_KWS] CUDA provider available", flush=True)
            except Exception:
                pass

        self.sess = ort.InferenceSession(
            onnx_path, 
            sess_options=so,
            providers=providers
        )
        self.inp = self.sess.get_inputs()[0]
        self.out = self.sess.get_outputs()[0]
        self.in_name = self.inp.name
        self.out_name = self.out.name
        self.in_shape = self.inp.shape  # e.g. [1, 20800] or [1, T, 80]
        self._mode = None  # "wave" | "mel_T80" | "mel_80T"
        self._printed = False

        self._infer_mode_from_shape()

    def _infer_mode_from_shape(self):
        s = self.in_shape
        # shape에 None이 섞일 수 있음
        # 케이스1: (1, T)  -> wave
        if isinstance(s, (list, tuple)) and len(s) == 2:
            self._mode = "wave"
            return
        # 케이스2: (1, T, 80)
        if isinstance(s, (list, tuple)) and len(s) == 3:
            last = s[-1]
            mid = s[-2]
            if last == 80:
                self._mode = "mel_T80"
                return
            if mid == 80:
                self._mode = "mel_80T"
                return
        # 기본은 wave로 두되, 실전에서 바로 보이게 로그
        self._mode = "wave"

    def _preprocess(self, audio_f32: np.ndarray, sr: int) -> np.ndarray:
        x = audio_f32.astype(np.float32).reshape(-1)
        x = x / (np.max(np.abs(x)) + 1e-9)

        if self._mode == "wave":
            # 모델 입력 (1, T)
            if sr != 16000:
                x = _resample_to_16k(x, sr)
            return x[None, :].astype(np.float32)

        # mel 입력
        if sr != 16000:
            x = _resample_to_16k(x, sr)

        feats = _wav_to_logmel80(x)  # (T,80)
        if self._mode == "mel_T80":
            return feats[None, :, :].astype(np.float32)  # (1,T,80)
        else:
            return feats.T[None, :, :].astype(np.float32)  # (1,80,T)

    def predict(self, audio_f32: np.ndarray, sr: int, allowed: set[str]):
        if not self._printed:
            print(f"[CMD_KWS] input={self.in_name} shape={self.in_shape} mode={self._mode}", flush=True)
            self._printed = True

        inp = self._preprocess(audio_f32, sr)
        logits = self.sess.run([self.out_name], {self.in_name: inp})[0][0]
        probs = softmax(logits)

        best = int(np.argmax(probs))
        label = self.labels[best] if best < len(self.labels) else "UNKNOWN"
        conf = float(probs[best])

        if label not in allowed or conf < C.KWS_CONF_THRESHOLD:
            return "UNKNOWN", conf
        return label, conf


class TensorRTKWS(BaseKWS):
    """
    ⚠️ 주의:
    - 이 엔진은 입력이 wave(1,T)라고 가정.
    - mel 입력 엔진이면 여기 로직도 mel로 맞춰야 함.
    """
    def __init__(self, engine_path: str, labels: list[str]):
        import tensorrt as trt
        import pycuda.driver as cuda
        import pycuda.autoinit  # noqa

        self.labels = labels
        self.logger = trt.Logger(trt.Logger.WARNING)
        with open(engine_path, "rb") as f:
            self.engine = trt.Runtime(self.logger).deserialize_cuda_engine(f.read())
        self.context = self.engine.create_execution_context()

        self.input_idx = 0
        self.output_idx = 1
        self.stream = cuda.Stream()

        # binding shape (정적일 때만 안전)
        in_shape = self.engine.get_binding_shape(self.input_idx)
        out_shape = self.engine.get_binding_shape(self.output_idx)

        self.h_input = cuda.pagelocked_empty(int(trt.volume(in_shape)), dtype=np.float32)
        self.h_output = cuda.pagelocked_empty(int(trt.volume(out_shape)), dtype=np.float32)

        self.d_input = cuda.mem_alloc(self.h_input.nbytes)
        self.d_output = cuda.mem_alloc(self.h_output.nbytes)
        self.bindings = [int(self.d_input), int(self.d_output)]

    def _preprocess(self, audio_f32: np.ndarray, sr: int):
        x = audio_f32.astype(np.float32).reshape(-1)
        x = x / (np.max(np.abs(x)) + 1e-9)
        if sr != 16000:
            x = _resample_to_16k(x, sr)
        # 입력 버퍼 크기에 맞게 잘라/패딩
        n = min(len(x), len(self.h_input))
        self.h_input[:] = 0.0
        self.h_input[:n] = x[:n]

    def predict(self, audio_f32: np.ndarray, sr: int, allowed: set[str]):
        import pycuda.driver as cuda

        self._preprocess(audio_f32, sr)

        cuda.memcpy_htod_async(self.d_input, self.h_input, self.stream)
        self.context.execute_async_v2(self.bindings, self.stream.handle)
        cuda.memcpy_dtoh_async(self.h_output, self.d_output, self.stream)
        self.stream.synchronize()

        probs = softmax(self.h_output)
        best = int(np.argmax(probs))
        label = self.labels[best] if best < len(self.labels) else "UNKNOWN"
        conf = float(probs[best])

        if label not in allowed or conf < C.KWS_CONF_THRESHOLD:
            return "UNKNOWN", conf
        return label, conf


class TemplateKWS(BaseKWS):
    def predict(self, audio_f32: np.ndarray, sr: int, allowed: set[str]):
        return "UNKNOWN", 0.0


def create_kws():
    backend = getattr(C, "KWS_BACKEND", "template")

    if backend == "tensorrt" and Path(getattr(C, "KWS_TRT_ENGINE", "")).exists():
        print("[CMD_KWS] TensorRT backend", flush=True)
        return TensorRTKWS(C.KWS_TRT_ENGINE, C.KWS_LABELS)

    if backend == "onnx" and Path(getattr(C, "KWS_ONNX_PATH", "")).exists():
        print("[CMD_KWS] ONNX backend", flush=True)
        return OnnxKWS(C.KWS_ONNX_PATH, C.KWS_LABELS)

    print("[CMD_KWS] Template fallback", flush=True)
    return TemplateKWS()


@dataclass
class CommandConfig:
    pass

class CommandClassifier:
    def __init__(self, cfg: CommandConfig | None = None):
        self.kws = create_kws()

    def predict(self, audio_f32: np.ndarray, sr: int, allowed: set[str]):
        return self.kws.predict(audio_f32, sr, allowed)
