import * as THREE from 'three';
import { mappingGLSL } from '../shaders/mapping.glsl.js';

// Blue-hour desert city around the venue: dusk gradient sky, a few stars,
// distant mountains, a city grid of lights out to the horizon, lit towers,
// and the venue's own podium, plaza and ring road. Every surface near the
// sphere picks up a coloured glow from whatever the sphere is showing.

// Small deterministic RNG so the skyline is the same on every load.
function rng(seed = 7) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const FOG_COLOR = new THREE.Color(0x2b1c33);

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      varying vec3 vP;
      void main() {
        float h = vP.y;
        // Linear colours: navy zenith -> violet -> warm sunset band at the horizon.
        vec3 zenith  = vec3(0.004, 0.008, 0.035);
        vec3 upper   = vec3(0.020, 0.028, 0.100);
        vec3 violet  = vec3(0.110, 0.070, 0.180);
        vec3 sunset  = vec3(0.520, 0.200, 0.060);
        vec3 c = mix(sunset, violet, smoothstep(0.0, 0.09, h));
        c = mix(c, upper, smoothstep(0.09, 0.35, h));
        c = mix(c, zenith, smoothstep(0.35, 0.95, h));
        if (h < 0.0) c = sunset * 0.4;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  sky.renderOrder = -1;
  return sky;
}

