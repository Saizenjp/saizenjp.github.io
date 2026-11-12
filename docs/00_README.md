# SaiZen 기술 문서

이 폴더는 SaiZen Yamanami 운영 통합 시스템의 기술·구조 문서다.
**작업 규칙은 저장소 루트의 `CLAUDE.md` 가 우선이며, 코드가 항상 정답이다.**

- `01_프로젝트_지침.md` · `02_셋업_로드맵.md` · `03_현지수배서_기술명세.md` — **옛 기록**(2026-08 에 삭제된 `/app/` 시절의 개요·셋업·現地手配書 명세). 지금 규칙은 `CLAUDE.md`, 手配書는 `ops/hub/dispatch.html`
- `04_현장정산_설계명세.md` — 현장 정산(folio·charges·payments·POS·KDS) 설계 명세 + 출력물(御請求書·領収書·정산 보고서)
- `06_精算補強_設計明細.md` — 정산 보강 핸드오프(P0~P6 · 결정 필요 D1~D8 · 완료 기준) — Min 2026-10-27
- `07_현장정산_실DB_스키마.md` — 실DB 스키마 스냅샷(P0 산출물, 코드·문서가 따르는 기준)
- `room-assign-rules.md` · `manual-room-assign-explain.md` — 방배정 규칙 · 회원 디럭스 미배정 안내 매뉴얼
- `hardware-list.md` · `deployment-hardware.md` — 장비·기종 확정 / `future-work.md` — 보류·백로그 / `pre-deploy-audit.md` — 배포 전 감사 / `marshal-ai-export.md` — 마샬 Ai 명단 규칙
- `ops-page-skeleton.html` — 새 ops 페이지 뼈대(공통 chrome 정본)
