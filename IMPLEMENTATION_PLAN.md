# [과제 3. 짤·카드 스튜디오] 3D 페이퍼 스컬프처 & 섀도 아트 스튜디오 구현 계획서

## 1. 프로젝트 개요
* **프로젝트명**: 3D 페이퍼 스컬프처 & 섀도 아트 스튜디오 (Paper & Shadow Studio)
* **목적**: 사용자가 업로드한 단일 이미지에서 원하는 영역을 거칠게 찢어낸 종이 조각(Ragged Torn Edge Cutout)들로 분할하여 3D 섀도 박스 공간에 다층(Z-Stack)으로 배치하고, 비스듬한 조명에 의한 깊은 그림자와 자유로운 3D 카메라 앵글을 감상하다가 원하는 시점에 박제하여 2D 카드로 내려받는 웹 에디터.
* **배포 환경**: GitHub Pages (정적 호스팅, T03-C01 무로그인/무인증 접근 보장)
* **핵심 기준**: 과제 3 통과 기준 T03-C01 ~ T03-C32 100% 충족

---

## 2. 기술 스택 및 디렉터리 아키텍처

### 2.1. 기술 스택
* **코어**: HTML5, CSS3, Modern JavaScript (ES Modules, 무번들러)
* **3D 렌더링**: Three.js (r128+, CDN ES Module import) + OrbitControls
* **지오메트리 생성**: 절차적 다중 주파수 노이즈 알고리즘 + `THREE.Shape` + `THREE.ExtrudeGeometry`
* **텍스트 엔진**: 오프스크린 2D Canvas 렌더링 -> `THREE.CanvasTexture` (찢긴 메모지 라벨 메쉬)
* **저장소**: Browser `localStorage` (템플릿 메타데이터 영속성)

### 2.2. 디렉터리 구조
```text
c:\work\aleph-03-meme/
├── index.html                    # 메인 UI (뷰파인더 컨테이너 + 크롭 모달 + 제어 툴바)
├── styles/
│   └── main.css                  # 미니멀 다크 모드 섀도 스튜디오 테마 및 반응형 뷰포트
├── scripts/
│   ├── app.js                    # UI 이벤트 바인딩, 모듈 오케스트레이션 및 상태 관리
│   ├── scene-manager.js          # Three.js 씬, 섀도 조명, 카메라, OrbitControls, 렌더 루프
│   ├── torn-geometry.js          # 찢긴 종이 절차적 외곽선 생성 및 ExtrudeGeometry 빌더
│   ├── crop-tool.js              # 단일 이미지 상의 다층 종이 조각 크롭 모달
│   ├── memo-label.js             # 한글/이모지 텍스트 라벨 2D Canvas 및 CanvasTexture 동기화
│   ├── template-store.js         # localStorage 템플릿 CRUD (3개 이상 관리)
│   ├── json-validator.js         # JSON 가져오기 3단계 유효성 검증
│   └── exporter.js               # 뷰파인더 영역 고해상도 PNG 캡처 다운로드 (1:1/4:5/9:16)
├── assets/
│   └── samples/                  # 완성 이미지 3종 및 기본 샘플 이미지
├── docs/
│   ├── test-cases.md             # 극단 입력 12건 검사표 및 FAIL->PASS 개선 기록
│   └── submission.md             # 제출 규격 (4줄 확인법, 3줄 AI 판단)
├── TASK_03_GUIDE.md              # 요구사항 명세 원본
├── CHECKLIST.md                  # 마일스톤별 개발 체크리스트
└── IMPLEMENTATION_PLAN.md        # 본 계획서
```

---

## 3. 핵심 모듈별 상세 설계

