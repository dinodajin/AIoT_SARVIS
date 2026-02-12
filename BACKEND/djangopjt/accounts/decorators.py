# accounts/decorators.py
"""
인증 관련 데코레이터
"""

from functools import wraps
from rest_framework.response import Response
from rest_framework import status
from .auth_utils import get_user_from_token


def jwt_required(func):
    """
    JWT 인증이 필요한 뷰 함수를 위한 데코레이터
    
    사용 예:
        @api_view(['GET'])
        @jwt_required
        def protected_view(request):
            user = request.user  # 인증된 사용자 객체
            ...
    """
    @wraps(func)
    def wrapper(request, *args, **kwargs):
        user = get_user_from_token(request)
        
        if user is None:
            return Response({
                'success': False,
                'message': '인증이 필요합니다.',
                'error_code': 'AUTHENTICATION_REQUIRED'
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        # request 객체에 user 추가
        request.user = user
        
        return func(request, *args, **kwargs)
    
    return wrapper


def jwt_optional(func):
    """
    JWT 인증이 선택적인 뷰 함수를 위한 데코레이터
    토큰이 있으면 인증하고, 없으면 request.user를 None으로 설정
    
    사용 예:
        @api_view(['GET'])
        @jwt_optional
        def semi_protected_view(request):
            if request.user:
                # 로그인된 사용자용 로직
            else:
                # 비로그인 사용자용 로직
    """
    @wraps(func)
    def wrapper(request, *args, **kwargs):
        user = get_user_from_token(request)
        request.user = user  # None일 수도 있음
        
        return func(request, *args, **kwargs)
    
    return wrapper