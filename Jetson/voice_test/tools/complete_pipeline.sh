#!/bin/bash
# complete_pipeline.sh - 전체 워크플로우 (백업 → 크롭 → 검증 → 분리 → 학습)

set -e

# =====================
# Configuration
# =====================
DATA_ROOT="datasets/kws"
RECORDINGS="recordings"
NOISE_DIR="datasets/noise"
RIR_DIR="datasets/rir"
OUT_DIR="models/kws"

BACKUP_NAME="pipeline_$(date +%Y%m%d_%H%M%S)"
VALIDATION_CONFIDENCE=0.7

# =====================
# Colors
# =====================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"
}

stage() {
    echo ""
    echo -e "${BLUE}$1${NC}"
    echo "========================================"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# =====================
# Pre-flight checks
# =====================
check_prerequisites() {
    stage "🔍 Pre-flight Checks"
    
    # Python 스크립트 존재 확인
    local required_scripts=(
        "safe_data_pipeline.py"
        "validate_wake_word.py"
        "train_kws_improved.py"
        "split_unknown_silence.py"
    )
    
    for script in "${required_scripts[@]}"; do
        if [ ! -f "$script" ]; then
            error "Required script not found: $script"
        fi
        log "✓ Found: $script"
    done
    
    # 디렉토리 확인
    if [ ! -d "$RECORDINGS" ]; then
        warn "Recordings directory not found: $RECORDINGS"
    else
        local wake_count=$(ls "$RECORDINGS"/WAKE_*.wav 2>/dev/null | wc -l)
        local noise_count=$(ls "$RECORDINGS"/NOISE_*.wav 2>/dev/null | wc -l)
        log "✓ Recordings: WAKE=$wake_count, NOISE=$noise_count"
    fi
    
    # Python 패키지 확인
    log "Checking Python packages..."
    python -c "import torch, soundfile, numpy" 2>/dev/null || error "Missing Python packages"
    log "✓ Python packages OK"
}

# =====================
# Main Pipeline
# =====================

stage_1_backup() {
    stage "📦 Stage 1: Backup"
    
    if [ ! -d "$DATA_ROOT" ]; then
        warn "Data root doesn't exist yet, skipping backup"
        return
    fi
    
    log "Creating backup: $BACKUP_NAME"
    python safe_data_pipeline.py backup \
        --data_root "$DATA_ROOT" \
        --name "$BACKUP_NAME"
    
    log "✅ Backup complete"
}

stage_2_crop_wake() {
    stage "✂️  Stage 2: Crop WAKE Files"
    
    local wake_files=$(ls "$RECORDINGS"/WAKE_*.wav 2>/dev/null | wc -l)
    
    if [ "$wake_files" -eq 0 ]; then
        warn "No WAKE recordings found, skipping"
        return
    fi
    
    log "Processing $wake_files WAKE recordings..."
    
    local processed=0
    for wav in "$RECORDINGS"/WAKE_*.wav; do
        [ -f "$wav" ] || continue
        
        log "Processing: $(basename "$wav")"
        python safe_data_pipeline.py crop \
            --input "$wav" \
            --output_dir "$DATA_ROOT/train" \
            --label WAKE \
            --sr 16000 \
            --target_sec 1.0 \
            --vad_mode 3 \
            --rms_gate 700.0
        
        ((processed++))
    done
    
    log "✅ Processed $processed WAKE recordings"
}

stage_3_crop_unknown_silence() {
    stage "✂️  Stage 3: Split UNKNOWN/SILENCE"
    
    local noise_files=$(ls "$RECORDINGS"/NOISE_*.wav 2>/dev/null | wc -l)
    
    if [ "$noise_files" -eq 0 ]; then
        warn "No NOISE recordings found, skipping"
        return
    fi
    
    log "Processing NOISE recordings..."
    
    python split_unknown_silence.py \
        --in "$RECORDINGS" \
        --out_unknown "$DATA_ROOT/train/UNKNOWN" \
        --out_silence "$DATA_ROOT/train/SILENCE" \
        --clip_sec 1.0 \
        --energy_th 0.010 \
        --seed 0
    
    log "✅ UNKNOWN/SILENCE split complete"
}

stage_4_validate_wake() {
    stage "🔍 Stage 4: Validate WAKE Word Quality"
    
    local wake_dir="$DATA_ROOT/train/WAKE"
    
    if [ ! -d "$wake_dir" ]; then
        warn "WAKE directory not found, skipping validation"
        return
    fi
    
    local wake_count=$(ls "$wake_dir"/*.wav 2>/dev/null | wc -l)
    
    if [ "$wake_count" -eq 0 ]; then
        warn "No WAKE files to validate"
        return
    fi
    
    log "Validating $wake_count WAKE files..."
    
    # Validation report
    local report_file="validation_report_$(date +%Y%m%d_%H%M%S).json"
    
    python validate_wake_word.py full \
        --input "$wake_dir" \
        --invalid-dir "$DATA_ROOT/invalid" \
        --backup-dir "$DATA_ROOT/backup_validation" \
        --report "$report_file" \
        --confidence "$VALIDATION_CONFIDENCE"
    
    log "✅ Validation complete: $report_file"
    
    # 결과 요약
    if [ -f "$report_file" ]; then
        local total=$(jq -r '.total' "$report_file" 2>/dev/null || echo "?")
        local valid=$(jq -r '.valid' "$report_file" 2>/dev/null || echo "?")
        local invalid=$(jq -r '.invalid' "$report_file" 2>/dev/null || echo "?")
        
        log "Summary: Total=$total, Valid=$valid, Invalid=$invalid"
    fi
}

stage_5_split_train_val() {
    stage "📊 Stage 5: Split Train/Val"
    
    log "Splitting data into train/val..."
    
    python safe_data_pipeline.py split \
        --data_root "$DATA_ROOT" \
        --val_ratio 0.12 \
        --seed 0 \
        --labels WAKE UNKNOWN SILENCE
    
    log "✅ Train/val split complete"
}

stage_6_verify_data() {
    stage "🔍 Stage 6: Verify Data"
    
    echo ""
    echo "=== TRAIN ==="
    for label in WAKE UNKNOWN SILENCE; do
        local count=$(ls "$DATA_ROOT/train/$label"/*.wav 2>/dev/null | wc -l)
        echo "  $label: $count files"
    done
    
    echo ""
    echo "=== VAL ==="
    for label in WAKE UNKNOWN SILENCE; do
        local count=$(ls "$DATA_ROOT/val/$label"/*.wav 2>/dev/null | wc -l)
        echo "  $label: $count files"
    done
    echo ""
}

stage_7_train() {
    stage "🚀 Stage 7: Train Model"
    
    log "Starting training..."
    
    python train_kws_improved.py \
        --data_root "$DATA_ROOT" \
        --out_dir "$OUT_DIR" \
        --noise_dir "$NOISE_DIR" \
        --rir_dir "$RIR_DIR" \
        --epochs 40 \
        --batch_size 64 \
        --lr 1e-3 \
        --export_onnx
    
    log "✅ Training complete"
    
    # 모델 확인
    if [ -f "$OUT_DIR/best.pt" ]; then
        log "Model saved: $OUT_DIR/best.pt"
    fi
    if [ -f "$OUT_DIR/kws.onnx" ]; then
        log "ONNX saved: $OUT_DIR/kws.onnx"
    fi
}

stage_8_summary() {
    stage "📋 Pipeline Summary"
    
    echo ""
    echo "Backup:     $BACKUP_NAME"
    echo "Model:      $OUT_DIR/best.pt"
    echo "ONNX:       $OUT_DIR/kws.onnx"
    echo ""
    
    # 데이터 통계
    local train_total=0
    local val_total=0
    
    for label in WAKE UNKNOWN SILENCE; do
        local train_count=$(ls "$DATA_ROOT/train/$label"/*.wav 2>/dev/null | wc -l)
        local val_count=$(ls "$DATA_ROOT/val/$label"/*.wav 2>/dev/null | wc -l)
        train_total=$((train_total + train_count))
        val_total=$((val_total + val_count))
    done
    
    echo "Train samples: $train_total"
    echo "Val samples:   $val_total"
    echo ""
    
    # Invalid 파일
    if [ -d "$DATA_ROOT/invalid" ]; then
        local invalid_count=$(ls "$DATA_ROOT/invalid"/*.wav 2>/dev/null | wc -l)
        if [ "$invalid_count" -gt 0 ]; then
            warn "Found $invalid_count invalid WAKE files in $DATA_ROOT/invalid"
        fi
    fi
}

# =====================
# Main
# =====================

show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Complete KWS training pipeline:
  1. Backup existing data
  2. Crop WAKE recordings (VAD)
  3. Split UNKNOWN/SILENCE from noise
  4. Validate WAKE word quality (STT/LLM)
  5. Split train/val
  6. Verify data
  7. Train model
  8. Export ONNX

Options:
  --skip-backup           Skip initial backup
  --skip-validation       Skip WAKE word validation
  --skip-training         Skip model training
  --validation-confidence  Validation threshold (default: 0.7)
  --dry-run               Show what would be done
  -h, --help              Show this help

Environment Variables:
  DATA_ROOT       Dataset root (default: datasets/kws)
  RECORDINGS      Recordings directory (default: recordings)
  NOISE_DIR       Noise directory (default: datasets/noise)
  RIR_DIR         RIR directory (default: datasets/rir)
  OUT_DIR         Output directory (default: models/kws)

Example:
  # Full pipeline
  ./complete_pipeline.sh
  
  # Skip validation (fast)
  ./complete_pipeline.sh --skip-validation
  
  # Custom validation threshold
  ./complete_pipeline.sh --validation-confidence 0.8
EOF
}

main() {
    local skip_backup=false
    local skip_validation=false
    local skip_training=false
    local dry_run=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-backup)
                skip_backup=true
                shift
                ;;
            --skip-validation)
                skip_validation=true
                shift
                ;;
            --skip-training)
                skip_training=true
                shift
                ;;
            --validation-confidence)
                VALIDATION_CONFIDENCE="$2"
                shift 2
                ;;
            --dry-run)
                dry_run=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1 (use --help)"
                ;;
        esac
    done
    
    if $dry_run; then
        warn "DRY-RUN mode: showing what would be done"
        echo ""
    fi
    
    # Execute pipeline
    echo ""
    echo "╔════════════════════════════════════════╗"
    echo "║   KWS Training Pipeline (Complete)     ║"
    echo "╚════════════════════════════════════════╝"
    echo ""
    
    check_prerequisites
    
    if ! $skip_backup; then
        stage_1_backup
    fi
    
    stage_2_crop_wake
    stage_3_crop_unknown_silence
    
    if ! $skip_validation; then
        stage_4_validate_wake
    fi
    
    stage_5_split_train_val
    stage_6_verify_data
    
    if ! $skip_training; then
        stage_7_train
    fi
    
    stage_8_summary
    
    echo ""
    log "🎉 Pipeline complete!"
    echo ""
}

main "$@"