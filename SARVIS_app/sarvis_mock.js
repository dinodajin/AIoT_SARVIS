// SARVIS Mock Application
// 테스트 친화적 모듈 구조
// 스펙/유스케이스/DB와 완전히 일치하는 구현

const SarvisApp = (() => {
    // ==================== 상수 정의 ====================
    const RobotStatus = {
        IDLE: 'IDLE',
        TRACKING: 'TRACKING',
        MOVING: 'MOVING',
        ASIDE: 'ASIDE'
    };

    const CommandInputMethod = {
        VOICE: 'VOICE',
        BUTTON: 'BUTTON',
        TOGGLE: 'TOGGLE'
    };

    const CommandType = {
        FOLLOW_USER: 'FOLLOW_USER',
        COME_FRONT: 'COME_FRONT',
        MOVE_AWAY: 'MOVE_AWAY',
        STOP: 'STOP',
        STOP_TRACKING: 'STOP_TRACKING'
    };

    const ErrorCode = {
        INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
        USER_NOT_FOUND: 'USER_NOT_FOUND',
        USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
        INVALID_FACE_VECTOR: 'INVALID_FACE_VECTOR',
        INVALID_EMAIL_CODE: 'INVALID_EMAIL_CODE',
        SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
        DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
        DEVICE_ALREADY_CONNECTED: 'DEVICE_ALREADY_CONNECTED',
        INVALID_TOKEN: 'INVALID_TOKEN',
        INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR'
    };

    // ==================== 상태 관리 ====================
    const state = {
        currentUser: null,
        voiceEnabled: true,
        robotStatus: RobotStatus.IDLE,
        currentScreen: 'loginInitial',
        deviceConnected: false,
        emailVerified: false,
        emailChecked: false,
        emailAvailable: false,
        isCodeSent: false,
        idChecked: false,
        idAvailable: false,

        // JWT 토큰 기반 자동 로그인
        jwtToken: null,
        sessionId: null,
        connectionId: null,

        // 기기 연결 타임아웃
        deviceConnectionTimeout: null,

        // 회원가입 temp_id (스펙 기반)
        tempId: null,

        // 이동 범위 설정 (movement_range 테이블 기반)
        movementRange: {
            max_tilt_up: null,
            max_tilt_down: null,
            max_has_left: null,
            max_has_right: null
        },

        // 폼 데이터 상태 (formData)
        formData: {
            nickname: '',
            login_id: '',
            email: '',
            password: '',
            passwordConfirm: ''
        },

        // 수동 제어 상태 - DB 스펙 기준 필드명 (snake_case)
        manualControl: {
            // 위치 이동 (XYZ)
            up: 0,
            down: 0,
            left: 0,
            right: 0,
            // 회전 (Tilt/HAS - DB 기준 용어)
            tilt_up: 0,
            tilt_down: 0,
            has_left: 0,
            has_right: 0,
            // 거리 (Distance)
            distance: 50,
            preset: {
                up: 0,
                down: 0,
                left: 0,
                right: 0,
                tilt_up: 0,
                tilt_down: 0,
                has_left: 0,
                has_right: 0,
                distance: 50
            }
        }
    };

    // DOM 요소 캐시
    const elements = {};

    // ==================== 요소 초기화 ====================
    function initElements() {
        elements.screens = document.querySelectorAll('.screen');
        elements.userBadge = document.getElementById('userBadge');
        elements.robotStatus = document.getElementById('robotStatus');
        elements.robotStatusText = document.getElementById('robotStatusText');
        elements.voiceCard = document.getElementById('voiceCard');
        elements.voiceText = document.getElementById('voiceText');
        elements.voiceToggle = document.getElementById('voiceToggle');
        elements.distanceSlider = document.getElementById('distanceSlider');

        // 로그인 폼 요소
        elements.loginUsername = document.getElementById('loginUsername');
        elements.loginPassword = document.getElementById('loginPassword');

        // 회원가입 폼 요소
        elements.signupNickname = document.getElementById('signupNickname');
        elements.signupUsername = document.getElementById('signupUsername');
        elements.signupPassword = document.getElementById('signupPassword');
        elements.signupPasswordConfirm = document.getElementById('signupPasswordConfirm');
        elements.signupEmailId = document.getElementById('signupEmailId');
        elements.signupEmailDomain = document.getElementById('signupEmailDomain');
        elements.signupEmailDomainCustom = document.getElementById('signupEmailDomainCustom');
        elements.emailCodeInput = document.getElementById('emailCodeInput');
        elements.emailCodeGroup = document.getElementById('emailCodeGroup');
        elements.signupInfoNextBtn = document.getElementById('signupInfoNextBtn');

        // 기기 연결 요소 (회원가입)
        elements.signupDeviceAlias = document.getElementById('signupDeviceAlias');
        elements.signupDeviceStatus = document.getElementById('signupDeviceStatus');

        // 기기 연결 요소 (로그인)
        elements.loginDeviceStatus = document.getElementById('loginDeviceStatus');
        elements.loginFormDeviceStatus = document.getElementById('loginFormDeviceStatus');

        // 상태 표시 요소 (X, Y, Pitch, Yaw)
        elements.statusX = document.getElementById('statusX');
        elements.statusY = document.getElementById('statusY');
        elements.statusPitch = document.getElementById('statusPitch');
        elements.statusYaw = document.getElementById('statusYaw');

        // 메뉴 오버레이
        elements.menuOverlay = document.getElementById('menuOverlay');
    }

    // ==================== ValidationController ====================
    const ValidationController = {
        // 아이디 형식 검증: 영문, 숫자 5-20자
        validateId(loginId) {
            const idRegex = /^[a-zA-Z0-9]{5,20}$/;
            return idRegex.test(loginId);
        },

        // 비밀번호 형식 검증: 영문, 숫자, 특수문자 포함 8-20자
        validatePassword(password) {
            const hasLetter = /[a-zA-Z]/.test(password);
            const hasNumber = /[0-9]/.test(password);
            const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
            const isValidLength = password.length >= 8 && password.length <= 20;

            return hasLetter && hasNumber && hasSpecial && isValidLength;
        },

        // 닉네임 형식 검증: 한글, 영문, 숫자 2-20자
        validateNickname(nickname) {
            const nicknameRegex = /^[가-힣a-zA-Z0-9]{2,20}$/;
            return nicknameRegex.test(nickname);
        }
    };

    // ==================== TabController ====================
    const TabController = {
        switchTab(tabId) {
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelectorAll('.tab-item').forEach(item => {
                item.classList.remove('active');
            });

            const targetTab = document.getElementById(tabId);
            if (targetTab) {
                targetTab.classList.add('active');
            }

            const activeTabItem = document.querySelector(`[data-tab="${tabId}"]`);
            if (activeTabItem) {
                activeTabItem.classList.add('active');
            }
        }
    };

    // ==================== ScreenManager ====================
    const ScreenManager = {
        show(screenId) {
            elements.screens.forEach(screen => {
                screen.classList.remove('active');
            });
            const targetScreen = document.getElementById(screenId);
            if (targetScreen) {
                targetScreen.classList.add('active');
                state.currentScreen = screenId;
            }

            // 자동 얼굴 스캔 시작
            if (screenId === 'loginFace') {
                AuthManager.startFaceScan('login');
            } else if (screenId === 'signupFace') {
                AuthManager.startFaceScan('signup');
            } else if (screenId === 'resetFace') {
                AuthManager.startFaceScan('reset');
            }
        },

        get currentScreen() {
            return state.currentScreen;
        }
    };

    // ==================== MenuManager ====================
    const MenuManager = {
        open() {
            elements.menuOverlay.classList.add('active');
        },

        close() {
            elements.menuOverlay.classList.remove('active');
        }
    };

    // ==================== ModalManager ====================
    const ModalManager = {
        open(type) {
            const modalId = `${type}Modal`;
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.add('active');
            }
        },

        close(type) {
            const modalId = `${type}Modal`;
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.remove('active');
            }
        }
    };

    // ==================== DeviceManager ====================
    const DeviceManager = {
        startDeviceTimeout() {
            if (state.deviceConnectionTimeout) {
                clearTimeout(state.deviceConnectionTimeout);
            }

            state.deviceConnectionTimeout = setTimeout(() => {
                this.handleDeviceTimeout();
            }, 30000);
        },

        handleDeviceTimeout() {
            state.deviceConnected = false;
            alert('⏱️ 기기 연결 시간이 초과되었습니다.\n\n1. 기기가 켜져 있는지 확인하세요.\n2. 케이블이 올바르게 연결되어 있는지 확인하세요.\n3. 다른 기기와 연결되어 있는지 확인하세요.');
            this.resetDeviceStatus();
        },

        resetDeviceStatus() {
            const signupDeviceStatus = elements.signupDeviceStatus;
            const loginDeviceStatus = elements.loginDeviceStatus;
            const loginFormDeviceStatus = elements.loginFormDeviceStatus;

            [signupDeviceStatus, loginDeviceStatus, loginFormDeviceStatus].forEach(statusEl => {
                if (statusEl && statusEl.style.display !== 'none') {
                    const statusIcon = statusEl.querySelector('.status-icon');
                    const statusText = statusEl.querySelector('.status-text');
                    if (statusIcon && statusText) {
                        statusIcon.textContent = '🔍';
                        statusText.textContent = '기기 검색 중...';
                        statusEl.style.borderColor = 'var(--primary)';
                        statusEl.style.background = '';
                    }
                }
            });
        },

        startLoginDeviceWaiting() {
            const statusIcon = elements.loginDeviceStatus.querySelector('.status-icon');
            const statusText = elements.loginDeviceStatus.querySelector('.status-text');

            statusIcon.textContent = '🔍';
            statusText.textContent = '기기 검색 중...';
            elements.loginDeviceStatus.style.borderColor = 'var(--primary)';
            elements.loginDeviceStatus.style.background = '';

            this.startDeviceTimeout();

            setTimeout(() => {
                if (state.deviceConnectionTimeout) {
                    clearTimeout(state.deviceConnectionTimeout);
                    state.deviceConnectionTimeout = null;
                }

                if (statusIcon && statusText) {
                    statusIcon.textContent = '✅';
                    statusText.textContent = '기기 연결 완료';
                    elements.loginDeviceStatus.style.borderColor = 'var(--success)';
                    elements.loginDeviceStatus.style.background = 'var(--success-light)';
                    state.deviceConnected = true;
                }
            }, 2000);
        },

        startLoginFormDeviceWaiting() {
            const statusIcon = elements.loginFormDeviceStatus.querySelector('.status-icon');
            const statusText = elements.loginFormDeviceStatus.querySelector('.status-text');

            statusIcon.textContent = '🔍';
            statusText.textContent = '기기 검색 중...';
            elements.loginFormDeviceStatus.style.borderColor = 'var(--primary)';
            elements.loginFormDeviceStatus.style.background = '';

            this.startDeviceTimeout();

            setTimeout(() => {
                if (state.deviceConnectionTimeout) {
                    clearTimeout(state.deviceConnectionTimeout);
                    state.deviceConnectionTimeout = null;
                }

                if (statusIcon && statusText) {
                    statusIcon.textContent = '✅';
                    statusText.textContent = '기기 연결 완료';
                    elements.loginFormDeviceStatus.style.borderColor = 'var(--success)';
                    elements.loginFormDeviceStatus.style.background = 'var(--success-light)';
                    state.deviceConnected = true;
                }
            }, 2000);
        },

        startSignupDeviceSearch() {
            const statusIcon = elements.signupDeviceStatus.querySelector('.status-icon');
            const statusText = elements.signupDeviceStatus.querySelector('.status-text');

            statusIcon.textContent = '🔍';
            statusText.textContent = '기기 검색 중...';
            elements.signupDeviceStatus.style.borderColor = 'var(--primary)';
            elements.signupDeviceStatus.style.background = '';

            this.startDeviceTimeout();

            setTimeout(() => {
                if (state.deviceConnectionTimeout) {
                    clearTimeout(state.deviceConnectionTimeout);
                    state.deviceConnectionTimeout = null;
                }

                if (statusIcon && statusText) {
                    statusIcon.textContent = '✅';
                    statusText.textContent = '기기가 감지되었습니다!';
                    elements.signupDeviceStatus.style.borderColor = 'var(--success)';
                    elements.signupDeviceStatus.style.background = 'var(--success-light)';
                    state.deviceConnected = true;
                }
            }, 2000);
        }
    };

    // ==================== APIManager ====================
    const APIManager = {
        baseURL: '/api',

        getHeaders() {
            const headers = {
                'Content-Type': 'application/json'
            };

            if (state.jwtToken) {
                headers['Authorization'] = `Bearer ${state.jwtToken}`;
            }

            return headers;
        },

        handleError(error) {
            console.error('[APIManager] 에러 발생:', error);

            if (error.response) {
                const { data } = error.response;
                return data.message || '서버 오류가 발생했습니다.';
            } else if (error.request) {
                return '네트워크 연결을 확인해주세요.';
            } else {
                return '요청 처리 중 오류가 발생했습니다.';
            }
        },

        async get(endpoint) {
            console.log(`[APIManager] GET ${this.baseURL}${endpoint}`);
            // TODO: 실제 구현 시 주석 해제
            return { success: true };
        },

        async post(endpoint, body) {
            console.log(`[APIManager] POST ${this.baseURL}${endpoint}`, body);
            // TODO: 실제 구현 시 주석 해제
            return { success: true };
        },

        async put(endpoint, body) {
            console.log(`[APIManager] PUT ${this.baseURL}${endpoint}`, body);
            // TODO: 실제 구현 시 주석 해제
            return { success: true };
        },

        async delete(endpoint) {
            console.log(`[APIManager] DELETE ${this.baseURL}${endpoint}`);
            // TODO: 실제 구현 시 주석 해제
            return { success: true };
        }
    };

    // ==================== SessionManager ====================
    const SessionManager = {
        saveToken(token) {
            try {
                localStorage.setItem('sarvis_jwt_token', token);
                localStorage.setItem('sarvis_token_timestamp', Date.now().toString());
                state.jwtToken = token;
                console.log('[SessionManager] 토큰 저장됨');
            } catch (error) {
                console.error('[SessionManager] 토큰 저장 실패:', error);
            }
        },

        getToken() {
            try {
                const token = localStorage.getItem('sarvis_jwt_token');
                const timestamp = localStorage.getItem('sarvis_token_timestamp');

                if (token && timestamp) {
                    const tokenAge = Date.now() - parseInt(timestamp);
                    const maxAge = 24 * 60 * 60 * 1000;

                    if (tokenAge < maxAge) {
                        state.jwtToken = token;
                        return token;
                    } else {
                        this.clearToken();
                        return null;
                    }
                }
                return null;
            } catch (error) {
                console.error('[SessionManager] 토큰 가져오기 실패:', error);
                return null;
            }
        },

        clearToken() {
            try {
                localStorage.removeItem('sarvis_jwt_token');
                localStorage.removeItem('sarvis_token_timestamp');
                state.jwtToken = null;
                state.sessionId = null;
                console.log('[SessionManager] 토큰 삭제됨');
            } catch (error) {
                console.error('[SessionManager] 토큰 삭제 실패:', error);
            }
        },

        async checkAutoLogin() {
            const token = this.getToken();

            if (!token) {
                console.log('[SessionManager] 저장된 토큰 없음');
                return false;
            }

            console.log('[SessionManager] 자동 로그인 시도...');

            try {
                const response = await APIManager.get('/sessions/current');

                if (response.success) {
                    state.currentUser = response.user.nickname;
                    state.sessionId = response.session_id;
                    state.connectionId = response.connection_id;
                    elements.userBadge.textContent = state.currentUser;

                    console.log('[SessionManager] 자동 로그인 성공');
                    ScreenManager.show('appScreen');
                    return true;
                } else {
                    throw new Error(response.message || '세션 조회 실패');
                }
            } catch (error) {
                console.error('[SessionManager] 자동 로그인 실패:', error);
                this.clearToken();
                return false;
            }
        },

        async logout(sessionId, endReason = 'LOGOUT') {
            try {
                await APIManager.post(`/sessions/${sessionId}/logout`, {
                    session_id: sessionId,
                    end_reason: endReason
                });

                this.clearToken();
                console.log('[SessionManager] 로그아웃 성공');
                return true;
            } catch (error) {
                console.error('[SessionManager] 로그아웃 실패:', error);
                return false;
            }
        }
    };

    // ==================== AuthManager ====================
    const AuthManager = {
        // 이메일 주소 조합
        getEmail() {
            const emailId = elements.signupEmailId.value.trim();
            const domain = elements.signupEmailDomain.value;
            const customDomain = elements.signupEmailDomainCustom.value.trim();

            if (!emailId) return '';

            if (domain) {
                return `${emailId}@${domain}`;
            } else if (customDomain) {
                return `${emailId}@${customDomain}`;
            }
            return '';
        },

        // 회원가입 1단계: 정보 입력 (캐시 기반 - BE 실제 구현)
        async signupInfo() {
            const nickname = elements.signupNickname.value.trim();
            const loginId = elements.signupUsername.value.trim();
            const password = elements.signupPassword.value;
            const confirmPassword = elements.signupPasswordConfirm.value;
            const email = this.getEmail();

            if (!nickname || !loginId || !password || !email) {
                alert('모든 필수 정보를 입력해주세요.');
                return false;
            }

            // 이메일 인증 여부 확인
            if (!state.emailVerified) {
                alert('이메일 인증을 완료해주세요.');
                return false;
            }

            // 아이디 중복 확인 여부 확인
            if (!state.idChecked || !state.idAvailable) {
                alert('아이디 중복확인을 진행해주세요.');
                return false;
            }

            // POST /api/register/step1/ 호출 (BE 실제 구현)
            try {
                const response = await APIManager.post('/register/step1/', {
                    nickname: nickname,
                    login_id: loginId,
                    password: password,
                    password_confirm: confirmPassword,
                    email: email
                });

                if (response.success) {
                    state.formData.nickname = nickname;
                    state.formData.login_id = loginId;
                    alert('정보 입력이 완료되었습니다.');
                    return true;
                } else if (response.errors) {
                    // 서버 유효성 검사 에러 처리
                    let errorMsg = '';
                    if (response.errors.login_id) {
                        errorMsg += response.errors.login_id.join('\n');
                    }
                    if (response.errors.email) {
                        errorMsg += '\n' + response.errors.email.join('\n');
                    }
                    alert('정보 입력 오류:\n' + errorMsg);
                    return false;
                } else {
                    throw new Error(response.message || '회원가입 실패');
                }
            } catch (error) {
                console.error('[AuthManager] 회원가입 1단계 실패:', error);
                alert(APIManager.handleError(error));
                return false;
            }
        },

        // 회원가입 2단계: 기기 연결 확인 (BE 실제 구현)
        async signupDevice() {
            const deviceAlias = elements.signupDeviceAlias.value.trim();

            if (!state.deviceConnected) {
                alert('기기가 연결되지 않았습니다.');
                return false;
            }

            // POST /api/device/check/ 호출 (BE 실제 구현)
            try {
                const response = await APIManager.post('/device/check/', {
                    device_id: 1,
                    device_type: 'JETSON'
                });

                if (response.success) {
                    alert('기기 연결이 완료되었습니다.');
                    return true;
                } else {
                    throw new Error(response.message || '기기 연결 실패');
                }
            } catch (error) {
                console.error('[AuthManager] 회원가입 2단계 실패:', error);
                alert(APIManager.handleError(error));
                return false;
            }
        },

        // 회원가입 3단계: 젯슨에 login_id 전송 (BE 실제 구현)
        async signupFace(faceVector) {
            // POST /api/send-to-jetson/ 호출 (BE 실제 구현)
            try {
                const response = await APIManager.post('/send-to-jetson/', {
                    login_id: state.formData.login_id
                });

                if (response.success) {
                    alert('젯슨 전송이 완료되었습니다. 얼굴 등록을 시작합니다.');
                    return true;
                } else {
                    throw new Error(response.message || '젯슨 전송 실패');
                }
            } catch (error) {
                console.error('[AuthManager] 회원가입 3단계 실패:', error);
                alert(APIManager.handleError(error));
                return false;
            }
        },

        // 회원가입 4단계: 회원가입 완료 대기 (BE 실제 구현)
        async signupVoice(voiceVector) {
            // 젯슨에서 생체 정보를 전송하므로 앱에서는 대기만 함
            // 실제 회원가입 완료는 POST /api/save-biometric/에서 처리됨
            // 사용자가 얼굴/음성 등록을 완료하면 바로 로그인
            alert('회원가입이 완료되었습니다!\n\n젯슨에서 생체 정보 등록이 진행되었습니다.\n로그인을 진행해주세요.');

            // 로그인 폼으로 이동
            ScreenManager.show('loginForm');
            return true;
        },

        // 회원가입 취소 (캐시 삭제)
        async cancelSignup() {
            const loginId = state.formData.login_id;
            if (!loginId) {
                alert('회원가입 정보가 없습니다.');
                return false;
            }

            // 캐시 만료를 위해 서버 호출 시도
            try {
                // 기존 temp_id 기반 API는 존재하지 않음
                // 회원가입 취소는 단순히 캐시가 만료되도록 대기
                alert('회원가입이 취소되었습니다.\n캐시가 만료됩니다.');
                this.resetSignup();
                ScreenManager.show('loginInitial');
                return true;
            } catch (error) {
                console.error('[AuthManager] 회원가입 취소 실패:', error);
                alert(APIManager.handleError(error));
                return false;
            }
        },

        startFaceScan(type) {
            const scanElement = document.getElementById(`${type}FaceScan`);
            const statusElement = document.getElementById(`${type}FaceStatus`);
            const detailElement = document.getElementById(`${type}FaceDetail`);

            scanElement.classList.add('scanning');

            setTimeout(() => {
                if (type === 'login') {
                    statusElement.textContent = '얼굴 인식 성공!';
                    statusElement.classList.add('success');
                    detailElement.textContent = '환영합니다, 사용자님';
                    scanElement.classList.remove('scanning');
                    scanElement.classList.add('success');

                    setTimeout(() => {
                        this.login('사용자');
                    }, 1500);
                } else if (type === 'signup') {
                    statusElement.textContent = '얼굴 등록 완료!';
                    statusElement.classList.add('success');
                    detailElement.textContent = '음성 등록으로 이동합니다...';
                    scanElement.classList.remove('scanning');
                    scanElement.classList.add('success');

                    setTimeout(() => {
                        ScreenManager.show('signupVoice');
                    }, 1500);
                } else if (type === 'reset') {
                    statusElement.textContent = '얼굴 재설정 완료!';
                    statusElement.classList.add('success');
                    detailElement.textContent = '메뉴로 돌아갑니다...';
                    scanElement.classList.remove('scanning');
                    scanElement.classList.add('success');

                    setTimeout(() => {
                        MenuManager.close();
                        ScreenManager.show('appScreen');
                    }, 1500);
                }
            }, 3000);
        },

        startVoiceRegistration(type = 'signup') {
            const btn = document.getElementById(type === 'reset' ? 'startResetVoiceBtn' : 'startVoiceBtn');
            const statusElement = document.getElementById(type === 'reset' ? 'resetVoiceStatus' : 'signupVoiceStatus');
            const detailElement = document.getElementById(type === 'reset' ? 'resetVoiceDetail' : 'signupVoiceDetail');
            const scanElement = document.getElementById(type === 'reset' ? 'resetVoiceScan' : 'signupVoiceScan');

            if (btn) btn.disabled = true;
            statusElement.textContent = '녹음 중...';
            detailElement.textContent = '3초 동안 말씀해주세요';
            scanElement.classList.add('scanning');

            setTimeout(() => {
                statusElement.textContent = '음성 등록 완료!';
                statusElement.classList.add('success');
                scanElement.classList.remove('scanning');

                if (type === 'signup') {
                    detailElement.textContent = '회원가입 완료!';
                    setTimeout(() => {
                        this.signupVoice(null).then(() => {
                            ScreenManager.show('appScreen');
                        });
                    }, 1500);
                } else {
                    detailElement.textContent = '메뉴로 돌아갑니다...';
                    setTimeout(() => {
                        MenuManager.close();
                        ScreenManager.show('appScreen');
                    }, 1500);
                }
            }, 3000);
        },

        async sendEmailVerification() {
            const email = this.getEmail();

            if (!email || !email.includes('@')) {
                alert('올바른 이메일 주소를 입력해주세요.');
                return false;
            }

            // POST /api/auth/send-email-code 호출 (스펙 기반)
            try {
                const response = await APIManager.post('/auth/send-email-code', {
                    email: email,
                    purpose: 'SIGNUP'
                });

                if (response.success) {
                    state.isCodeSent = true;
                    state.emailVerified = false;
                    elements.emailCodeGroup.style.display = 'block';
                    elements.emailCodeInput.placeholder = '6자리 코드 입력 (테스트: 123456)';
                    alert(`인증 코드가 발송되었습니다.\n${email}\n\n테스트용 인증 코드: 123456`);
                    return true;
                } else {
                    throw new Error(response.message || '인증 코드 발송 실패');
                }
            } catch (error) {
                console.error('[AuthManager] 인증 코드 발송 실패:', error);
                alert(APIManager.handleError(error));
                return false;
            }
        },

        async verifyEmailCode() {
            const code = elements.emailCodeInput.value;
            const email = this.getEmail();

            if (code.length !== 6) {
                alert('인증 코드는 6자리여야 합니다.');
                return false;
            }

            // POST /api/auth/verify-email-code 호출 (스펙 기반)
            try {
                const response = await APIManager.post('/auth/verify-email-code', {
                    email: email,
                    code: code,
                    purpose: 'SIGNUP'
                });

                if (response.success) {
                    state.emailVerified = true;
                    this.checkSignupValidity();
                    alert('이메일 인증 완료!');
                    return true;
                } else {
                    throw new Error(response.message || '인증 실패');
                }
            } catch (error) {
                console.error('[AuthManager] 인증 코드 확인 실패:', error);
                alert(APIManager.handleError(error));
                return false;
            }
        },

        async checkEmailAvailability() {
            const email = this.getEmail();
            const resultElement = document.getElementById('emailCheckResult');
            const sendCodeBtn = document.getElementById('sendEmailBtn');

            if (!email) {
                resultElement.textContent = '이메일을 입력해주세요.';
                resultElement.className = 'form-hint error';
                state.emailChecked = false;
                state.emailAvailable = false;
                this.checkSignupValidity();
                return false;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                resultElement.textContent = '올바른 이메일 형식이 아닙니다.';
                resultElement.className = 'form-hint error';
                state.emailChecked = false;
                state.emailAvailable = false;
                this.checkSignupValidity();
                return false;
            }

            // 모의 구현 (실제 구현 시 API 호출)
            const unavailableEmails = ['test@example.com', 'admin@example.com', 'user@example.com'];
            if (unavailableEmails.includes(email.toLowerCase())) {
                resultElement.textContent = '이미 사용 중인 이메일입니다.';
                resultElement.className = 'form-hint error';
                state.emailChecked = true;
                state.emailAvailable = false;
                this.checkSignupValidity();
                return false;
            }

            // 이메일 사용 가능 확인 성공
            resultElement.textContent = '사용 가능한 이메일입니다.';
            resultElement.className = 'form-hint success';
            state.emailChecked = true;
            state.emailAvailable = true;
            state.emailVerified = false; // 인증 완료 전까지 false

            if (sendCodeBtn) {
                sendCodeBtn.style.display = 'block';
            }

            this.checkSignupValidity();
            return true;
        },

        checkIdAvailability() {
            const username = elements.signupUsername.value.trim();
            const resultElement = document.getElementById('idCheckResult');

            if (!username) {
                resultElement.textContent = '아이디를 입력해주세요.';
                resultElement.className = 'form-hint error';
                state.idChecked = false;
                state.idAvailable = false;
                this.checkSignupValidity();
                return false;
            }

            if (!ValidationController.validateId(username)) {
                resultElement.textContent = '아이디는 영문, 숫자 5-20자로 입력해주세요.';
                resultElement.className = 'form-hint error';
                state.idChecked = false;
                state.idAvailable = false;
                this.checkSignupValidity();
                return false;
            }

            const unavailableIds = ['test', 'admin', 'user'];
            if (unavailableIds.includes(username.toLowerCase())) {
                resultElement.textContent = '이미 사용 중인 아이디입니다.';
                resultElement.className = 'form-hint error';
                state.idChecked = true;
                state.idAvailable = false;
                this.checkSignupValidity();
                return false;
            }

            resultElement.textContent = '사용 가능한 아이디입니다.';
            resultElement.className = 'form-hint success';
            state.idChecked = true;
            state.idAvailable = true;
            this.checkSignupValidity();
            return true;
        },

        checkPasswordMatch() {
            const password = elements.signupPassword.value;
            const confirm = elements.signupPasswordConfirm.value;
            const resultElement = document.getElementById('passwordMatchResult');

            if (password) {
                const hasLetter = /[a-zA-Z]/.test(password);
                const hasNumber = /[0-9]/.test(password);
                const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
                const isValidLength = password.length >= 8 && password.length <= 20;

                let feedback = [];
                if (!hasLetter) feedback.push('영문');
                if (!hasNumber) feedback.push('숫자');
                if (!hasSpecial) feedback.push('특수문자');
                if (!isValidLength) feedback.push('8-20자');

                if (feedback.length > 0) {
                    resultElement.textContent = `비밀번호에 ${feedback.join(', ')}가(이) 필요합니다.`;
                    resultElement.className = 'form-hint info';
                } else {
                    resultElement.textContent = '사용 가능한 비밀번호입니다.';
                    resultElement.className = 'form-hint success';
                }
            } else {
                resultElement.textContent = '';
                resultElement.className = 'form-hint';
            }

            if (!confirm) {
                this.checkSignupValidity();
                return;
            }

            if (password !== confirm) {
                resultElement.textContent = '비밀번호가 일치하지 않습니다.';
                resultElement.className = 'form-hint error';
                this.checkSignupValidity();
                return false;
            }

            if (!ValidationController.validatePassword(password)) {
                resultElement.textContent = '비밀번호 형식이 올바르지 않습니다.';
                resultElement.className = 'form-hint error';
                this.checkSignupValidity();
                return false;
            }

            resultElement.textContent = '비밀번호가 일치합니다.';
            resultElement.className = 'form-hint success';
            this.checkSignupValidity();
            return true;
        },

        checkSignupValidity() {
            const nickname = elements.signupNickname.value.trim();
            const username = elements.signupUsername.value.trim();
            const password = elements.signupPassword.value;
            const confirm = elements.signupPasswordConfirm.value;
            const email = this.getEmail();

            const agreeTerms = document.getElementById('agreeTerms')?.checked;
            const agreePrivacy = document.getElementById('agreePrivacy')?.checked;
            const agreeSensitive = document.getElementById('agreeSensitive')?.checked;

            let isNicknameValid = false;
            if (nickname) {
                isNicknameValid = ValidationController.validateNickname(nickname);
            }

            let isIdValid = false;
            if (username) {
                isIdValid = ValidationController.validateId(username);
            }

            let isPasswordValid = false;
            if (password && password === confirm) {
                isPasswordValid = ValidationController.validatePassword(password);
            }

            let isEmailValid = false;
            if (email) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                isEmailValid = emailRegex.test(email);
            }

            const isValid =
                nickname.length > 0 &&
                isNicknameValid &&
                isIdValid &&
                state.idChecked &&
                state.idAvailable &&
                isEmailValid &&
                state.emailVerified &&
                isPasswordValid &&
                agreeTerms &&
                agreePrivacy &&
                agreeSensitive;

            if (elements.signupInfoNextBtn) {
                elements.signupInfoNextBtn.disabled = !isValid;
            }

            return isValid;
        },

        login(username) {
            const actualUsername = state.formData.nickname || username;
            state.currentUser = actualUsername;
            elements.userBadge.textContent = actualUsername;

            if (state.deviceConnected) {
                ScreenManager.show('appScreen');
            } else {
                alert('기기 연결을 기다리고 있습니다...');
            }
        },

        loginWithPassword() {
            const username = elements.loginUsername.value;
            const password = elements.loginPassword.value;

            if (!username || !password) {
                alert('아이디와 비밀번호를 입력해주세요.');
                return false;
            }

            if (!ValidationController.validateId(username)) {
                alert('아이디 형식이 올바르지 않습니다.');
                return false;
            }

            if (!ValidationController.validatePassword(password)) {
                alert('비밀번호 형식이 올바르지 않습니다.');
                return false;
            }

            this.login(username);
            return true;
        },

        resetSignup() {
            state.idChecked = false;
            state.idAvailable = false;
            state.emailVerified = false;
            state.emailChecked = false;
            state.emailAvailable = false;
            state.deviceConnected = false;
            state.tempId = null;

            if (elements.signupNickname) elements.signupNickname.value = '';
            if (elements.signupUsername) elements.signupUsername.value = '';
            if (elements.signupPassword) elements.signupPassword.value = '';
            if (elements.signupPasswordConfirm) elements.signupPasswordConfirm.value = '';
            if (elements.signupEmailId) elements.signupEmailId.value = '';
            if (elements.signupEmailDomain) elements.signupEmailDomain.value = '';
            if (elements.signupEmailDomainCustom) elements.signupEmailDomainCustom.value = '';
            if (elements.emailCodeInput) elements.emailCodeInput.value = '';
            if (elements.emailCodeGroup) elements.emailCodeGroup.style.display = 'none';
            if (elements.signupDeviceAlias) elements.signupDeviceAlias.value = '';
            if (elements.signupEmailDomainCustom) elements.signupEmailDomainCustom.style.display = 'none';

            document.getElementById('agreeTerms').checked = false;
            document.getElementById('agreePrivacy').checked = false;
            document.getElementById('agreeSensitive').checked = false;

            const idCheckResult = document.getElementById('idCheckResult');
            if (idCheckResult) {
                idCheckResult.textContent = '';
                idCheckResult.className = 'form-hint';
            }

            const emailCheckResult = document.getElementById('emailCheckResult');
            if (emailCheckResult) {
                emailCheckResult.textContent = '';
                emailCheckResult.className = 'form-hint';
            }

            const passwordMatchResult = document.getElementById('passwordMatchResult');
            if (passwordMatchResult) {
                passwordMatchResult.textContent = '';
                passwordMatchResult.className = 'form-hint';
            }

            if (elements.signupInfoNextBtn) {
                elements.signupInfoNextBtn.disabled = true;
            }

            const sendCodeBtn = document.getElementById('sendEmailCodeBtn');
            if (sendCodeBtn) {
                sendCodeBtn.style.display = 'none';
            }
        },

        deleteAccount() {
            const reason = prompt('회원 탈퇴 사유를 입력해주세요.\n\n예: 서비스 불만족, 타 서비스 이용, 더 이상 사용 안함 등');

            if (reason === null) {
                return false;
            }

            if (reason.trim() === '') {
                alert('탈퇴 사유를 입력해주세요.');
                return false;
            }

            if (confirm(`정말로 회원 탈퇴를 진행하시겠습니까?\n\n탈퇴 사유: ${reason}\n\n이 작업은 되돌릴 수 없습니다.`)) {
                state.currentUser = null;
                elements.userBadge.textContent = '게스트';
                MenuManager.close();
                ScreenManager.show('loginInitial');
                alert('회원 탈퇴가 완료되었습니다.');
                return true;
            }
            return false;
        },

        logout() {
            const sessionId = state.sessionId;
            state.currentUser = null;
            elements.userBadge.textContent = '게스트';
            elements.loginUsername.value = '';
            elements.loginPassword.value = '';
            MenuManager.close();

            if (sessionId) {
                SessionManager.logout(sessionId, 'LOGOUT');
            }

            ScreenManager.show('loginInitial');
        }
    };

    // ==================== VoiceController ====================
    const VoiceController = {
        toggle() {
            state.voiceEnabled = elements.voiceToggle.checked;

            if (state.voiceEnabled) {
                elements.voiceCard.classList.add('listening');
                elements.voiceText.textContent = '듣고 있습니다...';
            } else {
                elements.voiceCard.classList.remove('listening');
                elements.voiceText.textContent = '음성 명령 비활성화';
            }
        },

        setActive(isActive) {
            if (isActive) {
                elements.voiceCard.classList.remove('listening');
                elements.voiceCard.classList.add('active');
            } else {
                elements.voiceCard.classList.remove('active');
                elements.voiceCard.classList.add('listening');
            }
        },

        setText(text) {
            elements.voiceText.textContent = text;
        },

        get isEnabled() {
            return state.voiceEnabled;
        }
    };

    // ==================== ManualController ====================
    const ManualController = {
        // 상태 표시 업데이트
        updateStatusDisplay() {
            const updateElement = (element, value) => {
                if (element) {
                    element.textContent = value;
                    element.setAttribute('data-zero', value === 0 ? 'true' : 'false');
                }
            };

            // X, Y 좌표 계산 (상쇄 논리 적용 후)
            const x = state.manualControl.right - state.manualControl.left;
            const y = state.manualControl.down - state.manualControl.up;

            // Tilt, HAS 각도 계산 (tilt_up/down, has_left/right 사용)
            const tilt = state.manualControl.tilt_down - state.manualControl.tilt_up;
            const has = state.manualControl.has_right - state.manualControl.has_left;

            updateElement(elements.statusX, x);
            updateElement(elements.statusY, y);
            updateElement(elements.statusTilt, `${tilt}°`);
            updateElement(elements.statusHas, `${has}°`);
        },

        // 상쇄 논리 적용 함수 (위치 이동용 - 1단위)
        applyCancellation(opposite, target) {
            const oppositeValue = state.manualControl[opposite];
            const targetValue = state.manualControl[target];

            if (oppositeValue > 0) {
                state.manualControl[opposite] = Math.max(0, oppositeValue - 1);
            } else {
                state.manualControl[target] = targetValue + 1;
            }
        },

        // 회전용 함수 (3도씩 변경)
        applyRotation(opposite, target) {
            const oppositeValue = state.manualControl[opposite];
            const targetValue = state.manualControl[target];

            if (oppositeValue > 0) {
                state.manualControl[opposite] = Math.max(0, oppositeValue - 3);
            } else {
                state.manualControl[target] = targetValue + 3;
            }
        },

        moveUp() {
            this.applyCancellation('down', 'up');
            this.updateStatusDisplay();
            return true;
        },

        moveDown() {
            this.applyCancellation('up', 'down');
            this.updateStatusDisplay();
            return true;
        },

        moveLeft() {
            this.applyCancellation('right', 'left');
            this.updateStatusDisplay();
            return true;
        },

        moveRight() {
            this.applyCancellation('left', 'right');
            this.updateStatusDisplay();
            return true;
        },

        moveTiltUp() {
            this.applyRotation('tilt_down', 'tilt_up');
            this.updateStatusDisplay();
            return true;
        },

        moveTiltDown() {
            this.applyRotation('tilt_up', 'tilt_down');
            this.updateStatusDisplay();
            return true;
        },

        moveHasLeft() {
            this.applyRotation('has_right', 'has_left');
            this.updateStatusDisplay();
            return true;
        },

        moveHasRight() {
            this.applyRotation('has_left', 'has_right');
            this.updateStatusDisplay();
            return true;
        },

        // 프리셋 저장
        async savePreset() {
            state.manualControl.preset = {
                up: state.manualControl.up,
                down: state.manualControl.down,
                left: state.manualControl.left,
                right: state.manualControl.right,
                tilt_up: state.manualControl.tilt_up,
                tilt_down: state.manualControl.tilt_down,
                has_left: state.manualControl.has_left,
                has_right: state.manualControl.has_right,
                distance: state.manualControl.distance
            };

            // PUT /api/user-manual-presets/{user_id} 호출 (스펙 기반)
            try {
                const response = await APIManager.put(`/user-manual-presets/1`, {
                    connection_id: state.connectionId,
                    up: state.manualControl.preset.up,
                    down: state.manualControl.preset.down,
                    left: state.manualControl.preset.left,
                    right: state.manualControl.preset.right,
                    tilt_up: state.manualControl.preset.tilt_up,
                    tilt_down: state.manualControl.preset.tilt_down,
                    has_left: state.manualControl.preset.has_left,
                    has_right: state.manualControl.preset.has_right,
                    distance: state.manualControl.preset.distance
                });

                if (response.success) {
                    alert(`현재 설정이 저장되었습니다.\nX: ${state.manualControl.preset.right - state.manualControl.preset.left}, Y: ${state.manualControl.preset.down - state.manualControl.preset.up}, Tilt: ${state.manualControl.preset.tilt_down - state.manualControl.preset.tilt_up}°, HAS: ${state.manualControl.preset.has_right - state.manualControl.preset.has_left}°, Distance: ${state.manualControl.preset.distance}`);
                }
            } catch (error) {
                console.error('[ManualController] 프리셋 저장 실패:', error);
                alert(APIManager.handleError(error));
            }
        },

        // 프리셋 복구
        async resetPreset() {
            // GET /api/user-manual-presets/{user_id}/active 호출 (스펙 기반)
            try {
                const response = await APIManager.get(`/user-manual-presets/1/active`);

                if (response.success && response.preset) {
                    const preset = response.preset;
                    state.manualControl.preset = preset;
                    state.manualControl.up = preset.up;
                    state.manualControl.down = preset.down;
                    state.manualControl.left = preset.left;
                    state.manualControl.right = preset.right;
                    state.manualControl.tilt_up = preset.tilt_up;
                    state.manualControl.tilt_down = preset.tilt_down;
                    state.manualControl.has_left = preset.has_left;
                    state.manualControl.has_right = preset.has_right;
                    state.manualControl.distance = preset.distance;

                    if (elements.distanceSlider) {
                        elements.distanceSlider.value = preset.distance;
                    }

                    this.updateStatusDisplay();
                    alert(`프리셋으로 복구되었습니다.\nX: ${preset.right - preset.left}, Y: ${preset.down - preset.up}, Tilt: ${preset.tilt_down - preset.tilt_up}°, HAS: ${preset.has_right - preset.has_left}°, Distance: ${preset.distance}`);
                } else {
                    alert('저장된 프리셋이 없습니다. 영점으로 복구합니다.');
                    // 영점으로 초기화
                    state.manualControl.preset = {
                        up: 0, down: 0, left: 0, right: 0,
                        tilt_up: 0, tilt_down: 0, has_left: 0, has_right: 0,
                        distance: 50
                    };
                    this.resetPreset();
                }
            } catch (error) {
                console.error('[ManualController] 프리셋 복구 실패:', error);
                alert(APIManager.handleError(error));
            }
        },

        // 이동 범위 설정 (app_specsheet.md 4.7.1 기반)
        async setMovementRange(range) {
            try {
                const response = await APIManager.put(`/movement-ranges/${state.connectionId}`, range);

                if (response.success) {
                    state.movementRange = range;
                    alert('이동 범위가 설정되었습니다.');
                }
            } catch (error) {
                console.error('[ManualController] 이동 범위 설정 실패:', error);
                alert(APIManager.handleError(error));
            }
        }
    };

    // ==================== FindPasswordController ====================
    const FindPasswordController = {
        findIdState: {
            email: '',
            isCodeSent: false,
            isVerified: false,
            code: '',
            foundId: null
        },

        resetPasswordState: {
            email: '',
            isCodeSent: false,
            isVerified: false,
            code: '',
            resetToken: null
        },

        getFindIdEmail() {
            const emailId = document.getElementById('findIdEmailId')?.value.trim();
            const domain = document.getElementById('findIdEmailDomain')?.value;
            const customDomain = document.getElementById('findIdEmailDomainCustom')?.value.trim();

            if (!emailId) return '';

            if (domain) {
                return `${emailId}@${domain}`;
            } else if (customDomain) {
                return `${emailId}@${customDomain}`;
            }
            return '';
        },

        getFindPasswordEmail() {
            const emailId = document.getElementById('findPasswordEmailId')?.value.trim();
            const domain = document.getElementById('findPasswordEmailDomain')?.value;
            const customDomain = document.getElementById('findPasswordEmailDomainCustom')?.value.trim();

            if (!emailId) return '';

            if (domain) {
                return `${emailId}@${domain}`;
            } else if (customDomain) {
                return `${emailId}@${customDomain}`;
            }
            return '';
        },

        async sendFindIdCode() {
            const email = this.getFindIdEmail();

            if (!email || !email.includes('@')) {
                alert('올바른 이메일 주소를 입력해주세요.');
                return false;
            }

            // POST /api/auth/find-id/send-code 호출 (BE 실제 구현)
            try {
                const response = await APIManager.post('/auth/find-id/send-code', {
                    email: email
                });

                if (response.success) {
                    this.findIdState.isCodeSent = true;
                    document.getElementById('findIdCodeGroup').style.display = 'block';
                    document.getElementById('findIdCodeInput').placeholder = '6자리 코드 입력';
                    document.getElementById('sendFindIdCodeBtn').style.display = 'none';
                    document.getElementById('verifyFindIdCompleteBtn').style.display = 'none';
                    alert(`인증 코드가 발송되었습니다.\n${email}`);
                    return true;
                } else {
                    throw new Error(response.message || '인증 코드 발송 실패');
                }
            } catch (error) {
                console.error('[FindPasswordController] 아이디 찾기 인증 코드 발송 실패:', error);
                alert(APIManager.handleError(error));
                return false;
            }
        },

        async verifyFindIdCode() {
            const email = this.getFindIdEmail();
            const code = document.getElementById('findIdCodeInput').value;

            if (code.length !== 6) {
                alert('인증 코드는 6자리여야 합니다.');
                return false;
            }

            // POST /api/auth/find-id/verify-code 호출 (BE 실제 구현)
            try {
                const response = await APIManager.post('/auth/find-id/verify-code', {
                    email: email,
                    code: code
                });

                if (response.success) {
                    this.findIdState.isVerified = true;
                    this.findIdState.code = code;
                    this.findIdState.foundId = response.login_id;

                    document.getElementById('verifyFindIdCompleteBtn').style.display = 'block';
                    alert('이메일 인증 완료!');
                    return true;
                } else {
                    throw new Error(response.message || '인증 실패');
                }
            } catch (error) {
                console.error('[FindPasswordController] 아이디 찾기 인증 코드 확인 실패:', error);
                alert(APIManager.handleError(error));
                return false;
            }
        },

        completeFindId() {
            alert(`회원님의 아이디는: ${this.findIdState.foundId}\n\n이 아이디로 로그인해주세요.`);
            ScreenManager.show('loginForm');
            return true;
        },

        async sendFindPasswordCode() {
            const email = this.getFindPasswordEmail();

            if (!email || !email.includes('@')) {
                alert('올바른 이메일 주소를 입력해주세요.');
                return false;
            }

            // POST /api/password/reset/send-code 호출 (BE 실제 구현)
            try {
                const response = await APIManager.post('/password/reset/send-code', {
                    email: email
                });

                if (response.success) {
                    this.resetPasswordState.isCodeSent = true;
                    this.resetPasswordState.resetToken = response.token;
                    document.getElementById('findPasswordCodeGroup').style.display = 'block';
                    document.getElementById('findPasswordCodeInput').placeholder = '6자리 코드 입력';
                    document.getElementById('sendFindPasswordCodeBtn').style.display = 'none';
                    alert(`인증 코드가 발송되었습니다.\n${email}`);
                    return true;
                } else {
                    throw new Error(response.message || '인증 코드 발송 실패');
                }
            } catch (error) {
                console.error('[FindPasswordController] 비밀번호 재설정 인증 코드 발송 실패:', error);
                alert(APIManager.handleError(error));
                return false;
            }
        },

        async verifyFindPasswordCode() {
            const email = this.getFindPasswordEmail();
            const code = document.getElementById('findPasswordCodeInput').value;

            if (code.length !== 6) {
                alert('인증 코드는 6자리여야 합니다.');
                return false;
            }

            // POST /api/password/reset/verify-code 호출 (BE 실제 구현)
            try {
                const response = await APIManager.post('/password/reset/verify-code', {
                    email: email,
                    code: code
                });

                if (response.success) {
                    this.resetPasswordState.isVerified = true;
                    this.resetPasswordState.code = code;
                    this.resetPasswordState.resetToken = response.reset_token;

                    document.getElementById('newPasswordGroup').style.display = 'block';
                    document.getElementById('newPasswordConfirmGroup').style.display = 'block';
                    document.getElementById('resetPasswordBtn').style.display = 'block';

                    alert('이메일 인증 완료!\n새 비밀번호를 입력해주세요.');
                    return true;
                } else {
                    throw new Error(response.message || '인증 실패');
                }
            } catch (error) {
                console.error('[FindPasswordController] 비밀번호 재설정 인증 코드 확인 실패:', error);
                alert(APIManager.handleError(error));
                return false;
            }
        },

        async resetPassword() {
            const newPassword = document.getElementById('newPasswordInput').value;
            const newPasswordConfirm = document.getElementById('newPasswordConfirmInput').value;

            if (!ValidationController.validatePassword(newPassword)) {
                alert('비밀번호 형식이 올바르지 않습니다.\n영문, 숫자, 특수문자 포함 8-20자');
                return false;
            }

            if (newPassword !== newPasswordConfirm) {
                alert('비밀번호가 일치하지 않습니다.');
                return false;
            }

            // POST /api/password/reset/set-new 호출 (BE 실제 구현)
            try {
                const response = await APIManager.post('/password/reset/set-new', {
                    reset_token: this.resetPasswordState.resetToken,
                    new_password: newPassword
                });

                if (response.success) {
                    alert('비밀번호가 재설정되었습니다.\n새 비밀번호로 로그인해주세요.');
                    ScreenManager.show('loginForm');
                    return true;
                } else {
                    throw new Error(response.message || '비밀번호 재설정 실패');
                }
            } catch (error) {
                console.error('[FindPasswordController] 비밀번호 재설정 실패:', error);
                alert(APIManager.handleError(error));
                return false;
            }
        }
    };

    // ==================== RobotController ====================
    const RobotController = {
        commandLogState: {
            sessionId: 1,
            logs: []
        },

        statusLabels: {
            'idle': '현재 상태: 대기 중',
            'tracking': '현재 상태: 사용자 따라가는 중',
            'moving': '현재 상태: 이동 중',
            'aside': '현재 상태: 시야 밖으로 이동 중'
        },

        trackingEnabled: false,

        logCommand(commandType, inputMethod, content, previousStatus, newStatus) {
            const logEntry = {
                session_id: this.commandLogState.sessionId,
                command_type: commandType,
                command_input_method: inputMethod,
                command_content: content,
                previous_robot_status: previousStatus,
                new_robot_status: newStatus,
                created_at: new Date().toISOString()
            };

            this.commandLogState.logs.push(logEntry);
            console.log('[명령 로그]', logEntry);

            // POST /api/command-logs 호출 (스펙 기반)
            APIManager.post('/command-logs', logEntry);
        },

        updateStatus(status) {
            const previousStatus = state.robotStatus;
            state.robotStatus = status;
            elements.robotStatus.className = `status-box ${status}`;
            elements.robotStatusText.textContent = this.statusLabels[status] || '현재 상태: 알 수 없음';

            // PUT /api/sessions/{session_id}/robot-status 호출 (스펙 기반)
            APIManager.put(`/sessions/${state.sessionId}/robot-status`, {
                robot_status: status,
                last_voice_command: elements.voiceText.textContent
            });

            if (status === 'moving') {
                elements.robotStatus.style.background = '#e3f2fd';
                elements.robotStatus.style.borderColor = '#3b82f6';
                elements.robotStatus.style.color = '#3b82f6';
            } else {
                elements.robotStatus.style.background = '';
                elements.robotStatus.style.borderColor = '';
                elements.robotStatus.style.color = '';
            }
        },

        startTracking() {
            const previousStatus = state.robotStatus;
            this.updateStatus('tracking');
            VoiceController.setActive(true);
            VoiceController.setText('추적 중...');

            this.logCommand('FOLLOW_USER', 'BUTTON', '사용자 추적 버튼 클릭', previousStatus, 'TRACKING');

            setTimeout(() => {
                this.updateStatus('moving');
            }, 2000);
        },


        goAside() {
            const previousStatus = state.robotStatus;
            this.updateStatus('aside');
            VoiceController.setActive(false);
            VoiceController.setText('시야 밖으로 이동 중...');

            this.logCommand('MOVE_AWAY', 'BUTTON', '시야 밖으로 버튼 클릭', previousStatus, 'ASIDE');

            setTimeout(() => {
                this.updateStatus('idle');
                VoiceController.setText('시야 밖으로 이동 완료');
            }, 3000);
        },

        stop() {
            const previousStatus = state.robotStatus;
            this.updateStatus('idle');
            VoiceController.setActive(false);
            VoiceController.setText('멈춤');

            this.trackingEnabled = false;
            const trackBtn = document.getElementById('trackUserBtn');
            if (trackBtn) {
                trackBtn.classList.remove('active');
            }

            this.logCommand('STOP', 'BUTTON', '멈춤기 버튼 클릭', previousStatus, 'IDLE');
        },

        toggleTracking() {
            const trackToggle = document.getElementById('trackingToggle');
            const isChecked = trackToggle ? trackToggle.checked : false;

            this.trackingEnabled = isChecked;

            if (isChecked) {
                this.startTracking();
            } else {
                const previousStatus = state.robotStatus;
                this.updateStatus('idle');
                VoiceController.setActive(false);
                VoiceController.setText('듣고 있습니다...');

                this.logCommand('STOP_TRACKING', 'TOGGLE', '사용자 추적 토글 OFF', previousStatus, 'IDLE');
            }
        },

        get status() {
            return state.robotStatus;
        }
    };

    // ==================== Event Bindings ====================
    function bindEvents() {
        // 로그인 초기 화면
        document.getElementById('loginFaceBtn')?.addEventListener('click', () => {
            ScreenManager.show('loginFace');
            DeviceManager.startLoginDeviceWaiting();
        });
        document.getElementById('loginFormBtn')?.addEventListener('click', () => {
            ScreenManager.show('loginForm');
            DeviceManager.startLoginFormDeviceWaiting();
        });
        document.getElementById('signupInitialBtn')?.addEventListener('click', () =>
            ScreenManager.show('signupInitial'));

        // 뒤로가기 버튼들
        document.getElementById('backToLoginInitial')?.addEventListener('click', () =>
            ScreenManager.show('loginInitial'));
        document.getElementById('backToLoginFromForm')?.addEventListener('click', () =>
            ScreenManager.show('loginInitial'));
        document.getElementById('backToLoginFromSignup')?.addEventListener('click', () =>
            ScreenManager.show('loginInitial'));
        document.getElementById('backToSignupInitialFromInfo')?.addEventListener('click', () =>
            ScreenManager.show('signupInitial'));

        // 로그인 폼
        document.getElementById('loginSubmitBtn')?.addEventListener('click', () =>
            AuthManager.loginWithPassword());

        // 회원가입 초기 화면
        document.getElementById('signupInfoBtn')?.addEventListener('click', () =>
            ScreenManager.show('signupInfo'));

        // 회원가입 정보 입력 화면
        document.getElementById('checkIdBtn')?.addEventListener('click', () =>
            AuthManager.checkIdAvailability());
        document.getElementById('checkEmailBtn')?.addEventListener('click', () => {
            AuthManager.checkEmailAvailability();
            // 중복확인 후 인증번호 발송 버튼 표시
            const sendEmailCodeBtn = document.getElementById('sendEmailCodeBtn');
            if (sendEmailCodeBtn && state.emailAvailable) {
                sendEmailCodeBtn.style.display = 'inline-block';
                document.getElementById('checkEmailBtn').style.display = 'none';
            }
        });
        document.getElementById('sendEmailCodeBtn')?.addEventListener('click', async () =>
            await AuthManager.sendEmailVerification());
        document.getElementById('verifyEmailBtn')?.addEventListener('click', async () =>
            await AuthManager.verifyEmailCode());

        elements.signupEmailId?.addEventListener('input', () => {
            state.emailChecked = false;
            state.emailAvailable = false;
            state.emailVerified = false;
            AuthManager.checkSignupValidity();

            const sendCodeBtn = document.getElementById('sendEmailCodeBtn');
            if (sendCodeBtn) {
                sendCodeBtn.style.display = 'none';
            }
        });

        elements.signupEmailDomain?.addEventListener('change', () => {
            state.emailChecked = false;
            state.emailAvailable = false;
            state.emailVerified = false;
            AuthManager.checkSignupValidity();

            const sendCodeBtn = document.getElementById('sendEmailCodeBtn');
            if (sendCodeBtn) {
                sendCodeBtn.style.display = 'none';
            }
        });

        elements.signupEmailDomainCustom?.addEventListener('input', () => {
            state.emailChecked = false;
            state.emailAvailable = false;
            state.emailVerified = false;
            AuthManager.checkSignupValidity();

            const sendCodeBtn = document.getElementById('sendEmailCodeBtn');
            if (sendCodeBtn) {
                sendCodeBtn.style.display = 'none';
            }
        });

        elements.signupEmailDomain?.addEventListener('change', (e) => {
            const domain = e.target.value;
            const customInput = elements.signupEmailDomainCustom;

            if (domain === '') {
                customInput.style.display = 'block';
            } else {
                customInput.style.display = 'none';
                customInput.value = '';
            }

            state.emailChecked = false;
            state.emailAvailable = false;
            state.emailVerified = false;
            AuthManager.checkSignupValidity();

            const sendCodeBtn = document.getElementById('sendEmailCodeBtn');
            if (sendCodeBtn) {
                sendCodeBtn.style.display = 'none';
            }
        });

        if (elements.signupEmailDomain && elements.signupEmailDomainCustom) {
            const domain = elements.signupEmailDomain.value;
            const customInput = elements.signupEmailDomainCustom;
            if (domain === '') {
                customInput.style.display = 'block';
            } else {
                customInput.style.display = 'none';
            }
        }

        elements.signupNickname?.addEventListener('input', () => {
            state.formData.nickname = elements.signupNickname.value.trim();
            AuthManager.checkSignupValidity();
        });
        elements.signupUsername?.addEventListener('input', () => {
            state.idChecked = false;
            state.idAvailable = false;

            const resultElement = document.getElementById('idCheckResult');
            if (resultElement) {
                resultElement.textContent = '';
                resultElement.className = 'form-hint';
            }

            AuthManager.checkSignupValidity();
        });
        elements.signupPassword?.addEventListener('input', () =>
            AuthManager.checkSignupValidity());
        elements.signupPasswordConfirm?.addEventListener('input', () =>
            AuthManager.checkPasswordMatch());

        elements.emailCodeInput?.addEventListener('input', () => {
            const verifyBtn = document.getElementById('verifyEmailBtn');
            const codeLength = elements.emailCodeInput.value.length;

            if (verifyBtn) {
                verifyBtn.disabled = codeLength !== 6;
            }
        });

        // 회원가입 1단계 완료 버튼 (temp_id 기반)
        document.getElementById('signupInfoNextBtn')?.addEventListener('click', async () => {
            if (!elements.signupInfoNextBtn.disabled) {
                const success = await AuthManager.signupInfo();
                if (success) {
                    ScreenManager.show('signupDevice');
                }
            }
        });

        // 회원가입 2단계 완료 버튼 (temp_id 기반)
        elements.signupDeviceAlias?.addEventListener('input', () => {
            if (!state.deviceConnected && elements.signupDeviceAlias.value.length >= 2) {
                DeviceManager.startSignupDeviceSearch();
            }
        });
        document.getElementById('signupDeviceNextBtn')?.addEventListener('click', async () => {
            const success = await AuthManager.signupDevice();
            if (success) {
                ScreenManager.show('signupFace');
            }
        });
        document.getElementById('cancelSignupBtn')?.addEventListener('click', async () => {
            if (confirm('회원가입을 취소하면 모든 정보가 초기화됩니다.\n정말 취소하시겠습니까?')) {
                await AuthManager.cancelSignup();
                ScreenManager.show('loginInitial');
            }
        });

        // 회원가입 얼굴 화면 취소
        document.getElementById('cancelSignupBtnFromFace')?.addEventListener('click', async () => {
            if (confirm('회원가입을 취소하면 모든 정보가 초기화됩니다.\n정말 취소하시겠습니까?')) {
                await AuthManager.cancelSignup();
                ScreenManager.show('loginInitial');
            }
        });

        // 회원가입 음성 등록 화면
        document.getElementById('startVoiceBtn')?.addEventListener('click', () =>
            AuthManager.startVoiceRegistration('signup'));
        document.getElementById('cancelSignupVoiceBtn')?.addEventListener('click', async () => {
            if (confirm('회원가입을 취소하면 모든 정보가 초기화됩니다.\n정말 취소하시겠습니까?')) {
                await AuthManager.cancelSignup();
                ScreenManager.show('loginInitial');
            }
        });
        document.getElementById('skipVoiceBtn')?.addEventListener('click', async () => {
            const success = await AuthManager.signupVoice(null);
            if (success) {
                ScreenManager.show('appScreen');
            }
        });

        // 로봇 제어
        document.getElementById('trackingToggle')?.addEventListener('change', () =>
            RobotController.toggleTracking());
        document.getElementById('moveAsideBtn')?.addEventListener('click', () =>
            RobotController.goAside());

        // 수동 제어
        document.getElementById('btnUp')?.addEventListener('click', () =>
            ManualController.moveUp());
        document.getElementById('btnDown')?.addEventListener('click', () =>
            ManualController.moveDown());
        document.getElementById('btnLeft')?.addEventListener('click', () =>
            ManualController.moveLeft());
        document.getElementById('btnRight')?.addEventListener('click', () =>
            ManualController.moveRight());
        document.getElementById('btnPitchUp')?.addEventListener('click', () =>
            ManualController.movePitchUp());
        document.getElementById('btnPitchDown')?.addEventListener('click', () =>
            ManualController.movePitchDown());
        document.getElementById('btnYawLeft')?.addEventListener('click', () =>
            ManualController.moveYawLeft());
        document.getElementById('btnYawRight')?.addEventListener('click', () =>
            ManualController.moveYawRight());
        document.getElementById('savePresetBtn')?.addEventListener('click', () =>
            ManualController.savePreset());
        document.getElementById('resetPresetBtn')?.addEventListener('click', () =>
            ManualController.resetPreset());

        elements.distanceSlider?.addEventListener('input', () => {
            state.manualControl.distance = elements.distanceSlider.value;
        });

        // 아이디/비밀번호 찾기
        document.getElementById('findIdBtn')?.addEventListener('click', () =>
            ScreenManager.show('findIdScreen'));
        document.getElementById('findPasswordBtn')?.addEventListener('click', () =>
            ScreenManager.show('findPasswordScreen'));

        // 아이디 찾기 관련
        document.getElementById('backToLoginFromFindId')?.addEventListener('click', () =>
            ScreenManager.show('loginForm'));
        document.getElementById('sendFindIdCodeBtn')?.addEventListener('click', () =>
            FindPasswordController.sendFindIdCode());
        document.getElementById('verifyFindIdBtn')?.addEventListener('click', () =>
            FindPasswordController.verifyFindIdCode());
        document.getElementById('verifyFindIdCompleteBtn')?.addEventListener('click', () =>
            FindPasswordController.completeFindId());

        // 비밀번호 재설정 관련
        document.getElementById('backToLoginFromFindPassword')?.addEventListener('click', () =>
            ScreenManager.show('loginForm'));
        document.getElementById('sendFindPasswordCodeBtn')?.addEventListener('click', () =>
            FindPasswordController.sendFindPasswordCode());
        document.getElementById('verifyFindPasswordBtn')?.addEventListener('click', () =>
            FindPasswordController.verifyFindPasswordCode());
        document.getElementById('resetPasswordBtn')?.addEventListener('click', () =>
            FindPasswordController.resetPassword());

        // 약관 모달
        document.getElementById('viewTermsBtn')?.addEventListener('click', () =>
            ModalManager.open('terms'));
        document.getElementById('closeTermsModal')?.addEventListener('click', () =>
            ModalManager.close('terms'));
        document.getElementById('viewPrivacyBtn')?.addEventListener('click', () =>
            ModalManager.open('privacy'));
        document.getElementById('closePrivacyModal')?.addEventListener('click', () =>
            ModalManager.close('privacy'));
        document.getElementById('viewSensitiveBtn')?.addEventListener('click', () =>
            ModalManager.open('sensitive'));
        document.getElementById('closeSensitiveModal')?.addEventListener('click', () =>
            ModalManager.close('sensitive'));

        // 약관 동의 체크박스
        document.getElementById('agreeTerms')?.addEventListener('change', () => {
            console.log('약관 동의 변경:', document.getElementById('agreeTerms').checked);
            AuthManager.checkSignupValidity();
        });
        document.getElementById('agreePrivacy')?.addEventListener('change', () => {
            console.log('개인정보 동의 변경:', document.getElementById('agreePrivacy').checked);
            AuthManager.checkSignupValidity();
        });
        document.getElementById('agreeSensitive')?.addEventListener('change', () => {
            console.log('민감정보 동의 변경:', document.getElementById('agreeSensitive').checked);
            AuthManager.checkSignupValidity();
        });

        // 음성 토글
        elements.voiceToggle?.addEventListener('change', () =>
            VoiceController.toggle());

        // 메뉴
        document.getElementById('menuBtn')?.addEventListener('click', () =>
            MenuManager.open());
        document.getElementById('menuClose')?.addEventListener('click', () =>
            MenuManager.close());
        elements.menuOverlay?.addEventListener('click', (e) => {
            if (e.target === elements.menuOverlay) {
                MenuManager.close();
            }
        });

        // 메뉴 아이템들
        document.getElementById('resetFaceBtn')?.addEventListener('click', () => {
            MenuManager.close();
            ScreenManager.show('resetFace');
        });
        document.getElementById('resetVoiceBtn')?.addEventListener('click', () => {
            MenuManager.close();
            ScreenManager.show('resetVoice');
        });
        document.getElementById('startResetVoiceBtn')?.addEventListener('click', () =>
            AuthManager.startVoiceRegistration('reset'));
        document.getElementById('cancelResetFaceBtn')?.addEventListener('click', () =>
            ScreenManager.show('appScreen'));
        document.getElementById('cancelResetVoiceBtn')?.addEventListener('click', () =>
            ScreenManager.show('appScreen'));
        document.getElementById('deleteAccountBtn')?.addEventListener('click', () =>
            AuthManager.deleteAccount());
        document.getElementById('logoutBtn')?.addEventListener('click', () =>
            AuthManager.logout());
        document.getElementById('deviceInfoBtn')?.addEventListener('click', () => {
            MenuManager.close();
            ScreenManager.show('deviceInfoScreen');
        });
        document.getElementById('backFromDeviceInfo')?.addEventListener('click', () =>
            ScreenManager.show('appScreen'));

        // 하단 탭 전환
        document.querySelectorAll('.tab-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const tabId = e.currentTarget.dataset.tab;
                TabController.switchTab(tabId);
            });
        });
    }

    // ==================== Public API ====================
    return {
        init() {
            initElements();
            bindEvents();

            // 앱 초기화 시 자동 로그인 확인
            SessionManager.checkAutoLogin();
        },

        getState: () => ({ ...state }),

        ScreenManager,
        MenuManager,
        ModalManager,
        DeviceManager,
        AuthManager,
        VoiceController,
        RobotController,
        ManualController,
        TabController,
        ValidationController,
        SessionManager,
        APIManager,
        FindPasswordController
    };
})();

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    SarvisApp.init();
});

// 테스트 환경에서 사용 가능하도록 전역 노출
if (typeof window !== 'undefined') {
    window.SarvisApp = SarvisApp;
}
