/**
 * YouTube Handsfree Control Module (Jetson Server Integration)
 * 
 * 기능:
 * - Jetson 서버에서 음성 인식 결과를 WebSocket으로 수신
 * - 음성 명령어 처리 및 YouTube 제어
 * - 명령어 기록 관리
 * - 실시간 상태 업데이트
 * 
 * 아키텍처:
 * 1. Jetson 서버: 음성 인식 수행 → WebSocket으로 텍스트 전송
 * 2. 이 모듈: WebSocket으로 텍스트 수신 → 명령어 해석 → YouTube 제어
 * 
 * @author SARVIS Team
 * @version 2.0 (Jetson Server Integration)
 */

import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { getWebSocketManager } from '../api/websocket';
import { VoiceRecognitionMessage } from '../api/types';

const { YouTubeControlModule } = NativeModules;

// 명령어 매핑
const COMMANDS = {
  // 재생 제어
  PLAY: ['재생', '플레이', '시작', 'play', 'start'],
  PAUSE: ['일시정지', '멈춰', '정지', 'pause', 'stop'],
  // 볼륨 제어
  VOLUME_UP: ['볼륨 높여', '볼륨 업', '크게', '소리 크게', 'volume up', 'louder'],
  VOLUME_DOWN: ['볼륨 낮춰', '볼륨 다운', '작게', '소리 작게', 'volume down', 'quieter'],
  VOLUME_MUTE: ['음소거', '뮤트', 'mute'],
  // 네비게이션
  NEXT: ['다음', '넘겨', 'next', 'skip'],
  PREVIOUS: ['이전', '뒤로', 'previous', 'back'],
  // 시크
  SEEK_FORWARD: ['앞으로', '빨리감기', 'forward', 'fast forward'],
  SEEK_BACKWARD: ['뒤로', '되감기', 'backward', 'rewind'],
  // 플레이리스트
  SHUFFLE: ['셔플', '섞어', 'shuffle', 'random'],
  REPEAT: ['반복', '리핏', 'repeat'],
  // 기타
  FULLSCREEN: ['전체화면', '풀스크린', 'fullscreen'],
  EXIT_FULLSCREEN: ['나가기', '창모드', 'exit'],
};

/**
 * YouTube 핸즈프리 제어 클래스
 */
class YouTubeHandsfreeControl {
  constructor() {
    this.isActive = false;
    this.isEnabled = false;
    this.commandHistory = [];
    this.lastCommandTime = null;
    this.wsManager = null;
    this.handlers = {};
    this.sessionId = null;
    this.maxHistorySize = 50;
  }

  /**
   * 핸즈프리 제어 초기화
   * @param {Object} options - 초기화 옵션
   * @param {string} options.sessionId - WebSocket 연결 세션 ID
   * @param {Function} options.onCommand - 명령어 실행 콜백
   * @param {Function} options.onStateChange - 상태 변경 콜백
   * @param {Function} options.onError - 에러 콜백
   */
  async initialize(options = {}) {
    try {
      console.log('🎬 YouTube Handsfree Control 초기화 시작...');

      const {
        sessionId,
        onCommand,
        onStateChange,
        onError
      } = options;

      if (!sessionId) {
        throw new Error('sessionId가 필요합니다.');
      }

      this.sessionId = sessionId;
      this.handlers = { onCommand, onStateChange, onError };

      // WebSocket 매니저 초기화
      this.wsManager = getWebSocketManager();

      // 음성 인식 결과 수신 핸들러 설정
      this.wsManager.connect(sessionId, {
        onConnected: (message) => {
          console.log('✅ WebSocket 연결 성공:', message.session_id);
          this._notifyStateChange({
            isActive: true,
            isConnected: true,
            sessionId: message.session_id,
            message: 'Jetson 서버와 연결되었습니다'
          });
        },
        onVoiceRecognition: (message) => {
          console.log('🎤 음성 인식 결과:', message.text);
          this._processVoiceCommand(message.text);
        },
        onError: (error) => {
          console.error('❌ WebSocket 에러:', error);
          this._notifyError('WebSocket 연결 에러: ' + error.message);
          this._notifyStateChange({
            isActive: true,
            isConnected: false,
            message: '서버 연결 실패'
          });
        },
        onDisconnected: () => {
          console.log('🔌 WebSocket 연결 종료');
          this._notifyStateChange({
            isActive: true,
            isConnected: false,
            message: '서버 연결이 끊어졌습니다'
          });
        }
      });

      // 권한 상태 확인
      const hasPermissions = await this._checkPermissions();

      if (!hasPermissions) {
        console.warn('⚠️ 필요한 권한이 없습니다.');
        this._notifyError('필요한 권한이 없습니다');
        return false;
      }

      this.isEnabled = true;
      this.isActive = false;

      console.log('✅ YouTube Handsfree Control 초기화 완료');
      return true;

    } catch (error) {
      console.error('❌ 초기화 실패:', error);
      this._notifyError(error.message);
      return false;
    }
  }

