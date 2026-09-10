/**
 * @file app.js
 * @description 축구장 세레모니 제조기 애플리케이션 진입점 및 UI 제어 (Milestone 3 완결)
 * - T03-C03: 이미지 및 문구 편집 도구 초기 노출
 * - T03-C04/C05/C09/C10: 사진 업로드 및 타원형 얼굴 크롭
 * - T03-C06: 문구 세로 위치(Y축) 실시간 조절
 * - T03-C07: 폰트 크기 실시간 조절
 * - T03-C08: 폰트 색상 실시간 조절
 * - T03-C11/C12/C13: 세 화면비(1:1, 4:5, 9:16) 화면 뷰포트와 다운로드 PNG의 100% 일치
 * - T03-C14: 자동 줄바꿈(Word wrap) 로직 연동
 */
import { SceneManager } from './scene-manager.js';
import { CharacterModel } from './character-model.js';
import { FaceCropper } from './face-cropper.js';
import { drawStudioText } from './text-renderer.js';

class App {
  constructor() {
    this.canvas = document.getElementById('three-canvas');
    this.textCanvas = document.getElementById('text-overlay-canvas');
    this.textCtx = this.textCanvas ? this.textCanvas.getContext('2d') : null;
    this.viewportWrapper = document.getElementById('viewport-canvas-wrapper');
    this.viewportContainer = document.getElementById('viewport-container');

    this.sceneManager = null;
    this.character = null;
    this.faceCropper = null;

    // Milestone 3 편집기 상태
    this.state = {
      ratio: '1:1', // '1:1' | '4:5' | '9:16'
      text: '오늘 밤 주인공은 나야 나!',
      fontSize: 48,  // 1080px 기준 기본 폰트 크기
      fontColor: '#ffffff',
      textY: 0.85    // 상단 기준 세로 위치 비율 (85%)
    };

    // 해상도 및 화면비 규격 정의
    this.RATIO_CONFIG = {
      '1:1': { width: 1080, height: 1080, aspect: 1, label: '1080 × 1080 px' },
      '4:5': { width: 1080, height: 1350, aspect: 4 / 5, label: '1080 × 1350 px' },
      '9:16': { width: 1080, height: 1920, aspect: 9 / 16, label: '1080 × 1920 px' }
    };

    this.init();
  }

  init() {
    // 1. Three.js 씬 및 카메라/렌더러 초기화
    this.sceneManager = new SceneManager(this.canvas);

    // 2. 캐릭터 모델 로드 및 씬에 배치
    this.character = new CharacterModel(this.sceneManager.scene);

    // 3. 얼굴 사진 크롭 및 텍스처 추출 엔진 초기화 (Milestone 2)
    this.faceCropper = new FaceCropper({
      onFaceApplied: (texture, dataUrl) => {
        this.character.setFaceTexture(texture);
      },
      onError: (msg) => {
        console.warn('[FaceCropper] 업로드 거부:', msg);
      }
    });

    // 4. UI 이벤트 바인딩
    this.bindUIEvents();

    // 5. 기본 남성 선수 샘플 얼굴 초기 적용
    this.faceCropper.applySampleFace('male');

    // 6. 초기 뷰포트 화면비 및 오버레이 텍스트 세팅
    this.updateViewportAspect('1:1');

    // 7. 자동화 테스트 및 디버깅용 전역 훅 등록
    window.__CEREMONY_APP__ = {
      app: this,
      sceneManager: this.sceneManager,
      character: this.character,
      faceCropper: this.faceCropper,
      state: this.state,
      RATIO_CONFIG: this.RATIO_CONFIG,
      setAspectRatio: (r) => this.updateViewportAspect(r),
      setText: (t) => {
        this.state.text = t;
        const input = document.getElementById('text-caption-input');
        if (input) input.value = t;
        this.redrawOverlayText();
      },
      setFontSize: (s) => {
        this.state.fontSize = s;
        const slider = document.getElementById('text-size-slider');
        const val = document.getElementById('text-size-val');
        if (slider) slider.value = s;
        if (val) val.textContent = `${s}px`;
        this.redrawOverlayText();
      },
      setFontColor: (c) => {
        this.state.fontColor = c;
        const picker = document.getElementById('text-color-picker');
        const val = document.getElementById('text-color-val');
        if (picker) picker.value = c;
        if (val) val.textContent = c.toUpperCase();
        this.redrawOverlayText();
      },
      setTextY: (y) => {
        this.state.textY = y;
        const slider = document.getElementById('text-y-slider');
        const val = document.getElementById('text-y-val');
        if (slider) slider.value = y;
        if (val) val.textContent = `${Math.round(y * 100)}%`;
        this.redrawOverlayText();
      },
      redrawOverlayText: () => this.redrawOverlayText(),
      exportStudioImage: (ratio, triggerDownload) => this.exportStudioImage(ratio, triggerDownload)
    };

    console.info('[Ceremony Maker] Milestone 3 초기화 완료');
  }

