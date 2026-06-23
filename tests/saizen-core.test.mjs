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
