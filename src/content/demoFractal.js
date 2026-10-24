import * as THREE from 'three';
import { mappingGLSL } from '../shaders/mapping.glsl.js';

// Built-in demo content: an animated Julia set rendered every frame into an
// offscreen texture. The fractal is computed on the sphere itself (each texel
// is turned back into a 3D direction, then stereographically projected onto
// the complex plane) so it has no seams and stays undistorted in both the
// equirectangular and the dome-master layout.

const fragmentShader = /* glsl */ `
${mappingGLSL}
uniform float uTime;
uniform int uMapping;
varying vec2 vUv;

vec3 palette(float t) {
  // Cosine palette (iq): neon magenta / cyan / gold
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  vec3 d = uvToDir(vUv, uMapping);
  if (dot(d, d) < 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  // Projection axis: front/back for the exterior-friendly equirect layout,
  // zenith for the dome master so the fractal blooms straight overhead.
  vec3 axis = uMapping == 0 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  float s = dot(d, axis);
  // Each hemisphere gets its own stereographic chart (from the opposite pole).
  // Both charts agree exactly on the seam (|p| = 1), so with the same c the
  // fractal is continuous across it and can fill the whole sphere.
  vec3 t1 = normalize(abs(axis.y) > 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0));
  vec3 t2 = cross(axis, t1);
  vec2 p = vec2(dot(d, t1), dot(d, t2)) / (1.0 + abs(s));

  // Slow rotation + breathing zoom of the complex plane.
  float a = uTime * 0.07;
  p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
  vec2 z = p * (1.55 + 0.12 * sin(uTime * 0.21));

  // c walks around a ring that hugs the Mandelbrot boundary: endless variety.
  float ct = uTime * 0.11;
  vec2 c = 0.7885 * vec2(cos(ct), sin(ct));

  float trap = 1e9;
  float i = 0.0;
  const float MAX_IT = 90.0;
  for (float n = 0.0; n < MAX_IT; n++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    trap = min(trap, abs(length(z) - 0.6));
    if (dot(z, z) > 64.0) break;
    i++;
  }

  vec3 col;
  if (i >= MAX_IT) {
    // Inside the set: colour by the orbit trap instead of leaving it black.
    col = palette(trap * 3.0 + uTime * 0.05 + 0.5) * (0.2 + 0.6 * exp(-trap * 4.0));
  } else {
    float mu = i - log2(log2(dot(z, z))) + 4.0; // smooth iteration count
    // Log scale so the fast-escaping outer region still gets colour; the
    // dome is huge and mostly "outside" the set from most viewpoints.
    float f = log(mu + 1.0) / log(MAX_IT);
    vec3 deep = vec3(0.10, 0.02, 0.22) * (0.6 + f);
    col = mix(deep, palette(f * 1.6 + uTime * 0.03), smoothstep(0.08, 0.6, f));
    col += 0.6 * vec3(1.0, 0.6, 1.0) * exp(-trap * 18.0);
  }
  // Shader works in display space; convert to linear for the render pipeline.
  gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(2.2)), 1.0);
}
`;

export class DemoFractal {
  constructor(renderer, width = 1024, height = 512) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: false,
      type: THREE.HalfFloatType,
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMapping: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.camera = new THREE.Camera();
  }

  get texture() {
    return this.target.texture;
  }

  render(time, mapping) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uMapping.value = mapping;
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prev);
  }
}
