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
      so_netOff: '⚠ ネットワークが切れています — 注文・保存はできません。紙に控えて、つながってから入力してください',
      so_netOn: 'ネットワークが回復しました',
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
      ix_c1Cd: 'メリットツアーの予約データ登録 · 以降すべての業務の基準名簿',
      ix_g2H: r('現場','げんば')+r('運営','うんえい'),
      ix_g2Desc: r('登録','とうろく')+'したデータで'+r('配置','はいち')+'・'+r('精算','せいさん'),
      ix_c2Step: 'STEP 2',
      ix_c2H: r('ホテル','')+r('部屋','へや')+r('割','わ')+'り'+r('当','あ')+'て',
      ix_c2Cd: '到着〜出発の客室割当 · 会員はデラックス優先、同行は同じ階に',
      ix_goEnter: r('入','はい')+'る',
      ix_cFrontH: 'フロントデスク',
      ix_cFrontCd: '到着・出発・在室の応対 · チェックイン/アウト、入金、領収書',
      ix_cInvRoomH: '客室在庫・備品',
      ix_cInvRoomCd: '客室備品・アメニティ・ミニバーの在庫と仕入',
      ix_cPosCustH: 'お客様確認画面',
      ix_cPosCustCd: 'お客様前のタブレットにご精算内容を表示',
      ix_cInvFnbH: 'F&B在庫',
      ix_cInvFnbCd: '食材・飲料・酒類・厨房消耗品の在庫と仕入',
      ix_gInv: r('在庫','ざいこ')+'・'+r('仕入','しいれ'),
      ix_gInvDesc: '部署ごとに在庫と仕入(仕入先・単価)を管理します',
      ix_cInvHkH: '清掃・リネン在庫',
      ix_cInvHkCd: 'リネン・清掃用品・洗剤の在庫と仕入',
      ix_cInvGolfH: 'ゴルフ・カート在庫',
      ix_cInvGolfCd: 'カート部品・コース資材・ゴルフ用品の在庫と仕入',
      ix_cInvFrontH: 'フロント・事務在庫',
      ix_cInvFrontCd: '事務用品・印刷用紙・販促物の在庫と仕入',
      ix_cInvShizuH: '志津の宿 在庫',
      ix_cInvShizuCd: '志津の宿の備品・アメニティ・リネンの在庫と仕入',
      ix_calOpen: '📅 月·年カレンダー →', ix_stayNow: '🏨 現在の滞在', ix_ciToday: '🛬 本日IN', ix_coToday: '🛫 本日OUT',
      ix_regData: '📅 登録済データ', ix_teamUnit: 'チーム', ix_pplUnit: '名',
      ix_wxTitle: '🗻 ヤマナミ 時間別天気', ix_wxNow: '今', ix_wxHour: '時', ix_wxTmr: '明日',
      ix_wxNone: '天気を読み込めませんでした。', ix_wxProvider: '提供: Open-Meteo · 阿蘇',
      ix_soon: r('予定','よてい'),
      ix_c3H: 'ゴルフ'+r('ラウンド',''),
      ix_c3Cd: r('出発地','しゅっぱつち')+'・'+r('曜日','ようび')+'・'+r('宿泊','しゅくはく')+r('施設','しせつ')+r('別','べつ')+'のラウンド'+r('配置','はいち')+'。'+r('部屋','へや')+r('割','わ')+'り'+r('当','あ')+'てと'+r('同','おな')+'じパターンで'+r('日付','ひづけ')+r('別','べつ')+'チームを'+r('呼','よ')+'び'+r('出','だ')+'して'+r('配置','はいち')+'します。',
      ix_c4H: r('夕食','ゆうしょく'),
      ix_c4Cd: r('日付','ひづけ')+r('別','べつ')+r('食事','しょくじ')+r('人数','にんずう')+'・'+r('座席','ざせき')+r('配置','はいち')+'。'+r('同','おな')+'じデータを'+r('共有','きょうゆう')+'します。',
      ix_c5H: r('現場','げんば')+r('精算','せいさん')+'（'+r('御','ご')+r('請求','せいきゅう')+r('書','しょ')+'）',
      ix_c5Cd: '滞在中の追加料金を集計 · チェックアウト時に御請求書を発行',
      ix_c6H: r('注文','ちゅうもん')+r('入力','にゅうりょく')+'（'+r('簡易','かんい')+'POS）',
      ix_posRest: 'レストラン・'+r('宴会','えんかい')+' POS',
      ix_posRestCd: '飲食・宴会の注文をチームのご精算に · 厨房分は厨房へ',
      ix_posFront: 'フロント POS',
      ix_posFrontCd: 'フロント販売品と追加料金をご精算に反映',
      ix_posGolf: 'ゴルフショップ POS',
      ix_posGolfCd: 'グローブ・ボール・帽子などの物販（9H追加はフロント）',
      ix_c6Cd: 'レストラン・'+r('宴会場','えんかいじょう')+'・ゴルフショップで、'+r('係員','かかりいん')+'がタブレットでメニューをタップし'+r('該当','がいとう')+'チームに'+r('直接','ちょくせつ')+r('注文','ちゅうもん')+'を'+r('付','つ')+'けます。'+r('合計','ごうけい')+'は'+r('精算','せいさん')+r('口座','こうざ')+'に'+r('自動','じどう')+'で'+r('反映','はんえい')+'。',
      ix_c7H: r('厨房','ちゅうぼう')+r('画面','がめん')+'（KDS）',
      ix_c7Cd: '厨房で作る注文のみ順に表示 · 調理完了の処理',
      ix_kdsBar: 'バー・フロント'+r('画面','がめん'),
      ix_kdsBarCd: '厨房の料理とバーの飲料をまとめて · レストランフロント用',
      ix_cBoard: ''+r('部署','ぶしょ')+r('連絡','れんらく')+'・'+r('今日','きょう')+r('要約','ようやく'),
      ix_cBoardCd: '部署のお知らせ · 本日の入退室・注文・売上の要約',
      ix_cNotes: ''+r('運営','うんえい')+'メモ',
      ix_cNotesCd: 'チーム'+r('別','べつ')+'ラベル・'+r('山並','やまなみ')+'コース・'+r('備考','びこう')+'・メモを'+r('複数','ふくすう')+r('担当','たんとう')+'で'+r('共有','きょうゆう')+r('管理','かんり')+'('+r('変更','へんこう')+r('履歴','りれき')+r('含','ふく')+'む)。',
      ix_deptBoard: ''+r('部署','ぶしょ')+r('連絡','れんらく'),
      ix_gAdmin: r('管理','かんり')+'・マスター',
      ix_gMgmt: r('経営','けいえい'),
      ix_cStatsH: r('経営','けいえい')+r('統計','とうけい'),
      ix_cStatsCd: '入込・売上・稼働率・客層（代表・部門長専用）',
      ix_cVisitorH: r('訪問','ほうもん')+r('統計','とうけい'),
      ix_cVisitorCd: '会員・非会員の来場人数集計（協会・県庁報告用）',
      ix_cAdmin: ''+r('権限','けんげん')+r('管理','かんり'),
      ix_cAdminCd: 'スタッフアカウントの役割と担当範囲の指定',
      ix_cAudit: r('データ','')+r('検収','けんしゅう'),
      ix_cAuditCd: '名簿・番号の食い違いを印刷前に点検',
      ix_cWatch: r('特異','とくい')+r('予約','よやく')+' '+r('監視','かんし'),
      ix_cWatchCd: '規定から外れた予約形態の点検 · 指定担当者のみ',
      ix_lvlMaster: 'A',
      ix_lvlMasterT: '管理者(マスター)級 · 権限指定者のみ',
      ix_cGroup: 'グループコード・'+r('会員','かいいん')+'マスター',
      ix_cGroupCd: '会員グループコードの登録・照会 · 指定担当者のみ',
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
      ix_c8Cd: '販売品目・価格・提供元(厨房/バー)の管理',
      ix_g3H: r('印刷物','いんさつぶつ'),
      ix_gPrintDesc: r('単発','たんぱつ')+r('印刷','いんさつ')+r('出力','しゅつりょく')+'（'+r('登録','とうろく')+'データ'+r('基準','きじゅん')+'）',
      ix_cNametagH: 'ネームタグ '+r('印刷','いんさつ'),
      ix_cNametagCd: 'お客様個人のネームタグ印刷',
      ix_cRoomStatsH: r('部屋割当','へやわりあて')+' '+r('統計','とうけい'),
      ix_cRoomStatsCd: '会員の客室グレード割当状況 · デラックス未割当の会員',
      ix_cHkH: r('客室','きゃくしつ')+r('清掃','せいそう'),
      ix_cHkCd: 'その日清掃する客室を階ごとに · 進捗の確認',
      ix_cOccupH: r('日別','ひべつ')+' '+r('滞在','たいざい')+r('状況','じょうきょう'),
      ix_cOccupCd: '日付別の使用・空き客室を一覧 · 満室間近の確認',
      ix_cKeyslipH: 'ルームキー ラベル',
      ix_cKeyslipCd: 'ルームキーに挿すラベル印刷（1部屋1枚）',
      ix_cAircoverH: r('航空','こうくう')+'カバー'+r('置','お')+'き'+r('場','ば'),
      ix_cAircoverCd: 'チーム別の航空案内カード印刷（A5 · 1チーム1枚）',
      ix_cDispatchH: r('現地','げんち')+r('手配書','てはいしょ'),
      ix_cDispatchCd: 'イベント別の手配書 · 裏面は現地発生分の記入欄（A4両面）',
      ix_cDinnerH: r('夕食','ゆうしょく')+'オーダー',
      ix_cDinnerCd: 'その日の夕食名簿と朝・昼・夕の食数（A3 1枚）',
      ix_dPartner: r('提携','ていけい')+r('宿泊施設','しゅくはくしせつ'),
      ix_dPartnerDesc: r('志津','しづ')+'の'+r('宿','やど')+'・ガンジーホテル — '+r('施設','しせつ')+r('別','べつ')+r('予約表','よやくひょう'),
      ix_cShizuH: r('志津','しづ')+'の'+r('宿','やど')+' '+r('予約','よやく')+r('表','ひょう'),
      ix_cShizuCd: '志津の宿 客室予約表の作成・印刷',
      ix_cCartH: r('電気','でんき')+'カート'+r('配車表','はいしゃひょう'),
      ix_cCartCd: '日付別カートの保有・使用・残数とチーム割当',
      ix_cCourseH: r('コース','')+r('割当表','わりあてひょう'),
      ix_cCourseCd: 'コース・ティ時刻の割当と組編成 · 印刷してコースへ',
      ix_cGolfH: 'ゴルフ'+r('組編成','くみへんせい'),
      ix_cGolfCd: r('商品名','しょうひんめい')+'から'+r('日','ひ')+'を'+r('自動','じどう')+r('抽出','ちゅうしゅつ')+' → 4'+r('人','にん')+'1'+r('組','くみ')+'を'+r('編成','へんせい')+'（'+r('阿蘇','あそ')+'·'+r('祖母','そぼ')+'·'+r('久住','くじゅう')+'）·'+r('組編成表','くみへんせいひょう')+r('印刷','いんさつ'),
      ix_cTransferH: '送迎表', ix_cTransferCd: '便ごとの送迎 · ドライバー配車表とお迎え名簿',
      ix_cQrCardsH: 'お'+r('客様','きゃくさま')+'QR'+r('カード',''), ix_cQrCardsCd: 'チェックイン'+r('時','じ')+'にお'+r('渡','わた')+'しするチーム'+r('別','べつ')+'QRカードの'+r('印刷','いんさつ'),
      ix_cNoticeH: r('案内文','あんないぶん')+r('作成','さくせい'), ix_cNoticeCd: '現場用の案内文を作成・印刷（日韓併記）',
      ix_cSettleMeritH: 'B2B'+r('精算','せいさん'),
      ix_cSettleMeritCd: 'メリットツアーの宿泊・送迎 月次精算 · 控除反映のExcel',
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
      s1_recodeLog: '⚠ Fコード自動修正: {d} 以降 出発のうち、同じ日の他チームと文字が重なる {n}チーム のコードを付け直しました。',
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
      so_auditH: '🕘 変更履歴 — 誰が·いつ·何を変えたか',
      me_cat: r('区分','くぶん'),
      me_grp: r('大分類','だいぶんるい'),
      me_sub: r('小分類','しょうぶんるい'),
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
      so_netOff: '⚠ 인터넷이 끊겼습니다 — 주문·저장이 안 됩니다. 종이에 적어 두고 연결되면 입력하세요',
      so_netOn: '인터넷이 다시 연결되었습니다',
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
      ix_c1Cd: '메리트투어 예약 자료 등록 · 이후 모든 업무의 기준 명단',
      ix_g2H: '현장 운영',
      ix_g2Desc: '등록된 데이터로 배정·정산',
      ix_c2Step: 'STEP 2',
      ix_c2H: '호텔 방배정',
      ix_c2Cd: '도착~퇴실 객실 배정 · 회원 디럭스 우선, 일행은 같은 층',
      ix_goEnter: '들어가기',
      ix_cFrontH: '프론트 데스크',
      ix_cFrontCd: '도착·출발·재실 응대 · 체크인/아웃, 결제, 영수증',
      ix_cInvRoomH: '객실 재고 · 비품',
      ix_cInvRoomCd: '객실 비품·어메니티·미니바 재고와 사입',
      ix_cPosCustH: '손님 확인 화면',
      ix_cPosCustCd: '손님 앞 태블릿에 계산 내역 표시',
      ix_cInvFnbH: 'F&B 재고',
      ix_cInvFnbCd: '식자재·음료·주류·주방 소모품 재고와 사입',
      ix_gInv: '재고 · 사입',
      ix_gInvDesc: '부서별로 재고와 사입(거래처·단가)을 관리합니다',
      ix_cInvHkH: '청소 · 린넨 재고',
      ix_cInvHkCd: '린넨·청소용품·세제 재고와 사입',
      ix_cInvGolfH: '골프 · 카트 재고',
      ix_cInvGolfCd: '카트 부품·코스 자재·골프 용품 재고와 사입',
      ix_cInvFrontH: '프론트 · 사무 재고',
      ix_cInvFrontCd: '사무용품·인쇄용지·판촉물 재고와 사입',
      ix_cInvShizuH: '시즈노야도 재고',
      ix_cInvShizuCd: '시즈노야도 비품·어메니티·린넨 재고와 사입',
      ix_calOpen: '📅 월·연 캘린더 →', ix_stayNow: '🏨 지금 체류', ix_ciToday: '🛬 오늘 체크인', ix_coToday: '🛫 오늘 체크아웃',
      ix_regData: '📅 등록된 데이터', ix_teamUnit: '팀', ix_pplUnit: '명',
      ix_wxTitle: '🗻 야마나미 시간별 날씨', ix_wxNow: '지금', ix_wxHour: '시', ix_wxTmr: '내일',
      ix_wxNone: '날씨를 불러오지 못했습니다.', ix_wxProvider: '제공: Open-Meteo · 아소',
      ix_soon: '예정',
      ix_c3H: '골프 라운딩',
      ix_c3Cd: '출발지·요일·숙박시설별 라운딩 배정. 방배정과 같은 패턴으로 날짜별 팀을 불러와 배정합니다.',
      ix_c4H: '저녁 식사',
      ix_c4Cd: '날짜별 식사 인원·좌석 배정. 같은 데이터를 공유합니다.',
      ix_c5H: '현장 정산 (체크아웃 명세서)',
      ix_c5Cd: '체류 중 추가 요금 집계 · 체크아웃 시 御請求書 발행',
      ix_c6H: '주문 입력 (간이 POS)',
      ix_posRest: '레스토랑·연회 POS',
      ix_posRestCd: '식음·연회 주문을 팀 계산에 · 주방행은 주방으로',
      ix_posFront: '프론트 POS',
      ix_posFrontCd: '프론트 판매 물품과 추가 요금을 계산에 반영',
      ix_posGolf: '골프샵 POS',
      ix_posGolfCd: '장갑·볼·모자 등 물품 판매 (9홀 추가는 프론트)',
      ix_c6Cd: '레스토랑·연회장·골프샵에서 직원이 태블릿으로 메뉴를 탭해 해당 팀에 바로 주문을 답니다. 합계는 정산 계정에 자동 반영됩니다.',
      ix_c7H: '주방 화면 (KDS)',
      ix_c7Cd: '주방에서 만들 주문만 순서대로 · 조리 완료 처리',
      ix_kdsBar: '바·프론트 화면',
      ix_kdsBarCd: '주방 음식과 바 음료를 함께 · 레스토랑 프론트용',
      ix_cBoard: '부서 공지 · 오늘 요약',
      ix_cBoardCd: '부서 공지 · 오늘 입퇴실·주문·매출 요약',
      ix_cNotes: '팀 운영 메모',
      ix_cNotesCd: '팀별 라벨·야마나미 코스·비고·메모를 여러 담당자가 공유 관리(수정이력 포함).',
      ix_deptBoard: '부서 공지',
      ix_gAdmin: '관리 · 마스터',
      ix_gMgmt: '경영',
      ix_cStatsH: '경영 통계',
      ix_cStatsCd: '입도·매출·가동률·고객 구성 (대표·부서장 전용)',
      ix_cVisitorH: '방문 통계',
      ix_cVisitorCd: '회원·비회원 방문 인원 집계 (협회·현청 보고용)',
      ix_cAdmin: '권한 관리',
      ix_cAdminCd: '직원 계정의 역할과 담당 업무 범위 지정',
      ix_cAudit: '데이터 검수',
      ix_cAuditCd: '명단·번호가 어긋난 팀을 인쇄 전에 점검',
      ix_cWatch: '특이 예약 감시',
      ix_cWatchCd: '규정을 벗어난 예약 형태 점검 · 지정 담당자 전용',
      ix_lvlMaster: 'A',
      ix_lvlMasterT: '관리자(마스터)급 · 권한 지정자만',
      ix_cGroup: '그룹코드 · 회원 마스터',
      ix_cGroupCd: '회원 그룹코드 등록·조회 · 지정 담당자 전용',
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
      ix_c8Cd: '판매 품목·가격·나가는 곳(주방/바) 관리',
      ix_g3H: '인쇄물',
      ix_gPrintDesc: '단발 인쇄 출력 (등록 데이터 기준)',
      ix_cNametagH: '네임택 인쇄',
      ix_cNametagCd: '손님 개인 네임택 라벨 인쇄',
      ix_cRoomStatsH: '방배정 통계',
      ix_cRoomStatsCd: '회원 객실 등급 배정 현황 · 디럭스 미배정 회원',
      ix_cHkH: '객실 청소',
      ix_cHkCd: '그날 청소할 객실을 층별로 · 진행 상황 확인',
      ix_cOccupH: '일별 체류 현황',
      ix_cOccupCd: '날짜별 사용·여유 객실 한눈에 · 만실 임박 확인',
      ix_cKeyslipH: '룸키 라벨',
      ix_cKeyslipCd: '룸키 통에 꽂을 라벨 인쇄 (방마다 1장)',
      ix_cAircoverH: '항공커버',
      ix_cAircoverCd: '팀별 항공 안내 카드 인쇄 (A5 · 팀당 1장)',
      ix_cDispatchH: '현지 수배서',
      ix_cDispatchCd: '행사별 수배서 · 뒷면은 현장 발생분 기입란 (A4 양면)',
      ix_cDinnerH: '석식 오더',
      ix_cDinnerCd: '그날 석식 명단과 조·중·석 식수 (A3 1장)',
      ix_dPartner: '제휴 숙소',
      ix_dPartnerDesc: '시즈노야도·간지호텔 — 숙소별 예약표',
      ix_cShizuH: '시즈노야도 예약표',
      ix_cShizuCd: '시즈노야도 객실 예약표 작성·인쇄',
      ix_cCartH: '전기카트 배정표',
      ix_cCartCd: '날짜별 카트 보유·사용·잔여 및 팀 배정',
      ix_cCourseH: '코스 배정표',
      ix_cCourseCd: '코스·티오프 배정과 조편성 · 인쇄해 코스 전달',
      ix_cGolfH: '골프 조편성',
      ix_cGolfCd: '상품명 기반 라운딩 날짜 자동 → 4인 1조 편성(아소·소보·쿠주)·티오프·조편성표 인쇄',
      ix_cTransferH: '송영표', ix_cTransferCd: '항공편별 픽업·샌딩 · 기사 배차표와 미팅 명단',
      ix_cQrCardsH: '손님 QR카드', ix_cQrCardsCd: '체크인 때 손님에게 드리는 팀별 QR 카드 인쇄',
      ix_cNoticeH: '안내문 제작', ix_cNoticeCd: '현장 안내문 제작·인쇄 (한·일 병기)',
      ix_cSettleMeritH: 'B2B 정산',
      ix_cSettleMeritCd: '메리트투어 숙박·송영 월 정산 · 차감 반영 엑셀',
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
      s1_recodeLog: '⚠ F코드 자동 교정: {d} 이후 출발 중 같은 날 다른 팀과 글자가 겹치던 {n}팀의 코드를 새로 부여했습니다.',
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
      po_qrScan:'📷 QR 스캔', po_qrTitle:'손님 QR 스캔', po_qrManualPh:'QR 안 될 때 태그코드 입력 (예: DJマ-Y)', po_qrManualGo:'검색', po_qrNoQrHint:'QR이 없으면 닫고 — 팀 검색창에 태그코드·대표자를 입력하세요.',
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
      so_auditH: '🕘 변경 이력 — 누가·언제·무엇을 바꿨는지',
      me_cat: '정산 구분',
      me_grp: '큰 구분',
      me_sub: '소분류',
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
      so_netOff: '⚠ You are offline — orders and saves will not go through. Write it down and enter it once you are back online',
      so_netOn: 'Back online',
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
      ix_c1Cd: 'Register Merit Tour booking files — the master list every other screen uses',
      ix_g2H: 'Field Operations',
      ix_g2Desc: 'Assign and settle using registered data',
      ix_c2Step: 'STEP 2',
      ix_c2H: 'Hotel Room Assignment',
      ix_c2Cd: 'Assign rooms for the whole stay — members get deluxe first, parties stay on one floor',
      ix_goEnter: 'Enter',
      ix_cFrontH: 'Front Desk',
      ix_cFrontCd: 'Arrivals, departures and in-house — check-in/out, payments and receipts',
      ix_cInvRoomH: 'Room inventory · supplies',
      ix_cInvRoomCd: 'Stock and purchasing for room supplies, amenities and minibar',
      ix_cPosCustH: 'Customer Display',
      ix_cPosCustCd: 'Show the bill on the tablet facing the guest',
      ix_cInvFnbH: 'F&B inventory',
      ix_gInv: 'Inventory · Purchasing',
      ix_gInvDesc: 'Each department manages its own stock and purchasing (suppliers, unit cost)',
      ix_cInvHkH: 'Housekeeping inventory',
      ix_cInvHkCd: 'Stock and purchasing for linen, cleaning supplies and detergents',
      ix_cInvGolfH: 'Golf · cart inventory',
      ix_cInvGolfCd: 'Stock and purchasing for cart parts, course materials and golf goods',
      ix_cInvFrontH: 'Front · office inventory',
      ix_cInvFrontCd: 'Stock and purchasing for office supplies, paper and promotional items',
      ix_cInvShizuH: 'Shizu inventory',
      ix_cInvShizuCd: 'Stock and purchasing for Shizu supplies, amenities and linen',
      ix_cInvFnbCd: 'Stock and purchasing for food, drinks, liquor and kitchen supplies',
      ix_calOpen: '📅 Month/Year calendar →', ix_stayNow: '🏨 Staying now', ix_ciToday: '🛬 In today', ix_coToday: '🛫 Out today',
      ix_regData: '📅 Registered data', ix_teamUnit: ' teams', ix_pplUnit: ' ppl',
      ix_wxTitle: '🗻 Yamanami hourly weather', ix_wxNow: 'Now', ix_wxHour: ':00', ix_wxTmr: 'Tomorrow',
      ix_wxNone: 'Could not load the weather.', ix_wxProvider: 'Source: Open-Meteo · Aso',
      ix_soon: 'Planned',
      ix_c3H: 'Golf Rounding',
      ix_c3Cd: 'Round assignment by departure city, weekday, and lodging facility. Pulls up teams by date and assigns them with the same pattern as room assignment.',
      ix_c4H: 'Dinner',
      ix_c4Cd: 'Meal headcount and seating by date. Shares the same data.',
      ix_c5H: 'Field Settlement (Checkout)',
      ix_c5Cd: 'Collect on-site extras and issue the invoice at check-out',
      ix_c6H: 'Order Entry (Mini POS)',
      ix_posRest: 'Restaurant·Banquet POS',
      ix_posRestCd: 'Post dining and banquet orders to the team’s bill; kitchen items go to the kitchen',
      ix_posFront: 'Front POS',
      ix_posFrontCd: 'Add front-desk goods and extra charges to the bill',
      ix_posGolf: 'Pro Shop POS',
      ix_posGolfCd: 'Retail only — gloves, balls, caps (extra 9H is billed at the front)',
      ix_c6Cd: 'At the restaurant, banquet hall, or pro shop, staff tap menu items on a tablet to charge them directly to the right team. Totals flow automatically into the folio.',
      ix_c7H: 'Kitchen Display (KDS)',
      ix_c7Cd: 'Shows only kitchen items, in order — mark them done when plated',
      ix_kdsBar: 'Bar·Front Display',
      ix_kdsBarCd: 'Kitchen dishes and bar drinks together, for the restaurant front',
      ix_cBoard: 'Dept Notices · Today',
      ix_cBoardCd: 'Department notices plus today’s arrivals, orders and sales',
      ix_cNotes: 'Team Ops Memo',
      ix_cNotesCd: 'Shared team labels, Yamanami course, remarks & memos across staff (with change history).',
      ix_deptBoard: 'Dept notices',
      ix_gAdmin: 'Admin · Master',
      ix_gMgmt: 'Management',
      ix_cStatsH: 'Executive Stats',
      ix_cStatsCd: 'Visitors, revenue, occupancy and guest mix (executives only)',
      ix_cVisitorH: 'Visitor Stats',
      ix_cVisitorCd: 'Member and non-member visitor counts for association and prefecture reports',
      ix_cAdmin: 'Access Control',
      ix_cAdminCd: 'Set each account’s role and which areas they work in',
      ix_cAudit: 'Data Audit',
      ix_cAuditCd: 'Catch mismatched rosters and numbering before anything is printed',
      ix_cWatch: 'Anomalous Booking Watch',
      ix_cWatchCd: 'Review bookings that fall outside policy — designated staff only',
      ix_lvlMaster: 'A',
      ix_lvlMasterT: 'Admin (master) level · assigned holders only',
      ix_cGroup: 'Group Codes · Members',
      ix_cGroupCd: 'Register and look up member group codes — designated staff only',
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
      ix_c8Cd: 'Manage items, prices and where each is made (kitchen / bar)',
      ix_g3H: 'Printouts',
      ix_gPrintDesc: 'One-off print outputs (from registered data)',
      ix_cNametagH: 'Name Tag Printing',
      ix_cNametagCd: 'Print name tags for each guest',
      ix_cRoomStatsH: 'Room Assignment Stats',
      ix_cRoomStatsCd: 'Which room grade each member received — and who never got deluxe',
      ix_cHkH: 'Housekeeping',
      ix_cHkCd: 'Rooms to clean today by floor, with progress',
      ix_cOccupH: 'Daily occupancy',
      ix_cOccupCd: 'Rooms used and free by date — spot the days filling up',
      ix_cKeyslipH: 'Room Key Slips',
      ix_cKeyslipCd: 'Print the slip for each room key holder (one per room)',
      ix_cAircoverH: 'Air Cover',
      ix_cAircoverCd: 'Print flight cards, one A5 sheet per team',
      ix_cDispatchH: 'Field Dispatch Sheet',
      ix_cDispatchCd: 'Arrangement sheet per event; reverse side records on-site charges (A4 duplex)',
      ix_cDinnerH: 'Dinner Order',
      ix_cDinnerCd: 'Tonight’s dinner list with breakfast/lunch/dinner counts (one A3 sheet)',
      ix_dPartner: 'Partner lodgings',
      ix_dPartnerDesc: 'Shizu-no-Yado · The Guernsey — per-property booking sheets',
      ix_cShizuH: 'Shizu-no-Yado Chart',
      ix_cShizuCd: 'Prepare and print the Shizu-no-yado room chart',
      ix_cCartH: 'EV Cart Assignment',
      ix_cCartCd: 'Carts owned, in use and free by date, with team assignment',
      ix_cCourseH: 'Course assignment',
      ix_cCourseCd: 'Assign course and tee times, build the groups, print for the course',
      ix_cGolfH: 'Golf Grouping',
      ix_cGolfCd: 'Round days auto-derived from product → form 4-somes (Aso·Sobo·Kuju), tee times, print sheet',
      ix_cTransferH: 'Transfer sheet', ix_cTransferCd: 'Pickups and drop-offs by flight — driver sheet and greeting list',
      ix_cQrCardsH: 'Guest QR cards', ix_cQrCardsCd: 'Print the QR card handed to each team at check-in',
      ix_cNoticeH: 'Notice builder', ix_cNoticeCd: 'Compose and print on-site notices (Korean/Japanese)',
      ix_cSettleMeritH: 'B2B Settlement',
      ix_cSettleMeritCd: 'Monthly Merit Tour settlement for lodging and transfers, with deductions',
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
      s1_recodeLog: '⚠ F-code auto-fix: reissued codes for {n} team(s) departing on/after {d} whose code clashed with another team arriving the same day.',
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
      so_auditH: '🕘 Change history — who changed what, when',
      me_cat: 'Billing category',
      me_grp: 'Group',
      me_sub: 'Sub',
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

  // ── 손님 이름 표기 — 일본어 화면에서는 한글 이름을 **가타카나**로 보여준다.
  //   현장은 일본어로 돌아가는데 명단만 한글이면 일본인 담당자가 읽지 못한다.
  //   판정 규칙은 **現地手配書(dispatch.html)와 동일**하다 — 여권 영문 철자가 있으면 그것으로
  //   요미를 만들고(SZCore.nameYomiEn), 없을 때만 한글 발음으로 폴백(SZCore.nameYomi).
  //   예: 강병욱 KANG BYONG UK → カン ビョンウク (한글기반 ピョン 이 아니라 영문 유성음 b→ビョン)
  //   手配書는 姓/名 칸이 따로라 두 칸에 나눠 찍고, 화면은 한 줄이라 **사이를 띄워** 같은 구분을 보인다.
  //   한국어·영어 화면은 한글 그대로.
  //   ⚠ 표시 전용 — 저장값(name_kr)은 건드리지 않는다. 검색은 원문(한글·영문)으로 계속 걸린다.
  var _pnCache = {};
  function personName(nameKr, nameEn) {
    var kr = String(nameKr == null ? '' : nameKr).trim();
    var en = String(nameEn == null ? '' : nameEn).trim();
    if (LANG !== 'ja') return kr || en;
    if (!kr && !en) return '';
    var key = kr + '|' + en;
    if (_pnCache[key]) return _pnCache[key];
    var C = global.SZCore, y = null;
    try {
      if (en && C && C.nameYomiEn) y = C.nameYomiEn(en);
      else if (kr && C && C.nameYomi) y = C.nameYomi(kr);
    } catch (e) { y = null; }
    // 現地手配書와 같은 규칙·같은 구분 — 姓/名 을 나눠 읽는다(手配書는 칸이 따로, 화면은 사이를 띄운다).
    var out = (y && (y.sur || y.given)) ? ((y.sur && y.given) ? (y.sur + ' ' + y.given) : (y.sur || y.given)) : (kr || en);
    return (_pnCache[key] = out);
  }
  global.__so_pname = personName;

  // ── 하드웨어 QR 스캐너(HID 키보드 모드) 전역 입력 ────────────────────────────
  //   시중의 2D 바코드 스캐너는 USB 를 꽂으면 '키보드'로 인식되어, 읽은 문자열을
  //   글자 입력으로 흘려보내고 끝에 Enter 를 붙인다. 따로 드라이버·연동 코드가 필요 없다.
  //   사람 타이핑과 구분: 사람은 8자 이상을 글자당 50ms 미만으로 연속 입력하지 못한다.
  //   ⚠ 스캐너가 없어도 토큰을 키보드로 치고 Enter 를 누르면 같은 경로로 동작(검증 가능).
  //   cb(raw) 로 읽은 문자열을 넘긴다. 페이지마다 무엇을 열지는 cb 가 정한다.
  global.__so_hidScan = function (cb, opt) {
    var MAXGAP = (opt && opt.maxGap) || 50, MINLEN = (opt && opt.minLen) || 8;
    var buf = '', last = 0, el = null, prev = '';
    function reset() { buf = ''; el = null; prev = ''; }
    document.addEventListener('keydown', function (e) {
      var now = Date.now();
      if (e.key === 'Enter') {
        var fast = buf.length >= MINLEN && (now - last) <= MAXGAP;
        if (fast) {
          var raw = buf;
          // 스캔 문자가 입력칸에 섞였으면 원래 값으로 되돌린다(검색창에 토큰이 남지 않게)
          if (el && 'value' in el) { try { el.value = prev; el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {} }
          reset(); e.preventDefault();
          try { cb(raw); } catch (_) {}
        } else reset();
        return;
      }
      if (e.key.length !== 1) return;      // 제어키 무시
      if (now - last > MAXGAP) {           // 간격이 벌어지면 새 버스트 시작
        buf = ''; el = document.activeElement || null;
        prev = (el && 'value' in el) ? el.value : '';
      }
      buf += e.key; last = now;
    });
  };
  // QR 값(청구서 URL 또는 raw 토큰) → 토큰 문자열
  global.__so_qrToken = function (raw) {
    var t = String(raw == null ? '' : raw).trim();
    var m = t.match(/[?&]t=([^&\s]+)/);
    return m ? decodeURIComponent(m[1]) : t;
  };

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
      var honor = LANG === 'ja' ? '様' : (LANG === 'en' ? '' : ' 님');
      var outLbl = LANG === 'ja' ? 'ログアウト' : (LANG === 'en' ? 'Log out' : '로그아웃');
      wrap.innerHTML = '<span class="so-auth-ic"></span>'
        + '<span class="so-auth-email"><b>' + escU(label) + '</b>' + honor + sub + '</span>'
        + '<button type="button" class="so-user-btn" id="so-auth-out">' + outLbl + '</button>';
      wrap.querySelector('#so-auth-out').addEventListener('click', authLogout);
    } else {
      // 로그인은 가운데 카드(게이트)에서만 받는다 — 상단 [로그인] 버튼 제거
      wrap.innerHTML = '';
      wrap.style.display = 'none';
    }
  }
  function authLogout() {
    var c = authClient(); if (!c) return;
    c.auth.signOut().then(function () { location.reload(); }).catch(function () { location.reload(); });
  }

  // ── 팀 묶음 통일 태그(공용) ─────────────────────────────────────────
  //  現地手配書에서 묶은 팀(print_overrides.team_group)은 어느 산출물에서도
  //  **대표팀 기준코드 + 팀번호**(DRな-Y1 · DRな-Y2)로 같게 보여야 현장이 한 팀으로 읽는다.
  //  규칙은 手配書와 동일 — ① 순번(team_group_seq) 전원 지정 시 그 순서
  //                        ② 아니면 SZCore.orderGroup(대표 먼저 → 입국일 → 행사번호)
  //  ⚠ 묶음 이름이 태그코드라 코드 재사용 시 다른 시기 묶음이 섞인다 → splitByReps 로 가른다.
  //  ⚠ 묶음 상대가 다른 달일 수 있으므로 그룹 전원을 달과 무관하게 조회한다.
  //    const GT = await __so_groupTags(supa, seqs);   // {event_seq: 'DRな-Y1'} (묶이지 않은 팀은 없음)
  global.__so_groupTags = async function (supa, seqs) {
    var out = {};
    try {
      if (!supa || !seqs || !seqs.length) return out;
      var SZ = global.SZCore;
      if (!(SZ && SZ.orderGroup && SZ.teamTagN && SZ.tagStripSeq)) return out;
      var uniq = [], _u = {};
      seqs.forEach(function (x) { var k = String(x); if (k && !_u[k]) { _u[k] = 1; uniq.push(k); } });
      // 1) 화면에 있는 팀이 속한 묶음 키
      var keys = {}, i, r;
      for (i = 0; i < uniq.length; i += 400) {
        r = await supa.from('print_overrides').select('event_seq,team_group').in('event_seq', uniq.slice(i, i + 400));
        (r.data || []).forEach(function (x) { if (x.team_group) keys[x.team_group] = 1; });
      }
      var kk = Object.keys(keys); if (!kk.length) return out;
      // 2) 그 묶음의 팀 전원(달 무관)
      var rows = [];
      for (i = 0; i < kk.length; i += 200) {
        r = await supa.from('print_overrides')
          .select('event_seq,team_group,team_group_rep,team_group_seq').in('team_group', kk.slice(i, i + 200));
        rows = rows.concat(r.data || []);
      }
      // 3) 기준코드(person_tag 우선 → group_code)·입국일
      var need = [], _n = {};
      rows.forEach(function (x) { var k = String(x.event_seq); if (!_n[k]) { _n[k] = 1; need.push(k); } });
      var info = {};
      for (i = 0; i < need.length; i += 200) {
        var ch = need.slice(i, i + 200);
        r = await supa.from('guests').select('event_seq,group_code,team_tag,bookings!inner(dep_date)').in('event_seq', ch);
        (r.data || []).forEach(function (x) { info[x.event_seq] = { dep: (x.bookings || {}).dep_date || '', tag: x.group_code || x.team_tag || '' }; });
        r = await supa.from('guest_members').select('event_seq,person_tag,seq_in_team').in('event_seq', ch).order('seq_in_team');
        (r.data || []).forEach(function (x) { var e = info[x.event_seq]; if (e && !e.ptag && x.person_tag) e.ptag = x.person_tag; });
      }
      var map = {}, seen = {};
      rows.forEach(function (x) {
        var k = x.team_group + '|' + x.event_seq; if (seen[k]) return; seen[k] = 1;   // 중복 = 번호 밀림
        var e = info[x.event_seq] || {};
        (map[x.team_group] = map[x.team_group] || []).push({
          seq: String(x.event_seq), rep: !!x.team_group_rep,
          gseq: (x.team_group_seq == null ? null : x.team_group_seq),
          dep: e.dep || '', tag: SZ.tagStripSeq(e.ptag || e.tag || '')
        });
      });
      Object.keys(map).forEach(function (k) {
        var parts = SZ.splitByReps ? SZ.splitByReps(map[k].map(function (x) { var o = {}; for (var q in x) o[q] = x[q]; o.event_seq = x.seq; return o; })) : [map[k]];
        parts.forEach(function (teams) {
          if (!teams || teams.length < 2) return;                       // 혼자 남은 묶음 = 단독
          var rep = null; teams.forEach(function (x) { if (x.rep && !rep) rep = x; });
          if (!rep || !rep.tag) return;                                 // 대표 미지정(구 묶음) = 원래 태그 유지
          var manual = teams.every(function (x) { return x.gseq != null; });
          var ordered = manual
            ? teams.slice().sort(function (a, b) { return (a.gseq - b.gseq) || (Number(a.seq) - Number(b.seq)); })
            : SZ.orderGroup(teams.map(function (x) { return { event_seq: x.seq, dep: x.dep }; }), rep.seq)
                .map(function (o) { return teams.filter(function (x) { return String(x.seq) === String(o.event_seq); })[0]; })
                .filter(Boolean);
          ordered.forEach(function (x, n) { out[x.seq] = SZ.teamTagN(rep.tag, n + 1); });
        });
      });
    } catch (e) { console.warn('묶음 태그 계산 실패:', e && e.message); }
    return out;
  };

  // ── 領収書 발행(공용) ────────────────────────────────────────────────
  //  御請求書(청구서)와 별개. 손님이 「領収書를 달라」고 할 때 그 자리에서 발행한다.
  //  정산 화면과 프론트 데스크가 **같은 한 벌**을 쓴다(양식이 갈라지지 않게).
  //    __so_receipt({tag:'FAあ-Y', repName:'김철수', no:12345, paid:24000, cash:24000})
  //  paid = 이미 받은 금액(기본 금액) · cash = 그중 현금 — 収入印紙 판정에 쓴다.
  var RC_I18N = {
    ja: { title:'領収書の発行', to:'宛名', toPh:'例) 株式会社○○ / お客様名', forLbl:'但し書き',
          amt:'金額(税込)', amtHint:'既定=お受け取り済みの金額',
          noPaid:'まだ入金がありません — 金額を直接ご入力ください',
          stamp:'※ 現金でのお受け取りが5万円以上の場合は収入印紙が必要です(カード決済は不要)',
          make:'領収書を作成', close:'閉じる', needAmt:'金額を入力してください',
          print:'印刷', closeX:'閉じる', popup:'ポップアップがブロックされました — 許可が必要です' },
    ko: { title:'領収書 발행', to:'받는 분(宛名)', toPh:'예) 株式会社○○ / 손님 성함', forLbl:'但し書き(명목)',
          amt:'금액(税込)', amtHint:'기본값 = 이미 받은 금액',
          noPaid:'아직 받은 금액이 없습니다 — 금액을 직접 입력하세요',
          stamp:'※ 현금 수령이 5만엔 이상이면 수입인지가 필요합니다(카드 결제는 불요)',
          make:'領収書 만들기', close:'닫기', needAmt:'금액을 입력하세요',
          print:'인쇄', closeX:'닫기', popup:'팝업 차단 — 허용 필요' },
    en: { title:'Issue a receipt (領収書)', to:'Payer name', toPh:'e.g. Company name / guest name', forLbl:'For (但し書き)',
          amt:'Amount (tax incl.)', amtHint:'Defaults to the amount already received',
          noPaid:'No payment recorded yet — enter the amount directly',
          stamp:'※ A revenue stamp is required for cash receipts of ¥50,000 or more (not for card payments)',
          make:'Create receipt', close:'Close', needAmt:'Enter the amount',
          print:'Print', closeX:'Close', popup:'Popup blocked — please allow' }
  };
  var RC_FORS = ['ご利用代金として', 'ご宿泊代として', 'ご飲食代として', 'ゴルフ代として'];
  var RC_TAX = 0.10;   // 内税(표시가에 포함된 소비세)

  function rcEsc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function rcYen(n) { return '¥' + Number(n || 0).toLocaleString('ja-JP'); }

  //  실제 인쇄물 — A4 위쪽이 손님용, 절취선 아래가 控え(보관용)
  function rcPrint(o, R) {
    var today = new Date().toISOString().slice(0, 10);
    var amount = Math.round(Number(o.amount) || 0);
    var net = Math.round(amount / (1 + RC_TAX)), tax = amount - net;
    //  収入印紙 = **현금** 수령이 5만엔 이상일 때만(카드 결제는 불요)
    var needStamp = Math.min(Number(o.cash) || 0, amount) >= 50000;
    var tag = rcEsc(o.tag || ''), to = rcEsc(o.to || ''), forWhat = rcEsc(o.forWhat || '');
    var html = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>領収書 — ' + tag + ' ' + today + '</title>'
      + '<style>' + (global.__SO_JP_FONT || '')
      + '@page{size:A4 portrait;margin:0}'
      + '*{box-sizing:border-box;margin:0;padding:0}'
      + "body{font-family:'Meiryo','Malgun Gothic','Noto Sans JP',sans-serif;background:#eceef1;color:#111}"
      + '.toolbar{position:sticky;top:0;background:#fff;border-bottom:1px solid #ccc;display:flex;align-items:center;gap:12px;padding:12px 20px}'
      + '.toolbar h1{font-size:15px}.toolbar .meta{font-size:12px;color:#666}'
      + '.toolbar button{padding:8px 18px;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;background:#15803d;color:#fff}'
      + '.toolbar button.c{background:#999}'
      + '.sheet{width:210mm;min-height:297mm;margin:16px auto;background:#fff;padding:14mm 16mm}'
      + '.rc{border:1.2pt solid #111;padding:11mm 12mm;height:128mm;display:flex;flex-direction:column}'
      + '.rc h2{font-size:30pt;font-weight:800;letter-spacing:12px;text-align:center;margin-bottom:2mm}'
      + '.rc .no{display:flex;justify-content:flex-end;gap:8mm;font-size:9.5pt;color:#333;margin-bottom:6mm}'
      + '.rc .to{font-size:15pt;font-weight:800;border-bottom:1pt solid #111;padding:0 2mm 2mm;margin-bottom:7mm;min-height:9mm}'
      + '.rc .to small{font-size:11pt;font-weight:600;margin-left:3mm}'
      + ".rc .amt{font-size:30pt;font-weight:800;text-align:center;letter-spacing:2px;border-bottom:1.6pt solid #111;padding-bottom:3mm;margin-bottom:6mm;font-family:Consolas,'SZJpMono',monospace}"
      + '.rc .for{font-size:12.5pt;margin-bottom:2.5mm}.rc .for b{font-weight:800}'
      + '.rc .said{font-size:12pt;margin-bottom:6mm}'
      + '.rc .brk{font-size:10.5pt;color:#333;display:flex;gap:8mm}'
      + '.rc .foot{margin-top:auto;display:flex;align-items:flex-end}'
      + '.rc .issuer{font-size:11.5pt;line-height:1.7}.rc .issuer b{font-size:13pt;font-weight:800}'
      + '.rc .stamp{margin-left:auto;width:30mm;height:30mm;border:0.8pt dashed #888;display:flex;align-items:center;justify-content:center;font-size:8.5pt;color:#666;text-align:center;line-height:1.4}'
      + '.cut{margin:6mm 0;border-top:0.5pt dashed #999;text-align:center}'
      + '.cut span{position:relative;top:-7px;background:#fff;padding:0 3mm;font-size:8.5pt;color:#888}'
      + '.note{font-size:9pt;color:#444;line-height:1.7}.note b{color:#111}'
      + '@media print{ body{background:#fff} .toolbar{display:none} .sheet{margin:0;width:auto;min-height:auto;padding:14mm 16mm} }'
      + '</style></head><body>'
      + '<div class="toolbar"><h1>領収書</h1><div class="meta">' + tag + ' · ' + to + ' · ' + today + '</div><div style="flex:1"></div>'
      + '<button onclick="window.print()">🖨 ' + rcEsc(R.print) + '</button>'
      + '<button class="c" onclick="window.close()">✕ ' + rcEsc(R.closeX) + '</button></div>'
      + '<div class="sheet"><div class="rc">'
      + '<h2>領 収 書</h2>'
      + '<div class="no"><span>発行日 ' + today + '</span><span>No. ' + rcEsc(String(o.no == null ? '' : o.no)) + '</span></div>'
      + '<div class="to">' + to + ' <small>様</small></div>'
      + '<div class="amt">' + rcYen(amount) + ' -</div>'
      + '<div class="for">但 <b>' + forWhat + '</b></div>'
      + '<div class="said">上記正に領収いたしました。</div>'
      + '<div class="brk"><span>税抜 ' + rcYen(net) + '</span><span>消費税(10%) ' + rcYen(tax) + '</span><span>合計(税込) ' + rcYen(amount) + '</span></div>'
      + '<div class="foot"><div class="issuer"><b>アソ ヤマナミリゾート</b><br>株式会社SaiZen<br>'
      + '<span style="font-size:10pt;color:#555">熊本県阿蘇郡</span></div>'
      + '<div class="stamp">' + (needStamp ? '収入印紙' : '収入印紙<br>(不要)') + '</div></div>'
      + '</div>'
      + '<div class="cut"><span>✂ ここで切り取ってお渡しください / 여기서 잘라 손님께 드립니다</span></div>'
      + '<div class="note"><b>控え / 보관용</b> — ' + tag + ' ' + rcEsc(o.repName || '') + ' · 発行 ' + today + ' · ' + rcYen(amount) + ' · ' + forWhat + '<br>'
      + (needStamp
          ? '⚠ <b>現金で5万円以上</b>のお受け取りです — <b>収入印紙</b>を貼付し、消印してください。'
          : '※ 収入印紙は不要です(カード決済、または現金5万円未満)。')
      + '</div></div></body></html>';
    var w = global.open('', '_blank');
    if (!w) { rcToast(R.popup, true); return; }
    w.document.write(html); w.document.close();
  }

  //  페이지마다 토스트 구현이 다르다 → 있으면 쓰고 없으면 alert
  function rcToast(msg, isErr) {
    try { if (typeof global.toast === 'function') { global.toast(msg, isErr ? 'err' : 'warn'); return; } } catch (e) {}
    global.alert(msg);
  }

  //  발행 팝업(宛名·但し書き·금액) — 페이지 CSS에 기대지 않게 전부 inline 스타일
  global.__so_receipt = function (opts) {
    opts = opts || {};
    var R = RC_I18N[LANG] || RC_I18N.ja;
    var paid = Math.round(Number(opts.paid) || 0);
    var cash = Math.round(Number(opts.cash) || 0);
    var bg = document.createElement('div');
    bg.setAttribute('data-so-receipt', '1');
    bg.style.cssText = 'position:fixed;inset:0;background:rgba(40,39,34,.42);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px';
    var ip = 'width:100%;padding:8px 10px;border:1px solid #c9cec2;border-radius:6px;font-size:13px;font-family:inherit;background:#fff;color:#262f26';
    var hint = 'font-size:11.5px;color:#6b7166;font-weight:600;display:block;margin-bottom:4px';
    bg.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:430px;width:100%;max-height:86vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.25);padding:18px 20px">'
      + '<h3 style="margin:0 0 2px;font-size:15px;font-weight:800;color:#647548">' + rcEsc(R.title) + '</h3>'
      + '<div style="font-size:13px;font-weight:800;color:#647548;margin-bottom:10px">' + rcEsc(opts.tag || '') + ' ' + rcEsc(opts.repName || '') + '</div>'
      + '<label style="' + hint + '">' + rcEsc(R.to) + '</label>'
      + '<input id="so-rc-to" type="text" value="' + rcEsc(opts.repName || '') + '" placeholder="' + rcEsc(R.toPh) + '" style="' + ip + ';margin-bottom:9px">'
      + '<label style="' + hint + '">' + rcEsc(R.forLbl) + '</label>'
      + '<select id="so-rc-for" style="' + ip + ';margin-bottom:9px">'
      + RC_FORS.map(function (v) { return '<option value="' + rcEsc(v) + '">' + rcEsc(v) + '</option>'; }).join('')
      + '</select>'
      + '<label style="' + hint + '">' + rcEsc(R.amt) + ' <span style="font-weight:400">— ' + rcEsc(R.amtHint) + '</span></label>'
      + '<input id="so-rc-amt" type="number" min="0" step="1" value="' + paid + '" style="' + ip + ';margin-bottom:6px">'
      + (paid <= 0 ? '<div style="font-size:11.5px;color:#b13b2c;font-weight:700;margin-bottom:6px">' + rcEsc(R.noPaid) + '</div>' : '')
      + '<div style="font-size:11.5px;color:#6b7166;margin-bottom:12px">' + rcEsc(R.stamp) + '</div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end">'
      + '<button type="button" id="so-rc-x" style="font-family:inherit;font-size:12px;font-weight:700;border-radius:7px;padding:6px 13px;border:1px solid #c9cec2;background:#fff;color:#4a5147;cursor:pointer">' + rcEsc(R.close) + '</button>'
      + '<button type="button" id="so-rc-go" style="font-family:inherit;font-size:12px;font-weight:700;border-radius:7px;padding:6px 13px;border:1px solid #647548;background:#647548;color:#fff;cursor:pointer">' + rcEsc(R.make) + '</button>'
      + '</div></div>';
    document.body.appendChild(bg);
    var close = function () { bg.remove(); };
    bg.querySelector('#so-rc-x').addEventListener('click', close);
    bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
    bg.querySelector('#so-rc-go').addEventListener('click', function () {
      var to = (bg.querySelector('#so-rc-to').value || '').trim();
      var fr = bg.querySelector('#so-rc-for').value || '';
      var amt = Math.round(Number(bg.querySelector('#so-rc-amt').value || 0));
      if (amt <= 0) { rcToast(R.needAmt, false); return; }
      close();
      rcPrint({ tag: opts.tag, repName: opts.repName, no: opts.no, to: to, forWhat: fr, amount: amt, cash: cash }, R);
    });
  };

  // ── 일시 표기(공용) ──────────────────────────────────────────────────
  //  수정·변경 기록은 **초까지** 남긴다(Min 2026-08) — 같은 분 안에 여러 건이 들어가면
  //  분 단위로는 순서를 못 가리고, 나중에 "누가 먼저였나"를 되짚을 수 없다.
  //  DB 는 이미 timestamptz(마이크로초)로 저장하고 있으니 **화면에서 자르지 않는 것**이 핵심.
  //    __so_ts(ts)            → '2026-08-25 15:42:07'   (기본: 이력·감사·금전 기록)
  //    __so_ts(ts,'short')    → '08/25 15:42:07'        (좁은 칸)
  //    __so_ts(ts,'auto')     → 오늘이면 '15:42:07' · 다른 날이면 '08/25 15:42:07'
  global.__so_ts = function (ts, mode) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d)) return String(ts).replace('T', ' ').slice(0, 19);   // 파싱 실패해도 초까지는 남긴다
    var p = function (n) { return String(n).padStart(2, '0'); };
    var hms = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    var md  = p(d.getMonth() + 1) + '/' + p(d.getDate());
    if (mode === 'short') return md + ' ' + hms;
    if (mode === 'auto') {
      var n = new Date();
      var same = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
      return same ? hms : (md + ' ' + hms);
    }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + hms;
  };

  // ── 목록 검색(공용) ──────────────────────────────────────────────────
  //  긴 목록은 눈으로 찾게 두지 않는다(§3-1). 컨테이너 안의 '행'을 글자로 걸러낸다.
  //  화면이 다시 그려져도 자동으로 다시 걸러지도록 MutationObserver 를 건다.
  //    __so_rowSearch('#menu-q', '#menu-body', 'tr', {count:'#menu-qc', label:n=>n+'건'})
  global.__so_rowSearch = function (inputSel, containerSel, rowSel, opts) {
    opts = opts || {};
    var inp = document.querySelector(inputSel);
    var box = document.querySelector(containerSel);
    if (!inp || !box) return null;
    function apply() {
      var q = String(inp.value || '').trim().toLowerCase();
      var rows = box.querySelectorAll(rowSel), hit = 0;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (opts.skip && r.matches && r.matches(opts.skip)) continue;
        var on = !q || (r.textContent || '').toLowerCase().indexOf(q) >= 0;
        r.style.display = on ? '' : 'none';
        if (on) hit++;
      }
      if (opts.count) {
        var c = document.querySelector(opts.count);
        if (c) c.textContent = q ? (opts.label ? opts.label(hit) : String(hit)) : '';
      }
      if (typeof opts.onFilter === 'function') opts.onFilter(q, hit);
    }
    inp.addEventListener('input', apply);
    try { new MutationObserver(function(){ apply(); }).observe(box, {childList:true, subtree:true}); } catch (e) {}
    apply();
    return apply;
  };
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
  function soAuditFmt(ts){ return global.__so_ts(ts, 'short'); }   // 변경 기록이라 초까지
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
    det.innerHTML = '<summary data-i18n="so_auditH"></summary><div class="so-audit-body"></div>';
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
  // 제공자 표기 푸터 — **홈(랜딩)에만** 둔다.
  //   실무 화면(배정·정산·주문 등)은 아래까지 목록이 이어지는데 푸터가 내용을 가린다(Min 2026-08).
  function isLandingPage() {
    var p = String(location.pathname || '');
    return /\/ops\/?$/.test(p) || /\/ops\/index\.html$/.test(p) || /^\/?index\.html$/.test(p);
  }
  // ── 오프라인 배너 ────────────────────────────────────────────────────
  //  Supabase 온라인 전용이라 끊기면 주문·저장이 그냥 실패한다. 실패하고 나서 알면 늦으므로
  //  끊긴 순간 화면 맨 위에 빨간 띠로 알린다(전 ops 페이지 공통).
  function netBanner() {
    var el = document.getElementById('so-netoff');
    if (navigator.onLine) { if (el) el.parentNode.removeChild(el); return; }
    if (el) return;
    el = document.createElement('div');
    el.id = 'so-netoff';
    el.setAttribute('data-i18n', 'so_netOff');
    el.setAttribute('style', 'position:fixed;left:0;right:0;top:0;z-index:2000;background:#b0422c;color:#fff;' +
      'font-weight:800;font-size:13px;line-height:1.4;text-align:center;padding:7px 12px;box-shadow:0 2px 10px rgba(0,0,0,.25)');
    document.body.appendChild(el);
    applyLang();
  }
  function mountNet() {
    try {
      global.addEventListener('offline', netBanner);
      global.addEventListener('online', function () { netBanner(); try { if (typeof global.toast === 'function') global.toast(t('so_netOn'), 'ok'); } catch (e) {} });
      netBanner();
    } catch (e) {}
  }

  function mountFooter() {
    if (!isLandingPage()) return;
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
  // 인쇄 팝업은 별도 문서라 saizen-ops.css 를 못 읽는다 — 같은 보정을 팝업 <style> 에 넣는다.
  //  「WKム-Y」처럼 라틴+가나가 섞인 태그코드에서 가나만 커 보이는 현상 보정(§ saizen-ops.css 참조).
  window.__SO_JP_FONT = "@font-face{font-family:'SZJpMono';"
    + "src:local('Meiryo'),local('Yu Gothic'),local('YuGothic'),local('Hiragino Kaku Gothic ProN'),"
    + "local('Noto Sans JP'),local('MS PGothic'),local('sans-serif');"
    + "size-adjust:82%;unicode-range:U+3000-303F,U+3040-30FF,U+31F0-31FF,U+4E00-9FFF,U+FF00-FFEF;}";

  var SO_HELP = {
    'step1.html': '<h4>이 화면이 하는 일</h4>엠클릭 엑셀(<b>예약리스트·일행별예약·그룹코드 참조</b>)을 올리면 그룹코드·회원여부·항공정보를 계산해 저장합니다. <b>모든 화면의 출발점</b>입니다.<h4>계산·판정</h4><ul><li><b>월 단위 동기화</b>: 올린 그 달에서 파일에 없는 팀만 확인 거쳐 정리(<b>다른 달 무영향</b>). 있는 팀은 id 유지(배정 보존).</li><li><b>그룹코드 자동계산</b>: 회원=사전배정, 비회원=F풀(<code>FAあ</code>~). <b>같은 날 도착하는 팀끼리는 알파벳·가나가 둘 다 다르게</b> 배정합니다(<code>FXめ</code>와 <code>FYめ</code>처럼 한 글자만 다른 코드가 룸키 통·명단에 나란히 놓이면 헷갈리므로). 30일 안에 겹치는 팀과도 같은 코드를 쓰지 않고, 30일 넘게 지난 코드는 재사용합니다. ⚠ <b>이미 배정된 팀의 코드는 재임포트해도 바뀌지 않습니다</b>(인쇄물·안내가 이미 나갔을 수 있어 고정) — <b>2026-08-16 이후 출발</b> 팀부터는 이 규칙을 <b>자동으로 유지</b>합니다 — 등록할 때 같은 날 도착 팀끼리 글자가 겹치는 코드가 있으면 <b>그 팀만</b> 새 코드를 받습니다(먼저 예약한 팀이 코드를 지킴). 규칙을 지키는 코드는 그대로라 <b>한 번 교정되면 다시 등록해도 아무것도 바뀌지 않습니다</b>. <b>8/15 이전은 손대지 않습니다</b>(인쇄물이 이미 나감).</li><li><b>날짜 자동인식</b>: 엑셀 숫자·한국어·MM/DD/YYYY 모두 흡수.</li></ul><h4>주요 용어</h4>예약리스트=<b>팀 마스터</b>(상품·숙소·기간·금액) / 일행별예약=<b>개인 명세</b>(명단·항공·생년·등급). 결합키=<code>eventSeq</code>(행사번호).<h4>💰 단가·거래처 — 원가율이 보인다(사입 1단계)</h4>품목에 <b>단가</b>와 <b>거래처</b>를 두고 <b>입고할 때마다 그때 단가</b>를 기록합니다(비우면 수량만). 그러면 ① 목록에 <b>재고금액</b>(단가×현재고)과 상단 <b>재고 총액</b>, ② <b>이번 달 사입 금액</b>(거래처별·품목별 상위)이 바로 나옵니다. 단가가 바뀌면 최신값이 품목 기준 단가가 되어 다음 입고 기본값이 됩니다(단가 이력은 원장에 남아 협상·검증에 씁니다). <b>금액은 입고에만</b> 붙습니다 — 사용·실사조정은 수량만. 거래처는 <b>🏷 거래처</b> 패널에서 추가·중지(중지해도 과거 기록은 남습니다). ⚠ 다음 단계 = <b>발주(PO)·검품·청구서 대조</b>. 저장 = <code>inv_suppliers</code>·<code>inv_items.unit_cost/supplier_id</code>·<code>inv_txns.unit_cost/amount</code>·집계 뷰 <code>v_inv_spend</code>(SQL 109).<h4>파일은 여러 개를 한 번에 올려도 됩니다</h4>한 칸에 <b>여러 파일을 같이 골라</b> 넣으면 합쳐서 등록합니다(달이 섞여 있어도 팀마다 <b>출발월</b>로 나눠 처리하므로 다른 달을 건드리지 않습니다). <b>개수 제한은 없습니다</b> — 5개(2,000팀·8,000명)·10개(4,000팀·16,000명)까지 실제로 돌려 확인했습니다. 다만 여러 달을 한 번에 올리면 <b>비회원 F코드</b>가 그만큼 많이 필요하니, 「풀소진」 경고가 보이면 나눠 올리세요.<h4>같은 사람이 명단에 두 번 들어간 파일은 등록을 막습니다</h4>엠클릭 「일행별예약」에 <b>같은 팀·같은 이름·같은 생년</b>이 두 줄 있는 예약이 실제로 있습니다(2026-11 노승목 · 8인 예약 명단에 예약자가 2번). 이런 파일은 <b>그대로 등록하면 안 됩니다</b> — 인원이 실제와 달라져 방배정·식수·네임택이 어긋나고, 나중에 누가 잘못 넣었는지 찾기도 어렵습니다. 그래서 <b>DB에 한 글자도 쓰기 전에 멈추고</b> 무엇을 고쳐야 하는지 알려 줍니다:<div style="margin:6px 0;padding:8px 10px;background:var(--surface2);border-radius:8px;font-size:12px">⛔ 등록을 중지했습니다 — 엠클릭 수정이 필요합니다<br>· 261119-96093 노승목(예약 8명) — 「노승목」(생년 590507)이 2번 · 일행별예약 <b>No 1068, 1072</b></div>엠클릭에서 그 줄을 <b>실제 동행자 이름으로 바꾸거나</b>, 아직 미정이면 <b>이름을 비워</b>(무기명) 둔 뒤 다시 받아 올리시면 됩니다. <b>[내용 복사]</b>로 그대로 전달할 수 있습니다. 이름이 없는 줄(무기명)은 자리번호로 구분되므로 <b>여러 명이어도 정상</b>입니다.<h4>등록이 안 될 때</h4>버튼을 눌렀는데 아무 일도 없으면 버튼 옆에 <b>모자란 것</b>(서버 연결·예약리스트·일행별예약)이 빨갛게 표시됩니다. 요청 하나가 <b>끊기면 자동으로 3번까지 다시 시도</b>합니다(사내망에서 흔합니다). 등록이 <b>도중에 실패</b>하면 <b>빨간 창</b>이 떠서 <b>어디서 멈췄는지</b>(예: <code>passengers 500/8000</code>)와 원인을 보여 줍니다 — <b>[내용 복사]</b>를 눌러 관리자에게 그대로 보내면 원인을 바로 알 수 있습니다. 완료되면 초록 완료창이 뜹니다. <b>완료창이 안 떴다면 등록이 안 된 것</b>입니다.<h4>권한·데이터</h4>step1 영역. 저장: bookings·passengers·guests·guest_members.',
    'housekeeping.html': '<h4>이 화면이 하는 일</h4>객실 청소팀이 <b>그날 어느 방을 어떤 순서로</b> 치우는지 봅니다. 방배정은 프론트 사무실이 하고 이 화면은 <b>보기 전용</b>입니다(여기서는 아무것도 바뀌지 않습니다).<h4>상태 5종</h4><ul><li><b>턴오버(퇴실→입실)</b> — 오늘 나가고 오늘 또 들어옵니다. <b>가장 먼저</b> 치워야 체크인 시각을 지킵니다.</li><li><b>퇴실</b> — 오늘 나갑니다(오늘 밤 다음 손님 없음).</li><li><b>연박</b> — 계속 묵습니다. 정비만 합니다.</li><li><b>입실</b> — 비어 있던 방에 오늘 들어옵니다. 점검·세팅.</li><li><b>공실 / 폐쇄</b> — 비어 있음 / 기간 폐쇄된 방.</li></ul><h4>순서</h4>기본 정렬은 <b>턴오버 → 퇴실 → 연박 → 입실 → 공실</b>입니다. 연박은 <b>티오프가 이른 방부터</b> 놓습니다 — 팀이 라운딩을 나간 뒤라야 방에 들어갈 수 있기 때문입니다. 「호수순」으로 바꾸면 방 번호 순서로 봅니다.<h4>표 읽는 법</h4><ul><li>보기는 <b>카드</b>와 <b>표</b> 두 가지입니다(태블릿은 카드가 편합니다). 상단 <b>층·동 칩</b>은 그 층으로 <b>이동</b>하는 목차입니다.</li><li>숙소 칩은 방배정 화면과 같은 항목이라 <b>소보별장·아소별장·돔하우스</b> 배정도 그대로 보입니다. <b>간지호텔·시즈노야도는 외부 위탁이라 이 화면에서 제외</b>되며, 칩 줄 끝에 「청소 제외」로만 표시됩니다.</li><li><b>박째</b> = 오늘까지 묵은 밤 수 / 전체 박수. <b>시트 교체</b>는 3박째마다 뜹니다.</li><li><b>티오프</b> = 그날 그 팀의 가장 이른 라운딩 시각과 코스.</li><li><b>비고</b> = 시트 교체 · 입실 인원 · 마지막밤 · 폐쇄 사유 · 객실 메모.</li><li><b>인원</b> = 위 칸에 <b>체류 인원</b>(그날 밤 묵는 사람 수)이 나오고, 입·퇴실이 있는 날은 <b>입실 인원·퇴실 인원</b>이 함께 뜹니다. 층 머리줄과 날짜 줄에도 같은 기준의 인원이 붙습니다.</li></ul><h4>인쇄</h4>층마다 한 장으로 A4 세로 인쇄됩니다.<h4>청소 기준(Min 2026-08)</h4><b>체류 청소 = 3일차마다</b>(3·6·9…일차, 체크인이 1일차). <b>3박 이하는 청소 없음</b>. 요일이 아니라 <b>일차</b>로 세므로 7박(수 체크인)=금·월, 4박(일 체크인)=화 로 실제 운영과 같고, 예외 입국에도 어긋나지 않습니다. <b>타월은 매일 전 객실 교체</b>하고 사용한 타월은 <b>각 층 복도</b>에서 수거합니다.<h4>마감 시각 — 도착 시간에 맞춤</h4>그 방에 <b>오늘 들어올 팀</b>의 출발지로 마감이 갈립니다 — <b>인천(09:25 착) 방은 11:00까지</b>, <b>부산(13:25 착) 방은 15:00까지</b>. 카드에 마감·도착 시각이 함께 표시됩니다.<h4>층 이동(고정 목차)</h4>층 칩 줄이 <b>화면 위에 붙어 따라옵니다</b>. 스크롤을 내리면 <b>지금 보고 있는 층</b>이 저절로 켜지고, 칩을 누르면 그 층으로 이동합니다(「전체」는 맨 위로). 층 칩은 이제 <b>거르는 게 아니라 목차</b>라 모든 층이 한 화면에 이어져 있습니다.<h4>진행 상태</h4>청소 대상(퇴실·턴오버·청소일) 카드의 <b>[청소]</b>, 묵는 방의 <b>[타월]</b> 버튼을 누르면 완료로 기록됩니다(누가·언제). 위 <b>진행률</b>(청소 n/m · 타월 n/m)로 어디까지 됐는지 바로 보이고, 다시 누르면 취소됩니다. 누르면 <b>기다림 없이 바로</b> 표시가 바뀌고 저장은 뒤에서 됩니다(저장에 실패하면 원래대로 돌아가며 알려 줍니다). 진행률 카드는 <b>숫자가 다 끝나기 전엔 빨강, N/N(또는 대상 0건)이 되면 초록</b>으로 바뀌어 완료 여부가 한눈에 보이고, <b>화면을 내려도 층 칩 바로 아래 고정</b>되어 계속 보입니다(2026-08). ⚠ <b>타월 대상 수는 청소 대상 방을 뺀 값</b>입니다 — 청소하는 날은 타월이 청소에 이미 포함되므로, 그 방까지 세면 실제로 따로 갈 방보다 많게 나옵니다(발견·수정: 2026-08. 이전엔 층 일괄 버튼만 이 기준이 빠져 있어 「타월 갈 방이 없는데 N실이라고 뜬다」는 혼동이 있었습니다 — KPI·카드 버튼·층 일괄 버튼이 이제 전부 같은 기준을 씁니다). <h4>프론트 체크아웃 확정 연동</h4>프론트데스크(frontdesk.html)에서 담당자가 <b>[체크아웃]</b>을 눌러 키 반납을 확정한 팀은, 그 팀이 나가는 <b>퇴실·턴오버 방에 초록 <code>✓ 체크아웃 확인됨</code> 배지</b>가 붙고 <b>같은 상태(퇴실 vs 퇴실, 턴오버 vs 턴오버) 안에서 맨 앞으로</b> 정렬됩니다 — 예정일만 됐을 뿐 아직 손님이 안 나갔을 수 있는 방과, <b>실제로 비어서 바로 청소해도 되는 방</b>을 구분하기 위해서입니다. 배지가 없다고 청소가 금지되는 건 아니고(퇴실 예정일이면 여전히 청소 대상), 단지 <b>확정된 방부터 먼저 들어가라는 순서 신호</b>입니다.<h4>객실 쪽지 — 벌레·고장·특이사항</h4>객실 카드의 <b>[＋ 메모]</b> 로 그 호실에 <b>짧게(30자)</b> 남깁니다. 종류는 <b>🐛 벌레 · 🔧 설비 · 📌 기타</b> 셋뿐이고, 자주 쓰는 문구(욕실 벌레·물 안 나옴·에어컨 이상…)는 눌러서 넣습니다.<ul><li>쪽지는 <b>팀이 아니라 방</b>에 붙습니다 — 팀이 나가도 남습니다.</li><li>날짜가 아니라 <b>열림/닫힘</b>으로 관리합니다. 처리할 때까지 <b>매일 카드 맨 위에</b> 뜨므로 다음날 청소자도 봅니다.</li><li><b>[처리 완료]</b> 를 누르면 닫힙니다(누가·언제 기록). 지우지 않고 남겨 두어 <b>재발 추적</b>(같은 방에서 벌레가 반복되면 방역 신호)에 씁니다.</li><li>같은 쪽지가 <b>방배정 화면의 호실 옆</b>에도 아이콘으로 뜹니다 — 배정할 때 그 방 상태를 알 수 있습니다.</li><li>남기기는 청소(hk)·객실(room)·프론트(front) 권한, 읽기는 로그인한 전원.</li></ul><h4>층 단위로 한 번에</h4>층 머리줄 오른쪽의 <b>[✓ 이 층 청소 N실]</b> · <b>[✓ 이 층 타월 N실]</b> 을 누르면 그 층의 대상 객실이 <b>한 번의 클릭으로 모두 완료</b>됩니다. 이미 다 완료된 층에서는 같은 버튼이 <b>[↺ 취소]</b> 로 바뀝니다.<h4>권한·데이터</h4>hk 영역. room_inventory·rooms·guests·bookings·room_closures·golf_groups 읽기만 합니다.',
    'occupancy.html': '<h4>이 화면이 하는 일</h4>날짜별로 <b>객실이 얼마나 찼는지</b>를 한 표로 봅니다. 메리트투어 「호텔 블록」 표는 <b>잔여</b>를 보는 용도지만, 현장은 <b>채워진 수량</b>을 봐야 하므로 방향을 뒤집었습니다. <b>읽기 전용</b>(데이터 변경 없음).<h4>표 읽는 법</h4><ul><li>행 = <b>숙소 → 룸타입</b>, 열 = 날짜. 여러 달을 골라 <b>이어서</b> 볼 수 있습니다(달이 바뀌는 열에 세로선).</li><li>칸 <b>위 = 그날 밤 사용 객실 수</b>, <b>아래 = 보유 객실 수</b>. 색은 잔여 기준 — <b>초록</b>(4실+)·<b>노랑</b>(1~3실)·<b>남색 = 만실</b>(딱 찼다·정상)·<b>진한 빨강 = 초과</b>(보유보다 많이 받았다·<b>조치 필요</b>, 칸에 <b>!</b> 표시). 만실과 초과는 뜻이 달라 색을 나눠 두었습니다 — 만실은 그대로 두면 되고, 초과는 <b>방을 옮기거나 다른 숙소로 넘겨야</b> 합니다.</li><li><b>무엇을 「사용」으로 세는가</b> — 엠클릭 예약 구분값 중 <b>견적·확정·정산은 모두 실제로 들어온 예약</b>이라 전부 셉니다. <b>「대기」만 뺍니다</b> — 대기는 <b>만실이어도 받아 두는 예약</b>이라 객실을 잡고 있지 않기 때문입니다.</li><li><b>싱글 신청 줄</b> — 숙소마다 표 아래에 연노랑 <b>「싱글 신청」</b> 줄이 붙어, 그날 묵는 팀들의 <b>비고에 적힌 싱글 방 수</b>를 더해 보여줍니다. <b>배정 전에도 보입니다</b> — 「싱글」 행은 실제로 배정된 <b>결과</b>라, 11월처럼 아직 방을 안 짠 달은 0으로만 보였습니다. 숫자 뒤 <b>빨간 +N</b>은 비고에 「대기·불가·보류」가 적혀 <b>아직 확정이 아닌</b> 분량입니다. 칸에 커서를 올리면 어느 팀이 몇 방인지 나옵니다. <b>대기 예약은 여기서도 뺍니다</b>(방을 안 잡는 예약이라 다른 줄과 같은 기준). 싱글 신청이 없는 숙소엔 줄이 안 생깁니다.</li><li><b>대기 예약 줄</b> — 숙소마다 표 아래에 연보라 <b>「대기 예약」</b> 줄이 붙어 그날 대기가 <b>몇 팀(몇 명)</b>인지 보여줍니다(객실 수가 아닙니다 — 방을 안 잡으니까요). 칸에 커서를 올리면 대표자 이름이 나옵니다. <b>만실·초과 칸 아래 대기가 쌓여 있으면</b> 그날은 방을 늘리거나 다른 숙소로 돌릴 여지를 봐야 한다는 신호입니다. 대기가 없는 숙소엔 줄이 안 생깁니다.</li><li>체류 판정 = <code>check_in ≤ 날짜 &lt; check_out</code>(퇴실일 밤은 비어 있음). 같은 객실에 여러 명이 있어도 <b>1실</b>로 셉니다.</li><li>맨 아래 <b>합계</b> 행 = 보이는 숙소들의 그날 총 사용 실수.</li></ul><h4>룸타입 보기</h4>오른쪽 위 <b>룸타입별로 보기</b>를 켜면 숙소 안을 타입으로 쪼갭니다. 현장이 부르는 이름과 등급으로 묶어서 보여 줍니다 — <b>더블·디럭스더블트윈·디럭스트윈 → 「디럭스 트윈」</b> 하나로, <b>트리플(5층 2실) → 트윈</b>에 포함, <b>4인실 → 소보5동</b>·<b>8인실 → 아소별장</b>(그 건물 한 채라 이름이 분명합니다). 컴팩트트윈·싱글은 따로 둡니다. 차례는 <b>디럭스 트윈 → 트윈 → 컴팩트트윈 → 싱글 → 아소별장 → 소보5동</b>. ⚠ 이건 <b>화면 표기·집계만</b> 묶는 것이고 DB 의 룸타입 값은 그대로라, 방배정·정산에는 영향이 없습니다.<h4>미배정도 세어 넣습니다</h4><b>미배정은 방배정이 안 됐을 뿐 이미 받은 예약</b>입니다(Min 2026-08). 그래서 사용 수에 <b>미배정이 쓸 방까지 더해</b> 보여 줍니다 — 칸의 작은 빨간 <b>⁺숫자</b>가 그 몫이고, 필요 객실 수는 팀마다 <b>인원 ÷ 2 올림</b>(2인 1실 기준)으로 잡습니다. 이렇게 세면 <b>초과(빨강)가 제때 드러납니다</b> — 배정만 세면 그냥 여유 있어 보입니다. 숙소마다 맨 아래 <b>「미배정」 줄</b>에 그날 방이 없는 <b>팀(인원)</b>이 따로 나오고, 툴팁에 필요 실수가 붙습니다. 「예약 가능」도 <b>미배정을 뺀 잔여</b>로 판정하므로 없는 방을 있다고 말하지 않습니다. 룸타입별 보기에서는 미배정이 <b>어느 타입에 들어갈지 알 수 없어</b> 타입 칸에는 더하지 않고, 숙소 전체 잔여로만 「예약 가능」을 판정합니다.<h4>「예약 가능」 표시</h4>칸 아래 초록 글씨(<b>3박·4박·7박</b>)는 <b>그 날짜부터 표준 패턴대로 묵을 방이 끝까지 남아 있다</b>는 뜻입니다. 표준 패턴은 <b>목→일 3박 · 일→목 4박 · 수→수 7박</b>이고, <b>쿠주힐즈만 7박이 일→일</b>입니다. 예를 들어 수요일 칸에 「7박」이 있으면 그날 체크인해 다음 수요일까지 그 타입 방이 매일 하나 이상 비어 있다는 뜻이라, <b>새 예약을 받아도 됩니다</b>. 패턴 기간이 <b>보고 있는 범위를 넘어가면 표시하지 않습니다</b>(확인할 수 없으므로) — 달을 넓게 잡으면 더 많이 보입니다.<h4>칸을 누르면</h4>그날 그 룸타입에 들어 있는 <b>팀 목록</b>(방번호·그룹코드·대표·인원·체류기간)이 아래에 나옵니다. 그 위에 <b>「🛏 이 날짜 방배정 열기」</b> 버튼이 있어 <b>방배정 화면을 그 달·그 날짜로 바로</b> 엽니다(새 탭). 미배정이 있는 날이면 버튼 옆에 <b>미배정 팀·인원</b>이 빨갛게 붙습니다 — 표에서 초과·미배정을 발견하면 그 자리에서 배정으로 넘어가면 됩니다. ⚠ 배정 자체는 <b>방배정 화면에서만</b> 합니다 — 정원·폐쇄 기간·D-7 확정·분할 같은 규칙을 두 곳에 두면 어긋나기 때문입니다.<h4>권한·데이터</h4>room 영역. room_inventory·rooms·guests·bookings 읽기.',
    'roomstats.html': '<h4>이 화면이 하는 일</h4>야마나미 <b>호텔동</b> 방배정을 읽어 <b>회원이 어느 객실등급에 배정됐는지</b>를 집계합니다. <b>읽기 전용</b>(데이터 변경 없음).<h4>집계 대상</h4>야마나미 호텔동(3~12층) 배정만. 별장·돔하우스·쿠주·간지·시즈는 제외. 등급은 방배정 자동배정과 <b>같은 규칙</b>(3층을 한 단계 낮춘 실질 등급 — 3층 디럭스=트윈·3층 트윈=컴팩트)으로 셉니다. 회원 판정은 고객등급·회원권구분·회원구분 3컬럼 OR.<h4>세 가지 표</h4><ul><li><b>① 예약월 × 배정등급</b>: 엠클릭 <b>예약일</b>(reserved_at) 기준 월별로 회원이 실제 들어간 등급(연인원). 작년 9~12월 행은 노랗게 강조됩니다. 예약일이 없는 예약은 「불명」 행.</li><li><b>② 연간 디럭스 0회 회원</b>: 그 해 한 번이라도 묵은 회원 중 디럭스를 한 번도 못 받은 사람. <b>여기가 0이 되는 게 목표</b>입니다. 사람 식별=이름+생년6자리.</li><li><b>③ 박수별 디럭스 경합</b>: 층 규칙상 박수별 디럭스 정원(3·4박 8실 / 7박 16실 / 그 외 10실)과 <b>피크일 회원 수</b>를 비교해 부족분을 표시.</li></ul><h4>권한·데이터</h4>room 영역. bookings·guests·guest_members·passengers·rooms·room_inventory 읽기.',
    'room.html': '<h4>자동배정은 자동으로 돕니다</h4>월을 열면 <b>미배정이 남아 있을 때 자동배정이 스스로 실행</b>됩니다(버튼 없음). 수기로 놓은 방은 <b>📌 고정</b>이라 자동배정이 다시 돌아도 그대로입니다. 특정 팀을 특정 방에 묶고 싶으면 <b>수기로 배정</b>하면 됩니다. 표 보기의 <b>「📌 수기만」</b> 체크로 고정된 방만 모아 볼 수 있습니다. 정원 초과·이중 배정은 <b>DB가 애초에 막습니다</b>(겹치는 날짜의 점유 합을 잠그고 검사) — 따로 점검할 필요가 없습니다.<h4>📌 고정과 ❄ D-7 확정</h4><b>수기로 놓은 방·맞바꾸기한 방은 📌 고정</b>되어 자동배정이 건드리지 않습니다. ⚠ <b>맞바꾸기는 밀려난 상대 팀까지 고정</b>시킵니다 — 그 팀은 원래 자동으로 둬도 될 팀인데 이후 자동배정에서 영영 안 움직입니다. 그럴 때 방 인원 팝업의 <b>[📌 고정 해제]</b>로 풀면 <b>다음 자동배정 대상으로 되돌아갑니다</b>(지금 배정이 바로 풀리지는 않습니다). 사람을 고르면 그 사람만, 안 고르면 그 방의 고정 전부를 풉니다.<br><b>❄ D-7 확정</b> — <b>입국이 7일 앞으로 다가온 팀</b>은 확정으로 봅니다. 그 무렵엔 네임택·키택·現地手配書 같은 현장 준비가 끝나 있어 방이 바뀌면 인쇄물부터 다시 만들어야 하기 때문입니다. 그래서 <b>자동배정이 그 팀 방을 건드리지 않고</b>(자동 배정이었더라도 그대로 둡니다), <b>사람이 옮기거나 해제·맞바꾸기·분할할 때는 한 번 더 확인</b>을 받습니다. 이미 도착한 팀도 확정입니다. 칩과 인원 목록에 <b>❄</b> 표시가 붙습니다.<h4>이 화면이 하는 일</h4><b>개인 단위</b> 객실 배정. 자동배정·분할체류·타임라인·기간폐쇄.<h4>🔁 맞바꾸기(두 방이 다 차 있어도)</h4>정원이 찬 방을 누르면 뜨는 <b>방 인원</b> 팝업에서 <b>🔁 맞바꾸기</b>. 사람을 체크하면 <b>그 사람만</b>, 체크 없이 누르면 <b>방 전원</b>이 대상입니다. 상대 목록은 <b>같은 팀이 쓰는 객실을 맨 위</b>에 보여주고(「같은 팀」 배지), 그 아래에 같은 기간 다른 객실을 줍니다(방번호·이름 검색). 상대 방에서도 사람을 골라 <b>1명 ↔ 1명</b>으로 바꿀 수 있습니다. <b>같은 숙소·같은 체류기간</b>끼리만 됩니다(기간이 다르면 맞바꾸기 대신 ✂ 분할·[옮기기]를 쓰세요). 교환은 서버에서 <b>한 번에</b> 처리되므로 중간에 정원을 넘어 막히는 일이 없고, 바뀐 방은 <b>수기(📌 고정)</b>가 되어 자동배정이 건드리지 않습니다.<h4>방 고르기에서 비고를 먼저 봅니다</h4>미배정 팀 배정(마법사) <b>② 방 고르기</b> 맨 위에 그 팀의 <b>현지비고·비고</b>가 그대로 나옵니다 — <b>싱글·별관·온천·트윈·층</b> 같은 낱말은 빨갛게 칠해집니다. 이걸 보고 <b>누구를 체크할지</b> 정한 뒤 방을 고르면 됩니다(싱글 요청이면 한 명만 체크). 싱글 판정 배지도 함께 나옵니다.<h4>싱글 몇 방인지 · 몇 방 채웠는지</h4>비고에 <b>「싱글 4방」</b>처럼 방 수가 적혀 있으면 <b>「싱글 4방 필요 · 지금 2방」</b>으로 표시합니다 — 다 채우면 초록으로 바뀝니다(이름으로 적혀 있으면 그 인원 수가 곧 방 수). 비고에 <b>대기·불가·보류</b>가 섞여 아직 확정이 아닌 요청도 <b>수량은 그대로 보여줍니다</b> — <b>「싱글 4방 요청(대기) · 지금 0방」</b>처럼 빨갛게, 그 낱말과 함께. 몇 방짜리 요청인지는 알아야 준비가 되기 때문입니다. <b>「싱글룸 현지에서 배정예정」</b>처럼 <b>누가 쓸지만</b> 현장에서 정하는 건은 <b>「현장 배정」</b> 배지가 붙고, 미배정 사유 목록에서 <b>「현장 배정 대기」</b>로 따로 모입니다 — 방 수는 이미 정해져 있으니 <b>당일 아침에 이 분류만 열어 0으로 맞추면</b> 됩니다. 배정은 <b>[1인 1실로 나누기]</b>로 한 번에 됩니다.<h4>이미 배정한 사람 빼기 · 비고에 적힌 사람 찾기</h4>방 고르기 화면의 <b>「이 팀이 이미 배정된 방」</b> 줄에서 이름 옆 <b>✕</b>를 누르면 <b>그 자리에서 배정을 해제</b>합니다 — 화면을 닫고 찾아갈 필요가 없습니다(해제하면 그 사람이 위 인원 목록으로 돌아옵니다).<br>비고에 <b>「팀: 이완순 차화엽」</b>처럼 <b>다른 예약의 사람 이름</b>이 적혀 있으면 <b>「비고 속 팀」</b> 줄에 <b>그 팀이 통째로</b> 나옵니다 — 그룹코드·대표자·<b>행사번호</b>·숙소·체류기간·인원, 그리고 <b>그 팀 명단 전원</b>이 지금 어느 방인지(또는 미배정인지)까지. 방번호 옆 <b>✕</b>로 그 자리에서 배정 해제도 되고, 팀 오른쪽 <b>[수배서]</b>로 <b>現地手配書를 팝업</b>으로 바로 열 수 있습니다(행사번호로 찾아 들어갈 필요 없음). <b>대표자 이름이 같은 팀</b>이 함께 잡히면 양쪽에 <b>⚠</b>가 붙습니다 — 행사번호·숙소·체류기간으로 구분해서 고르세요(같은 이름을 가진 팀을 모두 내놓습니다. 예전엔 먼저 걸린 한 팀만 나와 엉뚱한 팀에 붙일 수 있었습니다). 옆방·같은 층으로 붙일 때 쓰세요. 이름은 <b>불러온 명단에 있는 이름이 비고 안에 나오는지</b>로 찾으므로, 그 달에 없는 팀 사람은 안 잡힙니다. <b>*OOO님예약건</b>처럼 <code>*</code>로 시작하는 짧은 메모(담당 영업사원 이름 등)는 매칭에서 제외됩니다(2026-08 — 실제로 여러 예약에 같은 문구가 반복돼 우연히 이름이 겹치는 손님을 잘못 끌고 오는 사고가 있었습니다).<br><b>비고 속 팀의 <b>미배정 인원 전원</b>이 <b>「같이 고를 수 있음」</b>에 <b>팀별로 묶여</b> 나옵니다 — 비고에 이름이 안 적힌 동행자도 포함됩니다(같이 넣어야 할 사람을 못 고르면 소용이 없으니까요). 팀 머리줄에 그룹코드·대표자·<b>행사번호</b>·숙소·체류기간이 붙고, 비고에 실제로 적힌 이름은 색으로 구분합니다. <b>대표자 이름이 같은 팀이 둘 걸리면</b> 둘 중 한 팀만 진짜이므로, 한쪽에서 한 명이라도 고르면 <b>같은 이름의 다른 팀은 잠깁니다</b>(⚠ 표시). 선택을 모두 풀면 다시 열립니다</b>(2026-08) — 「팀 A,B / 트윈: A팀원+B팀원 / 싱글: …」처럼 <b>서로 다른 예약을 같은 방에 나눠 넣어야 하는 경우</b>, 이 팀 명단 체크박스 아래 점선 테두리로 다른 팀 사람이 나와 <b>같이 체크해 한 번에 배정</b>할 수 있습니다(각자 자기 예약으로 저장되니 데이터는 안 섞입니다).<h4>방 카드의 「1/2」와 「다른 팀」</h4>방 카드 숫자는 <b>사용 인원 / 정원</b>입니다 — <code>1/2</code>는 <b>이미 1명이 있고 1자리가 남았다</b>는 뜻입니다. 트윈에 1명만 있는 이유는 <b>3명 팀의 홀수 잔여 · 싱글 지정으로 1인 사용 · 동행의 조기 퇴실 · 분할 체류 · 수기 배정</b> 중 하나입니다.<br>⚠ 그 1명이 <b>다른 팀</b>일 수 있습니다. 그런 방에는 빨강 <b>「다른 팀 ○○○(코드)」</b> 배지가 붙고, 그래도 누르면 <b>「⚠ 다른 팀이 들어가 있습니다 — 이대로 넣으면 합방이 됩니다. 계속할까요?」</b>로 되묻습니다. 같은 팀 방이면 배지 대신 <b>「같은 팀」</b>으로 표시되니 안심하고 붙이면 됩니다.<h4>싱글 요청 = 자동판단 없이 항상 수기(2026-08 수정)</h4>비고에 「싱글」·「단독」 등이 적혀 있으면 자동배정은 <b>무조건 그 팀을 미배정으로 남깁니다</b>. 예전엔 「전원 싱글」처럼 확실해 보이는 것만 골라 자동으로 1인 1실을 넣었지만, 텍스트만 보고 트윈을 잠식한 사고(백준호·정란희 등)가 있어 <b>믿지 않기로</b> 했습니다 — 지금은 회원 등급·추가요금이 걸린 판단이라 항상 사람이 확인합니다. 「⚠ 미배정 N건 사유」 카드나 방 고르기 화면의 <b>비고 원문·「비고 속 팀」</b>을 보고 몇 명이 싱글인지 정한 뒤 [🛏 1인 1실로 나누기]나 방을 직접 눌러 배정하세요.<h4>싱글 요청 팀 — 한 번에 1인 1실</h4>「싱글룸 6개」처럼 여러 명을 각각 다른 방에 넣어야 할 때, 사람을 <b>전부 체크한 뒤</b> <b>[🛏 1인 1실로 나누기]</b>를 누르면 <b>고른 인원 수만큼 빈 방에 한 명씩</b> 들어갑니다.<br>방 고르는 순서 = <b>① 싱글 방을 먼저 다 씁니다</b>(트윈에 1명을 넣으면 침대 하나가 그대로 죽습니다) <b>② 그 안에서 전원이 들어가는 한 층</b>이 있으면 그 층으로 모읍니다 <b>③ 층 순서는 그 팀이 쓰는 층 → 박수 규칙 층 → 높은 층</b>. 이 버튼은 <b>빈 싱글 방만</b> 씁니다. 싱글이 모자라면 <b>있는 만큼만 넣고 나머지는 그대로 남깁니다</b> — <b>트윈에 1인을 넣는 일은 여기서 하지 않습니다.</b> 그건 침대 하나를 버리는 판단이라 사람이 방을 보고 정해야 합니다. 남은 인원은 <b>방을 직접 눌러</b> 배정하세요(그때도 같은 층이 맨 위에 올라옵니다). 확인창에 <b>「이름 → 방번호(타입·층)」</b>과 고른 순서·모은 층을 미리 보여줍니다.<br>배정한 뒤 <b>남은 인원</b>(트윈 등)을 넣을 때는 방 목록의 층 순서가 <b>① 그 팀이 쓰는 층(「← 이 팀이 쓰는 층」) → ② 박수 권장 층(「권장」) → ③ 나머지</b>가 됩니다. 다른 층 방을 누르면 <b>「⚠ 다른 층입니다 — 이 팀은 N층을 쓰고 있습니다. 그래도 진행할까요?」</b>로 한 번 되묻습니다(막지는 않습니다 — 그 층이 꽉 차 어쩔 수 없는 경우가 있습니다). 빈 방이 모자라면 넣을 수 있는 만큼만 넣고 <b>몇 명 남았는지 알려줍니다</b>(조용히 한 방에 뭉치지 않습니다).<h4>팀 묶음 코드(🔗)</h4>이 화면은 <b>엠클릭 원본 코드를 그대로</b> 보여줍니다 — 배정은 예약 단위로 하고 이상하면 엠클릭에서 확인하기 때문입니다. 대신 現地手配書에서 묶은 팀에는 원래 코드 옆에 <b>🔗DFな-Y2</b> 배지가 붙습니다(인쇄물·네임택에 찍히는 코드). <b>대표팀은 자기 코드가 곧 기준코드</b>라 번호만 <b>🔗Y1</b>로 붙습니다(마우스를 올리면 전체 코드). <b>검색은 그 통일 코드로도 걸립니다</b> — 손님이 네임택 <code>DFな-Y6</code>을 들고 오면 그대로 넣어 그 사람 방을 찾을 수 있습니다. 개인 태그(<code>-1Y</code>)·자동배정·변경 이력은 <b>원래 코드 그대로</b>입니다.<h4>같은 팀 방 보기</h4>방배정은 사람 단위라 한 팀이 여러 방으로 흩어집니다. 방 인원 팝업 아래 <b>「같은 팀 방」</b> 줄에 그 팀이 쓰는 방이 모두 나오고(현재 방은 진한 칸), <b>누르면 그 방으로 이동·강조</b>합니다. 現地手配書에서 <b>묶은 팀</b>의 방은 <b>🔗</b>를 붙여 함께 보여줍니다 — 실제로는 한 팀이기 때문입니다. 방이 하나뿐인 팀은 줄이 나오지 않습니다.<h4>성별 표시</h4>이름 옆 <b>♂·♀</b>는 엠클릭 명단의 성별입니다(미배정 목록·배정 칩·방 인원 팝업 공통). 값이 없으면 표시하지 않습니다.<h4>계산·판정(자동배정)</h4><ul><li><b>대상 = 불러온 기간 전체</b>(월 단위가 아닙니다). 위 날짜 범위를 8/25~10/31처럼 잡으면 그 기간을 한 번에 배정합니다. 버튼에도 <b>「🪄 자동배정 (8/25~10/31)」</b>처럼 대상 기간이 함께 표시됩니다.</li><li><b>예약순 선착</b>: 빠른 예약 팀부터.</li><li><b>회원끼리 먼저 짝</b>(2026-08 규칙) — 회원 짝은 <b>디럭스</b>로, <b>일반 동행자는 디럭스에 들어가지 않습니다</b>. 회원이 홀수로 1명 남을 때만 그 1명이 <b>일반 1명과 디럭스를 같이</b> 씁니다(회원3+일반1 → 디럭스 2실 / 회원2+일반2 → 디럭스 1실+트윈 1실). 동행 일반도 없이 회원 1명만 남으면 보류(수기). 일반 짝은 예약종류(트윈→컴팩트).</li><li><b>3층은 실질 등급을 한 단계 낮춰</b> 계산합니다(현장 기준) — <b>3층 디럭스=트윈 취급 · 3층 트윈=컴팩트(소형) 취급</b>. 3층엔 컴팩트가 애초에 없습니다(트윈4·싱글4·디럭스4). 화면 표시와 DB 저장값(room_type)은 <b>그대로</b>이고 배정 계산에만 적용되며, 3층 층 라벨에 「실질 등급 한 단계 아래」로 표기됩니다. ⚠ 이 때문에 <b>3·4박 팀(허용 층 9·6·3)이 쓸 수 있는 디럭스는 8실(16명)</b>뿐입니다 — 회원이 트윈으로 내려가는 지점이 여기입니다. 각 풀 <b>고층부터</b>, 디럭스 부족 시 예약순으로 차지·나머지는 예약종류로 강등.</li><li><b>같은 팀 같은 층</b>: 2방 이상이면 팀 전체가 들어갈 한 층으로 묶어 배정(층 모자라면 분산).</li><li><b>재배정=전체 재배치</b>: auto만 지우고 처음부터. 수기·분할(✂)은 보호.</li><li><b>미배정 사유 확인</b>: 자동배정 후 못 넣은 팀이 있으면 <b>「⚠ 미배정 N건 사유」</b> 버튼이 뜹니다(팝업은 자동으로 뜨지 않습니다). 누르면 <b>팀 카드</b>로 나오고 — 그룹코드·기간·대표·남은 인원과 <b>사유 뱃지</b>(3명 팀 · 싱글 지정 · 대기예약 · 명단 없음 · 객실 부족 · 홀수 잔여) — <b>카드를 누르면 바로 그 팀 배정 화면</b>이 열립니다. 카드에는 그 팀의 <b>현지비고·비고</b>가 함께 나오고, 방배정에 걸리는 낱말(<b>싱글·별관·온천·트윈·층</b> 등)은 <b>빨갛게</b> 칠해집니다 — 왜 손으로 넣어야 하는지가 대부분 거기에 적혀 있습니다. 위 <b>사유 칩</b>과 <b>검색</b>으로 추릴 수 있고, <b>검색은 비고 내용까지</b> 찾습니다(예: 「3층」). 배정 화면의 미배정 팀 카드에도 같은 내용이 <b>한 줄</b>로 붙습니다(길면 …, 전체는 마우스를 올리면 뜹니다).</li><li><b>싱글룸·트리플 요청은 자동으로 배정하지 않습니다</b>(2026-08 결정): 비고·현지비고에 「싱글」·「단독」 언급이 있으면(대기·불가·만실·취소처럼 확정이 아닌 언급은 제외) <b>그 팀은 무조건 미배정으로 남기고 사람이 넣습니다</b>. 예전엔 「전원 싱글」 등 확실해 보이는 것만 골라 자동으로 1인 1실을 넣었지만, 텍스트 판단이 틀리기 쉽고 추가요금·회원 등급까지 걸린 문제라 실제 오배정(백준호·정란희 등 트윈 잠식)까지 나온 뒤로 신뢰하지 않기로 했습니다. 「⚠ 미배정 N건 사유」 카드와 방 고르기 화면의 비고 원문·「비고 속 팀」을 보고 배정하세요. 3명(트리플) 팀도 마찬가지로 처음부터 수기입니다.</li><li><b>정원</b>: 하룻밤 겹침 체크(다른 달 포함). 폐쇄 기간 방 제외.</li></ul><h4>주요 용어</h4><b>태그코드</b>=3자리 그룹코드(<code>F</code>접두=비회원). <b>회원 판정</b>=고객등급·회원권구분·회원구분 <b>셋 중 하나라도 회원이면 회원</b>. <b>분할(✂)</b>=기준일부터 다른 방.<h4>숙소·타입별로 모아 보기</h4>숙소 토글 아래에 <b>방 타입 칩</b>이 있습니다(그 숙소에 실제 있는 타입만, 옆에 실수). <b>디럭스만</b>·<b>싱글만</b>처럼 눌러 두면 카드·표·타임라인이 <b>그 타입 방만</b> 모아 보여 줍니다 — 「그날 이 방들엔 누가 들어와 있나」를 한눈에 볼 때 씁니다. 여러 타입을 같이 켤 수 있고 「전체 타입」으로 해제합니다. 타입이 하나뿐인 숙소(간지호텔 등)에서는 칩이 나오지 않고, <b>숙소를 바꾸면 타입 선택은 초기화</b>됩니다. <b>보기 전용</b>이라 자동배정·정원 판정·배정 피커에는 영향이 없습니다.<h4>날짜 칩</h4>날짜마다 <b>入N</b>(그날 체크인 팀)·<b>出N</b>(그날 체크아웃 팀)·<b>미N</b>(그날 도착인데 아직 미배정)이 붙습니다. 도착이 있는 날 미배정이 0이면 <b>✓</b>. 出은 그날 비워지는 방을 같은 날 체크인에 쓸 수 있다는 신호입니다. 시즈노야도 예약표와 같은 표기이고, 숙소 토글로 좁히면 그 숙소만 셉니다.<h4>배정 검색</h4>상단 고정 바의 <b>🔎 배정 검색</b>에 태그코드·한글명·영문명·행사번호를 입력하면 그 사람이 <b>어느 방·어느 날짜</b>에 배정됐는지 목록으로 뜨고, 클릭하면 그 날짜 카드로 점프해 방을 강조합니다.<h4>이력 2종 = 상단 버튼(팝업)</h4>화면을 넓히려고 상단 접이식 패널을 <b>컨트롤바 아이콘 버튼</b>으로 옮겼습니다 — <b>🚫 취소 이력</b>(step1 이 자동 취소한 팀·개인)과 <b>🕘 방배정 변경 이력</b>. 누르면 팝업으로 열리고, ✕·바깥 클릭·ESC 로 닫습니다.<h4>변경 이력</h4><b>🕘</b> 버튼에서 누가·언제 배정/해제/분할/자동배정했는지 조회(검색·더보기). <b>자동배정 재배치는 사람별 「↪️ 이동」(A호→B호)으로도 기록</b>되어 누가 어디서 어디로 갔는지 추적됩니다.<h4>조기 퇴실(🛫)</h4>1~2명만 예정보다 일찍 귀국할 때 멤버 칩의 <b>🛫</b>를 눌러 실제 퇴실일을 입력합니다. <b>그 사람만</b> 처리되고(팀 전체 아님), 침대가 그날부터 비워집니다(남은 방·분할도 자동 단축). 같은 🛫를 다시 누르면 해제. 처리하면 <b>「확인 필요」(정산/환불) 항목이 자동 생성</b>돼 프론트데스크에서 놓치지 않게 알립니다. 남은 인원 방 변경은 ✂ 이동으로. <b>B2B 정산은 불변</b>(환불은 현장 御請求書). 夕食 식수도 자동 차감됩니다.<h4>싱글차지 → 정산</h4>간지·시즈노야도 1인 사용 추가요금(¥4,400/박 등)을 <b>「현장청구」로 기록하면 그 팀 御請求書에 자동 청구</b>됩니다(메리트 선불 표시 시 청구 없음). 배정 해제하면 청구도 자동 제거(DB 트리거).<h4>미배정(보류) 사유와 조치</h4>자동배정 후 남는 팀은 <b>「⚠ 미배정 N건 사유」</b> 버튼에 사유별로 모입니다. 사유마다 <b>추천 조치를 체크</b>하고 <b>[이 방법으로 재배정]</b>을 누르면 그 완화만 켜서 자동배정을 다시 돌립니다(<b>수기 배정은 그대로 보호</b>). 조치는 셋입니다 — <b>3명 팀을 2+1로 분리</b>, <b>싱글·홀수 잔여 1명을 단독 방에</b>, <b>박수→층 규칙 무시</b>(청소 효율 하락). <b>객실 부족</b>은 빈 방 자체가 없는 것이라 자동으로 못 고칩니다 — 날짜·숙소를 바꾸거나 수기로 넣어야 합니다.<h4>권한·데이터</h4>room 영역. rooms·room_inventory·room_closures·guest_members(actual_dep)·followups·change_log·transactions(싱글차지→charges 자동).',
    'keyslip.html': '<h4>이 화면이 하는 일</h4>룸키 통(키박스)에 꽂는 <b>라벨(포스트잇)</b>을 인쇄합니다. 손으로 쓰던 것을 방배정에서 그대로 뽑습니다.<h4>라벨에 나오는 것</h4>그룹코드 · 그 방 투숙자 이름 · <b>방번호</b> · 숙박기간(<code>8/5(水)~8/11(火)</code>) · 박수.<h4>흐름</h4><ul><li>월(◀▶)을 고르면 그 달 <b>체크인</b>하는 방배정을 방 1개당 1장으로 준비합니다.</li><li>맨 아랫줄은 <b>PUS / 3泊</b> 처럼 출발지와 박수를 구분선으로 나눠 적습니다(네모칸 없음). <b>박수별 글씨 색</b>으로 구분합니다 — 3박 <b>빨강</b> · 4박 <b>파랑</b> · 7박 <b>초록</b> · <b>특이 패턴</b>(2박·5박·8박 등 그 외 전부) <b>보라</b>. 잉크 절약을 위해 색은 <b>맨 윗줄 그룹코드와 박수 뱃지에만</b> 넣고, 잉크를 가장 많이 먹는 큰 방번호와 이름·날짜는 검정입니다(키박스에 꽂으면 위·아래 두 지점에 색이 보여 멀리서도 구분됩니다).</li><li><b>박수·출발지 칩</b>으로 거를 수 있습니다. 출발지는 <b>ICN / PUS(부산·김해)</b>이며, 라벨에도 표기됩니다. 인별 출발지가 섞인 방은 ICN·PUS 양쪽에 다 나옵니다(빠지지 않게).</li><li><b>날짜는 체크인일~퇴실일 고정</b>입니다 — 일~목 4박이면 <code>8/9(日)~8/13(木)</code>. 현장에서 손으로 쓰던 방식 그대로라 선택지를 두지 않았습니다.</li><li><b>라벨 크기는 52×37mm 고정</b>입니다(A4 한 장에 4열×8행 = <b>32면</b>). 210÷4·297÷8 로 <b>A4를 여백 없이 정확히 나누므로</b> 잘라 쓸 때 버리는 종이가 없고, 가로가 길어 <b>방번호·방이름이 항상 한 줄</b>에 들어갑니다(「소보별장 3호」·「志津の宿 合歓」처럼 길면 글자만 자동으로 줄여 한 줄 유지). 종이 낭비 0 + 한 장당 최다 + 가독을 동시에 만족해 <b>고를 이유가 없어 선택지를 두지 않았습니다</b>. <b>시작칸</b>으로 쓰던 용지를 이어 쓸 수 있습니다.</li><li><b>숙소 칩이 맨 앞</b>에 있고 <b>야마나미·쿠주가 기본으로 켜져</b> 있습니다(그 달에 있는 것만). 간지·시즈는 필요할 때 눌러서 켜세요. 「전체」를 누르면 전 숙소가 나옵니다. 숙소는 <b>예약상 숙소가 아니라 실제 배정된 객실의 시설</b> 기준입니다 — 콤보 상품(별장+간지+시즈 등)으로 예약한 팀이 시즈에 묵으면 시즈 칩에서만 나옵니다.</li><li><b>手配書에서 묶은 팀</b>은 <b>대표팀 태그코드+팀번호</b>로 통일해 인쇄합니다(<code>FMカ-Y1</code>·<code>FMカ-Y2</code>) — 現地手配書·航空カバー·ネームタグ와 같은 코드라 현장에서 서로 대조됩니다. 묶지 않은 팀은 원래 그룹코드 그대로입니다.</li><li>정렬은 <b>박수 → 출발지 → 체크인일 → 방번호</b>. 분할 체류는 구간마다 1장.</li></ul><h4>이름은 3인 이상이면 대표 1인만</h4>한 방에 <b>3명 이상</b>이면 <b>대표 1인 이름만</b> 찍습니다(명단 순서의 첫 사람). 이름을 다 넣으면 글씨가 작아져 되레 안 보이기 때문이고, 몇 명인지는 방번호 옆 <b>N名</b>으로 이미 보입니다. 2명 이하는 모두 찍습니다.<h4>한 방 = 한 장 · 코드도 하나</h4>라벨은 <b>방마다 한 장</b>입니다. 한 방에 <b>다른 팀 사람이 함께</b> 묵어도(비고를 보고 같이 배정한 일행 등) 키홀더는 하나이므로 라벨도 한 장이고, <b>태그코드도 하나만</b> 찍습니다. 같은 묶음이면 <b>팀번호를 뗀 공통 코드</b>(<code>HXネ-Y1</code>·<code>HXネ-Y2</code> → <b><code>HXネ-Y</code></b>) — 방이 하나인데 1·2로 나눌 이유가 없기 때문입니다. 한 팀만 쓰는 방은 <b>번호를 그대로</b> 두어 네임택·手配書와 코드가 일치합니다.<h4>인쇄 여백</h4>라벨 격자는 A4 를 여백 없이 정확히 나누지만, <b>프린터는 종이 가장자리에 인쇄하지 못합니다</b>(보통 3~5mm). 그대로 두면 맨 윗줄 이름이 잘리고 좌우가 넘칩니다. 그래서 <b>비율은 그대로 두고</b> 전체를 아주 조금 줄여 사방 4mm 안쪽에 넣습니다 — 칸끼리의 비율과 절취선 간격은 변하지 않습니다.<h4>절취선</h4>라벨 칸마다 <b>자르는 점선</b>이 함께 인쇄됩니다(미리보기와 같은 선). 일반 용지에 뽑아 선대로 자르면 되고, 라벨지에 뽑아도 칸 경계와 겹쳐 방해되지 않습니다.<h4>주의</h4>방배정이 없는 팀은 라벨이 나오지 않습니다(상단에 미배정 팀을 경고로 표시 — 방배정에서 먼저 배정하세요). ⚠ 인쇄 배율은 <b>100%</b>로 — 「페이지에 맞춤」이면 칸 크기가 어긋납니다.<h4>권한·데이터</h4>print(인쇄) 영역. rooms·guests·guest_members 읽기(변경 없음).',
    'nametag.html': '<h4>이 화면이 하는 일</h4>개인별 <b>네임택 라벨</b>(Askul 24면)을 인쇄합니다. step1에서 계산된 값을 읽어 출력(재계산 없음).<h4>주요 용어</h4><b>태그코드</b>=그룹코드+개인번호(<code>DAあ-1Y</code>). 끝글자(Y·K·G·S)=숙소 구분.<h4>권한·데이터</h4>print(인쇄) 영역. guests·guest_members 읽기.',
    'cart.html': '<h4>이 화면이 하는 일</h4><b>전기카트 관리표</b>입니다. 위는 <b>월 캘린더</b>(날짜마다 팀 수·보유·사용·잔여), 아래는 <b>고른 날짜의 신청팀 목록</b>입니다. 캘린더 칸을 누르면 아래가 그 날짜로 바뀝니다.<h4>지금은 전기카트만</h4>가솔린 2인승·4인승은 화면에서 <b>빼둔 상태</b>입니다(Min 2026-08). 저장된 데이터는 그대로라 언제든 되살릴 수 있습니다.<h4>보유 대수</h4>블럭표의 <b>보유</b> 칸을 그 자리에서 고칩니다. <b>정비·고장으로 못 쓰는 카트가 있으면 보유 수를 줄이면</b> 그만큼 잔여에서 빠집니다. 카트 번호는 <b>1번부터 보유 대수까지</b> 팀 순서대로 자동 배분돼 표에 표시됩니다(팀마다 번호를 적을 필요 없음).<h4>목록·수배서</h4>목록이 <b>「신청 팀」</b>과 <b>「미신청 팀」</b> 둘로 나뉩니다. 위가 메리트투어 사전신청 명단이고, 아래 접이식 <b>미신청 팀</b>은 그날 라운딩은 하지만 신청이 없는 팀입니다 — <b>신청했는데 비고가 안 들어온 팀</b>을 여기서 찾아 대수를 직접 넣으면 됩니다. 상단에 「신청 N / 미신청 M」 건수가 표시됩니다. 팀 이름 옆 <b>「수배서」</b>를 누르면 現地手配書가 팝업으로 열립니다. <b>코스·티오프</b>는 골프 조편성에서 저장한 값을 읽어옵니다.<h4>코스 수정·저장</h4><b>코스</b>는 규칙(간지 숙박+평일=구주고원CC)으로 자동 표시되지만 <b>직접 고를 수 있습니다</b> — 오봉 연휴처럼 예외가 있을 때 야마나미CC로 바꾸면 그 팀은 <b>전기카트 사전신청 가능</b>으로 다시 계산됩니다(「수기」 표시). <b>저장 버튼은 없습니다</b> — 대수·메모·코스·취소는 <b>고치면 바로 저장</b>됩니다. 규칙대로 계산된 신청은 <b>화면을 열 때 자동 확정</b>되어 정산 청구까지 그대로 이어집니다(사람이 고친 값은 건드리지 않습니다).<h4>사전신청 표시</h4><b>○</b>(신청 있음) / <b>×</b>(없음). <h4>안 보이는 팀</h4>목록 위에 <b>「표시 N팀 / 그날 라운딩 M팀」</b> 과 <b>「그날 라운딩 없어 안 보이는 팀」</b>(사유 포함)이 나옵니다. 팀이 안 보이면 여기서 이유를 확인하세요.<h4>인원이 바뀌면 대수도 따라갑니다</h4>인원이 줄거나 늘면 규칙 대수(<b>인원÷4, 올림</b>)도 달라집니다. 예전에는 한 번 저장된 날은 다시 계산되지 않아 <b>같은 팀인데 날짜마다 1대·2대가 섞이는</b> 일이 있었습니다. 지금은 이렇게 나뉩니다.<ul><li><b>규칙이 넣은 대수</b> — 그 날짜 화면을 열면 <b>자동으로 맞춰집니다</b>(요금도 함께). 몇 건을 조정했는지 안내가 뜹니다.</li><li><b>사람이 직접 입력한 대수</b> — 자동으로 바꾸지 않습니다. 인원 칸에 <b>「⚠ 2→1대」</b> 배지와 <b>[맞추기]</b> 버튼이 떠서, 확인하고 누를 때만 고쳐집니다. 팀이 원해서 규칙과 다르게 넣어 둔 대수를 시스템이 지우면 안 되기 때문입니다.</li></ul>대수 칸에 숫자를 직접 입력하는 순간 그 날짜는 <b>사람이 정한 값</b>이 되어 이후 자동 변경 대상에서 빠집니다. 취소분이 있는 날도 일부러 줄인 것이므로 건드리지 않습니다.<h4>요금·정산 연동</h4>전기카트 <b>1대 1일 ¥2,000</b>(가솔린 0). 행별·전체 합계가 자동 계산되고, <b>남은 신청 대수 × ¥2,000 이 그 팀 御請求書에 자동 청구</b>됩니다 — <b>청구일은 라운딩 당일</b>이고, 대수를 고치거나 취소하면 청구도 따라 바뀝니다(0이면 사라짐). 취소분은 청구에서 빠집니다.<br>⚠ <b>무료일</b> — <b>입국일(인천출발 첫날) 라운딩</b>과 <b>귀국일(부산출발 마지막날) 라운딩</b>은 <b>카트 요금을 받지 않습니다</b>(출·귀국 양쪽 날). 카트 배정·대수는 그대로 관리하고 <b>요금만 0</b>이며, 표에 <b>「무료」</b>로 표시되고 합계·청구에서도 빠집니다. <b>B2B 정산(現地精算表)과는 별개</b>입니다.<h4>팀 묶음</h4>現地手配書에서 묶은 팀은 <b>대표팀 코드+팀번호</b>(<code>DFな-Y1</code>·<code>DFな-Y2</code>)로 표시됩니다 — 手配書·航空カバー·네임택·룸키 라벨과 같은 코드입니다.<h4>권한·데이터</h4>golf 영역(읽기는 로그인 전체). cart_types·cart_bookings 읽기·쓰기 / bookings·guests·passengers·golf_groups 읽기. ⚠ <code>93_cart.sql</code> 실행 필요(94는 개별 카트용이었으나 현재 화면 미사용).',
    'course.html': '<h4>이 화면이 하는 일</h4>그날 라운딩하는 팀을 <b>조 단위</b>로 <b>코스(아소·소보·쿠주)</b>와 <b>티오프 시각</b>에 배정하고, <b>조편성(누가 어느 조인지)까지 같은 화면</b>에서 합니다.<h4>이 표는 「출발 티오프」입니다</h4>야마나미는 <b>27홀 = 9홀 3개 코스</b>(아소·소보·쿠주)를 이어서 돕니다. <b>아소 출발 → 소보 → 쿠주</b> / <b>소보 출발 → 쿠주 → 아소</b> / <b>쿠주 출발 → 아소 → 소보</b>. 그래서 이 표는 <b>어느 코스에서 몇 시에 출발하는지</b>만 정하고, <b>같은 사람이 하루에 두 번 나오지 않습니다</b>.<h4>티오프 규칙</h4>코스마다 첫 조 <b>6:50</b>, <b>7분 간격</b>, 마지막 조 <b>8:42</b> = 코스당 17조. 세 코스가 동시에 출발하므로 하루 51조가 기본이고, 팀이 많은 날은 그 뒤로 7분 간격으로 이어 붙입니다.<h4>한 팀은 한 코스에 붙여서</h4>8명(2조)처럼 조가 여러 개인 팀은 <b>같은 코스의 연속된 시각</b>에 넣어 함께 돌게 합니다. 표에는 <b>1조·2조</b> 번호가 붙어 같은 이름이 겹쳐 보이지 않습니다.<h4>홀수(자동)</h4>평일 체류일 <b>27H(18+9 서비스)</b> · 주말·일본 공휴일 <b>18H</b> · 귀국일 부산편 <b>9H</b> · 입국일 ICN팀 <b>18H</b>.<h4>이 표는 야마나미CC 배정표입니다</h4><b>평일에 간지호텔에 묵는 팀은 구주고원CC</b>로 가므로 이 표에서 <b>티오프 자리를 잡지 않습니다</b>(별개 골프장이라 자리를 차지하면 실제 야마나미 팀이 밀립니다). <b>주말·공휴일은 간지 팀도 야마나미</b>라 그대로 배정표에 들어옵니다 — 규칙이 자동으로 갈라 줍니다.<h4>당일 골프 손님</h4>프론트에서 접수한 <b>당일 골프 손님(숙박 없음)</b>은 그날 팀으로 이 표에 나타납니다(<b>당일</b> 표시). 명단이 없어 조원을 자동으로 못 채우므로 <b>인원이 적어도 「조편성 재확인」</b> 에 들어갑니다 — 누가 어느 조인지 확인해 주세요. 접수는 <b>프론트 데스크</b>에서 합니다.<h4>구주고원이 안 되는 날</h4>현장 사정으로 구주고원 라운딩이 불가하면 <b>「구주고원CC 로 가는 팀」</b> 패널에서 그 팀의 <b>[야마나미로]</b>를 누르세요. 그 날짜만 야마나미로 옮겨져 배정표에 나타나고 자리도 다시 계산됩니다. 되돌릴 때는 <b>[구주고원으로 되돌리기]</b>. 이 지정은 <b>그 날짜·그 팀에만</b> 적용되며 규칙보다 우선합니다.<h4>인쇄</h4><b>[🖨 인쇄 미리보기]</b>는 <b>상단 툴바</b>와 <b>「코스 배정(조 단위)」 표 바로 위</b> 두 곳에 있습니다(같은 동작). 표를 보며 조를 정리하다가 위로 올라가지 않고 그 자리에서 바로 낼 수 있습니다. 조가 하나도 없으면 버튼이 비활성입니다.<h4>쓰는 법</h4><ul><li>월(◀▶)·라운딩 날짜 선택. 오늘이 있으면 오늘이 자동 선택됩니다.</li><li><b>배정은 시스템이 알아서 합니다</b> — 화면을 열면 그 달 라운딩일 중 부족한 날을 <b>날짜를 열지 않아도</b> 전부 배정·저장합니다. 이미 배정된 조는 건드리지 않고 <b>빈 자리에만</b> 채웁니다.</li><li><b>🔄 이 날 재배정 · 🔄 이달 재배정</b> — 자동 채움은 빠진 팀만 메우므로 한 번 치우친 배치는 저절로 고쳐지지 않습니다. 이 버튼이 <b>처음부터 다시</b> 짭니다(코스 균등·팀은 한 코스 연속). <b>✓ 확정한 조는 그대로 둡니다.</b></li><li><b>한 팀은 한 코스에 연속으로</b> 붙입니다 — 8명(2조)이면 같은 코스의 이어진 시각(예 07:39·07:46)에 들어갑니다.</li><li><b>자리 확장</b> — 기본 6:50~8:42(코스당 17조=51조)로 모자라는 날은 <b>7분 간격으로 그대로 뒤로 이어</b>붙입니다(연장된 줄은 「연장」 표시). 성수기 67팀=81조면 코스당 27조, 09:52까지 나갑니다. 더 늦게 내보내야 하면 표 아래 <b>＋ 늦은 시간 자리</b>로 <b>16:59까지</b> 늘리고, <b>− 늦은 자리 접기</b>로 다시 줄입니다(<b>조가 들어 있는 자리는 남깁니다</b>).</li><li>자동 배정은 팀을 4인 이하 조로 나눠 코스를 <b>로테이션</b>(같은 팀이 여러 날이면 아소→소보→쿠주)으로 채웁니다.</li><li><b>조원은 그 팀 안에서 명단 순서대로</b> 1조·2조로 자동으로 나눕니다(8명=2조, 9~12명=3조). <b>5명 이상 팀</b>만 사람이 한 번 확인합니다 — 맨 위 <b>조편성 확인 필요</b> 목록에서 그대로면 <b>✓ 이대로 확정</b>, 바꿀 사람이 있으면 조를 눌러 이름을 옮깁니다. 확정하거나 손대면 그 조는 <b>자동 배정이 다시 건드리지 않습니다</b>.</li><li><b>날짜 칩 배지</b> — 배정은 자동으로 끝나므로 칩은 <b>남은 일</b>을 보여줍니다. 빨강 <b>N팀</b>=조편성이 아직 확정 안 된 팀 수(5명 이상), 초록 <b>✓</b>=그날 할 일 없음. 드물게 자리가 모자란 날은 앰버 <b>자리N</b>이 함께 뜹니다.</li><li><b>카트번호</b>는 조 편성 패널에서 입력합니다(예 12,13). 표의 조 칸에도 표시됩니다.</li><li><b>쿠주힐즈 숙박 팀은 늦은 조</b>(「늦게」 뱃지)로 뒤에서부터 채웁니다 — 16:30~17:00 종료 → 샤워 → 18시 식사 → 송영이 이어지게.</li><li><b>옮기는 방법 2가지</b> — ① <b>≡ 를 끌어</b> 놓거나, ② <b>조를 한 번 클릭</b>하면 화면 아래에 「무엇을 골랐는지」 안내가 뜨고 <b>옮길 자리를 클릭</b>하면 이동합니다. 빈 칸·다른 조 어디든 놓을 수 있습니다(찬 자리는 끼워넣고 아래를 밉니다). 같은 조를 다시 누르거나 <b>ESC</b>로 취소. 조의 <b>✕</b>는 배정 해제.</li><li><b>미배정 팀</b>을 클릭하면 빈 자리에 자동으로 넣습니다.</li><li><b>제외</b> = 그날 라운딩 안 하는 팀을 뺍니다(자동 배정에서도 빠지고, 이미 잡힌 조도 내려갑니다). 아래 <b>제외한 팀</b>에서 <b>↩ 복귀</b>. 성수기엔 규칙대로면 조가 51개(코스당 17×3)를 넘으므로 이걸로 조절합니다.</li><li><b>≡ 드래그</b> = 조를 자유롭게 옮깁니다. 빈 칸에 놓으면 이동, <b>찬 칸에 놓으면 그 자리에 끼워넣고</b> 아래를 한 칸씩 밉니다(맨 아래까지 차 있으면 서로 바꿉니다). 시간대 중간에 다른 팀을 넣을 때 씁니다.</li><li><b>조 편성(사람 배치)도 이 화면에서</b> — 조를 클릭하면 위 <b>조 편성</b> 패널이 열립니다. 그 팀의 미배정 인원을 눌러 넣고, 넣은 사람을 다시 누르면 뺍니다. <b>남·여</b> 버튼으로 성별 몰아넣기, <b>이름 검색</b>으로 다른 팀 사람도 넣을 수 있습니다(합동 조).</li><li><b>저장 버튼은 없습니다</b> — 옮기거나 조원을 바꾸면 <b>바로 저장</b>됩니다.</li><li><b>🖨 미리보기</b> = <b>A3 세로</b> 공지용 한 장. 코스 입구·클럽하우스에 붙여 <b>손님이 보는 표</b>라 <b>시각 · 코스 · 태그코드 · 대표자 · 인원</b>만, <b>10시 이전 출발까지만</b> 나옵니다 — <b>홀수(27H)·코스 로테이션 설명·라운딩 예외</b>는 넣지 않습니다(담당자 화면에서 봅니다). 글씨가 크고, 줄이 많은 날은 자동으로 배율을 줄여 한 장에 맞춥니다. ⚠ 인쇄 배율은 <b>100%</b>로.</li><li><b>🖥 모니터 화면</b> = 코스 입구 모니터용 전체화면(어두운 배경·큰 글씨). 다음 출발 줄이 강조되고 <b>1분마다 자동 갱신</b>됩니다. 주소는 <b>?tv=1</b> 하나뿐이라 <b>항상 오늘 날짜</b>를 띄웁니다 — 모니터 PC에서 즐겨찾기 해두고 켜두면 날이 바뀌어도 저절로 오늘로 넘어갑니다(그 PC도 한 번은 로그인해야 합니다). 모니터 화면은 <b>보기 전용</b>이라 배정을 만들거나 고치지 않습니다.</li></ul><h4>패널은 접혀 있습니다</h4>표 위의 <b>미배정 · 제외한 팀 · 라운딩 예외</b> 패널은 <b>접이식</b>입니다 — 제목 옆 배지로 <b>건수만</b> 보이고 눌러야 펼쳐집니다(검색 중에는 저절로 펼쳐집니다). <b>미배정은 남아 있으면 펼친 채</b>로 두고, <b>조편성 재확인</b>은 할 일이 없으면 아예 나오지 않습니다. 패널이 늘었다 줄었다 하며 아래 코스 표를 밀지 않도록, 다시 그릴 때 <b>보고 있던 줄이 제자리에 남습니다</b>.<h4>라운딩 예외(홀수·불참)</h4>이 패널도 <b>기본으로 접혀</b> 있습니다(예외가 없는 날이 대부분) — 제목 옆에 <b>「예외 N팀」</b> 이 떠서 열지 않아도 그날 상태를 알 수 있고, 눌러 펼치면 그날 팀이 모두 나옵니다(검색 중에는 저절로 펼쳐집니다). 팀마다 <b>[규칙대로][27H][18H][9H]</b> 중 하나를 눌러 홀수를 정하고(지정하면 자동 계산보다 우선, 표에 <b>*</b> 표시), <b>[라운딩 안 함]</b> 으로 그날 통째로 뺄 수 있습니다. 그 아래 <b>팀원 이름을 누르면 그 사람만 불참</b>(취소선)으로 표시됩니다. 불참으로 표시하면 <b>이미 짜인 조에서도 빠지고</b>(조 인원이 줄고, 그 조가 비면 없어집니다) 자동 배정도 그 사람을 빼고 조를 만듭니다. 다시 참가로 돌리면 미배정으로 남아 다시 넣을 수 있습니다. room.html에서 <b>🛫 조기퇴실</b>로 표시된 사람도 그 실제 퇴실일부터 같은 방식으로 <b>자동 제외</b>됩니다(따로 표시할 필요 없음). 모두 <b>그 날짜에만</b> 적용되고 바로 저장됩니다. <b>인쇄물 하단</b>에 「라운딩 안 함 / 홀수 지정 / 불참(이름 취소선)」 이 함께 찍혀 현장과 같은 종이를 봅니다.<h4>팀 묶음</h4>現地手配書에서 묶은 팀은 <b>대표팀 코드+팀번호</b>(<code>DFな-Y1</code>·<code>DFな-Y2</code>)로 표시됩니다 — 手配書·航空カバー·네임택·룸키 라벨과 같은 코드입니다.<h4>권한·데이터</h4>golf 영역. bookings·guests·guest_members·passengers 읽기 / golf_groups·golf_skips·golf_holes·golf_absentees 쓰기.',
    'golf.html': '<h4>이 화면이 하는 일</h4>골프 <b>조편성</b>(4인 1조)을 만들고 <b>조편성표</b>를 인쇄합니다. <b>[⬇ 마샬 Ai 명단]</b>으로 카트 네비(테크노크래프트 마샬 Ai)에 넣을 <b>플레이어 파일</b>도 내려받습니다.<h4>마샬 Ai 명단 파일</h4>테크노크래프트 「フロント系システム IF v6.0.2」 사양 그대로 만듭니다 — <b>한 조 = 한 줄(19칸)</b> · 문자코드 <b>Shift-JIS</b> · 줄끝 CRLF · 파일명 <code>YYYYMMDDhhmmssPlayerFile.csv</code>. 이름은 <b>영문명을 「KimOkJu」 형태로 바꾸고 뒤에 태그코드</b>를 붙입니다(현지 시스템이 쓰던 표기와 동일). 영문명이 없는 분은 경고로 알려 줍니다.<br><b>카트번호는 필수</b>입니다(비어 있으면 그 조는 카트 칸이 빈 채로 나가고 경고가 뜹니다). <b>플레이어 번호는 그날 고정</b>입니다 — 다시 내보내도 같은 사람은 같은 번호를 받습니다(번호가 바뀌면 그때까지 입력된 스코어가 지워진다는 사양 경고 때문입니다). 받은 파일은 마샬이 읽는 <b>공유 폴더</b>에 두면 되고, 같은 카트번호가 여러 줄이면 <b>뒤엣것</b>이 채택됩니다.<h4>라운딩 날짜(자동)</h4>엠클릭 <b>상품명</b> 기준으로 팀별 라운딩 날짜를 자동 추출합니다: <b>입국일=ICN 팀만</b>, <b>중간 체류일=전원</b>, <b>귀국일=PUS 팀만</b>. 날짜 칩에 그날 라운딩하는 팀이 잡힙니다.<h4>쓰는 법</h4><ul><li>월(◀▶)·라운딩 날짜 선택 → 왼쪽 <b>미편성</b> 인원(팀·성별 ♂♀)을 클릭해 선택.</li><li><b>선택 → 조에 추가</b>(새 조) 또는 오른쪽 <b>조 카드를 클릭</b>해 그 조에 넣기(최대 4명).</li><li>조마다 <b>코스(아소·소보·쿠주)·티오프 시각</b> 지정. 코스는 인기순(아소&gt;소보&gt;쿠주)으로 자동 균형 배분.</li><li><b>🪄 팀 우선 자동</b>=팀별 4인씩 조를 자동 생성. <b>남/여</b> 버튼=풀에서 성별로 일괄 선택(남자끼리·여자끼리 편성).</li><li><b>💾 저장</b> → 그날 편성 저장(재저장은 그날 전체 교체). <b>🖨 인쇄</b>=조편성표.</li></ul><h4>팀 묶음</h4>現地手配書에서 묶은 팀은 <b>대표팀 코드+팀번호</b>(<code>DFな-Y1</code>·<code>DFな-Y2</code>)로 표시됩니다 — 手配書·航空カバー·네임택·룸키 라벨과 같은 코드입니다.<h4>권한·데이터</h4>golf 영역. bookings·guests·passengers(성별)·guest_members 읽기 / golf_groups·golf_group_members 쓰기. ※카트 배정·중간 교체는 다음 단계.',
    'aircover.html': '<h4>A5 <b>세로</b> · 골프백에 붙여 쓰는 종이</h4>현장이 이 종이를 <b>골프백에 테이프로 붙여</b> 놓고 옮기면서 봅니다. 그래서 손으로 쓸 때 크게 쓰던 순서 그대로 배치했습니다 — 위에서부터 <b>태그코드 → 출발지(釜山·ソウル, 색) → 체류기간(한 줄) → 番·名</b>, 항공편·시각은 보조 정보라 아래에 작게(<b>施設 줄은 제거</b> — 백에 붙은 종이에선 안 쓰여서). 그만큼 태그·출발지·기간·番名을 키웠습니다. 체류기간은 <b>入国/帰国을 두 줄로 흩지 않고 <code>08/09 – 08/13</code> 한 줄</b>로 묶었습니다. <b>태그·출발지·기간·番名 네 줄 모두 인쇄창에서 폭을 실측해 자동 축소</b>하므로, 긴 태그(DRな-Y1)나 두 자리 인원(1番〜14番)도 항상 한 줄에 들어갑니다. <b>A5 세로, 배율 100%</b>로 인쇄하세요.<h4>묶음 코드는 手配書와 항상 같습니다</h4>묶음(운영팀)으로 묶은 팀은 <b>대표 기준코드+팀번호</b>(<code>WMふ-S1·S2·S3</code>)로 통일됩니다. 이 화면은 <b>한 달</b>만 읽고 手配書는 <b>기간</b>으로 읽어, 묶음 상대가 다른 달이면 예전엔 코드가 갈리고 번호까지 어긋났습니다(2026-08 수정). 이제 <b>묶음 전원을 달과 무관하게 조회</b>해 순번을 매기므로, 어느 달을 열어도 手配書·네임택과 <b>같은 코드·같은 番号</b>가 나옵니다.<h4>묶음 팀 = 조건이 맞으면 1장</h4>手配書에서 <b>묶은 팀</b>이 <b>출국일·귀국일·출국편·귀국편·출발지(ICN/PUS)까지 전부 같으면</b>, 실질적으로 한 팀이 예약만 나뉜 것이므로 <b>航空カバー를 1장으로 합칩니다</b> — 태그코드는 팀번호 없이 기준코드 그대로(<code>DRな-Y</code>), <b>인원은 합산</b>(4팀 14명 → 「14名 1〜14番」). 하나라도 다르면 커버에 적을 내용이 달라지므로 <b>기존대로 Y1·Y2…로 나눠</b> 출력합니다. ※네임택은 무관하게 개인번호 1·2·3·4로 계속 나뉩니다.<h4>이 화면이 하는 일</h4>팀별 <b>A5 항공커버</b> 1장(가로). 개인 항공편·시설색.<h4>계산·판정</h4><ul><li>대표=<code>is_rep</code> 우선.</li><li><b>시설색·라벨</b>=태그 끝글자(Y/K/G/S).</li><li>항공편 ZE→PUS·TW→ICN 보정.</li><li>태그·인원 <b>인라인 수정</b>=print_overrides 공유 → 석식과 동기.</li></ul><h4>주요 용어</h4>태그코드(3자리, F접두=비회원).<h4>권한·데이터</h4>print(인쇄) 영역. 태그·인원 수정은 print 또는 room 권한 필요.',
        'transfer.html': '<h4>이 화면이 하는 일</h4>그날 <b>공항 픽업(도착)</b>·<b>샌딩(출발)</b> 과 <b>체류중 왕복 송영</b>을 항공편·구간별로 묶어 현장에서 <b>태블릿으로 점검</b>합니다. 태블릿이 없는 날은 같은 내용을 <b>인쇄</b>해서 씁니다.<h4>화면이 두 가지입니다</h4><ul><li><b>🚌 기사용</b> — 便별 운행표. <b>이름은 안 나옵니다.</b> 팀 코드·인원·숙소만 보고 팀마다 <b>[승차 완료]</b> 를 누릅니다.</li><li><b>🙋 미팅·샌딩용</b> — 손님을 맞이하러 가는 담당자용. 팀별 <b>이름 명단</b>이 나오고 <b>사람마다 눌러</b> 확인합니다. <b>[팀 전원]</b> 으로 한 번에 켜고 끌 수 있습니다.</li></ul>체크는 <b>바로 저장</b>되고 다른 태블릿·PC 에서도 같은 상태가 보입니다. 머리줄 숫자가 <b>진행률</b>입니다.<h4>체류중 송영(자동 편성)</h4><ul><li><b>간지호텔</b> — 라운딩이 있는 날이면 <b>그날 치는 코스로</b> 아침·저녁 왕복이 잡힙니다. 평일은 <b>구주고원CC(九重高原CC)</b>, 주말·공휴일은 <b>야마나미</b>로 갑니다.</li><li><b>시즈노야도</b> — 야마나미CC 라운딩이 있는 날 아침·저녁 왕복.</li><li><b>쿠주힐즈</b> — 1분 거리지만 <b>매일 아침·저녁 기본 왕복</b>이 잡힙니다.</li><li>중간에 잠깐 오가는 이동은 넣지 않습니다. <b>시각은 적지 않습니다</b> — 그날 상황에 맞춰 움직이므로 구간(아침 숙소→야마나미 / 저녁 야마나미→숙소)만 잡아 둡니다.</li></ul><h4>배차 입력</h4><b>기사용</b> 화면에서 便마다 <b>차량·기사·출발시각·행선지</b>를 입력하면 <b>인쇄물에 그대로 찍힙니다</b>(예전처럼 손으로 적지 않아도 됩니다). 한 便에 버스가 여러 대면 <b>[＋ 차 추가]</b> 로 줄을 늘리세요 — 대수는 사람이 정합니다. 칸을 벗어나면 자동 저장됩니다. <b>입력하지 않은 便은 예전처럼 빈칸</b>으로 인쇄되어 현장에서 적을 수 있습니다.<h4>인쇄는 IN · 체류 · OUT 각각 한 장</h4>담당이 서로 다른 시간대에 움직이므로 한 종이에 섞지 않고 <b>구간마다 장을 나눠</b> 출력합니다. 없는 구간은 장을 만들지 않습니다.<h4>기사용 배차표 읽는 법</h4>便 머리줄에 <b>출발지(서울입국)</b>와 <b>팀수·인원</b>이 크게, 그 옆에 <b>행선지별 인원</b>이 작게 나옵니다. 바로 아래 <b>배차 기입란은 행선지마다 한 줄</b>이고, 한 줄에 <b>車両(차량)·ドライバー(기사)·出発(출발시각)</b>이 함께 있습니다 — <b>버스와 기사와 출발시각은 한 몸</b>이기 때문입니다. <b>줄 수가 곧 필요한 최소 대수</b>입니다(행선지가 갈리면 버스도 갈립니다). 特記(특이사항)는 便마다 한 줄. 팀 목록에는 인원 오른쪽에 <b>귀국일</b>(<code>8/29帰</code>)이 붙어 그 팀이 언제 나가는지 바로 보입니다.<h4>인쇄물 2종</h4>보고 있는 화면에 따라 버튼이 바뀝니다.<ul><li><b>기사용 운행표</b>(A4 세로) — <b>IN(도착) → 滞在(체류중) → OUT(출발)</b> 세 블록이고 블록 머리에 <b>총 인원</b>이 큰 숫자로 나옵니다. 便(항공편)마다 카드가 하나이며 머리줄에 <b>편명 · 시각 · 지역(서울 입국 / 부산 귀국) · 팀수 · 인원</b>과 <b>행선지별 인원 소계</b>(やまなみ 60名 · 久住ヒルズ 16名 …)를 <b>자동 계산</b>해 냅니다 — 몇 대가 필요한지가 여기서 바로 나옵니다(담당자가 여백에 손으로 적던 그 숫자). 바로 아래 한 줄에 <b>車両 · ドライバー · 出発 · 特記(특이사항)</b> 기입칸이 편마다 하나씩 있습니다(배차와 「※スーパー経由」·「荷物車」·「クラブ33本」 같은 얘기는 팀이 아니라 <b>편 단위</b>로 정해지므로. 한 팀만의 얘기는 그 행 끝 <b>비고</b> 칸에 적습니다). 팀 목록은 <b>두 단으로 흘려</b> 세로를 줄이고 그만큼 글씨를 키웁니다 — 43팀이 원래 크기로 한 장에 들어갑니다. 표에는 기사가 쓰는 것만 둡니다 — <b>태그코드 · 대표자 · 인원</b>과 기입용 비고. 숙소 열은 없지만 <b>태그코드 색</b>(네임택·航空カバー와 같은 숙소 구분색)으로 어느 숙소 팀인지 보입니다. 대표자 이름이 칸을 넘으면 <b>그 칸만</b> 글자를 줄여 다 보이게 합니다. 체류중은 <b>숙소 ⇔ 골프장</b> 카드로 묶습니다. <b>한 장이 최선</b>이라 넘치면 글자를 줄여 한 장에 맞추고, 그래도 무리면 <b>최소 장수</b>로 나눕니다(빈 장이 생기지 않게).</li><li><b>미팅 명단표</b>(A4 <b>가로</b>) — 현장 종이와 같은 모양입니다. <b>사람마다 한 줄</b>(번호 · 한글 이름 · 영문 이름 · 성별 M/F)이고, 팀 묶음(<b>그룹코드 · 반대쪽 날짜 · 인원 · 숙소</b>)을 <b>여러 단으로 흘려</b> 담습니다. <b>한 장 = 한 便</b>(도착·출발) 또는 <b>한 숙소</b>(체류중) — 便이 곧 만나는 공항이라 담당이 안 섞입니다. 맨 위에 <b>IN / OUT</b>과 <b>지역(서울 입국 · 부산 귀국)</b>, <b>빨간 날짜</b>, 총 인원, 便(熊本空港 TW287(9:25)着)이 나옵니다. <b>체크칸은 두지 않습니다</b> — 실물처럼 이름 위에 바로 표시하세요(칸을 없앤 만큼 이름이 커집니다). 단 수(3~6)와 글자 크기를 자동으로 맞춰 <b>한 장에 가장 큰 글씨</b>로 담고(필요하면 원래 크기의 1.3배까지 키웁니다), 그래도 넘치면 최소 장수로 나눕니다. 그룹코드 색과 왼쪽 테두리 색이 <b>숙소</b>입니다. 성별은 <b>일행별예약의 성별</b>을 그대로 씁니다(비어 있으면 표시하지 않습니다). 이름이 칸을 넘으면 <b>그 칸만</b> 글자를 줄여 <b>이름은 언제나 다 나옵니다</b>.</li></ul><h4>줄이 나뉘는 규칙</h4>같은 팀이라도 <b>인천·부산이 섞이면 편별로 줄이 나뉘고</b> 인원을 따로 셉니다. 명단이 아직 없는 팀은 <b>예약 인원</b>으로 한 줄 나옵니다.<h4>화면 조작</h4>날짜(◀ ▶ · 오늘) · 구분(전체·도착·체류중·출발) · 공항(ICN·PUS) · 숙소 필터.<h4>표기</h4>손님 이름을 부르는 표라 <b>이름은 언제나 한국어</b>로 나옵니다(가타카나 변환 없음). 숙소는 현장 약칭(<b>やまなみ · 久住ヒルズ · ガンジー · 志津の宿</b>), 공항은 <b>지역명</b>으로 부릅니다 — 기사용 운행표는 <b>ソウル入国 / 釜山帰国</b>(서울 입국 / 부산 귀국), 미팅 명단표는 맨 위 제목이 <b>지역</b>이고 표 안 구간은 <b>공항명(仁川空港·金海空港·熊本空港)</b> 입니다. 날짜는 두 종 모두 <b>빨간색</b>. 숙소 구분색은 네임택·航空カバー와 같습니다.<h4>팀 묶음</h4>現地手配書에서 묶은 팀은 <b>대표팀 코드+팀번호</b>(<code>DFな-Y1</code>·<code>DFな-Y2</code>)로 표시됩니다 — 手配書·航空カバー·네임택·룸키 라벨과 같은 코드입니다.<h4>권한·데이터</h4>print 또는 front 영역. bookings·guests·passengers·guest_members 읽기 / transfer_checks 읽기·쓰기(SQL 110·114).',
    'qrcards.html': '<h4>이 화면이 하는 일</h4>체크인 때 손님에게 드리는 <b>팀별 QR 카드</b>를 인쇄합니다(手配書와 별도, 손님 전용 소품).<h4>손님이 이 QR로 보는 것</h4><ul><li><b>오늘 라운딩</b> — 티오프 시각·코스·카트 번호·같은 조 사람(오늘＋내일). 조가 아직 안 짜였으면 「조편성 준비 중」, 그날 라운딩이 없으면 그렇게 나옵니다.</li><li><b>결제 내역·잔액</b> — 청구가 들어오면 실시간 반영.</li></ul>직원이 같은 QR을 스캔하면 POS·정산 딥링크 바가 뜹니다(손님에겐 안 보임). 체크아웃하면 그 즉시 만료됩니다.<h4>쓰는 법</h4><ul><li>월(◀▶) 선택 → 그날 <b>入国日·숙소 칩</b>으로 대상 팀을 좁힙니다(체크인 팀만 뽑기 좋음).</li><li><b>[🔳 손님 QR카드 인쇄]</b> → A4에 팀별 미니 카드(이름+QR+안내문) 여러 장. 잘라서 체크인 때 보여주면 손님이 촬영.</li><li>토큰은 팀 고유 랜덤값 — 처음 열 때 자동 발급(발급은 print/room 권한).</li></ul><h4>주의</h4>카드엔 <b>이름·QR·안내문만</b> 담겨 다른 손님 정보는 없습니다. QR 없이 온 손님은 POS에서 검색 후 <b>「이 팀 맞습니까?」</b> 확인으로 처리합니다.',
  'dispatch.html': '<h4>이 화면이 하는 일</h4>행사별 <b>A4 양면</b> — 앞=現地手配書, 뒤=現地発生分 記入表.<h4>손님 QR 카드는 별도 페이지</h4>손님에게 드리는 <b>손님 QR카드</b>는 랜딩 인쇄물의 <b>「손님 QR카드」</b> 카드(전용 페이지)에서 인쇄합니다. 手配書 본문엔 QR을 넣지 않습니다(다른 정보 노출 방지). 토큰은 手配書를 열 때 팀별로 자동 발급됩니다.<h4>거르기</h4>출발일 · 숙소 · <b>출발지(전체 / ICN 인천 / PUS 부산·김해)</b> 칩으로 목록을 좁힙니다. 거른 결과가 <b>一括印刷</b>에도 그대로 적용되니 인천 팀만 따로 뽑을 수 있습니다. ※인별 출발지가 섞인 팀은 ICN·PUS 양쪽에 모두 나옵니다(빠지지 않게).<h4>계산·판정</h4><ul><li>라운딩 일정 자동·部屋数=<code>ceil(pax/2)</code>室.</li><li><b>마스킹 토글</b>: ON=생년월일까지 / OFF=여권·전화 노출.</li><li>記入表(뒷면)=현장 손기입, B2B 정산과 별개.</li><li><b>EVカート·룸차지 자동 반영</b>: 엠클릭 <b>현지 비고</b>(비고·참고사항 포함)에 「전기카트 2대」·「룸 업그레이드」처럼 적혀 있으면 → <b>앞면</b>에 「EVカート 申請」 전용 섹션으로 강조, <b>뒷면 記入表</b>엔 해당 区分(①룸차지·②EV카트)에 ○가 찍히고 内容이 미리 채워집니다(금액·수량·담당은 현장 손기입). 적힌 게 없으면 앞면은 「申請なし」, 뒷면은 빈 양식 그대로.</li><li><b>참고사항1·참고사항2 열</b>: 예약리스트의 <b>비고</b>(참고사항1)·<b>현지비고</b>(참고사항2)를 목록에 표시. <b>참고사항2</b>(特食·온천·별관 등 <b>현장 필수</b>)는 빨강 강조. <b>現地메모</b>는 운영팀이 직접 쓰는 별도 메모(구분).</li><li><b>「팀:A,B」 자동 묶기</b>: 예약 비고에 「팀:…」이 있으면 등록(step1) 때 그 대표명으로 팀을 찾아 手配書·夕食에 자동 묶음. 한쪽 비고에만 적혀도 됨. 수동 묶기는 보존.</li></ul><h4>한 팀만 다시 뽑기</h4>카드를 잃어버렸으면 <b>[재발급]</b>을 누르세요 — 새 QR로 갱신되고(이전 QR은 그 즉시 무효) 이어서 <b>그 팀 카드만</b> 인쇄할지 물어봅니다. 한 장이라도 잃어버리면 어차피 재발급해야 하므로, 같은 QR을 그냥 다시 뽑는 버튼은 두지 않았습니다.<h4>팀 묶음</h4>現地手配書에서 묶은 팀은 <b>대표팀 코드+팀번호</b>(<code>DFな-Y1</code>·<code>DFな-Y2</code>)로 표시됩니다 — 手配書·航空カバー·네임택·룸키 라벨과 같은 코드입니다.<h4>권한·데이터</h4>print(인쇄) 영역.',
    'dinner.html': '<h4>이 화면이 하는 일</h4>날짜별 <b>夕食オーダー</b>(A3) + 조·중·석 <b>식수 자동집계</b> + <b>レストラン名札</b> 인쇄.<h4>계산·판정</h4><ul><li>식수=숙소 그룹별 규칙. <b>석식=그날 묵는 전원</b>.</li><li><b>조기 퇴실 반영</b>: 방배정에서 🛫 조기 퇴실 처리한 인원은 끼니 경계대로 자동 차감 — <b>퇴실일 아침까지는 포함</b>, 점심·저녁부터 제외. 인쇄 명단·합계에 <code>早期退室 −N</code> 표기.</li><li><b>レストラン名札 = 운영팀 단위 합석</b>: 現地手配書에서 묶은 운영팀(team_group)이 <b>명패 1장으로 자동 합석</b>(대표자·태그 모두 표기·인원 합산). 같은 운영팀 중 <b>석식만 따로</b> 낼 팀은 「✂ 석식 분리」로 단독 명패로 뺀다(「↩ 합석 복원」 되돌림). 식수 집계는 그대로(각 팀 인원 유지).</li><li><b>제외(병합)</b>: 한 팀 지우고 다른 팀에 인원 취합 → 명단·식수에서 빠짐(묶기와 달리 명단에서 사라짐).</li></ul><h4>別注 → 정산 자동청구</h4>단가가 있는 <b>추가·업그레이드 別注를 등록하면 그 팀 御請求書(정산)에 자동으로 청구</b>가 잡힙니다(업그레이드=차액, 알레르기=청구 없음). 별주를 수정·삭제하면 청구도 자동으로 따라갑니다(DB 트리거). 팀 정산 계정이 없으면 자동 개설됩니다.<h4>주요 용어</h4>태그코드. レストラン名札은 운영팀(現地手配書) 단위 합석 · 「석식 분리」로 운영팀 중 그 팀만 단독 명패.<h4>권한·데이터</h4>print(인쇄) 영역. 태그·인원·묶기 저장은 print 또는 room 권한 필요. 別注 청구는 charges(트리거가 생성, 정산은 settle/pos 영역에서 열람).',
    'shizu.html': '<h4>이 화면이 하는 일</h4><b>志津の宿 予約表</b>(시즈노야도 료칸 객실 예약표)를 만들고 <b>객실 배정 보드</b>로 개인 단위 배정합니다. 7객실=本館 4(志津·合歓·北條·山法師)·別棟 3(吉祥·瑞雲·馬酔木).<h4>배정</h4><ul><li><b>객실 배정 보드</b>: 왼쪽 미배정에서 인원 선택 → 오른쪽 객실 클릭으로 배정. 이름 클릭=이동·✕=미배정·드래그도 가능. <b>배정·이동·해제·전체비우기·자동배정은 모두 직후 <u>↩ 되돌리기</u></b>(10초 토스트)로 전단계 복원. 여러 명 이동 시 정원(3)에 막힌 인원은 <b>건너뜀 N</b>으로 알리며, 그대로 섞였다면 ↩로 되돌리세요. <b>검색</b>(이름·영문명·대표자·행사번호)으로 찾아 그 날짜로 점프.</li><li><b>🪄 월별 자동배정</b>: 표시 중인 <b>그 달만</b> 배정(다른 달 무영향). <b>2인 페어·빈 방만</b> 채우고 홀수 1명·3인은 미배정으로 둠(수기 보완). <b>순서 — 일반팀: 本館 201·202·204(志津·合歓·山法師) → 203(北條) → 離れ 301·302·303(吉祥·瑞雲·馬酔木). 別棟 선호팀: 離れ(吉祥·瑞雲·馬酔木) 먼저→本館→北條. 北條(203)는 완전 최후가 아니라 <u>本館 중 후순위</u>(別棟보다 먼저)</b>.<br><b>고령자 우선</b> — 팀 처리 순서가 <b>팀 최고령 나이 내림차순</b>(동률이면 예약순)이라, 어르신이 있는 팀이 계단 적은 <b>本館(2층)</b>을 먼저 가져가고 젊은 팀이 離れ로 밀립니다. 나이=그 팀 <b>체크인일 기준 만나이</b>의 팀 내 최댓값(생년월일 없으면 맨 뒤). ⚠ <b>別棟 선호팀은 나이와 무관하게 離れ 우선</b> — 사전 요청이 나이보다 앞섭니다.</li><li><b>정원 2 + 강제 1명</b>: 수기로 최대 3인까지. 3인 방은 「3/2 超過」로 붉게 표시.</li><li><b>번들예약</b>(시즈+야마나미·시즈+간지 등 한 예약)은 예약기간 전체가 아니라 <b>실제 시즈 숙박 구간만</b> 미배정(未) 계산(현지비고 「M/D-M/D 시즈」 파싱·배정된 방 기준). 미배정 목록은 <b>숙소가 시즈인 팀 + 상품명에 시즈가 든 번들예약 팀</b>을 함께 봅니다 — 번들은 숙소가 야마나미/간지로 기록돼 있어, 이게 없으면 <b>배정을 푸는 순간 목록에서 사라져</b> 다시 배정할 수 없었습니다.</li></ul><h4>메모·표기</h4><ul><li><b>参考事項</b>=<b>현장 직접입력</b>(트리플룸·합팀 등 현장 필요한 것만 일본어로, 방 칸 클릭·팀 단위 자동 저장). ※한국 현지비고 자동표시는 폐지(한국어라 현장 무의미) — 긴 특이사항은 담당자에게 직접 전달. <b>現地메모</b>=방 칸 클릭해 직접 입력(팀 단위·자동 저장).</li><li><b>♨ 별채(내탕)</b>: 현지비고에 별채신청·내탕신청·온천신청 등 키워드가 있으면 別棟 방에 ♨ 자동 표기. 사전신청=<b>+2,000엔/인·박=19,000엔</b>(별채 3방·메리트 B2B).</li><li><b>現地예약 구분</b>: 메리트 B2B가 아닌 <b>현장 워크인 예약</b>은 <b>「現地」 배지</b>로 표시(배정보드·미리보기·인쇄 공통) — 현장에서 한눈에 구분.</li><li>날짜 칩에 <b>入N/出N</b>(체크인/체크아웃 팀)·<b>未N</b>(미배정). 월 선택↔보드 사이에 그날 <b>체크인/체크아웃 팀 요약</b>.</li><li><b>📌 현지 전달사항</b>(체크인/체크아웃 목록 바로 아래): 그 날짜에 묵는 팀 중 <b>현장이 미리 알아야 할 게 있는 팀만</b> 모아 보여줍니다. 자동 배지 — <b>콤보 체류</b>(시즈+간지·시즈+야마나미 등 복수 숙박지)·<b>별채 신청</b>·<b>트리플</b>·<b>식사·알러지</b>·<b>기타</b>. 소스=엠클릭 현지비고·비고 + 현장 입력(참고사항·現地메모) + 상품명. <b>원문을 그대로 함께 표시</b>하므로 배지는 눈에 띄게 하는 용도이고 판단은 원문을 보고 하십시오.</li></ul><h4>출력</h4>화면 예약표를 <b>그대로 인쇄</b>(팝업 없음·2일/장·큰 글씨)·날짜별 인쇄. 全角 표기.<h4>권한·데이터</h4><b>shizu 영역</b>(admin.html에서 지정). rooms·guest_members·passengers 읽기 + shizu_team_memo(現地메모)·shizu_memo 쓰기(shizu/room 영역).',
    'inventory.html': '<h4>이 화면이 하는 일</h4><b>부서별 재고·사입 관리</b>. 품목별 현재고·적정재고·부족 알림 + 입출고 원장 + 거래처·단가.<h4>부서</h4>재고는 <b>부서마다 따로</b> 쥡니다 — <b>F&B · 객실 · 청소/린넨 · 골프/카트 · 프론트/사무 · 시즈노야도</b>. 상단 탭으로 옮기면 주소(<code>?dept=</code>)도 같이 바뀌어 <b>즐겨찾기·새로고침해도 그 부서로 열립니다</b>. 홈 하단 <b>「재고 · 사입」</b> 섹션에서 부서 카드로 바로 들어올 수도 있습니다.<h4>흐름</h4><ul><li>품목에 <b>+입고 / −사용 / 실사</b> 기록 → 현재고 자동 갱신 + 원장(최근 이력)에 남음.</li><li>현재고가 적정재고 미만이면 <b>부족 알림</b>.</li><li>입고에 <b>거래처·단가</b>를 넣으면 그 달 <b>사입액</b>이 집계됩니다.</li></ul><h4>권한·데이터</h4><b>자기 부서 재고만 고칠 수 있습니다</b> — F&B=kitchen · 객실=room · 청소=hk · 골프=golf · 프론트=front · 시즈=shizu 영역(부서와 같은 이름). <b>보는 것은 로그인한 전원</b>이 가능합니다(다른 부서 재고를 참고할 수 있게). 서버(RLS)도 같은 기준으로 막습니다. inv_items·inv_txns·inv_suppliers.',
    'settle.html': '<h4>이 화면이 하는 일</h4>체크아웃 <b>명세서(御請求書)</b>. 팀별 청구·결제·잔액.<h4>실시간 반영</h4>POS 주문·결제가 <b>약 20초마다 자동 반영</b>됩니다(열어둔 계산서에 새 청구가 바로 추가, 목록 잔액도 갱신). 모달·입력 중엔 방해하지 않게 건너뜁니다. 안 보이면 보고 있는 <b>월(session)</b>이 그 팀과 같은지 확인하세요.<h4>계산·판정</h4><ul><li><b>잔액=청구합계−결제합계</b>.</li><li>미개설 팀=청구 0=<b>잔액 ¥0</b>(클릭하면 청구 추가, 계정 자동개설).</li><li>개인 분할이 있으면 folio 묶음(팀+개인 합계).</li></ul><h4>주요 용어</h4>현장 추가요금(추가라운드·미니바 등) — B2B 선계약과 <b>별개</b>.<h4>領収書(영수증)</h4>손님이 領収書를 달라고 하면 팀 상세의 <b>[🧾 領収書]</b>. <b>宛名(받는 분)·但し書き(명목)·금액</b>을 정해 발행합니다 — <b>금액 기본값은 이미 받은 금액</b>입니다(領収書는 받은 돈의 증거라 청구액이 아닙니다). A4 위쪽에 인쇄되고 <b>절취선</b> 아래에 控え(보관용)가 남습니다. <b>収入印紙</b>는 <b>현금 수령 5만엔 이상</b>일 때만 필요하며(카드 결제는 불요) 인쇄물이 어느 쪽인지 알려 줍니다.<h4>QR 스캐너</h4>프론트에 <b>QR 스캐너</b>가 꽂혀 있으면 손님 카드를 찍는 것만으로 <b>그 팀 청구서가 바로 열립니다</b>(어느 칸에 커서가 있든 됩니다). 이 달 목록에 없는 팀이면 월을 확인하라고 알립니다.<h4>팀 묶음 코드</h4>現地手配書에서 묶은 팀은 <b>대표팀 코드+팀번호</b>로 표시하되, 정산 화면에서는 <b>원래 코드를 괄호로 병기</b>합니다(<code>DFな-Y2 (FSネ)</code>) — 엠클릭·B2B 명세와 대조해야 하기 때문입니다. 손님에게 나가는 <b>御請求書·領収書는 통일 코드 하나만</b> 찍힙니다. <b>검색은 원래 코드로도 찾힙니다.</b><h4>워크인</h4>예약 없이 오신 손님(POS <b>[＋ 워크인]</b>)의 전표도 이 목록에 <b>「워크인」</b>으로 함께 나옵니다. 御請求書·領収書·검색·일일 매출이 예약 팀과 똑같이 동작합니다. 보통은 POS에서 그 자리에 마감되므로 여기서는 <b>확인·영수증 재발행</b> 용도입니다.<h4>권한·데이터</h4>settle 영역. folios·charges·payments.',
    'settle_merit.html': '<h4>이 화면이 하는 일</h4>메리트↔사이젠 <b>B2B 선계약</b> 정산표.<h4>계산·판정</h4><ul><li><b>숙박비=인원×박수×숙소단가</b>(야마나미·쿠주 14,000 / 간지 16,000 / 시즈 16,000).</li><li><b>송영비=인원×¥6,000</b>.</li><li>인원=<b>실제 명단 수</b>(예약 pax보다 우선). 차감·비고만 별도 저장.</li></ul><h4>주요 용어</h4>B2B(현장 추가요금과 혼동 금지).<h4>권한·데이터</h4>settle 영역.',
    'pos.html': '<h4>이 화면이 하는 일</h4>주문 입력(간이 POS). 팀 기본 + 개인 분할.<h4>흐름 = 메뉴 먼저, 팀은 계산에서</h4>화면을 열면 <b>메뉴가 바로</b> 나옵니다. 주문받은 대로 <b>메뉴를 담고</b> → 버튼이 <b>[👥 팀 선택(계산)]</b> 으로 바뀌면 눌러 <b>팀을 고르고</b>(검색·QR) → 지불 방식(팀 공통/개인 지정)을 확인한 뒤 <b>[주문 전송]</b>. 팀을 고르는 동안 <b>담은 메뉴는 그대로</b> 남습니다. QR을 먼저 스캔하면 팀이 미리 잡힌 상태로 시작합니다(기존과 동일). 팀을 잘못 골랐으면 상단 <b>[👥 팀 변경]</b>.<h4>팀 목록은 기본으로 감춰둡니다</h4>카운터 화면에 다른 손님의 이름·방번호가 그대로 보이면 안 되므로, 팀 선택 화면은 <b>목록을 펼치지 않습니다</b>. <b>QR 스캔</b>하거나 <b>검색창에 태그코드·대표자·이름·방번호</b>를 넣으면 해당 팀만 나옵니다. 꼭 훑어봐야 할 때만 <b>[목록 보기]</b>로 펼치고, <b>[목록 숨기기]</b>로 다시 닫습니다. QR 모달 안의 입력칸도 같은 검색이라(태그코드·이름·방번호) <b>그 창에서 바로</b> 팀을 고를 수 있습니다.<h4>QR로 팀 선택</h4><b>스캐너(추천)</b> — 2D 이미저를 <b>HID(키보드) 모드</b>로 연결해두면, <b>어느 화면에 있든 스캔하는 순간</b> 그 팀이 바로 열립니다. 버튼도 모달도 필요 없습니다(스캐너가 키보드처럼 입력하고 끝에 Enter 를 보내는 것을 감지 — 8자 이상·글자 간격 50ms 미만이면 스캔으로 판정하므로 사람이 치는 글자와 섞이지 않고, 검색창에 커서가 있어도 그 칸에 토큰이 남지 않습니다). ⚠ <b>1D 레이저 스캐너는 QR을 못 읽습니다</b> — 2D 이미저여야 합니다. 스캐너가 없어도 <b>토큰을 키보드로 치고 Enter</b> 하면 같은 경로로 동작합니다.<br><b>카메라</b> — <b>[📷 QR 스캔]</b>으로 태블릿 카메라 스캔(빛·초점 영향을 받아 스캐너보다 느립니다). 카메라가 안 되면 같은 모달의 <b>입력칸에 코드를 넣고 [확인]</b>. 폰 기본 카메라로 찍어 <b>청구 페이지가 열린 경우</b>에도, 직원이 로그인 상태면 그 화면 상단에 <b>직원 모드</b> 바가 떠서 [POS 주문]으로 넘어오면 <b>그 팀이 자동 선택</b>됩니다(<code>?seq=</code>). 두 경로 모두 그날 체류 목록에 없어도 그 팀을 직접 찾아 엽니다. 손님이 스캔하면 직원 모드 바는 보이지 않습니다. 이후 주문은 기존과 동일(주방 티켓·정산 청구로 반영).<h4>명단·주문 목록 보기</h4><b>「이 팀이 맞습니까?」 확인창</b>과 <b>개인 지정 명단</b>은 <b>방별로 묶여</b> 나옵니다(1908호 장인호·박재홍 / 1910호 …). 방배정이 없는 사람은 맨 뒤 「방배정 없음」으로 모입니다. 메뉴를 누르면 <b>무엇이 몇 개 담겼는지 안내</b>가 뜨고 그 줄이 잠깐 밝아집니다. 카트 제목에 <b>건수·개수</b>, 줄마다 <b>단가×수량</b>과 <b>줄 금액</b>이 따로 표시됩니다.<h4>계산·판정</h4><ul><li><b>분할</b>: 팀공통 / 특정 1인 / N분의1 → charges + 개인 folio 자동 생성.</li><li><b>주방 티켓</b>=분할 무관 <b>풀수량·팀단위</b>.</li><li>회원 배지=고객등급·회원권구분·회원구분 3컬럼 OR.</li></ul><h4>주요 용어</h4>매장(outlet)=프론트/레스토랑·연회/골프샵.<h4>팀 묶음 코드</h4>現地手配書에서 묶은 팀은 <b>대표팀 코드+팀번호</b>(<code>DFな-Y1</code>·<code>DFな-Y2</code>)로 표시됩니다 — 네임택·룸키 라벨 등 인쇄물과 같은 코드입니다. <b>검색은 원래 코드</b>(<code>FSネ</code>)<b>로도 찾힙니다.</b> 저장된 데이터는 바뀌지 않습니다.<h4>워크인(예약 없는 손님)</h4>팀 선택 화면의 <b>[＋ 워크인]</b>으로 <b>예약 없이 오신 손님</b>의 주문을 받습니다. 이름(선택)·인원만 넣으면 전표가 열리고, 주문·주방 티켓은 예약 팀과 똑같이 흐릅니다. <b>계산은 그 자리에서</b> — 장바구니 아래 <b>현금/카드 → [받고 마감]</b>으로 잔액 전액을 받고 전표를 닫습니다(프론트까지 안 보내도 됩니다). ⚠ 워크인은 <b>예약 데이터에 들어가지 않습니다</b>(엠클릭 재등록으로 지워지지 않게). 정산 화면에서도 「워크인」으로 함께 보입니다.<h4>인터넷이 끊기면</h4>화면 맨 위에 <b>빨간 띠</b>가 뜹니다. 이때는 주문 전송·저장이 <b>안 됩니다</b> — 종이에 적어 두고 연결된 뒤 입력하세요. <b>장바구니는 없어지지 않습니다</b>: 담아둔 것은 태블릿을 꺼도·새로고침해도 남고, 전송에 실패해도 그대로 있으니 연결되면 <b>[주문 전송]만 다시</b> 누르면 됩니다.<h4>권한·데이터</h4>pos 영역. charges·folios.',
    'kitchen.html': '<h4>이 화면이 하는 일</h4>주방·바 <b>주문 티켓 화면(KDS)</b>.<h4>계산·판정</h4><ul><li>티켓 <b>신규 → 접수 → 완료</b> 3단계(접수 시 담당 기록).</li><li>품목별 <b>조리 라우팅</b>(station): 주방/바/프론트.</li></ul><h4>팀 묶음 코드</h4>現地手配書에서 묶은 팀은 <b>대표팀 코드+팀번호</b>(<code>DFな-Y1</code>·<code>DFな-Y2</code>)로 표시됩니다 — 네임택·룸키 라벨 등 인쇄물과 같은 코드입니다. <b>검색은 원래 코드</b>(<code>FSネ</code>)<b>로도 찾힙니다.</b> 저장된 데이터는 바뀌지 않습니다.<h4>권한·데이터</h4>kitchen 영역. kitchen_tickets.',
    'menu.html': '<h4>이 화면이 하는 일</h4>메뉴 품목 관리(장소·라인별).<h4>계산·판정</h4><ul><li><b>코드 자동채번</b>=장소 prefix+번호(<code>FR1</code>·<code>GS1</code>).</li><li>이미 적용된 코드는 <b>잠금</b>(수정 불가).</li><li>모든 변경은 이력(change_log)에 기록.</li></ul><h4>주요 용어</h4><b>장소(venue)</b>=판매처·코드 prefix / <b>라인(category)</b>=정산 집계 기준(<code>숙박</code>은 화면에 「룸」 표시).<h4>권한·데이터</h4>menu 영역. menu_items.',
    'board.html': '<h4>이 화면이 하는 일</h4>부서 <b>공지</b> + <b>오늘 요약</b>(JST 기준 체크인·아웃·주문·매출 집계).<h4>권한·데이터</h4>읽기=로그인 전원 / 공지 쓰기·핀·정렬=admin·manager / <b>삭제=작성자 본인 또는 마스터(admin)</b>.',
    'groupcodes.html': '<h4>이 화면이 하는 일</h4><b>회원 마스터(개인정보)</b> 관리 + 빈코드 피커. <b>groupcodes 영역(admin 또는 부여받은 담당자)</b>.<h4>계산·판정</h4><ul><li>그룹코드 3자리=<b>등급 prefix + 영문(18종) + 가나(33종)</b>.</li><li><b>빈코드 피커</b>: 등급별 18×33 그리드 — <b>초록=빈 코드</b>(0명, 바로 배정) / <b>앰버=합류 가능</b>(1~3명) / 회색=4명+.</li></ul><h4>주요 용어</h4>F풀=비회원. 등급 prefix=다이아[D·M]·골드[G]·EWRC[E·W·R·C] 등.<h4>권한·데이터</h4><b>groupcodes 영역(PII)</b> — admin.html에서 신뢰 담당자에게만 부여. member_codes.',
    'frontdesk.html': '<h4>이 화면이 하는 일</h4>실시간 <b>도착·출발·재실</b> + 팀별 방번호·잔액·메모 통합 현황. 프론트=바=레스토랑 한 화면(테이블 관리는 미도입 — 명패는 계속 출력).<h4>계산·판정</h4><ul><li>🛬체크인=<code>dep===오늘</code> / 🛫체크아웃=<code>arr===오늘</code> / 🏨체류중(연박)=그 사이 / 🍽석식=그날 묵는 전원.</li><li><b>목록 순서 = 체크아웃 → 체크인 → 체류중</b>(2026-08) — 방을 비워야 청소·다음 체크인이 이어지므로 먼저 처리할 일이 위에 옵니다.</li><li><b>체크인은 인천편·부산편으로 나눠 보입니다</b> — 도착 시각·안내가 완전히 달라 항공편(항공편 코드 우선, 없으면 출발지) 기준으로 소구분합니다. 체크아웃·체류중은 나누지 않습니다.</li><li>잔액=청구−결제 합산. <b>KPI 클릭→해당 라인 스크롤</b>.</li><li><b>숙소 칩</b>으로 리스트·KPI 필터.</li></ul><h4>🍽 오늘 석식</h4>석식 카드를 누르면 <b>그날 석식 명단이 열립니다</b>. 인원은 <b>夕食オーダー(석식 오더표)와 같은 규칙</b>으로, 그날 묵는 인원에서 <b>조기퇴실</b>과 <b>업그레이드 인분</b>(기본 석식이 안 나감)을 뺀 수입니다. 각 팀에 <b>조기퇴실 −N · UP −N · 別注 · ⚠알레르기 · 🔗운영팀</b> 표시가 붙고, <b>夕食除外</b> 팀은 아래에 <b>사유와 함께 따로</b> 모입니다(합계에서 제외). 석식 화면에서 정리한 내용이 그대로 보이므로 프론트에서 따로 확인할 필요가 없습니다.<h4>실시간 반영</h4>POS에서 주문·결제가 들어오면 이 화면이 <b>약 25초마다 자동 갱신</b>돼 잔액·미수에 바로 반영됩니다(비고/메모 입력 중엔 건너뜀). 즉시 보려면 ↻로 새로고침. ※다른 <b>월/날짜</b>를 보고 있으면 그 주문 팀이 안 보일 수 있어요 — 주문한 팀의 체류월로 맞추세요.<h4>운영 상태 한눈에</h4>팀 상세에 각 섹션 입력이 배지로 모입니다 — <b>💎회원(등급) · 🛫조기퇴실 · 🍽夕食除外 · ✂석식분리 · 🔗운영팀 · 🔔확인필요</b>(💎은 팀 내 회원 수·등급을 서열 없이 라벨 그대로)(🔔은 클릭 시 해당 처리화면으로). 여러 화면을 안 돌아도 한 팀의 상태를 한 곳에서 확인.<h4>비고·메모·팀 라벨 인라인 편집</h4>팀 클릭 → 상세에서 <b>비고(운영)·메모·팀 라벨을 그 자리에서 바로 입력</b>(입력칸을 벗어나면 자동 저장, 변경이력 기록). 팀 라벨은 <b>現地手配書에 인쇄</b>되며 비우면 엠클릭 값을 씁니다. 별도 메모 페이지 없이 일하는 화면에서 남기고, 現地手配書·재실 현황과 같은 event_notes를 공유합니다.<h4>객실 쪽지</h4>팀 상세 머리글 바로 아래에 그 팀이 쓰는 <b>객실의 열린 쪽지</b>(🐛벌레·🔧설비·📌기타)가 함께 뜹니다. 등록·완료는 <b>객실청소</b> 화면에서 합니다.<h4>💴 결제 기록</h4>팀 상세 잔액 아래에서 <b>현금·카드를 고르고 금액을 넣어 그 자리에서 기록</b>합니다(금액 기본값=잔액). 손님이 돈을 내는 자리가 프론트라 정산 화면까지 가지 않습니다. 개인 분할(N분의1)이 있는 팀은 <b>어느 계정에 넣을지 고릅니다</b>. 기록하면 잔액·미수 KPI가 바로 맞춰지고, 이어서 <b>[🧾 領収書]</b> 금액도 자동으로 채워집니다. 담당자를 <b>결제할 때마다 적지 않습니다</b> — 프론트는 여러 직원이 같은 계정을 쓰는데 이름칸을 두면 교대 후에도 이전 사람 이름이 그대로 남아 <b>틀린 이름이 기록</b>됩니다(빈 값보다 나쁩니다). 대신 <b>받은 시각</b>이 <b>초까지</b> 기록되고 화면에도 그대로 보입니다 — <b>그 시간대 근무자는 근무표로 확인</b>합니다. ⚠ <b>넣기만 합니다 — 취소·정정은 정산 화면</b>에서 하세요(금전 기록이라 같은 자리에서 지우게 두지 않고 흔적을 남겨 고칩니다). 정산(settle) 권한이 없는 계정에는 입력칸 대신 안내가 뜹니다.<h4>⛳ 당일 골프 손님 접수</h4>날짜줄의 <b>[⛳ 당일 골프 손님]</b> 으로 <b>숙박 없이 라운딩만 하시는 손님</b>을 접수합니다. 이름·인원·홀수·희망 티오프·희망 코스를 넣으면 <b>코스 배정표에 그날 팀으로 나타나고</b>, 주문·입장 확인용 <b>QR 도 함께 발급</b>됩니다. 명단이 없어 조원을 자동으로 채울 수 없으므로 <b>「조편성 재확인」</b> 에 들어갑니다 — 코스 담당이 확인해야 끝납니다. ⚠ 숙박 예약(엠클릭)에는 넣지 않습니다. 넣으면 다음 달 등록 때 「파일에 없는 팀」으로 지워집니다.<h4>🧾 領収書 발행</h4>팀 상세의 <b>[🧾 領収書]</b> 로 <b>이 화면에서 바로</b> 발행합니다 — 손님이 그 자리에서 요구하는 것이라 정산 화면까지 가지 않습니다. <b>금액 기본값은 이미 받은 금액</b>(領収書는 받은 돈의 증거라 청구액이 아닙니다) — 받은 금액이 없으면 안내가 뜨고, 금액을 직접 넣어야 발행됩니다. <b>収入印紙는 현금 수령 5만엔 이상일 때만</b> 인쇄물이 판정해 표기합니다(카드 결제는 불요). 양식·팝업은 정산 화면과 <b>같은 한 벌</b>이라 어디서 뽑아도 같습니다.<h4>바로가기</h4>팀 클릭 → 상세에서 <b>정산</b>(그 팀 자동 열기)·<b>방배정</b>(그 날짜)로 점프. <b>결제 기록·정산 마감·御請求書·월 매출 요약·워크인</b>은 정산 화면에 있습니다(팀 단위가 아니거나 금전 처리라 분리).<h4>🔔 확인 필요(후속 조치)</h4>조기 퇴실 등으로 <b>다른 메뉴에 후속 작업</b>(예: 정산 환불)이 생기면 상단 패널에 모입니다. <b>[처리하기]</b>로 해당 화면(딥링크)으로 바로 가고, 끝내면 <b>[완료]</b>로 닫습니다. 미완료 N건은 랜딩 <b>🔔 배지</b>에도 떠서 어느 PC에서든 보입니다. 로그인한 담당자 누구나 완료할 수 있습니다.<h4>체크아웃 처리</h4><b>🛫 오늘 체크아웃</b> 섹션에서 처리합니다 — 팀 상세의 <b>[✓ 체크아웃]</b>(1건), 행 <b>체크박스 + [선택 체크아웃]</b>(여러 건), <b>[오늘 퇴실 전체]</b>(검색 중이면 보이는 것만). 처리된 팀은 흐리게 + <b>체크아웃 완료</b> 배지. 잘못 눌렀으면 상세에서 <b>[↩ 체크아웃 취소]</b>.<br>⚠ <b>정산완료 판정은 이 버튼</b>입니다(잔액 0 자동판정 아님 — 아무것도 안 산 팀은 입실 첫날부터 잔액 0이라 도착하자마자 처리돼 버립니다). <b>잔액이 남아도 막지 않습니다</b>(후불·B2B 이월) — 금액을 보여주고 확인만 받습니다. 체크아웃하면 <b>주문·청구 QR이 만료</b>됩니다.<h4>팀 묶음 코드</h4>現地手配書에서 묶은 팀은 <b>대표팀 코드+팀번호</b>(<code>DFな-Y1</code>·<code>DFな-Y2</code>)로 표시됩니다 — 네임택·룸키 라벨 등 인쇄물과 같은 코드입니다. <b>검색은 원래 코드</b>(<code>FSネ</code>)<b>로도 찾힙니다.</b> 저장된 데이터는 바뀌지 않습니다.<h4>권한·데이터</h4>front(프론트 데스크) 영역. 읽기 집계(데이터 변경 없음) · 확인 필요(followups)는 로그인 전원 읽기/완료. 체크아웃은 <code>guests.check_status</code>(체크인전/체크인/체크아웃)를 RPC <code>set_check_status</code>로 갱신(front·room·settle 영역, 변경이력 기록).',
    'admin.html': '<h4>이 화면이 하는 일</h4>계정 <b>역할·영역 지정</b> + 가입요청 처리. <b>마스터 전용</b>.<h4>계산·판정</h4><ul><li>역할 <b>admin / manager / staff</b> + 영역(step1·room·settle·pos·kitchen·menu·notes·<b>stats</b>).</li><li><b>admin(마스터)=전 통과</b> / <b>manager·staff=지정 영역만</b> — 역할은 구분이고, 화면 노출·접근은 <b>지정한 영역만</b>(매니저도 자동통과 안 함). 경영 통계(stats)=admin 또는 stats 지정자.</li></ul><h4>비밀번호 재설정</h4>담당자가 비밀번호를 잊으면 <b>로그인 화면의 「비밀번호를 잊으셨나요?」</b>로 본인이 재설정 메일을 받을 수 있습니다(마스터 개입 불필요). 메일이 안 오면 Dashboard <b>Authentication → Users → ⋯ → Send password recovery</b>로 발송하거나 비밀번호를 직접 지정하세요. ⚠ 링크는 1회용·만료 있음.<h4>권한·데이터</h4>admin 전용. user_access·access_requests.',
    'stats.html': '<h4>이 화면이 하는 일</h4>대표·부서장용 <b>월/연 통합 통계</b>. 기간(이번 달·올해·작년·최근 12개월·범위)을 고르면 입도·매출·가동률·고객구성을 한 화면에 집계합니다. <b>읽기 전용</b>(데이터 변경 없음).<h4>계산·판정</h4><ul><li><b>입도(送客)</b>=현지 체크인(<code>dep_date</code>) 기준·인원=<b>예약 인원</b>. 숙소별·출발지(ICN/PUS)별 분해.</li><li><b>B2B 매출</b>=인원×박수×숙소단가+인원×¥6,000(야마나미·쿠주 14,000 / 간지 16,000 / 시즈 16,000).</li><li><b>현장 매출</b>=charges(취소 제외·JST 기준), <b>현금/카드/미지정</b> 분리 + 구분별.</li><li><b>회원 비율</b>=member_grade·member_class·member_div 3컬럼 OR(하나라도 회원이면 회원), 등급별.</li><li><b>객실 가동률</b>=사용 침대-박 ÷ (가동 객실 정원×기간 일수). 체크인 월 귀속 <b>근사치</b>.</li></ul><h4>📈 예약 추이</h4>상단 <b>[📈 예약 추이]</b>로 <b>「지난주보다 늘었나」</b>를 봅니다. 출발 월별로 <b>지금 팀·인원</b>과 <b>N일 전 대비 증감</b>, 그 달의 <b>일별 추이</b>, 구분(확정·견적·대기)별·숙소별 증감, 그리고 <b>그 사이 새로 들어오거나 빠진 팀 목록</b>(등록 기록에서)을 함께 냅니다. 비교 기간은 7·14·30일에서 고릅니다.<br>「지금」은 실제 예약을 그 자리에서 세고, 「이전」은 <b>매일 자정(JST)에 찍어 둔 기록</b>입니다(<code>booking_snapshots</code> · pg_cron). <b>과거는 소급되지 않습니다</b> — 쌓기 시작한 날부터 비교가 나옵니다.<h4>📅 캘린더 보기</h4>상단 <b>[📅 캘린더]</b>로 <b>월/연 체류 현황</b>을 봅니다. 월 보기 = 한 칸이 하루, 큰 숫자가 <b>그날 밤 묵는 인원</b>이고 그 옆에 <b>팀 수</b>, 아래에 🛬체크인·🛫체크아웃(팀·인원)이 붙습니다. 색이 진할수록 인원이 많고, 날짜를 누르면 그날 <b>프론트 데스크</b>로 갑니다. 연 보기 = 월별 연인박·팀수·최다 인원. <b>예약 기준</b>이라 방배정 전 팀도 포함됩니다(홈 화면 「지금 체류」 띠와 같은 기준).<h4>주요 용어</h4>B2B(메리트 선계약)와 현장 매출은 <b>별개</b>. 가동률은 침대(정원) 기준.<h4>권한·데이터</h4><b>stats 영역</b> — admin 또는 stats 지정자만(매니저 자동통과 아님). 집계 RPC <code>exec_stats</code>(서버 합산, security definer).',
    'visitor_stats.html': '<h4>이 화면이 하는 일</h4><b>방문 통계(골프장 협회·현청 보고용)</b>. 기간(일·주·월·연 단위 토글)을 골라 <b>회원/비회원 방문객 수</b>를 집계합니다. <b>읽기 전용</b>.<h4>계산·판정</h4><ul><li><b>방문</b>=일행 1인 1체류(현지 체크인 <code>dep_date</code> 기준)=1연인원.</li><li><b>회원 판정</b>=고객등급·회원권구분·회원구분 3컬럼 OR(하나라도 회원이면 회원).</li><li><b>성별·나이대(만나이 10세 구간)·개인 회원별 방문 횟수</b> 분해.</li><li>営業日報의 <b>韓国メンバー/韓国ビジター(宿泊)</b>에 대응.</li></ul><h4>주요 용어</h4>경영 통계(돈)와 <b>분리</b> — 여기는 인원 보고 전용.<h4>권한·데이터</h4><b>report 영역</b> — admin 또는 report 지정자만. 집계 RPC <code>visitor_stats</code>(서버 합산, security definer).',
    'audit.html': '<h4>이 화면이 하는 일</h4>데이터 <b>정합성 이상</b>을 인쇄·실사용 전에 한 번에 점검합니다. <b>마스터(admin) 전용</b>. [재검수]로 실행 → 항목별 건수·표본(행사번호)을 보여줍니다.<h4>점검 항목</h4><ul><li><b>개인번호 결번</b>: 네임택 개인번호가 팀 내 1..N 연속이 아님(과거 임포트 잔재). 인쇄는 자동 재부여로 정상, 재임포트하면 DB도 교정.</li><li><b>명단 수 불일치</b>: guest_members ≠ passengers 인원.</li><li><b>팀 내 태그 중복</b> / <b>연결 끊긴 방배정</b>(FK 끊김) / <b>방 정원 초과</b>(더블부킹).</li></ul><h4>정상값</h4>연결 끊김·정원초과는 <b>0이 정상</b>(FK·정원 트리거가 막음). 결번·불일치는 재임포트로 교정.<h4>권한·데이터</h4>admin 전용. RPC <code>data_audit</code>(서버 집계, security definer·is_admin 가드). 읽기 전용(데이터 변경 없음).',
    'watchlist.html': '<h4>이 화면이 하는 일</h4>임포트된 <b>전체 예약</b>을 <b>본인(이름+생년) 기준</b>으로 스캔해 편법·이상 패턴을 검출합니다. <b>🔒 마스터급</b> — <b>watch 영역 지정자만</b>(admin.html에서 신뢰 담당자에게만 부여, 보통 마스터 본인). [재스캔]으로 실행 → 유형별 목록(이름·회원여부·행사번호). 여러 해가 한 테이블에 쌓이므로 <b>같은 사람이 작년에도 그랬는지</b>가 자동으로 드러납니다.<h4>감지 유형</h4><ul><li><b>장기 체류(병합 의심)</b>: 통상(최대 7박)을 넘는 장기 체류 — 7+7을 14박으로 합친 흔적.</li><li><b>연속 예약·다른 명단(체이닝 편법 의심)</b>: 퇴실일=입실일로 이어진 두 예약의 명단이 다르고 뒷건이 회원 명의 — 비회원이 회원 혜택을 타는 패턴.</li><li><b>연속 예약·동일 명단(명단 등록 오류)</b>: 연속된 두 예약에 같은 명단 — 14박을 7+7로 등록하며 양쪽에 같은 인원을 넣은 오류.</li><li><b>빈번 묶음 신원</b>: 여러 팀을 묶는 예약에 반복 등장하는 본인.</li></ul><h4>임계값</h4>장기=8박↑ · 빈번=묶음 3회↑ · 동일명단=자카드 0.6↑(넉넉히 잡고 결과 보며 조정). 이름 검색으로 특정인 이력만 필터.<h4>권한·데이터</h4><b>watch 영역(마스터급 · PII)</b> — admin.html에서 지정. bookings·passengers·print_overrides <b>읽기 전용</b> 클라이언트 집계(서버·데이터 변경 없음). ※passengers는 PII라 서버 RLS상 admin/manager만 읽힘 → 실제로는 마스터 본인에게만 부여를 권장.'
  };
  // 설명서 ja/en 번역(ko 원문은 SO_HELP). 토글 시 renderHelp가 교체.
  var SO_HELP_TR = {"course.html":{"ja": "<h4>この画面の役割</h4>その日ラウンドするチームを<b>組単位</b>で<b>コース(阿蘇·祖母·久住)</b>と<b>ティ時刻</b>に割り当てます。誰がどの組か(人の配置)は<b>ゴルフ組編成</b>画面で続けます。<h4>ティのルール</h4>コースごとに最初の組 <b>6:50</b>、<b>7分間隔</b>、最後の組 <b>8:42</b> = コースあたり17組。3コース同時出発なので1日最大51組です。<h4>ホール数(自動)</h4>平日の滞在日 <b>27H(18+9サービス)</b> · 週末·祝日 <b>18H</b> · 帰国日の釜山便 <b>9H</b> · 入国日のICNチーム <b>18H</b>。<h4>使い方</h4><ul><li>月(◀▶)·ラウンド日を選択。今日があれば自動で選ばれます。</li><li><b>🪄 自動割当</b> = チームを4名以下の組に分け、コースを<b>ローテーション</b>(阿蘇→祖母→久住)で埋めます。</li><li><b>久住ヒルズ宿泊のチームは遅い組</b>(「遅め」バッジ)に後ろから入ります — 16:30〜17:00終了→シャワー→18時食事→送迎に合わせるためです。</li><li>組を押して選択 → <b>空きマスを押す</b>とそのコース·時刻へ移動。組の<b>✕</b>で解除。</li><li><b>未割当チーム</b>を押すと空き枠へ自動で入ります。</li><li><b>💾 保存</b> → その日の割当を保存。組編成済みの組は<b>idを保持</b>するので組員の配置は残ります。</li><li><b>🖨 プレビュー</b> = A4横のコース割当表(画面と同じ配置)。</li></ul><h4>権限·データ</h4>golfエリア。bookings·guests·guest_members·passengers 読取 / golf_groups 書込。", "en": "<h4>What this screen does</h4>Assigns each <b>group</b> playing that day to a <b>course (Aso·Sobo·Kuju)</b> and a <b>tee time</b>. Who sits in which group is done next, on the <b>Golf grouping</b> screen.<h4>Tee rules</h4>Per course the first group is <b>6:50</b>, <b>7-minute</b> intervals, last group <b>8:42</b> = 17 groups per course. All three courses start in parallel, so up to 51 groups a day.<h4>Holes (automatic)</h4>Weekday stay day <b>27H (18+9 complimentary)</b> · weekend/JP holiday <b>18H</b> · departure day on a Busan flight <b>9H</b> · arrival day for ICN teams <b>18H</b>.<h4>How to use</h4><ul><li>Pick the month (◀▶) and the round date; today is selected automatically when present.</li><li><b>🪄 Auto assign</b> splits teams into groups of up to 4 and fills courses in <b>rotation</b> (Aso→Sobo→Kuju).</li><li><b>Teams staying at Kuju Hills get late tees</b> (「Late」 badge), filled from the last slot backwards — finish 16:30–17:00 → shower → 18:00 dinner → transfer.</li><li>Tap a group to select it, then <b>tap an empty cell</b> to move it there. <b>✕</b> removes the group.</li><li>Tapping an <b>unassigned team</b> drops it into the first free slot.</li><li><b>💾 Save</b> stores the day. Groups that already have members <b>keep their id</b>, so the member layout survives.</li><li><b>🖨 Preview</b> is the A4 landscape sheet, same layout as the screen.</li></ul><h4>Access·data</h4>golf area. Reads bookings·guests·guest_members·passengers / writes golf_groups."},"housekeeping.html":{"ja":"<h4>この画面の役割</h4>客室清掃チームが<b>その日どの部屋をどの順で</b>清掃するかを見ます。客室割当はフロント事務所が行い、この画面は<b>閲覧のみ</b>です。<h4>状態5種</h4><ul><li><b>ターンオーバー(退室→入室)</b> — 今日出て今日また入ります。<b>最優先</b>。</li><li><b>退室</b> — 今日出ます(その夜の次の客なし)。</li><li><b>連泊</b> — 滞在継続。整備のみ。</li><li><b>入室</b> — 空室に今日入ります。点検・セット。</li><li><b>空室 / 閉鎖</b> — 空き / 期間閉鎖の部屋。</li></ul><h4>並び</h4>既定は<b>ターンオーバー → 退室 → 連泊 → 入室 → 空室</b>。連泊は<b>ティオフの早い部屋から</b> — チームがラウンドに出た後でないと入れないためです。<h4>表の見方</h4><ul><li>表示は<b>カード</b>と<b>表</b>の2種類(タブレットはカードが見やすい)。上の<b>階・棟チップ</b>を押すとその階だけ表示します。</li><li>宿泊チップは客室割当画面と同じ項目なので<b>祖母別荘・阿蘇別荘・ドームハウス</b>の割当もそのまま出ます。既定はやまなみ+久住(ガンジー・志津はチップを押すと表示)。</li><li><b>泊目</b>＝今日までに泊まった夜数／全体の泊数。<b>シーツ交換</b>は3泊目ごと。</li><li><b>ティオフ</b>＝その日そのチームの最も早いティオフ時刻とコース。</li></ul><h4>印刷</h4>階ごとに1枚、A4縦。<h4>権限・データ</h4>hkエリア。room_inventory・rooms・guests・bookings・room_closures・golf_groups の読取のみ。","en":"<h4>What this screen does</h4>Shows the housekeeping team <b>which rooms to clean, in what order</b>, for one day. Room assignment happens at the front office; this screen is <b>read-only</b>.<h4>Five statuses</h4><ul><li><b>Turnover (out → in)</b> — departs and a new team arrives the same day. <b>Highest priority</b>.</li><li><b>Departure</b> — leaves today, nobody arrives tonight.</li><li><b>Stayover</b> — staying on; service only.</li><li><b>Arrival</b> — a vacant room takes a guest today.</li><li><b>Vacant / Closed</b> — empty / closed for a period.</li></ul><h4>Order</h4>Default sort is <b>turnover → departure → stayover → arrival → vacant</b>. Stayovers are ordered by tee-off time, because the room is only free once the team leaves for golf.<h4>Reading the table</h4><ul><li>Two views: <b>cards</b> and <b>table</b> (cards suit tablets). The <b>floor / block chips</b> at the top show one floor at a time.</li><li>Lodging chips match the room-assignment screen, so <b>Sobo / Aso villas and the Dome House</b> appear here too. Default is Yamanami + Kuju (Guernsey and Shizu need an explicit chip).</li><li><b>Night</b> = nights stayed so far / total nights. <b>Linen change</b> appears every third night.</li><li><b>Tee off</b> = that team's earliest round of the day, with the course.</li></ul><h4>Print</h4>One A4 portrait page per floor.<h4>Permissions / data</h4>Area <code>hk</code>. Reads room_inventory, rooms, guests, bookings, room_closures, golf_groups."},"occupancy.html":{"ja":"<h4>この画面の役割</h4>日付ごとに<b>客室がどれだけ埋まっているか</b>を1つの表で見ます。メリットツアーの「ホテルブロック」表は<b>残り</b>を見るためのものですが、現場は<b>埋まった数</b>を見るので向きを逆にしています。<b>読み取り専用</b>。<h4>表の見方</h4><ul><li>行=<b>施設→ルームタイプ</b>、列=日付。複数の月を選んで<b>続けて</b>見られます(月の変わり目に縦線)。</li><li>マス<b>上=その夜の使用室数</b>、<b>下=保有室数</b>。色は残り基準 — 緑(4室+)・黄(1〜3室)・赤(満室・超過)。</li><li>滞在判定=<code>check_in ≤ 日付 &lt; check_out</code>(退室日の夜は空き)。同じ部屋に複数名でも<b>1室</b>。</li><li>最下段の<b>合計</b>行=表示中の施設のその日の使用室数合計。</li></ul><h4>マスを押すと</h4>その日そのルームタイプに入っている<b>チーム一覧</b>(部屋番号・グループコード・代表・人数・滞在期間)が下に出ます。<h4>権限・データ</h4>roomエリア。room_inventory・rooms・guests・bookings 読取。","en":"<h4>What this screen does</h4>Shows <b>how full the rooms are</b> for each date in one grid. The Merit Tour \"hotel block\" sheet tracks what is <b>left</b>; on site we need what is <b>filled</b>, so this table is inverted. <b>Read-only</b>.<h4>Reading the grid</h4><ul><li>Rows = <b>facility → room type</b>, columns = dates. Pick several months to view them <b>continuously</b> (a vertical rule marks each month start).</li><li>Each cell shows <b>rooms in use that night</b> on top and <b>rooms in stock</b> below. Colour follows what is left — green (4+), amber (1–3), red (full/over).</li><li>Occupancy = <code>check_in ≤ date &lt; check_out</code> (the checkout night is free). Several guests in one room still count as <b>one room</b>.</li><li>The <b>Total</b> row sums rooms in use for the visible facilities.</li></ul><h4>Clicking a cell</h4>Lists the <b>teams</b> in that room type that night (room no., group code, rep, pax, stay).<h4>Access · data</h4>room area. Reads room_inventory, rooms, guests, bookings."},"golf.html":{"ja":"<h4>この画面の役割</h4>ゴルフの<b>組編成</b>(4人1組)を作成し<b>組編成表</b>を印刷します。<h4>ラウンド日(自動)</h4>エムクリックの<b>商品名</b>からチーム別ラウンド日を自動抽出: <b>入国日=ICNチームのみ</b>、<b>滞在中日=全員</b>、<b>帰国日=PUSチームのみ</b>。<h4>使い方</h4><ul><li>月(◀▶)·ラウンド日を選択 → 左の<b>未編成</b>者(チーム·性別♂♀)をクリックで選択。</li><li><b>選択→組へ</b>(新しい組)または右の<b>組カードをクリック</b>して追加(最大4名)。</li><li>組ごとに<b>コース(阿蘇·祖母·久住)·ティ時刻</b>を指定。コースは人気順(阿蘇&gt;祖母&gt;久住)で自動配分。</li><li><b>🪄チーム優先 自動</b>=チーム別4名で自動生成。<b>男/女</b>=性別で一括選択。</li><li><b>💾保存</b>→その日の編成を保存(再保存はその日を総入替)。<b>🖨印刷</b>=組編成表。</li></ul><h4>権限·データ</h4>golfエリア。bookings·guests·passengers·guest_members 読取 / golf_groups·golf_group_members 書込。※カート割当·途中交代は次段階。","en":"<h4>What this screen does</h4>Create golf <b>groupings</b> (4-somes) and print the <b>grouping sheet</b>.<h4>Round days (auto)</h4>Round days per team are auto-derived from the M-Click <b>product name</b>: <b>arrival day = ICN teams only</b>, <b>stay days = everyone</b>, <b>departure day = PUS teams only</b>.<h4>How to use</h4><ul><li>Pick month (◀▶) and round day → click <b>unassigned</b> people (team · gender ♂♀) to select.</li><li><b>Selected → group</b> (new) or click a <b>group card</b> to add (max 4).</li><li>Set each group's <b>course (Aso·Sobo·Kuju) and tee time</b>. Courses auto-balance by popularity (Aso&gt;Sobo&gt;Kuju).</li><li><b>🪄 Auto (team-first)</b> creates 4-somes per team. <b>M/F</b> bulk-selects by gender.</li><li><b>💾 Save</b> the day's grouping (re-save replaces the whole day). <b>🖨 Print</b> the sheet.</li></ul><h4>Permissions / data</h4>golf area. Reads bookings·guests·passengers·guest_members / writes golf_groups·golf_group_members. Cart assignment & mid-round swaps are next."},"step1.html":{"ja":"<h4>この画面の役割</h4>エムクリックのエクセル(<b>予約リスト・同行者別予約・グループコード参照</b>)をアップロードすると、グループコード・会員判定・航空情報を計算して保存します。<b>すべての画面の起点</b>です。<h4>計算・判定</h4><ul><li><b>月単位の同期</b>: アップロードした当月で、ファイルに無いチームのみ確認のうえ整理(<b>他の月には影響なし</b>)。あるチームはidを保持(割当維持)。</li><li><b>グループコード自動計算</b>: 会員=事前割当、非会員=Fプール(<code>FAあ</code>~)。</li><li><b>日付自動認識</b>: エクセルの数値・韓国語・MM/DD/YYYYをすべて取り込み。</li></ul><h4>主な用語</h4>予約リスト=<b>チームマスター</b>(商品・宿泊施設・期間・金額) / 同行者別予約=<b>個人明細</b>(名簿・航空・生年月日・等級)。結合キー=<code>eventSeq</code>(行事番号)。<h4>権限・データ</h4>step1エリア。保存先: bookings・passengers・guests・guest_members。","en":"<h4>What this screen does</h4>Upload the M-Click Excel files (<b>reservation list, companion-by-companion reservation, group code reference</b>) and it computes and stores the group code, member status, and flight info. This is the <b>starting point for every screen</b>.<h4>Calculation / judgment</h4><ul><li><b>Monthly sync</b>: For the uploaded month, only teams missing from the file are cleaned up after confirmation (<b>no effect on other months</b>). Teams present keep their id (assignments preserved).</li><li><b>Automatic group code</b>: members = pre-assigned, non-members = F pool (<code>FAあ</code>~).</li><li><b>Automatic date recognition</b>: absorbs Excel serial numbers, Korean text, and MM/DD/YYYY alike.</li></ul><h4>Key terms</h4>Reservation list = <b>team master</b> (product, lodging, period, amount) / companion-by-companion reservation = <b>individual details</b> (roster, flights, birth date, grade). Join key = <code>eventSeq</code> (event number).<h4>Permissions / data</h4>step1 area. Stored to: bookings, passengers, guests, guest_members."},"room.html":{"ja":"<h4>この画面の役割</h4><b>個人単位</b>の客室割当。自動割当・分割滞在・タイムライン・期間閉鎖。<h4>計算・判定(自動割当)</h4><ul><li><b>予約順の先着</b>: 予約の早いチームから。</li><li><b>名簿順にペア(1・2、3・4)</b> — 同行者別予約の順序(相部屋の意図)をそのまま守ります。<b>ペアに会員が1人でもいればその部屋をデラックス</b>、いなければ予約種別(ツイン・コンパクト)。各プールとも<b>高層から</b>、デラックス不足時は予約順で確保し、残りは予約種別へ格下げ。</li><li><b>同じチームは同じ階</b>: 2部屋以上ならチーム全員が入る一つの階にまとめて割当(階が足りなければ分散)。</li><li><b>再割当=全体の再配置</b>: autoのみ消して最初から。手動・分割(✂)は保護。</li><li><b>シングル・トリプルは自動割当から除外</b>: 現地備考に「シングル」表記のあるチームと3名(トリプル)チームはペア(1・2、3・4)が合わないため<b>未割当のまま手動配置</b>します(保留理由を表示)。</li><li><b>定員</b>: 一泊単位の重複チェック(他の月も含む)。閉鎖期間の部屋は除外。</li></ul><h4>主な用語</h4><b>タグコード</b>=3桁のグループコード(<code>F</code>接頭=非会員)。<b>会員判定</b>=顧客等級・会員権区分・会員区分の<b>いずれか一つでも会員なら会員</b>。<b>分割(✂)</b>=基準日から別の部屋へ。<h4>日付チップ</h4>日付ごとに<b>入N</b>(その日チェックインするチーム)・<b>出N</b>(その日チェックアウトするチーム)・<b>未N</b>(その日到着でまだ未割当)が付きます。到着がある日に未割当0なら<b>✓</b>。出はその日空く部屋を同日チェックインに使えるという合図です。志津の宿 予約表と同じ表記で、施設トグルで絞るとその施設のみ数えます。<h4>割当検索</h4>上部固定バーの<b>🔎割当検索</b>にタグコード・韓国語名・英字名・行事番号を入力すると、その人が<b>どの部屋・どの日付</b>に割当されたかが一覧で表示され、クリックするとその日付のカードへジャンプして部屋を強調します。<h4>変更履歴</h4>下部の<b>🕘客室割当の変更履歴</b>で、誰が・いつ割当/解除/分割/自動割当したかを照会(検索・もっと見る)。<b>自動割当の再配置は人ごとに「↪️移動」(A室→B室)としても記録</b>され、誰がどこからどこへ移ったかを追跡できます。<h4>早期チェックアウト(🛫)</h4>1〜2名だけ予定より早く帰国する場合、メンバーチップの<b>🛫</b>を押して実際の退室日を入力します。<b>その人だけ</b>処理され(チーム全体ではない)、ベッドはその日から空きます(残りの部屋・分割も自動短縮)。同じ🛫を再度押すと解除。処理すると<b>「確認が必要」(精算/返金)項目が自動生成</b>され、フロントデスクで見落とさないよう通知します。残り人数の部屋変更は✂移動で。<b>B2B精算は不変</b>(返金は現地 御請求書)。夕食の食数も自動で控除されます。<h4>権限・データ</h4>roomエリア。rooms・room_inventory・room_closures・guest_members(actual_dep)・followups・change_log。","en":"<h4>What this screen does</h4>Room assignment <b>per individual</b>. Auto-assignment, split stays, timeline, period closure.<h4>Calculation / judgment (auto-assignment)</h4><ul><li><b>First come by reservation order</b>: earlier-booked teams first.</li><li><b>Pairs in roster order (1&2, 3&4)</b> — keeps the companion-by-companion order (intended roommates) intact. <b>If a pair includes even one member, that room becomes deluxe</b>; otherwise the reservation type (twin / compact). Each pool fills <b>from the upper floors</b>; when deluxe runs short it is taken by reservation order and the rest are downgraded to the reservation type.</li><li><b>Same team, same floor</b>: with two or more rooms, the whole team is grouped onto one floor that fits all (split if the floor is too small).</li><li><b>Reassign = full re-layout</b>: clears only auto and starts over. Manual and split (✂) are protected.</li><li><b>Singles &amp; triples excluded from auto-assignment</b>: teams with a 'single' note in the local remark and 3-person (triple) teams do not fit the pairing (1&amp;2, 3&amp;4), so they are <b>left unassigned for manual placement</b> (hold reason shown).</li><li><b>Capacity</b>: per-night overlap check (including other months). Rooms in a closure period are excluded.</li></ul><h4>Key terms</h4><b>Tag code</b> = 3-digit group code (<code>F</code> prefix = non-member). <b>Member judgment</b> = if <b>any one</b> of customer grade, membership category, or member category indicates a member, treated as a member. <b>Split (✂)</b> = move to another room from a reference date.<h4>Date chips</h4>Each date shows <b>入N</b> (teams checking in), <b>出N</b> (teams checking out) and <b>未N</b> (arrivals still unassigned); a <b>✓</b> means every arrival that day is assigned. 出 flags rooms freed that day that can take a same-day check-in. Same notation as the Shizu reservation chart; narrowing the facility toggle counts only that facility.<h4>Assignment search</h4>Enter a tag code, Korean name, English name, or event number in <b>🔎 assignment search</b> in the fixed top bar, and you get a list of <b>which room and which date</b> that person is assigned to; click to jump to that date's card and highlight the room.<h4>Change history</h4>The <b>🕘 room assignment change history</b> at the bottom lets you look up who assigned/unassigned/split/auto-assigned and when (search, load more). <b>Auto-assignment re-layouts are also recorded per person as '↪️ move' (Room A → Room B)</b>, so you can trace who moved from where to where.<h4>Early checkout (🛫)</h4>When only 1-2 people leave earlier than planned, press <b>🛫</b> on the member chip and enter the actual departure date. <b>Only that person</b> is processed (not the whole team), and the bed is freed from that day (remaining rooms / splits are auto-shortened). Press 🛫 again to clear it. Once processed, a <b>'Follow-up needed' (settlement/refund) item is auto-created</b> so the front desk does not miss it. Move the remaining people with the ✂ split. <b>B2B settlement is unchanged</b> (refund via the on-site 御請求書). Dinner meal counts are also deducted automatically.<h4>Permissions / data</h4>room area. rooms, room_inventory, room_closures, guest_members(actual_dep), followups, change_log."},"keyslip.html":{"ja":"<h4>この画面の役割</h4>ルームキーボックスに挿す<b>ラベル(付箋)</b>を印刷します。手書きしていたものを部屋割当からそのまま出力します。<h4>ラベルの内容</h4>グループコード ・ その部屋の宿泊者名 ・ <b>部屋番号</b> ・ 宿泊期間(<code>8/5(水)~8/11(火)</code>) ・ 泊数。<h4>使い方</h4><ul><li>月(◀▶)を選ぶと、その月に<b>チェックイン</b>する部屋割当を1部屋につき1枚用意します。</li><li><b>泊数チップ</b>(3泊・4泊・7泊・8泊以上・その他)で絞ってから印刷 → その色の付箋だけをセットして1色ずつ出せます。</li><li><b>日付表記</b>: 「チェックアウト日」(既定 — 日〜木の4泊なら<b>日〜木</b>、現場の手書きと同じ) / 「最終宿泊日まで」(<b>日〜水</b>)から選択。選んだ値は記憶されます。</li><li><b>ラベルサイズ</b> 50×50・75×50・75×25mm。<b>開始マス</b>=使いかけの用紙の続き印刷。</li><li><b>手配書でまとめたチーム</b>は<b>代表チームのタグコード+チーム番号</b>に統一して印刷します(<code>FMカ-Y1</code>・<code>FMカ-Y2</code>) — 現地手配書・航空カバー・ネームタグと同じコードです。まとめていないチームは元のグループコードのままです。</li><li>並び順は<b>泊数 → チェックイン日 → 部屋番号</b>。分割滞在は区間ごとに1枚。</li></ul><h4>注意</h4>部屋未割当のチームはラベルが出ません(上部に未割当チームを警告表示 — 先に部屋割当で割り当ててください)。<h4>権限・データ</h4>print(印刷)エリア。rooms・guests・guest_membersの読み取り(変更なし)。","en":"<h4>What this screen does</h4>Prints the <b>slips (sticky notes)</b> that go into the room key box. What used to be handwritten now comes straight from the room assignments.<h4>What's on a slip</h4>Group code · occupant names for that room · <b>room number</b> · stay dates (<code>8/5(水)~8/11(火)</code>) · nights.<h4>How to use</h4><ul><li>Pick a month (◀▶) to prepare one slip per room assignment <b>checking in</b> that month.</li><li>Filter with the <b>nights chips</b> (3 / 4 / 7 / 8+ / other), then print — so you can load just that colour of sticky note and print one colour at a time.</li><li><b>Date shown</b>: “Check-out date” (default — a Sun–Thu 4-night stay prints <b>Sun–Thu</b>, same as the handwritten slips) or “Through last night” (<b>Sun–Wed</b>). Your choice is remembered.</li><li><b>Label size</b> 50×50 · 75×50 · 75×25mm. <b>Start cell</b> continues a partly-used sheet.</li><li>Teams <b>grouped on the dispatch sheet</b> print with the <b>representative team's tag code plus a team number</b> (<code>FMカ-Y1</code> · <code>FMカ-Y2</code>) — the same code as the dispatch sheet, air cover and name tags. Ungrouped teams keep their own group code.</li><li>Sorted by <b>nights → check-in date → room number</b>. A split stay gets one slip per segment.</li></ul><h4>Note</h4>Teams with no room assigned produce no slip (unassigned teams are flagged at the top — assign them in Room Assignment first).<h4>Permissions / data</h4>print area. Reads rooms, guests, guest_members (no writes)."},"nametag.html":{"ja":"<h4>この画面の役割</h4>個人別の<b>ネームタグラベル</b>(Askul 24面)を印刷します。step1で計算済みの値を読み取って出力(再計算なし)。<h4>主な用語</h4><b>タグコード</b>=グループコード+個人番号(<code>DAあ-1Y</code>)。末尾の文字(Y・K・G・S)=宿泊施設の区分。<h4>権限・データ</h4>print(印刷)エリア。guests・guest_membersの読み取り。","en":"<h4>What this screen does</h4>Prints individual <b>ネームタグ labels</b> (Askul 24-up). Reads the values computed in step1 and outputs them (no recalculation).<h4>Key terms</h4><b>Tag code</b> = group code + personal number (<code>DAあ-1Y</code>). Last letter (Y, K, G, S) = lodging division.<h4>Permissions / data</h4>print area. Reads guests, guest_members."},"aircover.html":{"ja":"<h4>この画面の役割</h4>チーム別の<b>A5 航空カバー</b>1枚(横)。個人の航空便・施設色。<h4>計算・判定</h4><ul><li>代表=<code>is_rep</code>を優先。</li><li><b>施設色・ラベル</b>=タグ末尾の文字(Y/K/G/S)。</li><li>航空便ZE→PUS・TW→ICN補正。</li><li>タグ・人数の<b>インライン修正</b>=print_overrides共有 → 夕食と同期。</li></ul><h4>主な用語</h4>タグコード(3桁、F接頭=非会員)。<h4>権限・データ</h4>print(印刷)エリア。タグ・人数の修正にはprintまたはroom権限が必要。","en":"<h4>What this screen does</h4>One <b>A5 航空カバー</b> per team (landscape). Per-person flights and facility colors.<h4>Calculation / judgment</h4><ul><li>Representative = <code>is_rep</code> takes priority.</li><li><b>Facility color / label</b> = last letter of the tag (Y/K/G/S).</li><li>Flight correction ZE→PUS, TW→ICN.</li><li><b>Inline edit</b> of tag and pax = shared via print_overrides → synced with dinner.</li></ul><h4>Key terms</h4>Tag code (3 digits, F prefix = non-member).<h4>Permissions / data</h4>print area. Editing tag or pax requires print or room permission."},"dispatch.html":{"ja":"<h4>この画面の役割</h4>行事別の<b>A4両面</b> — 表=現地手配書、裏=現地発生分 記入表。<h4>絞り込み</h4>出発日・宿泊施設・<b>出発地(全体 / ICN 仁川 / PUS 釜山·金海)</b>のチップで一覧を絞ります。絞った結果は<b>一括印刷</b>にもそのまま適用されるので、仁川チームだけを出すことができます。※個人ごとの出発地が混在するチームは ICN・PUS の両方に表示されます(漏れ防止)。<h4>計算・判定</h4><ul><li>ラウンディング日程は自動・部屋数=<code>ceil(pax/2)</code>室。</li><li><b>マスキングトグル</b>: ON=生年月日まで / OFF=パスポート・電話を表示。</li><li>記入表(裏面)=現場での手書き、B2B精算とは別。</li><li><b>EVカート·ルームチャージ 自動反映</b>: <b>現地備考</b>(備考・参考事項も対象)に「전기카트 2대」「룸 업그레이드」等の記載があれば → <b>表面</b>に「EVカート 申請」専用セクションで強調、<b>裏面 記入表</b>は該当区分(①ルームチャージ・②EVカート)に○が付き内容が予め入ります(金額・数量・担当は現場で手書き)。記載が無ければ表面は「申請なし」、裏面は空欄のまま。</li></ul><h4>権限・データ</h4>print(印刷)エリア。","en":"<h4>What this screen does</h4><b>A4 double-sided</b> per event — front = 現地手配書, back = 現地発生分 記入表.<h4>Filtering</h4>Narrow the list with the departure-date, lodging and <b>origin (All / ICN Incheon / PUS Busan·Gimhae)</b> chips. The filtered result also applies to <b>bulk printing</b>, so you can print only the Incheon teams. Note: a team whose members have mixed origins appears under both ICN and PUS, so nothing is dropped.<h4>Calculation / judgment</h4><ul><li>Round schedule is automatic; room count = <code>ceil(pax/2)</code> rooms.</li><li><b>Masking toggle</b>: ON = up to birth date / OFF = passport and phone shown.</li><li>記入表 (back) = handwritten on-site, separate from B2B settlement.</li><li><b>EV cart / room charge auto-fill</b>: if the <b>local remark</b> (remarks &amp; reference notes too) mentions a cart or room upgrade, the <b>front</b> shows a dedicated &quot;EVカート 申請&quot; section and the <b>back 記入表</b> pre-marks the matching category (① room charge / ② EV cart) with the content filled in (amount, qty and handler stay handwritten). If nothing is written, the front shows &quot;申請なし&quot; and the back stays blank.</li></ul><h4>Permissions / data</h4>print area."},"dinner.html":{"ja":"<h4>この画面の役割</h4>日付別の<b>夕食オーダー</b>(A3) + 朝・昼・夕の<b>食数自動集計</b> + <b>レストラン名札</b>の印刷。<h4>計算・判定</h4><ul><li>食数=宿泊施設グループ別ルール。<b>夕食=その日に宿泊する全員</b>。</li><li><b>早期チェックアウト反映</b>: 部屋割りで🛫早期退室を処理した人は食事の境界どおり自動控除 — <b>退室日の朝までは含む</b>、昼・夕から除外。印刷の名簿・合計に<code>早期退室 −N</code>を表記。</li><li><b>レストラン名札 = 運営チーム単位で合席</b>: 現地手配書でまとめた運営チーム(team_group)が<b>名札1枚に自動合席</b>(代表者・タグをすべて表記・人数合算)。同じ運営チームのうち<b>夕食だけ別</b>にしたいチームは「✂夕食分離」で単独名札に(「↩合席に戻す」で復元)。食数集計はそのまま。</li><li><b>除外(統合)</b>: あるチームを消して別チームに人数を取りまとめ → 名簿・食数から外れます(まとめと違い名簿から消えます)。</li></ul><h4>主な用語</h4>タグコード。「チーム別タグ・人数」は航空カバーと共有(夕食のみ除外を反映) ・「まとめ」は名札専用。<h4>別注→精算</h4>単価のある<b>追加・アップグレード別注を登録するとそのチームの御請求書に自動課金</b>されます(アップグレード=差額、アレルギー=課金なし)。別注の修正・削除に課金も自動追従(DBトリガー)。<h4>権限・データ</h4>print(印刷)エリア。タグ・人数・まとめの保存は print または room 権限が必要。","en":"<h4>What this screen does</h4>Prints the date-based <b>夕食オーダー</b> (A3) + automatic <b>meal count</b> totals for breakfast/lunch/dinner + <b>レストラン名札</b>.<h4>Calculation & logic</h4><ul><li>Meal count = rules by lodging group. <b>Dinner = everyone staying that night</b>.</li><li><b>Early checkout reflected</b>: people processed as 🛫 early checkout in room assignment are auto-deducted by meal boundary — <b>included through the morning of the departure day</b>, excluded from lunch and dinner onward. Shown as <code>早期退室 −N</code> on the printed roster and totals.</li><li><b>Restaurant nameplate = merged by operational team</b>: the operational team (team_group) set in 現地手配書 <b>auto-merges onto one nameplate</b> (all reps & tags shown, headcounts summed). To split only dinner out of an operational team, use '✂ Split dinner' (revert with '↩ Merge back'). Meal-count totals stay the same.</li><li><b>Exclude (merge)</b>: Remove one team and consolidate its headcount into another → it drops out of the roster and meal count (unlike grouping, it disappears from the roster).</li></ul><h4>Key terms</h4>Tag code. 'Team tag/headcount' is shared with the 航空カバー (only the exclusion is reflected in dinner); 'grouping' is for nameplates only.<h4>Add-on → billing</h4>Registering a priced <b>add/upgrade item auto-charges that team's bill</b> (upgrade = price difference; allergies are not charged). Edits/deletes of the add-on follow automatically (DB trigger).<h4>Permission & data</h4>print area. Saving tags, headcounts, or grouping requires print or room permission."},"shizu.html":{"ja":"<h4>この画面の役割</h4><b>志津の宿 予約表</b>(志津の宿へ送る客室予約表)を出力します。<b>部屋割り(room)画面で行った志津の宿の割当をそのまま読み込み</b>、日付別に7客室(本館4・別棟3)の予約表を自動生成します。<h4>計算・判定</h4><ul><li><b>入替・空室移動</b>: 予約表で<b>部屋名クリック→別の部屋クリック</b>で2部屋を入れ替え、または空室へ移動(同一日・重複防止)。自動割当は部屋割り(room)でバックグラウンド進行し予約表を埋めます。</li><li><b>連泊・合計・男女</b>は割当・名簿から自動(性別は同行者別予約基準、氏名で照合)。</li><li><b>別棟(吉祥・瑞雲・馬酔木)温泉の事前申請</b>: 別棟割当者に♨トグル → 申請した人泊のみ<b>×¥2,000</b>集計(客室料¥17,000は本館・別棟同一)。申請時のみ現地で温泉のお湯を準備。<b>料金はメリットB2B精算で受領</b>(御請求書には課金しません)。</li></ul><h4>出力</h4>画面プレビュー ＋ 印刷。数字は全角表記。<b>日付チップ</b>で特定日のみ<b>日別 表示・印刷</b>可(全日=その月全体)。備考欄には予約リスト・同行者別予約の<b>備考/現地備考をチーム別に表示し、DeepLで日本語へ自動翻訳</b>(原文併記・キャッシュ)。※DeepL APIキーがSupabaseエッジのシークレットに必要。<h4>権限・データ</h4><b>shizu(志津の宿 予約表)エリア</b>(印刷とは別に権限分離 — admin.htmlで個別指定)。rooms・guest_members・passengers 読取 ＋ shizu_onsen(温泉事前申請、shizu/room 書込)。","en":"<h4>What this screen does</h4>Outputs the <b>Shizu-no-Yado reservation chart</b> sent to the ryokan. It <b>reads the Shizu-no-Yado assignments made on the room-assignment (room) screen</b> and auto-builds the per-night chart for the 7 rooms (4 main + 3 annex).<h4>Calculation / judgment</h4><ul><li><b>Assign on the room screen</b>: this screen only reads and prints — change rooms on the room-assignment screen — or <b>swap / move to an empty room right here</b>: click a room name then another room to swap the two (or move to an empty one; same day, conflicts blocked). Auto-assignment runs in the background on the room screen and fills the chart.</li><li><b>Consecutive nights, totals, M/F</b> come automatically from assignments and roster (gender from the companion list, matched by name).</li><li><b>Annex (Kissho/Zuiun/Ashibi) onsen pre-application</b>: ♨ toggle on annex guests → only applied person-nights are tallied at <b>×¥2,000</b> (room rate ¥17,000 is identical for main and annex). Onsen water is prepared on-site only when pre-applied. <b>The fee is collected via the Merit B2B settlement</b> (not billed on the guest invoice).</li></ul><h4>Output</h4>Screen preview + print. Numbers are full-width. <b>Date chips</b> let you view/print a single day (All = whole month). The remark row shows each team's <b>remark/local remark auto-translated to Japanese via DeepL</b> (original kept, cached). Requires a DeepL API key in the Supabase edge secret.<h4>Permissions / data</h4><b>shizu (Shizunoyado sheet) area</b> (split from print — assign individually in admin.html). Reads rooms, guest_members, passengers + shizu_onsen (onsen pre-application; shizu/room write)."},"inventory.html":{"ja":"<h4>この画面の役割</h4>F&B・客室の<b>在庫管理</b>。品目別の現在庫・適正在庫・不足アラート＋入出庫台帳。<h4>流れ</h4><ul><li><b>部署トグル</b>: F&B(厨房)・客室 — 部署別の品目のみ(URL <code>?dept=room</code>/<code>kitchen</code>)。</li><li>品目に<b>+入庫 / −使用 / 棚卸</b>を記録 → 現在庫を自動更新し台帳(直近履歴)に残す。</li><li>現在庫が適正在庫未満なら<b>不足アラート</b>。</li></ul><h4>権限・データ</h4>F&B=kitchen・客室=room エリア(URL dept で切替)。inv_items・inv_txns。","en":"<h4>What this screen does</h4><b>Stock management</b> for F&B and rooms. Per-item on-hand, par level, low-stock alert + in/out ledger.<h4>Flow</h4><ul><li><b>Department toggle</b>: F&B (kitchen) / rooms — shows only that department's items (URL <code>?dept=room</code>/<code>kitchen</code>).</li><li>Record <b>+in / −use / stocktake</b> on an item → on-hand auto-updates and is logged in the ledger (recent history).</li><li>Low-stock alert when on-hand is below par.</li></ul><h4>Permissions / data</h4>F&B = kitchen, rooms = room area (switched via URL dept). inv_items, inv_txns."},"settle.html":{"ja":"<h4>この画面の役割</h4>チェックアウト時の<b>明細書(御請求書)</b>。チーム別の請求・支払・残高。<h4>計算・判定</h4><ul><li><b>残高=請求合計−支払合計</b>。</li><li>未開設チーム=請求 0=<b>残高 ¥0</b>(クリックで請求を追加、アカウント自動開設)。</li><li>個人配分があれば folio をまとめ表示(チーム+個人の合計)。</li></ul><h4>主な用語</h4>現地追加料金(追加ラウンド・ミニバー等) — B2B 事前契約とは<b>別</b>。<h4>権限・データ</h4>settle エリア。folios・charges・payments。","en":"<h4>What this screen does</h4>The checkout <b>statement (御請求書)</b>. Charges, payments, and balance by team.<h4>Calculation & logic</h4><ul><li><b>Balance = total charges − total payments</b>.</li><li>Team with no folio = charges 0 = <b>balance ¥0</b> (click to add a charge; the account opens automatically).</li><li>If there is an individual split, folios are shown as a group (team + individual total).</li></ul><h4>Key terms</h4>On-site extra charges (extra rounds, minibar, etc.) — <b>separate</b> from the B2B pre-contract.<h4>Permission & data</h4>settle area. folios, charges, payments."},"settle_merit.html":{"ja":"<h4>この画面の役割</h4>メリット↔サイゼン <b>B2B 事前契約</b>の精算表。<h4>計算・判定</h4><ul><li><b>宿泊費=人数×泊数×施設単価</b>(ヤマナミリゾート・久住 14,000 / ガンジ 16,000 / 志津の宿 17,000)。</li><li><b>送迎費=人数×¥6,000</b>。</li><li>人数=<b>実際の名簿数</b>(予約 pax より優先)。控除・備考のみ別途保存。</li></ul><h4>主な用語</h4>B2B(現地追加料金と混同しないこと)。<h4>権限・データ</h4>settle エリア。","en":"<h4>What this screen does</h4>The <b>B2B pre-contract</b> settlement sheet between Merit and SaiZen.<h4>Calculation & logic</h4><ul><li><b>Lodging fee = headcount × nights × facility unit price</b> (Yamanami / Kuju 14,000 / Ganji 16,000 / Shizu 17,000).</li><li><b>Transfer fee = headcount × ¥6,000</b>.</li><li>Headcount = <b>actual roster count</b> (takes priority over the reserved pax). Only deductions and remarks are stored separately.</li></ul><h4>Key terms</h4>B2B (do not confuse with on-site extra charges).<h4>Permission & data</h4>settle area."},"pos.html":{"ja":"<h4>この画面の役割</h4>注文入力(簡易 POS)。チーム共通 + 個人配分。<h4>計算・判定</h4><ul><li><b>配分</b>: チーム共通 / 特定の1人 / N分の1 → charges + 個人 folio を自動生成。</li><li><b>厨房チケット</b>=配分に関係なく<b>全数量・チーム単位</b>。</li><li>会員バッジ=顧客等級・会員権区分・会員区分の3列 OR。</li></ul><h4>主な用語</h4>店舗(アウトレット)=フロント/レストラン・宴会/ゴルフショップ。<h4>チームQRからの流れ</h4>スマホ標準カメラで読み取り<b>ご精算ページが開いた場合</b>も、スタッフがログイン中なら上部に<b>スタッフモード</b>バーが表示され、[POS 注文]から入ると<b>そのチームが自動選択</b>されます(<code>?seq=</code>)。当日の滞在一覧に無くても直接検索して開きます。お客様が読み取った場合はバーは表示されません。<h4>権限・データ</h4>pos エリア。charges・folios。","en":"<h4>What this screen does</h4>Order entry (simple POS). Team default + individual split.<h4>Calculation & logic</h4><ul><li><b>Split</b>: team-shared / a specific person / split N ways → auto-generates charges + an individual folio.</li><li><b>Kitchen ticket</b> = <b>full quantity, by team</b> regardless of the split.</li><li>Member badge = OR of the three columns customer grade / membership type / member category.</li></ul><h4>Key terms</h4>Outlet = front desk / restaurant & banquet / pro shop.<h4>Team QR flow</h4>If a phone's default camera opens the <b>bill page</b> instead, a <b>Staff mode</b> bar appears at the top for logged-in staff; entering via [POS order] <b>auto-selects that team</b> (<code>?seq=</code>). Both paths open the team even if it is not in that day's in-house list. Guests never see the staff bar.<h4>Permission & data</h4>pos area. charges, folios."},"kitchen.html":{"ja":"<h4>この画面の役割</h4>厨房・バーの<b>注文チケット画面(KDS)</b>。<h4>計算・判定</h4><ul><li>チケットは<b>新規 → 受付 → 完了</b>の3段階(受付時に担当を記録)。</li><li>品目別の<b>調理ルーティング</b>(station): 厨房/バー/フロント。</li></ul><h4>権限・データ</h4>kitchen エリア。kitchen_tickets。","en":"<h4>What this screen does</h4>The <b>order ticket screen (KDS)</b> for the kitchen and bar.<h4>Calculation & logic</h4><ul><li>Tickets go through three stages: <b>new → accepted → done</b> (the handler is recorded on acceptance).</li><li>Per-item <b>cooking routing</b> (station): kitchen / bar / front.</li></ul><h4>Permission & data</h4>kitchen area. kitchen_tickets."},"menu.html":{"ja":"<h4>この画面の役割</h4>メニュー品目の管理(場所(venue)・ライン(category)別)。<h4>計算・判定</h4><ul><li><b>コード自動採番</b>=場所prefix+番号(<code>FR1</code>・<code>GS1</code>)。</li><li>すでに適用済みのコードは<b>ロック</b>(編集不可)。</li><li>すべての変更は履歴(change_log)に記録。</li></ul><h4>主な用語</h4><b>場所(venue)</b>=販売先・コードprefix / <b>ライン(category)</b>=精算集計の基準(<code>숙박</code>は画面に「ルーム」と表示)。<h4>権限・データ</h4>menuエリア。menu_items。","en":"<h4>What this screen does</h4>Manage menu items (by venue and line/category).<h4>Calculation & rules</h4><ul><li><b>Auto code numbering</b> = venue prefix + number (<code>FR1</code>, <code>GS1</code>).</li><li>Codes already in use are <b>locked</b> (not editable).</li><li>All changes are recorded in the history (change_log).</li></ul><h4>Key terms</h4><b>venue</b> = sales point / code prefix; <b>line (category)</b> = settlement aggregation basis (<code>숙박</code> shows as 'Room' on screen).<h4>Permission & data</h4>menu area. menu_items."},"board.html":{"ja":"<h4>この画面の役割</h4>部署<b>お知らせ</b> + <b>本日のサマリー</b>(JST基準のチェックイン・アウト・注文・売上の集計)。<h4>権限・データ</h4>閲覧=ログイン全員 / お知らせ作成・ピン・並べ替え=admin・manager / <b>削除=作成者本人またはマスター(admin)</b>。","en":"<h4>What this screen does</h4>Department <b>announcements</b> + <b>today's summary</b> (check-in/out, orders, revenue aggregated on JST basis).<h4>Permission & data</h4>Read = all logged-in users / writing, pinning, reordering = admin/manager / <b>deletion = author or master (admin)</b>."},"groupcodes.html":{"ja":"<h4>この画面の役割</h4><b>会員マスター(個人情報)</b>の管理 + 空きコードピッカー。<b>groupcodesエリア(admin または付与された担当者)</b>。<h4>計算・判定</h4><ul><li>グループコード3桁=<b>等級prefix + 英字(18種) + かな(33種)</b>。</li><li><b>空きコードピッカー</b>: 等級別18×33グリッド — <b>緑=空きコード</b>(0名、即時割当) / <b>アンバー=合流可能</b>(1〜3名) / グレー=4名以上。</li></ul><h4>主な用語</h4>Fプール=非会員。等級prefix=ダイヤ[D・M]・ゴールド[G]・EWRC[E・W・R・C]など。<h4>権限・データ</h4><b>groupcodesエリア(PII)</b> — admin.htmlで信頼できる担当者にのみ付与。member_codes。","en":"<h4>What this screen does</h4>Manage the <b>member master (personal info)</b> + empty-code picker. <b>groupcodes area (admin or granted staff)</b>.<h4>Calculation & rules</h4><ul><li>Group code 3 chars = <b>grade prefix + letter (18 kinds) + kana (33 kinds)</b>.</li><li><b>Empty-code picker</b>: 18×33 grid per grade — <b>green = empty code</b> (0 people, assign directly) / <b>amber = can join</b> (1-3 people) / gray = 4+ people.</li></ul><h4>Key terms</h4>F-pool = non-member. Grade prefix = Diamond [D, M], Gold [G], EWRC [E, W, R, C], etc.<h4>Permission & data</h4><b>groupcodes area (PII)</b> — grant to trusted staff in admin.html. member_codes."},"frontdesk.html":{"ja":"<h4>この画面の役割</h4>リアルタイムの<b>到着・出発・在室</b> + チーム別の部屋番号・残高・メモの統合状況。フロント=バー=レストランを1画面で(テーブル管理は未導入 — 名札は引き続き出力)。<h4>計算・判定</h4><ul><li>🛬チェックイン=<code>dep===오늘</code> / 🛫チェックアウト=<code>arr===오늘</code> / 🏨在室(連泊)=その間 / 🍽夕食=その日に泊まる全員。</li><li>残高=請求−支払の合算。<b>KPIクリック→該当ラインへスクロール</b>。</li><li><b>宿泊チップ</b>でリスト・KPIをフィルター。</li></ul><h4>🍽 本日夕食</h4>夕食カードを押すと<b>その日の夕食名簿が開きます</b>。人数は<b>夕食オーダーと同じルール</b>で、その日泊まる人数から<b>早期退室</b>と<b>アップグレード分</b>(基本の夕食が出ない)を引いた数です。チームごとに<b>早期退室 −N・UP −N・別注・⚠アレルギー・🔗運営チーム</b>が付き、<b>夕食除外</b>のチームは下に<b>理由とともに別枠</b>でまとまります(合計から除外)。<h4>客室メモ</h4>チーム詳細の見出しのすぐ下に、そのチームが使う<b>客室の未完了メモ</b>(🐛虫・🔧設備・📌その他)が表示されます。登録・完了は<b>客室清掃</b>画面で行います。<h4>ショートカット</h4>チームをクリック → 詳細で<b>備考(運営)・メモをその場で入力</b>(フォーカスを外すと自動保存・変更履歴記録。別のメモ画面に入る必要なし)。チームをクリック → 詳細から<b>精算</b>(そのチームを自動で開く)・<b>部屋割り</b>(その日付)・メモへジャンプ。<h4>🔔 確認が必要(後続対応)</h4>早期チェックアウトなどで<b>他の画面に後続作業</b>(例: 精算の返金)が発生すると、上部パネルに集まります。<b>[対応へ]</b>で該当画面(ディープリンク)へ直行し、終えたら<b>[完了]</b>で閉じます。未完了のN件はランディングの<b>🔔バッジ</b>にも表示され、どのPCからでも見えます。ログイン中の担当者なら誰でも完了できます。<h4>権限・データ</h4>front(フロントデスク)エリア。読み取り集計(データ変更なし) ・ 確認が必要(followups)はログイン全員が閲覧/完了。","en":"<h4>What this screen does</h4>Real-time <b>arrival/departure/in-house</b> + integrated status with room number, balance, and memo per team. Front desk = bar = restaurant on one screen (table management not introduced — nameplates still printed).<h4>Calculation & rules</h4><ul><li>🛬 check-in = <code>dep===오늘</code> / 🛫 check-out = <code>arr===오늘</code> / 🏨 in-house (consecutive nights) = in between / 🍽 dinner = everyone staying that day.</li><li>Balance = charges − payments summed. <b>Click a KPI → scroll to the relevant line</b>.</li><li>Filter the list and KPIs with <b>lodging chips</b>.</li></ul><h4>🍽 Dinner today</h4>Tap the dinner card to <b>open that day's dinner list</b>. The headcount follows <b>the same rule as the 夕食オーダー screen</b>: everyone staying that night minus <b>early checkouts</b> and <b>upgrade portions</b> (no standard dinner served). Each team shows <b>early out −N · UP −N · extra · ⚠allergy · 🔗op-team</b>, and <b>excluded</b> teams are grouped separately below <b>with their reason</b> (left out of the total).<h4>Room notes</h4>Open notes on the rooms this team occupies (🐛 pests · 🔧 fixtures · 📌 other) appear right under the team header in the detail panel. Add or close them on the <b>Housekeeping</b> screen.<h4>Shortcuts</h4>Click a team → in the detail, <b>type Remarks (ops) / Memo right there</b> (auto-saves on blur, logged; no need to open a separate memo page). Click a team → from the detail jump to <b>settlement</b> (opens that team automatically), <b>room assignment</b> (that date), or memo.<h4>🔔 Follow-up needed</h4>When an action such as an early checkout creates <b>follow-up work in another screen</b> (e.g. a settlement refund), it gathers in the top panel. <b>[Handle]</b> takes you straight to that screen (deep link); when finished, close it with <b>[Done]</b>. The count of open items also shows on the landing <b>🔔 badge</b>, so it is visible from any PC. Any logged-in staff member can mark it done.<h4>Permission & data</h4>front (front desk) area. Read-only aggregation (no data changes). Follow-ups are readable/closable by all logged-in users."},"admin.html":{"ja":"<h4>この画面の役割</h4>アカウントの<b>役割・エリア指定</b> + 登録申請の処理。<b>マスター専用</b>。<h4>計算・判定</h4><ul><li>役割 <b>admin / manager / staff</b> + エリア(step1・room・settle・pos・kitchen・menu・notes・stats)。</li><li><b>admin(マスター)=全通過</b> / <b>manager・staff=指定エリアのみ</b>(役割は区分、画面表示・アクセスは指定エリアのみ。マネージャーも自動通過なし)。経営統計(stats)=adminまたはstats指定者。</li></ul><h4>パスワード再設定</h4>担当者がパスワードを忘れた場合、<b>ログイン画面の「パスワードをお忘れですか？」</b>から本人が再設定メールを受け取れます(マスターの対応不要)。届かない場合は Dashboard <b>Authentication → Users → ⋯ → Send password recovery</b> で送信、または直接設定してください。⚠ リンクは1回限り・有効期限あり。<h4>権限・データ</h4>admin専用。user_access・access_requests。","en":"<h4>What this screen does</h4>Assign account <b>role and area</b> + process access requests. <b>Master only</b>.<h4>Calculation & rules</h4><ul><li>Role <b>admin / manager / staff</b> + area (step1, room, settle, pos, kitchen, menu, notes, stats).</li><li><b>admin (master) = all access</b> / <b>manager & staff = assigned areas only</b> (role is a label; visibility & access follow assigned areas — managers are not auto-passed). Exec stats = admin or stats holders.</li></ul><h4>Password reset</h4>If a staff member forgets their password, they can self-serve via <b>&quot;Forgot your password?&quot; on the login screen</b> (no master action needed). If the mail does not arrive, send it from Dashboard <b>Authentication &rarr; Users &rarr; &#8943; &rarr; Send password recovery</b>, or set the password directly. Note: the link is single-use and expires.<h4>Permission & data</h4>admin only. user_access, access_requests."},"stats.html":{"ja":"<h4>この画面の役割</h4>代表・部署長向けの<b>月/年 統合統計</b>。期間(今月・今年・昨年・直近12ヶ月・範囲)を選ぶと、送客・売上・稼働率・顧客構成を1画面に集計します。<b>読み取り専用</b>(データ変更なし)。<h4>計算・判定</h4><ul><li><b>送客</b>=現地チェックイン(<code>dep_date</code>)基準・人数=<b>予約人数</b>。宿泊施設別・出発地(ICN/PUS)別に分解。</li><li><b>B2B売上</b>=人数×泊数×施設単価+人数×¥6,000(ヤマナミ・久住 14,000 / ガンジ 16,000 / 志津 17,000)。</li><li><b>現地売上</b>=charges(取消除く・JST基準)、<b>現金/カード/未指定</b>に分離+区分別。</li><li><b>会員比率</b>=member_grade・member_class・member_div の3列OR(いずれか会員なら会員)、等級別。</li><li><b>客室稼働率</b>=使用ベッド泊 ÷(稼働客室定員×期間日数)。チェックイン月帰属の<b>近似値</b>。</li></ul><h4>主な用語</h4>B2B(メリット事前契約)と現地売上は<b>別</b>。稼働率はベッド(定員)基準。<h4>権限・データ</h4><b>statsエリア</b> — adminまたはstats指定者のみ(マネージャー自動通過なし)。集計RPC <code>exec_stats</code>(サーバ集計、security definer)。","en":"<h4>What this screen does</h4><b>Monthly/yearly consolidated stats</b> for executives. Pick a period (this month, this year, last year, last 12 months, range) and it aggregates arrivals, revenue, occupancy, and customer mix on one screen. <b>Read-only</b> (no data changes).<h4>Calculation / judgment</h4><ul><li><b>Arrivals</b> = on-site check-in (<code>dep_date</code>); pax = <b>reserved pax</b>. Broken down by lodging and origin (ICN/PUS).</li><li><b>B2B revenue</b> = pax × nights × facility rate + pax × ¥6,000 (Yamanami/Kuju 14,000 / Ganji 16,000 / Shizu 17,000).</li><li><b>On-site revenue</b> = charges (excl. voided, JST), split by <b>cash/card/unset</b> and by category.</li><li><b>Member ratio</b> = OR of the three columns member_grade/member_class/member_div, by grade.</li><li><b>Room occupancy</b> = used bed-nights ÷ (active room capacity × period days). Attributed to the check-in month, <b>approximate</b>.</li></ul><h4>Key terms</h4>B2B (Merit pre-contract) and on-site revenue are <b>separate</b>. Occupancy is bed (capacity) based.<h4>Permission / data</h4><b>stats area</b> — admin or stats holders only (managers are not auto-passed). Aggregation RPC <code>exec_stats</code> (server-side, security definer)."},"visitor_stats.html":{"ja":"<h4>この画面の役割</h4><b>訪問統計(ゴルフ場協会・県報告用)</b>。期間(日・週・月・年トグル)を選び<b>会員/非会員の訪問者数</b>を集計。<b>読み取り専用</b>。<h4>計算・判定</h4><ul><li><b>訪問</b>=同行者1人1滞在(現地チェックイン<code>dep_date</code>基準)=1延べ訪問。</li><li><b>会員判定</b>=顧客等級・会員権区分・会員区分の3列OR。</li><li><b>性別・年代(満年齢10歳区分)・会員別 訪問回数</b>に分解。</li><li>営業日報の<b>韓国メンバー/韓国ビジター(宿泊)</b>に対応。</li></ul><h4>権限・データ</h4><b>reportエリア</b> — adminまたはreport指定者のみ。集計RPC <code>visitor_stats</code>。","en":"<h4>What this screen does</h4><b>Visitor stats (golf association / prefecture report)</b>. Pick a period (day/week/month/year toggle) to aggregate <b>member/non-member visitor counts</b>. <b>Read-only</b>.<h4>Calculation</h4><ul><li><b>Visit</b> = 1 person-stay (on-site check-in <code>dep_date</code>) = 1 visit.</li><li><b>Member</b> = 3-column OR.</li><li>Broken down by <b>gender, age band (10-yr), per-member visit count</b>.</li><li>Maps to 営業日報 Korean member/visitor (lodging).</li></ul><h4>Permission / data</h4><b>report area</b> — admin or report holders only. RPC <code>visitor_stats</code>."},"audit.html":{"ja":"<h4>この画面の役割</h4>データの<b>整合性の異常</b>を印刷・実運用の前に一括点検します。<b>マスター(admin)専用</b>。[再検収]で実行 → 項目別の件数・サンプル(行事番号)を表示。<h4>点検項目</h4><ul><li><b>個人番号 欠番</b>: ネームタグの個人番号がチーム内1..Nの連番でない(過去importの残り)。印刷は自動採番で正常、再importでDBも是正。</li><li><b>名簿数 不一致</b>: guest_members ≠ passengers。</li><li><b>チーム内タグ重複</b> / <b>リンク切れ 客室割当</b>(FK切れ) / <b>客室定員超過</b>(ダブルブッキング)。</li></ul><h4>正常値</h4>リンク切れ・定員超過は<b>0が正常</b>(FK・定員トリガーが防止)。欠番・不一致は再importで是正。<h4>権限・データ</h4>admin専用。RPC <code>data_audit</code>(サーバ集計、security definer・is_adminガード)。読み取り専用。","en":"<h4>What this screen does</h4>Scans <b>data-integrity issues</b> in one pass before printing / real use. <b>Master (admin) only</b>. Run with [Re-audit] → shows per-check counts and samples (event numbers).<h4>Checks</h4><ul><li><b>Person-number gaps</b>: nametag numbers not a 1..N run within a team (leftover from older imports). Print auto-renumbers (correct); re-import fixes the DB too.</li><li><b>Roster count mismatch</b>: guest_members ≠ passengers.</li><li><b>Duplicate tag in team</b> / <b>broken-link room assignment</b> (broken FK) / <b>room over capacity</b> (double-booking).</li></ul><h4>Normal values</h4>Broken-link &amp; over-capacity are <b>0 when healthy</b> (FK / capacity trigger prevent them). Gaps &amp; mismatch are fixed by re-import.<h4>Permission / data</h4>admin only. RPC <code>data_audit</code> (server-side, security definer, is_admin guard). Read-only."},"watchlist.html":{"ja":"<h4>この画面の役割</h4>取込済みの<b>全予約</b>を<b>本人(氏名+生年)基準</b>でスキャンし、抜け道・異常パターンを検出します。<b>🔒 マスター級</b> — <b>watchエリア指定者のみ</b>(admin.htmlで信頼できる担当者にのみ付与、通常はマスター本人)。[再スキャン]で実行 → 種別ごとの一覧(氏名・会員可否・行事番号)。複数年が同じテーブルに蓄積されるため、<b>同じ人が昨年も同様の予約をしたか</b>が自動で見えます。<h4>検出種別</h4><ul><li><b>長期滞在(併合の疑い)</b>: 通常(最大7泊)を超える長期滞在 — 7+7を14泊にまとめた形跡。</li><li><b>連続予約・別名簿(裏技の疑い)</b>: 退室日=入室日で連結された2予約の名簿が異なり後ろが会員名義 — 非会員が会員特典を受けるパターン。</li><li><b>連続予約・同一名簿(名簿登録ミス)</b>: 連続する2予約に同じ名簿 — 14泊を7+7で登録し両方へ同一メンバーを入れたミス。</li><li><b>頻繁な結合予約の本人</b>: 複数チームを結合する予約に繰り返し登場。</li></ul><h4>しきい値</h4>長期=8泊以上 · 頻繁=結合3回以上 · 同一名簿=ジャカード0.6以上(広めに取り結果を見て調整)。名前検索で特定人の履歴のみ抽出。<h4>権限・データ</h4><b>watchエリア(マスター級・PII)</b> — admin.htmlで指定。bookings・passengers・print_overrides の<b>読み取り専用</b>クライアント集計(サーバ・データ変更なし)。※passengersはPIIのためサーバRLS上admin/managerのみ読取可 → 実務ではマスター本人のみへの付与を推奨。","en":"<h4>What this screen does</h4>Scans <b>all imported bookings</b> <b>by person (name + birth)</b> to detect loophole / anomaly patterns. <b>🔒 Master-level</b> — <b>watch-area holders only</b> (grant to trusted staff in admin.html; usually the master themselves). Run with [Re-scan] → per-type lists (name, member flag, event number). Since multiple years accumulate in one table, <b>whether the same person did it last year too</b> surfaces automatically.<h4>Detected types</h4><ul><li><b>Long stay (merge suspected)</b>: stays beyond the usual max of 7 nights — a trace of 7+7 merged into 14.</li><li><b>Consecutive · different roster (loophole suspected)</b>: two bookings joined checkout=checkin with different rosters, the later under a member — a non-member getting member perks.</li><li><b>Consecutive · same roster (registration error)</b>: same roster on two consecutive bookings — an error putting identical members on both halves of a 7+7 split.</li><li><b>Frequent grouping person</b>: recurs across many grouped bookings.</li></ul><h4>Thresholds</h4>Long = ≥8 nights · Frequent = ≥3 groups · Same roster = Jaccard ≥0.6 (set wide, tune by results). Name search filters to one person's history.<h4>Permission / data</h4><b>watch area (master-level · PII)</b> — assign in admin.html. Read-only client aggregation over bookings, passengers, print_overrides (no server / data changes). Note: passengers is PII (server RLS allows admin/manager reads), so in practice grant only to the master."}};
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
    // ⚠ innerHTML — 일본어 라벨에 후리가나 루비(<ruby><rt>)가 들어 있어 textContent 로 넣으면
    //    태그가 글자로 노출된다(applyLang 의 data-i18n 처리와 동일하게 innerHTML).
    b.innerHTML = t('so_update'); b.title = stripRuby(t('so_updateT'));
    b.style.cssText = 'font-family:inherit;font-size:12px;font-weight:800;color:#fff;background:#b5402f;'
      + 'border:1px solid #963427;border-radius:99px;padding:5px 12px;cursor:pointer;white-space:nowrap;'
      + 'animation:so-updp 1.8s ease-in-out infinite';
    b.addEventListener('click', function () { location.reload(); });
    box.insertBefore(b, box.firstChild);
  }
  // ── 팝업은 ESC 로 닫는다 (Min 2026-08) ─────────────────────────────────
  //  각 페이지가 만드는 오버레이(모달)를 공통으로 닫아준다. 페이지가 자체 ESC 처리를
  //  갖고 있으면 그쪽이 먼저 동작하고(캡처 아님), 남은 것만 여기서 정리한다.
  //  ⚠ 화면 chrome(로그인 카드·권한 차단·토스트·상단바·서랍)은 절대 닫지 않는다.
  var ESC_KEEP = ['so-guard', 'so-login', 'so-bar', 'so-footer', 'so-totop', 'ua-drawer'];
  function _escKeep(el) {
    if (el.id === 'toast') return true;
    for (var i = 0; i < ESC_KEEP.length; i++) {
      if (el.id === ESC_KEEP[i] || el.className && String(el.className).indexOf(ESC_KEEP[i]) >= 0) return true;
    }
    return false;
  }
  function mountEscClose() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      var nodes = document.body ? document.body.children : [];
      var top = null;
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.nodeType !== 1 || _escKeep(el)) continue;
        var cs = window.getComputedStyle(el);
        if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
        // 화면을 덮는 오버레이만(작은 고정 배지·버튼 제외)
        var r = el.getBoundingClientRect();
        if (r.width < window.innerWidth * 0.5 || r.height < window.innerHeight * 0.5) continue;
        top = el;   // 문서상 마지막 = 가장 위
      }
      if (top) { top.remove(); }
    });
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

  // ── 오른쪽 빠른 이동 레일 (Min 2026-08) ──────────────────────────────────
  //  아래로 한참 끌어야 하는 목록에서, 오른쪽에 항목 목차를 띄워 바로 건너뛴다.
  //  쓰는 쪽: __so_quickNav({ container:'#list', item:'.flcard', label: el => '09:25 TW287' })
  //   · 항목이 3개 미만이거나 화면이 좁으면(<1100px) 뜨지 않는다 — 없는 게 나은 상황.
  //   · 목록을 다시 그리면 MutationObserver 가 알아서 다시 만든다.
  //   · 지금 보고 있는 항목은 IntersectionObserver 로 강조한다.
  function quickNav(opts) {
    opts = opts || {};
    var cont = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
    if (!cont) return null;
    var itemSel = opts.item || ':scope > *';
    var labelFn = opts.label || function (el) { return (el.textContent || '').trim().slice(0, 8); };
    var MIN = opts.min || 3;
    var rail = document.getElementById('so-qnav');
    if (!rail) {
      rail = document.createElement('nav');
      rail.id = 'so-qnav';
      rail.setAttribute('aria-label', '빠른 이동');
      rail.style.cssText = 'position:fixed;right:10px;top:50%;transform:translateY(-50%);z-index:55;'
        + 'display:none;flex-direction:column;gap:3px;max-height:74vh;overflow:auto;padding:6px 5px;'
        + 'background:rgba(255,255,255,.92);border:1px solid var(--border,#d2d8cc);border-radius:11px;'
        + 'box-shadow:0 6px 18px rgba(20,40,15,.14);scrollbar-width:none';
      document.body.appendChild(rail);
    }
    var io = null;
    function build() {
      var items = [].slice.call(cont.querySelectorAll(itemSel));
      if (io) { io.disconnect(); io = null; }
      if (items.length < MIN || window.innerWidth < 1100) { rail.style.display = 'none'; rail.innerHTML = ''; return; }
      rail.innerHTML = '';
      var btns = [];
      items.forEach(function (el, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = String(labelFn(el, i) || (i + 1));
        b.title = String((opts.title ? opts.title(el, i) : b.textContent) || '');
        b.style.cssText = 'font-family:inherit;font-size:10.5px;font-weight:800;line-height:1.15;'
          + 'max-width:84px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
          + 'padding:5px 7px;border-radius:7px;border:1px solid transparent;background:transparent;'
          + 'color:var(--text2,#5d6650);cursor:pointer;text-align:right';
        b.addEventListener('click', function () {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        rail.appendChild(b); btns.push(b);
      });
      rail.style.display = 'flex';
      // 지금 보고 있는 항목 강조 + 레일 안에서도 그 버튼이 보이게
      io = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) {
          var i = items.indexOf(e.target); if (i < 0 || !btns[i]) return;
          if (e.isIntersecting) {
            btns.forEach(function (x) { x.style.background = 'transparent'; x.style.color = 'var(--text2,#5d6650)'; x.style.borderColor = 'transparent'; });
            btns[i].style.background = 'var(--accent,#647548)'; btns[i].style.color = '#fff';
            var r = btns[i].getBoundingClientRect(), rr = rail.getBoundingClientRect();
            if (r.top < rr.top || r.bottom > rr.bottom) btns[i].scrollIntoView({ block: 'nearest' });
          }
        });
      }, { rootMargin: '-15% 0px -70% 0px' });
      items.forEach(function (el) { io.observe(el); });
    }
    build();
    var t = null;
    var mo = new MutationObserver(function () { clearTimeout(t); t = setTimeout(build, 120); });
    mo.observe(cont, { childList: true, subtree: false });
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(build, 200); }, { passive: true });
    return { rebuild: build, destroy: function () { mo.disconnect(); if (io) io.disconnect(); rail.remove(); } };
  }
  window.__so_quickNav = quickNav;

  function boot() {
    mountHead();
    if (handleAuthRedirect()) { applyLang(); return; }   // 초대/재설정 모드면 비번 설정만
    mountAuth(); mountFooter(); mountNet(); applyLang(); guardPage(); mountConnToggle(); mountHelp(); mountToTop(); mountAudit(); mountUpdateCheck(); mountEscClose();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
