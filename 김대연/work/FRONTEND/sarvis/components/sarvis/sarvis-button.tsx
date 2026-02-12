
import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { SarvisTheme } from '@/constants/sarvis-theme';

type Variant = 'primary' | 'success' | 'outline' | 'secondary' | 'danger';

export function SarvisButton({
  title,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : null,
        variant === 'success' ? styles.success : null,
        variant === 'outline' ? styles.outline : null,
        variant === 'secondary' ? styles.secondary : null,
        variant === 'danger' ? styles.danger : null,
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}>
      <View style={styles.content}>
        <Text
          style={[
            styles.text,
            variant === 'outline' ? styles.textOutline : styles.textSolid,
          ]}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: SarvisTheme.radius.lg,
    marginBottom: 12,
    borderWidth: 0,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ translateY: 1 }],
  },
  disabled: {
    opacity: 0.5,
  },
  primary: {
    backgroundColor: SarvisTheme.colors.primary,
  },
  success: {
    backgroundColor: SarvisTheme.colors.success,
  },
  outline: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: SarvisTheme.colors.border,
  },
  secondary: {
    backgroundColor: '#FF9800',
  },
  danger: {
    backgroundColor: '#FF5722',
  },
  text: {
    fontSize: 15,
    fontWeight: '700',
  },
  textSolid: {
    color: 'white',
  },
  textOutline: {
    color: SarvisTheme.colors.text,
  },
});
