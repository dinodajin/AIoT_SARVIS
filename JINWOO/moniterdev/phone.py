import uiautomator2 as u2
import time

d = u2.connect()

AFTER_INTERVAL = 0.015
QUIT_DURATION = 0.2


# ====== 모드별(세로/가로) 비율 프로파일 ======
PROFILE = {
    "portrait": {
        "PAUSE": (0.50, 0.20),
        "AFTER": (0.80, 0.20),
        "BEFORE": (0.20, 0.20),
        "QUIT_START": (300 / 1080, 300 / 2036),
        "QUIT_D": (0.0, 1750 / 2036),
    },
    "landscape": {
        # TODO: 가로에서 실제 눌러야 하는 위치로 조정하세요.
        "PAUSE": (0.50, 0.50),
        "AFTER": (0.80, 0.20),
        "BEFORE": (0.20, 0.20),
        "QUIT_START": (0.20, 0.20),
        "QUIT_D": (0.0, 0.80),
    },
}


def get_mode():
    w, h = d.window_size()
    return "landscape" if w > h else "portrait"


def ratio_to_xy(xr, yr):
    w, h = d.window_size()
    return int(w * xr), int(h * yr)


def ratio_swipe(xr, yr, dxr, dyr, duration=0.2):
    w, h = d.window_size()
    x1 = int(w * xr)
    y1 = int(h * yr)
    x2 = int(w * (xr + dxr))
    y2 = int(h * (yr + dyr))
    d.swipe(x1, y1, x2, y2, duration=duration)
    return x1, y1, x2, y2


def get_pos(key):
    mode = get_mode()
    xr, yr = PROFILE[mode][key]
    return ratio_to_xy(xr, yr)


def do_quit_swipe():
    mode = get_mode()
    sxr, syr = PROFILE[mode]["QUIT_START"]
    dxr, dyr = PROFILE[mode]["QUIT_D"]
    return ratio_swipe(sxr, syr, dxr, dyr, duration=QUIT_DURATION)

def ratio_swipe_abs(x1r, y1r, x2r, y2r, duration=0.2):
    w, h = d.window_size()
    x1, y1 = int(w * x1r), int(h * y1r)
    x2, y2 = int(w * x2r), int(h * y2r)
    d.swipe(x1, y1, x2, y2, duration=duration)
    return x1, y1, x2, y2

def handle_command(command):
    # 1) 빠른 name 검색
    if command.startswith("name "):
        search_keyword = command.replace("name ", "", 1).strip()
        if not search_keyword:
            print("name 뒤에 검색어를 넣어주세요.")
            return True

        print(f"'{search_keyword}' 검색 중...")
        target = d(clickable=True, descriptionContains=search_keyword)

        if target.exists:
            target[0].click()
            print("재생 성공")
        else:
            print("영상을 찾을 수 없습니다.")

    # 2) 일시정지 / 재생
    elif command in ["pause", "stop"]:
        x, y = get_pos("PAUSE")
        d.double_click(x, y, 1)
        print(f"[{get_mode()}] 일시정지 탭: ({x}, {y})")
 
    elif command in ["resume", "play"]:
        x, y = get_pos("PAUSE")
        d.click(x, y)
        print(f"[{get_mode()}] 재생 탭: ({x}, {y})")


    # 3) 10초 이동
    elif command == "after":
        x, y = get_pos("AFTER")
        d.double_click(x, y, AFTER_INTERVAL)
        print(f"[{get_mode()}] after 더블탭: ({x}, {y})")

    elif command == "before":
        x, y = get_pos("BEFORE")
        d.double_click(x, y, AFTER_INTERVAL)
        print(f"[{get_mode()}] before 더블탭: ({x}, {y})")

    elif command == "youtube":
        d.app_start("com.google.android.youtube")
        print("유튜브 실행")

    elif command == "scroll":
        d.swipe_ext("up", scale=1)
        print("스크롤 업")

    # 4) quit: 모드별 비율 스와이프 후 종료
    elif command == "mini":
        x1, y1, x2, y2 = do_quit_swipe()
        print(f"[{get_mode()}] quit 스와이프: ({x1},{y1}) -> ({x2},{y2})")
        
    # 5) 스와이프 
    elif command == "right":
        x1, y1, x2, y2 = ratio_swipe_abs(0.8, 0.5, 0.2, 0.5, duration=0.08)
        print(f"[{get_mode()}] right 스와이프: ({x1},{y1}) -> ({x2},{y2})")

    elif command == "left":
        x1, y1, x2, y2 = ratio_swipe_abs(0.2, 0.5, 0.8, 0.5, duration=0.08)
        print(f"[{get_mode()}] left 스와이프: ({x1},{y1}) -> ({x2},{y2})")

    elif command == "exit":
        return False

    else:
        print("알 수 없는 명령입니다.")

    return True


def main():
    print("\n[ 유튜브 홈 화면 제어 시스템 ]")
    print("명령어: youtube, name [제목], after, before, left, right, scroll, pause, quit, exit")

    running = True
    while running:
        user_input = input("\n명령 입력 >> ").strip().lower()
        if not user_input:
            continue
        running = handle_command(user_input)


if __name__ == "__main__":
    main()

