# SoftAP 통신 테스트 가이드 (최신)

Jetson 장치와 모바일 앱 간의 SoftAP 방식 WiFi 통신을 테스트하기 위한 가이드입니다.

## 네트워크 설정 정보

### WiFi 연결 정보
- **SSID (와이파이 이름)**: `SARVIS_WIFI`
- **비밀번호**: `ssafya104`
- **Phone IP**: `10.42.0.5` (수동 설정 권장)

### Jetson 서버 정보
- **Server IP**: `10.42.0.1`
- **Port**: `5000`
- **Protocol**: TCP (HTTP API)

## 사전 준비

### 1단계: Jetson 장치 준비

Jetson 장치에서 다음을 실행합니다:

```bash
# 의존성 설치 (필요한 경우)
pip install flask numpy opencv-python

# 서버 실행
python3 server_test.py
```

서버가 시작되면 다음과 같은 메시지가 표시됩니다:
```
 * Running on http://10.42.0.1:5000/
```

### 2단계: SoftAP 설정 확인

Jetson 장치에서 SoftAP가 다음과 같이 설정되어 있는지 확인합니다:
- SSID: `SARVIS_WIFI`
- Gateway IP: `10.42.0.1`
- 대역폭: 2.4GHz

### 3단계: 모바일 장치 WiFi 설정

#### Android 설정:
1. 설정 → WiFi로 이동
2. `SARVIS_WIFI` 네트워크 선택
3. 비밀번호 `ssafya104` 입력
4. **고급 옵션**에서 IP 설정을 **수동**으로 변경:
   - IP 주소: `10.42.0.5`
   - 게이트웨이: `10.42.0.1`
   - 서브넷 마스크: `255.255.255.0`
   - DNS: `10.42.0.1`

#### iOS 설정:
1. 설정 → WiFi로 이동
2. `SARVIS_WIFI` 네트워크 선택
3. 비밀번호 `ssafya104` 입력
4. 네트워크 정보의 **i** 버튼 탭
5. **설정 IP** 선택:
   - IP 주소: `10.42.0.5`
   - 라우터: `10.42.0.1`
   - 서브넷 마스크: `255.255.255.0`

### 4단계: 앱 실행

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
- `SARVIS_WIFI`에 연결되면 IP 주소가 표시됩니다 (예: `10.42.0.5`)
- 5초마다 자동으로 상태가 갱신됩니다

### 3. Jetson 연결 설정 확인

- **Jetson 연결 설정** 섹션에서 기본값 확인:
  - IP 주소: `10.42.0.1`
  - 포트: `5000`
- 값이 올바르면 변경할 필요가 없습니다

### 4. 연결 테스트

**"연결 테스트"** 버튼을 탭합니다:
- 성공: "Jetson 서버에 연결되었습니다!" 메시지 (녹색)
- 실패: 연결 실패 메시지 (빨간색)

### 5. 이미지 전송 테스트

#### 이미지 선택
- **"갤러리 선택"**: 기기의 갤러리에서 이미지 선택
- **"사진 촬영"**: 카메라로 직접 사진 촬영

#### 이미지 전송
- 선택한 이미지가 표시된 상태에서 **"이미지 전송"** 버튼을 탭
- 이미지가 Jetson 서버로 전송되고 처리됨

### 6. Jetson 서버에서 로그 확인

이미지가 성공적으로 전송되면 Jetson 터미널에 다음이 표시됩니다:
```
Image received. Shape: (높이, 너비, 채널)
```

## 트러블슈팅

### 연결 실패

#### 1. WiFi 연결 확인
- 앱의 "네트워크 상태" 섹션 확인
- `SARVIS_WIFI`에 연결되어 있어야 함
- 연결 안됨 경우:
  - WiFi 설정에서 `SARVIS_WIFI` 재선택
  - 비밀번호 `ssafya104` 확인
  - Jetson의 SoftAP가 켜져 있는지 확인

#### 2. IP 주소 확인
- 모바일 장치 IP: `10.42.0.5` (수동 설정)
- Jetson 장치 IP: `10.42.0.1`

Jetson에서 IP 확인:
```bash
ip addr show wlan0
```
또는
```bash
ifconfig wlan0
```

