# 12. 환경변수 (ENVIRONMENT VARIABLES)

> **저장소명**: `saizenjp/saizenjp.github.io`
> **브랜치**: `main`
> **기준 커밋**: `8cd0ad8` (`8cd0ad8f8f68db0a2c9679e2c6452c769846b000`)
> **작성일**: 2026-07-21
> **문서 상태**: 기술기준 (코드 근거)
> **분석 범위**: 설정값(내장 상수·localStorage 키). **실제 값은 출력하지 않음**
> **제외 범위**: 실제 키·비밀값·개인정보

---

## 1. 중요 전제

- 이 저장소는 **정적 사이트 + Supabase**이며 **서버 프로세스 환경변수(`.env`)가 없다.** 빌드/런타임 env 주입 단계가 없다(빌드 없음).
- 대신 설정은 두 곳에 존재: **(A) 소스 내장 상수**, **(B) 브라우저 localStorage 키**.
- ⚠ 아래 표는 **변수명·용도·사용 위치**만 기재하며 **실제 값은 출력하지 않는다.**

## 2. (A) 소스 내장 설정 상수

| 변수명 | 용도 | 필수 | 사용 파일 | 클라이언트 노출 | 보안 주의 |
|---|---|---|---|---|---|
| `SB_URL_DEFAULT` | Supabase 프로젝트 URL 기본값 | 예 | `ops/assets/saizen-ops.js:18` | 노출(정적) | 공개 가능(프로젝트 식별자) |
| `SB_KEY_DEFAULT` | Supabase **publishable** 키 기본값(접두 `sb_publishable_`) | 예 | `ops/assets/saizen-ops.js:19` | 노출(정적) | **publishable만 허용.** RLS가 실제 방어. `sb_secret_`/service_role 절대 금지 |

> ⚠ `sb_secret_`/`service_role` 키는 저장소에 **부재**(`docs/pre-deploy-audit.md`). 프론트·저장소·채팅 어디에도 넣지 않는다(RLS 우회 = 치명적).

## 3. (B) localStorage 설정 키 (`/ops/`)

| 키 | 용도 | 필수 | 사용 파일 | 노출 | 보안 주의 |
|---|---|---|---|---|---|
| `saizen_sb_url` | Supabase URL 재정의(내장 기본값 덮어씀) | 아니오 | `ops/assets/saizen-ops.js` | 브라우저 로컬 | 프로젝트 URL |
| `saizen_sb_key` | Supabase publishable 키 재정의 | 아니오 | `ops/assets/saizen-ops.js` | 브라우저 로컬 | publishable만 |
| `saizen_lang` | 화면 언어(ja/ko/en) — `/app/`·`/ops/` 공유 | 아니오 | 전 페이지 | 로컬 | 없음 |
| `saizen_ops_user` | 담당자 표시명(수정이력 라벨, **인증 아님**) | 아니오 | `saizen-ops.js:1119-1129` | 로컬 | 성명 노출(로컬) |
| `saizen_last_email` | [아이디 기억] 로그인 이메일 자동입력 | 아니오 | `saizen-ops.js` | 로컬 | 공유 PC 잔존 주의 |
| `saizen_dispatch_mask` | 현지수배서 여권·전화 마스킹 토글(기본 ON) | 아니오 | `app/index.html:8989,8994`·`ops/hub/dispatch.html:189,301` | 로컬 | UX 마스킹(서버 강제 아님) |

## 4. (B') localStorage 데이터 키 (`/app/` — 레거시, Supabase 미사용)

`/app/index.html`은 서버 없이 localStorage에 수기 데이터를 저장한다(설정이라기보다 데이터 저장소). 대표 키(근거 `CLAUDE.md` §3):

| 키 | 용도 |
|---|---|
| `manualData` | 월별 수기입력 |
| `memberMasterMap`·`memberMasterMeta`·`memberMasterFile`·`memberMasterCount` | 회원 마스터(로컬) |
| `learnedMasterMap`·`learnedMasterMeta` | 학습된 코드 |
| `tagCodeManualMap`·`tagTeamOverrideMap` | 태그코드 수기·팀 오버라이드 |
| `saizen_dispatch_mask` | 송영 마스킹(공유) |
| `saizen_lang` | 화면 언어(공유) |

> ⚠ `/app/`의 localStorage 데이터는 브라우저·기기에 종속(공유 안 됨). 개인정보(회원 마스터 등)가 로컬에 저장될 수 있으니 공용 단말 관리 주의.

## 5. Supabase Auth 설정 (Supabase 콘솔 측)

코드가 아니라 Supabase 프로젝트 설정에 존재(문서화 필요):
- **Site URL** = `https://saizenjp.github.io/ops/`, **Redirect URLs** = `https://saizenjp.github.io/**` (초대/비번재설정 링크 동작에 필요). 근거 `CLAUDE.md`(초대 링크 견고화 항목).
- signups **OFF**(자가 회원가입 없음). 근거 `CLAUDE.md`, `sql/28`.

## 6. 확인 필요

- `translate-remarks` Edge Function이 외부 번역 API 키를 사용한다면 그 키는 **Supabase Edge Function Secret**으로 관리되어야 함(저장소 밖). 파일 미확인 → **확인 필요**.
- Supabase 프로젝트 설정(Site URL·Redirect·RLS 적용)은 코드 밖 → 콘솔 확인 필요.
