# -*- coding: utf-8 -*-
from flask import Flask, request, jsonify
import cv2
import numpy as np
import gc
import requests  # 서버 전송을 위해 추가
from insightface.app import FaceAnalysis

# 1. 모델 초기화
app_face = FaceAnalysis(
    name='buffalo_sc', 
    providers=['CUDAExecutionProvider', 'CPUExecutionProvider'],
    allowed_modules=['detection', 'recognition']
)
app_face.prepare(ctx_id=0, det_size=(320, 320))

app = Flask(__name__)

def get_face_info(face, frame_shape):
    # 얼굴 랜드마크 기반 각도 추정
    lm = face.kps 
    dist_l = np.linalg.norm(lm[2] - lm[0])
    dist_r = np.linalg.norm(lm[2] - lm[1])
    yaw = (dist_r - dist_l) / (dist_r + dist_l) * 100
    
    eye_y = (lm[0][1] + lm[1][1]) / 2
    mouth_y = (lm[3][1] + lm[4][1]) / 2
    pitch = (lm[2][1] - eye_y) / (mouth_y - eye_y)
    pitch = (pitch - 0.5) * 100
    return {"yaw": yaw, "pitch": pitch}

@app.route('/upload_face', methods=['POST'])
def upload_face():
    try:
        uid = request.form.get('uid', 'unknown_user')
        files = request.files.getlist('image') 
        
        if not files:
            print("[!] No images received.")
            return jsonify({"error": "No images"}), 400

        results = { "center": None, "left": None, "right": None, "up": None, "down": None }

        print("\n" + "="*50)
        print(f"🚀 Processing UID: {uid}")
        print("="*50)

        for i, file in enumerate(files):
            file_bytes = np.frombuffer(file.read(), np.uint8)
            img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
            if img is None:
                continue

            faces = app_face.get(img)
            if not faces:
                print(f"❌ Image {i+1}: No face")
                continue

            face = sorted(faces, key=lambda x: (x.bbox[2]-x.bbox[0]))[-1]
            info = get_face_info(face, img.shape)
            y, p = info['yaw'], info['pitch']

            print(f"DEBUG: Image {i+1} - Yaw: {y:.1f}, Pitch: {p:.1f}")

            target = None
            if abs(y) < 15 and abs(p) < 15: target = "center"
            elif y <= -15: target = "left"
            elif y >= 15: target = "right"
            elif p <= -15: target = "up"
            elif p >= 15: target = "down"

            if target and results[target] is None:
                results[target] = face.normed_embedding.tolist()
                print(f"✅ Auto-Detected: {target.upper()}")
            
            del img
            gc.collect()

        # 6. 최종 결과 확인 및 서버 전송
        captured_angles = [k for k, v in results.items() if v is not None]
        if len(captured_angles) == 5:
            print(f"🎉 All angles success for {uid}!")
            
            # 정해진 순서대로 리스트 생성 (Center, Left, Right, Up, Down)
            ordered_embeddings = [
                results['center'], 
                results['left'], 
                results['right'], 
                results['up'], 
                results['down']
            ]
            
            # --- 싸피 서버 전송 구간 ---
            # 실제 싸피 서버의 엔드포인트 주소
            SSAFY_SERVER_URL = "http://i14a104.p.ssafy.io:8080/api/biometric/save-face/"
            
            payload = {
                # todo : uid 수정!!!!!!!!!!!
                "uid": "a21334ea-a691-47be-8458-8af5d1905ac7",
                # todo : face_vectors로 변경
                "face_vector": ordered_embeddings  # 서버 요구 필드명에 맞춰 face_vectors로 설정
            }

            try:
                # 서버로 데이터 쏘기
                response = requests.post(SSAFY_SERVER_URL, json=payload, timeout=15)
                
                if response.status_code in [200, 201]:
                    print(f"🚀 [SUCCESS] Embeddings sent to SSAFY server for {uid}")
                    return jsonify({"status": "success", "message": "Registered successfully", "uid": uid}), 200
                else:
                    print(f"⚠️ [SERVER ERROR] Status: {response.status_code}, Msg: {response.text}")
                    return jsonify({"status": "partial_success", "message": "Embedded but failed to save to server"}), 500
            
            except Exception as e:
                print(f"❌ [CONNECTION ERROR] Failed to reach SSAFY server: {e}")
                return jsonify({"status": "error", "message": "Server connection failed"}), 500
            # ------------------------

        else:
            missing = [k for k, v in results.items() if v is None]
            print(f"⚠️ Missing: {missing}")
            return jsonify({"status": "fail", "missing": missing}), 400

    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({"error": str(e)}), 500

# --- [신규] 로그인용 엔드포인트 ---
@app.route('/login_face', methods=['POST'])
def login_face():
    try:
        file = request.files.get('image') # 로그인용은 보통 사진 1장
        if not file:
            return jsonify({"success": False, "message": "No image received"}), 400

        # 1. 이미지 디코딩 및 분석
        file_bytes = np.frombuffer(file.read(), np.uint8)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        if img is None:
            return jsonify({"success": False, "message": "Invalid image"}), 400

        faces = app_face.get(img)
        if not faces:
            print("❌ Login Attempt: No face detected")
            return jsonify({"success": False, "message": "No face detected"}), 400

        # 2. 가장 큰 얼굴 선택 및 임베딩 추출
        face = sorted(faces, key=lambda x: (x.bbox[2]-x.bbox[0]))[-1]
        
        # [옵션] 정면인지 확인 (백엔드에서 정면 벡터와 비교하므로 정면일 때만 보내는 게 좋음)
        info = get_face_info(face, img.shape)
        if abs(info['yaw']) > 15 or abs(info['pitch']) > 15:
            print(f"⚠️ Login Warning: Not a straight face (Yaw: {info['yaw']:.1f})")
            # 필요하다면 여기서 return 에러를 줄 수도 있습니다.

        login_vector = face.normed_embedding.tolist()

        # 3. 싸피 서버로 로그인 요청 전송
        # 백엔드 URLconf에 정의된 주소로 설정 (예: api/login/face/)
        SSAFY_LOGIN_URL = "http://i14a104.p.ssafy.io:8080/api/login/face/"
        
        payload = {
            "face_vector": login_vector  # 백엔드 input_vector = request.data.get('face_vector') 대응
        }

        print(f"📡 Sending face vector to SSAFY login server...")
        response = requests.post(SSAFY_LOGIN_URL, json=payload, timeout=10)

        # 4. 결과 반환
        if response.status_code == 200:
            result = response.json()
            print(f"🎉 [LOGIN SUCCESS] User: {result.get('nickname')} (Sim: {result.get('similarity'):.2f})")
            return jsonify(result), 200
        else:
            print(f"❌ [LOGIN FAILED] Status: {response.status_code}, Msg: {response.text}")
            return jsonify(response.json()), response.status_code

    except Exception as e:
        print(f"❌ Login Error: {e}")
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        gc.collect()

if __name__ == '__main__':
    app.run(host='10.42.0.1', port=5000)
