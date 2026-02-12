import React, { useState, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { useAuth } from '@/providers/auth-provider';
import { useConnectivity } from '@/providers/connectivity-provider';

export function SarvisAppHeader({
  title = 'SARVIS',
  onMenuPress,
  onBackPress,
  showBackButton = false,
  showMenuButton = true,
  showUserBadge = true,
  leftIcon,
  leftLabel
}: {
  title?: string;
  onMenuPress?: () => void;
  onBackPress?: () => void;
  showBackButton?: boolean;
  showMenuButton?: boolean;
  showUserBadge?: boolean;
  leftIcon?: keyof typeof MaterialIcons.glyphMap;
  leftLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { isConnected } = useConnectivity();
  const isLandingPage = pathname === '/' || pathname === '/index';
  const wifiConnected = isLandingPage ? true : isConnected;
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (!wifiConnected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [wifiConnected]);

  const handleMenuPress = () => {
    if (onMenuPress) {
      onMenuPress();
    } else {
      router.push({ pathname: '/modal' } as any);
    }
  };

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      router.back();
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        {showBackButton && (
          <Pressable
            onPress={handleBackPress}
            style={[styles.backBtn, leftLabel ? styles.labelBtn : null]}
          >
            {leftLabel ? (
              <Text style={styles.leftLabelText}>{leftLabel}</Text>
            ) : leftIcon ? (
              <MaterialIcons name={leftIcon} size={24} color={SarvisTheme.colors.text} />
            ) : (
              <Text style={styles.backText}>‹</Text>
            )}
          </Pressable>
        )}

        <View style={showBackButton ? styles.centerContainer : styles.leftContainer}>
          <Text style={styles.title}>{title}</Text>
        </View>

        <View style={styles.right}>
          {/* 와이파이 상태 아이콘 및 텍스트 */}
          <Animated.View style={[
            styles.wifiBadge,
            !wifiConnected && styles.wifiBadgeDisconnected,
            !wifiConnected && {
              transform: [{ scale: pulseAnim }],
              borderWidth: 2,
            }
          ]}>
            {!wifiConnected && <Text style={styles.wifiErrorTextBig}>연결 끊김</Text>}
            <MaterialIcons
              name={wifiConnected ? "wifi" : "wifi-off"}
              size={wifiConnected ? 18 : 22}
              color={wifiConnected ? SarvisTheme.colors.primary : SarvisTheme.colors.danger}
            />
          </Animated.View>

          {wifiConnected && showUserBadge && user?.nickname && (
            <View style={styles.wifiBadge}>
              <Text style={styles.badgeText}>{user.nickname}</Text>
            </View>
          )}

          {wifiConnected && (showMenuButton ?? true) && (
            <Pressable onPress={handleMenuPress} style={styles.menuBtn}>
              <MaterialIcons name="menu" size={24} color={SarvisTheme.colors.text} />
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: 'white',
  },
  header: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: SarvisTheme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: SarvisTheme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: SarvisTheme.colors.border,
  },
  backText: {
    fontSize: 24,
    fontWeight: '900',
    color: SarvisTheme.colors.text,
    lineHeight: 24,
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
    borderColor: SarvisTheme.colors.primary,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: SarvisTheme.colors.primary,
  },
  wifiBadge: {
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 14,
    backgroundColor: SarvisTheme.colors.primaryLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: SarvisTheme.colors.primary,
    gap: 6,
  },
  wifiBadgeDisconnected: {
    backgroundColor: '#ffffff',
    borderColor: SarvisTheme.colors.danger,
    borderWidth: 2,
    paddingHorizontal: 16,
    height: 48,
    shadowColor: SarvisTheme.colors.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  wifiErrorTextBig: {
    fontSize: 15,
    fontWeight: '900',
    color: SarvisTheme.colors.danger,
    marginRight: 4,
  },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: SarvisTheme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: SarvisTheme.colors.border,
  },
  labelBtn: {
    width: 'auto',
    height: 'auto',
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    marginLeft: -4,
  },
  leftLabelText: {
    fontSize: 12,
    fontWeight: '800',
    color: SarvisTheme.colors.danger,
  },
});