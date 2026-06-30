# Cursor로 이 저장소 작업하기 (운영자용 가이드)

이 문서는 **Cursor(코드 에디터 + AI)** 로 SaiZen 운영 시스템을 더 잘 다루기 위한 실전 안내입니다.
Claude Code(터미널/웹)와 똑같은 저장소를 Cursor에서도 열어 AI에게 시킬 수 있습니다.

---

## 1. 처음 한 번 설정

1. Cursor를 설치하고 **이 폴더(`saizenjp.github.io`)를 엽니다**.
2. Cursor가 자동으로 아래 규칙 파일을 읽습니다(따로 할 것 없음):
   - `.cursor/rules/saizen-core.mdc` — **항상 적용**되는 핵심 규칙(한국어 응답·디자인 색·검증·배포·보안).
   - `.cursor/rules/ops-changes.mdc` — `ops/` 파일을 만질 때 자동 적용되는 체크리스트(i18n·권한·SQL·캐시).
   - `.cursor/rules/app-print.mdc` — `app/` 파일을 만질 때 적용.
   - `AGENTS.md` / `CLAUDE.md` — 프로젝트 전체 설명(정본).
3. 덕분에 Cursor의 AI도 **한국어로 답하고, 우리 규칙(색·검증·배포·키 보안)을 지키며** 작업합니다.

> Supabase 비밀키(`sb_secret_…`)는 **절대 채팅창이나 코드에 붙여넣지 마세요.** 화면에 쓰는 건 공개용 publishable key만입니다.

---

## 2. Cursor가 이 프로젝트에서 잘하는 일

- **"이 기능 어디서 처리돼?"** — 코드 전체를 검색해 위치를 찾아줍니다(예: "싱글차지가 어디서 정산에 들어가?").
- **작은 화면 수정** — 라벨 문구·색·버튼 위치 같은 단순 변경.
- **설명 듣기** — 특정 페이지/함수가 무슨 일을 하는지 한국어로 풀어 설명.
- **반복 작업** — 3개국어(일/한/영) 문구 동시 추가, 여러 페이지 일괄 수정.
- **검증** — 고친 뒤 문법 검사·테스트를 대신 돌려줍니다.

### 잘 안 맞거나 조심할 일
- **DB 마이그레이션 실행**(`ops/hub/sql`)은 결과를 되돌리기 어렵습니다 → 실행 전 꼭 확인하고, 멱등(여러 번 돌려도 안전)하게.
- **정산·요금 관련 변경**은 돈이 걸리므로, 바꾸기 전에 "어떻게 청구에 반영되는지" 먼저 물어보세요.
- 큰 구조 변경보다는 **한 번에 하나씩** 시키는 게 안전합니다.

---

## 3. 안전한 작업 흐름 (Cursor 채팅에 그대로 부탁해도 됨)

1. **무엇을 바꿀지 한 문장으로** 부탁: 예) "夕食 화면 상단 안내문을 ○○로 바꿔줘."
2. AI가 고치면 **검증**을 시킵니다(또는 자동으로 함):
   ```bash
   npm run verify
   ```
   - `node scripts/check-syntax.mjs` (모든 화면의 스크립트 문법 검사)
   - 단위 테스트(`tests/`)
3. 통과하면 **커밋·배포**(Git): `main`에 올리면 약 1분 뒤 라이브(`https://saizenjp.github.io/`)에 반영됩니다.
4. 라이브에서 직접 눈으로 확인.

> 공유 파일(`ops/assets/saizen-ops.js`·`.css`·`saizen-core.js`)을 고쳤다면, 모든 페이지의 `?v=` 캐시 번호를 같이 올려야 새 코드가 반영됩니다. AI에게 "캐시 버전도 올려줘"라고 하면 됩니다(규칙에 적혀 있어 보통 알아서 합니다).

---

## 4. 자주 쓰는 명령 (Cursor 안 터미널에서)

```bash
npm run verify                         # 커밋 전 필수: 문법 + 테스트
node scripts/check-syntax.mjs          # 전 HTML 스크립트 문법만
git add -A && git commit -m "설명"     # 변경 기록
git push origin HEAD:main              # 배포(라이브 반영)
```

---

## 5. 프로젝트 지도 (어디에 뭐가 있나)

| 위치 | 내용 |
|---|---|
| `app/index.html` | 인쇄·출력 시스템(단일 파일, 오프라인·가끔 사용) |
| `ops/index.html` | Hub 랜딩(카드 메뉴) |
| `ops/hub/*.html` | 각 운영 화면(방배정 room, 정산 settle, POS, 주방 kitchen, 夕食 dinner, 시즈노야도 shizu …) |
| `ops/assets/saizen-ops.js` | 공유 로직·i18n·설명서(SO_HELP)·권한 가드 |
| `ops/assets/saizen-core.js` | 순수 규칙(회원판정·식수·단가 등) 단일 진실원 |
| `ops/hub/sql/NN_*.sql` | Supabase 마이그레이션(번호순·멱등) |
| `CLAUDE.md` | **프로젝트 전체 규칙·도메인·변경 이력(정본)** |
| `.cursor/rules/` | Cursor가 자동으로 따르는 규칙 |

---

## 6. 막히면

- "이거 왜 이래?" → Cursor에 **파일을 열어둔 채** 물어보면 맥락을 잡고 답합니다.
- 정산·권한·마이그레이션처럼 위험한 부분은 **바꾸기 전에 설명부터** 요청하세요.
- 더 깊은 규칙은 `CLAUDE.md`와 `.claude/skills/saizen-ops-change/SKILL.md`에 있습니다.
