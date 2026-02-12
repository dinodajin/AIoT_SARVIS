# KWS Training Pipeline - Complete Workflow

## 🎯 Overview

안전하고 강력한 KWS(Keyword Spotting) 학습 파이프라인입니다.

### 주요 기능
- ✅ **자동 백업**: 원본 데이터 손실 방지
- ✅ **VAD 크롭**: WebRTC VAD 기반 음성 구간 추출
- ✅ **노이즈 제거**: noisereduce를 사용한 전처리
- ✅ **데이터 증강**: Time shift, Gain, Noise mixing, RIR, EQ
- ✅ **안전한 분할**: train/val 자동 분리
- ✅ **클래스 균형**: 불균형 데이터 자동 처리

---

## 📦 Installation

```bash
# 기본 패키지
pip install numpy soundfile torch torchvision torchaudio
pip install scipy librosa webrtcvad noisereduce

# ONNX 변환 (optional)
pip install onnx onnxruntime
```

---

## 🚀 Quick Start

### 1. 데이터 백업 (필수!)

```bash
# 현재 데이터 백업
python safe_data_pipeline.py backup \
    --data_root datasets/kws \
    --name "before_training_$(date +%Y%m%d)"

# 백업 목록 확인
python safe_data_pipeline.py list-backups \
    --data_root datasets/kws
```

### 2. 긴 녹음 파일 크롭

```bash
# WAKE 레이블 크롭
python safe_data_pipeline.py crop \
    --input recordings/WAKE_20260129_123456_48000hz.wav \
    --output_dir datasets/kws/train \
    --label WAKE \
    --sr 16000 \
    --target_sec 1.0 \
    --vad_mode 3 \
    --rms_gate 700.0

# 여러 파일 일괄 처리
for wav in recordings/WAKE_*.wav; do
    python safe_data_pipeline.py crop \
        --input "$wav" \
        --output_dir datasets/kws/train \
        --label WAKE
done
```

### 3. UNKNOWN/SILENCE 생성

```bash
# 환경 소음에서 UNKNOWN/SILENCE 분리
python split_unknown_silence.py \
    --in recordings/ \
    --out_unknown datasets/kws/train/UNKNOWN \
    --out_silence datasets/kws/train/SILENCE \
    --clip_sec 1.0 \
    --energy_th 0.010
```

### 4. Train/Val 분리

```bash
# Dry-run으로 먼저 확인
python safe_data_pipeline.py split \
    --data_root datasets/kws \
    --val_ratio 0.12 \
    --seed 0 \
    --labels WAKE UNKNOWN SILENCE

# 실제 분리 (위에 명령어 다시 실행)
```

### 5. 학습 시작

```bash
# 기본 학습
python train_kws_improved.py \
    --data_root datasets/kws \
    --out_dir models/kws \
    --epochs 40 \
    --batch_size 64 \
    --lr 1e-3

# 증강 포함 학습
python train_kws_improved.py \
    --data_root datasets/kws \
    --out_dir models/kws \
    --noise_dir datasets/noise \
    --rir_dir datasets/rir \
    --epochs 60

# ONNX 변환 포함
python train_kws_improved.py \
    --data_root datasets/kws \
    --out_dir models/kws \
    --export_onnx
```

---

## 📂 Directory Structure

```
voice_test/
├── datasets/
│   ├── kws/
│   │   ├── train/
│   │   │   ├── WAKE/
│   │   │   ├── UNKNOWN/
│   │   │   └── SILENCE/
│   │   └── val/
│   │       ├── WAKE/
│   │       ├── UNKNOWN/
│   │       └── SILENCE/
│   ├── noise/          # 노이즈 파일 (증강용)
│   └── rir/            # RIR 파일 (증강용)
├── recordings/         # 원본 녹음 파일
├── backups/           # 자동 백업
└── models/
    └── kws/
        ├── best.pt
        ├── kws.onnx
        └── meta.json
```

---

## 🎛️ Configuration

### VAD 파라미터

```python
# aggressive: 배경 소음이 많은 환경
vad_mode = 3
rms_gate = 700.0

# moderate: 일반 환경
vad_mode = 2
rms_gate = 500.0

# lenient: 조용한 환경, WAKE가 너무 잘리면
vad_mode = 1
rms_gate = 300.0
```

### 증강 파라미터

```python
TrainConfig(
    # 시간 이동 (50% 확률)
    p_time_shift=0.5,
    
    # 볼륨 변화 (50% 확률, 0.7~1.3배)
    p_gain=0.5,
    
    # 노이즈 혼합 (85% 확률, -2~18dB SNR)
    p_noise=0.85,
    snr_min_db=-2.0,
    snr_max_db=18.0,
    
    # 잔향 추가 (70% 확률)
    p_rir=0.7,
    
    # 주파수 필터링 (30% 확률)
    p_eq=0.3,
)
```

---

## 🔧 Advanced Usage

### 1. 특정 레이블만 처리

```bash
# WAKE만 재학습
python train_kws_improved.py \
    --data_root datasets/kws \
    --labels WAKE UNKNOWN \
    --out_dir models/kws_wake_only
```

### 2. 증강 없이 학습 (디버깅용)

```bash
python train_kws_improved.py \
    --data_root datasets/kws \
    --no-aug \
    --epochs 20
```

### 3. 클래스 불균형 확인

