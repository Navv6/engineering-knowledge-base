// 새 설명집 초안 생성: npm run new -- <ID> <concept-id> <track>
// 같은 개념·트랙 문서가 있거나 ID가 이미 있으면 거부(중복 생성 방지). 초안은 status "draft"로 만들어져 공개되지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT, loadContent, TRACKS } from './lib.mjs';

const [id, concept, track = 'foundations'] = process.argv.slice(2);
if (!/^[A-Z]{2,6}-[A-Z]{2,6}-\d{3}$/.test(id || '') || !concept || !TRACKS.includes(track)) {
  console.error('사용법: npm run new -- <ID 예: CS-ALG-001> <concept-id> <foundations|engineering>'); process.exit(1);
}
const { graph, articles } = loadContent();
const c = graph.concepts.find((x) => x.id === concept);
if (!c) { console.error(`개념 ${concept}이 concepts.json에 없습니다. 먼저 개념과 관계를 추가하세요.`); process.exit(1); }
const file = path.join(CONTENT, 'articles', `${id}.md`);
if (fs.existsSync(file)) { console.error(`${id}.md가 이미 있습니다.`); process.exit(1); }
const dup = articles.find((a) => a.meta.concept === concept && a.meta.track === track && !a.meta.scope);
if (dup) { console.error(`같은 개념·트랙의 문서 ${dup.meta.id}가 이미 있습니다. 심화 문서라면 scope 필드로 범위를 구분하세요.`); process.exit(1); }
const today = new Date().toISOString().slice(0, 10);
const meta = { id, concept, track, title: c.title_ko, title_en: c.title_en, difficulty: '입문', depth: ['L1', 'L2'], reading_minutes: track === 'foundations' ? 20 : 10, objectives: [], prerequisites: [], roles: [], tags: [], status: 'draft', version: 1, created_at: today, updated_at: today, verified_at: null, sources: [] };
const sections = ['핵심 요약', '개념과 등장 배경', '직관적 설명 및 기초 이론', '엄밀한 정의와 작동 원리', '수식 및 기호 설명', '단계별 계산 또는 동작 예제', '시각화와 해석', '기술 비교 및 선택 기준', '실무 사례', '기존 프로젝트와의 연결', '가정·한계·흔한 오해·트레이드오프', '이해 확인 및 면접 질문', '선행·후속 학습', '참고 자료'];
fs.writeFileSync(file, `---json\n${JSON.stringify(meta, null, 2)}\n---\n\n${sections.map((s, i) => `## ${i + 1}. ${s}\n\n`).join('')}`);
console.log(`초안 생성: content/articles/${id}.md (status: draft). 작성 후 status를 published로, verified_at을 채우고 npm run validate를 통과시키세요.`);
