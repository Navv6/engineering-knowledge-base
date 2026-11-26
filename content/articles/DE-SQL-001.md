---json
{
  "id": "DE-SQL-001",
  "concept": "sql-basics",
  "track": "engineering",
  "title": "SQL 조회·조인·집계",
  "title_en": "SQL Querying, Joins and Aggregation",
  "difficulty": "입문",
  "depth": ["L1", "L2", "L3"],
  "reading_minutes": 15,
  "objectives": [
    "SELECT 문이 실제로 처리되는 순서(FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY)를 설명할 수 있다.",
    "INNER JOIN과 LEFT JOIN의 차이, 그리고 LEFT JOIN 뒤 WHERE 조건이 결과를 바꾸는 함정을 예로 보일 수 있다.",
    "GROUP BY 집계와 NULL 처리(COUNT(*) vs COUNT(칸))를 정확히 계산할 수 있다.",
    "윈도 함수로 '그룹별 최신 한 건'을 고르고, 같은 일을 하는 pandas 코드와 대응시킬 수 있다."
  ],
  "prerequisites": ["관계형 데이터 모델링(DE-MODEL-001)", "집합과 명제논리(MATH-DM-001)"],
  "roles": ["Data Engineer", "Data Analyst", "FDE"],
  "tags": ["SQL", "조인", "집계", "윈도 함수", "PostgreSQL"],
  "status": "published",
  "version": 1,
  "created_at": "2026-11-26",
  "updated_at": "2026-11-26",
  "verified_at": "2026-11-26",
  "sources": [
    { "title": "PostgreSQL Documentation: Queries (Table Expressions, Select Lists, Combining Queries)", "url": "https://www.postgresql.org/docs/current/queries.html", "source_type": "official-doc" },
    { "title": "PostgreSQL Documentation: Window Functions (Tutorial)", "url": "https://www.postgresql.org/docs/current/tutorial-window.html", "source_type": "official-doc" },
    { "title": "PostgreSQL Documentation: Aggregate Functions", "url": "https://www.postgresql.org/docs/current/functions-aggregate.html", "source_type": "official-doc" },
    { "title": "Date, C. J. SQL and Relational Theory, 3rd ed. O'Reilly, 2015", "source_type": "textbook" }
  ]
}
---

## 0. 한눈에 보기 (입문)

### 한 줄 요약
**SQL**은 표(테이블)에 "어떤 행을, 어떤 칸으로, 어떻게 묶어서" 보여 달라고 묻는 언어다. 핵심은 세 가지다: **거르기(WHERE), 잇기(JOIN), 묶어 세기(GROUP BY)**. 가장 흔한 실수는 잇는 방식과 빈칸(NULL)을 잘못 다뤄 행이 조용히 사라지거나 늘어나는 것이다.

### 쉬운 설명
엑셀에 시트가 두 개 있다고 하자. "기업 목록" 시트(코드, 이름, 업종)와 "재무비율" 시트(코드, 연도, 지표, 값).

- **거르기:** 재무비율 중 "2024년 부채비율"만 보기 → WHERE
- **잇기:** 기업 코드를 기준으로 두 시트를 옆에 붙이기(엑셀의 VLOOKUP과 비슷) → JOIN
- **묶어 세기:** 업종별 평균 부채비율 → GROUP BY

잇는 방식에 따라 결과가 달라진다. "재무비율이 있는 기업만"(INNER JOIN)인지, "기업은 전부 보여 주고 비율이 없으면 빈칸"(LEFT JOIN)인지. 대시보드에서 어떤 기업이 사라졌다면 대개 여기서 문제가 생긴 것이다.

