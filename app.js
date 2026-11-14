/* 말랑블로그 (2026-11-14)
   «자기 블로그 글이 올라갔는지도 모를 수도 있거든 … 각 계정별로 한눈에»
   가족 비밀번호(나·엄마·아빠)로 들어오면 내 블로그에 「나」 표시를 하고, 세 블로그를 모두 보여 줘요.
   자료는 scripts/collect.js 가 15분마다 모아 서버(blog_get)에 올려 둔 것을 읽어요. */
(() => {
  const CFG = window.BLOG_SYNC;
  const $ = (s, el = document) => el.querySelector(s);
  const main = $('#main'), tabbar = $('#tabbar'), me = $('#me');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString('ko-KR'));
  const LS = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
  const ORDER = { 나: 0, 엄마: 1, 아빠: 2 };
  let S = { code: LS.get('mb:code'), who: null, data: null, tab: 'home', blog: null, filter: 'all' };

  const toast = (t) => { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2200); };
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
  const chip = (b) => `<span class="chip ${b.who === S.who ? 'me' : ''}">${esc(label(b))}</span>`;
  const todayPosts = (b) => b.posts.filter((p) => ymd(p.at) === todayY());

  // ── 비밀번호
  function lockView(msg) {
    tabbar.hidden = true; me.hidden = true;
    let pin = '';
    main.innerHTML = `<div class="lock"><img class="gh" src="assets/ghost/hello.webp" alt=""><h1>말랑블로그</h1><p>${esc(msg || '가족 비밀번호 4자리를 눌러 주세요')}</p>
      <div class="pins" id="pins">${'<i></i>'.repeat(4)}</div>
      <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-n="${n}">${n}</button>`).join('')}<span></span><button data-n="0">0</button><button class="fn" data-n="del">지우기</button></div></div>`;
    const pins = $('#pins');
    const draw = () => [...pins.children].forEach((i, k) => i.classList.toggle('on', k < pin.length));
    main.querySelector('.pad').onclick = async (e) => {
      const n = e.target.closest('button'); if (!n) return;
      if (n.dataset.n === 'del') pin = pin.slice(0, -1); else if (pin.length < 4) pin += n.dataset.n;
      draw();
      if (pin.length === 4) {
        try { await load(pin); LS.set('mb:code', pin); S.code = pin; render(); }
        catch (x) { pins.classList.add('bad'); setTimeout(() => { pins.classList.remove('bad'); pin = ''; draw(); }, 500); if (x.message !== 'denied') toast('인터넷 연결을 확인해 주세요'); }
      }
    };
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
  };
  function drawTabs() {
    tabbar.hidden = false;
    tabbar.innerHTML = [['home', '홈'], ['feed', '올라간 글'], ['bell', '알림']].map(([k, t]) => `<button class="${S.tab === k && !S.blog ? 'on' : ''}" data-t="${k}">${ICON[k]}<span>${t}</span></button>`).join('');
  }
  tabbar.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.tab = b.dataset.t; S.blog = null; render(); scrollTo(0, 0); };
  $('#brand').onclick = () => { S.tab = 'home'; S.blog = null; render(); scrollTo(0, 0); };
  // 「나」 단추는 내 블로그 화면으로 (11/14 «나를 누르면 왜 로그아웃이 되냐») · 다른 사람으로 들어가기는 알림 탭 맨 아래
  const myBlog = () => S.data && S.data.blogs.find((x) => x.who === S.who);
  const meName = () => { const b = myBlog(); return `${S.who}${b && b.nick ? ' · ' + b.nick : ''}`; };
  // 「나」 단추: 누가 들어와 있는지 보여 주는 창 (11/14 «나 누르면 내가 누구인지 … 나 하노 이런 식으로»)
  me.onclick = () => {
    const b = myBlog(), root = $('#sheet-root');
    root.innerHTML = `<div class="dim"></div><div class="sheet"><img class="gh-m" src="assets/ghost/hello.webp" alt="">
      <h2>${esc(meName())}</h2><p>${esc(S.who === '나' ? '나' : S.who)}(으)로 들어와 있어요${b ? `<br>${esc(b.name)} · ${esc(b.id)}` : ''}</p>
      <button class="btn" id="sh-my">내 블로그 보기</button><button class="btn gray" id="sh-out">다른 가족으로 들어가기</button><button class="btn gray" id="sh-x">닫기</button></div>`;
    const close = () => (root.innerHTML = '');
    root.querySelector('.dim').onclick = close; $('#sh-x').onclick = close;
    $('#sh-my').onclick = () => { close(); if (b) { S.blog = b.id; render(); scrollTo(0, 0); } };
    $('#sh-out').onclick = () => { close(); logout(); };
  };
  function logout() { LS.set('mb:code', null); LS.set('mb:cache', null); S = { ...S, code: null, who: null, data: null, blog: null, tab: 'home' }; lockView(); }

  function render() {
    if (!S.data) return lockView();
    me.hidden = false; me.textContent = meName();
    drawTabs();
    if (S.blog) return detailView(S.data.blogs.find((b) => b.id === S.blog));
    ({ home: homeView, feed: feedView, bell: bellView })[S.tab]();
  }

  function blogCard(b) {
    const last = b.posts[0], tp = todayPosts(b).length;
    const fresh = last && Date.now() - new Date(last.at) < 6 * 3600e3;
    return `<div class="card link" data-blog="${esc(b.id)}">
      <div class="blog-h"><img class="ava" src="${esc(b.photo)}" alt="" onerror="this.style.visibility='hidden'">
        <div class="nm"><b>${esc(b.name)} ${chip(b)}</b><span>${esc(b.who === S.who ? '내 블로그' : b.who + ' 블로그')} · ${esc(b.id)}</span></div><span class="chev">›</span></div>
      <div class="stats"><div><div class="k">오늘 방문자</div><div class="v big num">${fmt(b.today)}</div></div>
        <div><div class="k">오늘 올린 글</div><div class="v num">${tp}개</div></div>
        <div><div class="k">이웃</div><div class="v num">${fmt(b.neighbors)}</div></div></div>
      ${(b.reserved || []).length ? `<div class="last res"><span class="dot"></span><div class="t"><b>예약 ${b.reserved.length}개 · 다음 글 ${hm(b.reserved[0].at)}</b><span>${esc(b.reserved[0].title)}</span></div></div>` : ''}
      ${last ? `<div class="last"><span class="dot ${fresh ? '' : 'old'}"></span><div class="t"><b>${esc(last.title)}</b><span>마지막 글 · ${ago(last.at)}</span></div></div>` : `<div class="last"><span class="dot old"></span><div class="t"><b>아직 올린 글이 없어요</b></div></div>`}
    </div>`;
  }

  function homeView() {
    const L = blogs(), mine = L.find((b) => b.who === S.who);
    const vis = L.reduce((s, b) => s + (b.today || 0), 0), cnt = L.reduce((s, b) => s + todayPosts(b).length, 0);
    const name = S.who === '나' ? '' : S.who + ', ';
    const gh = cnt ? 'yay' : 'idle';
    main.innerHTML = `<div class="hello-wrap"><img class="gh-h" src="assets/ghost/${gh}.webp" alt=""><h1 class="hello">${esc(name)}오늘 ${mine ? `내 블로그에<br><b>${fmt(mine.today)}명</b>이 다녀갔어요` : '블로그 소식이에요'}</h1></div>
      <div class="card sum"><div><div class="k">가족 오늘 방문자</div><div class="v num">${fmt(vis)}<small>명</small></div></div>
        <div><div class="k">오늘 올라간 글</div><div class="v num">${cnt}<small>개</small></div></div>
        <div><div class="k">올라갈 예약</div><div class="v num">${L.reduce((s, b) => s + (b.reserved || []).length, 0)}<small>개</small></div></div></div>
      <div class="sec-h"><h2>우리 가족 블로그</h2></div>
      ${L.map(blogCard).join('')}
      <div class="sec-h"><h2>방금 올라간 글</h2><button class="more" data-go="feed">전체 보기</button></div>
      <div class="card plist">${postRows(allPosts().slice(0, 5))}</div>
      <p class="upd">${S.data.updated ? `${ago(S.data.updated) === "방금" ? "방금" : ago(S.data.updated) + "에"} 새로 모았어요 · 15분마다 바뀌어요` : ''}</p>`;
    bind();
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
    const posts = allPosts().filter((p) => S.filter === 'all' || p.b.id === S.filter);
    const days = {}; for (const p of posts) (days[ymd(p.at)] = days[ymd(p.at)] || []).push(p);
    main.innerHTML = `<div class="hello-wrap"><img class="gh-h" src="assets/ghost/focus.webp" alt=""><h1 class="hello">올라간 글</h1></div>
      <div class="filters"><button class="${S.filter === 'all' ? 'on' : ''}" data-f="all">전체</button>${L.map((b) => `<button class="${S.filter === b.id ? 'on' : ''}" data-f="${esc(b.id)}">${esc(label(b))}</button>`).join('')}</div>
      ${upcoming().length ? `<div class="day-h">올라갈 예정 · ${upcoming().length}개</div><div class="card plist">${resRows(upcoming())}</div>` : ''}
      ${Object.keys(days).sort().reverse().map((d) => `<div class="day-h">${dayLabel(d)} · ${days[d].length}개</div><div class="card plist">${postRows(days[d])}</div>`).join('') || '<div class="card empty">아직 올라간 글이 없어요</div>'}
      <p class="upd">블로그마다 최근 30개까지 보여요</p>`;
    main.querySelector('.filters').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.filter = b.dataset.f; feedView(); };
  }

  function detailView(b) {
    if (!b) { S.blog = null; return render(); }
    drawTabs();
    const days = []; for (let i = 6; i >= 0; i--) days.push(ymd(Date.now() - i * 864e5));
    const H = b.hist || {}, max = Math.max(1, ...days.map((d) => H[d] || 0));
    const known = days.filter((d) => H[d] != null).length;
    main.innerHTML = `<button class="back" id="back">‹ 뒤로</button>
      <div class="card" style="margin-top:8px"><div class="blog-h"><img class="ava" src="${esc(b.photo)}" alt="" onerror="this.style.visibility='hidden'"><div class="nm"><b>${esc(b.name)} ${chip(b)}</b><span>${esc(b.intro || b.id).replace(/\n/g, ' ')}</span></div></div>
        <div class="stats"><div><div class="k">오늘 방문자</div><div class="v big num">${fmt(b.today)}</div></div><div><div class="k">전체 방문자</div><div class="v num">${fmt(b.total)}</div></div><div><div class="k">이웃</div><div class="v num">${fmt(b.neighbors)}</div></div></div>
        <a class="btn sub" style="margin-top:18px" href="${esc(b.url)}" target="_blank" rel="noopener">블로그 열기</a></div>
      <div class="sec-h"><h2>최근 7일 방문자</h2></div>
      <div class="card"><div class="bars">${days.map((d) => `<div class="b ${d === todayY() ? 'today' : ''}"><u class="num">${H[d] != null ? fmt(H[d]) : ''}</u><i style="height:${H[d] != null ? Math.max(4, (H[d] / max) * 100) : 0}%"></i><em>${d === todayY() ? '오늘' : +d.slice(8)}</em></div>`).join('')}</div>
        ${known < 7 ? '<p class="note">말랑블로그를 연 날부터 하루씩 쌓여요. 오늘은 지금까지 다녀간 수예요.</p>' : ''}</div>
      ${(b.reserved || []).length ? `<div class="sec-h"><h2>올라갈 예정</h2><span class="more">${b.reserved.length}개</span></div><div class="card plist">${resRows(b.reserved.map((r) => ({ ...r, b })))}</div>` : ''}
      <div class="sec-h"><h2>올린 글</h2><span class="more">${b.posts.length}개</span></div>
      <div class="card plist">${postRows(b.posts.map((p) => ({ ...p, b })))}</div>`;
    $('#back').onclick = () => { S.blog = null; render(); };
  }

  // ── 알림
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
  function bellView() {
    const on = LS.get('mb:push') === '1';
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    let body;
    if (!PUSH_OK && ios && !standalone()) body = `<div class="card"><div class="row"><div><b>먼저 홈 화면에 추가해 주세요</b><p>아이폰은 홈 화면 앱에서만 알림이 와요.<br>사파리 아래 <b>공유 버튼</b> → <b>홈 화면에 추가</b>를 누르고, 홈 화면의 말랑블로그로 다시 들어와 주세요.</p></div></div></div>`;
    else if (!PUSH_OK) body = `<div class="card"><div class="row"><div><b>이 브라우저는 알림을 못 받아요</b><p>휴대폰 사파리(홈 화면 앱)나 크롬에서 열어 주세요.</p></div></div></div>`;
    else body = `<div class="card"><div class="row"><div><b>새 글 알림</b><p>가족 블로그에 글이 올라가면 바로 알려 드려요.<br>내 글은 「내 블로그에 새 글이 올라갔어요」로 와요.</p></div><button class="sw ${on ? 'on' : ''}" id="sw" aria-label="새 글 알림"></button></div></div>
      <div class="card"><div class="row"><div><b>어떤 알림이 오나요?</b><p>· 예약해 둔 글이 실제로 올라갔을 때<br>· 엄마·아빠·하노 블로그에 새 글이 올라왔을 때<br>15분마다 확인해서 알려 드려요.</p></div></div></div>`;
    main.innerHTML = `<div class="hello-wrap"><img class="gh-h" src="assets/ghost/peek.webp" alt=""><h1 class="hello">알림</h1></div>${body}
      <div class="card"><div class="row"><div><b>${esc(meName())}(으)로 들어와 있어요</b><p>다른 가족 비밀번호로 들어가려면 눌러 주세요.</p></div><button class="me" id="logout" type="button">바꾸기</button></div></div>`;
    $('#logout').onclick = logout;
    const sw = $('#sw');
    if (sw) sw.onclick = async () => {
      sw.disabled = true;
      try { if (sw.classList.contains('on')) { await pushOff(); toast('알림을 껐어요'); } else { await pushOn(); toast('이제 새 글이 올라가면 알려 드려요'); } }
      catch (e) { toast(e.message === 'perm' ? '설정에서 알림을 허용해 주세요' : '알림을 켜지 못했어요'); }
      bellView();
    };
  }

  function bind() {
    main.querySelectorAll('[data-blog]').forEach((el) => (el.onclick = () => { S.blog = el.dataset.blog; render(); scrollTo(0, 0); }));
    main.querySelectorAll('[data-go]').forEach((el) => (el.onclick = () => { S.tab = el.dataset.go; render(); scrollTo(0, 0); }));
  }

  // ── 시작
  (async () => {
    if (PUSH_OK) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (!S.code) return lockView();
    try { const c = JSON.parse(LS.get('mb:cache') || 'null'); if (c) { S.who = c.who; S.data = c.data; render(); } } catch (e) {}
    try { await load(); render(); }
    catch (e) { if (e.message === 'denied') { LS.set('mb:code', null); lockView('비밀번호가 바뀌었어요. 다시 눌러 주세요'); } else if (!S.data) lockView('인터넷 연결을 확인해 주세요'); }
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.code) load().then(render).catch(() => {}); });
  })();
})();
