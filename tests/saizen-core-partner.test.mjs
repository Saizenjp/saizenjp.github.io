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
  assert.deepEqual(C.partnerSegment('구마모토 시내호텔 + 야마나미리조트 2박 + 간지호텔', '2026-10-01', '2026-10-06'), full('2026-10-01', '2026-10-06', 5));   // 박수 없는 숙박 구간이 둘 → 못 채움
  assert.deepEqual(C.partnerSegment('구마모토 시내호텔 3박 + 야마나미리조트 2박', '2026-10-01', '2026-10-08'), full('2026-10-01', '2026-10-08', 7));   // 3+2 ≠ 7
  assert.deepEqual(C.partnerSegment('구마모토 시내호텔 3박 + 야마나미리조트 2박', '', '2026-10-06'), full('', '2026-10-06', 0));                     // 날짜 없음
  assert.deepEqual(C.partnerSegment('야마나미리조트 3박 + 간지호텔 2박', '2026-10-01', '2026-10-06', 'kumamoto'), full('2026-10-01', '2026-10-06', 5)); // brand 구간 없음
  assert.deepEqual(C.partnerSegment('구마모토 시내호텔 3박 + 야마나미리조트 2박', '2026-10-01', '2026-10-06', 'bogus'), full('2026-10-01', '2026-10-06', 5));
});

test('partnerSegment — 비숙박 구간(3색 골프 등)은 무시: 실제 상품명 「구마모토 시내 호텔 + 3색 골프」는 단독 숙박 = 전체 기간 sure(2026-11 적재 8팀 「確認」 오탐 수정)', () => {
  // 2026-11 실제 적재 상품명(머리 [N박 N일] · 「여행사」 접두 · 뒤 (TW/KE))
  assert.deepEqual(C.partnerSegment('[4박 5일] 구마모토 시내 호텔 + 3색 골프', '2026-11-02', '2026-11-06'),
    { from: '2026-11-02', to: '2026-11-06', nights: 4, sure: true, pos: 'all' });
  assert.deepEqual(C.partnerSegment('여행사 [2박 3일] 구마모토 시내 호텔 + 3색 골프 (TW/KE)', '2026-11-27', '2026-11-29'),
    { from: '2026-11-27', to: '2026-11-29', nights: 2, sure: true, pos: 'all' });
  assert.deepEqual(C.partnerSegment('여행사 [3박 4일] 구마모토 시내 호텔 + 3색 골프', '2026-12-03', '2026-12-06'),
    { from: '2026-12-03', to: '2026-12-06', nights: 3, sure: true, pos: 'all' });
  // 골프 구간이 끼어도 숙박 구간 둘이면 콤보 — 박수 없는 숙박 구간 하나는 예약 박수에서 뺀 나머지로 채운다
  assert.deepEqual(C.partnerSegment('[5박 6일] 구마모토 시내 호텔 + 3색 골프 + 야마나미리조트 2박', '2026-10-01', '2026-10-06'),
    { from: '2026-10-01', to: '2026-10-04', nights: 3, sure: true, pos: 'first' });
  assert.deepEqual(C.partnerSegment('구마모토 시내호텔 + 야마나미리조트 2박', '2026-10-01', '2026-10-06'),
    { from: '2026-10-01', to: '2026-10-04', nights: 3, sure: true, pos: 'first' });
  // 나머지가 0 이하면 못 채운다(전체 기간 + 確認)
  assert.deepEqual(C.partnerSegment('구마모토 시내호텔 + 야마나미리조트 5박', '2026-10-01', '2026-10-06'),
    { from: '2026-10-01', to: '2026-10-06', nights: 5, sure: false, pos: 'all' });
  // 트라이얼도 같은 규칙(가정 표기)
  assert.deepEqual(C.partnerSegment('[3박 4일] 트라이얼 리조트 + 골프 2라운드', '2026-11-10', '2026-11-13'),
    { from: '2026-11-10', to: '2026-11-13', nights: 3, sure: true, pos: 'all' });
});

