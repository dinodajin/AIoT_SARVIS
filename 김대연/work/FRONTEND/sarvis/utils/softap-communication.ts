import * as Network from 'expo-network';
import * as FileSystem from 'expo-file-system';
import axios, { AxiosError } from 'axios';

export interface NetworkInfo {
  ssid: string | null;
  ipAddress: string | null;
  isConnected: boolean;
}

export interface CommunicationStatus {
  connected: boolean;
  jetsonReachable: boolean;
  lastError: string | null;
}

export class SoftAPCommunication {
  private jetsonIP: string;
  private port: number;

  constructor(jetsonIP: string = '10.42.0.1', port: number = 5000) {
    this.jetsonIP = jetsonIP;
    this.port = port;
  }

  async getNetworkStatus(): Promise<NetworkInfo> {
    try {
      const networkState = await Network.getNetworkStateAsync();
      const ipAddress = await Network.getIpAddressAsync();
      
      return {
        ssid: networkState.type === Network.NetworkStateType.WIFI ? 'Connected' : null,
        ipAddress: ipAddress,
        isConnected: networkState.isConnected ?? false
      };
    } catch (error) {
      console.error('Network status error:', error);
      return {
        ssid: null,
        ipAddress: null,
        isConnected: false
      };
    }
  }

  async testConnection(): Promise<CommunicationStatus> {
    try {
      const response = await axios.get(`http://${this.jetsonIP}:${this.port}/`, {
        timeout: 5000
      });
      
      return {
        connected: true,
        jetsonReachable: response.status === 200,
        lastError: null
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        connected: false,
        jetsonReachable: false,
        lastError: axiosError.message || 'Connection failed'
      };
    }
  }

  async sendImage(imageUri: string, endpoint: string = '/upload_face'): Promise<boolean> {
    try {
      const formData = new FormData();
      formData.append('image', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'upload.jpg'
      } as any);

      const response = await axios.post(
        `http://${this.jetsonIP}:${this.port}${endpoint}`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          timeout: 30000
        }
      );

      return response.status === 200;
    } catch (error) {
      console.error('Image send error:', error);
      return false;
    }
  }

  async sendMultipleImages(imageUris: string[], uid: string = 'unknown_user', endpoint: string = '/upload_face'): Promise<boolean> {
    try {
      const formData = new FormData();
      
      // 1. UID 추가
      formData.append('uid', uid);
      
      // 2. 모든 이미지를 'image' 키로 전송
      imageUris.forEach((uri, index) => {
        // React Native에서는 파일 객체 형식을 엄격히 따져야 합니다.
        const file = {
          uri: uri.startsWith('file://') ? uri : `file://${uri}`, // 경로 확인
          type: 'image/jpeg',
          name: `photo_${index + 1}.jpg`
        };
        
        // @ts-ignore: FormData append issue in TS
        formData.append('image', file as any);
      });

      const response = await axios.post(
        `http://${this.jetsonIP}:${this.port}${endpoint}`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            // Axios에서 FormData 전송 시 가끔 발생하는 헤더 꼬임 방지
            'Accept': 'application/json',
          },
          // 중요: Axios가 데이터를 문자열로 변환하지 않도록 설정
          transformRequest: (data) => data, 
          timeout: 60000
        }
      );

      return response.status === 200;
    } catch (error) {
      const axiosError = error as AxiosError;
      // 서버에서 보낸 에러 메시지 상세 출력 (디버깅용)
      console.error('Multiple images send error:', axiosError.response?.data || axiosError.message);
      return false;
    }
  }

  async receiveImage(filename: string, localPath: string): Promise<boolean> {
    try {
      const url = `http://${this.jetsonIP}:${this.port}/get_image/${filename}`;
      const result = await FileSystem.downloadAsync(url, localPath);
      return result.status === 200;
    } catch (error) {
      console.error('Image receive error:', error);
      return false;
    }
  }

  async sendAudio(audioUri: string, endpoint: string = '/api/upload/audio'): Promise<boolean> {
    try {
      const formData = new FormData();
      formData.append('audio', {
        uri: audioUri,
        type: 'audio/wav',
        name: 'audio.wav'
      } as any);

      const response = await axios.post(
        `http://${this.jetsonIP}:${this.port}${endpoint}`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          timeout: 30000
        }
      );

      return response.status === 200;
    } catch (error) {
      console.error('Audio send error:', error);
      return false;
    }
  }

  async sendMultipleFiles(fileUris: string[], uid: string = 'unknown_user', endpoint: string = '/register/upload'): Promise<boolean> {
    try {
      const formData = new FormData();
      
      // UID 추가
      formData.append('uid', uid);
      
      // 모든 파일 전송
      fileUris.forEach((uri, index) => {
        const file = {
          uri: uri.startsWith('file://') ? uri : `file://${uri}`,
          type: 'audio/wav',
          name: `audio_${index + 1}.wav`
        };
        
        // @ts-ignore: FormData append issue in TS
        formData.append('audio', file as any);
      });

      const response = await axios.post(
        `http://${this.jetsonIP}:${this.port}${endpoint}`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Accept': 'application/json',
          },
          transformRequest: (data) => data,
          timeout: 60000
        }
      );

      return response.status === 200;
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error('Multiple files send error:', axiosError.response?.data || axiosError.message);
      return false;
    }
  }

  async receiveAudio(filename: string, localPath: string): Promise<boolean> {
    try {
      const url = `http://${this.jetsonIP}:${this.port}/api/audio/${filename}`;
      const result = await FileSystem.downloadAsync(url, localPath);
      return result.status === 200;
    } catch (error) {
      console.error('Audio receive error:', error);
      return false;
    }
  }

  async testEcho(message: string): Promise<string | null> {
    try {
      const response = await axios.post(
        `http://${this.jetsonIP}:${this.port}/api/echo`,
        { message },
        { timeout: 5000 }
      );
      return response.data.reply || null;
    } catch (error) {
      console.error('Echo test error:', error);
      return null;
    }
  }

  /**
   * 얼굴 로그인 - 단일 얼굴 이미지로 로그인
   * server_test.py의 /login_face 엔드포인트 사용
   */
  async loginWithFace(
    imageUri: string
  ): Promise<{ success: boolean; user?: { uid: string; nickname: string } }> {
    try {
      const formData = new FormData();
      
      // 단일 얼굴 이미지 전송
      const file = {
        uri: imageUri.startsWith('file://') ? imageUri : `file://${imageUri}`,
        type: 'image/jpeg',
        name: 'login_face.jpg'
      };
      
      // @ts-ignore: FormData append issue in TS
      formData.append('image', file as any);

      console.log(`얼굴 로그인 시도: 이미지=${imageUri}`);
      
      const response = await axios.post(
        `http://${this.jetsonIP}:${this.port}/login_face`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Accept': 'application/json',
          },
          transformRequest: (data) => data,
          timeout: 60000
        }
      );

      console.log('얼굴 로그인 응답:', response.data);
      
      // server_test.py 응답 형식 처리
      // 성공 시: { uid, nickname, similarity, ... }
      if (response.data.uid && response.data.nickname) {
        return {
          success: true,
          user: {
            uid: response.data.uid,
            nickname: response.data.nickname
          }
        };
      }
      
      return { success: false };
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error('얼굴 로그인 에러:', axiosError.response?.data || axiosError.message);
      return { success: false };
    }
  }
}
