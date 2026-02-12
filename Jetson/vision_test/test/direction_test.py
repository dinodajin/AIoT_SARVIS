# -*- coding: utf-8 -*-
import cv2
import numpy as np
import time
from insightface.app import FaceAnalysis

# 모델 초기화 (불필요한 모델 로딩 줄이기 위해 det_size 조정)
app_face = FaceAnalysis(name='buffalo_l', providers=['CUDAExecutionProvider', 'CPUExecutionProvider'])
app_face.prepare(ctx_id=0, det_size=(320, 320))

def get_diagnostic_info(face):
    lm = face.kps  # 특징점: 0=왼쪽눈, 1=오른쪽눈, 2=코
    dist_l = np.linalg.norm(lm[2] - lm[0])
    dist_r = np.linalg.norm(lm[2] - lm[1])
    yaw = (dist_r - dist_l) / (dist_r + dist_l) * 100
    return yaw

cap = cv2.VideoCapture(0)

print("\n" + "="*40)
print("  DIRECTION DIAGNOSTIC TEST (Terminal Only)")
print("="*40)
print("1. Stand still and look at the camera.")
print("2. Slowly turn your head to your ACTUAL RIGHT.")
print("3. Watch the Yaw value below.")
print("Press Ctrl+C to stop.")

try:
    while True:
        ret, frame = cap.read()
        if not ret: break

        faces = app_face.get(frame)
        
        if faces:
            # 가장 큰 얼굴 선택
            face = sorted(faces, key=lambda x: (x.bbox[2]-x.bbox[0]))[-1]
            yaw = get_diagnostic_info(face)
            
            # 방향 판정
            if yaw < -20: 
                direction = "LEFT  [<<<<]"
            elif yaw > 20: 
                direction = "RIGHT [>>>>]"
            else: 
                direction = "CENTER [ -- ]"
            
            # 한 줄에 계속 업데이트 (\r 사용)
            print(f"Current Yaw: {yaw:7.2f} | Status: {direction}", end='\r')
        else:
            print("No face detected...                         ", end='\r')

        time.sleep(0.1) # CPU 부하 감소

except KeyboardInterrupt:
    print("\n\nTest Stopped by user.")
finally:
    cap.release()