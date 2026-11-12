// 비고에서 「싱글룸」 요청 읽기 — 실제 예약 문구(2026-08 이후 71건)에서 뽑은 사례로 스펙을 고정한다.
//  틀리면 방배정만이 아니라 추가요금 청구가 틀어지므로, **애매한 것은 반드시 사람에게** 넘어가야 한다.
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const SZCore = createRequire(import.meta.url)('../ops/assets/saizen-core.js');
const sp = (t, pax, names) => SZCore.singlePlan(t, pax, names);

test('싱글 얘기가 없으면 null', () => {
  assert.equal(sp('1-13 /2인 AIR 별도', 4, []), null);
  assert.equal(sp('', 4, []), null);
  assert.equal(sp(null, 4, []), null);
});

test('전원형만 자동 — 「전원 싱글」·「N명 싱글」(N=인원)', () => {
  assert.equal(sp('전원 싱글룸(현지지불)', 4, []).kind, 'all');
  assert.equal(sp('전원 싱글룸 요청(신팀장님 확인)', 8, []).kind, 'all');
  assert.equal(sp('전원 1인실 사용 (한국에서 출발 전 비용 지불 완료)', 4, []).kind, 'all');
  assert.equal(sp('1-5 / 전원 싱글', 8, []).kind, 'all');
  assert.equal(sp('1-12/ 4명 싱글룸희망', 4, []).kind, 'all');   // 4명 = 인원
  assert.equal(sp('1-5/3인 싱글', 3, []).kind, 'all');
  assert.equal(sp('싱글룸 4개', 4, []).kind, 'all');
  // 인원과 개수가 어긋나면 전원형이 아니다
  assert.equal(sp('*머버서님예약건/ 싱글 4방 확정', 8, []).kind, 'unsure');
  assert.equal(sp('1-12/ 4명 싱글룸희망', 6, []).kind, 'unsure');
});

test('대기·불가·만실·취소가 함께 있으면 확정된 요청이 아니다 — 자동 금지', () => {
  assert.equal(sp('싱글룸 2방 대기 희망(7/20 기준 만실 안내 완료)', 4, []).kind, 'blocked');
  assert.equal(sp('전원 싱글룸\n※전달은 하겠지만 불가능한점 안내 완료', 5, []).kind, 'blocked');
  assert.equal(sp('싱글룸 1방 요청합니다\n※일반트윈 변경 희망(어려울수도 있는 점 안내)', 4, []).kind, 'blocked');
  // 「희망」만으로는 막지 않는다 — 현장에서 정상 요청에도 흔히 쓴다
  assert.equal(sp('4명 싱글룸희망', 4, []).kind, 'all');
});

test('체류 일부만 싱글이면 수기', () => {
  assert.equal(sp('4박 특이건\n3박 싱글룸 결제 완료', 1, []).kind, 'part');
  assert.equal(sp('가나다님 4박 후 고노도님 3박 싱글룸 현지결제', 3, []).kind, 'part');
  assert.equal(sp('8/2-8/5 야마나미 숙박 (싱글)\n8/5-8/9 시즈노야도 트리플룸 숙박', 1, []).kind, 'part');
});

test('이름은 문장에서 뽑지 않고 **명단과 대조**한다 — 오탐이 없다', () => {
  const roster = [{ id: 1, name: '허거너' }, { id: 2, name: '파하가' }, { id: 3, name: '김철수' }];
  const r = sp('싱글룸 2개: 허거너, 파하가 / 싱글룸 현지지불\n전기카트 신청', 4, roster);
  assert.equal(r.kind, 'names');
  assert.deepEqual(r.names.map(x => x.name), ['허거너', '파하가']);
  // 적힌 이름이 그 팀 명단에 없으면(다른 팀 사람) 이름으로 확정하지 않는다
  assert.equal(sp('전기카트 신청입니다.\n싱글룸 : 모보소님', 2, [{ id: 1, name: '터퍼허' }]).kind, 'unsure');
  // 싱글과 무관한 줄의 이름은 잡지 않는다
  assert.equal(sp('김철수님 카트 신청\n싱글룸 1개', 4, [{ id: 3, name: '김철수' }]).kind, 'unsure');
});

test('트윈·트리플이 섞이면 전원형이라도 사람이 본다', () => {
  assert.equal(sp('1-13  /싱글2,트윈1/쿠폰사용', 4, []).kind, 'unsure');
  const r = sp('전원 싱글룸\n싱글룸\n버서어, 커터퍼\n트윈룸\n아자차, 바사아', 4,
    [{ id: 1, name: '버서어' }, { id: 2, name: '커터퍼' }]);
  assert.equal(r.kind, 'names');
  assert.equal(r.mixed, true);   // 모순 표시 — 화면이 경고한다
});

test('개수만 있고 누구인지 없으면 수기 — 지금 현장이 보류하는 바로 그 경우', () => {
  assert.equal(sp('싱글룸1개', 3, []).kind, 'unsure');
  assert.equal(sp('싱글룸 요청(신팀장님 확인)', 6, []).kind, 'unsure');
  assert.equal(sp('1인 싱글룸', 3, []).kind, 'unsure');
});

//  싱글 「방 수」만 뽑기 — 누가 쓸지는 현장에서 정해도 몇 방인지는 계약된 수량이다(Min 2026-08).
test('singleCount — 비고에 적힌 싱글 방 수', () => {
  assert.equal(SZCore.singleCount('PUS1-8/선발권 확인 / *머버서님예약건/전체회원가/ 싱글 4방 확정'), 4);
  assert.equal(SZCore.singleCount('싱글룸 4개'), 4);
  assert.equal(SZCore.singleCount('싱글 2실'), 2);
  assert.equal(SZCore.singleCount('シングル4室'), 4);
  assert.equal(SZCore.singleCount('싱글룸 4명 희망'), 4);
  assert.equal(SZCore.singleCount('4방 싱글'), 4);                    // 숫자가 앞에 오는 표기
  assert.equal(SZCore.singleCount('싱글룸 현지에서 배정예정'), 0);     // 수량이 안 적혀 있으면 0
  assert.equal(SZCore.singleCount('트윈 2방'), 0);                    // 싱글 얘기가 아니면 0
  //  대기·불가여도 **수량은 낸다** — 몇 방짜리 요청인지 알아야 준비가 된다(Min 2026-08).
  assert.equal(SZCore.singleCount('싱글룸 4개 대기'), 4);
  assert.equal(SZCore.singleCount('싱글 2실 불가'), 2);
  assert.equal(SZCore.singleCount('싱글룸 대기'), 0);                  // 수량이 안 적혀 있으면 0
  assert.equal(SZCore.singleCount(''), 0);
  assert.equal(SZCore.singleCount(null), 0);
  //  싱글과 멀리 떨어진 숫자는 끌어오지 않는다
  assert.equal(SZCore.singleCount('싱글 요청 / 골프 27홀 4팀'), 0);
});

