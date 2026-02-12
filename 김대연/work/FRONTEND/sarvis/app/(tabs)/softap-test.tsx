import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { SoftAPCommunication } from '@/utils/softap-communication';

type TestStatus = 'idle' | 'loading' | 'success' | 'error';

export default function SoftAPTestScreen() {
  const [comm] = useState(new SoftAPCommunication('10.42.0.1', 5000));
  const [jetsonIP, setJetsonIP] = useState('10.42.0.1');
  const [jetsonPort, setJetsonPort] = useState('5000');
  
  const [networkStatus, setNetworkStatus] = useState('검사 중...');
  const [connectionStatus, setConnectionStatus] = useState<TestStatus>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');
  
  const [echoMessage, setEchoMessage] = useState('');
  const [echoResponse, setEchoResponse] = useState('');
  const [echoStatus, setEchoStatus] = useState<TestStatus>('idle');
  
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [imageStatus, setImageStatus] = useState<TestStatus>('idle');
  const [imageMessage, setImageMessage] = useState('');
  const [captureCount, setCaptureCount] = useState(0);
  const [maxCaptures] = useState(5);
  
  const [selectedAudio, setSelectedAudio] = useState<string | null>(null);
  const [audioStatus, setAudioStatus] = useState<TestStatus>('idle');
  const [audioMessage, setAudioMessage] = useState('');

  useEffect(() => {
    checkNetworkStatus();
    const interval = setInterval(checkNetworkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const checkNetworkStatus = async () => {
    try {
      const status = await comm.getNetworkStatus();
      
      console.log('Network status:', status);
      console.log('Is connected:', status.isConnected);
      console.log('SSID:', status.ssid);
      console.log('IP:', status.ipAddress);
      
      // 네트워크 상태 상세 메시지
      if (status.isConnected) {
        if (status.ipAddress) {
          // SoftAP IP 범위인지 확인 (10.42.0.x)
          if (status.ipAddress.startsWith('10.42.0.')) {
            setNetworkStatus(`✅ SoftAP 연결됨 (IP: ${status.ipAddress})`);
          } else {
            setNetworkStatus(`📱 WiFi 연결됨 (IP: ${status.ipAddress})`);
          }
        } else {
          setNetworkStatus('📱 WiFi 연결됨 (IP 없음)');
        }
      } else {
        setNetworkStatus('❌ 네트워크 연결 없음');
      }
    } catch (error) {
      console.error('Network check error:', error);
      setNetworkStatus('⚠️ 상태 확인 실패');
    }
  };

  const updateConnectionConfig = () => {
    comm.constructor(jetsonIP, parseInt(jetsonPort));
  };

  const testConnection = async () => {
    setConnectionStatus('loading');
    setConnectionMessage('');
    
    const status = await comm.testConnection();
    
    if (status.connected && status.jetsonReachable) {
      setConnectionStatus('success');
      setConnectionMessage('Jetson 서버에 연결되었습니다!');
    } else {
      setConnectionStatus('error');
      setConnectionMessage(`연결 실패: ${status.lastError}`);
    }
  };

  const testEcho = async () => {
    if (!echoMessage.trim()) {
      Alert.alert('경고', '메시지를 입력하세요');
      return;
    }
    
    setEchoStatus('loading');
    setEchoResponse('');
    
    const response = await comm.testEcho(echoMessage);
    
    if (response) {
      setEchoStatus('success');
      setEchoResponse(`응답: ${response}`);
    } else {
      setEchoStatus('error');
      setEchoResponse('Echo 테스트 실패');
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
      setImageStatus('idle');
      setImageMessage('');
    }
  };

  const takePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
      setImageStatus('idle');
      setImageMessage('');
    }
  };

  const sendImage = async () => {
    if (!selectedImage) {
      Alert.alert('경고', '이미지를 선택하세요');
      return;
    }
    
    setImageStatus('loading');
    setImageMessage('');
    
    const success = await comm.sendImage(selectedImage);
    
    if (success) {
      setImageStatus('success');
      setImageMessage('이미지 전송 성공!');
    } else {
      setImageStatus('error');
      setImageMessage('이미지 전송 실패');
    }
  };

  const receiveImage = async () => {
    // Expo FileSystem API 변경으로 인해 일시적으로 비활성화
    Alert.alert('안내', '파일 수신 기능은 현재 버전에서 지원되지 않습니다. 5장 전송 기능을 테스트해주세요.');
  };

  const captureMultiplePhotos = async () => {
    const images: string[] = [];
    const directions = ['Center (정면)', 'Left (왼쪽)', 'Right (오른쪽)', 'Up (위쪽)', 'Down (아래쪽)'];
    setCaptureCount(0);
    setImageStatus('loading');
    setImageMessage('카메라를 시작합니다...');

    for (let i = 0; i < maxCaptures; i++) {
      setImageMessage(`${i + 1}/${maxCaptures}: ${directions[i]} 사진 촬영 중...`);
      
      try {
        const result = await ImagePicker.launchCameraAsync({
          allowsEditing: false,
          quality: 0.8
        });

        if (!result.canceled && result.assets[0]) {
          images.push(result.assets[0].uri);
          setCaptureCount(i + 1);
          
          if (i < maxCaptures - 1) {
            setImageMessage(`${i + 1}/${maxCaptures} 완료! 다음: ${directions[i + 1]} (취소하려면 뒤로 가기)`);
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
    
    if (images.length > 0) {
      setImageMessage(`${images.length}장 촬영 완료! 전송 버튼을 누르세요`);
    } else {
      setImageStatus('idle');
      setImageMessage('');
    }
  };

  const sendMultipleImages = async () => {
    if (selectedImages.length === 0) {
      Alert.alert('경고', '먼저 사진을 촬영해주세요');
      return;
    }
    
    setImageStatus('loading');
    setImageMessage(`${selectedImages.length}장 전송 중...`);
    
    // UID 전달 (현재는 테스트용으로 'test_user' 사용)
    const success = await comm.sendMultipleImages(selectedImages, 'test_user');
    
    if (success) {
      setImageStatus('success');
      setImageMessage(`${selectedImages.length}장 전송 성공!`);
      setSelectedImages([]);
      setCaptureCount(0);
    } else {
      setImageStatus('error');
      setImageMessage('전송 실패');
    }
  };

  const pickAudio = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['audio/*'],
      copyToCacheDirectory: true
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedAudio(result.assets[0].uri);
      setAudioStatus('idle');
      setAudioMessage('');
    }
  };

  const sendAudio = async () => {
    if (!selectedAudio) {
      Alert.alert('경고', '오디오 파일을 선택하세요');
      return;
    }
    
    setAudioStatus('loading');
    setAudioMessage('');
    
    const success = await comm.sendAudio(selectedAudio);
    
    if (success) {
      setAudioStatus('success');
      setAudioMessage('오디오 전송 성공!');
    } else {
      setAudioStatus('error');
      setAudioMessage('오디오 전송 실패');
    }
  };

  const receiveAudio = async () => {
    // Expo FileSystem API 변경으로 인해 일시적으로 비활성화
    Alert.alert('안내', '파일 수신 기능은 현재 버전에서 지원되지 않습니다.');
  };

  const getStatusColor = (status: TestStatus) => {
    switch (status) {
      case 'success': return '#4CAF50';
      case 'error': return '#F44336';
      case 'loading': return '#2196F3';
      default: return '#9E9E9E';
    }
  };

  const renderStatusIcon = (status: TestStatus) => {
    if (status === 'loading') {
      return <ActivityIndicator color="#2196F3" size="small" />;
    }
    return null;
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>SoftAP 통신 테스트</Text>

      {/* 네트워크 상태 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>네트워크 상태</Text>
        <View style={styles.statusCard}>
          <Text style={styles.statusText}>{networkStatus}</Text>
        </View>
      </View>

      {/* 연결 설정 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Jetson 연결 설정</Text>
        <View style={styles.inputRow}>
          <Text style={styles.label}>IP 주소:</Text>
          <TextInput
            style={styles.input}
            value={jetsonIP}
            onChangeText={setJetsonIP}
            placeholder="10.42.0.1"
          />
        </View>
        <View style={styles.inputRow}>
          <Text style={styles.label}>포트:</Text>
          <TextInput
            style={styles.input}
            value={jetsonPort}
            onChangeText={setJetsonPort}
            placeholder="5000"
            keyboardType="number-pad"
          />
        </View>
        <TouchableOpacity style={styles.button} onPress={updateConnectionConfig}>
          <Text style={styles.buttonText}>설정 적용</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={testConnection}>
          <Text style={styles.primaryButtonText}>연결 테스트</Text>
        </TouchableOpacity>
        {connectionStatus !== 'idle' && (
          <View style={styles.statusBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {renderStatusIcon(connectionStatus)}
              <Text style={[styles.statusMessage, { color: getStatusColor(connectionStatus) }]}>
                {connectionMessage}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Echo 테스트 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Echo 테스트</Text>
        <TextInput
          style={styles.textInput}
          value={echoMessage}
          onChangeText={setEchoMessage}
          placeholder="테스트 메시지 입력"
        />
        <TouchableOpacity style={styles.button} onPress={testEcho}>
          <Text style={styles.buttonText}>Echo 전송</Text>
        </TouchableOpacity>
        {echoStatus !== 'idle' && echoResponse && (
          <View style={styles.statusBox}>
            <Text style={styles.echoResponse}>{echoResponse}</Text>
          </View>
        )}
      </View>

      {/* 이미지 테스트 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>이미지 전송/수신</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={captureMultiplePhotos}>
          <Text style={styles.primaryButtonText}>📷 5장 연속 촬영</Text>
        </TouchableOpacity>
        {captureCount > 0 && (
          <Text style={styles.fileInfo}>촬영 완료: {captureCount}/5장</Text>
        )}
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={pickImage}>
            <Text style={styles.secondaryButtonText}>갤러리 선택</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={takePhoto}>
            <Text style={styles.secondaryButtonText}>사진 촬영</Text>
          </TouchableOpacity>
        </View>
        {selectedImage && (
          <Text style={styles.fileInfo}>선택된 이미지: {selectedImage}</Text>
        )}
        <TouchableOpacity style={styles.primaryButton} onPress={sendMultipleImages} disabled={selectedImages.length === 0}>
          <Text style={styles.primaryButtonText}>📤 5장 한번에 전송</Text>
        </TouchableOpacity>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={sendImage} disabled={!selectedImage}>
            <Text style={styles.buttonText}>이미지 전송</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={receiveImage}>
            <Text style={styles.buttonText}>이미지 수신</Text>
          </TouchableOpacity>
        </View>
        {imageStatus !== 'idle' && (
          <View style={styles.statusBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {renderStatusIcon(imageStatus)}
              <Text style={[styles.statusMessage, { color: getStatusColor(imageStatus) }]}>
                {imageMessage}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* 오디오 테스트 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>오디오 전송/수신</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={pickAudio}>
          <Text style={styles.secondaryButtonText}>오디오 파일 선택</Text>
        </TouchableOpacity>
        {selectedAudio && (
          <Text style={styles.fileInfo}>선택된 파일: {selectedAudio.split('/').pop()}</Text>
        )}
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={sendAudio} disabled={!selectedAudio}>
            <Text style={styles.buttonText}>오디오 전송</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={receiveAudio}>
            <Text style={styles.buttonText}>오디오 수신</Text>
          </TouchableOpacity>
        </View>
        {audioStatus !== 'idle' && (
          <View style={styles.statusBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {renderStatusIcon(audioStatus)}
              <Text style={[styles.statusMessage, { color: getStatusColor(audioStatus) }]}>
                {audioMessage}
              </Text>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  statusCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  statusText: {
    fontSize: 14,
    color: '#1976D2',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    width: 80,
    fontSize: 14,
    color: '#666',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    backgroundColor: '#FAFAFA',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#FAFAFA',
    marginBottom: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 14,
    marginTop: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#FF9800',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  statusMessage: {
    fontSize: 14,
    fontWeight: '600',
  },
  echoResponse: {
    fontSize: 14,
    color: '#333',
  },
  fileInfo: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    fontStyle: 'italic',
  },
});