### 내 프로젝트에서는
- **DeepVi는 PostgreSQL에 재무·주가·뉴스·ESG·거시지표를 저장하고 FastAPI로 조회했다**(README 기재). 화면 코드(`pages/stream.py`)에서는 받은 데이터를 pandas로 다시 가공하는데, 이 가공이 SQL과 정확히 대응한다.
  - 재무비율을 (연도, 지표, 값) 형태로 받아 `pivot(index="year", columns="metric", values="value")`로 연도 × 지표 표를 만든다 → SQL의 조건부 집계(피벗)와 같다.
  - 거시지표를 날짜 내림차순으로 정렬한 뒤 `groupby("indicator").first()`로 지표별 최신값만 고른다 → SQL의 윈도 함수 `ROW_NUMBER() OVER (PARTITION BY indicator ORDER BY date DESC)`와 같다(6절 예제 4).
  - FastAPI 쪽 SQL은 이 저장소에 없어 확인하지 못했다.
- **Preflight는 전 모듈을 PostgreSQL로 옮겼다(08.15)**(포트폴리오 기재). '지금 목록'만 세면 지난주 숫자가 바뀔 수 있음을 발견해 산출식마다 세는 범위를 명시한 것은, 결국 "어떤 테이블의 어떤 행을 WHERE로 고르는가"의 문제다.

### 먼저 알면 좋은 것
- 관계형 데이터 모델링(DE-MODEL-001): 테이블, 기본 키, 외래 키
- 집합과 명제논리(MATH-DM-001): WHERE의 AND/OR/NOT, NULL의 3값 논리

### 쉬운 확인 질문

<details class="qa" data-type="easy"><summary>Q1. 기업 4곳 중 3곳에만 2024년 부채비율이 있다. "기업 목록 LEFT JOIN 부채비율"의 결과는 몇 행인가?</summary>

**정답.** 4행(비율이 없는 기업은 값 칸이 비어 있음).

**해설.** LEFT JOIN은 왼쪽 표의 행을 모두 남긴다. INNER JOIN이면 3행이다.

</details>

<details class="qa" data-type="easy"><summary>Q2. 값이 (120, NULL)인 두 행에 COUNT(*)와 COUNT(value)를 하면?</summary>

**정답.** COUNT(*)는 2, COUNT(value)는 1.

**해설.** COUNT(*)는 행 수, COUNT(칸)은 그 칸이 NULL이 아닌 행 수다. AVG도 NULL을 빼고 계산한다.

</details>

## 1. 핵심 요약

- **논리적 처리 순서:** FROM/JOIN → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → LIMIT. 그래서 WHERE에서는 SELECT에서 지은 별칭을 못 쓰고, 집계 조건은 HAVING에 쓴다.
- **INNER JOIN:** 양쪽에 짝이 있는 행만. **LEFT JOIN:** 왼쪽은 모두, 짝이 없으면 오른쪽 칸 NULL.
- **LEFT JOIN 함정:** 오른쪽 표의 조건을 WHERE에 두면 NULL 행이 걸러져 INNER JOIN이 된다. 조건은 ON에 둔다.
- **행 수 폭증:** 일대다 관계를 잇고 나서 합계를 내면 같은 값이 여러 번 더해진다. 잇기 전에 집계하거나 키를 확인한다.
- **집계와 NULL:** `COUNT(*)`는 행 수, `COUNT(칸)`·`SUM`·`AVG`는 NULL을 무시한다.
- **윈도 함수:** 행을 줄이지 않고 그룹 안에서 순위·누적·이전 값을 계산. "그룹별 최신 한 건"의 표준 해법.

## 2. 개념과 등장 배경

1970년 에드거 코드(Edgar Codd)가 관계형 모델을 발표했고(DE-MODEL-001), IBM의 도널드 체임벌린(Donald Chamberlin)과 레이먼드 보이스(Raymond Boyce)가 1974년 이를 다루는 질의 언어 SEQUEL(이후 SQL)을 만들었다. 1986년 ANSI, 1987년 ISO 표준이 되었고, 이후 표준이 개정되며 2003년 무렵 윈도 함수가 들어갔다.

