// 다음에 작성할 설명집 후보를 계산한다(자동화 실행이 사용).
// Foundations: 설명집이 없는 기초 분야 개념 중, 선행 개념의 설명집이 모두 있는 것 우선 → 기초 설명집이 적은 학문 우선(커리큘럼 균형) → 선행 깊이
// Engineering: 기본 목표 직무 4개 기준 우선순위 점수(공고 근거는 사용자 개인 저장소에 있어 서버에서 읽지 않음)
// 출력: JSON { foundations: [...], engineering: [...] }
import { loadContent } from './lib.mjs';
import * as core from '../src/core.js';

const { graph, roles, articles } = loadContent();
const covered = new Set(articles.map((a) => a.meta.concept));
const ids = graph.concepts.map((c) => c.id);
const depth = core.prerequisiteDepth(ids, graph.relations);
const disc = Object.keys(graph.disciplines);
const FOUND = ['CS', 'MATH', 'STAT', 'OR'];
const prereqsOf = (id) => graph.relations.filter((r) => r.type === 'prerequisite' && r.to === id).map((r) => r.from);
const ready = (id) => prereqsOf(id).every((p) => covered.has(p));
const usedIds = new Set(articles.map((a) => a.meta.id));
const discCount = (d) => articles.filter((a) => graph.concepts.find((c) => c.id === a.meta.concept)?.discipline === d && a.meta.track === 'foundations').length;
const suggestId = (c) => {
  if (c.planned_article && !usedIds.has(c.planned_article)) return c.planned_article;
  const pre = { CS: 'CS-GEN', MATH: 'MATH-GEN', STAT: 'STAT-GEN', SE: 'SE-GEN', DE: 'DE-GEN', AI: 'AI-GEN', KE: 'KE-GEN', OR: 'OR-GEN', OPS: 'OPS-GEN', PE: 'PE-GEN' }[c.discipline];
  for (let i = 1; i < 999; i++) { const id = `${pre}-${String(i).padStart(3, '0')}`; if (!usedIds.has(id)) { usedIds.add(id); return id; } }
};
const describe = (c, extra = {}) => ({ concept: c.id, title_ko: c.title_ko, discipline: c.discipline, depth: depth[c.id], suggested_id: suggestId(c), prerequisites: prereqsOf(c.id), prerequisites_covered: ready(c.id), ...extra });

const foundations = graph.concepts
  .filter((c) => FOUND.includes(c.discipline) && !covered.has(c.id))
  .sort((a, b) => (ready(b.id) - ready(a.id)) || (discCount(a.discipline) - discCount(b.discipline)) || (depth[a.id] - depth[b.id]) || (disc.indexOf(a.discipline) - disc.indexOf(b.discipline)) || a.id.localeCompare(b.id))
  .map((c) => describe(c, { track: 'foundations' }));

const pr = core.computePriorities({ concepts: graph.concepts, relations: graph.relations, roles: roles.roles, selectedRoles: roles.roles.map((r) => r.id), statusByConcept: {}, evidence: [], manual: {} });
const engineering = pr
  .filter((r) => !FOUND.includes(graph.concepts.find((c) => c.id === r.concept_id).discipline) && !covered.has(r.concept_id))
  .map((r) => describe(graph.concepts.find((c) => c.id === r.concept_id), { track: 'engineering', priority: r.score }));

console.log(JSON.stringify({ foundations: foundations.slice(0, 5), engineering: engineering.slice(0, 5), remaining: { foundations: foundations.length, engineering: engineering.length } }, null, 2));
