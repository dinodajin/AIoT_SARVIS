# -*- coding: utf-8 -*-
import cv2
import numpy as np
import socket
import json
import time
import os
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
        # detection + recognition 모델 로드
        self.app = FaceAnalysis(
            name='buffalo_sc',
            providers=['CUDAExecutionProvider', 'CPUExecutionProvider'],
            allowed_modules=['detection', 'recognition']
        )
        self.app.prepare(ctx_id=0, det_size=(320, 320))
        
        self.last_sent_uid = None 
        self.target_vector = None
        self.target_name = "Unknown"

    def handle_login_and_move_hardware(self):
        if not CURRENT_USER_PATH.exists():
            if self.last_sent_uid is not None:
                print("\n[LOGOUT] User file removed.")
                self.last_sent_uid = None
                self.target_vector = None
                self.target_name = "Unknown"
            return

        try:
            with open(CURRENT_USER_PATH, 'r') as f:
                data = json.load(f)
                uid = data.get("uid")
                
                if uid != self.last_sent_uid:
                    print(f"\n[NEW LOGIN] UID: {uid}")
                    self.last_sent_uid = uid
                    self.target_name = data.get("name", data.get("login_id", f"User_{uid[:4]}"))
                    
                    vec = data.get("face_vectors")
                    if vec:
                        self.target_vector = np.array(vec, dtype=np.float32)
                    
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

        # --- 5D 데이터 계산 로직 ---
        h, w, _ = frame.shape
        center_screen = (w // 2, h // 2)
        lm = target_face.kps
        bbox = target_face.bbox.astype(int)
        
        nose_x, nose_y = int(lm[2][0]), int(lm[2][1])
        offset_x = (nose_x - center_screen[0]) / (w / 2)
        offset_y = (nose_y - center_screen[1]) / (h / 2)
        
        face_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        dist_z = ((w * h) / (face_area + 1e-6)) * 0.05
        
        dist_l = np.linalg.norm(lm[2] - lm[0])
        dist_r = np.linalg.norm(lm[2] - lm[1])
        yaw = (dist_r - dist_l) / (dist_r + dist_l + 1e-6) * 100
        
        eye_y = (lm[0][1] + lm[1][1]) / 2
        mouth_y = (lm[3][1] + lm[4][1]) / 2
        pitch = ((lm[2][1] - eye_y) / (mouth_y - eye_y + 1e-6) - 0.5) * 100
        
        return {
            "data_str": f"FACE:{offset_x:.3f},{offset_y:.3f},{dist_z:.3f},{yaw:.1f},{pitch:.1f}",
            "nose": (nose_x, nose_y),
            "offset": (offset_x, offset_y),
            "dist_z": dist_z,
            "yaw": yaw,
            "pitch": pitch,
            "bbox": bbox
        }

if __name__ == "__main__":
    tracker = SarvisFaceTracker()
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    print("?? Sarvis 5D Visual Tracker Active...")

    try:
        while True:
            tracker.handle_login_and_move_hardware()
            ret, frame = cap.read()
            if not ret: continue
            
            frame = cv2.flip(frame, 1) # 거울 모드
            h, w, _ = frame.shape
            
            # 화면 중앙 십자선 (가이드)
            cv2.line(frame, (w//2, 0), (w//2, h), (80, 80, 80), 1)
            cv2.line(frame, (0, h//2), (w, h//2), (80, 80, 80), 1)

            res = tracker.get_tracking_data(frame)

            if res:
                # 1. 라즈베리 파이로 데이터 전송
                sock.sendto(res['data_str'].encode(), (RPI_IP, RPI_PORT))
                
                # 2. 시각화 (박스, 코 빨간점, 연결선)
                bbox = res['bbox']
                nose = res['nose']
                cv2.rectangle(frame, (bbox[0], bbox[1]), (bbox[2], bbox[3]), (0, 255, 0), 1)
                cv2.circle(frame, nose, 5, (0, 0, 255), -1)
                cv2.line(frame, (w//2, h//2), nose, (0, 255, 255), 2) # 중앙-코 연결선
                
                # 3. 텍스트 정보 표시
                label = f"TARGET: {tracker.target_name}"
                cv2.putText(frame, label, (bbox[0], bbox[1] - 10), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                
                cv2.putText(frame, f"X: {res['offset'][0]:.2f} Y: {res['offset'][1]:.2f}", (20, 30), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                cv2.putText(frame, f"Dist(Z): {res['dist_z']:.2f}", (20, 60), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 200, 0), 2)
                
                print(f"Tracking: {res['data_str']}", end='\r')
            else:
                sock.sendto(b"FACE:0.000,0.000,0.000,0.0,0.0", (RPI_IP, RPI_PORT))
                cv2.putText(frame, "SEARCHING TARGET...", (w//2-100, h-30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

            # 결과 화면 출력
            cv2.imshow("Sarvis 5D Tracker", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    except KeyboardInterrupt:
        print("\nStop.")
    finally:
        cap.release()
        cv2.destroyAllWindows()