SQL은 "어떻게 찾을지"가 아니라 "무엇을 원하는지"를 적는 **선언형** 언어다. 실행 방법(어느 인덱스를 쓰고 어떤 순서로 잇는지)은 DB의 최적화기가 정한다(DE-DB-001). 50년이 넘었지만 데이터 분석·백엔드·데이터 엔지니어링의 공통 언어로 남아 있고, pandas 같은 도구의 연산도 대부분 SQL 연산과 일대일로 대응한다.

## 3. 직관적 설명 및 기초 이론

### 예제 테이블 (설명용)

`company`

| code | name | sector |
|---|---|---|
| A | 알파 | 반도체 |
| B | 베타 | 반도체 |
| C | 감마 | 자동차 |
| D | 델타 | 자동차 |

`ratio`

| code | year | metric | value |
|---|---|---|---|
| A | 2023 | 부채비율 | 40 |
| A | 2024 | 부채비율 | 35 |
| B | 2024 | 부채비율 | 80 |
| C | 2024 | 부채비율 | 120 |
| C | 2024 | ROE | NULL |

### 조인의 종류

| 종류 | 결과 | 집합으로 보면 |
|---|---|---|
| INNER JOIN | 양쪽에 짝이 있는 행 | 교집합 |
| LEFT JOIN | 왼쪽 전부 + 짝 있으면 오른쪽 | 왼쪽 전체 |
| FULL JOIN | 양쪽 전부 | 합집합 |
| 반조인(`WHERE EXISTS`) | 짝이 있는 왼쪽 행(중복 없이) | 왼쪽 ∩ 조건 |
| 안티조인(`WHERE NOT EXISTS`) | 짝이 없는 왼쪽 행 | 왼쪽 − 오른쪽 |

## 4. 엄밀한 정의와 작동 원리

### 조인의 의미

INNER JOIN은 두 표의 모든 행 쌍(곱집합) 중 ON 조건을 만족하는 쌍이다. 왼쪽 행 하나에 오른쪽 짝이 $k$개면 결과에 $k$행이 생긴다. LEFT JOIN은 여기에 짝이 0개인 왼쪽 행을 오른쪽 칸 NULL로 추가한 것이다.

### NULL과 조건

`NULL = 2024`의 결과는 참도 거짓도 아닌 **알 수 없음**이고, WHERE는 참인 행만 남긴다(MATH-DM-001의 3값 논리). LEFT JOIN으로 생긴 NULL 행에 `WHERE r.year = 2024`를 걸면 그 행이 사라진다.

### 집계

$$
\text{AVG}(x) = \frac{\sum_{x_i \ne \text{NULL}} x_i}{\text{COUNT}(x)}
$$

NULL은 분자·분모 모두에서 빠진다. NULL을 0으로 보고 싶다면 `COALESCE(x, 0)`을 명시해야 하며, 그러면 평균이 달라진다.

### 윈도 함수

```sql
ROW_NUMBER() OVER (PARTITION BY code ORDER BY year DESC)
```

`code`별로 묶은 뒤 `year` 내림차순으로 1, 2, 3 … 번호를 붙인다. 행이 줄지 않는다는 점이 GROUP BY와 다르다. 번호 1인 행만 고르면 "기업별 최신 연도 한 건"이 된다. PostgreSQL은 같은 일을 하는 `DISTINCT ON`도 제공한다.

## 5. 수식 및 기호 설명

| 구문 | 뜻 |
|---|---|
| `SELECT … FROM … WHERE` | 칸 고르기, 표, 행 거르기 |
| `JOIN … ON` | 표 잇기와 잇는 조건 |
| `GROUP BY … HAVING` | 묶기와 묶은 결과 거르기 |
| `COUNT(*)`, `COUNT(x)` | 행 수, NULL 아닌 값 수 |
| `OVER (PARTITION BY … ORDER BY …)` | 윈도 함수의 묶음과 순서 |
| `COALESCE(x, 0)` | NULL이면 0으로 |

## 6. 단계별 계산 또는 동작 예제

