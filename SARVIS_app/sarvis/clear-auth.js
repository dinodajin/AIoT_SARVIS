const AsyncStorage = require('@react-native-async-storage/async-storage').default;

async function clearAuth() {
  console.log('🔄 인증 데이터 초기화 시작...');
  
  try {
    // 모든 키 삭제
    await AsyncStorage.clear();
    console.log('✅ 모든 데이터 초기화 완료');
    
    // 확인을 위해 삭제 후 상태 출력
    const allKeys = await AsyncStorage.getAllKeys();
    console.log('남아있는 키:', allKeys);
    
    console.log('✅ 앱을 재시작하면 로그아웃 상태입니다.');
  } catch (error) {
    console.error('❌ 초기화 실패:', error);
  }
}

clearAuth();