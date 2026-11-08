// AURA Core v2 — Three.js energy core.
// Layers: ambient light field · depth dust · energy membrane (noise-displaced, contour lines)
//         · heart · particle shell · 3 orbital rings · vision scan plane · ripple halo · bloom.
// Every visual parameter is driven by app state: setState / setLevel (mic RMS) /
// setAmplitude (TTS analyser) / setProgress (task) / setTicks (pipeline stages).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const TOKEN_FALLBACK = {
  '--bg': '#070A12', '--bg-2': '#0C1220', '--accent': '#53DFFF', '--aurora': '#547DFF',
  '--violet': '#9575FF', '--soft': '#DCEAFF', '--danger': '#FF6B78', '--faint': '#56647A', '--white': '#FFFFFF',
};

function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const out = {};
  for (const k of Object.keys(TOKEN_FALLBACK)) {
    let c = new THREE.Color(TOKEN_FALLBACK[k]);
    const v = cs.getPropertyValue(k).trim();
    if (v && ctx) {
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = TOKEN_FALLBACK[k]; ctx.fillStyle = v; ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      c = new THREE.Color().setRGB(d[0] / 255, d[1] / 255, d[2] / 255, THREE.SRGBColorSpace);
    }
    out[k.slice(2)] = c;
  }
  return out;
}
const k = (c, s) => c.clone().multiplyScalar(s);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp1 = (v, m) => Math.max(-m, Math.min(m, v));
const mixc = (a, b, t) => a.clone().lerp(b, t);

function buildStates(T) {
  const base = { energy: .35, disp: .05, freq: 1.3, swirl: 0, gather: 0, vision: 0, exec: 0, error: 0,
    dash: .25, comet: .6, ringSpeed: .05, orbit: .06, heart: .8, lines: .7, contour: 4, shell: 1, listenRip: 0, speakRip: 0 };
  const S = {
    idle:      { ...base },
    listening: { ...base, energy: .55, disp: .055, freq: 1.6, swirl: .1, gather: .5, dash: .3, comet: .4, ringSpeed: .08, orbit: .05, heart: 1, listenRip: 1 },
    thinking:  { ...base, energy: .7, disp: .085, freq: 2.5, swirl: 1, gather: .12, dash: .85, comet: 1, ringSpeed: .5, orbit: .32, heart: 1, lines: 1, contour: 7 },
    speaking:  { ...base, energy: .6, disp: .04, freq: 1.4, swirl: .1, gather: .1, dash: .2, comet: .5, ringSpeed: .06, orbit: .08, heart: 1.1, speakRip: 1 },
    vision:    { ...base, energy: .5, disp: .03, freq: 1.2, swirl: .05, vision: 1, dash: .15, comet: .2, ringSpeed: .03, orbit: .03, heart: .85, lines: .45, contour: 3 },
    executing: { ...base, energy: .62, disp: .05, freq: 1.5, swirl: .2, exec: 1, dash: .1, comet: 0, ringSpeed: .12, orbit: .1, heart: .95 },
    error:     { ...base, energy: .25, disp: .075, freq: 3.2, error: 1, gather: .1, dash: .1, comet: 0, ringSpeed: .012, orbit: .015, heart: .5, lines: .4, contour: 5, shell: .8 },
  };
  const P = {
    idle:      { c1: k(T.aurora, .45), c2: T.aurora, c3: T.accent, heart: T.soft, p1: T.aurora, p2: T.accent, r1: k(T.soft, .55), r2: T.accent, amb: T.aurora },
    listening: { c1: k(T.aurora, .35), c2: T.accent, c3: T.soft, heart: T.soft, p1: T.accent, p2: T.soft, r1: k(T.accent, .6), r2: T.soft, amb: T.accent },
    thinking:  { c1: k(T.violet, .38), c2: T.violet, c3: mixc(T.violet, T.soft, .6), heart: T.soft, p1: T.violet, p2: T.aurora, r1: k(T.violet, .7), r2: T.soft, amb: T.violet },
    speaking:  { c1: k(T.aurora, .35), c2: k(T.soft, .75), c3: T.white, heart: T.white, p1: T.soft, p2: T.accent, r1: k(T.soft, .5), r2: T.white, amb: T.soft },
    vision:    { c1: k(T.aurora, .3), c2: k(T.accent, .8), c3: T.accent, heart: T.soft, p1: T.accent, p2: T.soft, r1: k(T.accent, .5), r2: T.accent, amb: T.accent },
    executing: { c1: k(T.aurora, .45), c2: T.aurora, c3: T.accent, heart: T.soft, p1: T.aurora, p2: T.accent, r1: k(T.aurora, .6), r2: T.accent, amb: T.aurora },
    error:     { c1: k(T.danger, .28), c2: k(T.danger, .7), c3: mixc(T.danger, T.soft, .35), heart: k(T.danger, .8), p1: k(T.danger, .6), p2: T.faint, r1: k(T.danger, .5), r2: T.danger, amb: T.danger },
  };
  return { S, P };
}

const NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const BILLBOARD_VERT = /* glsl */`
varying vec2 vUv;
void main(){
  vUv = uv;
  float s = length(modelMatrix[0].xyz);
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * s;
  gl_Position = projectionMatrix * mv;
}`;

