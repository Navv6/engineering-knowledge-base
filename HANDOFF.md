# HANDOFF — Engineering Knowledge Base

최종 갱신: 2026-11-24 · 기준 명세: `engineering-knowledge-base-spec.md` v1.0

이 문서는 다음 작업자(사람 또는 에이전트)가 바로 이어서 작업할 수 있도록 **실제로 구현·검증한 것**과 **계획·미검증인 것**을 구분해 기록한다.

---

## 0. 요구사항 변경 사항 (사용자 지시)

| 명세 원문 | 사용자 지시에 따른 변경 |
|---|---|
| 기존 Career Radar 대시보드의 독립 메뉴로 추가 | **Career Radar를 사용하지 않음.** 독립 정적 사이트로 구축하고 Claude 아티팩트와 GitHub Pages 양쪽에서 동작하게 함 |
| 채용 데이터는 기존 job_id 참조 | Career Radar 데이터가 없으므로 **공고 본문을 붙여넣어 근거를 수집하는 읽기 전용 어댑터**로 대체(명세 6장의 "연동 불가 시" 조항) |
| 시각화는 필요한 경우 | **3D 개념도·3D 분해도형 시각화 추가** 요청 반영 |

---

## 1. Phase 0 — 현황 분석 결과

- 작업 디렉터리에 기존 저장소 없음 → 신규 프로젝트 `engineering-kb/` 생성.
- 실행 환경: Node 22, npm, 사전 설치된 Playwright + Chromium.
- 네트워크: **npm 레지스트리만 접근 가능.** CDN(jsdelivr, cdnjs)과 외부 문서 사이트는 컨테이너에서 차단. 웹 페치 도구로는 github.com만 접근 가능했음.
  - 대응 1: 라이브러리는 npm에서 같은 버전을 받아 빌드·테스트에 사용하고, 테스트 시 CDN 요청을 로컬 파일로 대체해 검증.
  - 대응 2: 출처 링크는 확인 가능한 것만 "링크 확인"으로 표시(§5).
- 스케줄러: Claude Code 예약 작업 **"EKB daily reading"으로 연결함**(매일 06:44 KST, §6).

## 2. 기술적 결정

| 결정 | 선택 | 근거 / 기각한 대안 |
|---|---|---|
| 배포 형태 | 단일 HTML (`dist/index.html` GitHub Pages용, `dist/artifact.html` 아티팩트용) | 두 플랫폼 모두 정적 파일만 지원. 아티팩트는 외부 fetch 차단 → 콘텐츠를 JSON으로 인라인 |
| 프레임워크 | 없음(바닐라 JS ES 모듈) | 화면 수가 적고 빌드 체인을 단순하게 유지. React 등은 아티팩트 CDN 제약과 번들 크기 대비 이점 적음 |
| 마크다운·수식 | **빌드 시** `marked` + `KaTeX`로 사전 렌더링 | 브라우저에 파서를 싣지 않음. 잘못된 LaTeX는 빌드 단계에서 실패(`throwOnError`) → 검증 게이트 역할 |
| KaTeX 폰트 | woff2를 data URI로 인라인(약 300KB) | 아티팩트 CSP가 외부 폰트 파일을 차단 |
| 한국어 강조 | 빌드 시 `**…**` → `<strong>` 선변환 | `**모집단(population)**의`처럼 닫는 `**` 뒤에 조사가 붙으면 CommonMark가 강조를 인식하지 못함(스크린샷으로 발견) |
| 3D | three.js 0.160.0 (jsdelivr ES 모듈 + importmap), 필요한 화면에서만 동적 로드 | 3D 실패해도 본문·목록은 정상 동작. `3d-force-graph`(커뮤니티 라이브러리)도 검토했으나 three를 이중 번들하고 레이아웃이 무작위 물리 시뮬레이션이라 **선행 깊이를 높이로 쓰는 의미 있는 배치**가 어려워 직접 구현 |
| 학습 상태 저장 | 아티팩트: `db` 기능의 개인 전용 경로 `data/users/<id>/ekb` / GitHub Pages: localStorage / 둘 다 불가: 메모리 + "저장 안 됨" 배지 | 아티팩트 db는 계정 기준으로 기기 간 유지. 항상 localStorage에도 캐시. 원격과 로컬 중 `savedAt`이 최신인 쪽 채택 |
| 라우팅 | 해시(`#today`, `#a-CS-ALG-002` 등) | 아티팩트는 `#name` 형식만 전달. `settings` 등 예약어 회피(`#prefs`) |
| 오늘의 읽기 선정 | 클라이언트에서 결정적 계산 | 스케줄러 없이 동작. Foundations는 선행 깊이 순서, Engineering은 명세 7장 우선순위 공식 |

