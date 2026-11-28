---json
{
  "id": "DE-PANDAS-001",
  "concept": "dataframe-pandas",
  "track": "engineering",
  "title": "데이터프레임과 pandas",
  "title_en": "DataFrames and pandas",
  "difficulty": "입문",
  "depth": ["L1", "L2"],
  "reading_minutes": 14,
  "objectives": [
    "데이터프레임을 '이름 붙은 칸을 가진 표'로 설명하고 SQL 표와 대응시킬 수 있다.",
    "필터, groupby 집계, merge, pivot을 SQL의 WHERE, GROUP BY, JOIN과 연결해 설명할 수 있다.",
    "결측값(NaN) 처리, merge 행 폭증, 숫자로 바뀌는 코드, groupby().first()의 칸별 동작 같은 함정을 찾아낼 수 있다.",
    "pandas 3.0의 주요 변화(Copy-on-Write 항상 적용, 기본 문자열 타입)를 알고 코드에 미치는 영향을 판단할 수 있다."
  ],
  "prerequisites": ["SQL 조회·조인·집계(DE-SQL-001)"],
  "roles": ["Data Engineer", "Data Analyst", "AI Native Developer"],
  "tags": ["데이터공학", "pandas", "데이터프레임", "Python", "결측값"],
  "status": "published",
  "version": 1,
  "created_at": "2026-11-28",
  "updated_at": "2026-11-28",
  "verified_at": "2026-11-28",
  "sources": [
    { "title": "McKinney, W. Python for Data Analysis, 3rd ed. O'Reilly, 2022", "source_type": "textbook" },
    { "title": "pandas documentation: User Guide", "url": "https://pandas.pydata.org/docs/user_guide/index.html", "source_type": "official-doc" },
    { "title": "pandas documentation: What's new in 3.0.0", "url": "https://pandas.pydata.org/docs/whatsnew/v3.0.0.html", "source_type": "official-doc" }
  ]
}
---

## 0. 한눈에 보기 (입문)

### 한 줄 요약
**pandas**는 Python에서 엑셀 시트 같은 표(**데이터프레임**)를 코드로 다루는 도구다. 거르고, 묶어서 합치고, 두 표를 잇는 일을 몇 줄로 할 수 있다. SQL과 하는 일이 거의 같아서, SQL을 알면 pandas가 쉽고 그 반대도 마찬가지다.

### 쉬운 설명
엑셀에서 하는 일을 떠올려 보자.

| 엑셀에서 | pandas에서 | SQL에서 |
|---|---|---|
| 시트 하나 | 데이터프레임(DataFrame) | 표(table) |
| 열(칸) 하나 | 시리즈(Series) | 열(column) |
| 필터 | `df[df["매출"] > 100]` | `WHERE 매출 > 100` |
| 피벗 테이블 | `pivot_table`, `groupby` | `GROUP BY` |
| VLOOKUP | `merge` | `JOIN` |
| 빈 칸 | `NaN`(결측값) | `NULL` |

엑셀과 다른 점은 **모든 과정이 코드로 남는다**는 것이다. 같은 작업을 내일 새 파일에 그대로 다시 돌릴 수 있고, 누가 무엇을 했는지 기록이 남는다. 대신 엑셀처럼 화면에서 바로 보이지 않아, 행 수가 갑자기 늘거나 빈 칸이 조용히 채워지는 실수를 놓치기 쉽다. 그래서 단계마다 **행 수와 빈 칸 수를 확인하는 습관**이 중요하다.

