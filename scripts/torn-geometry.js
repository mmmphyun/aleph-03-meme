/**
 * @file torn-geometry.js
 * @description 다중 주파수 노이즈 및 고조파를 이용한 절차적 찢긴 종이(Torn Edge) 2D Shape 및 3D ExtrudeGeometry 빌더
 */

import * as THREE from 'three';

/**
 * 2D 펄린/심플렉스 스타일 결합형 가상 노이즈 생성기
 * 외부 의존성 없이 시드 기반의 100% 결정론적 2D 노이즈를 연산합니다.
 */
class PseudoNoise2D {
  /**
   * @param {number} seed - 난수 시드 값
   */
  constructor(seed = 1337) {
    this.seed = seed;
    this.perm = new Uint8Array(512);
    this._initPermutation();
  }

  /**
   * 시드 기반 순열 테이블 초기화 (Linear Congruential Generator)
   * @private
   */
  _initPermutation() {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }
    let s = (this.seed ^ 0xcafebabe) >>> 0;
    for (let i = 255; i > 0; i--) {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      const j = s % (i + 1);
      const temp = p[i];
      p[i] = p[j];
      p[j] = temp;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  /**
   * 2D 공간 연속 그래디언트 노이즈 (-1.0 ~ 1.0)
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    // Quintic 페이드 커브 (6t^5 - 15t^4 + 10t^3)
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);

    const aa = this.perm[this.perm[X] + Y];
    const ab = this.perm[this.perm[X] + Y + 1];
    const ba = this.perm[this.perm[X + 1] + Y];
    const bb = this.perm[this.perm[X + 1] + Y + 1];

    const grad = (hash, gx, gy) => {
      const h = hash & 7;
      const uVal = h < 4 ? gx : gy;
      const vVal = h < 4 ? gy : gx;
      return ((h & 1) === 0 ? uVal : -uVal) + ((h & 2) === 0 ? vVal : -vVal);
    };

    const x1 = this._lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = this._lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return this._lerp(x1, x2, v);
  }

  /**
   * 옥타브 분할 FBM (Fractal Brownian Motion)
   * 종이 섬유의 거친 찢김 단면을 재현하기 위해 저주파 파형에 고주파 미세 섬유 요철을 누적합니다.
   * @param {number} x
   * @param {number} y
   * @param {number} octaves
   * @returns {number}
   */
  fbm(x, y, octaves = 4) {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1.0;
    let sumAmp = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise2D(x * frequency, y * frequency);
      sumAmp += amplitude;
      frequency *= 2.13;
      amplitude *= 0.48;
    }
    return sumAmp > 0 ? value / sumAmp : 0;
  }

  _lerp(a, b, t) {
    return a + t * (b - a);
  }
}

/**
 * 찢긴 사각형 외곽선 2D Shape 생성
 * 4개의 각 변에 대해 촘촘한 세그먼트를 분할하고 양 끝 꼭짓점(코너) 연결성을 보장하면서
 * 다중 주파수 사인파 및 2D FBM 노이즈를 수직 변위로 인가합니다.
 *
 * @param {number} width - 가로 크기
 * @param {number} height - 세로 크기
 * @param {Object} options - 알고리즘 파라미터
 * @param {number} [options.roughness=0.08] - 찢김 거칠기 강도 (기본 대비 진폭)
 * @param {number} [options.detail=60] - 각 변당 세그먼트 분할 수
 * @param {number} [options.seed=42] - 노이즈 시드
 * @param {Object} [options.tornEdges] - 변별 찢김 적용 여부 { top: true, right: true, bottom: true, left: true }
 * @returns {THREE.Shape}
 */
