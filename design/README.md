# SaiZen Ops 디자인 시스템 — 미리보기 라이브러리 (1차 추출)

`/ops/` 17개 페이지에 인라인으로 흩어져 있던 공통 chrome·컴포넌트 스타일을
**정본 디자인 시스템**으로 묶은 미리보기 라이브러리입니다. claude.ai/design에
동기화하면 디자인 에이전트가 SaiZen Ops 실제 컴포넌트로 화면을 구성합니다.

- 진실 원본: `ops/assets/saizen-ops.css` + `docs/ops-page-skeleton.html`(공통 chrome 정본)
- 추출 원칙: **읽어서 정리만** — 운영 페이지 동작/색을 바꾸지 않습니다.
- 각 `components/*.html`은 **독립 렌더 가능**한 미리보기이며, 첫 줄에
  `<!-- @dsCard group="…" -->` 마커를 둬 claude.ai/design 카드 색인에 잡힙니다.

## 정본 토큰 결정 (2026-06, Min)
- **`--accent: #647548` (올리브)** — 대표 강조색. CLAUDE.md §8·`saizen-ops.css`·
  브랜드 theme-color·**실제 라이브 렌더**와 일치하는 값으로 확정.
  - ⚠ 12개 페이지 인라인 `:root`에 `#3d5424`(진녹)가 남아 있으나, 뒤에 로드되는
    `saizen-ops.css`의 `:root{--accent:#647548}`가 이를 덮어써 **화면은 올리브로 렌더**됩니다.
    인라인 `#3d5424`는 사실상 죽은 값(폐기값)입니다.
- `--accent2: #9a7322` (골드) — STEP 번호·회원 뱃지 등 보조 강조.
- `--accentDeep: #4F5E38` (버튼 hover), `--accentSoft: #EDF0E2` (틴트 배경).
- 폰트: 본문 `Pretendard` 계열 / 모노 `SFMono-Regular` 계열 (ops 기준).
  ※ `/app/`(인쇄 시스템)은 `Noto Sans KR` + `JetBrains Mono`로 별도 관리.

## 컴포넌트 (1차 10종)
| 파일 | 그룹 | 내용 |
|---|---|---|
| `01-tokens.html` | Foundations | 색·타이포·라운드 토큰 |
| `02-buttons.html` | Actions | `.btn` (+ghost/sm/xs/big/connected/disabled) |
| `03-inputs.html` | Forms | `.inp` + 연결바 `.conn` |
| `04-chips.html` | Filters | `.chip`/`.on` 필터·날짜·숙소 칩 |
| `05-pills-badges.html` | Status | `.pill`(ok/err) · `.gbadge`(회원) · `.dbadge` · `.repbadge` · `.nbadge` |
| `06-cards.html` | Containers | 랜딩 `.card`(+feature/print/soon) |
| `07-topbar.html` | Chrome | `.topbar`/`.so-bar` (로고·언어토글·STEP·연결상태) |
| `08-panel.html` | Containers | `.panel` · `.page-help`(접이식 설명서) |
| `09-toast.html` | Status | `.toast`(ok/err/warn) |
| `10-table.html` | Data | `table.list` (정산·명단 표) |

## claude.ai/design 동기화 방법
이 환경(claude.ai/code Web)에서는 DesignSync가 design-system 권한을 얻지 못해
**자동 업로드가 불가**합니다. 동기화하려면:
1. claude.ai/design에서 디자인 시스템 프로젝트를 열고 **"Send to Claude Code Web"**로
   이 워크스페이스에 시드하거나,
2. 대화형 터미널에서 `/design-login`으로 권한을 부여한 뒤 `/design-sync`를 재실행합니다.

권한이 확보되면 `design/components/*.html`을 컴포넌트 단위로 동기화합니다(전면 교체 아님).

## 2차 예정
요약박스 `.sbox`/`.grand`, 인쇄 문서(네이비/모노 御請求書·精算表), 객실 카드 `.room`,
배정 칩(`.chip-in/cont/out`) 등.
