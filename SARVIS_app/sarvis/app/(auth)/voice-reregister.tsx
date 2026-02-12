import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Alert, Animated, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { SarvisAppHeader } from '@/components/sarvis/sarvis-app-header';
import { biometricAPI } from '@/api/biometric';
import { authAPI } from '@/api/auth';
import { useAuth } from '@/providers/auth-provider';

const VOICE_PHRASES = ['싸비스', '싸비스', '싸비스', '싸비스'];

export default function VoiceReregisterScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const loginId = user?.login_id || '';

    const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
    const [recordedVoices, setRecordedVoices] = useState<Record<number, string>>({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [showNextButton, setShowNextButton] = useState(false);

    const waveAnimations = useRef(
        Array.from({ length: 20 }, () => new Animated.Value(0.3))
    ).current;

    const currentPhrase = VOICE_PHRASES[currentPhraseIndex];
    const isCompleted = Object.keys(recordedVoices).length === VOICE_PHRASES.length;

    useEffect(() => {
        requestPermissions();
    }, []);

    useEffect(() => {
        if (isRecording) {
            startWaveAnimation();
        } else {
            stopWaveAnimation();
        }
    }, [isRecording]);

    const requestPermissions = async () => {
        try {
            const { status } = await Audio.requestPermissionsAsync();
            setHasPermission(status === 'granted');
        } catch (error) {
            console.error('권한 요청 오류:', error);
            setHasPermission(false);
        }
    };

    const startWaveAnimation = () => {
        const animations = waveAnimations.map((anim, index) =>
            Animated.loop(
                Animated.sequence([
                    Animated.timing(anim, {
                        toValue: 0.8 + Math.random() * 0.2,
                        duration: 200 + index * 50,
                        useNativeDriver: true,
                    }),
                    Animated.timing(anim, {
                        toValue: 0.3 + Math.random() * 0.2,
                        duration: 200 + index * 50,
                        useNativeDriver: true,
                    }),
                ])
            )
        );

        animations.forEach((anim) => anim.start());
    };

    const stopWaveAnimation = () => {
        waveAnimations.forEach((anim) => {
            anim.stopAnimation();
            Animated.timing(anim, {
                toValue: 0.3,
                duration: 200,
                useNativeDriver: true,
            }).start();
        });
    };

    const startRecording = async () => {
        if (!hasPermission) {
            Alert.alert('권한 필요', '음성 녹음 권한이 필요합니다.');
            return;
        }

        try {
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            const { recording: newRecording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );

            setRecording(newRecording);
            setIsRecording(true);
        } catch (error) {
            console.error('녹음 시작 오류:', error);
            Alert.alert('오류', '녹음을 시작할 수 없습니다.');
        }
    };

    const stopRecording = async () => {
        if (!recording) return;

        try {
            setIsRecording(false);
            await recording.stopAndUnloadAsync();
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
            });

            const uri = recording.getURI();
            if (uri) {
                setIsProcessing(true);
                const base64Audio = await convertToBase64(uri);
                setTimeout(() => {
                    setRecordedVoices((prev) => ({
                        ...prev,
                        [currentPhraseIndex]: base64Audio,
                    }));
                    setIsProcessing(false);
                    setShowNextButton(true);
                }, 1000);
            }
            setRecording(null);
        } catch (error) {
            console.error('녹음 중지 오류:', error);
            Alert.alert('오류', '녹음 저장에 실패했습니다.');
            setIsProcessing(false);
        }
    };

    const convertToBase64 = async (uri: string): Promise<string> => {
        try {
            const response = await fetch(uri);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const result = reader.result as string;
                    const base64Data = result.split(',')[1];
                    resolve(`data:audio/mp4;base64,${base64Data}`);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('Base64 변환 오류:', error);
            return `data:audio/mp4;base64,dummy_${Date.now()}`;
        }
    };

    const isSubmitting = useRef(false);

    const handleComplete = async () => {
        if (isSubmitting.current) return;
        if (!loginId) {
            Alert.alert('오류', '사용자 정보를 찾을 수 없습니다.');
            return;
        }

        isSubmitting.current = true;
        setIsProcessing(true);

        try {
            console.log('🎙️ Jetson 서버로 음성 파일 전송...');
            const jetsonResponse = await biometricAPI.uploadVoice(loginId, recordedVoices);

            if (!jetsonResponse.success) {
                throw new Error(jetsonResponse.message || '음성 처리 중 오류가 발생했습니다.');
            }

            const vectorsToSave = jetsonResponse.voice_vectors || null;
            const saveResponse = await authAPI.saveVoiceVector(loginId, vectorsToSave);

            if (saveResponse.success) {
                Alert.alert('성공', '목소리 정보가 재등록되었습니다.', [
                    { text: '확인', onPress: () => router.back() }
                ]);
            } else {
                throw new Error(saveResponse.message || '음성 정보 저장에 실패했습니다.');
            }
        } catch (error: any) {
            console.error('❌ 음성 재등록 실패:', error);
            Alert.alert('오류', error.message || '음성 재등록에 실패했습니다.');
            isSubmitting.current = false;
        } finally {
            setIsProcessing(false);
        }
    };

    const nextStep = () => {
        setShowNextButton(false);
        if (currentPhraseIndex < VOICE_PHRASES.length - 1) {
            setCurrentPhraseIndex(currentPhraseIndex + 1);
            startRecording();
        }
    };

    const handleClose = () => {
        Alert.alert(
            '취소',
            '목소리 정보 재등록을 취소하시겠습니까?',
            [
                { text: '계속하기', style: 'cancel' },
                { text: '취소', onPress: () => router.back() },
            ]
        );
    };

    if (hasPermission === null) {
        return (
            <View style={styles.container}>
                <SarvisAppHeader title="" showBackButton={true} onBackPress={handleClose} />
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.permissionContainer}>
                        <ActivityIndicator size="large" color={SarvisTheme.colors.primary} />
                        <Text style={styles.permissionText}>권한 확인 중...</Text>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <SarvisAppHeader title="" showBackButton={true} onBackPress={handleClose} />
            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    <View style={styles.headerContainer}>
                        <Text style={styles.headerTitle}>목소리 정보 재등록</Text>
                    </View>

                    <View style={styles.formCard}>
                        <View style={styles.infoBox}>
                            <View style={styles.stepProgressRow}>
                                {VOICE_PHRASES.map((_, index) => (
                                    <View key={`voice-step-${index}`} style={styles.stepWrapper}>
                                        <View
                                            style={[
                                                styles.voiceStepNode,
                                                recordedVoices[index] && styles.voiceStepNodeCompleted,
                                                index === currentPhraseIndex && !recordedVoices[index] && styles.voiceStepNodeActive,
                                            ]}
                                        >
                                            {recordedVoices[index] ? (
                                                <MaterialIcons name="check" size={16} color="white" />
                                            ) : (
                                                <Text style={[
                                                    styles.voiceStepNodeText,
                                                    index === currentPhraseIndex && styles.voiceStepNodeTextActive
                                                ]}>{index + 1}</Text>
                                            )}
                                        </View>
                                        {index < VOICE_PHRASES.length - 1 && (
                                            <View style={[
                                                styles.voiceStepConnector,
                                                recordedVoices[index] && styles.voiceStepConnectorCompleted
                                            ]} />
                                        )}
                                    </View>
                                ))}
                            </View>
                        </View>

                        {!isCompleted ? (
                            <View style={styles.recordingArea}>
                                <Text style={styles.mainInstruction}>"{currentPhrase}"</Text>
                                <Text style={styles.subInstruction}>단어를 따라 읽어주세요</Text>

                                <View style={styles.waveformContainer}>
                                    {isRecording ? (
                                        waveAnimations.map((anim, index) => (
                                            <Animated.View
                                                key={index}
                                                style={[
                                                    styles.waveBar,
                                                    { transform: [{ scaleY: anim }] },
                                                ]}
                                            />
                                        ))
                                    ) : (
                                        <View style={styles.waveformPlaceholder} />
                                    )}
                                </View>

                                <View style={styles.recordButtonContainer}>
                                    {!recordedVoices[currentPhraseIndex] ? (
                                        <TouchableOpacity
                                            style={[
                                                styles.customRecordButton,
                                                isRecording ? styles.recordButtonActive : styles.recordButtonInactive,
                                                isProcessing && styles.recordButtonDisabled
                                            ]}
                                            onPress={isRecording ? stopRecording : startRecording}
                                            disabled={isProcessing}
                                        >
                                            <Text style={[
                                                styles.recordButtonText,
                                                isRecording ? styles.recordButtonTextActive : styles.recordButtonTextInactive
                                            ]}>
                                                {isRecording ? '녹음 완료' : '녹음 시작'}
                                            </Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <View style={styles.buttonRow}>
                                            <TouchableOpacity
                                                style={styles.reRecordButton}
                                                onPress={() => {
                                                    setRecordedVoices((prev) => {
                                                        const newVoices = { ...prev };
                                                        delete newVoices[currentPhraseIndex];
                                                        return newVoices;
                                                    });
                                                    setShowNextButton(false);
                                                    setTimeout(() => { startRecording(); }, 100);
                                                }}
                                            >
                                                <Text style={styles.reRecordText}>다시 녹음</Text>
                                            </TouchableOpacity>
                                            {showNextButton && (
                                                <TouchableOpacity
                                                    style={styles.nextPhraseButton}
                                                    onPress={nextStep}
                                                >
                                                    <Text style={styles.nextPhraseText}>다음 단어 녹음</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    )}
                                </View>
                            </View>
                        ) : (
                            <View style={styles.completedSection}>
                                <View style={styles.successCircle}>
                                    <Text style={styles.successIcon}>✓</Text>
                                </View>
                                <Text style={styles.completedTitle}>녹음이 완료되었습니다</Text>
                                <Text style={styles.completedText}>
                                    모든 음성 정보가 준비되었습니다.{'\n'}정보를 서버에 업데이트해주세요.
                                </Text>
                                <SarvisButton
                                    title="정보 업데이트"
                                    variant="primary"
                                    onPress={handleComplete}
                                    disabled={isProcessing}
                                    style={styles.submitButton}
                                />
                            </View>
                        )}
                    </View>
                </ScrollView>

                {isProcessing && !isRecording && (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={SarvisTheme.colors.primary} />
                        <Text style={styles.loadingText}>처리 중...</Text>
                    </View>
                )}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' },
    safeArea: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 60 },
    headerContainer: { alignItems: 'center', marginTop: 40, marginBottom: 20 },
    headerTitle: { fontSize: 24, fontWeight: '900', color: '#000000', letterSpacing: -0.5 },
    formCard: {
        width: '100%',
        padding: 24,
        backgroundColor: '#ffffff',
        borderRadius: 32,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
        elevation: 8,
        alignItems: 'center',
    },
    infoBox: { width: '100%', marginBottom: 32, alignItems: 'center' },
    stepProgressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' },
    stepWrapper: { flexDirection: 'row', alignItems: 'center' },
    voiceStepNode: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
    voiceStepNodeActive: { backgroundColor: 'white', borderColor: SarvisTheme.colors.primary },
    voiceStepNodeCompleted: { backgroundColor: SarvisTheme.colors.primary, borderColor: SarvisTheme.colors.primary },
    voiceStepNodeText: { fontSize: 14, fontWeight: '800', color: '#94a3b8' },
    voiceStepNodeTextActive: { color: SarvisTheme.colors.primary },
    voiceStepConnector: { width: 30, height: 3, backgroundColor: '#f1f5f9', marginHorizontal: 4, borderRadius: 2 },
    voiceStepConnectorCompleted: { backgroundColor: SarvisTheme.colors.primary },
    recordingArea: { width: '100%', alignItems: 'center' },
    mainInstruction: {
        fontSize: 38,
        fontWeight: '900',
        color: SarvisTheme.colors.primary,
        marginBottom: 12,
        letterSpacing: -1,
        textAlign: 'center',
    },
    subInstruction: {
        fontSize: 15,
        fontWeight: '700',
        color: SarvisTheme.colors.primary,
        backgroundColor: SarvisTheme.colors.primaryLight + '30',
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 12,
        marginBottom: 24,
        overflow: 'hidden',
    },
    waveformContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 60, gap: 4, width: '100%', marginBottom: 32 },
    waveformPlaceholder: { height: 4, width: '70%', backgroundColor: '#e2e8f0', borderRadius: 2, opacity: 0.5 },
    waveBar: { width: 4, height: 48, backgroundColor: SarvisTheme.colors.primary, borderRadius: 2 },
    recordButtonContainer: { width: '100%' },
    customRecordButton: { width: '100%', height: 64, borderRadius: 20, justifyContent: 'center', alignItems: 'center', shadowColor: SarvisTheme.colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6 },
    recordButtonInactive: { backgroundColor: SarvisTheme.colors.primary },
    recordButtonActive: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: SarvisTheme.colors.primary },
    recordButtonDisabled: { opacity: 0.6 },
    recordButtonText: { fontSize: 18, fontWeight: '800' },
    recordButtonTextInactive: { color: '#FFFFFF' },
    recordButtonTextActive: { color: SarvisTheme.colors.primary },
    buttonRow: { flexDirection: 'row', gap: 12 },
    reRecordButton: { flex: 1, height: 64, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
    reRecordText: { fontSize: 16, fontWeight: '700', color: '#64748b' },
    nextPhraseButton: { flex: 2, height: 64, borderRadius: 20, backgroundColor: SarvisTheme.colors.primary, justifyContent: 'center', alignItems: 'center' },
    nextPhraseText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
    completedSection: { alignItems: 'center', paddingVertical: 20 },
    successCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: SarvisTheme.colors.successLight, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    successIcon: { fontSize: 40, color: SarvisTheme.colors.success },
    completedTitle: { fontSize: 24, fontWeight: '900', color: SarvisTheme.colors.text, marginBottom: 12 },
    completedText: { fontSize: 15, color: '#64748b', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
    submitButton: { width: '100%', height: 64, borderRadius: 20 },
    loadingContainer: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    loadingText: { marginTop: 16, fontSize: 16, fontWeight: '700', color: SarvisTheme.colors.text },
    permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    permissionText: { fontSize: 16, color: '#64748b', textAlign: 'center', marginBottom: 24 },
});
