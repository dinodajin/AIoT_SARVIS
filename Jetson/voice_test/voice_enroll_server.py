import os, json, time, uuid
from pathlib import Path
from typing import Dict, Optional
import numpy as np
import requests
import soundfile as sf
import noisereduce as nr
import tempfile
import io

import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

def get_trace_id(incoming: Optional[str] = None) -> str:
    tid = (incoming or "").strip()
    return tid if tid else uuid.uuid4().hex[:12]

def log_step(step: str, trace_id: str, **kv):
    parts = [f"{k}={v!r}" for k, v in kv.items()]
    logging.info(f"[{step}] trace={trace_id} " + " ".join(parts))


from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware

from pipeline.speaker_verify import WespeakerOnnxEmbedder

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== 공유 상태 경로 =====
STATE_DIR = Path("/run/sarvis")
CURRENT_USER_PATH = STATE_DIR / "current_user.json"
ENROLL_FLAG = STATE_DIR / "enrolling.flag"

# ===== Jetson에는 저장하지 않음! =====
# 메모리에서만 처리 후 백엔드로 전송

# login_id -> {1..4: bytes}  ← 파일 경로 대신 바이트 데이터
VOICE_BUCKET: Dict[str, Dict[int, bytes]] = {}

def touch_flag():
    ENROLL_FLAG.parent.mkdir(parents=True, exist_ok=True)
    ENROLL_FLAG.touch(exist_ok=True)
    try:
        os.chmod(ENROLL_FLAG, 0o664)
    except Exception:
        pass

def clear_flag():
    try:
        ENROLL_FLAG.unlink()
    except Exception:
        pass

def load_wav_float32_from_bytes(audio_bytes: bytes):
    """바이트 데이터에서 직접 오디오 로드 (디스크 저장 없이)"""
    x, sr = sf.read(io.BytesIO(audio_bytes), dtype="float32", always_2d=False)
    if getattr(x, "ndim", 1) > 1:
        x = x[:, 0]
    
    # ⭐ 1) 노이즈 제거
    x = nr.reduce_noise(
        y=x,
        sr=sr,
        stationary=True,
        prop_decrease=0.8
    )
    
    # 2) DC 제거
    x = x - np.mean(x)
    
    # 3) Peak normalize
    peak = np.max(np.abs(x))
    if peak > 1e-6:
        x = x / peak
    
    x = np.clip(x, -1.0, 1.0).astype(np.float32)
    return x, int(sr)

def l2norm(v: np.ndarray) -> np.ndarray:
    v = v.astype(np.float32).reshape(-1)
    n = float(np.linalg.norm(v) + 1e-9)
    return (v / n).astype(np.float32)

def embed(wespeaker: WespeakerOnnxEmbedder, audio_bytes: bytes) -> np.ndarray:
    """바이트 데이터에서 임베딩 생성"""
    audio, sr = load_wav_float32_from_bytes(audio_bytes)
    emb = wespeaker.embed(audio, sr)
    return l2norm(np.asarray(emb, dtype=np.float32))

def server_base() -> str:
    return "http://i14a104.p.ssafy.io:8080"

@app.get("/health")
def health():
    return {
        "ok": True,
        "model": "wespeaker",
        "embedding_dim": 256
    }

@app.get("/enroll/status")
def enroll_status():
    debug = {lid: sorted(m.keys()) for lid, m in VOICE_BUCKET.items()}
    return {
        "enrolling": ENROLL_FLAG.exists(),
        "buckets": debug,
        "model": "wespeaker"
    }


