from django.contrib import admin
from .models import User, Device, UserDeviceConnection, BiometricLog

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ['user_id', 'login_id', 'email', 'nickname', 'created_at', 'is_active']
    search_fields = ['login_id', 'email', 'nickname']
    list_filter = ['is_active', 'created_at']

@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ['device_id', 'device_type', 'registered_at']
    
@admin.register(UserDeviceConnection)
class UserDeviceConnectionAdmin(admin.ModelAdmin):
    list_display = ['connection_id', 'user', 'device', 'is_active', 'connected_at']
    
@admin.register(BiometricLog)
class BiometricLogAdmin(admin.ModelAdmin):
    list_display = ['biometric_history_id', 'user', 'change_type', 'changed_at']