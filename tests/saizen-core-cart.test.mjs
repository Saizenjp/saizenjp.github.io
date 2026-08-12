// 카트 배정 규칙 — 전기(사전신청)/가솔린 자동 분배
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SZ = require('../ops/assets/saizen-core.js');

test('전기카트 사전신청 = 현지전달비고 표기로 판정', () => {
  const yes = [
    '전기카트 사전신청 2대',
    '전동카트 신청',
    '電動カート 事前申請',
    'EV카트 요청',
    '특식 / 전기 카트 사전신청',
  ];
  yes.forEach(s => assert.equal(SZ.wantsElectricCart(s), true, s));

  const no = ['', null, undefined, '온천 사전신청', '별관 욕조 준비', '카트 없음', '가솔린 카트'];
  no.forEach(s => assert.equal(SZ.wantsElectricCart(s), false, String(s)));
});

test('2인 예약팀 = 가솔린 2인승 1대', () => {
  assert.deepEqual(SZ.cartPlan(2, false), { code: 'gas2', qty: 1 });
  assert.deepEqual(SZ.cartPlan(1, false), { code: 'gas2', qty: 1 });
});

test('3인 이상 = 가솔린 4인승, 4명당 1대', () => {
  assert.deepEqual(SZ.cartPlan(3, false), { code: 'gas4', qty: 1 });
  assert.deepEqual(SZ.cartPlan(4, false), { code: 'gas4', qty: 1 });
  assert.deepEqual(SZ.cartPlan(5, false), { code: 'gas4', qty: 2 });
  assert.deepEqual(SZ.cartPlan(8, false), { code: 'gas4', qty: 2 });
  assert.deepEqual(SZ.cartPlan(9, false), { code: 'gas4', qty: 3 });
});

test('전기 신청팀은 인원수와 무관하게 전기카트로', () => {
  assert.deepEqual(SZ.cartPlan(2, true), { code: 'electric', qty: 1 });
  assert.deepEqual(SZ.cartPlan(4, true), { code: 'electric', qty: 1 });
  assert.deepEqual(SZ.cartPlan(5, true), { code: 'electric', qty: 2 });
});

test('인원 0/미상은 배정 없음', () => {
  assert.equal(SZ.cartPlan(0, false), null);
  assert.equal(SZ.cartPlan(null, true), null);
});

test('보유 카트 번호 목록 파싱 — 범위·나열·접두', () => {
  assert.deepEqual(SZ.parseCartNos('1-5'), ['1', '2', '3', '4', '5']);
  assert.deepEqual(SZ.parseCartNos('1,2,5-7'), ['1', '2', '5', '6', '7']);
  assert.deepEqual(SZ.parseCartNos('E1-E3'), ['E1', 'E2', 'E3']);
  assert.deepEqual(SZ.parseCartNos('01-03'), ['01', '02', '03']);
  assert.deepEqual(SZ.parseCartNos('3,3,1'), ['3', '1'], '중복 제거');
  assert.equal(SZ.parseCartNos('1-36').length, 36);
  assert.deepEqual(SZ.parseCartNos(''), []);
});

test('번호 자동 배분 — 순서대로, 부족하면 있는 만큼만', () => {
  const got = SZ.allocCartNos('1-5', [{ key: 'A', qty: 2 }, { key: 'B', qty: 1 }, { key: 'C', qty: 3 }]);
  assert.deepEqual(got.A, ['1', '2']);
  assert.deepEqual(got.B, ['3']);
  assert.deepEqual(got.C, ['4', '5'], '풀 부족분은 빈칸(현장 조정)');
  assert.deepEqual(SZ.allocCartNos([], [{ key: 'A', qty: 2 }]).A, []);
});

test('전기 신청팀은 라운딩 일수 전부에 분배된다(golfRows 기준)', () => {
  // ICN 팀: 입국일부터 라운딩, 귀국일엔 없음
  const team = { dep: '2026-08-09', arr: '2026-08-13', accom: '야마나미리조트' };
  const days = SZ.golfRows(team, false).map(r => r.date);
  assert.ok(days.length >= 3, '라운딩일이 여러 날');
  assert.ok(!days.includes('2026-08-13'), 'ICN 귀국일은 라운딩 없음');
  const plan = SZ.cartPlan(4, SZ.wantsElectricCart('전기카트 사전신청'));
  const total = days.length * plan.qty;
  assert.equal(plan.code, 'electric');
  assert.equal(total, days.length, '하루 1대 × 라운딩 일수');
});

test('티오프 슬롯 — 6:50 시작 7분 간격 8:42 마지막 = 17조', () => {
  const s = SZ.teeSlots();
  assert.equal(s.length, 17);
  assert.equal(s[0], '06:50');
  assert.equal(s[1], '06:57');
  assert.equal(s[10], '08:00');
  assert.equal(s[s.length - 1], '08:42');
  assert.deepEqual(SZ.teeSlots('07:00', 10, '07:30'), ['07:00', '07:10', '07:20', '07:30']);
});

test('팀 인원 → 조 나누기(4명 정원, 균등)', () => {
  assert.deepEqual(SZ.splitTeam(2), [2]);
  assert.deepEqual(SZ.splitTeam(4), [4]);
  assert.deepEqual(SZ.splitTeam(5), [3, 2]);
  assert.deepEqual(SZ.splitTeam(6), [3, 3]);
  assert.deepEqual(SZ.splitTeam(7), [4, 3]);
  assert.deepEqual(SZ.splitTeam(8), [4, 4]);
  assert.deepEqual(SZ.splitTeam(9), [3, 3, 3]);
  assert.deepEqual(SZ.splitTeam(0), []);
});
