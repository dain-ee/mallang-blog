/* 말랑블로그 (2026-11-14)
   «자기 블로그 글이 올라갔는지도 모를 수도 있거든 … 각 계정별로 한눈에»
   가족 비밀번호(나·엄마·아빠)로 들어오면 내 블로그에 「나」 표시를 하고, 세 블로그를 모두 보여 줘요.
   자료는 scripts/collect.js 가 15분마다 모아 서버(blog_get)에 올려 둔 것을 읽어요.
   11/14 «애니메이션 꼼꼼하게 넣어 줘 햅틱이랑 … 탭 전환할 때, 로딩될 때 … 로딩될 때 그 유령도» */
(() => {
  const CFG = window.BLOG_SYNC;
  const $ = (s, el = document) => el.querySelector(s);
  const main = $('#main'), tabbar = $('#tabbar'), me = $('#me'), root = $('#sheet-root');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString('ko-KR'));
  const LS = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
  const ORDER = { 나: 0, 엄마: 1, 아빠: 2 };
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let S = { code: LS.get('mb:code'), who: null, data: null, tab: 'home', blog: null, filter: 'all' };

  // ── 햅틱 (말랑대학·peel 과 같은 방식)
  // 아이폰: 사파리는 진동 API 가 없어서, 단추 위에 숨은 스위치(<input type=checkbox switch>)를 덮어
  //   손가락이 직접 누를 때 시스템 「톡」을 받아요(iOS 17.4+). 스크립트로 누르는 건 막혀 있어 꼭 덮개여야 해요.
  // 안드로이드(엄마 갤럭시 Z 플립): navigator.vibrate 로 종류마다 다른 진동.
  const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const VIB = { tap: 12, light: 8, open: 18, ok: [30, 40, 70], bad: [40, 50, 40], on: [20, 40, 20, 40, 60] };
  const hap = (k = 'tap') => { if (!IOS && navigator.vibrate) try { navigator.vibrate(VIB[k] || 12); } catch (e) {} };
  const HAP_SEL = 'button, [role="button"], .card.link, .prow';
  document.addEventListener('click', (e) => { const el = e.target.closest(HAP_SEL); if (el && !el.disabled && !el.closest('[data-nohap]')) hap(el.closest('.pad') ? 'light' : 'tap'); }, true);
  function hapWire() {
    document.querySelectorAll(HAP_SEL).forEach((el) => {
      if (el.querySelector(':scope > [data-haptic]') || el.disabled || el.closest('a[href], summary, label, [contenteditable], [data-nohap]') || el.querySelector('input, textarea, select, button, a, label, summary, [data-haptic]')) return;
      if (getComputedStyle(el).display === 'contents') return;
      const l = document.createElement('label'); l.setAttribute('data-haptic', ''); l.setAttribute('aria-hidden', 'true');
      l.style.cssText = 'position:absolute;inset:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent;border-radius:inherit;z-index:1';
      const sw = document.createElement('input'); sw.type = 'checkbox'; sw.setAttribute('switch', ''); sw.tabIndex = -1;
      sw.style.cssText = 'position:absolute;width:1px;height:1px;margin:0;visibility:hidden';
      sw.addEventListener('click', (e) => e.stopPropagation());
      l.appendChild(sw);
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.appendChild(l);
    });
  }
  if (IOS) new MutationObserver(() => { cancelAnimationFrame(hapWire.r); hapWire.r = requestAnimationFrame(hapWire); }).observe(document.body, { childList: true, subtree: true });

  const toast = (t) => { const el = $('#toast'); el.textContent = t; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2200); };
  async function rpc(fn, body) {
    const r = await fetch(`${CFG.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(r.status === 400 ? 'denied' : 'net'); const t = await r.text(); return t ? JSON.parse(t) : null;
  }

  // 시간 말
  const KST = (d) => new Date(new Date(d).getTime() + 9 * 3600e3);
  const ymd = (d) => KST(d).toISOString().slice(0, 10);
  const todayY = () => ymd(new Date());
  function ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 0) { const m = Math.round(-s / 60); return m < 60 ? `${m}분 뒤` : `${Math.round(m / 60)}시간 뒤`; }
    if (s < 60) return '방금'; if (s < 3600) return `${Math.floor(s / 60)}분 전`;
    if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
    const d = Math.floor(s / 86400); return d < 7 ? `${d}일 전` : `${+KST(iso).toISOString().slice(5, 7)}월 ${+KST(iso).toISOString().slice(8, 10)}일`;
  }
  const hm = (iso) => { const t = KST(iso).toISOString(); return `${+t.slice(11, 13) < 12 ? '오전' : '오후'} ${((+t.slice(11, 13) + 11) % 12) + 1}:${t.slice(14, 16)}`; };
  function dayLabel(y) {
    const t = todayY(), yd = ymd(Date.now() - 864e5);
    if (y === t) return '오늘'; if (y === yd) return '어제';
    const d = new Date(y + 'T00:00:00+09:00'); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`;
  }

  const blogs = () => (S.data && S.data.blogs ? [...S.data.blogs].sort((a, b) => (a.who === S.who ? -1 : b.who === S.who ? 1 : ORDER[a.who] - ORDER[b.who])) : []);
  const label = (b) => (b.who === S.who ? '나' : b.nick || b.who);
  // 「누구 블로그」: 나는 「내」, 엄마·아빠는 자기 블로그도 「엄마 블로그」 (11/14 «엄마 오늘 엄마 블로그잖아;;»)
  const owner = (b) => (b.who === S.who ? (S.who === '나' ? '내' : S.who) : b.who === '나' ? b.nick || '하노' : b.who);
  const chip = (b) => `<span class="chip ${b.who === S.who ? 'me' : ''}">${esc(label(b))}</span>`;
  const todayPosts = (b) => b.posts.filter((p) => ymd(p.at) === todayY());
  const cnt = (n) => (n == null ? '–' : `<span data-to="${+n}">${fmt(n)}</span>`);

  // ── 움직임: 화면이 바뀔 때 카드가 차례로 떠오르고, 숫자는 0부터 세어 올라가요
  function animate(kind = 'in') {
    if (kind === 'none') return;
    main.classList.remove('anim', 'in', 'in-r', 'in-l'); void main.offsetWidth;
    [...main.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 10)));
    main.querySelectorAll('.plist, .list').forEach((pl) => [...pl.children].forEach((r, j) => r.style.setProperty('--j', Math.min(j, 8))));
    main.classList.add('anim', kind === 'fwd' ? 'in-r' : kind === 'back' ? 'in-l' : 'in');
    clearTimeout(animate.t); animate.t = setTimeout(() => main.classList.remove('anim', 'in', 'in-r', 'in-l'), 2000);
    countUp();
  }
  function countUp() {
    if (RM) return;
    main.querySelectorAll('[data-to]').forEach((el) => {
      const to = +el.dataset.to; if (!to) return;
      const t0 = performance.now() + 120, d = 900;
      el.textContent = '0';
      const step = (t) => { const p = Math.max(0, Math.min(1, (t - t0) / d)), e = 1 - Math.pow(1 - p, 4); el.textContent = fmt(Math.round(to * e)); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }

  // ── 첫 화면 유령 (로딩) · 다시 들어올 때는 위쪽 가는 줄만
  const T0 = performance.now();
  function splashOff(cb) {
    const s = $('#splash'); if (!s || s.dataset.out) return cb && cb();
    s.dataset.out = '1';
    setTimeout(() => { s.classList.add('out'); cb && cb(); setTimeout(() => s.remove(), 700); }, Math.max(0, 1100 - (performance.now() - T0)));
  }
  async function refresh() {
    if (!S.code || refresh.on) return; refresh.on = true;
    document.body.classList.add('loading'); const t = performance.now();
    try { await load(); await wait(Math.max(0, 700 - (performance.now() - t))); render('none'); } catch (e) {}
    finally { refresh.on = false; document.body.classList.remove('loading'); }
  }

  // ── 비밀번호
  function lockView(msg) {
    tabbar.hidden = true; me.hidden = true; drawTabs.last = null;
    let pin = '', busy = false;
    main.innerHTML = `<div class="lock"><img class="gh" id="lock-gh" src="assets/ghost/hello.webp" alt=""><h1>말랑블로그</h1><p>${esc(msg || '가족 비밀번호 4자리를 눌러 주세요')}</p>
      <div class="pins" id="pins">${[0, 1, 2, 3].map((k) => `<i style="--k:${k}"></i>`).join('')}</div>
      <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-n="${n}">${n}</button>`).join('')}<span></span><button data-n="0">0</button><button class="fn" data-n="del">지우기</button></div></div>`;
    const pins = $('#pins'), gh = $('#lock-gh');
    const draw = () => [...pins.children].forEach((i, k) => i.classList.toggle('on', k < pin.length));
    main.querySelector('.pad').onclick = async (e) => {
      const n = e.target.closest('button'); if (!n || busy) return;
      if (n.dataset.n === 'del') pin = pin.slice(0, -1); else if (pin.length < 4) pin += n.dataset.n;
      draw();
      if (pin.length === 4) {
        busy = true; pins.classList.add('wait');
        try {
          await load(pin); LS.set('mb:code', pin); S.code = pin;
          pins.classList.remove('wait'); pins.classList.add('ok'); gh.src = 'assets/ghost/yay.webp'; hap('ok');
          await wait(420); S.tab = 'home'; render('in');
        } catch (x) {
          pins.classList.remove('wait'); pins.classList.add('bad'); gh.src = 'assets/ghost/oops.webp'; hap('bad');
          setTimeout(() => { pins.classList.remove('bad'); pin = ''; draw(); busy = false; }, 520);
          setTimeout(() => { gh.src = 'assets/ghost/hello.webp'; }, 1300);
          if (x.message !== 'denied') toast('인터넷 연결을 확인해 주세요');
        }
      }
    };
    animate('in');
  }

  async function load(code) {
    const r = await rpc('blog_get', { p_code: code || S.code });
    S.who = r.who; S.data = r.data; S.data.updated_at = r.updated_at;
    try { LS.set('mb:cache', JSON.stringify({ who: r.who, data: r.data })); } catch (e) {}
  }

  // ── 화면
  const ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" fill="currentColor"/></svg>',
    feed: '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="4" fill="currentColor"/><path d="M8 9h8M8 12.5h8M8 16h5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5a6 6 0 0 0-6 6v3.6L4.6 16a.9.9 0 0 0 .8 1.3h13.2a.9.9 0 0 0 .8-1.3L18 13.1V9.5a6 6 0 0 0-6-6Z" fill="currentColor"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5.5" width="16" height="14.5" rx="3.5" fill="currentColor"/><path d="M8.5 3.5v3.5M15.5 3.5v3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="m9 13.5 2.2 2.2 4-4.2" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fam: '<svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8.5" r="3.6" fill="currentColor"/><path d="M2.6 19.5c.6-3.6 3.2-5.8 6.4-5.8s5.8 2.2 6.4 5.8z" fill="currentColor"/><circle cx="17" cy="9.2" r="2.7" fill="currentColor" opacity=".5"/><path d="M16.6 13.9c2.7.2 4.3 2.2 4.8 5.6h-4.2c-.2-2-.8-3.9-2-5.2.4-.2.9-.4 1.4-.4z" fill="currentColor" opacity=".5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" fill="currentColor"/><path d="M12 7.5V12l3 2" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    person: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8.5" r="4" fill="currentColor"/><path d="M4.5 20c.7-4 3.7-6.5 7.5-6.5s6.8 2.5 7.5 6.5z" fill="currentColor"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5v11M8 7.5l4-4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 11H6.5a2 2 0 0 0-2 2v5.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V13a2 2 0 0 0-2-2h-1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };
  window.ICON_P = ICON.person;
  const TABS = [['home', '홈'], ['feed', '올라간 글'], ['bell', '알림']];
  function drawTabs(kind) {
    tabbar.hidden = false;
    const cur = S.blog ? null : S.tab, pop = kind !== 'none' && cur && cur !== drawTabs.last;
    tabbar.innerHTML = TABS.map(([k, t]) => `<button class="${cur === k ? 'on' : ''}${cur === k && pop ? ' pop' : ''}" data-t="${k}">${ICON[k]}<span>${t}</span></button>`).join('');
    drawTabs.last = cur;
  }
  tabbar.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.t === S.tab && !S.blog) return main.scrollTo({ top: 0, behavior: 'smooth' }); S.tab = b.dataset.t; S.blog = null; main.scrollTo(0, 0); render('in'); };
  $('#brand').onclick = () => { S.tab = 'home'; S.blog = null; main.scrollTo(0, 0); render('in'); };
  const myBlog = () => S.data && S.data.blogs.find((x) => x.who === S.who);
  const meName = () => { const ns = (S.data ? S.data.blogs : []).filter((x) => x.who === S.who && x.nick).map((x) => x.nick); return `나${ns.length ? ' · ' + ns.join('·') : ''}`; }; // 11/14 «엄마에겐 엄마가 나야» — 들어온 사람은 언제나 「나」

  // ── 아래에서 올라오는 창
  function openSheet(html) {
    root.innerHTML = `<div class="dim"></div><div class="sheet" role="dialog"><i class="grab"></i>${html}</div>`;
    hap('open');
    root.querySelector('.dim').onclick = () => closeSheet();
  }
  function closeSheet(cb) {
    const s = root.querySelector('.sheet'); if (!s) return cb && cb();
    root.querySelector('.dim').classList.add('out'); s.classList.add('out');
    setTimeout(() => { root.innerHTML = ''; cb && cb(); }, 230);
  }
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  // 「나」 단추: 누가 들어와 있는지 보여 주는 창 (11/14 «나 누르면 내가 누구인지 … 나 하노 이런 식으로»)
  me.onclick = () => {
    const b = myBlog();
    openSheet(`${b && b.photo ? `<img class="pf" src="${esc(b.photo)}" alt="" onerror="this.src='assets/ghost/hello.webp'">` : '<img class="gh-m" src="assets/ghost/hello.webp" alt="">'}
      <h2>${esc(meName())}</h2><p>${esc(S.who)}로 들어와 있어요${b ? `<br>${esc(b.name)} · ${esc(b.id)}` : ''}</p>
      <button class="btn" id="sh-my">내 블로그 보기</button><button class="btn gray" id="sh-out">다른 가족으로 들어가기</button><button class="btn gray" id="sh-x">닫기</button>`);
    $('#sh-x').onclick = () => closeSheet();
    $('#sh-my').onclick = () => closeSheet(() => { if (b) { S.blog = b.id; main.scrollTo(0, 0); render('fwd'); } });
    $('#sh-out').onclick = () => closeSheet(logout);
  };
  function logout() { LS.set('mb:code', null); LS.set('mb:cache', null); S = { ...S, code: null, who: null, data: null, blog: null, tab: 'home' }; lockView(); }

  function render(kind = 'in') {
    if (!S.data) return lockView();
    me.hidden = false; { const b = myBlog(); me.innerHTML = `${b && b.photo ? `<img src="${esc(b.photo)}" alt="" onerror="this.remove()">` : ''}<span>${esc(meName())}</span>`; }
    drawTabs(kind);
    if (S.blog) detailView(S.data.blogs.find((b) => b.id === S.blog));
    else ({ home: homeView, feed: feedView, bell: bellView })[S.tab]();
    animate(kind);
  }

  // 어디서 왔나요 (11/14 «검색인지 메인 홈인지 … 너무 어려운 말 쓰지 말고 딱 간단하게»)
  const IN_C = { '검색': 'var(--g)', '네이버 첫 화면': '#3182f6', '블로그 안': '#ffb331', '다른 곳': 'var(--t4)' };
  function inflowBox(b) {
    const f = b.inflow; if (!f || !f.total) return '';
    const isToday = f.date === todayY(), when = isToday ? `오늘 ${hm(f.at)} 기준` : '어제';
    const pc = (n) => Math.round((n / f.total) * 100);
    return `<div class="inflow"><div class="if-h"><b>어디서 왔나요</b><span>${esc(when)}</span></div>
      <div class="if-bar">${f.parts.map((p) => `<i style="flex:${p.n};background:${IN_C[p.k] || 'var(--t4)'}"></i>`).join('')}</div>
      <div class="if-lg">${f.parts.map((p) => `<span><i style="background:${IN_C[p.k] || 'var(--t4)'}"></i>${esc(p.k)} <b>${pc(p.n)}%</b></span>`).join('')}</div></div>`;
  }

  function blogCard(b) {
    const last = b.posts[0], tp = todayPosts(b).length;
    const fresh = last && Date.now() - new Date(last.at) < 6 * 3600e3;
    return `<div class="card link" data-blog="${esc(b.id)}">
      <div class="blog-h"><img class="ava" src="${esc(b.photo)}" alt="" onerror="this.style.visibility='hidden'">
        <div class="nm"><b>${esc(b.name)} ${chip(b)}</b><span>${esc(owner(b))} 블로그 · ${esc(b.id)}</span></div><span class="chev">›</span></div>
      <div class="stats"><div><div class="k">오늘 방문자</div><div class="v big num">${cnt(b.today)}</div></div>
        <div><div class="k">오늘 올린 글</div><div class="v num">${tp}개</div></div>
        <div><div class="k">이웃</div><div class="v num">${cnt(b.neighbors)}</div></div></div>
      ${inflowBox(b)}
      ${(b.reserved || []).length ? `<div class="last res"><span class="dot live blink"></span><div class="t"><b>예약 ${b.reserved.length}개 · 다음 글 ${hm(b.reserved[0].at)}</b><span>${esc(b.reserved[0].title)}</span></div></div>` : ''}
      ${last ? `<div class="last"><span class="dot ${fresh ? 'live' : 'old'}"></span><div class="t"><b>${esc(last.title)}</b><span>마지막 글 · ${ago(last.at)}</span></div></div>` : `<div class="last"><span class="dot old"></span><div class="t"><b>아직 올린 글이 없어요</b></div></div>`}
    </div>`;
  }

  function homeView() {
    const L = blogs(), mine = L.find((b) => b.who === S.who), mineV = L.filter((b) => b.who === S.who).reduce((s, b) => s + (b.today || 0), 0); // 블로그가 둘이면 합쳐서
    const vis = L.reduce((s, b) => s + (b.today || 0), 0), cn = L.reduce((s, b) => s + todayPosts(b).length, 0);
    const gh = cn ? 'yay' : 'idle';
    const hi = mine ? `오늘 ${esc(owner(mine))} 블로그에<br>${mineV ? `<b>${cnt(mineV)}명</b>이 다녀갔어요` : '아직 다녀간 사람이 없어요'}` : '블로그 소식이에요';
    main.innerHTML = `<div class="hello-wrap"><img class="gh-h" src="assets/ghost/${gh}.webp" alt=""><h1 class="hello">${hi}</h1></div>
      ${guideBanner()}
      ${earnCard(L)}
      ${adCard()}
      <div class="sec-h"><h2>우리 가족 블로그</h2></div>
      ${L.map(blogCard).join('')}
      <div class="sec-h"><h2>방금 올라간 글</h2><button class="more" data-go="feed">전체 보기</button></div>
      <div class="card plist">${postRows(allPosts().slice(0, 5))}</div>
      <p class="upd">${S.data.updated ? `${ago(S.data.updated) === '방금' ? '방금' : ago(S.data.updated) + '에'} 새로 모았어요 · 15분마다 바뀌어요` : ''}</p>`;
    bind();
  }

  // 가족별 번 돈 (11/14 «가족별로 번 돈 이게 가장 중요해») · 자료: data.earn = { 나: {month, today, total, at}, … }
  const won = (n) => `${cnt(n)}<small>원</small>`;
  function earnCard(all) {
    const L = all.filter((b) => b.who !== '아빠'); // 11/14 사용자 결정: 아빠는 빼고 나·엄마만
    const E = (S.data && S.data.earn) || {}, has = L.filter((b) => E[b.who] && E[b.who].month != null);
    const sum = has.reduce((s, b) => s + (+E[b.who].month || 0), 0), sumT = has.reduce((s, b) => s + (+E[b.who].today || 0), 0);
    const row = (b) => { const e = E[b.who];
      const right = e && e.month != null
        ? `<b class="num">${won(e.month)}</b><span>${e.today != null ? `오늘 +${fmt(e.today)}원` : e.at ? `${esc(ago(e.at))} 기준` : '이번 달'}</span>`
        : `<b class="num">${won(0)}</b><span>이번 달</span>`;
      return `<div class="er"><img class="ava r" src="${esc(b.photo)}" alt="" onerror="this.style.visibility='hidden'"><div class="nm"><b>${esc(b.who === '나' ? (S.who === '나' ? '나' : b.nick || '하노') : b.who)}${b.who === S.who && S.who !== '나' ? ' <span class="chip me">나</span>' : ''}</b><span>${esc(b.name)}</span></div><div class="amt">${right}</div></div>`; };
    return `<div class="card earn"><div class="k">이번 달 가족이 번 돈</div>
      <div class="tot num">${won(sum)}</div><div class="sub">${sumT ? `오늘 +${fmt(sumT)}원` : '이번 달 합계'}</div>
      <div class="list">${L.map(row).join('')}</div>
</div>`;
  }

  const allPosts = () => blogs().flatMap((b) => b.posts.map((p) => ({ ...p, b }))).sort((a, b) => b.at.localeCompare(a.at));
  function postRows(L) {
    if (!L.length) return '<div class="empty"><img class="gh-s" src="assets/ghost/sleepy.webp" alt="">아직 올라간 글이 없어요</div>';
    return L.map((p) => `<a class="prow" href="${esc(p.link)}" target="_blank" rel="noopener">${p.img ? `<img class="th" src="${esc(p.img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
      <div class="t"><b>${esc(p.title)}</b><span>${chip(p.b)} ${hm(p.at)}${p.cat ? ' · ' + esc(p.cat) : ''}${p.reserved ? ' · 예약 글' : ''}</span></div></a>`).join('');
  }

  const upcoming = () => blogs().flatMap((b) => (b.reserved || []).map((r) => ({ ...r, b }))).filter((r) => S.filter === 'all' || r.b.id === S.filter).sort((a, b) => a.at.localeCompare(b.at));
  const resRows = (L) => L.map((r) => `<div class="prow"><div class="th clock">${hm(r.at).split(' ')[1]}</div><div class="t"><b>${esc(r.title)}</b><span>${chip(r.b)} ${dayLabel(ymd(r.at))} ${hm(r.at)}에 올라가요</span></div></div>`).join('');
  function feedView() {
    const L = blogs();
    const body = () => {
      const posts = allPosts().filter((p) => S.filter === 'all' || p.b.id === S.filter);
      const days = {}; for (const p of posts) (days[ymd(p.at)] = days[ymd(p.at)] || []).push(p);
      return `${upcoming().length ? `<div class="day-h"><span class="dot live blink"></span>올라갈 예정 · ${upcoming().length}개</div><div class="card plist">${resRows(upcoming())}</div>` : ''}
      ${Object.keys(days).sort().reverse().map((d) => `<div class="day-h">${dayLabel(d)} · ${days[d].length}개</div><div class="card plist">${postRows(days[d])}</div>`).join('') || '<div class="card empty">아직 올라간 글이 없어요</div>'}`;
    };
    main.innerHTML = `<div class="hello-wrap"><img class="gh-h" src="assets/ghost/focus.webp" alt=""><h1 class="hello">올라간 글</h1></div>
      <div class="filters"><i class="pill"></i><button class="${S.filter === 'all' ? 'on' : ''}" data-f="all">전체</button>${L.map((b) => `<button class="${S.filter === b.id ? 'on' : ''}" data-f="${esc(b.id)}">${esc(L.filter((x) => x.who === b.who).length > 1 ? b.nick || b.name : label(b))}</button>`).join('')}</div>
      <div class="feed-body">${body()}</div>
      <p class="upd">블로그마다 최근 30개까지 보여요</p>`;
    // 11/14 «그냥 옆으로 해야지» — 필터는 검은 알약만 옆으로 미끄러지고, 아래 목록만 살짝 바뀐다(화면 전체를 다시 그리지 않음)
    const F = main.querySelector('.filters'), pill = F.querySelector('.pill');
    const place = (still) => { const on = F.querySelector('button.on'); if (!on) return; if (still) pill.style.transition = 'none';
      pill.style.width = on.offsetWidth + 'px'; pill.style.transform = `translateX(${on.offsetLeft}px)`; if (still) { void pill.offsetWidth; pill.style.transition = ''; } };
    requestAnimationFrame(() => place(true));
    F.onclick = (e) => {
      const b = e.target.closest('button'); if (!b || b.dataset.f === S.filter) return;
      S.filter = b.dataset.f; F.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); place(false);
      b.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      const fb = main.querySelector('.feed-body'); fb.innerHTML = body(); fb.classList.remove('swap'); void fb.offsetWidth; fb.classList.add('swap');
    };
  }

  function detailView(b) {
    if (!b) { S.blog = null; return homeView(); }
    const days = []; for (let i = 6; i >= 0; i--) days.push(ymd(Date.now() - i * 864e5));
    const H = b.hist || {}, max = Math.max(1, ...days.map((d) => H[d] || 0));
    const known = days.filter((d) => H[d] != null).length;
    main.innerHTML = `<button class="back" id="back">‹ 뒤로</button>
      <div class="card" style="margin-top:8px"><div class="blog-h"><img class="ava" src="${esc(b.photo)}" alt="" onerror="this.style.visibility='hidden'"><div class="nm"><b>${esc(b.name)} ${chip(b)}</b><span>${esc(b.intro || b.id).replace(/\n/g, ' ')}</span></div></div>
        <div class="stats"><div><div class="k">오늘 방문자</div><div class="v big num">${cnt(b.today)}</div></div><div><div class="k">전체 방문자</div><div class="v num">${cnt(b.total)}</div></div><div><div class="k">이웃</div><div class="v num">${cnt(b.neighbors)}</div></div></div>
        <a class="btn sub" style="margin-top:18px" href="${esc(b.url)}" target="_blank" rel="noopener">블로그 열기</a></div>
      <div class="sec-h"><h2>최근 7일 방문자</h2></div>
      <div class="card"><div class="bars">${days.map((d, k) => `<div class="b ${d === todayY() ? 'today' : ''}" style="--k:${k}"><u class="num">${H[d] != null ? fmt(H[d]) : ''}</u><i style="height:${H[d] != null ? Math.max(4, Math.round((H[d] / max) * 96)) : 0}px"></i><em>${d === todayY() ? '오늘' : +d.slice(8)}</em></div>`).join('')}</div>
        ${known < 7 ? '<p class="note">말랑블로그를 연 날부터 하루씩 쌓여요. 오늘은 지금까지 다녀간 수예요.</p>' : ''}</div>
      ${(b.reserved || []).length ? `<div class="sec-h"><h2>올라갈 예정</h2><span class="more">${b.reserved.length}개</span></div><div class="card plist">${resRows(b.reserved.map((r) => ({ ...r, b })))}</div>` : ''}
      <div class="sec-h"><h2>올린 글</h2><span class="more">${b.posts.length}개</span></div>
      <div class="card plist">${postRows(b.posts.map((p) => ({ ...p, b })))}</div>`;
    $('#back').onclick = () => { S.blog = null; render('back'); };
  }

  // ── 알림 (11/14 «토스에서 이렇게 하니 굉장히 안 예쁘다» → 토스 설정처럼 아이콘 · 한 줄 설명 · 스위치)
  const PUSH_OK = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const b64u = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
  const devId = () => { let id = LS.get('mb:dev'); if (!id) { id = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2); LS.set('mb:dev', id); } return id; };
  async function pushOn() {
    const reg = await navigator.serviceWorker.register('sw.js');
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('perm');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(CFG.vapid) });
    await rpc('blog_sub', { p_code: S.code, p_id: devId(), p_sub: sub.toJSON() });
    LS.set('mb:push', '1');
  }
  async function pushOff() {
    try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && (await reg.pushManager.getSubscription()); if (sub) await sub.unsubscribe(); } catch (e) {}
    await rpc('blog_sub', { p_code: S.code, p_id: devId(), p_sub: null }).catch(() => {});
    LS.set('mb:push', null);
  }
  const li = (ic, color, title, desc, right = '', cls = '') => `<div class="li ${cls}"><span class="ic ${color}">${ICON[ic]}</span><div class="tx"><b>${title}</b>${desc ? `<span>${desc}</span>` : ''}</div>${right}</div>`;
  function bellView(justOn) {
    const on = LS.get('mb:push') === '1';
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const fam = blogs().filter((b) => b.who !== S.who).map((b) => (b.who === '나' ? b.nick || '하노' : b.who)).join('·');
    let top;
    if (!PUSH_OK && ios && !standalone()) top = `<div class="card list">${li('share', 'b', '먼저 홈 화면에 추가해 주세요', '아이폰은 홈 화면 앱에서만 알림이 와요', '', 'wrap')}${li('share', 'gray', '사파리 공유 버튼 → 홈 화면에 추가', '홈 화면의 말랑블로그로 다시 들어와 주세요', '', 'wrap')}</div>`;
    else if (!PUSH_OK) top = `<div class="card list">${li('bell', 'gray', '이 브라우저는 알림을 못 받아요', '휴대폰 사파리(홈 화면 앱)나 크롬에서 열어 주세요', '', 'wrap')}</div>`;
    else top = `<div class="card list">${li('bell', 'g' + (justOn ? ' ring' : ''), '새 글 알림', on ? '켜져 있어요 · 글이 올라가면 바로 알려 드려요' : '글이 올라가면 바로 알려 드려요', `<button class="sw ${on ? 'on' : ''}${justOn ? ' just' : ''}" id="sw" role="switch" aria-checked="${on}" aria-label="새 글 알림"></button>`)}</div>`;
    main.innerHTML = `<div class="hello-wrap"><img class="gh-h" src="assets/ghost/peek.webp" alt=""><h1 class="hello">알림</h1></div>${top}
      <div class="day-h">어떤 알림이 오나요?</div>
      <div class="card list">${li('cal', 'g', '예약한 글이 올라갔어요', '예약해 둔 내 글이 실제로 올라가면')}${li('fam', 'b', '가족 새 글', `${esc(fam)} 블로그에 새 글이 올라오면`)}${li('clock', 'a', '15분마다 확인', '새 글이 있는지 알아서 살펴봐요')}</div>
      <div class="day-h">들어와 있는 사람</div>
      <div class="card list"><button class="li link" id="logout" type="button"><span class="ic gray">${myBlog() && myBlog().photo ? `<img src="${esc(myBlog().photo)}" alt="" onerror="this.replaceWith(document.createRange().createContextualFragment(ICON_P))">` : ICON.person}</span><div class="tx"><b>${esc(meName())}</b><span>${esc(S.who)}로 들어와 있어요</span></div><span class="act">바꾸기<i>›</i></span></button></div>`;
    $('#logout').onclick = logout;
    const sw = $('#sw');
    if (sw) sw.onclick = async () => {
      const turnOn = !sw.classList.contains('on');
      sw.disabled = true; sw.classList.toggle('on', turnOn);
      try {
        if (turnOn) { await pushOn(); hap('on'); toast('이제 새 글이 올라가면 알려 드려요'); bellView(true); }
        else { await pushOff(); toast('알림을 껐어요'); bellView(); }
      } catch (e) { hap('bad'); toast(e.message === 'perm' ? '설정에서 알림을 허용해 주세요' : '알림을 켜지 못했어요'); bellView(); }
    };
  }

  // ── 홈 화면 앱 + 알림 켜기 안내 (11/14 «애플이면 사파리에서 어떻게, 갤럭시면 어떻게 … 다 했다고 하면 배너 지워지게»)
  const guideDone = () => LS.get('mb:guide') === 'done' || LS.get('mb:push') === '1';
  function guideBanner() {
    if (guideDone()) return '';
    return `<button class="card guide-b" id="guide-b" type="button"><img src="assets/ghost/hello.webp" alt=""><div class="tx"><b>새 글 알림 받기</b><span>휴대폰 홈 화면에 말랑블로그를 추가해 주세요 · 1분이면 돼요</span></div><span class="chev">›</span></button>`;
  }
  const GUIDE = {
    ios: { name: '아이폰', steps: [
      ['<b>사파리</b>로 이 주소를 열어요', '카카오톡 안에서 열렸다면 오른쪽 아래 ⋯ → 「Safari로 열기」'],
      ['아래쪽 가운데 <b>공유 버튼</b>을 눌러요', '네모 위로 화살표가 나온 모양이에요'],
      ['<b>「홈 화면에 추가」</b>를 누르고, 오른쪽 위 <b>「추가」</b>', '안 보이면 목록을 아래로 내려 보세요'],
      ['홈 화면에 생긴 <b>말랑블로그</b> 아이콘으로 다시 열어요', '비밀번호를 한 번 더 넣어요'],
      ['아래 <b>알림</b> 탭 → <b>새 글 알림</b> 켜기 → <b>「허용」</b>', '이제 글이 올라가면 알림이 와요'],
    ] },
    and: { name: '갤럭시', steps: [
      ['<b>삼성 인터넷</b>이나 <b>크롬</b>으로 이 주소를 열어요', '카카오톡 안에서 열렸다면 오른쪽 위 ⋮ → 「다른 브라우저로 열기」'],
      ['메뉴를 눌러요', '삼성 인터넷은 오른쪽 아래 ≡ · 크롬은 오른쪽 위 ⋮'],
      ['<b>「현재 페이지 추가 → 홈 화면」</b>', '크롬은 「홈 화면에 추가」 또는 「앱 설치」 → 「설치」'],
      ['홈 화면에 생긴 <b>말랑블로그</b> 아이콘으로 열어요', '비밀번호를 한 번 더 넣어요'],
      ['아래 <b>알림</b> 탭 → <b>새 글 알림</b> 켜기 → <b>「허용」</b>', '이제 글이 올라가면 알림이 와요'],
    ] },
  };
  function openGuide(dev) {
    dev = dev || (IOS ? 'ios' : 'and');
    const g = GUIDE[dev];
    openSheet(`<h2>새 글 알림 받는 법</h2>
      <div class="seg" id="g-seg"><i class="pill"></i>${Object.keys(GUIDE).map((k) => `<button type="button" data-d="${k}" class="${k === dev ? 'on' : ''}">${GUIDE[k].name}</button>`).join('')}</div>
      <ol class="steps">${g.steps.map((st, i) => `<li style="--n:${i}"><i>${i + 1}</i><div><b>${st[0]}</b><span>${st[1]}</span></div></li>`).join('')}</ol>
      ${standalone() ? '<button class="btn" id="g-bell">알림 켜러 가기</button>' : ''}
      <button class="btn ${standalone() ? 'gray' : ''}" id="g-done">다 했어요</button><button class="btn gray" id="g-x">나중에 할게요</button>`);
    const seg = $('#g-seg'), pill = seg.querySelector('.pill'), on = seg.querySelector('.on');
    pill.style.width = on.offsetWidth + 'px'; pill.style.transform = `translateX(${on.offsetLeft - 4}px)`;
    seg.onclick = (e) => { const b = e.target.closest('button'); if (!b || b.classList.contains('on')) return;
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      pill.style.width = b.offsetWidth + 'px'; pill.style.transform = `translateX(${b.offsetLeft - 4}px)`;
      const st = GUIDE[b.dataset.d].steps, ol = root.querySelector('.steps');
      ol.innerHTML = st.map((x, i) => `<li style="--n:${i}"><i>${i + 1}</i><div><b>${x[0]}</b><span>${x[1]}</span></div></li>`).join('');
      ol.classList.remove('swap'); void ol.offsetWidth; ol.classList.add('swap'); };
    $('#g-x').onclick = () => closeSheet();
    const gb = $('#g-bell'); if (gb) gb.onclick = () => closeSheet(() => { S.tab = 'bell'; S.blog = null; main.scrollTo(0, 0); render('in'); });
    $('#g-done').onclick = () => closeSheet(() => {
      LS.set('mb:guide', 'done'); hap('on');
      const b = $('#guide-b'); if (b) { b.style.height = b.offsetHeight + 'px'; void b.offsetHeight; b.classList.add('bye'); setTimeout(() => b.remove(), 380); }
      toast('좋아요! 알림 준비 끝');
    });
  }

  // ── 애드포스트 3단계 배너 (11/14 «1. 가입해요 · 며칠 있다가 신청해요 이런 식으로») — 나·엄마에게만, 기기별 진행 기록
  const AD_APPLY = '2026-11-30'; // 첫 블로그 등록 신청 날 (글·방문자 기록이 쌓인 뒤)
  const adKey = () => 'mb:ad:' + S.who;
  const adGet = () => { try { return JSON.parse(LS.get(adKey()) || '{}'); } catch (e) { return {}; } };
  const adSet = (o) => LS.set(adKey(), JSON.stringify({ ...adGet(), ...o }));
  const dday = (ymdStr) => Math.ceil((new Date(ymdStr + 'T00:00:00+09:00') - Date.now()) / 864e5);
  function adCard() {
    if (S.who === '아빠') return '';
    const st = adGet(); if (st.ok) return '';
    const d = dday(AD_APPLY), md = `${+AD_APPLY.slice(5, 7)}월 ${+AD_APPLY.slice(8, 10)}일`;
    const res = st.apply ? new Date(new Date(st.apply).getTime() + 7 * 864e5) : null; // 영업일 5일 ≈ 7일
    const step = (n, state, title, desc, btns = '') => `<li class="${state}"><i>${state === 'done' ? '✓' : n}</i><div><b>${title}</b><span>${desc}</span>${btns}</div></li>`;
    const s1 = st.join ? step(1, 'done', '애드포스트 가입', '가입했어요')
      : step(1, 'now', '애드포스트 가입하기', '지금 바로 할 수 있어요 · 본인 휴대폰 인증이 필요해요',
        `<div class="ad-btns"><a class="mini g" href="https://adpost.naver.com/publisher/agreement" target="_blank" rel="noopener">가입하러 가기</a><button class="mini" data-ad="join">가입했어요</button></div>`);
    const s2 = st.apply ? step(2, 'done', '블로그 등록 신청', `${+st.apply.slice(5, 7)}월 ${+st.apply.slice(8, 10)}일에 신청했어요`)
      : d > 0 ? step(2, st.join ? 'next' : 'wait', `${md}에 블로그 등록 신청`, `<em>D-${d}</em> · 글과 방문자가 조금 더 쌓이면 신청해요`)
      : step(2, st.join ? 'now' : 'wait', '블로그 등록 신청하기', '이제 신청할 때예요 · 미디어 관리 → 미디어 등록 → 블로그',
        st.join ? `<div class="ad-btns"><a class="mini g" href="https://adpost.naver.com/" target="_blank" rel="noopener">신청하러 가기</a><button class="mini" data-ad="apply">신청했어요</button></div>` : '');
    const s3 = st.apply ? step(3, 'now', '심사 결과 기다리기', `${res.getMonth() + 1}월 ${res.getDate()}일쯤 나와요 · 「보류」면 2주 뒤 다시 신청해요`,
        `<div class="ad-btns"><button class="mini g" data-ad="ok">통과했어요</button><button class="mini" data-ad="again">보류됐어요</button></div>`)
      : step(3, 'wait', '심사 통과하면 끝', '최대 5일 · 통과하면 광고가 붙고 번 돈이 위에 보여요');
    return `<div class="card adc" id="adc"><div class="adc-h"><b>애드포스트로 돈 벌기</b><span>네이버 블로그 광고 수익</span></div><ol class="ad-steps">${s1}${s2}${s3}</ol></div>`;
  }
  function adBind() {
    const c = $('#adc'); if (!c) return;
    c.onclick = (e) => { const b = e.target.closest('[data-ad]'); if (!b) return;
      const k = b.dataset.ad, today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      if (k === 'join') { adSet({ join: 1 }); toast('가입 완료! 다음은 블로그 등록 신청이에요'); }
      if (k === 'apply') { adSet({ apply: today }); toast('신청 완료! 결과를 기다려요'); }
      if (k === 'again') { adSet({ apply: null, again: today }); toast('괜찮아요, 2주 뒤에 다시 신청해요'); }
      if (k === 'ok') { adSet({ ok: 1 }); toast('축하해요! 이제 번 돈이 위에 보여요'); }
      hap('on'); const n = document.createElement('div'); n.innerHTML = adCard(); c.replaceWith(n.firstElementChild || document.createTextNode('')); adBind();
    };
  }

  function bind() {
    adBind();
    { const gb = $('#guide-b'); if (gb) gb.onclick = () => openGuide(); }
    main.querySelectorAll('[data-blog]').forEach((el) => (el.onclick = () => { S.blog = el.dataset.blog; main.scrollTo(0, 0); render('fwd'); }));
    main.querySelectorAll('[data-go]').forEach((el) => (el.onclick = () => { S.tab = el.dataset.go; main.scrollTo(0, 0); render('in'); }));
  }

  // ── 시작: 유령이 인사하며 기다리다가(오래 걸리면 찾는 얼굴로), 자료가 오면 스르르 사라져요
  (async () => {
    if (PUSH_OK) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (!S.code) { lockView(); return splashOff(() => animate('in')); }
    let cached = false;
    try { const c = JSON.parse(LS.get('mb:cache') || 'null'); if (c) { S.who = c.who; S.data = c.data; render('none'); cached = true; } } catch (e) {}
    if (cached) { splashOff(() => animate('in')); refresh(); }
    else {
      const slow = setTimeout(() => { const i = $('#splash img'); if (i) i.src = 'assets/ghost/focus.webp'; }, 1600);
      try { await load(); render('none'); }
      catch (e) { if (e.message === 'denied') { LS.set('mb:code', null); lockView('비밀번호가 바뀌었어요. 다시 눌러 주세요'); } else lockView('인터넷 연결을 확인해 주세요'); }
      clearTimeout(slow); splashOff(() => animate('in'));
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.data) refresh(); });
  })();
})();
