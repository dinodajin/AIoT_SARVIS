import time
import math
import board
import busio
from adafruit_pca9685 import PCA9685

# ==========================================
# 1. 하드웨어 설정 (매핑: 5, 6&7, 8, 9, 10)
# ==========================================
i2c = busio.I2C(board.SCL, board.SDA)
pca = PCA9685(i2c)
pca.frequency = 50

# 로봇 링크 길이 (mm)
L1 = 80.0    # 바닥 ~ 어깨
L2 = 110.0   # 어깨 ~ 팔꿈치
L3 = 90.0    # 팔꿈치 ~ 손목
L_HAND = 95.0 # 손목 ~ 끝점

# ==========================================
# 2. 유틸리티 함수
# ==========================================
def angle_to_duty(angle):
    """ 각도를 PWM 듀티 사이클로 변환 """
    angle = max(0, min(180, angle))
    us = 500 + (angle / 180.0) * 2000
    return int(us * 65535 / 20000)

def set_robot_pose(j1, j2, j3, j4, j5=90):
    """ 
    j1: 베이스, j2: 어깨, j3: 팔꿈치, j4: 손목, j5: 집게 
    """
    pca.channels[5].duty_cycle = angle_to_duty(j1)
    
    # Shoulder (Dual Motor: 6번 정방향, 7번 역방향)
    pca.channels[6].duty_cycle = angle_to_duty(j2)
    pca.channels[7].duty_cycle = angle_to_duty(180 - j2)
    
    pca.channels[8].duty_cycle = angle_to_duty(j3)
    pca.channels[9].duty_cycle = angle_to_duty(j4)
    pca.channels[10].duty_cycle = angle_to_duty(j5)

# ==========================================
# 3. 역기구학 (IK)
# ==========================================
def solve_ik(x, y, z):
    """
    (x, y, z) 좌표를 입력받아 모터 각도 반환
    반환값: [j1, j2, j3, j4] 또는 None (도달 불가 시)
    """
    # 1. J1 (베이스 회전)
    theta1_rad = math.atan2(y, x)
    j1_angle = 90 - math.degrees(theta1_rad)

    # 2. J2, J3 (삼각 측량)
    # 손목 관절(Wrist)의 위치 계산 (손이 수평으로 접근한다고 가정)
    r_total = math.sqrt(x**2 + y**2)
    r_wrist = r_total - L_HAND
    z_wrist = z - L1 

    # 어깨에서 손목까지의 직선 거리 (ac)
    ac = math.sqrt(r_wrist**2 + z_wrist**2)
    
    # 물리적 도달 가능 범위 체크
    if ac > (L2 + L3): 
        return None

    try:
        # 코사인 제 2법칙
        alpha = math.acos((L2**2 + ac**2 - L3**2) / (2 * L2 * ac))
        beta = math.acos((L2**2 + L3**2 - ac**2) / (2 * L2 * L3))
    except ValueError: 
        return None 

    elevation = math.atan2(z_wrist, r_wrist)
    
    theta2_ik = math.degrees(elevation + alpha)
    theta3_ik = math.degrees(beta)

    # 3. 각도 변환 (하드웨어 오프셋 적용)
    j1_final = j1_angle
    j2_final = theta2_ik          # 90도가 수직
    j3_final = theta3_ik - 90     # 1자(180)일 때 모터값 90 (초기값 보정)
    
    # 4. J4 (항상 지면과 수평 유지)
    # 어깨 각도 + 팔꿈치 각도 - 90도를 하면 항상 수평이 됨
    j4_final = 180 - (theta2_ik + theta3_ik) 
    
    # 만약 위 계산값으로 정면을 안 본다면 
    # j4_final = 270 - (theta2_ik + theta3_ik) 등으로 오프셋을 조정해야 합니다.

    return [j1_final, j2_final, j3_final, j4_final]

# ==========================================
# 4. 실행 로직 (최대 크기 사각형)
# ==========================================
# ==========================================
# 4. 실행 로직 (수정판: X=120 안전 거리 확보)
# ==========================================
def draw_max_rectangle():
    # ---------------- [수정된 설정값] ----------------
    draw_x = 120.0     # 몸에서 12cm 떨어뜨림 (안전 확보)
    
    # 높이 설정 (거리가 멀어진 만큼 높이 한계는 약간 줄어듦)
    top_z = 230.0      # 코너(대각선)에서도 닿을 수 있는 안전 최대 높이
    bottom_z = 80.0    # 바닥 충돌 방지
    
    # 좌우 폭 설정
    width_half = 120.0 # 좌우로 12cm씩 (총 24cm 폭)
    # -----------------------------------------------

    # 이동 경로 (상단중앙 -> 우상 -> 우하 -> 좌하 -> 좌상 -> 우상)
    points = [
        (draw_x, 0, top_z),              # P0: 시작
        (draw_x, width_half, top_z),     # P1: 우상단
        (draw_x, width_half, bottom_z),  # P2: 우하단
        (draw_x, -width_half, bottom_z), # P3: 좌하단
        (draw_x, -width_half, top_z),    # P4: 좌상단
        (draw_x, width_half, top_z)      # P1: 닫기
    ]

    print(f">>> [Ver 7.0] X={draw_x}mm (안전 모드)")
    print(f">>> 크기: 폭 {width_half*2}mm x 높이 {top_z - bottom_z}mm")
    print(f">>> 대각선 최대 거리 체크 중...")
    time.sleep(2)

    # 시작점으로 이동
    start_angles = solve_ik(*points[0])
    if start_angles:
        print(f">>> 시작 위치로 이동합니다.")
        set_robot_pose(*start_angles)
        time.sleep(2.5)
    else:
        print("!!! 오류: 설정한 범위가 로봇 팔 길이를 초과합니다.")
        return

    # 그리기 루프
    step_size = 3.0
    
    for i in range(len(points) - 1):
        p_start = points[i]
        p_end = points[i+1]
        
        dist = math.sqrt((p_end[1]-p_start[1])**2 + (p_end[2]-p_start[2])**2)
        steps = int(dist / step_size)
        if steps == 0: steps = 1
        
        print(f"Drawing: 구간 {i+1}/{len(points)-1}")
        
        for s in range(steps + 1):
            t = s / steps
            curr_y = p_start[1] + (p_end[1] - p_start[1]) * t
            curr_z = p_start[2] + (p_end[2] - p_start[2]) * t
            
            angles = solve_ik(draw_x, curr_y, curr_z)
            
            if angles:
                # 안전장치
                if any(a < 0 or a > 180 for a in angles): continue
                set_robot_pose(*angles)
                
                # 아래쪽일수록 천천히 (모터 부하 고려)
                delay = 0.02 if curr_z > 150 else 0.035
                time.sleep(delay)

    print(">>> 완료. 대기 자세 복귀")
    time.sleep(1)
    set_robot_pose(90, 90, 0, 90, 90)

if __name__ == "__main__":
    try:
        draw_max_rectangle()
    except KeyboardInterrupt:
        print("\n>>> 강제 종료: 모터 힘을 풉니다.")
        for i in range(5, 12): 
            pca.channels[i].duty_cycle = 0