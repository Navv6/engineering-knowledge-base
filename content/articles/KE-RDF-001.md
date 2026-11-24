---json
{
  "id": "KE-RDF-001",
  "concept": "rdf-owl-sparql",
  "track": "engineering",
  "title": "RDF·OWL·SPARQL",
  "title_en": "RDF, OWL, and SPARQL",
  "difficulty": "중급",
  "depth": ["L1", "L2", "L3"],
  "reading_minutes": 15,
  "objectives": [
    "Turtle 문법으로 IRI, 접두어, 리터럴(자료형), 빈 노드를 읽고 쓸 수 있다.",
    "rdfs:domain과 rdfs:range가 '검사'가 아니라 '추론'이라는 점을 예로 설명할 수 있다.",
    "OWL 추론(열린 세계)과 SHACL 검증(닫힌 세계)의 역할 차이를 말하고 언제 무엇을 쓸지 고를 수 있다.",
    "SPARQL의 OPTIONAL, FILTER NOT EXISTS, 집계, 속성 경로, CONSTRUCT를 작은 그래프로 따라갈 수 있다."
  ],
  "prerequisites": ["온톨로지와 Knowledge Graph(KE-ONT-001)"],
  "roles": ["Ontology Developer", "Data Engineer"],
  "tags": ["RDF", "OWL", "SPARQL", "SHACL", "시맨틱 웹", "지식 그래프"],
  "status": "published",
  "version": 1,
  "created_at": "2026-11-25",
  "updated_at": "2026-11-25",
  "verified_at": "2026-11-25",
  "sources": [
    { "title": "W3C. RDF 1.1 Concepts and Abstract Syntax. W3C Recommendation, 25 February 2014", "source_type": "standard" },
    { "title": "W3C. OWL 2 Web Ontology Language Document Overview (Second Edition). W3C Recommendation, 11 December 2012", "source_type": "standard" },
    { "title": "W3C. SPARQL 1.1 Query Language. W3C Recommendation, 21 March 2013", "source_type": "standard" },
    { "title": "W3C. Shapes Constraint Language (SHACL). W3C Recommendation, 20 July 2017", "source_type": "standard" },
    { "title": "Allemang, D., Hendler, J., Gandon, F. Semantic Web for the Working Ontologist, 3rd ed. ACM Books, 2020", "source_type": "textbook" }
  ]
}
---

## 0. 한눈에 보기 (입문)

### 한 줄 요약
**RDF**는 사실을 "주어 – 술어 – 목적어" 세 칸 문장(트리플)으로 적는 표준 형식, **OWL**은 그 사실들에 "규칙"을 붙여 새 사실을 추론하게 하는 언어, **SPARQL**은 그렇게 쌓인 그래프에 질문하는 언어다. 데이터 검사는 **SHACL**이 따로 맡는다.

### 쉬운 설명
도서관 카드를 떠올리자. "『토지』 – 저자 – 박경리", "박경리 – 출생지 – 통영". 이런 세 칸짜리 카드를 무한히 쌓을 수 있는 형식이 RDF다. 카드마다 대상의 이름을 **전 세계에서 하나뿐인 주소**(IRI)로 적어서, 다른 도서관의 카드와 섞어도 같은 사람을 같은 사람으로 알아볼 수 있다.

- **OWL(규칙):** "저자는 사람이다"라는 규칙을 적어 두면, 『토지』의 저자 카드만 보고도 "박경리는 사람"이라는 사실이 자동으로 생긴다.
- **SHACL(검사):** "모든 책 카드에는 저자가 정확히 한 명 적혀 있어야 한다"를 검사해서, 빠진 카드를 찾아 준다.
- **SPARQL(질문):** "통영에서 태어난 저자가 쓴 책은?"처럼 카드를 이어 따라가며 묻는다.

