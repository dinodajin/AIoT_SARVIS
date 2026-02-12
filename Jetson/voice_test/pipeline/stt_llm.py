from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Tuple

import httpx
import numpy as np
import soundfile as sf
import config as C


def now_ms() -> float:
    return time.perf_counter() * 1000.0


@dataclass
class RuntimeState:
    mode: str = "idle"  # "idle" | "youtube"


# -------------------------
# Proxy auth helper
# -------------------------
def proxy_headers() -> Dict[str, str]:
    token = getattr(C, "JETSON_TOKEN", "").strip()
    if not token:
        raise RuntimeError("JETSON_TOKEN is empty (needed for proxy auth)")
    return {"x-token": token}


# -------------------------
# STT
# -------------------------
def transcribe_whisper(client: httpx.Client, api_key: str, wav_path: Path) -> Tuple[str, Dict[str, float]]:
    """Direct OpenAI/GMS Whisper transcription (requires api_key). (Dev only)"""
    if not api_key:
        raise RuntimeError(
            "Missing API key for STT. Set STT_PROXY_URL to use server-side STT or provide OPENAI_API_KEY."
        )
    t0 = now_ms()
    headers = {"Authorization": f"Bearer {api_key}"}
    with wav_path.open("rb") as f:
        files = {"file": (wav_path.name, f, "application/octet-stream")}
        data = {"model": "whisper-1", "language": "ko"}
        t_req = now_ms()
        r = client.post(getattr(C, "STT_URL"), headers=headers, data=data, files=files)
        t1 = now_ms()
    r.raise_for_status()
    text = (r.json().get("text") or "").strip()
    return text, {"stt_ms": t1 - t0, "stt_req_ms": t1 - t_req}


def transcribe_via_server(client: httpx.Client, wav_path: Path) -> Tuple[str, Dict[str, float]]:
    """Server-side STT (proxy-only recommended). No API key on Jetson."""
    url = getattr(C, "STT_PROXY_URL", "").strip()
    
    token = str(getattr(C, "JETSON_TOKEN", "")).strip()
    
    if not url:
        raise RuntimeError("STT_PROXY_URL is empty. Provide server STT endpoint.")
    t0 = now_ms()
    with wav_path.open("rb") as f:
        files = {"file": (wav_path.name, f, "application/octet-stream")}
        data = {"language": "ko"}
        t_req = now_ms()

        r = client.post(
            url,
            data=data,
            files=files,
            headers=proxy_headers(),
            timeout=float(getattr(C, "STT_PROXY_TIMEOUT", 6.0)),
        )
        t1 = now_ms()

    r.raise_for_status()
    text = (r.json().get("text") or "").strip()
    return text, {"stt_ms": t1 - t0, "stt_req_ms": t1 - t_req}


# -------------------------
# Rule parse
# -------------------------
def normalize_ko(s: str) -> str:
    s = s.lower().strip()
    for ch in [".", ",", "!", "?", "\"", "'", "“", "”", "’", "‘"]:
        s = s.replace(ch, " ")
    return " ".join(s.split())


def contains_any(s: str, keys) -> bool:
    return any(k in s for k in keys)


def parse_command_rule(stt_text: str, state: RuntimeState) -> Tuple[Dict[str, Any], bool]:
    t = normalize_ko(stt_text)

    if contains_any(t, ["정지", "멈춰", "스톱", "stop"]):
        return {"cmd": "STOP"}, True

    if contains_any(t, ["따라와", "따라 와", "follow"]):
        return {"cmd": "FOLLOW_ME"}, True
    if contains_any(t, ["이리와", "이리 와", "이쪽으로 와", "come here", "컴히어"]):
        return {"cmd": "COME_HERE"}, True
    if contains_any(t, ["저리가", "저리 가", "원위치", "홈", "home", "돌아가"]):
        return {"cmd": "HOME"}, True

    move_map = [
        (["왼쪽", "좌", "왼", "left"], "left"),
        (["오른쪽", "우", "오른", "right"], "right"),
        (["위", "위로", "up"], "up"),
        (["아래", "아래로", "down"], "down"),
        (["앞", "앞으로", "전진", "forward"], "forward"),
        (["뒤", "뒤로", "후진", "backward"], "backward"),
    ]
    for keys, d in move_map:
        if contains_any(t, keys):
            if not contains_any(t, ["유튜브", "youtube", "일시정지", "재생", "10초", "십초"]):
                return {"cmd": "MOVE", "dir": d}, True

    if contains_any(t, ["유튜브", "youtube"]) and contains_any(
        t, ["실행", "켜", "틀어", "열어", "켜줘", "켜 줘", "열어줘", "열어 줘"]
    ):
        return {"cmd": "YOUTUBE_OPEN"}, True

    in_yt = (state.mode == "youtube")

    if contains_any(t, ["10초", "십초", "10 초", "십 초"]):
        if contains_any(t, ["전", "이전", "앞으로 감기", "되감기", "back"]):
            return ({"cmd": "YOUTUBE_SEEK_BACKWARD"}, True) if in_yt else ({"cmd": "REJECT", "reason": "not_in_youtube"}, True)
        if contains_any(t, ["뒤", "이후", "앞으로", "넘기", "skip", "forward"]):
            return ({"cmd": "YOUTUBE_SEEK_FORWARD"}, True) if in_yt else ({"cmd": "REJECT", "reason": "not_in_youtube"}, True)

    if contains_any(t, ["일시정지", "일시 정지", "pause", "퍼즈"]):
        return ({"cmd": "YOUTUBE_PAUSE"}, True) if in_yt else ({"cmd": "REJECT", "reason": "not_in_youtube"}, True)

    if contains_any(t, ["재생", "플레이", "play", "시작"]):
        return ({"cmd": "YOUTUBE_PLAY"}, True) if in_yt else ({"cmd": "REJECT", "reason": "not_in_youtube"}, True)

    return {"cmd": "UNKNOWN", "raw": stt_text}, False


