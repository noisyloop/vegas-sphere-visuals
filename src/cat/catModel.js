import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Cat mode model. Load order:
//   1. /assets/cat.glb  -> used as-is (normalised to ~2 units tall)
//   2. /assets/cat.png  -> shown on a double-sided spinning card
//   3. otherwise        -> an original cartoon cat head built from primitives

async function assetExists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    // Vite's dev server falls back to index.html for unknown paths, so also
    // check that we did not just get HTML back.
    const type = res.headers.get('content-type') || '';
    return res.ok && !type.includes('text/html');
  } catch {
    return false;
  }
}

function normalise(object, size = 2) {
  const box = new THREE.Box3().setFromObject(object);
  const dim = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const s = size / Math.max(dim.x, dim.y, dim.z, 1e-6);
  const wrapper = new THREE.Group();
  object.position.sub(centre);
  wrapper.add(object);
  wrapper.scale.setScalar(s);
  return wrapper;
}

async function loadGlb(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  return normalise(gltf.scene);
}

async function loadPngCard(url) {
  const tex = await new THREE.TextureLoader().loadAsync(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  const aspect = tex.image.width / tex.image.height;
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * Math.min(aspect, 1.6), (2 * Math.min(aspect, 1.6)) / aspect),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide })
  );
  const g = new THREE.Group();
  g.add(card);
  return g;
}

// Three-step toon ramp for a flat cartoon look.
function toonRamp() {
  const t = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

// An original cartoon cat head: chunky round head, tabby forehead stripes,
// big shiny eyes, a triangle nose and a little "w" mouth.
export function buildProceduralCat() {
  const ramp = toonRamp();
  const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: ramp });
  const fur = toon(0xf0a35c);     // warm ginger
  const furDark = toon(0xb8622a); // stripes
  const cream = toon(0xfff3e0);
  const pink = toon(0xff8fab);
  const black = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const cat = new THREE.Group();
  const add = (geo, mat, pos, scale = [1, 1, 1], rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.scale.set(...scale);
    m.rotation.set(...rot);
    cat.add(m);
    return m;
  };
  const sphere = (r) => new THREE.SphereGeometry(r, 32, 20);

  // Head
  add(sphere(1), fur, [0, 0, 0], [1.18, 0.98, 1.0]);

  // Ears: low-poly pyramids with pink insides
  for (const s of [-1, 1]) {
    add(new THREE.ConeGeometry(0.4, 0.75, 4), fur, [s * 0.66, 0.85, 0.05], [1, 1, 0.6], [0, Math.PI / 4, s * -0.42]);
    add(new THREE.ConeGeometry(0.24, 0.5, 4), pink, [s * 0.64, 0.8, 0.2], [1, 1, 0.35], [0, Math.PI / 4, s * -0.42]);
  }

  // Tabby stripes on the forehead
  for (const [x, rz] of [[-0.22, 0.25], [0, 0], [0.22, -0.25]]) {
    add(new THREE.CapsuleGeometry(0.045, 0.22, 4, 8), furDark, [x, 0.66, 0.72], [1, 1, 1], [-0.75, 0, rz]);
  }

  // Muzzle: two cheeks + chin
  for (const s of [-1, 1]) add(sphere(0.34), cream, [s * 0.25, -0.32, 0.78], [1.05, 0.85, 0.7]);
  add(sphere(0.25), cream, [0, -0.5, 0.75], [1, 0.7, 0.7]);

  // Eyes: white, big pupil, two highlights each
  for (const s of [-1, 1]) {
    add(sphere(0.25), white, [s * 0.4, 0.15, 0.8], [1, 1.12, 0.55]);
    add(sphere(0.17), black, [s * 0.4, 0.13, 0.9], [1, 1.15, 0.5]);
    add(sphere(0.06), white, [s * 0.4 + 0.06, 0.22, 0.98], [1, 1, 0.5]);
    add(sphere(0.03), white, [s * 0.4 - 0.05, 0.06, 0.98], [1, 1, 0.5]);
  }

  // Nose: a downward-pointing triangle
  add(new THREE.ConeGeometry(0.09, 0.09, 3), pink, [0, -0.16, 1.03], [1.3, 1, 0.6], [Math.PI, 0, 0]);

  // "w" mouth from two half-tori
  for (const s of [-1, 1]) {
    add(new THREE.TorusGeometry(0.085, 0.018, 6, 16, Math.PI), black, [s * 0.085, -0.28, 1.0], [1, 1, 1], [0, 0, Math.PI]);
  }

  // Whiskers
  const wGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.85, 4);
  for (const s of [-1, 1]) {
    for (const k of [-1, 0, 1]) {
      add(wGeo, black, [s * 0.78, -0.3 + k * 0.08, 0.72], [1, 1, 1], [0, s * 0.25, Math.PI / 2 + k * 0.12 * s]);
    }
  }

  cat.userData.procedural = true;
  return cat;
}

export async function loadCatModel() {
  if (await assetExists('/assets/cat.glb')) {
    try {
      return { model: await loadGlb('/assets/cat.glb'), source: 'cat.glb' };
    } catch (e) {
      console.warn('cat.glb failed to load, falling back', e);
    }
  }
  if (await assetExists('/assets/cat.png')) {
    try {
      return { model: await loadPngCard('/assets/cat.png'), source: 'cat.png' };
    } catch (e) {
      console.warn('cat.png failed to load, falling back', e);
    }
  }
  return { model: buildProceduralCat(), source: 'procedural' };
}
