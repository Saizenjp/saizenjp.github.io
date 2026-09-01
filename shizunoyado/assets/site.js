/* 志津の宿  assets/site.js  ------------------------------------- */
(function () {
  'use strict';

  /* ---- 言語切替（ja / ko）。選択は localStorage に記憶 ---- */
  var KEY = 'shizu-lang';
  var root = document.documentElement;

  function detect() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === 'ja' || saved === 'ko') return saved;
    } catch (e) {}
    var n = (navigator.language || '').toLowerCase();
    return n.indexOf('ko') === 0 ? 'ko' : 'ja';
  }

  function apply(lang) {
    root.setAttribute('data-lang', lang);
    root.setAttribute('lang', lang === 'ko' ? 'ko' : 'ja');
    var btns = document.querySelectorAll('.langsw button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', btns[i].dataset.lang === lang ? 'true' : 'false');
    }
    /* title / description も切り替える */
    var t = document.querySelector('meta[name="title-' + lang + '"]');
    if (t) document.title = t.content;
    var d = document.querySelector('meta[name="description-' + lang + '"]');
    var m = document.querySelector('meta[name="description"]');
    if (d && m) m.content = d.content;
    try { localStorage.setItem(KEY, lang); } catch (e) {}
  }

  apply(detect());

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.langsw button');
    if (b) apply(b.dataset.lang);
  });

  /* ---- モバイルメニュー ---- */
  var burger = document.querySelector('.burger');
  if (burger) {
    burger.addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    });
    document.querySelectorAll('.gnav a').forEach(function (a) {
      a.addEventListener('click', function () {
        document.body.classList.remove('nav-open');
        burger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('nav-open')) burger.click();
    });
  }

  /* ---- 出現アニメーション（控えめなフェードイン） ---- */
  var rv = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window && rv.length) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('on'); io.unobserve(en.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    rv.forEach(function (el) { io.observe(el); });
  } else {
    rv.forEach(function (el) { el.classList.add('on'); });
  }

  /* ---- 写真が未配置のとき、代わりに枠と説明を出す ---- */
  function hideHero(img) { img.style.visibility = 'hidden'; }
  document.querySelectorAll('.hero > img').forEach(function (img) {
    img.addEventListener('error', function () { hideHero(img); });
    if (img.complete && img.naturalWidth === 0) hideHero(img);
  });
  function markEmpty(img) {
      var box = img.parentNode;
      box.classList.add('is-empty');
      if (!box.querySelector('.ph-label')) {
        var s = document.createElement('span');
        s.className = 'ph-label';
        s.textContent = img.getAttribute('src') + '  未配置';
        s.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
          'font-size:12px;letter-spacing:.08em;color:#8C8577;background:repeating-linear-gradient(45deg,#EEE9DF 0 12px,#E7E1D5 12px 24px);text-align:center;padding:10px';
        box.appendChild(s);
      }
      img.style.display = 'none';
  }
  document.querySelectorAll('.ratio > img').forEach(function (img) {
    img.addEventListener('error', function () { markEmpty(img); });
    if (img.complete && img.naturalWidth === 0) markEmpty(img);
  });

  /* ---- 問い合わせフォーム（mailto 方式のときだけ動きます） ----
     外部フォームサービスに切り替える場合は index の該当箇所のコメントを参照 */
  var form = document.getElementById('inquiry');
  if (form && form.dataset.mode === 'mailto') {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = new FormData(form);
      var L = root.getAttribute('data-lang') === 'ko';
      var lines = [];
      f.forEach(function (v, k) { lines.push(k + ': ' + v); });
      var subject = (L ? '[문의] 시즈노야도 홈페이지' : '【お問い合わせ】志津の宿ホームページ');
      var body = lines.join('\n');
      window.location.href = 'mailto:' + form.dataset.to +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);
    });
  }
})();
