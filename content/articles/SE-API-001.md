---json
{
  "id": "SE-API-001",
  "concept": "rest-api-design",
  "track": "engineering",
  "title": "REST API 설계",
  "title_en": "REST API Design",
  "difficulty": "입문",
  "depth": ["L1", "L2", "L3"],
  "reading_minutes": 15,
  "objectives": [
    "자원 중심으로 URL과 HTTP 메서드를 설계할 수 있다.",
    "상태 코드와 일관된 오류 응답 형식을 정할 수 있다.",
    "오프셋 방식과 커서 방식 페이지네이션의 성능·정확성 차이를 설명할 수 있다.",
    "멱등성, 버전 관리, 인증·권한, 속도 제한을 API 설계에 반영할 수 있다."
  ],
  "prerequisites": ["네트워크와 HTTP 기초(CS-NET-001)", "관계형 데이터 모델링(DE-MODEL-001)"],
  "roles": ["AI Native Developer", "FDE", "Data Engineer"],
  "tags": ["API", "REST", "HTTP", "설계", "페이지네이션"],
  "status": "published",
  "version": 1,
  "created_at": "2026-11-25",
  "updated_at": "2026-11-25",
  "verified_at": "2026-11-25",
  "sources": [
    { "title": "Fielding, R. T. Architectural Styles and the Design of Network-based Software Architectures. 박사학위 논문, University of California, Irvine, 2000. 5장(REST)", "source_type": "paper" },
    { "title": "IETF RFC 9110. HTTP Semantics. 2022", "source_type": "standard" },
    { "title": "IETF RFC 9457. Problem Details for HTTP APIs. 2023", "source_type": "standard" },
    { "title": "PostgreSQL Documentation: LIMIT and OFFSET", "url": "https://www.postgresql.org/docs/current/queries-limit.html", "source_type": "official-doc" },
    { "title": "OpenAPI Initiative. OpenAPI Specification v3.1.0. 2021", "source_type": "standard" }
  ]
}
---

## 0. 한눈에 보기 (입문)

### 한 줄 요약
**API**는 프로그램끼리 대화하는 약속이고, **REST API**는 그 약속을 "자원(명사)은 URL로, 행동(동사)은 HTTP 메서드로" 표현하는 널리 쓰이는 방식이다. 좋은 API는 **예측 가능하고, 실패를 정확히 알려 주고, 다시 시도해도 안전하다.**

### 쉬운 설명
식당 메뉴판을 떠올리자. 손님(클라이언트)은 주방(서버) 안을 몰라도 메뉴판(API)만 보고 주문할 수 있다.

- **자원:** 메뉴판의 항목들. `/companies`(기업 목록), `/companies/005930`(특정 기업).
- **메서드:** 주문 방식. 보여 주세요(GET), 새로 만들어 주세요(POST), 고쳐 주세요(PATCH), 없애 주세요(DELETE).
- **상태 코드:** 주방의 답. "나왔습니다(200)", "그 메뉴 없어요(404)", "주문서가 잘못됐어요(400)", "주방에 문제가 생겼어요(500)".

메뉴판이 엉망이면(어떤 건 `/getCompany`, 어떤 건 `/company_list`, 실패해도 200에 "error" 글자만) 손님이 매번 헷갈린다. 그래서 규칙을 일관되게 지키는 것이 API 설계의 대부분이다.

### 내 프로젝트에서는
- **DeepVi는 FastAPI로 조회 API를 만들었다.** PostgreSQL에 저장한 재무·주가·뉴스·ESG·거시지표를 FastAPI로 조회했다(README 기재). 화면(대시보드)과 데이터 사이를 API가 잇는 구조다. 구체적인 엔드포인트 설계는 포트폴리오에 기재되어 있지 않다.
- **DeepVi는 외부 API의 사용자이기도 했다.** GPT-4o, Gemini Flash, Pinecone 같은 외부 API를 호출했다. 남이 설계한 API를 쓰면서 겪는 불편(모호한 오류, 속도 제한)이 좋은 API 설계의 교과서다.
- **Preflight는 브라우저 → 사내 서버로 파싱한 값을 보낸다.** 같은 파일을 두 번 올려도 결과가 같은 **재업로드 멱등성**을 갖췄다(포트폴리오 기재). API 관점에서 "같은 요청을 다시 보내도 안전한" 설계의 실제 사례다.

