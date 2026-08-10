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
      so_update: '🔄 '+r('更新','こうしん')+'あり',
      so_updateT: 'この'+r('画面','がめん')+'の'+r('新','あたら')+'しいバージョンがあります。クリックで'+r('再','さい')+r('読','よ')+'み'+r('込','こ')+'み('+r('入力','にゅうりょく')+r('中','ちゅう')+'の'+r('内容','ないよう')+'は'+r('先','さき')+'に'+r('保存','ほぞん')+'してください)。',
      so_footer: r('本','ほん')+'サイトはメリットツアーが'+r('制作','せいさく')+'・'+r('提供','ていきょう')+'しています',
      so_privacy: r('個人情報','こじんじょうほう')+'の'+r('取扱','とりあつか')+'い',
      reset: r('初期化','しょきか'),
      home: 'ホーム',
      navStep1: '① '+r('登録','とうろく'),
      navRoom: '② '+r('部屋','へや')+r('割','わ')+'り'+r('当','あ')+'て',
      navHome: '← ホーム',
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
      ix_c1Cd: r('予約','よやく')+'リスト・'+r('同行者','どうこうしゃ')+r('別','べつ')+r('予約','よやく')+'の2'+r('つ','')+'のファイルをアップロードすると、'+r('自動','じどう')+'で'+r('整理','せいり')+'・'+r('保存','ほぞん')+'されます。'+r('会員','かいいん')+'グループコードは'+r('自動','じどう')+r('照合','しょうごう')+'。'+r('同','おな')+'じファイルを'+r('再','さい')+'アップロードしても'+r('重複','じゅうふく')+'しません。',
      ix_g2H: r('現場','げんば')+r('運営','うんえい'),
      ix_g2Desc: r('登録','とうろく')+'したデータで'+r('配置','はいち')+'・'+r('精算','せいさん'),
      ix_c2Step: 'STEP 2',
      ix_c2H: r('ホテル','')+r('部屋','へや')+r('割','わ')+'り'+r('当','あ')+'て',
      ix_c2Cd: r('日付','ひづけ')+r('別','べつ')+r('滞在','たいざい')+r('人数','にんずう')+'を'+r('客室','きゃくしつ')+'に'+r('個人','こじん')+r('単位','たんい')+'で'+r('割','わ')+'り'+r('当','あ')+'てます。'+r('定員','ていいん')+'・'+r('期間','きかん')+r('重','かさ')+'なりを'+r('自動','じどう')+r('検証','けんしょう')+'し、4'+r('名','めい')+'チームの2+2'+r('分割','ぶんかつ')+r('配置','はいち')+'もできます。',
      ix_goEnter: r('入','はい')+'る',
      ix_cFrontH: 'フロントデスク',
      ix_cFrontCd: 'リアルタイム到着・出発・在室 ＋ 部屋番号・残高・メモの統合状況',
      ix_cInvRoomH: '客室在庫・備品',
      ix_cInvRoomCd: '客室備品・リネン・アメニティ・清掃用品の数量管理',
      ix_cPosCustH: 'お客様確認画面',
      ix_cPosCustCd: 'お客様前のタブレットに明細を閲覧専用で表示。POSの「お客様画面表示」で開きます。',
      ix_cInvFnbH: 'F&B在庫',
      ix_cInvFnbCd: '食材・飲料・酒類・厨房消耗品の数量管理',
      ix_regData: '📅 登録済データ', ix_teamUnit: 'チーム', ix_pplUnit: '名',
      ix_wxTitle: '🗻 ヤマナミ 本日の時間別天気', ix_wxNow: '今', ix_wxHour: '時',
      ix_wxNone: '本日の残り時間がありません(0時以降更新)。', ix_wxProvider: '提供: Open-Meteo · 阿蘇',
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
      ix_gMgmt: r('経営','けいえい'),
      ix_cStatsH: r('経営','けいえい')+r('統計','とうけい'),
      ix_cStatsCd: r('月','つき')+'・'+r('年','ねん')+r('単位','たんい')+'の'+r('送客','そうきゃく')+'・'+r('売上','うりあげ')+'・'+r('稼働率','かどうりつ')+'・'+r('顧客','こきゃく')+r('構成','こうせい')+'を'+r('統合','とうごう')+r('表示','ひょうじ')+'(代表・部署長)。',
      ix_cVisitorH: r('訪問','ほうもん')+r('統計','とうけい'),
      ix_cVisitorCd: r('会員','かいいん')+'/'+r('非会員','ひかいいん')+'の'+r('訪問者数','ほうもんしゃすう')+'を'+r('日','ひ')+'・'+r('週','しゅう')+'・'+r('月','つき')+'・'+r('年','ねん')+'で'+r('集計','しゅうけい')+'(協会・県報告用)。',
      ix_cAdmin: ''+r('権限','けんげん')+r('管理','かんり'),
      ix_cAdminCd: r('担当者','たんとうしゃ')+'アカウントの'+r('役割','やくわり')+'(マスター・'+r('管理','かんり')+r('担当','たんとう')+'・'+r('一般','いっぱん')+')と'+r('アクセス','')+'カードを'+r('指定','してい')+'します。',
      ix_cAudit: r('データ','')+r('検収','けんしゅう'),
      ix_cAuditCd: r('個人','こじん')+r('番号','ばんごう')+r('欠番','けつばん')+'・'+r('名簿','めいぼ')+r('不一致','ふいっち')+'など'+r('データ','')+r('整合性','せいごうせい')+'の'+r('異常','いじょう')+'を'+r('印刷','いんさつ')+r('前','まえ')+'に'+r('一括','いっかつ')+r('点検','てんけん')+'。',
      ix_cWatch: r('特異','とくい')+r('予約','よやく')+' '+r('監視','かんし'),
      ix_cWatchCd: r('全','ぜん')+r('予約','よやく')+'を'+r('本人','ほんにん')+'('+r('氏名','しめい')+'+'+r('生年','せいねん')+')'+r('基準','きじゅん')+'でスキャンし、'+r('長期','ちょうき')+r('滞在','たいざい')+'・'+r('連続','れんぞく')+r('予約','よやく')+'の'+r('連結','れんけつ')+'など'+r('抜','ぬ')+'け'+r('道','みち')+'を'+r('検出','けんしゅつ')+'。'+r('権限','けんげん')+r('指定','してい')+r('者','しゃ')+'のみ。',
      ix_lvlMaster: 'A',
      ix_lvlMasterT: '管理者(マスター)級 · 権限指定者のみ',
      ix_cGroup: 'グループコード・'+r('会員','かいいん')+'マスター',
      ix_cGroupCd: r('会員','かいいん')+'グループコード('+r('氏名','しめい')+'+'+r('生年','せいねん')+'・'+r('等級','とうきゅう')+')を'+r('直接','ちょくせつ')+r('登録','とうろく')+'・'+r('検索','けんさく')+'・'+r('修正','しゅうせい')+'。'+r('個人','こじん')+r('情報','じょうほう')+'のため'+r('権限','けんげん')+r('付与','ふよ')+'者のみ。',
      ix_annTag: 'お'+r('知','し')+'らせ',
      ix_boardOpen: 'ボードを'+r('開','ひら')+'く →',
      ix_fuTag: '🔔 '+r('確認','かくにん')+'が'+r('必要','ひつよう'),
      ix_fuOpen: 'フロントで'+r('対応','たいおう')+' →',
      ix_loginH: 'ログインが'+r('必要','ひつよう')+'です',
      ix_loginP: r('右上','みぎうえ')+'の<b>[ログイン]</b>から'+r('入','はい')+'ってください。<br>アカウントはマスターが'+r('発行','はっこう')+'します。',
      ix_noPermH: r('表示','ひょうじ')+'できる'+r('権限','けんげん')+'がありません',
      ix_noPermP: 'アクセス'+r('可能','かのう')+'なセクションが'+r('割','わ')+'り'+r('当','あ')+'てられていません。<br>マスター(管理者)に'+r('権限','けんげん')+'の'+r('付与','ふよ')+'を'+r('依頼','いらい')+'してください。',
      ix_golfCart: 'カート'+r('配車','はいしゃ')+r('表','ひょう'),
      ix_golfCartCd: r('組','くみ')+r('別','べつ')+'カートの'+r('割','わ')+'り'+r('当','あ')+'て・'+r('管理','かんり')+'（'+r('準備','じゅんび')+r('中','ちゅう')+'）',
      ix_c8H: 'メニュー'+r('管理','かんり'),
      ix_c8Cd: 'POS・'+r('厨房','ちゅうぼう')+r('画面','がめん')+'で'+r('使','つか')+'うメニュー・'+r('単価','たんか')+'・station を'+r('登録','とうろく')+r('編集','へんしゅう')+'します。メニュー'+r('表','ひょう')+'を'+r('一括','いっかつ')+r('貼','は')+'り'+r('付','つ')+'けで'+r('入力','にゅうりょく')+'も'+r('可能','かのう')+'。',
      ix_g3H: r('印刷物','いんさつぶつ'),
      ix_gPrintDesc: r('単発','たんぱつ')+r('印刷','いんさつ')+r('出力','しゅつりょく')+'（'+r('登録','とうろく')+'データ'+r('基準','きじゅん')+'）',
      ix_cNametagH: 'ネームタグ '+r('印刷','いんさつ'),
      ix_cNametagCd: r('個人','こじん')+'ネームタグ（Askul 70×33.9mm 24'+r('面','めん')+'）',
      ix_cAircoverH: r('航空','こうくう')+'カバー'+r('置','お')+'き'+r('場','ば'),
      ix_cAircoverCd: r('チーム','')+r('別','べつ')+r('航空','こうくう')+'カバー（A5'+r('横','よこ')+'・1'+r('枚','まい')+'/'+r('組','くみ')+'）',
      ix_cDispatchH: r('現地','げんち')+r('手配書','てはいしょ'),
      ix_cDispatchCd: r('行事','ぎょうじ')+r('別','べつ')+r('手配書','てはいしょ')+'＋'+r('現地','げんち')+r('発生','はっせい')+r('分','ぶん')+r('記入','きにゅう')+r('表','ひょう')+'（A4'+r('両面','りょうめん')+'）',
      ix_cDinnerH: r('夕食','ゆうしょく')+'オーダー',
      ix_cDinnerCd: r('日付','ひづけ')+r('別','べつ')+r('夕食','ゆうしょく')+'オーダー（A3）＋'+r('朝','あさ')+'/'+r('昼','ひる')+'/'+r('夕','ゆう')+r('食数','しょくすう')+r('自動','じどう')+r('集計','しゅうけい'),
      ix_cShizuH: r('志津','しづ')+'の'+r('宿','やど')+' '+r('予約','よやく')+r('表','ひょう'),
      ix_cShizuCd: r('志津','しづ')+'の'+r('宿','やど')+r('客室','きゃくしつ')+r('予約','よやく')+r('表','ひょう')+'（'+r('別棟','べっとう')+r('温泉','おんせん')+r('事前','じぜん')+r('申請','しんせい')+'）— '+r('部屋割','へやわ')+'り'+r('連動','れんどう'),
      ix_cGolfH: 'ゴルフ'+r('組編成','くみへんせい'),
      ix_cGolfCd: r('商品名','しょうひんめい')+'から'+r('日','ひ')+'を'+r('自動','じどう')+r('抽出','ちゅうしゅつ')+' → 4'+r('人','にん')+'1'+r('組','くみ')+'を'+r('編成','へんせい')+'（'+r('阿蘇','あそ')+'·'+r('祖母','そぼ')+'·'+r('久住','くじゅう')+'）·'+r('組編成表','くみへんせいひょう')+r('印刷','いんさつ'),
      ix_cQrCardsH: r('注文','ちゅうもん')+'QR'+r('カード',''), ix_cQrCardsCd: 'お'+r('客様','きゃくさま')+'に'+r('渡','わた')+'す'+r('注文','ちゅうもん')+'QR'+r('カード','')+'を'+r('印刷','いんさつ')+'（'+r('手配書','てはいしょ')+'とは'+r('別','べつ')+'・'+r('注文','ちゅうもん')+r('時','じ')+'にPOSでスキャン）',
      ix_cNoticeH: r('案内文','あんないぶん')+r('作成','さくせい'), ix_cNoticeCd: r('現場','げんば')+r('用','よう')+'の'+r('案内文','あんないぶん')+'（'+r('席','せき')+r('片','かた')+'づけ・'+r('カート','')+'・'+r('静粛','せいしゅく')+'など）を'+r('入力','にゅうりょく')+'→'+r('プレビュー','')+'→'+r('印刷','いんさつ')+'。'+r('韓','かん')+'・'+r('日','にち')+r('併記','へいき')+'・'+'A4/B5',
      ix_cSettleMeritH: r('現地','げんち')+r('精算','せいさん')+r('表','ひょう')+'（Merit B2B）',
      ix_cSettleMeritCd: 'メリットツアー↔SaiZen B2B'+r('精算','せいさん')+'（'+r('宿泊','しゅくはく')+'＋'+r('送迎','そうげい')+'）・'+r('控除','こうじょ')+'・xlsx',
      ix_dBoard: r('統合','とうごう')+'ボード',
      ix_dBoardDesc: r('全部署','ぜんぶしょ')+'の'+r('共有','きょうゆう')+'・'+r('今日','きょう')+'の'+r('要約','ようやく'),
      ix_dFront: 'フロント・'+r('客室','きゃくしつ'),
      ix_dFrontDesc: r('部屋','へや')+r('割','わ')+'り・'+r('客室','きゃくしつ'),
      ix_dFnb: r('飲食','いんしょく')+'（F&B）',
      ix_dFnbDesc: 'POS・'+r('厨房','ちゅうぼう')+'・メニュー',
      ix_dGolf: 'ゴルフ',
      ix_dGolfDesc: 'コース・'+r('組編成','くみへんせい')+'・カート'+r('配置','はいち'),
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
      ix_foot: '<b>SaiZen Yamanami</b> · '+r('熊本','くまもと')+r('阿蘇','あそ')+'ヤマナミリゾート'+r('運営','うんえい'),

      /* step1 */
      s1_step: r('データ','')+r('登録','とうろく'),
      s1_regStatusDone: r('既','すで')+'に'+r('登録済','とうろくず')+'みのデータがあります',
      s1_regStatusHint: r('新規','しんき')+'·'+r('変更','へんこう')+r('時','じ')+'のみ'+r('再','さい')+'アップロード',
      s1_sub: 'エムクリック'+r('予約','よやく')+'ファイル'+r('登録','とうろく'),
      s1_lead: r('予約','よやく')+r('関連','かんれん')+'の2つのファイルを'+r('順番','じゅんばん')+'にアップロードすると、'+r('自動','じどう')+'で'+r('整理','せいり')+'・'+r('保存','ほぞん')+'されます。'+r('同','おな')+'じファイルを'+r('誤','あやま')+'って'+r('再','さい')+'アップロードしても'+r('重複','じゅうふく')+'しないので'+r('安心','あんしん')+'です。<b>'+r('アップロード','')+r('順','じゅん')+'</b>：'+r('予約','よやく')+'リスト → '+r('同行者','どうこうしゃ')+r('別','べつ')+r('予約','よやく')+'。'+r('会員','かいいん')+'グループコードは'+r('自動','じどう')+r('照合','しょうごう')+'（'+r('会員','かいいん')+'マスター'+r('基準','きじゅん')+'）。',
      s1_h2conn: '① '+r('データベース','')+r('接続','せつぞく'),
      s1_lblUrl: 'Project URL',
      s1_lblKey: 'anon key',
      s1_connHint: r('入力','にゅうりょく')+'した'+r('情報','じょうほう')+'はこのパソコンのブラウザにのみ'+r('保存','ほぞん')+'されます。'+r('公開','こうかい')+'されても'+r('安全','あんぜん')+'なキーなので'+r('安心','あんしん')+'してください。',
      s1_btnRun: r('データ','')+r('登録','とうろく'),
      s1_btnHome: 'ホームへ →',
      s1_doneTitle: r('データ','')+r('登録','とうろく')+r('完了','かんりょう'),
      s1_btnStay: r('閉','と')+'じる',
      s1_btnClear: r('画面クリア','がめんクリア'),
      s1_h2stats: r('登録','とうろく')+r('結果','けっか'),
      s1_uploaderPh: r('担当','たんとう')+r('者','しゃ')+r('名','めい'),
      s1_h2history: r('変更','へんこう')+r('履歴','りれき'),
      s1_historyNote: r('予約','よやく')+'/'+r('同行','どうこう')+'/'+r('チーム','')+r('件数','けんすう'),
      s1_historyEmpty: r('登録','とうろく')+r('履歴','りれき')+'がありません',
      s1_dyn_histFail: r('履歴','りれき')+r('記録','きろく')+r('失敗','しっぱい'),
      s1_statsNote: r('予約','よやく')+'リスト・'+r('同行者','どうこうしゃ')+r('別','べつ')+r('予約','よやく')+'を'+r('照合','しょうごう')+'し、'+r('会員','かいいん')+'グループコードは'+r('自動','じどう')+r('付与','ふよ')+'して、チーム'+r('単位','たんい')+'と'+r('個人','こじん')+r('単位','たんい')+'の'+r('名簿','めいぼ')+'が'+r('自動','じどう')+'で'+r('作','つく')+'られます。タグコードも'+r('自動','じどう')+'で'+r('付与','ふよ')+'されます。',
      s1_h2log: r('進行','しんこう')+r('状況','じょうきょう'),
      s1_logWait: r('待機','たいき')+r('中','ちゅう')+'…',
      /* step1 슬롯(파일 4종) */
      s1_slot_res_tag: r('必須','ひっす')+' · マスター',
      s1_slot_res_name: r('予約','よやく')+'リスト',
      s1_slot_res_desc: 'チーム/'+r('予約','よやく')+r('単位','たんい')+'マスター。eventSeq・pax・'+r('金額','きんがく')+'・'+r('備考','びこう')+'。エムクリック「'+r('出発','しゅっぱつ')+r('日別','ひべつ')+'・'+r('予約','よやく')+r('日別','ひべつ')+' → '+r('予約','よやく')+r('現況','げんきょう')+'」から'+r('取得','しゅとく')+'、500'+r('行','ぎょう')+r('分割','ぶんかつ')+r('時','じ')+'は'+r('複数','ふくすう')+'ファイル'+r('可','か')+'。',
      s1_slot_ilhaeng_tag: r('必須','ひっす')+' · '+r('個人','こじん')+r('名簿','めいぼ'),
      s1_slot_ilhaeng_name: r('同行者','どうこうしゃ')+r('別','べつ')+r('予約','よやく'),
      s1_slot_ilhaeng_desc: r('個人','こじん')+r('単位','たんい')+'。'+r('英文名','えいぶんめい')+'・'+r('生年月日','せいねんがっぴ')+'・'+r('旅券','りょけん')+'・'+r('航空便','こうくうびん')+'。エムクリック「'+r('出発','しゅっぱつ')+r('日別','ひべつ')+'・'+r('予約','よやく')+r('日別','ひべつ')+' → '+r('搭乗者','とうじょうしゃ')+r('情報','じょうほう')+'」から'+r('取得','しゅとく')+'、500'+r('行','ぎょう')+r('分割','ぶんかつ')+r('時','じ')+'は'+r('複数','ふくすう')+'ファイル'+r('可','か')+'。',
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
      po_qrScan:'📷 QR'+r('読取','よみとり'), po_qrTitle:'お'+r('客様','きゃくさま')+'の'+r('注文','ちゅうもん')+'QRを'+r('読取','よみとり'), po_qrManualPh:'QR'+r('読取','よみとり')+'できない'+r('時','とき')+'はタグコード'+r('入力','にゅうりょく')+'(例 DJマ-Y)', po_qrManualGo:r('検索','けんさく'), po_qrNoQrHint:'QRが'+r('無','な')+'い'+r('場合','ばあい')+'は'+r('閉','と')+'じて、チーム'+r('検索','けんさく')+'にタグコード・'+r('代表者','だいひょうしゃ')+'を'+r('入力','にゅうりょく'),
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
      so_update: '🔄 업데이트 있음',
      so_updateT: '이 화면의 새 버전이 있습니다. 클릭하면 새로고침됩니다(입력 중인 내용은 먼저 저장해 주세요).',
      so_footer: '본 사이트는 메리트투어가 제작·제공합니다',
      so_privacy: '개인정보처리방침',
      reset: '초기화',
      home: '홈',
      navStep1: '① 등록',
      navRoom: '② 방배정',
      navHome: '← 홈',
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
      ix_c1Cd: '예약리스트·일행별예약 2개 파일을 올리면 자동으로 정리되어 저장됩니다. 회원 그룹코드는 자동 매칭. 같은 파일을 다시 올려도 중복되지 않습니다.',
      ix_g2H: '현장 운영',
      ix_g2Desc: '등록된 데이터로 배정·정산',
      ix_c2Step: 'STEP 2',
      ix_c2H: '호텔 방배정',
      ix_c2Cd: '날짜별 체류 인원을 객실에 개인 단위로 배정합니다. 정원·기간 겹침을 자동 검증하고, 4인팀 2+2 분리 배정도 됩니다.',
      ix_goEnter: '들어가기',
      ix_cFrontH: '프론트 데스크',
      ix_cFrontCd: '실시간 도착·출발·재실 + 방번호·잔액·메모 통합 현황',
      ix_cInvRoomH: '객실 재고 · 비품',
      ix_cInvRoomCd: '객실비품·린넨·어메니티·청소용품 수량 관리',
      ix_cPosCustH: '손님 확인 화면',
      ix_cPosCustCd: '손님 앞 태블릿에 계산서를 읽기전용으로 표시. POS에서 「손님 화면 표시」로 띄웁니다.',
      ix_cInvFnbH: 'F&B 재고',
      ix_cInvFnbCd: '식자재·음료·주류·주방소모품 수량 관리',
      ix_regData: '📅 등록된 데이터', ix_teamUnit: '팀', ix_pplUnit: '명',
      ix_wxTitle: '🗻 야마나미 오늘 시간별 날씨', ix_wxNow: '지금', ix_wxHour: '시',
      ix_wxNone: '오늘 남은 시간이 없습니다(자정 이후 갱신).', ix_wxProvider: '제공: Open-Meteo · 아소',
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
      ix_gMgmt: '경영',
      ix_cStatsH: '경영 통계',
      ix_cStatsCd: '월·연 단위 입도·매출·객실 가동률·고객 구성을 통합으로 봅니다(대표·부서장 전용).',
      ix_cVisitorH: '방문 통계',
      ix_cVisitorCd: '회원/비회원 방문객 수를 일·주·월·연으로 집계(협회·현청 보고용).',
      ix_cAdmin: '권한 관리',
      ix_cAdminCd: '담당자 계정의 역할(마스터·관리담당·일반)과 접근 카드를 지정합니다.',
      ix_cAudit: '데이터 검수',
      ix_cAuditCd: '개인번호 결번·명단 불일치 등 데이터 정합성 이상을 인쇄 전에 일괄 점검합니다.',
      ix_cWatch: '특이 예약 감시',
      ix_cWatchCd: '전체 예약을 본인(이름+생년) 기준으로 스캔해 장기 체류·연속 예약 연결(체이닝) 등 편법 패턴을 검출합니다. 권한 지정자만.',
      ix_lvlMaster: 'A',
      ix_lvlMasterT: '관리자(마스터)급 · 권한 지정자만',
      ix_cGroup: '그룹코드 · 회원 마스터',
      ix_cGroupCd: '회원 그룹코드(성명+생년·등급)를 직접 등록·검색·수정합니다. 개인정보라 권한 부여된 담당자만.',
      ix_annTag: '공지',
      ix_boardOpen: '보드 열기 →',
      ix_fuTag: '🔔 확인 필요',
      ix_fuOpen: '프론트에서 처리 →',
      ix_loginH: '로그인이 필요합니다',
      ix_loginP: '상단 우측 <b>[로그인]</b> 으로 로그인하세요.<br>계정은 마스터(관리자)가 발급합니다.',
      ix_noPermH: '표시할 권한이 없습니다',
      ix_noPermP: '접근 가능한 섹션이 지정되지 않았습니다.<br>마스터(관리자)에게 권한 부여를 요청하세요.',
      ix_golfCart: '카트 배정표',
      ix_golfCartCd: '조별 카트 배정·관리 (준비중)',
      ix_c8H: '메뉴 관리',
      ix_c8Cd: 'POS·주방 화면에서 쓰는 메뉴·단가·station을 등록/편집합니다. 메뉴판을 일괄 붙여넣기로 한 번에 입력할 수 있습니다.',
      ix_g3H: '인쇄물',
      ix_gPrintDesc: '단발 인쇄 출력 (등록 데이터 기준)',
      ix_cNametagH: '네임택 인쇄',
      ix_cNametagCd: '개인 네임택 라벨(Askul 70×33.9mm 24면) — 등록 태그코드 기준',
      ix_cAircoverH: '항공커버',
      ix_cAircoverCd: '팀별 항공커버 카드(A5 가로 1장/팀) — 등록 태그코드·항공편 기준',
      ix_cDispatchH: '현지 수배서',
      ix_cDispatchCd: '행사별 수배서＋현지 발생분 기입표(A4 양면) — 등록 데이터 기준',
      ix_cDinnerH: '석식 오더',
      ix_cDinnerCd: '날짜별 석식 오더(A3 가로)＋조/중/석 식수 자동집계 — 등록 데이터 기준',
      ix_cShizuH: '시즈노야도 예약표',
      ix_cShizuCd: '시즈노야도 객실 예약표(別棟 온천 사전신청)— 방배정(room) 결과 연동 출력',
      ix_cGolfH: '골프 조편성',
      ix_cGolfCd: '상품명 기반 라운딩 날짜 자동 → 4인 1조 편성(아소·소보·쿠주)·티오프·조편성표 인쇄',
      ix_cQrCardsH: '주문 QR카드', ix_cQrCardsCd: '손님에게 주는 팀별 주문 QR카드 인쇄(手配書와 별도 · 주문 때 POS 스캔). 체크인 때 손님이 폰으로 촬영해 보관',
      ix_cNoticeH: '안내문 제작', ix_cNoticeCd: '현장용 안내문(자리 정리·카트·정숙·분리수거 등)을 입력→미리보기→인쇄. 한·일 병기·A4/B5·SaiZen 로고',
      ix_cSettleMeritH: '현지 정산표 (메리트 B2B)',
      ix_cSettleMeritCd: '메리트투어↔사이젠 B2B 정산(숙박＋송영)·차감·정산액·xlsx',
      ix_dBoard: '통합 보드판',
      ix_dBoardDesc: '전 부서 공유 · 오늘 요약',
      ix_dFront: '프론트·객실',
      ix_dFrontDesc: '방배정 · 객실',
      ix_dFnb: '식음 (F&B)',
      ix_dFnbDesc: 'POS · 주방 · 메뉴',
      ix_dGolf: '골프',
      ix_dGolfDesc: '조편성 · 카트 배정 라이브',
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
      ix_foot: '<b>SaiZen Yamanami</b> · 구마모토 아소 야마나미 리조트 운영',

      s1_step: '데이터 등록',
      s1_regStatusDone: '이미 등록된 데이터가 있습니다',
      s1_regStatusHint: '새·변경 파일이 있을 때만 다시 올리면 됩니다',
      s1_sub: '엠클릭 예약 파일 등록',
      s1_lead: '예약 관련 2개 파일을 순서대로 올리면 자동으로 정리되어 저장됩니다. 같은 파일을 실수로 다시 올려도 중복되지 않으니 안심하세요. <b>올리는 순서</b>: 예약리스트 → 일행별예약. 회원 그룹코드는 자동으로 매칭됩니다(회원마스터 기준).',
      s1_h2conn: '① 데이터베이스 연결',
      s1_lblUrl: 'Project URL',
      s1_lblKey: 'anon key',
      s1_connHint: '입력한 정보는 이 PC의 브라우저에만 저장됩니다. 공개돼도 안전한 키이니 안심하세요.',
      s1_btnRun: '데이터 등록',
      s1_btnHome: '홈으로 →',
      s1_doneTitle: '데이터 등록 완료',
      s1_btnStay: '닫기',
      s1_btnClear: '화면 비우기',
      s1_h2stats: '등록 결과',
      s1_uploaderPh: '담당자명',
      s1_h2history: '변경이력',
      s1_historyNote: '예약/일행/팀 건수',
      s1_historyEmpty: '등록 이력이 없습니다',
      s1_dyn_histFail: '이력 기록 실패',
      s1_statsNote: '예약리스트·일행별예약을 맞추고 회원 그룹코드는 자동 매칭해서, 팀 단위와 개인 단위 명단이 자동으로 만들어집니다. 태그코드도 자동으로 붙습니다.',
      s1_h2log: '진행 상황',
      s1_logWait: '대기 중…',
      s1_slot_res_tag: '필수 · 마스터',
      s1_slot_res_name: '예약리스트',
      s1_slot_res_desc: '팀/예약 단위 마스터(eventSeq·pax·금액·비고). 엠클릭 「출발일별·예약일별 → 예약현황」에서 다운로드, 500행 분할 시 여러 파일 가능.',
      s1_slot_ilhaeng_tag: '필수 · 개인명단',
      s1_slot_ilhaeng_name: '일행별예약',
      s1_slot_ilhaeng_desc: '개인 단위(영문명·생년월일·여권·항공편). 엠클릭 「출발일별·예약일별 → 탑승자정보」에서 다운로드, 500행 분할 시 여러 파일 가능.',
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
      po_qrScan:'📷 QR 스캔', po_qrTitle:'손님 주문 QR 스캔', po_qrManualPh:'QR 안 될 때 태그코드 입력 (예: DJマ-Y)', po_qrManualGo:'검색', po_qrNoQrHint:'QR이 없으면 닫고 — 팀 검색창에 태그코드·대표자를 입력하세요.',
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
      so_update: '🔄 Update available',
      so_updateT: 'A newer version of this screen is available. Click to reload (save any in-progress input first).',
      so_footer: 'This site is built &amp; provided by Merit Tour',
      so_privacy: 'Privacy Policy',
      reset: 'Reset',
      home: 'Home',
      navStep1: '① Register',
      navRoom: '② Room Assignment',
      navHome: '← Home',
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
      ix_c1Cd: 'Upload the two files — reservation list and per-companion reservations — and they are organized and saved automatically. Member group codes are matched automatically. Re-uploading the same file does not create duplicates.',
      ix_g2H: 'Field Operations',
      ix_g2Desc: 'Assign and settle using registered data',
      ix_c2Step: 'STEP 2',
      ix_c2H: 'Hotel Room Assignment',
      ix_c2Cd: 'Assigns each date\'s staying guests to rooms individually. Automatically validates capacity and date overlaps, and supports 2+2 split assignment for 4-person teams.',
      ix_goEnter: 'Enter',
      ix_cFrontH: 'Front Desk',
      ix_cFrontCd: 'Real-time arrivals / departures / in-house + room no., balance & memo',
      ix_cInvRoomH: 'Room inventory · supplies',
      ix_cInvRoomCd: 'Manage room amenities, linen, amenities & cleaning supplies qty',
      ix_cPosCustH: 'Customer Display',
      ix_cPosCustCd: 'Show the bill read-only on a guest-facing tablet. Open via “Show customer display” in POS.',
      ix_cInvFnbH: 'F&B inventory',
      ix_cInvFnbCd: 'Manage ingredients, drinks, alcohol & kitchen-supply qty',
      ix_regData: '📅 Registered data', ix_teamUnit: ' teams', ix_pplUnit: ' ppl',
      ix_wxTitle: '🗻 Yamanami hourly weather today', ix_wxNow: 'Now', ix_wxHour: ':00',
      ix_wxNone: 'No remaining hours today (updates after midnight).', ix_wxProvider: 'Source: Open-Meteo · Aso',
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
      ix_gMgmt: 'Management',
      ix_cStatsH: 'Executive Stats',
      ix_cStatsCd: 'Monthly/yearly arrivals, revenue, room occupancy, and customer mix in one view (execs only).',
      ix_cVisitorH: 'Visitor Stats',
      ix_cVisitorCd: 'Member/non-member visitor counts by day/week/month/year (assoc./prefecture report).',
      ix_cAdmin: 'Access Control',
      ix_cAdminCd: 'Assign each account’s role (master/manager/staff) and accessible cards.',
      ix_cAudit: 'Data Audit',
      ix_cAuditCd: 'Scan data-integrity issues (person-number gaps, roster mismatches, etc.) in one pass before printing.',
      ix_cWatch: 'Anomalous Booking Watch',
      ix_cWatchCd: 'Scan all bookings by person (name+birth) to detect loophole patterns like long stays and consecutive-booking chaining. Assigned holders only.',
      ix_lvlMaster: 'A',
      ix_lvlMasterT: 'Admin (master) level · assigned holders only',
      ix_cGroup: 'Group Codes · Members',
      ix_cGroupCd: 'Register, search, and edit member group codes (name+birth, grade). Personal data — granted staff only.',
      ix_annTag: 'Notice',
      ix_boardOpen: 'Open board →',
      ix_fuTag: '🔔 Follow-up',
      ix_fuOpen: 'Handle at front →',
      ix_loginH: 'Login required',
      ix_loginP: 'Log in via <b>[Login]</b> at top right.<br>Accounts are issued by the master.',
      ix_noPermH: 'No sections available',
      ix_noPermP: 'No accessible sections are assigned to your account.<br>Please ask the master (admin) to grant permissions.',
      ix_golfCart: 'Cart Assignment',
      ix_golfCartCd: 'Cart assignment & management per group (soon)',
      ix_c8H: 'Menu Admin',
      ix_c8Cd: 'Register and edit the menu items, prices, and station used by the POS and kitchen display. Bulk-paste lets you enter a whole menu at once.',
      ix_g3H: 'Printouts',
      ix_gPrintDesc: 'One-off print outputs (from registered data)',
      ix_cNametagH: 'Name Tag Printing',
      ix_cNametagCd: 'Personal name-tag labels (Askul 70×33.9mm, 24/sheet) — from registered tag codes',
      ix_cAircoverH: 'Air Cover',
      ix_cAircoverCd: 'Per-team air-cover cards (A5 landscape, 1/team) — from registered tag codes & flights',
      ix_cDispatchH: 'Field Dispatch Sheet',
      ix_cDispatchCd: 'Per-event dispatch sheet + on-site charge form (A4 duplex) — from registered data',
      ix_cDinnerH: 'Dinner Order',
      ix_cDinnerCd: 'Daily dinner order (A3) + auto breakfast/lunch/dinner counts — from registered data',
      ix_cShizuH: 'Shizu-no-Yado Chart',
      ix_cShizuCd: 'Shizu-no-Yado room reservation chart (annex onsen pre-application) — linked to room assignments',
      ix_cGolfH: 'Golf Grouping',
      ix_cGolfCd: 'Round days auto-derived from product → form 4-somes (Aso·Sobo·Kuju), tee times, print sheet',
      ix_cQrCardsH: 'Order QR cards', ix_cQrCardsCd: 'Print per-team order QR cards for guests (separate from the dispatch sheet); guests photograph at check-in, staff scan at POS',
      ix_cNoticeH: 'Notice builder', ix_cNoticeCd: 'Create on-site notices (table cleanup, cart, quiet, recycling) — type → preview → print. KO/JA bilingual, A4/B5',
      ix_cSettleMeritH: 'Local Settlement (Merit B2B)',
      ix_cSettleMeritCd: 'Merit Tour↔SaiZen B2B settlement (lodging+transfer), deductions, xlsx',
      ix_dBoard: 'Board',
      ix_dBoardDesc: 'All-dept sharing · today summary',
      ix_dFront: 'Front · Rooms',
      ix_dFrontDesc: 'Room assignment',
      ix_dFnb: 'F&B',
      ix_dFnbDesc: 'POS · Kitchen · Menu',
      ix_dGolf: 'Golf',
      ix_dGolfDesc: 'Grouping · cart assignment live',
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
      ix_foot: '<b>SaiZen Yamanami</b> · Kumamoto Aso Yamanami Resort Operations',

      /* step1 */
      s1_step: 'Data Registration',
      s1_regStatusDone: 'Data is already registered',
      s1_regStatusHint: 'Re-upload only when files are new or changed',
      s1_sub: 'Mclick reservation file registration',
      s1_lead: 'Upload the two reservation files in order and they are organized and saved automatically. Re-uploading the same file by mistake does not create duplicates, so no worries. <b>Upload order</b>: reservation list → per-companion reservations. Member group codes are matched automatically (from the member master).',
      s1_h2conn: '① Database connection',
      s1_lblUrl: 'Project URL',
      s1_lblKey: 'anon key',
      s1_connHint: 'What you enter is stored only in this PC\'s browser. It is a key that is safe even if exposed, so no worries.',
      s1_btnRun: 'Register Data',
      s1_btnHome: 'To Home →',
      s1_doneTitle: 'Data Registration Complete',
      s1_btnStay: 'Close',
      s1_btnClear: 'Clear screen',
      s1_h2stats: 'Registration Result',
      s1_uploaderPh: 'Staff name',
      s1_h2history: 'Change History',
      s1_historyNote: 'Reservation / companion / team counts',
      s1_historyEmpty: 'No registration history',
      s1_dyn_histFail: 'Failed to record history',
      s1_statsNote: 'By matching the reservation list and per-companion reservations — with member group codes matched automatically — team-level and individual-level rosters are built automatically. Tag codes are also assigned automatically.',
      s1_h2log: 'Progress',
      s1_logWait: 'Waiting…',
      s1_slot_res_tag: 'Required · Master',
      s1_slot_res_name: 'Reservation List',
      s1_slot_res_desc: 'Team/reservation-level master (eventSeq · pax · amount · remarks). Download from Mclick "By departure date · by reservation date → Reservation status"; multiple files allowed when split at 500 rows.',
      s1_slot_ilhaeng_tag: 'Required · Individual roster',
      s1_slot_ilhaeng_name: 'Per-companion Reservations',
      s1_slot_ilhaeng_desc: 'Individual level (English name · date of birth · passport · flight). Download from Mclick "By departure date · by reservation date → Passenger info"; multiple files allowed when split at 500 rows.',
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
      po_qrScan:'📷 Scan QR', po_qrTitle:'Scan guest order QR', po_qrManualPh:'If QR fails, enter tag code (e.g. DJマ-Y)', po_qrManualGo:'Find', po_qrNoQrHint:'No QR? Close and type the tag code / rep name in team search.',
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
    try { renderHelp(); } catch (e) {}   // 주입된 설명서를 현재 언어로 교체
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
  global.__so_plain = stripRuby;   // 후리가나(ruby) HTML → 평문. <option>·textContent·esc 컨텍스트용(루비 누출 방지)

  // ── 담당자(식별 라벨) — 모든 ops 페이지 상단바에 주입. 수정이력 기록용.
  //    로그인 세션이 있으면 그 이름(가입 시 입력)을 우선 사용 → 로그인=담당자 통합.
  //    로그인 안 했으면 수기 위젯값(saizen_ops_user)을 사용.
  // ── 부서 키↔라벨(전 페이지 공유) — 권한·공지·작성자 프로필 공통 ──
  var SO_DEPTS = [
    ['front', '프론트·객실'],
    ['fnb',   '식음'],
    ['golf',  '골프'],
    ['acct',  '회계'],
    ['merit', '메리트투어']
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
  global.__so_logout = authLogout;

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
      + '<div style="margin-top:11px"><a id="so-lc-fp" style="' + lcLink() + '">비밀번호를 잊으셨나요?</a></div>'
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
    card.querySelector('#so-lc-fp').addEventListener('click', function () { renderForgot(card, em.value.trim() || savedEm); });
    // 저장된 아이디가 있으면 비밀번호 칸으로 바로 포커스
    setTimeout(function () { try { (savedEm ? pw : em).focus(); } catch (e) {} }, 40);
  }

  // ── 비밀번호 찾기 — 재설정 메일 발송(resetPasswordForEmail) ──
  //   수신부는 이미 구현됨: 메일 링크(#type=recovery) → handleAuthRedirect → 「비밀번호 설정」 카드.
  //   · 자가 회원가입 정책과 무관(기존 계정만 동작, 신규 계정을 만들지 않음).
  //   · 계정 존재 여부는 알려주지 않음(계정 탐색 방지) — 성공 안내는 항상 동일.
  //   ⚠ Supabase 기본 SMTP는 발송 한도가 낮음. 메일이 안 오면 마스터가 Dashboard에서 발송/직접 변경.
  function opsRootUrl() {
    try { var m = String(location.pathname || '').match(/^(.*\/ops\/)/); return location.origin + (m ? m[1] : '/ops/'); }
    catch (e) { return location.origin + '/ops/'; }
  }
  function renderForgot(card, presetEmail) {
    card.innerHTML =
        '<div style="font-size:19px;font-weight:800;color:var(--accent,#647548)">비밀번호 찾기</div>'
      + '<div style="margin-top:6px;color:var(--text2,#566049);font-size:12px;line-height:1.5">가입된 이메일로 <b>재설정 링크</b>를 보내드립니다.<br>메일의 링크를 열면 새 비밀번호를 정할 수 있습니다.</div>'
      + '<input id="so-fp-em" type="email" placeholder="이메일" autocomplete="username" spellcheck="false" value="' + escU(presetEmail || '') + '" style="margin-top:16px;' + lcInput() + '">'
      + '<div id="so-fp-err" style="display:none;margin-top:10px;color:#b13b2c;font-size:12.5px;font-weight:600"></div>'
      + '<div id="so-fp-ok" style="display:none;margin-top:12px;color:#2f7d4f;font-size:12.5px;font-weight:700;line-height:1.6"></div>'
      + '<button type="button" id="so-fp-go" style="margin-top:16px;' + lcBtn() + '">재설정 메일 보내기</button>'
      + '<div style="margin-top:12px"><a id="so-fp-back" style="' + lcLink() + '">← 로그인으로</a></div>';
    var em = card.querySelector('#so-fp-em'), err = card.querySelector('#so-fp-err'),
        ok = card.querySelector('#so-fp-ok'), btn = card.querySelector('#so-fp-go');
    function fail(m) { ok.style.display = 'none'; err.textContent = m; err.style.display = 'block'; btn.disabled = false; btn.textContent = '재설정 메일 보내기'; }
    function go() {
      var c = authClient(); var e = em.value.trim();
      if (!c) { fail('연결 정보가 없습니다.'); return; }
      if (!e || e.indexOf('@') < 0) { fail('이메일을 입력하세요.'); return; }
      err.style.display = 'none'; btn.disabled = true; btn.textContent = '보내는 중…';
      c.auth.resetPasswordForEmail(e, { redirectTo: opsRootUrl() }).then(function (res) {
        if (res && res.error) { fail('발송 실패: ' + res.error.message); return; }
        btn.style.display = 'none';
        ok.innerHTML = '재설정 메일을 보냈습니다.<br>메일함(스팸함 포함)을 확인해 주세요.'
                     + '<br><span style="color:var(--muted,#8a937c);font-weight:600">링크는 1회용이며 일정 시간 후 만료됩니다.</span>';
        ok.style.display = 'block';
      }).catch(function (ex) { fail('발송 오류: ' + ex.message); });
    }
    btn.addEventListener('click', go);
    em.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    card.querySelector('#so-fp-back').addEventListener('click', function () { renderLogin(card); });
    setTimeout(function () { try { em.focus(); } catch (e) {} }, 40);
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
        if (rr.error || !rr.data || !rr.data[0]) return { role: 'staff', areas: [], read_areas: [], name: '', dept: '', title: '', active: true };
        var a = rr.data[0];
        return { role: a.role, areas: a.areas || [], read_areas: a.read_areas || [], name: a.name || '', dept: a.dept || '', title: a.title || '', active: a.active !== false };
      }).catch(function () { return { role: 'staff', areas: [], read_areas: [], name: '', dept: '', title: '', active: true }; });
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
    if (file === 'room.html') return;   // room은 전용 '방배정 변경 이력'(change_log) 보유 → 범용 패널 중복 제외
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
    } else if (kind === 'blocked') {
      var bw = document.createElement('div');
      bw.innerHTML = '<div style="font-size:18px;font-weight:800;color:#b13b2c">🚫 차단된 계정</div>'
        + '<div style="margin-top:10px;color:#566049;font-size:13.5px">이 계정은 사용이 정지되었습니다. 마스터(관리자)에게 문의하세요.</div>'
        + '<div style="margin-top:16px"><button onclick="window.__so_logout&&window.__so_logout()" style="border:1px solid #cdd2d8;background:#fff;color:#566049;font-weight:700;border-radius:6px;padding:6px 14px;cursor:pointer">로그아웃</button></div>';
      d.appendChild(bw);
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
      if (acc.active === false) { showGuard('blocked'); return; }  // 차단된 계정 → 전면 차단
      if (areas.indexOf('admin') >= 0) { if (acc.role === 'admin') return; showGuard('deny'); return; }
      // stats(경영 통계) = admin 또는 'stats' 영역 명시 보유자만(매니저 자동통과 제외 — 대표·부서장 중 지정자만)
      if (areas.indexOf('stats') >= 0) {
        if (acc.role === 'admin') return;
        if ((acc.areas || []).indexOf('stats') >= 0) return;
        showGuard('deny'); return;
      }
      if (acc.role === 'admin') return; // 마스터만 전 접근. 매니저도 지정 영역만(아래 areas/read_areas 검사).
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
    'room.html': '<h4>이 화면이 하는 일</h4><b>개인 단위</b> 객실 배정. 자동배정·분할체류·타임라인·기간폐쇄.<h4>계산·판정(자동배정)</h4><ul><li><b>예약순 선착</b>: 빠른 예약 팀부터.</li><li><b>명단 순서대로 짝(1·2, 3·4)</b> — 일행별예약 순서(룸메 의도)를 그대로 지킴. <b>짝에 회원이 1명이라도 있으면 그 방을 디럭스</b>, 없으면 예약종류(트윈·컴팩트). 각 풀 <b>고층부터</b>, 디럭스 부족 시 예약순으로 차지·나머지는 예약종류로 강등.</li><li><b>같은 팀 같은 층</b>: 2방 이상이면 팀 전체가 들어갈 한 층으로 묶어 배정(층 모자라면 분산).</li><li><b>재배정=전체 재배치</b>: auto만 지우고 처음부터. 수기·분할(✂)은 보호.</li><li><b>↩ 직전 작업 되돌리기</b>: 「월별 자동배정」·「전체 비우기」·「층 비우기」를 실수로 눌렀을 때 <b>직전 1회</b>를 통째로 복구(버튼은 그 작업 직후에만 노출, 새로고침하면 사라짐).</li><li><b>싱글·트리플은 자동배정 제외</b>: 현지비고에 「싱글」 표기가 있는 팀과 3명(트리플) 팀은 짝(1·2,3·4)이 안 맞아 <b>미배정으로 두고 수기 배정</b>합니다(보류 사유 표시).</li><li><b>정원</b>: 하룻밤 겹침 체크(다른 달 포함). 폐쇄 기간 방 제외.</li></ul><h4>주요 용어</h4><b>태그코드</b>=3자리 그룹코드(<code>F</code>접두=비회원). <b>회원 판정</b>=고객등급·회원권구분·회원구분 <b>셋 중 하나라도 회원이면 회원</b>. <b>분할(✂)</b>=기준일부터 다른 방.<h4>배정 검색</h4>상단 고정 바의 <b>🔎 배정 검색</b>에 태그코드·한글명·영문명·행사번호를 입력하면 그 사람이 <b>어느 방·어느 날짜</b>에 배정됐는지 목록으로 뜨고, 클릭하면 그 날짜 카드로 점프해 방을 강조합니다.<h4>변경 이력</h4>하단 <b>🕘 방배정 변경 이력</b>에서 누가·언제 배정/해제/분할/자동배정했는지 조회(검색·더보기). <b>자동배정 재배치는 사람별 「↪️ 이동」(A호→B호)으로도 기록</b>되어 누가 어디서 어디로 갔는지 추적됩니다.<h4>조기 퇴실(🛫)</h4>1~2명만 예정보다 일찍 귀국할 때 멤버 칩의 <b>🛫</b>를 눌러 실제 퇴실일을 입력합니다. <b>그 사람만</b> 처리되고(팀 전체 아님), 침대가 그날부터 비워집니다(남은 방·분할도 자동 단축). 같은 🛫를 다시 누르면 해제. 처리하면 <b>「확인 필요」(정산/환불) 항목이 자동 생성</b>돼 프론트데스크에서 놓치지 않게 알립니다. 남은 인원 방 변경은 ✂ 이동으로. <b>B2B 정산은 불변</b>(환불은 현장 御請求書). 夕食 식수도 자동 차감됩니다.<h4>싱글차지 → 정산</h4>간지·시즈노야도 1인 사용 추가요금(¥4,400/박 등)을 <b>「현장청구」로 기록하면 그 팀 御請求書에 자동 청구</b>됩니다(메리트 선불 표시 시 청구 없음). 배정 해제하면 청구도 자동 제거(DB 트리거).<h4>권한·데이터</h4>room 영역. rooms·room_inventory·room_closures·guest_members(actual_dep)·followups·change_log·transactions(싱글차지→charges 자동).',
    'nametag.html': '<h4>이 화면이 하는 일</h4>개인별 <b>네임택 라벨</b>(Askul 24면)을 인쇄합니다. step1에서 계산된 값을 읽어 출력(재계산 없음).<h4>주요 용어</h4><b>태그코드</b>=그룹코드+개인번호(<code>DAあ-1Y</code>). 끝글자(Y·K·G·S)=숙소 구분.<h4>권한·데이터</h4>print(인쇄) 영역. guests·guest_members 읽기.',
    'golf.html': '<h4>이 화면이 하는 일</h4>골프 <b>조편성</b>(4인 1조)을 만들고 <b>조편성표</b>를 인쇄합니다.<h4>라운딩 날짜(자동)</h4>엠클릭 <b>상품명</b> 기준으로 팀별 라운딩 날짜를 자동 추출합니다: <b>입국일=ICN 팀만</b>, <b>중간 체류일=전원</b>, <b>귀국일=PUS 팀만</b>. 날짜 칩에 그날 라운딩하는 팀이 잡힙니다.<h4>쓰는 법</h4><ul><li>월(◀▶)·라운딩 날짜 선택 → 왼쪽 <b>미편성</b> 인원(팀·성별 ♂♀)을 클릭해 선택.</li><li><b>선택 → 조에 추가</b>(새 조) 또는 오른쪽 <b>조 카드를 클릭</b>해 그 조에 넣기(최대 4명).</li><li>조마다 <b>코스(아소·소보·쿠주)·티오프 시각</b> 지정. 코스는 인기순(아소&gt;소보&gt;쿠주)으로 자동 균형 배분.</li><li><b>🪄 팀 우선 자동</b>=팀별 4인씩 조를 자동 생성. <b>남/여</b> 버튼=풀에서 성별로 일괄 선택(남자끼리·여자끼리 편성).</li><li><b>💾 저장</b> → 그날 편성 저장(재저장은 그날 전체 교체). <b>🖨 인쇄</b>=조편성표.</li></ul><h4>권한·데이터</h4>golf 영역. bookings·guests·passengers(성별)·guest_members 읽기 / golf_groups·golf_group_members 쓰기. ※카트 배정·중간 교체는 다음 단계.',
    'aircover.html': '<h4>이 화면이 하는 일</h4>팀별 <b>A5 항공커버</b> 1장(가로). 개인 항공편·시설색.<h4>계산·판정</h4><ul><li>대표=<code>is_rep</code> 우선.</li><li><b>시설색·라벨</b>=태그 끝글자(Y/K/G/S).</li><li>항공편 ZE→PUS·TW→ICN 보정.</li><li>태그·인원 <b>인라인 수정</b>=print_overrides 공유 → 석식과 동기.</li></ul><h4>주요 용어</h4>태그코드(3자리, F접두=비회원).<h4>권한·데이터</h4>print(인쇄) 영역. 태그·인원 수정은 print 또는 room 권한 필요.',
    'qrcards.html': '<h4>이 화면이 하는 일</h4>손님에게 주는 <b>팀별 주문 QR카드</b>를 인쇄합니다(手配書와 별도, 손님 전용 소품). 체크인 때 손님이 폰으로 찍어 두면, 주문 때 POS에서 그 QR을 스캔해 팀이 자동 선택됩니다.<h4>쓰는 법</h4><ul><li>월(◀▶) 선택 → 그날 <b>入国日·숙소 칩</b>으로 대상 팀을 좁힙니다(체크인 팀만 뽑기 좋음).</li><li><b>[🔳 QR카드 인쇄]</b> → A4에 팀별 미니 카드(이름+QR+안내문) 여러 장. 잘라서 체크인 때 보여주면 손님이 촬영.</li><li>토큰은 팀 고유 랜덤값 — 처음 열 때 자동 발급(발급은 print/room 권한).</li></ul><h4>주의</h4>카드엔 <b>이름·QR·안내문만</b> 담겨 다른 손님 정보는 없습니다. QR 없이 온 손님은 POS에서 검색 후 <b>「이 팀 맞습니까?」</b> 확인으로 처리합니다.',
  'dispatch.html': '<h4>이 화면이 하는 일</h4>행사별 <b>A4 양면</b> — 앞=現地手配書, 뒤=現地発生分 記入表.<h4>주문 QR 카드는 별도 페이지</h4>손님에게 주는 <b>주문 QR카드</b>는 랜딩 인쇄물의 <b>「주문 QR카드」</b> 카드(전용 페이지)에서 인쇄합니다. 手配書 본문엔 QR을 넣지 않습니다(다른 정보 노출 방지). 토큰은 手配書를 열 때 팀별로 자동 발급됩니다.<h4>계산·판정</h4><ul><li>라운딩 일정 자동·部屋数=<code>ceil(pax/2)</code>室.</li><li><b>마스킹 토글</b>: ON=생년월일까지 / OFF=여권·전화 노출.</li><li>記入表(뒷면)=현장 손기입, B2B 정산과 별개.</li><li><b>EVカート·룸차지 자동 반영</b>: 엠클릭 <b>현지 비고</b>(비고·참고사항 포함)에 「전기카트 2대」·「룸 업그레이드」처럼 적혀 있으면 → <b>앞면</b>에 「EVカート 申請」 전용 섹션으로 강조, <b>뒷면 記入表</b>엔 해당 区分(①룸차지·②EV카트)에 ○가 찍히고 内容이 미리 채워집니다(금액·수량·담당은 현장 손기입). 적힌 게 없으면 앞면은 「申請なし」, 뒷면은 빈 양식 그대로.</li><li><b>참고사항1·참고사항2 열</b>: 예약리스트의 <b>비고</b>(참고사항1)·<b>현지비고</b>(참고사항2)를 목록에 표시. <b>참고사항2</b>(特食·온천·별관 등 <b>현장 필수</b>)는 빨강 강조. <b>現地메모</b>는 운영팀이 직접 쓰는 별도 메모(구분).</li><li><b>「팀:A,B」 자동 묶기</b>: 예약 비고에 「팀:…」이 있으면 등록(step1) 때 그 대표명으로 팀을 찾아 手配書·夕食에 자동 묶음. 한쪽 비고에만 적혀도 됨. 수동 묶기는 보존.</li></ul><h4>권한·데이터</h4>print(인쇄) 영역.',
    'dinner.html': '<h4>이 화면이 하는 일</h4>날짜별 <b>夕食オーダー</b>(A3) + 조·중·석 <b>식수 자동집계</b> + <b>レストラン名札</b> 인쇄.<h4>계산·판정</h4><ul><li>식수=숙소 그룹별 규칙. <b>석식=그날 묵는 전원</b>.</li><li><b>조기 퇴실 반영</b>: 방배정에서 🛫 조기 퇴실 처리한 인원은 끼니 경계대로 자동 차감 — <b>퇴실일 아침까지는 포함</b>, 점심·저녁부터 제외. 인쇄 명단·합계에 <code>早期退室 −N</code> 표기.</li><li><b>レストラン名札 = 운영팀 단위 합석</b>: 現地手配書에서 묶은 운영팀(team_group)이 <b>명패 1장으로 자동 합석</b>(대표자·태그 모두 표기·인원 합산). 같은 운영팀 중 <b>석식만 따로</b> 낼 팀은 「✂ 석식 분리」로 단독 명패로 뺀다(「↩ 합석 복원」 되돌림). 식수 집계는 그대로(각 팀 인원 유지).</li><li><b>제외(병합)</b>: 한 팀 지우고 다른 팀에 인원 취합 → 명단·식수에서 빠짐(묶기와 달리 명단에서 사라짐).</li></ul><h4>別注 → 정산 자동청구</h4>단가가 있는 <b>추가·업그레이드 別注를 등록하면 그 팀 御請求書(정산)에 자동으로 청구</b>가 잡힙니다(업그레이드=차액, 알레르기=청구 없음). 별주를 수정·삭제하면 청구도 자동으로 따라갑니다(DB 트리거). 팀 정산 계정이 없으면 자동 개설됩니다.<h4>주요 용어</h4>태그코드. レストラン名札은 운영팀(現地手配書) 단위 합석 · 「석식 분리」로 운영팀 중 그 팀만 단독 명패.<h4>권한·데이터</h4>print(인쇄) 영역. 태그·인원·묶기 저장은 print 또는 room 권한 필요. 別注 청구는 charges(트리거가 생성, 정산은 settle/pos 영역에서 열람).',
    'shizu.html': '<h4>이 화면이 하는 일</h4><b>志津の宿 予約表</b>(시즈노야도 료칸 객실 예약표)를 만들고 <b>객실 배정 보드</b>로 개인 단위 배정합니다. 7객실=本館 4(志津·合歓·北條·山法師)·別棟 3(吉祥·瑞雲·馬酔木).<h4>배정</h4><ul><li><b>객실 배정 보드</b>: 왼쪽 미배정에서 인원 선택 → 오른쪽 객실 클릭으로 배정. 이름 클릭=이동·✕=미배정·드래그도 가능. <b>배정·이동·해제·전체비우기·자동배정은 모두 직후 <u>↩ 되돌리기</u></b>(6초 토스트)로 전단계 복원. 여러 명 이동 시 정원(3)에 막힌 인원은 <b>건너뜀 N</b>으로 알리며, 그대로 섞였다면 ↩로 되돌리세요. <b>검색</b>(이름·영문명·대표자·행사번호)으로 찾아 그 날짜로 점프.</li><li><b>🪄 월별 자동배정</b>: 표시 중인 <b>그 달만</b> 배정(다른 달 무영향). <b>2인 페어·빈 방만</b> 채우고 홀수 1명·3인은 미배정으로 둠(수기 보완). <b>순서 — 일반팀: 本館 201·202·204(志津·合歓·山法師) → 203(北條) → 離れ 301·302·303(吉祥·瑞雲·馬酔木). 別棟 선호팀: 離れ(吉祥·瑞雲·馬酔木) 먼저→本館→北條. 北條(203)는 완전 최후가 아니라 <u>本館 중 후순위</u>(別棟보다 먼저)</b>.</li><li><b>정원 2 + 강제 1명</b>: 수기로 최대 3인까지. 3인 방은 「3/2 超過」로 붉게 표시.</li><li><b>번들예약</b>(야마나미+시즈 한 예약)은 예약기간 전체가 아니라 <b>실제 시즈 숙박 구간만</b> 미배정(未) 계산(현지비고 「M/D-M/D 시즈」 파싱·배정된 방 기준).</li></ul><h4>메모·표기</h4><ul><li><b>参考事項</b>=<b>현장 직접입력</b>(트리플룸·합팀 등 현장 필요한 것만 일본어로, 방 칸 클릭·팀 단위 자동 저장). ※한국 현지비고 자동표시는 폐지(한국어라 현장 무의미) — 긴 특이사항은 담당자에게 직접 전달. <b>現地메모</b>=방 칸 클릭해 직접 입력(팀 단위·자동 저장).</li><li><b>♨ 별채(내탕)</b>: 현지비고에 별채신청·내탕신청·온천신청 등 키워드가 있으면 別棟 방에 ♨ 자동 표기. 사전신청=<b>+2,000엔/인·박=19,000엔</b>(별채 3방·메리트 B2B).</li><li><b>現地예약 구분</b>: 메리트 B2B가 아닌 <b>현장 워크인 예약</b>은 <b>「現地」 배지</b>로 표시(배정보드·미리보기·인쇄·xlsx 공통) — 현장에서 한눈에 구분.</li><li>날짜 칩에 <b>入N/出N</b>(체크인/체크아웃 팀)·<b>未N</b>(미배정). 월 선택↔보드 사이에 그날 <b>체크인/체크아웃 팀 요약</b>.</li></ul><h4>출력</h4>화면 예약표를 <b>그대로 인쇄</b>(팝업 없음·2일/장·큰 글씨) + <b>予約表 xlsx</b>·날짜별 인쇄. 全角 표기.<h4>권한·데이터</h4><b>shizu 영역</b>(admin.html에서 지정). rooms·guest_members·passengers 읽기 + shizu_team_memo(現地메모)·shizu_memo 쓰기(shizu/room 영역).',
    'keytag.html': '<h4>이 화면이 하는 일</h4>체크인 때 <b>팀과 키홀더(QR/FOB)를 연결</b>합니다.<h4>흐름</h4><ul><li>① 체크인일 기준 체류 팀을 불러와 그룹코드·대표자로 검색·선택.</li><li>② 키홀더의 FOB 코드를 스캔/입력해 그 팀에 바인딩(같은 FOB가 이미 다른 팀에 묶여 있으면 자동 해제 후 재연결).</li><li>활성 바인딩 목록에서 해제할 수 있습니다.</li></ul><h4>권한·데이터</h4>room 영역. key_bindings(활성 바인딩)·guests(팀).',
    'inventory.html': '<h4>이 화면이 하는 일</h4>F&B·객실 <b>재고 관리</b>. 품목별 현재고·적정재고·부족 알림 + 입출고 원장.<h4>흐름</h4><ul><li><b>부서 토글</b>: F&B(주방)·객실 — 부서별 품목만(URL <code>?dept=room</code>/<code>kitchen</code>).</li><li>품목에 <b>+입고 / −사용 / 실사</b> 기록 → 현재고 자동 갱신 + 원장(최근 이력)에 남음.</li><li>현재고가 적정재고 미만이면 <b>부족 알림</b>.</li></ul><h4>권한·데이터</h4>F&B=kitchen · 객실=room 영역(URL dept 전환). inv_items·inv_txns.',
    'settle.html': '<h4>이 화면이 하는 일</h4>체크아웃 <b>명세서(御請求書)</b>. 팀별 청구·결제·잔액.<h4>실시간 반영</h4>POS 주문·결제가 <b>약 20초마다 자동 반영</b>됩니다(열어둔 계산서에 새 청구가 바로 추가, 목록 잔액도 갱신). 모달·입력 중엔 방해하지 않게 건너뜁니다. 안 보이면 보고 있는 <b>월(session)</b>이 그 팀과 같은지 확인하세요.<h4>계산·판정</h4><ul><li><b>잔액=청구합계−결제합계</b>.</li><li>미개설 팀=청구 0=<b>잔액 ¥0</b>(클릭하면 청구 추가, 계정 자동개설).</li><li>개인 분할이 있으면 folio 묶음(팀+개인 합계).</li></ul><h4>주요 용어</h4>현장 추가요금(추가라운드·미니바 등) — B2B 선계약과 <b>별개</b>.<h4>권한·데이터</h4>settle 영역. folios·charges·payments.',
    'settle_merit.html': '<h4>이 화면이 하는 일</h4>메리트↔사이젠 <b>B2B 선계약</b> 정산표.<h4>계산·판정</h4><ul><li><b>숙박비=인원×박수×숙소단가</b>(야마나미·쿠주 14,000 / 간지 16,000 / 시즈 17,000).</li><li><b>송영비=인원×¥6,000</b>.</li><li>인원=<b>실제 명단 수</b>(예약 pax보다 우선). 차감·비고만 별도 저장.</li></ul><h4>주요 용어</h4>B2B(현장 추가요금과 혼동 금지).<h4>권한·데이터</h4>settle 영역.',
    'pos.html': '<h4>이 화면이 하는 일</h4>주문 입력(간이 POS). 팀 기본 + 개인 분할.<h4>QR로 팀 선택</h4>손님이 現地手配書 QR을 보여주면 <b>[📷 QR 스캔]</b>으로 카메라 스캔 → 그 팀이 즉시 선택됩니다(카메라 불가 시 <b>카드에 보이는 태그코드/그룹코드 입력</b>). 폰 기본 카메라로 찍어 <b>청구 페이지가 열린 경우</b>에도, 직원이 로그인 상태면 그 화면 상단에 <b>직원 모드</b> 바가 떠서 [POS 주문]으로 넘어오면 <b>그 팀이 자동 선택</b>됩니다(<code>?seq=</code>). 두 경로 모두 그날 체류 목록에 없어도 그 팀을 직접 찾아 엽니다. 손님이 스캔하면 직원 모드 바는 보이지 않습니다. 이후 주문은 기존과 동일(주방 티켓·정산 청구로 반영).<h4>계산·판정</h4><ul><li><b>분할</b>: 팀공통 / 특정 1인 / N분의1 → charges + 개인 folio 자동 생성.</li><li><b>주방 티켓</b>=분할 무관 <b>풀수량·팀단위</b>.</li><li>회원 배지=고객등급·회원권구분·회원구분 3컬럼 OR.</li></ul><h4>주요 용어</h4>매장(outlet)=프론트/레스토랑·연회/골프샵.<h4>권한·데이터</h4>pos 영역. charges·folios.',
    'kitchen.html': '<h4>이 화면이 하는 일</h4>주방·바 <b>주문 티켓 화면(KDS)</b>.<h4>계산·판정</h4><ul><li>티켓 <b>신규 → 접수 → 완료</b> 3단계(접수 시 담당 기록).</li><li>품목별 <b>조리 라우팅</b>(station): 주방/바/프론트.</li></ul><h4>권한·데이터</h4>kitchen 영역. kitchen_tickets.',
    'menu.html': '<h4>이 화면이 하는 일</h4>메뉴 품목 관리(장소·라인별).<h4>계산·판정</h4><ul><li><b>코드 자동채번</b>=장소 prefix+번호(<code>FR1</code>·<code>GS1</code>).</li><li>이미 적용된 코드는 <b>잠금</b>(수정 불가).</li><li>모든 변경은 이력(change_log)에 기록.</li></ul><h4>주요 용어</h4><b>장소(venue)</b>=판매처·코드 prefix / <b>라인(category)</b>=정산 집계 기준(<code>숙박</code>은 화면에 「룸」 표시).<h4>권한·데이터</h4>menu 영역. menu_items.',
    'board.html': '<h4>이 화면이 하는 일</h4>부서 <b>공지</b> + <b>오늘 요약</b>(JST 기준 체크인·아웃·주문·매출 집계).<h4>권한·데이터</h4>읽기=로그인 전원 / 공지 쓰기·핀·정렬=admin·manager / <b>삭제=작성자 본인 또는 마스터(admin)</b>.',
    'notes.html': '<h4>이 화면이 하는 일</h4>행사(팀)별 <b>팀 라벨·야마나미 코스·비고·메모</b>를 남깁니다.<h4>계산·판정</h4>값은 포커스 벗어나면 자동 저장. 모든 수정은 <b>누가·언제·이전→이후</b>로 이력에 남습니다.<h4>권한·데이터</h4>notes 영역. event_notes·event_note_log.',
    'groupcodes.html': '<h4>이 화면이 하는 일</h4><b>회원 마스터(개인정보)</b> 관리 + 빈코드 피커. <b>groupcodes 영역(admin 또는 부여받은 담당자)</b>.<h4>계산·판정</h4><ul><li>그룹코드 3자리=<b>등급 prefix + 영문(18종) + 가나(33종)</b>.</li><li><b>빈코드 피커</b>: 등급별 18×33 그리드 — <b>초록=빈 코드</b>(0명, 바로 배정) / <b>앰버=합류 가능</b>(1~3명) / 회색=4명+.</li></ul><h4>주요 용어</h4>F풀=비회원. 등급 prefix=다이아[D·M]·골드[G]·EWRC[E·W·R·C] 등.<h4>권한·데이터</h4><b>groupcodes 영역(PII)</b> — admin.html에서 신뢰 담당자에게만 부여. member_codes.',
    'frontdesk.html': '<h4>이 화면이 하는 일</h4>실시간 <b>도착·출발·재실</b> + 팀별 방번호·잔액·메모 통합 현황. 프론트=바=레스토랑 한 화면(테이블 관리는 미도입 — 명패는 계속 출력).<h4>계산·판정</h4><ul><li>🛬체크인=<code>dep===오늘</code> / 🛫체크아웃=<code>arr===오늘</code> / 🏨체류중(연박)=그 사이 / 🍽석식=그날 묵는 전원.</li><li>잔액=청구−결제 합산. <b>KPI 클릭→해당 라인 스크롤</b>.</li><li><b>숙소 칩</b>으로 리스트·KPI 필터.</li></ul><h4>실시간 반영</h4>POS에서 주문·결제가 들어오면 이 화면이 <b>약 25초마다 자동 갱신</b>돼 잔액·미수에 바로 반영됩니다(비고/메모 입력 중엔 건너뜀). 즉시 보려면 ↻로 새로고침. ※다른 <b>월/날짜</b>를 보고 있으면 그 주문 팀이 안 보일 수 있어요 — 주문한 팀의 체류월로 맞추세요.<h4>운영 상태 한눈에</h4>팀 상세에 각 섹션 입력이 배지로 모입니다 — <b>💎회원(등급) · 🛫조기퇴실 · 🍽夕食除外 · ✂석식분리 · 🔗운영팀 · 🗝키택발급 · 🔔확인필요</b>(💎은 팀 내 회원 수·등급을 서열 없이 라벨 그대로)(🔔은 클릭 시 해당 처리화면으로). 여러 화면을 안 돌아도 한 팀의 상태를 한 곳에서 확인.<h4>비고·메모 인라인 편집</h4>팀 클릭 → 상세에서 <b>비고(운영)·메모를 그 자리에서 바로 입력</b>(입력칸을 벗어나면 자동 저장, 변경이력 기록). 별도 메모 페이지에 들어갈 필요 없이 일하는 화면에서 남기고, 現地手配書·재실 현황과 같은 event_notes를 공유합니다.<h4>바로가기</h4>팀 클릭 → 상세에서 <b>정산</b>(그 팀 자동 열기)·<b>방배정</b>(그 날짜)로 점프.<h4>🔔 확인 필요(후속 조치)</h4>조기 퇴실 등으로 <b>다른 메뉴에 후속 작업</b>(예: 정산 환불)이 생기면 상단 패널에 모입니다. <b>[처리하기]</b>로 해당 화면(딥링크)으로 바로 가고, 끝내면 <b>[완료]</b>로 닫습니다. 미완료 N건은 랜딩 <b>🔔 배지</b>에도 떠서 어느 PC에서든 보입니다. 로그인한 담당자 누구나 완료할 수 있습니다.<h4>체크아웃 처리</h4><b>🛫 오늘 체크아웃</b> 섹션에서 처리합니다 — 팀 상세의 <b>[✓ 체크아웃]</b>(1건), 행 <b>체크박스 + [선택 체크아웃]</b>(여러 건), <b>[오늘 퇴실 전체]</b>(검색 중이면 보이는 것만). 처리된 팀은 흐리게 + <b>체크아웃 완료</b> 배지. 잘못 눌렀으면 상세에서 <b>[↩ 체크아웃 취소]</b>.<br>⚠ <b>정산완료 판정은 이 버튼</b>입니다(잔액 0 자동판정 아님 — 아무것도 안 산 팀은 입실 첫날부터 잔액 0이라 도착하자마자 처리돼 버립니다). <b>잔액이 남아도 막지 않습니다</b>(후불·B2B 이월) — 금액을 보여주고 확인만 받습니다. 체크아웃하면 <b>주문·청구 QR이 만료</b>됩니다.<h4>권한·데이터</h4>front(프론트 데스크) 영역. 읽기 집계(데이터 변경 없음) · 확인 필요(followups)는 로그인 전원 읽기/완료. 체크아웃은 <code>guests.check_status</code>(체크인전/체크인/체크아웃)를 RPC <code>set_check_status</code>로 갱신(front·room·settle 영역, 변경이력 기록).',
    'admin.html': '<h4>이 화면이 하는 일</h4>계정 <b>역할·영역 지정</b> + 가입요청 처리. <b>마스터 전용</b>.<h4>계산·판정</h4><ul><li>역할 <b>admin / manager / staff</b> + 영역(step1·room·settle·pos·kitchen·menu·notes·<b>stats</b>).</li><li><b>admin(마스터)=전 통과</b> / <b>manager·staff=지정 영역만</b> — 역할은 구분이고, 화면 노출·접근은 <b>지정한 영역만</b>(매니저도 자동통과 안 함). 경영 통계(stats)=admin 또는 stats 지정자.</li></ul><h4>비밀번호 재설정</h4>담당자가 비밀번호를 잊으면 <b>로그인 화면의 「비밀번호를 잊으셨나요?」</b>로 본인이 재설정 메일을 받을 수 있습니다(마스터 개입 불필요). 메일이 안 오면 Dashboard <b>Authentication → Users → ⋯ → Send password recovery</b>로 발송하거나 비밀번호를 직접 지정하세요. ⚠ 링크는 1회용·만료 있음.<h4>권한·데이터</h4>admin 전용. user_access·access_requests.',
    'stats.html': '<h4>이 화면이 하는 일</h4>대표·부서장용 <b>월/연 통합 통계</b>. 기간(이번 달·올해·작년·최근 12개월·범위)을 고르면 입도·매출·가동률·고객구성을 한 화면에 집계합니다. <b>읽기 전용</b>(데이터 변경 없음).<h4>계산·판정</h4><ul><li><b>입도(送客)</b>=현지 체크인(<code>dep_date</code>) 기준·인원=<b>예약 인원</b>. 숙소별·출발지(ICN/PUS)별 분해.</li><li><b>B2B 매출</b>=인원×박수×숙소단가+인원×¥6,000(야마나미·쿠주 14,000 / 간지 16,000 / 시즈 17,000).</li><li><b>현장 매출</b>=charges(취소 제외·JST 기준), <b>현금/카드/미지정</b> 분리 + 구분별.</li><li><b>회원 비율</b>=member_grade·member_class·member_div 3컬럼 OR(하나라도 회원이면 회원), 등급별.</li><li><b>객실 가동률</b>=사용 침대-박 ÷ (가동 객실 정원×기간 일수). 체크인 월 귀속 <b>근사치</b>.</li></ul><h4>주요 용어</h4>B2B(메리트 선계약)와 현장 매출은 <b>별개</b>. 가동률은 침대(정원) 기준.<h4>권한·데이터</h4><b>stats 영역</b> — admin 또는 stats 지정자만(매니저 자동통과 아님). 집계 RPC <code>exec_stats</code>(서버 합산, security definer).',
    'visitor_stats.html': '<h4>이 화면이 하는 일</h4><b>방문 통계(골프장 협회·현청 보고용)</b>. 기간(일·주·월·연 단위 토글)을 골라 <b>회원/비회원 방문객 수</b>를 집계합니다. <b>읽기 전용</b>.<h4>계산·판정</h4><ul><li><b>방문</b>=일행 1인 1체류(현지 체크인 <code>dep_date</code> 기준)=1연인원.</li><li><b>회원 판정</b>=고객등급·회원권구분·회원구분 3컬럼 OR(하나라도 회원이면 회원).</li><li><b>성별·나이대(만나이 10세 구간)·개인 회원별 방문 횟수</b> 분해.</li><li>営業日報의 <b>韓国メンバー/韓国ビジター(宿泊)</b>에 대응.</li></ul><h4>주요 용어</h4>경영 통계(돈)와 <b>분리</b> — 여기는 인원 보고 전용.<h4>권한·데이터</h4><b>report 영역</b> — admin 또는 report 지정자만. 집계 RPC <code>visitor_stats</code>(서버 합산, security definer).',
    'audit.html': '<h4>이 화면이 하는 일</h4>데이터 <b>정합성 이상</b>을 인쇄·실사용 전에 한 번에 점검합니다. <b>마스터(admin) 전용</b>. [재검수]로 실행 → 항목별 건수·표본(행사번호)을 보여줍니다.<h4>점검 항목</h4><ul><li><b>개인번호 결번</b>: 네임택 개인번호가 팀 내 1..N 연속이 아님(과거 임포트 잔재). 인쇄는 자동 재부여로 정상, 재임포트하면 DB도 교정.</li><li><b>명단 수 불일치</b>: guest_members ≠ passengers 인원.</li><li><b>팀 내 태그 중복</b> / <b>연결 끊긴 방배정</b>(FK 끊김) / <b>방 정원 초과</b>(더블부킹).</li></ul><h4>정상값</h4>연결 끊김·정원초과는 <b>0이 정상</b>(FK·정원 트리거가 막음). 결번·불일치는 재임포트로 교정.<h4>권한·데이터</h4>admin 전용. RPC <code>data_audit</code>(서버 집계, security definer·is_admin 가드). 읽기 전용(데이터 변경 없음).',
    'watchlist.html': '<h4>이 화면이 하는 일</h4>임포트된 <b>전체 예약</b>을 <b>본인(이름+생년) 기준</b>으로 스캔해 편법·이상 패턴을 검출합니다. <b>🔒 마스터급</b> — <b>watch 영역 지정자만</b>(admin.html에서 신뢰 담당자에게만 부여, 보통 마스터 본인). [재스캔]으로 실행 → 유형별 목록(이름·회원여부·행사번호). 여러 해가 한 테이블에 쌓이므로 <b>같은 사람이 작년에도 그랬는지</b>가 자동으로 드러납니다.<h4>감지 유형</h4><ul><li><b>장기 체류(병합 의심)</b>: 통상(최대 7박)을 넘는 장기 체류 — 7+7을 14박으로 합친 흔적.</li><li><b>연속 예약·다른 명단(체이닝 편법 의심)</b>: 퇴실일=입실일로 이어진 두 예약의 명단이 다르고 뒷건이 회원 명의 — 비회원이 회원 혜택을 타는 패턴.</li><li><b>연속 예약·동일 명단(명단 등록 오류)</b>: 연속된 두 예약에 같은 명단 — 14박을 7+7로 등록하며 양쪽에 같은 인원을 넣은 오류.</li><li><b>빈번 묶음 신원</b>: 여러 팀을 묶는 예약에 반복 등장하는 본인.</li></ul><h4>임계값</h4>장기=8박↑ · 빈번=묶음 3회↑ · 동일명단=자카드 0.6↑(넉넉히 잡고 결과 보며 조정). 이름 검색으로 특정인 이력만 필터.<h4>권한·데이터</h4><b>watch 영역(마스터급 · PII)</b> — admin.html에서 지정. bookings·passengers·print_overrides <b>읽기 전용</b> 클라이언트 집계(서버·데이터 변경 없음). ※passengers는 PII라 서버 RLS상 admin/manager만 읽힘 → 실제로는 마스터 본인에게만 부여를 권장.'
  };
  // 설명서 ja/en 번역(ko 원문은 SO_HELP). 토글 시 renderHelp가 교체.
  var SO_HELP_TR = {"golf.html":{"ja":"<h4>この画面の役割</h4>ゴルフの<b>組編成</b>(4人1組)を作成し<b>組編成表</b>を印刷します。<h4>ラウンド日(自動)</h4>エムクリックの<b>商品名</b>からチーム別ラウンド日を自動抽出: <b>入国日=ICNチームのみ</b>、<b>滞在中日=全員</b>、<b>帰国日=PUSチームのみ</b>。<h4>使い方</h4><ul><li>月(◀▶)·ラウンド日を選択 → 左の<b>未編成</b>者(チーム·性別♂♀)をクリックで選択。</li><li><b>選択→組へ</b>(新しい組)または右の<b>組カードをクリック</b>して追加(最大4名)。</li><li>組ごとに<b>コース(阿蘇·祖母·久住)·ティ時刻</b>を指定。コースは人気順(阿蘇&gt;祖母&gt;久住)で自動配分。</li><li><b>🪄チーム優先 自動</b>=チーム別4名で自動生成。<b>男/女</b>=性別で一括選択。</li><li><b>💾保存</b>→その日の編成を保存(再保存はその日を総入替)。<b>🖨印刷</b>=組編成表。</li></ul><h4>権限·データ</h4>golfエリア。bookings·guests·passengers·guest_members 読取 / golf_groups·golf_group_members 書込。※カート割当·途中交代は次段階。","en":"<h4>What this screen does</h4>Create golf <b>groupings</b> (4-somes) and print the <b>grouping sheet</b>.<h4>Round days (auto)</h4>Round days per team are auto-derived from the M-Click <b>product name</b>: <b>arrival day = ICN teams only</b>, <b>stay days = everyone</b>, <b>departure day = PUS teams only</b>.<h4>How to use</h4><ul><li>Pick month (◀▶) and round day → click <b>unassigned</b> people (team · gender ♂♀) to select.</li><li><b>Selected → group</b> (new) or click a <b>group card</b> to add (max 4).</li><li>Set each group's <b>course (Aso·Sobo·Kuju) and tee time</b>. Courses auto-balance by popularity (Aso&gt;Sobo&gt;Kuju).</li><li><b>🪄 Auto (team-first)</b> creates 4-somes per team. <b>M/F</b> bulk-selects by gender.</li><li><b>💾 Save</b> the day's grouping (re-save replaces the whole day). <b>🖨 Print</b> the sheet.</li></ul><h4>Permissions / data</h4>golf area. Reads bookings·guests·passengers·guest_members / writes golf_groups·golf_group_members. Cart assignment & mid-round swaps are next."},"step1.html":{"ja":"<h4>この画面の役割</h4>エムクリックのエクセル(<b>予約リスト・同行者別予約・グループコード参照</b>)をアップロードすると、グループコード・会員判定・航空情報を計算して保存します。<b>すべての画面の起点</b>です。<h4>計算・判定</h4><ul><li><b>月単位の同期</b>: アップロードした当月で、ファイルに無いチームのみ確認のうえ整理(<b>他の月には影響なし</b>)。あるチームはidを保持(割当維持)。</li><li><b>グループコード自動計算</b>: 会員=事前割当、非会員=Fプール(<code>FAあ</code>~)。</li><li><b>日付自動認識</b>: エクセルの数値・韓国語・MM/DD/YYYYをすべて取り込み。</li></ul><h4>主な用語</h4>予約リスト=<b>チームマスター</b>(商品・宿泊施設・期間・金額) / 同行者別予約=<b>個人明細</b>(名簿・航空・生年月日・等級)。結合キー=<code>eventSeq</code>(行事番号)。<h4>権限・データ</h4>step1エリア。保存先: bookings・passengers・guests・guest_members。","en":"<h4>What this screen does</h4>Upload the M-Click Excel files (<b>reservation list, companion-by-companion reservation, group code reference</b>) and it computes and stores the group code, member status, and flight info. This is the <b>starting point for every screen</b>.<h4>Calculation / judgment</h4><ul><li><b>Monthly sync</b>: For the uploaded month, only teams missing from the file are cleaned up after confirmation (<b>no effect on other months</b>). Teams present keep their id (assignments preserved).</li><li><b>Automatic group code</b>: members = pre-assigned, non-members = F pool (<code>FAあ</code>~).</li><li><b>Automatic date recognition</b>: absorbs Excel serial numbers, Korean text, and MM/DD/YYYY alike.</li></ul><h4>Key terms</h4>Reservation list = <b>team master</b> (product, lodging, period, amount) / companion-by-companion reservation = <b>individual details</b> (roster, flights, birth date, grade). Join key = <code>eventSeq</code> (event number).<h4>Permissions / data</h4>step1 area. Stored to: bookings, passengers, guests, guest_members."},"room.html":{"ja":"<h4>この画面の役割</h4><b>個人単位</b>の客室割当。自動割当・分割滞在・タイムライン・期間閉鎖。<h4>計算・判定(自動割当)</h4><ul><li><b>予約順の先着</b>: 予約の早いチームから。</li><li><b>名簿順にペア(1・2、3・4)</b> — 同行者別予約の順序(相部屋の意図)をそのまま守ります。<b>ペアに会員が1人でもいればその部屋をデラックス</b>、いなければ予約種別(ツイン・コンパクト)。各プールとも<b>高層から</b>、デラックス不足時は予約順で確保し、残りは予約種別へ格下げ。</li><li><b>同じチームは同じ階</b>: 2部屋以上ならチーム全員が入る一つの階にまとめて割当(階が足りなければ分散)。</li><li><b>再割当=全体の再配置</b>: autoのみ消して最初から。手動・分割(✂)は保護。</li><li><b>シングル・トリプルは自動割当から除外</b>: 現地備考に「シングル」表記のあるチームと3名(トリプル)チームはペア(1・2、3・4)が合わないため<b>未割当のまま手動配置</b>します(保留理由を表示)。</li><li><b>定員</b>: 一泊単位の重複チェック(他の月も含む)。閉鎖期間の部屋は除外。</li></ul><h4>主な用語</h4><b>タグコード</b>=3桁のグループコード(<code>F</code>接頭=非会員)。<b>会員判定</b>=顧客等級・会員権区分・会員区分の<b>いずれか一つでも会員なら会員</b>。<b>分割(✂)</b>=基準日から別の部屋へ。<h4>割当検索</h4>上部固定バーの<b>🔎割当検索</b>にタグコード・韓国語名・英字名・行事番号を入力すると、その人が<b>どの部屋・どの日付</b>に割当されたかが一覧で表示され、クリックするとその日付のカードへジャンプして部屋を強調します。<h4>変更履歴</h4>下部の<b>🕘客室割当の変更履歴</b>で、誰が・いつ割当/解除/分割/自動割当したかを照会(検索・もっと見る)。<b>自動割当の再配置は人ごとに「↪️移動」(A室→B室)としても記録</b>され、誰がどこからどこへ移ったかを追跡できます。<h4>早期チェックアウト(🛫)</h4>1〜2名だけ予定より早く帰国する場合、メンバーチップの<b>🛫</b>を押して実際の退室日を入力します。<b>その人だけ</b>処理され(チーム全体ではない)、ベッドはその日から空きます(残りの部屋・分割も自動短縮)。同じ🛫を再度押すと解除。処理すると<b>「確認が必要」(精算/返金)項目が自動生成</b>され、フロントデスクで見落とさないよう通知します。残り人数の部屋変更は✂移動で。<b>B2B精算は不変</b>(返金は現地 御請求書)。夕食の食数も自動で控除されます。<h4>権限・データ</h4>roomエリア。rooms・room_inventory・room_closures・guest_members(actual_dep)・followups・change_log。","en":"<h4>What this screen does</h4>Room assignment <b>per individual</b>. Auto-assignment, split stays, timeline, period closure.<h4>Calculation / judgment (auto-assignment)</h4><ul><li><b>First come by reservation order</b>: earlier-booked teams first.</li><li><b>Pairs in roster order (1&2, 3&4)</b> — keeps the companion-by-companion order (intended roommates) intact. <b>If a pair includes even one member, that room becomes deluxe</b>; otherwise the reservation type (twin / compact). Each pool fills <b>from the upper floors</b>; when deluxe runs short it is taken by reservation order and the rest are downgraded to the reservation type.</li><li><b>Same team, same floor</b>: with two or more rooms, the whole team is grouped onto one floor that fits all (split if the floor is too small).</li><li><b>Reassign = full re-layout</b>: clears only auto and starts over. Manual and split (✂) are protected.</li><li><b>Singles &amp; triples excluded from auto-assignment</b>: teams with a 'single' note in the local remark and 3-person (triple) teams do not fit the pairing (1&amp;2, 3&amp;4), so they are <b>left unassigned for manual placement</b> (hold reason shown).</li><li><b>Capacity</b>: per-night overlap check (including other months). Rooms in a closure period are excluded.</li></ul><h4>Key terms</h4><b>Tag code</b> = 3-digit group code (<code>F</code> prefix = non-member). <b>Member judgment</b> = if <b>any one</b> of customer grade, membership category, or member category indicates a member, treated as a member. <b>Split (✂)</b> = move to another room from a reference date.<h4>Assignment search</h4>Enter a tag code, Korean name, English name, or event number in <b>🔎 assignment search</b> in the fixed top bar, and you get a list of <b>which room and which date</b> that person is assigned to; click to jump to that date's card and highlight the room.<h4>Change history</h4>The <b>🕘 room assignment change history</b> at the bottom lets you look up who assigned/unassigned/split/auto-assigned and when (search, load more). <b>Auto-assignment re-layouts are also recorded per person as '↪️ move' (Room A → Room B)</b>, so you can trace who moved from where to where.<h4>Early checkout (🛫)</h4>When only 1-2 people leave earlier than planned, press <b>🛫</b> on the member chip and enter the actual departure date. <b>Only that person</b> is processed (not the whole team), and the bed is freed from that day (remaining rooms / splits are auto-shortened). Press 🛫 again to clear it. Once processed, a <b>'Follow-up needed' (settlement/refund) item is auto-created</b> so the front desk does not miss it. Move the remaining people with the ✂ split. <b>B2B settlement is unchanged</b> (refund via the on-site 御請求書). Dinner meal counts are also deducted automatically.<h4>Permissions / data</h4>room area. rooms, room_inventory, room_closures, guest_members(actual_dep), followups, change_log."},"nametag.html":{"ja":"<h4>この画面の役割</h4>個人別の<b>ネームタグラベル</b>(Askul 24面)を印刷します。step1で計算済みの値を読み取って出力(再計算なし)。<h4>主な用語</h4><b>タグコード</b>=グループコード+個人番号(<code>DAあ-1Y</code>)。末尾の文字(Y・K・G・S)=宿泊施設の区分。<h4>権限・データ</h4>print(印刷)エリア。guests・guest_membersの読み取り。","en":"<h4>What this screen does</h4>Prints individual <b>ネームタグ labels</b> (Askul 24-up). Reads the values computed in step1 and outputs them (no recalculation).<h4>Key terms</h4><b>Tag code</b> = group code + personal number (<code>DAあ-1Y</code>). Last letter (Y, K, G, S) = lodging division.<h4>Permissions / data</h4>print area. Reads guests, guest_members."},"aircover.html":{"ja":"<h4>この画面の役割</h4>チーム別の<b>A5 航空カバー</b>1枚(横)。個人の航空便・施設色。<h4>計算・判定</h4><ul><li>代表=<code>is_rep</code>を優先。</li><li><b>施設色・ラベル</b>=タグ末尾の文字(Y/K/G/S)。</li><li>航空便ZE→PUS・TW→ICN補正。</li><li>タグ・人数の<b>インライン修正</b>=print_overrides共有 → 夕食と同期。</li></ul><h4>主な用語</h4>タグコード(3桁、F接頭=非会員)。<h4>権限・データ</h4>print(印刷)エリア。タグ・人数の修正にはprintまたはroom権限が必要。","en":"<h4>What this screen does</h4>One <b>A5 航空カバー</b> per team (landscape). Per-person flights and facility colors.<h4>Calculation / judgment</h4><ul><li>Representative = <code>is_rep</code> takes priority.</li><li><b>Facility color / label</b> = last letter of the tag (Y/K/G/S).</li><li>Flight correction ZE→PUS, TW→ICN.</li><li><b>Inline edit</b> of tag and pax = shared via print_overrides → synced with dinner.</li></ul><h4>Key terms</h4>Tag code (3 digits, F prefix = non-member).<h4>Permissions / data</h4>print area. Editing tag or pax requires print or room permission."},"dispatch.html":{"ja":"<h4>この画面の役割</h4>行事別の<b>A4両面</b> — 表=現地手配書、裏=現地発生分 記入表。<h4>計算・判定</h4><ul><li>ラウンディング日程は自動・部屋数=<code>ceil(pax/2)</code>室。</li><li><b>マスキングトグル</b>: ON=生年月日まで / OFF=パスポート・電話を表示。</li><li>記入表(裏面)=現場での手書き、B2B精算とは別。</li><li><b>EVカート·ルームチャージ 自動反映</b>: <b>現地備考</b>(備考・参考事項も対象)に「전기카트 2대」「룸 업그레이드」等の記載があれば → <b>表面</b>に「EVカート 申請」専用セクションで強調、<b>裏面 記入表</b>は該当区分(①ルームチャージ・②EVカート)に○が付き内容が予め入ります(金額・数量・担当は現場で手書き)。記載が無ければ表面は「申請なし」、裏面は空欄のまま。</li></ul><h4>権限・データ</h4>print(印刷)エリア。","en":"<h4>What this screen does</h4><b>A4 double-sided</b> per event — front = 現地手配書, back = 現地発生分 記入表.<h4>Calculation / judgment</h4><ul><li>Round schedule is automatic; room count = <code>ceil(pax/2)</code> rooms.</li><li><b>Masking toggle</b>: ON = up to birth date / OFF = passport and phone shown.</li><li>記入表 (back) = handwritten on-site, separate from B2B settlement.</li><li><b>EV cart / room charge auto-fill</b>: if the <b>local remark</b> (remarks &amp; reference notes too) mentions a cart or room upgrade, the <b>front</b> shows a dedicated &quot;EVカート 申請&quot; section and the <b>back 記入表</b> pre-marks the matching category (① room charge / ② EV cart) with the content filled in (amount, qty and handler stay handwritten). If nothing is written, the front shows &quot;申請なし&quot; and the back stays blank.</li></ul><h4>Permissions / data</h4>print area."},"dinner.html":{"ja":"<h4>この画面の役割</h4>日付別の<b>夕食オーダー</b>(A3) + 朝・昼・夕の<b>食数自動集計</b> + <b>レストラン名札</b>の印刷。<h4>計算・判定</h4><ul><li>食数=宿泊施設グループ別ルール。<b>夕食=その日に宿泊する全員</b>。</li><li><b>早期チェックアウト反映</b>: 部屋割りで🛫早期退室を処理した人は食事の境界どおり自動控除 — <b>退室日の朝までは含む</b>、昼・夕から除外。印刷の名簿・合計に<code>早期退室 −N</code>を表記。</li><li><b>レストラン名札 = 運営チーム単位で合席</b>: 現地手配書でまとめた運営チーム(team_group)が<b>名札1枚に自動合席</b>(代表者・タグをすべて表記・人数合算)。同じ運営チームのうち<b>夕食だけ別</b>にしたいチームは「✂夕食分離」で単独名札に(「↩合席に戻す」で復元)。食数集計はそのまま。</li><li><b>除外(統合)</b>: あるチームを消して別チームに人数を取りまとめ → 名簿・食数から外れます(まとめと違い名簿から消えます)。</li></ul><h4>主な用語</h4>タグコード。「チーム別タグ・人数」は航空カバーと共有(夕食のみ除外を反映) ・「まとめ」は名札専用。<h4>別注→精算</h4>単価のある<b>追加・アップグレード別注を登録するとそのチームの御請求書に自動課金</b>されます(アップグレード=差額、アレルギー=課金なし)。別注の修正・削除に課金も自動追従(DBトリガー)。<h4>権限・データ</h4>print(印刷)エリア。タグ・人数・まとめの保存は print または room 権限が必要。","en":"<h4>What this screen does</h4>Prints the date-based <b>夕食オーダー</b> (A3) + automatic <b>meal count</b> totals for breakfast/lunch/dinner + <b>レストラン名札</b>.<h4>Calculation & logic</h4><ul><li>Meal count = rules by lodging group. <b>Dinner = everyone staying that night</b>.</li><li><b>Early checkout reflected</b>: people processed as 🛫 early checkout in room assignment are auto-deducted by meal boundary — <b>included through the morning of the departure day</b>, excluded from lunch and dinner onward. Shown as <code>早期退室 −N</code> on the printed roster and totals.</li><li><b>Restaurant nameplate = merged by operational team</b>: the operational team (team_group) set in 現地手配書 <b>auto-merges onto one nameplate</b> (all reps & tags shown, headcounts summed). To split only dinner out of an operational team, use '✂ Split dinner' (revert with '↩ Merge back'). Meal-count totals stay the same.</li><li><b>Exclude (merge)</b>: Remove one team and consolidate its headcount into another → it drops out of the roster and meal count (unlike grouping, it disappears from the roster).</li></ul><h4>Key terms</h4>Tag code. 'Team tag/headcount' is shared with the 航空カバー (only the exclusion is reflected in dinner); 'grouping' is for nameplates only.<h4>Add-on → billing</h4>Registering a priced <b>add/upgrade item auto-charges that team's bill</b> (upgrade = price difference; allergies are not charged). Edits/deletes of the add-on follow automatically (DB trigger).<h4>Permission & data</h4>print area. Saving tags, headcounts, or grouping requires print or room permission."},"shizu.html":{"ja":"<h4>この画面の役割</h4><b>志津の宿 予約表</b>(志津の宿へ送る客室予約表)を出力します。<b>部屋割り(room)画面で行った志津の宿の割当をそのまま読み込み</b>、日付別に7客室(本館4・別棟3)の予約表を自動生成します。<h4>計算・判定</h4><ul><li><b>入替・空室移動</b>: 予約表で<b>部屋名クリック→別の部屋クリック</b>で2部屋を入れ替え、または空室へ移動(同一日・重複防止)。自動割当は部屋割り(room)でバックグラウンド進行し予約表を埋めます。</li><li><b>連泊・合計・男女</b>は割当・名簿から自動(性別は同行者別予約基準、氏名で照合)。</li><li><b>別棟(吉祥・瑞雲・馬酔木)温泉の事前申請</b>: 別棟割当者に♨トグル → 申請した人泊のみ<b>×¥2,000</b>集計(客室料¥17,000は本館・別棟同一)。申請時のみ現地で温泉のお湯を準備。<b>料金はメリットB2B精算で受領</b>(御請求書には課金しません)。</li></ul><h4>出力</h4>画面プレビュー ＋ <b>予約表 xlsx</b>(テンプレート書式) ＋ 印刷。数字は全角表記。<b>日付チップ</b>で特定日のみ<b>日別 表示・印刷・xlsx</b>可(全日=その月全体)。備考欄には予約リスト・同行者別予約の<b>備考/現地備考をチーム別に表示し、DeepLで日本語へ自動翻訳</b>(原文併記・キャッシュ)。※DeepL APIキーがSupabaseエッジのシークレットに必要。<h4>権限・データ</h4><b>shizu(志津の宿 予約表)エリア</b>(印刷とは別に権限分離 — admin.htmlで個別指定)。rooms・guest_members・passengers 読取 ＋ shizu_onsen(温泉事前申請、shizu/room 書込)。","en":"<h4>What this screen does</h4>Outputs the <b>Shizu-no-Yado reservation chart</b> sent to the ryokan. It <b>reads the Shizu-no-Yado assignments made on the room-assignment (room) screen</b> and auto-builds the per-night chart for the 7 rooms (4 main + 3 annex).<h4>Calculation / judgment</h4><ul><li><b>Assign on the room screen</b>: this screen only reads and prints — change rooms on the room-assignment screen — or <b>swap / move to an empty room right here</b>: click a room name then another room to swap the two (or move to an empty one; same day, conflicts blocked). Auto-assignment runs in the background on the room screen and fills the chart.</li><li><b>Consecutive nights, totals, M/F</b> come automatically from assignments and roster (gender from the companion list, matched by name).</li><li><b>Annex (Kissho/Zuiun/Ashibi) onsen pre-application</b>: ♨ toggle on annex guests → only applied person-nights are tallied at <b>×¥2,000</b> (room rate ¥17,000 is identical for main and annex). Onsen water is prepared on-site only when pre-applied. <b>The fee is collected via the Merit B2B settlement</b> (not billed on the guest invoice).</li></ul><h4>Output</h4>Screen preview + <b>chart xlsx</b> (template format) + print. Numbers are full-width. <b>Date chips</b> let you view/print/xlsx a single day (All = whole month). The remark row shows each team's <b>remark/local remark auto-translated to Japanese via DeepL</b> (original kept, cached). Requires a DeepL API key in the Supabase edge secret.<h4>Permissions / data</h4><b>shizu (Shizunoyado sheet) area</b> (split from print — assign individually in admin.html). Reads rooms, guest_members, passengers + shizu_onsen (onsen pre-application; shizu/room write)."},"keytag.html":{"ja":"<h4>この画面の役割</h4>チェックイン時に<b>チームとキーホルダー(QR/FOB)を紐付け</b>します。<h4>流れ</h4><ul><li>① チェックイン日基準の滞在チームを読み込み、グループコード・代表者で検索・選択。</li><li>② キーホルダーのFOBコードをスキャン/入力してそのチームに紐付け(同じFOBが別チームに紐付け済みなら自動解除して再連携)。</li><li>有効な紐付け一覧から解除可能。</li></ul><h4>権限・データ</h4>roomエリア。key_bindings・guests。","en":"<h4>What this screen does</h4>At check-in, <b>links a team to a key holder (QR/FOB)</b>.<h4>Flow</h4><ul><li>1) Load teams staying on the check-in date; search by group code/representative and select.</li><li>2) Scan/enter the FOB code to bind it to that team (if the same FOB is already bound to another team, it is auto-unbound and re-linked).</li><li>Unbind from the active bindings list.</li></ul><h4>Permissions / data</h4>room area. key_bindings, guests."},"inventory.html":{"ja":"<h4>この画面の役割</h4>F&B・客室の<b>在庫管理</b>。品目別の現在庫・適正在庫・不足アラート＋入出庫台帳。<h4>流れ</h4><ul><li><b>部署トグル</b>: F&B(厨房)・客室 — 部署別の品目のみ(URL <code>?dept=room</code>/<code>kitchen</code>)。</li><li>品目に<b>+入庫 / −使用 / 棚卸</b>を記録 → 現在庫を自動更新し台帳(直近履歴)に残す。</li><li>現在庫が適正在庫未満なら<b>不足アラート</b>。</li></ul><h4>権限・データ</h4>F&B=kitchen・客室=room エリア(URL dept で切替)。inv_items・inv_txns。","en":"<h4>What this screen does</h4><b>Stock management</b> for F&B and rooms. Per-item on-hand, par level, low-stock alert + in/out ledger.<h4>Flow</h4><ul><li><b>Department toggle</b>: F&B (kitchen) / rooms — shows only that department's items (URL <code>?dept=room</code>/<code>kitchen</code>).</li><li>Record <b>+in / −use / stocktake</b> on an item → on-hand auto-updates and is logged in the ledger (recent history).</li><li>Low-stock alert when on-hand is below par.</li></ul><h4>Permissions / data</h4>F&B = kitchen, rooms = room area (switched via URL dept). inv_items, inv_txns."},"settle.html":{"ja":"<h4>この画面の役割</h4>チェックアウト時の<b>明細書(御請求書)</b>。チーム別の請求・支払・残高。<h4>計算・判定</h4><ul><li><b>残高=請求合計−支払合計</b>。</li><li>未開設チーム=請求 0=<b>残高 ¥0</b>(クリックで請求を追加、アカウント自動開設)。</li><li>個人配分があれば folio をまとめ表示(チーム+個人の合計)。</li></ul><h4>主な用語</h4>現地追加料金(追加ラウンド・ミニバー等) — B2B 事前契約とは<b>別</b>。<h4>権限・データ</h4>settle エリア。folios・charges・payments。","en":"<h4>What this screen does</h4>The checkout <b>statement (御請求書)</b>. Charges, payments, and balance by team.<h4>Calculation & logic</h4><ul><li><b>Balance = total charges − total payments</b>.</li><li>Team with no folio = charges 0 = <b>balance ¥0</b> (click to add a charge; the account opens automatically).</li><li>If there is an individual split, folios are shown as a group (team + individual total).</li></ul><h4>Key terms</h4>On-site extra charges (extra rounds, minibar, etc.) — <b>separate</b> from the B2B pre-contract.<h4>Permission & data</h4>settle area. folios, charges, payments."},"settle_merit.html":{"ja":"<h4>この画面の役割</h4>メリット↔サイゼン <b>B2B 事前契約</b>の精算表。<h4>計算・判定</h4><ul><li><b>宿泊費=人数×泊数×施設単価</b>(ヤマナミリゾート・久住 14,000 / ガンジ 16,000 / 志津の宿 17,000)。</li><li><b>送迎費=人数×¥6,000</b>。</li><li>人数=<b>実際の名簿数</b>(予約 pax より優先)。控除・備考のみ別途保存。</li></ul><h4>主な用語</h4>B2B(現地追加料金と混同しないこと)。<h4>権限・データ</h4>settle エリア。","en":"<h4>What this screen does</h4>The <b>B2B pre-contract</b> settlement sheet between Merit and SaiZen.<h4>Calculation & logic</h4><ul><li><b>Lodging fee = headcount × nights × facility unit price</b> (Yamanami / Kuju 14,000 / Ganji 16,000 / Shizu 17,000).</li><li><b>Transfer fee = headcount × ¥6,000</b>.</li><li>Headcount = <b>actual roster count</b> (takes priority over the reserved pax). Only deductions and remarks are stored separately.</li></ul><h4>Key terms</h4>B2B (do not confuse with on-site extra charges).<h4>Permission & data</h4>settle area."},"pos.html":{"ja":"<h4>この画面の役割</h4>注文入力(簡易 POS)。チーム共通 + 個人配分。<h4>計算・判定</h4><ul><li><b>配分</b>: チーム共通 / 特定の1人 / N分の1 → charges + 個人 folio を自動生成。</li><li><b>厨房チケット</b>=配分に関係なく<b>全数量・チーム単位</b>。</li><li>会員バッジ=顧客等級・会員権区分・会員区分の3列 OR。</li></ul><h4>主な用語</h4>店舗(アウトレット)=フロント/レストラン・宴会/ゴルフショップ。<h4>チームQRからの流れ</h4>スマホ標準カメラで読み取り<b>ご精算ページが開いた場合</b>も、スタッフがログイン中なら上部に<b>スタッフモード</b>バーが表示され、[POS 注文]から入ると<b>そのチームが自動選択</b>されます(<code>?seq=</code>)。当日の滞在一覧に無くても直接検索して開きます。お客様が読み取った場合はバーは表示されません。<h4>権限・データ</h4>pos エリア。charges・folios。","en":"<h4>What this screen does</h4>Order entry (simple POS). Team default + individual split.<h4>Calculation & logic</h4><ul><li><b>Split</b>: team-shared / a specific person / split N ways → auto-generates charges + an individual folio.</li><li><b>Kitchen ticket</b> = <b>full quantity, by team</b> regardless of the split.</li><li>Member badge = OR of the three columns customer grade / membership type / member category.</li></ul><h4>Key terms</h4>Outlet = front desk / restaurant & banquet / pro shop.<h4>Team QR flow</h4>If a phone's default camera opens the <b>bill page</b> instead, a <b>Staff mode</b> bar appears at the top for logged-in staff; entering via [POS order] <b>auto-selects that team</b> (<code>?seq=</code>). Both paths open the team even if it is not in that day's in-house list. Guests never see the staff bar.<h4>Permission & data</h4>pos area. charges, folios."},"kitchen.html":{"ja":"<h4>この画面の役割</h4>厨房・バーの<b>注文チケット画面(KDS)</b>。<h4>計算・判定</h4><ul><li>チケットは<b>新規 → 受付 → 完了</b>の3段階(受付時に担当を記録)。</li><li>品目別の<b>調理ルーティング</b>(station): 厨房/バー/フロント。</li></ul><h4>権限・データ</h4>kitchen エリア。kitchen_tickets。","en":"<h4>What this screen does</h4>The <b>order ticket screen (KDS)</b> for the kitchen and bar.<h4>Calculation & logic</h4><ul><li>Tickets go through three stages: <b>new → accepted → done</b> (the handler is recorded on acceptance).</li><li>Per-item <b>cooking routing</b> (station): kitchen / bar / front.</li></ul><h4>Permission & data</h4>kitchen area. kitchen_tickets."},"menu.html":{"ja":"<h4>この画面の役割</h4>メニュー品目の管理(場所(venue)・ライン(category)別)。<h4>計算・判定</h4><ul><li><b>コード自動採番</b>=場所prefix+番号(<code>FR1</code>・<code>GS1</code>)。</li><li>すでに適用済みのコードは<b>ロック</b>(編集不可)。</li><li>すべての変更は履歴(change_log)に記録。</li></ul><h4>主な用語</h4><b>場所(venue)</b>=販売先・コードprefix / <b>ライン(category)</b>=精算集計の基準(<code>숙박</code>は画面に「ルーム」と表示)。<h4>権限・データ</h4>menuエリア。menu_items。","en":"<h4>What this screen does</h4>Manage menu items (by venue and line/category).<h4>Calculation & rules</h4><ul><li><b>Auto code numbering</b> = venue prefix + number (<code>FR1</code>, <code>GS1</code>).</li><li>Codes already in use are <b>locked</b> (not editable).</li><li>All changes are recorded in the history (change_log).</li></ul><h4>Key terms</h4><b>venue</b> = sales point / code prefix; <b>line (category)</b> = settlement aggregation basis (<code>숙박</code> shows as 'Room' on screen).<h4>Permission & data</h4>menu area. menu_items."},"board.html":{"ja":"<h4>この画面の役割</h4>部署<b>お知らせ</b> + <b>本日のサマリー</b>(JST基準のチェックイン・アウト・注文・売上の集計)。<h4>権限・データ</h4>閲覧=ログイン全員 / お知らせ作成・ピン・並べ替え=admin・manager / <b>削除=作成者本人またはマスター(admin)</b>。","en":"<h4>What this screen does</h4>Department <b>announcements</b> + <b>today's summary</b> (check-in/out, orders, revenue aggregated on JST basis).<h4>Permission & data</h4>Read = all logged-in users / writing, pinning, reordering = admin/manager / <b>deletion = author or master (admin)</b>."},"notes.html":{"ja":"<h4>この画面の役割</h4>イベント(チーム)別に<b>チームラベル・ヤマナミコース・備考・メモ</b>を残します。<h4>計算・判定</h4>値はフォーカスを外すと自動保存。すべての修正は<b>誰が・いつ・変更前→変更後</b>として履歴に残ります。<h4>権限・データ</h4>notesエリア。event_notes・event_note_log。","en":"<h4>What this screen does</h4>Record <b>team label, Yamanami course, remarks, and memo</b> per event (team).<h4>Calculation & rules</h4>Values are saved automatically when focus leaves the field. Every edit is kept in history as <b>who, when, before → after</b>.<h4>Permission & data</h4>notes area. event_notes, event_note_log."},"groupcodes.html":{"ja":"<h4>この画面の役割</h4><b>会員マスター(個人情報)</b>の管理 + 空きコードピッカー。<b>groupcodesエリア(admin または付与された担当者)</b>。<h4>計算・判定</h4><ul><li>グループコード3桁=<b>等級prefix + 英字(18種) + かな(33種)</b>。</li><li><b>空きコードピッカー</b>: 等級別18×33グリッド — <b>緑=空きコード</b>(0名、即時割当) / <b>アンバー=合流可能</b>(1〜3名) / グレー=4名以上。</li></ul><h4>主な用語</h4>Fプール=非会員。等級prefix=ダイヤ[D・M]・ゴールド[G]・EWRC[E・W・R・C]など。<h4>権限・データ</h4><b>groupcodesエリア(PII)</b> — admin.htmlで信頼できる担当者にのみ付与。member_codes。","en":"<h4>What this screen does</h4>Manage the <b>member master (personal info)</b> + empty-code picker. <b>groupcodes area (admin or granted staff)</b>.<h4>Calculation & rules</h4><ul><li>Group code 3 chars = <b>grade prefix + letter (18 kinds) + kana (33 kinds)</b>.</li><li><b>Empty-code picker</b>: 18×33 grid per grade — <b>green = empty code</b> (0 people, assign directly) / <b>amber = can join</b> (1-3 people) / gray = 4+ people.</li></ul><h4>Key terms</h4>F-pool = non-member. Grade prefix = Diamond [D, M], Gold [G], EWRC [E, W, R, C], etc.<h4>Permission & data</h4><b>groupcodes area (PII)</b> — grant to trusted staff in admin.html. member_codes."},"frontdesk.html":{"ja":"<h4>この画面の役割</h4>リアルタイムの<b>到着・出発・在室</b> + チーム別の部屋番号・残高・メモの統合状況。フロント=バー=レストランを1画面で(テーブル管理は未導入 — 名札は引き続き出力)。<h4>計算・判定</h4><ul><li>🛬チェックイン=<code>dep===오늘</code> / 🛫チェックアウト=<code>arr===오늘</code> / 🏨在室(連泊)=その間 / 🍽夕食=その日に泊まる全員。</li><li>残高=請求−支払の合算。<b>KPIクリック→該当ラインへスクロール</b>。</li><li><b>宿泊チップ</b>でリスト・KPIをフィルター。</li></ul><h4>ショートカット</h4>チームをクリック → 詳細で<b>備考(運営)・メモをその場で入力</b>(フォーカスを外すと自動保存・変更履歴記録。別のメモ画面に入る必要なし)。チームをクリック → 詳細から<b>精算</b>(そのチームを自動で開く)・<b>部屋割り</b>(その日付)・メモへジャンプ。<h4>🔔 確認が必要(後続対応)</h4>早期チェックアウトなどで<b>他の画面に後続作業</b>(例: 精算の返金)が発生すると、上部パネルに集まります。<b>[対応へ]</b>で該当画面(ディープリンク)へ直行し、終えたら<b>[完了]</b>で閉じます。未完了のN件はランディングの<b>🔔バッジ</b>にも表示され、どのPCからでも見えます。ログイン中の担当者なら誰でも完了できます。<h4>権限・データ</h4>front(フロントデスク)エリア。読み取り集計(データ変更なし) ・ 確認が必要(followups)はログイン全員が閲覧/完了。","en":"<h4>What this screen does</h4>Real-time <b>arrival/departure/in-house</b> + integrated status with room number, balance, and memo per team. Front desk = bar = restaurant on one screen (table management not introduced — nameplates still printed).<h4>Calculation & rules</h4><ul><li>🛬 check-in = <code>dep===오늘</code> / 🛫 check-out = <code>arr===오늘</code> / 🏨 in-house (consecutive nights) = in between / 🍽 dinner = everyone staying that day.</li><li>Balance = charges − payments summed. <b>Click a KPI → scroll to the relevant line</b>.</li><li>Filter the list and KPIs with <b>lodging chips</b>.</li></ul><h4>Shortcuts</h4>Click a team → in the detail, <b>type Remarks (ops) / Memo right there</b> (auto-saves on blur, logged; no need to open a separate memo page). Click a team → from the detail jump to <b>settlement</b> (opens that team automatically), <b>room assignment</b> (that date), or memo.<h4>🔔 Follow-up needed</h4>When an action such as an early checkout creates <b>follow-up work in another screen</b> (e.g. a settlement refund), it gathers in the top panel. <b>[Handle]</b> takes you straight to that screen (deep link); when finished, close it with <b>[Done]</b>. The count of open items also shows on the landing <b>🔔 badge</b>, so it is visible from any PC. Any logged-in staff member can mark it done.<h4>Permission & data</h4>front (front desk) area. Read-only aggregation (no data changes). Follow-ups are readable/closable by all logged-in users."},"admin.html":{"ja":"<h4>この画面の役割</h4>アカウントの<b>役割・エリア指定</b> + 登録申請の処理。<b>マスター専用</b>。<h4>計算・判定</h4><ul><li>役割 <b>admin / manager / staff</b> + エリア(step1・room・settle・pos・kitchen・menu・notes・stats)。</li><li><b>admin(マスター)=全通過</b> / <b>manager・staff=指定エリアのみ</b>(役割は区分、画面表示・アクセスは指定エリアのみ。マネージャーも自動通過なし)。経営統計(stats)=adminまたはstats指定者。</li></ul><h4>パスワード再設定</h4>担当者がパスワードを忘れた場合、<b>ログイン画面の「パスワードをお忘れですか？」</b>から本人が再設定メールを受け取れます(マスターの対応不要)。届かない場合は Dashboard <b>Authentication → Users → ⋯ → Send password recovery</b> で送信、または直接設定してください。⚠ リンクは1回限り・有効期限あり。<h4>権限・データ</h4>admin専用。user_access・access_requests。","en":"<h4>What this screen does</h4>Assign account <b>role and area</b> + process access requests. <b>Master only</b>.<h4>Calculation & rules</h4><ul><li>Role <b>admin / manager / staff</b> + area (step1, room, settle, pos, kitchen, menu, notes, stats).</li><li><b>admin (master) = all access</b> / <b>manager & staff = assigned areas only</b> (role is a label; visibility & access follow assigned areas — managers are not auto-passed). Exec stats = admin or stats holders.</li></ul><h4>Password reset</h4>If a staff member forgets their password, they can self-serve via <b>&quot;Forgot your password?&quot; on the login screen</b> (no master action needed). If the mail does not arrive, send it from Dashboard <b>Authentication &rarr; Users &rarr; &#8943; &rarr; Send password recovery</b>, or set the password directly. Note: the link is single-use and expires.<h4>Permission & data</h4>admin only. user_access, access_requests."},"stats.html":{"ja":"<h4>この画面の役割</h4>代表・部署長向けの<b>月/年 統合統計</b>。期間(今月・今年・昨年・直近12ヶ月・範囲)を選ぶと、送客・売上・稼働率・顧客構成を1画面に集計します。<b>読み取り専用</b>(データ変更なし)。<h4>計算・判定</h4><ul><li><b>送客</b>=現地チェックイン(<code>dep_date</code>)基準・人数=<b>予約人数</b>。宿泊施設別・出発地(ICN/PUS)別に分解。</li><li><b>B2B売上</b>=人数×泊数×施設単価+人数×¥6,000(ヤマナミ・久住 14,000 / ガンジ 16,000 / 志津 17,000)。</li><li><b>現地売上</b>=charges(取消除く・JST基準)、<b>現金/カード/未指定</b>に分離+区分別。</li><li><b>会員比率</b>=member_grade・member_class・member_div の3列OR(いずれか会員なら会員)、等級別。</li><li><b>客室稼働率</b>=使用ベッド泊 ÷(稼働客室定員×期間日数)。チェックイン月帰属の<b>近似値</b>。</li></ul><h4>主な用語</h4>B2B(メリット事前契約)と現地売上は<b>別</b>。稼働率はベッド(定員)基準。<h4>権限・データ</h4><b>statsエリア</b> — adminまたはstats指定者のみ(マネージャー自動通過なし)。集計RPC <code>exec_stats</code>(サーバ集計、security definer)。","en":"<h4>What this screen does</h4><b>Monthly/yearly consolidated stats</b> for executives. Pick a period (this month, this year, last year, last 12 months, range) and it aggregates arrivals, revenue, occupancy, and customer mix on one screen. <b>Read-only</b> (no data changes).<h4>Calculation / judgment</h4><ul><li><b>Arrivals</b> = on-site check-in (<code>dep_date</code>); pax = <b>reserved pax</b>. Broken down by lodging and origin (ICN/PUS).</li><li><b>B2B revenue</b> = pax × nights × facility rate + pax × ¥6,000 (Yamanami/Kuju 14,000 / Ganji 16,000 / Shizu 17,000).</li><li><b>On-site revenue</b> = charges (excl. voided, JST), split by <b>cash/card/unset</b> and by category.</li><li><b>Member ratio</b> = OR of the three columns member_grade/member_class/member_div, by grade.</li><li><b>Room occupancy</b> = used bed-nights ÷ (active room capacity × period days). Attributed to the check-in month, <b>approximate</b>.</li></ul><h4>Key terms</h4>B2B (Merit pre-contract) and on-site revenue are <b>separate</b>. Occupancy is bed (capacity) based.<h4>Permission / data</h4><b>stats area</b> — admin or stats holders only (managers are not auto-passed). Aggregation RPC <code>exec_stats</code> (server-side, security definer)."},"visitor_stats.html":{"ja":"<h4>この画面の役割</h4><b>訪問統計(ゴルフ場協会・県報告用)</b>。期間(日・週・月・年トグル)を選び<b>会員/非会員の訪問者数</b>を集計。<b>読み取り専用</b>。<h4>計算・判定</h4><ul><li><b>訪問</b>=同行者1人1滞在(現地チェックイン<code>dep_date</code>基準)=1延べ訪問。</li><li><b>会員判定</b>=顧客等級・会員権区分・会員区分の3列OR。</li><li><b>性別・年代(満年齢10歳区分)・会員別 訪問回数</b>に分解。</li><li>営業日報の<b>韓国メンバー/韓国ビジター(宿泊)</b>に対応。</li></ul><h4>権限・データ</h4><b>reportエリア</b> — adminまたはreport指定者のみ。集計RPC <code>visitor_stats</code>。","en":"<h4>What this screen does</h4><b>Visitor stats (golf association / prefecture report)</b>. Pick a period (day/week/month/year toggle) to aggregate <b>member/non-member visitor counts</b>. <b>Read-only</b>.<h4>Calculation</h4><ul><li><b>Visit</b> = 1 person-stay (on-site check-in <code>dep_date</code>) = 1 visit.</li><li><b>Member</b> = 3-column OR.</li><li>Broken down by <b>gender, age band (10-yr), per-member visit count</b>.</li><li>Maps to 営業日報 Korean member/visitor (lodging).</li></ul><h4>Permission / data</h4><b>report area</b> — admin or report holders only. RPC <code>visitor_stats</code>."},"audit.html":{"ja":"<h4>この画面の役割</h4>データの<b>整合性の異常</b>を印刷・実運用の前に一括点検します。<b>マスター(admin)専用</b>。[再検収]で実行 → 項目別の件数・サンプル(行事番号)を表示。<h4>点検項目</h4><ul><li><b>個人番号 欠番</b>: ネームタグの個人番号がチーム内1..Nの連番でない(過去importの残り)。印刷は自動採番で正常、再importでDBも是正。</li><li><b>名簿数 不一致</b>: guest_members ≠ passengers。</li><li><b>チーム内タグ重複</b> / <b>リンク切れ 客室割当</b>(FK切れ) / <b>客室定員超過</b>(ダブルブッキング)。</li></ul><h4>正常値</h4>リンク切れ・定員超過は<b>0が正常</b>(FK・定員トリガーが防止)。欠番・不一致は再importで是正。<h4>権限・データ</h4>admin専用。RPC <code>data_audit</code>(サーバ集計、security definer・is_adminガード)。読み取り専用。","en":"<h4>What this screen does</h4>Scans <b>data-integrity issues</b> in one pass before printing / real use. <b>Master (admin) only</b>. Run with [Re-audit] → shows per-check counts and samples (event numbers).<h4>Checks</h4><ul><li><b>Person-number gaps</b>: nametag numbers not a 1..N run within a team (leftover from older imports). Print auto-renumbers (correct); re-import fixes the DB too.</li><li><b>Roster count mismatch</b>: guest_members ≠ passengers.</li><li><b>Duplicate tag in team</b> / <b>broken-link room assignment</b> (broken FK) / <b>room over capacity</b> (double-booking).</li></ul><h4>Normal values</h4>Broken-link &amp; over-capacity are <b>0 when healthy</b> (FK / capacity trigger prevent them). Gaps &amp; mismatch are fixed by re-import.<h4>Permission / data</h4>admin only. RPC <code>data_audit</code> (server-side, security definer, is_admin guard). Read-only."},"watchlist.html":{"ja":"<h4>この画面の役割</h4>取込済みの<b>全予約</b>を<b>本人(氏名+生年)基準</b>でスキャンし、抜け道・異常パターンを検出します。<b>🔒 マスター級</b> — <b>watchエリア指定者のみ</b>(admin.htmlで信頼できる担当者にのみ付与、通常はマスター本人)。[再スキャン]で実行 → 種別ごとの一覧(氏名・会員可否・行事番号)。複数年が同じテーブルに蓄積されるため、<b>同じ人が昨年も同様の予約をしたか</b>が自動で見えます。<h4>検出種別</h4><ul><li><b>長期滞在(併合の疑い)</b>: 通常(最大7泊)を超える長期滞在 — 7+7を14泊にまとめた形跡。</li><li><b>連続予約・別名簿(裏技の疑い)</b>: 退室日=入室日で連結された2予約の名簿が異なり後ろが会員名義 — 非会員が会員特典を受けるパターン。</li><li><b>連続予約・同一名簿(名簿登録ミス)</b>: 連続する2予約に同じ名簿 — 14泊を7+7で登録し両方へ同一メンバーを入れたミス。</li><li><b>頻繁な結合予約の本人</b>: 複数チームを結合する予約に繰り返し登場。</li></ul><h4>しきい値</h4>長期=8泊以上 · 頻繁=結合3回以上 · 同一名簿=ジャカード0.6以上(広めに取り結果を見て調整)。名前検索で特定人の履歴のみ抽出。<h4>権限・データ</h4><b>watchエリア(マスター級・PII)</b> — admin.htmlで指定。bookings・passengers・print_overrides の<b>読み取り専用</b>クライアント集計(サーバ・データ変更なし)。※passengersはPIIのためサーバRLS上admin/managerのみ読取可 → 実務ではマスター本人のみへの付与を推奨。","en":"<h4>What this screen does</h4>Scans <b>all imported bookings</b> <b>by person (name + birth)</b> to detect loophole / anomaly patterns. <b>🔒 Master-level</b> — <b>watch-area holders only</b> (grant to trusted staff in admin.html; usually the master themselves). Run with [Re-scan] → per-type lists (name, member flag, event number). Since multiple years accumulate in one table, <b>whether the same person did it last year too</b> surfaces automatically.<h4>Detected types</h4><ul><li><b>Long stay (merge suspected)</b>: stays beyond the usual max of 7 nights — a trace of 7+7 merged into 14.</li><li><b>Consecutive · different roster (loophole suspected)</b>: two bookings joined checkout=checkin with different rosters, the later under a member — a non-member getting member perks.</li><li><b>Consecutive · same roster (registration error)</b>: same roster on two consecutive bookings — an error putting identical members on both halves of a 7+7 split.</li><li><b>Frequent grouping person</b>: recurs across many grouped bookings.</li></ul><h4>Thresholds</h4>Long = ≥8 nights · Frequent = ≥3 groups · Same roster = Jaccard ≥0.6 (set wide, tune by results). Name search filters to one person's history.<h4>Permission / data</h4><b>watch area (master-level · PII)</b> — assign in admin.html. Read-only client aggregation over bookings, passengers, print_overrides (no server / data changes). Note: passengers is PII (server RLS allows admin/manager reads), so in practice grant only to the master."}};
  function helpSummaryLabel() {
    return ({ ja: '📖 このページの説明・計算方法', ko: '📖 이 페이지 설명 · 계산 방식', en: '📖 About this page · how it works' })[LANG]
      || '📖 이 페이지 설명 · 계산 방식';
  }
  // ── 설명서 변경 알림(N) — 설명서 내용이 바뀌면 그 페이지 SO_HELP_VER를 올린다.
  //   안 본 새 버전이면 요약줄에 빨강 N 배지 → 펼쳐 보면(열람) 사라짐(localStorage 열람버전 기록).
  //   기본버전 1(SO_HELP_BASE) → 버전 안 올린 페이지는 배지 안 뜸(플러딩 방지).
  var SO_HELP_BASE = 1;
  // 기본 버전 2 → 모든 설명서에 최초 1회 N 노출(전 페이지 "한 번 확인" 유도). 열어보면 그 페이지만 사라짐.
  // 이후 특정 페이지 설명서를 또 바꾸면 그 페이지만 3,4…로 올려 다시 N 표시.
  var SO_HELP_DEFAULT_VER = 2;
  var SO_HELP_VER = { 'dispatch.html': 3, 'shizu.html': 8 };
  function helpVer(file){ return SO_HELP_VER[file] || SO_HELP_DEFAULT_VER; }
  function helpSeenVer(file){ try { return +(localStorage.getItem('so_help_seen_' + file) || SO_HELP_BASE); } catch (e) { return SO_HELP_BASE; } }
  function helpIsNew(file){ return helpSeenVer(file) < helpVer(file); }
  function markHelpSeen(file){ try { localStorage.setItem('so_help_seen_' + file, String(helpVer(file))); } catch (e) {} }
  function ensureHelpBadgeCss(){
    if (document.getElementById('so-help-badge-css')) return;
    var s = document.createElement('style'); s.id = 'so-help-badge-css';
    s.textContent = '.page-help .ph-new{display:inline-block;margin-left:8px;background:#e5484d;color:#fff;font-size:10px;font-weight:800;line-height:1.4;border-radius:99px;padding:0 7px;vertical-align:middle;box-shadow:0 1px 4px rgba(229,72,77,.5);animation:sohelppulse 1.25s ease-in-out infinite}'
      + '@keyframes sohelppulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.14);opacity:.75}}';
    document.head.appendChild(s);
  }
  function helpBodyFor(file) {
    var tr = SO_HELP_TR[file];
    if (tr && tr[LANG]) return tr[LANG];   // ja/en 번역
    return SO_HELP[file] || '';            // ko 원문(폴백)
  }
  // 언어 토글 시 주입된 설명서를 현재 언어로 교체.
  function renderHelp() {
    var d = document.querySelector('.page-help[data-so-help]');
    if (!d) return;
    var file = (location.pathname.split('/').pop() || '').toLowerCase();
    var lab = d.querySelector('.ph-label'), body = d.querySelector('.ph-body');
    if (lab) lab.textContent = helpSummaryLabel();      // 라벨만 교체 → N 배지 보존
    if (body) body.innerHTML = helpBodyFor(file);
  }
  function mountHelp() {
    try {
      var file = (location.pathname.split('/').pop() || '').toLowerCase();
      if (!SO_HELP[file]) return;
      if (document.querySelector('.page-help[data-so-help]')) return;  // 중복 방지
      ensureHelpBadgeCss();
      var isNew = helpIsNew(file);
      var d = document.createElement('details');
      d.className = 'page-help';
      d.setAttribute('data-so-help', '1');
      d.innerHTML = '<summary><span class="ph-label">' + helpSummaryLabel() + '</span>'
        + '<span class="ph-new"' + (isNew ? '' : ' style="display:none"') + '>N</span></summary>'
        + '<div class="ph-body">' + helpBodyFor(file) + '</div>';
      // 펼쳐 보면(열람) 현재 버전을 열람 처리 → N 배지 제거
      d.addEventListener('toggle', function(){
        if (d.open) { markHelpSeen(file); var b = d.querySelector('.ph-new'); if (b) b.style.display = 'none'; }
      });
      var conn = document.querySelector('.conn');
      var anchor = conn || document.querySelector('.topbar, .so-bar');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(d, anchor.nextSibling);
      else document.body.insertBefore(d, document.body.firstChild);
    } catch (e) {}
  }

  // ── 맨 위로 버튼 — 전 ops 페이지 공통. 스크롤 내려가면 우하단에 노출. ──
  // ── 업데이트 감지 — 이 페이지가 재배포되면 상단(담당자 이름 옆)에 「업데이트 있음」 버튼 ──
  //   왜: 페이지 단위 수정은 공유 asset ?v= 와 무관해서, 브라우저가 예전 HTML을 물고 있으면
  //       고친 내용이 반영되지 않는다(특히 화면을 오래 켜 둔 현장 PC).
  //   방식: 별도 버전 파일 없이 '현재 페이지 HTML의 ETag/Last-Modified' 비교.
  //     · 관리 파일이 없어 배포 때 갱신을 빠뜨릴 위험이 없고, 그 페이지가 실제로 바뀐 경우에만 뜬다.
  //     · 공유 asset 변경도 전 페이지의 ?v= 가 바뀌므로 HTML 해시가 달라져 자동 포착.
  //   ⚠ 자동 새로고침은 하지 않는다(메모·비고 입력 중 유실 방지) — 누르는 건 담당자.
  var _updBase = null, _updShown = false;
  function _updSig(res) {
    if (!res || !res.ok) return '';
    return (res.headers.get('etag') || '') + '|' + (res.headers.get('last-modified') || '');
  }
  function _updFetch() {   // HEAD + no-store = 캐시 우회, 본문 없이 서버 현재 버전만 확인
    try { return fetch(location.pathname + location.search, { method: 'HEAD', cache: 'no-store' }).catch(function () { return null; }); }
    catch (e) { return Promise.resolve(null); }
  }
  function showUpdateChip() {
    if (_updShown) return;
    var box = document.querySelector('.so-controls'); if (!box) return;
    _updShown = true;
    try {
      var st = document.createElement('style');
      st.textContent = '@keyframes so-updp{0%,100%{opacity:1}50%{opacity:.6}}';
      document.head.appendChild(st);
    } catch (e) {}
    var b = document.createElement('button');
    b.id = 'so-upd'; b.type = 'button';
    b.setAttribute('data-i18n', 'so_update');
    b.setAttribute('data-i18n-title', 'so_updateT');
    b.textContent = t('so_update'); b.title = stripRuby(t('so_updateT'));
    b.style.cssText = 'font-family:inherit;font-size:12px;font-weight:800;color:#fff;background:#b5402f;'
      + 'border:1px solid #963427;border-radius:99px;padding:5px 12px;cursor:pointer;white-space:nowrap;'
      + 'animation:so-updp 1.8s ease-in-out infinite';
    b.addEventListener('click', function () { location.reload(); });
    box.insertBefore(b, box.firstChild);
  }
  function mountUpdateCheck() {
    if (!/^https?:$/.test(location.protocol)) return;         // file:// 등 제외
    if (!window.fetch || !document.querySelector('.so-controls')) return;
    _updFetch().then(function (res) {
      var sig = _updSig(res);
      if (!sig || sig === '|') return;                        // ETag·Last-Modified 없음 → 기능 비활성(오탐 방지)
      _updBase = sig;
      var check = function () {
        if (_updShown || document.hidden) return;
        _updFetch().then(function (r) {
          var s = _updSig(r);
          if (s && s !== '|' && _updBase && s !== _updBase) showUpdateChip();
        });
      };
      setInterval(check, 5 * 60 * 1000);                      // 5분마다
      // 탭으로 돌아왔을 때 즉시 확인(현장에서 다른 창 보다 돌아오는 흐름)
      document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
    });
  }

  function mountToTop() {
    if (document.getElementById('so-totop')) return;   // 페이지 자체 버튼이 있으면 중복 방지
    var b = document.createElement('button');
    b.id = 'so-totop'; b.type = 'button'; b.title = '맨 위로'; b.setAttribute('aria-label', '맨 위로');
    b.innerHTML = '<span style="font-size:22px;line-height:1">↑</span><span style="font-size:9px;font-weight:800;letter-spacing:.5px;margin-top:-3px">TOP</span>';
    var base = '0 6px 20px rgba(20,40,15,.34)';
    b.style.cssText = 'display:none;position:fixed;right:22px;bottom:26px;z-index:60;width:52px;height:52px;'
      + 'flex-direction:column;align-items:center;justify-content:center;'
      + 'border-radius:50%;border:2px solid rgba(255,255,255,.85);background:var(--accent,#647548);'
      + 'color:#fff;cursor:pointer;box-shadow:' + base + ';transition:transform .15s ease, box-shadow .15s ease';
    document.body.appendChild(b);
    // 스크롤 내려가면 노출(부드러운 페이드)
    var onScroll = function () {
      var show = window.scrollY > 300;
      if (show) { b.style.display = 'flex'; requestAnimationFrame(function () { b.style.opacity = '1'; }); }
      else { b.style.opacity = '0'; b.style.display = 'none'; }
    };
    b.style.opacity = '0'; b.style.transition += ', opacity .2s ease';
    window.addEventListener('scroll', onScroll, { passive: true });
    b.addEventListener('mouseenter', function () { b.style.transform = 'translateY(-3px) scale(1.07)'; b.style.boxShadow = '0 12px 28px rgba(20,40,15,.44)'; });
    b.addEventListener('mouseleave', function () { b.style.transform = ''; b.style.boxShadow = base; });
    b.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    onScroll();
  }

  function boot() {
    mountHead();
    if (handleAuthRedirect()) { applyLang(); return; }   // 초대/재설정 모드면 비번 설정만
    mountAuth(); mountFooter(); applyLang(); guardPage(); mountConnToggle(); mountHelp(); mountToTop(); mountAudit(); mountUpdateCheck();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
