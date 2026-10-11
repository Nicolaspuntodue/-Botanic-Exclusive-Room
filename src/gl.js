import {
  WebGLRenderer, Scene, PerspectiveCamera, Mesh, PlaneGeometry, ShaderMaterial,
  BufferGeometry, BufferAttribute, Points, AdditiveBlending,
  TextureLoader, Vector2, SRGBColorSpace,
} from 'three';

// Hero: living photo of the Ponte del Mare (water + palms animated by a mask) as a full-screen shader that, on scroll, folds into an
// arched "balcony window" while 3D light motes rush past the camera.

const screenVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const screenFrag = /* glsl */`
  precision highp float;
  uniform sampler2D uTex, uMask; // mask: R = water, G = palm fronds
  uniform vec2 uRes, uTexRes, uMouse, uSun;
  uniform float uProgress, uTime, uPortrait, uFocus;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
  // arch = rectangle with a semicircle on top; w = half width, h = full height
  float sdArch(vec2 p, float w, float h) {
    float body = sdBox(p - vec2(0.0, -w * 0.5), vec2(w, (h - w) * 0.5));
    float top = length(p - vec2(0.0, h * 0.5 - w)) - w;
    return min(body, top);
  }
  // cover-fit; when the screen is narrower than the photo, centre the crop on uFocus (the pylon)
  vec2 cover(vec2 uv, vec2 res, vec2 tex) {
    float rs = res.x / res.y, rt = tex.x / tex.y;
    vec2 s = rs > rt ? vec2(1.0, rt / rs) : vec2(rs / rt, 1.0);
    float cx = clamp(uFocus, s.x * 0.5, 1.0 - s.x * 0.5);
    return vec2((uv.x - 0.5) * s.x + cx, (uv.y - 0.5) * s.y + 0.5);
  }

  void main() {
    float m = smoothstep(0.12, 0.78, uProgress);
    float e = m * m * (3.0 - 2.0 * m);
    float aspect = uRes.x / uRes.y;

    // pixel position in "height units", origin at screen centre
    vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);

    // final window: left third on desktop, upper centre on portrait screens
    vec2 c1 = mix(vec2(-aspect * 0.2, -0.02), vec2(0.0, 0.15), uPortrait);
    float w1 = mix(0.22, min(aspect * 0.36, 0.2), uPortrait);
    float h1 = mix(0.78, 0.48, uPortrait);
    float grow = mix(5.0, 1.0, e);
    vec2 c = mix(vec2(0.0), c1, e);
    vec2 q = (p - c) / grow;

    float ang = atan(q.y, q.x);
    float d = sdArch(q, w1, h1) + sin(ang * 9.0 + uTime * 1.2) * 0.004 * m * (1.0 - m) * 4.0;
    float inside = 1.0 - smoothstep(-0.0015, 0.0015, d);

    // photo uv: slight zoom while the window closes + mouse parallax for depth
    vec2 uv = cover(vUv, uRes, uTexRes);
    uv = (uv - 0.5) / (1.0 + 0.12 * e) + 0.5;
    uv += uMouse * (0.012 + 0.02 * e);

    // living photo: ripples on the river/sea, palm fronds swaying in the breeze
    float t = uTime;
    vec2 mk = texture2D(uMask, uv).rg;
    vec2 disp = vec2(
      sin(uv.y * 140.0 + t * 1.6) * 0.6 + sin(uv.y * 230.0 - t * 2.1 + uv.x * 20.0) * 0.4,
      sin(uv.x * 90.0 + t * 1.2 + uv.y * 60.0) * 0.35
    ) * 0.0022 * mk.r;
    disp += mk.g * vec2(
      sin(t * 0.9 + uv.y * 4.0) * 0.006 + sin(t * 1.7 + uv.x * 9.0) * 0.002,
      cos(t * 0.7 + uv.x * 3.0) * 0.004
    );
    uv += disp;

    float wobble = m * (1.0 - m) * 4.0;
    // gentle fold wobble: a realistic photo reads as "glitch" if this is strong
    uv += wobble * 0.004 * vec2(sin(uv.y * 8.0 + uTime), cos(uv.x * 7.0 + uTime * 0.8));

    // tiny chromatic split during the fold
    float ca = wobble * 0.0012;
    vec3 col = vec3(
      texture2D(uTex, uv + vec2(ca, 0.0)).r,
      texture2D(uTex, uv).g,
      texture2D(uTex, uv - vec2(ca, 0.0)).b
    );
    // twinkling sun glints on the water + a breathing glow around the low sun
    float lum = dot(col, vec3(0.3, 0.59, 0.11));
    float glint = smoothstep(0.988, 1.0, hash(floor((uv + disp * 4.0) * vec2(420.0, 760.0)) + floor(t * 7.0)));
    col += vec3(1.0, 0.86, 0.6) * glint * mk.r * smoothstep(0.45, 0.85, lum) * 0.7;
    float rt = uTexRes.x / uTexRes.y;
    col += vec3(1.0, 0.78, 0.5) * (0.06 + 0.02 * sin(t * 0.7)) * smoothstep(0.35, 0.0, distance(uv * vec2(rt, 1.0), uSun * vec2(rt, 1.0)));

    // legibility gradient under the hero copy, fades as we fold
    float shade = smoothstep(0.75, 0.0, vUv.y) * 0.45 * (1.0 - e);
    col *= 1.0 - shade;
    col *= 1.0 - 0.25 * length(vUv - 0.5) * (1.0 - e); // vignette

    vec3 cream = vec3(0.933, 0.910, 0.867);
    vec3 outC = cream;
    // soft brass rim around the window
    float rim = (1.0 - smoothstep(0.0, 0.006, abs(d))) * e;
    outC = mix(outC, vec3(0.79, 0.65, 0.5), rim * 0.6);

    vec3 finalC = mix(outC, col, inside);
    finalC += (hash(vUv * uRes + uTime) - 0.5) * 0.035; // film grain
    gl_FragColor = vec4(finalC, 1.0);
  }
`;

