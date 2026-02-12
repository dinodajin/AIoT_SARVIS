# accounts/models.py
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
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
        user.is_staff = True  
        user.is_superuser = True  
        user.save(using=self._db)
        return user

class User(AbstractBaseUser, PermissionsMixin):
    user_id = models.AutoField(primary_key=True)
    login_id = models.CharField(max_length=20, unique=True, db_comment='사용자가 입력한 ID')
    uid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, db_column='UID')
    password = models.CharField(max_length=128) # AbstractBaseUser uses 'password' field, mapping to password_hash conceptually
    email = models.EmailField(max_length=100, unique=True)
    nickname = models.CharField(max_length=20)
    
    # Vector fields -> JSONField in Django
    face_vectors = models.JSONField(null=False, blank=False, default=list, db_comment='face_vectors VECTOR(512) x 5')
    voice_vectors = models.JSONField(null=True, blank=True, db_comment='voice_vectors VECTOR(256) x 4')

    created_at = models.DateTimeField(auto_now_add=True, db_comment='회원가입 일시')
    last_login_at = models.DateTimeField(null=True, blank=True)
    
    is_active = models.BooleanField(default=True, db_comment='계정 활성화 상태')
    is_staff = models.BooleanField(default=False, db_comment='관리자 페이지 접근 권한')  
    is_superuser = models.BooleanField(default=False, db_comment='모든 권한')  

    deleted_at = models.DateTimeField(null=True, blank=True)
    
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
    USERNAME_FIELD = 'login_id'
    REQUIRED_FIELDS = ['email', 'nickname']

    class Meta:
        db_table = 'user'
        managed = True

class Sarvis(models.Model):
    sarvis_id = models.AutoField(primary_key=True, db_comment='싸비스 고유 식별자')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):  
        return f"Sarvis #{self.sarvis_id}"

    class Meta:
        db_table = 'sarvis'
        managed = True

class Phone(models.Model):
    device_id = models.AutoField(primary_key=True, db_comment='기기 고유 식별자')
    device_name = models.CharField(max_length=50, db_comment='기기 고유 이름')
    device_type = models.CharField(max_length=50, null=True, blank=True, db_comment='디바이스 기종')
    registered_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):  
        return f"{self.device_name} ({self.device_type or 'Unknown'})"

    class Meta:
        db_table = 'phone'
        managed = True

class UserDeviceConnection(models.Model):
    connection_id = models.AutoField(primary_key=True, db_comment='연결 고유 식별자')
    connection_uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, help_text="API 식별용 (DB 스키마에는 없지만 API 편의상 유지)")
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='user_id', db_comment='싸비스 고유 식별자')
    # device_id in schema refers to Phone's device_id? Or generic?
    # Based on schema 'device_id INT NOT NULL', and 'phone' table has 'device_id'. Assuming FK to Phone.
    phone = models.ForeignKey(Phone, on_delete=models.CASCADE, db_column='device_id', db_comment='기기 고유 식별자')
    
    sarvis = models.ForeignKey(Sarvis, on_delete=models.CASCADE, db_column='sarvis_id', db_comment='싸비스 고유 식별자')
    
    device_alias = models.CharField(max_length=20, null=True, blank=True, db_comment='사용자가 지정한 별칭')
    connected_at = models.DateTimeField(auto_now_add=True, db_comment='연결 생성 일시')
    deleted_at = models.DateTimeField(null=True, blank=True, db_comment='연결 삭제 일시')
    is_active = models.BooleanField(default=False, db_comment='연결 활성화 상태')

    def __str__(self):  
        alias = self.device_alias or self.phone.device_name
        return f"{self.user.login_id} → {alias} (Active: {self.is_active})"

    class Meta:
        db_table = 'user_device_connection'
        managed = True