### 내 프로젝트에서는
- **DeepVi — 화면과 프롬프트 만들기:** 대시보드(Streamlit) 코드에서 pandas를 쓴다(저장소 `pages/stream.py` 직접 확인). 재무비율을 연도 × 지표 표로 `pivot`하고, 경쟁사 비교 표를 `apply(pd.to_numeric, errors='coerce')`로 숫자로 바꾸고, 거시지표는 날짜 내림차순 정렬 뒤 `groupby("indicator").first()`로 지표별 최신값을 골라 **LLM 프롬프트에 넣을 문장**("지표: 값 (기준일: 날짜)")을 만든다. 마지막 것은 빈 칸이 있으면 날짜와 값이 다른 행에서 섞일 수 있는 패턴이라 6절 예제 3에서 자세히 본다.
- **STT 평가:** 평가에 Python 도구(Whisper, NeMo, Sentence Transformers)를 썼다. 6,000개 문장의 모델별 WER·CER을 표로 모아 비교하는 일이 전형적인 데이터프레임 작업이지만, pandas를 썼다는 기록은 없다.
- **Preflight:** TypeScript·SheetJS·PostgreSQL로 만들어 pandas를 쓰지 않았다. 다만 "엑셀을 읽어 정규화하고, 원본 값으로 행을 잇고, 지난 값과 비교"하는 흐름은 pandas의 `read_excel`, `merge`, 비교 연산과 같은 문제를 푼 것이다.

### 먼저 알면 좋은 것
- SQL 조회·조인·집계(DE-SQL-001): WHERE, GROUP BY, JOIN, NULL
- 수의 표현과 부동소수점(CS-NUM-001): 숫자로 읽힌 코드의 앞자리 0 손실

### 쉬운 확인 질문

<details class="qa" data-type="easy"><summary>Q1. 엑셀의 VLOOKUP이나 SQL의 JOIN에 해당하는 pandas 기능은?</summary>

**정답.** `merge`(또는 인덱스 기준이면 `join`).

**해설.** 공통 키 칸을 기준으로 두 표의 행을 잇는다. 키가 중복되면 행이 곱으로 늘어날 수 있다(6절 예제 2).

</details>

<details class="qa" data-type="easy"><summary>Q2. pandas에서 빈 칸은 무엇으로 표시되며, 평균을 낼 때 기본적으로 어떻게 처리되는가?</summary>

**정답.** `NaN`(또는 `NA`)으로 표시되고, `mean()`은 기본적으로 빈 칸을 빼고 나머지 값으로 평균을 낸다.

**해설.** SQL의 `AVG`가 NULL을 빼는 것과 같다. 빈 칸이 0이 아니라 "모름"으로 취급된다는 점을 기억한다.

</details>

## 1. 핵심 요약

- **구조:** 데이터프레임 = 이름 붙은 열(시리즈)들 + 행 이름표(인덱스). 열마다 타입(dtype)이 하나다.
- **기본 동작:** 선택(`df["칸"]`, `loc`, `iloc`), 필터(불리언 조건), 정렬(`sort_values`), 새 칸 계산(벡터 연산).
- **집계:** `groupby(키).agg(...)` = SQL `GROUP BY`. `count`는 빈 칸 제외, `size`는 행 수.
- **결합:** `merge(on=키, how="left/inner/outer")` = SQL `JOIN`. `validate="one_to_many"`로 키 중복을 검사할 수 있다.
- **모양 바꾸기:** `pivot`/`pivot_table`(긴 표 → 넓은 표), `melt`(넓은 표 → 긴 표).
- **함정:** 빈 칸의 조용한 처리, merge 행 폭증, 숫자로 읽힌 코드, `groupby().first()`의 칸별 동작, `errors="coerce"`가 숨기는 변환 실패.
- **pandas 3.0(2026-01-21 출시, 작성일 기준 최신은 3.1.1):** Copy-on-Write가 항상 적용되고, 문자열 열의 기본 타입이 `str`이 되었다.

## 2. 개념과 등장 배경

2008년 웨스 매키니(Wes McKinney)가 금융회사에서 일하며 R의 데이터프레임 같은 도구를 Python에서 쓰려고 pandas를 만들기 시작했고, 2009년 공개했다. 이름은 계량경제학 용어 "panel data"에서 왔다. NumPy 배열 위에 이름 붙은 칸과 결측값 처리를 얹어, Python이 데이터 분석·머신러닝의 주 언어가 되는 데 큰 역할을 했다.

