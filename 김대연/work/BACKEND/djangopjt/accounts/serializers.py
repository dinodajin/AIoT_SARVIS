# accounts/serializers.py

from rest_framework import serializers
from .models import User, Phone, IoTDevice, UserDeviceConnection, Session, CommandLog
import re


# ===== 회원가입 =====

class UserRegistrationSerializer(serializers.Serializer):
    """
    회원가입 1단계: 기본 정보 입력
    """
    login_id = serializers.CharField(max_length=20)
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)
    email = serializers.EmailField(max_length=100)
    nickname = serializers.CharField(max_length=20)
    
    def validate_login_id(self, value):
        """아이디 중복 및 형식 검증"""
        if User.objects.filter(login_id=value).exists():
            raise serializers.ValidationError("이미 사용 중인 아이디입니다.")
        
        if not re.match(r'^[a-zA-Z0-9_]+$', value):
            raise serializers.ValidationError("아이디는 영문, 숫자, 언더스코어만 사용 가능합니다.")
        
        return value
    
    def validate_email(self, value):
        """이메일 중복 검증"""
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("이미 사용 중인 이메일입니다.")
        return value
    
    def validate(self, data):
        """비밀번호 일치 확인"""
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({"password": "비밀번호가 일치하지 않습니다."})
        return data


class DeviceCheckSerializer(serializers.Serializer):
    """
    기기 연결 확인
    """
    device_uuid = serializers.CharField(max_length=100)
    device_type = serializers.CharField(max_length=50, required=False)
    rpi_uuid = serializers.CharField(max_length=100, required=True)


class UsbConnectionStatusSerializer(serializers.Serializer):
    phone_uuid = serializers.CharField(max_length=100)
    rpi_serial_number = serializers.CharField(max_length=100)
    is_connected = serializers.BooleanField()
    phone_model = serializers.CharField(max_length=50, required=False, allow_blank=True)


class ConnectionDeleteSerializer(serializers.Serializer):
    phone_uuid = serializers.CharField(max_length=100, required=False, allow_blank=True)
    rpi_serial_number = serializers.CharField(max_length=100)

# ===== 로그인 =====

class FaceLoginResultSerializer(serializers.Serializer):
    """
    얼굴 인식 로그인 결과 (젯슨 → Django)
    젯슨이 얼굴 인식 + 사용자 식별 완료 후 login_id만 전송
    """
    success = serializers.BooleanField()
    uid = serializers.UUIDField(required=False)
    message = serializers.CharField(required=False)  # 실패 시 메시지


class PasswordLoginSerializer(serializers.Serializer):
    """
    아이디/비밀번호 로그인
    """
    login_id = serializers.CharField(max_length=20)
    password = serializers.CharField(write_only=True)


# 회원 탈퇴 
class AccountDeletionSerializer(serializers.Serializer):
    login_id = serializers.CharField(max_length=20)
    password = serializers.CharField(write_only=True)
    deletion_reason = serializers.ChoiceField(
        choices=User.DeletionReason.choices,
        required=False,
        allow_null=True
    )


# 아이디 찾기용
class FindLoginIdSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)

# 비밀번호 재설정 1단계: 요청용
class PasswordResetRequestSerializer(serializers.Serializer):
    login_id = serializers.CharField()
    email = serializers.EmailField()

# 비밀번호 재설정 2단계: 코드 검증용
class ResetCodeVerifySerializer(serializers.Serializer):
    login_id = serializers.CharField()
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)

# 비밀번호 재설정 3단계: 새 비밀번호 설정용
class SetNewPasswordSerializer(serializers.Serializer):
    reset_token = serializers.CharField()
    new_password = serializers.CharField(min_length=8)


# 기기 등록
class IoTDeviceRegisterSerializer(serializers.ModelSerializer):
    """
    로봇 기기(IoTDevice) 자체를 등록할 때 사용
    """
    class Meta:
        model = IoTDevice
        fields = ['serial_number', 'device_type', 'firmware_version']


class SessionCreateSerializer(serializers.Serializer):
    connection_uuid = serializers.UUIDField()


class CommandLogCreateSerializer(serializers.Serializer):
    session_id = serializers.IntegerField()
    command_type = serializers.CharField(max_length=20)
    command_content = serializers.CharField(max_length=255)
    is_success = serializers.BooleanField(required=False)
    error_message = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class SessionEndSerializer(serializers.Serializer):
    session_id = serializers.IntegerField(required=False)