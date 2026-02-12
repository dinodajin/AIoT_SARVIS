
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { SarvisTheme } from '@/constants/sarvis-theme';
import { useAuth } from '@/providers/auth-provider';

export function SarvisAppHeader({ title = 'SARVIS' }: { title?: string }) {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.right}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{user?.nickname ?? '게스트'}</Text>
        </View>
        <Pressable onPress={() => router.push({ pathname: '/modal' } as any)} style={styles.menuBtn}>
          <Text style={styles.menuText}>⋮</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: SarvisTheme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: SarvisTheme.colors.primary,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  badge: {
    backgroundColor: SarvisTheme.colors.primaryLight,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: SarvisTheme.colors.border,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: SarvisTheme.colors.primary,
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: SarvisTheme.radius.md,
    backgroundColor: SarvisTheme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    fontSize: 22,
    fontWeight: '900',
    color: SarvisTheme.colors.primary,
    lineHeight: 22,
  },
});
