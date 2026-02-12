// api/types.ts

/**
 * API 응답 공통 타입
 */
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string[]>;
}

/**
 * JWT 토큰
 */
export interface Tokens {
  access: string;
  refresh: string;
}

/**
 * 로그인 응답
 */
export interface LoginResponse {
  success: boolean;
  message?: string;
  uid?: string;
  user_id?: number;
  login_id?: string;
  nickname?: string;
  email?: string;
  login_method?: 'password' | 'face';
  tokens?: Tokens;
  similarity?: number; // 얼굴 인식 유사도
  face_vectors?: number[][]; // 얼굴 벡터 (얼굴 로그인 시 반환)
  voice_vectors?: number[]; // 음성 벡터 (얼굴 로그인 시 반환)
  presets?: Preset[]; // 프리셋 목록
  has_presets?: boolean; // 프리셋 존재 여부
  session_id?: string; // 세션 ID
  session_started_at?: string; // 세션 시작 시간

  access_token?: any; // 서버가 tokens 대신 access_token을 반환하는 경우 대응
}

/**
 * 회원가입 요청
 */
export interface SignupRequest {
  login_id: string;
  password: string;
  password_confirm: string;
  email: string;
  nickname: string;
}

/**
 * 아이디 중복 확인 응답
 */
export interface CheckIdResponse {
  success: boolean;
  message: string;
  login_id?: string;
  next_step?: string; // 다음 단계
}

/**
 * 이메일 인증 코드 발송 응답
 */
export interface SendEmailCodeResponse {
  success: boolean;
  message: string;
  email?: string;
  expires_in?: number; // 유효시간 (초)
}

/**
 * 이메일 인증 확인 응답
 */
export interface VerifyEmailCodeResponse {
  success: boolean;
  message: string;
  email?: string;
  login_id?: string;
  next_step?: string;
}

/**
 * 회원가입 임시 저장 응답
 */
export interface SignupTempResponse {
  success: boolean;
  message: string;
  login_id?: string;
  nickname?: string;
  next_step?: string;
}

/**
 * 얼굴 벡터 저장 응답
 */
export interface SaveFaceVectorResponse {
  success: boolean;
  message: string;
  login_id?: string;
  next_step?: string;
}

/**
 * 음성 벡터 저장 응답 (회원가입 완료)
 */
export interface SaveVoiceVectorResponse {
  success: boolean;
  message: string;
  uid?: string;
  user_id?: number;
  login_id?: string;
  email?: string;
  nickname?: string;
  tokens?: Tokens; // ✅ 회원가입 완료 시 토큰 반환
  session_id?: string; // ✅ 세션 ID
  session_started_at?: string; // ✅ 세션 시작 시간
  presets?: Preset[]; // ✅ 프리셋 목록
}

/**
 * 음성 등록 건너뛰기 응답
 */
export interface SkipVoiceSignupResponse {
  success: boolean;
  message: string;
}

/**
 * 사용자 프로필
 */
export interface UserProfile {
  user_id: number;
  uid: string;
  login_id: string;
  email: string;
  nickname: string;
  created_at: string;
  last_login_at?: string;
  has_voice?: boolean;
}

/**
 * 아이디 찾기 응답
 */
export interface FindIdResponse {
  success: boolean;
  login_id?: string;
  uid?: string;
  message?: string;
}

/**
 * 비밀번호 재설정 요청 응답
 */
export interface PasswordResetRequestResponse {
  success: boolean;
  message: string;
}

/**
 * 비밀번호 재설정 코드 검증 응답
 */
export interface PasswordResetVerifyResponse {
  success: boolean;
  reset_token?: string;
  message?: string;
}

/**
 * 비밀번호 재설정 완료 응답
 */
export interface PasswordResetCompleteResponse {
  success: boolean;
  message: string;
}

/**
 * 세션 시작 응답
 */
export interface SessionStartResponse {
  success: boolean;
  session_id: string;
  started_at: string;
}

/**
 * 세션 종료 응답
 */
export interface SessionEndResponse {
  success: boolean;
  session_id: string;
  ended_at: string;
}

/**
 * 명령 로그 생성 응답
 */
export interface CommandLogResponse {
  success: boolean;
  command_log_id: number;
  occurred_at: string;
}

/**
 * 제어 화면 진입 응답
 */
export interface ControlEnterResponse {
  success: boolean;
  message: string;
  session_id: string;
  started_at: string;
}

/**
 * 버튼 명령 응답 (기존)
 */
export interface ControlButtonResponse {
  success: boolean;
  message: string;
  command_log_id: number;
  button_type: string;
  timestamp: string;
}

/**
 * 버튼 명령 응답 (새로운 로봇팔 제어)
 */
export interface ButtonCommandResponse {
  success: boolean;
  message: string;
  command: string;
  command_log_id: number;
  jetson_error?: string;
}

/**
 * 버튼 방향 타입
 */
export type ButtonDirection =
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'FAR'
  | 'NEAR'
  | 'YAW_RIGHT'
  | 'YAW_LEFT'
  | 'PITCH_UP'
  | 'PITCH_DOWN'
  | 'COME_HERE'
  | 'TRACK_ON'
  | 'TRACK_OFF'
  | 'HOME';

/**
 * 로봇 상태 응답
 */
export interface RobotStatusResponse {
  success: boolean;
  data: {
    servo1: number;
    servo2: number;
    servo3: number;
    servo4: number;
    servo5: number;
    servo6: number;
  };
}

/**
 * 로봇 리셋 응답
 */
export interface RobotResetResponse {
  success: boolean;
  message: string;
}

/**
 * 생체 정보 업로드 응답 (Jetson)
 */
