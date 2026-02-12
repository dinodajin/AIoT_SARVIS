import axios, { AxiosInstance } from 'axios';

// Django Backend API Base URL
const API_BASE_URL = 'http://i14a104.p.ssafy.io:8080/api';

class ApiClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Request interceptor - 토큰 추가
    this.client.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });

    // Response interceptor - 에러 처리
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // 토큰 만료 처리
          this.accessToken = null;
        }
        return Promise.reject(error);
      }
    );
  }

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  clearAccessToken() {
    this.accessToken = null;
  }

  // ============ 회원가입 관련 API ============

  // Step 1: 기본 정보 입력
  async registerStep1(data: {
    login_id: string;
    password: string;
    password_confirm: string;
    email: string;
    nickname: string;
  }) {
    const response = await this.client.post('/register/step1/', data);
    return response.data;
  }

  // 이메일 인증 코드 요청
  async requestEmailCode(email: string) {
    const response = await this.client.post('/register/email-request/', { email });
    return response.data;
  }

  // 이메일 인증 코드 검증
  async verifyEmailCode(email: string, code: string) {
    const response = await this.client.post('/register/verify-email/', { email, code });
    return response.data;
  }

  // ============ 로그인 관련 API ============

  // 비밀번호 로그인
  async loginWithPassword(login_id: string, password: string) {
    const response = await this.client.post('/login/password/', { login_id, password });
    return response.data;
  }

  // 얼굴 로그인 요청
  async requestFaceLogin() {
    const response = await this.client.post('/login/request-face/');
    return response.data;
  }

  // 얼굴 로그인 (벡터 매칭)
  async loginWithFace(face_vector: number[]) {
    const response = await this.client.post('/login/face/', { face_vector });
    return response.data;
  }

  // 토큰 갱신
  async refreshToken(refresh: string) {
    const response = await this.client.post('/auth/refresh/', { refresh });
    return response.data;
  }

  // 로그아웃
  async logout(refresh: string) {
    const response = await this.client.post('/auth/logout/', { refresh });
    return response.data;
  }

  // ============ 생체 정보 관련 API ============

  // 얼굴 벡터 저장
  async saveFaceVector(uid: string, face_vector: number[][]) {
    const response = await this.client.post('/biometric/save-face/', { uid, face_vector });
    return response.data;
  }

  // 음성 벡터 저장
  async saveVoiceVector(uid: string, voice_vector: number[][]) {
    const response = await this.client.post('/biometric/save-voice/', { uid, voice_vector });
    return response.data;
  }

  // ============ 사용자 프로필 관련 API ============

  // 프로필 조회
  async getProfile() {
    const response = await this.client.get('/user/profile/');
    return response.data;
  }

  // 프로필 수정
  async updateProfile(data: { nickname?: string }) {
    const response = await this.client.patch('/user/profile/update/', data);
    return response.data;
  }

  // ============ 프리셋 관련 API ============

  // 프리셋 저장
  async savePreset(connection_uuid: string, name?: string) {
    const response = await this.client.post('/preset/save/', { connection_uuid, name });
    return response.data;
  }

  // 프리셋 목록 조회
  async getPresetList(connection_uuid?: string) {
    const params = connection_uuid ? { connection_uuid } : {};
    const response = await this.client.get('/preset/list/', { params });
    return response.data;
  }

  // 프리셋 로드
  async loadPreset(preset_id: number) {
    const response = await this.client.post('/preset/load/', { preset_id });
    return response.data;
  }

  // ============ 제어 관련 API ============

  // 제어 화면 진입
  async enterControlScreen(connection_uuid: string) {
    const response = await this.client.post('/control/enter/', { connection_uuid });
    return response.data;
  }

  // 버튼 명령 전달
  async sendButtonCommand(connection_uuid: string, button_type: string, button_label?: string) {
    const response = await this.client.post('/control/button/', {
      connection_uuid,
      button_type,
      button_label,
    });
    return response.data;
  }

  // 메인페이지 버튼 클릭
  async sendMainPageButton(connection_uuid: string, button_type: string, button_label?: string) {
    const response = await this.client.post('/main/button/', {
      connection_uuid,
      button_type,
      button_label,
    });
    return response.data;
  }

  // ============ 세션 관련 API ============

  // 세션 시작 (수동)
  async startSession(connection_uuid: string) {
    const response = await this.client.post('/session/start/', { connection_uuid });
    return response.data;
  }

  // 세션 종료
  async endSession(session_id: number) {
    const response = await this.client.post('/session/end/', { session_id });
    return response.data;
  }

  // 명령 로그 생성
  async createCommandLog(data: {
    session_id: number;
    command_type: string;
    command_content: string;
    is_success: boolean;
  }) {
    const response = await this.client.post('/session/command-log/', data);
    return response.data;
  }
}

export const apiClient = new ApiClient();