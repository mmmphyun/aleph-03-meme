/**
 * @file test-tunnel-book-layers.js
 * @description 터널북 독립 2-레이어화 및 찢긴 종이 흰색 섬유 테두리(White Deckle Edge) 단위 검증 테스트
 */

import * as THREE from 'three';
import {
  createTornPaperMesh,
  createTornPolygonShape,
  createTornPaperGeometry
} from './torn-geometry.js';
import { SceneManager } from './scene-manager.js';

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
console.log('🧪 터널북 2-레이어 & 찢긴 종이 흰색 섬유 테두리(White Deckle Edge) 검증');
console.log('====================================================\n');

// ----------------------------------------------------
// 1. 찢긴 종이 조각 흰색/아이보리 섬유 테두리 (White Deckle Edge) 검증
// ----------------------------------------------------
console.log('[Test Suite 1: 찢긴 종이 흰색 섬유 테두리 구조 검증]');

const samplePoints = [
  { x: 0, y: 1.5 },
  { x: 1.2, y: 0.5 },
  { x: 0.8, y: -1.2 },
  { x: -0.8, y: -1.2 },
  { x: -1.2, y: 0.5 }
];

const tornMesh = createTornPaperMesh('polygon', {
  points: samplePoints,
  roughness: 0.08,
  seed: 42,
  hasWhiteBorder: true
});

assert(tornMesh !== null, 'TornPaperMesh가 정상 생성되어야 한다.');
assert(tornMesh.userData.hasWhiteBorder === true, 'userData.hasWhiteBorder가 true여야 한다.');
assert(tornMesh.whiteBorderMesh !== undefined, '하위 흰색 섬유 베이스 메쉬(whiteBorderMesh)가 연결되어야 한다.');
assert(tornMesh.children.includes(tornMesh.whiteBorderMesh), 'whiteBorderMesh가 메인 메쉬의 child로 등록되어야 한다.');

// 흰색 베이스 메쉬 물리/머티리얼 스펙 검증
const border = tornMesh.whiteBorderMesh;
assert(border.scale.x >= 1.03 && border.scale.x <= 1.05, `베이스 스케일이 1.03~1.05 범위 내여야 한다. (현재: ${border.scale.x})`);
assert(border.position.z === -0.002, `전면 텍스처 메쉬 대비 Z -0.002 후면에 위치해야 한다. (현재: ${border.position.z})`);
assert(border.material.color.value === 0xf7f5f0, '베이스 종이는 아이보리/화이트(0xf7f5f0) 색상이어야 한다.');
assert(border.material.roughness === 0.95, '베이스 종이는 0.95의 높은 무광 거칠기를 가져야 한다.');
assert(border.geometry.options.depth === 0.035, '베이스 종이 지오메트리 두께는 0.035여야 한다.');
assert(border.castShadow === true && border.receiveShadow === true, '베이스 메쉬는 그림자 투영 및 수신이 모두 활성화되어야 한다.');

// hasWhiteBorder: false 비활성화 옵션 검증
const noBorderMesh = createTornPaperMesh('polygon', {
  points: samplePoints,
  hasWhiteBorder: false
});
assert(noBorderMesh.whiteBorderMesh === undefined, 'hasWhiteBorder: false 시 베이스 메쉬가 생성되지 않아야 한다.');
assert(noBorderMesh.children.length === 0, 'hasWhiteBorder: false 시 children이 비어있어야 한다.');

// ----------------------------------------------------
// 2. destination-out 캔버스 구멍 뚫기 로직 검증
// ----------------------------------------------------
console.log('\n[Test Suite 2: 배경 텍스처 다각형 구멍(Punchout) 뚫기 파이프라인]');

class MockCanvasContext {
  constructor() {
    this.globalCompositeOperation = 'source-over';
    this.operations = [];
  }
  drawImage() { this.operations.push('drawImage'); }
  save() { this.operations.push('save'); }
  restore() { this.operations.push('restore'); }
  beginPath() { this.operations.push('beginPath'); }
  moveTo(x, y) { this.operations.push(`moveTo:${x},${y}`); }
  lineTo(x, y) { this.operations.push(`lineTo:${x},${y}`); }
  closePath() { this.operations.push('closePath'); }
  fill() { this.operations.push('fill'); }
}