const SHELL_VERT = /* glsl */`
uniform float uTime, uDisp, uFreq, uAmp, uBreath, uTouch; uniform vec3 uTouchDir;
varying vec3 vViewPos; varying vec3 vNormal; varying vec3 vObj; varying float vF;
${NOISE}
float field(vec3 p){
  return snoise(p*uFreq + vec3(0.0, uTime*0.21, uTime*0.13))*0.72
       + snoise(p*uFreq*2.17 - vec3(uTime*0.27, 0.0, uTime*0.19))*0.28;
}
vec3 disp(vec3 n, float f){
  float d = uDisp*f + uAmp*0.035*sin(n.y*7.0 - uTime*5.0) + uBreath;
  d += uTouch*0.11*pow(max(dot(n, uTouchDir), 0.0), 7.0);
  return n*(1.0 + d);
}
void main(){
  vec3 n0 = normalize(position);
  vec3 tg = normalize(cross(n0, abs(n0.y) < 0.99 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0)));
  vec3 bt = normalize(cross(n0, tg));
  float e = 0.014;
  vec3 n1 = normalize(n0 + tg*e); vec3 n2 = normalize(n0 + bt*e);
  float f0 = field(n0);
  vec3 p0 = disp(n0, f0); vec3 p1 = disp(n1, field(n1)); vec3 p2 = disp(n2, field(n2));
  vec3 nrm = normalize(cross(p1 - p0, p2 - p0));
  if (dot(nrm, n0) < 0.0) nrm = -nrm;
  vec4 mv = modelViewMatrix * vec4(p0, 1.0);
  vViewPos = mv.xyz; vNormal = normalize(normalMatrix * nrm); vObj = n0; vF = f0;
  gl_Position = projectionMatrix * mv;
}`;

