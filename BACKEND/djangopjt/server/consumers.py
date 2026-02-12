import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from accounts.models import CommandLog, Session

logger = logging.getLogger(__name__)

class DashboardConsumer(AsyncWebsocketConsumer):
    """웹 대시보드용 Consumer - 단순 데이터 브로드캐스팅"""
    
    async def connect(self):
        await self.accept()
        self.room_name = 'dashboard'
        await self.channel_layer.group_add(self.room_name, self.channel_name)
        logger.info(f"웹 대시보드 연결됨")
    
    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_name, self.channel_name)
        logger.info(f"웹 대시보드 연결 종료")
    
    async def receive(self, text_data):
        # 데이터 브로드캐스팅을 위한 허용/인증 필요
        await self.broadcast_state()
    
    async def broadcast_state(self):
        """최근 로그와 현재 상태를 브로드캐스팅"""
        # 최근 명령 로그 조회
        recent_logs = await sync_to_async(CommandLog.objects.select_related)(
            command_type__in=['BUTTON', 'VOICE'],
            is_success=True
        )[:10].order_by('-occurred_at')
        
        logs_data = [
            {
                'type': log.command_type,
                'content': log.command_content,
                'timestamp': log.occurred_at.isoformat()
            }
            for log in recent_logs
        ]
        
        # 웹 클라이언트에 브로드캐스팅
        await self.channel_layer.group_send(
            self.room_name,
            json.dumps({
                'type': 'state_update',
                'logs': logs_data
            })
        )
