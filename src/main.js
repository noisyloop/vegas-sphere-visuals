import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import './style.css';
import { createEnvironment } from './scene/environment.js';
import { createLedSphere } from './scene/ledSphere.js';
import { DemoFractal } from './content/demoFractal.js';
import { VideoFileSource, ScreenCaptureSource } from './content/mediaSources.js';
import { CatMode } from './cat/catMode.js';
import { AudioPlayer } from './audio.js';
import { recordCanvas } from './recorder.js';
import { bindPanel, toast } from './ui/panel.js';

const SPHERE_RADIUS = 10;
const SPHERE_CENTER = new THREE.Vector3(0, 9, 0); // sits slightly sunk into its base
const isMobile = window.matchMedia('(pointer: coarse)').matches;

// --- Renderer, scene, camera -------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;

// --- Venue -------------------------------------------------------------------
const sphere = createLedSphere({ radius: SPHERE_RADIUS, center: SPHERE_CENTER });
scene.add(sphere.mesh);
const env = createEnvironment(scene, {
  sharedUniforms: sphere.sharedUniforms,
  sphereCenter: SPHERE_CENTER,
  sphereRadius: SPHERE_RADIUS,
});

// --- Post-processing: subtle bloom so bright LEDs glow -----------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.45, 0.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// --- Content -----------------------------------------------------------------
const demo = new DemoFractal(renderer);
const videoSrc = new VideoFileSource();
const screenSrc = new ScreenCaptureSource();
const cat = new CatMode(renderer, scene, { position: new THREE.Vector3(0, 4.5, SPHERE_RADIUS + 5) });
const audio = new AudioPlayer();

const state = {
  source: 'demo',     // 'demo' | 'video' | 'screen'
  view: 'exterior',   // 'exterior' | 'interior'
  mapping: 0,         // 0 equirect, 1 dome master
  rotationSpeed: 0.05,
  catMode: false,
  greenScreen: false,
};

let ui;

// Decide what texture the sphere shows right now.
function applyContent() {
  let tex = demo.texture;
  if (state.catMode) tex = cat.texture;
  else if (state.source === 'video' && videoSrc.ready) tex = videoSrc.texture;
  else if (state.source === 'screen' && screenSrc.ready) tex = screenSrc.texture;
  sphere.setContent(tex);
}

function sourceLabel() {
  if (state.source === 'video') return `Video: ${videoSrc.name}`;
  if (state.source === 'screen') return 'Live screen capture';
  return 'Built-in Julia fractal';
}

// --- Views ---------------------------------------------------------------------
function setView(view) {
  state.view = view;
  const interior = view === 'interior';
  sphere.uniforms.uInterior.value = interior ? 1 : 0;
  controls.target.copy(SPHERE_CENTER);
  if (interior) {
    // Orbit a tiny radius around the centre = look around from the inside.
    // The camera sits just below/behind the target so it starts looking up
    // towards the front of the content.
    camera.fov = 75;
    camera.position.copy(SPHERE_CENTER).add(new THREE.Vector3(0, -0.6, -0.8).multiplyScalar(0.01));
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.minDistance = 0;
    controls.maxDistance = 1;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.rotateSpeed = -0.35; // drag the content, like a 360 viewer
  } else {
    camera.fov = 50;
    camera.position.set(0, 7, SPHERE_RADIUS * 4.2);
    controls.target.y = SPHERE_CENTER.y - 1;
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.minDistance = SPHERE_RADIUS * 1.5;
    controls.maxDistance = SPHERE_RADIUS * 12;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // stay above the ground
    controls.rotateSpeed = 0.6;
  }
  camera.updateProjectionMatrix();
  controls.update();
  ui?.showView(view);
}

// Stop the idle orbit as soon as the user grabs the view.
controls.addEventListener('start', () => app.setAutoOrbit(false));