const SHELL_FRAG = /* glsl */`
uniform float uTime, uSwirl, uVision, uScanY, uLines, uContour, uShell, uError, uEnergy, uTouch;
uniform vec3 uC1, uC2, uC3, uTouchDir;
varying vec3 vViewPos; varying vec3 vNormal; varying vec3 vObj; varying float vF;
void main(){
  vec3 V = normalize(-vViewPos); vec3 N = normalize(vNormal);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.3);
  float cl = vF*uContour + uTime*0.045*(1.0 + uSwirl*5.0);
  float w = fwidth(cl);
  float dl = abs(fract(cl + 0.5) - 0.5);
  float line = 1.0 - smoothstep(0.0, w*1.3, dl);
  vec3 col = mix(uC1, uC2, smoothstep(0.0, 0.85, fres));
  col += uC3 * pow(fres, 4.0) * 0.95;
  col += mix(uC2, uC3, 0.5) * line * (0.35 + 0.5*fres) * uLines;
  float scan = exp(-abs(vObj.y - uScanY)*36.0) * uVision;
  col += uC3 * scan * 0.8;
  float touch = pow(max(dot(vObj, uTouchDir), 0.0), 10.0) * uTouch;
  col += uC3 * touch * 0.7;
  float a = (0.07 + 0.8*fres) * uShell * (0.75 + uEnergy*0.5) + line*0.24*uLines*(1.0 - fres*0.5) + scan*0.55 + touch*0.3;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

const HEART_FRAG = /* glsl */`
uniform vec3 uHeartC; uniform float uHeart, uTime, uError, uAmp, uImpulse;
varying vec2 vUv;
void main(){
  float r = length(vUv - 0.5) * 2.0;
  float flick = 1.0 - uError*0.18*(0.5 + 0.5*sin(uTime*3.6));
  float core = exp(-r*5.2)*0.9 + exp(-r*2.2)*0.22;
  float I = core * uHeart * flick * (1.0 + uAmp*0.9 + uImpulse*0.8) * 0.62;
  gl_FragColor = vec4(uHeartC * I, I);
}`;

const HALO_FRAG = /* glsl */`
uniform vec3 uAmbC, uRipC; uniform float uEnergy, uRip, uListenRip, uSpeakRip, uLevel, uAmp, uImpulse;
varying vec2 vUv;
void main(){
  float r = length(vUv - 0.5) * 7.0;
  float glow = exp(-max(r - 0.95, 0.0)*2.4) * smoothstep(0.55, 1.05, r) * (0.10 + uEnergy*0.16);
  float rip = 0.0;
  for (int i = 0; i < 3; i++) {
    float ph = fract(uRip + float(i)/3.0);
    float rin = mix(2.9, 1.08, ph);
    rip += exp(-abs(r - rin)*26.0) * ph * (1.0 - ph) * 3.2 * uListenRip * (0.25 + uLevel*1.4);
    float rout = mix(1.08, 3.1, ph);
    rip += exp(-abs(r - rout)*22.0) * (1.0 - ph) * uSpeakRip * (0.08 + uAmp*1.3);
  }
  float imp = exp(-abs(r - mix(1.05, 3.2, 1.0 - uImpulse))*18.0) * uImpulse * 0.9;
  vec3 col = uAmbC*glow + uRipC*(rip + imp)*0.32;
  float a = glow + (rip + imp)*0.32;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

const PARTICLE_VERT = /* glsl */`
uniform float uOrbit, uFlow, uSwirl, uGather, uLevel, uAmp, uVision, uExec, uProgress, uError, uScanY, uSize, uPR, uScale, uTime;
uniform vec2 uPtr; uniform float uPtrOn, uPtrR, uAspect, uPush;
uniform mat3 uRM0, uRM1, uRM2; uniform vec3 uRR;
uniform vec3 uP1, uP2, uC3;
attribute vec3 aDir; attribute vec4 aSeed; attribute float aRadius;
varying vec3 vColor; varying float vAlpha;
vec3 rotAxis(vec3 v, vec3 k, float a){ float c=cos(a), s=sin(a); return v*c + cross(k,v)*s + k*dot(k,v)*(1.0-c); }
void main(){
  vec3 axis = normalize(vec3(aSeed.x*0.7 - 0.35, 1.0, aSeed.y*0.7 - 0.35));
  float ang = uOrbit*(0.55 + aSeed.z*0.9) + aSeed.w*6.2831;
  vec3 d = rotAxis(aDir, axis, ang);
  float wob = sin(uTime*0.37 + aSeed.x*31.0)*0.05 + sin(uTime*0.23 + aSeed.y*17.0)*0.04;
  float r = aRadius + wob;
  r = mix(r, 1.1 + (aRadius - 1.0)*0.32, uGather);
  r += uGather * uLevel * 0.55 * (0.5 + 0.5*sin(aSeed.x*6.2831 + uTime*4.0));
  r += uAmp * 0.42 * (0.45 + 0.55*sin(aRadius*8.0 - uTime*6.5));
  r += uSwirl * 0.14 * sin(uOrbit*1.7 + aSeed.x*12.0);
  r = mix(r, r*0.9, uError);
  vec3 pos = d * r;
  pos.y *= mix(1.0, 0.5, uSwirl*0.65);
  float layers = 7.0;
  float qy = floor(pos.y*layers/2.4 + 0.5) * 2.4/layers;
  pos.y = mix(pos.y, qy, uVision*0.85);
  float onRing = step(aSeed.x, 0.58) * uExec;
  float ea = uFlow*(0.75 + aSeed.z*0.6) + aSeed.w*6.2831;
  float ri = floor(aSeed.y*3.0);
  vec3 lp = vec3(cos(ea), sin(ea), 0.0);
  vec3 rp = ri < 0.5 ? uRM0*(lp*uRR.x) : (ri < 1.5 ? uRM1*(lp*uRR.y) : uRM2*(lp*uRR.z));
  rp += aDir*0.022;
  pos = mix(pos, rp, onRing);
  float u = fract(ea/6.2831);
  float done = step(u, uProgress) * onRing;
  float scanG = exp(-abs(pos.y - uScanY*1.4)*9.0) * uVision;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vec4 cmv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec4 cp = projectionMatrix * mv;
  vec2 dd = (cp.xy/cp.w - uPtr) * vec2(uAspect, 1.0);
  float pd = length(dd);
  float pf = exp(-(pd*pd)/(uPtrR*uPtrR)) * uPtrOn;
  mv.xy += (dd/(pd + 1e-4)) * pf * uPush * uScale * (0.6 + aSeed.z*0.8);
  float behind = step(mv.z, cmv.z) * (1.0 - smoothstep(0.85, 1.1, length(pos.xy)));
  vec3 c = mix(uP1, uP2, aSeed.y);
  c = mix(c, uC3, done*0.7 + pf*0.6);
  float bright = 1.0 + scanG*1.4 + done*0.7 - onRing*(1.0 - done)*0.35 + pf*1.5;
  vColor = c * bright;
  vAlpha = (0.22 + 0.62*aSeed.y) * mix(1.0, 0.22, behind) * (1.0 - smoothstep(1.9, 2.7, length(pos))*0.6) * (1.0 - uError*0.35) * (1.0 + pf*0.9);
  gl_PointSize = max(1.0, uSize*(0.45 + aSeed.z*1.15)*uPR*uScale*(12.0 / -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const POINT_FRAG = /* glsl */`
varying vec3 vColor; varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d); a *= a;
  gl_FragColor = vec4(vColor, a*vAlpha);
}`;

const RING_VERT = /* glsl */`
varying vec2 vUv; varying float vBack;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec4 cmv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vBack = smoothstep(0.0, -0.6, mv.z - cmv.z);
  gl_Position = projectionMatrix * mv;
}`;

const RING_FRAG = /* glsl */`
uniform float uPhase, uDash, uComet, uExec, uProgress, uError, uTicks, uTickDone, uIdx, uOffset, uSeg, uAlphaR;
uniform vec3 uR1, uR2;
varying vec2 vUv; varying float vBack;
void main(){
  float u = vUv.x;
  float dir = mod(uIdx, 2.0) < 0.5 ? 1.0 : -1.0;
  float base = 0.16;
  float seg = step(fract(u*uSeg + uPhase*dir*0.6 + uOffset), 0.42) * uDash * 0.55;
  float head = fract(uPhase*0.11*dir + uOffset);
  float tail = fract((head - u)*dir);
  float comet = exp(-tail*14.0) * uComet;
  float isP = step(abs(uIdx - 1.0), 0.1);
  float fill = (1.0 - step(uProgress, u)) * uExec * isP;
  float tip = exp(-abs(u - uProgress)*160.0) * uExec * isP;
  float tk = 0.0;
  if (uTicks > 0.5) {
    float tu = u*uTicks; float fu = abs(fract(tu) - 0.5);
    float on = step(fu, 0.035) ;
    float doneT = step(floor(tu), uTickDone - 1.0);
    tk = on * (0.35 + doneT*1.1) * isP;
  }
  float gap = 1.0 - uError * step(0.58, u) * step(u, 0.74);
  float flick = 1.0 - uError * step(0.74, u) * step(u, 0.77) * 0.6;
  float I = (base + seg + comet*1.2 + fill*0.75 + tip*1.6 + tk) * gap * flick;
  vec3 col = mix(uR1, uR2, clamp(comet + fill + tip + tk*0.5, 0.0, 1.0));
  gl_FragColor = vec4(col, I * uAlphaR * mix(1.0, 0.3, vBack));
}`;

const SCAN_FRAG = /* glsl */`
uniform float uVision, uScanY, uTime; uniform vec3 uC3, uC2;
varying vec2 vUv;
void main(){
  vec2 p = (vUv - 0.5)*2.0;
  float r = length(p); float th = atan(p.y, p.x);
  float R = 2.6;
  float fade = smoothstep(1.0, 0.45, r) * smoothstep(0.32, 0.5, r);
  float rr = r*R*4.0; float g1 = 1.0 - smoothstep(0.0, fwidth(rr)*1.2, abs(fract(rr + 0.5) - 0.5));
  float sp = th*24.0/6.2831; float g2 = 1.0 - smoothstep(0.0, fwidth(sp)*1.2, abs(fract(sp + 0.5) - 0.5));
  float rc = sqrt(max(0.0, 1.0 - uScanY*uScanY)) / R;
  float edge = exp(-abs(r - rc)*140.0) * step(0.02, rc);
  float sw = fract(th/6.2831 - uTime*0.18);
  float sweep = smoothstep(0.82, 1.0, sw) * fade;
  float a = ((g1*0.5 + g2*0.22)*fade*0.32 + sweep*0.22 + edge*0.9) * uVision;
  gl_FragColor = vec4(mix(uC2, uC3, edge + sweep), a);
}`;

const BG_FRAG = /* glsl */`
uniform vec2 uRes, uCore; uniform float uCoreR, uTime, uEnergy;
uniform vec3 uBg, uBg2, uAmbC, uPoolA, uPoolB;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc/uRes;
  vec2 p = (fc - 0.5*uRes)/uRes.y;
  float t = uTime*0.022;
  vec3 col = mix(uBg2, uBg, smoothstep(0.0, 0.85, uv.y));
  vec2 q = vec2(fbm(p*1.1 + t), fbm(p*1.1 - t + 4.0));
  float n = fbm(p*1.5 + q*1.7 + vec2(t*0.6, -t));
  float pa = exp(-length((p - vec2(-0.66, 0.46))*vec2(0.8, 1.2))*2.1);
  float pb = exp(-length((p - vec2(0.74, -0.44))*vec2(0.85, 1.3))*2.3);
  vec2 cp = (uCore - 0.5*uRes)/uRes.y; float cr = max(uCoreR/uRes.y, 0.02);
  float halo = exp(-length(p - cp)/(cr*1.2));
  col += uPoolA * pa * (0.3 + 0.7*n) * 0.05;
  col += uPoolB * pb * (0.3 + 0.7*(1.0 - n)) * 0.035;
  col += uAmbC * halo * (0.018 + 0.04*uEnergy);
  float vig = smoothstep(1.4, 0.15, length(p*vec2(0.82, 1.0)));
  col *= mix(0.5, 1.0, vig);
  col += (hash(fc + fract(uTime)*91.0) - 0.5) * (0.4/255.0);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

