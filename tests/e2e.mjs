// 브라우저 E2E 검증 (Playwright + Chromium). dist/index.html을 로컬 HTTP 서버로 띄우고,
// cdn.jsdelivr.net의 three@0.160.0 요청은 node_modules의 같은 버전 파일로 응답한다(컨테이너 네트워크 차단 대응).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHOTS = process.env.SHOTS_DIR || '';
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, 'dist', req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!f.startsWith(path.join(ROOT, 'dist')) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const results = [];
let failed = 0;
async function check(name, fn) {
  if (process.env.TRACE) console.error(`[run] ${name} rss=${(process.memoryUsage().rss/1e6).toFixed(0)}MB`);
  const t0 = Date.now();
  try { await fn(); results.push(`  ✓ ${name}`); }
  catch (e) { failed++; results.push(`  ✗ ${name}\n      ${String(e.message || e).split('\n')[0]}`); }
  console.log(results[results.length - 1], `(${Date.now() - t0}ms)`);
}
const assert = (c, m) => { if (!c) throw new Error(m); };

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, ...opts });
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (route) => {
    const rel = route.request().url().split('three@0.160.0/')[1];
    const file = path.join(ROOT, 'node_modules/three', rel);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
    route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) });
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }); };

const browser = await chromium.launch();
if (process.env.TRACE) {
  const { execSync } = await import('node:child_process');
  setInterval(() => {
    const kb = Number(execSync("ps -eo rss,comm --sort=-rss | grep -m1 chrome | awk '{print $1}'").toString().trim() || 0);
    console.error(`[mem] renderer ${(kb / 1024).toFixed(0)}MB`);
    if (kb > 4e6) { console.error('[mem] 4GB 초과, 중단'); process.exit(3); }
  }, 2000).unref();
}
const { ctx, page, errors } = await newPage(browser);

await check('첫 화면(오늘의 읽기) 렌더링, 두 트랙 추천 표시', async () => {
  await page.goto(BASE);
  await page.waitForSelector('h1:has-text("오늘의 읽기")');
  const lanes = await page.$$eval('.lane .card h3', (els) => els.map((e) => e.textContent));
  assert(lanes.length >= 2, `추천 카드 ${lanes.length}개`);
  await shot(page, '01-today');
});

for (const [hash, h1] of [['foundations', 'Foundations'], ['engineering', 'Engineering'], ['library', 'Library'], ['interview', 'Interview'], ['gap', 'Skill Gap'], ['prefs', '학습 설정'], ['map', 'Knowledge Map']]) {
  await check(`화면 이동 #${hash}`, async () => {
    await page.goto(`${BASE}#${hash}`);
    await page.waitForSelector(`h1:has-text("${h1}")`);
    const cur = await page.getAttribute(`.nav a[href="#${hash}"]`, 'aria-current');
    assert(cur === 'page', '현재 메뉴 표시 누락');
  });
}

await check('설명집 상세: 수식·목차·문항·출처 렌더링', async () => {
  await page.goto(`${BASE}#a-STAT-INF-001`);
  await page.waitForSelector('.prose h2');
  const n = await page.$$eval('.prose .katex', (e) => e.length);
  assert(n > 50, `KaTeX 요소 ${n}개`);
  assert((await page.$$('.toc li')).length === 14, '목차 14개 아님');
  assert((await page.$$('.prose details.qa')).length >= 3, '문항 부족');
  assert((await page.$$('.sources li')).length >= 2, '출처 부족');
  const closed = await page.$eval('.prose details.qa', (d) => !d.open);
  assert(closed, '정답이 기본으로 펼쳐져 있음');
  await shot(page, '02-article');
});

await check('신뢰구간 시뮬레이션(2D) 동작: n 변경 시 통계 갱신', async () => {
  await page.locator('.viz[data-viz="ci"]').scrollIntoViewIfNeeded();
  await page.waitForSelector('.viz[data-viz="ci"] .viz-stat:has-text("참 평균")');
  const before = await page.textContent('.viz[data-viz="ci"] .viz-stat');
  assert(/t 임계값 2\.13\d \(자유도 15\)/.test(before), `t 임계값 표시 오류: ${before}`);
  await page.selectOption('#ci-n', '64');
  const after = await page.textContent('.viz[data-viz="ci"] .viz-stat');
  assert(after !== before && /자유도 63/.test(after), 'n 변경이 반영되지 않음');
  await shot(page, '03-ci');
});