## 3. 구현 현황 (Phase별)

### Phase 1 — MVP: **완료·검증됨**
- [x] 화면: 오늘의 읽기, Foundations, Engineering, Knowledge Map, Skill Gap, Interview, Library, 학습 설정
- [x] 상세 화면: 목차, 수식 렌더링, 학습 목표·선행 지식·관련 직무, 접히는 정답, 출처 패널(검증 상태 배지), 개념 연결, 이전/다음, 내 메모, 복습 예약
- [x] 검색(한글·영문 제목, 별칭, 태그, 본문, 띄어쓰기 무시) · 필터(학문, 트랙, 난이도, 읽기 시간, 직무, 학습 상태, 북마크) · 정렬 5종
- [x] 학습 상태 4단계(사용자만 변경, 열람 시 자동 변경 안 함), 북마크, 읽기 기록 영속 저장
- [x] 검증된 초기 설명집 5편(명세 최소 4편: CS·수학·통계·실무 각 1편 이상)

| ID | 제목 | 트랙 | 분량 | 수식 | 문항 | 시각화 |
|---|---|---|---|---|---|---|
| CS-ALG-002 | Big-O와 시간·공간복잡도 | Foundations | 25분 | 203 | 5 | 복잡도 곡선(2D, 로그 축, 시간 추정표) |
| MATH-LA-001 | 벡터, 내적, 코사인 유사도 | Foundations | 25분 | 73 | 4 | **3D 벡터 공간**(내적·각도·사영 실시간) |
| STAT-INF-001 | 모집단, 표본, 추정, 신뢰구간 | Foundations | 30분 | 99 | 5 | 신뢰구간 100개 반복 추출 + 표본분포(2D) |
| DE-DB-001 | B-Tree와 데이터베이스 인덱스 | Engineering | 15분 | 24 | 5 | **3D B-Tree 분해도**(삽입·분할·검색 경로) |
| AI-RAG-001 | RAG 검색 및 평가 | Engineering | 15분 | 49 | 4 | **3D 임베딩 공간** Top-k + Recall/MRR/nDCG |

### Phase 2 — 연결 및 자동화: **부분 완료**
- [x] 채용 근거 매핑: 공고 본문 붙여넣기 → 개념 별칭 매칭 → 필수/우대/미확인 분류 → 저장 전 미리보기·수정. 같은 회사+제목은 1회만 집계, 마감 공고는 빈도에서 제외
- [x] Skill Gap 화면: 명세 7장 공식, 공고 데이터 없으면 빈도 "미확인" + 나머지 가중치 재정규화, 수동 우선순위
- [x] 설정 UI(시간대, 일일 분량, 복습 요일, 자동화 제안값, 알림 방식), 내보내기/가져오기/초기화(2단계 확인)
- [x] 콘텐츠 검증·중복 방지 파이프라인(`npm run validate`, `npm run new`)
- [x] **자동 생성 스케줄러 연결**: 예약 작업 "EKB daily reading"(매일 06:44 KST, 실행마다 새 세션). 실행 기록은 `content/runs/*.json`, 학습 설정 화면에 표시
- [ ] 알림 — 페이지 자체 알림은 미구현. 예약 작업 완료 알림(Claude 앱 푸시)은 계정 기본 설정을 따름

