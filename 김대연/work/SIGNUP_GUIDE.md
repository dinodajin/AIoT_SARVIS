# 회원가입 테스트 가이드

## 📋 목차

1. [개요](#개요)
2. [사전 준비 사항](#사전-준비-사항)
3. [회원가입 4단계](#회원가입-4단계)
4. [테스트 시나리오](#테스트-시나리오)
5. [문제 해결](#문제-해결)
6. [개발자 참고사항](#개발자-참고사항)

---

## 개요

이 가이드는 SARVIS 앱의 회원가입 4단계 플로우를 테스트하기 위한 지침입니다.

### 회원가입 4단계

1. **Step 1**: 정보 입력 및 이메일 인증
2. **Step 2**: 기기 연결 (SoftAP)
3. **Step 3**: 얼굴 등록 (5장)
4. **Step 4**: 음성 등록 (4개 파일)

---

## 사전 준비 사항

### 필수 요구사항

#### 1. Jetson NX/Xavier 장치 준비
- Jetson이 부팅되어 있어야 합니다
- SoftAP가 활성화되어 있어야 합니다
- Jetson IP: `10.42.0.1`
- Jetson Port: `5000`

#### 2. Django Backend 서버
- Django 서버가 실행 중이어야 합니다
- 서버 IP: `10.42.0.1` (Jetson과 동일 네트워크)
- 서버 Port: `8000`
- API Base URL: `http://10.42.0.1:8000/api`

#### 3. Expo 앱
```bash
cd FRONTEND/sarvis
npm start
```

#### 4. Android/iOS 디바이스
- Expo Go 앱이 설치되어 있어야 합니다
- 개발자 모드에서 앱 실행

---

## 회원가입 4단계

### Step 1: 정보 입력 및 이메일 인증

#### 기능
- 닉네임 입력 (2-20자, 한글/영문/숫자)
- 아이디 입력 (영문/숫자 5-20자)
- 이메일 입력 및 인증 (도메인 선택 또는 직접 입력)
- 비밀번호 입력 (영문+숫자+특수문자 8-20자)
- 이메일 인증 코드 입력 (6자리, 5분 유효)
- 약관 동의 (전체 동의 및 개별 항목)

#### 흐름

```
사용자 입력
    ↓
[중복확인 및 인증번호 발송] → 이메일 전송
    ↓
6자리 인증 코드 입력
    ↓
[인증하기] → Django API: POST /api/register/verify-email/
    ↓
인증 성공 → User 생성 및 uid 반환
    ↓
[정보 입력 완료] → Step 2로 이동
```

#### API 호출

| API | Method | Endpoint | 설명 |
|-----|---------|----------|--------|
| 이메일 인증 코드 요청 | POST | `/api/register/email-request/` | 인증 코드 발송 |
| 이메일 인증 코드 검증 | POST | `/api/register/verify-email/` | 코드 검증 및 User 생성 |

#### 테스트 체크리스트

- [ ] 닉네임 유효성 검사 작동 확인
- [ ] 아이디 중복 체크 작동 확인
- [ ] 이메일 형식 검사 작동 확인
- [ ] 인증 코드 발송 작동 확인 (개발용: 999999)
- [ ] 인증 코드 타이머 (5분) 작동 확인
- [ ] 인증 코드 재발송 가능 확인
- [ ] 비밀번호 일치 검사 작동 확인
- [ ] 약관 전체 동의 기능 작동 확인
- [ ] 약관 모달 표시 기능 작동 확인
- [ ] API 에러 처리 확인

---

### Step 2: 기기 연결

#### 기능
- SoftAP 네트워크 자동 감지
- Jetson 서버 연결 테스트 (3초 간격)
- 연결 성공/실패 표시
- 재시도 기능 (30초 후 표시)
- 가입 취소 기능

#### 흐름

```
앱 진입
    ↓
Jetson 서버 연결 테스트 (GET http://10.42.0.1:5000/)
    ↓
3초마다 반복 (최대 30초)
    ↓
연결 성공 → [다음] 버튼 표시
    ↓
[기기 연결 완료] → Step 3로 이동
```

#### SoftAP 네트워크 정보

| 항목 | 값 |
|------|-----|
| SSID | Sarvis_SoftAP (Jetson에서 설정) |
| Jetson IP | 10.42.0.1 |
| Jetson Port | 5000 |

#### 테스트 체크리스트

- [ ] SoftAP 네트워크 자동 감지 작동 확인
- [ ] Jetson 연결 테스트 (3초 간격) 작동 확인
- [ ] 연결 성공 시 UI 표시 확인
- [ ] 30초 후 재시도 버튼 표시 확인
- [ ] 재시도 기능 작동 확인
- [ ] 가입 취소 시 확인 다이얼로그 표시
- [ ] 연결 실패 시 원인 가이드 표시

---

### Step 3: 얼굴 등록

#### 기능
- 5장 연속 촬영 (카메라)
- 촬영 방향 안내 (Center, Left, Right, Up, Down)
- 촬영된 사진 미리보기
- Jetson 서버로 이미지 전송
- 얼굴 벡터 추출 진행 상태 표시
- Django 서버로 얼굴 벡터 저장
- 진행 상태 및 진행률 표시

#### 흐름

```
[5장 연속 촬영] → Camera 열기
    ↓
1/5: Center 사진 촬영
    ↓
2/5: Left 사진 촬영
    ↓
3/5: Right 사진 촬영
    ↓
4/5: Up 사진 촬영
    ↓
5/5: Down 사진 촬영
    ↓
촬영 완료 → 미리보기 표시
    ↓
[얼굴 등록하기] → Jetson 서버 전송
    ↓
얼굴 벡터 추출 중... (50%)
    ↓
서버에 얼굴 벡터 저장 중... (75%)
    ↓
Django API: POST /api/biometric/save-face/
    ↓
얼굴 등록 완료! (100%) → Step 4로 이동
```

#### API 호출

| API | Method | Endpoint | 설명 |
|-----|---------|----------|--------|
| 얼굴 벡터 저장 | POST | `/api/biometric/save-face/` | 5x512 얼굴 벡터 저장 |

#### 요청/응답

**요청: Jetson 서버**
```json
POST /register/upload
FormData: {
  uid: "user-uid",
  image: [photo_1.jpg, photo_2.jpg, photo_3.jpg, photo_4.jpg, photo_5.jpg]
}
```

**요청: Django 서버**
```json
POST /api/biometric/save-face/
{
  "uid": "550e8400-e29b-41d4-a716-446655440000",
  "face_vector": [
    [0.123, 0.456, ...],  // 512차원
    [0.234, 0.567, ...],
    [0.345, 0.678, ...],
    [0.456, 0.789, ...],
    [0.567, 0.890, ...]
  ]
}
```

**응답: Django 서버**
```json
{
  "success": true,
  "message": "얼굴 벡터 저장 완료",
  "uid": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 테스트 체크리스트

- [ ] 카메라 권한 요청 작동 확인
- [ ] 5장 연속 촬영 작동 확인
- [ ] 촬영 방향 안내 표시 확인
- [ ] 촬영된 사진 미리보기 표시 확인
- [ ] 촬영 취소 시 알림 작동 확인
- [ ] Jetson 서버로 이미지 전송 작동 확인
- [ ] 진행 상태 메시지 표시 확인
- [ ] 진행률 (0%, 50%, 75%, 100%) 표시 확인
- [ ] Django API 호출 작동 확인
- [ ] 에러 처리 및 재시도 기능 확인

---

### Step 4: 음성 등록

#### 기능
- 음성 녹음 (실시간)
- 파일 선택 (DocumentPicker)
- 4개 음성 파일 선택
- Jetson 서버로 음성 파일 전송
- 음성 벡터 추출 진행 상태 표시
- Django 서버로 음성 벡터 저장
- 회원가입 완료 및 로그인 화면 이동

#### 흐름

```
음성 입력 방식 선택
    ↓
[녹음 시작] → 마이크 권한 요청
    ↓
녹음 중... (SARVIS 발음)
    ↓
[녹음 중지] → 파일 저장
    ↓
1/4 녹음 완료!
    ↓
2/4 녹음 완료! → 반복 (총 4회)
    ↓
4/4 녹음 완료!
    ↓
[음성 등록하기] → Jetson 서버 전송
    ↓
음성 벡터 추출 중... (50%)
    ↓
서버에 음성 벡터 저장 중... (75%)
    ↓
Django API: POST /api/biometric/save-voice/
    ↓
음성 등록 완료! (100%)
    ↓
회원가입 완료 알림 → 로그인 화면 이동
```

#### 음성 프롬프트

| 순서 | 프롬프트 | 발음 |
|------|---------|------|
| 1 | "SARVIS" | SARVIS |
| 2 | "따라와" | 따라와 |
| 3 | "이리와" | 이리와 |
| 4 | "집어" | 집어 |

#### API 호출

| API | Method | Endpoint | 설명 |
|-----|---------|----------|--------|
| 음성 벡터 저장 | POST | `/api/biometric/save-voice/` | 4x192 음성 벡터 저장 |

#### 요청/응답

**요청: Jetson 서버**
```json
POST /register/upload
FormData: {
  uid: "user-uid",
  audio: [audio_1.wav, audio_2.wav, audio_3.wav, audio_4.wav]
}
```

**요청: Django 서버**
```json
POST /api/biometric/save-voice/
{
  "uid": "550e8400-e29b-41d4-a716-446655440000",
  "voice_vector": [
    [0.111, 0.222, ...],  // 192차원
    [0.112, 0.223, ...],
    [0.113, 0.224, ...],
    [0.114, 0.225, ...]
  ]
}
```

**응답: Django 서버**
```json
{
  "success": true,
  "message": "음성 벡터 저장 완료",
  "uid": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 테스트 체크리스트

- [ ] 마이크 권한 요청 작동 확인
- [ ] 실시간 녹음 기능 작동 확인
- [ ] 파일 선택 기능 작동 확인
- [ ] 4개 파일 선택 시 유효성 검사
- [ ] 녹음 파일 이름 표시 확인
- [ ] Jetson 서버로 파일 전송 작동 확인
- [ ] 진행 상태 메시지 표시 확인
- [ ] 진행률 표시 확인
- [ ] Django API 호출 작동 확인
- [ ] 회원가입 완료 알림 작동 확인
- [ ] 로그인 화면 자동 이동 확인

---

## 테스트 시나리오

### 시나리오 1: 정상 회원가입

1. Step 1에서 모든 필수 정보 입력
2. 이메일 인증 코드 `999999` 입력 (개발용)
3. [정보 입력 완료] 클릭
4. Step 2에서 기기 연결 대기
5. 연결 성공 시 [다음] 클릭
6. Step 3에서 5장 얼굴 사진 촬영
7. [얼굴 등록하기] 클릭
8. Step 4에서 4개 음성 파일 등록
9. [음성 등록하기] 클릭
10. 회원가입 완료 알림 확인
11. 로그인 화면 자동 이동 확인

**예상 결과**: 모든 단계 성공적으로 완료

### 시나리오 2: 기기 연결 실패

1. Step 1 완료
2. Step 2 진입
3. Jetson 장치 꺼져 있음
4. 30초 대기
5. 재시도 버튼 표시 확인
6. [기기 연결 재시도] 클릭
7. Jetson 장치 켜기
8. 연결 성공 확인

**예상 결과**: 재시도 후 연결 성공

### 시나리오 3: 이메일 인증 실패

1. 이메일 입력
2. [중복확인 및 인증번호 발송] 클릭
3. 잘못된 인증 코드 `123456` 입력
4. [인증하기] 클릭
5. 에러 메시지 표시 확인
6. 올바른 인증 코드 `999999` 입력
7. [인증하기] 클릭
8. 인증 성공 확인

**예상 결과**: 인증 실패 후 재시도 시 성공

### 시나리오 4: 회원가입 취소

1. Step 1 진입
2. 부분 정보 입력
3. [가입 취소] 클릭
4. 취소 확인 다이얼로그 표시
5. [아니오] 클릭 → 화면 유지
6. [가입 취소] 클릭
7. 취소 확인 다이얼로그 표시
8. [네] 클릭 → 로그인 화면 이동

**예상 결과**: 취소 확인 시 로그인 화면 이동

---

## 문제 해결

### Jetson 연결 실패

**증상**
- "기기 연결 실패" 메시지 표시
- 재시도해도 연결 안 됨

**해결방법**
1. Jetson 장치가 켜져 있는지 확인
2. SoftAP가 활성화되어 있는지 확인
   ```bash
   # Jetson에서 확인
   nmcli dev wifi list
   ```
3. Jetson IP 확인: `10.42.0.1`
4. Jetson 포트 확인: `5000`
5. 방화벽 확인:
   ```bash
   sudo ufw status
   sudo ufw allow 5000
   ```

### 이메일 인증 실패

**증상**
- "인증 코드가 틀리거나 만료되었습니다" 메시지
- 인증 코드 입력 시 에러

**해결방법**
1. 개발용 인증 코드: `999999`
2. 인증 코드 만료 시간: 30분
3. Django 서버 로그 확인:
   ```bash
   # Django 서버
   tail -f djangopjt/debug.log
   ```

### 얼굴/음성 벡터 저장 실패

**증상**
- "Jetson 서버 전송 실패" 메시지
- "얼굴 등록 실패" 메시지

**해결방법**
1. Jetson 서버 로그 확인
2. Django 서버 로그 확인
3. 네트워크 연결 상태 확인
4. 파일 크기 확인:
   - 이미지: 각각 5MB 이하
   - 오디오: 각각 10MB 이하

---

## 개발자 참고사항

### 환경변수

**API Base URL** (`FRONTEND/sarvis/utils/api.ts`)
```typescript
const API_BASE_URL = 'http://10.42.0.1:8000/api';
```

**SoftAP Jetson IP** (`FRONTEND/sarvis/utils/softap-communication.ts`)
```typescript
constructor(jetsonIP: string = '10.42.0.1', port: number = 5000)
```

### Jetson 서버 엔드포인트

Jetson 서버는 다음 엔드포인트를 구현해야 합니다:

```python
# Jetson 서버 (Python/Flask)

@app.route('/register/upload', methods=['POST'])
def register_upload():
    uid = request.form.get('uid')
    
    # 이미지 처리 (face_vector 추출)
    images = request.files.getlist('image')
    face_vectors = extract_face_vectors(images)
    
    # 오디오 처리 (voice_vector 추출)
    audios = request.files.getlist('audio')
    voice_vectors = extract_voice_vectors(audios)
    
    return jsonify({
        'success': True,
        'face_vector': face_vectors,  # 5x512
        'voice_vector': voice_vectors  # 4x192
    })
```

### Django API 엔드포인트

Django 서버는 다음 엔드포인트가 이미 구현되어 있어야 합니다:

| Endpoint | Method | 설명 | 상태 |
|---------|---------|---------|-------|
| `/api/register/step1/` | POST | 기본 정보 저장 | ✅ |
| `/api/register/email-request/` | POST | 이메일 인증 코드 발송 | ✅ |
| `/api/register/verify-email/` | POST | 이메일 인증 코드 검증 | ✅ |
| `/api/biometric/save-face/` | POST | 얼굴 벡터 저장 | ✅ |
| `/api/biometric/save-voice/` | POST | 음성 벡터 저장 | ✅ |

### 파일 구조

```
FRONTEND/sarvis/
├── app/
│   └── (auth)/
│       ├── signup.tsx          # 회원가입 시작
│       ├── signup-info.tsx     # Step 1: 정보 입력 + 이메일 인증
│       ├── signup-device.tsx   # Step 2: 기기 연결
│       ├── signup-face.tsx     # Step 3: 얼굴 등록
│       └── signup-voice.tsx    # Step 4: 음성 등록
├── components/
│   └── sarvis/
│       └── sarvis-button.tsx  # 버튼 컴포넌트 (danger variant 추가)
├── utils/
│   ├── api.ts                  # Django API 클라이언트
│   └── softap-communication.ts # SoftAP 통신 클래스 (sendMultipleFiles 추가)
└── package.json                # 의존성: expo-av 추가
```

### 개발용 마스터키

| 항목 | 마스터키 | 설명 |
|------|---------|------|
| 이메일 인증 | `999999` | 개발용 인증 코드 |
| 이메일 유효기간 | 30분 | 인증 코드 유효 시간 |

---

## 📞 연락처

- 문의: 개발팀
- 최종 업데이트: 2026-01-30
- 버전: 1.0.0