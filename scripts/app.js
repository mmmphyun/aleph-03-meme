/**
 * @file app.js
 * @description 축구장 세레모니 제조기 애플리케이션 진입점 및 UI 제어 (Milestone 4 완결)
 * - T03-C03: 이미지 및 문구 편집 도구 초기 노출
 * - T03-C04/C05/C09/C10: 사진 업로드 및 타원형 얼굴 크롭
 * - T03-C06: 문구 세로 위치(Y축) 실시간 조절
 * - T03-C07: 폰트 크기 실시간 조절
 * - T03-C08: 폰트 색상 실시간 조절
 * - T03-C11/C12/C13: 세 화면비(1:1, 4:5, 9:16) 화면 뷰포트와 다운로드 PNG의 100% 일치
 * - T03-C14: 자동 줄바꿈(Word wrap) 로직 연동
 * - T03-C17~C21: 템플릿 생성, 불러오기, 수정, 삭제 및 localStorage 영속화
 * - T03-C22~C24: JSON 내보내기 및 3단계 유효성 검증(정상 복원, 문법 손상 거부, 필수 누락 거부)
 */
import { SceneManager } from './scene-manager.js';
import { CharacterModel } from './character-model.js';
import { FaceCropper } from './face-cropper.js';
import { drawStudioText } from './text-renderer.js';
import { TemplateStore } from './template-store.js';
import { validateJsonString, exportTemplateAsJson } from './json-validator.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
    this.templateStore = null;
    this._alertTimeout = null;

    // 편집기 상태
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
      onFaceApplied: (texture) => {
        this.character.setFaceTexture(texture);
      },
      onError: (msg) => {
        console.warn('[FaceCropper] 업로드 거부:', msg);
      }
    });

    // 4. 템플릿 스토어 초기화 및 기본 템플릿 3종 시딩 (T03-C17)
    this.templateStore = new TemplateStore();
    if (this.templateStore.getAll().length === 0) {
      this.templateStore.createTemplate({
        title: '골든 트로피 세레모니',
        ratio: '1:1',
        pose: 'BELLINGHAM_ARMS',
        skin: 'GOLDEN_TROPHY',
        headScale: 1.4,
        cameraPosition: { x: 0, y: 1.6, z: 4.2 },
        cameraTarget: { x: 0, y: 1.1, z: 0 },
        text: '골든 트로피의 주인공',
        fontSize: 52,
        fontColor: '#ffe600',
        textY: 0.85
      });
      this.templateStore.createTemplate({
        title: '레트로 호날두 시우',
        ratio: '4:5',
        pose: 'RONALDO_SIU',
        skin: 'RETRO_JERSEY',
        headScale: 1.6,
        cameraPosition: { x: 0, y: 1.5, z: 4.0 },
        cameraTarget: { x: 0, y: 1.1, z: 0 },
        text: '호날두 시우우우!',
        fontSize: 56,
        fontColor: '#ffffff',
        textY: 0.15
      });
      this.templateStore.createTemplate({
        title: '스토리 거제 야호 챌린지',
        ratio: '9:16',
        pose: 'GEOJE_YAHO',
        skin: 'CLASSIC_DAISY',
        headScale: 1.8,
        cameraPosition: { x: 0, y: 1.5, z: 3.8 },
        cameraTarget: { x: 0, y: 1.1, z: 0 },
        text: '거제도에서 야호 외치기',
        fontSize: 48,
        fontColor: '#39ff14',
        textY: 0.85
      });
    }

    // 5. UI 이벤트 바인딩
    this.bindUIEvents();

    // 6. 기본 남성 선수 샘플 얼굴 초기 적용
    this.faceCropper.applySampleFace('male');

    // 7. 초기 뷰포트 화면비 및 오버레이 텍스트 세팅
    this.updateViewportAspect('1:1');

    // 8. 템플릿 목록 초기 렌더링
    this.renderTemplateList();

    // 9. 자동화 테스트 및 디버깅용 전역 훅 등록
    window.__CEREMONY_APP__ = {
      app: this,
      sceneManager: this.sceneManager,
      character: this.character,
      faceCropper: this.faceCropper,
      templateStore: this.templateStore,
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
      exportStudioImage: (ratio, triggerDownload) => this.exportStudioImage(ratio, triggerDownload),
      createTemplate: (title) => this.createTemplateFromCurrent(title),
      loadTemplate: (id) => this.loadTemplate(id),
      updateTemplate: (id, data) => {
        const res = this.templateStore.updateTemplate(id, data);
        this.renderTemplateList();
        return res;
      },
      deleteTemplate: (id) => this.deleteTemplate(id),
      importJsonString: (str) => this.importJsonString(str),
      exportJson: (id) => {
        const tpl = id ? this.templateStore.getById(id) : (this.templateStore.getActiveTemplate() || this.getCurrentStudioState());
        return exportTemplateAsJson(tpl, false);
      }
    };

    console.info('[Ceremony Maker] Milestone 4 초기화 완료');
  }

  /**
   * 화면비 변경 및 반응형 뷰포트 컨테이너 동기화 (T03-C11~C13)
   * @param {'1:1'|'4:5'|'9:16'} ratio
   */
  updateViewportAspect(ratio = this.state.ratio) {
    this.state.ratio = ratio;
    const config = this.RATIO_CONFIG[ratio] || this.RATIO_CONFIG['1:1'];

    if (this.viewportContainer && this.viewportWrapper) {
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

      if (this.sceneManager) {
        this.sceneManager.resize(w, h);
      }

      if (this.textCanvas) {
        this.textCanvas.width = w;
        this.textCanvas.height = h;
        this.redrawOverlayText();
      }
    }

    const resBadge = document.getElementById('current-res-badge');
    if (resBadge) resBadge.textContent = config.label;

    const downloadSub = document.getElementById('btn-download-sub');
    if (downloadSub) downloadSub.textContent = `${config.label} (화면 구도 100% 일치)`;

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
   * @param {string} [ratio=this.state.ratio]
   * @param {boolean} [triggerDownload=true]
   * @returns {Promise<{blob: Blob, dataUrl: string, width: number, height: number, ratio: string}>}
   */
  async exportStudioImage(ratio = this.state.ratio, triggerDownload = true) {
    const config = this.RATIO_CONFIG[ratio] || this.RATIO_CONFIG['1:1'];
    const targetW = config.width;
    const targetH = config.height;

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = targetW;
    offscreenCanvas.height = targetH;
    const offscreenCtx = offscreenCanvas.getContext('2d');

    this.sceneManager.renderFrameToCanvas(offscreenCanvas, targetW, targetH);

    drawStudioText(offscreenCtx, targetW, targetH, {
      text: this.state.text,
      fontSize: this.state.fontSize,
      fontColor: this.state.fontColor,
      textY: this.state.textY
    });

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

  // =========================================================================
  // Milestone 4: 템플릿 관리 (CRUD) 및 JSON 3단계 검증 (T03-C17~C24)
  // =========================================================================

  /**
   * 현재 스튜디오 전체 상태 캡처 객체 생성
   * @param {string} [customTitle]
   * @returns {Object}
   */
  getCurrentStudioState(customTitle) {
    const cam = this.sceneManager.getCameraState();
    return {
      title: customTitle || `세레모니 템플릿 ${this.templateStore.getAll().length + 1}`,
      ratio: this.state.ratio,
      pose: this.character.currentPose,
      skin: this.character.currentSkin,
      headScale: this.character.headScale,
      cameraPosition: cam.position,
      cameraTarget: cam.target,
      text: this.state.text,
      fontSize: this.state.fontSize,
      fontColor: this.state.fontColor,
      textY: this.state.textY,
      faceImageDataUrl: this.faceCropper.getCurrentFaceDataUrl()
    };
  }

  /**
   * 현재 상태로 새 템플릿 생성 (T03-C17)
   * @param {string} [title]
   * @returns {Object}
   */
  createTemplateFromCurrent(title) {
    const defaultTitle = `세레모니 템플릿 ${this.templateStore.getAll().length + 1}`;
    let finalTitle = title;
    if (finalTitle === undefined) {
      const input = prompt('새 템플릿의 이름을 입력하세요:', defaultTitle);
      if (input === null) return null; // 취소
      finalTitle = input.trim() || defaultTitle;
    }

    const state = this.getCurrentStudioState(finalTitle);
    const created = this.templateStore.createTemplate(state);
    this.renderTemplateList();
    this.showTemplateAlert(`새 템플릿 "${created.title}"이 저장되었습니다.`, 'success');
    return created;
  }

  /**
   * 활성 템플릿을 현재 상태로 덮어쓰기 (T03-C19)
   * @returns {Object|null}
   */
  updateActiveTemplate() {
    const activeId = this.templateStore.activeTemplateId;
    if (!activeId) {
      this.showTemplateAlert('수정할 템플릿이 선택되지 않았습니다. 목록에서 템플릿을 먼저 선택하세요.', 'error');
      return null;
    }

    const current = this.templateStore.getById(activeId);
    if (!current) {
      this.showTemplateAlert('선택된 템플릿을 찾을 수 없습니다.', 'error');
      return null;
    }

    const state = this.getCurrentStudioState(current.title);
    const updated = this.templateStore.updateTemplate(activeId, state);
    this.renderTemplateList();
    this.showTemplateAlert(`템플릿 "${updated.title}"이 현재 상태로 갱신되었습니다.`, 'success');
    return updated;
  }

  /**
   * 템플릿 불러오기 및 3D/문구/카메라 복원 (T03-C18)
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async loadTemplate(id) {
    const template = this.templateStore.getById(id);
    if (!template) {
      this.showTemplateAlert(`템플릿(ID: ${id})을 찾을 수 없습니다.`, 'error');
      return false;
    }

    this.templateStore.setActiveId(id);

    // 1. 화면비 복원
    this.updateViewportAspect(template.ratio);

    // 2. 포즈 복원 및 UI 버튼 갱신
    this.character.applyPose(template.pose);
    document.querySelectorAll('[data-pose]').forEach((b) => {
      b.classList.toggle('active', b.dataset.pose === template.pose);
    });

    // 3. 스킨 복원 및 UI 버튼 갱신
    this.character.applySkin(template.skin || 'CLASSIC_DAISY');
    document.querySelectorAll('[data-skin]').forEach((b) => {
      b.classList.toggle('active', b.dataset.skin === (template.skin || 'CLASSIC_DAISY'));
    });

    // 4. 대두 스케일 복원 및 슬라이더 갱신
    this.character.setHeadScale(template.headScale);
    const headSlider = document.getElementById('head-scale-slider');
    const headVal = document.getElementById('head-scale-val');
    if (headSlider) headSlider.value = template.headScale;
    if (headVal) headVal.textContent = `${template.headScale.toFixed(1)}x`;

    // 5. 카메라 3D 구도 복원
    if (template.cameraPosition && template.cameraTarget) {
      this.sceneManager.setCameraState({
        position: template.cameraPosition,
        target: template.cameraTarget
      });
    }

    // 6. 2D 문구 상태 복원 및 컨트롤 갱신
    this.state.text = template.text;
    const textInput = document.getElementById('text-caption-input');
    if (textInput) textInput.value = template.text;

    this.state.fontSize = template.fontSize;
    const sizeSlider = document.getElementById('text-size-slider');
    const sizeVal = document.getElementById('text-size-val');
    if (sizeSlider) sizeSlider.value = template.fontSize;
    if (sizeVal) sizeVal.textContent = `${template.fontSize}px`;

    this.state.fontColor = template.fontColor;
    const colorPicker = document.getElementById('text-color-picker');
    const colorVal = document.getElementById('text-color-val');
    if (colorPicker) colorPicker.value = template.fontColor;
    if (colorVal) colorVal.textContent = template.fontColor.toUpperCase();
    document.querySelectorAll('.swatch-btn').forEach((sw) => {
      sw.classList.toggle('active', sw.dataset.color.toLowerCase() === template.fontColor.toLowerCase());
    });

    this.state.textY = template.textY;
    const ySlider = document.getElementById('text-y-slider');
    const yVal = document.getElementById('text-y-val');
    if (ySlider) ySlider.value = template.textY;
    if (yVal) yVal.textContent = `${Math.round(template.textY * 100)}%`;
    document.querySelectorAll('[data-y]').forEach((btn) => {
      btn.classList.toggle('active', Math.abs(parseFloat(btn.dataset.y) - template.textY) < 0.02);
    });

    // 7. 얼굴 이미지 복원
    if (template.faceImageDataUrl) {
      await this.faceCropper.applyFaceFromDataUrl(template.faceImageDataUrl);
    }

    // 8. 텍스트 오버레이 다시 그리기
    this.redrawOverlayText();

    // 9. 템플릿 목록 활성 표시 갱신
    this.renderTemplateList();

    this.showTemplateAlert(`템플릿 "${template.title}"을 불러왔습니다.`, 'info', 2500);
    return true;
  }

  /**
   * 템플릿 삭제 (T03-C20)
   * @param {string} id
   * @returns {boolean}
   */
  deleteTemplate(id) {
    const target = this.templateStore.getById(id);
    const title = target ? target.title : id;
    const deleted = this.templateStore.deleteTemplate(id);
    if (deleted) {
      this.renderTemplateList();
      this.showTemplateAlert(`템플릿 "${title}"이 삭제되었습니다.`, 'info');
    }
    return deleted;
  }

  /**
   * 템플릿 목록 UI 렌더링
   */
  renderTemplateList() {
    const listEl = document.getElementById('template-list');
    const countEl = document.getElementById('template-count');
    if (!listEl) return;

    const templates = this.templateStore.getAll();
    if (countEl) countEl.textContent = templates.length;

    listEl.innerHTML = '';
    templates.forEach((tpl) => {
      const card = document.createElement('div');
      const isActive = this.templateStore.activeTemplateId === tpl.id;
      card.className = `template-card ${isActive ? 'active' : ''}`;
      card.dataset.id = tpl.id;

      const dateStr = tpl.updatedAt ? new Date(tpl.updatedAt).toLocaleDateString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : '';

      card.innerHTML = `
        <div class="template-card-header">
          <span class="template-card-title" title="${escapeHtml(tpl.title)}">${escapeHtml(tpl.title)}</span>
          <div class="template-meta-badges">
            <span class="badge-ratio">${tpl.ratio}</span>
            <span class="badge-pose">${tpl.pose}</span>
          </div>
        </div>
        <div class="template-card-text" title="${escapeHtml(tpl.text)}">
          💬 ${escapeHtml(tpl.text || '(문구 없음)')}
        </div>
        <div class="template-card-footer">
          <span class="template-time">${dateStr}</span>
          <div class="template-card-actions">
            <button type="button" class="btn-card-action btn-load" data-action="load" data-id="${tpl.id}" title="이 템플릿 불러오기">
              불러오기
            </button>
            <button type="button" class="btn-card-action" data-action="export" data-id="${tpl.id}" title="JSON 파일로 다운로드">
              JSON
            </button>
            <button type="button" class="btn-card-action btn-delete" data-action="delete" data-id="${tpl.id}" title="템플릿 삭제">
              삭제
            </button>
          </div>
        </div>
      `;

      listEl.appendChild(card);
    });
  }

  /**
   * 템플릿 관리자 알림 메시지 출력
   * @param {string} message
   * @param {'error'|'success'|'info'} [type='error']
   * @param {number} [duration=4000]
   */
  showTemplateAlert(message, type = 'error', duration = 4000) {
    const alertBox = document.getElementById('template-alert-box');
    if (!alertBox) return;
    alertBox.textContent = message;
    alertBox.className = `alert-box ${type}`;
    alertBox.style.display = 'block';

    if (this._alertTimeout) clearTimeout(this._alertTimeout);
    if (duration > 0) {
      this._alertTimeout = setTimeout(() => {
        alertBox.style.display = 'none';
      }, duration);
    }
  }

  /**
   * JSON 문자열 가져오기 및 유효성 검증 (T03-C22, C23, C24)
   * @param {string} jsonString
   * @returns {boolean} 성공 여부
   */
  importJsonString(jsonString) {
    const res = validateJsonString(jsonString);

    // 문법 오류(T03-C23) 또는 필수 누락(T03-C24) 시 거부 안내 및 기존 템플릿 100% 보존
    if (!res.valid) {
      this.showTemplateAlert(`[가져오기 거부] ${res.error}`, 'error', 7000);
      return false;
    }

    // 정상 JSON(T03-C22) 복원
    if (res.isSingle) {
      const restored = this.templateStore.upsert(res.templates[0]);
      this.loadTemplate(restored.id);
      this.showTemplateAlert(`JSON 템플릿 "${restored.title}"을 성공적으로 복원했습니다.`, 'success');
    } else {
      res.templates.forEach((t) => this.templateStore.upsert(t));
      if (res.templates.length > 0) {
        this.loadTemplate(res.templates[0].id);
      }
      this.renderTemplateList();
      this.showTemplateAlert(`총 ${res.templates.length}개의 템플릿을 성공적으로 가져왔습니다.`, 'success');
    }
    return true;
  }

  /**
   * 활성 템플릿 또는 현재 상태 JSON 내보내기 다운로드
   */
  exportActiveTemplateJson() {
    const active = this.templateStore.getActiveTemplate() || this.getCurrentStudioState();
    exportTemplateAsJson(active, true);
    this.showTemplateAlert(`템플릿 "${active.title}"을 JSON 파일로 내보냈습니다.`, 'success');
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

    // 11. [Milestone 4] 템플릿 관리 이벤트 바인딩 (T03-C17~C24)
    const btnSaveTemplate = document.getElementById('btn-save-template');
    if (btnSaveTemplate) {
      btnSaveTemplate.addEventListener('click', () => {
        this.createTemplateFromCurrent();
      });
    }

    const btnUpdateTemplate = document.getElementById('btn-update-template');
    if (btnUpdateTemplate) {
      btnUpdateTemplate.addEventListener('click', () => {
        this.updateActiveTemplate();
      });
    }

    const btnExportJson = document.getElementById('btn-export-json');
    if (btnExportJson) {
      btnExportJson.addEventListener('click', () => {
        this.exportActiveTemplateJson();
      });
    }

    const btnTriggerImportJson = document.getElementById('btn-trigger-import-json');
    const jsonFileInput = document.getElementById('json-file-input');
    if (btnTriggerImportJson && jsonFileInput) {
      btnTriggerImportJson.addEventListener('click', () => {
        jsonFileInput.click();
      });

      jsonFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
          this.importJsonString(evt.target.result);
        };
        reader.onerror = () => {
          this.showTemplateAlert('JSON 파일 읽기 오류가 발생했습니다.', 'error');
        };
        reader.readAsText(file, 'utf-8');
        jsonFileInput.value = '';
      });
    }

    // 템플릿 카드 내부 액션 (불러오기, JSON 다운로드, 삭제) 이벤트 위임
    const templateListEl = document.getElementById('template-list');
    if (templateListEl) {
      templateListEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-card-action');
        if (!btn) return;

        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (!id) return;

        if (action === 'load') {
          this.loadTemplate(id);
        } else if (action === 'export') {
          const tpl = this.templateStore.getById(id);
          if (tpl) {
            exportTemplateAsJson(tpl, true);
            this.showTemplateAlert(`템플릿 "${tpl.title}"을 JSON으로 내보냈습니다.`, 'success');
          }
        } else if (action === 'delete') {
          const tpl = this.templateStore.getById(id);
          const confirmMsg = tpl ? `템플릿 "${tpl.title}"을 정말 삭제하시겠습니까?` : '템플릿을 삭제하시겠습니까?';
          if (confirm(confirmMsg)) {
            this.deleteTemplate(id);
          }
        }
      });
    }

    // 12. 윈도우 리사이즈 시 반응형 뷰포트 및 텍스트 갱신
    window.addEventListener('resize', () => {
      this.updateViewportAspect(this.state.ratio);
    });
  }
}

// DOM 준비 완료 시 구동
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
