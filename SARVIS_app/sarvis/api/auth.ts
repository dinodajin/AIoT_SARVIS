// api/auth.ts

import { ec2Client } from './client';
import {
  ApiResponse,
  LoginResponse,
  SignupRequest,
  CheckIdResponse,
  SendEmailCodeResponse,
  VerifyEmailCodeResponse,
  SignupTempResponse,
  SaveFaceVectorResponse,
  SaveVoiceVectorResponse,
  UserProfile,
  SkipVoiceSignupResponse,
  FindIdResponse,
  PasswordResetRequestResponse,
  PasswordResetVerifyResponse,
  PasswordResetCompleteResponse,
} from './types';

/**
 * 인증 관련 API
 */
export const authAPI = {
  /**
   * 회원가입 1단계 - 아이디 입력 (아이디 중복 검사 및 캐시 초기화)
   */
  async checkId(loginId: string): Promise<CheckIdResponse> {
    const response = await ec2Client.post<CheckIdResponse>(
      '/api/register/check-id/',
      { login_id: loginId }
    );
    return response.data;
  },

  /**
   * 회원가입 2단계 - 닉네임 입력
   */
  async registerNickname(loginId: string, nickname: string): Promise<SignupTempResponse> {
    const response = await ec2Client.post<SignupTempResponse>(
      '/api/register/nickname/',
      { login_id: loginId, nickname }
    );
    return response.data;
  },

  /**
   * 이메일 인증번호 발송
   */
  async sendEmailCode(email: string): Promise<SendEmailCodeResponse> {
    const response = await ec2Client.post<SendEmailCodeResponse>(
      '/api/register/email-request/',
      { email },
      { timeout: 60000 } // 이메일 발송은 시간이 걸릴 수 있어 60초로 설정
    );
    return response.data;
  },

  /**
   * 회원가입 3단계 - 이메일 입력 및 인증
   */
  async registerEmail(loginId: string, nickname: string, email: string, code: string): Promise<VerifyEmailCodeResponse> {
    const response = await ec2Client.post<VerifyEmailCodeResponse>(
      '/api/register/email/',
      { login_id: loginId, nickname, email, code },
      { timeout: 10000 } // 명시적으로 10초 타임아웃 설정
    );
    return response.data;
  },

  /**
   * 회원가입 4단계 - 비밀번호 입력 (6자 숫자)
   */
  async registerPassword(loginId: string, nickname: string, password: string): Promise<SignupTempResponse> {
    const response = await ec2Client.post<SignupTempResponse>(
      '/api/register/password/',
      { login_id: loginId, nickname, password }
    );
    return response.data;
  },

  /**
   * 회원가입 5단계 - 얼굴 벡터 저장 (임시 캐시 저장)
   * @param loginId 사용자 아이디
   * @param faceVectors 얼굴 벡터 (Jetson에서 받은 값)
   */
  async saveFaceVector(loginId: string, faceVectors: number[][]): Promise<SaveFaceVectorResponse> {
    const response = await ec2Client.post<SaveFaceVectorResponse>(
      '/api/biometric/save-face/',
      { login_id: loginId, face_vectors: faceVectors }
    );
    return response.data;
  },

  /**
   * 회원가입 6단계 - 음성 벡터 저장 (회원가입 완료)
   * @param loginId 사용자 아이디
   * @param voiceVectors 음성 벡터 (Jetson에서 받은 값, 없으면 null)
   */
  async saveVoiceVector(loginId: string, voiceVectors: number[] | null): Promise<SaveVoiceVectorResponse> {
    console.log('🌐 [authAPI] saveVoiceVector 요청:', { loginId, hasVectors: !!voiceVectors, vectorLength: voiceVectors?.length });

    // 유효성 검사
    if (!loginId) {
      console.error('❌ [authAPI] saveVoiceVector 실패: loginId가 없습니다.');
      throw new Error('loginId is required');
    }

    const response = await ec2Client.post<SaveVoiceVectorResponse>(
      '/api/biometric/save-voice/',
      { login_id: loginId, voice_vectors: voiceVectors }
    );
    return response.data;
  },

  /**
   * 회원가입 캐시 삭제
   */
  async clearRegistrationCache(loginId: string): Promise<ApiResponse> {
    const response = await ec2Client.post<ApiResponse>(
      '/api/register/clear-cache/',
      { login_id: loginId }
    );
    return response.data;
  },

  /**
   * 비밀번호 로그인
   */
  async login(loginId: string, password: string): Promise<LoginResponse> {
    const response = await ec2Client.post<LoginResponse>(
      '/api/login/password/',
      { login_id: loginId, password }
    );
    return response.data;
  },


  /**
   * 얼굴 인식 로그인 (Jetson으로 요청 후 벡터 받아서 서버로 전송)
   */
  async loginFace(faceVectors: number[][]): Promise<LoginResponse> {
    const response = await ec2Client.post<LoginResponse>(
      '/api/login/face/',
      { face_vectors: faceVectors }
    );
    return response.data;
  },

  /**
   * 로그아웃
   */
  async logout(refreshToken: string): Promise<ApiResponse> {
    const response = await ec2Client.post<ApiResponse>(
      '/api/auth/logout/',
      { refresh: refreshToken }
    );
    return response.data;
  },

  /**
   * 토큰 갱신
   */
  async refreshToken(refreshToken: string): Promise<{ access: string }> {
    const response = await ec2Client.post<{ access: string }>(
      '/api/auth/refresh/',
      { refresh: refreshToken }
    );
    return response.data;
  },

  /**
   * 프로필 조회
   */
  async getProfile(): Promise<ApiResponse<{ user: UserProfile }>> {
    const response = await ec2Client.get<ApiResponse<{ user: UserProfile }>>(
      '/api/user/profile/'
    );
    return response.data;
  },

  /**
   * 프로필 수정
   */
  async updateProfile(nickname: string): Promise<ApiResponse> {
    const response = await ec2Client.patch<ApiResponse>(
      '/api/user/profile/update/',
      { nickname }
    );
    return response.data;
  },

  /**
   * 회원 탈퇴
   */
  async deleteAccount(
    loginId: string,
    password: string,
    deletionReason?: string
  ): Promise<ApiResponse> {
    const response = await ec2Client.post<ApiResponse>(
      '/api/account/delete/',
      { login_id: loginId, password, deletion_reason: deletionReason }
    );
    return response.data;
  },

  /**
   * 음성 등록 건너뛰기 (null 벡터로 저장)
   * @param loginId 사용자 아이디
   */
  async skipVoiceSignup(loginId: string): Promise<SaveVoiceVectorResponse> {
    const response = await ec2Client.post<SaveVoiceVectorResponse>(
      '/api/biometric/save-voice/',
      { login_id: loginId, voice_vectors: null }
    );
    return response.data;
  },

  /**
   * 이메일 인증 코드 검증 (별도 API)
   */
  async verifyEmailCode(email: string, code: string): Promise<VerifyEmailCodeResponse> {
    const response = await ec2Client.post<VerifyEmailCodeResponse>(
      '/api/register/verify-email/',
      { email, code }
    );
    return response.data;
  },

  /**
   * 아이디 찾기
   * @param email 이메일 주소
   * @param code 이메일 인증 코드
   */
  async findId(email: string, code: string): Promise<FindIdResponse> {
    const response = await ec2Client.post<FindIdResponse>(
      '/api/find-id/',
      { email, code }
    );
    return response.data;
  },

  /**
   * 비밀번호 재설정 요청 (인증 코드 발송)
   * @param loginId 사용자 아이디
   * @param email 이메일 주소
   */
  async requestPasswordReset(loginId: string, email: string): Promise<PasswordResetRequestResponse> {
    const response = await ec2Client.post<PasswordResetRequestResponse>(
      '/api/password/reset-request/',
      { login_id: loginId, email }
    );
    return response.data;
  },

  /**
   * 비밀번호 재설정 코드 검증
   * @param loginId 사용자 아이디
   * @param email 이메일 주소
   * @param code 인증 코드
   */
  async verifyPasswordResetCode(
    loginId: string,
    email: string,
    code: string
  ): Promise<PasswordResetVerifyResponse> {
    const response = await ec2Client.post<PasswordResetVerifyResponse>(
      '/api/password/reset-verify-code/',
      { login_id: loginId, email, code }
    );
    return response.data;
  },

  /**
   * 새 비밀번호 설정
   * @param resetToken 재설정 토큰
   * @param newPassword 새 비밀번호 (6자리 숫자)
   */
  async setNewPassword(resetToken: string, newPassword: string): Promise<PasswordResetCompleteResponse> {
    const response = await ec2Client.post<PasswordResetCompleteResponse>(
      '/api/password/reset-set-new/',
      { reset_token: resetToken, new_password: newPassword }
    );
    return response.data;
  },

};
