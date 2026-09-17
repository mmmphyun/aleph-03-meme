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

    // 라벨 상태 설정 (기본값)
    this.state = {
      text: '찢겨진 종이 위에 남긴\n영감의 한 줄 ✂️✨',
      fontSize: 42,             // 캔버스 픽셀 기준 (18 ~ 84)
      fontColor: '#1a1c20',     // 폰트 색상
      paperColor: '#fbf8ef',    // 메모지 배경 톤
      posX: 0.0,                // 3D 공간 X
      posY: -1.2,               // 3D 공간 Y
      posZ: 0.45,               // Z-Stack 최상단 높이
      scale: 1.0,               // 전체 크기 배율
      baseWidth: 3.8,           // 3D 세계 폭
      baseHeight: 1.8,          // 3D 세계 높이
      roughness: 0.08,
      seed: 88192
    };

    // 2D 오프스크린 캔버스 (고해상도 텍스처 렌더링용: 1024x512)
    this.canvasWidth = 1024;
    this.canvasHeight = 512;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;
    this.ctx = this.canvas.getContext('2d');

    this.texture = null;
    this.mesh = null;

    this._initMesh();
    this.renderCanvas();
  }

  /**
   * 3D 메모지 메쉬 초기화 및 씬 추가
   * @private
   */
  _initMesh() {
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    // 찢긴 사각형 메쉬 생성
    this.mesh = createTornPaperMesh(
      'rectangle',
      {
        width: this.state.baseWidth,
        height: this.state.baseHeight,
        roughness: this.state.roughness,
        detail: 70,
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
    this.mesh.scale.set(this.state.scale, this.state.scale, 1);

    this.mesh.userData = {
      id: 'layer_memo_label',
      name: '찢겨진 메모지 라벨',
      isMemoLabel: true,
      zIndex: this.state.posZ
    };

    // 씬에 추가
    this.sceneManager.addPaperMesh(this.mesh, this.state.posZ);
  }

  /**
   * 오프스크린 2D 캔버스에 찢긴 종이 질감 배경 및 텍스트 렌더링
   */
  renderCanvas() {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    ctx.clearRect(0, 0, w, h);

    // 1. 메모지 배경색 칠하기
    ctx.fillStyle = this.state.paperColor;
    ctx.fillRect(0, 0, w, h);

    // 2. 미세 종이 펄프 섬유 질감 및 노이즈
    this._drawPaperPulpTexture(ctx, w, h);

    // 3. 은은한 메모지 모눈/가이드 라인 (연한 격자 느낌)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.04)';
    ctx.lineWidth = 1;
    const gridStep = 48;
    for (let y = gridStep; y < h; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 4. 텍스트 렌더링 (줄바꿈, 이모지 및 다채로운 특수문자 지원)
    this._drawWrappedText(ctx, w, h);

    // 5. CanvasTexture 갱신
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
   * @private
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w
   * @param {number} h
   */
  _drawWrappedText(ctx, w, h) {
    const text = this.state.text !== undefined && this.state.text !== null ? String(this.state.text) : '';
    let fontSize = this.state.fontSize;
    const paddingX = 70;
    const paddingY = 40;
    const maxTextWidth = w - paddingX * 2;
    const maxTextHeight = h - paddingY * 2;

    // 빈 텍스트인 경우 배경만 남김 (T03-C14 빈 문구 대응)
    if (text.trim().length === 0) {
      return;
    }

    // 텍스트 줄바꿈 및 높이 계산 헬퍼
    const layoutLines = (size) => {
      ctx.font = `600 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif`;
      const lineHeight = Math.round(size * 1.45);
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

    // 140px 등 초거대 폰트나 다중 줄바꿈/긴 문장 시 캔버스 상하를 초과하지 않도록 적응형 스케일 다운
    let layout = layoutLines(fontSize);
    while (layout.totalHeight > maxTextHeight && fontSize > 14) {
      fontSize = Math.max(12, Math.floor(fontSize * 0.88));
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
      this.mesh.scale.set(this.state.scale, this.state.scale, 1);
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
    if (this.mesh) {
      this.mesh.position.set(this.state.posX, this.state.posY, this.state.posZ);
      this.mesh.scale.set(this.state.scale, this.state.scale, 1);
    }
    this.renderCanvas();
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
