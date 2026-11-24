import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/core.js';
import { detectCycles, protectMath, renderArticleBody, validateAll, loadContent } from '../scripts/lib.mjs';

test('IR 지표: 설명집 6장 예제 값과 일치', () => {
  const m = core.irMetrics(['d3', 'd2', 'd8', 'd5', 'd1'], ['d2', 'd5', 'd7'], 5);
  assert.equal(m.precision, 0.4);
  assert.ok(Math.abs(m.recall - 2 / 3) < 1e-9);
  assert.equal(m.rr, 0.5);
  assert.ok(Math.abs(m.ndcg - 0.498) < 0.001, `nDCG ${m.ndcg}`);
});

test('IR 지표: 면접 Q1 nDCG@4 ≈ 0.877', () => {
  const m = core.irMetrics(['d4', 'd2', 'd3', 'd1'], ['d1', 'd4'], 4);
  assert.ok(Math.abs(m.ndcg - 0.877) < 0.001);
});

test('코사인: MATH-LA-001 예제 (1,2,2)·(2,0,1)', () => {
  assert.ok(Math.abs(core.cosine([1, 2, 2], [2, 0, 1]) - 4 / (3 * Math.sqrt(5))) < 1e-12);
  assert.ok(Number.isNaN(core.cosine([0, 0, 0], [1, 0, 0])));
});

test('분위수: z_0.975=1.960, t_0.975,15≈2.131', () => {
  assert.ok(Math.abs(core.zQuantile(0.975) - 1.95996) < 1e-4);
  assert.ok(Math.abs(core.tQuantile(0.975, 15) - 2.131) < 0.002);
  assert.ok(Math.abs(core.tQuantile(0.975, 4) - 2.776) < 0.01);
});

test('B-Tree: 예제 1 분할 결과와 불변식', () => {
  const t = new core.BTree(3);
  [10, 20, 30, 40].forEach((k) => t.insert(k));
  assert.deepEqual(t.root.keys, [30]);
  assert.deepEqual(t.root.children.map((c) => c.keys), [[10, 20], [40]]);
  t.insert(50);
  assert.deepEqual(t.root.children[1].keys, [40, 50]);
  const r = core.rng(7);
  const t2 = new core.BTree(3);
  for (let i = 0; i < 300; i++) t2.insert(Math.floor(r() * 1000));
  assert.ok(t2.check(), 'B-Tree 불변식 위반');
  assert.equal(t2.search(t2.root.keys[0]).found, true);
  assert.equal(t2.insert(t2.root.keys[0]), false, '중복 키 삽입 방지');
});

test('선행 관계 순환 검출', () => {
  const nodes = ['a', 'b', 'c', 'd'];
  assert.equal(detectCycles(nodes, [{ from: 'a', to: 'b', type: 'prerequisite' }, { from: 'b', to: 'c', type: 'prerequisite' }]).length, 0);
  const cyc = detectCycles(nodes, [{ from: 'a', to: 'b', type: 'prerequisite' }, { from: 'b', to: 'c', type: 'prerequisite' }, { from: 'c', to: 'a', type: 'prerequisite' }]);
  assert.equal(cyc.length, 1);
  assert.deepEqual(cyc[0], ['a', 'b', 'c', 'a']);
  // related 관계의 순환은 허용
  assert.equal(detectCycles(nodes, [{ from: 'a', to: 'b', type: 'related' }, { from: 'b', to: 'a', type: 'related' }]).length, 0);
});

test('수식 보호: 코드 블록·인라인 코드의 $는 건드리지 않음', () => {
  const { text, maths } = protectMath('값 $x^2$ 와 `echo $HOME`\n```sh\nprice=$5 $6\n```\n$$a+b$$');
  assert.equal(maths.length, 2);
  assert.ok(text.includes('`echo $HOME`'));
  assert.ok(text.includes('price=$5 $6'));
});

test('렌더링: 문항 추출과 잘못된 LaTeX 검출', () => {
  const r = renderArticleBody('## 1. 핵심 요약\n\n- $a$\n\n## 2. 문제\n\n<details class="qa" data-type="concept"><summary>Q</summary>\n\n**정답.** x\n\n**해설.** y\n\n</details>\n', 'T');
  assert.equal(r.questions.length, 1);
  assert.equal(r.toc.length, 2);
  assert.throws(() => renderArticleBody('$\\frac{1}{$', 'T'));
});

test('콘텐츠 전체 검증 통과 + 중복 문서 생성 거부', () => {
  const content = loadContent();
  assert.deepEqual(validateAll(content).errors, []);
  const dup = structuredClone(content);
  const copy = structuredClone(dup.articles[0]);
  copy.meta.id = 'CS-ALG-999'; copy.file = 'CS-ALG-999.md';
  dup.articles.push(copy);
  assert.ok(validateAll(dup).errors.some((e) => e.includes('중복 생성 금지')));
});

