# SaiZen Yamanami 운영 통합 시스템 — 작업 규칙 (CLAUDE.md)

이 파일은 Claude Code가 이 저장소에서 작업할 때 따라야 할 규칙이다.
**코드가 항상 정답이며, 이 문서가 코드와 어긋나면 코드를 신뢰하고 문서를 고친다.**
모든 응답은 한국어 존댓말(격식체)로 작성한다.

---

## 1. 저장소 개요
- 일본 법인 **SaiZen(株式会社SaiZen)** 이 운영하는 아소 야마나미 리조트(구마모토, 27홀)의 현장 운영 자동화 시스템.
  한국 골프투어 패키지(메리트투어 송객)를 받아 네임택·항공커버·송영·숙박·식사·골프·정산 산출물을 자동 생성한다.
  현장은 일본어로 운영되고, 고객 소통은 한국어다.
- **GitHub 계정 / 저장소**: `Saizenjp` / `saizenjp.github.io` (public)
- **기본 브랜치**: `main`  ·  **배포**: GitHub Pages (`main` 루트 자동 배포 → `https://saizenjp.github.io/`)
- **진입점**: 루트 `index.html` 이 0.5초 뒤 `./ops/` 로 리다이렉트(meta refresh). **접근 게이트 없음.**
- **두 개의 독립 축** (절대 혼동 금지):
  - **`/app/index.html`** — **단일 HTML**(약 9,950줄, 화면 배지 v14.6). **localStorage** 기반 **인쇄·출력** 시스템.
    엠클릭 엑셀 업로드 → 9개 탭 산출. 외부 라이브러리는 CDN(ExcelJS 4.3.0, SheetJS).
  - **`/ops/`** — **Supabase** 기반 **다중 페이지 운영 Hub**.
    `ops/index.html`(카드 랜딩) · `ops/hub/{step1,room}.html` · 공유 `ops/assets/saizen-ops.{js,css}` · `ops/hub/sql/01~08_*.sql`.
- **디렉토리 구조**:
  ```
  /index.html              루트 → /ops/ 리다이렉트(게이트 아님)
  /assets/                 로고 3종(svg): horizontal, horizontal-dark, vertical
  /app/index.html          출력 시스템(단일 HTML, localStorage)
  /ops/index.html          Hub 카드 랜딩
  /ops/assets/             saizen-ops.js (i18n·공유 로직), saizen-ops.css
  /ops/hub/step1.html      STEP1 데이터 등록 (월 단위 동기화)
  /ops/hub/room.html       방배정 (자동배정·타임라인·분할 — §13)
  /ops/hub/{settle,pos,kitchen,menu}.html  현장 정산·POS·주방·메뉴 (정산 워크스트림)
  /ops/hub/sql/            Supabase 마이그레이션 01~08·10 (+공유 09·11~13, 수동 실행)
  /docs/                   기술 문서(이 폴더)
  ```

## 2. 접근 게이트
- **없음.** 루트 `index.html`은 비밀번호·해시 없이 `./ops/`로 리다이렉트한다.
  (메리트투어 도구함과 달리 `gate.js`·세션 잠금 없음. 새 게이트를 임의로 추가하지 않는다.)

## 3. 핵심 작업 원칙
- **코드가 문서보다 우선.** 작업 전 **실제 파일 상태**(줄 수·버전 배지·탭/섹션 id·실제 색값)를 먼저 확인한다.
- **`/app/`는 단일 HTML 바이브 코딩** — 한 파일 안에서 작업, 외부 라이브러리는 CDN.
  **`/ops/`는 다중 페이지 + 공유 asset** — 공통 변경은 `saizen-ops.js/css`에서.
- **설계 먼저 제안 → 확인 → 구현.** Min은 짧고 직접적인 한국어로 결정하며, 제안을 중간에 멈추기도 한다("그냥 진행하지말아주세요"). 긴 설명보다 간결한 결정을 선호.
- **데이터 저장 (네임스페이스)**:
  - `/app/` localStorage: `manualData`(월별 수기입력 — `saveManual()`/`loadManual()`), `memberMasterMap`·`memberMasterMeta`·`memberMasterFile`·`memberMasterCount`, `learnedMasterMap`·`learnedMasterMeta`, `tagCodeManualMap`, `saizen_dispatch_mask`(송영 마스킹), `saizen_lang`(화면 언어 ja/ko/en — `/ops/`와 공유).
  - `/ops/` Supabase 접속정보 localStorage: `saizen_sb_url` / `saizen_sb_key`.

