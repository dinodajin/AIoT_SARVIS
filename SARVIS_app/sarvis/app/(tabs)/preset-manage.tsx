import React, { useEffect, useState, useCallback } from 'react';
import {
    Alert,
    ActivityIndicator,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    ScrollView,
    Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SarvisAppHeader } from '@/components/sarvis/sarvis-app-header';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { useAuth } from '@/providers/auth-provider';
import { presetAPI } from '@/api/preset';
import { Preset } from '@/api/types';

export default function PresetManageScreen() {
    const router = useRouter();
    const { user, session } = useAuth();

    const [presets, setPresets] = useState<Preset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 새 프리셋 추가 모달
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [newPresetName, setNewPresetName] = useState('');
    const [servoValues, setServoValues] = useState({
        servo1: 90,
        servo2: 90,
        servo3: 90,
        servo4: 90,
        servo5: 90,
        servo6: 90,
    });

    // 프리셋 목록 불러오기
    const loadPresets = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await presetAPI.getPresets(session?.session_id);

            if (response && response.presets) {
                setPresets(response.presets);
            } else {
                setPresets([]);
            }
        } catch (error: any) {
            console.error('프리셋 목록 조회 실패:', error);
            Alert.alert('오류', '프리셋 목록을 불러오지 못했습니다.');
            setPresets([]);
        } finally {
            setIsLoading(false);
        }
    }, [session?.session_id]);

    useEffect(() => {
        loadPresets();
    }, [loadPresets]);

    // 새 프리셋 저장
    const handleSavePreset = async () => {
        if (!newPresetName.trim()) {
            Alert.alert('알림', '프리셋 이름을 입력해주세요.');
            return;
        }

        setIsSubmitting(true);

        try {
            await presetAPI.savePreset(
                newPresetName,
                servoValues,
                session?.session_id
            );

            Alert.alert('성공', '프리셋이 저장되었습니다.');
            setIsModalVisible(false);
            setNewPresetName('');
            setServoValues({
                servo1: 90,
                servo2: 90,
                servo3: 90,
                servo4: 90,
                servo5: 90,
                servo6: 90,
            });

            // 목록 새로고침
            await loadPresets();
        } catch (error: any) {
            console.error('프리셋 저장 실패:', error);
            Alert.alert(
                '오류',
                error.response?.data?.message || '프리셋 저장에 실패했습니다.'
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    // 프리셋 삭제
    const handleDeletePreset = (preset: Preset) => {
        if (!preset.preset_id) {
            Alert.alert('오류', '기본 프리셋은 삭제할 수 없습니다.');
            return;
        }

        Alert.alert(
            '프리셋 삭제',
            `"${preset.name}" 프리셋을 삭제하시겠습니까?`,
            [
                { text: '취소', style: 'cancel' },
                {
                    text: '삭제',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await presetAPI.deletePreset(preset.preset_id!);
                            Alert.alert('성공', '프리셋이 삭제되었습니다.');
                            await loadPresets();
                        } catch (error: any) {
                            console.error('프리셋 삭제 실패:', error);
                            Alert.alert(
                                '오류',
                                error.response?.data?.message || '프리셋 삭제에 실패했습니다.'
                            );
                        }
                    },
                },
            ]
        );
    };

    // 프리셋 불러오기 (서보에 적용)
    const handleLoadPreset = async (preset: Preset) => {
        if (!preset.preset_id) {
            Alert.alert('알림', '기본 프리셋을 적용합니다.');
            return;
        }

        try {
            const response = await presetAPI.loadPreset(preset.preset_id);
            Alert.alert('성공', `"${preset.name}" 프리셋이 적용되었습니다.`);
        } catch (error: any) {
            console.error('프리셋 불러오기 실패:', error);
            Alert.alert(
                '오류',
                error.response?.data?.message || '프리셋 적용에 실패했습니다.'
            );
        }
    };

    // 서보 값 변경 핸들러
    const handleServoChange = (servo: keyof typeof servoValues, value: string) => {
        const numValue = parseInt(value) || 0;
        // 서보 값 범위: 0 ~ 180
        const clampedValue = Math.max(0, Math.min(180, numValue));
        setServoValues(prev => ({ ...prev, [servo]: clampedValue }));
    };

    // 프리셋 카드 렌더링
    const renderPresetCard = (preset: Preset, index: number) => {
        const isDefault = !preset.preset_id;

        return (
            <View key={preset.preset_id || `default-${index}`} style={styles.presetCard}>
                <View style={styles.presetHeader}>
                    <Text style={styles.presetName}>{preset.name}</Text>
                    {isDefault && (
                        <View style={styles.defaultBadge}>
                            <Text style={styles.defaultBadgeText}>기본</Text>
                        </View>
                    )}
                </View>

                <View style={styles.servoGrid}>
                    {(['servo1', 'servo2', 'servo3', 'servo4', 'servo5', 'servo6'] as const).map((servo) => (
                        <View key={servo} style={styles.servoItem}>
                            <Text style={styles.servoLabel}>{servo.toUpperCase()}</Text>
                            <Text style={styles.servoValue}>{preset[servo]}°</Text>
                        </View>
                    ))}
                </View>

                <View style={styles.cardActions}>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.loadButton]}
                        onPress={() => handleLoadPreset(preset)}
                    >
                        <Text style={styles.actionButtonText}>적용</Text>
                    </TouchableOpacity>

                    {!isDefault && (
                        <TouchableOpacity
                            style={[styles.actionButton, styles.deleteButton]}
                            onPress={() => handleDeletePreset(preset)}
                        >
                            <Text style={[styles.actionButtonText, styles.deleteButtonText]}>삭제</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <SarvisAppHeader showBackButton={true} />

            <View style={styles.header}>
                <Text style={styles.titleText}>프리셋 관리</Text>
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => setIsModalVisible(true)}
                >
                    <Text style={styles.addButtonText}>+ 새 프리셋</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {isLoading ? (
                    <View style={styles.centerContainer}>
                        <ActivityIndicator size="large" color={SarvisTheme.colors.primary} />
                        <Text style={styles.loadingText}>프리셋 목록을 불러오는 중...</Text>
                    </View>
                ) : presets.length === 0 ? (
                    <View style={styles.centerContainer}>
                        <Text style={styles.emptyText}>저장된 프리셋이 없습니다.</Text>
                        <Text style={styles.emptySubtext}>새 프리셋을 추가해보세요.</Text>
                    </View>
                ) : (
                    presets.map((preset, index) => renderPresetCard(preset, index))
                )}
            </ScrollView>

            {/* 새 프리셋 추가 모달 */}
            <Modal
                visible={isModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setIsModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>새 프리셋 추가</Text>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>프리셋 이름</Text>
                            <TextInput
                                style={styles.textInput}
                                placeholder="프리셋 이름 입력"
                                value={newPresetName}
                                onChangeText={setNewPresetName}
                                editable={!isSubmitting}
                            />
                        </View>

                        <Text style={styles.sectionTitle}>서보 모터 값 (0 ~ 180°)</Text>
                        <View style={styles.servoInputGrid}>
                            {(['servo1', 'servo2', 'servo3', 'servo4', 'servo5', 'servo6'] as const).map((servo) => (
                                <View key={servo} style={styles.servoInputItem}>
                                    <Text style={styles.servoInputLabel}>{servo.toUpperCase()}</Text>
                                    <TextInput
                                        style={styles.servoInput}
                                        keyboardType="number-pad"
                                        value={String(servoValues[servo])}
                                        onChangeText={(value) => handleServoChange(servo, value)}
                                        editable={!isSubmitting}
                                        maxLength={3}
                                    />
                                </View>
                            ))}
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.cancelButton]}
                                onPress={() => setIsModalVisible(false)}
                                disabled={isSubmitting}
                            >
                                <Text style={styles.cancelButtonText}>취소</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.modalButton, styles.saveButton, isSubmitting && styles.disabledButton]}
                                onPress={handleSavePreset}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? (
                                    <ActivityIndicator size="small" color="white" />
                                ) : (
                                    <Text style={styles.saveButtonText}>저장</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    titleText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: SarvisTheme.colors.text,
    },
    addButton: {
        backgroundColor: SarvisTheme.colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
    },
    addButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 14,
    },
    scrollContent: {
        padding: 20,
        paddingTop: 0,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: SarvisTheme.colors.textLight,
    },
    emptyText: {
        fontSize: 18,
        color: SarvisTheme.colors.text,
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: SarvisTheme.colors.textLight,
    },
    presetCard: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    presetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    presetName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: SarvisTheme.colors.text,
        flex: 1,
    },
    defaultBadge: {
        backgroundColor: SarvisTheme.colors.primary,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    defaultBadgeText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '600',
    },
    servoGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 16,
    },
    servoItem: {
        width: '33.33%',
        paddingVertical: 8,
        alignItems: 'center',
    },
    servoLabel: {
        fontSize: 12,
        color: SarvisTheme.colors.textLight,
        marginBottom: 4,
    },
    servoValue: {
        fontSize: 16,
        fontWeight: '600',
        color: SarvisTheme.colors.text,
    },
    cardActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
    },
    actionButton: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
    },
    loadButton: {
        backgroundColor: SarvisTheme.colors.primary,
    },
    deleteButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#dc3545',
    },
    actionButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 14,
    },
    deleteButtonText: {
        color: '#dc3545',
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 24,
        width: '100%',
        maxWidth: 400,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: SarvisTheme.colors.text,
        marginBottom: 20,
        textAlign: 'center',
    },
    inputGroup: {
        marginBottom: 20,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: SarvisTheme.colors.text,
        marginBottom: 8,
    },
    textInput: {
        backgroundColor: '#f8f9fa',
        borderWidth: 1,
        borderColor: SarvisTheme.colors.border,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: SarvisTheme.colors.text,
        marginBottom: 12,
    },
    servoInputGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 24,
        gap: 8,
    },
    servoInputItem: {
        width: '30%',
        alignItems: 'center',
    },
    servoInputLabel: {
        fontSize: 12,
        color: SarvisTheme.colors.textLight,
        marginBottom: 4,
    },
    servoInput: {
        backgroundColor: '#f8f9fa',
        borderWidth: 1,
        borderColor: SarvisTheme.colors.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 16,
        textAlign: 'center',
        width: '100%',
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButton: {
        backgroundColor: '#f8f9fa',
        borderWidth: 1,
        borderColor: SarvisTheme.colors.border,
    },
    cancelButtonText: {
        color: SarvisTheme.colors.text,
        fontWeight: '600',
        fontSize: 16,
    },
    saveButton: {
        backgroundColor: SarvisTheme.colors.primary,
    },
    saveButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 16,
    },
    disabledButton: {
        opacity: 0.6,
    },
});
