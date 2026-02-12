import cv2
import numpy as np
import os
import time
from insightface.app import FaceAnalysis

# 모델 설정
# GPU 가속을 사용하도록 수정된 코드 부분
# 1. providers에 CUDA 또는 TensorRT를 추가합니다.
# 2. ctx_id=0 (또는 장치 번호)을 지정합니다.

providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] # CUDA 우선 사용
app = FaceAnalysis(name='buffalo_l', providers=providers)
app.prepare(ctx_id=0, det_size=(320, 320))

SAVE_DIR = "./face_db"
os.makedirs(SAVE_DIR, exist_ok=True)

def main():
    name = input("등록할 이름을 입력하세요 (영문): ")
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("카메라를 열 수 없습니다. 연결을 확인하세요.")
        return

    print("카메라를 응시하세요. 3초 뒤 자동으로 분석 및 저장합니다...")
    time.sleep(3)

    ret, frame = cap.read()
    if not ret:
        print("프레임을 읽을 수 없습니다.")
        return

    # 얼굴 분석
    faces = app.get(frame)

    if len(faces) > 0:
        # 가장 큰 얼굴 선택
        face = sorted(faces, key=lambda x: (x.bbox[2]-x.bbox[0])*(x.bbox[3]-x.bbox[1]))[-1]
        
        # 1. 특징점(npy) 저장
        np.save(f"{SAVE_DIR}/{name}.npy", face.normed_embedding)
        
        # 2. 이미지(jpg) 저장 (눈으로 확인용)
        cv2.imwrite(f"{SAVE_DIR}/{name}_test.jpg", frame)
        
        print(f"--- [성공] {name}.npy 와 {name}_test.jpg 가 저장되었습니다! ---")
    else:
        print("얼굴 인식 실패: 카메라에 얼굴이 정확히 나오게 해주세요.")

    cap.release()

if __name__ == "__main__":
    main()