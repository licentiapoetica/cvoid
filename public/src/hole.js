// What fills a portal's ring: not black, but the void's own dark violet, slowly turning, with a faint
// glow breathing at its edge.
import * as THREE from "three";

const HOLE_VERT = /* glsl */ `uniform float uPhase; varying vec3 vPos; varying vec3 vNormal; varying vec3 vView; varying float vPhase;
void main(){
  vPos = normalize(position);
  vPhase = uPhase; // each its own moment, so they do not all breathe as one; fixed, not taken from where it hangs
  vec4 wp = modelMatrix * vec4(position, 1.);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const HOLE_FRAG = /* glsl */ `uniform float uTime; varying vec3 vPos; varying vec3 vNormal; varying vec3 vView; varying float vPhase;
float hash(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a * noise(p); p *= 2.03; a *= .5; } return s; }
void main(){
  float t = uTime * .22, turn = t + length(vPos.xy) * 1.6;
  vec3 p = vPos * 2.2;
  p.xy = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * p.xy;
  float n = fbm(p + vec3(0., 0., t));
  vec3 c = mix(vec3(.004, .001, .012), vec3(.05, .016, .11), smoothstep(.35, .9, n));
  // the glow at its edge breathes, awake, and two brighter bands of it race round it, one each way,
  // with a quick shimmer over all of it: open, and working
  float breathe = .5 + .5 * sin(uTime * 2.6 + vPhase);
  float rim = pow(1. - abs(dot(normalize(vNormal), normalize(vView))), mix(6., 4., breathe));
  float a = atan(vPos.y, vPos.x);
  float sweep = pow(.5 + .5 * cos(a - uTime * 2.4 - vPhase), 6.) + .6 * pow(.5 + .5 * cos(2. * a + uTime * 1.7 + vPhase), 10.);
  float shimmer = .9 + .1 * sin(uTime * 9. + a * 3. + vPhase);
  c += vec3(.5, .26, 1.2) * rim * (.55 + .35 * breathe + .7 * sweep) * shimmer;
  gl_FragColor = vec4(c, 1.);
}`;
// one for each ring (they share the shader): its own fixed moment to breathe from (taken from where it
// hangs instead, it would race whenever a ring is carried round)
export function voidHole(uTime, phase = Math.random() * Math.PI * 2) {
  return new THREE.ShaderMaterial({ uniforms: { uTime, uPhase: { value: phase } }, vertexShader: HOLE_VERT, fragmentShader: HOLE_FRAG, side: THREE.DoubleSide });
}
