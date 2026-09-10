/**
 * @file template-store.js
 * @description 템플릿 데이터 모델 정의 및 브라우저 localStorage 기반 CRUD 영속성 관리자
 * - T03-C17: 사용자가 템플릿을 3개 이상 생성 지원
 * - T03-C18: 생성한 템플릿 불러오기 (3D 씬 및 문구 복원용)
 * - T03-C19: 생성한 템플릿 수정
 * - T03-C20: 생성한 템플릿 삭제
 * - T03-C21: 브라우저 새로고침(F5) 후에도 데이터 영속성 유지
 */

const STORAGE_KEY = 'CEREMONY_TEMPLATES_V1';

/**
 * 템플릿 기본 데이터 규격 검증 및 기본값 보정
 * @param {Object} raw
 * @returns {Object} 정규화된 템플릿 데이터
 */
export function normalizeTemplate(raw = {}) {
  const now = new Date().toISOString();
  return {
    id: raw.id || `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title: (raw.title && typeof raw.title === 'string' && raw.title.trim()) ? raw.title.trim() : '무제 템플릿',
    ratio: ['1:1', '4:5', '9:16'].includes(raw.ratio) ? raw.ratio : '1:1',
    pose: typeof raw.pose === 'string' ? raw.pose : 'DEFAULT',
    skin: typeof raw.skin === 'string' ? raw.skin : 'CLASSIC_DAISY',
    headScale: typeof raw.headScale === 'number' ? raw.headScale : 1.4,
    cameraPosition: raw.cameraPosition && typeof raw.cameraPosition.x === 'number'
      ? { x: raw.cameraPosition.x, y: raw.cameraPosition.y, z: raw.cameraPosition.z }
      : { x: 0, y: 1.6, z: 4.2 },
    cameraTarget: raw.cameraTarget && typeof raw.cameraTarget.x === 'number'
      ? { x: raw.cameraTarget.x, y: raw.cameraTarget.y, z: raw.cameraTarget.z }
      : { x: 0, y: 1.1, z: 0 },
    text: typeof raw.text === 'string' ? raw.text : '',
    fontSize: typeof raw.fontSize === 'number' ? raw.fontSize : 48,
    fontColor: typeof raw.fontColor === 'string' ? raw.fontColor : '#ffffff',
    textY: typeof raw.textY === 'number' ? raw.textY : 0.85,
    faceImageDataUrl: typeof raw.faceImageDataUrl === 'string' ? raw.faceImageDataUrl : null,
    updatedAt: raw.updatedAt || now
  };
}

export class TemplateStore {
  constructor(storageKey = STORAGE_KEY) {
    this.storageKey = storageKey;
    this.templates = [];
    this.activeTemplateId = null;
    this.loadFromStorage();
  }

  /**
   * localStorage에서 템플릿 목록 로드 (T03-C21)
   * @returns {Array<Object>}
   */
  loadFromStorage() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        this.templates = [];
        return this.templates;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.templates = parsed.map((item) => normalizeTemplate(item));
      } else {
        this.templates = [];
      }
    } catch (err) {
      console.error('[TemplateStore] localStorage 파싱 실패:', err);
      this.templates = [];
    }
    return this.templates;
  }

  /**
   * 현재 템플릿 목록을 localStorage에 저장 (T03-C21)
   */
  saveToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.templates));
      return true;
    } catch (err) {
      console.error('[TemplateStore] localStorage 저장 실패 (용량 초과 등):', err);
      return false;
    }
  }

  /**
   * 전체 템플릿 목록 반환
   * @returns {Array<Object>}
   */
  getAll() {
    return [...this.templates];
  }

  /**
   * ID로 특정 템플릿 조회 (T03-C18)
   * @param {string} id
   * @returns {Object|null}
   */
  getById(id) {
    return this.templates.find((t) => t.id === id) || null;
  }

  /**
   * 신규 템플릿 생성 및 저장 (T03-C17)
   * @param {Object} data
   * @returns {Object} 생성된 템플릿
   */
  createTemplate(data = {}) {
    const template = normalizeTemplate({
      ...data,
      id: `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      updatedAt: new Date().toISOString()
    });

    this.templates.unshift(template);
    this.saveToStorage();
    this.activeTemplateId = template.id;
    return template;
  }

  /**
   * 기존 템플릿 내용 수정 (T03-C19)
   * @param {string} id
   * @param {Object} partialData
   * @returns {Object|null} 수정된 템플릿 또는 null
   */
  updateTemplate(id, partialData = {}) {
    const idx = this.templates.findIndex((t) => t.id === id);
    if (idx === -1) return null;

    const current = this.templates[idx];
    const updated = normalizeTemplate({
      ...current,
      ...partialData,
      id: current.id, // 고유 ID 불변 보장
      updatedAt: new Date().toISOString()
    });

    this.templates[idx] = updated;
    this.saveToStorage();
    return updated;
  }

  /**
   * 템플릿 삭제 (T03-C20)
   * @param {string} id
   * @returns {boolean} 삭제 성공 여부
   */
  deleteTemplate(id) {
    const prevLen = this.templates.length;
    this.templates = this.templates.filter((t) => t.id !== id);
    const deleted = this.templates.length < prevLen;

    if (deleted) {
      if (this.activeTemplateId === id) {
        this.activeTemplateId = this.templates.length > 0 ? this.templates[0].id : null;
      }
      this.saveToStorage();
    }
    return deleted;
  }

  /**
   * 현재 활성 템플릿 ID 설정
   * @param {string|null} id
   */
  setActiveId(id) {
    this.activeTemplateId = id;
  }

  /**
   * 현재 활성 템플릿 반환
   * @returns {Object|null}
   */
  getActiveTemplate() {
    if (!this.activeTemplateId) return null;
    return this.getById(this.activeTemplateId);
  }

  /**
   * 외부 템플릿 배열 일괄 덮어쓰기 (JSON 가져오기 성공 시 사용)
   * @param {Array<Object>} list
   */
  replaceAll(list) {
    this.templates = list.map((item) => normalizeTemplate(item));
    this.saveToStorage();
    if (this.templates.length > 0) {
      this.activeTemplateId = this.templates[0].id;
    } else {
      this.activeTemplateId = null;
    }
  }

  /**
   * 단일 템플릿 목록에 추가 또는 갱신 (JSON 단일 템플릿 가져오기 시 사용)
   * @param {Object} template
   */
  upsert(template) {
    const normalized = normalizeTemplate(template);
    const existingIdx = this.templates.findIndex((t) => t.id === normalized.id);
    if (existingIdx >= 0) {
      this.templates[existingIdx] = normalized;
    } else {
      this.templates.unshift(normalized);
    }
    this.activeTemplateId = normalized.id;
    this.saveToStorage();
    return normalized;
  }
}
