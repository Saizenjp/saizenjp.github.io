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
    '호텔':           { ja: 'やまなみホテル',   ko: '야마나미 호텔',  en: 'Yamanami Hotel' },   // 표시 라벨만 (키 '호텔'은 불변 — Min 2026-08)
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

  // 방 타입(room_inventory.room_type) 화면 표시명 — 저장값(한글)은 불변, 표시만 언어별로.
  var ROOM_TYPE_LABEL = {
    '디럭스더블트윈': { ja: 'デラックスダブルツイン', ko: '디럭스더블트윈', en: 'Deluxe Double Twin' },
    '디럭스트윈':     { ja: 'デラックスツイン',       ko: '디럭스트윈',     en: 'Deluxe Twin' },
    '트윈':           { ja: 'ツイン',                 ko: '스탠다드 트윈',  en: 'Standard Twin' },
    '컴팩트트윈':     { ja: 'コンパクトツイン',       ko: '컴팩트트윈',     en: 'Compact Twin' },
    '트리플':         { ja: 'トリプル',               ko: '트리플',         en: 'Triple' },
    '싱글':           { ja: 'シングル',               ko: '싱글',           en: 'Single' },
    '더블':           { ja: 'ダブル',                 ko: '더블',           en: 'Double' },
    '4인실':          { ja: '4人室',                  ko: '4인실',          en: 'Quad Room' },
    '8인실':          { ja: '8人室',                  ko: '8인실',          en: 'Octa Room' },
    '2인1동':         { ja: 'コテージ(2名)',          ko: '2인1동',         en: 'Cottage (2p)' }
  };
  function roomTypeLabel(type, lang) {
    var m = ROOM_TYPE_LABEL[type];
    if (!m) return type == null ? '' : String(type);
    return m[lang] || m.ja || String(type);
  }
  // 층 이름(room_inventory.zone, 예 '3층') 화면 표시명 — 숫자+층 패턴만 언어별 변환, 그 외(소보별장 등)는 accomLabel 위임.
  function zoneLabel(zone, lang) {
    var s = zone == null ? '' : String(zone);
    var m = s.match(/^(\d+)\s*층$/);
    if (m) return lang === 'ja' ? (m[1] + '階') : (lang === 'en' ? (m[1] + 'F') : s);
    return accomLabel(s, lang);
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
  //  SheetJS(cellDates) 는 날짜 칸을 「1899-12-30 로컬 자정 + 일수」로 만들면서 그 기준 시각의 시간대 차이를 **분 단위로만** 본다.
  //  1899년의 서울은 지방평균시(+08:27:52)라 52초 모자란 Date 가 되어, 그대로 읽으면 날짜 칸이 하루 전으로 읽힌다(도쿄·UTC·미국은 오차 0).
  //  → 그 PC 시간대의 오차만큼만 더해 읽는다. 고정 60초를 더하면 오차가 없는 시간대에서 「23:59:30」처럼 시각이 붙은 칸이 다음 날로 넘어간다.
  //  오차 = 엔진이 분 단위로 알려 준 차이(getTimezoneOffset) − 실제 차이. 동쪽(서울 52초·상하이 43초)은 이르게 나와 그만큼 더하고,
  //  서쪽(상파울루 등)은 늦게 나와 날짜 칸이 이미 그날 0시 뒤라 더하지 않는다(0) — 빼는 보정은 하지 않는다(자정에 맞춘 보통 Date 가 하루 전으로 밀린다).
  //  ※ 표준시가 바뀐 날의 날짜 칸(서울 1954-03-21, 도쿄 1948~51 서머타임 시작일)은 30분·1시간 어긋나 하루 전으로 읽힌다 — 알려진 한계(칸이 글자면 해당 없음).
  var SHEET_FIX_MS = (function () {
    var b = new Date(1899, 11, 30), early = b.getTimezoneOffset() * 60000 - (b.getTime() - Date.UTC(1899, 11, 30));   // SheetJS 가 이르게 낸 만큼(ms)
    return (early > 0 && early < 60000) ? Math.round(early) : 0;
  })();
  function parseFlexDate(v) {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date && !isNaN(v)) return fmtDate(new Date(v.getTime() + SHEET_FIX_MS));
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
    //  2027 상품명 「쿠쥬 프라이빗 타운 야마나미CC N박」(2027-07 예약리스트, Min 2026-11-03) — 숙소 키는 2026 과 같이 '쿠주힐즈'(명칭 전환은 2026 예약 종료 후).
    if (/쿠주힐즈|구주힐즈|쿠쥬|프라이빗\s*타운|久住|장기\s*숙박|별장전용/.test(s)) return '쿠주힐즈';
    if (/간지|ガーンジー|GUERNSEY/i.test(s)) return '간지호텔';
    if (/시즈노야도|しずの宿/.test(s)) return '시즈노야도 료칸';   // ⚠ 넓은 '료칸' 제거: 벳푸 무츠키 료칸 등 타지 료칸 오분류 방지
    if (/야마나미|돔하우스|관내별장|소보별장|아소별장/.test(s)) return '야마나미리조트';
    return '';   // 미해당 = 타 리조트(스가다이라·14hills·벳푸·시로사토·미야자키 등) → 운영 원장 제외
  }
  // 판매구분(sale type) — 상품명 → 어느 객실 풀로 가는지의 단일 진실원.
  //  room.html 자동배정 라우팅(guessSaleType)·일별 체류 현황의 미배정 구역(needGroup)·現地精算表 룸타입 표기(settle_merit)가 같은 판정을 쓴다.
  //  2026 상품명: 「… 호텔 트윈 숙박」「… 호텔 소형트윈 숙박」「… 돔하우스 (숙박)」「… 관내별장 숙박」「여행사 …」(=돔하우스, Min 2026-08).
  //  2027 상품명(2027-07 예약리스트, Min 2026-11-03): 「호텔 숙박 야마나미CC N박」=호텔 트윈 · 「돔스테이 야마나미CC」=돔하우스 ·
  //    「소보 테라스 야마나미CC」(룸타입 4인)=소보 테라스(소보 5호 4인 1동 통째 자동배정) · 「히노키 스테이 야마나미CC」=히노키 스테이(=소보별장 2·3호 트윈 자동배정) ·
  //    「아소 프레스티지 야마나미CC」(8인)=아소별장(현장 수기·아소 후보 목록) — Min 2026-11-03 「소보 테라스는 5호로 자동배정해, 히노키 스테이는 소보별장이야. 2027년부터는 이름이 바뀐다」·
  //    「쿠쥬 프라이빗 타운 야마나미CC」=쿠주힐즈(accomFromProduct) · 간지·시즈는 2026 과 같다. 「관내별장」 표기는 2027 에 없다(Min).
  //  ⚠ 순서: 소형트윈 → 돔(돔하우스·돔스테이·여행사) → 소보 테라스 → 히노키(소보별장) → 아소 → 별장(관내) → 호텔 트윈. 2026 「여행사 … 호텔 소형트윈」은 소형트윈이 먼저라 호텔.
  //  accom 을 안 주면 accomFromProduct 로 판정한다. 야마나미 권역이 아니면 ''.
  function saleTypeFromProduct(name, accom) {
    var s = String(name == null ? '' : name);
    var ac = (accom == null || accom === undefined) ? accomFromProduct(s) : String(accom);
    if (/현지\s*예약/.test(s)) return '현지예약';
    if (ac === '야마나미리조트') {
      if (/소형\s*트윈/.test(s)) return '호텔 소형트윈';
      if (/돔\s*하우스|돔\s*스테이|ドーム|여행사/.test(s)) return '돔하우스';
      if (/소보\s*테라스/.test(s)) return '소보 테라스';
      if (/히노키|ヒノキ|hinoki|소보\s*별장/i.test(s)) return '히노키 스테이';
      if (/아소\s*프레스티지|아소\s*별장/.test(s)) return '아소별장';
      if (/별장/.test(s)) return '관내별장';
      return '호텔 트윈';
    }
    if (ac === '쿠주힐즈') return '장기숙박전용';
    if (ac === '간지호텔') return '호텔';
    if (ac === '시즈노야도 료칸') return '료칸';
    return '';
  }

  // 엠클릭 예약리스트 「룸타입」 열 → 싱글 요청(Min 2026-11-03 「3번은 그렇게 다 설정되어 있는거야」 = 엠클릭에서 그렇게 설정된 값이니 믿고 쓴다).
  //  값: 「싱글」 / 「싱글,트윈」 / 「트윈」 / 「컴팩트」 / 「본관(개인온천X)」 / 「별채(개인온천O)」 / 「4인(4PERSON)」 / 「8인(8PERSON)」 … (2027-07 예약리스트 실측)
  //  · 「싱글」(트윈 계열 없이) = 전원 1인 1실 → {kind:'all', n:인원}
  //  · 「싱글,트윈」 = 일부만 싱글: s 싱글 + t 트윈 = 인원(s,t ≥ 1) 이 유일한 건 3명(1+1실)·4명(2+1실)뿐 →
  //      3명·홀수 = 남는 1명이 싱글(기존 홀수 규칙과 같다) {kind:'odd', n:1} / 4명 = {kind:'mixed', n:2}(누가 싱글인지는 모름) /
  //      그 외 짝수 = {kind:'mixed', n:0}(비고 확인). 자동배정은 'all' 만 1인 1실, 'mixed' 는 보류(수기), 'odd' 는 평소대로.
  //  · 싱글 언급 없음 = null(비고 규칙만).
  //  ⚠ 룸타입 규칙은 **입국일(dep_date) 2027-01-01 이후 예약에만**(Min 2026-11-03 「2026년 예약은 그대로 조건 건드리지말고 해. 2027년부터야」).
  //    세 번째 인자 dep(입국일 'YYYY-MM-DD' 또는 Date)이 ROOMTYPE_FROM 앞이거나 없으면 null — 2026 예약은 종전 규칙(비고만) 그대로.
  //    step1 도 2026 입국 예약에는 room_type 을 저장하지 않고, SQL 163 의 _shizu_autofill_impl 도 같은 날짜(ROOMTYPE_FROM)로 거른다.
  var ROOMTYPE_FROM = '2027-01-01';
  function roomTypeOn(dep) {
    if (dep == null || dep === '') return false;
    var s;
    if (dep instanceof Date) { if (isNaN(dep.getTime())) return false; var m = dep.getMonth() + 1, d = dep.getDate(); s = dep.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d; }
    else s = String(dep).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= ROOMTYPE_FROM;
  }
  function roomTypeSingles(rt, pax, dep) {
    if (!roomTypeOn(dep)) return null;   // 2026 예약 불변
    var s = String(rt == null ? '' : rt);
    if (!/싱글|single|シングル/i.test(s)) return null;
    var twin = /트윈|twin|ツイン|컴팩트|더블|더블/i.test(s), p = Number(pax) || 0;
    if (!twin) return { kind: 'all', n: p };
    if (p === 4) return { kind: 'mixed', n: 2 };
    if (p % 2 === 1) return { kind: 'odd', n: 1 };
    return { kind: 'mixed', n: 0 };
  }
  // 룸타입 열 → 시즈노야도 別棟(별채) 선호(「별채(개인온천O)」). 현지비고 키워드(SHZ_ANNEX_RE)와 OR 로 쓴다. dep(입국일) 2027~ 만(roomTypeOn).
  var ROOMTYPE_ANNEX_RE = /별채|別棟|離れ/;
  function roomTypeAnnex(rt, dep) { return roomTypeOn(dep) && ROOMTYPE_ANNEX_RE.test(String(rt == null ? '' : rt)); }

  // ── 자회사 상품(구마모토 시내호텔·트라이얼 리조트) — 별도 원장 partner_bookings/partner_members(SQL 159, Min 2026-10-30) ──
  //  야마나미 권역 숙소가 아니라 step1 이 bookings 에서 버리던 상품. 야마나미 운영 표(bookings·guests…)에는 넣지 않고
  //  자회사 담당자만 보는 별도 원장에 적재한다(手配書·송영·식수·B2B·모니터 무영향). 상품명 → brand 는 여기 한 곳에서만 정한다.
  //  「트라이얼」표기 = Min 2026-11-02 확인(「일단 트라이얼이라는 단어 들어가」) — 전체 상품명은 추후, 다르면 re 한 줄만 고친다.
  var PARTNER_BRANDS = [
    { key: 'kumamoto', ref: 1, re: /구마모토\s*시내|쿠마모토\s*시내|熊本\s*市内|kumamoto\s*city/i,
      label: { ja: '熊本市内商品', ko: '구마모토 시내 상품', en: 'Kumamoto city products' },
      short: { ja: '熊本市内', ko: '구마모토 시내', en: 'Kumamoto city' } },
    { key: 'trial', ref: 2, re: /트라이얼|トライアル|\btrial\b/i,
      label: { ja: 'トライアルリゾート商品', ko: '트라이얼 리조트 상품', en: 'Trial Resort products' },
      short: { ja: 'トライアル', ko: '트라이얼', en: 'Trial' } }
  ];
  function partnerBrandDef(key) {
    for (var i = 0; i < PARTNER_BRANDS.length; i++) if (PARTNER_BRANDS[i].key === key) return PARTNER_BRANDS[i];
    return null;
  }
  // 상품 번호(ref) — 인솔 요금 줄(partner_rates kind='guide')의 ref_id 로 DB 에 저장된다. 한번 쓴 번호는 바꾸지 않는다(새 상품은 다음 번호).
  function partnerBrandRef(key) { var d = partnerBrandDef(key); return d && d.ref ? d.ref : null; }
  //  상품명 → 'kumamoto' | 'trial' | ''(자회사 상품 아님). 콤보(「구마모토 시내호텔 3박 + 야마나미리조트 2박」)도 brand 를 돌려준다
  //  (야마나미 쪽 적재는 accomFromProduct 가 따로 판정 — 둘 다 참이면 양쪽 원장에 들어간다).
  function partnerBrand(name) {
    var s = String(name == null ? '' : name);
    for (var i = 0; i < PARTNER_BRANDS.length; i++) if (PARTNER_BRANDS[i].re.test(s)) return PARTNER_BRANDS[i].key;
    return '';
  }
  function partnerLabel(key, lang, short) {
    var d = partnerBrandDef(key); if (!d) return String(key || '');
    var m = short ? d.short : d.label; return m[lang] || m.ja;
  }
  function isoShift(ds, n) {
    var d = parseLocalDate(ds); if (isNaN(d)) return '';
    d.setDate(d.getDate() + n); return fmtDate(d);
  }
  //  자회사 상품 구간(그 숙소에 묵는 밤) — 예약 전체 [dep, arr) 안에서 상품명으로 자른다.
  //   · 「+」로 나눈 구간 중 **숙박 구간만** 본다 = 「N박」이 있거나 숙소 이름(brand·야마나미 권역 accomFromProduct)·호텔/리조트/宿 글자가 있는 구간.
  //     「3색 골프」「송영」같은 비숙박 구간은 무시한다 — 실제 엠클릭 상품명 「[4박 5일] 구마모토 시내 호텔 + 3색 골프」(2026-11 적재 8팀)가
  //     「+」 때문에 콤보로 읽혀 전부 「確認」이 붙었던 원인(2026-11-02 수정).
  //   · 숙박 구간이 brand 하나뿐 = 예약 기간 전체(sure=true, pos 'all')
  //   · 콤보(숙박 구간 2개+) = brand 구간의 「N박」 + 그 앞 숙박 구간들의 박수 합(offset) → [dep+offset, dep+offset+N).
  //     박수가 없는 숙박 구간이 꼭 하나면 예약 박수 − 나머지 합으로 채운다(「구마모토 시내호텔 + 야마나미리조트 2박」 5박 → 구마모토 3박).
  //     그래도 못 읽거나 합이 예약 박수와 다르면 전체 기간 + sure=false(화면 「確認」).
  //   머리 「[5박 6일]」은 어디에 있어도(「여행사 [2박 3일] …」) 떼고 읽는다.
  //   반환 {from,to,nights,sure,pos:'all'|'first'|'mid'|'last'}
  var LODGING_RE = /호텔|리조트|숙박|별장|료칸|旅館|ホテル|リゾート|宿|hotel|resort/i;
  function partnerSegment(name, dep, arr, brand) {
    var s = String(name == null ? '' : name).replace(/\[[^\]]*\d+\s*박[^\]]*\]/g, ' ').replace(/^\s*\[[^\]]*\]\s*/, '');
    var d = String(dep || '').slice(0, 10), a = String(arr || '').slice(0, 10);
    var total = nightsBetween(d, a);
    var def = partnerBrandDef(brand || partnerBrand(s));
    var full = { from: d, to: a, nights: total, sure: false, pos: 'all' };
    if (!d || !a || !total || !def) return full;
    var segs = s.split(/\s*[+＋]\s*/).filter(function (x) { return x.trim(); });
    var isLodging = function (sg) { return /\d+\s*박/.test(sg) || def.re.test(sg) || !!accomFromProduct(sg) || LODGING_RE.test(sg); };
    var lod = segs.filter(isLodging);
    var idx = -1; lod.forEach(function (sg, i) { if (idx < 0 && def.re.test(sg)) idx = i; });
    if (idx < 0) return full;
    if (lod.length < 2) return { from: d, to: a, nights: total, sure: true, pos: 'all' };
    var nOf = function (sg) { var ms = sg.match(/(\d+)\s*박/g); if (!ms) return NaN; return Number(ms[ms.length - 1].match(/(\d+)/)[1]); };
    var ns = lod.map(nOf);
    var missing = []; ns.forEach(function (n, i) { if (!(n >= 0)) missing.push(i); });
    if (missing.length > 1) return full;
    if (missing.length === 1) {
      var known = ns.reduce(function (x, y) { return x + (y >= 0 ? y : 0); }, 0);
      var rest = total - known; if (!(rest > 0)) return full;
      ns[missing[0]] = rest;
    }
    var n = ns[idx]; if (!(n > 0)) return full;
    var sum = ns.reduce(function (x, y) { return x + y; }, 0);
    if (sum !== total) return full;   // 상품명 박수 합 ≠ 예약 박수 → 날짜를 믿을 수 없다
    var offset = 0; for (var i = 0; i < idx; i++) offset += ns[i];
    var from = isoShift(d, offset), to = isoShift(from, n);
    return { from: from, to: to, nights: n, sure: true, pos: idx === 0 ? 'first' : (idx === lod.length - 1 ? 'last' : 'mid') };
  }

  //  여행사(판매처) — Min 2026-11-02 「타 여행사 원장도 엠클릭에 넣고 메리트투어가 함께 관리 · 여행사 명은 따로 적어줄거임」
  //                 + Min 2026-11-04 「비고뿐 아니라 상품명에도 여행사·여행사명을 기재할 것 — 그것도 판정」.
  //   ① 예약리스트에 여행사/거래처/판매처 열이 있으면 그 값(explicit)
  //   ② 비고·현지비고의 「여행사: ○○」「여행사(○○)」「여행사 ○○투어」「[○○투어]」「○○여행사 …」 — 그 예약에만 적은 것이라 상품명보다 먼저
  //   ③ 상품명의 같은 형태(예 「여행사 우속투어 [2박 3일] 구마모토 시내 호텔 + 3색 골프」·「여행사: SOM 트래블 [3박 4일] …」)
  //   ③-2 상품명에 「여행사」 표시가 있고 **끝에 「 - ○○투어」**가 붙은 꼴(Min 2026-11-11 실제 엠클릭 상품명
  //        「여행사 [3박 4일] 구마모토 시내 호텔 + 3색 골프 - 우석투어」) → 그 이름. 끝의 (KE) 같은 괄호는 떼고 본다.
  //   ④ 상품명에 「여행사」만 있으면 '여행사(미기재)'(어느 여행사인지 적어 달라는 표시) ⑤ 그 외 '메리트투어'(엠클릭 기본 판매처).
  //   「여행사」라는 말이 없는 「○○투어」 토큰은 보지 않는다 — 「시즈노야도 료칸 골프 투어」처럼 상품명 자체에 「투어」가 흔해 오판한다.
  var AGENCY_SUFFIX = '(?:투어|여행사|여행|트래블|관광|ツアー|トラベル|観光|旅行|tour|travel)';
  var AG_STOP = '\\n,，、/|)）\\]\\[(（·';                                  // 이름이 끝나는 글자(구분자·괄호·대괄호·가운뎃점)
  var AG_TOK = '[^\\s' + AG_STOP + ']';
  var AG_RE_COLON = new RegExp('여행사\\s*[:：=]\\s*([^' + AG_STOP + ']+)');                                                           // 여행사: ○○
  var AG_RE_PAREN = new RegExp('여행사\\s*[(（]\\s*([^)）\\n]{1,30}?)\\s*[)）]');                                                        // 여행사(○○)
  var AG_RE_WORD = new RegExp('여행사\\s+((?:[^\\s\\d' + AG_STOP + ']' + AG_TOK + '*\\s+)?' + AG_TOK + '*' + AGENCY_SUFFIX + AG_TOK + '*)', 'i');   // 여행사 ○○투어 · 여행사 SOM 트래블
  var AG_RE_BRACK = new RegExp('\\[\\s*([^\\]\\n]{1,24}?' + AGENCY_SUFFIX + ')\\s*\\]', 'i');                                        // [○○투어]
  var AG_RE_LEAD = new RegExp('^\\s*(' + AG_TOK + '{1,20}여행사)(?=\\s|\\[|$)');                                                        // 한성여행사 [2박 3일] …
  var AG_RE_SUFFIX_END = new RegExp(AGENCY_SUFFIX + '$', 'i');
  function _agencyIn(txt) {                       // 한 문자열(비고 또는 상품명)에서 여행사 이름 — 없으면 ''
    txt = String(txt == null ? '' : txt); if (!txt) return '';
    var m = txt.match(AG_RE_COLON) || txt.match(AG_RE_PAREN) || txt.match(AG_RE_WORD) || txt.match(AG_RE_BRACK) || txt.match(AG_RE_LEAD);
    if (!m) return '';
    var tok = m[1].trim().split(/\s+/).filter(Boolean);
    for (var i = 0; i < tok.length; i++) if (AG_RE_SUFFIX_END.test(tok[i])) { tok = tok.slice(0, i + 1); break; }   // 「여행사: 한성투어 늦은 도착」 → 한성투어
    var name = tok.join(' ');
    return /^여행사$/.test(name) ? '' : name;
  }
  //  상품명 끝의 「 - ○○투어」 — 「여행사」 표시가 있는 상품명에서만, 이름에 투어·여행사·트래블·관광이 들어 있을 때만(「- 대한항공」「- 골프 투어」는 아님).
  var AG_MARK = /(^|[\s\[(（])여행사(?![가-힣A-Za-z])/;
  var AG_TAIL_RE = /[-–—―−－]\s*([^-–—―−－+\/|,，、()（）\[\]]{2,24})$/;
  var AG_TAIL_NO = /골프|호텔|리조트|숙박|료칸|항공|포함|\d\s*(?:박|일|색)/;
  var AG_SUFFIX_ANY = new RegExp(AGENCY_SUFFIX, 'i'), AG_SUFFIX_ONLY = new RegExp('^' + AGENCY_SUFFIX + '$', 'i');
  function _agencyTail(pn) {
    pn = String(pn == null ? '' : pn); if (!AG_MARK.test(pn)) return '';
    var s = pn.replace(/\s+$/, '');
    for (var k = 0; k < 3; k++) s = s.replace(/\s*[(（\[][^()（）\[\]]*[)）\]]$/, '');   // 끝의 (KE)·(TW/KE)·[특가] 같은 괄호 덩어리는 떼고 본다
    var m = s.match(AG_TAIL_RE); if (!m) return '';
    var name = m[1].trim().replace(/\s+/g, ' ');
    if (!AG_SUFFIX_ANY.test(name) || AG_SUFFIX_ONLY.test(name) || AG_TAIL_NO.test(name)) return '';
    return name;
  }
  function partnerAgency(o) {
    o = o || {};
    var ex = String(o.explicit == null ? '' : o.explicit).trim(); if (ex) return ex;
    var a = _agencyIn([o.remark, o.remark_local].map(function (x) { return String(x == null ? '' : x); }).join('\n'));
    if (a) return a;
    var pn = String(o.product_name == null ? (o.product == null ? '' : o.product) : o.product_name);
    a = _agencyIn(pn) || _agencyTail(pn); if (a) return a;
    if (AG_MARK.test(pn)) return '여행사(미기재)';
    return '메리트투어';
  }

  // ── 엠클릭 비고 → 수배 자동 채움 · 송영 차량/구간 계획 (Min 2026-11-03) ────────────────
  //  Min: 「수배 파일 업로드 때 엠클릭 비고란에 싱글룸·골프장·호텔명(·여행사)을 기재 → 그걸 기준으로 블록을 잡게.
  //        지금 수배 목록은 너무 많은 걸 적어 넣어야 함」 「송영은 8명이면 한 대, 20명 이상 대형 팀이 아니면 마이크로보다 하이에스 먼저」
  //        「구마모토 공항·호텔·골프장 세 곳이 송영지, 서로 50분 정도라 경유가 있을 수 있음」
  //  순수 함수 — 등록표(호텔·골프장·차량)는 인자로 받고 DB 는 모른다. step1(적재 직후)·partner_ops.html(제안 배지·[비고대로]) 양쪽이 같은 함수를 쓴다.
  var PARTNER_TRAVEL_MIN = 50;          // 공항↔호텔↔골프장 이동 시간(분)
  var PARTNER_BUS_MIN = 20;             // 이 인원부터 큰 차(마이크로버스)를 먼저 쓴다 — 그 아래는 하이에스(정원 9) 먼저
  var PARTNER_POINTS = ['airport', 'hotel', 'course', 'other'];
  //  정규화에서 지우는 글자(공백·문장부호) — _pnorm 과 partnerFindNames 의 자리 지도가 **같은 한 벌**을 쓴다(자리가 어긋나면 날짜·코스 짝이 틀어진다)
  var _PN_DROP = /[\s　·・\-ー_~〜()（）\[\]「」『』'"\.]/, _PN_DROP_G = new RegExp(_PN_DROP.source, 'g');
  function _pnorm(s) { return String(s == null ? '' : s).toLowerCase().replace(_PN_DROP_G, ''); }
  var _PN_STRIP = /(ホテル|호텔|hotel|ゴルフクラブ|カントリークラブ|ゴルフ倶楽部|ゴルフ場|カントリー|골프클럽|골프장|컨트리클럽|컨트리|골프|\bcc\b|\bgc\b)/ig;
  //  등록표 행(name_ja·name_ko·name·aliases 쉼표 구분) → 비고에서 찾을 때 쓰는 정규화 별칭 목록(2자 이상). 「○○호텔」「○○カントリークラブ」는 접미를 뗀 짧은 꼴도 넣는다.
  function partnerAliasList(row) {
    row = row || {}; var raw = [];
    ['name_ja', 'name_ko', 'name'].forEach(function (k) { if (row[k]) raw.push(String(row[k])); });
    String(row.aliases == null ? '' : row.aliases).split(/[,，、\n;]/).forEach(function (a) { if (a.trim()) raw.push(a.trim()); });
    var out = [];
    raw.forEach(function (a) {
      var n = _pnorm(a); if (n.length >= 2 && out.indexOf(n) < 0) out.push(n);
      var s2 = _pnorm(a.replace(_PN_STRIP, ' ')); if (s2.length >= 2 && s2 !== n && out.indexOf(s2) < 0) out.push(s2);
    });
    return out;
  }
  //  비고 안에서 등록표 이름을 전부 찾는다 → [{id,row,pos,len,alias}] (적힌 순서, 겹치면 긴 별칭 우선 — 「미나미아소트라이얼」 안의 「아소트라이얼」은 안 잡힌다).
  //  같은 이름이 두 번 적히면 두 번 잡힌다(골프장 2일 연속 같은 코스). 영문 별칭은 단어 경계(restaurant 안의 tau 같은 오탐 방지).
  //  경계는 **원문에서** 본다 — 정규화한 글에서 보면 「TAU twin」이 「tautwin」, 「Washington Hotel」이 「washingtonhotel」이 되어 이름을 놓친다.
  //   low = 소문자 원문, t = 정규화한 글(= _pnorm(text)), map[i] = t 의 i번째 글자가 low 에서 있던 자리. 돌려주는 pos·len 은 종전대로 t 기준.
  function partnerFindNames(text, rows) {
    var low = String(text == null ? '' : text).toLowerCase(), t = '', map = [], k, c;
    for (k = 0; k < low.length; k++) { c = low.charAt(k); if (!_PN_DROP.test(c)) { t += c; map.push(k); } }
    if (!t) return [];
    var hits = [];
    (rows || []).forEach(function (r) {
      if (!r || r.active === false) return;
      partnerAliasList(r).forEach(function (a) {
        var ascii = /^[a-z0-9]+$/.test(a); var i = t.indexOf(a);
        while (i >= 0) {
          var ok = true;
          if (ascii) { var b = low.charAt(map[i] - 1), e = low.charAt(map[i + a.length - 1] + 1); if (/[a-z]/.test(b) || /[a-z]/.test(e)) ok = false; }   // 원문의 앞뒤 글자가 영문이면 낱말 한가운데(앞의 날짜 「11/11kao」·뒤의 공백 「tau twin」은 허용)
          if (ok) hits.push({ id: r.id, row: r, pos: i, len: a.length, alias: a });
          i = t.indexOf(a, i + 1);
        }
      });
    });
    hits.sort(function (x, y) { return x.pos - y.pos || y.len - x.len; });
    var out = [];
    hits.forEach(function (h) {
      var last = out[out.length - 1];
      if (last && h.pos < last.pos + last.len) { if (h.len > last.len) out[out.length - 1] = h; return; }
      out.push(h);
    });
    return out;
  }
  //  뿌리가 같은 호텔·골프장(「○○호텔」·「○○골프」 — 접미를 뗀 짧은 별칭이 서로 같다): 다른 등록표의 **더 긴** 이름 안에 통째로 든 것은 그 이름의 일부다.
  //   「○○호텔」 안의 「○○」는 골프장이 아니고, 「○○골프」 안의 「○○」는 호텔이 아니다. 길이가 같으면(뿌리만 적은 꼴) 어느 쪽인지 알 수 없어 그대로 둔다.
  function _dropInside(hits, others) {
    if (!hits.length || !others.length) return hits;
    return hits.filter(function (h) { return !others.some(function (o) { return o.len > h.len && o.pos <= h.pos && h.pos + h.len <= o.pos + o.len; }); });
  }
  function _psig(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function _mdToIso(m, d, ref) {
    var y = Number(String(ref || '').slice(0, 4)) || new Date().getFullYear();
    var dt = new Date(y, m - 1, d); if (isNaN(dt) || dt.getMonth() !== m - 1) return '';
    var cand = fmtDate(dt);
    if (ref && cand < ref) { var c2 = fmtDate(new Date(y + 1, m - 1, d)); if (nightsBetween(ref, c2) <= 60) cand = c2; }   // 연말을 넘기는 체류(12/28 입국의 「1/2」)
    return cand;
  }
  //  비고(엠클릭 비고+현지비고) → 수배 제안. text=[비고, 현지비고](같은 글이면 한 번만 읽는다) · ctx={pax, hotels[], courses[], segFrom, segTo, product}
  //   호텔   = 등록표 이름·별칭이 처음 나오는 것(둘 이상이면 hotels 에 전부, 화면이 「확인」). 골프장 이름 안에 든 호텔 짧은 별칭은 세지 않는다(_dropInside — 골프장도 같다)
  //   객실   = singleRequested(싱글룸 N·전원 싱글·이름 나열·홀수 1명) + 트리플(「트리플 N」·「3인 1실」) → 나머지 2명씩 트윈, 남는 1명은 싱글(odd)
  //   골프장 = 적힌 순서대로 날짜별 1라운드. 날짜는 이름 앞의 「11/5」「2일차」「둘째날」(또는 바로 뒤의 M/D)을 읽고, 없으면 이어서 하루씩 —
  //            코스 수가 박수보다 적으면 도착 다음 날부터(4박 3코스 → 2·3·4일차), 같거나 많으면 도착일부터. 추정한 날짜는 explicit=false(화면 「날짜 확인」).
  //   여행사 = partnerAgency(비고 「여행사: ○○」·「○○투어」 → 상품명 「여행사 ○○투어 [2박 3일] …」·「여행사 [3박 4일] … - ○○투어」(ctx.product_name/product))
  //            ※ 서명(sig)에는 상품명 앞쪽 꼴만 넣는다(끝의 「- ○○투어」는 넣지 않음 — 여행사는 등록 때마다 partner_bookings.agency 로 다시 계산되므로 서명이 흔들릴 이유가 없다)
  //   sig    = 비고+인원 서명(partner_ops.auto_sig 에 저장 → 비고가 바뀌면 「비고 변경」)
  //  비고와 현지비고에 **같은 글을 두 번** 적는 입력 습관(Min 2026-11-11 실제 등록분 20건 전부) — 그대로 이어 붙여 읽으면 골프장이 두 번 잡혀 라운드가 두 배가 된다.
  //  → 읽는 글(parse)은 한쪽만(같거나 한쪽이 다른 쪽을 품으면 긴 쪽), 서명(sig)은 종전처럼 이어 붙인 글 그대로(이미 저장된 auto_sig 가 흔들리지 않게).
  //  text 는 [비고, 현지비고] 배열(권장) 또는 이어 붙인 문자열(문자열이면 「앞 절반 = 뒤 절반」일 때만 한쪽을 쓴다).
  function _remarkParts(text) {
    if (Array.isArray(text)) {
      var ps = text.filter(Boolean).map(String), joined = ps.join('\n');
      var qs = ps.filter(function (x) { return x.trim(); });
      if (qs.length === 2) {
        var a = _pnorm(qs[0]), b = _pnorm(qs[1]);
        if (a && b) { if (a.indexOf(b) >= 0) return { sig: joined, parse: qs[0] }; if (b.indexOf(a) >= 0) return { sig: joined, parse: qs[1] }; }
      }
      return { sig: joined, parse: joined };
    }
    var txt = String(text == null ? '' : text);
    for (var i = txt.indexOf('\n'); i >= 0; i = txt.indexOf('\n', i + 1)) {
      var x = _pnorm(txt.slice(0, i)); if (x && x === _pnorm(txt.slice(i + 1))) return { sig: txt, parse: txt.slice(0, i) };
    }
    return { sig: txt, parse: txt };
  }
  function partnerRemarkPlan(text, ctx) {
    ctx = ctx || {}; var rp = _remarkParts(text), txt = rp.parse;
    var pax = Number(ctx.pax) || 0, segFrom = String(ctx.segFrom || '').slice(0, 10), segTo = String(ctx.segTo || '').slice(0, 10);
    //  골프장 날짜를 읽기 전에 **조각 경계**를 표식으로 남긴다(정규화 _pnorm 이 공백·줄바꿈을 지우기 전에) — 날짜는 같은 조각 안의 코스에만 붙는다.
    //   「‡」 = 숙박 기간(「12/1~12/5」「11/4-11/8」 — 코스 날짜가 아니다) · 「|」 = 날짜의 끝(「12/1 4명」이 「12/14명」으로 붙지 않게) ·
    //   「¶」 = 줄바꿈 · 「§」 = 구분자로 쓴 슬래시(앞뒤 한쪽이라도 빈칸 — 날짜의 슬래시는 숫자에 붙어 있다). 이름 찾기에는 영향이 없다.
    var txtG = txt.replace(/\d{1,2}\/\d{1,2}[ \t　]*[~〜\-–—][ \t　]*(?:\d{1,2}\/)?\d{1,2}(?![\d\/:])/g, '‡')
      .replace(/(\d{1,2}\/\d{1,2})(?=[\s　·・\-ー_~〜()（）\[\]「」『』'"\.])/g, '$1|')
      .replace(/([\s　·・\-ー_~〜()（）\[\]「」『』'"\.])(\d{1,2}\/\d{1,2})(?!\d)/g, '$1|$2')                 // 날짜의 앞도(「트윈 2 11/5」가 「트윈211/5」로 붙지 않게)
      .replace(/\r?\n/g, '¶').replace(/[ \t　]+\/[ \t　]*|[ \t　]*\/[ \t　]+/g, '§');
    var hh = partnerFindNames(txt, ctx.hotels || []), ch = partnerFindNames(txtG, ctx.courses || []);
    //  두 등록표를 같은 글에서 맞댄다(자리 비교는 같은 정규화 글끼리 — 호텔은 txt, 골프장은 txtG)
    hh = _dropInside(hh, partnerFindNames(txt, ctx.courses || []));
    ch = _dropInside(ch, partnerFindNames(txtG, ctx.hotels || []));
    var hotel = hh.length ? hh[0] : null;
    var hotelIds = []; hh.forEach(function (h) { if (hotelIds.indexOf(h.id) < 0) hotelIds.push(h.id); });
    //  「싱글룸 2」「싱글: 2」처럼 단위 없는 수(Min 비고 양식)를 먼저 본다 — 야마나미 비고용 singleRequested 는 단위 없는 수를 세지 않고 이름 나열로 오독할 수 있다
    var sm = txt.match(/(싱글|シングル|single)\s*(?:룸|room|ルーム)?\s*[:：]?\s*(\d{1,2})(?![\/:\d])/i);
    //  「1인 1실」(싱글이라는 말 없이 적은 꼴, Min 2026-11-11 양식 「워싱턴 (2인 1실)」의 짝) — 「1인 1실 2방」이면 그 수, 수가 없고 「2인 1실」도 없으면 전원
    var so = txt.match(/(?:^|[^\d])1\s*인\s*1\s*실(?:\s*[,:：]?\s*(\d{1,2})\s*(?:방|실|룸|개))?/);
    var solo = !!so && !sm && !SG_WORD.test(txt);
    var sg = (sm && Number(sm[2]) > 0 && Number(sm[2]) <= 30) ? { n: Number(sm[2]), how: 'num' }
      : (solo && so[1] && Number(so[1]) > 0) ? { n: Number(so[1]), how: 'num' }
      : (solo && !/2\s*인\s*1\s*실/.test(txt)) ? { n: pax, how: 'all' } : singleRequested(txt, pax);
    var single = Math.min(pax, Math.max(0, Number(sg.n) || 0));
    var tm = txt.match(/트리플\s*(\d{1,2})|(\d{1,2})\s*트리플|トリプル\s*(\d{1,2})|(\d{1,2})\s*トリプル/);
    var triple = tm ? Number(tm[1] || tm[2] || tm[3] || tm[4]) : (SG_TRIPLE.test(txt) ? 1 : 0);
    if (triple * 3 + single > pax) triple = Math.max(0, Math.floor((pax - single) / 3));
    var rest = pax - single - triple * 3; var twin = Math.max(0, Math.floor(rest / 2)); var odd = rest - twin * 2;
    if (odd === 1) single += 1;
    var t = _pnorm(txtG), nights = (segFrom && segTo) ? nightsBetween(segFrom, segTo) : 0;
    var cur = segFrom ? isoShift(segFrom, (ch.length && nights > 0 && ch.length < nights) ? 1 : 0) : '';
    var golf = [], assumed = 0, days = ['첫', '둘', '셋', '넷', '다섯', '여섯', '일곱'];
    //  날짜 토큰 — M/D(앞에 연도·다른 수가 「/」로 이어져도 뒤의 둘: 「2026/11/5」「26/11/5」「싱글룸2/11/5」) · N일차/N일째/N日目 · 첫날/둘째날 …
    //   코스 날짜로 쓰지 않는 것(ex): 숙박 기간(‡) · 체류(segFrom~segTo) 밖 날짜(접수일·다른 구간) · 「12/5 귀국」처럼 귀국·체크아웃이 붙은 날짜.
    //   ex 토큰도 자리는 남긴다 — 그 너머의 날짜를 코스가 끌어오지 못하게.
    var toks = [], dm, dre = /(?:\d{1,4}\/)?(\d{1,2})\/(\d{1,2})(?!\d)(?!일차|일째|日目|명|인|팀|조|대|홀|名|人|組|台)(?!\/(?!\d{1,2}(?:명|인|팀|조|대|홀|名|人|組|台)))|(\d{1,2})(?:일차|일째|日目)|(첫|둘|셋|넷|다섯|여섯|일곱)째?날|‡/g;
    while ((dm = dre.exec(t))) {
      if (dm[1] && (/\d/.test(t.charAt(dm.index - 1)) || (t.charAt(dm.index - 1) === '/' && /\d/.test(t.charAt(dm.index - 2))))) { dre.lastIndex = dm.index + 1; continue; }   // 더 긴 수·더 긴 「/」 사슬의 한가운데
      var iso = '', ex = dm[0] === '‡';
      if (dm[1]) iso = _mdToIso(Number(dm[1]), Number(dm[2]), segFrom);
      else if (dm[3]) iso = segFrom ? isoShift(segFrom, Number(dm[3]) - 1) : '';
      else if (dm[4]) iso = segFrom ? isoShift(segFrom, days.indexOf(dm[4])) : '';
      if (!ex && (!iso || (segFrom && segTo && (iso < segFrom || iso > segTo)))) ex = true;
      if (!ex && dm[1] && /^\|?(?:귀국|출국|체크아웃|帰国|チェックアウト)/.test(t.slice(dre.lastIndex, dre.lastIndex + 8))) ex = true;
      toks.push({ pos: dm.index, end: dre.lastIndex, iso: iso, ex: ex, used: false });
    }
    //  조각 — ¶·§·쉼표·세미콜론·글머리표, 그리고 날짜 밖의 슬래시에서 끊는다. nl = 그 조각 앞의 경계가 줄바꿈 하나뿐인가(이웃한 줄).
    var segs = [], sa = 0, sprev = '', si, sc, inDate = function (p) { return toks.some(function (d) { return p >= d.pos && p < d.end; }); };
    for (si = 0; si <= t.length; si++) {
      sc = t.charAt(si);
      if (si === t.length || sc === '¶' || sc === '§' || /[,，、;；■●◆※▶•]/.test(sc) || (sc === '/' && !inDate(si))) {
        segs.push({ a: sa, b: si, nl: sprev === '¶' && sa > 0 && t.charAt(sa - 2) !== '¶' });
        sa = si + 1; sprev = sc;
      }
    }
    segs.forEach(function (g) {
      g.cs = ch.filter(function (h) { return h.pos >= g.a && h.pos < g.b; });
      g.ds = toks.filter(function (d) { return d.pos >= g.a && d.pos < g.b; });
      //  날짜만 적힌 조각(요일·시각·오전/오후는 붙어 있어도 된다)
      var live = g.ds.filter(function (d) { return !d.ex; });
      g.dateOnly = !g.cs.length && g.ds.length === 1 && live.length === 1 &&
        /^(?:[월화수목금토일]요일|[월화수목금토일]|[月火水木金土日]曜?日?|오전|오후|am|pm|\d{1,2}:\d{2}|일|日|\|)*$/.test(t.slice(g.a, live[0].pos) + t.slice(live[0].end, g.b));
    });
    //  한 조각 안에서 코스와 날짜를 잇는다. 두 가지 꼴(날짜 → 코스 / 코스 → 날짜)을 모두 해 보고 더 많이 이어지는 쪽을 고른다 —
    //   같으면 글 전체의 꼴(「코스 1 + 날짜 1」 조각들의 다수결), 그래도 같으면 첫 코스에 더 가까운 쪽, 그다음은 조각의 첫 토큰.
    //   사이가 너무 멀거나(24자) 사이에 다른 날짜(ex 포함)가 있으면 잇지 않는다.
    var GAP = 24;
    function pairSeg(g, dateFirst) {
      var out = [], used = [];
      g.cs.forEach(function (h, ci) {
        var lo = ci > 0 ? g.cs[ci - 1].pos + g.cs[ci - 1].len : g.a, hi = ci < g.cs.length - 1 ? g.cs[ci + 1].pos : g.b, end = h.pos + h.len, k, d, pick = null;
        if (dateFirst) {
          for (k = g.ds.length - 1; k >= 0; k--) { d = g.ds[k]; if (d.end <= h.pos && d.pos >= lo) { if (!d.ex && !d.used && used.indexOf(d) < 0 && h.pos - d.end <= GAP) pick = d; break; } }
        } else {
          for (k = 0; k < g.ds.length; k++) { d = g.ds[k]; if (d.pos >= end && d.end <= hi) { if (!d.ex && !d.used && used.indexOf(d) < 0 && d.pos - end <= GAP) pick = d; break; } }
        }
        if (pick) { used.push(pick); out.push({ h: h, d: pick }); }
      });
      return out;
    }
    var vf = 0, vn = 0;
    segs.forEach(function (g) {
      var live = g.ds.filter(function (d) { return !d.ex; });
      if (g.cs.length === 1 && g.ds.length === 1 && live.length === 1) { if (live[0].end <= g.cs[0].pos) vf++; else vn++; }
    });
    var dateOf = {};
    segs.forEach(function (g) {
      if (!g.cs.length || !g.ds.length) return;
      var pf = pairSeg(g, true), pn2 = pairSeg(g, false), useF;
      if (pf.length !== pn2.length) useF = pf.length > pn2.length;
      else if (vf !== vn) useF = vf > vn;
      else {
        var h0 = g.cs[0], gl = Infinity, gr = Infinity;
        g.ds.forEach(function (d) { if (d.ex) return; if (d.end <= h0.pos) gl = Math.min(gl, h0.pos - d.end); else if (d.pos >= h0.pos + h0.len) gr = Math.min(gr, d.pos - h0.pos - h0.len); });
        useF = gl !== gr ? gl < gr : (g.ds[0].pos < h0.pos);
      }
      (useF ? pf : pn2).forEach(function (p) { p.d.used = true; dateOf[p.h.pos] = p.d.iso; });
    });
    //  줄을 나눠 적은 꼴(날짜만 적힌 줄 ↔ 코스만 적힌 줄) — 바로 이웃한 줄끼리만 잇는다(쉼표·슬래시 너머로는 잇지 않는다)
    segs.forEach(function (g, gi) {
      if (!g.cs.length || g.ds.length) return;
      var pv = segs[gi - 1], nx = segs[gi + 1], first = g.cs[0], last = g.cs[g.cs.length - 1];
      var pOk = !!(pv && g.nl && pv.dateOnly && !pv.ds[0].used && first.pos === g.a && dateOf[first.pos] == null);
      var nOk = !!(nx && nx.nl && nx.dateOnly && !nx.ds[0].used && last.pos + last.len === g.b && dateOf[last.pos] == null);
      if (pOk && nOk) { if (vn > vf) pOk = false; else nOk = false; }
      if (pOk) { pv.ds[0].used = true; dateOf[first.pos] = pv.ds[0].iso; }
      else if (nOk) { nx.ds[0].used = true; dateOf[last.pos] = nx.ds[0].iso; }
    });
    ch.forEach(function (h) {
      var date = dateOf[h.pos] || '', explicit = !!date;
      if (!date) { date = cur; if (segTo && date > segTo) date = segTo; assumed++; }
      golf.push({ courseId: h.id, name: h.row.name_ko || h.row.name_ja || h.row.name || '', date: date, explicit: explicit });
      if (date) cur = isoShift(date, 1);
    });
    var pn = ctx.product_name != null ? ctx.product_name : ctx.product;
    var agency = partnerAgency({ remark: txt, product_name: pn });
    var pa = _agencyIn(pn);                       // 상품명에서 읽힌 여행사 — 있을 때만 서명에 넣는다(여행사 없는 상품명은 기존 auto_sig 불변)
    return { hotelId: hotel ? hotel.id : null, hotelName: hotel ? (hotel.row.name_ko || hotel.row.name_ja || hotel.row.name || '') : '', hotels: hotelIds,
      single: single, twin: twin, triple: triple, singleHow: sg.how, odd: odd === 1,
      golf: golf, golfAssumed: assumed, agency: agency, agencyExplicit: agency !== '메리트투어' && agency !== '여행사(미기재)',
      empty: !hotel && !golf.length && !SG_WORD.test(txt) && !tm && !solo, sig: _psig(_pnorm(rp.sig) + '|' + pax + (pa ? '|' + pa : '')) };
  }
  //  송영 차량 배분 — pax 명을 차량 등록표(capacity·sort)로. 20명 미만=하이에스(정원<20)를 sort 순으로 채우고 모자라면 큰 차, 20명 이상=큰 차(정원 큰 순) 먼저.
  //  → {vehicles:[{vehicleId,name,capacity,pax}], short(못 태운 인원)}. 8명=하이에스 1대 · 12명=2대 · 20명=마이크로버스 1대.
  function partnerVehiclePlan(pax, vehicles) {
    pax = Number(pax) || 0;
    var vs = (vehicles || []).filter(function (v) { return v && v.active !== false && Number(v.capacity) > 0; })
      .slice().sort(function (a, b) { return (Number(a.sort) || 0) - (Number(b.sort) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0); });
    var small = vs.filter(function (v) { return Number(v.capacity) < PARTNER_BUS_MIN; });
    var big = vs.filter(function (v) { return Number(v.capacity) >= PARTNER_BUS_MIN; }).sort(function (a, b) { return Number(b.capacity) - Number(a.capacity); });
    var order = pax >= PARTNER_BUS_MIN ? big.concat(small) : small.concat(big);
    var left = pax, out = [];
    for (var i = 0; i < order.length && left > 0; i++) { var take = Math.min(left, Number(order[i].capacity)); out.push({ vehicleId: order[i].id, name: order[i].name, capacity: Number(order[i].capacity), pax: take }); left -= take; }
    return { vehicles: out, short: left };
  }
  function _hm(v) { var s = String(v == null ? '' : v).trim(); var m = s.match(/(\d{1,2}):(\d{2})/); if (m) return (m[1].length < 2 ? '0' : '') + m[1] + ':' + m[2]; m = s.match(/^(\d{1,2})(\d{2})$/); if (m) return (m[1].length < 2 ? '0' : '') + m[1] + ':' + m[2]; return ''; }
  function _hmAdd(hm, d) { var s = _hm(hm); if (!s) return ''; var t = Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) + d; t = Math.max(0, Math.min(23 * 60 + 59, t)); var h = Math.floor(t / 60), mm = t % 60; return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm; }
  //  구간(leg) ↔ 지점(from/via/to). 옛 행(지점 없음)은 leg 로 해석한다.
  // ── 호텔 제출용 숙박자 명단(宿泊者名簿) — Min 2026-11-04 「호텔 제출용 명단 엑셀: 고객명·영문성·영문이름·성별(M/F)·생년월일·여권번호·여권만료일·발행국가 + 호텔명·제목」 ──
  //  일본 호텔 프런트가 받아 보는 표라 제목·머리글은 일본어, 성별은 M/F, 날짜는 YYYY/MM/DD, 発行国은 코드(KOR). 순수 함수 — 엑셀 쓰기는 페이지(ExcelJS).
  //  team = { seq, rep, pax, from, to(체크아웃), agency } · members = partner_members 행(seq_in_team·is_rep·name_kr·name_en_last/first(없으면 name_en 을 성+이름으로 분리)·gender·birth·passport_no·passport_exp·passport_country)
  //  opts = { hotel(호텔명), rooms:{twin,single,triple}, staff(手配担当), company, today(YYYY-MM-DD) }
  var HL_HEAD = ['No.', '氏名（韓国語）', '姓（ローマ字）', '名（ローマ字）', '性別', '生年月日', '旅券番号', '旅券有効期限', '発行国', '国籍', '備考'];
  var HL_WD = ['日', '月', '火', '水', '木', '金', '土'];
  function partnerGenderMF(v) { v = String(v == null ? '' : v).trim(); if (!v) return ''; if (/^(남|男|m|male)/i.test(v)) return 'M'; if (/^(여|女|f|female)/i.test(v)) return 'F'; return ''; }
  function partnerCountryCode(v) {
    var s = String(v == null ? '' : v).trim(); if (!s) return '';
    if (/^(KOR|KR)$/i.test(s) || /한국|대한민국|韓国|korea/i.test(s)) return 'KOR';
    if (/^(JPN|JP)$/i.test(s) || /일본|日本|japan/i.test(s)) return 'JPN';
    if (/^(USA|US)$/i.test(s) || /미국|米国|united states/i.test(s)) return 'USA';
    if (/^[A-Za-z]{3}$/.test(s)) return s.toUpperCase();
    return s;
  }
  function _hlDate(v) { var d = parseFlexDate(v); return d ? d.replace(/-/g, '/') : ''; }
  function _hlDateWd(ds) { var d = parseFlexDate(ds); if (!d) return ''; var dt = parseLocalDate(d); return d.replace(/-/g, '/') + '（' + HL_WD[dt.getDay()] + '）'; }
  function partnerHotelList(team, members, opts) {
    team = team || {}; opts = opts || {}; var list = (members || []).slice();
    list.sort(function (a, b) { return (Number(a.seq_in_team) || 0) - (Number(b.seq_in_team) || 0); });
    //  객실 배정(opts.rooming = {명단 id: 방 키}) 을 주면 「部屋」 열을 넣고 같은 방끼리 붙인다(방 순서 → 명단 순). 안 주면 종전 11열 그대로.
    var rooming = (opts.rooming && typeof opts.rooming === 'object') ? opts.rooming : null, slotIdx = {};
    if (rooming) {
      partnerRoomSlots(opts.rooms).forEach(function (sl, i) { slotIdx[sl.key] = i; });
      var rk = function (m) { var k = rooming[m.id]; return (k && slotIdx[k] != null) ? slotIdx[k] : 9999; };
      list = list.map(function (m, i) { return { m: m, i: i }; }).sort(function (a, b) { return rk(a.m) - rk(b.m) || a.i - b.i; }).map(function (x) { return x.m; });
    }
    var rows = [], male = 0, female = 0, unknown = 0, noPass = 0, noBirth = 0;
    list.forEach(function (m, i) {
      var last = String(m.name_en_last == null ? '' : m.name_en_last).trim(), first = String(m.name_en_first == null ? '' : m.name_en_first).trim();
      if (!last && !first) { var en = String(m.name_en == null ? '' : m.name_en).trim().split(/\s+/).filter(Boolean); last = en.shift() || ''; first = en.join(' '); }
      var mf = partnerGenderMF(m.gender); if (mf === 'M') male++; else if (mf === 'F') female++; else unknown++;
      var pno = String(m.passport_no == null ? '' : m.passport_no).trim(); if (!pno) noPass++;
      var birth = _hlDate(m.birth); if (!birth) noBirth++;
      var cc = partnerCountryCode(m.passport_country);
      var row = [i + 1, String(m.name_kr == null ? '' : m.name_kr).trim(), last, first, mf, birth, pno, _hlDate(m.passport_exp), cc, cc, m.is_rep ? '代表' : ''];
      if (rooming) { var key = rooming[m.id]; row.splice(1, 0, (key && slotIdx[key] != null) ? partnerRoomLabel(key, 'ja') : ''); }
      rows.push(row);
    });
    var head = HL_HEAD.slice(); if (rooming) head.splice(1, 0, '部屋');
    var from = String(team.from || '').slice(0, 10), to = String(team.to || '').slice(0, 10);
    var n = (from && to) ? Math.max(0, nightsBetween(from, to)) : 0;
    var rooms = opts.rooms || {}; var roomParts = [];
    if (Number(rooms.twin) > 0) roomParts.push('ツイン' + Number(rooms.twin) + '室');
    if (Number(rooms.single) > 0) roomParts.push('シングル' + Number(rooms.single) + '室');
    if (Number(rooms.triple) > 0) roomParts.push('トリプル' + Number(rooms.triple) + '室');
    var pax = Number(team.pax) || list.length;
    var meta = [
      ['ホテル名', String(opts.hotel || '')],
      ['宿泊期間', from && to ? ('チェックイン ' + _hlDateWd(from) + ' 〜 チェックアウト ' + _hlDateWd(to) + '　' + n + '泊') : ''],
      ['団体名', (team.rep ? team.rep + ' 様 ご一行' : '') + (team.seq ? '（予約番号 ' + team.seq + '）' : '')],
      ['人数', pax + '名' + (male || female ? '（男' + male + '・女' + female + (unknown ? '・不明' + unknown : '') + '）' : '')],
      ['部屋構成', roomParts.join('・')],
      ['旅行会社', String(team.agency || '')],
      ['手配担当', [opts.company, opts.staff].filter(Boolean).join(' / ')],
      ['提出日', _hlDate(opts.today || fmtDate(new Date()))],
      ['備考', '※ 事前提出用。旅券情報は旅行会社の登録データ（旅券記載どおり）です。']
    ];
    return { title: '宿泊者名簿（団体）', sheet: '宿泊者名簿', meta: meta, head: head, rows: rows,
      counts: { male: male, female: female, unknown: unknown, total: list.length }, missing: { passport: noPass, birth: noBirth },
      file: 'hotel_guest_list_' + (team.seq || 'team') + (from ? '_' + from.replace(/-/g, '') : '') + '.xlsx' };
  }
  // ── 명단에서 객실 배정·골프 조 편성(Min 2026-11-11 「명단에서 객실 배정이나 골프 조 편성도 가능하게」 — 구마모토 시내·트라이얼) ──
  //  방 키 = 종류 글자 + 번호(T1·T2 트윈 / R1 트리플 / S1 싱글). 순서 = 트윈 → 트리플 → 싱글(명단 순으로 채울 때 남는 사람이 싱글).
  //  「지정」(pins)한 사람을 먼저 놓고, 지정하지 않은 사람은 명단 순으로 빈 자리에 넣는다 — 한 사람만 옮겨도 나머지가 알아서 맞춰진다.
  //  정원보다 많이 지정하면 막지 않고 over 로 알려 준다(화면이 빨갛게). 없는 방(객실 수를 줄인 뒤 남은 지정)은 무시.
  var PARTNER_ROOM_TYPES = [['twin', 'T', 2], ['triple', 'R', 3], ['single', 'S', 1]];
  var PARTNER_ROOM_LABEL = { T: { ja: 'ツイン', ko: '트윈', en: 'Twin ' }, R: { ja: 'トリプル', ko: '트리플', en: 'Triple ' }, S: { ja: 'シングル', ko: '싱글', en: 'Single ' } };
  function partnerRoomSlots(rooms) {
    rooms = rooms || {}; var out = [];
    PARTNER_ROOM_TYPES.forEach(function (t) {
      var n = Math.floor(Number(rooms[t[0]])); if (!(n > 0)) return; if (n > 99) n = 99;
      for (var i = 1; i <= n; i++) out.push({ key: t[1] + i, type: t[0], cap: t[2], no: i });
    });
    return out;
  }
  function partnerRoomLabel(key, lang) {
    var m = /^([TRS])(\d{1,2})$/.exec(String(key == null ? '' : key)); if (!m) return '';
    var l = PARTNER_ROOM_LABEL[m[1]]; return (l[lang] || l.ja) + m[2];
  }
  function partnerRooming(members, rooms, pins) {
    var slots = partnerRoomSlots(rooms).map(function (sl) { return { key: sl.key, type: sl.type, cap: sl.cap, no: sl.no, ids: [] }; });
    var by = {}; slots.forEach(function (sl) { by[sl.key] = sl; });
    var list = members || [], of = {}, auto = {}, unplaced = [], pinned = 0; pins = (pins && typeof pins === 'object') ? pins : {};
    list.forEach(function (m) { var k = pins[m.id]; if (k && by[k]) { of[m.id] = k; pinned++; } });
    var cnt = {}; slots.forEach(function (sl) { cnt[sl.key] = 0; }); Object.keys(of).forEach(function (id) { cnt[of[id]]++; });
    list.forEach(function (m) {
      if (of[m.id]) return; auto[m.id] = true;
      for (var i = 0; i < slots.length; i++) { if (cnt[slots[i].key] < slots[i].cap) { of[m.id] = slots[i].key; cnt[slots[i].key]++; return; } }
      of[m.id] = ''; unplaced.push(m.id);
    });
    list.forEach(function (m) { if (of[m.id]) by[of[m.id]].ids.push(m.id); });           // 방 안 순서 = 명단 순
    return { slots: slots, of: of, auto: auto, pinned: pinned, unplaced: unplaced, over: slots.filter(function (sl) { return sl.ids.length > sl.cap; }).map(function (sl) { return sl.key; }) };
  }
  //  골프 조 — ids(명단 순, 묶음 팀이면 묶음 전체) 를 size(4)명씩. 조 수 = 올림(인원÷4) 또는 지정한 가장 큰 조 번호. 인원은 고르게(10명 → 4·3·3).
  function partnerGolfGroups(ids, pins, opts) {
    var list = (ids || []).slice(), N = list.length, size = Math.max(1, Number((opts || {}).size) || 4); pins = (pins && typeof pins === 'object') ? pins : {};
    var of = {}, auto = {}, pinned = 0, G = Math.ceil(N / size);
    list.forEach(function (id) { var v = Number(pins[id]); if (v >= 1 && v <= N && Math.floor(v) === v) { of[id] = v; pinned++; if (v > G) G = v; } });
    var groups = []; for (var g = 1; g <= G; g++) groups.push({ no: g, ids: [] });
    var base = G ? Math.floor(N / G) : 0, rem = G ? N % G : 0, cnt = groups.map(function () { return 0; });
    var target = groups.map(function (x, i) { return base + (i < rem ? 1 : 0); });
    Object.keys(of).forEach(function (id) { cnt[of[id] - 1]++; });
    list.forEach(function (id) {
      if (of[id]) return; auto[id] = true; var pick = -1;
      for (var i = 0; i < G; i++) { if (cnt[i] < target[i]) { pick = i; break; } }
      if (pick < 0) { pick = 0; for (var j = 1; j < G; j++) if (cnt[j] < cnt[pick]) pick = j; }     // 지정이 몰려 목표가 다 찼으면 가장 적은 조로
      of[id] = pick + 1; cnt[pick]++;
    });
    list.forEach(function (id) { groups[of[id] - 1].ids.push(id); });                      // 조 안 순서 = 명단 순
    return { n: G, size: size, groups: groups, of: of, auto: auto, pinned: pinned, over: groups.filter(function (x) { return x.ids.length > size; }).map(function (x) { return x.no; }) };
  }
  function partnerRouteOf(leg) { return { in: ['airport', 'hotel'], golf_out: ['hotel', 'course'], golf_back: ['course', 'hotel'], out: ['hotel', 'airport'] }[leg] || ['', '']; }
  function partnerLegOf(from, to) { if (from === 'airport') return 'in'; if (to === 'airport') return 'out'; if (from === 'hotel' && to === 'course') return 'golf_out'; if (from === 'course' && to === 'hotel') return 'golf_back'; return 'other'; }
  //  송영 구간 계획 — team={dep(구간 시작),arr(구간 끝=체크아웃),fullDep,fullArr,arrTime(현지 도착),retTime(현지 출발)} · golf=[{play_date,tee_time}]
  //   도착일: 공항→호텔 / 그날 골프면 공항→골프장(도착+50+50+15분 안에 티오프면 호텔 경유) + 골프장→호텔
  //   중간일: 호텔→골프장(티 −60) · 골프장→호텔
  //   귀국일: 호텔→공항(출발편 −120) / 그날 골프면 호텔→골프장 + 골프장→공항(출발편 −120)
  //   시각은 예약 전체의 도착·출발일일 때만(콤보의 중간 구간은 비움). 반환 [{trip_date, leg, from_pt, via_pt, to_pt, depart_time}]
  function partnerLegPlan(team, golf, opts) {
    team = team || {}; opts = opts || {}; var T = Number(opts.travelMin) || PARTNER_TRAVEL_MIN;
    var dep = String(team.dep || '').slice(0, 10), arr = String(team.arr || '').slice(0, 10); if (!dep || !arr || dep > arr) return [];
    var arrTime = (!team.fullDep || String(team.fullDep).slice(0, 10) === dep) ? _hm(team.arrTime) : '';
    var retTime = (!team.fullArr || String(team.fullArr).slice(0, 10) === arr) ? _hm(team.retTime) : '';
    var byDate = {}; (golf || []).forEach(function (g) { var d = String(g.play_date || '').slice(0, 10); if (d && !byDate[d]) byDate[d] = g; });
    var out = [], ds = dep, guard = 0;
    var push = function (d, leg, f, v, to, tm) { out.push({ trip_date: d, leg: leg, from_pt: f, via_pt: v || '', to_pt: to, depart_time: tm || '' }); };
    while (ds <= arr && guard++ < 60) {
      var g = byDate[ds], tee = g ? _hm(String(g.tee_time || '').split(',')[0]) : '';
      if (ds === dep && ds === arr) { if (g) { push(ds, 'in', 'airport', '', 'course', arrTime); push(ds, 'out', 'course', '', 'airport', retTime ? _hmAdd(retTime, -(T + 70)) : ''); } }
      else if (ds === dep) {
        if (g) { var via = (arrTime && tee && _hmAdd(arrTime, 2 * T + 15) <= tee) ? 'hotel' : ''; push(ds, 'in', 'airport', via, 'course', arrTime); push(ds, 'golf_back', 'course', '', 'hotel', ''); }
        else push(ds, 'in', 'airport', '', 'hotel', arrTime);
      } else if (ds === arr) {
        if (g) { push(ds, 'golf_out', 'hotel', '', 'course', tee ? _hmAdd(tee, -(T + 10)) : ''); push(ds, 'out', 'course', '', 'airport', retTime ? _hmAdd(retTime, -(T + 70)) : ''); }
        else push(ds, 'out', 'hotel', '', 'airport', retTime ? _hmAdd(retTime, -(T + 70)) : '');
      } else if (g) { push(ds, 'golf_out', 'hotel', '', 'course', tee ? _hmAdd(tee, -(T + 10)) : ''); push(ds, 'golf_back', 'course', '', 'hotel', ''); }
      ds = isoShift(ds, 1);
    }
    return out;
  }

  // ── 자회사(구마모토 시내·트라이얼) 요금 계산 — 현지 요금표(2026-12 新料金)의 **구조**만 규칙으로(숫자는 DB partner_settings.rates, 저장소엔 없음 §3-2)
  //   밤 요금 구분 partnerNightType: 금·토·일·祝日·祝前日 밤 = 'hi'(休日料金) / 그 외 'wk' — 현지 日別 料金表 365일(2026-11~2027-10)과 전부 일치.
  //   골프 요금 구분 partnerGolfType: 토 'sat' · 일/祝日 'sun' · 그 외(금요일 포함) 'wk'.
  //   1인 요금 = Σ밤 호텔(객실 종류·밤 구분 + 호텔 가산) + Σ라운드 골프(날 구분) + 인솔(밤마다 day — 귀국일 요금은 없다) + 가산(adj).
  //   기본 골프 = 묵는 밤마다 1라운드(도착일 포함·귀국일 제외) — 현지 「3色ゴルフ」(4泊=4R, 3泊=3R) 과 같다.
  function partnerNightType(ds) {
    var d = parseLocalDate(ds); if (isNaN(d)) return 'wk';
    var wd = d.getDay(); if (wd === 5 || wd === 6 || wd === 0) return 'hi';
    if (JP_HOLIDAYS.indexOf(fmtDate(d)) >= 0) return 'hi';
    var nx = new Date(d); nx.setDate(nx.getDate() + 1); if (JP_HOLIDAYS.indexOf(fmtDate(nx)) >= 0) return 'hi';
    return 'wk';
  }
  function partnerGolfType(ds) {
    var d = parseLocalDate(ds); if (isNaN(d)) return 'wk';
    var wd = d.getDay(); if (wd === 6) return 'sat'; if (wd === 0 || JP_HOLIDAYS.indexOf(fmtDate(d)) >= 0) return 'sun'; return 'wk';
  }
  // ── 기간별 요금표(SQL 161 partner_rates) ───────────────────────────────────
  //  row = { id, kind:'hotel'|'golf'|'guide', ref_id(호텔 id / 코스 id / 인솔은 상품 번호 partnerBrandRef · null=공통), label, from_date, to_date(null=상시), prices:{…} }
  //    prices — hotel:{twin:{wk,hi},single:{wk,hi},triple:{wk,hi}} / golf:{wk,sat,sun} / guide:{day(1박당)} — 귀국일 요금(last)은 2026-11-11 Min 「귀국일 요금은 없애줘」로 폐지: 옛 줄에 값이 남아 있어도 읽지 않는다
  //    송영 요금(kind='transfer')은 2026-11-11 Min 결정으로 쓰지 않는다 — 인솔 요금에 포함(「인솔요금으로 두개를 통합」). DB 의 kind 값은 남아 있어도 읽지 않는다.
  //  해석(Min 2026-11-02 「호텔·골프장·송영 각각 · 기간마다 · 2~3월 평일/주말, 그 안에 또 다를 수 있고」):
  //    대상 지정 행 > 공통 행 · 좁은 기간 > 넓은 기간(상시가 가장 넓음) · 같으면 최근 행(id 큰 것) — 칸(키) 단위로 폴백.
  //    → 「2~3월」 넓은 기간 위에 「2/10~2/14」 좁은 기간을 토요일 골프 칸만 적어 두면 그 칸만 바뀐다.
  function partnerRateRows(legacy) {            // 옛 partner_settings.rates(공통 한 벌) → 행 배열(기간 없음·공통)
    var out = []; legacy = legacy || {};
    ['hotel', 'golf', 'guide'].forEach(function (k) { if (legacy[k] && typeof legacy[k] === 'object' && Object.keys(legacy[k]).length) out.push({ id: 0, kind: k, ref_id: null, label: '', from_date: null, to_date: null, prices: legacy[k] }); });
    return out;
  }
  function partnerRateCands(rows, kind, refId, ds) {
    ds = String(ds || '').slice(0, 10); var ref = (refId == null || refId === '') ? null : Number(refId);
    var refOf = function (r) { return (r.ref_id == null || r.ref_id === '') ? null : Number(r.ref_id); };
    var list = (rows || []).filter(function (r) {
      if (!r || r.kind !== kind) return false;
      var rr = refOf(r); if (rr !== null && rr !== ref) return false;
      if (r.from_date && ds < String(r.from_date).slice(0, 10)) return false;
      if (r.to_date && ds > String(r.to_date).slice(0, 10)) return false;
      return true;
    });
    var spanOf = function (r) { var f = r.from_date ? String(r.from_date).slice(0, 10) : '', t = r.to_date ? String(r.to_date).slice(0, 10) : ''; if (f && t) return Math.max(0, nightsBetween(f, t)); if (f || t) return 1e9; return 2e9; };
    list.sort(function (a, b) {
      var ra = refOf(a) === null ? 1 : 0, rb = refOf(b) === null ? 1 : 0; if (ra !== rb) return ra - rb;
      var sa = spanOf(a), sb = spanOf(b); if (sa !== sb) return sa - sb;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
    return list;
  }
  function partnerPrice(rows, kind, refId, ds, path) {
    var cands = partnerRateCands(rows, kind, refId, ds); path = Array.isArray(path) ? path : String(path || '').split('.').filter(Boolean);
    for (var i = 0; i < cands.length; i++) {
      var v = cands[i].prices || {}; for (var j = 0; j < path.length && v != null; j++) v = v[path[j]];
      if (v != null && v !== '' && isFinite(Number(v))) return Number(v);
    }
    return null;
  }
  //  o = { from, to(체크아웃), hotelId, brand(상품 — 인솔 요금 줄을 고른다), golf:[{date,courseId}](없으면 golfDates, 그것도 없으면 밤마다 공통 코스),
  //        surcharge(호텔 1인·1박 가산), twin, single, triple(객실 수), pax, adj(1인 가산), singleRate(싱글 1박 수기 요금 — 있으면 표 대신) }
  //  rates = partner_rates 행 배열(기간별) 또는 옛 공통 객체 { hotel:{…}, golf:{…}, guide:{…} }(partnerRateRows 로 변환)
  //  결과 = { ok, complete(요금 빠진 칸 없음), missing:['hotel:YYYY-MM-DD','golf:…','single:…'], nights, rounds, twin/single/triple(1인), golf, guide, persons, pax, total(팀=1인×인원), roomsMatch }
  //  인솔 요금(1인) = 묵는 밤마다 「1박당」(귀국일에 따로 더하는 요금 없음) — 그 상품 줄 > 전 상품 공통 줄(칸 단위 폴백). 송영 비용은 인솔 요금에 들어 있다(따로 더하지 않는다).
  function partnerQuote(o, rates) {
    o = o || {}; var rows = Array.isArray(rates) ? rates : partnerRateRows(rates);
    var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };
    var from = String(o.from || '').slice(0, 10), to = String(o.to || '').slice(0, 10);
    var n = nightsBetween(from, to);
    var empty = { ok: false, complete: false, missing: [], nights: 0, rounds: 0, twin: 0, single: 0, triple: 0, golf: 0, guide: 0, persons: 0, pax: num(o.pax), total: 0, roomsMatch: true };
    if (!(n > 0)) return empty;
    var nights = []; for (var i = 0; i < n; i++) { var d = parseLocalDate(from); d.setDate(d.getDate() + i); nights.push(fmtDate(d)); }
    var golfs = Array.isArray(o.golf) ? o.golf.filter(function (g) { return g && g.date; }).map(function (g) { return { date: String(g.date).slice(0, 10), courseId: g.courseId == null ? null : g.courseId }; })
      : (Array.isArray(o.golfDates) ? o.golfDates.filter(Boolean).map(function (d) { return { date: String(d).slice(0, 10), courseId: null }; }) : nights.map(function (d) { return { date: d, courseId: null }; }));
    var hotelId = (o.hotelId == null || o.hotelId === '') ? null : o.hotelId;
    var tw = num(o.twin), sg = num(o.single), tr = num(o.triple), pax = num(o.pax);
    var missing = [];
    var hotelOf = function (type) {
      var sum = 0;
      nights.forEach(function (ds) {
        var k = partnerNightType(ds), base;
        if (type === 'single' && o.singleRate != null && o.singleRate !== '') base = num(o.singleRate);
        else {
          base = partnerPrice(rows, 'hotel', hotelId, ds, [type, k]);
          if (base == null && type === 'triple') base = partnerPrice(rows, 'hotel', hotelId, ds, ['twin', k]);   // 트리플 요금 없으면 트윈 요금
          if (base == null) { base = 0; if (type === 'twin') missing.push('hotel:' + ds); if (type === 'single' && sg > 0) missing.push('single:' + ds); }
        }
        sum += base + num(o.surcharge);
      });
      return sum;
    };
    var golf = 0; golfs.forEach(function (g) { var p = partnerPrice(rows, 'golf', g.courseId, g.date, [partnerGolfType(g.date)]); if (p == null) { p = 0; missing.push('golf:' + g.date); } golf += p; });
    var gref = partnerBrandRef(o.brand);
    var guide = 0; nights.forEach(function (ds) { guide += num(partnerPrice(rows, 'guide', gref, ds, ['day'])); });
    var adj = num(o.adj);
    var pp = { twin: hotelOf('twin') + golf + guide + adj, single: hotelOf('single') + golf + guide + adj, triple: hotelOf('triple') + golf + guide + adj };
    var persons = tw * 2 + sg + tr * 3;
    return { ok: true, complete: missing.length === 0, missing: missing, nights: n, rounds: golfs.length, twin: pp.twin, single: pp.single, triple: pp.triple, golf: golf, guide: guide,
      persons: persons, pax: pax, total: pp.twin * tw * 2 + pp.single * sg + pp.triple * tr * 3, roomsMatch: !pax || persons === pax };
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
  //  · 귀국일 = PUS 팀만 **오전 18H 스루**(Min 2026-10-25 — 9H 폐기. 인천편은 오전 출발이라 라운딩 없음)
  //  · 체류 중 = 전원 18H. 단 간지호텔은 평일이면 九重高原CC, 주말·공휴일은 やまなみCC.
  var JP_HOLIDAYS = ['2025-01-01','2025-01-13','2025-02-11','2025-02-23','2025-02-24','2025-03-20','2025-04-29','2025-05-03','2025-05-04','2025-05-05','2025-05-06','2025-07-21','2025-08-11','2025-09-15','2025-09-23','2025-10-13','2025-11-03','2025-11-23','2025-11-24','2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23','2027-01-01','2027-01-11','2027-02-11','2027-02-23','2027-03-21','2027-03-22','2027-04-29','2027-05-03','2027-05-04','2027-05-05','2027-07-19','2027-08-11','2027-09-20','2027-09-23','2027-10-11','2027-11-03','2027-11-23',
    //  2028 — 春分(3/20)·秋分(9/22)은 예정일(전년 2월 官報 로 확정). 일요일과 겹치는 날이 없어 振替休日 없음. 다음 해 목록은 内閣府 「国民の祝日」 발표를 보고 추가한다(단위테스트가 7월부터 내년 목록을 요구한다).
    '2028-01-01','2028-01-10','2028-02-11','2028-02-23','2028-03-20','2028-04-29','2028-05-03','2028-05-04','2028-05-05','2028-07-17','2028-08-11','2028-09-18','2028-09-22','2028-10-09','2028-11-03','2028-11-23'];
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
      else if (ds === team.arr) { if (!isPus) continue; rows.push({ date: ds, course: 'やまなみCC', holes: 18, note: '帰国日(釜山便)' }); }
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

  // ── 라운딩 편성(코스 로테이션 + 티오프 배정) ────────────────────────────────
  //  현장 규칙(Min 2026-08):
  //   · 아소·소보·쿠주 **3코스가 같은 시간대에 동시 출발**. 슬롯은 6:50부터 7분 간격, 마지막 8:42(17조).
  //     → 하루 최대 17×3 = 51조.
  //   · 홀수는 golfRows 가 이미 판정한다 — 평일 27홀(18+9 서비스) · 주말/일본 공휴일 18홀 ·
  //     부산편 귀국일 오전 18홀 스루(2026-10-25, 맨 앞 티오프).
  //   · **로테이션** = 같은 팀이 여러 날 라운딩하면 코스를 아소→소보→쿠주로 돌린다.
  //     체류 며칠째인지(dayIdx)로 시작 코스를 정하고, 팀마다 시작점을 어긋나게 해 한 코스에 몰리지 않게 한다.
  var GOLF_COURSES = ['aso', 'sobo', 'kuju'];
  // 일별 코스 로테이션(Min 2026-10-25 「매일 아소→소보→쿠주 순서로 로테이션」 = 팀 단위 「가」).
  //  어제 아소에서 출발한 팀은 오늘 소보, 소보→쿠주, 쿠주→아소. 어제 기록이 없으면 null(화면은 가장 덜 찬 코스).
  // ── 消費税(内税) 공통 (P0 2026-10-27 공통화 · P1 세율 구분 + 단수처리 = 버림, docs/06 정산 보강) ─────────
  //  단가=税込(최종가, Min 2026-06 확정). 세율 rate 는 % 정수(10 / 8 軽減 / 0 非課税·不課税).
  //  · taxIncluded(税込, rate)  = 포함된 소비세 = 税込 × rate ÷ (100+rate) 를 **버림(切り捨て)**(D1, Min 2026-10-27).
  //    음수(환불·조정)는 0 방향 버림(절대값 버림·부호 유지) — SQL tax_included()(158, 정수 나눗셈)와 정수 엔 전수 동일.
  //  · 적격청구서 규칙 = 세액은 **청구서(folio) 단위·세율별로 1회** 단수처리. 행별 세액(charges.tax)은 참고값.
  //    → taxByRate(lines) 가 세율·구분별 税込 합계를 모아 그 합계에 한 번 버림한 세액을 돌려준다. 화면·御請求書·領収書·보고서가 전부 이걸 쓴다.
  //  · tax_class: taxable(課税) / exempt(非課税) / outside(不課税: ゴルフ場利用税·入湯税 등). 0% 는 둘 중 하나.
  var TAX_RATE = 10;
  var TAX_ROUNDING = 'floor';   // D1. 'round' / 'ceil' 로 바꾸려면 SQL tax_included(158)도 함께 바꿔야 한다(두 곳이 한 식).
  var TAX_OPTIONS = [           // 선택지(메뉴 관리·수기 청구). key = class:rate (저장은 두 컬럼 tax_class·tax_rate)
    { key: 'taxable:10', cls: 'taxable', rate: 10 },
    { key: 'taxable:8',  cls: 'taxable', rate: 8  },
    { key: 'exempt:0',   cls: 'exempt',  rate: 0  },
    { key: 'outside:0',  cls: 'outside', rate: 0  }
  ];
  var TAX_LABELS = {            // 짧은 라벨(인쇄물은 ja). 문장은 각 페이지 사전에서.
    ja: { 'taxable:10': '10%', 'taxable:8': '8%(軽減)', 'exempt:0': '非課税', 'outside:0': '不課税', mark8: '※', note8: '※は軽減税率(8%)対象', subject: '対象', taxIn: 'うち消費税' },
    ko: { 'taxable:10': '10%', 'taxable:8': '8%(경감)', 'exempt:0': '비과세', 'outside:0': '불과세', mark8: '※', note8: '※는 경감세율(8%) 대상', subject: '대상', taxIn: '내 소비세' },
    en: { 'taxable:10': '10%', 'taxable:8': '8% (reduced)', 'exempt:0': 'Tax-exempt', 'outside:0': 'Non-taxable', mark8: '※', note8: '※ reduced rate (8%) items', subject: 'subject', taxIn: 'incl. tax' }
  };
  function taxRound(x, mode) {
    mode = mode || TAX_ROUNDING;
    var s = x < 0 ? -1 : 1, a = Math.abs(x);
    var v = mode === 'round' ? Math.round(a) : (mode === 'ceil' ? Math.ceil(a) : Math.floor(a));
    return s * v;
  }
  function taxIncluded(gross, rate, mode) {
    gross = Number(gross || 0); rate = (rate == null) ? TAX_RATE : Number(rate);
    if (!(rate > 0) || !gross) return 0;
    return taxRound(gross * rate / (100 + rate), mode);   // 정수 엔이면 몫이 정수일 때 정확히 정수(IEEE), 아니면 1/(100+rate) 이상 떨어져 오차 없음
  }
  function netOf(gross, rate, mode) { return Number(gross || 0) - taxIncluded(gross, rate, mode); }
  //  세율·구분 → key. 구분이 과세가 아니면 세율은 0 으로 정규화(저장 check 와 같은 규칙).
  function taxKey(rate, cls) {
    cls = (cls === 'exempt' || cls === 'outside') ? cls : 'taxable';
    rate = (rate == null || rate === '') ? TAX_RATE : Number(rate);
    if (cls !== 'taxable') rate = 0;
    else if (rate !== 8 && rate !== 10) rate = (rate === 0 ? 0 : TAX_RATE);
    if (cls === 'taxable' && rate === 0) { cls = 'exempt'; }   // 과세 0% 는 없다 → 非課税로
    return cls + ':' + rate;
  }
  function taxParse(key) {
    var p = String(key || 'taxable:10').split(':');
    var k = taxKey(p[1], p[0]); var q = k.split(':');
    return { key: k, cls: q[0], rate: Number(q[1]) };
  }
  //  한 줄의 税込 금액 — 청구 행(amount+tax+service_charge) / 장바구니 줄(unit_price×qty) / 직접 gross
  function lineGross(l) {
    if (!l) return 0;
    if (l.gross != null) return Number(l.gross) || 0;
    if (l.amount != null || l.tax != null) return (Number(l.amount) || 0) + (Number(l.tax) || 0) + (Number(l.service_charge) || 0);
    return Math.round((Number(l.unit_price) || 0) * (Number(l.qty == null ? 1 : l.qty) || 0));
  }
  function taxBucketOrder(a, b) {
    var o = { taxable: 0, exempt: 1, outside: 2 };
    return (o[a.cls] - o[b.cls]) || (b.rate - a.rate);
  }
  //  청구서 단위 세율별 집계 — lines: 청구 행 또는 장바구니 줄(tax_rate·tax_class 없으면 10%·과세). voided 행은 뺀다.
  //  반환 { buckets:[{key,cls,rate,n,gross,tax,net}], gross, tax, net, n, has8, mixed }
  function taxByRate(lines, mode) {
    var map = {};
    (lines || []).forEach(function (l) {
      if (!l || l.voided) return;
      var t = taxParse(taxKey(l.tax_rate, l.tax_class));
      var b = map[t.key] || (map[t.key] = { key: t.key, cls: t.cls, rate: t.rate, n: 0, gross: 0, tax: 0, net: 0 });
      b.gross += lineGross(l); b.n += 1;
    });
    var buckets = Object.keys(map).map(function (k) { return map[k]; }).sort(taxBucketOrder);
    var out = { buckets: buckets, gross: 0, tax: 0, net: 0, n: 0, has8: false, mixed: buckets.length > 1 };
    buckets.forEach(function (b) {
      b.tax = taxIncluded(b.gross, b.rate, mode); b.net = b.gross - b.tax;
      out.gross += b.gross; out.tax += b.tax; out.net += b.net; out.n += b.n;
      if (b.cls === 'taxable' && b.rate === 8) out.has8 = true;
    });
    return out;
  }
  function taxLabel(x, lang) {
    var k = (typeof x === 'string') ? taxParse(x).key : (x && x.key) || taxKey(x && x.rate, x && x.cls);
    var L = TAX_LABELS[lang] || TAX_LABELS.ja;
    return L[k] || k;
  }

  function nextStartCourse(prev, courses) {
    var cs = courses || GOLF_COURSES; var i = cs.indexOf(String(prev || ''));
    if (i < 0) return null; return cs[(i + 1) % cs.length];
  }
  //  teams: [{ seq, pax, dayIdx }]  (dayIdx = 그 팀의 체류 중 그날이 몇 번째 라운딩일인지, 0부터)
  //  opts : { courses, slots, cap }
  //  반환 : [{ seq, course, tee, slot, pax }]  — 조 단위(팀 하나가 여러 조가 될 수 있다)
  function buildRounding(teams, opts) {
    opts = opts || {};
    var courses = opts.courses || GOLF_COURSES;
    var slots = opts.slots || teeSlots();
    var cap = opts.cap || 4;
    var used = {}, tail = {};                       // course → 앞에서 채울 index / 뒤에서 채울 index
    courses.forEach(function (c) { used[c] = 0; tail[c] = slots.length - 1; });
    function free(c, late) { return late ? (tail[c] >= used[c]) : (used[c] <= tail[c]); }
    function take(c, late) { return late ? tail[c]-- : used[c]++; }
    //  ⚠ 쿠주힐즈 숙박 팀은 **늦은 티오프**로(Min 2026-08).
    //    라운딩이 16:30~17:00에 끝나야 샤워 → 18시 식사 → 송영이 한 번에 이어진다.
    //    슬롯은 이른 것부터 채우므로, late 팀을 뒤로 돌리면 자연히 늦은 조를 받는다.
    var ordered = (teams || []).filter(function (t) { return !t.late; })
      .concat((teams || []).filter(function (t) { return !!t.late; }));
    var out = [];
    ordered.forEach(function (t, ti) {
      var parts = splitTeam(t.pax, cap);
      var start = ((+t.dayIdx || 0) + ti) % courses.length;   // 로테이션 시작 코스
      parts.forEach(function (n, gi) {
        // 시작 코스부터 빈 슬롯이 있는 코스를 찾는다(한 코스가 차면 다음 코스로)
        var picked = null;
        for (var k = 0; k < courses.length; k++) {
          var c = courses[(start + gi + k) % courses.length];
          if (free(c, t.late)) { picked = c; break; }
        }
        if (!picked) { out.push({ seq: t.seq, course: null, tee: null, slot: null, pax: n }); return; }
        var idx = take(picked, t.late);
        out.push({ seq: t.seq, course: picked, tee: slots[idx], slot: idx + 1, pax: n });
      });
    });
    return out;
  }

  // ── 카트 배정 규칙 (카트 관리표) ────────────────────────────────────────────
  //  · 전기(전동)카트 = 유료 사전신청. 현지전달비고(remark_local)에 신청 표기가 있는 팀만.
  //    → 그 팀의 라운딩 일수(golfRows) 전부에 자동 분배.
  //  · 그 외 팀 = 가솔린. 2인 예약팀은 2인승, 3인 이상은 4인승.
  //  카트 1대 정원 = 4명(2인승은 2명).
  //  ⚠ 「전기카드」는 카트→카드 오타다(메리트 비고 실측). 이 도메인에서 달리 해석될 수 없어
  //    **확정(sure)으로 인정**한다(Min 승인 2026-08). 「전기」 한 단어만 온 경우는 여전히
  //    'maybe' → 화면의 「재확인 필요」로 빠진다.
  //  「E카트」의 E 는 낱말 첫머리일 때만 — 「lotte 카드 결제」「THE 카드」처럼 영문 낱말 끝의 E 는 전기카트가 아니다.
  var CART_WORD = '전기\\s*카[트드]|전동\\s*카[트드]|電動\\s*カ[ーー]?ト|EV\\s*카[트드]|EV\\s*カ[ーー]?ト|(?:^|[^A-Za-z])E\\s*카[트드]';
  var CART_ELECTRIC = new RegExp(CART_WORD, 'i');
  //  ── 부정·미확정 문구 ── 전기카트에 「취소·불필요·신청 안 함·대기 …」가 붙으면 확정이 아니다(자동 저장·청구하지 않고 사람이 본다).
  //  틀렸을 때의 손해가 다르다: 취소된 카트를 확정으로 읽으면 청구가 나가고, 신청을 재확인으로 읽으면 사람이 한 번 더 본다 — 애매하면 재확인 쪽.
  //  다만 **다른 항목**(석식·싱글룸·송영 …)의 취소·대기까지 잡으면 평범한 신청이 날마다 손입력이 된다. 그래서 「그 카트의 것」을 이렇게 가른다:
  //   ① 절 = 줄바꿈·쉼표·슬래시(날짜 제외)·세미콜론·탭·글머리표·번호 목록·「 - 」·「+ & | *」에서 끊는다. 숫자 사이의 쉼표·가운뎃점·마침표는 끊지 않는다(「1,2일차」).
  //   ② 같은 절 안(낱말 뒤): **센 낱말**(취소·캔슬·불필요·신청 안 함·대신 가솔린 …)은 절 끝까지 본다 — 사유가 길어도 취소는 취소(「…고객 요청으로 취소」).
  //      **여린 낱말**(대기·없음·불가·미정·제외·문의 …)은 낱말과의 사이에 신청·수량·날짜·재고 말만 있을 때만(「전기카트 2대 대기」 ○ / 「변경 없음」「페어웨이 진입 불가」 ×).
  //      절 안에 다른 항목 이름(석식·싱글·송영·티타임 …)이 나오면 거기서부터는 그 항목 얘기다(「전기카트 2대 석식 취소」).
  //   ③ 괄호: 안에 센 낱말이 있으면 그 카트의 것(「(전체 취소)」「(고객 사정 취소)」) — 앞에 다른 항목 이름이나 단서(「우천 시」)가 있을 때만 건너뛴다. 여린 낱말은 ②와 같다.
  //   ④ 끊긴 자리 **바로 뒤 조각**: 제 주어·목적어가 없는 부정은 앞 항목에 붙는다 — 앞이 신청·수량·날짜 말뿐이고(「1대 취소」「신청 안 함」) 뒤가 비었거나 요청·종결 말일 때
  //      (「취소 부탁드립니다」「취소해 주시면 감사하겠습니다」). 「취소 2명」「대기: 싱글룸」「취소분 나오면 …」처럼 제 목적어가 있으면 다른 얘기다.
  //   ⑤ 낱말 앞: 「취소: 전기카트」「취소 요청: …」「(취소) …」, 취소 머리줄(「■취소」) 아래에 적힌 줄. 앞에 다른 낱말이 있으면(「석식 취소 - 전기카트」) 아니다.
  //   ⑥ 단서·이중 부정(「취소 시 연락」「대기 없이 확정」「취소 불가」「안되면 가솔린」)과 취소 규정·수수료 얘기는 부정이 아니다 — 그 낱말만 건너뛰고 뒤를 계속 본다.
  //   ⑦ 대수가 둘 이상 적혔거나(「2대→1대」「1대 추가 (총 3대)」) 0대면 사람이 본다.
  //  칸이 여럿이면(현지비고·비고) **칸마다 따로** 판정한다 — 다른 칸의 「없음」「미정」이 이 칸의 카트에 붙지 않게.
  var _CART_REQ = '사전\\s*신청|신청|사용|이용|예약|요청|대여|필요|희망|申請|申込み?|申し込み|利用|使用|予約|希望';
  var _CART_CXLW = '취소|캔슬|켄슬|캔설|cancel(?:l?ed)?|\\bCXL\\b|\\bCNX\\b|キャンセル|取消|取り消し';
  var _CART_STRONG = 'キャンセル待ち|취소\\s*대기|' + _CART_CXLW +
    '|(?:' + _CART_REQ + ')\\s*(?:은|는|을|를|이|가|도|は|を|も)?\\s*(?:하지\\s*않|치\\s*않|안\\s*(?:함|합|해|하|할|했)|없[음이습다어]|[xX×✕✖](?![\\dA-Za-z])|しません|しない|せず|なし|無し)' +
    '|(?:하지|치|타지|쓰지|원하지|원치)\\s*않' +
    '|안\\s*(?:함|합|해|하|할|했|씀|쓰|써|쓴|씁|탐|타요|타심|타십|탑니다|탄다)' +
    '|불필요|필요\\s*없|미신청|미사용|미이용|철회|삭제|포기|뺐|빼\\s*(?:주|고|달|줘)|아님|아닙니다' +
    '|不要|使いません|使わない|要りません|いりません|要らない|いらない|中止|辞退|見送り|not\\s+needed|no\\s+need';
  var _CART_WEAK = '없[음이습다어]|불가|대기|보류|미정|미확정|제외|마감|매진|품절|소진|안\\s*[되됨돼]|なし|無し|不可|保留|待ち|待機|ウェイティング|웨이팅|未定|未確定|除く|除外' +
    '|문의|가능\\s*여부|여부\\s*확인|가능한지|가능할지|될지|되는지|추후|검토|고민|検討|確認中';
  var _CART_NEG_G = new RegExp('(' + _CART_STRONG + ')|(' + _CART_WEAK + ')', 'ig');
  //  부정 낱말 뒤가 이러면 단서·이중 부정이다(그 낱말과 함께 건너뛴다)
  var _CART_COND_POST = /^\s*(?:능\s*)?(?:시(?:에는?|엔|는)?(?![가-힣])|時|の場合|した場合|되면|하면|이면|라면|으면|면(?![가-힣])|할\s*경우|일\s*경우|한\s*경우|의\s*경우|가능(?!\s*(?:할까|한가|한지|하나요|할지|할런지|여부|\?|？))|可能(?!か)|可(?![否能])|불가(?!능)|不可|없이|없음|없습니다|아님|아닙니다|풀림|해제|(?:→|->|=>)\s*(?:확정|OK|완료|確定|完了))/i;
  //  부정 낱말 뒤가 이러면 취소 규정·수수료 얘기다(뒤따르는 「없음·발생·안내」까지 건너뛴다)
  var _CART_FEE_POST = /^\s*(?:규정|수수료|위약금|차지|챠지|료(?![가-힣])|料|規定|ポリシー|policy|charge|fee)(?:\s*(?:은|는|이|가|도|は|が|も)?\s*(?:없[음이습다어]|있음|있습니다|발생[가-힣]*|안내|확인|부과[가-힣]*|なし|無し|あり))?/i;
  //  부정 낱말 **앞**이 이러면 단서다(「우천 시 취소」「비 오면 취소」)
  var _CART_COND_PRE = /(?:[가-힣)]\s*시(?:에는?|엔|는)?|時|(?:하|되|오|이|으|라|가|나|보|주|시)면|경우(?:에는?|엔)?|の場合|なら|たら)\s*$/;
  var _CART_NEUTRAL_PRE = /(?:변경|변동|문제|이상|사항|変更|問題|異常|事項)\s*(?:은|는|이|가|도|は|が|も)?\s*$/;                     // 「변경 없음」「특이사항·문의사항 없음」
  var _CART_PAXQ = /\d{1,2}\s?(?:명|인|팀|분|名|人)/;                                                                        // 인원 수 — 「1명 취소」는 사람 얘기다
  var _CART_KEEP_PRE = /(?:환불|변경|교환|양도|연기|返金|変更|払戻)\s*$/;
  //  다른 항목 이름 — 절·괄호 안에서 이것이 나오면 그 뒤의 부정은 그 항목의 것이다
  var _CART_ITEM = /싱글|트윈|투윈|더블|트리플|객실|조식|중식|석식|식사|특식|도시락|캐디|송영|차량|픽업|샌딩|버스|택시|온천|항공|좌석|수하물|호텔|숙박|쿠폰|환불|결제|지불|입금|현금|요금|비용|체크인|체크아웃|티타임|티업|라운딩|골프|シングル|ツイン|ダブル|トリプル|部屋|客室|朝食|昼食|夕食|食事|キャディ|送迎|温泉|航空|ホテル|宿泊|料金|支払|決済|ゴルフ|ラウンド/;
  //  부정 앞에 와도 되는 말(신청·수량·날짜·재고) — 이것뿐이면 그 부정은 카트 얘기다. 한 번에 지워 보고 남는 글자가 없는지 본다(되돌아가기 없는 치환).
  var _CART_OKTOK_G = /[\s\d\/.\-–~:：,·()（）\[\]【】]|사전\s*신청|신청|예약|요청|희망|사용|이용|대여|필요|예정|사전|현재|아직|일단|우선|전체|전부|모두|전원|하지|재고|수량|부족|일차|일째|박째|첫째\s*날|둘째\s*날|셋째\s*날|넷째\s*날|첫\s*날|마지막\s*날|마지막|입국일?|귀국일?|도착일?|출발일?|당일|익일|전일|[월화수목금토일]요일|오전|오후|으로|부터|까지|에는|에서|대|개|台|명|인|名|팀|건|회|만|은|는|이|가|을|를|도|의|에|로|일|날|申請|申込み?|申し込み|利用|使用|予約|希望|初日|最終日|到着日|出発日|当日|日目|日|のみ|は|を|も|が|の|に|まで|から|全て|全部|すべて|在庫/g;
  function _cartOnlyReq(s) { return String(s).replace(_CART_OKTOK_G, '') === ''; }
  var _CART_LEAD = /^[\s■□●○◆◇※▶▷•·ㆍ・★☆◎▪\-–—→:：(\[（【<=>*]+/;
  var _CART_HEAD_TAIL = new RegExp('(?:' + _CART_CXLW + ')\\s*(?:요청|건|사항|항목|내역|목록|리스트|됨|분|된|한|하신|済み?)?\\s*[:：)\\]）】>→\\-–—]*\\s*$', 'i');
  //  낱말 앞의 글이 취소 낱말(+요청·건·사항 …)로 끝나는가 — 그 앞에 다른 항목·인원 수가 있으면(「석식 취소 - 전기카트」「1명 취소 / …」) 아니다
  function _cartHeadNeg(h) {
    var m = _CART_HEAD_TAIL.exec(h); if (!m) return false;
    var pre = h.slice(0, m.index);
    return pre.length <= 12 && !_CART_ITEM.test(pre) && !_CART_PAXQ.test(pre);
  }
  var _CART_X = /(?:^|[\s:：(（]|카[트드]|ト|신청|사용|이용|\d\s*[대台개])\s*[xX×✕✖](?!\s*(?:[\dA-Za-z]|전\s*일|양일|매일|全日|毎日))/;
  var _CART_SWAP = /(?:가솔린|일반\s*카트|乗用|ガソリン)[^\n]{0,8}?(?:변경|変更|교체)/;
  var _CART_SEPC = /[\n\t;；。／|｜+＋&＆*＊■□●○◆◇※▶▷•★☆◎▪]/;
  function _cartNorm(text) {
    return String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  }
  //  i 자리에서 시작하는 「끊는 자리」의 길이(없으면 0)
  function _cartSepLen(t, i) {
    var c = t.charAt(i), p = t.charAt(i - 1), n = t.charAt(i + 1), code = t.charCodeAt(i);
    if (_CART_SEPC.test(c)) return 1;
    if (code >= 0x2460 && code <= 0x2473) return 1;                                              // ①~⑳
    if (c === ',' || c === '，' || c === '、' || c === '·' || c === 'ㆍ' || c === '・') return (/\d/.test(p) && /\d/.test(n)) ? 0 : 1;   // 「1,2일차」
    if (c === '/') return (/\d/.test(p) && /\d/.test(n)) ? 0 : 1;                                // 날짜의 슬래시
    if (c === '.') return (!(/\d/.test(p) && /\d/.test(n)) && (n === '' || /\s/.test(n))) ? 1 : 0;
    if ((c === '-' || c === '–' || c === '—') && /\s/.test(p) && /\s/.test(n)) return 1;          // 앞뒤가 빈칸인 줄표
    if (c >= '0' && c <= '9' && (i === 0 || /\s/.test(p))) {                                     // 번호 목록 「2) 」
      var j = i; while (j - i < 2 && /\d/.test(t.charAt(j))) j++;
      if (t.charAt(j) === ')' && (j + 1 >= t.length || /\s/.test(t.charAt(j + 1)))) return j - i + 1;
    }
    return 0;
  }
  function _cartOpen(c) { return c === '(' || c === '（' || c === '[' || c === '【'; }
  function _cartClose(c) { return c === ')' || c === '）' || c === ']' || c === '】'; }
  //  from 부터 한 절을 모은다 — 괄호 안은 따로(parens), 본문(main)에는 빈칸으로. at = 멈춘 자리, len = 그 자리의 끊는 글자 길이(0 = 글의 끝·바깥 괄호의 끝·길이 한도)
  function _cartCollect(t, from, cap) {
    var main = '', parens = [], i = from, c, L, close, k;
    for (; i < t.length && main.length < cap; i++) {
      c = t.charAt(i);
      if (_cartOpen(c)) {
        for (close = i + 1; close < t.length && close - i <= 60; close++) { k = t.charAt(close); if (_cartClose(k) || k === '\n') break; }
        parens.push(t.slice(i + 1, close));
        i = _cartClose(t.charAt(close)) ? close : close - 1; main += ' '; continue;
      }
      if (_cartClose(c)) break;                                                                  // 그 카트가 괄호 안에 적혀 있다 — 괄호가 닫히면 끝
      L = _cartSepLen(t, i);
      if (L) return { main: main, parens: parens, at: i, len: L };
      main += c;
    }
    return { main: main, parens: parens, at: i, len: 0 };
  }
  //  s 에서 「걸리는 부정 낱말」을 차례로 찾는다 — 단서·수수료·환불불가·「1대기준」은 건너뛴다. cb(낱말 정보) 가 true 를 돌려주면 거기서 끝(true).
  function _cartEachNeg(s, cb) {
    var m, w, pre, post, cm, fm;
    _CART_NEG_G.lastIndex = 0;
    while ((m = _CART_NEG_G.exec(s))) {
      w = m[0]; pre = s.slice(0, m.index); post = s.slice(m.index + w.length);
      if ((fm = _CART_FEE_POST.exec(post))) { _CART_NEG_G.lastIndex = m.index + w.length + fm[0].length; continue; }   // 「취소 수수료 없음」
      if ((cm = _CART_COND_POST.exec(post))) { _CART_NEG_G.lastIndex = m.index + w.length + cm[0].length; continue; }   // 「취소 시 연락」「대기 없이」「취소 불가」
      if (_CART_COND_PRE.test(pre)) continue;                                                    // 「우천 시 취소」
      if ((w === '불가' || w === '不可') && _CART_KEEP_PRE.test(pre)) continue;                   // 「환불불가」「변경 불가」
      if (w === '대기' && /\d$/.test(pre)) continue;                                           // 「1대기준」의 대+기
      if (!m[1] && /^없|^なし|^無し/.test(w) && _CART_NEUTRAL_PRE.test(pre)) continue;            // 「변경 없음」「問題なし」
      if (w === '문의' && /^\s?사항/.test(post)) continue;                                        // 「문의사항 없음」
      if (m[1] && /^안/.test(w) && /[가-힣]$/.test(pre) && !/(?:신청|사용|이용|예약|요청|대여|필요|희망|카[트드]|[은는도이가을를])$/.test(pre)) continue;   // 「편안하게」의 안+하
      if (cb({ strong: !!m[1], word: w, idx: m.index, end: m.index + w.length, pre: pre, post: post })) return true;
    }
    return false;
  }
  //  낱말 뒤 같은 절(다른 항목 이름 앞까지)
  function _cartNegTail(tail) {
    var im = _CART_ITEM.exec(tail), s = im ? tail.slice(0, im.index) : tail, sw;
    if (/^\s*(?:에서|은|는|이|가)?\s*(?:대신|말고|아니고)/.test(s)) return true;                   // 「전기카트 대신 가솔린」
    if ((sw = _CART_SWAP.exec(s)) && !_CART_COND_PRE.test(s.slice(0, sw.index)) && !/(?:시|時|면|경우|場合)\s/.test(s.slice(0, sw.index))) return true;   // 「일반카트로 변경」
    if (_cartEachNeg(s, function (n) { return n.strong || _cartOnlyReq(n.pre); })) return true;
    return _CART_X.test(s);
  }
  //  괄호 안 — 쉼표 등으로 나눈 조각마다
  function _cartNegParen(inner) {
    if (/^\s*[xX×✕✖]\s*$/.test(inner)) return true;
    var parts = String(inner).split(/[,，、;；\/／]/), k, hit = false;
    for (k = 0; k < parts.length && !hit; k++) {
      hit = _cartEachNeg(parts[k], function (n) {
        if (_CART_ITEM.test(n.pre)) return false;                                                // 「(석식 1회 취소)」「(싱글룸 대기)」
        return n.strong || _cartOnlyReq(n.pre);
      });
    }
    return hit;
  }
  //  부정 낱말 뒤가 비었거나 요청·종결 말뿐인가(제 목적어가 없다)
  function _cartEndingOnly(post) {
    if (/^(?:분|건)?[\s:：]*\d{1,2}\s?(?:대|台)(?!\s?(?:기|당))/.test(post)) return true;       // 「취소: 1대」「취소분 1대」 — 대수가 붙은 취소는 카트 얘기다
    if (/^(?:자|분|팀|건|수|료|율|표|석|인원|待ち)/.test(post)) return false;                      // 취소자·취소분·취소팀·대기석 = 제 낱말
    if (_CART_ITEM.test(post)) return false;
    var p = post.replace(/^[가-힣]{0,8}/, '');                                                   // 같은 낱말의 꼬리(취소**해**·안 합**니다**)
    return /^[\s)\]）】>.!~。*]*(?:(?:で|を|に)?\s*(?:요청|부탁|바랍|바람|드립|드려|합니다|해\s*주|주세요|주시|처리|완료|예정|입니다|요망|희망|원함|원합|중|お願い|です|でした|します|しました|済み?)[가-힣ぁ-んァ-ヶー一-龥\s.!~。*]*)?$/.test(p);
  }
  //  끊긴 자리 바로 뒤 조각 — 앞이 신청·수량·날짜 말뿐이고 뒤에 제 목적어가 없는 부정
  function _cartNegFrag(s, bare) {
    s = String(s).replace(_CART_LEAD, '');
    return _cartEachNeg(s, function (n) {
      if (!_cartEndingOnly(n.post)) return false;
      if (_cartOnlyReq(n.pre)) return bare || !(/^(?:없|なし|無し)/.test(n.word) && !n.pre.replace(/\s/g, ''));   // 조각이 「없음」뿐이면 다른 항목·다른 물음의 답이다(낱말만 적힌 머리 뒤라면 그 카트의 답)
      return n.strong && !_CART_ITEM.test(n.pre) && !_CART_PAXQ.test(n.pre);                              // 「고객 요청으로 취소」 — 사유가 앞에 붙은 취소(다른 항목·인원 수가 앞에 있으면 아니다)
    });
  }
  //  그 절의 대수들(서로 다른 값) — 「N대당」「N대기준」은 대수가 아니다. 다른 항목이 적힌 괄호의 수는 세지 않는다.
  function _cartQtys(head, tail, parens) {
    var out = [], m, re, im = _CART_ITEM.exec(tail), s = im ? tail.slice(0, im.index) : tail;
    function add(n) { n = Number(n); if (out.indexOf(n) < 0) out.push(n); }
    function scan(x) { re = /(\d{1,2})\s*(?:대(?!\s*(?:기|당))|台|개(?![월동소인]))/g; while ((m = re.exec(x))) add(m[1]); }
    if ((m = /(\d{1,2})\s*(?:대|台)\s*(?:의|은|는|を|の)?\s*$/.exec(head))) add(m[1]);             // 「2대 전기카트」
    scan(s);
    parens.forEach(function (p) { if (!_CART_ITEM.test(p)) scan(p); });
    return out;
  }
  //  글 안의 전기카트 낱말마다 살핀다 → { neg: 그 카트의 부정·미확정이 있다, qty: 처음 읽힌 대수(없으면 null) }
  function _cartScan(text) {
    var t = _cartNorm(text), re = new RegExp(CART_WORD, 'ig'), m, neg = false, qty = null;
    while ((m = re.exec(t))) {
      var ks = m.index, ke = ks + m[0].length;
      var T = _cartCollect(t, ke, 80);
      //  낱말 앞(같은 줄, 마지막 끊는 자리 뒤)
      var ls = t.lastIndexOf('\n', ks - 1) + 1, ls0 = ls; if (ks - ls > 60) ls = ks - 60;
      var q = ls, hs = ls, sepAt = -1, L;
      while (q < ks) { L = _cartSepLen(t, q); if (L) { sepAt = q; q += L; hs = q; } else q++; }
      var head = t.slice(hs, ks), qs = _cartQtys(head, T.main, T.parens);
      if (qs.length > 1 || qs[0] === 0) neg = true;                                               // 「2대→1대」「0대」
      else if (qs.length === 1 && qty == null && qs[0] <= 20) qty = qs[0];
      if (neg) continue;
      if (_cartNegTail(T.main) || T.parens.some(_cartNegParen)) { neg = true; continue; }
      //  끊긴 자리 바로 뒤 조각(글머리표·빈칸은 건너뛰되 줄은 한 번만 넘는다)
      if (T.len) {
        var j = T.at + T.len, nl = t.charAt(T.at) === '\n' ? 1 : 0, c2;
        for (; j < t.length; j++) { c2 = t.charAt(j); if (c2 === '\n') { if (nl) break; nl = 1; continue; } if (!/[\s■□●○◆◇※▶▷•·ㆍ・★☆◎▪\-–—→:：=>*]/.test(c2)) break; }
        if (j < t.length && t.charAt(j) !== '\n') {
          var F = _cartCollect(t, j, 80), bare = !T.parens.length && !T.main.replace(/[\s:：\-–—=>→]/g, '') && !head.replace(_CART_LEAD, '');   // 낱말만 적힌 머리(「전기카트 / 없음」)
          if (F.main.replace(_CART_LEAD, '') ? _cartNegFrag(F.main, bare) : (F.parens.length ? _cartNegFrag(F.parens[0], bare) : false)) { neg = true; continue; }
        }
      }
      //  낱말 앞: 「취소: 전기카트」 · 같은 줄 앞 조각이 취소 머리말(「취소됨 - 전기카트」) · 윗줄이 취소 머리줄(「■취소」)
      var h = head.replace(_CART_LEAD, '');
      if (h) { if (_cartHeadNeg(h)) neg = true; continue; }
      if (sepAt > ls) { if (_cartHeadNeg(t.slice(ls, sepAt).replace(_CART_LEAD, '').trim())) neg = true; continue; }
      if (ls === ls0 && !t.slice(ls0, ks).replace(_CART_LEAD, '')) {
        var e = ls0 - 1, k, line;
        for (k = 0; k < 4 && e > 0; k++) {
          var b = t.lastIndexOf('\n', e - 1) + 1; line = t.slice(b, e).trim();
          if (!line || line.length > 60) break;
          if (_cartHeadNeg(line.replace(_CART_LEAD, ''))) { neg = true; break; }
          if (/^[■□●◆◇※▶★☆◎]/.test(line)) break;                                                // 다른 머리줄
          e = b - 1;
        }
      }
    }
    return { neg: neg, qty: neg ? null : qty };
  }
  function _cartFields(remark) {
    return (Array.isArray(remark) ? remark : [remark]).map(function (v) { return String(v == null ? '' : v); });
  }
  //  비고 표기 판정 3단계(Min 2026-08) — 메리트투어가 현지전달비고에 적어 보내는 문구가
  //  「전기카트 신청」처럼 명확할 때도 있고 「전기」 한 단어만 올 때도 있다.
  //   'sure'  = 전기/전동/EV + 카트 → 그대로 집계(단 그 카트에 「취소·불필요·신청 안 함·대기」 같은 부정·미확정 문구가 붙으면 'maybe')
  //   'maybe' = 전기·電気·EV 는 있는데 '카트'가 없다, 또는 부정 문구가 붙었다 → **재확인 필요**(집계에서 뺀다)
  //   'none'  = 언급 없음
  //  remark 는 글 하나 또는 **칸의 배열**([현지비고, 비고]) — 배열이면 칸마다 따로 판정해 합친다.
  var CART_ELEC_HINT = /전기|전동|電動|電気|\bEV\b/i;
  function cartRemarkKind(remark) {
    var fs = _cartFields(remark), sure = false, hint = false, i, t;
    for (i = 0; i < fs.length; i++) {
      t = fs[i];
      if (!t.trim()) continue;
      if (CART_ELECTRIC.test(t)) { if (_cartScan(t).neg) return 'maybe'; sure = true; }          // 한 칸이라도 그 카트의 부정이면 사람이 본다
      else if (CART_ELEC_HINT.test(t)) hint = true;
    }
    return sure ? 'sure' : (hint ? 'maybe' : 'none');
  }
  function wantsElectricCart(remark) { return cartRemarkKind(remark) === 'sure'; }
  //  pax → {code, qty}. electric=true 면 전기카트, 아니면 가솔린(2인승/4인승).
  //  code 는 cart_types.code 와 동일: 'electric' | 'gas2' | 'gas4'
  //  비고에 적힌 **신청 대수**를 읽는다(있으면 4명당 1대 추정보다 우선).
  //   실측 문구: 「■전기카드 1개 신청 / 2인용으로 사용예정」 · 「전기카트 2대 신청」
  //   전기카트가 적힌 **절** 안의 대수만 본다(「싱글룸 2개 / 전기카트 신청」의 2 는 대수가 아니다). 낱말 앞은 바로 붙은 「N대」만.
  //   대수가 둘 이상 적혔으면(바뀐 대수) 고르지 않는다 — cartRemarkKind 가 재확인으로 보낸다.
  function cartQtyFromRemark(remark) {
    var fs = _cartFields(remark), i, r;
    for (i = 0; i < fs.length; i++) {
      if (!CART_ELECTRIC.test(fs[i])) continue;
      r = _cartScan(fs[i]);
      if (r.qty != null && r.qty > 0) return r.qty;
    }
    return null;
  }

  //  전기카트 요금 무료일(Min 2026-08).
  //   인천출발 팀은 **입국일(첫날) 라운딩**이 무료, 부산출발 팀은 **귀국일(마지막날) 라운딩**이 무료.
  //   golfRows 가 입국일 행은 인천편에만·귀국일 행은 부산편에만 만들므로,
  //   「그날이 입국일이거나 귀국일이면 무료」로 두면 두 규칙을 정확히 덮는다.
  //   → 출·귀국 양쪽 날은 카트 요금을 받지 않는다.
  // ── 비고에서 「싱글룸」 요청 읽기 ────────────────────────────────────────
  //  현장 비고는 자유 문장이라 전부를 기계가 읽을 수는 없다. 실제 예약 71건을 전수로 훑어
  //  **틀리면 손해가 큰 것은 사람에게 넘기고, 확실한 것만** 자동으로 잡도록 갈랐다.
  //   all     = 「전원 싱글」·「N명 싱글」(N=인원) → 팀 전원 1인 1실. 누가 단독인지 물을 필요가 없다.
  //   names   = 이름이 적혀 있고 그 이름이 **그 팀 명단에 있다** → 누가 단독인지 확정.
  //             (이름을 문장에서 뽑는 게 아니라 **명단의 이름이 문장에 있는지** 보므로 오탐이 없다.)
  //   part    = 「3박 싱글」·「8/2-8/5 싱글」처럼 체류 일부만 → 수기.
  //   blocked = 대기·불가·만실·취소가 함께 적혀 있다 → 확정된 요청이 아니다. 자동 금지.
  //   unsure  = 「싱글룸 1개」처럼 개수만 있거나 트윈이 섞였다 → 수기.
  //  ⚠ 싱글룸은 추가요금(대부분 현지지불)이라 잘못 잡으면 방배정만이 아니라 청구가 틀어진다.
  //    애매하면 언제나 사람에게 넘긴다.
  var SG_WORD  = /싱글|single|シングル|1인실|일인실|독방|독실/i;   // 「독실」도 싱글(Min 2026-09: 앞으로 5인 팀은 독실·싱글룸·1인실 등으로 꼭 적는다)
  var SG_BLOCK = /대기|불가|어려울|어렵|만실|취소|보류/;
  //  싱글이 적힌 절 안에서만 보는 「확정이 아니다」 낱말(일본어·외래어 표기) — 글 전체에서 찾는 SG_BLOCK 과 달리 다른 항목의 취소에는 걸리지 않는다
  var SG_BLOCK2 = /캔슬|켄슬|철회|웨이팅|キャンセル|取消|取り消し|不可|満室|待ち|保留|ウェイティング/;
  var SG_MIX   = /트윈|투윈|ツイン|더블|ダブル|트리플|トリプル/;
  var SG_ALL   = /전원|전부|모두|全員/;
  //  ── 싱글 판정 공용 도우미(29차) ──
  //  전각 숫자는 반각으로 읽는다(「２방」). 탭은 빈칸으로, 길게 이어진 빈칸·빈 줄은 하나로 줄인다(고정폭으로 채운 비고에서 정규식이 멈추지 않게).
  function _sgHalf(s) {
    return String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[ \t　]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n');
  }
  //  수량이 아닌 숫자 — 가격(「1인당」「추가요금 1인 2만원」「5천엔」「15,000엔」), 나눠 쓰는 방식(「각 1실」「1방씩」「1인 1실」). 세기 전에 지운다.
  //   ⚠ 요금 낱말 없이 붙은 「1인 15000엔」「1명 15000엔」의 1 은 지우지 않는다 — 「싱글 1명 15000엔 현지지불」(한 명만 싱글)과 꼴이 같다.
  var _SG_AMT = '(?:\\d[\\d,.]{2,14}\\s?(?:엔|원|円)|\\d[\\d,.]{0,14}\\s?(?:천|만)\\s?(?:엔|원|円)?)';
  //   가격으로 보는 자리 = 요금 낱말 바로 뒤(「추가요금 1인 2만원」) 또는 괄호의 첫머리(「4명 싱글룸 희망 (1인 15000엔 현지지불)」 — 인원을 적은 뒤의 덧말).
  var _SG_FEEAMT = new RegExp('((?:요금|차지|챠지|비용|금액|가격|料金|チャージ|charge)\\s?(?:은|는|이|가|[:：])?\\s?|[(（]\\s?)\\d{1,3}\\s?(?:인|명|名|人)\\s?' + _SG_AMT, 'gi');
  var _SG_NOISE = new RegExp('\\d{1,3}\\s?(?:인|명|名|人)\\s?당(?:\\s?' + _SG_AMT + ')?|' + _SG_AMT +
    '|각자?\\s?1\\s?(?:실|방|개|룸)\\s?씩?|1\\s?(?:실|방|개|룸)\\s?씩|1\\s?인\\s?1\\s?실|1\\s?人\\s?1\\s?室', 'g');
  function _sgClean(s) { return String(s).replace(_SG_FEEAMT, '$1 ').replace(_SG_NOISE, ' ').replace(/ {2,}/g, ' '); }
  //  「싱글룸 없음·사용 안함·사용하지 않음·미사용·X」「싱글차지 없음」「no single」 — 싱글 낱말에 바로 붙은 부정은 요청이 아니다(사이에 「추가요금」 같은 다른 말이 끼면 해당 없음).
  var _SG_NEG = new RegExp('(?:싱글|シングル|single|1인실|일인실|독방|독실)(?:\\s?(?:룸|room|ルーム))?(?:\\s?(?:차지|챠지|charge|チャージ))?(?:\\s?(?:방|객실))?' +
    '(?:\\s?(?:사용|요청|신청|희망|이용|利用|使用|希望))?(?:\\s?(?:은|는|이|가|을|를|도|は|を|も))?\\s?[:：\\-(（]?\\s?' +
    '(?:없음|없습니다|없어요|없이|안\\s?함|안\\s?합니다|안\\s?씀|안\\s?씁니다|안\\s?(?:쓰|쓴|써)[가-힣]*|안\\s?됨|하지\\s?않[가-힣]*|치\\s?않[가-힣]*|불필요|필요\\s?없음?|미사용|미신청|해당\\s?(?:사항\\s?)?없음|아님|아닙니다' +
    '|なし|無し|不要|しない|しません|使いません|使わない|[xX✕✖×](?!\\s?[\\dA-Za-z]))[)）]?|\\bno\\s+(?:single|싱글|シングル)(?:\\s?room)?', 'gi');
  //  요금 얘기 — 「싱글차지 별도」는 수량·이름이 아니다
  var _SG_FEE = /(?:싱글|シングル|single)\s?(?:룸|room|ルーム)?\s?(?:차지|챠지|charge|チャージ)/gi;
  //  아직 정해지지 않았다는 말 — 전원·이름이 적혀 있어도 사람이 본다
  //   「마감·매진·솔드아웃·품절·소진」도 여기 — 방이 없다는 말일 수도, 접수를 끝냈다는 말일 수도 있어 글만으로는 정할 수 없다(설명서·규칙 문서의 「마감 문구는 보류」)
  var SG_ASK = /마감|매진|솔드\s?아웃|품절|소진|sold\s?out|締め?切り?|〆切|売り?切れ?|미정|미확정|未定|未確定|문의|가능\s?여부|여부\s?확인|가능한지|가능할지|가능할까|가능한가|가능\s?[?？]|될지|되는지|되나요|될까|확정\s?아님|확인\s?(?:요청|요망|필요|부탁|바람|바랍|중)|검토|고려|検討|確認中|可否|要確認|問い合わせ|[?？]\s*$/;
  //  부정·미확정을 뜻하는 꼴(낱말 목록에 없는 말투까지) — 싱글 낱말 뒤 같은 절에 있으면 전원·이름으로 확정하지 않는다
  var _SG_DOUBT = /않|못\s?[가-힣]|안\s?(?:함|합|해|하|할|했|씀|쓰|써|쓴|씁|됨|되|돼|정)|아직|아님|아닙|아니[라고면]|없[음이습다어]/;
  //  일부만 싱글이라는 말
  var _SG_PARTQ = /일부(?![터러])|대표자?\s?만|(?:명|인|분|名|人)\s?중(?![식간순앙복급])|[가-힣]\s?만\s?(?:싱글|1인실|일인실|독실|독방|シングル)|제외|빼고|외\s?\d{1,2}\s?(?:명|인|분)/;
  //  다른 항목 이름 — 절 안에서 이것이 나오면 그 뒤의 미정·없음은 그 항목 얘기다(「전원 싱글룸 조식 없음」「(카트 미정)」)
  var _SG_ITEM = /전기|카트|카드|조식|중식|석식|식사|특식|도시락|캐디|송영|차량|픽업|샌딩|온천|항공|air|좌석|골프|라운딩|티타임|환불|쿠폰|결제|입금|잔금|명단|여권|요금|비용|금액|수수료|체크인|체크아웃|朝食|昼食|夕食|送迎|カート|ゴルフ/i;
  //  한 줄을 절로 나눈다 — 쉼표·슬래시·세미콜론·글머리표·뒤가 빈칸인 마침표. 숫자 사이의 쉼표·마침표·슬래시(「15,000엔」「12/1」)는 끊는 자리가 아니다. 괄호 안은 그 절에 딸린 글(parens)로 따로 둔다.
  function _sgClauses(line) {
    var out = [], cur = { main: '', parens: [], sep: '' }, depth = 0, buf = '', i, c, n, p;
    function push(sepCh) { if (cur.main.trim() || cur.parens.length) out.push(cur); cur = { main: '', parens: [], sep: sepCh || '' }; }   // sep = 이 절 앞의 구분자
    for (i = 0; i < line.length; i++) {
      c = line.charAt(i); n = line.charAt(i + 1); p = line.charAt(i - 1);
      if (depth > 0) {
        if (c === ')' || c === '）') { depth--; if (depth === 0) { cur.parens.push(buf); buf = ''; cur.main += ' '; } else buf += c; }
        else { if (c === '(' || c === '（') depth++; buf += c; }
        continue;
      }
      if (c === '(' || c === '（') { depth = 1; buf = ''; continue; }
      if ((c === ',' || c === '.' || c === '/') && /\d/.test(p) && /\d/.test(n)) { cur.main += c; continue; }   // 「15,000엔」「12/1」
      if (/[\/／,，、;；■●◆※▶•·ㆍ。]/.test(c) || (c === '.' && (n === '' || /\s/.test(n)))) { push(c); continue; }
      cur.main += c;
    }
    if (depth > 0 && buf) cur.parens.push(buf);
    push();
    return out;
  }
  //  그 절에서 수량을 세는 글 = 본문 + (수량만 적힌 괄호 · 싱글 낱말이 든 괄호). 「(1인 15000엔 현지지불)」「(석식 3명)」「(2개동)」은 다른 얘기라 뺀다.
  var _SG_BAREQ = /^\s?\d{1,2}\s?(?:명|인|개|방|실|룸|분|室|名|人|部屋)\s?(?:만|씩|사용|이용|요청|희망)?\s?$/;
  function _sgCountText(cl) {
    var s = cl.main;
    cl.parens.forEach(function (p) { if (SG_WORD.test(p) || _SG_BAREQ.test(p)) s += ' ' + p + ' '; });
    return s;
  }
  //  그 절에서 「미정·부정·일부·기간」을 보는 글 = 싱글 낱말 앞(다른 항목 이름이 없을 때만) + 싱글 낱말부터 다른 항목 이름 앞까지 + 다른 항목이 아닌 괄호
  //  흔한 맺음말 — 「특이사항 없음」「변경 없음」「문의사항 없습니다」의 없음·문의는 싱글 얘기가 아니다
  var _SG_NEUTRAL_G = /(?:[가-힣]{0,4}\s?사항|변경|변동|문제|이상)\s?(?:은|는|이|가|도)?\s?없[음이습다어][가-힣]*/g;
  var _SG_PERIOD = /\d+\s?일\s?(?:차|째)?\s?(?:부터|까지)|\d+\s?泊|\d+\s?日\s?(?:から|まで)/;
  function _sgZone(cl) {
    var m = cl.main, sm = SG_WORD.exec(m), s;
    if (sm) {
      var pre = m.slice(0, sm.index), post = m.slice(sm.index), im = _SG_ITEM.exec(post.slice(sm[0].length));
      if (im) post = post.slice(0, sm[0].length + im.index);
      s = (_SG_ITEM.test(pre) ? '' : pre) + post;
    } else s = m;
    cl.parens.forEach(function (p) { if (!_SG_ITEM.test(p)) s += ' ' + p + ' '; });
    if (cl.ext) s += ' ' + cl.ext;                                                               // 쉼표로 이어진 뒤 조각(「…, 가능할까요?」「…, 3일부터」)
    return s.replace(_SG_NEUTRAL_G, ' ');
  }
  var _SG_KNUM = { '한': 1, '두': 2, '세': 3, '네': 4, '다섯': 5, '여섯': 6 };
  //  「2싱글」처럼 싱글에 바로 붙은 수의 앞 글자 — 날짜(「8/5 싱글룸」)·시각·범위의 숫자는 수량이 아니다.
  //  단 「1-1/4싱글」「1트윈/1싱글」처럼 예약 순번·다른 항목 뒤의 「/」는 구분자라 센다(실제 비고에 흔한 꼴).
  function _sgBareOk(t, at) {
    var p = t.charAt(at - 1);
    if (!p) return true;
    if (/[\d\-.:]/.test(p)) return false;
    if (p === '/') return !/(^|[^\d\-])\d{1,2}$/.test(t.slice(Math.max(0, at - 8), at - 1));
    return true;
  }
  //  「싱글룸 2」「싱글2/트윈1」 — 단위 없이 싱글 뒤에 적은 수. 뒤가 날짜·시각·층이면 수량이 아니다(「싱글룸 12/1 입국」「싱글룸 12층」).
  var _SG_BARE_AFTER = '(?:싱글|シングル|독실|독방)\\s?(?:룸|ルーム|room)?\\s?[:：]?\\s?(\\d{1,2})(?!\\s?[\\/.\\-:~]\\s?\\d)(?!\\s?[월일])(?=\\s|$|[,，、\\/)）])';
  //  절 안의 수량들 → [{n, unit}] . unit=true 는 명·인·분·개·방·실·룸·객실 이 붙은 수(전원 판정의 근거가 된다),
  //  false 는 「2싱글」·「한 명」·「싱글 1」처럼 단위가 없거나 한글로 적은 수, 그리고 일본어 단위(室·名·人·部屋 — 일본어 비고는 부정·기간 표현을 다 알지 못하므로 전원의 근거로 쓰지 않는다). 전원을 막는 데만 쓴다.
  function _sgCounts(text) {
    var s = _sgClean(text).replace(/1인실|일인실/g, ' '), out = [], m, re;
    re = /(\d{1,2})\s?(?:명|인(?![실용승조])|분|개(?![동월소])|방|실|룸|객실)/g;
    while ((m = re.exec(s))) out.push({ n: Number(m[1]), unit: true });
    re = /(\d{1,2})\s?(?:室|部屋|名|人)/g;
    while ((m = re.exec(s))) out.push({ n: Number(m[1]), unit: false });
    re = /(\d{1,2})\s?(?:싱글|シングル)/g;
    while ((m = re.exec(s))) { if (_sgBareOk(s, m.index)) out.push({ n: Number(m[1]), unit: false }); }
    re = /(?:^|[^가-힣])(한|두|세|네|다섯|여섯)\s?(?:명|분|개|방|룸|실|사람)/g;
    while ((m = re.exec(s))) out.push({ n: _SG_KNUM[m[1]], unit: false });
    re = new RegExp(_SG_BARE_AFTER, 'gi');
    while ((m = re.exec(s))) out.push({ n: Number(m[1]), unit: false });
    return out;
  }
  //  명단의 이름을 그 조각에서 찾는다 → 싱글 쪽에 적힌 사람들. block=true 면 그 조각의 이름으로는 확정하지 않는다(제외·빼고·전원·외 N명).
  //   · 「○○○팀」의 이름은 사람이 아니다 · 긴 이름 안의 짧은 이름은 세지 않는다 · 괄호 안은 이름만 적힌 괄호일 때만 본다(「(담당 ○○○)」 제외)
  //   · 조각에 트윈·더블도 적혀 있으면 이름을 가까운 방 종류에 붙인다: 조각이 방 종류로 시작하면 「종류: 이름들」, 아니면 「이름들 종류」.
  function _sgNamesIn(seg, names) {
    var list = (names || []).map(function (n) { return { ref: n, nm: String((n && n.name != null) ? n.name : n).trim() }; })
      .filter(function (x) { return x.nm.length >= 2; }).sort(function (a, b) { return b.nm.length - a.nm.length; });
    if (!list.length) return { hits: [], block: false };
    //  괄호: 이름·구분자·님/씨뿐인 괄호만 남긴다
    var s = String(seg).replace(/[(（]([^()（）]*)[)）]/g, function (all, inner) {
      var rest = inner; list.forEach(function (x) { rest = rest.split(x.nm).join(''); });
      return SG_WORD.test(inner) || !rest.replace(/사용|이용|배정|요청|희망|예정|확정|\d{1,2}\s?(?:명|인|분)|[\s,，、·.\/님씨様]/g, '') ? ' ' + inner + ' ' : ' ';
    });
    var isAll = SG_ALL.test(s), isPart = _SG_PARTQ.test(s), block = isPart || isAll;
    var taken = [], found = [];
    list.forEach(function (x) {
      var i = s.indexOf(x.nm);
      while (i >= 0) {
        var e = i + x.nm.length, over = taken.some(function (r) { return i < r[1] && e > r[0]; });
        if (!over && s.charAt(e) !== '팀') { taken.push([i, e]); found.push({ ref: x.ref, pos: i }); }
        i = s.indexOf(x.nm, e);
      }
    });
    if (!found.length) return { hits: [], block: block };
    //  같은 이름이 명단에 둘 이상이면 누구인지 정할 수 없다 — 이름으로 확정하지 않는다(사람이 본다)
    if (found.some(function (f) { var nm = String((f.ref && f.ref.name != null) ? f.ref.name : f.ref).trim(); return list.filter(function (x) { return x.nm === nm; }).length > 1; })) return { hits: [], block: true };
    var types = [], m, re = /싱글|single|シングル|1인실|일인실|독방|독실|트윈|투윈|ツイン|더블|ダブル|트리플|トリプル/gi;
    while ((m = re.exec(s))) types.push({ pos: m.index, sg: SG_WORD.test(m[0]) });
    var hits = [];
    if (!types.some(function (t) { return !t.sg; })) hits = found;                                // 방 종류가 싱글뿐 — 조각의 이름 전부
    else {
      var lead = s.replace(/^[\s■●◆※▶•·ㆍ\-–:：]+/, ''), typeFirst = /^(?:싱글|single|シングル|1인실|일인실|독방|독실|트윈|투윈|ツイン|더블|ダブル|트리플|トリプル)/i.test(lead);
      found.forEach(function (f) {
        var own = null;
        if (typeFirst) types.forEach(function (t) { if (t.pos < f.pos) own = t; });
        else for (var k = 0; k < types.length; k++) { if (types[k].pos > f.pos) { own = types[k]; break; } }
        if (own && own.sg) hits.push(f);
      });
    }
    var out = [];
    (names || []).forEach(function (n) { if (out.indexOf(n) < 0 && hits.some(function (f) { return f.ref === n; })) out.push(n); });   // 명단 순서(종전과 같다)
    return { hits: out, block: block, all: isAll && !isPart };
  }
  //  → {kind, why?, names?, n?, mixed?}
  //   blocked 의 why: 'none' = 싱글 요청이 없다고 적혔다(「싱글룸 없음」) · 'block' = 대기·불가·취소 — 둘 다 평소대로 짝을 짓는다
  //   unsure  의 why: 'ask' = 미정·문의·부정 꼴 · 'partial' = 일부·N명 중·제외 · 'who' = 수량만 있거나 누구인지 모른다
  function singlePlan(text, pax, names) {
    var t = _sgHalf(text), n0 = Number(pax) || 0;
    if (!SG_WORD.test(t)) return null;
    if (SG_BLOCK.test(t)) return { kind: 'blocked', why: 'block' };
    //  「싱글룸 없음·사용 안함」을 뺀 나머지에 싱글 얘기가 없으면 요청이 아니다(대기·취소와 같은 취급 — 평소대로 짝을 짓는다)
    t = t.replace(_SG_NEG, ' ');
    if (!SG_WORD.test(t)) return { kind: 'blocked', why: 'none' };
    //  싱글 얘기가 들어 있는 줄만 본다. 단 현장은 「싱글 룸」 머리줄 아래에 이름만 죽 적기도 하므로
    //  머리줄이 나오면 다른 룸타입 머리줄(트윈룸 등)이 나올 때까지 이어지는 줄도 함께 본다.
    var SG_HEAD = /^(싱글|1인실|일인실|독방|독실|シングル|single)\s?(룸|room|ルーム)?\s?[:：]?$/i;
    var MIX_HEAD = /^(트윈|더블|트리플|ツイン|ダブル|トリプル|twin|double|triple)\s?(룸|room|ルーム)?\s?[:：]?$/i;
    var sgTxt = '', inSg = false, sgCl = [], segs = [], headLines = [];        // sgCl = 싱글 낱말이 든 절들(수량·전원 판정은 여기서만) · segs = 이름을 찾는 조각(「/」·글머리표로 끊은 것)
    t.split('\n').forEach(function (raw) {
      var l = raw.trim();
      if (!l) return;
      if (MIX_HEAD.test(l)) { inSg = false; return; }
      if (SG_HEAD.test(l)) { inSg = true; return; }
      if (inSg || SG_WORD.test(l)) sgTxt += l + ' ';
      if (SG_WORD.test(l)) {
        var lastSg = null;
        _sgClauses(l).forEach(function (cl) {
          if (SG_WORD.test(cl.main) || cl.parens.some(function (p) { return SG_WORD.test(p); })) { sgCl.push(cl); lastSg = cl; return; }
          //  쉼표로 이어진 뒤 조각 — 다른 항목·다른 방 종류가 적혀 있지 않으면 앞 싱글 절에 딸린 말이다(「…, 가능할까요?」「…, 3일부터」「싱글룸: A, B 문의」)
          if (lastSg && /[,，、]/.test(cl.sep) && !_SG_ITEM.test(cl.main) && !SG_MIX.test(cl.main)) {
            var fr = cl.main + ' ' + cl.parens.filter(function (p) { return !_SG_ITEM.test(p); }).join(' ');
            //  기간 말고 다른 글이 함께 있으면(「15일까지 회신 부탁」) 그 기간은 체류 얘기가 아니다
            if (_SG_PERIOD.test(fr) && fr.replace(new RegExp(_SG_PERIOD.source, 'g'), '').replace(/[\s~\-〜.만사용이용のみ]/g, '')) fr = fr.replace(new RegExp(_SG_PERIOD.source, 'g'), ' ');
            lastSg.ext = (lastSg.ext || '') + ' ' + fr;
            return;
          }
          lastSg = null;
        });
        var parts = l.split(/[\/／■●◆※▶•]/), pi;
        for (pi = 0; pi < parts.length; pi++) {
          if (!SG_WORD.test(parts[pi])) continue;
          //  「싱글룸 사용자 / 이름들」 — 머리말뿐인 조각은 다음 조각(이름 목록)과 잇는다
          if (pi + 1 < parts.length && /^\s?(?:싱글|1인실|일인실|독방|독실|シングル|single)\s?(?:룸|room|ルーム)?\s?(?:사용자|사용|자|使用者)?\s?[:：]?\s?$/i.test(parts[pi]) && !SG_WORD.test(parts[pi + 1])) { segs.push(parts[pi] + ' ' + parts[pi + 1]); pi++; }
          else segs.push(parts[pi]);
        }
      } else if (inSg) headLines.push(l);
    });
    sgTxt = sgTxt.trim();
    var zones = sgCl.map(_sgZone);
    if (/\d+\s?박/.test(sgTxt) || /\d+\s?\/\s?\d+\s?[-~〜]\s?\d+\s?\/\s?\d+/.test(sgTxt)) return { kind: 'part' };              // 「2박만」「11/3~11/5」 = 체류 일부만 싱글
    if (zones.some(function (z) { return /\d+\s?일\s?(?:차|째)?\s?(?:부터|까지)|\d+\s?泊|\d+\s?日\s?(?:から|まで)/.test(z); })) return { kind: 'part' };   // 「3일부터」「2泊」 — 싱글 절 안에서만(다른 절의 「잔금 15일까지」는 아니다)
    var mixed = SG_MIX.test(t);
    if (zones.some(function (z) { return SG_BLOCK2.test(z); })) return { kind: 'blocked', why: 'block' };                      // 「싱글룸 4개 캔슬」「シングル4室 キャンセル」
    //  「미정·문의·가능 여부 확인 요청」·부정 꼴 — 싱글 절(다른 항목이 아닌 괄호 포함)에 붙어 있으면 이름·전원이 적혀 있어도 사람이 본다
    if (zones.some(function (z, i) { var sm = SG_WORD.exec(z); return SG_ASK.test(z) || (sm && _SG_DOUBT.test(z.slice(sm.index))); })) return { kind: 'unsure', why: 'ask', mixed: mixed };
    // 명단 대조 — 후보(그 팀 사람)를 싱글이 적힌 조각에서 찾는다
    var hit = [], nameBlock = false, allNames = 0;
    segs.forEach(function (sg) { var r = _sgNamesIn(sg, names); if (r.block) { if (r.hits.length) { nameBlock = true; if (r.all) allNames = Math.max(allNames, r.hits.length); } return; } r.hits.forEach(function (n) { if (hit.indexOf(n) < 0) hit.push(n); }); });
    headLines.forEach(function (l) { _sgNamesIn(l, names).hits.forEach(function (n) { if (hit.indexOf(n) < 0) hit.push(n); }); });
    if (hit.length) return { kind: 'names', names: hit, mixed: mixed };
    var n = n0, partial = nameBlock && zones.some(function (z) { return _SG_PARTQ.test(z); });
    //  「전원 싱글룸: A, B」(4명 팀) — 전원이라면서 같은 조각에 적힌 이름 수가 인원과 다르다. 누구까지인지 사람이 본다.
    if (allNames > 0 && n > 0 && allNames !== n) return { kind: 'unsure', why: 'who', mixed: mixed };
    if (!mixed && n > 0) {
      //  싱글이 적힌 **절** 안의 수량이 모두 팀 인원과 같을 때만 전원이다 — 「4명 중 1명 싱글」「8명 싱글 2방」「4명 싱글 1룸」을
      //  전원으로 읽으면 팀 전체가 1인 1실로 배정된다. 하나라도 다르거나 「일부·대표자만·N명 중」이 붙으면 사람에게 넘긴다.
      //  같은 줄의 다른 항목(「/ 전기카트 1개」「, 골프 3인」)·가격(「1인 15000엔」)·「1인실」「1인 1실」의 숫자는 수량이 아니다.
      var cnts = [], allWord = false;
      sgCl.forEach(function (cl, i) {
        var ct = _sgCountText(cl);
        cnts = cnts.concat(_sgCounts(ct));
        if (_SG_PARTQ.test(ct) || _SG_PARTQ.test(zones[i])) partial = true;
        if (SG_ALL.test(ct)) allWord = true;
      });
      //  「전원」이 적혀 있으면 인원보다 **큰** 수는 여러 예약을 묶은 팀 전체 인원이다(「팀:A+B / 4명 전원싱글룸」, 이 예약은 3명) — 작은 수만 모순으로 본다.
      if (!partial && allWord && cnts.every(function (c) { return c.n >= n; })) return { kind: 'all', n: n };                     // 「전원 싱글」
      if (!partial && cnts.length && cnts.every(function (c) { return c.n === n; }) && cnts.some(function (c) { return c.unit; })) return { kind: 'all', n: n };   // 「4명 싱글룸희망」·「싱글룸 4개」
    } else if (zones.some(function (z) { return _SG_PARTQ.test(z); })) partial = true;
    return { kind: 'unsure', why: partial ? 'partial' : 'who', mixed: mixed };
  }

  //  「싱글 4방」 — 방 수만 뽑는다. 누가 쓸지는 현장에서 정해도 **몇 방인지는 계약된 수량**이라
  //  그것만은 미리 알 수 있다(Min 2026-08). pax 와 같은지는 따지지 않는다(singlePlan 과 다른 점).
  //   「싱글룸 4개」·「싱글 4실」·「싱글 4방」·「シングル4室」·「싱글룸 4명」 → 4
  //  ⚠ 「대기·불가·보류」가 섞여 있어도 **수량은 낸다**(Min 2026-08) — 확정이 아니어도
  //    몇 방이 필요한 요청인지는 알아야 준비가 된다. 확정 여부는 singleTentative() 로 따로.
  var _SG_MIXW = '(?:트윈|투윈|더블|트리플|ツイン|ダブル|トリプル)';
  function singleCount(text) {
    var t = _sgHalf(text);
    if (!SG_WORD.test(t)) return 0;
    t = t.replace(_SG_NEG, ' ');                       // 「싱글 없음」은 수요가 아니다(다른 줄에 요청이 있으면 그 수)
    if (!SG_WORD.test(t)) return 0;
    var so = t.match(/1\s?인\s?1\s?실\s?[,:：]?\s?(\d{1,2})\s?(?:방|실|룸|개)/);   // 「1인 1실 2방 (싱글차지 지불 완료)」 — 그 방 수가 곧 싱글 수
    t = _sgClean(t);                                   // 가격(「1인 5000엔」)·「1인 1실」·「각 1실」의 숫자는 수량이 아니다
    t = t.replace(/[(（]\s?(\d{1,2}\s?(?:명|인|개|방|실|룸|분|室|名|人|部屋)\s?(?:만|씩|사용|이용|요청|희망)?)\s?[)）]/g, ' $1 ');   // 「싱글룸(2개)」「싱글(2명)」 — 수량만 적힌 괄호는 풀어서 읽는다
    var best = 0, m, n;
    if (so && Number(so[1]) > 0 && Number(so[1]) <= 30) best = Number(so[1]);
    //  싱글이라는 말과 숫자가 **가까이**(6자 안, 같은 절 — 쉼표·슬래시·괄호를 넘지 않는다) 있을 때만 센다. 사이에 트윈이 끼었거나(「싱글, 트윈 2방」)
    //  그 수가 조사를 사이에 두고 트윈으로 이어지면(「싱글 3명은 트윈으로」) 세지 않는다. 싱글에 바로 붙은 수는 뒤에 트윈이 와도 싱글의 수다(「싱글 1방 트윈 2방」).
    var re = /(싱글|1인실|일인실|독방|독실|シングル|single)([^0-9\n,，、\/／;；()（）]{0,6})(\d{1,2})\s?(개|방|실|룸|객실|명|인|분|室|部屋|名|人)(?!\s?실)/gi;
    while ((m = re.exec(t))) {
      if (SG_MIX.test(m[2])) continue;
      if (new RegExp('^\\s?(?:은|는|이|가)\\s?' + _SG_MIXW).test(t.slice(re.lastIndex, re.lastIndex + 8))) continue;
      n = Number(m[3]); if (n > 0 && n <= 30 && n > best) best = n;
    }
    var rek = /(?:싱글|1인실|일인실|독방|독실)\s?(?:룸)?[^0-9\n가-힣]{0,4}(한|두|세|네|다섯|여섯)\s?(?:개|방|실|룸|명|분)/g;      // 「싱글룸 한개」·「싱글 두개」
    while ((m = rek.exec(t))) { n = _SG_KNUM[m[1]]; if (n > best) best = n; }
    if (best) return best;
    //  숫자가 앞에 오는 표기 — 「4방 싱글」·「4名 シングル」·「2방(싱글)」·「2명, 싱글룸 사용」
    //   · 숫자 **바로 앞**이 트윈·더블·트리플이면 그 방의 수다(「트윈 2방 싱글룸 희망」) — 단 그 트윈이 제 수를 따로 갖고 있으면 센다(「2명 트윈 2명 싱글」).
    //   · 구분자 너머의 요금 얘기는 세지 않는다(「성인 2명, 싱글차지 별도」). 사이에 트윈이 끼어도 세지 않는다(「2방 트윈, 싱글 희망」).
    var re2 = /(\d{1,2})\s?(개|방|실|룸|객실|명|인|분|室|部屋|名|人)(?!\s?실)([^0-9\n]{0,6}?)(싱글|1인실|일인실|독방|독실|シングル|single)(\s?(?:룸|room|ルーム)?\s?(?:차지|챠지|charge|チャージ))?/gi;
    while ((m = re2.exec(t))) {
      if (SG_MIX.test(m[3])) continue;
      if (m[5] && /[\/／,，、()（）]/.test(m[3])) continue;
      var before = t.slice(t.lastIndexOf('\n', m.index) + 1, m.index);
      if (m[5] && SG_MIX.test(before)) continue;                                        // 「성인 4명 트윈 2방 싱글차지 별도」 — 요금 얘기 앞의 수는 트윈 것일 수 있다(0 이면 화면이 비고 확인을 시킨다)
      var mb = before.match(new RegExp(_SG_MIXW + '\\s?(?:룸|ルーム)?\\s?[:：]?\\s?$'));
      if (mb && !/\d{1,2}\s?(?:개|방|실|룸|객실|명|인|室|部屋|名|人)\s?(?:은|는|이|가)?\s?$/.test(before.slice(0, mb.index))) continue;
      n = Number(m[1]); if (n > 0 && n <= 30 && n > best) best = n;
    }
    var rek2 = /(?:^|[^가-힣])(한|두|세|네|다섯|여섯)\s?(?:개|방|실|룸|명|분)[^0-9\n]{0,6}?(?:싱글|1인실|일인실|독방|독실)/g;                  // 「4명 중 한 명 싱글」
    while ((m = rek2.exec(t))) { n = _SG_KNUM[m[1]]; if (n > best) best = n; }
    if (best) return best;
    //  「2싱글 + 1트윈」·「1싱글 사용」·「1-1/4싱글」·「2트윈 1싱글」 — 숫자가 싱글에 바로 붙은 꼴(날짜 「8/5 싱글룸」의 5, 「트윈1 싱글1」의 앞 1 은 아니다)
    var MIX_END = new RegExp(_SG_MIXW + '\\s?(?:룸|ルーム)?\\s?[:：]?\\s?$');
    var re3 = /(\d{1,2})(\s?)(?:싱글|シングル)/g, bf;
    while ((m = re3.exec(t))) {
      bf = t.slice(0, m.index);
      if (!_sgBareOk(t, m.index) || (MIX_END.test(bf) && !(m[2] === '' && /\s$/.test(bf)))) continue;
      n = Number(m[1]); if (n > 0 && n <= 30 && n > best) best = n;
    }
    if (best) return best;
    //  「싱글1」·「싱글룸 2」 — 단위 없이 싱글 바로 뒤에 적은 수(뒤가 빈칸·구분자·끝일 때만 — 「싱글룸 12층」「싱글룸 12/1 입국」의 12 는 아니다)
    var re4 = new RegExp(_SG_BARE_AFTER, 'gi');
    while ((m = re4.exec(t))) { n = Number(m[1]); if (n > 0 && n <= 30 && n > best) best = n; }
    return best;
  }
  //  「싱글룸 현지에서 배정예정」 — 수량은 정해졌고 **누가 쓸지만** 현장에서 정하는 경우.
  //  자동배정이 손대면 안 되고, 당일 아침에 사람이 채워야 한다.
  //  아직 확정이 아닌 요청 — 그 낱말을 그대로 돌려준다(화면에 이유를 보여주려고).
  function singleTentative(text) {
    var t = String(text == null ? '' : text);
    if (!SG_WORD.test(t)) return '';
    var m = t.match(SG_BLOCK);
    return m ? m[0] : '';
  }
  var SG_ONSITE = /(현지|현장)\s*(에서)?\s*(배정|지정|결정)|(배정|지정|결정)\s*예정|現地\s*で\s*(割|決)/;
  function singleOnsite(text) {
    var t = String(text == null ? '' : text);
    return SG_WORD.test(t) && SG_ONSITE.test(t);
  }
  //  「싱글 신청 수」 — 객실 여유 현황 「싱글 신청」 줄용. singleCount(숫자 표기)로 못 읽는 비고까지 센다(Min 2026-09).
  //   실측(9~11월 75팀): 숫자 표기 36팀뿐, 「전원 싱글룸」 24팀·이름 나열 5팀·그 외 10팀은 0으로 빠져 있었다.
  //   ① 숫자   「싱글 4방」·「2인 싱글룸」·「2싱글」·「싱글룸 1룸」 → 그 수
  //   ② 전원   「전원 싱글룸」·「○○○팀 전원 싱글룸」 → 팀 인원(pax). 방배정 판정(singlePlan)이 전원이면 적힌 다른 수보다 인원이 먼저다(두 화면이 같은 수를 말하게).
  //   ③ 이름   「싱글룸: 김OO, 이OO」·「싱글자: 김OO」·「김OO, 이OO님 싱글룸 사용」·「싱글룸 김OO」·
  //            「싱글 룸」 머리줄 아래 한 줄에 한 명씩 → 이름 수(2~4자 한글, 흔한 낱말(요청·사용…)은 제외)
  //   ④ 못 읽음 싱글 말은 있는데 수량이 없음(「싱글룸 :」·「싱글룸 요청」) → n=0, how='none' (화면은 「?」 비고 확인)
  //   ⑤ 홀수   싱글·트리플 언급이 없는데 인원이 홀수(5명 팀 등) → 남는 한 명 = 싱글 1방(how='odd', Min 2026-09).
  //            실측 9~11월 홀수 팀 58팀 중 29팀은 비고가 없어 싱글 수요에서 빠져 있었다. 트리플 언급이 있으면 세지 않는다.
  //            「싱글 없음」이라고 적힌 홀수 팀도 같다 — 방배정이 남는 한 명을 싱글 객실에 넣기 때문이다.
  //  → {n, how:'num'|'all'|'names'|'none'|'odd'|''}  ('' = 싱글 수요 없음)
  //  ⚠ 어림 규칙이다 — 툴팁에 팀별 수를 같이 내어 사람이 대조할 수 있게 한다.
  var SG_STOP = /(요청|사용|희망|배정|신청|확인|현지|비용|추가|가능|불가|대기|보류|필요|예정|변경|지불|결제|안내|부탁|드립|입니|사전|좌석|호텔|리조트|트윈|더블|골프|숙박|쿠폰|카트|팀장|회원|객실|위탁|블럭|블록|전원|전부|모두|별도|개별|발권|진행|후|및)/;
  //  낱말 **전체**가 이것일 때만 이름이 아니다 — 부분 일치로 두면 「차지○」 같은 이름이 빠진다.
  var SG_STOPW = /^(?:차지|싱글차지|요금|금액|없음|있음|아님|포함|불포함|상품|성인|소아|유아|부부|가족|일행|본인|인원|총원|남자|여자|남성|여성|조식|중식|석식|입국|귀국|체크인|입금완료|취소|캔슬|켄슬|철회|웨이팅|만실|마감|미정|미확정|문의|확정|완료|검토|불필요)$/;   // 끝의 열넷 = 상태를 말하는 낱말(「싱글룸 취소」의 취소는 사람이 아니다)
  var SG_HEAD2 = /^(싱글|1인실|일인실|독방|독실|シングル|single)\s?(룸|room|ルーム)?\s?(사용자|자)?\s?[:：]?$/i;
  var MIX_HEAD2 = /^(트윈|더블|트리플|ツイン|ダブル|トリプル|twin|double|triple)\s?(룸|room|ルーム)?\s?[:：]?$/i;
  function _sgNames(seg) {
    var s = String(seg || '').replace(/\([^)]*\)/g, ' ').replace(/（[^）]*）/g, ' ');
    var out = 0;
    s.split(/[,，、·\/\s]+/).forEach(function (tok) {
      tok = tok.replace(/(님|씨|様)$/, '');
      if (/^[가-힣]{2,4}$/.test(tok) && !SG_STOP.test(tok) && !SG_STOPW.test(tok) && !/팀$/.test(tok)) out++;
    });
    return out;
  }
  //  트리플은 현장이 비고에 꼭 적는다(Min): 「트리플」·「3인 1실」·「3인실」·「3명 1실」·「3人1室」
  var SG_TRIPLE = /트리플|トリプル|triple|3\s*(인|명|人)\s*(1\s*)?(실|室|룸|방)/i;
  function singleRequested(text, pax) {
    var t = _sgHalf(text), px = Number(pax) || 0;
    var oddOne = (px > 0 && px % 2 === 1 && !SG_TRIPLE.test(t)) ? { n: 1, how: 'odd' } : null;
    if (!SG_WORD.test(t)) return oddOne || { n: 0, how: '' };
    t = t.replace(_SG_NEG, ' ');
    if (!SG_WORD.test(t)) return oddOne || { n: 0, how: '' };                          // 「싱글 없음」 = 싱글 얘기가 없는 것과 같다(홀수 팀의 남는 한 명만)
    var n = singleCount(t);                                                            // 「싱글 4방」·「2싱글」·「싱글룸 1룸」
    var pl = px > 0 ? singlePlan(t, px, []) : null, isAll = !!(pl && pl.kind === 'all');
    if (n > 0 && !(isAll && n !== px)) return { n: n, how: 'num' };
    if (isAll) return { n: px, how: 'all' };                                           // 방배정이 전원으로 읽는 글 — 다른 절의 수(「(석식 3명)」)가 아니라 인원
    if (/(전원|전부|모두|全員)\s?[가-힣]{0,3}\s?(싱글|シングル|1인실|일인실|독방|독실)/.test(t) || /(싱글|シングル)[^\n]{0,6}(전원|전부|모두|全員)/.test(t)) {
      return px > 0 ? { n: px, how: 'all' } : { n: 0, how: 'none' };
    }
    var best = 0, inSg = false, block = 0, feeOnly = true;
    t.split('\n').forEach(function (raw) {
      var line = raw.trim();
      if (inSg) {                                   // 「싱글 룸」 머리줄 아래 이름 줄들
        var c0 = line ? _sgNames(line) : 0;
        if (!line || MIX_HEAD2.test(line) || !c0) { inSg = false; if (block > best) best = block; block = 0; }
        else { block += c0; return; }
      }
      if (SG_HEAD2.test(line)) { inSg = true; block = 0; feeOnly = false; return; }
      if (!SG_WORD.test(line)) return;
      if (!SG_WORD.test(line.replace(_SG_FEE, ' '))) {                                 // 「싱글차지 별도」뿐인 줄 — 요금 얘기다
        //  같은 조각(마지막 「/」 뒤) 앞쪽에 이름이 적혀 있으면 그 사람들의 싱글이다(「홍길동, 가나다 싱글차지 현지지불」). 앞 조각의 호텔 이름 등은 세지 않는다.
        _SG_FEE.lastIndex = 0; var fm = _SG_FEE.exec(line); _SG_FEE.lastIndex = 0;
        var head = fm ? line.slice(0, fm.index) : ''; head = head.slice(Math.max(head.lastIndexOf('/'), head.lastIndexOf('／')) + 1);
        var cf = _sgNames(head);
        if (cf > 0) { feeOnly = false; if (cf > best) best = cf; }
        return;
      }
      feeOnly = false;
      var i = line.search(SG_WORD);
      var after = line.slice(i).replace(/^(싱글|シングル|1인실|일인실|독방|독실|single)\s?(룸|room|ルーム)?\s?(사용자|자|使用者)?\s?[:：\/]?\s?/i, '');
      var c = Math.max(_sgNames(after), _sgNames(line.slice(0, i)));
      if (c > best) best = c;
    });
    if (block > best) best = block;
    if (best > 0) return { n: best, how: 'names' };
    //  요금 얘기(「싱글차지 현지결제」)뿐이고 수량이 없다 — 홀수 팀이면 남는 한 명의 싱글(홀수 규칙), 짝수 팀이면 「?」(비고 확인)
    if (feeOnly && oddOne) return oddOne;
    if (px === 1) return { n: 1, how: 'odd' };                                         // 혼자 온 손님 — 비고를 어떻게 적었든 방 하나
    return { n: 0, how: 'none' };
  }

  function cartFreeDay(team, date) {
    var d = String(date == null ? '' : date).slice(0, 10);
    if (!team || !d) return false;
    return d === String(team.dep || '').slice(0, 10) || d === String(team.arr || '').slice(0, 10);
  }

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

  // ── 요일별 기본 석식(야마나미 레스토랑) — 夕食オーダー(dinner.html)·안내 모니터(signage.html) 공용 ──
  //  getDay: 0=日 … 6=土. 메뉴가 바뀌면 여기 한 곳만 고친다.
  var BASE_DINNER = ['海鮮鍋', '日本産豚バラ焼', 'メウンタン(辛魚鍋)', '牛プルコギコース', '海鮮スンドゥブチゲ', '日本産豚バラ焼', '黒豚しゃぶしゃぶ'];   // 月·金 「国産」→「日本産」(Min 2026-10-26 — 한국 손님에게 「국산」은 뜻이 뒤집힌다)
  // 같은 표의 한국어(손님 화면 — Min 2026-10-26 「석식 메뉴 한국어도 같이, 한국어를 크게」). 인쇄물(주방 제출)은 일본어 그대로.
  var BASE_DINNER_KO = ['해물전골', '일본산 삼겹살 구이', '매운탕', '소불고기 코스', '해물 순두부찌개', '일본산 삼겹살 구이', '흑돼지 샤브샤브'];
  function baseDinner(date) {
    var d = parseLocalDate(date);
    if (!d || isNaN(d)) return '';
    return BASE_DINNER[d.getDay()] || '';
  }
  function baseDinnerKo(date) {
    var d = parseLocalDate(date);
    if (!d || isNaN(d)) return '';
    return BASE_DINNER_KO[d.getDay()] || '';
  }

  // ── 접근 권한 트리(세부 영역) — admin.html·페이지 가드·랜딩 게이트·SQL area_tree(138) 의 단일 진실원 ──
  //  부모 = 기존 DB 영역 키(RLS 정책이 쓰는 그룹) · 자식 = 카드(화면) 단위 키.
  //  판정: 자식 키를 가지면 그 화면만, 부모 키를 가지면 그 그룹 전 화면. 자식 하나라도 가지면 DB 쓰기는 그룹(부모) 수준으로 열린다
  //  (RLS 정책은 그룹 키로 검사하므로 — 세부 구분은 화면·카드 단위, DB 보호는 그룹 단위. ⚠ 돈이 걸린 RPC 는 자식 키를 직접 검사한다).
  var AREA_TREE = {
    print:   ['nametag', 'keyslip', 'aircover', 'dispatch', 'dinner', 'qrcards', 'transfer', 'notice'],
    //  안내 모니터(signage)는 트리 밖 단일 키(SQL 150, Min 2026-10-26): 카드가 「안내 모니터 관리」 1장뿐이라 자식이 없다(board 와 같음).
    //  140 의 sign_lobby·sign_course·sign_dinner·sign_office 4자식은 폐지(계정은 부모 signage 로 승계). 모니터별 화면은 signage_monitors 표.
    front:   ['frontdesk', 'inv_front'],
    room:    ['room_assign', 'occupancy', 'staychart', 'roomstats', 'inv_room'],   // staychart=월간 숙박 현황표(SQL 153, Min 2026-10-27: 권한 관리 자기 체크표)
    hk:      ['housekeeping', 'inv_hk'],
    golf:    ['course', 'cart', 'inv_golf'],
    kitchen: ['kds', 'kds_front', 'inv_fnb'],
    pos:     ['pos_front', 'pos_golf', 'pos_restaurant', 'pos_customer'],
    settle:  ['settle_onsite', 'settle_merit', 'settle_report'],   // settle_report=정산 보고서(일보·주보·월보·연보 + 일 마감, SQL 156, Min 2026-10-27)
    stats:   ['stats_mgmt', 'staycal'],
    shizu:   ['shizu_sheet', 'inv_shizu'],
    partner: ['partner_kumamoto', 'partner_trial']   // 자회사 상품(SQL 159, Min 2026-10-30): 상품별로 담당자를 따로 지정 — 카드·페이지 노출 + partner_* 표 RLS 읽기
  };
  var AREA_PARENT = {};
  Object.keys(AREA_TREE).forEach(function (p) { AREA_TREE[p].forEach(function (c) { AREA_PARENT[c] = p; }); });
  //  보유 키 목록 → 부모(그룹 전체)면 자식 전부, 자식이면 부모도 포함한 실효 키 목록
  function areaExpand(keys) {
    var out = {}; (keys || []).forEach(function (k) { if (k) out[k] = 1; });
    (keys || []).forEach(function (k) {
      if (AREA_TREE[k]) AREA_TREE[k].forEach(function (c) { out[c] = 1; });
      if (AREA_PARENT[k]) out[AREA_PARENT[k]] = 1;
    });
    return Object.keys(out);
  }
  //  acc={role,areas,read_areas} · keys=[…](하나라도 맞으면 통과) → 'write' | 'read' | null
  function areaAllowed(acc, keys) {
    if (!acc) return null;
    if (acc.role === 'admin') return 'write';
    var ks = Array.isArray(keys) ? keys : String(keys || '').split(/[\s,]+/).filter(Boolean);
    if (!ks.length) return null;
    var w = areaExpand(acc.areas || []);
    if (ks.some(function (k) { return w.indexOf(k) >= 0; })) return 'write';
    var r = areaExpand((acc.areas || []).concat(acc.read_areas || []));
    if (ks.some(function (k) { return r.indexOf(k) >= 0; })) return 'read';
    return null;
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
    k:['カ','キ','ク','ケ','コ'], n:['ナ','ニ','ヌ','ネ','ノ'], t:['タ','ティ','トゥ','テ','ト'],   // 디·티=ティ, 두·투=トゥ(チ·ツ 는 다른 소리)
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
      else if (jv[0] === 1) syl = (row === '') ? _YV[jv[1]] : (row === 't' ? 'テ' : base[1]) + _Y[jv[1]];   // 튜·듀 = テュ(ティュ 아님)
      else syl = (row === '') ? _WV[jv[1]] : ((row === 'j' || row === 'ch') && jv[1] === 'e') ? base[3] : base[2] + _W[jv[1]];   // 최·죄·쵀 = チェ·ジェ(チュェ 아님)
      out += syl + _JONG[jong];
    }
    return out;
  }
  //  명단에서 대표 줄 고르기 — 예약의 대표고객(rep_name)과 이름(띄어쓰기 무시)이 같은 줄 가운데 첫 줄, 없으면 첫 줄(0).
  //  데이터 등록(명단·묶음 대표·자회사 명단)·통보 명단이 같은 규칙을 쓴다. rows = [{name_kr}] 또는 이름 문자열 배열.
  function repIndex(rows, repName) {
    var rn = String(repName == null ? '' : repName).replace(/\s+/g, '');
    if (!rn || !rows || !rows.length) return 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], nm = (r && typeof r === 'object') ? (r.name_kr != null ? r.name_kr : r.name) : r;
      if (String(nm == null ? '' : nm).replace(/\s+/g, '') === rn) return i;
    }
    return 0;
  }
  //  묶음 이름(print_overrides.team_group)의 표시 — 「태그#대표행사번호」의 끝 #번호는 다른 시기의 같은 코드와 겹치지 않게 하는 키라 화면에는 보이지 않는다.
  function teamGroupLabel(g) { return String(g == null ? '' : g).replace(/#\d+$/, ''); }
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
  //   (예: 남궁병욱 NAMGUNG BYONG UK → ナムグン・ビョン・ウク. 한글기반 ピョン이 아니라 영문 유성음 b→ビョン)
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
    ['woo','',2],   // WOO = 우(ウ) — 없으면 wo(ウォ)+o(オ)로 쪼개져 ウォオ 가 된다
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
      if (glide === 'y') { var yc = ({0:'a',1:'i',2:'u',3:'e',4:'o'})[idx], ys = _Y[yc] || ''; return onset === '' ? (_YV[yc] || base[idx]) : (((ys && onset === 't') ? 'テ' : (ys && onset === 'd') ? 'デ' : base[1]) + ys); }
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
        var wooNext = s.substr(after, 3) === 'woo';   // 「GILWOO·MINWOO」 — 자음 + woo 는 w 활음 음절이 아니라 앞 음절의 받침 + 우(ウ)
        //  「JINWON·GILWON·SAMWON」 — 받침 n·l·m 뒤의 w 도 다음 음절(원·완)의 첫소리다(놔·눠·뤄·뭐 는 이름에 없다). 첫소리 kw·gw·hw(권·관·황)는 그대로.
        var codaW = adv === 1 && i > 0 && (c === 'n' || c === 'l' || c === 'm') && s.charAt(after) === 'w';
        if (after < N && isNuc(s.charAt(after)) && !wooNext && !codaW) {
          var v = matchVowel(after);
          if (v) { var ok = (_EN_ROW[onsetKey] !== undefined) ? onsetKey : ''; out += compose(ok, v.glide, v.idx); i = v.next; continue; }
        }
        if (c === 'n' && s.charAt(i + 1) === 'g' && (!isNuc(s.charAt(i + 2)) || s.substr(i + 2, 3) === 'woo' || (s.charAt(i + 2) === 'w' && s.charAt(i - 1) !== 'i'))) { out += 'ン'; i += 2; continue; }   // 종성 ng(「DONGWOOK·DONGWON」의 ng 도 — 단 「MINGWAN」(민관)처럼 i 뒤는 n + gw)
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

  // ── 공항 코드(IATA) ── 송영표·인쇄물은 「인천 → 구마모토」 대신 **ICN-KMJ** 로 짧게 쓴다.
  //   엠클릭은 한글 지명으로 내려온다(인천·김해·청주 / 구마모토·후쿠오카).
  var AIRPORT = {
    '인천': 'ICN', '서울': 'ICN', '김해': 'PUS', '부산': 'PUS', '청주': 'CJJ', '대구': 'TAE', '제주': 'CJU',
    '구마모토': 'KMJ', '후쿠오카': 'FUK', '나리타': 'NRT', '하네다': 'HND', '오사카': 'KIX', '간사이': 'KIX'
  };
  function airportCode(name) {
    var s = String(name == null ? '' : name).trim();
    if (!s) return '';
    if (/^[A-Za-z]{3}$/.test(s)) return s.toUpperCase();   // 이미 코드면 그대로
    return AIRPORT[s] || s;                                 // 모르는 지명은 원문 유지
  }
  // ── 인쇄물 표기 단일 진실원 (Min 2026-08) ─────────────────────────────────
  //  같은 팀을 세 인쇄물(네임택·航空カバー·송영표)에서 보는데 공항 이름이 서로 달랐다
  //  (ICN / ソウル / 仁川空港). 매핑을 여기 한 곳에 두고 **형식만 골라 쓴다**.
  //   'code' = ICN·PUS (네임택 — 손님 가방에 다는 것, 국제 표준 코드)
  //   'city' = ソウル·釜山 (航空カバー — 현장 손글씨와 같은 표기)
  //   'full' = 仁川空港·金海空港 (송영표 — 기사·미팅 담당이 실제로 가는 곳)
  var AIRPORT_JA = {
    ICN: { city: 'ソウル', full: '仁川空港' }, GMP: { city: 'ソウル', full: '金浦空港' },
    PUS: { city: '釜山',   full: '金海空港' }, CJU: { city: '済州',   full: '済州空港' },
    TAE: { city: '大邱',   full: '大邱空港' }, CJJ: { city: '清州',   full: '清州空港' },
    KMJ: { city: '熊本',   full: '熊本空港' }, FUK: { city: '福岡',   full: '福岡空港' },
    NGS: { city: '長崎',   full: '長崎空港' }, OIT: { city: '大分',   full: '大分空港' },
    KOJ: { city: '鹿児島', full: '鹿児島空港' }
  };
  function airportLabel(v, style) {
    var c = airportCode(v); if (!c) return '';
    if (style === 'code' || !style) return c;
    var e = AIRPORT_JA[c]; if (!e) return c;
    return e[style] || c;
  }
  //  숙소 구분색 — 태그코드 끝 글자(Y·K·G·S) 기준. 세 인쇄물이 같은 색을 써야
  //  담당자가 종이를 바꿔 봐도 같은 숙소로 읽힌다.
  var ACCOM_COLOR = { Y: '#000000', K: '#5B21B6', G: '#065F46', S: '#92400E' };
  var ACCOM_COLOR_FALLBACK = '#1A2540';
  function accomPrefix(accom) {
    var a = String(accom || '');
    if (a.indexOf('쿠주') >= 0) return 'K';
    if (a.indexOf('간지') >= 0 || a.indexOf('ガーン') >= 0) return 'G';
    if (a.indexOf('시즈') >= 0) return 'S';
    return a ? 'Y' : '';
  }
  //  숙소명 또는 접두문자(Y/K/G/S) 어느 쪽을 줘도 같은 색을 돌려준다.
  function accomColor(v) {
    var k = String(v || '').trim();
    if (ACCOM_COLOR[k]) return ACCOM_COLOR[k];
    return ACCOM_COLOR[accomPrefix(k)] || ACCOM_COLOR_FALLBACK;
  }

  // 구간 표기 — 「ICN-KMJ」. 한쪽이 비면 있는 쪽만.
  function routeCode(from, to) {
    var a = airportCode(from), b = airportCode(to);
    return (a && b) ? (a + '-' + b) : (a || b || '');
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
    roomTypeLabel: roomTypeLabel,
    zoneLabel: zoneLabel,
    gradeLabel: gradeLabel,
    fmtDate: fmtDate,
    parseFlexDate: parseFlexDate, SHEET_FIX_MS: SHEET_FIX_MS,
    parseLocalDate: parseLocalDate,
    overlaps: overlaps,
    nightsBetween: nightsBetween,
    accomRate: accomRate,
    b2bFees: b2bFees,
    accomFromProduct: accomFromProduct,
    saleTypeFromProduct: saleTypeFromProduct,
    roomTypeSingles: roomTypeSingles, roomTypeAnnex: roomTypeAnnex, ROOMTYPE_ANNEX_RE: ROOMTYPE_ANNEX_RE, ROOMTYPE_FROM: ROOMTYPE_FROM, roomTypeOn: roomTypeOn,
    PARTNER_BRANDS: PARTNER_BRANDS,
    partnerBrand: partnerBrand,
    partnerBrandDef: partnerBrandDef, partnerBrandRef: partnerBrandRef,
    partnerLabel: partnerLabel,
    partnerSegment: partnerSegment,
    partnerAgency: partnerAgency,
    partnerNightType: partnerNightType, partnerGolfType: partnerGolfType, partnerQuote: partnerQuote,
    partnerRateRows: partnerRateRows, partnerRateCands: partnerRateCands, partnerPrice: partnerPrice,
    PARTNER_TRAVEL_MIN: PARTNER_TRAVEL_MIN, PARTNER_BUS_MIN: PARTNER_BUS_MIN, PARTNER_POINTS: PARTNER_POINTS,
    partnerAliasList: partnerAliasList, partnerFindNames: partnerFindNames, partnerRemarkPlan: partnerRemarkPlan,
    partnerVehiclePlan: partnerVehiclePlan, partnerLegPlan: partnerLegPlan, partnerRouteOf: partnerRouteOf, partnerLegOf: partnerLegOf,
    partnerHotelList: partnerHotelList, partnerGenderMF: partnerGenderMF, partnerCountryCode: partnerCountryCode,
    partnerRoomSlots: partnerRoomSlots, partnerRoomLabel: partnerRoomLabel, partnerRooming: partnerRooming, partnerGolfGroups: partnerGolfGroups,
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
    GOLF_COURSES: GOLF_COURSES,
    nextStartCourse: nextStartCourse,
    TAX_RATE: TAX_RATE,
    TAX_ROUNDING: TAX_ROUNDING,
    TAX_OPTIONS: TAX_OPTIONS,
    TAX_LABELS: TAX_LABELS,
    taxRound: taxRound,
    taxIncluded: taxIncluded,
    netOf: netOf,
    taxKey: taxKey,
    taxParse: taxParse,
    lineGross: lineGross,
    taxByRate: taxByRate,
    taxLabel: taxLabel,
    buildRounding: buildRounding,
    cartFreeDay: cartFreeDay,
    singlePlan: singlePlan,
    singleCount: singleCount,
    singleTentative: singleTentative,
    singleOnsite: singleOnsite,
    singleRequested: singleRequested,
    cartPlan: cartPlan,
    cartQtyFromRemark: cartQtyFromRemark,
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
    BASE_DINNER: BASE_DINNER,
    baseDinner: baseDinner,
    BASE_DINNER_KO: BASE_DINNER_KO,
    baseDinnerKo: baseDinnerKo,
    AREA_TREE: AREA_TREE,
    AREA_PARENT: AREA_PARENT,
    areaExpand: areaExpand,
    areaAllowed: areaAllowed,
    MEAL_OFFSITE: MEAL_OFFSITE,
    mealOffsite: mealOffsite,
    mealPlan: mealPlan,
    hangulToKana: hangulToKana, repIndex: repIndex, teamGroupLabel: teamGroupLabel,
    nameYomi: nameYomi,
    romajiToKana: romajiToKana,
    nameYomiEn: nameYomiEn,
    AIRPORT: AIRPORT,
    airportCode: airportCode,
    routeCode: routeCode,
    AIRPORT_JA: AIRPORT_JA,
    airportLabel: airportLabel,
    ACCOM_COLOR: ACCOM_COLOR,
    accomPrefix: accomPrefix,
    accomColor: accomColor,
    tagStripSeq: tagStripSeq,
    teamTagN: teamTagN,
    personTagN: personTagN,
    orderGroup: orderGroup,
    groupClusters: groupClusters,
    splitByReps: splitByReps,
    clusterOf: clusterOf
  };
});
