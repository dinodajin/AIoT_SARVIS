import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisLogo } from '@/components/sarvis/sarvis-logo';
import { SarvisScreen } from '@/components/sarvis/sarvis-screen';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { SoftAPCommunication } from '@/utils/softap-communication';

export default function SignupDeviceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [comm] = useState(new SoftAPCommunication('10.42.0.1', 5000));
  
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [showRetry, setShowRetry] = useState(false);

  const email = params.email as string;
  const loginId = params.login_id as string;
  const uid = params.uid as string;

  // 기기 연결 감지
  useEffect(() => {
    let interval: NodeJS.Timeout;
    let timeout: NodeJS.Timeout;

    const checkDeviceConnection = async () => {
      try {
        const status = await comm.testConnection();
        if (status.connected && status.jetsonReachable) {
          setDeviceConnected(true);
          setLoading(false);
          setShowRetry(false);
          clearInterval(interval);
          clearTimeout(timeout);
        }
      } catch (error) {
        console.log('기기 연결 감지 중...');
      }
    };

    // 처음에 한 번 체크
    checkDeviceConnection();

    // 3초마다 연결 체크
    interval = setInterval(checkDeviceConnection, 3000);

    // 30초 후 재시도 버튼 표시
    timeout = setTimeout(() => {
      setShowRetry(true);
      setLoading(false);
      clearInterval(interval);
    }, 30000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [comm, retryCount]);

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
    setShowRetry(false);
    setLoading(true);
  };

  const handleCancel = () => {
    Alert.alert(
      '회원가입 취소',
      '회원가입을 취소하면 모든 정보가 초기화됩니다. 정말 취소하시겠습니까?',
      [
        { text: '아니오', style: 'cancel' },
        { 
          text: '네', 
          onPress: () => router.replace({ pathname: '/(auth)/login' } as any)
        }
      ]
    );
  };

  const handleNext = () => {
    router.push({ 
      pathname: '/(auth)/signup-face',
      params: { email, loginId, uid }
    } as any);
  };

  return (
    <SarvisScreen>
      <SarvisLogo subtitle="기기 연결" />

      <View style={styles.container}>
        <View style={styles.card}>
          {loading && (
            <View style={styles.content}>
              <Text style={styles.statusIcon}>📱</Text>
              <Text style={styles.statusText}>기기 연결 대기중...</Text>
              <Text style={styles.statusSubtext}>
                SARVIS 기기와 유선 케이블로 연결해주세요.
              </Text>
              <View style={styles.progressBar}>
                <View style={styles.progressFill} />
              </View>
              <Text style={styles.timerText}>연결 감지 중...</Text>
            </View>
          )}

          {deviceConnected && (
            <View style={styles.content}>
              <Text style={styles.statusIcon}>✅</Text>
              <Text style={styles.statusText}>기기가 연결되었습니다!</Text>
              <Text style={styles.statusSubtext}>
                Jetson 서버와 성공적으로 연결되었습니다.
              </Text>
              <SarvisButton
                title="다음: 얼굴 등록"
                variant="success"
                onPress={handleNext}
                style={styles.nextButton}
              />
            </View>
          )}

          {showRetry && !deviceConnected && (
            <View style={styles.content}>
              <Text style={styles.statusIcon}>⚠️</Text>
              <Text style={styles.statusText}>기기 연결 실패</Text>
              <Text style={styles.statusSubtext}>
                기기 연결을 감지하지 못했습니다. 다음을 확인해주세요:
              </Text>
              <View style={styles.checkList}>
                <Text style={styles.checkItem}>• 유선 케이블이 올바르게 연결되었나요?</Text>
                <Text style={styles.checkItem}>• SARVIS 기기가 켜져 있나요?</Text>
                <Text style={styles.checkItem}>• SoftAP 네트워크에 연결되었나요?</Text>
                <Text style={styles.checkItem}>• Jetson IP 주소가 10.42.0.1인가요?</Text>
              </View>
              <SarvisButton
                title="기기 연결 재시도"
                variant="primary"
                onPress={handleRetry}
                style={styles.retryButton}
              />
              <SarvisButton
                title="가입 취소"
                variant="outline"
                onPress={handleCancel}
              />
            </View>
          )}
        </View>
      </View>
    </SarvisScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  card: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: SarvisTheme.radius.lg,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIcon: {
    fontSize: 80,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 24,
    fontWeight: '800',
    color: SarvisTheme.colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  statusSubtext: {
    fontSize: 14,
    color: SarvisTheme.colors.textLight,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    width: '60%',
    height: '100%',
    backgroundColor: SarvisTheme.colors.primary,
  },
  timerText: {
    fontSize: 16,
    fontWeight: '600',
    color: SarvisTheme.colors.primary,
  },
  checkList: {
    width: '100%',
    marginBottom: 24,
    padding: 16,
    backgroundColor: SarvisTheme.colors.primaryLight,
    borderRadius: SarvisTheme.radius.md,
  },
  checkItem: {
    fontSize: 14,
    color: SarvisTheme.colors.text,
    lineHeight: 24,
    marginBottom: 4,
  },
  nextButton: {
    marginTop: 16,
  },
  retryButton: {
    marginBottom: 12,
  },
});