const DUST_VERT = /* glsl */`
uniform float uTime, uPR; attribute float aSeed;
varying vec3 vColor; varying float vAlpha;
uniform vec3 uDustC;
void main(){
  vec3 p = position;
  p.y += sin(uTime*0.04 + aSeed*40.0)*0.35;
  p.x += cos(uTime*0.03 + aSeed*23.0)*0.25;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float depth = -mv.z;
  float nr = smoothstep(7.0, 3.0, depth);
  float tw = 0.55 + 0.45*sin(uTime*(0.3 + aSeed*0.6) + aSeed*90.0);
  vColor = uDustC;
  vAlpha = mix((0.10 + 0.32*aSeed)*tw, 0.045, nr);
  gl_PointSize = uPR * mix((0.8 + aSeed*1.6)*14.0/depth, 70.0/depth, nr);
  gl_Position = projectionMatrix * mv;
}`;

const RINGS = [
  { R: 1.42, tube: .0052, rot: [1.18, 0, .32], seg: 46, off: 0 },
  { R: 1.76, tube: .0046, rot: [-1.02, .42, -.2], seg: 64, off: .33 },
  { R: 2.14, tube: .0036, rot: [1.5, -.08, .06], seg: 90, off: .66 },
];
const SCALAR_KEYS = ['energy', 'disp', 'freq', 'swirl', 'gather', 'vision', 'exec', 'error', 'dash', 'comet', 'ringSpeed', 'orbit', 'heart', 'lines', 'contour', 'shell', 'listenRip', 'speakRip'];
const COLOR_KEYS = ['c1', 'c2', 'c3', 'heart', 'p1', 'p2', 'r1', 'r2', 'amb'];
export const EXTENT = 2.7;

