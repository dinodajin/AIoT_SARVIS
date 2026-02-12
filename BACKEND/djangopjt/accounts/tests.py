from django.test import TestCase, Client, override_settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken
from accounts.models import User, Phone, IoTDevice, UserDeviceConnection, BiometricLog, EmailVerification, PasswordResetToken, Session, UserManualPreset
import json
import tempfile
from io import BytesIO
import os

class UserRegistrationTestCase(TestCase):
    """회원가입 관련 테스트"""
    
    def setUp(self):
        """테스트 초기 설정"""
        self.client = Client()
        # 테스트용 IoT 기기 생성
        self.iot_device = IoTDevice.objects.create(
            iot_uuid='test_iot_uuid_001',
            device_type='RPI'
        )
    
    def test_register_step1_success(self):
        """회원가입 1단계: 기본 정보 입력 테스트"""
        data = {
            'login_id': 'testuser',
            'password': 'Test1234!',
            'password_confirm': 'Test1234!',
            'email': 'test@example.com',
            'nickname': '테스터'
        }

        
        response = self.client.post(
            '/api/register/step1/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertEqual(response.json()['login_id'], 'testuser')
    
    def test_register_step1_duplicate_id(self):
        User.objects.create_user(
            login_id='testuser',
            email='exist@example.com',
            nickname='기존유저',
            password='Test1234!'
        )

        data = {
            'login_id': 'testuser',
            'password': 'Test1234!',
            'password_confirm': 'Test1234!',
            'email': 'test2@example.com',
            'nickname': '새유저'
        }

        response = self.client.post(
            '/api/register/step1/',
            data=json.dumps(data),
            content_type='application/json'
        )

        self.assertEqual(response.status_code, 400)  # ✅ 여기 중요
        
    def test_check_device_connection_success(self):
        """기기 연결 확인 테스트"""
        data = {
            'device_uuid': 'phone_uuid_001',
            'device_type': 'iPhone 15',
            'rpi_uuid': 'test_iot_uuid_001'
        }
        
        response = self.client.post(
            '/api/device/check/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertIn('phone_id', response.json())
        self.assertIn('iot_id', response.json())
    
    def test_check_device_connection_invalid_uuid(self):
        """존재하지 않는 IoT UUID 테스트"""
        data = {
            'device_uuid': 'phone_uuid_001',
            'device_type': 'iPhone 15',
            'rpi_uuid': 'invalid_uuid'
        }
        
        response = self.client.post(
            '/api/device/check/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['success'], False)


class LoginTestCase(TestCase):
    """로그인 관련 테스트"""
    
    def setUp(self):
        """테스트 초기 설정"""
        self.client = Client()
        # 테스트용 사용자 생성
        self.user = User.objects.create_user(
            login_id='testuser',
            email='test@example.com',
            nickname='테스터',
            password='Test1234!'
        )
    
    def test_password_login_success(self):
        """비밀번호 로그인 성공 테스트"""
        data = {
            'login_id': 'testuser',
            'password': 'Test1234!'
        }
        
        response = self.client.post(
            '/api/login/password/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertIn('tokens', response.json())
        self.assertIn('access', response.json()['tokens'])
        self.assertIn('refresh', response.json()['tokens'])
    
    def test_password_login_wrong_password(self):
        """비밀번호 로그인 실패 테스트 (잘못된 비밀번호)"""
        data = {
            'login_id': 'testuser',
            'password': 'WrongPassword'
        }
        
        response = self.client.post(
            '/api/login/password/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['success'], False)
    
    def test_password_login_nonexistent_user(self):
        """비밀번호 로그인 실패 테스트 (존재하지 않는 사용자)"""
        data = {
            'login_id': 'nonexistent',
            'password': 'Test1234!'
        }
        
        response = self.client.post(
            '/api/login/password/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['success'], False)
    
    # def test_get_registered_faces(self):
    #     """등록된 얼굴 벡터 조회 테스트"""
    #     # 얼굴 벡터가 있는 사용자 생성
    #     user_with_face = User.objects.create_user(
    #         login_id='faceuser',
    #         email='face@example.com',
    #         nickname='얼굴사용자',
    #         password='Test1234!'
    #     )
    #     user_with_face.face_vectors = [0.1] * 512
    #     user_with_face.save()
        
    #     response = self.client.get('/api/login/verify-face/')
        
    #     self.assertEqual(response.status_code, 200)
    #     self.assertEqual(response.json()['success'], True)
    #     self.assertIn('faces', response.json())


class TokenManagementTestCase(TestCase):
    """토큰 관리 테스트"""
    
    def setUp(self):
        """테스트 초기 설정"""
        self.client = Client()
        self.user = User.objects.create_user(
            login_id='testuser',
            email='test@example.com',
            nickname='테스터',
            password='Test1234!'
        )
        # 토큰 생성
        self.refresh = RefreshToken.for_user(self.user)
        self.access_token = str(self.refresh.access_token)
        self.refresh_token = str(self.refresh)
    
    def test_refresh_token_success(self):
        """토큰 갱신 성공 테스트"""
        data = {
            'refresh': self.refresh_token
        }
        
        response = self.client.post(
            '/api/auth/refresh/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertIn('access', response.json())
    
    def test_refresh_token_invalid(self):
        """유효하지 않은 토큰 갱신 테스트"""
        data = {
            'refresh': 'invalid_token'
        }
        
        response = self.client.post(
            '/api/auth/refresh/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['success'], False)
    
    def test_logout_success(self):
        """로그아웃 성공 테스트"""
        data = {
            'refresh': self.refresh_token
        }
        
        response = self.client.post(
            '/api/auth/logout/',
            data=json.dumps(data),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.access_token}' # 이 줄이 누락되었을 가능성
        )        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)


class UserProfileTestCase(TestCase):
    """사용자 프로필 테스트"""
    
    def setUp(self):
        """테스트 초기 설정"""
        self.client = Client()
        self.user = User.objects.create_user(
            login_id='testuser',
            email='test@example.com',
            nickname='테스터',
            password='Test1234!'
        )
        # 토큰 생성
        self.refresh = RefreshToken.for_user(self.user)
        self.access_token = str(self.refresh.access_token)
    
    def test_get_user_profile_success(self):
        """프로필 조회 성공 테스트"""
        response = self.client.get(
            '/api/user/profile/',
            HTTP_AUTHORIZATION=f'Bearer {self.access_token}'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertEqual(response.json()['user']['login_id'], 'testuser')
    
    def test_get_user_profile_unauthorized(self):
        """인증 없이 프로필 조회 시도 테스트"""
        response = self.client.get('/api/user/profile/')
        
        self.assertEqual(response.status_code, 401)
    
    def test_update_user_profile_success(self):
        """프로필 수정 성공 테스트"""
        data = {
            'nickname': '새로운닉네임'
        }
        
        response = self.client.patch(
            '/api/user/profile/update/',
            data=json.dumps(data),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.access_token}'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertEqual(response.json()['user']['nickname'], '새로운닉네임')
    
    def test_update_user_profile_duplicate_nickname(self):
        """중복 닉네임 수정 실패 테스트"""
        # 다른 사용자 생성
        User.objects.create_user(
            login_id='otheruser',
            email='other@example.com',
            nickname='다른사용자',
            password='Test1234!'
        )
        
        data = {
            'nickname': '다른사용자'
        }
        
        response = self.client.patch(
            '/api/user/profile/update/',
            data=json.dumps(data),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.access_token}'
        )
        
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['success'], False)


class EmailVerificationTestCase(TestCase):
    """이메일 인증 테스트"""
    
    def setUp(self):
        """테스트 초기 설정"""
        self.client = Client()
    
    def test_request_email_verification_success(self):
        """이메일 인증 코드 요청 성공 테스트"""
        data = {
            'email': 'test@example.com'
        }
        
        response = self.client.post(
            '/api/register/email-request/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        
        # 인증 코드가 생성되었는지 확인
        verification = EmailVerification.objects.filter(email='test@example.com').first()
        self.assertIsNotNone(verification)
    
    def test_verify_email_code_success(self):
        """이메일 인증 코드 검증 성공 테스트"""
        # 인증 코드 생성
        verification = EmailVerification.objects.create(
            email='test@example.com',
            verification_code='123456',
            expires_at=timezone.now() + timezone.timedelta(minutes=30)
        )
        
        data = {
            'email': 'test@example.com',
            'code': '123456'
        }
        
        response = self.client.post(
            '/api/register/verify-email/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
    
    def test_verify_email_code_master_key(self):
        """마스터키(999999) 인증 테스트"""
        data = {
            'email': 'test@example.com',
            'code': '999999'
        }
        
        response = self.client.post(
            '/api/register/verify-email/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertIn('마스터키', response.json()['message'])
    
    def test_verify_email_code_wrong_code(self):
        """잘못된 인증 코드 테스트"""
        data = {
            'email': 'test@example.com',
            'code': '000000'
        }
        
        response = self.client.post(
            '/api/register/verify-email/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['success'], False)


class PasswordResetTestCase(TestCase):
    """비밀번호 찾기 테스트"""
    
    def setUp(self):
        """테스트 초기 설정"""
        self.client = Client()
        self.user = User.objects.create_user(
            login_id='testuser',
            email='test@example.com',
            nickname='테스터',
            password='Test1234!'
        )
    
    def test_request_password_reset_success(self):
        """비밀번호 재설정 요청 성공 테스트"""
        data = {
            'login_id': 'testuser',
            'email': 'test@example.com'
        }
        
        response = self.client.post(
            '/api/password/reset-request/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
    
    def test_verify_reset_code_success(self):
        """비밀번호 재설정 코드 검증 성공 테스트"""
        data = {
            'login_id': 'testuser',
            'email': 'test@example.com',
            'code': '999999'
        }
        
        response = self.client.post(
            '/api/password/reset-verify-code/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertIn('reset_token', response.json())
    
    def test_set_new_password_success(self):
        """새 비밀번호 설정 성공 테스트"""
        # 리셋 토큰 생성
        reset_token = PasswordResetToken.objects.create(
            user=self.user,
            token='test_reset_token',
            expires_at=timezone.now() + timezone.timedelta(minutes=10)
        )
        
        data = {
            'reset_token': 'test_reset_token',
            'new_password': 'NewPassword123!'
        }
        
        response = self.client.post(
            '/api/password/reset-set-new/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        
        # 비밀번호가 변경되었는지 확인
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewPassword123!'))


class FindLoginIdTestCase(TestCase):
    """아이디 찾기 테스트"""
    
    def setUp(self):
        """테스트 초기 설정"""
        self.client = Client()
        self.user = User.objects.create_user(
            login_id='testuser',
            email='test@example.com',
            nickname='테스터',
            password='Test1234!'
        )
    
    def test_find_login_id_success(self):
        """아이디 찾기 성공 테스트"""
        data = {
            'email': 'test@example.com',
            'code': '999999'
        }
        
        response = self.client.post(
            '/api/find-id/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertEqual(response.json()['login_id'], 'testuser')
    
    def test_find_login_id_not_found(self):
        """존재하지 않는 이메일로 아이디 찾기 테스트"""
        data = {
            'email': 'nonexistent@example.com',
            'code': '999999'
        }
        
        response = self.client.post(
            '/api/find-id/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['success'], False)


class DeleteAccountTestCase(TestCase):
    """회원 탈퇴 테스트"""
    
    def setUp(self):
        """테스트 초기 설정"""
        self.client = Client()
        self.user = User.objects.create_user(
            login_id='testuser',
            email='test@example.com',
            nickname='테스터',
            password='Test1234!'
        )
        # 토큰 생성
        self.refresh = RefreshToken.for_user(self.user)
        self.access_token = str(self.refresh.access_token)
    
    def test_delete_account_success(self):
        """회원 탈퇴 성공 테스트"""
        data = {
            'login_id': 'testuser',
            'password': 'Test1234!',
            'deletion_reason': 'OTHER'
        }
        
        response = self.client.post(
            '/api/account/delete/',
            data=json.dumps(data),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.access_token}'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        
        # 사용자가 비활성화되었는지 확인
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)
        self.assertIsNotNone(self.user.deleted_at)
    
    def test_delete_account_wrong_password(self):
        """잘못된 비밀번호로 회원 탈퇴 시도 테스트"""
        data = {
            'login_id': 'testuser',
            'password': 'WrongPassword',
            'deletion_reason': 'OTHER'
        }
        
        response = self.client.post(
            '/api/account/delete/',
            data=json.dumps(data),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.access_token}'
        )
        
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['success'], False)


class RobotControlTestCase(TestCase):
    """로봇 제어 테스트"""
    
    def setUp(self):
        """테스트 초기 설정"""
        self.client = Client()
    
    def test_update_robot_angle_success(self):
        """로봇 각도 업데이트 성공 테스트"""
        data = {
            'yaw': 90,
            'pitch': 45,
            'guide': 'MOVE'
        }
        
        response = self.client.post(
            '/api/robot/update/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
    
    def test_get_latest_robot_angle_no_data(self):
        """저장된 각도 정보 없을 때 조회 테스트"""
        cache.delete('robot_angle_data')
        
        response = self.client.get('/api/robot/latest/')
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertEqual(response.json()['data']['guide'], 'WAIT')
    
    def test_get_latest_robot_angle_with_data(self):
        """저장된 각도 정보 조회 테스트"""
        # 캐시에 데이터 저장
        angle_data = {'yaw': 90, 'pitch': 45, 'guide': 'MOVE'}
        cache.set('robot_angle_data', angle_data)
        
        response = self.client.get('/api/robot/latest/')
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertEqual(response.json()['data']['yaw'], 90)


class SessionManagementTestCase(TestCase):
    """세션 관리 테스트"""
    
    def setUp(self):
        """테스트 초기 설정"""
        self.client = Client()
        self.user = User.objects.create_user(
            login_id='testuser',
            email='test@example.com',
            nickname='테스터',
            password='Test1234!'
        )
        self.refresh = RefreshToken.for_user(self.user)
        self.access_token = str(self.refresh.access_token)
        
        # 테스트용 기기 및 연결 생성
        self.phone = Phone.objects.create(phone_uuid='phone_uuid_001')
        self.iot_device = IoTDevice.objects.create(
            iot_uuid='test_iot_uuid_001',
            device_type='RPI'
        )
        self.connection = UserDeviceConnection.objects.create(
            user=self.user,
            phone=self.phone,
            iot_device=self.iot_device,
            is_active=True
        )
    
    def test_start_session_success(self):
        """세션 시작 성공 테스트"""
        data = {
            'connection_uuid': str(self.connection.connection_uuid)
        }
        
        response = self.client.post(
            '/api/session/start/',
            data=json.dumps(data),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.access_token}'
        )
        
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['success'], True)
        self.assertIn('session_id', response.json())
    
    def test_end_session_success(self):
        """세션 종료 성공 테스트"""
        # 세션 생성
        session = Session.objects.create(connection=self.connection)
        
        data = {
            'session_id': session.session_id
        }
        
        response = self.client.post(
            '/api/session/end/',
            data=json.dumps(data),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.access_token}'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        
        # 세션이 종료되었는지 확인
        session.refresh_from_db()
        self.assertIsNotNone(session.ended_at)
    
    def test_create_command_log_success(self):
        """커맨드 로그 생성 성공 테스트"""
        # 세션 생성
        session = Session.objects.create(connection=self.connection)
        
        data = {
            'session_id': session.session_id,
            'command_type': 'MOVE',
            'command_content': 'FORWARD',
            'is_success': True
        }
        
        response = self.client.post(
            '/api/session/command-log/',
            data=json.dumps(data),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.access_token}'
        )
        
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['success'], True)
        self.assertIn('command_log_id', response.json())


class USBConnectionTestCase(TestCase):
    """USB 연결 상태 테스트"""
    
    def setUp(self):
        """테스트 초기 설정"""
        self.client = Client()
        self.user = User.objects.create_user(
            login_id='testuser',
            email='test@example.com',
            nickname='테스터',
            password='Test1234!'
        )
        self.refresh = RefreshToken.for_user(self.user)
        self.access_token = str(self.refresh.access_token)
        
        self.iot_device = IoTDevice.objects.create(
            iot_uuid='test_iot_uuid_001',
            device_type='RPI'
        )
    
    def test_report_usb_connection_success(self):
        """USB 연결 상태 보고 성공 테스트"""
        data = {
            'phone_uuid': 'phone_uuid_001',
            'iot_uuid': 'test_iot_uuid_001',
            'is_connected': True
        }
        
        response = self.client.post(
            '/api/device/usb-status/',
            data=json.dumps(data),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.access_token}'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertEqual(response.json()['is_connected'], True)
    
    def test_delete_connection_success(self):
        """연결 삭제 성공 테스트"""
        # 연결 생성
        phone = Phone.objects.create(phone_uuid='phone_uuid_001')
        connection = UserDeviceConnection.objects.create(
            user=self.user,
            phone=phone,
            iot_device=self.iot_device,
            is_active=True
        )
        
        data = {
            'phone_uuid': 'phone_uuid_001',
            'iot_uuid': 'test_iot_uuid_001'
        }
        
        response = self.client.delete(
            '/api/device/disconnection/',
            data=json.dumps(data),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {self.access_token}'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        
        # 연결이 비활성화되었는지 확인
        connection.refresh_from_db()
        self.assertFalse(connection.is_active)
        self.assertIsNotNone(connection.deleted_at)


class FaceLoginTestCase(TestCase):
    """얼굴 인식 로그인 테스트"""
    
    def setUp(self):
        """테스트 초기 설정"""
        self.client = Client()
        # 테스트용 사용자 생성 (512차원 얼굴 벡터)
        self.user1 = User.objects.create_user(
            login_id='faceuser1',
            email='face1@example.com',
            nickname='얼굴사용자1',
            password='Test1234!'
        )
        self.user1.face_vectors = [0.1] * 512
        self.user1.save()
        
        self.user2 = User.objects.create_user(
            login_id='faceuser2',
            email='face2@example.com',
            nickname='얼굴사용자2',
            password='Test1234!'
        )
        self.user2.face_vectors = [0.2] * 512
        self.user2.save()
        
        # 비활성화된 사용자
        self.inactive_user = User.objects.create_user(
            login_id='inactive_user',
            email='inactive@example.com',
            nickname='비활성사용자',
            password='Test1234!'
        )
        self.inactive_user.face_vectors = [0.3] * 512
        self.inactive_user.is_active = False
        self.inactive_user.save()
    
    def test_face_login_success(self):
        """얼굴 로그인 성공 테스트 (정확히 일치하는 벡터)"""
        data = {
            'face_vector': [0.1] * 512  # user1의 벡터와 정확히 일치
        }
        
        response = self.client.post(
            '/api/login/face/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertEqual(response.json()['login_method'], 'face')
        self.assertEqual(response.json()['login_id'], 'faceuser1')
        self.assertIn('tokens', response.json())
        self.assertIn('access', response.json()['tokens'])
        self.assertIn('refresh', response.json()['tokens'])
    
    def test_face_login_similar(self):
        """얼굴 로그인 성공 테스트 (유사한 벡터)"""
        # user1의 벡터와 약간 다르지만 유사한 벡터
        similar_vector = [0.11] * 512
        
        data = {
            'face_vector': similar_vector
        }
        
        response = self.client.post(
            '/api/login/face/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertEqual(response.json()['login_id'], 'faceuser1')
    
    def test_face_login_no_match(self):
        """얼굴 로그인 실패 테스트 (일치하는 사용자 없음)"""
        # 어떤 사용자와도 유사하지 않은 벡터
        random_vector = [0.99] * 512
        
        data = {
            'face_vector': random_vector
        }
        
        response = self.client.post(
            '/api/login/face/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['success'], False)
        self.assertEqual(response.json()['reason'], 'FACE_NOT_MATCH')
        self.assertEqual(response.json()['fallback'], 'PASSWORD_LOGIN')
    
    def test_face_login_inactive_user(self):
        """비활성화된 사용자로 얼굴 로그인 시도 테스트"""
        data = {
            'face_vector': [0.3] * 512  # 비활성화된 사용자의 벡터
        }
        
        response = self.client.post(
            '/api/login/face/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['success'], False)
        self.assertEqual(response.json()['reason'], 'FACE_NOT_MATCH')
    
    def test_face_login_no_vector(self):
        """얼굴 벡터 없이 로그인 시도 테스트"""
        data = {
            'face_vector': None
        }
        
        response = selfㅆlient.post(
            '/api/login/face/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['success'], False)
        self.assertEqual(response.json()['reason'], 'INVALID_REQUEST')
    
    def test_face_login_empty_vector(self):
        """빈 얼굴 벡터로 로그인 시도 테스트"""
        data = {}
        
        response = self.client.post(
            '/api/login/face/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['success'], False)
        self.assertEqual(response.json()['reason'], 'INVALID_REQUEST')
    
    def test_face_login_best_match(self):
        """가장 유사한 사용자와 매칭되는지 테스트"""
        # user1과 user2의 중간 벡터 (둘 중 하나와 매칭되어야 함)
        middle_vector = [0.15] * 512
        
        data = {
            'face_vector': middle_vector
        }
        
        response = self.client.post(
            '/api/login/face/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        # 코사인 유사도가 더 높은 사용자와 매칭되어야 함
        self.assertIn(response.json()['login_id'], ['faceuser1', 'faceuser2'])


class GMSKeyTestCase(TestCase):
    """GMS 키 조회 API 테스트"""
    
    def setUp(self):
        """테스트 초기 설정"""
        self.client = Client()
    
    @override_settings(GMS_API_KEY='test_gms_key_12345')
    def test_get_gms_key_success(self):
        """GMS 키 조회 성공 테스트"""
        response = self.client.get('/api/gms/key/')
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertEqual(response.json()['gms_key'], 'test_gms_key_12345')
    
    @override_settings(GMS_API_KEY='')
    def test_get_gms_key_not_set(self):
        """GMS 키 미설정 테스트"""
        response = self.client.get('/api/gms/key/')
        
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()['success'], False)
        self.assertEqual(response.json()['message'], 'GMS API 키가 설정되지 않았습니다.')


class BiometricUploadTestCase(TestCase):
    """생체 정보 업로드 테스트 (음성 파일 선택사항)"""
    
    def setUp(self):
        """테스트 초기 설정"""
        self.client = Client()
    
    def create_temp_image(self):
        """테스트용 이미지 파일 생성 (PIL 없이)"""
        # 간단한 JPEG 헤더 생성
        jpeg_header = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
        jpeg_data = jpeg_header + b'\x00' * 1000  # 나머지는 빈 데이터
        img_file = BytesIO(jpeg_data)
        img_file.name = 'test.jpg'
        img_file.content_type = 'image/jpeg'
        return img_file
    
    def test_upload_biometric_with_voice(self):
        """얼굴 이미지 + 음성 파일 업로드 성공 테스트"""
        face_image = self.create_temp_image()
        
        # 음성 파일 생성
        voice_file = BytesIO(b'test voice data')
        
        # mock requests.post로 Jetson 응답 시뮬레이션
        from unittest.mock import patch
        mock_response = type('Response', (), {'status_code': 200})()
        
        with patch('accounts.views.requests.post', return_value=mock_response):
            response = self.client.post(
                '/api/biometric/upload/',
                data={
                    'face_image': face_image,
                    'voice_file': voice_file
                },
                format='multipart'
            )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertEqual(response.json()['has_voice'], True)
    
    def test_upload_biometric_without_voice(self):
        """얼굴 이미지만 업로드 성공 테스트"""
        face_image = self.create_temp_image()
        
        # mock requests.post로 Jetson 응답 시뮬레이션
        from unittest.mock import patch
        mock_response = type('Response', (), {'status_code': 200})()
        
        with patch('accounts.views.requests.post', return_value=mock_response):
            response = self.client.post(
                '/api/biometric/upload/',
                data={
                    'face_image': face_image
                },
                format='multipart'
            )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertEqual(response.json()['has_voice'], False)
    
    def test_upload_biometric_missing_face(self):
        """얼굴 이미지 누락 테스트"""
        voice_file = BytesIO(b'test voice data')
        
        response = self.client.post(
            '/api/biometric/upload/',
            data={
                'voice_file': voice_file
            },
            format='multipart'
        )
        
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['success'], False)
        self.assertIn('face_image는 필수입니다.', response.json()['message'])


class UserProfileWithVoiceTestCase(TestCase):
    """사용자 프로필 테스트 (음성 정보 유무)"""
    
    def setUp(self):
        """테스트 초기 설정"""
        self.client = Client()
        # 음성 벡터 있는 사용자
        self.user_with_voice = User.objects.create_user(
            login_id='voiceuser',
            email='voice@example.com',
            nickname='음성사용자',
            password='Test1234!'
        )
        self.user_with_voice.voice_vectors = [0.1] * 256
        self.user_with_voice.save()
        
        # 음성 벡터 없는 사용자
        self.user_without_voice = User.objects.create_user(
            login_id='novoiceuser',
            email='novoice@example.com',
            nickname='무음성사용자',
            password='Test1234!'
        )
        self.user_without_voice.voice_vectors = None
        self.user_without_voice.save()
        
        # 토큰 생성
        self.refresh = RefreshToken.for_user(self.user_with_voice)
        self.access_token = str(self.refresh.access_token)
    
    def test_get_user_profile_with_voice(self):
        """음성 벡터 있는 사용자 프로필 조회 테스트"""
        refresh = RefreshToken.for_user(self.user_with_voice)
        access_token = str(refresh.access_token)
        
        response = self.client.get(
            '/api/user/profile/',
            HTTP_AUTHORIZATION=f'Bearer {access_token}'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertEqual(response.json()['user']['has_voice'], True)
    
    def test_get_user_profile_without_voice(self):
        """음성 벡터 없는 사용자 프로필 조회 테스트"""
        refresh = RefreshToken.for_user(self.user_without_voice)
        access_token = str(refresh.access_token)
        
        response = self.client.get(
            '/api/user/profile/',
            HTTP_AUTHORIZATION=f'Bearer {access_token}'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['success'], True)
        self.assertEqual(response.json()['user']['has_voice'], False)
