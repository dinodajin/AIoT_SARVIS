# tools/vad_crop_to_train.py
from __future__ import annotations

import os
import math
import argparse
import collections
from typing import List

import numpy as np
import soundfile as sf
import webrtcvad


# -------------------------
# utils
# -------------------------
def resample_poly(x: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    if sr_in == sr_out:
        return x.astype(np.float32)
    try:
        from scipy.signal import resample_poly
        g = math.gcd(sr_in, sr_out)
        up = sr_out // g
        down = sr_in // g
        return resample_poly(x.astype(np.float32), up, down).astype(np.float32)
    except Exception:
        # linear fallback
        t_in = np.linspace(0.0, 1.0, num=len(x), endpoint=False)
        n_out = int(len(x) * (sr_out / sr_in))
        t_out = np.linspace(0.0, 1.0, num=n_out, endpoint=False)
        return np.interp(t_out, t_in, x.astype(np.float32)).astype(np.float32)


def ensure_fixed_len(x_f32: np.ndarray, sr: int, target_sec: float) -> np.ndarray:
    target_n = int(sr * target_sec)
    if len(x_f32) < target_n:
        return np.pad(x_f32, (0, target_n - len(x_f32)), mode="constant")
    return x_f32[:target_n]


def rms_i16(x_i16: np.ndarray) -> float:
    x = x_i16.astype(np.float32)
    return float(np.sqrt(np.mean(x * x))) if x.size else 0.0


# -------------------------
# VAD split
# -------------------------
def vad_split(
    x_i16: np.ndarray,
    sr: int,
    frame_ms: int,
    vad_mode: int,
    rms_gate_i16: float,
    pre_roll_sec: float,
    post_roll_sec: float,
    silence_timeout: float,
    min_seg_sec: float,
    max_seg_sec: float,
) -> List[np.ndarray]:
    """
    x_i16: mono int16 @ sr (16k recommended)
    return: list of int16 segments
    """
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

    n_frames = len(x_i16) // frame_len
    for i in range(n_frames):
        fr = x_i16[i * frame_len : (i + 1) * frame_len]
        ring.append(fr)

        r = rms_i16(fr)
        if r < rms_gate_i16:
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


# -------------------------
# main
# -------------------------
def main():
    ap = argparse.ArgumentParser(description="VAD crop long wav to KWS train folder")
    ap.add_argument("--in_wav", required=True, help="long wav path")
    ap.add_argument("--label", required=True, help="target label name")
    ap.add_argument("--out_root", default="datasets/kws/train")

    # audio
    ap.add_argument("--save_sr", type=int, default=16000)
    ap.add_argument("--target_sec", type=float, default=2.0)

    # VAD params
    ap.add_argument("--frame_ms", type=int, default=30)
    ap.add_argument("--vad_mode", type=int, default=3)
    ap.add_argument("--rms_gate", type=float, default=700.0)
    ap.add_argument("--pre_roll", type=float, default=0.25)
    ap.add_argument("--post_roll", type=float, default=0.20)
    ap.add_argument("--silence_timeout", type=float, default=0.50)
    ap.add_argument("--min_seg_sec", type=float, default=0.35)
    ap.add_argument("--max_seg_sec", type=float, default=3.5)

    args = ap.parse_args()

    # load
    x, sr = sf.read(args.in_wav, dtype="int16", always_2d=False)
    if x.ndim > 1:
        x = x[:, 0]

    # resample to 16k for VAD
    x_f32 = x.astype(np.float32) / 32768.0
    x16 = resample_poly(x_f32, sr, 16000)
    x16_i16 = np.clip(x16 * 32767.0, -32768, 32767).astype(np.int16)

    segments = vad_split(
        x16_i16,
        sr=16000,
        frame_ms=args.frame_ms,
        vad_mode=args.vad_mode,
        rms_gate_i16=args.rms_gate,
        pre_roll_sec=args.pre_roll,
        post_roll_sec=args.post_roll,
        silence_timeout=args.silence_timeout,
        min_seg_sec=args.min_seg_sec,
        max_seg_sec=args.max_seg_sec,
    )

    out_dir = os.path.join(args.out_root, args.label)
    os.makedirs(out_dir, exist_ok=True)

    saved = 0
    base = os.path.splitext(os.path.basename(args.in_wav))[0]

    for i, seg_i16 in enumerate(segments):
        seg_f32 = seg_i16.astype(np.float32) / 32768.0
        fixed = ensure_fixed_len(seg_f32, args.save_sr, args.target_sec)
        out_path = os.path.join(
           out_dir,
            f"{args.label}_{base}_{i:05d}.wav"
        )
        sf.write(out_path, fixed, args.save_sr, subtype="PCM_16")
        saved += 1

    print(f"[DONE] segments={len(segments)} saved={saved} -> {out_dir}")


if __name__ == "__main__":
    main()
