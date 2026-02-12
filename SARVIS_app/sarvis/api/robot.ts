// api/robot.ts

import { ec2Client } from './client';
import {
    RobotStatusResponse,
    RobotResetResponse,
} from './types';

/**
 * 로봇 상태 API
 */
export const robotAPI = {
    /**
     * 최신 로봇 상태 조회
     */
    async getLatest(): Promise<RobotStatusResponse> {
        const response = await ec2Client.get<RobotStatusResponse>(
            '/api/robot/latest/'
        );
        return response.data;
    },

    /**
     * 로봇 암 리셋 (초기 위치로)
     */
    async reset(): Promise<RobotResetResponse> {
        const response = await ec2Client.post<RobotResetResponse>(
            '/api/robot/reset/'
        );
        return response.data;
    },
};
