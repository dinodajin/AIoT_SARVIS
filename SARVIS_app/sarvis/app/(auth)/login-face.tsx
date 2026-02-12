import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authAPI } from '@/api/auth';
import { biometricAPI } from '@/api/biometric';
import { presetAPI } from '@/api/preset';
import { SarvisAppHeader } from '@/components/sarvis/sarvis-app-header';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { useAuth } from '@/providers/auth-provider';

const { width } = Dimensions.get('window');

export default function LoginFaceScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [isVerifying, setIsVerifying] = useState(false); // Controls loading state
  const [isSuccess, setIsSuccess] = useState(false); // Controls success UI state
  const [hasShownPermissionAlert, setHasShownPermissionAlert] = useState(false);
  const [hasRequestedPermission, setHasRequestedPermission] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('front');

  // Real logic state additions
  const cameraRef = useRef<CameraView>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const [retryCount, setRetryCount] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const canUseCamera = !!permission?.granted;
  const permissionMessage = useMemo(() => {
    if (!permission) return '카메라 권한을 확인하는 중입니다.';
    if (permission.granted) return '원 안에 얼굴이 들어오도록 맞춰주세요.';
    return '얼굴 인식을 위해 카메라 권한이 필요합니다.';
  }, [permission]);

  useEffect(() => {
    if (!permission) return;
    if (permission.granted) return;
    if (!permission.canAskAgain) return;
    if (hasRequestedPermission) return;

    setHasRequestedPermission(true);
    void requestPermission();
  }, [hasRequestedPermission, permission, requestPermission]);

  useEffect(() => {
    if (!permission) return;
    if (permission.granted) return;
    if (hasShownPermissionAlert) return;

    setHasShownPermissionAlert(true);
    Alert.alert(
      '카메라 권한 필요',
      '얼굴로 로그인하려면 카메라 접근 권한이 필요합니다.',
      [
        {
          text: '취소',
          style: 'cancel',
          onPress: () => router.back(),
        },
        {
          text: '확인',
          onPress: async () => {
            if (permission.canAskAgain) {
              await requestPermission();
              return;
            }
            await Linking.openSettings();
          },
        },
      ]
    );
  }, [hasShownPermissionAlert, permission, requestPermission, router]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.03,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // --- Real Logic for Face Login ---
  /**
   * 테스트용 임시 프로필 로그인
   * 백엔드 연결 없이 메인 화면으로 진입하기 위한 용도
   */
  const createTestProfile = async () => {
    setIsVerifying(true);
    try {
      // 가상의 테스트 데이터
      const mockResponse = {
        success: true,
        uid: 'test_user_uuid',
        session_id: `test_session_${Date.now()}`,
        session_started_at: new Date().toISOString(),
        tokens: {
          access: 'mock_access_token',
          refresh: 'mock_refresh_token'
        },
        user_type: 'user'
      };

      const mockUserData = {
        user_id: 1,
        nickname: '테스트유저',
        email: 'test@example.com',
        login_id: 'testuser',
        login_method: 'face' as const
      };

      // localStorage 저장 (토큰)
      const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
      await AsyncStorage.setItem('@sarvis_access_token', mockResponse.tokens.access);

      // AuthProvider의 signIn 호출
      await signIn({
        uid: mockResponse.uid,
        access_token: { access: mockResponse.tokens.access, refresh: mockResponse.tokens.refresh },
        user_id: mockUserData.user_id,
        nickname: mockUserData.nickname,
        email: mockUserData.email,
        login_id: mockUserData.login_id,
        login_method: mockUserData.login_method,
        session_id: mockResponse.session_id,
        session_started_at: mockResponse.session_started_at,
        faceRegistered: true,
        voiceRegistered: true
      } as any);

      setIsSuccess(true);

      setTimeout(() => {
        Alert.alert('테스트 모드', '테스트 계정으로 로그인되었습니다.', [
          {
            text: '확인',
            onPress: () => router.replace('/(auth)/preset-selection' as any)
          }
        ]);
      }, 500);
    } catch (e) {
      console.error('❌ 테스트 로그인 실패:', e);
      setIsVerifying(false);
    }
  };

  const attemptFaceLogin = async (imageUri: string) => {
    try {
      console.log('🚀 얼굴 로그인 시도...');
      const result = await biometricAPI.loginFace(imageUri);
      console.log('✅ 얼굴 로그인 응답:', result);

      const response = result as any;

      if (response && response.success) {
        setIsSuccess(true); // Show success UI

        // 1. Token Extraction
        let accessToken = '';
        let refreshToken = '';

        if (response.tokens) {
          accessToken = response.tokens.access;
          refreshToken = response.tokens.refresh;
        } else if (response.access_token && typeof response.access_token === 'object') {
          accessToken = response.access_token.access;
          refreshToken = response.access_token.refresh;
        } else if (typeof response.access_token === 'string') {
          accessToken = response.access_token;
        }

        if (!accessToken) throw new Error('토큰이 없습니다.');

        const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
        await AsyncStorage.setItem('@sarvis_access_token', accessToken);

        // 3. Get Profile
        console.log('👤 사용자 정보 조회 중...');
        const profileResponse = await authAPI.getProfile();
        console.log('✅ 사용자 정보 조회 성공:', profileResponse);

        const user = (profileResponse as any).user;
        if (!user) {
          throw new Error('사용자 정보를 불러올 수 없습니다.');
        }

        const userData = user;

        // 4. Sign In
        await signIn({
          uid: response.uid,
          access_token: refreshToken ? { access: accessToken, refresh: refreshToken } : accessToken,
          user_id: userData.user_id,
          nickname: userData.nickname,
          email: userData.email,
          user_type: response.user_type || 'user',
          face_vectors: undefined,
          session_id: response.session_id,
          session_started_at: response.session_started_at,
        } as any);

        // 5. Presets Logic
        let hasPresets = false;
        try {
          const presetRes = await presetAPI.getPresets();
          if (presetRes.presets && presetRes.presets.length > 0) {
            hasPresets = true;
          }
        } catch (e) {
          console.warn('⚠️ 프리셋 조회 실패 (로그인은 성공):', e);
        }

        setTimeout(() => {
          Alert.alert('성공', `${userData.nickname}님 환영합니다!`, [
            {
              text: '확인',
              onPress: () => {
                router.replace('/(auth)/preset-selection');
              }
            }
          ]);
        }, 500); // Slight delay to show success UI

      } else {
        throw new Error(response.message || '얼굴을 인식하지 못했습니다.');
      }

    } catch (error: any) {
      console.error('❌ 얼굴 로그인 실패:', error);
      setIsSuccess(false);
      const newRetryCount = retryCount + 1;
      setRetryCount(newRetryCount);

      let errorMessage = error.message || '얼굴 인식에 실패했습니다.';

      // 네트워크 오류 메시지 사용자 친화적으로 변경
      if (errorMessage.includes('Network request failed')) {
        errorMessage = '인터넷 연결이나 서버 상태를 확인해주세요.';
      }

      if (newRetryCount >= 3) {
        Alert.alert(
          '로그인 실패',
          '얼굴 인식에 3회 실패하였습니다. 아이디 로그인 화면으로 이동합니다.',
          [{
            text: '확인',
            onPress: () => router.replace('/(auth)/login-id' as any)
          }]
        );
      } else {
        Alert.alert(
          '로그인 실패',
          `${errorMessage}\n(남은 횟수: ${3 - newRetryCount}회)`,
          [{
            text: '다시 시도',
            onPress: () => {
              setCapturedImage(null);
              setIsVerifying(false);
            }
          }]
        );
      }
    }
  };

  const onVerify = async () => {
    // This function replaces the dummy onVerify and previous handleCapture
    if (!cameraRef.current || isVerifying) return;

    setIsVerifying(true);
    console.log('📸 사진 촬영 시도...');

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });
      console.log('📸 사진 촬영 완료:', photo?.uri);

      if (photo?.uri) {
        setCapturedImage(photo.uri);
        await attemptFaceLogin(photo.uri);
      }
    } catch (error) {
      console.error('❌ 카메라 촬영 실패:', error);
      Alert.alert('오류', '사진 촬영에 실패했습니다.');
      setIsVerifying(false);
      setCapturedImage(null);
    }
  };

  if (!canUseCamera && hasRequestedPermission) {
    return (
      <View style={styles.container}>
        <SarvisAppHeader
          title=""
          showBackButton={true}
          showMenuButton={false}
          showUserBadge={false}
        />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.permissionContainer}>
            <Ionicons name="camera-outline" size={64} color={SarvisTheme.colors.primary} />
            <Text style={styles.permissionText}>얼굴 로그인을 위해 카메라 권한이 필요합니다</Text>
            <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
              <Text style={styles.permissionButtonText}>권한 다시 요청</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SarvisAppHeader
        title=""
        showBackButton={true}
        showMenuButton={false}
        showUserBadge={false}
        onBackPress={() => router.back()}
      />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Instruction Section */}
          <View style={styles.instructionContainer}>
            <Text style={styles.mainInstruction}>얼굴로 로그인</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{permissionMessage}</Text>
            </View>
          </View>

          {/* Camera Visual Focus */}
          <View style={styles.visualContainer}>
            <Animated.View
              style={[
                styles.cameraFrame,
                { transform: [{ scale: pulseAnim }] }
              ]}
            >
              <View style={styles.cameraInnerFrame}>
                {/* 
                     NOTE: User Design had CameraView with animateShutter={false}. 
                     We keep that.
                 */}
                {capturedImage ? (
                  <Image source={{ uri: capturedImage }} style={styles.cameraView} />
                ) : (
                  <CameraView
                    ref={cameraRef}
                    style={styles.cameraView}
                    facing={facing}
                    animateShutter={false}
                  />
                )}

                {/* Scan Overlay Effect (Visible while verifying) */}
                {isVerifying && !isSuccess && <View style={styles.scanOverlay} />}

                {/* Success Feedback */}
                {isSuccess && (
                  <View style={styles.successOverlay}>
                    <Ionicons name="checkmark-circle" size={80} color="white" />
                  </View>
                )}
              </View>

              {/* Glowing Ring */}
              <View style={[
                styles.glowRing,
                isSuccess && styles.glowRingSuccess
              ]} />
            </Animated.View>
          </View>

          {/* Bottom Control Area */}
          <View style={styles.actions}>
            {!isSuccess ? (
              <TouchableOpacity
                style={[styles.shutterButton, isVerifying && styles.shutterDisabled]}
                onPress={onVerify}
                disabled={isVerifying}
              >
                {isVerifying ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <View style={styles.shutterInner} />
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.successButton}>
                <ActivityIndicator size="small" color="white" />
              </View>
            )}

            {/* <TouchableOpacity
              style={styles.testButton}
              onPress={createTestProfile}
            >
              <Text style={styles.testButtonText}>🚀 테스트 프로필로 로그인</Text>
            </TouchableOpacity> */}

            <TouchableOpacity
              style={styles.linkContainer}
              onPress={() => router.replace('/(auth)/login-id' as any)}
            >
              <Text style={styles.linkText}>아이디/비밀번호로 로그인</Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 60,
    alignItems: 'center',
  },
  instructionContainer: {
    alignItems: 'center',
    marginBottom: 40,
    width: '100%',
  },
  mainInstruction: {
    fontSize: 26,
    fontWeight: '900',
    color: SarvisTheme.colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  badge: {
    backgroundColor: SarvisTheme.colors.primaryLight,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: SarvisTheme.colors.primary,
  },
  visualContainer: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 40,
  },
  cameraFrame: {
    width: width * 0.75,
    height: width * 0.75,
    maxWidth: 320,
    maxHeight: 320,
    borderRadius: (width * 0.75) / 2,
    padding: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: SarvisTheme.colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  cameraInnerFrame: {
    flex: 1,
    borderRadius: 1000,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F1F5F9',
  },
  cameraView: {
    flex: 1,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: 'rgba(10, 87, 255, 0.4)',
    borderRadius: 1000,
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 87, 255, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowRing: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderColor: SarvisTheme.colors.primary,
    borderRadius: 1000,
    opacity: 0.8,
  },
  glowRingSuccess: {
    borderColor: SarvisTheme.colors.primary,
    opacity: 0.3,
  },
  actions: {
    width: '100%',
    alignItems: 'center',
    gap: 24,
  },
  shutterButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: SarvisTheme.colors.primary,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: SarvisTheme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  shutterDisabled: {
    opacity: 0.6,
  },
  shutterInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
  },
  successButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: SarvisTheme.colors.primary,
    opacity: 0.6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkContainer: {
    paddingVertical: 8,
  },
  linkText: {
    fontSize: 15,
    color: SarvisTheme.colors.textLight,
    textDecorationLine: 'underline',
    fontWeight: '700',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 50,
  },
  permissionText: {
    fontSize: 18,
    fontWeight: '800',
    color: SarvisTheme.colors.text,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 32,
    lineHeight: 26,
  },
  permissionButton: {
    backgroundColor: SarvisTheme.colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  testButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testButtonText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '700',
  },
});