const motesVert = /* glsl */`
  uniform float uTime, uPixel, uProgress;
  attribute float aSeed;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y += mod(uTime * (0.05 + aSeed * 0.08) + aSeed * 10.0, 6.0) - 3.0;
    p.x += sin(uTime * 0.4 + aSeed * 20.0) * 0.15;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (2.0 + aSeed * 5.0) * uPixel * (4.0 / -mv.z);
    vAlpha = smoothstep(-0.2, -1.5, mv.z) * (0.35 + 0.65 * aSeed);
  }
`;

const motesFrag = /* glsl */`
  uniform float uFade;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * a, a * vAlpha * uFade);
  }
`;

// Still photo brought to life: ripples + sun glints only where the mask says
// "water" (pool and sea), marble stays put. No video credits, ~300 KB total.
const waterFrag = /* glsl */`
  precision highp float;
  uniform sampler2D uTex, uMask;
  uniform vec2 uRes, uTexRes, uMouse, uSun;
  uniform float uTime;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    float rs = uRes.x / uRes.y, rt = uTexRes.x / uTexRes.y;
    vec2 s = rs > rt ? vec2(1.0, rt / rs) : vec2(rs / rt, 1.0);
    vec2 uv = (vUv - 0.5) * s * 0.96 + 0.5 + uMouse * 0.012;
    float t = uTime;
    float w = texture2D(uMask, uv).r;
    vec2 disp = vec2(
      sin(uv.y * 140.0 + t * 1.6) * 0.6 + sin(uv.y * 230.0 - t * 2.1 + uv.x * 20.0) * 0.4,
      sin(uv.x * 90.0 + t * 1.2 + uv.y * 60.0) * 0.35
    ) * 0.0022 * w;
    vec3 col = texture2D(uTex, uv + disp).rgb;
    float lum = dot(col, vec3(0.3, 0.59, 0.11));
    // random twinkling glints (a sin*sin pattern read as a dot grid)
    vec2 cell = floor((uv + disp * 4.0) * vec2(420.0, 760.0));
    float glint = smoothstep(0.988, 1.0, hash(cell + floor(t * 7.0)));
    col += vec3(1.0, 0.86, 0.6) * glint * w * smoothstep(0.45, 0.85, lum) * 0.7;
    float d = distance(uv * vec2(rt, 1.0), uSun * vec2(rt, 1.0));
    col += vec3(1.0, 0.78, 0.5) * (0.07 + 0.02 * sin(t * 0.7)) * smoothstep(0.35, 0.0, d);
    col += (hash(vUv * uRes + t) - 0.5) * 0.03;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function initWater(canvas, { src, mask, sun }) {
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  const uniforms = {
    uTex: { value: null }, uMask: { value: null },
    uRes: { value: new Vector2(1, 1) }, uTexRes: { value: new Vector2(16, 9) },
    uMouse: { value: new Vector2() }, uSun: { value: new Vector2(...sun) }, uTime: { value: 0 },
  };
  const mesh = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({ vertexShader: screenVert, fragmentShader: waterFrag, uniforms, depthTest: false }));
  mesh.frustumCulled = false;
  scene.add(mesh);

  const loader = new TextureLoader();
  const ready = Promise.all([src, mask].map((u) => loader.loadAsync(u))).then(([tex, m]) => {
    uniforms.uTex.value = tex;
    uniforms.uMask.value = m;
    uniforms.uTexRes.value.set(tex.image.width, tex.image.height);
  });

  const mouseT = new Vector2();
  window.addEventListener('pointermove', (e) => mouseT.set(e.clientX / innerWidth - 0.5, 0.5 - e.clientY / innerHeight), { passive: true });
  const resize = () => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    uniforms.uRes.value.set(canvas.clientWidth, canvas.clientHeight);
  };
  window.addEventListener('resize', resize);
  resize();

  let visible = false, raf = 0, last = 0;
  const frame = (now) => {
    raf = 0;
    if (!visible || document.hidden || !uniforms.uTex.value) return;
    uniforms.uTime.value += Math.min((now - last) / 1000, 0.05);
    last = now;
    uniforms.uMouse.value.lerp(mouseT, 0.05);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  const start = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) start(); }).observe(canvas);
  document.addEventListener('visibilitychange', start);
  ready.then(start);
  return { ready };
}

export function initHero(canvas, { src, mask, sun, focus, portrait }) {
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  const dpr = Math.min(window.devicePixelRatio || 1, portrait ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.1, 50);
  camera.position.z = 4;

  const uniforms = {
    uTex: { value: null },
    uMask: { value: null },
    uRes: { value: new Vector2(1, 1) },
    uTexRes: { value: new Vector2(16, 9) },
    uMouse: { value: new Vector2() },
    uSun: { value: new Vector2(...sun) },
    uFocus: { value: focus },
    uProgress: { value: 0 },
    uTime: { value: 0 },
    uPortrait: { value: portrait ? 1 : 0 },
  };
  const screen = new Mesh(
    new PlaneGeometry(2, 2),
    new ShaderMaterial({ vertexShader: screenVert, fragmentShader: screenFrag, uniforms, depthTest: false, depthWrite: false }),
  );
  screen.frustumCulled = false;
  screen.renderOrder = -1;
  scene.add(screen);

  // 3D light motes ("pollen in the sun")
  const count = portrait ? 160 : 380;
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 8;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 6;
    pos[i * 3 + 2] = Math.random() * -10 + 2;
    seed[i] = Math.random();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new BufferAttribute(seed, 1));
  const motesU = { uTime: uniforms.uTime, uPixel: { value: dpr }, uProgress: uniforms.uProgress, uFade: { value: 1 } };
  const motes = new Points(g, new ShaderMaterial({
    vertexShader: motesVert, fragmentShader: motesFrag, uniforms: motesU,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  }));
  scene.add(motes);

  // still photo + mask (no video): `ready` once both are loaded and a frame has been drawn,
  // so the canvas is never shown black. If loading fails, `ready` never resolves and the <img> stays.
  const loader = new TextureLoader();
  const ready = Promise.all([loader.loadAsync(src), loader.loadAsync(mask)]).then(([tex, m]) => {
    uniforms.uTex.value = tex;
    uniforms.uMask.value = m;
    uniforms.uTexRes.value.set(tex.image.width, tex.image.height);
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });

  const mouse = new Vector2(), mouseT = new Vector2();
  window.addEventListener('pointermove', (e) => {
    mouseT.set(e.clientX / innerWidth - 0.5, 0.5 - e.clientY / innerHeight);
  }, { passive: true });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    uniforms.uRes.value.set(w, h);
    uniforms.uPortrait.value = w / h < 0.9 ? 1 : 0; // arch layout follows rotation/resizes
  }
  window.addEventListener('resize', resize);
  resize();

  let visible = true, raf = 0, last = performance.now();
  function frame(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    uniforms.uTime.value += dt;
    mouse.lerp(mouseT, 0.06);
    uniforms.uMouse.value.copy(mouse);
    const p = uniforms.uProgress.value;
    camera.position.z = 4 - p * 5;           // fly through the motes
    camera.rotation.y = -mouse.x * 0.12;
    camera.rotation.x = mouse.y * 0.08;
    motesU.uFade.value = 1 - Math.min(p / 0.55, 1);
    motes.visible = motesU.uFade.value > 0.01;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  const start = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible) start();
  }).observe(canvas);
  document.addEventListener('visibilitychange', start);
  start();

  return {
    ready,
    setProgress(p) { uniforms.uProgress.value = p; },
  };
}
