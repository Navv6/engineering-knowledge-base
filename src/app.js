// UI 계층. 빌드 시 core.js, store.js, viz.js와 하나의 모듈로 합쳐진다.
import { STATUS, STATUS_KEYS, WEIGHTS, buildSearchIndex, search, prerequisiteDepth, neighbors, curriculumOrder, computePriorities, pickToday, weeklyReview, matchJobText, dedupKey, dateInTZ } from './core.js';
import { createStore, sanitizeState, emptyState } from './store.js';
import { mountViz, mountKnowledgeMap, DISCIPLINE_COLOR } from './viz.js';

const KB = JSON.parse(document.getElementById('kb-data').textContent);
const ARTICLES = KB.articles.filter((a) => a.status === 'published');
const ART = Object.fromEntries(ARTICLES.map((a) => [a.id, a]));
const CON = Object.fromEntries(KB.concepts.map((c) => [c.id, c]));
const ART_BY_CONCEPT = {};
for (const a of ARTICLES) (ART_BY_CONCEPT[a.concept] ||= []).push(a);
const FIRST_ART = Object.fromEntries(Object.entries(ART_BY_CONCEPT).map(([k, v]) => [k, v[0]]));
const DISC_ORDER = Object.keys(KB.disciplines);
const DEPTH = prerequisiteDepth(KB.concepts.map((c) => c.id), KB.relations);
const ORDER = curriculumOrder(ARTICLES, DEPTH, DISC_ORDER, CON);
const INDEX = buildSearchIndex(ARTICLES, CON);
const FOUNDATION_DISC = ['CS', 'MATH', 'STAT', 'OR'];
const TYPE_KO = { concept: '개념 설명형', judgment: '선택 근거형', applied: '실무 응용형' };
const TRACK_KO = { foundations: 'Foundations', engineering: 'Engineering' };
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const main = $('#main');

const store = createStore(() => { renderStorageBadge(); });
let disposers = [];
let routeToken = 0;
const cleanup = () => {
  routeToken++; disposers.forEach((d) => { try { d(); } catch (e) { console.warn(e); } }); disposers = []; };

/* ---------- 공통 조각 ---------- */
const prog = (id) => store.state.progress[id] || { status: 'unread', bookmarked: false, notes: '', last_read_at: null, review_due_at: null };
const statusByConcept = () => {
  const r = {};
  for (const c of KB.concepts) {
    const arts = ART_BY_CONCEPT[c.id];
    if (!arts) continue;
    const sts = arts.map((a) => prog(a.id).status);
    r[c.id] = sts.includes('understood') ? 'understood' : sts.includes('review') ? 'review' : sts.includes('reading') ? 'reading' : 'unread';
  }
  return r;
};
const priorities = () => computePriorities({ concepts: KB.concepts, relations: KB.relations, roles: KB.roles, selectedRoles: store.state.settings.selected_roles, statusByConcept: statusByConcept(), evidence: store.state.evidence, manual: store.state.manualPriority });

function setProgress(id, patch) {
  store.update((s) => {
    const cur = s.progress[id] || { status: 'unread', bookmarked: false, notes: '', last_read_at: null, review_due_at: null };
    s.progress[id] = { ...cur, ...patch, updated_at: new Date().toISOString() };
  });
}
const discChip = (d) => `<span class="chip disc" style="--dc:var(${DISCIPLINE_COLOR[d]})">${esc(KB.disciplines[d]?.ko || d)}</span>`;
const statusPill = (st) => `<span class="pill st-${st}">${STATUS[st].ko}</span>`;
const minutes = (a) => `<span class="chip mono">${a.reading_minutes}분</span>`;
const conceptLink = (cid) => {
  const c = CON[cid]; if (!c) return esc(cid);
  const a = FIRST_ART[cid];
  return a ? `<a href="#a-${a.id}">${esc(c.title_ko)}</a>` : `<span class="planned" title="아직 작성·검증되지 않은 개념">${esc(c.title_ko)} <small>준비 중</small></span>`;
};

