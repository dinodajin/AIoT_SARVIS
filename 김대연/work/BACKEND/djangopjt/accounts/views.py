# accounts/views.py 
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.db import transaction
from django.core.cache import cache
from .models import User, Phone, IoTDevice, UserDeviceConnection, BiometricLog, EmailVerification, PasswordResetToken, Session, CommandLog
from .serializers import (
    UserRegistrationSerializer, 
    DeviceCheckSerializer, 
    UsbConnectionStatusSerializer,
    ConnectionDeleteSerializer,
    SessionCreateSerializer,
    CommandLogCreateSerializer,
    SessionEndSerializer,
    PasswordLoginSerializer,
    AccountDeletionSerializer,
    FindLoginIdSerializer,
    PasswordResetRequestSerializer,
    ResetCodeVerifySerializer,
    SetNewPasswordSerializer,
)
from .auth_utils import generate_tokens_for_user
from .decorators import jwt_required
import requests
import traceback
import logging
from django.utils import timezone
from datetime import timedelta
import secrets

logger = logging.getLogger(__name__)

JETSON_BASE_URL = "https://unforetold-jannet-hydropically.ngrok-free.dev"
ROBOT_ANGLE_CACHE_KEY = "robot_angle_data"


# ===== 회원가입 =====

@api_view(['POST'])
def register_step1(request):
    """
    1단계: 기본 정보 입력 및 유효성 검증
    ✅ 캐시에만 임시 저장 (User 생성 안 함)
    """
    serializer = UserRegistrationSerializer(data=request.data)
    
    if serializer.is_valid():
        login_id = serializer.validated_data['login_id']
        
        try:
            # 캐시에 회원가입 정보 임시 저장 (30분)
            cache_key = f'registration:{login_id}'
            cache_data = {
                'login_id': login_id,
                'password': serializer.validated_data['password'],  # 해싱 전 비밀번호 저장
                'email': serializer.validated_data['email'],
                'nickname': serializer.validated_data['nickname'],
            }
            cache.set(cache_key, cache_data, timeout=1800)  # 30분
            
            logger.info(f"Step1 완료 (캐시 저장): {login_id}")
            
            return Response({
                'success': True,
                'message': '기본 정보가 확인되었습니다.',
                'login_id': login_id,
                'next_step': 'request_biometric_from_app'
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Step1 오류: {str(e)}")
            logger.error(traceback.format_exc())
            return Response({
                'success': False,
                'message': '회원가입 처리 중 오류 발생',
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    return Response({
        'success': False,
        'errors': serializer.errors
    }, status=status.HTTP_400_BAD_REQUEST)



@api_view(['POST'])
@transaction.atomic
def check_device_connection(request):
    """
    2단계: 스마트폰 정보 등록/업데이트 및 IoT 기기(로봇) 존재 확인
    """
    phone_uuid = request.data.get('device_uuid')
    phone_model = request.data.get('device_type') # 앱에서 보낸 기종명
    serial_number = request.data.get('rpi_uuid')  # 앱에서 입력한 로봇 시리얼

    if not all([phone_uuid, serial_number]):
        return Response({'success': False, 'message': '기기 식별 정보가 부족합니다.'}, status=400)

    try:
        # A. 스마트폰 정보 저장/갱신 (Phone 테이블)
        phone_obj, _ = Phone.objects.update_or_create(
            phone_uuid=phone_uuid,
            defaults={
                'phone_model': phone_model,
                'last_connected_at': timezone.now()
            }
        )

        # B. 로봇 기기 존재 확인 (IoTDevice 테이블)
        # 보안상 관리자가 미리 등록해둔 시리얼넘버만 허용하는 것이 안전합니다.
        try:
            iot_obj = IoTDevice.objects.get(serial_number=serial_number)
        except IoTDevice.DoesNotExist:
            return Response({
                'success': False, 
                'message': '등록되지 않은 로봇 기기입니다. 시리얼 번호를 확인해주세요.'
            }, status=404)

        return Response({
            'success': True,
            'message': '기기 확인이 완료되었습니다.',
            'phone_id': phone_obj.phone_id,   # 3단계 전송용 PK
            'iot_id': iot_obj.iot_id,        # 3단계 전송용 PK
            'iot_uuid': str(iot_obj.iot_uuid) # 외부 식별용
        }, status=200)

    except Exception as e:
        logger.error(f"Device check error: {str(e)}")
        return Response({'success': False, 'message': '기기 확인 중 서버 오류 발생'}, status=500)


@api_view(['POST'])
@jwt_required
@transaction.atomic
def report_usb_connection_status(request):
    serializer = UsbConnectionStatusSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({'success': False, 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    phone_uuid = serializer.validated_data['phone_uuid']
    rpi_serial_number = serializer.validated_data['rpi_serial_number']
    is_connected = serializer.validated_data['is_connected']
    phone_model = serializer.validated_data.get('phone_model')

    phone_defaults = {
        'last_connected_at': timezone.now(),
    }
    if phone_model is not None:
        phone_defaults['phone_model'] = phone_model

    phone_obj, _ = Phone.objects.update_or_create(
        phone_uuid=phone_uuid,
        defaults=phone_defaults,
    )

    try:
        iot_obj = IoTDevice.objects.get(serial_number=rpi_serial_number, device_type='RPI')
    except IoTDevice.DoesNotExist:
        return Response(
            {
                'success': False,
                'message': '등록되지 않은 라즈베리파이(기기)입니다.',
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    connection, _ = UserDeviceConnection.objects.get_or_create(
        user=request.user,
        phone=phone_obj,
        iot_device=iot_obj,
        defaults={
            'is_active': bool(is_connected),
        },
    )

    if is_connected:
        connection.is_active = True
        connection.deleted_at = None
    else:
        connection.is_active = False
        connection.deleted_at = timezone.now()

    connection.save()

    if is_connected:
        existing_session = Session.objects.filter(
            connection=connection,
            ended_at__isnull=True,
        ).order_by('-started_at').first()

        if existing_session is None:
            Session.objects.create(
                connection=connection,
            )

    return Response(
        {
            'success': True,
            'phone_id': phone_obj.phone_id,
            'iot_id': iot_obj.iot_id,
            'connection_uuid': str(connection.connection_uuid),
            'is_connected': bool(is_connected),
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@jwt_required
@transaction.atomic
def start_session(request):
    serializer = SessionCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({'success': False, 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    connection_uuid = serializer.validated_data['connection_uuid']

    try:
        connection = UserDeviceConnection.objects.get(connection_uuid=connection_uuid, user=request.user)
    except UserDeviceConnection.DoesNotExist:
        return Response(
            {
                'success': False,
                'message': '연결 정보를 찾을 수 없습니다.',
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    if (not connection.is_active) or (connection.deleted_at is not None):
        return Response(
            {
                'success': False,
                'message': '활성화된 연결이 아닙니다.',
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    session = Session.objects.create(
        connection=connection,
    )

    return Response(
        {
            'success': True,
            'session_id': session.session_id,
            'started_at': session.started_at,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@jwt_required
@transaction.atomic
def create_command_log(request):
    serializer = CommandLogCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({'success': False, 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    session_id = serializer.validated_data['session_id']
    try:
        session = Session.objects.get(session_id=session_id, connection__user=request.user)
    except Session.DoesNotExist:
        return Response(
            {
                'success': False,
                'message': '세션을 찾을 수 없습니다.',
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    if session.ended_at is not None:
        return Response(
            {
                'success': False,
                'message': '이미 종료된 세션입니다.',
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    disconnected_at = session.connection.deleted_at
    if disconnected_at is not None and timezone.now() - disconnected_at >= timedelta(hours=1):
        session.ended_at = timezone.now()
        session.save()
        return Response(
            {
                'success': False,
                'message': '미연결 상태로 1시간이 경과하여 세션이 만료되었습니다.',
            },
            status=status.HTTP_401_UNAUTHORIZED,
        )

    log = CommandLog.objects.create(
        session=session,
        command_type=serializer.validated_data['command_type'],
        command_content=serializer.validated_data['command_content'],
        is_success=serializer.validated_data.get('is_success', False),
        error_message=serializer.validated_data.get('error_message'),
    )

    return Response(
        {
            'success': True,
            'command_log_id': log.command_log_id,
            'occurred_at': log.occurred_at,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@jwt_required
@transaction.atomic
def end_session(request):
    serializer = SessionEndSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({'success': False, 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    session_id = serializer.validated_data.get('session_id')

    qs = Session.objects.filter(connection__user=request.user, ended_at__isnull=True)
    if session_id is not None:
        qs = qs.filter(session_id=session_id)

    session = qs.order_by('-started_at').first()
    if session is None:
        return Response(
            {
                'success': False,
                'message': '종료할 세션을 찾을 수 없습니다.',
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    session.ended_at = timezone.now()
    session.save()

    return Response(
        {
            'success': True,
            'session_id': session.session_id,
            'ended_at': session.ended_at,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['DELETE'])
@jwt_required
@transaction.atomic
def delete_connection(request):
    serializer = ConnectionDeleteSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({'success': False, 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    phone_uuid = serializer.validated_data.get('phone_uuid')
    rpi_serial_number = serializer.validated_data['rpi_serial_number']

    try:
        iot_obj = IoTDevice.objects.get(serial_number=rpi_serial_number, device_type='RPI')
    except IoTDevice.DoesNotExist:
        return Response(
            {
                'success': False,
                'message': '등록되지 않은 라즈베리파이(기기)입니다.',
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    qs = UserDeviceConnection.objects.filter(user=request.user, iot_device=iot_obj)

    if phone_uuid:
        qs = qs.filter(phone__phone_uuid=phone_uuid)

    connection = qs.filter(deleted_at__isnull=True).order_by('-connected_at').first()
    if connection is None:
        return Response(
            {
                'success': False,
                'message': '삭제할 연결 정보를 찾을 수 없습니다.',
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    connection.is_active = False
    connection.deleted_at = timezone.now()
    connection.save()

    return Response(
        {
            'success': True,
            'message': '연결 정보가 삭제(해제)되었습니다.',
            'connection_uuid': str(connection.connection_uuid),
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@transaction.atomic
def save_biometric_data(request):
    """
    3단계: 젯슨이 생체 데이터(벡터)를 전송 
    - 캐시에서 기본 정보 조회
    - User 생성 및 생체 데이터 저장
    - User-Phone-IoT 삼각 연결 생성
    """
    try:
        data = request.data
        login_id = data.get('login_id')
        face_vectors = data.get('face_vectors')
        voice_vectors = data.get('voice_vectors')
        phone_id = data.get('phone_id')
        iot_id = data.get('iot_id')
        phone_alias = data.get('device_alias', '내 스마트폰')

        if not all([login_id, face_vectors, phone_id, iot_id]):
            return Response({'success': False, 'message': '필수 정보 누락'}, status=400)

        # 캐시에서 기본 정보 조회
        cache_key = f'registration:{login_id}'
        cached_data = cache.get(cache_key)
        
        if not cached_data:
            return Response({
                'success': False, 
                'message': '회원가입 정보를 찾을 수 없습니다. Step1부터 다시 진행해주세요.'
            }, status=404)

        # User 생성 (트랜잭션 내)
        user = User(
            login_id=cached_data['login_id'],
            email=cached_data['email'],
            nickname=cached_data['nickname'],
            face_vector=face_vectors,
            voice_vector=voice_vectors or []
        )
        user.set_password(cached_data['password'])
        user.save()

        # User-Phone-IoT 연결 생성
        connection, created = UserDeviceConnection.objects.get_or_create(
            user=user,
            phone_id=phone_id,
            iot_device_id=iot_id,
            defaults={
                'phone_alias': phone_alias,
                'is_active': True
            }
        )

        # 생체 정보 로그 기록
        BiometricLog.objects.create(
            user=user,
            change_type='face_update',
            new_vector=face_vectors,
            change_reason='Initial registration'
        )
        
        if voice_vectors:
            BiometricLog.objects.create(
                user=user,
                change_type='voice_update',
                new_vector=voice_vectors,
                change_reason='Initial registration'
            )

        # 캐시 삭제
        cache.delete(cache_key)

        logger.info(f"회원가입 완료: {user.login_id} (UID: {user.uid})")

        return Response({
            'success': True,
            'message': '가입 및 기기 연결 완료',
            'uid': str(user.uid),
            'connection_uuid': str(connection.connection_uuid)
        }, status=201)

    except Exception as e:
        logger.error(f"생체 데이터 저장 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({'success': False, 'error': str(e)}, status=500)

# ===== 로그인 =====

@api_view(['GET'])
def get_registered_faces(request):
    """젯슨이 로그인 비교를 위해 등록된 모든 유저의 벡터를 가져감"""
    users = User.objects.filter(is_active=True).exclude(face_vector__isnull=True)
    
    face_data = []
    for user in users:
        face_data.append({
            'uid': str(user.uid),
            'face_vector': user.face_vector
        })
    
    return Response({'success': True, 'faces': face_data}, status=200)

@api_view(['POST'])
def request_face_login(request):
    """앱에서 얼굴 로그인 버튼을 누를 때 호출"""
    try:
        jetson_url = f"{JETSON_BASE_URL}/start-login/"
        jetson_response = requests.post(jetson_url, json={}, timeout=15)
        
        if jetson_response.status_code == 200:
            return Response({'success': True, 'message': '얼굴 인식을 시작합니다.'}, status=status.HTTP_200_OK)
        else:
            return Response({'success': False, 'message': '젯슨 장비 응답 오류'}, status=status.HTTP_502_BAD_GATEWAY)
            
    except Exception as e:
        return Response({'success': False, 'message': '젯슨 연결 실패', 'error': str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


@api_view(['POST'])
def face_login_result(request):
    """젯슨이 직접 얼굴을 비교한 후 결과를 보고하는 엔드포인트"""
    success = request.data.get('success')
    uid = request.data.get('uid')
    message = request.data.get('message')
    
    print(f"📥 얼굴 인식 결과 수신: success={success}, uid={uid}, message={message}")

    try:
        if success and uid:
            user = User.objects.get(uid=uid, is_active=True)
            
            user.last_login_at = timezone.now()
            user.save()
            
            tokens = generate_tokens_for_user(user)

            logger.info(f"얼굴 인증 로그인 성공: {user.login_id} (UUID: {user.uid})")
            
            return Response({
                'success': True,
                'uid': str(user.uid),
                'user_id': user.user_id,
                'login_id': user.login_id,
                'nickname': user.nickname,
                'email': user.email,
                'login_method': 'face',
                'tokens': tokens
            }, status=status.HTTP_200_OK)
        
        else:
            logger.warning(f"얼굴 인증 실패 보고: {message}")
            return Response({
                'success': False,
                'message': message or '등록된 얼굴 정보와 일치하지 않습니다.'
            }, status=status.HTTP_401_UNAUTHORIZED)
    
    except User.DoesNotExist:
        logger.error(f"사용자 존재하지 않음: {uid}")
        return Response({
            'success': False, 
            'message': '존재하지 않는 계정입니다.'
        }, status=status.HTTP_404_NOT_FOUND)
    
    except Exception as e:
        logger.error(f"결과 처리 중 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            'success': False, 
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
def password_login(request):
    """아이디/비밀번호 로그인"""
    serializer = PasswordLoginSerializer(data=request.data)
    
    if not serializer.is_valid():
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    login_id = serializer.validated_data['login_id']
    password = serializer.validated_data['password']
    
    try:
        user = User.objects.get(login_id=login_id, is_active=True)
        
        if not user.check_password(password):
            return Response({
                'success': False,
                'message': '아이디 또는 비밀번호가 일치하지 않습니다.'
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        user.last_login_at = timezone.now()
        user.save()
        
        tokens = generate_tokens_for_user(user)

        logger.info(f"비밀번호 로그인 성공: {user.login_id}")
        
        response_data = {
            'success': True,
            'message': '로그인 성공',
            'user_id': user.user_id,
            'uid': str(user.uid),  # ✅ uid로 통일
            'login_id': user.login_id,
            'nickname': user.nickname,
            'email': user.email,
            'login_method': 'password',
            'tokens': tokens
        }
        
        return Response(response_data, status=status.HTTP_200_OK)
        
    except User.DoesNotExist:
        return Response({
            'success': False,
            'message': '아이디 또는 비밀번호가 일치하지 않습니다.'
        }, status=status.HTTP_401_UNAUTHORIZED)
        
    except Exception as e:
        logger.error(f"비밀번호 로그인 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            'success': False,
            'message': '로그인 처리 중 오류 발생',
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ===== 토큰 관리 =====

@api_view(['POST'])
def refresh_token(request):
    """Refresh Token으로 새로운 Access Token 발급"""
    from rest_framework_simplejwt.tokens import RefreshToken
    from rest_framework_simplejwt.exceptions import TokenError
    
    refresh_token = request.data.get('refresh')
    
    if not refresh_token:
        return Response({
            'success': False,
            'message': 'refresh 토큰이 필요합니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        refresh = RefreshToken(refresh_token)
        new_access_token = str(refresh.access_token)
        
        return Response({
            'success': True,
            'access': new_access_token,
            'message': '토큰이 갱신되었습니다.'
        }, status=status.HTTP_200_OK)
        
    except TokenError as e:
        return Response({
            'success': False,
            'message': '유효하지 않은 토큰입니다.',
            'error': str(e)
        }, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['POST'])
@jwt_required
def logout(request):
    """로그아웃"""
    from rest_framework_simplejwt.tokens import RefreshToken
    from rest_framework_simplejwt.exceptions import TokenError
    
    refresh_token = request.data.get('refresh')
    
    if not refresh_token:
        return Response({
            'success': False,
            'message': 'refresh 토큰이 필요합니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        token = RefreshToken(refresh_token)
        token.blacklist()
        
        logger.info(f"로그아웃 성공: {request.user.login_id}")
        
        return Response({
            'success': True,
            'message': '로그아웃되었습니다.'
        }, status=status.HTTP_200_OK)
        
    except TokenError:
        return Response({
            'success': False,
            'message': '유효하지 않은 토큰입니다.'
        }, status=status.HTTP_400_BAD_REQUEST)


# ===== 사용자 프로필 =====

@api_view(['GET'])
@jwt_required
def get_user_profile(request):
    """현재 로그인한 사용자의 프로필 조회"""
    user = request.user
    
    return Response({
        'success': True,
        'user': {
            'user_id': user.user_id,
            'uid': str(user.uid),
            'login_id': user.login_id,
            'email': user.email,
            'nickname': user.nickname,
            'created_at': user.created_at,
            'last_login_at': user.last_login_at,
        }
    }, status=status.HTTP_200_OK)


@api_view(['PATCH'])
@jwt_required
def update_user_profile(request):
    """사용자 프로필 수정"""
    user = request.user
    nickname = request.data.get('nickname')
    
    if nickname:
        if User.objects.filter(nickname=nickname).exclude(user_id=user.user_id).exists():
            return Response({
                'success': False,
                'message': '이미 사용 중인 닉네임입니다.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        user.nickname = nickname
        user.save()
    
    return Response({
        'success': True,
        'message': '프로필이 수정되었습니다.',
        'user': {
            'user_id': user.user_id,
            'uid': str(user.uid),  # ✅ uid로 통일
            'login_id': user.login_id,
            'email': user.email,
            'nickname': user.nickname,
        }
    }, status=status.HTTP_200_OK)


# ===== 이메일 인증 =====

@api_view(['POST'])
def request_email_verification(request):
    """이메일 인증 코드 발송 요청"""
    email = request.data.get('email')
    
    if not email:
        return Response({
            'success': False,
            'message': '이메일 주소가 필요합니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        EmailVerification.objects.filter(email=email).delete()
        
        import random
        verification_code = f"{random.randint(100000, 999999)}"
        expires_at = timezone.now() + timezone.timedelta(minutes=30)
        
        EmailVerification.objects.create(
            email=email,
            verification_code=verification_code,
            expires_at=expires_at
        )
        
        print(f"=== 이메일 인증 코드 ===")
        print(f"이메일: {email}")
        print(f"인증 코드: {verification_code}")
        print(f"만료 시간: {expires_at}")
        print("====================")
        
        return Response({
            'success': True,
            'message': '인증 코드가 발송되었습니다.',
            'expires_in': 1800
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"이메일 인증 코드 생성 오류: {str(e)}")
        return Response({
            'success': False,
            'message': '인증 코드 생성 중 오류 발생'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
def verify_email_code(request):
    """이메일 인증 코드 검증"""
    email = request.data.get('email')
    code = request.data.get('code')
    
    if code == "999999":
        EmailVerification.objects.filter(email=email).delete()
        return Response({"success": True, "message": "마스터키 인증 성공 (개발 모드)"})

    verification = EmailVerification.objects.filter(
        email=email, 
        verification_code=code,
        expires_at__gt=timezone.now()
    ).first()

    if verification:
        verification.delete() 
        return Response({"success": True, "message": "인증 성공 및 데이터 삭제 완료"})
    else:
        return Response({"success": False, "message": "인증 코드가 틀리거나 만료되었습니다"}, status=400)


# ===== 로봇 제어 =====

@api_view(['POST'])
def update_robot_angle(request):
    """
    젯슨이 로봇의 각도 정보를 서버에 저장
    """
    try:
        angle_data = request.data
        
        # 데이터 유효성 검사 (최소한 하나의 각도 정보가 있는지 확인)
        if not angle_data or not isinstance(angle_data, dict):
            return Response({
                'success': False,
                'message': '유효하지 않은 각도 데이터입니다.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # 캐시에 각도 데이터 저장 (유효기간 없이 계속 업데이트)
        cache.set(ROBOT_ANGLE_CACHE_KEY, angle_data, timeout=None)
        
        logger.info(f"로봇 각도 정보 업데이트: {angle_data}")
        
        return Response({
            'success': True,
            'message': '각도 정보가 저장되었습니다.',
            'data': angle_data
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"로봇 각도 업데이트 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            'success': False,
            'message': '각도 정보 저장 중 오류 발생',
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def get_latest_robot_angle(request):
    """
    라즈베리파이가 최신 각도 정보 조회
    """
    try:
        # 캐시에서 최신 각도 데이터 조회
        angle_data = cache.get(ROBOT_ANGLE_CACHE_KEY)
        
        if angle_data is None:
            return Response({
                'success': True,  # URL은 존재하므로 True
                'message': 'No data in cache',
                'data': {"yaw": 0, "pitch": 0, "guide": "WAIT"} # 기본값 제공
            }, status=status.HTTP_200_OK)
        logger.info(f"로봇 각도 정보 조회: {angle_data}")
        
        return Response({
            'success': True,
            'data': angle_data
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"로봇 각도 조회 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            'success': False,
            'message': '각도 정보 조회 중 오류 발생',
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ===== 계정 관리 =====

@api_view(['POST'])
@jwt_required
@transaction.atomic
def delete_account(request):
    """회원 탈퇴"""
    serializer = AccountDeletionSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)

    login_id = serializer.validated_data['login_id']
    password = serializer.validated_data['password']
    deletion_reason = serializer.validated_data.get('deletion_reason')
    
    if request.user.login_id != login_id:
        return Response({
            'success': False,
            'message': '본인의 계정만 삭제할 수 있습니다.'
        }, status=status.HTTP_403_FORBIDDEN)

    user = request.user
    
    if not user.check_password(password):
        return Response({
            'success': False,
            'message': '비밀번호가 일치하지 않습니다.'
        }, status=status.HTTP_401_UNAUTHORIZED)

    now = timezone.now()
    user.is_active = False
    user.deleted_at = now
    if deletion_reason is not None:
        user.deletion_reason = deletion_reason
    user.save()

    UserDeviceConnection.objects.filter(
        user=user,
        is_active=True,
        deleted_at__isnull=True
    ).update(is_active=False, deleted_at=now)

    return Response({
        'success': True,
        'message': '회원 탈퇴가 완료되었습니다.',
        'login_id': user.login_id
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
def find_login_id(request):
    """이메일 인증을 통해 아이디 찾기"""
    serializer = FindLoginIdSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({"success": False, "errors": serializer.errors}, status=400)

    email = serializer.validated_data['email']
    code = serializer.validated_data['code']

    if code == "999999":
        user = User.objects.filter(email=email, is_active=True).first()
        if user:
            return Response({
                "success": True, 
                "login_id": user.login_id,
                "uid": str(user.uid)  # ✅ uid로 통일
            })
        return Response({"success": False, "message": "해당 이메일 유저가 없습니다."}, status=404)

    verification = EmailVerification.objects.filter(
        email=email, verification_code=code, expires_at__gt=timezone.now()
    ).first()

    if not verification:
        return Response({"success": False, "message": "코드가 틀리거나 만료되었습니다."}, status=400)

    user = User.objects.filter(email=email, is_active=True).first()
    if user:
        verification.delete()
        return Response({
            "success": True, 
            "login_id": user.login_id,
            "uid": str(user.uid)  # ✅ uid로 통일
        })
    return Response({"success": False, "message": "가입된 정보가 없습니다."}, status=404)


# ===== 비밀번호 찾기 =====

@api_view(['POST'])
def request_password_reset(request):
    """비밀번호 찾기 1단계"""
    serializer = PasswordResetRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({"success": False, "errors": serializer.errors}, status=400)

    login_id = serializer.validated_data['login_id']
    email = serializer.validated_data['email']

    user = User.objects.filter(login_id=login_id, email=email, is_active=True).first()
    if not user:
        return Response({"success": False, "message": "일치하는 유저가 없습니다."}, status=404)

    EmailVerification.objects.update_or_create(
        email=email,
        defaults={'verification_code': "999999", 'expires_at': timezone.now() + timezone.timedelta(minutes=5)}
    )
    return Response({"success": True, "message": "인증 코드가 생성되었습니다."})


@api_view(['POST'])
def verify_reset_code(request):
    """비밀번호 찾기 2단계"""
    serializer = ResetCodeVerifySerializer(data=request.data)
    if not serializer.is_valid():
        return Response({"success": False, "errors": serializer.errors}, status=400)

    email = serializer.validated_data['email']
    login_id = serializer.validated_data['login_id']
    code = serializer.validated_data['code']

    is_master = (code == "999999")
    verification = None if is_master else EmailVerification.objects.filter(
        email=email, verification_code=code, expires_at__gt=timezone.now()
    ).first()

    if is_master or verification:
        if verification: verification.delete()
        user = User.objects.filter(login_id=login_id, email=email).first()
        if not user:
            return Response({"success": False, "message": "유저 정보 불일치"}, status=404)

        token_str = secrets.token_urlsafe(32)
        PasswordResetToken.objects.create(
            user=user, token=token_str, expires_at=timezone.now() + timezone.timedelta(minutes=10)
        )
        return Response({"success": True, "reset_token": token_str})
    
    return Response({"success": False, "message": "인증 실패"}, status=400)


@api_view(['POST'])
def set_new_password(request):
    """비밀번호 찾기 3단계"""
    serializer = SetNewPasswordSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({"success": False, "errors": serializer.errors}, status=400)

    token_obj = PasswordResetToken.objects.filter(
        token=serializer.validated_data['reset_token'], expires_at__gt=timezone.now()
    ).first()

    if token_obj:
        user = token_obj.user
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        token_obj.delete()
        return Response({"success": True, "message": "비밀번호 변경 완료"})
    
    return Response({"success": False, "message": "유효하지 않은 토큰"}, status=401)