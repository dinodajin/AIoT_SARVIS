import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authAPI } from '@/api/auth';
import { SarvisAppHeader } from '@/components/sarvis/sarvis-app-header';
import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisLogo } from '@/components/sarvis/sarvis-logo';
import { SarvisTheme } from '@/constants/sarvis-theme';

type Step = 'email' | 'verify' | 'result';

export default function FindIdScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [step, setStep] = useState<Step>('email');
    const [verificationCode, setVerificationCode] = useState('');
    const [foundId, setFoundId] = useState('');
    const [loading, setLoading] = useState(false);

    const emailValid = /.+@.+\..+/.test(email);
    const codeValid = verificationCode.length === 6;

    const handleSendEmail = async () => {
        if (!emailValid) return;

        setLoading(true);
        try {
            // 이메일로 인증코드 발송 API
            const response = await authAPI.sendEmailCode(email);

            if (response.success) {
                setStep('verify');
                Alert.alert('인증번호 발송', '입력하신 이메일로 인증번호를 전송했습니다.');
            } else {
                Alert.alert('오류', response.message || '가입되지 않은 이메일입니다.');
            }
        } catch (error: any) {
            Alert.alert('오류', error?.message || '인증번호 발송에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        if (!codeValid) return;

        setLoading(true);
        try {
            // 인증코드 확인 및 아이디 찾기 API
            const response = await authAPI.findId(email, verificationCode);

            if (response.success && response.login_id) {
                setFoundId(response.login_id);
                setStep('result');
            } else {
                Alert.alert('오류', response.message || '인증번호가 올바르지 않습니다.');
            }
        } catch (error: any) {
            Alert.alert('오류', error?.message || '인증에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleBackToLogin = () => {
        router.replace({ pathname: '/(auth)/login-id' } as any);
    };

    // Step 1: 이메일 입력
    if (step === 'email') {
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
                        <SarvisLogo subtitle="아이디 찾기" />

                        <View style={styles.card}>
                            <Text style={styles.title}>가입한 이메일을 입력하세요</Text>
                            <Text style={styles.desc}>
                                입력한 이메일로 인증번호를 전송합니다.
                            </Text>

                            <TextInput
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                style={styles.input}
                                placeholder="example@email.com"
                                placeholderTextColor={SarvisTheme.colors.textMuted}
                                editable={!loading}
                            />

                            <SarvisButton
                                title={loading ? '전송 중...' : '인증번호 발송'}
                                variant="primary"
                                disabled={!emailValid || loading}
                                onPress={handleSendEmail}
                            />
                        </View>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    // Step 2: 인증번호 입력
    if (step === 'verify') {
        return (
            <View style={styles.container}>
                <SarvisAppHeader
                    title=""
                    showBackButton={true}
                    showMenuButton={false}
                    showUserBadge={false}
                    onBackPress={() => setStep('email')}
                />
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.content}>
                        <SarvisLogo subtitle="아이디 찾기" />

                        <View style={styles.card}>
                            <Text style={styles.title}>인증번호를 입력하세요</Text>
                            <Text style={styles.desc}>
                                이메일로 발송된 6자리 인증번호를 입력하세요.
                            </Text>

                            <TextInput
                                value={verificationCode}
                                onChangeText={(text) => {
                                    const numOnly = text.replace(/[^0-9]/g, '').slice(0, 6);
                                    setVerificationCode(numOnly);
                                }}
                                keyboardType="number-pad"
                                maxLength={6}
                                style={styles.input}
                                placeholder="인증번호를 입력하세요"
                                placeholderTextColor={SarvisTheme.colors.textMuted}
                                editable={!loading}
                            />

                            <SarvisButton
                                title={loading ? '확인 중...' : '인증 확인'}
                                variant="primary"
                                disabled={!codeValid || loading}
                                onPress={handleVerifyCode}
                            />
                        </View>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    // Step 3: 결과 표시
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
                    <SarvisLogo subtitle="아이디 찾기" />

                    <View style={styles.card}>
                        <View style={styles.resultContainer}>
                            <Text style={styles.resultTitle}>아이디 찾기 완료</Text>
                            <Text style={styles.resultLabel}>회원님의 아이디는</Text>
                            <Text style={styles.resultId}>{foundId}</Text>
                            <Text style={styles.resultLabel}>입니다</Text>
                        </View>

                        <SarvisButton
                            title="로그인하기"
                            variant="primary"
                            onPress={handleBackToLogin}
                        />
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
    },
    card: {
        width: '100%',
        backgroundColor: 'white',
        borderRadius: SarvisTheme.radius.lg,
        borderWidth: 1,
        borderColor: SarvisTheme.colors.border,
        padding: 18,
    },
    title: {
        fontSize: 16,
        fontWeight: '900',
        color: SarvisTheme.colors.text,
        marginBottom: 6,
    },
    desc: {
        fontSize: 13,
        fontWeight: '600',
        color: SarvisTheme.colors.textLight,
        marginBottom: 12,
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
        marginBottom: 14,
    },
    resultContainer: {
        alignItems: 'center',
        paddingVertical: 20,
        marginBottom: 20,
    },
    resultTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: SarvisTheme.colors.text,
        marginBottom: 20,
    },
    resultLabel: {
        fontSize: 16,
        color: SarvisTheme.colors.text,
        marginBottom: 8,
    },
    resultId: {
        fontSize: 24,
        fontWeight: 'bold',
        color: SarvisTheme.colors.primary,
        marginVertical: 10,
        padding: 15,
        backgroundColor: SarvisTheme.colors.primaryLight,
        borderRadius: SarvisTheme.radius.md,
        textAlign: 'center',
        overflow: 'hidden',
    },
});