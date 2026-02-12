// utils/voiceCommandHandler.ts
import * as Notifications from 'expo-notifications';
import { Platform, Vibration } from 'react-native';

// 알림 핸들러 설정 (앱 실행 중에도 알림 표시)
Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
        const isForegroundService = notification.request.content.data?.type === 'foreground-service';

        return {
            shouldPlaySound: !isForegroundService, // 서비스 알림은 무음
            shouldSetBadge: false,
            shouldShowBanner: !isForegroundService, // 서비스 알림은 배너 숨김
            shouldShowList: true,
        };
    },
});

/**
 * 음성 명령 핸들러
 * Jetson → EC2 → 앱으로 전달되는 음성 명령 처리
 */

let isInitialized = false;

/**
 * 음성 명령 핸들러 초기화
 */
export async function initVoiceHandler(): Promise<void> {
    if (isInitialized) return;

    // 중요 알림 채널 설정 (소리/진동 활성화)
    await Notifications.setNotificationChannelAsync('default', {
        name: '기본 알림',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default', // 기본 알림음 사용
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    console.log('✅ 음성 핸들러 초기화 완료 (알림 채널 설정됨)');
    isInitialized = true;
}

/**
 * 진동 패턴 실행 (짧고 경쾌하게)
 */
export function triggerVibration(pattern?: number[]): void {
    try {
        // '띠링'에 어울리는 짧은 진동 (100ms)
        const vibrationPattern = pattern || [0, 100];

        if (Platform.OS === 'android') {
            Vibration.vibrate(vibrationPattern[1]);
        } else {
            Vibration.vibrate();
        }

        console.log('📳 짧은 진동 실행');
    } catch (error) {
        console.warn('⚠️ 진동 실행 실패:', error);
    }
}

/**
 * 음성 명령 수신 시 실행되는 메인 핸들러
 * @param command 음성 명령 (예: "SARVIS")
 * @param timestamp 명령 수신 시간
 * @param callbacks 추가 콜백 함수들
 */
export async function handleVoiceCommand(
    command: string,
    timestamp: string,
    callbacks?: {
        onUINotification?: (command: string) => void;
    },
    options?: {
        silent?: boolean;
    }
): Promise<void> {
    console.log('🎤 음성 명령 처리 시작:', command, 'at', timestamp);

    const isSilent = options?.silent === true;

    // Silent 모드 (유튜브 등)일 때는 진동과 알림을 완전히 비활성화
    if (isSilent) {
        console.log('🔇 조용한 모드: 진동 및 알림 없이 명령만 실행');

        // UI 알림 콜백만 실행 (필요 시)
        if (callbacks?.onUINotification) {
            callbacks.onUINotification(command);
        }

        console.log('✅ 음성 명령 처리 완료 (조용한 모드):', command);
        return;
    }

    // 음성 호출("SARVIS")일 때만 진동과 알림 실행
    // 1. 진동 (즉시 실행)
    triggerVibration();

    // 2. Expo Notifications 알림 (상단 팝업)
    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: '🎤 SARVIS 호출 감지!',
                body: `"${command}" 호출을 확인했습니다.`,
                sound: 'default',
                data: { command, timestamp },
                priority: Notifications.AndroidNotificationPriority.MAX,
                vibrate: [0, 500, 200, 500],
            },
            trigger: null, // 즉시 표시
        });
    } catch (e) {
        console.error('Notification Error:', e);
    }

    // 3. UI 알림 콜백 실행 (필요 시)
    if (callbacks?.onUINotification) {
        callbacks.onUINotification(command);
    }

    console.log('✅ 음성 명령 처리 완료:', command);
}
