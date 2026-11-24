// 순수 로직(브라우저·Node 공용). UI·저장소에 의존하지 않으므로 단위 테스트 대상.

export const STATUS = {
  unread: { ko: '미학습', gap: 100 },
  reading: { ko: '읽는 중', gap: 60 },
  understood: { ko: '이해 완료', gap: 0 },
  review: { ko: '복습 필요', gap: 50 },
};
export const STATUS_KEYS = Object.keys(STATUS);
export const WEIGHTS = { relevance: 0.35, frequency: 0.25, gap: 0.25, prereq: 0.15 };

export function norm(s) {
  return String(s ?? '').normalize('NFC').toLowerCase();
}
const compact = (s) => norm(s).replace(/[\s·\-_/().,]+/g, '');

/* ---------- 검색 ---------- */
export function buildSearchIndex(articles, conceptsById) {
  return articles.map((a) => {
    const c = conceptsById[a.concept] || {};
    return {
      id: a.id,
      title: norm(`${a.title} ${a.title_en}`),
      titleC: compact(`${a.title} ${a.title_en}`),
      aliases: norm([c.title_ko, c.title_en, ...(c.aliases || [])].join(' | ')),
      aliasesC: compact((c.aliases || []).join('|')),
      tags: norm((a.tags || []).join(' ')),
      body: norm(a.plain),
      bodyC: compact(a.plain),
      rawBody: a.plain,
    };
  });
}

/** 질의 토큰마다 제목>별칭>태그>본문 순으로 가중 점수. 모든 토큰이 어딘가 있어야 결과에 포함. */
export function search(index, query) {
  const q = norm(query).trim();
  if (!q) return index.map((d) => ({ id: d.id, score: 0, snippet: '' }));
  const tokens = q.split(/\s+/).filter(Boolean);
  const out = [];
  for (const d of index) {
    let score = 0;
    let ok = true;
    let firstBodyHit = -1;
    for (const t of tokens) {
      const tc = compact(t);
      let s = 0;
      if (d.title.includes(t) || (tc && d.titleC.includes(tc))) s += 10;
      if (d.aliases.includes(t) || (tc && d.aliasesC.includes(tc))) s += 6;
      if (d.tags.includes(t)) s += 4;
      const bi = d.body.indexOf(t);
      if (bi >= 0) {
        let count = 0, pos = bi;
        while (pos >= 0 && count < 20) { count++; pos = d.body.indexOf(t, pos + t.length); }
        s += Math.min(5, 1 + Math.log2(count));
        if (firstBodyHit < 0) firstBodyHit = bi;
      } else if (tc.length >= 2 && d.bodyC.includes(tc)) {
        s += 1; // 띄어쓰기만 다른 경우(예: '코사인유사도' ↔ '코사인 유사도')
      }
      if (s === 0) { ok = false; break; }
      score += s;
    }
    if (!ok) continue;
    let snippet = '';
    if (firstBodyHit >= 0) {
      const start = Math.max(0, firstBodyHit - 40);
      snippet = (start > 0 ? '…' : '') + d.rawBody.slice(start, firstBodyHit + 80) + '…';
    }
    out.push({ id: d.id, score, snippet });
  }
  return out.sort((a, b) => b.score - a.score);
}

/* ---------- 그래프 ---------- */
export function prerequisiteDepth(conceptIds, relations) {
  const preds = new Map(conceptIds.map((n) => [n, []]));
  for (const e of relations) if (e.type === 'prerequisite' && preds.has(e.to)) preds.get(e.to).push(e.from);
  const memo = new Map();
  const depth = (n, seen) => {
    if (memo.has(n)) return memo.get(n);
    if (seen.has(n)) return 0; // 순환 방어(검증 단계에서 이미 차단됨)
    seen.add(n);
    const p = preds.get(n) || [];
    const d = p.length ? 1 + Math.max(...p.map((x) => depth(x, seen))) : 0;
    memo.set(n, d);
    return d;
  };
  return Object.fromEntries(conceptIds.map((n) => [n, depth(n, new Set())]));
}

