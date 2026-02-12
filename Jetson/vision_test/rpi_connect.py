# -*- coding: utf-8 -*-
import cv2
import numpy as np
import socket
import json
import time
from pathlib import Path
from insightface.app import FaceAnalysis

# --- Network Setup ---
RPI_IP = "172.20.10.7"
RPI_PORT = 5005
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

# --- Path Setup ---
CURRENT_USER_PATH = Path("/run/sarvis/current_user.json")

class SarvisFaceTracker:
    def __init__(self):
        self.app = FaceAnalysis(
            name='buffalo_sc',
            providers=['CUDAExecutionProvider', 'CPUExecutionProvider'],
            allowed_modules=['detection', 'recognition']
        )
        self.app.prepare(ctx_id=0, det_size=(320, 320))
        
        self.last_sent_uid = None 
        self.target_vector = None
        self.missing_file_start_time = None

    def handle_login_and_move_hardware(self):
        if not CURRENT_USER_PATH.exists():
            # 파일이 처음 사라진 시점을 기록
            if self.missing_file_start_time is None:
                self.missing_file_start_time = time.time()
            
            # 3초 이상 계속 파일이 없을 때만 진짜 로그아웃 처리
            if time.time() - self.missing_file_start_time > 3.0:
                if self.last_sent_uid is not None:
                    print("\n[LOGOUT] User file removed definitively.")
                    self.last_sent_uid = None
                    self.target_vector = None
            return

        # 파일이 다시 나타나면 실종 시간 초기화
        self.missing_file_start_time = None

        try:
            with open(CURRENT_USER_PATH, 'r') as f:
                data = json.load(f)
                uid = data.get("uid")
                
                if uid != self.last_sent_uid:
                    print(f"\n[NEW LOGIN] UID: {uid}")
                    self.last_sent_uid = uid
                    
                    vec = data.get("face_vectors")
                    if vec:
                        self.target_vector = np.array(vec, dtype=np.float32)
                    
                    # [OFFSET 전송]
                    off = data.get("offsets")
                    if off:
                        # 예: OFFSET:0.0,5.0,-2.0,0.0,0.0,0.0
                        offset_msg = f"OFFSET:{off['servo1']},{off['servo2']},{off['servo3']},{off['servo4']},{off['servo5']},{off['servo6']}"
                        sock.sendto(offset_msg.encode(), (RPI_IP, RPI_PORT))
                        print(f"?? [HARDWARE] Sent Offset Calibration: {offset_msg}")
                        time.sleep(0.5) 
        except Exception as e:
            print(f"Login sync error: {e}")

    def get_tracking_data(self, frame):
        if self.target_vector is None: return None

        faces = self.app.get(frame)
        if not faces: return None

        target_face = None
        max_sim = -1.0

        for face in faces:
            sim = np.dot(self.target_vector, face.normed_embedding) / (
                np.linalg.norm(self.target_vector) * np.linalg.norm(face.normed_embedding) + 1e-6
            )
            if sim > 0.45 and sim > max_sim:
                max_sim = sim
                target_face = face

        if target_face is None: return None

        h, w, _ = frame.shape
        center_screen = (w // 2, h // 2)
        lm = target_face.kps
        
        offset_x = (int(lm[2][0]) - center_screen[0]) / (w / 2)
        offset_y = (int(lm[2][1]) - center_screen[1]) / (h / 2)
        
        bbox = target_face.bbox.astype(int)
        face_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        dist_z = ((w * h) / (face_area + 1e-6)) * 0.05
        
        dist_l = np.linalg.norm(lm[2] - lm[0])
        dist_r = np.linalg.norm(lm[2] - lm[1])
        yaw = (dist_r - dist_l) / (dist_r + dist_l + 1e-6) * 100
        
        eye_y = (lm[0][1] + lm[1][1]) / 2
        mouth_y = (lm[3][1] + lm[4][1]) / 2
        pitch = ((lm[2][1] - eye_y) / (mouth_y - eye_y + 1e-6) - 0.5) * 100
        
        print(f"\r[Nose Pos] X: {offset_x:+.3f} | Y: {offset_y:+.3f} | Z: {dist_z:.3f}", end='')
        
        return f"FACE:{offset_x:.3f},{offset_y:.3f},{dist_z:.3f},{yaw:.1f},{pitch:.1f}"

if __name__ == "__main__":
    tracker = SarvisFaceTracker()
    cap = cv2.VideoCapture(0, cv2.CAP_V4L2)

    print("?? Jetson Tracker Active. Waiting for target...")

    try:
        while True:
            # 1. 로그인 체크 및 OFFSET 전송
            tracker.handle_login_and_move_hardware()
            
            if tracker.target_vector is None:
                # print("Waiting for login...", end='\r')
                time.sleep(1) 
                break # 아래 카메라 read 로직을 건너뜀

            # 2. 카메라 프레임 읽기
            ret, frame = cap.read()
            if not ret: continue
            
            # 3. 데이터 전송 로직
            data_string = tracker.get_tracking_data(frame)

            if data_string:
                # [CASE 1] 얼굴 감지됨 -> FACE 데이터 전송
                sock.sendto(data_string.encode(), (RPI_IP, RPI_PORT))
                print(f"Tracking: {data_string}", end='\r')
            else:
                # [CASE 2] 얼굴 없음 -> NOFACE 신호 전송 (수정됨)
                sock.sendto(b"NOFACE", (RPI_IP, RPI_PORT))
                print(f"Searching... (NOFACE Sent)       ", end='\r')
            
            time.sleep(0.01)

    except KeyboardInterrupt:
        print("\nStop.")
    finally:
        cap.release()
        cv2.destroyAllWindows()
        print("Camera hardware released successfully.")
