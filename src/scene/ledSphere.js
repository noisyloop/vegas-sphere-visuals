import * as THREE from 'three';
import { ledVertexShader, ledFragmentShader } from '../shaders/ledShader.js';

// The giant LED sphere. Uniforms that other materials need too (the ground
// glow samples the same content) are exposed as `sharedUniforms`.

export function createLedSphere({ radius, center }) {
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;

  const sharedUniforms = {
    uContent: { value: blank },
    uHasContent: { value: 0 },
    uMapping: { value: 0 },
    uRotation: { value: 0 },
    uBrightness: { value: 1.2 },
  };

  const uniforms = {
    ...sharedUniforms,
    uRows: { value: 160 },
    uDotSize: { value: 0.75 },
    uInterior: { value: 0 },
    uLod: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: ledVertexShader,
    fragmentShader: ledFragmentShader,
    side: THREE.DoubleSide, // the same surface is seen from outside and inside
  });

  // Tessellation only affects the silhouette; the LED grid is computed per pixel.
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 64), material);
  mesh.position.copy(center);

  return {
    mesh,
    uniforms,
    sharedUniforms,
    setContent(texture) {
      uniforms.uContent.value = texture || blank;
      uniforms.uHasContent.value = texture ? 1 : 0;
      this.updateLod();
    },
    // Pick the mip level whose texel size roughly matches one LED, so mipmapped
    // images (e.g. cat.png) are averaged over the LED footprint instead of aliasing.
    updateLod() {
      const img = uniforms.uContent.value.image;
      const h = img?.height || img?.videoHeight || 1;
      uniforms.uLod.value = Math.max(0, Math.log2(h / uniforms.uRows.value));
    },
  };
}