test('singleOnsite — 누가 쓸지는 현장에서 정하는 건', () => {
  assert.equal(SZCore.singleOnsite('싱글룸 현지에서 배정예정'), true);
  assert.equal(SZCore.singleOnsite('싱글 현장에서 배정'), true);
  assert.equal(SZCore.singleOnsite('싱글룸 현지에서 배정예정\n싱글 4방 확정'), true);
  assert.equal(SZCore.singleOnsite('싱글 4방 확정'), false);          // 수량만 적힌 건 아니다
  assert.equal(SZCore.singleOnsite('현지에서 배정예정'), false);       // 싱글 얘기가 아니면 아니다
  assert.equal(SZCore.singleOnsite(''), false);
});

test('singleTentative — 아직 확정이 아닌 요청은 그 낱말을 돌려준다', () => {
  assert.equal(SZCore.singleTentative('싱글룸 4개 대기'), '대기');
  assert.equal(SZCore.singleTentative('싱글 2실 불가'), '불가');
  assert.equal(SZCore.singleTentative('싱글 4방 확정'), '');
  assert.equal(SZCore.singleTentative('트윈 대기'), '');        // 싱글 얘기가 아니면 빈값
  assert.equal(SZCore.singleTentative(''), '');
});

//  객실 여유 현황 「싱글 신청」 줄 — singleCount 가 못 읽는 실제 비고 표기까지(Min 2026-09, 9~11월 실측 표본)
test('singleRequested — 숫자·전원·이름 나열·못 읽음', () => {
  const r = (t, pax) => SZCore.singleRequested(t, pax);
  assert.deepEqual(r('싱글룸 6개 사용(신팀장님 확인) 비용현지지불\nㄴ로모보,저처커,더러머', 8), { n: 6, how: 'num' });
  assert.deepEqual(r('2인 싱글룸 요청 (현지지불입니다)', 4), { n: 2, how: 'num' });
  assert.deepEqual(r('2싱글 + 1트윈입니다.', 4), { n: 2, how: 'num' });                 // 단위 없는 숫자
  assert.deepEqual(r('1싱글 사용 // 비용 현지결제입니다.', 3), { n: 1, how: 'num' });
  assert.deepEqual(r('싱글룸 1룸 12층으로 요청(비용 현지지불)', 3), { n: 1, how: 'num' });   // 「룸」 단위
  assert.deepEqual(r('전원 싱글룸', 4), { n: 4, how: 'all' });
  assert.deepEqual(r('버서어팀 전원 싱글룸\n\n전원 싱글룸\n버서어, 커터퍼, 나다라', 10), { n: 10, how: 'all' });
  assert.deepEqual(r('전원싱글룸 요청(신팀장님 확인)', 3), { n: 3, how: 'all' });
  assert.deepEqual(r('4명 전원싱글룸/전기카트 신청', 4), { n: 4, how: 'num' });          // 숫자가 있으면 숫자 우선
  assert.deepEqual(r('싱글룸: 차카타,마바사\n호텔 숙박 희망', 4), { n: 2, how: 'names' });
  assert.deepEqual(r('싱글자: 라마바', 4), { n: 1, how: 'names' });
  assert.deepEqual(r('싱글룸 : 타파하', 3), { n: 1, how: 'names' });
  assert.deepEqual(r('싱글룸 김장원', 3), { n: 1, how: 'names' });
  assert.deepEqual(r('서어저,자차카님 싱글룸 사용\n추가요금 현지결제 요청드립니다.', 4), { n: 2, how: 'names' });
  assert.deepEqual(r('하가나님 싱글룸배정 (비용현지지불입니다)', 4), { n: 1, how: 'names' });
  assert.deepEqual(r('싱글룸 사용자 / 너더러,노도로(신팀장님 확인)', 4), { n: 2, how: 'names' });
  assert.deepEqual(r('싱글사용자 퍼허거\n\n※전원 리조트 요청', 6), { n: 1, how: 'names' });   // 「전원」이 싱글 옆이 아니면 전원 아님
  assert.deepEqual(r('방배정\n트윈 룸\n러머버 처커터\n어저처 카타파\n\n싱글 룸\n도로모\n보소오\n사아자\n소오조\n전원 air 별도', 8), { n: 4, how: 'names' });  // 머리줄 아래 이름
  assert.deepEqual(r('싱글룸 :', 4), { n: 0, how: 'none' });                              // 수량 없음 → ?
  assert.deepEqual(r('팀:거너더,다라마\n싱글룸 요청', 4), { n: 0, how: 'none' });
  assert.deepEqual(r('싱글룸 현지에서 배정예정', 4), { n: 0, how: 'none' });
  assert.deepEqual(r('전기카트 신청입니다.', 4), { n: 0, how: '' });                       // 싱글 언급 없음·짝수
  assert.deepEqual(r('전기카트 신청입니다.', 5), { n: 1, how: 'odd' });                    // 홀수 팀 = 남는 한 명 싱글 1방
  assert.deepEqual(r('', 1), { n: 1, how: 'odd' });                                          // 1인 팀도 싱글
  assert.deepEqual(r('트리플 1실 희망', 5), { n: 0, how: '' });                             // 트리플로 간다고 했으면 안 셈
  assert.deepEqual(r('3인 1실 요청', 5), { n: 0, how: '' });                               // 현장 표기 「3인 1실」도 트리플
  assert.deepEqual(r('3인1실', 3), { n: 0, how: '' });
  assert.deepEqual(r('독실 1개(비용 현지지불)', 5), { n: 1, how: 'num' });                    // 「독실」= 싱글
  assert.deepEqual(r('독실: 김장원', 5), { n: 1, how: 'names' });
  assert.equal(SZCore.singleCount('독실 2개'), 2);
  assert.deepEqual(r('3인 투어로 1인 싱글룸 요청', 3), { n: 1, how: 'num' });               // 언급 있으면 비고 수만(중복 없음)
  assert.deepEqual(r('전원 싱글룸', 0), { n: 0, how: 'none' });                           // 인원 모르면 못 읽음
});