function articleCard(a, { reason = '', snippet = '', query = '' } = {}) {
  const p = prog(a.id); const c = CON[a.concept];
  let snip = '';
  if (snippet) {
    let s = esc(snippet);
    for (const t of query.trim().split(/\s+/).filter((x) => x.length >= 1)) s = s.replace(new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`);
    snip = `<p class="snippet">${s}</p>`;
  }
  return `<article class="card">
    <div class="card-top"><span class="mono id">${a.id}</span>${statusPill(p.status)}${p.bookmarked ? '<span class="bm" title="북마크">★</span>' : ''}</div>
    <h3><a href="#a-${a.id}">${esc(a.title)}</a></h3>
    <p class="en">${esc(a.title_en)}</p>
    <div class="chips">${discChip(c.discipline)}<span class="chip">${TRACK_KO[a.track]}</span><span class="chip">${a.difficulty}</span><span class="chip mono">${a.depth.join('·')}</span>${minutes(a)}</div>
    ${reason ? `<p class="reason">${esc(reason)}</p>` : ''}${snip}
  </article>`;
}

/* ---------- 자동화 상태(content/automation.json, content/runs/*.json) ---------- */
const AUTO = KB.automation || { status: 'not_connected' };
const RUNS = KB.runs || [];
const RUN_KO = { success: '성공', partial: '부분 성공', failed: '실패', skipped: '건너뜀' };
const autoPill = () => (AUTO.status === 'connected' ? '<span class="pill ok">연동됨</span>' : '<span class="pill warn">미연동</span>');
const autoText = () => AUTO.status === 'connected'
  ? `<p class="small">예약 실행: <b>${esc(AUTO.schedule_text)}</b> · 회당 기초 ${AUTO.per_run?.foundations ?? 1}편, 실무 ${AUTO.per_run?.engineering ?? 1}편. 실행마다 다음 개념을 골라 설명집을 쓰고, 검증 게이트와 테스트를 통과한 것만 이 페이지에 추가합니다. 실패한 초안은 공개하지 않고 기록만 남깁니다. 시각·분량·중지 변경은 Claude에게 요청하세요(예약 작업 설정을 바꿉니다).</p>`
  : '<p class="muted small">새 설명집을 작성·검증·배포하는 예약 실행이 연결되어 있지 않습니다. Claude에게 다음 설명집 작성을 요청하면 검증을 통과한 문서만 배포합니다.</p>';
function runsTable(n) {
  if (!RUNS.length) return '<p class="muted small">실행 기록(RefreshRun): 아직 없음</p>';
  const name = (id) => (ART[id] ? `<a href="#a-${id}">${esc(ART[id].title)}</a>` : esc(id));
  return `<div class="table-wrap"><table class="data"><caption>최근 실행 기록</caption><thead><tr><th>시작(UTC)</th><th>결과</th><th>공개</th><th>초안·건너뜀</th></tr></thead><tbody>${RUNS.slice(0, n).map((r) => `<tr><td class="mono small">${esc(String(r.started_at || '').slice(0, 16).replace('T', ' '))}</td><td><span class="pill ${r.status === 'success' ? 'ok' : r.status === 'failed' ? 'warn' : 'ghost'}">${RUN_KO[r.status] || esc(r.status)}</span></td><td>${(r.created || []).map(name).join(', ') || '—'}</td><td class="small">${[...(r.drafts || []).map((d) => `${esc(d)}(초안)`), ...(r.skipped || []).map((x) => `${esc(x.concept || '')}: ${esc(x.reason || '')}`), ...(r.errors || []).map((e) => `오류: ${esc(e)}`)].join('<br>') || '—'}</td></tr>`).join('')}</tbody></table></div>`;
}

/* ---------- 화면: 오늘의 읽기 ---------- */
function viewToday() {
  const st = store.state.settings;
  const now = new Date();
  const { ymd, weekday } = dateInTZ(now, st.timezone);
  const pr = priorities();
  const pick = pickToday({ articles: ARTICLES, order: ORDER, progress: store.state.progress, priorities: pr, foundationCount: st.daily_foundation_count, engineeringCount: st.daily_engineering_count });
  const reading = ARTICLES.filter((a) => prog(a.id).status === 'reading').sort((a, b) => (prog(b.id).last_read_at || '').localeCompare(prog(a.id).last_read_at || ''));
  const review = weeklyReview({ articles: ARTICLES, progress: store.state.progress, now });
  const isReviewDay = weekday === st.weekly_review_day;
  const done = ARTICLES.filter((a) => prog(a.id).status === 'understood').length;
  const plannedF = KB.concepts.filter((c) => !FIRST_ART[c.id] && FOUNDATION_DISC.includes(c.discipline)).sort((a, b) => DEPTH[a.id] - DEPTH[b.id]).slice(0, 3);
  const plannedE = pr.filter((r) => !FIRST_ART[r.concept_id] && !FOUNDATION_DISC.includes(CON[r.concept_id].discipline)).slice(0, 3);
  const emptyF = !pick.foundations.length ? '<p class="empty">공개된 기초 설명집을 모두 이해 완료로 표시했습니다. 새 설명집이 추가되면 여기에 나타납니다.</p>' : '';
  const emptyE = !pick.engineering.length ? '<p class="empty">공개된 실무 설명집을 모두 이해 완료로 표시했습니다.</p>' : '';
  return `
  <header class="page-head">
    <p class="eyebrow mono">${ymd} (${DAYS[weekday]}) · ${esc(st.timezone)}</p>
    <h1>오늘의 읽기</h1>
    <p class="lede">기초 학문 ${st.daily_foundation_count}편과 실무 기술 ${st.daily_engineering_count}편을 각자의 순서로 고릅니다. 공개 설명집 ${ARTICLES.length}편 중 ${done}편을 이해 완료로 표시했습니다.</p>
  </header>
  ${(() => { const last = RUNS.find((r) => (r.created || []).length); return last ? `<p class="new-banner">최근 추가 <span class="mono">${esc(String(last.started_at).slice(0, 10))}</span> · ${last.created.filter((id) => ART[id]).map((id) => `<a href="#a-${id}">${esc(ART[id].title)}</a>`).join(', ')}</p>` : ''; })()}
  <section class="today-grid" aria-label="오늘의 추천">
    <div class="lane"><h2 class="lane-h">Foundations <small>선행 관계 순서</small></h2>${pick.foundations.map((x) => articleCard(x.article, { reason: x.reason })).join('')}${emptyF}</div>
    <div class="lane"><h2 class="lane-h">Engineering <small>직무·공고 우선순위</small></h2>${pick.engineering.map((x) => articleCard(x.article, { reason: x.reason })).join('')}${emptyE}</div>
  </section>
  ${reading.length ? `<section><h2>이어 읽기</h2><ul class="list">${reading.map((a) => `<li><a href="#a-${a.id}">${esc(a.title)}</a> <span class="muted">마지막으로 읽은 시각 ${new Date(prog(a.id).last_read_at || Date.now()).toLocaleString('ko-KR')}</span></li>`).join('')}</ul></section>` : ''}
  <section class="review ${isReviewDay ? 'is-day' : ''}">
    <h2>주간 복습 <small>${isReviewDay ? '오늘이 복습 요일입니다' : `복습 요일: ${DAYS[st.weekly_review_day]}요일`}</small></h2>
    ${review.length ? review.map((a) => `<details class="review-item"><summary><span class="mono id">${a.id}</span> ${esc(a.title)} ${statusPill(prog(a.id).status)}</summary><div class="prose small">${a.summaryHtml}</div><p><a href="#a-${a.id}">설명집 열기</a> · 연결: ${neighbors(a.concept, KB.relations).next.map(conceptLink).join(', ') || '없음'}</p></details>`).join('') : '<p class="empty">최근 7일 안에 읽었거나 복습 필요로 표시한 설명집이 없습니다. 설명집을 열면 읽은 기록이 남고, 여기에서 핵심 요약과 다음 개념 연결을 다시 볼 수 있습니다.</p>'}
  </section>
  <section class="queue">
    <h2>다음 설명집 후보 <small>아직 작성되지 않음</small></h2>
    <p class="muted">${AUTO.status === 'connected' ? `예약 실행(${esc(AUTO.schedule_text)})이 이 순서를 참고해 다음 설명집을 쓰고, 검증을 통과하면 위 추천에 포함됩니다.` : '자동 생성은 연결되어 있지 않습니다. 아래는 선행 관계와 우선순위로 계산한 다음 작성 순서입니다.'}</p>
    <div class="queue-cols"><ol>${plannedF.map((c) => `<li>${esc(c.title_ko)} <span class="mono muted">${c.planned_article || ''}</span></li>`).join('')}</ol><ol>${plannedE.map((r) => `<li>${esc(CON[r.concept_id].title_ko)} <span class="mono muted">${CON[r.concept_id].planned_article || ''} · ${r.final}점</span></li>`).join('')}</ol></div>
  </section>`;
}

/* ---------- 화면: Foundations / Engineering ---------- */
function curriculumBlock(disc) {
  const cs = KB.concepts.filter((c) => c.discipline === disc).sort((a, b) => DEPTH[a.id] - DEPTH[b.id] || a.title_ko.localeCompare(b.title_ko, 'ko'));
  if (!cs.length) return '';
  return `<section class="disc-block"><h2>${discChip(disc)} ${esc(KB.disciplines[disc].en)}</h2><ol class="steps">${cs.map((c) => {
    const a = FIRST_ART[c.id]; const nb = neighbors(c.id, KB.relations);
    return `<li class="${a ? 'has' : 'planned-step'}"><span class="depth mono" title="선행 깊이">D${DEPTH[c.id]}</span><div>${a ? `<a href="#a-${a.id}">${esc(c.title_ko)}</a> ${statusPill(prog(a.id).status)} ${minutes(a)}` : `${esc(c.title_ko)} <small class="muted">준비 중${c.planned_article ? ` · ${c.planned_article}` : ''}</small>`}
      ${nb.prerequisites.length ? `<p class="muted small">선행: ${nb.prerequisites.map(conceptLink).join(', ')}</p>` : ''}</div></li>`;
  }).join('')}</ol></section>`;
}
function viewFoundations() {
  return `<header class="page-head"><h1>Foundations</h1><p class="lede">채용 빈도와 무관하게 꾸준히 쌓아야 하는 기초 학문입니다. D 숫자는 선행 깊이(먼저 알아야 할 개념이 몇 단계 있는지)이며, 낮은 단계부터 읽도록 정렬했습니다.</p></header>
  <h2 class="sr-only">커리큘럼 순서</h2><ol class="order-strip">${ORDER.map((a, i) => `<li><a href="#a-${a.id}"><span class="mono">${i + 1}</span> ${esc(a.title)}</a>${statusPill(prog(a.id).status)}</li>`).join('')}</ol>
  ${FOUNDATION_DISC.map(curriculumBlock).join('')}`;
}
function viewEngineering() {
  const pr = priorities();
  const roles = store.state.settings.selected_roles;
  const rows = pr.filter((r) => !FOUNDATION_DISC.includes(CON[r.concept_id].discipline));
  return `<header class="page-head"><h1>Engineering</h1><p class="lede">실무 기술과 목표 직무 요구 역량입니다. 선택한 직무(${roles.length ? KB.roles.filter((r) => roles.includes(r.id)).map((r) => esc(r.name)).join(', ') : '없음'})의 관련성, 수집한 공고 근거, 학습 상태로 정렬했습니다. 직무 선택은 Skill Gap 화면에서 바꿉니다.</p></header>
  <div class="cards">${ARTICLES.filter((a) => a.track === 'engineering').map((a) => articleCard(a, { reason: `우선순위 ${pr.find((r) => r.concept_id === a.concept)?.final ?? '—'}점` })).join('')}</div>
  <section><h2>전체 실무 개념</h2><div class="table-wrap"><table class="data"><thead><tr><th>개념</th><th>분야</th><th class="num">우선순위</th><th class="num">공고 근거</th><th>설명집</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${conceptLink(r.concept_id)}</td><td>${discChip(CON[r.concept_id].discipline)}</td><td class="num">${r.final}</td><td class="num">${r.frequency === null ? '<span class="muted">미확인</span>' : `${r.evidenceCount}건`}</td><td>${FIRST_ART[r.concept_id] ? statusPill(prog(FIRST_ART[r.concept_id].id).status) : '<span class="muted">준비 중</span>'}</td></tr>`).join('')}</tbody></table></div></section>`;
}

/* ---------- 화면: 설명집 상세 ---------- */
function viewArticle(id) {
  const a = ART[id];
  if (!a) return `<header class="page-head"><h1>설명집을 찾을 수 없습니다</h1><p class="lede">${esc(id)}는 아직 공개되지 않았거나 존재하지 않는 ID입니다. <a href="#library">Library</a>에서 검색해 보세요.</p></header>`;
  const c = CON[a.concept]; const p = prog(id); const nb = neighbors(a.concept, KB.relations);
  const seq = a.track === 'foundations' ? ORDER : ARTICLES.filter((x) => x.track === a.track);
  const i = seq.findIndex((x) => x.id === id); const prev = seq[i - 1], next = seq[i + 1];
  const srcV = KB.sourceChecks || {};
  const relBlock = (label, list) => list.length ? `<div><h3>${label}</h3><ul>${list.map((x) => `<li>${conceptLink(x)}</li>`).join('')}</ul></div>` : '';
  return `<article class="article" data-id="${a.id}">
  <header class="art-head">
    <p class="eyebrow mono">${a.id} · ${TRACK_KO[a.track]} · ${esc(KB.disciplines[c.discipline].en)}</p>
    <h1>${esc(a.title)}</h1>
    <p class="en">${esc(a.title_en)}</p>
    <div class="chips">${discChip(c.discipline)}<span class="chip">${a.difficulty}</span><span class="chip mono" title="학습 깊이 L1 개념 · L2 원리 · L3 판단 · L4 응용">${a.depth.join('·')}</span>${minutes(a)}<span class="chip mono">v${a.version} · 검증 ${a.verified_at}</span></div>
  </header>
  <section class="learn-card" aria-label="학습 정보">
    <div><h2>학습 목표</h2><ul>${a.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>
    <div><h2>선행 지식</h2><ul>${(a.prerequisites || []).map((o) => `<li>${esc(o)}</li>`).join('')}</ul><h2>관련 직무</h2><p>${(a.roles || []).map(esc).join(', ')}</p></div>
  </section>
  <section class="progress-bar" aria-label="내 학습 상태">
    <fieldset class="seg"><legend>학습 상태</legend>${STATUS_KEYS.map((k) => `<label><input type="radio" name="st" value="${k}" ${p.status === k ? 'checked' : ''}><span>${STATUS[k].ko}</span></label>`).join('')}</fieldset>
    <button type="button" class="btn ${p.bookmarked ? 'on' : ''}" id="bm-btn" aria-pressed="${p.bookmarked}">${p.bookmarked ? '★ 북마크됨' : '☆ 북마크'}</button>
    <label class="inline" for="review-sel">복습 예약 <select id="review-sel"><option value="">없음</option><option value="3">3일 후</option><option value="7">7일 후</option><option value="14">14일 후</option></select></label>
    <span class="muted small" id="review-info">${p.review_due_at ? `예약됨: ${new Date(p.review_due_at).toLocaleDateString('ko-KR')}` : ''}</span>
  </section>
  <div class="art-layout">
    <nav class="toc" aria-label="목차"><details open><summary>목차</summary><ol>${a.toc.map((t) => `<li><a href="#a-${a.id}" data-target="${t.id}">${esc(t.text)}</a></li>`).join('')}</ol></details></nav>
    <div class="prose" id="prose">${a.html}</div>
  </div>
  <section class="sources" aria-labelledby="src-h"><h2 id="src-h">참고 자료 및 검증</h2><ol>${a.sources.map((s) => {
    const chk = s.url ? srcV[s.url] : null;
    const badge = !s.url ? '<span class="pill ghost">서지 정보</span>' : chk?.ok ? `<span class="pill ok" title="${esc(chk.note || '')}">링크 확인 ${esc(chk.date)}</span>` : '<span class="pill warn">링크 미확인</span>';
    return `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>` : esc(s.title)} <span class="chip">${esc(s.source_type)}</span> ${badge}</li>`;
  }).join('')}</ol><p class="muted small">서지 정보는 교재·논문의 출판 정보이며 URL을 만들어 넣지 않았습니다. 링크 확인 표시는 해당 날짜에 페이지가 열리고 제목이 일치함을 확인했다는 뜻입니다.</p></section>
  <section class="relations" aria-label="관련 개념"><h2>개념 연결</h2><div class="rel-grid">${relBlock('선행 개념', nb.prerequisites)}${relBlock('후속 개념', nb.next)}${relBlock('응용되는 곳', nb.applications)}${relBlock('이 개념에 기반', nb.appliedFrom)}${relBlock('관련 개념', nb.related)}</div></section>
  <section class="notes"><h2><label for="notes">내 메모</label></h2><textarea id="notes" rows="4" placeholder="내 언어로 요약하거나, 면접에서 말할 문장을 적어 두세요."></textarea><p class="muted small" id="notes-state" aria-live="polite"></p></section>
  <nav class="pager" aria-label="이전·다음 학습">${prev ? `<a href="#a-${prev.id}" class="prev">← ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a href="#a-${next.id}" class="next">${esc(next.title)} →</a>` : '<span></span>'}</nav>
  </article>`;
}
function wireArticle(id) {
  const a = ART[id]; if (!a) return;
  // 읽기 기록(상태는 바꾸지 않음: 사용자가 직접 변경)
  store.update((s) => {
    const cur = s.progress[id] || { status: 'unread', bookmarked: false, notes: '', last_read_at: null, review_due_at: null };
    s.progress[id] = { ...cur, last_read_at: new Date().toISOString() };
    const last = s.readLog[s.readLog.length - 1];
    if (!last || last.id !== id || Date.now() - Date.parse(last.at) > 30 * 60000) s.readLog.push({ id, at: new Date().toISOString() });
    s.readLog = s.readLog.slice(-300);
  });
  main.querySelectorAll('input[name="st"]').forEach((r) => r.addEventListener('change', () => { setProgress(id, { status: r.value }); }));
  $('#bm-btn').addEventListener('click', (e) => { const on = !prog(id).bookmarked; setProgress(id, { bookmarked: on }); e.currentTarget.classList.toggle('on', on); e.currentTarget.setAttribute('aria-pressed', on); e.currentTarget.textContent = on ? '★ 북마크됨' : '☆ 북마크'; });
  $('#review-sel').addEventListener('change', (e) => { const d = Number(e.target.value); const due = d ? new Date(Date.now() + d * 86400000).toISOString() : null; setProgress(id, { review_due_at: due }); $('#review-info').textContent = due ? `예약됨: ${new Date(due).toLocaleDateString('ko-KR')}` : ''; });
  const ta = $('#notes'); ta.value = prog(id).notes || '';
  let t; ta.addEventListener('input', () => { clearTimeout(t); $('#notes-state').textContent = '입력 중…'; t = setTimeout(() => { setProgress(id, { notes: ta.value.slice(0, 5000) }); $('#notes-state').textContent = '저장됨'; }, 600); });
  main.querySelectorAll('.toc a[data-target]').forEach((l) => l.addEventListener('click', (e) => { e.preventDefault(); const el = document.getElementById(l.dataset.target); el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); el?.focus({ preventScroll: true }); }));
  // 시각화: 화면 가까이 왔을 때만 로드
  const io = new IntersectionObserver((ents) => {
    for (const en of ents) if (en.isIntersecting) { io.unobserve(en.target); const tok = routeToken; mountViz(en.target).then((v) => { if (tok !== routeToken) v.dispose(); else disposers.push(() => v.dispose()); }); }
  }, { rootMargin: '300px' });
  main.querySelectorAll('.viz[data-viz]').forEach((el) => { el.innerHTML = '<p class="viz-loading">시각화를 불러오는 중…</p>'; io.observe(el); });
  disposers.push(() => io.disconnect());
}

/* ---------- 화면: Library ---------- */
const libState = { q: '', disc: '', track: '', diff: '', mins: '', role: '', status: '', bm: false, sort: 'relevance' };
function viewLibrary() {
  const opt = (v, t, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(t)}</option>`;
  const roleNames = [...new Set(ARTICLES.flatMap((a) => a.roles || []))];
  return `<header class="page-head"><h1>Library</h1><p class="lede">공개된 설명집 전체입니다. 한글·영문 제목, 별칭, 태그, 본문을 검색합니다. 띄어쓰기는 달라도 찾습니다.</p></header>
  <form class="filters" id="lib-form" role="search">
    <label class="grow" for="lib-q"><span class="sr-only">검색어</span><input id="lib-q" type="search" placeholder="예: 신뢰구간, cosine, B-Tree, 인덱스" value="${esc(libState.q)}" autocomplete="off"></label>
    <select id="lib-disc" aria-label="학문">${opt('', '모든 학문', libState.disc)}${DISC_ORDER.map((d) => opt(d, KB.disciplines[d].ko, libState.disc)).join('')}</select>
    <select id="lib-track" aria-label="트랙">${opt('', '모든 트랙', libState.track)}${opt('foundations', 'Foundations', libState.track)}${opt('engineering', 'Engineering', libState.track)}</select>
    <select id="lib-diff" aria-label="난이도">${opt('', '모든 난이도', libState.diff)}${['입문', '중급', '심화'].map((d) => opt(d, d, libState.diff)).join('')}</select>
    <select id="lib-mins" aria-label="읽기 시간">${opt('', '모든 분량', libState.mins)}${opt('15', '15분 이하', libState.mins)}${opt('30', '30분 이하', libState.mins)}</select>
    <select id="lib-role" aria-label="직무">${opt('', '모든 직무', libState.role)}${roleNames.map((r) => opt(r, r, libState.role)).join('')}</select>
    <select id="lib-status" aria-label="학습 상태">${opt('', '모든 상태', libState.status)}${STATUS_KEYS.map((k) => opt(k, STATUS[k].ko, libState.status)).join('')}</select>
    <label class="inline" for="lib-bm"><input id="lib-bm" type="checkbox" ${libState.bm ? 'checked' : ''}> 북마크만</label>
    <select id="lib-sort" aria-label="정렬">${opt('relevance', '관련도·추천순', libState.sort)}${opt('title', '제목순', libState.sort)}${opt('minutes', '짧은 글부터', libState.sort)}${opt('recent', '최근 읽은 순', libState.sort)}${opt('updated', '최근 갱신 순', libState.sort)}</select>
  </form>
  <p class="muted" id="lib-count" aria-live="polite"></p>
  <div class="cards" id="lib-results"></div>`;
}
function wireLibrary() {
  const form = $('#lib-form');
  const run = () => {
    Object.assign(libState, { q: $('#lib-q').value, disc: $('#lib-disc').value, track: $('#lib-track').value, diff: $('#lib-diff').value, mins: $('#lib-mins').value, role: $('#lib-role').value, status: $('#lib-status').value, bm: $('#lib-bm').checked, sort: $('#lib-sort').value });
    let res = search(INDEX, libState.q).map((r) => ({ ...r, a: ART[r.id] }));
    res = res.filter(({ a }) => (!libState.disc || CON[a.concept].discipline === libState.disc) && (!libState.track || a.track === libState.track) && (!libState.diff || a.difficulty === libState.diff) && (!libState.mins || a.reading_minutes <= Number(libState.mins)) && (!libState.role || (a.roles || []).includes(libState.role)) && (!libState.status || prog(a.id).status === libState.status) && (!libState.bm || prog(a.id).bookmarked));
    const s = libState.sort;
    if (s === 'title') res.sort((x, y) => x.a.title.localeCompare(y.a.title, 'ko'));
    else if (s === 'minutes') res.sort((x, y) => x.a.reading_minutes - y.a.reading_minutes);
    else if (s === 'recent') res.sort((x, y) => (prog(y.id).last_read_at || '').localeCompare(prog(x.id).last_read_at || ''));
    else if (s === 'updated') res.sort((x, y) => y.a.updated_at.localeCompare(x.a.updated_at));
    else if (!libState.q) res.sort((x, y) => ORDER.indexOf(x.a) - ORDER.indexOf(y.a));
    $('#lib-count').textContent = `${res.length}편${libState.q ? ` · "${libState.q}" 검색 결과` : ''}`;
    $('#lib-results').innerHTML = res.length ? res.map((r) => articleCard(r.a, { snippet: r.snippet, query: libState.q })).join('') : '<p class="empty">조건에 맞는 설명집이 없습니다. 검색어를 줄이거나 필터를 해제해 보세요. 아직 작성되지 않은 주제일 수도 있습니다(Knowledge Map에서 "준비 중" 개념 확인).</p>';
  };
  form.addEventListener('input', run); form.addEventListener('change', run);
  run();
}