```python
from pathlib import Path

for label in ["WAKE", "UNKNOWN", "SILENCE"]:
    train_count = len(list((Path("datasets/kws/train") / label).glob("*.wav")))
    val_count = len(list((Path("datasets/kws/val") / label).glob("*.wav")))
    print(f"{label}: train={train_count}, val={val_count}")
```

### 4. 백업에서 복구

```bash
# 백업 목록 확인
python safe_data_pipeline.py list-backups --data_root datasets/kws

# 특정 백업 복사
cp -r backups/backup_20260129_143022/* datasets/kws/
```

---

## 📊 Monitoring

### 학습 중 체크포인트

```
models/kws/
├── best.pt          # 최고 성능 모델
├── meta.json        # 모델 메타데이터
└── kws.onnx         # ONNX 변환 (--export_onnx)
```

### 로그 확인

```bash
# 학습 로그
tail -f train.log

# GPU 사용량
watch -n 1 nvidia-smi
```

---

## ⚠️ Troubleshooting

### 1. "No segments found" 에러

**원인**: VAD가 음성을 감지하지 못함

**해결**:
```bash
# RMS gate 낮추기
python safe_data_pipeline.py crop \
    --input ... \
    --rms_gate 300.0

# VAD mode 낮추기 (덜 aggressive)
python safe_data_pipeline.py crop \
    --input ... \
    --vad_mode 1
```

### 2. 파일이 너무 짧게 잘림

**원인**: VAD silence timeout이 너무 짧음

**해결**:
```python
vad_params = {
    "silence_timeout": 0.8,  # 기본 0.5 → 0.8
    "pre_roll_sec": 0.4,     # 기본 0.25 → 0.4
    "post_roll_sec": 0.3,    # 기본 0.20 → 0.3
}
```

### 3. CUDA out of memory

**해결**:
```bash
# Batch size 줄이기
python train_kws_improved.py \
    --batch_size 32 \
    --num_workers 2
```

### 4. 모델이 수렴하지 않음

**원인**: 데이터 불균형 또는 증강 과다

**해결**:
```bash
# 클래스 균형화 확인
python train_kws_improved.py \
    --data_root datasets/kws

# 증강 비율 낮추기
# train_kws_improved.py 내부에서:
# p_noise=0.5 (기본 0.85 → 0.5)
# p_rir=0.4   (기본 0.7 → 0.4)
```

---

## 🔬 Best Practices

### 1. 데이터 수집

- **WAKE**: 300-500 샘플, 다양한 발화 속도/억양
- **UNKNOWN**: 500-800 샘플, 유사 발음 단어 포함
- **SILENCE**: 200-400 샘플, 배경 소음 다양화

### 2. 녹음 품질

```bash
# 권장 설정
--sr 48000              # 고품질 녹음
--channels 1            # 모노
--seconds 300           # 5분씩 녹음

# 녹음 환경
- 조용한 실내 (WAKE)
- 다양한 배경 소음 (UNKNOWN/SILENCE)
- 여러 거리에서 녹음 (1m, 2m, 3m)
```

### 3. 증강 전략

```python
# WAKE: 강한 증강 (로버스트한 검출)
p_noise_wake = 0.85
p_rir_wake = 0.7

# UNKNOWN: 중간 증강 (false positive 방지)
p_noise_unknown = 0.55
p_rir_unknown = 0.4

# SILENCE: 약한 증강 (정확한 침묵 구분)
p_noise_silence = 0.75
p_rir_silence = 0.2
```

### 4. 학습 설정

```bash
# Stage 1: 빠른 프로토타입 (증강 없이)
python train_kws_improved.py \
    --no-aug \
    --epochs 20 \
    --out_dir models/stage1

# Stage 2: 본격 학습 (증강 포함)
python train_kws_improved.py \
    --noise_dir datasets/noise \
    --rir_dir datasets/rir \
    --epochs 60 \
    --out_dir models/stage2 \
    --export_onnx
```

---

## 🔗 Integration

### kws_wake.py와 통합

```python
# kws_wake.py에서 사용
from pipeline.kws_wake import WakeKWS, WakeKWSConfig

kws = WakeKWS(
    WakeKWSConfig(
        onnx_path="models/kws/kws.onnx",
        labels=["WAKE", "UNKNOWN", "SILENCE"],
        clip_sec=1.0,
        n_mels=40,
    )
)

# 예측
label, conf = kws.predict(audio_f32, sr=16000, allowed={"WAKE"})
```

### command_classifier.py와 통합

```python
# command_classifier.py에서 사용
from pipeline.command_classifier import OnnxKWS

kws = OnnxKWS(
    onnx_path="models/kws/kws.onnx",
    labels=["WAKE", "LEFT", "RIGHT", "FORWARD", "BACKWARD", "STOP", "UNKNOWN"]
)

label, conf = kws.predict(audio_f32, sr=16000, allowed={"LEFT", "RIGHT", "FORWARD", "BACKWARD", "STOP"})
```

---

## 📝 Changelog

### v2.0 (2026-02-05)
- ✅ 자동 백업 시스템 추가
- ✅ 안전한 파일 처리 로직
- ✅ 고급 증강 파이프라인
- ✅ 클래스 균형화
- ✅ Early stopping
- ✅ ONNX 변환 지원

### v1.0 (2026-01-29)
- 초기 버전

---

## 🤝 Contributing

버그 리포트 및 개선 제안은 이슈로 등록해주세요.

---

## 📄 License

MIT License