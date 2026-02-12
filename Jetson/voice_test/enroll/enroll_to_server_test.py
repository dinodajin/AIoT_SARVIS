from __future__ import annotations

import json
from pathlib import Path
from typing import List

import numpy as np
import requests
import soundfile as sf

from pipeline.speaker_verify import EcapaOnnxEmbedder


BASE_URL = "http://i14a104.p.ssafy.io:8080"
ENDPOINT = "/api/biometric/save-voice/"


def load_wav_float32(path: Path) -> tuple[np.ndarray, int]:
    x, sr = sf.read(str(path), dtype="float32", always_2d=False)
    if x.ndim > 1:
        x = x[:, 0]
    x = np.clip(x, -1.0, 1.0).astype(np.float32)
    return x, int(sr)


def embed_wav_files(ecapa_path: Path, wav_paths: List[Path]) -> List[List[float]]:
    embedder = EcapaOnnxEmbedder(str(ecapa_path))
    out: List[List[float]] = []

    for p in wav_paths:
        audio, sr = load_wav_float32(p)

        # embed() 내부에서:
        # - resample_to_16k()
        # - wav_to_logmel80()
        # - ONNX inference
        # - L2 normalize
        emb = embedder.embed(audio, sr)
        vec = np.asarray(emb, dtype=np.float32).reshape(-1).astype(float).tolist()

        out.append(vec)
        print(f"[OK] {p.name}: dur={len(audio)/sr:.2f}s dim={len(vec)}")

    return out


def post_save_voice(uid: str, voice_vectors_4xD: List[List[float]], timeout_sec: int = 20, dry_run: bool = False):
    url = f"{BASE_URL}{ENDPOINT}"
    payload = {"uid": uid, "voice_vector": voice_vectors_4xD}

    Path("tmp_voice_payload.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print("[DBG] wrote payload -> tmp_voice_payload.json")

    if dry_run:
        print("[DRY_RUN] skip POST.")
        return None

    res = requests.post(url, json=payload, timeout=timeout_sec)
    return res


def main():
    import argparse

    ap = argparse.ArgumentParser("Test /api/biometric/save-voice/ using local wav files")
    ap.add_argument("--uid", required=True, help="사용자 UUID")
    ap.add_argument("--w1", required=True, help="wav 1")
    ap.add_argument("--w2", required=True, help="wav 2")
    ap.add_argument("--w3", required=True, help="wav 3")
    ap.add_argument("--w4", required=True, help="wav 4")
    ap.add_argument("--ecapa", default=None, help="ecapa.onnx 경로(기본: models/speaker/ecapa.onnx)")
    ap.add_argument("--dry_run", action="store_true", help="payload만 만들고 서버 POST는 안 함")
    args = ap.parse_args()

    root = Path(__file__).resolve().parents[1]  # voice_test
    ecapa_path = Path(args.ecapa) if args.ecapa else (root / "models" / "speaker" / "ecapa.onnx")

    wavs = [Path(args.w1), Path(args.w2), Path(args.w3), Path(args.w4)]
    for p in wavs:
        if not p.exists():
            raise SystemExit(f"wav not found: {p}")
    if not ecapa_path.exists():
        raise SystemExit(f"ecapa.onnx not found: {ecapa_path}")

    print(f"[INFO] ecapa: {ecapa_path.resolve()}")
    voice_vecs = embed_wav_files(ecapa_path, wavs)

    D = len(voice_vecs[0])
    if D != 192:
        print(f"[WARN] voice embedding dim={D}, backend expects 192 -> 서버가 400(INVALID_PAYLOAD) 가능.")
        print("       해결: 192 출력 ECAPA 모델로 교체하거나, 백엔드 요구 dim을 현재 모델 dim으로 맞춰야 함.")

    res = post_save_voice(args.uid, voice_vecs, dry_run=args.dry_run)

    if res is None:
        return

    print(f"[HTTP] status={res.status_code}")
    try:
        print("[BODY]", res.json())
    except Exception:
        print("[BODY]", res.text)


if __name__ == "__main__":
    main()