모든 결과는 3절의 표를 SQLite에 넣고 실제로 실행해 확인했다.

### 예제 1. INNER vs LEFT, 그리고 WHERE 함정

```sql
-- (a) INNER: 2024 부채비율이 있는 기업만
SELECT c.code, r.value FROM company c
JOIN ratio r ON c.code = r.code AND r.year = 2024 AND r.metric = '부채비율';
-- 결과 3행: A 35, B 80, C 120

-- (b) LEFT, 조건을 ON에
SELECT c.code, r.value FROM company c
LEFT JOIN ratio r ON c.code = r.code AND r.year = 2024 AND r.metric = '부채비율';
-- 결과 4행: A 35, B 80, C 120, D NULL

-- (c) LEFT, 조건을 WHERE에 (함정)
SELECT c.code, r.value FROM company c
LEFT JOIN ratio r ON c.code = r.code
WHERE r.year = 2024 AND r.metric = '부채비율';
-- 결과 3행: D가 사라짐 → 사실상 INNER JOIN
```

"모든 기업을 보여 주는 화면"에서 비율 없는 기업 D가 사라졌다면 (c)를 의심한다.

### 예제 2. 업종별 집계

```sql
SELECT c.sector, AVG(r.value), COUNT(*)
FROM company c JOIN ratio r ON c.code = r.code
WHERE r.year = 2024 AND r.metric = '부채비율'
GROUP BY c.sector;
```

결과: 반도체 평균 $(35 + 80)/2 = 57.5$(2곳), 자동차 120(1곳). 자동차의 D는 비율이 없어 평균에서 빠졌다. "자동차 업종 평균 120"을 보고할 때 표본이 1곳이라는 사실을 함께 적어야 한다.

### 예제 3. NULL과 집계

C의 2024년 행 두 개(부채비율 120, ROE NULL)에 대해 `COUNT(*) = 2`, `COUNT(value) = 1`, `AVG(value) = 120`. 지표가 섞인 표에서 지표를 거르지 않고 평균을 내면 의미 없는 값이 나온다는 점도 함께 기억한다.

### 예제 4. 그룹별 최신 한 건 (SQL과 pandas)

```sql
SELECT code, year, value FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY code ORDER BY year DESC) AS rn
  FROM ratio WHERE metric = '부채비율'
) t WHERE rn = 1;
-- 결과: A 2024 35, B 2024 80, C 2024 120
```

DeepVi 화면 코드의 거시지표 처리:

```python
df = df.sort_values(by="date", ascending=False)
latest = df.groupby("indicator").first().reset_index()
```

같은 일이다. 다만 pandas의 `first()`는 칸마다 "NULL이 아닌 첫 값"을 고르기 때문에, 최신 행의 어떤 칸이 비어 있으면 그 칸만 더 오래된 행의 값으로 채워질 수 있다(날짜와 값이 다른 행에서 섞일 위험). 행 단위로 정확히 고르려면 `drop_duplicates("indicator")`나 `head(1)`을 쓰는 것이 안전하다. pandas 3.0.5에서 직접 재현해 보면, 금리 지표의 최신 행(2025-11)의 값이 비어 있을 때 결과가 "날짜 2025-11, 값 3.5(2025-10의 값)"로 섞여 나온다. DeepVi 데이터에 실제로 빈 칸이 있었는지는 확인하지 못했으므로 점검 사항으로 남긴다.

### 예제 5. 일대다 조인 후 합계의 함정

`company`(4행)와 `ratio`(5행)를 코드로만 이으면 5행이 된다(A가 2행, C가 2행). 이 상태에서 기업 수를 `COUNT(*)`로 세면 5가 나와 실제 기업 수 3(짝이 있는 기업)과 다르다. 기업 수는 `COUNT(DISTINCT c.code)`로 세거나, 잇기 전에 한쪽을 먼저 집계한다.

## 7. 시각화와 해석

