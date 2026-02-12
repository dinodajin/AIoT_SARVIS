import cv2
import numpy as np
import os
import time
import onnxruntime as ort
from insightface.app import FaceAnalysis

# 1. 모델 준비 (TensorRT/CUDA 우선 순위)
# ORT가 인식하는 provider 이름을 기준으로 자동 구성
avail = ort.get_available_providers()
print("🧩 onnxruntime available providers:", avail)

providers = []
#if "TensorrtExecutionProvider" in avail:
#    providers.append("TensorrtExecutionProvider")   # ✅ 정확한 이름
if "CUDAExecutionProvider" in avail:
    providers.append("CUDAExecutionProvider")
providers.append("CPUExecutionProvider")

print("🚀 사용할 provider 우선순위:", providers)

app = FaceAnalysis(name="buffalo_l", providers=providers)

# CUDA/TensorRT가 있으면 GPU(ctx_id=0), 없으면 CPU(ctx_id=-1)
use_gpu = ("CUDAExecutionProvider" in providers) or ("TensorrtExecutionProvider" in providers)
app.prepare(ctx_id=0 if use_gpu else -1, det_size=(320, 320))

# 현재 가속 엔진 확인 출력 (모델별로 providers 출력)
try:
    # InsightFace 내부 모델 세션에서 적용된 provider 확인
    for k, m in app.models.items():
        if hasattr(m, "session"):
            print(f"✅ model[{k}] providers:", m.session.get_providers())
except Exception as e:
    print("⚠️ provider 확인 중 예외(무시 가능):", e)

# 2. 얼굴 DB 로드
SAVE_DIR = "./face_db"
known_faces, known_names = [], []
if os.path.exists(SAVE_DIR):
    for file in os.listdir(SAVE_DIR):
        if file.endswith(".npy"):
            known_names.append(file.replace(".npy", ""))
            known_faces.append(np.load(os.path.join(SAVE_DIR, file)))
print(f"📦 DB 로드 완료: {len(known_names)}명의 데이터")

def main():
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)   # 캡처는 기본(640x480) 유지가 검출 안정적
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    count = 0
    last_status_time = 0.0
    print("🔎 인식을 시작합니다... (Ctrl+C로 종료)")

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("❌ 카메라 프레임을 못 읽음")
                break

            # 성능용 프레임 스킵 (너가 원하면 3 유지, 너무 안 잡히면 2로)
            count += 1
            if count % 3 != 0:
                continue

            faces = app.get(frame)

            now = time.time()
            if len(faces) == 0:
                # 얼굴 없음 로그는 너무 도배되지 않게 1초에 1번만
                if now - last_status_time > 1.0:
                    print("🙅 얼굴 없음")
                    last_status_time = now
                continue

            for face in faces:
                current_emb = face.normed_embedding

                max_sim = 0.0
                name = "Unknown"

                for i, target_emb in enumerate(known_faces):
                    sim = float(np.dot(current_emb, target_emb))
                    if sim > max_sim:
                        max_sim = sim
                        if sim > 0.45:  # 임계값
                            name = known_names[i]

                timestamp = time.strftime("%H:%M:%S")
                if name != "Unknown":
                    print(f"[{timestamp}] ✅ 인식됨 | 이름: {name} | 정확도: {max_sim*100:.2f}%")
                else:
                    print(f"[{timestamp}] ❓ Unknown | 최고 유사도: {max_sim*100:.2f}%")

                last_status_time = now

    except KeyboardInterrupt:
        print("\n👋 프로그램을 종료합니다.")
    finally:
        cap.release()



if __name__ == "__main__":
    main()

