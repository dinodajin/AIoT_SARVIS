# Jetson SoftAP 설정 가이드

휴대폰에서 `SARVIS_WIFI` 네트워크가 보이지 않거나 연결이 계속 실패하는 경우, Jetson에서 SoftAP를 설정해야 합니다.

## SoftAP 설정 방법

### 1단계: 네트워크 인터페이스 확인

Jetson에서 실행:
```bash
# WiFi 인터페이스 확인
ip link show

# 또는
ifconfig
```

일반적으로 `wlan0` 또는 `wlp2s0`입니다. 아래 명령에서 `wlan0`를 실제 인터페이스 이름으로 변경하세요.

### 2단계: 호스트팟 설정

```bash
# 네트워크 관리자 설치 (없는 경우)
sudo apt-get install network-manager

# 호스트팟 모드 활성화
sudo nmcli dev set wlan0 managed no
```

### 3단계: hostapd 설치

```bash
sudo apt-get update
sudo apt-get install hostapd
```

### 4단계: hostapd 설정 파일 생성

```bash
sudo nano /etc/hostapd/hostapd.conf
```

다음 내용을 붙여넣습니다:

```ini
interface=wlan0
driver=nl80211
ssid=SARVIS_WIFI
hw_mode=g
channel=6
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=ssafya104
wpa_key_mgmt=WPA-PSK
wpa_pairwise=CCMP
rsn_pairwise=CCMP
```

저장 후 나가기: `Ctrl+X`, `Y`, `Enter`

### 5단계: hostapd 서비스 시작

```bash
# hostapd 서비스 중지 (이전에 실행 중인 경우)
sudo systemctl stop hostapd

# hostapd 서비스 시작
sudo systemctl start hostapd

# 상태 확인
sudo systemctl status hostapd
```

### 6단계: DHCP 서버 설정

```bash
# dnsmasq 설치
sudo apt-get install dnsmasq

# dnsmasq 설정 파일 생성
sudo nano /etc/dnsmasq.conf
```

다음 내용을 붙여넣습니다:

```conf
interface=wlan0
dhcp-range=10.42.0.2,10.42.0.20,12h
dhcp-option=3,10.42.0.1
dhcp-option=6,10.42.0.1
server=8.8.8.8
```

저장 후 나가기: `Ctrl+X`, `Y`, `Enter`

### 7단계: IP 주소 설정

```bash
# wlan0 인터페이스에 정적 IP 할당
sudo ip addr add 10.42.0.1/24 dev wlan0

# 이미 IP가 설정되어 있다면:
sudo ip addr flush dev wlan0
sudo ip addr add 10.42.0.1/24 dev wlan0
```

### 8단계: dnsmasq 서비스 시작

```bash
# dnsmasq 서비스 시작
sudo systemctl start dnsmasq

# 상태 확인
sudo systemctl status dnsmasq
```

### 9단계: 인터넷 공유 설정 (선택사항)

Jetson이 인터넷에 연결되어 있다면, 인터넷을 공유할 수 있습니다:

```bash
# eth0가 유선 인터넷 연결인 경우
sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
sudo iptables -A FORWARD -i eth0 -o wlan0 -m state --state RELATED,ESTABLISHED -j ACCEPT
sudo iptables -A FORWARD -i wlan0 -o eth0 -j ACCEPT

# IP 포워딩 활성화
sudo sysctl net.ipv4.ip_forward=1
```

### 10단계: 확인

Jetson에서 다음 명령어로 설정 확인:

```bash
# SoftAP 확인
sudo iw dev wlan0 interface add wlan0.ap type __ap
sudo ip link set wlan0.ap up

# IP 확인
ip addr show wlan0

# hostapd 상태
sudo systemctl status hostapd

# dnsmasq 상태
sudo systemctl status dnsmasq
```

## 휴대폰에서 연결 확인

### Android:
1. 설정 → WiFi
2. `SARVIS_WIFI` 네트워크가 보이는지 확인
3. 선택 후 비밀번호 `ssafya104` 입력
4. 고급 옵션에서 IP 수동 설정:
   - IP: `10.42.0.5`
   - Gateway: `10.42.0.1`

### iOS:
1. 설정 → WiFi
2. `SARVIS_WIFI` 네트워크 선택
3. 비밀번호 `ssafya104` 입력
4. 네트워크 정보에서 수동 IP 설정:
   - IP: `10.42.0.5`
   - Router: `10.42.0.1`

## 트러블슈팅

### 네트워크가 보이지 않는 경우

1. Jetson에서 hostapd 상태 확인:
```bash
sudo systemctl status hostapd
```

2. WiFi 인터페이스 확인:
```bash
iwconfig
```

3. 드라이버 확인:
```bash
sudo lshw -C network
```

### 연결 실패하는 경우

1. 비밀번호 확인: `ssafya104`
2. Jetson에서 로그 확인:
```bash
sudo journalctl -u hostapd -f
```

3. dnsmasq 상태 확인:
```bash
sudo systemctl status dnsmasq
```

4. IP 충돌 확인:
```bash
sudo lsof -i :67
```

## 영구 설정 (재부팅 후 자동 시작)

systemd 서비스로 등록:

```bash
# hostapd 서비스 활성화
sudo systemctl enable hostapd

# dnsmasq 서비스 활성화
sudo systemctl enable dnsmasq

# IP 설정 자동화 (netplan 사용 시)
sudo nano /etc/netplan/01-network-manager-all.yaml
```

다음 내용 추가:

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    wlan0:
      addresses: [10.42.0.1/24]
```

## 시작 스크립트 (빠른 설정)

모든 설정을 한 번에 실행하는 스크립트:

```bash
#!/bin/bash

# 인터페이스 설정
sudo nmcli dev set wlan0 managed no

# IP 설정
sudo ip addr flush dev wlan0
sudo ip addr add 10.42.0.1/24 dev wlan0

# 서비스 시작
sudo systemctl restart hostapd
sudo systemctl restart dnsmasq

# 상태 확인
sudo systemctl status hostapd
sudo systemctl status dnsmasq

echo "SoftAP 설정 완료!"
echo "SSID: SARVIS_WIFI"
echo "Password: ssafya104"
echo "Jetson IP: 10.42.0.1"
```

저장 후 실행 권한 부여:
```bash
chmod +x setup_softap.sh
sudo ./setup_softap.sh
```

## 확인 완료 후

Jetson에서 server_test.py 실행:
```bash
python3 server_test.py
```

휴대폰에서 앱 실행 후 테스트 시작!