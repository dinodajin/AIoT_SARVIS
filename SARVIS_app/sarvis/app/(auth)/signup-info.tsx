import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisFooter } from '@/components/sarvis/sarvis-footer';
import { SarvisLogo } from '@/components/sarvis/sarvis-logo';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { authAPI } from '@/api/auth';
import { Alert } from 'react-native';

type SignupStep = 'nickname' | 'email' | 'password';

export default function SignupInfoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const loginId = (params.loginId as string) || '';

  const [step, setStep] = useState<SignupStep>('nickname');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  // 1단계: 닉네임 입력
  const handleNicknameNext = async () => {
    if (!nickname.trim()) {
      Alert.alert('알림', '닉네임을 입력해주세요.');
      return;
    }

    setIsLoading(true);

    try {
      await authAPI.registerNickname(loginId, nickname);
      setStep('email');
    } catch (error: any) {
      console.error('닉네임 저장 실패:', error);
      Alert.alert('오류', '닉네임 저장에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 이메일 인증번호 발송
  const handleSendCode = async () => {
    if (!email.trim()) {
      Alert.alert('알림', '이메일을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    console.log('[DEBUG] 이메일 인증번호 발송 요청:', { email });

    try {
      const response = await authAPI.sendEmailCode(email);
      console.log('[DEBUG] 이메일 인증번호 발송 응답:', response);

      if (response.success) {
        setCodeSent(true);
        Alert.alert('알림', '인증번호가 발송되었습니다.');
      } else {
        Alert.alert('오류', response.message || '인증번호 발송에 실패했습니다.');
      }
    } catch (error: any) {
      console.error('[DEBUG] 이메일 발송 에러:', {
        message: error?.message,
        code: error?.code,
        response: error?.response?.data,
        status: error?.response?.status,
      });
      Alert.alert('오류', '이메일 인증번호 발송에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2단계: 이메일 인증
  const handleEmailNext = async () => {
    if (!email.trim()) {
      Alert.alert('알림', '이메일을 입력해주세요.');
      return;
    }

    if (!verificationCode.trim()) {
      Alert.alert('알림', '인증번호를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    console.log('[DEBUG] 이메일 인증 요청 시작:', { loginId, nickname, email, code: verificationCode });

    try {
      const response = await authAPI.registerEmail(loginId, nickname, email, verificationCode);
      console.log('[DEBUG] 이메일 인증 응답:', response);

      if (response.success) {
        console.log('[DEBUG] 이메일 인증 성공, 비밀번호 단계로 이동');
        // 화면 전환 전 약간의 딜레이를 추가하여 네트워크 연결이 안정화될 시간 제공
        setTimeout(() => {
          console.log('[DEBUG] 비밀번호 단계로 전환 완료');
          setStep('password');
        }, 300);
      } else {
        console.warn('[DEBUG] 이메일 인증 실패 응답:', response);
        Alert.alert('오류', response.message || '이메일 인증에 실패했습니다.');
      }
    } catch (error: any) {
      console.error('[DEBUG] 이메일 인증 에러 상세:', {
        message: error?.message,
        code: error?.code,
        response: error?.response?.data,
        status: error?.response?.status,
        config: {
          url: error?.config?.url,
          method: error?.config?.method,
          timeout: error?.config?.timeout,
        }
      });

      // 에러 유형에 따른 메시지
      let errorMessage = '이메일 인증에 실패했습니다.';
      if (error?.code === 'ECONNABORTED') {
        errorMessage = '요청 시간이 초과되었습니다. 네트워크 연결을 확인해주세요.';
      } else if (error?.code === 'ERR_NETWORK') {
        errorMessage = '네트워크 연결에 실패했습니다. 인터넷 연결을 확인해주세요.';
      } else if (error?.response?.status === 400) {
        errorMessage = error?.response?.data?.message || '인증번호가 올바르지 않습니다.';
      } else if (error?.response?.status >= 500) {
        errorMessage = '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      }

      Alert.alert('오류', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // 3단계: 비밀번호 입력
  const handlePasswordNext = async () => {
    if (!password.trim()) {
      Alert.alert('알림', '비밀번호를 입력해주세요.');
      return;
    }

    if (password.length !== 6 || !/^\d{6}$/.test(password)) {
      Alert.alert('알림', '비밀번호는 6자리 숫자여야 합니다.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('알림', '비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsLoading(true);

    try {
      await authAPI.registerPassword(loginId, nickname, password);

      // 얼굴 캡처 화면으로 이동
      router.push({
        pathname: '/(auth)/face-capture' as any,
        params: { loginId, nickname }
      });
    } catch (error: any) {
      console.error('비밀번호 저장 실패:', error);
      Alert.alert('오류', '비밀번호 저장에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'nickname') {
      router.back();
    } else if (step === 'email') {
      setStep('nickname');
    } else if (step === 'password') {
      setStep('email');
    }
  };

  const renderNicknameStep = () => (
    <>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>닉네임 입력</Text>
        <TextInput
          style={styles.input}
          placeholder="닉네임을 입력하세요"
          value={nickname}
          onChangeText={setNickname}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isLoading}
        />
      </View>
      <SarvisButton
        title="다음"
        variant="primary"
        onPress={handleNicknameNext}
        style={styles.button}
        disabled={isLoading}
      />
    </>
  );

  const renderEmailStep = () => (
    <>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>이메일 인증</Text>
        <TextInput
          style={styles.input}
          placeholder="이메일을 입력하세요"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!isLoading}
        />
      </View>

      {!codeSent ? (
        <SarvisButton
          title="인증번호 발송"
          variant="outline"
          onPress={handleSendCode}
          style={styles.button}
          disabled={isLoading}
        />
      ) : (
        <>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>인증번호</Text>
            <TextInput
              style={styles.input}
              placeholder="인증번호 6자리를 입력하세요"
              value={verificationCode}
              onChangeText={setVerificationCode}
              keyboardType="number-pad"
              maxLength={6}
              editable={!isLoading}
            />
          </View>
          <SarvisButton
            title="다음"
            variant="primary"
            onPress={handleEmailNext}
            style={styles.button}
            disabled={isLoading}
          />
        </>
      )}
    </>
  );

  const renderPasswordStep = () => (
    <>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>비밀번호</Text>
        <TextInput
          style={styles.input}
          placeholder="6자리 숫자 비밀번호"
          value={password}
          onChangeText={setPassword}
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
          editable={!isLoading}
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>비밀번호 확인</Text>
        <TextInput
          style={styles.input}
          placeholder="비밀번호 다시 입력"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
          editable={!isLoading}
        />
      </View>
      <Text style={styles.hint}>
        비밀번호는 6자리 숫자로 구성해야 합니다.
      </Text>
      <SarvisButton
        title="다음"
        variant="primary"
        onPress={handlePasswordNext}
        style={styles.button}
        disabled={isLoading}
      />
    </>
  );

  const getStepTitle = () => {
    switch (step) {
      case 'nickname':
        return '닉네임 입력';
      case 'email':
        return '이메일 인증';
      case 'password':
        return '비밀번호 설정';
    }
  };

  const getStepProgress = () => {
    switch (step) {
      case 'nickname':
        return '1/3';
      case 'email':
        return '2/3';
      case 'password':
        return '3/3';
    }
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
            {/* <Text style={styles.stepTitle}>{getStepTitle()}</Text> */}

            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={SarvisTheme.colors.primary} />
                <Text style={styles.loadingText}>처리 중...</Text>
              </View>
            )}

            {step === 'nickname' && renderNicknameStep()}
            {step === 'email' && renderEmailStep()}
            {step === 'password' && renderPasswordStep()}

            <View style={styles.buttonContainer}>
              <SarvisButton
                title="이전"
                variant="outline"
                onPress={handleBack}
                style={styles.backButton}
                disabled={isLoading}
              />
            </View>
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
  stepTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: SarvisTheme.colors.text,
    marginBottom: 24,
    textAlign: 'center',
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
    marginBottom: 16,
    textAlign: 'left',
  },
  button: {
    marginBottom: 12,
  },
  buttonContainer: {
    marginTop: 8,
  },
  backButton: {
    marginBottom: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
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