/**
 * @file crop-tool.js
 * @description 단일 이미지 상에서 원하는 영역을 사각/원형으로 드래그 지정하고 CanvasTexture 및 찢긴 종이 메쉬 파라미터를 추출하는 크롭 도구 모달
 */

import * as THREE from 'three';

export class CropTool {
  /**
   * @param {Object} options
   * @param {(data: Object) => void} options.onAddPiece - 조각 추가 완료 시 콜백
   */
  constructor(options = {}) {
    this.onAddPiece = options.onAddPiece || (() => {});

    this.currentImage = null;
    this.shapeType = 'rectangle'; // 'rectangle' | 'circle'
    this.roughness = 0.075;

    this.isOpen = false;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.dragCurrent = { x: 0, y: 0 };

    // 정규화된 크롭 영역 (0.0 ~ 1.0)
    this.cropNorm = { x: 0.15, y: 0.15, w: 0.7, h: 0.7 };

    this._createDOM();
    this._bindEvents();
  }

  /**
   * 크롭 모달 DOM 구성
   * @private
   */
  _createDOM() {
    let modalEl = document.getElementById('crop-modal-overlay');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'crop-modal-overlay';
      modalEl.className = 'crop-modal-overlay';
      modalEl.innerHTML = `
        <div class="crop-modal-container" role="dialog" aria-modal="true" aria-labelledby="crop-modal-title">
          <!-- 모달 헤더 -->
          <div class="crop-modal-header">
            <div class="crop-modal-header-title">
              <svg class="crop-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M17 15h2V7c0-1.1-.9-2-2-2H9v2h8v8zM7 17V1H5v4H1v2h4v10c0 1.1.9 2 2 2h10v4h2v-4h4v-2H7z"/>
              </svg>
              <h2 id="crop-modal-title">찢긴 종이 조각 크롭 도구</h2>
            </div>
            <button type="button" id="btn-crop-close" class="modal-close-btn" aria-label="닫기">
              &times;
            </button>
          </div>

          <!-- 모달 바디: 캔버스 작업 영역 -->
          <div class="crop-modal-body">
            <div class="crop-canvas-wrapper" id="crop-canvas-wrapper">
              <canvas id="crop-editor-canvas"></canvas>
            </div>

            <!-- 제어 패널 -->
            <div class="crop-control-panel">
              <!-- 형태 선택 -->
              <div class="crop-panel-section">
                <span class="crop-section-label">크롭 형태 선택</span>
                <div class="crop-shape-toggle-group">
                  <button type="button" class="shape-toggle-btn active" data-shape="rectangle">
                    <span class="shape-icon rect-icon"></span>
                    <span>사각형 (찢긴 종이)</span>
                  </button>
                  <button type="button" class="shape-toggle-btn" data-shape="circle">
                    <span class="shape-icon circle-icon"></span>
                    <span>원형 (찢긴 스티커)</span>
                  </button>
                </div>
              </div>

              <!-- 찢김 거칠기 조절 -->
              <div class="crop-panel-section">
                <div class="crop-slider-header">
                  <label for="crop-slider-roughness">단면 거칠기 (Roughness)</label>
                  <span id="crop-val-roughness" class="crop-slider-val">0.075</span>
                </div>
                <input type="range" id="crop-slider-roughness" min="0.01" max="0.18" step="0.005" value="0.075">
              </div>

              <!-- 크롭 정보 HUD -->
              <div class="crop-panel-section">
                <span class="crop-section-label">선택 영역 정보</span>
                <div class="crop-info-box">
                  <div class="crop-info-row">
                    <span>좌표 (X, Y):</span>
                    <span id="crop-info-pos">0, 0</span>
                  </div>
                  <div class="crop-info-row">
                    <span>크기 (W &times; H):</span>
                    <span id="crop-info-size">0 &times; 0 px</span>
                  </div>
                </div>
              </div>

              <!-- 가이드 안내 문구 -->
              <div class="crop-guide-note">
                드래그하여 원하는 이미지 영역을 선택하세요.<br>
                선택된 영역의 외곽선이 절차적 노이즈로 거칠게 찢겨지며 3D 씬에 새로운 레이어로 추가됩니다.
              </div>
            </div>
          </div>

          <!-- 모달 풋터 액션 버튼 -->
          <div class="crop-modal-footer">
            <div class="footer-left">
              <button type="button" id="btn-crop-select-all" class="secondary-btn">
                전체 영역 선택
              </button>
              <button type="button" id="btn-crop-reset" class="secondary-btn">
                기본 선택 리셋
              </button>
            </div>
            <div class="footer-right">
              <button type="button" id="btn-crop-cancel" class="cancel-btn">
                취소
              </button>
              <button type="button" id="btn-crop-confirm" class="primary-action-btn">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
                <span>찢긴 조각 3D 추가</span>
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modalEl);
    }

    this.modalEl = modalEl;
    this.canvas = document.getElementById('crop-editor-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.wrapper = document.getElementById('crop-canvas-wrapper');
  }

  /**
   * 이벤트 바인딩
   * @private
   */
  _bindEvents() {
    const closeBtn = document.getElementById('btn-crop-close');
    const cancelBtn = document.getElementById('btn-crop-cancel');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.close());

    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        this.close();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape') {
        this.close();
      }
    });

    const shapeButtons = this.modalEl.querySelectorAll('.shape-toggle-btn');
    shapeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        shapeButtons.forEach(b => b.classList.remove('active'));
        const targetBtn = e.currentTarget;
        targetBtn.classList.add('active');
        this.shapeType = targetBtn.getAttribute('data-shape');
        this.renderCanvas();
      });
    });

    const roughnessSlider = document.getElementById('crop-slider-roughness');
    const roughnessVal = document.getElementById('crop-val-roughness');
    if (roughnessSlider) {
      roughnessSlider.addEventListener('input', (e) => {
        this.roughness = parseFloat(e.target.value);
        if (roughnessVal) roughnessVal.textContent = this.roughness.toFixed(3);
        this.renderCanvas();
      });
    }

    const selectAllBtn = document.getElementById('btn-crop-select-all');
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        this.cropNorm = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
        this.renderCanvas();
      });
    }

    const resetBtn = document.getElementById('btn-crop-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.cropNorm = { x: 0.15, y: 0.15, w: 0.7, h: 0.7 };
        this.renderCanvas();
      });
    }

    const confirmBtn = document.getElementById('btn-crop-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this._handleConfirm());
    }

    this.canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    window.addEventListener('pointermove', (e) => this._onPointerMove(e));
    window.addEventListener('pointerup', (e) => this._onPointerUp(e));

    window.addEventListener('resize', () => {
      if (this.isOpen) {
        this._fitCanvasSize();
        this.renderCanvas();
      }
    });
  }

  /**
   * 이미지 객체를 받아 크롭 모달 열기
   * @param {HTMLImageElement} image
   */
  openWithImage(image) {
    if (!image || !image.naturalWidth || !image.naturalHeight) {
      console.error('[CropTool] 유효하지 않은 이미지 객체입니다.');
      return;
    }

    this.currentImage = image;
    this.isOpen = true;
    this.modalEl.classList.add('active');

    this.cropNorm = { x: 0.15, y: 0.15, w: 0.7, h: 0.7 };

    requestAnimationFrame(() => {
      this._fitCanvasSize();
      this.renderCanvas();
    });
  }

  /**
   * 모달 닫기
   */
  close() {
    this.isOpen = false;
    this.modalEl.classList.remove('active');
    this.isDragging = false;
  }

  /**
   * 래퍼 크기에 맞춰 캔버스 해상도 및 CSS 크기 설정
   * @private
   */
  _fitCanvasSize() {
    if (!this.currentImage || !this.wrapper) return;

    const wrapW = this.wrapper.clientWidth || 600;
    const wrapH = this.wrapper.clientHeight || 450;
    const imgW = this.currentImage.naturalWidth;
    const imgH = this.currentImage.naturalHeight;

    const imgAspect = imgW / imgH;
    const wrapAspect = wrapW / wrapH;

    let drawW, drawH;
    if (imgAspect > wrapAspect) {
      drawW = Math.min(wrapW, imgW);
      drawH = drawW / imgAspect;
    } else {
      drawH = Math.min(wrapH, imgH);
      drawW = drawH * imgAspect;
    }

    this.canvas.width = Math.round(drawW);
    this.canvas.height = Math.round(drawH);
    this.canvas.style.width = `${this.canvas.width}px`;
    this.canvas.style.height = `${this.canvas.height}px`;
  }

  /**
   * 포인터 다운 이벤트 핸들러
   * @private
   */
  _onPointerDown(e) {
    if (!this.isOpen || !this.currentImage) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    this.isDragging = true;
    this.dragStart = { x: x / rect.width, y: y / rect.height };
    this.dragCurrent = { ...this.dragStart };

    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  /**
   * 포인터 이동 이벤트 핸들러
   * @private
   */
  _onPointerMove(e) {
    if (!this.isDragging) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    this.dragCurrent = { x: x / rect.width, y: y / rect.height };

    const minX = Math.min(this.dragStart.x, this.dragCurrent.x);
    const minY = Math.min(this.dragStart.y, this.dragCurrent.y);
    const w = Math.abs(this.dragCurrent.x - this.dragStart.x);
    const h = Math.abs(this.dragCurrent.y - this.dragStart.y);

    let finalW = w;
    let finalH = h;
    if (this.shapeType === 'circle') {
      const size = Math.max(w, h);
      finalW = size;
      finalH = size;
    }

    this.cropNorm = {
      x: Math.max(0, Math.min(minX, 1 - finalW)),
      y: Math.max(0, Math.min(minY, 1 - finalH)),
      w: Math.max(0.04, Math.min(finalW, 1)),
      h: Math.max(0.04, Math.min(finalH, 1))
    };

    this.renderCanvas();
  }

  /**
   * 포인터 업 이벤트 핸들러
   * @private
   */
  _onPointerUp(e) {
    if (!this.isDragging) return;
    this.isDragging = false;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}
    this.renderCanvas();
  }

  /**
   * 에디터 캔버스 렌더링
   */
  renderCanvas() {
    if (!this.isOpen || !this.currentImage) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // 1. 원본 이미지 그리기
    ctx.drawImage(this.currentImage, 0, 0, w, h);

    // 2. 어두운 오버레이 딤 처리
    ctx.save();
    ctx.fillStyle = 'rgba(10, 12, 16, 0.65)';
    ctx.fillRect(0, 0, w, h);

    // 3. 선택 영역 클리핑 복원
    const cropPixelX = this.cropNorm.x * w;
    const cropPixelY = this.cropNorm.y * h;
    const cropPixelW = this.cropNorm.w * w;
    const cropPixelH = this.cropNorm.h * h;

    ctx.save();
    ctx.beginPath();
    if (this.shapeType === 'circle') {
      const cx = cropPixelX + cropPixelW / 2;
      const cy = cropPixelY + cropPixelH / 2;
      const radius = Math.min(cropPixelW, cropPixelH) / 2;
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    } else {
      ctx.rect(cropPixelX, cropPixelY, cropPixelW, cropPixelH);
    }
    ctx.clip();

    ctx.drawImage(this.currentImage, 0, 0, w, h);
    ctx.restore();

    // 4. 선택 영역 테두리 가이드라인
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#3b82f6';
    ctx.setLineDash([6, 4]);

    ctx.beginPath();
    if (this.shapeType === 'circle') {
      const cx = cropPixelX + cropPixelW / 2;
      const cy = cropPixelY + cropPixelH / 2;
      const radius = Math.min(cropPixelW, cropPixelH) / 2;
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy);
      ctx.lineTo(cx + 8, cy);
      ctx.moveTo(cx, cy - 8);
      ctx.lineTo(cx, cy + 8);
      ctx.stroke();
    } else {
      ctx.strokeRect(cropPixelX, cropPixelY, cropPixelW, cropPixelH);
      this._drawCornerHandles(ctx, cropPixelX, cropPixelY, cropPixelW, cropPixelH);
    }

    ctx.restore();

    // 5. 정보 HUD 갱신
    this._updateHUDInfo();
  }

  /**
   * 사각형 모서리 핸들 시각화
   * @private
   */
  _drawCornerHandles(ctx, x, y, w, h) {
    const handleSize = 7;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);

    const corners = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h]
    ];

    corners.forEach(([cx, cy]) => {
      ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
      ctx.strokeRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
    });
  }

  /**
   * HUD 정보창 좌표/크기 갱신
   * @private
   */
  _updateHUDInfo() {
    if (!this.currentImage) return;

    const origW = this.currentImage.naturalWidth;
    const origH = this.currentImage.naturalHeight;

    const realX = Math.round(this.cropNorm.x * origW);
    const realY = Math.round(this.cropNorm.y * origH);
    const realW = Math.round(this.cropNorm.w * origW);
    const realH = Math.round(this.cropNorm.h * origH);

    const posEl = document.getElementById('crop-info-pos');
    const sizeEl = document.getElementById('crop-info-size');

    if (posEl) posEl.textContent = `${realX}, ${realY}`;
    if (sizeEl) sizeEl.textContent = `${realW} × ${realH} px`;
  }

  /**
   * [찢긴 조각 3D 추가] 확인 시 텍스처 추출 및 데이터 반환
   * @private
   */
  _handleConfirm() {
    if (!this.currentImage) return;

    const origW = this.currentImage.naturalWidth;
    const origH = this.currentImage.naturalHeight;

    let sx = Math.max(0, Math.round(this.cropNorm.x * origW));
    let sy = Math.max(0, Math.round(this.cropNorm.y * origH));
    let sw = Math.min(origW - sx, Math.round(this.cropNorm.w * origW));
    let sh = Math.min(origH - sy, Math.round(this.cropNorm.h * origH));

    if (sw < 16 || sh < 16) {
      alert('크롭 영역이 너무 작습니다. 영역을 더 크게 선택해주세요.');
      return;
    }

    if (this.shapeType === 'circle') {
      const minSize = Math.min(sw, sh);
      sw = minSize;
      sh = minSize;
    }

    // 1. 오프스크린 캔버스에 선택 영역 정밀 복사
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = sw;
    cropCanvas.height = sh;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(this.currentImage, sx, sy, sw, sh, 0, 0, sw, sh);

    // 2. Three.js CanvasTexture 생성
    const texture = new THREE.CanvasTexture(cropCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    // 3. 3D 월드 크기 계산
    const aspect = sw / sh;
    let worldW = 3.2;
    let worldH = 3.2 / aspect;

    if (worldH > 4.2) {
      worldH = 4.2;
      worldW = worldH * aspect;
    } else if (worldW > 4.5) {
      worldW = 4.5;
      worldH = worldW / aspect;
    }

    const radius = 1.35;
    const seed = Math.floor(Math.random() * 100000);

    const result = {
      texture,
      cropCanvas,
      shapeType: this.shapeType,
      roughness: this.roughness,
      seed,
      width: Number(worldW.toFixed(2)),
      height: Number(worldH.toFixed(2)),
      radius: radius,
      cropRect: { sx, sy, sw, sh, origW, origH }
    };

    this.close();
    this.onAddPiece(result);
  }
}
