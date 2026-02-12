
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { SarvisAppHeader } from '@/components/sarvis/sarvis-app-header';
import { SarvisButton } from '@/components/sarvis/sarvis-button';
import { SarvisFooter } from '@/components/sarvis/sarvis-footer';
import { SarvisTheme } from '@/constants/sarvis-theme';

type RobotStatus = 'IDLE' | 'TRACKING' | 'MOVING' | 'ASIDE';

export default function HomeScreen() {
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [robotStatus, setRobotStatus] = useState<RobotStatus>('IDLE');

  const statusText = useMemo(() => {
    if (robotStatus === 'TRACKING') return '현재 상태: 추적 중';
    if (robotStatus === 'MOVING') return '현재 상태: 이동 중';
    if (robotStatus === 'ASIDE') return '현재 상태: 시야 밖으로 이동';
    return '현재 상태: 대기 중';
  }, [robotStatus]);

  return (
    <View style={styles.root}>
      <SarvisAppHeader />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.statusBox, robotStatusStyles(robotStatus).box]}>
          <View style={[styles.statusDot, robotStatusStyles(robotStatus).dot]} />
          <Text style={[styles.statusText, robotStatusStyles(robotStatus).text]}>{statusText}</Text>
        </View>

        <View style={[styles.voiceCard, voiceEnabled ? styles.voiceListening : styles.voiceOff]}>
          <View style={styles.voiceHeader}>
            <View style={styles.voiceLabel}>
              <Text style={styles.voiceLabelText}>🎤</Text>
              <Text style={styles.voiceLabelText}>음성 명령</Text>
            </View>
            <Switch
              value={voiceEnabled}
              onValueChange={(v) => setVoiceEnabled(v)}
              trackColor={{ false: '#475569', true: SarvisTheme.colors.success }}
            />
          </View>

          <View style={styles.voiceIndicator}>
            <View style={styles.voiceWave} />
            <View style={styles.voiceWave} />
            <View style={styles.voiceWave} />
            <View style={styles.voiceWave} />
          </View>

          <Text style={[styles.voiceText, voiceEnabled ? styles.voiceTextOn : styles.voiceTextOff]}>
            {voiceEnabled ? '듣고 있습니다...' : '비활성화됨'}
          </Text>
        </View>

        <View style={styles.trackingCard}>
          <View style={styles.trackingLeft}>
            <Text style={styles.trackingIcon}>👀</Text>
            <Text style={styles.trackingText}>사용자 추적</Text>
          </View>
          <Switch
            value={trackingEnabled}
            onValueChange={(v) => {
              setTrackingEnabled(v);
              setRobotStatus(v ? 'TRACKING' : 'IDLE');
            }}
            trackColor={{ false: '#C4B5FD', true: SarvisTheme.colors.primary }}
          />
        </View>

        <SarvisButton
          title="🙈 시야 밖으로"
          variant="outline"
          onPress={() => {
            setRobotStatus('ASIDE');
            setTimeout(() => setRobotStatus(trackingEnabled ? 'TRACKING' : 'IDLE'), 1200);
          }}
        />
      </ScrollView>

      <SarvisFooter />
    </View>
  );
}

function robotStatusStyles(status: RobotStatus) {
  if (status === 'TRACKING') {
    return {
      box: { backgroundColor: SarvisTheme.colors.successLight, borderColor: SarvisTheme.colors.success },
      dot: { backgroundColor: SarvisTheme.colors.success },
      text: { color: SarvisTheme.colors.success },
    };
  }
  if (status === 'MOVING') {
    return {
      box: { backgroundColor: '#e3f2fd', borderColor: '#3b82f6' },
      dot: { backgroundColor: '#3b82f6' },
      text: { color: '#3b82f6' },
    };
  }
  if (status === 'ASIDE') {
    return {
      box: { backgroundColor: SarvisTheme.colors.warningLight, borderColor: SarvisTheme.colors.warning },
      dot: { backgroundColor: SarvisTheme.colors.warning },
      text: { color: SarvisTheme.colors.warning },
    };
  }

  return {
    box: { backgroundColor: SarvisTheme.colors.bg, borderColor: SarvisTheme.colors.border },
    dot: { backgroundColor: SarvisTheme.colors.textMuted },
    text: { color: SarvisTheme.colors.textLight },
  };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SarvisTheme.colors.bg,
  },
  content: {
    padding: 16,
  },
  statusBox: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: SarvisTheme.radius.md,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontWeight: '800',
    fontSize: 14,
  },
  voiceCard: {
    borderRadius: SarvisTheme.radius.lg,
    padding: 24,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: '#475569',
  },
  voiceListening: {
    backgroundColor: '#1e293b',
  },
  voiceOff: {
    backgroundColor: '#334155',
  },
  voiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  voiceLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  voiceLabelText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
  },
  voiceIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    height: 60,
    marginBottom: 10,
  },
  voiceWave: {
    width: 6,
    height: 36,
    backgroundColor: SarvisTheme.colors.primary,
    borderRadius: 4,
  },
  voiceText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
  },
  voiceTextOn: {
    color: SarvisTheme.colors.primary,
  },
  voiceTextOff: {
    color: SarvisTheme.colors.textMuted,
  },
  trackingCard: {
    backgroundColor: '#E8EAFF',
    borderRadius: SarvisTheme.radius.lg,
    borderWidth: 2,
    borderColor: SarvisTheme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trackingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  trackingIcon: {
    fontSize: 24,
  },
  trackingText: {
    fontSize: 16,
    fontWeight: '800',
    color: SarvisTheme.colors.primary,
  },
});