### 먼저 알면 좋은 것
- 네트워크와 HTTP 기초(CS-NET-001): 메서드, 상태 코드, 헤더
- 관계형 데이터 모델링(DE-MODEL-001): 자원은 대개 테이블·엔터티와 대응한다.

### 쉬운 확인 질문

<details class="qa" data-type="easy"><summary>Q1. "기업 005930의 정보를 가져온다"를 REST 방식으로 쓰면 메서드와 URL은?</summary>

**정답.** `GET /companies/005930`

**해설.** 자원(기업)은 URL의 명사로, 행동(조회)은 메서드로 표현한다. `/getCompany?id=005930`처럼 동사를 URL에 넣지 않는다.

</details>

<details class="qa" data-type="easy"><summary>Q2. 요청이 실패했는데 서버가 상태 코드 200과 함께 본문에 "error"만 넣어 보낸다. 무엇이 문제인가?</summary>

**정답.** 클라이언트·프록시·모니터링 도구가 상태 코드만 보고 성공으로 판단해, 오류를 놓치거나 잘못 재시도한다.

**해설.** 실패는 그에 맞는 4xx·5xx 코드로 알려야 자동 처리가 가능하다.

</details>

## 1. 핵심 요약

- **자원 중심 URL:** 복수 명사 컬렉션 `/companies`, 개별 자원 `/companies/{id}`, 관계 `/companies/{id}/news`.
- **메서드:** GET 조회, POST 생성, PUT 전체 교체, PATCH 일부 수정, DELETE 삭제. GET·PUT·DELETE는 멱등.
- **상태 코드:** 2xx 성공, 4xx 요청 쪽 문제, 5xx 서버 쪽 문제. 성공·실패를 본문이 아니라 코드로 알린다.
- **오류 형식:** 모든 오류를 같은 구조로(예: RFC 9457 Problem Details의 `type`, `title`, `status`, `detail`).
- **페이지네이션:** 오프셋 방식은 단순하지만 깊은 페이지가 느리고 중간 삽입 시 중복·누락. 커서 방식은 인덱스를 타고 일관적.
- **안전장치:** 인증(누구인가)과 권한(무엇을 할 수 있나) 분리, 속도 제한(429), 멱등 키, 버전 관리, 문서화(OpenAPI).

## 2. 개념과 등장 배경

2000년 로이 필딩(Roy Fielding)은 박사학위 논문에서 웹이 대규모로 확장될 수 있었던 아키텍처 원칙을 **REST**(Representational State Transfer)로 정리했다. 핵심 제약은 클라이언트-서버 분리, 상태 없음(요청마다 필요한 정보를 모두 담음), 캐시 가능성, 일관된 인터페이스(자원 식별, 표현을 통한 조작) 등이다. 필딩은 HTTP/1.1 명세의 주요 저자이기도 했다.

2000년대 중반 이후 웹 API가 XML 기반 SOAP에서 JSON을 주고받는 "REST 스타일" API로 옮겨 갔다. 실무의 "REST API"는 필딩의 엄격한 정의(하이퍼미디어로 상태 전이까지)를 다 따르지 않는 경우가 많고, 보통 "자원 URL + HTTP 메서드 + JSON"을 뜻한다. 2010년대에는 API를 기계가 읽을 수 있게 기술하는 Swagger(이후 OpenAPI 명세)가 표준처럼 쓰였고, FastAPI 같은 프레임워크는 코드에서 OpenAPI 문서를 자동 생성한다.

## 3. 직관적 설명 및 기초 이론

### URL 설계 예

| 하고 싶은 일 | 좋은 예 | 피할 예 |
|---|---|---|
| 기업 목록 | `GET /companies?market=KOSPI` | `GET /getAllCompanies` |
| 기업 하나 | `GET /companies/005930` | `GET /company?id=005930&action=get` |
| 기업의 뉴스 | `GET /companies/005930/news?since=2026-11-01` | `GET /newsByCompany/005930` |
| 업로드 생성 | `POST /uploads` | `POST /doUpload` |
| 검토 승인 | `POST /reviews/42/approval` 또는 `PATCH /reviews/42` `{"status":"approved"}` | `GET /approveReview?id=42` (GET으로 상태 변경 금지) |

### 오류 응답을 일관되게

```json
{
  "type": "https://example.org/errors/stale-file",
  "title": "이미 반영된 파일보다 오래된 파일입니다",
  "status": 409,
  "detail": "업로드한 파일의 기준 시각이 마지막 반영분보다 이릅니다.",
  "instance": "/uploads/1043"
}
```

