/* ============================================================================
 * saizen-core.js — 순수 도메인 로직 공유 모듈 (테스트 가능 단위)
 * ----------------------------------------------------------------------------
 *  · 여러 페이지가 중복 구현하던 순수 함수를 한 곳으로 모은다(단일 진실원).
 *    여기서만 고치면 room·pos 등 전 페이지에 반영된다.
 *  · 브라우저(전역 SZCore) + Node(module.exports) 양쪽에서 로드된다(UMD).
 *  · DOM·Supabase·localStorage 의존 없음 → node:test 단위 테스트 대상.
 *  ⚠ 이 파일은 saizen-ops.js 와 별개(도메인 순수 로직 전용).
 * ========================================================================== */
;(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SZCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ── 숙소·구역 표시 라벨 (ja/ko/en) ──────────────────────────────────────
  //  DB 저장값은 한국어 그대로 두고 화면 표기만 언어 토글에 맞춘다(필터 키·집계 불변).
  //  정식 명칭: 간지호텔 = くじゅう赤川温泉 ザ・ガンジー ホテル＆リゾート / The Guernsey Hotel
  //             (ガンジー = 건지 젖소 Guernsey. Gandhi 아님)
  //             시즈노야도 = 満願寺温泉 志津の宿 / Shizu-no-Yado
  //  ⚠ 인쇄 산출물(手配書 등)은 일본어 고정 → 각 페이지의 인쇄 전용 함수를 쓴다.
  var ACCOM_LABEL = {
    '야마나미리조트': { ja: 'やまなみリゾート', ko: '야마나미리조트', en: 'Yamanami Resort' },
    '쿠주힐즈':       { ja: '久住ヒルズ',       ko: '쿠주힐즈',       en: 'Kuju Hills' },
    '간지호텔':       { ja: 'ガンジーホテル',   ko: '간지호텔',       en: 'The Guernsey Hotel' },
    '시즈노야도 료칸':{ ja: '志津の宿',         ko: '시즈노야도 료칸', en: 'Shizu-no-Yado' },
    '시즈노야도':     { ja: '志津の宿',         ko: '시즈노야도',     en: 'Shizu-no-Yado' },
    // 야마나미 안의 구역(room.html 필터 등)
    '호텔':           { ja: 'ホテル',           ko: '호텔',           en: 'Hotel' },
    '소보5동':        { ja: '祖母5棟',          ko: '소보5동',        en: 'Sobo No.5' },
    '골프텔':         { ja: 'ゴルフテル',       ko: '골프텔',         en: 'Golftel' },   // 구 명칭(2026-08 「호텔」로 변경) — 과거 데이터 표시용 유지
    '관내별장':       { ja: '館内別荘',         ko: '관내별장',       en: 'On-site Villa' },
    '소보별장':       { ja: '祖母別荘',         ko: '소보별장',       en: 'Sobo Villa' },
    '아소별장':       { ja: '阿蘇別荘',         ko: '아소별장',       en: 'Aso Villa' },
    '돔하우스':       { ja: 'ドームハウス',     ko: '돔하우스',       en: 'Dome House' }
  };
  // 미등록 이름은 원문 그대로 반환(신규 숙소가 들어와도 화면이 비지 않게).
  // ── 숙소(장소) 구분 — room.html 필터와 객실 청소 화면이 같은 기준을 쓴다 ─────
  //   야마나미리조트 안을 호텔(층)·소보별장·소보5동(4인 1동)·아소별장·돔하우스로 나눈다.
  //   「전체」는 오프사이트(간지·시즈)를 뺀 야마나미 복합 + 쿠주힐즈를 뜻한다.
  var PLACE_ITEMS = ['호텔', '소보별장', '소보5동', '아소별장', '돔하우스', '쿠주힐즈', '간지호텔', '시즈노야도'];
  var OFFSITE_PLACES = ['간지호텔', '시즈노야도'];
  function roomPlaceKeys(inv) {
    if (!inv) return [];
    var fac = inv.facility || '', z = inv.zone || '';
    if (fac === '야마나미리조트') {
      if (/^\d+층$/.test(z)) return ['호텔'];
      if (z === '돔하우스') return ['돔하우스'];
      if (z === '소보별장') return [/5\s*호/.test(inv.room_no || '') ? '소보5동' : '소보별장'];
      if (z === '아소별장') return ['아소별장'];
      return ['호텔'];
    }
    if (fac === '쿠주힐즈') return ['쿠주힐즈'];
    if (fac === '간지호텔') return ['간지호텔'];
    if (fac === '시즈노야도 료칸') return ['시즈노야도'];
    return [];
  }
  // sel 이 비면 「전체」 = 오프사이트 제외
  function placeInScope(keys, sel) {
    var has = function (k) { return sel && (sel.has ? sel.has(k) : sel.indexOf(k) >= 0); };
    var size = sel ? (sel.size !== undefined ? sel.size : sel.length) : 0;
    if (!size) return keys.some(function (k) { return OFFSITE_PLACES.indexOf(k) < 0; });
    return keys.some(has);
  }

  function accomLabel(name, lang) {
    var m = ACCOM_LABEL[name];
    if (!m) return name == null ? '' : String(name);
    return m[lang] || m.ja || String(name);
  }

  // ── 회원 판정 (3컬럼 OR · 회원 우선) ─────────────────────────────────────
  //  고객등급(T)·회원권구분(V)·회원구분(U) 셋 중 하나라도 회원신호면 회원.
  //  초기 회원등록 오류로 컬럼이 어긋난 케이스 대비(Min 결정).

  // 한 컬럼값이 '회원'을 가리키는지: 공란 아님 + '일반'·'비회원' 미포함
  //  → 회원권·정회원·다이아몬드·EWRC… = 회원신호 / 일반고객·일반·비회원·공란 = 아님
  function looksMember(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return false;
    if (/일반|비회원/.test(s)) return false;
    return true;
  }

  // 회원 판정. 객체(member) 또는 문자열(member_grade) 모두 허용.
  function isMember(m) {
    if (m && typeof m === 'object')
      return looksMember(m.member_grade) || looksMember(m.member_class) || looksMember(m.member_div);
    return looksMember(m);
  }

  // 화면 표시용 라벨: 실제 등급(회원권구분 V) 우선 → 고객등급(T) → 회원/일반
  function gradeLabel(m) {
    var obj = (m && typeof m === 'object');
    var cls = String((obj ? m.member_class : '') || '').trim();
    if (cls && !/일반|비회원/.test(cls)) return cls;           // 다이아몬드Ⅱ·EWRCⅡ 등
    var g = String((obj ? m.member_grade : m) || '').trim();
    if (g && g !== '회원권' && !/일반|비회원/.test(g)) return g; // 레거시: T에 실제 등급
    return isMember(m) ? '회원' : '일반';
  }

  // ── 날짜 유틸 ────────────────────────────────────────────────────────────
  //  현장 운영 데이터의 버그가 가장 잦았던 영역. 한 곳에 모아 회귀 방지.

  // 유효한 Date → 'YYYY-MM-DD' (로컬 기준). 무효/비Date → ''.
  function fmtDate(d) {
    if (!(d instanceof Date) || isNaN(d)) return '';
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // 다양한 입력(Date·엑셀 직렬·한국어·YYYY선두·MM/DD/YYYY) → 'YYYY-MM-DD'. 실패 시 ''.
  //   엠클릭 엑셀이 SheetJS로 숫자(직렬)·문자 등 제각각으로 들어오는 걸 흡수.
  function parseFlexDate(v) {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date && !isNaN(v)) return fmtDate(v);
    // 엑셀 직렬 날짜(숫자) — cellDates 없이 읽으면 숫자(예: 45900). UTC 기준 환산.
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      var d = new Date(Math.round((v - 25569) * 86400000));
      return d.getUTCFullYear() + '-' +
        String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(d.getUTCDate()).padStart(2, '0');
    }
    var s = String(v).trim();
    // 한국어 "2026년 8월 15일"
    var k = s.match(/(\d{4})\s*[년.\-\/]\s*(\d{1,2})\s*[월.\-\/]\s*(\d{1,2})/);
    if (k) return k[1] + '-' + k[2].padStart(2, '0') + '-' + k[3].padStart(2, '0');
    // YYYY 선두 (YYYY-MM-DD / YYYY/M/D / YYYYMMDD)
    var m = s.match(/(\d{4})[\-\/\.]?(\d{1,2})[\-\/\.]?(\d{1,2})/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    // MM/DD/YYYY · M/D/YYYY (월 선두 — 연도가 뒤)
    var mdy = s.match(/^(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{4})$/);
    if (mdy) return mdy[3] + '-' + mdy[1].padStart(2, '0') + '-' + mdy[2].padStart(2, '0');
    return '';
  }

  // 'YYYY-MM-DD…' 문자열 → 로컬 Date(시간대 밀림 방지). 빈값/무효 → Invalid Date.
  function parseLocalDate(s) {
    if (!s) return new Date(NaN);
    if (s instanceof Date) return s;
    var p = String(s).slice(0, 10).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  // 체류 구간 [dep1,arr1) 와 [dep2,arr2) 가 하룻밤이라도 겹치는지(정원 체크 기반).
  //   'YYYY-MM-DD' 문자열은 사전식 비교로 안전. 퇴실=arr(미점유)이라 경계는 비포함.
  function overlaps(dep1, arr1, dep2, arr2) {
    return dep1 < arr2 && dep2 < arr1;
  }

  // 박수 = 도착(arr) − 출발(dep). 음수 방지.
  function nightsBetween(dep, arr) {
    var a = parseLocalDate(dep), b = parseLocalDate(arr);
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.max(0, Math.round((b - a) / 864e5));
  }

  // ── B2B(메리트↔사이젠 선계약) 정산 ──────────────────────────────────────
  //  ⚠ 현장 추가요금(추가라운드·미니바 등)과 별개. settle_merit·exec_stats 가 같은 식.
  //  숙소별 1인1박 단가. 미등록(빈값·미매칭)=0 → 호출부가 '단가 미등록' 경고/기본값 처리.
  function accomRate(accom) {
    var s = String(accom == null ? '' : accom);
    if (/쿠주|久住|구주|장기숙박|별장전용/.test(s)) return 14000;
    if (/간지/.test(s)) return 16000;
    if (/시즈|료칸/.test(s)) return 16000;
    if (/야마나미|돔하우스|별장|소보|아소/.test(s)) return 14000;
    return 0;
  }
  // 숙박비 = 인원×박수×단가 / 송영비 = 인원×6,000. {rate,lodge,transport,total}.
  function b2bFees(pax, nights, accom) {
    var p = Number(pax) || 0, n = Number(nights) || 0, rate = accomRate(accom);
    var lodge = p * n * rate, transport = p * 6000;
    return { rate: rate, lodge: lodge, transport: transport, total: lodge + transport };
  }
  // 상품명 → 숙박지(canonical accom). ⚠ 판정 순서 중요:
  //  "야마나미CC"는 골프장(코스)이라 거의 모든 상품명에 들어감. 숙박지는 별개이므로
  //  쿠주힐즈(장기숙박형 별장전용)·간지호텔·시즈를 먼저 보고, 야마나미는 폴백.
  //  예) "야마나미CC 골프 투어 \"장기숙박형 별장전용\"" → 숙박지=쿠주힐즈(골프만 야마나미CC).
  function accomFromProduct(name) {
    var s = String(name == null ? '' : name);
    if (/쿠주힐즈|구주힐즈|久住|장기\s*숙박|별장전용/.test(s)) return '쿠주힐즈';
    if (/간지|ガーンジー|GUERNSEY/i.test(s)) return '간지호텔';
    if (/시즈노야도|しずの宿/.test(s)) return '시즈노야도 료칸';   // ⚠ 넓은 '료칸' 제거: 벳푸 무츠키 료칸 등 타지 료칸 오분류 방지
    if (/야마나미|돔하우스|관내별장|소보별장|아소별장/.test(s)) return '야마나미리조트';
    return '';   // 미해당 = 타 리조트(스가다이라·14hills·벳푸·시로사토·미야자키 등) → 운영 원장 제외
  }

  // ── 비회원 F풀 코드 재사용 충돌 판정(30일 쿨다운) ──────────────────────────
  //  두 팀 체류가 gapDays(기본 30) 이내면 '충돌'(같은 F코드 금지). 30일+ 지나면 재사용 허용.
  //  이유=① 턴오버 당일(퇴실=입실) 현장 동시존재 ② 한 달 내 같은 코드 재등장 → 네임택·식사 혼동.
  //  한 팀 체류를 arr+gap까지 확장해 겹치면 충돌. 날짜 없으면 안전하게 '충돌'로 간주(전역 유니크).
  function nmCodeConflict(dep1, arr1, dep2, arr2, gapDays) {
    if (!dep1 || !arr1 || !dep2 || !arr2) return true;
    var g = (gapDays == null ? 30 : gapDays) * 86400000;
    var dms = function (x) { var p = String(x).slice(0, 10).split('-'); return Date.UTC(+p[0], (+p[1] || 1) - 1, +p[2] || 1); };
    return dms(dep1) <= dms(arr2) + g && dms(dep2) <= dms(arr1) + g;
  }

  // ── 비회원 F풀 코드 = 알파벳2 + 가나1 (18 × 33 = 594) ─────────────────────
  var NM_PREFIX = ['FA','FB','FF','FG','FH','FJ','FK','FL','FM','FO','FP','FR','FS','FT','FW','FX','FY','FZ'];
  var NM_KANA   = ['あ','ウ','カ','キ','コ','サ','す','セ','た','ち','テ','と','な','ニ','ネ','の','は','ヒ','ふ','ホ','マ','み','ム','め','モ','ヤ','ヨ','ラ','リ','ル','れ','ロ','わ'];
  var NM_POOL   = NM_PREFIX.length * NM_KANA.length;   // 594
  // idx = 가나순서*18 + 알파벳순서
  function nmIdxToCode(idx) {
    idx = ((idx % NM_POOL) + NM_POOL) % NM_POOL;
    return NM_PREFIX[idx % NM_PREFIX.length] + NM_KANA[Math.floor(idx / NM_PREFIX.length) % NM_KANA.length];
  }
  function nmCodeToIdx(code) {
    var p = NM_PREFIX.indexOf(String(code).slice(0, 2));
    var k = NM_KANA.indexOf(String(code).slice(2));
    return (p < 0 || k < 0) ? -1 : (k * NM_PREFIX.length + p);
  }

  // ── F풀 순회 순서 = '흩뿌리기'(Min 2026-08) ────────────────────────────────
  //  ⚠ 이전 방식(커서 +1)은 idx%18 이 알파벳이라 연속 배정이 FAあ·FBあ·FFあ… 처럼
  //    가나가 고정된 채 알파벳만 줄줄이 바뀌어(또는 그 반대) 현장이 헷갈려 했다.
  //  n번째 순회 위치가 알파벳·가나 **양쪽 모두** 매번 바뀌도록 좌표를 각각 서로 다른
  //  서로소 보폭으로 돌린다: 알파벳 +5(mod 18) · 가나 +7(mod 33).
  //  두 좌표의 동시 주기는 lcm(18,33)=198 이므로 198개마다 알파벳을 1칸 밀어(cyc)
  //  서로 겹치지 않는 다음 198개로 넘어간다 → 594개 전체를 정확히 한 번씩 순회(전단사).
  var NM_PAIR = 198, NM_STEP_P = 5, NM_STEP_K = 7;
  function nmSpreadIdx(n) {
    n = ((n % NM_POOL) + NM_POOL) % NM_POOL;
    var cyc = Math.floor(n / NM_PAIR), j = n % NM_PAIR;
    var p = (j * NM_STEP_P + cyc) % NM_PREFIX.length;
    var k = (j * NM_STEP_K) % NM_KANA.length;
    return k * NM_PREFIX.length + p;
  }


  // ── 날짜 표기 (화면 공통) ────────────────────────────────────────────────
  //  Min 2026-08: 같은 시스템이면 날짜 토글도 보는 방식이 같아야 한다 →
  //  모든 화면의 날짜 칩·라벨을 여기 한 곳에서 만든다. 화면 언어를 따라간다.
  var WD_JA = ['日','月','火','水','木','金','土'];
  var WD_KO = ['일','월','화','수','목','금','토'];
  var WD_EN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  function weekday(date, lang) {
    var d = parseLocalDate(date); if (!d || isNaN(d)) return '';
    var i = d.getDay();
    return lang === 'ko' ? WD_KO[i] : lang === 'en' ? WD_EN[i] : WD_JA[i];
  }
  // 'M/D(수)' — 날짜 토글·라벨 표준 표기
  function mdWd(date, lang) {
    var d = parseLocalDate(date); if (!d || isNaN(d)) return '-';
    return (d.getMonth() + 1) + '/' + d.getDate() + '(' + weekday(date, lang) + ')';
  }
  function isWeekendDay(date) {
    var d = parseLocalDate(date); if (!d || isNaN(d)) return false;
    var w = d.getDay(); return w === 0 || w === 6;
  }

  // ── 라운딩 일정 규칙 (야마나미 골프 · dispatch/카트 공용) ──────────────────
  //  · 입국일 = ICN 팀만 18H(부산편은 도착이 늦어 없음)
  //  · 귀국일 = PUS 팀만 9H(인천편은 오전 출발이라 없음)
  //  · 체류 중 = 전원 18H. 단 간지호텔은 평일이면 九重高原CC, 주말·공휴일은 やまなみCC.
  var JP_HOLIDAYS = ['2025-01-01','2025-01-13','2025-02-11','2025-02-23','2025-02-24','2025-03-20','2025-04-29','2025-05-03','2025-05-04','2025-05-05','2025-05-06','2025-07-21','2025-08-11','2025-09-15','2025-09-22','2025-09-23','2025-10-13','2025-11-03','2025-11-23','2025-11-24','2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23','2027-01-01','2027-01-11','2027-02-11','2027-02-23','2027-03-22','2027-04-29','2027-05-03','2027-05-04','2027-05-05','2027-07-19','2027-08-11','2027-09-20','2027-09-23','2027-10-11','2027-11-03','2027-11-23'];
  var JP_HOLIDAY_SET = new Set(JP_HOLIDAYS);
  function isJpHoliday(date) { return JP_HOLIDAY_SET.has(String(date).slice(0, 10)); }
  function isNonWorkday(date) {
    var d = parseLocalDate(date); if (!d || isNaN(d)) return false;
    var w = d.getDay();
    return w === 0 || w === 6 || isJpHoliday(date);
  }
  // team={dep,arr,accom} · isPus=귀국편이 부산인지 → [{date,course,holes,note}]
  function golfRows(team, isPus) {
    var rows = []; if (!team || !team.dep || !team.arr) return rows;
    var cur = parseLocalDate(team.dep), end = parseLocalDate(team.arr);
    if (!cur || !end || isNaN(cur) || isNaN(end)) return rows;
    for (; cur <= end; cur.setDate(cur.getDate() + 1)) {
      var ds = fmtDate(cur);
      if (ds === team.dep) { if (isPus) continue; rows.push({ date: ds, course: 'やまなみCC', holes: 18, note: '入国日' }); }
      else if (ds === team.arr) { if (!isPus) continue; rows.push({ date: ds, course: 'やまなみCC', holes: 9, note: '帰国日(釜山便)' }); }
      else {
        var nw = isNonWorkday(ds);
        var course = (team.accom === '간지호텔' && !nw) ? '九重高原CC' : 'やまなみCC';
        rows.push({ date: ds, course: course, holes: 18, note: nw ? (isJpHoliday(ds) ? '祝日' : '週末') : '+9Hサービス対象' });
      }
    }
    return rows;
  }
  // 그 날짜에 야마나미CC에서 라운딩하는가(= 전기카트 사전신청 가능 조건)
  function usesYamanamiCC(team, isPus, date) {
    var r = golfRows(team, isPus).find(function (x) { return x.date === String(date).slice(0, 10); });
    return !!(r && r.course === 'やまなみCC');
  }

  // ── 티오프 슬롯 (코스별 조 편성) ────────────────────────────────────────────
  //  현장 게시판 기준(Min 2026-08): 코스마다 첫 조 6:50, 7분 간격, 마지막 조 8:42 = 17조.
  var TEE_FIRST = '06:50', TEE_STEP = 7, TEE_LAST = '08:42';
  function _hm2min(s) { var m = String(s || '').match(/(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : NaN; }
  function _min2hm(n) { return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); }
  function teeSlots(first, step, last) {
    var a = _hm2min(first || TEE_FIRST), b = _hm2min(last || TEE_LAST), s = +(step || TEE_STEP);
    if (isNaN(a) || isNaN(b) || !(s > 0)) return [];
    var out = [];
    for (var t = a; t <= b; t += s) out.push(_min2hm(t));
    return out;
  }
  //  팀 인원 → 조 나누기. 4명 정원, 최소 조 수로 균등 분할.
  //   2→[2] · 4→[4] · 5→[3,2] · 6→[3,3] · 7→[4,3] · 8→[4,4] · 9→[3,3,3]
  function splitTeam(pax, cap) {
    var n = Math.max(0, Math.floor(+pax || 0)), c = Math.max(1, Math.floor(+cap || 4));
    if (!n) return [];
    var k = Math.ceil(n / c), base = Math.floor(n / k), rem = n % k, out = [];
    for (var i = 0; i < k; i++) out.push(base + (i < rem ? 1 : 0));
    return out;
  }

  // ── 카트 배정 규칙 (카트 관리표) ────────────────────────────────────────────
  //  · 전기(전동)카트 = 유료 사전신청. 현지전달비고(remark_local)에 신청 표기가 있는 팀만.
  //    → 그 팀의 라운딩 일수(golfRows) 전부에 자동 분배.
  //  · 그 외 팀 = 가솔린. 2인 예약팀은 2인승, 3인 이상은 4인승.
  //  카트 1대 정원 = 4명(2인승은 2명).
  var CART_ELECTRIC = /전기\s*카트|전동\s*카트|電動\s*カ[ーー]?ト|EV\s*카트|EV\s*カ[ーー]?ト|E\s*카트/i;
  function wantsElectricCart(remark) {
    return CART_ELECTRIC.test(String(remark == null ? '' : remark));
  }
  //  비고 표기 판정 3단계(Min 2026-08) — 메리트투어가 현지전달비고에 적어 보내는 문구가
  //  「전기카트 신청」처럼 명확할 때도 있고 「전기」 한 단어만 올 때도 있다.
  //   'sure'  = 전기/전동/EV + 카트 → 그대로 집계
  //   'maybe' = 전기·電気·EV 는 있는데 '카트'가 없다 → **재확인 필요**(집계에서 뺀다)
  //   'none'  = 언급 없음
  var CART_ELEC_HINT = /전기|전동|電動|電気|\bEV\b/i;
  function cartRemarkKind(remark) {
    var t = String(remark == null ? '' : remark);
    if (!t.trim()) return 'none';
    if (CART_ELECTRIC.test(t)) return 'sure';
    if (CART_ELEC_HINT.test(t)) return 'maybe';
    return 'none';
  }
  //  pax → {code, qty}. electric=true 면 전기카트, 아니면 가솔린(2인승/4인승).
  //  code 는 cart_types.code 와 동일: 'electric' | 'gas2' | 'gas4'
  function cartPlan(pax, electric) {
    var p = Math.max(0, Math.floor(+pax || 0));
    if (!p) return null;
    if (electric) return { code: 'electric', qty: Math.max(1, Math.ceil(p / 4)) };
    if (p <= 2) return { code: 'gas2', qty: 1 };
    return { code: 'gas4', qty: Math.ceil(p / 4) };
  }

  //  보유 카트 번호 목록 문자열 → 번호 배열.
  //   "1-36" · "1,2,5-9" · "E1-E10" (접두 문자 유지) 를 모두 받는다. 중복 제거·입력 순서 유지.
  function parseCartNos(text) {
    var out = [], seen = {};
    String(text == null ? '' : text).split(/[,\s、･·]+/).forEach(function (tok) {
      tok = tok.trim(); if (!tok) return;
      var m = tok.match(/^([^\d]*)(\d+)\s*[-~〜]\s*([^\d]*)(\d+)$/);
      if (m && (!m[3] || m[3] === m[1])) {
        var pre = m[1], a = +m[2], b = +m[4], w = m[2].length;
        var step = a <= b ? 1 : -1;
        for (var i = a; step > 0 ? i <= b : i >= b; i += step) {
          var s = pre + (m[2][0] === '0' ? String(i).padStart(w, '0') : String(i));
          if (!seen[s]) { seen[s] = 1; out.push(s); }
        }
        return;
      }
      if (!seen[tok]) { seen[tok] = 1; out.push(tok); }
    });
    return out;
  }
  //  번호 풀에서 순서대로 꺼내 배분. need=[{key, qty}] → {key: [번호…]}
  //  풀이 모자라면 그만큼만 준다(부족분은 빈칸 = 현장 조정).
  function allocCartNos(pool, need) {
    var list = Array.isArray(pool) ? pool.slice() : parseCartNos(pool);
    var out = {}, i = 0;
    (need || []).forEach(function (n) {
      var q = Math.max(0, Math.floor(+n.qty || 0)), got = [];
      for (var k = 0; k < q && i < list.length; k++, i++) got.push(list[i]);
      out[n.key] = got;
    });
    return out;
  }

  // ── 출발지 공항 판정 (釜山 PUS / 仁川 ICN) ──────────────────────────────────
  //  여러 페이지가 제각각(김해 누락·항공편 미고려)이던 것을 단일화.
  //   · 항공편 코드 우선: ZE(에어부산)→PUS / TW(티웨이)→ICN
  //   · 없으면 출발지 문자열: 부산·김해·PUS·BUS·PNS = PUS, 그 외 ICN
  function originPort(origin, flight) {
    var f = String(flight == null ? '' : flight).toUpperCase().replace(/\s/g, '');
    if (f.indexOf('ZE') === 0) return 'PUS';
    if (f.indexOf('TW') === 0) return 'ICN';
    var o = String(origin == null ? '' : origin), u = o.toUpperCase();
    if (o.indexOf('부산') >= 0 || o.indexOf('김해') >= 0 || u === 'PUS' || u === 'BUS' || u === 'PNS') return 'PUS';
    return 'ICN';
  }
  function isPus(origin, flight) { return originPort(origin, flight) === 'PUS'; }

  // ── 청소 효율 박수→층 배정 규칙 (야마나미 호텔동, 실제 층 zone 3~12) ─────
  //  같은 층 = 같은 박수(퇴실일)로 맞춰 청소를 한 번에.
  //   · 3·4박 → 9·6·3층 / 7박 → 11·10·7·4층 (지정층 고정)
  //   · 그 외 박수 → 유동층 12·8·5 중 '비었거나 같은 박수만 있는' 층(혼합 금지)
  var FLOOR_FIXED = { 3: [9, 6, 3], 4: [9, 6, 3], 7: [11, 10, 7, 4] };
  var FLOOR_FLEX = [12, 8, 5];
  // nights 팀이 들어갈 수 있는 층(우선순위 순). getNightSet(floor)=그 층의 현재 박수들(Set|배열).
  function allowedFloors(nights, getNightSet) {
    if (FLOOR_FIXED[nights]) return FLOOR_FIXED[nights].slice();
    return FLOOR_FLEX.filter(function (f) {
      var raw = (getNightSet ? getNightSet(f) : null) || [];
      var set = (raw instanceof Set) ? raw : new Set(raw);
      return set.size === 0 || (set.size === 1 && set.has(nights));
    });
  }

  // ── 조기 퇴실(개인 actual_dep) 식수 차감 ────────────────────────────────
  //  그 끼니에 이미 떠난 인원 수. 朝(b)=퇴실일 아침은 포함(actual_dep<date) /
  //  昼·夕(l·d)=퇴실일 아침에 떠남(actual_dep<=date). 날짜는 'YYYY-MM-DD' 사전식 비교.
  function mealGoneCount(actualDeps, date, meal) {
    if (!actualDeps || !actualDeps.length) return 0;
    return actualDeps.filter(function (ad) {
      return meal === 'b' ? (ad < date) : (ad <= date);
    }).length;
  }

  // ── 식수 규칙 (朝/昼/夕, 숙소 그룹별) ───────────────────────────────────────
  //  /app/ 와 dinner.html 에 중복됐던 핵심 규칙의 단일 진실원.
  //  OFFSITE(간지·시즈)=요일 규칙 / 그 외(야마나미·쿠주)=체류 규칙.
  var MEAL_OFFSITE = ['간지호텔', '시즈노야도 료칸'];
  var MEAL_OFFSITE_SET = new Set(MEAL_OFFSITE);
  function mealOffsite(accom) { return MEAL_OFFSITE_SET.has(accom); }
  // team={accom,dep,arr,isPus(귀국 PUS 여부)}, date='YYYY-MM-DD'
  //  → {breakfast:bool, lunchKind:''|'arr'|'cont', dinner:bool}. (pax·제외·조기퇴실·업그레이드는 호출부)
  function mealPlan(team, date) {
    var accom = team.accom, dep = team.dep, arr = team.arr, isPus = !!team.isPus;
    var wd = parseLocalDate(date).getDay();
    var isWTS = (wd === 3 || wd === 4 || wd === 0);   // 수·목·일
    var isSatSun = (wd === 6 || wd === 0);            // 토·일
    var off = MEAL_OFFSITE_SET.has(accom);
    var isIn = (dep === date), isOut = (arr === date), isMid = (dep < date && arr > date);
    var breakfast = off ? (isOut && isWTS) : (dep < date && arr >= date);
    var lunchKind = '';
    if (!off) {
      if (isMid) lunchKind = 'cont';
      else if (isIn && !isPus) lunchKind = 'arr';
      else if (isOut && isPus) lunchKind = 'cont';
    } else {
      if (isIn && isWTS && !isPus) lunchKind = 'arr';
      else if (isIn && isSatSun && accom === '간지호텔') lunchKind = 'arr';
      else if (isOut && isWTS && isPus) lunchKind = 'cont';
    }
    var dinner = (dep <= date && arr > date);
    return { breakfast: breakfast, lunchKind: lunchKind, dinner: dinner };
  }

  // ── 한글 이름 → 가타카나 요미카타(후리가나) ── 표준 한일 음역 규칙(베스트에포트, 약 85~90%).
  //   초성 자음행 + 중성 모음 합성 + 종성 받침. 비한글 문자는 그대로 통과.
  var _KANA_ROW = {
    k:['カ','キ','ク','ケ','コ'], n:['ナ','ニ','ヌ','ネ','ノ'], t:['タ','チ','ツ','テ','ト'],
    r:['ラ','リ','ル','レ','ロ'], m:['マ','ミ','ム','メ','モ'], p:['パ','ピ','プ','ペ','ポ'],
    s:['サ','シ','ス','セ','ソ'], '':['ア','イ','ウ','エ','オ'],
    j:['ジャ','ジ','ジュ','ジェ','ジョ'], ch:['チャ','チ','チュ','チェ','チョ'], h:['ハ','ヒ','フ','ヘ','ホ']
  };
  var _CHO_ROW = ['k','k','n','t','t','r','m','p','p','s','s','','j','j','ch','k','t','p','h'];
  // 중성 21: [타입(0평/1y/2w), 서브] · 평=모음인덱스(0a1i2u3e4o) · y/w=서브문자
  var _JUNG = [[0,0],[0,3],[1,'a'],[1,'e'],[0,4],[0,3],[1,'o'],[1,'e'],[0,4],[2,'a'],[2,'e'],[2,'e'],[1,'o'],[0,2],[2,'o'],[2,'e'],[2,'i'],[1,'u'],[0,2],[0,1],[0,1]];
  var _Y = {a:'ャ',u:'ュ',o:'ョ',e:'ェ'}, _YV = {a:'ヤ',u:'ユ',o:'ヨ',e:'イェ'};
  var _W = {a:'ァ',i:'ィ',u:'ゥ',e:'ェ',o:'ォ'}, _WV = {a:'ワ',i:'ウィ',u:'ウ',e:'ウェ',o:'ウォ'};
  var _JONG = ['','ク','ク','ク','ン','ン','ン','ッ','ル','ク','ム','ル','ル','ル','ル','ル','ム','プ','プ','ッ','ッ','ン','ッ','ッ','ク','ッ','プ','ッ'];
  function hangulToKana(str) {
    if (!str) return '';
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i) - 0xAC00;
      if (c < 0 || c >= 11172) { out += str.charAt(i); continue; }
      var cho = Math.floor(c / 588), jung = Math.floor((c % 588) / 28), jong = c % 28;
      var row = _CHO_ROW[cho], base = _KANA_ROW[row], jv = _JUNG[jung], syl;
      if (jv[0] === 0) syl = base[jv[1]];
      else if (jv[0] === 1) syl = (row === '') ? _YV[jv[1]] : base[1] + _Y[jv[1]];
      else syl = (row === '') ? _WV[jv[1]] : base[2] + _W[jv[1]];
      out += syl + _JONG[jong];
    }
    return out;
  }
  // 한글 성명을 성/명으로 분리(복성 포함). {sur, given} 의 가타카나 반환.
  var _COMPOUND_SUR = ['황보','남궁','선우','독고','제갈','사공','서문','동방','어금','망절'];
  function nameYomi(nameKr) {
    var s = String(nameKr || '').trim();
    if (!s) return { sur: '', given: '' };
    var surLen = 1;
    for (var i = 0; i < _COMPOUND_SUR.length; i++) { if (s.indexOf(_COMPOUND_SUR[i]) === 0) { surLen = 2; break; } }
    return { sur: hangulToKana(s.slice(0, surLen)), given: hangulToKana(s.slice(surLen)) };
  }

  // ── 영문 로마자 → 가타카나 요미카타 ── 한글 발음이 아니라 **여권 영문 철자대로** 후리가나를 단다.
  //   (예: 강병욱 KANG BYONG UK → カン・ビョン・ウク. 한글기반 ピョン(칸푱)이 아니라 영문 유성음 b→ビョン)
  //   유성 자음행(g/b/d/j) 사용이 핵심. 음절경계는 토큰(공백) 단위로 보존해 변환.
  var _EN_ROW = {
    k:['カ','キ','ク','ケ','コ'], g:['ガ','ギ','グ','ゲ','ゴ'],
    n:['ナ','ニ','ヌ','ネ','ノ'], d:['ダ','ディ','ドゥ','デ','ド'], t:['タ','ティ','トゥ','テ','ト'],
    r:['ラ','リ','ル','レ','ロ'], l:['ラ','リ','ル','レ','ロ'], m:['マ','ミ','ム','メ','モ'],
    b:['バ','ビ','ブ','ベ','ボ'], p:['パ','ピ','プ','ペ','ポ'], s:['サ','シ','ス','セ','ソ'],
    h:['ハ','ヒ','フ','ヘ','ホ'], j:['ジャ','ジ','ジュ','ジェ','ジョ'],
    ch:['チャ','チ','チュ','チェ','チョ'], sh:['シャ','シ','シュ','シェ','ショ'],
    f:['ファ','フィ','フ','フェ','フォ'], z:['ザ','ジ','ズ','ゼ','ゾ'],
    '':['ア','イ','ウ','エ','オ']
  };
  var _EN_CODA = { ng:'ン', n:'ン', m:'ム', k:'ク', g:'グ', l:'ル', r:'ル', p:'プ', b:'ブ', t:'ト', s:'ス', ch:'チ', h:'' };
  // 모음/이중모음 (긴 것부터). [철자, 활음(''/y/w), 핵모음idx(0a·1i·2u·3e·4o)]
  var _VOW = [
    ['yeo','y',4],['yae','y',3],['weo','w',4],['wae','w',3],['you','y',4],['yoo','y',2],
    ['eo','',4],['eu','',2],['ae','',3],['oe','w',3],['ui','w',1],['oo','',2],['ou','',4],['ee','',1],['uu','',2],
    ['ya','y',0],['yu','y',2],['ye','y',3],['yo','y',4],['yi','y',1],
    ['wa','w',0],['wo','w',4],['wi','w',1],['we','w',3],
    ['a','',0],['e','',3],['i','',1],['o','',4],['u','',2],
    ['y','y',1],['w','w',2]
  ];
  // 흔한 성씨의 관용 표기(영문 철자대로면 어색해지는 것만 소수 보정)
  var _SUR_EN = { park:'パク', lee:'イ', rhee:'イ', yi:'イ', oh:'オ', woo:'ウ', ahn:'アン',
                  noh:'ノ', roh:'ノ', choi:'チェ', suh:'ソ', yoo:'ユ' };
  function _romajiTok(tok) {
    var s = String(tok || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!s) return '';
    var DBL = { kk:'k', gg:'g', tt:'t', dd:'d', pp:'p', bb:'b', ss:'s', jj:'j', ll:'l' };
    function isNuc(c) { return !!c && 'aeiouyw'.indexOf(c) >= 0; }
    function matchVowel(p) {
      for (var k = 0; k < _VOW.length; k++) { var v = _VOW[k]; if (s.substr(p, v[0].length) === v[0]) return { glide:v[1], idx:v[2], next:p + v[0].length }; }
      return null;
    }
    function compose(onset, glide, idx) {
      var base = _EN_ROW[onset] || _EN_ROW[''];
      if (glide === 'y') { var yc = ({0:'a',1:'i',2:'u',3:'e',4:'o'})[idx]; return onset === '' ? (_YV[yc] || base[idx]) : (base[1] + (_Y[yc] || '')); }
      if (glide === 'w') { var wc = ({0:'a',1:'i',2:'u',3:'e',4:'o'})[idx]; return onset === '' ? (_WV[wc] || base[idx]) : (base[2] + (_W[wc] || '')); }
      return base[idx];
    }
    var i = 0, out = '', N = s.length;
    while (i < N) {
      var c = s.charAt(i), two = s.substr(i, 2);
      var isCons = (_EN_ROW[two] && two !== '') || DBL[two] || ('kgndtrlmbpshjfczv'.indexOf(c) >= 0);
      if (isCons) {
        var onsetKey, adv;
        if (_EN_ROW[two] && two !== '') { onsetKey = two; adv = 2; }
        else if (DBL[two]) { onsetKey = DBL[two]; adv = 2; }
        else { onsetKey = (c === 'c' ? 'k' : c === 'v' ? 'b' : c); adv = 1; }
        var after = i + adv;
        if (after < N && isNuc(s.charAt(after))) {
          var v = matchVowel(after);
          if (v) { var ok = (_EN_ROW[onsetKey] !== undefined) ? onsetKey : ''; out += compose(ok, v.glide, v.idx); i = v.next; continue; }
        }
        if (c === 'n' && s.charAt(i + 1) === 'g' && !isNuc(s.charAt(i + 2))) { out += 'ン'; i += 2; continue; }   // 종성 ng
        out += (_EN_CODA[onsetKey] !== undefined ? _EN_CODA[onsetKey] : (_EN_CODA[c] || '')); i += adv; continue;
      }
      if (isNuc(c)) { var v2 = matchVowel(i); if (v2) { out += compose('', v2.glide, v2.idx); i = v2.next; continue; } }
      i++;
    }
    return out;
  }
  function romajiToKana(str) {
    return String(str || '').trim().split(/\s+/).map(_romajiTok).join('');
  }
  // 팀 대표 태그 표시용 — 개인 순번 숫자만 제거하고 숙소 분류 문자(Y/K/G/S 등)는 유지.
  //   "DAあ-1Y" → "DAあ-Y" · "GFな-12K" → "GFな-K" · 접미 없는 코드(FAあ)는 그대로.
  //   ※레스토랑 명표·항공커버처럼 대표만 나오는 출력에서 "-1" 이 무의미해 숫자만 뺀다.
  function tagStripSeq(tag) {
    return String(tag == null ? '' : tag).replace(/-(\d+)([A-Za-z]*)$/, function (m, n, s) { return s ? '-' + s : ''; });
  }

  // ── 운영팀 묶음 태그(대표코드 기준) ──────────────────────────────────
  //  base = 대표팀 tagStripSeq (예 "DRな-Y"). 묶은 팀은 대표코드를 공유하고 번호만 다르게.
  //   · 팀단위(手配書·夕食·航空カバー): 시설문자 '뒤' 번호  base+"1" → "DRな-Y1"
  //   · 개인(네임택): 시설문자 '앞' 번호(기존 개인태그 형식)  "DRな-Y" → "DRな-2Y"
  //  n=0/undefined 이면 번호 없이 base 그대로(묶이지 않은 단독 팀).
  function teamTagN(base, n) {
    base = String(base == null ? '' : base);
    return n ? base + String(n) : base;
  }
  function personTagN(base, n) {
    base = String(base == null ? '' : base);
    if (!n) return base;
    var m = base.match(/^(.*-)([A-Za-z])$/);   // ...-Y → 시설문자 앞에 번호 삽입
    return m ? m[1] + n + m[2] : base + '-' + n;
  }
  // 묶음 이름(team_group)이 대표팀 태그코드라, 같은 코드를 쓰는 '다른 시기의 묶음'과
  //  한 덩어리로 합쳐질 수 있다(F풀 코드 재사용·회원코드 재등장). 합쳐지면 순번이
  //  1,1,2,2,3,3 → 재부여 1..6 이 되어 한쪽이 Y2/Y4/Y6 로 밀린다(실제 발생).
  //  → 입국일 간격으로 실제 묶음을 갈라낸다. 한 묶음은 같은 여정이라 며칠 안에 모인다.
  //  members=[{event_seq, dep, …}] → 날짜순 클러스터 배열(원본 객체 유지).
  function groupClusters(members, gapDays) {
    var gap = (gapDays == null ? 45 : gapDays) * 86400000;
    var list = (members || []).slice().sort(function (a, b) {
      var ad = String(a.dep || ''), bd = String(b.dep || '');
      if (ad !== bd) return ad < bd ? -1 : 1;
      return String(a.event_seq || a.seq) < String(b.event_seq || b.seq) ? -1 : 1;
    });
    var out = [], cur = [];
    list.forEach(function (m) {
      if (!cur.length) { cur.push(m); return; }
      var prev = parseLocalDate(cur[cur.length - 1].dep), now = parseLocalDate(m.dep);
      if (!isNaN(prev) && !isNaN(now) && (now - prev) > gap) { out.push(cur); cur = [m]; }
      else cur.push(m);
    });
    if (cur.length) out.push(cur);
    return out;
  }
  // 대표(rep)가 2개 이상이면 = 서로 다른 묶음이 한 이름으로 합쳐진 것(확정 신호).
  //  각 팀을 '가장 가까운 대표'에게 붙여 정확히 갈라낸다(같은 달에 겹쳐도 동작).
  function splitByReps(members) {
    var list = (members || []).slice();
    var reps = list.filter(function (m) { return !!m.rep; });
    if (reps.length < 2) return [list];
    var buckets = reps.map(function (r) { return { rep: r, items: [] }; });
    list.forEach(function (m) {
      if (m.rep) { buckets.find(function (b) { return b.rep === m; }).items.push(m); return; }
      var best = 0, bd = Infinity;
      buckets.forEach(function (b, i) {
        var a = parseLocalDate(m.dep), c = parseLocalDate(b.rep.dep);
        var d = (isNaN(a) || isNaN(c)) ? Infinity : Math.abs(a - c);
        if (d < bd) { bd = d; best = i; }
      });
      buckets[best].items.push(m);
    });
    return buckets.map(function (b) { return b.items; }).filter(function (x) { return x.length; });
  }
  // 그 팀이 속한 클러스터만 돌려준다(없으면 전체).
  function clusterOf(members, seq, gapDays) {
    var s = String(seq);
    // ① 대표가 둘 이상이면 대표 기준으로 먼저 가른다(확정) ② 그다음 날짜 간격으로 한 번 더
    var cs = [];
    splitByReps(members).forEach(function (part) {
      groupClusters(part, gapDays).forEach(function (c) { cs.push(c); });
    });
    for (var i = 0; i < cs.length; i++) {
      for (var j = 0; j < cs[i].length; j++) {
        if (String(cs[i][j].event_seq != null ? cs[i][j].event_seq : cs[i][j].seq) === s) return cs[i];
      }
    }
    return members || [];
  }

  // 그룹 내 팀 정렬: 대표 먼저, 그다음 (출발일 dep, event_seq) 오름차순. 팀번호=인덱스+1.
  //   teams=[{event_seq, dep}], repSeq=대표 event_seq. 원본 불변(새 배열 반환).
  function orderGroup(teams, repSeq) {
    var rs = String(repSeq == null ? '' : repSeq);
    return teams.slice().sort(function (a, b) {
      var ar = (String(a.event_seq) === rs) ? 0 : 1, br = (String(b.event_seq) === rs) ? 0 : 1;
      if (ar !== br) return ar - br;
      var ad = String(a.dep || ''), bd = String(b.dep || '');
      if (ad !== bd) return ad < bd ? -1 : 1;
      return String(a.event_seq) < String(b.event_seq) ? -1 : 1;
    });
  }

  // 영문 성명 → {sur, given} 가타카나(성=첫 토큰·관용보정, 명=나머지 토큰 각각 변환 후 결합)
  function nameYomiEn(nameEn) {
    var s = String(nameEn || '').trim();
    if (!s) return { sur: '', given: '' };
    var parts = s.split(/\s+/);
    var surTok = parts[0].toLowerCase().replace(/[^a-z]/g, '');
    var sur = _SUR_EN[surTok] || _romajiTok(parts[0]);
    var given = parts.slice(1).map(_romajiTok).join('');
    return { sur: sur, given: given };
  }

  return {
    looksMember: looksMember,
    isMember: isMember,
    ACCOM_LABEL: ACCOM_LABEL,
    accomLabel: accomLabel,
    gradeLabel: gradeLabel,
    fmtDate: fmtDate,
    parseFlexDate: parseFlexDate,
    parseLocalDate: parseLocalDate,
    overlaps: overlaps,
    nightsBetween: nightsBetween,
    accomRate: accomRate,
    b2bFees: b2bFees,
    accomFromProduct: accomFromProduct,
    nmCodeConflict: nmCodeConflict,
    weekday: weekday,
    mdWd: mdWd,
    isWeekendDay: isWeekendDay,
    JP_HOLIDAYS: JP_HOLIDAYS,
    isJpHoliday: isJpHoliday,
    isNonWorkday: isNonWorkday,
    golfRows: golfRows,
    usesYamanamiCC: usesYamanamiCC,
    PLACE_ITEMS: PLACE_ITEMS,
    OFFSITE_PLACES: OFFSITE_PLACES,
    roomPlaceKeys: roomPlaceKeys,
    placeInScope: placeInScope,
    TEE_FIRST: TEE_FIRST,
    TEE_STEP: TEE_STEP,
    TEE_LAST: TEE_LAST,
    teeSlots: teeSlots,
    splitTeam: splitTeam,
    wantsElectricCart: wantsElectricCart,
    cartRemarkKind: cartRemarkKind,
    cartPlan: cartPlan,
    parseCartNos: parseCartNos,
    allocCartNos: allocCartNos,
    NM_PREFIX: NM_PREFIX,
    NM_KANA: NM_KANA,
    NM_POOL: NM_POOL,
    nmIdxToCode: nmIdxToCode,
    nmCodeToIdx: nmCodeToIdx,
    nmSpreadIdx: nmSpreadIdx,
    originPort: originPort,
    isPus: isPus,
    FLOOR_FIXED: FLOOR_FIXED,
    FLOOR_FLEX: FLOOR_FLEX,
    allowedFloors: allowedFloors,
    mealGoneCount: mealGoneCount,
    MEAL_OFFSITE: MEAL_OFFSITE,
    mealOffsite: mealOffsite,
    mealPlan: mealPlan,
    hangulToKana: hangulToKana,
    nameYomi: nameYomi,
    romajiToKana: romajiToKana,
    nameYomiEn: nameYomiEn,
    tagStripSeq: tagStripSeq,
    teamTagN: teamTagN,
    personTagN: personTagN,
    orderGroup: orderGroup,
    groupClusters: groupClusters,
    splitByReps: splitByReps,
    clusterOf: clusterOf
  };
});
