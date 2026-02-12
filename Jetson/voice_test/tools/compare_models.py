#!/usr/bin/env python3
"""
ECAPA-TDNN vs Wespeaker ResNet34 성능 비교
4개의 음성 파일로 화자 인식 정확도 테스트
"""

import numpy as np
import librosa
from scipy.spatial.distance import cosine
import sys

def extract_mel_spectrogram(audio_path, sr=16000):
    """
    Mel spectrogram 추출 (ECAPA/Wespeaker 공통)
    
    Args:
        audio_path: 오디오 파일 경로
        sr: 샘플링 레이트 (16kHz)
    
    Returns:
        mel_feats: (T, 80) shape의 mel spectrogram
    """
    print(f"  Loading: {audio_path}")
    
    # 오디오 로드
    y, _ = librosa.load(audio_path, sr=sr)
    print(f"  Duration: {len(y)/sr:.2f}s")
    
    # Mel spectrogram 추출 (80 bands)
    mel = librosa.feature.melspectrogram(
        y=y, 
        sr=sr,
        n_fft=512,
        hop_length=160,  # 10ms
        n_mels=80,
        fmin=20,
        fmax=7600
    )
    
    # Log scale로 변환
    mel = librosa.power_to_db(mel, ref=np.max)
    
    # (Freq, Time) -> (Time, Freq) 전치
    mel = mel.T.astype(np.float32)
    
    print(f"  Mel shape: {mel.shape}")
    
    return mel

def get_embedding(session, mel_feats):
    """
    ONNX 모델로 화자 임베딩 추출
    
    Args:
        session: ONNX Runtime session
        mel_feats: (T, 80) mel spectrogram
    
    Returns:
        embedding: Normalized embedding vector
    """
    # Batch dimension 추가: (T, 80) -> (1, T, 80)
    feats = np.expand_dims(mel_feats, axis=0)
    
    # 추론
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    
    embedding = session.run([output_name], {input_name: feats})[0]
    
    # L2 Normalization
    embedding = embedding / np.linalg.norm(embedding)
    
    return embedding[0]

def cosine_similarity(emb1, emb2):
    """
    Cosine similarity 계산
    
    Returns:
        similarity: 0~1 사이 값 (1에 가까울수록 유사)
    """
    return 1 - cosine(emb1, emb2)

