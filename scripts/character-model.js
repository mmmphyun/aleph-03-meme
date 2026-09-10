/**
 * @file character-model.js
 * @description Daisy Bell 스타일의 6~8각 로우폴리곤 마네킹 캐릭터 모델
 * - 관절 계층 구조 (Rigging)
 * - 3대 콘셉트 스킨 스왑 (CLASSIC_DAISY, RETRO_JERSEY, GOLDEN_TROPHY)
 * - 챌린지 포즈 프리셋 4종 (GEOJE_YAHO, CHOI_SAN_BAD, RONALDO_SIU, CUTE_HEART)
 * - 대두(Bobblehead) 실시간 스케일 제어
 */
import * as THREE from 'three';

export class CharacterModel {
  /**
   * @param {THREE.Scene} scene - Three.js 씬 인스턴스
   */
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();

    // 관절 노드 레퍼런스
    this.joints = {};
    // 스킨 파트별 메쉬 레퍼런스 (머티리얼 교체용)
    this.skinMeshes = {
      skin: [],    // 피부 파트 (팔, 다리 등)
      torso: [],   // 몸통 (유니폼/상의)
      shorts: [],  // 반바지/골반
      socks: [],   // 양말
      shoes: [],   // 신발
      head: [],    // 두상
      all: []      // 전체 일괄 적용용
    };

    // 현재 상태
    this.currentSkin = 'CLASSIC_DAISY';
    this.currentPose = 'DEFAULT';
    this.headScale = 1.4; // 기본 대두미 1.4배

    // 얼굴 텍스처 평면 메쉬
    this.facePlane = null;
    this.defaultFaceTexture = null;

    this.initModel();
    this.applySkin(this.currentSkin);
    this.setHeadScale(this.headScale);
    this.applyPose(this.currentPose);