function makeStars(count = 700) {
  // Blue hour: only the brighter stars, and only well above the horizon glow.
  const r = rng(42);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = r() * 2 * Math.PI;
    const y = 0.3 + Math.pow(r(), 0.7) * 0.7;
    const rad = Math.sqrt(1 - y * y);
    pos.set([Math.cos(u) * rad * 800, y * 800, Math.sin(u) * rad * 800], i * 3);
    const b = (0.2 + Math.pow(r(), 3) * 0.8) * y;
    col.set([b, b, b * 1.05], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.5,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  return new THREE.Points(geo, mat);
}

function makeMountains() {
  // A jagged ring of triangles far away: low-poly desert ridge against the sunset.
  const r = rng(3);
  const segs = 120;
  const radius = 650;
  const verts = [];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const h = 12 + r() * 30 + Math.max(0, Math.sin(am * 2 + 1)) * 30;
    const p = (a, y) => [Math.cos(a) * radius, y, Math.sin(a) * radius];
    verts.push(...p(a0, -5), ...p(am, h), ...p(a1, -5));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const mat = new THREE.MeshBasicMaterial({ color: 0x120c1c, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

function makeCityLights() {
  // Street grid of tiny lights reaching to the horizon, skipping the venue.
  const r = rng(5);
  const pos = [];
  const col = [];
  const warm = new THREE.Color(0xffb35c);
  const white = new THREE.Color(0xfff1d6);
  const red = new THREE.Color(0xff4a3a);
  const step = 22;
  for (let line = -560; line <= 560; line += step) {
    for (let t = -560; t <= 560; t += 3 + r() * 4) {
      for (const [x, z] of [[line, t], [t, line]]) {
        const d = Math.hypot(x, z);
        if (d < 40 || d > 580 || r() < 0.35) continue;
        pos.push(x + (r() - 0.5), 0.15, z + (r() - 0.5));
        const c = r() < 0.06 ? red : r() < 0.6 ? warm : white;
        const b = 0.4 + r() * 0.6;
        col.push(c.r * b, c.g * b, c.b * b);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, vertexColors: true, depthWrite: false })
  );
}

function makeWindowTexture() {
  // Hotel-tower facade: dense grid of windows, many of them lit.
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#07070d';
  g.fillRect(0, 0, 256, 256);
  const r = rng(11);
  for (let y = 2; y < 256; y += 6) {
    const rowLit = r() < 0.06 ? 0.7 : 0.18; // whole floors lit now and then
    for (let x = 2; x < 256; x += 5) {
      const v = r();
      if (v < rowLit) {
        g.fillStyle = v < 0.04 ? '#a9c8ff' : '#ffd08a';
        g.globalAlpha = 0.25 + r() * 0.5;
        g.fillRect(x, y, 3, 3);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeBuildings(sphereRadius) {
  const r = rng(99);
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0); // pivot at the base
  const mat = new THREE.MeshBasicMaterial({ map: makeWindowTexture(), fog: true });
  const count = 140;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const tint = new THREE.Color();
  const beacons = [];
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const dist = sphereRadius * 7 + Math.pow(r(), 0.6) * 300;
    const tower = r() > 0.75;
    const w = tower ? 8 + r() * 10 : 6 + r() * 12;
    const d = tower ? 5 + r() * 6 : 6 + r() * 12;
    const h = tower ? 28 + r() * 45 : 4 + r() * 12;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + (r() - 0.5) * 0.6);
    m.compose(new THREE.Vector3(Math.cos(a) * dist, 0, Math.sin(a) * dist), q, new THREE.Vector3(w, h, d));
    mesh.setMatrixAt(i, m);
    // Mostly neutral, some gold-glass towers, a few cool blue ones.
    const k = r();
    tint.set(k < 0.2 && tower ? 0xffc070 : k > 0.92 ? 0x9fb8ff : 0xffffff);
    mesh.setColorAt(i, tint);
    if (h > 40) beacons.push(Math.cos(a) * dist, h + 0.6, Math.sin(a) * dist);
  }
  group.add(mesh);

  // Red aviation beacons on top of the tall towers (they blink in update()).
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.Float32BufferAttribute(beacons, 3));
  const bMat = new THREE.PointsMaterial({ color: 0xff2a2a, size: 4, sizeAttenuation: false, transparent: true });
  group.add(new THREE.Points(bGeo, bMat));
  group.userData.beacons = bMat;
  return group;
}

// Material for surfaces that catch the sphere's light. It averages a ring of
// samples from the content and adds that colour with a falloff by distance
// from the sphere, on top of a base colour, then blends into the fog.
function makeGlowMaterial(sharedUniforms, center, radius, { base, gain, falloff, haze = 0 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...sharedUniforms,
      uCenter: { value: new THREE.Vector2(center.x, center.z) },
      uRadius: { value: radius },
      uBase: { value: new THREE.Color(base) },
      uGain: { value: gain },
      uFalloff: { value: falloff },
      uHaze: { value: haze },
      uFog: { value: FOG_COLOR.clone().convertSRGBToLinear() },
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
      uniform vec3 uBase;
      uniform float uGain;
      uniform float uFalloff;
      uniform float uHaze;
      uniform vec3 uFog;
      varying vec3 vW;
      void main() {
        // Average colour of the lower band of the sphere content.
        vec3 avg = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          float a = float(i) / 8.0 * 6.2831853;
          vec3 d = normalize(vec3(sin(a), uMapping == 0 ? -0.1 : 0.25, cos(a)));
          vec2 uv = dirToUv(d, uMapping);
          if (uv.x >= 0.0) avg += textureLod(uContent, uv, 6.0).rgb;
        }
        avg = avg / 8.0 * uHasContent * uBrightness;

        float r = length(vW.xz - uCenter) / uRadius;
        float glow = exp(-max(r - 1.0, 0.0) * uFalloff) * uGain;
        vec3 col = uBase + avg * glow + vec3(0.06, 0.025, 0.02) * uHaze * exp(-r * 0.08);
        float dist = length(vW - cameraPosition);
        float f = 1.0 - exp(-pow(dist * 0.0016, 2.0));
        gl_FragColor = vec4(mix(col, uFog * 0.25, f), 1.0);
      }`,
  });
}

function makeVenueGrounds(sharedUniforms, center, radius, baseTop) {
  const g = new THREE.Group();
  const glow = (opts) => makeGlowMaterial(sharedUniforms, center, radius, opts);

  // Desert floor out to the mountains.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1800, 1800),
    glow({ base: 0x020203, gain: 0.1, falloff: 1.4, haze: 0.6 })
  );
  ground.rotation.x = -Math.PI / 2;
  g.add(ground);

  // Plaza around the podium: lighter concrete, strongly lit by the screen.
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 2.0, 96),
    glow({ base: 0x050407, gain: 0.14, falloff: 1.8 })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(center.x, 0.03, center.z);
  g.add(plaza);

  // Ring road with streetlights on both kerbs.
  const road = new THREE.Mesh(
    new THREE.RingGeometry(radius * 2.05, radius * 2.45, 128),
    new THREE.MeshBasicMaterial({ color: 0x050407 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(center.x, 0.05, center.z);
  g.add(road);
  const lamps = [];
  for (const rr of [2.02, 2.48]) {
    for (let a = 0; a < Math.PI * 2; a += 0.11) {
      lamps.push(center.x + Math.cos(a) * radius * rr, 0.6, center.z + Math.sin(a) * radius * rr);
    }
  }
  const lampGeo = new THREE.BufferGeometry();
  lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(lamps, 3));
  g.add(new THREE.Points(lampGeo, new THREE.PointsMaterial({ color: 0xffd9a0, size: 2.5, sizeAttenuation: false })));

  // The podium the sphere sinks into: a broad, low, dark drum. Its top deck
  // and its upper fascia catch the screen's colour.
  const side = new THREE.MeshStandardMaterial({ color: 0x0b0a10, roughness: 0.6, metalness: 0.4 });
  const deck = glow({ base: 0x08070b, gain: 0.2, falloff: 2.0 });
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.1, radius * 1.16, baseTop, 128),
    [side, deck, side] // CylinderGeometry groups: side, top cap, bottom cap
  );
  drum.position.set(center.x, baseTop / 2, center.z);
  g.add(drum);
  const fascia = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.101, radius * 1.11, baseTop * 0.22, 128, 1, true),
    glow({ base: 0x0a080d, gain: 0.25, falloff: 2.0 })
  );
  fascia.position.set(center.x, baseTop * 0.86, center.z);
  g.add(fascia);
  return g;
}

export function createEnvironment(scene, { sharedUniforms, sphereCenter, sphereRadius, baseTop }) {
  const group = new THREE.Group();
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0016);
  group.add(makeSky(), makeStars(), makeMountains(), makeCityLights());
  const buildings = makeBuildings(sphereRadius);
  group.add(buildings);
  group.add(makeVenueGrounds(sharedUniforms, sphereCenter, sphereRadius, baseTop));

  const hemi = new THREE.HemisphereLight(0x6a6ab0, 0x100810, 0.6);
  const key = new THREE.DirectionalLight(0xffd6b0, 1.0);
  key.position.set(-20, 15, 30);
  scene.add(hemi, key);
  scene.add(group);

  return {
    group,
    update(time) {
      buildings.userData.beacons.opacity = 0.25 + 0.75 * (Math.sin(time * 2.4) > 0.6 ? 1 : 0);
    },
  };
}
