#!/usr/bin/env python3
"""
Jetson SoftAP 통신 테스트 서버
SoftAP 방식으로 연결된 클라이언트(앱)와 통신하는 테스트 서버
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)

# 저장 경로 설정
UPLOAD_FOLDER = 'uploads'
IMAGES_FOLDER = os.path.join(UPLOAD_FOLDER, 'images')
AUDIO_FOLDER = os.path.join(UPLOAD_FOLDER, 'audio')

# 폴더 생성
os.makedirs(IMAGES_FOLDER, exist_ok=True)
os.makedirs(AUDIO_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

@app.route('/api/health', methods=['GET'])
def health_check():
    """서버 상태 확인"""
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.now().isoformat(),
        'message': 'Jetson SoftAP 서버가 정상 작동 중입니다'
    })

@app.route('/api/echo', methods=['POST'])
def echo_test():
    """Echo 테스트 - 메시지 수신 및 응답"""
    data = request.get_json()
    message = data.get('message', '')
    
    return jsonify({
        'status': 'success',
        'reply': f'Echo: {message}',
        'received_at': datetime.now().isoformat()
    })

@app.route('/api/upload/image', methods=['POST'])
def upload_image():
    """이미지 업로드 수신"""
    if 'image' not in request.files:
        return jsonify({'error': '이미지 파일이 없습니다'}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': '파일 이름이 없습니다'}), 400
    
    # 고유 파일명 생성
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f'image_{timestamp}.jpg'
    filepath = os.path.join(IMAGES_FOLDER, filename)
    
    file.save(filepath)
    
    print(f'이미지 수신 완료: {filename} ({os.path.getsize(filepath)} bytes)')
    
    return jsonify({
        'status': 'success',
        'message': '이미지 업로드 성공',
        'filename': filename,
        'path': filepath,
        'size': os.path.getsize(filepath)
    })

@app.route('/api/images/<filename>')
def get_image(filename):
    """이미지 다운로드 제공"""
    filepath = os.path.join(IMAGES_FOLDER, filename)
    
    if not os.path.exists(filepath):
        return jsonify({'error': '파일을 찾을 수 없습니다'}), 404
    
    return send_file(filepath, mimetype='image/jpeg')

@app.route('/api/upload/audio', methods=['POST'])
def upload_audio():
    """오디오 업로드 수신"""
    if 'audio' not in request.files:
        return jsonify({'error': '오디오 파일이 없습니다'}), 400
    
    file = request.files['audio']
    if file.filename == '':
        return jsonify({'error': '파일 이름이 없습니다'}), 400
    
    # 고유 파일명 생성
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    ext = os.path.splitext(file.filename)[1]
    filename = f'audio_{timestamp}{ext}'
    filepath = os.path.join(AUDIO_FOLDER, filename)
    
    file.save(filepath)
    
    print(f'오디오 수신 완료: {filename} ({os.path.getsize(filepath)} bytes)')
    
    return jsonify({
        'status': 'success',
        'message': '오디오 업로드 성공',
        'filename': filename,
        'path': filepath,
        'size': os.path.getsize(filepath)
    })

@app.route('/api/audio/<filename>')
def get_audio(filename):
    """오디오 다운로드 제공"""
    filepath = os.path.join(AUDIO_FOLDER, filename)
    
    if not os.path.exists(filepath):
        return jsonify({'error': '파일을 찾을 수 없습니다'}), 404
    
    return send_file(filepath, mimetype='audio/wav')

@app.route('/api/files', methods=['GET'])
def list_files():
    """업로드된 파일 목록 조회"""
    images = []
    audio = []
    
    if os.path.exists(IMAGES_FOLDER):
        images = [f for f in os.listdir(IMAGES_FOLDER) if f.endswith(('.jpg', '.jpeg', '.png'))]
    
    if os.path.exists(AUDIO_FOLDER):
        audio = [f for f in os.listdir(AUDIO_FOLDER) if f.endswith(('.wav', '.mp3', '.m4a'))]
    
    return jsonify({
        'status': 'success',
        'images': sorted(images, reverse=True),
        'audio': sorted(audio, reverse=True)
    })

@app.route('/', methods=['GET'])
def index():
    """서버 정보 페이지"""
    return jsonify({
        'server': 'Jetson SoftAP 통신 테스트 서버',
        'version': '1.0.0',
        'endpoints': {
            'health': 'GET /api/health - 서버 상태 확인',
            'echo': 'POST /api/echo - Echo 테스트',
            'upload_image': 'POST /api/upload/image - 이미지 업로드',
            'get_image': 'GET /api/images/<filename> - 이미지 다운로드',
            'upload_audio': 'POST /api/upload/audio - 오디오 업로드',
            'get_audio': 'GET /api/audio/<filename> - 오디오 다운로드',
            'list_files': 'GET /api/files - 파일 목록 조회'
        }
    })

# 새로운 엔드포인트: 얼굴 이미지 업로드 (다중)
@app.route('/upload_face', methods=['POST'])
def upload_face_images():
    """다중 얼굴 이미지 업로드 수신 - 회원가입용"""
    try:
        uid = request.form.get('uid', 'unknown')
        images = request.files.getlist('image')
        
        if not images:
            return jsonify({'error': '이미지 파일이 없습니다'}), 400
        
        saved_files = []
        for idx, file in enumerate(images):
            if file.filename == '':
                continue
            
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f'face_{uid}_{timestamp}_{idx + 1}.jpg'
            filepath = os.path.join(IMAGES_FOLDER, filename)
            file.save(filepath)
            saved_files.append(filename)
            print(f'얼굴 이미지 수신: {filename} ({os.path.getsize(filepath)} bytes)')
        
        # 개발용: 모의 얼굴 벡터 반환
        face_vector = [[0.123 + i * 0.001] * 512 for i in range(5)]
        
        return jsonify({
            'status': 'success',
            'message': '얼굴 이미지 업로드 성공',
            'files': saved_files,
            'face_vector': face_vector
        })
    except Exception as e:
        print(f'얼굴 업로드 에러: {e}')
        return jsonify({'error': str(e)}), 500

# 새로운 엔드포인트: 음성 파일 업로드 (다중)
@app.route('/register/upload', methods=['POST'])
def upload_voice_files():
    """다중 음성 파일 업로드 수신 - 회원가입용"""
    try:
        uid = request.form.get('uid', 'unknown')
        audios = request.files.getlist('audio')
        
        if not audios:
            return jsonify({'error': '오디오 파일이 없습니다'}), 400
        
        saved_files = []
        for idx, file in enumerate(audios):
            if file.filename == '':
                continue
            
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            ext = os.path.splitext(file.filename)[1] or '.wav'
            filename = f'voice_{uid}_{timestamp}_{idx + 1}{ext}'
            filepath = os.path.join(AUDIO_FOLDER, filename)
            file.save(filepath)
            saved_files.append(filename)
            print(f'음성 파일 수신: {filename} ({os.path.getsize(filepath)} bytes)')
        
        # 개발용: 모의 음성 벡터 반환
        voice_vector = [[0.456 + i * 0.002] * 192 for i in range(4)]
        
        return jsonify({
            'status': 'success',
            'message': '음성 파일 업로드 성공',
            'files': saved_files,
            'voice_vector': voice_vector
        })
    except Exception as e:
        print(f'음성 업로드 에러: {e}')
        return jsonify({'error': str(e)}), 500

# 얼굴 이미지 다운로드
@app.route('/get_image/<filename>', methods=['GET'])
def get_image(filename):
    """이미지 다운로드 제공"""
    filepath = os.path.join(IMAGES_FOLDER, filename)
    
    if not os.path.exists(filepath):
        return jsonify({'error': '파일을 찾을 수 없습니다'}), 404
    
    return send_file(filepath, mimetype='image/jpeg')

# 음성 파일 다운로드
@app.route('/get_audio/<filename>', methods=['GET'])
def get_audio(filename):
    """오디오 다운로드 제공"""
    filepath = os.path.join(AUDIO_FOLDER, filename)
    
    if not os.path.exists(filepath):
        return jsonify({'error': '파일을 찾을 수 없습니다'}), 404
    
    return send_file(filepath, mimetype='audio/wav')

if __name__ == '__main__':
    print('=' * 60)
    print('Jetson SoftAP 통신 테스트 서버')
    print('=' * 60)
    print(f'서버 시작: http://0.0.0.0:5000')
    print(f'이미지 저장 경로: {os.path.abspath(IMAGES_FOLDER)}')
    print(f'오디오 저장 경로: {os.path.abspath(AUDIO_FOLDER)}')
    print('=' * 60)
    print('사용 가능한 엔드포인트:')
    print('  GET  / - 서버 정보')
    print('  GET  /api/health - 서버 상태 확인')
    print('  POST /api/echo - Echo 테스트')
    print('  POST /upload_face - 다중 얼굴 이미지 업로드 (회원가입)')
    print('  POST /register/upload - 다중 음성 파일 업로드 (회원가입)')
    print('  POST /api/upload/image - 단일 이미지 업로드')
    print('  POST /api/upload/audio - 단일 오디오 업로드')
    print('  GET  /get_image/<filename> - 이미지 다운로드')
    print('  GET  /get_audio/<filename> - 오디오 다운로드')
    print('  GET  /api/files - 파일 목록 조회')
    print('=' * 60)
    print('서버가 실행 중입니다... (Ctrl+C로 종료)')
    print('=' * 60)
    
    app.run(host='0.0.0.0', port=5000, debug=True)
