/**
 * @file character-model.js
 * @description 볼 조인트 기반 스타일라이즈드 로우폴리 마네킹 캐릭터 모델
 * - 두상 표면 입체 굴곡에 정사영(Planar Projection)으로 완전 밀착 래핑되는 얼굴 텍스처
 * - 관절 결손 없는 볼 조인트(Ball-joint) 인체 연결
 * - 엄지 및 손가락 분할 손(Hand) 메쉬 구조
 * - 3대 콘셉트 스킨 스왑 (CLASSIC_DAISY, RETRO_JERSEY, GOLDEN_TROPHY)
 * - 4대 챌린지 포즈 및 대두 슬라이더 지원
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
      skin: [],    // 피부/사지
      torso: [],   // 가슴/복부
      shorts: [],  // 골반/반바지
      joints: [],  // 관절 구체
      socks: [],   // 양말
      shoes: [],   // 신발
      head: [],    // 두상
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

    // 베이스 배경
    ctx.fillStyle = '#e6dfd5';
    ctx.fillRect(0, 0, 1024, 1024);

    const cx = 512;
    const cy = 512;

    // 은은한 안면부 그라데이션
    const grad = ctx.createRadialGradient(cx, cy, 80, cx, cy, 380);
    grad.addColorStop(0, '#f5efe8');
    grad.addColorStop(0.7, '#e4dcd2');
    grad.addColorStop(1, '#cbbfb0');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 380, 0, Math.PI * 2);
    ctx.fill();

    // Daisy Bell 특유의 기묘하고 또렷한 눈 (정면 중앙)
    const eyeY = 460;
    const eyeDist = 110;

    // 좌안 / 우안 베이스
    ctx.fillStyle = '#1c1c1c';
    ctx.beginPath();
    ctx.ellipse(cx - eyeDist, eyeY, 34, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + eyeDist, eyeY, 34, 28, 0, 0, Math.PI * 2);
    ctx.fill();

    // 눈동자 하이라이트
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - eyeDist - 10, eyeY - 8, 10, 0, Math.PI * 2);
    ctx.arc(cx + eyeDist - 10, eyeY - 8, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - eyeDist + 12, eyeY + 6, 5, 0, Math.PI * 2);
    ctx.arc(cx + eyeDist + 12, eyeY + 6, 5, 0, Math.PI * 2);
    ctx.fill();

    // 볼터치 (연분홍 홍조)
    ctx.fillStyle = 'rgba(255, 115, 130, 0.4)';
    ctx.beginPath();
    ctx.ellipse(cx - 150, 535, 45, 25, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 150, 535, 45, 25, 0, 0, Math.PI * 2);
    ctx.fill();

    // 살짝 미소 짓는 입술선
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
   * 인체 모델링 조립
   */
  initModel() {
    this.group.position.set(0, 0, 0);

    // 1. 골반 (Hips)
    const hipsGroup = new THREE.Group();
    hipsGroup.position.set(0, 0.94, 0);
    this.group.add(hipsGroup);
    this.joints.hips = hipsGroup;

    // 골반 본체
    const hipsGeo = new THREE.CylinderGeometry(0.18, 0.14, 0.20, 8);
    const hipsMesh = this.createPolyMesh(hipsGeo, 'shorts');
    hipsGroup.add(hipsMesh);

    // 2. 척추 및 허리/가슴 (Spine & Torso)
    const spineJoint = this.createJointBall(0.12, 'torso');
    spineJoint.position.set(0, 0.10, 0);
    hipsGroup.add(spineJoint);

    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 0.10, 0);
    hipsGroup.add(torsoGroup);
    this.joints.torso = torsoGroup;

    // 복부 (Waist)
    const waistGeo = new THREE.CylinderGeometry(0.17, 0.14, 0.16, 8);
    const waistMesh = this.createPolyMesh(waistGeo, 'torso');
    waistMesh.position.set(0, 0.08, 0);
    torsoGroup.add(waistMesh);

    // 가슴/흉곽 (Chest)
    const chestGeo = new THREE.CylinderGeometry(0.23, 0.17, 0.24, 8);
    const chestMesh = this.createPolyMesh(chestGeo, 'torso');
    chestMesh.position.set(0, 0.26, 0);
    chestMesh.scale.set(1.15, 1, 0.85);
    torsoGroup.add(chestMesh);

    // 3. 목 (Neck)
    const neckJoint = this.createJointBall(0.08, 'skin');
    neckJoint.position.set(0, 0.38, 0);
    torsoGroup.add(neckJoint);

    const neckGroup = new THREE.Group();
    neckGroup.position.set(0, 0.38, 0);
    torsoGroup.add(neckGroup);
    this.joints.neck = neckGroup;

    const neckGeo = new THREE.CylinderGeometry(0.075, 0.085, 0.12, 8);
    const neckMesh = this.createPolyMesh(neckGeo, 'skin');
    neckMesh.position.set(0, 0.06, 0);
    neckGroup.add(neckMesh);

    // 4. 머리 그룹 (Head Group - 전면 정사영 UV 매핑)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.12, 0);
    neckGroup.add(headGroup);
    this.joints.head = headGroup;

    // 두상 지오메트리 (계란형 입체 구체)
    const headGeo = new THREE.SphereGeometry(0.25, 16, 12);
    headGeo.scale(0.92, 1.15, 0.98);

    // [핵심] 전면 정사영(Frontal Planar Projection) UV 재계산:
    // 2D 평면 종이 가면을 없애고 두상의 3D 굴곡을 그대로 타면서 왜곡 없이 밀착 래핑
    const pos = headGeo.attributes.position;
    const uvs = headGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      if (z >= -0.05) {
        // 전면: [-0.23, 0.23] 폭과 [-0.28, 0.28] 높이를 UV [0.1, 0.9]에 대응
        const u = 0.5 + (x / 0.50);
        const v = 0.5 + (y / 0.58);
        uvs.setXY(i, Math.max(0.05, Math.min(0.95, u)), Math.max(0.05, Math.min(0.95, v)));
      } else {
        // 후면: 피부 단색 영역(좌측 상단 여백)으로 압축 매핑
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

    // 5. 어깨 및 상지 (Shoulder, Arm, Forearm, Hand)
    this.setupArm(torsoGroup, 'left', -0.28);
    this.setupArm(torsoGroup, 'right', 0.28);

    // 6. 골반 및 하지 (Thigh, Knee, Shin, Foot)
    this.setupLeg(hipsGroup, 'left', -0.13);
    this.setupLeg(hipsGroup, 'right', 0.13);
  }

  /**
   * 볼 조인트 팔 및 엄지/손가락 분할 손 조립
   */
  setupArm(parent, side, offsetX) {
    const isLeft = side === 'left';
    const sign = isLeft ? -1 : 1;

    // 어깨 관절 볼
    const shoulderBall = this.createJointBall(0.08, 'skin');
    shoulderBall.position.set(offsetX, 0.36, 0);
    parent.add(shoulderBall);

    // 어깨 회전 피벗
    const shoulderGroup = new THREE.Group();
    shoulderGroup.position.set(offsetX, 0.36, 0);
    parent.add(shoulderGroup);
    this.joints[`${side}Shoulder`] = shoulderGroup;

    // 상완 (테이퍼드)
    const upperArmGeo = new THREE.CylinderGeometry(0.065, 0.052, 0.28, 8);
    const upperArmMesh = this.createPolyMesh(upperArmGeo, 'skin');
    upperArmMesh.position.set(0, -0.14, 0);
    shoulderGroup.add(upperArmMesh);

    // 팔꿈치 관절 볼
    const elbowBall = this.createJointBall(0.06, 'skin');
    elbowBall.position.set(0, -0.28, 0);
    shoulderGroup.add(elbowBall);

    // 팔꿈치 회전 피벗
    const elbowGroup = new THREE.Group();
    elbowGroup.position.set(0, -0.28, 0);
    shoulderGroup.add(elbowGroup);
    this.joints[`${side}Elbow`] = elbowGroup;

    // 전완 (테이퍼드)
    const forearmGeo = new THREE.CylinderGeometry(0.052, 0.045, 0.26, 8);
    const forearmMesh = this.createPolyMesh(forearmGeo, 'skin');
    forearmMesh.position.set(0, -0.13, 0);
    elbowGroup.add(forearmMesh);

    // 손목 관절 볼
    const wristBall = this.createJointBall(0.045, 'skin');
    wristBall.position.set(0, -0.26, 0);
    elbowGroup.add(wristBall);

    // 손 (Hand) - 손바닥 + 독립 엄지손가락 + 4손가락 블록
    const handGroup = new THREE.Group();
    handGroup.position.set(0, -0.26, 0);
    elbowGroup.add(handGroup);
    this.joints[`${side}Hand`] = handGroup;

    // 손바닥
    const palmGeo = new THREE.BoxGeometry(0.07, 0.08, 0.04);
    const palmMesh = this.createPolyMesh(palmGeo, 'skin');
    palmMesh.position.set(0, -0.04, 0);
    handGroup.add(palmMesh);

    // 4손가락 블록
    const fingersGeo = new THREE.BoxGeometry(0.066, 0.06, 0.035);
    const fingersMesh = this.createPolyMesh(fingersGeo, 'skin');
    fingersMesh.position.set(0, -0.10, 0.002);
    handGroup.add(fingersMesh);

    // 엄지손가락
    const thumbGeo = new THREE.BoxGeometry(0.026, 0.05, 0.028);
    const thumbMesh = this.createPolyMesh(thumbGeo, 'skin');
    thumbMesh.position.set(sign * 0.045, -0.04, 0.015);
    thumbMesh.rotation.z = -sign * 0.45;
    handGroup.add(thumbMesh);
  }

  /**
   * 볼 조인트 다리 및 발 조립
   */
  setupLeg(parent, side, offsetX) {
    // 고관절 볼
    const hipBall = this.createJointBall(0.09, 'shorts');
    hipBall.position.set(offsetX, -0.08, 0);
    parent.add(hipBall);

    // 고관절 피벗
    const hipJoint = new THREE.Group();
    hipJoint.position.set(offsetX, -0.08, 0);
    parent.add(hipJoint);
    this.joints[`${side}Hip`] = hipJoint;

    // 허벅지 (테이퍼드)
    const thighGeo = new THREE.CylinderGeometry(0.095, 0.075, 0.40, 8);
    const thighMesh = this.createPolyMesh(thighGeo, 'skin');
    thighMesh.position.set(0, -0.20, 0);
    hipJoint.add(thighMesh);

    // 무릎 관절 볼
    const kneeBall = this.createJointBall(0.075, 'skin');
    kneeBall.position.set(0, -0.40, 0);
    hipJoint.add(kneeBall);

    // 무릎 피벗
    const kneeGroup = new THREE.Group();
    kneeGroup.position.set(0, -0.40, 0);
    hipJoint.add(kneeGroup);
    this.joints[`${side}Knee`] = kneeGroup;

    // 정강이/양말 (테이퍼드)
    const shinGeo = new THREE.CylinderGeometry(0.075, 0.060, 0.38, 8);
    const shinMesh = this.createPolyMesh(shinGeo, 'socks');
    shinMesh.position.set(0, -0.19, 0);
    kneeGroup.add(shinMesh);

    // 발목 관절 볼
    const ankleBall = this.createJointBall(0.055, 'shoes');
    ankleBall.position.set(0, -0.38, 0);
    kneeGroup.add(ankleBall);

    // 발 (축구화)
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
   * 대두(Bobblehead) 슬라이더 실시간 크기 조절
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
   * 모든 관절 회전값 초기화
   */
  resetJoints() {
    Object.values(this.joints).forEach((joint) => {
      joint.rotation.set(0, 0, 0);
    });
  }

  /**
   * 챌린지 포즈 프리셋 적용
   */
  applyPose(poseName) {
    this.currentPose = poseName;
    this.resetJoints();

    const j = this.joints;

    switch (poseName) {
      case 'GEOJE_YAHO':
        // [리센느 거제 야호]: 젖힌 상체 + 양손 입가 확성기
        j.torso.rotation.x = -0.28;
        j.neck.rotation.x = -0.15;
        j.head.rotation.x = -0.20;

        j.leftShoulder.rotation.set(-1.15, 0.45, 0.60);
        j.leftElbow.rotation.set(-1.45, 0, -0.30);
        j.rightShoulder.rotation.set(-1.15, -0.45, -0.60);
        j.rightElbow.rotation.set(-1.45, 0, 0.30);

        j.leftHip.rotation.set(0.05, 0, -0.15);
        j.rightHip.rotation.set(0.05, 0, 0.15);
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
        j.leftShoulder.rotation.set(0, 0, 0.15);
        j.rightShoulder.rotation.set(0, 0, -0.15);
        j.leftHip.rotation.set(0, 0, -0.08);
        j.rightHip.rotation.set(0, 0, 0.08);
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
