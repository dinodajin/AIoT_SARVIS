# -*- coding: utf-8 -*-
import cv2
import numpy as np
import socket
import time
from insightface.app import FaceAnalysis

# --- 설정 ---
RPI_IP = "172.20.10.7"
RPI_PORT = 5005
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

# [핵심] Jetson CSI 카메라용 GStreamer 파이프라인 문자열 생성 함수
def gstreamer_pipeline(
    sensor_id=0,
    capture_width=1280,
    capture_height=720,
    display_width=640,
    display_height=480,
    framerate=30,
    flip_method=0,
):
    return (
        "nvarguscamerasrc sensor-id=%d ! "
        "video/x-raw(memory:NVMM), width=(int)%d, height=(int)%d, format=(string)NV12, framerate=(fraction)%d/1 ! "
        "nvvidconv flip-method=%d ! "
        "video/x-raw, width=(int)%d, height=(int)%d, format=(string)BGRx ! "
        "videoconvert ! "
        "video/x-raw, format=(string)BGR ! appsink"
        % (
            sensor_id,
            capture_width,
            capture_height,
            framerate,
            flip_method,
            display_width,
            display_height,
        )
    )

class SarvisFaceTracker:
    def __init__(self):
        # 속도를 위해 detection 모듈만 로드 & 해상도 640x640 (인식률 확보)
        self.app = FaceAnalysis(
            name='buffalo_sc',
            providers=['CUDAExecutionProvider', 'CPUExecutionProvider'],
            allowed_modules=['detection']
        )
        self.app.prepare(ctx_id=0, det_size=(640, 640))
        print(">> InsightFace: Model Loaded.")

    def get_tracking_data(self, frame):
        # BGR -> RGB 변환 (인식률 향상)
        img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        faces = self.app.get(img_rgb)
        
        if not faces: return None

        # 가장 큰 얼굴(가장 가까운 사람) 선택
        target_face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))

        h, w, _ = frame.shape
        center_screen = (w // 2, h // 2)
        lm = target_face.kps
        
        # 좌표 계산
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
        
        print(f"Target: {int(face_area)}px | X:{offset_x:.2f} Y:{offset_y:.2f} Z:{dist_z:.2f}       ", end='\r')
        return f"FACE:{offset_x:.3f},{offset_y:.3f},{dist_z:.3f},{yaw:.1f},{pitch:.1f}"

if __name__ == "__main__":
    tracker = SarvisFaceTracker()
    
    # ---------------------------------------------------------
    # [카메라 연결 시도 로직]
    # ---------------------------------------------------------
    cap = None
    
    # 1. CSI 카메라 (GStreamer) 시도
    print("Trying CSI Camera (GStreamer)...")
    try:
        cap = cv2.VideoCapture(gstreamer_pipeline(flip_method=0), cv2.CAP_GSTREAMER)
    except Exception as e:
        print(f"GStreamer Error: {e}")

    # 2. CSI 실패 시 USB 카메라 (V4L2) 시도
    if not cap or not cap.isOpened():
        print("CSI failed. Trying USB Camera (/dev/video0)...")
        cap = cv2.VideoCapture(0, cv2.CAP_V4L2)
    
    # 3. video0 실패 시 video1 시도
    if not cap or not cap.isOpened():
        print("video0 failed. Trying USB Camera (/dev/video1)...")
        cap = cv2.VideoCapture(1, cv2.CAP_V4L2)

    # 최종 확인
    if not cap or not cap.isOpened():
        print("\n🚨 CRITICAL ERROR: Could not open any camera!")
        print("Check hardware connection and verify 'ls -l /dev/video*' again.")
        exit()

    print("\n✅ Camera Opened Successfully! Starting Loop...")
    
    # 해상도 설정 (USB 카메라일 경우에만 적용됨)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    try:
        while True:
            ret, frame = cap.read()
            if not ret: 
                print("Failed to grab frame (ret=False)")
                time.sleep(1)
                continue
            
            data_string = tracker.get_tracking_data(frame)

            if data_string:
                sock.sendto(data_string.encode(), (RPI_IP, RPI_PORT))
            else:
                sock.sendto(b"NOFACE", (RPI_IP, RPI_PORT))
                print(f"Searching... (NOFACE)                    ", end='\r')
            
            time.sleep(0.01)

    except KeyboardInterrupt:
        print("\nStop.")
    finally:
        if cap: cap.release()
        cv2.destroyAllWindows()
