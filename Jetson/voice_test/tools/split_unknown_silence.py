# split_unknown_silence.py
from __future__ import annotations

import os
import glob
import random
from pathlib import Path

import numpy as np
import soundfile as sf


def mean_abs_energy(x: np.ndarray) -> float:
    return float(np.mean(np.abs(x)))


def split_one_file(
    in_wav: Path,
    out_unknown: Path,
    out_silence: Path,
    clip_sec: float = 1.3,
    energy_th: float = 0.010,       # mean(abs(x)) 기준
    max_offset_sec: float = 0.5,    # 시작 오프셋 랜덤(패턴 반복 줄이기)
    max_clips: int | None = None,   # 필요하면 상한
):
    x, sr = sf.read(str(in_wav), dtype="float32", always_2d=False)
    if x.ndim > 1:
        x = x[:, 0]
    x = np.clip(x, -1.0, 1.0).astype(np.float32)

    N = int(sr * clip_sec)
    if len(x) < N:
        x = np.pad(x, (0, N - len(x)), mode="constant")

    out_unknown.mkdir(parents=True, exist_ok=True)
    out_silence.mkdir(parents=True, exist_ok=True)

    start = random.randint(0, int(max_offset_sec * sr))
    i = start
    idx = 0
    u_cnt = 0
    s_cnt = 0

    while i + N <= len(x):
        clip = x[i:i + N]
        e = mean_abs_energy(clip)

        if e < energy_th:
            out = out_silence / f"{in_wav.stem}_{idx:06d}.wav"
            sf.write(str(out), clip, sr, subtype="PCM_16")
            s_cnt += 1
        else:
            out = out_unknown / f"{in_wav.stem}_{idx:06d}.wav"
            sf.write(str(out), clip, sr, subtype="PCM_16")
            u_cnt += 1

        idx += 1
        i += N

        if max_clips is not None and idx >= max_clips:
            break

    return u_cnt, s_cnt, sr


def main():
    import argparse

    ap = argparse.ArgumentParser("Split long recordings into UNKNOWN/SILENCE by energy")
    ap.add_argument("--in", dest="in_path", required=True,
                    help="input wav file or directory containing wavs")
    ap.add_argument("--out_unknown", required=True, help="output dir for UNKNOWN clips")
    ap.add_argument("--out_silence", required=True, help="output dir for SILENCE clips")
    ap.add_argument("--clip_sec", type=float, default=1.3)
    ap.add_argument("--energy_th", type=float, default=0.010)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--max_offset_sec", type=float, default=0.5)
    ap.add_argument("--max_clips", type=int, default=0, help="0 means no limit")
    args = ap.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)

    in_path = Path(args.in_path)
    out_u = Path(args.out_unknown)
    out_s = Path(args.out_silence)

    max_clips = None if args.max_clips == 0 else args.max_clips

    wavs = []
    if in_path.is_dir():
        wavs = sorted(glob.glob(str(in_path / "*.wav")))
    else:
        wavs = [str(in_path)]

    if not wavs:
        raise SystemExit(f"No wav files found in: {in_path}")

    total_u = 0
    total_s = 0
    sr0 = None

    for w in wavs:
        u, s, sr = split_one_file(
            Path(w),
            out_unknown=out_u,
            out_silence=out_s,
            clip_sec=args.clip_sec,
            energy_th=args.energy_th,
            max_offset_sec=args.max_offset_sec,
            max_clips=max_clips,
        )
        sr0 = sr0 or sr
        total_u += u
        total_s += s
        print(f"[split] {w} -> UNKNOWN={u}, SILENCE={s}, sr={sr}")

    print(f"\n[DONE] total UNKNOWN={total_u}, total SILENCE={total_s}, clip_sec={args.clip_sec}, energy_th={args.energy_th}")


if __name__ == "__main__":
    main()

