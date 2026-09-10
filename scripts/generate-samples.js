/**
 * @file generate-samples.js
 * @description Headless Chrome을 통해 무의존성 Canvas API로 샘플 얼굴 2종(남/여) 생성
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9223;
const SAMPLES_DIR = path.join(__dirname, '..', 'assets', 'samples');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=' + DEBUG_PORT,
    '--disable-gpu',
    'about:blank'
  ], { stdio: 'ignore' });

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
    throw new Error('Chrome 기동 실패');
  }

  const ws = new WebSocket(wsUrl);
  let msgId = 1;
  const pending = new Map();

  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
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

  try {
    // 1. 남성 선수 얼굴 (512x512)
    const maleDataUrl = await evaluate(`(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');

      // 배경 (자연스러운 스타디움 잔디 톤 그라데이션)
      const bgGrad = ctx.createLinearGradient(0, 0, 0, 512);
      bgGrad.addColorStop(0, '#1a3322');
      bgGrad.addColorStop(1, '#0e1f14');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 512, 512);

      const cx = 256;
      const cy = 250;

      // 목
      ctx.fillStyle = '#e8b898';
      ctx.fillRect(cx - 50, cy + 90, 100, 110);
      // 목 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(cx - 50, cy + 90, 100, 30);

      // 머리카락 뒤쪽
      ctx.fillStyle = '#1e1b18';
      ctx.beginPath();
      ctx.ellipse(cx, cy - 30, 150, 160, 0, 0, Math.PI * 2);
      ctx.fill();

      // 얼굴형 (날렵하고 탄탄한 턱선)
      ctx.fillStyle = '#f8caa8';
      ctx.beginPath();
      ctx.moveTo(cx - 110, cy - 50);
      ctx.quadraticCurveTo(cx - 120, cy + 50, cx - 75, cy + 120);
      ctx.quadraticCurveTo(cx - 40, cy + 160, cx, cy + 165);
      ctx.quadraticCurveTo(cx + 40, cy + 160, cx + 75, cy + 120);
      ctx.quadraticCurveTo(cx + 120, cy + 50, cx + 110, cy - 50);
      ctx.quadraticCurveTo(cx, cy - 120, cx - 110, cy - 50);
      ctx.fill();

      // 귀 (좌/우)
      ctx.fillStyle = '#f0be9c';
      ctx.beginPath();
      ctx.ellipse(cx - 115, cy + 20, 18, 32, -0.1, 0, Math.PI * 2);
      ctx.ellipse(cx + 115, cy + 20, 18, 32, 0.1, 0, Math.PI * 2);
      ctx.fill();

      // 투블럭 스타일 앞머리
      ctx.fillStyle = '#1e1b18';
      ctx.beginPath();
      ctx.moveTo(cx - 115, cy - 30);
      ctx.quadraticCurveTo(cx - 125, cy - 130, cx, cy - 145);
      ctx.quadraticCurveTo(cx + 125, cy - 130, cx + 115, cy - 30);
      ctx.lineTo(cx + 100, cy - 40);
      ctx.quadraticCurveTo(cx + 40, cy - 80, cx, cy - 65);
      ctx.quadraticCurveTo(cx - 40, cy - 90, cx - 100, cy - 40);
      ctx.closePath();
      ctx.fill();

      // 진한 눈썹 (승부사 눈썹)
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.moveTo(cx - 85, cy - 12);
      ctx.lineTo(cx - 25, cy - 18);
      ctx.lineTo(cx - 25, cy - 6);
      ctx.lineTo(cx - 85, cy + 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx + 85, cy - 12);
      ctx.lineTo(cx + 25, cy - 18);
      ctx.lineTo(cx + 25, cy - 6);
      ctx.lineTo(cx + 85, cy + 2);
      ctx.fill();

      // 눈
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx - 52, cy + 18, 22, 13, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 52, cy + 18, 22, 13, 0, 0, Math.PI * 2);
      ctx.fill();

      // 눈동자
      ctx.fillStyle = '#2c1e15';
      ctx.beginPath();
      ctx.arc(cx - 52, cy + 18, 10, 0, Math.PI * 2);
      ctx.arc(cx + 52, cy + 18, 10, 0, Math.PI * 2);
      ctx.fill();

      // 동공 하이라이트
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 55, cy + 15, 3.5, 0, Math.PI * 2);
      ctx.arc(cx + 49, cy + 15, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // 콧날 및 콧망울
      ctx.strokeStyle = '#d49673';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy + 10);
      ctx.lineTo(cx - 3, cy + 62);
      ctx.lineTo(cx + 10, cy + 64);
      ctx.stroke();

      // 입 (당당한 미소)
      ctx.strokeStyle = '#a65343';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx - 36, cy + 105);
      ctx.quadraticCurveTo(cx, cy + 122, cx + 36, cy + 105);
      ctx.stroke();

      // 볼 땀방울 (축구선수 현장감 연출)
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(cx + 70, cy + 50, 4, 7, 0.2, 0, Math.PI * 2);
      ctx.fill();

      return canvas.toDataURL('image/png');
    })()`);

    const maleBuffer = Buffer.from(maleDataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(SAMPLES_DIR, 'sample_face_male.png'), maleBuffer);
    console.log('[OK] sample_face_male.png 생성 완료 (512x512)');

    // 2. 여성 선수 얼굴 (512x512)
    const femaleDataUrl = await evaluate(`(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');

      // 배경 (블루 스타디움 라이트 그라데이션)
      const bgGrad = ctx.createLinearGradient(0, 0, 0, 512);
      bgGrad.addColorStop(0, '#10223b');
      bgGrad.addColorStop(1, '#081220');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 512, 512);

      const cx = 256;
      const cy = 252;

      // 목
      ctx.fillStyle = '#f5c6ad';
      ctx.fillRect(cx - 42, cy + 90, 84, 110);
      // 목 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(cx - 42, cy + 90, 84, 25);

      // 머리카락 뒤쪽 (포니테일 묶음)
      ctx.fillStyle = '#3a2012';
      ctx.beginPath();
      ctx.ellipse(cx, cy - 25, 145, 155, 0, 0, Math.PI * 2);
      ctx.fill();

      // 포니테일 사이드 번
      ctx.beginPath();
      ctx.ellipse(cx + 120, cy - 70, 45, 65, 0.4, 0, Math.PI * 2);
      ctx.fill();

      // 얼굴형 (갸름하고 부드러운 턱선)
      ctx.fillStyle = '#fedecb';
      ctx.beginPath();
      ctx.moveTo(cx - 95, cy - 40);
      ctx.quadraticCurveTo(cx - 105, cy + 45, cx - 68, cy + 115);
      ctx.quadraticCurveTo(cx - 35, cy + 155, cx, cy + 158);
      ctx.quadraticCurveTo(cx + 35, cy + 155, cx + 68, cy + 115);
      ctx.quadraticCurveTo(cx + 105, cy + 45, cx + 95, cy - 40);
      ctx.quadraticCurveTo(cx, cy - 110, cx - 95, cy - 40);
      ctx.fill();

      // 귀 (좌/우)
      ctx.fillStyle = '#f7cbba';
      ctx.beginPath();
      ctx.ellipse(cx - 102, cy + 22, 16, 26, -0.1, 0, Math.PI * 2);
      ctx.ellipse(cx + 102, cy + 22, 16, 26, 0.1, 0, Math.PI * 2);
      ctx.fill();

      // 앞머리 & 스포츠 헤어밴드
      ctx.fillStyle = '#1e70bf'; // 시원한 블루 스포츠 헤어밴드
      ctx.beginPath();
      ctx.moveTo(cx - 102, cy - 45);
      ctx.quadraticCurveTo(cx, cy - 80, cx + 102, cy - 45);
      ctx.lineTo(cx + 100, cy - 25);
      ctx.quadraticCurveTo(cx, cy - 60, cx - 100, cy - 25);
      ctx.closePath();
      ctx.fill();

      // 잔머리
      ctx.fillStyle = '#3a2012';
      ctx.beginPath();
      ctx.moveTo(cx - 100, cy - 40);
      ctx.quadraticCurveTo(cx - 60, cy - 35, cx - 40, cy - 15);
      ctx.quadraticCurveTo(cx, cy - 45, cx + 50, cy - 15);
      ctx.quadraticCurveTo(cx + 80, cy - 35, cx + 100, cy - 40);
      ctx.lineTo(cx + 100, cy - 70);
      ctx.quadraticCurveTo(cx, cy - 115, cx - 100, cy - 70);
      ctx.closePath();
      ctx.fill();

      // 눈썹 (자연스러운 아치형)
      ctx.strokeStyle = '#2d1b10';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 78, cy - 6);
      ctx.quadraticCurveTo(cx - 48, cy - 15, cx - 22, cy - 5);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx + 78, cy - 6);
      ctx.quadraticCurveTo(cx + 48, cy - 15, cx + 22, cy - 5);
      ctx.stroke();

      // 눈 (크고 또렷함)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx - 48, cy + 18, 22, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 48, cy + 18, 22, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      // 눈동자 (맑은 앰버 브라운)
      ctx.fillStyle = '#4a2c16';
      ctx.beginPath();
      ctx.arc(cx - 48, cy + 18, 11, 0, Math.PI * 2);
      ctx.arc(cx + 48, cy + 18, 11, 0, Math.PI * 2);
      ctx.fill();

      // 동공 & 눈부심 하이라이트
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 51, cy + 15, 4, 0, Math.PI * 2);
      ctx.arc(cx + 45, cy + 15, 4, 0, Math.PI * 2);
      ctx.arc(cx - 45, cy + 22, 2, 0, Math.PI * 2);
      ctx.arc(cx + 51, cy + 22, 2, 0, Math.PI * 2);
      ctx.fill();

      // 속눈썹 라인
      ctx.strokeStyle = '#1b110a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx - 48, cy + 16, 23, 1.1 * Math.PI, 1.9 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 48, cy + 16, 23, 1.1 * Math.PI, 1.9 * Math.PI);
      ctx.stroke();

      // 코
      ctx.strokeStyle = '#e2a188';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy + 18);
      ctx.lineTo(cx - 2, cy + 60);
      ctx.lineTo(cx + 8, cy + 62);
      ctx.stroke();

      // 핑크빛 볼터치
      ctx.fillStyle = 'rgba(255, 120, 140, 0.28)';
      ctx.beginPath();
      ctx.ellipse(cx - 65, cy + 56, 25, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 65, cy + 56, 25, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      // 입술 (생기 있는 핑크빛 미소)
      ctx.fillStyle = '#e86a7a';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 104, 26, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#b84454';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx - 26, cy + 104);
      ctx.quadraticCurveTo(cx, cy + 110, cx + 26, cy + 104);
      ctx.stroke();

      return canvas.toDataURL('image/png');
    })()`);

    const femaleBuffer = Buffer.from(femaleDataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(SAMPLES_DIR, 'sample_face_female.png'), femaleBuffer);
    console.log('[OK] sample_face_female.png 생성 완료 (512x512)');

  } finally {
    ws.close();
    chromeProcess.kill();
  }
}

main().catch((err) => {
  console.error('샘플 생성 오류:', err);
  process.exit(1);
});
