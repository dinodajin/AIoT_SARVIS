# SoftAP 통신 테스트 가이드

Jetson 장치와 모바일 앱 간의 SoftAP 방식 WiFi 통신을 테스트하기 위한 가이드입니다.

## 개요

이 테스트 앱은 SoftAP 방식으로 생성된 WiFi 네트워크를 통해 Jetson 장치와 통신하여 다음 기능을 테스트합니다:
- WiFi 연결 상태 감지
- Jetson 서버 연결 테스트
- Echo 테스트 (메시지 송수신)
- 이미지 전송/수신
- 오디오 파일 전송/수신

## 사전 준비

### 1. Jetson 장치 준비

```bash
# Jetson 장치에서
cd BACKEND
pip install -r jetson_requirements.txt
python3 jetson_test_server.py
```

### 2. SoftAP 설정

Jetson 장치에서 SoftAP를 활성화하고 설정합니다:
- SSID: 예) `JetsonSoftAP`
- IP 주소: `192.168.43.1`
- 대역폭: 2.4GHz (더 넓은 커버리지)
- 보안: WPA2-PSK

### 3. 모바일 앱 실행

```bash
# 개발 머신에서
cd FRONTEND/sarvis
npm start
```

Expo Go 앱에서 QR 코드를 스캔하여 앱을 실행합니다.

## 앱 사용법

### 1. SoftAP 탭 접근

앱 하단 탭 메뉴에서 **"SoftAP"** 탭을 탭하여 통신 테스트 화면으로 이동합니다.

### 2. WiFi 연결 확인

- **네트워크 상태** 섹션에서 현재 WiFi 연결 상태를 확인합니다
- SoftAP가 활성화되면 IP 주소가 표시됩니다
- 5초마다 자동으로 상태가 갱신됩니다

### 3. Jetson 연결 설정

1. **Jetson 연결 설정** 섹션에서 IP 주소와 포트를 확인합니다
2. 기본값:
   - IP 주소: `192.168.43.1`
   - 포트: `8000`
3. Jetson 장치의 실제 IP가 다른 경우 수정 후 **"설정 적용"** 버튼을 탭합니다
4. **"연결 테스트"** 버튼을 탭하여 Jetson 서버와의 연결을 확인합니다

### 4. Echo 테스트

1. **Echo 테스트** 섹션에서 테스트 메시지를 입력합니다
2. **"Echo 전송"** 버튼을 탭합니다
3. Jetson 서버에서 메시지를 수신하고 응답을 반환합니다
4. 응답 결과가 화면에 표시됩니다

### 5. 이미지 전송/수신 테스트

#### 이미지 선택
- **"갤러리 선택"**: 기기의 갤러리에서 이미지 선택
- **"사진 촬영"**: 카메라로 직접 사진 촬영

#### 이미지 전송
- 선택한 이미지가 표시된 상태에서 **"이미지 전송"** 버튼을 탭
- 이미지가 Jetson 서버로 전송되고 저장됨

#### 이미지 수신
- **"이미지 수신"** 버튼을 탭
- Jetson 서버에서 테스트 이미지를 다운로드
- 수신된 이미지가 캐시에 저장됨

### 6. 오디오 전송/수신 테스트

#### 오디오 파일 선택
- **"오디오 파일 선택"** 버튼을 탭
- 기기에서 오디오 파일 선택 (WAV, MP3, M4A 등)

#### 오디오 전송
- 선택한 파일이 표시된 상태에서 **"오디오 전송"** 버튼을 탭
- 오디오 파일이 Jetson 서버로 전송되고 저장됨

#### 오디오 수신
- **"오디오 수신"** 버튼을 탭
- Jetson 서버에서 테스트 오디오 파일을 다운로드
- 수신된 오디오가 캐시에 저장됨

## Jetson 서버 API