// 검수 D14-1 — 「N명 중 1명 싱글」을 전원 싱글로 읽지 않는다: 싱글 줄에 적힌 수량이 모두 팀 인원과 같을 때만 전원(all), 하나라도 다르면 사람에게(unsure)
test('singlePlan — 싱글 줄의 다른 수량(1명·2방·1개)이 팀 인원과 다르면 전원이 아니다', () => {
  assert.equal(sp('4명 중 1명 싱글룸 사용', 4, []).kind, 'unsure');
  assert.equal(sp('8명 싱글 2방', 8, []).kind, 'unsure');
  assert.equal(sp('총 4명, 싱글룸 1개 요청', 4, []).kind, 'unsure');
  assert.equal(sp('6명 (싱글 2명)', 6, []).kind, 'unsure');
  assert.equal(sp('3인 예약 1인 싱글', 3, []).kind, 'unsure');
  // 인원과 같은 수량만 적힌 것은 종전대로 전원
  assert.equal(sp('1-12/ 4명 싱글룸희망', 4, []).kind, 'all');
  assert.equal(sp('4명 1인실 희망', 4, []).kind, 'all');            // 「1인실」의 1인은 수량이 아니다
  assert.equal(sp('4명 싱글 1인 1실 희망', 4, []).kind, 'all');     // 「1인 1실」도 방 쓰는 방식이지 수량이 아니다
  assert.equal(sp('싱글룸 4개', 4, []).kind, 'all');
  assert.equal(sp('4인 싱글 4방', 4, []).kind, 'all');
  assert.equal(sp('전원 싱글룸', 4, []).kind, 'all');
});
// 검수 D14-5 — 구분자(/ , 괄호) 너머의 다른 방 수·「트윈 N방」의 N 을 싱글 수로 읽지 않는다
test('singleCount — 구분자 너머·트윈 방 수를 싱글 수로 읽지 않는다', () => {
  assert.equal(SZCore.singleCount('LGC0001 / 워싱턴(트윈 2방) / 싱글차지 별도'), 0);
  assert.equal(SZCore.singleCount('호텔 트윈 2실 / 싱글차지 현지지불'), 0);
  assert.equal(SZCore.singleCount('트윈 2개, 싱글룸 요청'), 0);
  assert.equal(SZCore.singleCount('부부 2팀(트윈 2방) 싱글 없음'), 0);
  assert.equal(SZCore.singleCount('4방 싱글'), 4);                  // 숫자가 앞에 오는 표기는 그대로
  assert.equal(SZCore.singleCount('2인 싱글룸'), 2);
  assert.equal(SZCore.singleCount('트윈 2방 싱글 1방'), 1);
});

// ── 29차 반박 검토(CORE-4~10) ─────────────────────────────────────────────────────────
//  수량은 싱글이 적힌 **절**(쉼표·슬래시로 끊은 조각) 안에서만 센다 · 가격(1인당·1인 5000엔)과 「각 1실」은 수량이 아니다 ·
//  단위가 룸·분·N싱글·한글 수사·전각 숫자여도 인원과 다르면 전원이 아니다 · 「싱글 없음」은 요청이 아니다
test('singlePlan — 수량 단위가 달라도(룸·분·N싱글·한 명·２방) 인원과 다르면 전원이 아니다', () => {
  for (const s of ['4명 싱글룸 1룸 12층으로', '4명 싱글 1룸', '4인 싱글룸 2룸', '4명 1싱글 사용', '4명 2싱글 1투윈', '4명 중 한 명 싱글',
    '4명 중 한명만 싱글룸', '4명 중 1분 싱글룸 사용', '4명 중 대표자만 싱글', '4명 일부 싱글', '4인팀 싱글룸 한개', '4인 싱글 두개',
    '4명 싱글 ２방', '4명 싱글 1', '4명 싱글 1객실', '4명 싱글 1室', '4명 싱글룸 (2명만)', '싱글룸 1개 / 전원 AIR 별도', '전원 싱글룸 2개', '4명 싱글룸 1인 사용'])
    assert.equal(sp(s, 4, []).kind, 'unsure', s);
});
test('singlePlan — 같은 줄의 가격·다른 항목 수량 때문에 전원 싱글이 보류로 떨어지지 않는다', () => {
  for (const s of ['4명 싱글룸 희망 (1인 15000엔 현지지불)', '4명 싱글룸 1인당 5천엔 추가', '4명 싱글 1명당 5000엔', '4명 싱글룸 추가요금 1인 2만원',
    '4명 싱글룸\n싱글차지 1인 5000엔 현지지불', '4명 각 1실 싱글', '4명 각자 1방씩 싱글', '싱글룸 4개, 전기카트 1개 신청', '4명 싱글룸 / 전기카트 1개',
    '4명 싱글룸 희망 / 전기카드 1개 신청 / 2인용으로 사용예정', '4명 싱글룸 / 2인 AIR 별도', '4명 싱글룸, 골프 3인 플레이', '4명 싱글룸 (석식 3명)',
    '4명 싱글룸 추가요금 없음', '4분 싱글룸 사용', '싱글룸 4룸'])
    assert.equal(sp(s, 4, []).kind, 'all', s);
  assert.equal(sp('8인 싱글룸 8개 (2개동)', 8, []).kind, 'all');
  assert.equal(sp('전원 싱글룸 요청(신팀장님 확인)', 8, []).kind, 'all');      // 「확인」만으로는 막지 않는다
});
test('singlePlan — 「싱글룸 없음·사용 안함·X」는 요청이 아니다(blocked) · 「미정·문의·확인 요청」은 사람에게(unsure)', () => {
  for (const s of ['4명 싱글룸 없음', '4명 싱글 요청 없음', '4명 싱글룸 사용 안함', '4명 싱글 아님', '4명 싱글룸 X', '4명 no single', 'シングルなし'])
    assert.equal(sp(s, 4, []).kind, 'blocked', s);
  for (const s of ['4명 싱글 미정', '4명 싱글 희망하나 미정', '4명 싱글룸 가능한지 문의', '4명 싱글 여부 확인요청', '전원 싱글룸 가능 여부 확인 부탁드립니다'])
    assert.equal(sp(s, 4, []).kind, 'unsure', s);
  // 한 팀은 없음, 다른 줄은 요청 — 남은 요청만 읽는다
  assert.equal(sp('A팀 싱글 없음\n싱글룸 4개', 4, []).kind, 'all');
});
test('singleCount — 숫자 바로 앞이 트윈일 때만 건너뛴다 · 괄호·쉼표로 붙여 쓴 싱글 수는 센다 · 「1인 1실」·가격은 수가 아니다', () => {
  const eq = (s, n) => assert.equal(SZCore.singleCount(s), n, s);
  // CORE-6 — 6자 안에 트윈이 있다는 이유만으로 버리지 않는다
  eq('트윈 2방 2명 싱글', 2); eq('2명은 트윈, 2명은 싱글', 2); eq('2명은 싱글, 2명은 트윈', 2); eq('2명은 싱글, 3명은 트윈', 2); eq('2명 트윈 2명 싱글', 2);
  eq('2방 트윈 2방 싱글', 2); eq('더블 1방 2명 싱글룸', 2); eq('트윈 1방\n2명 싱글', 2); eq('트윈에서 2명 싱글로 변경', 2); eq('트윈 대신 2방 싱글로', 2);
  // CORE-7 — 「N방(싱글)」「N명/싱글룸」「N명, 싱글룸」
  eq('2방(싱글)', 2); eq('2명(싱글룸)', 2); eq('2명 (싱글)', 2); eq('2室（シングル）', 2); eq('2실/싱글', 2); eq('2명/싱글룸', 2);
  eq('2명, 싱글룸 사용', 2); eq('4명、シングル', 4); eq('2인(싱글 사용)', 2); eq('4名 シングル', 4);
  // 여전히 세지 않는 것
  eq('트윈 2방 싱글룸 희망', 0); eq('성인 2명, 싱글차지 별도', 0); eq('4명, 싱글차지 포함 상품 아님', 0); eq('싱글차지 1인 5000엔 현지지불', 0);
  eq('싱글, 트윈 2방', 0); eq('2방 트윈, 싱글 희망', 0); eq('8/5 싱글룸 사용', 0); eq('2인실 싱글 아님', 0);
  // CORE-9 — 「1인 1실」의 1 은 수량이 아니다
  eq('4명 싱글 1인 1실 희망', 4); eq('4명 모두 1인 1실 싱글', 4);
  // 단위 「룸」·「N싱글」 — 객실 여유 현황(singleRequested)과 같은 수
  eq('싱글룸 1룸 12층으로 요청', 1); eq('2싱글 + 1트윈입니다.', 2); eq('1싱글 사용', 1); eq('4명 2싱글 1투윈', 2);
  // 「싱글 없음」은 0 — 다른 줄에 요청이 있으면 그 수
  eq('부부 2팀(트윈 2방) 싱글 없음', 0); eq('4명 싱글룸 없음', 0); eq('A팀 싱글 2방 / B팀 싱글 없음', 2);
  // 전각 숫자
  eq('싱글 ２방', 2);
  // 한글 수사 · 분 · 단위 없이 붙여 쓴 수
  eq('4인팀 싱글룸 한개', 1); eq('4인 싱글 두개', 2); eq('4명 중 한 명 싱글', 1); eq('4명 중 1분 싱글룸 사용', 1); eq('사용한 방 싱글', 0);
  eq('여행사: 다나투어 / 3명 트윈1 싱글1', 1); eq('트윈2 싱글1', 1); eq('1-13  /싱글2,트윈1/쿠폰사용', 2); eq('싱글룸 12층 희망', 0); eq('싱글룸 2', 2);
  // 「싱글차지 없음」은 요청이 아니다 · 「싱글차지 없이 싱글룸 사용」은 요청
  eq('전기카트 1대, 싱글차지 없음', 0); eq('싱글차지 없이 싱글룸 2개 사용', 2);
});
test('singleRequested — 요금 얘기뿐인 줄은 이름으로 세지 않는다 · 「싱글 없음」은 수요 없음', () => {
  const r = (t, pax) => SZCore.singleRequested(t, pax);
  assert.deepEqual(r('LGC0001 / 워싱턴(트윈 2방) / 싱글차지 별도', 4), { n: 0, how: 'none' });
  assert.deepEqual(r('호텔 트윈 2실 / 싱글차지 현지지불', 4), { n: 0, how: 'none' });
  assert.deepEqual(r('성인 2명, 싱글차지 별도', 2), { n: 0, how: 'none' });
  assert.deepEqual(r('부부 2팀(트윈 2방) 싱글 없음', 4), { n: 0, how: '' });
  assert.deepEqual(r('4명 싱글룸 없음', 4), { n: 0, how: '' });
  assert.deepEqual(r('싱글 없음', 5), { n: 1, how: 'odd' });                               // 홀수 팀의 남는 한 명은 방배정이 싱글 객실에 넣는다 — 비고가 없는 홀수 팀과 같은 수(2차 검토 SINGLE-11)
  assert.deepEqual(r('4명 싱글 1인 1실 희망', 4), { n: 4, how: 'num' });
  assert.deepEqual(r('싱글차지 2명 현지지불', 4), { n: 2, how: 'num' });                   // 요금 얘기라도 수가 붙어 있으면 그 수
  assert.deepEqual(r('싱글룸 김장원 / 싱글차지 별도', 3), { n: 1, how: 'names' });         // 이름이 적힌 쪽은 그대로
  assert.deepEqual(r('전기카트 1대, 싱글차지 없음', 4), { n: 0, how: '' });                 // 요금이 없다는 말 = 싱글 수요 없음
  assert.deepEqual(r('트윈2 싱글1', 5), { n: 1, how: 'num' });
  assert.deepEqual(r('싱글차지 비용 현지 결제 요청드립니다.', 3), { n: 1, how: 'odd' });      // 요금 얘기뿐 + 홀수 팀 = 남는 한 명
  assert.deepEqual(r('싱글차지 비용 현지 결제 요청드립니다.', 4), { n: 0, how: 'none' });     // 짝수 팀이면 비고 확인(「?」)
  assert.deepEqual(r('싱글룸:', 3), { n: 0, how: 'none' });                                  // 요금 얘기가 아니라 빈 목록 — 종전대로 「?」
});

