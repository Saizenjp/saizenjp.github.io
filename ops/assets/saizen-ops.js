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
      brandSub: 'Yamanami '+r('運営','うんえい')+r('管理','かんり')+'システム',
      reset: r('初期化','しょきか'),
      home: 'ホーム',
      navStep1: '① '+r('登録','とうろく'),
      navRoom: '② '+r('部屋','へや')+r('割','わ')+'り'+r('当','あ')+'て',
      connState_none: r('未','み')+r('接続','せつぞく'),
      connState_ok: r('接続','せつぞく')+r('済','ず')+'み',
      connState_fail: r('接続','せつぞく')+r('失敗','しっぱい'),
      btnConnect: r('接続','せつぞく')+r('確認','かくにん'),
      btnConnectShort: r('接続','せつぞく'),

      /* index (허브 랜딩) */
      ix_envBadge: 'Yamanami',
      ix_heroH: 'Yamanami '+r('運営','うんえい')+r('管理','かんり')+'システム',
      ix_heroP: 'エムクリック'+r('予約','よやく')+'データを'+r('受','う')+'け'+r('取','と')+'り、'+r('現場','げんば')+r('運営','うんえい')+r('成果物','せいかぶつ')+'を'+r('作','つく')+'る'+r('統合','とうごう')+'システムです。',
      ix_heroNote: r('原則','げんそく')+'：<b>データは'+r('一','ひと')+'つ、'+r('画面','がめん')+'は'+r('複数','ふくすう')+'。</b> '+r('各','かく')+'モジュールは'+r('独立','どくりつ')+'ページですが'+r('同','おな')+'じデータを'+r('共有','きょうゆう')+'します。',
      ix_g1H: r('データ','')+r('準備','じゅんび'),
      ix_g1Desc: r('予約','よやく')+'ファイル'+r('登録','とうろく')+' · '+r('変更','へんこう')+r('履歴','りれき'),
      ix_c1Step: 'STEP 1',
      ix_c1H: r('データ','')+r('登録','とうろく'),
      ix_c1Cd: r('予約','よやく')+'リスト・'+r('同行者','どうこうしゃ')+r('別','べつ')+r('予約','よやく')+'の2'+r('つ','')+'のファイルをアップロードすると、'+r('自動','じどう')+'で'+r('整理','せいり')+'・'+r('保存','ほぞん')+'されます。グループコードは'+r('選択','せんたく')+'（'+r('一度','いちど')+r('登録','とうろく')+'すると'+r('保持','ほじ')+'）。'+r('同','おな')+'じファイルを'+r('再','さい')+'アップロードしても'+r('重複','じゅうふく')+'しません。',
      ix_g2H: r('現場','げんば')+r('運営','うんえい'),
      ix_g2Desc: r('登録','とうろく')+'したデータで'+r('配置','はいち')+'・'+r('精算','せいさん'),
      ix_c2Step: 'STEP 2',
      ix_c2H: r('ホテル','')+r('部屋','へや')+r('割','わ')+'り'+r('当','あ')+'て',
      ix_c2Cd: r('日付','ひづけ')+r('別','べつ')+r('滞在','たいざい')+r('人数','にんずう')+'を'+r('客室','きゃくしつ')+'に'+r('個人','こじん')+r('単位','たんい')+'で'+r('割','わ')+'り'+r('当','あ')+'てます。'+r('定員','ていいん')+'・'+r('期間','きかん')+r('重','かさ')+'なりを'+r('自動','じどう')+r('検証','けんしょう')+'し、4'+r('名','めい')+'チームの2+2'+r('分割','ぶんかつ')+r('配置','はいち')+'もできます。',
      ix_goEnter: r('入','はい')+'る',
      ix_soon: r('予定','よてい'),
      ix_c3H: 'ゴルフ'+r('ラウンド',''),
      ix_c3Cd: r('出発地','しゅっぱつち')+'・'+r('曜日','ようび')+'・'+r('宿泊','しゅくはく')+r('施設','しせつ')+r('別','べつ')+'のラウンド'+r('配置','はいち')+'。'+r('部屋','へや')+r('割','わ')+'り'+r('当','あ')+'てと'+r('同','おな')+'じパターンで'+r('日付','ひづけ')+r('別','べつ')+'チームを'+r('呼','よ')+'び'+r('出','だ')+'して'+r('配置','はいち')+'します。',
      ix_c4H: r('夕食','ゆうしょく'),
      ix_c4Cd: r('日付','ひづけ')+r('別','べつ')+r('食事','しょくじ')+r('人数','にんずう')+'・'+r('座席','ざせき')+r('配置','はいち')+'。'+r('同','おな')+'じデータを'+r('共有','きょうゆう')+'します。',
      ix_c5H: r('精算','せいさん')+' · ダッシュボード',
      ix_c5Cd: r('部屋','へや')+'チャージ・シングルチャージ'+r('合算','がっさん')+'、'+r('前払','まえばら')+'い（メリット）/'+r('現場','げんば')+r('分離','ぶんり')+'。'+r('現地','げんち')+r('精算','せいさん')+r('表','ひょう')+'を'+r('自動','じどう')+'で'+r('作成','さくせい')+'します。',
      ix_g3H: r('印刷物','いんさつぶつ'),
      ix_g3Desc: 'v13.4'+r('統合','とうごう')+'システム（'+r('単発','たんぱつ')+r('出力','しゅつりょく')+'）',
      ix_cpH: 'ネームタグ · '+r('航空','こうくう')+'カバー · '+r('精算','せいさん'),
      ix_cpCd: r('一度','いちど')+r('出力','しゅつりょく')+'すれば'+r('終','お')+'わる'+r('印刷物','いんさつぶつ')+'は'+r('既存','きそん')+'の'+r('統合','とうごう')+'システムで'+r('生成','せいせい')+'します。ネームタグ・'+r('航空','こうくう')+'カバー・'+r('送迎','そうげい')+'・'+r('食事','しょくじ')+'・ゴルフ'+r('表','ひょう')+'・'+r('現地','げんち')+r('精算','せいさん')+r('表','ひょう')+'を7つのタブで'+r('出力','しゅつりょく')+'します。',
      ix_cpGo: r('統合','とうごう')+'システムを'+r('開','ひら')+'く',
      ix_foot: '<b>SaiZen Yamanami</b> · '+r('熊本','くまもと')+r('阿蘇','あそ')+'ヤマナミリゾート'+r('運営','うんえい'),

      /* step1 */
      s1_step: 'STEP 1 · '+r('データ','')+r('登録','とうろく'),
      s1_sub: 'エムクリック'+r('予約','よやく')+'ファイル'+r('登録','とうろく'),
      s1_lead: r('予約','よやく')+r('関連','かんれん')+'の2つのファイルを'+r('順番','じゅんばん')+'にアップロードすると、'+r('自動','じどう')+'で'+r('整理','せいり')+'・'+r('保存','ほぞん')+'されます。'+r('同','おな')+'じファイルを'+r('誤','あやま')+'って'+r('再','さい')+'アップロードしても'+r('重複','じゅうふく')+'しないので'+r('安心','あんしん')+'です。<b>'+r('アップロード','')+r('順','じゅん')+'</b>：'+r('予約','よやく')+'リスト → '+r('同行者','どうこうしゃ')+r('別','べつ')+r('予約','よやく')+'。グループコードは'+r('選択','せんたく')+'（'+r('一度','いちど')+r('登録','とうろく')+'すると'+r('保持','ほじ')+'）。',
      s1_h2conn: '① '+r('データベース','')+r('接続','せつぞく'),
      s1_lblUrl: 'Project URL',
      s1_lblKey: 'anon key',
      s1_connHint: r('入力','にゅうりょく')+'した'+r('情報','じょうほう')+'はこのパソコンのブラウザにのみ'+r('保存','ほぞん')+'されます。'+r('公開','こうかい')+'されても'+r('安全','あんぜん')+'なキーなので'+r('安心','あんしん')+'してください。',
      s1_btnRun: r('データ','')+r('登録','とうろく'),
      s1_btnHome: r('現場','げんば')+r('運営','うんえい')+'へ →',
      s1_btnClear: r('初期化','しょきか'),
      s1_h2stats: r('登録','とうろく')+r('結果','けっか'),
      s1_uploaderPh: r('担当','たんとう')+r('者','しゃ')+r('名','めい'),
      s1_h2history: r('変更','へんこう')+r('履歴','りれき'),
      s1_historyNote: r('予約','よやく')+'/'+r('同行','どうこう')+'/'+r('チーム','')+r('件数','けんすう'),
      s1_historyEmpty: r('登録','とうろく')+r('履歴','りれき')+'がありません',
      s1_dyn_histFail: r('履歴','りれき')+r('記録','きろく')+r('失敗','しっぱい'),
      s1_statsNote: r('予約','よやく')+'リスト・'+r('同行者','どうこうしゃ')+r('別','べつ')+r('予約','よやく')+'・グループコードを'+r('照合','しょうごう')+'して、チーム'+r('単位','たんい')+'と'+r('個人','こじん')+r('単位','たんい')+'の'+r('名簿','めいぼ')+'が'+r('自動','じどう')+'で'+r('作','つく')+'られます。タグコードも'+r('自動','じどう')+'で'+r('付与','ふよ')+'されます。',
      s1_h2log: r('進行','しんこう')+r('状況','じょうきょう'),
      s1_logWait: r('待機','たいき')+r('中','ちゅう')+'…',
      /* step1 슬롯(파일 4종) */
      s1_slot_res_tag: r('必須','ひっす')+' · マスター',
      s1_slot_res_name: r('予約','よやく')+'リスト',
      s1_slot_res_desc: 'チーム/'+r('予約','よやく')+r('単位','たんい')+'マスター。eventSeq・pax・'+r('金額','きんがく')+'・'+r('備考','びこう')+'。エムクリック「'+r('出発','しゅっぱつ')+r('日別','ひべつ')+'・'+r('予約','よやく')+r('日別','ひべつ')+' → '+r('予約','よやく')+r('現況','げんきょう')+'」から'+r('取得','しゅとく')+'、500'+r('行','ぎょう')+r('分割','ぶんかつ')+r('時','じ')+'は'+r('複数','ふくすう')+'ファイル'+r('可','か')+'。',
      s1_slot_ilhaeng_tag: r('必須','ひっす')+' · '+r('個人','こじん')+r('名簿','めいぼ'),
      s1_slot_ilhaeng_name: r('同行者','どうこうしゃ')+r('別','べつ')+r('予約','よやく'),
      s1_slot_ilhaeng_desc: r('個人','こじん')+r('単位','たんい')+'。'+r('英文名','えいぶんめい')+'・'+r('生年月日','せいねんがっぴ')+'・'+r('旅券','りょけん')+'・'+r('航空便','こうくうびん')+'。エムクリック「'+r('出発','しゅっぱつ')+r('日別','ひべつ')+'・'+r('予約','よやく')+r('日別','ひべつ')+' → '+r('搭乗者','とうじょうしゃ')+r('情報','じょうほう')+'」から'+r('取得','しゅとく')+'、500'+r('行','ぎょう')+r('分割','ぶんかつ')+r('時','じ')+'は'+r('複数','ふくすう')+'ファイル'+r('可','か')+'。',
      s1_slot_member_tag: r('選択','せんたく')+' · '+r('保持','ほじ'),
      s1_slot_member_name: 'グループコード',
      s1_slot_member_desc: r('会員','かいいん')+'グループコード'+r('照合','しょうごう')+'テーブル（'+r('会員','かいいん')+'_'+r('割当','わりあて')+'_'+r('現況','げんきょう')+'）。'+r('一度','いちど')+r('登録','とうろく')+'すると'+r('保持','ほじ')+'されます。',
      s1_dyn_memberCached: r('保存','ほぞん')+r('済','ず')+' · '+r('保持','ほじ')+r('中','ちゅう'),
      s1_dyn_filesMerged: 'ファイル'+r('統合','とうごう'),
      s1_dropEmpty: 'ファイルをドラッグ&ドロップまたはクリック',
      /* step1 동적 로그/상태 (핵심) */
      s1_dyn_rows: r('行','ぎょう'),
      s1_dyn_load: 'ロード',
      s1_dyn_readFail: r('読','よ')+'み'+r('込','こ')+'み'+r('失敗','しっぱい'),
      s1_dyn_session: 'セッション',
      s1_dyn_connNeedInput: 'URL・keyを'+r('入力','にゅうりょく')+'してください',
      s1_dyn_connOk: r('接続','せつぞく')+r('成功','せいこう'),
      s1_dyn_connFail: r('接続','せつぞく')+r('失敗','しっぱい'),
      s1_dyn_runStart: r('登録','とうろく')+r('開始','かいし')+' · セッション',
      s1_dyn_noDetect: '（'+r('未','み')+r('検出','けんしゅつ')+'）',
      s1_dyn_grpMissing: 'グループコードファイルなし — '+r('照合','しょうごう')+'は'+r('非','ひ')+r('会員','かいいん')+r('扱','あつか')+'い',
      s1_dyn_cases: r('件','けん'),
      s1_dyn_teams: 'チーム',
      s1_dyn_log_member: r('会員','かいいん')+'グループコード',
      s1_dyn_log_booking: r('予約','よやく')+'チーム',
      s1_dyn_log_pax: r('個人','こじん')+r('名簿','めいぼ'),
      s1_dyn_log_guests: r('運営','うんえい')+'チーム',
      s1_dyn_log_members: r('運営','うんえい')+r('個人','こじん'),
      s1_dyn_cntPpl: r('名','めい'),
      s1_dyn_cntTarget: r('運営','うんえい')+r('対象','たいしょう'),
      s1_dyn_error: r('エラー',''),

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
      brandSub: 'Yamanami 운영 관리 시스템',
      reset: '초기화',
      home: '홈',
      navStep1: '① 등록',
      navRoom: '② 방배정',
      connState_none: '미연결',
      connState_ok: '연결됨',
      connState_fail: '연결 실패',
      btnConnect: '연결 확인',
      btnConnectShort: '연결',

      ix_envBadge: 'Yamanami',
      ix_heroH: 'Yamanami 운영 관리 시스템',
      ix_heroP: '엠클릭 예약 데이터를 받아 현장 운영 산출물을 만드는 통합 시스템입니다.',
      ix_heroNote: '원칙: <b>데이터는 하나, 화면은 여럿.</b> 각 모듈은 독립 페이지지만 같은 데이터를 공유합니다.',
      ix_g1H: '데이터 준비',
      ix_g1Desc: '예약 파일 등록 · 변경이력',
      ix_c1Step: 'STEP 1',
      ix_c1H: '데이터 등록',
      ix_c1Cd: '예약리스트·일행별예약 2개 파일을 올리면 자동으로 정리되어 저장됩니다. 그룹코드는 선택(한번 등록하면 유지). 같은 파일을 다시 올려도 중복되지 않습니다.',
      ix_g2H: '현장 운영',
      ix_g2Desc: '등록된 데이터로 배정·정산',
      ix_c2Step: 'STEP 2',
      ix_c2H: '호텔 방배정',
      ix_c2Cd: '날짜별 체류 인원을 객실에 개인 단위로 배정합니다. 정원·기간 겹침을 자동 검증하고, 4인팀 2+2 분리 배정도 됩니다.',
      ix_goEnter: '들어가기',
      ix_soon: '예정',
      ix_c3H: '골프 라운딩',
      ix_c3Cd: '출발지·요일·숙박시설별 라운딩 배정. 방배정과 같은 패턴으로 날짜별 팀을 불러와 배정합니다.',
      ix_c4H: '저녁 식사',
      ix_c4Cd: '날짜별 식사 인원·좌석 배정. 같은 데이터를 공유합니다.',
      ix_c5H: '정산 · 대시보드',
      ix_c5Cd: '룸차지·싱글차지 합산, 선불(메리트)/현장 분리. 현지정산표를 자동으로 만듭니다.',
      ix_g3H: '인쇄물',
      ix_g3Desc: 'v13.4 통합 시스템 (단발성 출력)',
      ix_cpH: '네임택 · 항공커버 · 정산',
      ix_cpCd: '한 번 뽑으면 끝나는 인쇄물은 기존 통합 시스템에서 생성합니다. 네임택·항공커버·송영·식사·골프표·현지정산표를 7개 탭에서 출력합니다.',
      ix_cpGo: '통합 시스템 열기',
      ix_foot: '<b>SaiZen Yamanami</b> · 구마모토 아소 야마나미 리조트 운영',

      s1_step: 'STEP 1 · 데이터 등록',
      s1_sub: '엠클릭 예약 파일 등록',
      s1_lead: '예약 관련 2개 파일을 순서대로 올리면 자동으로 정리되어 저장됩니다. 같은 파일을 실수로 다시 올려도 중복되지 않으니 안심하세요. <b>올리는 순서</b>: 예약리스트 → 일행별예약. 그룹코드는 선택(한번 등록하면 유지됩니다).',
      s1_h2conn: '① 데이터베이스 연결',
      s1_lblUrl: 'Project URL',
      s1_lblKey: 'anon key',
      s1_connHint: '입력한 정보는 이 PC의 브라우저에만 저장됩니다. 공개돼도 안전한 키이니 안심하세요.',
      s1_btnRun: '데이터 등록',
      s1_btnHome: '현장 운영으로 →',
      s1_btnClear: '초기화',
      s1_h2stats: '등록 결과',
      s1_uploaderPh: '담당자명',
      s1_h2history: '변경이력',
      s1_historyNote: '예약/일행/팀 건수',
      s1_historyEmpty: '등록 이력이 없습니다',
      s1_dyn_histFail: '이력 기록 실패',
      s1_statsNote: '예약리스트·일행별예약·그룹코드를 맞춰서, 팀 단위와 개인 단위 명단이 자동으로 만들어집니다. 태그코드도 자동으로 붙습니다.',
      s1_h2log: '진행 상황',
      s1_logWait: '대기 중…',
      s1_slot_res_tag: '필수 · 마스터',
      s1_slot_res_name: '예약리스트',
      s1_slot_res_desc: '팀/예약 단위 마스터(eventSeq·pax·금액·비고). 엠클릭 「출발일별·예약일별 → 예약현황」에서 다운로드, 500행 분할 시 여러 파일 가능.',
      s1_slot_ilhaeng_tag: '필수 · 개인명단',
      s1_slot_ilhaeng_name: '일행별예약',
      s1_slot_ilhaeng_desc: '개인 단위(영문명·생년월일·여권·항공편). 엠클릭 「출발일별·예약일별 → 탑승자정보」에서 다운로드, 500행 분할 시 여러 파일 가능.',
      s1_slot_member_tag: '선택 · 유지',
      s1_slot_member_name: '그룹코드',
      s1_slot_member_desc: '회원 그룹코드 매칭 테이블. 한번 등록하면 유지됩니다.',
      s1_dyn_memberCached: '저장됨 · 유지 중',
      s1_dyn_filesMerged: '개 파일 병합',
      s1_dropEmpty: '파일을 끌어다 놓거나 클릭',
      s1_dyn_rows: '행',
      s1_dyn_load: '로드',
      s1_dyn_readFail: '읽기 실패',
      s1_dyn_session: '세션',
      s1_dyn_connNeedInput: 'URL·key를 입력하세요',
      s1_dyn_connOk: '연결 성공',
      s1_dyn_connFail: '연결 실패',
      s1_dyn_runStart: '등록 시작 · 세션',
      s1_dyn_noDetect: '(미감지)',
      s1_dyn_grpMissing: '그룹코드 파일 없음 — 매칭은 비회원 처리',
      s1_dyn_cases: '건',
      s1_dyn_teams: '팀',
      s1_dyn_log_member: '회원 그룹코드',
      s1_dyn_log_booking: '예약 팀',
      s1_dyn_log_pax: '개인 명단',
      s1_dyn_log_guests: '운영 팀',
      s1_dyn_log_members: '운영 개인',
      s1_dyn_cntPpl: '명',
      s1_dyn_cntTarget: '운영 대상',
      s1_dyn_error: '오류',

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