#### 3. 포트 확인
- 방화벽이 5000 포트를 차단하지 않는지 확인
- Jetson에서 다음 실행:
```bash
sudo ufw allow 5000
```

#### 4. Jetson 서버 실행 확인
- Jetson 터미널에서 서버가 실행 중인지 확인
- 다음 메시지가 표시되어야 함:
```
 * Running on http://10.42.0.1:5000/
```

서버가 실행 중이지 않으면:
```bash
python3 server_test.py
```

### 이미지 전송 실패

#### 1. Jetson 서버 로그 확인
- Jetson 터미널에서 에러 메시지 확인
- 일반적인 로그:
  ```
  Image received. Shape: (480, 640, 3)
  ```

#### 2. 파일 크기 확인
- 너무 큰 이미지는 전송에 실패할 수 있음
- 권장: 이미지 < 5MB

#### 3. 네트워크 연결 확인
- 앱의 "네트워크 상태" 확인
- WiFi 연결이 안정적인지 확인

### 포트 충돌

다른 앱이 5000 포트를 사용 중일 수 있습니다. Jetson에서 확인:

```bash
sudo lsof -i :5000
```

포트가 사용 중이면:
1. 해당 앱 중지
2. 또는 다른 포트 사용 (server_test.py와 앱 설정 모두 수정 필요)

## 테스트 시나리오

### 기본 연결 테스트
1. Jetson에서 SoftAP 활성화
2. 모바일 장치를 `SARVIS_WIFI`에 연결 (IP: 10.42.0.5)
3. Jetson에서 `python3 server_test.py` 실행
4. 앱에서 "연결 테스트" 클릭
5. "Jetson 서버에 연결되었습니다!" 메시지 확인

### 이미지 전송 테스트
1. 앱에서 "갤러리 선택" 클릭
2. 이미지 선택
3. "이미지 전송" 클릭
4. 앱에서 "이미지 전송 성공!" 메시지 확인
5. Jetson 터미널에서 "Image received" 로그 확인

## 서버 API 엔드포인트

현재 server_test.py는 다음 엔드포인트를 지원합니다:

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/` | 서버 기본 페이지 |
| POST | `/upload_face` | 이미지 업로드 (테스트용) |

### 요청 형식 (이미지 업로드)
- Content-Type: `multipart/form-data`
- Key: `image`
- 타입: 이미지 파일 (JPEG, PNG 등)

### 응답 형식
```json
{
  "status": "success",
  "message": "Image processed in memory"
}
```

## 앱 기능 제한 사항

현재 server_test.py의 기능에 따라 앱에서 다음 기능만 사용 가능합니다:

### ✅ 지원되는 기능
- WiFi 네트워크 상태 감지
- Jetson 서버 연결 테스트
- 이미지 전송

### ❌ 현재 지원되지 않는 기능 (server_test.py 미구현)
- Echo 테스트 (메시지 송수신)
- 이미지 다운로드
- 오디오 전송
- 오디오 다운로드

이 기능들을 테스트하려면 server_test.py에 해당 엔드포인트를 추가해야 합니다.

## 빌드 상태

### 현재 설정
- **앱 IP**: `10.42.0.1`
- **앱 포트**: `5000`
- **이미지 엔드포인트**: `/upload_face`
- **데이터 전송**: HTTP API (TCP)

### 확인된 파일
1. `FRONTEND/sarvis/utils/softap-communication.ts` - 통신 유틸리티
2. `FRONTEND/sarvis/app/(tabs)/softap-test.tsx` - 테스트 화면
3. `FRONTEND/sarvis/app/(tabs)/_layout.tsx` - SoftAP 탭 포함
4. `server_test.py` - Jetson 서버

## 다음 단계

테스트가 성공하면:
1. server_test.py에 Echo, 오디오, 이미지 다운로드 엔드포인트 추가
2. 앱에 추가 기능 통합
3. 인증/보안 기능 추가
4. 실시간 통신 (WebSocket) 고려
5. 에러 처리 강화

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
- Flask
- numpy: 배열 처리
- opencv-python: 이미지 처리

## 지원

문제가 발생하면:
1. Jetson 서버 로그 확인
2. 앱의 상태 메시지 확인
3. 네트워크 연결 확인 (WiFi: SARVIS_WIFI, IP: 10.42.0.5)
4. 위 트러블슈팅 섹션 참조