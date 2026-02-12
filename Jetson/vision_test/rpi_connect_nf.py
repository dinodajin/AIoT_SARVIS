# -*- coding: utf-8 -*-
import cv2
import numpy as np
import socket
import json
import time
from pathlib import Path
from insightface.app import FaceAnalysis

# --- Network Setup ---
RPI_IP = "70.12.245.103" 
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
        self.last_ts = 0  # 추가: 파일 갱신 확인용

    def handle_login_and_move_hardware(self):
        if not CURRENT_USER_PATH.exists():
            if self.last_sent_uid is not None:
                print("\n[LOGOUT] User file removed.")
                self.last_sent_uid = None
                self.target_vector = None
                self.last_ts = 0
            return

        try:
            with open(CURRENT_USER_PATH, 'r') as f:
                data = json.load(f)
                uid = data.get("uid")
                new_ts = data.get("ts", 0) # Flask에서 갱신한 시간
                
                # UID가 바뀌었거나, 오프셋이 새로 업데이트(ts 갱신)된 경우 실행
                if uid != self.last_sent_uid or new_ts > self.last_ts:
                    print(f"\n[USER UPDATE] UID: {uid} (TS: {new_ts})")
                    self.last_sent_uid = uid
                    self.last_ts = new_ts
                    
                    vec = data.get("face_vectors")
                    if vec:
                        # 리스트 구조 대응
                        self.target_vector = np.array(vec[0] if isinstance(vec, list) and len(vec)>0 else vec, dtype=np.float32)
                    
                    off = data.get("offsets")
                    if off:
                        offset_msg = f"OFFSET:{off['servo1']},{off['servo2']},{off['servo3']},{off['servo4']},{off['servo5']},{off['servo6']}"
                        sock.sendto(offset_msg.encode(), (RPI_IP, RPI_PORT))
                        print(f"?? [HARDWARE MOVE] Sent Offset: {offset_msg}")
                        time.sleep(0.8) 
        except Exception as e:
            print(f"Login sync error: {e}")

    def get_tracking_data(self, frame):
        if self.target_vector is None:
            return None

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

        if target_face is None:
            return None

        h, w, _ = frame.shape
        center_screen = (w // 2, h // 2)
        lm = target_face.kps
        
        # 코 위치(lm[2]) 기반 오프셋 계산
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
        
        return f"DAT:{offset_x:.3f},{offset_y:.3f},{dist_z:.3f},{yaw:.1f},{pitch:.1f}"

if __name__ == "__main__":
    tracker = SarvisFaceTracker()
    cap = cv2.VideoCapture(0, cv2.CAP_V4L2)

    print("?? Jetson Tracker Active (Headless Mode)...")

    try:
        while True:
            tracker.handle_login_and_move_hardware()

            ret, frame = cap.read()
            if not ret: continue
            
            data_string = tracker.get_tracking_data(frame)

            if data_string:
                sock.sendto(data_string.encode(), (RPI_IP, RPI_PORT))
                print(f"Tracking: {data_string}", end='\r')
            else:
                sock.sendto(b"FACE:0.000,0.000,0.000,0.0,0.0", (RPI_IP, RPI_PORT))
                print(f"Searching for target...          ", end='\r')

    except KeyboardInterrupt:
        print("\nStop.")
    finally:
        cap.release()