  /**
   * 핸즈프리 제어 시작
   */
  async start() {
    try {
      if (!this.isEnabled) {
        throw new Error('핸즈프리 제어가 초기화되지 않았습니다');
      }

      if (this.isActive) {
        console.warn('⚠️ 핸즈프리 제어가 이미 활성화되어 있습니다');
        return true;
      }

      console.log('🎬 핸즈프리 제어 시작...');

      // 연결 상태 확인
      if (!this.wsManager.isConnected()) {
        throw new Error('WebSocket이 연결되지 않았습니다');
      }

      // 네이티브 모듈 초기화
      if (YouTubeControlModule && typeof YouTubeControlModule.initialize === 'function') {
        await YouTubeControlModule.initialize();
        console.log('✅ 네이티브 YouTube 제어 모듈 초기화 완료');
      }

      this.isActive = true;
      this._notifyStateChange({
        isActive: true,
        isConnected: true,
        message: '음성 제어가 활성화되었습니다'
      });

      console.log('✅ 핸즈프리 제어 시작 완료');
      return true;

    } catch (error) {
      console.error('❌ 핸즈프리 제어 시작 실패:', error);
      this._notifyError(error.message);
      return false;
    }
  }

  /**
   * 핸즈프리 제어 중지
   */
  stop() {
    try {
      console.log('🛑 핸즈프리 제어 중지...');

      this.isActive = false;
      this.commandHistory = [];
      this.lastCommandTime = null;

      // 네이티브 모듈 정리
      if (YouTubeControlModule && typeof YouTubeControlModule.cleanup === 'function') {
        YouTubeControlModule.cleanup();
        console.log('✅ 네이티브 모듈 정리 완료');
      }

      this._notifyStateChange({
        isActive: false,
        isConnected: this.wsManager.isConnected(),
        message: '음성 제어가 비활성화되었습니다'
      });

      console.log('✅ 핸즈프리 제어 중지 완료');
      return true;

    } catch (error) {
      console.error('❌ 핸즈프리 제어 중지 실패:', error);
      this._notifyError(error.message);
      return false;
    }
  }

  /**
   * 연결 종료
   */
  disconnect() {
    try {
      console.log('🔌 연결 종료...');

      this.stop();
      this.isEnabled = false;

      // WebSocket 연결 종료
      if (this.wsManager) {
        this.wsManager.disconnect();
      }

      console.log('✅ 연결 종료 완료');
      return true;

    } catch (error) {
      console.error('❌ 연결 종료 실패:', error);
      return false;
    }
  }

