# -*- coding: utf-8 -*-
import cv2
import numpy as np
import socket
import time
from insightface.app import FaceAnalysis

# --- Network Setup ---
RPI_IP = "172.20.10.7"
RPI_PORT = 5005
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

class SarvisFaceTracker:
    def __init__(self):
        # 얼굴 인식 모델 로드 (감지 및 랜드마크 추출)
        self.app = FaceAnalysis(
            name='buffalo_sc',
            providers=['CUDAExecutionProvider', 'CPUExecutionProvider'],
            allowed_modules=['detection', 'landmark'] # recognition 모듈 불필요
        )
        self.app.prepare(ctx_id=0, det_size=(320, 320))
        print("?? Model Loaded: General Face Tracking Mode")

    def get_tracking_data(self, frame):
        # 1. 얼굴 감지
        faces = self.app.get(frame)
        if not faces: 
            return None

        # 2. 타겟 선정 로직: 화면에서 가장 큰 얼굴(가까운 사람)을 주인으로 판단
        # bbox: [x1, y1, x2, y2] -> 면적 = (x2-x1) * (y2-y1)
        target_face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))

        # 3. 좌표 및 각도 계산
        h, w, _ = frame.shape
        center_screen = (w // 2, h // 2)
        lm = target_face.kps # 랜드마크 (Keypoints)
        
        # [X, Y Offset] 화면 중심 대비 코의 위치 (-1.0 ~ 1.0)
        offset_x = (int(lm[2][0]) - center_screen[0]) / (w / 2)
        offset_y = (int(lm[2][1]) - center_screen[1]) / (h / 2)
        
        # [Z Distance] 얼굴 면적 기반 거리 추정
        bbox = target_face.bbox.astype(int)
        face_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        dist_z = ((w * h) / (face_area + 1e-6)) * 0.05
        
        # [Yaw] 좌우 회전 (양쪽 눈과 코의 거리 비율)
        dist_l = np.linalg.norm(lm[2] - lm[0])
        dist_r = np.linalg.norm(lm[2] - lm[1])
        yaw = (dist_r - dist_l) / (dist_r + dist_l + 1e-6) * 100
        
        # [Pitch] 상하 끄덕임 (눈-코 vs 코-입 비율)
        eye_y = (lm[0][1] + lm[1][1]) / 2
        mouth_y = (lm[3][1] + lm[4][1]) / 2
        pitch = ((lm[2][1] - eye_y) / (mouth_y - eye_y + 1e-6) - 0.5) * 100
        
        # 디버깅 출력
        print(f"\r[Target] Area:{face_area:5.0f} | X:{offset_x:+.2f} Y:{offset_y:+.2f} Z:{dist_z:.2f}", end='')
        
        # 데이터 포맷: FACE:X,Y,Z,Yaw,Pitch
        return f"FACE:{offset_x:.3f},{offset_y:.3f},{dist_z:.3f},{yaw:.1f},{pitch:.1f}"

if __name__ == "__main__":
    tracker = SarvisFaceTracker()
    cap = cv2.VideoCapture(0, cv2.CAP_V4L2)
    
    # 카메라 설정 (선택 사항: 성능 최적화를 위해 해상도 제한 가능)
    # cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    # cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    print("?? Jetson Tracker Active. Tracking the largest face...")

    try:
        while True:
            # 1. 카메라 프레임 읽기
            ret, frame = cap.read()
            if not ret: 
                continue
            
            # 2. 데이터 분석 및 생성
            data_string = tracker.get_tracking_data(frame)

            # 3. UDP 전송
            if data_string:
                sock.sendto(data_string.encode(), (RPI_IP, RPI_PORT))
                # print(f" Sent: {data_string}", end='\r') # 상세 로그 필요 시 주석 해제
            else:
                sock.sendto(b"NOFACE", (RPI_IP, RPI_PORT))
                print(f"\rSearching... (NOFACE Sent)       ", end='')
            
            # 루프 속도 제어 (필요 시 조절)
            time.sleep(0.01)

    except KeyboardInterrupt:
        print("\nStop.")
    finally:
        cap.release()
        print("Camera hardware released.")
