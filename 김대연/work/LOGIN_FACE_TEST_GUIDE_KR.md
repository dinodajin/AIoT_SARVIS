# 얼굴 로그인 SoftAP 테스트 가이드

## 개요
Jetson의 SoftAP를 통해 모바일 앱에서 얼굴 로그인을 테스트하는 가이드입니다.

## 사전 준비

### 1. Jetson 설정
- [ ] Jetson에서 SoftAP 실행 (Hotspot 모드)
- [ ] Jetson IP: `10.42.0.1` 확인
- [ ] Jetson 테스트 서버 실행:
```bash
cd /mnt/c/DEV/CLINE_space/BACKEND
python3 jetson_test_server.py
```

### 2. 모바일 앱 설정
- [ ] 앱 빌드 완료
- [ ] expo-image-picker 권한 허용 (카메라)

## 테스트 절차

### 1단계: SoftAP 연결

#### 모바일 기기
1. WiFi 설정 열기
2. Jetson SoftAP SSID 검색 (예: `Jetson-SoftAP`)
3. 비밀번호 입력 후 연결
4. IP 할당 확인 (예: `10.42.0.2`)

### 2단계: 얼굴 로그인 테스트

#### 앱에서 실행
1. 앱 실행
2. 로그인 화면에서 "얼굴 인식" 선택
3. 자동으로 기기 검색 시작
4. "얼굴 촬영" 버튼 탭
5. 전면 카메라로 얼굴 촬영
6. Jetson 서버로 이미지 전송
7. 로그인 성공 확인

#### Jetson 서버 로그 확인
```
이미지 수신 완료: image_YYYYMMDD_HHMMSS.jpg (XXX bytes)
```

## 엔드포인트 정보

### 사용된 Jetson 엔드포인트
- **POST** `/api/upload/image` - 얼굴 로그인 이미지 전송

### 요청 형식
```
Content-Type: multipart/form-data

- image: (파일) - 얼굴 사진
- uid: (문자열) - 사용자 ID
```

### 응답 형식
```json
{
  "status": "success",
  "message": "이미지 업로드 성공",
  "filename": "image_20250130_123456.jpg",
  "path": "/path/to/image",
  "size": 123456
}
```

## 테스트 케이스

### 성공 시나리오
1. **기본 로그인**
   - [ ] SoftAP 연결 성공
   - [ ] 카메라 촬영 성공
   - [ ] Jetson 전송 성공
   - [ ] 로그인 완료 후 메인 화면 이동

### 실패 시나리오

#### 네트워크 문제
- [ ] SoftAP 미연결 상태 → 에러 메시지 표시
- [ ] Jetson 서버 미실행 → 연결 실패 메시지

#### 카메라 문제
- [ ] 카메라 권한 거부 → 권한 요청 안내
- [ ] 카메라 접근 불가 → 에러 메시지 표시

#### 서버 문제
- [ ] 타임아웃 (30초) → 재시도 요청
- [ ] 서버 에러 응답 → 에러 메시지 표시

## 디버깅

### 로그 확인 위치

#### 앱 로그
- Expo DevTools → Logs 탭
- 콘솔 메시지:
  - "얼굴 로그인 시도: UID=xxx, 이미지=xxx"
  - "얼굴 로그인 응답: {...}"

#### Jetson 서버 로그
- 터미널 출력:
  - "이미지 수신 완료: image_YYYYMMDD_HHMMSS.jpg"
  - 에러 발생 시 상세 에러 메시지

### 일반적인 문제 및 해결책

| 문제 | 원인 | 해결책 |
|------|------|--------|
| 연결 실패 | SoftAP 미연결 | WiFi 연결 확인 |
| 카메라 열기 실패 | 권한 미허용 | 설정에서 카메라 권한 허용 |
| 전송 실패 | 서버 미실행 | Jetson 서버 재시작 |
| 타임아웃 | 네트워크 느림 | WiFi 신호 확인, 재시도 |

## 코드 구조

### 앱 구성 요소

#### `login-face.tsx`
- **Phase 관리**: waiting → searching → capturing → uploading → success/error
- **카메라 촬영**: `expo-image-picker` 사용
- **Jetson 전송**: `SoftAPCommunication.loginWithFace()`

#### `softap-communication.ts`
- **loginWithFace()**: 단일 이미지를 `/api/upload/image`로 전송
- **타임아웃**: 60초
- **FormData**: UID + 이미지 파일

### Jetson 서버

#### `jetson_test_server.py`
- **엔드포인트**: `/api/upload/image`
- **동작**: 이미지 수신 → 저장 → 성공 응답
- **저장 경로**: `uploads/images/`

## 파일 구조

```
BACKEND/
├── jetson_test_server.py    # Jetson 테스트 서버
└── uploads/
    └── images/              # 업로드된 얼굴 이미지

FRONTEND/
└── sarvis/
    ├── app/
    │   └── (auth)/
    │       └── login-face.tsx  # 얼굴 로그인 화면
    └── utils/
        └── softap-communication.ts  # SoftAP 통신 유틸리티
```

## 테스트 체크리스트

- [ ] Jetson SoftAP 실행 확인
- [ ] Jetson 테스트 서버 실행 확인
- [ ] 모바일 기기 SoftAP 연결 확인
- [ ] 앱 실행 가능 확인
- [ ] 카메라 권한 허용 확인
- [ ] 얼굴 촬영 가능 확인
- [ ] Jetson 전송 성공 확인
- [ ] 로그인 완료 후 화면 이동 확인
- [ ] 업로드된 이미지 파일 확인

## 참고 사항

### 개발 환경
- 현재 구현은 **개발용 테스트 버전**입니다
- 실제 얼굴 인식 모델은 Jetson에 추가 구현 필요

### 향후 개발 사항
1. Jetson에서 실제 얼굴 인식 모델 실행
2. 로그인 사용자 식별 로직 구현
3. 인증 토큰 발급 및 관리
4. 보안 강화 (암호화 통신)

### 네트워크 구성
- **Jetson**: `10.42.0.1:5000`
- **앱**: 자동 IP 할당 (예: `10.42.0.2`)
- **프로토콜**: HTTP (개발용)
- **포트**: 5000

## 지원

문제 발생 시:
1. 터미널 로그 확인
2. Expo DevTools 로그 확인
3. `NETWORK_TROUBLESHOOTING.md` 참조
4. Jetson 서버 상태 확인