SYSTEM_PROMPT = (
    "너는 음성 명령을 아래 JSON 스키마로만 변환한다. 설명 금지.\n"
    "스키마:\n"
    "{\n"
    "  \"cmd\": \"MOVE\"|\"STOP\"|\"FOLLOW_ME\"|\"COME_HERE\"|\"HOME\"|\"YOUTUBE_OPEN\"|\"YOUTUBE_SEEK_FORWARD\"|\"YOUTUBE_SEEK_BACKWARD\"|\"YOUTUBE_PAUSE\"|\"YOUTUBE_PLAY\"|\"REJECT\"|\"UNKNOWN\",\n"
    "  \"dir\": \"left\"|\"right\"|\"up\"|\"down\"|\"forward\"|\"backward\" (MOVE일 때만),\n"
    "  \"reason\": string (REJECT일 때만)\n"
    "}\n"
    "유튜브 컨트롤은 state.mode가 youtube일 때만 허용. 아니면 REJECT+reason=not_in_youtube.\n"
)


# -------------------------
# LLM fallback (proxy-only)
# -------------------------
def llm_fallback_parse(
    client: httpx.Client,
    stt_text: str,
    state: RuntimeState,
    speaker_id: str | None = None,
    request_id: str | None = None,
    api_key: str = "",
) -> Dict[str, Any]:
    """
    Proxy-only 운영:
      - LLM_PARSE_URL 있으면: EC2 프록시로 parse 요청
      - 없으면: direct chat fallback 금지 -> 바로 REJECT
    """
    url = getattr(C, "LLM_PARSE_URL", "").strip()
    if not url:
        return {"cmd": "REJECT", "reason": "proxy_only_no_llm_parse_url"}

    payload = {
        "text": stt_text,
        "state": {"mode": state.mode},
        "speaker_id": speaker_id,
        "request_id": request_id,
    }

    r = client.post(
        url,
        json=payload,
        headers=proxy_headers(),
        timeout=float(getattr(C, "LLM_PARSE_TIMEOUT", 3.0)),
    )
    r.raise_for_status()
    data = r.json()

    # accept both {"ok":true,"action":{...}} and direct action dict
    if isinstance(data, dict) and "ok" in data:
        if data.get("ok"):
            action = data.get("action")
            if isinstance(action, dict):
                return action
            # allow server to return full cmd dict directly
            return {k: v for k, v in data.items() if k not in ("ok", "reason")}
        reason = data.get("reason") or "server_rejected"
        return {"cmd": "REJECT", "reason": str(reason)}

    if isinstance(data, dict):
        return data

    return {"cmd": "REJECT", "reason": "bad_server_response"}


# -------------------------
# payload / wav / RPi
# -------------------------
def build_cmd_payload(cmd: Dict[str, Any], asr_text: str) -> Dict[str, Any]:
    return {
        "cmd_id": f"{int(time.time())}-{uuid.uuid4().hex[:6]}",
        "asr": asr_text,
        **cmd,
    }


def save_wav(path: Path, audio_f32: np.ndarray, sr: int) -> None:
    """Save mono float32 audio to wav."""
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), audio_f32.astype(np.float32), sr)


def send_to_rpi(client: httpx.Client, payload: Dict[str, Any]) -> Tuple[int, float]:
    """Send command JSON to Raspberry Pi via HTTP POST."""
    url = getattr(C, "RPI_CMD_URL", "").strip()
    if not url:
        raise RuntimeError("RPI_CMD_URL is empty")
    t0 = now_ms()
    r = client.post(url, json=payload, timeout=float(getattr(C, "RPI_TIMEOUT_SEC", 3.0)))
    t1 = now_ms()
    return int(r.status_code), float(t1 - t0)