await check('3D 벡터 시각화: WebGL 캔버스 생성, 예제 값 cos≈0.596', async () => {
  await page.goto(`${BASE}#a-MATH-LA-001`);
  await page.locator('.viz[data-viz="vector3d"]').scrollIntoViewIfNeeded();
  await page.waitForSelector('.viz[data-viz="vector3d"] canvas', { timeout: 15000 });
  const txt = await page.textContent('.viz[data-viz="vector3d"] .readout');
  assert(txt.includes('0.596') && txt.includes('53.4°'), `readout: ${txt}`);
  await page.fill('#vec-bx', '2'); // range는 fill 대신 값 설정
  await page.$eval('#vec-by', (el) => { el.value = '4'; el.dispatchEvent(new Event('input')); });
  await page.$eval('#vec-bz', (el) => { el.value = '4'; el.dispatchEvent(new Event('input')); });
  const t2 = await page.textContent('.viz[data-viz="vector3d"] .readout');
  assert(t2.includes('cos θ1.000'), `b=(2,4,4)에서 cos=1이어야 함: ${t2}`);
  await page.waitForTimeout(300);
  await shot(page, '04-vector3d');
});

await check('B-Tree 3D: 삽입·검색 후 불변식 유지와 경로 표시', async () => {
  await page.goto(`${BASE}#a-DE-DB-001`);
  await page.locator('.viz[data-viz="btree3d"]').scrollIntoViewIfNeeded();
  await page.waitForSelector('.viz[data-viz="btree3d"] canvas', { timeout: 15000 });
  await page.click('button:has-text("예제 1 (10→50)")');
  let st = await page.textContent('.viz[data-viz="btree3d"] .viz-stat');
  assert(/키 5개 · 높이 2층/.test(st) && st.includes('만족'), st);
  await page.fill('#bt-key', '40'); await page.click('.viz[data-viz="btree3d"] button:has-text("검색")');
  const log = await page.textContent('.viz[data-viz="btree3d"] .viz-log');
  assert(/40 검색: 찾음 — 읽은 페이지\(노드\) 2개/.test(log), log);
  for (let i = 0; i < 4; i++) await page.click('button:has-text("무작위 5개 삽입")');
  st = await page.textContent('.viz[data-viz="btree3d"] .viz-stat');
  assert(st.includes('불변식 만족'), st);
  await page.waitForTimeout(300);
  await shot(page, '05-btree');
});

await check('임베딩 3D: k 변경 시 Recall/nDCG 재계산, 정답 토글', async () => {
  await page.goto(`${BASE}#a-AI-RAG-001`);
  await page.locator('.viz[data-viz="embed3d"]').scrollIntoViewIfNeeded();
  await page.waitForSelector('.viz[data-viz="embed3d"] canvas', { timeout: 15000 });
  const r5 = await page.textContent('.viz[data-viz="embed3d"] .readout');
  await page.$eval('#emb-k', (el) => { el.value = '12'; el.dispatchEvent(new Event('input')); });
  const r12 = await page.textContent('.viz[data-viz="embed3d"] .readout');
  assert(r5 !== r12, '지표가 변하지 않음');
  const rows = await page.$$eval('.viz[data-viz="embed3d"] tr.in-k', (e) => e.length);
  assert(rows === 12, `상위 k 표시 ${rows}`);
  await shot(page, '06-embed');
});

await check('Big-O 차트: SVG 곡선 6개, 로그 축 전환', async () => {
  await page.goto(`${BASE}#a-CS-ALG-002`);
  await page.locator('.viz[data-viz="bigo"]').scrollIntoViewIfNeeded();
  await page.waitForSelector('.viz[data-viz="bigo"] svg path', { state: 'attached' });
  assert((await page.$$('.viz[data-viz="bigo"] svg path')).length === 6, '곡선 수');
  await page.check('#bigo-log');
  assert((await page.textContent('.viz[data-viz="bigo"] svg')).includes('로그 축'), '로그 축 미반영');
});

