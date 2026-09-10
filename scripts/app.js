/**
 * @file app.js
 * @description 축구장 세레모니 제조기 애플리케이션 진입점 및 UI 제어
 */
import { SceneManager } from './scene-manager.js';
import { CharacterModel } from './character-model.js';

class App {
  constructor() {
    this.canvas = document.getElementById('three-canvas');
    this.sceneManager = null;
    this.character = null;

    this.init();
  }

  init() {
    // 1. Three.js 씬 및 카메라/렌더러 초기화
    this.sceneManager = new SceneManager(this.canvas);

    // 2. 캐릭터 모델 로드 및 씬에 배치
    this.character = new CharacterModel(this.sceneManager.scene);

    // 3. UI 이벤트 바인딩
    this.bindUIEvents();

    // 4. 자동화 테스트 및 디버깅용 전역 훅 등록
    window.__CEREMONY_APP__ = {
      sceneManager: this.sceneManager,
      character: this.character
    };

    console.info('[Ceremony Maker] Milestone 1 초기화 완료');
  }

  bindUIEvents() {
    // 1. 포즈 프리셋 버튼 바인딩
    const poseButtons = document.querySelectorAll('[data-pose]');
    poseButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const poseName = btn.dataset.pose;
        this.character.applyPose(poseName);

        poseButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // 2. 스킨 스왑 버튼 바인딩
    const skinButtons = document.querySelectorAll('[data-skin]');
    skinButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const skinName = btn.dataset.skin;
        this.character.applySkin(skinName);

        skinButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // 3. 대두(Bobblehead) 슬라이더 바인딩
    const headSlider = document.getElementById('head-scale-slider');
    const headScaleVal = document.getElementById('head-scale-val');

    if (headSlider && headScaleVal) {
      headSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.character.setHeadScale(val);
        headScaleVal.textContent = `${val.toFixed(1)}x`;
      });
    }

    // 4. 카메라 뷰 프리셋 및 리셋 버튼 바인딩
    const camButtons = document.querySelectorAll('[data-cam]');
    camButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const camMode = btn.dataset.cam;
        this.sceneManager.setCameraView(camMode);

        camButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }
}

// DOM 준비 완료 시 구동
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
