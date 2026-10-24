// Shared GLSL helpers for converting between a 3D direction on the sphere and
// a 2D texture coordinate. Used by the LED sphere (direction -> uv, to sample
// content) and by the demo fractal (uv -> direction, to generate content in
// whichever layout is selected), so both always agree.
//
// Conventions (object space, +Y up):
//   theta = polar angle from the zenith (+Y), 0..PI
//   phi   = azimuth, atan(x, z), -PI..PI, 0 facing +Z (the default camera side)
//
// uMapping: 0 = equirectangular (2:1 lat/long)
//           1 = fisheye / dome master (180 deg circular, zenith in the middle)

export const mappingGLSL = /* glsl */ `
#ifndef PI
#define PI 3.141592653589793
#endif

// Direction -> uv. Returns uv outside [0,1] (x < 0) when the direction has no
// content in this layout (e.g. the lower hemisphere of a 180 deg dome master).
vec2 dirToUv(vec3 d, int mapping) {
  float theta = acos(clamp(d.y, -1.0, 1.0));
  float phi = atan(d.x, d.z);
  if (mapping == 0) {
    return vec2(phi / (2.0 * PI) + 0.5, 1.0 - theta / PI);
  }
  // Dome master: radius grows linearly with angle from the zenith,
  // reaching the image edge (r = 0.5) at the horizon (theta = 90 deg).
  if (theta > 0.5 * PI) return vec2(-1.0);
  float r = theta / PI; // (theta / (PI/2)) * 0.5
  return vec2(0.5) + r * vec2(sin(phi), cos(phi));
}

// uv -> direction (inverse of dirToUv). For the dome master, pixels outside
// the circle return a zero vector.
vec3 uvToDir(vec2 uv, int mapping) {
  if (mapping == 0) {
    float phi = (uv.x - 0.5) * 2.0 * PI;
    float theta = (1.0 - uv.y) * PI;
    return vec3(sin(theta) * sin(phi), cos(theta), sin(theta) * cos(phi));
  }
  vec2 p = uv - 0.5;
  float r = length(p);
  if (r > 0.5) return vec3(0.0);
  float theta = r * PI;
  float phi = atan(p.x, p.y);
  return vec3(sin(theta) * sin(phi), cos(theta), sin(theta) * cos(phi));
}
`;
