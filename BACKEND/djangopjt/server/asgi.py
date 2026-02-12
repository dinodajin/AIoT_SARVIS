import os
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'server.settings')

django_asgi_app = get_asgi_application()

import accounts.routing

application = ProtocolTypeRouter({
    "websocket": AuthMiddlewareStack(
        URLRouter(
            accounts.routing.websocket_urlpatterns
        )
    ),
    "http": django_asgi_app,
})
