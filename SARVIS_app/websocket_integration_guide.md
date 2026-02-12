# SARVIS 실시간 음성 호출(Wake-up) 통합 가이드

이 문서는 **Jetson(Edge) → EC2(Server) → App(Client)** 으로 이어지는 실시간 음성 호출 시스템의 구현 가이드입니다.

## 1. 전체 흐름 (Architecture)

1. **[Jetson]** 마이크가 "싸비스" 호출어 감지
2. **[Jetson]** EC2 서버로 HTTP POST 요청 (`/api/voice-command/trigger`)
3. **[EC2]** 요청 받은 `uid`에 해당하는 WebSocket 연결 찾기
4. **[EC2]** 해당 소켓으로 `voice_command` 이벤트 전송
5. **[App]** 이벤트 수신 후 알림/진동 실행
6. **[Logout]** 앱에서 로그아웃 하거나 하트비트 타임아웃(1시간) 발생 시 -> **서버가 젯슨에게 로그아웃 요청 전송**

---

## 2. [EC2 Server] 백엔드 구현 가이드 (Python/FastAPI 예시)

### 2.1. WebSocket Connection Manager

`connection_uuid`를 사용하여 소켓을 관리하며, 하트비트 타임아웃 시 **젯슨에게 로그아웃 요청**을 보냅니다.

```python
from typing import Dict, Optional
from fastapi import WebSocket
from datetime import datetime
import asyncio
import requests

# 젯슨의 로그아웃 API 주소 (사전에 정의 필요)
# 예: http://[JETSON_IP]:[PORT]/api/logout
JETSON_LOGOUT_URL = "http://192.168.0.xxx:5000/api/auth/logout"

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.last_heartbeat: Dict[str, datetime] = {}
        # connection_uuid와 매핑된 Jetson IP 혹은 사용자 정보를 관리해야 함
        self.user_jetson_map: Dict[str, str] = {} 

    async def connect(self, websocket: WebSocket, connection_uuid: str):
        await websocket.accept()
        self.active_connections[connection_uuid] = websocket
        self.last_heartbeat[connection_uuid] = datetime.now()
        print(f"🔌 Client connected: {connection_uuid}")

    def disconnect(self, connection_uuid: str):
        if connection_uuid in self.active_connections:
            del self.active_connections[connection_uuid]
        if connection_uuid in self.last_heartbeat:
            del self.last_heartbeat[connection_uuid]
        print(f"🔌 Client disconnected: {connection_uuid}")

    async def send_personal_message(self, message: dict, connection_uuid: str):
        if connection_uuid in self.active_connections:
            await self.active_connections[connection_uuid].send_json(message)
            return True
        return False

    def update_heartbeat(self, connection_uuid: str):
        self.last_heartbeat[connection_uuid] = datetime.now()

    def notify_jetson_logout(self, connection_uuid: str):
        """
        젯슨에게 로그아웃 요청을 보냅니다.
        """
        try:
             # 실제 구현 시에는 user_id나 uid로 젯슨 IP를 찾거나, 
             # 정해진 젯슨 엔드포인트로 '누구가 로그아웃 했다'는 정보를 보냅니다.
            payload = {"uid": connection_uuid, "action": "logout"}
            requests.post(JETSON_LOGOUT_URL, json=payload, timeout=2)
            print(f"📤 Sent logout request to Jetson for {connection_uuid}")
        except Exception as e:
            print(f"⚠️ Failed to notify Jetson: {e}")

    async def check_timeouts(self):
        """
        1분마다 실행되며, 1시간(3600초) 이상 하트비트가 없는 연결을 종료하고 젯슨에게 알립니다.
        """
        while True:
            await asyncio.sleep(60)
            now = datetime.now()
            expired_connections = []

            for uuid, last_time in self.last_heartbeat.items():
                if (now - last_time).total_seconds() > 3600:
                    expired_connections.append(uuid)

            for uuid in expired_connections:
                print(f"⌛ Connection timed out (1 hour inactive): {uuid}")
                
                # 1. 앱 소켓 연결 종료
                socket = self.active_connections.get(uuid)
                if socket:
                    await socket.close()
                self.disconnect(uuid)
                
                # 2. [New] 젯슨에게 로그아웃 요청 전송
                self.notify_jetson_logout(uuid)

manager = ConnectionManager()
```

### 2.2. API Endpoints

```python
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from datetime import datetime
from pydantic import BaseModel

router = APIRouter()

# 1. WebSocket Endpoint
@router.websocket("/ws/app/{connection_uuid}/")
async def websocket_endpoint(websocket: WebSocket, connection_uuid: str):
    await manager.connect(websocket, connection_uuid)
    try:
        await manager.send_personal_message({
            "type": "connection_established",
            "message": "Connected to SARVIS Server",
            "connection_uuid": connection_uuid,
            "timestamp": datetime.now().isoformat()
        }, connection_uuid)
        
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "heartbeat":
                manager.update_heartbeat(connection_uuid)
                await manager.send_personal_message({
                    "type": "heartbeat_ack",
                    "timestamp": datetime.now().isoformat(),
                    "status": "active"
                }, connection_uuid)
                
    except WebSocketDisconnect:
        manager.disconnect(connection_uuid)

# 2. Voice Command Trigger (Jetson -> EC2)
class VoiceTriggerRequest(BaseModel):
    uid: str
    command: str
    timestamp: str

@router.post("/api/voice-command/trigger")
async def trigger_voice_command(request: VoiceTriggerRequest):
    success = await manager.send_personal_message({
        "type": "voice_command",
        "command": request.command,
        "timestamp": datetime.now().isoformat()
    }, request.uid)
    
    if success:
        return {"success": True, "message": "Command sent"}
    else:
        return {"success": False, "message": "User not connected"}
```

---

## 3. [Jetson] 젯슨 구현 가이드

젯슨 팀은 **서버로부터 로그아웃 요청을 받을 수 있는 HTTP Server**가 실행 중이어야 합니다.
(기존에 구현된 "서버에서 로그아웃 요청" 로직을 그대로 사용하면 됩니다.)

### 3.1. 로그아웃 요청 수신 예시 (Flask)

```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    data = request.json
    uid = data.get('uid')
    
    print(f"📥 Logout request received for {uid} from Server.")
    
    # [로그아웃 처리 로직]
    # - LED 끄기
    # - 사용자 세션 정보 삭제
    # - 대기 모드로 전환
    
    return jsonify({"success": True, "message": "Logged out successfully"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```
