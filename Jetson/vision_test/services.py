import time
import cv2
import requests
import numpy as np
from vision import app_face, get_face_info
import api_client

def process_registration(uid):
    print(f"[Signup] Starting registration for UID: {uid}")
    
    captured_data = [None] * 5  
    angle_names = ["Center", "Left", "Right", "Up", "Down"]
    
    cap = cv2.VideoCapture(0)
    start_time = time.time()
    frame_count = 0

    while None in captured_data and (time.time() - start_time < 45):
        ret, frame = cap.read()
        if not ret: break
        
        frame_count += 1
        if frame_count % 3 != 0:
            continue
        
        faces = app_face.get(frame)
        if not faces: 
            # 얼굴이 없을 때도 라파에게 "No Face" 정보를 줘서 멈추게 할 수 있음
            api_client.send_to_pi_direct(0, 0, "No Face")
            continue
        
        face = sorted(faces, key=lambda x: (x.bbox[2]-x.bbox[0]))[-1]
        info = get_face_info(face, frame.shape)
        
        # [추가] 라즈베리파이로 실시간 유선 전송!
        api_client.send_to_pi_direct(info['yaw'], info['pitch'], info['guide'])
        
        y, p = info['yaw'], info['pitch']
        
        # 각도 판정 범위 최적화
        target_idx = -1
        if abs(y) < 18 and abs(p) < 18: 
            target_idx = 0       # Center
        elif y <= -18: 
            target_idx = 1       # Left
        elif y >= 18: 
            target_idx = 2       # Right
        elif p <= -18: 
            target_idx = 3       # Up
        elif p >= 18: 
            target_idx = 4       # Down

        # 데이터 저장 (이미 확보된 각도는 중복 저장 안 함)
        if target_idx != -1 and captured_data[target_idx] is None:
            if info['guide'] == "OK":
                captured_data[target_idx] = face.normed_embedding.tolist()
                remaining = captured_data.count(None)
                print(f"[*] {angle_names[target_idx]} Captured! (Remaining: {remaining})")
            else:
                print(f"Guidance: {info['guide']}             ", end='\r')

    cap.release()
    
    if None not in captured_data:
        status = api_client.save_biometric(uid, captured_data)
        if status in [200, 201]:
            print(f"\n[+] Signup Successful for {uid}")
        else:
            print(f"\n[!] Server Error (Status: {status})")
    else:
        missing = [angle_names[i] for i, v in enumerate(captured_data) if v is None]
        print(f"\n[X] Signup Failed: Missing {missing}")


def process_login():
    print("[Login] Starting (3 attempts) - Frontal Face Only")
    
    # 서버에서 등록된 사용자 목록 가져오기
    users = api_client.get_registered_faces()
    
    # 디버깅을 위해 데이터 개수 출력
    print(f"[*] Loaded {len(users) if users else 0} users from server.")

    if not users:
        print("Error: No users found or failed to load data.")
        return

    for attempt in range(1, 4):
        print(f"\nAttempt {attempt}/3...")
        cap = cv2.VideoCapture(0)
        start_time = time.time()
        frame_count = 0
        best_match = {"id": "unknown", "sim": 0.0, "guide": "No Face"}

        while time.time() - start_time < 5:
            ret, frame = cap.read()
            if not ret: break
            
            frame_count += 1
            if frame_count % 3 != 0:
                continue
            
            faces = app_face.get(frame)
            if not faces: continue

            face = sorted(faces, key=lambda x: (x.bbox[2]-x.bbox[0]))[-1]
            if face.det_score < 0.65: continue

            info = get_face_info(face, frame.shape)
            
            # 정면 판정
            is_frontal = abs(info['yaw']) < 18 and abs(info['pitch']) < 18
            
            if not is_frontal:
                best_match["guide"] = "Please look straight at the camera"
                print(f"Guidance: {best_match['guide']}          ", end='\r')
                continue 

            # 정면일 때 비교 시작
            curr_vec = np.array(face.normed_embedding).flatten()
            
            for user in users:
                user_vectors = user.get('face_vector', [])
                
                for db_vec_list in user_vectors:
                    db_vec = np.array(db_vec_list).flatten()
                    if db_vec.shape[0] != 512: continue
                    
                    # 두 벡터 모두 정규화되어 있으므로 내적(dot)이 코사인 유사도
                    sim = float(np.dot(curr_vec, db_vec))
                    
                    if sim > best_match["sim"]:
                        best_match["sim"] = sim
                        best_match["id"] = user.get('uid')
            
            # 유사도 기준 통과 시 루프 탈출
            if best_match["sim"] > 0.48:
                break 
        
        cap.release()
        
        if best_match["sim"] > 0.48:
            print(f"\n[+] Login Success: {best_match['id']} (Sim: {best_match['sim']:.2f})")
            # 서버에 결과 보고
            api_client.report_login_result(True, best_match['id'], "Success")
            return
        else:
            print(f"\n[X] Fail {attempt}: Low similarity (Best: {best_match['sim']:.2f})")
            if attempt < 3: time.sleep(1)

    # 3회 실패 시 서버 보고
    api_client.report_login_result(False, None, "Face mismatch")
    print("\n[!] Final Failure after 3 attempts.")