export const SRGBColorSpace = 'srgb';
export const LinearFilter = 1006;
export const PCFSoftShadowMap = 2;
export const ACESFilmicToneMapping = 4;
export const FrontSide = 0;
export const MOUSE = { ROTATE: 0, DOLLY: 1, PAN: 2 };

export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }
}

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  clone() {
    return new Vector3(this.x, this.y, this.z);
  }
  lerpVectors(v1, v2, t) {
    this.x = v1.x + (v2.x - v1.x) * t;
    this.y = v1.y + (v2.y - v1.y) * t;
    this.z = v1.z + (v2.z - v1.z) * t;
    return this;
  }
  distanceTo(v) {
    return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z);
  }
}

export class Color {
  constructor(c) {
    this.value = c;
  }
  set(c) {
    this.value = c;
    return this;
  }
}

export class LineCurve {
  constructor(v1, v2) {
    this.v1 = v1;
    this.v2 = v2;
  }
}

export class Shape {
  constructor() {
    this.currentPoint = new Vector2();
    this.curves = [];
    this.autoClose = false;
    this.actions = [];
  }
  moveTo(x, y) {
    this.currentPoint.set(x, y);
    this.actions.push({ type: 'moveTo', x, y });
  }
  lineTo(x, y) {
    const p = new Vector2(x, y);
    this.curves.push(new LineCurve(new Vector2(this.currentPoint.x, this.currentPoint.y), p));
    this.currentPoint.set(x, y);
    this.actions.push({ type: 'lineTo', x, y });
  }
  closePath() {
    this.autoClose = true;
    this.actions.push({ type: 'closePath' });
  }
  getPoints() {
    return this.actions
      .filter(a => a.type === 'moveTo' || a.type === 'lineTo')
      .map(a => new Vector2(a.x, a.y));
  }
}

export class BufferAttribute {
  constructor(array, itemSize) {
    this.array = array;
    this.itemSize = itemSize;
    this.count = array.length / itemSize;
    this.needsUpdate = false;
  }
  getX(index) {
    return this.array[index * this.itemSize];
  }
  getY(index) {
    return this.array[index * this.itemSize + 1];
  }
  setXY(index, x, y) {
    this.array[index * this.itemSize] = x;
    this.array[index * this.itemSize + 1] = y;
  }
}

export class Box3 {
  constructor(min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity)) {
    this.min = min;
    this.max = max;
  }
}

export class BufferGeometry {
  constructor() {
    this.attributes = {};
    this.boundingBox = null;
  }
  computeBoundingBox() {
    const pos = this.attributes.position;
    if (!pos) return;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.array[i * pos.itemSize + 2] || 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    this.boundingBox = new Box3(new Vector3(minX, minY, minZ), new Vector3(maxX, maxY, maxZ));
  }
  computeVertexNormals() {}
  dispose() {}
}

export class ExtrudeGeometry extends BufferGeometry {
  constructor(shape, options = {}) {
    super();
    this.shape = shape;
    this.options = options;
    const pts = shape.getPoints ? shape.getPoints() : [];
    const count = Math.max(pts.length * 2, 8);
    const posArr = new Float32Array(count * 3);
    const uvArr = new Float32Array(count * 2);

    for (let i = 0; i < pts.length; i++) {
      posArr[i * 3] = pts[i].x;
      posArr[i * 3 + 1] = pts[i].y;
      posArr[i * 3 + 2] = options.depth || 0.03;
    }
    for (let i = pts.length; i < count; i++) {
      const src = pts[i % pts.length] || { x: 0, y: 0 };
      posArr[i * 3] = src.x;
      posArr[i * 3 + 1] = src.y;
      posArr[i * 3 + 2] = 0;
    }

    this.attributes.position = new BufferAttribute(posArr, 3);
    this.attributes.uv = new BufferAttribute(uvArr, 2);
    this.computeBoundingBox();
  }
}

export class PlaneGeometry extends BufferGeometry {
  constructor(width = 1, height = 1) {
    super();
    this.parameters = { width, height };
    const w2 = width / 2;
    const h2 = height / 2;
    const posArr = new Float32Array([
      -w2,  h2, 0,
       w2,  h2, 0,
      -w2, -h2, 0,
       w2, -h2, 0
    ]);
    const uvArr = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);
    this.attributes.position = new BufferAttribute(posArr, 3);
    this.attributes.uv = new BufferAttribute(uvArr, 2);
    this.computeBoundingBox();
  }
}

export class Texture {
  constructor(image) {
    this.image = image;
    this.needsUpdate = false;
  }
  dispose() {}
}

export class CanvasTexture extends Texture {}

export class MeshStandardMaterial {
  constructor(params = {}) {
    this.color = new Color(params.color !== undefined ? params.color : 0xffffff);
    this.roughness = params.roughness !== undefined ? params.roughness : 0.5;
    this.metalness = params.metalness !== undefined ? params.metalness : 0.5;
    this.map = params.map || null;
    this.side = params.side !== undefined ? params.side : FrontSide;
    this.transparent = !!params.transparent;
    this.alphaTest = params.alphaTest || 0;
    this.needsUpdate = false;
  }
  dispose() {}
}

export class Mesh {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.position = new Vector3();
    this.rotation = new Vector3();
    this.scale = new Vector3(1, 1, 1);
    this.castShadow = false;
    this.receiveShadow = false;
    this.userData = {};
    this.children = [];
    this.isMesh = true;
  }
  add(obj) {
    this.children.push(obj);
    obj.parent = this;
    return this;
  }
  remove(obj) {
    const idx = this.children.indexOf(obj);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      obj.parent = null;
    }
    return this;
  }
  traverse(cb) {
    cb(this);
    for (const child of this.children) {
      if (child.traverse) child.traverse(cb);
      else cb(child);
    }
  }
}

export class Group extends Mesh {
  constructor() {
    super(null, null);
    this.isGroup = true;
    this.isMesh = false;
  }
}

export class Scene {
  constructor() {
    this.children = [];
    this.background = null;
  }
  add(obj) {
    this.children.push(obj);
  }
  remove(obj) {
    const idx = this.children.indexOf(obj);
    if (idx !== -1) this.children.splice(idx, 1);
  }
}

export class DirectionalLight {
  constructor(color, intensity) {
    this.color = new Color(color);
    this.intensity = intensity;
    this.position = new Vector3();
    this.castShadow = false;
    this.shadow = {
      bias: 0,
      normalBias: 0,
      camera: {
        near: 0.1,
        far: 100,
        left: -5,
        right: 5,
        top: 5,
        bottom: -5,
        updateProjectionMatrix: () => {}
      },
      mapSize: { width: 1024, height: 1024 }
    };
  }
}

export class AmbientLight {
  constructor(color, intensity) {
    this.color = new Color(color);
    this.intensity = intensity;
  }
}

export class PerspectiveCamera {
  constructor(fov, aspect, near, far) {
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.position = new Vector3();
  }
  lookAt() {}
  updateProjectionMatrix() {}
}
