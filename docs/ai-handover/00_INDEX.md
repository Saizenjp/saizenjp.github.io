# SaiZen Yamanami 운영 시스템 — AI 인수인계 문서 (INDEX)

> **저장소명**: `saizenjp/saizenjp.github.io`
> **브랜치**: `main`
> **기준 커밋**: `8cd0ad8` (`8cd0ad8f8f68db0a2c9679e2c6452c769846b000`)
> **작성일**: 2026-07-21
> **문서 상태**: 기술기준 (코드에서 확인된 사실 기반)
> **분석 범위**: 저장소 전체 소스 — `app/`, `ops/`, `assets/`, `design/`, `docs/`, `scripts/`, `tests/`, `.github/`, SQL 마이그레이션
> **제외 범위**: `.git`, `node_modules`(미사용), `dist`/`build`(미사용), 캐시, 실제 데이터·비밀값·개인정보

---

## 목적
회사 인수인계 · 운영 매뉴얼 · AI 지식체계 구축을 위한 기술 산출물. **코드에서 확인되는 사실만** 기재하고, 미확인 항목은 `확인 필요`로 표시했다. 각 문서 상단에 공통 헤더(저장소·브랜치·커밋·작성일·상태·범위)를 둔다.

## 문서 목록

| 문서 | 내용 |
|---|---|
| [01_REPOSITORY_OVERVIEW](01_REPOSITORY_OVERVIEW.md) | 저장소 목적·사용자·기술·실행환경·외부시스템 |
| [02_SYSTEM_ARCHITECTURE](02_SYSTEM_ARCHITECTURE.md) | 전체 구성·인증·업로드·시스템 구성도(Mermaid) |
| [03_BUSINESS_FLOW](03_BUSINESS_FLOW.md) | 예약→정산 전체 흐름·업무 흐름도(Mermaid) |
| [04_FOLDER_STRUCTURE](04_FOLDER_STRUCTURE.md) | 폴더·핵심파일·진입점·공통모듈 |
| [05_DATABASE_SCHEMA](05_DATABASE_SCHEMA.md) | 테이블·뷰·RPC·RLS·ER 다이어그램(Mermaid) |
| [06_EXCEL_IMPORT_FLOW](06_EXCEL_IMPORT_FLOW.md) | Excel 컬럼 매핑·검증·중복·저장 순서 |
| [07_ROOM_ASSIGNMENT_FLOW](07_ROOM_ASSIGNMENT_FLOW.md) | 객실 배정 규칙·수정·시즈노야도 |
| [08_MEAL_SHUTTLE_OPERATION](08_MEAL_SHUTTLE_OPERATION.md) | 식사 집계 규칙·송영(배차 미구현) |
| [09_POS_SETTLEMENT_FLOW](09_POS_SETTLEMENT_FLOW.md) | POS·주방·정산 2레이어·흐름도(Mermaid) |
| [10_API_INTEGRATIONS](10_API_INTEGRATIONS.md) | Supabase·Auth·RPC·CDN 연동표 |
| [11_DEPLOYMENT_GUIDE](11_DEPLOYMENT_GUIDE.md) | 빌드·배포·마이그레이션·CI·롤백 |
| [12_ENVIRONMENT_VARIABLES](12_ENVIRONMENT_VARIABLES.md) | 내장상수·localStorage 키(값 미출력) |
| [13_SECURITY_AND_RISKS](13_SECURITY_AND_RISKS.md) | 인증·PII·RLS·클라이언트 노출·심각도 |
| [14_KNOWN_ISSUES](14_KNOWN_ISSUES.md) | 유휴코드·테스트·정합성 위험 |
| [15_IMPROVEMENT_BACKLOG](15_IMPROVEMENT_BACKLOG.md) | 긴급/단기/중기/장기 개선과제 |
| [16_OPEN_QUESTIONS](16_OPEN_QUESTIONS.md) | 코드로 판단 불가한 운영 확인 질문 |

## 정본 우선순위 (저장소 규칙)
**코드 > `CLAUDE.md` > `AGENTS.md`** (근거 `AGENTS.md`). 본 문서가 코드와 어긋나면 코드가 정답이다.