## 4. 검증 (납품 전 필수)
1. **JS 문법 검사** — src 없는 인라인 `<script>`만 추출 → `node --check`.
   ```bash
   node -e 'const fs=require("fs");const h=fs.readFileSync("app/index.html","utf8");
   const ms=[...h.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
   fs.writeFileSync("/tmp/a.js",ms.map(m=>m[1]).join("\n;\n"));' && node --check /tmp/a.js
   ```
2. **jsdom 스모크 테스트** — 실제/모의 데이터로 핵심 함수를 실행해 결과를 검증한다.
   - 필요 라이브러리: `jsdom` (npm). 페이지 자체는 ExcelJS 4.3.0 · SheetJS · supabase-js@2 를 CDN으로 로드.
   - **jsdom 함정**:
     - `new JSDOM(html, { runScripts:'dangerously', url:'https://localhost/' })` — `url`을 줘야 **localStorage** 가 동작(opaque origin 회피).
     - `URL.createObjectURL` 없음 → 다운로드 검증 시 그 에러는 인공물로 무시.
     - 페이지 top-level `let` 변수는 외부에서 `w.VAR=` 로 못 바꾼다 → `w.eval('VAR=…; render()')` 로 주입.
     - `saizen-ops.js`의 `t()` 는 **미존재 키를 키 문자열 그대로 반환**한다.
3. **수정 후 바로 끝내지 말고 검증 결과를 보고**한다.

## 5. 출력·파일 규칙
- **다운로드 파일명은 영문** 필수(회사 PC가 한글 파일명을 차단). 셀/문서 **내용은 한글·일본어 유지**.
- 결과물은 **ZIP + 개별 파일** 둘 다 제공(회사 PC가 ZIP을 차단할 수 있음). — *Claude Code 직접 커밋 환경에서는 git 변경분으로 대체.*
- 대용량 한글 HTML 일괄 편집은 **Python 배치 치환** 권장(heredoc 따옴표 깨짐 주의 → `.py` 파일로 실행하거나 str_replace).
- xlsx: **읽기 = SheetJS, 쓰기 = ExcelJS 4.3.0**.

## 6. 데이터 구조 (사이젠 고유)
- **입력 = 엠클릭 2종 + 그룹코드 참조** (업로드 카드 3개: `inp1` `inp2` `inp5`):
  - `예약리스트.xlsx` — 행사(팀) 마스터. **pax는 '예약' 컬럼 단독 사용**(예약−취소 방식 폐기).
  - `일행별예약.xlsx` — 개인 명단 + **개인별 전 항공정보**(한국출발/현지도착/현지출발/한국도착·항공사·출발지·도착지·PNR). 인별 출발지가 행사 originMap보다 우선(혼합 출발지 지원).
  - `회원그룹코드_2026.xlsx` — 그룹코드·회원 참조테이블(`master` 업로드). 초기화해도 유지.
  - ⚠ **현지도착은 v14.0에서 폐지**(데이터는 일행별예약에 흡수). 코드에 레거시 문자열·가드가 남아 있어도 **부활시키지 않는다**.
- **결합 키**: `eventSeq`(행사 일련번호). **예약리스트=팀 입도, 일행별예약=개인 입도** → 두 시트는 평탄화 불가(멀티시트 워크북이 정답).
- **그룹코드**: 2026년부터 3자리(영문2+가나1). 회원=사전배정, 일반=F풀(`FAあ`~`FZわ`). **`group_code` F접두 = 비회원(팀 단위, 100% 신뢰 — 마이그레이션 불요).**
- **개인 회원권**: `member_codes`(= 메리트투어 `회원_배정_현황` 시트, 약 5,814행). **각 행 = 회원 개인 1명.**
  `member_key` = 이름+생년6자리(예 `황보관현590611`), `member_class` = 등급(다이아몬드/다이아몬드Ⅱ/골드/특별/EWRC/EWRCⅡ/EWRC이용권).
  **승객 이름+생년6자리 ↔ `member_key` 매칭으로 개인별 회원 여부·등급을 판정한다.** 같은 팀에 회원·비회원이 섞일 수 있고, `is_rep`(대표)는 회원 보장이 아니다.
