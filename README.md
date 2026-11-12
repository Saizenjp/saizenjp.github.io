# SaiZen Yamanami 운영 통합 시스템

아소 야마나미 리조트(구마모토)의 현장 운영 허브. 메리트투어 송객 데이터(엠클릭 엑셀)를 등록하면 네임택·항공커버·송영·숙박·방배정·식사·골프 조편성·현장 정산·안내 모니터까지 한 곳에서 돌린다.
**작업 규칙은 `CLAUDE.md` 가 정답이고, 코드가 문서보다 우선한다.** 라이선스는 `LICENSE`(All rights reserved — 오픈소스 아님).

## 구조
```
/index.html            루트 → /ops/ 리다이렉트
/ops/index.html        카드 랜딩(권한별 노출)
/ops/hub/*.html        화면 37개(파일 하나 = 화면 하나) — admin, aircover, audit, bill, board, cart, course, dinner, dispatch, frontdesk, groupcodes, housekeeping, inventory, keyslip, kitchen, menu, nametag, notice, occupancy, outings, partner_ops, pos, pos_customer, qrcards, room, roomstats, settle, settle_merit, settle_report, shizu, signage, stats, staychart, step1, transfer, visitor_stats, watchlist
/ops/assets/           saizen-ops.js(공통 chrome·i18n·권한·헬퍼) · saizen-ops.css · saizen-core.js(순수 도메인 규칙, Node 테스트 공유) · qrcode-generator.js
/ops/hub/sql/          Supabase SQL 기록 01~169(번호순 · Min 승인 뒤 MCP/SQL Editor 로 적용) · 00_VERIFY.sql(적용 상태 점검) · 00_DATA_AUDIT.sql
                       새 파일은 멱등하게 쓴다. 이미 적용된 옛 번호 파일은 다시 실행하지 않는다(05·06 은 객실 마스터·방배정을 지우고, 뒤 번호가 같은 함수·정책을 다시 정의했다)
/ops/edge-functions/   translate-remarks/index.ts — 비고 일본어 번역(DeepL) 함수의 소스(시즈 예약표가 부른다). 배포는 Supabase 쪽에서 따로 한다(CI 는 함수를 배포하지 않는다) · DEEPL_API_KEY 가 없으면 화면은 원문을 그대로 보인다
/assets/               로고 SVG
/docs/                 기술 문서(00_README.md 에 목록) · 설계 명세(04 현장정산 · 06 정산 보강) · 규칙(방배정) · 매뉴얼
/scripts/              check-syntax(문법: 전 HTML 인라인 스크립트·저장소의 .js/.mjs 파일 + 공용 헬퍼(esc·tx·lang·toast) 정의 범위·주석에 먹힌 속성·정적 on*= 핸들러·색(HEX 등) 폴백(ops 아래 파일))
                       check-i18n(언어 전환 회귀) · check-wait(대기 예약 제외 — 화면·공용 JS 의 bookings 표 이름 글자·임베드마다 필터 또는 사유 주석. 행을 읽지 않는 등록 현황·연결 확인 꼴만 「허용 문장」으로 통과) · check-tracked(올라가는 파일 — 데이터·문서·압축·키 파일 이름, 비밀값 꼴)
                       lib/js-skeleton.mjs(검사 스크립트 공용 — 스크립트의 글자를 코드·문자열·주석으로 가린다) · lib/html-entities.mjs(HTML 문자 참조 표). 검사 스크립트의 회귀 테스트 = tests/check-scripts.test.mjs
/tests/                node:test 단위테스트(saizen-core)
/design/               디자인 시스템 미리보기(컴포넌트별 HTML — design/README.md)
/shizunoyado/          志津の宿 공식 홈페이지(정적 HTML — 운영 화면과 별개, shizunoyado/README.md)
```

## 실행·검증
- 배포 = GitHub Pages(`main` 루트 자동). Supabase 는 publishable key 가 코드에 내장돼 어느 PC 든 자동 연결(RLS 로 보호, `file://` 에서는 동작하지 않음).
- `npm run verify` = 문법·정적 검사 + i18n 검사 + 대기 필터 검사 + 추적 파일 검사 + 단위테스트. CI(`.github/workflows/ci.yml`)가 push·PR 마다 같은 검사를 돌린다.
  CI 는 push 뒤에 돌고 배포를 막지 않는다(워크플로에 배포 단계가 없고, Pages 는 `main` 을 그대로 내보낸다) — CI 가 실패해도 배포는 진행되므로, 올리기 전에 `npm run verify` 를 통과시킨다.
- 화면 스모크는 jsdom·Playwright(세션 작업 폴더)로, SQL 적용 상태는 `ops/hub/sql/00_VERIFY.sql` 로 확인한다.

## 문서
- `docs/00_README.md` — 문서 목록
- `docs/04_현장정산_설계명세.md` · `docs/06_精算補強_設計明細.md` · `docs/07_현장정산_실DB_스키마.md` — 현장 정산
- `docs/room-assign-rules.md` · `docs/manual-room-assign-explain.md` · `docs/manual-room-assign-staff.md` — 방배정 규칙 · 손님 설명 · 직원 응대 매뉴얼
- `docs/partner-ops.md` — 구마모토 시내·트라이얼 수배 목록 / `docs/marshal-ai-export.md` — 마샬 Ai 명단 내보내기
- `docs/hardware-list.md` · `docs/future-work.md` · `docs/ecosystem-review.md` · `docs/pre-deploy-audit.md` — 장비 · 보류·백로그 · 생태계 점검 · 배포 전 감사(2026-06)
- `docs/ops-page-skeleton.html` — 새 화면 뼈대 / `.claude/skills/saizen-ops-change/SKILL.md` — ops 변경 체크리스트