await check('학습 상태·북마크·메모가 새로고침 후 유지', async () => {
  await page.goto(`${BASE}#a-CS-ALG-002`);
  await page.click('.seg label:has-text("이해 완료")');
  await page.click('#bm-btn');
  await page.fill('#notes', '점근 표기는 증가율 비교');
  await page.waitForTimeout(900);
  await page.reload();
  await page.waitForSelector('.prose h2');
  assert(await page.isChecked('input[name="st"][value="understood"]'), '상태 유지 실패');
  assert((await page.getAttribute('#bm-btn', 'aria-pressed')) === 'true', '북마크 유지 실패');
  assert((await page.inputValue('#notes')) === '점근 표기는 증가율 비교', '메모 유지 실패');
});

await check('자가 채점: 채점 저장·새로고침 유지, 기한 도래 시 오늘의 복습에 표시', async () => {
  await page.goto(`${BASE}#a-STAT-INF-001`);
  await page.waitForSelector('.prose details.qa .grade', { state: 'attached' });
  const d = page.locator('.prose details.qa').first();
  await d.locator('summary').click();
  await d.locator('.grade button[data-g="again"]').click();
  let c = await page.evaluate(() => window.__ekb.store.state.cards['STAT-INF-001#0']);
  assert(c && c.box === 0 && c.last === 'again', `카드 ${JSON.stringify(c)}`);
  assert((await page.textContent('#quiz-info')).includes('채점 1'), '문항 통계');
  await page.reload();
  await page.waitForSelector('.prose details.qa .grade', { state: 'attached' });
  assert((await page.getAttribute('.prose details.qa .grade button[data-g="again"]', 'aria-pressed')) === 'true', '채점 유지 실패');
  await page.goto(`${BASE}#review`);
  await page.waitForSelector('#iv-list');
  assert((await page.$$('#iv-list details.qa')).length === 0, '기한 전인데 복습에 나옴');
  await page.evaluate(() => window.__ekb.store.update((s) => { s.cards['STAT-INF-001#0'].due = '2020-01-01T00:00:00Z'; }));
  await page.goto(`${BASE}#today`);
  assert((await page.textContent('.review-card')).includes('오늘 복습할 문항 1개'), '오늘 화면 복습 카드');
  await page.click('.review-card');
  await page.waitForSelector('#iv-list details.qa');
  assert((await page.$$('#iv-list details.qa')).length === 1, '복습 목록');
  await page.locator('#iv-list details.qa summary').click();
  await page.locator('#iv-list .grade button[data-g="good"]').click();
  c = await page.evaluate(() => window.__ekb.store.state.cards['STAT-INF-001#0']);
  assert(c.box === 1 && Date.parse(c.due) > Date.now() + 2 * 86400000, '복습 채점 반영');
});

await check('30초 설명: 저장 유지, 아티팩트 밖에서는 피드백 버튼 숨김', async () => {
  await page.goto(`${BASE}#a-CS-ALG-002`);
  await page.fill('#explain', 'Big-O는 입력이 커질 때 비용 증가율을 상수배를 빼고 비교하는 상한 표기다.');
  await page.waitForTimeout(900);
  await page.reload();
  await page.waitForSelector('#explain');
  assert((await page.inputValue('#explain')).startsWith('Big-O는'), '설명 유지 실패');
  assert(await page.isHidden('#explain-fb'), '피드백 버튼이 보임');
});

await check('설명집을 열어도 학습 상태를 자동 변경하지 않음', async () => {
  await page.goto(`${BASE}#a-MATH-LA-001`);
  await page.waitForSelector('.prose h2');
  const st = await page.evaluate(() => window.__ekb.store.state.progress['MATH-LA-001']?.status);
  assert(st === 'unread', `자동 변경됨: ${st}`);
});

await check('이해 완료 문서는 오늘의 추천에서 제외되고 다음 순서로 진행', async () => {
  await page.goto(`${BASE}#today`);
  await page.waitForSelector('.lane .card');
  const ids = await page.$$eval('.lane .card .id', (e) => e.map((x) => x.textContent));
  assert(!ids.includes('CS-ALG-002'), `이해 완료 문서가 추천됨: ${ids}`);
});

