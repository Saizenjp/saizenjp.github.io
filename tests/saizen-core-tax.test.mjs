// 消費税(内税) 공통 함수 — P1(docs/06 정산 보강, 2026-10-27) 스펙 고정
//  D1 = 버림(切り捨て) · 세액은 청구서(folio) 단위·세율별로 1회 단수처리(taxByRate) · SQL tax_included(158, 정수 나눗셈)와 같은 값
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../ops/assets/saizen-core.js');

// SQL 158 tax_included(p_gross, p_rate) = (p_gross*p_rate)/(100+p_rate)  — Postgres 정수 나눗셈(0 방향 버림)
function sqlTax(g, r) { if (r <= 0) return 0; const q = (g * r) / (100 + r); return q < 0 ? -Math.floor(-q) : Math.floor(q); }

test('TAX_RATE 10 · TAX_ROUNDING floor · taxIncluded = SQL 158 정수 나눗셈과 −100,000~100,000엔 전수 동일(10%·8%)', () => {
  assert.equal(C.TAX_RATE, 10);
  assert.equal(C.TAX_ROUNDING, 'floor');
  for (let g = -100000; g <= 100000; g++) {
    assert.equal(C.taxIncluded(g), sqlTax(g, 10), `10% ${g}`);
    assert.equal(C.taxIncluded(g, 8), sqlTax(g, 8), `8% ${g}`);
    assert.equal(C.netOf(g) + C.taxIncluded(g), g, `net+tax=gross ${g}`);
  }
});

test('대표값(버림): 1,000→90 · 1,100→100 · 2,800→254 · 5,500→500 · 8% 1,080→80 · 8% 1,000→74 · 0%→0 · 음수는 부호만 · 빈값 안전', () => {
  assert.equal(C.taxIncluded(1000), 90);          // P0(四捨五入)에선 91 이었다 — D1 버림으로 90
  assert.equal(C.taxIncluded(1100), 100);
  assert.equal(C.taxIncluded(2800), 254);
  assert.equal(C.taxIncluded(5500), 500);
  assert.equal(C.taxIncluded(1080, 8), 80);
  assert.equal(C.taxIncluded(1000, 8), 74);
  assert.equal(C.taxIncluded(1000, 0), 0);
  assert.equal(C.taxIncluded(-1000), -90);
  assert.equal(C.taxIncluded('1000'), 90);
  assert.equal(C.taxIncluded(null), 0);
  assert.equal(C.netOf(1000), 910);
  // 단수처리 모드 인자(세무사 확인 뒤 바뀔 수 있어 상수 하나로) — round/ceil 도 동작
  assert.equal(C.taxIncluded(1000, 10, 'round'), 91);
  assert.equal(C.taxIncluded(1000, 10, 'ceil'), 91);
  assert.equal(C.taxIncluded(1100, 10, 'ceil'), 100);
});

test('taxKey/taxParse — 구분이 과세가 아니면 세율 0 · 과세 0% 는 非課税로 정규화 · 빈값=10%·과세', () => {
  assert.equal(C.taxKey(), 'taxable:10');
  assert.equal(C.taxKey(null, null), 'taxable:10');
  assert.equal(C.taxKey(8, 'taxable'), 'taxable:8');
  assert.equal(C.taxKey(10, 'outside'), 'outside:0');
  assert.equal(C.taxKey(0, 'taxable'), 'exempt:0');
  assert.equal(C.taxKey(5, 'taxable'), 'taxable:10');   // 허용 외 세율 → 기본 10
  assert.deepEqual(C.taxParse('exempt:0'), { key: 'exempt:0', cls: 'exempt', rate: 0 });
  assert.deepEqual(C.taxParse('bogus'), { key: 'taxable:10', cls: 'taxable', rate: 10 });
  assert.deepEqual(C.TAX_OPTIONS.map(o => o.key), ['taxable:10', 'taxable:8', 'exempt:0', 'outside:0']);
  assert.equal(C.taxLabel('taxable:8'), '8%(軽減)');
  assert.equal(C.taxLabel({ rate: 0, cls: 'outside' }, 'ko'), '불과세');
  assert.equal(C.taxLabel('taxable:10', 'en'), '10%');
});

test('taxByRate — 청구서 단위·세율별 1회 버림: 행별 세액 합과 다르고(1엔씩 어긋나는 것이 정상), 버킷 순서=과세(세율 내림차순)→非課税→不課税, voided 제외', () => {
  // 10% 세 줄: 1,000 ×3 → 행별 버림 합 90×3=270 / 청구서 단위 3,000→272 (적격청구서는 272 가 맞다)
  const lines = [
    { unit_price: 1000, qty: 1 }, { unit_price: 1000, qty: 1 }, { unit_price: 1000, qty: 1 },
    { unit_price: 1080, qty: 1, tax_rate: 8, tax_class: 'taxable' },
    { unit_price: 540, qty: 1, tax_rate: 8 },
    { amount: 500, tax: 0, service_charge: 0, tax_rate: 0, tax_class: 'outside' },
    { amount: 200, tax: 0, service_charge: 0, tax_rate: 0, tax_class: 'exempt' },
    { amount: 999999, tax: 0, voided: true, tax_rate: 10 },
  ];
  const r = C.taxByRate(lines);
  assert.deepEqual(r.buckets.map(b => [b.key, b.n, b.gross, b.tax, b.net]), [
    ['taxable:10', 3, 3000, 272, 2728],
    ['taxable:8', 2, 1620, 120, 1500],
    ['exempt:0', 1, 200, 0, 200],
    ['outside:0', 1, 500, 0, 500],
  ]);
  assert.equal(r.gross, 5320); assert.equal(r.tax, 392); assert.equal(r.net, 4928); assert.equal(r.n, 7);
  assert.equal(r.has8, true); assert.equal(r.mixed, true);
  assert.notEqual(r.buckets[0].tax, 3 * C.taxIncluded(1000));   // 행별 합(270) ≠ 청구서 단위(272)
  // 청구 행(amount+tax+service_charge)으로 넣어도 税込 기준은 같다
  const rows = [{ amount: 910, tax: 90, service_charge: 0 }, { amount: 909, tax: 91, service_charge: 0 }, { amount: 1000, tax: 0, service_charge: 0 }];
  const r2 = C.taxByRate(rows);
  assert.deepEqual(r2.buckets.map(b => [b.key, b.gross, b.tax]), [['taxable:10', 3000, 272]]);
  assert.equal(r2.mixed, false); assert.equal(r2.has8, false);
  // 빈 입력
  const r3 = C.taxByRate([]); assert.equal(r3.gross, 0); assert.equal(r3.buckets.length, 0);
  // 환불(음수)만 있는 계산서 — 세액도 음수(부호 유지)
  const r4 = C.taxByRate([{ unit_price: -3000, qty: 1 }]);
  assert.equal(r4.buckets[0].tax, -272); assert.equal(r4.net, -2728);
});

test('lineGross — 직접 gross / 청구 행 / 장바구니 줄', () => {
  assert.equal(C.lineGross({ gross: 123 }), 123);
  assert.equal(C.lineGross({ amount: 100, tax: 10, service_charge: 5 }), 115);
  assert.equal(C.lineGross({ amount: 0, tax: 0 }), 0);
  assert.equal(C.lineGross({ unit_price: 1000, qty: 3 }), 3000);
  assert.equal(C.lineGross({ unit_price: 1000 }), 1000);
  assert.equal(C.lineGross(null), 0);
});
