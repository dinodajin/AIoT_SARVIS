import React from 'react';
import {
    Modal,
    StyleSheet,
    View,
    Text,
    Pressable,
    TouchableOpacity,
    Alert,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SarvisTheme } from '@/constants/sarvis-theme';

interface MenuItem {
    id: string;
    label: string;
    icon: keyof typeof MaterialIcons.glyphMap;
    path: string;
}

interface SarvisMenuModalProps {
    visible: boolean;
    onClose: () => void;
}

export function SarvisMenuModal({ visible, onClose }: SarvisMenuModalProps) {
    const router = useRouter();
    const pathname = usePathname();

    const menuItems: MenuItem[] = [
        { id: 'home', label: '대시보드', icon: 'dashboard', path: '/(tabs)' },
        { id: 'explore', label: '제어', icon: 'sports-esports', path: '/(tabs)/explore' },
        { id: 'presets', label: '프리셋', icon: 'star', path: '/(tabs)/preset-select' },
        { id: 'settings', label: '설정', icon: 'settings', path: '/(tabs)/settings' },
        { id: 'face', label: '얼굴 재설정', icon: 'face', path: '/(auth)/face-reregister' },
        { id: 'voice', label: '목소리 재설정', icon: 'record-voice-over', path: '/(auth)/voice-reregister' },
    ];

    const handleNavigation = (path: string, label: string) => {
        if (pathname === path) {
            onClose();
            return;
        }

        if (path.includes('reregister')) {
            Alert.alert(
                '재설정 확인',
                `${label}을(를) 재설정하시겠습니까?`,
                [
                    { text: '취소', style: 'cancel' },
                    {
                        text: '확인',
                        onPress: () => {
                            onClose();
                            router.push(path as any);
                        }
                    }
                ]
            );
        } else {
            onClose();
            router.push(path as any);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable style={styles.overlay} onPress={onClose}>
                <View style={styles.drawer}>
                    <View style={styles.header}>
                        <Text style={styles.title}>메뉴</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <MaterialIcons name="close" size={24} color={SarvisTheme.colors.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.menuList}>
                        {menuItems.map((item) => {
                            const isActive = pathname === item.path;
                            return (
                                <TouchableOpacity
                                    key={item.id}
                                    style={[styles.menuItem, isActive && styles.activeMenuItem]}
                                    onPress={() => handleNavigation(item.path, item.label)}
                                    activeOpacity={0.7}
                                >
                                    <View style={[styles.iconContainer, isActive && styles.activeIconContainer]}>
                                        <MaterialIcons
                                            name={item.icon}
                                            size={22}
                                            color={isActive ? 'white' : SarvisTheme.colors.primary}
                                        />
                                    </View>
                                    <Text style={[styles.menuLabel, isActive && styles.activeMenuLabel]}>
                                        {item.label}
                                    </Text>
                                    {isActive && <View style={styles.activeIndicator} />}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <View style={styles.footer}>
                        <Text style={styles.versionText}>SARVIS v1.0.4</Text>
                    </View>
                </View>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    drawer: {
        width: '75%',
        height: '100%',
        backgroundColor: 'white',
        borderTopLeftRadius: 32,
        borderBottomLeftRadius: 32,
        paddingTop: 60,
        paddingHorizontal: 24,
        shadowColor: '#000',
        shadowOffset: { width: -4, height: 0 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 40,
    },
    title: {
        fontSize: 24,
        fontWeight: '900',
        color: SarvisTheme.colors.text,
    },
    closeBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuList: {
        gap: 12,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 18,
        gap: 16,
        position: 'relative',
    },
    activeMenuItem: {
        backgroundColor: SarvisTheme.colors.primaryLight + '40',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: SarvisTheme.colors.primaryLight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    activeIconContainer: {
        backgroundColor: SarvisTheme.colors.primary,
    },
    menuLabel: {
        fontSize: 16,
        fontWeight: '700',
        color: SarvisTheme.colors.text,
    },
    activeMenuLabel: {
        color: SarvisTheme.colors.primary,
        fontWeight: '800',
    },
    activeIndicator: {
        position: 'absolute',
        right: 16,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: SarvisTheme.colors.primary,
    },
    footer: {
        position: 'absolute',
        bottom: 40,
        left: 24,
        right: 24,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        paddingTop: 20,
    },
    versionText: {
        fontSize: 12,
        color: SarvisTheme.colors.textMuted,
        fontWeight: '600',
    },
});
