# Engineering Knowledge Base

기초 학문(Foundations)과 실무 기술(Engineering)을 매일 읽는 공학 설명집 라이브러리. 코딩 과제 없이 설명집·수식·시각화·이해 확인 문항으로 학습한다.

## 명령

```bash
npm install          # katex, marked, three(테스트용 로컬 사본)
npm run validate     # 콘텐츠 검증 게이트
npm run build        # 검증 + dist/index.html, dist/artifact.html 생성
npm run test         # 빌드 + 단위 + 브라우저 E2E
npm run new -- CS-ALG-001 algorithms-data-structures foundations   # 초안 생성(중복이면 거부)
```

## 배포

- **GitHub Pages**: 저장소에 푸시하고 Settings → Pages → Source를 "GitHub Actions"로 지정하면 `.github/workflows/pages.yml`이 `dist/`를 배포한다.
- **Claude 아티팩트**: `dist/artifact.html`을 `db`, `user` 기능과 함께 게시한다(학습 상태가 계정에 저장됨).

자세한 결정 사항·검증 결과·미완료 항목은 [HANDOFF.md](HANDOFF.md) 참고.
