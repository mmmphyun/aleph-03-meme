/**
 * @file json-validator.js
 * @description JSON 가져오기 3단계 유효성 검증 엔진
 *
 * [3단계 검증 파이프라인]
 * - Stage 1 (문법 검증): JSON.parse를 통한 구문 손상 및 괄호/쉼표 파손 탐지 (T03-C23)
 * - Stage 2 (구조 검증): 최상위 루트 객체({}) 및 데이터 타입 무결성 확인
 * - Stage 3 (스키마 및 필수 필드 검증): version, layers, text, aspect 필수 필드 존재 및 하위 규격 검증 (T03-C24)
 *
 * 검증 실패 시 기존 템플릿과 3D 씬을 100% 보존하며 명확한 거부 사유 메시지를 반환합니다.
 */

export class JSONValidator {
  /**
   * 필수 탑레벨 속성 목록
   */
  static REQUIRED_FIELDS = ['version', 'layers', 'text', 'aspect'];

  /**
   * 지원하는 화면비 규격
   */
  static VALID_ASPECTS = ['1:1', '4:5', '9:16'];

  /**
   * 3단계 JSON 유효성 검증 실행
   * @param {string} rawJsonString
   * @returns {{
   *   valid: boolean,
   *   stage: number,
   *   stageName: string,
   *   errorType?: string,
   *   missingFields?: string[],
   *   message: string,
   *   data?: Object
   * }}
   */
  static validate(rawJsonString) {
    if (typeof rawJsonString !== 'string' || rawJsonString.trim() === '') {
      return {
        valid: false,
        stage: 1,
        stageName: '문법 검증 (JSON Syntax)',
        errorType: 'EMPTY_INPUT',
        message: 'JSON 문법 오류: 파일 내용이 비어 있거나 올바른 텍스트가 아닙니다.'
      };
    }

    // ==========================================
    // [Stage 1] 문법 검증 (T03-C23)
    // ==========================================
    let parsed;
    try {
      parsed = JSON.parse(rawJsonString);
    } catch (err) {
      return {
        valid: false,
        stage: 1,
        stageName: '문법 검증 (JSON Syntax)',
        errorType: 'SYNTAX_ERROR',
        message: `JSON 문법 손상: 올바른 JSON 형식이 아닙니다. (${err.message})`
      };
    }

    // ==========================================
    // [Stage 2] 구조 검증 (Root Type Check)
    // ==========================================
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        valid: false,
        stage: 2,
        stageName: '구조 검증 (Root Object Check)',
        errorType: 'INVALID_ROOT_TYPE',
        message: 'JSON 구조 오류: 최상위 데이터는 단일 객체({}) 형태여야 합니다.'
      };
    }

    // ==========================================
    // [Stage 3] 필수 필드 및 스키마 검증 (T03-C24)
    // ==========================================
    const missing = this.REQUIRED_FIELDS.filter(field => {
      const val = parsed[field];
      return val === undefined || val === null || val === '';
    });

    if (missing.length > 0) {
      return {
        valid: false,
        stage: 3,
        stageName: '필수 필드 검증 (Required Fields)',
        errorType: 'MISSING_REQUIRED_FIELDS',
        missingFields: missing,
        message: `필수 항목 누락: [${missing.join(', ')}] 필드가 누락되었습니다.`
      };
    }

    // 3-1. aspect 화면비 검증
    if (!this.VALID_ASPECTS.includes(parsed.aspect)) {
      return {
        valid: false,
        stage: 3,
        stageName: '화면비 스키마 검증',
        errorType: 'INVALID_ASPECT',
        message: `화면비 규격 오류: aspect는 1:1, 4:5, 9:16 중 하나여야 합니다. (입력값: ${parsed.aspect})`
      };
    }

    // 3-2. layers 배열 검증
    if (!Array.isArray(parsed.layers)) {
      return {
        valid: false,
        stage: 3,
        stageName: '레이어 스키마 검증',
        errorType: 'INVALID_LAYERS_TYPE',
        message: '레이어 목록 오류: layers 필드는 배열([])이어야 합니다.'
      };
    }

    // 3-3. text 필드 검증 (문자열 또는 객체 형태 허용)
    if (typeof parsed.text !== 'string' && typeof parsed.text !== 'object') {
      return {
        valid: false,
        stage: 3,
        stageName: '메모 문구 스키마 검증',
        errorType: 'INVALID_TEXT_TYPE',
        message: '메모 문구 오류: text 필드는 문자열 또는 문구 설정 객체여야 합니다.'
      };
    }

    // 3-4. 개별 레이어 무결성 검증
    for (let i = 0; i < parsed.layers.length; i++) {
      const layer = parsed.layers[i];
      if (!layer || typeof layer !== 'object') {
        return {
          valid: false,
          stage: 3,
          stageName: '개별 레이어 무결성 검증',
          errorType: 'INVALID_LAYER_ITEM',
          message: `레이어 데이터 오류: ${i + 1}번째 레이어가 유효한 객체가 아닙니다.`
        };
      }
      if (!['rectangle', 'circle'].includes(layer.shapeType)) {
        return {
          valid: false,
          stage: 3,
          stageName: '개별 레이어 무결성 검증',
          errorType: 'INVALID_LAYER_SHAPE',
          message: `레이어 형태 오류: ${i + 1}번째 레이어의 shapeType은 'rectangle' 또는 'circle'이어야 합니다.`
        };
      }
    }

    return {
      valid: true,
      stage: 3,
      stageName: '3단계 검증 완료',
      data: parsed,
      message: 'JSON 3단계 유효성 검증을 통과했습니다.'
    };
  }
}
