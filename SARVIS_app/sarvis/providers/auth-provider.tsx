import { authAPI } from '@/api/auth';
import { ConnectionEstablishedMessage, Preset, Tokens, VoiceCommandMessage, YouTubeCommandMessage } from '@/api/types';
import { getWebSocketManager } from '@/api/websocket';
import { VoiceCommandOverlay } from '@/components/sarvis/voice-command-overlay';
import YouTubeControl from '@/modules/YouTubeControlModule';
import { requestBackgroundPermissions } from '@/utils/Permissions';
import { userStorage } from '@/utils/userStorage';
import { handleVoiceCommand } from '@/utils/voiceCommandHandler';
import * as Notifications from 'expo-notifications';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

/**
 * 인증된 사용자 타입
 */
type AuthUser = {
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
 * 세션 정보 타입
 */
type SessionInfo = {
  session_id: string;
  session_started_at: string;
};

/**
 * 인증 컨텍스트 타입
 */
type AuthContextValue = {
  user: AuthUser | null;
  tokens: Tokens | null;
  session: SessionInfo | null;
  presets: Preset[];
  selectedPreset: Preset | null;

  isLoading: boolean;
  signIn: (loginResponse: any) => void;
  signOut: () => void;
  selectPreset: (preset: Preset) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  // sessionUuid state removed
  const [isLoading, setIsLoading] = useState(true);
  const [showVoiceOverlay, setShowVoiceOverlay] = useState(false);
  const [lastVoiceCommand, setLastVoiceCommand] = useState('');

  // 앱 시작 시 저장된 인증 정보 로드
  useEffect(() => {
    loadStoredAuth();
  }, []);

  // WebSocket 매니저 싱글톤
  const wsManager = useMemo(() => getWebSocketManager(), []);

  /**
   * 저장된 인증 정보 로드
   */
  const loadStoredAuth = async () => {
    try {
      const storedUser = await userStorage.getUser();
      const storedTokens = await userStorage.getTokens();
      const storedPresets = await userStorage.getPresets();
      const storedSelectedPreset = await userStorage.getSelectedPreset();
      const storedSession = await userStorage.getSession();

      if (storedUser && storedTokens) {
        setUser(storedUser);
        setTokens(storedTokens);
        setPresets(storedPresets || []);
        setSelectedPreset(storedSelectedPreset);

        if (storedSession) {
          const sessionInfo = {
            ...storedSession,
            session_id: String(storedSession.session_id)
          };
          setSession(sessionInfo);
        }

        // 저장된 세션이 있으면 WebSocket 재연결
        if (storedSession?.session_id) {
          connectWebSocket(storedSession.session_id);
        }
      }
    } catch (error) {
      console.error('❌ 저장된 인증 정보 로드 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Android Foreground Service 시작 (Expo Notifications로 대체)
   * 앱이 백그라운드에서도 WebSocket 연결을 유지하도록 시각적 알림 표시
   * (참고: Expo Notifications만으로는 완전한 백그라운드 서비스 보장이 어렵습니다.)
   */
  const startForegroundService = async () => {
    if (Platform.OS !== 'android') return;

    try {
      // 알림 채널 설정 (필요 시)
      await Notifications.setNotificationChannelAsync('sarvis_foreground', {
        name: 'SARVIS Connection',
        importance: Notifications.AndroidImportance.LOW,
      });

      // 알림 표시
      await Notifications.scheduleNotificationAsync({
        identifier: 'sarvis_fg',
        content: {
          title: 'SARVIS 상시 대기 중',
          body: '화면이 꺼져도 "싸비스"라고 부르면 응답합니다.',
          sticky: true,
          priority: Notifications.AndroidNotificationPriority.HIGH, // 중요도 상향
          sound: false,
          vibrate: undefined,
        },
        trigger: null,
      });
      console.log('🛡️ [Service] Notification 표시됨');
    } catch (e) {
      console.error('❌ [Service] Start Error:', e);
    }
  };

  /**
   * Android Foreground Service 중지 (알림 제거)
   */
  const stopForegroundService = async () => {
    if (Platform.OS !== 'android') return;
    try {
      await Notifications.dismissNotificationAsync('sarvis_fg');
      console.log('🛡️ [Service] Notification 제거됨');
    } catch (e) { }
  };

  /**
   * WebSocket 연결 (핸들러 포함)
   */
  const connectWebSocket = useCallback((sessionId: string) => {
    wsManager.connect(sessionId, {
      onConnected: (message: ConnectionEstablishedMessage) => {
        console.log('✅ WebSocket 연결 성공:', message);
        startForegroundService(); // 연결 성공 시 서비스 시작
        // 백그라운드 대기를 위한 권한 체크 및 요청
        requestBackgroundPermissions();
      },
      onVoiceCommand: async (message: VoiceCommandMessage) => {
        // [한글 명령어 변환] "싸비스" -> "SARVIS"
        const command = message.command === '싸비스' ? 'SARVIS' : message.command;
        console.log('🎤 음성 명령 수신:', command);

        // 1. 음성 명령 처리 (사운드/진동/시스템 알림)
        // await을 사용하여 알람(진동/사운드)이 정상적으로 실행된 후 다음 단계로 진행
        await handleVoiceCommand(command, message.timestamp);

        // 2. 알람 실행 성공 후 서버에 확인 신호(ACK) 전송 (백엔드 대기 해제용)
        wsManager.sendVoiceCommandAck();

        // 3. UI 오버레이 표시
        setLastVoiceCommand(command);
        setShowVoiceOverlay(true);
      },
      onYouTubeCommand: async (message: YouTubeCommandMessage) => {
        console.log('📺 유튜브 명령 처리:', message.command);

        // 1. 명령 실행 피드백 (사운드/진동/알림)
        // 유튜브 명령은 알림음을 내지 않도록 silent 옵션을 추가합니다.
        await handleVoiceCommand(message.command, message.timestamp, undefined, { silent: true });

        let success = false;

        try {
          switch (message.command) {
            case 'YOUTUBE_OPEN':
              await YouTubeControl.openYouTube();
              success = true;
              break;
            case 'YOUTUBE_PLAY':
              await YouTubeControl.sendCommand('play');
              success = true;
              break;
            case 'YOUTUBE_PAUSE':
              await YouTubeControl.sendCommand('pause');
              success = true;
              break;
            case 'YOUTUBE_SEEK_FORWARD':
              await YouTubeControl.sendCommand('forward10');
              success = true;
              break;
            case 'YOUTUBE_SEEK_BACKWARD':
              await YouTubeControl.sendCommand('backward10');
              success = true;
              break;
            default:
              console.warn('⚠️ 지원하지 않는 유튜브 명령:', message.command);
              success = false;
          }
        } catch (error) {
          console.error('❌ 유튜브 명령 실행 실패:', error);
          success = false;
        }

        // 서버로 실행 결과 전송 (백엔드 대기 해제용)
        wsManager.sendYouTubeCommandAck(success ? 'success' : 'failed');
      },
      onDisconnected: () => {
        console.log('🔌 WebSocket 연결 해제');
        // stopForegroundService(); // 재연결을 위해 잠시 유지하거나, 완전 로그아웃 시에만 꺼야 할 수도 있음
      },
      onError: (error: Error) => {
        console.log('❌ WebSocket 에러 (무시됨):', error.message);
      },
    });
  }, [wsManager]);

  /**
   * 로그인 처리
   */
  const signIn = useCallback(async (loginResponse: any) => {
    try {
      const authUser: AuthUser = {
        user_id: loginResponse.user_id,
        uid: loginResponse.uid,
        login_id: loginResponse.login_id,
        nickname: loginResponse.nickname,
        email: loginResponse.email,
        login_method: loginResponse.login_method,
        faceRegistered: loginResponse.faceRegistered ?? loginResponse.has_face ?? true,
        voiceRegistered: loginResponse.voiceRegistered ?? loginResponse.has_voice ?? false,
      };

      let authTokens: Tokens;

      // 토큰 구조가 다양한 경우 대응
      if (loginResponse.tokens) {
        // 일반적인 구조
        authTokens = loginResponse.tokens;
      } else if (loginResponse.access_token && typeof loginResponse.access_token === 'object') {
        // Jetson/얼굴 로그인 응답 구조 (access_token 내부에 access, refresh가 있음)
        authTokens = {
          access: loginResponse.access_token.access,
          refresh: loginResponse.access_token.refresh
        };
      } else {
        console.error('❌ 유효한 토큰을 찾을 수 없습니다:', loginResponse);
        throw new Error('로그인 응답에 유효한 토큰이 없습니다.');
      }

      const userPresets: Preset[] = loginResponse.presets || [];

      // 상태 업데이트
      setUser(authUser);
      setTokens(authTokens);
      setPresets(userPresets);

      if (loginResponse.session_id) {
        const sessionInfo: SessionInfo = {
          session_id: String(loginResponse.session_id),
          session_started_at: loginResponse.session_started_at,
        };
        setSession(sessionInfo);
        await userStorage.saveSession(sessionInfo);

        // WebSocket 연결 시작
        console.log('🔍 WebSocket 연결을 위한 session_id 확인:', loginResponse.session_id);
        connectWebSocket(loginResponse.session_id);
      }

      // 로컬 저장
      await userStorage.saveUser(authUser);
      await userStorage.saveTokens(authTokens);
      await userStorage.savePresets(userPresets);

      console.log('✅ 로그인 성공:', authUser.nickname);
    } catch (error) {
      console.error('❌ 로그인 처리 실패:', error);
      throw error;
    }
  }, []);

  /**
   * 로그아웃 처리
   */
  const signOut = useCallback(async () => {
    try {
      console.log('🔐 로그아웃 시작');

      // 1. WebSocket 연결 해제
      wsManager.disconnect();
      stopForegroundService(); // 로그아웃 시 서비스 중지

      // 2. 서버 로그아웃 요청 (토큰 블랙리스트 추가 및 세션 종료)
      try {
        const currentTokens = await userStorage.getTokens();
        if (currentTokens && currentTokens.refresh) {
          console.log('🌐 서버 로그아웃 요청 전송...');
          await authAPI.logout(currentTokens.refresh);
          console.log('✅ 서버 로그아웃 성공');
        } else {
          console.log('⚠️ 리프레시 토큰이 없어 서버 로그아웃 건너뜀');
        }
      } catch (apiError) {
        console.error('❌ 서버 로그아웃 요청 실패 (로컬 로그아웃은 진행):', apiError);
        // 서버 요청 실패해도 로컬 로그아웃은 진행
      }

      // 3. 저장된 정보 삭제
      await userStorage.clearAuth();

      // 4. 상태 초기화
      setUser(null);
      setTokens(null);
      setSession(null);
      setPresets([]);
      setSelectedPreset(null);
      // sessionUuid state removed

      console.log('✅ 로컬 로그아웃 완료');
    } catch (error) {
      console.error('❌ 로그아웃 처리 실패:', error);
      throw error;
    }
  }, [wsManager]);

  /**
   * 프리셋 선택
   */
  const selectPreset = useCallback(async (preset: Preset) => {
    setSelectedPreset(preset);
    await userStorage.saveSelectedPreset(preset);
  }, []);



  const value = useMemo<AuthContextValue>(() => ({
    user,
    tokens,
    session,
    presets,
    selectedPreset,

    isLoading,
    signIn,
    signOut,
    selectPreset,
  }), [
    isLoading,
    signIn,
    signOut,
    selectPreset,
    user,
    tokens,
    session,
    presets,
    selectedPreset,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      <VoiceCommandOverlay
        visible={showVoiceOverlay}
        command={lastVoiceCommand}
        onClose={() => setShowVoiceOverlay(false)}
      />
    </AuthContext.Provider>
  );
}

/**
 * 인증 컨텍스트 훅
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
