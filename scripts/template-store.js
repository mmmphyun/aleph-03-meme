/**
 * @file template-store.js
 * @description 3D 페이퍼 스컬프처 템플릿 CRUD 및 localStorage 영속화 매니저
 * - T03-C17: 템플릿 3개 이상 생성 (기본 프리셋 3종 내장 + 신규 사용자 템플릿 추가)
 * - T03-C18: 생성한 템플릿 불러오기 (3D 레이어, 메모지 텍스트/스타일, 카메라 앵글 완벽 복원)
 * - T03-C19: 템플릿 수정 (이름 변경 또는 현재 씬 상태로 덮어쓰기)
 * - T03-C20: 템플릿 삭제 (안정된 고유 ID 사용, 타 템플릿 영향 없음)
 * - T03-C21: localStorage 영속화 및 새로고침(F5) 후 100% 유지
 */

const STORAGE_KEY = 'paper_studio_templates_v1';

/**
 * 기본 내장 프리셋 3종 정의
 * 1:1, 4:5, 9:16 각 화면비에 최적화된 레이어와 카메라 앵글, 메모지 스타일
 */
export const DEFAULT_PRESETS = [
  {
    id: 'preset_classic_box_1x1',
    name: '클래식 섀도 박스 1:1',
    isPreset: true,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
    version: '1.0',
    aspect: '1:1',
    camera: {
      position: { x: 0.0, y: 0.0, z: 8.2 },
      target: { x: 0.0, y: 0.0, z: 0.0 }
    },
    text: {
      text: '손끝으로 찢어낸 종이에\n새겨 넣은 생각 한 줄',
      fontSize: 42,
      fontColor: '#1a1c20',
      paperColor: '#fbf8ef',
      posX: 0.0,
      posY: -1.2,
      posZ: 0.45,
      scale: 1.0,
      baseWidth: 3.8,
      baseHeight: 1.8,
      roughness: 0.08,
      seed: 88192
    },
    layers: [
      {
        id: 'layer_p1_base',
        name: '기본 사각 종이',
        shapeType: 'rectangle',
        width: 4.0,
        height: 2.8,
        roughness: 0.075,
        seed: 42,
        color: '#ede8dc',
        textureDataUrl: null,
        position: { x: -0.2, y: -0.1, z: 0.0 },
        rotation: { x: 0.0, y: 0.0, z: 0.0 },
        scale: { x: 1.0, y: 1.0, z: 1.0 },
        zIndex: 0.0
      },
      {
        id: 'layer_p1_sticker',
        name: '기본 원형 스티커',
        shapeType: 'circle',
        radius: 1.25,
        roughness: 0.0675,
        seed: 179,
        color: '#fcfbf7',
        textureDataUrl: null,
        position: { x: 0.65, y: 0.45, z: 0.15 },
        rotation: { x: 0.0, y: 0.0, z: 0.0 },
        scale: { x: 1.0, y: 1.0, z: 1.0 },
        zIndex: 0.15
      }
    ]
  },
  {
    id: 'preset_minimal_feed_4x5',
    name: '미니멀 피드 4:5',
    isPreset: true,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
    version: '1.0',
    aspect: '4:5',
    camera: {
      position: { x: 4.2, y: -3.8, z: 6.0 },
      target: { x: 0.0, y: 0.0, z: 0.0 }
    },
    text: {
      text: '빛과 그림자가 만들어낸\n종이의 단면과 깊이',
      fontSize: 46,
      fontColor: '#ffffff',
      paperColor: '#1e272e',
      posX: 0.0,
      posY: -1.8,
      posZ: 0.45,
      scale: 1.05,
      baseWidth: 3.8,
      baseHeight: 1.8,
      roughness: 0.08,
      seed: 54321
    },
    layers: [
      {
        id: 'layer_p2_base',
        name: '차콜 와이드 베이스',
        shapeType: 'rectangle',
        width: 3.8,
        height: 4.6,
        roughness: 0.075,
        seed: 812,
        color: '#2d3436',
        textureDataUrl: null,
        position: { x: 0.0, y: 0.4, z: 0.0 },
        rotation: { x: 0.0, y: 0.0, z: 0.05 },
        scale: { x: 1.0, y: 1.0, z: 1.0 },
        zIndex: 0.0
      },
      {
        id: 'layer_p2_terracotta',
        name: '테라코타 사각 악센트',
        shapeType: 'rectangle',
        width: 2.8,
        height: 2.6,
        roughness: 0.08,
        seed: 994,
        color: '#e17055',
        textureDataUrl: null,
        position: { x: -0.4, y: 0.6, z: 0.15 },
        rotation: { x: 0.0, y: 0.0, z: -0.08 },
        scale: { x: 1.0, y: 1.0, z: 1.0 },
        zIndex: 0.15
      },
      {
        id: 'layer_p2_stamp',
        name: '선샤인 원형 스탬프',
        shapeType: 'circle',
        radius: 0.95,
        roughness: 0.065,
        seed: 318,
        color: '#ffeaa7',
        textureDataUrl: null,
        position: { x: 0.75, y: 1.2, z: 0.30 },
        rotation: { x: 0.0, y: 0.0, z: 0.12 },
        scale: { x: 1.0, y: 1.0, z: 1.0 },
        zIndex: 0.30
      }
    ]
  },
  {
    id: 'preset_mobile_reels_9x16',
    name: '모바일 릴스 및 스토리 9:16',
    isPreset: true,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
    version: '1.0',
    aspect: '9:16',
    camera: {
      position: { x: 7.5, y: -0.3, z: 2.6 },
      target: { x: 0.0, y: 0.0, z: 0.0 }
    },
    text: {
      text: '종이를 오려내어\n이어가는 상상',
      fontSize: 40,
      fontColor: '#2d3436',
      paperColor: '#fdcb6e',
      posX: 0.0,
      posY: -2.4,
      posZ: 0.45,
      scale: 0.95,
      baseWidth: 3.8,
      baseHeight: 1.8,
      roughness: 0.08,
      seed: 91122
    },
    layers: [
      {
        id: 'layer_p3_board',
        name: '스카이 롱 백보드',
        shapeType: 'rectangle',
        width: 3.5,
        height: 6.2,
        roughness: 0.075,
        seed: 456,
        color: '#74b9ff',
        textureDataUrl: null,
        position: { x: 0.0, y: 0.3, z: 0.0 },
        rotation: { x: 0.0, y: 0.0, z: 0.02 },
        scale: { x: 1.0, y: 1.0, z: 1.0 },
        zIndex: 0.0
      },
      {
        id: 'layer_p3_subcard',
        name: '코랄 핑크 카드',
        shapeType: 'rectangle',
        width: 3.0,
        height: 3.2,
        roughness: 0.08,
        seed: 789,
        color: '#ff7675',
        textureDataUrl: null,
        position: { x: -0.3, y: 0.9, z: 0.15 },
        rotation: { x: 0.0, y: 0.0, z: -0.06 },
        scale: { x: 1.0, y: 1.0, z: 1.0 },
        zIndex: 0.15
      },
      {
        id: 'layer_p3_badge',
        name: '민트 뱃지 원형',
        shapeType: 'circle',
        radius: 1.1,
        roughness: 0.065,
        seed: 654,
        color: '#55efc4',
        textureDataUrl: null,
        position: { x: 0.5, y: -0.2, z: 0.30 },
        rotation: { x: 0.0, y: 0.0, z: 0.0 },
        scale: { x: 1.0, y: 1.0, z: 1.0 },
        zIndex: 0.30
      }
    ]
  }
];

