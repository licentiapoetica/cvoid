// GLSL shared by the sky, the cube structures and the light points.

// Helpers available to a sector's field function (and to Claude, who writes it).
// Simplex noise after Ian McEwan / Stefan Gustavson (MIT).
export const NOISE_LIB = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float hash(vec3 p){p=fract(p*0.3183099+vec3(.1,.2,.3)); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float fbm(vec3 p){float a=.5,s=0.; for(int i=0;i<4;i++){s+=a*snoise(p); p=p*2.02+vec3(11.3,7.7,3.1); a*=.5;} return s;}
float ridged(vec3 p){float a=.5,s=0.; for(int i=0;i<4;i++){float n=1.-abs(snoise(p)); s+=a*n*n; p=p*2.03+vec3(5.2,1.3,9.4); a*=.5;} return s;}
float worley(vec3 p){
  vec3 c=floor(p), f=fract(p); float d=1.;
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++){
    vec3 o=vec3(float(x),float(y),float(z));
    vec3 r=o+vec3(hash(c+o),hash(c+o+17.3),hash(c+o+41.7))-f;
    d=min(d,dot(r,r));
  }
  return sqrt(d);
}
`;

export const DEFAULT_FIELD = `vec3 q = p * 0.7 + vec3(0.0, t * 0.015, 0.0); float n = fbm(q + 0.6 * snoise(q * 0.5)); return smoothstep(0.05, 0.75, n);`;

const fieldFn = (body) => `float field(vec3 p, float t){\n${body}\n}`;

// Compile a candidate field body on its own so a bad one never reaches the scene.
export function fieldCompiles(gl, body) {
  const shader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(
    shader,
    `#version 300 es\nprecision highp float;\n${NOISE_LIB}\n${fieldFn(body)}\nout vec4 o;\nvoid main(){ o = vec4(field(gl_FragCoord.xyz, 0.)); }`
  );
  gl.compileShader(shader);
  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  const log = ok ? "" : gl.getShaderInfoLog(shader);
  gl.deleteShader(shader);
  return { ok, log };
}

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`;

export const skyFrag = (body) => /* glsl */ `
uniform float uTime, uOpacity, uLight, uBass;
uniform vec3 uOrigin, uFogColor, uDeep, uGlow, uAccent;
varying vec3 vDir;
${NOISE_LIB}
${fieldFn(body)}
void main(){
  vec3 d = normalize(vDir);
  float acc = 0., peak = 0.;
  for (int i = 0; i < 3; i++) {
    float f = clamp(field(uOrigin + d * (1.4 + float(i) * 1.6), uTime), 0., 1.);
    acc += f; peak = max(peak, f);
  }
  acc /= 3.;
  vec3 col = mix(uDeep, uFogColor, 0.55 + 0.3 * d.y);
  // the nebula is a rumour of light, not a sky
  // bass swells the nebula
  col = mix(col, uGlow, min(acc * 0.3 * uLight * (1. + uBass * 1.3), 1.));
  col += uAccent * pow(peak, 4.) * 0.2 * uLight;
  gl_FragColor = vec4(col, uOpacity);
}`;

const FOG = /* glsl */ `float fogAmount(float dist, float density){ float f = dist * density; return 1. - exp(-f * f); }`;

// Structures. Cubes light their edges from box coordinates; faceted solids (BARY) from barycentrics.
export const BOX_VERT = /* glsl */ `
attribute float aSeed, aTint;
#ifdef BARY
attribute vec3 aBary;
varying vec3 vBary;
#endif
uniform float uMat, uTime, uWarp, uBeat;
varying vec3 vLocal, vNormal, vLocalNormal, vView, vScale;
varying float vTint, vFlash, vDist;
void main(){
  // each piece grows in at its own moment as the sector materializes
  float m = smoothstep(aSeed * 0.7, aSeed * 0.7 + 0.3, uMat);
  // every piece swells on the beat, each by its own amount
  float grow = m * m * (3. - 2. * m) * (1. + uBeat * 0.1 * (0.3 + aSeed));
  vLocal = position; vLocalNormal = normal; vTint = aTint;
  vFlash = (1. - m) * step(0.001, m) + smoothstep(0.75, 1., m) * (1. - m) * 4.;
#ifdef BARY
  vBary = aBary;
#endif
  mat4 world = modelMatrix * instanceMatrix;
  vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vec4 wp = world * vec4(position * grow, 1.);
  // dreamt things do not hold still: the whole form sways and breathes, slowly, like something seen through water
  vec3 sway = sin(wp.yzx * 0.021 + uTime * vec3(0.23, 0.17, 0.29)) + 0.5 * sin(wp.zxy * 0.047 - uTime * 0.31);
  wp.xyz += sway * uWarp;
  vNormal = normalize(mat3(world) * (normal / (vScale * vScale)));
  vView = cameraPosition - wp.xyz;
  vDist = length(vView);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const BOX_FRAG = /* glsl */ `
uniform vec3 uFogColor, uDeep, uGlow, uAccent;
uniform float uFogDensity, uBands, uLight, uMid, uBeat, uUnit;
#ifdef FRACTAL
uniform float uNear;
#endif
varying vec3 vLocal, vNormal, vLocalNormal, vView, vScale;
varying float vTint, vFlash, vDist;
#ifdef BARY
varying vec3 vBary;
#endif
${FOG}
void main(){
#ifdef BARY
  float b = min(min(vBary.x, vBary.y), vBary.z);
  float edge = 1. - smoothstep(0., fwidth(b) * 1.5 + 0.004, b);
#else
  // glowing edges, kept a constant world width whatever the box proportions
  float w = (0.5 + vDist * 0.0035) / uUnit;
  vec3 e = smoothstep(vec3(0.5) - w / vScale, vec3(0.5), abs(vLocal));
  float edge = max(max(e.x * e.y, e.y * e.z), e.x * e.z);
  // tall columns read as stacks of cubes
  float rows = (vLocal.y + 0.5) * vScale.y / max(vScale.x, 0.001) * uBands;
  float band = smoothstep(0.5 - w / vScale.x, 0.5, abs(fract(rows) - 0.5));
  edge = max(edge, band * step(0.5, uBands) * (1. - step(0.5, abs(vLocalNormal.y))));
#endif
  float fres = pow(1. - abs(dot(normalize(vNormal), normalize(vView))), 2.5);
  vec3 tint = mix(uGlow, uAccent, vTint);
  // faces stay close to black: the void is lit by edges, not surfaces
  vec3 col = mix(uDeep, uGlow, 0.02 + 0.08 * fres) * (0.5 + 0.5 * vNormal.y);
  // mid frequencies brighten every edge; the beat lights the accent pieces
  float lit = 1. + uMid * 0.6 + uBeat * vTint * 1.0;
#ifdef FRACTAL
  // how far you can see shrinks with your distance to the centre, so every depth looks like the last
  lit *= 1. - smoothstep(12. * uNear, 40. * uNear, vDist);
  // and what is right against the eye is dim, or the inside of the thing would be all glare
  lit *= 0.25 + 0.75 * smoothstep(0.3 * uNear, 2.5 * uNear, vDist);
#endif
  col += (tint * edge * 1.1 + tint * fres * 0.1) * lit;
  col = col * uLight + tint * vFlash * (0.08 + edge);
  col = mix(col, uFogColor, fogAmount(vDist, uFogDensity));
  gl_FragColor = vec4(col, 1.);
}`;

export const MOTE_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime, uSize, uCell, uOrbit, uPx, uFogDensity, uMat, uLight, uHigh;
uniform vec3 uDrift;
varying float vAlpha;
${FOG}
void main(){
  vec3 p = position + uDrift * uTime * (0.4 + aSeed);
  p = mod(p + uCell * 0.5, uCell) - uCell * 0.5;
  float a = uOrbit * uTime * (0.3 + aSeed);
  p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
  p += 5. * sin(uTime * 0.25 + aSeed * 40. + p.yzx * 0.02);
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  float dist = length(mv.xyz);
  // high frequencies make the motes flare
  gl_PointSize = clamp(uSize * uPx * (0.6 + aSeed) * (1. + uHigh * 1.4) * 380. / max(dist, 1.), 1., 48.);
  float twinkle = 0.55 + 0.45 * sin(uTime * (0.5 + aSeed * 2.) + aSeed * 90.);
  vAlpha = (1. - fogAmount(dist, uFogDensity)) * twinkle * uMat * uLight * smoothstep(2., 14., dist);
  gl_Position = projectionMatrix * mv;
}`;

export const MOTE_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.;
  float a = pow(max(1. - d, 0.), 2.);
  gl_FragColor = vec4(uColor * a * vAlpha, 1.);
}`;

export const ORB_VERT = /* glsl */ `
attribute vec4 aOrbit; // radius, phase, tilt, angular speed
attribute vec3 aColor;
uniform float uTime, uPx, uFogDensity, uMat, uLight, uBass;
varying vec3 vColor;
varying float vAlpha;
${FOG}
void main(){
  float a = aOrbit.y + uTime * aOrbit.w;
  vec3 p = vec3(cos(a), 0., sin(a)) * aOrbit.x;
  float c = cos(aOrbit.z), s = sin(aOrbit.z);
  p.yz = mat2(c, -s, s, c) * p.yz;
  p.y += sin(uTime * 0.4 + aOrbit.y * 3.) * 8.;
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  float dist = length(mv.xyz);
  gl_PointSize = clamp(uPx * 14000. * uMat * (1. + uBass * 0.5) / max(dist, 1.), 2., 200.);
  vColor = aColor;
  vAlpha = (1. - fogAmount(dist, uFogDensity)) * uMat * uLight;
  gl_Position = projectionMatrix * mv;
}`;

export const ORB_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.;
  float halo = pow(max(1. - d, 0.), 3.);
  float core = smoothstep(0.22, 0.05, d);
  float rim = smoothstep(0.3, 0.24, d) * smoothstep(0.16, 0.24, d);
  gl_FragColor = vec4((vColor * (halo * 0.9 + rim * 0.8) + vec3(1.) * core * 0.9) * vAlpha, 1.);
}`;
