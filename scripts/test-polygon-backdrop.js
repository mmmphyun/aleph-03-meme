/**
 * @file test-polygon-backdrop.js
 * @description 자유 다각형(Lasso) 찢김 Shape 및 팝업북 배경판 파이프라인 무결성 단위 테스트
 */

import {
  createTornPolygonShape,
  createTornPaperGeometry,
  createTornPaperMesh
} from './torn-geometry.js';

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
console.log('🧪 다각형 올가미(Lasso) 찢김 Shape & 팝업북 배경판 검증');
console.log('====================================================\n');

// ----------------------------------------------------
// 1. createTornPolygonShape 기본 다각형 생성 및 버텍스 무결성 검증
// ----------------------------------------------------
console.log('[Test Suite 1: createTornPolygonShape 버텍스 무결성]');

// 5개 꼭짓점을 가진 별/오각형 형태의 다각형 좌표
const sampleLassoPoints = [
  { x: 0, y: 2.0 },
  { x: 1.8, y: 0.6 },
  { x: 1.1, y: -1.6 },
  { x: -1.1, y: -1.6 },
  { x: -1.8, y: 0.6 }
];

const shape = createTornPolygonShape(sampleLassoPoints, {
  roughness: 0.08,
  detail: 15,
  seed: 42
});

assert(shape !== null && typeof shape === 'object', 'Shape 객체가 정상 생성되어야 한다.');
assert(shape.autoClose === true, '다각형 외곽선은 closePath()를 통해 폐곡선이어야 한다.');

const points = shape.getPoints();
assert(points.length > sampleLassoPoints.length, `세그먼트 분할을 통해 다수의 버텍스가 생성되어야 한다. (생성된 점 개수: ${points.length})`);

let allFinite = true;
let hasNaN = false;
for (const pt of points) {
  if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
    allFinite = false;
  }
  if (Number.isNaN(pt.x) || Number.isNaN(pt.y)) {
    hasNaN = true;
  }
}
assert(allFinite && !hasNaN, '모든 버텍스 좌표는 NaN이 아닌 유한한 실수여야 한다.');

// 시작 꼭짓점 연결부 검증 (첫 점은 원래의 시작점과 일치해야 함)
assert(
  Math.abs(points[0].x - sampleLassoPoints[0].x) < 1e-5 &&
  Math.abs(points[0].y - sampleLassoPoints[0].y) < 1e-5,
  '다각형의 첫 번째 버텍스는 시작 꼭짓점 좌표와 일치해야 한다.'
);

// ----------------------------------------------------
// 2. 예외 및 코너 케이스 처리 검증
// ----------------------------------------------------
console.log('\n[Test Suite 2: createTornPolygonShape 예외 처리]');

// 점이 3개 미만인 경우 폴백
const fallbackShape = createTornPolygonShape([{ x: 0, y: 0 }], { roughness: 0.05 });
assert(fallbackShape !== null && fallbackShape.getPoints().length >= 3, '점 3개 미만 입력 시 기본 폴백 다각형을 생성해야 한다.');

// 첫 점과 마지막 점이 중복된 닫힌 입력 처리
const closedPointsInput = [
  { x: 0, y: 0 },
  { x: 2, y: 0 },
  { x: 1, y: 2 },
  { x: 0, y: 0 } // 중복 끝점
];
const shapeFromClosed = createTornPolygonShape(closedPointsInput, { detail: 10 });
assert(shapeFromClosed.getPoints().length > 0, '끝점이 중복된 다각형도 에러 없이 정상 생성되어야 한다.');

// ----------------------------------------------------
// 3. createTornPaperGeometry 3D Extrusion 및 UV 정규화 검증
// ----------------------------------------------------
console.log('\n[Test Suite 3: createTornPaperGeometry UV 매핑]');

const geom = createTornPaperGeometry(shape, { depth: 0.03, bevelEnabled: true });
assert(geom.attributes.position !== undefined, 'ExtrudeGeometry에 position 속성이 존재해야 한다.');
assert(geom.attributes.uv !== undefined, 'ExtrudeGeometry에 uv 속성이 생성되어야 한다.');
assert(geom.boundingBox !== null, '지오메트리 바운딩 박스가 계산되어야 한다.');

// UV 좌표 [0, 1] 범위 검증
const uvAttr = geom.attributes.uv;
let uvValid = true;
for (let i = 0; i < uvAttr.count; i++) {
  const u = uvAttr.getX(i);
  const v = uvAttr.getY(i);
  if (u < -0.001 || u > 1.001 || v < -0.001 || v > 1.001) {
    uvValid = false;
    break;
  }
}
assert(uvValid, '모든 UV 좌표는 바운딩 박스 기준 [0, 1] 범위 내에 선형 정규화 매핑되어야 한다.');

