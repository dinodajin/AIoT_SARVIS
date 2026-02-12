# tools/make_val_from_train.py
import os
import glob
import random
import shutil
from pathlib import Path

VAL_RATIO = 0.1   # 10%
SEED = 0

def split_one(label: str, root: Path):
    train_dir = root / "train" / label
    val_dir   = root / "val" / label
    val_dir.mkdir(parents=True, exist_ok=True)

    wavs = sorted(glob.glob(str(train_dir / "*.wav")))
    if not wavs:
        print(f"[WARN] no wavs for {label}")
        return

    random.shuffle(wavs)
    n_val = int(len(wavs) * VAL_RATIO)
    val = wavs[:n_val]

    for w in val:
        shutil.move(w, val_dir / Path(w).name)

    print(f"[OK] {label}: moved {len(val)} wavs to val/")

def main():
    random.seed(SEED)
    root = Path("datasets/kws")

    for label in ["WAKE", "UNKNOWN", "SILENCE"]:
        split_one(label, root)

    print("\n[DONE] train/val split completed")

if __name__ == "__main__":
    main()
