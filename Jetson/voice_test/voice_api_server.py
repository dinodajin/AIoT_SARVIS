# -*- coding: utf-8 -*-
import os
import time
import uuid
import logging
import subprocess
from pathlib import Path
from typing import List, Optional, Dict, Any

import requests
from fastapi import FastAPI, Request
from pydantic import BaseModel

# -----------------------
# Logging / Trace helper
# -----------------------
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

# -----------------------
# Config
# -----------------------
app = FastAPI()

SOFTAP_UPLOAD_DIR = Path(os.environ.get("SOFTAP_UPLOAD_DIR", "/var/lib/sarvis/uploads"))
ENROLL_SERVER = os.environ.get("ENROLL_SERVER", "http://127.0.0.1:8001")

# ffmpeg 변환 출력 파일 suffix
PCM_SUFFIX = os.environ.get("SARVIS_PCM_SUFFIX", ".pcm16k.wav")

# -----------------------
# Models
# -----------------------
class ProcessReq(BaseModel):
    login_id: str
    files: Optional[List[str]] = None
    uid_subdir: bool = True  # 의미: login_id 서브폴더 사용 여부

# -----------------------
# Utils
# -----------------------
def _resolve_paths(req: ProcessReq) -> List[Path]:
    login_id = req.login_id.strip()
    base = SOFTAP_UPLOAD_DIR / login_id if req.uid_subdir else SOFTAP_UPLOAD_DIR

    if req.files and len(req.files) == 4:
        paths = [base / f for f in req.files]
    else:
        paths = [base / f"voice_{i}.wav" for i in (1, 2, 3, 4)]

    for p in paths:
        if not p.exists():
            raise FileNotFoundError(f"missing wav: {p}")
    return paths

def ensure_pcm_wav_16k_mono(src: Path, trace_id: str) -> Path:
    """
    src가 mp4/m4a/aac/mp3/wav 뭐든 상관없이
    16kHz mono PCM s16le wav로 변환한 경로를 반환.
    """
    out = src.with_suffix(src.suffix + PCM_SUFFIX)  # 예: voice_1.wav.pcm16k.wav

    # 이미 변환본이 있고 최신이면 재사용(선택)
    try:
        if out.exists() and out.stat().st_size > 0 and out.stat().st_mtime >= src.stat().st_mtime:
            log_step("5001.ffmpeg.skip", trace_id, src=str(src), out=str(out), out_size=out.stat().st_size)
            return out
    except Exception:
        pass

    cmd = [
        "ffmpeg", "-y",
        "-i", str(src),
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        str(out),
    ]
    log_step("5001.ffmpeg.run", trace_id, cmd=" ".join(cmd))

    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0 or (not out.exists()) or out.stat().st_size == 0:
        err_tail = (p.stderr or "")[-800:]
        log_step("5001.ffmpeg.fail", trace_id, src=str(src), rc=p.returncode, err_tail=err_tail)
        raise RuntimeError(f"ffmpeg convert failed: src={src} rc={p.returncode} err_tail={err_tail}")

    log_step("5001.ffmpeg.ok", trace_id, src=str(src), out=str(out), out_size=out.stat().st_size)
    return out

# -----------------------
# Routes
# -----------------------
@app.get("/health")
def health():
    return {"ok": True, "softap_dir": str(SOFTAP_UPLOAD_DIR), "enroll_server": ENROLL_SERVER}

@app.post("/enroll/process")
def enroll_process(req: ProcessReq, request: Request):
    trace_id = get_trace_id(request.headers.get("X-Trace-Id"))
    t0 = time.time()

    raw_login_id = req.login_id
    login_id = req.login_id.strip()

    log_step(
        "5001.recv.enroll_process",
        trace_id,
        raw_login_id=raw_login_id,
        login_id=login_id,
        uid_subdir=req.uid_subdir,
        files=req.files,
        softap_dir=str(SOFTAP_UPLOAD_DIR),
        enroll_server=ENROLL_SERVER,
    )

    if not login_id:
        return {"ok": False, "trace_id": trace_id, "reason": "login_id empty"}

    try:
        wavs = _resolve_paths(req)
        log_step(
            "5001.resolve.wavs",
            trace_id,
            login_id=login_id,
            wavs=[str(p) for p in wavs],
            sizes=[p.stat().st_size for p in wavs],
        )

        results: List[Dict[str, Any]] = []
        headers = {"X-Trace-Id": trace_id}

        for i, wav in enumerate(wavs, start=1):
            # 1) ffmpeg로 16k mono PCM wav로 변환
            pcm_wav = ensure_pcm_wav_16k_mono(wav, trace_id)

            # 2) 8001로 전송
            log_step("5001.call.8001", trace_id, login_id=login_id, voice_idx=i, src=str(wav), send=str(pcm_wav))

            with open(pcm_wav, "rb") as f:
                r = requests.post(
                    f"{ENROLL_SERVER}/register/voice",
                    data={"login_id": login_id, "voice_idx": str(i)},
                    files={"voice": (pcm_wav.name, f, "audio/wav")},
                    headers=headers,
                    timeout=120,
                )

            log_step("5001.resp.8001", trace_id, voice_idx=i, status_code=r.status_code, body=r.text[:400])
            results.append({"idx": i, "status_code": r.status_code, "body": r.text})

        return {
            "ok": True,
            "trace_id": trace_id,
            "login_id": login_id,
            "results": results,
            "elapsed_ms": (time.time() - t0) * 1000.0,
        }

    except Exception as e:
        log_step("5001.error.enroll_process", trace_id, login_id=login_id, err=str(e))
        return {
            "ok": False,
            "trace_id": trace_id,
            "login_id": login_id,
            "error": str(e),
        }
