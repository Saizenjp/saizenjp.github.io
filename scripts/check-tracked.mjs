#!/usr/bin/env node
/* ============================================================================
 * check-tracked.mjs — 저장소에 올라가는 파일 검사(데이터 파일·비밀값이 섞이지 않았는지)
 * ----------------------------------------------------------------------------
 *  왜 있나: 이 저장소는 공개이고 GitHub Pages 로 그대로 서비스된다 — 올린 파일은 사이트 주소로
 *  받아지고, 지워도 git 기록에 남는다(CLAUDE.md §3-2). 그런데 「엑셀·PDF 같은 데이터 파일과
 *  비밀키는 커밋하지 않는다」는 규칙을 기계로 확인하는 자리가 없었다(2026-11 검수).
 *  `git add` 한 번의 실수를 올리기 전(npm run verify)에 잡는다. CI 에서도 돌지만 그때는 이미 올라간 뒤다.
 *
 *  ① 금지 이름     데이터·문서·압축·DB·키 파일의 확장자(아래 BAD_EXT, 대소문자 무시) · .env · .env.* · *.env · .envrc · .dev.vars
 *                  · id_rsa 류 · .netrc · .pgpass · 이름이 .env 인 폴더 안의 파일
 *                  확장자는 이름의 모든 토막에서 본다 — members.xlsx.bak · list.csv~ 도 걸린다
 *                  (그래서 README.pdf.md · jquery.csv.js 같은 이름도 걸린다 — 일부러 두는 파일이면 ALLOW 에 적는다).
 *  ② 비밀값 꼴     파일 본문의 sb_secret_ 키 · Supabase 접근 토큰(sbp_ · sbp_oauth_) · service_role JWT · PRIVATE KEY 블록
 *                  · GitHub 토큰 · npm 토큰 · 비밀번호가 든 DB 접속 주소 · DeepL 키
 *                  (「sb_secret_」 라는 낱말만 적은 문장, 자리표시자([YOUR-PASSWORD] · ${DB_PASS} · xxxx…), 로컬 기본 계정
 *                   postgres:postgres@127.0.0.1, 화면·공용 스크립트에 내장된 publishable 키는 걸리지 않는다)
 *
 *  보는 파일: git 저장소의 맨 위 폴더에서 돌리면 추적 중인 파일과, 아직 추적 전이지만 무시되지 않아
 *            `git add` 하면 올라갈 파일. 작업 폴더와 색인(git add 한 내용)이 다른 파일은 색인의 내용도 보고,
 *            작업 폴더에서 지웠지만 색인에 남은 파일은 색인의 내용을 본다(읽지 못하면 오류).
 *            그 밖에는 폴더 전체(node_modules·.git 제외) — 저장소가 아니거나 맨 위가 아닐 때, git 이 거부했을 때(그 까닭을 적는다).
 *            파일 이름이 UTF-8 이 아니면(다른 PC 에서 푼 압축의 한글 이름) 그 이름으로는 열 수 없다 → 건너뛰지 않고 문제로 알린다.
 *  보지 못하는 것: 사진(여권·명단을 찍은 jpg·png — 이름으로는 가릴 수 없다) · 데이터가 든 .sql·.json·.txt
 *            · pptx(안내 자료 1개가 올라가 있다) · 목록에 없는 확장자
 *            · 두 줄로 쪼개거나 이어 붙이거나 한 번 더 인코딩한 비밀값 · 이미 지난 커밋(git 기록).
 *  ALLOW 는 이름 검사만 건너뛴다 — 본문의 비밀값 꼴은 ALLOW 로 넘길 수 없다(문서의 예시는 자리표시자로 적는다:
 *            [YOUR-TOKEN] · ${TOKEN} · 같은 글자만 이어 적은 xxxx… · 0000…).
 *  외부 의존성 0(노드 빌트인만).   실행:  node scripts/check-tracked.mjs   (저장소 루트에서)
 * ========================================================================== */
import { readFileSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();

/* 일부러 두는 파일 — [저장소 기준 경로, 이유]. 금지 확장자 검사만 건너뛴다(본문 검사는 그대로).
   지금은 없다(2026-11 현재 추적 파일 가운데 금지 확장자 0개). */
const ALLOW = new Map([
]);

const BAD_EXT = new Set([
  'xlsx', 'xls', 'xlsm', 'xlsb', 'csv', 'tsv', 'ods', 'numbers',      /* 표 — 실적표·정산 원본·명단 */
  'pdf', 'docx', 'doc', 'ppt', 'hwp', 'hwpx',                         /* 문서(pptx 는 안내 자료 1개가 올라가 있어 넣지 않았다) */
  'zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst',         /* 압축 — 속을 볼 수 없다 */
  'sqlite', 'sqlite3', 'db', 'dump',                                  /* DB 파일·내보낸 덤프 */
  'pem', 'key', 'p12', 'pfx', 'jks',                                  /* 키·인증서 */
]);
const isEnvName = (n) => n === '.env' || n.startsWith('.env.') || n === '.envrc' || n === '.dev.vars';
function badName(path) {
  const parts = path.toLowerCase().split('/');
  /* 이름 끝의 빈칸·점·~ 는 떼고 본다(list.csv~ · a.pdf.) */
  const base = parts[parts.length - 1].replace(/[\s.~]+$/, '');
  if (isEnvName(base)) return '환경 변수 파일(.env 류)';
  if (parts.slice(0, -1).some(isEnvName)) return '환경 변수 폴더(.env 류) 안의 파일';
  if (/^id_(?:rsa|dsa|ecdsa|ed25519)$/.test(base)) return 'SSH 개인키 파일';
  if (base === '.netrc' || base === '.pgpass') return `접속 정보 파일(${base})`;
  /* 첫 토막(이름)을 뺀 모든 토막 — members.xlsx.bak 의 xlsx 도 본다.
     끝 토막이 env 이거나( secrets.env · prod.env ) 그 뒤가 백업 꼬리뿐이면( prod.env.bak ) .env 류다 — x.env.md 같은 문서는 아니다 */
  const segs = base.split('.').slice(1);
  const envAt = segs.indexOf('env');
  if (envAt >= 0 && segs.slice(envAt + 1).every((x) => /^(?:bak|backup|old|orig|save|tmp|swp|local|prod|dev|test)$/.test(x))) return '환경 변수 파일(.env 류)';
  const last = segs[segs.length - 1];
  if (BAD_EXT.has(last)) return `.${last} 파일`;      /* a.tar.bz2 는 .bz2 파일이다 */
  const hit = segs.find((seg) => BAD_EXT.has(seg));
  return hit ? `이름 가운데에 .${hit} 토막이 든 파일` : null;
}

/* 비밀값 꼴 — 값 자체는 출력하지 않는다(CI 기록도 공개된다) */
/* 자리표시자 — 값이 아니라 「여기에 넣으세요」 라고 적은 글( [YOUR-PASSWORD] · <password> · ${DB_PASS} · $DB_PASS · %s · *** · xxxx · YOUR_PASSWORD · password ) */
const PLACEHOLDER = /^(?:\[[^\]]*\]|<[^>]*>|\$\{[^}]*\}|\{\{?[^}]*\}?\}|%[sd]|\*{3,}|x{3,}|your[-_a-z0-9]*|(?:my|db|database|postgres|supabase)?[-_]?(?:pass(?:word)?|pw|secret)|changeme|example|placeholder)$/i;
const ENV_REF = /^\$[A-Z_][A-Z0-9_]*$/;      /* $DB_PASS — 대문자 환경 변수 이름만($ 로 시작하는 진짜 비밀번호와 가른다) */
const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal)$/i;
/* ok(m) 이 거짓이면 그 일치는 자리표시자·기본값이라 넘어간다 */
const varied = (s) => new Set(String(s).replace(/[-_]/g, '')).size > 2;      /* xxxx… · 0000… 처럼 같은 글자만 이어 적은 예시는 값이 아니다 */
const SECRETS = [
  { name: 'Supabase secret key(sb_secret_ 뒤에 키 문자 20자 이상)', re: /sb_secret_([A-Za-z0-9_-]{20,200})/g,
    ok: (m) => new Set(m[1]).size > 2 },      /* sb_secret_xxxxxxxx… 처럼 같은 글자만 이어 적은 설명은 키가 아니다 */
  { name: 'Supabase 접근 토큰(sbp_)', re: /(?<![A-Za-z0-9_])sbp_(?:oauth_)?([a-f0-9]{40})(?![a-f0-9])/g, ok: (m) => varied(m[1]) },
  { name: '개인키 블록(PRIVATE KEY)', re: /-----BEGIN (?:[A-Z0-9]{1,20} ){0,6}PRIVATE KEY(?: BLOCK)?-----/g },
  { name: 'GitHub 토큰', re: /(?<![A-Za-z0-9_])(?:gh[pousr]_([A-Za-z0-9]{36,255})|github_pat_([A-Za-z0-9_]{60,255}))/g, ok: (m) => varied(m[1] || m[2]) },
  { name: 'npm 토큰', re: /(?<![A-Za-z0-9_])npm_([A-Za-z0-9]{36})(?![A-Za-z0-9])|_authToken\s*=\s*(?!\$\{)([^\s$"']{20,200})/g, ok: (m) => varied(m[1] || m[2]) },
  { name: '비밀번호가 든 DB 접속 주소', re: /postgres(?:ql)?:\/\/[A-Za-z0-9._-]{1,80}:([^\s@\/'"`<>]{4,200})@([A-Za-z0-9.-]{4,200})/g,
    ok: (m) => !PLACEHOLDER.test(m[1]) && !ENV_REF.test(m[1]) && !(LOCAL_HOST.test(m[2]) && /^(?:postgres|password)$/i.test(m[1])) },
  { name: 'DeepL 키', re: /(?<![0-9a-f-])([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):fx(?![a-z0-9])/g, ok: (m) => varied(m[1]) },
];
/* JWT 는 세 토막(머리.본문.서명) — 본문을 base64url 로 풀어 role 이 service_role 인 것만 잡는다(anon 키는 공개값) */
/* 본문 토막은 「{」 로 시작하는 JSON — 빈칸·줄바꿈이 낀 꼴(ey·ew)과 표준 base64(+ / =)로 적은 꼴도 받는다 */
const JWT = /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,2000}={0,2}\.e[yw][A-Za-z0-9_+\/-]{8,8000}={0,2}\.[A-Za-z0-9_+\/-]{8,2000}/g;
function isServiceRoleJwt(token) {
  let body = '';
  try { body = Buffer.from(token.split('.')[1].replace(/=+$/, ''), 'base64').toString('utf8'); } catch { return false; }
  return /"role"\s*:\s*"service_role"/.test(body);
}

/* ── 볼 파일 목록 ── */
let gitWhy = '';      /* git 목록을 쓰지 못한 까닭(저장소가 아니거나 맨 위가 아니면 빈 글) */
function gitList() {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: ROOT, encoding: 'utf8' });
  if (top.error || top.status !== 0 || !top.stdout.trim()) {
    const why = top.error ? `git 을 실행하지 못했습니다(${top.error.code || top.error.message})` : String(top.stderr || '').trim().split('\n')[0];
    if (!/not a git repository/i.test(why)) gitWhy = why;      /* 저장소인데 git 이 거부했다(소유자가 다른 폴더 등) */
    return null;
  }
  /* 이 폴더가 저장소의 맨 위일 때만 git 목록을 쓴다 — 다른 저장소 안에 놓인 사본이면 폴더를 걷는다 */
  let same = false;
  try { same = realpathSync(top.stdout.trim()) === realpathSync(ROOT); } catch { same = false; }
  if (!same) return null;
  /* git 은 경로를 바이트로 준다 — 바이트로 받아 이름이 UTF-8 인지 본다 */
  const ls = (extra) => {
    const r = spawnSync('git', ['ls-files', '-z', ...extra], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`git ls-files 실패: ${String(r.stderr || '').trim()}`);
    return splitZ(r.stdout).map(nameOf);
  };
  const d = spawnSync('git', ['diff', '--name-only', '--no-renames', '-z'], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
  return { tracked: ls([]), untracked: ls(['--others', '--exclude-standard']), dirty: d.status === 0 ? splitZ(d.stdout).map(nameOf).filter((x) => !x.badEnc).map((x) => x.path) : [] };
}
function splitZ(buf) {
  const out = [];
  let from = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] === 0) { if (i > from) out.push(buf.subarray(from, i)); from = i + 1; }
  if (from < buf.length) out.push(buf.subarray(from));
  return out;
}
/* 이름의 바이트 → { path, badEnc }. UTF-8 이 아닌 이름(다른 PC 에서 푼 압축의 한글 이름 등)은 글자로 바꾸면 깨져서
   그 이름으로는 파일을 열 수 없다 — 건너뛰지 않고 문제로 알린다(읽지 못한 것은 통과가 아니다) */
function nameOf(raw) {
  const path = raw.toString('utf8');
  return { path, badEnc: !Buffer.from(path, 'utf8').equals(raw) };
}
function walk(dir, prefix = '', out = []) {
  for (const raw of readdirSync(dir, { encoding: 'buffer' })) {
    const { path: name, badEnc } = nameOf(raw);
    if (name === 'node_modules' || name === '.git') continue;
    const r = prefix + name;
    if (badEnc) { out.push({ path: r, badEnc: true }); continue; }      /* 폴더인지도 알 수 없다 — 그 아래는 보지 못한 것으로 알린다 */
    if (lstatSync(join(dir, name)).isDirectory()) walk(join(dir, name), r + '/', out);
    else out.push({ path: r, badEnc: false });
  }
  return out;
}

const git = gitList();
const entries = git
  ? [...git.tracked.map((x) => ({ ...x, untracked: false })), ...git.untracked.map((x) => ({ ...x, untracked: true }))]
  : walk(ROOT).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map((x) => ({ ...x, untracked: false }));
const gone = [];      /* 작업 폴더에 없는 추적 파일 — 색인의 내용을 아래에서 본다 */

const problems = [];
let scanned = 0, binary = 0, skipped = 0, nameProblems = 0;
const MAX_SCAN = 64 * 1024 * 1024;
const tooBig = (path, size, note) => problems.push(`✗ ${path} — ${Math.round(size / 1048576)}MB: 너무 커서 본문을 검사하지 못했습니다(저장소에 둘 크기가 아닙니다).${note}`);
function scanBody(path, buf, note) {
  if (buf.length > MAX_SCAN) { tooBig(path, buf.length, note); return; }      /* 글이든 이진이든 — 조용히 건너뛰지 않는다 */
  if (buf.subarray(0, 8192).includes(0)) binary++;      /* 이진 파일도 본문을 본다(그 안에 든 키) */
  scanned++;
  try {
    let text = buf.toString('latin1');
    if (text.includes('\0')) text = text.replace(/\0/g, '');      /* UTF-16 로 저장된 글도 읽히게 */
    const hit = (index, name) => problems.push(`✗ ${path}:${text.slice(0, index).split('\n').length} — 비밀값 꼴: ${name}${note}`);
    for (const s of SECRETS) for (const m of text.matchAll(s.re)) if (!s.ok || s.ok(m)) hit(m.index, s.name);
    for (const m of text.matchAll(JWT)) if (isServiceRoleJwt(m[0])) hit(m.index, 'service_role JWT');
  } catch (e) { problems.push(`✗ ${path} — 본문을 검사하지 못했습니다(${e.message}).${note}`); }
}

for (const { path, badEnc, untracked } of entries) {
  const note = untracked ? ' (아직 추적 전 — git add 하면 올라갑니다)' : '';
  /* ① 이름 */
  const bad = badName(path);
  if (bad && !ALLOW.has(path)) { nameProblems++; problems.push(`✗ ${path} — ${bad}은 저장소에 두지 않습니다(CLAUDE.md §3-2).${note}`); }
  if (badEnc) {
    problems.push(`✗ ${path} — 파일 이름이 UTF-8 이 아닙니다(다른 PC 에서 푼 압축의 한글 이름 등). 이름을 읽지 못해 본문을 검사하지 못했습니다 — 이름을 바꾸세요.${note}`);
    continue;
  }
  /* ② 본문 */
  let buf;
  try {
    const st = lstatSync(join(ROOT, path));
    if (!st.isFile()) { skipped++; continue; }      /* 링크·하위 저장소 — 이름만 본다 */
    if (st.size > MAX_SCAN) { tooBig(path, st.size, note); continue; }
    buf = readFileSync(join(ROOT, path));
  } catch (e) {
    if (e.code === 'ENOENT' && git && !untracked) { gone.push(path); continue; }      /* 작업 폴더에서 지운(또는 받지 않은) 추적 파일 — 색인의 내용을 아래에서 본다 */
    problems.push(`✗ ${path} — 읽지 못해 본문을 검사하지 못했습니다(${e.code || e.message}).${note}`);
    continue;
  }
  scanBody(path, buf, note);
}
if (git) {
  const goneSet = new Set(gone);
  for (const path of new Set([...git.dirty, ...gone])) {
    const r = spawnSync('git', ['show', ':' + path], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
    if (r.status === 0 && r.stdout) scanBody(path, r.stdout, goneSet.has(path) ? ' (색인에 올라간 내용 — 작업 폴더에는 없는 파일입니다)' : ' (색인에 올라간 내용 — 작업 폴더의 파일과 다릅니다. git add 를 다시 하세요)');
    else if (goneSet.has(path)) problems.push(`✗ ${path} — 작업 폴더에 없고 색인에서도 읽지 못해 본문을 검사하지 못했습니다.`);
  }
}

console.log(git
  ? `검사 대상: 추적 파일 ${git.tracked.length}개 · 추적 전 파일 ${git.untracked.length}개 · 본문 검사 ${scanned}개(그중 이진 ${binary}개)${skipped ? ` · 이름만 본 것 ${skipped}개(링크 등)` : ''}`
  : `검사 대상: 폴더의 파일 ${entries.length}개(${gitWhy ? `git 목록을 읽지 못해 — ${gitWhy.slice(0, 120)} — 폴더를 걸었습니다. .gitignore 로 무시되는 파일도 봅니다` : 'git 저장소의 맨 위가 아니어서 폴더를 걸었습니다'}) · 본문 검사 ${scanned}개(그중 이진 ${binary}개)${skipped ? ` · 이름만 본 것 ${skipped}개(링크 등)` : ''}`);
if (problems.length) {
  problems.forEach((p) => console.error(p));
  console.error(`\n✗ 올리면 안 되는 파일·비밀값 ${problems.length}건 — 파일은 저장소 밖(세션 작업 폴더)으로 옮기고, 비밀값은 지웁니다(이미 올라간 적이 있으면 그 키를 새로 발급).`);
  if (nameProblems) console.error('  일부러 두는 파일이면 scripts/check-tracked.mjs 의 ALLOW 에 경로와 이유를 적습니다(이름 검사만 건너뜁니다).');
  if (problems.length > nameProblems) console.error('  문서의 예시가 걸렸으면 값 자리를 [YOUR-TOKEN] · xxxx… 같은 자리표시자로 바꿉니다 — 본문 검사는 ALLOW 로 건너뛸 수 없습니다.');
  process.exitCode = 1;
} else console.log(`✓ 추적 파일 검사 통과 — 데이터·문서·압축·DB·키 파일(확장자 ${BAD_EXT.size}종·.env 류·접속 정보 파일) 없음 · 비밀값 꼴(${SECRETS.length + 1}종: sb_secret_·sbp_·service_role JWT·PRIVATE KEY·GitHub 토큰·npm 토큰·DB 접속 주소·DeepL 키) 없음${ALLOW.size ? ` · 허용 목록 ${ALLOW.size}개` : ''}. 사진·pptx·git 기록은 이 검사가 보지 않습니다.`);
