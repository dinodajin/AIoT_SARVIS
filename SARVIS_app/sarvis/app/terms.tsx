import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SarvisTheme } from '@/constants/sarvis-theme';

export default function TermsScreen() {
    const router = useRouter();

    return (
        <SafeAreaView style={styles.root}>
            <View style={styles.header}>
                <Pressable style={styles.backBtn} onPress={() => router.back()}>
                    <Text style={styles.backText}>←</Text>
                </Pressable>
                <Text style={styles.headerTitle}>이용약관</Text>
                <View style={styles.headerRight} />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.card}>
                    <Text style={styles.title}>SARVIS 이용약관(요약)</Text>
                    <Text style={styles.body}>
                        본 화면은 데모 앱의 약관 페이지입니다. 실제 서비스 적용 시 법무/정책 검토를 거친 정식 약관으로 교체해야 합니다.{"\n\n"}
                        1. 서비스 제공: SARVIS 앱은 로봇 제어/상태 확인 기능을 제공합니다.{"\n"}
                        2. 계정/보안: 이용자는 계정 정보를 안전하게 관리해야 합니다.{"\n"}
                        3. 책임 제한: 네트워크/기기 환경에 따라 일부 기능이 제한될 수 있습니다.{"\n"}
                        4. 변경: 약관은 사전 고지 후 변경될 수 있습니다.
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: SarvisTheme.colors.bg },
    header: { backgroundColor: 'white', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: SarvisTheme.colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backBtn: { width: 40, height: 40, borderRadius: SarvisTheme.radius.md, backgroundColor: SarvisTheme.colors.bg, borderWidth: 1, borderColor: SarvisTheme.colors.border, alignItems: 'center', justifyContent: 'center' },
    backText: { fontSize: 18, fontWeight: '900', color: SarvisTheme.colors.text },
    headerTitle: { fontSize: 18, fontWeight: '900', color: SarvisTheme.colors.text },
    headerRight: { width: 40, height: 40 },
    content: { padding: 16 },
    card: { backgroundColor: 'white', borderRadius: SarvisTheme.radius.lg, borderWidth: 1, borderColor: SarvisTheme.colors.border, padding: 18 },
    title: { fontSize: 16, fontWeight: '900', color: SarvisTheme.colors.text, marginBottom: 12 },
    body: { fontSize: 13, fontWeight: '600', color: SarvisTheme.colors.textLight, lineHeight: 20 },
});
