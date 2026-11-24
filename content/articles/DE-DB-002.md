---json
{
  "id": "DE-DB-002",
  "concept": "transactions-acid",
  "track": "engineering",
  "title": "트랜잭션과 ACID",
  "title_en": "Transactions and ACID",
  "difficulty": "중급",
  "depth": ["L1", "L2", "L3"],
  "reading_minutes": 15,
  "objectives": [
    "트랜잭션이 무엇이고 ACID 네 성질이 각각 무엇을 보장하는지 예로 설명할 수 있다.",
    "갱신 손실(lost update) 같은 동시성 문제를 단계별로 재현하고 막는 방법을 말할 수 있다.",
    "PostgreSQL의 격리 수준(Read Committed, Repeatable Read, Serializable)의 차이와 기본값을 말할 수 있다.",
    "멱등성, upsert, 업로드 단위 되돌리기를 트랜잭션과 연결해 설계할 수 있다."
  ],
  "prerequisites": ["관계형 데이터 모델링(DE-MODEL-001)", "상태 머신(CS-GEN-001)"],
  "roles": ["Data Engineer", "FDE"],
  "tags": ["데이터베이스", "트랜잭션", "ACID", "동시성", "PostgreSQL"],
  "status": "published",
  "version": 1,
  "created_at": "2026-11-25",
  "updated_at": "2026-11-25",
  "verified_at": "2026-11-25",
  "sources": [
    { "title": "PostgreSQL Documentation: Transaction Isolation", "url": "https://www.postgresql.org/docs/current/transaction-iso.html", "source_type": "official-doc" },
    { "title": "PostgreSQL Documentation: Tutorial - Transactions", "url": "https://www.postgresql.org/docs/current/tutorial-transactions.html", "source_type": "official-doc" },
    { "title": "PostgreSQL Documentation: INSERT (ON CONFLICT)", "url": "https://www.postgresql.org/docs/current/sql-insert.html", "source_type": "official-doc" },
    { "title": "PostgreSQL Documentation: Explicit Locking", "url": "https://www.postgresql.org/docs/current/explicit-locking.html", "source_type": "official-doc" },
    { "title": "Haerder, T., Reuter, A. Principles of Transaction-Oriented Database Recovery. ACM Computing Surveys 15(4), 1983", "source_type": "paper" },
    { "title": "Kleppmann, M. Designing Data-Intensive Applications. O'Reilly, 2017. 7장(트랜잭션)", "source_type": "textbook" }
  ]
}
---

## 0. 한눈에 보기 (입문)

### 한 줄 요약
**트랜잭션**은 "여러 개의 DB 변경을 하나로 묶어, 전부 되거나 전부 안 되게" 하는 장치다. **ACID**는 그 묶음이 지켜야 할 네 가지 약속(원자성, 일관성, 격리성, 지속성)이다.

### 쉬운 설명
계좌 이체를 생각하자. A 계좌에서 10만 원을 빼고, B 계좌에 10만 원을 넣는다. 두 단계다.

- 빼기만 하고 넣기 전에 서버가 꺼지면? 10만 원이 사라진다.
- 트랜잭션으로 묶으면 **둘 다 성공하거나, 둘 다 없던 일**이 된다. 중간 상태가 남지 않는다.

또 하나. 재고가 10개인데 두 사람이 **동시에** 3개씩 주문했다고 하자. 두 사람 모두 "10개 있네"를 읽고, 각자 "7개 남음"이라고 저장하면 실제로는 6개가 나갔는데 7개가 남은 것으로 기록된다. 이런 동시 작업 문제를 막는 것이 **격리성**이다.