test('공고 매칭: 섹션별 필수/우대/미확인, 단어 경계', () => {
  const concepts = loadContent().graph.concepts;
  const jd = '주요 업무\nLLM 기반 서비스 개발\n자격요건\n- PostgreSQL 인덱스 설계 경험\n- RAG 파이프라인 구축 경험\n우대사항\n- 온톨로지 또는 Knowledge Graph 경험\n- MAX 성능 튜닝';
  const m = core.matchJobText(jd, concepts);
  const by = Object.fromEntries(m.map((x) => [x.concept_id, x.requirement_type]));
  assert.equal(by['btree-index'], 'required');
  assert.equal(by['rag-retrieval-eval'], 'required');
  assert.equal(by['ontology-kg'], 'preferred');
  assert.equal(by['fde-solution-design'], undefined, '"MAX"가 "AX"로 오인되면 안 됨');
});

test('우선순위: 공고 없으면 빈도 미확인, 동일 공고는 1회 집계, 마감 제외, 수동값 우선', () => {
  const { graph, roles } = loadContent();
  const base = { concepts: graph.concepts, relations: graph.relations, roles: roles.roles, selectedRoles: ['ai-app'], statusByConcept: {}, manual: {} };
  const r0 = core.computePriorities({ ...base, evidence: [] });
  assert.equal(r0[0].frequency, null);
  const ev = [
    { concept_id: 'rag-retrieval-eval', dedup_key: 'p:a', posting_status: 'active' },
    { concept_id: 'rag-retrieval-eval', dedup_key: 'p:a', posting_status: 'active' },
    { concept_id: 'btree-index', dedup_key: 'p:b', posting_status: 'active' },
    { concept_id: 'ontology-kg', dedup_key: 'p:c', posting_status: 'closed' },
  ];
  const r1 = core.computePriorities({ ...base, evidence: ev, manual: { 'sets-logic': 99 } });
  const get = (id) => r1.find((x) => x.concept_id === id);
  assert.equal(get('rag-retrieval-eval').frequency, 50); // 활성 공고 2개 중 1개
  assert.equal(get('rag-retrieval-eval').evidenceCount, 1);
  assert.equal(get('ontology-kg').frequency, 0);
  assert.equal(r1[0].concept_id, 'sets-logic');
});

test('오늘의 읽기: 이해 완료는 건너뛰고 읽는 중은 이어 읽기', () => {
  const arts = [{ id: 'A', track: 'foundations', concept: 'x' }, { id: 'B', track: 'foundations', concept: 'y' }, { id: 'E', track: 'engineering', concept: 'z' }];
  const t = core.pickToday({ articles: arts, order: arts.slice(0, 2), progress: { A: { status: 'understood' }, B: { status: 'reading' } }, priorities: [{ concept_id: 'z', final: 70 }] });
  assert.equal(t.foundations[0].article.id, 'B');
  assert.equal(t.foundations[0].reason, '이어 읽기');
  assert.equal(t.engineering[0].article.id, 'E');
});

test('검색: 한글·영문·별칭·공백 무시', () => {
  const idx = core.buildSearchIndex([{ id: 'X', concept: 'c', title: '벡터, 내적', title_en: 'Cosine Similarity', tags: ['임베딩'], plain: '코사인 유사도는 방향을 비교한다' }], { c: { aliases: ['dot product'] } });
  assert.equal(core.search(idx, '코사인유사도')[0]?.id, 'X');
  assert.equal(core.search(idx, 'cosine')[0]?.id, 'X');
  assert.equal(core.search(idx, 'DOT PRODUCT')[0]?.id, 'X');
  assert.equal(core.search(idx, '양자역학').length, 0);
});

test('KST 날짜·요일 계산', () => {
  const d = core.dateInTZ(new Date('2026-11-22T16:30:00Z'), 'Asia/Seoul'); // KST 11/23 01:30 (월)
  assert.equal(d.ymd, '2026-11-23');
  assert.equal(d.weekday, 1);
});

test('공고 매칭: 더 긴 별칭 안의 짧은 일치는 버림(최장 일치)', () => {
  const concepts = loadContent().graph.concepts;
  const m = core.matchJobText('자격요건\n- PostgreSQL 쿼리 최적화 경험\n우대사항\n- Knowledge Graph 경험\n- 그래프 이론 기반 경로 탐색', concepts).map((x) => x.concept_id).sort();
  assert.deepEqual(m, ['btree-index', 'graph-theory', 'ontology-kg']);
});

test('공고 매칭: "필수"가 들어간 글머리표 줄은 섹션 제목으로 오인하지 않음', () => {
  const concepts = loadContent().graph.concepts;
  const m = core.matchJobText('우대사항\n- RAG 경험 필수는 아님\n- PostgreSQL 경험', concepts);
  const by = Object.fromEntries(m.map((x) => [x.concept_id, x.requirement_type]));
  assert.equal(by['rag-retrieval-eval'], 'preferred');
  assert.equal(by['btree-index'], 'preferred');
});