이후 대용량·속도 문제를 풀려는 도구들이 나왔다. 열 단위 메모리 형식 Apache Arrow, 병렬 처리 데이터프레임 Polars, 파일을 바로 SQL로 조회하는 DuckDB 등이다. pandas도 2.0부터 Arrow 기반 타입을 지원하고, 3.0에서는 문자열 기본 타입과 복사 규칙을 크게 바꿨다.

## 3. 직관적 설명 및 기초 이론

### 열 단위로 생각하기

pandas는 한 행씩 반복하는 대신 **한 열 전체를 한 번에** 계산하도록 설계되었다. `df["매출"] * 1.1`은 모든 행에 동시에 적용된다(벡터 연산). Python의 `for` 반복보다 수십~수백 배 빠르다. 행마다 함수를 부르는 `apply`나 `iterrows`는 편하지만 느리다.

### 긴 표와 넓은 표

| 긴 표(long) | | | 넓은 표(wide) | | |
|---|---|---|---|---|---|
| 연도 | 지표 | 값 | 연도 | ROE | 부채비율 |
| 2023 | ROE | 8.1 | 2023 | 8.1 | 120 |
| 2023 | 부채비율 | 120 | 2024 | 9.0 | 115 |
| 2024 | ROE | 9.0 | | | |

DB와 API는 보통 긴 표로 주고(칸이 늘어도 구조가 그대로), 차트와 사람이 보는 표는 넓은 표가 편하다. `pivot`이 긴 표를 넓게, `melt`가 넓은 표를 길게 바꾼다. DeepVi의 재무비율 화면이 정확히 이 변환(`pivot(index="year", columns="metric", values="value")`)을 한다.

## 4. 엄밀한 정의와 작동 원리

### 인덱스와 정렬 맞춤

두 시리즈를 더하면 **인덱스(행 이름표)가 같은 것끼리** 더한다. 한쪽에만 있는 이름표는 결과가 NaN이 된다. 편리하지만, 의도치 않게 이름표가 어긋나면 조용히 NaN이 생긴다.

### groupby: 나누기 → 적용 → 합치기

`df.groupby("회사")["매출"].mean()`은 (1) 회사별로 행을 나누고, (2) 각 묶음에 평균을 적용하고, (3) 결과를 하나의 표로 합친다. SQL의 `SELECT 회사, AVG(매출) FROM df GROUP BY 회사`와 같다. 키가 빈 칸인 행은 기본적으로 빠진다(`dropna=False`로 포함).

### merge의 행 수

키 값 $k$가 왼쪽에 $a_k$번, 오른쪽에 $b_k$번 나오면 inner merge 결과에는 $a_k \times b_k$행이 생긴다. 전체 행 수는 $\sum_k a_k b_k$. 양쪽 모두 키가 중복되면(다대다) 행이 곱으로 늘어난다(관계형 데이터 모델링, DE-MODEL-001).

### 결측값

숫자 열의 빈 칸은 `NaN`(부동소수점의 특수값, CS-NUM-001), 3.0의 문자열 열은 `NaN`이 빈 칸 표시로 쓰인다. 집계 함수는 기본적으로 빈 칸을 건너뛴다(`skipna=True`). `NaN == NaN`은 거짓이므로 비교 대신 `isna()`를 쓴다.

### pandas 3.0의 변화

- **Copy-on-Write 항상 적용:** 다른 데이터프레임에서 꺼낸 일부(필터 결과 등)를 고쳐도 원본이 바뀌지 않는다. 예전의 `SettingWithCopyWarning` 혼란이 사라졌다. 원본을 고치려면 원본에 직접 `df.loc[조건, "칸"] = 값`으로 쓴다.
- **기본 문자열 타입:** 문자열 열이 예전의 `object` 대신 전용 `str` 타입으로 만들어진다.

