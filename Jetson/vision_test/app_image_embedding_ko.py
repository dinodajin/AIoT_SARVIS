# -*- coding: utf-8 -*-
from flask import Flask, request, jsonify
import cv2
import numpy as np
import gc
import requests
from insightface.app import FaceAnalysis
import threading
import pathlib
from pathlib import Path
import os, json, time
import uuid
import logging
from typing import Optional

# --- [로깅 설정] ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

def get_trace_id(incoming: Optional[str] = None) -> str:
    tid = (incoming or "").strip()
    return tid if tid else uuid.uuid4().hex[:12]

def log_step(step: str, trace_id: str, **kv):
    parts = [f"{k}={v!r}" for k, v in kv.items()]
    logging.info(f"[{step}] trace={trace_id} " + " ".join(parts))


# --- [경로 및 권한 설정] ---
STATE_DIR = Path("/run/sarvis")
try:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
except Exception as e:
    print(f"Warning: could not ensure {STATE_DIR}: {e}")

CURRENT_USER_PATH = STATE_DIR / "current_user.json"
VOICE_UPLOAD_ROOT = Path("/var/lib/sarvis/uploads")
VOICE_PROCESS_URL = "http://127.0.0.1:5001/enroll/process"

try:
    VOICE_UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
except Exception as e:
    print(f"[FATAL] cannot create VOICE_UPLOAD_ROOT={VOICE_UPLOAD_ROOT}: {e}")
    raise


# --- [파일 및 세션 유틸리티] ---
def _atomic_write_json(path: Path, obj: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)

def send_offset_to_rpi(off):
    if not off: return
    try:
        # 5005를 5006으로 수정
        rpi_offset_url = f"http://{RPI_IP}:5006/hardware/apply_offset"
        
        requests.post(rpi_offset_url, json={"offsets": off}, timeout=0.5)
        print(f"?? [DIRECT MOVE] Sent to RPi via Port 5006")
    except Exception as e:
        print(f"? [MOVE ERROR] {e}")
        
def _remove_current_user_json():
    try:
        if CURRENT_USER_PATH.exists():
            CURRENT_USER_PATH.unlink()
    except Exception as e:
        print(f"Error removing JSON: {e}")


# --- [모델 초기화] ---
app_face = FaceAnalysis(
    name='buffalo_sc', 
    providers=['CUDAExecutionProvider', 'CPUExecutionProvider'],
    allowed_modules=['detection', 'recognition']
)
app_face.prepare(ctx_id=0, det_size=(320, 320))

app = Flask(__name__)

# --- [전역 세션 관리] ---
current_user = {
    "uid": None,
    "face_vectors": None,
    "offsets": None,
    "voice_vectors": None
}

def reset_current_user():
    global current_user
    current_user["uid"] = None
    current_user["face_vectors"] = None
    current_user["offsets"] = None
    _remove_current_user_json()
    print("??? [SESSION CLEARED] User logged out and JSON removed.")

def calculate_similarity(v1, v2):
    return np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))

def get_face_info(face, frame_shape):
    lm = face.kps 
    dist_l = np.linalg.norm(lm[2] - lm[0])
    dist_r = np.linalg.norm(lm[2] - lm[1])
    yaw = (dist_r - dist_l) / (dist_r + dist_l) * 100
    eye_y = (lm[0][1] + lm[1][1]) / 2
    mouth_y = (lm[3][1] + lm[4][1]) / 2
    pitch = (lm[2][1] - eye_y) / (mouth_y - eye_y)
    pitch = (pitch - 0.5) * 100
    return {"yaw": yaw, "pitch": pitch}

