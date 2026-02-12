import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, NativeModules, PermissionsAndroid, Platform } from 'react-native';

const { AccessibilityModule, YoutubeControlModule } = NativeModules;

/**
 * 앱 최초 실행 시 모든 권한 요청
 */
export async function requestAllPermissions(): Promise<void> {
    if (Platform.OS !== 'android') {
        console.log('Android 전용 기능입니다.');
        return;
    }

    try {
        // 1. 카메라, 마이크 권한 요청
        await requestCameraAndMicPermissions();

        // 3. 백그라운드 응답을 위한 설정 (알림 및 배터리 최적화 제외)
        // 이미 설정을 완료했는지 확인 후 요청
        const isBatterySet = await AsyncStorage.getItem('SARVIS_BATTERY_OPTIMIZATION_SET');
        if (isBatterySet !== 'true') {
            await requestBackgroundPermissions();
        }

        // 4. 접근성 서비스 권한 안내
        await showAccessibilityPermissionDialog();

    } catch (error) {
        console.error('권한 요청 중 오류:', error);
    }
}

/**
 * 카메라 및 마이크 권한 요청
 */
export async function requestCameraAndMicPermissions(): Promise<boolean> {
    try {
        const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.CAMERA,
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);

        const cameraGranted = granted['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED;
        const micGranted = granted['android.permission.RECORD_AUDIO'] === PermissionsAndroid.RESULTS.GRANTED;

        if (!cameraGranted) {
            console.warn('카메라 권한이 거부되었습니다.');
        }
        if (!micGranted) {
            console.warn('마이크 권한이 거부되었습니다.');
        }

        return cameraGranted && micGranted;
    } catch (error) {
        console.error('카메라/마이크 권한 요청 실패:', error);
        return false;
    }
}

/**
 * 위치 권한 요청 (와이파이 SSID 확인용)
 */
export async function requestLocationPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
        console.log('[Permissions] Starting requestLocationPermission...');

        // 1. 현재 권한 상태 체크
        const fineCheck = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        const coarseCheck = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);

        console.log('[Permissions] Initial Check - Fine:', fineCheck, 'Coarse:', coarseCheck);

        if (fineCheck || coarseCheck) {
            console.log('[Permissions] At least one location permission is already granted.');
            return true;
        }

        // 2. 권한 요청
        console.log('[Permissions] Requesting permissions now...');
        const results = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);

        console.log('[Permissions] Request Results:', JSON.stringify(results));

        const fineGranted = results['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED;
        const coarseGranted = results['android.permission.ACCESS_COARSE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED;

        if (fineGranted || coarseGranted) {
            console.log('[Permissions] Permission GRANTED');
            return true;
        }

        // 3. 거부된 경우 (이미 '다시 묻지 않음' 상태일 가능성 포함)
        console.log('[Permissions] Permission DENIED. Showing fallback alert.');
        return new Promise((resolve) => {
            Alert.alert(
                '위치 권한 필요',
                '와이파이 이름을 확인하려면 "위치" 권한이 반드시 필요합니다. 설정창에서 권한을 허용해주세요.',
                [
                    {
                        text: '취소',
                        onPress: () => {
                            console.log('[Permissions] User cancelled fallback alert');
                            resolve(false);
                        },
                        style: 'cancel'
                    },
                    {
                        text: '설정 열기',
                        onPress: async () => {
                            console.log('[Permissions] Opening App Settings...');
                            await Linking.openSettings();
                            resolve(false); // 설정 창으로 보냈으므로 현재는 false
                        }
                    }
                ]
            );
        });
    } catch (error) {
        console.error('[Permissions] Error in requestLocationPermission:', error);
        return false;
    }
}

/**
 * 알림 권한 요청 (Android 13+)
 */
export async function requestNotificationPermission(): Promise<boolean> {
    try {
        const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );

        const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
        if (!isGranted) {
            console.warn('알림 권한이 거부되었습니다.');
        }

        return isGranted;
    } catch (error) {
        console.error('알림 권한 요청 실패:', error);
        return false;
    }
}

/**
 * 접근성 서비스 권한 안내 팝업
 */
export async function showAccessibilityPermissionDialog(): Promise<void> {
    if (Platform.OS !== 'android') return;

    // 1. 사용자가 이미 "설정 완료"를 눌렀는지 확인 (다시 묻지 않음)
    const isAlreadySet = await AsyncStorage.getItem('SARVIS_ACCESSIBILITY_SET');
    if (isAlreadySet === 'true') {
        console.log('[Permissions] User marked accessibility as set.');
        return;
    }

    // 2. 실제 서비스 활성화 여부 확인 (이미 켜져 있으면 자동 저장)
    const isEnabled = await checkAccessibilityPermission();
    if (isEnabled) {
        console.log('[Permissions] Accessibility Service is already enabled.');
        await AsyncStorage.setItem('SARVIS_ACCESSIBILITY_SET', 'true');
        return;
    }

    return new Promise((resolve) => {
        Alert.alert(
            '유튜브 조작을 위해 접근성 권한이 필요합니다.',
            '설정 화면의 [설치된 앱] 또는 [다운로드한 서비스] 메뉴에서 "SARVIS"를 찾아 기능을 켜주세요.',
            [
                {
                    text: '취소',
                    style: 'cancel',
                    onPress: () => resolve(),
                },
                {
                    text: '설정 완료',
                    onPress: async () => {
                        await AsyncStorage.setItem('SARVIS_ACCESSIBILITY_SET', 'true');
                        resolve();
                    }
                },
                {
                    text: '설정하러 가기',
                    onPress: async () => {
                        try {
                            // 설정 완료로 간주하고 저장 (다시 묻지 않음)
                            await AsyncStorage.setItem('SARVIS_ACCESSIBILITY_SET', 'true');

                            // 네이티브 모듈 대신 리액트 네이티브 Linking 기능을 사용하여 접근성 설정창 열기
                            await Linking.sendIntent('android.settings.ACCESSIBILITY_SETTINGS');
                        } catch (error) {
                            console.error('접근성 설정 열기 실패:', error);
                            // 최후의 수단으로 일반 설정창 열기
                            Linking.openSettings();
                        }
                        resolve();
                    },
                },
            ]
        );
    });
}

