import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View, Alert, Modal, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisLogo } from '@/components/sarvis/sarvis-logo';
import { SarvisScreen } from '@/components/sarvis/sarvis-screen';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { apiClient } from '@/utils/api';

const nicknameRegex = /^[가-힣a-zA-Z0-9]{2,20}$/;
const idRegex = /^[a-zA-Z0-9]{5,20}$/;
const pwRegex = /^(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,20}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EmailDomain = 'naver.com' | 'gmail.com' | 'daum.net' | 'hanmail.net' | 'direct';

export default function SignupInfoScreen() {
  const router = useRouter();

  const [nickname, setNickname] = useState('');
  const [loginId, setLoginId] = useState('');
  const [emailId, setEmailId] = useState('');
  const [emailDomain, setEmailDomain] = useState<EmailDomain>('direct');
  const [customDomain, setCustomDomain] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeSensitive, setAgreeSensitive] = useState(false);

  const [agreeAll, setAgreeAll] = useState(false);

  const [emailCode, setEmailCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [codeTimer, setCodeTimer] = useState(0);
  const [loading, setLoading] = useState(false);

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [currentTerms, setCurrentTerms] = useState<'terms' | 'privacy' | 'sensitive' | null>(null);

  const email = emailDomain === 'direct' 
    ? (emailId && customDomain ? `${emailId}@${customDomain}` : '')
    : (emailId ? `${emailId}@${emailDomain}` : '');

  const nicknameValid = useMemo(() => nicknameRegex.test(nickname), [nickname]);
  const idValid = useMemo(() => idRegex.test(loginId), [loginId]);
  const emailValid = useMemo(() => emailRegex.test(email), [email]);
  const passwordValid = useMemo(() => pwRegex.test(password), [password]);
  const passwordMatch = useMemo(
    () => password && passwordConfirm && password === passwordConfirm,
    [password, passwordConfirm]
  );

  const canSubmit =
    nicknameValid &&
    idValid &&
    emailValid &&
    emailVerified &&
    passwordValid &&
    passwordMatch &&
    agreeTerms &&
    agreePrivacy &&
    agreeSensitive;

  // 전체 동의 처리
  const handleAgreeAll = () => {
    const newValue = !agreeAll;
    setAgreeAll(newValue);
    setAgreeTerms(newValue);
    setAgreePrivacy(newValue);
    setAgreeSensitive(newValue);
  };

  // 개별 약관 동의 변경 시 전체 동의 체크
  const handleAgreeChange = (type: 'terms' | 'privacy' | 'sensitive', value: boolean) => {
    if (type === 'terms') setAgreeTerms(value);
    if (type === 'privacy') setAgreePrivacy(value);
    if (type === 'sensitive') setAgreeSensitive(value);

    setAgreeAll(agreeTerms && agreePrivacy && agreeSensitive);
  };

  // 인증 코드 타이머
  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (codeTimer > 0) {
      interval = setInterval(() => {
        setCodeTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [codeTimer]);

  // 이메일 인증 코드 요청
  const handleRequestEmailCode = async () => {
    if (!emailValid) {
      Alert.alert('오류', '올바른 이메일을 입력해주세요');
      return;
    }

    setLoading(true);
    try {
      await apiClient.requestEmailCode(email);
      setCodeSent(true);
      setCodeTimer(300); // 5분
      Alert.alert('성공', '인증 코드가 발송되었습니다. (개발용: 999999)');
    } catch (error: any) {
      Alert.alert('오류', error.response?.data?.message || '인증 코드 발송 실패');
    } finally {
      setLoading(false);
    }
  };

  // 이메일 인증 코드 검증
  const handleVerifyEmailCode = async () => {
    if (emailCode.length !== 6) {
      Alert.alert('오류', '6자리 인증 코드를 입력해주세요');
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.verifyEmailCode(email, emailCode);
      console.log('Email verification response:', response);
      
      if (response.success) {
        setEmailVerified(true);
        Alert.alert('성공', `이메일 인증 완료\nUID: ${response.uid}`);
      } else {
        Alert.alert('실패', response.message || '인증 실패');
      }
    } catch (error: any) {
      console.error('Email verification error:', error);
      const errorMsg = error.response?.data?.message || error.message || error.response?.data?.errors?.email?.[0] || '인증 실패';
      Alert.alert('오류', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // 정보 입력 완료
  const handleSubmit = async () => {
    if (!canSubmit) return;

    setLoading(true);
    try {
      const response = await apiClient.registerStep1({
        login_id: loginId,
        password: password,
        password_confirm: passwordConfirm,
        email: email,
        nickname: nickname,
      });
      
      console.log('Registration step1 response:', response);
      
      if (response.success) {
        // 인증 후에 uid가 반환됨, 그 uid를 사용
        const uid = response.uid || response.login_id || '';
        
        Alert.alert('성공', '기본 정보가 저장되었습니다.', [
          {
            text: '확인',
            onPress: () => {
              router.push({ 
                pathname: '/(auth)/signup-device',
                params: { 
                  email: email, 
                  login_id: loginId, 
                  uid: uid 
                } as any
              });
            }
          }
        ]);
      } else {
        Alert.alert('실패', response.message || '회원가입 실패');
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      
      // 에러 응답에서 상세 메시지 추출
      const errors = error.response?.data?.errors || {};
      const errorKeys = Object.keys(errors);
      
      if (errorKeys.length > 0) {
        // 필드별 에러 메시지
        const errorMessage = errorKeys.map(key => {
          const fieldErrors = errors[key];
          return Array.isArray(fieldErrors) ? fieldErrors.join(', ') : fieldErrors;
        }).join('\n');
        Alert.alert('오류', errorMessage);
      } else {
        // 일반 에러 메시지
        const errorMsg = error.response?.data?.message || error.message || '회원가입 실패';
        Alert.alert('오류', errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <SarvisScreen>
      <SarvisLogo subtitle="회원 정보 입력" />

      <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
        <View style={styles.formGroup}>
          <Text style={styles.label}>닉네임</Text>
          <TextInput
            value={nickname}
            onChangeText={setNickname}
            style={styles.input}
            placeholder="2-20자"
            placeholderTextColor={SarvisTheme.colors.textMuted}
            maxLength={20}
          />
          <Text style={[styles.hint, nicknameValid ? styles.hintSuccess : nickname ? styles.hintError : styles.hintInfo]}>
            {nicknameValid ? '사용 가능한 닉네임입니다' : nickname ? '2-20자 (한글, 영문, 숫자 가능)' : ''}
          </Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>아이디</Text>
          <TextInput
            value={loginId}
            onChangeText={setLoginId}
            autoCapitalize="none"
            style={styles.input}
            placeholder="영문/숫자 5-20자"
            placeholderTextColor={SarvisTheme.colors.textMuted}
            maxLength={20}
          />
          <Text style={[styles.hint, idValid ? styles.hintSuccess : loginId ? styles.hintError : styles.hintInfo]}>
            {idValid ? '사용 가능한 아이디입니다' : loginId ? '영문/숫자 5-20자' : ''}
          </Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>이메일</Text>
          <View style={styles.emailRow}>
            <TextInput
              value={emailId}
              onChangeText={setEmailId}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[styles.input, styles.emailInput]}
              placeholder="example"
              placeholderTextColor={SarvisTheme.colors.textMuted}
            />
            <Text style={styles.atSymbol}>@</Text>
            {emailDomain === 'direct' ? (
              <TextInput
                value={customDomain}
                onChangeText={setCustomDomain}
                autoCapitalize="none"
                style={[styles.input, styles.emailInput]}
                placeholder="domain.com"
                placeholderTextColor={SarvisTheme.colors.textMuted}
              />
            ) : (
              <TextInput
                value={emailDomain}
                editable={false}
                style={[styles.input, styles.emailInput, styles.disabledInput]}
              />
            )}
          </View>
          <View style={styles.domainSelect}>
            <Text 
              style={[styles.domainOption, emailDomain === 'naver.com' && styles.domainActive]}
              onPress={() => setEmailDomain('naver.com')}
            >
              naver.com
            </Text>
            <Text 
              style={[styles.domainOption, emailDomain === 'gmail.com' && styles.domainActive]}
              onPress={() => setEmailDomain('gmail.com')}
            >
              gmail.com
            </Text>
            <Text 
              style={[styles.domainOption, emailDomain === 'daum.net' && styles.domainActive]}
              onPress={() => setEmailDomain('daum.net')}
            >
              daum.net
            </Text>
            <Text 
              style={[styles.domainOption, emailDomain === 'hanmail.net' && styles.domainActive]}
              onPress={() => setEmailDomain('hanmail.net')}
            >
              hanmail.net
            </Text>
            <Text 
              style={[styles.domainOption, emailDomain === 'direct' && styles.domainActive]}
              onPress={() => setEmailDomain('direct')}
            >
              직접 입력
            </Text>
          </View>
          <Text style={[styles.hint, emailValid ? styles.hintSuccess : email ? styles.hintError : styles.hintInfo]}>
            {emailValid ? '사용 가능한 이메일입니다' : email ? '올바른 이메일 형식이 아닙니다' : ''}
          </Text>

          {!emailVerified && (
            <SarvisButton
              title="중복확인 및 인증번호 발송"
              variant="secondary"
              disabled={!emailValid || codeSent || loading}
              onPress={handleRequestEmailCode}
              style={styles.codeButton}
            />
          )}

          {codeSent && !emailVerified && (
            <View style={styles.codeSection}>
              <TextInput
                value={emailCode}
                onChangeText={setEmailCode}
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.input, styles.codeInput]}
                placeholder="6자리 인증 코드"
                placeholderTextColor={SarvisTheme.colors.textMuted}
              />
              <View style={styles.timerContainer}>
                <Text style={styles.timer}>{formatTime(codeTimer)}</Text>
                {codeTimer === 0 && (
                  <SarvisButton
                    title="재발송"
                    variant="outline"
                    onPress={handleRequestEmailCode}
                    style={styles.resendButton}
                  />
                )}
              </View>
              <SarvisButton
                title="인증하기"
                variant="primary"
                disabled={emailCode.length !== 6 || loading}
                onPress={handleVerifyEmailCode}
                style={styles.verifyButton}
              />
            </View>
          )}

          {emailVerified && (
            <Text style={[styles.hint, styles.hintSuccess]}>✓ 이메일 인증 완료</Text>
          )}
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>비밀번호</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            placeholder="영문, 숫자, 특수문자 8-20자"
            placeholderTextColor={SarvisTheme.colors.textMuted}
            maxLength={20}
          />
          <Text style={[styles.hint, passwordValid ? styles.hintSuccess : password ? styles.hintError : styles.hintInfo]}>
            {passwordValid ? '사용 가능한 비밀번호입니다' : password ? '영문, 숫자, 특수문자를 포함한 8-20자' : ''}
          </Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>비밀번호 확인</Text>
          <TextInput
            value={passwordConfirm}
            onChangeText={setPasswordConfirm}
            secureTextEntry
            style={styles.input}
            placeholder="비밀번호 확인"
            placeholderTextColor={SarvisTheme.colors.textMuted}
            maxLength={20}
          />
          <Text style={[styles.hint, passwordMatch ? styles.hintSuccess : passwordConfirm ? styles.hintError : styles.hintInfo]}>
            {passwordMatch ? '비밀번호가 일치합니다' : passwordConfirm ? '비밀번호가 일치하지 않습니다' : ''}
          </Text>
        </View>

        <View style={styles.agreementBox}>
          <Text style={styles.agreementItem} onPress={handleAgreeAll}>
            {agreeAll ? '☑' : '☐'} 전체 동의
          </Text>
          <Text style={styles.agreementItem} onPress={() => {
            setCurrentTerms('terms');
            setShowTermsModal(true);
          }}>
            {agreeTerms ? '☑' : '☐'} [필수] 서비스 이용약관 동의
          </Text>
          <Text style={styles.agreementItem} onPress={() => {
            setCurrentTerms('privacy');
            setShowTermsModal(true);
          }}>
            {agreePrivacy ? '☑' : '☐'} [필수] 개인정보 수집 및 이용 동의
          </Text>
          <Text style={styles.agreementItem} onPress={() => {
            setCurrentTerms('sensitive');
            setShowTermsModal(true);
          }}>
            {agreeSensitive ? '☑' : '☐'} [필수] 민감정보 수집 및 이용 동의
          </Text>
        </View>

        <SarvisButton
          title="정보 입력 완료"
          variant="success"
          disabled={!canSubmit || loading}
          onPress={handleSubmit}
        />
        <SarvisButton
          title="처음으로"
          variant="outline"
          onPress={() => router.back()}
        />
      </ScrollView>

      {/* 약관 모달 */}
      <Modal
        visible={showTermsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTermsModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {currentTerms === 'terms' ? '서비스 이용약관' : 
               currentTerms === 'privacy' ? '개인정보 수집 및 이용' : 
               '민감정보 수집 및 이용'}
            </Text>
            <ScrollView style={styles.modalText}>
              <Text style={styles.modalBody}>
                {currentTerms === 'terms' && '서비스 이용약관 내용이 여기에 표시됩니다...'}
                {currentTerms === 'privacy' && '개인정보 수집 및 이용 동의 내용이 여기에 표시됩니다...'}
                {currentTerms === 'sensitive' && '민감정보(얼굴/음성 벡터) 수집 및 이용 동의 내용이 여기에 표시됩니다...'}
              </Text>
            </ScrollView>
            <SarvisButton
              title="확인"
              variant="primary"
              onPress={() => setShowTermsModal(false)}
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>
    </SarvisScreen>
  );
}

const styles = StyleSheet.create({
  form: {
    width: '100%',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 8,
    color: SarvisTheme.colors.text,
  },
  input: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: SarvisTheme.radius.md,
    borderWidth: 2,
    borderColor: SarvisTheme.colors.border,
    backgroundColor: 'white',
    fontSize: 15,
    color: SarvisTheme.colors.text,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  emailInput: {
    flex: 1,
  },
  atSymbol: {
    marginHorizontal: 8,
    fontSize: 16,
    fontWeight: '600',
    color: SarvisTheme.colors.text,
  },
  disabledInput: {
    backgroundColor: '#F5F5F5',
  },
  domainSelect: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  domainOption: {
    fontSize: 12,
    fontWeight: '600',
    color: SarvisTheme.colors.textLight,
    marginRight: 12,
    marginBottom: 4,
    padding: 4,
  },
  domainActive: {
    color: SarvisTheme.colors.primary,
  },
  hint: {
    marginTop: 6,
    minHeight: 18,
    fontSize: 12,
    fontWeight: '600',
  },
  hintInfo: {
    color: SarvisTheme.colors.textLight,
  },
  hintSuccess: {
    color: SarvisTheme.colors.success,
  },
  hintError: {
    color: SarvisTheme.colors.danger,
  },
  codeButton: {
    marginTop: 8,
  },
  codeSection: {
    marginTop: 8,
  },
  codeInput: {
    marginBottom: 8,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timer: {
    fontSize: 16,
    fontWeight: '700',
    color: SarvisTheme.colors.primary,
  },
  resendButton: {
    width: 100,
  },
  verifyButton: {
    marginTop: 4,
  },
  agreementBox: {
    marginTop: 10,
    marginBottom: 16,
    padding: 14,
    backgroundColor: SarvisTheme.colors.primaryLight,
    borderRadius: SarvisTheme.radius.md,
    borderWidth: 1,
    borderColor: SarvisTheme.colors.border,
  },
  agreementItem: {
    fontSize: 13,
    fontWeight: '600',
    color: SarvisTheme.colors.text,
    lineHeight: 22,
    marginBottom: 6,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: SarvisTheme.radius.lg,
    padding: 20,
    width: '100%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
    color: SarvisTheme.colors.text,
    textAlign: 'center',
  },
  modalText: {
    flex: 1,
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 22,
    color: SarvisTheme.colors.text,
  },
  modalButton: {
    marginTop: 8,
  },
});