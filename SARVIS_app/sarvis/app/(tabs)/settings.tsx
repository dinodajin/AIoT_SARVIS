import { authAPI } from '@/api/auth';
import { SarvisAppHeader } from '@/components/sarvis/sarvis-app-header';
import { SarvisMenuModal } from '@/components/sarvis/sarvis-menu-modal';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { useAuth } from '@/providers/auth-provider';
import { userStorage, type UserInfo } from '@/utils/userStorage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
    const router = useRouter();
    const { signOut } = useAuth();

    // UI State
    const [showMenu, setShowMenu] = useState(false);
    const [loading, setLoading] = useState(true);
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

    // Edit Modal State
    const [showEditModal, setShowEditModal] = useState(false);
    const [editField, setEditField] = useState<'nickname' | 'email' | null>(null);
    const [editValue, setEditValue] = useState('');

    // Withdraw Modal State
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [withdrawStep, setWithdrawStep] = useState(1);
    const [selectedReason, setSelectedReason] = useState<string | null>(null);
    const [otherReason, setOtherReason] = useState('');
    const [withdrawPassword, setWithdrawPassword] = useState('');
    const [isWithdrawing, setIsWithdrawing] = useState(false);

    useEffect(() => {
        loadUserInfo();
    }, []);

    useFocusEffect(
        React.useCallback(() => {
            loadUserInfo();
        }, [])
    );

    const loadUserInfo = async () => {
        try {
            setLoading(true);
            const storedUserInfo = await userStorage.getUserInfo();
            if (storedUserInfo) {
                setUserInfo(storedUserInfo);
            }

            try {
                const profileRes = await authAPI.getProfile();
                const serverUser = (profileRes as any).user || (profileRes.data as any)?.user;

                if (serverUser) {
                    const updatedInfo: Partial<UserInfo> = {
                        nickname: serverUser.nickname,
                        email: serverUser.email,
                        voiceRegistered: serverUser.has_voice ?? serverUser.voiceRegistered ?? false,
                        faceRegistered: true,
                        login_id: serverUser.login_id
                    };
                    const newUserInfo = await userStorage.updateUserInfo(updatedInfo);
                    if (newUserInfo) {
                        setUserInfo(newUserInfo);
                    }
                }
            } catch (apiError) {
                console.log('Failed to fetch profile from server:', apiError);
            }
        } catch (error) {
            console.error('사용자 정보 로드 실패:', error);
        } finally {
            setLoading(false);
        }
    };

    const openEditModal = (field: 'nickname' | 'email', currentValue: string) => {
        setEditField(field);
        setEditValue(currentValue);
        setShowEditModal(true);
    };

    const saveEdit = async () => {
        if (!editField || !editValue.trim() || !userInfo) {
            Alert.alert('오류', '값을 입력해주세요.');
            return;
        }

        try {
            const updatedUserInfo = await userStorage.updateUserInfo({ [editField]: editValue.trim() });
            if (updatedUserInfo) {
                setUserInfo(updatedUserInfo);
                setShowEditModal(false);
                setEditField(null);
                setEditValue('');
                Alert.alert('성공', '정보가 수정되었습니다.');
            }
        } catch (error) {
            console.error('정보 수정 실패:', error);
            Alert.alert('오류', '정보 수정에 실패했습니다.');
        }
    };

    const handleFaceReset = () => {
        Alert.alert('얼굴 재설정', '얼굴 정보를 다시 등록하시겠습니까?', [
            { text: '취소', style: 'cancel' },
            { text: '확인', onPress: () => router.push('/(auth)/face-reregister' as any) },
        ]);
    };

    const handleVoiceReset = () => {
        Alert.alert('목소리 재설정', '목소리 정보를 다시 등록하시겠습니까?', [
            { text: '취소', style: 'cancel' },
            { text: '확인', onPress: () => router.push('/(auth)/voice-reregister' as any) },
        ]);
    };

    const handleLogout = () => {
        Alert.alert('로그아웃', '로그아웃하시겠습니까?', [
            { text: '취소', style: 'cancel' },
            {
                text: '로그아웃',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await signOut();
                        router.replace('/(auth)/login' as any);
                    } catch (error) {
                        console.error('로그아웃 실패:', error);
                        Alert.alert('오류', '로그아웃에 실패했습니다.');
                    }
                },
            },
        ]);
    };

    const accountMenuItems = [
        { id: 'face-reset', title: '얼굴 재설정', subtitle: '얼굴 정보를 다시 등록합니다', onPress: handleFaceReset },
        { id: 'voice-reset', title: '목소리 재설정', subtitle: '목소리 정보를 다시 등록합니다', onPress: handleVoiceReset },
        { id: 'logout', title: '로그아웃', subtitle: '로그아웃하고 초기 화면으로 이동', onPress: handleLogout, isDestructive: true },
    ];

    const handleWithdraw = async () => {
        if (!withdrawPassword.trim()) {
            Alert.alert('오류', '비밀번호를 입력해주세요.');
            return;
        }

        if (!userInfo?.login_id) {
            Alert.alert('오류', '사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.');
            return;
        }

        try {
            setIsWithdrawing(true);
            const reason = selectedReason === 'OTHER' ? otherReason : withdrawalReasons.find(r => r.id === selectedReason)?.label;

            console.log('🚀 회원 탈퇴 요청 시작...', { login_id: userInfo.login_id, reason });

            const response = await authAPI.deleteAccount(
                userInfo.login_id,
                withdrawPassword,
                reason || ''
            );

            if (response.success) {
                await signOut();
                setShowWithdrawModal(false);
                Alert.alert('탈퇴 완료', '회원 탈퇴가 완료되었습니다.');
                router.replace('/(auth)/login' as any);
            } else {
                Alert.alert('탈퇴 실패', response.message || '비밀번호가 일치하지 않거나 탈퇴 처리 중 오류가 발생했습니다.');
            }
        } catch (error: any) {
            console.error('❌ 회원 탈퇴 오류:', error);
            const errorMsg = error.response?.data?.message || error.message || '탈퇴 처리에 실패했습니다.';
            Alert.alert('오류', errorMsg);
        } finally {
            setIsWithdrawing(false);
        }
    };

    const withdrawalReasons = [
        { id: 'INCONVENIENT', label: '사용이 불편함' },
        { id: 'PRIVACY', label: '개인정보 유출 우려' },
        { id: 'NOT_USED', label: '자주 사용하지 않음' },
        { id: 'OTHER', label: '기타' },
    ];

    return (
        <View style={styles.container}>
            <SarvisAppHeader title="" showBackButton={true} onMenuPress={() => setShowMenu(true)} />

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <View style={styles.root}>
                    <SarvisMenuModal visible={showMenu} onClose={() => setShowMenu(false)} />

                    <View style={styles.content}>
                        {loading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={SarvisTheme.colors.primary} />
                                <Text style={styles.loadingText}>로딩 중...</Text>
                            </View>
                        ) : userInfo ? (
                            <>
                                {/* Profile Header */}
                                <View style={styles.profileHeader}>
                                    <Text style={styles.userName}>{userInfo.nickname}</Text>
                                    <Text style={styles.userEmail}>{userInfo.email}</Text>
                                    <View style={styles.statusContainer}>
                                        <View style={[styles.statusItem, userInfo.faceRegistered ? styles.statusComplete : styles.statusIncomplete]}>
                                            <Text style={styles.statusText}>얼굴: {userInfo.faceRegistered ? '등록 완료' : '미등록'}</Text>
                                        </View>
                                        <View style={[styles.statusItem, userInfo.voiceRegistered ? styles.statusComplete : styles.statusIncomplete]}>
                                            <Text style={styles.statusText}>목소리: {userInfo.voiceRegistered ? '등록 완료' : '미등록'}</Text>
                                        </View>
                                    </View>
                                </View>

                                {/* User Info Card */}
                                <View style={styles.infoCard}>
                                    <Text style={styles.cardTitle}>사용자 정보</Text>
                                    <TouchableOpacity style={styles.infoItem} onPress={() => openEditModal('nickname', userInfo.nickname)}>
                                        <View style={styles.infoLeft}>
                                            <Text style={styles.infoLabel}>닉네임</Text>
                                            <Text style={styles.infoValue}>{userInfo.nickname}</Text>
                                        </View>
                                        <Text style={styles.arrow}>›</Text>
                                    </TouchableOpacity>
                                    <View style={[styles.infoItem, styles.noBorder]}>
                                        <View style={styles.infoLeft}>
                                            <Text style={styles.infoLabel}>이메일</Text>
                                            <Text style={styles.infoValue}>{userInfo.email}</Text>
                                        </View>
                                    </View>
                                </View>

                                {/* Spacer */}
                                <View style={{ flex: 1 }} />

                                {/* Menu Items */}
                                <View style={styles.menuContainer}>
                                    {accountMenuItems.map((item) => (
                                        <TouchableOpacity key={item.id} style={[styles.menuItem, item.isDestructive && styles.logoutItem]} onPress={item.onPress}>
                                            <View style={styles.menuLeft}>
                                                <Text style={[styles.menuText, item.isDestructive && styles.logoutText]}>{item.title}</Text>
                                                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                                            </View>
                                            <Text style={[styles.arrow, item.isDestructive && styles.logoutText]}>›</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </>
                        ) : (
                            <View style={styles.errorContainer}>
                                <Text style={styles.errorText}>사용자 정보를 불러올 수 없습니다.</Text>
                            </View>
                        )}

                        {/* Withdraw Link */}
                        <TouchableOpacity
                            style={styles.withdrawLink}
                            onPress={() => {
                                setWithdrawStep(1);
                                setSelectedReason(null);
                                setOtherReason('');
                                setWithdrawPassword('');
                                setShowWithdrawModal(true);
                            }}
                        >
                            <Text style={styles.withdrawLinkText}>회원 탈퇴</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Edit Modal */}
                    <Modal visible={showEditModal} transparent animationType="fade" onRequestClose={() => setShowEditModal(false)}>
                        <View style={styles.modalOverlay}>
                            <View style={styles.modalContent}>
                                <Text style={styles.modalTitle}>{editField === 'nickname' ? '닉네임 수정' : '이메일 수정'}</Text>
                                <TextInput
                                    style={styles.textInput}
                                    value={editValue}
                                    onChangeText={setEditValue}
                                    placeholder={editField === 'nickname' ? '닉네임을 입력하세요' : '이메일을 입력하세요'}
                                    autoFocus
                                    keyboardType={editField === 'email' ? 'email-address' : 'default'}
                                />
                                <View style={styles.modalButtons}>
                                    <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setShowEditModal(false)}>
                                        <Text style={styles.cancelBtnText}>취소</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.modalBtn, styles.confirmBtn]} onPress={saveEdit}>
                                        <Text style={styles.confirmBtnText}>저장</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>

                    {/* Withdraw Modal */}
                    <Modal visible={showWithdrawModal} transparent animationType="slide" onRequestClose={() => setShowWithdrawModal(false)}>
                        <View style={styles.modalOverlay}>
                            <View style={[styles.modalContent, { maxHeight: '80%' }]}>
                                {withdrawStep === 1 ? (
                                    <>
                                        <Text style={styles.modalTitle}>탈퇴 사유 선택</Text>
                                        <Text style={styles.modalSubtitle}>더 나은 서비스를 위해 탈퇴 사유를 알려주세요.</Text>
                                        <ScrollView style={styles.reasonList}>
                                            {withdrawalReasons.map((reason) => (
                                                <TouchableOpacity
                                                    key={reason.id}
                                                    style={[styles.reasonItem, selectedReason === reason.id && styles.reasonItemSelected]}
                                                    onPress={() => setSelectedReason(reason.id)}
                                                >
                                                    <MaterialIcons name={selectedReason === reason.id ? "radio-button-checked" : "radio-button-unchecked"} size={20} color={selectedReason === reason.id ? SarvisTheme.colors.primary : '#adb5bd'} />
                                                    <Text style={[styles.reasonText, selectedReason === reason.id && styles.reasonTextSelected]}>{reason.label}</Text>
                                                </TouchableOpacity>
                                            ))}
                                            {selectedReason === 'OTHER' && (
                                                <TextInput style={styles.reasonInput} placeholder="탈퇴 사유를 직접 입력해주세요" placeholderTextColor="#adb5bd" multiline numberOfLines={3} value={otherReason} onChangeText={setOtherReason} />
                                            )}
                                        </ScrollView>
                                        <View style={styles.modalButtons}>
                                            <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setShowWithdrawModal(false)}>
                                                <Text style={styles.cancelBtnText}>취소</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={[styles.modalBtn, styles.confirmBtn, !selectedReason && { opacity: 0.5 }]} disabled={!selectedReason} onPress={() => setWithdrawStep(2)}>
                                                <Text style={styles.confirmBtnText}>다음</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </>
                                ) : withdrawStep === 2 ? (
                                    <>
                                        <Text style={styles.modalTitle}>비밀번호 확인</Text>
                                        <Text style={styles.modalSubtitle}>본인 확인을 위해 비밀번호(6자리 숫자)를 입력해주세요.</Text>
                                        <TextInput
                                            style={styles.textInput}
                                            value={withdrawPassword}
                                            onChangeText={setWithdrawPassword}
                                            placeholder="비밀번호 입력"
                                            secureTextEntry
                                            keyboardType="number-pad"
                                            maxLength={6}
                                            autoFocus
                                        />
                                        <View style={styles.modalButtons}>
                                            <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setWithdrawStep(1)}>
                                                <Text style={styles.cancelBtnText}>이전</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.modalBtn, styles.confirmBtn, withdrawPassword.length < 6 && { opacity: 0.5 }]}
                                                disabled={withdrawPassword.length < 6}
                                                onPress={() => setWithdrawStep(3)}
                                            >
                                                <Text style={styles.confirmBtnText}>다음</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </>
                                ) : (
                                    <>
                                        <View style={styles.warningIconContainer}>
                                            <MaterialIcons name="warning" size={48} color="#dc3545" />
                                        </View>
                                        <Text style={styles.modalTitle}>정말로 탈퇴하시겠습니까?</Text>
                                        <Text style={styles.warningText}>계정을 탈퇴하면 모든 데이터가 삭제되며, 복구할 수 없습니다.</Text>
                                        <View style={styles.modalButtons}>
                                            <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setWithdrawStep(2)}>
                                                <Text style={styles.cancelBtnText}>이전</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.modalBtn, { backgroundColor: '#dc3545' }, isWithdrawing && { opacity: 0.7 }]}
                                                onPress={handleWithdraw}
                                                disabled={isWithdrawing}
                                            >
                                                {isWithdrawing ? (
                                                    <ActivityIndicator size="small" color="white" />
                                                ) : (
                                                    <Text style={styles.confirmBtnText}>탈퇴하기</Text>
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    </>
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
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    safeArea: { flex: 1 },
    root: { flex: 1 },
    content: { flex: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },

    profileHeader: { alignItems: 'center', paddingVertical: 20, backgroundColor: 'white', borderRadius: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    userName: { fontSize: 22, fontWeight: 'bold', color: '#212529', marginBottom: 4 },
    userEmail: { fontSize: 15, color: '#6c757d', marginBottom: 4 },
    statusContainer: { flexDirection: 'row', gap: 8, marginTop: 12 },
    statusItem: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
    statusComplete: { backgroundColor: SarvisTheme.colors.successLight, borderColor: SarvisTheme.colors.success },
    statusIncomplete: { backgroundColor: SarvisTheme.colors.primaryLight, borderColor: SarvisTheme.colors.primary },
    statusText: { fontSize: 11, fontWeight: '600', color: SarvisTheme.colors.text },

    infoCard: { backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, borderLeftWidth: 4, borderLeftColor: SarvisTheme.colors.primary },
    cardTitle: { fontSize: 17, fontWeight: 'bold', color: '#212529', marginBottom: 12 },
    infoItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' },
    noBorder: { borderBottomWidth: 0 },
    infoLeft: { flex: 1 },
    infoLabel: { fontSize: 13, fontWeight: '600', color: '#6c757d', marginBottom: 2 },
    infoValue: { fontSize: 15, color: '#212529' },

    menuContainer: { backgroundColor: 'white', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f1f3f5' },
    menuLeft: { flex: 1 },
    menuText: { fontSize: 15, fontWeight: '500', color: '#212529', marginBottom: 2 },
    menuSubtitle: { fontSize: 11, color: '#6c757d' },
    arrow: { fontSize: 18, color: '#adb5bd', fontWeight: 'bold' },
    logoutItem: { borderBottomWidth: 0 },
    logoutText: { color: '#dc3545' },

    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { fontSize: 16, color: SarvisTheme.colors.textLight, marginTop: 12 },
    errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    errorText: { fontSize: 16, color: SarvisTheme.colors.textLight, textAlign: 'center' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: 'white', borderRadius: 16, padding: 20, width: '90%', maxWidth: 400, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#212529', marginBottom: 16, textAlign: 'center' },
    textInput: { borderWidth: 1, borderColor: SarvisTheme.colors.border, borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16, color: SarvisTheme.colors.text },
    modalButtons: { flexDirection: 'row', gap: 12 },
    modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    cancelBtn: { backgroundColor: '#F3F4F6' },
    cancelBtnText: { color: SarvisTheme.colors.text, fontWeight: '600' },
    confirmBtn: { backgroundColor: SarvisTheme.colors.primary },
    confirmBtnText: { color: 'white', fontWeight: '600' },

    withdrawLink: { marginTop: 32, alignSelf: 'center', padding: 10 },
    withdrawLinkText: { fontSize: 13, color: '#adb5bd', textDecorationLine: 'underline' },
    modalSubtitle: { fontSize: 14, color: '#6c757d', textAlign: 'center', marginBottom: 20 },
    reasonList: { width: '100%', marginBottom: 20 },
    reasonItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#f8f9fa', marginBottom: 8, borderWidth: 1, borderColor: '#f1f3f5' },
    reasonItemSelected: { backgroundColor: SarvisTheme.colors.primaryLight + '40', borderColor: SarvisTheme.colors.primary },
    reasonText: { fontSize: 15, marginLeft: 12, color: '#495057' },
    reasonTextSelected: { color: SarvisTheme.colors.primary, fontWeight: 'bold' },
    reasonInput: { backgroundColor: '#f8f9fa', borderRadius: 12, padding: 12, marginTop: 4, marginBottom: 8, borderWidth: 1, borderColor: '#e9ecef', textAlignVertical: 'top', color: SarvisTheme.colors.text },
    warningIconContainer: { alignItems: 'center', marginTop: 10, marginBottom: 16 },
    warningText: { fontSize: 14, color: '#495057', textAlign: 'center', lineHeight: 22, marginBottom: 24, backgroundColor: '#fff5f5', padding: 16, borderRadius: 12 },
});
