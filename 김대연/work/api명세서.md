# Sarvis API 명세서

## 📋 목차

1. [인증/인가](#인증인가)
2. [생체 정보](#생체-정보)
3. [사용자 프로필](#사용자-프로필)
4. [비밀번호/아이디 찾기](#비밀번호아이디-찾기)
5. [기기 연결](#기기-연결)
6. [웹소켓 연결](#웹소켓-연결)
7. [세션 관리](#세션-관리)
8. [프리셋 관리](#프리셋-관리)
9. [GMS 키 관리](#gms-키-관리)
10. [로봇 제어](#로봇-제어)
11. [명령 로그 관리](#명령-로그-관리)
12. [회원 탈퇴](#회원-탈퇴)

---

## 📌 공통 헤더

### JWT 토큰이 필요한 API
```
Authorization: Bearer <access_token>
```

### 공통 응답 형식
```json
{
  "success": true/false,
  "message": "메시지 내용",
  "data": {}
}
```

---

## 🔐 인증/인가

### 1. 회원가입 1단계 - 기본 정보 입력

**Endpoint**: `POST /api/register/step1/`

**설명**: 사용자의 기본 정보를 입력받고 30분 동안 캐시에 저장

**Request Body**:
```json
{
  "login_id": "testuser123",
  "password": "Password123!",
  "password_confirm": "Password123!",
  "email": "user@example.com",
  "nickname": "테스터"
}
```

**Request Fields**:
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| login_id | string | ✅ | 아이디 (영문, 숫자, 4-20자) |
| password | string | ✅ | 비밀번호 (8자 이상, 영문+숫자+특수문자) |
| password_confirm | string | ✅ | 비밀번호 확인 |
| email | string | ✅ | 이메일 주소 |
| nickname | string | ✅ | 닉네임 (2-20자) |

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "기본 정보가 확인되었습니다.",
  "login_id": "testuser123",
  "email": "user@example.com",
  "next_step": "collect_biometric_data"
}
```

**Response (실패 - 400)**:
```json
{
  "success": false,
  "errors": {
    "login_id": ["이미 사용 중인 아이디입니다."],
    "password": ["비밀번호가 일치하지 않습니다."]
  }
}
```

---

### 2. 이메일 인증 코드 요청

**Endpoint**: `POST /api/register/email-request/`

**설명**: 입력한 이메일로 6자리 인증 코드 발송

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "인증 코드가 발송되었습니다.",
  "expires_in": 1800
}
```

**개발자 참고**: 실제 이메일 대신 콘솔에 인증 코드 출력됨

---

### 3. 이메일 인증 코드 검증

**Endpoint**: `POST /api/register/verify-email/`

**설명**: 이메일로 받은 인증 코드 검증. 인증 성공 시 User가 생성되고 uid가 반환됩니다.

**Request Body**:
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Request Fields**:
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| email | string | ✅ | 이메일 주소 |
| code | string | ✅ | 6자리 인증 코드 (개발 시 "999999" 사용) |

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "이메일 인증 완료",
  "uid": "550e8400-e29b-41d4-a716-446655440000",
  "login_id": "testuser123",
  "email": "user@example.com",
  "next_step": "upload_biometric_data"
}
```

**Response (실패 - 400)**:
```json
{
  "success": false,
  "message": "인증 코드가 틀리거나 만료되었습니다"
}
```

**Response (실패 - 400)**:
```json
{
  "success": false,
  "message": "회원가입 정보가 만료되었습니다. 다시 시작해주세요."
}
```

---

### 4. 비밀번호 로그인

**Endpoint**: `POST /api/login/password/`

**설명**: 아이디와 비밀번호로 로그인 후 JWT 토큰 발급

**Request Body**:
```json
{
  "login_id": "testuser123",
  "password": "Password123!"
}
```

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "로그인 성공",
  "user_id": 1,
  "uid": "550e8400-e29b-41d4-a716-446655440000",
  "login_id": "testuser123",
  "nickname": "테스터",
  "email": "user@example.com",
  "login_method": "password",
  "tokens": {
    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Response (실패 - 401)**:
```json
{
  "success": false,
  "message": "아이디 또는 비밀번호가 일치하지 않습니다."
}
```

---

### 5. 얼굴 로그인 요청 (앱 → 서버 → 젯슨)

**Endpoint**: `POST /api/login/request-face/`

**설명**: 젯슨에 얼굴 인식 시작 요청

**Request**: Body 없음

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "얼굴 인식 시작"
}
```

**Response (실패 - 502/503)**:
```json
{
  "success": false,
  "message": "젯슨 연결 실패"
}
```

---

### 6. 얼굴 로그인 (벡터 매칭)

**Endpoint**: `POST /api/login/face/`

**설명**: 얼굴 벡터(512차원)를 받아 코사인 유사도 계산으로 로그인

**Request Body**:
```json
{
  "face_vector": [0.123, 0.456, 0.789, ...]
}
```

**Request Fields**:
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| face_vector | array[float] | ✅ | 얼굴 벡터 (512차원) |

**Response (성공 - 200)**:
```json
{
  "success": true,
  "login_method": "face",
  "uid": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": 1,
  "login_id": "testuser123",
  "nickname": "테스터",
  "email": "user@example.com",
  "similarity": 0.95,
  "tokens": {
    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Response (실패 - 401)**:
```json
{
  "success": false,
  "reason": "FACE_NOT_MATCH",
  "fallback": "PASSWORD_LOGIN",
  "message": "얼굴 인식에 실패했습니다. 아이디와 비밀번호로 로그인해주세요."
}
```

---

### 7. 토큰 갱신

**Endpoint**: `POST /api/auth/refresh/`

**설명**: Refresh Token으로 새로운 Access Token 발급

**Request Body**:
```json
{
  "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (성공 - 200)**:
```json
{
  "success": true,
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "message": "토큰이 갱신되었습니다."
}
```

---

### 8. 로그아웃

**Endpoint**: `POST /api/auth/logout/`

**Headers**: `Authorization: Bearer <access_token>`

**Request Body**:
```json
{
  "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "로그아웃되었습니다."
}
```

---

## 🧬 생체 정보

### 9. 얼굴 벡터 저장 (젯슨 → Django)

**Endpoint**: `POST /api/biometric/save-face/`

**설명**: 젯슨에서 처리된 얼굴 벡터를 DB에 저장

**Request Body**:
```json
{
  "uid": "550e8400-e29b-41d4-a716-446655440000",
  "face_vector": [
    [0.123, 0.456, ...],  // 5장의 얼굴 사진 벡터 (각 512차원)
    [0.234, 0.567, ...],
    [0.345, 0.678, ...],
    [0.456, 0.789, ...],
    [0.567, 0.890, ...]
  ]
}
```

**Request Fields**:
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| uid | string | ✅ | 사용자 UUID |
| face_vector | array | ✅ | 5x512 얼굴 벡터 배열 (각각 512차원) |

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "얼굴 벡터 저장 완료",
  "uid": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (실패 - 400)**:
```json
{
  "success": false,
  "reason": "INVALID_PAYLOAD",
  "errors": {
    "face_vector": ["얼굴 벡터는 512차원 벡터 5개여야 합니다."]
  }
}
```

**Response (실패 - 404)**:
```json
{
  "success": false,
  "reason": "USER_NOT_FOUND"
}
```

---

### 10. 음성 벡터 저장 (젯슨 → Django)

**Endpoint**: `POST /api/biometric/save-voice/`

**설명**: 젯슨에서 처리된 음성 벡터를 DB에 저장

**Request Body**:
```json
{
  "uid": "550e8400-e29b-41d4-a716-446655440000",
  "voice_vector": [
    [0.111, 0.222, 0.333, ...],  // 1번째 음성 파일 벡터 (192차원)
    [0.112, 0.223, 0.334, ...],  // 2번째 음성 파일 벡터 (192차원)
    [0.113, 0.224, 0.335, ...],  // 3번째 음성 파일 벡터 (192차원)
    [0.114, 0.225, 0.336, ...]   // 4번째 음성 파일 벡터 (192차원)
  ]
}
```

**Request Fields**:
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| uid | string | ✅ | 사용자 UUID |
| voice_vector | array | ✅ | 4x192 음성 벡터 배열 (각각 192차원) |

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "음성 벡터 저장 완료",
  "uid": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (실패 - 400)**:
```json
{
  "success": false,
  "reason": "INVALID_PAYLOAD",
  "errors": {
    "voice_vector": ["음성 벡터는 192차원 벡터 4개여야 합니다."]
  }
}
```

**Response (실패 - 404)**:
```json
{
  "success": false,
  "reason": "USER_NOT_FOUND"
}
```

---

## 👤 사용자 프로필

### 12. 프로필 조회

**Endpoint**: `GET /api/user/profile/`

**Headers**: `Authorization: Bearer <access_token>`

**Response (성공 - 200)**:
```json
{
  "success": true,
  "user": {
    "user_id": 1,
    "uid": "550e8400-e29b-41d4-a716-446655440000",
    "login_id": "testuser123",
    "email": "user@example.com",
    "nickname": "테스터",
    "created_at": "2024-01-01T00:00:00Z",
    "last_login_at": "2024-01-15T10:30:00Z",
    "has_voice": true
  }
}
```

---

### 13. 프로필 수정

**Endpoint**: `PATCH /api/user/profile/update/`

**Headers**: `Authorization: Bearer <access_token>`

**Request Body**:
```json
{
  "nickname": "새로운닉네임"
}
```

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "프로필이 수정되었습니다.",
  "user": {
    "user_id": 1,
    "uid": "550e8400-e29b-41d4-a716-446655440000",
    "login_id": "testuser123",
    "email": "user@example.com",
    "nickname": "새로운닉네임"
  }
}
```

---

## 🔍 비밀번호/아이디 찾기

### 14. 아이디 찾기

**Endpoint**: `POST /api/find-id/`

**Request Body**:
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Response (성공 - 200)**:
```json
{
  "success": true,
  "login_id": "testuser123",
  "uid": "550e8400-e29b-41d4-a716-4466554400000"
}
```

**Response (실패 - 404)**:
```json
{
  "success": false,
  "message": "해당 이메일 유저가 없습니다."
}
```

---

### 15. 비밀번호 재설정 요청

**Endpoint**: `POST /api/password/reset-request/`

**Request Body**:
```json
{
  "login_id": "testuser123",
  "email": "user@example.com"
}
```

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "인증 코드가 생성되었습니다."
}
```

---

### 16. 비밀번호 재설정 코드 검증

**Endpoint**: `POST /api/password/reset-verify-code/`

**Request Body**:
```json
{
  "login_id": "testuser123",
  "email": "user@example.com",
  "code": "123456"
}
```

**Response (성공 - 200)**:
```json
{
  "success": true,
  "reset_token": "abc123def456ghi789..."
}
```

---

### 17. 새 비밀번호 설정

**Endpoint**: `POST /api/password/reset-set-new/`

**Request Body**:
```json
{
  "reset_token": "abc123def456ghi789...",
  "new_password": "NewPassword123!"
}
```

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "비밀번호 변경 완료"
}
```

---

## 📱 기기 연결

### 17. 연결 해제

**Endpoint**: `DELETE /api/device/disconnection/`

**Headers**: `Authorization: Bearer <access_token>`

**Request Body**:
```json
{
  "phone_uuid": "phone-uuid-123",
  "rpi_serial_number": "rpi-serial-456"
}
```

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "블루투스 연결이 해제되었습니다.",
  "connection_uuid": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## 🔌 웹소켓 연결

### 18. 블루투스 연결 상태 감지 (WebSocket)

**WebSocket Endpoint**: `ws://your-server.com/ws/bluetooth/{connection_uuid}/?token={jwt_token}`

**설명**: 블루투스 연결 상태를 실시간으로 감지하고 세션을 자동으로 관리합니다. 연결 시 세션이 자동으로 시작되고, 연결 종료 시 세션이 자동으로 종료됩니다. 10초마다 하트비트를 전송하여 연결 상태를 유지합니다.

**요청 파라미터**:
| 파라미터 | 타입 | 위치 | 필수 | 설명 |
|---------|------|------|------|------|
| connection_uuid | string | URL path | ✅ | 연결 UUID |
| token | string | query string | ✅ | JWT Access Token |

**인증**: JWT 토큰은 쿼리 파라미터 또는 WebSocket 하위 프로토콜 헤더에서 전달 가능

#### 연결 성공 응답 (Server → Client)

```json
{
  "type": "connection_established",
  "message": "블루투스 연결이 성공했습니다.",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 하트비트 요청 (Client → Server)

클라이언트는 10초마다 하트비트를 전송해야 합니다.

```json
{
  "type": "heartbeat"
}
```

#### 하트비트 응답 (Server → Client)

```json
{
  "type": "heartbeat_ack",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### 명령 로그 전송 (Client → Server)

```json
{
  "type": "command_log",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "command_type": "MOVE",
  "command_content": "FORWARD",
  "is_success": true,
  "error_message": null
}
```

**Command Types**:
- `MOVE`: 이동 명령
- `GRAB`: 집기 명령
- `RELEASE`: 놓기 명령
- `STOP`: 정지 명령

#### 연결 종료

클라이언트가 연결을 종료하면 서버가 자동으로 세션을 종료합니다.

**WebSocket 닫기 코드**:
| 코드 | 설명 |
|------|------|
| 1000 | 정상 종료 |
| 4000 | 서버 내부 에러 |
| 4001 | 인증 실패 (유효하지 않은 토큰) |
| 4002 | connection_uuid 누락 |
| 4003 | 연결 정보 없음 (유효하지 않은 connection_uuid) |

#### 클라이언트 예시 코드 (JavaScript)

```javascript
// 웹소켓 연결
const socket = new WebSocket(
  `ws://your-server.com/ws/bluetooth/${connection_uuid}/?token=${accessToken}`
);

// 연결 성공
socket.onopen = (event) => {
  console.log('블루투스 연결 성공');
  
  // 10초마다 하트비트 전송
  setInterval(() => {
    socket.send(JSON.stringify({ type: 'heartbeat' }));
  }, 10000);
};

// 메시지 수신
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('서버 메시지:', data);
  
  if (data.type === 'connection_established') {
    console.log('세션 ID:', data.session_id);
    // session_id를 저장하여 후속 요청에 사용
  }
};

// 연결 종료
socket.onclose = (event) => {
  console.log('연결 종료 코드:', event.code);
  console.log('연결 종료 사유:', event.reason);
  
  // 재연결 로직
  if (event.code !== 1000) {
    setTimeout(() => reconnect(), 3000);
  }
};

// 에러 처리
socket.onerror = (error) => {
  console.error('WebSocket 에러:', error);
};

// 명령 로그 전송 함수
function sendCommandLog(sessionId, commandType, commandContent, isSuccess, errorMessage = null) {
  socket.send(JSON.stringify({
    type: 'command_log',
    session_id: sessionId,
    command_type: commandType,
    command_content: commandContent,
    is_success: isSuccess,
    error_message: errorMessage
  }));
}
```

#### 연결 흐름

```
1. 클라이언트: WebSocket 연결 요청 (connection_uuid, JWT 토큰)
2. 서버: JWT 토큰 검증
3. 서버: 연결 정보 확인 (connection_uuid)
4. 서버: 활성 세션 확인
5. 서버: 세션이 없으면 자동 생성
6. 서버 → 클라이언트: 연결 성공 응답 (session_id 포함)

[10초마다 반복]
7. 클라이언트 → 서버: 하트비트 전송
8. 서버: 캐시에 하트비트 시간 갱신
9. 서버 → 클라이언트: 하트비트 응답

[명령 로그 전송 시]
10. 클라이언트 → 서버: 명령 로그 전송
11. 서버: 명령 로그 DB에 저장

[연결 종료 시]
12. 클라이언트: WebSocket 연결 종료
13. 서버: 세션 자동 종료
14. 서버: 캐시에서 하트비트 삭제
```

#### 세션 자동 관리

- **세션 시작**: 웹소켓 연결 성공 시 자동으로 세션 생성 (활성 세션이 없는 경우)
- **세션 유지**: 기존 활성 세션이 있으면 해당 세션 유지
- **세션 종료**: 웹소켓 연결 종료 시 자동으로 세션 종료

#### 하트비트 감시

- 클라이언트는 10초마다 하트비트를 전송
- 서버는 하트비트 수신 시간을 캐시에 저장 (30초 타임아웃)
- 30초 동안 하트비트가 없으면 연결 종료로 간주

---

## 📊 세션 관리

> **참고**: 세션 자동 시작/종료는 웹소켓 연결을 통해 자동으로 관리됩니다. 아래 API는 수동 세션 제어가 필요한 경우에만 사용하세요.

### 19. 세션 시작 (수동)

**Endpoint**: `POST /api/session/start/`

**Headers**: `Authorization: Bearer <access_token>`

**Request Body**:
```json
{
  "connection_uuid": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (성공 - 201)**:
```json
{
  "success": true,
  "session_id": "session-uuid-123",
  "started_at": "2024-01-15T10:30:00Z"
}
```

---

### 20. 명령 로그 생성

**Endpoint**: `POST /api/session/command-log/`

**Headers**: `Authorization: Bearer <access_token>`

**Request Body**:
```json
{
  "session_id": "session-uuid-123",
  "command_type": "MOVE",
  "command_content": "FORWARD",
  "is_success": true
}
```

**Command Types**:
- `MOVE`: 이동 명령
- `GRAB`: 집기 명령
- `RELEASE`: 놓기 명령
- `STOP`: 정지 명령

**Response (성공 - 201)**:
```json
{
  "success": true,
  "command_log_id": "log-uuid-456",
  "occurred_at": "2024-01-15T10:31:00Z"
}
```

---

### 21. 세션 종료

**Endpoint**: `POST /api/session/end/`

**Headers**: `Authorization: Bearer <access_token>`

**Request Body**:
```json
{
  "session_id": "session-uuid-123"
}
```

**Response (성공 - 200)**:
```json
{
  "success": true,
  "session_id": "session-uuid-123",
  "ended_at": "2024-01-15T11:00:00Z"
}
```

---

## 🎯 프리셋 관리

### 22. 프리셋 저장 (앱 → 서버 → 젯슨)

**Endpoint**: `POST /api/preset/save/`

**Headers**: `Authorization: Bearer <access_token>`

**설명**: 프리셋 저장 요청. 서버가 젯슨에 현재 각도 정보(x, y, z, tilt, has)를 요청하고 DB에 저장합니다.

**Request Body**:
```json
{
  "connection_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "name": "집합 프리셋"
}
```

**Request Fields**:
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| connection_uuid | string | ✅ | 연결 UUID |
| name | string | ❌ | 프리셋 이름 (선택사항, 없으면 "프리셋 HH:MM" 형식) |

**젯슨으로 전달되는 요청**:
```
GET {JETSON_BASE_URL}/robot/get-current-angle/
```

**젯슨에서 받아야 할 응답**:
```json
{
  "x": 100.5,
  "y": 200.3,
  "z": 50.7,
  "tilt": 45.0,
  "has": 1
}
```

**Response (성공 - 201)**:
```json
{
  "success": true,
  "message": "프리셋이 저장되었습니다.",
  "preset": {
    "preset_id": 1,
    "name": "집합 프리셋",
    "x": 100.5,
    "y": 200.3,
    "z": 50.7,
    "tilt": 45.0,
    "has": 1
  }
}
```

---

### 23. 프리셋 목록 조회

**Endpoint**: `GET /api/preset/list/`

**Headers**: `Authorization: Bearer <access_token>`

**Query Parameters**:
- `connection_uuid` (선택): 특정 연결의 프리셋만 조회

**Response (성공 - 200)**:
```json
{
  "success": true,
  "count": 3,
  "presets": [
    {
      "preset_id": 1,
      "name": "집합 프리셋",
      "x": 100.5,
      "y": 200.3,
      "z": 50.7,
      "tilt": 45.0,
      "has": 1,
      "is_active": true,
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-15T10:00:00Z"
    },
    {
      "preset_id": 2,
      "name": "식사 프리셋",
      "x": 150.2,
      "y": 180.5,
      "z": 75.9,
      "tilt": 30.0,
      "has": 0,
      "is_active": true,
      "created_at": "2024-01-15T11:00:00Z",
      "updated_at": "2024-01-15T11:00:00Z"
    }
  ]
}
```

---

### 24. 프리셋 로드 및 로봇 조종

**Endpoint**: `POST /api/preset/load/`

**Headers**: `Authorization: Bearer <access_token>`

**설명**: 프리셋 로드 요청. 서버가 DB에서 프리셋을 조회하고 젯슨으로 전송합니다. 젯슨은 라즈베리파이를 통해 로봇팔을 조종합니다.

**Request Body**:
```json
{
  "preset_id": 1
}
```

**Request Fields**:
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| preset_id | integer | ✅ | 프리셋 ID |

**젯슨으로 전달되는 데이터**:
```json
{
  "preset_id": 1,
  "x": 100.5,
  "y": 200.3,
  "z": 50.7,
  "tilt": 45.0,
  "has": 1
}
```

**젯슨에서 구현해야 할 엔드포인트**:
```python
@app.route('/robot/load-preset/', methods=['POST'])
def load_preset():
    data = request.json
    
    preset_id = data['preset_id']
    x = data['x']
    y = data['y']
    z = data['z']
    tilt = data['tilt']
    has = data['has']
    
    # 라즈베리파이로 프리셋 정보 전송
    # ...
    
    return jsonify({'success': True})
```

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "프리셋이 로드되었습니다.",
  "preset": {
    "preset_id": 1,
    "x": 100.5,
    "y": 200.3,
    "z": 50.7,
    "tilt": 45.0,
    "has": 1
  }
}
```

---

## 🔑 GMS 키 관리

### 25. GMS API 키 조회 (젯슨 → Django)

**Endpoint**: `GET /api/gms/key/`

**설명**: 젯슨이 GMS API 키 요청 (명령어마다 요청)

**Response (성공 - 200)**:
```json
{
  "success": true,
  "gms_key": "your-gms-api-key-here"
}
```

**Response (실패 - 500)**:
```json
{
  "success": false,
  "message": "GMS API 키가 설정되지 않았습니다."
}
```

---

## 🤖 로봇 제어

### 26. 로봇 각도 업데이트 (싸비스 → Django)

**Endpoint**: `POST /api/robot/update/`

**설명**: 싸비스가 로봇의 각도 정보(x, y, z, tilt, has)를 서버에 저장

**Request Body**:
```json
{
  "x": 100.5,
  "y": 200.3,
  "z": 50.7,
  "tilt": 45.0,
  "has": 1
}
```

**Request Fields**:
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| x | float | ✅ | X축 이동값 |
| y | float | ✅ | Y축 이동값 |
| z | float | ✅ | Z축 이동값 (거리) |
| tilt | float | ✅ | Tilt 회전값 |
| has | integer | ✅ | HAS 회전값 |

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "각도 정보가 저장되었습니다.",
  "data": {
    "x": 100.5,
    "y": 200.3,
    "z": 50.7,
    "tilt": 45.0,
    "has": 1
  }
}
```

**Response (실패 - 400)**:
```json
{
  "success": false,
  "message": "필수 필드 누락: x"
}
```

---

### 27. 최신 각도 정보 조회 (싸비스 → Django)

**Endpoint**: `GET /api/robot/latest/`

**설명**: 캐시에 저장된 최신 로봇 각도 정보 조회

**Response (성공 - 200)**:
```json
{
  "success": true,
  "data": {
    "x": 100.5,
    "y": 200.3,
    "z": 50.7,
    "tilt": 45.0,
    "has": 1
  }
}
```

**Response (데이터 없음 - 200)**:
```json
{
  "success": true,
  "message": "No data in cache",
  "data": {
    "x": 0,
    "y": 0,
    "z": 50,
    "tilt": 0,
    "has": 0
  }
}
```

---

## 📝 명령 로그 관리

> **참고**: 모든 명령은 세션이 활성화된 상태에서만 기록됩니다. 세션은 로그인 시 자동으로 시작되며, 싸비스와 연결이 끊어지면 자동으로 종료됩니다.

### 29. 제어 화면 진입 신호

**Endpoint**: `POST /api/control/enter/`

**Headers**: `Authorization: Bearer <access_token>`

**설명**: 사용자가 제어 화면에 진입할 때 호출됩니다. 활성 세션이 없으면 자동으로 세션을 시작합니다.

**Request Body**:
```json
{
  "connection_uuid": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "제어 화면 진입 성공",
  "session_id": 123,
  "started_at": "2024-01-15T10:30:00Z",
  "is_new_session": true
}
```

**Response (실패 - 404)**:
```json
{
  "success": false,
  "message": "연결 정보를 찾을 수 없습니다."
}
```

---

### 30. 버튼 명령 전달

**Endpoint**: `POST /api/control/button/`

**Headers**: `Authorization: Bearer <access_token>`

**설명**: 제어 화면에서 버튼 클릭 시 명령을 전달하고 DB에 저장합니다. 명령은 자동으로 젯슨으로 전달됩니다.

**Request Body**:
```json
{
  "connection_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "button_type": "FORWARD",
  "button_label": "앞으로"
}
```

**Request Fields**:
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| connection_uuid | string | ✅ | 연결 UUID |
| button_type | string | ✅ | 버튼 타입 (예: FORWARD, BACKWARD, LEFT, RIGHT, GRAB, RELEASE) |
| button_label | string | ❌ | 버튼 표시 텍스트 (선택사항) |

**Button Types**:
| 타입 | 설명 |
|------|------|
| FORWARD | 앞으로 이동 |
| BACKWARD | 뒤로 이동 |
| LEFT | 왼쪽으로 이동 |
| RIGHT | 오른쪽으로 이동 |
| GRAB | 집기 |
| RELEASE | 놓기 |
| STOP | 정지 |
| UP | 위로 이동 |
| DOWN | 아래로 이동 |

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "버튼 명령 전송 성공",
  "command_log_id": 456,
  "button_type": "FORWARD",
  "timestamp": "2024-01-15T10:31:00Z"
}
```

**Response (실패 - 400)**:
```json
{
  "success": false,
  "message": "활성 세션이 없습니다. 제어 화면을 먼저 진입해주세요."
}
```

**Response (실패 - 502)**:
```json
{
  "success": false,
  "message": "젯슨과 통신 실패",
  "command_log_id": 456
}
```

**젯슨으로 전달되는 데이터**:
```json
{
  "button_type": "FORWARD",
  "button_label": "앞으로",
  "timestamp": "2024-01-15T10:31:00Z"
}
```

---

### 31. 음성 명령 수신 (젯슨 → Django)

**Endpoint**: `POST /api/control/voice/`

**설명**: 젯슨에서 음성 명령을 인식하여 서버에 전달합니다. 명령은 DB에 저장됩니다.

**Request Body**:
```json
{
  "session_id": 123,
  "voice_command": "싸비스따라와",
  "confidence": 0.95
}
```

**Request Fields**:
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| session_id | integer | ✅ | 세션 ID |
| voice_command | string | ✅ | 음성 명령어 |
| confidence | float | ❌ | 인식 정확도 (0.0 ~ 1.0, 선택사항) |

**Voice Commands**:
| 명령어 | 설명 |
|--------|------|
| 싸비스따라와 | 싸비스가 따라오도록 명령 |
| 이리와 | 로봇이 이리 오도록 명령 |
| 따라와 | 로봇이 따라오도록 명령 |
| 멈춰 | 로봇 멈춤 |
| 집어 | 물건 집기 |
| 놔 | 물건 놓기 |

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "음성 명령 로그 저장 성공",
  "command_log_id": 457,
  "voice_command": "싸비스따라와",
  "confidence": 0.95
}
```

**Response (실패 - 404)**:
```json
{
  "success": false,
  "message": "세션을 찾을 수 없습니다."
}
```

---

### 32. 메인페이지 버튼 클릭

**Endpoint**: `POST /api/main/button/`

**Headers**: `Authorization: Bearer <access_token>`

**설명**: 메인페이지에서 '이리와', '따라와' 등 버튼 클릭 시 신호를 기록합니다. 활성 세션이 없으면 자동으로 생성됩니다.

**Request Body**:
```json
{
  "connection_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "button_type": "COME_HERE",
  "button_label": "이리와"
}
```

**Request Fields**:
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| connection_uuid | string | ✅ | 연결 UUID |
| button_type | string | ✅ | 버튼 타입 |
| button_label | string | ❌ | 버튼 표시 텍스트 (선택사항) |

**Button Types**:
| 타입 | 설명 |
|------|------|
| COME_HERE | 이리와 |
| FOLLOW | 따라와 |

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "메인페이지 버튼 로그 저장 성공",
  "command_log_id": 458,
  "button_type": "COME_HERE",
  "button_label": "이리와",
  "timestamp": "2024-01-15T10:32:00Z"
}
```

**Response (실패 - 404)**:
```json
{
  "success": false,
  "message": "연결 정보를 찾을 수 없습니다."
}
```

---

## 명령 로그 통신 플로우

### 제어 화면 플로우
```
1. 앱 → Django: 제어 화면 진입 신호 (connection_uuid)
2. Django: 활성 세션 확인
3. Django: 세션이 없으면 자동 생성
4. Django → 앱: session_id 반환

[버튼 클릭마다 반복]
5. 앱 → Django: 버튼 명령 전달 (button_type, button_label)
6. Django: 명령 로그 저장 (command_type: BUTTON)
7. Django → Jetson: 버튼 명령 전달
8. Jetson: 로봇 제어
9. Django → 앱: 전송 성공 응답
```

### 음성 명령 플로우
```
1. 사용자: 음성 명령 발화 (예: "싸비스따라와")
2. Jetson: 음성 인식
3. Jetson → Django: 음성 명령 전달 (session_id, voice_command)
4. Django: 명령 로그 저장 (command_type: VOICE)
5. Django → Jetson: 저장 성공 응답
```

### 메인페이지 버튼 플로우
```
1. 사용자: 메인페이지 버튼 클릭 (예: "이리와")
2. 앱 → Django: 버튼 클릭 신호 (connection_uuid, button_type)
3. Django: 활성 세션 확인
4. Django: 세션이 없으면 자동 생성
5. Django: 명령 로그 저장 (command_type: MAIN_PAGE_BUTTON)
6. Django → 앱: 저장 성공 응답
```

---

### CommandLog 데이터 구조

```python
{
    "command_log_id": 456,          # 명령 로그 ID (PK)
    "session_id": 123,              # 세션 ID (FK)
    "command_type": "BUTTON",         # 명령 타입 (BUTTON, VOICE, MAIN_PAGE_BUTTON)
    "command_content": "FORWARD:앞으로",  # 명령 내용
    "is_success": true,             # 실행 성공 여부
    "error_message": null,          # 에러 메시지 (실패 시)
    "occurred_at": "2024-01-15T10:31:00Z"  # 발생 시간
}
```

### Command Types
| 타입 | 설명 | 예시 |
|------|------|------|
| BUTTON | 제어 화면 버튼 | FORWARD:앞으로, GRAB:집기 |
| VOICE | 음성 명령 | 싸비스따라와, 이리와 |
| MAIN_PAGE_BUTTON | 메인페이지 버튼 | COME_HERE:이리와, FOLLOW:따라와 |

---

## 젯슨 통신 추가 사항

### 젯슨에서 구현해야 할 엔드포인트

#### 버튼 명령 수신 (Django → Jetson)
```python
@app.route('/robot/button-command/', methods=['POST'])
def button_command():
    data = request.json
    
    button_type = data['button_type']
    button_label = data.get('button_label')
    timestamp = data['timestamp']
    
    # 로봇 제어 로직 실행
    # ...
    
    return jsonify({'success': True})
```

---

## ❌ 회원 탈퇴

### 33. 회원 탈퇴

**Endpoint**: `POST /api/account/delete/`

**Headers**: `Authorization: Bearer <access_token>`

**Request Body**:
```json
{
  "login_id": "testuser123",
  "password": "Password123!",
  "deletion_reason": "OTHER"
}
```

**Deletion Reasons**:
- `NOT_USING`: 더 이상 사용하지 않음
- `DISSATISFIED`: 서비스 불만족
- `PRIVACY`: 개인정보 우려
- `OTHER`: 기타 사유

**Response (성공 - 200)**:
```json
{
  "success": true,
  "message": "회원 탈퇴가 완료되었습니다.",
  "login_id": "testuser123"
}
```

**Response (실패 - 401)**:
```json
{
  "success": false,
  "message": "비밀번호가 일치하지 않습니다."
}
```

---

## 📚 공통 HTTP 상태 코드

| 코드 | 설명 |
|------|------|
| 200 | 성공 (OK) |
| 201 | 생성 완료 (Created) |
| 400 | 잘못된 요청 (Bad Request) |
| 401 | 인증 실패 (Unauthorized) |
| 403 | 권한 없음 (Forbidden) |
| 404 | 리소스 없음 (Not Found) |
| 500 | 서버 내부 에러 (Internal Server Error) |
| 502 | 잘못된 게이트웨이 (Bad Gateway) - Jetson 통신 실패 |
| 503 | 서비스 불가 (Service Unavailable) - Jetson 연결 실패 |

---

## 🔧 개발자 참고사항

### Jetson 통신 URL
```python
JETSON_BASE_URL = "https://unforetold-jannet-hydropically.ngrok-free.dev"
```

### 캐시 키
```python
# 로봇 각도 정보
ROBOT_ANGLE_CACHE_KEY = "robot_angle_data"

# 회원가입 임시 데이터
REGISTRATION_CACHE_KEY = "registration:{login_id}"  # 30분 유효
```

### 코사인 유사도 임계값
```python
FACE_SIMILARITY_THRESHOLD = 0.5
```

### 마스터키 (개발용)
- 이메일 인증: `999999`
- 비밀번호 찾기: `999999`

### 환경변수
```env
GMS_API_KEY=your-gms-api-key-here
```

---

## 📱 앱 통신 플로우 예시

### 회원가입 완료 플로우
```
1. POST /api/register/step1/ (기본 정보)
2. POST /api/register/email-request/ (인증 코드 요청)
3. POST /api/register/verify-email/ (코드 검증) → User 생성 및 uid 반환
4. 앱 → Jetson: 얼굴 이미지 + 음성 파일 업로드
5. Jetson: 얼굴 벡터 추출 (5장 x 512차원)
6. Jetson: 음성 벡터 추출 (4개 x 192차원)
7. Jetson → Django: 얼굴 벡터 저장 (POST /api/biometric/save-face/) + uid
8. Jetson → Django: 음성 벡터 저장 (POST /api/biometric/save-voice/) + uid
```

### 얼굴 로그인 플로우
```
1. POST /api/login/request-face/ (젯슨에 요청)
2. 젯슨에서 얼굴 인식 후 벡터 반환
3. POST /api/login/face/ (벡터로 로그인)
4. JWT 토큰 수신 및 저장
```

### 프리셋 저장 플로우
```
1. POST /api/preset/save/ (저장 요청)
2. Django → Jetson (현재 각도 요청)
3. Jetson → Django (각도 정보 전송)
4. Django (DB에 프리셋 저장)
```

### 프리셋 로드 플로우
```
1. POST /api/preset/load/ (로드 요청)
2. Django (DB에서 프리셋 조회)
3. Django → Jetson (프리셋 정보 전송)
4. Jetson → 라즈베리파이 (프리셋 정보 전송)
5. 라즈베리파이 → 싸비스 (로봇팔 조종)
```

---

## 📞 연락처

- 문의: 개발팀
- 최종 업데이트: 2026-01-30
- 버전: 1.0.0