---
name: SaiZen Yamanami — Ops Hub Design System
source: code (ops/assets/saizen-ops.css + per-page inline chrome) — code is the single source of truth
mode: light-only (no dark mode — intentional)
languages: [ja, ko, en] + furigana(ruby) toggle (ja only)
colors:
  # Brand / accent
  accent:      "#647548"   # 올리브그린 — 主アクセント(액티브·포커스·1차 버튼)
  accentDeep:  "#4F5E38"   # 올리브 hover(눌림)
  accentSoft:  "#EDF0E2"   # 올리브 연한 틴트(포커스 링·hover 배경·active 칩)
  accent2:     "#9a7322"   # 골드 — STEP 번호·보조 강조(라벨·칩·뱃지)
  # Surface / neutral (중립 회색 캔버스)
  bg:          "#f4f5f7"
  surface:     "#ffffff"
  surface2:    "#f6f7f9"
  surface3:    "#eceef1"
  border:      "#e3e6ea"
  border2:     "#cdd2d8"
  # Text
  text:        "#1f2937"
  text2:       "#525b66"
  muted:       "#8b919b"
  # Semantic
  ok:          "#2f7d4f"
  warn:        "#9a7322"
  err:         "#b13b2c"
  # Print-only (화면 팔레트와 독립 — 잉크용 네이비/모노톤)
  printNavy:   "#1A2540"
  printBlue:   "#1A4D8F"
typography:
  sans:  "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif"
  mono:  "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"
  styles:
    page-h1:    { size: 17px, weight: 800, color: accent,  use: "상단바 제품명" }
    panel-h3:   { size: 14px, weight: 800, color: accent,  use: "패널 제목" }
    card-h4:    { size: 14.5px, weight: 700, color: text,   use: "카드 제목" }
    kpi-value:  { size: 23px, weight: 800, color: accent, font: mono, use: "KPI 수치" }
    body:       { size: 13px,  weight: 400, color: text }
    label:      { size: 12px,  weight: 600-700, color: text2 }
    hint:       { size: 11px,  weight: 400, color: muted }
    badge:      { size: 10.5px, weight: 700-800 }
radius:
  pill:   "99px"   # 토글·칩·pill 뱃지
  sm:     "6px"    # .btn .inp
  md:     "7-8px"  # .btn.big / .panel .card .toast
  lg:     "11px"   # .page-help .so-audit
spacing:
  topbar:    "13px 22px"
  bar:       "8-10px 20px"   # .conn .datebar .accombar
  main:      "16px 20px"
  gap:       [6px, 8px, 10px, 12px, 14px, 16px]
  container: "max-width 1120-1280px, margin auto"
components: [topbar/so-bar, navhome, pill, btn(+ghost/sm/connected), inp, chip, kpi, panel, card, toast, so-lang, so-furi, page-help, so-audit]
---

# SaiZen Yamanami — Ops Hub Design System

> **코드가 정답.** 이 문서는 `ops/assets/saizen-ops.css`와 각 페이지 인라인 chrome에서
> 추출한 **현행 디자인 시스템의 정본**입니다. 코드와 어긋나면 코드를 신뢰하고 이 문서를 고칩니다.
> 새 ops 페이지는 `docs/ops-page-skeleton.html`을 복사해 시작하고, 색·타이포·간격은 이 문서를 따릅니다.

## Overview
아소 야마나미 리조트 **현장 운영 통합 시스템(내부 도구)**의 디자인 언어입니다. 성격은 화려한
마케팅 사이트가 아니라 **차분한 "내부 운영 콘솔"** — 평평(flat)하고 헤어라인 위주이며, 정보 밀도가
높습니다. 단일 크로마틱 액센트는 **올리브그린 `#647548`** (액티브·포커스·1차 버튼)이고, **골드
`#9a7322`** 가 STEP 번호·보조 강조를 담당합니다. 캔버스는 중립 회색(`#f4f5f7`)이며 **라이트 전용**
(다크모드 없음 — 의도된 것).

핵심 메커니즘: 각 페이지가 자체 인라인 `:root`(올리브 틴트)를 갖지만, `saizen-ops.css`가 **인라인
`<style>` 뒤에 로드**되어 토큰을 덮어써 **전 페이지 색을 통일**합니다. 색을 바꿀 땐 항상 먼저
`saizen-ops.css`를 봅니다.

## Colors
모두 **CSS 변수로만** 사용합니다 — `var(--accent)` ✓ / `var(--accent,#647548)` 같은 **HEX 폴백 금지** ✗.

