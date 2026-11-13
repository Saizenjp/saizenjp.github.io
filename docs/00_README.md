# SaiZen 기술 문서

이 폴더는 SaiZen Yamanami 운영 통합 시스템의 기술·구조 문서다.
**작업 규칙은 저장소 루트의 `CLAUDE.md` 가 우선이며, 코드가 항상 정답이다.**

## 지금 쓰는 문서
- `04_현장정산_설계명세.md` — 현장 정산(folio·charges·payments·POS·KDS) 설계 명세 + 출력물(御請求書·領収書·정산 보고서)
- `06_精算補強_設計明細.md` — 정산 보강 핸드오프(P0~P6 · 결정 필요 D1~D8 · 완료 기준) — Min 2026-10-27
- `07_현장정산_실DB_스키마.md` — 실DB 스키마 스냅샷(2026-10-27 · P0 산출물, 코드·문서가 따르는 기준)
- `room-assign-rules.md` — 방배정 규칙 / `manual-room-assign-explain.md` — 회원 디럭스 미배정 안내 매뉴얼 / `manual-room-assign-2027-guest.md` — 2027년 객실 배정 손님 설명 매뉴얼 / `manual-room-assign-staff.md` — 직원 설명·컴플레인 응대 매뉴얼
- `partner-ops.md` — 구마모토 시내·트라이얼 수배 목록 설계 메모 / `marshal-ai-export.md` — 마샬 Ai 명단 내보내기 규칙
- `hardware-list.md` — 현장 도입 물품표(기종·품번). `hardware-list.html` 은 2026-08 판이다(안내 모니터 4·5단계 등 그 뒤 결정은 md 에만 있다) / `deployment-hardware.md`(`deployment-hardware.pptx`) · `deployment-blueprint.html`(`.svg`) — 장비 배치
- `future-work.md` — 보류·백로그
- `audit-2026-11.md` — 2026-11 전체 검수의 결과 요약과 **결정 대기 목록**(데이터 정정 · SQL 승인 · 화면별 결정 · 저장소 운영). 새 작업 전에 먼저 본다 — 정해진 줄에는 날짜와 결정을 적는다
- `ops-page-skeleton.html` — 새 ops 페이지 뼈대(공통 chrome 정본) / `DESIGN.md`(미리보기 `DESIGN-preview.html`) — 디자인 시스템 정리(토큰·컴포넌트)
- `CURSOR.md` — Cursor 로 작업할 때의 안내 / `maturity-kit.md` — 다른 저장소에 옮겨 쓰는 CI·공유 모듈·단위테스트 골격

## 점검·단계 기록(작성한 날 기준 — 그 뒤 바뀐 내용은 `CLAUDE.md`)
- `pre-deploy-audit.md` — 배포 전 감사(2026-06-24)
- `ops-flow-review.md` — 운영 흐름 검수(2026-08)
- `ecosystem-review.md` — 생태계 점검(2026-10-30)
- `병합용_핸드오프_요약_P0.md` · `병합용_핸드오프_요약_P1.md` — 정산 보강 P0·P1 완료 기록(2026-10-27)
- `presentation/` — 시스템 소개 자료(2026-07, 한국어·일본어)

## 옛 기록(지금 규칙이 아니다)
- `01_프로젝트_지침.md` · `02_셋업_로드맵.md` · `03_현지수배서_기술명세.md` — 2026-08 에 삭제된 `/app/` 시절의 개요·셋업·現地手配書 명세. 지금 규칙은 `CLAUDE.md`, 手配書는 `ops/hub/dispatch.html`
- `SESSION_HANDOFF.md` — 2026-06-24 세션 인계 노트(그때의 남은 일·작업 브랜치·캐시 버전)
- `blueprint.html`(2026-06-23) · `work-blueprint.html`(2026-06-24) — `/app/` 가 있던 때의 시스템·작업 블루프린트
