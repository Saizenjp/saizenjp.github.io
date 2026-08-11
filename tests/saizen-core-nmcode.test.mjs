// 비회원 F풀 코드(알파벳2+가나1) 순회 규칙 회귀 테스트
//  현장 불편 신고(2026-08): 연속 배정이 FAあ·FBあ·FFあ… 처럼 한 글자만 줄줄이 바뀌어 헷갈림.
//  → nmSpreadIdx 는 한 칸마다 알파벳·가나가 둘 다 바뀌면서 594개를 정확히 한 번씩 순회해야 한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SZ = require('../ops/assets/saizen-core.js');

test('F풀 코드표 = 18 알파벳 × 33 가나 = 594', () => {
  assert.equal(SZ.NM_PREFIX.length, 18);
  assert.equal(SZ.NM_KANA.length, 33);
  assert.equal(SZ.NM_POOL, 594);
});

test('nmIdxToCode ↔ nmCodeToIdx 왕복이 594개 전부 일치', () => {
  for (let i = 0; i < SZ.NM_POOL; i++) {
    assert.equal(SZ.nmCodeToIdx(SZ.nmIdxToCode(i)), i, 'idx ' + i);
  }
  assert.equal(SZ.nmCodeToIdx('QQ□'), -1, '코드표에 없는 값은 -1');
});

test('nmSpreadIdx 는 594개를 정확히 한 번씩 순회(전단사)', () => {
  const seen = new Set();
  for (let n = 0; n < SZ.NM_POOL; n++) {
    const idx = SZ.nmSpreadIdx(n);
    assert.ok(idx >= 0 && idx < SZ.NM_POOL, 'idx 범위 ' + idx);
    seen.add(idx);
  }
  assert.equal(seen.size, SZ.NM_POOL, '중복·누락 없이 594개');
});

test('nmSpreadIdx 는 한 칸마다 알파벳·가나가 둘 다 바뀐다 (닮은꼴 연속 금지)', () => {
  let prev = SZ.nmIdxToCode(SZ.nmSpreadIdx(0));
  for (let n = 1; n < SZ.NM_POOL; n++) {
    const code = SZ.nmIdxToCode(SZ.nmSpreadIdx(n));
    assert.notEqual(code.slice(0, 2), prev.slice(0, 2), `n=${n} 알파벳 연속(${prev}→${code})`);
    assert.notEqual(code.slice(2), prev.slice(2), `n=${n} 가나 연속(${prev}→${code})`);
    prev = code;
  }
});

test('nmSpreadIdx 는 음수·초과 입력도 594로 감싼다', () => {
  assert.equal(SZ.nmSpreadIdx(0), SZ.nmSpreadIdx(SZ.NM_POOL));
  assert.equal(SZ.nmSpreadIdx(0), SZ.nmSpreadIdx(-SZ.NM_POOL));
  assert.equal(SZ.nmSpreadIdx(5), SZ.nmSpreadIdx(5 + SZ.NM_POOL * 3));
});

test('짧은 구간(20팀 연속 배정)에도 같은 글자가 3번 이상 몰리지 않는다', () => {
  const p = {}, k = {};
  for (let n = 0; n < 20; n++) {
    const c = SZ.nmIdxToCode(SZ.nmSpreadIdx(n));
    p[c.slice(0, 2)] = (p[c.slice(0, 2)] || 0) + 1;
    k[c.slice(2)] = (k[c.slice(2)] || 0) + 1;
  }
  assert.ok(Math.max(...Object.values(p)) <= 2, '알파벳 몰림: ' + JSON.stringify(p));
  assert.ok(Math.max(...Object.values(k)) <= 1, '가나 몰림: ' + JSON.stringify(k));
});