RFC 9457(Problem Details)의 형식이다. 사람은 `title`·`detail`을 읽고, 프로그램은 `type`·`status`로 분기한다. (예시는 설명용이며, "같은 파일·더 오래된 파일은 반영 전에 멈춤"이라는 Preflight 규칙을 API 응답으로 표현해 본 것이다.)

## 4. 엄밀한 정의와 작동 원리

### 멱등성과 재시도

요청 $r$을 한 번 보내든 여러 번 보내든 서버 상태가 같으면 멱등하다. 네트워크는 "요청은 처리됐는데 응답만 잃어버리는" 경우가 있어서, 클라이언트는 결과를 모른 채 재시도하게 된다. 멱등하지 않은 POST는 **멱등 키**(`Idempotency-Key` 헤더 등)를 받아 서버가 같은 키의 두 번째 요청에 첫 결과를 그대로 돌려주게 한다. 키 저장에는 유니크 제약을 쓴다(DE-DB-002).

### 페이지네이션 두 방식

**오프셋:**

```sql
SELECT * FROM news ORDER BY published_at DESC, id DESC LIMIT 20 OFFSET 10000;
```

PostgreSQL 공식 문서는 OFFSET으로 건너뛴 행도 서버 안에서 계산해야 하므로 큰 OFFSET은 비효율적일 수 있다고 설명한다. 또 `ORDER BY`로 순서를 고정하지 않으면 페이지마다 결과가 일관되지 않을 수 있다고 경고한다.

**커서(키셋):**

```sql
SELECT * FROM news
WHERE (published_at, id) < (:last_published_at, :last_id)
ORDER BY published_at DESC, id DESC
LIMIT 20;
```

마지막으로 본 행의 정렬 키를 커서로 넘긴다. `(published_at, id)` 인덱스가 있으면 B-Tree에서 바로 그 위치로 가서 20개만 읽는다(DE-DB-001). 앞쪽에 새 행이 추가돼도 중복·누락이 없다.

### 인증과 권한

- **인증(authentication):** 요청자가 누구인지 확인. 토큰, 세션 쿠키. 실패하면 401.
- **권한(authorization):** 그 사람이 이 자원에 이 행동을 할 수 있는지. 실패하면 403(또는 존재 자체를 숨기려면 404).
- 권한 검사는 **모든 요청에서, 서버에서** 한다. "화면에서 버튼을 숨겼으니 괜찮다"는 보안이 아니다.

### 버전 관리

기존 클라이언트를 깨는 변경(필드 삭제, 의미 변경)은 새 버전(`/v2/...` 또는 헤더)으로 낸다. 필드 추가처럼 깨지 않는 변경은 같은 버전에서 한다. Preflight의 "DB 변경은 더하기만 한다"와 같은 원칙이 API에도 적용된다.

## 5. 수식 및 기호 설명

| 용어 | 뜻 |
|---|---|
| 엔드포인트 | 메서드 + 경로 한 쌍(`GET /companies/{id}`) |
| 경로 변수 `{id}` | URL 안의 자원 식별자 |
| 쿼리 매개변수 `?since=` | 필터·정렬·페이지 지정 |
| 멱등 키 | 같은 작업의 재시도를 알아보는 고유 값 |
| 커서 | 다음 페이지의 시작점을 나타내는 값 |
| OpenAPI | API를 기계가 읽을 수 있게 기술하는 명세 형식 |

## 6. 단계별 계산 또는 동작 예제

### 예제 1. 오프셋 페이지네이션의 비용

뉴스 100만 건, 한 페이지 20건. 500번째 페이지를 오프셋으로 요청하면 `OFFSET 9980 LIMIT 20` → 서버는 정렬 순서로 약 10,000행을 지나야 한다. 5만 번째 페이지면 약 100만 행. 커서 방식은 페이지 위치와 무관하게 인덱스 탐색($O(\log n)$, 100만 건이면 B-Tree 높이 3~4단계) + 20행이다(CS-ALG-002, DE-DB-001).

### 예제 2. 오프셋 방식의 중복

| 시점 | 일 | 1페이지(20개) | 2페이지 |
|---|---|---|---|
| t1 | 사용자가 1페이지를 봄 | 기사 1~20 | |
| t2 | 새 기사 3개가 맨 앞에 추가 | | |
| t3 | 사용자가 2페이지(OFFSET 20) 요청 | | 원래 기사 18~37 → **18, 19, 20 중복** |

