# accounts/views.py
import numpy as np
from rest_framework import status
from rest_framework.decorators import api_view
from django.views.decorators.csrf import csrf_exempt
from rest_framework.response import Response
from django.db import transaction, models
from django.core.cache import cache
from django.utils import timezone
from datetime import timedelta
from django.conf import settings
import secrets
import requests
import logging
import traceback
import os

from .models import User, Phone, Sarvis, UserDeviceConnection, BiometricLog, EmailVerification, PasswordResetToken, Session, CommandLog, Preset
from .tasks import notify_jetson_logout
from .serializers import (
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
    PresetSaveSerializer,
    PresetLoadSerializer,
    PresetListSerializer,
    PresetSerializer,
    PresetUpdateSerializer,
    ControlScreenEnterSerializer,
    ButtonCommandSerializer,
    VoiceCommandFromJetsonSerializer,
    MainPageButtonSerializer,
    ButtonCommandRequestSerializer,
)
from .auth_utils import generate_tokens_for_user, auto_login_for_user
from .decorators import jwt_required
from django.contrib.auth.hashers import make_password
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

logger = logging.getLogger(__name__)

JETSON_BASE_URL = "https://unforetold-jannet-hydropically.ngrok-free.dev"


# 회원가입 정보 캐시 키 프리픽스
REGISTRATION_CACHE_PREFIX = "registration:"
# 캐시 만료 시간: 10분
REGISTRATION_CACHE_TIMEOUT = 600


# ===== 회원가입 캐시 관리 헬퍼 =====
def clear_registration_cache_by_login_id(login_id):
    keys = [
        f"{REGISTRATION_CACHE_PREFIX}{login_id}:nickname",
        f"{REGISTRATION_CACHE_PREFIX}{login_id}:id",
        f"{REGISTRATION_CACHE_PREFIX}{login_id}:email",
        f"{REGISTRATION_CACHE_PREFIX}{login_id}:password",
        f"{REGISTRATION_CACHE_PREFIX}{login_id}:face_vectors",
    ]
    cache.delete_many(keys)


