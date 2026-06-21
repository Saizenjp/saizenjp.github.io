/* ════════════════════════════════════════════════════════════════
   SaiZen Ops 공통 모듈 — 다국어(日本語 기본 / 한국어 / English) + 후리가나 토글
   · /app/ 과 동일한 UX: 로고→홈, 언어 토글, ふりがな 토글
   · 멀티페이지 공유: ops/index.html, ops/hub/step1.html, ops/hub/room.html
   · 데이터 매칭 키워드(엑셀 컬럼명·시트명·시설 매칭·prefix 등)는 절대 건드리지 않음
   ════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // ── Supabase 접속정보 내장(어느 PC든 자동 연결) ──
  //    publishable key 라 공개 안전(RLS로 잠겨 로그인 없이는 데이터 접근 불가).
  //    ⚠ sb_secret_ 키는 절대 여기 넣지 않는다.
  var SB_URL_DEFAULT = 'https://wzfmloivrolpwpiuyhbs.supabase.co';
  var SB_KEY_DEFAULT = 'sb_publishable_W76Uh3D9gRPjPoxHwl-LYw_dR9BIj6L';
  try {
    if (!localStorage.getItem('saizen_sb_url')) localStorage.setItem('saizen_sb_url', SB_URL_DEFAULT);
    if (!localStorage.getItem('saizen_sb_key')) localStorage.setItem('saizen_sb_key', SB_KEY_DEFAULT);
  } catch (e) {}

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
      navHome: '← '+r('現場','げんば')+r('運営','うんえい'),
      rm_member: r('会員','かいいん'),
      rm_nonmember: r('非','ひ')+r('会員','かいいん'),
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
      ix_c1Req: r('必須','ひっす'),
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
      ix_c5H: r('現場','げんば')+r('精算','せいさん')+'（'+r('御','ご')+r('請求','せいきゅう')+r('書','しょ')+'）',
      ix_c5Cd: 'お'+r('客様','きゃくさま')+'の'+r('追加','ついか')+r('料金','りょうきん')+'（'+r('宴会','えんかい')+'・レストラン・'+r('追加','ついか')+'ラウンド・'+r('部屋','へや')+'など）を'+r('精算','せいさん')+r('口座','こうざ')+'にまとめ、チェックアウト'+r('時','じ')+'に'+r('御','ご')+r('請求','せいきゅう')+r('書','しょ')+'を'+r('作','つく')+'ります。B2B'+r('精算','せいさん')+'とは'+r('別','べつ')+'レイヤー。',
      ix_c6H: r('注文','ちゅうもん')+r('入力','にゅうりょく')+'（'+r('簡易','かんい')+'POS）',
      ix_c6Cd: 'レストラン・'+r('宴会場','えんかいじょう')+'・ゴルフショップで、'+r('係員','かかりいん')+'がタブレットでメニューをタップし'+r('該当','がいとう')+'チームに'+r('直接','ちょくせつ')+r('注文','ちゅうもん')+'を'+r('付','つ')+'けます。'+r('合計','ごうけい')+'は'+r('精算','せいさん')+r('口座','こうざ')+'に'+r('自動','じどう')+'で'+r('反映','はんえい')+'。',
      ix_c7H: r('厨房','ちゅうぼう')+r('画面','がめん')+'（KDS）',
      ix_c7Cd: r('注文','ちゅうもん')+r('入力','にゅうりょく')+'から'+r('厨房','ちゅうぼう')+r('行','ゆ')+'きの'+r('料理','りょうり')+'だけが'+r('厨房','ちゅうぼう')+r('画面','がめん')+'に'+r('即時','そくじ')+r('表示','ひょうじ')+'。'+r('作','つく')+'り'+r('終','お')+'えたら['+r('完了','かんりょう')+']でリストから'+r('消','け')+'します。',
      ix_c8H: 'メニュー'+r('管理','かんり'),
      ix_c8Cd: 'POS・'+r('厨房','ちゅうぼう')+r('画面','がめん')+'で'+r('使','つか')+'うメニュー・'+r('単価','たんか')+'・station を'+r('登録','とうろく')+r('編集','へんしゅう')+'します。メニュー'+r('表','ひょう')+'を'+r('一括','いっかつ')+r('貼','は')+'り'+r('付','つ')+'けで'+r('入力','にゅうりょく')+'も'+r('可能','かのう')+'。',
      ix_g3H: r('印刷物','いんさつぶつ'),
      ix_g3Desc: 'v13.4'+r('統合','とうごう')+'システム（'+r('単発','たんぱつ')+r('出力','しゅつりょく')+'）',
      ix_dBoard: r('統合','とうごう')+'ボード',
      ix_dBoardDesc: r('全部署','ぜんぶしょ')+'の'+r('共有','きょうゆう')+'・'+r('今日','きょう')+'の'+r('要約','ようやく'),
      ix_dFront: 'フロント・'+r('客室','きゃくしつ'),
      ix_dFrontDesc: r('部屋','へや')+r('割','わ')+'り・'+r('客室','きゃくしつ'),
      ix_dFnb: r('飲食','いんしょく')+'（F&B）',
      ix_dFnbDesc: 'POS・'+r('厨房','ちゅうぼう')+'・メニュー',
      ix_dGolf: 'ゴルフ',
      ix_dGolfDesc: 'コース・'+r('組','くみ')+r('合','あ')+'わせ（'+r('準備','じゅんび')+r('中','ちゅう')+'）',
      ix_dAcct: r('会計','かいけい'),
      ix_dAcctDesc: r('現地','げんち')+r('精算','せいさん'),
      ix_cpH: 'ネームタグ · '+r('航空','こうくう')+'カバー · '+r('精算','せいさん'),
      ix_cpCd: r('一度','いちど')+r('出力','しゅつりょく')+'すれば'+r('終','お')+'わる'+r('印刷物','いんさつぶつ')+'は'+r('既存','きそん')+'の'+r('統合','とうごう')+'システムで'+r('生成','せいせい')+'します。ネームタグ・'+r('航空','こうくう')+'カバー・'+r('送迎','そうげい')+'・'+r('食事','しょくじ')+'・ゴルフ'+r('表','ひょう')+'・'+r('現地','げんち')+r('精算','せいさん')+r('表','ひょう')+'を7つのタブで'+r('出力','しゅつりょく')+'します。',
      ix_cpGo: r('統合','とうごう')+'システムを'+r('開','ひら')+'く',
      ix_foot: '<b>SaiZen Yamanami</b> · '+r('熊本','くまもと')+r('阿蘇','あそ')+'ヤマナミリゾート'+r('運営','うんえい'),

      /* step1 */
      s1_step: r('データ','')+r('登録','とうろく'),
      s1_regStatusDone: r('既','すで')+'に'+r('登録済','とうろくず')+'みのデータがあります',
      s1_regStatusHint: r('新規','しんき')+'·'+r('変更','へんこう')+r('時','じ')+'のみ'+r('再','さい')+'アップロード',
      s1_sub: 'エムクリック'+r('予約','よやく')+'ファイル'+r('登録','とうろく'),
      s1_lead: r('予約','よやく')+r('関連','かんれん')+'の2つのファイルを'+r('順番','じゅんばん')+'にアップロードすると、'+r('自動','じどう')+'で'+r('整理','せいり')+'・'+r('保存','ほぞん')+'されます。'+r('同','おな')+'じファイルを'+r('誤','あやま')+'って'+r('再','さい')+'アップロードしても'+r('重複','じゅうふく')+'しないので'+r('安心','あんしん')+'です。<b>'+r('アップロード','')+r('順','じゅん')+'</b>：'+r('予約','よやく')+'リスト → '+r('同行者','どうこうしゃ')+r('別','べつ')+r('予約','よやく')+'。グループコードは'+r('選択','せんたく')+'（'+r('一度','いちど')+r('登録','とうろく')+'すると'+r('保持','ほじ')+'）。',
      s1_h2conn: '① '+r('データベース','')+r('接続','せつぞく'),
      s1_lblUrl: 'Project URL',
      s1_lblKey: 'anon key',
      s1_connHint: r('入力','にゅうりょく')+'した'+r('情報','じょうほう')+'はこのパソコンのブラウザにのみ'+r('保存','ほぞん')+'されます。'+r('公開','こうかい')+'されても'+r('安全','あんぜん')+'なキーなので'+r('安心','あんしん')+'してください。',
      s1_btnRun: r('データ','')+r('登録','とうろく'),
      s1_btnHome: r('現場','げんば')+r('運営','うんえい')+'へ →',
      s1_doneTitle: r('データ','')+r('登録','とうろく')+r('完了','かんりょう'),
      s1_btnStay: r('閉','と')+'じる',
      s1_btnClear: r('画面クリア','がめんクリア'),
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

      /* settle (현장 정산) */
      st_step: r('精算','せいさん')+' · '+r('御','ご')+r('請求','せいきゅう'),
      st_connHint: r('接続','せつぞく')+r('情報','じょうほう')+'はこのブラウザにのみ'+r('保存','ほぞん')+'されます。',
      st_sessionLabel: r('対象','たいしょう')+r('月','つき'),
      st_btnLoad: r('読','よ')+'み'+r('込','こ')+'み',
      st_btnOpen: '＋ '+r('精算','せいさん')+r('口座','こうざ')+'を'+r('開','ひら')+'く',
      st_btnSales: r('売上','うりあげ')+r('要約','ようやく'),
      st_taxHint: r('価格','かかく')+'は'+r('税込','ぜいこみ')+'('+r('内税','うちぜい')+'10%) · '+r('通貨','つうか')+'：'+r('円','えん')+'(JPY)',
      st_colFolios: r('精算','せいさん')+r('口座','こうざ'),
      st_emptyFolios: r('対象','たいしょう')+r('月','つき')+'を'+r('読','よ')+'み'+r('込','こ')+'んでください。',
      st_colDetail: r('明細','めいさい'),
      st_selectFolio: r('左','ひだり')+'から'+r('精算','せいさん')+r('口座','こうざ')+'を'+r('選','えら')+'んでください。',
      st_btnStatement: r('御','ご')+r('請求','せいきゅう')+r('書','しょ'),
      st_btnClose: r('締','し')+'める',
      st_btnSettle: r('決済','けっさい')+r('完了','かんりょう'),
      st_btnReopen: r('再','さい')+r('開','かい'),
      st_addCharge: r('請求','せいきゅう')+r('追加','ついか'),
      st_phDesc: r('内訳','うちわけ')+'（'+r('例','れい')+'：'+r('追加','ついか')+'ラウンド）',
      st_add: r('追加','ついか'),
      st_payments: 'お'+r('支払','しはら')+'い',
      st_phReceiver: r('担当者','たんとうしゃ'),
      st_subtotal: r('小計','しょうけい')+'('+r('税抜','ぜいぬき')+')',
      st_tax: r('消費税','しょうひぜい')+'('+r('内税','うちぜい')+'10%)',
      st_grand: r('御','ご')+r('請求','せいきゅう')+r('合計','ごうけい'),
      st_paid: r('入金','にゅうきん'),
      st_balance: r('残額','ざんがく'),

      /* pos (간이 POS 주문 입력) */
      po_step: r('注文','ちゅうもん')+r('入力','にゅうりょく')+' · '+r('簡易','かんい')+'POS',
      po_dateLabel: r('日付','ひづけ'),
      po_btnLoad: r('読','よ')+'み'+r('込','こ')+'み',
      po_btnBack: '← '+r('チーム','')+r('選択','せんたく')+'に'+r('戻','もど')+'る',
      po_pickTeam: r('チーム','')+'を'+r('選','えら')+'んでください',
      po_emptyTeams: r('該当','がいとう')+r('日','び')+'に'+r('滞在','たいざい')+r('中','ちゅう')+'のチームがありません。',
      po_cntTeam: r('チーム',''),
      po_cntPpl: r('名','めい'),
      po_runningTotal: 'このチーム'+r('累計','るいけい'),
      po_allVenues: r('全','すべ')+'て',
      po_emptyMenu: 'メニューがありません（10_pos_menu.sql）。',
      po_manualPrice: r('金額','きんがく')+r('手','て')+r('入力','にゅうりょく'),
      po_cart: r('注文','ちゅうもん')+'カート',
      po_cartEmpty: 'メニューをタップして'+r('追加','ついか')+'。',
      po_subtotal: r('小計','しょうけい')+'('+r('税抜','ぜいぬき')+')',
      po_tax: r('消費税','しょうひぜい')+'('+r('内税','うちぜい')+'10%)',
      po_total: r('合計','ごうけい'),
      po_send: r('注文','ちゅうもん')+'を'+r('送信','そうしん'),

      /* kitchen (주방 화면 KDS) */
      ki_step: r('厨房','ちゅうぼう')+r('画面','がめん')+' · KDS',
      ki_waiting: r('待','ま')+'ち',
      ki_stKitchen: r('厨房','ちゅうぼう'),
      ki_stBar: 'ドリンクバー',
      ki_stAll: r('全','すべ')+'て',
      ki_auto: r('自動','じどう')+r('更新','こうしん'),
      ki_refresh: r('更新','こうしん'),
      ki_updated: r('更新','こうしん'),
      ki_connectFirst: r('接続','せつぞく')+'してください。',
      ki_empty: r('注文','ちゅうもん')+'はありません 🎉',
      ki_done: r('完了','かんりょう'),
      ki_accept: r('受付','うけつけ'),
      ki_cooking: r('調理中','ちょうりちゅう'),
      ki_ago: r('前','まえ'),
      ki_sec: r('秒','びょう'),
      ki_min: r('分','ふん'),

      /* menu (메뉴 관리) */
      me_step: 'メニュー'+r('管理','かんり'),
      me_addTitle: '＋ '+r('新','あたら')+'しいメニュー',
      me_bulkTitle: '📋 '+r('一括','いっかつ')+r('貼','は')+'り'+r('付','つ')+'け（メニュー'+r('表','ひょう')+'をまとめて'+r('入力','にゅうりょく')+'）',
      me_bulkFmt: '1'+r('行','ぎょう')+'＝ <code>'+r('日本語名','にほんごめい')+', '+r('韓国語名','かんこくごめい')+', '+r('区分','くぶん')+', '+r('場所','ばしょ')+', station, '+r('単価','たんか')+', code</code> （カンマ/タブ'+r('区切','くぎ')+'り・'+r('後半','こうはん')+'は'+r('省略','しょうりゃく')+'可）。station = kitchen / bar / none。',
      me_bulkAdd: r('一括','いっかつ')+r('追加','ついか'),
      me_listTitle: 'メニュー'+r('一覧','いちらん'),
      me_cntItem: r('件','けん'),
      me_empty: 'メニューがありません。'+r('上','うえ')+'から'+r('追加','ついか')+'してください。',
      me_connectFirst: r('接続','せつぞく')+'してください。',
      me_code: 'コード',
      me_nameJa: r('日本語名','にほんごめい'),
      me_nameKo: r('韓国語名','かんこくごめい'),
      me_cat: r('区分','くぶん'),
      me_venue: r('場所','ばしょ'),
      me_station: 'station',
      me_price: r('単価','たんか')+'(¥)',
      me_sort: r('順','じゅん'),
      me_active: r('有効','ゆうこう'),
      me_add: r('追加','ついか'),
      me_save: r('保存','ほぞん'),
      me_del: r('削除','さくじょ'),
    },
    ko: {
      brandSub: 'Yamanami 운영 관리 시스템',
      reset: '초기화',
      home: '홈',
      navStep1: '① 등록',
      navRoom: '② 방배정',
      navHome: '← 현장 운영',
      rm_member: '회원',
      rm_nonmember: '비회원',
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
      ix_c1Req: '필수',
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
      ix_c5H: '현장 정산 (체크아웃 명세서)',
      ix_c5Cd: '손님 추가요금(연회·레스토랑·추가 라운딩·룸 등)을 정산 계정에 모아 체크아웃 시 명세서(御請求書)를 만듭니다. B2B 정산과 별개 레이어.',
      ix_c6H: '주문 입력 (간이 POS)',
      ix_c6Cd: '레스토랑·연회장·골프샵에서 직원이 태블릿으로 메뉴를 탭해 해당 팀에 바로 주문을 답니다. 합계는 정산 계정에 자동 반영됩니다.',
      ix_c7H: '주방 화면 (KDS)',
      ix_c7Cd: '주문 입력에서 주방행 음식만 주방 화면에 즉시 표시됩니다. 다 만들면 [완료]로 목록에서 지웁니다. 자동 새로고침.',
      ix_c8H: '메뉴 관리',
      ix_c8Cd: 'POS·주방 화면에서 쓰는 메뉴·단가·station을 등록/편집합니다. 메뉴판을 일괄 붙여넣기로 한 번에 입력할 수 있습니다.',
      ix_g3H: '인쇄물',
      ix_g3Desc: 'v13.4 통합 시스템 (단발성 출력)',
      ix_dBoard: '통합 보드판',
      ix_dBoardDesc: '전 부서 공유 · 오늘 요약',
      ix_dFront: '프론트·객실',
      ix_dFrontDesc: '방배정 · 객실',
      ix_dFnb: '식음 (F&B)',
      ix_dFnbDesc: 'POS · 주방 · 메뉴',
      ix_dGolf: '골프',
      ix_dGolfDesc: '코스·조편성 (준비중)',
      ix_dAcct: '회계',
      ix_dAcctDesc: '현지 정산',
      ix_cpH: '네임택 · 항공커버 · 정산',
      ix_cpCd: '한 번 뽑으면 끝나는 인쇄물은 기존 통합 시스템에서 생성합니다. 네임택·항공커버·송영·식사·골프표·현지정산표를 7개 탭에서 출력합니다.',
      ix_cpGo: '통합 시스템 열기',
      ix_foot: '<b>SaiZen Yamanami</b> · 구마모토 아소 야마나미 리조트 운영',

      s1_step: '데이터 등록',
      s1_regStatusDone: '이미 등록된 데이터가 있습니다',
      s1_regStatusHint: '새·변경 파일이 있을 때만 다시 올리면 됩니다',
      s1_sub: '엠클릭 예약 파일 등록',
      s1_lead: '예약 관련 2개 파일을 순서대로 올리면 자동으로 정리되어 저장됩니다. 같은 파일을 실수로 다시 올려도 중복되지 않으니 안심하세요. <b>올리는 순서</b>: 예약리스트 → 일행별예약. 그룹코드는 선택(한번 등록하면 유지됩니다).',
      s1_h2conn: '① 데이터베이스 연결',
      s1_lblUrl: 'Project URL',
      s1_lblKey: 'anon key',
      s1_connHint: '입력한 정보는 이 PC의 브라우저에만 저장됩니다. 공개돼도 안전한 키이니 안심하세요.',
      s1_btnRun: '데이터 등록',
      s1_btnHome: '현장 운영으로 →',
      s1_doneTitle: '데이터 등록 완료',
      s1_btnStay: '닫기',
      s1_btnClear: '화면 비우기',
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

      /* settle (현장 정산) */
      st_step: '정산 · 청구서',
      st_connHint: '연결 정보는 이 브라우저에만 저장됩니다.',
      st_sessionLabel: '대상 월',
      st_btnLoad: '불러오기',
      st_btnOpen: '＋ 정산계정 열기',
      st_btnSales: '매출 요약',
      st_taxHint: '가격은 세금포함(内税 10%) · 통화: 엔(JPY)',
      st_colFolios: '정산 계정',
      st_emptyFolios: '대상 월을 불러오세요.',
      st_colDetail: '명세',
      st_selectFolio: '왼쪽에서 정산 계정을 선택하세요.',
      st_btnStatement: '청구서(御請求書)',
      st_btnClose: '마감',
      st_btnSettle: '결제완료',
      st_btnReopen: '재개',
      st_addCharge: '청구 추가',
      st_phDesc: '내역 (예: 추가 라운딩)',
      st_add: '추가',
      st_payments: '결제',
      st_phReceiver: '담당자',
      st_subtotal: '소계(세전)',
      st_tax: '소비세(内税·포함 10%)',
      st_grand: '청구 합계',
      st_paid: '입금',
      st_balance: '잔액',

      /* pos (간이 POS 주문 입력) */
      po_step: '주문 입력 · 간이 POS',
      po_dateLabel: '날짜',
      po_btnLoad: '불러오기',
      po_btnBack: '← 팀 선택으로',
      po_pickTeam: '팀을 선택하세요',
      po_emptyTeams: '해당 날짜에 체류 중인 팀이 없습니다.',
      po_cntTeam: '팀',
      po_cntPpl: '명',
      po_runningTotal: '이 팀 누적',
      po_allVenues: '전체',
      po_emptyMenu: '메뉴가 없습니다 (10_pos_menu.sql 실행).',
      po_manualPrice: '금액 직접입력',
      po_cart: '주문 카트',
      po_cartEmpty: '메뉴를 탭해서 담으세요.',
      po_subtotal: '소계(세전)',
      po_tax: '소비세(内税·포함 10%)',
      po_total: '합계',
      po_send: '주문 전송',

      /* kitchen (주방 화면 KDS) */
      ki_step: '주방 화면 · KDS',
      ki_waiting: '대기',
      ki_stKitchen: '주방',
      ki_stBar: '드링크바',
      ki_stAll: '전체',
      ki_auto: '자동 새로고침',
      ki_refresh: '새로고침',
      ki_updated: '갱신',
      ki_connectFirst: '연결하세요.',
      ki_empty: '주문 없음 🎉',
      ki_done: '완료',
      ki_accept: '접수',
      ki_cooking: '조리중',
      ki_ago: ' 전',
      ki_sec: '초',
      ki_min: '분',

      /* menu (메뉴 관리) */
      me_step: '메뉴 관리',
      me_addTitle: '＋ 새 메뉴',
      me_bulkTitle: '📋 일괄 붙여넣기 (메뉴판을 한 번에 입력)',
      me_bulkFmt: '한 줄 = <code>일본어명, 한국어명, 구분, 장소, station, 단가, code</code> (콤마/탭 구분 · 뒤쪽은 생략 가능). station = kitchen(주방) / bar(드링크바) / none.',
      me_bulkAdd: '일괄 추가',
      me_listTitle: '메뉴 목록',
      me_cntItem: '건',
      me_empty: '메뉴가 없습니다. 위에서 추가하세요.',
      me_connectFirst: '연결하세요.',
      me_code: '코드',
      me_nameJa: '일본어명',
      me_nameKo: '한국어명',
      me_cat: '구분',
      me_venue: '장소',
      me_station: 'station',
      me_price: '단가(¥)',
      me_sort: '순서',
      me_active: '사용',
      me_add: '추가',
      me_save: '저장',
      me_del: '삭제',
    },
    en: {
      /* common */
      brandSub: 'Yamanami Operations Management System',
      reset: 'Reset',
      home: 'Home',
      navStep1: '① Register',
      navRoom: '② Room Assignment',
      navHome: '← Field Ops',
      rm_member: 'Member',
      rm_nonmember: 'Non-member',
      connState_none: 'Not connected',
      connState_ok: 'Connected',
      connState_fail: 'Connection failed',
      btnConnect: 'Test connection',
      btnConnectShort: 'Connect',

      /* index */
      ix_envBadge: 'Yamanami',
      ix_heroH: 'Yamanami Operations Management System',
      ix_heroP: 'An integrated system that takes Mclick reservation data and produces field operation deliverables.',
      ix_heroNote: 'Principle: <b>one dataset, many screens.</b> Each module is its own page but shares the same data.',
      ix_g1H: 'Data Prep',
      ix_g1Desc: 'Reservation file registration · change history',
      ix_c1Step: 'STEP 1',
      ix_c1H: 'Data Registration',
      ix_c1Req: 'Required',
      ix_c1Cd: 'Upload the two files — reservation list and per-companion reservations — and they are organized and saved automatically. Group codes are optional (kept once registered). Re-uploading the same file does not create duplicates.',
      ix_g2H: 'Field Operations',
      ix_g2Desc: 'Assign and settle using registered data',
      ix_c2Step: 'STEP 2',
      ix_c2H: 'Hotel Room Assignment',
      ix_c2Cd: 'Assigns each date\'s staying guests to rooms individually. Automatically validates capacity and date overlaps, and supports 2+2 split assignment for 4-person teams.',
      ix_goEnter: 'Enter',
      ix_soon: 'Planned',
      ix_c3H: 'Golf Rounding',
      ix_c3Cd: 'Round assignment by departure city, weekday, and lodging facility. Pulls up teams by date and assigns them with the same pattern as room assignment.',
      ix_c4H: 'Dinner',
      ix_c4Cd: 'Meal headcount and seating by date. Shares the same data.',
      ix_c5H: 'Field Settlement (Checkout)',
      ix_c5Cd: 'Collects guest extra charges (banquet, restaurant, extra rounds, room, etc.) into a folio and produces a checkout invoice. A separate layer from B2B settlement.',
      ix_c6H: 'Order Entry (Mini POS)',
      ix_c6Cd: 'At the restaurant, banquet hall, or pro shop, staff tap menu items on a tablet to charge them directly to the right team. Totals flow automatically into the folio.',
      ix_c7H: 'Kitchen Display (KDS)',
      ix_c7Cd: 'Food items routed to the kitchen appear instantly on the kitchen screen. Tap [Done] to clear them once cooked. Auto-refreshing.',
      ix_c8H: 'Menu Admin',
      ix_c8Cd: 'Register and edit the menu items, prices, and station used by the POS and kitchen display. Bulk-paste lets you enter a whole menu at once.',
      ix_g3H: 'Printouts',
      ix_g3Desc: 'v13.4 integrated system (one-off output)',
      ix_dBoard: 'Board',
      ix_dBoardDesc: 'All-dept sharing · today summary',
      ix_dFront: 'Front · Rooms',
      ix_dFrontDesc: 'Room assignment',
      ix_dFnb: 'F&B',
      ix_dFnbDesc: 'POS · Kitchen · Menu',
      ix_dGolf: 'Golf',
      ix_dGolfDesc: 'Course · grouping (soon)',
      ix_dAcct: 'Accounting',
      ix_dAcctDesc: 'Local settlement',
      ix_cpH: 'Name Tag · Air Cover · Settlement',
      ix_cpCd: 'One-off printouts are generated by the existing integrated system. Name tags, air covers, transfers, meals, golf sheets, and the local settlement sheet are output across seven tabs.',
      ix_cpGo: 'Open integrated system',
      ix_foot: '<b>SaiZen Yamanami</b> · Kumamoto Aso Yamanami Resort Operations',

      /* step1 */
      s1_step: 'Data Registration',
      s1_regStatusDone: 'Data is already registered',
      s1_regStatusHint: 'Re-upload only when files are new or changed',
      s1_sub: 'Mclick reservation file registration',
      s1_lead: 'Upload the two reservation files in order and they are organized and saved automatically. Re-uploading the same file by mistake does not create duplicates, so no worries. <b>Upload order</b>: reservation list → per-companion reservations. Group codes are optional (kept once registered).',
      s1_h2conn: '① Database connection',
      s1_lblUrl: 'Project URL',
      s1_lblKey: 'anon key',
      s1_connHint: 'What you enter is stored only in this PC\'s browser. It is a key that is safe even if exposed, so no worries.',
      s1_btnRun: 'Register Data',
      s1_btnHome: 'To Field Ops →',
      s1_doneTitle: 'Data Registration Complete',
      s1_btnStay: 'Close',
      s1_btnClear: 'Clear screen',
      s1_h2stats: 'Registration Result',
      s1_uploaderPh: 'Staff name',
      s1_h2history: 'Change History',
      s1_historyNote: 'Reservation / companion / team counts',
      s1_historyEmpty: 'No registration history',
      s1_dyn_histFail: 'Failed to record history',
      s1_statsNote: 'By matching the reservation list, per-companion reservations, and group codes, team-level and individual-level rosters are built automatically. Tag codes are also assigned automatically.',
      s1_h2log: 'Progress',
      s1_logWait: 'Waiting…',
      s1_slot_res_tag: 'Required · Master',
      s1_slot_res_name: 'Reservation List',
      s1_slot_res_desc: 'Team/reservation-level master (eventSeq · pax · amount · remarks). Download from Mclick "By departure date · by reservation date → Reservation status"; multiple files allowed when split at 500 rows.',
      s1_slot_ilhaeng_tag: 'Required · Individual roster',
      s1_slot_ilhaeng_name: 'Per-companion Reservations',
      s1_slot_ilhaeng_desc: 'Individual level (English name · date of birth · passport · flight). Download from Mclick "By departure date · by reservation date → Passenger info"; multiple files allowed when split at 500 rows.',
      s1_slot_member_tag: 'Optional · Kept',
      s1_slot_member_name: 'Group Codes',
      s1_slot_member_desc: 'Member group code matching table (Member_Assignment_Status). Kept once registered.',
      s1_dyn_memberCached: 'Saved · Kept',
      s1_dyn_filesMerged: 'files merged',
      s1_dropEmpty: 'Drag & drop a file or click',
      s1_dyn_rows: 'rows',
      s1_dyn_load: 'Load',
      s1_dyn_readFail: 'Read failed',
      s1_dyn_session: 'Session',
      s1_dyn_connNeedInput: 'Enter the URL and key',
      s1_dyn_connOk: 'Connection successful',
      s1_dyn_connFail: 'Connection failed',
      s1_dyn_runStart: 'Registration started · Session',
      s1_dyn_noDetect: '(not detected)',
      s1_dyn_grpMissing: 'No group code file — matching treated as non-member',
      s1_dyn_cases: 'cases',
      s1_dyn_teams: 'teams',
      s1_dyn_log_member: 'Member group codes',
      s1_dyn_log_booking: 'Reservation teams',
      s1_dyn_log_pax: 'Individual roster',
      s1_dyn_log_guests: 'Operation teams',
      s1_dyn_log_members: 'Operation individuals',
      s1_dyn_cntPpl: 'people',
      s1_dyn_cntTarget: 'Operation target',
      s1_dyn_error: 'Error',

      /* room */
      rm_step: 'STEP 2 · Hotel Room Assignment',
      rm_keyPlaceholder: 'API key (publishable or anon)',
      rm_connHint: 'Connection info is stored only in this browser.',
      rm_modeDay: 'Day view',
      rm_modeRange: 'Range view',
      rm_lblFrom: 'Date',
      rm_btnLoad: 'Load',
      rm_btnExport: '📥 Export template',
      rm_btnExportTitle: 'Export the current assignment status to Excel',
      rm_btnImport: '📤 Bulk assign',
      rm_btnImportTitle: 'Upload an Excel with room numbers filled in to bulk-assign',
      rm_selClear: 'Clear selection',
      rm_selHint: '→ Click a room card to bulk-assign',
      rm_legY: 'Yamanami',
      rm_legK: 'Kuju Hills',
      rm_legG: 'Guernsey Hotel',
      rm_legS: 'Shizunoyado',
      rm_colUnassigned: 'Unassigned teams',
      rm_colRooms: 'Room assignment',
      rm_emptyHint: 'Select a date and press [Load].',
      rm_cntTeam: 'teams',
      rm_cntPpl: 'people',
      rm_selectedSuffix: 'selected',
      rm_allAssigned: 'All guests assigned 🎉',

      /* settle (현장 정산) */
      st_step: 'Settlement · Invoice',
      st_connHint: 'Connection info is stored only in this browser.',
      st_sessionLabel: 'Month',
      st_btnLoad: 'Load',
      st_btnOpen: '＋ Open folio',
      st_btnSales: 'Sales summary',
      st_taxHint: 'Prices tax-included (10%) · Currency: JPY',
      st_colFolios: 'Folios',
      st_emptyFolios: 'Load a month to begin.',
      st_colDetail: 'Detail',
      st_selectFolio: 'Select a folio on the left.',
      st_btnStatement: 'Statement',
      st_btnClose: 'Close',
      st_btnSettle: 'Mark settled',
      st_btnReopen: 'Reopen',
      st_addCharge: 'Add charge',
      st_phDesc: 'Description (e.g. extra round)',
      st_add: 'Add',
      st_payments: 'Payments',
      st_phReceiver: 'Received by',
      st_subtotal: 'Subtotal (excl. tax)',
      st_tax: 'Consumption tax (incl. 10%)',
      st_grand: 'Total due',
      st_paid: 'Paid',
      st_balance: 'Balance',

      /* pos (간이 POS 주문 입력) */
      po_step: 'Order Entry · Mini POS',
      po_dateLabel: 'Date',
      po_btnLoad: 'Load',
      po_btnBack: '← Back to teams',
      po_pickTeam: 'Pick a team',
      po_emptyTeams: 'No teams staying on this date.',
      po_cntTeam: ' teams',
      po_cntPpl: 'p',
      po_runningTotal: 'Team running total',
      po_allVenues: 'All',
      po_emptyMenu: 'No menu items (run 10_pos_menu.sql).',
      po_manualPrice: 'Manual price',
      po_cart: 'Order cart',
      po_cartEmpty: 'Tap menu items to add.',
      po_subtotal: 'Subtotal (excl. tax)',
      po_tax: 'Consumption tax (incl. 10%)',
      po_total: 'Total',
      po_send: 'Send order',

      /* kitchen (주방 화면 KDS) */
      ki_step: 'Kitchen Display · KDS',
      ki_waiting: 'Waiting',
      ki_stKitchen: 'Kitchen',
      ki_stBar: 'Drink bar',
      ki_stAll: 'All',
      ki_auto: 'Auto refresh',
      ki_refresh: 'Refresh',
      ki_updated: 'Updated',
      ki_connectFirst: 'Please connect.',
      ki_empty: 'No orders 🎉',
      ki_done: 'Done',
      ki_accept: 'Accept',
      ki_cooking: 'Cooking',
      ki_ago: ' ago',
      ki_sec: 's',
      ki_min: 'm',

      /* menu (메뉴 관리) */
      me_step: 'Menu Admin',
      me_addTitle: '＋ New item',
      me_bulkTitle: '📋 Bulk paste (enter the whole menu at once)',
      me_bulkFmt: 'One line = <code>name_ja, name_ko, category, venue, station, price, code</code> (comma/tab separated · trailing fields optional). station = kitchen / bar / none.',
      me_bulkAdd: 'Add all',
      me_listTitle: 'Menu list',
      me_cntItem: '',
      me_empty: 'No menu items. Add some above.',
      me_connectFirst: 'Please connect.',
      me_code: 'Code',
      me_nameJa: 'Name (JA)',
      me_nameKo: 'Name (KO)',
      me_cat: 'Category',
      me_venue: 'Venue',
      me_station: 'station',
      me_price: 'Price (¥)',
      me_sort: 'Sort',
      me_active: 'Active',
      me_add: 'Add',
      me_save: 'Save',
      me_del: 'Delete',
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

  // fireHook=true 일 때만 페이지의 onSaizenLangChange 훅을 호출한다.
  // (페이지가 동적 DOM 번역용으로 apply()를 부를 때 훅을 다시 호출하면
  //  render()→apply()→onSaizenLangChange()→render() 무한 루프가 되므로 분리.)
  function applyLang(fireHook) {
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
    var lj = document.getElementById('so-lang-ja'), lk = document.getElementById('so-lang-ko'), le = document.getElementById('so-lang-en');
    if (lj) lj.classList.toggle('active', LANG === 'ja');
    if (lk) lk.classList.toggle('active', LANG === 'ko');
    if (le) le.classList.toggle('active', LANG === 'en');
    var fb = document.getElementById('so-furi');
    if (fb) {
      fb.style.display = (LANG === 'ja') ? '' : 'none';
      fb.textContent = 'ふりがな ' + (FURI ? 'ON' : 'OFF');
      fb.classList.toggle('on', FURI);
    }
    document.body.classList.toggle('furi-on', FURI && LANG === 'ja');
    // 언어/후리가나가 실제로 바뀐 경우에만(=fireHook) 페이지 동적 갱신 훅 호출.
    // 페이지 render() 안에서 부르는 apply()는 fireHook 없이 들어와 루프를 막는다.
    if (fireHook && typeof global.onSaizenLangChange === 'function') {
      try { global.onSaizenLangChange(LANG); } catch (e) {}
    }
  }

  function setLang(l) { LANG = l; localStorage.setItem('saizen_lang', l); applyLang(true); }
  function toggleFuri() { FURI = !FURI; localStorage.setItem('saizen_furi', FURI ? '1' : '0'); applyLang(true); }

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

  // ── 담당자(식별 라벨) — 모든 ops 페이지 상단바에 주입. 수정이력 기록용.
  //    로그인 세션이 있으면 그 이름(가입 시 입력)을 우선 사용 → 로그인=담당자 통합.
  //    로그인 안 했으면 수기 위젯값(saizen_ops_user)을 사용.
  // ── 부서 키↔라벨(전 페이지 공유) — 권한·공지·작성자 프로필 공통 ──
  var SO_DEPTS = [
    ['front', '🛎 프론트·객실'],
    ['fnb',   '🍽 식음'],
    ['golf',  '🏌 골프'],
    ['acct',  '💴 회계']
  ];
  var _deptMap = {}; SO_DEPTS.forEach(function (d) { _deptMap[d[0]] = d[1]; });
  function deptLabelOf(k) { return k ? (_deptMap[k] || k) : ''; }
  global.__so_DEPTS = SO_DEPTS;
  global.__so_deptLabel = deptLabelOf;

  var _sessionName = '';
  function getUser() { return _sessionName || localStorage.getItem('saizen_ops_user') || ''; }
  global.__so_getUser = getUser;
  function escU(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mountUser() {
    var box = document.querySelector('.so-controls');
    if (!box || document.getElementById('so-user')) return;
    var wrap = document.createElement('div');
    wrap.className = 'so-user';
    wrap.id = 'so-user';
    wrap.title = '담당자 — 모든 변경이 이 이름으로 수정이력에 기록됩니다(인증 아님).';
    box.insertBefore(wrap, box.firstChild);
    renderUser(wrap);
  }
  function renderUser(wrap) {
    wrap = wrap || document.getElementById('so-user');
    if (!wrap) return;
    var name = getUser();
    if (name) {
      wrap.classList.remove('empty');
      wrap.innerHTML = '<span class="so-user-ic">👤</span>'
        + '<span class="so-user-greet"><b>' + escU(name) + '</b> 님 반갑습니다</span>'
        + '<button type="button" class="so-user-btn" id="so-user-edit">변경</button>';
      wrap.querySelector('#so-user-edit').addEventListener('click', function () { editUser(wrap, name); });
    } else {
      editUser(wrap, '');
    }
  }
  function editUser(wrap, cur) {
    wrap.classList.add('empty');
    wrap.innerHTML = '<span class="so-user-ic">👤</span>'
      + '<input id="so-user-in" class="so-user-in" type="text" placeholder="담당자명" autocomplete="off" spellcheck="false">'
      + '<button type="button" class="so-user-btn save" id="so-user-save">저장</button>';
    var inp = wrap.querySelector('#so-user-in');
    inp.value = cur || '';
    function save() {
      var v = inp.value.trim();
      if (!v) { inp.focus(); return; }
      localStorage.setItem('saizen_ops_user', v);
      renderUser(wrap);
    }
    wrap.querySelector('#so-user-save').addEventListener('click', save);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    try { inp.focus(); } catch (e) {}
  }

  // ── 로그인(Supabase Auth) — Stage 1: 비차단 로그인/로그아웃 컨트롤 ──
  //    RLS 강화(17_rls_harden.sql) 후엔 비로그인 시 데이터 접근이 막히므로
  //    여기서 로그인 수단을 제공한다. 페이지 사용 자체를 막지는 않는다(비차단).
  //    페이지의 supabase 클라이언트와 같은 origin·storageKey 라 로그인 세션을 공유한다.
  var _authClient = null;
  function authClient() {
    if (_authClient) return _authClient;
    if (!global.supabase) return null;
    var url = localStorage.getItem('saizen_sb_url') || '';
    var key = localStorage.getItem('saizen_sb_key') || '';
    if (!url || !key) return null;
    try { _authClient = global.supabase.createClient(url, key); } catch (e) { return null; }
    return _authClient;
  }
  function metaName(user) {   // 계정에 저장된 이름만(이메일 폴백 없음)
    var m = (user && user.user_metadata) || {};
    return m.name || m.full_name || '';
  }
  function sessionNameOf(user) {   // 표시·기록용(이름 없으면 이메일)
    return metaName(user) || (user && user.email) || '';
  }
  function mountAuth() {
    var box = document.querySelector('.so-controls');
    if (!box || document.getElementById('so-auth')) return;
    var c = authClient();
    if (!c) return;   // supabase 미로드/접속정보 없음(랜딩 등) → 표시 안 함
    var wrap = document.createElement('div');
    wrap.className = 'so-auth'; wrap.id = 'so-auth';
    box.insertBefore(wrap, box.firstChild);
    c.auth.getSession().then(function (res) {
      var u = res && res.data && res.data.session ? res.data.session.user : null;
      if (!u) { renderAuth(wrap, null, null); return; }
      var su = document.getElementById('so-user');
      if (su) su.style.display = 'none';
      // 마스터가 지정한 프로필(이름·부서·직급) 우선 → 첫 로그인 이름설정 강제 안 함.
      meAccess().then(function (acc) {
        var nm = (acc && acc.name) || metaName(u) || '';
        _sessionName = nm || (u.email || '');
        renderAuth(wrap, u, acc, nm);
      }).catch(function () {
        _sessionName = sessionNameOf(u);
        renderAuth(wrap, u, null, metaName(u));
      });
    }).catch(function () { renderAuth(wrap, null, null); });
  }
  function renderAuth(wrap, user, acc, knownName) {
    if (user && !knownName) {
      // 마스터가 이름 미지정 + 본인 메타도 없음 → 이름(담당자명)을 1회 설정.
      wrap.innerHTML = '<span class="so-auth-ic">🔐</span>'
        + '<input id="so-auth-nm" class="so-user-in" type="text" placeholder="이름(담당자명)" autocomplete="name" style="width:108px">'
        + '<button type="button" class="so-user-btn save" id="so-auth-nm-go">저장</button>';
      var nm = wrap.querySelector('#so-auth-nm');
      var go = function () { authSetName(nm.value.trim()); };
      wrap.querySelector('#so-auth-nm-go').addEventListener('click', go);
      nm.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      try { nm.focus(); } catch (e) {}
    } else if (user) {
      var sub = (acc && (acc.dept || acc.title))
        ? ' <span class="so-auth-sub" style="font-size:11px;color:var(--muted,#8a937c)">(' + escU([deptLabelOf(acc.dept), acc.title].filter(Boolean).join('·')) + ')</span>'
        : '';
      wrap.innerHTML = '<span class="so-auth-ic">🔐</span>'
        + '<span class="so-auth-email"><b>' + escU(knownName) + '</b> 님' + sub + '</span>'
        + '<button type="button" class="so-user-btn" id="so-auth-out">로그아웃</button>';
      wrap.querySelector('#so-auth-out').addEventListener('click', authLogout);
    } else {
      wrap.innerHTML = '<button type="button" class="so-user-btn save" id="so-auth-in">로그인</button>';
      wrap.querySelector('#so-auth-in').addEventListener('click', function () { authForm(wrap); });
    }
  }
  function authForm(wrap) {
    wrap.innerHTML =
        '<input id="so-auth-em" class="so-user-in" type="email" placeholder="이메일" autocomplete="username" style="width:128px">'
      + '<input id="so-auth-pw" class="so-user-in" type="password" placeholder="비밀번호" autocomplete="current-password" style="width:104px">'
      + '<button type="button" class="so-user-btn save" id="so-auth-go">로그인</button>';
    var em = wrap.querySelector('#so-auth-em'), pw = wrap.querySelector('#so-auth-pw');
    function go() { authLogin(em.value.trim(), pw.value); }
    wrap.querySelector('#so-auth-go').addEventListener('click', go);
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    try { em.focus(); } catch (e) {}
  }
  function authLogin(email, password) {
    var c = authClient(); if (!c || !email || !password) return;
    c.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
      if (res && res.error) { alert('로그인 실패: ' + res.error.message); return; }
      location.reload();
    }).catch(function (e) { alert('로그인 오류: ' + e.message); });
  }
  function authLogout() {
    var c = authClient(); if (!c) return;
    c.auth.signOut().then(function () { location.reload(); }).catch(function () { location.reload(); });
  }

  // ── 첫 로그인 이름 설정 — 초대받은 계정이 담당자명을 1회 저장(user_metadata.name). ──
  function authSetName(name) {
    var c = authClient(); if (!c) return;
    if (!name) return;
    c.auth.updateUser({ data: { name: name } }).then(function (res) {
      if (res && res.error) { alert('이름 저장 실패: ' + res.error.message); return; }
      location.reload();
    }).catch(function (e) { alert('이름 저장 오류: ' + e.message); });
  }

  // ── 접근 권한(me_access) 조회 — 캐시. {role, areas} 또는 null(미로그인). ──
  var _meP = null;
  function meAccess() {
    if (_meP) return _meP;
    var c = authClient();
    if (!c) { _meP = Promise.resolve(null); return _meP; }
    _meP = c.auth.getSession().then(function (r) {
      if (!r || !r.data || !r.data.session) return null;
      return c.rpc('me_access').then(function (rr) {
        if (rr.error || !rr.data || !rr.data[0]) return { role: 'staff', areas: [], name: '', dept: '', title: '' };
        var a = rr.data[0];
        return { role: a.role, areas: a.areas || [], name: a.name || '', dept: a.dept || '', title: a.title || '' };
      }).catch(function () { return { role: 'staff', areas: [], name: '', dept: '', title: '' }; });
    }).catch(function () { return null; });
    return _meP;
  }
  global.__so_meAccess = meAccess;
  global.__so_authClient = authClient;

  // ── 페이지 가드 — <body data-so-area="settle"> 선언 시, 권한 없으면 차단 오버레이. ──
  function showGuard(kind) {
    if (document.getElementById('so-guard')) return;
    var d = document.createElement('div');
    d.id = 'so-guard';
    d.setAttribute('style', 'position:fixed;inset:0;z-index:25;background:rgba(238,241,234,.97);display:flex;align-items:center;justify-content:center;text-align:center;padding:24px');
    var inner = (kind === 'login')
      ? '<div style="font-size:18px;font-weight:800;color:#3d5424">로그인이 필요합니다</div>'
        + '<div style="margin-top:10px;color:#566049;font-size:13.5px">상단 우측 <b>[로그인]</b> 으로 로그인하세요.</div>'
      : '<div style="font-size:18px;font-weight:800;color:#b13b2c">접근 권한이 없습니다</div>'
        + '<div style="margin-top:10px;color:#566049;font-size:13.5px">이 페이지 권한이 없습니다. 마스터(관리자)에게 문의하세요.</div>'
        + '<div style="margin-top:16px"><a href="../index.html" style="color:#3d5424;font-weight:700;text-decoration:none">← 홈으로</a></div>';
    d.innerHTML = '<div>' + inner + '</div>';
    document.body.appendChild(d);
  }
  function guardPage() {
    var area = document.body.getAttribute('data-so-area');
    if (!area) return;
    if (!authClient()) return;   // 접속정보 없음(이론상 내장으로 항상 있음)
    meAccess().then(function (acc) {
      if (!acc) { showGuard('login'); return; }                 // 미로그인
      if (area === 'admin') { if (acc.role === 'admin') return; showGuard('deny'); return; }
      if (acc.role === 'admin' || acc.role === 'manager') return; // 전 접근
      if ((acc.areas || []).indexOf(area) >= 0) return;          // 허용 영역
      showGuard('deny');
    });
  }

  // ── 연결 바 접기 — 키 내장 자동연결이라 평소엔 숨기고, 상태 칩 클릭으로 펼침/수정 ──
  function mountConnToggle() {
    var conn = document.querySelector('.conn');
    if (!conn || conn.getAttribute('data-so-collapsed')) return;
    conn.setAttribute('data-so-collapsed', '1');
    conn.style.display = 'none';
    // 내장 고정값이라 입력칸은 읽기전용(확인용). 실수·편집 방지. (키 교체는 코드 한 곳에서)
    ['sb-url', 'sb-key'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.readOnly = true; el.style.background = 'var(--surface3,#e9ede1)'; el.style.cursor = 'default'; }
    });
    var toggle = function () { conn.style.display = (conn.style.display === 'none') ? '' : 'none'; };
    var pill = document.getElementById('conn-state');
    if (pill) {
      pill.style.cursor = 'pointer';
      pill.title = '클릭: 연결 정보 보기(읽기전용)';
      pill.addEventListener('click', toggle);
    } else {
      var box = document.querySelector('.so-controls');
      if (box) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'so-user-btn'; b.textContent = '🔌';
        b.title = 'Supabase 연결 정보'; b.addEventListener('click', toggle);
        box.appendChild(b);
      }
    }
  }

  function boot() { mountUser(); mountAuth(); applyLang(); guardPage(); mountConnToggle(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