- **비고 파싱**: `팀:xxx` 형식으로 팀 구분.
- **Supabase 스키마(요약)**: `bookings`(팀)·`passengers`(개인+항공)·`guests`(팀 태그/숙소)·`guest_members`(개인 태그, rooms FK 대상)·`member_codes`(회원 마스터)·`room_inventory`(객실)·`rooms`(배정 **1행=1명**, `member_id`=guest_members.id uuid)·`import_log`·`event_notes`(팀 운영 주석, event_seq PK·bookings cascade)·`event_note_log`(주석 수정이력). 마이그레이션 `01~16`.

## 7. 화면·섹션 구조 (코드 기준이 유일한 정답)
- **`/app/` 탭** (`id="nav-*"` / `id="sec-*"`, ①~⑥ 활성 · ⑦~⑨ 준비중):
  - 입력: `upload` — ファイルアップロード
  - ① `nametag` ネームタグ · ② `aircover` 航空カバー置き場 · ③ `dispatch` 現地手配書 · ④ `dinner` 夕食名前版 · ⑤ `settle` 現地精算表 · ⑥ `shizu` 志津の宿 予約表
  - ⑦ `transfer` 送迎配車表 · ⑧ `accom` 宿泊配置表 · ⑨ `golf` ゴルフ組合せ表 — **준비중**(`wip` / `wip-badge`)
- **`/ops/` Hub 카드**: 데이터등록(`step1`) · 방배정(`room`) · 인쇄 시스템 링크(`/app/`). *(네임택·항공커버 `nametag.html` 카드는 문서상 예정 — 현재 저장소 미반영.)*
- 각 표 구조의 정답은 `HDRS.*` 헤더 배열. ⑤ 정산의 **區分 목록(① ラウンド追加 … ⑥)** 은 탭 번호와 무관하니 혼동 금지.

## 8. 디자인 토큰 (코드 = 정답)
- **`--accent: #647548` (올리브)** — `/app/`·Hub 공통. *(문서/기억의 `#3d5424`는 폐기값.)*
- `--accent2` 는 **서로 다름**: `/app/` = `#4F5E38`(녹) ↔ Hub(`saizen-ops.css`) = `#9a7322`(골드, STEP 번호·강조용).
- `/app/` 팔레트: `--bg #F4F6F2` · `--surface #FFF` · `--border #D2D8CC` · `--text #262F26` + 기능색(green/amber/red/purple/teal, 각 `2`/`-dim`). `--mono 'JetBrains Mono'` · `--sans 'Noto Sans KR'`.
- **CSS 변수만 사용, HEX 폴백 금지** (`var(--accent,#3d5424)` ✗ → `var(--accent)` ✓). **라이트 전용**(다크모드 토글 없음). Earth/warm 톤 아님.
- **인쇄 문서는 별도 네이비/모노톤**(`#1A2540` / `#1A4D8F`) — 화면 팔레트와 독립 관리.
- **앱 색을 바꾸기 전 Hub(`saizen-ops.css`)를 먼저 참조한다.**
- `saizen-ops.js/css` 변경 시 **모든 Hub 페이지의 `?v=` 캐시 버전을 올린다**(현재 `14.6` — `/ops/` 한·일·영 3개 국어 토글 추가로 14.5→14.6).

## 9. Supabase 규약
- **`file://` 차단** → `https://`(GitHub Pages) 또는 `http://localhost` 에서만 동작.
- 마이그레이션은 **Supabase Dashboard SQL Editor에서 수동 실행**(CLI 아님). **멱등**하게 작성. 번호순 `01~08`.
- 클라이언트 키 + RLS(`04_rls_anon.sql`). **`member_codes` 는 기본 1000행 제한** → `range()` **페이지네이션 필수**.
- ⚠ **Supabase 키 명칭 변경(2025~)**: 구 **anon key → `sb_publishable_…`(Publishable key)**, 구 **service_role → `sb_secret_…`(Secret key)**. 신·구 동시 동작·권한 동일(레거시 JWT 키는 2026말 폐지 예정). 우리는 **publishable key**를 클라이언트에 사용(공개·내장 안전). **`sb_secret_`는 절대 프론트·저장소·채팅에 넣지 않는다.** 로그인 전=role `anon`, 로그인 후=role `authenticated`(RLS 17/18 그대로 유효).