## 5. 수식 및 기호 설명

| 코드 | 뜻 |
|---|---|
| `df.loc[행 조건, "칸"]` | 이름표·조건으로 선택(쓰기도 가능) |
| `df.iloc[0:5]` | 위치(0부터)로 선택 |
| `isna()`, `notna()` | 빈 칸 여부 |
| `count()` vs `size()` | 빈 칸 제외 개수 vs 전체 행 수 |
| `how="left"` | 왼쪽 표의 행을 모두 유지하는 결합(LEFT JOIN) |
| `dtype` | 열의 타입(int64, float64, str, datetime64 등) |

## 6. 단계별 계산 또는 동작 예제

### 예제 1. 집계와 빈 칸

```python
sales = pd.DataFrame({"company": ["A", "A", "B", "B", "B"],
                      "rev": [100, 120, 80, 90, None]})
sales.groupby("company").agg(mean=("rev", "mean"), n=("rev", "count"), size=("rev", "size"))
```

| company | mean | n | size |
|---|---|---|---|
| A | 110.0 | 2 | 2 |
| B | 85.0 | 2 | 3 |

B의 평균은 빈 칸을 뺀 $(80 + 90) / 2 = 85$다. 빈 칸을 0으로 봤다면 $170 / 3 \approx 56.7$이 된다. 무엇이 맞는지는 빈 칸의 의미(아직 집계 안 됨 vs 실제 0)에 달려 있다. `n`과 `size`를 함께 보면 빈 칸이 몇 개 빠졌는지 드러난다.

### 예제 2. merge 행 폭증

왼쪽 표의 키가 1, 1, 2이고 오른쪽 표의 키도 1, 1, 2이면, 키 1은 $2 \times 2 = 4$행, 키 2는 $1 \times 1 = 1$행으로 결과는 **5행**이다. 원래 3행이었는데 늘어났다. `merge(..., validate="one_to_many")`를 쓰면 왼쪽 키가 유일하지 않을 때 `MergeError`로 멈춘다. merge 전후 행 수를 확인하는 습관이 가장 싸고 강력한 검사다.

### 예제 3. `groupby().first()`가 행을 섞는 경우

DeepVi는 거시지표를 날짜 내림차순 정렬 뒤 `groupby("indicator").first()`로 최신값을 골라 프롬프트 문장으로 만든다(`pages/stream.py`의 `format_macro`). `first()`는 **칸마다** "빈 칸이 아닌 첫 값"을 고른다. 최신 행의 값이 비어 있으면:

| indicator | date | value |
|---|---|---|
| CPI | 2026-10 | (빈 칸) |
| CPI | 2026-09 | 3.1 |

결과는 `CPI, 2026-10, 3.1`이다. 날짜는 10월, 값은 9월 것이다. 프롬프트에는 "CPI: 3.1 (기준일: 2026-10)"이라는 틀린 문장이 들어간다. 행을 통째로 고르려면 `df.groupby("indicator").head(1)`이나 `drop_duplicates("indicator")`를 쓴다(이 경우 결과는 `CPI, 2026-10, 빈 칸`으로 "값 없음"이 드러난다). pandas 3.0.5에서 직접 실행해 확인한 동작이다. 실제 DeepVi 데이터에 빈 칸이 있었는지는 확인하지 못했다.

### 직접 해보기

