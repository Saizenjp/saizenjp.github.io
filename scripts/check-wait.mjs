#!/usr/bin/env node
// 대기 예약 누락 검사 — 「대기」 예약이 현장·인쇄·청구·통계에 새어 들어가지 않는지.
//
//  왜 있나: 엠클릭 구분 「대기」는 메리트투어가 만실이어도 받아 두는 예약이고,
//  **출국 전까지 정리되는** 예약이라 현장에 오지 않는다. 그런데 2026-09 검수에서
//  現地精算表(B2B 청구)·경영 통계·프론트 데스크·인쇄물 등 15페이지 25곳이
//  그대로 세고 있었다(10월 청구 기준 1,243만 엔 과다). 손으로 고치면 한 곳은 빠진다 —
//  그래서 bookings 를 읽는 모든 자리에 `.neq('status','대기')` (임베드는
//  `.neq('bookings.status','대기')`) 가 있는지 기계가 본다.
//
//  판정: `from('bookings')` 또는 `bookings!inner(` 가 나오는 문장(다음 `;` 까지)에
//        문자열 '대기' 가 없으면 오류. 아래 허용 목록만 예외.
//
//  허용(대기를 봐야 하는 자리):
//   · step1.html   — 엠클릭 원본을 그대로 적재한다(대기도 저장해야 확정으로 바뀔 때 잡힌다)
//   · room.html    — 방배정은 확정 전 대기 팀을 챙기는 자리(「대기예약」 배지, 자동배정 제외)
//   · audit.html   — 검수는 전체를 본다
//   · 등록 현황(session_ym 만 세는 문장) — 데이터가 들어왔는지 보는 것이라 대기도 센다
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const ALLOW_FILE = new Set(['ops/hub/step1.html', 'ops/hub/room.html', 'ops/hub/audit.html']);
const ALLOW_STMT = [/select\('session_ym'\)/, /bookings!inner\(session_ym\)/, /count:\s*'exact'\s*,\s*head:\s*true/];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

const files = walk(join(ROOT, 'ops')).sort();
const RE = /from\('bookings'\)|bookings!inner\(/g;
let hits = 0, bad = 0;
for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  if (ALLOW_FILE.has(rel)) continue;
  const src = readFileSync(f, 'utf8');
  //  `const GSEL='…bookings!inner(…)'` 처럼 select 문자열을 상수로 빼 둔 페이지는
  //  그 상수를 쓰는 `.select(GSEL)` 문장을 검사 대상에 넣는다(상수 정의 자체는 쿼리가 아니다).
  const consts = [...src.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*'[^']*bookings!inner\([^']*'/g)].map(x => x[1]);
  const RE2 = consts.length ? new RegExp(`from\\('bookings'\\)|bookings!inner\\(|\\.select\\((?:${consts.join('|')})\\)`, 'g') : RE;
  RE2.lastIndex = 0;
  let m;
  while ((m = RE2.exec(src))) {
    const end = src.indexOf(';', m.index);
    const stmt = src.slice(m.index, end < 0 ? m.index + 800 : end);
    const head = src.slice(Math.max(0, m.index - 200), m.index);
    //  상수 정의 줄(`const GSEL='…'`)은 쿼리가 아니다 — 건너뛴다
    if (/const\s+[A-Z_][A-Z0-9_]*\s*=\s*'[^']*$/.test(head)) continue;
    hits++;
    if (ALLOW_STMT.some(r => r.test(stmt))) continue;
    if (stmt.includes("'대기'") || /\/\*\s*대기/.test(stmt)) continue;
    bad++;
    const line = src.slice(0, m.index).split('\n').length;
    console.error(`✗ ${rel}:${line}  bookings 를 읽는데 대기 예약을 안 뺐습니다 → .neq('status','대기') (임베드는 'bookings.status'). 일부러 포함하면 문장 안에 /* 대기 포함: 이유 */`);
  }
}
console.log(`검사 대상: bookings 읽기 ${hits}곳`);
if (bad) { console.error(`✗ 대기 누락 ${bad}건`); process.exit(1); }
console.log('✓ 대기 예약 제외 검사 통과 — 현장·인쇄·청구·통계 어디에도 새지 않음');
