/**
 * @file memo-label.js
 * @description 찢겨진 메모지 텍스트 라벨 엔진 (2D 오프스크린 Canvas + THREE.CanvasTexture + 3D 메쉬)
 * - 한글 문장 자동 줄바꿈(Word Wrap)
 * - 이모지 및 특수문자 완벽 렌더링 지원 (T03-C14)
 * - 텍스트, 폰트 크기, 폰트 색상, 메모지 X/Y 위치 및 크기 실시간 조절 (T03-C06 ~ T03-C08)
 * - 최상단 Z-Stack에 위치하여 하위 조각들에 입체 그림자 투영
 */

import * as THREE from 'three';
import { createTornPaperMesh } from './torn-geometry.js';

export class MemoLabelEngine {
  /**
   * @param {Object} options
   * @param {import('./scene-manager.js').SceneManager} options.sceneManager
   * @param {Function} [options.onUpdate] - 라벨 상태 변경 시 콜백
   */
  constructor(options = {}) {
    this.sceneManager = options.sceneManager;
    this.onUpdate = options.onUpdate || (() => {});

    // 라벨 상태 설정 (기본값: 텍스트에 맞춘 동적 콤팩트 크기)
    this.state = {
      text: '손끝으로 찢어낸 종이에\n새겨 넣은 생각 한 줄',
      fontSize: 34,             // 캔버스 픽셀 기준 (18 ~ 84)
      fontColor: '#1a1c20',     // 폰트 색상
      paperColor: '#fbf8ef',    // 메모지 배경 톤
      posX: 0.0,                // 3D 공간 X
      posY: -0.6,               // 3D 공간 Y
      posZ: 0.45,               // Z-Stack 최상단 높이
      scale: 1.0,               // 사용자 지정 배율
      baseWidth: 1.0,           // 기본 단위 지오메트리 폭
      baseHeight: 1.0,          // 기본 단위 지오메트리 높이
      width: 1.4,               // 동적 계산 3D 가로 크기
      height: 0.8,              // 동적 계산 3D 세로 크기
      roughness: 0.075,
      seed: 88192
    };

    this.computedWidth = 1.4;
    this.computedHeight = 0.8;

    // 2D 오프스크린 캔버스 (고해상도 텍스처 렌더링용)
    this.canvasWidth = 768;
    this.canvasHeight = 512;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;
    this.ctx = this.canvas.getContext('2d');

    this.texture = null;
    this.mesh = null;

    // 텍스트 바운딩 크기 사전 연산
    this._updateTightDimensions();

    // 웹 폰트(Pretendard) 로딩 완료 시 정확한 메트릭스로 재렌더링
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        this.renderCanvas();
      }).catch(() => {});
    }

    // 초기 기동 시 완전한 백지 상태 유지를 위해 씬에 미리 추가하지 않음 (autoAddToScene: false)
    const autoAddToScene = options.autoAddToScene ?? false;
    this._initMesh(autoAddToScene);
    this.renderCanvas();
  }

  /**
   * 가용 픽셀 너비를 초과하는 긴 텍스트를 줄단위로 자동 분할(Word Wrap)
   * @private
   * @param {string} text
   * @param {number} fontSize
   * @param {number} [maxWidth=460]
   * @returns {string[]}
   */
  _wrapLines(text, fontSize, maxWidth = 460) {
    if (!text || text.trim().length === 0) return [];

    this.ctx.save();
    this.ctx.font = `600 ${fontSize}px "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;

    const rawParagraphs = text.split('\n');
    const lines = [];

    for (const para of rawParagraphs) {
      if (para.length === 0) {
        lines.push('');
        continue;
      }

      let currentLine = '';
      const chars = Array.from(para);

      for (let i = 0; i < chars.length; i++) {
        const testLine = currentLine + chars[i];
        const metrics = this.ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = chars[i];
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine.length > 0) {
        lines.push(currentLine);
      }
    }
    this.ctx.restore();
    return lines;
  }

  /**
   * 텍스트 실제 바운딩 크기 및 상하좌우 여백을 기반으로 3D 월드 크기 동적 연산
   * @private
   */
  _updateTightDimensions() {
    const text = this.state.text !== undefined && this.state.text !== null ? String(this.state.text) : '';
    const fontSize = this.state.fontSize || 34;

    if (text.trim().length === 0) {
      this.computedWidth = 1.2;
      this.computedHeight = 0.6;
      this.paddedPixelW = 160;
      this.paddedPixelH = 80;
      this.effectiveFontSize = fontSize;
      this.wrappedLines = [];
      this.state.width = this.computedWidth;
      this.state.height = this.computedHeight;
      return;
    }

    // 3D 씬 및 뷰포트 내 안전 최대 가용 규격 (최대 폭 3.45 유닛, 최대 높이 3.15 유닛)
    const maxPixelW = 460;
    const maxPixelH = 420;

    let effectiveFontSize = fontSize;
    let lines = this._wrapLines(text, effectiveFontSize, maxPixelW);
    let lineHeight = Math.round(effectiveFontSize * 1.35);
    let totalTextHeight = lines.length * lineHeight;

    // 초장문/다중 개행 시 캔버스 상하 초과를 방지하기 위해 폰트 크기를 단계적 축소 (T03-C14, T03-C15)
    while (totalTextHeight > (maxPixelH - Math.round(effectiveFontSize * 1.3)) && effectiveFontSize > 11) {
      effectiveFontSize = Math.max(11, Math.floor(effectiveFontSize * 0.90));
      lines = this._wrapLines(text, effectiveFontSize, maxPixelW);
      lineHeight = Math.round(effectiveFontSize * 1.35);
      totalTextHeight = lines.length * lineHeight;
    }

    // 폰트가 최소치(11px)에 도달한 극단 초장문의 경우 가용 높이 내 표시 가능한 줄 수로 클리핑
    const maxVisibleLines = Math.max(1, Math.floor((maxPixelH - 30) / lineHeight));
    if (lines.length > maxVisibleLines) {
      lines = lines.slice(0, maxVisibleLines);
      totalTextHeight = lines.length * lineHeight;
    }

    this.effectiveFontSize = effectiveFontSize;
    this.wrappedLines = lines;

    let maxLineWidth = 0;
    this.ctx.save();
    this.ctx.font = `600 ${effectiveFontSize}px "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", "Malgun Gothic", sans-serif`;
    for (const line of lines) {
      const metrics = this.ctx.measureText(line);
      if (metrics.width > maxLineWidth) {
        maxLineWidth = metrics.width;
      }
    }
    this.ctx.restore();

    const paddingX = Math.round(effectiveFontSize * 0.9);
    const paddingY = Math.round(effectiveFontSize * 0.65);
    this.paddedPixelW = Math.min(maxPixelW, Math.max(80, maxLineWidth + paddingX * 2));
    this.paddedPixelH = Math.min(maxPixelH, Math.max(50, totalTextHeight + paddingY * 2));

    // 캔버스 픽셀을 3D 월드 단위로 1:1 정방 비례 환산
    const worldScaleFactor = 0.0075;
    this.computedWidth = Number((this.paddedPixelW * worldScaleFactor).toFixed(3));
    this.computedHeight = Number((this.paddedPixelH * worldScaleFactor).toFixed(3));

    this.state.width = this.computedWidth;
    this.state.height = this.computedHeight;
  }

  /**
   * 3D 메모지 메쉬 초기화 (autoAddToScene이 true일 때만 씬에 배치)
   * @param {boolean} [addToScene=false]
   * @private
   */
  _initMesh(addToScene = false) {
    if (!this.texture) {
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.generateMipmaps = true;
      this.texture.minFilter = THREE.LinearMipmapLinearFilter;
      this.texture.magFilter = THREE.LinearFilter;
      this.texture.colorSpace = THREE.SRGBColorSpace;
    }

    // 기본 단위 사각형 메쉬 (1.0 x 1.0) 생성 후 scale로 비례 조정
    this.mesh = createTornPaperMesh(
      'rectangle',
      {
        width: 1.0,
        height: 1.0,
        roughness: this.state.roughness,
        detail: 50,
        seed: this.state.seed,
        extrudeOptions: {
          depth: 0.035,
          bevelEnabled: true,
          bevelThickness: 0.006,
          bevelSize: 0.006
        }
      },
      {
        map: this.texture,
        roughness: 0.85,
        metalness: 0.02
      }
    );

    this.mesh.position.set(this.state.posX, this.state.posY, this.state.posZ);
    this.mesh.scale.set(this.computedWidth * this.state.scale, this.computedHeight * this.state.scale, 1);
    this.mesh.visible = addToScene;

    this.mesh.userData = {
      id: 'layer_memo_label',
      name: '텍스트 메모지',
      isMemoLabel: true,
      shapeType: 'rectangle',
      width: this.computedWidth,
      height: this.computedHeight,
      zIndex: this.state.posZ
    };

    if (addToScene && this.sceneManager) {
      this.sceneManager.addPaperMesh(this.mesh, this.state.posZ);
    }
  }

  /**
   * 메모지 메쉬를 씬에 활성화 및 표시
   */
  show() {
    if (!this.mesh) {
      this._initMesh(true);
    } else {
      this.mesh.visible = true;
      if (this.sceneManager && !this.sceneManager.layers.includes(this.mesh)) {
        this.sceneManager.addPaperMesh(this.mesh, this.state.posZ);
      }
    }
  }

  /**
   * 메모지 메쉬를 씬에서 비활성화 및 숨김
   */
  hide() {
    if (this.mesh) {
      this.mesh.visible = false;
      if (this.sceneManager) {
        this.sceneManager.removePaperMesh(this.mesh);
      }
    }
  }

  /**
   * 씬 표시 여부 확인
   * @returns {boolean}
   */
  isVisible() {
    return Boolean(this.mesh && this.mesh.visible && this.sceneManager && this.sceneManager.layers.includes(this.mesh));
  }

  /**
   * 오프스크린 2D 캔버스에 찢긴 종이 질감 배경 및 텍스트 렌더링
   */
  renderCanvas() {
    this._updateTightDimensions();

    const text = this.state.text !== undefined && this.state.text !== null ? String(this.state.text) : '';
    const paddedPixelW = this.paddedPixelW || 160;
    const paddedPixelH = this.paddedPixelH || 80;

    // 1. 선명한 텍스처를 위한 고해상도(2x) 캔버스 버퍼
    const dpr = 2;
    const baseW = Math.round(paddedPixelW * dpr);
    const baseH = Math.round(paddedPixelH * dpr);

    const sizeChanged = (this.canvas.width !== baseW || this.canvas.height !== baseH);
    if (sizeChanged) {
      this.canvas.width = baseW;
      this.canvas.height = baseH;
      this.canvasWidth = baseW;
      this.canvasHeight = baseH;
    }

    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    ctx.clearRect(0, 0, w, h);

    // 2. 메모지 배경색 칠하기
    ctx.fillStyle = this.state.paperColor;
    ctx.fillRect(0, 0, w, h);

    // 3. 미세 종이 펄프 섬유 질감 및 노이즈
    this._drawPaperPulpTexture(ctx, w, h);

    // 4. 사용자가 지정한 fontSize를 존중하여 정방향 렌더링
    this._drawWrappedText(ctx, w, h, dpr);

    // 5. 3D 메쉬 스케일 즉시 동기화
    if (this.mesh) {
      this.mesh.scale.set(this.computedWidth * this.state.scale, this.computedHeight * this.state.scale, 1);
      this.mesh.userData.width = this.computedWidth;
      this.mesh.userData.height = this.computedHeight;
    }

    // 6. CanvasTexture 갱신 (캔버스 크기가 변경된 경우 WebGL2 immutable storage 충돌 방지를 위해 텍스처 안전 재할당)
    if (sizeChanged && this.texture) {
      this.texture.dispose();
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.generateMipmaps = true;
      this.texture.minFilter = THREE.LinearMipmapLinearFilter;
      this.texture.magFilter = THREE.LinearFilter;
      this.texture.colorSpace = THREE.SRGBColorSpace;
      if (this.mesh && this.mesh.material) {
        this.mesh.material.map = this.texture;
        this.mesh.material.needsUpdate = true;
      }
    } else if (this.texture) {
      this.texture.needsUpdate = true;
    }
  }

  /**
   * 미세 종이 펄프 섬유 질감 패턴 생성
   * @private
   */
  _drawPaperPulpTexture(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.025)';
    for (let i = 0; i < 400; i++) {
      const rx = Math.random() * w;
      const ry = Math.random() * h;
      const rw = Math.random() * 3 + 1;
      const rh = Math.random() * 2 + 1;
      ctx.fillRect(rx, ry, rw, rh);
    }
    ctx.restore();
  }

  /**
   * 사용자 폰트 크기를 유지하며 줄바꿈 및 이모지를 지원하는 텍스트 렌더링
   * @private
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w
   * @param {number} h
   * @param {number} [dpr=1]
   */
  _drawWrappedText(ctx, w, h, dpr = 1) {
    const text = this.state.text !== undefined && this.state.text !== null ? String(this.state.text) : '';
    // 빈 텍스트인 경우 배경만 남김 (T03-C14 빈 문구 대응)
    if (text.trim().length === 0) {
      return;
    }

    const effectiveFontSize = this.effectiveFontSize || this.state.fontSize || 34;
    const fontSize = effectiveFontSize * dpr;
    const lines = this.wrappedLines || this._wrapLines(text, effectiveFontSize, 460);
    const lineHeight = Math.round(fontSize * 1.35);
    const totalHeight = lines.length * lineHeight;

    // 폰트 스타일 최종 설정 (Pretendard 통합 폰트 사용)
    ctx.font = `600 ${fontSize}px "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.fillStyle = this.state.fontColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 수직 중앙 정렬 배치
    let startY = (h - totalHeight) / 2 + lineHeight / 2;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > 0) {
        ctx.fillText(line, w / 2, startY + i * lineHeight);
      }
    }
  }

  /**
   * 텍스트 변경 (T03-C03, T03-C14)
   * @param {string} text
   */
  setText(text) {
    this.state.text = text;
    this.renderCanvas();
    this.onUpdate(this.state);
  }

  /**
   * 폰트 크기 변경 (T03-C07)
   * @param {number} size
   */
  setFontSize(size) {
    this.state.fontSize = Math.max(12, Math.min(140, size));
    this.renderCanvas();
    this.onUpdate(this.state);
  }

  /**
   * 폰트 색상 변경 (T03-C08)
   * @param {string} color
   */
  setFontColor(color) {
    this.state.fontColor = color;
    this.renderCanvas();
    this.onUpdate(this.state);
  }

  /**
   * 메모지 3D 위치 변경 (X, Y) (T03-C06)
   * @param {number} x
   * @param {number} y
   */
  setPosition(x, y) {
    this.state.posX = Number(x.toFixed(2));
    this.state.posY = Number(y.toFixed(2));
    if (this.mesh) {
      this.mesh.position.x = this.state.posX;
      this.mesh.position.y = this.state.posY;
    }
    this.onUpdate(this.state);
  }

  /**
   * 메모지 3D 크기 비율 조절 (T03-C06)
   * @param {number} scale
   */
  setScale(scale) {
    this.state.scale = Number(scale.toFixed(2));
    if (this.mesh) {
      this.mesh.scale.set(this.computedWidth * this.state.scale, this.computedHeight * this.state.scale, 1);
    }
    this.onUpdate(this.state);
  }

  /**
   * 상태 객체 직렬화 (JSON 템플릿 저장용)
   */
  toJSON() {
    return { ...this.state };
  }

  /**
   * 상태 복원 (JSON 템플릿 로드용)
   * @param {Object} data
   */
  fromJSON(data) {
    if (!data) return;
    Object.assign(this.state, data);
    this.renderCanvas();
    if (this.mesh) {
      this.mesh.position.set(this.state.posX, this.state.posY, this.state.posZ);
      this.mesh.scale.set(this.computedWidth * this.state.scale, this.computedHeight * this.state.scale, 1);
    }
    this.onUpdate(this.state);
  }

  /**
   * 자원 정리
   */
  dispose() {
    if (this.mesh) {
      this.sceneManager.removePaperMesh(this.mesh);
      this.mesh = null;
    }
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
  }
}
