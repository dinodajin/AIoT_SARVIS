# accounts/auth_utils.py
"""
JWT 토큰 생성 및 검증 유틸리티
djangorestframework-simplejwt 설치 필요: pip install djangorestframework-simplejwt
"""

from datetime import datetime, timedelta
from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.contrib.auth import get_user_model
import jwt

User = get_user_model()


def generate_tokens_for_user(user):
    """
    사용자에 대한 Access Token과 Refresh Token 생성
    
    Args:
        user: User 모델 인스턴스
        
    Returns:
        dict: {
            'access': str,
            'refresh': str,
            'access_expires_in': int (초),
            'refresh_expires_in': int (초)
        }
    """
    refresh = RefreshToken.for_user(user)
    
    # 커스텀 클레임 추가
    refresh['user_id'] = user.user_id
    refresh['login_id'] = user.login_id
    refresh['email'] = user.email
    refresh['nickname'] = user.nickname
    
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'access_expires_in': int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds()),
        'refresh_expires_in': int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
    }


def decode_access_token(token):
    """
    Access Token 디코딩 및 검증
    
    Args:
        token: JWT access token 문자열
        
    Returns:
        dict: 디코딩된 페이로드
        
    Raises:
        AuthenticationFailed: 토큰이 유효하지 않을 경우
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=['HS256']
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise AuthenticationFailed('토큰이 만료되었습니다.')
    except jwt.InvalidTokenError:
        raise AuthenticationFailed('유효하지 않은 토큰입니다.')


class JWTAuthentication(BaseAuthentication):
    """
    커스텀 JWT 인증 클래스
    헤더에서 토큰을 추출하고 사용자를 인증합니다.
    """
    
    def authenticate(self, request):
        """
        Authorization 헤더에서 JWT 토큰을 추출하여 인증
        
        Args:
            request: Django Request 객체
            
        Returns:
            tuple: (user, token) or None
        """
        auth_header = request.headers.get('Authorization')
        
        if not auth_header:
            return None
        
        try:
            # "Bearer <token>" 형식에서 토큰 추출
            prefix, token = auth_header.split(' ')
            
            if prefix.lower() != 'bearer':
                raise AuthenticationFailed('인증 헤더 형식이 올바르지 않습니다.')
            
            payload = decode_access_token(token)
            
            # 페이로드에서 user_id 추출
            user_id = payload.get('user_id')
            if not user_id:
                raise AuthenticationFailed('토큰에 사용자 정보가 없습니다.')
            
            # 사용자 조회
            try:
                user = User.objects.get(user_id=user_id, is_active=True)
            except User.DoesNotExist:
                raise AuthenticationFailed('사용자를 찾을 수 없습니다.')
            
            return (user, token)
            
        except ValueError:
            raise AuthenticationFailed('인증 헤더 형식이 올바르지 않습니다.')
        except Exception as e:
            raise AuthenticationFailed(f'인증 실패: {str(e)}')


def get_user_from_token(request):
    """
    요청에서 토큰을 추출하여 사용자 객체 반환
    
    Args:
        request: Django Request 객체
        
    Returns:
        User: 인증된 사용자 객체 또는 None
    """
    auth = JWTAuthentication()
    try:
        user_auth = auth.authenticate(request)
        if user_auth is not None:
            return user_auth[0]
    except AuthenticationFailed:
        pass
    
    return None