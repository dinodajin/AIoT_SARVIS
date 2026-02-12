# accounts/serializers.py
from rest_framework import serializers
from .models import User, Preset, UserDeviceConnection, Session, CommandLog, BiometricLog
import re


class PresetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Preset
        fields = ['preset_id',  'preset_name', 'servo1', 'servo2', 'servo3', 'servo4', 'servo5', 'servo6', 'created_at', 'is_active']
        read_only_fields = [ 'created_at']

# Connection Serializers
class UserDeviceConnectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserDeviceConnection
        fields = '__all__'


# ===== 기기 연결 =====
class ConnectionDeleteSerializer(serializers.Serializer):
    """기기 연결 해제용"""
    phone_uuid = serializers.CharField(max_length=100, required=False, allow_blank=True, help_text="휴대전화 UUID")
    iot_uuid = serializers.CharField(max_length=100, help_text="IoT 기기 UUID")


# ===== 세션 관리 =====
class SessionCreateSerializer(serializers.Serializer):
    """세션 생성용"""
    connection_uuid = serializers.UUIDField()


class CommandLogCreateSerializer(serializers.Serializer):
    """명령 로그 생성용"""
    session_uuid = serializers.UUIDField()
    command_type = serializers.CharField(max_length=20)
    command_content = serializers.CharField(max_length=255)
    is_success = serializers.BooleanField(required=False)
    error_message = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class SessionEndSerializer(serializers.Serializer):
    """세션 종료용"""
    session_uuid = serializers.UUIDField(required=False)


# ===== 로그인 =====
class FaceLoginSerializer(serializers.Serializer):
    face_vector = serializers.ListField(
        child=serializers.FloatField(),
        help_text="512차원 얼굴 벡터"
    )
    # connection_uuid = serializers.UUIDField(required=False)

class PasswordLoginSerializer(serializers.Serializer):
    """아이디/비밀번호 로그인"""
    login_id = serializers.CharField()
    password = serializers.CharField()
    # connection_uuid = serializers.UUIDField(required=False)


# ===== 아이디 찾기 =====
class FindLoginIdSerializer(serializers.Serializer):
    """아이디 찾기용"""
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)


# ===== 비밀번호 재설정 =====
class PasswordResetRequestSerializer(serializers.Serializer):
    """비밀번호 재설정 요청용"""
    login_id = serializers.CharField()
    email = serializers.EmailField()


class ResetCodeVerifySerializer(serializers.Serializer):
    """비밀번호 재설정 코드 검증용"""
    login_id = serializers.CharField()
    email = serializers.EmailField()
    code = serializers.CharField()


class SetNewPasswordSerializer(serializers.Serializer):
    """새 비밀번호 설정용"""
    reset_token = serializers.CharField()
    new_password = serializers.CharField()


# ===== 회원 탈퇴 =====
class AccountDeletionSerializer(serializers.Serializer):
    """회원 탈퇴용"""
    password = serializers.CharField()
    deletion_reason = serializers.CharField(required=False, allow_blank=True)


# ===== 프리셋 관리 =====
class PresetSaveSerializer(serializers.Serializer):
    """프리셋 저장 요청용"""
    # 앱에서 사용: session_id, preset_name (젯슨 통신)
    # 젯슨에서 사용: uid, offsets (직접 전송)
    
    # 선택적 필드 (앱용)
    session_id = serializers.IntegerField(required=False, allow_null=True, help_text="세션 ID (선택사항)")
    connection_uuid = serializers.UUIDField(required=False, allow_null=True, help_text="연결 UUID (선택사항)")
    preset_name = serializers.CharField(max_length=50, required=False, allow_blank=True, help_text="프리셋 이름 (선택사항)")
    
    # 젯슨용 필드
    uid = serializers.UUIDField(required=False, allow_null=True, help_text="사용자 UID (젯슨용)")
    offsets = serializers.DictField(required=False, allow_null=True, help_text="서보 오프셋 (젯슨용)")
    
    # 개별 servo 필드 (앱용 - deprecated)
    servo1 = serializers.IntegerField(required=False, allow_null=True, help_text="Servo 1")
    servo2 = serializers.IntegerField(required=False, allow_null=True, help_text="Servo 2")
    servo3 = serializers.IntegerField(required=False, allow_null=True, help_text="Servo 3")
    servo4 = serializers.IntegerField(required=False, allow_null=True, help_text="Servo 4")
    servo5 = serializers.IntegerField(required=False, allow_null=True, help_text="Servo 5")
    servo6 = serializers.IntegerField(required=False, allow_null=True, help_text="Servo 6")


# class PresetFromJetsonSerializer(serializers.Serializer):
#     """젯슨에서 받은 프리셋 데이터 저장용"""
#     uid = serializers.UUIDField(help_text="사용자 UUID")
#     connection_uuid = serializers.UUIDField(help_text="연결 UUID")
#     x = serializers.IntegerField(help_text="X축 이동값")
#     y = serializers.IntegerField(help_text="Y축 이동값")
#     z = serializers.IntegerField(help_text="Z축 이동값 (거리)")
#     tilt = serializers.IntegerField(help_text="Tilt 회전값")
#     has = serializers.IntegerField(help_text="HAS 회전값")
#     name = serializers.CharField(max_length=50, required=False, allow_blank=True, help_text="프리셋 이름 (선택사항)")


