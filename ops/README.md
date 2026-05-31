# SaiZen 운영 시스템 (saizenjp.github.io)

구마모토 아소 야마나미 리조트를 운영하는 사이젠의 현장 운영 시스템입니다.
**데이터는 하나(Supabase 공유 DB), 화면은 여럿(모듈별 독립 HTML)** 원칙으로 구성됩니다.

## 구조

```
saizenjp.github.io/
├─ app/
│  └─ index.html           ← v13.4 통합 시스템 (루트, 인쇄물: 네임택·항공커버·청구서)
├─ assets/
│  └─ logo-saizen-*.svg    ← 로고 3종 (v13.4가 ../assets 로 참조)
└─ ops/                     ← ★ 운영 시스템 (이 폴더)
   ├─ index.html            ← 허브 랜딩 (진입 관문)
   └─ hub/                  ← SaiZen Hub (Supabase 운영 모듈)
   ├─ step1.html            ← STEP1 데이터 적재 (엠클릭 4종 → Supabase)
   ├─ room.html             ← STEP2 호텔 방배정 (개인 단위)
   └─ sql/                  ← DB 마이그레이션 (Supabase에서 번호순 실행)
      ├─ 01_schema.sql
      ├─ 02_room_inventory.sql
      ├─ 03_settle_status.sql
      ├─ 04_rls_anon.sql
      ├─ 05_room_inventory_real.sql
      └─ 06_rooms_member.sql   ← 방배정 개인 단위 전환
```

## 두 시스템의 역할 분담

- **Hub (hub/)** — 운영·배정·정산처럼 데이터가 쌓이고 공유되는 기능. Supabase 백엔드.
- **v13.4 통합 시스템 (app/)** — 한 번 뽑으면 끝인 인쇄물(네임택·항공커버·청구서). localStorage 기반.

Hub 모듈이 완성되는 순서대로 v13.4의 운영성 탭을 점차 대체하고, 인쇄물 기능은 v13.4에 유지합니다.

## 실행 (중요)

Hub 모듈은 **반드시 `https://` 또는 `http://localhost`** 에서 실행하세요.
로컬 파일을 더블클릭해 `file://` 로 열면 Supabase가 보안상 차단되어 배정·적재가 동작하지 않습니다.

- **배포**: GitHub Pages 사용 → `https://saizenjp.github.io/ops/hub/room.html`
- **로컬 테스트**: 폴더에서 `python -m http.server 8000` → `http://localhost:8000/ops/hub/room.html`
  또는 VS Code "Live Server" 확장.

## DB 적용 순서

Supabase SQL Editor에서 `hub/sql/` 의 01 → 06 을 번호순으로 한 번씩 실행합니다.
`if not exists` 가 있어 재실행해도 안전합니다. 06은 기존 방배정을 비우고 개인 단위(member_id)로 전환합니다.

## 배포 (GitHub Pages)

저장소 Settings → Pages → Source 를 `main` 브랜치 루트로 지정하면
`https://saizenjp.github.io/ops/` 로 허브 랜딩이 열립니다.
