import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Animated, Dimensions, Modal } from 'react-native';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { MaterialIcons } from '@expo/vector-icons';

interface VoiceCommandOverlayProps {
    visible: boolean;
    command: string;
    onClose: () => void;
}

const { width, height } = Dimensions.get('window');

export function VoiceCommandOverlay({ visible, command, onClose }: VoiceCommandOverlayProps) {
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (visible) {
            // 입구 애니메이션
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    friction: 8,
                    tension: 40,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]).start();

            // 맥박 애니메이션 (무한 반복)
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.15,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                ])
            ).start();

            // 3초 후 자동으로 닫기
            const timer = setTimeout(() => {
                handleClose();
            }, 3000);

            return () => clearTimeout(timer);
        }
    }, [visible]);

    const handleClose = () => {
        Animated.parallel([
            Animated.timing(scaleAnim, {
                toValue: 0.8,
                duration: 200,
                useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start(() => {
            onClose();
            // 애니메이션 값 초기화
            scaleAnim.setValue(0);
            opacityAnim.setValue(0);
            pulseAnim.setValue(1);
        });
    };

    if (!visible) return null;

    return (
        <Modal transparent visible={visible} animationType="none">
            <View style={styles.overlay}>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.4)' }]} />

                <Animated.View
                    style={[
                        styles.content,
                        {
                            opacity: opacityAnim,
                            transform: [{ scale: scaleAnim }],
                        },
                    ]}
                >
                    <View style={styles.glowContainer}>
                        <Animated.View
                            style={[
                                styles.pulseRing,
                                {
                                    transform: [{ scale: pulseAnim }],
                                },
                            ]}
                        />
                        <View style={styles.iconCircle}>
                            <MaterialIcons name="mic" size={48} color="white" />
                        </View>
                    </View>

                    <Text style={styles.title}>싸비스!</Text>
                    <Text style={styles.subtitle}>부르셨나요?</Text>
                    <Text style={styles.commandText}>"{command}" 감지됨</Text>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    content: {
        width: width * 0.8,
        padding: 40,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: 40,
        alignItems: 'center',
        shadowColor: SarvisTheme.colors.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    glowContainer: {
        width: 120,
        height: 120,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    pulseRing: {
        position: 'absolute',
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: SarvisTheme.colors.primary,
        opacity: 0.2,
    },
    iconCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: SarvisTheme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: SarvisTheme.colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 5,
    },
    title: {
        fontSize: 32,
        fontWeight: '900',
        color: SarvisTheme.colors.primary,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 20,
        fontWeight: '700',
        color: SarvisTheme.colors.text,
        marginBottom: 16,
    },
    commandText: {
        fontSize: 14,
        fontWeight: '600',
        color: SarvisTheme.colors.textMuted,
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 12,
        overflow: 'hidden',
    },
});
