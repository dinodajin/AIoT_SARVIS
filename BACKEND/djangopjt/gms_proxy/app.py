# -*- coding: utf-8 -*-
"""
통합 EC2 서버
- GMS Proxy (STT, LLM)
- Wake Word Validation
"""
import os, time, json, tempfile, re
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Header, HTTPException
from pydantic import BaseModel
import httpx

# ⭐ .env 파일 자동 로드
from dotenv import load_dotenv
load_dotenv()  # 같은 폴더의 .env 파일을 읽어서 환경변수로 설정

# 환경 변수
JETSON_TOKEN = os.environ.get("JETSON_TOKEN", "")
GMS_KEY = os.environ.get("GMS_KEY", "")

# GMS API 엔드포인트
GMS_CHAT_URL = "https://gms.ssafy.io/gmsapi/api.openai.com/v1/chat/completions"
GMS_STT_URL = "https://gms.ssafy.io/gmsapi/api.openai.com/v1/audio/transcriptions"

# ⭐ 글로벌 httpx 클라이언트 (커넥션 풀링)
http_client: httpx.AsyncClient = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """앱 시작/종료 시 실행"""
    global http_client
    
    # 앱 시작 시: httpx 클라이언트 생성
    limits = httpx.Limits(
        max_keepalive_connections=100,  # Keep-Alive 커넥션 최대 100개
        max_connections=200,             # 전체 커넥션 최대 200개
        keepalive_expiry=None            # ⭐ Keep-Alive 무제한 유지 (서버가 끊을 때까지)
    )
    
    http_client = httpx.AsyncClient(
        limits=limits,
        timeout=httpx.Timeout(30.0, connect=5.0),  # 연결 5초, 전체 30초
        http2=False,  # HTTP/2 비활성화 (h2 패키지 불필요)
        follow_redirects=True
    )
    
    print("✅ HTTP client initialized with connection pooling")
    
    yield
    
    # 앱 종료 시: httpx 클라이언트 정리
    await http_client.aclose()
    print("✅ HTTP client closed")

app = FastAPI(lifespan=lifespan)

def check_auth(x_token: str | None):
    if JETSON_TOKEN and x_token != JETSON_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")

@app.get("/health")
def health():
    return {"ok": True, "services": ["gms_proxy", "wake_validation"]}


# =====================
# Wake Word Validation
# =====================

class VerifyWakeRequest(BaseModel):
    text: str
    target_words: list[str] = [
        "싸비스", "사비스", "써비스", "서비스", "서버스",  # 한글
        "sabiss", "savis", "sarvis", "servus", "service"              # 영문 (STT가 영문으로 인식할 경우 대비)
    ]


class VerifyWakeResponse(BaseModel):
    is_valid: bool
    confidence: float
    reason: str
    matched_word: str | None = None


def normalize_korean(text: str) -> str:
    """한글/영문 텍스트 정규화"""
    text = text.lower().strip()
    
    # ⭐ 영문도 허용 (한글 + 영문 + 숫자만 남김)
    text = re.sub(r'[^가-힣a-z0-9]', '', text)
    
    # 연속 공백 제거
    text = re.sub(r'\s+', '', text)
    
    return text


def fuzzy_match(text: str, target: str, threshold: float = 0.7) -> float:
    """간단한 fuzzy matching (Levenshtein distance)"""
    text = normalize_korean(text)
    target = normalize_korean(target)
    
    if target in text:
        return 1.0
    
    # Levenshtein distance
    m, n = len(text), len(target)
    
    if m == 0:
        return 0.0
    if n == 0:
        return 0.0
    
    # DP table
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            cost = 0 if text[i-1] == target[j-1] else 1
            dp[i][j] = min(
                dp[i-1][j] + 1,      # deletion
                dp[i][j-1] + 1,      # insertion
                dp[i-1][j-1] + cost  # substitution
            )
    
    distance = dp[m][n]
    max_len = max(m, n)
    
    similarity = 1.0 - (distance / max_len)
    return similarity