```runjs
// @title groupby().first()는 칸마다 빈 칸을 건너뛴다
// @label first()가 고른 CPI 값
// @param missing | 최신 행(2026-10)의 값이 비어 있음(0 = 아니오, 1 = 예) | 0 | 1 | 1 | 1
// @expect missing=1 => 3.1
// @expect missing=0 => 3.2
const rows = [  // 날짜 내림차순으로 정렬된 상태
  { indicator: 'CPI', date: '2026-10', value: missing ? null : 3.2 },
  { indicator: 'CPI', date: '2026-09', value: 3.1 },
  { indicator: '금리', date: '2026-10', value: 3.25 },
  { indicator: '금리', date: '2026-09', value: 3.5 },
];
const groups = [...new Set(rows.map((r) => r.indicator))];
// pandas first(): 칸마다 null이 아닌 첫 값
const firstCellwise = groups.map((g) => {
  const gr = rows.filter((r) => r.indicator === g);
  const pick = (k) => (gr.find((r) => r[k] !== null) || {})[k] ?? null;
  return { indicator: g, date: pick('date'), value: pick('value') };
});
// head(1): 행을 통째로
const firstRow = groups.map((g) => rows.find((r) => r.indicator === g));
table(firstCellwise.map((r) => [r.indicator, r.date, r.value ?? '빈 칸']), ['first() 지표', '날짜', '값']);
table(firstRow.map((r) => [r.indicator, r.date, r.value ?? '빈 칸']), ['head(1) 지표', '날짜', '값']);
const cpi = firstCellwise.find((r) => r.indicator === 'CPI');
log(`프롬프트 문장(first): CPI: ${cpi.value} (기준일: ${cpi.date})`);
result(cpi.value);
```

### 예제 4. 숫자로 읽힌 코드

CSV에 `code` 칸이 `00715`, `01234`이면 `pd.read_csv`는 숫자로 추측해 `715`, `1234`로 읽는다. `pd.read_csv(..., dtype={"code": str})`로 문자열을 지정해야 `"00715"`가 유지된다. `read_excel`도 같다. 식별자는 읽는 순간부터 문자열로 지정한다(CS-NUM-001).

## 7. 시각화와 해석

pandas의 `df.plot()`은 matplotlib으로 빠르게 그림을 그린다. 탐색 단계에서는 `describe()`(요약 통계), `value_counts()`(범주별 개수), `isna().sum()`(칸별 빈 칸 수)을 먼저 보고, 분포는 히스토그램, 두 변수 관계는 산점도로 본다(데이터 시각화 원칙, STAT-VIZ-001; 상관과 공분산, STAT-CORR-001). 긴 표 형태가 대부분의 차트 도구(seaborn, Plotly)에 넣기 좋다.

## 8. 기술 비교 및 선택 기준

| 도구 | 강점 | 맞는 경우 |
|---|---|---|
| pandas | 생태계, 문서, 엑셀·DB 입출력 | 메모리에 들어가는 크기(수백만 행 이하)의 분석·전처리 |
| SQL(PostgreSQL 등) | 대용량, 동시 사용, 무결성 | 저장·공유·운영 데이터, 서버에서 집계 후 가져오기 |
| Polars | 빠름, 병렬, 지연 실행 | 큰 파일, 속도가 중요한 파이프라인 |
| DuckDB | 파일(Parquet, CSV)을 바로 SQL로 | 로컬 분석, SQL이 편한 사람 |
| 엑셀 | 즉시 보임, 비개발자 공유 | 작은 표, 일회성 확인 |

원칙: **줄일 수 있는 것은 DB에서 줄여서 가져온다.** 수백만 행을 가져와 pandas에서 거르기보다 SQL `WHERE`와 `GROUP BY`로 필요한 만큼만 가져오는 것이 빠르고 안전하다(DE-SQL-001).

## 9. 실무 사례

- **데이터 품질 점검:** 적재 전에 `isna().sum()`, `duplicated().sum()`, 값 범위 검사를 코드로 남겨 매번 돌린다(데이터 품질 관리, DE-DQ-001).
- **평가 결과 집계:** 모델별·데이터셋별 지표를 긴 표로 쌓고 `pivot_table`로 비교표를 만든다.
- **LLM 컨텍스트 만들기:** DB나 API 결과를 데이터프레임으로 정리해 문장으로 바꾸는 단계에서 값이 섞이거나 빠지면 LLM이 그대로 믿고 답한다. 이 단계의 출력도 테스트 대상이다(RAG 검색 및 평가, AI-RAG-001).
- **반복 작업 자동화:** 매주 받는 엑셀을 읽어 정리·병합하는 일을 스크립트로 만들면, 사람이 옮겨 적는 실수가 사라진다(데이터 파이프라인과 ETL, DE-PIPE-001).