### Brand & Accent
- **accent** `#647548` — 올리브그린. 액티브 칩·탭, 포커스 링, 1차 버튼 배경, 링크, 패널/카드 제목.
- **accentDeep** `#4F5E38` — 1차 버튼 hover(눌림).
- **accentSoft** `#EDF0E2` — 포커스 링(box-shadow), ghost hover 배경, 비활성 hover.
- **accent2** `#9a7322` — 골드. STEP 번호·보조 라벨·칩·강조 뱃지 전용(올리브와 역할 분리).

### Surface (중립 회색 캔버스)
- **bg** `#f4f5f7` 페이지 배경 · **surface** `#ffffff` 카드/패널 · **surface2** `#f6f7f9` 보조면(바·메모) · **surface3** `#eceef1` 헤더 셀·코드칩 배경.
- **border** `#e3e6ea` 기본 선 · **border2** `#cdd2d8` 입력·강한 선.

### Text
- **text** `#1f2937` 본문 · **text2** `#525b66` 보조·라벨 · **muted** `#8b919b` 힌트·비활성.

### Semantic
- **ok** `#2f7d4f`(연결됨·충분·INSERT) · **warn** `#9a7322`(경고·UPDATE) · **err** `#b13b2c`(실패·부족·미수·DELETE).

### Print (화면과 독립)
인쇄 산출물은 별도 네이비/모노톤 — **printNavy** `#1A2540`, **printBlue** `#1A4D8F`. 화면 팔레트로
인쇄물을 칠하지 않습니다.

> ⚠ **축**: Ops Hub는 위 토큰을 쓰지만 `/app/`(단일 HTML 인쇄 시스템)는 `accent2`가 다릅니다
> (`/app/` = `#4F5E38` 녹 / Hub = `#9a7322` 골드). 이 문서는 **Ops Hub** 기준입니다.

## Typography
- **Sans**: `Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui` — 한·일·영 혼용에 안정적.
- **Mono**: `SFMono-Regular, Consolas, 'Liberation Mono', Menlo` — 수치(KPI·잔액·방번호)·태그코드·코드칩.

| 스타일 | 크기 | 굵기 | 색 | 용도 |
|---|---|---|---|---|
| page-h1 | 17px | 800 | accent | 상단바 제품명 |
| panel-h3 | 14px | 800 | accent | 패널 제목 |
| card-h4 | 14.5px | 700 | text | 카드 제목 |
| kpi-value | 23px | 800 mono | accent | KPI 수치(미수=err) |
| body | 13px | 400 | text | 본문 |
| label | 12px | 600–700 | text2 | 폼 라벨 |
| hint | 11px | 400 | muted | 도움말 |
| badge | 10.5px | 700–800 | (배경색별) | STEP·상태 뱃지 |

**원칙**: 숫자·식별자는 mono. 강조는 굵기(700–800)로, 색은 accent/accent2만. 본문에 색을 남발하지 않음.

## Layout & Spacing
- **컨테이너**: `max-width 1120–1280px`, `margin:0 auto`, 좌우 패딩 20–24px.
- **세로 리듬**: 상단바 `13/22`, 바(conn·datebar·accombar) `8–10/20`, 본문 `16/20`, 카드 내부 `13–16`.
- **간격 토큰**: 6·8·10·12·14·16px(주로 8·10·12).
- **스티키**: 상단바 `position:sticky; top:0`. 상세/정산 패널은 데스크톱에서 `sticky`(목록 스크롤해도 따라옴), 모바일에선 `static`.
- **그리드**: KPI는 5열(≤760px 2열), 본문 stage는 `1fr 340px`(≤900px 1열).

## Elevation & Depth
**평평함이 기본** — "내부 운영 콘솔" 느낌. `saizen-ops.css`가 `.panel`·`.card`의 `box-shadow`를 제거(`none`)합니다.
- 0 — 면(card/panel): 그림자 없음, 1px border로 분리.
- 떠 있는 것만 그림자: **toast** `0 6px 18px rgba(20,24,28,.14)`, 모달 오버레이, 맨위로 버튼.
- **상단바**: 두꺼운 액센트 보더가 아니라 **헤어라인 border + 얇은 올리브 인셋**(`box-shadow:inset 0 -2px 0 var(--accent)`) — 제품 크롬.

## Shapes (Radius)
| 토큰 | 값 | 용도 |
|---|---|---|
| pill | 99px | 토글 버튼군·칩·상태 pill·뱃지 |
| sm | 6px | `.btn` `.inp` |
| md | 7–8px | `.btn.big`(7) · `.panel` `.card` `.toast`(8) |
| lg | 11px | `.page-help` · `.so-audit` |