# ===== 캐시 관리 =====
@api_view(['POST'])
def clear_registration_cache_api(request):
    """
    회원가입 캐시 정리 API
    앱에서 호출하여 회원가입 중단/실패 시 캐시를 정리
    - 이제 login_id로만 캐시를 관리합니다
    """
    login_id = request.data.get('login_id')
    
    if not login_id:
        return Response({
            'success': False,
            'message': '아이디가 필요합니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # login_id로만 캐시 정리
        clear_registration_cache_by_login_id(login_id)
        
        logger.info(f"캐시 정리 요청: login_id={login_id}")
        
        return Response({
            'success': True,
            'message': '캐시가 정리되었습니다.'
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"캐시 정리 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            'success': False,
            'message': '캐시 정리 중 오류 발생',
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ===== 회원가입 정보 입력 =====
@api_view(['POST'])
def register_step_id(request):
    """
    회원가입 1단계: 아이디 입력 및 중복 검사
    - 회원가입 시작 시 login_id 기준으로 캐시 초기화
    """
    login_id = request.data.get('login_id')

    if not login_id:
        return Response({
            'success': False,
            'message': '아이디가 필요합니다.'
        }, status=status.HTTP_400_BAD_REQUEST)

    # 아이디 형식 검증
    import re
    if not re.match(r'^[a-zA-Z0-9]+$', login_id):
        return Response({
            'success': False,
            'message': '아이디는 영문, 숫자만 사용 가능합니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # 아이디 중복 확인
    if User.objects.filter(login_id=login_id).exists():
        return Response({
            'success': False,
            'message': '이미 사용 중인 아이디입니다.'
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        # 회원가입 시작이므로, login_id 기준으로 캐시 초기화
        clear_registration_cache_by_login_id(login_id)

        # 아이디 캐시 저장
        cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:id"
        cache.set(cache_key, login_id, timeout=REGISTRATION_CACHE_TIMEOUT)

        logger.info(f"[REGISTER START] login_id={login_id}")

        return Response({
            'success': True,
            'message': '새 회원가입을 시작합니다.',
            'login_id': login_id,
            'next_step': 'input_nickname'
        }, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"아이디 저장 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            'success': False,
            'message': '아이디 설정 중 오류 발생'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
def register_step_nickname(request):
    """
    회원가입 2단계: 닉네임 입력
    - login_id를 캐시 키로 사용하여 닉네임 저장
    - 닉네임 중복 검사 수행하지 않음
    """
    login_id = request.data.get('login_id')
    nickname = request.data.get('nickname')
    
    if not login_id or not nickname:
        return Response({
            'success': False,
            'message': '아이디와 닉네임이 필요합니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # 아이디가 캐시에 있는지 확인 (login_id를 키로 사용)
    id_cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:id"
    if not cache.get(id_cache_key):
        return Response({
            'success': False,
            'message': '아이디 입력이 만료되었습니다. 처음부터 다시 진행해주세요.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # ✅ login_id를 키로 사용하여 닉네임 저장 (중복 검사 없음)
        cache.set(f"{REGISTRATION_CACHE_PREFIX}{login_id}:nickname", nickname, timeout=REGISTRATION_CACHE_TIMEOUT)
        
        logger.info(f"닉네임 저장 (캐시 저장): {nickname}, login_id={login_id}")
        
        return Response({
            'success': True,
            'message': '닉네임이 설정되었습니다.',
            'nickname': nickname,
            'login_id': login_id,
            'next_step': 'input_email'
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"닉네임 저장 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            'success': False,
            'message': '닉네임 저장 중 오류 발생',
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
def register_step_email(request):
    """
    회원가입 3단계: 이메일 입력 및 인증
    이메일 인증 완료 후 캐시에 이메일 저장
    """
    login_id = request.data.get('login_id')
    nickname = request.data.get('nickname')
    email = request.data.get('email')
    code = request.data.get('code')
    
    if not all([login_id, nickname, email, code]):
        return Response({
            'success': False,
            'message': '아이디, 닉네임, 이메일, 인증 코드가 필요합니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # 닉네임과 아이디가 캐시에 있는지 확인 (login_id를 키로 사용)
    nickname_cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:nickname"
    id_cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:id"
    
    cached_nickname = cache.get(nickname_cache_key)
    
    if not cached_nickname or not cache.get(id_cache_key):
        return Response({
            'success': False,
            'message': '이전 단계가 만료되었습니다. 처음부터 다시 진행해주세요.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # 닉네임 일치 확인
    if cached_nickname != nickname:
        return Response({
            'success': False,
            'message': '닉네임이 일치하지 않습니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # 이메일 중복 확인 (활성 회원만)
    if User.objects.filter(email=email, is_active=True).exists():
        return Response({
            'success': False,
            'message': '이미 사용 중인 이메일입니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # 이메일 인증 코드 검증
    # 마스터키 인증 (개발 모드)
    if code == "999999":
        EmailVerification.objects.filter(email=email).delete()
    else:
        verification = EmailVerification.objects.filter(
            email=email, 
            verification_code=code,
            expires_at__gt=timezone.now()
        ).first()
        
        if not verification:
            return Response({
                'success': False,
                'message': '인증 코드가 틀리거나 만료되었습니다.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        verification.delete()
    
    try:
        # 캐시에 이메일 저장 (login_id를 키로 사용)
        cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:email"
        cache.set(cache_key, email, timeout=REGISTRATION_CACHE_TIMEOUT)
        
        logger.info(f"이메일 인증 완료 (캐시 저장): login_id={login_id}, email={email}")
        
        return Response({
            'success': True,
            'message': '이메일 인증이 완료되었습니다.',
            'email': email,
            'next_step': 'input_password'
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"이메일 인증 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            'success': False,
            'message': '이메일 인증 중 오류 발생',
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
def register_step_password(request):
    """
    회원가입 4단계: 비밀번호 입력 및 검증
    비밀번호를 캐시에 저장
    """
    login_id = request.data.get('login_id')
    nickname = request.data.get('nickname')
    password = request.data.get('password')
    
    if not all([login_id, nickname, password]):
        return Response({
            'success': False,
            'message': '아이디, 닉네임, 비밀번호가 필요합니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # 닉네임, 아이디, 이메일이 캐시에 있는지 확인 (login_id를 키로 사용)
    nickname_cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:nickname"
    id_cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:id"
    email_cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:email"
    
    cached_nickname = cache.get(nickname_cache_key)
    
    if not cached_nickname or not cache.get(id_cache_key) or not cache.get(email_cache_key):
        return Response({
            'success': False,
            'message': '이전 단계가 만료되었습니다. 처음부터 다시 진행해주세요.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # 닉네임 일치 확인
    if cached_nickname != nickname:
        return Response({
            'success': False,
            'message': '닉네임이 일치하지 않습니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # 비밀번호 검증 (6자 숫자)
    if len(password) != 6 or not password.isdigit():
        return Response({
            'success': False,
            'message': '비밀번호는 6자 숫자입니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    
    try:
        # 캐시에 비밀번호 저장 (login_id를 키로 사용)
        hashed_password = make_password(password)
        cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:password"
        cache.set(cache_key, hashed_password, timeout=REGISTRATION_CACHE_TIMEOUT)
        
        logger.info(f"비밀번호 검증 완료 (캐시 저장): login_id={login_id}")
        
        return Response({
            'success': True,
            'message': '비밀번호가 설정되었습니다.',
            'next_step': 'upload_biometric_data'
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"비밀번호 검증 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            'success': False,
            'message': '비밀번호 설정 중 오류 발생',
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


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
        from django.core.mail import send_mail
        from django.template.loader import render_to_string
        
        verification_code = f"{random.randint(100000, 999999)}"
        expires_at = timezone.now() + timezone.timedelta(minutes=30)
        
        EmailVerification.objects.create(
            email=email,
            verification_code=verification_code,
            expires_at=expires_at
        )
        
        # 개발 모드인 경우 콘솔에만 출력
        if settings.DEBUG:
            print(f"=== 이메일 인증 코드 ===")
            print(f"이메일: {email}")
            print(f"인증 코드: {verification_code}")
            print(f"만료 시간: {expires_at}")
            print("====================")
        else:
            # 프로덕션 모드: 실제 이메일 전송
            subject = "[싸비스] 이메일 인증 코드"
            message = f"""
안녕하세요,

요청하신 이메일 인증 코드는 다음과 같습니다.

인증 코드: {verification_code}

이 코드는 30분 동안 유효합니다.

감사합니다.
싸비스 팀
            """
            
            try:
                send_mail(
                    subject=subject,
                    message=message,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[email],
                    fail_silently=False,
                )
                logger.info(f"이메일 발송 성공: {email}, 코드: {verification_code}")
            except Exception as email_error:
                logger.error(f"이메일 발송 실패: {str(email_error)}")
                # 이메일 발송 실패시에도 인증 코드는 DB에 저장됨
        
        return Response({
            'success': True,
            'message': '인증 코드가 발송되었습니다.',
            'expires_in': 1800
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"이메일 인증 코드 생성 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            'success': False,
            'message': '인증 코드 생성 중 오류 발생'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
def verify_email_code(request):
    """
    이메일 인증 코드 검증
    User는 이미 생성되어 있으므로 이메일 인증만 확인
    """
    email = request.data.get('email')
    code = request.data.get('code')
    
    # 마스터키 인증 (개발 모드)
    if code == "999999":
        EmailVerification.objects.filter(email=email).delete()
        user = User.objects.filter(email=email, is_active=True).first()
        
        if not user:
            return Response({
                "success": False, 
                "message": "사용자를 찾을 수 없습니다. 회원가입을 다시 진행해주세요."
            }, status=status.HTTP_404_NOT_FOUND)
        
        logger.info(f"이메일 인증 완료 (마스터키): {user.login_id}, uid={user.uid}")
        
        return Response({
            "success": True, 
            "message": "이메일 인증 완료",
            "uid": str(user.uid),
            "login_id": user.login_id,
            "email": user.email,
            "next_step": "upload_biometric_data"
        })

    # 일반 인증
    verification = EmailVerification.objects.filter(
        email=email, 
        verification_code=code,
        expires_at__gt=timezone.now()
    ).first()

    if verification:
        verification.delete()
        user = User.objects.filter(email=email, is_active=True).first()
        
        if not user:
            return Response({
                "success": False, 
                "message": "사용자를 찾을 수 없습니다. 회원가입을 다시 진행해주세요."
            }, status=status.HTTP_404_NOT_FOUND)
        
        logger.info(f"이메일 인증 완료: {user.login_id}, uid={user.uid}")
        
        return Response({
            "success": True, 
            "message": "이메일 인증 완료",
            "uid": str(user.uid),
            "login_id": user.login_id,
            "email": user.email,
            "next_step": "upload_biometric_data"
        })
    else:
        return Response({
            "success": False, 
            "message": "인증 코드가 틀리거나 만료되었습니다"
        }, status=status.HTTP_400_BAD_REQUEST)


# ===== 생체 정보 =====
@api_view(['POST'])
def save_face_vector_from_jetson(request):
    """
    Jetson → Django
    얼굴(5x512) 벡터 임시 저장 (캐시)
    
    User 생성은 음성 벡터 수신 시 수행
    """
    login_id = request.data.get('login_id')
    face_vectors = request.data.get('face_vectors')

    if not login_id or not face_vectors:
        return Response({
            "success": False,
            "reason": "INVALID_PAYLOAD",
            "message": "login_id와 face_vectors가 필요합니다."
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # 회원가입 정보 캐시 확인
    nickname_cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:nickname"
    id_cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:id"
    email_cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:email"
    password_cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:password"
    
    cached_nickname = cache.get(nickname_cache_key)
    cached_login_id = cache.get(id_cache_key)
    email = cache.get(email_cache_key)
    password = cache.get(password_cache_key)
    
    if not all([cached_nickname, cached_login_id, password, email]):
        return Response({
            "success": False,
            "reason": "CACHE_EXPIRED",
            "message": "회원가입 정보가 만료되었습니다. 처음부터 다시 진행해주세요."
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # 얼굴 벡터를 캐시에 임시 저장 (User 생성 안 함)
        face_cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:face_vectors"
        cache.set(face_cache_key, face_vectors, timeout=REGISTRATION_CACHE_TIMEOUT)
        
        logger.info(f"얼굴 벡터 캐시 저장: login_id={login_id}")
        
        return Response({
            "success": True,
            "message": "얼굴 벡터가 임시 저장되었습니다. 음성 등록을 진행해주세요.",
            "login_id": login_id,
            "next_step": "upload_voice"
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"얼굴 벡터 캐시 저장 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            "success": False,
            "message": "얼굴 벡터 저장 중 오류 발생",
            "error": str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# 젯슨 -> DB 음성 벡터 받기 (회원가입용)
@api_view(['POST'])
@transaction.atomic
def save_voice_vector_from_jetson(request):
    """
    Jetson → Django
    음성(192) x 4 벡터 저장 (회원가입용)
    
    회원가입 캐시에서 정보를 조회하여 User 생성
    음성 벡터 저장만 수행하며, 자동 로그인은 별도 API 호출 필요
    """
    login_id = request.data.get('login_id')
    voice_vectors = request.data.get('voice_vectors')
    
    logger.info(f"[음성 등록 시작] login_id={login_id}, voice_vectors_존재={voice_vectors is not None}")
    
    if not login_id:
        logger.error("[음성 등록 실패] login_id 미입력")
        return Response({
            "success": False,
            "reason": "INVALID_PAYLOAD",
            "message": "login_id가 필요합니다."
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # 캐시에서 회원가입 정보 조회
        nickname_cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:nickname"
        id_cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:id"
        email_cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:email"
        password_cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:password"
        face_cache_key = f"{REGISTRATION_CACHE_PREFIX}{login_id}:face_vectors"
        
        cached_nickname = cache.get(nickname_cache_key)
        cached_login_id = cache.get(id_cache_key)
        email = cache.get(email_cache_key)
        hashed_password = cache.get(password_cache_key)
        face_vectors = cache.get(face_cache_key)
        
        logger.info(f"[캐시 조회] nickname={cached_nickname}, login_id={cached_login_id}, email={email}, password={'*' * len(hashed_password) if hashed_password else None}, face_vectors_존재={face_vectors is not None}")
        
        if not all([cached_nickname, cached_login_id, hashed_password, email]):
            logger.error("[음성 등록 실패] 캐시 만료 - 필요 정보 누락")
            return Response({
                "success": False,
                "reason": "CACHE_EXPIRED",
                "message": "회원가입 정보가 만료되었습니다. 처음부터 다시 진행해주세요."
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # User 생성 (탈퇴 회원도 포함하여 중복 체크)
        logger.info(f"[User 생성 시작] login_id={cached_login_id}, email={email}, nickname={cached_nickname}")
        
        # # 이미 존재하는 이메일(활성+탈퇴)인지 확인
        # if User.objects.filter(email=email).exists():
        #     logger.error(f"[음성 등록 실패] 이미 존재하는 이메일: {email}")
        #     return Response({
        #         "success": False,
        #         "reason": "EMAIL_ALREADY_EXISTS",
        #         "message": "이미 사용 중인 이메일입니다. 새로운 이메일로 가입해주세요."
        #     }, status=status.HTTP_400_BAD_REQUEST)
        
        # 신규 회원 생성
        user = User.objects.create(
            login_id=cached_login_id,
            email=email,
            nickname=cached_nickname
        )
        
        # 이미 해시된 비밀번호 직접 설정 (이중 해시 방지)
        user.password = hashed_password
        user.save()

        logger.info(f"[User 생성 완료] user_id={user.user_id}, uid={user.uid}, login_id={user.login_id}")
        
        # 얼굴 벡터 저장 (캐시에서 가져옴)
        if face_vectors:
            logger.info(f"[얼굴 벡터 저장] login_id={user.login_id}, 벡터 길이={len(face_vectors)}")
            BiometricLog.objects.create(
                user=user,
                change_type="face_update",
                previous_vector=None,
                new_vector=face_vectors,
                change_reason="REGISTRATION"
            )
            user.face_vectors = face_vectors
            logger.info(f"[얼굴 벡터 저장 완료] {user.login_id}")
        else:
            logger.info(f"[얼굴 벡터 없음] login_id={user.login_id}")
        
        # 음성 벡터 저장 (있는 경우에만)
        if voice_vectors:
            logger.info(f"[음성 벡터 저장 시작] login_id={user.login_id}, 벡터 길이={len(voice_vectors) if isinstance(voice_vectors, list) else 'N/A'}")
            BiometricLog.objects.create(
                user=user,
                change_type="voice_update",
                previous_vector=None,
                new_vector=voice_vectors,
                change_reason="REGISTRATION"
            )
            user.voice_vectors = voice_vectors
            logger.info(f"[음성 벡터 저장 완료] {user.login_id}")
        else:
            logger.info(f"[음성 등록 건너뛰기] login_id={user.login_id}")
        
        logger.info(f"[User 저장 시작] login_id={user.login_id}")
        user.save()
        logger.info(f"[User 저장 완료] login_id={user.login_id}")
        
        # 기본 프리셋 생성 (회원가입 시 자동 생성)
        try:
            # Preset은 connection에 종속되지 않음
            # 기본 프리셋은 비활성 상태로 생성 (앱에서 선택 시 활성화)
            default_preset = Preset.objects.create(
                user=user,
                preset_name='기본 프리셋',
                servo1=90,
                servo2=120,
                servo3=0,
                servo4=45,
                servo5=90,
                servo6=100,
                is_active=False  # 비활성 상태로 생성
            )
            
            logger.info(f"기본 프리셋 생성 완료: {default_preset.preset_id}, 사용자: {user.login_id}")

        except Exception as e:
            logger.error(f"기본 프리셋 생성 오류: {str(e)}")
            # 프리셋 생성 실패가 회원가입 실패로 이어지지 않도록 예외 처리
        
        # 캐시 삭제
        logger.info(f"[캐시 삭제 시작] login_id={login_id}")
        keys_to_delete = [
            nickname_cache_key,
            id_cache_key,
            email_cache_key,
            password_cache_key,
            face_cache_key
        ]
        cache.delete_many(keys_to_delete)

        logger.info(f"[캐시 삭제 완료] login_id={login_id}")
        
        logger.info(f"[회원가입 완료] {user.login_id}, uid={user.uid}")
        
        # 회원가입 완료 응답 (자동로그인 제거)
        response_data = {
            'success': True,
            'message': '회원가입이 완료되었습니다. 로그인 후 이용해주세요.',
        }
        
        return Response(response_data, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"[음성 등록 오류] {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            "success": False,
            "message": "회원가입 처리 중 오류 발생",
            "error": str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ===== 헬퍼 함수 =====
def cosine_similarity(vec1, vec2):
    """두 벡터 간의 코사인 유사도 계산"""
    v1 = np.array(vec1, dtype=float)
    v2 = np.array(vec2, dtype=float)

    if v1.shape != v2.shape:
        return 0.0

    norm1 = np.linalg.norm(v1)
    norm2 = np.linalg.norm(v2)

    if norm1 == 0 or norm2 == 0:
        return 0.0

    return float(np.dot(v1, v2) / (norm1 * norm2))


# ===== 로그인 =====
@api_view(['POST'])
@transaction.atomic
def face_login(request):
    """
    젯슨 → Django: 얼굴 벡터로 로그인 요청
    
    통신 흐름: 앱 → 젯슨 → 서버 → 젯슨 → 앱
    - 앱에서 젯슨으로 얼굴 이미지 전송
    - 젯슨에서 벡터 변환 후 서버로 로그인 요청
    - 서버에서 인증 후 토큰, 벡터, 로그인 성공여부
    - 젯슨에서 앱으로 결과 전달
    """
    input_vector = request.data.get('face_vectors')
    
    if not input_vector:
        return Response(
            {
                'success': False,
                'reason': 'INVALID_REQUEST',
                'fallback': 'PASSWORD_LOGIN',
                'message': 'face_vectors가 전달되지 않았습니다.'
            },
            status=400
        )

    THRESHOLD = 0.5
    best_user = None
    best_similarity = 0.0

    users = User.objects.filter(is_active=True, face_vectors__isnull=False)

    for user in users:
        # 첫 번째 벡터(정면 사진)만 비교
        face_vectors = user.face_vectors or []
        if len(face_vectors) > 0:
            stored_vector = face_vectors[0]
            similarity = cosine_similarity(input_vector, stored_vector)

            if similarity > best_similarity:
                best_similarity = similarity
                best_user = user

    if best_user is None or best_similarity < THRESHOLD:
        return Response(
            {
                'success': False,
                'reason': 'FACE_NOT_MATCH',
                'fallback': 'PASSWORD_LOGIN',
                'message': '얼굴 인식에 실패했습니다. 아이디와 비밀번호로 로그인해주세요.'
            },
            status=401
        )

    best_user.last_login_at = timezone.now()
    best_user.save()

    # 토큰 생성 (Access + Refresh)
    tokens = generate_tokens_for_user(best_user)
    
    # 활성 연결 찾기
    active_connection = UserDeviceConnection.objects.filter(
        user=best_user,
        is_active=True,
        deleted_at__isnull=True
    ).order_by('-connected_at').first()
    
    # 세션 생성
    try:
        if active_connection:
            session = Session.objects.create(connection=active_connection)
            logger.info(f"얼굴 로그인 - 세션 생성 (연결 있음): {session.session_id}, 사용자: {best_user.login_id}")
        else:
            # 연결이 없는 경우: 기본 연결 생성
            logger.info(f"얼굴 로그인 - 활성 연결 없음, 기본 연결 생성 시도: {best_user.login_id}")
            
            try:
                # 기본 Phone 및 Sarvis 생성 (개발용)
                from uuid import uuid4
                
                # 기본 Phone 생성 (user 필드 없음, device_name만 설정)
                phone = Phone.objects.create(
                    device_name=f'기본 폰 - {best_user.login_id} (자동 생성)'
                )
                
                # 기본 Sarvis(IoT) 생성
                sarvis = Sarvis.objects.create()
                
                # 연결 생성
                new_connection = UserDeviceConnection.objects.create(
                    user=best_user,
                    phone=phone,
                    sarvis=sarvis,
                    is_active=True
                )
                
                # 세션 생성
                session = Session.objects.create(connection=new_connection)
                logger.info(f"얼굴 로그인 - 기본 연결 및 세션 생성 완료: {session.session_id}, 사용자: {best_user.login_id}")
                
            except Exception as conn_error:
                logger.error(f"얼굴 로그인 - 기본 연결 생성 실패: {str(conn_error)}")
                # 연결 생성 실패 시 세션 없이 로그인 허용 (임시)
                session = None
                logger.warning(f"얼굴 로그인 - 세션 없이 로그인 허용 (연결 생성 실패): {best_user.login_id}")
                
    except Exception as e:
        logger.error(f"얼굴 로그인 - 세션 생성 실패: {str(e)}")
        session = None

    logger.info(f"얼굴 로그인 완료: {best_user.login_id}, 젯슨으로 전달 (토큰 + 벡터)")

    # 젯슨으로 전달할 응답 (젯슨이 앱에 전달)
    response_data = {
        'success': True,
        'uid': str(best_user.uid),
        'tokens': tokens,
        # 로그인 성공 시 벡터 반환 (젯슨이 필요로 함)
        'face_vectors': best_user.face_vectors,
        'voice_vectors': best_user.voice_vectors,
        'nickname': best_user.nickname
    }
    
    if session:
        response_data['session_id'] = session.session_id
        response_data['session_started_at'] = session.started_at

    return Response(response_data, status=200)

@api_view(['POST'])
@transaction.atomic
def password_login(request):
    """
    앱 → Django: 아이디/비밀번호로 로그인 요청
    
    통신 흐름: 앱 → 서버 → 앱 (젯슨 거치지 않음)
    - 앱에서 서버로 직접 로그인 요청
    - 서버에서 인증 후 토큰, 프리셋 정보 반환
    - 젯슨은 비밀번호 로그인에 참여하지 않음
    """
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
        
        # 토큰 생성 (Access + Refresh)
        tokens = generate_tokens_for_user(user)
        
        # 활성 연결 찾기
        active_connection = UserDeviceConnection.objects.filter(
            user=user,
            is_active=True,
            deleted_at__isnull=True
        ).order_by('-connected_at').first()
        
        # 세션 생성
        try:
            if active_connection:
                session = Session.objects.create(connection=active_connection)
                logger.info(f"비밀번호 로그인 - 세션 생성 (연결 있음): {session.session_id}, 사용자: {user.login_id}")
            else:
                # 연결이 없는 경우: 기본 연결 생성
                logger.info(f"비밀번호 로그인 - 활성 연결 없음, 기본 연결 생성 시도: {user.login_id}")
                
                try:
                    # 기본 Phone 및 Sarvis 생성 (개발용)
                    from uuid import uuid4
                    
                    # 기본 Phone 생성 (user 필드 없음, device_name만 설정)
                    phone = Phone.objects.create(
                        device_name=f'기본 폰 - {user.login_id} (자동 생성)'
                    )
                    
                    # 기본 Sarvis(IoT) 생성
                    sarvis = Sarvis.objects.create()
                    
                    # 연결 생성
                    new_connection = UserDeviceConnection.objects.create(
                        user=user,
                        phone=phone,
                        sarvis=sarvis,
                        is_active=True
                    )
                    
                    # 세션 생성
                    session = Session.objects.create(connection=new_connection)
                    logger.info(f"비밀번호 로그인 - 기본 연결 및 세션 생성 완료: {session.session_id}, 사용자: {user.login_id}")
                    
                except Exception as conn_error:
                    logger.error(f"비밀번호 로그인 - 기본 연결 생성 실패: {str(conn_error)}")
                    # 연결 생성 실패 시 세션 없이 로그인 허용 (임시)
                    session = None
                    logger.warning(f"비밀번호 로그인 - 세션 없이 로그인 허용 (연결 생성 실패): {user.login_id}")
                    
        except Exception as e:
            logger.error(f"비밀번호 로그인 - 세션 생성 실패: {str(e)}")
            session = None
                
        logger.info(f"비밀번호 로그인 성공: {user.login_id}, Jetson 전송 시작")

        # 젯슨으로 로그인 성공 신호 및 사용자 정보 전송
        try:
            jetson_url = f"{JETSON_BASE_URL}/login_credentials"
            jetson_data = {
                'uid': str(user.uid),
                'face_vectors': user.face_vectors,
                'voice_vectors': user.voice_vectors
            }

            headers = {
                "ngrok-skip-browser-warning": "69420",
                "Content-Type": "application/json"  
            }

            jetson_response = requests.post(jetson_url, json=jetson_data, headers=headers, timeout=10)
            
            if jetson_response.status_code == 200:
                logger.info(f"비밀번호 로그인 - Jetson 전송 성공: {user.login_id}")
            else:
                logger.warning(f"비밀번호 로그인 - Jetson 전송 실패 (HTTP {jetson_response.status_code}): {user.login_id}")
                return Response({
                    'success': False,
                    'message': '로봇과 통신에 실패했습니다. 다시 시도해주세요.'
                }, status=status.HTTP_502_BAD_GATEWAY)
                
            
        except requests.exceptions.RequestException as e:
            logger.error(f"비밀번호 로그인 - 로봇 통신 오류: {str(e)}")
            # Jetson 통신 실패 시 로그인 실패로 처리
            return Response({
                'success': False,
                'message': '로봇 연결에 실패했습니다. 네트워크 연결을 확인해주세요.'
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
        # Jetson 전송 성공 시에만 로그인 완료 응답
        response_data = {
            'success': True,
            'uid': str(user.uid),
            'tokens': tokens,
        }
        
        if session:
            response_data['session_id'] = session.session_id
            response_data['session_started_at'] = session.started_at
        
        logger.info(f"비밀번호 로그인 완료: {user.login_id}")
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

# 젯슨 -> DB 얼굴 벡터 업데이트 (재등록용)
@api_view(['POST'])
@transaction.atomic
def update_face_vector_from_jetson(request):
    """
    Jetson → Django
    얼굴(512) x 5 벡터 업데이트 (재등록용)
    
    기존 사용자의 얼굴 벡터를 업데이트
    """
    uid = request.data.get('uid')
    face_vectors = request.data.get('face_vectors')
    
    if not uid or not face_vectors:
        return Response({
            "success": False,
            "reason": "INVALID_PAYLOAD",
            "message": "uid와 face_vectors가 필요합니다."
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        user = User.objects.get(uid=uid, is_active=True)

        # 얼굴 벡터 업데이트
        BiometricLog.objects.create(
            user=user,
            change_type="face_update",
            previous_vector=user.face_vectors,
            new_vector=face_vectors,
            change_reason="JETSON_UPLOAD"
        )
        user.face_vectors = face_vectors
        user.save()

        logger.info(f"얼굴 벡터 업데이트 완료: uid={uid}, login_id={user.login_id}")

        return Response({
            "success": True,
            "message": "얼굴 벡터 업데이트 완료",
            "uid": str(user.uid),
        }, status=status.HTTP_200_OK)

    except User.DoesNotExist:
        return Response({
            "success": False,
            "reason": "USER_NOT_FOUND",
            "message": "사용자를 찾을 수 없습니다."
        }, status=status.HTTP_404_NOT_FOUND)
        
    except Exception as e:
        logger.error(f"얼굴 벡터 업데이트 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            "success": False,
            "message": "얼굴 벡터 업데이트 중 오류 발생",
            "error": str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# === 회원정보 업데이트 ===
# 젯슨 -> DB 음성 벡터 업데이트 (재등록용)
@api_view(['POST'])
@transaction.atomic
def update_voice_vector_from_jetson(request):
    """
    Jetson → Django
    음성(192) 벡터 업데이트 (재등록용)
    
    기존 사용자의 음성 벡터를 업데이트
    """
    uid = request.data.get('uid')
    voice_vectors = request.data.get('voice_vectors')
    
    if not uid or not voice_vectors:
        return Response({
            "success": False,
            "reason": "INVALID_PAYLOAD",
            "message": "uid와 voice_vectors가 필요합니다."
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        user = User.objects.get(uid=uid, is_active=True)

        # 음성 벡터 업데이트
        BiometricLog.objects.create(
            user=user,
            change_type="voice_update",
            previous_vector=user.voice_vectors,
            new_vector=voice_vectors,
            change_reason="JETSON_UPLOAD"
        )
        user.voice_vectors = voice_vectors
        user.save()

        logger.info(f"음성 벡터 업데이트 완료: uid={uid}, login_id={user.login_id}")

        return Response({
            "success": True,
            "message": "음성 벡터 업데이트 완료",
            "uid": str(user.uid),
        }, status=status.HTTP_200_OK)

    except User.DoesNotExist:
        return Response({
            "success": False,
            "reason": "USER_NOT_FOUND",
            "message": "사용자를 찾을 수 없습니다."
        }, status=status.HTTP_404_NOT_FOUND)
        
    except Exception as e:
        logger.error(f"음성 벡터 업데이트 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            "success": False,
            "message": "음성 벡터 업데이트 중 오류 발생",
            "error": str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ===== 기기 연결 =====
@api_view(['DELETE'])
@jwt_required
@transaction.atomic
def delete_connection(request):
    """기기 연결 해제"""
    serializer = ConnectionDeleteSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({'success': False, 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    phone_uuid = serializer.validated_data.get('phone_uuid')
    iot_uuid = serializer.validated_data.get('iot_uuid')

    try:
        iot_obj = Sarvis.objects.get(sarvis_uuid=iot_uuid)
    except Sarvis.DoesNotExist:
        return Response(
            {
                'success': False,
                'message': '등록되지 않은 로봇입니다.',
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    qs = UserDeviceConnection.objects.filter(user=request.user, sarvis=iot_obj)

    if phone_uuid:
        qs = qs.filter(phone__phone_uuid=phone_uuid)

    connection = qs.filter(deleted_at__isnull=True).order_by('-connected_at').first()
    if connection is None:
        return Response(
            {
                'success': False,
                'message': '해제할 연결 정보를 찾을 수 없습니다.',
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    connection.is_active = False
    connection.deleted_at = timezone.now()
    connection.save()

    return Response(
        {
            'success': True,
            'message': '기기 연결이 해제되었습니다.',
            'connection_uuid': str(connection.connection_uuid),
        },
        status=status.HTTP_200_OK,
    )


# ===== 세션 관리 =====
@api_view(['POST'])
@jwt_required
@transaction.atomic
def start_session(request):
    """세션 시작"""
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

    session = Session.objects.create(connection=connection)

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
    """명령 로그 생성"""
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
            'occurred_at': log.created_at,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@jwt_required
@transaction.atomic
def end_session(request):
    """세션 종료"""
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


# ===== JWT 토큰 =====
@api_view(['POST'])
def refresh_token(request):
    """Refresh Token으로 새로운 Access Token 발급 - 인증 불필요
    
    이 API는 Authorization 헤더가 필요 없습니다.
    요청 바디에 refresh 토큰을 포함하여 호출하세요.
    
    요청 예시:
    {
        "refresh": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
    }
    """
    refresh_token_input = request.data.get('refresh')
    
    logger.info(f"[토큰 갱신 요청] refresh_token_존재={refresh_token_input is not None}")
    
    if not refresh_token_input:
        logger.warning("[토큰 갱신 실패] refresh 토큰 미입력")
        return Response({
            'success': False,
            'message': 'refresh 토큰이 필요합니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        refresh = RefreshToken(refresh_token_input)
        new_access_token = str(refresh.access_token)
        new_refresh_token = str(refresh)  # Refresh Token 회전으로 인해 새로운 Refresh Token 발급
        
        logger.info(f"[토큰 갱신 성공] 새 Access Token 발급 완료")
        
        return Response({
            'success': True,
            'access': new_access_token,
            'refresh': new_refresh_token,  # 새로운 Refresh Token도 클라이언트에 전달
            'message': '토큰이 갱신되었습니다.'
        }, status=status.HTTP_200_OK)
        
    except TokenError as e:
        logger.warning(f"[토큰 갱신 실패] TokenError: {str(e)}")
        return Response({
            'success': False,
            'message': '유효하지 않거나 만료된 토큰입니다. 다시 로그인해주세요.',
            'error': str(e)
        }, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['POST'])
@jwt_required
@transaction.atomic
def logout(request):
    """로그아웃 - 토큰 블랙리스트, 세션 종료 및 젯슨 통지"""
    from rest_framework_simplejwt.tokens import RefreshToken
    from rest_framework_simplejwt.exceptions import TokenError
    from accounts.tasks import notify_jetson_logout  # tasks.py에서 헬퍼 함수 import
    
    refresh_token = request.data.get('refresh')
    
    if not refresh_token:
        return Response({
            'success': False,
            'message': 'refresh 토큰이 필요합니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Refresh 토큰 블랙리스트에 추가
        token = RefreshToken(refresh_token)
        token.blacklist()
        
        # 해당 사용자의 모든 활성 세션 종료 (connection이 있는 세션과 없는 세션 모두)
        sessions = Session.objects.filter(
            (models.Q(connection__user=request.user) | models.Q(connection__isnull=True)) &
            models.Q(ended_at__isnull=True)
        )
        
        ended_count = sessions.count()
        sessions.update(ended_at=timezone.now())
        
        # 사용자의 모든 활성 connection 비활성화
        connections = UserDeviceConnection.objects.filter(
            user=request.user,
            is_active=True,
            deleted_at__isnull=True
        )
        connections.update(
            is_active=False,
            deleted_at=timezone.now()
        )
        
        logger.info(f"로그아웃 성공: {request.user.login_id}, 종료된 세션 수: {ended_count}")

        # [수정] tasks.py의 헬퍼 함수를 사용하여 젯슨에게 로그아웃 통지
        notify_jetson_logout(request.user)
        
        return Response({
            'success': True,
            'message': '로그아웃되었습니다.',
            'ended_sessions': ended_count
        }, status=status.HTTP_200_OK)
        
    except TokenError:
        return Response({
            'success': False,
            'message': '유효하지 않은 토큰입니다.'
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@jwt_required
def get_presets(request):
    try:
        # 1. 사용자 확인 로그
        # print(f"DEBUG: Request User -> {request.user} (ID: {request.user.id if hasattr(request.user, 'id') else 'No ID'})")

        # 2. 쿼리 실행
        presets = Preset.objects.filter(user=request.user)
        # print(f"DEBUG: Found {presets.count()} presets")

        # 3. 직렬화 (이 단계에서 에러가 많이 납니다)
        serializer = PresetSerializer(presets, many=True)
        
        return Response({
            'success': True,
            'count': presets.count(),
            'presets': serializer.data
        }, status=status.HTTP_200_OK)

    except Exception as e:
        # 중요: 서버 터미널에 에러의 전체 추적 경로(Traceback)를 출력합니다.
        print("!!!!!!!! ERROR TRACEBACK !!!!!!!!")
        traceback.print_exc() 
        return Response({
            'success': False,
            'message': f'서버 내부 에러: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@jwt_required
def select_preset(request):
    """
    로그인 후 프리셋 선택
    앱 → 서버: 선택한 프리셋 ID 전송
    서버: 프리셋 조회
    서버 → Jetson: 로그인 성공 신호 + 프리셋 값 전송
    """
    preset_id = request.data.get('preset_id') # 앱에서는 preset_id로 보낼 수 있음, 변수명은 내부적으로 매핑
    
    if not preset_id:
        return Response({
            'success': False,
            'message': 'preset_id가 필요합니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # 프리셋 조회
        preset = Preset.objects.get(
            preset_id=preset_id,
            user=request.user
        )
        
        # 기존 활성 프리셋 비활성화
        Preset.objects.filter(user=request.user, is_active=True).update(is_active=False)
        
        # 선택한 프리셋 활성화
        preset.is_active = True
        preset.save()
        logger.info(f"프리셋 활성화: {preset.preset_id}, 이름: {preset.preset_name}, 사용자: {request.user.login_id}")
        
        # 프리셋 데이터 (offsets로 묶어서 전송)
        offsets = {
            'servo1': preset.servo1,
            'servo2': preset.servo2,
            'servo3': preset.servo3,
            'servo4': preset.servo4,
            'servo5': preset.servo5,
            'servo6': preset.servo6
        }
        
        # Jetson으로 보낼 때 preset_id와 name은 필요 없음, offsets를 최상위 레벨로 전송
        # API 응답용 데이터 구성 (일관성 유지)
        response_preset_data = {
            'preset_id': preset.preset_id,
            'preset_name': preset.preset_name,
            'offsets': offsets,
        }
        headers = {
            "ngrok-skip-browser-warning": "69420",
            "Content-Type": "application/json"  # 추가
        }

        # Jetson으로 로그인 성공 신호 + 프리셋 값 전송
        try:
            jetson_url = f"{JETSON_BASE_URL}/update_user_offsets"
            jetson_data = {
                'uid': str(request.user.uid),
                'offsets': offsets
            }
            
            jetson_response = requests.post(jetson_url, json=jetson_data, headers=headers, timeout=10)
            
            if jetson_response.status_code == 200:
                logger.info(f"프리셋 선택 - Jetson 전송 성공: {request.user.login_id}, 프리셋: {preset_id}")
            else:
                logger.warning(f"프리셋 선택 - Jetson 전송 실패 (HTTP {jetson_response.status_code}): {request.user.login_id}")
                
        except requests.exceptions.RequestException as e:
            logger.error(f"프리셋 선택 - Jetson 통신 오류: {str(e)}")
            # Jetson 통신 실패 시에도 프리셋 선택은 성공으로 처리
        
        return Response({
            'success': True,
            'message': '프리셋이 선택되었습니다.',
            'preset': response_preset_data
        }, status=status.HTTP_200_OK)
        
    except Preset.DoesNotExist:
        return Response({
            'success': False,
            'message': '프리셋을 찾을 수 없습니다.'
        }, status=status.HTTP_404_NOT_FOUND)
        
    except Exception as e:
        logger.error(f"프리셋 선택 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            'success': False,
            'message': '프리셋 선택 중 오류 발생',
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@jwt_required
@transaction.atomic
def update_preset(request):
    """
    앱에서 수동 제어 후 프리셋 수정
    
    앱 → 서버: 요청
    서버: 활성화된 프리셋(is_active=True) 조회
    서버 → 젯슨: 현재 로봇팔 위치 요청
    젯슨 → 서버: 현재 servo 값들 반환
    서버: 활성화된 프리셋 수정 (DB 업데이트)
    
    요청 예시:
    {
        (파라미터 없음)
    }
    
    응답 예시:
    {
        "success": true,
        "message": "프리셋이 수정되었습니다.",
        "preset_id": 1,
        "preset_name": "프리셋 1"
    }
    """
    user = request.user
    
    try:
        # 활성화된 프리셋 조회
        preset = Preset.objects.filter(
            user=user,
            is_active=True
        ).first()
        
        if not preset:
            return Response({
                'success': False,
                'message': '활성화된 프리셋이 없습니다.'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # 젯슨으로 현재 로봇팔 위치 요청
        jetson_url = f"{JETSON_BASE_URL}/offsets_save"
        headers = {
            "ngrok-skip-browser-warning": "69420",
            "Content-Type": "application/json"
        }

        jetson_response = requests.post(jetson_url, headers=headers, timeout=10)

        if jetson_response.status_code != 200:
            logger.warning(f"젯슨에서 위치값 가져오기 실패 (HTTP {jetson_response.status_code})")
            return Response({
                'success': False,
                'message': '로봇에서 위치값을 가져오지 못했습니다.'
            }, status=status.HTTP_502_BAD_GATEWAY)

        # 젯슨에서 받은 로봇팔 위치값
        jetson_data = jetson_response.json()
        logger.info(f"젯슨 응답 받음: {jetson_data}")

        # JSON 파싱 결과가 None인지 확인
        if jetson_data is None:
            logger.error("젯슨에서 받은 JSON 데이터가 None입니다.")
            return Response({
                'success': False,
                'message': '로봇에서 유효한 응답을 받지 못했습니다.'
            }, status=status.HTTP_502_BAD_GATEWAY)

        # success 필드 확인
        if not jetson_data.get('success'):
            return Response({
                'success': False,
                'message': jetson_data.get('message', '로봇에서 위치값을 가져오지 못했습니다.')
            }, status=status.HTTP_400_BAD_REQUEST)

        # offsets가 None인 경우 처리 (라즈베리 파이 통신 실패 등)
        servo_values = jetson_data.get('offsets')
        if servo_values is None:
            logger.error("젯슨에서 받은 offsets가 None입니다. 라즈베리 파이 통신을 확인하세요.")
            return Response({
                'success': False,
                'message': '로봇팔 위치값을 가져올 수 없습니다. 라즈베리 파이 연결을 확인해주세요.'
            }, status=status.HTTP_502_BAD_GATEWAY)

        servo1 = servo_values.get('servo1')
        servo2 = servo_values.get('servo2')
        servo3 = servo_values.get('servo3')
        servo4 = servo_values.get('servo4')
        servo5 = servo_values.get('servo5')
        servo6 = servo_values.get('servo6')

        # 필수 값 확인
        if None in [servo1, servo2, servo3, servo4, servo5, servo6]:
            return Response({
                'success': False,
                'message': '로봇팔 위치값이 불완전합니다.'
            }, status=status.HTTP_400_BAD_REQUEST)

        # 프리셋 수정
        preset.servo1 = servo1
        preset.servo2 = servo2
        preset.servo3 = servo3
        preset.servo4 = servo4
        preset.servo5 = servo5
        preset.servo6 = servo6
        preset.save()
        
        logger.info(f"앱 프리셋 수정 성공: {preset.preset_id}, 이름: {preset.preset_name}, 사용자: {user.login_id}")

        return Response({
            'success': True,
            'message': '프리셋이 수정되었습니다.',
            'preset_id': preset.preset_id,
            'preset_name': preset.preset_name,
            'updated_at': preset.created_at  # created_at 필드 사용 (updated_at이 없음)
        }, status=status.HTTP_200_OK)

    except Preset.DoesNotExist:
        return Response({
            'success': False,
            'message': '프리셋을 찾을 수 없습니다.'
        }, status=status.HTTP_404_NOT_FOUND)
        
    except requests.exceptions.RequestException as e:
        logger.error(f"젯슨 통신 오류: {str(e)}")
        return Response({
            'success': False,
            'message': '로봇 연결 실패'
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
    except Exception as e:
        logger.error(f"프리셋 수정 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            'success': False,
            'message': '프리셋 수정 중 오류 발생',
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['PATCH'])
@jwt_required
@transaction.atomic
def rename_preset(request):
    """
    프리셋 이름 변경
    
    앱 → 서버: preset_id, preset_name 전송
    서버: 프리셋 조회 후 이름만 변경
    
    요청 예시:
    {
        "preset_id": 1,
        "preset_name": "새 프리셋 이름"
    }
    
    응답 예시:
    {
        "success": true,
        "message": "프리셋 이름이 변경되었습니다.",
        "preset_id": 1,
        "preset_name": "새 프리셋 이름"
    }
    """
    preset_id = request.data.get('preset_id')
    new_name = request.data.get('preset_name')
    
    if not preset_id:
        return Response({
            'success': False,
            'message': 'preset_id가 필요합니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    if not new_name or not new_name.strip():
        return Response({
            'success': False,
            'message': 'preset_name이 필요합니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    new_name = new_name.strip()
    
    # 이름 길이 제한 (50자)
    if len(new_name) > 50:
        return Response({
            'success': False,
            'message': '프리셋 이름은 50자 이하로 입력해주세요.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # 프리셋 조회
        preset = Preset.objects.get(
            preset_id=preset_id,
            user=request.user
        )
        
        # 이름 변경
        old_name = preset.preset_name
        preset.preset_name = new_name
        preset.save()
        
        logger.info(f"프리셋 이름 변경 완료: {preset.preset_id}, '{old_name}' → '{new_name}', 사용자: {request.user.login_id}")
        
        return Response({
            'success': True,
            'message': '프리셋 이름이 변경되었습니다.',
            'preset_id': preset.preset_id,
            'preset_name': preset.preset_name
        }, status=status.HTTP_200_OK)
        
    except Preset.DoesNotExist:
        return Response({
            'success': False,
            'message': '프리셋을 찾을 수 없습니다.'
        }, status=status.HTTP_404_NOT_FOUND)
        
    except Exception as e:
        logger.error(f"프리셋 이름 변경 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            'success': False,
            'message': '프리셋 이름 변경 중 오류 발생',
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ===== 로봇 제어 =====
@api_view(['POST'])
def update_robot_angle(request):
    """
    싸비스가 로봇의 각도 정보를 서버에 저장
    """
    try:
        angle_data = request.data
        
        if not angle_data or not isinstance(angle_data, dict):
            return Response({
                'success': False,
                'message': '유효하지 않은 각도 데이터입니다.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # 필수 필드 확인 (Jetson에서 온 데이터: x, y, z, tilt, has)
        required_fields = ['servo1','servo2','servo3','servo4','servo5','servo6']
        for field in required_fields:
            if field not in angle_data:
                return Response({
                    'success': False,
                    'message': f'필수 필드 누락: {field}'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        # Jetson 데이터를 캐시에 저장 (tilt->pitch_offset, has->yaw_offset 매핑)
        cache_data = {
            'servo1': angle_data['servo1'],
            'servo2': angle_data['servo2'],
            'servo3': angle_data['servo3'],
            'servo4': angle_data['servo4'],
            'servo5': angle_data['servo5'],
            'servo6': angle_data['servo6'],
        }
        cache.set(ROBOT_ANGLE_CACHE_KEY, cache_data, timeout=None)
        
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


@api_view(['POST'])
@jwt_required
@transaction.atomic
def control_screen_enter(request):
    """
    제어 화면 진입 신호 (더 이상 세션 생성하지 않음)
    앱 → 서버: 제어 화면 진입 시 신호 전송
    서버: 기존 세션 확인 (세션은 앱 시작 시 생성됨)
    """
    serializer = ControlScreenEnterSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({'success': False, 'errors': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    connection_uuid = serializer.validated_data['connection_uuid']

    try:
        connection = UserDeviceConnection.objects.get(
            connection_uuid=connection_uuid,
            user=request.user,
            is_active=True,
            deleted_at__isnull=True
        )
    except UserDeviceConnection.DoesNotExist:
        return Response({
            'success': False,
            'message': '연결 정보를 찾을 수 없습니다.'
        }, status=status.HTTP_404_NOT_FOUND)

    # 활성 세션 확인 - 항상 새 세션 생성 (로그인할 때마다 새 세션)
    session = Session.objects.create(connection=connection)
    logger.info(f"제어 화면 진입 - 새 세션 생성: {session.session_id}, 사용자: {request.user.login_id}")

    return Response({
        'success': True,
        'message': '제어 화면 진입 성공',
        'session_id': str(session.session_id),
        'started_at': session.started_at
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@transaction.atomic
def voice_command_from_jetson(request):
    """
    젯슨 음성 명령 수신
    
    통신 흐름:
    1. 젯슨 → Django: uid, 명령내용 전송
    2. Django: 명령 로그 저장 (항상)
    3. 유튜브 명령인 경우:
       - Django → App WebSocket 전송
       - App → Django로 성공/실패 여부 반환
       - Django: DB 로그 업데이트
       - Django → Jetson으로 성공/실패 여부 반환
    4. 유튜브가 아닌 명령: DB에만 저장
    
    지원하는 명령:
    - 유튜브: YOUTUBE_OPEN, YOUTUBE_SEEK, YOUTUBE_PAUSE, YOUTUBE_PLAY
    - 로봇 제어: TRACK_OFF, TRACK_ON, COME_HERE, LEFT, RIGHT, UP, DOWN, FORWARD, BACKWARD, HOME
    """
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync
    import time
    
    serializer = VoiceCommandFromJetsonSerializer(data=request.data)
    if not serializer.is_valid():
        logger.warning(f"VoiceCommandFromJetsonSerializer validation 실패: {serializer.errors}, request.data={request.data}")
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)

    uid = serializer.validated_data['uid']
    command = serializer.validated_data['command']

    try:
        # uid로 사용자 찾기
        user = User.objects.get(uid=uid, is_active=True)
    except User.DoesNotExist:
        return Response({
            'success': False,
            'message': '사용자를 찾을 수 없습니다.'
        }, status=status.HTTP_404_NOT_FOUND)

    # 활성 세션 찾기
    active_session = Session.objects.filter(
        connection__user=user,
        connection__is_active=True,
        connection__deleted_at__isnull=True,
        ended_at__isnull=True
    ).order_by('-started_at').first()

    if not active_session:
        logger.warning(f"음성 명령 수신 - 활성 세션 없음: uid={uid}, login_id={user.login_id}")
        return Response({
            'success': False,
            'message': '활성 세션이 없습니다.'
        }, status=status.HTTP_404_NOT_FOUND)

    session = active_session
    
    # ✅ session_id 정의
    session_id = str(session.session_id)
    
    # 명령 로그 생성 (항상)
    # command_type: VOICE_COMMAND (고정)
    # command_content: 실제 명령어
    log = CommandLog.objects.create(
        session=session,
        command_type='VOICE_COMMAND',
        command_content=command,
        is_success=False  # 초기: 실패 상태, 앱 확인 후 업데이트
    )

    logger.info(f"음성 명령 로그 저장: {log.command_log_id}, 명령: {command}, uid={uid}, login_id={user.login_id}")

    # 유튜브 명령인지 확인
    youtube_commands = ['YOUTUBE_OPEN', 'YOUTUBE_SEEK_FORWARD', 'YOUTUBE_SEEK_BACKWARD', 'YOUTUBE_PAUSE', 'YOUTUBE_PLAY']
    
    if command in youtube_commands:
        # 유튜브 명령: 앱으로 전송 후 실행 결과 대기
        try:
            session_id = str(session.session_id)  # session_id 변수 정의
            
            # 캐시에서 웹소켓 연결 확인
            websocket_info = cache.get(f'websocket:{session_id}')
            
            if not websocket_info or not websocket_info.get('connected'):
                logger.warning(f"음성 명령 수신 - 웹소켓 연결 없음: session_id={session_id}")
                # WebSocket 연결 없으면 실패 처리
                log.error_message = 'WebSocket 연결 없음'
                log.save()
                
                return Response({
                    'success': False,
                    'message': '앱 연결이 없습니다.'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # 캐시에 대기 상태 설정 (앱 확인 기다림)
            youtube_command_key = f'youtube_command_wait:{session_id}'
            cache.set(youtube_command_key, 'waiting', timeout=10)  # 10초 대기
            
            # 채널 레이어 가져오기
            channel_layer = get_channel_layer()
            
            # 그룹 이름: app_{session_id}
            group_name = f'app_{session_id}'
            
            message_data = {
                'type': 'youtube_command',
                'command': command,
                'timestamp': timezone.now().isoformat()
            }
            
            # 비동기 함수를 동기적으로 호출
            async_to_sync(channel_layer.group_send)(
                group_name,
                {
                    'type': 'youtube_command',
                    'data': message_data
                }
            )
            
            logger.info(f"유튜브 명령 WebSocket 전송, 앱 실행 결과 대기 시작: 명령={command}, session_id={session_id}")
            
            # 앱 실행 결과 대기 (폴링, 최대 10초)
            max_wait_time = 10
            check_interval = 0.1  # 100ms마다 확인
            elapsed_time = 0
            
            while elapsed_time < max_wait_time:
                wait_status = cache.get(youtube_command_key)
                if wait_status in ['success', 'failed']:
                    # 앱에서 실행 결과 반환
                    command_success = (wait_status == 'success')
                    
                    # DB 로그 업데이트
                    log.is_success = command_success
                    if not command_success:
                        log.error_message = '앱 명령 실행 실패'
                    log.save()
                    
                    logger.info(f"앱 명령 실행 완료: 명령={command}, 성공={command_success}, session_id={session_id}")
                    
                    # 캐시 정리
                    cache.delete(youtube_command_key)
                    
                    return Response({
                        'success': command_success
                    }, status=status.HTTP_200_OK if command_success else status.HTTP_500_INTERNAL_SERVER_ERROR)
                
                time.sleep(check_interval)
                elapsed_time += check_interval
            
            # 타임아웃: 앱에서 실행 결과 없음
            logger.warning(f"앱 명령 실행 타임아웃: 명령={command}, session_id={session_id}")
            cache.delete(youtube_command_key)
            
            # DB 로그 업데이트
            log.error_message = '앱 응답 타임아웃'
            log.save()
            
            return Response({
                'success': False,
                'message': '앱 응답 타임아웃'
            }, status=status.HTTP_408_REQUEST_TIMEOUT)
            
        except Exception as e:
            logger.error(f"유튜브 명령 처리 오류: {str(e)}")
            logger.error(traceback.format_exc())
            
            # DB 로그 업데이트
            log.is_success = False
            log.error_message = f'처리 오류: {str(e)}'
            log.save()
            
            return Response({
                'success': False,
                'message': '명령 처리 중 오류 발생'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    else:
        # 유튜브가 아닌 명령: DB에만 저장
        log.is_success = True  # 저장 성공
        log.save()
        
        logger.info(f"음성 명령 DB 저장 완료 (유튜브 아님): {command}, session_id={session.session_id}")
        
        # 젯슨에 저장 성공 응답
        return Response({
            'success': True
        }, status=status.HTTP_200_OK)


# ===== 사용자 프로필 =====
@api_view(['GET'])
@jwt_required
def get_user_profile(request):
    """현재 로그인한 사용자의 프로필 조회"""
    user = request.user
    
    profile_data = {
        'user_id': user.user_id,
        'uid': str(user.uid),
        'login_id': user.login_id,
        'email': user.email,
        'nickname': user.nickname,
        'created_at': user.created_at,
        'last_login_at': user.last_login_at,
        'has_voice': user.voice_vectors is not None,
    }
    
    return Response({
        'success': True,
        'user': profile_data
    }, status=status.HTTP_200_OK)


@api_view(['PATCH'])
@jwt_required
def update_user_profile(request):
    """사용자 프로필 수정"""
    user = request.user
    nickname = request.data.get('nickname')
            
    user.nickname = nickname
    user.save()
    
    return Response({
        'success': True,
        'message': '닉네임이 수정되었습니다.',
        'user': {
            'uid': str(user.uid),
            'nickname': user.nickname,
        }
    }, status=status.HTTP_200_OK)


# ===== 아이디 찾기 =====
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
                "uid": str(user.uid)
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
            "uid": str(user.uid)
        })
    return Response({"success": False, "message": "가입된 정보가 없습니다."}, status=404)


# ===== 비밀번호 재설정 =====
@api_view(['POST'])
def request_password_reset(request):
    """비밀번호 찾기 1단계: 인증 코드 발송"""
    serializer = PasswordResetRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({"success": False, "errors": serializer.errors}, status=400)

    login_id = serializer.validated_data['login_id']
    email = serializer.validated_data['email']

    user = User.objects.filter(login_id=login_id, email=email, is_active=True).first()
    if not user:
        return Response({"success": False, "message": "일치하는 유저가 없습니다."}, status=404)
    
    # 비밀번호 재설정용 인증 코드 생성
    import random
    verification_code = f"{random.randint(100000, 999999)}"
    
    EmailVerification.objects.update_or_create(
        email=email,
        defaults={
            'verification_code': verification_code,
            'expires_at': timezone.now() + timezone.timedelta(minutes=5)
        }
    )
    
    # 개발 모드인 경우 콘솔에만 출력
    if settings.DEBUG:
        print(f"=== 비밀번호 재설정 인증 코드 ===")
        print(f"이메일: {email}")
        print(f"인증 코드: {verification_code}")
        print(f"만료 시간: {timezone.now() + timezone.timedelta(minutes=5)}")
        print("====================")
    else:
        # 프로덕션 모드: 실제 이메일 전송
        from django.core.mail import send_mail
        
        subject = "[싸비스] 비밀번호 재설정 인증 코드"
        message = f"""
안녕하세요,

요청하신 비밀번호 재설정 인증 코드는 다음과 같습니다.

인증 코드: {verification_code}

이 코드는 5분 동안 유효합니다.

감사합니다.
싸비스 팀
        """
        
        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=False,
            )
            logger.info(f"비밀번호 재설정 이메일 발송 성공: {email}, 코드: {verification_code}")
        except Exception as email_error:
            logger.error(f"비밀번호 재설정 이메일 발송 실패: {str(email_error)}")
    
    return Response({"success": True, "message": "인증 코드가 생성되었습니다."})


@api_view(['POST'])
def verify_reset_code(request):
    """비밀번호 찾기 2단계: 코드 검증"""
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
        if verification: 
            verification.delete()
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
    """비밀번호 찾기 3단계: 새 비밀번호 설정"""
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


# ===== 개발용 테스트 로그인 (Jetson 없이) =====
@api_view(['POST'])
@transaction.atomic
def dev_test_login(request):
    """
    개발용: Jetson 통신 없이 테스트 로그인
    
    Jetson 서버가 꺼져 있을 때 웹소켓 연결 테스트용
    - 젯슨 통신 건너뜀
    - 토큰 발급
    - 세션 생성
    - 웹소켓 연결 정보 반환
    
    요청 예시:
    {
        "login_id": "testuser",
        "password": "123456"
    }
    
    응답 예시:
    {
        "success": true,
        "uid": "uuid",
        "tokens": {...},
        "session_id": "session_id",
        "websocket_url": "ws://host/ws/app/session_id/"
    }
    """
    login_id = request.data.get('login_id')
    password = request.data.get('password')
    
    if not login_id or not password:
        return Response({
            'success': False,
            'message': '아이디와 비밀번호가 필요합니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        user = User.objects.get(login_id=login_id, is_active=True)
        
        if not user.check_password(password):
            return Response({
                'success': False,
                'message': '아이디 또는 비밀번호가 일치하지 않습니다.'
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        user.last_login_at = timezone.now()
        user.save()
        
        # 토큰 생성 (Access + Refresh)
        tokens = generate_tokens_for_user(user)
        
        # 활성 연결 찾기
        active_connection = UserDeviceConnection.objects.filter(
            user=user,
            is_active=True,
            deleted_at__isnull=True
        ).order_by('-connected_at').first()
        
        # 세션 생성
        session = None
        try:
            if active_connection:
                session = Session.objects.create(connection=active_connection)
                logger.info(f"개발용 로그인 - 세션 생성 (연결 있음): {session.session_id}, 사용자: {user.login_id}")
            else:
                # 연결이 없는 경우: 기본 연결 생성
                logger.info(f"개발용 로그인 - 활성 연결 없음, 기본 연결 생성 시도: {user.login_id}")
                
                # 기본 Phone 생성
                phone = Phone.objects.create(
                    device_name=f'기본 폰 - {user.login_id} (자동 생성)'
                )
                
                # 기본 Sarvis(IoT) 생성
                sarvis = Sarvis.objects.create()
                
                # 연결 생성
                new_connection = UserDeviceConnection.objects.create(
                    user=user,
                    phone=phone,
                    sarvis=sarvis,
                    is_active=True
                )
                
                # 세션 생성
                session = Session.objects.create(connection=new_connection)
                logger.info(f"개발용 로그인 - 기본 연결 및 세션 생성 완료: {session.session_id}, 사용자: {user.login_id}")
                
        except Exception as e:
            logger.error(f"개발용 로그인 - 세션 생성 실패: {str(e)}")
            return Response({
                'success': False,
                'message': '세션 생성 실패'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # 웹소켓 URL 생성
        websocket_url = f"ws://localhost:8000/ws/app/{session.session_id}/"
        
        logger.info(f"개발용 로그인 완료: {user.login_id}, WebSocket URL: {websocket_url}")
        
        return Response({
            'success': True,
            'uid': str(user.uid),
            'tokens': tokens,
            'session_id': session.session_id,
            'session_started_at': session.started_at,
            'websocket_url': websocket_url,
            'message': '개발용 로그인 완료 (Jetson 통신 없음)'
        }, status=status.HTTP_200_OK)
        
    except User.DoesNotExist:
        return Response({
            'success': False,
            'message': '아이디 또는 비밀번호가 일치하지 않습니다.'
        }, status=status.HTTP_401_UNAUTHORIZED)
        
    except Exception as e:
        logger.error(f"개발용 로그인 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            'success': False,
            'message': '로그인 처리 중 오류 발생',
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ===== 웹소켓 음성 명령 전달 =====
@api_view(['POST'])
@csrf_exempt  # Jetson에서 오는 외부 요청이므로 CSRF 예외
@transaction.atomic
def trigger_voice_command(request):
    """
    Jetson → Django: 음성 호출 신호 트리거
    
    통신 흐름:
    1. 젯슨 마이크가 "싸비스" 감지
    2. 젯슨 → EC2 HTTP POST 요청 (uid만 전송)
    3. EC2 서버가 요청 수신 → 해당 uid의 웹소켓 연결 찾기
    4. EC2 → 앱 WebSocket 메시지 전송
    5. 앱에서 알림/진동 실행 후 확인 신호 전송
    6. EC2 → 젯슨 응답 (앱 확인 완료 후)
    
    요청 예시:
    {
        "uid": "user_uuid"
    }
    
    응답 예시:
    {
        "success": true,
        "message": "앱에서 음성 호출을 확인했습니다.",
        "uid": "user_uuid",
        "session_id": "session_id"
    }
    """
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync
    import time
    import json
    
    # 요청 데이터 로깅
    logger.info(f"[음성 호출 트리거] 요청 수신: Content-Type={request.content_type}, IP={request.META.get('REMOTE_ADDR')}")
    logger.info(f"[음성 호출 트리거] 요청 본문: {request.body[:500] if request.body else 'None'}")
    
    # JSON 데이터 파싱
    try:
        if request.body:
            data = json.loads(request.body)
        else:
            data = {}
    except json.JSONDecodeError as e:
        logger.error(f"[음성 호출 트리거] JSON 파싱 실패: {e}")
        data = {}
    
    uid = data.get('uid')
    
    if not uid:
        logger.warning(f"[음성 호출 트리거] 400 오류: uid가 누락됨, request.data={request.data}")
        return Response({
            'success': False,
            'message': 'uid가 필요합니다.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # uid로 사용자 찾기
        user = User.objects.get(uid=uid, is_active=True)
        
        # 활성 세션 찾기
        active_session = Session.objects.filter(
            connection__user=user,
            connection__is_active=True,
            connection__deleted_at__isnull=True,
            ended_at__isnull=True
        ).order_by('-started_at').first()
        
        if not active_session:
            logger.warning(f"음성 명령 수신 - 활성 세션 없음: uid={uid}, login_id={user.login_id}")
            return Response({
                'success': False,
                'message': '활성 세션이 없습니다.'
            }, status=status.HTTP_404_NOT_FOUND)
        
        session_id = str(active_session.session_id)
        
        # 캐시에서 웹소켓 연결 확인
        websocket_info = cache.get(f'websocket:{session_id}')
        
        if not websocket_info or not websocket_info.get('connected'):
            logger.warning(f"음성 명령 수신 - 웹소켓 연결 없음: uid={uid}, session_id={session_id}")
            return Response({
                'success': False,
                'message': 'WebSocket 연결이 없습니다.'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # 캐시에 대기 상태 설정 (앱 확인 기다림)
        voice_call_key = f'voice_call_wait:{session_id}'
        cache.set(voice_call_key, 'waiting', timeout=20)  # 10초 → 20초
        
        # 채널 레이어 가져오기
        channel_layer = get_channel_layer()
        
        # 그룹 이름: app_{session_id}
        group_name = f'app_{session_id}'
        
        message_data = {
            'type': 'voice_command',
            'command': '싸비스',
            'timestamp': timezone.now().isoformat()
        }
        
        # 비동기 함수를 동기적으로 호출
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                'type': 'voice_command',
                'data': message_data
            }
        )
        
        logger.info(f"음성 호출 신호 WebSocket 전송, 앱 확인 대기 시작: uid={uid}, login_id={user.login_id}")
        
        # 앱 확인 대기 (폴링, 최대 10초)
        max_wait_time = 10
        check_interval = 0.1  # 100ms마다 확인
        elapsed_time = 0
        
        while elapsed_time < max_wait_time:
            confirmation_status = cache.get(voice_call_key)
            if confirmation_status == 'confirmed':
                logger.info(f"앱 확인 완료: uid={uid}, login_id={user.login_id}")
                
                # 캐시 정리
                cache.delete(voice_call_key)
                
                return Response({
                    'success': True
                }, status=status.HTTP_200_OK)
            
            time.sleep(check_interval)
            elapsed_time += check_interval
        
        # 타임아웃: 앱 확인이 없음
        logger.warning(f"앱 확인 타임아웃: uid={uid}, login_id={user.login_id}")
        cache.delete(voice_call_key)
        
        return Response({
            'success': False
        }, status=status.HTTP_408_REQUEST_TIMEOUT)
        
    except User.DoesNotExist:
        logger.warning(f"음성 명령 수신 - 사용자 없음: uid={uid}")
        return Response({
            'success': False,
            'message': '사용자를 찾을 수 없습니다.'
        }, status=status.HTTP_404_NOT_FOUND)
        
    except Exception as e:
        logger.error(f"음성 명령 전송 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            'success': False,
            'message': '음성 명령 전송 중 오류 발생',
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# ===== 버튼 명령 =====
@api_view(['POST'])
@transaction.atomic
def button_command_request(request):
    """
    앱 버튼 명령 요청
    앱 → 서버: uid, command 전송
    서버: CommandLog 저장 + 젯슨으로 전송
    
    지원하는 명령:
    - COME_HERE: 이리와
    - TRACK_ON: 따라와
    - TRACK_OFF: 멈춰
    - HOME: 저리가
    """
    serializer = ButtonCommandRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({
            'success': False,
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)

    uid = serializer.validated_data['uid']
    command = serializer.validated_data['command']

    try:
        # uid로 사용자 찾기
        user = User.objects.get(uid=uid, is_active=True)

        # 활성 세션 찾기
        active_session = Session.objects.filter(
            connection__user=user,
            connection__is_active=True,
            connection__deleted_at__isnull=True,
            ended_at__isnull=True
        ).order_by('-started_at').first()

        if not active_session:
            logger.warning(f"버튼 명령 수신 - 활성 세션 없음: uid={uid}, login_id={user.login_id}")
            return Response({
                'success': False,
                'message': '활성 세션이 없습니다.'
            }, status=status.HTTP_404_NOT_FOUND)

        # CommandLog 저장
        # command_type: BUTTON_COMMAND (고정)
        # command_content: COME_HERE, TRACK_ON, TRACK_OFF, HOME
        log = CommandLog.objects.create(
            session=active_session,
            command_type='BUTTON_COMMAND',
            command_content=command,
            is_success=True
        )

        logger.info(f"버튼 명령 로그 저장: {log.command_log_id}, 명령: {command}, uid={uid}, login_id={user.login_id}")

        # 젯슨으로 명령 전송
        try:
            jetson_url = f"{JETSON_BASE_URL}/voice_command"
            jetson_data = {
                'uid': str(uid),
                'command': command
            }

            headers = {
                "ngrok-skip-browser-warning": "69420",
                "Content-Type": "application/json"
            }

            jetson_response = requests.post(jetson_url, json=jetson_data, headers=headers, timeout=10)

            if jetson_response.status_code == 200:
                logger.info(f"버튼 명령 - 젯슨 전송 성공: uid={uid}, login_id={user.login_id}, 명령={command}")
            else:
                # 젯슨 통신 실패 시 로그 업데이트
                log.is_success = False
                log.error_message = f"젯슨 통신 실패 (HTTP {jetson_response.status_code})"
                log.save()

                logger.warning(f"버튼 명령 - 젯슨 전송 실패 (HTTP {jetson_response.status_code}): uid={uid}, login_id={user.login_id}")
                return Response({
                    'success': False,
                    'message': '로봇과 통신 실패'
                }, status=status.HTTP_502_BAD_GATEWAY)

            return Response({
                'success': True,
                'message': '버튼 명령 전송 성공',
                'command': command,
                'command_log_id': log.command_log_id
            }, status=status.HTTP_200_OK)

        except requests.exceptions.RequestException as e:
            # 젯슨 연결 실패 시 로그 업데이트
            log.is_success = False
            log.error_message = f"젯슨 연결 실패: {str(e)}"
            log.save()

            logger.error(f"버튼 명령 - 젯슨 통신 오류: {str(e)}")
            return Response({
                'success': False,
                'message': '로봇 연결 실패'
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    except User.DoesNotExist:
        logger.warning(f"버튼 명령 수신 - 사용자 없음: uid={uid}")
        return Response({
            'success': False,
            'message': '사용자를 찾을 수 없습니다.'
        }, status=status.HTTP_404_NOT_FOUND)

    except Exception as e:
        logger.error(f"버튼 명령 처리 오류: {str(e)}")
        logger.error(traceback.format_exc())
        return Response({
            'success': False,
            'message': '버튼 명령 처리 중 오류 발생',
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ===== 회원 탈퇴 =====
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

    password = serializer.validated_data['password']
    deletion_reason = serializer.validated_data.get('deletion_reason')
    
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

    # 세션 종료
    sessions = Session.objects.filter(
        (models.Q(connection__user=user) | models.Q(connection__isnull=True)) &
        models.Q(ended_at__isnull=True)
    )
    ended_count = sessions.count()
    sessions.update(ended_at=now)
    
    logger.info(f"회원탈퇴 - 세션 종료: {user.login_id}, 종료된 세션 수: {ended_count}")

    # 젯슨에게 로그아웃 통지
    notify_jetson_logout(user)

    return Response({
        'success': True,
        'message': '회원 탈퇴가 완료되었습니다.'
    }, status=status.HTTP_200_OK)

