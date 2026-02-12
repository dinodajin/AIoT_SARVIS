import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisFooter } from '@/components/sarvis/sarvis-footer';
import { SarvisLogo } from '@/components/sarvis/sarvis-logo';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { authAPI } from '@/api/auth';
import { Alert } from 'react-native';

export default function SignupScreen() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleNext = async () => {
    if (!loginId.trim()) {
      Alert.alert('알림', '아이디를 입력해주세요.');
      return;
    }

    setIsLoading(true);

    try {
      // 아이디 중복검사 API 호출
      const response = await authAPI.checkId(loginId);

      if (response.success) {
        // 아이디 사용 가능 → 닉네임 입력 화면으로 이동
        router.push({
          pathname: '/(auth)/signup-info' as any,
          params: { loginId }
        });
      } else {
        Alert.alert('알림', '이미 사용 중인 아이디입니다.');
      }
    } catch (error: any) {
      console.error('아이디 중복검사 실패:', error);
      Alert.alert('오류', '아이디 중복검사에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.headerContainer}>
            <Text style={styles.headerText}>STEP 1: 정보입력</Text>
          </View>

          <View style={styles.stepProgress}>
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, styles.activeStep]} />
              <Text style={[styles.stepText, styles.activeText]}>Step 1</Text>
              <Text style={[styles.stepText, styles.activeText]}>정보입력</Text>
            </View>
            <View style={styles.stepConnector} />
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, styles.inactiveStep]} />
              <Text style={styles.stepText}>Step 2</Text>
              <Text style={styles.stepText}>얼굴등록</Text>
            </View>
            <View style={styles.stepConnector} />
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, styles.inactiveStep]} />
              <Text style={styles.stepText}>Step 3</Text>
              <Text style={styles.stepText}>음성등록</Text>
            </View>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>아이디</Text>
              <TextInput
                style={styles.input}
                placeholder="사용할 아이디를 입력하세요"
                value={loginId}
                onChangeText={setLoginId}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
            </View>

            <Text style={styles.hint}>
              아이디는 다음에 로그인할 때 사용됩니다.
            </Text>

            <View style={styles.buttonContainer}>
              <SarvisButton
                title="이전"
                variant="outline"
                onPress={handleBack}
                style={styles.button}
                disabled={isLoading}
              />
              <SarvisButton
                title="다음"
                variant="primary"
                onPress={handleNext}
                style={styles.button}
                disabled={isLoading}
              />
            </View>

            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={SarvisTheme.colors.primary} />
                <Text style={styles.loadingText}>아이디 중복검사 중...</Text>
              </View>
            )}
          </View>
        </View>

        <SarvisFooter />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  headerText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#000000',
    marginBottom: 8,
  },
  stepProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  stepItem: {
    alignItems: 'center',
    gap: 4,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    marginBottom: 4,
  },
  activeStep: {
    backgroundColor: SarvisTheme.colors.primary,
  },
  inactiveStep: {
    backgroundColor: '#E2E8F0',
  },
  stepText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
  },
  activeText: {
    color: SarvisTheme.colors.primary,
  },
  stepConnector: {
    width: 30,
    height: 2,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4,
    marginTop: -20, // Align with dots
  },
  formContainer: {
    marginTop: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: SarvisTheme.colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: SarvisTheme.colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: SarvisTheme.colors.text,
  },
  hint: {
    fontSize: 14,
    color: SarvisTheme.colors.textLight,
    marginBottom: 24,
    textAlign: 'left',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  button: {
    flex: 1,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    padding: 16,
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
    borderRadius: 12,
  },
  loadingText: {
    marginLeft: 12,
    fontSize: 16,
    color: SarvisTheme.colors.primary,
    fontWeight: '600',
  },
});