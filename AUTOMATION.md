# AUTOMATION — 매일 설명집 갱신 절차서

이 문서는 예약 실행(Claude Code 예약 작업)이 매번 따르는 절차다. 사람이 수동으로 실행할 때도 같은 순서를 따른다.
원칙: **검증을 통과한 설명집만 공개한다. 정확성과 설명 깊이가 개수보다 우선이다. 코딩 과제나 프로젝트 제작을 학습 방식으로 넣지 않는다.**

- 원본 소스(단일 기준): GitHub `Navv6/engineering-knowledge-base`의 `main` 브랜치 (비공개)
- 학습 페이지(아티팩트): https://claude.ai/artifact/9HaTcQsou8fb2sZbwC5F8q — 빌드 결과(`dist/artifact.html`)만 게시한다. 소스는 올리지 않는다.

## 1. 소스 준비

1. `add_repo`(owner `Navv6`, repo `engineering-knowledge-base`, access `push`)로 저장소를 세션에 붙이고, 그 결과가 안내하는 대로 `/home/user/engineering-knowledge-base`에 한 번만 clone한다.
2. `cd /home/user/engineering-knowledge-base && npm ci && npm run build && npm run test:unit` 으로 기준 상태를 확인한다. 실패하면 콘텐츠를 추가하지 말고 §6으로.
3. `content/runs/`에 오늘(KST) 날짜 기록이 있고 status가 success면 새 문서를 만들지 않는다(중복 방지). 이 경우 skipped 기록만 커밋·푸시한다.

## 2. 후보 선정

```bash
node scripts/next-candidates.mjs
```

- `content/automation.json`의 `per_run`만큼 기초(foundations)와 실무(engineering) 후보를 각각 위에서부터 고른다.
- 기초는 선행 개념이 갖춰진 것 → 기초 설명집이 적은 학문 → 선행 깊이 순으로 정렬되어 있다. 실무는 목표 직무 기준 우선순위 순이다.
- 후보가 비면 명세 3.2절의 학문 분류에서 아직 없는 기초 개념을 1개 골라 `content/concepts.json`에 개념(한·영 제목, 별칭, 학문)과 선행 관계를 추가한다. 별칭은 다른 개념과 겹치지 않게 하고 너무 일반적인 단어(예: "최적화", "graph")는 피한다.
- `suggested_id`가 `*-GEN-*`이면 주제에 맞는 ID(예: `CS-THEORY-001`)로 바꿔도 된다. 형식은 `대문자-대문자-세자리`.

## 3. 초안 생성과 작성

```bash
npm run new -- <ID> <concept-id> <foundations|engineering>
```

중복이면 스크립트가 거부한다. 그 경우 다음 후보로 넘어간다. 기존 설명집 5편(`content/articles/*.md`) 중 하나를 먼저 읽어 형식·깊이·문체를 맞춘다.

**작성 기준 (명세 4장)**
- 14절 구조. 해당 없는 절은 억지로 채우지 않되 `핵심 요약`, `개념과 등장 배경`, `가정·한계…`, `이해 확인…`, `선행·후속…`은 필수(검증 게이트가 확인).
- 한국어 기본, 전문 용어는 영문 병기. 직관 → 정의 → 유도·계산 → 적용 순서.
- 수식은 `$…$`, `$$…$$`(LaTeX). 변수 정의와 손으로 따라갈 수 있는 계산 예제를 넣고, 계산 결과를 직접 다시 검산한다.
- 통계: 모집단/표본, 가정, 추정량, 불확실성, 해석 오류 구분. p-value를 귀무가설이 참일 확률로 쓰지 않는다.
- 컴퓨터공학: 동작 흐름, 시간·공간복잡도, 적용 조건.
- 코드 예시는 개념 이해용 최소 예제만.
- `이해 확인 및 면접 질문`에 3~5문항. 형식은 기존 문서와 동일하게 `<details class="qa" data-type="concept|judgment|applied"><summary>Q…</summary>` + 빈 줄 + `**정답.** …` + `**해설.** …` + 빈 줄 + `</details>`.
- `기존 프로젝트와의 연결`: 사용자의 Preflight, DeepVi, STT·보고서 자동화 경험은 **사실로 확인된 것이 없으므로 점검 질문 형태**로만 쓴다. 경력·성과 수치·기술 사용 이력을 지어내지 않는다.
- 출처: 교재·논문은 서지 정보(저자, 제목, 출판사/학술지, 권호, 연도)로 쓰고 URL을 만들지 않는다. URL은 공식 문서처럼 확실히 존재하는 안정적 주소만 넣는다. 확인하지 못한 버전 의존 사실은 본문에 "확인 필요"를 명시한다. 2개 이상.
- 본문에서 다른 문서를 ID로 언급할 때는 존재하거나 `planned_article`로 계획된 ID만 쓴다.
- 시각화는 선택. 기존 이름(`bigo`, `vector3d`, `ci`, `btree3d`, `embed3d`)만 쓸 수 있다. 새 시각화가 필요하면 이번 실행에서는 넣지 말고 실행 기록의 `notes`에 제안만 남긴다.
- 읽기 시간: 기초 15~30분, 실무 5~15분.
- 다 쓰면 `status: "published"`, `verified_at`과 `updated_at`을 오늘 날짜(KST)로.