/** 이 개념을 (직·간접) 선행으로 요구하는 개념 수 → 선행개념중요도 */
export function descendantCounts(conceptIds, relations) {
  const succ = new Map(conceptIds.map((n) => [n, []]));
  for (const e of relations) if (e.type === 'prerequisite' && succ.has(e.from)) succ.get(e.from).push(e.to);
  const res = {};
  for (const n of conceptIds) {
    const seen = new Set();
    const stack = [...succ.get(n)];
    while (stack.length) { const v = stack.pop(); if (seen.has(v)) continue; seen.add(v); stack.push(...(succ.get(v) || [])); }
    res[n] = seen.size;
  }
  return res;
}

export function neighbors(conceptId, relations) {
  const r = { prerequisites: [], next: [], related: [], applications: [], appliedFrom: [] };
  for (const e of relations) {
    if (e.type === 'prerequisite') { if (e.to === conceptId) r.prerequisites.push(e.from); if (e.from === conceptId) r.next.push(e.to); }
    else if (e.type === 'related') { if (e.to === conceptId) r.related.push(e.from); if (e.from === conceptId) r.related.push(e.to); }
    else if (e.type === 'application') { if (e.from === conceptId) r.applications.push(e.to); if (e.to === conceptId) r.appliedFrom.push(e.from); }
  }
  return r;
}

/** Foundations 커리큘럼 순서: 선행 깊이 → 학문 순서 → id */
export function curriculumOrder(articles, depthByConcept, disciplineOrder, conceptsById) {
  const dIdx = (a) => disciplineOrder.indexOf(conceptsById[a.concept]?.discipline);
  return articles
    .filter((a) => a.track === 'foundations')
    .slice()
    .sort((a, b) => (depthByConcept[a.concept] - depthByConcept[b.concept]) || (dIdx(a) - dIdx(b)) || a.id.localeCompare(b.id));
}

/* ---------- 우선순위(명세 7장) ---------- */
export function computePriorities({ concepts, relations, roles, selectedRoles, statusByConcept, evidence, manual }) {
  const ids = concepts.map((c) => c.id);
  const desc = descendantCounts(ids, relations);
  const maxDesc = Math.max(1, ...Object.values(desc));
  const active = roles.filter((r) => selectedRoles.includes(r.id));
  // 공고 빈도: 같은 공고(dedup_key)는 한 번만, 마감 공고 제외
  const postingsByConcept = {};
  const activePostings = new Set();
  for (const e of evidence) {
    if (e.posting_status === 'closed') continue;
    activePostings.add(e.dedup_key);
    (postingsByConcept[e.concept_id] ||= new Set()).add(e.dedup_key);
  }
  const totalPostings = activePostings.size;
  const rows = concepts.map((c) => {
    const relevance = active.length ? Math.max(0, ...active.map((r) => r.concepts[c.id] || 0)) : 0;
    const freqKnown = totalPostings > 0;
    const frequency = freqKnown ? Math.round(100 * (postingsByConcept[c.id]?.size || 0) / totalPostings) : null;
    const gap = STATUS[statusByConcept[c.id] || 'unread'].gap;
    const prereq = Math.round(100 * desc[c.id] / maxDesc);
    let score;
    if (frequency === null) {
      // 공고 데이터 없음: 빈도 항을 제외하고 나머지 가중치를 재정규화(화면에 '미확인' 표시)
      const w = WEIGHTS.relevance + WEIGHTS.gap + WEIGHTS.prereq;
      score = (WEIGHTS.relevance * relevance + WEIGHTS.gap * gap + WEIGHTS.prereq * prereq) / w;
    } else {
      score = WEIGHTS.relevance * relevance + WEIGHTS.frequency * frequency + WEIGHTS.gap * gap + WEIGHTS.prereq * prereq;
    }
    const manualScore = manual?.[c.id];
    const final = typeof manualScore === 'number' ? manualScore : score;
    return { concept_id: c.id, relevance, frequency, gap, prereq, score: Math.round(score * 10) / 10, manual: typeof manualScore === 'number' ? manualScore : null, final: Math.round(final * 10) / 10, evidenceCount: postingsByConcept[c.id]?.size || 0 };
  });
  return rows.sort((a, b) => b.final - a.final || a.concept_id.localeCompare(b.concept_id));
}

