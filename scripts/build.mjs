// 빌드: 콘텐츠 검증 → 마크다운·수식 사전 렌더링 → 단일 HTML 생성
//  dist/index.html    : GitHub Pages 등 일반 정적 호스팅용(완전한 문서)
//  dist/artifact.html : Claude 아티팩트용(문서 골격 없이 본문만, 게시 시 골격이 씌워짐)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CONTENT, loadContent, validateAll } from './lib.mjs';

const content = loadContent();
const { errors, rendered } = validateAll(content);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

const checksPath = path.join(CONTENT, 'source-checks.json');
const sourceChecks = fs.existsSync(checksPath) ? JSON.parse(fs.readFileSync(checksPath, 'utf8')).checks : {};

const pub = content.articles.filter(({ meta }) => meta.status === 'published');
const draftCount = content.articles.length - pub.length;
const runsDir = path.join(CONTENT, 'runs');
const runs = fs.existsSync(runsDir) ? fs.readdirSync(runsDir).filter((f) => f.endsWith('.json')).sort().reverse().slice(0, 30).map((f) => JSON.parse(fs.readFileSync(path.join(runsDir, f), 'utf8'))) : [];
const automation = JSON.parse(fs.readFileSync(path.join(CONTENT, 'automation.json'), 'utf8'));
const articles = pub.map(({ meta }) => {
  const r = rendered.get(meta.id);
  return { ...meta, html: r.html, toc: r.toc, summaryHtml: r.summaryHtml, plain: r.plain };
});
const questions = pub.flatMap(({ meta }) => rendered.get(meta.id).questions);
const KB = {
  generatedAt: new Date().toISOString(),
  disciplines: content.graph.disciplines, concepts: content.graph.concepts, relations: content.graph.relations,
  roles: content.roles.roles, articles, questions, sourceChecks, draftCount, runs, automation,
};
const json = JSON.stringify(KB).replace(/</g, '\\u003c');

// KaTeX CSS: 폰트를 woff2 data URI로 인라인(아티팩트 CSP는 외부 폰트 파일을 막음)
const kdir = path.join(ROOT, 'node_modules/katex/dist');
let katexCss = fs.readFileSync(path.join(kdir, 'katex.min.css'), 'utf8');
katexCss = katexCss.replace(/src:url\(fonts\/([\w-]+)\.woff2\) format\("woff2"\)(,url\([^)]*\) format\("[^"]*"\))*/g, (_, name) => {
  const b64 = fs.readFileSync(path.join(kdir, 'fonts', `${name}.woff2`)).toString('base64');
  return `src:url(data:font/woff2;base64,${b64}) format("woff2")`;
});
if (/url\(fonts\//.test(katexCss)) throw new Error('KaTeX 폰트 인라인 실패');

// JS 번들: 로컬 import 제거, export 키워드 제거 → 하나의 모듈 스크립트
const strip = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')
  .replace(/^import\s+\{[^}]*\}\s+from\s+'\.\/[\w.]+';\s*$/gm, '')
  .replace(/^export\s+(?=(async\s+)?function|const|let|class)/gm, '');
const bundle = ['core.js', 'store.js', 'viz.js', 'app.js'].map((f) => `// ---- ${f} ----\n${strip(f)}`).join('\n');
if (/<\/script/i.test(bundle)) throw new Error('번들에 </script 문자열이 있습니다');

const THREE_VER = '0.160.0';
const head = `<title>Engineering Knowledge Base</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="기초 학문과 실무 기술을 매일 읽는 공학 설명집 라이브러리">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Noto+Serif+KR:wght@400;600&display=swap">
<style>${katexCss}</style>
<style>${fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8')}</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/jsm/"}}</script>`;
const body = `${fs.readFileSync(path.join(ROOT, 'src/body.html'), 'utf8')}
<script type="application/json" id="kb-data">${json}</script>
<script type="module">
${bundle}
</script>`;

const dist = path.join(ROOT, 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'artifact.html'), `${head}\n${body}\n`);
fs.writeFileSync(path.join(dist, 'index.html'), `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
${body}
</body>
</html>
`);
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
const size = fs.statSync(path.join(dist, 'index.html')).size;
console.log(`빌드 완료: dist/index.html, dist/artifact.html (${(size / 1024).toFixed(0)} KB) · 설명집 ${articles.length} · 문항 ${questions.length}`);