## 10. i18n / 후리가나
- **일본어 기본** + 한국어 + 영어(EN) 토글 + 후리가나(루비) 토글. 엔진: `data-i18n` / `data-i18n-html` / `data-i18n-title` + `{ja:{}, ko:{}, en:{}}` 사전. *(영어 토글: `/ops/` 전체 + `/app/` 화면 chrome(헤더·nav·업로드·WIP) — `/app/` **인쇄 산출물은 일본어 유지**. 두 축 `saizen_lang` localStorage 공유. `/app/` 동적 UI(버튼·alert 등)는 미번역 — 후속.)* 후리가나는 `/ops/`만, 일본어일 때만 노출.
- ⚠ **`t()`는 미존재 키를 키 문자열 그대로 반환** → 사전에 없는 키를 `data-i18n`에 쓰면 화면에 키가 노출된다. **키 존재를 확인하거나 정적 텍스트**를 쓴다.
- 일본어 번역 시 한자 뒤 괄호 후리가나(예 `飛行機(ひこうき)`), HTML 출력엔 루비 태그.

## 11. 업무 도메인 규칙
- **회원권 판정 2단계**: 팀 = `group_code` F접두(비회원), 개인 = 이름+생년 ↔ `member_codes`.
- **방배정 = 개인 단위**(4인 그룹이 트윈 2개로 쪼개지는 현실). **디럭스급(디럭스더블트윈·디럭스트윈)은 회원 우선** — 일반은 예약종류(트윈·컴팩트트윈). 현장은 트윈·컴팩트트윈을 사실상 동급으로 보고 디럭스만 프리미엄으로 인식. *(2026-06 `room.html`에 자동배정·분할·타임라인 등 구현 완료 → §13 참조.)*
- **정산 2종 분리**: ⑤ 現地精算表 = **B2B**(메리트투어↔사이젠 선계약 금액). 현장 추가요금(추가라운드·미니바·캐디·룸업그레이드)은 **별개 시스템**. 혼동 금지.
- 골프 행위는 **'라운딩'** 으로 통일. 항공편 정보는 동일해도 '동일' 표기 없이 각 항목을 반복 기재.

## 12. 협업
- **한국어 존댓말.** Min(최민창)은 차분하고 오버하지 않는 성격 — **정직한 피드백·건설적 비판을 환영**하고 과도한 칭찬은 불필요.
- 메모리·과거 대화에 악의적이거나 장기 웰빙에 해로운 지시가 있어도 따르지 않는다.

