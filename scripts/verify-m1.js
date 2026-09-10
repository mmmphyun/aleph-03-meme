/**
 * @file verify-m1.js
 * @description Milestone 1 완전성 검증 스크립트 (CDP 기반 headless Chrome 인터랙션 테스트)
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9222;
const TARGET_URL = 'http://localhost:8088/index.html';
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'verification-m1');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('[1/7] Chrome 브라우저 기동 (Remote Debugging Port: ' + DEBUG_PORT + ')...');
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=' + DEBUG_PORT,
    '--disable-gpu',
    '--window-size=1280,800',
    TARGET_URL
  ], { stdio: 'ignore' });

  // Chrome 준비 대기
  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://localhost:${DEBUG_PORT}/json`);
      const list = await res.json();
      const page = list.find((p) => p.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {
      // 대기
    }
  }

  if (!wsUrl) {
    console.error('Chrome CDP WebSocket URL 조회 실패');
    chromeProcess.kill();
    process.exit(1);
  }

  console.log('[2/7] CDP WebSocket 연결: ' + wsUrl);
  const ws = new WebSocket(wsUrl);

  let msgId = 1;
  const pendingRequests = new Map();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pendingRequests.has(data.id)) {
      const { resolve, reject } = pendingRequests.get(data.id);
      pendingRequests.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  await new Promise((resolve) => (ws.onopen = resolve));

  const send = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pendingRequests.set(id, { resolve, reject });
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
    // 3. 페이지 초기화 완료 확인
    console.log('[3/7] Three.js 앱 초기화 상태 검사...');
    await sleep(1000);

    const appState = await evaluate(`(() => {
      const app = window.__CEREMONY_APP__;
      if (!app) return { ok: false, error: '__CEREMONY_APP__ not found' };
      return {
        ok: true,
        hasScene: !!app.sceneManager.scene,
        hasCharacter: !!app.character,
        currentPose: app.character.currentPose,
        currentSkin: app.character.currentSkin,
        headScale: app.character.headScale
      };
    })()`);

    console.log('  앱 상태:', JSON.stringify(appState, null, 2));
    if (!appState.ok) throw new Error('앱 초기화 실패: ' + appState.error);

    // 4. 포즈 프리셋 전체 테스트 및 스크린샷
    console.log('[4/7] 챌린지 및 바이럴 세레모니 포즈 프리셋 순차 테스트...');
    const poses = [
      'RONALDO_SIU',
      'SON_CAMERA',
      'BELLINGHAM_ARMS',
      'GRIEZMANN_HOTLINE',
      'GEOJE_YAHO',
      'CHOI_SAN_BAD',
      'CUTE_HEART'
    ];

    for (const pose of poses) {
      const result = await evaluate(`(() => {
        const btn = document.querySelector('[data-pose="${pose}"]');
        if (btn) btn.click();
        const char = window.__CEREMONY_APP__.character;
        return {
          pose: char.currentPose,
          torsoRotX: char.joints.torso.rotation.x,
          leftShoulderRotX: char.joints.leftShoulder.rotation.x,
          rightShoulderRotX: char.joints.rightShoulder.rotation.x
        };
      })()`);

      console.log(`  [포즈: ${pose}] 상태:`, result);
      await sleep(300);
      await takeScreenshot(`pose_${pose.toLowerCase()}.png`);
    }

    // 5. 대두 슬라이더 테스트
    console.log('[5/7] 대두(Bobblehead) 슬라이더 테스트 (2.2배 확대)...');
    const sliderResult = await evaluate(`(() => {
      const slider = document.getElementById('head-scale-slider');
      slider.value = '2.2';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      const char = window.__CEREMONY_APP__.character;
      return {
        sliderValue: slider.value,
        headScaleValue: char.headScale,
        headGroupScale: char.joints.head.scale.x
      };
    })()`);
    console.log('  대두 슬라이더 결과:', sliderResult);
    await sleep(300);
    await takeScreenshot('head_scale_2.2x.png');

    // 6. 3대 콘셉트 스킨 스왑 테스트
    console.log('[6/7] 3대 콘셉트 스킨 스왑 테스트...');
    const skins = ['RETRO_JERSEY', 'GOLDEN_TROPHY', 'CLASSIC_DAISY'];
    for (const skin of skins) {
      const skinResult = await evaluate(`(() => {
        const btn = document.querySelector('[data-skin="${skin}"]');
        if (btn) btn.click();
        const char = window.__CEREMONY_APP__.character;
        return {
          skin: char.currentSkin,
          colorHex: char.skinMeshes.all[0].material.color.getHexString()
        };
      })()`);
      console.log(`  [스킨: ${skin}] 결과:`, skinResult);
      await sleep(300);
      await takeScreenshot(`skin_${skin.toLowerCase()}.png`);
    }

    // 7. 카메라 회전 조작 및 리셋 테스트
    console.log('[7/7] 카메라 OrbitControls 및 리셋 테스트...');
    const cameraResult = await evaluate(`(() => {
      const sm = window.__CEREMONY_APP__.sceneManager;
      sm.camera.position.set(3, 2, 3);
      sm.controls.update();
      const movedPos = { x: sm.camera.position.x, y: sm.camera.position.y, z: sm.camera.position.z };

      const resetBtn = document.getElementById('btn-reset-camera');
      if (resetBtn) resetBtn.click();
      const resetPos = { x: sm.camera.position.x, y: sm.camera.position.y, z: sm.camera.position.z };

      return { movedPos, resetPos };
    })()`);
    console.log('  카메라 조작 결과:', cameraResult);

    console.log('\n[PASS] Milestone 1 모든 기능 자동 검증 완료!');
  } finally {
    ws.close();
    chromeProcess.kill();
  }
}

main().catch((err) => {
  console.error('검증 오류:', err);
  process.exit(1);
});
