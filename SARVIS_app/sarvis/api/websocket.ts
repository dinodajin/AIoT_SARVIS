// api/websocket.ts

import { API_CONFIG } from '../constants/config';
import { foregroundService } from '../services/ForegroundService';
import {
  ConnectionEstablishedMessage,
  VoiceCommandMessage,
  WebSocketMessage,
  YouTubeCommandAckMessage,
  YouTubeCommandMessage,
  YouTubeCommandReportMessage,
} from './types';

/**
 * WebSocket 연결 상태
 */
export enum WebSocketState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
}

/**
 * WebSocket 이벤트 핸들러
 */
export interface WebSocketHandlers {
  onConnected?: (message: ConnectionEstablishedMessage) => void;
  onVoiceCommand?: (message: VoiceCommandMessage) => void;
  onYouTubeCommand?: (message: YouTubeCommandMessage) => void;
  onError?: (error: Error) => void;
  onDisconnected?: () => void;
}

/**
 * WebSocket 매니저
 * 
 * 기능:
 * - WebSocket 연결 관리
 * - 연결 상태 모니터링
 * - 자동 재연결 (선택적)
 */
export class WebSocketManager {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private state: WebSocketState = WebSocketState.DISCONNECTED;
  private handlers: WebSocketHandlers = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 9999; // 사실상 무한 재연결 시도 (백그라운드 유지용)
  private heartbeatInterval: any = null; // Heartbeat 타이머 (React Native에서는 any 사용)
  private readonly HEARTBEAT_INTERVAL = 30000; // 30초마다 핑 전송