헷갈리기 쉬운 점: OWL 규칙은 **잘못을 찾아 주지 않는다.** "저자는 사람이다"라는 규칙이 있는데 실수로 "『토지』 – 저자 – 통영"이라고 적으면, OWL은 오류를 내는 대신 "통영은 사람이다"라고 **추론해 버린다.** 그래서 검사는 SHACL로 따로 한다.

### 내 프로젝트에서는
- **RDF·OWL을 실제로 쓴 기록은 없다.** 아래는 모두 적용 가능성이다.
- **Preflight의 "검사"는 SHACL에 가깝다.** 표·칸·계산식 대장을 실제 DB와 칸 단위로 대조하고(포트폴리오 기재), 판정 규칙으로 데이터를 걸러 검토로 보낸다. "있어야 할 것이 없으면 문제"라는 **닫힌 세계** 검사다. 반대로 "파일에서 빠진 행을 바로 삭제로 보지 않고, 끝났다는 근거가 없으면 검토"는 "모르는 것을 거짓으로 단정하지 않는" **열린 세계** 태도다. 두 관점을 함께 쓴 셈이다.
- **DeepVi의 기업–뉴스 연결은 RDF로 옮기기 좋은 구조다.** 444개 기업에 뉴스·재무·거시 데이터를 연결했다(포트폴리오 기재). 기업을 IRI로, "언급됨", "속한 업종" 같은 관계를 술어로 두면 SPARQL로 "같은 업종 기업들의 최근 부정 뉴스" 같은 여러 단계 질문을 할 수 있다(6절 예제 3, 설명용 데이터).

### 먼저 알면 좋은 것
- 온톨로지와 Knowledge Graph(KE-ONT-001): 트리플, TBox/ABox, 열린 세계 가정

### 쉬운 확인 질문

<details class="qa" data-type="easy"><summary>Q1. "서울 – 수도이다 – 대한민국"을 트리플로 볼 때 주어, 술어, 목적어는?</summary>

**정답.** 주어 서울, 술어 수도이다, 목적어 대한민국.

**해설.** RDF의 모든 사실은 이 세 칸으로 적는다. 목적어는 다른 대상일 수도, 숫자·글자 같은 값일 수도 있다.

</details>

<details class="qa" data-type="easy"><summary>Q2. 데이터에 "모든 직원은 부서가 하나 있어야 한다"는 조건을 검사하고 싶다. OWL 추론과 SHACL 중 무엇이 맞는가?</summary>

**정답.** SHACL.

**해설.** OWL은 열린 세계라서 부서가 안 적혀 있으면 "모른다"로 본다. "없으면 위반"으로 검사하는 것은 SHACL의 역할이다.

</details>

## 1. 핵심 요약

- **RDF 데이터 모델:** 트리플 $(s, p, o)$. 주어는 IRI 또는 빈 노드, 술어는 IRI, 목적어는 IRI·빈 노드·리터럴. 트리플의 집합이 그래프다.
- **리터럴:** 값 + 자료형(`"2026-11-25"^^xsd:date`) 또는 언어 태그(`"서울"@ko`).
- **RDFS:** `subClassOf`, `subPropertyOf`, `domain`, `range`. domain/range는 **추론 규칙**이다(검사 아님).
- **OWL 2:** 역속성, 이행적 속성, 함수적 속성, 서로소 클래스, 기수 제약, `sameAs` 등. 표현력과 계산 비용 사이 절충으로 프로필(EL, QL, RL)이 있다.
- **SHACL:** 그래프가 모양(shape)을 만족하는지 **검증**. 필수 값, 개수, 자료형, 값 범위. 닫힌 세계 검사.
- **SPARQL 1.1:** SELECT·ASK·CONSTRUCT·DESCRIBE, OPTIONAL, FILTER, 집계, 속성 경로, 그리고 갱신(UPDATE).

## 2. 개념과 등장 배경

