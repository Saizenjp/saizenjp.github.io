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

// 검수 D14-3 — SheetJS(cellDates) 가 한국 시간대 PC 에서 자정보다 52초 이르게 만든 Date 는 그날로 읽는다(하루 전으로 밀리지 않게).
//  보정은 그 PC 시간대의 실제 오차만큼만(서울 52초 · 도쿄·UTC·미국 0초) — 고정 60초를 더하면 「23:59:30」처럼 시각이 붙은 칸이 다음 날로 넘어간다(29차 반박 검토).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const CORE_PATH = fileURLToPath(new URL('../ops/assets/saizen-core.js', import.meta.url));
test('parseFlexDate: SheetJS 가 만든 Date(자정 − 시간대 초 오차)는 그날로 · 시각이 붙은 칸은 그날 그대로', () => {
  const fix = SZ.SHEET_FIX_MS;
  assert.ok(Number.isInteger(fix) && fix >= 0 && fix < 60000, 'SHEET_FIX_MS=' + fix);
  const sheet = (y, m, d, hh = 0, mm = 0, ss = 0) => new Date(new Date(y, m - 1, d, hh, mm, ss).getTime() - fix);   // SheetJS 가 내는 값(오차만큼 이른 시각)
  assert.equal(SZ.parseFlexDate(sheet(2026, 8, 15)), '2026-08-15');
  assert.equal(SZ.parseFlexDate(sheet(1972, 1, 7)), '1972-01-07');
  assert.equal(SZ.parseFlexDate(sheet(2026, 8, 14, 23, 59, 59)), '2026-08-14');   // 시각이 붙은 칸은 다음 날로 넘어가지 않는다
  assert.equal(SZ.parseFlexDate(sheet(2026, 8, 14, 23, 59, 0)), '2026-08-14');
  assert.equal(SZ.parseFlexDate(sheet(2026, 6, 9, 14, 30)), '2026-06-09');
  assert.equal(SZ.parseFlexDate(sheet(2026, 6, 9, 0, 0, 30)), '2026-06-09');
});
test('parseFlexDate: 시간대별 보정값 — 서울 52초 · 도쿄·UTC·LA 0초(자식 프로세스로 시간대를 바꿔 확인)', () => {
  const run = tz => JSON.parse(execFileSync(process.execPath, ['-e',
    'const C=require(' + JSON.stringify(CORE_PATH) + ');' +
    'const f=C.SHEET_FIX_MS;const mk=(h,m,s)=>new Date(new Date(2026,7,14,h,m,s).getTime()-f);' +
    'console.log(JSON.stringify([f,C.parseFlexDate(new Date(new Date(2026,7,15).getTime()-f)),C.parseFlexDate(mk(23,59,30)),C.parseFlexDate(new Date(2026,7,14,23,59,30)),C.parseFlexDate(new Date(2026,7,14,23,59,8))]))'],
    { env: Object.assign({}, process.env, { TZ: tz }), encoding: 'utf8' }));
  //  [보정값, SheetJS 자정 칸, SheetJS 23:59:30 칸, (보정 없는) 23:59:30 Date, 23:59:08 Date]
  assert.deepEqual(run('Asia/Seoul'), [52000, '2026-08-15', '2026-08-14', '2026-08-15', '2026-08-15']);   // 서울: 자정 52초 전(23:59:08)이 그날 0시
  for (const tz of ['Asia/Tokyo', 'UTC', 'America/Los_Angeles'])
    assert.deepEqual(run(tz), [0, '2026-08-15', '2026-08-14', '2026-08-14', '2026-08-14'], tz);        // 오차가 없는 시간대는 아무것도 더하지 않는다
});
// SheetJS 가 실제로 내는 값 = 참값 + (그 PC 의 1899-12-30 실제 시간대 차이 − 엔진이 분 단위로 알려 준 차이). 동쪽(서울·상하이)은 이르게, 서쪽(상파울루)은 늦게 나온다.
//  늦게 나오는 시간대는 날짜 칸이 그날 0시 뒤라 고칠 것이 없다 → 보정 0(더하면 23:59:30 칸이 다음 날로 넘어간다 — 29차 검증에서 확인).
test('parseFlexDate: SheetJS 오차의 방향 — 이르게 나오는 시간대만 보정(상하이 43초) · 늦게 나오는 시간대(상파울루)는 0', () => {
  const run = tz => JSON.parse(execFileSync(process.execPath, ['-e',
    'const C=require(' + JSON.stringify(CORE_PATH) + ');' +
    'const b=new Date(1899,11,30);const err=(b.getTime()-Date.UTC(1899,11,30))-b.getTimezoneOffset()*60000;' +   // SheetJS 값 − 참값(ms)
    'const sh=(h,m,s)=>new Date(new Date(2026,7,14,h,m,s).getTime()+err);' +
    'console.log(JSON.stringify([C.SHEET_FIX_MS,err,C.parseFlexDate(sh(0,0,0)),C.parseFlexDate(sh(12,0,0)),C.parseFlexDate(sh(23,59,30))]))'],
    { env: Object.assign({}, process.env, { TZ: tz }), encoding: 'utf8' }));
  //  [보정값, SheetJS 오차, 자정 칸, 정오 칸, 23:59:30 칸] — 세 칸 모두 그날(8/14)로 읽혀야 한다
  assert.deepEqual(run('Asia/Seoul'), [52000, -52000, '2026-08-14', '2026-08-14', '2026-08-14']);
  assert.deepEqual(run('Asia/Shanghai'), [43000, -43000, '2026-08-14', '2026-08-14', '2026-08-14']);
  assert.deepEqual(run('America/Sao_Paulo'), [0, 28000, '2026-08-14', '2026-08-14', '2026-08-14']);
  assert.deepEqual(run('America/Bogota'), [0, 16000, '2026-08-14', '2026-08-14', '2026-08-14']);
  assert.deepEqual(run('Asia/Tokyo'), [0, 0, '2026-08-14', '2026-08-14', '2026-08-14']);
});
