// 레스토랑·연회장 테이블 자동 배정(SQL 197, Min 2026-11-26 「기본값대로 1단계 진행해」)
//  기본값: 석식만 · 체류 내내 같은 테이블(전날 테이블 이어 받기) · 정원 초과는 경고만(자동 배정은 넘기지 않는다) · 묶음(운영팀)은 한 단위
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../ops/assets/saizen-core.js');

const T = [
  { id: 1, code: 'R1', venue: 'restaurant', seats: 4, sort: 1 },
  { id: 2, code: 'R2', venue: 'restaurant', seats: 4, sort: 2 },
  { id: 3, code: 'R3', venue: 'restaurant', seats: 6, sort: 3 },
  { id: 4, code: 'R4', venue: 'restaurant', seats: 8, sort: 4, active: false },
  { id: 5, code: 'C1', venue: 'convention', seats: 10, sort: 1 }];
const pick = r => r.assign.map(a => `${a.seq}:${a.table_id}`).sort();

test('dinnerTablePlan — 인원이 많은 단위부터, 들어가는 가장 작은 빈 테이블 · 묶음은 팀 모두 같은 테이블 · 사용 안 함 테이블 제외', () => {
  const r = C.dinnerTablePlan({ tables: T, units: [
    { key: 'a', seqs: [11], pax: 2, venue: 'restaurant' },
    { key: 'b', seqs: [21, 22], pax: 5, venue: 'restaurant' },     // 묶음 2팀 5명 → R3(6)
    { key: 'c', seqs: [31], pax: 8, venue: 'convention' }] });
  assert.deepEqual(pick(r), ['11:1', '21:3', '22:3', '31:5']);
  assert.deepEqual(r.unplaced, []);
});

test('dinnerTablePlan — 한 테이블로 모자라면 빈 테이블을 큰 것부터 합친다 · 그래도 모자라면 배정하지 않고 알린다', () => {
  const r = C.dinnerTablePlan({ tables: T, units: [{ key: 'a', seqs: [11], pax: 9, venue: 'restaurant' }] });
  assert.deepEqual(pick(r), ['11:1', '11:3']);                      // 6(R3) + 4(R1 — 크기가 같으면 순서가 앞인 테이블)
  const r2 = C.dinnerTablePlan({ tables: T, units: [{ key: 'a', seqs: [11], pax: 20, venue: 'restaurant' }] });
  assert.deepEqual(r2.assign, []); assert.deepEqual(r2.unplaced, [{ key: 'a', reason: 'noTable' }]);
});

test('dinnerTablePlan — 오늘 이미 배정된 팀은 건드리지 않고 그 테이블은 쓴 것으로 · 장소 미지정은 알린다', () => {
  const r = C.dinnerTablePlan({ tables: T, taken: { 99: [3] }, units: [
    { key: 'x', seqs: [99], pax: 6, venue: 'restaurant' },
    { key: 'a', seqs: [11], pax: 5, venue: 'restaurant' },          // R3 는 이미 사용 → 4+4 로
    { key: 'n', seqs: [41], pax: 2, venue: '' }] });
  assert.deepEqual(pick(r), ['11:1', '11:2']);
  assert.deepEqual(r.unplaced, [{ key: 'n', reason: 'noVenue' }]);
});

test('dinnerTablePlan — 연박 팀은 전날 테이블을 먼저 이어 받는다(같은 장소·비어 있고·좌석이 맞을 때)', () => {
  const units = [{ key: 'big', seqs: [11], pax: 4, venue: 'restaurant' }, { key: 'stay', seqs: [21], pax: 3, venue: 'restaurant' }];
  const r = C.dinnerTablePlan({ tables: T, units, prev: { 21: [1] } });
  assert.deepEqual(pick(r), ['11:2', '21:1']);                      // 인원이 많은 big 이 R1 을 먼저 잡지 않는다
  const r2 = C.dinnerTablePlan({ tables: T, units: [{ key: 'stay', seqs: [21], pax: 5, venue: 'restaurant' }], prev: { 21: [1] } });
  assert.deepEqual(pick(r2), ['21:3']);                             // 전날 테이블(4석)이 모자라면 새로
  const r3 = C.dinnerTablePlan({ tables: T, units: [{ key: 'stay', seqs: [21], pax: 3, venue: 'convention' }], prev: { 21: [1] } });
  assert.deepEqual(pick(r3), ['21:5']);                             // 오늘 장소가 다르면 이어 받지 않는다
});

test('dinnerTableUse — 테이블별 사용 인원(묶음·여러 테이블은 좌석 비율로 나눠 세지 않고 단위 인원을 테이블 수로) · 정원 초과 표시', () => {
  const use = C.dinnerTableUse(T, [{ seq: 11, table_id: 1 }, { seq: 21, table_id: 1 }, { seq: 31, table_id: 2 }, { seq: 31, table_id: 3 }], { 11: 3, 21: 2, 31: 8 });
  assert.deepEqual(use[1], { used: 5, seats: 4, over: true, seqs: [11, 21] });
  assert.deepEqual(use[2], { used: 4, seats: 4, over: false, seqs: [31] });
  assert.deepEqual(use[3], { used: 4, seats: 6, over: false, seqs: [31] });
});

// Min 2026-11-26 「8인 이상 팀은 컨벤션홀로 우선 배정돼 · 특식 주문팀은 테이블 위치도 조금 좋은 곳으로」
const T2 = [
  { id: 1, code: 'R1', venue: 'restaurant', seats: 4, sort: 1 },
  { id: 2, code: 'R2', venue: 'restaurant', seats: 4, sort: 2, prime: true },
  { id: 3, code: 'R3', venue: 'restaurant', seats: 6, sort: 3 },
  { id: 4, code: 'R4', venue: 'restaurant', seats: 6, sort: 4, prime: true },
  { id: 5, code: 'C1', venue: 'convention', seats: 10, sort: 1 }];

