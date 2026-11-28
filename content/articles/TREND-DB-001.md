---json
{
  "id": "TREND-DB-001",
  "concept": "sql-basics",
  "scope": "postgresql-19",
  "track": "trends",
  "title": "PostgreSQL 19: 무엇이 바뀌었나",
  "title_en": "PostgreSQL 19: What Changed",
  "difficulty": "입문",
  "depth": ["L1", "L2"],
  "reading_minutes": 12,
  "objectives": [
    "PostgreSQL 19(2026-11-19 출시)의 주요 변화를 운영·개발·보안 관점으로 나눠 설명할 수 있다.",
    "각 변화가 어떤 기초 개념(트랜잭션, 인덱스, NULL의 3값 논리, 윈도 함수, 인증)과 이어지는지 말할 수 있다.",
    "내 프로젝트(DeepVi, Preflight)에서 확인해 볼 점과 업그레이드 시 주의점을 정리할 수 있다."
  ],
  "prerequisites": ["SQL 조회·조인·집계(DE-SQL-001)", "트랜잭션과 ACID(DE-DB-002)"],
  "roles": ["Data Engineer", "FDE", "AI Native Developer"],
  "tags": ["기술 동향", "PostgreSQL", "데이터베이스", "릴리스"],
  "related_articles": ["DE-SQL-001", "DE-DB-002", "DE-DB-001", "MATH-DM-001", "SE-AUTH-001", "DE-PIPE-001"],
  "as_of": "2026-11-28",
  "valid_until": "2027-02-26",
  "status": "published",
  "version": 1,
  "created_at": "2026-11-28",
  "updated_at": "2026-11-28",
  "verified_at": "2026-11-28",
  "sources": [
    { "title": "PostgreSQL Global Development Group. PostgreSQL 19 Released! (2026-11-19 공지)", "url": "https://www.postgresql.org/about/news/postgresql-19-released-3449/", "source_type": "official-doc" },
    { "title": "PostgreSQL 19 Documentation: Release 19 (릴리스 노트)", "url": "https://www.postgresql.org/docs/19/release-19.html", "source_type": "official-doc" },
    { "title": "PostgreSQL 19 Documentation: INSERT (ON CONFLICT DO SELECT)", "url": "https://www.postgresql.org/docs/19/sql-insert.html", "source_type": "official-doc" },
    { "title": "PostgreSQL 19 Documentation: REPACK", "url": "https://www.postgresql.org/docs/19/sql-repack.html", "source_type": "official-doc" },
    { "title": "PostgreSQL 19 Documentation: WAIT", "url": "https://www.postgresql.org/docs/19/sql-wait.html", "source_type": "official-doc" },
    { "title": "PostgreSQL 19 Documentation: Window Functions", "url": "https://www.postgresql.org/docs/19/functions-window.html", "source_type": "official-doc" }
  ]
}
---

## 0. 한눈에 보기 (입문)

### 한 줄 요약
2026년 11월 19일 PostgreSQL 19가 나왔다. 핵심은 **운영 중단 없이 테이블 정리(REPACK CONCURRENTLY)**, **"있으면 가져오고 없으면 만들기"를 한 번에(ON CONFLICT DO SELECT)**, **복제본에서 방금 쓴 데이터 읽기 보장(WAIT)**, 그리고 **여러 자동 성능 개선**이다.

### 쉬운 설명
PostgreSQL은 DeepVi와 Preflight가 모두 쓴 데이터베이스다. 1년에 한 번 큰 버전이 나오는데, 이번 19는 "운영하면서 겪던 불편"을 많이 줄였다.

- **청소를 영업 중에:** 데이터를 자주 고치고 지우면 테이블에 빈 공간이 쌓여 느려진다. 예전에는 청소(VACUUM FULL)하는 동안 테이블을 못 썼는데, 이제 `REPACK (CONCURRENTLY)`로 쓰는 중에도 청소할 수 있다.
- **"있으면 그것, 없으면 새로" 한 번에:** 같은 뉴스를 두 번 저장하지 않으려면 "이미 있나 확인 → 없으면 저장" 두 번 왕복해야 했다. 이제 한 문장으로 기존 행이든 새 행이든 돌려받는다.
- **방금 쓴 글이 안 보이는 문제 해결:** 읽기를 복제본(standby)에 보내면, 방금 원본에 쓴 데이터가 아직 복제본에 도착하지 않아 안 보일 수 있다. 이제 "여기까지 도착할 때까지 기다려"를 명령할 수 있다.
- **보안 정리:** 오래된 md5 비밀번호 인증을 쓰면 경고가 뜨고, RADIUS 인증은 없어졌다.

