# 13. 보안 및 위험 (SECURITY AND RISKS)

> **저장소명**: `saizenjp/saizenjp.github.io`
> **브랜치**: `main`
> **기준 커밋**: `8cd0ad8` (`8cd0ad8f8f68db0a2c9679e2c6452c769846b000`)
> **작성일**: 2026-07-21
> **문서 상태**: 기술기준 (코드에서 확인된 사실 기반)
> **분석 범위**: 인증·권한·PII·클라이언트 노출·RLS
> **제외 범위**: 실제 키/비밀값(미출력), 침투 테스트

---

## 1. 인증 및 권한 구조

**로그인·세션** — 근거 `ops/assets/saizen-ops.js`
- 인증 클라이언트는 `authClient()`가 `supabase.createClient(url, key)`로 생성(`:1170-1178`). url/key는 내장 기본값 + localStorage(`saizen_sb_url`/`saizen_sb_key`).
- 로그인 = `supabase.auth.signInWithPassword({email,password})` — 상단 폼 `authLogin()`(`:1240-1246`), 중앙 카드 `renderLogin().go()`(`:1290-1294`). 성공 시 `location.reload()`. 로그아웃 `authLogout()`→`auth.signOut()`(`:1247-1250`).
- 세션 = `mountAuth()`가 `auth.getSession()`(`:1186-1208`).
- 초대/비번재설정(`#type=invite|recovery|signup`, PKCE `?code=`) = `handleAuthRedirect()`(`:1527-1561`) → `auth.updateUser({password})`.
- **계정 발급 = 마스터(admin) 전용**(자가 회원가입 없음, 가입은 요청만). 근거 로그인 카드 안내(`:1278`), `ops/hub/sql/28_access_requests.sql`.

**권한 조회** — `me_access` RPC
- `__so_meAccess()`(`:1350-1364`)가 `rpc('me_access')` → `{role, areas, read_areas, name, dept, title, active}` 캐시. RPC 정의 `ops/hub/sql/18_access_control.sql`, 영역 RLS `ops/hub/sql/19_rls_areas.sql`, 읽기/쓰기 분리 `ops/hub/sql/46_read_write_areas.sql`.
- **역할**: admin(마스터, 전 영역 통과) / manager / staff. **영역(area)**: step1·room·print·shizu·front·settle·pos·kitchen·menu·stats·report·board·groupcodes·app·golf 등.
- `__so_getUser()`(`:1119-1121`) = 표시·수정이력용 라벨(세션이름 우선, 없으면 `saizen_ops_user`) — **인증 아님**(주석 `:1129`).

## 2. 위험 항목 (심각도·근거·개선)

| # | 위험 | 심각도 | 근거 | 개선 방향 |
|---|---|---|---|---|
| S1 | **정산 뷰 RLS 우회** — `v_folio_balance`·`v_settlement_by_category`·`v_folio_summary`·`v_folio_by_category`·`v_folio_lines`가 `security_invoker` 없이 생성되면 소유자 권한 실행 → 기반 테이블 영역 RLS(19) 우회. 정산 권한 없는 staff가 전 팀 매출·잔액 열람 | **상** | `docs/pre-deploy-audit.md:11-13` · `ops/hub/sql/09_settlement_core.sql` · 보완 `ops/hub/sql/39_*.sql` | 뷰를 `security_invoker=on` 재생성 + `revoke select ... from anon`. **39 적용 여부 확인 필요** |
| S2 | **마이그레이션 적용 추적 사각** — 수동 SQL 실행 + `00_VERIFY.sql`이 과거 일부 번호만 검사 → RLS 강화(17~19)·신규 정책이 실제 DB에 적용됐는지 코드로 확증 불가 | **상** | `docs/pre-deploy-audit.md:27-29` · `ops/hub/sql/00_VERIFY.sql` | 전 마이그레이션 VERIFY 확장(현재 87까지 확장됨) 후 라이브 DB에서 전수 ✅ 확인 |
| S3 | **UI 게이트는 우회 가능** — `guardPage()`(`saizen-ops.js:1472-1493`)·랜딩 `gate()`(`ops/index.html:397-407`)는 전부 클라이언트 JS 오버레이. DevTools로 오버레이 제거·`meAccess` 조작 가능 | **중** | `ops/assets/saizen-ops.js`, `ops/index.html` | 실제 방어는 RLS. UI는 UX 계층으로만 신뢰. → RLS 완전성이 전제 |
| S4 | **루트 접근 게이트 없음** — `index.html`이 비번 없이 `/ops/` 리다이렉트 | **중** | `index.html:13,57` | 정적 호스팅 특성상 클라이언트 게이트는 무의미 → RLS를 신뢰경계로 유지(현 설계 타당). HTML만 노출, 데이터는 RLS 보호 |
| S5 | **PII 취급 지점** — `passengers`(생년월일·여권번호·여권만료·전화), `member_codes`(이름+생년6+등급). member_key=이름+생년6 | **상(관리)** | `ops/hub/sql/01_schema.sql`(passengers `:62-81`), `ops/hub/sql/10_member_grade.sql` | 읽기 RLS를 admin/manager·해당영역으로 제한(19·65). 부여 대상 최소화. 마스킹 토글 병행 |
| S6 | **Publishable 키·URL 소스 내장** | **하** | `ops/assets/saizen-ops.js:16-19`(`SB_URL_DEFAULT`/`SB_KEY_DEFAULT`, 접두 `sb_publishable_`) | publishable 키는 공개 전제(RLS가 실제 방어). `sb_secret_`는 부재 확인(`pre-deploy-audit.md:5,61`). **현행 유지 가능** |
| S7 | **공유 PC 세션·이메일 잔존** — localStorage에 URL/키·`saizen_last_email`·담당자명 저장 | **하** | `ops/assets/saizen-ops.js` | 공용 단말 로그아웃 습관·세션 만료 정책 검토 |

