"""
Celery Configuration for SARVIS Project
비동기 작업 처리 및 스케줄링 설정
"""
from celery import Celery
import os

# Django settings 모듈 경로 설정
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'server.settings')

# Celery 앱 생성
app = Celery('sarvis')

# Django settings에서 CELERY_ 접두사가 있는 설정들 자동 로드
app.config_from_object('django.conf:settings', namespace='CELERY')

# installed_apps에서 tasks.py 자동으로 등록
app.autodiscover_tasks()