### 내 프로젝트에서는
- **DeepVi:** 재무·주가·뉴스·ESG·거시지표를 PostgreSQL에 저장하고 FastAPI로 조회했다(README 기재). 매일 뉴스를 쌓는 구조에서 "같은 기사는 한 번만" 저장하는 문제가 있었다면, `ON CONFLICT DO SELECT`가 바로 그 패턴을 한 문장으로 만든다(5절).
- **Preflight:** 전 모듈을 PostgreSQL로 이전했고(08.15), 업로드를 누적 병합으로 바꿨다(08.16). 행을 자주 갱신하는 누적 병합 구조는 테이블에 빈 공간이 쌓이기 쉬워 `REPACK (CONCURRENTLY)`가 직접 관련된다. 다만 Preflight가 어떤 PostgreSQL 버전을 쓰는지는 기록이 없어, 업그레이드 여부는 점검 사항이다(5절).

### 먼저 알면 좋은 것
- SQL 조회·조인·집계(DE-SQL-001): JOIN, NOT IN, 윈도 함수
- 트랜잭션과 ACID(DE-DB-002): upsert(`ON CONFLICT`), 멱등성, MVCC

### 쉬운 확인 질문

<details class="qa" data-type="easy"><summary>Q1. PostgreSQL 19의 REPACK (CONCURRENTLY)가 이전 VACUUM FULL보다 나은 점은?</summary>

**정답.** 테이블 정리 중에도 읽기·쓰기를 막지 않는다.

**해설.** 공식 공지에 따르면 VACUUM FULL과 CLUSTER는 정리가 끝날 때까지 테이블 접근을 막는 단점이 있었고, REPACK이 이 둘을 대체한다(호환을 위해 두 명령은 남아 있음).

</details>

<details class="qa" data-type="easy"><summary>Q2. 같은 데이터를 "있으면 가져오고 없으면 만드는" 일을 한 번에 하게 해 주는 새 문법은?</summary>

**정답.** `INSERT ... ON CONFLICT DO SELECT ... RETURNING`.

**해설.** 충돌한(이미 있는) 행을 RETURNING으로 돌려받아, 확인과 저장을 위한 두 번의 왕복이 한 번으로 준다.

</details>

## 1. 핵심 요약

- **출시:** 2026-11-19, PostgreSQL Global Development Group 공지.
- **운영:** `REPACK`(VACUUM FULL·CLUSTER 대체), `REPACK (CONCURRENTLY)`로 무중단 정리. 인덱스 병렬 자동 청소(autovacuum)와 우선순위 점수. 새 모니터링 뷰(`pg_stat_lock` 등).
- **계획 안정성:** `pg_plan_advice`(실행 계획 고정·실험), `pg_stash_advice`(질의별 계획 조언 자동 적용).
- **개발:** `INSERT ... ON CONFLICT DO SELECT`, `COPY`의 JSON 출력, 윈도 함수 `IGNORE NULLS`(lead, lag, first_value, last_value, nth_value).
- **분산:** 첫 논리 복제 슬롯을 만들 때 재시작 없이 논리 복제 활성화, 시퀀스 값 복제, 복제본의 "방금 쓴 것 읽기" 보장(`WAIT`).
- **자동 성능:** 외래 키 검사 개선(공지에 따르면 시험에서 대량 삽입이 2배 가까이 빨라짐), NULL이 없을 때 `NOT IN`을 안티조인으로 변환, 비동기 I/O 작업자 수 자동 조절.
- **기본값·보안 변경:** JIT 기본 꺼짐, md5 인증 성공 시 경고, RADIUS 제거. 이전 버전에서 데이터를 옮기려면 덤프·복원, `pg_upgrade`, 논리 복제 중 하나가 필요하다.

## 2. 무엇이 바뀌었나

