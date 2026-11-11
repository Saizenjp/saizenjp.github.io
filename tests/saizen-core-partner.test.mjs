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
  assert.equal(C.partnerAgency({ remark: '여행사: 한성투어 (10명)' }), '한성투어');                     // 괄호 앞에서 끊는다
  assert.equal(C.partnerAgency({ remark: '여행사: 한성투어 늦은 도착' }), '한성투어');                   // 접미(투어)가 붙은 토큰까지만
  assert.equal(C.partnerAgency({ remark: '여행사(마스투어) 결제대행' }), '마스투어');
});

test('partnerHotelList — 호텔 제출용 宿泊者名簿(Min 2026-11-04): 일본어 머리·M/F·YYYY/MM/DD·発行国 코드·대표·순서·누락 수', () => {
  const members = [
    { seq_in_team: 2, name_kr: '이영희', name_en_last: 'LEE', name_en_first: 'YOUNG HEE', gender: '여', birth: '1975-03-09', passport_no: 'M12345678', passport_exp: '2030-01-02', passport_country: '대한민국', is_rep: false },
    { seq_in_team: 1, name_kr: '김대표', name_en: 'KIM DAE PYO', gender: '남', birth: new Date(1970, 0, 5), passport_no: 'M87654321', passport_exp: '2031-12-31', passport_country: 'KOR', is_rep: true },
    { seq_in_team: 3, name_kr: '박무기', name_en: 'PARK', gender: '', birth: null, passport_no: null, passport_exp: null, passport_country: null, is_rep: false },
  ];
  const r = C.partnerHotelList({ seq: 30012500, rep: '김대표', pax: 3, from: '2026-12-03', to: '2026-12-06', agency: '우속투어' }, members,
    { hotel: 'ワシントンホテル', rooms: { twin: 1, single: 1 }, staff: 'カイヤ', today: '2026-11-04' });
  assert.equal(r.title, '宿泊者名簿（団体）'); assert.equal(r.sheet, '宿泊者名簿'); assert.equal(r.file, 'hotel_guest_list_30012500_20261203.xlsx');
  assert.deepEqual(r.head.slice(0, 5), ['No.', '氏名（韓国語）', '姓（ローマ字）', '名（ローマ字）', '性別']);
  assert.deepEqual(r.rows[0], [1, '김대표', 'KIM', 'DAE PYO', 'M', '1970/01/05', 'M87654321', '2031/12/31', 'KOR', 'KOR', '代表']);   // seq_in_team 순 · name_en 분리 · Date 생년
  assert.deepEqual(r.rows[1], [2, '이영희', 'LEE', 'YOUNG HEE', 'F', '1975/03/09', 'M12345678', '2030/01/02', 'KOR', 'KOR', '']);        // 대한민국 → KOR
  assert.deepEqual(r.rows[2], [3, '박무기', 'PARK', '', '', '', '', '', '', '', '']);                                                     // 정보 없는 사람은 빈 칸(만들지 않는다)
  assert.deepEqual(r.counts, { male: 1, female: 1, unknown: 1, total: 3 }); assert.deepEqual(r.missing, { passport: 1, birth: 1 });
  const meta = Object.fromEntries(r.meta);
  assert.equal(meta['ホテル名'], 'ワシントンホテル'); assert.equal(meta['宿泊期間'], 'チェックイン 2026/12/03（木） 〜 チェックアウト 2026/12/06（日）　3泊');
  assert.equal(meta['団体名'], '김대표 様 ご一行（予約番号 30012500）'); assert.equal(meta['人数'], '3名（男1・女1・不明1）'); assert.equal(meta['部屋構成'], 'ツイン1室・シングル1室');
  assert.equal(meta['旅行会社'], '우속투어'); assert.equal(meta['手配担当'], 'カイヤ'); assert.equal(meta['提出日'], '2026/11/04');
  assert.equal(C.partnerGenderMF('男性'), 'M'); assert.equal(C.partnerGenderMF('Female'), 'F'); assert.equal(C.partnerGenderMF('?'), '');
  assert.equal(C.partnerCountryCode('한국'), 'KOR'); assert.equal(C.partnerCountryCode('jpn'), 'JPN'); assert.equal(C.partnerCountryCode('Republic of Korea'), 'KOR'); assert.equal(C.partnerCountryCode('Deutschland'), 'Deutschland');
});

