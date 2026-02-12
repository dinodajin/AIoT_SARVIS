import numpy as np
import sounddevice as sd
import sys
import time

# ===== 설정 =====
DEVICE =          # 장치 인덱스 또는 이름. None이면 기본 입력.
SAMPLERATE = 48000    # 웹캠 마이크가 48k인 경우가 많음
BLOCK_MS = 50         # 50ms 단위로 RMS 업데이트
SMOOTH = 0.2          # 0~1, 클수록 덜 흔들림(EMA)

blocksize = int(SAMPLERATE * BLOCK_MS / 1000)

rms_smooth = 1e-6

def rms_dbfs(x: np.ndarray) -> float:
    # x: float32, -1~1
    r = np.sqrt(np.mean(np.square(x)) + 1e-12)
    # dBFS (0 dBFS = full scale)
    return 20.0 * np.log10(r + 1e-12)

def bar_from_db(db, min_db=-80.0, max_db=0.0, width=50):
    db = max(min(db, max_db), min_db)
    frac = (db - min_db) / (max_db - min_db)
    n = int(frac * width)
    return "█" * n + " " * (width - n)

def callback(indata, frames, time_info, status):
    global rms_smooth
    if status:
        print(status, file=sys.stderr)

    # mono로 만들기
    x = indata
    if x.ndim > 1:
        x = np.mean(x, axis=1)
    x = x.astype(np.float32)

    r = float(np.sqrt(np.mean(x * x) + 1e-12))
    # EMA smoothing
    rms_smooth = (1 - SMOOTH) * rms_smooth + SMOOTH * r
    db = 20.0 * np.log10(rms_smooth + 1e-12)

    bar = bar_from_db(db)
    sys.stdout.write(f"\rRMS: {rms_smooth:0.6f} | {db:6.1f} dBFS |{bar}|")
    sys.stdout.flush()

def main():
    print("Starting RMS meter... (Ctrl+C to stop)")
    with sd.InputStream(
        device=DEVICE,
        channels=1,
        samplerate=SAMPLERATE,
        blocksize=blocksize,
        dtype="float32",
        callback=callback,
    ):
        while True:
            time.sleep(1)

if __name__ == "__main__":
    main()

