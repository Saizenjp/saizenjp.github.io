// 세부 권한 트리(AREA_TREE) — 판정 규칙과 SQL(138) seed 일치 검사
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const C = require('../ops/assets/saizen-core.js');

test('areaExpand: 부모 → 자식 전부, 자식 → 부모 포함', () => {
  const p = C.areaExpand(['print']);
  for (const c of C.AREA_TREE.print) assert.ok(p.includes(c), c);
  const ch = C.areaExpand(['dinner']);
  assert.deepEqual(ch.sort(), ['dinner', 'print']);
  assert.deepEqual(C.areaExpand([]), []);
  assert.deepEqual(C.areaExpand(['board']), ['board']);   // 트리 밖 키는 그대로
});

test('areaAllowed: 자식 키만 → 그 화면만 · 부모 키 → 그룹 전체 · 보기 → read', () => {
  const only = { role: 'staff', areas: ['dinner'], read_areas: [] };
  assert.equal(C.areaAllowed(only, ['dinner']), 'write');
  assert.equal(C.areaAllowed(only, ['nametag']), null);
  assert.equal(C.areaAllowed(only, ['print']), 'write');     // 그룹 키를 선언한 옛 페이지도 통과(DB 는 그룹 수준)
  const grp = { role: 'staff', areas: ['print'], read_areas: [] };
  assert.equal(C.areaAllowed(grp, ['nametag']), 'write');
  assert.equal(C.areaAllowed(grp, ['frontdesk']), null);
  const rd = { role: 'manager', areas: [], read_areas: ['staycal'] };
  assert.equal(C.areaAllowed(rd, ['stats_mgmt', 'staycal']), 'read');
  assert.equal(C.areaAllowed(rd, ['stats_mgmt']), null);
  assert.equal(C.areaAllowed({ role: 'admin', areas: [], read_areas: [] }, ['anything']), 'write');
  assert.equal(C.areaAllowed(null, ['dinner']), null);
  // 안내 모니터는 인쇄물과 별도 그룹(140): print 만으론 모니터 카드가 안 보이고, signage 부모면 4화면 전부
  assert.equal(C.areaAllowed(grp, ['sign_lobby']), null);
  assert.equal(C.areaAllowed({ role: 'staff', areas: ['signage'], read_areas: [] }, ['sign_course']), 'write');
  assert.equal(C.areaAllowed({ role: 'staff', areas: ['sign_course'], read_areas: [] }, ['sign_lobby']), null);
  assert.equal(C.areaAllowed(only, 'dinner nametag'), 'write');   // 문자열(공백 구분)도 받는다
});

test('체류 캘린더(staycal)만 있으면 경영통계(stats_mgmt)는 못 연다', () => {
  const cal = { role: 'staff', areas: ['staycal'], read_areas: [] };
  assert.equal(C.areaAllowed(cal, ['staycal']), 'write');
  assert.equal(C.areaAllowed(cal, ['stats_mgmt']), null);
  // 부모 stats 를 가진 사람은 둘 다
  const st = { role: 'staff', areas: ['stats'], read_areas: [] };
  assert.equal(C.areaAllowed(st, ['stats_mgmt']), 'write');
  assert.equal(C.areaAllowed(st, ['staycal']), 'write');
});

test('SQL seed(최신 area_tree 재시드 = 140) 와 AREA_TREE 가 같다', () => {
  const sql = readFileSync(new URL('../ops/hub/sql/140_signage_area.sql', import.meta.url), 'utf8');
  const blk = sql.slice(sql.indexOf('insert into public.area_tree'), sql.indexOf('on conflict (child)'));
  const seed = {};
  for (const m of blk.matchAll(/\('([a-z_]+)','([a-z_]+)'\)/g)) seed[m[1]] = m[2];
  const mine = {};
  Object.keys(C.AREA_TREE).forEach(p => C.AREA_TREE[p].forEach(c => { mine[c] = p; }));
  assert.deepEqual(seed, mine);
  assert.equal(Object.keys(mine).length, 36);
});
