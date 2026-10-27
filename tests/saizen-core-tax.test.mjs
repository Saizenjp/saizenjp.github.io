// 消費税(内税) 공통 함수 — P0(docs/06 정산 보강) 회귀 고정: 종전 세 가지 식과 정수 엔 전 구간에서 같은 값
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../ops/assets/saizen-core.js');

test('TAX_RATE 기본 10% · taxIncluded = 종전 pos/settle 식(税込 − round(税込/1.1)) = 종전 frontdesk/golf_add_charge 식(round(税込 − 税込/1.1)) · 0~100,000엔 전수', () => {
  assert.equal(C.TAX_RATE, 10);
  for (let g = 0; g <= 100000; g++) {
    const a = g - Math.round(g / (1 + 0.10));          // pos.html·settle.html taxOf (P0 이전)
    const b = Math.round(g - g / 1.1);                 // frontdesk.html 인라인 · SQL golf_add_charge
    const c = g - Math.round(g / 1.1);                 // SQL cart_sync_charge (v_net=round(gross/1.1))
    const t = C.taxIncluded(g);
    assert.equal(t, a, `pos/settle ${g}`); assert.equal(t, b, `frontdesk ${g}`); assert.equal(t, c, `cart ${g}`);
    assert.equal(C.netOf(g) + t, g, `net+tax=gross ${g}`);
  }
});

test('대표값: 1,000엔→91 · 2,800엔→255 · 5,500엔→500 · 0엔→0 · 문자열/빈값 안전', () => {
  assert.equal(C.taxIncluded(1000), 91);
  assert.equal(C.taxIncluded(2800), 255);
  assert.equal(C.taxIncluded(5500), 500);
  assert.equal(C.taxIncluded(0), 0);
  assert.equal(C.taxIncluded('1000'), 91);
  assert.equal(C.taxIncluded(null), 0);
  assert.equal(C.netOf(1000), 909);
});

test('세율 인자(P1 대비): 8% 1,080엔→80 · 0%(비과세·불과세)→0 · 음수 세율→0', () => {
  assert.equal(C.taxIncluded(1080, 8), 80);
  assert.equal(C.taxIncluded(1000, 0), 0);
  assert.equal(C.netOf(1000, 0), 1000);
  assert.equal(C.taxIncluded(1000, -5), 0);
});
