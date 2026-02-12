import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    Animated,
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { Ionicons } from '@expo/vector-icons';
import { biometricAPI } from '@/api/biometric';
import { authAPI } from '@/api/auth';

const { width } = Dimensions.get('window');

type CaptureDirection = 'front' | 'left' | 'right' | 'top' | 'bottom';

const DIRECTION_LABELS: Record<CaptureDirection, string> = {
    front: '정면',
    left: '왼쪽',
    right: '오른쪽',
    top: '위쪽',
    bottom: '아래쪽',
};

const DIRECTION_GUIDES: Record<CaptureDirection, string> = {
    front: '정면을 바라보세요',
    left: '고개를 왼쪽으로 돌려주세요',
    right: '고개를 오른쪽으로 돌려주세요',
    top: '고개를 위로 들어주세요',
    bottom: '고개를 아래로 내려주세요',
};

export default function FaceCaptureScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ uid?: string; loginId?: string; nickname?: string }>();
    const [permission, requestPermission] = useCameraPermissions();
    const [currentDirection, setCurrentDirection] = useState<CaptureDirection>('front');
    const [capturedImages, setCapturedImages] = useState<Record<CaptureDirection, string>>({} as Record<CaptureDirection, string>);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [faceUploadComplete, setFaceUploadComplete] = useState(false);

    const cameraRef = useRef<CameraView>(null);
    const progressAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const directions: CaptureDirection[] = ['front', 'left', 'right', 'top', 'bottom'];
    const currentIndex = directions.indexOf(currentDirection);
    const progress = ((currentIndex + (capturedImages[currentDirection] ? 1 : 0)) / directions.length) * 100;

    useEffect(() => {
        if (!permission) {
            requestPermission();
        }
    }, [permission, requestPermission]);

    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: progress,
            duration: 300,
            useNativeDriver: false,
        }).start();
    }, [progress, progressAnim]);

    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.03,
                    duration: 1200,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1200,
                    useNativeDriver: true,
                }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, [pulseAnim]);

    const captureImage = async () => {
        if (!cameraRef.current || isProcessing) return;

        setIsProcessing(true);

        try {
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.8,
                base64: false,
            });

            if (photo?.uri) {
                const newCapturedImages = {
                    ...capturedImages,
                    [currentDirection]: photo.uri,
                };

                setCapturedImages(newCapturedImages);

                if (currentIndex < directions.length - 1) {
                    setTimeout(() => {
                        setCurrentDirection(directions[currentIndex + 1]);
                        setIsProcessing(false);
                    }, 500);
                } else {
                    setIsProcessing(false);
                }
            }
        } catch (error) {
            console.error('카메라 촬영 오류:', error);
            Alert.alert('오류', '사진 촬영에 실패했습니다. 다시 시도해주세요.');
            setIsProcessing(false);
        }
    };

    // 음성 등록 화면으로 이동하는 헬퍼 함수
    const navigateToVoiceRegister = () => {
        router.push({
            pathname: '/(auth)/voice-register',
            params: {
                uid: params.uid || '',
                loginId: params.loginId || '',
                nickname: params.nickname || ''
            }
        } as any);
    };

    // 처음부터 다시 촬영하도록 초기화하는 함수
    const handleRestart = () => {
        setCapturedImages({} as Record<CaptureDirection, string>);
        setCurrentDirection('front');
        setFaceUploadComplete(false);
    };

    const handleComplete = async () => {
        if (Object.keys(capturedImages).length !== 5) {
            Alert.alert('오류', '모든 방향의 사진을 촬영해주세요.');
            return;
        }

        setIsUploading(true);
        try {
            const loginId = params.loginId as string;

            // 1. Jetson 서버로 이미지 전송 -> 얼굴 벡터 추출
            console.log('📤 Jetson 서버로 얼굴 이미지 전송 시작...');
            const uploadResponse = await biometricAPI.uploadFaceImages(loginId, capturedImages);

            console.log('📤 Jetson 서버 응답:', uploadResponse);

            // 업로드 성공 여부 확인
            if (!uploadResponse.success) {
                throw new Error(uploadResponse.message || '얼굴 이미지 업로드에 실패했습니다.');
            }

            // face_vectors가 없으면 임시 저장 상태 -> Alert으로 안내 후 음성 등록으로 이동
            if (!uploadResponse.face_vectors) {
                console.log('⚠️ 얼굴 벡터가 즉시 반환되지 않음 (임시 저장 상태)');
                setIsUploading(false);

                Alert.alert(
                    '얼굴 이미지 저장이 완료',
                    '음성 등록을 진행해주세요.',
                    [
                        {
                            text: '사진 재촬영',
                            onPress: handleRestart,
                        },
                        {
                            text: '음성등록 으로 넘어가기',
                            onPress: navigateToVoiceRegister,
                        },
                    ]
                );
                return;
            }

            console.log('✅ 얼굴 벡터 추출 성공');

            // 2. EC2 서버로 벡터 전송 -> 저장
            console.log('📤 EC2 서버로 얼굴 벡터 전송 시작...');
            const saveResponse = await authAPI.saveFaceVector(loginId, uploadResponse.face_vectors);

            if (!saveResponse.success) {
                console.log('⚠️ EC2 저장 실패, 하지만 음성 등록으로 이동 가능');
                setFaceUploadComplete(true);
                setIsUploading(false);

                Alert.alert(
                    '알림',
                    saveResponse.message || '얼굴 정보 저장 중 문제가 발생했습니다.',
                    [
                        {
                            text: '사진 재촬영',
                            onPress: handleRestart,
                        },
                        {
                            text: '취소',
                            onPress: () => router.back(),
                        },
                    ]
                );
                return;
            }

            console.log('✅ 얼굴 등록 완료');
            setIsUploading(false);

            // 얼굴 등록 성공 -> 알림 후 바로 음성 등록 이동
            Alert.alert(
                '얼굴 이미지 저장이 완료 되었습니다.',
                '음성 등록을 진행해주세요.',
                [
                    {
                        text: '사진 재촬영',
                        onPress: handleRestart,
                    },
                    {
                        text: '음성등록 으로 넘어가기',
                        onPress: navigateToVoiceRegister,
                    },
                ]
            );
        } catch (error: any) {
            console.error('❌ 얼굴 등록 오류:', error);
            setIsUploading(false);

            let errorMessage = error?.message || '얼굴 등록에 실패했습니다.';

            // 네트워크 오류 메시지 사용자 친화적으로 변경
            if (errorMessage.includes('Network request failed')) {
                errorMessage = '인터넷 연결이나 서버 상태를 확인해주세요.';
            }

            // 에러 발생 시에도 다시 시도하거나 음성 등록으로 이동할 수 있는 옵션 제공
            Alert.alert(
                '오류',
                errorMessage,
                [
                    {
                        text: '사진 재촬영',
                        onPress: handleRestart,
                    },
                ]
            );
        } finally {
            setIsUploading(false);
        }
    };

    const handleClose = () => {
        Alert.alert(
            '얼굴 등록 취소',
            '진행 중인 얼굴 등록을 취소하시겠습니까?',
            [
                { text: '계속하기', style: 'cancel' },
                { text: '취소', onPress: () => router.back() },
            ]
        );
    };

    if (!permission) {
        return (
            <View style={styles.container}>
                <View style={styles.permissionContainer}>
                    <ActivityIndicator size="large" color={SarvisTheme.colors.primary} />
                    <Text style={styles.permissionText}>카메라 권한 확인 중...</Text>
                </View>
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.permissionContainer}>
                    <Ionicons name="camera-outline" size={64} color={SarvisTheme.colors.primary} />
                    <Text style={styles.permissionText}>얼굴 등록을 위해 카메라 권한이 필요합니다</Text>
                    <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                        <Text style={styles.permissionButtonText}>권한 요청하기</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    const isCaptured = !!capturedImages[currentDirection];
    const allCaptured = Object.keys(capturedImages).length === 5;

    return (
        <SafeAreaView style={styles.container}>
            {/* Top Navigation */}
            <View style={styles.topBar}>
                <TouchableOpacity onPress={handleClose} style={styles.closeAction}>
                    <Ionicons name="close" size={28} color={SarvisTheme.colors.text} />
                </TouchableOpacity>
                <View style={styles.progressCounter}>
                    <Text style={styles.counterText}>{currentIndex + 1} / {directions.length}</Text>
                </View>
                <View style={{ width: 44 }} />
            </View>

            {/* Step Progress Bar */}
            <View style={styles.stepProgress}>
                <View style={styles.stepItem}>
                    <View style={[styles.stepDot, styles.inactiveStep]} />
                    <Text style={styles.stepText}>Step 1</Text>
                    <Text style={styles.stepText}>정보입력</Text>
                </View>
                <View style={styles.stepConnector} />
                <View style={styles.stepItem}>
                    <View style={[styles.stepDot, styles.activeStep]} />
                    <Text style={[styles.stepText, styles.activeText]}>Step 2</Text>
                    <Text style={[styles.stepText, styles.activeText]}>얼굴등록</Text>
                </View>
                <View style={styles.stepConnector} />
                <View style={styles.stepItem}>
                    <View style={[styles.stepDot, styles.inactiveStep]} />
                    <Text style={styles.stepText}>Step 3</Text>
                    <Text style={styles.stepText}>음성등록</Text>
                </View>
            </View>

            {/* Main Content Area */}
            <View style={styles.mainArea}>
                {/* Instruction Header */}
                <View style={styles.instructionContainer}>
                    <Text style={styles.mainInstruction}>{DIRECTION_GUIDES[currentDirection]}</Text>
                    <Text style={styles.subInstruction}>
                        {DIRECTION_LABELS[currentDirection]} 방향 촬영 중
                    </Text>
                </View>

                {/* Camera Visual Focus */}
                <View style={styles.visualContainer}>
                    <Animated.View
                        style={[
                            styles.cameraFrame,
                            { transform: [{ scale: pulseAnim }] }
                        ]}
                    >
                        <View style={styles.cameraInnerFrame}>
                            <CameraView
                                ref={cameraRef}
                                style={styles.cameraView}
                                facing="front"
                                animateShutter={false}
                            />

                            {/* Scan Overlay Effect */}
                            <View style={styles.scanOverlay} />

                            {/* Capture Confirmation */}
                            {isCaptured && (
                                <Animated.View style={styles.successOverlay}>
                                    <Ionicons name="checkmark-circle" size={80} color="white" />
                                </Animated.View>
                            )}
                        </View>

                        {/* Glowing Ring */}
                        <View style={[
                            styles.glowRing,
                            isCaptured && styles.glowRingSuccess
                        ]} />
                    </Animated.View>

                </View>
            </View>

            {/* Bottom Control Area */}
            <View style={styles.bottomBar}>
                <View style={styles.controlWrapper}>
                    {/* Step Progress Indicators (Dots) */}
                    <View style={styles.indicators}>
                        {directions.map((dir, idx) => (
                            <View
                                key={dir}
                                style={[
                                    styles.indicatorDot,
                                    idx < currentIndex && styles.dotCompleted,
                                    idx === currentIndex && styles.dotActive,
                                    capturedImages[dir] && styles.dotCompleted,
                                ]}
                            />
                        ))}
                    </View>

                    {isUploading ? (
                        <View style={styles.loadingWrapper}>
                            <ActivityIndicator size="large" color={SarvisTheme.colors.primary} />
                            <Text style={styles.hintText}>얼굴 등록 중...</Text>
                        </View>
                    ) : faceUploadComplete ? (
                        // 업로드 완료 후 음성 등록으로 이동 버튼 표시
                        <TouchableOpacity
                            style={styles.nextActionButton}
                            onPress={navigateToVoiceRegister}
                        >
                            <Text style={styles.nextActionText}>음성 등록으로 이동</Text>
                            <Ionicons name="arrow-forward" size={20} color="white" />
                        </TouchableOpacity>
                    ) : allCaptured ? (
                        <TouchableOpacity
                            style={styles.nextActionButton}
                            onPress={handleComplete}
                        >
                            <Text style={styles.nextActionText}>등록 완료</Text>
                            <Ionicons name="arrow-forward" size={20} color="white" />
                        </TouchableOpacity>
                    ) : !isCaptured ? (
                        <TouchableOpacity
                            style={[styles.shutterButton, isProcessing && styles.shutterDisabled]}
                            onPress={captureImage}
                            disabled={isProcessing}
                        >
                            {isProcessing ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <View style={styles.shutterInner} />
                            )}
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={styles.nextActionButton}
                            onPress={() => {
                                if (currentIndex < directions.length - 1) {
                                    setCurrentDirection(directions[currentIndex + 1]);
                                }
                            }}
                        >
                            <Text style={styles.nextActionText}>다음 방향 촬영</Text>
                            <Ionicons name="arrow-forward" size={20} color="white" />
                        </TouchableOpacity>
                    )}

                    <Text style={styles.hintText}>
                        {faceUploadComplete
                            ? '얼굴 이미지 업로드 완료!'
                            : allCaptured
                                ? '모든 방향 촬영 완료!'
                                : isCaptured
                                    ? '잘 찍혔습니다!'
                                    : '가이드원 안에 얼굴을 맞춰주세요'}
                    </Text>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    stepProgress: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
        marginBottom: 8,
    },
    stepItem: {
        alignItems: 'center',
        gap: 4,
    },
    stepDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#E2E8F0',
        marginBottom: 4,
    },
    activeStep: {
        backgroundColor: SarvisTheme.colors.primary,
    },
    inactiveStep: {
        backgroundColor: '#E2E8F0',
    },
    stepText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#94A3B8',
        textAlign: 'center',
    },
    activeText: {
        color: SarvisTheme.colors.primary,
    },
    stepConnector: {
        width: 30,
        height: 2,
        backgroundColor: '#E2E8F0',
        marginHorizontal: 4,
        marginTop: -20, // Align with dots
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        height: 60,
    },
    closeAction: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    progressCounter: {
        backgroundColor: SarvisTheme.colors.primaryLight,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 20,
    },
    counterText: {
        fontSize: 14,
        fontWeight: '800',
        color: SarvisTheme.colors.primary,
    },
    mainArea: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 10,
    },
    instructionContainer: {
        alignItems: 'center',
        marginBottom: 15,
        paddingHorizontal: 40,
    },
    mainInstruction: {
        fontSize: 24,
        fontWeight: '900',
        color: SarvisTheme.colors.text,
        textAlign: 'center',
        marginBottom: 8,
    },
    subInstruction: {
        fontSize: 15,
        fontWeight: '600',
        color: SarvisTheme.colors.textMuted,
        backgroundColor: '#F8FAFC',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 8,
        overflow: 'hidden',
    },
    visualContainer: {
        alignItems: 'center',
        width: '100%',
    },
    cameraFrame: {
        width: width * 0.75,
        height: width * 0.75,
        maxWidth: 320,
        maxHeight: 320,
        borderRadius: (width * 0.75) / 2,
        padding: 12,
        backgroundColor: '#FFFFFF',
        shadowColor: SarvisTheme.colors.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
        marginBottom: 20,
    },
    cameraInnerFrame: {
        flex: 1,
        borderRadius: 1000,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#000',
    },
    cameraView: {
        flex: 1,
    },
    scanOverlay: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 2,
        borderColor: 'rgba(10, 87, 255, 0.2)',
        borderRadius: 1000,
    },
    successOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(10, 87, 255, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    glowRing: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 3,
        borderColor: SarvisTheme.colors.primary,
        borderRadius: 1000,
        opacity: 0.8,
    },
    glowRingSuccess: {
        borderColor: SarvisTheme.colors.primary,
        opacity: 0.3,
    },
    indicators: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 15, // 상단과의 간격 추가
        marginBottom: 5, // 버튼과의 간격 소폭 조정
    },
    indicatorDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#E2E8F0',
    },
    dotActive: {
        backgroundColor: SarvisTheme.colors.primary,
        width: 24,
    },
    dotCompleted: {
        backgroundColor: SarvisTheme.colors.primary,
        opacity: 0.4,
    },
    bottomBar: {
        paddingBottom: 50,
        paddingHorizontal: 40,
    },
    controlWrapper: {
        alignItems: 'center',
        gap: 20,
    },
    loadingWrapper: {
        alignItems: 'center',
        gap: 12,
    },
    shutterButton: {
        width: 84,
        height: 84,
        borderRadius: 42,
        backgroundColor: SarvisTheme.colors.primary,
        padding: 4,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: SarvisTheme.colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 8,
    },
    shutterDisabled: {
        opacity: 0.6,
    },
    shutterInner: {
        width: 68,
        height: 68,
        borderRadius: 34,
        borderWidth: 4,
        borderColor: '#FFFFFF',
        backgroundColor: 'transparent',
    },
    nextActionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: SarvisTheme.colors.primary,
        paddingHorizontal: 32,
        paddingVertical: 18,
        borderRadius: 20,
        gap: 12,
        width: '100%',
        shadowColor: SarvisTheme.colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    nextActionText: {
        fontSize: 18,
        fontWeight: '900',
        color: '#FFFFFF',
    },
    hintText: {
        fontSize: 14,
        fontWeight: '600',
        color: SarvisTheme.colors.textMuted,
    },
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 50,
    },
    permissionText: {
        fontSize: 18,
        fontWeight: '800',
        color: SarvisTheme.colors.text,
        textAlign: 'center',
        marginTop: 24,
        marginBottom: 32,
        lineHeight: 26,
    },
    permissionButton: {
        backgroundColor: SarvisTheme.colors.primary,
        paddingHorizontal: 30,
        paddingVertical: 16,
        borderRadius: 16,
        width: '100%',
        alignItems: 'center',
    },
    permissionButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
    },
});
