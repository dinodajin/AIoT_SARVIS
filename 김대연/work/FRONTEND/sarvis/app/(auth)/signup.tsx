
import React from 'react';
import { useRouter } from 'expo-router';

import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisLogo } from '@/components/sarvis/sarvis-logo';
import { SarvisScreen } from '@/components/sarvis/sarvis-screen';

export default function SignupScreen() {
  const router = useRouter();

  return (
    <SarvisScreen>
      <SarvisLogo subtitle="회원가입" />

      <SarvisButton
        title="📝 정보 입력 시작"
        variant="primary"
        onPress={() => router.push({ pathname: '/(auth)/signup-info' } as any)}
      />
      <SarvisButton title="뒤로" variant="outline" onPress={() => router.back()} />
    </SarvisScreen>
  );
}