// ----------------------------------------------------
// 4. createTornPaperMesh 'polygon' 타입 지원 검증
// ----------------------------------------------------
console.log('\n[Test Suite 4: createTornPaperMesh 다각형 메쉬 생성]');

const polygonMesh = createTornPaperMesh('polygon', {
  points: sampleLassoPoints,
  roughness: 0.07,
  seed: 123
});

assert(polygonMesh.userData.isTornPaper === true, '메쉬 userData.isTornPaper가 true여야 한다.');
assert(polygonMesh.userData.shapeType === 'polygon', '메쉬 userData.shapeType이 polygon이어야 한다.');
assert(polygonMesh.castShadow === true, '종이 조각 메쉬는 castShadow가 활성화되어야 한다.');
assert(polygonMesh.receiveShadow === true, '종이 조각 메쉬는 receiveShadow가 활성화되어야 한다.');
assert(polygonMesh.material !== undefined, 'MeshStandardMaterial이 정상 부여되어야 한다.');

// ----------------------------------------------------
// 5. SceneManager setBackdropImage 종횡비 및 그림자 설정 검증
// ----------------------------------------------------
console.log('\n[Test Suite 5: SceneManager setBackdropImage 파이프라인]');

// SceneManager의 setBackdropImage 로직 단위 검증
import * as THREE from 'three';

const mockSceneManager = {
  options: {
    boardWidth: 12,
    boardHeight: 12,
    boardColor: 0x1b1e23,
    dirLightIntensity: 1.9
  },
  dirLight: new THREE.DirectionalLight(0xfff6ea, 1.9)
};

// 매트 보드 초기화
const boardGeo = new THREE.PlaneGeometry(mockSceneManager.options.boardWidth, mockSceneManager.options.boardHeight);
const boardMat = new THREE.MeshStandardMaterial({ color: mockSceneManager.options.boardColor });
mockSceneManager.boardMesh = new THREE.Mesh(boardGeo, boardMat);
mockSceneManager.backdropMesh = mockSceneManager.boardMesh;

// scene-manager.js의 setBackdropImage 함수 바인딩
import { SceneManager } from './scene-manager.js';
mockSceneManager.setBackdropImage = SceneManager.prototype.setBackdropImage;

// 가상 16:9 이미지 (가로 1600, 세로 900)
const mockImage16x9 = {
  naturalWidth: 1600,
  naturalHeight: 900
};

const updatedMesh = mockSceneManager.setBackdropImage(mockImage16x9, { baseWidth: 6.0 });

assert(updatedMesh !== null, 'setBackdropImage 호출 후 backdropMesh가 반환되어야 한다.');
assert(mockSceneManager.backdropMesh === updatedMesh, 'backdropMesh 레퍼런스가 동기화되어야 한다.');
assert(mockSceneManager.boardMesh === updatedMesh, 'boardMesh 레퍼런스가 backdropMesh와 호환되어야 한다.');

const planeParams = updatedMesh.geometry.parameters;
assert(planeParams.width === 6.0, '기본 가로 크기는 6.0이어야 한다.');
assert(Math.abs(planeParams.height - (6.0 * 900 / 1600)) < 1e-4, '세로 크기는 이미지 종횡비(9/16)에 맞게 3.375로 자동 조정되어야 한다.');
assert(updatedMesh.position.z === -0.05, '배경판 Z 위치는 -0.05여야 한다.');
assert(updatedMesh.receiveShadow === true, '배경판은 receiveShadow가 true여야 한다.');

// 조명 그림자 바이어스 및 강도 보존 확인
assert(mockSceneManager.dirLight.shadow.bias === -0.0003, '그림자 여드름 방지를 위한 shadow bias(-0.0003)가 유지되어야 한다.');
assert(mockSceneManager.dirLight.shadow.normalBias === 0.02, 'normalBias(0.02)가 유지되어야 한다.');
assert(mockSceneManager.dirLight.intensity === 1.9, '디렉셔널 라이트 intensity(1.9)가 유지되어야 한다.');

console.log('\n====================================================');
console.log(`📊 테스트 결과: 통과 ${totalPassed}개 / 실패 ${totalFailed}개`);
console.log('====================================================');

if (totalFailed > 0) {
  process.exit(1);
}
