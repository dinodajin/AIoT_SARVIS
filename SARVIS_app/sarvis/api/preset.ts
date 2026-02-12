import { ec2Client } from './client';
import {
  ApiResponse,
  PresetDefaultSelectResponse,
  PresetListResponse,
  PresetLoadResponse,
  PresetSaveFromJetsonResponse,
  PresetSaveResponse,
  PresetSelectResponse,
  PresetUpdateResponse,
} from './types';

/**
 * 프리셋 API
 */
export const presetAPI = {
  /**
   * 활성화된 프리셋 수정 (현재 로봇팔 위치로 저장)
   * API: POST /api/preset/update/
   */
  updateActivePreset: async (): Promise<PresetUpdateResponse> => {
    try {
      const response = await ec2Client.post<PresetUpdateResponse>(
        '/api/preset/update/',
        {}
      );

      console.log('✅ 활성화된 프리셋 수정 성공:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ 활성화된 프리셋 수정 실패:', error);
      throw error;
    }
  },

  /**
   * 프리셋 이름만 변경
   * API: PATCH /api/preset/rename/
   * @param presetId - 프리셋 ID
   * @param presetName - 새로운 프리셋 이름
   */
  renamePreset: async (presetId: number, presetName: string): Promise<PresetUpdateResponse> => {
    try {
      const response = await ec2Client.patch<PresetUpdateResponse>(
        '/api/preset/rename/',
        {
          preset_id: presetId,
          preset_name: presetName
        }
      );

      console.log('✅ 프리셋 이름 변경 성공:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ 프리셋 이름 변경 실패:', error);
      throw error;
    }
  },

  /**
   * 프리셋 목록 조회
   * @param session_id - 특정 기기의 프리셋만 조회 (선택적)
   */
  getPresets: async (session_id?: string): Promise<PresetListResponse> => {
    try {
      const params = session_id ? { session_id } : undefined;

      const response = await ec2Client.get<PresetListResponse>('/api/preset/list/', {
        params,
      });

      return response.data;
    } catch (error: any) {
      console.error('프리셋 목록 조회 실패:', error);
      throw error;
    }
  },

  /**
   * 기본 프리셋 선택
   */
  selectDefaultPreset: async (): Promise<PresetDefaultSelectResponse> => {
    try {
      const response = await ec2Client.post<PresetDefaultSelectResponse>(
        '/api/preset/select-default/',
        {}
      );

      return response.data;
    } catch (error: any) {
      console.error('기본 프리셋 선택 실패:', error);
      throw error;
    }
  },

  /**
   * 프리셋 선택
   * @param preset_id - 프리셋 ID
   */
  selectPreset: async (preset_id: number): Promise<PresetSelectResponse> => {
    try {
      const response = await ec2Client.post<PresetSelectResponse>(
        '/api/preset/select/',
        { preset_id }
      );

      return response.data;
    } catch (error: any) {
      console.error('프리셋 선택 실패:', error);
      throw error;
    }
  },

  /**
   * 프리셋 저장 (기존 - 직접 서보 위치 전송)
   * API: POST /api/preset/save/
   * @param name - 프리셋 이름
   * @param servoPositions - 서보 모터 위치 값 (servo1 ~ servo6)
   * @param session_id - 연결된 기기 UUID (선택적)
   */
  savePreset: async (
    name: string,
    servoPositions: {
      servo1: number;
      servo2: number;
      servo3: number;
      servo4: number;
      servo5: number;
      servo6: number;
    },
    session_id?: string
  ): Promise<PresetSaveResponse> => {
    try {
      const response = await ec2Client.post<PresetSaveResponse>(
        '/api/preset/save/',
        {
          name,
          ...servoPositions,
          session_id
        }
      );

      console.log('✅ 프리셋 저장 성공:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('프리셋 저장 실패:', error);
      throw error;
    }
  },

  /**
   * 젯슨에서 현재 로봇팔 위치로 프리셋 저장 (새로운 API)
   * API: POST /api/preset/save/
   * @param session_id - 세션 ID (숫자)
   * @param preset_name - 프리셋 이름
   * 
   * 동작 방식:
   * 1. 서버로 session_id와 preset_name 전송
   * 2. 서버가 젯슨에게 현재 로봇팔 위치 요청
   * 3. 젯슨이 servo1~servo6 형식으로 현재 위치 반환
   * 4. 서버가 프리셋 DB에 저장
   */
  savePresetFromJetson: async (
    session_id: number,
    preset_name?: string
  ): Promise<PresetSaveFromJetsonResponse> => {
    try {
      const response = await ec2Client.post<PresetSaveFromJetsonResponse>(
        '/api/preset/save/',
        {
          session_id,
          preset_name
        }
      );

      console.log('✅ 젯슨 프리셋 저장 성공:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ 젯슨 프리셋 저장 실패:', error);
      throw error;
    }
  },

  /**
   * 프리셋 불러오기 (서보 위치 적용)
   * API: POST /api/preset/load/
   * @param preset_id - 프리셋 ID
   */
  loadPreset: async (preset_id: number): Promise<PresetLoadResponse> => {
    try {
      const response = await ec2Client.post<PresetLoadResponse>(
        '/api/preset/load/',
        { preset_id }
      );

      console.log('✅ 프리셋 불러오기 성공:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('프리셋 불러오기 실패:', error);
      throw error;
    }
  },

  /**
   * 프리셋 삭제
   * API: DELETE /api/preset/{preset_id}/
   * @param preset_id - 프리셋 ID
   */
  deletePreset: async (preset_id: number): Promise<ApiResponse> => {
    try {
      const response = await ec2Client.delete<ApiResponse>(
        `/api/preset/${preset_id}/`
      );

      console.log('✅ 프리셋 삭제 성공:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('프리셋 삭제 실패:', error);
      throw error;
    }
  },
};

