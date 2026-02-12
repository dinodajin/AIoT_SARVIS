# accounts/models.py
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
import uuid
from django.utils import timezone

class UserManager(BaseUserManager):
    def create_user(self, login_id, email, nickname, password=None):
        if not login_id:
            raise ValueError('아이디는 필수입니다.')
        user = self.model(login_id=login_id, email=self.normalize_email(email), nickname=nickname)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, login_id, email, nickname, password=None):
        user = self.create_user(login_id, email, nickname, password)
        user.is_admin = True # 필요 시 추가
        user.save(using=self._db)
        return user

class User(AbstractBaseUser):
    user_id = models.AutoField(primary_key=True)
    uid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, db_comment='외부 API용 고유 식별자')
    login_id = models.CharField(max_length=20, unique=True, db_comment='사용자가 입력한 ID')
    password = models.CharField(max_length=128)
    email = models.EmailField(max_length=100, unique=True)
    nickname = models.CharField(max_length=20)
    face_vector = models.JSONField(null=True, blank=True, db_comment='512차원 / 5개 각도 얼굴 벡터')
    voice_vector = models.JSONField(null=True, blank=True, db_comment='256차원 음성 벡터')

    created_at = models.DateTimeField(auto_now_add=True, db_comment='회원가입 일시')
    last_login_at = models.DateTimeField(null=True, blank=True)
    
    is_active = models.BooleanField(default=True, db_comment='계정 활성화 상태')
    deleted_at = models.DateTimeField(null=True, blank=True)
    # 탈퇴 사유 Enum 적용 
    class DeletionReason(models.TextChoices):
        INCONVENIENT = 'INCONVENIENT', '사용이 불편함'
        PRIVACY = 'PRIVACY', '개인정보 유출 우려'
        NOT_USED = 'NOT_USED', '자주 사용하지 않음'
        OTHER = 'OTHER', '기타'

    deletion_reason = models.CharField(
        max_length=20, 
        choices=DeletionReason.choices, 
        null=True, 
        blank=True,
        db_comment='탈퇴 사유'
    )    
    objects = UserManager()
    USERNAME_FIELD = 'login_id'  # 로그인 시 ID로 사용할 필드
    REQUIRED_FIELDS = ['email', 'nickname']  # 관리자 생성 시 필수 입력 필드

    class Meta:
        db_table = 'user'
        managed = True # django 가 DB를 관리함


class Phone(models.Model):
    phone_id = models.AutoField(primary_key=True, db_comment='스마트폰 고유 식별자')
    phone_uuid = models.CharField(max_length=100, unique=True, db_comment='폰 고유 UUID(앱 생성)')
    phone_model = models.CharField(max_length=50, null=True, blank=True, db_comment='기종명(예: iPhone 15)')
    os_version = models.CharField(max_length=20, null=True, blank=True, db_comment='OS 버전')
    
    last_connected_at = models.DateTimeField(null=True, blank=True)
    registered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'phone'
        managed = True

class IoTDevice(models.Model):
    iot_id = models.AutoField(primary_key=True, db_comment='로봇 기기 고유 식별자')
    serial_number = models.CharField(max_length=100, unique=True, db_comment='기기 고유 시리얼 번호(UUID)')
    device_type = models.CharField(
        max_length=20, 
        choices=[('JETSON', 'Jetson Nano'), ('RPI', 'Raspberry Pi')],
        default='JETSON'
    )
    firmware_version = models.CharField(max_length=20, null=True, blank=True)
    is_online = models.BooleanField(default=False, db_comment='현재 기기 가동 여부')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'iot_device'

class UserDeviceConnection(models.Model):
    connection_id = models.AutoField(primary_key=True, db_comment='연결 고유 식별자')
    connection_uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='user_id')
    phone = models.ForeignKey(Phone, on_delete=models.CASCADE, db_column='phone_id')
    iot_device = models.ForeignKey(IoTDevice, on_delete=models.CASCADE, db_column='iot_id')
    phone_alias = models.CharField(max_length=20, null=True, blank=True, db_comment='사용자가 지정한 별칭')
    connected_at = models.DateTimeField(auto_now_add=True, db_comment='연결 생성 일시')
    deleted_at = models.DateTimeField(null=True, blank=True, db_comment='연결 삭제 일시')
    is_active = models.BooleanField(default=False, db_comment='연결 활성화 상태')
    
    class Meta:
        db_table = 'user_device_connection'
        managed = True
        unique_together = ('user', 'phone', 'iot_device')

