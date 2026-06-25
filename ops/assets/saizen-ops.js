/* ════════════════════════════════════════════════════════════════
   SaiZen Ops 공통 모듈 — 다국어(日本語 기본 / 한국어 / English) + 후리가나 토글
   · /app/ 과 동일한 UX: 로고→홈, 언어 토글, ふりがな 토글
   · 멀티페이지 공유: ops/index.html, ops/hub/step1.html, ops/hub/room.html
   · 데이터 매칭 키워드(엑셀 컬럼명·시트명·시설 매칭·prefix 등)는 절대 건드리지 않음
   ════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // ── 초대/재설정 링크 URL을 파싱 시점에 캡처(어떤 코드가 해시를 소비하기 전에) ──
  //    supabase-js detectSessionInUrl 이 해시를 비우기 전에 잡아둔다.
  var _bootHash   = (location.hash   || '');
  var _bootSearch = (location.search || '');

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
      so_footer: r('本','ほん')+'サイトはメリットツアーが'+r('制作','せいさく')+'・'+r('提供','ていきょう')+'しています',
      so_privacy: r('個人情報','こじんじょうほう')+'の'+r('取扱','とりあつか')+'い',
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
      ix_heroH: 'Yamanami '+r('統合','とうごう')+r('運営','うんえい')+'プラットフォーム',
      ix_heroP: r('予約','よやく')+'データひとつで'+r('客室','きゃくしつ')+'・'+r('送迎','そうげい')+'・'+r('飲食','いんしょく')+'・'+r('精算','せいさん')+'まで — '+r('現場','げんば')+'のすべてをつなぐ'+r('統合','とうごう')+r('運営','うんえい')+'ハブ。',
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
      ix_posRest: 'レストラン・'+r('宴会','えんかい')+' POS',
      ix_posRestCd: r('飲食','いんしょく')+'・'+r('宴会','えんかい')+'の'+r('注文','ちゅうもん')+'を'+r('該当','がいとう')+r('チーム','')+'に'+r('付','つ')+'けます。'+r('厨房','ちゅうぼう')+r('行','ゆ')+'きは'+r('厨房','ちゅうぼう')+r('画面','がめん')+'へ。',
      ix_posFront: 'フロント'+r('売店','ばいてん')+' POS',
      ix_posFrontCd: r('変換','へんかん')+'プラグ・'+r('飲料','いんりょう')+'・'+r('シングル','')+r('追加','ついか')+'など、フロントの'+r('雑貨','ざっか')+'・'+r('追加','ついか')+r('料金','りょうきん')+'を'+r('精算','せいさん')+'に'+r('反映','はんえい')+'。',
      ix_posGolf: 'ゴルフショップ POS',
      ix_posGolfCd: r('手袋','てぶくろ')+'・ボール・'+r('帽子','ぼうし')+'など'+r('売店','ばいてん')+r('販売','はんばい')+'。9'+r('ホール','')+r('追加','ついか')+'も'+r('同','おな')+'じ'+r('精算','せいさん')+'に'+r('合算','がっさん')+'。',
      ix_c6Cd: 'レストラン・'+r('宴会場','えんかいじょう')+'・ゴルフショップで、'+r('係員','かかりいん')+'がタブレットでメニューをタップし'+r('該当','がいとう')+'チームに'+r('直接','ちょくせつ')+r('注文','ちゅうもん')+'を'+r('付','つ')+'けます。'+r('合計','ごうけい')+'は'+r('精算','せいさん')+r('口座','こうざ')+'に'+r('自動','じどう')+'で'+r('反映','はんえい')+'。',
      ix_c7H: r('厨房','ちゅうぼう')+r('画面','がめん')+'（KDS）',
      ix_c7Cd: r('注文','ちゅうもん')+r('入力','にゅうりょく')+'から'+r('厨房','ちゅうぼう')+r('行','ゆ')+'きの'+r('料理','りょうり')+'だけが'+r('厨房','ちゅうぼう')+r('画面','がめん')+'に'+r('即時','そくじ')+r('表示','ひょうじ')+'。'+r('作','つく')+'り'+r('終','お')+'えたら['+r('完了','かんりょう')+']でリストから'+r('消','け')+'します。',
      ix_kdsBar: 'バー・フロント'+r('画面','がめん'),
      ix_kdsBarCd: r('厨房','ちゅうぼう')+'への'+r('料理','りょうり')+'と'+r('バー','')+r('飲料','いんりょう')+'を'+r('両方','りょうほう')+r('表示','ひょうじ')+'。フロントが'+r('注文','ちゅうもん')+r('全体','ぜんたい')+'を'+r('把握','はあく')+'します。',
      ix_cBoard: ''+r('部署','ぶしょ')+r('連絡','れんらく')+'・'+r('今日','きょう')+r('要約','ようやく'),
      ix_cBoardCd: r('全部署','ぜんぶしょ')+'の'+r('連絡','れんらく')+' + '+r('今日','きょう')+'のチェックイン・'+r('注文','ちゅうもん')+'・'+r('売上','うりあげ')+r('自動','じどう')+r('要約','ようやく')+'。('+r('作成','さくせい')+'=マスター・'+r('管理','かんり')+r('担当','たんとう')+')',
      ix_cNotes: ''+r('運営','うんえい')+'メモ',
      ix_cNotesCd: 'チーム'+r('別','べつ')+'ラベル・'+r('山並','やまなみ')+'コース・'+r('備考','びこう')+'・メモを'+r('複数','ふくすう')+r('担当','たんとう')+'で'+r('共有','きょうゆう')+r('管理','かんり')+'('+r('変更','へんこう')+r('履歴','りれき')+r('含','ふく')+'む)。',
      ix_deptBoard: ''+r('部署','ぶしょ')+r('連絡','れんらく'),
      ix_gAdmin: r('管理','かんり')+'・マスター',
      ix_cAdmin: ''+r('権限','けんげん')+r('管理','かんり'),
      ix_cAdminCd: r('担当者','たんとうしゃ')+'アカウントの'+r('役割','やくわり')+'(マスター・'+r('管理','かんり')+r('担当','たんとう')+'・'+r('一般','いっぱん')+')と'+r('アクセス','')+'カードを'+r('指定','してい')+'します。',
      ix_cGroup: 'グループコード・'+r('会員','かいいん')+'マスター',
      ix_cGroupCd: r('会員','かいいん')+'グループコード('+r('氏名','しめい')+'+'+r('生年','せいねん')+'・'+r('等級','とうきゅう')+')を'+r('直接','ちょくせつ')+r('登録','とうろく')+'・'+r('検索','けんさく')+'・'+r('修正','しゅうせい')+'。'+r('個人','こじん')+r('情報','じょうほう')+'のためマスターのみ。',
      ix_annTag: 'お'+r('知','し')+'らせ',
      ix_boardOpen: 'ボードを'+r('開','ひら')+'く →',
      ix_loginH: 'ログインが'+r('必要','ひつよう')+'です',
      ix_loginP: r('右上','みぎうえ')+'の<b>[ログイン]</b>から'+r('入','はい')+'ってください。<br>アカウントはマスターが'+r('発行','はっこう')+'します。',
      ix_golfCart: 'カート'+r('配車','はいしゃ')+r('表','ひょう'),
      ix_golfCartCd: r('組','くみ')+r('別','べつ')+'カートの'+r('割','わ')+'り'+r('当','あ')+'て・'+r('管理','かんり')+'（'+r('準備','じゅんび')+r('中','ちゅう')+'）',
      ix_c8H: 'メニュー'+r('管理','かんり'),
      ix_c8Cd: 'POS・'+r('厨房','ちゅうぼう')+r('画面','がめん')+'で'+r('使','つか')+'うメニュー・'+r('単価','たんか')+'・station を'+r('登録','とうろく')+r('編集','へんしゅう')+'します。メニュー'+r('表','ひょう')+'を'+r('一括','いっかつ')+r('貼','は')+'り'+r('付','つ')+'けで'+r('入力','にゅうりょく')+'も'+r('可能','かのう')+'。',
      ix_g3H: r('印刷物','いんさつぶつ'),
      ix_g3Desc: 'v13.4'+r('統合','とうごう')+'システム（'+r('単発','たんぱつ')+r('出力','しゅつりょく')+'）',
      ix_gLegacyH: 'v13.4 '+r('統合','とうごう')+'システム',
      ix_gPrintDesc: r('単発','たんぱつ')+r('印刷','いんさつ')+r('出力','しゅつりょく')+'（step1'+r('基準','きじゅん')+'）',
      ix_cNametagH: 'ネームタグ '+r('印刷','いんさつ'),
      ix_cNametagCd: r('個人','こじん')+'ネームタグ（Askul 70×33.9mm 24'+r('面','めん')+'）',
      ix_cAircoverH: r('航空','こうくう')+'カバー'+r('置','お')+'き'+r('場','ば'),
      ix_cAircoverCd: r('チーム','')+r('別','べつ')+r('航空','こうくう')+'カバー（A5'+r('横','よこ')+'・1'+r('枚','まい')+'/'+r('組','くみ')+'）',
      ix_cDispatchH: r('現地','げんち')+r('手配書','てはいしょ'),
      ix_cDispatchCd: r('行事','ぎょうじ')+r('別','べつ')+r('手配書','てはいしょ')+'＋'+r('現地','げんち')+r('発生','はっせい')+r('分','ぶん')+r('記入','きにゅう')+r('表','ひょう')+'（A4'+r('両面','りょうめん')+'）',
      ix_cDinnerH: r('夕食','ゆうしょく')+'オーダー',
      ix_cDinnerCd: r('日付','ひづけ')+r('別','べつ')+r('夕食','ゆうしょく')+'オーダー（A3）＋'+r('朝','あさ')+'/'+r('昼','ひる')+'/'+r('夕','ゆう')+r('食数','しょくすう')+r('自動','じどう')+r('集計','しゅうけい'),
      ix_cSettleMeritH: r('現地','げんち')+r('精算','せいさん')+r('表','ひょう')+'（Merit B2B）',
      ix_cSettleMeritCd: 'メリットツアー↔SaiZen B2B'+r('精算','せいさん')+'（'+r('宿泊','しゅくはく')+'＋'+r('送迎','そうげい')+'）・'+r('控除','こうじょ')+'・xlsx',
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
      bd_step: r('部署','ぶしょ')+r('連絡','れんらく')+'・'+r('今日','きょう')+r('要約','ようやく'),
      bd_connHint: r('連絡','れんらく')+r('作成','さくせい')+'はマスター・'+r('管理','かんり')+r('担当','たんとう')+'のみ',
      bd_writeH: '✏ '+r('連絡','れんらく')+r('作成','さくせい'),
      bd_phTitle: r('題名','だいめい'),
      bd_phBody: r('内容','ないよう'),
      bd_deptLabel: r('部署','ぶしょ'),
      bd_allDept: r('全社','ぜんしゃ')+'('+r('共通','きょうつう')+')',
      bd_pin: ''+r('上部','じょうぶ')+r('固定','こてい'),
      bd_post: r('連絡','れんらく')+r('登録','とうろく'),
      bd_annH: ''+r('お知らせ','おしらせ'),
      bd_chipAll: r('全体','ぜんたい'),
      bd_emptyConn: r('接続','せつぞく')+r('後','ご')+'に'+r('表示','ひょうじ')+'されます。',
      bd_empty: r('登録','とうろく')+'された'+r('連絡','れんらく')+'がありません。',
      bd_unpin: r('固定','こてい')+r('解除','かいじょ'),
      bd_doPin: ''+r('固定','こてい'),
      bd_del: r('削除','さくじょ'),
      bd_today: r('今日','きょう')+r('要約','ようやく'),
      bd_ciTeam: 'チェックイン'+r('チーム',''),
      bd_coTeam: 'チェックアウト'+r('チーム',''),
      bd_orders: r('本日','ほんじつ')+r('注文','ちゅうもん'),
      bd_sales: r('本日','ほんじつ')+r('売上','うりあげ'),
      bd_taxIncl: r('税込','ぜいこみ'),
      bd_uTeam: 'チーム',
      bd_uPpl: r('名','めい'),
      bd_uCase: r('件','けん'),
      bd_writer: r('作成者','さくせいしゃ'),
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
      rm_btnLoad: '↻ '+r('更','こう')+r('新','しん'),
      rm_btnExport: ''+r('様式','ようしき')+r('書','か')+'き'+r('出','だ')+'し',
      rm_btnExportTitle: r('現在','げんざい')+'の'+r('配置','はいち')+r('状況','じょうきょう')+'をエクセルに'+r('書','か')+'き'+r('出','だ')+'し',
      rm_btnImport: ''+r('一括','いっかつ')+r('配置','はいち'),
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
      rm_allAssigned: r('全','すべ')+'ての'+r('人員','じんいん')+r('配置','はいち')+r('完了','かんりょう')+' ',

      /* settle (현장 정산) */
      st_step: r('精算','せいさん')+' · '+r('御','ご')+r('請求','せいきゅう'),
      st_connHint: r('接続','せつぞく')+r('情報','じょうほう')+'はこのブラウザにのみ'+r('保存','ほぞん')+'されます。',
      st_sessionLabel: r('対象','たいしょう')+r('月','つき'),
      st_btnLoad: '↻ '+r('更','こう')+r('新','しん'),
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
      po_btnLoad: '↻ '+r('更','こう')+r('新','しん'),
      po_btnBack: '← '+r('チーム','')+r('選択','せんたく')+'に'+r('戻','もど')+'る',
      po_pickTeam: r('チーム','')+'を'+r('選','えら')+'んでください',
      po_teamSearch: r('名前','なまえ')+'・'+r('部屋','へや')+r('番号','ばんごう')+'・'+r('代表者','だいひょうしゃ')+'・'+r('グループ','')+'コードで'+r('検索','けんさく'),
      po_active: r('注文','ちゅうもん')+r('中','ちゅう'),
      po_secTeam: r('チーム',''),
      po_secMember: r('同行者','どうこうしゃ'),
      po_checkin: 'チェックイン',
      po_dupHint: r('同名','どうめい')+'はチームで'+r('区別','くべつ'),
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
      ki_stFront: 'バー・フロント',
      ki_auto: r('自動','じどう')+r('更新','こうしん'),
      ki_refresh: r('更新','こうしん'),
      ki_updated: r('更新','こうしん'),
      ki_connectFirst: r('接続','せつぞく')+'してください。',
      ki_empty: r('注文','ちゅうもん')+'はありません ',
      ki_done: r('完了','かんりょう'),
      ki_accept: r('受付','うけつけ'),
      ki_cooking: r('調理中','ちょうりちゅう'),
      ki_ago: r('前','まえ'),
      ki_sec: r('秒','びょう'),
      ki_min: r('分','ふん'),

      /* menu (메뉴 관리) */
      me_step: 'メニュー'+r('管理','かんり'),
      me_addTitle: '＋ '+r('新','あたら')+'しいメニュー',
      me_bulkTitle: ''+r('一括','いっかつ')+r('貼','は')+'り'+r('付','つ')+'け（メニュー'+r('表','ひょう')+'をまとめて'+r('入力','にゅうりょく')+'）',
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
      so_footer: '본 사이트는 메리트투어가 제작·제공합니다',
      so_privacy: '개인정보처리방침',
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
      ix_heroH: 'Yamanami 통합 운영 플랫폼',
      ix_heroP: '예약 데이터 한 번으로 객실·송영·식음·정산까지 — 현장의 모든 흐름을 잇는 통합 운영 허브.',
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
      ix_posRest: '레스토랑·연회 POS',
      ix_posRestCd: '식음·연회 주문을 해당 팀에 답니다. 주방행은 주방 화면으로. 합계는 정산에 자동 반영.',
      ix_posFront: '프론트 매점 POS',
      ix_posFrontCd: '110V 변환 어댑터(돼지코)·음료·싱글룸 추가 등 프론트 잡화·추가요금을 정산에 반영합니다.',
      ix_posGolf: '골프샵 POS',
      ix_posGolfCd: '장갑·볼·모자 등 매점 판매. 9홀 추가도 같은 정산에 합산됩니다.',
      ix_c6Cd: '레스토랑·연회장·골프샵에서 직원이 태블릿으로 메뉴를 탭해 해당 팀에 바로 주문을 답니다. 합계는 정산 계정에 자동 반영됩니다.',
      ix_c7H: '주방 화면 (KDS)',
      ix_c7Cd: '주문 입력에서 주방행 음식만 주방 화면에 즉시 표시됩니다. 다 만들면 [완료]로 목록에서 지웁니다. 자동 새로고침.',
      ix_kdsBar: '바·프론트 화면',
      ix_kdsBarCd: '주방 음식 + 바 음료를 함께 표시. 레스토랑 프론트가 주문 전체를 확인합니다.',
      ix_cBoard: '부서 공지 · 오늘 요약',
      ix_cBoardCd: '전 부서 공지사항 + 오늘 체크인·주문·매출 자동 요약. (공지 작성=마스터·관리담당)',
      ix_cNotes: '팀 운영 메모',
      ix_cNotesCd: '팀별 라벨·야마나미 코스·비고·메모를 여러 담당자가 공유 관리(수정이력 포함).',
      ix_deptBoard: '부서 공지',
      ix_gAdmin: '관리 · 마스터',
      ix_cAdmin: '권한 관리',
      ix_cAdminCd: '담당자 계정의 역할(마스터·관리담당·일반)과 접근 카드를 지정합니다.',
      ix_cGroup: '그룹코드 · 회원 마스터',
      ix_cGroupCd: '회원 그룹코드(성명+생년·등급)를 직접 등록·검색·수정합니다. 개인정보라 마스터만 사용.',
      ix_annTag: '공지',
      ix_boardOpen: '보드 열기 →',
      ix_loginH: '로그인이 필요합니다',
      ix_loginP: '상단 우측 <b>[로그인]</b> 으로 로그인하세요.<br>계정은 마스터(관리자)가 발급합니다.',
      ix_golfCart: '카트 배정표',
      ix_golfCartCd: '조별 카트 배정·관리 (준비중)',
      ix_c8H: '메뉴 관리',
      ix_c8Cd: 'POS·주방 화면에서 쓰는 메뉴·단가·station을 등록/편집합니다. 메뉴판을 일괄 붙여넣기로 한 번에 입력할 수 있습니다.',
      ix_g3H: '인쇄물',
      ix_g3Desc: 'v13.4 통합 시스템 (단발성 출력)',
      ix_gLegacyH: 'v13.4 통합 시스템',
      ix_gPrintDesc: '단발 인쇄 출력 (step1 데이터 기준)',
      ix_cNametagH: '네임택 인쇄',
      ix_cNametagCd: '개인 네임택 라벨(Askul 70×33.9mm 24면) — step1 태그코드 기준',
      ix_cAircoverH: '항공커버',
      ix_cAircoverCd: '팀별 항공커버 카드(A5 가로 1장/팀) — step1 태그코드·항공편 기준',
      ix_cDispatchH: '현지 수배서',
      ix_cDispatchCd: '행사별 수배서＋현지 발생분 기입표(A4 양면) — step1 데이터 기준',
      ix_cDinnerH: '석식 오더',
      ix_cDinnerCd: '날짜별 석식 오더(A3 가로)＋조/중/석 식수 자동집계 — step1 데이터 기준',
      ix_cSettleMeritH: '현지 정산표 (메리트 B2B)',
      ix_cSettleMeritCd: '메리트투어↔사이젠 B2B 정산(숙박＋송영)·차감·정산액·xlsx',
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
      bd_step: '부서 공지 · 오늘 요약',
      bd_connHint: '공지 작성은 마스터·관리담당만 가능합니다.',
      bd_writeH: '✏ 공지 작성',
      bd_phTitle: '제목',
      bd_phBody: '내용',
      bd_deptLabel: '부서',
      bd_allDept: '전사(공통)',
      bd_pin: '상단 고정',
      bd_post: '공지 등록',
      bd_annH: '공지사항',
      bd_chipAll: '전체',
      bd_emptyConn: '연결 후 표시됩니다.',
      bd_empty: '등록된 공지가 없습니다.',
      bd_unpin: '고정 해제',
      bd_doPin: '고정',
      bd_del: '삭제',
      bd_today: '오늘 요약',
      bd_ciTeam: '체크인 팀',
      bd_coTeam: '체크아웃 팀',
      bd_orders: '오늘 주문',
      bd_sales: '오늘 매출',
      bd_taxIncl: '税込',
      bd_uTeam: '팀',
      bd_uPpl: '명',
      bd_uCase: '건',
      bd_writer: '작성자',
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
      rm_btnLoad: '↻ 새로고침',
      rm_btnExport: '양식 내보내기',
      rm_btnExportTitle: '현재 배정 현황을 엑셀로 내보내기',
      rm_btnImport: '일괄 배정',
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
      rm_allAssigned: '모든 인원 배정 완료 ',

      /* settle (현장 정산) */
      st_step: '정산 · 청구서',
      st_connHint: '연결 정보는 이 브라우저에만 저장됩니다.',
      st_sessionLabel: '대상 월',
      st_btnLoad: '↻ 새로고침',
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
      po_btnLoad: '↻ 새로고침',
      po_btnBack: '← 팀 선택으로',
      po_pickTeam: '팀을 선택하세요',
      po_teamSearch: '이름·호수·대표자·그룹코드로 검색',
      po_active: '주문중',
      po_secTeam: '팀',
      po_secMember: '일행',
      po_checkin: '체크인',
      po_dupHint: '동명이인은 팀으로 구분',
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
      ki_stFront: '바·프론트',
      ki_auto: '자동 새로고침',
      ki_refresh: '새로고침',
      ki_updated: '갱신',
      ki_connectFirst: '연결하세요.',
      ki_empty: '주문 없음 ',
      ki_done: '완료',
      ki_accept: '접수',
      ki_cooking: '조리중',
      ki_ago: ' 전',
      ki_sec: '초',
      ki_min: '분',

      /* menu (메뉴 관리) */
      me_step: '메뉴 관리',
      me_addTitle: '＋ 새 메뉴',
      me_bulkTitle: '일괄 붙여넣기 (메뉴판을 한 번에 입력)',
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
      so_footer: 'This site is built &amp; provided by Merit Tour',
      so_privacy: 'Privacy Policy',
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
      ix_heroH: 'Yamanami Integrated Operations Platform',
      ix_heroP: 'One reservation import drives rooms, transfers, dining, and settlement — the unified hub connecting every part of on-site operations.',
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
      ix_posRest: 'Restaurant·Banquet POS',
      ix_posRestCd: 'Charge food & banquet orders to the right team. Kitchen items go to the kitchen display. Totals flow into the folio.',
      ix_posFront: 'Front Store POS',
      ix_posFrontCd: 'Front-desk sundries & extras — plug adapters, drinks, single-room add-ons — posted to the folio.',
      ix_posGolf: 'Pro Shop POS',
      ix_posGolfCd: 'Shop sales — gloves, balls, caps. Extra 9 holes settle into the same folio too.',
      ix_c6Cd: 'At the restaurant, banquet hall, or pro shop, staff tap menu items on a tablet to charge them directly to the right team. Totals flow automatically into the folio.',
      ix_c7H: 'Kitchen Display (KDS)',
      ix_c7Cd: 'Food items routed to the kitchen appear instantly on the kitchen screen. Tap [Done] to clear them once cooked. Auto-refreshing.',
      ix_kdsBar: 'Bar·Front Display',
      ix_kdsBarCd: 'Shows kitchen food + bar drinks together, so the restaurant front sees the whole order.',
      ix_cBoard: 'Dept Notices · Today',
      ix_cBoardCd: 'All-dept notices + today’s check-ins, orders, sales auto-summary. (Post = master/manager)',
      ix_cNotes: 'Team Ops Memo',
      ix_cNotesCd: 'Shared team labels, Yamanami course, remarks & memos across staff (with change history).',
      ix_deptBoard: 'Dept notices',
      ix_gAdmin: 'Admin · Master',
      ix_cAdmin: 'Access Control',
      ix_cAdminCd: 'Assign each account’s role (master/manager/staff) and accessible cards.',
      ix_cGroup: 'Group Codes · Members',
      ix_cGroupCd: 'Register, search, and edit member group codes (name+birth, grade). Master only (personal data).',
      ix_annTag: 'Notice',
      ix_boardOpen: 'Open board →',
      ix_loginH: 'Login required',
      ix_loginP: 'Log in via <b>[Login]</b> at top right.<br>Accounts are issued by the master.',
      ix_golfCart: 'Cart Assignment',
      ix_golfCartCd: 'Cart assignment & management per group (soon)',
      ix_c8H: 'Menu Admin',
      ix_c8Cd: 'Register and edit the menu items, prices, and station used by the POS and kitchen display. Bulk-paste lets you enter a whole menu at once.',
      ix_g3H: 'Printouts',
      ix_g3Desc: 'v13.4 integrated system (one-off output)',
      ix_gLegacyH: 'v13.4 Integrated System',
      ix_gPrintDesc: 'One-off print outputs (from step1 data)',
      ix_cNametagH: 'Name Tag Printing',
      ix_cNametagCd: 'Personal name-tag labels (Askul 70×33.9mm, 24/sheet) — from step1 tag codes',
      ix_cAircoverH: 'Air Cover',
      ix_cAircoverCd: 'Per-team air-cover cards (A5 landscape, 1/team) — from step1 tag codes & flights',
      ix_cDispatchH: 'Field Dispatch Sheet',
      ix_cDispatchCd: 'Per-event dispatch sheet + on-site charge form (A4 duplex) — from step1 data',
      ix_cDinnerH: 'Dinner Order',
      ix_cDinnerCd: 'Daily dinner order (A3) + auto breakfast/lunch/dinner counts — from step1 data',
      ix_cSettleMeritH: 'Local Settlement (Merit B2B)',
      ix_cSettleMeritCd: 'Merit Tour↔SaiZen B2B settlement (lodging+transfer), deductions, xlsx',
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
      bd_step: 'Dept notices · Today summary',
      bd_connHint: 'Only master/manager can post notices.',
      bd_writeH: '✏ New notice',
      bd_phTitle: 'Title',
      bd_phBody: 'Body',
      bd_deptLabel: 'Dept',
      bd_allDept: 'All (company-wide)',
      bd_pin: 'Pin to top',
      bd_post: 'Post notice',
      bd_annH: 'Notices',
      bd_chipAll: 'All',
      bd_emptyConn: 'Shown after connecting.',
      bd_empty: 'No notices yet.',
      bd_unpin: 'Unpin',
      bd_doPin: 'Pin',
      bd_del: 'Delete',
      bd_today: 'Today summary',
      bd_ciTeam: 'Check-in teams',
      bd_coTeam: 'Check-out teams',
      bd_orders: 'Orders today',
      bd_sales: 'Sales today',
      bd_taxIncl: 'tax incl.',
      bd_uTeam: 'teams',
      bd_uPpl: 'ppl',
      bd_uCase: '',
      bd_writer: 'Author',
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
      rm_btnLoad: '↻ Refresh',
      rm_btnExport: 'Export template',
      rm_btnExportTitle: 'Export the current assignment status to Excel',
      rm_btnImport: 'Bulk assign',
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
      rm_allAssigned: 'All guests assigned ',

      /* settle (현장 정산) */
      st_step: 'Settlement · Invoice',
      st_connHint: 'Connection info is stored only in this browser.',
      st_sessionLabel: 'Month',
      st_btnLoad: '↻ Refresh',
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
      po_btnLoad: '↻ Refresh',
      po_btnBack: '← Back to teams',
      po_pickTeam: 'Pick a team',
      po_teamSearch: 'Search by name, room no., rep, or group code.',
      po_active: 'ordering',
      po_secTeam: 'Teams',
      po_secMember: 'Members',
      po_checkin: 'check-in',
      po_dupHint: 'same names told apart by team',
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
      ki_stFront: 'Bar·Front',
      ki_auto: 'Auto refresh',
      ki_refresh: 'Refresh',
      ki_updated: 'Updated',
      ki_connectFirst: 'Please connect.',
      ki_empty: 'No orders ',
      ki_done: 'Done',
      ki_accept: 'Accept',
      ki_cooking: 'Cooking',
      ki_ago: ' ago',
      ki_sec: 's',
      ki_min: 'm',

      /* menu (메뉴 관리) */
      me_step: 'Menu Admin',
      me_addTitle: '＋ New item',
      me_bulkTitle: 'Bulk paste (enter the whole menu at once)',
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
    ['front', '프론트·객실'],
    ['fnb',   '식음'],
    ['golf',  '골프'],
    ['acct',  '회계']
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
      wrap.innerHTML = '<span class="so-user-ic"></span>'
        + '<span class="so-user-greet"><b>' + escU(name) + '</b> 님 반갑습니다</span>'
        + '<button type="button" class="so-user-btn" id="so-user-edit">변경</button>';
      wrap.querySelector('#so-user-edit').addEventListener('click', function () { editUser(wrap, name); });
    } else {
      editUser(wrap, '');
    }
  }
  function editUser(wrap, cur) {
    wrap.classList.add('empty');
    wrap.innerHTML = '<span class="so-user-ic"></span>'
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
    if (user) {
      // 담당자명은 계정 생성/관리 때 admin이 지정한다(admin.html). 사용자 자가 입력 없음.
      // 이름 미지정이면 이메일로 표기.
      wrap.style.display = '';
      var label = knownName || (user.email || '');
      var sub = (acc && (acc.dept || acc.title))
        ? ' <span class="so-auth-sub" style="font-size:11px;color:var(--muted,#8a937c)">(' + escU([deptLabelOf(acc.dept), acc.title].filter(Boolean).join('·')) + ')</span>'
        : '';
      wrap.innerHTML = '<span class="so-auth-ic"></span>'
        + '<span class="so-auth-email"><b>' + escU(label) + '</b> 님' + sub + '</span>'
        + '<button type="button" class="so-user-btn" id="so-auth-out">로그아웃</button>';
      wrap.querySelector('#so-auth-out').addEventListener('click', authLogout);
    } else {
      // 로그인은 가운데 카드(게이트)에서만 받는다 — 상단 [로그인] 버튼 제거
      wrap.innerHTML = '';
      wrap.style.display = 'none';
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

  // ── 가운데 정식 로그인 카드 — 게이트(랜딩·페이지 가드) 공용. 이메일·비번 칸을 처음부터 노출. ──
  function loginCard() {
    var card = document.createElement('div');
    card.className = 'so-login-card';
    card.setAttribute('style', 'background:var(--surface,#fff);border:1px solid var(--border2,#bcc4ad);border-radius:14px;box-shadow:0 12px 44px rgba(31,42,24,.16);padding:30px 28px;width:330px;max-width:92vw;text-align:center');
    renderLogin(card);
    return card;
  }
  global.__so_loginCard = loginCard;
  function lcInput() { return 'padding:11px 13px;border:1px solid var(--border2,#bcc4ad);border-radius:9px;font-size:14px;font-family:inherit;background:var(--surface,#fff);color:var(--text,#1f2a18);width:100%'; }
  function lcBtn() { return 'width:100%;padding:11px;border:1px solid var(--accent,#647548);background:var(--accent,#647548);color:#fff;font-weight:800;font-size:14.5px;border-radius:9px;cursor:pointer;font-family:inherit'; }
  function lcLink() { return 'color:var(--accent,#647548);font-weight:700;font-size:12px;text-decoration:none;cursor:pointer'; }

  function renderLogin(card) {
    var savedEm = '';
    try { savedEm = localStorage.getItem('saizen_last_email') || ''; } catch (e) {}
    card.innerHTML =
        '<div style="font-size:20px;font-weight:800;color:var(--accent,#647548);letter-spacing:-.01em">로그인</div>'
      + '<div style="margin-top:6px;color:var(--text2,#566049);font-size:12.5px">Yamanami 운영 관리 시스템</div>'
      + '<input id="so-lc-em" type="email" placeholder="이메일" autocomplete="username" spellcheck="false" value="' + escU(savedEm) + '" style="margin-top:18px;' + lcInput() + '">'
      + '<input id="so-lc-pw" type="password" placeholder="비밀번호" autocomplete="current-password" style="margin-top:10px;' + lcInput() + '">'
      + '<label style="display:flex;align-items:center;gap:6px;margin-top:11px;font-size:12.5px;color:var(--text2,#566049);cursor:pointer;user-select:none">'
      + '<input id="so-lc-rm" type="checkbox"' + (savedEm ? ' checked' : '') + ' style="width:15px;height:15px;accent-color:var(--accent,#647548);cursor:pointer">아이디 기억</label>'
      + '<div id="so-lc-err" style="display:none;margin-top:10px;color:#b13b2c;font-size:12.5px;font-weight:600"></div>'
      + '<button type="button" id="so-lc-go" style="margin-top:14px;' + lcBtn() + '">로그인</button>'
      + '<div style="margin-top:14px;color:var(--muted,#8a937c);font-size:11.5px">계정은 마스터(관리자)가 발급합니다.</div>'
      + '<div style="margin-top:6px"><a id="so-lc-req" style="' + lcLink() + '">처음이세요? 가입(계정) 요청 →</a></div>';
    var em = card.querySelector('#so-lc-em'), pw = card.querySelector('#so-lc-pw'),
        rm = card.querySelector('#so-lc-rm'),
        err = card.querySelector('#so-lc-err'), btn = card.querySelector('#so-lc-go');
    function fail(msg) { err.textContent = msg; err.style.display = 'block'; btn.disabled = false; btn.textContent = '로그인'; }
    function go() {
      var c = authClient(); var e = em.value.trim(), p = pw.value;
      if (!c) { fail('연결 정보가 없습니다.'); return; }
      if (!e || !p) { fail('이메일과 비밀번호를 입력하세요.'); return; }
      err.style.display = 'none'; btn.disabled = true; btn.textContent = '로그인 중…';
      try { if (rm.checked) localStorage.setItem('saizen_last_email', e); else localStorage.removeItem('saizen_last_email'); } catch (ex) {}
      c.auth.signInWithPassword({ email: e, password: p }).then(function (res) {
        if (res && res.error) { fail('로그인 실패: ' + res.error.message); return; }
        location.reload();
      }).catch(function (ex) { fail('로그인 오류: ' + ex.message); });
    }
    btn.addEventListener('click', go);
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    em.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); pw.focus(); } });
    card.querySelector('#so-lc-req').addEventListener('click', function () { renderRequest(card); });
    // 저장된 아이디가 있으면 비밀번호 칸으로 바로 포커스
    setTimeout(function () { try { (savedEm ? pw : em).focus(); } catch (e) {} }, 40);
  }

  // ── 가입(계정 발급) 요청 폼 — access_requests 테이블에 저장(자가가입 아님). ──
  function renderRequest(card) {
    card.innerHTML =
        '<div style="font-size:19px;font-weight:800;color:var(--accent,#647548)">가입 요청</div>'
      + '<div style="margin-top:6px;color:var(--text2,#566049);font-size:12px;line-height:1.5">계정이 없으시면 아래로 요청을 보내세요.<br>마스터(관리자) 확인 후 계정이 발급됩니다.</div>'
      + '<input id="so-rq-nm" type="text" placeholder="이름" autocomplete="name" style="margin-top:16px;' + lcInput() + '">'
      + '<input id="so-rq-em" type="email" placeholder="이메일(계정으로 사용할 주소)" autocomplete="email" spellcheck="false" style="margin-top:10px;' + lcInput() + '">'
      + '<div id="so-rq-err" style="display:none;margin-top:10px;color:#b13b2c;font-size:12.5px;font-weight:600"></div>'
      + '<button type="button" id="so-rq-go" style="margin-top:16px;' + lcBtn() + '">요청 보내기</button>'
      + '<div style="margin-top:12px"><a id="so-rq-back" style="' + lcLink() + '">← 로그인으로</a></div>';
    var nm = card.querySelector('#so-rq-nm'), em = card.querySelector('#so-rq-em'),
        err = card.querySelector('#so-rq-err'), btn = card.querySelector('#so-rq-go');
    function fail(m) { err.textContent = m; err.style.display = 'block'; btn.disabled = false; btn.textContent = '요청 보내기'; }
    function go() {
      var c = authClient(); var n = nm.value.trim(), e = em.value.trim();
      if (!c) { fail('연결 정보가 없습니다.'); return; }
      if (!n || !e) { fail('이름과 이메일을 입력하세요.'); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { fail('이메일 형식을 확인하세요.'); return; }
      err.style.display = 'none'; btn.disabled = true; btn.textContent = '보내는 중…';
      c.from('access_requests').insert({ name: n, email: e })
        .then(function (res) {
          if (res && res.error) { fail('요청 실패: ' + res.error.message); return; }
          card.innerHTML =
              '<div style="font-size:34px">✓</div>'
            + '<div style="margin-top:8px;font-size:17px;font-weight:800;color:var(--accent,#647548)">요청이 접수되었습니다</div>'
            + '<div style="margin-top:8px;color:var(--text2,#566049);font-size:13px;line-height:1.55">마스터(관리자) 확인 후 <b>' + escU(e) + '</b><br>으로 계정이 발급됩니다.</div>'
            + '<button type="button" id="so-rq-ok" style="margin-top:18px;' + lcBtn() + '">로그인으로</button>';
          card.querySelector('#so-rq-ok').addEventListener('click', function () { renderLogin(card); });
        }).catch(function (ex) { fail('요청 오류: ' + ex.message); });
    }
    btn.addEventListener('click', go);
    card.querySelector('#so-rq-back').addEventListener('click', function () { renderLogin(card); });
    setTimeout(function () { try { nm.focus(); } catch (e) {} }, 40);
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
        if (rr.error || !rr.data || !rr.data[0]) return { role: 'staff', areas: [], read_areas: [], name: '', dept: '', title: '' };
        var a = rr.data[0];
        return { role: a.role, areas: a.areas || [], read_areas: a.read_areas || [], name: a.name || '', dept: a.dept || '', title: a.title || '' };
      }).catch(function () { return { role: 'staff', areas: [], read_areas: [], name: '', dept: '', title: '' }; });
    }).catch(function () { return null; });
    return _meP;
  }
  global.__so_meAccess = meAccess;
  global.__so_authClient = authClient;

  // ── 공통 변경 이력 패널 — <details class="so-audit" data-audit-tables="folios,charges"> ──
  //   audit_feed RPC(값 비노출: 누가·무슨 필드·언제) 호출. 페이지에서 연결 후 __so_bindAudit(supa) 1회.
  var SO_AUDIT_OP = { INSERT: '등록', UPDATE: '수정', DELETE: '삭제' };
  var SO_AUDIT_TBL = { rooms:'방배정', room_inventory:'객실', room_closures:'객실폐쇄', print_overrides:'태그/제외/묶기',
    dinner_addons:'別注/알레르기', folios:'정산 folio', charges:'청구', payments:'결제', transactions:'거래',
    dining:'식음', rounds:'라운딩', settle_remarks:'정산비고', settle_deductions:'정산차감', announcements:'공지',
    inv_items:'재고', kitchen_tickets:'주방티켓', user_access:'권한', member_codes:'회원코드' };
  function soAuditFmt(ts){ try{ var x=new Date(ts); return x.toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }catch(e){ return ts; } }
  function bindAudit(supa){
    if(!supa) return;
    var nodes = document.querySelectorAll('details.so-audit[data-audit-tables]');
    Array.prototype.forEach.call(nodes, function(d){
      if(d._soBound) return; d._soBound = true;
      var body = d.querySelector('.so-audit-body'); if(!body){ body=document.createElement('div'); body.className='so-audit-body'; d.appendChild(body); }
      var tables = d.getAttribute('data-audit-tables');
      var pk = d.getAttribute('data-audit-pk') || null;
      var offset = 0;
      function row(r){
        var nm = SO_AUDIT_TBL[r.table_name] || r.table_name;
        var fields = (r.changed_fields && r.changed_fields.length) ? '<span class="so-audit-fields">'+r.changed_fields.join(', ')+'</span>' : '';
        return '<div class="so-audit-row"><span class="so-audit-op op-'+r.op+'">'+(SO_AUDIT_OP[r.op]||r.op)+'</span> <b>'+nm+'</b> <span class="so-audit-pk">#'+(r.row_pk||'')+'</span> '+fields+'<span class="so-audit-meta">'+(r.changed_by||'?')+' · '+soAuditFmt(r.changed_at)+'</span></div>';
      }
      function load(reset){
        var sb = supa || authClient();
        if(!sb){ body.innerHTML='<div class="so-audit-empty">로그인 후 이용 가능합니다.</div>'; return; }
        if(reset){ offset=0; body.innerHTML='<div class="so-audit-empty">불러오는 중…</div>'; }
        sb.rpc('audit_feed',{ p_table: tables, p_row_pk: pk, p_limit: 40, p_offset: offset }).then(function(res){
          if(res.error){ body.innerHTML='<div class="so-audit-empty">이력 조회 실패: '+res.error.message+'</div>'; return; }
          var rows = res.data || [];
          if(reset) body.innerHTML='';
          var more = body.querySelector('.so-audit-more'); if(more) more.remove();
          if(!rows.length && offset===0){ body.innerHTML='<div class="so-audit-empty">변경 이력이 없습니다.</div>'; return; }
          body.insertAdjacentHTML('beforeend', rows.map(row).join(''));
          offset += rows.length;
          if(rows.length===40){ var b=document.createElement('button'); b.className='so-audit-more'; b.type='button'; b.textContent='더 보기'; b.onclick=function(){ load(false); }; body.appendChild(b); }
        });
      }
      d.addEventListener('toggle', function(){ if(d.open && !d._loaded){ d._loaded=true; load(true); } });
      d._reloadAudit = function(){ d._loaded=true; if(d.open) load(true); else d._loaded=false; };
    });
  }
  global.__so_bindAudit = bindAudit;

  // 영역(또는 파일명)별 감사 대상 테이블 — 자동 변경이력 패널
  var SO_AREA_AUDIT = {
    room:   'rooms,room_inventory,room_closures,print_overrides,inv_items',
    print:  'print_overrides,dinner_addons',
    settle: 'folios,charges,payments,transactions,dining,rounds,settle_remarks,settle_deductions',
    pos:    'charges,payments,folios,kitchen_tickets',
    kitchen:'kitchen_tickets,inv_items',
    front:  'rooms,print_overrides,folios,payments',
    admin:  'user_access,member_codes,announcements'
  };
  var SO_PATH_AUDIT = { 'board.html':'announcements', 'groupcodes.html':'member_codes', 'inventory.html':'inv_items' };
  // 페이지에 변경 이력 패널 자동 주입(카드별 코드 수정 불필요). menu/notes/step1은 전용 이력 보유 → 제외.
  function mountAudit() {
    if (!document.body) return;
    if (document.querySelector('details.so-audit[data-audit-auto]')) return;
    var area = document.body.getAttribute('data-so-area') || '';
    var file = (location.pathname.split('/').pop() || '').toLowerCase();
    var tables = SO_AREA_AUDIT[area] || SO_PATH_AUDIT[file];
    if (!tables) return;
    var host = document.querySelector('.wrap') || document.getElementById('content') || document.body;
    var det = document.createElement('details');
    det.className = 'so-audit';
    det.setAttribute('data-audit-tables', tables);
    det.setAttribute('data-audit-auto', '1');
    det.innerHTML = '<summary>🕘 변경 이력 — 누가·언제·무엇을 바꿨는지</summary><div class="so-audit-body"></div>';
    host.appendChild(det);
    bindAudit(null);
  }
  global.__so_mountAudit = mountAudit;

  // ── 페이지 가드 — <body data-so-area="settle"> 선언 시, 권한 없으면 차단 오버레이. ──
  function showGuard(kind) {
    if (document.getElementById('so-guard')) return;
    var d = document.createElement('div');
    d.id = 'so-guard';
    d.setAttribute('style', 'position:fixed;inset:0;z-index:25;background:rgba(238,241,234,.97);display:flex;align-items:center;justify-content:center;text-align:center;padding:24px');
    if (kind === 'login') {
      d.appendChild(loginCard());   // 미로그인 → 가운데 정식 로그인 카드
    } else {
      var wrap = document.createElement('div');
      wrap.innerHTML = '<div style="font-size:18px;font-weight:800;color:#b13b2c">접근 권한이 없습니다</div>'
        + '<div style="margin-top:10px;color:#566049;font-size:13.5px">이 페이지 권한이 없습니다. 마스터(관리자)에게 문의하세요.</div>'
        + '<div style="margin-top:16px"><a href="../index.html" style="color:#3d5424;font-weight:700;text-decoration:none">← 홈으로</a></div>';
      d.appendChild(wrap);
    }
    document.body.appendChild(d);
  }
  function showReadOnly() {
    if (document.getElementById('so-readonly')) return;
    var b = document.createElement('div');
    b.id = 'so-readonly';
    b.setAttribute('style', 'position:sticky;top:0;z-index:24;background:#9a7322;color:#fff;font-size:12.5px;font-weight:800;text-align:center;padding:6px 12px;letter-spacing:.3px');
    b.textContent = '👁 읽기 전용 — 이 영역은 조회만 가능합니다(수정 권한 없음). 변경은 서버에서 차단됩니다.';
    document.body.insertBefore(b, document.body.firstChild);
  }
  function guardPage() {
    var raw = document.body.getAttribute('data-so-area');
    if (!raw) return;
    if (!authClient()) return;   // 접속정보 없음(이론상 내장으로 항상 있음)
    var areas = raw.split(/[\s,]+/).filter(Boolean);   // 여러 영역 = OR(하나라도 있으면 통과)
    meAccess().then(function (acc) {
      if (!acc) { showGuard('login'); return; }                 // 미로그인
      if (areas.indexOf('admin') >= 0) { if (acc.role === 'admin') return; showGuard('deny'); return; }
      if (acc.role === 'admin' || acc.role === 'manager') return; // 전 접근
      var w = acc.areas || [], r = acc.read_areas || [];
      if (areas.some(function (a) { return w.indexOf(a) >= 0; })) return;                      // 쓰기 영역 보유 → 전체
      if (areas.some(function (a) { return r.indexOf(a) >= 0; })) { showReadOnly(); return; }  // 읽기 영역 → 보기 허용
      showGuard('deny');   // 어느 영역도 없음 → 차단 오버레이(링크 타고 들어와도 막힘)
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
        b.type = 'button'; b.className = 'so-user-btn'; b.textContent = '';
        b.title = 'Supabase 연결 정보'; b.addEventListener('click', toggle);
        box.appendChild(b);
      }
    }
  }

  // ── 초대/비밀번호 재설정 링크 처리: #...type=invite|recovery 로 들어오면 비번 설정 화면 ──
  //   · Supabase Dashboard에서 Invite 발송 → 사용자가 메일 링크 클릭 → 여기로 와서 비번 설정.
  //   · supabase-js(detectSessionInUrl)가 해시에서 세션을 잡음 → updateUser({password})로 설정.
  var _spShown = false;
  function handleAuthRedirect() {
    var h = _bootHash || location.hash || '', q = _bootSearch || location.search || '';
    // 만료/사용된 초대 링크: #error=...&error_code=otp_expired (또는 access_denied)
    //   → 조용히 로그인 화면으로 떨어지지 말고 "재초대 필요" 안내를 띄운다.
    if (/error_code=|[#?&]error=/.test(h + q) && /type=(invite|recovery|signup)|otp_expired|access_denied|invite/i.test(h + q)) {
      showInviteErrorCard(h + q);
      return true;
    }
    // 구현 흐름(implicit): #access_token=…&type=invite|recovery|signup
    // PKCE 흐름           : ?code=…  (type 없이 들어오기도 함)
    var hashInvite  = /type=(invite|recovery|signup)/.test(h);
    var queryInvite = /type=(invite|recovery|signup)/.test(q);
    var pkceCode    = /[?&]code=/.test(q) && !/[?&]error=/.test(q);
    if (!hashInvite && !queryInvite && !pkceCode) return false;
    var c = authClient(); if (!c) return false;
    // PASSWORD_RECOVERY 이벤트(supabase가 해시를 늦게 처리하는 경우 백업)
    try {
      c.auth.onAuthStateChange(function (evt) {
        if (evt === 'PASSWORD_RECOVERY' || evt === 'USER_UPDATED' || evt === 'SIGNED_IN') {
          if (!_spShown) { _spShown = true; showSetPasswordCard(c); }
        }
      });
    } catch (e) {}
    // PKCE 코드면 세션 교환 후 카드 표시
    if (pkceCode && c.auth.exchangeCodeForSession) {
      c.auth.exchangeCodeForSession(q).then(function () {
        if (!_spShown) { _spShown = true; showSetPasswordCard(c); }
      }).catch(function () {
        if (!_spShown) { _spShown = true; showSetPasswordCard(c); }
      });
    } else {
      _spShown = true; showSetPasswordCard(c);
    }
    return true;
  }
  function showInviteErrorCard(raw) {
    var expired = /otp_expired|expired/i.test(raw);
    var ov = document.createElement('div');
    ov.setAttribute('style', 'position:fixed;inset:0;z-index:100000;background:rgba(31,42,24,.55);display:flex;align-items:center;justify-content:center;padding:20px');
    var card = document.createElement('div');
    card.setAttribute('style', 'background:var(--surface,#fff);border:1px solid var(--border2,#bcc4ad);border-radius:14px;box-shadow:0 12px 44px rgba(31,42,24,.16);padding:30px 28px;width:360px;max-width:92vw;text-align:center');
    card.innerHTML =
        '<div style="font-size:34px">⌛</div>'
      + '<div style="margin-top:6px;font-size:18px;font-weight:800;color:#b13b2c">초대 링크가 ' + (expired ? '만료' : '무효') + '되었습니다</div>'
      + '<div style="margin-top:10px;color:var(--text2,#566049);font-size:13px;line-height:1.6">초대 링크는 <b>한 번만</b> 사용할 수 있고 일정 시간이 지나면 만료됩니다.<br>관리자에게 <b>재초대</b>를 요청하시거나, 이미 비밀번호를 설정했다면 아래에서 로그인하세요.</div>'
      + '<button type="button" id="so-ie-ok" style="margin-top:18px;' + lcBtn() + '">로그인 화면으로</button>';
    ov.appendChild(card); document.body.appendChild(ov);
    card.querySelector('#so-ie-ok').addEventListener('click', function () {
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
      location.reload();
    });
  }
  function showSetPasswordCard(c) {
    var ov = document.createElement('div');
    ov.setAttribute('style', 'position:fixed;inset:0;z-index:100000;background:rgba(31,42,24,.55);display:flex;align-items:center;justify-content:center;padding:20px');
    var card = document.createElement('div');
    card.setAttribute('style', 'background:var(--surface,#fff);border:1px solid var(--border2,#bcc4ad);border-radius:14px;box-shadow:0 12px 44px rgba(31,42,24,.16);padding:30px 28px;width:340px;max-width:92vw;text-align:center');
    card.innerHTML =
        '<div style="font-size:20px;font-weight:800;color:var(--accent,#647548)">비밀번호 설정</div>'
      + '<div style="margin-top:6px;color:var(--text2,#566049);font-size:12.5px">초대받은 계정의 비밀번호를 정하세요.<br>이후 이메일+비밀번호로 로그인합니다.</div>'
      + '<input id="so-sp-pw" type="password" placeholder="새 비밀번호" autocomplete="new-password" style="margin-top:18px;' + lcInput() + '">'
      + '<input id="so-sp-pw2" type="password" placeholder="비밀번호 확인" autocomplete="new-password" style="margin-top:10px;' + lcInput() + '">'
      + '<div id="so-sp-hint" style="margin-top:9px;font-size:11.5px;text-align:left;line-height:1.8">'
      +   '<div data-rule="len" style="color:var(--muted,#8d9285)">○ 8자 이상</div>'
      +   '<div data-rule="an" style="color:var(--muted,#8d9285)">○ 영문 + 숫자 포함</div>'
      +   '<div style="color:var(--muted,#8d9285)">· 특수문자(!@#$ 등) 포함 권장</div>'
      + '</div>'
      + '<div id="so-sp-err" style="display:none;margin-top:10px;color:#b13b2c;font-size:12.5px;font-weight:600"></div>'
      + '<button type="button" id="so-sp-go" style="margin-top:14px;' + lcBtn() + '">설정하고 시작</button>';
    ov.appendChild(card); document.body.appendChild(ov);
    var pw = card.querySelector('#so-sp-pw'), pw2 = card.querySelector('#so-sp-pw2'),
        err = card.querySelector('#so-sp-err'), btn = card.querySelector('#so-sp-go');
    var hLen = card.querySelector('[data-rule="len"]'), hAn = card.querySelector('[data-rule="an"]');
    function rule(el, ok, label) {
      el.textContent = (ok ? '✓ ' : '○ ') + label;
      el.style.color = ok ? '#3f7d34' : 'var(--muted,#8d9285)';
      el.style.fontWeight = ok ? '700' : '400';
    }
    function okLen(p) { return p.length >= 8; }
    function okAn(p) { return /[A-Za-z]/.test(p) && /[0-9]/.test(p); }
    function updateHint() {
      var p = pw.value;
      rule(hLen, okLen(p), '8자 이상');
      rule(hAn, okAn(p), '영문 + 숫자 포함');
    }
    pw.addEventListener('input', updateHint);
    function fail(m) { err.textContent = m; err.style.display = 'block'; btn.disabled = false; btn.textContent = '설정하고 시작'; }
    function go() {
      var p = pw.value, p2 = pw2.value;
      if (!okLen(p)) { fail('비밀번호는 8자 이상이어야 합니다.'); return; }
      if (!okAn(p)) { fail('영문과 숫자를 모두 포함해야 합니다.'); return; }
      if (p !== p2) { fail('두 비밀번호가 다릅니다.'); return; }
      err.style.display = 'none'; btn.disabled = true; btn.textContent = '설정 중…';
      c.auth.updateUser({ password: p }).then(function (res) {
        if (res && res.error) { fail('설정 실패: ' + res.error.message + ' (링크가 만료되었으면 재초대 필요)'); return; }
        card.innerHTML = '<div style="font-size:34px">✓</div>'
          + '<div style="margin-top:8px;font-size:17px;font-weight:800;color:var(--accent,#647548)">비밀번호 설정 완료</div>'
          + '<div style="margin-top:8px;color:var(--text2,#566049);font-size:13px">이제 이메일과 비밀번호로 로그인하세요.</div>'
          + '<button type="button" id="so-sp-ok" style="margin-top:18px;' + lcBtn() + '">로그인 화면으로</button>';
        card.querySelector('#so-sp-ok').addEventListener('click', function () {
          try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
          location.reload();
        });
      }).catch(function (ex) { fail('오류: ' + ex.message); });
    }
    btn.addEventListener('click', go);
    pw2.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    setTimeout(function () { try { pw.focus(); } catch (e) {} }, 60);
  }

  // ── 사이트 제공자 표기(흐린 푸터) — 전 ops 페이지 공통 ──
  function mountFooter() {
    if (document.querySelector('.so-footer')) return;
    var f = document.createElement('footer');
    f.className = 'so-footer';
    f.setAttribute('style', 'margin-top:48px;padding:18px 14px 24px;text-align:center;font-size:11px;line-height:1.7;color:var(--text3,#9aa392);opacity:.65;border-top:1px solid var(--border,#e0e4d8)');
    var s1 = document.createElement('span');
    s1.setAttribute('data-i18n', 'so_footer');
    f.appendChild(s1);
    f.appendChild(document.createElement('br'));
    var pv = document.createElement('a');
    pv.href = '/privacy.html';
    pv.setAttribute('data-i18n', 'so_privacy');
    pv.style.cssText = 'font-size:10px;color:inherit;text-decoration:underline;opacity:.9';
    f.appendChild(pv);
    var sep = document.createElement('span');
    sep.style.cssText = 'font-size:10px;opacity:.6;margin:0 6px';
    sep.textContent = '·';
    f.appendChild(sep);
    var s2 = document.createElement('span');
    s2.style.cssText = 'font-size:10px;opacity:.85';
    s2.textContent = '© ' + new Date().getFullYear() + ' Merit Tour · SaiZen';
    f.appendChild(s2);
    document.body.appendChild(f);
  }

  // ── 공통 head 보강(파비콘·테마컬러) — 전 ops 페이지 ──
  function mountHead() {
    var head = document.head; if (!head) return;
    if (!document.querySelector('link[rel="icon"]')) {
      var ic = document.createElement('link');
      ic.rel = 'icon'; ic.type = 'image/svg+xml';
      ic.href = '/assets/logo-saizen-vertical.svg';
      head.appendChild(ic);
    }
    if (!document.querySelector('meta[name="theme-color"]')) {
      var tc = document.createElement('meta');
      tc.name = 'theme-color'; tc.content = '#647548';
      head.appendChild(tc);
    }
  }

  // ── 페이지 설명서 자동 주입 — 각 페이지 .conn 아래에 접이식 <details class="page-help"> ──
  //   실무자가 "이게 뭐였더라" 하지 않게: 하는 일·계산/판정·용어·권한을 코드 기준으로.
  var SO_HELP = {
    'step1.html': '<h4>이 화면이 하는 일</h4>엠클릭 엑셀(<b>예약리스트·일행별예약·그룹코드 참조</b>)을 올리면 그룹코드·회원여부·항공정보를 계산해 저장합니다. <b>모든 화면의 출발점</b>입니다.<h4>계산·판정</h4><ul><li><b>월 단위 동기화</b>: 올린 그 달에서 파일에 없는 팀만 확인 거쳐 정리(<b>다른 달 무영향</b>). 있는 팀은 id 유지(배정 보존).</li><li><b>그룹코드 자동계산</b>: 회원=사전배정, 비회원=F풀(<code>FAあ</code>~).</li><li><b>날짜 자동인식</b>: 엑셀 숫자·한국어·MM/DD/YYYY 모두 흡수.</li></ul><h4>주요 용어</h4>예약리스트=<b>팀 마스터</b>(상품·숙소·기간·금액) / 일행별예약=<b>개인 명세</b>(명단·항공·생년·등급). 결합키=<code>eventSeq</code>(행사번호).<h4>권한·데이터</h4>step1 영역. 저장: bookings·passengers·guests·guest_members.',
    'room.html': '<h4>이 화면이 하는 일</h4><b>개인 단위</b> 객실 배정. 자동배정·분할체류·타임라인·기간폐쇄.<h4>계산·판정(자동배정)</h4><ul><li><b>예약순 선착</b>: 빠른 예약 팀부터.</li><li><b>명단 순서대로 짝(1·2, 3·4)</b> — 일행별예약 순서(룸메 의도)를 그대로 지킴. <b>짝에 회원이 1명이라도 있으면 그 방을 디럭스</b>, 없으면 예약종류(트윈·컴팩트). 각 풀 <b>고층부터</b>, 디럭스 부족 시 예약순으로 차지·나머지는 예약종류로 강등.</li><li><b>같은 팀 같은 층</b>: 2방 이상이면 팀 전체가 들어갈 한 층으로 묶어 배정(층 모자라면 분산).</li><li><b>재배정=전체 재배치</b>: auto만 지우고 처음부터. 수기·분할(✂)은 보호.</li><li><b>정원</b>: 하룻밤 겹침 체크(다른 달 포함). 폐쇄 기간 방 제외.</li></ul><h4>주요 용어</h4><b>태그코드</b>=3자리 그룹코드(<code>F</code>접두=비회원). <b>회원 판정</b>=고객등급·회원권구분·회원구분 <b>셋 중 하나라도 회원이면 회원</b>. <b>분할(✂)</b>=기준일부터 다른 방.<h4>배정 검색</h4>상단 고정 바의 <b>🔎 배정 검색</b>에 태그코드·한글명·영문명·행사번호를 입력하면 그 사람이 <b>어느 방·어느 날짜</b>에 배정됐는지 목록으로 뜨고, 클릭하면 그 날짜 카드로 점프해 방을 강조합니다.<h4>변경 이력</h4>하단 <b>🕘 방배정 변경 이력</b>에서 누가·언제 배정/해제/분할/자동배정했는지 조회(검색·더보기). <b>자동배정 재배치는 사람별 「↪️ 이동」(A호→B호)으로도 기록</b>되어 누가 어디서 어디로 갔는지 추적됩니다.<h4>권한·데이터</h4>room 영역. rooms·room_inventory·room_closures·change_log.',
    'nametag.html': '<h4>이 화면이 하는 일</h4>개인별 <b>네임택 라벨</b>(Askul 24면)을 인쇄합니다. step1에서 계산된 값을 읽어 출력(재계산 없음).<h4>주요 용어</h4><b>태그코드</b>=그룹코드+개인번호(<code>DAあ-1Y</code>). 끝글자(Y·K·G·S)=숙소 구분.<h4>권한·데이터</h4>print(인쇄) 영역. guests·guest_members 읽기.',
    'aircover.html': '<h4>이 화면이 하는 일</h4>팀별 <b>A5 항공커버</b> 1장(가로). 개인 항공편·시설색.<h4>계산·판정</h4><ul><li>대표=<code>is_rep</code> 우선.</li><li><b>시설색·라벨</b>=태그 끝글자(Y/K/G/S).</li><li>항공편 ZE→PUS·TW→ICN 보정.</li><li>태그·인원 <b>인라인 수정</b>=print_overrides 공유 → 석식과 동기.</li></ul><h4>주요 용어</h4>태그코드(3자리, F접두=비회원).<h4>권한·데이터</h4>print(인쇄) 영역. 태그·인원 수정은 print 또는 room 권한 필요.',
    'dispatch.html': '<h4>이 화면이 하는 일</h4>행사별 <b>A4 양면</b> — 앞=現地手配書, 뒤=現地発生分 記入表.<h4>계산·판정</h4><ul><li>라운딩 일정 자동·部屋数=<code>ceil(pax/2)</code>室.</li><li><b>마스킹 토글</b>: ON=생년월일까지 / OFF=여권·전화 노출.</li><li>記入表(뒷면)=현장 손기입, B2B 정산과 별개.</li></ul><h4>권한·데이터</h4>print(인쇄) 영역.',
    'dinner.html': '<h4>이 화면이 하는 일</h4>날짜별 <b>夕食オーダー</b>(A3) + 조·중·석 <b>식수 자동집계</b> + <b>レストラン名札</b> 인쇄.<h4>계산·판정</h4><ul><li>식수=숙소 그룹별 규칙. <b>석식=그날 묵는 전원</b>.</li><li><b>팀 묶기(🔗)</b>: 합석할 팀을 체크 → 「선택 묶기」. <b>レストラン名札이 1장으로 합쳐</b>지고 대표자·태그코드가 모두 표기·인원은 합산(칸은 자동 축소). 식수 집계는 그대로(각 팀 인원 유지). 「묶음 해제」로 되돌림.</li><li><b>제외(병합)</b>: 한 팀 지우고 다른 팀에 인원 취합 → 명단·식수에서 빠짐(묶기와 달리 명단에서 사라짐).</li><li><b>분배 정합성</b>: 원래 합계=수정 후 합계인지 ✓/⚠.</li></ul><h4>주요 용어</h4>태그코드. 「팀별 태그·인원」은 항공커버와 공유(夕食만 제외 반영) · 「묶기」는 명패 전용.<h4>권한·데이터</h4>print(인쇄) 영역. 태그·인원·묶기 저장은 print 또는 room 권한 필요.',
    'settle.html': '<h4>이 화면이 하는 일</h4>체크아웃 <b>명세서(御請求書)</b>. 팀별 청구·결제·잔액.<h4>계산·판정</h4><ul><li><b>잔액=청구합계−결제합계</b>.</li><li>미개설 팀=청구 0=<b>잔액 ¥0</b>(클릭하면 청구 추가, 계정 자동개설).</li><li>개인 분할이 있으면 folio 묶음(팀+개인 합계).</li></ul><h4>주요 용어</h4>현장 추가요금(추가라운드·미니바 등) — B2B 선계약과 <b>별개</b>.<h4>권한·데이터</h4>settle 영역. folios·charges·payments.',
    'settle_merit.html': '<h4>이 화면이 하는 일</h4>메리트↔사이젠 <b>B2B 선계약</b> 정산표.<h4>계산·판정</h4><ul><li><b>숙박비=인원×박수×숙소단가</b>(야마나미·쿠주 14,000 / 간지 16,000 / 시즈 17,000).</li><li><b>송영비=인원×¥6,000</b>.</li><li>인원=<b>실제 명단 수</b>(예약 pax보다 우선). 차감·비고만 별도 저장.</li></ul><h4>주요 용어</h4>B2B(현장 추가요금과 혼동 금지).<h4>권한·데이터</h4>settle 영역.',
    'pos.html': '<h4>이 화면이 하는 일</h4>주문 입력(간이 POS). 팀 기본 + 개인 분할.<h4>계산·판정</h4><ul><li><b>분할</b>: 팀공통 / 특정 1인 / N분의1 → charges + 개인 folio 자동 생성.</li><li><b>주방 티켓</b>=분할 무관 <b>풀수량·팀단위</b>.</li><li>회원 배지=고객등급·회원권구분·회원구분 3컬럼 OR.</li></ul><h4>주요 용어</h4>매장(outlet)=프론트/레스토랑·연회/골프샵.<h4>권한·데이터</h4>pos 영역. charges·folios.',
    'kitchen.html': '<h4>이 화면이 하는 일</h4>주방·바 <b>주문 티켓 화면(KDS)</b>.<h4>계산·판정</h4><ul><li>티켓 <b>신규 → 접수 → 완료</b> 3단계(접수 시 담당 기록).</li><li>품목별 <b>조리 라우팅</b>(station): 주방/바/프론트.</li></ul><h4>권한·데이터</h4>kitchen 영역. kitchen_tickets.',
    'menu.html': '<h4>이 화면이 하는 일</h4>메뉴 품목 관리(장소·라인별).<h4>계산·판정</h4><ul><li><b>코드 자동채번</b>=장소 prefix+번호(<code>FR1</code>·<code>GS1</code>).</li><li>이미 적용된 코드는 <b>잠금</b>(수정 불가).</li><li>모든 변경은 이력(change_log)에 기록.</li></ul><h4>주요 용어</h4><b>장소(venue)</b>=판매처·코드 prefix / <b>라인(category)</b>=정산 집계 기준(<code>숙박</code>은 화면에 「룸」 표시).<h4>권한·데이터</h4>menu 영역. menu_items.',
    'board.html': '<h4>이 화면이 하는 일</h4>부서 <b>공지</b> + <b>오늘 요약</b>(JST 기준 체크인·아웃·주문·매출 집계).<h4>권한·데이터</h4>읽기=로그인 전원 / 공지 쓰기=admin·manager.',
    'notes.html': '<h4>이 화면이 하는 일</h4>행사(팀)별 <b>팀 라벨·야마나미 코스·비고·메모</b>를 남깁니다.<h4>계산·판정</h4>값은 포커스 벗어나면 자동 저장. 모든 수정은 <b>누가·언제·이전→이후</b>로 이력에 남습니다.<h4>권한·데이터</h4>notes 영역. event_notes·event_note_log.',
    'groupcodes.html': '<h4>이 화면이 하는 일</h4><b>회원 마스터(개인정보)</b> 관리 + 빈코드 피커. <b>마스터(admin) 전용</b>.<h4>계산·판정</h4><ul><li>그룹코드 3자리=<b>등급 prefix + 영문(18종) + 가나(33종)</b>.</li><li><b>빈코드 피커</b>: 등급별 18×33 그리드 — <b>초록=빈 코드</b>(0명, 바로 배정) / <b>앰버=합류 가능</b>(1~3명) / 회색=4명+.</li></ul><h4>주요 용어</h4>F풀=비회원. 등급 prefix=다이아[D·M]·골드[G]·EWRC[E·W·R·C] 등.<h4>권한·데이터</h4>admin 전용(PII). member_codes.',
    'frontdesk.html': '<h4>이 화면이 하는 일</h4>실시간 <b>도착·출발·재실</b> + 팀별 방번호·잔액·메모 통합 현황. 프론트=바=레스토랑 한 화면(테이블 관리는 미도입 — 명패는 계속 출력).<h4>계산·판정</h4><ul><li>🛬체크인=<code>dep===오늘</code> / 🛫체크아웃=<code>arr===오늘</code> / 🏨체류중(연박)=그 사이 / 🍽석식=그날 묵는 전원.</li><li>잔액=청구−결제 합산. <b>KPI 클릭→해당 라인 스크롤</b>.</li><li><b>숙소 칩</b>으로 리스트·KPI 필터.</li></ul><h4>바로가기</h4>팀 클릭 → 상세에서 <b>정산</b>(그 팀 자동 열기)·<b>방배정</b>(그 날짜)·메모로 점프.<h4>권한·데이터</h4>front(프론트 데스크) 영역. 읽기 집계(데이터 변경 없음).',
    'admin.html': '<h4>이 화면이 하는 일</h4>계정 <b>역할·영역 지정</b> + 가입요청 처리. <b>마스터 전용</b>.<h4>계산·판정</h4><ul><li>역할 <b>admin / manager / staff</b> + 영역(step1·room·settle·pos·kitchen·menu·notes).</li><li>admin·manager=전 카드 통과, staff=<b>지정 영역만</b>.</li></ul><h4>권한·데이터</h4>admin 전용. user_access·access_requests.'
  };
  function mountHelp() {
    try {
      var file = (location.pathname.split('/').pop() || '').toLowerCase();
      var body = SO_HELP[file];
      if (!body) return;
      if (document.querySelector('.page-help[data-so-help]')) return;  // 중복 방지
      var d = document.createElement('details');
      d.className = 'page-help';
      d.setAttribute('data-so-help', '1');
      d.innerHTML = '<summary>📖 이 페이지 설명 · 계산 방식</summary><div class="ph-body">' + body + '</div>';
      var conn = document.querySelector('.conn');
      var anchor = conn || document.querySelector('.topbar, .so-bar');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(d, anchor.nextSibling);
      else document.body.insertBefore(d, document.body.firstChild);
    } catch (e) {}
  }

  // ── 맨 위로 버튼 — 전 ops 페이지 공통. 스크롤 내려가면 우하단에 노출. ──
  function mountToTop() {
    if (document.getElementById('so-totop')) return;   // 페이지 자체 버튼이 있으면 중복 방지
    var b = document.createElement('button');
    b.id = 'so-totop'; b.type = 'button'; b.title = '맨 위로'; b.setAttribute('aria-label', '맨 위로');
    b.textContent = '↑';
    b.style.cssText = 'display:none;position:fixed;right:20px;bottom:24px;z-index:60;width:44px;height:44px;'
      + 'border-radius:50%;border:1px solid var(--accent,#647548);background:var(--surface,#fff);'
      + 'color:var(--accent,#647548);font-size:19px;font-weight:800;cursor:pointer;box-shadow:0 3px 12px rgba(0,0,0,.16)';
    document.body.appendChild(b);
    var onScroll = function () { b.style.display = (window.scrollY > 320) ? 'block' : 'none'; };
    window.addEventListener('scroll', onScroll, { passive: true });
    b.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    onScroll();
  }

  function boot() {
    mountHead();
    if (handleAuthRedirect()) { applyLang(); return; }   // 초대/재설정 모드면 비번 설정만
    mountAuth(); mountFooter(); applyLang(); guardPage(); mountConnToggle(); mountHelp(); mountToTop(); mountAudit();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