    this.scene.add(this.group);
  }

  /**
   * Daisy Bell 감성의 기본 기괴·코믹 얼굴 텍스처 생성 (Canvas 2D 절차적 생성)
   * @returns {THREE.CanvasTexture}
   */
  createDefaultFaceTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // 투명 배경
    ctx.clearRect(0, 0, 512, 512);

    // 연한 피부톤 원형 마스크 베이스
    ctx.fillStyle = '#e6dfd5';
    ctx.beginPath();
    ctx.ellipse(256, 256, 190, 230, 0, 0, Math.PI * 2);
    ctx.fill();

    // Daisy Bell 특유의 묘한 무표정 눈 (검은 타원)
    ctx.fillStyle = '#222222';
    // 좌안
    ctx.beginPath();
    ctx.ellipse(190, 220, 26, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    // 우안
    ctx.beginPath();
    ctx.ellipse(322, 220, 26, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // 눈 하이라이트 작은 백색 점
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(184, 214, 7, 0, Math.PI * 2);
    ctx.arc(316, 214, 7, 0, Math.PI * 2);
    ctx.fill();

    // 앙증맞은 볼터치 (연분홍)
    ctx.fillStyle = 'rgba(255, 120, 140, 0.4)';
    ctx.beginPath();
    ctx.ellipse(160, 270, 35, 20, 0, 0, Math.PI * 2);
    ctx.ellipse(352, 270, 35, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // 묘한 미소/일자 입 (Uncanny Lip)
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(256, 310, 45, 0.15 * Math.PI, 0.85 * Math.PI, false);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * 로우폴리 메쉬 생성 헬퍼 (Flat Shading 적용된 각진 지오메트리)
   */
  createPolyMesh(geo, category = 'skin') {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe6dfd5,
      roughness: 0.5,
      metalness: 0.05,
      flatShading: true
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (this.skinMeshes[category]) {
      this.skinMeshes[category].push(mesh);
    }
    this.skinMeshes.all.push(mesh);
    return mesh;
  }

  /**
   * 로우폴리곤 마네킹 인체 계층 구조(Hierarchical Rig) 조립
   */
  initModel() {
    // 0. 최하위 베이스 높이 (캐릭터 발이 잔디 Y=0에 정확히 접지되도록 조절)
    this.group.position.set(0, 0, 0);

    // 1. 골반 (Hips) - 전체 상체/하체 분기점 (y: 0.95m)
    const hipsGroup = new THREE.Group();
    hipsGroup.position.set(0, 0.96, 0);
    this.group.add(hipsGroup);
    this.joints.hips = hipsGroup;

    // 골반 메쉬 (6각 기둥)
    const hipsGeo = new THREE.CylinderGeometry(0.20, 0.16, 0.22, 6);
    const hipsMesh = this.createPolyMesh(hipsGeo, 'shorts');
    hipsGroup.add(hipsMesh);

    // 2. 몸통/흉부 (Torso/Spine)
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 0.11, 0); // 골반 상단에 연결
    hipsGroup.add(torsoGroup);
    this.joints.torso = torsoGroup;

    // 복부-가슴 역삼각 각진 메쉬 (상단 폭 0.26, 하단 폭 0.18, 높이 0.44, 7각형)
    const torsoGeo = new THREE.CylinderGeometry(0.26, 0.18, 0.44, 7);
    const torsoMesh = this.createPolyMesh(torsoGeo, 'torso');
    torsoMesh.position.set(0, 0.22, 0);
    torsoGroup.add(torsoMesh);

    // 3. 목 (Neck)
    const neckGroup = new THREE.Group();
    neckGroup.position.set(0, 0.44, 0);
    torsoGroup.add(neckGroup);
    this.joints.neck = neckGroup;

    const neckGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.12, 6);
    const neckMesh = this.createPolyMesh(neckGeo, 'skin');
    neckMesh.position.set(0, 0.06, 0);
    neckGroup.add(neckMesh);

    // 4. 머리 그룹 (Head Group - 대두 슬라이더 제어 대상)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.12, 0);
    neckGroup.add(headGroup);
    this.joints.head = headGroup;

    // Daisy Bell 스타일의 각진 다면체 두상 (IcosahedronGeometry detail=0)
    const headGeo = new THREE.IcosahedronGeometry(0.25, 0);
    const headMesh = this.createPolyMesh(headGeo, 'head');
    headMesh.position.set(0, 0.16, 0);
    headGroup.add(headMesh);

    // 얼굴 정면 텍스처 평면 메쉬 (정면 z=0.22에 배치)
    this.defaultFaceTexture = this.createDefaultFaceTexture();
    const faceMat = new THREE.MeshBasicMaterial({
      map: this.defaultFaceTexture,
      transparent: true,
      depthWrite: false
    });
    const faceGeo = new THREE.PlaneGeometry(0.38, 0.42);
    this.facePlane = new THREE.Mesh(faceGeo, faceMat);
    this.facePlane.position.set(0, 0.16, 0.235);
    headGroup.add(this.facePlane);

    // 5. 어깨 및 상지 (Shoulder, Arm, Forearm, Hand)
    this.setupArm(torsoGroup, 'left', -0.30);
    this.setupArm(torsoGroup, 'right', 0.30);

    // 6. 골반 및 하지 (Thigh, Knee, Shin, Foot)
    this.setupLeg(hipsGroup, 'left', -0.13);
    this.setupLeg(hipsGroup, 'right', 0.13);
  }

  /**
   * 팔 (어깨 관절 -> 상완 -> 팔꿈치 -> 전완 -> 손) 조립
   */
  setupArm(parent, side, offsetX) {
    const isLeft = side === 'left';
    const sign = isLeft ? -1 : 1;

    // 어깨 관절 피벗
    const shoulderGroup = new THREE.Group();
    shoulderGroup.position.set(offsetX, 0.36, 0);
    parent.add(shoulderGroup);
    this.joints[`${side}Shoulder`] = shoulderGroup;

    // 상완 (Upper Arm)
    const upperArmGeo = new THREE.CylinderGeometry(0.065, 0.055, 0.28, 6);
    const upperArmMesh = this.createPolyMesh(upperArmGeo, 'skin');
    upperArmMesh.position.set(0, -0.14, 0);
    shoulderGroup.add(upperArmMesh);

    // 팔꿈치 관절 피벗
    const elbowGroup = new THREE.Group();
    elbowGroup.position.set(0, -0.28, 0);
    shoulderGroup.add(elbowGroup);
    this.joints[`${side}Elbow`] = elbowGroup;

    // 전완 (Forearm)
    const forearmGeo = new THREE.CylinderGeometry(0.055, 0.05, 0.26, 6);
    const forearmMesh = this.createPolyMesh(forearmGeo, 'skin');
    forearmMesh.position.set(0, -0.13, 0);
    elbowGroup.add(forearmMesh);

    // 손 (Hand - 각진 주먹 형태)
    const handGroup = new THREE.Group();
    handGroup.position.set(0, -0.26, 0);
    elbowGroup.add(handGroup);
    this.joints[`${side}Hand`] = handGroup;

    const handGeo = new THREE.BoxGeometry(0.08, 0.10, 0.08);
    const handMesh = this.createPolyMesh(handGeo, 'skin');
    handMesh.position.set(0, -0.05, 0);
    handGroup.add(handMesh);
  }

  /**
   * 다리 (고관절 -> 대퇴부/허벅지 -> 무릎 -> 하퇴/정강이 -> 발) 조립
   */
  setupLeg(parent, side, offsetX) {
    // 고관절 피벗
    const hipJoint = new THREE.Group();
    hipJoint.position.set(offsetX, -0.10, 0);
    parent.add(hipJoint);
    this.joints[`${side}Hip`] = hipJoint;

    // 대퇴부 허벅지 (Thigh)
    const thighGeo = new THREE.CylinderGeometry(0.09, 0.075, 0.40, 6);
    const thighMesh = this.createPolyMesh(thighGeo, 'skin');
    thighMesh.position.set(0, -0.20, 0);
    hipJoint.add(thighMesh);

    // 무릎 관절 피벗
    const kneeGroup = new THREE.Group();
    kneeGroup.position.set(0, -0.40, 0);
    hipJoint.add(kneeGroup);
    this.joints[`${side}Knee`] = kneeGroup;

    // 정강이/하퇴 (Shin - 양말 파트)
    const shinGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.38, 6);
    const shinMesh = this.createPolyMesh(shinGeo, 'socks');
    shinMesh.position.set(0, -0.19, 0);
    kneeGroup.add(shinMesh);

    // 발 (Foot - 신발 파트)
    const footGroup = new THREE.Group();
    footGroup.position.set(0, -0.38, 0);
    kneeGroup.add(footGroup);
    this.joints[`${side}Foot`] = footGroup;

    const footGeo = new THREE.BoxGeometry(0.11, 0.08, 0.22);
    const footMesh = this.createPolyMesh(footGeo, 'shoes');
    footMesh.position.set(0, -0.04, 0.05); // 발 앞쪽으로 살짝 돌출
    footGroup.add(footMesh);
  }

  /**
   * 대두(Bobblehead) 슬라이더 실시간 크기 조절
   * @param {number} scale - 머리 크기 배율 (0.8 ~ 2.5)
   */
  setHeadScale(scale) {
    this.headScale = Math.max(0.8, Math.min(2.5, scale));
    if (this.joints.head) {
      this.joints.head.scale.set(this.headScale, this.headScale, this.headScale);
    }
  }

  /**
   * 3대 콘셉트 스킨 스왑 적용
   * @param {'CLASSIC_DAISY'|'RETRO_JERSEY'|'GOLDEN_TROPHY'} skinName
   */
  applySkin(skinName) {
    this.currentSkin = skinName;

    // 1. CLASSIC_DAISY: 창백한 회백색 무광 플라스틱 (Daisy Bell 원조 감성)
    if (skinName === 'CLASSIC_DAISY') {
      const daisyColor = 0xe6dfd5;
      this.skinMeshes.all.forEach((mesh) => {
        mesh.material.color.setHex(daisyColor);
        mesh.material.roughness = 0.5;
        mesh.material.metalness = 0.05;
        mesh.material.flatShading = true;
        mesh.material.map = null;
        mesh.material.needsUpdate = true;
      });
      return;
    }

    // 2. RETRO_JERSEY: 축구 유니폼 투톤 (상체 빨강+파랑 세로 줄무늬, 하체 백색 반바지, 양말, 축구화)
    if (skinName === 'RETRO_JERSEY') {
      // 상체 유니폼 (강렬한 레트로 레드/블루)
      const jerseyColor = 0xcc2222;
      const shortsColor = 0xf0f0f0;
      const skinTone = 0xf7d3ba;
      const socksColor = 0x1565c0;
      const shoesColor = 0x212121;

      this.skinMeshes.torso.forEach((mesh) => {
        mesh.material.color.setHex(jerseyColor);
        mesh.material.roughness = 0.7;
        mesh.material.metalness = 0.1;
        mesh.material.needsUpdate = true;
      });

      this.skinMeshes.shorts.forEach((mesh) => {
        mesh.material.color.setHex(shortsColor);
        mesh.material.roughness = 0.7;
        mesh.material.metalness = 0.05;
        mesh.material.needsUpdate = true;
      });

      this.skinMeshes.skin.forEach((mesh) => {
        mesh.material.color.setHex(skinTone);
        mesh.material.roughness = 0.5;
        mesh.material.metalness = 0.05;
        mesh.material.needsUpdate = true;
      });

      this.skinMeshes.socks.forEach((mesh) => {
        mesh.material.color.setHex(socksColor);
        mesh.material.roughness = 0.7;
        mesh.material.metalness = 0.05;
        mesh.material.needsUpdate = true;
      });

      this.skinMeshes.shoes.forEach((mesh) => {
        mesh.material.color.setHex(shoesColor);
        mesh.material.roughness = 0.4;
        mesh.material.metalness = 0.2;
        mesh.material.needsUpdate = true;
      });

      this.skinMeshes.head.forEach((mesh) => {
        mesh.material.color.setHex(skinTone);
        mesh.material.roughness = 0.5;
        mesh.material.metalness = 0.05;
        mesh.material.needsUpdate = true;
      });
      return;
    }

    // 3. GOLDEN_TROPHY: 전신 고광택 메탈릭 골드 (발롱도르 세레모니 트로피)
    if (skinName === 'GOLDEN_TROPHY') {
      const goldColor = 0xffc800;
      this.skinMeshes.all.forEach((mesh) => {
        mesh.material.color.setHex(goldColor);
        mesh.material.roughness = 0.3;
        mesh.material.metalness = 0.7;
        mesh.material.emissive = new THREE.Color(0x3a2e05);
        mesh.material.needsUpdate = true;
      });
      return;
    }
    // 다른 스킨으로 변경될 때 emissive 리셋
    this.skinMeshes.all.forEach((mesh) => {
      mesh.material.emissive = new THREE.Color(0x000000);
    });
  }

  /**
   * 모든 관절 회전값을 0으로 리셋 (차렷/기본 스탠딩)
   */
  resetJoints() {
    Object.values(this.joints).forEach((joint) => {
      joint.rotation.set(0, 0, 0);
      joint.position.x = joint.position.x; // 초기 위치 유지
    });
  }

  /**
   * 챌린지 포즈 프리셋 적용
   * @param {'DEFAULT'|'GEOJE_YAHO'|'CHOI_SAN_BAD'|'RONALDO_SIU'|'CUTE_HEART'} poseName
   */
  applyPose(poseName) {
    this.currentPose = poseName;
    this.resetJoints();

    const j = this.joints;

    switch (poseName) {
      case 'GEOJE_YAHO':
        // [리센느 거제 야호]: 젖힌 상체 + 양손 입가 확성기 모양 + 포효
        j.torso.rotation.x = -0.28; // 상체를 뒤로 과감히 젖힘
        j.neck.rotation.x = -0.15;
        j.head.rotation.x = -0.20; // 턱을 치켜들고 하늘을 봄

        // 양팔 들어올려 양손을 입 바로 앞으로 모음 (확성기 손동작)
        j.leftShoulder.rotation.set(-1.15, 0.45, 0.60);
        j.leftElbow.rotation.set(-1.45, 0, -0.30);
        j.rightShoulder.rotation.set(-1.15, -0.45, -0.60);
        j.rightElbow.rotation.set(-1.45, 0, 0.30);

        // 하체: 살짝 어깨너비로 벌리고 선 자세
        j.leftHip.rotation.set(0.05, 0, -0.15);
        j.rightHip.rotation.set(0.05, 0, 0.15);
        break;

      case 'CHOI_SAN_BAD':
        // [최산 BAD]: 치명적 어깨 꺾기 + 턱선 각도 + 삐딱한 엣지
        j.torso.rotation.set(0.05, 0.35, -0.18); // 몸통을 삐딱하게 비틀고 기울임
        j.head.rotation.set(0.18, -0.55, 0.22); // 날카로운 턱선을 살려 반대편으로 고개 돌림

        // 좌측 어깨를 과감하게 치켜올리고 꺾음
        j.leftShoulder.rotation.set(-0.30, 0.40, 1.25);
        j.leftElbow.rotation.set(-1.60, 0.45, -0.20);

        // 우측 팔은 쿨하게 뒤쪽 하단으로 흘려내림
        j.rightShoulder.rotation.set(0.40, -0.10, -0.25);
        j.rightElbow.rotation.set(-0.25, 0, 0.15);

        // 골반과 다리: 짝다리 짚은 폼
        j.hips.rotation.z = 0.08;
        j.leftHip.rotation.set(0.10, 0, -0.22);
        j.leftKnee.rotation.set(0.18, 0, 0);
        j.rightHip.rotation.set(-0.05, 0, 0.12);
        break;

      case 'RONALDO_SIU':
        // [호날두 시우]: 공중 착지 직후 양팔 뒤로 뻗고 가슴 펴며 'SIUUU'
        j.torso.rotation.set(0.15, 0, 0); // 가슴 활짝 전방 돌출
        j.head.rotation.set(-0.18, 0, 0); // 정면 살짝 위를 당당히 응시

        // 양팔을 뒤쪽 아래로 강렬하게 뻗어 날개처럼 펼침
        j.leftShoulder.rotation.set(0.85, -0.25, 0.55);
        j.leftElbow.rotation.set(-0.20, 0, -0.10);
        j.rightShoulder.rotation.set(0.85, 0.25, -0.55);
        j.rightElbow.rotation.set(-0.20, 0, 0.10);

        // 하체: 다리를 넓게 벌려 무게중심을 낮춘 착지 자세
        j.leftHip.rotation.set(-0.15, 0, -0.32);
        j.leftKnee.rotation.set(0.25, 0, 0);
        j.rightHip.rotation.set(-0.15, 0, 0.32);
        j.rightKnee.rotation.set(0.25, 0, 0);
        break;

      case 'CUTE_HEART':
        // [축구장 볼하트]: 양손을 얼굴/볼 양옆에 앙증맞게 대는 애교 세레모니
        j.torso.rotation.set(0.05, 0.05, 0.02);
        j.head.rotation.set(0.08, 0.05, 0.20); // 갸우뚱 큐트 틸트

        // 양팔을 접어 양손을 뺨 옆에 하트 모양으로 가져감
        j.leftShoulder.rotation.set(-1.20, 0.55, 0.85);
        j.leftElbow.rotation.set(-1.95, 0.10, -0.25);
        j.rightShoulder.rotation.set(-1.20, -0.55, -0.85);
        j.rightElbow.rotation.set(-1.95, -0.10, 0.25);

        // 하체: 살짝 꼬은 귀여운 다리 각도
        j.leftHip.rotation.set(-0.10, 0.10, 0.12);
        j.leftKnee.rotation.set(0.32, 0, 0);
        j.rightHip.rotation.set(0.05, 0, -0.05);
        break;

      case 'DEFAULT':
      default:
        // 기본 자연스러운 대기 자세
        j.leftShoulder.rotation.set(0, 0, 0.15);
        j.rightShoulder.rotation.set(0, 0, -0.15);
        j.leftHip.rotation.set(0, 0, -0.08);
        j.rightHip.rotation.set(0, 0, 0.08);
        break;
    }
  }

  /**
   * 얼굴 텍스처 교체 (Milestone 2 연동 대비)
   * @param {THREE.Texture} texture
   */
  setFaceTexture(texture) {
    if (this.facePlane && texture) {
      this.facePlane.material.map = texture;
      this.facePlane.material.needsUpdate = true;
    }
  }
}
