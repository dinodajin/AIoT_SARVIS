# accounts/urls.py
from django.urls import path
from . import views
from . import robot_arm
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

urlpatterns = [
    # ===== 회원가입 =====
    path('api/register/clear-cache/', views.clear_registration_cache_api, name='clear_registration_cache'),
    path('api/register/check-id/', views.register_step_id, name='register_step_id'),
    path('api/register/nickname/', views.register_step_nickname, name='register_step_nickname'),
    path('api/register/email/', views.register_step_email, name='register_step_email'),
    path('api/register/password/', views.register_step_password, name='register_step_password'),
    path('api/register/email-request/', views.request_email_verification, name='request_email_verification'),
    path('api/register/verify-email/', views.verify_email_code, name='verify_email'),

    # ===== 생체 정보 =====
    path('api/biometric/save-face/', views.save_face_vector_from_jetson, name='save_face_vector_from_jetson'),
    path('api/biometric/save-voice/', views.save_voice_vector_from_jetson, name='save_voice_vector_from_jetson'),  # 회원가입용
    path('api/biometric/update-voice/', views.update_voice_vector_from_jetson, name='update_voice_vector_from_jetson'),  # 재등록용
    path('api/biometric/update-face/', views.update_face_vector_from_jetson, name='update_face_vector_from_jetson'),  # 재등록용

    # ===== 세션 관리 =====
    path('api/session/start/', views.start_session, name='start_session'),
    path('api/session/command-log/', views.create_command_log, name='create_command_log'),
    path('api/session/end/', views.end_session, name='end_session'),

    # ===== 로그인 =====
    path('api/login/face/', views.face_login, name='face_login'),
    path('api/login/password/', views.password_login, name='password_login'),
    
    # ===== JWT 토큰 =====
    path('api/auth/refresh/', views.refresh_token, name='refresh_token'),
    path('api/auth/logout/', views.logout, name='logout'),

    # ===== 사용자 프로필 =====
    path('api/user/profile/', views.get_user_profile, name='get_user_profile'),
    path('api/user/profile/update/', views.update_user_profile, name='update_user_profile'),

    # ===== 아이디 찾기 =====
    path('api/find-id/', views.find_login_id, name='find_login_id'),

    # ===== 비밀번호 재설정 =====
    path('api/password/reset-request/', views.request_password_reset, name='password_reset_request'),
    path('api/password/reset-verify-code/', views.verify_reset_code, name='password_reset_verify'),
    path('api/password/reset-set-new/', views.set_new_password, name='set_new_password'),

    # ===== 회원 탈퇴 =====
    path('api/accounts/delete/', views.delete_account, name='delete_account'),

    # ===== 프리셋 관리 =====
    path('api/preset/list/', views.get_presets, name='get_presets'),
    path('api/preset/select/', views.select_preset, name='select_preset'),
    path('api/preset/update/', views.update_preset, name='update_preset'),
    path('api/preset/rename/', views.rename_preset, name='rename_preset'),
    path('api/preset/save/', robot_arm.save_preset, name='save_preset'),

    # ===== 로봇 수동 제어 =====
    path('api/control/button/', robot_arm.button_command, name='button_command'),

    # ===== 버튼 명령 (앱 → 서버) =====
    path('api/button-command/', views.button_command_request, name='button_command_request'),

    # ===== 명령 로그 관리 =====
    path('api/control/enter/', views.control_screen_enter, name='control_screen_enter'),
    path('api/control/voice/', views.voice_command_from_jetson, name='voice_command_from_jetson'),
    
    # ===== 웹소켓 음성 명령 전달 =====
    path('api/voice-command/trigger/', views.trigger_voice_command, name='trigger_voice_command'),

    # ===== API 문서 =====
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]