## 10. 기존 프로젝트와의 연결

아래 사실은 포트폴리오·저장소 원문(`content/profile.json`)과 DeepVi 저장소 코드(`pages/stream.py`)에서 확인한 것이다.

- **DeepVi — 거시지표 프롬프트(`format_macro`):** 예제 3의 패턴이다. 점검 질문: 거시지표 API 응답에 값이 빈 행이 올 수 있는가? 올 수 있다면 `head(1)`로 바꾸고, 값이 비면 "값 없음"으로 표시하거나 바로 이전 값을 쓰되 그 날짜를 함께 적는 규칙을 정한다.
- **DeepVi — 경쟁사 비교 표:** `apply(pd.to_numeric, errors='coerce')`는 숫자로 바꿀 수 없는 값을 조용히 NaN으로 만든다. "1,234" 같은 쉼표 숫자나 "N/A" 문자열이 섞이면 차트에서 "N/A"로만 보이고 원인이 드러나지 않는다. 변환 전후 NaN 개수를 비교해 기록하면 원인을 찾기 쉽다.
- **DeepVi — 재무비율 pivot:** `pivot(index="year", columns="metric")`은 같은 연도·지표 조합이 두 번 나오면 오류를 낸다. 이 오류는 중복 데이터를 알려 주는 유용한 신호이므로, `pivot_table(aggfunc="first")`로 바꿔 덮지 않는 것이 좋다.
- **Preflight — 같은 문제의 다른 해법:** Preflight는 원본 값으로 행을 잇고(ADR-03), 못 이으면 엉뚱한 행에 붙이지 않고 제자리에 남긴다. pandas로 같은 일을 하면 `merge(how="left", indicator=True)`로 이어지지 않은 행을 찾아 따로 처리하는 방식이 된다.

## 11. 가정·한계·흔한 오해·트레이드오프

- **오해: pandas는 엑셀보다 항상 정확하다.** 코드가 조용히 빈 칸을 건너뛰거나 행을 늘리면 엑셀보다 발견이 늦다. 행 수·빈 칸 수 확인이 필수다.
- **오해: `first()`는 첫 행을 고른다.** 칸마다 빈 칸이 아닌 첫 값을 고른다(예제 3).
- **메모리 한계:** 데이터 전체를 메모리에 올린다. 파일 크기의 수 배 메모리가 필요할 수 있다.
- **반복문:** `iterrows`와 행 단위 `apply`는 느리다. 가능하면 열 단위 연산으로 바꾼다.
- **버전 차이:** 3.0에서 복사 규칙과 문자열 타입이 바뀌어, 예전 코드의 연쇄 대입(`df[조건]["칸"] = 값`)은 원본을 바꾸지 않는다. 업그레이드 전에 경고와 테스트를 확인한다.

## 12. 이해 확인 및 면접 질문

<details class="qa" data-type="concept"><summary>Q1. 왼쪽 표의 키가 A, A, A, B이고 오른쪽 표의 키가 A, A, B, B일 때 inner merge의 결과 행 수는?</summary>

**정답.** 8행. A는 $3 \times 2 = 6$행, B는 $1 \times 2 = 2$행.

**해설.** 키별로 양쪽 개수를 곱해 더한다. 원래 4행이던 왼쪽 표가 두 배로 늘었다.

</details>

<details class="qa" data-type="concept"><summary>Q2. 다음 SQL과 같은 pandas 코드는? SELECT dept, COUNT(*) AS n FROM emp WHERE salary > 3000 GROUP BY dept</summary>

**정답.** `emp[emp["salary"] > 3000].groupby("dept").size().rename("n")` (또는 `.agg(n=("salary", "size"))`).