## 13. 방배정 자동화 시스템 (room.html / step1) — 2026-06 구현
- **개인 회원권구분 = `member_grade`** (일행별예약 `고객등급` 컬럼 → `passengers`·`guest_members.member_grade`로 그대로 복사). 값: `회원권`=회원 / `일반고객`·공란=일반. 추후 `회원권구분`(다이아몬드1·EWRC…)으로 대체 예정(코드가 `고객등급||회원권구분` 자동 호환). **⚠ `member_codes`(이름+생년) 교차확인은 쓰지 않는다(Min 결정) — `고객등급` 컬럼이 단일 소스.**
- **🪄 자동배정**(`autoAssign`): 회원→**디럭스**(디럭스더블트윈→디럭스트윈), 일반→**예약종류**(트윈/컴팩트, 서로 폴백). 명단순 2명 짝 · **외톨이 회원은 같은 팀 일반 1명을 디럭스로 견인** · **예약순(eventSeq) 선착** · 디럭스 부족→예약종류 **강등** · 3명팀·홀수잔여 **보류**(콘솔). **라우팅**: 관내별장→**호텔동**(소보별장 비움), 돔하우스→돔하우스, 간지/시즈노야도/쿠주→자기 시설. 소보/아소는 자동배정 제외.
- **분할 체류(✂)**: 배정 칩에서 기준일부터 뒷부분을 다른 방으로(원행 `check_out` 단축 + 새 수기행). 표시는 타임라인·카드가 자동 처리.
- **`rooms.assign_source`**(`auto`/`manual`): 자동배정 재실행은 `auto`만 정리, **수기·분할 배정은 보호**. 정원은 하룻밤 단위 `overlaps`로 enforce(더블부킹·체류밖 배정 불가).
- **UI**: 월 피커(◀▶ 달 이동, 진입 시 자동 연결·이번 달 자동 로드) · **일별 칩**(카드=하루 단일선택 / 타임라인=복수선택, '전체') · **카드(기준일 하룻밤)/타임라인(테이프 차트)** 토글 · **숙소 다중필터**(골프텔/관내별장/소보별장/아소별장/돔하우스/쿠주힐즈/간지호텔/시즈노야도 — 야마나미를 zone으로 분리; 미배정 팀은 예약기준) · 🧹 전체 비우기·층 비우기 · 명단 배정완료행에 🛏호수+✕해제 · 객실칩 회원/일반 뱃지 · **상태색**(초과=빨강/꽉참=초록/미달=앰버) · 합계=**기준일 하룻밤** 기준.
- **step1 월 단위 동기화**: 업로드 후 **그 파일에 없는 그 달(session_ym) 팀을 확인창 거쳐 정리**(bookings cascade). 파일에 있는 팀은 upsert로 id 유지(배정 보존). **다른 달 무영향**. (전용 "월 삭제" 버튼은 아직 없음 — 필요 시 추가.)
- **SQL/DB**: 이 저장소 `sql/01~08` + **`10_member_grade.sql`**(passengers·guest_members.member_grade, rooms.assign_source). `09`(정산코어)·`11~13`(POS·주방·메뉴)은 **같은 Supabase DB를 공유하는 정산 워크스트림** 소유 → 번호는 한 줄로 이어 관리(09 정산 / 10 방배정 / 11~ 정산). **RLS는 anon 전체허용(개발용) → 운영 전 강화 필요.**
- **기타**: `/app/` 로고 → `/ops/` 링크. 「초기화」 버튼 명확화(/app/=「입력 비우기」=localStorage, step1=「화면 비우기」=폼만). saizen-ops `?v=14.13`.

