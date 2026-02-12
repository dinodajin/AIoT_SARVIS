import requests
import socket
import json


BASE_URL = "http://i14a104.p.ssafy.io:8080/api"

def save_biometric(uid, vectors):
    url = f"{BASE_URL}/save-biometric/" 
    try:
        res = requests.post(url, json={"uid": uid, "face_vectors": vectors}, timeout=15)
        
        if res.status_code in [200, 201]:
            print(f"[+] Server: Registration Success! (Status: {res.status_code})")
            return res.status_code
        else:
            print(f"[!] Server Error {res.status_code}")
            print(f"[!] Detail: {res.text}")
            return res.status_code
            
    except Exception as e:
        print(f"[!] Critical Error: {e}")
        return None
        

def get_registered_faces():
    url = f"{BASE_URL}/login/get-registered-faces/"
    try:
        res = requests.get(url, timeout=10)
        if res.status_code == 200:
            data = res.json()
            return data.get('faces', []) 
        return []
    except Exception as e:
        print(f"[API Error] {e}")
        return []
        
def report_login_result(success, uid, message):
    url = f"{BASE_URL}/login/face-login-result/"
    payload = {
        "success": success,
        "uid": uid,
        "message": message
    }
    try:
        res = requests.post(url, json=payload, timeout=10)
        if res.status_code == 200:
            print(f"[+] Server: Result reported successfully.")
            return res.json()
        else:
            print(f"[!] Server: Report failed with status {res.status_code}")
            return None
    except Exception as e:
        print(f"[API Error] Failed to report result: {e}")
        return None
        

PI_IP = "70.12.245.103"
PI_PORT = 5005
client_sock = None

def init_socket():
    global client_sock
    try:
        client_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client_sock.settimeout(2) # 연결 시도 타임아웃
        client_sock.connect((PI_IP, PI_PORT))
        print(f"[+] Direct Socket Connected to Pi: {PI_IP}")
    except Exception as e:
        print(f"[!] Socket Connection Failed: {e}")
        client_sock = None

def send_to_pi_direct(yaw, pitch, guide):
    global client_sock
    if client_sock is None:
        return
    
    # 예시 (변경 필요)
    payload = {
        "yaw": round(float(yaw), 2),
        "pitch": round(float(pitch), 2),
        "guide": guide
    }
    try:
        message = json.dumps(payload).encode('utf-8')
        client_sock.sendall(message)
    except Exception as e:
        print(f"[!] Socket Send Error: {e}")
        client_sock = None # 연결 끊기면 재연결 필요