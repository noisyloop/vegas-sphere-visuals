import * as THREE from 'three';
import { mappingGLSL } from '../shaders/mapping.glsl.js';

// Night desert backdrop: gradient sky, stars, distant low-poly mountains, a
// ring of silhouette buildings with sparse lit windows, and a ground plane that
// picks up a coloured glow from whatever the sphere is showing.

// Small deterministic RNG so the skyline is the same on every load.
function rng(seed = 7) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      varying vec3 vP;
      void main() {
        float h = clamp(vP.y, -0.1, 1.0);
        vec3 top = vec3(0.004, 0.006, 0.02);
        vec3 mid = vec3(0.012, 0.012, 0.045);
        vec3 horizon = vec3(0.09, 0.035, 0.07);   // warm city haze
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
        c = mix(c, top, smoothstep(0.18, 0.8, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  sky.renderOrder = -1;
  return sky;
}

function makeStars(count = 1400) {
  const r = rng(42);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Upper hemisphere only, denser towards the zenith.
    const u = r() * 2 * Math.PI;
    const y = 0.08 + Math.pow(r(), 0.7) * 0.92;
    const rad = Math.sqrt(1 - y * y);
    pos.set([Math.cos(u) * rad * 800, y * 800, Math.sin(u) * rad * 800], i * 3);
    const b = 0.25 + Math.pow(r(), 3) * 0.75;
    col.set([b, b, b * (0.9 + r() * 0.2)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.6,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

function makeMountains() {
  // A jagged ring of triangles far away: classic low-poly desert ridge.
  const r = rng(3);
  const segs = 90;
  const radius = 600;
  const verts = [];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const h = 20 + r() * 55 + Math.sin(am * 3) * 15;
    const p = (a, y) => [Math.cos(a) * radius, y, Math.sin(a) * radius];
    verts.push(...p(a0, -5), ...p(am, h), ...p(a1, -5));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const mat = new THREE.MeshBasicMaterial({ color: 0x0b0814, side: THREE.DoubleSide, fog: true });
  return new THREE.Mesh(geo, mat);
}

function makeWindowTexture() {
  // A tiling texture of mostly-dark windows with a few warm/cool lights on.
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#05060b';
  g.fillRect(0, 0, 128, 128);
  const r = rng(11);
  for (let y = 4; y < 128; y += 8) {
    for (let x = 4; x < 128; x += 8) {
      const v = r();
      if (v > 0.86) {
        g.fillStyle = v > 0.96 ? '#9fc4ff' : '#ffcc77';
        g.globalAlpha = 0.35 + r() * 0.5;
        g.fillRect(x, y, 4, 4);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function makeBuildings() {
  const r = rng(99);
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0); // pivot at the base
  const mat = new THREE.MeshBasicMaterial({ map: makeWindowTexture(), color: 0xffffff, fog: true });
  const count = 70;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const beacons = [];
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const dist = 55 + r() * 120;
    const w = 4 + r() * 8;
    const d = 4 + r() * 8;
    // A few tall towers, many mid-rise blocks.
    const h = r() > 0.85 ? 35 + r() * 45 : 8 + r() * 22;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI);
    m.compose(new THREE.Vector3(Math.cos(a) * dist, 0, Math.sin(a) * dist), q, new THREE.Vector3(w, h, d));
    mesh.setMatrixAt(i, m);
    if (h > 30) beacons.push(Math.cos(a) * dist, h + 0.6, Math.sin(a) * dist);
  }
  group.add(mesh);

  // Red aviation beacons on top of the tall towers (they blink in update()).
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.Float32BufferAttribute(beacons, 3));
  const bMat = new THREE.PointsMaterial({ color: 0xff2a2a, size: 4, sizeAttenuation: false, transparent: true });
  const bPoints = new THREE.Points(bGeo, bMat);
  group.add(bPoints);
  group.userData.beacons = bMat;
  return group;
}

function makeGround(sharedUniforms, sphereCenter, sphereRadius) {
  // The ground samples a handful of points of the sphere content to tint the
  // glow pooled around the venue, so it reacts to what is playing.
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...sharedUniforms,
      uCenter: { value: new THREE.Vector2(sphereCenter.x, sphereCenter.z) },
      uRadius: { value: sphereRadius },
    },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `
      ${mappingGLSL}
      uniform sampler2D uContent;
      uniform float uHasContent;
      uniform int uMapping;
      uniform float uBrightness;
      uniform vec2 uCenter;
      uniform float uRadius;
      varying vec3 vW;
      void main() {
        // Average colour of the lower band of the sphere content.
        vec3 avg = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          float a = float(i) / 8.0 * 6.2831853;
          vec3 d = normalize(vec3(sin(a), uMapping == 0 ? -0.15 : 0.25, cos(a)));
          vec2 uv = dirToUv(d, uMapping);
          if (uv.x >= 0.0) avg += textureLod(uContent, uv, 6.0).rgb;
        }
        avg = avg / 8.0 * uHasContent * uBrightness;

        float r = length(vW.xz - uCenter) / uRadius;
        float glow = exp(-max(r - 0.9, 0.0) * 2.2) * 0.3;
        vec3 base = vec3(0.010, 0.008, 0.013);         // dusty desert floor
        vec3 haze = vec3(0.025, 0.012, 0.02) * exp(-r * 0.15);
        float fade = 1.0 - smoothstep(20.0, 40.0, r);  // dissolve into the dark
        gl_FragColor = vec4((base + haze + avg * glow) * fade, 1.0);
      }`,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600, 1, 1), mat);
  ground.rotation.x = -Math.PI / 2;
  return ground;
}

function makePedestal(center, radius) {
  // The low dark building the sphere sits on.
  const mat = new THREE.MeshStandardMaterial({ color: 0x0c0c12, roughness: 0.85, metalness: 0.2 });
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius * 0.8, 1.6, 48), mat);
  base.position.set(center.x, 0.8, center.z);
  g.add(base);
  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.74, 0.08, 6, 64),
    new THREE.MeshBasicMaterial({ color: 0x3a6cff })
  );
  lip.rotation.x = Math.PI / 2;
  lip.position.set(center.x, 1.62, center.z);
  g.add(lip);
  return g;
}

export function createEnvironment(scene, { sharedUniforms, sphereCenter, sphereRadius }) {
  const group = new THREE.Group();
  scene.fog = new THREE.FogExp2(0x07050d, 0.0016);
  group.add(makeSky(), makeStars(), makeMountains());
  const buildings = makeBuildings();
  group.add(buildings);
  group.add(makeGround(sharedUniforms, sphereCenter, sphereRadius));
  group.add(makePedestal(sphereCenter, sphereRadius));

  const hemi = new THREE.HemisphereLight(0x5a5aa0, 0x100810, 0.6);
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(5, 20, 30);
  scene.add(hemi, key);
  scene.add(group);

  return {
    group,
    update(time) {
      buildings.userData.beacons.opacity = 0.25 + 0.75 * (Math.sin(time * 2.4) > 0.6 ? 1 : 0);
    },
  };
}