| 변화 | 무엇이 좋아지나 | 누가 신경 쓰나 |
|---|---|---|
| `REPACK (CONCURRENTLY)` | 갱신·삭제가 많은 테이블의 빈 공간(bloat)을 운영 중 정리 | 운영 DB를 멈출 수 없는 서비스 |
| `pg_plan_advice` / `pg_stash_advice` | 데이터가 바뀌어 느려진 실행 계획을 앱 수정 없이 고정 | 특정 질의가 갑자기 느려지는 팀 |
| 병렬 자동 청소, 청소 우선순위 점수 | 바쁜 시스템에서 청소가 밀리지 않음 | 쓰기가 많은 DB |
| `ON CONFLICT DO SELECT ... RETURNING` | "있으면 가져오고 없으면 만들기"를 한 왕복으로 | 수집·적재 파이프라인, API 개발자 |
| `COPY ... JSON` | 표를 JSON으로 바로 내보내기 | 데이터 교환, API 연동 |
| 윈도 함수 `IGNORE NULLS` | 빈 값을 건너뛴 이전·다음·첫·마지막 값 | 시계열·지표 분석 |
| `WAIT` (LSN까지 대기) | 복제본에서 방금 쓴 데이터 읽기 보장 | 읽기를 복제본으로 나누는 서비스 |
| 논리 복제 재시작 없이 시작, 시퀀스 복제 | 운영 중 복제·이전 쉬워짐 | 데이터 이전, CDC |
| `NOT IN` → 안티조인(NULL 없을 때), 외래 키 검사 개선 | 코드 수정 없이 빨라짐 | 모두 |
| JIT 기본 꺼짐 | 비용 추정이 부정확해 해가 되던 경우 방지 | 대형 분석 질의는 직접 켤지 판단 |
| md5 경고, RADIUS 제거 | 약한 인증 정리 | 오래된 접속 설정을 쓰는 곳 |

(모든 항목은 공식 공지와 릴리스 노트에서 확인한 내용이다.)

## 3. 기초 설명집과의 연결

각 변화는 이미 읽은 설명집의 원리 위에 있다.

- **REPACK과 bloat → MVCC:** PostgreSQL은 행을 고칠 때 새 버전을 만들고 옛 버전은 나중에 정리한다(트랜잭션과 ACID, DE-DB-002의 MVCC). 갱신이 많으면 정리되지 않은 공간이 쌓이고, 인덱스와 테이블이 커져 조회가 느려진다(B-Tree와 데이터베이스 인덱스, DE-DB-001). REPACK은 이 공간을 회수하고 인덱스 순서로 다시 배치할 수도 있다.
- **ON CONFLICT DO SELECT → 멱등한 적재:** 유니크 키 + upsert로 재시도에 안전한 적재를 만드는 원리(DE-DB-002 예제 2, 데이터 파이프라인과 ETL DE-PIPE-001)에서, 이제 기존 행도 돌려받을 수 있다.
- **NOT IN 최적화 → NULL의 3값 논리:** `NOT IN` 목록에 NULL이 하나라도 있으면 결과가 "알 수 없음"이 되어 행이 빠진다(집합과 명제논리 MATH-DM-001, SQL 조회·조인·집계 DE-SQL-001). 그래서 PostgreSQL 19도 **NULL이 없음이 보장될 때만** 안티조인으로 바꾼다. 4절에서 직접 확인해 보자.
- **IGNORE NULLS → 그룹별 최신값:** DE-SQL-001 예제 4에서 pandas `first()`가 칸마다 빈 값을 건너뛰어 다른 행의 값이 섞이는 문제를 봤다. `last_value(...) IGNORE NULLS`는 "마지막으로 알려진 값"을 의도적으로 고를 때 쓰는 도구다. 의도하지 않으면 같은 섞임이 생기니, 날짜와 값을 같은 행에서 가져와야 하는지 먼저 정한다.
- **WAIT → 일관성:** 원본과 복제본 사이의 지연은 분산 시스템의 일관성 문제다. "내가 쓴 것은 내가 읽을 수 있어야 한다"는 보장을 애플리케이션이 필요한 곳에서만 요청하게 했다.
- **md5 경고 → 인증:** 비밀번호를 빠른 해시로 다루는 방식의 약점(웹 보안 기초, 인증과 OAuth SE-AUTH-001). 공식 문서는 비밀번호 인증이 필요하면 SCRAM을 쓰라고 안내한다.

## 4. 직접 해보기

`NOT IN` 하위 목록에 NULL을 넣었다 뺐다 해 보세요. NULL이 하나만 있어도 남는 고객이 0명이 됩니다. PostgreSQL 19가 "NULL이 없을 때만" `NOT IN`을 안티조인으로 바꾸는 이유가 이것입니다.

