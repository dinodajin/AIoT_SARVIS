import { LogBox } from 'react-native';

// 화면에 뜨는 노란/빨간 에러 박스를 모두 숨깁니다.
LogBox.ignoreAllLogs(true);

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { ConnectivityOverlay } from '@/components/sarvis/connectivity-overlay';
import { AuthProvider } from '@/providers/auth-provider';
import { ConnectivityProvider } from '@/providers/connectivity-provider';

export const unstable_settings = {
  anchor: '(tabs)',
};

import { requestAllPermissions } from '@/utils/Permissions';
import { initVoiceHandler } from '@/utils/voiceCommandHandler';
import { useEffect } from 'react';
import { Platform } from 'react-native';

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'android') {
      requestAllPermissions();
    }
    // 사운드 사전 로드 초기화
    initVoiceHandler();
  }, []);

  return (
    <AuthProvider>
      <ConnectivityProvider>
        <Stack>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
        <ConnectivityOverlay />
      </ConnectivityProvider>
    </AuthProvider>
  );
}