1999년 W3C가 웹 자원에 대한 메타데이터 형식으로 RDF를 처음 권고했고, 2001년 팀 버너스리(Tim Berners-Lee) 등이 기계가 의미를 이해하는 웹, 즉 **시맨틱 웹** 구상을 발표했다. 2004년 RDF 개정판과 OWL 1.0이 권고되었고, 2008년 SPARQL이 질의 표준이 되었다. 이후 OWL 2(2009, 2판 2012), SPARQL 1.1(2013), RDF 1.1(2014)로 정비되었고, 2017년에는 데이터 검증을 위한 SHACL이 권고되었다.

"모든 웹이 의미를 가진다"는 원래 구상은 그대로 실현되지 않았지만, 이 기술들은 생명과학(유전자·질병 온톨로지), 공공 데이터, 도서관, 기업 지식 그래프, 위키데이터 같은 곳에 자리 잡았다. 최근에는 LLM이 근거로 삼을 구조화된 지식(Graph RAG)으로 다시 주목받고 있다.

## 3. 직관적 설명 및 기초 이론

### Turtle 문법 읽기

```text
@prefix :     <http://example.org/plant#> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:작업123 a :시사출 ;                       # a = rdf:type
         :수행장소 :WC-A ;                  # ; = 같은 주어 계속
         :완료일 "2026-11-20"^^xsd:date ;   # 자료형이 있는 리터럴
         rdfs:label "시사출 123"@ko , "Trial 123"@en .   # , = 같은 술어 계속
:작업123 :검토의견 [ :작성자 :김OO ; :내용 "치수 재확인" ] .   # [ ] = 빈 노드
```

| 기호 | 뜻 |
|---|---|
| `:작업123` | 접두어 `:`를 붙인 IRI의 줄임 |
| `a` | rdf:type, "~의 종류다" |
| `;` | 앞 주어를 반복 |
| `,` | 앞 주어와 술어를 반복 |
| `"..."^^xsd:date` | 날짜 자료형 값 |
| `"..."@ko` | 한국어 문자열 |
| `[ ... ]` | 이름 없는 대상(빈 노드) |

### 추론 vs 검증

| | OWL/RDFS 추론 | SHACL 검증 |
|---|---|---|
| 세계 가정 | 열린 세계: 안 적힌 것은 모름 | 닫힌 세계: 이 그래프에 없으면 없음 |
| 하는 일 | 새 트리플을 만들어 냄 | 위반 보고서를 만들어 냄 |
| "저자 없음" | 모름(오류 아님) | 위반 |
| "저자 칸에 도시" | 그 도시가 사람이라고 추론 | 자료형·클래스 위반 |

## 4. 엄밀한 정의와 작동 원리

### domain과 range의 의미

`:저자 rdfs:range :사람 .`의 의미는 "어떤 $x$, $y$에 대해 $(x, \text{저자}, y)$이면 $y \in \text{사람}$"이다:

$$
(x, p, y) \in G \;\land\; \text{range}(p) = C \;\Rightarrow\; y \in C
$$

조건문의 결론 쪽이 **새 사실**로 추가될 뿐, 조건을 어긴 데이터를 거부하지 않는다(MATH-DM-001의 함의). OWL에서 모순이 생기는 것은 서로소(disjoint) 같은 부정적 정보가 함께 있을 때뿐이다. 예를 들어 `:사람 owl:disjointWith :도시 .`이고 `:통영 a :도시 .`이면, `:통영`이 사람으로 추론되는 순간 **불일치**(inconsistency)가 감지된다.

### 자주 쓰는 OWL 구성 요소

