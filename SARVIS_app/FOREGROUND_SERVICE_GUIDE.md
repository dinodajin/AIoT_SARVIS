# Android Foreground Service 구현 가이드

## 개요
Android Foreground Service를 사용하여 백그라운드에서 WebSocket 연결을 유지하는 방법입니다.

## 기능
- 상단바에 "SARVIS 실행 중" 알림 표시
- 백그라운드에서 WebSocket 연결 유지
- 실시간 상태 업데이트 (연결, 명령 처리 등)
- 자동 재연결 기능

## 사용 방법

### 1. 권한 설정
`app.json`에 필요한 권한이 추가됨:
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_SPECIAL_USE`
- `WAKE_LOCK`

### 2. WebSocket 연결 시 자동 시작
```typescript
import { getWebSocketManager } from '../api/websocket';

// WebSocket 연결 시 Foreground Service 자동 시작
const wsManager = getWebSocketManager();
await wsManager.connect(sessionId, handlers);
```

### 3. 수동 제어 (필요시)
```typescript
import { foregroundService } from '../services/ForegroundService';

// Foreground Service 시작
await foregroundService.start();

// 알림 메시지 업데이트
await foregroundService.updateNotification('새로운 상태 메시지');

// Foreground Service 중지
await foregroundService.stop();
```

## 알림 상태 메시지
- `서버 연결 시도 중...` - WebSocket 연결 시도
- `실시간 음성 명령 대기 중...` - 연결 성공 및 대기
- `음성 명령 처리 중...` - 음성 명령 수신 시 (2초간)
- `유튜브 명령 처리 중...` - 유튜브 명령 수신 시 (2초간)
- `연결 오류 - 재연결 시도 중...` - 연결 오류 발생
- `연결 종료 - 재연결 시도 중...` - 연결 종료 및 재연결 시도

## 주의사항

### 장점
- ✅ 백그라운드에서 안정적인 WebSocket 연결 유지
- ✅ 사용자에게 앱 상태 시각적 표시
- ✅ Android 배터리 최적화 회피

### 단점
- ⚠️ 상단바에 항상 알림 표시 (사용자 경험 저하 가능)
- ⚠️ 최신 Android 버전에서 승인 기준 까다로움
- ⚠️ 배터리 소모 증가

### Google Play 스토어 정책
Foreground Service 사용 시 다음을 명확히 설명해야 함:
- 왜 Foreground Service가 필요한지
- 사용자에게 어떤 혜택을 제공하는지
- 언제 중지되는지

## 테스트 방법
```bash
# Android 빌드 및 실행
npm run android

# 앱을 백그라운드로 보내도 상단바에 알림 유지 확인
# WebSocket 연결이 계속 유지되는지 확인
```

## 대안 방법
Foreground Service가 승인되지 않을 경우:
1. **WorkManager**: 주기적인 연결 확인
2. **Background Sync**: 데이터 동기화 시점에만 연결
3. **Push Notification**: 서버에서 앱 깨우기
