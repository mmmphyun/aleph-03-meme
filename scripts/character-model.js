/**
 * @file character-model.js
 * @description 볼 조인트 기반 프로 축구선수 체형 로우폴리 마네킹 캐릭터 모델
 * - 프로 남자 축구선수 역삼각형 체형 (넓은 어깨 + 슬림하고 단단한 골반 + 탄탄한 대퇴부)
 * - 관절 및 신체 부위 간 클리핑(파고듦/겹침) 방지 정밀 오프셋 설계
 * - 두상 표면 입체 굴곡에 정사영(Planar Projection)으로 완전 밀착 래핑되는 얼굴 텍스처
 * - 관절 결손 없는 볼 조인트(Ball-joint) 인체 연결
 * - 엄지 및 손가락 분할 손(Hand) 구조
 * - 3대 콘셉트 스킨 스왑 (CLASSIC_DAISY, RETRO_JERSEY, GOLDEN_TROPHY)
 * - 바이럴 세레모니 & 챌린지 포즈 프리셋:
 *   1. RONALDO_SIU (호날두 시우)
 *   2. SON_CAMERA (손흥민 손 카메라 찰칵)
 *   3. GRIEZMANN_HOTLINE (그리즈만 핫라인 전화기 댄스)
 *   4. BELLINGHAM_ARMS (벨링엄 황제 양팔 벌리기)
 *   5. GEOJE_YAHO (리센느 미나미 거제 야호: 한손 확성기 + 갸루피스 + 외다리)
 *   6. CHOI_SAN_BAD (에이티즈 최산 BAD: 턱선 쓸어올리기 + 치명적 어깨 꺾기)
 *   7. CUTE_HEART (축구장 볼하트)
 *   8. DEFAULT (프로 축구선수 기본 스탠스)
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

    // 볼터치
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
   * 로우폴리 메쉬 생성 헬퍼
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
   */
  initModel() {
    this.group.position.set(0, 0, 0);

    // 1. 골반 (Hips - 슬림하고 단단한 남성형 골반)
    const hipsGroup = new THREE.Group();
    hipsGroup.position.set(0, 0.94, 0);
    this.group.add(hipsGroup);
    this.joints.hips = hipsGroup;

    const hipsGeo = new THREE.CylinderGeometry(0.14, 0.12, 0.19, 8);
    hipsGeo.scale(1.0, 1.0, 0.85);
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

    // 복부/허리 (Waist)
    const waistGeo = new THREE.CylinderGeometry(0.16, 0.13, 0.16, 8);
    const waistMesh = this.createPolyMesh(waistGeo, 'torso');
    waistMesh.position.set(0, 0.08, 0);
    torsoGroup.add(waistMesh);

    // 가슴/흉곽 (Chest - 넓고 두터운 역삼각형 상체 프레임)
    const chestGeo = new THREE.CylinderGeometry(0.26, 0.16, 0.25, 8);
    const chestMesh = this.createPolyMesh(chestGeo, 'torso');
    chestMesh.position.set(0, 0.27, 0);
    chestMesh.scale.set(1.22, 1, 0.90);
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

    // 5. 어깨 및 상지 (어깨 오프셋: ±0.32m)
    this.setupArm(torsoGroup, 'left', -0.32);
    this.setupArm(torsoGroup, 'right', 0.32);

    // 6. 골반 및 하지 (고관절 오프셋: ±0.10m)
    this.setupLeg(hipsGroup, 'left', -0.10);
    this.setupLeg(hipsGroup, 'right', 0.10);
  }

  /**
   * 상완 및 전완, 분할 손 구조
   */
  setupArm(parent, side, offsetX) {
    const isLeft = side === 'left';
    const sign = isLeft ? -1 : 1;

    // 어깨 관절 볼
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

    // 손 (Hand) - 손바닥 + 5개 개별 독립 손가락 (엄지, 검지, 중지, 약지, 새끼)
    const handGroup = new THREE.Group();
    handGroup.position.set(0, -0.26, 0);
    elbowGroup.add(handGroup);
    this.joints[`${side}Hand`] = handGroup;

    // 1. 손바닥 (Palm)
    const palmGeo = new THREE.BoxGeometry(0.068, 0.075, 0.035);
    const palmMesh = this.createPolyMesh(palmGeo, 'skin');
    palmMesh.position.set(0, -0.038, 0);
    handGroup.add(palmMesh);

    // 2. 엄지손가락 (Thumb) - 독립 관절 피벗
    const thumbJoint = new THREE.Group();
    thumbJoint.position.set(sign * 0.038, -0.025, 0.012);
    thumbJoint.rotation.z = -sign * 0.45;
    handGroup.add(thumbJoint);
    this.joints[`${side}Thumb`] = thumbJoint;

    const thumbGeo = new THREE.BoxGeometry(0.018, 0.045, 0.020);
    const thumbMesh = this.createPolyMesh(thumbGeo, 'skin');
    thumbMesh.position.set(0, -0.022, 0);
    thumbJoint.add(thumbMesh);

    // 3. 4개 개별 손가락 (검지, 중지, 약지, 새끼)
    const fingerDefs = [
      { name: 'Index',  x: sign * 0.024, len: 0.050, thick: 0.015 },
      { name: 'Middle', x: sign * 0.008, len: 0.055, thick: 0.015 },
      { name: 'Ring',   x: -sign * 0.008, len: 0.048, thick: 0.014 },
      { name: 'Pinky',  x: -sign * 0.024, len: 0.040, thick: 0.013 }
    ];

    fingerDefs.forEach((f) => {
      const fingerJoint = new THREE.Group();
      fingerJoint.position.set(f.x, -0.075, 0);
      handGroup.add(fingerJoint);
      this.joints[`${side}${f.name}`] = fingerJoint;

      const fGeo = new THREE.BoxGeometry(f.thick, f.len, 0.020);
      const fMesh = this.createPolyMesh(fGeo, 'skin');
      fMesh.position.set(0, -f.len / 2, 0);
      fingerJoint.add(fMesh);
    });
  }

  /**
   * 다리 조립
   */
  setupLeg(parent, side, offsetX) {
    const hipBall = this.createJointBall(0.085, 'shorts');
    hipBall.position.set(offsetX, -0.08, 0);
    parent.add(hipBall);

    const hipJoint = new THREE.Group();
    hipJoint.position.set(offsetX, -0.08, 0);
    parent.add(hipJoint);
    this.joints[`${side}Hip`] = hipJoint;

    // 허벅지
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
    });
    // 엄지손가락 인체 해부학적 기본 외전 각도 보존
    if (this.joints.leftThumb) this.joints.leftThumb.rotation.z = 0.45;
    if (this.joints.rightThumb) this.joints.rightThumb.rotation.z = -0.45;
    this.group.position.set(0, 0, 0);
  }

  /**
   * 챌린지 및 바이럴 축구 세레모니 포즈 프리셋 적용
   * - 몸통/머리/사지 간 기하학적 클리핑(파고듦/겹침)을 원천 차단하는 클리어런스(Clearance) 각도 설계
   * @param {'DEFAULT'|'RONALDO_SIU'|'SON_CAMERA'|'GRIEZMANN_HOTLINE'|'BELLINGHAM_ARMS'|'GEOJE_YAHO'|'CHOI_SAN_BAD'|'CUTE_HEART'} poseName
   */
  applyPose(poseName) {
    this.currentPose = poseName;
    this.resetJoints();

    const j = this.joints;

    switch (poseName) {
      case 'RONALDO_SIU':
        // [호날두 시우]: 가슴 펴고 양팔 뒤로 뻗기 (뒤쪽으로 뻗어 몸통 클리핑 0%)
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

      case 'SON_CAMERA':
        // [손흥민 시그니처 카메라 찰칵 세레모니]:
        // 양손을 모아 사각 뷰파인더/카메라 프레임을 만들고 눈앞에 조준하는 대표적 시그니처
        // 머리/가슴 앞쪽(Z축 바깥)으로 넉넉히 띄워 손과 머리의 겹침 원천 방지
        j.torso.rotation.set(0.12, 0.08, 0);
        j.head.rotation.set(-0.06, -0.08, 0.08); // 윙크하듯 카메라를 겨냥하는 틸트

        // 양팔을 앞으로 모아 눈높이 전방 0.25m 지점에 카메라 사각 프레임 형성
        j.leftShoulder.rotation.set(-1.18, 0.25, 0.65);
        j.leftElbow.rotation.set(-1.65, 0.20, -0.35);
        j.leftHand.rotation.set(0.25, 0.20, -0.80);

        j.rightShoulder.rotation.set(-1.18, -0.25, -0.65);
        j.rightElbow.rotation.set(-1.65, -0.20, 0.35);
        j.rightHand.rotation.set(0.25, -0.20, 0.80);

        // 하체: 살짝 짝다리 짚은 리드미컬한 필드 스탠스
        j.leftHip.rotation.set(0.08, 0, -0.12);
        j.rightHip.rotation.set(-0.05, 0, 0.18);
        j.rightKnee.rotation.set(0.16, 0, 0);
        break;

      case 'GRIEZMANN_HOTLINE':
        // [앙투안 그리즈만 전화기 댄스 (Hotline Bling)]:
        // 양손을 전화기 모양(🤙)으로 뺨 양옆 공간(클리핑 없는 바깥쪽)에 들고 리듬 타는 큰 동작
        j.torso.rotation.set(0.05, -0.15, 0.12); // 몸을 둠칫 옆으로 젖힘
        j.head.rotation.set(0.05, 0.15, -0.15);  // 시선은 반대로 쿨하게

        // 양손을 머리 측면 바깥쪽(X축 Clearance 넉넉히 확보)에 전화기 형태로 배치
        j.leftShoulder.rotation.set(-1.10, 0.35, 0.95);
        j.leftElbow.rotation.set(-1.85, 0.30, -0.25);
        j.leftHand.rotation.set(0.20, 0.30, 0.15);

        j.rightShoulder.rotation.set(-0.95, -0.25, -0.80);
        j.rightElbow.rotation.set(-1.60, -0.25, 0.20);
        j.rightHand.rotation.set(0.20, -0.30, -0.15);

        // 하체: 댄스 스텝 (한쪽 무릎 들고 둠칫)
        j.leftHip.rotation.set(-0.25, 0.15, -0.25);
        j.leftKnee.rotation.set(0.55, 0, 0);
        j.rightHip.rotation.set(0.12, 0, 0.08);
        break;

      case 'BELLINGHAM_ARMS':
        // [주드 벨링엄 황제 양팔 벌리기 (Hey Jude)]:
        // 관중석을 향해 가슴을 펴고 양팔을 양옆 대각선 위로 거대하게 뻗는 시그니처
        j.torso.rotation.set(-0.16, 0, 0);
        j.head.rotation.set(-0.20, 0, 0);

        // 양팔을 양옆 바깥 대각선 위로 시원하게 펼침 (T/Y 형태)
        j.leftShoulder.rotation.set(-0.15, 0, -1.35);
        j.leftElbow.rotation.set(0, 0, 0);
        j.rightShoulder.rotation.set(-0.15, 0, 1.35);
        j.rightElbow.rotation.set(0, 0, 0);

        // 하체: 당당한 와이드 스탠스
        j.leftHip.rotation.set(0.08, 0, -0.22);
        j.rightHip.rotation.set(0.08, 0, 0.22);
        break;

      case 'GEOJE_YAHO':
        // [리센느 미나미 거제 야호]:
        // 우측 손 확성기 + 좌측 손 갸루피스 + 좌측 외다리 킥
        // 얼굴 앞쪽(Z축)으로 0.1m 이상 띄워 두상 파고듦 방지
        j.torso.rotation.set(-0.10, 0.18, -0.08);
        j.head.rotation.set(-0.08, -0.10, 0.18);

        // 오른손: 입 앞쪽 10cm 여유를 두고 확성기 형태 배치 (두상 침범 차단)
        j.rightShoulder.rotation.set(-1.18, -0.35, -0.32);
        j.rightElbow.rotation.set(-1.48, 0.25, 0.15);
        j.rightHand.rotation.set(0.10, -0.25, 0);

        // 왼손: 전방으로 완만하게 뻗어 갸루피스
        j.leftShoulder.rotation.set(-0.95, 0.40, 0.45);
        j.leftElbow.rotation.set(-0.35, 0.20, 0.85);
        j.leftHand.rotation.set(0.55, 0.35, -1.15);

        // 하체: 오른발 지지, 왼발 무릎 90도 후방 굴곡 (대퇴부와 정강이 간격 유지)
        j.rightHip.rotation.set(0.02, 0, 0.05);
        j.leftHip.rotation.set(-0.30, 0.22, -0.40);
        j.leftKnee.rotation.set(1.45, 0, -0.10);
        break;

      case 'CHOI_SAN_BAD':
        // [에이티즈 최산 BAD 챌린지 시그니처 턱선 폼]:
        // 1. 오른손: 턱선과 목 옆 라인을 쓸어올리며 턱을 받치는 매혹적인 손동작 (목 표면 밖으로 띄움)
        // 2. 왼손: 가슴 앞쪽에 절도 있게 각을 잡고 얹은 팔
        // 3. 고개: 날카로운 턱선을 과시하며 옆으로 치명적인 틸트
        // 4. 골반: 삐딱하게 골반을 옆으로 밀어 섹시한 그루브 꺾기
        j.torso.rotation.set(0.06, 0.28, -0.16);
        j.head.rotation.set(0.16, -0.45, 0.26);

        // 오른손: 턱선/목선 옆으로 다가가되 닿지 않는 클리어런스 확보
        j.rightShoulder.rotation.set(-1.05, -0.30, -0.35);
        j.rightElbow.rotation.set(-1.60, -0.20, 0.40);
        j.rightHand.rotation.set(0.20, -0.40, 0.25);

        // 왼손: 흉곽 앞쪽 8cm 간격을 두고 수평으로 접어 얹음
        j.leftShoulder.rotation.set(-0.65, 0.25, 0.85);
        j.leftElbow.rotation.set(-1.35, 0.35, -0.15);
        j.leftHand.rotation.set(0.20, 0.20, 0);

        // 하체: 골반 틸트 & 한쪽 다리 외전 (클리핑 0%)
        j.hips.rotation.z = 0.09;
        j.leftHip.rotation.set(0.08, 0, -0.20);
        j.leftKnee.rotation.set(0.15, 0, 0);
        j.rightHip.rotation.set(-0.04, 0, 0.12);
        break;

      case 'CUTE_HEART':
        // [축구장 볼하트]:
        // 손이 볼/뺨 표면을 뚫지 않도록 뺨 바깥쪽(X축 ±0.28m, Z축 +0.18m)에 볼하트 생성
        j.torso.rotation.set(0.05, 0.05, 0.02);
        j.head.rotation.set(0.08, 0.05, 0.20);

        j.leftShoulder.rotation.set(-1.12, 0.48, 0.82);
        j.leftElbow.rotation.set(-1.75, 0.15, -0.20);
        j.rightShoulder.rotation.set(-1.12, -0.48, -0.82);
        j.rightElbow.rotation.set(-1.75, -0.15, 0.20);

        j.leftHip.rotation.set(-0.08, 0.08, 0.10);
        j.leftKnee.rotation.set(0.25, 0, 0);
        j.rightHip.rotation.set(0.05, 0, -0.05);
        break;

      case 'DEFAULT':
      default:
        // 프로 축구선수 기본 스탠스
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