/* ---------- 화면: Knowledge Map ---------- */
function viewMap() {
  return `<header class="page-head"><h1>Knowledge Map</h1><p class="lede">개념 ${KB.concepts.length}개와 관계 ${KB.relations.length}개를 3차원으로 배치했습니다. 높이는 선행 깊이(위쪽일수록 먼저 배울 개념), 방향은 학문 분야입니다. 채워진 구는 설명집이 있는 개념, 선으로 된 구는 준비 중인 개념입니다.</p></header>
  <div class="map-tools" role="group" aria-label="관계 표시">
    <label class="inline"><input type="checkbox" data-rel="prerequisite" checked> <i class="rel-key pre"></i>선행(화살표)</label>
    <label class="inline"><input type="checkbox" data-rel="related" checked> <i class="rel-key rel"></i>관련(긴 점선)</label>
    <label class="inline"><input type="checkbox" data-rel="application" checked> <i class="rel-key app"></i>응용(짧은 점선)</label>
    <button type="button" class="btn small" id="map-reset">시점 초기화</button>
  </div>
  <div class="map-wrap"><div id="map3d" class="map3d"><p class="viz-loading">3D 지도를 불러오는 중…</p></div><aside id="map-info" class="map-info" aria-live="polite"><p class="muted">노드를 누르면 연결된 개념만 강조됩니다. 드래그로 회전, 휠·핀치로 확대합니다.</p></aside></div>
  <div class="legend">${DISC_ORDER.map((d) => `<span class="key"><i style="background:var(${DISCIPLINE_COLOR[d]})"></i>${esc(KB.disciplines[d].ko)}</span>`).join('')}</div>
  <section><h2>목록으로 보기 <small>3D 지도와 같은 정보</small></h2><div class="table-wrap"><table class="data"><thead><tr><th>개념</th><th>분야</th><th class="num">선행 깊이</th><th>선행</th><th>후속</th><th>응용·관련</th></tr></thead><tbody>${KB.concepts.slice().sort((a, b) => DEPTH[a.id] - DEPTH[b.id] || DISC_ORDER.indexOf(a.discipline) - DISC_ORDER.indexOf(b.discipline)).map((c) => { const nb = neighbors(c.id, KB.relations); return `<tr><td>${conceptLink(c.id)}<br><small class="muted">${esc(c.title_en)}</small></td><td>${discChip(c.discipline)}</td><td class="num">${DEPTH[c.id]}</td><td>${nb.prerequisites.map(conceptLink).join(', ') || '—'}</td><td>${nb.next.map(conceptLink).join(', ') || '—'}</td><td>${[...nb.applications, ...nb.appliedFrom, ...nb.related].map(conceptLink).join(', ') || '—'}</td></tr>`; }).join('')}</tbody></table></div></section>`;
}
async function wireMap() {
  const host = $('#map3d'); const info = $('#map-info');
  const showInfo = (id) => {
    if (!id) { info.innerHTML = '<p class="muted">노드를 누르면 연결된 개념만 강조됩니다. 드래그로 회전, 휠·핀치로 확대합니다.</p>'; return; }
    const c = CON[id]; const nb = neighbors(id, KB.relations); const a = FIRST_ART[id];
    info.innerHTML = `<p class="eyebrow mono">${esc(c.discipline)} · 선행 깊이 ${DEPTH[id]}</p><h2>${esc(c.title_ko)}</h2><p class="en">${esc(c.title_en)}</p>
      ${a ? `<p>${statusPill(prog(a.id).status)} <a class="btn small" href="#a-${a.id}">설명집 읽기</a></p>` : `<p class="muted">설명집 준비 중${c.planned_article ? ` (${c.planned_article})` : ''}</p>`}
      <dl class="kv"><dt>선행</dt><dd>${nb.prerequisites.map(conceptLink).join(', ') || '없음'}</dd><dt>후속</dt><dd>${nb.next.map(conceptLink).join(', ') || '없음'}</dd><dt>응용</dt><dd>${nb.applications.map(conceptLink).join(', ') || '없음'}</dd></dl>`;
  };
  try {
    host.innerHTML = '';
    const tok = routeToken;
    const map = await mountKnowledgeMap(host, { concepts: KB.concepts, relations: KB.relations, disciplines: KB.disciplines, articleByConcept: FIRST_ART, onSelect: showInfo });
    if (tok !== routeToken) { map.dispose(); return; } // 로드 중 다른 화면으로 이동함
    disposers.push(() => map.dispose());
    main.querySelectorAll('[data-rel]').forEach((cb) => cb.addEventListener('change', () => map.setFilter(cb.dataset.rel, cb.checked)));
    $('#map-reset').addEventListener('click', () => map.resetView());
    host.dataset.ready = '1';
  } catch (e) {
    console.warn(e);
    host.innerHTML = `<p class="viz-fallback">3D 지도를 표시할 수 없습니다(${esc(e.message || e)}). 아래 목록에서 같은 관계를 확인할 수 있습니다.</p>`;
    host.dataset.ready = 'fallback';
  }
}

