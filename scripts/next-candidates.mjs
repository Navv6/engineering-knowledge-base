// 다음에 작성할 설명집 1편을 고른다(자동화 실행이 사용). 하루 1편 기준.
// 규칙(우선순위 순):
//  1) 이미 공개된 설명집의 선행 개념(직·간접) 중 아직 공개 설명집이 없는 것 — 커리큘럼 구멍 메우기.
//     선행 깊이가 낮은 것 → 그 개념에 기대는 공개 설명집이 많은 것 순.
//  2) 구멍이 없으면 공개 편수가 적은 트랙(동률이면 foundations)에서 고른다.
//     foundations: 선행이 갖춰진 것 → 기초 설명집이 적은 학문 → 선행 깊이
//     engineering: 목표 직무 우선순위 점수
// 초안(draft)은 '공개 설명집 있음'으로 세지 않는다. 초안이 있는 개념은 그 초안 ID를 이어서 쓰도록 제안한다.
// 출력: JSON { pick, reason, gaps[], foundations[], engineering[], remaining }
import { loadContent } from './lib.mjs';
import * as core from '../src/core.js';

const { graph, roles, articles } = loadContent();
const pub = articles.filter((a) => a.meta.status === 'published');
const drafts = articles.filter((a) => a.meta.status !== 'published');
const covered = new Set(pub.map((a) => a.meta.concept));
const byId = Object.fromEntries(graph.concepts.map((c) => [c.id, c]));
const ids = graph.concepts.map((c) => c.id);
const depth = core.prerequisiteDepth(ids, graph.relations);
const disc = Object.keys(graph.disciplines);
const FOUND = ['CS', 'MATH', 'STAT', 'OR'];
const trackOf = (cid) => (FOUND.includes(byId[cid].discipline) ? 'foundations' : 'engineering');
const prereqsOf = (id) => graph.relations.filter((r) => r.type === 'prerequisite' && r.to === id).map((r) => r.from);
const ready = (id) => prereqsOf(id).every((p) => covered.has(p));
const usedIds = new Set(articles.map((a) => a.meta.id));
const discCount = (d) => pub.filter((a) => byId[a.meta.concept]?.discipline === d && a.meta.track === 'foundations').length;
const suggestId = (c) => {
  const draft = drafts.find((a) => a.meta.concept === c.id);
  if (draft) return draft.meta.id;
  if (c.planned_article && !usedIds.has(c.planned_article)) return c.planned_article;
  for (let i = 1; i < 999; i++) { const id = `${c.discipline}-GEN-${String(i).padStart(3, '0')}`; if (!usedIds.has(id)) { usedIds.add(id); return id; } }
  return null;
};
const describe = (c, extra = {}) => ({
  concept: c.id, title_ko: c.title_ko, discipline: c.discipline, track: trackOf(c.id), depth: depth[c.id],
  suggested_id: suggestId(c), has_draft: drafts.some((a) => a.meta.concept === c.id),
  prerequisites: prereqsOf(c.id), prerequisites_covered: ready(c.id), ...extra,
});

// 1) 공개 설명집의 빠진 선행 개념(조상 전체)
const dependents = {};
const walkUp = (cid, from, seen = new Set()) => {
  for (const p of prereqsOf(cid)) {
    if (seen.has(p)) continue;
    seen.add(p);
    if (!covered.has(p)) (dependents[p] ||= new Set()).add(from);
    walkUp(p, from, seen);
  }
};
for (const a of pub) walkUp(a.meta.concept, a.meta.id);
const gaps = Object.keys(dependents)
  .sort((a, b) => (depth[a] - depth[b]) || (dependents[b].size - dependents[a].size) || a.localeCompare(b))
  .map((cid) => describe(byId[cid], { needed_by: [...dependents[cid]].sort() }));

// 2) 트랙별 후보
const foundations = graph.concepts
  .filter((c) => FOUND.includes(c.discipline) && !covered.has(c.id))
  .sort((a, b) => (ready(b.id) - ready(a.id)) || (discCount(a.discipline) - discCount(b.discipline)) || (depth[a.id] - depth[b.id]) || (disc.indexOf(a.discipline) - disc.indexOf(b.discipline)) || a.id.localeCompare(b.id))
  .map((c) => describe(c));
const pr = core.computePriorities({ concepts: graph.concepts, relations: graph.relations, roles: roles.roles, selectedRoles: roles.roles.map((r) => r.id), statusByConcept: {}, evidence: [], manual: {} });
const engineering = pr
  .filter((r) => !FOUND.includes(byId[r.concept_id].discipline) && !covered.has(r.concept_id))
  .map((r) => describe(byId[r.concept_id], { priority: r.score }));

let pick = null, reason = '';
if (gaps.length) {
  pick = gaps[0];
  reason = `공개된 설명집 ${pick.needed_by.join(', ')}의 선행 개념인데 아직 설명집이 없음`;
} else {
  const nF = pub.filter((a) => a.meta.track === 'foundations').length;
  const nE = pub.filter((a) => a.meta.track === 'engineering').length;
  const track = nF <= nE ? 'foundations' : 'engineering';
  pick = (track === 'foundations' ? foundations : engineering)[0] || (track === 'foundations' ? engineering : foundations)[0] || null;
  reason = pick ? `선행 구멍 없음 → 공개 편수가 적은 ${track} 트랙(F ${nF} : E ${nE})` : '남은 후보 없음: 명세 3.2절 분류에서 새 개념을 추가해야 함';
}

console.log(JSON.stringify({ pick, reason, gaps: gaps.slice(0, 5), foundations: foundations.slice(0, 3), engineering: engineering.slice(0, 3), remaining: { foundations: foundations.length, engineering: engineering.length } }, null, 2));