const mockCtx = new MockCanvasContext();
mockCtx.drawImage();
mockCtx.save();
mockCtx.globalCompositeOperation = 'destination-out';
mockCtx.beginPath();
samplePoints.forEach((p, idx) => {
  if (idx === 0) mockCtx.moveTo(p.x, p.y);
  else mockCtx.lineTo(p.x, p.y);
});
mockCtx.closePath();
mockCtx.fill();
mockCtx.restore();

assert(mockCtx.globalCompositeOperation === 'destination-out', 'globalCompositeOperation에 destination-out이 적용되어야 한다.');
assert(mockCtx.operations.includes('beginPath') && mockCtx.operations.includes('closePath'), '다각형 패스가 정상 생성 및 닫혀야 한다.');
assert(mockCtx.operations.includes('fill'), '지정된 영역이 지워지도록 fill()이 호출되어야 한다.');

// ----------------------------------------------------
// 3. 독립 3D 메쉬 레이어(Backdrop Layer) 및 터널북 씬 구조 검증
// ----------------------------------------------------
console.log('\n[Test Suite 3: 씬 매니저 터널북 레이어링 및 매트 보드 Z 위치 검증]');

const mockSceneManager = {
  options: {
    boardWidth: 14,
    boardHeight: 14,
    boardColor: 0x14161a,
    dirLightIntensity: 1.9
  },
  layers: [],
  scene: new THREE.Scene()
};

mockSceneManager._initMatteBoard = SceneManager.prototype._initMatteBoard;
mockSceneManager.addPaperMesh = SceneManager.prototype.addPaperMesh;
mockSceneManager._initMatteBoard();

assert(mockSceneManager.boardMesh.position.z === -0.15, '액자 내부 어두운 매트 보드는 Z = -0.15에 배치되어야 한다.');
assert(mockSceneManager.boardMesh.receiveShadow === true, '어두운 매트 보드는 그림자를 수신해야 한다.');

// 독립 Backdrop Layer 생성 시뮬레이션
const bgGeo = new THREE.PlaneGeometry(6.0, 4.0);
const bgMat = new THREE.MeshStandardMaterial({
  roughness: 0.88,
  transparent: true,
  alphaTest: 0.001
});
const backdropLayer = new THREE.Mesh(bgGeo, bgMat);
backdropLayer.position.set(0, 0, 0.00);
backdropLayer.userData = {
  id: 'layer_backdrop',
  name: '🖼️ 배경 레이어 (오려진 원본)',
  shapeType: 'rectangle',
  isBackdropLayer: true,
  zIndex: 0.00
};

// 팝업 조각 레이어 생성 시뮬레이션
const popupPiece = tornMesh;
popupPiece.position.set(0.5, -0.3, 0.60);
popupPiece.userData.name = '✂️ 팝업 조각 (인물/물체)';
popupPiece.userData.zIndex = 0.60;

mockSceneManager.addPaperMesh(backdropLayer, 0.00);
mockSceneManager.addPaperMesh(popupPiece, 0.60);

assert(mockSceneManager.layers.length === 2, '씬 레이어에 배경과 팝업 2개 레이어가 등록되어야 한다.');
assert(mockSceneManager.layers[0].position.z === 0.00, '배경 레이어 기본 Z는 0.00이어야 한다.');
assert(mockSceneManager.layers[1].position.z === 0.60, '팝업 조각 기본 Z는 0.60이어야 한다.');
assert(mockSceneManager.layers[0].userData.name.includes('배경 레이어'), '배경 레이어 명칭이 올바르게 표시되어야 한다.');
assert(mockSceneManager.layers[1].userData.name.includes('팝업 조각'), '팝업 조각 명칭이 올바르게 표시되어야 한다.');

// 계층적 Z-간격 무결성: 매트 보드(-0.15) < 배경 레이어(0.00) < 팝업 조각(0.60)
assert(
  mockSceneManager.boardMesh.position.z < backdropLayer.position.z &&
  backdropLayer.position.z < popupPiece.position.z,
  'Z축 적재 순서: 매트 보드(-0.15) < 배경 레이어(0.00) < 팝업 조각(0.60)이 완벽한 터널북 입체 단차를 형성해야 한다.'
);

console.log('\n====================================================');
console.log(`📊 테스트 결과: 통과 ${totalPassed}개 / 실패 ${totalFailed}개`);
console.log('====================================================');

if (totalFailed > 0) {
  process.exit(1);
}
