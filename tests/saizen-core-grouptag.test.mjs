/* ============================================================================
 * saizen-core-grouptag.test.mjs — 운영팀 묶음 태그 규칙(대표코드 기준)
 * ----------------------------------------------------------------------------
 *  팀단위 = base+번호(DRな-Y1/Y2) · 개인(네임택) = 연속 개인번호(DRな-1Y..)
 *  대표 먼저 정렬. 틀리면 인쇄 태그가 어긋나므로 회귀 방지.
 * ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SZ = require('../ops/assets/saizen-core.js');

test('teamTagN: 시설문자 뒤 번호(팀단위)', () => {
  const base = SZ.tagStripSeq('DRな-1Y');          // "DRな-Y"
  assert.equal(base, 'DRな-Y');
  assert.equal(SZ.teamTagN(base, 1), 'DRな-Y1');    // 대표
  assert.equal(SZ.teamTagN(base, 2), 'DRな-Y2');
  assert.equal(SZ.teamTagN(base, 3), 'DRな-Y3');
  assert.equal(SZ.teamTagN(base, 0), 'DRな-Y');     // 단독(번호 없음)
});

test('personTagN: 시설문자 앞 번호(네임택 연속)', () => {
  const base = SZ.tagStripSeq('DRな-1Y');
  assert.equal(SZ.personTagN(base, 1), 'DRな-1Y');
  assert.equal(SZ.personTagN(base, 8), 'DRな-8Y');
  assert.equal(SZ.personTagN(base, 0), 'DRな-Y');   // 번호 없음 → base
});

test('personTagN: F풀(접미 없는) 코드도 안전', () => {
  // "FAあ" 는 시설문자 매칭 안 됨 → -n 접미
  assert.equal(SZ.personTagN('FAあ', 2), 'FAあ-2');
});

test('orderGroup: 대표 먼저, 그다음 dep→event_seq', () => {
  const teams = [
    { event_seq: '300', dep: '2026-07-10' },
    { event_seq: '100', dep: '2026-07-09' },   // 대표
    { event_seq: '200', dep: '2026-07-09' },
  ];
  const ordered = SZ.orderGroup(teams, '100');
  assert.deepEqual(ordered.map(t => t.event_seq), ['100', '200', '300']);
});

test('orderGroup: 원본 배열 불변', () => {
  const teams = [{ event_seq: '2', dep: 'b' }, { event_seq: '1', dep: 'a' }];
  const before = teams.map(t => t.event_seq).join(',');
  SZ.orderGroup(teams, '1');
  assert.equal(teams.map(t => t.event_seq).join(','), before);
});
