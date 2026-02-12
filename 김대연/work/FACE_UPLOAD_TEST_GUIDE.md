# 얼굴 사진 5장 Jetson SoftAP 전송 테스트 가이드

## 📋 개요

이 가이드는 Jetson 서버로 SoftAP 연결 후 얼굴 사진 5장을 전송하는 테스트 방법을 설명합니다.

---

## 🚀 방법 1: Expo 앱에서 테스트 (추천)

### 1단계: Jetson 테스트 서버 실행

```bash
cd BACKEND
python jetson_test_server.py
```

서버가 다음과 같이 실행되어야 합니다:
```
============================================================
Jetson SoftAP 통신 테스트 서버
============================================================
서버 시작: http://0.0.0.0:5000
이미지 저장 경로: /path/to/BACKEND/uploads/images
오디오 저장 경로: /path/to/BACKEND/uploads/audio
============================================================
사용 가능한 엔드포인트:
  GET  / - 서버 정보
  POST /upload_face - 다중 얼굴 이미지 업로드 (회원가입)
  POST /register/upload - 다중 음성 파일 업로드 (회원가입)
  ...
============================================================
```

### 2단계: Expo 앱 실행

```bash
cd FRONTEND/sarvis
npm start
```

### 3단계: SoftAP 연결 확인

1. 앱에서 `SoftAP 테스트` 탭으로 이동
2. 네트워크 상태 확인: "연결됨"이어야 함
3. Jetson IP 확인: `10.42.0.1` (기본값)
4. 포트 확인: `5000`
5. "연결 테스트" 버튼 클릭
6. 성공 메시지 확인: "Jetson 서버에 연결되었습니다!"

### 4단계: 얼굴 사진 5장 촬영

1. "📷 5장 연속 촬영" 버튼 클릭
2. 카메라가 시작되고 다음 순서로 안내:
   - 1/5: Center (정면)
   - 2/5: Left (왼쪽)
   - 3/5: Right (오른쪽)
   - 4/5: Up (위쪽)
   - 5/5: Down (아래쪽)
3. 각 방향마다 사진 촬영 후 자동으로 다음으로 진행
4. 취소하려면 뒤로 가기 버튼 클릭
5. 5장 모두 촬영 완료 후 "5장 촬영 완료! 전송 버튼을 누르세요" 메시지 확인

### 5단계: Jetson으로 전송

1. "📤 5장 한번에 전송" 버튼 클릭
2. 전송 진행 상태 확인: "5장 전송 중..."
3. Jetson 서버 콘솔에서 파일 수신 로그 확인:
   ```
   얼굴 이미지 수신: face_test_user_20250130_180000_1.jpg (24567 bytes)
   얼굴 이미지 수신: face_test_user_20250130_180001_2.jpg (24890 bytes)
   얼굴 이미지 수신: face_test_user_20250130_180002_3.jpg (25123 bytes)
   얼굴 이미지 수신: face_test_user_20250130_180003_4.jpg (24456 bytes)
   얼굴 이미지 수신: face_test_user_20250130_180004_5.jpg (24789 bytes)
   ```
4. 성공 메시지: "5장 전송 성공!"

---

## 🔧 방법 2: Node.js 스크립트로 테스트

### 전제 조건

```bash
npm install axios form-data
```

### 1단계: Jetson 테스트 서버 실행

```bash
cd BACKEND
python jetson_test_server.py
```

### 2단계: 테스트 이미지 준비

테스트용 이미지 5장이 필요합니다. 다음 방법 중 하나로 준비하세요:

#### 옵션 A: 실제 이미지 사용
```bash
# 이미지 파일 5장을 현재 폴더에 준비
# 예: face1.jpg, face2.jpg, face3.jpg, face4.jpg, face5.jpg
```

#### 옵션 B: Expo 앱에서 이미지 생성
1. Expo 앱의 "SoftAP 테스트" 탭에서 촬영
2. 촬영된 이미지 URI를 확인 (앱 디버그 로그)
3. 이미지를 로컬 파일로 저장

### 3단계: 테스트 스크립트 실행

#### 실제 이미지로 테스트
```bash
# 5장의 이미지 파일 경로를 인자로 전달
node test_face_upload.js face1.jpg face2.jpg face3.jpg face4.jpg face5.jpg
```

#### 데모 모드로 테스트 (가상 파일)
```bash
# 가상 파일로 연결 테스트만 수행
node test_face_upload.js --demo
```

### 예상 출력

