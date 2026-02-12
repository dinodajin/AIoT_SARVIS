# -*- coding: utf-8 -*-
import cv2
import requests
import time
import numpy as np
from pathlib import Path

# --- 설정 ---
SERVER_URL = "http://127.0.0.1:5000/track_user"
# Flask 서버가 공유하는 로그인 파일 경로
CURRENT_USER_PATH = Path("/run/sarvis/current_user.json")

def get_camera():
    print("Checking for camera on /dev/video0...")
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Video0 failed. Trying /dev/video1...")
        cap = cv2.VideoCapture(1)
    if not cap.isOpened():
        return None
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    return cap

cap = get_camera()
if cap is None:
    print("? Error: Camera not found.")
    exit(1)

print("?? Jetson Camera Service is Running...")
print("Waiting for user login...")

try:
    while True:
        # 1. 로그인 상태 확인 (파일이 있는지 체크)
        if not CURRENT_USER_PATH.exists():
            # 로그인 안 되어 있으면 카메라만 열어두고 대기
            # (CPU 점유율을 낮추기 위해 길게 쉽니다)
            time.sleep(1)
            continue

        # 2. 로그인 파일이 있다면 카메라 프레임 읽기
        ret, frame = cap.read()
        if not ret:
            time.sleep(0.1)
            continue

        # 3. 서버로 전송
        _, img_encoded = cv2.imencode('.jpg', frame)
        files = {'image': ('frame.jpg', img_encoded.tobytes(), 'image/jpeg')}
        
        try:
            response = requests.post(SERVER_URL, files=files, timeout=1)
            if response.status_code == 200:
                result = response.json()
                if result.get("match"):
                    print(f"? [TRACKING] User: {result.get('uid')} (Sim: {result.get('similarity', 0):.2f})")
                else:
                    print(f"? [MISS] Unknown person detected.")
            elif response.status_code == 401:
                print("?? Session expired. Waiting for next login...")
                time.sleep(1)
        except Exception as e:
            print(f"?? Server Connection Busy...")
            time.sleep(0.5)

        time.sleep(0.3) # 전송 주기

except KeyboardInterrupt:
    print("\n?? Stopping...")
finally:
    cap.release()