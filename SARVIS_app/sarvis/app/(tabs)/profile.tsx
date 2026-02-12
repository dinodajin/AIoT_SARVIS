import React, { useState } from 'react';
import { StyleSheet, Text, View, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { SarvisAppHeader } from '@/components/sarvis/sarvis-app-header';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { useAuth } from '@/providers/auth-provider';
import { authAPI } from '@/api/auth';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, tokens, signOut } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  /**
   * 로그아웃 처리
   * API: POST /api/auth/logout/
   */
  const handleLogout = () => {
    Alert.alert(
      '로그아웃',
      '로그아웃하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '로그아웃',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);

            try {
              // 1. 서버에 로그아웃 요청 (refresh 토큰 무효화)
              if (tokens?.refresh) {
                try {
                  await authAPI.logout(tokens.refresh);
                  console.log('✅ 서버 로그아웃 성공');
                } catch (apiError) {
                  // 서버 로그아웃 실패해도 로컬 로그아웃은 진행
                  console.warn('⚠️ 서버 로그아웃 실패 (로컬 로그아웃 진행):', apiError);
                }
              }

              // 2. AuthContext 로그아웃 (로컬 스토리지 정리, WebSocket 해제)
              await signOut();
              console.log('✅ 로컬 로그아웃 완료');

              // 3. 로그인 화면으로 이동
              router.replace('/(auth)/login' as any);
            } catch (error) {
              console.error('❌ 로그아웃 실패:', error);
              Alert.alert('오류', '로그아웃에 실패했습니다.');
            } finally {
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.root}>
          <SarvisAppHeader showBackButton={true} />
          <View style={styles.content}>
            <Text style={styles.errorText}>사용자 정보를 불러올 수 없습니다.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        <SarvisAppHeader showBackButton={true} />

        <View style={styles.content}>
          {/* 프로필 헤더 */}
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user.nickname.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.userName}>{user.nickname}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>

          {/* 계정 정보 */}
          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>계정 정보</Text>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>아이디</Text>
              <Text style={styles.infoValue}>{user.login_id}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>닉네임</Text>
              <Text style={styles.infoValue}>{user.nickname}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>이메일</Text>
              <Text style={styles.infoValue}>{user.email}</Text>
            </View>

            <View style={[styles.infoItem, { borderBottomWidth: 0 }]}>
              <Text style={styles.infoLabel}>로그인 방식</Text>
              <Text style={styles.infoValue}>
                {user.login_method === 'face' ? '얼굴 인식' : '비밀번호'}
              </Text>
            </View>
          </View>

          {/* 로그아웃 버튼 */}
          <TouchableOpacity
            style={[styles.logoutButton, isLoggingOut && styles.logoutButtonDisabled]}
            onPress={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? (
              <View style={styles.logoutLoading}>
                <ActivityIndicator size="small" color="white" />
                <Text style={styles.logoutButtonText}>로그아웃 중...</Text>
              </View>
            ) : (
              <Text style={styles.logoutButtonText}>로그아웃</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  root: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: SarvisTheme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: '#6c757d',
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: SarvisTheme.colors.primary,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 16,
  },
  infoItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6c757d',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: '#212529',
  },
  logoutButton: {
    backgroundColor: '#dc3545',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  logoutButtonDisabled: {
    backgroundColor: '#a0a0a0',
  },
  logoutLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  errorText: {
    fontSize: 16,
    color: SarvisTheme.colors.textLight,
    textAlign: 'center',
  },
});