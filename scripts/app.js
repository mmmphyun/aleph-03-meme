/**
 * @file app.js
 * @description 3D 페이퍼 스컬프처 & 섀도 스튜디오 메인 오케스트레이터 (Milestone 4)
 */

import * as THREE from 'three';
import { SceneManager } from './scene-manager.js';
import {
  createTornPaperMesh,
  createTornRectangleShape,
  createTornCircleShape,
  createTornPaperGeometry
} from './torn-geometry.js';
import { CropTool } from './crop-tool.js';
import { MemoLabelEngine } from './memo-label.js';
import { Exporter } from './exporter.js';
import { TemplateStore } from './template-store.js';
import { JSONValidator } from './json-validator.js';

class PaperStudioApp {
  constructor() {
    this.container = document.getElementById('viewport-canvas-container');
    if (!this.container) {
      throw new Error('#viewport-canvas-container 요소를 찾을 수 없습니다.');
    }

    this.sceneManager = null;
    this.cropTool = null;
    this.memoEngine = null;
    this.exporter = null;
    this.templateStore = null;     // Milestone 4 템플릿 영속성 매니저
    this.currentAspectRatio = '1:1'; // '1:1' | '4:5' | '9:16'
    this.layers = [];              // 적재된 찢긴 종이 메쉬 목록
    this.selectedLayer = null;     // 현재 선택된 종이 메쉬
    this.currentSeed = 42;
    this.roughness = 0.075;

    this.init();
  }

  /**
   * 앱 초기화 및 서브시스템 가동
   */
  init() {
    // 1. 3D 씬 매니저 초기화
    this.sceneManager = new SceneManager(this.container, {
      boardWidth: 14,
      boardHeight: 14,
      boardColor: 0x181a1f
    });

    // 2. 크롭 도구 모달 초기화
    this.cropTool = new CropTool({
      onAddPiece: (cropData) => this.handleAddCroppedPiece(cropData)
    });

    // 3. 찢겨진 메모지 텍스트 라벨 엔진 초기화 (초기 비표시 백지 상태 유지)
    this.memoEngine = new MemoLabelEngine({
      sceneManager: this.sceneManager,
      autoAddToScene: false,
      onUpdate: () => this.syncMemoUIFromEngine()
    });

    // 4. 고해상도 PNG 내보내기 캡처 엔진 초기화 (Milestone 3)
    const viewfinderFrame = document.getElementById('viewfinder-frame');
    this.exporter = new Exporter({
      sceneManager: this.sceneManager,
      viewfinderElement: viewfinderFrame
    });

    // 5. 템플릿 스토어 가동 (Milestone 4: T03-C17 ~ C21)
    this.templateStore = new TemplateStore();

    // 6. 초기 기본 다층 샘플 레이어 배치
    this.setupInitialSampleLayers();

    // 7. UI 및 인터랙션 이벤트 바인딩
    this.bindEvents();
    this.bindMemoLabelControls();
    this.bindAspectRatioControls();
    this.bindExportControls();
    this.bindTemplateControls();
    this.bindJsonIOControls();

    // 8. 템플릿 목록 UI 초기 렌더링
    this.updateTemplateListUI();

    // 9. 3D 뷰포트 클릭 레이캐스팅(조각 직접 클릭 선택) 바인딩
    this.bindViewportRaycasting();

    // 10. 실시간 카메라 정보 HUD 루프 연동
    this.sceneManager.onFrameCallback = () => this.updateCameraHUD();

    console.log('[PaperStudioApp] Milestone 4 템플릿 CRUD, localStorage 영속화 및 JSON 3단계 검증 초기화 완료.');
  }

  /**
   * 초기 접속 시 완전한 백지 상태 보장
   * - 기본 사각/원형 조각 2개 생성 제거
   * - 초기 기동 시 씬 및 레이어 목록 0개 유지
   */
  setupInitialSampleLayers() {
    this.sceneManager.clearPaperLayers();
    this.layers = [];
    this.selectedLayer = null;

    if (this.memoEngine) {
      this.memoEngine.hide();
    }

    this.selectLayer(null);
    this.updateLayerListUI();
  }

