"""
Celery Tasks for SARVIS Project
세션 타임아웃 체크 및 비동기 작업 처리
"""
from celery import shared_task
from django.utils import timezone
from datetime import timedelta
from accounts.models import Session
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import logging
import requests
import os

logger = logging.getLogger(__name__)

# 젯슨 베이스 URL (settings.py의 JETSON_BASE_URL과 동일)
JETSON_BASE_URL = os.getenv('JETSON_BASE_URL', 'https://unforetold-jannet-hydropically.ngrok-free.dev')


def notify_jetson_logout(user):
    """
    젯슨에게 로그아웃 요청 전송 (재사용 가능한 헬퍼 함수)
    
    Args:
        user: User 모델 인스턴스
    
    Returns:
        bool: 성공 여부
    """
    try:
        headers = {
            "ngrok-skip-browser-warning": "69420",
            "Content-Type": "application/json"
        }
        
        jetson_url = f"{JETSON_BASE_URL}/logout"
        jetson_response = requests.post(jetson_url, json={}, headers=headers, timeout=10)
        
        if jetson_response.status_code == 200:
            logger.info(f"젯슨 로그아웃 통지 성공: {user.login_id}")
            return True
        else:
            logger.warning(f"젯슨 로그아웃 통지 실패 (HTTP {jetson_response.status_code}): {user.login_id}")
            return False
            
    except requests.exceptions.RequestException as e:
        logger.error(f"젯슨 로그아웃 통신 오류: {str(e)}")
        return False


@shared_task
def check_session_timeout():
    """
    세션 타임아웃 체크 Celery Task (사용 안 함)
    
    하트비트 로직 제거로 인해 더 이상 사용되지 않습니다.
    수동 로그아웃 시에만 세션이 종료됩니다.
    
    Returns:
        str: 비활성화된 태스크 메시지
    """
    logger.debug('세션 타임아웃 체크: 하트비트 로직 제거로 비활성화됨')
    return "Task disabled - no heartbeat mechanism"