await check('검색: 한글·영문·별칭·띄어쓰기 무시', async () => {
  const q = async (s) => { await page.goto(`${BASE}#library`); await page.fill('#lib-q', s); await page.waitForTimeout(80); return page.$$eval('#lib-results .card .id', (e) => e.map((x) => x.textContent)); };
  assert((await q('신뢰구간'))[0] === 'STAT-INF-001', '신뢰구간');
  assert((await q('cosine'))[0] === 'MATH-LA-001', 'cosine');
  assert((await q('PostgreSQL 인덱스'))[0] === 'DE-DB-001', 'PostgreSQL 인덱스');
  assert((await q('코사인유사도'))[0] === 'MATH-LA-001', '코사인유사도');
  assert((await q('Big-O'))[0] === 'CS-ALG-002', 'Big-O');
  assert((await q('없는주제xyz')).length === 0, '무관 검색 결과');
  await page.fill('#lib-q', ''); await page.selectOption('#lib-track', 'engineering');
  const engN = await page.evaluate(() => window.__ekb.KB.articles.filter((a) => a.track === 'engineering' && a.status === 'published').length);
  assert((await page.$$('#lib-results .card')).length === engN, '트랙 필터');
  await page.selectOption('#lib-track', ''); await page.check('#lib-bm');
  const bm = await page.$$eval('#lib-results .card .id', (e) => e.map((x) => x.textContent));
  assert(bm.length === 1 && bm[0] === 'CS-ALG-002', `북마크 필터 ${bm}`);
});

await check('Knowledge Map: 3D 렌더링, 목록 대체 화면, 노드 정보', async () => {
  await page.goto(`${BASE}#map`);
  await page.waitForSelector('#map3d[data-ready]', { timeout: 15000 });
  assert((await page.getAttribute('#map3d', 'data-ready')) === '1', '3D 지도 실패(대체 화면 표시됨)');
  assert((await page.$$('#map3d canvas')).length === 1, '캔버스 없음');
  const nC = await page.evaluate(() => window.__ekb.KB.concepts.length);
  assert((await page.$$('table.data tbody tr')).length === nC, '목록 행 수');
  await page.uncheck('[data-rel="related"]');
  await page.waitForTimeout(400);
  await shot(page, '07-map');
});

await check('Skill Gap: 공고 분석→저장→중복 방지→빈도 반영', async () => {
  await page.goto(`${BASE}#gap`);
  const before = await page.textContent('#gap-table tbody');
  assert(before.includes('미확인'), '공고 없을 때 미확인 표시 누락');
  const fillJD = async () => {
    await page.fill('#jd-company', '예시회사'); await page.fill('#jd-title', 'AI Application Engineer');
    await page.fill('#jd-text', '주요 업무\nLLM 서비스 개발\n자격요건\n- PostgreSQL 쿼리 최적화 경험\n- RAG 파이프라인 구축 경험\n우대사항\n- Knowledge Graph 경험');
    await page.click('#jd-analyze');
  };
  await fillJD();
  await page.waitForSelector('#jd-save');
  assert((await page.$$('#jd-preview tbody tr')).length === 3, '매칭 3개 아님');
  await page.click('#jd-save');
  await page.waitForSelector('h2:has-text("수집한 근거")');
  let ev = await page.evaluate(() => window.__ekb.store.state.evidence.length);
  assert(ev === 3, `근거 ${ev}`);
  await fillJD();
  assert((await page.textContent('#jd-msg')).includes('이미 있습니다'), '중복 경고 없음');
  await page.click('#jd-save');
  ev = await page.evaluate(() => window.__ekb.store.state.evidence.length);
  assert(ev === 3, `재저장 시 중복 집계: ${ev}`);
  const ragRow = await page.$eval('#gap-table', (t) => [...t.querySelectorAll('tr')].find((r) => r.textContent.includes('RAG 검색'))?.textContent || '');
  assert(/100\s*\(1건\)/.test(ragRow), `빈도 반영 실패: ${ragRow}`);
  await shot(page, '08-gap');
});

