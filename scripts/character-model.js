/**
 * @file character-model.js
 * @description 볼 조인트 기반 프로 축구선수 체형 로우폴리 마네킹 캐릭터 모델
 * - 프로 남자 축구선수 역삼각형 체형 (넓은 어깨 + 슬림하고 단단한 골반 + 탄탄한 허벅지)
 * - 두상 표면 입체 굴곡에 정사영(Planar Projection)으로 완전 밀착 래핑되는 얼굴 텍스처
 * - 관절 결손 없는 볼 조인트(Ball-joint) 인체 연결
 * - 엄지 및 손가락 분할 손(Hand) 메쉬 구조
 * - 3대 콘셉트 스킨 스왑 (CLASSIC_DAISY, RETRO_JERSEY, GOLDEN_TROPHY)
 * - 4대 챌린지 포즈 (거제 야호: 한 손 확성기 + 한 손 갸루피스 + 한쪽 다리 들기)
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
    // 스킨 파트별 메쉬 레퍼런스
    this.skinMeshes = {
      skin: [],
      torso: [],
      shorts: [],
      joints: [],
      socks: [],
      shoes: [],
      head: [],
      all: []
    };

    this.currentSkin = 'CLASSIC_DAISY';
    this.currentPose = 'DEFAULT';
    this.headScale = 1.4;

    this.headMesh = null;
    this.faceCanvas = null;
    this.faceTexture = null;

    this.initModel();
    this.applySkin(this.currentSkin);
    this.setHeadScale(this.headScale);
    this.applyPose(this.currentPose);

    this.scene.add(this.group);
  }

  /**
   * 두상 표면에 직접 매핑될 기본 얼굴 텍스처 (1024x1024)
   */
  createDefaultFaceTexture() {
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 1024;
    this.faceCanvas.height = 1024;
    const ctx = this.faceCanvas.getContext('2d');

    ctx.fillStyle = '#e6dfd5';
    ctx.fillRect(0, 0, 1024, 1024);

    const cx = 512;
    const cy = 512;

    const grad = ctx.createRadialGradient(cx, cy, 80, cx, cy, 380);
    grad.addColorStop(0, '#f5efe8');
    grad.addColorStop(0.7, '#e4dcd2');
    grad.addColorStop(1, '#cbbfb0');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 380, 0, Math.PI * 2);
    ctx.fill();

    const eyeY = 460;
    const eyeDist = 110;

    // 눈
    ctx.fillStyle = '#1c1c1c';
    ctx.beginPath();
    ctx.ellipse(cx - eyeDist, eyeY, 34, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + eyeDist, eyeY, 34, 28, 0, 0, Math.PI * 2);
    ctx.fill();

    // 눈 하이라이트
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - eyeDist - 10, eyeY - 8, 10, 0, Math.PI * 2);
    ctx.arc(cx + eyeDist - 10, eyeY - 8, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - eyeDist + 12, eyeY + 6, 5, 0, Math.PI * 2);
    ctx.arc(cx + eyeDist + 12, eyeY + 6, 5, 0, Math.PI * 2);
    ctx.fill();

    // 홍조
    ctx.fillStyle = 'rgba(255, 115, 130, 0.4)';
    ctx.beginPath();
    ctx.ellipse(cx - 150, 535, 45, 25, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 150, 535, 45, 25, 0, 0, Math.PI * 2);
    ctx.fill();

    // 입
    ctx.strokeStyle = '#382a24';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, 585, 60, 0.18 * Math.PI, 0.82 * Math.PI, false);
    ctx.stroke();

    this.faceTexture = new THREE.CanvasTexture(this.faceCanvas);
    return this.faceTexture;
  }

  /**
   * 로우폴리곤 메쉬 생성 헬퍼
   */
  createPolyMesh(geo, category = 'skin', customMat = null) {
    const mat = customMat || new THREE.MeshStandardMaterial({
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
   * 관절 볼(Joint Sphere) 메쉬 생성
   */
  createJointBall(radius, category = 'joints') {
    const geo = new THREE.SphereGeometry(radius, 8, 6);
    return this.createPolyMesh(geo, category);
  }

  /**
   * 프로 남자 축구선수 체형 인체 모델링 조립
   * - 넓은 흉곽과 어깨 프레임 (역삼각형 상체)
   * - 좁고 단단한 남자 골반 (여성형 모래시계 골반 탈피)
   * - 탄탄한 대퇴부와 종아리
   */
  initModel() {
    this.group.position.set(0, 0, 0);

    // 1. 골반 (Hips - 남성 축구선수용 슬림 & 단단한 골반)
    const hipsGroup = new THREE.Group();
    hipsGroup.position.set(0, 0.94, 0);
    this.group.add(hipsGroup);
    this.joints.hips = hipsGroup;

    // 골반 너비를 0.18 -> 0.135로 대폭 축소하여 남성 골반 비율 형성
    const hipsGeo = new THREE.CylinderGeometry(0.14, 0.12, 0.19, 8);
    hipsGeo.scale(1.0, 1.0, 0.85); // 앞뒤 납작하고 단단한 축구선수 힙
    const hipsMesh = this.createPolyMesh(hipsGeo, 'shorts');
    hipsGroup.add(hipsMesh);

    // 2. 척추 및 허리/가슴 (Spine & Torso)
    const spineJoint = this.createJointBall(0.10, 'torso');
    spineJoint.position.set(0, 0.09, 0);
    hipsGroup.add(spineJoint);

    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 0.09, 0);
    hipsGroup.add(torsoGroup);
    this.joints.torso = torsoGroup;

    // 복부/허리 (Waist - 슬림하면서 단단한 코어)
    const waistGeo = new THREE.CylinderGeometry(0.16, 0.13, 0.16, 8);
    const waistMesh = this.createPolyMesh(waistGeo, 'torso');
    waistMesh.position.set(0, 0.08, 0);
    torsoGroup.add(waistMesh);

    // 가슴/흉곽 (Chest - 넓고 두터운 역삼각형 상체 프레임)
    const chestGeo = new THREE.CylinderGeometry(0.26, 0.16, 0.25, 8);
    const chestMesh = this.createPolyMesh(chestGeo, 'torso');
    chestMesh.position.set(0, 0.27, 0);
    chestMesh.scale.set(1.22, 1, 0.90); // 어깨 쪽으로 웅장하게 벌어지는 역삼각 상체
    torsoGroup.add(chestMesh);

    // 3. 목 (Neck)
    const neckJoint = this.createJointBall(0.08, 'skin');
    neckJoint.position.set(0, 0.40, 0);
    torsoGroup.add(neckJoint);

    const neckGroup = new THREE.Group();
    neckGroup.position.set(0, 0.40, 0);
    torsoGroup.add(neckGroup);
    this.joints.neck = neckGroup;

    const neckGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.11, 8);
    const neckMesh = this.createPolyMesh(neckGeo, 'skin');
    neckMesh.position.set(0, 0.055, 0);
    neckGroup.add(neckMesh);

    // 4. 머리 그룹 (Head Group)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.11, 0);
    neckGroup.add(headGroup);
    this.joints.head = headGroup;

    const headGeo = new THREE.SphereGeometry(0.25, 16, 12);
    headGeo.scale(0.92, 1.15, 0.98);

    // 전면 정사영 UV 매핑 (얼굴 텍스처 곡면 밀착)
    const pos = headGeo.attributes.position;
    const uvs = headGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      if (z >= -0.05) {
        const u = 0.5 + (x / 0.50);
        const v = 0.5 + (y / 0.58);
        uvs.setXY(i, Math.max(0.05, Math.min(0.95, u)), Math.max(0.05, Math.min(0.95, v)));
      } else {
        uvs.setXY(i, 0.05, 0.05);
      }
    }
    uvs.needsUpdate = true;

    this.createDefaultFaceTexture();
    const headMat = new THREE.MeshStandardMaterial({
      map: this.faceTexture,
      roughness: 0.5,
      metalness: 0.05,
      flatShading: true
    });
    this.headMesh = new THREE.Mesh(headGeo, headMat);
    this.headMesh.position.set(0, 0.20, 0);
    this.headMesh.castShadow = true;
    this.headMesh.receiveShadow = true;
    headGroup.add(this.headMesh);
    this.skinMeshes.head.push(this.headMesh);
    this.skinMeshes.all.push(this.headMesh);

    // 5. 넓은 남성형 어깨 및 상지 (Shoulder offset: ±0.32m로 넓혀 프로 축구선수 떡대 형성)
    this.setupArm(torsoGroup, 'left', -0.32);
    this.setupArm(torsoGroup, 'right', 0.32);

    // 6. 좁아진 골반에 맞춘 남성형 하지 (고관절 간격: ±0.10m로 좁힘)
    this.setupLeg(hipsGroup, 'left', -0.10);
    this.setupLeg(hipsGroup, 'right', 0.10);
  }

  /**
   * 상완 및 전완, 분할 손 구조
   */
  setupArm(parent, side, offsetX) {
    const isLeft = side === 'left';
    const sign = isLeft ? -1 : 1;

    // 떡 벌어진 어깨 관절 볼
    const shoulderBall = this.createJointBall(0.085, 'skin');
    shoulderBall.position.set(offsetX, 0.38, 0);
    parent.add(shoulderBall);

    const shoulderGroup = new THREE.Group();
    shoulderGroup.position.set(offsetX, 0.38, 0);
    parent.add(shoulderGroup);
    this.joints[`${side}Shoulder`] = shoulderGroup;

    // 상완
    const upperArmGeo = new THREE.CylinderGeometry(0.068, 0.055, 0.28, 8);
    const upperArmMesh = this.createPolyMesh(upperArmGeo, 'skin');
    upperArmMesh.position.set(0, -0.14, 0);
    shoulderGroup.add(upperArmMesh);

    // 팔꿈치
    const elbowBall = this.createJointBall(0.06, 'skin');
    elbowBall.position.set(0, -0.28, 0);
    shoulderGroup.add(elbowBall);

    const elbowGroup = new THREE.Group();
    elbowGroup.position.set(0, -0.28, 0);
    shoulderGroup.add(elbowGroup);
    this.joints[`${side}Elbow`] = elbowGroup;

    // 전완
    const forearmGeo = new THREE.CylinderGeometry(0.055, 0.048, 0.26, 8);
    const forearmMesh = this.createPolyMesh(forearmGeo, 'skin');
    forearmMesh.position.set(0, -0.13, 0);
    elbowGroup.add(forearmMesh);

    // 손목
    const wristBall = this.createJointBall(0.045, 'skin');
    wristBall.position.set(0, -0.26, 0);
    elbowGroup.add(wristBall);

    // 손
    const handGroup = new THREE.Group();
    handGroup.position.set(0, -0.26, 0);
    elbowGroup.add(handGroup);
    this.joints[`${side}Hand`] = handGroup;

    const palmGeo = new THREE.BoxGeometry(0.07, 0.08, 0.04);
    const palmMesh = this.createPolyMesh(palmGeo, 'skin');
    palmMesh.position.set(0, -0.04, 0);
    handGroup.add(palmMesh);

    const fingersGeo = new THREE.BoxGeometry(0.066, 0.06, 0.035);
    const fingersMesh = this.createPolyMesh(fingersGeo, 'skin');
    fingersMesh.position.set(0, -0.10, 0.002);
    handGroup.add(fingersMesh);

    const thumbGeo = new THREE.BoxGeometry(0.026, 0.05, 0.028);
    const thumbMesh = this.createPolyMesh(thumbGeo, 'skin');
    thumbMesh.position.set(sign * 0.045, -0.04, 0.015);
    thumbMesh.rotation.z = -sign * 0.45;
    handGroup.add(thumbMesh);
  }

  /**
   * 탄탄한 남성 축구선수 다리 조립
   */
  setupLeg(parent, side, offsetX) {
    // 고관절 볼
    const hipBall = this.createJointBall(0.085, 'shorts');
    hipBall.position.set(offsetX, -0.08, 0);
    parent.add(hipBall);

    const hipJoint = new THREE.Group();
    hipJoint.position.set(offsetX, -0.08, 0);
    parent.add(hipJoint);
    this.joints[`${side}Hip`] = hipJoint;

    // 허벅지 (탄탄한 축구선수 대퇴사두근)
    const thighGeo = new THREE.CylinderGeometry(0.10, 0.078, 0.40, 8);
    const thighMesh = this.createPolyMesh(thighGeo, 'skin');
    thighMesh.position.set(0, -0.20, 0);
    hipJoint.add(thighMesh);

    // 무릎
    const kneeBall = this.createJointBall(0.075, 'skin');
    kneeBall.position.set(0, -0.40, 0);
    hipJoint.add(kneeBall);

    const kneeGroup = new THREE.Group();
    kneeGroup.position.set(0, -0.40, 0);
    hipJoint.add(kneeGroup);
    this.joints[`${side}Knee`] = kneeGroup;

    // 정강이/양말
    const shinGeo = new THREE.CylinderGeometry(0.078, 0.062, 0.38, 8);
    const shinMesh = this.createPolyMesh(shinGeo, 'socks');
    shinMesh.position.set(0, -0.19, 0);
    kneeGroup.add(shinMesh);

    // 발목
    const ankleBall = this.createJointBall(0.055, 'shoes');
    ankleBall.position.set(0, -0.38, 0);
    kneeGroup.add(ankleBall);

    // 발
    const footGroup = new THREE.Group();
    footGroup.position.set(0, -0.38, 0);
    kneeGroup.add(footGroup);
    this.joints[`${side}Foot`] = footGroup;

    const footGeo = new THREE.BoxGeometry(0.10, 0.07, 0.22);
    const footMesh = this.createPolyMesh(footGeo, 'shoes');
    footMesh.position.set(0, -0.035, 0.05);
    footGroup.add(footMesh);

    const toeGeo = new THREE.BoxGeometry(0.09, 0.05, 0.08);
    const toeMesh = this.createPolyMesh(toeGeo, 'shoes');
    toeMesh.position.set(0, -0.045, 0.16);
    footGroup.add(toeMesh);
  }

  /**
   * 대두(Bobblehead) 슬라이더 조절
   */
  setHeadScale(scale) {
    this.headScale = Math.max(0.8, Math.min(2.5, scale));
    if (this.joints.head) {
      this.joints.head.scale.set(this.headScale, this.headScale, this.headScale);
    }
  }

  /**
   * 3대 콘셉트 스킨 스왑
   */
  applySkin(skinName) {
    this.currentSkin = skinName;

    // 1. CLASSIC_DAISY
    if (skinName === 'CLASSIC_DAISY') {
      const daisyColor = 0xe6dfd5;
      this.skinMeshes.all.forEach((mesh) => {
        if (mesh !== this.headMesh) {
          mesh.material.color.setHex(daisyColor);
          mesh.material.roughness = 0.5;
          mesh.material.metalness = 0.05;
          mesh.material.emissive.setHex(0x000000);
          mesh.material.needsUpdate = true;
        }
      });
      return;
    }

    // 2. RETRO_JERSEY
    if (skinName === 'RETRO_JERSEY') {
      const jerseyColor = 0xcc2222;
      const shortsColor = 0xf0f0f0;
      const skinTone = 0xf5d0b5;
      const socksColor = 0x1565c0;
      const shoesColor = 0x212121;

      this.skinMeshes.torso.forEach((m) => {
        m.material.color.setHex(jerseyColor);
        m.material.emissive.setHex(0x000000);
        m.material.needsUpdate = true;
      });
      this.skinMeshes.shorts.forEach((m) => {
        m.material.color.setHex(shortsColor);
        m.material.emissive.setHex(0x000000);
        m.material.needsUpdate = true;
      });
      this.skinMeshes.skin.forEach((m) => {
        m.material.color.setHex(skinTone);
        m.material.emissive.setHex(0x000000);
        m.material.needsUpdate = true;
      });
      this.skinMeshes.joints.forEach((m) => {
        m.material.color.setHex(skinTone);
        m.material.emissive.setHex(0x000000);
        m.material.needsUpdate = true;
      });
      this.skinMeshes.socks.forEach((m) => {
        m.material.color.setHex(socksColor);
        m.material.emissive.setHex(0x000000);
        m.material.needsUpdate = true;
      });
      this.skinMeshes.shoes.forEach((m) => {
        m.material.color.setHex(shoesColor);
        m.material.emissive.setHex(0x000000);
        m.material.needsUpdate = true;
      });
      return;
    }

    // 3. GOLDEN_TROPHY
    if (skinName === 'GOLDEN_TROPHY') {
      const goldColor = 0xffc800;
      this.skinMeshes.all.forEach((mesh) => {
        if (mesh !== this.headMesh) {
          mesh.material.color.setHex(goldColor);
          mesh.material.roughness = 0.3;
          mesh.material.metalness = 0.7;
          mesh.material.emissive.setHex(0x3a2e05);
          mesh.material.needsUpdate = true;
        }
      });
      return;
    }
  }

  /**
   * 관절 각도 초기화
   */
  resetJoints() {
    Object.values(this.joints).forEach((joint) => {
      joint.rotation.set(0, 0, 0);
      joint.position.y = joint.position.y;
    });
    this.group.position.set(0, 0, 0);
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
        // [리센느 미나미 거제 야호 시그니처 챌린지]:
        // 1. 오른손: 입가에 대어 "야호~" 외치는 한 손 확성기
        // 2. 왼손: 전방으로 손목을 꺾어 내미는 시그니처 갸루피스 (Gyaru Peace)
        // 3. 하체: 한쪽 다리(왼쪽 다리) 무릎을 번쩍 접어 뒤/옆으로 경쾌하게 들기 (외다리 밸런스)
        // 4. 상체: 활기차게 살짝 비틀고 젖히며 신난 분위기 연출

        // 상체 비틀기 & 신난 틸트
        j.torso.rotation.set(-0.10, 0.15, -0.08);
        j.neck.rotation.set(-0.05, -0.10, 0.10);
        j.head.rotation.set(-0.10, -0.10, 0.18); // 갸루 특유의 갸우뚱 각도

        // 우측 팔: 입가 한 손 확성기 ("야호~")
        j.rightShoulder.rotation.set(-1.25, -0.35, -0.40);
        j.rightElbow.rotation.set(-1.65, 0.20, 0.15);
        j.rightHand.rotation.set(0.10, -0.30, 0);

        // 좌측 팔: 전방을 향해 엣지있게 뻗은 갸루피스 (팔 앞으로 뻗고 손목 뒤집어 V자 각도)
        j.leftShoulder.rotation.set(-1.05, 0.40, 0.35);
        j.leftElbow.rotation.set(-0.35, 0.20, 0.85); // 팔꿈치 살짝 접어 앞으로 내밈
        j.leftHand.rotation.set(0.60, 0.40, -1.20); // 갸루피스 손목 꺾기

        // 지지하는 오른 다리: 탄탄하게 바닥 접지
        j.rightHip.rotation.set(0.02, 0, 0.05);

        // 번쩍 들어올린 왼 다리: 무릎을 90도 이상 뒤로 접어 발랄하게 치켜듦
        j.leftHip.rotation.set(-0.35, 0.25, -0.45); // 고관절 외전 및 후방 굴곡
        j.leftKnee.rotation.set(1.55, 0, -0.10);    // 무릎 90도 꺾기
        j.leftFoot.rotation.set(-0.25, 0, 0);
        break;

      case 'CHOI_SAN_BAD':
        // [최산 BAD]: 어깨 꺾기 + 날카로운 턱선
        j.torso.rotation.set(0.05, 0.35, -0.18);
        j.head.rotation.set(0.18, -0.55, 0.22);

        j.leftShoulder.rotation.set(-0.30, 0.40, 1.25);
        j.leftElbow.rotation.set(-1.60, 0.45, -0.20);

        j.rightShoulder.rotation.set(0.40, -0.10, -0.25);
        j.rightElbow.rotation.set(-0.25, 0, 0.15);

        j.hips.rotation.z = 0.08;
        j.leftHip.rotation.set(0.10, 0, -0.22);
        j.leftKnee.rotation.set(0.18, 0, 0);
        j.rightHip.rotation.set(-0.05, 0, 0.12);
        break;

      case 'RONALDO_SIU':
        // [호날두 시우]: 가슴 펴고 양팔 뒤로 뻗기
        j.torso.rotation.set(0.15, 0, 0);
        j.head.rotation.set(-0.18, 0, 0);

        j.leftShoulder.rotation.set(0.85, -0.25, 0.55);
        j.leftElbow.rotation.set(-0.20, 0, -0.10);
        j.rightShoulder.rotation.set(0.85, 0.25, -0.55);
        j.rightElbow.rotation.set(-0.20, 0, 0.10);

        j.leftHip.rotation.set(-0.15, 0, -0.32);
        j.leftKnee.rotation.set(0.25, 0, 0);
        j.rightHip.rotation.set(-0.15, 0, 0.32);
        j.rightKnee.rotation.set(0.25, 0, 0);
        break;

      case 'CUTE_HEART':
        // [축구장 볼하트]: 양손 뺨 옆 볼하트 포즈
        j.torso.rotation.set(0.05, 0.05, 0.02);
        j.head.rotation.set(0.08, 0.05, 0.20);

        j.leftShoulder.rotation.set(-1.20, 0.55, 0.85);
        j.leftElbow.rotation.set(-1.95, 0.10, -0.25);
        j.rightShoulder.rotation.set(-1.20, -0.55, -0.85);
        j.rightElbow.rotation.set(-1.95, -0.10, 0.25);

        j.leftHip.rotation.set(-0.10, 0.10, 0.12);
        j.leftKnee.rotation.set(0.32, 0, 0);
        j.rightHip.rotation.set(0.05, 0, -0.05);
        break;

      case 'DEFAULT':
      default:
        // 프로 남자 축구선수 기본 당당한 스탠스 (어깨너비 당당한 벌림)
        j.leftShoulder.rotation.set(0, 0, 0.12);
        j.rightShoulder.rotation.set(0, 0, -0.12);
        j.leftHip.rotation.set(0, 0, -0.06);
        j.rightHip.rotation.set(0, 0, 0.06);
        break;
    }
  }

  /**
   * 얼굴 텍스처 교체
   */
  setFaceTexture(texture) {
    if (this.headMesh && texture) {
      this.headMesh.material.map = texture;
      this.headMesh.material.needsUpdate = true;
    }
  }
}