커서 방식은 "기사 20보다 오래된 것"을 요청하므로 21~40이 정확히 나온다. 매일 뉴스가 쌓이는 DeepVi 같은 서비스에서 목록 API를 만든다면 커서 방식이 맞다(DeepVi의 실제 구현은 기재 없음).

### 예제 3. 재시도 시나리오

클라이언트가 `POST /uploads`(멱등 키 `k-77`)를 보냈다. 서버는 처리하고 201을 보냈지만 응답이 네트워크에서 사라졌다. 클라이언트는 시간 초과 후 같은 키로 재시도한다.

| 설계 | 결과 |
|---|---|
| 멱등 키 없음 | 업로드가 두 번 생성됨 |
| 멱등 키 있음 | 서버가 `k-77`의 기존 결과(업로드 1043)를 그대로 반환 |
| Preflight 방식(파일 지문) | 같은 파일의 두 번째 반영이 지문 확인 단계에서 멈춤 |

## 7. 시각화와 해석

API 설계는 표 하나로 정리하면 검토가 쉽다: 엔드포인트, 메서드, 요청 본문, 성공 코드, 실패 코드들, 멱등 여부, 필요한 권한. 이 표가 OpenAPI 문서의 내용이고, 문서에서 클라이언트 코드와 테스트를 자동 생성할 수도 있다. 표를 채우다 "실패 코드" 칸이 비면, 그 실패를 아무도 생각하지 않았다는 신호다.

## 8. 기술 비교 및 선택 기준

| 방식 | 장점 | 단점 | 적합 |
|---|---|---|---|
| REST(JSON) | 단순, 도구·캐시 생태계, 사람이 읽기 쉬움 | 화면마다 여러 번 호출, 과다·과소 조회 | 대부분의 업무 API |
| GraphQL | 클라이언트가 필요한 필드만 한 번에 요청 | 서버 복잡도, 캐시·권한 설계 어려움 | 화면이 다양한 대형 프론트엔드 |
| gRPC | 빠름, 엄격한 스키마, 스트리밍 | 브라우저 직접 사용 불편 | 서비스 간 내부 통신 |
| 서버 전송 이벤트·WebSocket | 실시간 푸시 | 연결 관리 | LLM 답변 스트리밍, 알림 |

## 9. 실무 사례

- **LLM API:** 요청 본문에 모델·메시지를 담아 POST하고, 응답은 한 번에 또는 스트리밍으로 받는다. 429와 일시 오류에 대비한 재시도·지수 대기가 클라이언트의 기본 구현이다.
- **사내 업무 API:** 화면과 배치 작업이 같은 API를 쓰게 하면 규칙이 한곳에 모인다. 권한은 역할 기반으로 서버에서 검사한다.
- **공개 데이터 API:** 키 발급, 일일 호출 한도, 버전 공지, 변경 이력 문서가 필수다.

## 10. 기존 프로젝트와의 연결

아래 사실은 포트폴리오·저장소 원문(`content/profile.json`)에서 옮긴 것이다.

- **DeepVi — FastAPI 조회:** PostgreSQL 데이터를 FastAPI로 조회했다. 점검 질문(기록 없음): 기업·뉴스 목록 API는 어떤 페이지네이션을 썼는가? 오류는 어떤 형식으로 돌려줬는가? FastAPI가 자동 생성하는 OpenAPI 문서를 팀원과의 협업에 활용했는가?
- **DeepVi — 외부 API 소비:** GPT-4o(temperature 0.3), Gemini Flash, Pinecone 호출. 외부 API의 속도 제한·장애는 서비스 응답에 그대로 전파되므로, 시간 초과와 재시도 정책이 필요하다.
- **Preflight — 멱등성과 거부 규칙:** 재업로드 멱등성, "같은 파일·더 오래된 파일은 반영 전에 멈춤", 개발을 거치지 않은 변경은 배포 스크립트가 거부. API로 표현하면 409 같은 명확한 거부 응답과 멱등한 생성 요청이다(3절 오류 예시).
- **Preflight — 더하기만 하는 변경:** DB 변경을 더하기만 해서 되돌려도 데이터가 남게 했다. API의 하위 호환(필드 추가는 허용, 삭제·의미 변경은 새 버전)과 같은 원칙이다.

## 11. 가정·한계·흔한 오해·트레이드오프

