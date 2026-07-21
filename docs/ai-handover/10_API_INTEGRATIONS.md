# 10. API 연동 (API INTEGRATIONS)

> **저장소명**: `saizenjp/saizenjp.github.io`
> **브랜치**: `main`
> **기준 커밋**: `8cd0ad8` (`8cd0ad8f8f68db0a2c9679e2c6452c769846b000`)
> **작성일**: 2026-07-21
> **문서 상태**: 기술기준 (코드 근거)
> **분석 범위**: 외부/내부 API 연동
> **제외 범위**: 실제 키·토큰·비밀값(미출력)

---

## 1. 개요

- **REST API 서버 자체 구현 없음.** 모든 데이터 접근은 **Supabase REST/RPC**를 `supabase-js@2` 클라이언트로 호출. 인증은 Supabase Auth. 그 외 외부 API 호출은 CDN 자산 로드와 Edge Function이 전부.

## 2. 연동 표

| 연동명 | 호출 주체 | 대상 시스템 | 목적 | 요청 방식 | 인증 방식 | 주요 입력 | 주요 출력 | 관련 파일 | 실패 처리 |
|---|---|---|---|---|---|---|---|---|---|
| **Supabase Table API** | ops 페이지 JS | Supabase PostgREST | 테이블 CRUD(`select`/`insert`/`upsert`/`update`) | `supabase-js` (내부 HTTPS) | publishable key + 로그인 세션(RLS) | 행/필터 | 행 배열 | `ops/hub/*.html`, `ops/assets/saizen-ops.js` | `{data,error}` 반환 → 토스트/차단 |
| **Supabase Auth** | `saizen-ops.js` | Supabase Auth | 로그인·세션·비번설정 | `auth.signInWithPassword` / `getSession` / `updateUser` | email+password / 초대·recovery 토큰 | 이메일·비번·토큰 | 세션 | `ops/assets/saizen-ops.js:1240-1294,1527-1561` | 오류 메시지·재초대 카드 |
| **Supabase RPC** | ops 페이지 JS | Supabase 함수 | 권한·집계·최소권한 쓰기 | `rpc('함수명', 인자)` | 로그인 세션 + 함수 내 게이트 | 인자 | 결과 | 각 페이지 · `sql/18·21·22·53·55·73·81·82 …` | `error` 처리 |
| **guest_bill(손님)** | `bill.html` | Supabase RPC | 손님 QR 청구조회 | `rpc('guest_bill', {token})` | **anon + token(비밀)** | 주문 토큰 | 청구내역 | `bill.html:141`, `sql/73` | 무효 토큰 안내 |
| **Edge Function translate-remarks** | (RPC/서버) | Supabase Edge Function | 비고(remark) 번역 캐시(추정) | HTTP(추정) | **확인 필요** | 비고 텍스트 | 번역문(remark_ja/remark_local_ja) | `ops/edge-functions/translate-remarks/index.ts`, `sql/64` | **확인 필요** |
| **CDN 라이브러리** | 전 페이지 | jsDelivr / cdnjs | 라이브러리 로드 | `<script>`/`<link>` | 없음(공개) | — | JS/CSS | `app/index.html`, `ops/**` | 로드 실패 시 기능 저하 |

## 3. Supabase 클라이언트 접속

- `supabase.createClient(url, key)` — url·**publishable key**는 `ops/assets/saizen-ops.js:16-19` 내장(`SB_URL_DEFAULT`/`SB_KEY_DEFAULT`, 접두 `sb_publishable_`). localStorage `saizen_sb_url`/`saizen_sb_key`로 덮어쓰기 가능.
- ⚠ publishable/anon 키는 공개 전제(RLS가 실제 방어). **`sb_secret_`/service_role 키는 저장소에 없음**(`docs/pre-deploy-audit.md`). 상세 `13_SECURITY_AND_RISKS`.

## 4. 외부 라이브러리(CDN) 목록

| 라이브러리 | 용도 | 근거 |
|---|---|---|
| `@supabase/supabase-js@2` | Supabase 클라이언트 | app/·ops/ |
| `xlsx@0.18.5` (SheetJS) | Excel **읽기** | `step1.html`·`groupcodes.html`·dinner 등 |
| `exceljs 4.3.0` | Excel **쓰기** | `settle_merit.html`·`dinner.html`·`/app/` |
| `html5-qrcode@2.3.8` | QR 스캔 | `pos.html`·`keytag.html` |
| `pretendard@1.3.9` | 폰트 | 다수 |
| (로컬) `ops/assets/qrcode-generator.js` | QR 생성 | `qrcards.html` 등 |

## 5. 실패·재처리 공통 패턴

- Supabase 호출은 `{data, error}` 구조 → `error` 시 토스트·차단 오버레이·재시도 버튼. 페이지가드는 권한 오류를 오버레이로 표시.
- 네트워크·CDN 실패는 해당 기능 저하(정적 페이지 자체는 로드). 전역 에러 수집(모니터링) 없음(`14_KNOWN_ISSUES`).

## 6. 확인 필요

- `translate-remarks` Edge Function의 실제 배포·호출 경로·외부 번역 API(DeepL 등) 사용 여부 및 그 키 관리(파일 내용 미확인 → **확인 필요**).
- 손님용 `pos_customer.html`의 인증(스테이션/자체 로그인) 상세.
