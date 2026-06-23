/* ============================================================================
 * saizen-core.test.mjs — 공유 도메인 모듈 단위 테스트
 * ----------------------------------------------------------------------------
 *  · node:test(빌트인) 사용 → 외부 의존성 0. 실행: node --test tests/
 *  · 회원 판정 = 3컬럼 OR(회원 우선) 정책의 회귀 방지.
 * ========================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SZ = require('../ops/assets/saizen-core.js');

test('정상 케이스: 회원 / 일반', () => {
  assert.equal(SZ.isMember({ member_grade: '회원권', member_class: '다이아몬드Ⅱ', member_div: '정회원' }), true);
  assert.equal(SZ.isMember({ member_grade: '일반고객', member_class: '', member_div: '' }), false);
});

test('오등록 케이스: 셋 중 하나라도 회원신호면 회원(회원 우선)', () => {
  assert.equal(SZ.isMember({ member_grade: '일반고객', member_class: '골드', member_div: '' }), true);  // V만 회원
  assert.equal(SZ.isMember({ member_grade: '일반고객', member_class: '', member_div: '정회원' }), true); // U만 회원
  assert.equal(SZ.isMember({ member_grade: '회원권', member_class: '', member_div: '' }), true);          // T만 회원
});

test('비회원/공란은 일반', () => {
  assert.equal(SZ.isMember({ member_grade: '일반고객', member_class: '', member_div: '비회원' }), false);
  assert.equal(SZ.isMember({ member_grade: '', member_class: '', member_div: '' }), false);
});

test('등급 라벨: 실제 등급(V) 우선', () => {
  assert.equal(SZ.gradeLabel({ member_class: '다이아몬드Ⅱ' }), '다이아몬드Ⅱ');
  assert.equal(SZ.gradeLabel({ member_grade: '일반고객', member_class: '골드' }), '골드'); // T일반이어도 V등급 표시
  assert.equal(SZ.gradeLabel({ member_grade: '회원권' }), '회원');
  assert.equal(SZ.gradeLabel({ member_grade: '일반고객' }), '일반');
  assert.equal(SZ.gradeLabel({ member_grade: '', member_class: '', member_div: '정회원' }), '회원'); // U만 회원→'회원'
});

test('하위호환: 문자열 단일 인자(member_grade)', () => {
  assert.equal(SZ.isMember('회원권'), true);
  assert.equal(SZ.isMember('일반고객'), false);
  assert.equal(SZ.isMember(''), false);
  assert.equal(SZ.looksMember('정회원'), true);
  assert.equal(SZ.looksMember('비회원'), false);
});

// ── 날짜 유틸 ──────────────────────────────────────────────────────────────
test('fmtDate: Date → YYYY-MM-DD (로컬)', () => {
  assert.equal(SZ.fmtDate(new Date(2026, 5, 9)), '2026-06-09'); // 6월=month index 5
  assert.equal(SZ.fmtDate(new Date(NaN)), '');
  assert.equal(SZ.fmtDate('2026-06-09'), '');                   // 비Date → ''
});

test('parseFlexDate: 다양한 입력 흡수', () => {
  assert.equal(SZ.parseFlexDate('2026-08-15'), '2026-08-15');   // ISO
  assert.equal(SZ.parseFlexDate('2026/8/5'), '2026-08-05');     // 슬래시 한자리
  assert.equal(SZ.parseFlexDate('20260815'), '2026-08-15');     // 구분자 없음
  assert.equal(SZ.parseFlexDate('2026년 8월 15일'), '2026-08-15'); // 한국어
  assert.equal(SZ.parseFlexDate('08/15/2026'), '2026-08-15');   // MM/DD/YYYY
  assert.equal(SZ.parseFlexDate('8/5/2026'), '2026-08-05');     // M/D/YYYY
  assert.equal(SZ.parseFlexDate(45900), '2025-08-31');          // 엑셀 직렬
  assert.equal(SZ.parseFlexDate(new Date(2026, 5, 9)), '2026-06-09');
  assert.equal(SZ.parseFlexDate(''), '');
  assert.equal(SZ.parseFlexDate(null), '');
  assert.equal(SZ.parseFlexDate('알수없음'), '');
});

test('parseLocalDate: 문자열 → 로컬 Date(시간대 밀림 방지)', () => {
  const d = SZ.parseLocalDate('2026-08-15');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7);   // 8월
  assert.equal(d.getDate(), 15);
  assert.ok(isNaN(SZ.parseLocalDate('')));
});

test('overlaps: 체류 구간 겹침(퇴실=경계 비포함)', () => {
  assert.equal(SZ.overlaps('2026-06-01', '2026-06-03', '2026-06-02', '2026-06-04'), true);  // 겹침
  assert.equal(SZ.overlaps('2026-06-01', '2026-06-03', '2026-06-03', '2026-06-05'), false); // 턴오버(경계 접촉)
  assert.equal(SZ.overlaps('2026-06-01', '2026-06-02', '2026-06-05', '2026-06-06'), false); // 분리
});
