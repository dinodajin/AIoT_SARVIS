import cv2
import time
import numpy as np
from insightface.app import FaceAnalysis

app_face = FaceAnalysis(
    name='buffalo_sc', 
    providers=['CUDAExecutionProvider', 'CPUExecutionProvider'],
    allowed_modules=['detection', 'recognition']
)
app_face.prepare(ctx_id=0, det_size=(320, 320))

def get_face_info(face, frame_shape):
    h, w = frame_shape[:2]
    lm = face.kps 
    
    # Yaw 계산 (좌우 회전)
    dist_l = np.linalg.norm(lm[2] - lm[0])
    dist_r = np.linalg.norm(lm[2] - lm[1])
    yaw = (dist_r - dist_l) / (dist_r + dist_l) * 100

    # Pitch 계산 (상하 회전)
    eye_y = (lm[0][1] + lm[1][1]) / 2
    mouth_y = (lm[3][1] + lm[4][1]) / 2
    pitch = (lm[2][1] - eye_y) / (mouth_y - eye_y)
    pitch = (pitch - 0.5) * 100

    face_w = face.bbox[2] - face.bbox[0]
    
    # 가이드 판정 로직
    guide = "OK"
    if face_w < (w * 0.25): 
        guide = "Too Far"
    elif face_w > (w * 0.75): 
        guide = "Too Close"
    
    elif yaw < -40:
        guide = "Look Right"
    elif yaw > 40: 
        guide = "Look Left"
    elif pitch < -30:
        guide = "Look Up"
    elif pitch > 40:
        guide = "Look Down"
    
    return {"yaw": yaw, "pitch": pitch, "guide": guide}