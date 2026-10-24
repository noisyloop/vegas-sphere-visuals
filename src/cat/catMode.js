import * as THREE from 'three';
import { loadCatModel } from './catModel.js';

// Cat mode: a spinning cat rendered into its own offscreen texture (which then
// plays on the sphere like any other content) plus a giant copy spinning in
// front of the sphere. In green-screen mode the cat scene is drawn straight to
// the canvas on pure chroma green so a recording can be keyed out.

export const CHROMA_GREEN = new THREE.Color(0x00ff00);
const NIGHT = new THREE.Color(0x120626);

export class CatMode {
  constructor(renderer, mainScene, { position }) {
    this.renderer = renderer;
    this.enabled = false;
    this.greenScreen = false;
    this.spinSpeed = 4; // rad/s
    this.source = 'loading';
    this.level = 0; // audio level 0..1 for a little bounce

    this.target = new THREE.WebGLRenderTarget(1024, 512, { samples: 4 });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = NIGHT.clone();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x664466, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 3, 5);
    this.scene.add(key);
    this.camera = new THREE.PerspectiveCamera(30, 2, 0.1, 50);
    this.camera.position.set(0, 0, 9);

    this.pivot = new THREE.Group(); // spinning pivot inside the offscreen scene
    this.scene.add(this.pivot);

    this.front = new THREE.Group(); // the big one in front of the sphere
    this.front.position.copy(position);
    this.frontBaseY = position.y;
    this.front.scale.setScalar(2.6);
    this.front.visible = false;
    mainScene.add(this.front);

    this.ready = loadCatModel().then(({ model, source }) => {
      this.source = source;
      this.pivot.add(model);
      this.front.add(model.clone());
    });
  }

  get texture() {
    return this.target.texture;
  }

  setEnabled(on) {
    this.enabled = on;
  }

  setGreenScreen(on) {
    this.greenScreen = on;
    this.scene.background = (on ? CHROMA_GREEN : NIGHT).clone();
  }

  update(dt, time, mapping, showFront) {
    const bob = Math.sin(time * 2.0) * 0.08 + this.level * 0.25;
    const squish = 1 + this.level * 0.15;
    for (const g of [this.pivot, this.front]) {
      g.rotation.y += dt * this.spinSpeed;
    }
    this.pivot.position.y = bob;
    this.pivot.scale.set(squish, 1 / squish, squish);
    this.front.position.y = this.frontBaseY + bob * 2.6;
    this.front.visible = this.enabled && showFront;

    // Equirect: a 2:1 frustum gives equal angles per texel. Dome master
    // samples the 2:1 texture as a square, so pre-stretch with a 1:1 frustum.
    const aspect = mapping === 0 ? 2 : 1;
    if (this.camera.aspect !== aspect) {
      this.camera.aspect = aspect;
      this.camera.fov = mapping === 0 ? 30 : 34;
      this.camera.updateProjectionMatrix();
    }
  }

  renderToTexture() {
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prev);
  }

  // Green screen: draw the cat full-canvas with a camera matching the canvas.
  renderGreenScreen(width, height) {
    const cam = this.gsCamera ??= new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    cam.aspect = width / height;
    cam.position.set(0, 0, cam.aspect < 1 ? 9 / cam.aspect * 0.8 : 9);
    cam.updateProjectionMatrix();
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, cam);
  }
}