  /**
   * UI 이벤트 리스너 바인딩
   */
  bindEvents() {
    // 1. 퀵 앵글 버튼 (정면, 대각선, 측면, 리셋)
    const angleButtons = document.querySelectorAll('[data-camera-view]');
    angleButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.currentTarget.getAttribute('data-camera-view');
        this.sceneManager.setCameraView(view);

        angleButtons.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
      });
    });

    // 2. 파일 업로드 인풋 및 트리거 버튼 (T03-C04, C05, C09, C10)
    const fileInput = document.getElementById('input-image-upload');
    const uploadBtn = document.getElementById('btn-upload-trigger');

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => {
        fileInput.value = ''; // 동일 파일 재선택 허용
        fileInput.click();
      });

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          this.handleImageFileUpload(file);
        }
      });
    }

    // 3. 내장 샘플 아트워크로 찢기 버튼
    const sampleBtn = document.getElementById('btn-sample-trigger');
    if (sampleBtn) {
      sampleBtn.addEventListener('click', () => {
        this.loadSampleArtworkAndOpenCrop();
      });
    }

    // 4. 선택된 조각 변형 슬라이더 이벤트
    this._bindTransformControls();

    // 5. 조각 삭제 버튼
    const deleteBtn = document.getElementById('btn-delete-piece');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (!this.selectedLayer) return;
        this.removeLayer(this.selectedLayer);
      });
    }

    // 6. 전역 거칠기 조절 슬라이더
    const roughnessSlider = document.getElementById('slider-roughness');
    if (roughnessSlider) {
      roughnessSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        const valLabel = document.getElementById('val-roughness');
        if (valLabel) valLabel.textContent = val.toFixed(3);
        this.roughness = val;
      });
    }

    // 7. 샘플 레이어 무작위 찢김 재생성 버튼
    const regenBtn = document.getElementById('btn-regen-torn');
    if (regenBtn) {
      regenBtn.addEventListener('click', () => {
        this.currentSeed = Math.floor(Math.random() * 100000);
        this.setupInitialSampleLayers();
        this.showToast('샘플 레이어가 무작위 외곽선으로 재생성되었습니다.', 'info');
      });
    }

    // 8. 조명 강도 조절 슬라이더
    const lightSlider = document.getElementById('slider-light');
    if (lightSlider) {
      lightSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        const valLabel = document.getElementById('val-light');
        if (valLabel) valLabel.textContent = val.toFixed(1);
        this.sceneManager.dirLight.intensity = val;
      });
    }

    // 9. 자동 회전 토글 버튼
    const autoRotateBtn = document.getElementById('btn-auto-rotate');
    if (autoRotateBtn) {
      autoRotateBtn.addEventListener('click', () => {
        this.sceneManager.controls.autoRotate = !this.sceneManager.controls.autoRotate;
        this.sceneManager.controls.autoRotateSpeed = 2.0;
        autoRotateBtn.classList.toggle('active', this.sceneManager.controls.autoRotate);
      });
    }
  }

  /**
   * 화면비 설정 및 뷰파인더/카메라 종횡비 동기화 (1:1, 4:5, 9:16)
   * @param {'1:1'|'4:5'|'9:16'} ratio
   * @param {boolean} [showToastNotify=false]
   */
  setAspectRatio(ratio, showToastNotify = false) {
    const specs = {
      '1:1': { cls: 'ratio-1-1', tag: '1:1 (1080 × 1080)', exportText: '뷰파인더 1:1 PNG 다운로드' },
      '4:5': { cls: 'ratio-4-5', tag: '4:5 (1080 × 1350)', exportText: '뷰파인더 4:5 PNG 다운로드' },
      '9:16': { cls: 'ratio-9-16', tag: '9:16 (1080 × 1920)', exportText: '뷰파인더 9:16 PNG 다운로드' }
    };
    if (!specs[ratio]) return;

    this.currentAspectRatio = ratio;

    const aspectButtons = document.querySelectorAll('[data-aspect-ratio]');
    aspectButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-aspect-ratio') === ratio);
    });

    const overlay = document.getElementById('viewfinder-overlay');
    const tag = document.getElementById('viewfinder-tag');
    const exportLabel = document.getElementById('export-btn-label');

    if (overlay) {
      overlay.className = `viewfinder-overlay ${specs[ratio].cls}`;
    }
    if (tag) {
      tag.textContent = specs[ratio].tag;
    }
    if (exportLabel) {
      exportLabel.textContent = specs[ratio].exportText;
    }

    if (this.sceneManager && this.sceneManager.camera) {
      this.sceneManager.camera.updateProjectionMatrix();
    }

    if (showToastNotify) {
      this.showToast(`화면비 전환: ${specs[ratio].tag}`, 'info');
    }
  }

  /**
   * 화면비 전환 버튼 연동 (1:1, 4:5, 9:16) (T03-C11 ~ C13)
   */
  bindAspectRatioControls() {
    const aspectButtons = document.querySelectorAll('[data-aspect-ratio]');
    aspectButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const ratio = e.currentTarget.getAttribute('data-aspect-ratio');
        this.setAspectRatio(ratio, true);
      });
    });
  }

  /**
   * 찢겨진 메모지 텍스트 라벨 컨트롤러 바인딩 (T03-C03, C06, C07, C08, C14)
   */
  bindMemoLabelControls() {
    // 0. 문구 생성/리셋 버튼 (T03-C03): 클릭 시에만 메모지 씬 배치 및 독립 레이어 등록
    const addMemoBtn = document.getElementById('btn-add-memo');
    if (addMemoBtn) {
      addMemoBtn.addEventListener('click', () => {
        if (this.memoEngine) {
          this.memoEngine.show();
          this.memoEngine.renderCanvas();
          this.memoEngine.setPosition(0.0, -0.6);
          this.memoEngine.setScale(1.0);

          // 독립 레이어로 layers 목록에 등록
          if (this.memoEngine.mesh && !this.layers.includes(this.memoEngine.mesh)) {
            this.layers.push(this.memoEngine.mesh);
          }

          this.syncMemoUIFromEngine();
          this.selectLayer(this.memoEngine.mesh);
          this.updateLayerListUI();
          this.showToast('📝 텍스트 메모지가 씬에 배치되었습니다.', 'success');
        }
      });
    }

    // 1. 문구 내용 입력 (T03-C03, C14)
    const textInput = document.getElementById('input-memo-text');
    if (textInput) {
      textInput.addEventListener('input', (e) => {
        this.memoEngine.setText(e.target.value);
      });
    }

    // 2. 폰트 크기 슬라이더 (T03-C07)
    const fontSlider = document.getElementById('slider-font-size');
    const fontVal = document.getElementById('val-font-size');
    if (fontSlider) {
      fontSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (fontVal) fontVal.textContent = `${val}px`;
        this.memoEngine.setFontSize(val);
      });
    }

    // 3. 폰트 색상 피커 (T03-C08)
    const fontColorPicker = document.getElementById('picker-font-color');
    const fontColorVal = document.getElementById('val-font-color');
    if (fontColorPicker) {
      fontColorPicker.addEventListener('input', (e) => {
        const color = e.target.value;
        if (fontColorVal) fontColorVal.textContent = color;
        this.memoEngine.setFontColor(color);
      });
    }

    // 4. 메모지 배경 색상 피커
    const paperColorPicker = document.getElementById('picker-paper-color');
    const paperColorVal = document.getElementById('val-paper-color');
    if (paperColorPicker) {
      paperColorPicker.addEventListener('input', (e) => {
        const color = e.target.value;
        if (paperColorVal) paperColorVal.textContent = color;
        this.memoEngine.state.paperColor = color;
        this.memoEngine.renderCanvas();
      });
    }

    // 5. 메모지 X, Y 위치 슬라이더 (T03-C06)
    const memoXSlider = document.getElementById('slider-memo-x');
    const memoXVal = document.getElementById('val-memo-x');
    const memoYSlider = document.getElementById('slider-memo-y');
    const memoYVal = document.getElementById('val-memo-y');

    if (memoXSlider) {
      memoXSlider.addEventListener('input', (e) => {
        const x = parseFloat(e.target.value);
        if (memoXVal) memoXVal.textContent = x.toFixed(2);
        this.memoEngine.setPosition(x, this.memoEngine.state.posY);
        if (this.selectedLayer && (this.selectedLayer === this.memoEngine.mesh || this.selectedLayer.userData?.isMemoLabel)) {
          this.syncTransformUI();
        }
      });
    }

    if (memoYSlider) {
      memoYSlider.addEventListener('input', (e) => {
        const y = parseFloat(e.target.value);
        if (memoYVal) memoYVal.textContent = y.toFixed(2);
        this.memoEngine.setPosition(this.memoEngine.state.posX, y);
        if (this.selectedLayer && (this.selectedLayer === this.memoEngine.mesh || this.selectedLayer.userData?.isMemoLabel)) {
          this.syncTransformUI();
        }
      });
    }

    // 6. 메모지 스케일 슬라이더 (T03-C06)
    const memoScaleSlider = document.getElementById('slider-memo-scale');
    const memoScaleVal = document.getElementById('val-memo-scale');
    if (memoScaleSlider) {
      memoScaleSlider.addEventListener('input', (e) => {
        const scale = parseFloat(e.target.value);
        if (memoScaleVal) memoScaleVal.textContent = `${scale.toFixed(2)}×`;
        this.memoEngine.setScale(scale);
        if (this.selectedLayer && (this.selectedLayer === this.memoEngine.mesh || this.selectedLayer.userData?.isMemoLabel)) {
          this.syncTransformUI();
        }
      });
    }
  }

  /**
   * 메모지 엔진 상태를 UI 인풋에 역동기화
   */
  syncMemoUIFromEngine() {
    if (!this.memoEngine) return;
    const s = this.memoEngine.state;

    const textInput = document.getElementById('input-memo-text');
    const fontSlider = document.getElementById('slider-font-size');
    const fontVal = document.getElementById('val-font-size');
    const fontColorPicker = document.getElementById('picker-font-color');
    const fontColorVal = document.getElementById('val-font-color');
    const paperColorPicker = document.getElementById('picker-paper-color');
    const paperColorVal = document.getElementById('val-paper-color');
    const memoXSlider = document.getElementById('slider-memo-x');
    const memoXVal = document.getElementById('val-memo-x');
    const memoYSlider = document.getElementById('slider-memo-y');
    const memoYVal = document.getElementById('val-memo-y');
    const memoScaleSlider = document.getElementById('slider-memo-scale');
    const memoScaleVal = document.getElementById('val-memo-scale');

    if (textInput && textInput.value !== s.text) textInput.value = s.text;
    if (fontSlider) fontSlider.value = s.fontSize;
    if (fontVal) fontVal.textContent = `${s.fontSize}px`;
    if (fontColorPicker) fontColorPicker.value = s.fontColor;
    if (fontColorVal) fontColorVal.textContent = s.fontColor;
    if (paperColorPicker) paperColorPicker.value = s.paperColor;
    if (paperColorVal) paperColorVal.textContent = s.paperColor;
    if (memoXSlider) memoXSlider.value = s.posX;
    if (memoXVal) memoXVal.textContent = s.posX.toFixed(2);
    if (memoYSlider) memoYSlider.value = s.posY;
    if (memoYVal) memoYVal.textContent = s.posY.toFixed(2);
    if (memoScaleSlider) memoScaleSlider.value = s.scale;
    if (memoScaleVal) memoScaleVal.textContent = `${s.scale.toFixed(2)}×`;
  }

  /**
   * 고해상도 PNG 내보내기 버튼 이벤트 바인딩 (T03-C11, C12, C13)
   */
  bindExportControls() {
    const exportBtn = document.getElementById('btn-export-png');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', async () => {
      try {
        exportBtn.disabled = true;
        exportBtn.style.opacity = '0.7';
        this.showToast(`${this.currentAspectRatio} 고해상도 카드 렌더링 중...`, 'info', 2000);

        const filename = `paper-card-${this.currentAspectRatio.replace(':', 'x')}-${Date.now()}.png`;
        await this.exporter.exportPNG(this.currentAspectRatio, filename);

        this.showToast(`다운로드 완료: ${filename}`, 'success');
      } catch (err) {
        console.error('[PaperStudioApp] PNG 내보내기 실패:', err);
        this.showToast('PNG 파일 다운로드 중 오류가 발생했습니다.', 'error');
      } finally {
        exportBtn.disabled = false;
        exportBtn.style.opacity = '1';
      }
    });
  }

  /**
   * 이미지 업로드 파일 검증 및 로드 (T03-C04, C05, C09, C10)
   * - PNG, JPEG만 정상 허용
   * - 미지원 파일(SVG, TXT, EXE 등) 업로드 시 거부 토스트 출력 및 기존 씬 100% 보존
   * @param {File} file
   */
  handleImageFileUpload(file) {
    if (!file) return;

    const validMimeTypes = ['image/png', 'image/jpeg'];
    const validExtensions = ['.png', '.jpg', '.jpeg'];
    const fileName = (file.name || '').toLowerCase();

    const hasValidExt = validExtensions.some(ext => fileName.endsWith(ext));
    const hasValidMime = validMimeTypes.includes(file.type);

    // [T03-C09, C10]: 지원하지 않는 파일 거부 검증
    if (!hasValidExt || !hasValidMime) {
      this.showToast('PNG 및 JPEG 파일만 지원합니다.', 'error');
      // 기존 3D 씬과 레이어 상태는 손상 없이 100% 보존됨
      const fileInput = document.getElementById('input-image-upload');
      if (fileInput) fileInput.value = '';
      return;
    }

    // [T03-C04, C05]: 정상 이미지 파일 FileReader 로드
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.showToast(`이미지 로드 완료: ${file.name}`, 'success');
        // 원본 사진을 3D 뒤쪽 배경판에 자동 매핑 (터널북/팝업북 백드롭 연동)
        if (this.sceneManager && typeof this.sceneManager.setBackdropImage === 'function') {
          this.sceneManager.setBackdropImage(img, { baseWidth: 6.0, zPosition: -0.05 });
        }
        this.cropTool.openWithImage(img);
      };
      img.onerror = () => {
        this.showToast('이미지 파일을 디코딩할 수 없습니다.', 'error');
      };
      img.src = e.target.result;
    };
    reader.onerror = () => {
      this.showToast('파일을 읽는 중 오류가 발생했습니다.', 'error');
    };
    reader.readAsDataURL(file);
  }

  /**
   * 기본 내장 샘플 아트워크 로드 후 크롭 모달 열기
   */
  loadSampleArtworkAndOpenCrop() {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    // 1. assets/samples/sample-art.png 로드 시도
    img.onload = () => {
      this.showToast('내장 샘플 아트 이미지를 불러왔습니다.', 'info');
      // 배경판에 샘플 아트워크 자동 매핑
      if (this.sceneManager && typeof this.sceneManager.setBackdropImage === 'function') {
        this.sceneManager.setBackdropImage(img, { baseWidth: 6.0, zPosition: -0.05 });
      }
      this.cropTool.openWithImage(img);
    };

    // 2. 파일 로드 실패 시 오프스크린 Canvas로 즉시 생성하는 페일오버 보장
    img.onerror = () => {
      console.warn('[PaperStudioApp] sample-art.png 로드 실패 -> 절차적 Canvas 샘플로 대체 생성');
      const fallbackCanvas = this._generateFallbackSampleCanvas();
      const fallbackImg = new Image();
      fallbackImg.onload = () => {
        this.showToast('절차적 내장 샘플 아트를 생성했습니다.', 'info');
        if (this.sceneManager && typeof this.sceneManager.setBackdropImage === 'function') {
          this.sceneManager.setBackdropImage(fallbackImg, { baseWidth: 6.0, zPosition: -0.05 });
        }
        this.cropTool.openWithImage(fallbackImg);
      };
      fallbackImg.src = fallbackCanvas.toDataURL('image/png');
    };

    img.src = 'assets/samples/sample-art.png';
  }

  /**
   * 네트워크/경로 장애 시에도 100% 작동하는 오프스크린 샘플 아트워크 생성기
   * @private
   * @returns {HTMLCanvasElement}
   */
  _generateFallbackSampleCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');

    // 그라디언트 배경
    const grad = ctx.createLinearGradient(0, 0, 800, 800);
    grad.addColorStop(0, '#1a2438');
    grad.addColorStop(1, '#e65c4d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 800);

    // 그래픽 원형 아트
    ctx.fillStyle = 'rgba(255, 210, 63, 0.85)';
    ctx.beginPath();
    ctx.arc(400, 360, 220, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(400, 360, 240, 0, Math.PI * 2);
    ctx.stroke();

    // 타이포그래피
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAPER SCULPTURE', 400, 370);

    ctx.font = '22px monospace';
    ctx.fillStyle = '#f0f2f5';
    ctx.fillText('3D TORN SHADOW STUDIO', 400, 420);

    return canvas;
  }

  /**
   * 크롭 도구에서 찢긴 조각 추가 시 3D 씬 연동 및 원본 배경 사진 상의 3D 위치 일치 배치
   * @param {Object} cropData
   */
  handleAddCroppedPiece(cropData) {
    // 1. 초기 기본 샘플 레이어가 아직 남아있는 경우 일괄 정리하여 독립 2-레이어 터널북 구조로 전환
    const hasInitSample = this.layers.some(
      l => l.userData.id === 'layer_init_1' || l.userData.id === 'layer_init_2'
    );
    if (hasInitSample) {
      this.sceneManager.clearPaperLayers();
      this.layers = [];
      this.backdropLayerMesh = null;
    }

    // 2. 크롭 텍스처 준비 (CanvasTexture 생성)
    if (cropData.cropCanvas && !cropData.texture) {
      cropData.texture = new THREE.CanvasTexture(cropData.cropCanvas);
      cropData.texture.colorSpace = THREE.SRGBColorSpace;
      cropData.texture.needsUpdate = true;
    }

    // 3. 배경판 종횡비 및 3D 크기 산출
    const origW = cropData.cropRect?.origW || 1;
    const origH = cropData.cropRect?.origH || 1;
    const bgWidth = 6.0;
    const bgHeight = Number((bgWidth * (origH / origW)).toFixed(4));

    // 4. 구멍 뚫린 배경 사진의 독립 3D 메쉬 레이어 (Backdrop Layer, 기본 Z = 0.00) 생성 또는 갱신
    if (cropData.punchedBgCanvas) {
      const bgTexture = new THREE.CanvasTexture(cropData.punchedBgCanvas);
      bgTexture.colorSpace = THREE.SRGBColorSpace;
      bgTexture.minFilter = THREE.LinearFilter;
      bgTexture.magFilter = THREE.LinearFilter;
      bgTexture.generateMipmaps = false;
      bgTexture.needsUpdate = true;

      if (!this.backdropLayerMesh) {
        const bgGeo = new THREE.PlaneGeometry(bgWidth, bgHeight);
        const bgMat = new THREE.MeshStandardMaterial({
          map: bgTexture,
          roughness: 0.88,
          metalness: 0.02,
          transparent: true,
          alphaTest: 0.001,
          side: THREE.FrontSide
        });

        const bgMesh = new THREE.Mesh(bgGeo, bgMat);
        bgMesh.position.set(0, 0, 0.00);
        bgMesh.castShadow = true;
        bgMesh.receiveShadow = true;

        // 필름 사진 흰색 외곽 인화지 보더 (Film Photo Border)
        const borderMargin = 0.22;
        const borderGeo = new THREE.PlaneGeometry(bgWidth + borderMargin, bgHeight + borderMargin);
        const borderMat = new THREE.MeshStandardMaterial({
          color: 0xfcfbf7,
          roughness: 0.92,
          metalness: 0.01,
          side: THREE.FrontSide
        });
        const borderMesh = new THREE.Mesh(borderGeo, borderMat);
        borderMesh.position.set(0, 0, -0.002);
        borderMesh.castShadow = true;
        borderMesh.receiveShadow = true;
        bgMesh.add(borderMesh);
        bgMesh.filmBorderMesh = borderMesh;

        bgMesh.userData = {
          id: 'layer_backdrop',
          name: '🖼️ 배경 레이어 (오려진 원본)',
          shapeType: 'rectangle',
          isBackdropLayer: true,
          width: bgWidth,
          height: bgHeight,
          roughness: 0.88,
          zIndex: 0.00,
          textureDataUrl: cropData.punchedBgCanvas.toDataURL('image/png')
        };

        this.sceneManager.addPaperMesh(bgMesh, 0.00);
        // layers 목록의 첫 번째(기저 배경 레이어, Z = 0.00)로 등록
        this.layers.push(bgMesh);
        this.backdropLayerMesh = bgMesh;
      } else {
        if (this.backdropLayerMesh.material.map) {
          this.backdropLayerMesh.material.map.dispose();
        }
        this.backdropLayerMesh.material.map = bgTexture;
        this.backdropLayerMesh.material.needsUpdate = true;
        this.backdropLayerMesh.userData.textureDataUrl = cropData.punchedBgCanvas.toDataURL('image/png');
      }

      // 배경 뒤 액자 내부의 어두운 매트 보드(Z = -0.15) 설정: 구멍 난 곳을 통해 안쪽 깊은 공간이 들여다보이도록 함
      if (this.sceneManager.boardMesh) {
        this.sceneManager.boardMesh.position.set(0, 0, -0.15);
        if (this.sceneManager.boardMesh.material.map) {
          this.sceneManager.boardMesh.material.map = null;
        }
        this.sceneManager.boardMesh.material.color.set(0x14161a);
        this.sceneManager.boardMesh.material.roughness = 0.95;
        this.sceneManager.boardMesh.material.needsUpdate = true;
      }
    }

    // 5. 팝업 조각 3D 메쉬 생성 (기본 Z = 0.60, 다층 스택 시 오프셋 가산)
    const popupDepth = 0.60;
    const extrudeOpts = {
      depth: 0.03,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.005
    };

    let uvBounds = cropData.uvBounds;
    let pieceW = cropData.width;
    let pieceH = cropData.height;

    if (uvBounds && uvBounds.maxX > uvBounds.minX && uvBounds.maxY > uvBounds.minY) {
      pieceW = (uvBounds.maxX - uvBounds.minX) * bgWidth;
      pieceH = (uvBounds.maxY - uvBounds.minY) * bgHeight;
    }

    let mesh;
    if (cropData.shapeType === 'polygon' && Array.isArray(cropData.points) && cropData.points.length >= 3) {
      // 바운딩 박스 중심(0, 0) 기준의 로컬 폴리곤 좌표로 정렬
      const localPolygonPoints = cropData.points.map(pt => ({
        x: Number(((pt.x - 0.5) * pieceW).toFixed(4)),
        y: Number(((0.5 - pt.y) * pieceH).toFixed(4))
      }));

      mesh = createTornPaperMesh(
        'polygon',
        {
          points: localPolygonPoints,
          roughness: cropData.roughness,
          detail: 20,
          seed: cropData.seed,
          hasWhiteBorder: true,
          borderScale: 1.04,
          extrudeOptions: extrudeOpts
        },
        {
          map: cropData.texture,
          roughness: 0.82,
          metalness: 0.02
        }
      );
    } else if (cropData.shapeType === 'circle') {
      const radius = Math.min(pieceW, pieceH) / 2;
      mesh = createTornPaperMesh(
        'circle',
        {
          radius: radius,
          roughness: cropData.roughness,
          segments: 150,
          seed: cropData.seed,
          hasWhiteBorder: true,
          borderScale: 1.04,
          extrudeOptions: extrudeOpts
        },
        {
          map: cropData.texture,
          roughness: 0.82,
          metalness: 0.02
        }
      );
    } else {
      mesh = createTornPaperMesh(
        'rectangle',
        {
          width: pieceW,
          height: pieceH,
          roughness: cropData.roughness,
          detail: 70,
          seed: cropData.seed,
          hasWhiteBorder: true,
          borderScale: 1.04,
          extrudeOptions: extrudeOpts
        },
        {
          map: cropData.texture,
          roughness: 0.82,
          metalness: 0.02
        }
      );
    }

    // 6. 3D X, Y 위치를 원본 배경 사진 상의 위치와 정확히 1:1 일치하도록 배치
    let posX = 0;
    let posY = 0;

    if (cropData.centerOffset) {
      posX = Number((cropData.centerOffset.x * bgWidth).toFixed(3));
      posY = Number((-cropData.centerOffset.y * bgHeight).toFixed(3));
    } else if (uvBounds) {
      const uMid = (uvBounds.minX + uvBounds.maxX) / 2;
      const vMid = (uvBounds.minY + uvBounds.maxY) / 2;
      posX = Number(((uMid - 0.5) * bgWidth).toFixed(3));
      posY = Number(((0.5 - vMid) * bgHeight).toFixed(3));
    }

    mesh.position.set(posX, posY, popupDepth);

    // 7. 메타데이터 부착
    const popupCount = this.layers.filter(l => !l.userData.isBackdropLayer).length + 1;
    const popupTitle = popupCount === 1 ? '✂️ 팝업 조각 (인물/물체)' : `✂️ 팝업 조각 #${popupCount}`;

    const textureDataUrl = cropData.cropCanvas ? cropData.cropCanvas.toDataURL('image/png') : null;
    mesh.userData = {
      id: `layer_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: popupTitle,
      shapeType: cropData.shapeType,
      zIndex: popupDepth,
      cropData: cropData,
      textureDataUrl: textureDataUrl,
      width: pieceW,
      height: pieceH,
      radius: cropData.radius,
      roughness: cropData.roughness,
      seed: cropData.seed,
      color: null
    };

    // 8. 3D 씬 매니저에 추가 및 layers 등록
    this.sceneManager.addPaperMesh(mesh, popupDepth);
    this.layers.push(mesh);

    // 9. 새로 추가된 팝업 조각을 현재 선택 레이어로 지정 및 UI 동기화
    this.selectLayer(mesh);
    this.updateLayerListUI();

    this.showToast(`터널북 팝업 조각 생성 완료 (Z = ${popupDepth.toFixed(2)})`, 'success');
  }

  /**
   * 특정 레이어 선택 및 인스펙터 패널 연동
   * @param {THREE.Mesh} mesh
   */
  selectLayer(mesh) {
    this.selectedLayer = mesh;

    // 레이어 목록 UI 하이라이트
    const items = document.querySelectorAll('.layer-item');
    items.forEach(el => {
      const id = el.getAttribute('data-layer-id');
      if (mesh && mesh.userData.id === id) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });

    this.syncTransformUI();
  }

  /**
   * 선택된 조각의 위치/회전/스케일 변형 슬라이더 UI 갱신
   */
  syncTransformUI() {
    const nameEl = document.getElementById('selected-piece-name');
    const zEl = document.getElementById('selected-piece-z');
    const sliderX = document.getElementById('slider-piece-x');
    const sliderY = document.getElementById('slider-piece-y');
    const sliderRot = document.getElementById('slider-piece-rot');
    const sliderScale = document.getElementById('slider-piece-scale');

    const valX = document.getElementById('val-piece-x');
    const valY = document.getElementById('val-piece-y');
    const valRot = document.getElementById('val-piece-rot');
    const valScale = document.getElementById('val-piece-scale');
    const sliderZ = document.getElementById('slider-piece-z');
    const valZ = document.getElementById('val-piece-z');

    if (!this.selectedLayer) {
      if (nameEl) nameEl.textContent = '선택된 조각 없음';
      if (zEl) zEl.textContent = 'Z: --';
      return;
    }

    const mesh = this.selectedLayer;
    if (nameEl) nameEl.textContent = mesh.userData.name || '종이 조각';
    if (zEl) zEl.textContent = `Z: ${mesh.position.z.toFixed(2)}`;

    // X
    if (sliderX) sliderX.value = mesh.position.x;
    if (valX) valX.textContent = mesh.position.x.toFixed(2);

    // Y
    if (sliderY) sliderY.value = mesh.position.y;
    if (valY) valY.textContent = mesh.position.y.toFixed(2);

    // Rot Z (라디안 -> 각도)
    const deg = Math.round(THREE.MathUtils.radToDeg(mesh.rotation.z));
    if (sliderRot) sliderRot.value = deg;
    if (valRot) valRot.textContent = `${deg}°`;

    // Scale
    const scale = Number(mesh.scale.x.toFixed(2));
    if (sliderScale) sliderScale.value = scale;
    if (valScale) valScale.textContent = `${scale.toFixed(2)}×`;

    // 팝업 돌출 깊이 (Z)
    const zPos = Number(mesh.position.z.toFixed(2));
    if (sliderZ) sliderZ.value = zPos;
    if (valZ) valZ.textContent = zPos.toFixed(2);
  }

  /**
   * 변형 컨트롤 슬라이더 이벤트 바인딩
   * @private
   */
  _bindTransformControls() {
    const sliderX = document.getElementById('slider-piece-x');
    const sliderY = document.getElementById('slider-piece-y');
    const sliderRot = document.getElementById('slider-piece-rot');
    const sliderScale = document.getElementById('slider-piece-scale');
    const sliderZ = document.getElementById('slider-piece-z');

    const valX = document.getElementById('val-piece-x');
    const valY = document.getElementById('val-piece-y');
    const valRot = document.getElementById('val-piece-rot');
    const valScale = document.getElementById('val-piece-scale');
    const valZ = document.getElementById('val-piece-z');

    if (sliderX) {
      sliderX.addEventListener('input', (e) => {
        if (!this.selectedLayer) return;
        const val = parseFloat(e.target.value);
        this.selectedLayer.position.x = val;
        if (valX) valX.textContent = val.toFixed(2);
        if (this.memoEngine && (this.selectedLayer === this.memoEngine.mesh || this.selectedLayer.userData?.isMemoLabel)) {
          this.memoEngine.state.posX = val;
          this.syncMemoUIFromEngine();
        }
      });
    }

    if (sliderY) {
      sliderY.addEventListener('input', (e) => {
        if (!this.selectedLayer) return;
        const val = parseFloat(e.target.value);
        this.selectedLayer.position.y = val;
        if (valY) valY.textContent = val.toFixed(2);
        if (this.memoEngine && (this.selectedLayer === this.memoEngine.mesh || this.selectedLayer.userData?.isMemoLabel)) {
          this.memoEngine.state.posY = val;
          this.syncMemoUIFromEngine();
        }
      });
    }

    if (sliderRot) {
      sliderRot.addEventListener('input', (e) => {
        if (!this.selectedLayer) return;
        const deg = parseInt(e.target.value, 10);
        this.selectedLayer.rotation.z = THREE.MathUtils.degToRad(deg);
        if (valRot) valRot.textContent = `${deg}°`;
      });
    }

    if (sliderScale) {
      sliderScale.addEventListener('input', (e) => {
        if (!this.selectedLayer) return;
        const scale = parseFloat(e.target.value);
        this.selectedLayer.scale.set(scale, scale, 1);
        if (valScale) valScale.textContent = `${scale.toFixed(2)}×`;
        if (this.memoEngine && (this.selectedLayer === this.memoEngine.mesh || this.selectedLayer.userData?.isMemoLabel)) {
          this.memoEngine.state.scale = scale;
          this.syncMemoUIFromEngine();
        }
      });
    }

    // 팝업 돌출 깊이(Pop-up Depth) 슬라이더 연동 (Z = 0.10 ~ 1.50)
    if (sliderZ) {
      sliderZ.addEventListener('input', (e) => {
        if (!this.selectedLayer) return;
        const z = parseFloat(e.target.value);
        this.selectedLayer.position.z = z;
        this.selectedLayer.userData.zIndex = z;
        if (this.memoEngine && (this.selectedLayer === this.memoEngine.mesh || this.selectedLayer.userData?.isMemoLabel)) {
          this.memoEngine.state.posZ = z;
        }
        if (valZ) valZ.textContent = z.toFixed(2);
        const zEl = document.getElementById('selected-piece-z');
        if (zEl) zEl.textContent = `Z: ${z.toFixed(2)}`;
        this.updateLayerListUI();
      });
    }
  }

  /**
   * 레이어 삭제 및 Z-Stack 높이 재정렬
   * @param {THREE.Mesh} mesh
   */
  removeLayer(mesh) {
    const idx = this.layers.indexOf(mesh);
    if (idx === -1) return;

    if (mesh === this.backdropLayerMesh) {
      this.backdropLayerMesh = null;
    }

    // 메모지 레이어인 경우 memoEngine도 씬에서 안전하게 제거 및 숨김
    if (this.memoEngine && (mesh === this.memoEngine.mesh || mesh.userData?.isMemoLabel)) {
      this.memoEngine.hide();
    } else {
      this.sceneManager.removePaperMesh(mesh);
    }

    this.layers.splice(idx, 1);

    if (this.layers.length > 0) {
      this.selectLayer(this.layers[Math.max(0, idx - 1)]);
    } else {
      this.selectLayer(null);
    }

    this.updateLayerListUI();
    this.showToast('조각이 삭제되었습니다.', 'info');
  }

  /**
   * 3D 뷰포트 마우스 클릭 시 해당 조각 직접 선택 (Raycasting)
   */
  bindViewportRaycasting() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let isPointerMoving = false;
    let startPos = { x: 0, y: 0 };

    this.container.addEventListener('pointerdown', (e) => {
      isPointerMoving = false;
      startPos = { x: e.clientX, y: e.clientY };
    });

    this.container.addEventListener('pointermove', (e) => {
      if (Math.abs(e.clientX - startPos.x) > 5 || Math.abs(e.clientY - startPos.y) > 5) {
        isPointerMoving = true;
      }
    });

    this.container.addEventListener('pointerup', (e) => {
      if (isPointerMoving) return; // 드래그 중인 경우 클릭 선택 무시

      const rect = this.container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, this.sceneManager.camera);
      const intersects = raycaster.intersectObjects(this.layers, false);

      if (intersects.length > 0) {
        // 가장 앞에(가까이) 있는 메쉬 선택
        const hitMesh = intersects[0].object;
        this.selectLayer(hitMesh);
      }
    });
  }

  /**
   * 레이어 스택 목록 UI 갱신
   */
  updateLayerListUI() {
    const listEl = document.getElementById('layer-stack-list');
    const countBadge = document.getElementById('layer-count-badge');
    if (!listEl) return;

    if (countBadge) countBadge.textContent = `${this.layers.length}개`;

    listEl.innerHTML = '';
    if (this.layers.length === 0) {
      listEl.innerHTML = '<li class="layer-empty-msg">적재된 종이 조각이 없습니다. [사진 업로드]를 통해 조각을 추가하세요.</li>';
      return;
    }

    this.layers.forEach((mesh, idx) => {
      const li = document.createElement('li');
      li.className = 'layer-item';
      li.setAttribute('data-layer-id', mesh.userData.id);
      if (this.selectedLayer === mesh) {
        li.classList.add('selected');
      }

      const isBackdrop = mesh.userData.isBackdropLayer;
      const isMemo = mesh.userData.isMemoLabel || (this.memoEngine && mesh === this.memoEngine.mesh);
      const isCircle = mesh.userData.shapeType === 'circle';
      const shapeIcon = isMemo
        ? '📝'
        : (isBackdrop
          ? '🖼️'
          : (mesh.userData.name && mesh.userData.name.includes('✂️')
            ? '✂️'
            : (isCircle ? '●' : '■')));
      const layerTitle = isMemo ? '📝 텍스트 메모지' : (mesh.userData.name || '종이 조각');

      li.innerHTML = `
        <div class="layer-badge">${shapeIcon}</div>
        <div class="layer-meta">
          <span class="layer-title">${layerTitle}</span>
          <span class="layer-sub">L${idx + 1} | Z: ${mesh.position.z.toFixed(2)} | 스케일: ${mesh.scale.x.toFixed(2)}×</span>
        </div>
        <div class="layer-item-actions">
          <button type="button" class="layer-mini-btn" title="조각 삭제" data-action="delete" data-id="${mesh.userData.id}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          </button>
        </div>
      `;

      // 레이어 클릭 시 선택
      li.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="delete"]')) return;
        this.selectLayer(mesh);
      });

      // 개별 삭제 버튼
      const delBtn = li.querySelector('[data-action="delete"]');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeLayer(mesh);
        });
      }

      listEl.appendChild(li);
    });
  }

  /**
   * 카메라 HUD 정보 갱신
   */
  updateCameraHUD() {
    const info = this.sceneManager.getCameraInfo();
    const hudPos = document.getElementById('hud-camera-pos');
    const hudDist = document.getElementById('hud-camera-dist');

    if (hudPos) {
      hudPos.textContent = `X: ${info.position.x}  Y: ${info.position.y}  Z: ${info.position.z}`;
    }
    if (hudDist) {
      hudDist.textContent = `거리: ${info.distance}`;
    }
  }

  /**
   * 현재 3D 씬의 모든 종이 레이어 직렬화 스냅샷 반환
   * @returns {Array<Object>}
   */
  getLayersSnapshot() {
    return this.layers.map((mesh, index) => {
      const ud = mesh.userData || {};
      const pos = mesh.position;
      const rot = mesh.rotation;
      const scale = mesh.scale;

      return {
        id: ud.id || `layer_${Date.now()}_${index}`,
        name: ud.name || `종이 조각 #${index + 1}`,
        shapeType: ud.shapeType || 'rectangle',
        isBackdropLayer: Boolean(ud.isBackdropLayer),
        isMemoLabel: Boolean(ud.isMemoLabel || (this.memoEngine && mesh === this.memoEngine.mesh)),
        width: ud.cropData?.width || ud.width || 4.0,
        height: ud.cropData?.height || ud.height || 2.8,
        radius: ud.cropData?.radius || ud.radius || 1.25,
        points: ud.cropData?.points || ud.points || null,
        roughness: ud.cropData?.roughness || ud.roughness || this.roughness,
        seed: ud.cropData?.seed || ud.seed || (42 + index * 137),
        color: ud.color || (mesh.material?.color ? `#${mesh.material.color.getHexString()}` : '#ede8dc'),
        textureDataUrl: ud.textureDataUrl || null,
        position: {
          x: Number(pos.x.toFixed(2)),
          y: Number(pos.y.toFixed(2)),
          z: Number(pos.z.toFixed(2))
        },
        rotation: {
          x: Number(rot.x.toFixed(3)),
          y: Number(rot.y.toFixed(3)),
          z: Number(rot.z.toFixed(3))
        },
        scale: {
          x: Number(scale.x.toFixed(2)),
          y: Number(scale.y.toFixed(2)),
          z: Number(scale.z.toFixed(2))
        },
        zIndex: Number(pos.z.toFixed(2))
      };
    });
  }

  /**
   * 레이어 데이터 객체로부터 Three.js 3D 메쉬 비동기 재생성
   * @param {Object} layerData
   * @returns {Promise<THREE.Mesh>}
   */
  async createLayerMeshFromData(layerData) {
    const extrudeOpts = {
      depth: 0.03,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.005
    };

    let matOptions = {};
    let cropCanvas = null;

    if (layerData.textureDataUrl) {
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          cropCanvas = document.createElement('canvas');
          cropCanvas.width = img.naturalWidth || 400;
          cropCanvas.height = img.naturalHeight || 400;
          const ctx = cropCanvas.getContext('2d');
          ctx.drawImage(img, 0, 0);

          const texture = new THREE.CanvasTexture(cropCanvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
          matOptions = {
            map: texture,
            roughness: 0.82,
            metalness: 0.02
          };
          resolve();
        };
        img.onerror = () => {
          const colorHex = layerData.color ? parseInt(layerData.color.replace('#', ''), 16) : 0xede8dc;
          matOptions = { color: colorHex, roughness: 0.88 };
          resolve();
        };
        img.src = layerData.textureDataUrl;
      });
    } else {
      const colorHex = layerData.color ? parseInt(layerData.color.replace('#', ''), 16) : 0xede8dc;
      matOptions = {
        color: colorHex,
        roughness: 0.88
      };
    }

    let mesh;
    if (layerData.isBackdropLayer || layerData.id === 'layer_backdrop') {
      const bgGeo = new THREE.PlaneGeometry(layerData.width || 6.0, layerData.height || 6.0);
      const bgMat = new THREE.MeshStandardMaterial(Object.assign({
        roughness: 0.88,
        metalness: 0.02,
        transparent: true,
        alphaTest: 0.001,
        side: THREE.FrontSide
      }, matOptions));
      mesh = new THREE.Mesh(bgGeo, bgMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.backdropLayerMesh = mesh;
    } else if (layerData.shapeType === 'polygon' && Array.isArray(layerData.points) && layerData.points.length >= 3) {
      const pieceW = layerData.width || 4.0;
      const pieceH = layerData.height || 2.8;
      const localPolygonPoints = layerData.points.map(pt => ({
        x: Number(((pt.x - 0.5) * pieceW).toFixed(4)),
        y: Number(((0.5 - pt.y) * pieceH).toFixed(4))
      }));
      mesh = createTornPaperMesh(
        'polygon',
        {
          points: localPolygonPoints,
          roughness: layerData.roughness || 0.08,
          detail: 20,
          seed: layerData.seed || 42,
          hasWhiteBorder: true,
          borderScale: 1.04,
          extrudeOptions: extrudeOpts
        },
        matOptions
      );
    } else if (layerData.shapeType === 'circle') {
      mesh = createTornPaperMesh(
        'circle',
        {
          radius: layerData.radius || 1.25,
          roughness: layerData.roughness || 0.068,
          segments: 150,
          seed: layerData.seed || 179,
          hasWhiteBorder: true,
          borderScale: 1.04,
          extrudeOptions: extrudeOpts
        },
        matOptions
      );
    } else {
      mesh = createTornPaperMesh(
        'rectangle',
        {
          width: layerData.width || 4.0,
          height: layerData.height || 2.8,
          roughness: layerData.roughness || 0.075,
          detail: 70,
          seed: layerData.seed || 42,
          hasWhiteBorder: true,
          borderScale: 1.04,
          extrudeOptions: extrudeOpts
        },
        matOptions
      );
    }

    const pos = layerData.position || { x: 0, y: 0, z: 0 };
    mesh.position.set(pos.x || 0, pos.y || 0, pos.z || 0);

    const rot = layerData.rotation || { x: 0, y: 0, z: 0 };
    mesh.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);

    const scale = layerData.scale || { x: 1, y: 1, z: 1 };
    mesh.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);

    mesh.userData = {
      id: layerData.id || `layer_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: layerData.name || '종이 조각',
      shapeType: layerData.shapeType || 'rectangle',
      width: layerData.width,
      height: layerData.height,
      radius: layerData.radius,
      roughness: layerData.roughness,
      seed: layerData.seed,
      color: layerData.color,
      textureDataUrl: layerData.textureDataUrl || null,
      zIndex: pos.z || 0,
      cropData: cropCanvas ? {
        cropCanvas,
        shapeType: layerData.shapeType,
        width: layerData.width,
        height: layerData.height,
        radius: layerData.radius,
        roughness: layerData.roughness,
        seed: layerData.seed
      } : null
    };

    return mesh;
  }

  /**
   * 현재 씬 상태 전체를 직렬화 스냅샷 객체로 캡처
   * @param {string} [name='']
   * @returns {Object}
   */
  getCurrentSceneSnapshot(name = '') {
    return {
      version: '1.0',
      name: name || `템플릿 ${new Date().toLocaleTimeString('ko-KR')}`,
      aspect: this.currentAspectRatio,
      camera: this.sceneManager.getCameraInfo(),
      text: this.memoEngine.toJSON(),
      layers: this.getLayersSnapshot()
    };
  }

  /**
   * 씬 스냅샷 데이터를 3D 씬 및 UI에 완벽 복원 (T03-C18, T03-C22)
   * @param {Object} snapshot
   */
  async applySceneSnapshot(snapshot) {
    if (!snapshot) return;

    // 1. 화면비 복원 (1:1, 4:5, 9:16)
    if (snapshot.aspect) {
      this.setAspectRatio(snapshot.aspect, false);
    }

    // 2. 카메라 시점 복원
    if (snapshot.camera) {
      if (snapshot.camera.position && this.sceneManager.camera) {
        this.sceneManager.camera.position.set(
          snapshot.camera.position.x,
          snapshot.camera.position.y,
          snapshot.camera.position.z
        );
      }
      if (snapshot.camera.target && this.sceneManager.controls) {
        this.sceneManager.controls.target.set(
          snapshot.camera.target.x,
          snapshot.camera.target.y,
          snapshot.camera.target.z
        );
      }
      this.sceneManager.controls.update();
    }

    // 3. 메모지 텍스트 라벨 복원
    if (snapshot.text && this.memoEngine) {
      if (typeof snapshot.text === 'string') {
        this.memoEngine.setText(snapshot.text);
      } else {
        this.memoEngine.fromJSON(snapshot.text);
      }
      this.memoEngine.show();
      this.syncMemoUIFromEngine();
    } else if (this.memoEngine) {
      this.memoEngine.hide();
    }

    // 4. 기존 종이 레이어 비우고 새 레이어 비동기 재구축
    this.sceneManager.clearPaperLayers();
    this.layers = [];

    if (Array.isArray(snapshot.layers)) {
      for (const layerData of snapshot.layers) {
        // 메모지 라벨은 memoEngine을 통해 단일 관리되므로 일반 종이 메쉬 재생성 건너뜀
        if (layerData.isMemoLabel || layerData.id === 'layer_memo_label') {
          continue;
        }
        const mesh = await this.createLayerMeshFromData(layerData);
        this.sceneManager.addPaperMesh(mesh, mesh.position.z);
        this.layers.push(mesh);
      }
    }

    // 메모지가 활성화된 상태라면 layers 목록에도 독립 레이어로 등록
    if (this.memoEngine && this.memoEngine.isVisible() && !this.layers.includes(this.memoEngine.mesh)) {
      this.layers.push(this.memoEngine.mesh);
    }

    // 최상단 레이어 선택
    if (this.layers.length > 0) {
      this.selectLayer(this.layers[this.layers.length - 1]);
    } else {
      this.selectLayer(null);
    }

    this.updateLayerListUI();
  }

  /**
   * 템플릿 관리(CRUD) 버튼 이벤트 바인딩 (T03-C17 ~ C21)
   */
  bindTemplateControls() {
    // 1. 현재 씬을 템플릿으로 저장 (T03-C17)
    const saveBtn = document.getElementById('btn-save-template');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const defaultName = `사용자 템플릿 #${this.templateStore.getAll().length + 1}`;
        const inputName = prompt('새 템플릿의 이름을 입력하세요:', defaultName);
        if (inputName === null) return; // 취소

        const name = inputName.trim() || defaultName;
        const snapshot = this.getCurrentSceneSnapshot(name);
        const created = this.templateStore.create(snapshot);
        this.updateTemplateListUI();
        this.showToast(`템플릿 '${created.name}'이(가) 저장되었습니다. (localStorage 영속화)`, 'success');
      });
    }

    // 2. 기본 프리셋 3종으로 복원
    const resetBtn = document.getElementById('btn-reset-presets');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('모든 템플릿을 내장 기본 프리셋 3종으로 복원하시겠습니까?')) {
          this.templateStore.resetToDefaults();
          this.updateTemplateListUI();
          this.showToast('기본 프리셋 3종으로 복원되었습니다.', 'info');
        }
      });
    }
  }

  /**
   * 템플릿 목록 UI 렌더링 및 개별 액션 바인딩 (T03-C18 ~ C21)
   */
  updateTemplateListUI() {
    const listEl = document.getElementById('template-list');
    const countBadge = document.getElementById('template-count-badge');
    if (!listEl) return;

    const templates = this.templateStore.getAll();
    if (countBadge) {
      countBadge.textContent = `${templates.length}개`;
    }

    listEl.innerHTML = '';
    if (templates.length === 0) {
      listEl.innerHTML = '<li class="template-empty-msg">저장된 템플릿이 없습니다. [+ 현재 씬 템플릿 저장] 버튼을 눌러 추가하세요.</li>';
      return;
    }

    templates.forEach((tpl) => {
      const li = document.createElement('li');
      li.className = 'template-item';
      li.setAttribute('data-template-id', tpl.id);

      const layerCount = Array.isArray(tpl.layers) ? tpl.layers.length : 0;
      const createdDate = tpl.createdAt ? new Date(tpl.createdAt).toLocaleDateString('ko-KR') : '';

      li.innerHTML = `
        <div class="template-item-top">
          <span class="template-item-name" title="${tpl.name}">${tpl.name}</span>
          <span class="template-aspect-badge">${tpl.aspect || '1:1'}</span>
        </div>
        <div class="template-item-details">
          <span>레이어 ${layerCount}개</span>
          <span>•</span>
          <span>${createdDate}</span>
          ${tpl.isPreset ? '<span>• [프리셋]</span>' : ''}
        </div>
        <div class="template-item-actions">
          <button type="button" class="template-mini-btn template-mini-btn-primary" data-action="load" title="이 템플릿 씬 불러오기">
            불러오기
          </button>
          <button type="button" class="template-mini-btn" data-action="overwrite" title="현재 씬 상태로 이 템플릿 내용 덮어쓰기">
            덮어쓰기
          </button>
          <button type="button" class="template-mini-btn" data-action="rename" title="템플릿 이름 변경">
            이름변경
          </button>
          <button type="button" class="template-mini-btn template-mini-btn-danger" data-action="delete" title="템플릿 삭제">
            삭제
          </button>
        </div>
      `;

      // 불러오기 (T03-C18)
      const loadBtn = li.querySelector('[data-action="load"]');
      if (loadBtn) {
        loadBtn.addEventListener('click', async () => {
          await this.applySceneSnapshot(tpl);
          document.querySelectorAll('.template-item').forEach(el => el.classList.remove('active'));
          li.classList.add('active');
          this.showToast(`'${tpl.name}' 템플릿을 불러왔습니다.`, 'success');
        });
      }

      // 덮어쓰기 (T03-C19)
      const overwriteBtn = li.querySelector('[data-action="overwrite"]');
      if (overwriteBtn) {
        overwriteBtn.addEventListener('click', () => {
          if (confirm(`'${tpl.name}' 템플릿을 현재 3D 씬 상태로 덮어쓰시겠습니까?`)) {
            const snapshot = this.getCurrentSceneSnapshot(tpl.name);
            this.templateStore.update(tpl.id, snapshot);
            this.updateTemplateListUI();
            this.showToast(`'${tpl.name}' 템플릿이 현재 씬으로 수정(덮어쓰기)되었습니다.`, 'success');
          }
        });
      }

      // 이름변경 (T03-C19)
      const renameBtn = li.querySelector('[data-action="rename"]');
      if (renameBtn) {
        renameBtn.addEventListener('click', () => {
          const newName = prompt('변경할 템플릿 이름을 입력하세요:', tpl.name);
          if (newName && newName.trim() !== '') {
            this.templateStore.update(tpl.id, { name: newName.trim() });
            this.updateTemplateListUI();
            this.showToast(`템플릿 이름이 '${newName.trim()}'(으)로 변경되었습니다.`, 'success');
          }
        });
      }

      // 삭제 (T03-C20)
      const delBtn = li.querySelector('[data-action="delete"]');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          if (confirm(`'${tpl.name}' 템플릿을 삭제하시겠습니까? (다른 템플릿에는 영향 없음)`)) {
            this.templateStore.delete(tpl.id);
            this.updateTemplateListUI();
            this.showToast(`'${tpl.name}' 템플릿이 삭제되었습니다.`, 'info');
          }
        });
      }

      listEl.appendChild(li);
    });
  }

  /**
   * JSON 내보내기 및 3단계 유효성 검증 가져오기 바인딩 (T03-C22 ~ C24)
   */
  bindJsonIOControls() {
    // 1. JSON 내보내기 버튼
    const exportBtn = document.getElementById('btn-export-json');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        try {
          const exportData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            aspect: this.currentAspectRatio,
            camera: this.sceneManager.getCameraInfo(),
            text: this.memoEngine.toJSON(),
            layers: this.getLayersSnapshot(),
            templates: this.templateStore.getAll()
          };

          const jsonStr = JSON.stringify(exportData, null, 2);
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const fileName = `paper-studio-export-${this.currentAspectRatio.replace(':', 'x')}-${Date.now()}.json`;
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          this.showToast(`JSON 파일 내보내기 완료: ${fileName}`, 'success');
        } catch (err) {
          console.error('[PaperStudioApp] JSON 내보내기 실패:', err);
          this.showToast('JSON 내보내기 중 오류가 발생했습니다.', 'error');
        }
      });
    }

    // 2. JSON 가져오기 트리거 및 파일 인풋
    const importBtn = document.getElementById('btn-import-json-trigger');
    const fileInput = document.getElementById('input-json-import');

    if (importBtn && fileInput) {
      importBtn.addEventListener('click', () => {
        fileInput.value = '';
        fileInput.click();
      });

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
          const rawContent = evt.target.result;

          // [T03-C23, T03-C24]: 3단계 유효성 검증 파이프라인 수행
          const result = JSONValidator.validate(rawContent);

          if (!result.valid) {
            // 거부 사유 토스트 출력 & 기존 씬 및 템플릿 100% 보존
            console.warn('[PaperStudioApp] JSON 유효성 검증 실패 거부:', result);
            this.showToast(`[가져오기 거부] ${result.message}`, 'error', 6000);
            fileInput.value = '';
            return;
          }

          // [T03-C22]: 유효성 검증 완료된 데이터로 템플릿 목록 및 3D 씬 복원
          try {
            const data = result.data;
            if (Array.isArray(data.templates) && data.templates.length > 0) {
              this.templateStore.replaceAll(data.templates);
              this.updateTemplateListUI();
            }

            await this.applySceneSnapshot(data);
            this.showToast('정상 JSON 검증 완료: 템플릿 목록과 3D 씬이 성공적으로 복원되었습니다.', 'success');
          } catch (err) {
            console.error('[PaperStudioApp] JSON 데이터 복원 중 오류:', err);
            this.showToast('데이터 복원 적용 중 오류가 발생했습니다.', 'error');
          } finally {
            fileInput.value = '';
          }
        };

        reader.onerror = () => {
          this.showToast('JSON 파일을 읽을 수 없습니다.', 'error');
          fileInput.value = '';
        };

        reader.readAsText(file);
      });
    }
  }

  /**
   * JSON 파일 객체 직접 가져오기 검증 및 처리 (T03-C22 ~ C24)
   * @param {File|Blob} file
   * @returns {Promise<Object>}
   */
  async handleJsonFileImport(file) {
    if (!file) return { valid: false, message: '파일이 없습니다.' };

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const rawContent = evt.target.result;
        const result = JSONValidator.validate(rawContent);

        if (!result.valid) {
          console.warn('[PaperStudioApp] JSON 유효성 검증 실패 거부:', result);
          this.showToast(`[가져오기 거부] ${result.message}`, 'error', 6000);
          resolve(result);
          return;
        }

        try {
          const data = result.data;
          if (Array.isArray(data.templates) && data.templates.length > 0) {
            this.templateStore.replaceAll(data.templates);
            this.updateTemplateListUI();
          }
          await this.applySceneSnapshot(data);
          this.showToast('정상 JSON 검증 완료: 템플릿 목록과 3D 씬이 성공적으로 복원되었습니다.', 'success');
          resolve(result);
        } catch (err) {
          console.error('[PaperStudioApp] JSON 데이터 복원 중 오류:', err);
          this.showToast('데이터 복원 적용 중 오류가 발생했습니다.', 'error');
          resolve({ valid: false, message: err.message });
        }
      };
      reader.onerror = () => {
        this.showToast('JSON 파일을 읽을 수 없습니다.', 'error');
        resolve({ valid: false, message: '파일 읽기 오류' });
      };
      reader.readAsText(file);
    });
  }

  /**
   * 토스트 알림 메시지 출력
   * @param {string} message
   * @param {'info'|'success'|'error'} [type='info']
   * @param {number} [duration=3500]
   */
  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'error') {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';
    } else if (type === 'success') {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';
    } else {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>';
    }

    toast.innerHTML = `${iconSvg}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px) scale(0.95)';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    }, duration);
  }
}

// 브라우저 DOM 로드 시 앱 인스턴스 생성
window.addEventListener('DOMContentLoaded', () => {
  const app = new PaperStudioApp();
  window.__studioApp = app;
});
