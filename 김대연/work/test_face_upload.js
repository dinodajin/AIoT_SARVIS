#!/usr/bin/env node
/**
 * 얼굴 사진 5장 Jetson SoftAP 전송 테스트
 * 
 * 사용법:
 * 1. Expo 앱에서 이미지 파일 5장을 준비
 * 2. 이 스크립트 실행: node test_face_upload.js
 * 3. 이미지 경로들을 입력하면 Jetson 서버로 전송
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// Jetson 서버 설정
const JETSON_IP = '10.42.0.1';
const JETSON_PORT = '5000';
const UID = 'test_user';

/**
 * 이미지 파일들을 Jetson 서버로 전송
 * @param {string[]} imagePaths - 이미지 파일 경로 배열
 * @param {string} uid - 사용자 UID
 */
async function sendMultipleImages(imagePaths, uid = 'test_user') {
  try {
    const formData = new FormData();
    
    // 1. UID 추가
    formData.append('uid', uid);
    
    // 2. 모든 이미지를 'image' 키로 전송
    imagePaths.forEach((imagePath, index) => {
      const fileStream = fs.createReadStream(imagePath);
      formData.append('image', fileStream, {
        filename: `photo_${index + 1}.jpg`,
        contentType: 'image/jpeg'
      });
    });

    console.log(`\n📤 ${imagePaths.length}장의 이미지 전송 중...`);
    console.log(`   대상: http://${JETSON_IP}:${JETSON_PORT}/upload_face`);
    console.log(`   UID: ${uid}`);
    console.log(`   파일들:`);
    imagePaths.forEach((path, idx) => console.log(`     ${idx + 1}. ${path}`));

    const response = await axios.post(
      `http://${JETSON_IP}:${JETSON_PORT}/upload_face`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Accept': 'application/json',
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 60000
      }
    );

    console.log('\n✅ 전송 성공!');
    console.log('   응답:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('\n❌ 전송 실패!');
    if (error.response) {
      console.error('   상태 코드:', error.response.status);
      console.error('   에러 데이터:', error.response.data);
    } else if (error.request) {
      console.error('   요청 전송 실패:', error.message);
    } else {
      console.error('   에러:', error.message);
    }
    return null;
  }
}

/**
 * Jetson 서버 연결 테스트
 */
async function testConnection() {
  try {
    console.log('\n🔌 Jetson 서버 연결 테스트 중...');
    const response = await axios.get(`http://${JETSON_IP}:${JETSON_PORT}/`, {
      timeout: 5000
    });
    console.log('✅ 연결 성공!');
    console.log('   응답:', response.data);
    return true;
  } catch (error) {
    console.error('❌ 연결 실패!');
    console.error('   에러:', error.message);
    return false;
  }
}

/**
 * 메인 함수
 */
async function main() {
  console.log('=' * 60);
  console.log('Jetson SoftAP 얼굴 이미지 전송 테스트');
  console.log('=' * 60);
  console.log(`Jetson IP: ${JETSON_IP}:${JETSON_PORT}`);
  console.log(`UID: ${UID}`);
  console.log('=' * 60);

  // 1. 연결 테스트
  const connected = await testConnection();
  if (!connected) {
    console.log('\n⚠️  Jetson 서버에 연결할 수 없습니다. SoftAP를 확인해주세요.');
    process.exit(1);
  }

  // 2. 이미지 파일 경로 확인
  const imagePaths = process.argv.slice(2);
  
  if (imagePaths.length === 0) {
    console.log('\n❌ 이미지 파일 경로가 필요합니다!');
    console.log('\n사용법:');
    console.log('  node test_face_upload.js <이미지1> <이미지2> <이미지3> <이미지4> <이미지5>');
    console.log('\n예시:');
    console.log('  node test_face_upload.js face1.jpg face2.jpg face3.jpg face4.jpg face5.jpg');
    console.log('\n테스트용 이미지 생성 (가상):');
    console.log('  node test_face_upload.js --demo');
    process.exit(1);
  }

  // 3. 데모 모드 체크
  if (imagePaths[0] === '--demo') {
    console.log('\n📋 데모 모드: 가상 이미지 경로 사용');
    const demoImages = [
      '/tmp/face_1.jpg',
      '/tmp/face_2.jpg',
      '/tmp/face_3.jpg',
      '/tmp/face_4.jpg',
      '/tmp/face_5.jpg'
    ];
    
    // 가상 파일 생성
    console.log('\n가상 파일 생성 중...');
    for (const path of demoImages) {
      if (!fs.existsSync(path)) {
        fs.writeFileSync(path, 'DEMO_IMAGE_DATA', 'utf8');
        console.log(`  생성됨: ${path}`);
      }
    }
    
    // 전송
    await sendMultipleImages(demoImages, UID);
    return;
  }

  // 4. 파일 존재 확인
  console.log('\n📁 파일 확인 중...');
  const validPaths = [];
  for (const path of imagePaths) {
    if (fs.existsSync(path)) {
      const stats = fs.statSync(path);
      console.log(`  ✓ ${path} (${stats.size} bytes)`);
      validPaths.push(path);
    } else {
      console.log(`  ✗ ${path} (파일 없음)`);
    }
  }

  if (validPaths.length === 0) {
    console.log('\n❌ 유효한 이미지 파일이 없습니다.');
    process.exit(1);
  }

  if (validPaths.length !== 5) {
    console.log(`\n⚠️  경고: ${validPaths.length}장의 파일만 전송합니다. (5장 필요)`);
  }

  // 5. 이미지 전송
  await sendMultipleImages(validPaths, UID);
  
  console.log('\n' + '=' * 60);
  console.log('테스트 완료!');
  console.log('=' * 60);
}

// 실행
main().catch(error => {
  console.error('치명적 에러:', error);
  process.exit(1);
});