/* ---------- 오늘의 읽기 ---------- */
/**
 * Foundations: 커리큘럼 순서에서 '이해 완료'가 아닌 첫 문서(읽는 중이면 이어 읽기).
 * Engineering: 우선순위 점수가 가장 높은, 공개된 실무 문서 중 '이해 완료'가 아닌 것.
 */
export function pickToday({ articles, order, progress, priorities, foundationCount = 1, engineeringCount = 1 }) {
  const st = (id) => progress[id]?.status || 'unread';
  const foundations = [];
  for (const a of order) {
    if (foundations.length >= foundationCount) break;
    if (st(a.id) !== 'understood') foundations.push({ article: a, reason: st(a.id) === 'reading' ? '이어 읽기' : (st(a.id) === 'review' ? '복습 필요로 표시됨' : '커리큘럼 순서상 다음') });
  }
  const rank = Object.fromEntries(priorities.map((p, i) => [p.concept_id, { i, p }]));
  const eng = articles
    .filter((a) => a.track === 'engineering' && st(a.id) !== 'understood')
    .sort((a, b) => (rank[a.concept]?.i ?? 999) - (rank[b.concept]?.i ?? 999))
    .slice(0, engineeringCount)
    .map((a) => ({ article: a, reason: rank[a.concept] ? `우선순위 점수 ${rank[a.concept].p.final}` : '우선순위 정보 없음' }));
  return { foundations, engineering: eng };
}

export function weeklyReview({ articles, progress, now = new Date(), days = 7 }) {
  const since = now.getTime() - days * 86400000;
  return articles.filter((a) => {
    const p = progress[a.id];
    if (!p) return false;
    if (p.status === 'review') return true;
    if (p.review_due_at && Date.parse(p.review_due_at) <= now.getTime()) return true;
    return p.last_read_at && Date.parse(p.last_read_at) >= since;
  });
}

/* ---------- 채용공고 근거 매칭 ---------- */
const REQ_HEAD = /(자격\s*요건|필수|지원\s*자격|requirements?|qualifications?|must[\s-]have|what you.?ll need)/i;
const PREF_HEAD = /(우대|preferred|nice[\s-]to[\s-]have|bonus|plus)/i;
const OTHER_HEAD = /(주요\s*업무|담당\s*업무|업무\s*내용|responsibilit|what you.?ll do|복지|혜택|benefits|회사\s*소개|about us)/i;

function aliasRegex(alias) {
  const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 영문·숫자 별칭은 단어 경계 필요(예: "AX"가 "MAX"에 걸리지 않게). 한글은 부분 일치.
  return /^[\x00-\x7F]+$/.test(alias) ? new RegExp(`(^|[^A-Za-z0-9])${esc}(?![A-Za-z0-9])`, alias.length <= 4 ? '' : 'i') : new RegExp(esc, 'i');
}

export function matchJobText(text, concepts) {
  const lines = String(text).split(/\r?\n/);
  let section = 'unknown';
  const best = new Map();
  const rankOf = { required: 3, preferred: 2, unknown: 1 };
  const matchers = concepts.map((c) => ({ c, res: [c.title_ko, c.title_en, ...(c.aliases || [])].filter((a) => a && a.length >= 2).map((a) => ({ a, re: aliasRegex(a) })) }));
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const isHeading = line.length <= 40 && !/[.。]$/.test(line) && !/^[-*•·▪]|^\d+[.)]/.test(line); // 글머리표 줄은 제목이 아님
    if (isHeading && PREF_HEAD.test(line)) { section = 'preferred'; continue; }
    if (isHeading && REQ_HEAD.test(line)) { section = 'required'; continue; }
    if (isHeading && OTHER_HEAD.test(line)) { section = 'unknown'; continue; }
    // 같은 줄에서 모든 별칭 일치 위치를 모은 뒤, 다른 개념의 더 긴 일치 안에 포함된 짧은 일치는 버린다
    // (예: "쿼리 최적화"의 "최적화", "Knowledge Graph"의 "Graph")
    const hits = [];
    for (const { c, res } of matchers) {
      for (const { a, re } of res) {
        const m = re.exec(line);
        if (!m) continue;
        const start = m.index + (m[1] && /^[\x00-\x7F]+$/.test(a) ? m[1].length : 0);
        hits.push({ c, a, start, end: start + a.length });
      }
    }
    const kept = hits.filter((x) => !hits.some((y) => y.c.id !== x.c.id && y.end - y.start > x.end - x.start && y.start <= x.start && x.end <= y.end));
    const seen = new Set();
    for (const { c, a } of kept.sort((x, y) => (y.end - y.start) - (x.end - x.start))) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const prev = best.get(c.id);
      if (!prev || rankOf[section] > rankOf[prev.requirement_type]) {
        best.set(c.id, { concept_id: c.id, alias: a, requirement_type: section, evidence_text: line.slice(0, 200) });
      }
    }
  }
  return [...best.values()];
}