```runjs
// @title NOT IN과 NULL: 목록에 NULL이 하나만 있어도 결과가 사라지는 이유
// @label NOT IN으로 남은 고객 수
// @param withNull | 주문 목록에 NULL 포함(0 = 없음, 1 = 있음) | 0 | 1 | 0 | 1
// @expect withNull=0 => 2
// @expect withNull=1 => 0
const customers = [1, 2, 3, 4];                    // 전체 고객 ID
const ordered = withNull ? [1, 2, null] : [1, 2];   // 주문한 고객 ID(하위 질의 결과)
// SQL의 3값 논리: 참(true), 거짓(false), 알 수 없음(null)
const neq = (a, b) => (a === null || b === null ? null : a !== b);
const and = (x, y) => (x === false || y === false ? false : (x === null || y === null ? null : true));
const notIn = (x, list) => list.reduce((acc, v) => and(acc, neq(x, v)), true);
const rows = customers.map((c) => {
  const r = notIn(c, ordered);
  return [c, r === null ? '알 수 없음' : (r ? '참' : '거짓'), r === true ? '남음' : '빠짐'];
});
table(rows, ['고객', 'NOT IN 주문 목록', 'WHERE 결과']);
const notExists = customers.filter((c) => !ordered.some((v) => v !== null && v === c));
log('NOT EXISTS로 쓰면 남는 고객:', notExists);
result(rows.filter((r) => r[2] === '남음').length);
```

## 5. 내 프로젝트와의 연결

아래 사실은 포트폴리오·저장소 원문(`content/profile.json`)에서 옮긴 것이다. 두 프로젝트가 어떤 PostgreSQL 버전을 쓰는지는 기록이 없다.

- **DeepVi — 매일 수집과 "같은 기사 한 번만":** 뉴스·재무·주가를 PostgreSQL에 저장했다. 기사 URL 같은 키에 유니크 제약을 두고 `INSERT ... ON CONFLICT (url) DO SELECT ... RETURNING id`로 쓰면, 새 기사든 이미 있는 기사든 ID를 한 번에 받아 뒤 단계(벡터 저장, 기업 연결)로 넘길 수 있다(적용 아이디어).
- **DeepVi — 최신 지표:** 화면에서 거시지표를 `groupby("indicator").first()`로 최신값만 고른다(저장소 `pages/stream.py`). DB에서 같은 일을 할 때 `IGNORE NULLS`를 쓸지는 "최신 행 그대로"와 "마지막으로 알려진 값" 중 무엇이 맞는지 먼저 정해야 한다(3절).
- **Preflight — 누적 병합과 테이블 정리:** 업로드마다 많은 행을 갱신하고, 빠진 행도 지우지 않고 단계로 관리한다(ADR-05). 갱신이 쌓이는 테이블은 bloat가 생기기 쉬워, 사내 서버 한 대로 운영하는 환경에서 업무 중단 없이 정리할 수 있는 `REPACK (CONCURRENTLY)`가 쓸모 있다. 점검 질문: 현재 버전과 테이블 크기 추이를 확인했는가?
- **Preflight — 업그레이드 절차:** 개발/운영 서버를 분리했고 DB 변경은 더하기만 한다(11.10). 메이저 업그레이드는 덤프·복원이나 `pg_upgrade`가 필요하므로, 개발 서버에서 먼저 `pg_upgrade`와 E2E 시험을 해 보고 운영에 적용하는 순서가 이 원칙과 맞는다. 백업·복원 스크립트(PowerShell)로 되돌릴 길도 미리 확인한다(배포와 환경 분리 OPS-DEPLOY-001).
- **두 프로젝트 공통 — 인증:** 접속 설정이 md5 비밀번호 방식이면 19에서 경고가 뜬다. SCRAM으로 바꾸는 것이 공식 안내다.

## 6. 한계·확인 필요

- **기준일 2026-11-28.** 이 브리프는 출시 9일 뒤 공식 공지와 릴리스 노트로 작성했다. 마이너 버전(19.1 등)에서 버그 수정이나 동작 변경이 있을 수 있다.
- **성능 수치:** "대량 삽입 2배 가까이 빨라짐"은 공지에 실린 PostgreSQL 프로젝트의 시험 결과다. 실제 효과는 스키마와 작업량에 따라 다르므로 직접 재야 한다.
- **확장 기능:** `pg_plan_advice`·`pg_stash_advice`는 확장으로 제공된다. 사용법과 제약은 버전별 문서를 확인해야 한다.
- **업그레이드 호환성:** 릴리스 노트의 "Migration to Version 19"에 호환성에 영향을 주는 변경 목록이 있다(예: `io_workers` 설정 제거와 대체, JIT 기본값 변경). 업그레이드 전에 이 목록을 확인한다.
- **관리형 DB:** 클라우드 관리형 PostgreSQL이 19를 언제 지원할지는 제공사마다 다르다(확인 필요).

