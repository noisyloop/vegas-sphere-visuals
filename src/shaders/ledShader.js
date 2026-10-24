import { mappingGLSL } from './mapping.glsl.js';

// LED panel shader for the sphere.
//
// The real thing is a sphere tiled with LED "pucks" at a roughly constant
// physical spacing. A naive lat/long grid would bunch the dots up at the
// poles, so instead the surface is split into latitude rows of equal height,
// and every row gets its own number of columns proportional to its
// circumference (sin(theta)). That keeps the dots round and evenly spaced
// from the equator all the way to the top.
//
// Each LED shows exactly one colour: the content sampled at the centre of its
// cell. That is what makes the surface read as a low-resolution display when
// you get close, rather than a smooth texture with dots painted on top.

export const ledVertexShader = /* glsl */ `
varying vec3 vDir;        // object-space direction from the sphere centre
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const ledFragmentShader = /* glsl */ `
${mappingGLSL}

uniform sampler2D uContent;   // whatever is playing (video, capture, demo, cat)
uniform float uHasContent;    // 0 -> show a dark, switched-off panel
uniform int   uMapping;       // 0 equirect, 1 dome master
uniform float uRotation;      // content azimuth offset (radians), LEDs stay put
uniform float uRows;          // LED rows from pole to pole (density)
uniform float uDotSize;       // dot radius as a fraction of the cell (0..1)
uniform float uBrightness;
uniform float uInterior;      // 1 when viewed from inside: mirror so it reads right
uniform float uLod;           // mip level matching the footprint of one LED

varying vec3 vDir;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

vec3 rotateY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

void main() {
  vec3 d = normalize(vDir);
  float theta = acos(clamp(d.y, -1.0, 1.0));      // 0 at the top
  float phi01 = atan(d.x, d.z) / (2.0 * PI) + 0.5; // 0..1 around

  // --- 1. Which LED cell are we in? ---------------------------------------
  float v = theta / PI * uRows;                 // continuous row coordinate
  float row = floor(v);
  float thetaC = (row + 0.5) / uRows * PI;      // latitude of this row's centre
  // Columns in this row ~ its circumference, so cells stay square.
  float cols = max(3.0, floor(2.0 * uRows * sin(thetaC) + 0.5));
  float u = phi01 * cols;
  float col = floor(u);

  // Local position inside the cell, in "cell units" (-0.5..0.5). The x term
  // is rescaled by the actual vs. row-centre circumference so dots near the
  // poles do not get squashed.
  float sx = sin(theta) / max(sin(thetaC), 1e-3);
  vec2 cell = vec2((fract(u) - 0.5) * sx, fract(v) - 0.5);
  float dist = length(cell);

  // --- 2. Round dot mask with screen-space anti-aliasing -------------------
  float radius = 0.5 * uDotSize;
  float aa = clamp(fwidth(v), 1e-4, 1.0);       // one pixel, in cell units
  float dotMask = 1.0 - smoothstep(radius - aa, radius + aa, dist);
  // Slightly hotter in the middle like a real diffused LED puck.
  float puck = mix(0.7, 1.0, 1.0 - clamp(dist / max(radius, 1e-3), 0.0, 1.0));
  // When dots shrink below ~2 px they would shimmer (moire). Fade towards the
  // dot's average coverage instead, which is what the eye sees from far away.
  // (Boosted a little: from a distance the real thing reads as one bright,
  // continuous screen, not as dots on black.)
  float coverage = min(1.0, PI * radius * radius * 1.3);
  float farFade = smoothstep(0.25, 0.6, aa);
  float led = mix(dotMask * puck, coverage, farFade);

  // --- 3. Sample the content at the centre of this LED ---------------------
  float phiC = ((col + 0.5) / cols - 0.5) * 2.0 * PI;
  vec3 dc = vec3(sin(thetaC) * sin(phiC), cos(thetaC), sin(thetaC) * cos(phiC));
  dc = rotateY(dc, uRotation);
  if (uInterior > 0.5) dc.x = -dc.x;            // inside view is mirrored
  vec2 uv = dirToUv(dc, uMapping);
  vec3 content = vec3(0.0);
  if (uv.x >= 0.0) content = textureLod(uContent, uv, uLod).rgb;
  content *= uHasContent;

  // --- 4. Compose ----------------------------------------------------------
  // LEDs have a limited viewing angle: dim them at grazing angles.
  vec3 V = normalize(cameraPosition - vWorldPos);
  float facing = abs(dot(normalize(vWorldNormal), V));
  float viewDim = mix(0.35, 1.0, sqrt(facing));

  vec3 panel = vec3(0.010, 0.011, 0.015);        // dark gaps between pucks
  vec3 col3 = panel
            + content * led * uBrightness * viewDim
            // faint light bleed between dots = soft emissive glow
            + content * 0.1 * uBrightness * viewDim;

  gl_FragColor = vec4(col3, 1.0);
}
`;