- **오해: GET으로 상태를 바꿔도 된다.** 브라우저 미리 읽기, 크롤러, 캐시가 GET을 자동으로 보내 의도치 않은 변경이 생긴다.
- **오해: 화면에서 막았으니 권한은 괜찮다.** API는 화면 없이도 직접 호출된다. 서버에서 매번 검사한다.
- **오해: REST면 무조건 URL을 명사로만.** "승인", "재처리" 같은 행동은 하위 자원(`/approval`)이나 명확한 POST 엔드포인트로 표현해도 된다. 일관성이 더 중요하다.
- **과도한 세분화:** 화면 하나에 API 20번 호출이 필요하면 RTT가 쌓인다(CS-NET-001). 화면 단위 묶음 API를 둘 수 있다.
- **버전 남발:** 버전이 많으면 유지보수 비용이 커진다. 깨지 않는 변경을 기본으로 한다.

## 12. 이해 확인 및 면접 질문

<details class="qa" data-type="concept"><summary>Q1. PUT과 PATCH의 차이와 각각의 멱등성은?</summary>

**정답.** PUT은 자원 전체를 보낸 내용으로 교체하고 멱등하다. PATCH는 일부만 수정하며, "수량을 1 증가" 같은 상대적 변경이면 멱등하지 않을 수 있다.

**해설.** 멱등하지 않은 요청을 재시도하려면 멱등 키나 조건부 요청(버전 확인)이 필요하다.

</details>

<details class="qa" data-type="concept"><summary>Q2. 오프셋 페이지네이션이 깊은 페이지에서 느린 이유는?</summary>

**정답.** 건너뛴 행도 서버가 정렬 순서대로 읽어 지나가야 하므로, OFFSET 값에 비례해 일이 늘어난다.

**해설.** PostgreSQL 공식 문서도 큰 OFFSET이 비효율적일 수 있다고 설명한다. 커서 방식은 인덱스로 시작 위치를 바로 찾는다.

</details>

<details class="qa" data-type="judgment"><summary>Q3. 모바일 앱이 주문 생성 API를 호출했는데 응답이 없어 사용자가 버튼을 다시 눌렀고, 주문이 두 건 생겼다. 서버와 클라이언트를 어떻게 고치겠는가?</summary>

**정답.** 클라이언트는 주문 시도마다 멱등 키를 만들어 재시도에도 같은 키를 보내고, 처리 중에는 버튼을 비활성화한다. 서버는 멱등 키를 유니크 제약과 함께 저장해 같은 키의 두 번째 요청에 첫 결과를 돌려준다.

**해설.** 네트워크는 "처리됐지만 응답 유실"이 가능하므로, 서버 쪽 멱등성이 근본 해결이다.

</details>

<details class="qa" data-type="applied"><summary>Q4. 매일 수천 건씩 쌓이는 뉴스 목록을 최신순으로 보여 주는 API를 설계하라. URL, 정렬, 페이지네이션, 인덱스를 포함해서.</summary>

**정답.** `GET /companies/{id}/news?limit=20&cursor=...`. 정렬은 `published_at DESC, id DESC`(동시각 대비 id로 순서 고정), 커서는 마지막 항목의 (published_at, id)를 인코딩한 값, 인덱스는 `(company_id, published_at DESC, id DESC)`. 응답에 다음 커서를 넣고, 더 없으면 비운다.

**해설.** 고유한 정렬 키 조합이 있어야 커서가 정확하다. 기업별 조회이므로 company_id를 인덱스 맨 앞에 둔다.

</details>

## 13. 선행·후속 학습

- 선행: 네트워크와 HTTP 기초(CS-NET-001), 관계형 데이터 모델링(DE-MODEL-001)
- 함께 보기: 트랜잭션과 ACID(DE-DB-002)의 멱등성, B-Tree와 데이터베이스 인덱스(DE-DB-001), 소프트웨어 테스트와 유지보수(SE-TEST-001)
- 후속: 배포와 환경 분리(OPS-DEPLOY-001)
- 더 나아가기: OAuth 2.0, API 게이트웨이, 계약 테스트, 이벤트 기반 API

## 14. 참고 자료

출처는 아래 패널에 있다. 페이지네이션의 OFFSET 비용과 ORDER BY 필요성은 PostgreSQL 공식 문서를 직접 확인했다. RFC·OpenAPI·필딩 논문은 이 환경에서 접속할 수 없어 서지 정보만 적었다(세부는 확인 필요). 예시 URL과 JSON은 설명용이며 DeepVi·Preflight의 실제 API가 아니다.
