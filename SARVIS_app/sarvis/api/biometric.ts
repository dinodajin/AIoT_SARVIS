
import { BiometricUploadResponse, FaceImages } from './types';
import { API_CONFIG } from '../constants/config';

/**
 * 생체 정보 관련 API (Jetson 서버와 통신)
 */
export const biometricAPI = {
    /**
     * 5방향 얼굴 이미지 업로드 (Jetson 서버로 전송하여 얼굴 벡터 반환)
     * @param loginId 사용자 아이디 (아직 uid 발급 전)
     * @param faceImages 5방향 얼굴 이미지 (front, left, right, top, bottom)
     * @returns 얼굴 벡터
     */
    uploadFaceImages: async (
        loginId: any,
        faceImages: FaceImages
    ): Promise<BiometricUploadResponse> => {
        try {
            console.log('📷 얼굴 등록 요청 시작');

            // [수정] loginId가 객체로 들어오는 현상 방어
            const actualLoginId = typeof loginId === 'string' ? loginId : "manual_test_user";
            console.log('실제 loginId 값:', actualLoginId);

            const formData = new FormData();
            formData.append('login_id', actualLoginId); // ✅ 회원가입은 login_id 사용

            // 5방향 얼굴 이미지 추가
            const directions: (keyof FaceImages)[] = ['front', 'left', 'right', 'top', 'bottom'];

            directions.forEach((direction) => {
                const imageUri = faceImages[direction];
                if (imageUri) {
                    console.log(`📷 ${direction} 방향 이미지 추가:`, imageUri);
                    formData.append('image', {
                        uri: imageUri,
                        type: 'image/jpeg',
                        name: `face_${direction}.jpg`,
                    } as any);
                }
            });

            console.log('📦 FormData에 담긴 이미지 개수:', directions.length);

            // fetch API를 직접 사용하여 multipart/form-data 전송
            const url = `${API_CONFIG.JETSON_URL}/upload_face`;
            console.log('🌐 최종 요청 URL:', url);

            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                // headers에 Content-Type은 절대 넣지 마세요 (fetch가 자동 생성함)
            });

            console.log('🌐 응답 상태:', response.status);

            // JSON 파싱 전에 텍스트로 먼저 확인
            const text = await response.text();
            console.log('🌐 응답 텍스트:', text);

            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error('❌ JSON 파싱 실패:', e);
                data = { message: text, error: 'INVALID_RESPONSE' };
            }

            if (!response.ok) {
                console.error('❌ 서버 에러 응답:', response.status, data);
                throw new Error(data.message || data.error || '로봇팔 연결 오류');
            }

            console.log('✅ Jetson 서버 응답 성공');
            console.log('응답 데이터:', data);

            return {
                success: true,
                message: '얼굴 이미지가 성공적으로 업로드되었습니다.',
                ...data,
            };
        } catch (error: any) {
            // [수정] 에러가 왜 났는지 진짜 이유를 찍어야 합니다.
            console.error('🔥 [Critical Error] 요청 전송 실패:', error.message);
            console.error('🔥 에러 전체 내용:', error);

            return {
                success: false,
                message: error.message || '알 수 없는 네트워크 에러',
                error: 'NETWORK_ERROR',
            };
        }
    },

    /**
     * 얼굴 인식 로그인 (Jetson 서버로 이미지 전송 후 벡터 반환)
     * @param imageUri 얼굴 이미지 URI
     * @returns 얼굴 벡터
     * 
     * 참고: 반환된 벡터는 authAPI.loginFace()로 EC2 서버에 전송하여 로그인
     */
    loginFace: async (imageUri: string): Promise<BiometricUploadResponse> => {
        console.log('📷 얼굴 로그인 요청 시작');
        console.log('이미지 URI:', imageUri);
        console.log('Jetson URL:', API_CONFIG.JETSON_URL);

        try {
            const formData = new FormData();

            console.log('📦 FormData 생성 완료');

            // React Native에서 파일 URI를 FormData에 추가
            // 주의: React Native에서는 uri가 file:// 또는 content://로 시작해야 함
            const fileObject = {
                uri: imageUri,
                type: 'image/jpeg',
                name: `face_login_${Date.now()}.jpg`,
            };

            console.log('파일 객체:', fileObject);

            formData.append('image', fileObject as any);

            console.log('✅ FormData에 파일 추가 완료');
            console.log('📦 FormData 내용 확인:');
            formData.forEach((value: any, key: string) => {
                console.log(`  ${key}:`, {
                    uri: value.uri,
                    type: value.type,
                    name: value.name,
                });
            });

            console.log('🌐 Jetson 서버로 요청 전송 중...');

            // fetch API를 직접 사용하여 multipart/form-data 전송
            const url = `${API_CONFIG.JETSON_URL}/login_face`;

            console.log('🌐 요청 URL:', url);
            console.log('🌐 HTTP Method: POST');

            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json',
                    // Content-Type을 설정하지 않으면 브라우저가 자동으로 boundary 생성
                },
            });

            console.log('🌐 응답 상태:', response.status);

            // JSON 파싱 전에 텍스트로 먼저 확인
            const text = await response.text();
            console.log('🌐 응답 텍스트:', text);

            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error('❌ JSON 파싱 실패:', e);
                data = { message: text, error: 'INVALID_RESPONSE' };
            }

            if (!response.ok) {
                console.error('❌ 서버 에러 응답:', response.status, data);
                throw new Error(data.message || data.error || '로봇팔과의 연결에 실패했습니다.');
            }

            console.log('✅ Jetson 서버 응답 성공');
            console.log('응답 데이터:', data);
            return data;
        } catch (error: any) {
            console.error('❌ 로봇팔 연결 에러');
            console.error('에러 메시지:', error.message);
            console.error('에러 스택:', error.stack);

            // Jetson 서버 연결 실패
            throw error;
        }
    },

    /**
     * 음성 파일 업로드 (Jetson 서버로 전송하여 음성 벡터 반환)
     * @param loginId 사용자 아이디
     * @param voiceFiles 음성 파일 객체 (4개 구문: '싸비스(1/4)', '싸비스(2/4)', '싸비스(3/4)', '싸비스(4/4)')
     * @returns 음성 벡터
     * 
     * 참고: 반환된 벡터는 authAPI.saveVoiceVector()로 EC2 서버에 전송하여 회원가입 완료
     */
    uploadVoice: async (
        loginId: any, // string 대신 any로 받아 방어 코드 적용
        voiceFiles: Record<number, string>
    ): Promise<BiometricUploadResponse> => {
        // [수정] loginId가 객체로 들어오는 현상 방어
        const actualLoginId = typeof loginId === 'string' ? loginId : (loginId?.loginId || "manual_test_user");

        const formData = new FormData();

        // ✅ 회원가입에서는 login_id 사용
        formData.append('login_id', actualLoginId);

        // ✅ 4개 음성 파일을 'voice' 키로 전송 (Jetson은 request.files.getlist('voice')로 받음)
        const phrases = ['싸비스(1/4)', '싸비스(2/4)', '싸비스(3/4)', '싸비스(4/4)'];
        phrases.forEach((phrase, index) => {
            const voiceUri = voiceFiles[index]; // ✅ 키를 index로 찾기 (0, 1, 2, 3)
            if (voiceUri) {
                // 🔑 Jetson은 'voice'라는 동일한 키로 4개 파일을 받음!
                console.log(`🎙️ ${phrase} 음성 파일 추가:`, voiceUri);
                formData.append('voice', {
                    uri: voiceUri,
                    type: 'audio/mp4', // ✅ Expo Audio는 mp4로 저장됨
                    name: `voice_${index + 1}.m4a`, // 파일명은 구분용으로 유지
                } as any);
            } else {
                console.warn(`⚠️ ${phrase} 음성 파일 없음 (index: ${index})`);
            }
        });

        try {
            console.log('🎙️ 음성 등록 요청 시작');
            console.log('Jetson URL:', API_CONFIG.JETSON_URL);
            console.log('login_id (raw):', loginId);
            console.log('login_id (actual):', actualLoginId);
            console.log('📦 FormData에 담긴 음성 파일 개수:', phrases.length);

            // fetch API를 직접 사용하여 multipart/form-data 전송
            const url = `${API_CONFIG.JETSON_URL}/upload_voice`;
            console.log('🌐 요청 URL:', url);
            console.log('🌐 HTTP Method: POST');

            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                // headers에 Content-Type은 절대 넣지 마세요 (fetch가 자동 생성함)
                // Accept 헤더도 넣지 마세요 - headers 객체 자체가 있으면 FormData 전송이 실패할 수 있음
            });

            console.log('🌐 응답 상태:', response.status);

            // JSON 파싱 전에 텍스트로 먼저 확인
            const text = await response.text();
            console.log('🌐 응답 텍스트:', text);

            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error('❌ JSON 파싱 실패:', e);
                data = { message: text, error: 'INVALID_RESPONSE' };
            }

            if (!response.ok) {
                console.error('❌ 서버 에러 응답:', response.status, data);
                throw new Error(data.message || data.error || '로봇팔 연결 오류');
            }

            console.log('✅ Jetson 서버 응답 성공');
            console.log('응답 데이터:', JSON.stringify(data, null, 2));

            // Jetson 서버가 반환한 voice_vectors를 그대로 전달
            // 만약 Jetson이 벡터를 반환하지 않는다면, data.voice_vectors는 undefined가 됨
            return {
                success: true,
                message: '음성 파일이 성공적으로 업로드되었습니다.',
                voice_vectors: data.voice_vectors || data.voice_vector || null, // Jetson 응답에서 가져옴
                voice_profile_path: data.voice_profile_path,
                ...data,
            };
        } catch (error: any) {
            console.error('🔥 [Critical Error] 음성 업로드 실패:', error.message);

            // fetch는 네트워크 에러 시에만 catch로 오므로, 
            // 400 에러 등은 response.ok 체크에서 Error를 throw하여 여기로 옵니다.
            return {
                success: false,
                message: error.message || '네트워크 오류가 발생했습니다.',
                error: 'UPLOAD_ERROR',
            };
        }
    },

};
