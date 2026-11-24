// 콘텐츠 검증 게이트. 실패 시 종료 코드 1 → 빌드 중단.
import { loadContent, validateAll } from './lib.mjs';

const content = loadContent();
const { errors, warnings, rendered } = validateAll(content);
const published = content.articles.filter((a) => a.meta.status === 'published').length;
console.log(`검증 대상: 개념 ${content.graph.concepts.length}개, 관계 ${content.graph.relations.length}개, 설명집 ${content.articles.length}개(공개 ${published})`);
for (const [id, r] of rendered) console.log(`  ✓ ${id}: 절 ${r.toc.length}, 수식 ${r.mathCount}, 문항 ${r.questions.length}, 시각화 [${r.vizUsed.join(', ')}]`);
for (const w of warnings) console.log(`  경고: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`  오류: ${e}`);
  console.error(`검증 실패: 오류 ${errors.length}건`);
  process.exit(1);
}
console.log('검증 통과');
