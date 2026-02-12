import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SarvisAppHeader } from '@/components/sarvis/sarvis-app-header';
import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisLogo } from '@/components/sarvis/sarvis-logo';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { useAuth } from '@/providers/auth-provider';
import { authAPI } from '@/api/auth';

// 입력 유효성 검사 (최소 1자 이상만 확인)
const idRegex = /^.{1,}$/;
const passwordRegex = /^.{1,}$/;

export default function LoginIdScreen() {
    const router = useRouter();
    const { signIn } = useAuth();

    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const idValid = useMemo(() => idRegex.test(loginId), [loginId]);
    const pwValid = useMemo(() => passwordRegex.test(password), [password]);

    const canSubmit = idValid && pwValid && !loading;

    const handleLogin = async () => {
        if (!canSubmit) return;

        setLoading(true);
        try {
            // 실제 API 호출
            const response = await authAPI.login(loginId, password);
            console.log('🔍 로그인 응답:', JSON.stringify(response, null, 2));

            // 서버 응답 호환성 처리 (tokens 또는 access_token 확인)
            const hasTokens = response.tokens || response.access_token;

            if (response.success && hasTokens) {
                // 1. 임시 토큰 저장 (profile 조회 등 필요시 사용)
                let accessToken = '';
                if (response.tokens) {
                    accessToken = response.tokens.access;
                } else if (response.access_token && typeof response.access_token === 'object') {
                    accessToken = response.access_token.access;
                } else if (typeof response.access_token === 'string') {
                    accessToken = response.access_token;
                }

                if (accessToken) {
                    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
                    await AsyncStorage.setItem('@sarvis_access_token', accessToken);
                }

                // 2. 프리셋 목록 직접 조회 (서버 응답에 없을 수 있음)
                let userPresets: any[] = [];
                let hasPresets = false;

                if (response.presets && response.presets.length > 0) {
                    userPresets = response.presets;
                    hasPresets = true;
                } else {
                    try {
                        console.log('🔍 프리셋 목록 별도 조회 시도...');
                        const presetRes = await import('@/api/preset').then(m => m.presetAPI.getPresets());
                        if (presetRes && presetRes.presets && presetRes.presets.length > 0) {
                            userPresets = presetRes.presets;
                            hasPresets = true;
                            console.log(`✅ 프리셋 조회 성공: ${userPresets.length}개`);
                        }
                    } catch (e) {
                        console.warn('⚠️ 프리셋 조회 실패:', e);
                    }
                }

                // 3. 프로필 정보 조회 (닉네임, 이메일 등 확실히 가져오기)
                let userData = { ...response };
                try {
                    console.log('👤 사용자 정보 조회 중...');
                    const profileRes = await authAPI.getProfile();
                    console.log('✅ 사용자 정보 조회 성공:', profileRes);

                    const userProfile = (profileRes as any).user;
                    if (userProfile) {
                        userData = {
                            ...userData,
                            nickname: userProfile.nickname,
                            email: userProfile.email,
                            user_id: userProfile.user_id,
                            uid: userProfile.uid,
                            login_id: userProfile.login_id
                        };
                    }
                } catch (e) {
                    console.warn('⚠️ 프로필 조회 실패 (로그인 시 정보 사용):', e);
                }

                await signIn({
                    ...userData,
                    nickname: userData.nickname || loginId, // 프로필 조회 실패 시에만 loginId 사용
                    presets: userPresets, // 조회한 프리셋 목록 주입
                    has_presets: hasPresets
                });

                // 4. 화면 이동 (무조건 프리셋 선택 화면으로 이동하여 기본 프리셋이라도 선택하게 함)
                console.log('👉 프리셋 선택 화면으로 이동합니다.');
                router.replace('/(auth)/preset-selection');
            } else {
                console.log('❌ 로그인 실패:', response.message);
                Alert.alert('로그인 실패', response.message || '아이디 또는 비밀번호가 일치하지 않습니다.');
            }
        } catch (error: any) {
            console.error('로그인 에러:', error);

            let errorMessage = '로그인 중 예기치 못한 오류가 발생했습니다.';

            if (error.response) {
                // 서버가 응답을 반환한 경우 (4xx, 5xx)
                const status = error.response.status;
                const data = error.response.data;

                if (status === 401 || status === 400) {
                    errorMessage = '아이디 또는 비밀번호가 올바르지 않습니다.';
                } else if (status === 500) {
                    errorMessage = '서버에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
                } else if (data && data.message) {
                    errorMessage = data.message;
                }
            } else if (error.request) {
                // 요청은 보냈으나 서버로부터 응답을 받지 못한 경우 (네트워크 오류, 타임아웃)
                errorMessage = '서버와 연결할 수 없습니다. 네트워크 상태를 확인해주세요.';
            } else {
                // 기타 에러
                errorMessage = error.message;
            }

            Alert.alert('로그인 실패', errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <SarvisAppHeader
                title=""
                showBackButton={true}
                showMenuButton={false}
                showUserBadge={false}
            />

            <SafeAreaView style={styles.safeArea}>
                <View style={styles.content}>
                    <SarvisLogo subtitle="로그인" />

                    <View style={styles.form}>
                        {!loading ? (
                            <>
                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>아이디</Text>
                                    <TextInput
                                        value={loginId}
                                        onChangeText={setLoginId}
                                        autoCapitalize="none"
                                        style={styles.input}
                                        placeholder="아이디를 입력하세요"
                                        placeholderTextColor={SarvisTheme.colors.textMuted}
                                    />
                                </View>

                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>비밀번호</Text>
                                    <TextInput
                                        value={password}
                                        onChangeText={setPassword}
                                        secureTextEntry
                                        style={styles.input}
                                        placeholder="비밀번호를 입력하세요"
                                        placeholderTextColor={SarvisTheme.colors.textMuted}
                                    />
                                </View>

                                <SarvisButton
                                    title={loading ? '로그인 중...' : '로그인'}
                                    variant="primary"
                                    disabled={!canSubmit}
                                    onPress={handleLogin}
                                />

                                <View style={styles.linksRow}>
                                    <Text
                                        style={styles.link}
                                        onPress={() => router.push({ pathname: '/(auth)/find-id' } as any)}
                                    >
                                        아이디 찾기
                                    </Text>
                                    <Text style={styles.linkDivider}>|</Text>
                                    <Text
                                        style={styles.link}
                                        onPress={() => router.push({ pathname: '/(auth)/find-password' } as any)}
                                    >
                                        비밀번호 찾기
                                    </Text>
                                </View>
                            </>
                        ) : (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={SarvisTheme.colors.primary} />
                                <Text style={styles.loadingText}>로그인 중...</Text>
                            </View>
                        )}
                    </View>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: SarvisTheme.colors.bg,
    },
    safeArea: {
        flex: 1,
    },
    content: {
        paddingHorizontal: 20,
        paddingTop: 80,
        paddingBottom: 24,
    },
    form: {
        width: '100%',
    },
    formGroup: {
        marginBottom: 18,
    },
    label: {
        fontWeight: '800',
        fontSize: 14,
        marginBottom: 8,
        color: SarvisTheme.colors.text,
    },
    input: {
        width: '100%',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: SarvisTheme.radius.md,
        borderWidth: 0,
        backgroundColor: SarvisTheme.colors.primaryLight,
        fontSize: 15,
        color: SarvisTheme.colors.text,
    },
    hintError: {
        marginTop: 6,
        fontSize: 12,
        fontWeight: '600',
        color: SarvisTheme.colors.danger,
    },
    linksRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
        marginBottom: 12,
        gap: 12,
    },
    link: {
        color: SarvisTheme.colors.primary,
        fontSize: 13,
        fontWeight: '700',
        textDecorationLine: 'underline',
    },
    linkDivider: {
        color: SarvisTheme.colors.textLight,
        fontWeight: '700',
    },
    loadingContainer: {
        alignItems: 'center',
        marginBottom: 16,
    },
    loadingText: {
        marginTop: 8,
        fontSize: 14,
        fontWeight: '600',
        color: SarvisTheme.colors.primary,
    },
});