export class TemplateStore {
  /**
   * @param {Object} [options]
   * @param {string} [options.storageKey]
   */
  constructor(options = {}) {
    this.storageKey = options.storageKey || STORAGE_KEY;
    this.templates = [];
    this._loadFromStorage();
  }

  /**
   * localStorage로부터 템플릿 목록 불러오기 (비어있으면 기본 프리셋 3종 자동 적재)
   * @private
   */
  _loadFromStorage() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.templates = parsed;
          return;
        }
      }
    } catch (err) {
      console.warn('[TemplateStore] localStorage 파싱 실패 -> 기본 프리셋으로 초기화', err);
    }

    // 초기화: 기본 프리셋 3종 깊은 복사 적재
    this.templates = JSON.parse(JSON.stringify(DEFAULT_PRESETS));
    this._saveToStorage();
  }

  /**
   * 현재 템플릿 목록을 localStorage에 동기화
   * @private
   */
  _saveToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.templates));
      return true;
    } catch (err) {
      console.error('[TemplateStore] localStorage 저장 실패:', err);
      return false;
    }
  }

  /**
   * 모든 템플릿 목록 반환
   * @returns {Array<Object>}
   */
  getAll() {
    return [...this.templates];
  }

  /**
   * 특정 ID를 가진 템플릿 조회
   * @param {string} id
   * @returns {Object|null}
   */
  getById(id) {
    return this.templates.find(t => t.id === id) || null;
  }

  /**
   * 템플릿 생성 (T03-C17)
   * @param {Object} templateData
   * @returns {Object} 생성된 템플릿 객체
   */
  create(templateData) {
    const id = templateData.id || `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const newTemplate = {
      version: '1.0',
      id,
      name: templateData.name || `사용자 템플릿 #${this.templates.length + 1}`,
      isPreset: false,
      createdAt: now,
      updatedAt: now,
      aspect: templateData.aspect || '1:1',
      camera: templateData.camera || { position: { x: 0, y: 0, z: 8.2 }, target: { x: 0, y: 0, z: 0 } },
      text: templateData.text || {},
      layers: templateData.layers || []
    };

    this.templates.push(newTemplate);
    this._saveToStorage();
    return newTemplate;
  }

  /**
   * 템플릿 수정 (이름 변경 또는 현재 씬 내용 덮어쓰기) (T03-C19)
   * @param {string} id - 대상 템플릿의 고유 ID
   * @param {Partial<Object>} updates - 수정할 필드 목록
   * @returns {Object|null}
   */
  update(id, updates) {
    const index = this.templates.findIndex(t => t.id === id);
    if (index === -1) {
      console.warn(`[TemplateStore] 수정 대상 템플릿 없음: ${id}`);
      return null;
    }

    const current = this.templates[index];
    const updated = {
      ...current,
      ...updates,
      id: current.id, // 고유 식별자는 불변 유지
      updatedAt: new Date().toISOString()
    };

    this.templates[index] = updated;
    this._saveToStorage();
    return updated;
  }

  /**
   * 템플릿 삭제 (T03-C20)
   * 안정된 고유 ID 기준으로 제거하여 타 템플릿에 영향을 주지 않음
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    const index = this.templates.findIndex(t => t.id === id);
    if (index === -1) {
      return false;
    }

    this.templates.splice(index, 1);
    this._saveToStorage();
    return true;
  }

  /**
   * 전체 템플릿을 기본 프리셋 3종으로 리셋
   */
  resetToDefaults() {
    this.templates = JSON.parse(JSON.stringify(DEFAULT_PRESETS));
    this._saveToStorage();
    return [...this.templates];
  }

  /**
   * 외부 데이터로 템플릿 목록 전체 교체 (JSON 복원 등)
   * @param {Array<Object>} newTemplates
   */
  replaceAll(newTemplates) {
    if (!Array.isArray(newTemplates)) return false;
    this.templates = JSON.parse(JSON.stringify(newTemplates));
    this._saveToStorage();
    return true;
  }
}
