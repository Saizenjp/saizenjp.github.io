# 후속 작업 백로그 (SaiZen Yamanami 운영 시스템)

> 나중에 착수할 아이디어를 잊지 않도록 기록. 착수 시 CLAUDE.md 규칙(§3, /saizen-ops-change 스킬)을 따른다.

---

## ⭐ 레스토랑 명표(夕食 명패)에 팀 주문 QR 병기 — **POS 실운영 시작 후 착수**

**상태:** 보류(Min 결정 2026-07) — 아직 POS 운영 전. QR을 먼저 올려두면 실무자·손님이 헷갈림.
**착수 조건(트리거):** 현장에서 **POS 주문 시스템을 실제로 운영 시작**한 뒤.

**왜:** 주문이 가장 많이 발생하는 시점이 **저녁식사**다. 저녁엔 어차피 **레스토랑 명표를 테이블에 올려둔다.**
거기에 그 팀의 **주문 QR을 같이 인쇄**해 두면, 손님이 폰 사진·종이 카드를 안 꺼내도 **테이블 명패만으로 주문**이 된다
(직원이 명패의 QR을 바로 스캔 → 팀 자동선택). 저녁 주문 동선이 가장 매끄러워짐.

**어디에:** `ops/hub/dinner.html` 의 `printNameplates()` (레스토랑 명패 인쇄 — A4 가로·텐트 반접기, 1팀/1페이지, 운영팀은 합석 1장).

**구현 노트(조사 완료 2026-07):**
- 헤드에 `../assets/qrcode-generator.js?v=1` 로드(자체 호스팅 — CDN 아님. qrcards/keytag와 동일 라이브러리).
- `printNameplates()`를 async로: 대상 팀 `event_seq`들의 `order_tokens` 조회 → 없으면 즉시 발급(ensureTokens 로직 재사용).
  - dinner.html `data-so-area="print"` → 발급 권한(has_any_area print/room) 있음. (qrcards.html의 `ensureTokens` 그대로 이식)
- 카드 빌드 시 팀 `seq`를 카드에 실어 `qrs=[{tag, token}]` 구성(현재는 `members`에 tag만 있고 seq는 없음 → grp에서 `t.seq` 추가 필요).
- QR 생성(동기): `const q=qrcode(0,'M'); q.addData(token); q.make(); q.createDataURL(6,0)` → `<img>`.
- 배치: `.rn-card{position:relative}` + QR을 하단 코너에 absolute(이름 크기 로직 안 건드리게).
  - **단독 팀** = QR 1개(우하단, 작은 "注文 QR / 주문" 라벨).
  - **합석(운영팀 team_group) 명패** = 팀마다 folio가 따로이므로 **팀별 QR 여러 개**(태그 라벨과 함께 하단 한 줄). 병합돼도 청구는 event_seq 단위.
- **토글 권장:** 명패 버튼 옆 "명패에 주문 QR 포함" 체크박스(기본 ON) — 3개국어. POS 미운영 기간엔 OFF로 둘 수 있게.
- 토큰 없거나 권한 없으면 QR 없이 graceful(빈칸).
- ⚠ `/app/`의 レストラン名札(downloadRestaurantNameplate/openRestaurantPrintModal)은 별개 — 필요 시 후속. 우선순위는 ops.

**검증:** `node scripts/check-syntax.mjs`, jsdom 스모크(토큰→QR dataURL 생성). 캐시 `?v=` 범프.