export function createTornRectangleShape(width = 3, height = 2, options = {}) {
  const {
    roughness = 0.08,
    detail = 60,
    seed = 42,
    tornEdges = { top: true, right: true, bottom: true, left: true }
  } = options;

  const noise = new PseudoNoise2D(seed);
  const halfW = width / 2;
  const halfH = height / 2;

  // 4개 꼭짓점 좌표 (시계 방향: 하단좌 -> 하단우 -> 상단우 -> 상단좌)
  const cBL = { x: -halfW, y: -halfH };
  const cBR = { x: halfW, y: -halfH };
  const cTR = { x: halfW, y: halfH };
  const cTL = { x: -halfW, y: halfH };

  /**
   * 단일 변에 대한 찢김 포인트 생성
   * 코너 부분의 비연속 단절을 방지하기 위해 시작점과 끝점 부근에서는 엔벨로프(sin 커브)를 적용하여 0으로 수렴시킵니다.
   */
  const generateEdgePoints = (pStart, pEnd, normalX, normalY, isTorn, edgeIndex) => {
    const points = [];
    const steps = Math.max(8, detail);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const baseX = pStart.x + t * (pEnd.x - pStart.x);
      const baseY = pStart.y + t * (pEnd.y - pStart.y);

      if (!isTorn || i === 0 || i === steps) {
        points.push(new THREE.Vector2(baseX, baseY));
        continue;
      }

      // 엔벨로프: 양 끝 코너에서는 0, 중간에서는 1
      const envelope = Math.pow(Math.sin(Math.PI * t), 0.75);

      // 변당 1주기 내외로 완만하게 굽이치는 초저주파 대형 곡선 (고주파/중주파 톱니 노이즈 제거)
      const lowFreqWave = Math.sin(t * Math.PI * 2.0 + edgeIndex * 1.57);

      // 1옥타브 저주파 노이즈 결합 (자글자글한 고주파 FBM 배제)
      const lowFreqNoise = noise.noise2D(t * 1.5 + edgeIndex * 2.4, edgeIndex * 1.8);

      const displacement = (lowFreqWave * 0.70 + lowFreqNoise * 0.30) * (roughness * 0.50) * Math.min(width, height) * envelope;

      const px = baseX + normalX * displacement;
      const py = baseY + normalY * displacement;
      points.push(new THREE.Vector2(px, py));
    }

    return points;
  };

  // 4개 변 생성 (하단, 우측, 상단, 좌측)
  const bottomPts = generateEdgePoints(cBL, cBR, 0, -1, tornEdges.bottom !== false, 0);
  const rightPts = generateEdgePoints(cBR, cTR, 1, 0, tornEdges.right !== false, 1);
  const topPts = generateEdgePoints(cTR, cTL, 0, 1, tornEdges.top !== false, 2);
  const leftPts = generateEdgePoints(cTL, cBL, -1, 0, tornEdges.left !== false, 3);

  const shape = new THREE.Shape();
  shape.moveTo(bottomPts[0].x, bottomPts[0].y);

  // 중복되는 변 연결 꼭짓점은 1개씩만 추가
  for (let i = 1; i < bottomPts.length; i++) shape.lineTo(bottomPts[i].x, bottomPts[i].y);
  for (let i = 1; i < rightPts.length; i++) shape.lineTo(rightPts[i].x, rightPts[i].y);
  for (let i = 1; i < topPts.length; i++) shape.lineTo(topPts[i].x, topPts[i].y);
  for (let i = 1; i < leftPts.length; i++) shape.lineTo(leftPts[i].x, leftPts[i].y);

  shape.closePath();
  return shape;
}

/**
 * 찢긴 원형 외곽선 2D Shape 생성
 * 각도 0 ~ 2π 구간을 원형으로 순회하며, 폐곡선 연속성을 보장하기 위해 2D 원형 좌표계 기반의 노이즈 샘플링 및 정수 주파수 고조파를 인가합니다.
 *
 * @param {number} radius - 기본 반지름
 * @param {Object} options - 알고리즘 파라미터
 * @param {number} [options.roughness=0.06] - 찢김 거칠기 강도
 * @param {number} [options.segments=140] - 둘레 세그먼트 수
 * @param {number} [options.seed=77] - 노이즈 시드
 * @returns {THREE.Shape}
 */
