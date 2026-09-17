/**
 * @file test-milestone4.js
 * @description Milestone 4 템플릿 CRUD, localStorage 영속화 및 JSON 3단계 검증 단위 테스트
 */

import { TemplateStore, DEFAULT_PRESETS } from './template-store.js';
import { JSONValidator } from './json-validator.js';

// Node.js 환경용 localStorage 모킹
class LocalStorageMock {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

globalThis.localStorage = new LocalStorageMock();

let totalPassed = 0;
let totalFailed = 0;

function assert(condition, message) {
  if (condition) {
    totalPassed++;
    console.log(`[PASS] ${message}`);
  } else {
    totalFailed++;
    console.error(`[FAIL] ${message}`);
  }
}

console.log('====================================================');
console.log('🧪 [Milestone 4] 템플릿 영속성 & JSON 검증 테스트 시작');
console.log('====================================================\n');

// ----------------------------------------------------
// 1. TemplateStore 기본 프리셋 3종 확인 (T03-C17)
// ----------------------------------------------------
console.log('[Test Suite 1: TemplateStore 초기 프리셋]');
const store1 = new TemplateStore({ storageKey: 'test_tpl_key' });
const initialTemplates = store1.getAll();
assert(initialTemplates.length === 3, '초기 기동 시 기본 프리셋 3종이 로드되어야 한다. (T03-C17)');
assert(initialTemplates[0].name.includes('1:1'), '프리셋 1은 1:1 박스여야 한다.');
assert(initialTemplates[1].name.includes('4:5'), '프리셋 2는 4:5 피드여야 한다.');
assert(initialTemplates[2].name.includes('9:16'), '프리셋 3은 9:16 스토리여야 한다.');

// ----------------------------------------------------
// 2. 신규 템플릿 3개 이상 생성 (T03-C17)
// ----------------------------------------------------
console.log('\n[Test Suite 2: 신규 템플릿 3개 이상 생성]');
const tplA = store1.create({
  name: '나만의 사이버펑크 템플릿',
  aspect: '1:1',
  camera: { position: { x: 1, y: 1, z: 8 }, target: { x: 0, y: 0, z: 0 } },
  text: { text: 'CYBERPUNK 2026', fontSize: 50, fontColor: '#00ffcc', paperColor: '#111122' },
  layers: [
    { id: 'l_custom_1', name: '네온 사각 종이', shapeType: 'rectangle', width: 4.5, height: 3.0, roughness: 0.08, color: '#ff0055' }
  ]
});
assert(tplA && tplA.id.startsWith('tpl_'), '템플릿 A가 안정된 고유 ID로 생성되어야 한다.');

const tplB = store1.create({
  name: '미니멀 흑백 명함',
  aspect: '4:5',
  camera: { position: { x: 0, y: 0, z: 7 }, target: { x: 0, y: 0, z: 0 } },
  text: { text: 'SIMPLE IS BEST', fontSize: 36, fontColor: '#ffffff', paperColor: '#000000' },
  layers: [
    { id: 'l_custom_2', name: '원형 블랙 스티커', shapeType: 'circle', radius: 1.5, roughness: 0.05, color: '#222222' }
  ]
});
assert(tplB && tplB.id !== tplA.id, '템플릿 B가 생성되고 고유 ID가 A와 달라야 한다.');

const tplC = store1.create({
  name: '빈티지 레트로 엽서',
  aspect: '9:16',
  camera: { position: { x: 3, y: -2, z: 6 }, target: { x: 0, y: 0, z: 0 } },
  text: { text: 'RETRO VIBES', fontSize: 44, fontColor: '#6d4c41', paperColor: '#efebe9' },
  layers: [
    { id: 'l_custom_3', name: '크라프트지 베이스', shapeType: 'rectangle', width: 3.2, height: 5.8, roughness: 0.1, color: '#d7ccc8' }
  ]
});
assert(tplC && store1.getAll().length === 6, '사용자가 템플릿을 3개 이상 추가 생성할 수 있어야 한다. (총 6개) (T03-C17)');

// ----------------------------------------------------
// 3. 템플릿 불러오기 데이터 검증 (T03-C18)
// ----------------------------------------------------
console.log('\n[Test Suite 3: 템플릿 다시 불러오기]');
const loadedA = store1.getById(tplA.id);
assert(loadedA !== null, '생성한 템플릿 A를 ID로 완벽히 조회할 수 있어야 한다. (T03-C18)');
assert(loadedA.text.text === 'CYBERPUNK 2026', '텍스트 데이터가 정확히 보존되어 있어야 한다.');
assert(loadedA.layers.length === 1 && loadedA.layers[0].color === '#ff0055', '레이어 위치/색상/지오메트리가 보존되어야 한다.');
assert(loadedA.camera.position.x === 1, '카메라 앵글 정보가 보존되어야 한다.');

// ----------------------------------------------------
// 4. 템플릿 수정(이름 변경 & 현재 씬 덮어쓰기) (T03-C19)
// ----------------------------------------------------
console.log('\n[Test Suite 4: 템플릿 수정 (이름 변경 & 덮어쓰기)]');
const updatedA = store1.update(tplA.id, {
  name: '네오 사이버펑크 v2',
  text: { text: 'NEO CYBERPUNK 2026 UPDATED' }
});
assert(updatedA.name === '네오 사이버펑크 v2', '템플릿 이름이 정상 수정되어야 한다. (T03-C19)');
assert(updatedA.text.text === 'NEO CYBERPUNK 2026 UPDATED', '템플릿 내용 덮어쓰기가 정상 반영되어야 한다. (T03-C19)');
assert(updatedA.id === tplA.id, '수정 후에도 고유 식별자는 불변이어야 한다.');

// ----------------------------------------------------
// 5. 템플릿 삭제 (T03-C20)
// ----------------------------------------------------
console.log('\n[Test Suite 5: 템플릿 삭제]');
const deleteSuccess = store1.delete(tplB.id);
assert(deleteSuccess === true, '템플릿 B가 정상 삭제되어야 한다. (T03-C20)');
assert(store1.getById(tplB.id) === null, '삭제된 템플릿 B는 조회되지 않아야 한다.');
assert(store1.getById(tplA.id) !== null, '템플릿 B 삭제 시 템플릿 A는 영향 받지 않아야 한다. (T03-C20)');
assert(store1.getById(tplC.id) !== null, '템플릿 B 삭제 시 템플릿 C는 영향 받지 않아야 한다. (T03-C20)');
assert(store1.getAll().length === 5, '삭제 후 총 5개여야 한다.');

// ----------------------------------------------------
// 6. 새로고침(F5) 시뮬레이션 및 localStorage 영속화 (T03-C21)
// ----------------------------------------------------
console.log('\n[Test Suite 6: 새로고침(F5) 시뮬레이션 및 localStorage 영속화]');
// 동일한 storageKey로 새로운 Store 인스턴스 생성 (브라우저 새로고침 효과)
const reloadedStore = new TemplateStore({ storageKey: 'test_tpl_key' });
const reloadedTemplates = reloadedStore.getAll();
assert(reloadedTemplates.length === 5, '새로고침(F5) 후에도 템플릿 5개가 100% 유지되어야 한다. (T03-C21)');
const reloadedA = reloadedStore.getById(tplA.id);
assert(reloadedA && reloadedA.name === '네오 사이버펑크 v2', '새로고침 후에도 수정한 이름이 유지되어야 한다. (T03-C21)');
assert(reloadedStore.getById(tplB.id) === null, '새로고침 후에도 삭제한 템플릿 B는 존재하지 않아야 한다. (T03-C21)');

// ----------------------------------------------------
// 7. JSON 3단계 검증: 문법 손상 JSON 거부 (T03-C23)
// ----------------------------------------------------
console.log('\n[Test Suite 7: Stage 1 문법 오류 JSON 거부 (T03-C23)]');
const brokenJson1 = '{"version": "1.0", "aspect": "1:1", layers: [}'; // 문법 파손
const res1 = JSONValidator.validate(brokenJson1);
assert(res1.valid === false, '문법 손상 JSON은 거부되어야 한다. (T03-C23)');
assert(res1.stage === 1, 'Stage 1(문법 검증)에서 탈락해야 한다.');
assert(res1.errorType === 'SYNTAX_ERROR', '오류 타입이 SYNTAX_ERROR여야 한다.');

const brokenJson2 = '{ "version": "1.0", "aspect": "1:1"'; // 닫는 괄호 누락
const res2 = JSONValidator.validate(brokenJson2);
assert(res2.valid === false && res2.stage === 1, '닫는 괄호 누락 JSON도 Stage 1에서 거부되어야 한다.');

// ----------------------------------------------------
// 8. JSON 3단계 검증: 구조 검증 (Stage 2)
// ----------------------------------------------------
console.log('\n[Test Suite 8: Stage 2 구조 검증]');
const arrayRootJson = '[1, 2, 3]';
const resArray = JSONValidator.validate(arrayRootJson);
assert(resArray.valid === false && resArray.stage === 2, '배열 형태 루트는 Stage 2에서 거부되어야 한다.');

// ----------------------------------------------------
// 9. JSON 3단계 검증: 필수 항목 누락 거부 (T03-C24)
// ----------------------------------------------------
console.log('\n[Test Suite 9: Stage 3 필수 항목 누락 JSON 거부 (T03-C24)]');
// version 누락
const missingVersion = JSON.stringify({
  aspect: '1:1',
  text: '문구',
  layers: []
});
const resMissingV = JSONValidator.validate(missingVersion);
assert(resMissingV.valid === false && resMissingV.stage === 3, 'version 누락 시 Stage 3에서 거부되어야 한다. (T03-C24)');
assert(resMissingV.missingFields.includes('version'), '누락 목록에 version이 포함되어야 한다.');

// layers 누락
const missingLayers = JSON.stringify({
  version: '1.0',
  aspect: '1:1',
  text: '문구'
});
const resMissingL = JSONValidator.validate(missingLayers);
assert(resMissingL.valid === false && resMissingL.missingFields.includes('layers'), 'layers 누락 시 안내 메시지와 함께 거부되어야 한다. (T03-C24)');

// text 누락
const missingText = JSON.stringify({
  version: '1.0',
  aspect: '1:1',
  layers: []
});
const resMissingT = JSONValidator.validate(missingText);
assert(resMissingT.valid === false && resMissingT.missingFields.includes('text'), 'text 누락 시 안내 메시지와 함께 거부되어야 한다. (T03-C24)');

// aspect 누락
const missingAspect = JSON.stringify({
  version: '1.0',
  text: '문구',
  layers: []
});
const resMissingA = JSONValidator.validate(missingAspect);
assert(resMissingA.valid === false && resMissingA.missingFields.includes('aspect'), 'aspect 누락 시 안내 메시지와 함께 거부되어야 한다. (T03-C24)');

// 복수 필드 동시 누락 안내
const missingMultiple = JSON.stringify({
  title: '잘못된 데이터'
});
const resMissingMulti = JSONValidator.validate(missingMultiple);
assert(resMissingMulti.valid === false && resMissingMulti.missingFields.length === 4, '모든 필수 항목 누락 목록이 정확히 식별되어야 한다.');
console.log('   -> 식별된 누락 필드:', resMissingMulti.missingFields.join(', '));
console.log('   -> 사용자 안내 메시지:', resMissingMulti.message);

// ----------------------------------------------------
// 10. JSON 3단계 검증: 정상 JSON 통과 (T03-C22)
// ----------------------------------------------------
console.log('\n[Test Suite 10: 정상 JSON 3단계 검증 통과 (T03-C22)]');
const validExportData = {
  version: '1.0',
  exportedAt: new Date().toISOString(),
  aspect: '1:1',
  camera: {
    position: { x: 0, y: 0, z: 8.2 },
    target: { x: 0, y: 0, z: 0 }
  },
  text: {
    text: '테스트 문구 ✂️',
    fontSize: 42,
    fontColor: '#1a1c20',
    paperColor: '#fbf8ef',
    posX: 0,
    posY: -1.2
  },
  layers: [
    {
      id: 'l_1',
      name: '사각 종이',
      shapeType: 'rectangle',
      width: 4.0,
      height: 2.8,
      roughness: 0.075,
      seed: 42,
      color: '#ede8dc',
      textureDataUrl: null,
      position: { x: -0.2, y: -0.1, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      zIndex: 0
    }
  ],
  templates: reloadedStore.getAll()
};

const resValid = JSONValidator.validate(JSON.stringify(validExportData, null, 2));
assert(resValid.valid === true, '정상 JSON은 3단계를 모두 통과해야 한다. (T03-C22)');
assert(resValid.data.version === '1.0', '파싱된 정상 데이터가 반환되어야 한다.');
assert(resValid.data.layers.length === 1, '정상 레이어 데이터가 복원 준비되어야 한다.');
assert(resValid.data.templates.length === 5, '포함된 템플릿 목록이 정상 유지되어야 한다.');

console.log('\n====================================================');
console.log(`📊 테스트 결과: 총 ${totalPassed + totalFailed}개 항목 중 ${totalPassed}개 통과, ${totalFailed}개 실패`);
console.log('====================================================');

if (totalFailed > 0) {
  process.exit(1);
} else {
  console.log('\n🎉 Milestone 4 모든 요구사항 검증 완료 (T03-C17 ~ T03-C24 100% PASS)');
  process.exit(0);
}