## 3. 개인정보 처리 가능 지점

- **입력**: 엠클릭 Excel 업로드(`ops/hub/step1.html`) → `passengers`(여권·생년·전화)·`member_codes`(이름+생년). 
- **표시**: 현지수배서(`dispatch.html`) 여권·전화 표시(마스킹 토글로 가림), 네임택/명패 등 인쇄물, 프론트데스크·POS 명단.
- **마스킹**: `saizen_dispatch_mask`(localStorage, 기본 ON) — 화면 UX 마스킹이며 **서버 강제 아님**(RLS 통과 사용자엔 데이터 전달). 근거 `app/index.html:8989,8994`·`ops/hub/dispatch.html:189,301`·`docs/03_현지수배서_기술명세.md:109`.
- **고지**: `privacy.html`(개인정보처리방침, noindex).

## 4. 파일 업로드 위험

- 업로드는 **클라이언트 측 Excel 파싱(SheetJS)만** — 서버 저장 없이 브라우저에서 파싱 후 Supabase 행 upsert. 파일 자체를 서버에 올리지 않음 → 파일 저장소 취약점 표면 없음. 근거 `ops/hub/step1.html`, `06_EXCEL_IMPORT_FLOW.md`.
- 위험: 악성 Excel의 클라이언트 파서 취약점(SheetJS 버전 `0.18.5` 고정) — **확인 필요**(라이브러리 CVE 추적). 입력 신뢰 경계는 운영자 PC.

## 5. 클라이언트에 노출되는 값

- Supabase URL·**publishable 키**(소스 내장, 공개 안전). 
- 색인 차단: 루트 `index.html:7`·`ops/index.html:7` `noindex,nofollow`, `robots.txt` 전체 `Disallow: /` — 일관적.
- **secret/service_role 키 부재 확인**(`docs/pre-deploy-audit.md:5,61`).

## 6. 권한 검증 누락 가능성

- 서버단 실제 검증 = RLS. **매니저 영역 제한**은 UI/페이지가드 레벨에서 강화됨(admin만 자동통과)이나, 일부 민감읽기 RLS는 manager 신뢰(방어층) — 완전 서버단 매니저 제한이 필요하면 RLS 추가 강화 필요. 근거 `CLAUDE.md`(권한 노출 감사 항목), `ops/hub/sql/19_rls_areas.sql`.
- 정산 뷰 S1이 대표적 서버단 누락(개선 대상).

## 7. 로그 민감정보 기록 가능성

- 서버 애플리케이션 로그 없음(정적+Supabase). 클라이언트 `console` 디버그 출력에 개인정보가 찍힐 가능성은 **확인 필요**(각 페이지 console 사용 점검). Supabase 측 쿼리 로그는 Supabase 운영 콘솔 관할.

## 8. 종합 개선 우선순위

1. **S1**(정산 뷰 security_invoker) 라이브 적용 확인 — 최우선.
2. **S2**(마이그레이션 전수 적용) `00_VERIFY.sql`로 라이브 DB 확인.
3. **S5**(PII 영역 최소 부여) 운영 정책.
4. S3/S4 — RLS 완전성 유지가 전제(설계상 수용).
