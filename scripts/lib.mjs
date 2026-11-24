// 콘텐츠 파이프라인 공용 모듈: 파싱, 수식 렌더링, 검증
import fs from 'node:fs';
import path from 'node:path';
import katex from 'katex';
import { marked } from 'marked';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const CONTENT = path.join(ROOT, 'content');

export const TRACKS = ['foundations', 'engineering'];
export const DIFFICULTIES = ['입문', '중급', '심화'];
export const DEPTHS = ['L1', 'L2', 'L3', 'L4'];
export const STATUSES = ['draft', 'review', 'published'];
export const RELATION_TYPES = ['prerequisite', 'related', 'application'];
export const VIZ_NAMES = ['bigo', 'vector3d', 'ci', 'btree3d', 'embed3d'];
export const READING_RANGE = { foundations: [15, 30], engineering: [5, 15] };
// 명세 4장의 구조 중 반드시 있어야 하는 핵심 절(나머지는 해당 시 작성)
export const REQUIRED_SECTIONS = ['핵심 요약', '개념과 등장 배경', '가정·한계', '이해 확인', '선행·후속'];

/** ---json ... --- 프론트매터를 분리한다. */
export function parseArticleSource(src, file = '') {
  const m = src.match(/^---json\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: ---json 프론트매터가 없습니다`);
  let meta;
  try { meta = JSON.parse(m[1]); } catch (e) { throw new Error(`${file}: 프론트매터 JSON 오류 — ${e.message}`); }
  return { meta, body: m[2] };
}

/**
 * 수식($…$, $$…$$)을 자리표시자로 바꾼다. 코드 블록(```) 과 인라인 코드(`…`) 안은 건드리지 않는다.
 * 반환: { text, maths: [{tex, display}] }
 */
export function protectMath(md) {
  const maths = [];
  const parts = md.split(/(```[\s\S]*?```)/g);
  const out = parts.map((part) => {
    if (part.startsWith('```')) return part;
    // 인라인 코드를 잠시 치환
    const codes = [];
    let p = part.replace(/`[^`\n]+`/g, (c) => { codes.push(c); return `KXCODE${codes.length - 1}X`; });
    p = p.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => { maths.push({ tex: tex.trim(), display: true }); return `\n\nKXMATH${maths.length - 1}X\n\n`; });
    p = p.replace(/(^|[^\\$])\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\d)/g, (_, pre, tex) => { maths.push({ tex, display: false }); return `${pre}KXMATH${maths.length - 1}X`; });
    // 한국어 조사가 바로 붙는 **강조**는 CommonMark 규칙상 인식되지 않으므로 미리 <strong>으로 변환
    p = p.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    p = p.replace(/KXCODE(\d+)X/g, (_, i) => codes[+i]);
    return p;
  });
  return { text: out.join(''), maths };
}

export function renderMath({ tex, display }) {
  return katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'warn', output: 'htmlAndMathml' });
}

const slugCounter = { n: 0 };
function makeRenderer(toc) {
  const renderer = new marked.Renderer();
  renderer.heading = (text, level, raw) => {
    if (level === 2) {
      const id = `s-${toc.length + 1}`;
      toc.push({ id, text: raw.replace(/KXMATH\d+X/g, '').replace(/^\d+\.\s*/, '') });
      return `<h2 id="${id}" tabindex="-1">${text}</h2>\n`;
    }
    return `<h${level}>${text}</h${level}>\n`;
  };
  renderer.table = (header, body) => `<div class="table-wrap" tabindex="0"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>\n`;
  renderer.code = (code, lang) => {
    const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre class="code" tabindex="0"><code${lang ? ` data-lang="${lang}"` : ''}>${esc}</code></pre>\n`;
  };
  renderer.link = (href, title, text) => {
    const ext = /^https?:/.test(href);
    return `<a href="${href}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`;
  };
  return renderer;
}

export function stripTags(html) {
  return html
    .replace(/<annotation[\s\S]*?<\/annotation>/g, ' ')
    .replace(/<span class="katex-html"[\s\S]*?<\/span><\/span><\/span>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/** 마크다운 본문 → { html, toc, questions, summaryHtml, plain, vizUsed, mathCount } */
export function renderArticleBody(body, articleId) {
  const { text, maths } = protectMath(body);
  const toc = [];
  let html = marked.parse(text, { renderer: makeRenderer(toc), gfm: true, mangle: false, headerIds: false });
  const rendered = maths.map((m) => renderMath(m));
  html = html.replace(/<p>\s*KXMATH(\d+)X\s*<\/p>/g, (_, i) => `<div class="math-display">${rendered[+i]}</div>`);
  html = html.replace(/KXMATH(\d+)X/g, (_, i) => rendered[+i]);
  if (/KXMATH|KXCODE/.test(html)) throw new Error(`${articleId}: 치환되지 않은 수식 자리표시자가 남았습니다`);

  const questions = [];
  const qaRe = /<details class="qa" data-type="(\w+)"><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g;
  let m;
  while ((m = qaRe.exec(html))) {
    questions.push({ article_id: articleId, type: m[1], question: m[2].trim(), answer: m[3].trim() });
  }
  const sec1 = html.match(/<h2 id="s-1"[^>]*>[\s\S]*?<\/h2>([\s\S]*?)(?=<h2 )/);
  const vizUsed = [...body.matchAll(/data-viz="([\w-]+)"/g)].map((x) => x[1]);
  return { html, toc, questions, summaryHtml: sec1 ? sec1[1].trim() : '', plain: stripTags(html), vizUsed, mathCount: maths.length };
}

export function loadContent() {
  const graph = JSON.parse(fs.readFileSync(path.join(CONTENT, 'concepts.json'), 'utf8'));
  const roles = JSON.parse(fs.readFileSync(path.join(CONTENT, 'roles.json'), 'utf8'));
  const dir = path.join(CONTENT, 'articles');
  const articles = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const { meta, body } = parseArticleSource(src, f);
    return { file: f, meta, body };
  });
  return { graph, roles, articles };
}

/** 선행(prerequisite) 관계의 순환을 찾는다. 반환: 순환 경로 배열 */
export function detectCycles(nodes, edges, type = 'prerequisite') {
  const adj = new Map(nodes.map((n) => [n, []]));
  for (const e of edges) if (e.type === type && adj.has(e.from)) adj.get(e.from).push(e.to);
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(nodes.map((n) => [n, WHITE]));
  const stack = [];
  const cycles = [];
  const visit = (u) => {
    color.set(u, GRAY); stack.push(u);
    for (const v of adj.get(u) || []) {
      if (color.get(v) === GRAY) cycles.push([...stack.slice(stack.indexOf(v)), v]);
      else if (color.get(v) === WHITE) visit(v);
    }
    stack.pop(); color.set(u, BLACK);
  };
  for (const n of nodes) if (color.get(n) === WHITE) visit(n);
  return cycles;
}

/** 위상 정렬 깊이(선행 단계 수). 순환이 없을 때만 의미가 있다. */
export function prerequisiteDepth(nodes, edges) {
  const preds = new Map(nodes.map((n) => [n, []]));
  for (const e of edges) if (e.type === 'prerequisite' && preds.has(e.to)) preds.get(e.to).push(e.from);
  const memo = new Map();
  const depth = (n, seen = new Set()) => {
    if (memo.has(n)) return memo.get(n);
    if (seen.has(n)) return 0;
    seen.add(n);
    const d = preds.get(n).length ? 1 + Math.max(...preds.get(n).map((p) => depth(p, seen))) : 0;
    memo.set(n, d);
    return d;
  };
  return Object.fromEntries(nodes.map((n) => [n, depth(n)]));
}

/** 전체 검증. 반환: { errors: [], warnings: [], rendered: Map(id → render) } */
export function validateAll({ graph, roles, articles }) {
  const errors = [];
  const warnings = [];
  const conceptIds = new Set();
  for (const c of graph.concepts) {
    if (conceptIds.has(c.id)) errors.push(`개념 canonical_key 중복: ${c.id}`);
    conceptIds.add(c.id);
    if (!graph.disciplines[c.discipline]) errors.push(`개념 ${c.id}: 알 수 없는 학문 분류 ${c.discipline}`);
    if (!c.title_ko || !c.title_en) errors.push(`개념 ${c.id}: 한글/영문 제목 누락`);
  }
  // 별칭 충돌(서로 다른 개념이 같은 별칭을 쓰면 공고 매칭이 모호해짐)
  const aliasOwner = new Map();
  for (const c of graph.concepts) {
    for (const a of [c.title_ko, c.title_en, ...(c.aliases || [])]) {
      const k = a.toLowerCase();
      if (aliasOwner.has(k) && aliasOwner.get(k) !== c.id) warnings.push(`별칭 "${a}"가 ${aliasOwner.get(k)}와 ${c.id}에 중복`);
      aliasOwner.set(k, c.id);
    }
  }
  for (const r of graph.relations) {
    if (!conceptIds.has(r.from)) errors.push(`관계의 시작 개념 없음: ${r.from}`);
    if (!conceptIds.has(r.to)) errors.push(`관계의 끝 개념 없음: ${r.to}`);
    if (!RELATION_TYPES.includes(r.type)) errors.push(`관계 유형 오류: ${r.type}`);
    if (r.from === r.to) errors.push(`자기 자신을 가리키는 관계: ${r.from}`);
  }
  const cycles = detectCycles([...conceptIds], graph.relations);
  for (const c of cycles) errors.push(`선행 관계 순환: ${c.join(' → ')}`);

  for (const role of roles.roles) for (const cid of Object.keys(role.concepts)) {
    if (!conceptIds.has(cid)) errors.push(`역할 ${role.id}: 없는 개념 ${cid}`);
  }

  const ids = new Set();
  const scopeKeys = new Set();
  const rendered = new Map();
  const knownIds = new Set([...articles.map((a) => a.meta.id), ...graph.concepts.map((c) => c.planned_article).filter(Boolean)]);
  for (const { file, meta, body } of articles) {
    const tag = meta.id || file;
    const req = ['id', 'concept', 'track', 'title', 'title_en', 'difficulty', 'depth', 'reading_minutes', 'objectives', 'status', 'version', 'created_at', 'updated_at', 'sources'];
    const isDraft = meta.status !== 'published';
    for (const k of req) if (meta[k] === undefined || meta[k] === '' ) errors.push(`${tag}: 필드 누락 ${k}`);
    if (isDraft) { warnings.push(`${tag}: 초안(${meta.status}) — 공개되지 않으며 내용 검사는 공개 시 수행`); ids.add(meta.id); continue; }
    if (file !== `${meta.id}.md`) errors.push(`${tag}: 파일명과 id 불일치 (${file})`);
    if (ids.has(meta.id)) errors.push(`${tag}: 문서 id 중복`);
    ids.add(meta.id);
    if (!conceptIds.has(meta.concept)) errors.push(`${tag}: 없는 개념 ${meta.concept}`);
    if (!TRACKS.includes(meta.track)) errors.push(`${tag}: 트랙 오류 ${meta.track}`);
    if (!DIFFICULTIES.includes(meta.difficulty)) errors.push(`${tag}: 난이도 오류 ${meta.difficulty}`);
    if (!Array.isArray(meta.depth) || !meta.depth.every((d) => DEPTHS.includes(d))) errors.push(`${tag}: 학습 깊이 오류`);
    if (!STATUSES.includes(meta.status)) errors.push(`${tag}: 상태 오류 ${meta.status}`);
    const range = READING_RANGE[meta.track];
    if (range && (meta.reading_minutes < range[0] || meta.reading_minutes > range[1])) warnings.push(`${tag}: 읽기 시간 ${meta.reading_minutes}분이 ${meta.track} 권장 범위 ${range.join('~')}분 밖`);
    const scope = `${meta.concept}|${meta.track}|${meta.scope || 'core'}`;
    if (scopeKeys.has(scope)) errors.push(`${tag}: 같은 개념·트랙·범위의 문서가 이미 있음 (중복 생성 금지, scope 필드로 구분)`);
    scopeKeys.add(scope);
    if (meta.status === 'published' && !meta.verified_at) errors.push(`${tag}: 공개 문서에 verified_at 없음`);

    // 출처 검증
    if (!Array.isArray(meta.sources) || meta.sources.length < 2) errors.push(`${tag}: 출처 2개 이상 필요`);
    for (const s of meta.sources || []) {
      if (!s.title) errors.push(`${tag}: 제목 없는 출처`);
      if (s.url) {
        if (!/^https:\/\//.test(s.url)) errors.push(`${tag}: https가 아닌 출처 URL ${s.url}`);
        if (/example\.(com|org)|localhost|lorem/i.test(s.url)) errors.push(`${tag}: 가짜로 보이는 URL ${s.url}`);
      }
    }
    // 절 구조
    for (const sec of REQUIRED_SECTIONS) if (!new RegExp(`^## \\d+\\. .*${sec}`, 'm').test(body)) errors.push(`${tag}: 필수 절 누락 "${sec}"`);
    // 본문이 참조하는 문서 ID가 실제로 존재(또는 계획)하는지
    for (const ref of body.matchAll(/\b([A-Z]{2,6}-[A-Z]{2,6}-\d{3})\b/g)) {
      if (!knownIds.has(ref[1])) errors.push(`${tag}: 존재하지 않는 문서 ID 참조 ${ref[1]}`);
    }
    // 렌더링(수식 오류 포함)
    try {
      const r = renderArticleBody(body, meta.id);
      rendered.set(meta.id, r);
      if (r.questions.length < 3) errors.push(`${tag}: 이해 확인 문항이 3개 미만 (${r.questions.length})`);
      for (const q of r.questions) if (!/정답/.test(q.answer) || !/해설/.test(q.answer)) errors.push(`${tag}: 정답·해설이 없는 문항 — ${stripTags(q.question).slice(0, 30)}`);
      for (const v of r.vizUsed) if (!VIZ_NAMES.includes(v)) errors.push(`${tag}: 알 수 없는 시각화 ${v}`);
      if (/TODO|TBD|lorem/i.test(body)) errors.push(`${tag}: 미완성 표시(TODO/TBD) 포함`);
    } catch (e) {
      errors.push(`${tag}: 렌더링 실패 — ${e.message}`);
    }
  }
  return { errors, warnings, rendered };
}