// 29차 — 실제 비고 꼴(이름은 지어낸 것)로 고정: 예약 순번 뒤의 「/」는 구분자 · 「전원」 옆의 큰 수는 묶은 팀 전체 인원 · 다른 절의 「전원」은 싱글 얘기가 아니다
test('싱글 판정 — 실제 비고에 흔한 꼴(순번 접두·팀 전체 인원·다른 절의 전원·1인 1실 N방)', () => {
  const eq = (s, n) => assert.equal(SZCore.singleCount(s), n, s);
  eq('1-1/4싱글', 4); eq('2-5/4싱글 확', 4); eq('1트윈/1싱글/1-12', 1); eq('2-1 /팀:가나다,라마바 / 2싱글', 2); eq('1-2/싱글룸2', 2); eq('PUS1-2/싱글4', 4);
  eq('8/5 싱글룸 사용', 0); eq('12/5 싱글', 0); eq('2026/12/5 싱글', 0);
  eq('1인 1실 2방 이용 예정 (싱글차지 지불 완료)', 2);
  assert.deepEqual(SZCore.singleRequested('1-1/4싱글', 4), { n: 4, how: 'num' });
  assert.deepEqual(SZCore.singleRequested('1인 1실 2방 이용 예정 (싱글차지 지불 완료)', 2), { n: 2, how: 'num' });
  assert.equal(sp('팀:가나다+라마바\n4명 전원싱글룸/전기카트 신청', 3, []).kind, 'all');          // 이 예약은 3명, 적힌 4명은 묶은 팀 전체
  assert.equal(sp('전원 싱글룸 8명', 4, []).kind, 'all');
  assert.equal(sp('전원 싱글룸 2개', 4, []).kind, 'unsure');                                    // 인원보다 작은 수는 모순
  assert.equal(sp('2-3/1인 싱글 / 전원 사전좌석 완료0401', 3, []).kind, 'unsure');               // 「전원」은 좌석 얘기
  assert.equal(sp('입금완료/전원 좌석/1-6/싱글1개', 5, []).kind, 'unsure');
  assert.equal(sp('3인 투어로 1인 싱글룸 요청', 3, []).kind, 'unsure');                          // 3명 중 1명만 싱글
  assert.equal(sp('1인 1실 2방 이용 예정 (싱글차지 지불 완료)', 2, []).kind, 'all');
  assert.equal(sp('1-1/4싱글', 4, []).kind, 'unsure');                                          // 단위 없는 수만으로는 전원이라 하지 않는다(종전과 같다)
});

