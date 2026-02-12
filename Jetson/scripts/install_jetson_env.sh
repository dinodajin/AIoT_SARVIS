#!/usr/bin/env bash
set -e

VENV_PATH="${1:-./yhvenv}"

echo "[1/6] System deps"
sudo apt-get update
sudo apt-get install -y python3-pip libopenblas-dev python3-opencv portaudio19-dev libsndfile1

echo "[2/6] Activate venv: ${VENV_PATH}"
source "${VENV_PATH}/bin/activate"

echo "[3/6] Remove CPU torch/opencv-python if exists"
python -m pip uninstall -y torch torchvision torchaudio torch_tensorrt opencv-python opencv-python-headless || true
python -m pip cache purge || true

echo "[4/6] Install Jetson CUDA PyTorch (JP6 cu126 index-url forced)"
python -m pip install --no-cache-dir --force-reinstall -U \
  torch==2.8.0 torchvision==0.23.0 \
  --index-url https://pypi.jetson-ai-lab.io/jp6/cu126

echo "[5/6] Install Torch-TensorRT"
python -m pip install --no-cache-dir --force-reinstall -U \
  torch_tensorrt==2.8.0 \
  --index-url https://pypi.jetson-ai-lab.io/jp6/cu126

echo "[6/6] Install python requirements"
python -m pip install -U pip setuptools wheel
python -m pip install -r requirements-all.txt

echo "== CUDA check =="
python - << 'PY'
import torch
print("torch:", torch.__version__)
print("cuda available:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("device:", torch.cuda.get_device_name(0))
    print("torch cuda:", torch.version.cuda)
PY

echo "Done."

