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

// Card material that also keys out a green-screen background, so a cat image
// shot on green works as well as one with real transparency.
function chromaKeyMaterial(tex) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float greenness = diffuseColor.g - max(diffuseColor.r, diffuseColor.b);
      if (greenness > 0.18) discard;                       // key out the screen
      diffuseColor.g = min(diffuseColor.g, max(diffuseColor.r, diffuseColor.b) + 0.02); // despill edges`
    );
  };
  return mat;
}

async function loadPngCard(url) {
  const tex = await new THREE.TextureLoader().loadAsync(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  const aspect = tex.image.width / tex.image.height;
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * Math.min(aspect, 1.6), (2 * Math.min(aspect, 1.6)) / aspect),
    chromaKeyMaterial(tex)
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

// A chunky grey tabby built from primitives: round body with dark stripes,
// white chest and paws, big head with amber eyes, and a curled tail.
export function buildProceduralCat() {
  const ramp = toonRamp();
  const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: ramp });
  const fur = toon(0x7a7068);       // grey-brown tabby
  const stripe = toon(0x3b3530);
  const white = toon(0xeeeae4);
  const pink = toon(0xd98a8f);
  const iris = new THREE.MeshBasicMaterial({ color: 0x9a8a3a });
  const black = new THREE.MeshBasicMaterial({ color: 0x0c0c0c });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });

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

  // Body: a round loaf, with tabby stripes wrapped over the back.
  const BX = 0.95, BY = 0.78, BZ = 1.3;
  add(sphere(1), fur, [0, 0, 0], [BX, BY, BZ]);
  for (const z of [-0.85, -0.45, -0.05, 0.35]) {
    const k = Math.sqrt(1 - (z / BZ) ** 2) * 1.01;
    add(new THREE.TorusGeometry(1, 0.06, 6, 32, Math.PI), stripe, [0, 0, z], [BX * k, BY * k, 1]);
  }
  add(sphere(1), white, [0, -0.12, 0.92], [0.55, 0.6, 0.42]); // chest

  // Legs with white paws
  for (const [x, z] of [[-0.5, 0.7], [0.5, 0.7], [-0.52, -0.75], [0.52, -0.75]]) {
    add(new THREE.CylinderGeometry(0.2, 0.18, 0.6, 12), fur, [x, -0.72, z]);
    add(sphere(0.21), white, [x, -1.02, z + 0.05], [1, 0.6, 1.25]);
  }

  // Tail curling up behind
  const tail = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.1, -1.2), new THREE.Vector3(0.1, 0.3, -1.6),
    new THREE.Vector3(0.35, 0.75, -1.65), new THREE.Vector3(0.45, 1.05, -1.4),
  ]);
  add(new THREE.TubeGeometry(tail, 24, 0.12, 8), fur, [0, 0, 0]);

  // Head
  const H = [0, 0.62, 1.2];
  const at = (x, y, z) => [H[0] + x, H[1] + y, H[2] + z];
  add(sphere(0.66), fur, H, [1.12, 0.95, 0.95]);
  for (const [x, rz] of [[-0.14, 0.2], [0, 0], [0.14, -0.2]]) {
    add(new THREE.CapsuleGeometry(0.035, 0.18, 4, 8), stripe, at(x, 0.42, 0.42), [1, 1, 1], [-0.9, 0, rz]);
  }
  for (const s of [-1, 1]) {
    add(new THREE.ConeGeometry(0.24, 0.42, 4), fur, at(s * 0.42, 0.55, -0.05), [1, 1, 0.6], [0, Math.PI / 4, s * -0.35]);
    add(new THREE.ConeGeometry(0.14, 0.28, 4), pink, at(s * 0.41, 0.52, 0.06), [1, 1, 0.35], [0, Math.PI / 4, s * -0.35]);
    // Eyes: amber iris, round pupil, highlight
    add(sphere(0.13), iris, at(s * 0.24, 0.1, 0.55), [1, 1, 0.5]);
    add(sphere(0.085), black, at(s * 0.24, 0.1, 0.6), [1, 1, 0.5]);
    add(sphere(0.03), shine, at(s * 0.24 + 0.04, 0.15, 0.64), [1, 1, 0.5]);
    // Muzzle
    add(sphere(0.2), white, at(s * 0.12, -0.2, 0.52), [1.05, 0.8, 0.7]);
  }
  add(sphere(0.15), white, at(0, -0.33, 0.48), [1, 0.7, 0.7]); // chin
  add(new THREE.ConeGeometry(0.06, 0.06, 3), pink, at(0, -0.06, 0.66), [1.3, 1, 0.6], [Math.PI, 0, 0]);
  const wGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.6, 4);
  for (const s of [-1, 1]) {
    for (const k of [-1, 0, 1]) {
      add(wGeo, shine, at(s * 0.45, -0.2 + k * 0.05, 0.48), [1, 1, 1], [0, s * 0.3, Math.PI / 2 + k * 0.12 * s]);
    }
  }

  // Centre it and scale to ~2 units across so it fits like the old head did.
  const wrapped = normalise(cat, 2.6);
  wrapped.userData.procedural = true;
  return wrapped;
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
