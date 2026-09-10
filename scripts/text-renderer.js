/**
 * @file text-renderer.js
 * @description 2D 캔버스 텍스트 레이아웃, 자동 줄바꿈(Word wrap), 밈 스타일 외곽선 렌더러
 * - T03-C06: 문구 Y축 위치 변경 지원
 * - T03-C07: 문구 크기 변경 지원
 * - T03-C08: 문구 색상 변경 지원
 * - T03-C14: 긴 한글/영문/이모지/줄바꿈 자동 줄바꿈 및 극단 입력 처리
 */

/**
 * 캔버스 최대 너비 기준 텍스트 자동 줄바꿈 (Word Wrap)
 * - 명시적 개행(\n) 보존
 * - 단어 단위 분할 후 캔버스 초과 시 개행
 * - 단어 자체가 캔버스 너비를 초과하는 경우(예: 공백 없는 100자 연속 한글) 글자 단위로 분할
 *
 * @param {CanvasRenderingContext2D} ctx - 측정용 2D 컨텍스트
 * @param {string} text - 원본 텍스트
 * @param {number} maxWidth - 허용 최대 가로 너비 (픽셀)
 * @returns {string[]} 줄바꿈된 문자열 배열
 */
export function wrapText(ctx, text, maxWidth) {
  if (!text) return [];

  const resultLines = [];
  const rawParagraphs = String(text).split('\n');

  for (const para of rawParagraphs) {
    if (para === '') {
      resultLines.push('');
      continue;
    }

    // 문단 전체가 한 줄에 들어가는 경우
    if (ctx.measureText(para).width <= maxWidth) {
      resultLines.push(para);
      continue;
    }

    // 단어(공백) 단위 분할
    const words = para.split(' ');
    let currentLine = '';

    for (let w = 0; w < words.length; w++) {
      const word = words[w];
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      if (ctx.measureText(testLine).width <= maxWidth) {
        currentLine = testLine;
      } else {
        // 기존 줄이 있으면 먼저 확정
        if (currentLine) {
          resultLines.push(currentLine);
          currentLine = '';
        }

        // 단어 자체가 최대 너비보다 작은지 검사
        if (ctx.measureText(word).width <= maxWidth) {
          currentLine = word;
        } else {
          // 단어 단독으로도 폭 초과 (예: 공백 없는 긴 한글 등): 글자 단위 분할
          let charLine = '';
          for (let c = 0; c < word.length; c++) {
            const char = word[c];
            const testCharLine = charLine + char;
            if (ctx.measureText(testCharLine).width <= maxWidth) {
              charLine = testCharLine;
            } else {
              if (charLine) resultLines.push(charLine);
              charLine = char;
            }
          }
          if (charLine) {
            currentLine = charLine;
          }
        }
      }
    }

    if (currentLine) {
      resultLines.push(currentLine);
    }
  }

  return resultLines;
}

/**
 * 2D 캔버스 위에 일관된 비례 좌표계로 세레모니 문구 렌더링
 *
 * @param {CanvasRenderingContext2D} ctx - 대상 2D 컨텍스트
 * @param {number} canvasWidth - 대상 캔버스 가로 너비
 * @param {number} canvasHeight - 대상 캔버스 세로 높이
 * @param {Object} options - 렌더링 옵션
 * @param {string} options.text - 표시 문구
 * @param {number} [options.fontSize=48] - 1080px 기준 기준 폰트 크기
 * @param {string} [options.fontColor='#ffffff'] - 폰트 채우기 색상
 * @param {number} [options.textY=0.85] - 세로 위치 비율 (0.05 ~ 0.95)
 * @param {string} [options.fontFamily='Impact, "Pretendard", "Apple SD Gothic Neo", sans-serif']
 */
export function drawStudioText(ctx, canvasWidth, canvasHeight, options = {}) {
  const text = options.text !== undefined ? options.text : '';
  if (!text || !text.trim()) return;

  const baseFontSize = options.fontSize || 48;
  const fontColor = options.fontColor || '#ffffff';
  const textY = options.textY !== undefined ? options.textY : 0.85;
  const fontFamily = options.fontFamily || 'Impact, "Pretendard", "Apple SD Gothic Neo", sans-serif';

  // 1080px 기준 스케일 계수 (미리보기 화면과 1080 다운로드 파일의 100% 동일 비례 보장)
  const scale = canvasWidth / 1080;
  const actualFontSize = Math.max(8, Math.round(baseFontSize * scale));
  const maxLineWidth = canvasWidth * 0.90; // 좌우 5% 여백 보장

  ctx.save();
  ctx.font = `900 ${actualFontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 자동 줄바꿈 계산
  const lines = wrapText(ctx, text, maxLineWidth);
  if (lines.length === 0) {
    ctx.restore();
    return;
  }

  // 줄 간격 및 텍스트 블록 전체 높이 계산
  const lineHeight = actualFontSize * 1.25;
  const totalBlockHeight = lines.length * lineHeight;

  // Y축 중심점 기준 시작 Y 좌표 산출
  const targetCenterY = canvasHeight * textY;
  const startY = targetCenterY - (totalBlockHeight / 2) + (lineHeight / 2);

  // 외곽선 두께 및 그림자 반경 비례 계산
  const strokeWidth = Math.max(3, Math.round(actualFontSize * 0.12));

  // 각 라인별 외곽선(검은색) + 본문 텍스트 채우기
  lines.forEach((line, index) => {
    if (!line) return;
    const y = startY + (index * lineHeight);
    const x = canvasWidth / 2;

    // 1. 가독성 강화를 위한 두꺼운 검은색 외곽선 및 그림자
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = strokeWidth;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = Math.max(2, Math.round(6 * scale));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.max(1, Math.round(2 * scale));
    ctx.strokeText(line, x, y);

    // 2. 본문 텍스트 채우기 (그림자 중복 방지)
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = fontColor;
    ctx.fillText(line, x, y);
  });

  ctx.restore();
}
