"""
로봇팔 제어 기능
REST API 방식으로 로봇팔 제어 명령을 처리하고 명령 로그를 저장합니다.
"""
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.db import transaction
import requests
import logging
import traceback
from django.utils import timezone

from .models import UserDeviceConnection, Session, CommandLog, Preset
from .decorators import jwt_required

logger = logging.getLogger(__name__)

JETSON_BASE_URL = "https://unforetold-jannet-hydropically.ngrok-free.dev"
BUTTON_COMMAND_ENDPOINT = "/button_command"

# 기본 초기 상태
DEFAULT_ROBOT_STATE = {
    "servo1": 90,
    "servo2": 120,
    "servo3": 0,
    "servo4": 45,
    "servo5": 90,
    "servo6": 100
}


# ===== Serializers =====

class ButtonCommandSerializer(serializers.Serializer):
    """버튼 커맨드 전송
    
    명령:
    - RIGHT: X 좌우위치 (+ 오른쪽)
    - LEFT: X 좌우위치 (- 왼쪽)
    - UP: Y 상하위치 (+ 위쪽)
    - DOWN: Y 상하위치 (- 아래쪽)
    - FAR: Z 거리 (+ 멀리)
    - NEAR: Z 거리 (- 가까이)
    - YAW_RIGHT: YAW 좌우각도 (+ 오른쪽 각도)
    - YAW_LEFT: YAW 좌우각도 (- 왼쪽 각도)
    - PITCH_UP: PITCH 상하각도 (+ 위쪽 각도)
    - PITCH_DOWN: PITCH 상하각도 (- 아래쪽 각도)
    """
    session_id = serializers.IntegerField(help_text="세션 ID")
    command = serializers.CharField(
        max_length=20,
        help_text="버튼 명령 (UP, DOWN, LEFT, RIGHT, FAR, NEAR, YAW_RIGHT, YAW_LEFT, PITCH_UP, PITCH_DOWN)"
    )