class PresetLoadSerializer(serializers.Serializer):
    """프리셋 로드 요청용"""
    preset_id = serializers.IntegerField(help_text="프리셋 ID")
    connection_uuid = serializers.UUIDField(help_text="현재 세션의 연결 UUID")


class PresetToJetsonSerializer(serializers.Serializer):
    """젯슨으로 보낼 프리셋 데이터"""
    preset_id = serializers.IntegerField()
    servo1 = serializers.IntegerField()
    servo2 = serializers.IntegerField()
    servo3 = serializers.IntegerField()
    servo4 = serializers.IntegerField()
    servo5 = serializers.IntegerField()
    servo6 = serializers.IntegerField()


class PresetListSerializer(serializers.ModelSerializer):
    """프리셋 목록 조회용"""
    class Meta:
        model = Preset
        fields = ['preset_id', 'preset_name', 'servo1', 'servo2', 'servo3', 'servo4', 'servo5', 'servo6', 'is_active', 'created_at']
        read_only_fields = fields


# ===== 명령 로그 =====
class ControlScreenEnterSerializer(serializers.Serializer):
    """제어 화면 진입 신호"""
    connection_uuid = serializers.UUIDField(help_text="연결 UUID")


class ButtonCommandSerializer(serializers.Serializer):
    """버튼 명령 전달용"""
    connection_uuid = serializers.UUIDField(help_text="연결 UUID")
    button_type = serializers.CharField(max_length=50, help_text="버튼 타입 (예: FORWARD, BACKWARD, LEFT, RIGHT, GRAB, RELEASE)")
    button_label = serializers.CharField(max_length=50, required=False, help_text="버튼 표시 텍스트 (선택사항)")


class VoiceCommandFromJetsonSerializer(serializers.Serializer):
    """
    젯슨에서 받은 음성 명령
    
    지원하는 명령:
    - 로봇 제어: COME_HERE, TRACK_ON, TRACK_OFF, LEFT, RIGHT, UP, DOWN, FORWARD, BACKWARD, HOME
    - 유튜브: YOUTUBE_OPEN, YOUTUBE_SEEK_FORWARD, YOUTUBE_SEEK_BACKWARD, YOUTUBE_PAUSE, YOUTUBE_PLAY
    """
    uid = serializers.UUIDField(help_text="사용자 UID")
    command = serializers.ChoiceField(
        choices=[
            'COME_HERE', 'TRACK_ON', 'TRACK_OFF', 'LEFT', 'RIGHT', 'UP', 'DOWN', 
            'FORWARD', 'BACKWARD', 'HOME', 
            'YOUTUBE_OPEN', 'YOUTUBE_SEEK_FORWARD', 'YOUTUBE_SEEK_BACKWARD', 'YOUTUBE_PAUSE', 'YOUTUBE_PLAY'
        ],
        help_text="명령어"
    )


class MainPageButtonSerializer(serializers.Serializer):
    """메인페이지 버튼 클릭"""
    connection_uuid = serializers.UUIDField(help_text="연결 UUID")
    button_type = serializers.CharField(max_length=50, help_text="버튼 타입 (예: COME_HERE, FOLLOW)")
    button_label = serializers.CharField(max_length=50, required=False, help_text="버튼 표시 텍스트 (선택사항)")


class ButtonCommandRequestSerializer(serializers.Serializer):
    """
    앱 버튼 명령 요청
    앱 → 서버: uid, command 전송
    서버: CommandLog 저장 + 젯슨으로 전송
    """
    uid = serializers.UUIDField(help_text="사용자 UID")
    command = serializers.ChoiceField(
        choices=['COME_HERE', 'TRACK_ON', 'TRACK_OFF', 'HOME'],
        help_text="명령 종류 (이리와, 따라와, 멈춰, 저리가)"
    )


class PresetUpdateSerializer(serializers.Serializer):
    """프리셋 수정용"""
    preset_id = serializers.IntegerField(help_text="수정할 프리셋 ID")
    preset_name = serializers.CharField(max_length=50, required=False, allow_blank=True, help_text="프리셋 이름 (선택사항)")
    servo1 = serializers.IntegerField(required=False, allow_null=True, help_text="Servo 1 (선택사항)")
    servo2 = serializers.IntegerField(required=False, allow_null=True, help_text="Servo 2 (선택사항)")
    servo3 = serializers.IntegerField(required=False, allow_null=True, help_text="Servo 3 (선택사항)")
    servo4 = serializers.IntegerField(required=False, allow_null=True, help_text="Servo 4 (선택사항)")
    servo5 = serializers.IntegerField(required=False, allow_null=True, help_text="Servo 5 (선택사항)")
    servo6 = serializers.IntegerField(required=False, allow_null=True, help_text="Servo 6 (선택사항)")