export function dedupKey({ company, title, text }) {
  const k = compact(`${company || ''}|${title || ''}`);
  if (k.length > 2) return `p:${k}`;
  // 회사·제목이 없으면 본문 해시(FNV-1a)
  let h = 0x811c9dc5;
  for (const ch of compact(text || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return `t:${h.toString(16)}`;
}

/* ---------- 검색 평가 지표(AI-RAG-001) ---------- */
export function irMetrics(ranking, relevant, k) {
  const rel = new Set(relevant);
  const top = ranking.slice(0, k);
  const hits = top.filter((d) => rel.has(d)).length;
  const firstIdx = ranking.findIndex((d) => rel.has(d));
  let dcg = 0;
  top.forEach((d, i) => { if (rel.has(d)) dcg += 1 / Math.log2(i + 2); });
  let idcg = 0;
  for (let i = 0; i < Math.min(rel.size, k); i++) idcg += 1 / Math.log2(i + 2);
  return {
    precision: k ? hits / k : 0,
    recall: rel.size ? hits / rel.size : 0,
    rr: firstIdx >= 0 ? 1 / (firstIdx + 1) : 0,
    dcg, idcg,
    ndcg: idcg ? dcg / idcg : 0,
  };
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return NaN;
  return dot / Math.sqrt(na * nb);
}

/* ---------- 통계(STAT-INF-001) ---------- */
/** 표준정규 분위수(Acklam 근사, 상대오차 < 1.2e-9) */
export function zQuantile(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) return -zQuantile(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** t 분포 분위수: Cornish–Fisher 전개(Abramowitz & Stegun 26.7.5). 자유도 4 이상에서 소수 둘째 자리 정확. */
export function tQuantile(p, df) {
  const z = zQuantile(p);
  const z3 = z ** 3, z5 = z ** 5, z7 = z ** 7, z9 = z ** 9;
  const g1 = (z3 + z) / 4;
  const g2 = (5 * z5 + 16 * z3 + 3 * z) / 96;
  const g3 = (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / 384;
  const g4 = (79 * z9 + 776 * z7 + 1482 * z5 - 1920 * z3 - 945 * z) / 92160;
  return z + g1 / df + g2 / df ** 2 + g3 / df ** 3 + g4 / df ** 4;
}

/** 재현 가능한 난수(mulberry32) */
export function rng(seed) {
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
export function normalSampler(rand) {
  return () => { let u = 0; while (u === 0) u = rand(); const v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
}

/* ---------- B-Tree(DE-DB-001 시각화용) ---------- */
export class BTree {
  constructor(maxKeys = 3) { this.maxKeys = maxKeys; this.root = { keys: [], children: [] }; this.log = []; }
  get height() { let h = 1, n = this.root; while (n.children.length) { h++; n = n.children[0]; } return h; }
  search(key) {
    const path = [];
    let n = this.root;
    while (n) {
      path.push(n);
      let i = 0;
      while (i < n.keys.length && key > n.keys[i]) i++;
      if (i < n.keys.length && n.keys[i] === key) return { found: true, path, node: n };
      if (!n.children.length) return { found: false, path, node: n };
      n = n.children[i];
    }
    return { found: false, path };
  }
  insert(key) {
    if (this.search(key).found) { this.log.push(`${key}: 이미 있는 키라 삽입하지 않음`); return false; }
    const path = [];
    let n = this.root;
    while (n.children.length) {
      let i = 0; while (i < n.keys.length && key > n.keys[i]) i++;
      path.push({ node: n, idx: i });
      n = n.children[i];
    }
    let i = 0; while (i < n.keys.length && key > n.keys[i]) i++;
    n.keys.splice(i, 0, key);
    const msgs = [`${key} 삽입 → 리프 [${n.keys.join(' ')}]`];
    // 넘치면 위로 분할 전파
    while (n.keys.length > this.maxKeys) {
      const mid = Math.floor(n.keys.length / 2);
      const up = n.keys[mid];
      const right = { keys: n.keys.slice(mid + 1), children: n.children.slice(mid + 1) };
      n.keys = n.keys.slice(0, mid);
      n.children = n.children.slice(0, mid + 1);
      msgs.push(`초과 → ${up}을(를) 부모로 올리고 [${n.keys.join(' ')}] | [${right.keys.join(' ')}]로 분할`);
      const parent = path.pop();
      if (!parent) {
        this.root = { keys: [up], children: [n, right] };
        msgs.push(`루트 분할 → 새 루트 [${up}], 높이 ${this.height}`);
        break;
      }
      parent.node.keys.splice(parent.idx, 0, up);
      parent.node.children.splice(parent.idx + 1, 0, right);
      n = parent.node;
    }
    this.log.push(msgs.join(' · '));
    return true;
  }
  /** 검증용: 모든 리프 깊이 동일, 노드 내 정렬, 키 수 제한 */
  check() {
    const depths = new Set();
    const walk = (n, d, lo, hi) => {
      if (n !== this.root && (n.keys.length < 1 || n.keys.length > this.maxKeys)) return false;
      for (let i = 0; i < n.keys.length; i++) { if ((lo !== null && n.keys[i] <= lo) || (hi !== null && n.keys[i] >= hi)) return false; if (i && n.keys[i] <= n.keys[i - 1]) return false; }
      if (!n.children.length) { depths.add(d); return true; }
      if (n.children.length !== n.keys.length + 1) return false;
      return n.children.every((c, i) => walk(c, d + 1, i === 0 ? lo : n.keys[i - 1], i === n.keys.length ? hi : n.keys[i]));
    };
    return walk(this.root, 0, null, null) && depths.size === 1;
  }
}

/* ---------- 날짜 ---------- */
export function dateInTZ(date, timeZone) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  const parts = Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]));
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, weekday: wd };
}

/* ---------- 간격 복습(Leitner 방식) ---------- */
// 상자 0~4, 각 상자의 다음 복습 간격(일). 맞히면 한 칸 올라가고, 틀리면 0으로, 헷갈리면 제자리에서 하루 뒤 다시.
export const SRS_INTERVALS = [1, 3, 7, 21, 60];
export const GRADE_KO = { good: '맞힘', hard: '헷갈림', again: '틀림' };
export function gradeCard(card, grade, now = new Date()) {
  const c = card ? { ...card } : { box: 0, reps: 0, lapses: 0 };
  let days;
  if (grade === 'good') { c.box = card ? Math.min(c.box + 1, SRS_INTERVALS.length - 1) : 1; days = SRS_INTERVALS[c.box]; }
  else if (grade === 'hard') { days = 1; }
  else if (grade === 'again') { c.box = 0; c.lapses = (c.lapses || 0) + 1; days = 1; }
  else throw new Error(`알 수 없는 채점 ${grade}`);
  c.reps = (c.reps || 0) + 1;
  c.last = grade;
  c.graded_at = now.toISOString();
  c.due = new Date(now.getTime() + days * 86400000).toISOString();
  return c;
}
export function dueCards(cards, now = new Date()) {
  return Object.entries(cards || {})
    .filter(([, c]) => c && c.due && Date.parse(c.due) <= now.getTime())
    .sort((a, b) => a[1].due.localeCompare(b[1].due))
    .map(([qid]) => qid);
}
/** 설명집 하나의 문항 통계 */
export function quizStats(qids, cards) {
  let graded = 0, mastered = 0;
  for (const q of qids) {
    const c = cards?.[q];
    if (!c) continue;
    graded++;
    if (c.last === 'good') mastered++;
  }
  return { total: qids.length, graded, mastered };
}
