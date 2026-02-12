# tools/record_long_jetson.py
from __future__ import annotations

import os
import time
import argparse
import numpy as np
import sounddevice as sd
import soundfile as sf


def list_devices():
    print("==== sounddevice input devices ====")
    try:
        devices = sd.query_devices()
        for i, d in enumerate(devices):
            if d.get("max_input_channels", 0) > 0:
                print(f"[{i:>2}] {d.get('name')}  (in={d.get('max_input_channels')})")
    except Exception as e:
        print("device list failed:", e)
    print("===================================")


def main():
    ap = argparse.ArgumentParser(description="Jetson long audio recorder (raw wav)")
    ap.add_argument("--list-devices", action="store_true")
    ap.add_argument("--device", type=int, default=None, help="sounddevice input index")
    ap.add_argument("--sr", type=int, default=48000, help="sample rate (48k recommended)")
    ap.add_argument("--channels", type=int, default=1)
    ap.add_argument("--seconds", type=float, default=300.0, help="record length (sec)")
    ap.add_argument("--label", type=str, default="WAKE", help="label name for filename")
    ap.add_argument("--out", type=str, default="recordings", help="output dir")
    args = ap.parse_args()

    if args.list_devices:
        list_devices()
        return

    if args.device is None:
        raise RuntimeError("Please specify --device (use --list-devices)")

    os.makedirs(args.out, exist_ok=True)

    ts = time.strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join(
        args.out,
        f"{args.label}_{ts}_{args.sr}hz.wav"
    )

    try:
        dev_name = sd.query_devices(args.device)["name"]
    except Exception:
        dev_name = "(unknown)"

    print("===================================")
    print(f"[REC] device={args.device}  name={dev_name}")
    print(f"[REC] sr={args.sr}  channels={args.channels}")
    print(f"[REC] seconds={args.seconds}")
    print(f"[REC] output={out_path}")
    print("===================================")

    print("Recording starts in:")
    for i in [3, 2, 1]:
        print(f"  {i}...")
        time.sleep(1.0)

    print("[REC] Recording...  (Ctrl+C to stop early)")

    frames = []
    try:
        with sd.InputStream(
            samplerate=args.sr,
            channels=args.channels,
            dtype="int16",
            device=args.device,
            blocksize=0,      # default (low overhead)
            latency="high",
        ) as stream:
            start = time.time()
            while True:
                data, _ = stream.read(1024)
                frames.append(data.copy())
                if (time.time() - start) >= args.seconds:
                    break
    except KeyboardInterrupt:
        print("\n[REC] Interrupted by user.")
    finally:
        audio = np.concatenate(frames, axis=0)
        audio = np.squeeze(audio)

        sf.write(out_path, audio, args.sr, subtype="PCM_16")
        dur = len(audio) / args.sr
        print(f"[REC] Saved: {out_path}")
        print(f"[REC] Duration: {dur:.2f} sec  samples={len(audio)}")


if __name__ == "__main__":
    main()



