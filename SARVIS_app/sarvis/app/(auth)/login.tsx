import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect } from 'react';

import { useAuth } from '@/providers/auth-provider';
import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisLogo } from '@/components/sarvis/sarvis-logo';
import { SarvisFooter } from '@/components/sarvis/sarvis-footer';
import { SarvisAppHeader } from '@/components/sarvis/sarvis-app-header';
import { SarvisTheme } from '@/constants/sarvis-theme';

export default function LoginScreen() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading]);

  return (
    <View style={styles.container}>
      <SarvisAppHeader
        title=""
        showBackButton={true}
        showMenuButton={false}
        showUserBadge={false}
        onBackPress={() => router.replace('/')}
      />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <SarvisLogo subtitle="Smart Assistance Robot" />

          <View style={styles.buttonContainer}>
            <SarvisButton
              title="얼굴로 로그인"
              variant="primary"
              onPress={() => router.push({ pathname: '/(auth)/login-face' } as any)}
              style={styles.button}
            />
            <SarvisButton
              title="아이디로 로그인"
              variant="outline"
              onPress={() => router.push({ pathname: '/(auth)/login-id' } as any)}
              style={styles.button}
            />
          </View>

          <View style={styles.linkContainer}>
            <TouchableOpacity onPress={() => router.push({ pathname: '/(auth)/signup' } as any)}>
              <Text style={styles.smallLinkText}>회원가입</Text>
            </TouchableOpacity>
          </View>
        </View>

        <SarvisFooter />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: SarvisTheme.colors.bg,
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
    alignItems: 'center', // Centering content
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
    marginTop: 40,
  },
  button: {
    width: '100%',
  },
  linkContainer: {
    marginTop: 24,
    alignItems: 'center',
    gap: 12,
  },
  smallLinkText: {
    color: SarvisTheme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});