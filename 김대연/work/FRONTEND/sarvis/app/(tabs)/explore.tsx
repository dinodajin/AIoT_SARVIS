
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SarvisAppHeader } from '@/components/sarvis/sarvis-app-header';
import { SarvisFooter } from '@/components/sarvis/sarvis-footer';
import { SarvisSlider } from '@/components/sarvis/sarvis-slider';
import { SarvisTheme } from '@/constants/sarvis-theme';

type ControlState = {
  x: number;
  y: number;
  tilt: number;
  has: number;
  distance: number;
};

export default function ControlScreen() {
  const [state, setState] = useState<ControlState>({ x: 0, y: 0, tilt: 0, has: 0, distance: 50 });
  const [preset, setPreset] = useState<ControlState>({ x: 0, y: 0, tilt: 0, has: 0, distance: 50 });

  const distanceLabel = useMemo(() => `${state.distance}`, [state.distance]);

  return (
    <View style={styles.root}>
      <SarvisAppHeader />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>위치 이동</Text>
        <View style={styles.positionGrid}>
          <Pressable style={[styles.posBtn, styles.posUp]} onPress={() => setState(s => ({ ...s, y: s.y + 1 }))}>
            <Text style={styles.posText}>↑</Text>
          </Pressable>
          <Pressable style={[styles.posBtn, styles.posLeft]} onPress={() => setState(s => ({ ...s, x: s.x - 1 }))}>
            <Text style={styles.posText}>←</Text>
          </Pressable>
          <Pressable style={[styles.posBtn, styles.posDown]} onPress={() => setState(s => ({ ...s, y: s.y - 1 }))}>
            <Text style={styles.posText}>↓</Text>
          </Pressable>
          <Pressable style={[styles.posBtn, styles.posRight]} onPress={() => setState(s => ({ ...s, x: s.x + 1 }))}>
            <Text style={styles.posText}>→</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>거리 조절</Text>
        <View style={styles.distanceRow}>
          <Text style={styles.sliderLabel}>가까이</Text>
          <View style={styles.sliderWrap}>
            <SarvisSlider value={state.distance} onChange={(v) => setState(s => ({ ...s, distance: v }))} />
          </View>
          <Text style={styles.sliderLabel}>멀리</Text>
        </View>
        <Text style={styles.distanceValue}>현재: {distanceLabel}</Text>

        <Text style={styles.sectionTitle}>회전 제어</Text>
        <View style={styles.rotationBox}>
          <View style={styles.rotRow}>
            <Text style={styles.rotLabel}>Tilt:</Text>
            <Pressable style={styles.rotBtn} onPress={() => setState(s => ({ ...s, tilt: s.tilt + 1 }))}>
              <Text style={styles.rotText}>↥ Up</Text>
            </Pressable>
            <Pressable style={styles.rotBtn} onPress={() => setState(s => ({ ...s, tilt: s.tilt - 1 }))}>
              <Text style={styles.rotText}>↧ Down</Text>
            </Pressable>
          </View>
          <View style={styles.rotRow}>
            <Text style={styles.rotLabel}>HAS:</Text>
            <Pressable style={styles.rotBtn} onPress={() => setState(s => ({ ...s, has: s.has - 1 }))}>
              <Text style={styles.rotText}>↶ Left</Text>
            </Pressable>
            <Pressable style={styles.rotBtn} onPress={() => setState(s => ({ ...s, has: s.has + 1 }))}>
              <Text style={styles.rotText}>↷ Right</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Status</Text>
        <View style={styles.statusPanel}>
          <View style={styles.statusGrid}>
            <Text style={styles.statusItem}>X: <Text style={styles.statusValue}>{state.x}</Text></Text>
            <Text style={styles.statusItem}>Y: <Text style={styles.statusValue}>{state.y}</Text></Text>
            <Text style={styles.statusItem}>Tilt: <Text style={styles.statusValue}>{state.tilt}°</Text></Text>
            <Text style={styles.statusItem}>HAS: <Text style={styles.statusValue}>{state.has}°</Text></Text>
          </View>
        </View>

        <View style={styles.footerBtns}>
          <Pressable style={[styles.footerBtn, styles.saveBtn]} onPress={() => setPreset(state)}>
            <Text style={styles.footerBtnText}>💾 기억하기</Text>
          </Pressable>
          <Pressable style={[styles.footerBtn, styles.resetBtn]} onPress={() => setState(preset)}>
            <Text style={[styles.footerBtnText, styles.resetText]}>⟳ 초기화</Text>
          </Pressable>
        </View>
      </ScrollView>

      <SarvisFooter />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SarvisTheme.colors.bg,
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: SarvisTheme.colors.text,
    marginBottom: 12,
    marginTop: 8,
  },
  positionGrid: {
    height: 150,
    marginBottom: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posBtn: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: SarvisTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  posText: {
    color: 'white',
    fontSize: 28,
    fontWeight: '900',
  },
  posUp: { top: 0 },
  posDown: { bottom: 0 },
  posLeft: { left: 0 },
  posRight: { right: 0 },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: SarvisTheme.colors.primaryLight,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: SarvisTheme.radius.lg,
    borderWidth: 1,
    borderColor: SarvisTheme.colors.border,
  },
  sliderLabel: {
    width: 46,
    fontSize: 14,
    fontWeight: '800',
    color: SarvisTheme.colors.primary,
    textAlign: 'center',
  },
  sliderWrap: {
    flex: 1,
  },
  distanceValue: {
    marginTop: 10,
    marginBottom: 10,
    textAlign: 'right',
    color: SarvisTheme.colors.textLight,
    fontWeight: '700',
  },
  rotationBox: {
    backgroundColor: SarvisTheme.colors.primaryLight,
    borderRadius: SarvisTheme.radius.lg,
    borderWidth: 1,
    borderColor: SarvisTheme.colors.border,
    padding: 14,
    gap: 12,
    marginBottom: 10,
  },
  rotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rotLabel: {
    width: 44,
    fontWeight: '900',
    color: SarvisTheme.colors.text,
  },
  rotBtn: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: SarvisTheme.radius.md,
    borderWidth: 1,
    borderColor: SarvisTheme.colors.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  rotText: {
    fontWeight: '800',
    color: SarvisTheme.colors.primary,
  },
  statusPanel: {
    backgroundColor: 'white',
    borderRadius: SarvisTheme.radius.lg,
    borderWidth: 1,
    borderColor: SarvisTheme.colors.border,
    padding: 14,
    marginBottom: 16,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  statusItem: {
    width: '48%',
    fontWeight: '800',
    color: SarvisTheme.colors.textLight,
  },
  statusValue: {
    fontWeight: '900',
    color: SarvisTheme.colors.primary,
  },
  footerBtns: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6,
  },
  footerBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: SarvisTheme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    backgroundColor: SarvisTheme.colors.primary,
  },
  resetBtn: {
    backgroundColor: '#F3F4F6',
  },
  footerBtnText: {
    fontWeight: '900',
    color: 'white',
  },
  resetText: {
    color: SarvisTheme.colors.text,
  },
});