def verify_with_rules(text: str, target_words: list[str]) -> dict:
    """
    규칙 기반 Wake word 검증
    """
    text_norm = normalize_korean(text)
    
    # 1) Exact match
    for target in target_words:
        target_norm = normalize_korean(target)
        if target_norm == text_norm:
            return {
                "is_valid": True,
                "confidence": 1.0,
                "reason": f"exact_match: {target}",
                "matched_word": target,
            }
    
    # 2) Contains match
    for target in target_words:
        target_norm = normalize_korean(target)
        if target_norm in text_norm:
            return {
                "is_valid": True,
                "confidence": 0.95,
                "reason": f"contains: {target}",
                "matched_word": target,
            }
    
    # 3) Fuzzy match
    best_score = 0.0
    best_target = None
    
    for target in target_words:
        score = fuzzy_match(text, target)
        if score > best_score:
            best_score = score
            best_target = target
    
    # Threshold: 0.7
    if best_score >= 0.7:
        return {
            "is_valid": True,
            "confidence": best_score,
            "reason": f"fuzzy_match: {best_target}",
            "matched_word": best_target,
        }
    
    # 4) Negative cases
    # 확실히 다른 단어들
    negative_words = [
        "안녕", "헬로", "하이", "좋아", "싫어", "예", "아니오",
        "고마워", "미안", "잘가", "안녕하세요", "감사합니다",
    ]
    
    for neg in negative_words:
        if normalize_korean(neg) == text_norm:
            return {
                "is_valid": False,
                "confidence": 0.95,
                "reason": f"negative_word: {neg}",
                "matched_word": None,
            }
    
    # 5) Unknown
    return {
        "is_valid": False,
        "confidence": best_score if best_score > 0.3 else 0.1,
        "reason": f"no_match (best: {best_target}, score: {best_score:.2f})",
        "matched_word": None,
    }


@app.post("/verify_wake", response_model=VerifyWakeResponse)
async def verify_wake(req: VerifyWakeRequest):
    """
    Wake word 검증 API
    
    Example:
        POST /verify_wake
        {
            "text": "싸비스 켜줘",
            "target_words": ["싸비스", "사비스"]
        }
        
        Response:
        {
            "is_valid": true,
            "confidence": 0.95,
            "reason": "contains: 싸비스",
            "matched_word": "싸비스"
        }
    """
    if not req.text:
        raise HTTPException(status_code=400, detail="text is required")
    
    result = verify_with_rules(req.text, req.target_words)
    
    return VerifyWakeResponse(**result)


# =====================
# GMS Proxy - STT
# =====================

@app.post("/stt")
async def stt(
    file: UploadFile = File(...), 
    language: str = "ko",
    x_token: str | None = Header(default=None)
):
    """
    Jetson의 음성 파일을 GMS Whisper API로 전송
    """
    check_auth(x_token)
    
    if not GMS_KEY:
        raise HTTPException(status_code=500, detail="GMS_KEY not configured")
    
    t0 = time.time()
    
    try:
        # 파일 데이터 읽기
        audio_data = await file.read()
        
        # ⭐ 글로벌 http_client 사용 (커넥션 재사용)
        files = {
            "file": (file.filename or "audio.wav", audio_data, file.content_type or "audio/wav")
        }
        data = {
            "model": "whisper-1"
        }
        headers = {
            "Authorization": f"Bearer {GMS_KEY}"
        }
        
        response = await http_client.post(
            GMS_STT_URL,
            files=files,
            data=data,
            headers=headers
        )
        response.raise_for_status()
        result = response.json()
        
        # GMS 응답 형식: {"text": "..."}
        text = result.get("text", "").strip()
        
        return {
            "text": text,
            "timings": {"stt_ms": (time.time() - t0) * 1000.0}
        }
    
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"GMS STT failed: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"STT error: {str(e)}")


# =====================
# GMS Proxy - LLM Parse
# =====================

class ParseReq(BaseModel):
    text: str
    state: dict = {}
    speaker_id: str | None = None
    request_id: str | None = None