### 내 프로젝트에서는
- **Preflight의 재업로드 멱등성:** 같은 파일을 두 번 올려도 행·검토 건이 늘지 않게 했다(포트폴리오 기재). "같은 작업을 다시 해도 결과가 같다"는 성질이 **멱등성**이다. 트랜잭션과 함께 쓰면 업로드 도중 실패했을 때 그냥 처음부터 다시 올리면 된다.
- **Preflight의 업로드 단위 되돌리기:** 위험한 변경만 검토로 보내고, **업로드 단위로** 되돌릴 수 있다(ADR-05). 업로드 한 번을 하나의 묶음으로 다룬다는 점에서 트랜잭션과 같은 생각이다. 다만 이것은 업무 수준의 되돌리기(이력 기반)이고, DB 트랜잭션의 롤백과는 시점이 다르다(4절에서 구분).
- **Preflight의 PostgreSQL 이전:** 전 모듈을 PostgreSQL로 옮겼다(08.15). 이후 업로드를 전체 교체에서 **누적 병합**으로 바꿨다(08.16). 누적 병합에서는 "이미 있으면 갱신, 없으면 추가"(upsert)가 핵심 연산이 된다.

### 먼저 알면 좋은 것
- 관계형 데이터 모델링(DE-MODEL-001): 테이블, 기본 키, 제약
- 상태 머신(CS-GEN-001): 동시에 두 전이가 경쟁하는 문제

### 쉬운 확인 질문

<details class="qa" data-type="easy"><summary>Q1. 주문 저장과 재고 차감을 트랜잭션으로 묶었다. 재고 차감 단계에서 오류가 나면 주문 저장은 어떻게 되는가?</summary>

**정답.** 함께 취소된다(없던 일이 된다).

**해설.** 원자성(Atomicity) 때문이다. 묶음 안의 변경은 전부 반영되거나 전부 취소된다.

</details>

<details class="qa" data-type="easy"><summary>Q2. 같은 엑셀 파일을 실수로 두 번 업로드했는데 데이터가 두 배가 되지 않았다. 이 시스템이 갖춘 성질의 이름은?</summary>

**정답.** 멱등성.

**해설.** 같은 작업을 여러 번 해도 한 번 한 것과 결과가 같은 성질이다. Preflight가 재업로드 멱등성을 보장한다.

</details>

## 1. 핵심 요약

- **트랜잭션:** `BEGIN` … `COMMIT`(확정) 또는 `ROLLBACK`(취소)으로 묶은 작업 단위.
- **A 원자성:** 전부 아니면 전무. 중간 실패 시 모두 취소.
- **C 일관성:** 트랜잭션 전후로 제약(기본 키, 외래 키, CHECK, 업무 규칙)이 지켜진다. DB 제약 + 애플리케이션 책임.
- **I 격리성:** 동시에 도는 트랜잭션이 서로의 중간 상태를 얼마나 보지 않는가. 격리 수준으로 조절.
- **D 지속성:** 커밋된 변경은 서버가 꺼져도 남는다(PostgreSQL은 WAL, 미리 쓰는 로그로 보장).
- **PostgreSQL 기본 격리 수준은 Read Committed.** 이 수준에서는 갱신 손실 같은 문제를 직접 막아야 한다(원자적 UPDATE, 행 잠금, 조건부 갱신).
- **멱등성 + upsert(`INSERT ... ON CONFLICT`)**로 재시도에 안전한 적재를 만든다.

## 2. 개념과 등장 배경

1970년대 은행·항공 예약 시스템은 여러 단말이 같은 데이터를 동시에 고치고, 장애가 나도 돈과 좌석이 맞아야 했다. 짐 그레이(Jim Gray)는 1970~80년대에 트랜잭션 개념과 잠금, 복구 기법을 체계화했고(1998년 튜링상), 1983년 테오 헤르더(Theo Härder)와 안드레아스 로이터(Andreas Reuter)는 논문에서 이 성질들을 **ACID**라는 약어로 정리했다.

이후 관계형 DB는 모두 트랜잭션을 기본 기능으로 갖췄다. 2000년대 대규모 분산 시스템에서는 성능을 위해 일부 보장을 완화한 NoSQL이 유행했지만, 다시 많은 시스템이 트랜잭션을 지원하는 방향으로 돌아왔다. "트랜잭션 없이 정합성을 애플리케이션에서 맞추는 것"이 생각보다 훨씬 어렵다는 경험 때문이다.

## 3. 직관적 설명 및 기초 이론

### 네 성질을 이체 예로

