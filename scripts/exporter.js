/**
 * @file exporter.js
 * @description 뷰파인더 클리핑 고해상도 PNG 캡처 및 내보내기 파이프라인
 * - T03-C11: 1:1 미리보기 뷰파인더 영역과 내려받은 파일(1080x1080) 100% 일치
 * - T03-C12: 4:5 미리보기 뷰파인더 영역과 내려받은 파일(1080x1350) 100% 일치
 * - T03-C13: 9:16 미리보기 뷰파인더 영역과 내려받은 파일(1080x1920) 100% 일치
 * - 사용자가 마우스로 돌려 맞춘 3D 카메라 앵글 시점 그대로 오프스크린 렌더링 버퍼에서 뷰파인더 영역만 정확히 크롭
 * - canvas.toBlob('image/png') 다운로드
 */

export class Exporter {
  /**
   * @param {Object} options
   * @param {import('./scene-manager.js').SceneManager} options.sceneManager
   * @param {HTMLElement} options.viewfinderElement - 뷰포트 내 뷰파인더 프레임 DOM 요소
   */
  constructor(options = {}) {
    this.sceneManager = options.sceneManager;
    this.viewfinderElement = options.viewfinderElement;

    // 표준 내보내기 해상도 정의 (인스타그램/SNS 규격 1080p 기반)
    this.resolutions = {
      '1:1': { width: 1080, height: 1080, label: '정사각형 (1:1)' },
      '4:5': { width: 1080, height: 1350, label: '세로 피드 (4:5)' },
      '9:16': { width: 1080, height: 1920, label: '스토리/릴스 (9:16)' }
    };
  }

  /**
   * 현재 뷰파인더의 뷰포트 기준 정규화/픽셀 좌표 영역 계산
   * @returns {{x: number, y: number, width: number, height: number, normX: number, normY: number, normW: number, normH: number}}
   */
  getViewfinderBounds() {
    if (!this.viewfinderElement || !this.sceneManager.container) {
      return null;
    }

    const containerRect = this.sceneManager.container.getBoundingClientRect();
    const vfRect = this.viewfinderElement.getBoundingClientRect();

    const x = vfRect.left - containerRect.left;
    const y = vfRect.top - containerRect.top;
    const width = vfRect.width;
    const height = vfRect.height;

    return {
      x,
      y,
      width,
      height,
      normX: x / containerRect.width,
      normY: y / containerRect.height,
      normW: width / containerRect.width,
      normH: height / containerRect.height
    };
  }

  /**
   * 뷰파인더 영역과 100% 일치하는 고해상도 PNG 캡처 및 다운로드
   *
   * 렌더러가 현재 출력하고 있는 WebGL 캔버스 버퍼에서,
   * 사용자가 마우스로 맞춘 현재 카메라 앵글 시점 그대로 뷰파인더 사각형 영역의 픽셀을 추출하여
   * 대상 규격 해상도(예: 1080x1080, 1080x1350, 1080x1920)로 정밀 리스케일링하여 PNG 파일로 다운로드합니다.
   *
   * @param {'1:1'|'4:5'|'9:16'} aspectRatio
   * @param {string} [filename]
   * @returns {Promise<Blob>}
   */
  async exportPNG(aspectRatio = '1:1', filename = null) {
    const targetSpec = this.resolutions[aspectRatio] || this.resolutions['1:1'];
    const bounds = this.getViewfinderBounds();

    if (!bounds) {
      throw new Error('뷰파인더 영역을 계산할 수 없습니다.');
    }

    // 1. 최신 프레임 강제 렌더링 (preserveDrawingBuffer: true 보장)
    this.sceneManager.renderer.render(this.sceneManager.scene, this.sceneManager.camera);

    const webglCanvas = this.sceneManager.renderer.domElement;
    const bufferWidth = webglCanvas.width;
    const bufferHeight = webglCanvas.height;

    // 2. WebGL 백버퍼 상에서의 뷰파인더 정밀 픽셀 좌표 연산
    // (CSS 좌표와 캔버스 실제 픽셀 해상도 devicePixelRatio 매핑)
    const sx = Math.round(bounds.normX * bufferWidth);
    const sy = Math.round(bounds.normY * bufferHeight);
    const sw = Math.round(bounds.normW * bufferWidth);
    const sh = Math.round(bounds.normH * bufferHeight);

    // 3. 대상 규격 해상도의 오프스크린 Canvas 생성
    const outCanvas = document.createElement('canvas');
    outCanvas.width = targetSpec.width;
    outCanvas.height = targetSpec.height;
    const outCtx = outCanvas.getContext('2d');

    // 고품질 이미지 보간 스무딩
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';

    // 4. 뷰파인더 영역 정밀 복사 및 리스케일링
    outCtx.drawImage(
      webglCanvas,
      sx, sy, sw, sh,
      0, 0, targetSpec.width, targetSpec.height
    );

    // 5. Blob 생성 및 파일 다운로드
    return new Promise((resolve, reject) => {
      outCanvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('PNG Blob 생성에 실패했습니다.'));
          return;
        }

        const defaultName = `paper-art-${aspectRatio.replace(':', 'x')}-${Date.now()}.png`;
        const finalName = filename || defaultName;

        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = finalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => {
          URL.revokeObjectURL(downloadUrl);
        }, 1000);

        resolve(blob);
      }, 'image/png');
    });
  }

  /**
   * 다운로드 없이 Blob만 생성 (테스트 검증 및 완성본 생성용)
   * @param {'1:1'|'4:5'|'9:16'} aspectRatio
   * @returns {Promise<Blob>}
   */
  async captureBlob(aspectRatio = '1:1') {
    const targetSpec = this.resolutions[aspectRatio] || this.resolutions['1:1'];
    const bounds = this.getViewfinderBounds();

    if (!bounds) {
      throw new Error('뷰파인더 영역을 계산할 수 없습니다.');
    }

    this.sceneManager.renderer.render(this.sceneManager.scene, this.sceneManager.camera);

    const webglCanvas = this.sceneManager.renderer.domElement;
    const bufferWidth = webglCanvas.width;
    const bufferHeight = webglCanvas.height;

    const sx = Math.round(bounds.normX * bufferWidth);
    const sy = Math.round(bounds.normY * bufferHeight);
    const sw = Math.round(bounds.normW * bufferWidth);
    const sh = Math.round(bounds.normH * bufferHeight);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = targetSpec.width;
    outCanvas.height = targetSpec.height;
    const outCtx = outCanvas.getContext('2d');

    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';

    outCtx.drawImage(
      webglCanvas,
      sx, sy, sw, sh,
      0, 0, targetSpec.width, targetSpec.height
    );

    return new Promise((resolve, reject) => {
      outCanvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('PNG Blob 생성 실패'));
          return;
        }
        resolve(blob);
      }, 'image/png');
    });
  }
}
