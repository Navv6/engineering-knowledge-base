// 시각화 모듈. 3D는 three.js(ES module, 필요할 때만 동적 로드), 2D는 SVG/Canvas.
// 모든 시각화는 본문 없이도 이해 가능하도록 보조 역할이며, 실패 시 대체 문구를 표시한다.
import { BTree, irMetrics, cosine, rng, normalSampler, tQuantile, zQuantile, prerequisiteDepth } from './core.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};
const fmt = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—');

const themeListeners = new Set();
export function onThemeChange(cb) { themeListeners.add(cb); return () => themeListeners.delete(cb); }
if (typeof window !== 'undefined') {
  const fire = () => themeListeners.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', fire);
  new MutationObserver(fire).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

/* ================= three.js 공통 ================= */
let threePromise = null;
export function loadThree() {
  threePromise ||= Promise.all([
    import('three'),
    import('three/addons/controls/OrbitControls.js'),
    import('three/addons/renderers/CSS2DRenderer.js'),
  ]).then(([THREE, oc, l2]) => ({ THREE, OrbitControls: oc.OrbitControls, CSS2DRenderer: l2.CSS2DRenderer, CSS2DObject: l2.CSS2DObject }));
  return threePromise;
}

async function create3D(host, { height = 380, cam = [6, -8, 6], target = [0, 0, 0], up = [0, 0, 1], fov = 45 } = {}) {
  const { THREE, OrbitControls, CSS2DRenderer, CSS2DObject } = await loadThree();
  const stage = h('div', { class: 'stage3d', style: `height:${height}px` });
  host.append(stage);
  const renderer = new THREE.WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 2, alpha: true, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  if (!renderer.getContext()) throw new Error('WebGL 사용 불가');
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  stage.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const labels = new CSS2DRenderer();
  labels.domElement.className = 'labels3d';
  stage.append(labels.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 500);
  camera.up.set(...up);
  camera.position.set(...cam);
  const controls = new OrbitControls(camera, labels.domElement);
  controls.target.set(...target);
  controls.enableDamping = !reducedMotion();
  controls.dampingFactor = 0.12;
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 1.4);
  dl.position.set(5, -4, 10);
  scene.add(dl);
  let raf = 0, alive = true, loop = null, visible = true, lastFrame = 0;
  const render = () => { renderer.render(scene, camera); labels.render(scene, camera); };
  const tick = (now) => {
    raf = 0;
    if (!alive) return;
    if (!stage.isConnected) { controls.autoRotate = false; return; }
    if (!visible || document.hidden) return; // 화면 밖·백그라운드 탭에서는 멈춤(다시 보이면 kick)
    // 자동 회전만 진행 중이면 약 30fps로 제한(배터리·CPU 절약)
    if (controls.autoRotate && !controls._dragging && now - lastFrame < 33) { raf = requestAnimationFrame(tick); return; }
    lastFrame = now;
    const moving = controls.update();
    const more = loop ? loop() : false;
    render();
    if (moving || more || controls.autoRotate) raf = requestAnimationFrame(tick);
  };
  const kick = () => { if (!raf && alive) raf = requestAnimationFrame(tick); };
  const io = new IntersectionObserver((ents) => { visible = ents[0]?.isIntersecting ?? true; if (visible) kick(); });
  io.observe(stage);
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener('visibilitychange', onVis);
  controls.addEventListener('start', () => { controls._dragging = true; });
  controls.addEventListener('end', () => { controls._dragging = false; });
  controls.addEventListener('change', kick);
  const resize = () => {
    const w = stage.clientWidth || 600, hh = stage.clientHeight || height;
    renderer.setSize(w, hh, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    labels.setSize(w, hh);
    camera.aspect = w / hh; camera.updateProjectionMatrix();
    kick();
  };
  const ro = new ResizeObserver(resize); ro.observe(stage); resize();
  const label = (text, cls = '') => { const d = h('div', { class: `lbl ${cls}`, text }); return new CSS2DObject(d); };
  const color = (v) => new THREE.Color(css(v));
  return {
    THREE, scene, camera, renderer, controls, stage, render, kick, label, color, CSS2DObject,
    setLoop(f) { loop = f; kick(); },
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); controls.dispose();
      scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : [m]).forEach((x) => x?.dispose?.()); });
      renderer.dispose(); renderer.forceContextLoss?.(); stage.remove();
    },
  };
}

function makeArrow(T, colorVar, radius = 0.045) {
  const { THREE } = T;
  const mat = new THREE.MeshStandardMaterial({ color: T.color(colorVar), roughness: 0.5 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 16), mat);
  const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 3, radius * 7, 20), mat);
  const g = new THREE.Group(); g.add(shaft, head);
  g.userData = { mat, colorVar };
  g.set = (from, to) => {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    g.visible = len > 1e-6;
    if (!g.visible) return;
    const headLen = Math.min(radius * 7, len * 0.4);
    shaft.scale.set(1, Math.max(1e-3, len - headLen), 1);
    shaft.position.set(0, (len - headLen) / 2, 0);
    head.scale.setScalar(headLen / (radius * 7));
    head.position.set(0, len - headLen / 2, 0);
    g.position.copy(from);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  };
  return g;
}

function vizError(host, err) {
  console.warn('[ekb viz]', err);
  host.append(h('p', { class: 'viz-fallback', role: 'note', text: `3D 시각화를 불러오지 못했습니다(${err?.message || err}). WebGL을 지원하는 브라우저에서 다시 열거나, 본문 설명과 표를 참고하세요.` }));
}