// 29차 검증 반영 — ① 싱글 절 안에 요금 낱말 없이 붙은 「1인·1명 + 금액」은 한 명만 싱글이라는 뜻일 수 있다 → 전원으로 읽지 않는다(「추가요금 1인 2만원」「싱글차지 1인 5000엔」·괄호 안 덧말은 가격)
//   ② 「4명 중식」「중간」의 「중」은 「N명 중 …」이 아니다 ③ 「3일부터·5일까지」는 체류 일부(사람에게) ④ 「4명 트윈 2방 싱글차지 별도」의 2방은 트윈의 수
test('싱글 판정 — 금액이 붙은 1인·「중식」·「N일부터」·트윈 뒤 싱글차지', () => {
  for (const s of ['4명 싱글 1명 15000엔 현지지불', '4명 싱글 1인 15000엔', '4명 / 싱글 1명 15000엔 현지지불', '4명 / 싱글 1인 15000엔 현지지불', '4명 (싱글 1명 15000엔)'])
    assert.equal(sp(s, 4, []).kind, 'unsure', s);
  assert.equal(sp('4명 싱글룸 희망 (1인 15000엔 현지지불)', 4, []).kind, 'all');   // 인원+싱글이 한 절에 있고 금액은 괄호 안의 덧말 — 1인당 가격으로 읽는다
  assert.equal(SZCore.singleCount('4명 싱글룸 희망 (1인 15000엔 현지지불)'), 4);     // 배정 판정(all)과 표시 수량이 같아야 한다
  assert.equal(SZCore.singleCount('4명 (싱글 1명 15000엔)'), 1);
  assert.equal(SZCore.singleCount('4명 / 싱글 1명 15000엔 현지지불'), 1);
  assert.equal(SZCore.singleCount('4명 / 싱글 1인 15000엔 현지지불'), 1);
  for (const s of ['4명 싱글룸 추가요금 1인 2만원', '4명 싱글룸\n싱글차지 1인 5000엔 현지지불', '4명 싱글룸 1인당 15000엔', '4명 중식 포함 싱글룸', '4명 중간층 싱글룸'])
    assert.equal(sp(s, 4, []).kind, 'all', s);
  for (const s of ['4명 중 1명 싱글', '4명 중 대표자만 싱글', '4명 일부 싱글'])
    assert.equal(sp(s, 4, []).kind, 'unsure', s);
  for (const s of ['4명 싱글룸 3일부터 사용', '4명 싱글룸 5일까지', '전원 싱글룸 2일차부터'])
    assert.equal(sp(s, 4, []).kind, 'part', s);
  for (const s of ['성인 4명 트윈 2방 싱글차지 별도', '트윈 2방 싱글차지 별도', '4명 트윈룸 2개 싱글차지 포함', '4인 트윈2 싱글차지 포함'])
    assert.equal(SZCore.singleCount(s), 0, s);
  assert.equal(SZCore.singleCount('2명 트윈 2명 싱글'), 2);
  assert.equal(SZCore.singleCount('2명 싱글차지 현지지불'), 2);
});

// 29차 검증 반영(CORE-8) — 요금 얘기뿐인 줄(「싱글차지 별도」)의 이름은 같은 조각(마지막 「/」 뒤) 안에서만 센다 · 「차지·없음·성인」은 낱말 전체일 때만 이름에서 뺀다
test('singleRequested — 요금 줄의 앞 조각(호텔 이름 등)을 이름으로 세지 않는다 · 「차지」로 시작하는 이름은 이름이다', () => {
  for (const s of ['LGC0001 / 워싱턴(트윈 2방) / 싱글차지 별도', '호텔 트윈 2실 / 싱글차지 현지지불', '성인 2명, 싱글차지 별도', '트윈 2방 싱글차지 별도', '4명, 싱글차지 포함 상품 아님', '부부 2팀 싱글차지 별도'])
    assert.deepEqual(SZCore.singleRequested(s, 4), { n: 0, how: 'none' }, s);
  assert.deepEqual(SZCore.singleRequested('홍길동, 가나다 싱글차지 현지지불', 4), { n: 2, how: 'names' });
  assert.deepEqual(SZCore.singleRequested('싱글룸: 차지누, 가나다', 4), { n: 2, how: 'names' });
  assert.deepEqual(SZCore.singleRequested('싱글룸: 홍길동, 없음', 4), { n: 1, how: 'names' });
});

// ── 29차 2차 반박 검토(SINGLE-1~11 · PARTNER-5) ─────────────────────────────────────────
//  원칙은 같다: 틀리면 방배정과 추가요금이 함께 틀어지므로 **자동(all·names)은 확실할 때만**, 애매하면 사람에게.
test('SINGLE-1 일본어로 적힌 취소·대기·부정·기간은 자동 배정하지 않는다 · 일본어 단위의 수량만으로는 전원이라 하지 않는다', () => {
  for (const s of ['シングル4室 キャンセル', 'シングル4室 キャンセル待ち', '4名シングル 満室', 'シングル4室 保留', '全員シングル キャンセル', '全員シングル不可'])
    assert.equal(sp(s, 4, []).kind, 'blocked', s);
  for (const s of ['4名 シングル利用なし', '4名 シングル使用しない', 'シングル不要', 'シングルは使いません'])
    assert.equal(sp(s, 4, []).kind, 'blocked', s);
  for (const s of ['シングル4室 2泊', 'シングル4室 3日から', '全員シングル 2泊のみ'])
    assert.equal(sp(s, 4, []).kind, 'part', s);
  for (const s of ['シングル4室 可否確認', '全員シングル 未確定', '全員シングル 要確認', 'シングル4室', '4名シングル'])
    assert.equal(sp(s, 4, []).kind, 'unsure', s);
  assert.equal(sp('全員シングル', 4, []).kind, 'all');                 // 배포본과 같다
  assert.equal(SZCore.singleCount('シングル4室'), 4);                  // 수량 표시는 그대로
});

test('SINGLE-2 싱글 수량 바로 뒤에 트윈이 이어져도 싱글의 수는 싱글의 수', () => {
  const eq = (s, n) => assert.equal(SZCore.singleCount(s), n, s);
  eq('싱글 1방 트윈 2방', 1); eq('싱글룸 1개 트윈룸 2개', 1); eq('싱글 2명 트윈 2명', 2); eq('シングル1室 ツイン2室', 1);
  eq('4명 싱글 2방 트윈 1방', 2); eq('2트윈 1싱글', 1); eq('싱글 1방, 트윈 2방', 1);
  eq('2명은 싱글, 3명은 트윈', 2); eq('트윈1 싱글1', 1); eq('트윈 2방 싱글 1방', 1); eq('싱글, 트윈 2방', 0);
  assert.deepEqual(SZCore.singleRequested('싱글 1방 트윈 2방', 5), { n: 1, how: 'num' });
  assert.deepEqual(SZCore.singleRequested('4명 싱글 2방 트윈 1방', 4), { n: 2, how: 'num' });
});