@app.route('/upload_face', methods=['POST'])
def upload_face():
    try:
        login_id = request.form.get('login_id', 'unknown_user')
        files = request.files.getlist('image') 
        print(f"--- Register Request Received! login_id: {login_id} ---")
        
        if not files: 
            return jsonify({"error": "No images"}), 400

        results = { "center": None, "left": None, "right": None, "up": None, "down": None }
        for i, file in enumerate(files):
            img = cv2.imdecode(np.frombuffer(file.read(), np.uint8), cv2.IMREAD_COLOR)
            faces = app_face.get(img)
            if not faces: continue
            
            face = sorted(faces, key=lambda x: (x.bbox[2]-x.bbox[0]))[-1]
            info = get_face_info(face, img.shape)
            y, p = info['yaw'], info['pitch']
            
            target = None
            if abs(y) < 15 and abs(p) < 15: target = "center"
            elif y <= -15: target = "left"
            elif y >= 15: target = "right"
            elif p <= -15: target = "up"
            elif p >= 15: target = "down"

            if target and results[target] is None:
                results[target] = face.normed_embedding.tolist()

        if all(results.values()):
            SSAFY_SERVER_URL = "http://i14a104.p.ssafy.io:8080/api/biometric/save-face/"
            payload = {
                "login_id": login_id, 
                "face_vectors": list(results.values())
            }
            response = requests.post(SSAFY_SERVER_URL, json=payload, timeout=15)
            return jsonify(response.json()), response.status_code

        return jsonify({"status": "fail", "message": "Missing directions"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/login_face', methods=['POST'])
def login_face():
    global current_user
    try:
        file = request.files.get('image')
        if not file:
            return jsonify({"success": False, "message": "No image key"}), 400

        img_bytes = file.read()
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        faces = app_face.get(img)
        
        if not faces:
            return jsonify({"success": False, "message": "No face detected"}), 400

        face = sorted(faces, key=lambda x: (x.bbox[2]-x.bbox[0]))[-1]
        login_vector = face.normed_embedding.tolist()

        SSAFY_LOGIN_URL = "http://i14a104.p.ssafy.io:8080/api/login/face/"
        response = requests.post(SSAFY_LOGIN_URL, json={"face_vectors": login_vector}, timeout=10)
        
        if response.status_code != 200:
            return jsonify(response.json() if response.text else {"success": False}), response.status_code

        result = response.json()
        
        current_user["uid"] = result.get('uid')
        
        # 서버에서 돌려준 tokens 추출
        tokens = result.get('tokens')
        
        if result.get('face_vectors') and len(result['face_vectors']) > 0:
            current_user["face_vectors"] = np.array(result['face_vectors'][0], dtype=np.float32)
        else:
            current_user["face_vectors"] = np.array(login_vector, dtype=np.float32)

        save_data = {
            "uid": current_user["uid"],
            "ts": time.time(),
            "face_vectors": current_user["face_vectors"].tolist(),
            "voice_vectors": result.get('voice_vectors')
        }

        _atomic_write_json(CURRENT_USER_PATH, save_data)
        
#        # 서비스 시작 명령 (이미 켜져 있으면 아무 일도 안 함)
#        subprocess.run(["sudo", "systemctl", "start", "sarvis-tracker.service"])
        
        app_response = {
            "success": True,
            "uid": current_user["uid"],
            "nickname": result.get('nickname'),
            "tokens": result.get('tokens'),
            "session_id": result.get("session_id")
        }

        print(f"?? [LOGIN SUCCESS]")
        return jsonify(app_response), 200

    except Exception as e:
        # 로그인 도중 에러가 나도 기존 유저를 지우지 않음 (단순 에러 리턴)
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        gc.collect()

@app.route('/track_user', methods=['POST'])
def track_user():
    global current_user
    
    # 메모리에 유저 정보가 없으면 파일에서 로드 시도
    if current_user["face_vectors"] is None:
        try:
            if CURRENT_USER_PATH.exists():
                with open(CURRENT_USER_PATH, 'r') as f:
                    data = json.load(f)
                    current_user["uid"] = data.get("uid")
                    current_user["face_vectors"] = np.array(data["face_vectors"], dtype=np.float32)
                    current_user["offsets"] = data.get("offsets")
            else:
                return jsonify({"match": False, "message": "No one is logged in"}), 401
        except Exception as e:
            return jsonify({"match": False, "message": "Login data load failed"}), 500

    try:
        file = request.files.get('image')
        if not file: return jsonify({"match": False, "message": "No image"}), 400

        img = cv2.imdecode(np.frombuffer(file.read(), np.uint8), cv2.IMREAD_COLOR)
        faces = app_face.get(img)
        
        target_found = False
        max_sim = 0.0

        for face in faces:
            sim = calculate_similarity(current_user["face_vectors"], face.normed_embedding)
            if sim > max_sim: max_sim = sim
            if sim > 0.5: 
                target_found = True
                break
        
        if target_found:
            print(f"? [MATCH] {current_user['uid']} ({max_sim:.4f})")
            return jsonify({"match": True, "uid": current_user["uid"], "similarity": float(max_sim)}), 200
        else:
            return jsonify({"match": False, "max_sim": float(max_sim)}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/upload_voice', methods=['POST'])
def upload_voice():
    trace_id = get_trace_id(request.headers.get("X-Trace-Id"))
    t0 = time.time()
    try:
        login_id = request.form.get('login_id', '').strip()
        if not login_id:
            return jsonify({"ok": False, "reason": "missing login_id"}), 400

        files = request.files.getlist('voice')
        if len(files) != 4:
            return jsonify({"ok": False, "reason": f"Need 4 files, got {len(files)}"}), 400

        user_dir = VOICE_UPLOAD_ROOT / login_id
        user_dir.mkdir(parents=True, exist_ok=True)

        saved = []
        for i, f in enumerate(files, start=1):
            out_path = user_dir / f"voice_{i}.wav"
            f.save(str(out_path))
            saved.append(str(out_path))

        resp = requests.post(VOICE_PROCESS_URL, json={"login_id": login_id}, timeout=120)
        
        return jsonify({
            "ok": True, 
            "process_status": resp.status_code, 
            "elapsed_ms": (time.time() - t0) * 1000.0
        }), 200

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route('/logout', methods=['POST'])
def logout():
    # 이제 오직 여기서만 파일과 세션이 지워집니다.
    reset_current_user() 
    return jsonify({
        "success": True, 
        "message": "Jetson session cleared and JSON file deleted."
    }), 200
    
# 아이디, 비번 로그인
@app.route('/login_credentials', methods=['POST'])
def login_credentials():
    global current_user
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "message": "No data"}), 400

        # 1. 앱/서버에서 준 값 그대로 추출 (임의 설정 금지!)
        uid = data.get('uid')
        face_vectors = data.get('face_vectors')
        voice_vectors = data.get('voice_vectors')

        if not uid:
            return jsonify({"success": False, "message": "UID is required"}), 400

        # 2. 젯슨 메모리 업데이트 (전달받은 데이터 그대로 반영)
        current_user["uid"] = uid
        if face_vectors and len(face_vectors) > 0:
            current_user["face_vectors"] = np.array(face_vectors[0], dtype=np.float32)
        
        current_user["voice_vectors"] = voice_vectors

        # 3. JSON 파일 생성 (트래커가 즉시 읽어갈 수 있도록)
        save_data = {
            "uid": current_user["uid"],
            "ts": time.time(),
            "face_vectors": current_user["face_vectors"].tolist(),
            "voice_vectors": current_user["voice_vectors"]
        }

        _atomic_write_json(CURRENT_USER_PATH, save_data)
        
        print(f"?? [CREDENTIAL LOGIN] User {uid} session started with server-provided offsets.")
        return jsonify({"success": True}), 200

    except Exception as e:
        print(f"Error in credential login: {e}")
        return jsonify({"success": False, "message": str(e)}), 500
    
@app.route('/update_user_offsets', methods=['POST'], strict_slashes=False)
def update_user_offsets():
    global current_user
    try:
        data = request.get_json()
        uid = data.get('uid')
        offsets = data.get('offsets')
        
        if not uid:
            return jsonify({"success": False, "message": "uid is required"}), 400
        
        # 1. 메모리 및 JSON 복구 로직
        if current_user["uid"] is None and CURRENT_USER_PATH.exists():
            try:
                with open(CURRENT_USER_PATH, 'r') as f:
                    saved = json.load(f)
                    # 파일에서 읽어올 때는 다시 Numpy로 변환해서 메모리에 저장 (인식 속도용)
                    if saved.get("face_vectors"):
                        saved["face_vectors"] = np.array(saved["face_vectors"], dtype=np.float32)
                    current_user.update(saved)
            except Exception as e:
                print(f"Session recovery failed: {e}")

        # 2. 오프셋 업데이트
        current_user["offsets"] = offsets
        
        # ★ [에러 해결 핵심] ★
        # current_user["face_vectors"]가 Numpy 배열(ndarray)인 경우 JSON 저장이 안 되므로 
        # 리스트(.tolist())로 변환하여 임시 변수에 담습니다.
        face_vec_to_save = current_user.get("face_vectors")
        if isinstance(face_vec_to_save, np.ndarray):
            face_vec_to_save = face_vec_to_save.tolist()

        save_data = {
            "uid": uid,
            "ts": time.time(), # 트래커가 감지할 수 있도록 시간 갱신
            "face_vectors": face_vec_to_save, # 반드시 리스트 형태여야 함
            "offsets": offsets,
            "voice_vectors": current_user.get("voice_vectors")
        }
        
        # 3. 파일 저장 (이제 에러 없이 통과됩니다)
        _atomic_write_json(CURRENT_USER_PATH, save_data)
        
        # 4. 라즈베리 파이 제어 함수 호출
        if offsets:
            send_offset_to_rpi(offsets)
            print(f"? [SUCCESS] User {uid} offsets updated and sent to RPi")
        
        return jsonify({"success": True}), 200
        
    except Exception as e:
        # 에러 발생 시 로그 출력
        print(f"? [FATAL ERROR] {e}")
        return jsonify({"success": False, "error": str(e)}), 500
        
# 라즈베리 파이의 제어 엔드포인트 주소
# --- [주소 설정 업데이트] ---
RPI_IP = "172.20.10.7"
RPI_BASE_URL = f"http://{RPI_IP}:5006" 
RPI_CONTROL_URL = f"{RPI_BASE_URL}/hardware/control"
RPI_STATUS_URL = f"{RPI_BASE_URL}/hardware/status"

@app.route('/button_command', methods=['POST'])
def button_command():
    try:
        data = request.get_json()
        command = data.get('command')

        if not command:
            return jsonify({"success": False, "message": "command is required"}), 400

        valid_directions = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'FAR', 'NEAR', 'YAW_RIGHT', 'YAW_LEFT', 'PITCH_UP', 'PITCH_DOWN']
        if command not in valid_directions:
            return jsonify({"success": False, "message": f"Invalid command"}), 400

        try:
            rpi_resp = requests.post(RPI_CONTROL_URL, json={"command": command}, timeout=0.5)
            print(f"?? [BUTTON] Cmd: {command} -> RPi Status: {rpi_resp.status_code}")
        except Exception as e:
            print(f"?? [BUTTON] Failed to reach RPi: {e}")
            return jsonify({"success": False, "message": "Failed to reach RPi"}), 503

        return jsonify({"success": True, "command": command}), 200

    except Exception as e:
        print(f"Error in button command: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


SSAFY_SAVE_OFFSETS_URL = "http://i14a104.p.ssafy.io:8080/api/preset/save/"
SSAFY_VOICE_URL = "http://i14a104.p.ssafy.io:8080/api/control/voice/"

@app.route('/voice_command', methods=['POST'])
def voice_command():
    try:
        data = request.get_json()
        uid = data.get('uid')
        command = data.get('command')
        
        if not command:
            return jsonify({"success": False, "message": "command required"}), 400
        
        # 명령 매핑
        command_map = {
            'TRACK_ON': 'FOLLOW',      # 따라와
            'TRACK_OFF': 'STOP',       # 멈춰 (제자리에 멈춤)
            'COME_HERE': 'COME',       # 이리와
            'HOME': 'HOME'             # 저리가 (홈 위치로)
        }
        
        if command not in command_map:
            return jsonify({"success": False, "message": f"Invalid command: {command}"}), 400
        
        # 라즈베리파이로 명령 전송
        rpi_command = command_map[command]
        
        try:
            rpi_resp = requests.post(
                RPI_CONTROL_URL, 
                json={"command": rpi_command}, 
                timeout=1.0
            )
            
            if rpi_resp.status_code == 200:
                print(f"? [VOICE -> RPI] {command} -> {rpi_command} (Status: {rpi_resp.status_code})")
                return jsonify({"success": True, "command": command, "rpi_command": rpi_command}), 200
            else:
                print(f"? [VOICE -> RPI] Failed: status={rpi_resp.status_code}")
                
                # --- [추가] SSAFY 서버에도 로그/상태 저장 ---
                try:
                    # 저장하고 싶은 데이터를 담아 보냅니다 (예: 명령 내용, 유저 ID 등)
                    ssafy_data = {
                        "uid": uid,
                        "command": command,
                    }
                    # SSAFY_SAVE_OFFSETS_URL 또는 별도의 로그 엔드포인트 호출
                    requests.post(SSAFY_VOICE_URL, json=ssafy_data, timeout=1.0)
                    print(f"? [VOICE -> SSAFY] Log saved to SSAFY server")
                except Exception as ssafy_e:
                    print(f"?? [VOICE -> SSAFY] Failed to log: {ssafy_e}")
                
                return jsonify({"success": False, "message": "RPi returned error"}), 500
                
        except Exception as e:
            print(f"? [VOICE -> RPI] Connection error: {e}")
            return jsonify({"success": False, "message": f"RPi connection failed: {e}"}), 503
        
    except Exception as e:
        print(f"Error in voice_command: {e}")
        return jsonify({"success": False, "error": str(e)}), 500
        
@app.route('/offsets_save', methods=['POST'])
def offsets_save():
    global current_user
    try:
        # 1. 세션 복구 로직 (메모리가 비어있으면 파일에서 즉시 로드)
        if current_user["uid"] is None:
            if CURRENT_USER_PATH.exists():
                with open(CURRENT_USER_PATH, 'r') as f:
                    saved = json.load(f)
                    current_user["uid"] = saved.get("uid")
                    current_user["face_vectors"] = np.array(saved["face_vectors"], dtype=np.float32) if saved.get("face_vectors") else None
                    current_user["offsets"] = saved.get("offsets")
                    current_user["voice_vectors"] = saved.get("voice_vectors")
                    print(f"?? [SESSION RECOVERED] UID: {current_user['uid']}")

        # 2. 로그인 확인
        if not current_user["uid"]:
            print("? [AUTH ERROR] No active session found. Please login first.")
            return jsonify({"success": False, "message": "No login session"}), 401

        # 3. 앱이 보낸 데이터는 무시하고, '현재 로그인된 유저'의 UID를 타겟으로 고정
        target_uid = current_user["uid"]
        print(f"? [PROCEEDING] Saving for logged-in user: {target_uid}")

        # 4. 라즈베리 파이에게 실시간 각도 정보 요청
        try:
            rpi_resp = requests.get(RPI_STATUS_URL, timeout=1.5)
            if rpi_resp.status_code != 200:
                return jsonify({"success": False, "message": "RPi status fetch failed"}), 500
            current_offsets = rpi_resp.json().get("offsets")
        except Exception as e:
            return jsonify({"success": False, "message": f"RPi connection error: {e}"}), 500

        current_user["offsets"] = current_offsets
        save_data = {
            "uid": current_user["uid"],
            "ts": time.time(),
            "face_vectors": current_user["face_vectors"].tolist() if current_user["face_vectors"] is not None else None,
            "offsets": current_offsets,
            "voice_vectors": current_user.get("voice_vectors")
        }
        _atomic_write_json(CURRENT_USER_PATH, save_data)
        print(f"?? [LOCAL SAVE SUCCESS] Offsets updated for {current_user['uid']}")
        
        print(f"? [PROCEEDING] Sending offsets to Backend Server as Response")
        return jsonify({
            "success": True, 
            "offsets": current_offsets,
            "uid": current_user["uid"]
        }), 200

    except Exception as e:
        print(f"?? [FATAL] {e}")
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
