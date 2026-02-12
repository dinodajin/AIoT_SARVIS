import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authAPI } from '@/api/auth';
import { SarvisAppHeader } from '@/components/sarvis/sarvis-app-header';
import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisLogo } from '@/components/sarvis/sarvis-logo';
import { SarvisTheme } from '@/constants/sarvis-theme';

type Step = 'input' | 'verify' | 'reset' | 'complete';

export default function FindPasswordScreen() {
    const router = useRouter();
    const [loginId, setLoginId] = useState('');
    const [email, setEmail] = useState('');
    const [step, setStep] = useState<Step>('input');
    const [verificationCode, setVerificationCode] = useState('');
    const [resetToken, setResetToken] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const inputValid = loginId.length >= 5 && /.+@.+\..+/.test(email);
    const codeValid = verificationCode.length === 6;
    // 6자리 숫자 PIN
    const passwordValid = /^\d{6}$/.test(newPassword) && newPassword === confirmPassword;

    const handleSendCode = async () => {
        if (!inputValid) return;

        setLoading(true);
        try {
            const response = await authAPI.requestPasswordReset(loginId, email);

            if (response.success) {
                setStep('verify');
                Alert.alert('인증번호 발송', '입력하신 이메일로 인증번호를 전송했습니다.');
            } else {
                Alert.alert('오류', response.message || '아이디 또는 이메일이 일치하지 않습니다.');
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
            const response = await authAPI.verifyPasswordResetCode(loginId, email, verificationCode);

            if (response.success && response.reset_token) {
                setResetToken(response.reset_token);
                setStep('reset');
            } else {
                Alert.alert('오류', response.message || '인증번호가 올바르지 않습니다.');
            }
        } catch (error: any) {
            Alert.alert('오류', error?.message || '인증에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!passwordValid) return;

        setLoading(true);
        try {
            const response = await authAPI.setNewPassword(resetToken, newPassword);

            if (response.success) {
                setStep('complete');
            } else {
                Alert.alert('오류', response.message || '비밀번호 재설정에 실패했습니다.');
            }
        } catch (error: any) {
            Alert.alert('오류', error?.message || '비밀번호 재설정에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleBackToLogin = () => {
        router.replace({ pathname: '/(auth)/login-id' } as any);
    };

    // Step 1: 아이디/이메일 입력
    if (step === 'input') {
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
                        <SarvisLogo subtitle="비밀번호 찾기" />

                        <View style={styles.card}>
                            <Text style={styles.title}>아이디와 이메일을 입력하세요</Text>
                            <Text style={styles.desc}>가입 시 등록한 정보를 입력해주세요.</Text>

                            <TextInput
                                value={loginId}
                                onChangeText={setLoginId}
                                autoCapitalize="none"
                                style={styles.input}
                                placeholder="아이디"
                                placeholderTextColor={SarvisTheme.colors.textMuted}
                                editable={!loading}
                            />

                            <TextInput
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                style={styles.input}
                                placeholder="이메일"
                                placeholderTextColor={SarvisTheme.colors.textMuted}
                                editable={!loading}
                            />

                            <SarvisButton
                                title={loading ? '전송 중...' : '인증번호 발송'}
                                variant="primary"
                                disabled={!inputValid || loading}
                                onPress={handleSendCode}
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
                    onBackPress={() => setStep('input')}
                />
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.content}>
                        <SarvisLogo subtitle="비밀번호 찾기" />

                        <View style={styles.card}>
                            <Text style={styles.title}>인증번호를 입력하세요</Text>
                            <Text style={styles.desc}>이메일로 발송된 6자리 인증번호를 입력하세요.</Text>

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

    // Step 3: 새 비밀번호 설정
    if (step === 'reset') {
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
                        <SarvisLogo subtitle="비밀번호 재설정" />

                        <View style={styles.card}>
                            <Text style={styles.title}>새 비밀번호를 설정하세요</Text>
                            <Text style={styles.desc}>6자리 숫자 PIN을 입력해주세요.</Text>

                            <TextInput
                                value={newPassword}
                                onChangeText={(text) => {
                                    const numOnly = text.replace(/[^0-9]/g, '').slice(0, 6);
                                    setNewPassword(numOnly);
                                }}
                                secureTextEntry
                                keyboardType="number-pad"
                                maxLength={6}
                                style={styles.input}
                                placeholder="새 비밀번호 (6자리 숫자)"
                                placeholderTextColor={SarvisTheme.colors.textMuted}
                                editable={!loading}
                            />

                            <TextInput
                                value={confirmPassword}
                                onChangeText={(text) => {
                                    const numOnly = text.replace(/[^0-9]/g, '').slice(0, 6);
                                    setConfirmPassword(numOnly);
                                }}
                                secureTextEntry
                                keyboardType="number-pad"
                                maxLength={6}
                                style={styles.input}
                                placeholder="비밀번호 확인"
                                placeholderTextColor={SarvisTheme.colors.textMuted}
                                editable={!loading}
                            />

                            {newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword && (
                                <Text style={styles.errorText}>비밀번호가 일치하지 않습니다.</Text>
                            )}

                            <SarvisButton
                                title={loading ? '설정 중...' : '비밀번호 재설정'}
                                variant="primary"
                                disabled={!passwordValid || loading}
                                onPress={handleResetPassword}
                            />
                        </View>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    // Step 4: 완료
    return (
        <View style={styles.container}>
            <SarvisAppHeader
                title=""
                showBackButton={false}
                showMenuButton={false}
                showUserBadge={false}
            />
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.content}>
                    <SarvisLogo subtitle="비밀번호 재설정" />

                    <View style={styles.card}>
                        <View style={styles.resultContainer}>
                            <Text style={styles.resultTitle}>비밀번호 재설정 완료</Text>
                            <Text style={styles.resultLabel}>
                                새로운 비밀번호로 로그인해주세요.
                            </Text>
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
    errorText: {
        fontSize: 12,
        color: SarvisTheme.colors.danger,
        marginBottom: 14,
        fontWeight: '600',
    },
    resultContainer: {
        alignItems: 'center',
        paddingVertical: 20,
        marginBottom: 20,
    },
    resultTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: SarvisTheme.colors.success,
        marginBottom: 12,
    },
    resultLabel: {
        fontSize: 14,
        color: SarvisTheme.colors.text,
        textAlign: 'center',
    },
});