# ===== Helper Functions =====
def send_button_command_to_jetson(command):
    """젯슨으로 버튼 커맨드 전송
    
    Args:
        command: 버튼 명령 (UP, DOWN, LEFT, RIGHT, FAR, NEAR, YAW_RIGHT, YAW_LEFT, PITCH_UP, PITCH_DOWN)
    
    Returns:
        tuple: (성공 여부, 상태코드, 에러 메시지)
    """
    try:
        jetson_url = f"{JETSON_BASE_URL}/button_command"
        
        # 젯슨으로 보낼 JSON 형식: {command}
        jetson_data = {
            'command': command
        }
        
        headers = {
            "ngrok-skip-browser-warning": "69420",
            "Content-Type": "application/json"  
        }
                
        jetson_response = requests.post(jetson_url, json=jetson_data, headers=headers, timeout=10)
        
        if jetson_response.status_code == 200:
            logger.info(f"버튼 커맨드 전송 성공: {command}")
            return True, 200, None
        else:
            logger.warning(f"버튼 커맨드 전송 실패 (HTTP {jetson_response.status_code}): {command}")
            return False, jetson_response.status_code, f"젯슨 통신 실패 (HTTP {jetson_response.status_code})"
            
    except requests.exceptions.RequestException as e:
        logger.error(f"젯슨 통신 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return False, 503, f"젯슨 연결 실패: {str(e)}"
    except Exception as e:
        logger.error(f"버튼 커맨드 전송 중 알 수 없는 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return False, 500, f"알 수 없는 오류: {str(e)}"


# ===== Views =====
@api_view(['POST'])
@jwt_required
@transaction.atomic
def button_command(request):
    """
    버튼 커맨드 전송 (로봇팔 수동 제어)
    
    앱 → 서버: 버튼 명령 (UP, DOWN, LEFT, RIGHT, FAR, NEAR, YAW_RIGHT, YAW_LEFT, PITCH_UP, PITCH_DOWN)
    서버: 오프셋값 로그 저장 + 젯슨으로 전송
    젯슨: 버튼 커맨드 처리
    
    요청 예시:
    {
        "session_id": 123,
        "command": "RIGHT"
    }
    
    응답 예시:
    {
        "success": true,
        "message": "오른쪽 버튼 명령이 전송되었습니다.",
        "command": "RIGHT",
        "command_log_id": 125
    }
    """
    serializer = ButtonCommandSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)

    session_id = serializer.validated_data['session_id']
    command = serializer.validated_data['command']

    try:
        # 세션 정보 조회
        session = Session.objects.get(session_id=session_id)
        
        # 사용자 확인 (session.connection.user)
        if session.connection.user != request.user:
            return Response({
                'success': False,
                'message': '권한이 없는 세션입니다.'
            }, status=status.HTTP_403_FORBIDDEN)
            
    except Session.DoesNotExist:
        return Response({
            'success': False,
            'message': '세션 정보를 찾을 수 없습니다.'
        }, status=status.HTTP_404_NOT_FOUND)

    # 활성 세션 확인
    if session.ended_at is not None:
        return Response({
            'success': False,
            'message': '활성 세션이 아닙니다. 제어 화면을 먼저 진입해주세요.'
        }, status=status.HTTP_400_BAD_REQUEST)

    # 유효한 명령인지 확인
    valid_commands = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'FAR', 'NEAR', 'YAW_RIGHT', 'YAW_LEFT', 'PITCH_UP', 'PITCH_DOWN']
    if command not in valid_commands:
        return Response({
            'success': False,
            'message': f'유효하지 않은 명령입니다. 가능한 명령: {", ".join(valid_commands)}'
        }, status=status.HTTP_400_BAD_REQUEST)

    # 젯슨으로 버튼 커맨드 전송
    jetson_success, jetson_status_code, jetson_error = send_button_command_to_jetson(command)

    # 오프셋값 로그 생성 (명령 로그 저장)
    log = CommandLog.objects.create(
        session=session,
        command_type='BUTTON_COMMAND',
        command_content=command,
        is_success=jetson_success,
        error_message=jetson_error if not jetson_success else None
    )

    if not jetson_success:
        return Response({
            'success': False,
            'message': '버튼 커맨드 전송 실패',
            'jetson_error': jetson_error,
            'command': command,
            'command_log_id': log.command_log_id
        }, status=jetson_status_code)

    logger.info(f"버튼 커맨드 전송 성공: {command}, 로그 ID: {log.command_log_id}")

    return Response({
        'success': True,
        'message': f'{command} 버튼 명령이 전송되었습니다.',
        'command': command,
        'command_log_id': log.command_log_id
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@jwt_required
@transaction.atomic
def save_preset(request):
    """
    앱에서 로봇팔 위치를 프리셋으로 저장
    
    앱 → 서버: 프리셋 저장 요청
    서버 → 젯슨: 현재 로봇팔 위치 요청
    젯슨 → 서버: 현재 servo 값들 반환
    서버: 프리셋 DB 저장
    
    요청 예시:
    {
        "preset_name": "프리셋 1"  (선택사항)
    }
    
    응답 예시:
    {
        "success": true,
        "message": "프리셋이 저장되었습니다.",
        "preset_id": 10,
        "preset_name": "프리셋 1"
    }
    """
    preset_name = request.data.get('preset_name')
    user = request.user

    try:
        # 젯슨으로 현재 로봇팔 위치 요청
        jetson_url = f"{JETSON_BASE_URL}/offsets_save"
        headers = {
            "ngrok-skip-browser-warning": "69420",
            "Content-Type": "application/json"
        }

        jetson_response = requests.post(jetson_url, headers=headers, timeout=10)

        if jetson_response.status_code != 200:
            logger.warning(f"젯슨에서 위치값 가져오기 실패 (HTTP {jetson_response.status_code})")
            return Response({
                'success': False,
                'message': '로봇에서 위치값을 가져오지 못했습니다.'
            }, status=status.HTTP_502_BAD_GATEWAY)

        # 젯슨에서 받은 로봇팔 위치값
        jetson_data = jetson_response.json()
        logger.info(f"젯슨 응답 받음: {jetson_data}")

        # JSON 파싱 결과가 None인지 확인
        if jetson_data is None:
            logger.error("젯슨에서 받은 JSON 데이터가 None입니다.")
            return Response({
                'success': False,
                'message': '로봇에서 유효한 응답을 받지 못했습니다.'
            }, status=status.HTTP_502_BAD_GATEWAY)

        # success 필드 확인
        if not jetson_data.get('success'):
            return Response({
                'success': False,
                'message': jetson_data.get('message', '로봇에서 위치값을 가져오지 못했습니다.')
            }, status=status.HTTP_400_BAD_REQUEST)

        # offsets가 None인 경우 처리 (라즈베리 파이 통신 실패 등)
        servo_values = jetson_data.get('offsets')
        if servo_values is None:
            logger.error("젯슨에서 받은 offsets가 None입니다. 라즈베리 파이 통신을 확인하세요.")
            return Response({
                'success': False,
                'message': '로봇팔 위치값을 가져올 수 없습니다. 라즈베리 파이 연결을 확인해주세요.'
            }, status=status.HTTP_502_BAD_GATEWAY)

        servo1 = servo_values.get('servo1')
        servo2 = servo_values.get('servo2')
        servo3 = servo_values.get('servo3')
        servo4 = servo_values.get('servo4')
        servo5 = servo_values.get('servo5')
        servo6 = servo_values.get('servo6')

        # 필수 값 확인
        if None in [servo1, servo2, servo3, servo4, servo5, servo6]:
            return Response({
                'success': False,
                'message': '로봇팔 위치값이 불완전합니다.'
            }, status=status.HTTP_400_BAD_REQUEST)

        # 기존 활성 프리셋 비활성화
        Preset.objects.filter(user=user, is_active=True).update(is_active=False)

        # 프리셋 저장 (활성 상태로)
        preset_name_final = preset_name if preset_name else f"프리셋 {timezone.now().strftime('%H:%M')}"
        preset = Preset.objects.create(
            user=user,
            preset_name=preset_name_final,
            servo1=servo1,
            servo2=servo2,
            servo3=servo3,
            servo4=servo4,
            servo5=servo5,
            servo6=servo6,
            is_active=True
        )
        logger.info(f"앱 프리셋 저장 성공: {preset.preset_id}, 사용자: {user.login_id}, 활성화됨")

        return Response({
            'success': True,
            'message': '프리셋이 저장되었습니다.',
            'preset_id': preset.preset_id,
            'preset_name': preset.preset_name,
            'created_at': preset.created_at
        }, status=status.HTTP_200_OK)

    except requests.exceptions.RequestException as e:
        logger.error(f"젯슨 통신 오류: {str(e)}")
        return Response({
            'success': False,
            'message': '로봇 연결 실패'
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)



