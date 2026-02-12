import AsyncStorage from '@react-native-async-storage/async-storage';

export type ControlState = {
  positionX: number;  // 위치 X (좌우)
  positionY: number;  // 위치 Y (상하좌우)
  rotationX: number;  // 회전 X (상하 각도)
  rotationY: number;  // 회전 Y (좌우 각도)
  distance: number;   // 거리
};

export type Preset = {
  id: string;
  name: string;
  state: ControlState;
  createdAt: Date;
};

const PRESETS_STORAGE_KEY = '@sarvis_presets';
const CURRENT_STATE_STORAGE_KEY = '@sarvis_current_state';

export const presetStorage = {
  // 현재 상태 가져오기
  async getCurrentState(): Promise<ControlState | null> {
    try {
      const stored = await AsyncStorage.getItem(CURRENT_STATE_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
      return null;
    } catch (error) {
      console.error('현재 상태 로드 오류:', error);
      return null;
    }
  },

  // 현재 상태 저장
  async saveCurrentState(state: ControlState): Promise<void> {
    try {
      await AsyncStorage.setItem(CURRENT_STATE_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('현재 상태 저장 오류:', error);
    }
  },

  // 모든 프리셋 가져오기
  async getPresets(): Promise<Preset[]> {
    try {
      const stored = await AsyncStorage.getItem(PRESETS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((p: any) => ({
          ...p,
          createdAt: new Date(p.createdAt)
        }));
      }
      return [];
    } catch (error) {
      console.error('프리셋 로드 오류:', error);
      return [];
    }
  },

  // 프리셋 저장
  async savePreset(preset: Preset): Promise<void> {
    try {
      const presets = await this.getPresets();
      const updatedPresets = [...presets, preset];
      await AsyncStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updatedPresets));
    } catch (error) {
      console.error('프리셋 저장 오류:', error);
      throw error;
    }
  },

  // 프리셋 목록 전체 저장 (API와 동기화용)
  async savePresets(presets: Preset[]): Promise<void> {
    try {
      await AsyncStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
    } catch (error) {
      console.error('프리셋 목록 저장 오류:', error);
      throw error;
    }
  },

  // 프리셋 삭제
  async deletePreset(presetId: string): Promise<void> {
    try {
      const presets = await this.getPresets();
      const updatedPresets = presets.filter(p => p.id !== presetId);
      await AsyncStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updatedPresets));
    } catch (error) {
      console.error('프리셋 삭제 오류:', error);
      throw error;
    }
  },

  // 프리셋 이름 수정
  async updatePresetName(presetId: string, newName: string): Promise<void> {
    try {
      const presets = await this.getPresets();
      const updatedPresets = presets.map(p =>
        p.id === presetId ? { ...p, name: newName } : p
      );
      await AsyncStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updatedPresets));
    } catch (error) {
      console.error('프리셋 이름 수정 오류:', error);
      throw error;
    }
  },

  // 모든 프리셋 초기화
  async clearAllPresets(): Promise<void> {
    try {
      await AsyncStorage.removeItem(PRESETS_STORAGE_KEY);
    } catch (error) {
      console.error('프리셋 초기화 오류:', error);
      throw error;
    }
  }
};