class Session(models.Model):
    session_id = models.AutoField(primary_key=True, db_comment='세션 고유 식별자')
    session_uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, help_text="API 식별용")
    
    connection = models.ForeignKey(UserDeviceConnection, on_delete=models.CASCADE, db_column='connection_id', db_comment='연결 고유 식별자')
    
    started_at = models.DateTimeField(auto_now_add=True, db_comment='세션 시작 일시')
    ended_at = models.DateTimeField(null=True, blank=True, db_comment='세션 종료 일시 (NULL = 사용중)')
    # 하트비트 로직 제거로 인해 더 이상 사용되지 않음 (DB 호환성을 위해 필드 유지)
    last_heartbeat = models.DateTimeField(null=True, blank=True, db_comment='마지막 하트비트 수신 시간 (사용 안 함)')

    def __str__(self):  
        status = "Active" if not self.ended_at else "Ended"
        return f"Session #{self.session_id} ({status})"

    class Meta:
        db_table = 'session'
        managed = True

class Preset(models.Model):
    preset_id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='user_id')
    
    servo1 = models.IntegerField()
    servo2 = models.IntegerField()
    servo3 = models.IntegerField()
    servo4 = models.IntegerField()
    servo5 = models.IntegerField()
    servo6 = models.IntegerField()
    
    preset_name = models.CharField(max_length=100, null=True, blank=True, db_comment='설정 이름')
    created_at = models.DateTimeField(auto_now_add=True, db_comment='설정 생성 일시')
    is_active = models.BooleanField(default=False, db_comment='현재 사용 중인 설정인지')

    def __str__(self): 
        return f"{self.preset_name or 'Unnamed'} (Active: {self.is_active})"

    class Meta:
        db_table = 'preset'
        managed = True

class CommandLog(models.Model):
    command_log_id = models.AutoField(primary_key=True, db_comment='사용자 명령 로그 고유 식별자')
    session = models.ForeignKey(Session, on_delete=models.CASCADE, db_column='session_id', db_comment='세션 고유 식별자')
    
    command_type = models.CharField(max_length=50, db_comment='play_video, volume_up 등') # ENUM in DB, CharField in Django
    command_content = models.TextField(null=True, blank=True, db_comment='명령 상세 내용')
    is_success = models.BooleanField(null=True, db_comment='명령 실행 성공 여부')
    error_message = models.TextField(null=True, blank=True, db_comment='실패 시 오류 메시지')
    created_at = models.DateTimeField(auto_now_add=True, db_comment='명령 발생 일시')

    def __str__(self):  
        result = "✅" if self.is_success else "❌"
        return f"{result} {self.command_type}: {self.command_content}"

    class Meta:
        db_table = 'command_log'
        managed = True

class BiometricLog(models.Model):
    biometric_history_id = models.AutoField(primary_key=True, db_comment='이력 고유 식별자')
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='user_id')
    
    change_type = models.CharField(max_length=50, db_comment='face_update / voice_update') # ENUM
    previous_vector = models.JSONField(null=True, blank=True, db_comment='변경 전 벡터')
    new_vector = models.JSONField(null=True, blank=True, db_comment='변경 후 벡터')
    
    changed_at = models.DateTimeField(auto_now_add=True)
    change_reason = models.CharField(max_length=50, null=True, blank=True) # ENUM

    def __str__(self):  # ✅ 추가
        return f"{self.user.login_id}: {self.change_type} ({self.changed_at})"

    class Meta:
        db_table = 'biometric_log'
        managed = True

class EmailVerification(models.Model):
    verification_id = models.AutoField(primary_key=True, db_comment='이메일 인증 고유 식별자 (PK)')
    email = models.EmailField(max_length=100, db_comment='인증 대상 이메일 주소')
    verification_code = models.CharField(max_length=6, db_comment='6자리 인증 코드')
    is_verified = models.BooleanField(default=False, db_comment='인증 완료 여부')
    expires_at = models.DateTimeField(db_comment='인증 코드 만료 시각')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):  # ✅ 추가
        return f"{self.email} - {self.verification_code}"
    
    class Meta:
        db_table = 'email_verification'
        managed = True

class PasswordResetToken(models.Model):
    token_id = models.AutoField(primary_key=True, db_comment='비밀번호 재설정 토큰 고유 식별자 (PK)')
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='user_id')
    token = models.CharField(max_length=255, unique=True, db_comment='비밀번호 재설정 토큰 문자열')
    expires_at = models.DateTimeField(db_comment='토큰 만료 시각')
    used = models.BooleanField(default=False, db_comment='토큰 사용 여부')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self): 
        return f"Token for {self.user.login_id} (Used: {self.used})"

    class Meta:
        db_table = 'password_reset_token'
        managed = True