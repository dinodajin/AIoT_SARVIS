import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export class ForegroundService {
  private static instance: ForegroundService;
  private isRunning = false;

  static getInstance(): ForegroundService {
    if (!ForegroundService.instance) {
      ForegroundService.instance = new ForegroundService();
    }
    return ForegroundService.instance;
  }

  async start(): Promise<boolean> {
    if (this.isRunning || Platform.OS !== 'android') {
      return true;
    }

    try {
      // 알림 권한 요청
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Foreground Service: 알림 권한이 거부됨');
        return false;
      }

      // Foreground Service 시작 - 우선순위를 HIGH로 설정하여 백그라운드에서도 유지
      await Notifications.setNotificationChannelAsync('websocket-service', {
        name: 'SARVIS 실시간 연결',
        importance: Notifications.AndroidImportance.HIGH, // HIGH로 변경하여 백그라운드 유지
        sound: null,
        enableVibrate: false,
        showBadge: false,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });

      // 알림 표시하여 Foreground Service 시작
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'SARVIS 실행 중',
          body: '실시간 음성 명령 대기 중...',
          data: { type: 'foreground-service' },
          priority: Notifications.AndroidNotificationPriority.HIGH, // HIGH로 변경
          sound: undefined,
          sticky: true, // 알림을 고정하여 제거되지 않도록 설정
        },
        trigger: null, // 즉시 표시
        identifier: 'foreground-service-notification',
      });

      this.isRunning = true;
      console.log('✅ Foreground Service 시작됨 (HIGH 우선순위)');
      return true;

    } catch (error) {
      console.error('❌ Foreground Service 시작 실패:', error);
      return false;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // 알림 제거
      await Notifications.dismissNotificationAsync('foreground-service-notification');
      this.isRunning = false;
      console.log('⏹️ Foreground Service 중지됨');
    } catch (error) {
      console.error('❌ Foreground Service 중지 실패:', error);
    }
  }

  async updateNotification(status: string): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'SARVIS 실행 중',
          body: status,
          data: { type: 'foreground-service' },
          priority: Notifications.AndroidNotificationPriority.HIGH,
          sound: undefined,
          sticky: true,
        },
        trigger: null,
        identifier: 'foreground-service-notification',
      });
    } catch (error) {
      console.error('❌ 알림 업데이트 실패:', error);
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

export const foregroundService = ForegroundService.getInstance();
