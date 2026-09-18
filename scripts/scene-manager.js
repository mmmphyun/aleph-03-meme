/**
 * @file scene-manager.js
 * @description Three.js 씬, 카메라, 그림자 조명, 백그라운드 매트 보드, OrbitControls 및 뷰 전환 매니저
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
  /**
   * @param {HTMLElement} container - WebGL 캔버스가 부착될 DOM 컨테이너
   * @param {Object} [options]
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = Object.assign({
      boardWidth: 12,
      boardHeight: 12,
      boardColor: 0x181715,      // 스튜디오 웜 차콜 매트 보드
      ambientIntensity: 0.9,
      dirLightIntensity: 1.9,
      autoAnimateCamera: true
    }, options);

    this.layers = [];             // 씬 내에 적재된 종이 조각 메쉬 목록
    this.animatingCamera = false;
    this.cameraAnim = null;

    this._initScene();
    this._initLights();
    this._initMatteBoard();
    this._initControls();
    this._initResizeHandler();

    // 렌더 루프 가동
    this._animate = this._animate.bind(this);
    this.rafId = requestAnimationFrame(this._animate);
  }

  /**
   * 씬, 카메라, WebGL 렌더러 초기화
   * @private
   */
  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x141312);

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // 시야각 45도 원근 투영 카메라
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.defaultCameraPos = new THREE.Vector3(0, 0, 8.2);
    this.defaultTarget = new THREE.Vector3(0, 0, 0);
    this.camera.position.copy(this.defaultCameraPos);
    this.camera.lookAt(this.defaultTarget);

    // 고해상도 안티앨리어싱 및 섀도 맵 렌더러
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true, // Milestone 3 고해상도 PNG 캡처를 위한 버퍼 보존
      alpha: false,
      powerPreference: 'high-performance'
    });

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // PCFSoftShadowMap 기반 부드러운 다단 그림자 연산 활성화
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // sRGB 색공간 및 톤 매핑
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.container.appendChild(this.renderer.domElement);
  }

  /**
   * 섀도 박스 조명 구성 (키 라이트 + 은은한 환경광 + 림 필라이트)
   * @private
   */
  _initLights() {
    // 1. 암부 디테일을 살리는 은은한 앰비언트 라이트
    this.ambientLight = new THREE.AmbientLight(0xffffff, this.options.ambientIntensity);
    this.scene.add(this.ambientLight);

    // 2. 비스듬한 상단에서 종이 찢김 단면에 극적 그림자를 드리우는 메인 디렉셔널 라이트
    this.dirLight = new THREE.DirectionalLight(0xfff6ea, this.options.dirLightIntensity);
    this.dirLight.position.set(4.5, 7.5, 9.0);
    this.dirLight.castShadow = true;

    // 고해상도 그림자 맵 설정 (2048x2048)
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 28.0;

    // 그림자 투영 범위 최적화 (뷰포트 종이 영역 집중)
    const d = 5.5;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;

    // 섀도 아티팩트 및 여드름(Shadow Acne) 방지 바이어스
    this.dirLight.shadow.bias = -0.0003;
    this.dirLight.shadow.normalBias = 0.02;

    this.scene.add(this.dirLight);

    // 3. 반대편에서 은은하게 그림자 영역을 밝혀주는 보조 필라이트
    this.fillLight = new THREE.DirectionalLight(0xb0c4de, 0.4);
    this.fillLight.position.set(-5.0, -4.0, 5.0);
    this.fillLight.castShadow = false;
    this.scene.add(this.fillLight);
  }

  /**
   * 하위 종이 조각들의 그림자를 받아내는 백그라운드 매트 보드
   * @private
   */
  _initMatteBoard() {
    const boardGeo = new THREE.PlaneGeometry(this.options.boardWidth, this.options.boardHeight);
    const boardMat = new THREE.MeshStandardMaterial({
      color: this.options.boardColor,
      roughness: 0.92,
      metalness: 0.03,
      side: THREE.FrontSide
    });

    this.boardMesh = new THREE.Mesh(boardGeo, boardMat);
    // 액자 내부의 어두운 매트 보드(Z = -0.15)를 배치하여 구멍 뚫린 곳을 통해 안쪽 깊은 공간이 들여다보이도록 설정
    this.boardMesh.position.set(0, 0, -0.15);
    this.boardMesh.receiveShadow = true;
    this.boardMesh.userData = { isBoard: true, isBackdrop: true };

    // backdropMesh alias 제공 (터널북/팝업북 배경판 인터페이스 호환)
    this.backdropMesh = this.boardMesh;

    this.scene.add(this.boardMesh);
  }

  /**
   * 배경 매트 보드에 사용자 이미지를 전체 배경 텍스처로 입히고 종횡비에 맞게 크기 자동 조정
   * 조명 및 그림자 캐시를 갱신하여 팝업 조각과의 그림자 대비를 유지합니다.
   *
   * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap|THREE.Texture} imageElement - 업로드된 이미지 객체 또는 텍스처
   * @param {Object} [options] - 옵션 파라미터
   * @param {number} [options.baseWidth=6.0] - 기본 가로 크기 (기본값: 6.0)
   * @param {number} [options.zPosition=-0.05] - 배경판 Z 위치 (기본값: -0.05)
   * @param {number} [options.roughness=0.88] - 배경 표면 거칠기
   * @param {number} [options.metalness=0.02] - 금속성
   * @returns {THREE.Mesh} backdropMesh 인스턴스
   */
  setBackdropImage(imageElement, options = {}) {
    if (!imageElement) {
      console.warn('[SceneManager] setBackdropImage: 유효한 imageElement가 전달되지 않았습니다.');
      return this.backdropMesh || this.boardMesh;
    }

    const {
      baseWidth = 6.0,
      zPosition = -0.05,
      roughness = 0.88,
      metalness = 0.02
    } = options;

    // 이미지 원본 크기 및 종횡비(세로/가로) 계산
    let imgWidth = 1;
    let imgHeight = 1;

    if (imageElement instanceof THREE.Texture && imageElement.image) {
      const src = imageElement.image;
      imgWidth = src.naturalWidth || src.videoWidth || src.width || 1;
      imgHeight = src.naturalHeight || src.videoHeight || src.height || 1;
    } else {
      imgWidth = imageElement.naturalWidth || imageElement.videoWidth || imageElement.width || 1;
      imgHeight = imageElement.naturalHeight || imageElement.videoHeight || imageElement.height || 1;
    }

    const aspectRatio = imgHeight / imgWidth;
    const targetWidth = baseWidth;
    const targetHeight = baseWidth * aspectRatio;

    const targetMesh = this.backdropMesh || this.boardMesh;

    // 1. 기존 지오메트리 해제 및 새 종횡비 PlaneGeometry 교체
    if (targetMesh.geometry) {
      targetMesh.geometry.dispose();
    }
    targetMesh.geometry = new THREE.PlaneGeometry(targetWidth, targetHeight);
    targetMesh.position.set(0, 0, zPosition);
    targetMesh.receiveShadow = true;

    // 2. 텍스처 생성 및 색공간 / 필터링 설정
    let texture;
    if (imageElement instanceof THREE.Texture) {
      texture = imageElement;
    } else if (typeof HTMLCanvasElement !== 'undefined' && imageElement instanceof HTMLCanvasElement) {
      texture = new THREE.CanvasTexture(imageElement);
    } else {
      texture = new THREE.Texture(imageElement);
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    // 3. 기존 텍스처 해제 및 머티리얼 텍스처 매핑 갱신
    if (targetMesh.material.map && targetMesh.material.map !== texture) {
      targetMesh.material.map.dispose();
    }
    targetMesh.material.map = texture;
    targetMesh.material.color.set(0xffffff); // 원본 이미지 색감 보존
    targetMesh.material.roughness = roughness;
    targetMesh.material.metalness = metalness;
    targetMesh.material.transparent = true;
    targetMesh.material.alphaTest = 0.05;
    targetMesh.material.needsUpdate = true;

    // 4. 그림자 투영 범위 및 바이어스/강도 유지 보장
    if (this.dirLight && this.dirLight.shadow) {
      const halfDim = Math.max(targetWidth, targetHeight) * 0.75;
      const d = Math.max(5.5, halfDim);
      this.dirLight.shadow.camera.left = -d;
      this.dirLight.shadow.camera.right = d;
      this.dirLight.shadow.camera.top = d;
      this.dirLight.shadow.camera.bottom = -d;

      // 팝업 조각과 배경판 사이의 선명한 그림자를 위한 shadow bias 및 intensity 유지
      this.dirLight.shadow.bias = -0.0003;
      this.dirLight.shadow.normalBias = 0.02;
      this.dirLight.intensity = this.options.dirLightIntensity;
      this.dirLight.shadow.camera.updateProjectionMatrix();
    }

    this.backdropMesh = targetMesh;
    this.boardMesh = targetMesh;

    return targetMesh;
  }

  /**
   * 마우스 좌클릭 360도 궤도 회전, 우클릭 패닝, 휠 줌 OrbitControls
   * @private
   */
  _initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.screenSpacePanning = true;

    // 조작 반경 및 각도 제한
    this.controls.minDistance = 2.0;
    this.controls.maxDistance = 20.0;
    this.controls.maxPolarAngle = Math.PI * 0.58; // 매트 보드 뒷면 관통 방지

    // 마우스 버튼 매핑 (좌클릭: 회전, 우클릭: 패닝, 휠: 줌)
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };
  }

  /**
   * 반응형 리사이즈 감지 핸들러
   * @private
   */
  _initResizeHandler() {
    this._onResize = () => {
      if (!this.container) return;
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      if (width === 0 || height === 0) return;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    };

    window.addEventListener('resize', this._onResize);
  }

  /**
   * 렌더 루프 (requestAnimationFrame)
   * @private
   */
  _animate() {
    this.rafId = requestAnimationFrame(this._animate);

    // 카메라 퀵앵글 보간 이동 처리
    if (this.animatingCamera && this.cameraAnim) {
      const now = performance.now();
      const progress = Math.min(1.0, (now - this.cameraAnim.startTime) / this.cameraAnim.duration);
      // Smoothstep 이징
      const t = progress * progress * (3 - 2 * progress);

      this.camera.position.lerpVectors(this.cameraAnim.startPos, this.cameraAnim.endPos, t);
      this.controls.target.lerpVectors(this.cameraAnim.startTarget, this.cameraAnim.endTarget, t);

      if (progress >= 1.0) {
        this.animatingCamera = false;
        this.cameraAnim = null;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    if (this.onFrameCallback) {
      this.onFrameCallback(this);
    }
  }

  /**
   * 3D 카메라 앵글 퀵 전환 (정면, 대각선, 측면, 리셋)
   * 부드러운 시점 보간 애니메이션을 적용합니다.
   *
   * @param {'front'|'diagonal'|'side'|'reset'} viewType
   * @param {number} [durationMs=600]
   */
  setCameraView(viewType, durationMs = 600) {
    const targetPos = new THREE.Vector3();
    const targetCenter = new THREE.Vector3(0, 0, 0);

    switch (viewType) {
      case 'front':
        targetPos.set(0, 0, 8.2);
        break;
      case 'diagonal':
        // 입체적인 종이 두께와 다층 그림자가 가장 아름답게 보이는 대각선 앵글
        targetPos.set(4.2, -3.8, 6.0);
        break;
      case 'side':
        // 찢긴 단면과 Z-Stack 높이 단차가 극적으로 부각되는 측면 프로필 앵글
        targetPos.set(7.5, -0.3, 2.6);
        break;
      case 'reset':
      default:
        targetPos.copy(this.defaultCameraPos);
        break;
    }

    this.animatingCamera = true;
    this.cameraAnim = {
      startTime: performance.now(),
      duration: durationMs,
      startPos: this.camera.position.clone(),
      endPos: targetPos,
      startTarget: this.controls.target.clone(),
      endTarget: targetCenter
    };
  }

  /**
   * 종이 조각 메쉬를 씬에 추가
   * @param {THREE.Mesh} mesh
   * @param {number} [zHeight] - Z축 적재 높이
   */
  addPaperMesh(mesh, zHeight = null) {
    if (zHeight !== null) {
      mesh.position.z = zHeight;
      if (mesh.userData) {
        mesh.userData.zIndex = zHeight;
      }
    }
    this.layers.push(mesh);
    this.scene.add(mesh);
    return mesh;
  }

  /**
   * 종이 조각 메쉬 제거
   * @param {THREE.Mesh} mesh
   */
  removePaperMesh(mesh) {
    const idx = this.layers.indexOf(mesh);
    if (idx !== -1) {
      this.layers.splice(idx, 1);
    }
    this.scene.remove(mesh);
    mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }

  /**
   * 모든 종이 레이어 일괄 정리 (보드 및 조명 유지)
   */
  clearPaperLayers() {
    const toRemove = [...this.layers];
    toRemove.forEach(mesh => this.removePaperMesh(mesh));
    this.layers = [];
  }

  /**
   * 현재 카메라의 좌표 및 타깃 반환
   * @returns {{position: {x: number, y: number, z: number}, target: {x: number, y: number, z: number}, distance: number}}
   */
  getCameraInfo() {
    return {
      position: {
        x: Number(this.camera.position.x.toFixed(2)),
        y: Number(this.camera.position.y.toFixed(2)),
        z: Number(this.camera.position.z.toFixed(2))
      },
      target: {
        x: Number(this.controls.target.x.toFixed(2)),
        y: Number(this.controls.target.y.toFixed(2)),
        z: Number(this.controls.target.z.toFixed(2))
      },
      distance: Number(this.camera.position.distanceTo(this.controls.target).toFixed(2))
    };
  }

  /**
   * 자원 해제
   */
  dispose() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this._onResize);
    this.clearPaperLayers();
    const bMesh = this.backdropMesh || this.boardMesh;
    if (bMesh) {
      if (bMesh.geometry) bMesh.geometry.dispose();
      if (bMesh.material) {
        if (bMesh.material.map) bMesh.material.map.dispose();
        bMesh.material.dispose();
      }
      this.scene.remove(bMesh);
    }
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