| 구성 요소 | 예 | 추론 |
|---|---|---|
| `owl:inverseOf` | 부모 ↔ 자녀 | $(a, \text{부모}, b) \Rightarrow (b, \text{자녀}, a)$ |
| `owl:TransitiveProperty` | 포함된다 | 부품의 부품도 포함 |
| `owl:FunctionalProperty` | 주민번호 | 값이 둘이면 두 값이 같은 대상이라고 추론 |
| `owl:disjointWith` | 사람 / 도시 | 둘 다인 대상이 있으면 불일치 |
| `owl:sameAs` | 데이터셋 A의 삼성전자 = 데이터셋 B의 삼성전자 | 두 IRI의 사실을 공유 |
| 기수 제약 | 정확히 1개의 상태 | 열린 세계라 "0개"는 위반이 아니라 "모름" |

`owl:FunctionalProperty`는 흔히 "값이 하나여야 한다는 검사"로 오해된다. 실제로는 값이 둘 나오면 "두 값은 같은 것"이라고 **추론**한다(고유 이름 가정이 없기 때문). 서로 다르다고 명시되어 있을 때만 불일치가 된다.

### SHACL 모양 예

```text
@prefix sh: <http://www.w3.org/ns/shacl#> .

:작업모양 a sh:NodeShape ;
    sh:targetClass :시사출 ;
    sh:property [ sh:path :수행장소 ; sh:minCount 1 ; sh:maxCount 1 ; sh:class :워크센터 ] ;
    sh:property [ sh:path :완료일 ; sh:datatype xsd:date ; sh:maxCount 1 ] .
```

모든 시사출 작업은 수행장소가 정확히 1개이고 그것이 워크센터여야 하며, 완료일은 날짜 자료형으로 최대 1개다. 위반하면 어느 대상의 어느 속성이 왜 어긋났는지 보고서가 나온다.

### SPARQL 핵심 구문

| 구문 | 역할 | SQL 대응 |
|---|---|---|
| 트리플 패턴 나열 | 모두 맞는 경우(교집합) | INNER JOIN |
| `OPTIONAL { }` | 있으면 붙이고 없어도 결과에 남김 | LEFT JOIN |
| `FILTER(조건)` | 값 조건 | WHERE |
| `FILTER NOT EXISTS { }` | 이런 패턴이 없는 것 | NOT EXISTS |
| `GROUP BY`, `COUNT` | 집계 | 같음 |
| `:p+`, `:p*` | 속성 경로(1번 이상, 0번 이상 반복) | 재귀 CTE |
| `CONSTRUCT { }` | 결과를 새 그래프로 | INSERT ... SELECT와 비슷 |

## 5. 수식 및 기호 설명

| 기호 | 뜻 |
|---|---|
| $(s, p, o) \in G$ | 트리플이 그래프 $G$에 있다 |
| $\text{range}(p) = C$ | 술어 $p$의 목적어는 클래스 $C$에 속한다고 추론 |
| $\Rightarrow$ | 이면(추론 규칙) |
| `?x` | SPARQL 변수 |
| `^^xsd:date` | 리터럴의 자료형 |
| `sh:minCount` | SHACL 최소 개수 |

## 6. 단계별 계산 또는 동작 예제

### 예제 1. range 추론의 함정 따라가기

TBox: `:수행장소 rdfs:range :워크센터 .`
ABox: `:작업123 :수행장소 :WC-A .`, `:작업456 :수행장소 "WC-B" .`(실수로 문자열)

| 단계 | 추론 |
|---|---|
| 1 | `:WC-A a :워크센터` (의도대로) |
| 2 | 리터럴 "WC-B"는 워크센터 클래스의 인스턴스가 될 수 없다. RDFS 수준에서는 이상한 결과를 만들거나 무시되고, OWL에서는 워크센터가 리터럴이 아닌 개체 클래스로 선언되어 있으면 불일치로 이어질 수 있다 |

같은 데이터에 SHACL `sh:class :워크센터`를 걸면 작업456이 **명확한 위반**으로 보고된다. 데이터 입력 오류 검출은 SHACL에 맡기는 것이 맞다.

### 예제 2. OPTIONAL과 FILTER NOT EXISTS

데이터:

