
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';

import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisLogo } from '@/components/sarvis/sarvis-logo';
import { SarvisScreen } from '@/components/sarvis/sarvis-screen';
import { SarvisTheme } from '@/constants/sarvis-theme';

export default function LoginScreen() {
  const router = useRouter();

  return (
    <SarvisScreen>
      <SarvisLogo subtitle="Smart Assistance Robot" />

      <SarvisButton
        title="👤 얼굴로 로그인"
        variant="primary"
        onPress={() => router.push({ pathname: '/(auth)/login-face' } as any)}
      />
      <SarvisButton
        title="🔐 아이디로 로그인"
        variant="outline"
        onPress={() => router.push({ pathname: '/(auth)/login-id' } as any)}
      />

      <Text style={styles.divider}>또는</Text>

      <SarvisButton
        title="✨ 회원가입"
        variant="success"
        onPress={() => router.push({ pathname: '/(auth)/signup' } as any)}
      />
    </SarvisScreen>
  );
}

const styles = StyleSheet.create({
  divider: {
    marginVertical: 18,
    color: SarvisTheme.colors.textLight,
    fontSize: 13,
    fontWeight: '600',
  },
});

