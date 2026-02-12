// 프리셋 저장소 테스트 스크립트
// 이 파일은 개발자 도구에서 실행하여 테스트할 수 있습니다

const testPresetStorage = async () => {
  try {
    console.log('=== 프리셋 저장소 테스트 시작 ===');
    
    // 1. 현재 저장된 프리셋 확인
    const currentPresets = await presetStorage.getPresets();
    console.log('현재 저장된 프리셋:', currentPresets);
    
    // 2. 테스트 프리셋 생성
    const testPreset = {
      id: Date.now().toString(),
      name: '테스트 프리셋',
      state: {
        positionX: 5,
        positionY: -3,
        rotationX: 15,
        rotationY: -10,
        distance: 25
      },
      createdAt: new Date()
    };
    
    console.log('테스트 프리셋 저장 시도:', testPreset);
    
    // 3. 프리셋 저장
    await presetStorage.savePreset(testPreset);
    console.log('테스트 프리셋 저장 성공');
    
    // 4. 저장 확인
    const updatedPresets = await presetStorage.getPresets();
    console.log('업데이트된 프리셋 목록:', updatedPresets);
    
    // 5. 테스트 프리셋 삭제
    await presetStorage.deletePreset(testPreset.id);
    console.log('테스트 프리셋 삭제 성공');
    
    // 6. 최종 확인
    const finalPresets = await presetStorage.getPresets();
    console.log('최종 프리셋 목록:', finalPresets);
    
    console.log('=== 프리셋 저장소 테스트 완료 ===');
    
  } catch (error) {
    console.error('테스트 중 오류 발생:', error);
  }
};

// 이 함수를 앱에서 실행하려면:
// 1. 개발자 도구 열기
// 2. testPresetStorage() 실행
