import React, { useState, useMemo } from 'react';
import { StyleSheet, Text, View, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisLogo } from '@/components/sarvis/sarvis-logo';
import { SarvisScreen } from '@/components/sarvis/sarvis-screen';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { useAuth } from '@/providers/auth-provider';
import { SoftAPCommunication } from '@/utils/softap-communication';

type Phase = 'waiting' | 'searching' | 'capturing' | 'uploading' | 'success' | 'error';

export default function LoginFaceScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [comm] = useState(new SoftAPCommunication('10.42.0.1', 5000));
  
  const [phase, setPhase] = useState<Phase>('waiting');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const deviceText = useMemo(() => {
    if (phase === 'waiting') return { icon: '🔌', text: '기기 연결 대기중...' };
    if (phase === 'searching') return { icon: '🔍', text: '기기 검색 중...' };
    return { icon: '✅', text: '기기 연결 완료' };
  }, [phase]);

  const message = useMemo(() => {
    if (phase === 'waiting') return { title: '기기 연결 후 얼굴을 스캔합니다...', detail: 'SARVIS 기기를 케이블로 연결해주세요' };
    if (phase === 'searching') return { title: '기기 검색 중...', detail: '잠시만 기다려주세요' };
    if (phase === 'capturing') return { title: '얼굴 촬영 준비 완료', detail: '카메라 버튼을 눌러 촬영하세요' };
    if (phase === 'uploading') return { title: '얼굴 인식 중...', detail: 'Jetson 서버로 전송 중입니다...' };
    if (phase === 'success') return { title: '얼굴 인식 성공!', detail: '환영합니다, 사용자님' };
    if (phase === 'error') return { title: '로그인 실패', detail: errorMessage || '다시 시도해주세요' };
    return { title: '기기 연결 후 얼굴을 스캔합니다...', detail: 'SARVIS 기기를 케이블로 연결해주세요' };
  }, [phase, errorMessage]);

  // 기기 검색
  const searchDevice = async () => {
    setPhase('searching');
    
    // 1.5초 대기 (검색 시뮬레이션)
    setTimeout(() => {
      setPhase('capturing');
    }, 1500);
  };

  // 얼굴 촬영
  const captureFace = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
        cameraType: 'front'
      });

      if (!result.canceled && result.assets[0]) {
        setCapturedImage(result.assets[0].uri);
        setPhase('uploading');
        
        // Jetson으로 전송
        await sendToJetson(result.assets[0].uri);
      } else {
        // 촬영 취소
        setPhase('capturing');
      }
    } catch (error) {
      console.error('Camera error:', error);
      setPhase('error');
      setErrorMessage('카메라 오류가 발생했습니다');
      setTimeout(() => setPhase('capturing'), 3000);
    }
  };

  // Jetson 서버로 전송
  const sendToJetson = async (imageUri: string) => {
    try {
      const result = await comm.loginWithFace(imageUri);
      
      if (result.success) {
        setPhase('success');
        
        // 1.5초 후 로그인 처리
        setTimeout(() => {
          signIn({
            uid: result.user?.uid || 'login_user',
            nickname: result.user?.nickname || '테스트 사용자',
            loginId: 'face_login',
            email: 'test@example.com'
          });
          
          router.replace({ pathname: '/(tabs)' } as any);
        }, 1500);
      } else {
        setPhase('error');
        setErrorMessage('로그인 실패');
        setTimeout(() => setPhase('capturing'), 3000);
      }
    } catch (error) {
      console.error('Login error:', error);
      setPhase('error');
      setErrorMessage('서버 연결 실패');
      setTimeout(() => setPhase('capturing'), 3000);
    }
  };

  // 자동 시작
  React.useEffect(() => {
    searchDevice();
  }, []);

  return (
    <SarvisScreen>
      <SarvisLogo subtitle="얼굴 인식" />

      <View style={[styles.card, styles.deviceCard]}>
        <Text style={styles.deviceIcon}>{deviceText.icon}</Text>
        <Text style={styles.deviceText}>{deviceText.text}</Text>
      </View>

      <View style={styles.faceWrap}>
        {phase === 'waiting' || phase === 'searching' ? (
          <View
            style={[
              styles.faceCircle,
              styles.facePrimary,
            ]}>
            <Text style={styles.faceIcon}>👤</Text>
          </View>
        ) : phase === 'capturing' ? (
          <View style={[styles.faceCircle, styles.faceScanning]}>
            <Text style={styles.faceIcon}>📷</Text>
          </View>
        ) : phase === 'uploading' ? (
          <View style={[styles.faceCircle, styles.faceUploading]}>
            {capturedImage && (
              <Image 
                source={{ uri: capturedImage }} 
                style={styles.capturedImage} 
              />
            )}
            <View style={styles.overlay}>
              <Text style={styles.uploadText}>⬆️</Text>
            </View>
          </View>
        ) : phase === 'success' ? (
          <View style={[styles.faceCircle, styles.faceSuccess]}>
            <Text style={styles.faceIcon}>✅</Text>
          </View>
        ) : (
          <View style={[styles.faceCircle, styles.faceError]}>
            <Text style={styles.faceIcon}>❌</Text>
          </View>
        )}
        
        <Text style={[styles.statusMessage, phase === 'success' ? styles.statusSuccess : null]}>
          {message.title}
        </Text>
        <Text style={styles.statusDetail}>{message.detail}</Text>
      </View>

      {phase === 'capturing' && (
        <SarvisButton 
          title="📷 얼굴 촬영" 
          variant="primary" 
          onPress={captureFace} 
        />
      )}

      <SarvisButton title="뒤로" variant="outline" onPress={() => router.back()} />
    </SarvisScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: SarvisTheme.colors.card,
    borderRadius: SarvisTheme.radius.lg,
    borderWidth: 1,
    borderColor: SarvisTheme.colors.border,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  deviceCard: {
    alignItems: 'center',
    backgroundColor: SarvisTheme.colors.primaryLight,
    borderWidth: 2,
    borderColor: SarvisTheme.colors.primary,
  },
  deviceIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  deviceText: {
    fontSize: 14,
    fontWeight: '700',
    color: SarvisTheme.colors.primary,
  },
  faceWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 22,
  },
  faceCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    marginBottom: 16,
    overflow: 'hidden',
  },
  facePrimary: {
    borderColor: SarvisTheme.colors.primary,
    backgroundColor: SarvisTheme.colors.primaryLight,
  },
  faceScanning: {
    borderColor: SarvisTheme.colors.primary,
    backgroundColor: SarvisTheme.colors.primaryLight,
  },
  faceUploading: {
    borderColor: SarvisTheme.colors.primary,
    backgroundColor: '#E3F2FD',
  },
  capturedImage: {
    width: 200,
    height: 200,
    position: 'absolute',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(33, 150, 243, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadText: {
    fontSize: 48,
  },
  faceSuccess: {
    borderColor: SarvisTheme.colors.success,
    backgroundColor: SarvisTheme.colors.successLight,
  },
  faceError: {
    borderColor: SarvisTheme.colors.danger,
    backgroundColor: SarvisTheme.colors.dangerLight,
  },
  faceIcon: {
    fontSize: 72,
  },
  statusMessage: {
    fontSize: 17,
    fontWeight: '800',
    color: SarvisTheme.colors.primary,
    marginBottom: 6,
  },
  statusSuccess: {
    color: SarvisTheme.colors.success,
  },
  statusDetail: {
    fontSize: 14,
    fontWeight: '600',
    color: SarvisTheme.colors.textLight,
  },
});