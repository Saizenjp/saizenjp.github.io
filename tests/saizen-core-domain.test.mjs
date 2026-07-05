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
