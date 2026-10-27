# SaiZen Yamanami 운영 통합 시스템

아소 야마나미 리조트(구마모토)의 현장 운영 허브. 메리트투어 송객 데이터(엠클릭 엑셀)를 등록하면 네임택·항공커버·송영·숙박·방배정·식사·골프 조편성·현장 정산·안내 모니터까지 한 곳에서 돌린다.
**작업 규칙은 `CLAUDE.md` 가 정답이고, 코드가 문서보다 우선한다.** 라이선스는 `LICENSE`(All rights reserved — 오픈소스 아님).

## 구조
```
/index.html            루트 → /ops/ 리다이렉트
/ops/index.html        카드 랜딩(권한별 노출)
/ops/hub/*.html        화면 36개 — admin, aircover, audit, bill, board, cart, course, dinner, dispatch, frontdesk, groupcodes, housekeeping, inventory, keyslip, kitchen, menu, nametag, notice, occupancy, outings, pos, pos_customer, qrcards, room, roomstats, settle, settle_merit, settle_report, shizu, signage, stats, staychart, step1, transfer, visitor_stats, watchlist
/ops/assets/           saizen-ops.js(공통 chrome·i18n·권한·헬퍼) · saizen-ops.css · saizen-core.js(순수 도메인 규칙, Node 테스트 공유) · qrcode-generator.js
/ops/hub/sql/          Supabase 마이그레이션 01~157(번호순·멱등, SQL Editor/MCP 수동 적용) · 00_VERIFY.sql(적용 상태 점검) · 00_DATA_AUDIT.sql
(Edge Function)        translate-remarks — DeepL 비고 번역(Supabase 대시보드에 배포, 저장소 밖 · DEEPL_API_KEY 미설정 시 원문 표시)
/assets/               로고 SVG
/docs/                 기술 문서(00_README.md 에 목록) · 설계 명세(04 현장정산 · 06 정산 보강) · 규칙(방배정) · 매뉴얼
/scripts/              check-syntax(전 HTML 인라인 스크립트 파싱) · check-i18n · check-wait(대기 예약 필터 강제)
/tests/                node:test 단위테스트(saizen-core)
```

## 실행·검증
- 배포 = GitHub Pages(`main` 루트 자동). Supabase 는 publishable key 가 코드에 내장돼 어느 PC 든 자동 연결(RLS 로 보호, `file://` 에서는 동작하지 않음).
- `npm run verify` = 문법 검사 + i18n 검사 + 대기 필터 검사 + 단위테스트. CI(`.github/workflows/ci.yml`)가 모든 push 에서 같은 검사를 돌린다.
- 화면 스모크는 jsdom·Playwright(세션 작업 폴더)로, SQL 적용 상태는 `ops/hub/sql/00_VERIFY.sql` 로 확인한다.

## 문서
- `docs/00_README.md` — 문서 목록
- `docs/04_현장정산_설계명세.md` · `docs/06_精算補強_設計明細.md` · `docs/07_현장정산_실DB_스키마.md` — 현장 정산
- `docs/room-assign-rules.md` · `docs/manual-room-assign-explain.md` — 방배정 규칙·안내 매뉴얼
- `docs/hardware-list.md` · `docs/future-work.md` · `docs/pre-deploy-audit.md`
