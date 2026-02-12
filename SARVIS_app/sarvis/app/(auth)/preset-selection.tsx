import React, { useState, useEffect } from 'react';
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    StatusBar,
    ActivityIndicator
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { SarvisTheme } from '@/constants/sarvis-theme';
import { useAuth } from '@/providers/auth-provider';
import { presetAPI } from '@/api/preset';
import { Preset } from '@/api/types';
import { SarvisAppHeader } from '@/components/sarvis/sarvis-app-header';

export default function PresetSelectionScreen() {
    const router = useRouter();
    const { user, selectPreset, signOut } = useAuth();
    const [presets, setPresets] = useState<Preset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isApplying, setIsApplying] = useState(false);

    const handleLogout = async () => {
        Alert.alert(
            '로그아웃',
            '로그아웃 하시겠습니까?',
            [
                { text: '취소', style: 'cancel' },
                {
                    text: '로그아웃',
                    onPress: async () => {
                        try {
                            await signOut();
                            router.replace('/(auth)/login');
                        } catch (error) {
                            console.error('Logout failed:', error);
                        }
                    }
                }
            ]
        );
    };

    useEffect(() => {
        loadPresets();
    }, []);

    const loadPresets = async () => {
        try {
            setIsLoading(true);
            const response = await presetAPI.getPresets();

            console.log('🔍 프리셋 목록 로드:', response);

            if (response && response.presets && response.presets.length > 0) {
                console.log('📦 로드된 프리셋 데이터 구조:', JSON.stringify(response.presets, null, 2));
                setPresets(response.presets);
            } else {
                setPresets([]);
            }
        } catch (error: any) {
            console.error('프리셋 로드 실패:', error);
            setPresets([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectPreset = async (preset: Preset) => {
        setIsApplying(true);
        const presetId = preset.preset_id ?? 0;

        const displayName = preset.name || (preset as any).preset_name;

        try {
            console.log(`✅ 프리셋 선택: ${displayName || '이름 없음'} (${presetId})`);

            // 서버에 선택 요청
            await presetAPI.selectPreset(presetId);

            // 로컬 상태 업데이트
            await selectPreset(preset);

            Alert.alert('프리셋 적용', `"${displayName || '이름 없음'}"으로 시작합니다.`);

            // 잠시 후 메인 화면으로 이동
            setTimeout(() => {
                router.replace('/(tabs)');
            }, 500);
        } catch (error: any) {
            console.error('프리셋 선택 호출 실패:', error);
            Alert.alert('오류', error.message || '프리셋 적용에 실패했습니다.');
        } finally {
            setIsApplying(false);
        }
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={SarvisTheme.colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <SarvisAppHeader
                title=""
                showBackButton={true}
                showMenuButton={false}
                showUserBadge={false}
                leftLabel="로그아웃"
                onBackPress={handleLogout}
            />

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <Stack.Screen options={{ headerShown: false }} />
                <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

                <View style={styles.root}>
                    <View style={styles.headerTitleContainer}>
                        <Text style={styles.headerTitleText}>반갑습니다, {user?.nickname}님!</Text>
                        <Text style={styles.headerSubtitleText}>시작할 설정을 선택해주세요</Text>
                    </View>

                    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                        {presets.length === 0 ? (
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyText}>저장된 프리셋이 없습니다.</Text>
                            </View>
                        ) : (
                            presets.map((preset, index) => (
                                <TouchableOpacity
                                    key={preset.preset_id || index}
                                    style={styles.card}
                                    onPress={() => handleSelectPreset(preset)}
                                    disabled={isApplying}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.cardHeader}>
                                        <View style={styles.cardInfo}>
                                            <Text style={styles.cardTitle}>
                                                {preset.name || (preset as any).preset_name || '이름 없음'}
                                            </Text>

                                        </View>
                                        <MaterialIcons name="chevron-right" size={24} color={SarvisTheme.colors.textMuted} />
                                    </View>

                                    {isApplying && (
                                        <View style={styles.loadingOverlay}>
                                            <ActivityIndicator size="small" color="white" />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            ))
                        )}
                    </ScrollView>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    safeArea: { flex: 1 },
    root: { flex: 1 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    headerTitleContainer: {
        paddingHorizontal: 24,
        paddingTop: 40,
        paddingBottom: 20,
        backgroundColor: '#f8f9fa',
    },
    headerTitleText: { fontSize: 22, fontWeight: '900', color: SarvisTheme.colors.text },
    headerSubtitleText: { fontSize: 13, color: SarvisTheme.colors.textMuted, fontWeight: '600', marginTop: 4 },

    content: { padding: 20, paddingBottom: 40 },

    emptyContainer: {
        alignItems: 'center',
        marginTop: 50,
    },
    emptyText: {
        color: SarvisTheme.colors.textMuted,
        fontSize: 16,
    },

    // Card styles matched exactly to presets.tsx
    card: {
        backgroundColor: 'white',
        borderRadius: SarvisTheme.radius.xl,
        padding: 24,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: SarvisTheme.colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 3,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    cardIconBox: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: SarvisTheme.colors.primaryLight,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    cardInfo: { flex: 1 },
    cardTitle: { fontSize: 17, fontWeight: '800', color: SarvisTheme.colors.text, marginBottom: 2 },
    cardSubtitle: { fontSize: 12, color: SarvisTheme.colors.textMuted, fontWeight: '500' },

    statsContainer: {
        flexDirection: 'row',
        backgroundColor: SarvisTheme.colors.bg,
        borderRadius: 16,
        paddingVertical: 14,
        alignItems: 'center',
    },
    statItem: { flex: 1, alignItems: 'center' },
    statVal: { fontSize: 15, fontWeight: '900', color: SarvisTheme.colors.primary, marginBottom: 2 },
    statLabel: { fontSize: 11, color: SarvisTheme.colors.textMuted, fontWeight: '700', textTransform: 'uppercase' },
    statDivider: { width: 1, height: 20, backgroundColor: SarvisTheme.colors.border },

    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: SarvisTheme.radius.xl,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
