from django.urls import re_path
from . import app_consumer

websocket_urlpatterns = [
    # 앱 WebSocket 연결 - session_id 사용
    # Jetson이 "싸비스" 호출어를 감지하면 Django가 이 WebSocket으로 음성 명령 전송
    re_path(r'ws/app/(?P<session_id>[^/]+)/$', app_consumer.AppConsumer.as_asgi()),
]