export class AuraCore3D {
  static supported() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2')); } catch { return false; }
  }

  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = { quality: 'auto', particles: 6500, dust: 900, background: true, ...opts };
    this.mq = matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced = this.mq.matches;
    this.listeners = new Set();
    this.state = 'idle';
    this.level = 0; this.amp = 0; this.progress = 0; this.impulse = 0;
    this.frame = { x: 0, y: 0, s: 1 }; this.frameT = null;
    this.mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    this.hover = 0; this.hoverT = 0;
    this.ptr = { px: -1e4, py: -1e4, on: 0, onT: 0, prox: 0 };
    this.spin = { yaw: 0, pitch: 0, vy: 0, last: 0, dragging: false };
    this.press = 0; this.pressT = 0;
    this._q = new THREE.Quaternion(); this._v = new THREE.Vector3();
    this.fps = 60; this._fpsAcc = []; this.quality = this.opts.quality === 'low' ? 'low' : 'high';
    this.phases = { orbit: 0, ring: 0, rip: 0, flow: 0, time: 0 };

    const T = readTokens();
    this.T = T;
    const { S, P } = buildStates(T);
    this.S = S; this.P = P;
    this.cur = { ...S.idle }; this.tgt = { ...S.idle };
    this.cc = {}; this.ct = {};
    for (const c of COLOR_KEYS) { this.cc[c] = P.idle[c].clone(); this.ct[c] = P.idle[c].clone(); }

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
    r.toneMapping = THREE.NoToneMapping;
    r.setClearColor(T.bg, 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
    this.camera.position.set(0, 0, 12);
    this.camera.updateMatrixWorld();

    const U = this.U = {
      uTime: { value: 0 }, uEnergy: { value: .35 }, uDisp: { value: .05 }, uFreq: { value: 1.3 }, uSwirl: { value: 0 },
      uGather: { value: 0 }, uVision: { value: 0 }, uExec: { value: 0 }, uError: { value: 0 }, uProgress: { value: 0 },
      uLevel: { value: 0 }, uAmp: { value: 0 }, uScanY: { value: 0 }, uDash: { value: .25 }, uComet: { value: .6 },
      uPhase: { value: 0 }, uOrbit: { value: 0 }, uFlow: { value: 0 }, uRip: { value: 0 }, uTicks: { value: 0 }, uTickDone: { value: 0 },
      uHeart: { value: .8 }, uLines: { value: .7 }, uContour: { value: 4 }, uShell: { value: 1 }, uBreath: { value: 0 },
      uListenRip: { value: 0 }, uSpeakRip: { value: 0 }, uImpulse: { value: 0 },
      uPR: { value: 1 }, uScale: { value: 1 }, uSize: { value: 2.3 },
      uPtr: { value: new THREE.Vector2(9, 9) }, uPtrOn: { value: 0 }, uPtrR: { value: .2 }, uAspect: { value: 1 }, uPush: { value: .3 },
      uTouch: { value: 0 }, uTouchDir: { value: new THREE.Vector3(0, 0, 1) },
      uC1: { value: this.cc.c1 }, uC2: { value: this.cc.c2 }, uC3: { value: this.cc.c3 }, uHeartC: { value: this.cc.heart },
      uP1: { value: this.cc.p1 }, uP2: { value: this.cc.p2 }, uR1: { value: this.cc.r1 }, uR2: { value: this.cc.r2 },
      uAmbC: { value: this.cc.amb }, uRipC: { value: this.cc.c3 },
      uRM0: { value: new THREE.Matrix3() }, uRM1: { value: new THREE.Matrix3() }, uRM2: { value: new THREE.Matrix3() },
      uRR: { value: new THREE.Vector3(RINGS[0].R, RINGS[1].R, RINGS[2].R) },
      uRes: { value: new THREE.Vector2(1, 1) }, uCore: { value: new THREE.Vector2(0, 0) }, uCoreR: { value: 100 },
    };
    const add = { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false };
    this.disposables = [];
    const mat = (o) => { const m = new THREE.ShaderMaterial(o); this.disposables.push(m); return m; };
    const geo = (g) => { this.disposables.push(g); return g; };

    if (this.opts.background) {
      const bg = new THREE.Mesh(geo(new THREE.PlaneGeometry(2, 2)), mat({
        vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.9999, 1.0); }',
        fragmentShader: BG_FRAG, depthTest: false, depthWrite: false,
        uniforms: { ...U, uBg: { value: T.bg }, uBg2: { value: T['bg-2'] }, uPoolA: { value: T.aurora }, uPoolB: { value: T.violet } },
      }));
      bg.frustumCulled = false; bg.renderOrder = -10; this.scene.add(bg);

      const nd = this.opts.dust, dp = new Float32Array(nd * 3), ds = new Float32Array(nd);
      for (let i = 0; i < nd; i++) {
        dp[i * 3] = (Math.random() - .5) * 34; dp[i * 3 + 1] = (Math.random() - .5) * 20; dp[i * 3 + 2] = -26 + Math.random() * 33; ds[i] = Math.random();
      }
      const dg = geo(new THREE.BufferGeometry());
      dg.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dg.setAttribute('aSeed', new THREE.BufferAttribute(ds, 1));
      this.dust = new THREE.Points(dg, mat({ vertexShader: DUST_VERT, fragmentShader: POINT_FRAG, ...add, uniforms: { ...U, uDustC: { value: T.soft } } }));
      this.dust.frustumCulled = false; this.scene.add(this.dust);
    }

    const core = this.core = new THREE.Group();
    this.scene.add(core);
    this.halo = new THREE.Mesh(geo(new THREE.PlaneGeometry(7, 7)), mat({ vertexShader: BILLBOARD_VERT, fragmentShader: HALO_FRAG, ...add, uniforms: U }));
    this.halo.frustumCulled = false; core.add(this.halo);
    this.heart = new THREE.Mesh(geo(new THREE.PlaneGeometry(1.7, 1.7)), mat({ vertexShader: BILLBOARD_VERT, fragmentShader: HEART_FRAG, ...add, uniforms: U }));
    this.heart.frustumCulled = false; core.add(this.heart);
    this.shell = new THREE.Mesh(geo(new THREE.IcosahedronGeometry(1, this.quality === 'low' ? 24 : 44)), mat({ vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG, ...add, uniforms: U }));
    core.add(this.shell);

    this.rings = RINGS.map((c, i) => {
      const m = new THREE.Mesh(geo(new THREE.TorusGeometry(c.R, c.tube, 6, 420)), mat({
        vertexShader: RING_VERT, fragmentShader: RING_FRAG, ...add,
        uniforms: { ...U, uIdx: { value: i }, uOffset: { value: c.off }, uSeg: { value: c.seg }, uAlphaR: { value: i === 2 ? .7 : 1 } },
      }));
      m.rotation.set(...c.rot); m.userData.base = c.rot; core.add(m); return m;
    });

    const scan = this.scan = new THREE.Mesh(geo(new THREE.CircleGeometry(2.6, 128)), mat({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: SCAN_FRAG, ...add, side: THREE.DoubleSide, uniforms: U }));
    scan.rotation.x = -Math.PI / 2 + .18; core.add(scan);

    const n = this.opts.particles;
    const dir = new Float32Array(n * 3), seed = new Float32Array(n * 4), rad = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      dir.set([s * Math.cos(th), u, s * Math.sin(th)], i * 3);
      seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
      const q = Math.random();
      rad[i] = 1.12 + Math.pow(q, 2.2) * 1.35 + (Math.random() < .12 ? Math.random() * .35 : 0);
    }
    const pg = this.pgeo = geo(new THREE.BufferGeometry());
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    pg.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    pg.setAttribute('aRadius', new THREE.BufferAttribute(rad, 1));
    this.points = new THREE.Points(pg, mat({ vertexShader: PARTICLE_VERT, fragmentShader: POINT_FRAG, ...add, uniforms: U }));
    this.points.frustumCulled = false; core.add(this.points);

    this._setupComposer();
    this._onMove = (e) => {
      this.mouse.tx = (e.clientX / innerWidth) * 2 - 1; this.mouse.ty = (e.clientY / innerHeight) * 2 - 1;
      const b = canvas.getBoundingClientRect();
      this.ptr.px = e.clientX - b.left; this.ptr.py = e.clientY - b.top; this.ptr.onT = 1;
    };
    this._onOut = (e) => { if (!e.relatedTarget) this.ptr.onT = 0; };
    this._onMq = () => { this.reduced = this.mq.matches; };
    this._onLost = (e) => { e.preventDefault(); this.lost = true; this.listeners.forEach((f) => f({ lost: true })); };
    addEventListener('pointermove', this._onMove, { passive: true });
    document.addEventListener('pointerout', this._onOut);
    this.mq.addEventListener('change', this._onMq);
    canvas.addEventListener('webglcontextlost', this._onLost);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas);
    this.resize();
    this.clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
    this.raf = requestAnimationFrame(this._loop);
  }

  _setupComposer() {
    const r = this.renderer;
    this.dpr = Math.min(devicePixelRatio || 1, this.quality === 'low' ? 1 : 2);
    r.setPixelRatio(this.dpr);
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: this.quality === 'low' ? 0 : 4 });
    this.bloom?.dispose();
    this.composer?.dispose();
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality !== 'low') {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .62, .55, .14);
      this.composer.addPass(this.bloom);
    } else this.bloom = null;
    this.composer.addPass(new OutputPass());
    this.pgeo?.setDrawRange(0, this.quality === 'low' ? Math.min(2400, this.opts.particles) : this.opts.particles);
    this.U.uPR.value = this.dpr;
  }

  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.dpr); this.composer.setSize(w, h);
    if (this.bloom) this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.ppu = (h / 2) / (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.z);
    this.U.uRes.value.set(w * this.dpr, h * this.dpr);
    if (!this.frameT) this.setFrame({ cx: w / 2, cy: h / 2, r: Math.min(w, h) * .36 }, true);
    else this.setFrame(this.frameReq, true);
  }

  /** Place the core: center (cx, cy) and visual radius r, in CSS px relative to the canvas. */
  setFrame(f, snap = false) {
    this.frameReq = f;
    if (!this.ppu) return;
    const t = { x: (f.cx - this.w / 2) / this.ppu, y: -(f.cy - this.h / 2) / this.ppu, s: f.r / (EXTENT * this.ppu) };
    this.frameT = t;
    if (snap) Object.assign(this.frame, t);
  }

  setState(name, opts = {}) {
    if (!this.S[name]) return;
    this.state = name;
    Object.assign(this.tgt, this.S[name]);
    for (const c of COLOR_KEYS) this.ct[c].copy(this.P[name][c]);
    if (name !== 'executing' && !opts.keepProgress) this.progress = 0;
    if (name !== 'thinking' && !opts.keepTicks) this.setTicks(0, 0);
    if (opts.ticks != null) this.setTicks(opts.ticks, opts.done || 0);
  }
  setLevel(v) { this.level = Math.max(0, Math.min(1, v)); }
  setAmplitude(v) { this.amp = Math.max(0, Math.min(1, v)); }
  setProgress(p) { this.progress = Math.max(0, Math.min(1, p)); }
  setTicks(n, done) { this.U.uTicks.value = n; this.U.uTickDone.value = done; }
  setHover(on) { this.hoverT = on ? 1 : 0; }
  pulse() { this.impulse = 1; }
  /** Pointer held on the core: compresses it and pauses spin inertia. */
  setPressed(on) {
    this.pressT = on ? 1 : 0;
    this.spin.dragging = on;
    if (on) { this.spin.vy = 0; this.spin.last = performance.now(); }
  }
  /** Drag delta in CSS px while pressed: yaw follows x with inertia, pitch follows y and springs back. */
  drag(dx, dy) {
    const s = this.spin, now = performance.now(), dt = Math.max((now - s.last) / 1000, .008);
    s.last = now;
    s.yaw += dx * .007;
    s.pitch = Math.max(-.6, Math.min(.6, s.pitch + dy * .005));
    s.vy = s.vy * .5 + (dx * .007 / dt) * .5;
  }
  setQuality(q) {
    this.opts.quality = q;
    const next = q === 'low' ? 'low' : 'high';
    if (next !== this.quality) { this.quality = next; this._setupComposer(); this.resize(); }
  }
  /** Cap the render loop. 0 follows the display refresh rate. */
  setFps(fps) {
    this.opts.fps = fps > 0 ? fps : 0;
    this._lastT = 0;
  }
  compile() { const t = performance.now(); this.renderer.compile(this.scene, this.camera); return performance.now() - t; }
  onFrame(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Screen position of a point on ring i at fraction u (0..1). */
  ringPoint(i, u) {
    const ring = this.rings[i], R = RINGS[i].R, a = u * Math.PI * 2;
    const v = new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0);
    ring.localToWorld(v);
    const front = v.clone().applyMatrix4(this.camera.matrixWorldInverse).z > this.core.position.clone().applyMatrix4(this.camera.matrixWorldInverse).z;
    v.project(this.camera);
    return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h, front };
  }
  center() {
    const v = this.core.position.clone().project(this.camera);
    return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h, r: this.frame.s * EXTENT * this.ppu };
  }

  _loop(now) {
    this.raf = requestAnimationFrame(this._loop);
    if (this.lost) return;
    if (this.opts.fps) {
      if (now - (this._lastT || 0) < 1000 / this.opts.fps - 2) return;
      this._lastT = now;
    }
    const delta = this.clock.getDelta();
    const rawDt = Math.min(delta, .1);
    const ts = this.reduced ? .12 : 1;
    const dt = rawDt * ts;
    this._trackFps(delta);

    const ease = (tau) => 1 - Math.exp(-rawDt / tau);
    const a = ease(.3), af = ease(.07);
    for (const key of SCALAR_KEYS) this.cur[key] += (this.tgt[key] - this.cur[key]) * a;
    for (const c of COLOR_KEYS) this.cc[c].lerp(this.ct[c], a);
    this._lv = (this._lv || 0) + (this.level - (this._lv || 0)) * af;
    this._am = (this._am || 0) + (this.amp - (this._am || 0)) * af;
    this._pg = (this._pg || 0) + (this.progress - (this._pg || 0)) * ease(.25);
    this.hover += (this.hoverT - this.hover) * ease(.2);
    this.impulse *= Math.exp(-rawDt / .55);

    // pointer field, press and drag-spin (CSS px relative to the canvas)
    const pt = this.ptr, sp = this.spin, pm0 = this.reduced ? .35 : 1;
    const shellPx = Math.max(1, this.frame.s * this.ppu);
    const pdx = pt.px - (this.w / 2 + this.frame.x * this.ppu), pdy = pt.py - (this.h / 2 - this.frame.y * this.ppu);
    pt.on += (pt.onT - pt.on) * ease(.25);
    pt.prox += (pt.onT * (1 - smooth(shellPx * .9, shellPx * 2.6, Math.hypot(pdx, pdy))) - pt.prox) * ease(.28);
    this.press += (this.pressT - this.press) * ease(.09);
    if (!sp.dragging) {
      sp.yaw += sp.vy * rawDt;
      sp.vy *= Math.exp(-rawDt / (this.reduced ? .2 : 1.1));
      sp.pitch *= Math.exp(-rawDt / .8);
    }
    const spinE = Math.min(1, Math.abs(sp.vy) / 5);

    const c = this.cur, P = this.phases, U = this.U;
    P.time += dt;
    P.orbit += dt * c.orbit * (1 + this.hover * .6 + pt.prox * .9 + spinE * 2.5);
    P.ring += dt * c.ringSpeed * 6 * (1 + pt.prox * .8 + spinE * 1.5);
    P.rip += dt * .55;
    P.flow += dt * (.45 + c.exec * .5);

    U.uTime.value = P.time; U.uOrbit.value = P.orbit; U.uPhase.value = P.ring; U.uRip.value = P.rip; U.uFlow.value = P.flow;
    U.uEnergy.value = c.energy + this.hover * .12 + this._lv * c.gather * .6 + this._am * .5 + this.impulse * .3
      + pt.prox * .16 + spinE * .22 + this.press * .18;
    U.uDisp.value = c.disp + this._lv * c.gather * .38 + this._am * .1;
    U.uFreq.value = c.freq; U.uSwirl.value = c.swirl; U.uGather.value = c.gather; U.uVision.value = c.vision;
    U.uExec.value = c.exec; U.uError.value = c.error; U.uDash.value = c.dash; U.uComet.value = c.comet;
    U.uHeart.value = c.heart + this.hover * .15 + pt.prox * .12 + this.press * .25; U.uLines.value = c.lines; U.uContour.value = c.contour; U.uShell.value = c.shell;
    U.uListenRip.value = c.listenRip; U.uSpeakRip.value = c.speakRip;
    U.uLevel.value = this._lv; U.uAmp.value = this._am; U.uProgress.value = this._pg; U.uImpulse.value = this.impulse;
    U.uScanY.value = Math.sin(P.time * .9) * .82;
    U.uBreath.value = this.reduced ? 0 : Math.sin(P.time * .75) * .012 * (1 - c.error);

    // placement + parallax
    if (this.frameT) {
      const fa = ease(.22);
      this.frame.x += (this.frameT.x - this.frame.x) * fa;
      this.frame.y += (this.frameT.y - this.frame.y) * fa;
      this.frame.s += (this.frameT.s - this.frame.s) * fa;
    }
    const m = this.mouse, ma = ease(.6);
    m.x += (m.tx - m.x) * ma; m.y += (m.ty - m.y) * ma;
    const pm = this.reduced ? 0 : 1;
    const lean = pm * pt.prox * .1 * (1 - this.press * .5);
    const tiltX = clamp1(pdy / shellPx, 1.5) * .12 * pt.prox * pm, tiltY = clamp1(pdx / shellPx, 1.5) * .16 * pt.prox * pm;
    this.core.position.set(this.frame.x + pdx / this.ppu * lean, this.frame.y - pdy / this.ppu * lean, 0);
    this.core.scale.setScalar(this.frame.s * (1 + this.impulse * .025 - this.press * .035));
    this.core.rotation.set(m.y * .1 * pm + tiltX + sp.pitch, m.x * .16 * pm + P.time * .02 + tiltY + sp.yaw, 0);
    if (this.dust) this.dust.position.set(-m.x * .5 * pm, m.y * .3 * pm, 0);
    U.uScale.value = this.frame.s;

    U.uPtr.value.set(pt.px / this.w * 2 - 1, 1 - pt.py / this.h * 2);
    U.uAspect.value = this.w / this.h;
    U.uPtrR.value = shellPx * .5 / (this.h / 2);
    U.uPtrOn.value = pt.on * pm0 * (1 + this.press * .8);
    const tx = clamp1(pdx / shellPx, 1.4), ty = clamp1(-pdy / shellPx, 1.4);
    this._q.copy(this.core.quaternion).invert();
    U.uTouchDir.value.set(tx, ty, Math.sqrt(Math.max(.12, 1 - tx * tx - ty * ty))).normalize().applyQuaternion(this._q);
    U.uTouch.value = pt.prox * pm0 * (.7 + this.press * .6);

    this.rings.forEach((ring, i) => {
      const b = ring.userData.base;
      ring.rotation.x = b[0] + Math.sin(P.time * .11 + i * 2) * .05 * pm;
      ring.rotation.y = b[1] + Math.cos(P.time * .09 + i) * .04 * pm;
      ring.updateMatrix();
      U['uRM' + i].value.setFromMatrix4(ring.matrix);
    });
    this.scan.position.y = U.uScanY.value;
    this.scan.visible = c.vision > .01;

    this.core.updateMatrixWorld();
    const ctr = this.center();
    U.uCore.value.set(ctr.x * this.dpr, (this.h - ctr.y) * this.dpr);
    U.uCoreR.value = ctr.r * this.dpr;
    if (this.bloom) this.bloom.strength = .5 + c.energy * .25;

    this.composer.render(rawDt);
    this.listeners.forEach((f) => f({ dt: rawDt }));
  }

  _trackFps(dt) {
    if (dt > .2 || document.hidden) { this._fpsAcc.length = 0; return; }
    this._fpsAcc.push(dt);
    if (this._fpsAcc.length >= 60) {
      const avg = this._fpsAcc.reduce((s, v) => s + v, 0) / this._fpsAcc.length;
      this._fpsAcc.length = 0;
      this.fps = Math.round(1 / avg);
      this._samples = (this._samples || 0) + 1;
      if (this.opts.quality === 'auto' && this.quality === 'high' && this._samples >= 2 && this.fps < (this.opts.fps ? this.opts.fps * .66 : 40) && !document.hidden) {
        this.quality = 'low'; this._setupComposer(); this.resize();
        this.listeners.forEach((f) => f({ quality: 'low' }));
      }
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    removeEventListener('pointermove', this._onMove);
    document.removeEventListener('pointerout', this._onOut);
    this.mq.removeEventListener('change', this._onMq);
    this.canvas.removeEventListener('webglcontextlost', this._onLost);
    this.ro.disconnect();
    this.listeners.clear();
    this.disposables.forEach((d) => d.dispose());
    this.composer.dispose();
    this.renderer.dispose();
  }
}
