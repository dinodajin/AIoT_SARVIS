# config.py - Jetson Orin Nano

# ===== Audio Input =====
DEVICE_NAME = "hw:B100"
SR = 48000
FRAME_MS = 30

# ===== VAD =====
VAD_MODE = 1
HP_CUT_HZ = 120.0
PRE_ROLL_SEC = 0.4
SILENCE_TIMEOUT = 1.5
MIN_SEG_SEC = 0.35
RMS_GATE = 250.0           # 300 → 450 (명확한 음성만 인식)
SHOW_LEVEL = True

# ===== Wake / Command =====
ACTIVE_WINDOW_SEC = 4.0
WAKE_CONF = 0.5
CMD_COOLDOWN_SEC = 0.8

# ===== Wake / Command timing =====
WAKE_WAIT_SEC = 15.0
CMD_START_MIN_SEC = 0.15           # 0.20 → 0.15 (더 빠르게 시작)
CMD_SILENCE_TIMEOUT = 1.2          # 0.7 → 1.2 (침묵 판정 시간 증가)

# ===== Command gating (noise rejection) =====
# WAKE 이후 "명령 시작"을 너무 빨리 인정해서(소음으로) STT가 도는 문제를 막기 위한 옵션들
CMD_START_RMS = 250.0              # 330 → 450 (명확한 음성만 시작으로 인정)
CMD_IGNORE_RMS = 150.0             # 70 → 150 (낮은 소음 무시)
CMD_MIN_SPEECH_RATIO = 0.25        # 0.25 → 0.35 (음성 비율 기준 상향)

# ===== Pre-buffering =====
PRE_BUFFER_ENABLED = True      # WAKE 감지 전 세그먼트도 버퍼링 (명령어 놓치지 않음)

# ===== Fallback command start =====
CMD_FALLBACK_ENABLED = True    # 명령어 시작 감지 실패 시 fallback 활성화
CMD_FALLBACK_RMS = 80.0        # Fallback threshold (primary보다 낮음)

# ===== User Session (로그인) =====
SERVER_BASE = "http://i14a104.p.ssafy.io:8080"
USER_LOGIN_URL = f"{SERVER_BASE}/api/biometric/login"
USER_CACHE_PATH = "/run/sarvis/current_user.json"
SESSION_TTL_HOURS = 24.0

# ===== Speaker Verification =====
# ⭐ Wespeaker 사용 (256차원)
ECAPA_ONNX_PATH = "models/speaker/wespeaker_resnet34_korean.onnx"
SPK_MODEL_TYPE = "wespeaker"   # "ecapa" 또는 "wespeaker"
SPK_MIN_SEG_SEC = 0.8
SPEAKER_CACHE_SEC = 8.0
SPK_THRESHOLD = 0.45  # 크로스 디바이스 환경을 고려한 낮은 임계값

# ⭐ 화자 검증 Bypass 설정
SPEAKER_VERIFICATION_BYPASS = True  # True로 설정하면 화자 검증 및 피드백 건너뜀
BYPASS_DEFAULT_UID = "default_user"  # bypass 시 사용할 기본 uid

# ===== Voice Command Feedback =====
# 화자 검증 성공 후 서버 피드백 대기
FEEDBACK_TIMEOUT_SEC = 10.0    # 서버 응답 대기 시간 (초)
# Trigger URL: {SERVER_BASE}/api/voice-command/trigger
# Request: {"uid": "user_id"}
# Response: {"success": true}

# ===== KWS (Wake-only: "싸비스") =====
KWS_ONNX_PATH = "models/kws/kws.onnx"
KWS_LABELS = ["WAKE","LEFT","RIGHT","FORWARD","BACKWARD","STOP","FOLLOW_ON","FOLLOW_OFF","UNKNOWN"]
KWS_CONF_THRESHOLD = 0.60
KWS_CLIP_SEC = 1.0
KWS_N_MELS = 40

# ===== Wake Word Validation (STT 기반 2차 검증) =====
WAKE_VALIDATION_ENABLED = True                                    # 2차 검증 활성화
WAKE_VALIDATION_URL = "http://13.124.184.2:8000/verify_wake"    # EC2 validation API
WAKE_TARGET_WORDS = ["싸비스", "사비스", "써비스", "서비스"]      # 인식할 wake word 목록
WAKE_VALIDATION_THRESHOLD = 0.5                                   # Validation 최소 신뢰도
WAKE_VALIDATION_MODE = "OR"                                       # "OR": 둘 중 하나만, "AND": 둘 다 통과

# ===== STT / LLM (프록시만 사용) =====
PROXY_SERVER = "http://13.124.184.2:8000"  # EC2 IP
STT_PROXY_URL = "http://13.124.184.2:8000/stt"
STT_PROXY_TIMEOUT = 6.0
LLM_PARSE_URL = "http://13.124.184.2:8000/llm_parse"
LLM_PARSE_TIMEOUT = 3.0
LLM_FALLBACK = True

# ===== HTTP Timeouts =====
HTTP_CONNECT_TIMEOUT = 2.0
HTTP_READ_TIMEOUT = 30.0
HTTP_WRITE_TIMEOUT = 30.0
HTTP_POOL_TIMEOUT = 30.0

# ===== Raspberry Pi =====
RPI_IP = "172.20.10.7"
RPI_PORT = 5005
RPI_CMD_URL = f"http://{RPI_IP}:{RPI_PORT}/hardware/control"
RPI_TIMEOUT_SEC = 2.0

# ===== Runtime =====
AUDIO_QUEUE_MAX = 3
DROP_IF_QUEUE_FULL = True
PRINT_EVERY_SEG = True
VERBOSE_TIMING = False         # 상세한 타이밍 로그 (디버깅용)

## ===== SV(화자검증) Feedback =====
#APP_FEEDBACK_URL = f"{SERVER_BASE}/api/feedback"

# ===== Command Audio Save =====
CMD_WAV_DIR = "/tmp"           # 명령어 오디오 임시 저장 경로

# ===== ORT (onnxruntime) =====
ORT_FORCE_CPU = True           # systemd/멀티스레드에서 CUDA 세션 생성 시 SEGV 방지용

# ===== Proxy Authentication =====
JETSON_TOKEN = "j12n3kj2b13kj1b"
