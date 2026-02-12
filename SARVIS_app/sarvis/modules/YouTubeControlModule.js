import { Linking, NativeModules, Platform } from 'react-native';
import { getWebSocketManager } from '../api/websocket';

const { YouTubeController } = NativeModules;

// YouTube 네이티브 모듈 래퍼
class YouTubeControlWrapper {
  constructor() {
    this.isAndroid = Platform.OS === 'android';
    this.moduleAvailable = this.isAndroid && YouTubeController;
    this.wsManager = getWebSocketManager();
    console.log('YouTubeControl initialized:', {
      isAndroid: this.isAndroid,
      moduleAvailable: this.moduleAvailable,
      youTubeControllerExists: !!YouTubeController
    });
  }

  // ... (isServiceEnabled 생략)

  // 명령 전송
  async sendCommand(command) {
    console.log('🎬 [YouTubeControl] 명령어 전송 시도:', command);

    if (!this.moduleAvailable) {
      console.warn('YouTubeController 모듈을 사용할 수 없습니다. 모의 모드로 동작합니다.');

      // 모의 모드에서도 서버에 보고
      this.wsManager.sendYouTubeCommandReport(command, 'success');

      /*
      if (typeof alert !== 'undefined') {
        // 조용한 모드를 위해 알림 제거
        // alert(`[모의 모드] "${command}" 명령을 받았습니다.\n\n실제 YouTube 제어를 위해서는:\n1. 개발자 빌드 필요\n2. 네이티브 모듈 구현 필요\n3. 접근성 서비스 활성화 필요`);
      }
      */
      return Promise.resolve();
    }

    try {
      await YouTubeController.sendCommand(command);
      console.log('✅ [YouTubeControl] 명령어 실행 성공:', command);

      // 서버에 성공 보고
      this.wsManager.sendYouTubeCommandReport(command, 'success');
    } catch (error) {
      console.error('❌ [YouTubeControl] 명령어 실행 실패:', error);

      // 서버에 실패 보고
      this.wsManager.sendYouTubeCommandReport(command, 'failed');
      throw new Error(`명령 전송 실패: ${error.message}`);
    }
  }

  // YouTube 앱 열기
  async openYouTube() {
    console.log('🎬 [YouTubeControl] YouTube 앱 열기 시도');
    const command = 'OPEN_APP';

    if (!this.moduleAvailable) {
      console.warn('YouTubeController 모듈을 사용할 수 없습니다. Linking으로 시도합니다.');
      try {
        await Linking.openURL('youtube://');
        console.log('✅ [YouTubeControl] YouTube 앱 연결됨 (Linking)');
        this.wsManager.sendYouTubeCommandReport(command, 'success');
        return;
      } catch (error) {
        console.warn('YouTube app not installed, opening in browser...');
        await Linking.openURL('https://youtube.com');
        this.wsManager.sendYouTubeCommandReport(command, 'success');
        return;
      }
    }

    try {
      await YouTubeController.openYouTube();
      console.log('✅ [YouTubeControl] YouTube 앱 열기 성공');
      this.wsManager.sendYouTubeCommandReport(command, 'success');
    } catch (error) {
      console.error('❌ [YouTubeControl] YouTube 앱 열기 실패:', error);
      this.wsManager.sendYouTubeCommandReport(command, 'failed');
      throw new Error(`YouTube 열기 실패: ${error.message}`);
    }
  }

  // 접근성 설정 열기
  async openAccessibilitySettings() {
    console.log('Opening accessibility settings...');

    if (!this.moduleAvailable) {
      console.warn('YouTubeController 모듈을 사용할 수 없습니다. Settings로 시도합니다.');
      // 모의 모드: 안드로이드 설정 열기
      try {
        await Linking.openSettings();
        console.log('Settings opened via Linking');
        return;
      } catch (error) {
        console.error('Settings open error:', error);
        throw new Error(`설정 열기 실패: ${error.message}`);
      }
    }

    try {
      await YouTubeController.openAccessibilitySettings();
      console.log('Accessibility settings opened successfully');
    } catch (error) {
      console.error('Accessibility settings open error:', error);
      throw new Error(`설정 열기 실패: ${error.message}`);
    }
  }
}

// 싱글톤 인스턴스
const youtubeControl = new YouTubeControlWrapper();

export default youtubeControl;