| 성질 | 이체에서의 의미 | 깨지면 |
|---|---|---|
| 원자성 | 출금과 입금이 함께 반영되거나 함께 취소 | 돈이 사라지거나 생김 |
| 일관성 | 잔액은 음수가 될 수 없다(CHECK) 같은 규칙 유지 | 규칙 위반 데이터 |
| 격리성 | 다른 사람이 이체 중간 상태(출금만 된 상태)를 보지 않음 | 잘못된 합계 보고 |
| 지속성 | "이체 완료" 응답 후 정전이 나도 기록 유지 | 완료된 거래가 사라짐 |

### 대표적인 동시성 문제

| 문제 | 설명 |
|---|---|
| 더티 리드 | 아직 커밋 안 된 남의 변경을 읽음 |
| 반복 불가능 읽기 | 같은 행을 두 번 읽었는데 그 사이 남이 바꿔 값이 다름 |
| 팬텀 | 같은 조건으로 두 번 조회했는데 그 사이 남이 행을 추가해 개수가 다름 |
| 갱신 손실 | 둘이 같은 값을 읽고 각자 계산해 쓰면서 한쪽 변경이 덮임 |
| 쓰기 왜곡 | 둘이 서로 다른 행을 고쳤는데, 합쳐 보면 규칙이 깨짐(예: 당직자 최소 1명) |

## 4. 엄밀한 정의와 작동 원리

### PostgreSQL의 격리 수준 (공식 문서 기준)

| 수준 | 더티 리드 | 반복 불가능 읽기 | 팬텀 | 직렬화 이상 |
|---|---|---|---|---|
| Read Uncommitted | PostgreSQL에서는 일어나지 않음 | 가능 | 가능 | 가능 |
| **Read Committed (기본값)** | 없음 | 가능 | 가능 | 가능 |
| Repeatable Read | 없음 | 없음 | PostgreSQL에서는 일어나지 않음 | 가능 |
| Serializable | 없음 | 없음 | 없음 | 없음 |

PostgreSQL에서 Read Uncommitted는 Read Committed처럼 동작하고, Repeatable Read도 SQL 표준이 허용하는 팬텀을 막는다. Serializable은 동시 실행 결과가 어떤 순서로 하나씩 실행한 결과와 같도록 보장하며, 그럴 수 없으면 한 트랜잭션을 **직렬화 실패 오류로 중단**시킨다. 따라서 애플리케이션은 **재시도**를 준비해야 한다.

### MVCC

PostgreSQL은 다중 버전 동시성 제어(MVCC)를 쓴다. 행을 고치면 새 버전을 만들고, 각 트랜잭션은 자기 시점의 스냅숏을 본다. 그래서 **읽기는 쓰기를 막지 않고, 쓰기는 읽기를 막지 않는다.** 같은 행을 동시에 쓰는 경우에만 한쪽이 기다린다.

### 지속성과 WAL

커밋할 때 변경 내용을 데이터 파일보다 먼저 **미리 쓰는 로그**(WAL)에 기록하고 디스크에 확실히 쓴 뒤 "완료"를 응답한다. 장애 후에는 로그를 다시 적용해 복구한다.

### DB 트랜잭션 vs 업무 수준 되돌리기

| 구분 | DB 트랜잭션 롤백 | 업무 수준 되돌리기 |
|---|---|---|
| 시점 | 커밋 **전** | 커밋 **후** 언제든 |
| 방법 | ROLLBACK | 이력·버전을 보고 이전 값으로 되돌리는 새 변경 |
| 예 | 업로드 중 오류 → 전부 취소 | 어제 업로드가 잘못됐음을 오늘 발견 → 그 업로드분만 되돌림 |

Preflight의 "업로드 단위로 되돌릴 수 있다"는 오른쪽에 해당한다. 오른쪽이 가능하려면 변경 이력이 남아야 하고, 그 이력을 쓰는 작업 자체는 왼쪽(트랜잭션)으로 보호하는 것이 일반적이다.

## 5. 수식 및 기호 설명

| 표현 | 뜻 |
|---|---|
| `BEGIN` / `COMMIT` / `ROLLBACK` | 시작 / 확정 / 취소 |
| `SELECT ... FOR UPDATE` | 읽은 행에 쓰기 잠금. 다른 트랜잭션의 수정은 대기 |
| `INSERT ... ON CONFLICT (키) DO UPDATE` | 키가 이미 있으면 갱신(upsert) |
| `SET TRANSACTION ISOLATION LEVEL ...` | 격리 수준 지정 |
| 직렬화 실패 | Serializable에서 충돌 시 나는 오류. 재시도 대상 |