  /**
   * 음성 명령어 처리
   * @param {string} text - 인식된 텍스트
   */
  _processVoiceCommand(text) {
    try {
      console.log('🎤 명령어 처리:', text);

      // 중복 명령어 방지 (1초 이내 동일 명령어 무시)
      const currentTime = Date.now();
      if (this.lastCommandTime && currentTime - this.lastCommandTime < 1000) {
        console.warn('⚠️ 중복 명령어 무시:', text);
        return;
      }
      this.lastCommandTime = currentTime;

      // 명령어 해석
      const command = this._interpretCommand(text);

      if (!command) {
        console.warn('⚠️ 인식되지 않은 명령어:', text);
        this._notifyStateChange({
          isActive: this.isActive,
          isConnected: this.wsManager.isConnected(),
          lastRecognizedText: text,
          message: `인식되지 않은 명령어: "${text}"`
        });
        return;
      }

      console.log('🎯 명령어 해석:', command);

      // 명령어 기록 추가
      this._addCommandToHistory({
        text,
        command,
        timestamp: currentTime
      });

      // 명령어 실행
      this._executeCommand(command);

      // 상태 업데이트
      this._notifyStateChange({
        isActive: this.isActive,
        isConnected: this.wsManager.isConnected(),
        lastRecognizedText: text,
        lastCommand: command,
        message: `명령어 실행: ${command}`
      });

    } catch (error) {
      console.error('❌ 명령어 처리 실패:', error);
      this._notifyError(error.message);
    }
  }

  /**
   * 텍스트를 명령어로 해석
   * @param {string} text - 인식된 텍스트
   * @returns {string|null} 명령어 또는 null
   */
  _interpretCommand(text) {
    const normalizedText = text.toLowerCase().trim();

    for (const [command, keywords] of Object.entries(COMMANDS)) {
      for (const keyword of keywords) {
        if (normalizedText.includes(keyword.toLowerCase())) {
          return command;
        }
      }
    }

    return null;
  }