def compare_models(audio_files, ecapa_model_path, wespeaker_model_path):
    """
    두 모델의 성능 비교
    
    Args:
        audio_files: 테스트할 음성 파일 리스트
        ecapa_model_path: ECAPA ONNX 모델 경로
        wespeaker_model_path: Wespeaker ONNX 모델 경로
    """
    try:
        import onnxruntime as ort
    except ImportError:
        print("❌ onnxruntime이 설치되지 않았습니다!")
        print("설치: pip install onnxruntime --break-system-packages")
        return
    
    print("=" * 70)
    print("🎤 ECAPA-TDNN vs Wespeaker ResNet34 성능 비교")
    print("=" * 70)
    
    # ========================================
    # 1. Mel Spectrogram 추출
    # ========================================
    print("\n[1단계] Mel Spectrogram 추출 중...")
    print("-" * 70)
    
    mel_features = []
    for i, audio_path in enumerate(audio_files):
        print(f"\n파일 {i+1}/4:")
        mel = extract_mel_spectrogram(audio_path)
        mel_features.append(mel)
    
    # ========================================
    # 2. ECAPA-TDNN 임베딩 추출
    # ========================================
    print("\n" + "=" * 70)
    print("[2단계] ECAPA-TDNN 임베딩 추출...")
    print("-" * 70)
    
    try:
        ecapa_session = ort.InferenceSession(ecapa_model_path)
        print(f"✅ 모델 로드: {ecapa_model_path}")
        
        # 모델 정보 출력
        inp = ecapa_session.get_inputs()[0]
        out = ecapa_session.get_outputs()[0]
        print(f"   Input: {inp.name} {inp.shape}")
        print(f"   Output: {out.name} {out.shape}")
        
    except Exception as e:
        print(f"❌ ECAPA 모델 로드 실패: {e}")
        return
    
    ecapa_embeddings = []
    for i, mel in enumerate(mel_features):
        print(f"\n파일 {i+1}: 임베딩 추출 중...")
        emb = get_embedding(ecapa_session, mel)
        ecapa_embeddings.append(emb)
        print(f"  임베딩 shape: {emb.shape}")
        print(f"  임베딩 norm: {np.linalg.norm(emb):.4f}")
    
    # ========================================
    # 3. Wespeaker ResNet34 임베딩 추출
    # ========================================
    print("\n" + "=" * 70)
    print("[3단계] Wespeaker ResNet34 임베딩 추출...")
    print("-" * 70)
    
    try:
        wespeaker_session = ort.InferenceSession(wespeaker_model_path)
        print(f"✅ 모델 로드: {wespeaker_model_path}")
        
        # 모델 정보 출력
        inp = wespeaker_session.get_inputs()[0]
        out = wespeaker_session.get_outputs()[0]
        print(f"   Input: {inp.name} {inp.shape}")
        print(f"   Output: {out.name} {out.shape}")
        
    except Exception as e:
        print(f"❌ Wespeaker 모델 로드 실패: {e}")
        return
    
    wespeaker_embeddings = []
    for i, mel in enumerate(mel_features):
        print(f"\n파일 {i+1}: 임베딩 추출 중...")
        emb = get_embedding(wespeaker_session, mel)
        wespeaker_embeddings.append(emb)
        print(f"  임베딩 shape: {emb.shape}")
        print(f"  임베딩 norm: {np.linalg.norm(emb):.4f}")
    
    # ========================================
    # 4. 유사도 비교 (모든 쌍)
    # ========================================
    print("\n" + "=" * 70)
    print("[4단계] 유사도 비교 - 모든 파일 쌍")
    print("=" * 70)
    
    threshold = 0.80
    print(f"\n🎯 판정 기준: similarity >= {threshold} → 같은 화자")
    print("-" * 70)
    
    ecapa_wins = 0
    wespeaker_wins = 0
    total_pairs = 0
    
    for i in range(len(audio_files)):
        for j in range(i+1, len(audio_files)):
            total_pairs += 1
            
            # ECAPA 유사도
            ecapa_sim = cosine_similarity(
                ecapa_embeddings[i], 
                ecapa_embeddings[j]
            )
            
            # Wespeaker 유사도
            wespeaker_sim = cosine_similarity(
                wespeaker_embeddings[i], 
                wespeaker_embeddings[j]
            )
            
            # 차이
            diff = wespeaker_sim - ecapa_sim
            
            print(f"\n📊 파일 {i+1} vs 파일 {j+1}:")
            print(f"   ECAPA:     {ecapa_sim:.4f} {'✅ PASS' if ecapa_sim >= threshold else '❌ FAIL'}")
            print(f"   Wespeaker: {wespeaker_sim:.4f} {'✅ PASS' if wespeaker_sim >= threshold else '❌ FAIL'}")
            print(f"   차이:      {diff:+.4f}", end="")
            
            if abs(diff) < 0.01:
                print(" (거의 동일)")
            elif diff > 0:
                print(" → 🏆 Wespeaker 승")
                wespeaker_wins += 1
            else:
                print(" → 🏆 ECAPA 승")
                ecapa_wins += 1
    
    # ========================================
    # 5. 최종 결과
    # ========================================
    print("\n" + "=" * 70)
    print("📈 최종 결과")
    print("=" * 70)
    
    print(f"\n총 비교 쌍: {total_pairs}")
    print(f"ECAPA 승리:     {ecapa_wins}회")
    print(f"Wespeaker 승리: {wespeaker_wins}회")
    print(f"무승부:         {total_pairs - ecapa_wins - wespeaker_wins}회")
    
    print("\n" + "=" * 70)
    if wespeaker_wins > ecapa_wins:
        print("🎉 결론: Wespeaker ResNet34가 더 우수!")
        print("   → 모델 교체 권장 ✅")
    elif ecapa_wins > wespeaker_wins:
        print("⚠️  결론: ECAPA-TDNN이 더 우수")
        print("   → 현재 모델 유지 권장")
    else:
        print("🤔 결론: 두 모델 성능 비슷")
        print("   → 추가 테스트 필요")
    print("=" * 70)

def main():
    """메인 함수"""
    
    # 테스트할 음성 파일들 (tools/ 디렉토리 기준)
    audio_files = [
        "sample/voice_1.wav.pcm16k.wav",
        "sample/voice_2.wav.pcm16k.wav",
        "sample/voice_3.wav.pcm16k.wav",
        "sample/voice_4.wav.pcm16k.wav",
    ]
    
    # 모델 경로 (tools/ 디렉토리 기준)
    ecapa_model = "../models/speaker/ecapa.onnx"
    wespeaker_model = "wespeaker_resnet34_korean.onnx"
    
    # 파일 존재 확인
    import os
    for audio_file in audio_files:
        if not os.path.exists(audio_file):
            print(f"❌ 파일 없음: {audio_file}")
            return
    
    if not os.path.exists(ecapa_model):
        print(f"❌ ECAPA 모델 없음: {ecapa_model}")
        print("모델을 다운로드하거나 경로를 수정하세요.")
        return
    
    if not os.path.exists(wespeaker_model):
        print(f"❌ Wespeaker 모델 없음: {wespeaker_model}")
        print("convert_wespeaker_to_onnx.py를 먼저 실행하세요.")
        return
    
    # 비교 실행
    compare_models(audio_files, ecapa_model, wespeaker_model)

if __name__ == "__main__":
    main()