조인은 두 표를 나란히 놓고 키가 같은 행을 선으로 이어 그리면 이해가 쉽다. 선이 없는 왼쪽 행이 LEFT JOIN에서 NULL로 남는 행, 선이 여러 개인 행이 결과를 늘리는 행이다. 집합 그림(벤 다이어그램)으로는 INNER = 교집합, LEFT = 왼쪽 원 전체다(MATH-DM-001). 쿼리 결과의 행 수를 단계마다 확인하는 습관(조인 전 4행 → 후 5행?)이 오류를 가장 빨리 잡는다.

## 8. 기술 비교 및 선택 기준

| 작업 | SQL | pandas |
|---|---|---|
| 거르기 | `WHERE` | `df[cond]`, `query()` |
| 잇기 | `JOIN` | `merge(how="inner"/"left")` |
| 묶어 세기 | `GROUP BY` | `groupby().agg()` |
| 피벗 | 조건부 집계, `crosstab` 확장 | `pivot`, `pivot_table` |
| 그룹별 최신 | 윈도 함수, `DISTINCT ON` | 정렬 + `drop_duplicates` |

**판단:** 데이터가 크거나 여러 사용자가 같은 집계를 쓰면 DB에서 SQL로(인덱스·최적화기 활용, 데이터 전송 감소). 화면 하나에서만 쓰는 작은 후처리는 pandas도 괜찮다. 같은 지표를 두 곳에서 따로 계산하면 정의가 어긋나기 쉬우므로 한곳에 둔다(DE-DQ-001).

## 9. 실무 사례

- **대시보드 지표:** 기간·대상 범위를 WHERE로 명시하고, 산출식을 뷰(view)로 만들어 모든 화면이 같은 정의를 쓰게 한다.
- **데이터 품질 점검:** 안티조인으로 "참조 대상이 없는 행"(고아 행)을 찾는다.
- **보고서 피벗:** 연도 × 지표 표를 조건부 집계로 만든다.
- **최근 상태 조회:** 업무별 최신 이력 한 건을 윈도 함수로 고른다.

## 10. 기존 프로젝트와의 연결

아래 사실은 포트폴리오·저장소 원문(`content/profile.json`, DeepVi 저장소 `pages/stream.py`)에서 옮긴 것이다.

- **DeepVi — 저장과 조회:** PostgreSQL + FastAPI. 화면에서 재무비율을 연도 × 지표로 `pivot`하고(405행 부근), 거시지표를 날짜 내림차순 정렬 후 `groupby("indicator").first()`로 최신값을 고른다(1966행 부근). 예제 4의 `first()` 주의점은 데이터에 빈 칸이 있을 때만 문제가 된다.
- **DeepVi — 기업 비교:** 화면에서 비교 항목을 고르면 `sort_values`로 정렬해 막대로 보여 준다(1097행 부근). 비교 대상 중 값이 없는 기업이 정렬·표시에서 어떻게 처리되는지(N/A 표시)는 예제 1의 LEFT JOIN과 같은 문제다.
- **Preflight — 세는 범위:** 산출식마다 세는 범위(지금 목록·지난 기록·원본 누적)를 명시했다. SQL로는 "어느 테이블(현재/이력)에서, 어떤 WHERE로"를 산출식 정의에 포함한 것이다. 704개 업무 규칙 시험과 실제 DB 점검 64개가 이런 정의를 지킨다.

## 11. 가정·한계·흔한 오해·트레이드오프

- **오해: SQL은 쓴 순서대로 실행된다.** 논리적 순서는 FROM부터다(1절). 그래서 별칭·집계 조건 위치가 정해진다.
- **오해: LEFT JOIN이면 왼쪽 행이 항상 남는다.** WHERE에 오른쪽 조건을 두면 사라진다(예제 1 (c)).
- **오해: AVG는 모든 행의 평균이다.** NULL은 빠진다. 0으로 볼지 업무적으로 정해야 한다.
- **ORDER BY 없는 순서:** SQL은 순서를 보장하지 않는다. "첫 행"을 고르려면 반드시 정렬을 명시한다.
- **성능:** 큰 표의 조인·정렬은 인덱스 설계에 따라 수천 배 차이가 난다(DE-DB-001, SE-API-001의 페이지네이션).