/* ================= 1) Big-O 증가 곡선 (SVG) ================= */
const CLASSES = [
  { key: '1', label: 'O(1)', f: () => 1, c: '--c1' },
  { key: 'log', label: 'O(log n)', f: (n) => Math.log2(Math.max(n, 1)), c: '--c2' },
  { key: 'n', label: 'O(n)', f: (n) => n, c: '--c3' },
  { key: 'nlog', label: 'O(n log n)', f: (n) => n * Math.log2(Math.max(n, 1)), c: '--c4' },
  { key: 'n2', label: 'O(n²)', f: (n) => n * n, c: '--c5' },
  { key: '2n', label: 'O(2ⁿ)', f: (n) => 2 ** n, c: '--c6' },
];
function humanTime(sec) {
  if (!Number.isFinite(sec) || sec > 4.35e17) return '우주의 나이(약 138억 년) 초과';
  const units = [[1e-6, 1e9, 'ns'], [1e-3, 1e6, 'μs'], [1, 1e3, 'ms'], [60, 1, '초'], [3600, 1 / 60, '분'], [86400, 1 / 3600, '시간'], [3.156e7, 1 / 86400, '일']];
  for (const [lim, mul, u] of units) if (sec < lim) return `${(sec * mul).toPrecision(3)} ${u}`;
  return `${(sec / 3.156e7).toPrecision(3)} 년`;
}
function mountBigO(host) {
  const W = 640, H = 300, P = { l: 52, r: 16, t: 14, b: 34 };
  let N = 32, logY = false;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'chart'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '복잡도 클래스별 연산 횟수 증가 곡선');
  const nIn = h('input', { type: 'range', min: '4', max: '100', value: String(N), id: 'bigo-n', 'aria-label': '최대 n' });
  const nOut = h('output', { for: 'bigo-n', text: N });
  const logIn = h('input', { type: 'checkbox', id: 'bigo-log' });
  const sizeSel = h('select', { id: 'bigo-size', 'aria-label': '표의 입력 크기' }, ...[10, 100, 1000, 1e4, 1e6, 1e9].map((v) => h('option', { value: String(v), selected: v === 1e6 ? '' : false, text: `n = ${v.toLocaleString('ko-KR')}` })));
  const table = h('table', { class: 'mini' });
  const legend = h('div', { class: 'legend' }, CLASSES.map((c) => h('span', { class: 'key' }, h('i', { style: `background:var(${c.c})` }), c.label)));
  const draw = () => {
    const xs = (n) => P.l + ((n - 1) / (N - 1)) * (W - P.l - P.r);
    const yMax = logY ? Math.min(2 ** N, 1e30) : N * N;
    const ys = (v) => {
      const t = logY ? Math.log10(Math.max(v, 1)) / Math.log10(yMax) : v / yMax;
      return H - P.b - Math.min(1.02, t) * (H - P.t - P.b);
    };
    let g = '';
    const ticks = logY ? [1, 1e2, 1e4, 1e6, 1e9, 1e12, 1e15, 1e20, 1e25, 1e30].filter((v) => v <= yMax) : [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * yMax));
    for (const v of ticks) {
      const y = ys(v);
      g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}" class="grid"/><text x="${P.l - 6}" y="${y + 4}" text-anchor="end" class="tick">${logY ? (v >= 1e3 ? `1e${Math.round(Math.log10(v))}` : v) : v.toLocaleString('ko-KR')}</text>`;
    }
    for (const n of [1, Math.round(N / 4), Math.round(N / 2), Math.round((3 * N) / 4), N]) g += `<text x="${xs(n)}" y="${H - P.b + 18}" text-anchor="middle" class="tick">${n}</text>`;
    g += `<text x="${W - P.r}" y="${H - 4}" text-anchor="end" class="axis-label">입력 크기 n</text>`;
    g += `<text x="${P.l}" y="${P.t - 2}" class="axis-label">연산 횟수${logY ? ' (로그 축)' : ''}</text>`;
    g += `<defs><clipPath id="bigo-clip"><rect x="${P.l}" y="${P.t - 4}" width="${W - P.l - P.r}" height="${H - P.t - P.b + 4}"/></clipPath></defs><g clip-path="url(#bigo-clip)">`;
    for (const c of CLASSES) {
      let d = '';
      for (let i = 0; i <= 120; i++) { const n = 1 + ((N - 1) * i) / 120; d += `${i ? 'L' : 'M'}${xs(n).toFixed(1)},${ys(c.f(n)).toFixed(1)}`; }
      g += `<path d="${d}" fill="none" stroke="var(${c.c})" stroke-width="2.4"/>`;
    }
    g += '</g>';
    svg.innerHTML = g;
    const n = Number(sizeSel.value);
    table.innerHTML = `<caption>1초에 10⁸번 기본 연산을 가정한 대략적 시간 (n = ${n.toLocaleString('ko-KR')})</caption><thead><tr><th>클래스</th><th>연산 횟수</th><th>예상 시간</th></tr></thead><tbody>${CLASSES.map((c) => {
      const ops = c.key === '2n' ? (n > 1023 ? Infinity : 2 ** n) : c.f(n);
      return `<tr><td><i class="sw" style="background:var(${c.c})"></i>${c.label}</td><td class="num">${Number.isFinite(ops) ? (ops < 1e15 ? Math.round(ops).toLocaleString('ko-KR') : ops.toExponential(2)) : '2^' + n}</td><td class="num">${humanTime(ops / 1e8)}</td></tr>`;
    }).join('')}</tbody>`;
  };
  nIn.addEventListener('input', () => { N = Number(nIn.value); nOut.textContent = N; draw(); });
  logIn.addEventListener('change', () => { logY = logIn.checked; draw(); });
  sizeSel.addEventListener('change', draw);
  host.append(
    h('div', { class: 'viz-controls' }, h('label', { for: 'bigo-n' }, '최대 n ', nIn, ' ', nOut), h('label', { for: 'bigo-log' }, logIn, ' 로그 축'), sizeSel),
    h('div', { class: 'chart-wrap' }, svg), legend, h('div', { class: 'table-wrap' }, table),
  );
  draw();
  return { dispose() {} };
}