export interface BiometricUploadResponse {
  success: boolean;
  message?: string;
  face_vectors?: number[][]; // 얼굴 벡터
  voice_vectors?: number[]; // 음성 벡터
  error?: string;

  // 로그인 성공 시 반환되는 추가 필드
  uid?: string;
  access_token?: string;
  user_id?: number;
  nickname?: string;
  email?: string;
  user_type?: string;

  has_presets?: boolean;
  voice_profile_path?: string; // 음성 업로드 응답에 포함됨
}

/**
 * 5방향 얼굴 이미지 타입
 */
export interface FaceImages {
  front: string; // base64 또는 file URI
  left: string;
  right: string;
  top: string;
  bottom: string;
}

/**
 * 생체 정보 업로드 요청
 */
export interface BiometricUploadRequest {
  face_images: FaceImages;
  voice_file?: string; // 선택적 음성 파일
}

/**
 * 프리셋
 */
export interface Preset {
  preset_id?: number;
  name: string;
  servo1: number;
  servo2: number;
  servo3: number;
  servo4: number;
  servo5: number;
  servo6: number;
  created_at?: string;
}

/**
 * WebSocket 연결 성공 메시지 (서버 → 클라이언트)
 */
export interface ConnectionEstablishedMessage {
  type: 'connection_established';
  message: string;
  session_id: string;

  user: {
    uid: string;
    login_id: string;
    nickname: string;
  };
}

/**
 * 음성 명령 메시지 (서버 → 클라이언트)
 * Jetson에서 "SARVIS" 감지 시 EC2를 통해 전달됨
 */
export interface VoiceCommandMessage {
  type: 'voice_command';
  command: string;  // 예: "SARVIS"
  timestamp: string;
}

/**
 * 유튜브 명령 메시지 (서버 → 클라이언트)
 */
export interface YouTubeCommandMessage {
  type: 'youtube_command';
  command: 'YOUTUBE_OPEN' | 'YOUTUBE_SEEK_FORWARD' | 'YOUTUBE_SEEK_BACKWARD' | 'YOUTUBE_PAUSE' | 'YOUTUBE_PLAY';
  timestamp: string;
}

/**
 * 유튜브 명령 확인 메시지 (클라이언트 → 서버)
 */
export interface YouTubeCommandAckMessage {
  type: 'youtube_command_ack';
  data: {
    status: 'success' | 'failed';
    timestamp: string;
  };
}

/**
 * 음성 호출 확인 응답 메시지 (서버 → 클라이언트)
 */
export interface VoiceCallConfirmationAckMessage {
  type: 'voice_call_confirmation_ack';
  confirmed: boolean;
  message: string;
  session_id: string;
}

/**
 * 유튜브 명령 실행 보고 메시지 (클라이언트 → 서버)
 */
export interface YouTubeCommandReportMessage {
  type: 'youtube_command_report';
  command: string;
  status: 'success' | 'failed';
  timestamp: string;
}

/**
 * 유튜브 명령 확인 응답 ACK (서버 -> 클라이언트)
 */
export interface YouTubeCommandConfirmationAckMessage {
  type: 'youtube_command_confirmation_ack';
  success: boolean;
  message: string;
  session_id: string;
}

/**
 * 유튜브 명령 실행 보고 ACK (서버 -> 클라이언트)
 */
export interface YouTubeCommandReportAckMessage {
  type: 'youtube_command_report_ack';
  confirmed: boolean;
  message: string;
  session_id: string;
}

/**
 * Pong 응답 메시지 (서버 -> 클라이언트)
 */
export interface PongMessage {
  type: 'pong';
  timestamp?: string;
}

/**
 * WebSocket 메시지 타입
 */
export type WebSocketMessage =
  | ConnectionEstablishedMessage
  | VoiceCommandMessage
  | YouTubeCommandMessage
  | VoiceCallConfirmationAckMessage
  | YouTubeCommandReportMessage
  | YouTubeCommandConfirmationAckMessage
  | YouTubeCommandReportAckMessage
  | PongMessage;

/**
 * 프리셋 목록 응답
 */
export interface PresetListResponse {
  success: boolean;
  count: number;
  presets: Preset[];
}

/**
 * 프리셋 선택 응답
 */
export interface PresetSelectResponse {
  success: boolean;
  message: string;
  preset: {
    servo1: number;
    servo2: number;
    servo3: number;
    servo4: number;
    servo5: number;
    servo6: number;
  };
}

/**
 * 프리셋 수정 응답
 */
export interface PresetUpdateResponse {
  success: boolean;
  message: string;
  preset_id: number;
  preset_name: string;
  updated_at?: string;
}

/**
 * 기본 프리셋 선택 응답
 */
export interface PresetDefaultSelectResponse {
  success: boolean;
  message: string;
  preset: {
    preset_id: null;
    name: string;
    offsets: {
      servo1: number;
      servo2: number;
      servo3: number;
      servo4: number;
      servo5: number;
      servo6: number;
    };
  };
}

/**
 * 프리셋 저장 응답
 */
export interface PresetSaveResponse {
  success: boolean;
  message: string;
  preset_id?: number;
  preset?: Preset;
}

/**
 * 젯슨에서 프리셋 저장 응답
 */
export interface PresetSaveFromJetsonResponse {
  success: boolean;
  message: string;
  preset_id?: number;
  preset_name?: string;
  created_at?: string;
}

/**
 * 프리셋 불러오기 응답
 */
export interface PresetLoadResponse {
  success: boolean;
  message: string;
  preset?: {
    preset_id: number;
    name: string;
    servo1: number;
    servo2: number;
    servo3: number;
    servo4: number;
    servo5: number;
    servo6: number;
  };
}
