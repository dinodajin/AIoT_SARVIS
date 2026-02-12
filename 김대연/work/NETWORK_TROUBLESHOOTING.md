# SoftAP 네트워크 연결 문제 해결 가이드

## 문제: "소프트 AP 인터넷 연결없음" 메시지 표시

이 문제는 Expo 앱에서 네트워크 상태를 정확하게 감지하지 못하거나 SoftAP가 설정되지 않은 경우 발생합니다.

---

## 🔍 1단계: 앱 디버그 로그 확인

### Expo 앱에서 네트워크 상태 확인

앱을 실행한 후 다음 단계를 수행하세요:

1. **SoftAP 테스트** 탭으로 이동
2. **네트워크 상태** 섹션 확인
3. **메시지 확인**:
   - `✅ SoftAP 연결됨 (IP: 10.42.0.x)` → 정상
   - `📱 WiFi 연결됨 (IP: x.x.x.x)` → 다른 WiFi에 연결됨
   - `❌ 네트워크 연결 없음` → SoftAP에 연결되지 않음
   - `⚠️ 상태 확인 실패` → 네트워크 감지 에러

### Expo 앱 개발자 메뉴에서 디버그 로그 확인

```javascript
// 앱에서 다음 로그가 출력되어야 함:
console.log('Network status:', status);
console.log('Is connected:', status.isConnected);
console.log('SSID:', status.ssid);
console.log('IP:', status.ipAddress);
```

**참고**: Expo 앱에서는 브라우저 콘솔이 아닌, 앱 내부 콘솔이나 Expo Dev Tools에서 로그를 확인해야 합니다.

---

## 📱 2단계: 휴대폰 WiFi 연결 확인

### Android

1. **설정** → **WiFi**로 이동
2. **SARVIS_WIFI** 네트워크가 목록에 있는지 확인
3. 네트워크가 보인다면:
   - 선택 후 비밀번호 `ssafya104` 입력
   - 연결 완료 후 IP 확인 (고급 옵션)
4. 네트워크가 보이지 않는다면:
   - WiFi 스캔 재시도
   - Jetson SoftAP가 실행 중인지 확인
   - Jetson에 가까이 이동

### iOS

1. **설정** → **WiFi**로 이동
2. **SARVIS_WIFI** 네트워크 선택
3. 비밀번호 `ssafya104` 입력
4. 연결 후 **i** 버튼 클릭으로 상세 정보 확인
   - IP 주소가 10.42.0.x 범위인지 확인

---

## 🔧 3단계: Jetson SoftAP 상태 확인

### Jetson에서 SoftAP 상태 확인

Jetson 터미널에서 다음 명령어 실행:

```bash
# 1. WiFi 인터페이스 확인
iwconfig

# 예상 출력:
# wlan0     IEEE 802.11  ESSID:"SARVIS_WIFI"  ...
```

만약 wlan0가 없다면:
```bash
# 인터페이스 이름 확인
ip link show

# wlan0 대신 다른 이름 확인 (예: wlp2s0, wlan1 등)
```

### hostapd 상태 확인

```bash
sudo systemctl status hostapd
```

예상 출력 (정상):
```
● hostapd.service - Hostapd IEEE 802.11 AP
   Loaded: loaded (/etc/systemd/system/hostapd.service; enabled)
   Active: active (running) since ...
```

예상 출력 (실패):
```
● hostapd.service - Hostapd IEEE 802.11 AP
   Loaded: loaded (/etc/systemd/system/hostapd.service; enabled)
   Active: failed (Result: exit-code) since ...
```

### dnsmasq 상태 확인

```bash
sudo systemctl status dnsmasq
```

예상 출력 (정상):
```
● dnsmasq.service
   Loaded: loaded (/etc/systemd/system/dnsmasq.service; enabled)
   Active: active (running) since ...
```

### Jetson IP 확인

```bash
ip addr show wlan0
```

예상 출력:
```
2: wlan0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc ...
    inet 10.42.0.1/24 brd 10.42.0.255 scope global wlan0
```

**중요**: Jetson의 IP는 `10.42.0.1`이어야 합니다.

---

## 🚨 4단계: 문제 해결

### 문제 1: "SARVIS_WIFI" 네트워크가 보이지 않음

**원인**: Jetson SoftAP가 실행되지 않은 상태

**해결 방법**:

```bash
# 1. hostapd 재시작
sudo systemctl restart hostapd

# 2. dnsmasq 재시작
sudo systemctl restart dnsmasq

# 3. IP 재설정
sudo ip addr flush dev wlan0
sudo ip addr add 10.42.0.1/24 dev wlan0

# 4. 상태 확인
sudo systemctl status hostapd
sudo systemctl status dnsmasq
ip addr show wlan0
```

### 문제 2: WiFi 연결되지만 "인터넷 연결없음" 메시지

**원인**: SoftAP는 인터넷 연결이 없는 것이 정상입니다. 인터넷 연결 없음 메시지는 SoftAP에 연결된 것을 의미하지 않습니다.

**해결 방법**:

이 메시지가 나올 때:
1. **SoftAP에 연결되었는지 확인**: IP가 `10.42.0.x` 범위인지 확인
2. **인터넷 연결 없음은 정상**: SoftAP는 로컬 네트워크이므로 외부 인터넷 연결 없음
3. **Jetson에 ping 테스트**: 앱에서 "연결 테스트" 버튼 클릭

### 문제 3: 연결 테스트 실패