/* ================= 2) 3D 벡터·내적 ================= */
async function mountVector3D(host) {
  const vals = { ax: 1, ay: 2, az: 2, bx: 2, by: 0, bz: 1 };
  const readout = h('dl', { class: 'readout', 'aria-live': 'polite' });
  const sliders = h('div', { class: 'viz-controls grid6' });
  for (const k of Object.keys(vals)) {
    const id = `vec-${k}`;
    const inp = h('input', { type: 'range', min: '-4', max: '4', step: '0.5', value: String(vals[k]), id });
    const out = h('output', { for: id, text: vals[k] });
    inp.addEventListener('input', () => { vals[k] = Number(inp.value); out.textContent = vals[k]; update(); });
    sliders.append(h('label', { for: id, class: k[0] === 'a' ? 'tint-a' : 'tint-b' }, `${k[0]}${{ x: '₁', y: '₂', z: '₃' }[k[1]]} `, inp, ' ', out));
  }
  const reset = h('button', { type: 'button', class: 'btn small', text: '예제 값으로 되돌리기' });
  sliders.append(reset);
  host.append(sliders);
  let T;
  try { T = await create3D(host, { height: 380, cam: [7, -7, 5.5] }); } catch (e) { vizError(host, e); host.append(readout); update(); return { dispose() {} }; }
  host.append(readout);
  const { THREE, scene } = T;
  // 축과 격자
  const axisMat = new THREE.LineBasicMaterial({ color: T.color('--muted') });
  const gridMat = new THREE.LineBasicMaterial({ color: T.color('--line'), transparent: true, opacity: 0.8 });
  const gpts = [];
  for (let i = -4; i <= 4; i++) { gpts.push(i, -4, 0, i, 4, 0, -4, i, 0, 4, i, 0); }
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gpts, 3)), gridMat);
  scene.add(grid);
  const axes = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-4.5, 0, 0, 4.5, 0, 0, 0, -4.5, 0, 0, 4.5, 0, 0, 0, -0.2, 0, 0, 4.5], 3)), axisMat);
  scene.add(axes);
  [['x₁', 4.8, 0, 0], ['x₂', 0, 4.8, 0], ['x₃', 0, 0, 4.8]].forEach(([t, x, y, z]) => { const l = T.label(t, 'axis'); l.position.set(x, y, z); scene.add(l); });
  const A = makeArrow(T, '--accent'), B = makeArrow(T, '--c4'), Pj = makeArrow(T, '--c3', 0.03);
  scene.add(A, B, Pj);
  const la = T.label('a', 'tag-a'), lb = T.label('b', 'tag-b'), lp = T.label('proj_b a', 'tag-p'), lt = T.label('θ', 'tag-t');
  scene.add(la, lb, lp, lt);
  const dashMat = new THREE.LineDashedMaterial({ color: T.color('--muted'), dashSize: 0.12, gapSize: 0.08 });
  const dash = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), dashMat);
  scene.add(dash);
  const arcMat = new THREE.LineBasicMaterial({ color: T.color('--ink') });
  const arc = new THREE.Line(new THREE.BufferGeometry(), arcMat);
  scene.add(arc);
  const recolor = () => {
    axisMat.color = T.color('--muted'); gridMat.color = T.color('--line'); dashMat.color = T.color('--muted'); arcMat.color = T.color('--ink');
    A.userData.mat.color = T.color('--accent'); B.userData.mat.color = T.color('--c4'); Pj.userData.mat.color = T.color('--c3'); T.kick();
  };
  const offTheme = onThemeChange(recolor);
  reset.addEventListener('click', () => { Object.assign(vals, { ax: 1, ay: 2, az: 2, bx: 2, by: 0, bz: 1 }); sliders.querySelectorAll('input').forEach((i) => { const k = i.id.slice(4); i.value = vals[k]; i.nextElementSibling.textContent = vals[k]; }); update(); });

  function update() {
    const a = [vals.ax, vals.ay, vals.az], b = [vals.bx, vals.by, vals.bz];
    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const na = Math.hypot(...a), nb = Math.hypot(...b);
    const cs = cosine(a, b);
    const theta = Number.isFinite(cs) ? (Math.acos(Math.max(-1, Math.min(1, cs))) * 180) / Math.PI : NaN;
    const sp = nb ? dot / nb : NaN;
    const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    readout.innerHTML = '';
    [['a·b', fmt(dot, 2)], ['‖a‖', fmt(na)], ['‖b‖', fmt(nb)], ['cos θ', fmt(cs)], ['θ', Number.isFinite(theta) ? `${theta.toFixed(1)}°` : '정의 안 됨(영벡터)'], ['b 방향 스칼라 사영', fmt(sp)], ['유클리드 거리 ‖a−b‖', fmt(dist)]]
      .forEach(([k, v]) => readout.append(h('div', {}, h('dt', { text: k }), h('dd', { text: v }))));
    if (!T) return;
    const O = new THREE.Vector3(), va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    A.set(O, va); B.set(O, vb);
    la.position.copy(va.clone().multiplyScalar(1.08)); lb.position.copy(vb.clone().multiplyScalar(1.08));
    const proj = nb ? vb.clone().multiplyScalar(dot / (nb * nb)) : new THREE.Vector3();
    Pj.set(O, proj); lp.position.copy(proj.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 0, -0.35)));
    lp.visible = Pj.visible;
    dash.geometry.setFromPoints([va, proj]); dash.computeLineDistances();
    const pts = [];
    if (na && nb && Number.isFinite(theta)) {
      const ua = va.clone().normalize(), ub = vb.clone().normalize();
      const r = Math.min(0.9, na * 0.5, nb * 0.5);
      for (let i = 0; i <= 32; i++) {
        const t = i / 32;
        const s = Math.sin((theta * Math.PI) / 180);
        const th = (theta * Math.PI) / 180;
        const v = s < 1e-6 ? ua.clone() : ua.clone().multiplyScalar(Math.sin((1 - t) * th) / s).add(ub.clone().multiplyScalar(Math.sin(t * th) / s));
        pts.push(v.multiplyScalar(r));
      }
      lt.position.copy(pts[16].clone().multiplyScalar(1.35)); lt.visible = true;
    } else lt.visible = false;
    arc.geometry.dispose(); arc.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    T.kick();
  }
  update();
  return { dispose() { offTheme(); T.dispose(); } };
}

