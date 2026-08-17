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
test('nameYomiEn: 영문 철자대로 후리가나(강병욱 KANG BYONG UK → カン/ビョンウク)', () => {
  assert.deepEqual(SZ.nameYomiEn('KANG BYONG UK'), { sur: 'カン', given: 'ビョンウク' });
  // 유성 자음: BONG→ボン·JAE→ジェ·DONG→ドン·GYU→ギュ (한글기반 무성음 아님)
  assert.equal(SZ.nameYomiEn('JEONG SANG DONG').given, 'サンドン');
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

test('손익 구간 — 손익분기 가동률·공헌이익·가동률 1%p 효과', () => {
  assert.equal(SZ.contribPerNight(), 12054);                       // ¥15,154 − ¥3,100
  assert.ok(Math.abs(SZ.bepOccupancy() - 75.9) < 0.15);            // 자체 침대 248 · 영업 275일
  assert.ok(Math.abs(SZ.profitPerPoint() - 8_220_828) < 1000);     // 1%p = 연 822만엔
});

test('손익 구간 — 가동률별 손익과 기간 배분', () => {
  const at = (o, d) => SZ.plAtOccupancy(o, d);
  assert.ok(at(60).profit < 0);                                    // 60% = 적자
  assert.ok(Math.abs(at(76).profit) < 2_000_000);                   // 76% ≈ 손익분기
  assert.ok(at(81).profit > 0 && at(90).profit > at(81).profit);    // 오를수록 이익 증가
  const m = at(81, 30);
  assert.equal(Math.round(m.paxNights), 6026);                     // 월 30일 · 81%
  assert.equal(Math.round(m.fixed), Math.round(624_000_000 * 30 / 275));  // 고정비 일수 비례
  assert.equal(Math.round(m.contribution - m.fixed), Math.round(m.profit));
});