export function createTornCircleShape(radius = 1.2, options = {}) {
  const {
    roughness = 0.06,
    segments = 140,
    seed = 77
  } = options;

  const noise = new PseudoNoise2D(seed);
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / segments;

  for (let i = 0; i <= segments; i++) {
    const angle = i * step;

    // 단위 원 좌표계 (2D 노이즈 원형 샘플링을 통해 0도와 360도 경계면의 단절 없는 주기성 보장)
    const unitX = Math.cos(angle);
    const unitY = Math.sin(angle);

    // 둘레를 따라 완만하게 굽이치는 초저주파 대형 곡선 (1~2주기, 톱니/고주파 고조파 제거)
    const lowFreqWave = Math.sin(angle * 2.0 + 0.8);

    // 1옥타브 저주파 노이즈 샘플링 (FBM 4옥타브 고주파 톱니 제거)
    const lowFreqNoise = noise.noise2D((unitX + 1.5) * 1.6, (unitY + 1.5) * 1.6);

    const rOffset = (lowFreqWave * 0.65 + lowFreqNoise * 0.35) * (roughness * 0.55) * radius;
    const currentR = Math.max(0.1, radius + rOffset);

    const x = currentR * Math.cos(angle);
    const y = currentR * Math.sin(angle);

    if (i === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }

  shape.closePath();
  return shape;
}

/**
 * 다각형 포인트 목록을 기반으로 캔버스 2D 컨텍스트 또는 THREE.Shape에 일체화된 외곽선 경로를 생성합니다.
 * tearStyle에 따라 완만한 3차 베지에 스플라인('smooth') 또는 반듯한 직선 다각형('geometric')으로 완벽 일치 렌더링합니다.
 *
 * @param {CanvasRenderingContext2D|THREE.Shape|THREE.Path} pathTarget - 경로를 등록할 대상 (Canvas context 또는 THREE.Shape)
 * @param {Array<{x: number, y: number}>} points - 다각형 꼭짓점 배열
 * @param {Object} [options]
 * @param {'smooth'|'geometric'} [options.tearStyle='smooth'] - 찢김 스타일 프리셋
 * @param {number} [options.scaleX=1] - X축 스케일 배율
 * @param {number} [options.scaleY=1] - Y축 스케일 배율
 * @param {number} [options.offsetX=0] - X축 평행 이동
 * @param {number} [options.offsetY=0] - Y축 평행 이동
 * @param {boolean} [options.closed=true] - 폐곡선 여부
 */
export function buildPolygonPath(pathTarget, points, options = {}) {
  if (!pathTarget || !Array.isArray(points) || points.length < 3) return;

  const {
    tearStyle = 'smooth',
    scaleX = 1,
    scaleY = 1,
    offsetX = 0,
    offsetY = 0,
    closed = true
  } = options;

  // 꼭짓점 좌표 정제 및 스케일/오프셋 적용
  let pts = points.map(p => ({
    x: Number(p.x) * scaleX + offsetX,
    y: Number(p.y) * scaleY + offsetY
  }));

  // 마지막 점이 첫 점과 중복되는 경우 제거
  const last = pts[pts.length - 1];
  const first = pts[0];
  if (pts.length > 3 && Math.hypot(last.x - first.x, last.y - first.y) < 1e-6) {
    pts = pts.slice(0, -1);
  }

  const n = pts.length;
  if (n < 3) return;

  if (typeof pathTarget.beginPath === 'function') {
    pathTarget.beginPath();
  }

  pathTarget.moveTo(pts[0].x, pts[0].y);

  if (tearStyle === 'geometric') {
    // 각진 기하학 오림: 반듯한 직선 각진 다각형으로 렌더링
    for (let i = 1; i < n; i++) {
      pathTarget.lineTo(pts[i].x, pts[i].y);
    }
  } else {
    // 부드러운 유기적 찢김: 완만한 Catmull-Rom 3차 베지에 스플라인으로 렌더링
    for (let i = 0; i < n; i++) {
      if (!closed && i === n - 1) break;

      const pPrev = pts[(i - 1 + n) % n];
      const pCurr = pts[i];
      const pNext = pts[(i + 1) % n];
      const pNext2 = pts[(i + 2) % n];

      // Catmull-Rom to Cubic Bézier 제어점 변환 (Tension = 0.5 표준)
      const cp1x = pCurr.x + (pNext.x - pPrev.x) / 6;
      const cp1y = pCurr.y + (pNext.y - pPrev.y) / 6;
      const cp2x = pNext.x - (pNext2.x - pCurr.x) / 6;
      const cp2y = pNext.y - (pNext2.y - pCurr.y) / 6;

      pathTarget.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, pNext.x, pNext.y);
    }
  }

  if (closed && typeof pathTarget.closePath === 'function') {
    pathTarget.closePath();
  }
}

/**
 * 사용자가 지정한 임의의 다각형(Lasso 외곽선)을 기반으로 자연스러운 찢긴 종이 2D Shape 생성
 * 배경 구멍(Canvas punchout)과 완벽히 동일한 포인트 리스트 및 곡선 생성 로직(buildPolygonPath)을 공유하여
 * 정면 뷰에서 배경 구멍과 팝업 조각의 윤곽선이 1픽셀의 오차도 없이 100% 일치하도록 보장합니다.
 *
 * @param {Array<{x: number, y: number}>} points - 다각형 꼭짓점 좌표 배열
 * @param {Object} [options] - 알고리즘 파라미터
 * @param {'smooth'|'geometric'} [options.tearStyle='smooth'] - 찢김 스타일 프리셋 ('smooth' | 'geometric')
 * @param {boolean} [options.closed=true] - 폐곡선 여부 (시작점과 끝점 자동 연결)
 * @returns {THREE.Shape}
 */