test('dinnerTablePlan — 장소 후보(venues)를 앞에서부터: 8인 이상은 컨벤션 먼저, 자리가 없으면 레스토랑', () => {
  const r = C.dinnerTablePlan({ tables: T2, units: [
    { key: 'a', seqs: [11], pax: 9, venues: ['convention', 'restaurant'] },
    { key: 'b', seqs: [21], pax: 8, venues: ['convention', 'restaurant'] }] });
  assert.deepEqual(pick(r), ['11:5', '21:1', '21:3']);              // b 는 컨벤션이 차서 레스토랑(일반 자리 6+4 — 좋은 자리는 아껴 둔다)
  assert.deepEqual(r.unplaced, []);
});

test('dinnerTablePlan — 특식 팀이 좋은 자리(prime)를 먼저 · 일반 팀은 좋은 자리를 피한다', () => {
  const r = C.dinnerTablePlan({ tables: T2, units: [
    { key: 'n', seqs: [11], pax: 4, venue: 'restaurant' },
    { key: 's', seqs: [21], pax: 3, venue: 'restaurant', special: true }] });
  assert.deepEqual(pick(r), ['11:1', '21:2']);
  const r2 = C.dinnerTablePlan({ tables: T2, units: [{ key: 'n', seqs: [11], pax: 6, venue: 'restaurant' }] });
  assert.deepEqual(pick(r2), ['11:3']);                             // 6석 일반이 있으면 6석 좋은 자리는 남긴다
  const r3 = C.dinnerTablePlan({ tables: T2, taken: { 99: [3] }, units: [{ key: 'n', seqs: [11], pax: 6, venue: 'restaurant' }] });
  assert.deepEqual(pick(r3), ['11:4']);                             // 일반이 모자라면 나눠 앉히기보다 좋은 자리 한 테이블
});

test('dinnerTablePlan — 특식 팀은 전날 테이블보다 좋은 자리가 먼저(전날도 좋은 자리면 그대로) · 일반 연박은 그대로 이어 받는다', () => {
  const r = C.dinnerTablePlan({ tables: T2, prev: { 21: [1] }, units: [{ key: 's', seqs: [21], pax: 3, venue: 'restaurant', special: true }] });
  assert.deepEqual(pick(r), ['21:2']);
  const r2 = C.dinnerTablePlan({ tables: T2, prev: { 21: [4] }, units: [{ key: 's', seqs: [21], pax: 3, venue: 'restaurant', special: true }] });
  assert.deepEqual(pick(r2), ['21:4']);
  const r3 = C.dinnerTablePlan({ tables: T2, prev: { 21: [2] }, units: [{ key: 'n', seqs: [21], pax: 3, venue: 'restaurant' }] });
  assert.deepEqual(pick(r3), ['21:2']);                             // 연박 일반 팀이 어제 좋은 자리였으면 오늘도 그대로(옮기지 않는다)
  const r4 = C.dinnerTablePlan({ tables: T2, prev: { 21: [2] }, units: [
    { key: 'n', seqs: [21], pax: 3, venue: 'restaurant' }, { key: 's', seqs: [31], pax: 4, venue: 'restaurant', special: true }] });
  assert.deepEqual(pick(r4), ['21:2', '31:4']);                     // 특식 팀은 남은 좋은 자리로 — 연박 팀을 밀어내지 않는다
});

// 검토 2026-11-26: 그날 자동 줄을 매번 다시 계산(수기 줄은 그대로) — 지금 자동 테이블(cur)은 유지하되, 연박(전날 테이블)이 먼저
test('dinnerTablePlan — 다시 계산해도 지금 자동 테이블(cur)을 유지한다 · 전날 테이블이 비면 그쪽으로 이어 붙인다', () => {
  const units = [{ key: 'a', seqs: [11], pax: 3, venue: 'restaurant' }, { key: 'b', seqs: [21], pax: 4, venue: 'restaurant' }];
  assert.deepEqual(pick(C.dinnerTablePlan({ tables: T2, units })), ['11:3', '21:1']);   // 처음 계산
  const r = C.dinnerTablePlan({ tables: T2, units, cur: { 11: [1], 21: [3] } });
  assert.deepEqual(pick(r), ['11:1', '21:3']);                      // 크기 순 규칙과 달라도 지금 자리를 바꾸지 않는다
  const r2 = C.dinnerTablePlan({ tables: T2, units, cur: { 11: [1], 21: [3] }, prev: { 21: [1] } });
  assert.deepEqual(pick(r2), ['11:3', '21:1']);                     // b 는 어제 R1 → 오늘도 R1(지금 자리보다 먼저), a 는 남은 일반 자리
  const r3 = C.dinnerTablePlan({ tables: T2, units: [{ key: 's', seqs: [31], pax: 3, venue: 'restaurant', special: true }], cur: { 31: [1] } });
  assert.deepEqual(pick(r3), ['31:2']);                             // 특식이 생기면 좋은 자리로
  const r4 = C.dinnerTablePlan({ tables: T2, units: [{ key: 'a', seqs: [11], pax: 5, venue: 'restaurant' }], cur: { 11: [1] } });
  assert.deepEqual(pick(r4), ['11:3']);                             // 인원이 늘어 지금 자리가 모자라면 다시
});