  /**
   * 화면비 변경 및 반응형 뷰포트 컨테이너 동기화 (T03-C11~C13)
   * @param {'1:1'|'4:5'|'9:16'} ratio
   */
  updateViewportAspect(ratio = this.state.ratio) {
    this.state.ratio = ratio;
    const config = this.RATIO_CONFIG[ratio] || this.RATIO_CONFIG['1:1'];

    if (this.viewportContainer && this.viewportWrapper) {
      // 뷰포트 내부 여백 및 툴바 높이를 고려한 가용 공간 산출
      const ratioBarH = document.querySelector('.viewport-ratio-bar')?.offsetHeight || 44;
      const availW = Math.max(180, this.viewportContainer.clientWidth - 40);
      const availH = Math.max(180, this.viewportContainer.clientHeight - ratioBarH - 50);
      const targetAspect = config.aspect;

      let w, h;
      if (availW / availH > targetAspect) {
        h = Math.floor(availH);
        w = Math.round(h * targetAspect);
      } else {
        w = Math.floor(availW);
        h = Math.round(w / targetAspect);
      }

      this.viewportWrapper.style.width = `${w}px`;
      this.viewportWrapper.style.height = `${h}px`;
      this.viewportWrapper.dataset.ratio = ratio;

      // 1. Three.js 카메라 및 렌더러 동기화
      if (this.sceneManager) {
        this.sceneManager.resize(w, h);
      }

      // 2. 2D 텍스트 오버레이 캔버스 버퍼 동기화
      if (this.textCanvas) {
        this.textCanvas.width = w;
        this.textCanvas.height = h;
        this.redrawOverlayText();
      }
    }

    // UI 인디케이터 배지 업데이트
    const resBadge = document.getElementById('current-res-badge');
    if (resBadge) resBadge.textContent = config.label;

    const downloadSub = document.getElementById('btn-download-sub');
    if (downloadSub) downloadSub.textContent = `${config.label} (화면 구도 100% 일치)`;

    // 화면비 버튼 활성 토글
    document.querySelectorAll('.btn-ratio').forEach((btn) => {
      const isActive = btn.dataset.ratio === ratio;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  /**
   * 투명 2D 텍스트 오버레이 캔버스 다시 그리기
   */
  redrawOverlayText() {
    if (!this.textCtx || !this.textCanvas) return;
    this.textCtx.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height);
    drawStudioText(this.textCtx, this.textCanvas.width, this.textCanvas.height, {
      text: this.state.text,
      fontSize: this.state.fontSize,
      fontColor: this.state.fontColor,
      textY: this.state.textY
    });
  }

  /**
   * 오프스크린 2D 캔버스 합성 및 고해상도 PNG 다운로드 파이프라인 (T03-C11~C13)
   * - 사용자가 맞춘 현재 3D 카메라 앵글(화각/줌/패닝) 프레임 버퍼를 100% 무왜곡 복제
   * - 2D 문구를 동일한 비례 좌표계로 얹어 다운로드 파일 생성
   * @param {string} [ratio=this.state.ratio]
   * @param {boolean} [triggerDownload=true] - 브라우저 파일 다운로드 다이얼로그 호출 여부
   * @returns {Promise<{blob: Blob, dataUrl: string, width: number, height: number, ratio: string}>}
   */
  async exportStudioImage(ratio = this.state.ratio, triggerDownload = true) {
    const config = this.RATIO_CONFIG[ratio] || this.RATIO_CONFIG['1:1'];
    const targetW = config.width;
    const targetH = config.height;

    // 1. 기준 해상도(1080x1080, 1080x1350, 1080x1920) 오프스크린 캔버스 생성
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = targetW;
    offscreenCanvas.height = targetH;
    const offscreenCtx = offscreenCanvas.getContext('2d');

    // 2. 3D WebGL 씬을 목표 해상도로 1프레임 렌더 후 2D 컨텍스트에 픽셀 전송
    this.sceneManager.renderFrameToCanvas(offscreenCanvas, targetW, targetH);

    // 3. 2D 문구를 1080px 비례 좌표계로 완벽 일치 오버레이
    drawStudioText(offscreenCtx, targetW, targetH, {
      text: this.state.text,
      fontSize: this.state.fontSize,
      fontColor: this.state.fontColor,
      textY: this.state.textY
    });

    // 4. PNG Blob 추출 및 브라우저 다운로드 트리거
    return new Promise((resolve) => {
      offscreenCanvas.toBlob((blob) => {
        const dataUrl = offscreenCanvas.toDataURL('image/png');

        if (triggerDownload) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const ratioClean = ratio.replace(':', '_');
          a.href = url;
          a.download = `ceremony_${ratioClean}_${timestamp}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        resolve({
          blob,
          dataUrl,
          width: targetW,
          height: targetH,
          ratio
        });
      }, 'image/png');
    });
  }

  bindUIEvents() {
    // 0. 화면비 전환 버튼 바인딩 (Milestone 3)
    const ratioButtons = document.querySelectorAll('.btn-ratio');
    ratioButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const selectedRatio = btn.dataset.ratio;
        this.updateViewportAspect(selectedRatio);
      });
    });

    // 1. 고해상도 PNG 다운로드 버튼 바인딩 (Milestone 3)
    const btnDownload = document.getElementById('btn-download-png');
    if (btnDownload) {
      btnDownload.addEventListener('click', async () => {
        btnDownload.disabled = true;
        const originalText = btnDownload.innerHTML;
        btnDownload.innerHTML = '<strong>⏳ PNG 생성 및 저장 중...</strong>';

        try {
          await this.exportStudioImage(this.state.ratio, true);
        } catch (err) {
          console.error('[Download] 이미지 추출 실패:', err);
        } finally {
          btnDownload.disabled = false;
          btnDownload.innerHTML = originalText;
        }
      });
    }

    // 2. 2D 문구 내용 입력창 바인딩 (T03-C03, C14)
    const textInput = document.getElementById('text-caption-input');
    if (textInput) {
      textInput.addEventListener('input', (e) => {
        this.state.text = e.target.value;
        this.redrawOverlayText();
      });
    }

    // 3. 폰트 크기 슬라이더 바인딩 (T03-C07)
    const sizeSlider = document.getElementById('text-size-slider');
    const sizeVal = document.getElementById('text-size-val');
    if (sizeSlider && sizeVal) {
      sizeSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.state.fontSize = val;
        sizeVal.textContent = `${val}px`;
        this.redrawOverlayText();
      });
    }

    // 4. 폰트 색상 피커 및 퀵 스와치 바인딩 (T03-C08)
    const colorPicker = document.getElementById('text-color-picker');
    const colorVal = document.getElementById('text-color-val');
    const swatches = document.querySelectorAll('.swatch-btn');

    if (colorPicker && colorVal) {
      colorPicker.addEventListener('input', (e) => {
        const val = e.target.value;
        this.state.fontColor = val;
        colorVal.textContent = val.toUpperCase();

        swatches.forEach((sw) => {
          sw.classList.toggle('active', sw.dataset.color.toLowerCase() === val.toLowerCase());
        });

        this.redrawOverlayText();
      });
    }

    swatches.forEach((sw) => {
      sw.addEventListener('click', () => {
        const color = sw.dataset.color;
        this.state.fontColor = color;
        if (colorPicker) colorPicker.value = color;
        if (colorVal) colorVal.textContent = color.toUpperCase();

        swatches.forEach((s) => s.classList.remove('active'));
        sw.classList.add('active');

        this.redrawOverlayText();
      });
    });

    // 5. 문구 Y축 위치 슬라이더 및 프리셋 버튼 바인딩 (T03-C06)
    const ySlider = document.getElementById('text-y-slider');
    const yVal = document.getElementById('text-y-val');
    const yPresetBtns = document.querySelectorAll('[data-y]');

    if (ySlider && yVal) {
      ySlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.state.textY = val;
        yVal.textContent = `${Math.round(val * 100)}%`;

        yPresetBtns.forEach((b) => {
          b.classList.toggle('active', Math.abs(parseFloat(b.dataset.y) - val) < 0.02);
        });

        this.redrawOverlayText();
      });
    }

    yPresetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = parseFloat(btn.dataset.y);
        this.state.textY = val;
        if (ySlider) ySlider.value = val;
        if (yVal) yVal.textContent = `${Math.round(val * 100)}%`;

        yPresetBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        this.redrawOverlayText();
      });
    });

    // 6. 얼굴 사진 업로드 & 크롭 관련 이벤트 바인딩 (Milestone 2 보존)
    const btnUpload = document.getElementById('btn-trigger-upload');
    const fileInput = document.getElementById('face-file-input');
    if (btnUpload && fileInput) {
      btnUpload.addEventListener('click', () => {
        fileInput.click();
      });
    }

    const btnRecrop = document.getElementById('btn-recrop-face');
    if (btnRecrop) {
      btnRecrop.addEventListener('click', () => {
        this.faceCropper.openReCrop();
      });
    }

    const btnSampleMale = document.getElementById('btn-sample-male');
    if (btnSampleMale) {
      btnSampleMale.addEventListener('click', () => {
        this.faceCropper.applySampleFace('male');
      });
    }

    const btnSampleFemale = document.getElementById('btn-sample-female');
    if (btnSampleFemale) {
      btnSampleFemale.addEventListener('click', () => {
        this.faceCropper.applySampleFace('female');
      });
    }

    // 7. 포즈 프리셋 버튼 바인딩
    const poseButtons = document.querySelectorAll('[data-pose]');
    poseButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const poseName = btn.dataset.pose;
        this.character.applyPose(poseName);

        poseButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // 8. 스킨 스왑 버튼 바인딩
    const skinButtons = document.querySelectorAll('[data-skin]');
    skinButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const skinName = btn.dataset.skin;
        this.character.applySkin(skinName);

        skinButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // 9. 대두(Bobblehead) 슬라이더 바인딩
    const headSlider = document.getElementById('head-scale-slider');
    const headScaleVal = document.getElementById('head-scale-val');
    if (headSlider && headScaleVal) {
      headSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.character.setHeadScale(val);
        headScaleVal.textContent = `${val.toFixed(1)}x`;
      });
    }

    // 10. 카메라 뷰 프리셋 및 리셋 버튼 바인딩 (front, side, top, low, closeup)
    const camButtons = document.querySelectorAll('[data-cam]');
    camButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const camMode = btn.dataset.cam;
        this.sceneManager.setCameraView(camMode);

        camButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // 11. 윈도우 리사이즈 시 반응형 뷰포트 및 텍스트 갱신
    window.addEventListener('resize', () => {
      this.updateViewportAspect(this.state.ratio);
    });
  }
}

// DOM 준비 완료 시 구동
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