/* ================= 3) 신뢰구간 시뮬레이션 (Canvas) ================= */
function mountCI(host) {
  const MU = 10, SIGMA = 0.04, REPS = 100;
  let n = 16, conf = 0.95, seed = 20261123;
  const nSel = h('select', { id: 'ci-n', 'aria-label': '표본 크기 n' }, ...[5, 10, 16, 30, 64, 100].map((v) => h('option', { value: String(v), selected: v === n ? '' : false, text: `n = ${v}` })));
  const cSel = h('select', { id: 'ci-conf', 'aria-label': '신뢰수준' }, ...[0.8, 0.9, 0.95, 0.99].map((v) => h('option', { value: String(v), selected: v === conf ? '' : false, text: `${Math.round(v * 100)}%` })));
  const again = h('button', { type: 'button', class: 'btn small', text: '다시 추출' });
  const stat = h('p', { class: 'viz-stat', 'aria-live': 'polite' });
  const cv1 = h('canvas', { class: 'cv', 'aria-label': '신뢰구간 100개', role: 'img' });
  const cv2 = h('canvas', { class: 'cv', 'aria-label': '표본평균의 분포', role: 'img' });
  host.append(h('div', { class: 'viz-controls' }, h('label', { for: 'ci-n' }, '표본 크기 ', nSel), h('label', { for: 'ci-conf' }, '신뢰수준 ', cSel), again), h('div', { class: 'cv-pair' }, h('figure', {}, cv1, h('figcaption', { text: '구간 100개 (세로선 = 참 평균 μ)' })), h('figure', {}, cv2, h('figcaption', { text: '표본평균 2,000개의 분포와 이론 곡선 N(μ, σ²/n)' }))), stat);
  const xRange = [MU - 0.075, MU + 0.075];
  const setup = (cv, hgt) => {
    const w = cv.parentElement.clientWidth || 300; const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = hgt * dpr; cv.style.height = `${hgt}px`;
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, w, hgt };
  };
  const draw = () => {
    const rand = rng(seed); const nz = normalSampler(rand);
    const tcrit = tQuantile(1 - (1 - conf) / 2, n - 1);
    const ints = [];
    for (let r = 0; r < REPS; r++) {
      let s = 0, ss = 0; const xs = [];
      for (let i = 0; i < n; i++) { const x = MU + SIGMA * nz(); xs.push(x); s += x; }
      const m = s / n; for (const x of xs) ss += (x - m) ** 2;
      const sd = Math.sqrt(ss / (n - 1)); const half = (tcrit * sd) / Math.sqrt(n);
      ints.push({ m, lo: m - half, hi: m + half, hit: m - half <= MU && MU <= m + half, half });
    }
    const hits = ints.filter((x) => x.hit).length;
    const avgHalf = ints.reduce((a, b) => a + b.half, 0) / REPS;
    // 왼쪽: 구간
    { const { ctx, w, hgt } = setup(cv1, 300); const px = (v) => 8 + ((v - xRange[0]) / (xRange[1] - xRange[0])) * (w - 16);
      ctx.clearRect(0, 0, w, hgt); ctx.strokeStyle = css('--line'); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px(MU), 0); ctx.lineTo(px(MU), hgt - 18); ctx.strokeStyle = css('--ink'); ctx.stroke();
      ints.forEach((it, i) => { const y = 4 + i * ((hgt - 26) / REPS); ctx.strokeStyle = it.hit ? css('--muted') : css('--bad'); ctx.lineWidth = it.hit ? 1.2 : 2; ctx.beginPath(); ctx.moveTo(px(Math.max(xRange[0], it.lo)), y); ctx.lineTo(px(Math.min(xRange[1], it.hi)), y); ctx.stroke(); ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(px(it.m) - 1, y - 1, 2, 2); });
      ctx.fillStyle = css('--muted'); ctx.font = '11px var(--font-mono, monospace)'; ctx.textAlign = 'center';
      [xRange[0], MU, xRange[1]].forEach((v) => ctx.fillText(v.toFixed(3), px(v), hgt - 4)); }
    // 오른쪽: 표본분포 히스토그램
    { const { ctx, w, hgt } = setup(cv2, 300); const px = (v) => 8 + ((v - xRange[0]) / (xRange[1] - xRange[0])) * (w - 16);
      const r2 = rng(seed + 1); const nz2 = normalSampler(r2); const bins = new Array(60).fill(0); const M = 2000;
      for (let k = 0; k < M; k++) { let s = 0; for (let i = 0; i < n; i++) s += MU + SIGMA * nz2(); const m = s / n; const b = Math.floor(((m - xRange[0]) / (xRange[1] - xRange[0])) * 60); if (b >= 0 && b < 60) bins[b]++; }
      const se = SIGMA / Math.sqrt(n); const bw = (xRange[1] - xRange[0]) / 60;
      const pdfMax = (1 / (se * Math.sqrt(2 * Math.PI))) * bw * M; const yMax = Math.max(pdfMax, ...bins) * 1.08;
      const py = (c) => hgt - 18 - (c / yMax) * (hgt - 30);
      ctx.clearRect(0, 0, w, hgt); ctx.fillStyle = css('--accent-soft');
      bins.forEach((c, i) => { const x0 = px(xRange[0] + i * bw), x1 = px(xRange[0] + (i + 1) * bw); ctx.fillRect(x0, py(c), Math.max(1, x1 - x0 - 1), hgt - 18 - py(c)); });
      ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 200; i++) { const v = xRange[0] + ((xRange[1] - xRange[0]) * i) / 200; const d = Math.exp(-(((v - MU) / se) ** 2) / 2) / (se * Math.sqrt(2 * Math.PI)) * bw * M; i ? ctx.lineTo(px(v), py(d)) : ctx.moveTo(px(v), py(d)); }
      ctx.stroke(); ctx.strokeStyle = css('--ink'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px(MU), 6); ctx.lineTo(px(MU), hgt - 18); ctx.stroke();
      ctx.fillStyle = css('--muted'); ctx.font = '11px var(--font-mono, monospace)'; ctx.textAlign = 'center';
      [xRange[0], MU, xRange[1]].forEach((v) => ctx.fillText(v.toFixed(3), px(v), hgt - 4)); }
    stat.textContent = `참 평균을 포함한 구간 ${hits}/${REPS}개 (명목 ${Math.round(conf * 100)}%) · 평균 오차한계 ±${avgHalf.toFixed(4)} mm · t 임계값 ${tcrit.toFixed(3)} (자유도 ${n - 1}) · 표준오차 σ/√n = ${(SIGMA / Math.sqrt(n)).toFixed(4)} mm`;
  };
  nSel.addEventListener('change', () => { n = Number(nSel.value); draw(); });
  cSel.addEventListener('change', () => { conf = Number(cSel.value); draw(); });
  again.addEventListener('click', () => { seed += 101; draw(); });
  let lastW = 0;
  const ro = new ResizeObserver(() => { const w = host.clientWidth; if (Math.abs(w - lastW) > 2) { lastW = w; draw(); } }); // 폭이 바뀔 때만
  ro.observe(host);
  const off = onThemeChange(draw);
  lastW = host.clientWidth; draw();
  return { dispose() { ro.disconnect(); off(); } };
}

