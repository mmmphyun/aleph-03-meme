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
    this.shapeType = 'polygon'; // 'polygon' | 'rectangle' | 'circle'
    this.roughness = 0.075;

    this.isOpen = false;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.dragCurrent = { x: 0, y: 0 };

    // 자유 올가미(Lasso) 트레이싱 포인트 배열 (정규화 비율 0.0 ~ 1.0: {x, y})
    this.lassoPoints = [];

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
                  <button type="button" class="shape-toggle-btn active" data-shape="polygon">
                    <span class="shape-icon lasso-icon"></span>
                    <span>자유 올가미 찢기 (Lasso Tracing)</span>
                  </button>
                  <button type="button" class="shape-toggle-btn" data-shape="rectangle">
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
                  <div class="crop-info-row" id="crop-info-pts-row" style="display: none;">
                    <span>트레이싱 포인트:</span>
                    <span id="crop-info-pts">0개</span>
                  </div>
                </div>
              </div>

              <!-- 가이드 안내 문구 -->
              <div class="crop-guide-note" id="crop-guide-note-text">
                마우스로 피사체 둘레를 자유롭게 둘러 그리세요.<br>
                마우스를 떼면 자동으로 시작점과 끝점이 닫히며 자연스러운 찢김 단면이 3D 팝업 조각으로 추출됩니다.
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

        // 가이드 안내 텍스트 동적 갱신
        const guideEl = document.getElementById('crop-guide-note-text');
        if (guideEl) {
          if (this.shapeType === 'polygon') {
            guideEl.innerHTML = '마우스로 피사체 둘레를 자유롭게 둘러 그리세요.<br>마우스를 떼면 자동으로 시작점과 끝점이 닫히며 자연스러운 찢김 단면이 3D 팝업 조각으로 추출됩니다.';
          } else if (this.shapeType === 'circle') {
            guideEl.innerHTML = '드래그하여 원형 찢긴 스티커 영역을 선택하세요.<br>원형 둘레가 자연스러운 섬유 노이즈와 함께 찢겨져 3D 씬에 추가됩니다.';
          } else {
            guideEl.innerHTML = '드래그하여 사각형 찢긴 종이 영역을 선택하세요.<br>선택된 4개 변이 거칠게 찢겨지며 3D 씬에 새로운 레이어로 추가됩니다.';
          }
        }

        // 형태 전환 시 기존 올가미 패스 초기화
        if (this.shapeType === 'polygon' && this.lassoPoints.length < 3) {
          this._initDefaultPolygon();
        }
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
        if (this.shapeType === 'polygon') {
          this.lassoPoints = [
            { x: 0.05, y: 0.05 },
            { x: 0.95, y: 0.05 },
            { x: 0.95, y: 0.95 },
            { x: 0.05, y: 0.95 }
          ];
        }
        this.renderCanvas();
      });
    }

    const resetBtn = document.getElementById('btn-crop-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.cropNorm = { x: 0.15, y: 0.15, w: 0.7, h: 0.7 };
        if (this.shapeType === 'polygon') {
          this._initDefaultPolygon();
        }
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
   * 기본 다각형(타원형 16각형) 초기화
   * @private
   */
  _initDefaultPolygon() {
    this.lassoPoints = [];
    const cx = 0.5;
    const cy = 0.5;
    const rx = 0.28;
    const ry = 0.28;
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const theta = (i / steps) * Math.PI * 2;
      this.lassoPoints.push({
        x: Number((cx + rx * Math.cos(theta)).toFixed(4)),
        y: Number((cy + ry * Math.sin(theta)).toFixed(4))
      });
    }
    this._updateBoundsFromLasso();
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

    if (this.currentImage !== image) {
      this.currentPunchedCanvas = null;
    }
    this.currentImage = image;
    this.isOpen = true;
    this.modalEl.classList.add('active');

    this.cropNorm = { x: 0.15, y: 0.15, w: 0.7, h: 0.7 };
    this._initDefaultPolygon();

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
    const normX = x / rect.width;
    const normY = y / rect.height;

    this.isDragging = true;
    this.dragStart = { x: normX, y: normY };
    this.dragCurrent = { ...this.dragStart };

    if (this.shapeType === 'polygon') {
      // 신규 자유 올가미(Lasso) 드래그 시작: 이전 궤적 초기화 및 첫 포인트 등록
      this.lassoPoints = [{ x: normX, y: normY }];
    }

    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch (_) {}

    this.renderCanvas();
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
    const normX = x / rect.width;
    const normY = y / rect.height;

    this.dragCurrent = { x: normX, y: normY };

    if (this.shapeType === 'polygon') {
      // 이전 포인트와 일정 픽셀 이상 이동 시에만 새 포인트 등록 (노이즈 방지 및 최적화)
      const lastPt = this.lassoPoints[this.lassoPoints.length - 1];
      if (lastPt) {
        const dx = (normX - lastPt.x) * rect.width;
        const dy = (normY - lastPt.y) * rect.height;
        if (Math.hypot(dx, dy) >= 3.0) {
          this.lassoPoints.push({ x: normX, y: normY });
        }
      } else {
        this.lassoPoints.push({ x: normX, y: normY });
      }
      this._updateBoundsFromLasso();
    } else {
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
    }

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

    if (this.shapeType === 'polygon') {
      // 포인트가 3개 미만이면 기본 다각형으로 안전 복구
      if (this.lassoPoints.length < 3) {
        this._initDefaultPolygon();
      } else {
        this._updateBoundsFromLasso();
      }
    }

    this.renderCanvas();
  }

  /**
   * 올가미 포인트들의 바운딩 박스를 계산하여 cropNorm 동기화
   * @private
   */
  _updateBoundsFromLasso() {
    if (!this.lassoPoints || this.lassoPoints.length === 0) return;

    let minX = 1.0;
    let minY = 1.0;
    let maxX = 0.0;
    let maxY = 0.0;

    for (const pt of this.lassoPoints) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }

    const w = Math.max(0.02, maxX - minX);
    const h = Math.max(0.02, maxY - minY);

    this.cropNorm = {
      x: Math.max(0, Math.min(minX, 1 - w)),
      y: Math.max(0, Math.min(minY, 1 - h)),
      w: Math.min(w, 1),
      h: Math.min(h, 1)
    };
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
    ctx.fillStyle = 'rgba(10, 12, 16, 0.68)';
    ctx.fillRect(0, 0, w, h);

    // 3. 선택 영역 클리핑 복원
    const cropPixelX = this.cropNorm.x * w;
    const cropPixelY = this.cropNorm.y * h;
    const cropPixelW = this.cropNorm.w * w;
    const cropPixelH = this.cropNorm.h * h;

    ctx.save();
    ctx.beginPath();

    if (this.shapeType === 'polygon') {
      if (this.lassoPoints && this.lassoPoints.length > 1) {
        ctx.moveTo(this.lassoPoints[0].x * w, this.lassoPoints[0].y * h);
        for (let i = 1; i < this.lassoPoints.length; i++) {
          ctx.lineTo(this.lassoPoints[i].x * w, this.lassoPoints[i].y * h);
        }
        ctx.closePath();
      } else {
        ctx.rect(cropPixelX, cropPixelY, cropPixelW, cropPixelH);
      }
    } else if (this.shapeType === 'circle') {
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

    // 4. 선택 영역 테두리 가이드라인 시각화
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#38bdf8';
    ctx.setLineDash([6, 4]);

    ctx.beginPath();
    if (this.shapeType === 'polygon') {
      if (this.lassoPoints && this.lassoPoints.length > 0) {
        ctx.moveTo(this.lassoPoints[0].x * w, this.lassoPoints[0].y * h);
        for (let i = 1; i < this.lassoPoints.length; i++) {
          ctx.lineTo(this.lassoPoints[i].x * w, this.lassoPoints[i].y * h);
        }
        if (!this.isDragging && this.lassoPoints.length >= 3) {
          ctx.closePath();
        }
        ctx.stroke();

        // 트레이싱 시작점 및 현재점 하이라이트
        if (this.lassoPoints.length > 0) {
          const first = this.lassoPoints[0];
          ctx.setLineDash([]);
          ctx.fillStyle = '#22c55e'; // 시작점 녹색
          ctx.beginPath();
          ctx.arc(first.x * w, first.y * h, 4.5, 0, Math.PI * 2);
          ctx.fill();

          if (this.isDragging) {
            const last = this.lassoPoints[this.lassoPoints.length - 1];
            ctx.fillStyle = '#f43f5e'; // 드래그 중인 끝점 적색
            ctx.beginPath();
            ctx.arc(last.x * w, last.y * h, 4.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    } else if (this.shapeType === 'circle') {
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
    const ptsRow = document.getElementById('crop-info-pts-row');
    const ptsEl = document.getElementById('crop-info-pts');

    if (posEl) posEl.textContent = `${realX}, ${realY}`;
    if (sizeEl) sizeEl.textContent = `${realW} × ${realH} px`;

    if (ptsRow && ptsEl) {
      if (this.shapeType === 'polygon') {
        ptsRow.style.display = 'flex';
        ptsEl.textContent = `${this.lassoPoints ? this.lassoPoints.length : 0}개`;
      } else {
        ptsRow.style.display = 'none';
      }
    }
  }

  /**
   * [찢긴 조각 3D 추가] 확인 시 텍스처 추출 및 데이터 반환
   * @private
   */
  _handleConfirm() {
    if (!this.currentImage) return;

    const origW = this.currentImage.naturalWidth;
    const origH = this.currentImage.naturalHeight;

    // 바운딩 박스 정규화 범위 및 픽셀 좌표 계산
    let minX = this.cropNorm.x;
    let minY = this.cropNorm.y;
    let maxX = this.cropNorm.x + this.cropNorm.w;
    let maxY = this.cropNorm.y + this.cropNorm.h;

    let sx = Math.max(0, Math.round(minX * origW));
    let sy = Math.max(0, Math.round(minY * origH));
    let sw = Math.min(origW - sx, Math.round((maxX - minX) * origW));
    let sh = Math.min(origH - sy, Math.round((maxY - minY) * origH));

    if (sw < 16 || sh < 16) {
      alert('크롭 영역이 너무 작습니다. 영역을 더 크게 선택해주세요.');
      return;
    }

    if (this.shapeType === 'circle') {
      const minSize = Math.min(sw, sh);
      sw = minSize;
      sh = minSize;
    }

    // 1. 오프스크린 캔버스에 바운딩 박스 영역 정밀 크롭
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = sw;
    cropCanvas.height = sh;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(this.currentImage, sx, sy, sw, sh, 0, 0, sw, sh);

    // 2. Three.js CanvasTexture 생성
    const texture = new THREE.CanvasTexture(cropCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    // 3. 3D 월드 크기 및 종횡비 계산
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

    // 4. 원본 이미지 중심 기준의 상대 중심 (centerOffset: -0.5 ~ +0.5)
    // 원본 이미지 가로세로 비율 고려 3D 매핑 시 사용
    const centerNormX = (minX + maxX) / 2;
    const centerNormY = (minY + maxY) / 2;
    const centerOffset = {
      x: Number((centerNormX - 0.5).toFixed(4)),
      y: Number((centerNormY - 0.5).toFixed(4))
    };

    // 5. 다각형인 경우 바운딩 박스 기준의 상대 정규화 포인트 변환 (0.0 ~ 1.0)
    let relativePoints = [];
    if (this.shapeType === 'polygon' && this.lassoPoints && this.lassoPoints.length >= 3) {
      const bw = Math.max(1e-6, maxX - minX);
      const bh = Math.max(1e-6, maxY - minY);
      relativePoints = this.lassoPoints.map(pt => ({
        x: Number(((pt.x - minX) / bw).toFixed(4)),
        y: Number(((pt.y - minY) / bh).toFixed(4))
      }));
    }

    const radius = 1.35;
    const seed = Math.floor(Math.random() * 100000);

    // 6. 원본 사진 2D Canvas 복제 후 잘라낸 영역을 destination-out으로 지워내어 구멍(Hole/Punchout) 뚫린 배경 텍스처 캔버스 생성
    const punchedBgCanvas = document.createElement('canvas');
    punchedBgCanvas.width = origW;
    punchedBgCanvas.height = origH;
    const bgCtx = punchedBgCanvas.getContext('2d');

    // 이전 크롭 내역 누적 지원 또는 원본 이미지 복제
    if (this.currentPunchedCanvas && this.currentPunchedImage === this.currentImage) {
      bgCtx.drawImage(this.currentPunchedCanvas, 0, 0);
    } else {
      bgCtx.drawImage(this.currentImage, 0, 0, origW, origH);
    }

    bgCtx.save();
    bgCtx.globalCompositeOperation = 'destination-out';
    bgCtx.beginPath();

    if (this.shapeType === 'polygon' && this.lassoPoints && this.lassoPoints.length >= 3) {
      bgCtx.moveTo(this.lassoPoints[0].x * origW, this.lassoPoints[0].y * origH);
      for (let i = 1; i < this.lassoPoints.length; i++) {
        bgCtx.lineTo(this.lassoPoints[i].x * origW, this.lassoPoints[i].y * origH);
      }
      bgCtx.closePath();
      bgCtx.fill();
    } else if (this.shapeType === 'circle') {
      const cx = sx + sw / 2;
      const cy = sy + sh / 2;
      const r = Math.min(sw, sh) / 2;
      bgCtx.arc(cx, cy, r, 0, Math.PI * 2);
      bgCtx.fill();
    } else {
      bgCtx.rect(sx, sy, sw, sh);
      bgCtx.fill();
    }
    bgCtx.restore();

    // 구멍 난 테두리에 흰색 찢김 종이 섬유 림(White Torn Hole Rim) 렌더링
    bgCtx.save();
    bgCtx.strokeStyle = 'rgba(247, 245, 240, 0.95)';
    bgCtx.lineWidth = Math.max(3, Math.round(origW * 0.006));
    bgCtx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    bgCtx.shadowBlur = 4;
    bgCtx.beginPath();

    if (this.shapeType === 'polygon' && this.lassoPoints && this.lassoPoints.length >= 3) {
      bgCtx.moveTo(this.lassoPoints[0].x * origW, this.lassoPoints[0].y * origH);
      for (let i = 1; i < this.lassoPoints.length; i++) {
        bgCtx.lineTo(this.lassoPoints[i].x * origW, this.lassoPoints[i].y * origH);
      }
      bgCtx.closePath();
      bgCtx.stroke();
    } else if (this.shapeType === 'circle') {
      const cx = sx + sw / 2;
      const cy = sy + sh / 2;
      const r = Math.min(sw, sh) / 2;
      bgCtx.arc(cx, cy, r, 0, Math.PI * 2);
      bgCtx.stroke();
    } else {
      bgCtx.strokeRect(sx, sy, sw, sh);
    }
    bgCtx.restore();

    const result = {
      texture,
      cropCanvas,
      textureCanvas: cropCanvas,
      punchedBgCanvas,
      shapeType: this.shapeType,
      roughness: this.roughness,
      seed,
      width: Number(worldW.toFixed(2)),
      height: Number(worldH.toFixed(2)),
      radius: radius,
      aspectRatio: Number(aspect.toFixed(3)),
      points: relativePoints,
      lassoPoints: this.lassoPoints ? this.lassoPoints.map(pt => ({ x: pt.x, y: pt.y })) : [],
      uvBounds: {
        minX: Number(minX.toFixed(4)),
        minY: Number(minY.toFixed(4)),
        maxX: Number(maxX.toFixed(4)),
        maxY: Number(maxY.toFixed(4))
      },
      centerOffset: centerOffset,
      cropRect: { sx, sy, sw, sh, origW, origH },
      sourceImage: this.currentImage
    };

    this.close();
    this.onAddPiece(result);
  }
}