## 6. 단계별 계산 또는 동작 예제

### 예제 1. 갱신 손실 재현 (Read Committed)

재고 `qty = 10`. 두 세션이 각각 3개를 차감한다.

| 시점 | 세션 1 | 세션 2 | DB의 qty |
|---|---|---|---|
| t1 | `SELECT qty` → 10 | | 10 |
| t2 | | `SELECT qty` → 10 | 10 |
| t3 | 앱에서 10 − 3 = 7 계산, `UPDATE SET qty = 7` | | 7 |
| t4 | `COMMIT` | | 7 |
| t5 | | 앱에서 10 − 3 = 7 계산, `UPDATE SET qty = 7` | 7 |
| t6 | | `COMMIT` | **7 (정답 4)** |

**고치는 방법 세 가지:**

```sql
-- ① 계산을 DB 안에서 원자적으로
UPDATE stock SET qty = qty - 3 WHERE item_id = 42;

-- ② 조건부 갱신: 재고가 충분할 때만 (영향받은 행 수가 0이면 재고 부족)
UPDATE stock SET qty = qty - 3 WHERE item_id = 42 AND qty >= 3;

-- ③ 읽을 때 잠그기
BEGIN;
SELECT qty FROM stock WHERE item_id = 42 FOR UPDATE;  -- 다른 세션은 여기서 대기
-- 앱 계산
UPDATE stock SET qty = 7 WHERE item_id = 42;
COMMIT;
```

①에서 세션 2의 UPDATE는 세션 1의 커밋을 기다렸다가 **최신 값 7**에서 다시 3을 빼므로 결과가 4가 된다.

### 예제 2. 멱등한 적재 (upsert)

파일의 각 행을 업무 키(예: 품목 + 워크센터)로 식별해 적재한다.

```sql
INSERT INTO task (item_code, work_center, due_date, erp_value)
VALUES ('P-100', 'WC-2', '2026-12-01', '...')
ON CONFLICT (item_code, work_center)
DO UPDATE SET erp_value = EXCLUDED.erp_value, due_date = EXCLUDED.due_date;
```

같은 파일을 두 번 넣어도 행이 늘지 않는다. `ON CONFLICT`가 동작하려면 그 키 조합에 **유니크 제약**이 있어야 한다. 키를 잘못 잡으면 정상 데이터가 하나로 합쳐진다. Preflight에서 품목만으로 중복을 판정해 두 사출처에 나눠 맡긴 정상 데이터를 지운 문제가 있었고, 판정 키에 워크센터를 넣어 고쳤다(ADR-02). 위 SQL은 설명용이며 Preflight의 실제 스키마가 아니다.

### 예제 3. 업로드 한 건을 하나의 트랜잭션으로

```sql
BEGIN;
INSERT INTO upload (id, file_hash, uploaded_at) VALUES (...);
-- 행 수백 개 upsert, 변경 이력 기록, 위험 변경은 검토 대기열에 추가
COMMIT;   -- 중간에 오류가 나면 ROLLBACK: 업로드 기록·행·이력·검토가 함께 사라짐
```

`file_hash`에 유니크 제약을 두면 같은 파일의 두 번째 업로드는 첫 INSERT에서 막힌다. Preflight가 "파일 지문 확인 → 같은 파일·더 오래된 파일은 반영 전에 멈춤"을 첫 단계에 둔 것(포트폴리오 기재)과 같은 목적이다. 실제로 Preflight가 업로드 전체를 한 트랜잭션으로 묶었는지는 기록이 없으니 점검 질문으로 남긴다.

## 7. 시각화와 해석

예제 1의 시간표처럼 **두 세션을 나란히 놓은 표**가 동시성 문제를 이해하는 가장 좋은 그림이다. 문제를 의심할 때는 "두 세션이 같은 값을 읽고, 앱에서 계산해, 각자 쓴다"는 패턴이 있는지 찾는다. 이 패턴이 보이면 Read Committed에서 갱신 손실이 날 수 있다.

