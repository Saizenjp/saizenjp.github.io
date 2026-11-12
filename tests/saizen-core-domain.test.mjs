/* ============================================================================
 * saizen-core-domain.test.mjs — 공유 도메인 모듈 단위 테스트 (증분 1)
 * ----------------------------------------------------------------------------
 *  · 돈(B2B 정산)·정원/배정(박수→층)·식수(조기퇴실) 등 틀리면 현장 사고가 나는
 *    순수 규칙의 회귀 방지. node:test(빌트인) — 외부 의존 0.
 * ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SZ = require('../ops/assets/saizen-core.js');

// ── B2B 단가 ───────────────────────────────────────────────────────────────
test('accomRate: 숙소별 단가', () => {
  assert.equal(SZ.accomRate('야마나미리조트'), 14000);
  assert.equal(SZ.accomRate('쿠주힐즈'), 14000);
  assert.equal(SZ.accomRate('久住ヒルズ'), 14000);
  assert.equal(SZ.accomRate('간지호텔'), 16000);
  assert.equal(SZ.accomRate('시즈노야도 료칸'), 16000);
  assert.equal(SZ.accomRate('돔하우스'), 14000);
  assert.equal(SZ.accomRate(''), 0);        // 미등록 → 0(경고 트리거)
  assert.equal(SZ.accomRate('무슨호텔'), 0);
});

test('b2bFees: 숙박비 + 송영비', () => {
  // 4명 × 2박 × 16000 = 128000 / 송영 4×6000=24000 / 합 152000
  const f = SZ.b2bFees(4, 2, '간지호텔');
  assert.deepEqual(f, { rate: 16000, lodge: 128000, transport: 24000, total: 152000 });
  // 단가 미등록이면 숙박비 0, 송영비만
  assert.deepEqual(SZ.b2bFees(2, 3, ''), { rate: 0, lodge: 0, transport: 12000, total: 12000 });
  // 방어: 빈 인원/박수
  assert.equal(SZ.b2bFees(0, 5, '시즈노야도 료칸').total, 0);
});

test('accomFromProduct: 숙박지 판정(쿠주-first, 실제 상품명)', () => {
  // 야마나미 계열
  assert.equal(SZ.accomFromProduct('[7박 8일] 야마나미CC 골프 투어 호텔 소형트윈 숙박'), '야마나미리조트');
  assert.equal(SZ.accomFromProduct('여행사 [4박 5일] 야마나미CC 골프 투어 돔하우스 숙박'), '야마나미리조트');
  // ★핵심: "야마나미CC"(골프장)가 들어가도 장기숙박형 별장전용=쿠주힐즈(숙박지)
  assert.equal(SZ.accomFromProduct('[7박 8일] 야마나미CC 골프 투어 "장기숙박형 별장전용"'), '쿠주힐즈');
  assert.equal(SZ.accomFromProduct('[7박 8일] 야마나미CC 골프 투어 "장기 숙박형 별장전용"'), '쿠주힐즈');
  // 간지(구주고원 골프) — "간지호텔 2색 골프 투어"
  assert.equal(SZ.accomFromProduct('[7박 8일] 간지호텔 2색 골프 투어'), '간지호텔');
  // 콤보: 간지 + 야마나미CC → 간지가 먼저
  assert.equal(SZ.accomFromProduct('[14박 15일] 간지호텔 골프 투어+야마나미CC 골프 투어'), '간지호텔');
  // 시즈
  assert.equal(SZ.accomFromProduct('[7박 8일] 시즈노야도 료칸 골프 투어'), '시즈노야도 료칸');
  assert.equal(SZ.accomFromProduct(''), '');
  // 단가까지 연결 — 쿠주힐즈(장기숙박)는 14000(야마나미와 동일하지만 분류는 쿠주)
  assert.equal(SZ.accomRate(SZ.accomFromProduct('[7박 8일] 야마나미CC 골프 투어 "장기숙박형 별장전용"')), 14000);
  assert.equal(SZ.accomRate(SZ.accomFromProduct('[3박 4일] 간지호텔 2색 골프 투어')), 16000);
});

test('originPort: 출발지 PUS/ICN(김해 포함·항공편 우선)', () => {
  // 출발지 문자열
  assert.equal(SZ.originPort('부산'), 'PUS');
  assert.equal(SZ.originPort('김해국제공항'), 'PUS');   // ★nametag/aircover가 빠뜨렸던 김해
  assert.equal(SZ.originPort('인천'), 'ICN');
  assert.equal(SZ.originPort('PUS'), 'PUS');
  assert.equal(SZ.originPort(''), 'ICN');
  // 항공편 코드 우선(ZE=에어부산→PUS / TW=티웨이→ICN)
  assert.equal(SZ.originPort('서울', 'ZE123'), 'PUS');
  assert.equal(SZ.originPort('부산', 'TW100'), 'ICN');   // 항공편이 출발지보다 우선
  assert.equal(SZ.isPus('김해'), true);
  assert.equal(SZ.isPus('인천'), false);
});

test('nightsBetween: 박수', () => {
  assert.equal(SZ.nightsBetween('2026-07-05', '2026-07-08'), 3);
  assert.equal(SZ.nightsBetween('2026-07-05', '2026-07-05'), 0);
  assert.equal(SZ.nightsBetween('2026-07-08', '2026-07-05'), 0); // 음수 방지
  assert.equal(SZ.nightsBetween('', '2026-07-08'), 0);
});

// ── 청소 효율 박수→층 규칙 ───────────────────────────────────────────────────
test('allowedFloors: 지정층(3·4·7박)', () => {
  assert.deepEqual(SZ.allowedFloors(3, () => []), [9, 6, 3]);
  assert.deepEqual(SZ.allowedFloors(4, () => []), [9, 6, 3]);
  assert.deepEqual(SZ.allowedFloors(7, () => []), [11, 10, 7, 4]);
});

test('allowedFloors: 유동층(그 외 박수) — 비었거나 같은 박수만', () => {
  // 2박: 모든 유동층 비어 있음 → 12·8·5 전부
  assert.deepEqual(SZ.allowedFloors(2, () => []), [12, 8, 5]);
  // 8층에 같은 2박이 이미 있음 → 여전히 허용
  assert.deepEqual(SZ.allowedFloors(2, f => f === 8 ? [2] : []), [12, 8, 5]);
  // 8층에 다른 박수(3박)가 있음 → 8 제외(혼합 금지)
  assert.deepEqual(SZ.allowedFloors(2, f => f === 8 ? [3] : []), [12, 5]);
  // 12층에 2가지 박수 섞임 → 제외
  assert.deepEqual(SZ.allowedFloors(5, f => f === 12 ? [5, 3] : []), [8, 5]);
  // Set 입력도 허용
  assert.deepEqual(SZ.allowedFloors(2, f => f === 5 ? new Set([4]) : new Set()), [12, 8]);
});

// ── 조기 퇴실 식수 경계 ──────────────────────────────────────────────────────
test('mealGoneCount: 朝=퇴실일 아침 포함, 昼·夕=퇴실일부터 제외', () => {
  const ad = ['2026-07-05']; // 한 명이 7/5 조기 퇴실
  // 7/4: 아직 전원
  assert.equal(SZ.mealGoneCount(ad, '2026-07-04', 'b'), 0);
  assert.equal(SZ.mealGoneCount(ad, '2026-07-04', 'd'), 0);
  // 7/5(퇴실일): 朝 포함(0명 빠짐) / 昼·夕 제외(1명 빠짐)
  assert.equal(SZ.mealGoneCount(ad, '2026-07-05', 'b'), 0);
  assert.equal(SZ.mealGoneCount(ad, '2026-07-05', 'l'), 1);
  assert.equal(SZ.mealGoneCount(ad, '2026-07-05', 'd'), 1);
  // 7/6: 전 끼니 제외
  assert.equal(SZ.mealGoneCount(ad, '2026-07-06', 'b'), 1);
  // 빈 입력
  assert.equal(SZ.mealGoneCount(null, '2026-07-06', 'd'), 0);
  assert.equal(SZ.mealGoneCount([], '2026-07-06', 'd'), 0);
});

// ── 식수 규칙 (mealPlan) ─────────────────────────────────────────────────────
//  날짜 요일: 07-01 수 / 07-02 목 / 07-04 토 / 07-05 일 / 07-06 월
test('mealPlan: 야마나미(체류 규칙) — 입국ICN/중간/귀국', () => {
  const t = { accom: '야마나미리조트', dep: '2026-07-01', arr: '2026-07-04', isPus: false };
  // 입국일(ICN): 조식X(전날 안 묵음)·중식 arr·석식O
  assert.deepEqual(SZ.mealPlan(t, '2026-07-01'), { breakfast: false, lunchKind: 'arr', dinner: true });
  // 중간일: 조식O·중식 cont·석식O
  assert.deepEqual(SZ.mealPlan(t, '2026-07-02'), { breakfast: true, lunchKind: 'cont', dinner: true });
  // 귀국일(ICN): 조식O·중식 없음(ICN 귀국은 cont 아님)·석식X
  assert.deepEqual(SZ.mealPlan(t, '2026-07-04'), { breakfast: true, lunchKind: '', dinner: false });
});

test('mealPlan: 야마나미 귀국 PUS → 중식 cont', () => {
  const t = { accom: '야마나미리조트', dep: '2026-07-01', arr: '2026-07-04', isPus: true };
  assert.equal(SZ.mealPlan(t, '2026-07-04').lunchKind, 'cont');
  assert.equal(SZ.mealPlan(t, '2026-07-01').lunchKind, ''); // 입국 PUS는 중식 없음
});

test('mealPlan: OFFSITE 간지(요일 규칙)', () => {
  const t = { accom: '간지호텔', dep: '2026-07-01', arr: '2026-07-04', isPus: false };
  // 입국 수요일 ICN → 중식 arr / 조식X(입국일) / 석식O
  assert.deepEqual(SZ.mealPlan(t, '2026-07-01'), { breakfast: false, lunchKind: 'arr', dinner: true });
  // 귀국 토요일 → 조식X(수목일 아님)·중식 없음·석식X
  assert.deepEqual(SZ.mealPlan(t, '2026-07-04'), { breakfast: false, lunchKind: '', dinner: false });
  // 입국 토요일 간지 → 중식 arr(간지 토일 규칙)
  const t2 = { accom: '간지호텔', dep: '2026-07-04', arr: '2026-07-07', isPus: false };
  assert.equal(SZ.mealPlan(t2, '2026-07-04').lunchKind, 'arr');
});

test('mealPlan: OFFSITE 시즈 귀국 수목일 PUS → 조식O·중식 cont', () => {
  const t = { accom: '시즈노야도 료칸', dep: '2026-06-29', arr: '2026-07-01', isPus: true }; // 07-01 수(WTS)
  assert.deepEqual(SZ.mealPlan(t, '2026-07-01'), { breakfast: true, lunchKind: 'cont', dinner: false });
});

test('mealOffsite', () => {
  assert.equal(SZ.mealOffsite('간지호텔'), true);
  assert.equal(SZ.mealOffsite('시즈노야도 료칸'), true);
  assert.equal(SZ.mealOffsite('야마나미리조트'), false);
});

// ── 영문 로마자 → 가타카나 후리가나(여권 철자대로, 유성음) ───────────────────
test('nameYomiEn: 영문 철자대로 후리가나(남궁병욱 NAMGUNG BYONG UK → ナムグン/ビョンウク)', () => {
  assert.deepEqual(SZ.nameYomiEn('NAMGUNG BYONG UK'), { sur: 'ナムグン', given: 'ビョンウク' });
  // 유성 자음: BONG→ボン·JAE→ジェ·DONG→ドン·GYU→ギュ (한글기반 무성음 아님)
  assert.equal(SZ.nameYomiEn('HONG SANG DONG').given, 'サンドン');
  assert.equal(SZ.nameYomiEn('BAE JUN GYU').given, 'ジュンギュ');
  // 종성 ng→ン, k→ク, m→ム
  assert.equal(SZ.romajiToKana('KANG'), 'カン');
  assert.equal(SZ.romajiToKana('KIM'), 'キム');
  assert.equal(SZ.romajiToKana('UK'), 'ウク');
  // 흔한 성씨 관용 보정
  assert.equal(SZ.nameYomiEn('LEE JAE BONG').sur, 'イ');
  assert.equal(SZ.nameYomiEn('PARK MOO SIL').sur, 'パク');
  assert.equal(SZ.nameYomiEn('CHOI YEONG').sur, 'チェ');
  // 빈 입력
  assert.deepEqual(SZ.nameYomiEn(''), { sur: '', given: '' });
});

// ── 팀 대표 태그 표시(개인순번 숫자 제거·숙소 문자 유지) ───────────────────
test('tagStripSeq: -1Y → -Y (숫자만 제거)', () => {
  assert.equal(SZ.tagStripSeq('DAあ-1Y'), 'DAあ-Y');
  assert.equal(SZ.tagStripSeq('GFな-12K'), 'GFな-K');
  assert.equal(SZ.tagStripSeq('EWた-3S'), 'EWた-S');
  assert.equal(SZ.tagStripSeq('FAあ'), 'FAあ');   // 접미 없으면 그대로
  assert.equal(SZ.tagStripSeq(''), '');
});

// ── 숙박지 판정(타 리조트 오염·오분류 방지, 2026-07 버그 회귀) ───────────────
test('accomFromProduct: 사이젠 권역', () => {
  assert.equal(SZ.accomFromProduct('[7박 8일] 시즈노야도 료칸 골프 투어'), '시즈노야도 료칸');
  assert.equal(SZ.accomFromProduct('시즈노야도 현지예약'), '시즈노야도 료칸');
  assert.equal(SZ.accomFromProduct('[4박 5일] 간지호텔 골프 투어'), '간지호텔');
  assert.equal(SZ.accomFromProduct('야마나미CC 장기숙박형 별장전용 골프투어'), '쿠주힐즈');  // 쿠주-first
  assert.equal(SZ.accomFromProduct('[3박 4일] 야마나미CC 골프 투어'), '야마나미리조트');
});
test('accomFromProduct: 타 리조트=미해당(오염 차단)', () => {
  assert.equal(SZ.accomFromProduct('[3박 4일] 벳푸 무츠키 료칸 2색 골프 투어'), '');  // ⚠ 넓은 료칸 오분류 금지
  assert.equal(SZ.accomFromProduct('[7박 8일] 스가다이라 그린CC 골프 투어'), '');
  assert.equal(SZ.accomFromProduct('14hills'), '');
  assert.equal(SZ.accomFromProduct('[6박 7일] 시로사토CC 골프 투어'), '');
  assert.equal(SZ.accomFromProduct(''), '');
});

// ── F코드 재사용 30일 쿨다운(턴오버·한달내 재등장 충돌, 2026-07 버그 회귀) ────
test('nmCodeConflict: 30일 쿨다운', () => {
  // 턴오버(퇴실=입실) = 충돌(다른 코드)
  assert.equal(SZ.nmCodeConflict('2026-07-23','2026-07-26','2026-07-26','2026-07-30'), true);
  // 27일 gap(<30) = 충돌
  assert.equal(SZ.nmCodeConflict('2026-07-01','2026-07-05','2026-08-01','2026-08-05'), true);
  // 36일 gap(>30) = 재사용 허용(비충돌)
  assert.equal(SZ.nmCodeConflict('2026-07-01','2026-07-05','2026-08-10','2026-08-15'), false);
  // 순서 무관(대칭)
  assert.equal(SZ.nmCodeConflict('2026-08-10','2026-08-15','2026-07-01','2026-07-05'), false);
  // 실제 겹침
  assert.equal(SZ.nmCodeConflict('2026-07-01','2026-07-10','2026-07-05','2026-07-12'), true);
  // 날짜 없음 = 안전 충돌
  assert.equal(SZ.nmCodeConflict('','2026-07-05','2026-08-05','2026-08-09'), true);
});

// ── 방 타입·층 표시 라벨 (ja/ko/en) — 2026-11 검수: 함수는 있었는데 내보내지 않아 청소·방배정 화면이 일본어·영어에서도 한국어 저장값을 보였다 ──
test('roomTypeLabel · zoneLabel: 내보내기 + 3개국어', () => {
  assert.equal(typeof SZCore.roomTypeLabel, 'function');
  assert.equal(typeof SZCore.zoneLabel, 'function');
  assert.equal(SZCore.roomTypeLabel('트윈', 'ja'), 'ツイン');
  assert.equal(SZCore.roomTypeLabel('트윈', 'ko'), '스탠다드 트윈');          // 저장값 「트윈」의 표시명(2026-07)
  assert.equal(SZCore.roomTypeLabel('디럭스더블트윈', 'en'), 'Deluxe Double Twin');
  assert.equal(SZCore.roomTypeLabel('없는타입', 'ja'), '없는타입');           // 미등록 = 원문
  assert.equal(SZCore.roomTypeLabel(null, 'ja'), '');
  assert.equal(SZCore.zoneLabel('7층', 'ja'), '7階');
  assert.equal(SZCore.zoneLabel('7층', 'en'), '7F');
  assert.equal(SZCore.zoneLabel('7층', 'ko'), '7층');
  assert.equal(SZCore.zoneLabel('돔하우스', 'ja'), 'ドームハウス');            // 층이 아닌 구역 = accomLabel
  assert.equal(SZCore.zoneLabel('', 'ja'), '');
});

// ── 숙소·구역 표시 라벨 (ja/ko/en) ──────────────────────────────────────
test('accomLabel: 3개국어 라벨 · 키 패리티 · 미등록 폴백', () => {
  assert.equal(SZCore.accomLabel('간지호텔', 'en'), 'The Guernsey Hotel');   // Gandhi 아님(건지 젖소 Guernsey)
  assert.equal(SZCore.accomLabel('시즈노야도 료칸', 'ja'), '志津の宿');       // 満願寺温泉 志津の宿(가타카나 음차 아님)
  assert.equal(SZCore.accomLabel('시즈노야도', 'ja'), '志津の宿');            // 구역 표기도 동일
  assert.equal(SZCore.accomLabel('야마나미리조트', 'ko'), '야마나미리조트');
  assert.equal(SZCore.accomLabel('돔하우스', 'en'), 'Dome House');
  // 3개국어 전부 채워져 있어야 함(빈 값이면 화면에 빈칸)
  for (const k of Object.keys(SZCore.ACCOM_LABEL)) {
    for (const l of ['ja', 'ko', 'en']) {
      assert.ok(SZCore.accomLabel(k, l), `${k}.${l} 누락`);
    }
  }
  // 미등록 이름은 원문 그대로(신규 숙소 유입 시 화면이 비지 않게)
  assert.equal(SZCore.accomLabel('신규숙소', 'en'), '신규숙소');
  assert.equal(SZCore.accomLabel(null, 'ko'), '');
});

// ── 카트 비고 표기 3단계 (Min 2026-08) ─────────────────────────────────────
//   「전기카트 신청」처럼 명확할 때만 집계하고, 「전기」만 적힌 건은 재확인으로 뺀다.
test('cartRemarkKind — 명확/애매/없음', () => {
  assert.equal(SZCore.cartRemarkKind('전기카트 신청'), 'sure');
  assert.equal(SZCore.cartRemarkKind('전동카트 2대 요청'), 'sure');
  assert.equal(SZCore.cartRemarkKind('EV 카트'), 'sure');
  assert.equal(SZCore.cartRemarkKind('전기'), 'maybe');
  assert.equal(SZCore.cartRemarkKind('전기 신청'), 'maybe');
  assert.equal(SZCore.cartRemarkKind('EV 요청'), 'maybe');
  assert.equal(SZCore.cartRemarkKind('■전기카드 1개 신청'), 'sure');    // 카트→카드 오타는 확정
  assert.equal(SZCore.cartRemarkKind('전기'), 'maybe');                  // 한 단어만 = 재확인
  assert.equal(SZCore.cartRemarkKind('조식 추가'), 'none');
  assert.equal(SZCore.cartRemarkKind(''), 'none');
  assert.equal(SZCore.cartRemarkKind(null), 'none');
  // 집계용 판정은 sure 일 때만 true
  assert.equal(SZCore.wantsElectricCart('전기'), false);
  assert.equal(SZCore.wantsElectricCart('전기카트'), true);
});

test('cartFreeDay: 입국일·귀국일 라운딩은 카트 무료', () => {
  const team = { dep: '2026-08-12', arr: '2026-08-16' };
  // 인천출발 = 입국일(첫날) 라운딩 무료
  assert.equal(SZCore.cartFreeDay(team, '2026-08-12'), true);
  // 부산출발 = 귀국일(마지막날) 9홀 라운딩 무료
  assert.equal(SZCore.cartFreeDay(team, '2026-08-16'), true);
  // 체류 중간일은 유료
  assert.equal(SZCore.cartFreeDay(team, '2026-08-13'), false);
  assert.equal(SZCore.cartFreeDay(team, '2026-08-15'), false);
  // 날짜에 시각이 붙어 와도 앞 10자만 본다
  assert.equal(SZCore.cartFreeDay(team, '2026-08-12T00:00:00Z'), true);
  // 값이 없으면 무료 아님
  assert.equal(SZCore.cartFreeDay(null, '2026-08-12'), false);
  assert.equal(SZCore.cartFreeDay(team, ''), false);
});

test('airportLabel / accomColor: 세 인쇄물 표기가 한 곳에서 나온다', () => {
  // 같은 공항을 인쇄물 성격에 맞는 형식으로 — 매핑은 한 곳
  assert.equal(SZCore.airportLabel('ICN', 'code'), 'ICN');   // 네임택
  assert.equal(SZCore.airportLabel('ICN', 'city'), 'ソウル'); // 航空カバー
  assert.equal(SZCore.airportLabel('ICN', 'full'), '仁川空港'); // 송영표
  assert.equal(SZCore.airportLabel('PUS', 'city'), '釜山');
  assert.equal(SZCore.airportLabel('PUS', 'full'), '金海空港');
  assert.equal(SZCore.airportLabel('부산', 'full'), '金海空港');   // 지명으로 줘도 같은 결과
  assert.equal(SZCore.airportLabel('KMJ', 'full'), '熊本空港');
  assert.equal(SZCore.airportLabel('', 'full'), '');
  assert.equal(SZCore.airportLabel('ZZZ', 'full'), 'ZZZ');        // 모르는 코드는 원문

  // 숙소 구분색 — 숙소명으로 주든 접두문자로 주든 같은 색(세 인쇄물 동일)
  assert.equal(SZCore.accomColor('야마나미리조트'), SZCore.accomColor('Y'));
  assert.equal(SZCore.accomColor('쿠주힐즈'), '#5B21B6');
  assert.equal(SZCore.accomColor('간지호텔'), '#065F46');
  assert.equal(SZCore.accomColor('시즈노야도 료칸'), '#92400E');
  assert.equal(SZCore.accomPrefix('쿠주힐즈'), 'K');
  assert.equal(SZCore.accomPrefix(''), '');
});

test('golfRows: 귀국일(부산편) 라운딩은 오전 18H — 9H 폐기(Min 2026-10-25)', () => {
  const team = { dep: '2026-11-04', arr: '2026-11-11', accom: '야마나미리조트' };
  const pus = SZ.golfRows(team, true);
  const last = pus.find(r => r.date === '2026-11-11');
  assert.ok(last, '부산편은 귀국일에 라운딩이 있다');
  assert.equal(last.holes, 18);
  assert.equal(pus.find(r => r.date === '2026-11-04'), undefined, '부산편 입국일은 라운딩 없음');
  const icn = SZ.golfRows(team, false);
  assert.equal(icn.find(r => r.date === '2026-11-11'), undefined, '인천편은 귀국일 라운딩 없음');
  assert.equal(icn.find(r => r.date === '2026-11-04').holes, 18, '인천편 입국일 18H');
  // 체류 중 평일은 18H(+9H 서비스 표기), 주말은 18H
  assert.equal(pus.find(r => r.date === '2026-11-05').holes, 18);
});

// ── 일별 코스 로테이션(Min 2026-10-25 「매일 아소→소보→쿠주 순서로 로테이션」 = 팀 단위) ──
test('nextStartCourse: 어제 출발 코스의 다음 코스(아소→소보→쿠주→아소), 기록 없으면 null', () => {
  assert.equal(SZ.nextStartCourse('aso'), 'sobo');
  assert.equal(SZ.nextStartCourse('sobo'), 'kuju');
  assert.equal(SZ.nextStartCourse('kuju'), 'aso');
  assert.equal(SZ.nextStartCourse(''), null);
  assert.equal(SZ.nextStartCourse(null), null);
  assert.equal(SZ.nextStartCourse('xyz'), null);
  assert.deepEqual(SZ.GOLF_COURSES, ['aso', 'sobo', 'kuju']);   // 순환 순서 자체가 규칙이다
});

test('기본 석식 한국어 표 = 일본어 표와 같은 길이·요일 일치(손님 화면용)', () => {
  assert.equal(SZCore.BASE_DINNER_KO.length, SZCore.BASE_DINNER.length);
  assert.ok(SZCore.BASE_DINNER_KO.every(x => x && x.length));
  assert.equal(SZCore.baseDinnerKo('2026-10-26'), '일본산 삼겹살 구이');   // 월
  assert.equal(SZCore.baseDinner('2026-10-26'), '日本産豚バラ焼');
  assert.equal(SZCore.baseDinnerKo('2026-10-25'), '해물전골');               // 일
  assert.equal(SZCore.baseDinnerKo('bad'), '');
});

// ── 2027 상품명(2027-07 엠클릭 예약리스트, Min 2026-11-03 「이 상품이 2027년 상품 정리야」) — 숙박지·판매구분 실명 표본 ──
test('accomFromProduct: 2027 상품명 — 쿠쥬 프라이빗 타운=쿠주힐즈, 야마나미 신상품=야마나미, 타 리조트=미해당', () => {
  assert.equal(SZ.accomFromProduct('쿠쥬 프라이빗 타운 야마나미CC 7박 8일'), '쿠주힐즈');
  assert.equal(SZ.accomFromProduct('쿠쥬 프라이빗 타운 + 호텔 숙박 야마나미CC 14박 15일'), '쿠주힐즈');   // 콤보 = 앞 숙소(수기 분할)
  assert.equal(SZ.accomFromProduct('호텔 숙박 야마나미CC 7박 8일'), '야마나미리조트');
  assert.equal(SZ.accomFromProduct('돔스테이 야마나미CC 4박 5일'), '야마나미리조트');
  assert.equal(SZ.accomFromProduct('소보 테라스 야마나미CC 4박 5일'), '야마나미리조트');
  assert.equal(SZ.accomFromProduct('아소 프레스티지 야마나미CC 4박 5일'), '야마나미리조트');
  assert.equal(SZ.accomFromProduct('히노키 스테이 야마나미CC 4박 5일'), '야마나미리조트');
  assert.equal(SZ.accomFromProduct('간지호텔 2색 골프 투어 7박 8일'), '간지호텔');
  assert.equal(SZ.accomFromProduct('간지호텔 2색+시즈노야도 료칸 골프 투어  14박 15일'), '간지호텔');
  assert.equal(SZ.accomFromProduct('시즈노야도 료칸 골프 투어 4박 5일'), '시즈노야도 료칸');
  assert.equal(SZ.accomFromProduct('호텔 숙박+시즈노야도+호텔 숙박 야마나미CC 28박 29일'), '시즈노야도 료칸');
  for (const other of ['온천호텔 숙박 스가다이라CC 7박 8일', '맨션 숙박 스가다이라CC 14박 15일', '호텔 숙박 포틴힐즈CC 7박 8일', '카라반 숙박 포틴힐즈CC 7박 8일',
    '벳푸 아키바 리조트 2색 골프투어 3박 4일', '시로사토CC 골프 투어 6박 7일', '미야자키 2색 골프투어 5박 6일', '미야자키 국제공항CC 골프 투어 5박 6일'])
    assert.equal(SZ.accomFromProduct(other), '', other);
});
test('saleTypeFromProduct: 2026 규칙 회귀(room.html guessSaleType 와 동일)', () => {
  const Y = '야마나미리조트';
  assert.equal(SZ.saleTypeFromProduct('[7박 8일] 야마나미CC 골프 투어 관내별장 숙박', Y), '관내별장');
  assert.equal(SZ.saleTypeFromProduct('여행사 [3박 4일] 야마나미CC 골프 투어 호텔 소형트윈 숙박', Y), '호텔 소형트윈');   // 소형트윈이 여행사보다 먼저
  assert.equal(SZ.saleTypeFromProduct('여행사 [4박 5일] 야마나미CC 골프 투어 돔하우스 숙박', Y), '돔하우스');
  assert.equal(SZ.saleTypeFromProduct('여행사 [2박 3일] 야마나미CC 골프 투어 호텔 트윈 숙박', Y), '돔하우스');            // 「여행사」= 돔하우스(Min 2026-08)
  assert.equal(SZ.saleTypeFromProduct('[4박 5일] 야마나미CC 골프 투어 돔하우스', Y), '돔하우스');
  assert.equal(SZ.saleTypeFromProduct('[3박 4일] 야마나미CC 골프 투어', Y), '호텔 트윈');
  assert.equal(SZ.saleTypeFromProduct('야마나미 현지예약', Y), '현지예약');
  assert.equal(SZ.saleTypeFromProduct('[7박 8일] 야마나미CC 골프 투어 "장기숙박형 별장전용"', '쿠주힐즈'), '장기숙박전용');
  assert.equal(SZ.saleTypeFromProduct('[7박 8일] 간지호텔 2색 골프 투어', '간지호텔'), '호텔');
  assert.equal(SZ.saleTypeFromProduct('[7박 8일] 시즈노야도 료칸 골프 투어', '시즈노야도 료칸'), '료칸');
  assert.equal(SZ.saleTypeFromProduct('시즈노야도 현지예약', '시즈노야도 료칸'), '현지예약');
  assert.equal(SZ.saleTypeFromProduct('[7박 8일] 스가다이라 그린CC 골프 투어', ''), '');
  // accom 생략 = accomFromProduct 로 판정
  assert.equal(SZ.saleTypeFromProduct('[7박 8일] 야마나미CC 골프 투어 관내별장 숙박'), '관내별장');
});
test('saleTypeFromProduct: 2027 상품명 — 호텔 숙박=호텔 트윈 · 돔스테이=돔하우스 · 소보 테라스=소보 5호 · 히노키 스테이=소보별장 · 아소 프레스티지=아소별장(수기) · 쿠쥬=장기숙박전용', () => {
  assert.equal(SZ.saleTypeFromProduct('호텔 숙박 야마나미CC 7박 8일'), '호텔 트윈');
  assert.equal(SZ.saleTypeFromProduct('호텔 숙박 야마나미CC 14박 15일'), '호텔 트윈');
  assert.equal(SZ.saleTypeFromProduct('돔스테이 야마나미CC 3박 4일'), '돔하우스');
  assert.equal(SZ.saleTypeFromProduct('소보 테라스 야마나미CC 4박 5일'), '소보 테라스');     // 소보 5호 통째(Min 2026-11-03)
  assert.equal(SZ.saleTypeFromProduct('야마나미CC 소보별장 숙박 4박 5일'), '히노키 스테이');      // 2027 소보별장=히노키 스테이
  assert.equal(SZ.saleTypeFromProduct('아소 프레스티지 야마나미CC 4박 5일'), '아소별장');
  assert.equal(SZ.saleTypeFromProduct('히노키 스테이 야마나미CC 4박 5일'), '히노키 스테이');
  assert.equal(SZ.saleTypeFromProduct('쿠쥬 프라이빗 타운 야마나미CC 7박 8일'), '장기숙박전용');
  assert.equal(SZ.saleTypeFromProduct('간지호텔 2색 골프 투어 4박 5일'), '호텔');
  assert.equal(SZ.saleTypeFromProduct('시즈노야도 료칸 골프 투어 7박 8일'), '료칸');
  assert.equal(SZ.saleTypeFromProduct('온천호텔 숙박 스가다이라CC 7박 8일'), '');
});

// ── 엠클릭 룸타입 열(2027-07 예약리스트 실측값, Min 2026-11-03 「3번은 그렇게 다 설정되어 있는거야」) ──
test('roomTypeSingles: 싱글=전원 · 싱글,트윈=3명 1실/4명 2실/그 외 비고 확인 · 트윈=없음 (입국일 2027~)', () => {
  const D = '2027-07-01';   // 2027 입국 예약
  assert.deepEqual(SZ.roomTypeSingles('싱글', 4, D), { kind: 'all', n: 4 });
  assert.deepEqual(SZ.roomTypeSingles('싱글', 8, D), { kind: 'all', n: 8 });
  assert.deepEqual(SZ.roomTypeSingles('싱글,트윈', 4, D), { kind: 'mixed', n: 2 });
  assert.deepEqual(SZ.roomTypeSingles('싱글,트윈', 3, D), { kind: 'odd', n: 1 });
  assert.deepEqual(SZ.roomTypeSingles('싱글,트윈', 5, D), { kind: 'odd', n: 1 });
  assert.deepEqual(SZ.roomTypeSingles('싱글,트윈', 6, D), { kind: 'mixed', n: 0 });
  assert.deepEqual(SZ.roomTypeSingles('싱글,컴팩트', 4, D), { kind: 'mixed', n: 2 });
  for (const rt of ['트윈', '컴팩트', '본관(개인온천X)', '별채(개인온천O)', '4인(4PERSON)', '8인(8PERSON)', '', null])
    assert.equal(SZ.roomTypeSingles(rt, 4, D), null, String(rt));
  assert.equal(SZ.roomTypeAnnex('별채(개인온천O)', D), true);
  assert.equal(SZ.roomTypeAnnex('별채(개인온천O),트윈', D), true);
  assert.equal(SZ.roomTypeAnnex('본관(개인온천X)', D), false);
  assert.equal(SZ.roomTypeAnnex('본관(개인온천X),트윈', D), false);
  assert.equal(SZ.roomTypeAnnex(null, D), false);
});

// Min 2026-11-03 「2026년 예약은 그대로 조건 건드리지말고 해. 2027년부터야」 — 룸타입 규칙은 입국일 2027-01-01 이후 예약에만
test('roomTypeOn: 2026 입국 예약은 룸타입을 보지 않는다(2027-01-01 경계·Date·빈값)', () => {
  assert.equal(SZ.ROOMTYPE_FROM, '2027-01-01');
  assert.equal(SZ.roomTypeOn('2026-12-31'), false);
  assert.equal(SZ.roomTypeOn('2027-01-01'), true);
  assert.equal(SZ.roomTypeOn('2027-07-15T00:00:00'), true);
  assert.equal(SZ.roomTypeOn(new Date(2027, 0, 1)), true);
  assert.equal(SZ.roomTypeOn(new Date(2026, 11, 31)), false);
  for (const v of ['', null, undefined, 'abc']) assert.equal(SZ.roomTypeOn(v), false, String(v));
  // 2026 예약: 룸타입이 「싱글」·「별채」라도 종전 규칙(비고만)
  assert.equal(SZ.roomTypeSingles('싱글', 4, '2026-12-10'), null);
  assert.equal(SZ.roomTypeSingles('싱글,트윈', 4, '2026-11-20'), null);
  assert.equal(SZ.roomTypeSingles('싱글', 4), null);                 // 입국일 없음 = 적용 안 함(안전 기본값)
  assert.equal(SZ.roomTypeAnnex('별채(개인온천O)', '2026-12-10'), false);
  assert.equal(SZ.roomTypeAnnex('별채(개인온천O)'), false);
  // 2027 예약: 적용
  assert.deepEqual(SZ.roomTypeSingles('싱글', 2, '2027-01-01'), { kind: 'all', n: 2 });
  assert.equal(SZ.roomTypeAnnex('별채(개인온천O)', '2027-03-05'), true);
});

// 현지 담당 회사 日別 料金表(2026-11-01~2027-10-31)의 공휴일 목록 17개 — 전부 JP_HOLIDAYS 에 있어야 한다(2026-11-04 대조, 2027-03-21 春分の日 보충)
test('JP_HOLIDAYS: 2026-11~2027-10 공휴일 17개(현지 요금표 목록) 전부 포함 · 금/祝前日은 휴일 단가(partnerNightType hi)', () => {
  const list = ['2026-11-03','2026-11-23','2027-01-01','2027-01-11','2027-02-11','2027-02-23','2027-03-21','2027-03-22','2027-04-29','2027-05-03','2027-05-04','2027-05-05','2027-07-19','2027-08-11','2027-09-20','2027-09-23','2027-10-11'];
  for (const d of list) assert.ok(SZ.JP_HOLIDAYS.includes(d), d);
  assert.equal(SZ.partnerNightType('2026-11-06'), 'hi');   // 금요일 — 현지 표는 平日로 적지만 단가는 휴일
  assert.equal(SZ.partnerNightType('2026-12-31'), 'hi');   // 祝前日(元日 전날)
  assert.equal(SZ.partnerNightType('2026-11-04'), 'wk');   // 수요일
});

// 검수 D14-2 — 전기카트 비고: 취소·불필요 같은 부정 문구는 확정(sure)이 아니라 재확인(maybe) · 영문 낱말 끝의 E + 「카드」 오탐 없음
test('cartRemarkKind — 부정 문구는 재확인 / 「lotte 카드」는 전기카트가 아니다', () => {
  for (const s of ['전기카트 취소', '전기카트 신청 안함', '전동카트 불필요', '전기카트 대기', '전기카트 없음', '電動カート キャンセル'])
    assert.equal(SZ.cartRemarkKind(s), 'maybe', s);
  assert.equal(SZ.cartRemarkKind('lotte 카드 결제'), 'none');
  assert.equal(SZ.cartRemarkKind('THE 카드'), 'none');
  assert.equal(SZ.cartRemarkKind('E카트 신청'), 'sure');
  assert.equal(SZ.cartRemarkKind('■E 카트 1대'), 'sure');
  assert.equal(SZ.cartRemarkKind('전기카트 신청 / 싱글룸 대기'), 'sure');   // 다른 항목의 「대기」는 상관없다
  assert.equal(SZ.cartRemarkKind('전기카트 2대 신청\n석식 1회 취소'), 'sure');
  assert.equal(SZ.wantsElectricCart('전기카트 취소'), false);
  assert.equal(SZ.wantsElectricCart('전기카트 신청'), true);
  assert.equal(SZ.wantsElectricCart('lotte 카드 결제'), false);
});
// 검수 D14-6 — 여권 영문 WOO 는 ウ(ウォオ 가 아니다) · 한글 폴백 최→チェ·두→トゥ
test('nameYomiEn: WOO → ウ · WON 은 ウォン 그대로', () => {
  assert.equal(SZ.nameYomiEn('HONG GILWOO').given, 'ギルウ');
  assert.equal(SZ.nameYomiEn('HONG GIL WOO').given, 'ギルウ');
  assert.equal(SZ.nameYomiEn('HONG DONG WOOK').given, 'ドンウク');
  assert.equal(SZ.nameYomiEn('HONG WOONG').given, 'ウン');
  assert.equal(SZ.nameYomiEn('HONG WONHO').given, 'ウォンホ');
  assert.equal(SZ.nameYomiEn('PARK MOO SIL').given, 'ムシル');
  assert.equal(SZ.nameYomiEn('WOO GILDONG').sur, 'ウ');
});
test('hangulToKana(영문 이름이 없을 때의 폴백): 최→チェ · 죄→ジェ · 두→トゥ · 디→ティ', () => {
  assert.equal(SZ.hangulToKana('최'), 'チェ');
  assert.equal(SZ.hangulToKana('죄'), 'ジェ');
  assert.equal(SZ.hangulToKana('두'), 'トゥ');
  assert.equal(SZ.hangulToKana('디'), 'ティ');
  assert.equal(SZ.hangulToKana('수'), 'ス');          // 그 밖의 행은 그대로
  assert.equal(SZ.hangulToKana('추'), 'チュ');
  assert.equal(SZ.hangulToKana('과'), 'クァ');
  assert.deepEqual(SZ.nameYomi('홍길동'), { sur: 'ホン', given: 'キルトン' });
  assert.deepEqual(SZ.nameYomi('남궁가나'), { sur: 'ナムクン', given: 'カナ' });
});
// 검수 D14-11 — 공휴일 목록: 2025-09-22 는 공휴일이 아니다 · 2028 추가 · 하반기에는 내년 목록이 있어야 한다
test('JP_HOLIDAYS: 연도별 개수(2025=19·2026=18·2027=17·2028=16) · 2028 요일 규칙 대조 · 내년 목록', () => {
  const by = y => SZ.JP_HOLIDAYS.filter(d => d.startsWith(y + '-')).length;
  assert.deepEqual([by(2025), by(2026), by(2027), by(2028)], [19, 18, 17, 16]);
  assert.equal(SZ.isJpHoliday('2025-09-22'), false);
  assert.equal(SZ.isJpHoliday('2025-09-23'), true);
  // 요일로 정해지는 2028 공휴일(成人の日·海の日·敬老の日·スポーツの日) — 날짜 계산으로 대조
  const nthMon = (y, m, n) => { const d = new Date(Date.UTC(y, m - 1, 1)); const off = (8 - d.getUTCDay()) % 7; return y + '-' + String(m).padStart(2, '0') + '-' + String(1 + off + (n - 1) * 7).padStart(2, '0'); };
  for (const [m, n] of [[1, 2], [7, 3], [9, 3], [10, 2]]) assert.ok(SZ.JP_HOLIDAYS.includes(nthMon(2028, m, n)), nthMon(2028, m, n));
  for (const d of ['2028-01-01', '2028-02-11', '2028-02-23', '2028-04-29', '2028-05-03', '2028-05-04', '2028-05-05', '2028-08-11', '2028-11-03', '2028-11-23']) assert.ok(SZ.JP_HOLIDAYS.includes(d), d);
  // 일요일과 겹치는 2028 공휴일이 없어 振替休日 은 없다
  assert.equal(SZ.JP_HOLIDAYS.filter(d => d.startsWith('2028-') && new Date(d + 'T00:00:00Z').getUTCDay() === 0).length, 0);
  assert.equal(SZ.partnerNightType('2028-01-09'), 'hi');   // 일요일이자 祝前日
  // 7월부터는 내년 목록이 있어야 한다(내년 예약이 가을에 열린다 — 内閣府 발표는 2월)
  const now = new Date(), need = now.getFullYear() + (now.getMonth() >= 6 ? 1 : 0);
  const last = Math.max(...SZ.JP_HOLIDAYS.map(d => Number(d.slice(0, 4))));
  assert.ok(last >= need, 'JP_HOLIDAYS 에 ' + need + '년 목록이 없습니다 — 内閣府 「国民の祝日」 발표를 보고 saizen-core.js 에 추가하세요');
});
// 검수 D14-9 — 지금까지 테스트가 없던 분기: 간지호텔 코스 판정(코스·카트·配車 공용)·방 구역 판정(방배정 필터·청소 화면 공용)
test('golfRows: 간지호텔 체류 중 평일=九重高原CC / 주말·공휴일=やまなみCC · usesYamanamiCC · isNonWorkday', () => {
  const gz = { accom: '간지호텔', dep: '2026-11-19', arr: '2026-11-24' };
  assert.deepEqual(SZ.golfRows(gz, false).map(r => [r.date.slice(5), r.course, r.note]), [
    ['11-19', 'やまなみCC', '入国日'], ['11-20', '九重高原CC', '+9Hサービス対象'], ['11-21', 'やまなみCC', '週末'],
    ['11-22', 'やまなみCC', '週末'], ['11-23', 'やまなみCC', '祝日']]);
  assert.equal(SZ.usesYamanamiCC(gz, false, '2026-11-20'), false);   // 평일 = 九重高原CC → 전기카트 사전신청 대상 아님
  assert.equal(SZ.usesYamanamiCC(gz, false, '2026-11-23'), true);    // 공휴일(勤労感謝の日)
  assert.equal(SZ.usesYamanamiCC(gz, false, '2026-11-24'), false);   // 인천편 귀국일 = 라운딩 없음
  assert.equal(SZ.usesYamanamiCC({ accom: '야마나미리조트', dep: '2026-11-19', arr: '2026-11-24' }, false, '2026-11-20'), true);
  assert.equal(SZ.isJpHoliday('2026-11-23'), true); assert.equal(SZ.isJpHoliday('2026-11-24'), false);
  assert.equal(SZ.isNonWorkday('2026-11-21'), true); assert.equal(SZ.isNonWorkday('2026-11-23'), true); assert.equal(SZ.isNonWorkday('2026-11-24'), false);
});
test('roomPlaceKeys·placeInScope: 호텔 층·소보 5호·별장·오프사이트 구역 판정', () => {
  const Y = '야마나미리조트';
  assert.deepEqual(SZ.roomPlaceKeys({ facility: Y, zone: '3층', room_no: '301' }), ['호텔']);
  assert.deepEqual(SZ.roomPlaceKeys({ facility: Y, zone: '소보별장', room_no: '5호-1' }), ['소보5동']);
  assert.deepEqual(SZ.roomPlaceKeys({ facility: Y, zone: '소보별장', room_no: '3호' }), ['소보별장']);
  assert.deepEqual(SZ.roomPlaceKeys({ facility: Y, zone: '아소별장', room_no: 'A-5' }), ['아소별장']);
  assert.deepEqual(SZ.roomPlaceKeys({ facility: Y, zone: '돔하우스', room_no: 'D1' }), ['돔하우스']);
  assert.deepEqual(SZ.roomPlaceKeys({ facility: '시즈노야도 료칸', zone: '', room_no: '吉祥' }), ['시즈노야도']);
  assert.deepEqual(SZ.roomPlaceKeys({ facility: '어딘가', zone: '' }), []); assert.deepEqual(SZ.roomPlaceKeys(null), []);
  assert.equal(SZ.placeInScope(['호텔'], []), true);                 // 선택 없음 = 「전체」
  assert.equal(SZ.placeInScope(['간지호텔'], new Set()), false);     // 「전체」는 오프사이트 제외
  assert.equal(SZ.placeInScope(['쿠주힐즈'], null), true);
  assert.equal(SZ.placeInScope(['간지호텔'], new Set(['간지호텔'])), true);
  assert.equal(SZ.placeInScope(['호텔'], ['소보별장', '소보5동']), false);
  assert.equal(SZ.placeInScope([], []), false);
});

// 29차 반박 검토(CORE-1·2) — 부정 낱말은 전기카트와 **같은 절** 안에서만 본다(쉼표·슬래시·탭·마침표·글머리표·다른 항목의 괄호에서 끊는다),
//  「취소 시 연락·대기 없이·취소 불가」 같은 단서는 부정이 아니다. 낱말 보강(미사용·제외·캔슬·なし·取消 …)·키워드 앞의 「취소:」·날짜가 낀 부정.
test('cartRemarkKind — 다른 항목의 부정 낱말·괄호 안 단서에는 걸리지 않는다(확정 유지)', () => {
  for (const s of ['전기카트 2대 신청(취소 시 연락)', '전기카트 신청, 싱글룸 대기', '전기카트 신청. 싱글룸 대기', '전기카트 신청 ／ 싱글룸 대기',
    '전기카트 신청\t석식 취소', '전기카트1대,캐디 불필요', '전기카트 2대, 조식 불가', '전기카트 신청(환불불가)', '전기카트 신청 (우천시 취소 가능)',
    '전기카트 1대 신청 (대기 없이 확정)', '전기카트 확정(대기 풀림)', '전기카트 1대, 싱글차지 없음', '전기카트 2대 신청(없음 시 가솔린)',
    '전기카트 신청, 송영 불필요', '電動カート申請、送迎不要', '電動カート2台（昼食不要）', '電動カート希望（キャンセル時は連絡）',
    '전기카트 2대 x 3일', '전기카트 신청 / 싱글룸 대기', '전기카트 2대 신청\n석식 1회 취소', '전기카트 2대 신청 (취소 불가)', '전기카트 변경 불가',
    '■전기카드 1개 신청 ■싱글룸 대기', '전기카트 신청 · 조식 불필요', '석식 취소 전기카트 신청', '전기카트 1대기준 4인', '전기카트 신청입니다.', '전기카트 사전신청 완료'])
  { assert.equal(SZ.cartRemarkKind(s), 'sure', s); assert.equal(SZ.wantsElectricCart(s), true, s); }
});
test('cartRemarkKind — 부정 낱말 보강·키워드 앞의 취소·날짜가 낀 부정·다음 줄의 취소는 재확인', () => {
  for (const s of ['전기카트 안 씀', '전기카트 미사용', '전기카트 제외', '전기카트 빼주세요', '전기카트 없이 진행', '전기카트 X', '전기카트 캔슬',
    '전기카트 cancel', '전기카트 CXL', '電動カートなし', '電動カート無し', '電動カート取消', '電動カート取り消し', '電動カート申込なし', '電動カート保留',
    '電動カート待ち', '電動カート未定', '電動カート不可', '취소: 전기카트', '(취소) 전기카트 2대', '취소된 전기카트', '전기카트\n취소',
    '전기카트 2대 신청 (11/12 대기)', '전기카트 신청 2026/11/12 취소', '전기카트(취소)', '전기카트 2대 (취소됨)', '전기카트 2대 신청 / 전기카트 1대 취소',
    '전기카트 취소', '전기카트 신청 안함', '전동카트 불필요', '전기카트는 필요 없습니다', '전기카트 신청 없이 진행', '전기카트 안됨', '전기카트 X 싱글룸 O'])
  { assert.equal(SZ.cartRemarkKind(s), 'maybe', s); assert.equal(SZ.wantsElectricCart(s), false, s); }
});
// 낱말만 있는 줄 다음 줄이 「신청 안 함」「사용 안 합니다」처럼 **신청·사용 + 부정**으로 시작하면 그 낱말의 부정이다(다음 줄이 부정 낱말로 바로 시작하는 꼴만 보던 것 보강).
//   다음 줄의 신청 내용 뒤에 붙은 단서(「신청 2대 (우천 시 취소)」)는 부정이 아니다.
test('cartRemarkKind — 낱말만 있는 줄 + 다음 줄 「신청 안 함」은 재확인 · 다음 줄의 신청 내용은 그대로 신청', () => {
  for (const s of ['전기카트\n신청 안 함', '전기카트\n- 사용 안 합니다', '전기카트:\n신청은 없습니다', '전동카트\n이용 안함', '電動カート\n申込なし', '電動カート\n利用しません'])
  { assert.equal(SZ.cartRemarkKind(s), 'maybe', s); assert.equal(SZ.wantsElectricCart(s), false, s); }
  for (const s of ['전기카트\n신청합니다', '전기카트\n신청 2대 (우천 시 취소)', '전기카트\n2대 신청', '전기카트\n사용 예정 / 석식 취소', '電動カート\n利用希望'])
  { assert.equal(SZ.cartRemarkKind(s), 'sure', s); assert.equal(SZ.wantsElectricCart(s), true, s); }
});
// 29차 검증 반영 — 구분자 **바로 뒤**가 부정 낱말이면 그 카트의 것(「전기카트 2대, 취소」) · 괄호 뒤로 이어지는 부정(「전기카트(2대) 취소」) ·
//   괄호 안의 날짜·수량 + 부정(「(2일차 취소)」「(입국일 제외)」「(1대만 취소)」) · 숫자 사이 쉼표는 끊는 자리가 아니다(「1,2일차 취소」).
//   다른 항목의 괄호(「（昼食不要）」「(싱글룸 대기)」)·취소 규정/수수료 얘기·단서(「취소 시 연락」)는 신청 그대로.
test('cartRemarkKind — 구분자 바로 뒤의 부정·괄호 뒤/괄호 안의 부분 취소는 재확인 · 다른 항목의 괄호·취소 규정은 신청 그대로', () => {
  for (const s of ['전기카트 2대, 취소', '전기카트 신청. 취소', '전기카트 2대 / 취소', '전기카트 신청; 취소', '전기카트 2대\t취소', '전기카트 2대 신청\n취소',
    '전기카트(2대) 취소', '전기카트 2대(취소)', '전기카트 11/13 취소', '전기카트 2대 (11/12 대기)', '전기카트 1,2일차 취소', '전기카트 취소시켜 주세요',
    '전기카트 2대 (입국일 제외)', '전기카트 2대 (2일차 취소)', '전기카트 2대 (1대만 취소)', '전기카트 2대 신청 (마지막날 제외)', '電動カート2台（最終日なし）',
    '전기카트 취소 수수료 발생, 취소', '전기카트 2대 신청\n- 취소'])
  { assert.equal(SZ.cartRemarkKind(s), 'maybe', s); assert.equal(SZ.wantsElectricCart(s), false, s); }
  for (const s of ['전기카트 2대, 취소 시 연락', '전기카트 2대. 취소 불가', '電動カート2台（昼食不要）', '전기카트 신청 (싱글룸 대기)', '전기카트 2대 신청\n취소 규정: 3일 전',
    '전기카트 2대 신청 / 취소 수수료 없음', '전기카트 2대, 캔슬차지 있음', '전기카트 신청(환불불가) 2대', '전기카트 2대 신청\n■취소료 안내', '電動カート2台、キャンセル料あり',
    '전기카트 2대 신청 (석식 1회 취소)', '전기카트 2대 (4인승 불가 시 2대)', '전기카트 2대 신청\n싱글룸 대기', '전기카트 2대 신청\n대기 없이 확정',
    // 끊긴 자리 뒤가 부정 낱말로 시작해도 **긴 문장**이면 다른 얘기다(실제 비고의 꼴: 다음 줄이 「취소분 나오면 호텔 숙박 희망」)
    '전기카트 1대 신청\n취소분 나오면 호텔숙박 희망합니다.', '전기카트 1대 신청, 취소분 나오면 호텔 숙박 희망', '전기카트 2대 신청\n대기 중인 싱글룸 확정되면 연락 바랍니다'])
  { assert.equal(SZ.cartRemarkKind(s), 'sure', s); assert.equal(SZ.wantsElectricCart(s), true, s); }
});
// 29차 반박 검토(DATE-2·5) — 받침 ng·n·l·m 뒤의 w(원·완)는 다음 음절의 첫소리가 아니다 / ㄷ·ㅌ + ㅑㅕㅛㅠ 는 テャ·テュ·テョ
test('nameYomiEn: DONGWON → ドンウォン(グォン 이 아니다) · 권(GWON·KWON)은 그대로', () => {
  assert.equal(SZ.nameYomiEn('KIM DONGWON').given, 'ドンウォン');
  assert.equal(SZ.nameYomiEn('KIM DONG WON').given, 'ドンウォン');
  assert.equal(SZ.nameYomiEn('LEE JUNGWON').given, 'ジュンウォン');
  assert.equal(SZ.nameYomiEn('PARK SEUNGWAN').given, 'スンワン');
  assert.equal(SZ.nameYomiEn('KIM JINWON').given, 'ジンウォン');
  assert.equal(SZ.nameYomiEn('KIM GILWON').given, 'ギルウォン');
  assert.equal(SZ.nameYomiEn('KIM DONGWOOK').given, 'ドンウク');          // WOO 는 종전대로
  assert.equal(SZ.nameYomiEn('KWON GILDONG').sur, 'クォン');             // 첫소리 kw·gw 는 그대로
  assert.equal(SZ.nameYomiEn('GWON GILDONG').sur, 'グォン');
  assert.equal(SZ.nameYomiEn('KIM MINGWAN').given, 'ミングァン');         // i + ngw 는 민관(n + gw)
  assert.equal(SZ.nameYomiEn('KIM MINGYU').given, 'ミンギュ');
  assert.equal(SZ.nameYomiEn('HWANG GILDONG').sur, 'ファン');
});
test('hangulToKana: ㄷ·ㅌ + ㅑㅕㅛㅠ = テャ·テョ·テュ(ティュ 가 아니다) · 디·티·두·투 는 그대로', () => {
  assert.equal(SZ.hangulToKana('튜'), 'テュ');
  assert.equal(SZ.hangulToKana('매튜'), 'メテュ');
  assert.equal(SZ.hangulToKana('듀'), 'テュ');
  assert.equal(SZ.hangulToKana('탸'), 'テャ');
  assert.equal(SZ.hangulToKana('툐'), 'テョ');
  assert.equal(SZ.hangulToKana('티'), 'ティ');
  assert.equal(SZ.hangulToKana('투'), 'トゥ');
  assert.equal(SZ.hangulToKana('규'), 'キュ');
});
// 29차 반박 검토(DATA-4) — 대표 줄 고르기는 한 규칙: 예약의 대표고객과 이름(띄어쓰기 무시)이 같은 줄 가운데 첫 줄, 없으면 첫 줄
test('repIndex — 대표고객 이름과 같은 첫 줄 · 없으면 0', () => {
  const L = n => n.map(x => ({ name_kr: x }));
  assert.equal(SZ.repIndex(L(['가가가', '나다라', '다다다']), '나다라'), 1);
  assert.equal(SZ.repIndex(L(['바바바', '마바사', '마바사']), '마바사'), 1);      // 같은 이름이 여럿이면 그중 첫 줄(이름이 다른 첫 줄이 아니다)
  assert.equal(SZ.repIndex(L(['사사사', '아자차']), '아 자차'), 1);               // 띄어쓰기만 다른 이름
  assert.equal(SZ.repIndex(L(['라라라', '마마마']), '없는이'), 0);
  assert.equal(SZ.repIndex(L(['라라라', '마마마']), ''), 0);
  assert.equal(SZ.repIndex(L(['라라라']), null), 0);
  assert.equal(SZ.repIndex([], '가가가'), 0);
  assert.equal(SZ.repIndex(['가가가', '나 다라'], '나다라'), 1);                  // 이름 문자열 배열도 받는다
  assert.equal(SZ.teamGroupLabel('DAあ-Y#30020001'), 'DAあ-Y');                  // 묶음 이름의 표시(끝의 #행사번호를 뗀다)
  assert.equal(SZ.teamGroupLabel('DAあ-Y'), 'DAあ-Y');
  assert.equal(SZ.teamGroupLabel(null), '');
});

test('hangulToKana: ㄷ·ㅌ + ㅘㅙㅚㅝㅞㅟ 는 다른 행과 같은 합성(ウ단 + 작은 모음) — 되 = トゥェ(괴 = クェ 와 같은 식)', () => {
  assert.equal(SZ.hangulToKana('되'), 'トゥェ');
  assert.equal(SZ.hangulToKana('뒤'), 'トゥィ');
  assert.equal(SZ.hangulToKana('둬'), 'トゥォ');
  assert.equal(SZ.hangulToKana('괴'), 'クェ');
  assert.equal(SZ.hangulToKana('권'), 'クォン');
});
