import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { presetAPI } from '@/api/preset';
import { SarvisAppHeader } from '@/components/sarvis/sarvis-app-header';
import { SarvisMenuModal } from '@/components/sarvis/sarvis-menu-modal';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { useAuth } from '@/providers/auth-provider';
import { presetStorage, type Preset } from '@/utils/presetStorage';
import { userStorage } from '@/utils/userStorage';

export default function PresetSelectScreen() {
    const router = useRouter();
    const { selectedPreset, selectPreset } = useAuth(); // Use global auth state
    const [presets, setPresets] = useState<Preset[]>([]);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [editingPreset, setEditingPreset] = useState<Preset | null>(null);
    const [editName, setEditName] = useState('');

    useEffect(() => {
        loadPresets();
    }, []);

    useFocusEffect(
        React.useCallback(() => {
            loadPresets();
        }, [])
    );

    const loadPresets = async () => {
        try {
            const userInfo = await userStorage.getUserInfo();
            // Try fetching from API first
            try {
                const response = await presetAPI.getPresets();

                if (response && response.presets) {
                    // Map API presets to Local structure
                    const mappedPresets: Preset[] = response.presets.map((p: any) => ({
                        id: String(p.preset_id),
                        name: p.name || p.preset_name || '이름 없음',
                        // API doesn't return high-level state, so we use defaults.
                        // The server handles the actual servo positions when selected.
                        state: {
                            positionX: 0,
                            positionY: 0,
                            rotationX: 0,
                            rotationY: 0,
                            distance: 0
                        },
                        createdAt: p.created_at ? new Date(p.created_at) : new Date()
                    }));

                    setPresets(mappedPresets);
                    // Update local storage to match API
                    await presetStorage.savePresets(mappedPresets);
                } else {
                    setPresets([]);
                }
            } catch (apiError) {
                console.log('API call failed, falling back to local storage:', apiError);
                const stored = await presetStorage.getPresets();
                setPresets(stored);
            }
        } catch (error) {
            console.error('프리셋 로드 실패:', error);
        }
    };

    const handleApply = async (preset: Preset) => {
        try {
            // Apply via Server API first (controls the robot)
            await presetAPI.selectPreset(Number(preset.id));

            // Also save to local state if needed (optional since state is dummy)
            await presetStorage.saveCurrentState(preset.state);

            // Update global selected preset state (cast to any to bypass strict type mismatch for now)
            await selectPreset(preset as any);

            router.push('/(tabs)/explore');
            Alert.alert('프리셋 적용', `"${preset.name}" 프리셋이 적용되었습니다.`);
        } catch (error) {
            console.error('프리셋 적용 실패:', error);
            Alert.alert('오류', '프리셋 적용에 실패했습니다.');
        }
    };

    const handleDelete = (presetId: string) => {
        Alert.alert(
            '프리셋 삭제',
            '이 프리셋을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.',
            [
                { text: '취소', style: 'cancel' },
                {
                    text: '삭제',
                    style: 'destructive',
                    onPress: async () => {
                        await presetStorage.deletePreset(presetId);
                        loadPresets();
                    }
                }
            ]
        );
    };

    const handleEditPositions = (preset: Preset) => {
        router.push({
            pathname: '/(tabs)/explore',
            params: {
                mode: 'edit',
                presetId: preset.id,
                presetName: preset.name
            }
        } as any);
    };

    const saveNameEdit = async () => {
        if (!editingPreset || !editName.trim()) return;
        try {
            await presetStorage.updatePresetName(editingPreset.id, editName.trim());
            setShowEditModal(false);
            loadPresets();
        } catch (error) {
            Alert.alert('오류', '이름 수정에 실패했습니다.');
        }
    };

    return (
        <View style={styles.container}>
            {/* Header - No Title, With Back Button */}
            <SarvisAppHeader
                title=""
                showBackButton={true}
                onMenuPress={() => setShowMenu(true)}
            />

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <View style={styles.root}>

                    {/* 메뉴 모달 */}
                    <SarvisMenuModal visible={showMenu} onClose={() => setShowMenu(false)} />

                    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                        {presets.length === 0 ? (
                            <View style={styles.emptyRoot}>
                                <View style={styles.emptyIconCircle}>
                                    <MaterialIcons name="bookmark-border" size={48} color={SarvisTheme.colors.textMuted} />
                                </View>
                                <Text style={styles.emptyTitle}>저장된 프리셋이 없습니다</Text>
                                <Text style={styles.emptyDesc}>제어 화면에서 현재 설정을 프리셋으로{'\n'}저장하여 간편하게 관리해보세요.</Text>
                                <TouchableOpacity
                                    style={styles.emptyBtn}
                                    onPress={() => router.push('/(tabs)/explore')}
                                >
                                    <Text style={styles.emptyBtnText}>제어 화면으로 이동</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            presets.map((preset) => (
                                <View key={preset.id} style={styles.card}>
                                    <View style={styles.cardHeader}>
                                        <View style={styles.cardInfo}>
                                            <Text style={styles.cardTitle}>{preset.name}</Text>
                                            <Text style={styles.cardDate}>{new Date(preset.createdAt).toLocaleDateString()}</Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.cardActionBtn}
                                            onPress={() => handleEditPositions(preset)}
                                        >
                                            <MaterialIcons name="edit" size={18} color={SarvisTheme.colors.textMuted} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.cardActionBtn, { backgroundColor: SarvisTheme.colors.dangerLight }]}
                                            onPress={() => handleDelete(preset.id)}
                                        >
                                            <MaterialIcons name="delete-outline" size={18} color={SarvisTheme.colors.danger} />
                                        </TouchableOpacity>
                                    </View>

                                    {/* <View style={styles.statsContainer}>
                                        <View style={styles.statItem}>
                                            <Text style={styles.statVal}>{preset.state.positionX}, {preset.state.positionY}</Text>
                                            <Text style={styles.statLabel}>좌표</Text>
                                        </View>
                                        <View style={styles.statDivider} />
                                        <View style={styles.statItem}>
                                            <Text style={styles.statVal}>{preset.state.rotationX}°</Text>
                                            <Text style={styles.statLabel}>각도</Text>
                                        </View>
                                        <View style={styles.statDivider} />
                                        <View style={styles.statItem}>
                                            <Text style={styles.statVal}>{preset.state.distance} 단계</Text>
                                            <Text style={styles.statLabel}>거리</Text>
                                        </View>
                                    </View> */}

                                    {/* Handle comparison robustly against both type definitions */}
                                    {(selectedPreset && (
                                        (selectedPreset as any).id === preset.id ||
                                        String((selectedPreset as any).preset_id) === preset.id
                                    )) ? (
                                        <View style={[styles.applyBtn, styles.applyBtnActive]}>
                                            <MaterialIcons name="check-circle" size={20} color={SarvisTheme.colors.success} style={{ marginRight: 8 }} />
                                            <Text style={styles.applyBtnTextActive}>현재 적용 중</Text>
                                        </View>
                                    ) : (
                                        <TouchableOpacity
                                            style={styles.applyBtn}
                                            onPress={() => handleApply(preset)}
                                        >
                                            <Text style={styles.applyBtnText}>프리셋 적용하기</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ))
                        )}

                        {/* Inline Add Button at the end of the list */}
                        <View style={styles.addContainer}>
                            <TouchableOpacity
                                style={styles.addInlineBtn}
                                onPress={() => router.push({ pathname: '/(tabs)/explore', params: { mode: 'new' } })}
                                activeOpacity={0.8}
                            >
                                <MaterialIcons name="add" size={28} color={SarvisTheme.colors.primary} />
                                <Text style={styles.addInlineBtnText}>새 프리셋 추가</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>

                    {/* Edit Name Modal */}
                    <Modal visible={showEditModal} transparent animationType="fade">
                        <View style={styles.modalOverlay}>
                            <View style={styles.modalContent}>
                                <Text style={styles.modalTitle}>이름 수정</Text>
                                <TextInput
                                    style={styles.input}
                                    value={editName}
                                    onChangeText={setEditName}
                                    placeholder="프리셋 이름"
                                    placeholderTextColor={SarvisTheme.colors.textMuted}
                                    autoFocus
                                />
                                <View style={styles.modalBtns}>
                                    <TouchableOpacity
                                        style={[styles.modalBtn, styles.btnOutline]}
                                        onPress={() => setShowEditModal(false)}
                                    >
                                        <Text style={styles.btnOutlineText}>취소</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.modalBtn, styles.btnPrimary]}
                                        onPress={saveNameEdit}
                                    >
                                        <Text style={styles.btnPrimaryText}>수정완료</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: SarvisTheme.colors.bg,
    },
    fab: {
        position: 'absolute',
        bottom: 30,
        right: 30,
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: SarvisTheme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: SarvisTheme.colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
        zIndex: 100,
    },
    addContainer: {
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 60, // Space for bottom tab bar
    },
    addInlineBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        borderWidth: 2,
        borderColor: SarvisTheme.colors.primary,
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 20,
        gap: 8,
        shadowColor: SarvisTheme.colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 3,
    },
    addInlineBtnText: {
        color: SarvisTheme.colors.primary,
        fontSize: 16,
        fontWeight: '900',
    },
    safeArea: { flex: 1 },
    root: { flex: 1 },
    statsHeaderContainer: {
        paddingHorizontal: 24,
        paddingVertical: 20,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: SarvisTheme.colors.border,
    },
    headerTitleText: { fontSize: 22, fontWeight: '900', color: SarvisTheme.colors.text },
    headerSubtitleText: { fontSize: 13, color: SarvisTheme.colors.textMuted, fontWeight: '600', marginTop: 2 },
    content: { padding: 20, paddingBottom: 40 },
    card: {
        backgroundColor: 'white',
        borderRadius: SarvisTheme.radius.xl,
        padding: 24,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: SarvisTheme.colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 3,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    cardIconBox: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: SarvisTheme.colors.primaryLight,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    cardInfo: { flex: 1 },
    cardTitle: { fontSize: 17, fontWeight: '800', color: SarvisTheme.colors.text, marginBottom: 2 },
    cardDate: { fontSize: 12, color: SarvisTheme.colors.textMuted, fontWeight: '500' },
    cardActionBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: SarvisTheme.colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
    },
    statsContainer: {
        flexDirection: 'row',
        backgroundColor: SarvisTheme.colors.bg,
        borderRadius: 16,
        paddingVertical: 14,
        marginBottom: 20,
        alignItems: 'center',
    },
    statItem: { flex: 1, alignItems: 'center' },
    statVal: { fontSize: 15, fontWeight: '900', color: SarvisTheme.colors.primary, marginBottom: 2 },
    statLabel: { fontSize: 11, color: SarvisTheme.colors.textMuted, fontWeight: '700', textTransform: 'uppercase' },
    statDivider: { width: 1, height: 20, backgroundColor: SarvisTheme.colors.border },
    applyBtn: {
        backgroundColor: SarvisTheme.colors.primary,
        height: 54,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: SarvisTheme.colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    applyBtnActive: {
        backgroundColor: SarvisTheme.colors.successLight,
        flexDirection: 'row',
        shadowOpacity: 0,
        elevation: 0,
        borderWidth: 1.5,
        borderColor: SarvisTheme.colors.success,
    },
    applyBtnText: { color: 'white', fontSize: 16, fontWeight: '800' },
    applyBtnTextActive: { color: SarvisTheme.colors.success, fontSize: 16, fontWeight: '800' },
    emptyRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
    emptyIconCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'white',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: SarvisTheme.colors.border,
    },
    emptyTitle: { fontSize: 20, fontWeight: '900', color: SarvisTheme.colors.text, marginBottom: 8 },
    emptyDesc: { fontSize: 15, color: SarvisTheme.colors.textMuted, textAlign: 'center', lineHeight: 22, fontWeight: '500', marginBottom: 32 },
    emptyBtn: {
        backgroundColor: SarvisTheme.colors.text,
        paddingHorizontal: 28,
        paddingVertical: 16,
        borderRadius: 16,
    },
    emptyBtnText: { color: 'white', fontSize: 15, fontWeight: '800' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', padding: 24 },
    modalContent: { backgroundColor: 'white', borderRadius: 32, padding: 24 },
    modalTitle: { fontSize: 22, fontWeight: '900', color: SarvisTheme.colors.text, marginBottom: 20 },
    input: {
        height: 56,
        backgroundColor: SarvisTheme.colors.bg,
        borderRadius: 16,
        paddingHorizontal: 16,
        fontSize: 16,
        color: SarvisTheme.colors.text,
        borderWidth: 1,
        borderColor: SarvisTheme.colors.border,
        marginBottom: 24,
        fontWeight: '600',
    },
    modalBtns: { flexDirection: 'row', gap: 12 },
    modalBtn: { flex: 1, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    btnOutline: { borderWidth: 1.5, borderColor: SarvisTheme.colors.border },
    btnOutlineText: { fontSize: 15, fontWeight: '800', color: SarvisTheme.colors.textLight },
    btnPrimary: { backgroundColor: SarvisTheme.colors.primary },
    btnPrimaryText: { fontSize: 15, fontWeight: '800', color: 'white' },

});
