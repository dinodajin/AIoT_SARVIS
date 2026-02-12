import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { controlAPI } from '@/api/control';
import { SarvisAppHeader } from '@/components/sarvis/sarvis-app-header';
import { SarvisMenuModal } from '@/components/sarvis/sarvis-menu-modal';
import { SarvisTheme } from '@/constants/sarvis-theme';
import { useAuth } from '@/providers/auth-provider';

export default function HomeScreen() {
  const router = useRouter();
  const { user, selectedPreset, session } = useAuth();

  const [showMenu, setShowMenu] = useState(false);
  const [voiceMasterEnabled, setVoiceMasterEnabled] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [youtubeExpanded, setYoutubeExpanded] = useState(false);

  const toggleVoiceMaster = () => {
    const newState = !voiceMasterEnabled;
    setVoiceMasterEnabled(newState);
    if (!newState) {
      setYoutubeConnected(false);
    }
  };

  const sendButtonCommand = async (command: 'TRACK_ON' | 'TRACK_OFF' | 'COME_HERE' | 'HOME') => {
    if (!user || !user.uid || !session?.session_id) {
      console.warn('사용자 또는 세션 정보가 없습니다. 명령을 전송할 수 없습니다.');
      return;
    }

    try {
      await controlAPI.sendMacroCommand(user.uid, session.session_id, command);
    } catch (error) {
      console.error(`Failed to send command ${command}:`, error);
      Alert.alert('명령 전송 실패', '서버와의 통신에 실패했습니다.');
    }
  };

  const toggleTracking = () => {
    const newState = !trackingEnabled;
    setTrackingEnabled(newState);
    sendButtonCommand(newState ? 'TRACK_ON' : 'TRACK_OFF');
  };

  return (
    <View style={styles.container}>
      <SarvisAppHeader
        title="SARVIS"
        onMenuPress={() => setShowMenu(true)}
      />

      <SarvisMenuModal visible={showMenu} onClose={() => setShowMenu(false)} />

      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Voice Master Toggle */}
          {/* <TouchableOpacity
            style={[
              styles.card,
              styles.voiceMasterCard,
              voiceMasterEnabled && styles.voiceMasterCardActive
            ]}
            activeOpacity={0.9}
            onPress={toggleVoiceMaster}
          >
            <View style={styles.voiceMasterHeader}>
              <View style={styles.voiceMasterInfo}>
                <View style={[
                  styles.voiceMasterIconContainer,
                  voiceMasterEnabled && styles.voiceMasterIconContainerActive
                ]}>
                  {voiceMasterEnabled ? (
                    <MaterialIcons name="mic" size={28} color="#FFFFFF" />
                  ) : (
                    <MaterialIcons name="mic-off" size={28} color={SarvisTheme.colors.textMuted} />
                  )}
                </View>
                <View style={styles.voiceMasterTextContent}>
                  <Text style={[styles.voiceMasterTitle, voiceMasterEnabled && { color: '#FFFFFF' }]}>
                    {voiceMasterEnabled ? '음성인식 활성화' : '음성인식 비활성화'}
                  </Text>
                  <Text style={[styles.voiceMasterDesc, voiceMasterEnabled && { color: 'rgba(255,255,255,0.8)' }]}>
                    {voiceMasterEnabled ? '명령을 대기하고 있습니다.' : '음성 기능을 사용하려면 활성화하세요.'}
                  </Text>
                </View>
              </View>
              <Switch
                value={voiceMasterEnabled}
                onValueChange={toggleVoiceMaster}
                trackColor={{ false: '#CBD5E1', true: '#FFFFFF' }}
                thumbColor={voiceMasterEnabled ? SarvisTheme.colors.primary : '#FFFFFF'}
              />
            </View>
          </TouchableOpacity> */}

          {/* Follow Me Banner */}
          <View style={styles.bannerContainer}>
            <View style={styles.bannerCard}>
              <View style={styles.bannerContent}>
                <View style={styles.bannerInfo}>
                  <Text style={styles.bannerBadge}>LIVE AI</Text>
                  <Text style={styles.bannerTitle}>따라와</Text>
                  <Text style={styles.bannerDesc}>로봇이 사용자의 위치를 파악하여 자동으로 따라옵니다.</Text>
                </View>
                <Switch
                  value={trackingEnabled}
                  onValueChange={toggleTracking}
                  trackColor={{ false: 'rgba(255,255,255,0.2)', true: '#ffffff' }}
                  thumbColor="#ffffff"
                  ios_backgroundColor="rgba(255,255,255,0.2)"
                />
              </View>
            </View>
          </View>

          {/* Quick Commands */}
          <Text style={styles.sectionTitle}>빠른 명령</Text>
          <View style={styles.quickActionRow}>
            <TouchableOpacity
              style={styles.quickActionButton}
              activeOpacity={0.7}
              onPress={() => sendButtonCommand('COME_HERE')}
            >
              <View style={styles.quickActionIconBg}>
                <MaterialIcons name="person-pin-circle" size={24} color={SarvisTheme.colors.primary} />
              </View>
              <Text style={styles.quickActionText}>이리 와</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickActionButton}
              activeOpacity={0.7}
              onPress={() => sendButtonCommand('HOME')}
            >
              <View style={styles.quickActionIconBg}>
                <MaterialIcons name="visibility-off" size={24} color={SarvisTheme.colors.primary} />
              </View>
              <Text style={styles.quickActionText}>저리 가</Text>
            </TouchableOpacity>
          </View>

          {/* Multimedia Section */}
          {/* <Text style={styles.sectionTitle}>멀티미디어</Text>
          <View style={[styles.card, styles.featureCard]}>
            <View style={[styles.featureHeader, youtubeExpanded && styles.featureHeaderActive]}>
              <TouchableOpacity
                style={styles.featureLabelContainer}
                activeOpacity={0.7}
                onPress={() => setYoutubeExpanded(!youtubeExpanded)}
              >
                <FontAwesome name="youtube-play" size={24} color={SarvisTheme.colors.danger} />
                <Text style={styles.featureTitle}>Youtube 제어</Text>
                <MaterialIcons
                  name={youtubeExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                  size={20}
                  color={SarvisTheme.colors.textMuted}
                  style={{ marginLeft: 4 }}
                />
              </TouchableOpacity>
              <Switch
                value={youtubeConnected}
                onValueChange={setYoutubeConnected}
                trackColor={{ false: '#CBD5E1', true: SarvisTheme.colors.primary }}
                thumbColor="#ffffff"
              />
            </View>

            {youtubeExpanded && (
              <View style={styles.featureBody}>
                {youtubeConnected && (
                  <View style={styles.statusBadgeContainer}>
                    <View style={styles.statusDot} />
                    <Text style={styles.statusActive}>연결됨</Text>
                  </View>
                )}

                <Text style={styles.guideText}>로봇의 멀티미디어를 제어합니다.</Text>

                <View style={styles.commandGrid}>
                  <TouchableOpacity style={styles.commandButton} activeOpacity={0.7} onPress={() => YouTubeControl.sendCommand('backward10')}>
                    <View style={styles.commandIconCircle}>
                      <MaterialIcons name="replay-10" size={24} color={SarvisTheme.colors.primary} />
                    </View>
                    <Text style={styles.commandLabel}>10초 뒤로</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.commandButton} activeOpacity={0.7} onPress={() => YouTubeControl.sendCommand('forward10')}>
                    <View style={styles.commandIconCircle}>
                      <MaterialIcons name="forward-10" size={24} color={SarvisTheme.colors.primary} />
                    </View>
                    <Text style={styles.commandLabel}>10초 앞으로</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.commandRow}>
                  <TouchableOpacity style={styles.commandButtonSmall} activeOpacity={0.7} onPress={() => YouTubeControl.sendCommand('volumedown')}>
                    <View style={styles.commandIconCircleSmall}>
                      <MaterialIcons name="volume-down" size={20} color={SarvisTheme.colors.primary} />
                    </View>
                    <Text style={styles.commandLabelSmall}>볼륨-</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.commandButtonSmall} activeOpacity={0.7} onPress={() => YouTubeControl.sendCommand('play')}>
                    <View style={styles.commandIconCircleSmall}>
                      <MaterialIcons name="play-arrow" size={22} color={SarvisTheme.colors.primary} />
                    </View>
                    <Text style={styles.commandLabelSmall}>재생/정지</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.commandButtonSmall} activeOpacity={0.7} onPress={() => YouTubeControl.sendCommand('volumeup')}>
                    <View style={styles.commandIconCircleSmall}>
                      <MaterialIcons name="volume-up" size={20} color={SarvisTheme.colors.primary} />
                    </View>
                    <Text style={styles.commandLabelSmall}>볼륨+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View> */}

          {/* Shortcuts */}
          <Text style={styles.sectionTitle}>바로가기</Text>
          <View style={styles.shortcutsGrid}>
            <TouchableOpacity style={styles.shortcutCard} onPress={() => router.push('/(tabs)/explore' as any)} activeOpacity={0.7}>
              <View style={[styles.shortcutIconBox, { backgroundColor: '#EFF6FF' }]}>
                <MaterialIcons name="sports-esports" size={28} color={SarvisTheme.colors.primary} />
              </View>
              <Text style={styles.shortcutTitle}>수동 제어</Text>
              <Text style={styles.shortcutDesc}>직접 조작</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.shortcutCard} onPress={() => router.push('/(tabs)/preset-select' as any)} activeOpacity={0.7}>
              <View style={[styles.shortcutIconBox, { backgroundColor: '#EFF6FF' }]}>
                <MaterialIcons name="star" size={28} color={SarvisTheme.colors.primary} />
              </View>
              <Text style={styles.shortcutTitle}>프리셋</Text>
              <Text style={styles.shortcutDesc}>저장된 동작</Text>
            </TouchableOpacity>
          </View>

          {/* Current Preset Info */}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SarvisTheme.colors.bg },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 16 },

  // Voice Master Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 16,
  },
  voiceMasterCard: {
    marginTop: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
  },
  voiceMasterCardActive: {
    backgroundColor: SarvisTheme.colors.primary,
    borderColor: SarvisTheme.colors.primary,
  },
  voiceMasterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  voiceMasterInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  voiceMasterIconContainer: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center', alignItems: 'center', marginRight: 16,
  },
  voiceMasterIconContainerActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  voiceMasterTextContent: { flex: 1 },
  voiceMasterTitle: { fontSize: 18, fontWeight: '800', color: SarvisTheme.colors.text, marginBottom: 4 },
  voiceMasterDesc: { fontSize: 11, color: SarvisTheme.colors.textMuted, fontWeight: '500' },

  // Section
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 12, marginTop: 10 },

  // Banner
  bannerContainer: { marginBottom: 20 },
  bannerCard: { backgroundColor: SarvisTheme.colors.primary, padding: 24, borderRadius: 30 },
  bannerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bannerInfo: { flex: 1, marginRight: 16 },
  bannerBadge: { backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden', alignSelf: 'flex-start', marginBottom: 8 },
  bannerTitle: { fontSize: 24, fontWeight: '900', color: '#fff', marginBottom: 4 },
  bannerDesc: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  lockBadgeBanner: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },

  // Quick Actions
  quickActionRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  quickActionButton: {
    flex: 1, backgroundColor: '#fff', borderRadius: 24, padding: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  quickActionIconBg: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  quickActionText: { fontSize: 15, fontWeight: '800', color: SarvisTheme.colors.text },

  // Feature Card
  featureCard: { padding: 0, overflow: 'hidden' },
  featureHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  featureHeaderActive: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  featureLabelContainer: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  featureTitle: { fontSize: 16, fontWeight: '800', color: SarvisTheme.colors.text },
  featureBody: { paddingHorizontal: 20, paddingBottom: 20 },
  statusBadgeContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  statusActive: { fontSize: 12, fontWeight: '700', color: '#22C55E' },
  guideText: { fontSize: 13, color: SarvisTheme.colors.textMuted, marginBottom: 16 },

  // Command Buttons
  commandGrid: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 12 },
  commandButton: { alignItems: 'center', gap: 6 },
  commandIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
  commandLabel: { fontSize: 12, fontWeight: '700', color: SarvisTheme.colors.text },
  commandRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  commandButtonSmall: { alignItems: 'center', gap: 4 },
  commandIconCircleSmall: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
  commandLabelSmall: { fontSize: 11, fontWeight: '600', color: SarvisTheme.colors.textMuted },

  // Shortcuts
  shortcutsGrid: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  shortcutCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 20, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  shortcutIconBox: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  shortcutTitle: { fontSize: 15, fontWeight: '800', color: SarvisTheme.colors.text, marginBottom: 2 },
  shortcutDesc: { fontSize: 12, color: SarvisTheme.colors.textMuted },

  // Preset Info
  presetInfoCard: { backgroundColor: SarvisTheme.colors.primaryLight, borderRadius: 16, padding: 16, alignItems: 'center' },
  presetInfoTitle: { fontSize: 14, fontWeight: '700', color: SarvisTheme.colors.primary },
});