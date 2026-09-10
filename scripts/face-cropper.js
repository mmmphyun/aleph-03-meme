/**
 * @file face-cropper.js
 * @description 사진 업로드 유효성 검증, 타원형 얼굴 크롭 모달 UI 및 Three.js 텍스처 생성기
 * - T03-C04: PNG 이미지 불러오기 지원
 * - T03-C05: JPEG 이미지 불러오기 지원
 * - T03-C09: 지원하지 않는 파일 업로드 시 기존 작업 유지
 * - T03-C10: 지원하지 않는 파일의 명확한 거부 이유 표시
 * - 타원형 가이드 마스크 오버레이 및 마우스 드래그(이동)/휠·슬라이더(확대·축소) 인터랙션
 * - 512×512 정방형 텍스처 추출 및 THREE.CanvasTexture 즉시 매핑
 * - 샘플 얼굴 2종(남/여) 프리셋 탑재
 */
import * as THREE from 'three';

export class FaceCropper {
  /**
   * @param {Object} options
   * @param {Function} options.onFaceApplied - 텍스처 추출 완료 시 콜백 (texture, dataUrl)
   * @param {Function} options.onError - 유효하지 않은 파일 에러 콜백 (msg)
   */
  constructor(options = {}) {
    this.onFaceApplied = options.onFaceApplied || (() => {});
    this.onError = options.onError || (() => {});

    // 상태값
    this.currentImage = null; // HTMLImageElement
    this.currentImageSrc = null; // DataURL or ObjectURL
    this.currentFaceDataUrl = null;
    this.currentTexture = null;

    // 크롭 조작 상태
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1.0;
    this.baseScale = 1.0;
    this.minScale = 0.2;
    this.maxScale = 5.0;

    // DOM 요소 캐시
    this.modalEl = document.getElementById('face-crop-modal');
    this.cropCanvas = document.getElementById('crop-canvas');
    this.cropCtx = this.cropCanvas ? this.cropCanvas.getContext('2d') : null;
    this.zoomSlider = document.getElementById('crop-zoom-slider');
    this.zoomValLabel = document.getElementById('crop-zoom-val');
    this.fileInput = document.getElementById('face-file-input');
    this.errorAlertBox = document.getElementById('face-error-alert');
    this.currentFaceThumb = document.getElementById('current-face-thumb');

    // 타원 가이드 규격 (캔버스 뷰포트 기준: 400x400)
    this.guideRadiusX = 120; // 타원 가로 반경
    this.guideRadiusY = 155; // 타원 세로 반경

    this.init();
  }

  /**
   * 이벤트 리스너 등록 및 초기 설정
   */
  init() {
    this.bindFileInput();
    this.bindModalEvents();
  }

