# -*- coding: utf-8 -*-
import cv2
import numpy as np
import socket
import os
from insightface.app import FaceAnalysis

# --- 통신 설정 ---
RPI_IP = "70.12.245.103" # 라즈베리 파이의 고정 IP (환경에 맞게 수정)
RPI_PORT = 5005
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM) # UDP 통신

class SarvisFaceTracker:
    def __init__(self):
        self.app = FaceAnalysis(
            name='buffalo_sc',
            providers=['CUDAExecutionProvider', 'CPUExecutionProvider'],
            allowed_modules=['detection']
        )
        self.app.prepare(ctx_id=0, det_size=(320, 320))

    def get_tracking_data(self, frame):
        h, w, _ = frame.shape
        center_screen = (w // 2, h // 2)
        faces = self.app.get(frame)
        if not faces: return None

        face = min(faces, key=lambda x: np.linalg.norm(
            ((x.bbox[0] + x.bbox[2])/2 - center_screen[0], 
             (x.bbox[1] + x.bbox[3])/2 - center_screen[1])
        ))

        lm = face.kps
        offset_x = (int(lm[2][0]) - center_screen[0]) / (w / 2)
        offset_y = (int(lm[2][1]) - center_screen[1]) / (h / 2)
        
        bbox = face.bbox.astype(int)
        face_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        dist_z = ((w * h) / (face_area + 1e-6)) * 0.05
        
        dist_l = np.linalg.norm(lm[2] - lm[0])
        dist_r = np.linalg.norm(lm[2] - lm[1])
        yaw = (dist_r - dist_l) / (dist_r + dist_l) * 100
        
        eye_y = (lm[0][1] + lm[1][1]) / 2
        mouth_y = (lm[3][1] + lm[4][1]) / 2
        pitch = (lm[2][1] - eye_y) / (mouth_y - eye_y + 1e-6)
        pitch = (pitch - 0.5) * 100
        
        # 소수점 3자리까지 정제
        return f"{offset_x:.3f},{offset_y:.3f},{dist_z:.3f},{yaw:.1f},{pitch:.1f}"

if __name__ == "__main__":
    tracker = SarvisFaceTracker()
    cap = cv2.VideoCapture(0)

    print(f"Sending data to Raspberry Pi at {RPI_IP}:{RPI_PORT}...")

    try:
        # 젯슨 코드 마지막 루프 부분 수정
        while True:
            ret, frame = cap.read()
            if not ret: break
            
            data_string = tracker.get_tracking_data(frame)

            if data_string:
                sock.sendto(data_string.encode(), (RPI_IP, RPI_PORT))
                print(f"SENT (Face): {data_string}", end='\r')
            else:
                # 얼굴이 안 보여도 통신 테스트를 위해 '0' 데이터를 보냄
                debug_msg = "0.000,0.000,0.000,0.0,0.0"
                sock.sendto(debug_msg.encode(), (RPI_IP, RPI_PORT))
                print(f"SENT (No Face): {debug_msg}", end='\r')

    except KeyboardInterrupt:
        print("\nExit.")
    finally:
        cap.release()