```text
:작업1 a :시사출 ; :완료일 "2026-11-10"^^xsd:date .
:작업2 a :시사출 .
:작업3 a :시사출 ; :완료일 "2026-11-18"^^xsd:date .
```

질의 A (완료일이 있으면 같이 보여 주기):

```text
SELECT ?t ?d WHERE { ?t a :시사출 . OPTIONAL { ?t :완료일 ?d } }
```

결과: (작업1, 11-10), (작업2, 비어 있음), (작업3, 11-18) → 3행.

질의 B (완료일이 **적혀 있지 않은** 작업):

```text
SELECT ?t WHERE { ?t a :시사출 . FILTER NOT EXISTS { ?t :완료일 ?d } }
```

결과: 작업2 → 1행. SPARQL 질의 자체는 이 그래프에 대해 닫힌 방식으로 답한다. 다만 "작업2는 미완료"라고 **해석**할지는 별개 문제다. 완료일이 다른 시스템에 있을 수 있기 때문이다(KE-ONT-001 예제 3의 열린 세계).

### 예제 3. 여러 단계 질문 + 집계 (DeepVi 확장 가정)

설명용 데이터: 기업은 업종에 속하고, 뉴스는 기업을 언급하며 감정 라벨을 가진다.

```text
SELECT ?co (COUNT(?n) AS ?부정뉴스수) WHERE {
  :삼성전자 :업종 ?ind .
  ?co :업종 ?ind .
  FILTER(?co != :삼성전자)
  ?n :언급 ?co ; :감정 :부정 ; :게시일 ?d .
  FILTER(?d >= "2026-11-01"^^xsd:date)
}
GROUP BY ?co
ORDER BY DESC(?부정뉴스수)
```

"삼성전자와 같은 업종의 다른 기업별 이번 달 부정 뉴스 수"를 구한다. 관계형으로는 기업·업종·뉴스·언급 테이블 조인이 필요한 질문이 패턴 몇 줄로 표현된다. DeepVi는 질문이 기업 분석 화면 안에서만 가능해 기업 하나의 맥락으로 답했으므로, 이런 기업 간 질문은 확장 아이디어다.

### 예제 4. 속성 경로

부품 구조: `:엔진 :부품 :피스톤 . :피스톤 :부품 :링 .`

```text
SELECT ?x WHERE { :엔진 :부품+ ?x }
```

결과: 피스톤, 링. `:부품`을 `owl:TransitiveProperty`로 선언하고 추론기를 돌려도 같은 결과를 얻는다. 차이: 속성 경로는 **질의할 때** 따라가고, 이행성 추론은 **사실을 미리 만들어** 둔다. 재귀 SQL(MATH-GRAPH-001의 `WITH RECURSIVE`)과 같은 일을 한다.

## 7. 시각화와 해석

트리플 그래프를 그릴 때는 IRI 대상을 동그라미, 리터럴을 네모, 술어를 화살표 이름으로 그리는 것이 관례다. 추론으로 생긴 트리플을 점선으로 구분해 그리면 "원래 적힌 사실"과 "규칙이 만든 사실"을 구별할 수 있어, 예제 1 같은 의도하지 않은 추론을 찾기 쉽다.

## 8. 기술 비교 및 선택 기준

| 필요 | 도구 |
|---|---|
| 여러 출처의 데이터를 같은 이름 체계로 합치기 | RDF + IRI 설계, `owl:sameAs` |
| 분류 체계에서 상위 개념으로 자동 집계 | RDFS 하위 클래스 추론 |
| 데이터 품질 검사(필수 값, 개수, 형식) | SHACL |
| 복잡한 개념 정의와 자동 분류(의료 용어 등) | OWL 2 DL / EL 추론기 |
| 대규모 데이터에서 빠른 규칙 추론 | OWL 2 RL(규칙 기반) |
| 여러 단계 관계 질의 | SPARQL(트리플 스토어) 또는 속성 그래프 DB(Cypher 등) |
| 단순 업무 데이터의 CRUD | 관계형 DB가 대개 더 단순 |

