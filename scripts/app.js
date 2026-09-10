/**
 * @file app.js
 * @description 축구장 세레모니 제조기 애플리케이션 진입점 및 UI 제어
 */
import { SceneManager } from './scene-manager.js';
import { CharacterModel } from './character-model.js';
import { FaceCropper } from './face-cropper.js';

class App {
  constructor() {
    this.canvas = document.getElementById('three-canvas');
    this.sceneManager = null;
    this.character = null;
    this.faceCropper = null;

    this.init();
  }

  init() {
    // 1. Three.js 씬 및 카메라/렌더러 초기화
    this.sceneManager = new SceneManager(this.canvas);

    // 2. 캐릭터 모델 로드 및 씬에 배치
    this.character = new CharacterModel(this.sceneManager.scene);

    // 3. 얼굴 사진 크롭 및 텍스처 추출 엔진 초기화 (Milestone 2)
    this.faceCropper = new FaceCropper({
      onFaceApplied: (texture, dataUrl) => {
        this.character.setFaceTexture(texture);
      },
      onError: (msg) => {
        console.warn('[FaceCropper] 업로드 거부:', msg);
      }
    });

    // 4. UI 이벤트 바인딩
    this.bindUIEvents();

    // 5. 기본 남성 선수 샘플 얼굴 초기 적용
    this.faceCropper.applySampleFace('male');

    // 6. 자동화 테스트 및 디버깅용 전역 훅 등록
    window.__CEREMONY_APP__ = {
      sceneManager: this.sceneManager,
      character: this.character,
      faceCropper: this.faceCropper
    };

    console.info('[Ceremony Maker] Milestone 2 초기화 완료');
  }

  bindUIEvents() {
    // 0. 얼굴 사진 업로드 & 크롭 관련 이벤트 바인딩 (Milestone 2)
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