# 명령어 파싱을 위한 시스템 프롬프트
COMMAND_SYSTEM_PROMPT = """너는 음성 명령을 JSON 형식으로 변환하는 파서다.

## 지원 명령어

### 1. 이동
- "왼쪽으로 이동", "좌회전" → {"cmd": "MOVE", "dir": "left"}
- "오른쪽으로 이동", "우회전" → {"cmd": "MOVE", "dir": "right"}
- "앞으로 가", "전진" → {"cmd": "MOVE", "dir": "forward"}
- "뒤로 가", "후진" → {"cmd": "MOVE", "dir": "backward"}
- "위로 올라가" → {"cmd": "MOVE", "dir": "up"}
- "아래로 내려가" → {"cmd": "MOVE", "dir": "down"}

### 2. 정지
- "멈춰", "정지", "스톱" → {"cmd": "STOP"}

### 3. 따라오기
- "따라와", "따라오세요" → {"cmd": "FOLLOW_ME"}

### 4. 이리 와
- "이리 와", "이쪽으로 와" → {"cmd": "COME_HERE"}

### 5. 유튜브 (state.mode가 "youtube"일 때만 허용)
- "유튜브 켜줘", "유튜브 실행" → {"cmd": "YOUTUBE_OPEN"}
- "일시정지" → {"cmd": "YOUTUBE_PAUSE"}
- "재생" → {"cmd": "YOUTUBE_PLAY"}
- "10초 앞으로" → {"cmd": "YOUTUBE_SEEK", "sec": 10}
- "10초 뒤로" → {"cmd": "YOUTUBE_SEEK", "sec": -10}

## 응답 형식

반드시 JSON만 출력하고, 설명이나 추가 텍스트는 절대 포함하지 마라.

예시:
입력: "왼쪽으로 이동해줘"
출력: {"cmd": "MOVE", "dir": "left"}

입력: "멈춰"
출력: {"cmd": "STOP"}

입력: "알 수 없는 명령"
출력: {"cmd": "UNKNOWN"}
"""


@app.post("/llm_parse")
async def llm_parse(req: ParseReq, x_token: str | None = Header(default=None)):
    """
    자연어 명령을 GMS GPT API로 파싱
    """
    check_auth(x_token)
    
    if not GMS_KEY:
        raise HTTPException(status_code=500, detail="GMS_KEY not configured")
    
    try:
        # 상태 정보 포함
        mode = req.state.get("mode", "idle")
        context = f"현재 모드: {mode}"
        if mode != "youtube":
            context += "\n(유튜브 명령은 유튜브 모드에서만 사용 가능)"
        
        # ⭐ 글로벌 http_client 사용 (커넥션 재사용)
        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {
                    "role": "system",
                    "content": COMMAND_SYSTEM_PROMPT
                },
                {
                    "role": "user",
                    "content": f"{context}\n\n명령: {req.text}"
                }
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GMS_KEY}"
        }
        
        response = await http_client.post(
            GMS_CHAT_URL,
            json=payload,
            headers=headers
        )
        response.raise_for_status()
        result = response.json()
        
        # GPT 응답 파싱
        content = result["choices"][0]["message"]["content"]
        action = json.loads(content)
        
        # 유튜브 명령 검증
        cmd = action.get("cmd", "")
        if cmd.startswith("YOUTUBE_") and mode != "youtube":
            return {
                "ok": False,
                "reason": "not_in_youtube"
            }
        
        # UNKNOWN이면 실패
        if cmd == "UNKNOWN":
            return {
                "ok": False,
                "reason": "unknown_command"
            }
        
        return {
            "ok": True,
            "action": action
        }
    
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"GMS Chat failed: {e.response.text}")
    except json.JSONDecodeError:
        return {
            "ok": False,
            "reason": "llm_parse_error"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM parse error: {str(e)}")


# =====================
# Speaker Verification (선택사항)
# =====================

#class VerifyReq(BaseModel):
#    embedding: list[float]
#    sr: int = 16000
#    seg_sec: float
#
#
#@app.post("/api/speaker/verify")
#def speaker_verify(req: VerifyReq, x_token: str | None = Header(default=None)):
#    """
#    화자 검증 - DB 구현 필요
#    """
#    check_auth(x_token)
#    
#    # TODO: DB에서 화자 검증
#    # 1. req.embedding과 DB의 voice_vectors 비교
#    # 2. cosine similarity 계산
#    # 3. threshold(0.35) 이상이면 ok=True
#    
#    return {
#        "ok": False,
#        "similarity": 0.0,
#        "speaker_id": None
#    }


if __name__ == "__main__":
    import uvicorn
    
    # 환경 변수 확인
    if not GMS_KEY:
        print("⚠️  WARNING: GMS_KEY not set!")
        print("   export GMS_KEY='your_gms_api_key'")
    
    if not JETSON_TOKEN:
        print("⚠️  WARNING: JETSON_TOKEN not set!")
        print("   export JETSON_TOKEN='your_jetson_token'")
    
    print(f"🚀 Starting unified server...")
    print(f"   Services:")
    print(f"   - STT: {GMS_STT_URL}")
    print(f"   - LLM: {GMS_CHAT_URL}")
    print(f"   - Wake Validation: /verify_wake")
    print(f"   - Health: /health")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)