`saizen-ops.css`가 페이지 인라인의 라운드(7~12px 드리프트)를 위 값으로 정리합니다.

## Components
- **topbar / .so-bar** — 로고(홈링크) + 부제 + spacer + `.so-controls`(언어 토글·후리가나) + 상태 pill. 헤어라인+올리브 인셋.
- **.navhome** — ghost 링크 버튼(올리브 보더, hover=accentSoft). "← 현장 운영".
- **.pill** — 상태칩(99px). `.ok`(올리브틴트/녹) · `.err`(연한 적). 연결 상태 표시.
- **.btn** — 1차=올리브 채움/흰 글자(hover=accentDeep). `.ghost`=투명/올리브 글자(hover=accentSoft). `.sm`·`.xs` 크기. `.connected`=ok(녹) 채움. radius 6.
- **.inp** — 흰 배경, border2, radius 6. 포커스=accent 보더 + accentSoft 2px 링.
- **.chip / .catchip** — 필터 토글(99px). on=accent(또는 accent2) 채움/흰 글자.
- **.kpi** — 카드 안 라벨(11.5px text2) + 값(23px/800 mono accent). `.due`=err.
- **.panel / .card** — 흰 면, 1px border, radius 8, 그림자 없음. 패널 제목 h3=accent/800.
- **.toast** — 하단 중앙 고정. 좌측 4px 컬러 바(accent/ok/warn/err) + 그림자. 2.4초.
- **.so-lang** — ja/ko/en 세그먼트 토글(99→6px 그룹). active=accent 채움.
- **.so-furi** — 후리가나 ON/OFF(일본어일 때만 노출). on=accentSoft.
- **.page-help** — 접이식 설명서(좌측 4px 올리브 바). summary=accent/800, ▸/▾ 마커.
- **.so-audit** — 공통 변경이력 패널. op 뱃지: INSERT=ok / UPDATE=gold / DELETE=err.

## Do / Don't
**Do**
- CSS 변수만 사용. 색 추가가 필요하면 먼저 `saizen-ops.css` 토큰을 확인·재사용.
- 올리브=주 액센트(액티브·포커스·1차), 골드=STEP·보조 강조로 **역할을 분리**.
- 강조는 굵기로. 면은 평평하게, border로 분리.
- 새 페이지는 `docs/ops-page-skeleton.html` 복사로 시작(공통 chrome 누락 방지).
- 활성·선택 상태는 **풀 accent 배경 + 흰 글자**로 또렷하게.

**Don't**
- `var(--x,#hex)` 형태의 HEX 폴백 금지.
- 다크모드·earth/warm 토널 시프트 추가 금지(라이트 전용, 올리브 고정).
- 화면 팔레트로 인쇄물 칠하지 않기(인쇄는 네이비/모노 별도).
- 패널·카드에 그림자 부활 금지(평평 유지).
- 폐기값 `#3d5424`(구 accent) 사용 금지 → `#647548`.

## Responsive
| 분기 | 변화 |
|---|---|
| ≤900px | 본문 2열(`1fr 340px`)→1열, sticky 패널→static |
| ≤760px | KPI 5열→2열 |
| ≤560px | 바 우측 검색/필드 폭 100%로 |

- **터치 타깃**: 버튼·칩 최소 ~28–32px 높이.
- **언어**: 모든 화면 chrome은 ja/ko/en 토글 대응(데이터·인쇄물은 원본/일본어 유지). 후리가나는 일본어일 때만.

## Iteration Guide & Known Gaps
1. 색·간격을 바꾸기 전 **`saizen-ops.css`(정본)** 를 먼저 본다. 공통 변경은 거기서.
2. `saizen-ops.css/js` 수정 시 **모든 Hub 페이지의 `?v=` 캐시 버전**을 올린다.
3. **알려진 부채**: 공통 chrome(.topbar/.btn/.inp/.conn 등)이 16+ 페이지에 **인라인 중복**되어 패딩이
   1~2px 드리프트함. 중앙화는 "기존 보존" 위배 우려로 **보류** 중. 그래서 이 문서가 *목표값*을, 새 페이지는
   skeleton이 *시작점*을 제공한다. 대규모 정규화는 별도 승인 후.
4. 미수록: 모달/오버레이 토큰, 인쇄 레이아웃(@page) 세부는 각 인쇄 페이지가 자체 보유.
