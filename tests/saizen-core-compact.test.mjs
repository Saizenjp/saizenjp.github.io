// 2027 컴팩트 트윈 = 컴팩트 예약에만(Min 2026-11-28 「컴팩트는 컴팩트 예약에만 쓰게 바꿔줘 현지 비고란에 기재할거야」)
//  현지 비고 「컴팩트」(팀 전원) · 「컴팩트 N실」(N실만) · 엠클릭 룸타입 「컴팩트」(팀 전원) — 입국일 2027-01-01 이후만(2026 예약은 종전 규칙)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../ops/assets/saizen-core.js');
const D27 = '2027-03-05', D26 = '2026-12-20';

test('compactRequest — 2026 입국은 언제나 null(종전 규칙)', () => {
  assert.equal(C.compactRequest('컴팩트 2실', '컴팩트', D26), null);
  assert.equal(C.compactRequest('컴팩트', '', ''), null);
});

test('compactRequest — 현지 비고 「컴팩트」 = 팀 전원 · 「컴팩트 N실」 = N실', () => {
  assert.deepEqual(C.compactRequest('컴팩트', '', D27), { kind: 'all', src: 'remark' });
  assert.deepEqual(C.compactRequest('컴팩트트윈 배정 요청', '', D27), { kind: 'all', src: 'remark' });
  assert.deepEqual(C.compactRequest('컴팩트 1실', '', D27), { kind: 'n', n: 1, src: 'remark' });
  assert.deepEqual(C.compactRequest('스탠다드1 / 컴팩트트윈 2실', '', D27), { kind: 'n', n: 2, src: 'remark' });
  assert.deepEqual(C.compactRequest('콤팩트 3개', '', D27), { kind: 'n', n: 3, src: 'remark' });
  assert.deepEqual(C.compactRequest('コンパクト 1室', '', D27), { kind: 'n', n: 1, src: 'remark' });
});

test('compactRequest — 엠클릭 룸타입 「컴팩트」 = 팀 전원 · 비고에 수량이 있으면 비고가 먼저', () => {
  assert.deepEqual(C.compactRequest('', '컴팩트', D27), { kind: 'all', src: 'roomtype' });
  assert.deepEqual(C.compactRequest('컴팩트 1실', '컴팩트', D27), { kind: 'n', n: 1, src: 'remark' });
  assert.equal(C.compactRequest('', '트윈', D27), null);
  assert.equal(C.compactRequest('싱글 1실', '싱글,트윈', D27), null);
});

test('compactRequest — 「컴팩트 불가·없음·취소」는 요청이 아니다 · 0실은 요청 아님', () => {
  assert.equal(C.compactRequest('컴팩트 불가', '', D27), null);
  assert.equal(C.compactRequest('컴팩트 없음', '', D27), null);
  assert.equal(C.compactRequest('컴팩트트윈 취소', '', D27), null);
  assert.equal(C.compactRequest('컴팩트 0실', '', D27), null);
});

test('compactSplit — 전원: 모든 짝이 컴팩트 · N실: 일반 짝부터, 모자라면 회원 짝(뒤에서부터)', () => {
  const mp = [['m1', 'm2'], ['m3', 'g1']], gp = [['g2', 'g3'], ['g4', 'g5']];
  assert.deepEqual(C.compactSplit(mp, gp, { kind: 'all' }), { compact: [...mp, ...gp], member: [], general: [] });
  assert.deepEqual(C.compactSplit(mp, gp, { kind: 'n', n: 1 }), { compact: [['g2', 'g3']], member: mp, general: [['g4', 'g5']] });
  assert.deepEqual(C.compactSplit(mp, gp, { kind: 'n', n: 3 }), { compact: [['g2', 'g3'], ['g4', 'g5'], ['m3', 'g1']], member: [['m1', 'm2']], general: [] });
  assert.deepEqual(C.compactSplit(mp, gp, { kind: 'n', n: 9 }), { compact: [['g2', 'g3'], ['g4', 'g5'], ['m3', 'g1'], ['m1', 'm2']], member: [], general: [] });
  assert.deepEqual(C.compactSplit(mp, gp, null), { compact: [], member: mp, general: gp });
});

// 검토 2026-11-28: 확실히 읽히는 표기만 자동, 애매하면 unsure(팀 보류 — 사람이 비고를 본다). 전원으로 넘겨짚지 않는다.
test('compactRequest — 부정·변경 표현은 unsure(보류) · 바로 붙은 「불가·없음·아님·취소」만 요청 아님', () => {
  for (const t of ['컴팩트 배정 불가', '컴팩트는 불가', '컴팩트 아닌 스탠다드 트윈으로', '컴팩트 제외', '컴팩트 말고 트윈',
    '컴팩트룸 안됨', '컴팩트→트윈 변경', '트윈으로 변경(기존 컴팩트)', '컴팩트 1실 불가', '컴팩트 1실 취소', '컴팩트 요청 없음'])
    assert.deepEqual(C.compactRequest(t, '', D27), { kind: 'unsure', src: 'remark' }, t);
  assert.equal(C.compactRequest('컴팩트 불가', '', D27), null);
  assert.equal(C.compactRequest('컴팩트X', '', D27), null);
});

test('compactRequest — 수량 표기 변형 · 숫자가 애매하면 unsure', () => {
  assert.deepEqual(C.compactRequest('컴팩트트윈으로 2실', '', D27), { kind: 'n', n: 2, src: 'remark' });
  assert.deepEqual(C.compactRequest('컴팩트 객실 2실', '', D27), { kind: 'n', n: 2, src: 'remark' });
  assert.deepEqual(C.compactRequest('2실 컴팩트', '', D27), { kind: 'n', n: 2, src: 'remark' });
  assert.deepEqual(C.compactRequest('컴팩트 (2실)', '', D27), { kind: 'n', n: 2, src: 'remark' });
  assert.deepEqual(C.compactRequest('컴펙트 1실', '', D27), { kind: 'n', n: 1, src: 'remark' });
  for (const t of ['컴팩트 x2', '컴팩트 2명', '컴팩트트윈 2명', '컴팩트 1실 / 컴팩트 2실', '컴팩트 2박 3인', '트윈1 컴팩트'])
    assert.deepEqual(C.compactRequest(t, '', D27), { kind: 'unsure', src: 'remark' }, t);
  // Min 2026-11-28 「트윈1,컴팩트1 이렇게면 각각 1실로 읽으면 돼」 — 단위 없는 숫자도 실 수, 트윈·스탠다드 수는 따로 둔다
  for (const [t, n] of [['트윈1,컴팩트1', 1], ['트윈1 컴팩트1', 1], ['트윈 2, 컴팩트 1', 1], ['컴팩트 2', 2], ['스탠다드1/컴팩트트윈2', 2], ['컴팩트1 트윈1', 1]])
    assert.deepEqual(C.compactRequest(t, '', D27), { kind: 'n', n, src: 'remark' }, t);
  assert.deepEqual(C.compactRequest('조식 7시 / 컴팩트 / 늦은 체크인', '', D27), { kind: 'all', src: 'remark' });
});

test('compactRequest — 룸타입은 「컴팩트」 단독만 전원, 다른 타입과 섞이면 unsure', () => {
  assert.deepEqual(C.compactRequest('', '컴팩트트윈', D27), { kind: 'all', src: 'roomtype' });
  assert.deepEqual(C.compactRequest('', '트윈,컴팩트', D27), { kind: 'unsure', src: 'roomtype' });
  assert.equal(C.compactRequest('컴팩트 불가', '컴팩트', D27), null);
});
