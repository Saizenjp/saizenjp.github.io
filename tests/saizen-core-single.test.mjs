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
  assert.equal(sp('*이희주님예약건/ 싱글 4방 확정', 8, []).kind, 'unsure');
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
  assert.equal(sp('김수진님 4박 후 채원선님 3박 싱글룸 현지결제', 3, []).kind, 'part');
  assert.equal(sp('8/2-8/5 야마나미 숙박 (싱글)\n8/5-8/9 시즈노야도 트리플룸 숙박', 1, []).kind, 'part');
});

test('이름은 문장에서 뽑지 않고 **명단과 대조**한다 — 오탐이 없다', () => {
  const roster = [{ id: 1, name: '조철기' }, { id: 2, name: '유경옥' }, { id: 3, name: '김철수' }];
  const r = sp('싱글룸 2개: 조철기, 유경옥 / 싱글룸 현지지불\n전기카트 신청', 4, roster);
  assert.equal(r.kind, 'names');
  assert.deepEqual(r.names.map(x => x.name), ['조철기', '유경옥']);
  // 적힌 이름이 그 팀 명단에 없으면(다른 팀 사람) 이름으로 확정하지 않는다
  assert.equal(sp('전기카트 신청입니다.\n싱글룸 : 홍승국님', 2, [{ id: 1, name: '조부영' }]).kind, 'unsure');
  // 싱글과 무관한 줄의 이름은 잡지 않는다
  assert.equal(sp('김철수님 카트 신청\n싱글룸 1개', 4, [{ id: 3, name: '김철수' }]).kind, 'unsure');
});

test('트윈·트리플이 섞이면 전원형이라도 사람이 본다', () => {
  assert.equal(sp('1-13  /싱글2,트윈1/쿠폰사용', 4, []).kind, 'unsure');
  const r = sp('전원 싱글룸\n싱글룸\n임채병, 정희용\n트윈룸\n배호경, 박효근', 4,
    [{ id: 1, name: '임채병' }, { id: 2, name: '정희용' }]);
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
  assert.equal(SZCore.singleCount('PUS1-8/선발권 확인 / *이희주님예약건/전체회원가/ 싱글 4방 확정'), 4);
  assert.equal(SZCore.singleCount('싱글룸 4개'), 4);
  assert.equal(SZCore.singleCount('싱글 2실'), 2);
  assert.equal(SZCore.singleCount('シングル4室'), 4);
  assert.equal(SZCore.singleCount('싱글룸 4명 희망'), 4);
  assert.equal(SZCore.singleCount('4방 싱글'), 4);                    // 숫자가 앞에 오는 표기
  assert.equal(SZCore.singleCount('싱글룸 현지에서 배정예정'), 0);     // 수량이 안 적혀 있으면 0
  assert.equal(SZCore.singleCount('트윈 2방'), 0);                    // 싱글 얘기가 아니면 0
  assert.equal(SZCore.singleCount('싱글룸 대기'), 0);                  // 대기·불가는 세지 않는다
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
