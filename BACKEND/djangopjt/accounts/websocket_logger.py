"""
WebSocket 연결 상태 로깅 유틸리티

WebSocket 연결, 메시지 송수신, 연결 종료 등의 상태를 상세하게 로깅합니다.
"""
import logging
from datetime import datetime
from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger('accounts.websocket_logger')


class WebSocketLogger:
    """WebSocket 연결 상태 로거"""
    
    @staticmethod
    def log_connection_attempt(session_id, client_ip, user_agent):
        """연결 시도 로그"""
        logger.info(
            f"[WS 연결 시도] session_id={session_id}, "
            f"IP={client_ip}, "
            f"User-Agent={user_agent[:50] if user_agent else 'unknown'}, "
            f"timestamp={timezone.now().isoformat()}"
        )
    
    @staticmethod
    def log_connection_success(session_id, user_id, user_login_id, client_ip, channel_name):
        """연결 성공 로그"""
        # 캐시에 연결 정보 저장
        cache.set(
            f'ws_status:{session_id}',
            {
                'status': 'connected',
                'user_id': user_id,
                'user_login_id': user_login_id,
                'client_ip': client_ip,
                'channel_name': channel_name,
                'connected_at': timezone.now().isoformat(),
            },
            timeout=3600  # 1시간
        )
        
        logger.info(
            f"[WS 연결 성공] session_id={session_id}, "
            f"user={user_login_id}, "
            f"user_id={user_id}, "
            f"IP={client_ip}, "
            f"channel={channel_name}, "
            f"timestamp={timezone.now().isoformat()}"
        )
    
    @staticmethod
    def log_connection_failed(session_id, client_ip, reason):
        """연결 실패 로그"""
        logger.warning(
            f"[WS 연결 실패] session_id={session_id}, "
            f"IP={client_ip}, "
            f"reason={reason}, "
            f"timestamp={timezone.now().isoformat()}"
        )
    
    @staticmethod
    def log_disconnect(session_id, user_id, close_code, connection_duration=None, channel_name=None):
        """연결 종료 로그"""
        # 종료 사유 분석
        close_reasons = {
            1000: "정상 종료",
            1001: "엔드포인트 이동",
            1002: "프로토콜 오류",
            1003: "지원하지 않는 데이터 타입",
            1006: "연결 비정상 종료",
            4000: "서버 오류",
            4001: "세션 없음",
        }
        close_reason = close_reasons.get(close_code, f"알 수 없는 코드: {close_code}")
        
        # 캐시에서 연결 정보 삭제
        cache.delete(f'ws_status:{session_id}')
        
        duration_str = f"{connection_duration:.2f}초" if connection_duration else "알 수 없음"
        
        logger.info(
            f"[WS 연결 종료] session_id={session_id}, "
            f"user_id={user_id}, "
            f"code={close_code} ({close_reason}), "
            f"duration={duration_str}, "
            f"channel={channel_name}, "
            f"timestamp={timezone.now().isoformat()}"
        )
    
    @staticmethod
    def log_message_sent(session_id, message_type, details=None):
        """메시지 송신 로그"""
        details_str = f", details={details}" if details else ""
        logger.debug(
            f"[WS 송신] session_id={session_id}, "
            f"type={message_type}"
            f"{details_str}, "
            f"timestamp={timezone.now().isoformat()}"
        )
    
    @staticmethod
    def log_message_received(session_id, message_type, size=None):
        """메시지 수신 로그"""
        size_str = f", size={size}바이트" if size else ""
        logger.debug(
            f"[WS 수신] session_id={session_id}, "
            f"type={message_type}"
            f"{size_str}, "
            f"timestamp={timezone.now().isoformat()}"
        )
    
    @staticmethod
    def log_message_processing_error(session_id, message_type, error):
        """메시지 처리 오류 로그"""
        logger.error(
            f"[WS 메시지 처리 오류] session_id={session_id}, "
            f"type={message_type}, "
            f"error={str(error)}, "
            f"timestamp={timezone.now().isoformat()}",
            exc_info=True
        )
    
    @staticmethod
    def log_unknown_message(session_id, message_type, payload):
        """알 수 없는 메시지 로그"""
        logger.warning(
            f"[WS 알 수 없는 메시지] session_id={session_id}, "
            f"type={message_type}, "
            f"payload={payload}, "
            f"timestamp={timezone.now().isoformat()}"
        )
    
    @staticmethod
    def log_error(session_id, error_type, error_message):
        """일반 오류 로그"""
        logger.error(
            f"[WS 오류] session_id={session_id}, "
            f"type={error_type}, "
            f"message={error_message}, "
            f"timestamp={timezone.now().isoformat()}",
            exc_info=True
        )
    
    @staticmethod
    def get_connection_status(session_id):
        """연결 상태 조회"""
        return cache.get(f'ws_status:{session_id}')
    
    @staticmethod
    def get_all_active_connections():
        """모든 활성 연결 조회 (캐시 키 패턴으로 검색)"""
        # 주의: Redis를 사용하는 경우 keys 명령은 프로덕션에서 피해야 함
        # 대신 SCAN 명령이나 별도의 연결 추적 시스템 사용 권장
        try:
            # 캐시가 Redis 기반이라고 가정
            from django.core.cache import cache
            if hasattr(cache, 'keys'):
                keys = cache.keys('ws_status:*')
                connections = []
                for key in keys:
                    status = cache.get(key)
                    if status:
                        connections.append(status)
                return connections
            else:
                # LocMemCache 등 다른 백엔드인 경우
                return []
        except Exception as e:
            logger.error(f"활성 연결 조회 실패: {str(e)}")
            return []


# 편의 함수들
def log_ws_connect_attempt(session_id, client_ip, user_agent):
    """연결 시도 로그 (편의 함수)"""
    WebSocketLogger.log_connection_attempt(session_id, client_ip, user_agent)


def log_ws_connect_success(session_id, user_id, user_login_id, client_ip, channel_name):
    """연결 성공 로그 (편의 함수)"""
    WebSocketLogger.log_connection_success(session_id, user_id, user_login_id, client_ip, channel_name)


def log_ws_connect_failed(session_id, client_ip, reason):
    """연결 실패 로그 (편의 함수)"""
    WebSocketLogger.log_connection_failed(session_id, client_ip, reason)


def log_ws_disconnect(session_id, user_id, close_code, connection_duration=None, channel_name=None):
    """연결 종료 로그 (편의 함수)"""
    WebSocketLogger.log_disconnect(session_id, user_id, close_code, connection_duration, channel_name)


def log_ws_send(session_id, message_type, details=None):
    """메시지 송신 로그 (편의 함수)"""
    WebSocketLogger.log_message_sent(session_id, message_type, details)


def log_ws_receive(session_id, message_type, size=None):
    """메시지 수신 로그 (편의 함수)"""
    WebSocketLogger.log_message_received(session_id, message_type, size)


def log_ws_error(session_id, error_type, error_message):
    """오류 로그 (편의 함수)"""
    WebSocketLogger.log_error(session_id, error_type, error_message)


def get_ws_status(session_id):
    """연결 상태 조회 (편의 함수)"""
    return WebSocketLogger.get_connection_status(session_id)