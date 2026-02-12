import cv2
import numpy as np
import os
import sys
from insightface.app import FaceAnalysis

# [강제 주입] 가상환경이 시스템 라이브러리를 무시하지 못하게 합니다.
sys.path.append('/usr/lib/python3.10/dist-packages')

# 젯슨 전용 TensorRT 설정
providers = [
    ('TensorRTExecutionProvider', {
        'device_id': 0,
        'trt_fp16_enable': True,
        'trt_max_workspace_size': 2147483648,
        'trt_engine_cache_enable': True,
        'trt_engine_cache_path': './trt_cache'
    }),
    'CPUExecutionProvider'
]

print("--- 🚀 젯슨 GPU(TensorRT) 엔진 최적화 로드 시도 ---")
app = FaceAnalysis(name='antelopev2', providers=providers)
app.prepare(ctx_id=0, det_size=(320, 320))

def main():
    cap = cv2.VideoCapture(0)
    # 화면 에러 방지를 위해 GUI 지원 확인
    if not cap.isOpened():
        print("카메라를 찾을 수 없습니다.")
        return

    while True:
        ret, frame = cap.read()
        if not ret: break

        # GPU 가속이 적용된 분석
        faces = app.get(frame)

        for face in faces:
            bbox = face.bbox.astype(int)
            cv2.rectangle(frame, (bbox[0], bbox[1]), (bbox[2], bbox[3]), (0, 255, 0), 2)

        cv2.imshow('Jetson_Real_GPU_Test', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'): break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()