test('partnerAgency — 여행사(판매처): 명시 열 → 비고 「여행사: ○○」/「여행사 ○○투어」/「[○○투어]」 → 상품명 「여행사」 접두 → 메리트투어(Min 2026-11-02)', () => {
  assert.equal(C.partnerAgency({ explicit: 'SOM투어', remark: '여행사: 다른곳' }), 'SOM투어');          // 명시 열이 최우선
  assert.equal(C.partnerAgency({ remark: '여행사: SOM투어 / 3명 트윈1 싱글1' }), 'SOM투어');
  assert.equal(C.partnerAgency({ remark: '여행사：타이세이투어' }), '타이세이투어');                  // 전각 콜론
  assert.equal(C.partnerAgency({ remark_local: '싱글 1 · 여행사 우속투어 10명' }), '우속투어');
  assert.equal(C.partnerAgency({ remark: '[한성투어] 늦은 도착' }), '한성투어');
  assert.equal(C.partnerAgency({ product_name: '여행사 [2박 3일] 구마모토 시내 호텔 + 3색 골프 (TW/KE)' }), '여행사(미기재)');   // 실제 상품명
  assert.equal(C.partnerAgency({ product_name: '[4박 5일] 구마모토 시내 호텔 + 3색 골프', remark: '트윈 2' }), '메리트투어');
  assert.equal(C.partnerAgency({}), '메리트투어'); assert.equal(C.partnerAgency(null), '메리트투어');
});

test('partnerNightType/partnerGolfType — 밤 요금 구분(금·토·일·祝日·祝前日=hi) · 골프 구분(토 sat · 일/祝日 sun · 금 wk) = 현지 日別 料金表 규칙', () => {
  assert.equal(C.partnerNightType('2026-11-02'), 'hi');   // 월요일이지만 文化の日 전날
  assert.equal(C.partnerNightType('2026-11-03'), 'hi');   // 祝日
  assert.equal(C.partnerNightType('2026-11-04'), 'wk');
  assert.equal(C.partnerNightType('2026-11-06'), 'hi');   // 금
  assert.equal(C.partnerNightType('2026-11-08'), 'hi');   // 일
  assert.equal(C.partnerNightType('2026-11-09'), 'wk');
  assert.equal(C.partnerNightType('2026-12-31'), 'hi');   // 元日 전날
  assert.equal(C.partnerNightType(''), 'wk');
  assert.equal(C.partnerGolfType('2026-11-06'), 'wk');    // 금요일 골프는 평일 요금
  assert.equal(C.partnerGolfType('2026-11-07'), 'sat');
  assert.equal(C.partnerGolfType('2026-11-08'), 'sun');
  assert.equal(C.partnerGolfType('2026-11-03'), 'sun');   // 祝日 = 일요일 요금
});

test('partnerQuote — 1인 요금 = 밤×호텔(구분·가산) + 라운드×골프(구분) + 引率(밤마다 day·귀국일 last) + 가산 · 팀 합계·객실 인원 일치(가상 요금)', () => {
  const R = { hotel: { twin: { wk: 100, hi: 200 }, single: { wk: 150, hi: 300 } }, golf: { wk: 10, sat: 20, sun: 30 }, guide: { day: 5, last: 2 } };
  // 월~금 4박(전부 평일 밤), 골프 기본 = 밤마다 4R, 트윈 2실 + 싱글 1 = 5명
  const q = C.partnerQuote({ from: '2026-11-09', to: '2026-11-13', twin: 2, single: 1, pax: 5 }, R);
  assert.equal(q.nights, 4); assert.equal(q.rounds, 4);
  assert.equal(q.twin, 400 + 40 + 22); assert.equal(q.single, 600 + 40 + 22); assert.equal(q.triple, q.twin);   // 트리플 요금 없으면 트윈 요금
  assert.equal(q.total, 462 * 4 + 662); assert.equal(q.roomsMatch, true);
  // 금~월 3박(전부 休日 밤) — 골프 금 wk·토 sat·일 sun, 호텔 가산 +1/밤, 1인 가산 +3
  const q2 = C.partnerQuote({ from: '2026-11-13', to: '2026-11-16', twin: 1, pax: 2, surcharge: 1, adj: 3 }, R);
  assert.equal(q2.twin, (200 + 1) * 3 + (10 + 20 + 30) + (5 * 3 + 2) + 3);
  // 골프 날짜를 따로 주면 그 수만(귀국일 라운드 추가 등) · 싱글 수기 요금은 표 대신 · 객실 인원 불일치 표시
  const q3 = C.partnerQuote({ from: '2026-11-09', to: '2026-11-12', golfDates: ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'], single: 2, pax: 3, singleRate: 120 }, R);
  assert.equal(q3.rounds, 4); assert.equal(q3.single, 120 * 3 + 40 + 17); assert.equal(q3.roomsMatch, false);
  assert.equal(C.partnerQuote({ from: '2026-11-09', to: '2026-11-09' }, R).ok, false);
  assert.equal(C.partnerQuote({ from: '2026-11-09', to: '2026-11-10', twin: 1 }, {}).total, 0);   // 요금 미등록 = 0(화면이 「요금표 미등록」 안내)
});
