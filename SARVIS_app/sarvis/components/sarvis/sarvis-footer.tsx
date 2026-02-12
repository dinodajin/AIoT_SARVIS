import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { SarvisTheme } from '@/constants/sarvis-theme';

export function SarvisFooter() {
  const router = useRouter();

  return (
    <View style={styles.footer}>
      <Text style={styles.copyright}>© 2026 Team S.A.R.V.I.S. All rights reserved.</Text>
      <View style={styles.links}>
        <Text style={styles.link} onPress={() => router.push({ pathname: '/terms' } as any)}>
          이용약관
        </Text>
        <Text style={styles.divider}>|</Text>
        <Text style={styles.link} onPress={() => router.push({ pathname: '/privacy' } as any)}>
          개인정보 처리방침
        </Text>
        <Text style={styles.divider}>|</Text>
        <Text
          style={styles.link}
          onPress={() => Linking.openURL('https://lab.ssafy.com/s14-webmobile3-sub1/S14P11A104')}
        >
          Gitlab
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: SarvisTheme.colors.border,
    alignItems: 'center',
  },
  copyright: {
    fontSize: 11,
    color: SarvisTheme.colors.textMuted,
    fontWeight: '600',
    marginBottom: 8,
  },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  link: {
    fontSize: 11,
    color: SarvisTheme.colors.textLight,
    fontWeight: '700',
  },
  divider: {
    fontSize: 11,
    color: SarvisTheme.colors.textMuted,
    fontWeight: '700',
  },
});
