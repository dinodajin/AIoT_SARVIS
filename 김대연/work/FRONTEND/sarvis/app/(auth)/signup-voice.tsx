import React, { useState } from 'react';
import { StyleSheet, Text, View, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';

import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisLogo } from '@/components/sarvis/sarvis-logo';
import { SarvisScreen } from '@/components/sarvis/sarvis-screen';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { SoftAPCommunication } from '@/utils/softap-communication';
import { apiClient } from '@/utils/api';

const PROMPTS = ['"SARVIS" 발음', '"따라와" 발음', '"이리와" 발음', '"집어" 발음'];

export default function SignupVoiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [comm] = useState(new SoftAPCommunication('10.42.0.1', 5000));
  
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [recordingCount, setRecordingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);

  const email = params.email as string;
  const loginId = params.loginId as string;
  const uid = params.uid as string;

  // 음성 녹음
  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('권한 필요', '마이크 권한이 필요합니다');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
      await recording.startAsync();
      setRecording(recording);
      setStatusMessage('녹음 중... (말하기)');
    } catch (error) {
      console.error('Recording error:', error);
      Alert.alert('에러', '녹음 오류 발생');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      if (uri) {
        setSelectedFiles((prev) => [...prev, uri]);
        setRecordingCount((prev) => prev + 1);
        setStatusMessage(`${recordingCount + 1}/4 녹음 완료!`);
      }

      setRecording(null);
    } catch (error) {
      console.error('Stop recording error:', error);
    }
  };

  // 파일 선택 방식
  const selectVoiceFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || result.assets.length < 4) {
        Alert.alert('경고', '4개의 음성 파일이 필요합니다');
        return;
      }

      const uris = result.assets.map((asset: any) => asset.uri);
      setSelectedFiles(uris);
      setRecordingCount(uris.length);
      setStatusMessage(`${uris.length}개 파일 선택 완료!`);
    } catch (error) {
      console.error('File selection error:', error);
      Alert.alert('에러', '파일 선택 오류 발생');
    }
  };

  // 음성 등록
  const handleVoiceRegistration = async () => {
    if (selectedFiles.length < 4) {
      Alert.alert('경고', '4개의 음성 파일이 필요합니다');
      return;
    }

    setLoading(true);
    setStatusMessage('음성 파일을 Jetson 서버로 전송 중...');
    setUploadProgress(0);

    try {
      // 1. Jetson 서버로 음성 파일 전송
      const success = await comm.sendMultipleFiles(selectedFiles, loginId, '/register/upload');
      
      if (!success) {
        throw new Error('Jetson 서버 전송 실패');
      }

      setUploadProgress(50);
      setStatusMessage('음성 벡터 추출 중...');

      // 2. Jetson에서 음성 벡터를 받아서 서버로 전송
      // 실제 구현에서는 Jetson 서버에서 응답으로 voice_vector를 받아야 함
      // 여기서는 개발을 위해 임시 벡터 생성
      const mockVoiceVector = Array.from({ length: 4 }, () => 
        Array.from({ length: 192 }, () => Math.random())
      );

      setUploadProgress(75);
      setStatusMessage('서버에 음성 벡터 저장 중...');

      await apiClient.saveVoiceVector(uid, mockVoiceVector);

      setUploadProgress(100);
      setStatusMessage('음성 등록 완료!');

      // 회원가입 완료 - 로그인 화면으로 이동
      Alert.alert(
        '회원가입 완료!',
        'SARVIS에 가입이 완료되었습니다. 로그인해주세요.',
        [
          {
            text: '확인',
            onPress: () => {
              router.replace({ pathname: '/(auth)/login' } as any);
            }
          }
        ]
      );

    } catch (error: any) {
      console.error('Voice registration error:', error);
      Alert.alert('오류', error.message || '음성 등록 실패');
      setStatusMessage('음성 등록 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      '회원가입 취소',
      '회원가입을 취소하면 모든 정보가 초기화됩니다. 정말 취소하시겠습니까?',
      [
        { text: '아니오', style: 'cancel' },
        { 
          text: '네', 
          onPress: () => router.replace({ pathname: '/(auth)/login' } as any)
        }
      ]
    );
  };

  const handleClear = () => {
    Alert.alert(
      '삭제 확인',
      '선택된 모든 음성 파일을 삭제하시겠습니까?',
      [
        { text: '아니오', style: 'cancel' },
        { 
          text: '네', 
          onPress: () => {
            setSelectedFiles([]);
            setRecordingCount(0);
            setStatusMessage('');
          }
        }
      ]
    );
  };

  return (
    <SarvisScreen>
      <SarvisLogo subtitle="음성 등록" />

      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.description}>
            4개의 음성 파일을 등록하여 SARVIS에 사용자를 인식합니다.
          </Text>

          <View style={styles.promptList}>
            {PROMPTS.map((prompt, index) => (
              <View key={index} style={styles.promptItem}>
                <Text style={[
                  styles.promptNumber,
                  recordingCount > index && styles.promptNumberComplete
                ]}>
                  {recordingCount > index ? '✓' : index + 1}
                </Text>
                <Text style={[
                  styles.promptText,
                  recordingCount > index && styles.promptTextComplete
                ]}>
                  {prompt}
                </Text>
              </View>
            ))}
          </View>

          {selectedFiles.length > 0 && (
            <View style={styles.fileListContainer}>
              <Text style={styles.fileListTitle}>선택된 파일 ({selectedFiles.length}/4)</Text>
              <View style={styles.fileList}>
                {selectedFiles.map((uri, index) => (
                  <View key={index} style={styles.fileItem}>
                    <Text style={styles.fileName}>
                      {uri.split('/').pop() || `음성 ${index + 1}`}
                    </Text>
                    <Text style={styles.fileCheck}>✓</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>{statusMessage}</Text>
            {loading && uploadProgress > 0 && (
              <>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
                </View>
                <Text style={styles.progressText}>{uploadProgress}%</Text>
              </>
            )}
          </View>

          {selectedFiles.length === 0 ? (
            <>
              <View style={styles.recordButtonContainer}>
                <SarvisButton
                  title={recording ? "⏹️ 녹음 중지" : "🎙️ 녹음 시작"}
                  variant={recording ? "danger" : "secondary"}
                  disabled={loading || selectedFiles.length >= 4}
                  onPress={recording ? stopRecording : startRecording}
                />
              </View>

              <Text style={styles.orText}>또는</Text>

              <SarvisButton
                title="📁 파일 선택"
                variant="primary"
                disabled={loading}
                onPress={selectVoiceFiles}
              />
            </>
          ) : (
            <>
              {selectedFiles.length >= 4 && (
                <SarvisButton
                  title="음성 등록하기"
                  variant="success"
                  disabled={loading}
                  onPress={handleVoiceRegistration}
                />
              )}

              {!loading && (
                <SarvisButton
                  title="다시 선택"
                  variant="outline"
                  onPress={handleClear}
                />
              )}
            </>
          )}

          <SarvisButton
            title="가입 취소"
            variant="outline"
            onPress={handleCancel}
          />
        </View>
      </View>
    </SarvisScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  card: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: SarvisTheme.radius.lg,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  description: {
    fontSize: 14,
    color: SarvisTheme.colors.textLight,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  promptList: {
    marginBottom: 20,
  },
  promptItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    padding: 12,
    backgroundColor: SarvisTheme.colors.primaryLight,
    borderRadius: SarvisTheme.radius.md,
  },
  promptNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: SarvisTheme.colors.border,
    color: SarvisTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 32,
    marginRight: 12,
  },
  promptNumberComplete: {
    backgroundColor: SarvisTheme.colors.success,
    color: 'white',
  },
  promptText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: SarvisTheme.colors.text,
  },
  promptTextComplete: {
    color: SarvisTheme.colors.success,
  },
  fileListContainer: {
    marginBottom: 20,
  },
  fileListTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: SarvisTheme.colors.text,
    marginBottom: 12,
  },
  fileList: {
    backgroundColor: '#F5F5F5',
    borderRadius: SarvisTheme.radius.md,
    padding: 12,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: 'white',
    borderRadius: SarvisTheme.radius.sm,
    marginBottom: 8,
  },
  fileName: {
    flex: 1,
    fontSize: 13,
    color: SarvisTheme.colors.text,
  },
  fileCheck: {
    fontSize: 18,
    color: SarvisTheme.colors.success,
  },
  recordButtonContainer: {
    marginBottom: 8,
  },
  orText: {
    fontSize: 14,
    color: SarvisTheme.colors.textLight,
    textAlign: 'center',
    marginVertical: 12,
    fontWeight: '600',
  },
  statusContainer: {
    marginBottom: 20,
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: SarvisTheme.radius.md,
  },
  statusText: {
    fontSize: 14,
    color: SarvisTheme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: SarvisTheme.colors.primary,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: SarvisTheme.colors.primary,
    textAlign: 'center',
  },
});