**원인**: Jetson 테스트 서버가 실행되지 않은 상태

**해결 방법**:

```bash
# 1. Jetson 테스트 서버 실행
cd /mnt/c/DEV/CLINE_space/BACKEND
python3 jetson_test_server.py

# 2. 포트 확인 (5000번 포트)
sudo netstat -tlnp | grep :5000
# 또는
sudo lsof -i :5000

# 3. 방화벽 확인
sudo ufw status

# 필요하면 방화벽 포트 열기
sudo ufw allow 5000
```

### 문제 4: 앱에서 네트워크 감지 실패

**원인**: expo-network API의 제한 사항

**해결 방법**:

앱에서 다음 항목을 확인:

1. **앱 권한**: WiFi 접근 권한이 허용되었는지
2. **앱 설정**: Expo 앱에서 네트워크 관련 설정 확인
3. **앱 재시작**: 앱을 완전히 종료 후 재시작
4. **Expo Dev Tools**: 브라우저에서 개발자 도구 열고 로그 확인

---

## 🧪 5단계: 간단한 연결 테스트

### curl로 Jetson 연결 확인

```bash
# 휴대폰에서는 사용할 수 없음 (Jetson에서 실행)
# Jetson에서 Jetson 자신에 테스트
curl http://10.42.0.1:5000/

# 예상 응답:
# {"server": "Jetson SoftAP 통신 테스트 서버", ...}
```

### 휴대폰 브라우저로 Jetson 접근

휴대폰 브라우저 주소창에:
```
http://10.42.0.1:5000/
```

입력 후 Jetson 서버 정보가 표시되는지 확인.

---

## 📊 네트워크 상태 정리

| 메시지 | 의미 | 조치 |
|--------|------|------|
| ✅ SoftAP 연결됨 (IP: 10.42.0.x) | 정상 | Jetson으로 테스트 진행 |
| 📱 WiFi 연결됨 (IP: x.x.x.x) | 다른 WiFi에 연결됨 | SARVIS_WIFI로 변경 |
| 📱 WiFi 연결됨 (IP 없음) | WiFi 연결됨 but IP 할당 실패 | WiFi 재연결 |
| ❌ 네트워크 연결 없음 | WiFi 연결 안됨 | SARVIS_WIFI 연결 확인 |
| ⚠️ 상태 확인 실패 | 네트워크 감지 에러 | 앱 권한/재시작 확인 |

---

## 🔍 디버깅 체크리스트

휴대폰:
- [ ] **SARVIS_WIFI** 네트워크가 WiFi 목록에 있는지
- [ ] WiFi에 연결된 상태인지 (체크마크 표시)
- [ ] WiFi 고급 설정에서 IP 확인 (10.42.0.x 범위)
- [ ] 앱에서 네트워크 상태 메시지 확인
- [ ] 앱에서 "연결 테스트" 버튼 클릭으로 Jetson 접속 확인

Jetson:
- [ ] hostapd 서비스 실행 중 (active)
- [ ] dnsmasq 서비스 실행 중 (active)
- [ ] wlan0 인터페이스에 IP 10.42.0.1 할당됨
- [ ] jetson_test_server.py 실행 중 (port 5000)
- [ ] 방화벽에서 5000번 포트 허용됨

---

## 💡 빠른 해결 방법

### 방법 A: SoftAP 재시작

Jetson에서:
```bash
sudo systemctl restart hostapd
sudo systemctl restart dnsmasq
```

휴대폰에서:
1. WiFi 끄기
2. 3초 대기
3. WiFi 켜기
4. SARVIS_WIFI 연결

### 방법 B: 모두 재시작

Jetson에서:
```bash
# SoftAP 서비스 중지
sudo systemctl stop hostapd
sudo systemctl stop dnsmasq

# IP 초기화
sudo ip addr flush dev wlan0

# IP 재설정
sudo ip addr add 10.42.0.1/24 dev wlan0

# 서비스 시작
sudo systemctl start hostapd
sudo systemctl start dnsmasq
```

### 방법 C: Jetson 테스트 서버 재시작

```bash
# 기존 프로세스 종료 (Ctrl+C)

# 재시작
python3 BACKEND/jetson_test_server.py
```

---

## 📞 추가 지원이 필요한 경우

위 모든 방법으로 해결되지 않는다면 다음 정보를 수집하세요:

1. **Jetson 상태**:
   ```bash
   sudo systemctl status hostapd > hostapd_status.txt
   sudo systemctl status dnsmasq > dnsmasq_status.txt
   ip addr show wlan0 > ip_config.txt
   ```

2. **휴대폰 스크린샷**: WiFi 설정 화면과 앱 네트워크 상태

3. **앱 디버그 로그**: Expo Dev Tools에서 네트워크 관련 로그

---

## 🎯 정상적인 SoftAP 연결 흐름

```
1. Jetson: hostapd 실행 → SARVIS_WIFI 방출
2. Jetson: dnsmasq 실행 → DHCP 서버 시작
3. 휴대폰: SARVIS_WIFI 연결
4. Jetson: dnsmasq → IP 할당 (10.42.0.2 ~ 10.42.0.20)
5. 휴대폰: IP 획득 (예: 10.42.0.5)
6. Jetson: jetson_test_server.py 실행 (port 5000)
7. 휴대폰: 앱에서 연결 테스트 성공
8. 휴대폰: 5장 사진 전송 성공
```

---

**최종 업데이트:** 2026-01-30
**버전:** 1.0.0