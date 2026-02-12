
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View, Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisLogo } from '@/components/sarvis/sarvis-logo';
import { SarvisScreen } from '@/components/sarvis/sarvis-screen';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { useAuth } from '@/providers/auth-provider';

const idRegex = /^[a-zA-Z0-9]{5,20}$/;
const pwRegex = /^(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,20}$/;

export default function LoginIdScreen() {
  const router = useRouter();
  const { signInWithPassword } = useAuth();

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const idValid = useMemo(() => idRegex.test(loginId), [loginId]);
  const pwValid = useMemo(() => pwRegex.test(password), [password]);

  const canSubmit = idValid && pwValid;

  const handleLogin = async () => {
    if (!canSubmit) return;

    setLoading(true);
    try {
      await signInWithPassword(loginId, password);
      Alert.alert('로그인 성공', `${loginId}님 환영합니다!`, [
        {
          text: '확인',
          onPress: () => {
            router.replace({ pathname: '/(tabs)' } as any);
          }
        }
      ]);
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert(
        '로그인 실패',
        error.response?.data?.message || error.message || '아이디 또는 비밀번호를 확인해주세요.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SarvisScreen>
      <SarvisLogo subtitle="로그인" />

      <View style={[styles.card, styles.deviceCard]}>
        <Text style={styles.deviceIcon}>✅</Text>
        <Text style={styles.deviceText}>기기 연결 완료</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.formGroup}>
          <Text style={styles.label}>아이디</Text>
          <TextInput
            value={loginId}
            onChangeText={setLoginId}
            autoCapitalize="none"
            style={styles.input}
            placeholder="영문/숫자 5-20자"
            placeholderTextColor={SarvisTheme.colors.textMuted}
          />
          <Text style={[styles.hint, !loginId ? styles.hintInfo : idValid ? styles.hintSuccess : styles.hintError]}>
            아이디 형식: 영문/숫자 5-20자
          </Text>
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
          />
          <Text
            style={[
              styles.hint,
              !password ? styles.hintInfo : pwValid ? styles.hintSuccess : styles.hintError,
            ]}>
            비밀번호 형식: 영문, 숫자, 특수문자 포함 8-20자
          </Text>
        </View>

        <View style={styles.linksRow}>
          <Text style={styles.link} onPress={() => {}}>
            아이디 찾기
          </Text>
          <Text style={styles.linkDivider}>|</Text>
          <Text style={styles.link} onPress={() => {}}>
            비밀번호 찾기
          </Text>
        </View>

        <SarvisButton
          title={loading ? "로그인 중..." : "로그인"}
          variant="primary"
          disabled={!canSubmit || loading}
          onPress={handleLogin}
        />
        <SarvisButton title="뒤로" variant="outline" onPress={() => router.back()} />
      </View>
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
    marginBottom: 16,
  },
  deviceCard: {
    alignItems: 'center',
    backgroundColor: SarvisTheme.colors.successLight,
    borderWidth: 2,
    borderColor: SarvisTheme.colors.success,
  },
  deviceIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  deviceText: {
    fontSize: 14,
    fontWeight: '800',
    color: SarvisTheme.colors.success,
  },
  form: {
    width: '100%',
  },
  formGroup: {
    marginBottom: 18,
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
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  link: {
    color: SarvisTheme.colors.primary,
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  linkDivider: {
    color: SarvisTheme.colors.textLight,
    fontWeight: '700',
  },
});