@app.post("/register/voice")
async def register_voice(
    login_id: str = Form(...),
    voice: UploadFile = File(...),
    voice_idx: Optional[int] = Form(None),  # 1~4 (없으면 1개 업로드를 x4 복제)
):
    touch_flag()
    t0 = time.time()
    
    # ⭐ 요청 ID 생성
    request_id = str(uuid.uuid4())[:8]
    
    print(f"\n{'='*60}", flush=True)
    print(f"[ENROLL] New request received", flush=True)
    print(f"[ENROLL]   Request ID: {request_id}", flush=True)
    print(f"[ENROLL]   Model: WESPEAKER ResNet34 (256-dim)", flush=True)
    print(f"[ENROLL]   login_id: {login_id}", flush=True)
    print(f"[ENROLL]   voice_idx: {voice_idx}", flush=True)
    print(f"[ENROLL]   timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}", flush=True)
    print(f"{'='*60}\n", flush=True)
    
    try:
        login_id = login_id.strip()
        if not login_id:
            return {"status": "error", "message": "login_id empty"}

        single_mode = (voice_idx is None)
        idx = 1 if single_mode else int(voice_idx)
        if (not single_mode) and idx not in (1, 2, 3, 4):
            return {"status": "error", "message": "voice_idx must be 1..4"}

        # ⭐ 메모리에서만 처리 (디스크 저장 안 함)
        print(f"[ENROLL] Reading voice file to memory...", flush=True)
        content = await voice.read()
        print(f"[ENROLL]   Size: {len(content)} bytes", flush=True)

        bucket = VOICE_BUCKET.setdefault(login_id, {})
        bucket[idx] = content  # ⭐ bytes 저장

        model_path = Path(os.environ.get("ECAPA_ONNX_PATH", "models/speaker/wespeaker_resnet34_korean.onnx"))
        if not model_path.exists():
            return {"status": "error", "message": f"Wespeaker model not found: {model_path}"}
        
        print(f"[ENROLL] Loading Wespeaker model: {model_path}", flush=True)
        wespeaker = WespeakerOnnxEmbedder(str(model_path))

        # --- 1개만 온 경우: 임시로 x4 복제 ---
        if single_mode:
            print(f"[ENROLL] Single mode: duplicating embedding x4", flush=True)
            e = embed(wespeaker, content)
            print(f"[ENROLL]   Embedding dim: {len(e)}", flush=True)
            vecs = [e.tolist(), e.tolist(), e.tolist(), e.tolist()]
        else:
            have = sorted(bucket.keys())
            print(f"[ENROLL] Multi mode: have {have}, need [1,2,3,4]", flush=True)
            if have != [1, 2, 3, 4]:
                return {
                    "status": "partial",
                    "login_id": login_id,
                    "have": have,
                    "need": [i for i in (1, 2, 3, 4) if i not in bucket]
                }
            print(f"[ENROLL] Computing embeddings for 4 files...", flush=True)
            embs = [embed(wespeaker, bucket[i]) for i in (1, 2, 3, 4)]
            print(f"[ENROLL]   Embedding dim: {len(embs[0])}", flush=True)
            vecs = [e.tolist() for e in embs]

        # ✅ EC2(=i14a104...) 서버에 업로드 (login_id 통일)
        url = f"{server_base()}/api/biometric/save-voice/"
        payload = {
            "login_id": login_id, 
            "voice_vectors": vecs,
            "request_id": request_id,
            "model_type": "wespeaker",
            "embedding_dim": 256
        }
        
        print(f"\n[ENROLL] ========== SENDING TO BACKEND ==========", flush=True)
        print(f"[ENROLL]   Request ID: {request_id}", flush=True)
        print(f"[ENROLL]   URL: {url}", flush=True)
        print(f"[ENROLL]   login_id: {login_id}", flush=True)
        print(f"[ENROLL]   Model: wespeaker (256-dim)", flush=True)
        print(f"[ENROLL]   vectors count: {len(vecs)}", flush=True)
        print(f"[ENROLL]   payload size: {len(json.dumps(payload))} bytes", flush=True)
        print(f"[ENROLL]   sending at: {time.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}", flush=True)
        
        r = requests.post(url, json=payload, timeout=20)
        
        print(f"[ENROLL] ========== BACKEND RESPONSE ==========", flush=True)
        print(f"[ENROLL]   Request ID: {request_id}", flush=True)
        print(f"[ENROLL]   Status Code: {r.status_code}", flush=True)
        print(f"[ENROLL]   Response Body: {r.text}", flush=True)
        print(f"[ENROLL]   Response Headers: {dict(r.headers)}", flush=True)
        print(f"[ENROLL]   received at: {time.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}", flush=True)
        print(f"[ENROLL] =========================================\n", flush=True)

        # ⭐ Jetson에는 저장하지 않음!
        # 백엔드가 /run/sarvis/current_user.json에 저장할 것

        VOICE_BUCKET.pop(login_id, None)
        
        elapsed = (time.time() - t0) * 1000.0
        
        print(f"\n[ENROLL] ========== SUCCESS ==========", flush=True)
        print(f"[ENROLL]   Request ID: {request_id}", flush=True)
        print(f"[ENROLL]   login_id: {login_id}", flush=True)
        print(f"[ENROLL]   Model: wespeaker (256-dim)", flush=True)
        print(f"[ENROLL]   Elapsed: {elapsed:.2f} ms", flush=True)
        print(f"[ENROLL]   ⚠️  No local storage (memory-only)", flush=True)
        print(f"[ENROLL] ==============================\n", flush=True)

        return {
            "status": "success",
            "login_id": login_id,
            "request_id": request_id,
            "model_type": "wespeaker",
            "embedding_dim": 256,
            "server_status": r.status_code,
            "elapsed_ms": elapsed,
        }

    except Exception as e:
        print(f"\n[ENROLL] ========== ERROR ==========", flush=True)
        print(f"[ENROLL]   Request ID: {request_id}", flush=True)
        print(f"[ENROLL]   Error: {str(e)}", flush=True)
        print(f"[ENROLL] ============================\n", flush=True)
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e), "request_id": request_id}
    finally:
        clear_flag()