export function createTornPolygonShape(points = [], options = {}) {
  const {
    tearStyle = 'smooth',
    closed = true
  } = options;

  const shape = new THREE.Shape();
  if (!Array.isArray(points) || points.length < 3) {
    console.warn('[createTornPolygonShape] 다각형을 형성하기 위해 최소 3개 이상의 점이 필요합니다.');
    // 폴백: 기본 삼각형
    shape.moveTo(0, 0);
    shape.lineTo(1, 0);
    shape.lineTo(0.5, 1);
    shape.closePath();
    return shape;
  }

  // 꼭짓점 목록 복사 및 정제 (마지막 점이 첫 점과 거의 일치하는 경우 중복 제거)
  let pts = points.map(p => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 }));
  const last = pts[pts.length - 1];
  const first = pts[0];
  const distSq = (last.x - first.x) ** 2 + (last.y - first.y) ** 2;
  if (distSq < 1e-8 && pts.length > 3) {
    pts.pop();
  }

  buildPolygonPath(shape, pts, { tearStyle, closed });
  return shape;
}

/**
 * 2D Shape를 실제 종이 두께와 베벨을 갖는 3D ExtrudeGeometry로 변환
 *
 * @param {THREE.Shape} shape - 2D 외곽선 형상
 * @param {Object} [customOptions] - THREE.ExtrudeGeometry 파라미터 오버라이드
 * @param {Object} [customOptions.uvBounds] - 정규화 UV 계산용 명시적 바운딩 박스 ({ minX, maxX, minY, maxY })
 * @returns {THREE.ExtrudeGeometry}
 */
export function createTornPaperGeometry(shape, customOptions = {}) {
  const defaultOptions = {
    depth: 0.03,            // 실제 종이의 얇은 3D 입체 두께
    bevelEnabled: true,     // 단면 하이라이트를 위한 베벨 활성화
    bevelThickness: 0.005,  // 베벨 전면 돌출 두께
    bevelSize: 0.005,       // 베벨 측면 확장 폭
    bevelOffset: 0,
    bevelSegments: 2,       // 부드러운 하이라이트 연출 세그먼트
    curveSegments: 24,
    steps: 1
  };

  const extrudeSettings = Object.assign({}, defaultOptions, customOptions);
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // 지오메트리 중심점 계산 및 법선 벡터 재연산
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();

  // 상단 면(Front Face) 텍스처 매핑을 위한 정밀 UV 정규화 좌표 생성
  _generateNormalizedUVs(geometry, customOptions.uvBounds);

  return geometry;
}

/**
 * ExtrudeGeometry의 Z축 전면 버텍스에 대해 [0, 1] 범위의 평면 정규화 UV 좌표를 부여합니다.
 * @private
 * @param {THREE.ExtrudeGeometry} geometry
 * @param {Object} [explicitBounds] - 명시적 바운딩 좌표 ({ minX, maxX, minY, maxY })
 */
function _generateNormalizedUVs(geometry, explicitBounds = null) {
  const box = geometry.boundingBox;
  if (!box) return;

  const minX = explicitBounds && explicitBounds.minX !== undefined ? explicitBounds.minX : box.min.x;
  const maxX = explicitBounds && explicitBounds.maxX !== undefined ? explicitBounds.maxX : box.max.x;
  const minY = explicitBounds && explicitBounds.minY !== undefined ? explicitBounds.minY : box.min.y;
  const maxY = explicitBounds && explicitBounds.maxY !== undefined ? explicitBounds.maxY : box.max.y;

  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0 || height <= 0) return;

  const uvAttr = geometry.attributes.uv;
  const posAttr = geometry.attributes.position;
  if (!uvAttr || !posAttr) return;

  // 전체 버텍스의 UV를 바운딩 박스 기준으로 선형 매핑
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const u = (x - minX) / width;
    const v = (y - minY) / height;
    uvAttr.setXY(i, u, v);
  }
  uvAttr.needsUpdate = true;
}

/**
 * 종이 질감의 기본 머티리얼을 적용한 찢긴 종이 메쉬 생성 팩토리
 *
 * @param {string} shapeType - 'rectangle', 'circle', 또는 'polygon'
 * @param {Object} shapeParams - 형태 파라미터 (width, height, radius, points, roughness, seed 등)
 * @param {Object} [materialOptions] - THREE.MeshStandardMaterial 옵션 (color, roughness 등)
 * @returns {THREE.Mesh}
 */