## 7. 이해 확인 및 면접 질문

<details class="qa" data-type="concept"><summary>Q1. PostgreSQL 19가 NOT IN을 안티조인으로 바꾸는 최적화를 "NULL이 없을 때만" 적용하는 이유는?</summary>

**정답.** 하위 목록에 NULL이 있으면 `x NOT IN (…)`의 결과가 참이 아니라 "알 수 없음"이 되어 행이 빠지는데, 안티조인(NOT EXISTS와 같은 의미)은 그 행을 남긴다. 두 의미가 달라지므로, NULL이 없음이 보장될 때만 바꿔도 결과가 같다.

**해설.** 4절 직접 해보기에서 NULL 하나로 남는 고객이 2명에서 0명이 되는 것을 확인할 수 있다(MATH-DM-001의 3값 논리).

</details>

<details class="qa" data-type="concept"><summary>Q2. 갱신·삭제가 많은 테이블에 빈 공간(bloat)이 생기는 이유를 PostgreSQL의 동작으로 설명하라.</summary>

**정답.** MVCC 방식이라 행을 고치면 새 버전을 만들고 옛 버전은 바로 지우지 않으며, 나중에 청소로 공간을 재사용 가능하게 만든다. 청소가 밀리거나 공간이 파편화되면 테이블·인덱스가 실제 데이터보다 커진다.

**해설.** VACUUM은 공간을 재사용 가능하게 할 뿐 크기를 줄이지 않는 경우가 많고, 크기를 줄이려면 REPACK(이전에는 VACUUM FULL)이 필요하다(DE-DB-002).

</details>

<details class="qa" data-type="judgment"><summary>Q3. 사내 서버 한 대로 운영하는 업무 시스템을 PostgreSQL 19로 올릴지 판단하려 한다. 무엇을 확인하겠는가?</summary>

**정답.** 현재 버전과 지원 종료 일정, 릴리스 노트의 호환성 변경 목록(설정 제거·기본값 변경), 새 기능이 실제로 필요한지(bloat, upsert 패턴), 개발 서버에서 `pg_upgrade` 리허설과 전체 시험, 백업·복원 시간(RTO), 되돌릴 계획을 확인한다. 출시 직후보다 첫 마이너 버전 이후를 기다리는 선택도 있다.

**해설.** 새 기능의 이점과 업그레이드 위험을 함께 보는 판단이다(OPS-DEPLOY-001).

</details>

<details class="qa" data-type="applied"><summary>Q4. 뉴스 수집 파이프라인에서 기사 URL로 "있으면 ID를 가져오고 없으면 새로 넣어 ID를 받는" 쿼리를 PostgreSQL 19 기준으로 쓰면?</summary>

**정답.** `INSERT INTO news (url, title, published_at) VALUES (…) ON CONFLICT (url) DO SELECT RETURNING id;` (url에 유니크 제약 필요). 동시에 같은 기사를 처리할 수 있으면 공식 문서의 잠금 옵션(FOR UPDATE 등) 필요 여부를 확인한다.

**해설.** 이전에는 `DO NOTHING` 뒤에 따로 SELECT를 하거나, 의미 없는 `DO UPDATE`로 행을 돌려받는 우회를 썼다. 정확한 문법은 PostgreSQL 19 INSERT 문서를 따른다.

</details>

## 8. 선행·후속 학습

- 선행: SQL 조회·조인·집계(DE-SQL-001), 트랜잭션과 ACID(DE-DB-002)
- 함께 보기: B-Tree와 데이터베이스 인덱스(DE-DB-001), 집합과 명제논리(MATH-DM-001), 데이터 파이프라인과 ETL(DE-PIPE-001), 인증과 OAuth(SE-AUTH-001), 배포와 환경 분리(OPS-DEPLOY-001)
- 더 나아가기: PostgreSQL 19 릴리스 노트 전체, 논리 복제와 CDC, 실행 계획 읽기

## 9. 참고 자료

출처는 아래 패널에 있다. 모든 기능 설명은 2026-11-28에 PostgreSQL 공식 공지(2026-11-19)와 PostgreSQL 19 릴리스 노트·문서 페이지를 직접 열어 확인했다. 4절 실행 블록은 SQL 표준의 3값 논리를 JavaScript로 흉내 낸 것이며 PostgreSQL 코드가 아니다. 이 브리프는 2027-02-26까지 유효하며, 이후에는 최신 문서로 다시 확인해야 한다.