test('partnerAgency — 상품명에도 여행사·여행사명(Min 2026-11-04): 비고가 먼저 · 「여행사」만이면 미기재 · 「○○투어」만 있는 상품명은 안 본다', () => {
  assert.equal(C.partnerAgency({ product_name: '여행사 우속투어 [2박 3일] 구마모토 시내 호텔 + 3색 골프 (TW/KE)' }), '우속투어');
  assert.equal(C.partnerAgency({ product_name: '여행사: SOM 트래블 [3박 4일] 구마모토 시내 호텔 + 3색 골프' }), 'SOM 트래블');
  assert.equal(C.partnerAgency({ product_name: '여행사(한성투어) [4박 5일] 구마모토 시내 호텔 + 3색 골프' }), '한성투어');
  assert.equal(C.partnerAgency({ product_name: '[2박 3일] 구마모토 시내 호텔 + 3색 골프 (여행사: 타이세이투어)' }), '타이세이투어');
  assert.equal(C.partnerAgency({ product_name: '한성여행사 [2박 3일] 구마모토 시내 호텔 + 3색 골프' }), '한성여행사');
  assert.equal(C.partnerAgency({ product: '여행사 SOM투어 [2박 3일] 트라이얼 리조트 골프' }), 'SOM투어');                        // product 키도 받는다(staychart)
  assert.equal(C.partnerAgency({ product_name: '여행사 우속투어 [2박 3일] 구마모토 시내 호텔', remark: '여행사: 마스투어 / 결제대행' }), '마스투어');   // 비고(그 예약 고유)가 상품명보다 먼저
  assert.equal(C.partnerAgency({ product_name: '여행사 [2박 3일] 구마모토 시내 호텔 + 3색 골프 (TW/KE)', remark: '트윈 2' }), '여행사(미기재)');
  // 실제 2026·2027 상품명 — 「투어」가 들어가도 여행사가 아니다(오판 0)
  ['시즈노야도 료칸 골프 투어 4박 5일', '간지호텔 2색 골프 투어 3박 4일', '간지호텔 2색+시즈노야도 료칸 골프 투어  14박 15일', '미야자키 2색 골프투어 5박 6일',
   '벳푸 아키바 리조트 3색 골프투어 4박 5일', '시로사토CC 골프 투어 6박 7일', '미야자키 국제공항CC 골프 투어 5박 6일',
   '[14박 15일] 간지호텔 골프 투어+야마나미CC 골프 투어', '[7박 8일] 야마나미CC 골프 투어 "장기 숙박형 별장전용"', '[4박 5일] 야마나미CC 골프 투어 돔하우스',
   '[4박 5일] 구마모토 시내 호텔 + 3색 골프', '쿠쥬 프라이빗 타운 야마나미CC 7박 8일', '[호텔트윈] - 아소야마나미리조트호텔&골프클럽3박4일 (테스트상품)']
    .forEach(n => assert.equal(C.partnerAgency({ product_name: n }), '메리트투어', n));
  // partnerRemarkPlan 도 상품명을 본다(수배 목록 「비고대로」·step1 자동 채움) — 상품명 여행사는 서명에 들어가고, 없으면 서명 불변
  const base = { pax: 3, segFrom: '2026-11-09', segTo: '2026-11-12' };
  const p1 = C.partnerRemarkPlan('워싱턴호텔 / 싱글룸 1', Object.assign({ product: '여행사 우속투어 [3박 4일] 구마모토 시내 호텔 + 3색 골프' }, base));
  assert.equal(p1.agency, '우속투어'); assert.equal(p1.agencyExplicit, true);
  assert.notEqual(p1.sig, C.partnerRemarkPlan('워싱턴호텔 / 싱글룸 1', base).sig);
  const p2 = C.partnerRemarkPlan('워싱턴호텔 / 싱글룸 1', Object.assign({ product: '[3박 4일] 구마모토 시내 호텔 + 3색 골프' }, base));
  assert.equal(p2.agency, '메리트투어'); assert.equal(p2.agencyExplicit, false); assert.equal(p2.sig, C.partnerRemarkPlan('워싱턴호텔 / 싱글룸 1', base).sig);
  assert.equal(C.partnerRemarkPlan('여행사: 마스투어 / 워싱턴호텔', Object.assign({ product: '여행사 우속투어 [3박 4일] 구마모토' }, base)).agency, '마스투어');
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

test('partnerPrice/partnerRateCands — 기간별 요금표: 대상 지정>공통 · 좁은 기간>넓은 기간 · 칸 단위 폴백 · 상시 행', () => {
  const rows = [
    { id: 1, kind: 'hotel', ref_id: null, from_date: null, to_date: null, prices: { twin: { wk: 100, hi: 200 }, single: { wk: 150, hi: 300 } } },          // 상시 공통
    { id: 2, kind: 'hotel', ref_id: 7, from_date: '2027-02-01', to_date: '2027-03-31', prices: { twin: { wk: 110 } } },                                  // 호텔 7 · 2~3월 트윈 평일만
    { id: 3, kind: 'hotel', ref_id: 7, from_date: '2027-02-10', to_date: '2027-02-14', prices: { twin: { wk: 999 } } },                                  // 그 안의 좁은 기간
    { id: 4, kind: 'golf', ref_id: null, from_date: null, to_date: null, prices: { wk: 10, sat: 20, sun: 30 } },
    { id: 5, kind: 'golf', ref_id: 3, from_date: '2027-02-01', to_date: '2027-03-31', prices: { sat: 25 } },                                              // 코스 3 · 토요일만 다름
    { id: 6, kind: 'transfer', ref_id: null, from_date: null, to_date: null, prices: { day: 40 } },
    { id: 7, kind: 'guide', ref_id: null, from_date: null, to_date: null, prices: { day: 5, last: 2 } }];
  assert.equal(C.partnerPrice(rows, 'hotel', 7, '2027-02-03', ['twin', 'wk']), 110);     // 2~3월 호텔 7
  assert.equal(C.partnerPrice(rows, 'hotel', 7, '2027-02-11', ['twin', 'wk']), 999);     // 좁은 기간 우선
  assert.equal(C.partnerPrice(rows, 'hotel', 7, '2027-02-11', ['twin', 'hi']), 200);     // 좁은 기간에 없는 칸 → 2~3월 행에도 없음 → 공통 상시
  assert.equal(C.partnerPrice(rows, 'hotel', 7, '2027-04-01', ['twin', 'wk']), 100);     // 기간 밖 → 공통
  assert.equal(C.partnerPrice(rows, 'hotel', 8, '2027-02-11', ['twin', 'wk']), 100);     // 다른 호텔 → 공통
  assert.equal(C.partnerPrice(rows, 'golf', 3, '2027-02-06', ['sat']), 25);              // 코스 3 토요일
  assert.equal(C.partnerPrice(rows, 'golf', 3, '2027-02-05', ['wk']), 10);               // 코스 3 평일 → 공통
  assert.equal(C.partnerPrice(rows, 'hotel', 7, '2027-02-11', ['triple', 'wk']), null);  // 없는 칸 = null(호출 쪽이 트윈으로 폴백)
  assert.deepEqual(C.partnerRateCands(rows, 'hotel', 7, '2027-02-11').map(r => r.id), [3, 2, 1]);
  // 옛 공통 객체 → 행 변환
  const legacy = C.partnerRateRows({ hotel: { twin: { wk: 1 } }, golf: { wk: 2 }, guide: { day: 3 } });
  assert.deepEqual(legacy.map(r => r.kind), ['hotel', 'golf', 'guide']);
  assert.deepEqual(C.partnerRateRows({}), []);
});
test('partnerQuote v2 — 행 배열: 호텔별·코스별·좁은 기간 반영, 송영(팀 단위)·빠진 칸(missing)·complete', () => {
  const rows = [
    { id: 1, kind: 'hotel', ref_id: null, prices: { twin: { wk: 100, hi: 200 }, single: { wk: 150, hi: 300 } } },
    { id: 2, kind: 'hotel', ref_id: 7, from_date: '2026-11-09', to_date: '2026-11-10', prices: { twin: { wk: 130 } } },     // 호텔 7 · 11/9·10 밤만 트윈 130
    { id: 3, kind: 'golf', ref_id: null, prices: { wk: 10, sat: 20, sun: 30 } },
    { id: 4, kind: 'golf', ref_id: 3, prices: { wk: 12 } },
    { id: 5, kind: 'transfer', ref_id: null, prices: { day: 40 } },
    { id: 6, kind: 'transfer', ref_id: 2, prices: { day: 70 } },
    { id: 7, kind: 'guide', ref_id: null, prices: { day: 5, last: 2 } }];
  // 월~금 4박(평일), 호텔 7, 골프 11/9 코스 3(12)·11/10 코스 1(10, 코스 행 없음→공통)·11/11 공통(10)·11/12 공통(10), 배차 11/9 차량 2(70)·11/13 차량 1(40)
  const q = C.partnerQuote({ from: '2026-11-09', to: '2026-11-13', hotelId: 7, twin: 2, pax: 4,
    golf: [{ date: '2026-11-09', courseId: 3 }, { date: '2026-11-10', courseId: 1 }, { date: '2026-11-11' }, { date: '2026-11-12' }],
    transfer: [{ date: '2026-11-09', vehicleId: 2 }, { date: '2026-11-13', vehicleId: 1 }] }, rows);
  assert.equal(q.twin, (130 + 130 + 100 + 100) + (12 + 10 + 10 + 10) + (5 * 4 + 2));
  assert.equal(q.transfer, 110); assert.equal(q.transferDays, 2);
  assert.equal(q.total, q.twin * 4 + 110); assert.equal(q.complete, true); assert.deepEqual(q.missing, []);
  // 호텔 요금이 전혀 없는 날이 있으면 missing + complete=false(합계는 0 으로 계산) · 싱글은 객실이 있을 때만 missing
  const q2 = C.partnerQuote({ from: '2026-11-09', to: '2026-11-11', hotelId: 9, twin: 1, single: 1, pax: 3 },
    [{ id: 1, kind: 'hotel', ref_id: null, from_date: '2026-11-10', to_date: '2026-11-10', prices: { twin: { wk: 100 } } }, { id: 2, kind: 'golf', ref_id: null, prices: { wk: 10 } }]);
  assert.equal(q2.complete, false);
  assert.deepEqual(q2.missing, ['hotel:2026-11-09', 'single:2026-11-09', 'single:2026-11-10']);
  // 옛 객체를 그대로 줘도 같은 결과(기존 호출 호환) · 송영 요금이 없어도 missing 아님
  const legacy = { hotel: { twin: { wk: 100, hi: 200 }, single: { wk: 150, hi: 300 } }, golf: { wk: 10, sat: 20, sun: 30 }, guide: { day: 5, last: 2 } };
  const a = C.partnerQuote({ from: '2026-11-09', to: '2026-11-13', twin: 2, single: 1, pax: 5, transfer: [{ date: '2026-11-09', vehicleId: 1 }] }, legacy);
  const b = C.partnerQuote({ from: '2026-11-09', to: '2026-11-13', twin: 2, single: 1, pax: 5 }, C.partnerRateRows(legacy));
  assert.equal(a.total, b.total); assert.equal(a.complete, true); assert.equal(a.transfer, 0);
});

// ── 비고 자동 채움 · 송영 차량/구간 (Min 2026-11-03) ──
const HOTELS = [
  { id: 1, name_ja: 'ワシントンホテル', name_ko: '워싱턴 호텔', aliases: '워싱턴,워싱톤,ワシントン,washington' },
  { id: 2, name_ja: 'ホテルタウ', name_ko: '호텔 타우', aliases: '타우,タウ,tau' },
  { id: 3, name_ja: 'アマネクホテル', name_ko: '아마넥 호텔', aliases: '아마넥' }];
const COURSES = [
  { id: 1, name_ja: 'グランドチャンピオンゴルフクラブ', name_ko: '그랜드 챔피언', aliases: '그랜드챔피언,그랜드,그챔' },
  { id: 2, name_ja: '熊本中央カントリークラブ', name_ko: '구마모토 츄오', aliases: '추오,츄오,중앙' },
  { id: 3, name_ja: '阿蘇グリーンヒルカントリークラブ', name_ko: '그린힐', aliases: '아소그린힐' },
  { id: 4, name_ja: 'KAOゴルフ倶楽部', name_ko: 'KAO CC', aliases: 'KAO,카오' },
  { id: 5, name_ja: '阿蘇トライアル', name_ko: '아소 트라이얼', aliases: '아소트라이얼' },
  { id: 6, name_ja: '南阿蘇トライアル', name_ko: '미나미아소 트라이얼', aliases: '미나미아소트라이얼,미나미아소' }];
test('partnerFindNames — 적힌 순서·긴 별칭 우선(미나미아소 안의 아소트라이얼 제외)·같은 코스 2회·영문 단어 경계', () => {
  const hits = C.partnerFindNames('골프장: 추오, 미나미아소트라이얼, KAO, 추오', COURSES).map(h => h.id);
  assert.deepEqual(hits, [2, 6, 4, 2]);
  assert.deepEqual(C.partnerFindNames('restaurant 예약', HOTELS), []);                 // tau 오탐 없음
  assert.deepEqual(C.partnerFindNames('TAU 호텔', HOTELS).map(h => h.id), [2]);
  assert.deepEqual(C.partnerFindNames('그랜드 챔피언 / 그린힐', COURSES).map(h => h.id), [1, 3]);
});
test('partnerRemarkPlan — 호텔·싱글·트리플·골프장 날짜(추정/명시)·여행사·서명', () => {
  const p = C.partnerRemarkPlan('여행사: 한성투어 / 워싱턴호텔 / 싱글룸 2 / 골프장 그랜드챔피언, 추오, 미나미아소트라이얼', { pax: 5, hotels: HOTELS, courses: COURSES, segFrom: '2026-11-09', segTo: '2026-11-13' });
  assert.equal(p.hotelId, 1); assert.equal(p.agency, '한성투어'); assert.equal(p.agencyExplicit, true);
  assert.equal(p.single, 3); assert.equal(p.twin, 1); assert.equal(p.triple, 0); assert.equal(p.odd, true);   // 싱글 2 + 남는 1명도 싱글
  assert.deepEqual(p.golf.map(g => [g.courseId, g.date, g.explicit]), [[1, '2026-11-10', false], [2, '2026-11-11', false], [6, '2026-11-12', false]]);   // 4박 3코스 → 2·3·4일차
  assert.equal(p.golfAssumed, 3); assert.equal(p.empty, false); assert.ok(p.sig);
  const q = C.partnerRemarkPlan('11/9 그랜드챔피언 11/10 추오 11/11 KAO 11/12 그린힐 / 아마넥 / 전원 싱글', { pax: 4, hotels: HOTELS, courses: COURSES, segFrom: '2026-11-09', segTo: '2026-11-13' });
  assert.equal(q.hotelId, 3); assert.equal(q.single, 4); assert.equal(q.twin, 0);
  assert.deepEqual(q.golf.map(g => [g.courseId, g.date, g.explicit]), [[1, '2026-11-09', true], [2, '2026-11-10', true], [4, '2026-11-11', true], [3, '2026-11-12', true]]);
  const r = C.partnerRemarkPlan('트리플 1 / 워싱턴 / 2일차 추오 / 둘째날 그린힐', { pax: 5, hotels: HOTELS, courses: COURSES, segFrom: '2026-12-28', segTo: '2026-12-31' });
  assert.equal(r.triple, 1); assert.equal(r.twin, 1); assert.equal(r.single, 0);
  assert.deepEqual(r.golf.map(g => g.date), ['2026-12-29', '2026-12-29']);
  const y = C.partnerRemarkPlan('1/2 추오', { pax: 2, hotels: HOTELS, courses: COURSES, segFrom: '2026-12-28', segTo: '2027-01-03' });
  assert.equal(y.golf[0].date, '2027-01-02');                                                                  // 연말 넘김
  const e = C.partnerRemarkPlan('', { pax: 4, hotels: HOTELS, courses: COURSES, segFrom: '2026-11-09', segTo: '2026-11-13' });
  assert.equal(e.hotelId, null); assert.deepEqual(e.golf, []); assert.equal(e.twin, 2); assert.equal(e.single, 0); assert.equal(e.empty, true);
  assert.equal(C.partnerRemarkPlan('싱글 1', { pax: 3 }).sig !== C.partnerRemarkPlan('싱글 2', { pax: 3 }).sig, true);
});
test('partnerVehiclePlan — 8명=하이에스 1대 · 12명=2대 · 19명=3대 · 20명=마이크로버스 · 30명=마이크로+하이에스', () => {
  const V = [{ id: 1, name: 'H1', capacity: 9, sort: 1 }, { id: 2, name: 'H2', capacity: 9, sort: 2 }, { id: 3, name: 'H3', capacity: 9, sort: 3 }, { id: 4, name: 'Micro', capacity: 25, sort: 4 }];
  const ids = n => C.partnerVehiclePlan(n, V).vehicles.map(v => v.vehicleId + ':' + v.pax);
  assert.deepEqual(ids(8), ['1:8']); assert.deepEqual(ids(12), ['1:9', '2:3']); assert.deepEqual(ids(19), ['1:9', '2:9', '3:1']);
  assert.deepEqual(ids(20), ['4:20']); assert.deepEqual(ids(30), ['4:25', '1:5']);
  assert.equal(C.partnerVehiclePlan(60, V).short, 60 - 52);
  assert.deepEqual(C.partnerVehiclePlan(5, [{ id: 9, capacity: 9, active: false }]).vehicles, []);
});
test('partnerLegPlan — 도착일 골프(호텔 경유/직행)·중간일·귀국일 골프→공항·구간↔지점', () => {
  const team = { dep: '2026-11-09', arr: '2026-11-13', fullDep: '2026-11-09', fullArr: '2026-11-13', arrTime: '09:25', retTime: '10:30' };
  const legs = C.partnerLegPlan(team, [{ play_date: '2026-11-09', tee_time: '12:00' }, { play_date: '2026-11-10', tee_time: '09:00' }, { play_date: '2026-11-13', tee_time: '07:30' }]);
  assert.deepEqual(legs.map(l => [l.trip_date.slice(5), l.leg, l.from_pt, l.via_pt, l.to_pt, l.depart_time]), [
    ['11-09', 'in', 'airport', 'hotel', 'course', '09:25'], ['11-09', 'golf_back', 'course', '', 'hotel', ''],
    ['11-10', 'golf_out', 'hotel', '', 'course', '08:00'], ['11-10', 'golf_back', 'course', '', 'hotel', ''],
    ['11-13', 'golf_out', 'hotel', '', 'course', '06:30'], ['11-13', 'out', 'course', '', 'airport', '08:30']]);
  const direct = C.partnerLegPlan(team, [{ play_date: '2026-11-09', tee_time: '10:30' }]);
  assert.equal(direct[0].via_pt, '');                                                                          // 09:25+115분 > 10:30 → 직행
  const plain = C.partnerLegPlan(team, []);
  assert.deepEqual(plain.map(l => [l.leg, l.from_pt, l.to_pt, l.depart_time]), [['in', 'airport', 'hotel', '09:25'], ['out', 'hotel', 'airport', '08:30']]);
  const combo = C.partnerLegPlan({ dep: '2026-11-11', arr: '2026-11-13', fullDep: '2026-11-09', fullArr: '2026-11-13', arrTime: '09:25', retTime: '10:30' }, []);
  assert.equal(combo[0].depart_time, '');                                                                      // 콤보 중간 구간 시작일 = 공항 도착 아님
  assert.deepEqual(C.partnerRouteOf('golf_out'), ['hotel', 'course']); assert.equal(C.partnerLegOf('course', 'airport'), 'out'); assert.equal(C.partnerLegOf('hotel', 'hotel'), 'other');
});

test('partnerBrand — 2027-07 예약리스트 상품명(구마모토 시내·트라이얼 없음)은 전부 빈값, 야마나미 신상품도 자회사 아님', () => {
  for (const n of ['호텔 숙박 야마나미CC 7박 8일', '쿠쥬 프라이빗 타운 야마나미CC 7박 8일', '돔스테이 야마나미CC 4박 5일', '소보 테라스 야마나미CC 4박 5일',
    '아소 프레스티지 야마나미CC 4박 5일', '히노키 스테이 야마나미CC 4박 5일', '온천호텔 숙박 스가다이라CC 7박 8일', '호텔 숙박 포틴힐즈CC 7박 8일', '벳푸 아키바 리조트 2색 골프투어 3박 4일'])
    assert.equal(C.partnerBrand(n), '', n);
});

test('partnerAgency·partnerRemarkPlan — 실제 엠클릭 입력 양식(Min 2026-11-11): 상품명 끝 「 - ○○투어」 · 비고 「LGC번호 / 호텔(트윈, N방)」', () => {
  const P = '여행사 [3박 4일] 구마모토 시내 호텔 + 3색 골프';
  assert.equal(C.partnerAgency({ product_name: P + ' - 우석투어' }), '우석투어');
  assert.equal(C.partnerAgency({ product_name: '여행사 [2박 3일] 구마모토 시내 호텔 + 2색 골프 - 오너스투어' }), '오너스투어');
  assert.equal(C.partnerAgency({ product: P + ' - SOM투어' }), 'SOM투어');
  assert.equal(C.partnerAgency({ product_name: P + ' - 우석투어 (KE)' }), '우석투어');                 // 끝의 괄호는 떼고 본다
  assert.equal(C.partnerAgency({ product_name: P + ' – SOM 트래블' }), 'SOM 트래블');                   // en dash · 두 낱말
  assert.equal(C.partnerAgency({ product_name: P + ' - 트라이얼투어즈' }), '트라이얼투어즈');
  assert.equal(C.partnerAgency({ product_name: P + ' - 우석투어', remark: 'LGC0001 / 타우(트윈, 2방)', remark_local: 'LGC0001 / 타우(트윈, 2방)' }), '우석투어');
  assert.equal(C.partnerAgency({ product_name: P + ' - 우석투어', remark: '여행사: 마스투어' }), '마스투어');   // 비고(그 예약 고유)가 먼저
  assert.equal(C.partnerAgency({ product_name: P, remark: '항공 별도 / 여행사: 메리트투어' }), '메리트투어');   // 여행사 상품을 자사 손님이 쓴 경우
  // 여행사로 보지 않는 꼬리 — 「여행사」 표시만 남아 미기재
  [P, P + ' (TW/KE)', P + ' - 대한항공', P + ' - 골프 투어', P + ' - 투어', P + ' - KE', P + ' - 조식 포함 투어']
    .forEach(n => assert.equal(C.partnerAgency({ product_name: n }), '여행사(미기재)', n));
  // 「여행사」 표시가 없는 상품명은 끝에 ○○투어가 있어도 종전대로 메리트투어
  assert.equal(C.partnerAgency({ product_name: '[3박 4일] 구마모토 시내 호텔 + 3색 골프 - 가을투어' }), '메리트투어');
  assert.equal(C.partnerAgency({ product_name: '[호텔트윈] - 아소야마나미리조트호텔&골프클럽3박4일 (테스트상품)' }), '메리트투어');

  const H2 = HOTELS.concat([{ id: 6, name_ko: '토요코인', name_ja: '東横INN', aliases: '토요코인,토요코,東横,toyoko' }]);
  const plan = (txt, pax, prod) => C.partnerRemarkPlan([txt, txt].join('\n'), { pax, hotels: H2, courses: COURSES, segFrom: '2026-12-01', segTo: '2026-12-04', product: prod || (P + ' - 우석투어') });
  const rooms = p => `T${p.twin} S${p.single} Tr${p.triple}`;
  let p = plan('LGC0001 / 타우(트윈, 2방)', 4);
  assert.equal(p.hotelName, '호텔 타우'); assert.equal(rooms(p), 'T2 S0 Tr0'); assert.equal(p.golf.length, 0);
  assert.equal(p.agency, '우석투어'); assert.equal(p.agencyExplicit, true); assert.equal(p.empty, false);
  assert.equal(rooms(plan('LGC0001 / 워싱턴(트윈, 4방)', 8)), 'T4 S0 Tr0');
  p = plan('예약번호없어 / 토요코인(트윈,4방)', 8); assert.equal(p.hotelName, '토요코인'); assert.equal(rooms(p), 'T4 S0 Tr0');
  assert.equal(rooms(plan('LGC0001 / 워싱턴(싱글4방) / KE', 4)), 'T0 S4 Tr0');
  assert.equal(rooms(plan('LGC0001 / 워싱턴(싱글, 4방)', 4)), 'T0 S4 Tr0');                       // 쉼표를 넣은 꼴도 같다
  assert.equal(rooms(plan('LGC0001 / 워싱턴(트윈 3방, 싱글 2방)', 8)), 'T3 S2 Tr0');
  assert.equal(rooms(plan('LGC0001 / 워싱턴(트리플 1방, 트윈 1방)', 5)), 'T1 S0 Tr1');
  assert.equal(rooms(plan('LGC0001 / 워싱턴 (2인 1실)', 2)), 'T1 S0 Tr0');
  assert.equal(rooms(plan('LGC0001 / 워싱턴 (1인 1실)', 2)), 'T0 S2 Tr0');                         // 「싱글」이라는 말 없이 적은 1인 1실 = 전원 싱글
  assert.equal(rooms(plan('LGC0001 / 워싱턴 (2인 1실 2방, 1인 1실 1방)', 5)), 'T2 S1 Tr0');
  p = plan('LGC0001 / 아마넥(트윈, 2방), 후쿠오카INOUT', 4); assert.equal(p.hotelName, '아마넥 호텔'); assert.equal(rooms(p), 'T2 S0 Tr0');
  p = plan('LGC0001 / 타우(트윈 2방) /티웨이IN,대한OUT', 4); assert.equal(p.hotelName, '호텔 타우'); assert.equal(rooms(p), 'T2 S0 Tr0');
  // 비고와 현지비고에 같은 글을 두 번 적어도(Min 입력 습관) 골프장은 한 번만 — 이어 붙인 문자열·[비고, 현지비고] 배열 둘 다
  const G = 'LGC0001 / 타우(트윈, 2방) / 골프장: 그랜드챔피언, 추오, 그린힐';
  p = plan(G, 4); assert.deepEqual(p.golf.map(g => g.courseId), [1, 2, 3]); assert.deepEqual(p.golf.map(g => g.date), ['2026-12-01', '2026-12-02', '2026-12-03']);
  const ctxA = { pax: 4, hotels: H2, courses: COURSES, segFrom: '2026-12-01', segTo: '2026-12-04', product: P + ' - 우석투어' };
  const arr = C.partnerRemarkPlan([G, G], ctxA);
  assert.deepEqual(arr.golf.map(g => g.courseId), [1, 2, 3]); assert.equal(arr.sig, p.sig);                 // 서명은 종전(이어 붙인 글) 그대로
  assert.deepEqual(C.partnerRemarkPlan([G, 'LGC0001 / 타우(트윈, 2방)'], ctxA).golf.map(g => g.courseId), [1, 2, 3]);      // 한쪽이 다른 쪽을 품으면 긴 쪽
  assert.deepEqual(C.partnerRemarkPlan(['LGC0001 / 타우(트윈, 2방)', G], ctxA).golf.map(g => g.courseId), [1, 2, 3]);
  assert.deepEqual(C.partnerRemarkPlan(['골프장: 그랜드챔피언, 추오', '타우 / 3일차 그린힐'], ctxA).golf.map(g => g.courseId), [1, 2, 3]);   // 서로 다른 글은 둘 다 읽는다
  assert.equal(C.partnerRemarkPlan([null, '전원 싱글룸 사용'], { pax: 4 }).sig, C.partnerRemarkPlan('전원 싱글룸 사용', { pax: 4 }).sig);   // 한쪽만 있는 팀의 서명 불변
  assert.deepEqual(C.partnerRemarkPlan('골프장:\n추오\n추오\n그린힐', ctxA).golf.map(g => g.courseId), [2, 2, 3]);       // 같은 코스 이틀 연속(줄 단위 중복 제거는 하지 않는다)
  // 서명은 상품명 끝 여행사로 흔들리지 않는다(등록 때마다 partner_bookings.agency 로 다시 계산)
  assert.equal(plan('LGC0001 / 타우(트윈, 2방)', 4).sig, plan('LGC0001 / 타우(트윈, 2방)', 4, P).sig);
  // 「항공 별도」만 있는 비고는 제안할 것이 없다
  assert.equal(plan('항공 별도', 4, P).empty, true); assert.equal(plan('항공 별도', 4, P).agency, '여행사(미기재)');
});