  /**
   * 파일 인풋 및 드래그 앤 드롭 업로드 유효성 검사 바인딩
   */
  bindFileInput() {
    if (!this.fileInput) return;

    this.fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      this.processFile(file);
      // 동일 파일 재선택 가능하도록 인풋 리셋
      this.fileInput.value = '';
    });
  }

  /**
   * 파일 MIME 타입 및 확장자 엄격 검증 (T03-C04, C05, C09, C10)
   * @param {File} file
   * @returns {boolean} 유효 여부
   */
  validateFile(file) {
    if (!file) return false;

    const validMimes = ['image/png', 'image/jpeg'];
    const validExtensions = ['.png', '.jpg', '.jpeg'];

    const fileName = file.name || '';
    const fileExt = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    const mimeType = file.type || '';

    // 1. MIME 타입 또는 확장자 일치 확인
    const isMimeValid = validMimes.includes(mimeType);
    const isExtValid = validExtensions.includes(fileExt);

    if (!isMimeValid && !isExtValid) {
      const displayType = mimeType || fileExt || '알 수 없는 형식';
      const errorMsg = `지원하지 않는 파일 형식입니다. (선택 파일: "${fileName}", 형식: ${displayType})\nPNG 및 JPEG 이미지만 업로드 가능합니다.`;
      this.showError(errorMsg);
      return false;
    }

    return true;
  }

  /**
   * 거부 에러 메시지 알림 (T03-C10)
   * 기존 작업은 전혀 손상되지 않음 (T03-C09)
   */
  showError(message) {
    if (this.errorAlertBox) {
      this.errorAlertBox.textContent = message;
      this.errorAlertBox.style.display = 'block';
      this.errorAlertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      // 5초 후 자동 숨김
      clearTimeout(this._errorTimer);
      this._errorTimer = setTimeout(() => {
        this.errorAlertBox.style.display = 'none';
      }, 5000);
    }

    this.onError(message);
  }

  /**
   * 에러 알림 숨기기
   */
  hideError() {
    if (this.errorAlertBox) {
      this.errorAlertBox.style.display = 'none';
    }
  }

  /**
   * 파일 읽기 및 크롭 모달 호출
   */
  processFile(file) {
    this.hideError();

    // 검증 실패 시 기존 작업 유지하고 거부 (T03-C09, C10)
    if (!this.validateFile(file)) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this.loadImage(e.target.result);
    };
    reader.onerror = () => {
      this.showError('파일을 읽는 도중 오류가 발생했습니다.');
    };
    reader.readAsDataURL(file);
  }

  /**
   * 이미지 로드 후 크롭 모달 열기
   */
  loadImage(src) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.currentImage = img;
      this.currentImageSrc = src;
      this.resetCropTransform();
      this.openModal();
    };
    img.onerror = () => {
      this.showError('이미지 데이터를 파싱할 수 없습니다.');
    };
    img.src = src;
  }

  /**
   * 크롭 변환 상태(이동, 줌) 초기화
   */
  resetCropTransform() {
    if (!this.currentImage) return;

    this.offsetX = 0;
    this.offsetY = 0;

    // 타원 가이드(가로 240, 세로 310)를 충분히 채우도록 기본 스케일 계산
    const guideW = this.guideRadiusX * 2;
    const guideH = this.guideRadiusY * 2;
    const scaleX = guideW / this.currentImage.width;
    const scaleY = guideH / this.currentImage.height;

    // 타원 가이드를 덮는 최적 맞춤 배율
    this.baseScale = Math.max(scaleX, scaleY) * 1.15;
    this.scale = this.baseScale;

    if (this.zoomSlider) {
      this.zoomSlider.value = '1.0';
    }
    if (this.zoomValLabel) {
      this.zoomValLabel.textContent = '1.0x';
    }

    this.renderCropCanvas();
  }

  /**
   * 크롭 모달 이벤트 바인딩
   */
  bindModalEvents() {
    if (!this.cropCanvas) return;

    // 1. 마우스 드래그 이동
    this.cropCanvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStartX = e.clientX - this.offsetX;
      this.dragStartY = e.clientY - this.offsetY;
      this.cropCanvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.offsetX = e.clientX - this.dragStartX;
      this.offsetY = e.clientY - this.dragStartY;
      this.renderCropCanvas();
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        if (this.cropCanvas) this.cropCanvas.style.cursor = 'grab';
      }
    });

    // 2. 마우스 휠 줌
    this.cropCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      this.setZoom(this.scale * zoomFactor);
    }, { passive: false });

    // 3. 줌 슬라이더
    if (this.zoomSlider) {
      this.zoomSlider.addEventListener('input', (e) => {
        const factor = parseFloat(e.target.value);
        this.scale = this.baseScale * factor;
        if (this.zoomValLabel) {
          this.zoomValLabel.textContent = `${factor.toFixed(1)}x`;
        }
        this.renderCropCanvas();
      });
    }

    // 4. 모달 버튼들 (적용, 취소, 리셋)
    const applyBtn = document.getElementById('btn-apply-crop');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        this.applyCrop();
      });
    }

    const cancelBtn = document.getElementById('btn-cancel-crop');
    const closeBtn = document.getElementById('btn-close-crop-modal');
    const closeModal = () => this.closeModal();

    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    const resetBtn = document.getElementById('btn-reset-crop-view');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.resetCropTransform();
      });
    }
  }

  /**
   * 줌 배율 설정
   */
  setZoom(newScale) {
    const minS = this.baseScale * 0.4;
    const maxS = this.baseScale * 4.0;
    this.scale = Math.max(minS, Math.min(maxS, newScale));

    const sliderFactor = this.scale / this.baseScale;
    if (this.zoomSlider) {
      this.zoomSlider.value = sliderFactor.toFixed(2);
    }
    if (this.zoomValLabel) {
      this.zoomValLabel.textContent = `${sliderFactor.toFixed(1)}x`;
    }

    this.renderCropCanvas();
  }

  /**
   * 크롭 모달 캔버스 렌더링
   */
  renderCropCanvas() {
    if (!this.cropCtx || !this.currentImage) return;

    const ctx = this.cropCtx;
    const w = this.cropCanvas.width;
    const h = this.cropCanvas.height;
    const cx = w / 2;
    const cy = h / 2;

    // 배경 지우기
    ctx.clearRect(0, 0, w, h);

    // 1. 이미지 그리기 (이동 및 스케일 적용)
    ctx.save();
    ctx.translate(cx + this.offsetX, cy + this.offsetY);
    ctx.scale(this.scale, this.scale);
    ctx.drawImage(this.currentImage, -this.currentImage.width / 2, -this.currentImage.height / 2);
    ctx.restore();

    // 2. 타원형 가이드라인 오버레이 렌더링
    // 타원 외부는 반투명 어두운 마스크로 덮고, 내부는 투명하게 뚫음
    ctx.save();
    ctx.fillStyle = 'rgba(10, 15, 29, 0.65)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    // 반대 방향 타원 패스로 구멍 뚫기
    ctx.ellipse(cx, cy, this.guideRadiusX, this.guideRadiusY, 0, Math.PI * 2, 0, true);
    ctx.fill();

    // 3. 타원형 가이드 점선 테두리
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, this.guideRadiusX, this.guideRadiusY, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 4. 눈/코/입 가이드라인 (미세 십자선)
    ctx.strokeStyle = 'rgba(88, 166, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);

    // 눈높이 수평 가이드선 (상단 42% 지점)
    const eyeGuideY = cy - 25;
    ctx.beginPath();
    ctx.moveTo(cx - this.guideRadiusX * 0.75, eyeGuideY);
    ctx.lineTo(cx + this.guideRadiusX * 0.75, eyeGuideY);
    ctx.stroke();

    // 중심 수직 가이드선
    ctx.beginPath();
    ctx.moveTo(cx, cy - this.guideRadiusY * 0.85);
    ctx.lineTo(cx, cy + this.guideRadiusY * 0.85);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * [얼굴 적용] 클릭 시 512×512 정방형 텍스처 추출 및 마네킹 머리에 매핑
   */
  applyCrop() {
    if (!this.currentImage) return;

    // 1. 512x512 고해상도 오프스크린 캔버스 생성
    const outCanvas = document.createElement('canvas');
    outCanvas.width = 512;
    outCanvas.height = 512;
    const outCtx = outCanvas.getContext('2d');

    const outCx = 256;
    const outCy = 256;

    // 모달 뷰포트(400x400) -> 추출 캔버스(512x512) 스케일 비율
    const ratio = 512 / this.cropCanvas.width;

    // 2. 마네킹 기본 피부톤 배경
    outCtx.fillStyle = '#e6dfd5';
    outCtx.fillRect(0, 0, 512, 512);

    // 3. 사용자 조작(이동, 확대)이 정확히 반영된 이미지 렌더링
    outCtx.save();
    outCtx.translate(outCx + this.offsetX * ratio, outCy + this.offsetY * ratio);
    outCtx.scale(this.scale * ratio, this.scale * ratio);
    outCtx.drawImage(this.currentImage, -this.currentImage.width / 2, -this.currentImage.height / 2);
    outCtx.restore();

    // 4. 가장자리 부드러운 블렌딩 (마네킹 두상 플라스틱과 자연스럽게 융합)
    outCtx.save();
    const grad = outCtx.createRadialGradient(outCx, outCy, 190, outCx, outCy, 255);
    grad.addColorStop(0, 'rgba(230, 223, 213, 0)');
    grad.addColorStop(0.85, 'rgba(230, 223, 213, 0.4)');
    grad.addColorStop(1, 'rgba(230, 223, 213, 0.95)');
    outCtx.fillStyle = grad;
    outCtx.fillRect(0, 0, 512, 512);
    outCtx.restore();

    // 5. 텍스처 및 DataURL 추출
    const dataUrl = outCanvas.toDataURL('image/png');
    this.currentFaceDataUrl = dataUrl;

    const texture = new THREE.CanvasTexture(outCanvas);
    texture.needsUpdate = true;
    this.currentTexture = texture;

    // 6. 썸네일 업데이트
    if (this.currentFaceThumb) {
      this.currentFaceThumb.src = dataUrl;
    }

    // 7. 콜백 호출
    this.onFaceApplied(texture, dataUrl);

    // 8. 모달 닫기
    this.closeModal();
  }

  /**
   * 샘플 얼굴 2종(남/여) 프리셋 직접 적용
   * @param {'male'|'female'} gender
   */
  applySampleFace(gender = 'male') {
    const fileName = gender === 'female' ? 'sample_face_female.png' : 'sample_face_male.png';
    const sampleUrl = `assets/samples/${fileName}`;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.currentImage = img;
      this.currentImageSrc = sampleUrl;
      this.resetCropTransform();

      // 샘플 얼굴은 타원 가이드에 정밀 설계되어 있으므로 즉시 크롭 적용
      this.applyCrop();
    };
    img.onerror = () => {
      this.showError(`샘플 얼굴(${fileName}) 로드 실패`);
    };
    img.src = sampleUrl;
  }

  /**
   * 현재 얼굴 다시 자르기 (재크롭)
   */
  openReCrop() {
    if (this.currentImage) {
      this.openModal();
    } else {
      // 기본 남성 샘플로 크롭 모달 열기
      this.loadImage('assets/samples/sample_face_male.png');
    }
  }

  /**
   * 모달 열기
   */
  openModal() {
    if (this.modalEl) {
      this.modalEl.style.display = 'flex';
      this.renderCropCanvas();
    }
  }

  /**
   * 모달 닫기
   */
  closeModal() {
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
  }
}