await check('Interview: 전체 문항 표시, 유형 필터, 답 접힘', async () => {
  await page.goto(`${BASE}#interview`);
  const nQ = await page.evaluate(() => window.__ekb.KB.questions.length);
  assert((await page.$$('#iv-list details')).length === nQ, '문항 수');
  await page.selectOption('#iv-type', 'applied');
  const n = (await page.$$('#iv-list details')).length;
  assert(n > 0 && n < nQ, `필터 ${n}`);
  await page.click('#iv-rand');
  assert((await page.$$('#iv-list details.picked')).length === 1, '무작위 선택');
});

await check('설정: 변경 저장, 내보내기→가져오기 왕복, 초기화는 2단계 확인', async () => {
  await page.goto(`${BASE}#prefs`);
  await page.selectOption('#pf-rd', '3');
  await page.click('#ex-btn');
  const exported = JSON.parse(await page.inputValue('#ex-text'));
  assert(exported.settings.weekly_review_day === 3 && exported.progress['CS-ALG-002'].status === 'understood', '내보내기 내용');
  await page.click('#reset-btn');
  assert(await page.evaluate(() => Object.keys(window.__ekb.store.state.progress).length) > 0, '1회 클릭에 초기화됨');
  await page.click('#reset-btn');
  await page.waitForSelector('h1:has-text("학습 설정")');
  assert(await page.evaluate(() => Object.keys(window.__ekb.store.state.progress).length) === 0, '초기화 실패');
  await page.fill('#im-text', JSON.stringify(exported));
  await page.click('#im-check'); await page.click('#im-apply');
  const st = await page.evaluate(() => window.__ekb.store.state.progress['CS-ALG-002']?.status);
  assert(st === 'understood', '가져오기 실패');
  await page.fill('#im-text', '{bad json'); await page.click('#im-check');
  assert((await page.textContent('#im-preview')).includes('올바르지 않습니다'), '잘못된 JSON 처리');
});

await check('콘솔 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); });
await ctx.close();

// 모바일·다크모드·저장소 차단
const mobile = await newPage(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark', isMobile: true, hasTouch: true });
for (const hash of ['today', 'library', 'a-AI-RAG-001', 'a-STAT-INF-001', 'map', 'gap', 'prefs', 'interview']) {
  await check(`모바일 390px 가로 넘침 없음 #${hash}`, async () => {
    await mobile.page.goto(`${BASE}#${hash}`);
    await mobile.page.waitForSelector('main h1');
    await mobile.page.waitForTimeout(hash === 'map' ? 1500 : 200);
    const { sw, iw } = await mobile.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    assert(sw <= iw + 1, `scrollWidth ${sw} > ${iw}`);
    if (hash === 'today' || hash === 'a-AI-RAG-001') await shot(mobile.page, `09-mobile-${hash}`);
  });
}
await check('다크 모드 토큰 적용', async () => {
  const bg = await mobile.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert(bg === 'rgb(13, 20, 26)', bg);
});
await check('모바일 콘솔 오류 없음', async () => { assert(mobile.errors.length === 0, mobile.errors.join(' | ')); });
await mobile.ctx.close();

await check('브라우저 저장소 차단 시에도 동작하고 "저장 안 됨" 표시', async () => {
  const b = await newPage(browser);
  await b.page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  await b.page.goto(`${BASE}#today`);
  await b.page.waitForSelector('h1');
  assert((await b.page.textContent('#store-badge')).includes('저장 안 됨'), '배지');
  assert(b.errors.length === 0, b.errors.join(' | '));
  await b.ctx.close();
});

await check('three.js CDN 실패 시 대체 문구(본문은 정상)', async () => {
  const b = await newPage(browser);
  await b.ctx.unroute('https://cdn.jsdelivr.net/npm/three@0.160.0/**');
  await b.ctx.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
  await b.page.goto(`${BASE}#map`);
  await b.page.waitForSelector('#map3d[data-ready]', { timeout: 15000 });
  assert((await b.page.getAttribute('#map3d', 'data-ready')) === 'fallback', '대체 화면 아님');
  assert((await b.page.$$('table.data tbody tr')).length === (await b.page.evaluate(() => window.__ekb.KB.concepts.length)), '목록 대체 화면 없음');
  await b.ctx.close();
});

await browser.close();
server.close();
console.log(failed ? `E2E 실패 ${failed}건` : `E2E 전체 통과 (${results.length}건)`);
process.exit(failed ? 1 : 0);