/**
 * 접근성 서비스 활성화 여부 확인
 */
export async function checkAccessibilityPermission(): Promise<boolean> {
    try {
        if (AccessibilityModule) {
            return await AccessibilityModule.isAccessibilityServiceEnabled();
        }
        return false;
    } catch (error) {
        console.error('접근성 권한 확인 실패:', error);
        return false;
    }
}

/**
 * 카메라 권한 확인
 */
export async function checkCameraPermission(): Promise<boolean> {
    try {
        const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
        return granted;
    } catch (error) {
        console.error('카메라 권한 확인 실패:', error);
        return false;
    }
}

/**
 * 마이크 권한 확인
 */
export async function checkMicPermission(): Promise<boolean> {
    try {
        const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        return granted;
    } catch (error) {
        console.error('마이크 권한 확인 실패:', error);
        return false;
    }
}

/**
 * 유튜브 제어 함수들
 */
export const YoutubeControl = {
    rewind: async (): Promise<void> => {
        try {
            await YoutubeControlModule.rewind();
        } catch (error) {
            console.error('유튜브 뒤로 감기 실패:', error);
        }
    },

    forward: async (): Promise<void> => {
        try {
            await YoutubeControlModule.forward();
        } catch (error) {
            console.error('유튜브 앞으로 감기 실패:', error);
        }
    },

    togglePlay: async (): Promise<void> => {
        try {
            await YoutubeControlModule.togglePlay();
        } catch (error) {
            console.error('유튜브 재생/정지 실패:', error);
        }
    },

    volumeUp: async (): Promise<void> => {
        try {
            await YoutubeControlModule.volumeUp();
        } catch (error) {
            console.error('유튜브 볼륨 올리기 실패:', error);
        }
    },

    volumeDown: async (): Promise<void> => {
        try {
            await YoutubeControlModule.volumeDown();
        } catch (error) {
            console.error('유튜브 볼륨 내리기 실패:', error);
        }
    },

    search: async (searchTerm: string): Promise<void> => {
        try {
            await YoutubeControlModule.search(searchTerm);
        } catch (error) {
            console.error('유튜브 검색 실패:', error);
        }
    },

    selectResult: async (position: number): Promise<void> => {
        try {
            await YoutubeControlModule.selectResult(position);
        } catch (error) {
            console.error('유튜브 검색 결과 선택 실패:', error);
        }
    },
};

/**
 * 백그라운드 호출 감지를 위한 권한 및 설정 요청
 */
export async function requestBackgroundPermissions(): Promise<void> {
    try {
        // 1. 알림 권한 (Android 13+)
        if (Platform.OS === 'android' && Platform.Version >= 33) {
            await requestNotificationPermission();
        }

        // 2. 배터리 최적화 제외 요청 (Doze 모드 방지)
        await requestIgnoreBatteryOptimizations();

        // 3. 접근성 권한 요청 (유튜브 제어용) - 누락되었던 부분 추가
        await showAccessibilityPermissionDialog();

    } catch (error) {
        console.error('백그라운드 권한 요청 실패:', error);
    }
}

/**
 * 배터리 최적화 제외 요청 (영구 기억 로직 추가)
 */
export async function requestIgnoreBatteryOptimizations(): Promise<void> {
    if (Platform.OS !== 'android') return;

    // 이미 설정을 완료했는지 확인
    const isAlreadySet = await AsyncStorage.getItem('SARVIS_BATTERY_OPTIMIZATION_SET');
    if (isAlreadySet === 'true') {
        console.log('[Permissions] Battery optimization already handled.');
        return;
    }

    return new Promise((resolve) => {
        Alert.alert(
            '백그라운드 상시 대기 설정',
            '화면이 꺼진 상태에서도 "싸비스" 호출에 응답하려면 배터리 사용량 제한을 "제한 없음"으로 설정해야 합니다.',
            [
                {
                    text: '이미 설정함',
                    onPress: async () => {
                        await AsyncStorage.setItem('SARVIS_BATTERY_OPTIMIZATION_SET', 'true');
                        resolve();
                    }
                },
                {
                    text: '설정하기',
                    onPress: async () => {
                        try {
                            // 설정 완료로 간주하고 저장 (다시 묻지 않음)
                            await AsyncStorage.setItem('SARVIS_BATTERY_OPTIMIZATION_SET', 'true');

                            await Linking.sendIntent('android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', [
                                { key: 'package', value: 'com.sarvis.ai' }
                            ]);
                        } catch (e) {
                            Linking.openSettings();
                        }
                        resolve();
                    }
                }
            ]
        );
    });
}
