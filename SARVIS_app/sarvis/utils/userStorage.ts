import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tokens, Preset } from '@/api/types';

/**
 * 회원가입 정보
 */
export type SignupInfo = {
  loginId: string;
  nickname: string;
  email: string;
  password: string;
};

/**
 * 사용자 정보
 */
export type UserInfo = {
  user_id: number;
  uid: string;
  login_id: string;
  nickname: string;
  email: string;
  login_method: 'password' | 'face';
  faceRegistered?: boolean;
  voiceRegistered?: boolean;
};

/**
 * 세션 정보
 */
export type SessionInfo = {
  session_id: string;
  session_started_at: string;
};

const USER_STORAGE_KEY = '@sarvis_user_info';
const TOKENS_STORAGE_KEY = '@sarvis_tokens';
const PRESETS_STORAGE_KEY = '@sarvis_presets';
const SELECTED_PRESET_STORAGE_KEY = '@sarvis_selected_preset';
const SESSION_STORAGE_KEY = '@sarvis_session';

const SIGNUP_STORAGE_KEY = '@sarvis_signup_info';
const ACCESS_TOKEN_KEY = '@sarvis_access_token';
const REFRESH_TOKEN_KEY = '@sarvis_refresh_token';

/**
 * 사용자 저장소 유틸리티
 */
