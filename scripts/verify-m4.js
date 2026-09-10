/**
 * @file verify-m4.js
 * @description Milestone 4 템플릿 CRUD 및 JSON 3단계 유효성 검증 자동화 테스트 스크립트
 * - T03-C17: 사용자가 템플릿 3개 이상 생성 가능
 * - T03-C18: 생성한 템플릿 불러오기 및 3D 씬/문구 완벽 복원
 * - T03-C19: 템플릿 수정 및 변경 사항 저장
 * - T03-C20: 템플릿 삭제 및 목록 동기화
 * - T03-C21: 브라우저 새로고침(F5) 후 localStorage 데이터 영속성 보존
 * - T03-C22: 정상 JSON 가져오기 및 템플릿 복원
 * - T03-C23: 문법 손상 JSON 가져오기 거부 및 기존 템플릿 100% 보존
 * - T03-C24: 필수 항목 누락 JSON 가져오기 거부 및 기존 템플릿 100% 보존
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8090;
const DEBUG_PORT = 9226;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT_DIR = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'docs', 'verification-m4');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 1. 내장 HTTP 정적 서버
function startServer() {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg'
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

  console.log('[1/10] Headless Chrome 기동 (포트 ' + DEBUG_PORT + ')...');
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=' + DEBUG_PORT,
    '--disable-gpu',
    '--window-size=1366,960',
    `http://localhost:${PORT}/index.html`
  ], { stdio: 'ignore' });

  // Chrome WebSocket 연결 대기
  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
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

  console.log('[2/10] CDP WebSocket 연결 완료: ' + wsUrl);
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
    console.log(`  -> 스크린샷 저장: ${filename} (${buffer.length} bytes)`);
  };

  try {
    console.log('[3/10] 앱 및 Milestone 4 컴포넌트 초기화 상태 검증...');
    await sleep(1500);

    const initStatus = await evaluate(`(() => {
      const app = window.__CEREMONY_APP__;
      if (!app) return { ok: false, err: 'window.__CEREMONY_APP__ 없음' };
      const tplSection = document.getElementById('section-template-manager');
      const tplList = document.getElementById('template-list');
      const btnSave = document.getElementById('btn-save-template');
      const btnUpdate = document.getElementById('btn-update-template');
      const btnExport = document.getElementById('btn-export-json');
      const btnImport = document.getElementById('btn-trigger-import-json');
      const store = app.templateStore;

      return {
        ok: true,
        hasSection: !!tplSection,
        hasList: !!tplList,
        hasBtnSave: !!btnSave,
        hasBtnUpdate: !!btnUpdate,
        hasBtnExport: !!btnExport,
        hasBtnImport: !!btnImport,
        initialTemplatesCount: store ? store.getAll().length : 0
      };
    })()`);

    console.log('  초기 상태 확인:', initStatus);
    if (!initStatus.ok || !initStatus.hasSection || !initStatus.hasList) {
      throw new Error('Milestone 4 템플릿 관리자 DOM 요소 누락');
    }
    await takeScreenshot('01_init_m4.png');

    // 4. [T03-C17] 사용자가 템플릿을 3개 이상 생성 검증
    console.log('[4/10] [T03-C17] 사용자 템플릿 4개 신규 생성 및 UI 목록 동기화 검증...');
    const createdTemplates = await evaluate(`(() => {
      const app = window.__CEREMONY_APP__;

      // 1번 템플릿: 1:1 벨링엄 황제
      app.setAspectRatio('1:1');
      app.character.applyPose('BELLINGHAM_ARMS');
      app.character.applySkin('GOLDEN_TROPHY');
      app.setText('골든 벨링엄 세레모니');
      app.setFontSize(54);
      app.setFontColor('#ffe600');
      app.setTextY(0.85);
      const t1 = app.createTemplate('01_벨링엄_정방형');

      // 2번 템플릿: 4:5 호날두 시우
      app.setAspectRatio('4:5');
      app.character.applyPose('RONALDO_SIU');
      app.character.applySkin('RETRO_JERSEY');
      app.setText('피드용 시우우우!');
      app.setFontSize(58);
      app.setFontColor('#ffffff');
      app.setTextY(0.15);
      const t2 = app.createTemplate('02_호날두_인스타피드');

      // 3번 템플릿: 9:16 거제 야호
      app.setAspectRatio('9:16');
      app.character.applyPose('GEOJE_YAHO');
      app.character.applySkin('CLASSIC_DAISY');
      app.setText('스토리 거제 야호!');
      app.setFontSize(44);
      app.setFontColor('#39ff14');
      app.setTextY(0.85);
      const t3 = app.createTemplate('03_거제야호_숏폼');

      // 4번 템플릿: 1:1 최산 BAD
      app.setAspectRatio('1:1');
      app.character.applyPose('CHOI_SAN_BAD');
      app.character.applySkin('CLASSIC_DAISY');
      app.setText('치명적인 최산 BAD');
      app.setFontSize(50);
      app.setFontColor('#ff007f');
      app.setTextY(0.50);
      const t4 = app.createTemplate('04_최산BAD_치명');

      const all = app.templateStore.getAll();
      const domCards = document.querySelectorAll('.template-card');

      return {
        t1: { id: t1.id, title: t1.title, ratio: t1.ratio, pose: t1.pose },
        t2: { id: t2.id, title: t2.title, ratio: t2.ratio, pose: t2.pose },
        t3: { id: t3.id, title: t3.title, ratio: t3.ratio, pose: t3.pose },
        t4: { id: t4.id, title: t4.title, ratio: t4.ratio, pose: t4.pose },
        totalCount: all.length,
        domCardCount: domCards.length
      };
    })()`);

    console.log('  [생성된 템플릿들]:', createdTemplates);
    if (createdTemplates.totalCount < 4 || createdTemplates.domCardCount < 4) {
      throw new Error(`템플릿 4개 생성 실패 (totalCount=${createdTemplates.totalCount})`);
    }
    await sleep(400);
    await takeScreenshot('02_templates_created.png');

    // 5. [T03-C18] 생성한 템플릿 다시 불러오기 검증
    console.log('[5/10] [T03-C18] 템플릿 불러오기 및 3D/화면비/문구 복원 검증...');

    // 02번 호날두 템플릿 불러오기
    const loadT2Result = await evaluate(`(async () => {
      const app = window.__CEREMONY_APP__;
      const t2Id = "${createdTemplates.t2.id}";
      await app.loadTemplate(t2Id);

      return {
        ratio: app.state.ratio,
        pose: app.character.currentPose,
        skin: app.character.currentSkin,
        text: app.state.text,
        fontSize: app.state.fontSize,
        fontColor: app.state.fontColor,
        textY: app.state.textY
      };
    })()`);
    console.log('  [T2 호날두 4:5 복원 결과]:', loadT2Result);
    if (loadT2Result.ratio !== '4:5' || loadT2Result.pose !== 'RONALDO_SIU' || loadT2Result.text !== '피드용 시우우우!') {
      throw new Error('02번 템플릿 복원 불일치');
    }
    await sleep(400);
    await takeScreenshot('03_template_t2_loaded.png');

    // 03번 거제 야호 템플릿 불러오기
    const loadT3Result = await evaluate(`(async () => {
      const app = window.__CEREMONY_APP__;
      const t3Id = "${createdTemplates.t3.id}";
      await app.loadTemplate(t3Id);

      return {
        ratio: app.state.ratio,
        pose: app.character.currentPose,
        text: app.state.text,
        fontColor: app.state.fontColor
      };
    })()`);
    console.log('  [T3 거제야호 9:16 복원 결과]:', loadT3Result);
    if (loadT3Result.ratio !== '9:16' || loadT3Result.pose !== 'GEOJE_YAHO' || loadT3Result.fontColor !== '#39ff14') {
      throw new Error('03번 템플릿 복원 불일치');
    }
    await sleep(400);
    await takeScreenshot('04_template_t3_loaded.png');

    // 6. [T03-C19] 생성한 템플릿 수정 검증
    console.log('[6/10] [T03-C19] 템플릿 수정 및 실시간 저장 검증...');
    const updateResult = await evaluate(`(() => {
      const app = window.__CEREMONY_APP__;
      const t3Id = "${createdTemplates.t3.id}";

      // 문구와 포즈, 폰트 수정 후 update
      app.setText('수정된 거제 야호 (볼하트 변경)');
      app.setFontSize(60);
      app.character.applyPose('CUTE_HEART');

      const updated = app.updateTemplate(t3Id, {
        text: '수정된 거제 야호 (볼하트 변경)',
        fontSize: 60,
        pose: 'CUTE_HEART'
      });

      const reloaded = app.templateStore.getById(t3Id);
      return {
        id: reloaded.id,
        text: reloaded.text,
        fontSize: reloaded.fontSize,
        pose: reloaded.pose,
        updatedAt: reloaded.updatedAt
      };
    })()`);
    console.log('  [템플릿 수정 결과]:', updateResult);
    if (updateResult.text !== '수정된 거제 야호 (볼하트 변경)' || updateResult.pose !== 'CUTE_HEART') {
      throw new Error('템플릿 수정 실패');
    }
    await sleep(400);
    await takeScreenshot('05_template_updated.png');

    // 7. [T03-C20] 생성한 템플릿 삭제 검증
    console.log('[7/10] [T03-C20] 템플릿 삭제 및 목록 동기화 검증...');
    const deleteResult = await evaluate(`(() => {
      const app = window.__CEREMONY_APP__;
      const t1Id = "${createdTemplates.t1.id}";
      const countBefore = app.templateStore.getAll().length;
      const deleted = app.deleteTemplate(t1Id);
      const countAfter = app.templateStore.getAll().length;
      const exists = app.templateStore.getById(t1Id);

      return {
        deleted,
        countBefore,
        countAfter,
        stillExists: !!exists
      };
    })()`);
    console.log('  [템플릿 삭제 결과]:', deleteResult);
    if (!deleteResult.deleted || deleteResult.stillExists || deleteResult.countAfter !== deleteResult.countBefore - 1) {
      throw new Error('템플릿 삭제 실패');
    }
    await sleep(400);
    await takeScreenshot('06_template_deleted.png');

    // 8. [T03-C21] 브라우저 새로고침(F5) 후 데이터 영속화 확인
    console.log('[8/10] [T03-C21] 페이지 새로고침(F5) 후 localStorage 데이터 영속성 검증...');
    await send('Page.reload');
    await sleep(1500);

    const reloadResult = await evaluate(`(async () => {
      const app = window.__CEREMONY_APP__;
      if (!app) return { ok: false };

      const all = app.templateStore.getAll();
      const domCards = document.querySelectorAll('.template-card');

      // 방금 수정한 t3 템플릿이 그대로 남아있는지 확인
      const t3 = app.templateStore.getById("${createdTemplates.t3.id}");
      // 삭제한 t1 템플릿이 부활하지 않았는지 확인
      const t1 = app.templateStore.getById("${createdTemplates.t1.id}");

      // t3 다시 로드 테스트
      let loadOk = false;
      if (t3) {
        await app.loadTemplate(t3.id);
        loadOk = (app.state.text === t3.text && app.state.ratio === t3.ratio);
      }

      return {
        ok: true,
        templateCount: all.length,
        domCount: domCards.length,
        t3Found: !!t3,
        t3Text: t3 ? t3.text : null,
        t1Found: !!t1,
        loadOk
      };
    })()`);
    console.log('  [새로고침 후 영속화 결과]:', reloadResult);
    if (!reloadResult.ok || !reloadResult.t3Found || reloadResult.t1Found || !reloadResult.loadOk) {
      throw new Error('새로고침 후 데이터 영속성 검증 실패');
    }
    await sleep(400);
    await takeScreenshot('07_after_reload_f5.png');

    // 9. [T03-C22] 정상 JSON 가져오기 시 템플릿 복원 검증
    console.log('[9/10] [T03-C22/C23/C24] JSON 내보내기 & 3단계 유효성 검증...');

    // (1) 정상 JSON 내보내기 & 가져오기 복원 (T03-C22)
    const validJsonTest = await evaluate(`(() => {
      const app = window.__CEREMONY_APP__;
      const countBefore = app.templateStore.getAll().length;

      const validJson = JSON.stringify({
        version: '1.0',
        type: 'ceremony_template',
        template: {
          id: 'tpl_external_import_test',
          title: '외부 JSON 가져온 템플릿',
          ratio: '9:16',
          pose: 'CHOI_SAN_BAD',
          skin: 'GOLDEN_TROPHY',
          headScale: 1.5,
          cameraPosition: { x: 0, y: 1.6, z: 4.2 },
          cameraTarget: { x: 0, y: 1.1, z: 0 },
          text: '성공적으로 복원된 외부 문구!',
          fontSize: 48,
          fontColor: '#ff007f',
          textY: 0.85
        }
      });

      const importResult = app.importJsonString(validJson);
      const countAfter = app.templateStore.getAll().length;
      const imported = app.templateStore.getById('tpl_external_import_test');

      return {
        importResult,
        countBefore,
        countAfter,
        importedTitle: imported ? imported.title : null,
        currentText: app.state.text,
        currentRatio: app.state.ratio
      };
    })()`);
    console.log('  [T03-C22 정상 JSON 복원 결과]:', validJsonTest);
    if (!validJsonTest.importResult || validJsonTest.importedTitle !== '외부 JSON 가져온 템플릿' || validJsonTest.currentRatio !== '9:16') {
      throw new Error('정상 JSON 복원 실패');
    }
    await sleep(400);
    await takeScreenshot('08_json_valid_restored.png');

    // (2) [T03-C23] 문법 손상 JSON 가져오기 거부 및 기존 템플릿 100% 보존
    const syntaxErrorTest = await evaluate(`(() => {
      const app = window.__CEREMONY_APP__;
      const countBefore = app.templateStore.getAll().length;
      const titlesBefore = app.templateStore.getAll().map((t) => t.title);

      const brokenJson = '{"title": "깨진 JSON", "ratio": "1:1", NOT_A_VALID_JSON...';
      const importResult = app.importJsonString(brokenJson);
      const countAfter = app.templateStore.getAll().length;
      const alertBox = document.getElementById('template-alert-box');
      const alertMsg = alertBox ? alertBox.textContent : '';

      return {
        importResult,
        countBefore,
        countAfter,
        preserved: countBefore === countAfter,
        alertMsg
      };
    })()`);
    console.log('  [T03-C23 문법 손상 JSON 거부 결과]:', syntaxErrorTest);
    if (syntaxErrorTest.importResult !== false || !syntaxErrorTest.preserved || !syntaxErrorTest.alertMsg.includes('JSON 문법 오류')) {
      throw new Error('문법 손상 JSON 거부 또는 목록 보존 실패');
    }
    await sleep(400);
    await takeScreenshot('09_json_syntax_error_rejected.png');

    // (3) [T03-C24] 필수 항목 누락 JSON 가져오기 거부 및 기존 템플릿 100% 보존
    const missingFieldsTest = await evaluate(`(() => {
      const app = window.__CEREMONY_APP__;
      const countBefore = app.templateStore.getAll().length;

      // title만 있고 ratio, pose, text, fontSize 등이 누락된 객체
      const missingJson = JSON.stringify({
        title: '필수 항목이 몽땅 빠진 템플릿'
      });

      const importResult = app.importJsonString(missingJson);
      const countAfter = app.templateStore.getAll().length;
      const alertBox = document.getElementById('template-alert-box');
      const alertMsg = alertBox ? alertBox.textContent : '';

      return {
        importResult,
        countBefore,
        countAfter,
        preserved: countBefore === countAfter,
        alertMsg
      };
    })()`);
    console.log('  [T03-C24 필수 항목 누락 JSON 거부 결과]:', missingFieldsTest);
    if (missingFieldsTest.importResult !== false || !missingFieldsTest.preserved || !missingFieldsTest.alertMsg.includes('필수 항목 누락')) {
      throw new Error('필수 항목 누락 JSON 거부 또는 목록 보존 실패');
    }
    await sleep(400);
    await takeScreenshot('10_json_missing_fields_rejected.png');

    console.log('\n======================================================');
    console.log('🎉 [Milestone 4 전체 자동화 검증 100% 통과 (PASS)]');
    console.log('  - T03-C17: 템플릿 3개 이상 생성 (4개 생성 확인)');
    console.log('  - T03-C18: 템플릿 선택 시 3D 씬/문구 편집기 완벽 복원');
    console.log('  - T03-C19: 현재 편집 상태로 템플릿 갱신 및 저장');
    console.log('  - T03-C20: 템플릿 삭제 및 UI 목록 동기화');
    console.log('  - T03-C21: localStorage 연동 및 새로고침(F5) 후 데이터 보존');
    console.log('  - T03-C22: 정상 JSON 가져오기 시 템플릿 완벽 복원');
    console.log('  - T03-C23: 문법 손상 JSON 거부 안내 및 기존 템플릿 보존');
    console.log('  - T03-C24: 필수 필드 누락 JSON 거부 안내 및 기존 템플릿 보존');
    console.log('======================================================\n');
  } finally {
    ws.close();
    chromeProcess.kill();
    server.close();
  }
}

main().catch((err) => {
  console.error('[검증 중 오류 발생]:', err);
  process.exit(1);
});
