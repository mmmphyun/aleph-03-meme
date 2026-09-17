export class OrbitControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = { x: 0, y: 0, z: 0, clone: () => ({ x: 0, y: 0, z: 0 }), lerpVectors: () => {} };
    this.mouseButtons = {};
  }
  update() {}
  dispose() {}
}
