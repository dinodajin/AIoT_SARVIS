
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { SarvisTheme } from '@/constants/sarvis-theme';
import { useAuth } from '@/providers/auth-provider';

export default function MenuModal() {
  const router = useRouter();
  const { signOut } = useAuth();

  return (
    <Pressable style={styles.overlay} onPress={() => router.back()}>
      <Pressable style={styles.panel} onPress={() => {}}>
        <View style={styles.header}>
          <Text style={styles.title}>메뉴</Text>
          <Pressable style={styles.closeBtn} onPress={() => router.back()}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>사용자</Text>
        <Pressable style={styles.item} onPress={() => router.push({ pathname: '/(auth)/login-face' } as any)}>
          <Text style={styles.itemText}>👤 얼굴 재설정</Text>
        </Pressable>
        <Pressable style={styles.item} onPress={() => {}}>
          <Text style={styles.itemText}>🎤 음성 재설정</Text>
        </Pressable>
        <Pressable style={styles.item} onPress={() => {}}>
          <Text style={[styles.itemText, styles.dangerText]}>🗑️ 회원 탈퇴</Text>
        </Pressable>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>기기</Text>
        <Pressable style={styles.item} onPress={() => router.push({ pathname: '/device-info' } as any)}>
          <Text style={styles.itemText}>🔌 기기 정보</Text>
        </Pressable>

        <View style={styles.divider} />

        <Pressable
          style={styles.item}
          onPress={() => {
            signOut();
            router.replace({ pathname: '/(auth)/login' } as any);
          }}>
          <Text style={[styles.itemText, styles.dangerText]}>🚪 로그아웃</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingTop: 60,
    paddingHorizontal: 16,
    alignItems: 'flex-end',
  },
  panel: {
    width: 280,
    backgroundColor: 'white',
    borderRadius: SarvisTheme.radius.lg,
    borderWidth: 1,
    borderColor: SarvisTheme.colors.border,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: SarvisTheme.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: SarvisTheme.colors.text,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: SarvisTheme.radius.md,
    borderWidth: 1,
    borderColor: SarvisTheme.colors.border,
    backgroundColor: SarvisTheme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontWeight: '900',
    color: SarvisTheme.colors.textLight,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: SarvisTheme.colors.textMuted,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 8,
  },
  item: {
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  itemText: {
    fontSize: 14,
    fontWeight: '700',
    color: SarvisTheme.colors.text,
  },
  dangerText: {
    color: SarvisTheme.colors.danger,
  },
  divider: {
    height: 1,
    backgroundColor: SarvisTheme.colors.border,
    marginTop: 8,
  },
});

