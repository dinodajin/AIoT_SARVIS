# accounts/app_consumer.py
import logging
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db.models import Q
from django.core.cache import cache
from django.utils import timezone
from datetime import timedelta

from .models import User, UserDeviceConnection, Session

logger = logging.getLogger(__name__)


class AppConsumer(AsyncJsonWebsocketConsumer):
    """
    앱 WebSocket Consumer
    앱 ↔ 서버 실시간 통신
    
    URL: ws/app/{session_id}/
    """
   
    async def connect(self):
        """WebSocket 연결"""
        # URL에서 session_id 추출
        session_id = self.scope['url_route']['kwargs']['session_id']
        
        try:
            # DB에서 세션 정보 조회
            # 비동기 쿼리를 사용하려면 Django Channels의 database_sync_to_async 사용
            from asgiref.sync import sync_to_async
            
            @sync_to_async
            def get_session():
                return Session.objects.select_related('connection__user', 'connection__phone').filter(
                    session_id=session_id,
                    ended_at__isnull=True  # 활성 세션만
                ).first()
            
            self.session = await get_session()
            
            if not self.session:
                logger.warning(f"앱 연결 실패 - 세션 없음 또는 종료됨: {session_id}")
                await self.close(code=4001)
                return
            
            # Session에서 connection 추출
            self.connection = self.session.connection
            session_id = str(self.session.session_id)
            
            # 세션 사용
            logger.info(f"앱 WebSocket - 세션 사용: {session_id}, 사용자: {self.connection.user.login_id}")
            
            # 그룹에 참여 (음성 명령 전송용)
            self.group_name = f'app_{session_id}'
            await self.channel_layer.group_add(
                self.group_name,
                self.channel_name
            )
            
            # 연결 수락
            await self.accept()
            
            # 캐시에 WebSocket 연결 정보 저장
            cache.set(
                f'websocket:{session_id}',
                {
                    'connected': True,
                    'connected_at': timezone.now().isoformat(),
                    'session_id': session_id
                },
                timeout=300  # 5분
            )
            
            logger.info(f"앱 WebSocket 연결 성공: {session_id}, 사용자: {self.connection.user.login_id}")
            
            # 연결 성공 메시지 전송
            await self.send_json({
                'type': 'connection_established',
                'message': 'WebSocket 연결이 성공했습니다.',
                'session_id': session_id,
                'user': {
                    'uid': str(self.connection.user.uid),
                    'login_id': self.connection.user.login_id,
                    'nickname': self.connection.user.nickname
                }
            })
            
        except Exception as e:
            logger.error(f"앱 WebSocket 연결 오류: {str(e)}")
            await self.close(code=4000)
    
    async def disconnect(self, close_code):
        """WebSocket 연결 종료"""
        if hasattr(self, 'session') and self.session:
            session_id = str(self.session.session_id)
            
            # 그룹에서 탈퇴
            if hasattr(self, 'group_name'):
                await self.channel_layer.group_discard(
                    self.group_name,
                    self.channel_name
                )
            
            # 캐시에서 WebSocket 연결 정보 삭제
            cache.delete(f'websocket:{session_id}')
            
            logger.info(f"앱 WebSocket 연결 종료: {session_id}, 코드: {close_code}")
    
    async def receive_json(self, content):
        """JSON 메시지 수신"""
        try:
            message_type = content.get('type')
            
            if message_type == 'ping':
                await self.handle_ping(content)
            elif message_type == 'voice_call_confirmation':
                # 앱 → 서버: 음성 호출 신호 확인
                await self.voice_call_confirmation({'type': 'voice_call_confirmation'})
            elif message_type == 'youtube_command_ack':
                # 앱 → 서버: 유튜브 명령 실행 결과 확인
                await self.youtube_command_confirmation(content)
            elif message_type == 'youtube_command_confirmation':
                # 앱 → 서버: 유튜브 명령 실행 결과 확인 (대체 이름)
                await self.youtube_command_confirmation(content)
            elif message_type == 'youtube_command_report':
                # 앱 → 서버: 유튜브 명령 실행 보고
                await self.youtube_command_report(content)
            elif message_type == 'feedback_confirmation':
                # 앱 → 서버: 피드백 알림 확인
                await self.feedback_confirmation({'type': 'feedback_confirmation'})
            else:
                logger.warning(f"알 수 없는 메시지 타입: {message_type}")
                await self.send_json({
                    'type': 'error',
                    'message': f'Unknown message type: {message_type}'
                })
                
        except Exception as e:
            logger.error(f"메시지 처리 오류: {str(e)}")
            await self.send_json({
                'type': 'error',
                'message': 'Message processing error'
            })
    
    async def handle_ping(self, content):
        """Ping 메시지 처리"""
        await self.send_json({
            'type': 'pong',
            'timestamp': timezone.now().isoformat()
        })
    
    async def voice_command(self, event):
        """
        그룹에서 음성 명령 메시지 수신 (싸비스 호출어)
        젯슨 → Django HTTP → WebSocket 그룹 → 앱
        """
        message_data = event.get('data', {})
        
        logger.info(f"앱으로 음성 호출 전송: session_id={self.session.session_id}, command={message_data.get('command')}")
        
        # 앱으로 JSON 메시지 전송
        await self.send_json({
            'type': 'voice_command',
            'command': message_data.get('command'),
            'timestamp': message_data.get('timestamp')
        })
    
    async def robot_command(self, event):
        """
        그룹에서 로봇 제어 명령 메시지 수신
        젯슨 → Django HTTP → WebSocket 그룹 → 앱
        """
        message_data = event.get('data', {})
        
        logger.info(f"앱으로 로봇 제어 명령 전송: session_id={self.session.session_id}, command={message_data.get('command')}")
        
        # 앱으로 JSON 메시지 전송
        await self.send_json({
            'type': 'robot_command',
            'command': message_data.get('command'),
            'timestamp': message_data.get('timestamp')
        })
    
    async def feedback_notification(self, event):
        """
        그룹에서 피드백 알림 메시지 수신
        젯슨 → Django HTTP → WebSocket 그룹 → 앱
        """
        message_data = event.get('data', {})
        
        logger.info(f"앱으로 피드백 알림 전송: session_id={self.session.session_id}, message={message_data.get('message')}")
        
        # 앱으로 JSON 메시지 전송
        await self.send_json({
            'type': 'feedback_notification',
            'message': message_data.get('message'),
            'notification_type': message_data.get('notification_type'),
            'timestamp': message_data.get('timestamp')
        })
    
    async def youtube_command(self, event):
        """
        그룹에서 유튜브 명령 메시지 수신
        젯슨 → Django HTTP → WebSocket 그룹 → 앱
        """
        message_data = event.get('data', {})
        
        logger.info(f"앱으로 유튜브 명령 전송: session_id={self.session.session_id}, command={message_data.get('command')}")
        
        # 앱으로 JSON 메시지 전송
        await self.send_json({
            'type': 'youtube_command',
            'command': message_data.get('command'),
            'timestamp': message_data.get('timestamp')
        })
    
    async def voice_call_confirmation(self, event):
        """
        앱 → Django: 음성 호출 신호 확인
        
        앱이 "싸비스" 신호를 수신했을 때 서버에 확인을 전송
        """
        session_id = str(self.session.session_id)
        
        # 캐시에서 대기 중인 음성 호출 요청 확인
        voice_call_key = f'voice_call_wait:{session_id}'
        
        if cache.get(voice_call_key):
            # 대기 상태 확인 성공으로 변경
            cache.set(voice_call_key, 'confirmed', timeout=30)
            logger.info(f"앱에서 음성 호출 신호 확인 완료: session_id={session_id}")
            
            # 앱으로 응답
            await self.send_json({
                'type': 'voice_call_confirmation_ack',
                'confirmed': True,
                'session_id': session_id,
                'message': '음성 호출 신호가 서버에 전달되었습니다.'
            })
        else:
            # 대기 중인 요청 없음
            logger.warning(f"대기 중인 음성 호출 요청 없음: session_id={session_id}")
            await self.send_json({
                'type': 'voice_call_confirmation_ack',
                'confirmed': False,
                'session_id': session_id,
                'message': '대기 중인 음성 호출 요청이 없습니다.'
            })
    
    async def youtube_command_confirmation(self, event):
        """
        앱 → Django: 유튜브 명령 실행 결과 확인 신호 수신
        앱에서 유튜브 명령 실행(재생/일시정지/탐색) 완료 후 웹소켓으로 결과 전송
        """
        session_id = str(self.session.session_id)
        
        # 앱 데이터에서 success 추출 (data.status 형식)
        data = event.get('data', {})
        status = data.get('status')
        success = (status == 'success')
        
        # 캐시에서 대기 중인 요청 확인
        youtube_command_key = f'youtube_command_wait:{session_id}'
        
        if cache.get(youtube_command_key):
            # 실행 결과 상태로 변경
            status = 'success' if success else 'failed'
            cache.set(youtube_command_key, status, timeout=30)
            logger.info(f"앱에서 유튜브 명령 실행 완료: session_id={session_id}, 성공={success}")
            
            # 앱으로 응답
            await self.send_json({
                'type': 'youtube_command_confirmation_ack',
                'confirmed': True,
                'success': success,
                'session_id': session_id,
                'message': '유튜브 명령 실행 결과가 전달되었습니다.'
            })
        else:
            # 대기 중인 요청 없음
            logger.warning(f"대기 중인 유튜브 명령 요청 없음: session_id={session_id}")
            await self.send_json({
                'type': 'youtube_command_confirmation_ack',
                'confirmed': False,
                'session_id': session_id,
                'message': '대기 중인 유튜브 명령 요청이 없습니다.'
            })
    
    async def youtube_command_report(self, event):
        """
        앱 → Django: 유튜브 명령 실행 보고
        앱에서 직접(수동/음성) 실행한 유튜브 명령 정보를 서버에 보고
        """
        command = event.get('command')
        status = event.get('status')
        
        logger.info(f"앱에서 유튜브 명령 실행 보고: command={command}, status={status}, session_id={self.session.session_id}")
        
        # 여기서 추가 로직이 필요하면 구현 (예: 로그 저장, 알림 등)
        # 현재는 로그만 남기고 응답
        await self.send_json({
            'type': 'youtube_command_report_ack',
            'confirmed': True,
            'session_id': str(self.session.session_id),
            'message': f'유튜브 명령 실행 보고가 접수되었습니다: {command}'
        })
    
    async def feedback_confirmation(self, event):
        """
        앱 → Django: 피드백 알림 확인 신호 수신
        앱에서 알림 처리(사운드 재생) 완료 후 웹소켓으로 확인 신호 전송
        """
        session_id = str(self.session.session_id)
        
        # 캐시에서 대기 중인 요청 확인
        from asgiref.sync import sync_to_async
        
        @sync_to_async
        def confirm_notification():
            notification_key = f'feedback_notification:{session_id}'
            if cache.get(notification_key):
                # 알림 확인 상태로 변경
                cache.set(notification_key, 'confirmed', timeout=30)
                logger.info(f"앱에서 피드백 알림 확인 완료: session_id={session_id}")
                return True
            return False
        
        confirmed = await confirm_notification()
        
        # 앱으로 응답
        await self.send_json({
            'type': 'feedback_confirmation_ack',
            'confirmed': confirmed,
            'session_id': session_id,
            'message': '알림 확인이 완료되었습니다.' if confirmed else '대기 중인 알림 요청이 없습니다.'
        })