### Phase 3 — 학습 확장: **부분 완료**
- [x] Knowledge Map 3D(높이 = 선행 깊이, 방위 = 학문 분야, 노드 선택 시 연결만 강조, 관계 유형 필터) + **동일 정보의 접근 가능한 표**
- [x] 면접 질문 23개(개념 설명형·선택 근거형·실무 응용형), 유형·학문 필터, 무작위 출제
- [x] 주간 복습(최근 7일 읽음·복습 필요·복습 예약 도래 문서의 핵심 요약 + 다음 개념 연결)
- [x] 인터랙티브 시각화 5종(3D 3종 + 2D 2종)
- [ ] 접근성 전문 감사(WCAG 도구 기반) — 미실시. 키보드 탐색·포커스 표시·목록 대체 화면·명암 토큰만 적용

## 4. 테스트·검증 결과 (2026-11-24 실행)

```
npm run build      → 검증 통과(개념 25, 관계 33, 설명집 5, 수식 448개 사전 렌더링), dist 1.5MB
npm run test:unit  → 16/16 통과
npm run test:e2e   → 35/35 통과 (Chromium, 데스크톱 1360px + 모바일 390px 다크 모드)
```

**콘텐츠 검증 게이트(`scripts/lib.mjs#validateAll`)가 검사하는 것**
- 필수 메타데이터, 트랙·난이도·깊이·상태 값, 파일명=ID, 트랙별 권장 읽기 시간
- canonical_key 중복, 별칭 충돌(경고), 관계 끝점 존재, **선행 관계 순환 검출**(관련 관계 순환은 허용)
- **같은 개념·트랙·범위 문서 중복 생성 거부**
- 출처 2개 이상, https만 허용, example.com 등 가짜로 보이는 URL 거부
- 필수 절(핵심 요약·등장 배경·한계·이해 확인·선행/후속) 존재
- 본문이 참조하는 문서 ID가 실제(또는 계획된) ID인지
- LaTeX 렌더링 오류, 문항마다 "정답"·"해설" 포함, 알 수 없는 시각화 이름, TODO/TBD 잔존

**E2E가 검사하는 것**: 모든 화면 이동, 수식·목차·문항·출처 렌더링, 시각화 5종의 실제 동작 값(예: 벡터 예제 cos 0.596·53.4°, t₀.₉₇₅,₁₅=2.131, B-Tree 불변식, nDCG 재계산), 상태·북마크·메모 새로고침 후 유지, 열람 시 상태 자동 변경 없음, 검색 6종, 공고 분석→저장→중복 방지→빈도 반영, 내보내기·가져오기 왕복, 2단계 초기화, 콘솔 오류 0, 모바일 가로 넘침 없음, 다크 토큰, **localStorage 차단 시 동작**, **three.js CDN 실패 시 대체 화면**.

**테스트로 발견해 고친 실제 결함**
1. 띄어쓰기 없는 한글 검색("코사인유사도") 실패 → 공백 무시 본문 색인 추가
2. 3D 모듈 로드 중 화면 이동 시 렌더러가 해제되지 않고 분리된 DOM에서 계속 동작(경쟁 상태) → 라우트 토큰으로 늦게 끝난 마운트 즉시 해제
3. 렌더러 메모리 4GB+ 폭증으로 브라우저 강제 종료 → 위 2번 + ResizeObserver를 폭 변경 시에만 반응하도록 제한
4. 지식 지도 자동 회전이 소프트웨어 WebGL에서 CPU를 과점유해 페이지 종료 → 12초 후 자동 정지, 30fps 제한, 화면 밖·백그라운드 탭에서 일시정지
5. 공고 매칭 오탐("쿼리 **최적화**"→수리최적화, "Knowledge **Graph**"→그래프 이론) → 최장 일치 규칙 + 일반적 별칭 정리
6. "필수"가 포함된 글머리표 줄을 섹션 제목으로 오인 → 글머리표 줄 제외
7. 한국어 조사 뒤 굵게 표시 미적용 → 빌드 시 선변환

