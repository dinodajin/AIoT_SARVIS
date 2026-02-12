# silence_split.py (실전 추천)
import soundfile as sf
import numpy as np
import os
import random

in_wav = "recordings/SILENCE_20260129_195114_48000hz.wav"
out_dir = "SILENCE_SPLIT"
clip_sec = 1.3

x, sr = sf.read(in_wav, dtype="float32")
if x.ndim > 1:
    x = x[:, 0]

N = int(sr * clip_sec)
os.makedirs(out_dir, exist_ok=True)

# 랜덤 시작 오프셋 (0 ~ 0.5초)
start_offset = random.randint(0, int(0.5 * sr))

idx = 0
i = start_offset
while i + N <= len(x):
    clip = x[i:i + N]

    # 너무 완전한 0은 건너뛰기 (선택)
    if np.max(np.abs(clip)) < 1e-4:
        i += N
        continue

    sf.write(f"{out_dir}/sil_{idx:04d}.wav", clip, sr)
    idx += 1
    i += N

print(f"[OK] saved {idx} silence clips to {out_dir}/")