/* ================= 4) B-Tree 3D 분해도 ================= */
async function mountBTree3D(host) {
  let tree = new BTree(3);
  [10, 20, 30, 40, 50, 25, 35, 5, 15].forEach((k) => tree.insert(k));
  tree.log = ['예시로 10, 20, 30, 40, 50, 25, 35, 5, 15를 삽입한 상태에서 시작합니다.'];
  let highlight = null; // {path:Set(node), key}
  const keyIn = h('input', { type: 'number', id: 'bt-key', min: '0', max: '999', value: '42', inputmode: 'numeric', 'aria-label': '키 값' });
  const btn = (t, f) => h('button', { type: 'button', class: 'btn small', text: t, onclick: f });
  const status = h('p', { class: 'viz-stat', 'aria-live': 'polite' });
  const logList = h('ol', { class: 'viz-log', 'aria-label': '작업 기록' });
  host.append(h('div', { class: 'viz-controls' }, h('label', { for: 'bt-key' }, '키 ', keyIn),
    btn('삽입', () => { const k = parseInt(keyIn.value, 10); if (Number.isFinite(k)) { tree.insert(k); highlight = null; refresh(); } }),
    btn('검색', () => { const k = parseInt(keyIn.value, 10); if (!Number.isFinite(k)) return; const r = tree.search(k); highlight = { path: new Set(r.path), key: r.found ? k : null }; tree.log.push(`${k} 검색: ${r.found ? '찾음' : '없음'} — 읽은 페이지(노드) ${r.path.length}개, 트리 높이 ${tree.height}`); refresh(); }),
    btn('무작위 5개 삽입', () => { for (let i = 0; i < 5; i++) tree.insert(Math.floor(Math.random() * 100)); highlight = null; refresh(); }),
    btn('예제 1 (10→50)', () => { tree = new BTree(3); [10, 20, 30, 40, 50].forEach((k) => tree.insert(k)); highlight = null; refresh(); }),
    btn('초기화', () => { tree = new BTree(3); highlight = null; refresh(); })));
  let T;
  try { T = await create3D(host, { height: 420, cam: [0, -16, 7], target: [0, 0, -2.4], fov: 42 }); } catch (e) { vizError(host, e); }
  host.append(status, logList);
  const SLOT = 0.9, GAP = 0.5, LEVEL = 2.4;
  let group = null;
  function layout() {
    const levels = []; const pos = new Map();
    const walk = (n, d) => { (levels[d] ||= []).push(n); n.children.forEach((c) => walk(c, d + 1)); };
    walk(tree.root, 0);
    const leaves = levels[levels.length - 1];
    const nodeW = tree.maxKeys * SLOT;
    leaves.forEach((n, i) => pos.set(n, { x: i * (nodeW + GAP), d: levels.length - 1 }));
    for (let d = levels.length - 2; d >= 0; d--) for (const n of levels[d]) pos.set(n, { x: (pos.get(n.children[0]).x + pos.get(n.children[n.children.length - 1]).x) / 2, d });
    const minX = Math.min(...[...pos.values()].map((p) => p.x)), maxX = Math.max(...[...pos.values()].map((p) => p.x));
    const cx = (minX + maxX) / 2;
    for (const p of pos.values()) { p.x -= cx; p.z = -p.d * LEVEL; p.y = p.d * 0.9; }
    return { levels, pos, width: maxX - minX + nodeW };
  }
  function refresh() {
    status.textContent = `키 ${countKeys(tree.root)}개 · 높이 ${tree.height}층 · 노드(페이지)당 최대 키 ${tree.maxKeys}개 · 불변식 ${tree.check() ? '만족' : '위반'}`;
    logList.innerHTML = ''; tree.log.slice(-6).forEach((m) => logList.append(h('li', { text: m })));
    if (!T) return;
    const { THREE, scene } = T;
    if (group) { scene.remove(group); group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); if (o.isCSS2DObject) o.element.remove(); }); }
    group = new THREE.Group(); scene.add(group);
    const { pos, width } = layout();
    const nodeW = tree.maxKeys * SLOT;
    const slotGeo = new THREE.BoxGeometry(SLOT * 0.94, 0.7, 0.7);
    const edges = [];
    for (const [n, p] of pos) {
      const onPath = highlight?.path.has(n);
      for (let i = 0; i < tree.maxKeys; i++) {
        const filled = i < n.keys.length;
        const isKey = filled && highlight?.key === n.keys[i];
        const col = isKey ? css('--c4') : onPath ? css('--accent') : filled ? css('--node') : css('--line');
        const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(col), transparent: !filled, opacity: filled ? 1 : 0.35, roughness: 0.7 });
        const box = new THREE.Mesh(slotGeo, m);
        box.position.set(p.x - nodeW / 2 + SLOT * (i + 0.5), p.y, p.z);
        group.add(box);
        if (filled) { const l = T.label(String(n.keys[i]), `key ${onPath ? 'on' : ''}`); l.position.set(box.position.x, box.position.y - 0.4, box.position.z); group.add(l); }
      }
      n.children.forEach((c, i) => {
        const cp = pos.get(c);
        edges.push(p.x - nodeW / 2 + SLOT * i, p.y, p.z - 0.36, cp.x, cp.y, cp.z + 0.36);
      });
    }
    const lm = new THREE.LineBasicMaterial({ color: new THREE.Color(css('--muted')) });
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(edges, 3)), lm));
    const dist = Math.max(7, width * 0.62 + tree.height * 1.2);
    const tz = -((tree.height - 1) * LEVEL) / 2, ty = ((tree.height - 1) * 0.9) / 2;
    T.camera.position.set(width * 0.12, ty - dist, tz + dist * 0.42); T.controls.target.set(0, ty, tz); T.controls.update();
    T.kick();
  }
  const countKeys = (n) => n.keys.length + n.children.reduce((a, c) => a + countKeys(c), 0);
  const off = onThemeChange(refresh);
  refresh();
  return { dispose() { off(); T?.dispose(); } };
}

