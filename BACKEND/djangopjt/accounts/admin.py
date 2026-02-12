from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Phone, Sarvis, UserDeviceConnection, BiometricLog, Session, CommandLog, Preset, EmailVerification, PasswordResetToken

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    # BaseUserAdmin의 필수 필드 재정의
    ordering = ['user_id']
    list_display = ['user_id', 'login_id', 'email', 'nickname', 'is_active', 'is_staff', 'created_at']
    list_filter = ['is_active', 'is_staff', 'is_superuser', 'created_at']
    search_fields = ['login_id', 'email', 'nickname']
    
    # 필드셋 설정
    fieldsets = (
        (None, {'fields': ('login_id', 'email', 'nickname', 'password')}),
        ('개인정보', {'fields': ('face_vectors', 'voice_vectors')}),
        ('권한', {'fields': ('is_active', 'is_staff', 'is_superuser')}),
        ('중요 날짜', {'fields': ('last_login_at', 'created_at', 'deleted_at')}),
        ('기타', {'fields': ('deletion_reason',)}),
    )
    
    # 필터링 시 사용할 필드
    filter_horizontal = ()
    
    # 사용자 생성 폼에 필요한 필드
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('login_id', 'email', 'nickname', 'password1', 'password2'),
        }),
    )

@admin.register(Phone)
class PhoneAdmin(admin.ModelAdmin):
    list_display = ['device_id', 'device_name', 'device_type', 'registered_at']
    search_fields = ['device_name', 'device_type']

@admin.register(Sarvis)
class SarvisAdmin(admin.ModelAdmin):
    list_display = ['sarvis_id', 'created_at']

@admin.register(UserDeviceConnection)
class UserDeviceConnectionAdmin(admin.ModelAdmin):
    list_display = ['connection_id', 'user_id', 'phone', 'sarvis', 'is_active', 'connected_at']
    list_filter = ['is_active']

@admin.register(BiometricLog)
class BiometricLogAdmin(admin.ModelAdmin):
    list_display = ['biometric_history_id', 'user_id', 'change_type', 'changed_at']

@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ['session_id', 'connection', 'started_at', 'ended_at']
    list_filter = ['started_at', 'ended_at']

@admin.register(CommandLog)
class CommandLogAdmin(admin.ModelAdmin):
    list_display = ['command_log_id', 'session', 'command_type', 'is_success', 'created_at']
    list_filter = ['command_type', 'is_success']

@admin.register(Preset)
class PresetAdmin(admin.ModelAdmin):
    list_display = ['preset_id', 'user_id', 'preset_name', 'is_active', 'created_at']
    list_filter = ['is_active']
    search_fields = ['preset_name']

@admin.register(EmailVerification)
class EmailVerificationAdmin(admin.ModelAdmin):
    list_display = ['email', 'created_at', 'expires_at']
    search_fields = ['email']

@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    list_display = ['user_id', 'created_at', 'expires_at']