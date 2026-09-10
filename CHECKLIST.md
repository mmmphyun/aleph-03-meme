# [과제 3. 짤·카드 스튜디오] 마일스톤별 개발 체크리스트 및 세션 가이드

본 문서는 세션을 마일스톤별로 분할하여 점진적으로 개발 및 검증하기 위한 작업 가이드입니다.
모든 마일스톤은 [TASK_03_GUIDE.md](file:///c:/work/aleph-03-meme/TASK_03_GUIDE.md)와 [IMPLEMENTATION_PLAN.md](file:///c:/work/aleph-03-meme/IMPLEMENTATION_PLAN.md)를 기준으로 실행됩니다.

---

## 📌 전체 진행 로드맵

```text
[Milestone 1] 3D 축구장 & Daisy Bell 로우폴리 캐릭터 (시각적 뼈대)
      ↓
[Milestone 2] 사진 업로드 & 타원형 얼굴 크롭 툴 (합성 엔진)
      ↓
[Milestone 3] 화면비(1:1, 4:5, 9:16) & 2D 문구 & 파일 일치 다운로드 (과제 핵심)
      ↓
[Milestone 4] 템플릿 CRUD & JSON 3단계 검증 (데이터 영속성)
      ↓
[Milestone 5] 극단 입력 12건 검사 & 완성본 3종 & 제출문 & GitHub Pages 배포
```

---

## 🏁 Milestone 1: 3D 축구장 & Daisy Bell 로우폴리 캐릭터

### 목표
Three.js 기반의 3D 축구장 배경을 구축하고, Daisy Bell 스타일의 각진 로우폴리 마네킹과 챌린지 포즈, 대두 슬라이더를 동작시킨다.

### 체크리스트
- [x] 프로젝트 기본 뼈대 구성 (`index.html`, `styles/main.css`, `scripts/app.js`, `scripts/scene-manager.js`, `scripts/character-model.js`)
- [x] Three.js 및 OrbitControls CDN ES Modules import 설정
- [x] 축구장 바닥(투톤 스트라이프 잔디 메쉬 + 백색 라인 + 로우폴리 골대) 렌더링
- [x] 야간 경기장 스포트라이트 조명(DirectionalLight + AmbientLight) 연출
- [x] Daisy Bell 스타일의 6~8각 로우폴리곤 마네킹 인체 메쉬(Flat Shading) 절차적 생성
- [x] 관절 계층 구조 구축 (머리, 목, 몸통, 어깨/팔/손, 골반/다리/발)
- [x] 3대 콘셉트 스킨 스왑 구현 (`CLASSIC_DAISY`, `RETRO_JERSEY`, `GOLDEN_TROPHY`)
- [x] 챌린지 포즈 프리셋 구현 및 전환 (거제 야호, 최산 BAD, 호날두 SIU, 앙증 볼하트, 벨링엄, 그리즈만 등)
- [x] 대두(Bobblehead) 슬라이더 (0.8배 ~ 2.5배 실시간 머리 스케일 조절)
- [x] 3D 카메라 자유 조작(OrbitControls) 및 뷰 리셋 연동 (마우스 좌클릭 궤도 회전, 우클릭 패닝, 휠 줌)
- [x] 마일스톤 1 캐릭터/포즈/스킨 검증 스크린샷 생성 완료 (`docs/verification-m1/`)

### 완료 조건 (Definition of Done)
* 브라우저에서 축구장 한가운데 각진 마네킹이 서 있고, 포즈 버튼 클릭 시 관절이 해당 포즈로 즉시 꺾이며, 머리 크기 슬라이더와 3D 카메라 자유 회전/줌/패닝 및 뷰 리셋이 정상 작동함 (카메라 조작 구현 시 완결).

### 세션 1 시작 프롬프트
```text
c:\work\aleph-03-meme 작업 디렉터리에서 과제 3 Milestone 1 개발을 시작한다.
c:\work\aleph-03-meme\CHECKLIST.md의 [Milestone 1] 체크리스트를 순차적으로 구현하라.
Three.js 축구장 씬, Daisy Bell 스타일 로우폴리 마네킹 절차적 생성, 포즈 프리셋 4종, 대두 슬라이더, OrbitControls를 구현하고 브라우저에서 시각적으로 검증하라.
```

---

## 🏁 Milestone 2: 사진 업로드 & 타원형 얼굴 크롭 툴

### 목표
사용자가 업로드한 PNG/JPEG 사진에서 얼굴만 타원형 가이드로 잘라내어 마네킹 머리 전면에 텍스처로 입힌다.

### 체크리스트
- [ ] 사진 업로드 파일 인풋 생성 및 허용 MIME 검증 (`image/png`, `image/jpeg`) (T03-C04, C05)
- [ ] 미지원 파일(SVG, TXT, EXE 등) 업로드 시 거부 메시지 출력 및 기존 작업 보존 (T03-C09, C10)
- [ ] 타원형 얼굴 가이드 크롭 모달 UI 구현 (`scripts/face-cropper.js`)
- [ ] 크롭 모달 내 사진 이동(드래그) 및 확대/축소(마우스 휠/슬라이더) 기능
- [ ] [얼굴 적용] 클릭 시 2D Canvas의 `drawImage`로 512×512 정방형 텍스처 추출
- [ ] 마네킹 머리 전면 평면 메쉬에 `THREE.CanvasTexture`로 즉시 맵핑
- [ ] 기본 테스트용 샘플 얼굴 2종(남/여) 프리셋 탑재

### 완료 조건 (Definition of Done)
* 잘못된 파일 업로드 시 명확한 경고가 뜨고, 정상 사진 업로드 시 타원 가이드로 크롭하여 마네킹 얼굴에 정면으로 왜곡 없이 박혀서 렌더링됨.

### 세션 2 시작 프롬프트
```text
c:\work\aleph-03-meme 작업 디렉터리에서 과제 3 Milestone 2 개발을 시작한다.
c:\work\aleph-03-meme\CHECKLIST.md의 [Milestone 2] 체크리스트를 순차적으로 구현하라.
사진 업로드 검증(T03-C04, C05, C09, C10), 타원형 얼굴 크롭 모달 UI(scripts/face-cropper.js), Three.js 머리 전면 텍스처 매핑을 완성하라.
```

---

## 🏁 Milestone 3: 화면비(1:1, 4:5, 9:16) & 2D 문구 & 다운로드 일치

### 목표
세 가지 비율을 제어하고, 카메라 고정 문구를 추가하며, 화면 미리보기와 100% 동일한 고해상도 PNG를 다운로드한다.

### 체크리스트
- [ ] 화면비 전환 버튼(1:1, 4:5, 9:16) 및 뷰포트 종횡비 반응형 컨테이너 연동
- [ ] 비율 변경 시 Three.js `camera.aspect` 및 `renderer.setSize` 동기화
- [ ] 카메라 뷰포트 기준 2D 텍스트 폼 컨트롤러 구현:
  - 텍스트 입력창 (T03-C03)
  - 폰트 크기 슬라이더 (T03-C07)
  - 폰트 색상 피커 (T03-C08)
  - Y축 위치 슬라이더 (상단/중앙/하단) (T03-C06)
  - 캔버스 폭 초과 시 자동 줄바꿈(Word wrap) 로직 구현 (T03-C14)
- [ ] WebGL `preserveDrawingBuffer: true` 설정
- [ ] 오프스크린 2D 캔버스 합성 다운로드 파이프라인 구현:
  - 기준 해상도(1080×1080, 1080×1350, 1080×1920) 캔버스 생성
  - 사용자가 마우스로 맞춘 3D 카메라 최종 앵글(회전/패닝/줌 구도) 프레임 버퍼를 왜곡 없이 그대로 복사
  - 2D 문구를 동일한 비율 좌표계로 오버레이 렌더링
  - `canvas.toBlob('image/png')`로 다운로드 파일 생성
- [ ] 1:1, 4:5, 9:16 세 화면비에서 화면 캔버스(사용자 카메라 구도 포함)와 다운로드 PNG의 위치/줄바꿈 100% 일치 대조 검증 (T03-C11~C13)

### 완료 조건 (Definition of Done)
* 1:1, 4:5, 9:16 비율에서 각각 다운로드한 PNG 파일이 브라우저 화면의 뷰포트 모습과 텍스트 줄바꿈·위치 면에서 완벽하게 일치함.

### 세션 3 시작 프롬프트
```text
c:\work\aleph-03-meme 작업 디렉터리에서 과제 3 Milestone 3 개발을 시작한다.
c:\work\aleph-03-meme\CHECKLIST.md의 [Milestone 3] 체크리스트를 순차적으로 구현하라.
1:1, 4:5, 9:16 화면비 전환, 2D 문구 폼 컨트롤 및 자동 줄바꿈, 화면-다운로드 파일 100% 일치 오프스크린 2D 캔버스 합성 파이프라인(T03-C11~C13)을 구현하라.
```

---

## 🏁 Milestone 4: 템플릿 CRUD & JSON 3단계 검증

### 목표
사용자 템플릿을 생성/조회/수정/삭제하고 새로고침 후에도 유지하며, JSON 가져오기 3단계 유효성 검사를 구축한다.

### 체크리스트
- [ ] 템플릿 데이터 모델 정의 (`id`, `title`, `ratio`, `pose`, `headScale`, `cameraPosition`, `cameraTarget`, `text`, `fontSize`, `fontColor`, `textY`, `faceImageDataUrl`, `updatedAt`)
- [ ] 템플릿 모듈 구현 (`scripts/template-store.js`):
  - `createTemplate()`: 고유 ID 발급 및 3개 이상 생성 지원 (T03-C17)
  - `loadTemplate(id)`: 템플릿 선택 시 3D 씬과 문구 편집기 상태 복원 (T03-C18)
  - `updateTemplate(id)`: 현재 편집 상태로 템플릿 갱신 (T03-C19)
  - `deleteTemplate(id)`: 템플릿 삭제 (T03-C20)
  - `localStorage` 연동 및 새로고침(F5) 후 데이터 영속화 확인 (T03-C21)
- [ ] JSON 내보내기/가져오기 모듈 구현 (`scripts/json-validator.js`):
  - 현재 템플릿 데이터를 `.json` 파일로 내보내기
  - 정상 JSON 가져오기 시 템플릿 복원 (T03-C22)
  - 문법 손상 JSON 가져오기 시 거부 안내 및 기존 템플릿 보존 (T03-C23)
  - 필수 필드 누락 JSON 가져오기 시 거부 안내 및 기존 템플릿 보존 (T03-C24)

### 완료 조건 (Definition of Done)
* 템플릿을 3개 이상 추가/수정/삭제 후 F5를 눌러도 상태가 유지되며, 깨진 JSON이나 필수값이 빠진 JSON을 넣었을 때 에러 안내와 함께 기존 템플릿 목록이 훼손되지 않음.

### 세션 4 시작 프롬프트
```text
c:\work\aleph-03-meme 작업 디렉터리에서 과제 3 Milestone 4 개발을 시작한다.
c:\work\aleph-03-meme\CHECKLIST.md의 [Milestone 4] 체크리스트를 순차적으로 구현하라.
템플릿 3개 이상 생성/불러오기/수정/삭제 및 localStorage 영속화(T03-C17~C21), JSON 내보내기 및 3단계 검증(정상 복원/문법 손상 거부/필수 누락 거부)(T03-C22~C24)을 구현하라.
```

---

## 🏁 Milestone 5: 극단 입력 12건 검사 & 완성본 3종 & 배포

### 목표
과제 제출 요건(극단 입력 12건, 완성 이미지 3종, 메타데이터/보안 0건, 확인서 작성, GitHub Pages 배포)을 완결한다.

### 체크리스트
- [ ] 극단 입력 12건 테스트 수행 및 문서화 (`docs/test-cases.md`) (T03-C14)
  - 긴 한글, 영문/특수문자, 줄바꿈, 이모지, 빈 문구, 세로 이미지, 가로 이미지, 투명 PNG, 최소 폰트, 최대 폰트, 미지원 파일, 깨진 JSON
- [ ] 12건 중 최소 1건 이상 FAIL -> PASS 개선 전후 기록 작성 (예: 긴 한글 자동 줄바꿈) (T03-C15)
- [ ] 잘못된 극단 입력 후 기존 편집 내용 미손실 확인 (T03-C16)
- [ ] 서로 다른 비율/문구의 완성 이미지 3종 추출 (`assets/samples/`) (T03-C25~C27):
  - `card_1_square.png` (1:1 비율)
  - `card_2_portrait.png` (4:5 비율)
  - `card_3_story.png` (9:16 비율)
  - 본인 제작 표기 또는 출처 URL/라이선스 명시
- [ ] 보안 점검: EXIF 위치 메타데이터 0건, 개인정보 0건, 비밀값 0건 (T03-C28~C30)
- [ ] 제출 규격 문서 작성 (`docs/submission.md`) (T03-C31, C32):
  - 짧은 확인 방법 4줄 (위치 / 3단계 이내 행동 / 통과 모습 / 안 될 때 모습)
  - AI와 나의 판단 3줄 (AI에게 맡긴 일 / 직접 판단한 일 / AI 제안 따르지 않은 일)
- [ ] Git 커밋 및 GitHub 리포지토리 생성, GitHub Pages 배포
- [ ] 시크릿 창(Incognito)에서 무로그인/무인증 배포 URL 정상 접근 검증 (T03-C01)

### 완료 조건 (Definition of Done)
* GitHub Pages 라이브 URL이 시크릿 창에서 완벽히 동작하며, 모든 문서와 증빙 파일이 리포지토리에 커밋되어 제출 준비가 완료됨.

### 세션 5 시작 프롬프트
```text
c:\work\aleph-03-meme 작업 디렉터리에서 과제 3 Milestone 5를 시작한다.
c:\work\aleph-03-meme\CHECKLIST.md의 [Milestone 5] 체크리스트를 순차적으로 완수하라.
극단 입력 12건 검사표(docs/test-cases.md, FAIL->PASS 포함), 완성 이미지 3종(assets/samples/), 제출 규격문(docs/submission.md), GitHub Pages 배포 및 시크릿 창 접근(T03-C01)을 마무리하라.
```
