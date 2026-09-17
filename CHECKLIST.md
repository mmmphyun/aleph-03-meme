# [과제 3. 짤·카드 스튜디오] 마일스톤별 개발 체크리스트 및 세션 가이드

본 문서는 3D 페이퍼 스컬프처 & 섀도 아트 스튜디오 개발을 마일스톤별로 분할하여 서브에이전트 및 단계적 검증으로 실행하기 위한 작업 가이드입니다.

---

## 📌 전체 진행 로드맵

```text
[Milestone 1] 3D 씬 & 절차적 찢긴 종이(Torn Edge) 지오메트리 엔진
      ↓
[Milestone 2] 단일 이미지 로드 & 찢긴 조각 크롭 & 다층 Z-Stack 툴
      ↓
[Milestone 3] 화면비(1:1, 4:5, 9:16) 뷰파인더 & 찢긴 메모지 텍스트 & PNG 다운로드 일치
      ↓
[Milestone 4] 템플릿 CRUD & JSON 3단계 검증 (데이터 영속성)
      ↓
[Milestone 5] 극단 입력 12건 검사 & 완성본 3종 & 제출문 & GitHub Pages 배포
```

---

## 🏁 Milestone 1: 3D 씬 & 절차적 찢긴 종이(Torn Edge) 지오메트리 엔진

### 목표
Three.js 기반의 섀도 스튜디오 씬을 구축하고, 다중 주파수 노이즈로 삐쭉삐쭉하게 찢겨진 종이 외곽선과 두께(`ExtrudeGeometry`), 실시간 그림자가 생기는 기본 3D 뷰포트를 완성한다.

### 체크리스트
- [x] 프로젝트 뼈대 구성 (`index.html`, `styles/main.css`, `scripts/app.js`, `scripts/scene-manager.js`, `scripts/torn-geometry.js`)
- [x] Three.js 및 OrbitControls CDN ES Modules import 설정
- [x] 백그라운드 매트 보드(Plane) 및 그림자(Shadow Map) 지향성 조명 설정
- [x] 절차적 찢긴 종이 외곽선 생성 알고리즘 구현 (`torn-geometry.js`):
  - 사각형 베이스 찢김 (Torn Rectangle)
  - 원형 베이스 찢김 (Torn Circle)
  - `THREE.Shape` + `THREE.ExtrudeGeometry` (두께 0.03 + Bevel)
- [x] 마우스 좌클릭 360도 궤도 회전, 우클릭 패닝, 휠 줌 (OrbitControls)
- [x] 3D 카메라 앵글 퀵버튼 (정면, 대각선, 측면, 리셋)

---

## 🏁 Milestone 2: 단일 이미지 로드 & 찢긴 조각 크롭 & 다층 Z-Stack 툴

### 목표
단일 PNG/JPEG 이미지를 업로드하고, 이미지 위에서 원하는 영역을 찢긴 조각으로 크롭하여 3D 공간에 다층(Z-Stack)으로 배치한다.

### 체크리스트
- [x] 사진 업로드 파일 인풋 생성 및 허용 MIME 검증 (`image/png`, `image/jpeg`) (T03-C04, C05)
- [x] 미지원 파일 업로드 시 거부 토스트 출력 및 기존 작업 보존 (T03-C09, C10)
- [x] 크롭 모달 UI 구현 (`scripts/crop-tool.js`):
  - 사각/원형 선택 및 드래그 영역 지정
  - [찢긴 조각 추가] 클릭 시 선택 영역 텍스처 추출 및 3D 씬에 신규 레이어로 추가
- [x] 신규 레이어 추가 시 자동 Z축 높이 스택 (상위 레이어가 하위 레이어에 그림자 투영)
- [x] 레이어별 위치/회전 조작 툴바 연동

---

## 🏁 Milestone 3: 화면비 뷰파인더 & 찢긴 메모지 텍스트 & PNG 다운로드 일치

### 목표
1:1, 4:5, 9:16 뷰파인더를 제공하고, 찢겨진 메모지 텍스트 라벨을 실시간 렌더링하며, 화면 구도 그대로 100% 일치하는 고해상도 PNG를 다운로드한다.

### 체크리스트
- [x] 화면비 전환 버튼(1:1, 4:5, 9:16) 및 뷰파인더 마스크 UI
- [x] 찢겨진 메모지 텍스트 라벨 구현 (`scripts/memo-label.js`):
  - 텍스트 입력, 폰트 크기, 색상, 위치 실시간 조절 (T03-C06 ~ C08)
  - 긴 문장 자동 줄바꿈 및 이모지 지원 (T03-C14)
  - 오프스크린 2D Canvas -> `CanvasTexture` 3D 메모지 메쉬 실시간 갱신
- [x] WebGL `preserveDrawingBuffer: true` 설정
- [x] 뷰파인더 클리핑 고해상도 PNG 다운로드 파이프라인 구현 (`scripts/exporter.js`) (T03-C11 ~ C13)

---

## 🏁 Milestone 4: 템플릿 CRUD & JSON 3단계 검증

### 목표
3개 이상의 템플릿을 생성/조회/수정/삭제하고 새로고침 후에도 유지하며, JSON 가져오기 3단계 유효성 검증을 완벽히 수행한다.

### 체크리스트
- [x] 템플릿 3개 이상 생성, 불러오기, 수정, 삭제 (T03-C17 ~ C20)
- [x] `localStorage` 영속화 및 새로고침 후 복원 (T03-C21)
- [x] JSON 내보내기/가져오기 기능 (`scripts/json-validator.js`)
- [x] 정상 JSON 가져오기 시 씬 완벽 복원 (T03-C22)
- [x] 문법 오류 JSON 거부 및 기존 씬 보존 (T03-C23)
- [x] 필수 필드 누락 JSON 거부 및 기존 씬 보존 (T03-C24)

---

## 🏁 Milestone 5: 극단 입력 12건 검사 & 완성본 3종 & 제출문 & 배포

### 목표
극단 입력 12건 검사 및 결함 수정 증적을 확보하고, 완성본 3종 및 제출 규격을 완성하여 GitHub Pages로 배포한다.

### 체크리스트
- [x] 극단 입력 12건 검사 및 FAIL -> PASS 전환 증적 기록 (`docs/test-cases.md`) (T03-C14 ~ C16)
- [x] 서로 다른 3종 화면비 완성 이미지 생성 (`assets/samples/`) (T03-C25 ~ C27)
- [x] EXIF 위치 정보 및 시크릿 0건 검증 (T03-C28 ~ C30)
- [x] 제출 양식 작성 (`docs/submission.md`) (T03-C31, C32)
- [x] GitHub Pages 배포 및 시크릿 창 무로그인 접속 검증 (T03-C01)
