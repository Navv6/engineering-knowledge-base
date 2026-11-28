// 직접 해보기(실행 체험) 블록: 설명집의 ```runjs 블록을 슬라이더 + 코드 편집 + 실행 결과로 바꾼다.
// 같은 실행 규칙을 빌드·검증(Node vm)과 화면(Web Worker)이 함께 쓴다.

// 사용자 코드 앞에 붙는 도우미 함수들. log(…), table(rows, head), bars(labels, values), result(v)
export const PLAY_PRELUDE = `
const __out = [];
let __result;
function __fmt(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : String(+v.toPrecision(10))) : String(v);
  if (Array.isArray(v)) return '[' + v.map(__fmt).join(', ') + ']';
  if (v && typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return String(v); } }
  return String(v);
}
function log(...a) { if (__out.length < 400) __out.push({ t: 'log', v: a.map(__fmt).join(' ') }); }
function table(rows, head) { __out.push({ t: 'table', head: head ? head.map(__fmt) : null, rows: (rows || []).slice(0, 200).map((r) => (Array.isArray(r) ? r : [r]).map(__fmt)) }); }
function bars(labels, values) { __out.push({ t: 'bars', labels: (labels || []).map(String), values: (values || []).map(Number) }); }
function result(v) { __result = v; __out.push({ t: 'result', v: __fmt(v) }); }
`;

/** 실행할 전체 소스(도우미 + 매개변수 선언 + 사용자 코드)를 만든다. 반환값: { out, result } */
export function buildPlaySource(code, params, values) {
  const decl = (params || []).map((p) => `let ${p.name} = ${JSON.stringify(Number(values && p.name in values ? values[p.name] : p.value))};`).join('\n');
  return `(function(){\n${PLAY_PRELUDE}\n${decl}\n${code}\n;return { out: __out, result: __result === undefined ? null : __result };\n})()`;
}

