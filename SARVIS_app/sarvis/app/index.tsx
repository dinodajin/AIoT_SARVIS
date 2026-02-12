import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Alert, Platform, Linking, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import NetInfo from '@react-native-community/netinfo';

import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisLogo } from '@/components/sarvis/sarvis-logo';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { useAuth } from '@/providers/auth-provider';
import { API_CONFIG } from '@/constants/config';

export default function WifiConnectScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);

    const [isManuallyConfirmed, setIsManuallyConfirmed] = useState(false);

    // Initial loading delay for splash effect
    useEffect(() => {
        const timer = setTimeout(() => {
            setLoading(false);
        }, 1200);
        return () => clearTimeout(timer);
    }, []);

    const { user, isLoading: authLoading } = useAuth();

    // Check network connection and get SSID
    const [currentSsid, setCurrentSsid] = useState<string | null>(null);
    const [currentIp, setCurrentIp] = useState<string | null>(null);
    const [isWifi, setIsWifi] = useState(false);
    const [isConnected, setIsConnected] = useState(false);

    // 로봇 서버 도달 가능성 체크 (SSID 대신 사용)


    useEffect(() => {
        const checkConnection = (state: any) => {
            const connected = !!state.isConnected;
            const wifi = state.type === 'wifi';
            const ssid = (state.details as any)?.ssid || null;
            const ip = (state.details as any)?.ipAddress || null;

            setIsConnected(connected);
            setIsWifi(wifi);
            setCurrentSsid(ssid);
            setCurrentIp(ip);

            // Robot connectivity check removed as requested

        };

        const unsubscribe = NetInfo.addEventListener(checkConnection);
        NetInfo.fetch().then(checkConnection);

        const intervalId = setInterval(() => {
            // checkRobotConnectivity() removed

        }, 5000);

        return () => {
            unsubscribe();
            clearInterval(intervalId);
        };
    }, [isWifi, isConnected]);

    // 로봇 IP 대역 체크 (10.42.0.x)
    const isRobotIpRange = currentIp?.startsWith('10.42.0.');

    // 최종 검증 로직 (일반 Wi-Fi 연결 여부만 확인)
    const isSarvisWifi = isWifi && isConnected;

    // Auto-redirect if logged in AND connected to right WiFi
    useEffect(() => {
        if (!authLoading && user && isSarvisWifi) {
            console.log('[Index] Valid connection and user found. Redirecting to (tabs)...');
            const timer = setTimeout(() => {
                router.replace('/(tabs)');
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [user, authLoading, isSarvisWifi]);

    // Auto-redirect to Login if connected to right WiFi but NO user
    useEffect(() => {
        if (!authLoading && !user && isSarvisWifi) {
            console.log('[Index] SARVIS_WIFI detected, redirecting to login...');
            router.replace('/(auth)/login');
        }
    }, [user, authLoading, isSarvisWifi]);

    const handleOpenWifiSettings = async () => {
        console.log('[Index] handleOpenWifiSettings Clicked');
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
            Alert.alert(
                '안내',
                '설정 > Wi-Fi에서 SARVIS_WIFI를 찾아 연결해주세요.',
                [{ text: '확인' }]
            );
        }
    };

    const handleStart = () => {
        if (user) {
            router.replace('/(tabs)');
        } else {
            router.replace('/(auth)/login');
        }
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <SafeAreaView style={styles.safeArea}>
                    <View style={[styles.content, styles.centerContent]}>
                        <SarvisLogo subtitle="연결 준비 중" />
                        <View style={styles.loadingWrapper}>
                            <ActivityIndicator size="large" color={SarvisTheme.colors.primary} />
                            <ExtendingDotsText text="서버와 통신하는 중" />
                        </View>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <SafeAreaView style={styles.safeArea}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.logoWrapper}>
                        <SarvisLogo />
                    </View>

                    <View style={styles.formCard}>
                        <Text style={styles.title}>Wi-Fi 연결 안내</Text>

                        <View style={styles.noticeBox}>
                            <View style={styles.noticeIconWrapper}>
                                <MaterialIcons name="info" size={20} color={SarvisTheme.colors.primary} />
                            </View>
                            <Text style={styles.noticeText}>
                                <Text style={styles.noticeBold}>로봇의 전원을 먼저 켜주세요!</Text>{"\n"}
                                <Text style={styles.noticeSubText}>로봇이 켜지면 자동으로 Wi-Fi가 활성화됩니다.</Text>
                            </Text>
                        </View>

                        <View style={styles.instructionBox}>
                            <View style={styles.stepRow}>
                                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
                                <Text style={styles.stepText}>Wi-Fi 설정으로 이동합니다.</Text>
                            </View>
                            <View style={styles.stepRow}>
                                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
                                <Text style={styles.stepText}>목록에서 <Text style={styles.boldText}>"SARVIS_WIFI"</Text>를 선택하세요.</Text>
                            </View>
                            <View style={styles.stepRow}>
                                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
                                <Text style={styles.stepText}>연결이 완료되면 앱으로 돌아오세요.</Text>
                            </View>
                        </View>

                        <View style={styles.buttonStack}>
                            {isSarvisWifi ? (
                                <SarvisButton
                                    title="Wi-Fi 연결됨"
                                    variant="success"
                                    onPress={() => Alert.alert('연결 완료', 'Wi-Fi에 성공적으로 연결되었습니다.')}
                                    style={styles.mainButton}
                                />
                            ) : (
                                <SarvisButton
                                    title="Wi-Fi 설정으로 이동"
                                    variant="primary"
                                    onPress={handleOpenWifiSettings}
                                    style={styles.mainButton}
                                />
                            )}

                            {isSarvisWifi ? (
                                <SarvisButton
                                    title="SARVIS 시작하기"
                                    variant="primary"
                                    onPress={handleStart}
                                    style={styles.subButtonFixed}
                                />
                            ) : (
                                <TouchableOpacity
                                    onLongPress={() => Alert.alert('디버깅', '관리자 권한으로 강제 진입하시겠습니까?', [
                                        { text: '취소', style: 'cancel' },
                                        { text: '강제 진입', onPress: handleStart }
                                    ])}
                                    style={{ padding: 10, alignItems: 'center' }}
                                >
                                    <Text style={{ fontSize: 12, color: '#CBD5E1', fontWeight: '500' }}>
                                        연결이 안 되나요? (길게 누르기)
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {/* Debug Info */}
                    <View style={styles.debugBox}>
                        <Text style={styles.debugText}>
                            [상태] {isConnected ? '연결됨' : '끊김'} | {isWifi ? 'Wi-Fi' : '기타'}

                        </Text>
                        <Text style={styles.debugText}>
                            SSID: {currentSsid || '<unknown>'}
                        </Text>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

// 텍스트 뒤에 점이 움직이는 효과를 위한 간단한 컴포넌트
function ExtendingDotsText({ text }: { text: string }) {
    const [dots, setDots] = useState('');

    useEffect(() => {
        const interval = setInterval(() => {
            setDots(prev => (prev.length < 3 ? prev + '.' : ''));
        }, 400);
        return () => clearInterval(interval);
    }, []);

    return <Text style={styles.loadingText}>{text}{dots}</Text>;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: SarvisTheme.colors.bg,
    },
    safeArea: {
        flex: 1,
    },
    centerContent: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 1,
        padding: 24,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 60,
        paddingBottom: 60,
        alignItems: 'center',
    },
    logoWrapper: {
        alignItems: 'center',
        marginBottom: 20,
    },
    formCard: {
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: 30,
        padding: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 8,
    },
    title: {
        fontSize: 22,
        fontWeight: '900',
        color: SarvisTheme.colors.text,
        marginBottom: 20,
        textAlign: 'center',
    },
    noticeBox: {
        backgroundColor: '#FEF3C7',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        borderWidth: 1,
        borderColor: '#FDE68A',
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
        color: '#92400E',
        lineHeight: 20,
        fontWeight: '600',
    },
    noticeBold: {
        fontWeight: '800',
        color: '#78350F',
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
    buttonStack: {
        gap: 12,
        width: '100%',
    },
    mainButton: {
        height: 56,
        borderRadius: 16,
    },
    subButtonFixed: {
        height: 56,
        borderRadius: 16,
        backgroundColor: SarvisTheme.colors.primary,
    },
    debugBox: {
        marginTop: 30,
        padding: 12,
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
        width: '100%',
    },
    debugText: {
        fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        color: '#64748B',
        textAlign: 'center',
    },
    loadingWrapper: {
        marginTop: 30,
        alignItems: 'center',
    },
    loadingText: {
        fontSize: 15,
        color: SarvisTheme.colors.textLight,
        marginTop: 16,
        fontWeight: '700',
        width: 150,
        textAlign: 'center',
    },
});
