import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SarvisTheme } from '@/constants/sarvis-theme';

export function SarvisLogo({ subtitle }: { subtitle?: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>SARVIS</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: 28,
    paddingTop: 20,
  },
  logo: {
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: -1.2,
    color: SarvisTheme.colors.primary,
    marginBottom: 8,
  },
  subtitle: {
    color: SarvisTheme.colors.textLight,
    fontSize: 15,
    fontWeight: '600',
  },
});