/* ================= 5) 임베딩 공간 Top-k 검색 ================= */
async function mountEmbed3D(host) {
  const r = rng(42); const nz = normalSampler(r);
  const normv = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const centers = [normv([1, 0.4, 0.6]), normv([-0.6, 0.9, 0.2]), normv([0.1, -0.8, 0.7])];
  const topicNames = ['환불 정책', '배송·물류', '계정·보안'];
  const docs = [];
  centers.forEach((c, ci) => { for (let i = 0; i < 8; i++) docs.push({ id: `d${docs.length + 1}`, topic: ci, v: normv(c.map((x) => x + 0.32 * nz())) }); });
  const q = normv(centers[0].map((x, i) => x + [0.12, -0.1, 0.05][i]));
  docs.forEach((d) => { d.cos = cosine(q, d.v); });
  const ranked = docs.slice().sort((a, b) => b.cos - a.cos);
  // 정답: 질의 주제 군집 안의 3개 + 다른 군집에 있는 1개(표현이 달라 임베딩이 멀어진 근거 문서)
  const rel = new Set([ranked[0].id, ranked[2].id, ranked[5].id, docs.filter((d) => d.topic === 1).sort((a, b) => b.cos - a.cos)[0].id]);
  let k = 5;
  const kIn = h('input', { type: 'range', id: 'emb-k', min: '1', max: '12', value: String(k) });
  const kOut = h('output', { for: 'emb-k', text: k });
  const metricsEl = h('dl', { class: 'readout', 'aria-live': 'polite' });
  const tbl = h('table', { class: 'mini rank' });
  host.append(h('div', { class: 'viz-controls' }, h('label', { for: 'emb-k' }, '검색 개수 k ', kIn, ' ', kOut), h('span', { class: 'hint', text: '표의 "정답" 칸을 눌러 관련 문서를 바꿔 볼 수 있다' })));
  let T;
  try { T = await create3D(host, { height: 380, cam: [2.6, -2.6, 1.8], fov: 40 }); } catch (e) { vizError(host, e); }
  host.append(metricsEl, h('div', { class: 'table-wrap' }, tbl));
  let meshes = new Map(), lines = null, rings = new Map();
  if (T) {
    const { THREE, scene } = T;
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 18, 12)), new THREE.LineBasicMaterial({ color: new THREE.Color(css('--line')), transparent: true, opacity: 0.6 }));
    scene.add(wire);
    const geo = new THREE.SphereGeometry(0.035, 16, 12);
    docs.forEach((d) => {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color(css('--node')) }));
      m.position.set(...d.v); scene.add(m); meshes.set(d.id, m);
      const ring = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(css('--ok')), wireframe: true }));
      ring.position.set(...d.v); scene.add(ring); rings.set(d.id, ring);
      const l = T.label(d.id, 'tiny'); l.position.set(d.v[0] * 1.09, d.v[1] * 1.09, d.v[2] * 1.09); scene.add(l); d.label = l;
    });
    centers.forEach((c, i) => { const l = T.label(topicNames[i], 'topic'); l.position.set(c[0] * 1.32, c[1] * 1.32, c[2] * 1.32); scene.add(l); });
    const qm = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 14), new THREE.MeshStandardMaterial({ color: new THREE.Color(css('--c4')), emissive: new THREE.Color(css('--c4')), emissiveIntensity: 0.3 }));
    qm.position.set(...q); scene.add(qm);
    const arrow = makeArrow(T, '--c4', 0.012); arrow.set(new THREE.Vector3(), new THREE.Vector3(...q)); scene.add(arrow);
    const ql = T.label('질의 q', 'tag-q'); ql.position.set(q[0] * 1.25, q[1] * 1.25, q[2] * 1.25 + 0.12); scene.add(ql);
  }
  function update() {
    const order = ranked.map((d) => d.id);
    const m = irMetrics(order, [...rel], k);
    metricsEl.innerHTML = '';
    [['Recall@k', `${fmt(m.recall)}  (${Math.round(m.recall * rel.size)}/${rel.size})`], ['Precision@k', fmt(m.precision)], ['RR (첫 정답 순위의 역수)', fmt(m.rr)], ['nDCG@k', `${fmt(m.ndcg)} = ${fmt(m.dcg)} / ${fmt(m.idcg)}`]]
      .forEach(([a, b]) => metricsEl.append(h('div', {}, h('dt', { text: a }), h('dd', { text: b }))));
    tbl.innerHTML = '<caption>코사인 유사도 순위 (상위 12개)</caption><thead><tr><th>순위</th><th>문서</th><th>주제</th><th>cos</th><th>정답</th></tr></thead>';
    const tb = h('tbody');
    ranked.slice(0, 12).forEach((d, i) => {
      const cb = h('input', { type: 'checkbox', 'aria-label': `${d.id} 정답 여부` }); cb.checked = rel.has(d.id);
      cb.addEventListener('change', () => { cb.checked ? rel.add(d.id) : rel.delete(d.id); update(); });
      tb.append(h('tr', { class: i < k ? 'in-k' : '' }, h('td', { class: 'num', text: i + 1 }), h('td', { text: d.id }), h('td', { text: topicNames[d.topic] }), h('td', { class: 'num', text: d.cos.toFixed(3) }), h('td', {}, cb)));
    });
    const missing = [...rel].filter((id) => !ranked.slice(0, 12).some((d) => d.id === id));
    if (missing.length) tb.append(h('tr', {}, h('td', { colspan: '5', class: 'hint', text: `상위 12위 밖의 정답: ${missing.map((id) => `${id}(${ranked.findIndex((d) => d.id === id) + 1}위)`).join(', ')}` })));
    tbl.append(tb);
    if (!T) return;
    const { THREE, scene } = T;
    const topk = new Set(order.slice(0, k));
    for (const d of docs) {
      meshes.get(d.id).material.color = new THREE.Color(css(topk.has(d.id) ? '--accent' : '--node'));
      meshes.get(d.id).scale.setScalar(topk.has(d.id) ? 1.5 : 1);
      rings.get(d.id).visible = rel.has(d.id);
      rings.get(d.id).material.color = new THREE.Color(css('--ok'));
      if (d.label) d.label.visible = topk.has(d.id) || rel.has(d.id);
    }
    if (lines) { scene.remove(lines); lines.geometry.dispose(); }
    const pts = []; order.slice(0, k).forEach((id) => { const d = docs.find((x) => x.id === id); pts.push(...q, ...d.v); });
    lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.LineBasicMaterial({ color: new THREE.Color(css('--accent')), transparent: true, opacity: 0.7 }));
    scene.add(lines); T.kick();
  }
  kIn.addEventListener('input', () => { k = Number(kIn.value); kOut.textContent = k; update(); });
  const off = onThemeChange(update);
  update();
  return { dispose() { off(); T?.dispose(); } };
}

