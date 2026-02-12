// api/session.ts

import { ec2Client } from './client';
import {
    SessionStartResponse,
    SessionEndResponse,
    CommandLogResponse,
} from './types';

/**
 * 세션 관리 API
 */
export const sessionAPI = {
    /**
     * 세션 시작
     * @param sessionId 세션 ID
     */
    async start(sessionId: string): Promise<SessionStartResponse> {
        const response = await ec2Client.post<SessionStartResponse>(
            '/api/session/start/',
            { session_id: sessionId }
        );
        return response.data;
    },

    /**
     * 세션 종료
     * @param sessionId 세션 ID
     */
    async end(sessionId: string): Promise<SessionEndResponse> {
        const response = await ec2Client.post<SessionEndResponse>(
            '/api/session/end/',
            { session_id: sessionId }
        );
        return response.data;
    },

    /**
     * 명령 로그 생성
     * @param sessionId 세션 ID
     * @param commandType 명령 타입 (BUTTON, VOICE 등)
     * @param commandContent 명령 내용
     * @param isSuccess 성공 여부
     */
    async createCommandLog(
        sessionId: string,
        commandType: 'BUTTON' | 'VOICE',
        commandContent: string,
        isSuccess: boolean = true
    ): Promise<CommandLogResponse> {
        const response = await ec2Client.post<CommandLogResponse>(
            '/api/session/command-log/',
            {
                session_id: sessionId,
                command_type: commandType,
                command_content: commandContent,
                is_success: isSuccess,
            }
        );
        return response.data;
    },
};
