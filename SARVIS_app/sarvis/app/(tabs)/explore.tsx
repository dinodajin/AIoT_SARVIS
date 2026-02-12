import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { controlAPI } from '@/api/control';
import { presetAPI } from '@/api/preset';
import { ButtonDirection } from '@/api/types';
import { SarvisAppHeader } from '@/components/sarvis/sarvis-app-header';
import { SarvisMenuModal } from '@/components/sarvis/sarvis-menu-modal';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { useAuth } from '@/providers/auth-provider';
import { presetStorage, type ControlState, type Preset } from '@/utils/presetStorage';

export default function ExploreScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ mode?: string; presetId?: string; presetName?: string }>();
    const isNewMode = params.mode === 'new';
    const isEditMode = params.mode === 'edit';

    const { user, session, selectedPreset, selectPreset } = useAuth();
    const [controlMode, setControlMode] = useState<'position' | 'rotation'>('position');

    const [state, setState] = useState<ControlState>({
        positionX: 0,
        positionY: 0,
        rotationX: 0,
        rotationY: 0,
        distance: 0,
    });

    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showLoadModal, setShowLoadModal] = useState(false);
    const [savedPresets, setSavedPresets] = useState<Preset[]>([]);
    const [showMenu, setShowMenu] = useState(false);
    const [presetName, setPresetName] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [showEditNameModal, setShowEditNameModal] = useState(false);

    const intervalRef = useRef<any>(null);
    const commandIntervalRef = useRef<any>(null);

    useEffect(() => {
        loadSavedState();
        if (isEditMode && params.presetId) {
            // 수정 모드일 때 해당 프리셋 적용
            const setupEditPreset = async () => {
                await presetAPI.selectPreset(Number(params.presetId));
                setPresetName(params.presetName || '');
            };
            setupEditPreset();
        }
    }, [isEditMode, params.presetId]);

    const loadSavedState = async () => {
        const saved = await presetStorage.getCurrentState();
        if (saved) {
            // 거리는 항상 기본값(0, 가운데)으로 시작
            setState({ ...saved, distance: 0 });
        }
    };

    /**
     * 버튼 커맨드를 서버로 전송
     */
    const sendButtonCommand = async (direction: ButtonDirection) => {
        if (!user || !user.uid || !session?.session_id) {
            console.warn('사용자 또는 세션 정보가 없습니다. 명령을 전송할 수 없습니다.');
            return;
        }

        try {
            const response = await controlAPI.sendButtonCommand(session.session_id, direction);

            if (response.success) {
                console.log(`✅ 버튼 명령 전송 성공: ${direction}`);
            } else {
                console.warn(`⚠️ 버튼 명령 전송 실패: ${response.message}`);
                if (response.jetson_error) {
                    console.error(`젯슨 오류: ${response.jetson_error}`);
                }
            }
        } catch (error) {
            console.error('❌ 버튼 명령 전송 중 오류 발생:', error);
        }
    };

    const updateState = (updates: Partial<ControlState>) => {
        setState((prev) => {
            const newState = { ...prev, ...updates };
            presetStorage.saveCurrentState(newState);
            return newState;
        });
    };

    const startContinuousUpdate = (updateFn: () => void, commandDirection: ButtonDirection) => {
        updateFn();
        intervalRef.current = setInterval(updateFn, 100);

        // 첫 명령 전송
        sendButtonCommand(commandDirection);

        // 지속적인 명령 전송 (500ms 간격)
        commandIntervalRef.current = setInterval(() => {
            sendButtonCommand(commandDirection);
        }, 500);
    };

    const stopContinuousUpdate = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        if (commandIntervalRef.current) {
            clearInterval(commandIntervalRef.current);
            commandIntervalRef.current = null;
        }
    };

    const handleManualControl = (type: keyof ControlState, delta: number) => {
        const isPosition = type === 'positionX' || type === 'positionY';
        const limitMax = isPosition ? 100 : 90;
        const limitMin = isPosition ? -100 : -90;

        setState((prev) => {
            let newVal = (prev[type] as number) + delta;
            if (newVal > limitMax) newVal = limitMax;
            if (newVal < limitMin) newVal = limitMin;

            const newState = { ...prev, [type]: newVal };
            presetStorage.saveCurrentState(newState);
            return newState;
        });
    };

    const handleDistanceChange = (delta: number) => {
        setState((prev) => {
            let newVal = prev.distance + delta;
            if (newVal > 2) newVal = 2;
            if (newVal < -2) newVal = -2;

            const newState = { ...prev, distance: newVal };
            presetStorage.saveCurrentState(newState);
            return newState;
        });
    };

    const handleGlobalReset = () => {
        Alert.alert('초기화', '모든 설정을 초기화하시겠습니까?', [
            { text: '취소', style: 'cancel' },
            {
                text: '확인',
                onPress: () => updateState({ positionX: 0, positionY: 0, rotationX: 0, rotationY: 0, distance: 0 }),
            }
        ]);
    };

    const handleUpdateActivePreset = async () => {
        if (isUpdating) return;

        // 수정 모드일 때는 이름 수정 모달을 먼저 띄움
        if (isEditMode) {
            setShowEditNameModal(true);
            return;
        }

        // 일반 업데이트 로직 (기존)
        Alert.alert(
            '프리셋 수정',
            '현재 로봇팔의 위치를 이 프리셋의 새로운 위치로 저장하시겠습니까?',
            [
                { text: '취소', style: 'cancel' },
                {
                    text: '수정',
                    style: 'default',
                    onPress: async () => {
                        await performUpdate();
                    }
                }
            ]
        );
    };

    const performUpdate = async () => {
        setIsUpdating(true);
        try {
            // 수정 모드일 때: 이름만 변경 (rename API 사용)
            if (isEditMode && params.presetId) {
                const response = await presetAPI.renamePreset(
                    Number(params.presetId),
                    presetName.trim()
                );

                if (response.success) {
                    Alert.alert(
                        '성공',
                        `프리셋 이름이 "${response.preset_name}"(으)로 변경되었습니다.`,
                        [
                            {
                                text: '확인',
                                onPress: () => {
                                    router.back();
                                }
                            }
                        ]
                    );

                    // 로컬 정보 동기화
                    if (selectedPreset) {
                        const presetId = (selectedPreset as any).preset_id || (selectedPreset as any).id;
                        const updatedPreset: Preset = {
                            id: presetId?.toString() || Date.now().toString(),
                            name: response.preset_name,
                            state: { ...state },
                            createdAt: new Date()
                        };
                        await presetStorage.savePreset(updatedPreset);
                        await selectPreset(updatedPreset as any);
                    }
                } else {
                    Alert.alert('오류', response.message || '프리셋 이름 변경에 실패했습니다.');
                }
            } else {
                // 일반 모드: 위치 업데이트 (update API 사용)
                const response = await presetAPI.updateActivePreset();

                if (response.success) {
                    Alert.alert(
                        '성공',
                        `"${response.preset_name}" 프리셋이 현재 위치로 수정되었습니다.`,
                        [
                            {
                                text: '확인',
                                onPress: () => {
                                    if (isEditMode) {
                                        router.back();
                                    }
                                }
                            }
                        ]
                    );

                    // 로컬 정보 동기화
                    if (selectedPreset) {
                        const presetId = (selectedPreset as any).preset_id || (selectedPreset as any).id;
                        const updatedPreset: Preset = {
                            id: presetId?.toString() || Date.now().toString(),
                            name: response.preset_name,
                            state: { ...state },
                            createdAt: new Date()
                        };
                        await presetStorage.savePreset(updatedPreset);
                        await selectPreset(updatedPreset as any);
                    }
                } else {
                    Alert.alert('오류', response.message || '프리셋 수정에 실패했습니다.');
                }
            }
        } catch (error: any) {
            console.error('프리셋 수정 실패:', error);
            const msg = error.response?.data?.message || '프리셋 수정 중 오류가 발생했습니다.';
            Alert.alert('오류', msg);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleSavePreset = async () => {
        if (!presetName.trim()) {
            Alert.alert('알림', '프리셋 이름을 입력해주세요.');
            return;
        }

        if (!session || !session.session_id) {
            Alert.alert('오류', '세션 ID가 없습니다. 프리셋을 저장할 수 없습니다.');
            return;
        }

        try {
            const sessionId = parseInt(session.session_id, 10);
            const response = await presetAPI.savePresetFromJetson(sessionId, presetName);

            if (response.success) {
                Alert.alert('성공', '프리셋이 서버에 저장되었습니다.');
                setShowSaveModal(false);
                setPresetName('');

                // 만약 새 프리셋 생성 모드였다면 파라미터 초기화
                if (isNewMode) {
                    router.setParams({ mode: undefined });
                }

                // 로컬 스토리지에도 저장 (UI 표시용)
                const newPreset: Preset = {
                    id: response.preset_id?.toString() || Date.now().toString(),
                    name: presetName,
                    state: { ...state },
                    createdAt: new Date(),
                };
                await presetStorage.savePreset(newPreset);

                // 전역 프리셋 선택 상태 업데이트
                await selectPreset(newPreset as any);
            } else {
                Alert.alert('오류', response.message || '프리셋 저장에 실패했습니다.');
            }
        } catch (error: any) {
            console.error('프리셋 저장 실패:', error);

            if (error.response?.status === 502) {
                Alert.alert(
                    '통신 오류',
                    '로봇팔과의 연결에 실패했습니다.\n기기 전원이 켜져 있는지, 네트워크에 연결되어 있는지 확인해주세요.'
                );
            } else {
                Alert.alert(
                    '오류',
                    error.response?.data?.message || '프리셋 저장에 실패했습니다.'
                );
            }
        }
    };

    const openLoadModal = async () => {
        const presets = await presetStorage.getPresets();
        setSavedPresets(presets);
        setShowLoadModal(true);
    };

    const handleSelectPreset = (preset: Preset) => {
        setState(preset.state);
        presetStorage.saveCurrentState(preset.state);

        // 전역 프리셋 선택 상태 업데이트 (배너 이름 갱신용)
        selectPreset(preset as any);

        setShowLoadModal(false);
        Alert.alert('적용 완료', `"${preset.name}" 프리셋이 로드되었습니다.`);
    };

    const handleDeletePreset = async (id: string) => {
        await presetStorage.deletePreset(id);
        const updated = await presetStorage.getPresets();
        setSavedPresets(updated);
    };

    const renderDistanceSteps = () => {
        const steps = [-2, -1, 0, 1, 2];
        return (
            <View style={styles.distStepsContainer}>
                {steps.map((step) => {
                    const isActive = state.distance === step;
                    const isCenter = step === 0;
                    return (
                        <View key={step} style={styles.distStepWrapper}>
                            <View style={[styles.distStepDot, isActive && styles.distStepDotActive, isCenter && !isActive && styles.distStepDotCenter]} />
                        </View>
                    );
                })}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <SarvisAppHeader title="" showBackButton={true} onMenuPress={() => setShowMenu(true)} />

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <View style={styles.root}>
                    <SarvisMenuModal visible={showMenu} onClose={() => setShowMenu(false)} />

                    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>

                        {/* Current Preset Banner */}
                        {isNewMode ? (
                            <View style={[styles.activePresetCard, styles.newPresetCard]}>
                                <View style={[styles.activePresetIcon, styles.newPresetIcon]}>
                                    <MaterialIcons name="star" size={20} color="white" />
                                </View>
                                <View style={styles.activePresetInfo}>
                                    <Text style={[styles.activePresetLabel, { color: '#6366f1' }]}>새 프리셋 생성 중</Text>
                                    <Text style={[styles.activePresetName, { fontSize: 13 }]} numberOfLines={1}>
                                        저장 버튼을 눌러 이름을 저장해주세요
                                    </Text>
                                </View>
                            </View>
                        ) : selectedPreset && (
                            <View style={styles.activePresetCard}>
                                <View style={styles.activePresetIcon}>
                                    <MaterialIcons name="star" size={20} color={SarvisTheme.colors.primary} />
                                </View>
                                <View style={styles.activePresetInfo}>
                                    <Text style={styles.activePresetLabel}>현재 적용된 프리셋</Text>
                                    <Text style={styles.activePresetName}>{selectedPreset.name || (selectedPreset as any).preset_name || '이름 없음'}</Text>
                                </View>
                            </View>
                        )}

                        {/* Mode Selector */}
                        <View style={styles.segmentedContainer}>
                            <TouchableOpacity style={[styles.segment, controlMode === 'position' && styles.segmentActive]} onPress={() => setControlMode('position')}>
                                <Text style={[styles.segmentText, controlMode === 'position' && styles.segmentTextActive]}>위치 제어</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.segment, controlMode === 'rotation' && styles.segmentActive]} onPress={() => setControlMode('rotation')}>
                                <Text style={[styles.segmentText, controlMode === 'rotation' && styles.segmentTextActive]}>회전 제어</Text>
                            </TouchableOpacity>
                        </View>

                        {/* D-Pad */}
                        <View style={styles.dpadWrapper}>
                            <View style={styles.dpadGrid}>
                                <TouchableOpacity
                                    style={[styles.dpadBtn, styles.dpadUp, controlMode === 'position' ? styles.dpadBtnDark : styles.dpadBtnLight]}
                                    onPressIn={() => {
                                        const direction = controlMode === 'position' ? 'UP' : 'PITCH_UP';
                                        startContinuousUpdate(
                                            () => handleManualControl(controlMode === 'position' ? 'positionY' : 'rotationX', 1),
                                            direction
                                        );
                                    }}
                                    onPressOut={stopContinuousUpdate}
                                >
                                    <MaterialIcons name="keyboard-arrow-up" size={32} color={controlMode === 'position' ? 'white' : SarvisTheme.colors.primary} />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.dpadBtn, styles.dpadLeft, controlMode === 'position' ? styles.dpadBtnDark : styles.dpadBtnLight]}
                                    onPressIn={() => {
                                        const direction = controlMode === 'position' ? 'RIGHT' : 'YAW_RIGHT';
                                        startContinuousUpdate(
                                            () => handleManualControl(controlMode === 'position' ? 'positionX' : 'rotationY', 1),
                                            direction
                                        );
                                    }}
                                    onPressOut={stopContinuousUpdate}
                                >
                                    <MaterialIcons name="keyboard-arrow-left" size={32} color={controlMode === 'position' ? 'white' : SarvisTheme.colors.primary} />
                                </TouchableOpacity>

                                <View style={styles.dpadCenter}>
                                    <View style={styles.dpadCenterDot} />
                                </View>

                                <TouchableOpacity
                                    style={[styles.dpadBtn, styles.dpadRight, controlMode === 'position' ? styles.dpadBtnDark : styles.dpadBtnLight]}
                                    onPressIn={() => {
                                        const direction = controlMode === 'position' ? 'LEFT' : 'YAW_LEFT';
                                        startContinuousUpdate(
                                            () => handleManualControl(controlMode === 'position' ? 'positionX' : 'rotationY', -1),
                                            direction
                                        );
                                    }}
                                    onPressOut={stopContinuousUpdate}
                                >
                                    <MaterialIcons name="keyboard-arrow-right" size={32} color={controlMode === 'position' ? 'white' : SarvisTheme.colors.primary} />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.dpadBtn, styles.dpadDown, controlMode === 'position' ? styles.dpadBtnDark : styles.dpadBtnLight]}
                                    onPressIn={() => {
                                        const direction = controlMode === 'position' ? 'DOWN' : 'PITCH_DOWN';
                                        startContinuousUpdate(
                                            () => handleManualControl(controlMode === 'position' ? 'positionY' : 'rotationX', -1),
                                            direction
                                        );
                                    }}
                                    onPressOut={stopContinuousUpdate}
                                >
                                    <MaterialIcons name="keyboard-arrow-down" size={32} color={controlMode === 'position' ? 'white' : SarvisTheme.colors.primary} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Reset Button */}
                        <TouchableOpacity style={styles.resetBtn} onPress={handleGlobalReset}>
                            <MaterialIcons name="refresh" size={18} color={SarvisTheme.colors.textMuted} />
                            <Text style={styles.resetBtnText}>초기화</Text>
                        </TouchableOpacity>

                        {/* Distance Control */}
                        <View style={styles.distCard}>
                            <Text style={styles.distTitle}>이동 거리 설정</Text>
                            <View style={styles.distControls}>
                                <TouchableOpacity
                                    style={[styles.distStepBtn, styles.distBtnNear]}
                                    onPress={() => {
                                        handleDistanceChange(-1);
                                        sendButtonCommand('NEAR');
                                    }}
                                >
                                    <MaterialIcons name="remove" size={20} color={SarvisTheme.colors.text} />
                                    <Text style={styles.distBtnText}>가까이</Text>
                                </TouchableOpacity>

                                <View style={styles.distVisualizer}>{renderDistanceSteps()}</View>

                                <TouchableOpacity
                                    style={[styles.distStepBtn, styles.distBtnFar]}
                                    onPress={() => {
                                        handleDistanceChange(1);
                                        sendButtonCommand('FAR');
                                    }}
                                >
                                    <Text style={[styles.distBtnText, { color: 'white' }]}>멀리</Text>
                                    <MaterialIcons name="add" size={20} color="white" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Buttons */}
                        <View style={styles.footer}>
                            <TouchableOpacity style={[styles.footerBtn, styles.btnFooterOutline]} onPress={openLoadModal}>
                                <MaterialIcons name="list" size={24} color={SarvisTheme.colors.text} />
                                <Text style={styles.btnFooterOutlineText}>목록</Text>
                            </TouchableOpacity>

                            {isEditMode ? (
                                <TouchableOpacity
                                    style={[styles.footerBtn, styles.btnSave, isUpdating && { opacity: 0.7 }]}
                                    onPress={handleUpdateActivePreset}
                                    disabled={isUpdating}
                                >
                                    {isUpdating ? (
                                        <ActivityIndicator size="small" color="white" />
                                    ) : (
                                        <>
                                            <MaterialIcons name="edit" size={24} color="white" />
                                            <Text style={styles.btnSaveText}>프리셋 수정</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={[styles.footerBtn, styles.btnSave]} onPress={() => setShowSaveModal(true)}>
                                    <MaterialIcons name="save" size={24} color="white" />
                                    <Text style={styles.btnSaveText}>저장</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </ScrollView>

                    {/* Save Modal */}
                    <Modal visible={showSaveModal} transparent animationType="fade">
                        <View style={styles.modalOverlay}>
                            <View style={styles.modalContent}>
                                <Text style={styles.modalTitle}>새 프리셋 저장</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="이름을 입력하세요"
                                    placeholderTextColor={SarvisTheme.colors.textMuted}
                                    value={presetName}
                                    onChangeText={setPresetName}
                                />
                                <View style={styles.modalBtns}>
                                    <TouchableOpacity style={[styles.modalBtn, styles.btnOutline]} onPress={() => setShowSaveModal(false)}>
                                        <Text style={styles.btnOutlineText}>취소</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.modalBtn, styles.btnPrimary]} onPress={handleSavePreset}>
                                        <Text style={styles.btnPrimaryText}>저장</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>

                    {/* Edit Name Modal (for Edit Mode) */}
                    <Modal visible={showEditNameModal} transparent animationType="fade">
                        <View style={styles.modalOverlay}>
                            <View style={styles.modalContent}>
                                <Text style={styles.modalTitle}>프리셋 이름 수정</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="프리셋 이름을 입력하세요"
                                    placeholderTextColor={SarvisTheme.colors.textMuted}
                                    value={presetName}
                                    onChangeText={setPresetName}
                                    autoFocus
                                />
                                <View style={styles.modalBtns}>
                                    <TouchableOpacity
                                        style={[styles.modalBtn, styles.btnOutline]}
                                        onPress={() => {
                                            setShowEditNameModal(false);
                                            setPresetName(params.presetName || '');
                                        }}
                                    >
                                        <Text style={styles.btnOutlineText}>취소</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.modalBtn, styles.btnPrimary, isUpdating && { opacity: 0.7 }]}
                                        onPress={async () => {
                                            if (!presetName.trim()) {
                                                Alert.alert('알림', '프리셋 이름을 입력해주세요.');
                                                return;
                                            }
                                            setShowEditNameModal(false);
                                            await performUpdate();
                                        }}
                                        disabled={isUpdating}
                                    >
                                        {isUpdating ? (
                                            <ActivityIndicator size="small" color="white" />
                                        ) : (
                                            <Text style={styles.btnPrimaryText}>저장</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>

                    {/* Load Preset Modal */}
                    <Modal visible={showLoadModal} transparent animationType="fade">
                        <View style={styles.modalOverlay}>
                            <View style={styles.modalContent}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <Text style={styles.modalTitle}>프리셋 불러오기</Text>
                                    <TouchableOpacity onPress={() => setShowLoadModal(false)}>
                                        <MaterialIcons name="close" size={24} color={SarvisTheme.colors.textMuted} />
                                    </TouchableOpacity>
                                </View>

                                {savedPresets.length === 0 ? (
                                    <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                                        <Text style={{ color: SarvisTheme.colors.textMuted, marginBottom: 16 }}>저장된 프리셋이 없습니다.</Text>
                                        <TouchableOpacity
                                            style={styles.addInlineBtnSmall}
                                            onPress={() => {
                                                setShowLoadModal(false);
                                                router.setParams({ mode: 'new' });
                                            }}
                                        >
                                            <MaterialIcons name="add" size={20} color={SarvisTheme.colors.primary} />
                                            <Text style={styles.addInlineBtnTextSmall}>새 프리셋 추가</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <FlatList
                                        data={savedPresets}
                                        keyExtractor={(item) => item.id}
                                        style={{ maxHeight: 300 }}
                                        renderItem={({ item }) => (
                                            <View style={styles.presetItem}>
                                                <TouchableOpacity style={styles.presetItemContent} onPress={() => handleSelectPreset(item)}>
                                                    <MaterialIcons name="bookmark" size={20} color={SarvisTheme.colors.primary} style={{ marginRight: 8 }} />
                                                    <Text style={styles.presetItemName}>{item.name}</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={() => handleDeletePreset(item.id)} style={{ padding: 8 }}>
                                                    <MaterialIcons name="delete-outline" size={20} color={SarvisTheme.colors.danger} />
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                        ListFooterComponent={() => (
                                            <TouchableOpacity
                                                style={[styles.addInlineBtnSmall, { marginTop: 16, alignSelf: 'center' }]}
                                                onPress={() => {
                                                    setShowLoadModal(false);
                                                    router.setParams({ mode: 'new' });
                                                }}
                                            >
                                                <MaterialIcons name="add" size={20} color={SarvisTheme.colors.primary} />
                                                <Text style={styles.addInlineBtnTextSmall}>새 프리셋 추가</Text>
                                            </TouchableOpacity>
                                        )}
                                    />
                                )}
                            </View>
                        </View>
                    </Modal>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: SarvisTheme.colors.bg },
    safeArea: { flex: 1 },
    root: { flex: 1 },
    scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 20, paddingTop: 10 },


    // Mode Selector
    segmentedContainer: { flexDirection: 'row', backgroundColor: '#E2E8F0', borderRadius: 16, padding: 4, marginBottom: 20, marginTop: 0 },
    segment: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
    segmentActive: { backgroundColor: 'white', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
    segmentText: { fontSize: 14, fontWeight: '700', color: SarvisTheme.colors.textLight },
    segmentTextActive: { color: SarvisTheme.colors.primary },

    // D-Pad
    dpadWrapper: { alignItems: 'center', justifyContent: 'center', marginBottom: 0, flex: 1 },
    dpadGrid: { width: 220, height: 220, position: 'relative' },
    dpadBtn: { position: 'absolute', width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    dpadBtnDark: { backgroundColor: SarvisTheme.colors.primary },
    dpadBtnLight: { backgroundColor: 'white', borderWidth: 1, borderColor: SarvisTheme.colors.border },
    dpadUp: { top: 0, left: 78 },
    dpadDown: { bottom: 0, left: 78 },
    dpadLeft: { top: 78, left: 0 },
    dpadRight: { top: 78, right: 0 },
    dpadCenter: { position: 'absolute', top: 78, left: 78, width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
    dpadCenterDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: SarvisTheme.colors.primary },

    // Reset Button
    resetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, gap: 4, marginBottom: 8, alignSelf: 'flex-end' },
    resetBtnText: { fontSize: 13, fontWeight: '700', color: SarvisTheme.colors.textMuted },

    // Distance Control
    distCard: { backgroundColor: 'white', borderRadius: 20, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: SarvisTheme.colors.border },
    distTitle: { fontSize: 14, fontWeight: '800', color: SarvisTheme.colors.textMuted, marginBottom: 12, textTransform: 'uppercase' },
    distControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    distStepBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, gap: 6 },
    distBtnNear: { backgroundColor: '#F1F5F9' },
    distBtnFar: { backgroundColor: SarvisTheme.colors.primary },
    distBtnText: { fontSize: 13, fontWeight: '700', color: SarvisTheme.colors.text },
    distVisualizer: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 40 },
    distStepsContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 8 },
    distStepWrapper: { width: 20, alignItems: 'center' },
    distStepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E2E8F0' },
    distStepDotCenter: { width: 10, height: 10, borderRadius: 5, backgroundColor: SarvisTheme.colors.textMuted },
    distStepDotActive: { width: 16, height: 16, borderRadius: 8, backgroundColor: SarvisTheme.colors.primary, shadowColor: SarvisTheme.colors.primary, shadowOpacity: 0.3, shadowRadius: 4, elevation: 2 },

    // Footer Buttons
    footer: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    footerBtn: { flex: 1, height: 56, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    btnFooterOutline: { backgroundColor: 'white', borderWidth: 1, borderColor: SarvisTheme.colors.border },
    btnFooterOutlineText: { color: SarvisTheme.colors.text, fontWeight: '800', fontSize: 15 },
    btnSave: { backgroundColor: SarvisTheme.colors.primary },
    btnSaveText: { color: 'white', fontWeight: '800', fontSize: 15 },

    // Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', padding: 24 },
    modalContent: { backgroundColor: 'white', borderRadius: 28, padding: 24 },
    modalTitle: { fontSize: 20, fontWeight: '900', color: SarvisTheme.colors.text },
    input: { height: 56, borderWidth: 1, borderColor: SarvisTheme.colors.border, borderRadius: 16, paddingHorizontal: 16, marginBottom: 20, fontSize: 16 },
    modalBtns: { flexDirection: 'row', gap: 12 },
    modalBtn: { flex: 1, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    btnOutline: { borderWidth: 1.5, borderColor: SarvisTheme.colors.border },
    btnOutlineText: { fontWeight: '700', color: SarvisTheme.colors.textLight, fontSize: 15 },
    btnPrimary: { backgroundColor: SarvisTheme.colors.primary },
    btnPrimaryText: { fontWeight: '700', color: 'white', fontSize: 15 },

    // Preset List Item
    presetItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    presetItemContent: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    presetItemName: { fontSize: 16, fontWeight: '600', color: SarvisTheme.colors.text },

    // Active Preset Card
    activePresetCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: SarvisTheme.colors.primaryLight + '40', // Very light primary
        padding: 16,
        borderRadius: 20,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: SarvisTheme.colors.primaryLight,
    },
    activePresetIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'white',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        shadowColor: SarvisTheme.colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    activePresetInfo: { flex: 1 },
    activePresetLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: SarvisTheme.colors.primary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    activePresetName: {
        fontSize: 16,
        fontWeight: '800',
        color: SarvisTheme.colors.text,
    },
    updatePresetBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: SarvisTheme.colors.primary,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        gap: 6,
    },
    updatePresetBtnText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '800',
    },
    newPresetCard: {
        backgroundColor: '#eef2ff',
        borderColor: '#6366f1',
    },
    newPresetIcon: {
        backgroundColor: '#6366f1',
        shadowColor: '#6366f1',
    },
    addInlineBtnSmall: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        borderWidth: 1.5,
        borderColor: SarvisTheme.colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        gap: 6,
    },
    addInlineBtnTextSmall: {
        color: SarvisTheme.colors.primary,
        fontSize: 14,
        fontWeight: '800',
    },
});