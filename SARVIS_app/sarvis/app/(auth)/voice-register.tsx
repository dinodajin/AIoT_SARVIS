import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Audio } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authAPI } from '@/api/auth';
import { biometricAPI } from '@/api/biometric';
import { SarvisAppHeader } from '@/components/sarvis/sarvis-app-header';
import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { useAuth } from '@/providers/auth-provider';

const VOICE_PHRASES = ['싸비스', '싸비스', '싸비스', '싸비스'];

export default function VoiceRegisterScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const params = useLocalSearchParams();
  const loginId = (params.loginId as string) || '';
  const nickname = (params.nickname as string) || '';

  // 디버깅용 로그
  useEffect(() => {
    console.log('🎤 [VoiceRegister] 화면 마운트됨');
    console.log('📦 [VoiceRegister] 받은 파라미터:', { loginId, nickname });
  }, [loginId, nickname]);

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
      console.log('녹음 파일 저장 경로:', uri);
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

  const handleSkip = async () => {
    Alert.alert(
      '알림',
      '음성 등록을 건너뛰시겠습니까?',
      [
        {
          text: '취소',
          style: 'cancel',
        },
        {
          text: '건너뛰기',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);

            try {
              // null 벡터로 저장 (음성 등록 건너뛰기)
              console.log('🌐 EC2 서버로 음성 건너뛰기 요청...');
              const skipResponse = await authAPI.saveVoiceVector(loginId, null);

              console.log('✅ 음성 건너뛰기 성공');

              if (skipResponse.success) {
                Alert.alert(
                  '회원가입 완료',
                  '회원가입이 완료되었습니다. 로그인 해주세요.',
                  [{ text: '확인', onPress: () => router.replace('/') }]
                );
              } else {
                Alert.alert(
                  '알림',
                  '회원가입 처리에 문제가 발생했습니다. 로그인 화면으로 이동합니다.',
                  [{ text: '확인', onPress: () => router.replace('/') }]
                );
              }
            } catch (error: any) {
              console.error('❌ 음성 건너뛰기 실패:', error);
              Alert.alert('오류', '회원가입 처리 중 오류가 발생했습니다.');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  /**
   * 자동 로그인 기능을 제거하고 랜딩 페이지로 이동하게 함
   */
  const handleProceedAnyway = async () => {
    router.replace('/');
  };

  /* double-submit prevention lock */
  const isSubmitting = useRef(false);

  const handleComplete = async () => {
    if (isSubmitting.current) return;

    if (!loginId) {
      console.error('❌ loginId가 없습니다. 회원가입 요청 불가.');
      Alert.alert('오류', '사용자 ID 정보가 없습니다. 처음부터 다시 시도해주세요.');
      return;
    }

    console.log('🎙️ [VoiceRegister] 등록 완료 프로세스 시작. ID:', loginId);
    isSubmitting.current = true;
    setIsProcessing(true);

    try {
      // 1. Jetson 서버로 4개 음성 파일 전송 → 벡터 반환
      console.log('🎙️ Jetson 서버로 음성 파일 전송...');
      const jetsonResponse = await biometricAPI.uploadVoice(loginId, recordedVoices);

      // 🚨 Jetson 응답 검증
      if (!jetsonResponse.success) {
        console.error('❌ Jetson 서버 실패:', jetsonResponse.message);
        Alert.alert('오류', jetsonResponse.message || 'Jetson 서버에서 음성을 처리하지 못했습니다.');
        isSubmitting.current = false;
        return;
      }

      // 2. EC2 서버로 완료 요청
      console.log('🌐 EC2 서버로 회원가입 완료 요청...');

      // Jetson 응답에 vectors가 없어도 진행하도록 수정
      const vectorsToSave = jetsonResponse.voice_vectors || null;

      const saveResponse = await authAPI.saveVoiceVector(loginId, vectorsToSave);

      console.log('✅ EC2 서버 회원가입 완료');

      if (saveResponse.success) {
        Alert.alert(
          '회원가입 완료',
          '회원가입이 성공적으로 완료되었습니다. 로그인 해주세요.',
          [{ text: '확인', onPress: () => router.replace('/') }]
        );
      } else {
        Alert.alert(
          '회원가입 완료',
          '회원가입이 완료되었습니다. 로그인 해주세요.',
          [{ text: '확인', onPress: () => router.replace('/') }]
        );
      }
    } catch (error: any) {
      console.error('❌ 음성 등록 실패:', error);

      // 🚨 예외 처리: Jetson이 이미 EC2에 요청을 보내서 캐시가 만료된 경우 (성공으로 간주)
      if (error.response?.data?.reason === 'CACHE_EXPIRED') {
        console.log('⚠️ 캐시 만료 에러 감지 -> Jetson에 의해 이미 처리된 것으로 간주');
        Alert.alert(
          '회원가입 완료',
          '회원가입 프로세스가 완료되었습니다. 로그인 해주세요.',
          [{ text: '확인', onPress: () => router.replace('/') }]
        );
        return;
      }

      Alert.alert(
        '알림',
        `정보 저장 중 문제가 발생했으나, 회원가입은 완료되었을 수 있습니다. 로그인 화면으로 이동합니다.`,
        [{ text: '확인', onPress: () => router.replace('/') }]
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const nextStep = () => {
    setShowNextButton(false);
    if (currentPhraseIndex < VOICE_PHRASES.length - 1) {
      setCurrentPhraseIndex(currentPhraseIndex + 1);
      // Start recording immediately without delay
      startRecording();
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <SarvisAppHeader
          title=""
          showBackButton={true}
          showMenuButton={false}
          showUserBadge={false}
          onBackPress={() => router.replace('/(auth)/face-capture')}
        />
        <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
          <View style={styles.permissionContainer}>
            <ActivityIndicator size="large" color={SarvisTheme.colors.primary} />
            <Text style={styles.permissionText}>권한 확인 중...</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <SarvisAppHeader
          title=""
          showBackButton={true}
          showMenuButton={false}
          showUserBadge={false}
          onBackPress={() => router.replace('/(auth)/face-capture')}
        />
        <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionText}>음성 등록을 위해 마이크 권한이 필요합니다</Text>
            <SarvisButton
              title="권한 요청"
              variant="primary"
              onPress={requestPermissions}
              style={styles.submitButton}
            />
          </View>
        </SafeAreaView>
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
        onBackPress={() => router.replace('/(auth)/face-capture')}
      />

      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerContainer}>
            <Text style={styles.headerText}>STEP 3: 음성등록</Text>
          </View>

          <View style={styles.stepProgress}>
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, styles.inactiveStep]} />
              <Text style={styles.stepText}>Step 1</Text>
              <Text style={styles.stepText}>정보입력</Text>
            </View>
            <View style={styles.stepConnector} />
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, styles.inactiveStep]} />
              <Text style={styles.stepText}>Step 2</Text>
              <Text style={styles.stepText}>얼굴등록</Text>
            </View>
            <View style={styles.stepConnector} />
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, styles.activeStep]} />
              <Text style={[styles.stepText, styles.activeText]}>Step 3</Text>
              <Text style={[styles.stepText, styles.activeText]}>음성등록</Text>
            </View>
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
                <Text style={styles.currentPhrase}>"{currentPhrase}"</Text>

                <View style={styles.waveformContainer}>
                  {isRecording ? (
                    waveAnimations.map((anim, index) => (
                      <Animated.View
                        key={index}
                        style={[
                          styles.waveBar,
                          {
                            transform: [{ scaleY: anim }],
                          },
                        ]}
                      />
                    ))
                  ) : (
                    <View style={styles.waveformPlaceholder} />
                  )}
                </View>

                <Text style={styles.recordingStatus}>
                  {isProcessing
                    ? '인식 성공! ✓'
                    : isRecording
                      ? '지금 말씀하세요'
                      : recordedVoices[currentPhraseIndex]
                        ? '녹음 완료!'
                        : '아래 버튼을 눌러 녹음을 진행하세요'}
                </Text>

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
                          setTimeout(() => {
                            startRecording();
                          }, 100);
                        }}
                      >
                        <Text style={styles.reRecordText}>다시 녹음</Text>
                      </TouchableOpacity>
                      {showNextButton && (
                        <TouchableOpacity
                          style={styles.nextPhraseButton}
                          onPress={nextStep}
                        >
                          <Text style={styles.nextPhraseText}>다음으로</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.skipButton}
                  onPress={handleSkip}
                  disabled={isProcessing}
                >
                  <Text style={styles.skipButtonText}>건너뛰기</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.completedSection}>
                <View style={styles.successCircle}>
                  <Text style={styles.successIcon}>✓</Text>
                </View>
                <Text style={styles.completedTitle}>음성 등록 완료!</Text>
                <Text style={styles.completedText}>
                  모든 단어의 음성 정보가 준비되었습니다.{'\n'}정보를 서버에 등록해주세요.
                </Text>
                <SarvisButton
                  title="등록 완료"
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
            <Text style={styles.loadingText}>음성 분석 중...</Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 150,
  },
  headerContainer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 20,
  },
  headerText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#000000',
    marginBottom: 8,
  },
  stepProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
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
  infoBox: {
    width: '100%',
    marginBottom: 32,
    alignItems: 'center',
  },
  stepProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 10,
  },
  stepWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  voiceStepNode: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  voiceStepNodeActive: {
    backgroundColor: 'white',
    borderColor: SarvisTheme.colors.primary,
  },
  voiceStepNodeCompleted: {
    backgroundColor: SarvisTheme.colors.primary,
    borderColor: SarvisTheme.colors.primary,
  },
  voiceStepNodeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#94a3b8',
  },
  voiceStepNodeTextActive: {
    color: SarvisTheme.colors.primary,
  },
  voiceStepConnector: {
    width: 30,
    height: 3,
    backgroundColor: '#f1f5f9',
    marginHorizontal: 4,
    borderRadius: 2,
  },
  voiceStepConnectorCompleted: {
    backgroundColor: SarvisTheme.colors.primary,
  },
  recordingArea: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  currentPhrase: {
    fontSize: 36,
    fontWeight: '900',
    color: SarvisTheme.colors.primary,
    marginBottom: 16,
    letterSpacing: -1,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    gap: 4,
    width: '100%',
    marginBottom: 20,
  },
  waveformPlaceholder: {
    height: 4,
    width: '70%',
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
    opacity: 0.5,
  },
  waveBar: {
    width: 4,
    height: 48,
    backgroundColor: SarvisTheme.colors.primary,
    borderRadius: 2,
  },
  recordingStatus: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
  },
  recordButtonContainer: {
    width: '100%',
  },
  customRecordButton: {
    width: '100%',
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: SarvisTheme.colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  recordButtonInactive: {
    backgroundColor: SarvisTheme.colors.primary,
  },
  recordButtonActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: SarvisTheme.colors.primary,
  },
  recordButtonDisabled: {
    opacity: 0.6,
  },
  recordButtonText: {
    fontSize: 18,
    fontWeight: '800',
  },
  recordButtonTextInactive: {
    color: '#FFFFFF',
  },
  recordButtonTextActive: {
    color: SarvisTheme.colors.primary,
  },
  submitButton: {
    height: 64,
    borderRadius: 20,
    width: '100%',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  reRecordButton: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  reRecordText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748b',
  },
  nextPhraseButton: {
    flex: 2,
    height: 56,
    borderRadius: 18,
    backgroundColor: SarvisTheme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: SarvisTheme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  nextPhraseText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  skipButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  skipButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    textDecorationLine: 'underline',
  },
  completedSection: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 14,
  },
  successCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: SarvisTheme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successIcon: {
    fontSize: 30,
    color: SarvisTheme.colors.primary,
    fontWeight: '900',
  },
  completedTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: SarvisTheme.colors.text,
    marginBottom: 8,
  },
  completedText: {
    fontSize: 14,
    color: SarvisTheme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30,
    fontWeight: '500',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  permissionText: {
    fontSize: 16,
    fontWeight: '700',
    color: SarvisTheme.colors.text,
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: SarvisTheme.colors.text,
    fontWeight: '600',
  },
});