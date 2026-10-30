// 자회사 상품(구마모토 시내호텔·트라이얼 리조트) — 상품명 → brand · 숙박 구간(SQL 159, Min 2026-10-30)
//  별도 원장 partner_bookings 에 들어갈 팀의 판정과 콤보 상품의 구간 산출을 고정한다. 야마나미 판정(accomFromProduct)은 불변.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../ops/assets/saizen-core.js');

test('partnerBrand — 구마모토 시내(한/일/영) · 트라이얼(가정 표기) · 그 외는 빈값, 야마나미 판정은 그대로', () => {
  assert.equal(C.partnerBrand('[5박 6일] 구마모토 시내호텔 3박 + 야마나미리조트 2박'), 'kumamoto');   // 실제 상품명(2026-10)
  assert.equal(C.partnerBrand('구마모토시내 호텔 2박'), 'kumamoto');
  assert.equal(C.partnerBrand('熊本市内ホテル 3泊'), 'kumamoto');
  assert.equal(C.partnerBrand('[7박 8일] 트라이얼 리조트 7박'), 'trial');
  assert.equal(C.partnerBrand('トライアルリゾート 4泊'), 'trial');
  assert.equal(C.partnerBrand('Trial Resort 3 nights'), 'trial');
  assert.equal(C.partnerBrand('야마나미CC 골프 투어 "장기숙박형 별장전용"'), '');
  assert.equal(C.partnerBrand('[7박 8일] 야마나미리조트 7박'), '');
  assert.equal(C.partnerBrand('구마모토 공항 송영'), '');          // 「시내」가 없으면 자회사 상품이 아니다(공항 지명 오탐 방지)
  assert.equal(C.partnerBrand(''), ''); assert.equal(C.partnerBrand(null), '');
  // 콤보는 양쪽 원장: 자회사 brand 와 야마나미 숙소가 둘 다 참
  const combo = '[5박 6일] 구마모토 시내호텔 3박 + 야마나미리조트 2박';
  assert.equal(C.accomFromProduct(combo), '야마나미리조트');
  assert.equal(C.accomFromProduct('[7박 8일] 트라이얼 리조트 7박'), '');   // 단독 상품은 bookings 에 안 들어간다(종전과 같음)
  assert.deepEqual(C.PARTNER_BRANDS.map(b => b.key), ['kumamoto', 'trial']);
  assert.equal(C.partnerLabel('kumamoto', 'ko'), '구마모토 시내 상품');
  assert.equal(C.partnerLabel('trial', 'ja'), 'トライアルリゾート商品');
  assert.equal(C.partnerLabel('kumamoto', 'en', true), 'Kumamoto city');
  assert.equal(C.partnerLabel('bogus', 'ko'), 'bogus');
});

test('partnerSegment — 콤보는 상품명 「N박」과 순서로 자회사 구간을 자른다(앞/뒤/가운데), 단독은 전체 기간', () => {
  // 실제 상품명: 구마모토 3박이 앞 → 입국일부터 3박, 그 뒤 야마나미 2박
  assert.deepEqual(C.partnerSegment('[5박 6일] 구마모토 시내호텔 3박 + 야마나미리조트 2박', '2026-10-01', '2026-10-06'),
    { from: '2026-10-01', to: '2026-10-04', nights: 3, sure: true, pos: 'first' });
  // 뒤에 오면 귀국일에서 거꾸로
  assert.deepEqual(C.partnerSegment('[7박 8일] 야마나미리조트 4박 + 구마모토 시내호텔 3박', '2026-10-01', '2026-10-08'),
    { from: '2026-10-05', to: '2026-10-08', nights: 3, sure: true, pos: 'last' });
  // 가운데(3구간)
  assert.deepEqual(C.partnerSegment('야마나미리조트 2박 + 트라이얼 리조트 3박 + 간지호텔 2박', '2026-11-01', '2026-11-08'),
    { from: '2026-11-03', to: '2026-11-06', nights: 3, sure: true, pos: 'mid' });
  // 단독 상품 = 예약 기간 전체
  assert.deepEqual(C.partnerSegment('[7박 8일] 트라이얼 리조트 7박', '2026-10-01', '2026-10-08'),
    { from: '2026-10-01', to: '2026-10-08', nights: 7, sure: true, pos: 'all' });
  // 월 경계도 날짜 문자열 연산(시간대 영향 없음)
  assert.deepEqual(C.partnerSegment('구마모토 시내호텔 2박 + 야마나미리조트 3박', '2026-10-30', '2026-11-04'),
    { from: '2026-10-30', to: '2026-11-01', nights: 2, sure: true, pos: 'first' });
});

test('partnerSegment — 못 읽으면 전체 기간 + sure=false(화면 「確認」): 박수 없음·합 불일치·날짜 없음·brand 구간 없음', () => {
  const full = (f, t, n) => ({ from: f, to: t, nights: n, sure: false, pos: 'all' });
  assert.deepEqual(C.partnerSegment('구마모토 시내호텔 + 야마나미리조트 2박', '2026-10-01', '2026-10-06'), full('2026-10-01', '2026-10-06', 5));   // 구마모토 박수 없음
  assert.deepEqual(C.partnerSegment('구마모토 시내호텔 3박 + 야마나미리조트 2박', '2026-10-01', '2026-10-08'), full('2026-10-01', '2026-10-08', 7));   // 3+2 ≠ 7
  assert.deepEqual(C.partnerSegment('구마모토 시내호텔 3박 + 야마나미리조트 2박', '', '2026-10-06'), full('', '2026-10-06', 0));                     // 날짜 없음
  assert.deepEqual(C.partnerSegment('야마나미리조트 3박 + 간지호텔 2박', '2026-10-01', '2026-10-06', 'kumamoto'), full('2026-10-01', '2026-10-06', 5)); // brand 구간 없음
  assert.deepEqual(C.partnerSegment('구마모토 시내호텔 3박 + 야마나미리조트 2박', '2026-10-01', '2026-10-06', 'bogus'), full('2026-10-01', '2026-10-06', 5));
});