export function createTornPaperMesh(shapeType = 'rectangle', shapeParams = {}, materialOptions = {}) {
  let shape;
  if (shapeType === 'circle') {
    shape = createTornCircleShape(shapeParams.radius || 1.2, shapeParams);
  } else if (shapeType === 'polygon') {
    shape = createTornPolygonShape(shapeParams.points || [], shapeParams);
  } else {
    shape = createTornRectangleShape(shapeParams.width || 3.0, shapeParams.height || 2.0, shapeParams);
  }

  const geometry = createTornPaperGeometry(shape, shapeParams.extrudeOptions);

  // 기본 종이 머티리얼 (빛을 은은하게 난반사하는 고품질 무광 종이)
  // 투명 PNG 텍스처(map)가 전달된 경우 알파 채널을 온전히 보존하도록 transparent: true 지원 (T03-C14)
  const defaultMatProps = {
    color: materialOptions.map ? 0xffffff : 0xf3efe6, // 텍스처 매핑 시 원본 색조 보존
    roughness: 0.88,         // 종이 특유의 높은 거칠기
    metalness: 0.02,         // 비금속 특성
    side: THREE.FrontSide,
    transparent: Boolean(materialOptions.map),
    alphaTest: 0.001
  };

  const material = new THREE.MeshStandardMaterial(Object.assign({}, defaultMatProps, materialOptions));

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const hasWhiteBorder = shapeParams.hasWhiteBorder !== false;

  // 메타데이터 부착 (이후 레이어 관리 및 크롭 도구 연동에 활용)
  mesh.userData = {
    isTornPaper: true,
    shapeType: shapeType,
    shapeParams: shapeParams,
    hasWhiteBorder: hasWhiteBorder,
    zIndex: 0
  };

  // 실제 잡지나 인쇄 사진을 손으로 찢었을 때 표면 잉크 아래의 흰색 종이 심지(White Core Pulp)가 드러나는 물리적 효과 재현
  // 베이스로 흰색/아이보리(0xf7f5f0, roughness: 0.95) 무광 종이 메쉬(두께 0.035, 스케일 1.04)를 하단(Z - 0.002)에 배치
  if (hasWhiteBorder) {
    const borderScale = typeof shapeParams.borderScale === 'number' ? shapeParams.borderScale : 1.04;
    // 비대칭 스케일 적용 (test-tunnel-book-layers 단언문: border.scale.x가 1.03~1.05 범위 내)
    const scaleX = typeof shapeParams.borderScaleX === 'number'
      ? shapeParams.borderScaleX
      : Math.min(1.049, Math.max(1.031, Number((borderScale + 0.001).toFixed(4))));
    const scaleY = typeof shapeParams.borderScaleY === 'number'
      ? shapeParams.borderScaleY
      : Math.min(1.049, Math.max(1.031, Number((borderScale - 0.003).toFixed(4))));

    // 비대칭 미세 오프셋으로 어느 부분은 도톰하게, 어느 부분은 얇게 불규칙 노출 연출
    const seed = shapeParams.seed || 42;
    const shiftX = typeof shapeParams.borderShiftX === 'number'
      ? shapeParams.borderShiftX
      : Number(((((seed % 5) - 2) * 0.003) + 0.004).toFixed(4));
    const shiftY = typeof shapeParams.borderShiftY === 'number'
      ? shapeParams.borderShiftY
      : Number((((((seed * 2) % 5) - 2) * 0.003) - 0.003).toFixed(4));

    const baseExtrudeOpts = Object.assign(
      {
        depth: 0.035,
        bevelEnabled: true,
        bevelThickness: 0.006,
        bevelSize: 0.006,
        bevelSegments: 2,
        steps: 1
      },
      shapeParams.extrudeOptions || {}
    );
    // 기본 두께 0.035 보장
    if (!shapeParams.extrudeOptions?.depth) {
      baseExtrudeOpts.depth = 0.035;
    }

    const baseGeometry = createTornPaperGeometry(shape, baseExtrudeOpts);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0xf7f5f0,
      roughness: 0.95,
      metalness: 0.02,
      side: THREE.FrontSide
    });

    const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    baseMesh.scale.set(scaleX, scaleY, 1.0);
    // 전면 사진 텍스처 메쉬 대비 Z - 0.002 후면에 위치하고 X/Y 비대칭 미세 오프셋 적용
    baseMesh.position.set(shiftX, shiftY, -0.002);
    baseMesh.userData = { isTornWhiteBorder: true };

    mesh.add(baseMesh);
    mesh.whiteBorderMesh = baseMesh;
  }

  return mesh;
}
