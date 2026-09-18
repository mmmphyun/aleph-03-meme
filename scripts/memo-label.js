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
      text: '찢겨진 종이 위에 남긴\n영감의 한 줄 ✂️✨',
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

    // 초기 기동 시 완전한 백지 상태 유지를 위해 씬에 미리 추가하지 않음 (autoAddToScene: false)
    const autoAddToScene = options.autoAddToScene ?? false;
    this._initMesh(autoAddToScene);
    this.renderCanvas();
  }

  /**
   * 텍스트 실제 바운딩 크기 및 상하좌우 20% 여백을 기반으로 3D 월드 크기 동적 연산
   * @private
   */
  _updateTightDimensions() {
    const text = this.state.text !== undefined && this.state.text !== null ? String(this.state.text) : '';
    const fontSize = this.state.fontSize || 34;

    if (text.trim().length === 0) {
      this.computedWidth = 1.2;
      this.computedHeight = 0.6;
      this.state.width = this.computedWidth;
      this.state.height = this.computedHeight;
      return;
    }

    const lines = text.split('\n');
    let maxLineWidth = 0;

    // 임시 컨텍스트 폰트 설정 후 줄별 실제 텍스트 폭 정밀 측정
    this.ctx.save();
    this.ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif`;
    for (const line of lines) {
      const metrics = this.ctx.measureText(line);
      if (metrics.width > maxLineWidth) {
        maxLineWidth = metrics.width;
      }
    }
    this.ctx.restore();

    const lineHeight = Math.round(fontSize * 1.35);
    const lineCount = Math.max(1, lines.length);
    const totalTextHeight = lineCount * lineHeight;

    // 상하좌우 20% 여백(Padding)만 남기고 딱 맞게 감싸는 여백 픽셀 (텍스트가 약 70% 차지하도록 1.4배)
    const paddedPixelW = Math.max(24, maxLineWidth * 1.40);
    const paddedPixelH = Math.max(24, totalTextHeight * 1.40);

    // 캔버스 픽셀을 3D 월드 단위로 정밀 환산
    // "KING KEV" 2줄 ("KING\nKEV", 4글자, 2줄) 기준:
    // paddedPixelW ≈ 130px -> 월드 폭 약 1.4
    // paddedPixelH ≈ 129px -> 월드 높이 약 0.8
    const rawWorldW = paddedPixelW * 0.0105;
    const rawWorldH = paddedPixelH * 0.0062;

    this.computedWidth = Number(Math.max(0.8, Math.min(4.5, rawWorldW)).toFixed(2));
    this.computedHeight = Number(Math.max(0.5, Math.min(3.2, rawWorldH)).toFixed(2));

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
      name: '📝 텍스트 메모지',
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

    const targetW = this.computedWidth;
    const targetH = this.computedHeight;
    const aspect = targetW / targetH;

    // 1. 캔버스 해상도를 3D 종이 비율에 완벽히 동기화 (텍스처 왜곡/비틀림 원천 방지)
    const baseH = 512;
    const baseW = Math.max(256, Math.min(1536, Math.round(baseH * aspect)));
    if (this.canvas.width !== baseW || this.canvas.height !== baseH) {
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

    // 4. 은은한 메모지 모눈/가이드 라인 (정사각형 격자)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.035)';
    ctx.lineWidth = 1;
    const gridStep = 44;
    for (let x = gridStep; x < w; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = gridStep; y < h; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 5. 텍스트 렌더링 (상하좌우 20% 여백 영역을 고려한 중앙 맞춤)
    this._drawWrappedText(ctx, w, h);

    // 6. 3D 메쉬 스케일 즉시 동기화 (지오메트리 재생성 없는 안전한 scale.set으로 무한 루프 원천 방지)
    if (this.mesh) {
      this.mesh.scale.set(this.computedWidth * this.state.scale, this.computedHeight * this.state.scale, 1);
      this.mesh.userData.width = this.computedWidth;
      this.mesh.userData.height = this.computedHeight;
    }

    // 7. CanvasTexture 갱신
    if (this.texture) {
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
   * 긴 문장 자동 줄바꿈(Word wrap) 및 이모지 지원 텍스트 렌더링
   * 상하좌우 20% 여백(Padding)을 남기고 중앙 영역에 딱 맞게 정렬
   * @private
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w
   * @param {number} h
   */
  _drawWrappedText(ctx, w, h) {
    const text = this.state.text !== undefined && this.state.text !== null ? String(this.state.text) : '';
    let fontSize = this.state.fontSize;
    const paddingX = Math.round(w * 0.18);
    const paddingY = Math.round(h * 0.18);
    const maxTextWidth = Math.max(40, w - paddingX * 2);
    const maxTextHeight = Math.max(30, h - paddingY * 2);

    // 빈 텍스트인 경우 배경만 남김 (T03-C14 빈 문구 대응)
    if (text.trim().length === 0) {
      return;
    }

    // 텍스트 줄바꿈 및 높이 계산 헬퍼
    const layoutLines = (size) => {
      ctx.font = `600 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif`;
      const lineHeight = Math.round(size * 1.35);
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
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxTextWidth && currentLine.length > 0) {
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
      return { lines, lineHeight, totalHeight: lines.length * lineHeight };
    };

    // 캔버스 크기에 비례하여 텍스트 영역이 상하좌우 20% 여백 내에 꼭 맞도록 폰트 자동 스케일
    let layout = layoutLines(fontSize);
    while ((layout.totalHeight > maxTextHeight || layout.lines.some(l => ctx.measureText(l).width > maxTextWidth)) && fontSize > 14) {
      fontSize = Math.max(12, Math.floor(fontSize * 0.90));
      layout = layoutLines(fontSize);
    }

    const { lines, lineHeight, totalHeight } = layout;

    // 폰트 스타일 최종 설정
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif`;
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
