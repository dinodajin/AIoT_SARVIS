from adafruit_pca9685 import PCA9685
import board, busio, time, math

# 1. PCA9685 초기화
i2c = busio.I2C(board.SCL, board.SDA)
pca = PCA9685(i2c)
pca.frequency = 50

# 2. 하드웨어 치수 (제공해주신 mm 단위)
L1 = 20   # 바닥 ~ 어깨
L2 = 102  # 어깨 ~ 팔꿈치
L3 = 90   # 팔꿈치 ~ 손목
L4 = 70   # 손목 ~ 끝단 (필요 시 L3에 합쳐서 계산 가능)

# 3. 각도 -> Duty 변환 함수 (기존 코드 유지)
def angle_to_duty(angle):
    angle = max(0, min(180, angle))
    us = 500 + (angle / 180.0) * 2000
    return int(us * 65535 / 20000)

def calculate_ik(x, y, z):
    # 1. 바닥 회전 (M1)
    # y, x가 0일 때 0도, 여기에 90을 더해 기준점 설정
    theta1 = math.degrees(math.atan2(y, x))
    m1 = theta1 + 90
    
    # 2. 평면 거리 r과 수직 거리 s
    r = math.sqrt(x**2 + y**2)
    s = z - L1 # L1=20mm
    
    # 3. L4(손목~끝단)가 수평으로 뻗어있다고 가정 (r값에서 L4를 뺌)
    # 90 90 0 90 상태는 L3와 L4가 수평으로 일직선인 상태임
    r_prime = r - L4 # 160 - 70 = 90
    
    # 4. 어깨(L2)와 팔꿈치(L3) 사이의 거리 d 계산
    # (160, 0, 122) 입력 시 r_prime=90, s=102 -> d = sqrt(90^2 + 102^2)
    d = math.sqrt(r_prime**2 + s**2)
    
    if d > (L2 + L3) or d < abs(L2 - L3):
        print(f"⚠ 도달 불가능한 좌표입니다. (거리: {d:.1f})")
        return None

    # 5. 코사인 법칙으로 관절 사이의 내각 계산
    # cos_q3: L2와 L3 사이의 각도 관련
    cos_q3 = (L2**2 + L3**2 - d**2) / (2 * L2 * L3)
    q3_rad = math.acos(max(-1, min(1, cos_q3)))
    
    # cos_q2_alpha: 어깨 각도 관련
    cos_q2_alpha = (L2**2 + d**2 - L3**2) / (2 * L2 * d)
    alpha = math.acos(max(-1, min(1, cos_q2_alpha)))
    phi = math.atan2(s, r_prime)

    # 6. 각도 출력 (90도 수직 기준 보정)
    # theta2: 어깨가 지면과 이루는 각도. 90도일 때 수직.
    theta2 = math.degrees(phi + alpha) 
    m2 = theta2 # 90 90 0 90 일 때 phi=48.5, alpha=41.5 -> 합 90
    
    # theta3: L2와 L3의 상대 각도. 0도일 때 90도 꺾임.
    # 90 90 0 90 일 때 d=136.03 -> q3_rad=1.57(90도) -> m3=0
    m3 = 90 - math.degrees(q3_rad) 
    
    m4 = 90 # 손목은 기본 90도 유지
    
    return [round(m1, 2), round(m2, 2), round(m3, 2), round(m4, 2)]

# 5. 메인 루프 (직접 Input 받기)
print("--- 5축 로봇팔 좌표 제어 테스트 ---")
print(f"기준 자세: 90 90 90 90 (수직)")
print("종료하려면 Ctrl+C를 누르세요.")

try:
    while True:
        user_input = input("\n목표 x y z 입력 (예: 100 0 150): ").strip()
        if not user_input: continue
        
        try:
            x, y, z = map(float, user_input.split())
            angles = calculate_ik(x, y, z)
            
            if angles:
                print(f"▶ 계산된 각도: M1={angles[0]:.1f}, M2={angles[1]:.1f}, M3={angles[2]:.1f}, M4={angles[3]:.1f}")
                
                # PCA9685 채널 전송 (0~3번)
                for i in range(len(angles)):
                    pca.channels[i].duty_cycle = angle_to_duty(angles[i])
            
        except ValueError:
            print("❌ 숫자 세 개(x y z)를 띄어쓰기로 구분해서 입력하세요.")

except KeyboardInterrupt:
    print("\n종료합니다.")
    pca.deinit()
