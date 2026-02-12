# -*- coding: utf-8 -*-
import cv2
import numpy as np
import socket
import time
from insightface.app import FaceAnalysis

# --- Network Setup ---
# 라즈베리 파이의 실제 IP 주소로 수정되어 있는지 반드시 확인하세요.
RPI_IP = "172.20.10.7" 
RPI_PORT = 5007  # 수신부와 일치시킨 포트
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

class SarvisStandaloneTracker:
    def __init__(self):
        print(">> [INIT] Loading InsightFace Model... (buffalo_sc)")
        self.app = FaceAnalysis(
            name='buffalo_sc',
            providers=['CUDAExecutionProvider', 'CPUExecutionProvider'],
            allowed_modules=['detection'] # 속도를 위해 detection만 사용
        )
        self.app.prepare(ctx_id=0, det_size=(320, 320))
        print(">> [INIT] Model Loaded.")

    def send_initial_offset(self):
        """하드웨어 초기화를 위한 기본 오프셋 전송"""
        default_offset_msg = "OFFSET:90.0,130.0,0.0,40.0,90.0,100.0"
        sock.sendto(default_offset_msg.encode(), (RPI_IP, RPI_PORT))
        print(f">> [HARDWARE] Sent Default Pose: {default_offset_msg}")
        time.sleep(1.0)

    def get_tracking_data(self, frame):
        faces = self.app.get(frame)
        if not faces: 
            return None

        # 화면에서 가장 큰 얼굴 선정
        target_face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))

        h, w, _ = frame.shape
        center_screen = (w // 2, h // 2)
        lm = target_face.kps # Keypoints
        
        # 1. 화면 중앙 대비 오프셋 (X, Y)
        offset_x = (int(lm[2][0]) - center_screen[0]) / (w / 2)
        offset_y = (int(lm[2][1]) - center_screen[1]) / (h / 2)
        
        # 2. 얼굴 면적 기반 Z 거리 추정
        bbox = target_face.bbox.astype(int)
        face_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        dist_z = ((w * h) / (face_area + 1e-6)) * 0.05
        
        # 3. Yaw/Pitch (얼굴 각도) 계산
        dist_l = np.linalg.norm(lm[2] - lm[0])
        dist_r = np.linalg.norm(lm[2] - lm[1])
        yaw = (dist_r - dist_l) / (dist_r + dist_l + 1e-6) * 100
        
        eye_y = (lm[0][1] + lm[1][1]) / 2
        mouth_y = (lm[3][1] + lm[4][1]) / 2
        pitch = ((lm[2][1] - eye_y) / (mouth_y - eye_y + 1e-6) - 0.5) * 100
        
        # 디버그 출력
        print(f"\r[Target] X:{offset_x:+.2f} Y:{offset_y:+.2f} Z:{dist_z:.2f} Yaw:{yaw:+.1f} Pitch:{pitch:+.1f}   ", end='')
        
        # [수정] 헤더를 'DAT:'로 통일
        return f"DAT:{offset_x:.3f},{offset_y:.3f},{dist_z:.3f},{yaw:.1f},{pitch:.1f}"

if __name__ == "__main__":
    try:
        tracker = SarvisStandaloneTracker()
        cap = cv2.VideoCapture(0) # 카메라 인덱스 확인 필요
        
        if not cap.isOpened():
            print("\n!! [ERROR] Camera not found.")
            exit()

        print("\n>> [READY] Sending data to Port 5007...")
        tracker.send_initial_offset()

        while True:
            ret, frame = cap.read()
            if not ret: break
            
            data_string = tracker.get_tracking_data(frame)

            if data_string:
                sock.sendto(data_string.encode(), (RPI_IP, RPI_PORT))
            else:
                sock.sendto(b"NOFACE", (RPI_IP, RPI_PORT))
                print(f"\r[Searching] Waiting for face...                   ", end='')

    except KeyboardInterrupt:
        print("\n\n>> [STOP] Terminating tracker.")
    finally:
        if 'cap' in locals(): cap.release()
