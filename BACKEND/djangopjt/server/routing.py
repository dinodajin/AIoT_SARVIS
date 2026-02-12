from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/dashboard/$', consumers.DashboardConsumer.as_asgi()),
]

application = ProtocolTypeRouter({
    "websocket": websocket_urlpatterns,
    "http": django_asgi_app,
})
