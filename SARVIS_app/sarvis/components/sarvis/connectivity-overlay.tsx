import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Platform, Linking, Animated, ActivityIndicator } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSegments } from 'expo-router';
import { useConnectivity } from '@/providers/connectivity-provider';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisLogo } from '@/components/sarvis/sarvis-logo';

export function ConnectivityOverlay() {
    const { isConnected, isWifi, ssid } = useConnectivity();
    const segments = useSegments();
    const [overlayVisible, setOverlayVisible] = useState(false);
    const [fadeAnim] = useState(new Animated.Value(0));

    // 일반 Wi-Fi 연결 여부만 확인
    const isValidConnection = isConnected && isWifi;

    // segments를 이용해 정확한 경로 파악
    // app/index.tsx (초기 화면)은 segments가 [] 이거나 ['index'] 만 포함됨
    const isLandingPage = segments.length <= 1 && (segments[0] === undefined || (segments[0] as string) === 'index');

    useEffect(() => {
        if (!isValidConnection && !isLandingPage) {
            setOverlayVisible(true);
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            }).start(() => {
                setOverlayVisible(false);
            });
        }
    }, [isValidConnection, isLandingPage]);

    const handleOpenWifiSettings = async () => {
        try {
            if (Platform.OS === 'android') {
                await Linking.sendIntent('android.settings.WIFI_SETTINGS');
            } else {
                const wifiSettingsUrl = 'App-Prefs:WIFI';
                const canOpen = await Linking.canOpenURL(wifiSettingsUrl);
                if (canOpen) {
                    await Linking.openURL(wifiSettingsUrl);
                } else {
                    await Linking.openURL('app-settings:');
                }
            }
        } catch (error) {
            console.error('와이파이 설정 이동 실패:', error);
        }
    };

    if (!overlayVisible || isLandingPage) return null;

    return (
        <Animated.View
            style={[
                styles.overlay,
                { opacity: fadeAnim }
            ]}
            pointerEvents={isConnected ? 'none' : 'auto'}
        >
            <View style={styles.blurFallback} />

            <View style={styles.overlayContent}>
                <View style={styles.warningIconCircle}>
                    <MaterialIcons name="wifi-off" size={40} color={SarvisTheme.colors.danger} />
                </View>
                <ActivityIndicator size="small" color={SarvisTheme.colors.danger} style={{ marginBottom: 8 }} />
                <Text style={styles.reconnectingText}>
                    {!isConnected ? '네트워크가 끊겼습니다' : 'Wi-Fi를 켜주세요'}
                </Text>
                <Text style={styles.reconnectingSubText}>
                    로봇 제어를 위해 전용 Wi-Fi 연결이 필수입니다.
                </Text>

                <SarvisButton
                    title="Wi-Fi 설정으로 이동"
                    variant="outline"
                    onPress={handleOpenWifiSettings}
                    style={styles.wifiButton}
                    textStyle={{ color: SarvisTheme.colors.danger }}
                />
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 9999,
    },
    blurFallback: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
    },
    overlayContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    reconnectingText: {
        fontSize: 18,
        fontWeight: '900',
        color: SarvisTheme.colors.danger,
        textAlign: 'center',
    },
    reconnectingSubText: {
        fontSize: 14,
        color: SarvisTheme.colors.textMuted,
        textAlign: 'center',
        marginBottom: 20,
    },
    warningIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#FFF1F2',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    wifiButton: {
        width: 200,
        borderColor: SarvisTheme.colors.danger,
        borderWidth: 1.5,
    },
    cardContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    formCard: {
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: 30,
        padding: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 25,
        elevation: 10,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    logoWrapper: {
        alignItems: 'center',
        marginBottom: 10,
        transform: [{ scale: 0.8 }],
    },
    title: {
        fontSize: 22,
        fontWeight: '900',
        color: SarvisTheme.colors.text,
        marginBottom: 20,
        textAlign: 'center',
    },
    noticeBox: {
        backgroundColor: '#FFF1F2',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        borderWidth: 1,
        borderColor: '#FFE4E6',
    },
    noticeIconWrapper: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    noticeText: {
        flex: 1,
        fontSize: 13,
        color: SarvisTheme.colors.danger,
        lineHeight: 20,
        fontWeight: '600',
    },
    noticeBold: {
        fontWeight: '800',
        color: '#991B1B',
    },
    noticeSubText: {
        fontSize: 11,
        fontWeight: '500',
    },
    instructionBox: {
        backgroundColor: '#F8FAFC',
        borderRadius: 20,
        padding: 20,
        marginBottom: 24,
        gap: 14,
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    stepNumber: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#E2E8F0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    stepNumberText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#64748B',
    },
    stepText: {
        flex: 1,
        fontSize: 14,
        color: SarvisTheme.colors.text,
        fontWeight: '600',
    },
    boldText: {
        fontWeight: '900',
        color: SarvisTheme.colors.primary,
    },
    mainButton: {
        height: 56,
        borderRadius: 16,
    },
});