**속성 그래프와의 차이:** Neo4j 같은 속성 그래프는 간선에 속성을 직접 붙이기 쉽고 개발자 친화적이다. RDF는 전역 IRI와 표준(추론, 검증, 질의)이 강점이다. 데이터 통합과 표준 준수가 중요하면 RDF, 애플리케이션 내부 그래프 탐색이 중심이면 속성 그래프가 흔히 선택된다.

## 9. 실무 사례

- **생명과학:** 유전자 온톨로지, 질병 온톨로지를 OWL로 정의하고 여러 연구 데이터를 RDF로 통합한다.
- **공공·도서관 데이터:** 기관마다 다른 형식의 데이터를 공통 어휘로 연결해 공개한다(Linked Open Data).
- **기업 지식 그래프:** 제품, 부품, 공급사, 규정 문서를 연결해 "이 부품이 단종되면 영향받는 제품과 고객"을 질의한다.
- **웹 검색:** 웹 페이지에 schema.org 어휘로 구조화 데이터를 넣어 검색 엔진이 상품·행사 정보를 이해하게 한다.

## 10. 기존 프로젝트와의 연결

아래 사실은 포트폴리오·저장소 원문(`content/profile.json`)에서 옮긴 것이다. RDF·OWL·SPARQL을 구현한 기록은 없으므로 연결은 모두 적용 가능성이다.

- **Preflight — 검사 규칙과 SHACL:** 대장과 실제 DB를 칸 단위로 대조하고, 스키마 파서가 일부 문법을 못 읽어 한 달간 18개 칸이 대장에서 빠져 있던 일을 발견했다. "있어야 할 칸이 대장에 없음"은 SHACL의 `minCount` 위반과 같은 종류의 검사다. 세 업무(샘플조달·시사출·CT)가 같은 엔진에 업무별 정책만 다르다는 구조는, 공통 모양(shape)을 상위 클래스에 두고 업무별 모양을 더하는 방식으로 옮길 수 있다.
- **Preflight — 출처 우선순위:** 완료일을 사람 > 파일 > 시스템 순으로 정했다. RDF에서는 출처마다 다른 **이름 있는 그래프**(named graph)에 넣고, SPARQL로 우선순위가 높은 그래프의 값을 고르는 방식으로 표현할 수 있다.
- **DeepVi — 기업 데이터 통합:** 재무·주가·뉴스·ESG·거시지표를 PostgreSQL에 저장했다. 기업 코드를 IRI로 삼아 외부 공개 데이터(업종 분류, 공시)와 연결하면 `owl:sameAs`로 통합하는 그림이 된다.
- **면접 대비:** "Preflight 규칙을 SHACL로, 업무 분류를 RDFS로 옮긴다면" 같은 설계 연습은 의미 있지만, 실제 구현 경험과 구분해서 말한다.

## 11. 가정·한계·흔한 오해·트레이드오프

- **오해: domain/range는 입력 검사다.** 추론 규칙이다(예제 1). 검사는 SHACL.
- **오해: FunctionalProperty면 값이 두 개일 때 오류가 난다.** 두 값이 같은 대상이라고 추론한다. 서로 다르다는 정보가 있을 때만 불일치.
- **오해: OWL을 쓰면 데이터가 깔끔해진다.** 잘못된 데이터에서 잘못된 결론이 자동으로 늘어날 수 있다.
- **IRI 설계 비용:** 이름 체계를 처음에 잘못 잡으면 바꾸기 어렵다. 의미 없는 안정적 식별자 + 사람이 읽는 `rdfs:label`이 흔한 권장이다.
- **성능:** 표현력 높은 OWL 추론은 데이터가 커지면 느려진다. 프로필(EL, QL, RL)을 고르거나 필요한 추론만 미리 계산한다.
- **도구 생태계:** 관계형 DB보다 개발자와 도구가 적다. 팀의 유지보수 역량을 함께 따진다.

