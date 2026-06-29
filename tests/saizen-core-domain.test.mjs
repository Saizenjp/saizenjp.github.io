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
  assert.equal(SZ.accomRate('시즈노야도 료칸'), 17000);
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