const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 실행 결과 → HTML(빌드 시 정적 결과와 화면 실행 결과가 같은 모양) */
export function renderPlayOut(out, error, label = '') {
  if (error) return `<p class="play-err">${escH(error)}</p>`;
  if (!out || !out.length) return '<p class="muted small">출력이 없습니다. log(…)나 result(…)로 결과를 보여 주세요.</p>';
  const html = [];
  let logs = [];
  const flush = () => { if (logs.length) { html.push(`<pre class="play-log">${logs.map(escH).join('\n')}</pre>`); logs = []; } };
  for (const o of out) {
    if (o.t === 'log') { logs.push(o.v); continue; }
    flush();
    if (o.t === 'table') {
      html.push(`<div class="table-wrap"><table class="play-table">${o.head ? `<thead><tr>${o.head.map((h) => `<th>${escH(h)}</th>`).join('')}</tr></thead>` : ''}<tbody>${o.rows.map((r) => `<tr>${r.map((c) => `<td>${escH(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else if (o.t === 'bars') {
      const max = Math.max(1e-12, ...o.values.map((v) => Math.abs(v)));
      html.push(`<div class="play-bars">${o.labels.map((l, i) => {
        const v = o.values[i]; const w = Number.isFinite(v) ? Math.round((Math.abs(v) / max) * 100) : 0;
        return `<div class="pb-row"><span class="pb-l">${escH(l)}</span><span class="pb-track"><span class="pb-bar" style="width:${w}%"></span></span><span class="pb-v mono">${escH(Number.isFinite(v) ? +v.toPrecision(4) : v)}</span></div>`;
      }).join('')}</div>`);
    } else if (o.t === 'result') {
      html.push(`<p class="play-result">결과${label ? `(${escH(label)})` : ''}: <strong class="mono">${escH(o.v)}</strong></p>`);
    }
  }
  flush();
  return html.join('');
}

/** ```runjs 블록 해석: // @title, // @param 이름 | 이름표 | 최소 | 최대 | 기본값 | 간격, // @expect a=1, b=2 => 값 */
export function parsePlay(src) {
  const params = []; const expects = []; let title = ''; let label = '';
  const keep = [];
  for (const line of src.split('\n')) {
    let m;
    if ((m = line.match(/^\s*\/\/\s*@title\s+(.+)$/))) { title = m[1].trim(); continue; }
    if ((m = line.match(/^\s*\/\/\s*@label\s+(.+)$/))) { label = m[1].trim(); continue; }
    if ((m = line.match(/^\s*\/\/\s*@param\s+(.+)$/))) {
      const f = m[1].split('|').map((s) => s.trim());
      if (f.length !== 6 || !/^[A-Za-z_]\w*$/.test(f[0])) throw new Error(`@param 형식 오류: "${line.trim()}" (이름 | 이름표 | 최소 | 최대 | 기본값 | 간격)`);
      const [name, label, min, max, value, step] = f;
      const nums = [min, max, value, step].map(Number);
      if (nums.some((n) => !Number.isFinite(n))) throw new Error(`@param 숫자 오류: ${name}`);
      if (nums[2] < nums[0] || nums[2] > nums[1]) throw new Error(`@param 기본값이 범위 밖: ${name}`);
      params.push({ name, label, min: nums[0], max: nums[1], value: nums[2], step: nums[3] });
      continue;
    }
    if ((m = line.match(/^\s*\/\/\s*@expect\s+(.*?)=>\s*(.+)$/))) {
      const assign = {};
      for (const kv of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        const [k, v] = kv.split('=').map((s) => s.trim());
        if (!k || v === undefined || !Number.isFinite(Number(v))) throw new Error(`@expect 형식 오류: "${line.trim()}"`);
        assign[k] = Number(v);
      }
      expects.push({ assign, value: m[2].trim() });
      continue;
    }
    keep.push(line);
  }
  return { title, label, params, expects, code: keep.join('\n').replace(/^\n+|\n+$/g, '') };
}

/** 결과 비교: 숫자면 상대 오차 1e-6 이내, 아니면 문자열 일치 */
export function playResultMatches(actual, expected) {
  const a = Number(actual), e = Number(expected);
  if (Number.isFinite(e) && Number.isFinite(a)) return Math.abs(a - e) <= 1e-6 * Math.max(1, Math.abs(e));
  return String(actual) === String(expected).replace(/^"(.*)"$/, '$1');
}

/* ---------- 화면 ---------- */
const PLAY_TIMEOUT_MS = 1500;
let playWorkerOk = null; // null: 아직 모름, true/false: 시도 결과

function runInWorker(source) {
  return new Promise((resolve) => {
    let w, url, done = false;
    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); try { w && w.terminate(); } catch (e) { /* 무시 */ } if (url) URL.revokeObjectURL(url); resolve(r); };
    const timer = setTimeout(() => finish({ error: `시간 초과(${PLAY_TIMEOUT_MS / 1000}초): 반복이 끝나지 않는지 확인해 보세요.` }), PLAY_TIMEOUT_MS);
    try {
      // 실행 코드를 Worker 스크립트에 직접 넣는다(eval 없음). 문법 오류도 try 밖에서 잡히도록 Function 대신 onerror로 보고
      const body = `try { const __r = ${source}; self.postMessage({ ok: true, out: __r.out, result: __r.result }); } catch (err) { self.postMessage({ ok: false, error: String(err && err.message || err) }); }`;
      url = URL.createObjectURL(new Blob([body], { type: 'text/javascript' }));
      w = new Worker(url);
      w.onmessage = (e) => { playWorkerOk = true; finish(e.data.ok ? { out: e.data.out, result: e.data.result } : { error: `오류: ${e.data.error}` }); };
      w.onerror = (e) => {
        e.preventDefault?.();
        const msg = e.message || '';
        // 문법 오류는 Worker가 실행 가능하다는 뜻이므로 사용자에게 오류로 보여 준다
        if (/SyntaxError|Unexpected|Invalid|missing/i.test(msg)) { playWorkerOk = true; finish({ error: `문법 오류: ${msg}` }); return; }
        finish({ unavailable: playWorkerOk !== true, error: msg ? `오류: ${msg}` : '이 환경에서는 코드 실행이 막혀 있습니다. 아래 결과는 기본값으로 미리 계산한 것입니다.' });
      };
    } catch (err) {
      finish({ unavailable: true, error: '이 환경에서는 코드 실행이 막혀 있습니다. 아래 결과는 기본값으로 미리 계산한 것입니다.' });
    }
  });
}

export function mountPlay(el) {
  let cfg;
  try { cfg = JSON.parse(el.dataset.play); } catch (e) { return { dispose() {} }; }
  const values = Object.fromEntries(cfg.params.map((p) => [p.name, p.value]));
  const uid = `pl${Math.random().toString(36).slice(2, 8)}`;
  el.innerHTML = `
    <div class="play-head"><span class="pill ok">직접 해보기</span>${cfg.title ? ` <span class="play-title">${escH(cfg.title)}</span>` : ''}</div>
    ${cfg.params.length ? `<div class="play-params">${cfg.params.map((p) => `
      <label class="play-param" for="${uid}-${p.name}"><span class="pp-label">${escH(p.label)} <code>${p.name}</code></span>
        <input type="range" id="${uid}-${p.name}" data-name="${p.name}" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}">
        <output class="mono" for="${uid}-${p.name}">${p.value}</output></label>`).join('')}</div>` : ''}
    <details class="play-code"><summary>코드 보기·고치기</summary>
      <textarea spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="실행할 코드" rows="${Math.min(18, cfg.code.split('\n').length + 1)}">${escH(cfg.code)}</textarea>
      <div class="row"><button type="button" class="btn play-run">실행 (Ctrl+Enter)</button><button type="button" class="btn ghost play-reset">원래 코드로</button><span class="muted small">위 슬라이더 값은 같은 이름의 변수로 들어갑니다.</span></div>
    </details>
    <div class="play-out" aria-live="polite">${renderPlayOut(cfg.out, cfg.error, cfg.label)}</div>`;
  const ta = el.querySelector('textarea'); const out = el.querySelector('.play-out');
  let seq = 0; let disposed = false; let timer;
  const run = async () => {
    const my = ++seq;
    out.classList.add('busy');
    const r = await runInWorker(buildPlaySource(ta.value, cfg.params, values));
    if (disposed || my !== seq) return;
    out.classList.remove('busy');
    if (r.unavailable) { out.innerHTML = `<p class="muted small">${escH(r.error)}</p>${renderPlayOut(cfg.out, cfg.error, cfg.label)}`; el.querySelectorAll('input[type=range]').forEach((i) => { i.disabled = true; }); return; }
    out.innerHTML = renderPlayOut(r.out, r.error, cfg.label);
  };
  el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
    values[inp.dataset.name] = Number(inp.value);
    inp.nextElementSibling.textContent = inp.value;
    clearTimeout(timer); timer = setTimeout(run, 120);
  }));
  el.querySelector('.play-run').addEventListener('click', run);
  el.querySelector('.play-reset').addEventListener('click', () => { ta.value = cfg.code; run(); });
  ta.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
  });
  return { dispose() { disposed = true; clearTimeout(timer); } };
}
