from adafruit_pca9685 import PCA9685
import board, busio, time

# I2C 초기화
i2c = busio.I2C(board.SCL, board.SDA)
pca = PCA9685(i2c)
pca.frequency = 50  # 서보용 50Hz

# 마이크로초(us) → duty 변환
def duty_us(us):
    return int(us * 65535 / 20000)

# 각도(0~180) → duty
def angle_to_duty(angle):
    angle = max(0, min(180, angle))  # 범위 제한
    us = 500 + (angle / 180.0) * 2000  # 500~2500us
    return duty_us(us)

# 제어할 채널
channels = [0, 4, 8]

print("입력 형식: 각도 3개 (예: 30 90 150)")
print("종료하려면 Ctrl+C")

while True:
    try:
        user_input = input("각도 입력: ").strip()
        angles = list(map(int, user_input.split()))

        if len(angles) != 3:
            print("❌ 각도 3개를 입력하세요.")
            continue

        for ch, angle in zip(channels, angles):
            pca.channels[ch].duty_cycle = angle_to_duty(angle)

    except ValueError:
        print("❌ 숫자만 입력하세요.")
    except KeyboardInterrupt:
        print("\n종료합니다.")
        pca.deinit()
        break