## 8. 기술 비교 및 선택 기준

| 상황 | 권장 |
|---|---|
| 숫자 증감(재고, 카운터) | 원자적 `UPDATE ... SET x = x - n` |
| 조건 확인 후 변경 | 조건부 UPDATE, 또는 `SELECT ... FOR UPDATE` |
| 여러 행에 걸친 규칙(당직 최소 1명) | Serializable + 재시도, 또는 규칙 대상 행을 명시적으로 잠금 |
| 파일·외부 데이터 반복 적재 | 유니크 키 + upsert(멱등) |
| 오래 걸리는 사람 작업(검토) | DB 트랜잭션을 길게 열지 말고 상태(검토 대기)로 관리 |

**판단:** 트랜잭션은 짧게 유지한다. 사람의 확인을 기다리는 동안 트랜잭션과 잠금을 열어 두면 다른 작업이 멈춘다. 사람 단계는 상태 머신(CS-GEN-001)으로, DB 단계는 짧은 트랜잭션으로 나눈다.

## 9. 실무 사례

- **결제:** 결제 요청에 멱등 키(idempotency key)를 붙여, 네트워크 재시도로 같은 결제가 두 번 처리되지 않게 한다.
- **배치 적재:** 하루치 데이터를 임시 테이블에 넣고 검증한 뒤, 한 트랜잭션으로 본 테이블에 반영한다.
- **스키마 변경:** PostgreSQL은 대부분의 DDL도 트랜잭션 안에서 실행할 수 있어, 마이그레이션 중 실패하면 통째로 취소된다.
- **좌석·재고 예약:** 조건부 UPDATE로 "남은 수량이 있을 때만 차감"해 초과 판매를 막는다.

## 10. 기존 프로젝트와의 연결

아래 사실은 포트폴리오·저장소 원문(`content/profile.json`)에서 옮긴 것이다.

- **Preflight — 멱등성과 지문:** 같은 파일을 두 번 올려도 행·검토 건이 늘지 않고, 같은 파일·더 오래된 파일은 반영 전에 멈춘다. 예제 2·3의 유니크 키 + upsert + 파일 지문이 이를 구현하는 표준적 방법이다.
- **Preflight — 행 식별 키:** 엑셀 행 번호로 행을 식별하다가 줄 하나가 끼면 사람이 고친 값이 옆 행으로 밀리는 문제가 생겨, 원본 값으로 행을 식별하도록 바꿨다. upsert의 `ON CONFLICT` 키를 고르는 문제와 정확히 같다. 키가 불안정하면 멱등성도 깨진다.
- **Preflight — 출처 우선순위:** 완료일은 사람 > 파일 > 시스템 순으로, 덜 확실한 값이 더 확실한 값을 덮지 않는다. upsert의 `DO UPDATE`에 조건(`WHERE` 절)을 붙여 "우선순위가 같거나 높을 때만 덮기"로 구현할 수 있다(실제 구현 방식은 기록 없음).
- **Preflight — 더하기만 하는 DB 변경:** DB 변경은 더하기만 해서 되돌려도 데이터가 남게 했다(11.10). 스키마 변경을 되돌릴 수 있게 만드는 설계다.
- **DeepVi — 매일 수집:** 뉴스·재무·주가를 PostgreSQL에 저장했다. 매일 수집 작업이 중간에 실패하고 다시 돌 때 같은 기사가 두 번 들어가지 않게 하려면 기사 URL 같은 키에 유니크 제약 + upsert가 필요하다(DeepVi의 실제 처리 방식은 기록 없음, 점검 질문).

## 11. 가정·한계·흔한 오해·트레이드오프