### 엔드포인트

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/api/health` | 서버 상태 확인 |
| POST | `/api/echo` | Echo 테스트 |
| POST | `/api/upload/image` | 이미지 업로드 |
| GET | `/api/images/<filename>` | 이미지 다운로드 |
| POST | `/api/upload/audio` | 오디오 업로드 |
| GET | `/api/audio/<filename>` | 오디오 다운로드 |
| GET | `/api/files` | 파일 목록 조회 |

### 예시 요청

#### Health Check
```bash
curl http://192.168.43.1:8000/api/health
```

#### Echo Test
```bash
curl -X POST http://192.168.43.1:8000/api/echo \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Jetson!"}'
```

## 파일 구조

### 앱 (프론트엔드)
```
FRONTEND/sarvis/
├── app/(tabs)/softap-test.tsx     # SoftAP 테스트 화면
├── app/(tabs)/_layout.tsx         # 탭 레이아웃 (SoftAP 탭 추가됨)
└── utils/softap-communication.ts   # 통신 유틸리티 클래스
```

### 서버 (Jetson)
```
BACKEND/
├── jetson_test_server.py           # Flask 테스트 서버
├── jetson_requirements.txt         # Python 의존성
└── uploads/                       # 업로드된 파일 저장 경로
    ├── images/                     # 이미지 저장
    └── audio/                      # 오디오 저장
```

## 트러블슈팅

### 연결 실패

1. **WiFi가 연결되었는지 확인**
   - 앱의 "네트워크 상태" 섹션 확인
   - SoftAP SSID에 연결되어 있어야 함

2. **Jetson 서버 실행 확인**
   ```bash
   # Jetson 장치에서
   curl http://localhost:8000/api/health
   ```

3. **IP 주소 확인**
   - Jetson 장치의 실제 IP 주소 확인
   - 앱의 연결 설정에서 IP 수정

4. **포트 확인**
   - 방화벽이 8000 포트를 차단하지 않는지 확인
   - Jetson에서 `sudo ufw allow 8000` 실행

### 이미지/오디오 전송 실패

1. **파일 크기 확인**
   - 너무 큰 파일은 전송에 실패할 수 있음
   - 권장: 이미지 < 5MB, 오디오 < 10MB

2. **파일 형식 확인**
   - 이미지: JPG, JPEG, PNG
   - 오디오: WAV, MP3, M4A

3. **저장 공간 확인**
   - Jetson 장치의 디스크 공간 확인
   - `df -h` 명령어로 확인

### 앱 권한 문제

앱이 카메라나 갤러리에 접근할 수 없는 경우:
1. 폰 설정 → 앱 → Expo Go → 권한
2. 카메라 및 저장소 권한 허용

## 테스트 시나리오

### 기본 연결 테스트
1. Jetson SoftAP에 연결
2. 앱에서 연결 테스트 실행
3. Echo 테스트로 통신 확인

### 이미지 전송 테스트
1. 갤러리에서 이미지 선택
2. 이미지 전송 실행
3. Jetson 서버에서 파일 확인
4. 이미지 수신 테스트

### 오디오 전송 테스트
1. 오디오 파일 선택
2. 오디오 전송 실행
3. Jetson 서버에서 파일 확인
4. 오디오 수신 테스트

## 성능 최적화

### Jetson 서버
- 이미지 압축 설정 조정
- 동시 연결 수 제한
- 파일 크기 제한 설정

### 앱
- WiFi 품질 모니터링
- 전송 속도 표시
- 재시도 로직 구현

## 다음 단계

이 테스트 앱이 정상 작동한 후:
1. 실제 앱에 통신 기능 통합
2. 인증/보안 기능 추가
3. 실시간 통신 (WebSocket) 구현
4. 에러 처리 및 로깅 강화
5. 성능 모니터링 도구 추가

## 지원

문제가 발생하면:
1. Jetson 서버 로그 확인
2. 앱의 상태 메시지 확인
3. 네트워크 연결 확인
4. 위 트러블슈팅 섹션 참조

## 기술 스택

### 앱 (React Native + Expo)
- React Native 0.81.5
- Expo 54.0.32
- expo-network: 네트워크 상태 확인
- expo-file-system: 파일 입출력
- expo-image-picker: 이미지 선택/촬영
- expo-document-picker: 문서 선택
- axios: HTTP 클라이언트

### 서버 (Python Flask)
- Flask 3.0.0
- flask-cors 4.0.0: CORS 지원