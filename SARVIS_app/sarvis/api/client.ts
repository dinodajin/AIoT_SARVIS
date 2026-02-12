import axios, { AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { Alert } from 'react-native';
import { API_CONFIG } from '../constants/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 디버그 로깅 함수
const logRequest = (config: InternalAxiosRequestConfig) => {
  console.log('[API REQUEST]', {
    method: config.method?.toUpperCase(),
    url: `${config.baseURL}${config.url}`,
    data: config.data,
    timeout: config.timeout,
  });
};

const logResponse = (response: AxiosResponse) => {
  console.log('[API RESPONSE]', {
    status: response.status,
    url: response.config.url,
    data: response.data,
  });
};

const logError = (error: AxiosError) => {
  console.error('[API ERROR]', {
    message: error.message,
    code: error.code,
    url: error.config?.url,
    status: error.response?.status,
    responseData: error.response?.data,
  });
};

// EC2 server client - signup, login, profile APIs
const ec2Client = axios.create({
  baseURL: API_CONFIG.EC2_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// EC2 요청 인터셉터 - JWT 토큰 및 로깅
ec2Client.interceptors.request.use(
  async (config) => {
    logRequest(config);

    // ✅ /api/auth/refresh/ 요청 시 Authorization 헤더를 보내지 않아야 함
    const isRefreshRequest = config.url?.includes('/api/auth/refresh/');

    if (!isRefreshRequest) {
      const token = await AsyncStorage.getItem('@sarvis_access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    logError(error);
    return Promise.reject(error);
  }
);

// EC2 응답 인터셉터 - 자동 토큰 갱신 및 로깅
ec2Client.interceptors.response.use(
  (response) => {
    logResponse(response);
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    // 401 Unauthorized 에러 발생 시 처리
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // ✅ 무한 루프 방지: 로그인이나 토큰 갱신 요청 자체는 재시도하지 않음
      const isAuthRequest =
        originalRequest.url?.includes('/api/login/') ||
        originalRequest.url?.includes('/api/auth/refresh/');

      if (!isAuthRequest) {
        originalRequest._retry = true;

        try {
          const refreshToken = await AsyncStorage.getItem('@sarvis_refresh_token');
          if (!refreshToken) throw new Error('No refresh token found');

          console.log('🔄 [Auth] Access Token 만료. 갱신 시도 중...');

          // ✅ 토큰 갱신 요청 시 Authorization 헤더를 포함하지 않음 (기본 axios 사용)
          const refreshResponse = await axios.post(`${API_CONFIG.EC2_URL}/api/auth/refresh/`, {
            refresh: refreshToken
          });

          const { access: newAccessToken, refresh: newRefreshToken } = refreshResponse.data;

          if (!newAccessToken) throw new Error('Refresh failed - no access token in response');

          // ✅ 모든 토큰 저장소 키를 동기화하여 업데이트 (AuthProvider 등과 일치)
          const updatedTokens = {
            access: newAccessToken,
            refresh: newRefreshToken || refreshToken
          };

          await AsyncStorage.setItem('@sarvis_access_token', updatedTokens.access);
          await AsyncStorage.setItem('@sarvis_refresh_token', updatedTokens.refresh);
          await AsyncStorage.setItem('@sarvis_tokens', JSON.stringify(updatedTokens));

          // 원래 요청의 헤더를 새 토큰으로 교체 후 재요청
          originalRequest.headers.Authorization = `Bearer ${updatedTokens.access}`;
          console.log('✅ [Auth] Token 갱신 성공. 요청 재시도함.');
          return ec2Client(originalRequest);
        } catch (refreshError) {
          // Refresh Token도 만료되었거나 갱신 실패한 경우 -> 강제 로그아웃
          console.error('❌ [Auth] Refresh Token 만료 또는 갱신 실패. 로그아웃 처리...', refreshError);

          // 저장된 모든 인증 정보 초기화
          await AsyncStorage.multiRemove([
            '@sarvis_user_info',
            '@sarvis_tokens',
            '@sarvis_presets',
            '@sarvis_selected_preset',
            '@sarvis_session',
            '@sarvis_access_token',
            '@sarvis_refresh_token'
          ]);

          Alert.alert(
            '세션 만료',
            '보안을 위해 다시 로그인해주세요.',
            [{ text: '확인' }]
          );

          // 추가적인 UI 리다이렉션은 AuthProvider나 메인 레이아웃에서 
          // AsyncStorage가 비어있는 것을 감지하여 자동으로 처리되도록 설계함
          return Promise.reject(refreshError);
        }
      }
    }

    logError(error);
    return Promise.reject(error);
  }
);

// Jetson server client - face, voice processing
const jetsonClient = axios.create({
  baseURL: API_CONFIG.JETSON_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Jetson 요청 인터셉터 - 로깅
jetsonClient.interceptors.request.use(
  (config) => {
    logRequest(config);
    return config;
  },
  (error) => {
    logError(error);
    return Promise.reject(error);
  }
);

// Jetson 응답 인터셉터 - 로깅
jetsonClient.interceptors.response.use(
  (response) => {
    logResponse(response);
    return response;
  },
  (error) => {
    logError(error);
    return Promise.reject(error);
  }
);

export { ec2Client, jetsonClient };