  /**
   * WebSocket 연결 시작
   * @param sessionId 연결 세션 ID
   * @param handlers 이벤트 핸들러
   */
  async connect(sessionId: string, handlers: WebSocketHandlers = {}): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('⚠️ WebSocket이 이미 연결되어 있습니다.');
      return;
    }

    // Foreground Service 시작
    await foregroundService.start();
    await foregroundService.updateNotification('서버 연결 시도 중...');

    this.sessionId = sessionId;
    this.handlers = handlers;
    this.state = WebSocketState.CONNECTING;

    // WebSocket URL 생성
    // 주의: React Native에서는 ws://가 아닌 ws://를 사용해야 함
    console.log('🔍 WebSocket 연결에 사용될 sessionId:', sessionId);
    const wsUrl = `ws://${API_CONFIG.EC2_URL.replace('http://', '').replace('https://', '')}/ws/app/${sessionId}/`;
    console.log('🔌 WebSocket 연결 시도:', wsUrl);

    try {
      this.ws = new WebSocket(wsUrl);

      // 연결 성공
      this.ws.onopen = () => {
        console.log('✅ WebSocket 연결 성공');
        this.state = WebSocketState.CONNECTED;
        this.reconnectAttempts = 0;
        foregroundService.updateNotification('실시간 음성 명령 대기 중...');

        // Heartbeat 시작
        this.startHeartbeat();
      };

      // 메시지 수신
      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('📨 WebSocket 메시지 수신:', message);

          // 메시지 타입별 핸들러 호출
          switch (message.type) {
            case 'connection_established':
              this.handlers.onConnected?.(message as ConnectionEstablishedMessage);
              break;

            case 'voice_command':
              console.log('🎤 음성 명령 수신:', (message as VoiceCommandMessage).command);
              foregroundService.updateNotification('음성 명령 처리 중...');
              this.handlers.onVoiceCommand?.(message as VoiceCommandMessage);
              setTimeout(() => {
                foregroundService.updateNotification('실시간 음성 명령 대기 중...');
              }, 2000);
              break;

            case 'youtube_command':
              console.log('📺 유튜브 명령 수신:', (message as YouTubeCommandMessage).command);
              foregroundService.updateNotification('유튜브 명령 처리 중...');
              this.handlers.onYouTubeCommand?.(message as YouTubeCommandMessage);
              setTimeout(() => {
                foregroundService.updateNotification('실시간 음성 명령 대기 중...');
              }, 2000);
              break;

            case 'voice_call_confirmation_ack':
              console.log('✅ 서버로부터 음성 호출 확인 응답 수신');
              break;

            case 'youtube_command_confirmation_ack':
            case 'youtube_command_report_ack':
              console.log('✅ 서버로부터 유튜브 명령 확인 응답 수신:', (message as any).message);
              break;

            case 'pong':
              console.log('✅ 서버로부터 Pong 응답 수신');
              break;

            default:
              console.log('❓ 알 수 없는 메시지 타입:', (message as any).type);
          }
        } catch (error) {
          console.error('❌ WebSocket 메시지 파싱 에러:', error);
        }
      };

      // 에러 발생
      this.ws.onerror = (error) => {
        console.log('❌ WebSocket 에러 발생');
        this.state = WebSocketState.ERROR;
        this.handlers.onError?.(new Error('WebSocket 연결 에러'));
      };

      // 연결 종료
      this.ws.onclose = () => {
        console.log('🔌 WebSocket 연결 종료');
        this.state = WebSocketState.DISCONNECTED;
        this.handlers.onDisconnected?.();

        // Heartbeat 중지
        this.stopHeartbeat();

        // 자동 재연결 (선택적)
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          console.log(`🔄 재연결 시도 (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
          this.reconnectAttempts++;
          setTimeout(() => {
            if (this.sessionId) {
              this.connect(this.sessionId, this.handlers);
            }
          }, 3000); // 3초 후 재연결
        }
      };
    } catch (error) {
      console.error('❌ WebSocket 연결 실패:', error);
      this.state = WebSocketState.ERROR;
      this.handlers.onError?.(error instanceof Error ? error : new Error('WebSocket 연결 실패'));
    }
  }

  /**
   * 음성 호출 확인 메시지 전송
   * - 서버가 음성 호출 트리거 후 앱의 확인을 대기할 때 사용
   */
  sendVoiceCommandAck(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ WebSocket이 연결되지 않아 확인 메시지를 보낼 수 없습니다.');
      return;
    }

    const ackMessage = {
      type: 'voice_call_confirmation',
      timestamp: new Date().toISOString()
    };

    try {
      this.ws.send(JSON.stringify(ackMessage));
      console.log('🎤 음성 호출 확인(voice_call_confirmation) 전송 완료');
    } catch (error) {
      console.error('❌ 음성 호출 확인 전송 실패:', error);
    }
  }

  /**
   * 유튜브 명령 실행 결과 전송
   * - 서버가 유튜브 제어 명령 후 앱의 실행 결과를 대기할 때 사용
   */
  sendYouTubeCommandAck(status: 'success' | 'failed'): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ WebSocket이 연결되지 않아 유튜브 확인 메시지를 보낼 수 없습니다.');
      return;
    }

    const ackMessage: YouTubeCommandAckMessage = {
      type: 'youtube_command_ack',
      data: {
        status,
        timestamp: new Date().toISOString()
      }
    };
    33
    try {
      this.ws.send(JSON.stringify(ackMessage));
      console.log(`📺 유튜브 명령 결과(${status}) 전송 완료`);
    } catch (error) {
      console.error('❌ 유튜브 명령 결과 전송 실패:', error);
    }
  }

  /**
   * 유튜브 명령 실행 결과 보고 전송
   * - 앱에서 직접(수동/음성) 실행한 유튜브 명령 정보를 서버에 보고
   */
  sendYouTubeCommandReport(command: string, status: 'success' | 'failed'): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const reportMessage: YouTubeCommandReportMessage = {
      type: 'youtube_command_report',
      command,
      status,
      timestamp: new Date().toISOString()
    };

    try {
      this.ws.send(JSON.stringify(reportMessage));
      console.log(`📺 유튜브 명령 실행 보고(${command}, ${status}) 전송 완료`);
    } catch (error) {
      console.error('❌ 유튜브 명령 실행 보고 전송 실패:', error);
    }
  }

  /**
   * WebSocket 연결 종료
   */
  async disconnect(): Promise<void> {
    console.log('🔌 WebSocket 연결 종료 요청');

    this.reconnectAttempts = this.maxReconnectAttempts; // 재연결 방지

    // Heartbeat 중지
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.state = WebSocketState.DISCONNECTED;

    // Foreground Service 중지
    await foregroundService.stop();
  }

  /**
   * 연결 상태 조회
   */
  getState(): WebSocketState {
    return this.state;
  }

  /**
   * 연결 여부 확인
   */
  isConnected(): boolean {
    return this.state === WebSocketState.CONNECTED &&
      this.ws !== null &&
      this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Heartbeat 시작 (연결 유지용)
   */
  private startHeartbeat(): void {
    // 기존 타이머가 있으면 정리
    this.stopHeartbeat();

    // 30초마다 핑 전송
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        this.sendPing();
      }
    }, this.HEARTBEAT_INTERVAL);

    console.log('💓 Heartbeat 시작 (30초 간격)');
  }

  /**
   * Heartbeat 중지
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('💔 Heartbeat 중지');
    }
  }

  /**
   * 핑 메시지 전송 (연결 유지용)
   */
  private sendPing(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const pingMessage = {
        type: 'ping',
        timestamp: new Date().toISOString()
      };
      this.ws.send(JSON.stringify(pingMessage));
      console.log('🏓 Ping 전송 (연결 유지)');
    } catch (error) {
      console.error('❌ Ping 전송 실패:', error);
    }
  }
}

/**
 * 싱글톤 인스턴스
 */
let wsManagerInstance: WebSocketManager | null = null;

/**
 * WebSocket 매니저 싱글톤 반환
 */
export function getWebSocketManager(): WebSocketManager {
  if (!wsManagerInstance) {
    wsManagerInstance = new WebSocketManager();
  }
  return wsManagerInstance;
}