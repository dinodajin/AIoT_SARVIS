import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Alert, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisLogo } from '@/components/sarvis/sarvis-logo';
import { SarvisScreen } from '@/components/sarvis/sarvis-screen';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { SoftAPCommunication } from '@/utils/softap-communication';
import { apiClient } from '@/utils/api';

const DIRECTIONS = ['Center (정면)', 'Left (왼쪽)', 'Right (오른쪽)', 'Up (위쪽)', 'Down (아래쪽)'];

export default function SignupFaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [comm] = useState(new SoftAPCommunication('10.42.0.1', 5000));
  
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [captureCount, setCaptureCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  const email = params.email as string;
  const loginId = params.loginId as string;
  const uid = params.uid as string;

  // 5장 연속 촬영
  const captureMultiplePhotos = async () => {
    const images: string[] = [];
    setCaptureCount(0);
    setLoading(true);
    setStatusMessage('카메라를 시작합니다...');

    for (let i = 0; i < 5; i++) {
      setStatusMessage(`${i + 1}/5: ${DIRECTIONS[i]} 사진 촬영 중...`);
      
      try {
        const result = await ImagePicker.launchCameraAsync({
          allowsEditing: false,
          quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
          images.push(result.assets[0].uri);
          setCaptureCount(i + 1);
          
          if (i < 4) {
            setStatusMessage(`${i + 1}/5 완료! 다음: ${DIRECTIONS[i + 1]}`);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } else {
          Alert.alert('취소됨', `${i}장만 촬영되었습니다`);
          break;
        }
      } catch (error) {
        console.error('Camera error:', error);
        Alert.alert('에러', '카메라 오류 발생');
        break;
      }
    }

    setSelectedImages(images);
    setLoading(false);

    if (images.length === 5) {
      setStatusMessage('5장 촬영 완료! 얼굴 등록을 시작합니다.');
    } else {
      setStatusMessage(`${images.length}장 촬영 완료`);
    }
  };

  // 얼굴 이미지 전송 및 등록
  const handleFaceRegistration = async () => {
    if (selectedImages.length !== 5) {
      Alert.alert('경고', '5장의 얼굴 사진이 필요합니다');
      return;
    }

    setLoading(true);
    setStatusMessage('얼굴 이미지를 Jetson 서버로 전송 중...');
    setUploadProgress(0);

    try {
      // 1. Jetson 서버로 얼굴 이미지 전송
      const success = await comm.sendMultipleImages(selectedImages, loginId, '/register/upload');
      
      if (!success) {
        throw new Error('Jetson 서버 전송 실패');
      }

      setUploadProgress(50);
      setStatusMessage('얼굴 벡터 추출 중...');

      // 2. Jetson에서 얼굴 벡터를 받아서 서버로 전송
      // 실제 구현에서는 Jetson 서버에서 응답으로 face_vector를 받아야 함
      // 여기서는 개발을 위해 임시 벡터 생성
      const mockFaceVector = Array.from({ length: 5 }, () => 
        Array.from({ length: 512 }, () => Math.random())
      );

      setUploadProgress(75);
      setStatusMessage('서버에 얼굴 벡터 저장 중...');

      await apiClient.saveFaceVector(uid, mockFaceVector);

      setUploadProgress(100);
      setStatusMessage('얼굴 등록 완료!');

      Alert.alert('성공', '얼굴 등록이 완료되었습니다', [
        {
          text: '확인',
          onPress: () => {
            router.push({
              pathname: '/(auth)/signup-voice',
              params: { email, loginId, uid }
            } as any);
          }
        }
      ]);

    } catch (error: any) {
      console.error('Face registration error:', error);
      Alert.alert('오류', error.message || '얼굴 등록 실패');
      setStatusMessage('얼굴 등록 실패');
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

  return (
    <SarvisScreen>
      <SarvisLogo subtitle="얼굴 등록" />

      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.description}>
            5장의 얼굴 사진을 촬영하여 SARVIS에 사용자를 등록합니다.
          </Text>

          <View style={styles.directionList}>
            {DIRECTIONS.map((direction, index) => (
              <View key={index} style={styles.directionItem}>
                <Text style={[
                  styles.directionNumber,
                  captureCount > index && styles.directionNumberComplete
                ]}>
                  {captureCount > index ? '✓' : index + 1}
                </Text>
                <Text style={[
                  styles.directionText,
                  captureCount > index && styles.directionTextComplete
                ]}>
                  {direction}
                </Text>
              </View>
            ))}
          </View>

          {selectedImages.length > 0 && (
            <View style={styles.previewContainer}>
              <Text style={styles.previewTitle}>촬영된 사진 ({selectedImages.length}/5)</Text>
              <View style={styles.previewGrid}>
                {selectedImages.map((uri, index) => (
                  <Image
                    key={index}
                    source={{ uri }}
                    style={styles.previewImage}
                  />
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

          {selectedImages.length === 5 && (
            <SarvisButton
              title="얼굴 등록하기"
              variant="success"
              disabled={loading}
              onPress={handleFaceRegistration}
            />
          )}

          <SarvisButton
            title={selectedImages.length === 0 ? "📷 5장 연속 촬영" : "다시 촬영"}
            variant="primary"
            disabled={loading}
            onPress={captureMultiplePhotos}
          />

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
  directionList: {
    marginBottom: 20,
  },
  directionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    padding: 12,
    backgroundColor: SarvisTheme.colors.primaryLight,
    borderRadius: SarvisTheme.radius.md,
  },
  directionNumber: {
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
  directionNumberComplete: {
    backgroundColor: SarvisTheme.colors.success,
    color: 'white',
  },
  directionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: SarvisTheme.colors.text,
  },
  directionTextComplete: {
    color: SarvisTheme.colors.success,
  },
  previewContainer: {
    marginBottom: 20,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: SarvisTheme.colors.text,
    marginBottom: 12,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  previewImage: {
    width: (300 - 24) / 2,
    height: ((300 - 24) / 2) * 0.75,
    borderRadius: SarvisTheme.radius.md,
    marginBottom: 8,
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