test('SINGLE-3·PARTNER-5 싱글 뒤의 날짜(12/1)의 월을 방 수로 읽지 않는다', () => {
  const eq = (s, n) => assert.equal(SZCore.singleCount(s), n, s);
  eq('전원 싱글룸 12/1 입국', 0); eq('전원 싱글룸 11/3~11/5', 0); eq('싱글룸 8/5 체크인', 0); eq('싱글룸 2/14 입금완료', 0);
  eq('싱글 12/1~12/3', 0); eq('싱글룸 12/2 부터', 0); eq('싱글룸 11/5~11/7 2박만', 0); eq('싱글 2/11', 0);
  eq('싱글 2/트윈 1', 2); eq('1-13  /싱글2,트윈1/쿠폰사용', 2); eq('싱글룸 2', 2); eq('싱글2/트윈1', 2);
  assert.equal(sp('4명 싱글룸 12/1 입국', 4, []).kind, 'all');
  assert.equal(sp('4명 싱글룸 12/3 확정', 4, []).kind, 'all');
  assert.deepEqual(SZCore.singleRequested('전원 싱글룸 12/1 입국', 4), { n: 4, how: 'all' });
  assert.equal(SZCore.singleRequested('싱글 12/1~12/3', 4).n, 0);
});

test('SINGLE-4 천 단위 쉼표가 든 금액(15,000엔)도 가격으로 읽는다', () => {
  for (const s of ['4명 싱글룸 추가요금 1인 15,000엔', '4명 싱글룸 1인당 15,000엔', '4명 싱글룸 15,000엔 현지지불', '4명 싱글룸 싱글차지 1인 15,000엔',
    '4명 싱글룸 추가요금 1인 20,000원 현지지불', '4명 싱글룸 희망 (1인 15,000엔 현지지불)']) {
    assert.equal(sp(s, 4, []).kind, 'all', s);
    assert.equal(SZCore.singleCount(s), 4, s);
  }
  assert.equal(sp('4명 싱글 1명 15,000엔 현지지불', 4, []).kind, 'unsure');       // 요금 낱말 없이 붙은 「1명 + 금액」은 한 명만 싱글일 수 있다(쉼표가 있어도 같다)
});

test('SINGLE-5 흔한 부정·취소·질문 꼴 — 전원으로 읽지 않는다', () => {
  for (const s of ['4명 싱글룸 사용하지 않음', '4명 싱글룸 사용하지 않습니다', '전원 싱글룸 사용하지 않음', '4명 싱글룸 미사용', '4명 싱글 미신청', '4명 싱글룸 희망하지 않음',
    '4명 싱글 안 씁니다', '4명 싱글룸 해당 없음', '4명 싱글룸 (없음)', '4명 싱글룸: 없음', '4명 싱글룸 안됨', '4명 싱글룸 방 없음', '싱글룸 4개 캔슬', '싱글룸 4개 철회'])
    assert.equal(sp(s, 4, []).kind, 'blocked', s);
  for (const s of ['전원 싱글 미확정', '전원 싱글 희망 (확정 아님)', '전원 싱글룸 가능할까요?', '4명 싱글룸 가능한가요?', '4명 싱글룸 되나요?', '전원 싱글 검토중',
    '전원 싱글룸 아직 안 정함', '4명 싱글룸 못 쓸 수도 있음'])
    assert.equal(sp(s, 4, []).kind, 'unsure', s);
  // 평범한 요청은 그대로 전원
  for (const s of ['4명 싱글룸 희망합니다', '전원 싱글룸 요청드립니다. 안내 부탁드립니다', '4명 싱글룸 사용 예정', '전원 싱글룸 확정', '4명 싱글룸 조식 없음', '전원 싱글룸 (추가요금 없음)'])
    assert.equal(sp(s, 4, []).kind, 'all', s);
});

test('SINGLE-6 이름 대조 — 「제외·빼고·전원·○○팀」과 함께면 이름으로 확정하지 않는다 · 트윈 쪽에 적힌 이름은 싱글이 아니다', () => {
  const R = [{ id: 1, name: '홍길동' }, { id: 2, name: '가나다' }, { id: 3, name: '마바사' }, { id: 4, name: '아자차' }];
  const nm = (t, pax, r) => { const p = sp(t, pax, r || R); return p.kind + (p.names ? '[' + p.names.map(x => x.name).join(',') + ']' : ''); };
  assert.equal(nm('홍길동 제외 전원 싱글', 4), 'unsure');
  assert.equal(nm('전원 싱글 (홍길동 제외)', 4), 'unsure');
  assert.equal(nm('홍길동 빼고 싱글룸', 4), 'unsure');
  assert.equal(nm('트윈: 홍길동, 가나다 / 싱글: 마바사, 아자차', 4), 'names[마바사,아자차]');
  assert.equal(nm('싱글: 마바사, 아자차 / 트윈: 홍길동, 가나다', 4), 'names[마바사,아자차]');
  assert.equal(nm('트윈 홍길동 가나다 싱글 마바사 아자차', 4), 'names[마바사,아자차]');
  assert.equal(nm('홍길동 가나다 트윈, 마바사 아자차 싱글', 4), 'names[마바사,아자차]');
  assert.equal(nm('홍길동팀 전원 싱글룸', 4), 'all');
  assert.equal(nm('홍길동 외 3명 싱글룸', 4), 'unsure');
  assert.equal(nm('싱글룸 4개 (담당 홍길동)', 4), 'all');
  assert.equal(nm('싱글룸: 가나다', 4, [{ id: 1, name: '가나' }, { id: 2, name: '가나다' }]), 'names[가나다]');   // 긴 이름 안의 짧은 이름은 세지 않는다
  // 종전대로 읽히는 꼴
  assert.equal(nm('홍길동 싱글룸, 나머지 트윈', 4), 'names[홍길동]');
  assert.equal(nm('싱글룸: 홍길동, 가나다', 4), 'names[홍길동,가나다]');
  assert.equal(nm('홍길동, 가나다 싱글룸 사용', 4), 'names[홍길동,가나다]');
  assert.equal(nm('홍길동님, 가나다님 싱글룸 사용\n추가요금 현지결제', 4), 'names[홍길동,가나다]');
  assert.equal(nm('싱글 룸\n홍길동\n가나다\n트윈룸\n마바사\n아자차', 4), 'names[홍길동,가나다]');
  assert.equal(nm('싱글룸 2개: 홍길동, 가나다 / 싱글룸 현지지불\n전기카트 신청', 4), 'names[홍길동,가나다]');
});

test('SINGLE-7 같은 글은 세 함수가 같은 수를 말한다 — 전원(all)이면 신청 수 = 인원', () => {
  for (const [s, p] of [['4명 싱글룸 (석식 3명)', 4], ['4명 싱글룸, 골프 3인 플레이', 4], ['4명 싱글룸 / 2인 AIR 별도', 4], ['4명 중식 포함 싱글룸', 4],
    ['전원 1인 1실 싱글룸 사용', 4], ['전원 싱글룸 8명', 4], ['8명 싱글룸 (2개동)', 8], ['4명 싱글룸 희망 / 전기카드 1개 신청 / 2인용으로 사용예정', 4],
    ['싱글룸 4개, 전기카트 1개 신청', 4], ['전원 싱글룸', 4], ['4명 싱글룸 추가요금 1인 2만원', 4]]) {
    assert.equal(sp(s, p, []).kind, 'all', s);
    assert.deepEqual(SZCore.singleRequested(s, p).n, p, s);
  }
  for (const [s, n] of [['4명 싱글룸 (석식 3명)', 4], ['4명 싱글룸, 골프 3인 플레이', 4], ['4명 싱글룸 / 2인 AIR 별도', 4], ['8명 싱글룸 (2개동)', 8], ['싱글룸(2개)', 2], ['싱글(2명)', 2], ['싱글룸: 2개', 2]])
    assert.equal(SZCore.singleCount(s), n, s);
});