// --- App API used by the panel ------------------------------------------------
const app = {
  captureSupported: ScreenCaptureSource.supported,
  hasVideo: () => videoSrc.ready,
  hasCapture: () => screenSrc.ready,

  setSource(s) {
    state.source = s;
    applyContent();
    ui.showSource(s, sourceLabel());
  },

  async loadVideo(file) {
    try {
      await videoSrc.load(file);
      app.setSource('video');
      toast(`Playing ${file.name}`);
    } catch (e) {
      console.error(e);
      toast(`Could not play ${file.name}: ${e.message}`);
    }
  },

  async startCapture() {
    if (!screenSrc.constructor.supported) return toast('Screen capture is not supported here');
    try {
      await screenSrc.start();
      app.setSource('screen');
      toast('Capturing - pick your fractal tab');
    } catch (e) {
      if (e.name !== 'NotAllowedError') console.error(e);
      toast(e.name === 'NotAllowedError' ? 'Screen capture cancelled' : `Capture failed: ${e.message}`);
    }
  },

  setView,

  setMapping(m) {
    state.mapping = m;
    sphere.uniforms.uMapping.value = m;
    ui.showMapping(m);
  },

  setAutoOrbit(on) {
    controls.autoRotate = on;
    ui.showAutoOrbit(on);
  },

  set(key, v) {
    switch (key) {
      case 'brightness': sphere.uniforms.uBrightness.value = v; break;
      case 'dotSize': sphere.uniforms.uDotSize.value = v; break;
      case 'density': sphere.uniforms.uRows.value = v; sphere.updateLod(); break;
      case 'bloom': bloom.strength = v; break;
      case 'rotation': state.rotationSpeed = v; break;
      case 'catSpin': cat.spinSpeed = v; break;
    }
  },

  async setCatMode(on) {
    state.catMode = on;
    cat.setEnabled(on);
    applyContent();
    if (on) {
      ui.showCat('Loading cat…');
      await cat.ready;
      ui.showCat(
        cat.source === 'procedural'
          ? 'Built-in cartoon cat (add /assets/cat.glb or cat.png to swap)'
          : `Using /assets/${cat.source}`
      );
    } else {
      ui.showCat('');
    }
  },

  setGreenScreen(on) {
    state.greenScreen = on;
    cat.setGreenScreen(on);
  },

  loadAudio(file) {
    audio.load(file);
    ui.showAudio(file.name);
  },

  toggleAudio: () => audio.toggle(),

  record(onTick) {
    return recordCanvas(canvas, { seconds: 15, audioTrack: audio.audioTrack(), onTick });
  },
};

screenSrc.onEnded = () => {
  if (state.source === 'screen') app.setSource('demo');
  toast('Screen capture ended');
};

ui = bindPanel(app);
setView('exterior');
applyContent();

// --- Resize ----------------------------------------------------------------------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// --- Frame loop --------------------------------------------------------------
const clock = new THREE.Clock();
let frames = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  sphere.uniforms.uRotation.value += dt * state.rotationSpeed;
  env.update(t);
  controls.update();

  // Only render the offscreen content that is actually on screen.
  if (state.catMode) {
    cat.level = audio.level();
    cat.update(dt, t, state.mapping, state.view === 'exterior');
  }
  if (state.catMode && state.greenScreen) {
    cat.renderGreenScreen(window.innerWidth, window.innerHeight);
  } else {
    if (state.catMode) cat.renderToTexture();
    else if (sphere.uniforms.uContent.value === demo.texture) demo.render(t, state.mapping);
    composer.render(dt);
  }
  frames++;
});

// Small hook for automated tests and console tinkering.
window.__ledDome = {
  state,
  app,
  sphere,
  get frames() { return frames; },
  get contentKind() {
    const tex = sphere.uniforms.uContent.value;
    if (tex === demo.texture) return 'demo';
    if (tex === cat.texture) return 'cat';
    if (tex === videoSrc.texture) return 'video';
    if (tex === screenSrc.texture) return 'screen';
    return 'none';
  },
  get catSource() { return cat.source; },
  cat,
};
