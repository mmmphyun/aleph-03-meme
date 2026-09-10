/**
 * @file scene-manager.js
 * @description Three.js 기반 축구장 3D 씬, 야간 경기장 조명, 카메라 및 OrbitControls 관리자
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
  /**
   * @param {HTMLCanvasElement} canvas - 렌더링 대상 WebGL 캔버스
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.animId = null;

    // 객체 캐시
    this.pitchGroup = null;
    this.lightsGroup = null;

    this.init();
  }

  /**
   * Three.js 핵심 씬, 렌더러, 카메라, 컨트롤러 초기화
   */
  init() {
    // 1. 씬 생성 (야간 경기장 밤하늘 배경색)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f1d);
    this.scene.fog = new THREE.FogExp2(0x0a0f1d, 0.025);

    // 2. 카메라 생성 (인체 마네킹 전신 조망 각도)
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight || 1;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.camera.position.set(0, 1.6, 4.2);

    // 3. WebGL 렌더러 (차후 PNG 다운로드 합성을 위해 preserveDrawingBuffer 활성화)
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // 4. OrbitControls 설정 (마우스 좌클릭 궤도 회전, 우클릭 패닝, 휠 줌)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enableRotate = true; // 좌클릭 360도 궤도 회전
    this.controls.enableZoom = true;   // 휠 줌 인/아웃
    this.controls.enablePan = true;    // 우클릭 패닝
    this.controls.screenSpacePanning = true; // 화면 좌표계 기준 부드러운 패닝
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };
    this.controls.target.set(0, 1.1, 0); // 캐릭터 명치/가슴 높이에 피벗 고정
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 12.0;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // 잔디 바닥 아래로 카메라 침범 차단

    // 우클릭 패닝 시 브라우저 기본 컨텍스트 메뉴 팝업 차단
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // 5. 환경 구축
    this.setupLights();
    this.setupPitch();

    // 6. 리사이즈 이벤트 바인딩
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);

    // 7. 렌더 루프 시작
    this.animate = this.animate.bind(this);
    this.animate();
  }

  /**
   * 야간 축구 경기장 스포트라이트 조명 구축
   * - 4방향 스타디움 라이트 타워 감성의 강렬한 스포트라이트
   * - 어두운 경기장 베이스를 밝히는 앰비언트 라이트
   */
  setupLights() {
    this.lightsGroup = new THREE.Group();

    // 은은한 푸른빛 스타디움 잔광 앰비언트
    const ambientLight = new THREE.AmbientLight(0x405577, 0.85);
    this.lightsGroup.add(ambientLight);

    // 전방 주 조명 (메인 스포트라이트)
    const mainKeyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    mainKeyLight.position.set(3, 8, 5);
    mainKeyLight.castShadow = true;
    mainKeyLight.shadow.mapSize.width = 1024;
    mainKeyLight.shadow.mapSize.height = 1024;
    mainKeyLight.shadow.bias = -0.001;
    mainKeyLight.shadow.camera.near = 0.5;
    mainKeyLight.shadow.camera.far = 25;
    mainKeyLight.shadow.camera.left = -4;
    mainKeyLight.shadow.camera.right = 4;
    mainKeyLight.shadow.camera.top = 4;
    mainKeyLight.shadow.camera.bottom = -4;
    this.lightsGroup.add(mainKeyLight);

    // 좌후방 림라이트 (경기장 타워 조명 실루엣 강조)
    const rimLightLeft = new THREE.DirectionalLight(0x7fb3ff, 1.0);
    rimLightLeft.position.set(-6, 7, -5);
    this.lightsGroup.add(rimLightLeft);

    // 우후방 림라이트
    const rimLightRight = new THREE.DirectionalLight(0x8ae0aa, 0.7);
    rimLightRight.position.set(6, 7, -5);
    this.lightsGroup.add(rimLightRight);

    // 캐릭터 정면 보조 필라이트
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(0, 2, 4);
    this.lightsGroup.add(fillLight);

    this.scene.add(this.lightsGroup);
  }

  /**
   * 축구장 바닥 (투톤 스트라이프 잔디 + 백색 라인 + 로우폴리 골대) 구축
   * - 외부 텍스처 파일 의존 없이 절차적 메쉬로 즉시 렌더링 보장
   */
  setupPitch() {
    this.pitchGroup = new THREE.Group();

    // 1. 투톤 스트라이프 잔디 (총 28m x 20m, 14개 스트라이프)
    const stripeCount = 14;
    const pitchWidth = 20;
    const stripeLength = 28;
    const stripeWidth = stripeLength / stripeCount;

    const grassColorA = new THREE.Color(0x2d8a4e);
    const grassColorB = new THREE.Color(0x247441);

    const stripeGeo = new THREE.PlaneGeometry(pitchWidth, stripeWidth);

    for (let i = 0; i < stripeCount; i++) {
      const isEven = i % 2 === 0;
      const mat = new THREE.MeshStandardMaterial({
        color: isEven ? grassColorA : grassColorB,
        roughness: 0.85,
        metalness: 0.05,
        flatShading: true
      });
      const stripeMesh = new THREE.Mesh(stripeGeo, mat);
      stripeMesh.rotation.x = -Math.PI / 2;
      // Z축을 따라 스트라이프 배치
      stripeMesh.position.set(0, 0, (i - (stripeCount - 1) / 2) * stripeWidth);
      stripeMesh.receiveShadow = true;
      this.pitchGroup.add(stripeMesh);
    }

    // 2. 축구장 백색 경기장 라인 (페널티 박스, 페널티 아크, 센터 서클)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lineY = 0.01; // 잔디 메쉬와의 Z-fighting 방지 미세 오프셋

    // 외곽 테두리 (터치라인 및 골라인)
    const touchlineWidth = 0.08;
    const createLine = (w, h, x, z) => {
      const geo = new THREE.PlaneGeometry(w, h);
      const mesh = new THREE.Mesh(geo, lineMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, lineY, z);
      this.pitchGroup.add(mesh);
      return mesh;
    };

    // 하프라인
    createLine(pitchWidth * 0.8, touchlineWidth, 0, 0);

    // 센터 서클 (반지름 2.5m)
    const circleGeo = new THREE.RingGeometry(2.45, 2.53, 32);
    const circleMesh = new THREE.Mesh(circleGeo, lineMat);
    circleMesh.rotation.x = -Math.PI / 2;
    circleMesh.position.set(0, lineY, 0);
    this.pitchGroup.add(circleMesh);

    // 센터 스팟
    const centerSpotGeo = new THREE.CircleGeometry(0.12, 16);
    const centerSpotMesh = new THREE.Mesh(centerSpotGeo, lineMat);
    centerSpotMesh.rotation.x = -Math.PI / 2;
    centerSpotMesh.position.set(0, lineY, 0);
    this.pitchGroup.add(centerSpotMesh);

    // 페널티 에어리어 라인 (후방 골대 앞)
    const penaltyBoxZ = -6.0;
    const penaltyBoxW = 10.0;
    const penaltyBoxD = 4.5;
    createLine(penaltyBoxW, touchlineWidth, 0, penaltyBoxZ); // 앞가로선
    createLine(touchlineWidth, penaltyBoxD, -penaltyBoxW / 2, penaltyBoxZ - penaltyBoxD / 2); // 좌세로선
    createLine(touchlineWidth, penaltyBoxD, penaltyBoxW / 2, penaltyBoxZ - penaltyBoxD / 2); // 우세로선

    // 3. 로우폴리 축구 골대 (골포스트 백색 파이프 + 와이어프레임 네트)
    this.setupGoalpost();

    this.scene.add(this.pitchGroup);
  }

  /**
   * 로우폴리 축구 골대 메쉬 생성 (캐릭터 후방 배경 오브젝트)
   */
  setupGoalpost() {
    const goalGroup = new THREE.Group();
    goalGroup.position.set(0, 0, -8.5); // 캐릭터 뒤쪽 약 8.5m 위치

    const postMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5f5,
      roughness: 0.3,
      metalness: 0.1,
      flatShading: true
    });

    const postRadius = 0.08;
    const postHeight = 2.44; // 국제 규격 비율 (2.44m)
    const postWidth = 7.32; // 국제 규격 비율 (7.32m)
    const goalDepth = 2.0;

    // 좌측 기둥
    const leftPostGeo = new THREE.CylinderGeometry(postRadius, postRadius, postHeight, 8);
    const leftPost = new THREE.Mesh(leftPostGeo, postMat);
    leftPost.position.set(-postWidth / 2, postHeight / 2, 0);
    leftPost.castShadow = true;
    goalGroup.add(leftPost);

    // 우측 기둥
    const rightPost = leftPost.clone();
    rightPost.position.set(postWidth / 2, postHeight / 2, 0);
    rightPost.castShadow = true;
    goalGroup.add(rightPost);

    // 크로스바 (상단 가로 기둥)
    const crossbarGeo = new THREE.CylinderGeometry(postRadius, postRadius, postWidth + postRadius * 2, 8);
    const crossbar = new THREE.Mesh(crossbarGeo, postMat);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, postHeight, 0);
    crossbar.castShadow = true;
    goalGroup.add(crossbar);

    // 후방 지지 파이프 (좌/우)
    const backBarGeo = new THREE.CylinderGeometry(postRadius * 0.7, postRadius * 0.7, goalDepth, 8);
    const leftBackBar = new THREE.Mesh(backBarGeo, postMat);
    leftBackBar.rotation.x = Math.PI / 2;
    leftBackBar.position.set(-postWidth / 2, postRadius, -goalDepth / 2);
    goalGroup.add(leftBackBar);

    const rightBackBar = leftBackBar.clone();
    rightBackBar.position.set(postWidth / 2, postRadius, -goalDepth / 2);
    goalGroup.add(rightBackBar);

    // 상단 후방 사선 지지대
    const diagonalLen = Math.sqrt(postHeight * postHeight + goalDepth * goalDepth);
    const diagonalGeo = new THREE.CylinderGeometry(postRadius * 0.6, postRadius * 0.6, diagonalLen, 8);
    const leftDiag = new THREE.Mesh(diagonalGeo, postMat);
    leftDiag.position.set(-postWidth / 2, postHeight / 2, -goalDepth / 2);
    leftDiag.rotation.x = Math.atan2(goalDepth, postHeight);
    goalGroup.add(leftDiag);

    const rightDiag = leftDiag.clone();
    rightDiag.position.set(postWidth / 2, postHeight / 2, -goalDepth / 2);
    goalGroup.add(rightDiag);

    // 로우폴리 반투명 그물망 (Net)
    const netMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.28
    });
    // 그물 상/후/좌/우 박스 메쉬
    const netBoxGeo = new THREE.BoxGeometry(postWidth, postHeight, goalDepth, 12, 6, 4);
    const netBox = new THREE.Mesh(netBoxGeo, netMat);
    netBox.position.set(0, postHeight / 2, -goalDepth / 2);
    goalGroup.add(netBox);

    this.pitchGroup.add(goalGroup);
  }

  /**
   * 뷰포트 크기 변경 시 카메라 및 렌더러 동기화
   * @param {number} [customWidth] - 수동 지정 가로 폭
   * @param {number} [customHeight] - 수동 지정 세로 높이
   */
  resize(customWidth, customHeight) {
    if (!this.canvas || !this.renderer || !this.camera) return;
    const width = customWidth || this.canvas.clientWidth;
    const height = customHeight || this.canvas.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  /**
   * 윈도우 리사이즈 이벤트 핸들러
   */
  onResize() {
    this.resize();
  }

  /**
   * 고해상도 캔버스에 현재 3D 뷰포트 프레임을 왜곡 없이 동일 구도로 렌더링
   * @param {HTMLCanvasElement} targetCanvas - 복사 대상 2D 캔버스
   * @param {number} targetW - 목표 가로 해상도 (예: 1080)
   * @param {number} targetH - 목표 세로 해상도 (예: 1080, 1350, 1920)
   */
  renderFrameToCanvas(targetCanvas, targetW, targetH) {
    if (!this.renderer || !this.scene || !this.camera) return;

    // 현재 화면 크기 백업
    const prevW = this.canvas.clientWidth;
    const prevH = this.canvas.clientHeight;

    // 렌더러 크기를 내보내기 해상도로 임시 확장 후 즉시 1프레임 렌더
    this.renderer.setSize(targetW, targetH, false);
    this.renderer.render(this.scene, this.camera);

    // 대상 2D 컨텍스트에 픽셀 전송
    const ctx = targetCanvas.getContext('2d');
    ctx.drawImage(this.canvas, 0, 0, targetW, targetH);

    // 렌더러 크기를 원래 브라우저 뷰포트 크기로 원복
    this.renderer.setSize(prevW, prevH, false);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 카메라 뷰 프리셋 전환 (정면, 측면, 상단, 로우앵글, 얼빡샷)
   * @param {'front'|'side'|'top'|'low'|'closeup'} viewMode
   */
  setCameraView(viewMode) {
    if (!this.camera || !this.controls) return;
    switch (viewMode) {
      case 'side':
        // 측면 프로필 뷰 (우측 90도 각도)
        this.camera.position.set(3.8, 1.4, 0.2);
        this.controls.target.set(0, 1.1, 0);
        break;
      case 'top':
        // 상단 하이앵글 뷰
        this.camera.position.set(0, 4.2, 2.5);
        this.controls.target.set(0, 1.0, 0);
        break;
      case 'low':
        // 역동적 로우앵글 뷰 (웅장한 올려다보기)
        this.camera.position.set(0, 0.45, 2.8);
        this.controls.target.set(0, 1.2, 0);
        break;
      case 'closeup':
        // 대두 얼빡샷 뷰 (얼굴 밀착)
        this.camera.position.set(0, 1.55, 1.6);
        this.controls.target.set(0, 1.55, 0);
        break;
      case 'front':
      default:
        // 정면 전신 뷰 (기본 리셋 좌표)
        this.camera.position.set(0, 1.6, 4.2);
        this.controls.target.set(0, 1.1, 0);
        break;
    }
    this.controls.update();
  }

  /**
   * 카메라 뷰 리셋 (초기 정면 좌표로 복구)
   */
  resetCamera() {
    this.setCameraView('front');
  }

  /**
   * 현재 3D 카메라 위치 및 시선 타깃 좌표 반환
   * @returns {{position: {x: number, y: number, z: number}, target: {x: number, y: number, z: number}}}
   */
  getCameraState() {
    return {
      position: {
        x: Number(this.camera.position.x.toFixed(4)),
        y: Number(this.camera.position.y.toFixed(4)),
        z: Number(this.camera.position.z.toFixed(4))
      },
      target: {
        x: Number(this.controls.target.x.toFixed(4)),
        y: Number(this.controls.target.y.toFixed(4)),
        z: Number(this.controls.target.z.toFixed(4))
      }
    };
  }

  /**
   * 3D 카메라 위치 및 시선 타깃 복원
   * @param {{position?: {x: number, y: number, z: number}, target?: {x: number, y: number, z: number}}} state
   */
  setCameraState(state) {
    if (!state || !this.camera || !this.controls) return;
    if (state.position) {
      this.camera.position.set(state.position.x, state.position.y, state.position.z);
    }
    if (state.target) {
      this.controls.target.set(state.target.x, state.target.y, state.target.z);
    }
    this.controls.update();
  }

  /**
   * 렌더 루프 프레임 업데이트
   */
  animate() {
    this.animId = requestAnimationFrame(this.animate);
    if (this.controls) {
      this.controls.update();
    }
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * 메모리 및 리소스 해제
   */
  dispose() {
    if (this.animId) cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.onResize);
    if (this.controls) this.controls.dispose();
    if (this.renderer) this.renderer.dispose();
  }
}
