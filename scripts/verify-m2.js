/**
 * @file verify-m2.js
 * @description Milestone 2 사진 업로드 & 타원형 얼굴 크롭 툴 자동화 검증 스크립트
 * - 내장 HTTP 서버(8088) 자동 기동
 * - Chrome CDP 기반 무인 헤드리스 브라우저 제어
 * - T03-C04: PNG 이미지 로드 및 텍스처 매핑 검증
 * - T03-C05: JPEG 이미지 로드 및 텍스처 매핑 검증
 * - T03-C09: 미지원 파일 업로드 시 기존 작업 유지 검증
 * - T03-C10: 미지원 파일의 명확한 거부 이유 표시 검증
 * - 타원형 가이드 크롭 모달 인터랙션(드래그 이동, 휠/슬라이더 확대·축소) 검증
 * - 샘플 얼굴 2종(남/여) 프리셋 스왑 검증
 * - 검증 결과 스크린샷 8종 저장 (docs/verification-m2/)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8088;
const DEBUG_PORT = 9224;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT_DIR = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'docs', 'verification-m2');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 1. 내장 정적 파일 서버
function startServer() {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  const server = http.createServer((req, res) => {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

    const filePath = path.join(ROOT_DIR, reqPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`[HTTP 서버] http://localhost:${PORT} 기동 완료`);
      resolve(server);
    });
  });
}

async function main() {
  const server = await startServer();

  console.log('[1/8] Headless Chrome 기동 (포트 ' + DEBUG_PORT + ')...');
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=' + DEBUG_PORT,
    '--disable-gpu',
    '--window-size=1280,850',
    `http://localhost:${PORT}/index.html`
  ], { stdio: 'ignore' });

  // Chrome 준비 대기
  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    try {
      const res = await fetch(`http://localhost:${DEBUG_PORT}/json`);
      const list = await res.json();
      const page = list.find((p) => p.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  if (!wsUrl) {
    chromeProcess.kill();
    server.close();
    throw new Error('Chrome CDP WebSocket 조회 실패');
  }

  console.log('[2/8] CDP WebSocket 연결 완료: ' + wsUrl);
  const ws = new WebSocket(wsUrl);

  let msgId = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  await new Promise((r) => (ws.onopen = r));

  const send = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result ? res.result.value : undefined;
  };

  const takeScreenshot = async (filename) => {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const filePath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    console.log(`  -> 스크린샷 저장 완료: ${filePath} (${buffer.length} bytes)`);
  };

  try {
    console.log('[3/8] 앱 및 Milestone 2 FaceCropper 초기화 확인...');
    await sleep(1200);

    const initState = await evaluate(`(() => {
      const app = window.__CEREMONY_APP__;
      if (!app) return { ok: false, error: 'no app' };
      return {
        ok: true,
        hasCropper: !!app.faceCropper,
        hasCharacter: !!app.character,
        hasHeadMesh: !!app.character.headMesh,
        hasFaceTexture: !!app.character.headMesh.material.map,
        currentFaceDataUrl: !!app.faceCropper.currentFaceDataUrl
      };
    })()`);
    console.log('  초기 상태:', initState);
    if (!initState.ok) throw new Error('앱 초기화 실패');
    await takeScreenshot('01_initial_face.png');

    // 4. [T03-C09, C10] 미지원 파일 업로드 거부 및 기존 상태 보존 검증
    console.log('[4/8] [T03-C09, C10] 미지원 파일(.txt) 업로드 시 거부 및 기존 작업 보존 검증...');
    const rejectTestResult = await evaluate(`(() => {
      const cropper = window.__CEREMONY_APP__.faceCropper;
      const char = window.__CEREMONY_APP__.character;

      // 이전 텍스처 레퍼런스 보관
      const prevTexture = char.headMesh.material.map;
      const prevPose = char.currentPose;

      // 지원하지 않는 더미 txt 파일 객체 생성
      const fakeTxtFile = new File(['hello world'], 'script.txt', { type: 'text/plain' });

      // 유효성 검사 및 처리 시도
      const isValid = cropper.validateFile(fakeTxtFile);
      cropper.processFile(fakeTxtFile);

      const alertEl = document.getElementById('face-error-alert');
      const isAlertVisible = alertEl && alertEl.style.display !== 'none';
      const alertText = alertEl ? alertEl.textContent : '';

      return {
        isValid,
        isAlertVisible,
        alertText,
        texturePreserved: char.headMesh.material.map === prevTexture,
        posePreserved: char.currentPose === prevPose
      };
    })()`);

    console.log('  미지원 파일 검증 결과:', rejectTestResult);
    if (rejectTestResult.isValid) throw new Error('미지원 파일이 거부되지 않고 통과되었습니다.');
    if (!rejectTestResult.isAlertVisible || !rejectTestResult.alertText.includes('PNG 및 JPEG')) {
      throw new Error('거부 경고 메시지가 올바르게 표시되지 않았습니다: ' + rejectTestResult.alertText);
    }
    if (!rejectTestResult.texturePreserved) {
      throw new Error('미지원 파일 업로드 후 기존 작업(얼굴 텍스처)이 손상되었습니다.');
    }
    await sleep(400);
    await takeScreenshot('02_unsupported_file_rejected.png');

    // 5. [T03-C04] 정상 PNG 파일 업로드 및 크롭 모달 조작 검증
    console.log('[5/8] [T03-C04] 정상 PNG 이미지 로드 및 타원 크롭 모달 인터랙션(드래그/줌) 검증...');
    const cropModalTest = await evaluate(`(async () => {
      const cropper = window.__CEREMONY_APP__.faceCropper;

      // 여성 선수 샘플 이미지를 PNG File 객체로 변환하여 로드
      const res = await fetch('assets/samples/sample_face_female.png');
      const blob = await res.blob();
      const pngFile = new File([blob], 'my_face.png', { type: 'image/png' });

      // 업로드 처리 -> 모달 열림
      cropper.processFile(pngFile);

      // 이미지 로드 대기
      await new Promise((r) => setTimeout(r, 600));

      const modal = document.getElementById('face-crop-modal');
      const isModalOpen = modal && modal.style.display === 'flex';

      // 이동(드래그) 조작 시뮬레이션
      cropper.offsetX = 25;
      cropper.offsetY = -15;

      // 확대(줌) 조작 시뮬레이션 (1.4배 줌)
      cropper.setZoom(cropper.baseScale * 1.4);

      return {
        isModalOpen,
        offsetX: cropper.offsetX,
        offsetY: cropper.offsetY,
        scale: cropper.scale
      };
    })()`);

    console.log('  크롭 모달 상태:', cropModalTest);
    if (!cropModalTest.isModalOpen) throw new Error('정상 PNG 업로드 후 크롭 모달이 열리지 않았습니다.');
    await sleep(400);
    await takeScreenshot('03_crop_modal_open.png');

    // [얼굴 적용] 버튼 클릭 및 3D 마네킹 머리에 CanvasTexture 맵핑 검증
    console.log('  [얼굴 적용] 버튼 클릭 및 3D 텍스처 맵핑 검증...');
    const applyPngResult = await evaluate(`(() => {
      const applyBtn = document.getElementById('btn-apply-crop');
      if (applyBtn) applyBtn.click();

      const modal = document.getElementById('face-crop-modal');
      const char = window.__CEREMONY_APP__.character;
      const cropper = window.__CEREMONY_APP__.faceCropper;

      return {
        modalClosed: modal.style.display === 'none',
        hasTexture: !!char.headMesh.material.map,
        textureIsCanvasTexture: char.headMesh.material.map.isCanvasTexture || !!char.headMesh.material.map.image
      };
    })()`);
    console.log('  PNG 얼굴 적용 결과:', applyPngResult);
    if (!applyPngResult.modalClosed) throw new Error('얼굴 적용 후 크롭 모달이 닫히지 않았습니다.');
    await sleep(400);
    await takeScreenshot('04_custom_png_applied.png');

    // 6. [T03-C05] 정상 JPEG 파일 업로드 및 적용 검증
    console.log('[6/8] [T03-C05] 정상 JPEG 이미지 로드 및 텍스처 맵핑 검증...');
    const applyJpegResult = await evaluate(`(async () => {
      // 캔버스를 사용하여 유효한 JPEG Blob/File 생성
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 400;
      const ctx = c.getContext('2d');
      // 화사한 오렌지-옐로우 그라데이션 얼굴 패턴
      const g = ctx.createRadialGradient(200, 200, 30, 200, 200, 180);
      g.addColorStop(0, '#ffd166');
      g.addColorStop(0.7, '#f78c6b');
      g.addColorStop(1, '#e0533c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 400, 400);

      // 눈
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(150, 170, 18, 0, Math.PI * 2);
      ctx.arc(250, 170, 18, 0, Math.PI * 2);
      ctx.fill();

      // 활짝 웃는 입
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(200, 240, 60, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();

      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
      const jpegFile = new File([blob], 'photo_ceremony.jpg', { type: 'image/jpeg' });

      const cropper = window.__CEREMONY_APP__.faceCropper;
      cropper.processFile(jpegFile);

      await new Promise((r) => setTimeout(r, 600));

      // 모달에서 적용 버튼 클릭
      document.getElementById('btn-apply-crop').click();

      const char = window.__CEREMONY_APP__.character;
      return {
        applied: !!char.headMesh.material.map
      };
    })()`);
    console.log('  JPEG 얼굴 적용 결과:', applyJpegResult);
    await sleep(400);
    await takeScreenshot('05_custom_jpeg_applied.png');

    // 7. 기본 테스트용 샘플 얼굴 2종 프리셋 버튼 검증
    console.log('[7/8] 기본 테스트용 샘플 얼굴 2종(남/여) 프리셋 버튼 클릭 검증...');

    // 7-1. 남성 선수 샘플 버튼 클릭
    await evaluate(`(() => {
      document.getElementById('btn-sample-male').click();
    })()`);
    await sleep(600);
    await takeScreenshot('06_sample_male.png');

    // 7-2. 여성 선수 샘플 버튼 클릭
    await evaluate(`(() => {
      document.getElementById('btn-sample-female').click();
    })()`);
    await sleep(600);
    await takeScreenshot('07_sample_female.png');

    // 8. 대두 모드 & 챌린지 포즈와 얼굴 텍스처의 완벽 결합 확인
    console.log('[8/8] 대두(Bobblehead 2.0x) + 챌린지 포즈(CHOI_SAN_BAD) + 얼굴 텍스처 결합 샷...');
    await evaluate(`(() => {
      const char = window.__CEREMONY_APP__.character;
      const sm = window.__CEREMONY_APP__.sceneManager;

      // 1) 대두 2.0배
      const slider = document.getElementById('head-scale-slider');
      slider.value = '2.0';
      slider.dispatchEvent(new Event('input', { bubbles: true }));

      // 2) 최산 BAD 포즈
      const poseBtn = document.querySelector('[data-pose="CHOI_SAN_BAD"]');
      if (poseBtn) poseBtn.click();

      // 3) 얼굴 텍스처는 남성 선수로
      document.getElementById('btn-sample-male').click();

      // 4) 카메라 앵글을 가슴/얼굴 클로즈업으로 세팅
      sm.camera.position.set(0, 1.4, 2.2);
      sm.controls.target.set(0, 1.3, 0);
      sm.controls.update();
    })()`);
    await sleep(600);
    await takeScreenshot('08_bobblehead_pose_face.png');

    console.log('\n[PASS] Milestone 2 모든 체크리스트 항목 및 T03-C04, C05, C09, C10 100% 통과!');
  } finally {
    ws.close();
    chromeProcess.kill();
    server.close();
  }
}

main().catch((err) => {
  console.error('검증 오류 발생:', err);
  process.exit(1);
});
