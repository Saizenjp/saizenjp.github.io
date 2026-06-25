# design-sync 노트 (다음 세션 인계)

## 저장소 형태
- 순수 HTML/CSS/JS 정적 사이트. **React·Storybook·번들(dist) 없음** → `/design-sync` 스킬의
  컨버터 파이프라인(esbuild·.d.ts·_ds_bundle) 적용 불가. **hand-authored 경로**로 운용한다.
- 미리보기 라이브러리 = `design/components/*.html` (각 파일 첫 줄 `<!-- @dsCard group="…" -->`).
  진실 원본은 `ops/assets/saizen-ops.css` + `docs/ops-page-skeleton.html`(공통 chrome 정본).

## 정본 색 결정 (2026-06, Min)
- **`--accent: #647548` (올리브)** 로 최종 확정. CLAUDE.md §8·saizen-ops.css·라이브 렌더와 일치.
- 12개 페이지 인라인 `:root`의 `#3d5424`(진녹)는 뒤에 로드되는 saizen-ops.css가 덮어써
  **화면엔 안 나타나는 죽은 값**. (논의 중 진녹 후보가 거론됐으나, 라이브가 이미 올리브임을
  스크린샷으로 확인하고 올리브로 확정.)

## ⚠ 업로드 차단 (이 환경 한계)
- claude.ai/code Web 환경에서 `DesignSync`가 design-system 권한을 못 얻어 **자동 업로드 불가**.
  → claude.ai/design 프로젝트에서 **"Send to Claude Code Web"** 로 워크스페이스에 시드하거나,
    대화형 터미널에서 **`/design-login`** 후 `/design-sync` 재실행.
- 권한 확보되면: list_projects → (없으면) create_project → `.design-sync/config.json`의
  `projectId` 기록 → finalize_plan(localDir `./design`) → write_files 로 컴포넌트 단위 동기화.

## 2차 컴포넌트 (예정)
- 요약박스 `.sbox`/`.grand`, 인쇄 문서(네이비/모노 御請求書·精算表), 객실 카드 `.room`,
  배정 칩 `.chip-in/.chip-cont/.chip-out`, 도착/퇴실 리스트.
