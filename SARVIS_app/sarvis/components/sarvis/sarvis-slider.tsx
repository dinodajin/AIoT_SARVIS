
import React, { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import { SarvisTheme } from '@/constants/sarvis-theme';

export function SarvisSlider({
  value,
  onChange,
}: {
  value: number; // 0..100
  onChange: (next: number) => void;
}) {
  const [width, setWidth] = useState(1);

  const pct = useMemo(() => Math.max(0, Math.min(100, value)), [value]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width || 1);
  }, []);

  const setFromX = useCallback(
    (x: number) => {
      const clamped = Math.max(0, Math.min(width, x));
      const next = Math.round((clamped / width) * 100);
      onChange(next);
    },
    [onChange, width]
  );

  return (
    <Pressable onLayout={onLayout} onPress={(e) => setFromX(e.nativeEvent.locationX)} style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
      <View style={[styles.thumb, { left: (pct / 100) * width - 10 }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 16,
    borderRadius: 999,
    backgroundColor: SarvisTheme.colors.primaryLight,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: SarvisTheme.colors.primary,
  },
  thumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: SarvisTheme.colors.primary,
  },
});
