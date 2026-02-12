import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SarvisTheme } from '@/constants/sarvis-theme';

export default function PrivacyScreen() {
    const router = useRouter();

    return (
        <SafeAreaView style={styles.root}>
            <View style={styles.header}>
                <Pressable style={styles.backBtn} onPress={() => router.back()}>
                    <Text style={styles.backText}>←</Text>
                </Pressable>
                <Text style={styles.headerTitle}>개인정보 처리방침</Text>
                <View style={styles.headerRight} />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.card}>
                    <Text style={styles.title}>개인정보 처리방침(요약)</Text>
                    <Text style={styles.body}>
                        본 화면은 데모 앱의 개인정보 처리방침 페이지입니다. 실제 서비스 적용 시 정책/보안 검토 및 고지 의무에 맞춰 정식 문서로 교체해야 합니다.{"\n\n"}
                        - 수집 항목: 계정 정보(닉네임/아이디/이메일), 기기 식별 정보, 얼굴/음성 벡터(선택/동의 기반).{"\n"}
                        - 이용 목적: 로그인/인증, 기기 연동, 사용자 맞춤 기능 제공.{"\n"}
                        - 보관/파기: 목적 달성 후 지체 없이 파기합니다.
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
