
import React from 'react';
import { SafeAreaView, StyleSheet, View, ViewStyle } from 'react-native';

import { SarvisTheme } from '@/constants/sarvis-theme';

export function SarvisScreen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.container, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: SarvisTheme.colors.bg,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
    alignItems: 'stretch',
  },
});
