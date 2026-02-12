import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SarvisTheme } from '@/constants/sarvis-theme';

export default function DeviceInfoScreen() {
    const router = useRouter();

    return (
        <SafeAreaView style={styles.root}>
            <View style={styles.header}>
                <Pressable style={styles.backBtn} onPress={() => router.back()}>
                    <Text style={styles.backText}>←</Text>
                </Pressable>
                <Text style={styles.headerTitle}>기기 정보</Text>
                <View style={styles.headerRight} />
            </View>

            <View style={styles.content}>
                <View style={styles.card}>
                    <Text style={styles.icon}>🤖</Text>
                    <Text style={styles.name}>거실로봇</Text>
                    <Text style={styles.type}>SARVIS-Pro</Text>

                    <View style={styles.infoList}>
                        <Row label="Serial Number" value="SN-00123456789" />
                        <Row label="펌웨어 버전" value="1.0.0" />
                        <Row label="마지막 연결" value="2026-01-20 15:00:00" />
                        <Row label="앱 버전" value="1.0.0" />
                    </View>
                </View>
            </View>
        </SafeAreaView>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: SarvisTheme.colors.bg },
    header: { backgroundColor: 'white', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: SarvisTheme.colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backBtn: { width: 40, height: 40, borderRadius: SarvisTheme.radius.md, backgroundColor: SarvisTheme.colors.bg, borderWidth: 1, borderColor: SarvisTheme.colors.border, alignItems: 'center', justifyContent: 'center' },
    backText: { fontSize: 18, fontWeight: '900', color: SarvisTheme.colors.text },
    headerTitle: { fontSize: 18, fontWeight: '900', color: SarvisTheme.colors.text },
    headerRight: { width: 40, height: 40 },
    content: { flex: 1, padding: 16 },
    card: { backgroundColor: 'white', borderRadius: SarvisTheme.radius.lg, borderWidth: 1, borderColor: SarvisTheme.colors.border, padding: 24, alignItems: 'center' },
    icon: { fontSize: 72, marginBottom: 12 },
    name: { fontSize: 24, fontWeight: '900', color: SarvisTheme.colors.text, marginBottom: 6 },
    type: { fontSize: 14, fontWeight: '800', color: SarvisTheme.colors.textLight, backgroundColor: SarvisTheme.colors.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: SarvisTheme.radius.md, marginBottom: 18 },
    infoList: { width: '100%', gap: 12 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: SarvisTheme.colors.bg, borderRadius: SarvisTheme.radius.md },
    rowLabel: { fontSize: 13, fontWeight: '800', color: SarvisTheme.colors.textLight },
    rowValue: { fontSize: 13, fontWeight: '700', color: SarvisTheme.colors.text, maxWidth: '55%', textAlign: 'right' },
});
