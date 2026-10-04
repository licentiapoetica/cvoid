// The glass the void is seen through: chosen in the Tab panel, laid over the finished picture as the
// very last pass. Sizes are in screen pixels (not render pixels), so lines and masks keep their size
// while the resolution adapts to how fast the machine is.
import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export const SCREENS = ["none", "crt", "vhs", "pixel", "phosphor", "grain"];

const ScreenShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uMode: { value: 0 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: /* glsl */ `uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform int uMode; varying vec2 vUv;
float rand(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 at(vec2 uv){ return texture2D(tDiffuse, uv).rgb; }
float luma(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
void main(){
  vec2 uv = vUv, px = vUv * uRes;
  vec3 c;
  if (uMode == 1) {
    // crt: curved glass, a little colour fringe at the edges, scanlines, a phosphor mask, a dark rim, a faint flicker
    vec2 q = uv * 2. - 1.;
    q *= 1. + dot(q, q) * vec2(.035, .045);
    uv = q * .5 + .5;
    if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.) { gl_FragColor = vec4(0., 0., 0., 1.); return; }
    float fringe = .0012 + .0018 * dot(q, q);
    c = vec3(at(uv + vec2(fringe, 0.)).r, at(uv).g, at(uv - vec2(fringe, 0.)).b);
    c *= .78 + .22 * sin(uv.y * uRes.y * 2.094); // a line every three pixels
    float m = mod(floor(px.x), 3.);
    c *= vec3(m == 0. ? 1.1 : .92, m == 1. ? 1.1 : .92, m == 2. ? 1.1 : .92);
    vec2 v = uv * (1. - uv);
    c *= pow(clamp(v.x * v.y * 18., 0., 1.), .3);
    c *= .97 + .03 * sin(uTime * 113.);
    c *= 1.18;
  } else if (uMode == 2) {
    // vhs: lines that wander, colours that bleed sideways, a tracking band rolling through, snow
    float line = floor(vUv.y * uRes.y / 2.);
    uv.x += (rand(vec2(line, floor(uTime * 24.))) - .5) * .0025 + sin(vUv.y * 30. + uTime * 2.) * .0012;
    float roll = fract(vUv.y + uTime * .06);
    float band = smoothstep(.0, .035, abs(roll - .5));
    uv.x += (1. - band) * .01;
    c = vec3(at(uv + vec2(.005, 0.)).r, at(uv).g, at(uv - vec2(.003, 0.)).b);
    c = mix(c, vec3(luma(c)), .25) * mix(.75, 1., band);
    c += (rand(px + fract(uTime) * 91.) - .5) * .08;
  } else if (uMode == 3) {
    // pixel: big square pixels, and fewer colours
    vec2 cells = uRes / 4.;
    c = at((floor(vUv * cells) + .5) / cells);
    c = floor(c * 7. + .5) / 7.;
  } else if (uMode == 4) {
    // phosphor: an old green terminal, with its lines
    float l = luma(at(uv));
    c = vec3(.18, 1., .38) * pow(l, .85) * 1.25;
    c *= .82 + .18 * sin(uv.y * uRes.y * 2.094);
    c += vec3(.0, .015, .005);
  } else if (uMode == 5) {
    // grain: film, moving
    c = at(uv) + (rand(px + fract(uTime * 7.) * 113.) - .5) * .09;
  } else c = at(uv);
  gl_FragColor = vec4(c, texture2D(tDiffuse, uv).a); // (a hole a plugin cut in the picture kept)
}`,
};

export function screenPass() {
  const pass = new ShaderPass(ScreenShader);
  pass.enabled = false;
  return {
    pass,
    set(name) {
      const mode = Math.max(0, SCREENS.indexOf(name));
      pass.uniforms.uMode.value = mode;
      pass.enabled = mode > 0; // "none" costs nothing
    },
    resize(w, h) { pass.uniforms.uRes.value.set(w, h); },
    update(dt) { pass.uniforms.uTime.value = (pass.uniforms.uTime.value + dt) % 1000; },
  };
}