/* ---------- 화면: Skill Gap ---------- */
let gapDraft = null;
function viewGap() {
  const st = store.state; const pr = priorities();
  const postings = new Map(); for (const e of st.evidence) if (!postings.has(e.dedup_key)) postings.set(e.dedup_key, e);
  const activeN = [...postings.values()].filter((p) => p.posting_status !== 'closed').length;
  return `<header class="page-head"><h1>Skill Gap</h1><p class="lede">목표 직무의 요구 역량과 내 학습 상태의 차이입니다. 점수 = 0.35×직무관련성 + 0.25×공고빈도 + 0.25×역량공백 + 0.15×선행개념중요도(각 0~100). 학습 효과나 합격 가능성을 뜻하지 않는 휴리스틱입니다.</p></header>
  <section><h2>목표 직무</h2><div class="role-picks">${KB.roles.map((r) => `<label class="inline"><input type="checkbox" class="role-cb" value="${r.id}" ${st.settings.selected_roles.includes(r.id) ? 'checked' : ''}> ${esc(r.name)}</label>`).join('')}</div>
  <p class="muted small">직무관련성은 명세서에 적힌 목표 직무를 기준으로 한 수동 가중치이며 공고 근거가 아닙니다. 공고빈도는 아래에서 붙여넣은 실제 공고(활성 ${activeN}건, 같은 공고는 1회 집계)로만 계산합니다.${activeN ? '' : ' 공고가 없으면 빈도를 "미확인"으로 두고 나머지 세 항목의 가중치를 비례 재조정합니다.'}</p></section>
  <section><h2>우선순위</h2><div class="table-wrap"><table class="data" id="gap-table"><thead><tr><th>개념</th><th class="num">직무관련성</th><th class="num">공고빈도</th><th class="num">역량공백</th><th class="num">선행중요도</th><th class="num">계산 점수</th><th>수동 지정</th><th>설명집</th></tr></thead><tbody>${pr.map((r) => `<tr><td>${conceptLink(r.concept_id)}</td><td class="num">${r.relevance}</td><td class="num">${r.frequency === null ? '<span class="muted">미확인</span>' : `${r.frequency} <small class="muted">(${r.evidenceCount}건)</small>`}</td><td class="num">${r.gap}</td><td class="num">${r.prereq}</td><td class="num"><b>${r.score}</b></td><td><input type="number" class="manual" min="0" max="100" step="1" data-cid="${r.concept_id}" value="${r.manual ?? ''}" aria-label="${esc(CON[r.concept_id].title_ko)} 수동 우선순위" placeholder="—"></td><td>${FIRST_ART[r.concept_id] ? statusPill(prog(FIRST_ART[r.concept_id].id).status) : '<span class="muted small">준비 중</span>'}</td></tr>`).join('')}</tbody></table></div><p class="muted small">수동 지정 값(0~100)이 있으면 계산 점수 대신 정렬에 쓰입니다. 비우면 계산 점수로 돌아갑니다.</p></section>
  <section class="jd"><h2>채용공고 근거 추가</h2><p class="muted">공고 본문을 붙여넣으면 개념 별칭과 대조해 요구 역량을 찾고, "자격요건/필수"·"우대" 제목 아래에 있는지로 필수/우대/미확인을 구분합니다. 저장 전에 결과를 확인할 수 있습니다.</p>
    <form id="jd-form" class="jd-form">
      <label for="jd-company">회사<input id="jd-company" maxlength="100" required></label>
      <label for="jd-title">공고 제목<input id="jd-title" maxlength="150" required></label>
      <label for="jd-url">공고 URL (선택, https)<input id="jd-url" type="url" placeholder="https://"></label>
      <label for="jd-status">상태<select id="jd-status"><option value="active">활성</option><option value="closed">마감</option></select></label>
      <label for="jd-text" class="full">공고 본문<textarea id="jd-text" rows="7" placeholder="자격요건&#10;- PostgreSQL 기반 서비스 개발 경험&#10;우대사항&#10;- RAG 파이프라인 구축 경험"></textarea></label>
      <div class="full row"><button type="button" class="btn" id="jd-analyze">분석</button><span class="muted small" id="jd-msg" aria-live="polite"></span></div>
    </form>
    <div id="jd-preview"></div></section>
  <section><h2>수집한 근거 <small>${postings.size}개 공고 · ${st.evidence.length}개 매칭</small></h2>${postings.size ? `<div class="table-wrap"><table class="data"><thead><tr><th>공고</th><th>상태</th><th>매칭 개념(요구 유형)</th><th>수집일</th><th></th></tr></thead><tbody>${[...postings.entries()].map(([k, p]) => { const ev = st.evidence.filter((e) => e.dedup_key === k); return `<tr><td>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.company)} · ${esc(p.title)}</a>` : `${esc(p.company)} · ${esc(p.title)}`}</td><td><button type="button" class="btn small toggle-post" data-key="${esc(k)}">${p.posting_status === 'closed' ? '마감' : '활성'}</button></td><td>${ev.map((e) => `<span class="chip req-${e.requirement_type}" title="${esc(e.evidence_text)}">${esc(CON[e.concept_id]?.title_ko || e.concept_id)} · ${{ required: '필수', preferred: '우대', unknown: '미확인' }[e.requirement_type]}</span>`).join(' ')}</td><td class="mono small">${esc(p.observed_at.slice(0, 10))}</td><td><button type="button" class="btn small ghost del-post" data-key="${esc(k)}">삭제</button></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="empty">아직 수집한 공고가 없습니다. 관심 공고 본문을 위 양식에 붙여넣으면 근거 문장과 함께 저장됩니다.</p>'}</section>`;
}
function wireGap() {
  main.querySelectorAll('.role-cb').forEach((cb) => cb.addEventListener('change', () => { store.update((s) => { s.settings.selected_roles = [...main.querySelectorAll('.role-cb:checked')].map((x) => x.value); }); route(); }));
  main.querySelectorAll('.manual').forEach((inp) => inp.addEventListener('change', () => {
    const v = inp.value === '' ? null : Math.max(0, Math.min(100, Number(inp.value)));
    store.update((s) => { if (v === null || Number.isNaN(v)) delete s.manualPriority[inp.dataset.cid]; else s.manualPriority[inp.dataset.cid] = v; });
    route();
  }));
  main.querySelectorAll('.del-post').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.armed) { store.update((s) => { s.evidence = s.evidence.filter((e) => e.dedup_key !== b.dataset.key); }); route(); }
    else { b.dataset.armed = '1'; b.textContent = '정말 삭제'; b.classList.add('danger'); }
  }));
  main.querySelectorAll('.toggle-post').forEach((b) => b.addEventListener('click', () => { store.update((s) => { s.evidence.forEach((e) => { if (e.dedup_key === b.dataset.key) e.posting_status = e.posting_status === 'closed' ? 'active' : 'closed'; }); }); route(); }));
  $('#jd-analyze').addEventListener('click', () => {
    const company = $('#jd-company').value.trim(), title = $('#jd-title').value.trim(), url = $('#jd-url').value.trim(), text = $('#jd-text').value, status = $('#jd-status').value;
    const msg = $('#jd-msg');
    if (!company || !title || text.trim().length < 20) { msg.textContent = '회사, 공고 제목, 공고 본문(20자 이상)을 입력하세요.'; return; }
    if (url && !/^https:\/\//.test(url)) { msg.textContent = 'URL은 https://로 시작해야 합니다. 없으면 비워 두세요.'; return; }
    const key = dedupKey({ company, title, text });
    const dup = store.state.evidence.some((e) => e.dedup_key === key);
    const matches = matchJobText(text, KB.concepts);
    gapDraft = { company, title, url, status, key, matches };
    msg.textContent = dup ? '같은 회사·제목의 공고가 이미 있습니다. 저장하면 기존 근거를 이 결과로 교체합니다(중복 집계 안 함).' : `${matches.length}개 개념이 매칭되었습니다.`;
    $('#jd-preview').innerHTML = matches.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>포함</th><th>개념</th><th>요구 유형</th><th>근거 문장</th></tr></thead><tbody>${matches.map((m, i) => `<tr><td><input type="checkbox" class="jd-inc" data-i="${i}" checked aria-label="포함"></td><td>${esc(CON[m.concept_id].title_ko)}<br><small class="muted">일치: ${esc(m.alias)}</small></td><td><select class="jd-req" data-i="${i}" aria-label="요구 유형">${['required', 'preferred', 'unknown'].map((t) => `<option value="${t}" ${m.requirement_type === t ? 'selected' : ''}>${{ required: '필수', preferred: '우대', unknown: '미확인' }[t]}</option>`).join('')}</select></td><td class="small">${esc(m.evidence_text)}</td></tr>`).join('')}</tbody></table></div><button type="button" class="btn" id="jd-save">근거 저장</button>` : '<p class="empty">매칭된 개념이 없습니다. 개념 별칭에 없는 기술이면 아직 지식 그래프에 없는 주제일 수 있습니다.</p>';
    $('#jd-save')?.addEventListener('click', () => {
      const now = new Date().toISOString();
      const rows = gapDraft.matches.map((m, i) => ({ m, i })).filter(({ i }) => main.querySelector(`.jd-inc[data-i="${i}"]`).checked).map(({ m, i }) => ({
        id: `${gapDraft.key}|${m.concept_id}`, job_id: gapDraft.key, dedup_key: gapDraft.key, concept_id: m.concept_id,
        requirement_type: main.querySelector(`.jd-req[data-i="${i}"]`).value, evidence_text: m.evidence_text, observed_at: now,
        company: gapDraft.company, title: gapDraft.title, url: gapDraft.url, posting_status: gapDraft.status,
      }));
      store.update((s) => { s.evidence = s.evidence.filter((e) => e.dedup_key !== gapDraft.key).concat(rows); });
      gapDraft = null; route();
    });
  });
}

/* ---------- 화면: Interview ---------- */
const ivState = { type: '', disc: '' };
function viewInterview() {
  const qs = KB.questions.filter((q) => ART[q.article_id]);
  return `<header class="page-head"><h1>Interview</h1><p class="lede">설명집에서 모은 문항 ${qs.length}개입니다. 개념 설명형은 정의와 원리를, 선택 근거형은 대안 비교를, 실무 응용형은 상황 판단을 묻습니다. 먼저 소리 내어 답해 본 뒤 정답을 펼치세요.</p></header>
  <div class="filters"><select id="iv-type" aria-label="문항 유형"><option value="">모든 유형</option>${Object.entries(TYPE_KO).map(([k, v]) => `<option value="${k}" ${ivState.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
  <select id="iv-disc" aria-label="학문"><option value="">모든 학문</option>${DISC_ORDER.filter((d) => ARTICLES.some((a) => CON[a.concept].discipline === d)).map((d) => `<option value="${d}" ${ivState.disc === d ? 'selected' : ''}>${esc(KB.disciplines[d].ko)}</option>`).join('')}</select>
  <button type="button" class="btn" id="iv-rand">무작위 한 문항</button></div>
  <div id="iv-list" class="qa-list"></div>`;
}
function wireInterview() {
  const qs = KB.questions.filter((q) => ART[q.article_id]);
  const draw = () => {
    ivState.type = $('#iv-type').value; ivState.disc = $('#iv-disc').value;
    const list = qs.filter((q) => (!ivState.type || q.type === ivState.type) && (!ivState.disc || CON[ART[q.article_id].concept].discipline === ivState.disc));
    $('#iv-list').innerHTML = list.map((q, i) => `<details class="qa" id="iv-${i}"><summary><span class="chip">${TYPE_KO[q.type]}</span> ${q.question}</summary><div class="prose">${q.answer}<p class="small"><a href="#a-${q.article_id}">${esc(ART[q.article_id].title)} 설명집으로</a></p></div></details>`).join('') || '<p class="empty">조건에 맞는 문항이 없습니다.</p>';
  };
  $('#iv-type').addEventListener('change', draw); $('#iv-disc').addEventListener('change', draw);
  $('#iv-rand').addEventListener('click', () => { const all = main.querySelectorAll('#iv-list details'); if (!all.length) return; all.forEach((d) => { d.open = false; d.classList.remove('picked'); }); const d = all[Math.floor(Math.random() * all.length)]; d.classList.add('picked'); d.scrollIntoView({ block: 'center' }); d.querySelector('summary').focus(); });
  draw();
}

/* ---------- 화면: 설정 ---------- */
function viewPrefs() {
  const s = store.state.settings; const mode = store.mode;
  const modeText = { cloud: 'Claude 아티팩트 저장소(로그인 계정 전용, 기기 간 유지)', local: '이 브라우저(localStorage). 다른 기기·브라우저와 공유되지 않습니다', memory: '저장되지 않음(브라우저 저장소 차단). 새로고침하면 사라집니다. 아래 내보내기로 백업하세요' }[mode];
  const counts = { progress: Object.keys(store.state.progress).length, evidence: store.state.evidence.length, reads: store.state.readLog.length };
  const drafts = KB.draftCount ?? 0;
  return `<header class="page-head"><h1>학습 설정</h1><p class="lede">학습 분량과 복습 요일, 저장·백업을 관리합니다.</p></header>
  <form id="prefs-form" class="prefs">
    <fieldset><legend>매일 읽기</legend>
      <label for="pf-tz">시간대<select id="pf-tz">${['Asia/Seoul', 'UTC', 'America/Los_Angeles', 'Europe/London'].map((z) => `<option ${s.timezone === z ? 'selected' : ''}>${z}</option>`).join('')}</select></label>
      <label for="pf-f">기초 설명집 / 일<input id="pf-f" type="number" min="0" max="3" value="${s.daily_foundation_count}"></label>
      <label for="pf-e">실무 설명집 / 일<input id="pf-e" type="number" min="0" max="3" value="${s.daily_engineering_count}"></label>
      <label for="pf-rd">주간 복습 요일<select id="pf-rd">${DAYS.map((d, i) => `<option value="${i}" ${s.weekly_review_day === i ? 'selected' : ''}>${d}요일</option>`).join('')}</select></label>
    </fieldset>
    <fieldset><legend>콘텐츠 자동 생성 ${autoPill()}</legend>
      ${autoText()}
      <div class="full">${runsTable(10)}</div>
      <p class="muted small">콘텐츠 빌드 ${esc(KB.generatedAt.slice(0, 16).replace('T', ' '))} UTC · 공개 ${ARTICLES.length}편 · 비공개 초안 ${drafts}편</p>
    </fieldset>
    <p class="muted small" id="pf-msg" aria-live="polite"></p>
  </form>
  <section class="prefs"><h2>저장과 백업</h2>
    <p>현재 저장 위치: <b>${modeText}</b></p>
    <p class="muted small">학습 상태 ${counts.progress}건 · 공고 근거 ${counts.evidence}건 · 읽기 기록 ${counts.reads}건. 콘텐츠가 갱신되어도 학습 상태는 문서 ID로 연결되어 유지됩니다.</p>
    <div class="row"><button type="button" class="btn" id="ex-btn">내보내기(JSON)</button><button type="button" class="btn" id="ex-copy">클립보드 복사</button><button type="button" class="btn" id="ex-dl">파일로 저장</button></div>
    <label for="ex-text" class="sr-only">내보낸 JSON</label><textarea id="ex-text" rows="5" readonly hidden></textarea>
    <h3>가져오기</h3>
    <label for="im-text">백업 JSON 붙여넣기</label><textarea id="im-text" rows="4" placeholder='{"v":1,"progress":{...}}'></textarea>
    <div class="row"><label class="inline" for="im-file">또는 파일 선택 <input id="im-file" type="file" accept="application/json,.json"></label><button type="button" class="btn" id="im-check">확인</button></div>
    <div id="im-preview" aria-live="polite"></div>
    <h3>초기화</h3><button type="button" class="btn ghost" id="reset-btn">모든 학습 기록 지우기</button>
  </section>`;
}
function wirePrefs() {
  const form = $('#prefs-form');
  form.addEventListener('change', () => {
    store.update((s) => {
      s.settings.timezone = $('#pf-tz').value;
      s.settings.daily_foundation_count = Math.max(0, Math.min(3, Number($('#pf-f').value) || 0));
      s.settings.daily_engineering_count = Math.max(0, Math.min(3, Number($('#pf-e').value) || 0));
      s.settings.weekly_review_day = Number($('#pf-rd').value);
    });
    $('#pf-msg').textContent = '설정을 저장했습니다.';
  });
  const exportText = () => JSON.stringify(store.state, null, 2);
  $('#ex-btn').addEventListener('click', () => { const t = $('#ex-text'); t.hidden = false; t.value = exportText(); t.select(); });
  $('#ex-copy').addEventListener('click', async (e) => { const t = $('#ex-text'); t.hidden = false; t.value = exportText(); try { await navigator.clipboard.writeText(t.value); e.target.textContent = '복사됨'; } catch { t.select(); e.target.textContent = '텍스트를 선택했습니다. 직접 복사하세요'; } });
  $('#ex-dl').addEventListener('click', async (e) => {
    const name = `ekb-backup-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      const dl = window.claude?.use ? await window.claude.use('downloads') : null;
      if (dl) { await dl.save({ filename: name, data: exportText() }); e.target.textContent = '저장 요청됨'; return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportText()], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) { e.target.textContent = '저장 취소됨 — 클립보드 복사를 이용하세요'; }
  });
  $('#im-file').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) $('#im-text').value = await f.text(); });
  $('#im-check').addEventListener('click', () => {
    let parsed; try { parsed = JSON.parse($('#im-text').value); } catch { $('#im-preview').innerHTML = '<p class="bad">JSON 형식이 올바르지 않습니다. 내보내기로 만든 텍스트 전체를 붙여넣으세요.</p>'; return; }
    const clean = sanitizeState(parsed);
    $('#im-preview').innerHTML = `<p>학습 상태 ${Object.keys(clean.progress).length}건, 공고 근거 ${clean.evidence.length}건, 읽기 기록 ${clean.readLog.length}건을 가져옵니다. 현재 기록은 이 내용으로 교체됩니다.</p><button type="button" class="btn" id="im-apply">가져오기 실행</button>`;
    $('#im-apply').addEventListener('click', () => { store.replace(clean); $('#im-preview').innerHTML = '<p class="ok">가져왔습니다.</p>'; });
  });
  $('#reset-btn').addEventListener('click', (e) => { const b = e.currentTarget; if (b.dataset.armed) { store.replace(emptyState()); route(); } else { b.dataset.armed = '1'; b.textContent = '한 번 더 누르면 모두 지웁니다'; b.classList.add('danger'); } });
}

/* ---------- 라우팅 ---------- */
const ROUTES = {
  today: [viewToday], foundations: [viewFoundations], engineering: [viewEngineering], map: [viewMap, wireMap],
  gap: [viewGap, wireGap], interview: [viewInterview, wireInterview], library: [viewLibrary, wireLibrary], prefs: [viewPrefs, wirePrefs],
};
const TITLES = { today: '오늘의 읽기', foundations: 'Foundations', engineering: 'Engineering', map: 'Knowledge Map', gap: 'Skill Gap', interview: 'Interview', library: 'Library', prefs: '학습 설정' };
function route() {
  cleanup();
  const hash = decodeURIComponent(location.hash.slice(1)) || 'today';
  let name = hash;
  if (hash.startsWith('a-')) {
    main.innerHTML = viewArticle(hash.slice(2)); wireArticle(hash.slice(2)); name = 'library';
    document.title = `${ART[hash.slice(2)]?.title || '설명집'} · Engineering Knowledge Base`;
  } else {
    const r = ROUTES[hash] || ROUTES.today; if (!ROUTES[hash]) name = 'today';
    main.innerHTML = r[0](); r[1]?.(); document.title = `${TITLES[name]} · Engineering Knowledge Base`;
  }
  document.querySelectorAll('.nav a').forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === `#${name}` ? 'page' : 'false'));
  if (!route.first) { main.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  route.first = false;
}
route.first = true;

function renderStorageBadge() {
  const el = $('#store-badge'); if (!el) return;
  const m = store.mode;
  el.className = `store-badge ${m}`;
  el.textContent = { cloud: '저장: 계정(아티팩트)', local: '저장: 이 브라우저', memory: '저장 안 됨' }[m];
  el.title = m === 'memory' ? '브라우저 저장소를 사용할 수 없어 새로고침하면 기록이 사라집니다. 설정에서 내보내기로 백업하세요.' : '';
}

window.addEventListener('hashchange', route);
document.addEventListener('submit', (e) => { if (e.target.id !== 'nav-search') e.preventDefault(); });
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); location.hash = 'library'; setTimeout(() => $('#lib-q')?.focus(), 30); }
});
$('#nav-search').addEventListener('submit', (e) => { e.preventDefault(); libState.q = $('#nav-q').value; if (location.hash === '#library') route(); else location.hash = 'library'; });
document.querySelectorAll('.nav a[data-count]').forEach((a) => { const k = a.dataset.count; const n = k === 'foundations' ? ARTICLES.filter((x) => x.track === 'foundations').length : k === 'engineering' ? ARTICLES.filter((x) => x.track === 'engineering').length : k === 'interview' ? KB.questions.length : ARTICLES.length; a.querySelector('.count').textContent = n; });
$('#skip-link').addEventListener('click', () => main.focus());
renderStorageBadge();
route();
store.connectRemote().then((r) => { renderStorageBadge(); if (r?.replaced) route(); });
window.__ekb = { store, KB }; // 테스트·디버깅용
