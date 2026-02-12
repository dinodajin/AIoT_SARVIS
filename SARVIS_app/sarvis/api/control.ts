// api/control.ts

import { ec2Client } from './client';
import {
    ButtonCommandResponse,
    ControlButtonResponse,
    ControlEnterResponse
} from './types';

/**
 * 제어 명령 API
 */
export const controlAPI = {
    /**
     * 제어 화면 진입
     * @param sessionId 세션 ID
     */
    async enter(sessionId: string): Promise<ControlEnterResponse> {
        const response = await ec2Client.post<ControlEnterResponse>(
            '/api/control/enter/',
            { session_id: sessionId }
        );
        return response.data;
    },

    /**
     * 버튼 명령 전송 (기존)
     * @param sessionId 세션 ID
     * @param buttonType 버튼 타입 (MOVE, TILT, ROTATE 등)
     * @param buttonLabel 버튼 라벨 (forward, backward, left, right 등)
     */
    async sendButton(
        sessionId: string,
        buttonType: string,
        buttonLabel: string
    ): Promise<ControlButtonResponse> {
        const response = await ec2Client.post<ControlButtonResponse>(
            '/api/button-command/',
            {
                session_id: sessionId,
                button_type: buttonType,
                button_label: buttonLabel,
            }
        );
        return response.data;
    },

    /**
     * 매크로 버튼 커맨드 전송 (이리와, 저리가, 따라와 등)
     * @param sessionId 세션 ID
     * @param command 명령
     */
    async sendMacroCommand(
        uid: string,
        sessionId: string,
        command: string
    ): Promise<ButtonCommandResponse> {
        const response = await ec2Client.post<ButtonCommandResponse>(
            '/api/button-command/',
            {
                uid: uid,
                session_id: sessionId,
                command: command,
            }
        );
        return response.data;
    },

    /**
     * 로봇팔 버튼 커맨드 전송 (EC2 릴레이)
     * @param sessionId 세션 ID
     * @param command 버튼 명령
     */
    async sendButtonCommand(
        sessionId: string,
        command: string
    ): Promise<ButtonCommandResponse> {
        // ✅ 이제 젯슨 직접 통신이 아닌 EC2를 통해 전달됨
        const response = await ec2Client.post<ButtonCommandResponse>(
            '/api/control/button/',
            {
                session_id: sessionId,
                command: command,
            }
        );
        return response.data;
    },
};