- **오해: 트랜잭션 안에 넣으면 동시성 문제가 다 해결된다.** 기본값 Read Committed에서는 갱신 손실·쓰기 왜곡이 생길 수 있다.
- **오해: Serializable이면 끝.** 충돌 시 오류로 중단되므로 재시도 코드가 없으면 사용자에게 오류가 보인다. 처리량도 줄 수 있다.
- **긴 트랜잭션의 비용:** 잠금 대기, 오래된 행 버전 정리 지연(MVCC의 VACUUM 부담).
- **트랜잭션 밖의 부작용:** 트랜잭션 안에서 이메일을 보내거나 외부 API를 호출하면, 롤백해도 그 부작용은 되돌릴 수 없다. 커밋 후 처리하거나 별도 대기열로 보낸다.
- **분산 환경:** 여러 DB·서비스에 걸친 원자성은 훨씬 어렵다. 보상 작업(saga)이나 멱등 재시도로 설계한다.

## 12. 이해 확인 및 면접 질문

<details class="qa" data-type="concept"><summary>Q1. ACID의 네 글자를 각각 한 문장으로 설명하라.</summary>

**정답.** 원자성: 묶음 안의 변경은 전부 반영되거나 전부 취소된다. 일관성: 트랜잭션 전후로 정의된 규칙과 제약이 지켜진다. 격리성: 동시에 실행되는 트랜잭션이 서로의 중간 상태에 영향을 받지 않는 정도를 보장한다. 지속성: 커밋된 변경은 장애가 나도 사라지지 않는다.

**해설.** 일관성은 DB 제약만으로 다 보장되지 않고 애플리케이션의 규칙 설계도 필요하다.

</details>

<details class="qa" data-type="concept"><summary>Q2. PostgreSQL의 기본 격리 수준과, 그 수준에서 생길 수 있는 대표적 문제 하나는?</summary>

**정답.** Read Committed. 갱신 손실(두 세션이 같은 값을 읽고 각자 계산해 쓰면서 한쪽 변경이 덮임)이나 반복 불가능 읽기가 생길 수 있다.

**해설.** 원자적 UPDATE, 조건부 UPDATE, `FOR UPDATE` 잠금, 또는 더 높은 격리 수준 + 재시도로 막는다.

</details>

<details class="qa" data-type="judgment"><summary>Q3. 업로드한 파일을 사람이 검토해 승인해야 반영되는 기능이 있다. 승인까지 하나의 DB 트랜잭션을 열어 두는 설계의 문제와 대안은?</summary>

**정답.** 사람 검토는 분·시간 단위라 트랜잭션과 잠금이 오래 열려 다른 작업이 막히고, 연결이 끊기면 전부 취소된다. 대안: 업로드 내용을 "검토 대기" 상태로 짧은 트랜잭션에 저장하고, 승인 시 별도의 짧은 트랜잭션으로 반영한다. 사람 단계는 상태로 관리한다.

**해설.** Preflight의 검토 대기열(위험한 변경만 검토로)이 이런 구조다.

</details>

<details class="qa" data-type="applied"><summary>Q4. 매일 새벽 뉴스 수집 작업이 중간에 실패해 다시 돌렸더니 같은 기사가 두 번 저장되었다. 어떻게 고치겠는가?</summary>

**정답.** 기사를 식별하는 안정적인 키(정규화한 URL 등)에 유니크 제약을 걸고 `INSERT ... ON CONFLICT DO NOTHING`(또는 DO UPDATE)으로 적재해 멱등하게 만든다. 이미 생긴 중복은 키 기준으로 정리한다.

**해설.** 재시도는 실패에서 회복하는 가장 단순한 방법이고, 멱등성이 있어야 안전하게 재시도할 수 있다.

</details>

## 13. 선행·후속 학습

- 선행: 관계형 데이터 모델링(DE-MODEL-001), 상태 머신(CS-GEN-001)
- 함께 보기: B-Tree와 데이터베이스 인덱스(DE-DB-001), 소프트웨어 테스트와 유지보수(SE-TEST-001)
- 더 나아가기: MVCC 내부와 VACUUM, 분산 트랜잭션과 saga, 이벤트 소싱

## 14. 참고 자료

출처는 아래 패널에 있다. 격리 수준 표와 PostgreSQL 고유 동작(Read Uncommitted = Read Committed, Repeatable Read의 팬텀 방지, Serializable 직렬화 실패)은 PostgreSQL 공식 문서 "Transaction Isolation"을 따랐다. 6절 SQL은 설명용이며 Preflight의 실제 스키마가 아니다.