test('SINGLE-8 다른 절의 기한(15일까지)·다른 항목의 미정은 싱글 얘기가 아니다', () => {
  for (const s of ['전원 싱글룸 / 잔금 15일까지 입금', '전원 싱글룸 / 명단 20일까지 전달', '4명 싱글룸, 여권 10일까지', '전원 싱글룸 (카트 미정)', '전원 싱글룸, 카트 미정', '싱글룸\t4개'])
    assert.equal(sp(s, 4, []).kind, 'all', s);
  for (const s of ['4명 싱글룸 3일부터 사용', '전원 싱글 15일까지'])
    assert.equal(sp(s, 4, []).kind, 'part', s);
  for (const s of ['전원 싱글룸 (미정)', '전원 싱글룸 미정', '전원 싱글룸 (확인 요청)'])
    assert.equal(sp(s, 4, []).kind, 'unsure', s);
});

test('SINGLE-9 빈칸·숫자가 길게 이어져도 느려지지 않는다', () => {
  let t0 = Date.now();
  for (const n of [100, 200, 400]) { const t = '4명 싱글룸' + ' '.repeat(n) + '요청'; sp(t, 4, []); SZCore.singleCount(t); SZCore.singleRequested(t, 4); }
  for (const n of [120, 300]) { const t = '싱글' + ' \n'.repeat(n); sp(t, 4, []); SZCore.singleCount(t); SZCore.singleRequested(t, 4); }
  assert.ok(Date.now() - t0 < 600, '빈칸 ' + (Date.now() - t0) + 'ms');
  t0 = Date.now();
  const big = '싱글룸 ' + '1'.repeat(5000) + '엔';
  sp(big, 4, []); SZCore.singleCount(big); SZCore.singleRequested(big, 4);
  assert.ok(Date.now() - t0 < 600, '숫자 ' + (Date.now() - t0) + 'ms');
  assert.equal(sp('4명 싱글룸' + ' '.repeat(300) + '요청', 4, []).kind, 'all');          // 빈칸이 길어도 판정은 같다
});

test('SINGLE-10 보류·차단의 이유를 함께 돌려준다(화면이 사유를 맞게 적는다)', () => {
  assert.equal(sp('싱글룸 없음', 4, []).why, 'none');            // 요청이 없다 — 배지를 붙이지 않는다
  assert.equal(sp('4명 싱글룸 사용 안함', 4, []).why, 'none');
  assert.equal(sp('싱글룸 2방 대기', 4, []).why, 'block');        // 대기·불가·취소 — 확정이 아니다
  assert.equal(sp('전원 싱글 미정', 4, []).why, 'ask');
  assert.equal(sp('전원 싱글룸 가능 여부 확인 부탁드립니다', 4, []).why, 'ask');
  assert.equal(sp('4명 중 1명 싱글룸 사용', 4, []).why, 'partial');
  assert.equal(sp('홍길동 제외 전원 싱글', 4, [{ id: 1, name: '홍길동' }]).why, 'partial');
  assert.equal(sp('싱글룸 1개', 4, []).why, 'who');
  assert.equal(sp('싱글룸 요청', 4, []).why, 'who');
});

test('SINGLE-11 「싱글 없음」이라고 적힌 홀수 팀 — 남는 한 명은 방배정이 싱글 객실에 넣는다(신청 수도 1)', () => {
  const r = (t, pax) => SZCore.singleRequested(t, pax);
  assert.deepEqual(r('싱글룸 없음', 5), { n: 1, how: 'odd' });
  assert.deepEqual(r('싱글차지 없음', 5), { n: 1, how: 'odd' });
  assert.deepEqual(r('싱글 없음', 4), { n: 0, how: '' });
  assert.deepEqual(r('싱글룸 없음 / 트리플 1실', 5), { n: 0, how: '' });      // 트리플로 간다고 적었으면 세지 않는다
});

// 29차 2차 검토 — 실제 비고의 꼴(이름은 지어낸 것)로 고정: 팀 이름표(「팀:○○,○○」「○○4,○○2」「○○님예약건」)의 이름은 싱글 사용자가 아니다.
//  배포본은 이런 글에서 이름표의 한 사람만 싱글로 읽었다(「… / 전원 싱글룸」 팀인데 한 명만 싱글 객실에 들어감).
test('singlePlan — 팀 이름표의 이름은 싱글 사용자가 아니다 · 이름이 싱글 쪽에 적힌 꼴은 그대로 읽는다', () => {
  const R = [{ id: 1, name: '홍길동' }, { id: 2, name: '가나다' }, { id: 3, name: '마바사' }, { id: 4, name: '아자차' }];
  const nm = (t, pax, r) => { const p = sp(t, pax, r || R); return p.kind + (p.names ? '[' + p.names.map(x => x.name).join(',') + ']' : ''); };
  assert.equal(nm('PUS1-1팀:홍길동,라라라 / 싱글2개', 4), 'unsure');
  assert.equal(nm('1-13/라라라, 홍길동 팀/1인 싱글', 3), 'unsure');
  assert.equal(nm('2-1 /팀:홍길동,라라라 / 2싱글', 4), 'unsure');
  assert.equal(nm('1-11//홍길동4,라라라2,하하하2 / 전원 싱글룸', 4), 'all');
  assert.equal(nm('발권완료/1-11/홍길동4,라라라2,하하하1 / 전원 싱글룸', 4), 'all');
  assert.equal(nm('PUS1-4/팀:라라라,홍길동 / 싱글4개', 4), 'all');
  assert.equal(nm('홍길동팀 전원 싱글룸\n\n전원 싱글룸\n홍길동, 라라라, 하하하\n가나다, 마바사', 4), 'all');
  assert.equal(nm('싱글룸 현지에서 배정예정\nPUS1-8/선발권 확인 / *홍길동님예약건/전체회원가/ 싱글 4방 확정', 8), 'unsure');
  assert.equal(nm('1-14\n홍길동팀 + 라라라팀/ 싱글룸 1개 요청', 5), 'unsure');
  assert.equal(nm('2인싱글\nPUS1-15/라라라/홍길동/하하하/2인싱글', 2), 'all');
  // 이름이 싱글 쪽에 적힌 꼴 — 명단 순서로 돌려준다
  assert.equal(nm('싱글룸 2방(가나다, 홍길동 사용) 현지지불', 4), 'names[홍길동,가나다]');
  assert.equal(nm('팀:라라라,홍길동\n\n싱글룸 사용자 / 홍길동,가나다(신팀장님 확인)', 4), 'names[홍길동,가나다]');
  assert.equal(nm('팀:홍길동,라라라\n싱글룸 :아자차,가나다', 4), 'names[가나다,아자차]');
  assert.equal(nm('1. 트윈(홍길동, 가나다) / 싱글(마바사) : 싱글룸 비용 사전 지불 완료', 3), 'names[마바사]');
  assert.equal(nm('가나다, 홍길동, 마바사 3인 싱글룸사용\n리조트 변경 희망', 7), 'names[홍길동,가나다,마바사]');
  assert.equal(nm('마바사, 가나다 님 싱글 요청드립니다. 현지 결제입니다.\n전원 리조트 요청드립니다.', 12), 'names[가나다,마바사]');
  // 긴 이름 안의 짧은 이름 · 같은 이름이 명단에 둘
  assert.equal(nm('가나다라 1인 싱글룸 사용(비용 현지지불)', 13, [{ id: 1, name: '가나다라' }, { id: 2, name: '나다' }]), 'names[가나다라]');
  assert.equal(sp('싱글룸 홍길동', 3, [{ id: 1, name: '홍길동' }, { id: 2, name: '홍길동' }, { id: 3, name: '가나다' }]).kind, 'unsure');   // 같은 이름이 둘 — 누구인지 정할 수 없으면 사람에게
  assert.equal(nm('싱글룸 가나다', 3, [{ id: 1, name: '홍길동' }, { id: 2, name: '홍길동' }, { id: 3, name: '가나다' }]), 'names[가나다]');
});

