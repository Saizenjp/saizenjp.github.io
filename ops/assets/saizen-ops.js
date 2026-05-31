/* ════════════════════════════════════════════════════════════════
   SaiZen Ops 공통 모듈 — 다국어(日本語 기본 / 한국어) + 후리가나 토글
   · /app/ 과 동일한 UX: 로고→홈, 언어 토글, ふりがな 토글
   · 멀티페이지 공유: ops/index.html, ops/hub/step1.html, ops/hub/room.html
   · 데이터 매칭 키워드(엑셀 컬럼명·시트명·시설 매칭·prefix 등)는 절대 건드리지 않음
   ════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var LANG = localStorage.getItem('saizen_lang') || 'ja';   // 기본 일본어
  var FURI = localStorage.getItem('saizen_furi') === '1';   // 기본 OFF

  // 후리가나 ruby 헬퍼: r('漢字','かんじ') → <ruby>漢字<rt>かんじ</rt></ruby>
  function r(k, y) { return '<ruby>' + k + '<rt>' + y + '</rt></ruby>'; }

  /* ── 사전 ──
     common: 모든 페이지 공유 / index·step1·room: 페이지별 네임스페이스
     키 충돌 방지를 위해 페이지 키엔 접두어 사용 */
  var I18N = {
    ja: {
      /* 공통 */
      brandSub: r('運営','うんえい')+'システム · 운영 시스템',
      reset: r('初期化','しょきか'),
      home: 'ホーム',
      navStep1: '① '+r('適','てき')+'み'+r('込','こ')+'み',
      navRoom: '② '+r('部屋','へや')+r('割','わ')+'り'+r('当','あ')+'て',
      connState_none: r('未','み')+r('接続','せつぞく'),
      connState_ok: r('接続','せつぞく')+r('済','ず')+'み',
      connState_fail: r('接続','せつぞく')+r('失敗','しっぱい'),
      btnConnect: r('接続','せつぞく')+r('確認','かくにん'),
      btnConnectShort: r('接続','せつぞく'),

      /* index (허브 랜딩) */
      ix_envBadge: 'Yamanami',
      ix_heroH: r('サイゼン','')+r('運営','うんえい')+'システム',
      ix_heroP: 'エムクリック'+r('予約','よやく')+'データを'+r('受','う')+'け'+r('取','と')+'り、'+r('現場','げんば')+r('運営','うんえい')+r('成果物','せいかぶつ')+'を'+r('作','つく')+'る'+r('統合','とうごう')+r('窓口','まどぐち')+'です。'+r('運営','うんえい')+'・'+r('配置','はいち')+'・'+r('精算','せいさん')+'は<b>Hub（Supabase'+r('共有','きょうゆう')+'DB）</b>で、'+r('印刷物','いんさつぶつ')+'は<b>v13.4'+r('統合','とうごう')+'システム</b>で'+r('処理','しょり')+'します。',
      ix_heroNote: r('原則','げんそく')+'：<b>データは'+r('一','ひと')+'つ、'+r('画面','がめん')+'は'+r('複数','ふくすう')+'。</b> '+r('各','かく')+'モジュールは'+r('独立','どくりつ')+'ページですが'+r('同','おな')+'じデータを'+r('共有','きょうゆう')+'します。',
      ix_g1H: r('データ','')+r('準備','じゅんび'),
      ix_g1Desc: 'エムクリック4'+r('種','しゅ')+' → Supabase'+r('適','てき')+'み'+r('込','こ')+'み',
      ix_c1Step: 'STEP 1',
      ix_c1H: r('データ','')+r('適','てき')+'み'+r('込','こ')+'み',
      ix_c1Cd: r('予約','よやく')+'リスト・'+r('同行者','どうこうしゃ')+r('別','べつ')+r('予約','よやく')+'・'+r('現地','げんち')+r('到着','とうちゃく')+'・グループコードの4ファイルをアップロードし、event_seq'+r('基準','きじゅん')+'で'+r('適','てき')+'み'+r('込','こ')+'みます。'+r('同','おな')+'じファイルを'+r('再','さい')+'アップロードしても'+r('重複','じゅうふく')+'しません。',
      ix_g2H: r('現場','げんば')+r('運営','うんえい'),
      ix_g2Desc: r('適','てき')+'み'+r('込','こ')+'んだデータで'+r('配置','はいち')+'・'+r('精算','せいさん'),
      ix_c2Step: 'STEP 2',
      ix_c2H: r('ホテル','')+r('部屋','へや')+r('割','わ')+'り'+r('当','あ')+'て',
      ix_c2Cd: r('日付','ひづけ')+r('別','べつ')+r('滞在','たいざい')+r('人数','にんずう')+'を'+r('客室','きゃくしつ')+'に'+r('個人','こじん')+r('単位','たんい')+'で'+r('割','わ')+'り'+r('当','あ')+'てます。'+r('定員','ていいん')+'・'+r('期間','きかん')+r('重','かさ')+'なりを'+r('自動','じどう')+r('検証','けんしょう')+'し、4'+r('名','めい')+'チームの2+2'+r('分割','ぶんかつ')+r('配置','はいち')+'もできます。',
      ix_goEnter: r('入','はい')+'る',
      ix_soon: r('予定','よてい'),
      ix_c3H: 'ゴルフ'+r('ラウンド',''),
      ix_c3Cd: r('出発地','しゅっぱつち')+'・'+r('曜日','ようび')+'・'+r('宿泊','しゅくはく')+r('施設','しせつ')+r('別','べつ')+'のラウンド'+r('配置','はいち')+'。'+r('部屋','へや')+r('割','わ')+'り'+r('当','あ')+'てと'+r('同','おな')+'じパターンで'+r('日付','ひづけ')+r('別','べつ')+'チームを'+r('呼','よ')+'び'+r('出','だ')+'して'+r('配置','はいち')+'します。',
      ix_c4H: r('夕食','ゆうしょく'),
      ix_c4Cd: r('日付','ひづけ')+r('別','べつ')+r('食事','しょくじ')+r('人数','にんずう')+'・'+r('座席','ざせき')+r('配置','はいち')+'。'+r('同','おな')+'じSupabaseデータを'+r('共有','きょうゆう')+'します。',
      ix_c5H: r('精算','せいさん')+' · ダッシュボード',
      ix_c5Cd: r('部屋','へや')+'チャージ・シングルチャージ'+r('合算','がっさん')+'、'+r('前払','まえばら')+'い（メリット）/'+r('現場','げんば')+r('分離','ぶんり')+'。'+r('現地','げんち')+r('精算','せいさん')+r('表','ひょう')+'をSupabaseデータで'+r('生成','せいせい')+'します。',
      ix_g3H: r('印刷物','いんさつぶつ'),
      ix_g3Desc: 'v13.4'+r('統合','とうごう')+'システム（'+r('単発','たんぱつ')+r('出力','しゅつりょく')+'）',
      ix_cpH: 'ネームタグ · '+r('航空','こうくう')+'カバー · '+r('請求書','せいきゅうしょ'),
      ix_cpCd: r('一度','いちど')+r('出力','しゅつりょく')+'すれば'+r('終','お')+'わる'+r('印刷物','いんさつぶつ')+'は'+r('既存','きそん')+'の'+r('統合','とうごう')+'システムで'+r('生成','せいせい')+'します。ネームタグ・'+r('航空','こうくう')+'カバー・'+r('送迎','そうげい')+'・'+r('食事','しょくじ')+'・ゴルフ'+r('表','ひょう')+'・'+r('現地','げんち')+r('精算','せいさん')+r('表','ひょう')+'・'+r('御請求書','ごせいきゅうしょ')+'を7つのタブで'+r('出力','しゅつりょく')+'します。',
      ix_cpGo: r('統合','とうごう')+'システムを'+r('開','ひら')+'く',
      ix_foot: '<b>SaiZen Yamanami</b> · '+r('熊本','くまもと')+r('阿蘇','あそ')+'ヤマナミリゾート'+r('運営','うんえい')+' &nbsp;|&nbsp; Hubモジュールは<code>https://</code>'+r('環境','かんきょう')+'で'+r('実行','じっこう')+'するとSupabaseが'+r('動作','どうさ')+'します（ローカル<code>file://</code>'+r('直接','ちょくせつ')+r('起動','きどう')+r('不可','ふか')+'）。',

      /* step1 */
      s1_step: 'STEP 1 · '+r('データ','')+r('適','てき')+'み'+r('込','こ')+'み',
      s1_sub: 'エムクリック4'+r('種','しゅ')+' → Supabase',
      s1_lead: r('既存','きそん')+'のv13.4と'+r('同','おな')+'じく4つのファイルをアップロードすると、パース'+r('後','ご')+'にSupabaseへ'+r('適','てき')+'み'+r('込','こ')+'みます。<b>event_seq</b>'+r('基準','きじゅん')+'のupsertなので'+r('同','おな')+'じファイルを'+r('再','さい')+'アップロードしても'+r('重複','じゅうふく')+'しません（'+r('冪等','べきとう')+'）。'+r('適','てき')+'み'+r('込','こ')+'み'+r('順','じゅん')+'：'+r('予約','よやく')+'リスト → '+r('同行者','どうこうしゃ')+r('別','べつ')+r('予約','よやく')+' → '+r('現地','げんち')+r('到着','とうちゃく')+r('補完','ほかん')+' → グループコード → '+r('運営','うんえい')+r('元帳','もとちょう')+'（guests/guest_members）'+r('生成','せいせい')+'。',
      s1_h2conn: '① Supabase'+r('接続','せつぞく'),
      s1_lblUrl: 'Project URL',
      s1_lblKey: 'anon key',
      s1_connHint: r('入力値','にゅうりょくち')+'はこのブラウザ（localStorage）にのみ'+r('保存','ほぞん')+'されます。anonキーはRLSで'+r('保護','ほご')+'され、'+r('公開','こうかい')+'されても'+r('安全','あんぜん')+'なキーです。',
      s1_btnRun: 'Supabaseに'+r('適','てき')+'み'+r('込','こ')+'み',
      s1_btnClear: r('初期化','しょきか'),
      s1_h2stats: r('適','てき')+'み'+r('込','こ')+'み'+r('結果','けっか'),
      s1_statsNote: 'guests（チーム）・guest_members（'+r('個人','こじん')+'）は'+r('予約','よやく')+'リスト+'+r('同行者','どうこうしゃ')+r('別','べつ')+'+グループコード'+r('照合','しょうごう')+'で'+r('自動','じどう')+r('生成','せいせい')+'されます。タグコードはv13.4'+r('規則','きそく')+'（グループコード-'+r('個人','こじん')+r('番号','ばんごう')+'-'+r('宿泊先','しゅくはくさき')+'Pfx）をそのまま'+r('踏襲','とうしゅう')+'します。',
      s1_h2log: r('処理','しょり')+'ログ',
      s1_logWait: r('待機','たいき')+r('中','ちゅう')+'…',
      /* step1 슬롯(파일 4종) */
      s1_slot_res_tag: r('必須','ひっす')+' · マスター',
      s1_slot_res_name: r('予約','よやく')+'リスト',
      s1_slot_res_desc: 'チーム/'+r('予約','よやく')+r('単位','たんい')+'マスター。eventSeq・pax・'+r('金額','きんがく')+'・'+r('備考','びこう')+'。',
      s1_slot_ilhaeng_tag: r('必須','ひっす')+' · '+r('個人','こじん')+r('名簿','めいぼ'),
      s1_slot_ilhaeng_name: r('同行者','どうこうしゃ')+r('別','べつ')+r('予約','よやく'),
      s1_slot_ilhaeng_desc: r('個人','こじん')+r('単位','たんい')+'。'+r('英文名','えいぶんめい')+'・'+r('生年月日','せいねんがっぴ')+'・'+r('旅券','りょけん')+'・'+r('航空便','こうくうびん')+'。',
      s1_slot_arrival_tag: r('補完','ほかん'),
      s1_slot_arrival_name: r('現地','げんち')+r('到着','とうちゃく'),
      s1_slot_arrival_desc: r('英文名','えいぶんめい')+'・'+r('会員','かいいん')+r('番号','ばんごう')+r('補完','ほかん')+'（なくても'+r('進行','しんこう')+r('可能','かのう')+'）。',
      s1_slot_member_tag: r('参照','さんしょう'),
      s1_slot_member_name: 'グループコード',
      s1_slot_member_desc: r('会員','かいいん')+'グループコード'+r('照合','しょうごう')+'テーブル（'+r('会員','かいいん')+'_'+r('割当','わりあて')+'_'+r('現況','げんきょう')+'）。',
      s1_dropEmpty: 'ファイルをドラッグ&ドロップまたはクリック',
      /* step1 동적 로그/상태 (핵심) */
      s1_dyn_rows: r('行','ぎょう'),
      s1_dyn_load: 'ロード',
      s1_dyn_readFail: r('読','よ')+'み'+r('込','こ')+'み'+r('失敗','しっぱい'),
      s1_dyn_session: 'セッション',
      s1_dyn_connNeedInput: 'URL・keyを'+r('入力','にゅうりょく')+'してください',
      s1_dyn_connOk: r('接続','せつぞく')+r('成功','せいこう'),
      s1_dyn_connFail: r('接続','せつぞく')+r('失敗','しっぱい'),
      s1_dyn_runStart: r('適','てき')+'み'+r('込','こ')+'み'+r('開始','かいし')+' · セッション',
      s1_dyn_noDetect: '（'+r('未','み')+r('検出','けんしゅつ')+'）',
      s1_dyn_grpMissing: 'グループコードファイルなし — '+r('照合','しょうごう')+'は'+r('非','ひ')+r('会員','かいいん')+r('扱','あつか')+'い',
      s1_dyn_cases: r('件','けん'),
      s1_dyn_teams: 'チーム',

      /* room */
      rm_step: 'STEP 2 · '+r('ホテル','')+r('部屋','へや')+r('割','わ')+'り'+r('当','あ')+'て',
      rm_keyPlaceholder: 'API key（publishable または anon）',
      rm_connHint: r('接続','せつぞく')+r('情報','じょうほう')+'はこのブラウザにのみ'+r('保存','ほぞん')+'されます。',
      rm_modeDay: r('一日','いちにち')+r('表示','ひょうじ'),
      rm_modeRange: r('期間','きかん')+r('表示','ひょうじ'),
      rm_lblFrom: r('日付','ひづけ'),
      rm_btnLoad: r('読','よ')+'み'+r('込','こ')+'み',
      rm_btnExport: '📥 '+r('様式','ようしき')+r('書','か')+'き'+r('出','だ')+'し',
      rm_btnExportTitle: r('現在','げんざい')+'の'+r('配置','はいち')+r('状況','じょうきょう')+'をエクセルに'+r('書','か')+'き'+r('出','だ')+'し',
      rm_btnImport: '📤 '+r('一括','いっかつ')+r('配置','はいち'),
      rm_btnImportTitle: r('号室','ごうしつ')+'を'+r('記入','きにゅう')+'したエクセルをアップロードして'+r('一括','いっかつ')+r('配置','はいち'),
      rm_selClear: r('選択','せんたく')+r('解除','かいじょ'),
      rm_selHint: '→ '+r('客室','きゃくしつ')+'カードをクリックすると'+r('一括','いっかつ')+r('配置','はいち'),
      rm_legY: 'ヤマナミ',
      rm_legK: r('久住','くじゅう')+'ヒルズ',
      rm_legG: 'ガーンジー'+r('ホテル',''),
      rm_legS: 'しずの'+r('宿','やど'),
      rm_colUnassigned: r('未','み')+r('配置','はいち')+'チーム',
      rm_colRooms: r('客室','きゃくしつ')+r('割','わ')+'り'+r('当','あ')+'て',
      rm_emptyHint: r('日付','ひづけ')+'を'+r('選択','せんたく')+'して［'+r('読','よ')+'み'+r('込','こ')+'み］を'+r('押','お')+'してください。',
      rm_cntTeam: 'チーム',
      rm_cntPpl: r('名','めい'),
      rm_selectedSuffix: r('名','めい')+r('選択','せんたく'),
      rm_allAssigned: r('全','すべ')+'ての'+r('人員','じんいん')+r('配置','はいち')+r('完了','かんりょう')+' 🎉',
    },
    ko: {
      brandSub: '運営システム · 운영 시스템',
      reset: '초기화',
      home: '홈',
      navStep1: '① 적재',
      navRoom: '② 방배정',
      connState_none: '미연결',
      connState_ok: '연결됨',
      connState_fail: '연결 실패',
      btnConnect: '연결 확인',
      btnConnectShort: '연결',

      ix_envBadge: 'Yamanami',
      ix_heroH: '사이젠 운영 시스템',
      ix_heroP: '엠클릭 예약 데이터를 받아 현장 운영 산출물을 만드는 통합 관문입니다. 운영·배정·정산은 <b>Hub(Supabase 공유 DB)</b>에서, 인쇄물은 <b>v13.4 통합 시스템</b>에서 처리합니다.',
      ix_heroNote: '원칙: <b>데이터는 하나, 화면은 여럿.</b> 각 모듈은 독립 페이지지만 같은 데이터를 공유합니다.',
      ix_g1H: '데이터 준비',
      ix_g1Desc: '엠클릭 4종 → Supabase 적재',
      ix_c1Step: 'STEP 1',
      ix_c1H: '데이터 적재',
      ix_c1Cd: '예약리스트·일행별예약·현지도착·그룹코드 4파일을 올려 event_seq 기준으로 적재합니다. 같은 파일을 다시 올려도 중복되지 않습니다.',
      ix_g2H: '현장 운영',
      ix_g2Desc: '적재된 데이터로 배정·정산',
      ix_c2Step: 'STEP 2',
      ix_c2H: '호텔 방배정',
      ix_c2Cd: '날짜별 체류 인원을 객실에 개인 단위로 배정합니다. 정원·기간 겹침을 자동 검증하고, 4인팀 2+2 분리 배정도 됩니다.',
      ix_goEnter: '들어가기',
      ix_soon: '예정',
      ix_c3H: '골프 라운딩',
      ix_c3Cd: '출발지·요일·숙박시설별 라운딩 배정. 방배정과 같은 패턴으로 날짜별 팀을 불러와 배정합니다.',
      ix_c4H: '저녁 식사',
      ix_c4Cd: '날짜별 식사 인원·좌석 배정. 같은 Supabase 데이터를 공유합니다.',
      ix_c5H: '정산 · 대시보드',
      ix_c5Cd: '룸차지·싱글차지 합산, 선불(메리트)/현장 분리. 현지정산표를 Supabase 데이터로 생성합니다.',
      ix_g3H: '인쇄물',
      ix_g3Desc: 'v13.4 통합 시스템 (단발성 출력)',
      ix_cpH: '네임택 · 항공커버 · 청구서',
      ix_cpCd: '한 번 뽑으면 끝나는 인쇄물은 기존 통합 시스템에서 생성합니다. 네임택·항공커버·송영·식사·골프표·현지정산표·御請求書를 7개 탭에서 출력합니다.',
      ix_cpGo: '통합 시스템 열기',
      ix_foot: '<b>SaiZen Yamanami</b> · 구마모토 아소 야마나미 리조트 운영 &nbsp;|&nbsp; Hub 모듈은 <code>https://</code> 환경에서 실행해야 Supabase가 동작합니다(로컬 <code>file://</code> 직접 열기 불가).',

      s1_step: 'STEP 1 · 데이터 적재',
      s1_sub: '엠클릭 4종 → Supabase',
      s1_lead: '기존 v13.4와 동일하게 4개 파일을 올리면, 파싱 후 Supabase에 적재합니다. <b>event_seq</b> 기준 upsert이므로 같은 파일을 다시 올려도 중복되지 않습니다(멱등). 적재 순서: 예약리스트 → 일행별예약 → 현지도착 보완 → 그룹코드 → 운영 원장(guests/guest_members) 생성.',
      s1_h2conn: '① Supabase 연결',
      s1_lblUrl: 'Project URL',
      s1_lblKey: 'anon key',
      s1_connHint: '입력값은 이 브라우저(localStorage)에만 저장됩니다. anon 키는 RLS로 보호되며 공개돼도 안전한 키입니다.',
      s1_btnRun: 'Supabase에 적재',
      s1_btnClear: '초기화',
      s1_h2stats: '적재 결과',
      s1_statsNote: 'guests(팀)·guest_members(개인)는 예약리스트+일행별+그룹코드 매칭으로 자동 생성됩니다. 태그코드는 v13.4 규칙(그룹코드-개인번호-숙소Pfx)을 그대로 따릅니다.',
      s1_h2log: '처리 로그',
      s1_logWait: '대기 중…',
      s1_slot_res_tag: '필수 · 마스터',
      s1_slot_res_name: '예약리스트',
      s1_slot_res_desc: '팀/예약 단위 마스터. eventSeq·pax·금액·비고.',
      s1_slot_ilhaeng_tag: '필수 · 개인명단',
      s1_slot_ilhaeng_name: '일행별예약',
      s1_slot_ilhaeng_desc: '개인 단위. 영문명·생년월일·여권·항공편.',
      s1_slot_arrival_tag: '보완',
      s1_slot_arrival_name: '현지도착',
      s1_slot_arrival_desc: '영문명·회원번호 보완(없어도 진행 가능).',
      s1_slot_member_tag: '참조',
      s1_slot_member_name: '그룹코드',
      s1_slot_member_desc: '회원 그룹코드 매칭 테이블(회원_배정_현황).',
      s1_dropEmpty: '파일을 끌어다 놓거나 클릭',
      s1_dyn_rows: '행',
      s1_dyn_load: '로드',
      s1_dyn_readFail: '읽기 실패',
      s1_dyn_session: '세션',
      s1_dyn_connNeedInput: 'URL·key를 입력하세요',
      s1_dyn_connOk: '연결 성공',
      s1_dyn_connFail: '연결 실패',
      s1_dyn_runStart: '적재 시작 · 세션',
      s1_dyn_noDetect: '(미감지)',
      s1_dyn_grpMissing: '그룹코드 파일 없음 — 매칭은 비회원 처리',
      s1_dyn_cases: '건',
      s1_dyn_teams: '팀',

      rm_step: 'STEP 2 · 호텔 방배정',
      rm_keyPlaceholder: 'API key (publishable 또는 anon)',
      rm_connHint: '연결 정보는 이 브라우저에만 저장됩니다.',
      rm_modeDay: '하루 보기',
      rm_modeRange: '기간 보기',
      rm_lblFrom: '날짜',
      rm_btnLoad: '불러오기',
      rm_btnExport: '📥 양식 내보내기',
      rm_btnExportTitle: '현재 배정 현황을 엑셀로 내보내기',
      rm_btnImport: '📤 일괄 배정',
      rm_btnImportTitle: '호수 채운 엑셀 올려 일괄 배정',
      rm_selClear: '선택 해제',
      rm_selHint: '→ 객실 카드를 클릭하면 한꺼번에 배정',
      rm_legY: '야마나미',
      rm_legK: '쿠주힐즈',
      rm_legG: '간지호텔',
      rm_legS: '시즈노야도',
      rm_colUnassigned: '미배정 팀',
      rm_colRooms: '객실 배정',
      rm_emptyHint: '날짜를 선택하고 [불러오기]를 누르세요.',
      rm_cntTeam: '팀',
      rm_cntPpl: '명',
      rm_selectedSuffix: '명 선택됨',
      rm_allAssigned: '모든 인원 배정 완료 🎉',
    }
  };

  function t(key) {
    var d = I18N[LANG] || I18N.ja;
    if (d[key] !== undefined) return d[key];
    if (I18N.ja[key] !== undefined) return I18N.ja[key];
    return key;
  }

  // 속성용(ruby/태그 제거 후 평문)
  function stripRuby(html) {
    return html.replace(/<rt>.*?<\/rt>/g, '').replace(/<\/?ruby>/g, '').replace(/<[^>]+>/g, '');
  }

  function applyLang() {
    document.documentElement.lang = LANG;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.setAttribute('title', stripRuby(t(el.getAttribute('data-i18n-title'))));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', stripRuby(t(el.getAttribute('data-i18n-ph'))));
    });
    // 토글 active
    var lj = document.getElementById('so-lang-ja'), lk = document.getElementById('so-lang-ko');
    if (lj && lk) { lj.classList.toggle('active', LANG === 'ja'); lk.classList.toggle('active', LANG === 'ko'); }
    var fb = document.getElementById('so-furi');
    if (fb) {
      fb.style.display = (LANG === 'ja') ? '' : 'none';
      fb.textContent = 'ふりがな ' + (FURI ? 'ON' : 'OFF');
      fb.classList.toggle('on', FURI);
    }
    document.body.classList.toggle('furi-on', FURI && LANG === 'ja');
    // 페이지가 동적 갱신 훅을 등록했으면 호출
    if (typeof global.onSaizenLangChange === 'function') {
      try { global.onSaizenLangChange(LANG); } catch (e) {}
    }
  }

  function setLang(l) { LANG = l; localStorage.setItem('saizen_lang', l); applyLang(); }
  function toggleFuri() { FURI = !FURI; localStorage.setItem('saizen_furi', FURI ? '1' : '0'); applyLang(); }

  // 외부에서 현재 언어/번역 접근용
  var API = {
    t: t, r: r, setLang: setLang, toggleFuri: toggleFuri,
    apply: applyLang, stripRuby: stripRuby,
    get lang() { return LANG; },
    get furi() { return FURI; },
    dict: I18N
  };
  global.SaizenOps = API;
  // 페이지 동적 JS에서 짧게 쓰도록 t() 전역 별칭(충돌 없으면)
  if (typeof global.t === 'undefined') global.t = t;

  // 토글 버튼 핸들러 전역 노출(헤더 인라인 onclick용)
  global.__so_setLang = setLang;
  global.__so_toggleFuri = toggleFuri;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyLang);
  } else {
    applyLang();
  }
})(window);