## 12. 이해 확인 및 면접 질문

<details class="qa" data-type="concept"><summary>Q1. `SELECT sector, AVG(value) AS avg_v FROM … WHERE avg_v > 50 GROUP BY sector`는 왜 오류인가? 어떻게 고치나?</summary>

**정답.** WHERE는 GROUP BY와 SELECT보다 먼저 처리되어 집계 결과(별칭 avg_v)를 알 수 없다. 집계 조건은 `HAVING AVG(value) > 50`으로 쓴다.

**해설.** 논리적 처리 순서: WHERE(행 거르기) → GROUP BY → HAVING(그룹 거르기) → SELECT.

</details>

<details class="qa" data-type="concept"><summary>Q2. 고객 100명, 주문 300건(한 고객에 여러 주문)일 때 고객 LEFT JOIN 주문의 결과 행 수는 최소 몇인가?</summary>

**정답.** 최소 300행(주문이 없는 고객이 있으면 그 수만큼 더 많다).

**해설.** 주문마다 한 행씩 생기고, 주문이 없는 고객은 NULL 행 하나로 남는다. 주문 없는 고객이 20명이면 320행이다.

</details>

<details class="qa" data-type="judgment"><summary>Q3. 대시보드의 "전체 기업 수"가 지난달 444에서 이번 달 431로 줄었다는 문의가 왔다. 기업이 실제로 줄지 않았다면 무엇을 의심하겠는가?</summary>

**정답.** 기업 목록을 이번 달 데이터(재무·주가)와 INNER JOIN하거나 LEFT JOIN 뒤 WHERE로 거르고 있어서, 이번 달 데이터가 아직 없는 13곳이 빠졌을 가능성. 기업 수는 기업 목록에서 세고, 데이터 결측은 따로 "미수집 13곳"으로 보여 준다.

**해설.** 예제 1 (c)와 같은 구조다. 지표 정의와 결측 표시를 분리한다.

</details>

<details class="qa" data-type="applied"><summary>Q4. 업무 이력 테이블(task_id, status, changed_at)에서 업무별 현재 상태를 구하는 SQL을 쓰라.</summary>

**정답.**

```sql
SELECT task_id, status, changed_at FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY changed_at DESC) AS rn
  FROM task_history
) t WHERE rn = 1;
```

**해설.** 같은 시각에 변경이 두 건이면 순서가 정해지지 않으므로, 이력 ID 같은 두 번째 정렬 키를 추가하는 것이 안전하다.

</details>

## 13. 선행·후속 학습

- 선행: 관계형 데이터 모델링(DE-MODEL-001), 집합과 명제논리(MATH-DM-001)
- 함께 보기: B-Tree와 데이터베이스 인덱스(DE-DB-001), 트랜잭션과 ACID(DE-DB-002), 데이터 품질 관리(DE-DQ-001), 데이터 시각화 원칙(STAT-VIZ-001)
- 더 나아가기: 실행 계획 읽기(EXPLAIN), 공통 테이블 식(CTE)과 재귀 쿼리, 관계 대수

## 14. 참고 자료

출처는 아래 패널에 있다. 조인·집계·윈도 함수의 동작은 PostgreSQL 공식 문서를 따랐고, 6절 예제의 결과는 같은 표를 SQLite에서 실행해 확인했다(행 수 3·4·3, 평균 57.5, COUNT 2·1, 최신 행 A 35·B 80·C 120, 조인 5행). DeepVi 코드는 저장소 `pages/stream.py`를 직접 읽었다. pandas `first()`의 동작(칸별 첫 비결측값)은 pandas 3.0.5에서 재현해 확인했다.