## 12. 이해 확인 및 면접 질문

<details class="qa" data-type="concept"><summary>Q1. `:소유자 rdfs:domain :사람 .`이 있고 `:회사A :소유자 :건물1 .`이라는 트리플이 들어왔다. RDFS 추론 결과는?</summary>

**정답.** "회사A는 사람이다"(`:회사A a :사람`)가 추론된다.

**해설.** domain은 주어의 타입을 추론하는 규칙이다. 의도와 다른 결과라면 domain 설계를 바꾸거나(예: 행위자 클래스), 입력 검사는 SHACL로 한다.

</details>

<details class="qa" data-type="concept"><summary>Q2. SPARQL에서 OPTIONAL과 일반 트리플 패턴의 차이를 SQL로 비유하면?</summary>

**정답.** 일반 패턴 나열은 INNER JOIN처럼 모든 패턴이 맞아야 결과에 남고, OPTIONAL은 LEFT JOIN처럼 맞는 것이 없어도 왼쪽 결과를 남기고 변수를 비워 둔다.

**해설.** "없는 것 찾기"는 OPTIONAL + `!BOUND` 또는 `FILTER NOT EXISTS`로 쓴다.

</details>

<details class="qa" data-type="judgment"><summary>Q3. 여러 부서가 제출하는 설비 데이터를 지식 그래프로 통합하려 한다. 추론(OWL)과 검증(SHACL)을 각각 어디에 쓰겠는가?</summary>

**정답.** 검증: 제출 시점에 필수 속성(설비 코드, 위치, 상태), 개수, 자료형을 SHACL로 검사해 위반 데이터를 돌려보낸다. 추론: 검증을 통과한 데이터에 대해 설비 분류 계층(하위 클래스), 부품 포함 관계(이행성), 다른 시스템 식별자와의 동일성 같은 관계를 추론해 질의를 단순하게 만든다.

**해설.** 검증 없이 추론하면 잘못된 데이터가 잘못된 사실을 증식시킨다. 순서는 검증 → 추론.

</details>

<details class="qa" data-type="applied"><summary>Q4. "같은 업종 기업 중 이번 달 부정 뉴스가 3건 이상인 기업"을 SPARQL로 쓰려면 어떤 구성 요소가 필요한가?</summary>

**정답.** 업종을 잇는 트리플 패턴, 날짜 FILTER, `GROUP BY ?co`와 `COUNT(?n)`, 그리고 집계 결과 조건을 거는 `HAVING (COUNT(?n) >= 3)`.

**해설.** SQL과 마찬가지로 집계 결과에 대한 조건은 FILTER가 아니라 HAVING에 쓴다.

</details>

## 13. 선행·후속 학습

- 선행: 온톨로지와 Knowledge Graph(KE-ONT-001)
- 함께 보기: 집합과 명제논리(MATH-DM-001), 그래프 이론 기초(MATH-GRAPH-001), 관계형 데이터 모델링(DE-MODEL-001)
- 후속: FDE와 솔루션 설계(PE-FDE-001, 준비 중), RAG(AI-RAG-001)와 지식 그래프의 결합(Graph RAG)
- 더 나아가기: 기술 논리(description logic), OWL 2 프로필별 추론기, SHACL-SPARQL 고급 제약

## 14. 참고 자료

출처는 아래 패널에 있다. 각 표준의 권고 날짜는 W3C 권고 문서의 서지 정보이며, 이 실행 환경에서는 W3C 사이트에 접속할 수 없어 URL을 넣지 않았다(내용은 표준의 일반적으로 알려진 정의를 따랐고, 세부 문법은 확인 필요). 6절 데이터는 설명용이며 Preflight·DeepVi의 실제 데이터가 아니다.