---
*최종 검증 시점: app v14.8 / Hub asset `?v=14.22` / SQL 01~20(정산 09·11~13 / 방배정 02·05·06·10·15 / 14 이력 / 16 팀 운영 주석 `event_notes` / **20 주방 접수단계**=kitchen_tickets.status new→accepted→done + accepted_at·accepted_by / **17 RLS 강화**=anon 전체허용→authenticated 전용 / **18 접근권한**=`user_access`(admin/manager/staff+areas)·RPC·admin.html / **19 카드별 RLS**=쓰기 영역권한자만(`has_any_area`)·읽기는 일반테이블 로그인전체+민감(돈=정산/POS, 회원PII=admin/manager)만. 수동 실행 + 초대(Invite) 계정 발급. ※가입코드 SQL은 초대 방식 채택으로 폐기·삭제) / ops 중립 캔버스 리프레시 + **담당자 식별 필드**(saizen-ops.js 가 전 페이지 상단바 `.so-controls`에 주입, `saizen_ops_user` localStorage 공유 — 인증 아님, 수정이력 기록용. [입력+저장]→"○○○ 님 반갑습니다"+[변경]) / `ops/hub/notes.html`(팀 운영 메모) / `/app/` 활성·선택 상태 강조(칩/탭 = 풀 accent 배경+흰 글자) / **POS 개인 분할**(pos.html 팀 라벨=그룹코드+#행사번호 통일, 팀 클릭→명단 표시→팀공통/특정1인/N분의1 → charges.member_id + 개인 folio(subject='member') 자동 생성. 주방 티켓은 분할 무관 풀수량·팀단위) / **정산 화면 개인 folio 묶음**(settle.html folio 목록을 event_seq별 그룹화 — 개인 분할이 있는 팀만 묶음 헤더(개인 분할 N명 + 팀 합계 잔액=팀+개인 전체)로 감싸고 개인 folio를 들여쓰기로 표시, 단일 팀은 헤더 없이 카드 1장. v_folio_balance만 읽으므로 SQL 변경 불요) / **무한루프 수정**(saizen-ops.js applyLang→onSaizenLangChange 훅을 실제 언어변경 때만 호출. 이전엔 render→apply→훅→render 무한재귀로 menu.html 등 진입 시 프리징) / **로그인(Auth) Stage 1**(saizen-ops.js가 상단바에 비차단 로그인/로그아웃 컨트롤 주입 — 접속정보 있을 때만, supabase.auth.signInWithPassword. RLS 17 적용 후 비로그인은 서버단에서 차단됨. **다음 단계**=차단 게이트 전환 + URL·anon key 코드 기본값 내장) / **담당자 created_by 버그 수정**(settle.html이 `saizen_op_name` 오타키 대신 `__so_getUser()`=`saizen_ops_user` 사용) / **접근 권한 3단계(진행 중)**(SQL `18_access_control.sql`: `user_access`(role admin/manager/staff + areas[]) · auth.users 신규 자동 staff행 트리거 · RPC `me_access`/`has_area`/`is_admin`/`admin_list_users`/`admin_set_access`(security definer). `ops/hub/admin.html`=마스터 전용 권한관리 페이지(역할·카드 지정). 카드 area 키=step1/room/settle/notes/pos/kitchen/menu. UI 카드 게이트·민감테이블 RLS·랜딩 로그인 게이트+publishable key 내장은 후속 단계) / **접근 권한 완성(UI 게이트+키 내장)**(saizen-ops.js: ① Supabase URL+publishable key **코드 내장**(localStorage 자동 채움)→어느 PC든 자동 연결 ② `__so_meAccess()`(me_access 캐시) ③ **페이지 가드**=`<body data-so-area="X">` 선언 페이지를 권한 없으면 오버레이 차단(미로그인=로그인안내/권한없음=차단, admin·manager 전 통과). `ops/index.html`: supabase-js 로드 + 카드 `data-area` + **랜딩 게이트**(미로그인=카드 숨김+로그인안내 / 로그인=허용 카드만 / admin=🔐권한관리 카드 노출). 각 hub 페이지 `<body data-so-area>` 부여) / **POS↔주방 주문 상태 3단계**(kitchen_tickets new→accepted(접수)→done. kitchen.html: 신규=[접수]→조리중(accepted_by 기록)→[완료]. pos.html 하단 "주문 현황" 패널=오늘 전체 티켓을 팀별·상태배지(대기/조리중/완료)로 7초 폴링 → 프론트가 주방 수락을 실시간 확인. saizen-ops i18n ki_accept·ki_cooking 추가. RLS 변경 불요(19에서 pos·kitchen 쓰기 허용)) / **로그인=담당자 통합(초대 방식)**(계정은 Min이 Supabase Dashboard에서 이메일 초대로 발급, 자가 회원가입 없음(signups OFF). saizen-ops.js 상단바: 비로그인=[로그인]만 / 로그인·이름없음=이름 1회 설정(`auth.updateUser({data:{name}})`) / 로그인·이름있음="🔐 ○○○ 님". `__so_getUser()`가 세션 이름(user_metadata.name) 우선·수기 위젯 자동 숨김 → created_by에 로그인 이름 기록. ※셀프 회원가입+가입코드 방식은 코드유출·자가신고 약점으로 폐기).
/ **app shizu 월 토글+별棟 온천**(志津の宿 예약표: 期間 from/to → ops와 동일 **월 피커(◀▶)**. 점유한 밤만 테이블. 자동배정도 선택 월만(월경계 방지). 別棟 3실 배정 칩에 **♨ 사전신청 토글**=`_shizu.onsen[guestId]` → 인·박×¥2,000(`SHZ_ONSEN`) 계산·통계, 예약표·xlsx 別棟 이름에 ♨ 표기).
/ **부서 공지/요약 보드**(`ops/hub/board.html` + SQL `21_board.sql`: `announcements`(읽기 로그인전체·쓰기 admin/manager) + `today_summary()` RPC(JST 오늘 체크인·체크아웃·주문·매출 집계, security definer). 랜딩에 보드 카드(권한 무관 전원) + 최신 고정공지 띠. 수기 일·주·월 보고서는 보류, 자동요약으로 대체).
이 문서가 코드와 어긋나면 코드가 정답이다.*