class BiometricLog(models.Model):
    biometric_history_id = models.AutoField(primary_key=True, db_comment='이력 고유 식별자')
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='user_id')
    
    change_type = models.CharField(max_length=20, db_comment='face_update / voice_update')
    previous_vector = models.JSONField(null=True, blank=True, db_comment='변경 전 벡터')
    new_vector = models.JSONField(null=True, blank=True, db_comment='변경 후 벡터')    
    
    changed_at = models.DateTimeField(auto_now_add=True)
    change_reason = models.TextField(null=True, blank=True)
    
    class Meta:
        db_table = 'biometric_log'
        managed = True

class Session(models.Model):
    session_id = models.AutoField(primary_key=True, db_comment='세션 고유 식별자 (PK)')
    connection = models.ForeignKey('UserDeviceConnection', on_delete=models.CASCADE, db_column='connection_id', db_comment='기기 연결 ID (FK)')
    started_at = models.DateTimeField(auto_now_add=True, db_comment='세션 시작 일시')
    ended_at = models.DateTimeField(null=True, blank=True, db_comment='세션 종료 일시')
    
    class Meta:
        db_table = 'session'
        managed = True

class CommandLog(models.Model):
    command_log_id = models.AutoField(primary_key=True)
    session = models.ForeignKey(Session, on_delete=models.CASCADE, db_column='session_id')
    command_type = models.CharField(max_length=20)
    command_content = models.CharField(max_length=255)
    is_success = models.BooleanField(default=False)
    error_message = models.TextField(null=True, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'command_log'
        managed = True

class UserManualPreset(models.Model):
    preset_id = models.AutoField(primary_key=True, db_comment='프리셋 고유 식별자 (PK)')
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='user_id', db_comment='사용자 ID (FK)')
    connection = models.ForeignKey('UserDeviceConnection', on_delete=models.CASCADE, db_column='connection_id', db_comment='기기 연결 ID (FK)')
    
    up = models.IntegerField(default=0, db_comment='상방향 이동값')
    down = models.IntegerField(default=0, db_comment='하방향 이동값')
    left = models.IntegerField(default=0, db_comment='좌측 이동값')
    right = models.IntegerField(default=0, db_comment='우측 이동값')
    tilt_up = models.IntegerField(default=0, db_comment='Tilt 상방향 회전값')
    tilt_down = models.IntegerField(default=0, db_comment='Tilt 하방향 회전값')
    has_left = models.IntegerField(default=0, db_comment='HAS 좌측 회전값')
    has_right = models.IntegerField(default=0, db_comment='HAS 우측 회전값')
    distance = models.IntegerField(default=50, db_comment='거리값 (0-100)')
    
    is_active = models.BooleanField(default=True, db_comment='활성화된 프리셋 여부')
    created_at = models.DateTimeField(auto_now_add=True, db_comment='프리셋 생성 일시')
    updated_at = models.DateTimeField(auto_now=True, db_comment='프리셋 수정 일시')
    
    class Meta:
        db_table = 'user_manual_preset'
        managed = True


class EmailVerification(models.Model):
    verification_id = models.AutoField(primary_key=True, db_comment='이메일 인증 고유 식별자 (PK)')
    email = models.EmailField(max_length=100, db_comment='인증 대상 이메일 주소')
    verification_code = models.CharField(max_length=6, db_comment='6자리 인증 코드')
    is_verified = models.BooleanField(default=False, db_comment='인증 완료 여부 (True: 완료, False: 미완료)')
    expires_at = models.DateTimeField(db_comment='인증 코드 만료 시각')
    created_at = models.DateTimeField(auto_now_add=True, db_comment='인증 코드 생성 일시')
    
    class Meta:
        db_table = 'email_verification'
        managed = True


class PasswordResetToken(models.Model):
    token_id = models.AutoField(primary_key=True, db_comment='비밀번호 재설정 토큰 고유 식별자 (PK)')
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='user_id', db_comment='사용자 ID (FK)')
    token = models.CharField(max_length=255, unique=True, db_comment='비밀번호 재설정 토큰 문자열')
    expires_at = models.DateTimeField(db_comment='토큰 만료 시각')
    used = models.BooleanField(default=False, db_comment='토큰 사용 여부 (True: 사용됨, False: 미사용)')
    created_at = models.DateTimeField(auto_now_add=True, db_comment='토큰 생성 일시')
    
    class Meta:
        db_table = 'password_reset_token'
        managed = True


class RPiDevice(models.Model):
    """
    라즈베리 파이 기기 정보
    """
    rpi_uuid = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)