### 3.1. 3D 씬 & 조명 (`scene-manager.js`)
* **백그라운드 매트 보드**: 종이 질감의 베이지/차콜 매트 보드 메쉬(`PlaneGeometry`), 하위 조각들의 그림자를 받아내는 캔버스 역할.
* **조명 & 그림자 연출**:
  * `DirectionalLight`: 비스듬한 상단(X: 5, Y: 10, Z: 8)에서 비춰 종이 조각의 삐쭉삐쭉한 단면에 하이라이트와 깊은 사선 그림자 드리움 (`castShadow = true`, `PCFSoftShadowMap`).
  * `AmbientLight`: 은은한 환경광으로 암부 디테일 유지.
* **카메라 & 인터랙션**:
  * `PerspectiveCamera` + `OrbitControls`
  * 마우스 좌클릭: 360도 자유 궤도 회전 (측면 단면 및 입체 그림자 감상).
  * 마우스 우클릭 / Shift+드래그: 카메라 패닝.
  * 마우스 휠: 줌인 / 줌아웃.
  * 퀵 앵글 버튼: [정면 뷰], [대각선 얼짱각도 뷰], [극적 측면 뷰], [앵글 리셋].

### 3.2. 절차적 찢김(Torn Edge) 지오메트리 (`torn-geometry.js`)
* **알고리즘**:
  * 사각형 또는 타원형의 기본 윤곽선을 촘촘한 세그먼트로 분할.
  * 각 변의 꼭짓점에 다중 주파수 사인/노이즈 함수(`amplitude * sin(freq * t) + noise`)를 가산하여 자연스럽게 삐쭉빼쭉한 섬유 단면 폴리곤(`THREE.Shape`) 생성.
  * `THREE.ExtrudeGeometry`로 두께(`depth: 0.03`, `bevelEnabled: true`) 부여.
  * 조각의 전면에 사용자가 크롭한 이미지 텍스처 UV 매핑.

### 3.3. 단일 이미지 크롭 & 다층 레이어 (`crop-tool.js`)
* **업로드 검증 (T03-C04, C05, C09, C10)**:
  * PNG/JPEG 지원. 기타 파일은 즉시 거부 토스트 출력 및 기존 3D 씬 보존.
* **크롭 인터랙션**:
  * 단일 이미지 위에서 원하는 영역을 드래그 지정 후 [찢긴 조각 추가] 클릭.
  * 새로운 조각이 생성될 때마다 Z축 높이(Z=0.0, Z=0.15, Z=0.3 등)가 자동으로 스택되며, 조각 간 그림자가 상호 투영됨.
  * 각 조각의 3D 이동, 회전, 스케일 조절 지원.

### 3.4. 찢겨진 메모지 텍스트 라벨 (`memo-label.js`)
* **텍스트 컨트롤 (T03-C06 ~ C08, C14)**:
  * 텍스트 인풋, 크기 슬라이더, 색상 피커, 위치 슬라이더.
  * 긴 문장 입력 시 자동 줄바꿈(Word wrap), 이모지 완벽 지원.
  * 2D 오프스크린 캔버스에 렌더링 후 `THREE.CanvasTexture`로 찢긴 메모지 3D 메쉬 표면에 실시간 갱신.

### 3.5. 뷰파인더 & 화면비 일치 다운로드 (`exporter.js`)
* **화면비 (T03-C11 ~ C13)**: 1:1, 4:5, 9:16.
* 화면 프리뷰 중앙에 해당 비율의 뷰파인더 가이드라인 표시.
* 다운로드 시 사용자가 맞춘 3D 카메라 앵글의 뷰파인더 내부 픽셀 영역만 오프스크린 캔버스로 정확히 잘라내어 고해상도 PNG(`canvas.toBlob`)로 추출.

### 3.6. 템플릿 CRUD & JSON 검증 (`template-store.js`, `json-validator.js`)
* `localStorage`에 템플릿 3종 이상 영속화 (T03-C17 ~ C21).
* JSON 가져오기 시 3단계(정상 복원 / 문법 손상 거부 / 필수 필드 누락 거부) 철저 검증 및 실패 시 기존 씬 상태 보존 (T03-C22 ~ C24).