  /**
   * 명령어 실행
   * @param {string} command - 실행할 명령어
   * @returns {boolean} 실행 성공 여부
   */
  _executeCommand(command) {
    try {
      console.log('⚡ 명령어 실행:', command);

      // ✅ WebSocket 연결 상태 확인
      if (!this.wsManager) {
        console.error('❌ WebSocket 매니저가 초기화되지 않았습니다');
        this._notifyError('서버 연결 미초기화');
        return false;
      }

      if (!this.wsManager.isConnected()) {
        console.warn('⚠️ WebSocket이 연결되지 않았습니다. 명령어를 실행하지만 서버 보고는 불가능합니다.');
        this._notifyStateChange({
          isActive: this.isActive,
          isConnected: false,
          message: '⚠️ 서버 연결 끊김 - 명령어만 실행됨'
        });
      }

      // 네이티브 모듈이 있는 경우 사용
      if (YouTubeControlModule) {
        switch (command) {
          case 'PLAY':
            YouTubeControlModule.play();
            break;
          case 'PAUSE':
            YouTubeControlModule.pause();
            break;
          case 'VOLUME_UP':
            YouTubeControlModule.volumeUp();
            break;
          case 'VOLUME_DOWN':
            YouTubeControlModule.volumeDown();
            break;
          case 'VOLUME_MUTE':
            YouTubeControlModule.toggleMute();
            break;
          case 'NEXT':
            YouTubeControlModule.next();
            break;
          case 'PREVIOUS':
            YouTubeControlModule.previous();
            break;
          case 'SEEK_FORWARD':
            YouTubeControlModule.seekForward();
            break;
          case 'SEEK_BACKWARD':
            YouTubeControlModule.seekBackward();
            break;
          case 'SHUFFLE':
            YouTubeControlModule.toggleShuffle();
            break;
          case 'REPEAT':
            YouTubeControlModule.toggleRepeat();
            break;
          case 'FULLSCREEN':
            YouTubeControlModule.enterFullscreen();
            break;
          case 'EXIT_FULLSCREEN':
            YouTubeControlModule.exitFullscreen();
            break;
          default:
            console.warn('⚠️ 알 수 없는 명령어:', command);
            return false;
        }

        // ✅ 서버에 명령어 실행 결과 보고
        this.wsManager.sendYouTubeCommandReport(command, 'success');
        console.log(`📺 YouTube 명령어 실행 보고 전송: ${command}`);
        return true;
      } else {
        console.warn('⚠️ YouTubeControlModule이 없습니다');
        // 이벤트로 대체 전달
        DeviceEventEmitter.emit('YouTubeCommand', command);
        
        // ✅ 서버에 모의 실행 결과 보고
        this.wsManager.sendYouTubeCommandReport(command, 'success');
        console.log(`📺 YouTube 명령어 모의 실행 보고 전송: ${command}`);
        return true;
      }

    } catch (error) {
      console.error('❌ 명령어 실행 실패:', error);
      
      // ✅ 서버에 실패 결과 보고
      if (this.wsManager && this.wsManager.isConnected()) {
        this.wsManager.sendYouTubeCommandReport(command, 'failed');
        console.log(`📺 YouTube 명령어 실행 실패 보고 전송: ${command}`);
      } else {
        console.warn('⚠️ 서버 미연결 상태로 실패 보고를 보낼 수 없습니다');
      }
      
      this._notifyError(`명령어 실행 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * 명령어 기록 추가
   * @param {Object} entry - 기록 항목
   */
  _addCommandToHistory(entry) {
    this.commandHistory.unshift(entry);

    // 기록 크기 제한
    if (this.commandHistory.length > this.maxHistorySize) {
      this.commandHistory = this.commandHistory.slice(0, this.maxHistorySize);
    }

    console.log('📝 명령어 기록:', entry);
  }

  /**
   * 명령어 기록 가져오기
   * @param {number} limit - 가져올 기록 수
   * @returns {Array} 명령어 기록
   */
  getCommandHistory(limit = 10) {
    return this.commandHistory.slice(0, limit);
  }

  /**
   * 사용 가능한 명령어 목록 반환
   * @returns {Object} 명령어 목록
   */
  getAvailableCommands() {
    return COMMANDS;
  }

  /**
   * 현재 상태 반환
   * @returns {Object} 현재 상태
   */
  getStatus() {
    return {
      isActive: this.isActive,
      isEnabled: this.isEnabled,
      isConnected: this.wsManager ? this.wsManager.isConnected() : false,
      commandHistoryCount: this.commandHistory.length,
      sessionId: this.sessionId
    };
  }

  /**
   * 권한 확인
   * @returns {Promise<boolean>} 권한 여부
   */
  async _checkPermissions() {
    try {
      // React Native에서는 권한 확인 로직 필요
      // 여기서는 항상 true 반환 (실제 구현 시 권한 확인 필요)
      return true;
    } catch (error) {
      console.error('❌ 권한 확인 실패:', error);
      return false;
    }
  }

  /**
   * 상태 변경 알림
   * @param {Object} state - 새 상태
   */
  _notifyStateChange(state) {
    if (this.handlers.onStateChange) {
      this.handlers.onStateChange(state);
    }

    // 이벤트로도 전달
    DeviceEventEmitter.emit('YouTubeHandsfreeStateChange', state);
  }

  /**
   * 에러 알림
   * @param {string} error - 에러 메시지
   */
  _notifyError(error) {
    console.error('❌ 에러:', error);
    if (this.handlers.onError) {
      this.handlers.onError(error);
    }

    // 이벤트로도 전달
    DeviceEventEmitter.emit('YouTubeHandsfreeError', error);
  }

  /**
   * 이벤트 리스너 추가
   * @param {string} event - 이벤트 이름
   * @param {Function} handler - 핸들러 함수
   */
  addListener(event, handler) {
    return DeviceEventEmitter.addListener(event, handler);
  }

  /**
   * 이벤트 리스너 제거
   * @param {string} event - 이벤트 이름
   */
  removeListener(event) {
    DeviceEventEmitter.removeAllListeners(event);
  }
}

// 싱글톤 인스턴스
const handsfreeControl = new YouTubeHandsfreeControl();

export default handsfreeControl;