export const userStorage = {
  /**
   * 회원가입 정보 저장
   */
  async saveSignupInfo(signupInfo: SignupInfo): Promise<void> {
    try {
      await AsyncStorage.setItem(SIGNUP_STORAGE_KEY, JSON.stringify(signupInfo));
      console.log('회원가입 정보 저장 성공:', signupInfo);
    } catch (error) {
      console.error('회원가입 정보 저장 오류:', error);
      throw error;
    }
  },

  /**
   * 회원가입 정보 가져오기
   */
  async getSignupInfo(): Promise<SignupInfo | null> {
    try {
      const stored = await AsyncStorage.getItem(SIGNUP_STORAGE_KEY);
      if (stored) {
        const signupInfo = JSON.parse(stored);
        console.log('회원가입 정보 로드 성공:', signupInfo);
        return signupInfo;
      }
      return null;
    } catch (error) {
      console.error('회원가입 정보 로드 오류:', error);
      return null;
    }
  },

  /**
   * 회원가입 정보 삭제
   */
  async clearSignupInfo(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SIGNUP_STORAGE_KEY);
      console.log('회원가입 정보 삭제 성공');
    } catch (error) {
      console.error('회원가입 정보 삭제 오류:', error);
      throw error;
    }
  },

  /**
   * 사용자 정보 저장
   */
  async saveUserInfo(userInfo: UserInfo): Promise<void> {
    try {
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userInfo));
      console.log('사용자 정보 저장 성공:', userInfo);
    } catch (error) {
      console.error('사용자 정보 저장 오류:', error);
      throw error;
    }
  },

  /**
   * 사용자 정보 가져오기
   */
  async getUserInfo(): Promise<UserInfo | null> {
    try {
      const stored = await AsyncStorage.getItem(USER_STORAGE_KEY);
      if (stored) {
        const userInfo = JSON.parse(stored);
        console.log('사용자 정보 로드 성공:', userInfo);
        return userInfo;
      }
      return null;
    } catch (error) {
      console.error('사용자 정보 로드 오류:', error);
      return null;
    }
  },

  /**
   * 사용자 정보 업데이트
   */
  async updateUserInfo(updates: Partial<UserInfo>): Promise<UserInfo | null> {
    try {
      const currentUserInfo = await this.getUserInfo();
      if (currentUserInfo) {
        const updatedUserInfo = { ...currentUserInfo, ...updates };
        await this.saveUserInfo(updatedUserInfo);
        return updatedUserInfo;
      }
      return null;
    } catch (error) {
      console.error('사용자 정보 업데이트 오류:', error);
      throw error;
    }
  },

  /**
   * JWT 토큰 저장
   */
  async saveTokens(tokens: Tokens): Promise<void> {
    try {
      await AsyncStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(tokens));

      // 액세스 토큰 별도 저장 (client.ts 인터셉터에서 사용)
      await AsyncStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
      await AsyncStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);

      console.log('토큰 저장 성공');
    } catch (error) {
      console.error('토큰 저장 오류:', error);
      throw error;
    }
  },

  /**
   * JWT 토큰 가져오기
   */
  async getTokens(): Promise<Tokens | null> {
    try {
      const stored = await AsyncStorage.getItem(TOKENS_STORAGE_KEY);
      if (stored) {
        const tokens = JSON.parse(stored);
        console.log('토큰 로드 성공');
        return tokens;
      }
      return null;
    } catch (error) {
      console.error('토큰 로드 오류:', error);
      return null;
    }
  },

  /**
   * 사용자 정보 가져오기 (별칭)
   */
  async getUser(): Promise<UserInfo | null> {
    return await this.getUserInfo();
  },

  /**
   * 사용자 정보 저장 (별칭)
   */
  async saveUser(userInfo: UserInfo): Promise<void> {
    return await this.saveUserInfo(userInfo);
  },

  /**
   * 프리셋 목록 저장
   */
  async savePresets(presets: Preset[]): Promise<void> {
    try {
      await AsyncStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
      console.log('프리셋 목록 저장 성공:', presets);
    } catch (error) {
      console.error('프리셋 목록 저장 오류:', error);
      throw error;
    }
  },

  /**
   * 프리셋 목록 가져오기
   */
  async getPresets(): Promise<Preset[]> {
    try {
      const stored = await AsyncStorage.getItem(PRESETS_STORAGE_KEY);
      if (stored) {
        const presets = JSON.parse(stored);
        console.log('프리셋 목록 로드 성공:', presets);
        return presets;
      }
      return [];
    } catch (error) {
      console.error('프리셋 목록 로드 오류:', error);
      return [];
    }
  },

  /**
   * 선택된 프리셋 저장
   */
  async saveSelectedPreset(preset: Preset): Promise<void> {
    try {
      await AsyncStorage.setItem(SELECTED_PRESET_STORAGE_KEY, JSON.stringify(preset));
      console.log('선택된 프리셋 저장 성공:', preset);
    } catch (error) {
      console.error('선택된 프리셋 저장 오류:', error);
      throw error;
    }
  },

  /**
   * 선택된 프리셋 가져오기
   */
  async getSelectedPreset(): Promise<Preset | null> {
    try {
      const stored = await AsyncStorage.getItem(SELECTED_PRESET_STORAGE_KEY);
      if (stored) {
        const preset = JSON.parse(stored);
        console.log('선택된 프리셋 로드 성공:', preset);
        return preset;
      }
      return null;
    } catch (error) {
      console.error('선택된 프리셋 로드 오류:', error);
      return null;
    }
  },

  /**
   * 세션 정보 저장
   */
  async saveSession(session: SessionInfo): Promise<void> {
    try {
      await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      console.log('세션 정보 저장 성공:', session);
    } catch (error) {
      console.error('세션 정보 저장 오류:', error);
      throw error;
    }
  },

  /**
   * 세션 정보 가져오기
   */
  async getSession(): Promise<SessionInfo | null> {
    try {
      const stored = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const session = JSON.parse(stored);
        console.log('세션 정보 로드 성공:', session);
        return session;
      }
      return null;
    } catch (error) {
      console.error('세션 정보 로드 오류:', error);
      return null;
    }
  },



  /**
   * 인증 상태 가져오기 (로그아웃용)
   */
  async getAuthStatus(): Promise<{ sessionId: string | null; tokens: Tokens | null }> {
    try {
      const session = await this.getSession();
      const tokens = await this.getTokens();

      return {
        sessionId: session?.session_id || null,
        tokens: tokens,
      };
    } catch (error) {
      console.error('인증 상태 조회 오류:', error);
      return {
        sessionId: null,
        tokens: null,
      };
    }
  },

  /**
   * 모든 인증 정보 삭제 (로그아웃용)
   */
  async clearAuth(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        USER_STORAGE_KEY,
        TOKENS_STORAGE_KEY,
        PRESETS_STORAGE_KEY,
        SELECTED_PRESET_STORAGE_KEY,
        SESSION_STORAGE_KEY,

        ACCESS_TOKEN_KEY,
        REFRESH_TOKEN_KEY,
      ]);
      console.log('인증 정보 삭제 성공');
    } catch (error) {
      console.error('인증 정보 삭제 오류:', error);
      throw error;
    }
  },

  /**
   * 로그아웃 (별칭)
   */
  async logout(): Promise<void> {
    return await this.clearAuth();
  },

  /**
   * 모든 데이터 초기화 (테스트용)
   */
  async clearAllData(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        USER_STORAGE_KEY,
        TOKENS_STORAGE_KEY,
        PRESETS_STORAGE_KEY,
        SELECTED_PRESET_STORAGE_KEY,
        SESSION_STORAGE_KEY,

        SIGNUP_STORAGE_KEY,
        ACCESS_TOKEN_KEY,
        REFRESH_TOKEN_KEY,
      ]);
      console.log('모든 데이터 초기화 성공');
    } catch (error) {
      console.error('데이터 초기화 오류:', error);
      throw error;
    }
  },
};