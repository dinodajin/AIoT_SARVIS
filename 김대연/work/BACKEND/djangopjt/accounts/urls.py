# accounts/urls.py
from django.urls import path, include
from . import views
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

urlpatterns = [
    # 회원가입 프로세스
    path('api/register/step1/', views.register_step1, name='register_step1'),
    path('api/device/check/', views.check_device_connection, name='check_device'),
    path('api/device/usb-status/', views.report_usb_connection_status, name='report_usb_connection_status'),
    path('api/device/disconnection/', views.delete_connection, name='delete_connection'),

    # 세션 시작
    path('api/session/start/', views.start_session, name='start_session'),
    path('api/session/command-log/', views.create_command_log, name='create_command_log'),
    path('api/session/end/', views.end_session, name='end_session'),
    
    # 이메일 인증 요청 
    path('api/register/email-request/', views.request_email_verification, name='request_email_verification'),
    # 이메일 인증 
    path('api/register/verify-email/', views.verify_email_code, name='verify_email'),
        
    # 젯슨에서 생체 정보 수신 (한 번에)
    path('api/save-biometric/', views.save_biometric_data, name='save_biometric'),

    # 로그인
    path('api/login/verify-face/', views.get_registered_faces, name='get_registered_faces'),
    path('api/login/request-face/', views.request_face_login, name='request_face_login'),
    path('api/login/face-login-result/', views.face_login_result, name='face_login_result'),
    path('api/login/password/', views.password_login, name='password_login'),

    # JWT 토큰 관리
    path('api/auth/refresh/', views.refresh_token, name='refresh_token'),  # Access Token 갱신
    path('api/auth/logout/', views.logout, name='logout'),  # 로그아웃

    # 사용자 프로필
    path('api/user/profile/', views.get_user_profile, name='get_user_profile'),  # 프로필 조회
    path('api/user/profile/update/', views.update_user_profile, name='update_user_profile'),  # 프로필 수정

    # 비밀번호 찾기 (인증코드 요청)
    path('api/password/reset-request/', views.request_password_reset, name='password_reset_request'),
    # 비밀번호 재설정
    path('api/password/reset-set-new/', views.set_new_password, name='set_new_password'),
    # 비밀번호 재설정 코드 검증
    path('api/password/reset-verify-code/', views.verify_reset_code, name='password_reset_verify'),

    # 회원 탈퇴
    path('api/account/delete/', views.delete_account, name='delete_account'),
    # 아이디 찾기
    path('api/find-id/', views.find_login_id, name='find_id'),
    
    # 로봇 제어
    path('api/robot/update/', views.update_robot_angle, name='update_robot_angle'),
    path('api/robot/latest/', views.get_latest_robot_angle, name='get_latest_robot_angle'),
    
    # OpenAPI 스키마 추출
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    # Swagger UI: 눈으로 보고 테스트하는 페이지
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    # Redoc: 문서 중심의 깔끔한 페이지 (선택사항)
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]