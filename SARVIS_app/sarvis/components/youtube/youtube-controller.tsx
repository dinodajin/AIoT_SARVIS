import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Platform, Linking, TouchableOpacity } from 'react-native';
import YouTubeControl from '../../modules/YouTubeControlModule';

interface YouTubeControllerProps {
    isEnabled: boolean;
    onCommand?: () => void;
}

export default function YouTubeController({ isEnabled, onCommand }: YouTubeControllerProps) {
    const [error, setError] = useState('');
    const [lastCommand, setLastCommand] = useState('');
    const [serviceEnabled, setServiceEnabled] = useState(false);

    useEffect(() => {
        checkServiceStatus();
    }, []);

    // 접근성 서비스 상태 확인
    const checkServiceStatus = async () => {
        try {
            const enabled = await YouTubeControl.isServiceEnabled();
            setServiceEnabled(enabled);
        } catch (error) {
            console.error('서비스 상태 확인 실패:', error);
        }
    };

    // YouTube 제어 명령 전송
    const sendCommand = async (command: string) => {
        if (!serviceEnabled) {
            Alert.alert(
                '접근성 서비스 필요',
                'YouTube 제어를 위해 접근성 서비스를 활성화해주세요\n\n설정 > 접근성 > 설치된 앱 > SARVIS > 사용',
                [
                    { text: '취소', style: 'cancel' },
                    { text: '설정 열기', onPress: openSettings }
                ]
            );
            return;
        }

        try {
            await YouTubeControl.sendCommand(command);
            setLastCommand(command);
            onCommand?.();
        } catch (error: any) {
            console.error('Command send error:', error);
            Alert.alert('에러', `명령 전송 실패: ${error?.message || '알 수 없는 오류'}`);
        }
    };

    // YouTube 앱 열기
    const openYouTube = async () => {
        try {
            await YouTubeControl.openYouTube();
        } catch (error: any) {
            console.error('YouTube open error:', error);
            Alert.alert('에러', `YouTube 열기 실패: ${error?.message || '알 수 없는 오류'}`);
        }
    };

    // 접근성 설정 열기
    const openSettings = () => {
        YouTubeControl.openAccessibilitySettings().catch((err: any) => {
            console.error('Failed to open settings:', err);
            Linking.openSettings();
        });
    };

    // 음성 명령 처리
    const processCommand = async (text: string): Promise<boolean> => {
        if (!isEnabled) return false;

        const lowerText = text.toLowerCase();
        let command = '';

        if (lowerText.includes('재생') || lowerText.includes('play')) {
            command = 'play';
        } else if (lowerText.includes('일시정지') || lowerText.includes('pause') || lowerText.includes('멈춰')) {
            command = 'pause';
        } else if (lowerText.includes('앞으로') || lowerText.includes('forward')) {
            command = lowerText.includes('30') ? 'forward30' : 'forward10';
        } else if (lowerText.includes('뒤로') || lowerText.includes('backward')) {
            command = lowerText.includes('30') ? 'backward30' : 'backward10';
        } else if (lowerText.includes('전체화면') || lowerText.includes('fullscreen')) {
            command = 'fullscreen';
        } else if (lowerText.includes('최소화') || lowerText.includes('mini')) {
            command = 'mini';
        } else if (lowerText.includes('볼륨')) {
            command = lowerText.includes('올려') ? 'volumeup' : 'volumedown';
        } else if (lowerText.includes('음소거') || lowerText.includes('mute')) {
            command = 'mute';
        } else if (lowerText.includes('다음') || lowerText.includes('next')) {
            command = 'next';
        } else if (lowerText.includes('이전') || lowerText.includes('previous')) {
            command = 'previous';
        }

        if (command) {
            await sendCommand(command);
            return true;
        }
        return false;
    };

    return (
        <View style={styles.container}>
            {error ? (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            ) : null}
        </View>
    );
}

// Export utility functions for external use
export { YouTubeController };
export const youtubeCommands = {
    sendCommand: async (command: string) => YouTubeControl.sendCommand(command),
    openYouTube: async () => YouTubeControl.openYouTube(),
    openSettings: async () => YouTubeControl.openAccessibilitySettings(),
    isServiceEnabled: async () => YouTubeControl.isServiceEnabled(),
};

const styles = StyleSheet.create({
    container: {
        marginTop: 10,
    },
    errorContainer: {
        backgroundColor: '#ffebee',
        padding: 10,
        borderRadius: 8,
    },
    errorText: {
        fontSize: 12,
        color: '#c62828',
        textAlign: 'center',
    },
});
