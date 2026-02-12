savis 제어 어플의 목업을 지속적인 회의와 수정을 통해 html로 완성하였다.
통신방식은 WiFi, 데이터 형식은 Json으로 정했다.

<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SAVIS - Voice Sync & Remote Control</title>
    <style>
        :root { --primary: #4a90e2; --success: #2ecc71; --danger: #e74c3c; --warning: #f39c12; --bg: #f5f7fa; --card: #ffffff; --text: #333; }
        body { font-family: 'Pretendard', sans-serif; background-color: #d1d9e6; margin: 0; display: flex; justify-content: center; padding: 20px; color: var(--text); }
        .app-container { width: 360px; height: 800px; background: var(--bg); border-radius: 40px; border: 12px solid #222; overflow: hidden; display: flex; flex-direction: column; position: relative; box-shadow: 0 25px 50px rgba(0,0,0,0.2); }
        
        /* 헤더 및 탭 */
        .status-bar { padding: 12px 20px; background: #fff; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; font-size: 12px; }
        .user-label { background: #f0f4f8; color: #555; padding: 5px 15px; border-radius: 20px; font-weight: bold; border: 1px solid #d1d9e6; font-size: 11px; }
        .nav-tabs { display: flex; background: #fff; border-bottom: 1px solid #ddd; }
        .tab { flex: 1; padding: 15px 0; text-align: center; font-size: 14px; cursor: pointer; color: #888; }
        .tab.active { color: var(--primary); border-bottom: 3px solid var(--primary); font-weight: bold; }
        .tab.hidden { display: none; }

        /* 컨텐츠 공통 */
        .content-wrapper { flex: 1; overflow-y: auto; padding: 20px; }
        .content { display: none; }
        .content.active { display: block; }
        .card { background: var(--card); padding: 22px; border-radius: 20px; margin-bottom: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .ai-message-board { width: 100%; height: 180px; background: #222; border-radius: 18px; margin-bottom: 15px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px; box-sizing: border-box; }
        .ai-status-text { color: var(--success); font-size: 18px; font-weight: bold; margin-bottom: 10px; min-height: 54px; line-height: 1.4; }
        
        /* 제어 탭 스타일 */
        .control-title { font-size: 20px; font-weight: bold; margin: 10px 0 10px; text-align: left; }
        .warning-banner { background: var(--danger); color: white; padding: 8px; border-radius: 10px; font-size: 11px; text-align: center; margin-bottom: 15px; display: none; font-weight: bold; }
        .control-grid { display: grid; grid-template-columns: 1fr 110px; gap: 10px; margin-bottom: 20px; align-items: center; }
        .d-pad { display: grid; grid-template-columns: repeat(3, 45px); gap: 8px; justify-content: center; }
        .pad-btn { width: 45px; height: 45px; background: #fff; border-radius: 12px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 1px solid #ddd; font-size: 18px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .pad-btn:active { background: #f0f0f0; transform: scale(0.95); }
        
        /* 각도 조절 2x2 그리드 */
        .angle-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 8px; }
        .z-control { display: flex; flex-direction: column; gap: 5px; }
        .z-btn { height: 35px; background: #fff; border-radius: 10px; border: 1px solid #ddd; font-size: 11px; font-weight: bold; cursor: pointer; }
        .z-btn.angle { background: #f8f9fa; color: var(--primary); }

        /* 가동 범위 설정 */
        .photo-space { width: 100%; height: 180px; background: #eee url('https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&q=80&w=400') center/cover; border-radius: 15px; position: relative; overflow: hidden; }
        .cuboid-view { position: absolute; top: 30%; left: 25%; width: 50%; height: 40%; border: 2px solid var(--primary); background: rgba(74, 144, 226, 0.2); transition: 0.3s; }
        
        /* 토글 및 액션 버튼 */
        .switch-row { display: flex; justify-content: space-between; align-items: center; padding: 15px 0; border-top: 1px solid #eee; }
        .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 34px; }
        .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider { background-color: var(--primary); }
        input:checked + .slider:before { transform: translateX(20px); }
        .status-msg { font-size: 11px; margin-top: 4px; display: none; }
        .red { color: var(--danger); }
        
        .btn { width: 100%; padding: 16px; border-radius: 16px; border: none; font-weight: bold; color: white; cursor: pointer; margin-bottom: 10px; font-size: 16px; }
        .btn-follow { background: var(--success); }
        .btn-come { background: var(--primary); }
        .btn-wait { background: #666; }

        .settings-btn { width: 100%; padding: 18px; background: #fff; border: 1px solid #eee; border-radius: 15px; margin-bottom: 10px; text-align: left; font-weight: 500; cursor: pointer; font-size: 14px; }
        #scan-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #111; z-index: 100; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; transition: 0.5s; }
    </style>
</head>
<body>

<div class="app-container">
    <div id="scan-overlay">
        <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">SAVIS</div>
        <div style="margin-top: 50px; display: flex; gap: 10px;">
            <button class="btn btn-wait" style="width:120px; font-size:12px;" onclick="simulateSuccess()">식별 성공</button>
            <button class="btn btn-wait" style="width:120px; font-size:12px;" onclick="simulateFail()">식별 실패</button>
        </div>
    </div>

    <div class="status-bar">
        <span>🔌 SAVIS Wired System</span>
        <div class="user-label">👤 <span id="user-name-tag">미식별</span></div>
    </div>

    <div class="nav-tabs">
        <div class="tab hidden" id="tab-btn-control" onclick="showTab('control', this)">제어</div>
        <div class="tab hidden" id="tab-btn-settings" onclick="showTab('settings', this)">설정</div>
    </div>

    <div class="content-wrapper">
        <div id="reg-face" class="content">
            <div class="card">
                <h3>1. 얼굴 등록</h3>
                <div class="ai-message-board"><div id="ai-face-main" class="ai-status-text">대기 중</div></div>
                <input type="text" id="input-name" placeholder="이름을 입력하세요" style="width:100%; padding:12px; border-radius:10px; border:1px solid #ddd; box-sizing:border-box; margin-bottom:15px;">
                <button class="btn btn-come" onclick="startFaceScan()">인식 시작</button>
            </div>
        </div>

        <div id="reg-voice" class="content">
            <div class="card">
                <h3>사용자 음성 등록</h3>
                <div class="ai-message-board" style="background: #1a1a1a;"><div id="ai-voice-main" class="ai-status-text">음성 대기 중</div></div>
                <button class="btn btn-come" onclick="startVoiceScan()">음성 등록 시작</button>
                <button class="btn" style="background:none; color:#888; font-size:13px;" id="btn-skip-voice" onclick="skipVoice()">건너뛰기</button>
            </div>
        </div>

        <div id="range-setup" class="content">
            <div class="card">
                <h3>3D 가동 범위 설정</h3>
                <div class="photo-space"><div id="range-cuboid" class="cuboid-view"></div></div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px;">
                    <div style="background:#f8f9fa; padding:10px; border-radius:12px; text-align:center;">
                        <span style="font-size:10px; display:block; margin-bottom:5px;">가로 폭</span>
                        <button onclick="adjustCuboid('w', 5)">+</button><button onclick="adjustCuboid('w', -5)">-</button>
                    </div>
                    <div style="background:#f8f9fa; padding:10px; border-radius:12px; text-align:center;">
                        <span style="font-size:10px; display:block; margin-bottom:5px;">깊이(Z)</span>
                        <button onclick="adjustCuboid('z', 5)">+</button><button onclick="adjustCuboid('z', -5)">-</button>
                    </div>
                </div>
                <button class="btn btn-come" style="margin-top:15px;" onclick="finishRangeSetup(true)">설정 완료</button>
                <button class="btn" style="background:none; color:var(--danger); font-size:13px;" onclick="finishRangeSetup(false)">건너뛰기 (장애물 충돌 위험)</button>
            </div>
        </div>

        <div id="control" class="content">
            <h2 class="control-title">사용자님 맞춤 제어</h2>
            <div id="range-warning" class="warning-banner">⚠️ 장애물 충돌 위험: 가동 범위 미설정</div>
            <div class="card">
                <div class="control-grid">
                    <div class="d-pad">
                        <div></div><div class="pad-btn">▲</div><div></div>
                        <div class="pad-btn">◀</div><div class="pad-btn" style="font-size:10px;">초기화</div><div class="pad-btn">▶</div>
                        <div></div><div class="pad-btn">▼</div><div></div>
                    </div>
                    <div class="z-control">
                        <button class="z-btn">가까이</button>
                        <button class="z-btn">멀리</button>
                        <div class="angle-grid">
                            <button class="z-btn angle">각도▲</button>
                            <button class="z-btn angle">각도▼</button>
                            <button class="z-btn angle">각도◀</button>
                            <button class="z-btn angle">각도▶</button>
                        </div>
                    </div>
                </div>
                <div class="switch-row">
                    <span>원격 제어 모드</span>
                    <label class="switch">
                        <input type="checkbox" id="remote-toggle">
                        <span class="slider"></span>
                    </label>
                </div>
                <p id="remote-msg" class="status-msg red">음성 등록이 필요합니다.</p>
            </div>
            <button class="btn btn-follow">따라와</button>
            <button class="btn btn-come">이리와</button>
            <button class="btn btn-wait">대기해</button>
        </div>

        <div id="settings" class="content">
            <button class="settings-btn" onclick="openIndependentPage('voice')">🎤 사용자 음성 재등록</button>
            <button class="settings-btn" onclick="openIndependentPage('range')">📐 3D 가동 범위 재설정</button>
            <button class="settings-btn" style="color:var(--danger)" onclick="location.reload()">로그아웃</button>
        </div>
    </div>
</div>

<script>
    let isVoiceRegistered = false;
    let isRangeSet = false;
    let isInitialSetup = true; // 초기 등록 시퀀스 여부
    let cw = 50, cz = 0;

    function showTab(tabId, el) {
        document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        if(el) el.classList.add('active');
    }

    // 설정탭 등에서 개별적으로 페이지 열기
    function openIndependentPage(type) {
        isInitialSetup = false;
        document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
        if(type === 'voice') document.getElementById('reg-voice').classList.add('active');
        if(type === 'range') document.getElementById('range-setup').classList.add('active');
    }

    function setAppState(state, name = "사용자") {
        document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
        if(state === 'face_reg') document.getElementById('reg-face').classList.add('active');
        else if(state === 'voice_reg') document.getElementById('reg-voice').classList.add('active');
        else if(state === 'range_setup') document.getElementById('range-setup').classList.add('active');
        else if(state === 'identified') {
            document.getElementById('user-name-tag').innerText = name;
            document.getElementById('tab-btn-control').classList.remove('hidden');
            document.getElementById('tab-btn-settings').classList.remove('hidden');
            
            // 상태 반영
            updateControlStatus();
            showTab('control', document.getElementById('tab-btn-control'));
        }
    }

    function updateControlStatus() {
        const toggle = document.getElementById('remote-toggle');
        const msg = document.getElementById('remote-msg');
        const warning = document.getElementById('range-warning');
        
        toggle.disabled = !isVoiceRegistered;
        msg.style.display = isVoiceRegistered ? 'none' : 'block';
        warning.style.display = isRangeSet ? 'none' : 'block';
    }

    function adjustCuboid(axis, val) {
        const box = document.getElementById('range-cuboid');
        if(axis === 'w') cw = Math.min(Math.max(cw + val, 10), 90); 
        else cz = Math.min(Math.max(cz + val, 0), 40);
        box.style.width = cw + '%';
        box.style.boxShadow = `0px 0px ${cz}px rgba(74,144,226,0.6)`;
    }

    function startFaceScan() {
        const main = document.getElementById('ai-face-main');
        main.innerText = "얼굴 인식 중..";
        setTimeout(() => {
            main.innerText = "인식 완료!";
            setTimeout(() => setAppState('voice_reg'), 800);
        }, 1000);
    }

    function startVoiceScan() {
        const main = document.getElementById('ai-voice-main');
        main.innerText = "음성 분석 중...";
        setTimeout(() => {
            main.innerText = "음성 등록 완료!";
            isVoiceRegistered = true;
            if(isInitialSetup) setTimeout(() => setAppState('range_setup'), 800);
            else setTimeout(() => setAppState('identified'), 800);
        }, 1200);
    }

    function skipVoice() {
        isVoiceRegistered = false;
        if(isInitialSetup) setAppState('range_setup');
        else setAppState('identified');
    }

    function finishRangeSetup(isSet) {
        isRangeSet = isSet;
        setAppState('identified');
    }

    function simulateSuccess() { 
        isVoiceRegistered = true; 
        isRangeSet = true;
        document.getElementById('scan-overlay').style.display='none'; 
        setAppState('identified', '대연'); 
    }
    
    function simulateFail() { 
        isInitialSetup = true;
        document.getElementById('scan-overlay').style.display='none'; 
        setAppState('face_reg'); 
    }
</script>
</body>
</html>