test('singleRequested: 상태를 말하는 낱말(취소·만실·확정·문의 …)은 싱글 쓰는 사람 이름이 아니다', () => {
  const r = (t, pax) => SZCore.singleRequested(t, pax);
  for (const w of ['취소', '캔슬', '만실', '마감', '미정', '문의', '확정', '완료', '웨이팅', '철회'])
    assert.deepEqual(r('싱글룸 ' + w, 4), { n: 0, how: 'none' }, w);
  assert.deepEqual(r('싱글룸 홍길동, 가나다', 4), { n: 2, how: 'names' });      // 이름은 그대로 센다
  assert.deepEqual(r('싱글룸 취소', 5), { n: 0, how: 'none' });                  // 싱글 얘기가 있으면 홀수 규칙으로 넘기지 않는다(사람이 본다)  assert.deepEqual(r('싱글룸 취소', 1), { n: 1, how: 'odd' });                   // 혼자 온 손님은 어떻게 적혀 있든 방 하나
  assert.deepEqual(r('싱글룸 3박만 사용 확정', 1), { n: 1, how: 'odd' });
});

// ── 검증안과의 맞대조에서 드러난 빈틈(2026-11) ──
const R4 = [{ id: 1, name: '홍길동' }, { id: 2, name: '가나다' }, { id: 3, name: '라마바' }, { id: 4, name: '사아자' }];
test('쉼표 뒤에 이어진 물음·기간은 그 싱글의 것이다 — 다른 항목이 적힌 조각·흔한 맺음말(특이사항 없음)은 아니다', () => {
  assert.equal(sp('싱글룸: 홍길동, 가나다 가능할까요?', 4, R4).kind, 'unsure');
  assert.equal(sp('전원 싱글룸, 가능할까요?', 4, R4).kind, 'unsure');
  assert.equal(sp('전원 싱글룸, 미정', 4, R4).kind, 'unsure');
  assert.equal(sp('전원 싱글룸, 3일부터', 4, R4).kind, 'part');
  assert.equal(sp('전원 싱글룸, 아직 안 정함', 4, R4).kind, 'unsure');
  assert.equal(sp('전원 싱글룸, 석식 3일부터', 4, R4).kind, 'all');
  assert.equal(sp('전원 싱글룸, 캐디 미정', 4, R4).kind, 'all');
  assert.equal(sp('전원 싱글룸, 특이사항 없음', 4, R4).kind, 'all');
  assert.equal(sp('전원 싱글룸 특이사항 없음', 4, R4).kind, 'all');
  assert.equal(sp('전원 싱글룸, 문의사항 없음', 4, R4).kind, 'all');
  assert.equal(sp('전원 싱글룸, 변경 없음', 4, R4).kind, 'all');
  assert.equal(sp('전원 싱글룸, 잘 부탁드립니다', 4, R4).kind, 'all');
  assert.deepEqual(sp('싱글룸: 홍길동, 가나다', 4, R4).names.map(x => x.name), ['홍길동', '가나다']);
});
test('「전원」과 이름이 같은 조각에 있는데 이름 수가 인원과 다르면 사람이 본다(다른 조각의 팀 이름표는 그대로 전원)', () => {
  assert.equal(sp('전원 싱글룸: 홍길동, 가나다', 4, R4).kind, 'unsure');
  assert.equal(sp('전원 싱글룸 홍길동', 4, R4).kind, 'unsure');
  assert.equal(sp('전원 싱글룸: 홍길동, 가나다, 라마바, 사아자', 4, R4).kind, 'all');
  assert.equal(sp('팀:홍길동,가나다 / 전원 싱글룸', 4, R4).kind, 'all');
  assert.equal(sp('홍길동4,가나다2 / 전원 싱글룸', 4, R4).kind, 'all');
  assert.equal(sp('홍길동팀 전원 싱글룸', 4, R4).kind, 'all');
});
test('「○○ 외 N명 싱글」 — 누구까지인지 글만으로는 정할 수 없다(사람이 본다). 그 이름 한 사람만 싱글로 읽지도 않는다', () => {
  assert.equal(sp('홍길동 외 3명 싱글룸', 4, R4).kind, 'unsure');
  assert.equal(sp('홍길동님 외 3명 싱글룸 사용', 4, R4).kind, 'unsure');
  assert.equal(sp('홍길동 외 3명 싱글룸', 3, R4.slice(0, 3)).kind, 'unsure');
  assert.equal(sp('홍길동 외 1명 싱글룸', 4, R4).kind, 'unsure');
});

test('「마감·매진·솔드아웃」 — 방이 없다는 말일 수도, 접수를 끝냈다는 말일 수도 있다: 전원·이름이 적혀 있어도 사람이 본다(설명서·규칙 문서의 「마감 문구는 보류」)', () => {
  for (const t of ['전원 싱글룸 마감', '전원 싱글 매진', '전원 싱글 솔드아웃', '4명 전원 싱글룸 (싱글 마감)', '싱글룸: 홍길동, 가나다 마감', '全員シングル 締切', '全員シングル 売り切れ', 'all single sold out'])
    assert.equal(sp(t, 4, R4).kind, 'unsure', t);
  //  다른 항목의 마감은 싱글과 무관 — 종전대로
  assert.equal(sp('전원 싱글룸 / 석식 특식 마감', 4, R4).kind, 'all');
  assert.equal(sp('전원 싱글룸\n입금 마감 11/1', 4, R4).kind, 'all');
  assert.equal(sp('전원 싱글룸, 조식 마감 08:00', 4, R4).kind, 'all');
  //  신청 수(일별 체류 현황)는 종전대로 센다 — 몇 방짜리 요청인지는 알아야 한다
  assert.equal(SZCore.singleRequested('전원 싱글룸 마감', 4).n, 4);
});