## 4. 검증

```bash
npm run validate
```

- 오류가 나면 고쳐서 다시 실행한다(최대 2회 수정).
- 그래도 통과하지 못한 문서는 `status: "draft"`로 되돌린다. 초안은 공개되지 않지만 소스와 함께 보관되어 다음 실행에서 이어서 고칠 수 있다.
- 마지막으로 스스로 사실 점검을 한 번 더 한다: 정의, 수식, 예제 계산값, 연도·저자, 버전 의존 서술. 의심스러운 서술은 삭제하거나 "확인 필요"로 표시한다.

## 5. 빌드·테스트·게시

```bash
npm run build && npm run test:unit && npm run test:e2e
```

E2E는 2~4분 걸린다. 모두 통과해야 게시한다.

1. 실행 기록 `content/runs/<YYYY-MM-DD>T<HHMM>.json`을 쓴다(§7 형식). `npm run build`를 한 번 더 실행한다.
2. 커밋·푸시: `git add -A && git commit -m "daily: <ID들>"` 후 `git -c push.negotiate=true push origin HEAD:main`. 푸시가 거부되면(다른 변경이 먼저 들어옴) `git pull --rebase origin main` 후 다시 빌드·테스트하고 푸시한다. force push 금지.
3. Artifact 도구로 위 URL을 `action: "read"`한 뒤 `action: "publish"`, `url`: 위 주소, `file_path`: `dist/artifact.html`로 게시한다. `capabilities`, `icon`, `files`는 보내지 않는다.
4. 게시 결과에 오류가 없는지 확인한다.

## 6. 실패 처리

- 기준 상태(§1)나 빌드·테스트(§5)가 실패하면 **페이지를 게시하지 않는다.** 새 문서를 빼고 원래 소스로 빌드·테스트가 통과하면 `status: "failed"` 실행 기록만 커밋·푸시하고 페이지를 재게시한다. 그것도 안 되면 아무것도 푸시·게시하지 않고 세션 결과로만 보고한다.
- 저장소를 붙이거나 clone할 수 없으면 작업을 중단하고 원인을 보고한다(아티팩트에는 소스가 없으므로 다른 경로로 진행하지 않는다).
- 게시 충돌: 아티팩트 게시가 `conflict`로 거부되면 다시 `read`한 뒤 같은 `dist/artifact.html`로 한 번 더 게시한다. 소스 기준은 저장소이므로 페이지는 항상 `main` 빌드 결과다. `force` 금지.
- 같은 날 재실행: 이미 오늘 날짜의 실행 기록이 있고 그 실행이 `success`이면 새 문서를 만들지 않고 `skipped` 기록만 남긴다(중복 생성 방지).
- 사용자 학습 기록은 페이지의 개인 저장소에 있으므로 이 절차가 건드리지 않는다.

## 7. 실행 기록 형식 (RefreshRun)

```json
{
  "run_id": "2026-11-25T0644",
  "trigger": "schedule | manual",
  "track": "both",
  "started_at": "2026-11-24T21:44:00Z",
  "finished_at": "2026-11-24T22:10:00Z",
  "status": "success | partial | failed | skipped",
  "created": ["OR-OPT-001", "AI-GEN-001"],
  "drafts": [],
  "skipped": [{ "concept": "…", "reason": "…" }],
  "errors": [],
  "created_count": 2, "updated_count": 0, "skipped_count": 0,
  "notes": "선택: 다음 실행에 남길 메모"
}
```

`partial`은 일부 문서만 공개된 경우다. 페이지의 학습 설정 화면에 최근 실행 기록이 표시된다.