**검증하지 못한 것**
- 실제 Claude 아티팩트 뷰어 안에서의 `db` 저장(기기 간 동기화)은 게시 후 뷰어에서만 동작하므로 이 세션의 E2E로는 검증하지 않음. 실패 시 localStorage로 자동 대체되도록 구현.
- 실제 GPU 환경(Safari/Firefox, 모바일 실기기)의 3D 성능. 헤드리스 Chromium(SwiftShader)에서만 확인.
- 실제 Google Fonts·jsdelivr 로드(컨테이너 차단). 실패 시 시스템 폰트·대체 화면으로 동작함은 확인.

## 5. 출처 검증 상태

- 교재·논문은 **서지 정보**(저자, 제목, 학술지, 권호, 연도)로 기록하고 URL을 만들어 넣지 않았다.
- URL이 있는 출처 17개 중 **github.com/pgvector/pgvector 1건만 링크 확인**(연산자 서술 일치). 나머지 16건(ocw.mit.edu, wiki.python.org, nlp.stanford.edu, www.itl.nist.gov, www.postgresql.org, use-the-index-luke.com, arxiv.org)은 세션 네트워크 정책상 접근 불가 → 화면에 **"링크 미확인"**으로 표시.
- 미확인 상태로 남은 버전 의존 서술: DE-DB-001의 "PostgreSQL 18 skip scan"(본문에 "링크 재확인 못 함" 명시), Lehman–Yao 기반·중복 제거(dedup) 서술은 PostgreSQL 문서 기준이나 이번 세션에서 재확인 못 함.
- **다음 작업:** 위 호스트를 허용한 환경에서 링크를 확인하고 `content/source-checks.json`에 `{ "ok": true, "date": ..., "note": ... }`를 추가 → 재빌드하면 배지가 "링크 확인"으로 바뀐다.

## 6. 자동화(명세 8장) — 연결됨

**구성 (2026-11-24 연결)**
- 예약 작업: `EKB daily reading`, `CRON_TZ=Asia/Seoul 44 6 * * *`(매일 06:44 KST), 실행마다 새 클라우드 세션. 커넥터 없음(필요 없음: 아티팩트 도구만 사용).
- 원본 소스 보관소: **아티팩트 자체**의 부속 파일 `source/…`(목록 `source/MANIFEST.json`). GitHub 토큰이 만료되어 새 저장소를 만들 수 없어서 택한 방식. 복원 경로는 실제로 검증함(아티팩트에서 30개 파일을 받아 새 디렉터리에서 원본과 바이트 동일, 빌드·단위 테스트 통과).
- 절차: 예약 작업 프롬프트에 전체 절차가 들어 있다(아티팩트에서 읽은 파일은 실행 세션이 신뢰하지 않는 데이터로 취급하므로 지시를 프롬프트에 직접 둠). `AUTOMATION.md`는 같은 절차의 상세 참고본.
  1. 소스 복원 → `npm ci` → 빌드·단위 테스트(기준 상태 확인)
  2. `scripts/next-candidates.mjs`로 기초 1·실무 1 후보 선정(기초는 선행 충족 → 설명집 적은 학문 → 선행 깊이, 실무는 직무 우선순위)
  3. `npm run new`로 초안(중복 거부) → 작성 기준에 따라 작성
  4. `npm run validate`(최대 2회 수정, 실패 시 draft로 보관)
  5. 빌드 + 단위 + E2E 모두 통과 시 실행 기록 작성 → `scripts/pack-source.mjs`로 소스 포함 재게시(같은 URL, capabilities 유지)
  6. 실패 시 깨진 상태로 게시하지 않음. 같은 날 성공 기록이 있으면 skipped(중복 방지). 게시 충돌 시 최신본에 합쳐 재게시, force 금지
