/**
 * @file json-validator.js
 * @description JSON 내보내기 및 3단계 유효성 검증 모듈
 * - T03-C22: 정상 JSON 가져오기 시 템플릿 완벽 복원
 * - T03-C23: 문법이 손상된 JSON 가져오기 시 거부 안내 및 기존 템플릿 100% 보존
 * - T03-C24: 필수 항목이 빠진 JSON 가져오기 시 거부 안내 및 기존 템플릿 100% 보존
 */

/**
 * 필수 필드 목록 및 유효성 검사 규칙
 */
const REQUIRED_FIELDS = [
  { field: 'title', type: 'string', validate: (v) => typeof v === 'string' && v.trim().length > 0, msg: 'title(제목)이 누락되었거나 비어있습니다.' },
  { field: 'ratio', type: 'string', validate: (v) => ['1:1', '4:5', '9:16'].includes(v), msg: 'ratio(화면비)가 누락되었거나 유효하지 않습니다 (1:1, 4:5, 9:16 중 하나 필요).' },
  { field: 'pose', type: 'string', validate: (v) => typeof v === 'string' && v.length > 0, msg: 'pose(포즈)가 누락되었습니다.' },
  { field: 'headScale', type: 'number', validate: (v) => typeof v === 'number' && !isNaN(v) && v > 0, msg: 'headScale(머리 크기)이 누락되었거나 숫자가 아닙니다.' },
  { field: 'text', type: 'string', validate: (v) => typeof v === 'string', msg: 'text(문구 내용)가 누락되었습니다.' },
  { field: 'fontSize', type: 'number', validate: (v) => typeof v === 'number' && !isNaN(v) && v > 0, msg: 'fontSize(폰트 크기)가 누락되었거나 유효한 숫자가 아닙니다.' },
  { field: 'fontColor', type: 'string', validate: (v) => typeof v === 'string' && v.length > 0, msg: 'fontColor(폰트 색상)가 누락되었습니다.' },
  { field: 'textY', type: 'number', validate: (v) => typeof v === 'number' && !isNaN(v), msg: 'textY(세로 위치)가 누락되었거나 유효한 숫자가 아닙니다.' }
];

/**
 * 단일 템플릿 객체 스키마 검증
 * @param {Object} obj
 * @returns {{valid: boolean, error?: string}}
 */
function validateTemplateObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, error: '템플릿 데이터가 올바른 객체 형태가 아닙니다.' };
  }

  for (const rule of REQUIRED_FIELDS) {
    if (!(rule.field in obj)) {
      return {
        valid: false,
        error: `필수 항목 누락: [${rule.field}] 필드가 누락되었습니다. (${rule.msg})`
      };
    }
    if (!rule.validate(obj[rule.field])) {
      return {
        valid: false,
        error: `유효하지 않은 필드 형식: [${rule.field}] - ${rule.msg}`
      };
    }
  }

  return { valid: true };
}

/**
 * JSON 문자열 3단계 유효성 검증 (T03-C22, C23, C24)
 * 1단계: 문법 검사 (JSON.parse)
 * 2단계: 필수 항목 스키마 검증
 * 3단계: 정규화 및 데이터 준비
 * @param {string} jsonString
 * @returns {{valid: boolean, stage: number, error?: string, templates?: Array<Object>, isSingle?: boolean}}
 */
export function validateJsonString(jsonString) {
  if (typeof jsonString !== 'string' || !jsonString.trim()) {
    return {
      valid: false,
      stage: 1,
      error: 'JSON 문법 오류: 빈 데이터이거나 문자열이 아닙니다.'
    };
  }

  // 1단계: JSON 문법 검사 (T03-C23)
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (parseErr) {
    return {
      valid: false,
      stage: 1,
      error: `JSON 문법 오류: ${parseErr.message} (올바른 JSON 문법 형식이 아닙니다.)`
    };
  }

  // 2단계: 필수 항목 스키마 검사 (T03-C24)
  let targetList = [];
  let isSingle = false;

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return {
        valid: false,
        stage: 2,
        error: '필수 항목 누락: JSON 배열에 템플릿 항목이 존재하지 않습니다.'
      };
    }
    targetList = parsed;
  } else if (parsed && typeof parsed === 'object') {
    if (parsed.templates && Array.isArray(parsed.templates)) {
      targetList = parsed.templates;
    } else if (parsed.template && typeof parsed.template === 'object') {
      targetList = [parsed.template];
      isSingle = true;
    } else {
      // 단일 템플릿 직접 전달 형태
      targetList = [parsed];
      isSingle = true;
    }
  } else {
    return {
      valid: false,
      stage: 2,
      error: '필수 항목 누락: 템플릿 객체 또는 템플릿 배열이 아닙니다.'
    };
  }

  // 대상 템플릿 항목별 필수 필드 정밀 검증
  for (let i = 0; i < targetList.length; i++) {
    const item = targetList[i];
    const res = validateTemplateObject(item);
    if (!res.valid) {
      const prefix = targetList.length > 1 ? `[#${i + 1} 템플릿] ` : '';
      return {
        valid: false,
        stage: 2,
        error: `${prefix}${res.error}`
      };
    }
  }

  // 3단계: 통과 (T03-C22)
  return {
    valid: true,
    stage: 3,
    templates: targetList,
    isSingle
  };
}

/**
 * 템플릿을 JSON 파일로 내보내기 다운로드
 * @param {Object} template
 * @param {boolean} [triggerDownload=true]
 * @returns {string} 생성된 JSON 문자열
 */
export function exportTemplateAsJson(template, triggerDownload = true) {
  const exportPayload = {
    version: '1.0',
    type: 'ceremony_template',
    exportedAt: new Date().toISOString(),
    template
  };

  const jsonString = JSON.stringify(exportPayload, null, 2);

  if (triggerDownload) {
    const blob = new Blob([jsonString], { type: 'application/json; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTitle = (template.title || 'template').replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
    const ratioClean = (template.ratio || '1_1').replace(':', '_');
    a.href = url;
    a.download = `ceremony_template_${safeTitle}_${ratioClean}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return jsonString;
}