**해설.** `COUNT(*)`는 행 수이므로 `size`가 맞다. 특정 칸의 `count`는 그 칸의 빈 칸을 뺀다.

</details>

<details class="qa" data-type="judgment"><summary>Q3. 매일 수백만 행이 쌓이는 DB에서 지난달 회사별 합계를 대시보드에 보여 주려 한다. 전체를 pandas로 읽어 groupby하는 방식과 비교해 어떻게 하겠는가?</summary>

**정답.** DB에서 `WHERE`로 지난달만 거르고 `GROUP BY`로 회사별 합계를 계산해 결과(회사 수만큼의 행)만 가져온다. 필요하면 집계표를 미리 만들어 둔다(DE-DW-001). pandas는 가져온 작은 결과를 다듬고 그리는 데 쓴다.

**해설.** 데이터를 옮기는 비용과 메모리를 줄이고, DB의 인덱스와 집계 최적화를 활용한다.

</details>

<details class="qa" data-type="applied"><summary>Q4. 엑셀 두 개(주문, 품목 마스터)를 pandas로 품목 코드 기준 결합했더니 주문 수가 1,000건에서 1,180건으로 늘었고, 일부 품목명이 비어 있다. 원인과 점검 순서는?</summary>

**정답.** 행이 늘어난 것은 품목 마스터에 같은 코드가 중복되어 있기 때문이다(`duplicated("code")`로 확인, `validate="many_to_one"`으로 막기). 품목명이 빈 것은 코드가 결합되지 않은 것으로, 한쪽은 문자열 "00715", 다른 쪽은 숫자 715처럼 타입·앞자리 0이 다르거나 공백이 섞였을 가능성이 크다. 두 파일 모두 `dtype={"code": str}`로 읽고 공백을 정리한 뒤, `indicator=True`로 결합되지 않은 행을 따로 확인한다.

**해설.** merge 전후 행 수와 결합 실패 행 수를 매번 확인하면 두 문제를 바로 잡을 수 있다.

</details>

## 13. 선행·후속 학습

- 선행: SQL 조회·조인·집계(DE-SQL-001)
- 함께 보기: 수의 표현과 부동소수점(CS-NUM-001), 데이터 품질 관리(DE-DQ-001), 관계형 데이터 모델링(DE-MODEL-001), 데이터 파이프라인과 ETL(DE-PIPE-001)
- 더 나아가기: 컬럼 저장과 Parquet(DE-COL-001, 계획), Polars·DuckDB, 시계열 처리(`resample`, `rolling`)

## 14. 참고 자료

출처는 아래 패널에 있다. 예제 1~4의 결과(평균 110·85, count 2·2, size 2·3, merge 5행과 `MergeError`, `first()` 결과 "2026-10, 3.10", `read_csv`의 715·1234와 문자열 지정 시 "00715"·"01234", 3.0의 기본 문자열 타입 `str`, Copy-on-Write로 원본이 바뀌지 않음)는 pandas 3.0.5에서 직접 실행해 확인했다. DeepVi 코드(`format_macro`의 `groupby("indicator").first()`, 경쟁사 비교 표의 `apply(pd.to_numeric, errors='coerce')`, 재무비율 `pivot`)는 저장소 `pages/stream.py`를 직접 읽었다. pandas의 역사(2008년 시작, 2009년 공개)는 McKinney(2022)를 따랐다. pandas 3.0 변경 사항은 pandas 3.0.5에서 직접 확인했고(Copy-on-Write 옵션을 조회하면 "3.0부터 항상 켜져 있어 끌 수 없다"는 경고가 나온다), 출시일(3.0.0, 2026-01-21)과 최신 버전(3.1.1)은 PyPI 기록으로 확인했다. 작성일에는 네트워크 제한으로 pandas 공식 문서 링크를 직접 열지 못했다(일요일 검수에서 확인 필요).
