from adafruit_pca9685 import PCA9685
import board, busio, time

# I2C 초기화
i2c = busio.I2C(board.SCL, board.SDA)
pca = PCA9685(i2c)
pca.frequency = 50 

# --- [속도 및 부드러움 설정] ---
STEP_SIZE = 1.0  # 한 번에 움직일 각도 (작을수록 느리고 부드러움)
DELAY = 0.01     # 각 단계 사이의 대기 시간 (초)

# 현재 각도를 추적하기 위한 리스트 (초기값 90도 설정)
# 순서: [8ch, Dual(1ch), 4ch, 5ch, 6ch]
current_angles = [90.0, 90.0, 90.0, 90.0, 90.0]

def angle_to_duty(angle):
    """각도를 PCA9685 duty_cycle로 변환"""
    angle = max(0, min(180, angle))
    us = 500 + (angle / 180.0) * 2000
    return int(us * 65535 / 20000)

def apply_hardware_angles(angles):
    """계산된 중간 각도들을 실제 PCA9685 채널에 할당"""
    # 1번째 입력 -> 8채널
    pca.channels[8].duty_cycle = angle_to_duty(angles[0])
    
    # 2번째 입력 -> 1, 2채널 (Dual Drive, 서로 반대 방향)
    master_angle = angles[1]
    slave_angle = 180 - master_angle
    pca.channels[1].duty_cycle = angle_to_duty(master_angle)
    pca.channels[2].duty_cycle = angle_to_duty(slave_angle)
    
    # 3, 4, 5번째 입력 -> 4, 5, 6채널
    pca.channels[4].duty_cycle = angle_to_duty(angles[2])
    pca.channels[5].duty_cycle = angle_to_duty(angles[3])
    pca.channels[6].duty_cycle = angle_to_duty(angles[4])

def smooth_move(target_angles):
    """목표 각도까지 STEP_SIZE만큼 나누어서 천천히 이동"""
    global current_angles
    
    while True:
        all_done = True
        for i in range(len(target_angles)):
            diff = target_angles[i] - current_angles[i]
            
            # 차이가 STEP_SIZE보다 크면 조금씩 이동
            if abs(diff) > STEP_SIZE:
                if diff > 0:
                    current_angles[i] += STEP_SIZE
                else:
                    current_angles[i] -= STEP_SIZE
                all_done = False
            else:
                # 차이가 작으면 목표값에 도달한 것으로 간주
                current_angles[i] = target_angles[i]
        
        # 하드웨어에 업데이트된 현재 각도 반영
        apply_hardware_angles(current_angles)
        
        # 모든 관절이 도달했으면 루프 종료
        if all_done:
            break
            
        time.sleep(DELAY)

# 초기 위치로 이동 (시스템 시작 시 부드럽게 90도로 정렬)
print("시스템 초기화 중: 모든 모터를 90도로 정렬합니다.")
apply_hardware_angles(current_angles)

print("\n--- Smart Monitor Arm: Smooth Control Mode ---")
print("입력 순서: [8ch] [Dual(1&2)ch] [4ch] [5ch] [6ch]")
print("예시: 90 45 120 30 60 (종료: Ctrl+C)")

try:
    while True:
        user_input = input("\n새 목표 각도(5개) 입력: ").strip()
        if not user_input: continue
        
        try:
            target_list = list(map(float, user_input.split()))
            
            if len(target_list) < 5:
                print(f"❌ 오류: 5개의 각도가 필요합니다. (현재 {len(target_list)}개)")
                continue

            print("이동 중...", end='\r')
            smooth_move(target_list)
            print(f"✅ 이동 완료: {target_list}")

        except ValueError:
            print("❌ 숫자만 입력해주세요.")

except KeyboardInterrupt:
    print("\n[안내] 프로그램을 종료합니다.")
    pca.deinit()