- 사용자 학습 기록은 페이지 개인 저장소(db)에 있어 자동화가 건드리지 않는다.

**변경 방법**: 시각·분량·중지는 Claude에게 요청 → 예약 작업 설정(update_trigger) 변경. 페이지에서 직접 바꾸는 기능은 없음(페이지가 예약 작업 설정 권한을 갖지 않도록 의도적으로 제외).

**알려진 제약**
- 실행 세션의 네트워크도 이 세션과 같은 정책이라 외부 문서 사이트 대부분에 접근 불가 → 새 설명집의 URL 출처는 "링크 미확인"으로 표시됨. 서지 정보 중심으로 작성하도록 지시함.
- 공고 근거(Skill Gap)는 사용자 개인 저장소에 있어 자동화가 읽을 수 없음 → 실무 후보는 목표 직무 가중치만으로 선정.
- 회당 비용·시간: 설명집 2편 작성 + E2E로 실행당 수십 분 소요 예상.

## 7. 데이터 모델 매핑 (명세 6장)

| 명세 엔터티 | 구현 위치 |
|---|---|
| Concept, ConceptRelation | `content/concepts.json` (canonical_key = `id`, aliases, discipline, tags, planned_article) |
| Article, Source, InterviewQuestion | `content/articles/<ID>.md` 프론트매터 + 본문 12절의 `<details class="qa">` (빌드 시 추출) |
| JobSkillEvidence | 사용자 상태 `evidence[]` (job_id=dedup_key, requirement_type, evidence_text, observed_at, posting_status) |
| LearningProgress | 사용자 상태 `progress[articleId]` (status, bookmarked, last_read_at, notes, review_due_at) |
| LearningSettings | 사용자 상태 `settings` |
| RefreshRun | `content/runs/<YYYY-MM-DD>T<HHMM>.json` (자동화가 기록, 학습 설정 화면에 최근 10건 표시) |
| (역할 가중치) | `content/roles.json` — 명세의 목표 직무 기준 수동 값이며 공고 근거 아님 |

**마이그레이션·롤백**: 사용자 상태는 `v: 1` 스키마이며 `sanitizeState`가 모르는 필드를 버리고 값 범위를 검사한다. 콘텐츠 롤백은 git으로 이전 커밋 빌드를 재배포하면 되고, 학습 상태는 문서 ID 기준이라 영향받지 않는다(삭제된 문서의 상태는 보존되지만 표시되지 않음). 사용자 측 백업은 설정 화면의 내보내기 JSON.

## 8. 파일 구조

```
content/            설명집(md), 개념 그래프, 직무 가중치, 출처 확인 기록
scripts/lib.mjs     파싱·수식 렌더링·검증(공용)
scripts/validate.mjs, build.mjs, new-article.mjs
src/core.js         순수 로직(검색, 우선순위, 오늘의 읽기, 공고 매칭, IR 지표, 통계 분위수, B-Tree)
src/store.js        저장소 어댑터(db / localStorage / memory)
src/viz.js          시각화 5종 + 3D 지식 지도
src/app.js          화면·라우팅
src/styles.css, body.html
tests/unit.test.mjs, tests/e2e.mjs
dist/               빌드 결과(index.html, artifact.html)
.github/workflows/pages.yml
```

## 9. 다음 우선순위 제안

1. 출처 링크 확인(§5) — 정확성 기준 충족에 필요
2. 설명집 추가(후보 순서): CS-ALG-001, STAT-PROB-001, 임베딩, KE-ONT-001, AI-AGENT-001
3. 첫 예약 실행 결과 확인 후 작성 기준·분량 조정(§6)
4. 실기기·다른 브라우저에서 3D 확인, 접근성 도구 감사