/* ================= 지식 지도 3D ================= */
export const DISCIPLINE_COLOR = { CS: '--d-cs', MATH: '--d-math', STAT: '--d-stat', SE: '--d-se', DE: '--d-de', AI: '--d-ai', KE: '--d-ke', OR: '--d-or', OPS: '--d-ops', PE: '--d-pe' };
export async function mountKnowledgeMap(host, { concepts, relations, disciplines, articleByConcept, onSelect }) {
  const T = await create3D(host, { height: 560, cam: [0, -24, 11], target: [0, 0, 0], fov: 45 });
  const { THREE, scene } = T;
  const ids = concepts.map((c) => c.id);
  const depth = prerequisiteDepth(ids, relations);
  const maxD = Math.max(...Object.values(depth));
  const dOrder = Object.keys(disciplines).filter((d) => concepts.some((c) => c.discipline === d));
  const groups = {};
  for (const c of concepts) (groups[`${c.discipline}|${depth[c.id]}`] ||= []).push(c);
  const pos = {};
  for (const c of concepts) {
    const sector = (dOrder.indexOf(c.discipline) / dOrder.length) * Math.PI * 2;
    const g = groups[`${c.discipline}|${depth[c.id]}`]; const j = g.indexOf(c);
    const ang = sector + (j - (g.length - 1) / 2) * 0.24 + depth[c.id] * 0.05;
    const R = 7.4 + (j % 2) * 1.6;
    pos[c.id] = new THREE.Vector3(Math.cos(ang) * R, Math.sin(ang) * R, (maxD / 2 - depth[c.id]) * 3.4);
  }
  // 층 표시(선행 깊이)
  const ringMat = new THREE.LineBasicMaterial({ color: new THREE.Color(css('--line')), transparent: true, opacity: 0.7 });
  for (let d = 0; d <= maxD; d++) {
    const pts = []; for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 8.2, Math.sin(a) * 8.2, (maxD / 2 - d) * 3.4)); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
    const l = T.label(`선행 깊이 ${d}`, 'depth'); l.position.set(0, 10.6, (maxD / 2 - d) * 3.4); scene.add(l);
  }
  const nodeMeshes = []; const nodeById = {}; const labelById = {};
  for (const c of concepts) {
    const has = !!articleByConcept[c.id];
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(css(DISCIPLINE_COLOR[c.discipline])), transparent: !has, opacity: has ? 1 : 0.45, roughness: 0.45, wireframe: !has });
    const m = new THREE.Mesh(new THREE.SphereGeometry(has ? 0.34 : 0.26, 24, 16), mat);
    m.position.copy(pos[c.id]); m.userData.id = c.id; scene.add(m); nodeMeshes.push(m); nodeById[c.id] = m;
    const l = T.label(c.title_ko, `node ${has ? 'has' : 'planned'}`); l.position.copy(pos[c.id]).add(new THREE.Vector3(0, 0, has ? 0.62 : 0.5)); scene.add(l); labelById[c.id] = l;
  }
  const edgeObjs = [];
  const relColor = { prerequisite: '--muted', related: '--c2', application: '--c4' };
  for (const e of relations) {
    const a = pos[e.from], b = pos[e.to]; if (!a || !b) continue;
    let obj;
    if (e.type === 'prerequisite') {
      obj = makeArrow(T, relColor.prerequisite, 0.022);
      const dir = new THREE.Vector3().subVectors(b, a).normalize();
      obj.set(a.clone().add(dir.clone().multiplyScalar(0.36)), b.clone().sub(dir.clone().multiplyScalar(0.4)));
    } else {
      const mat = new THREE.LineDashedMaterial({ color: new THREE.Color(css(relColor[e.type])), dashSize: e.type === 'related' ? 0.25 : 0.08, gapSize: 0.14, transparent: true, opacity: 0.85 });
      obj = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat); obj.computeLineDistances();
      obj.userData.mat = mat;
    }
    obj.userData.rel = e; scene.add(obj); edgeObjs.push(obj);
  }
  const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2();
  let selected = null;
  const el = T.stage.querySelector('.labels3d');
  let downAt = null;
  el.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
  el.addEventListener('pointerup', (ev) => {
    if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) return;
    const rect = el.getBoundingClientRect();
    mouse.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(mouse, T.camera);
    const hit = ray.intersectObjects(nodeMeshes)[0];
    if (hit) api.select(hit.object.userData.id, true);
  });
  el.addEventListener('pointermove', (ev) => {
    const rect = el.getBoundingClientRect();
    mouse.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(mouse, T.camera);
    el.style.cursor = ray.intersectObjects(nodeMeshes).length ? 'pointer' : 'grab';
  });
  // 처음 12초만 천천히 회전해 입체감을 보여 주고 멈춘다(움직임 줄이기 설정이면 회전 없음)
  if (!reducedMotion()) { T.controls.autoRotate = true; T.controls.autoRotateSpeed = 0.8; setTimeout(() => { T.controls.autoRotate = false; }, 12000); }
  T.controls.addEventListener('start', () => { T.controls.autoRotate = false; });
  T.kick();
  const filters = { prerequisite: true, related: true, application: true };
  const applyVisibility = () => {
    const near = selected ? new Set([selected, ...relations.filter((e) => e.from === selected || e.to === selected).flatMap((e) => [e.from, e.to])]) : null;
    for (const o of edgeObjs) {
      const e = o.userData.rel;
      o.visible = filters[e.type] && (!near || e.from === selected || e.to === selected);
    }
    for (const c of concepts) {
      const dim = near && !near.has(c.id);
      nodeById[c.id].material.opacity = dim ? 0.15 : (articleByConcept[c.id] ? 1 : 0.45);
      nodeById[c.id].material.transparent = true;
      labelById[c.id].element.classList.toggle('dim', !!dim);
      labelById[c.id].element.classList.toggle('sel', c.id === selected);
    }
    T.kick();
  };
  const api = {
    select(id, fromClick = false) { selected = selected === id && fromClick ? null : id; applyVisibility(); onSelect?.(selected); },
    setFilter(type, on) { filters[type] = on; applyVisibility(); },
    resetView() { selected = null; T.camera.position.set(0, -24, 11); T.controls.target.set(0, 0, 0); applyVisibility(); onSelect?.(null); },
    recolor() {
      ringMat.color = new THREE.Color(css('--line'));
      for (const c of concepts) nodeById[c.id].material.color = new THREE.Color(css(DISCIPLINE_COLOR[c.discipline]));
      for (const o of edgeObjs) { const e = o.userData.rel; if (o.userData.mat) o.userData.mat.color = new THREE.Color(css(relColor[e.type])); else if (o.userData.colorVar) o.userData.mat.color = new THREE.Color(css(o.userData.colorVar)); }
      T.kick();
    },
    dispose() { off(); T.dispose(); },
  };
  const off = onThemeChange(() => api.recolor());
  return api;
}

/* ================= 진입점 ================= */
const REGISTRY = { bigo: mountBigO, vector3d: mountVector3D, ci: mountCI, btree3d: mountBTree3D, embed3d: mountEmbed3D };
export async function mountViz(el) {
  const name = el.dataset.viz;
  const fn = REGISTRY[name];
  if (!fn) return { dispose() {} };
  el.innerHTML = '';
  const body = h('div', { class: 'viz-body' });
  el.append(body);
  if (el.dataset.caption) el.append(h('p', { class: 'viz-caption', text: el.dataset.caption }));
  try { return (await fn(body)) || { dispose() {} }; } catch (e) { vizError(body, e); return { dispose() {} }; }
}