```
============================================================
Jetson SoftAP 얼굴 이미지 전송 테스트
============================================================
Jetson IP: 10.42.0.1:5000
UID: test_user
============================================================

🔌 Jetson 서버 연결 테스트 중...
✅ 연결 성공!
   응답: { server: 'Jetson SoftAP 통신 테스트 서버', ... }

📁 파일 확인 중...
  ✓ face1.jpg (24567 bytes)
  ✓ face2.jpg (24890 bytes)
  ✓ face3.jpg (25123 bytes)
  ✓ face4.jpg (24456 bytes)
  ✓ face5.jpg (24789 bytes)

📤 5장의 이미지 전송 중...
   대상: http://10.42.0.1:5000/upload_face
   UID: test_user
   파일들:
     1. face1.jpg
     2. face2.jpg
     3. face3.jpg
     4. face4.jpg
     5. face5.jpg

✅ 전송 성공!
   응답: {
     "status": "success",
     "message": "얼굴 이미지 업로드 성공",
     "files": [
       "face_test_user_20250130_180000_1.jpg",
       "face_test_user_20250130_180001_2.jpg",
       "face_test_user_20250130_180002_3.jpg",
       "face_test_user_20250130_180003_4.jpg",
       "face_test_user_20250130_180004_5.jpg"
     ],
     "face_vector": [
       [0.123, 0.124, ..., 0.634],  # 512차원
       [0.124, 0.125, ..., 0.635],  # 512차원
       [0.125, 0.126, ..., 0.636],  # 512차원
       [0.126, 0.127, ..., 0.637],  # 512차원
       [0.127, 0.128, ..., 0.638]   # 512차원
     ]
   }

============================================================
테스트 완료!
============================================================
```

---

## 🔍 트러블슈팅

### 문제: 연결 실패

**에러 메시지:** "연결 실패: ECONNREFUSED" 또는 "Connection timed out"

**해결 방법:**
1. Jetson 서버가 실행 중인지 확인
2. IP 주소 확인: `10.42.0.1` (SoftAP 기본 IP)
3. 포트 확인: `5000`
4. 방화벽 확인
5. 동일한 네트워크에 있는지 확인

### 문제: 파일 전송 실패

**에러 메시지:** "이미지 전송 실패" 또는 "전송 실패"

**해결 방법:**
1. Jetson 서버 콘솔 로그 확인
2. 엔드포인트 확인: `/upload_face`
3. 파일 형식 확인: `image/jpeg`
4. 파일 크기 확인 (너무 크지 않은지)
5. 네트워크 상태 확인

### 문제: 일부 파일만 전송됨

**에러 메시지:** "3장만 전송했습니다. (5장 필요)"

**해결 방법:**
1. 파일이 실제로 존재하는지 확인
2. 파일 경로가 올바른지 확인
3. 권한 문제 확인
4. Jetson 서버 로그에서 어떤 파일이 실패했는지 확인

---

## 📊 성공 확인 체크리스트

- [ ] Jetson 테스트 서버 실행 중 (port 5000)
- [ ] Expo 앱이 SoftAP 네트워크에 연결됨
- [ ] Jetson IP 연결 테스트 성공
- [ ] 5장의 사진 촬영 완료
- [ ] 5장 모두 전송 성공
- [ ] Jetson 서버 콘솔에서 파일 수신 로그 확인
- [ ] Jetson 서버 응답에 face_vector 포함됨
- [ ] 이미지 파일이 uploads/images 폴더에 저장됨

---

## 📁 파일 구조

```
/mnt/c/DEV/CLINE_space/
├── BACKEND/
│   ├── jetson_test_server.py      # Jetson 테스트 서버
│   └── uploads/
│       ├── images/               # 수신된 이미지 저장 폴더
│       └── audio/               # 수신된 오디오 저장 폴더
├── FRONTEND/sarvis/
│   ├── app/(tabs)/
│   │   └── softap-test.tsx      # Expo 앱 테스트 화면
│   └── utils/
│       └── softap-communication.ts  # SoftAP 통신 클래스
└── test_face_upload.js            # Node.js 테스트 스크립트
```

---

## 🎯 핵심 포인트

### Jetson 서버 (jetson_test_server.py)
- 포트: 5000
- 엔드포인트: `POST /upload_face`
- 수신: `FormData` with `uid` + multiple `image` files
- 응답: JSON with `face_vector` (5 x 512차원)

### 앱 통신 (softap-communication.ts)
- 메소드: `sendMultipleImages(imageUris, uid, endpoint)`
- 포맷: `multipart/form-data`
- 헤더: `Content-Type: multipart/form-data`, `Accept: application/json`
- 타임아웃: 60000ms

### 테스트 스크립트 (test_face_upload.js)
- 사용법: `node test_face_upload.js <image1> ... <image5>`
- 데모: `node test_face_upload.js --demo`
- 기능: 연결 테스트 + 파일 전송 + 상세 로그

---

## 🔗 관련 문서

- `SOFTAP_TEST_GUIDE.md` - SoftAP 설정 전체 가이드
- `api명세서.md` - Django API 명세서
- `jetson_test_server.py` - Jetson 테스트 서버 소스
- `softap-communication.ts` - SoftAP 통신 클래스 소스

---

## 📞 문의

테스트 중 문제가 발생하면:
1. Jetson 서버 콘솔 로그 확인
2. Expo 앱 디버그 로그 확인
3. 위 트러블슈팅 섹션 참조

---

**최종 업데이트:** 2026-01-30
**버전:** 1.0.0