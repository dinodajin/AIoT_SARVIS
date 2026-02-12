
import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';

import { SarvisTheme } from '@/constants/sarvis-theme';

type Variant = 'primary' | 'success' | 'outline';

export function SarvisButton({
  title,
  onPress,
  variant = 'primary',
  disabled,
  style,
  textStyle,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: any;
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
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}>
      <View style={styles.content}>
        <Text
          style={[
            styles.text,
            variant === 'outline' ? styles.textOutline : styles.textSolid,
            textStyle,
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
    opacity: 0.92,
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
    backgroundColor: SarvisTheme.colors.primaryLight,
    borderWidth: 0,
  },
  text: {
    fontSize: 15,
    fontWeight: '800',
  },
  textSolid: {
    color: 'white',
  },
  textOutline: {
    color: SarvisTheme.colors.primary,
  },
});
