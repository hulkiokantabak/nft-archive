/* Embed view (25 Sep 2026): the creators' galleries open a work's page in an iframe, on demand, as async/<id>.html?embed=1
   (&mode=shuffle for a lever work). The pages are not changed for it: this first block and the html.av-embed rules at the end of
   async_viewer.css are the whole embed view, and without embed=1 in the query this block does nothing at all.
   The switch runs first, as soon as this deferred script runs: embed=1 as a whole parameter of the query, on a work's own page (the
   one .av-detail viewer) -> <html> gets the class av-embed and the page a <base target=_blank>. The style then hides the site's
   chrome (the tabs, the way back, the files list and everything after it, the footer) and keeps the title, the by-line, the view
   buttons, the picture or stage and every line the viewer shows (Current state, the Shuffle caption, the layers, the count, the time
   rule); the Current state picture gets its own ratio (--av-ar, from its width and height) for the style's 880 px cap. Then, on
   such a page only:
   (1) one small link under the viewer's lines, "Open in the preservation archive ↗": the same page without embed=1 (mode= and any
       other parameter kept);
   (2) every link opens outside the frame (target=_blank rel=noopener): those on the page, those the viewer adds later, any clicked;
   (3) in a frame only (window.parent !== window), the page's height for the host to size its frame, and nothing else:
       window.parent.postMessage({type: 'av-embed-height', id: '<the Master id>', height: <whole px, clamped to 200-2400>}, '*')
       at the start, on load, on resize and whenever the layout changes (ResizeObserver on <html> and <body>). The height (fix of
       25 Sep, after the live check saw the last line cut): Math.ceil of the largest of <html>'s scrollHeight, <html>'s box height and
       <body>'s scrollHeight, plus <body>'s bottom margin - <html>'s scrollHeight counted only when the page overflows the frame (it is
       never less than the frame's own height, so counted always it would let the frame grow but never shrink), or once it has set
       the height (review of 25 Sep: something sticking out below <html>'s box - none of today's pages has one - would otherwise swing
       the frame between two heights for ever; the price: such a page keeps that height until its own box grows past it).
   Nothing is fetched here and no message is read: there is no 'message' listener in this file. The viewer below runs as on the full
   page (the A+B loading and fallback rules, one viewer per page).
   Known trade-off: a deferred script cannot mark the page before its first paint, so the full page's chrome may show for a moment
   inside the frame. The first height message is sent only after the mark, so a host that keeps its frame hidden until that first
   av-embed-height message never shows it. */
(function () {
  'use strict';
  var de = document.documentElement;
  if (!de || !de.classList || !document.querySelector || !/[?&]embed=1(&|#|$)/.test(location.search || '')) return;   // not an embed view: nothing
  var root = document.querySelector('.av-detail[data-av-id]');
  if (!root) return;   // a work's own page only (async/<id>.html)
  de.classList.add('av-embed');
  if (document.head && !document.querySelector('base[target]')) { var bs = document.createElement('base'); bs.setAttribute('target', '_blank'); document.head.appendChild(bs); }
  // the Current state picture's ratio, from its own width and height, for the style's 880 px cap (its box keeps its size while it loads)
  var still = root.querySelector('.av-still'), sw = still ? +still.getAttribute('width') : 0, sh = still ? +still.getAttribute('height') : 0;
  if (sw > 0 && sh > 0) still.style.setProperty('--av-ar', String(sw / sh));
  /*<av-embed>*/
  // the full page's address, relative to this one: the same file, the query without its embed parameter, the anchor kept
  function archiveHref(path, search, hash) {
    var file = String(path || '').split('/').pop() || './';
    var q = String(search || '').replace(/^\?/, '').split('&').filter(function (kv) { return kv && !/^embed(=|$)/.test(kv); });
    return file + (q.length ? '?' + q.join('&') : '') + (hash || '');
  }
  // the height the host is told: a whole number of px, clamped to 200-2400
  function clampHeight(px) { return Math.min(2400, Math.max(200, Math.ceil(+px) || 0)); }
  // the height the page needs, in px (25 Sep, after the live check saw the last line cut): the largest of <html>'s scrollHeight (sh),
  // its box height (box) and <body>'s scrollHeight (bsh), plus <body>'s bottom margin (mb). sh is never less than the frame's own
  // height (ch, <html>'s clientHeight): it counts when it passes it (the page overflows the frame), else the frame could grow but
  // never shrink again (and a body margin would grow it at every message) - and, once sh has set the height (held), also while it
  // equals it: something sticks out below <html>'s box, and without held the frame would swing between the two heights for ever
  function needHeight(sh, ch, box, bsh, mb, held) { return Math.ceil(Math.max(held || +sh > +ch ? +sh || 0 : 0, +box || 0, +bsh || 0) + (+mb || 0)); }
  // held for the next measurement: sh set the height (it passes the page's own heights by more than 1 px, the rounding)
  function heldBy(need, box, bsh, mb) { return need > needHeight(0, 0, box, bsh, mb) + 1; }
  /*</av-embed>*/
  function out(a) {   // a link that leaves the frame
    var rel = a.getAttribute('rel') || '';
    if (a.getAttribute('target') !== '_blank') a.setAttribute('target', '_blank');
    if (!/(^|\s)noopener(\s|$)/.test(rel)) a.setAttribute('rel', (rel ? rel + ' ' : '') + 'noopener');
  }
  function outAll(n) { if (n.querySelectorAll) [].forEach.call(n.querySelectorAll('a[href]'), out); }
  var id = root.getAttribute('data-av-id') || '', last = -1, held = false, timer = null, box, a, at, n;
  // (1) the full page: under the viewer's lines (the p.s lines right after it), else right after the viewer
  box = document.createElement('div'); box.className = 'av-embed-open';
  a = document.createElement('a'); a.setAttribute('href', archiveHref(location.pathname, location.search, location.hash));
  a.textContent = 'Open in the preservation archive ↗'; out(a); box.appendChild(a);
  for (at = root, n = root.nextElementSibling; n && n.tagName === 'P' && /(^|\s)s(\s|$)/.test(n.className); n = n.nextElementSibling) at = n;
  at.parentNode.insertBefore(box, at.nextSibling);
  // (2) every link out of the frame: those on the page, those the viewer adds later, and any clicked
  outAll(document);
  if (window.MutationObserver && document.body) new MutationObserver(function (ms) {
    ms.forEach(function (m) { [].forEach.call(m.addedNodes || [], function (x) { if (x.nodeType !== 1) return; if (x.tagName === 'A' && x.hasAttribute('href')) out(x); outAll(x); }); });
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', function (e) { var t = e.target, l = t && t.closest ? t.closest('a[href]') : null; if (l) out(l); }, true);
  // (3) the height, in a frame only (never a height in vh on this page: the host sets the frame's height from it, see the style)
  if (window.parent === window) return;
  function post(force) {
    var b = document.body, mb = 0;
    try { mb = b ? parseFloat(window.getComputedStyle(b).marginBottom) : 0; } catch (e) { mb = 0; }
    var rsh = de.scrollHeight, bx = de.getBoundingClientRect().height, bsh = b ? b.scrollHeight : 0;
    var need = needHeight(rsh, de.clientHeight, bx, bsh, mb, held);
    held = heldBy(need, bx, bsh, mb);
    var h = clampHeight(need);
    if (!force && h === last) return;
    last = h;
    try { window.parent.postMessage({ type: 'av-embed-height', id: id, height: h }, '*'); } catch (e) { /* a host that cannot be told */ }
  }
  function soon() { if (timer === null) timer = setTimeout(function () { timer = null; post(false); }, 40); }
  post(true);
  window.addEventListener('load', function () { post(true); });
  window.addEventListener('resize', soon);
  document.addEventListener('load', soon, true);   // an image arriving (a picture without its size changes the height)
  if (window.ResizeObserver && document.body) { var ro = new window.ResizeObserver(soon); ro.observe(de); ro.observe(document.body); }   // <html> and <body>
  else if (window.MutationObserver && document.body) new MutationObserver(soon).observe(document.body, { childList: true, subtree: true, attributes: true });
})();
/* Async Art viewer - the archive site's Async Art pages and Pinwatch's token page (the collector's request of 22 Sep 2026).
   Default: the static strip. Modes for a work that changes with the time of day:
     Live      - the state for the current time; it changes on its own at each boundary ("next change in 23 min"); the Master's
                 own time rule (UTC if its metadata gives none), or "follow my local time";
     Slideshow - the distinct states in time order; 1 / 3 / 6 s each or true to time (each state held for its hours);
                 play / pause; a 0-24 h slider; a soft cross-fade;
     Frame     - full screen, no controls, Live: for a TV or a digital frame (Esc or a click leaves).
   Layers: each layer, its states (the active one highlighted) and what drives it (time or a lever). The layered view is
   composed in a canvas from the layer files, in async_masters.py's order and canvas, only for layouts it reproduces faithfully.
   Lever values are read on-chain in this browser through a public RPC (a read-only eth_call of getControlToken); if every RPC
   fails, our dated snapshot is shown. Other values are a local preview only, labelled "preview - not on-chain".
   Loading (Chat's note of 24 Sep, A1-A5): Live, Slideshow and Frame preload every state of the work at once, at most 4 requests
   making progress at once, page-wide (the one on screen first, then in the order they will be shown; a request with no progress
   for 15 s stays open but no longer counts toward the 4, see below); a thin bar under the picture says
   "Loading states 7 of 24" and goes when all have loaded; Live says "loading current state..." until its image arrives. The
   slideshow never moves to a state whose image has not loaded, and starts once the first two are ready.
   Sources, in order: the site's display copy (a resized WebP, labelled "display copy, resized; the originals are on IPFS", with
   the original's link), then the original on IPFS (the collector's decision O15, 23 Sep): gateway.pinata.cloud (our files are
   pinned there), ipfs.io, dweb.link - never the dedicated gateway. The next source is asked only when the current one fails, or
   has shown no progress for about 15 s (?stall=<ms> for tests, honoured on 127.0.0.1 / localhost only); nothing is ever aborted:
   a stalled request is left to finish and whichever source completes first is shown. So while sources stall, more than 4
   requests can be open (each file at most one per source). The file links list the three gateways in that order.
   No wallet, no transaction, no cookie. localStorage (every access inside try/catch) keeps only this visitor's choices.
   prefers-reduced-motion: nothing changes on its own unless the visitor turns it on.
   Shuffle (Chat's note of 24 Sep, B1-B4), on a lever-controlled work: "Current state" (the default: our composite of the levers as
   read on-chain on its snapshot date) and "Shuffle": the layers stacked in order, as our composites of 22 Sep (each on the whole
   canvas, transparent areas on white), a random option for each lever layer about every 5 s, the fixed layers kept; a pause button;
   every such picture captioned "A possible combination — not the current on-chain state", with the option each layer shows and the
   number of possible combinations (the product of the lever layers' options). A work the builder does not let through its
   composites' rules (m.shuffle.ok false, or not faithful) is not shuffled: its reason is shown. The layer images (their display
   copies first) preload through the same queue, counted on the same bar; a combination shows only once all its images have loaded.
   While Shuffle runs, the Current state picture and its line are hidden (on a work's own page too); Current state brings them back.
   Page parameters: ?mode=strip|live|slideshow|frame|shuffle  ?state=<label or number>  ?t=HH:MM  ?w=<token id> (which work, on a page
   with several)  ?now=<ISO time or epoch ms> (test clock: starts at that moment and runs on). */
(function () {
  'use strict';
  if (!window.fetch || !window.JSON || !window.Promise || !document.querySelector || !document.addEventListener) return;   // an old browser keeps the static strip

  var GATEWAYS = ['https://gateway.pinata.cloud/ipfs/', 'https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/'];   // O15: in this order
  var RPCS = ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org', 'https://eth-mainnet.public.blastapi.io', 'https://cloudflare-eth.com'];
  var GET_CONTROL_TOKEN = '0x96bc50b0';   // getControlToken(uint256) -> int256[]: min, max, current for each lever
  var CONTEXT = 'Each layer is its own token; whoever holds it sets its lever. The Master shows what they choose.';
  var SPEEDS = [['1', '1 s each'], ['3', '3 s each'], ['6', '6 s each'], ['true', 'true to time (1 s per hour)']];
  var STALL = 15000, MAX_PARALLEL = 4, RPC_TIMEOUT = 9000, MAX_CANVAS = 2048;   // STALL: no progress for this long -> the next source (A4; ?stall=<ms> for tests, local hosts only)
  var DISPLAY_NOTE = 'display copy, resized; the originals are on IPFS';   // A5: the label of every picture shown from a display copy

  // ---------------------------------------------------------------- storage, parameters, clock, motion
  function sget(k) { try { return window.localStorage.getItem('asyncviewer.' + k); } catch (e) { return null; } }
  function sset(k, v) { try { window.localStorage.setItem('asyncviewer.' + k, v); } catch (e) { /* no storage: nothing is remembered */ } }
  var Q = {};
  try {
    window.location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      Q[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
    });
  } catch (e) { Q = {}; }
  function parseNow(v) {
    if (!v) return NaN;
    if (/^\d{10,}$/.test(v)) return +v;
    return Date.parse(v);
  }
  var FAKE = parseNow(Q.now), T0 = Date.now();
  var LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(window.location.hostname || '');   // the tests' own server (and Pinwatch)
  if (+Q.stall > 0 && LOCAL) STALL = +Q.stall;   // a test hook only: on the public site no link can shorten A4's 15 s wait (review of 25 Sep)
  function now() { return isNaN(FAKE) ? Date.now() : FAKE + (Date.now() - T0); }
  var REDUCE = false;
  try { REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { REDUCE = false; }
  function auto() { return !REDUCE || sget('auto') === 'on'; }   // reduced motion: changes on their own only once the visitor turns them on

  function readJSON(id) {
    var n = document.getElementById(id);
    if (!n) return null;
    try { return JSON.parse(n.textContent); } catch (e) { return null; }
  }
  var CFG = readJSON('av-config') || {};
  var BASE = CFG.base || '';

  // ---------------------------------------------------------------- small helpers
  function el(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    if (attrs) for (k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] !== null && attrs[k] !== undefined) {
      if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ranges(hrs) {   // [6,7,8,19] -> "06:00-08:59, 19:00-19:59" (runs across midnight joined)
    if (!hrs || !hrs.length) return '';
    var set = {}, out = [], h, start, k;
    hrs.forEach(function (x) { set[x] = true; });
    if (hrs.length >= 24) return 'all day';
    for (start = 0; start < 24; start++) if (set[start] && !set[(start + 23) % 24]) break;
    for (k = 0; k < 24; k++) {
      h = (start + k) % 24;
      if (set[h] && !set[(h + 23) % 24]) {
        var e = h;
        while (set[(e + 1) % 24] && (e + 1) % 24 !== h) e = (e + 1) % 24;
        out.push(pad(h) + ':00–' + pad(e) + ':59');
      }
    }
    return out.join(', ');
  }
  function ruleOpt(L, h) {
    var rs = L.rules || [], i, a, b;
    for (i = 0; i < rs.length; i++) {
      a = rs[i][0]; b = rs[i][1];
      if ((a <= b && a <= h && h <= b) || (a > b && (h >= a || h <= b))) return rs[i][2];
    }
    return 0;
  }
  function clockOf(m, ms, local) {
    var d;
    if (local) { d = new Date(ms); return { h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds(), ms: d.getMilliseconds(), zone: 'your time' }; }
    d = new Date(ms + ((m.tz && m.tz.offset_min) || 0) * 60000);
    return { h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), ms: d.getUTCMilliseconds(), zone: (m.tz && m.tz.label) || 'UTC' };
  }
  function nextChange(m, c) {
    var hs = m.hour_state, cur, k;
    if (!hs) return null;
    cur = hs[c.h];
    for (k = 1; k < 24; k++) if (hs[(c.h + k) % 24] !== cur) return { ms: ((k * 60 - c.mi) * 60 - c.s) * 1000 - c.ms, to: hs[(c.h + k) % 24], at: (c.h + k) % 24 };
    return null;
  }
  function fmtIn(ms) {
    var mi = Math.max(1, Math.ceil(ms / 60000)), h, r;
    if (mi < 60) return mi + ' min';
    h = Math.floor(mi / 60); r = mi % 60;
    return h + ' h' + (r ? ' ' + r + ' min' : '');
  }
  function withTimeout(p, ms) {
    return new Promise(function (ok, no) {
      var t = setTimeout(function () { no(new Error('timeout')); }, ms);
      p.then(function (v) { clearTimeout(t); ok(v); }, function (e) { clearTimeout(t); no(e); });
    });
  }
  function hostOf(u) { return (u || '').split('/')[2] || ''; }
  /*<av-queue>*/
  // ---------------------------------------------------------------- the load queue and the slideshow's clock (A1, A3, A4)
  // Pure code: the timers and the request itself come from env, so patches/test_async_preload.js runs this very text in Node on a
  // fake clock. makeQueue(env, {max, stall}) - one queue for the page:
  //   file(key, srcs)  one image with its sources in order (the site's display copy first, then the IPFS gateways in O15's order)
  //   want(f, prio)    load it (lower prio first: the order a work's states will be shown in; 0 = needed on screen now)
  //   drop(f)          a file whose request has not been sent yet leaves the queue (its viewer went back to the strip)
  //   on(f, cb)        cb(f) once f has loaded (f.ok, f.result, f.from) or every source has failed (f.failed)
  // At most max requests that are making progress load at once, page-wide. The next source is asked only when the current one
  // fails, or has shown no progress for `stall` ms; the stalled request is not aborted - it no longer counts against max, and if
  // it completes first, it is used. Nothing is ever aborted: a request once sent always runs to its end. So while sources stall,
  // more than max requests can be open at once (each file at most one per source; the review of 25 Sep measured 40 with every
  // source stalling): the cap is on requests making progress (Q.active), not on open ones.
  // env: {now(), setTimeout, clearTimeout, request(src, {progress(bytes), done(result), fail(err)}), discard(result)}
  function srcHost(u) { return /^https?:\/\//i.test(u || '') ? u.split('/')[2] : 'site'; }
  function makeQueue(env, opts) {
    var max = (opts && opts.max) || 4, stall = (opts && opts.stall) || 15000, files = {}, waiting = [], seq = 0;
    var Q = { active: 0, peak: 0, sent: 0 };
    function settled(f) { return f.ok || f.failed; }
    function counted(f) { return f.live.some(function (r) { return r.counted; }); }
    function fire(f) {
      var cbs = f.cbs; f.cbs = [];
      cbs.forEach(function (cb) { try { cb(f); } catch (e) { /* a listener's error stays its own */ } });
    }
    function enqueue(f) {
      if (f.queued || settled(f) || f.k >= f.srcs.length) return;
      f.queued = true; f.seq = ++seq; waiting.push(f);
    }
    function unqueue(f) {
      var i = waiting.indexOf(f);
      if (i >= 0) waiting.splice(i, 1);
      f.queued = false;
    }
    function check(f) {   // every source asked and nothing still running: failed
      if (!settled(f) && !f.queued && !f.live.length && f.k >= f.srcs.length) { f.failed = true; fire(f); }
    }
    function release(r) { if (r.counted) { r.counted = false; Q.active--; } }
    function pump() {
      var b, i;
      while (Q.active < max && waiting.length) {
        for (b = 0, i = 1; i < waiting.length; i++) if (waiting[i].prio < waiting[b].prio || (waiting[i].prio === waiting[b].prio && waiting[i].seq < waiting[b].seq)) b = i;
        start(waiting.splice(b, 1)[0]);
      }
    }
    function start(f) {
      var src = f.srcs[f.k], r = { k: f.k, counted: true, over: false, stalled: false, t: null };
      f.queued = false; f.k++; f.live.push(r);
      if (f.t0 === null) f.t0 = env.now();
      Q.active++; Q.sent++; if (Q.active > Q.peak) Q.peak = Q.active;
      f.tried.push(srcHost(src) + '@' + (env.now() - f.t0));
      function stalled() {   // no progress for `stall` ms: the next source, without aborting this one
        if (r.over || !r.counted) return;
        release(r); r.stalled = true;
        if (!settled(f) && r.k === f.k - 1) enqueue(f);
        pump();
      }
      function arm() { env.clearTimeout(r.t); r.t = env.setTimeout(stalled, stall); }
      function end() { r.over = true; env.clearTimeout(r.t); release(r); f.live.splice(f.live.indexOf(r), 1); }
      arm();
      env.request(src, {
        progress: function () { if (!r.over && r.counted) arm(); },
        done: function (res) {
          if (r.over) return;
          end();
          if (settled(f)) { if (env.discard) env.discard(res); }   // another source completed first: this one is not needed
          else { f.ok = true; f.result = res; f.from = src; unqueue(f); fire(f); }
          pump();
        },
        fail: function () {
          if (r.over) return;
          end();
          if (!settled(f) && r.k === f.k - 1 && !r.stalled) enqueue(f);   // the source we were waiting on failed: the next one now
          check(f); pump();
        }
      });
    }
    Q.file = function (key, srcs) {
      return files[key] || (files[key] = { key: key, srcs: srcs.slice(), k: 0, prio: Infinity, seq: 0, queued: false, live: [], tried: [], cbs: [],
                                           ok: false, failed: false, result: null, from: '', t0: null });
    };
    Q.want = function (f, prio) {
      if (!f || settled(f)) return;
      if (prio < f.prio) f.prio = prio;
      if (!f.queued && !counted(f)) enqueue(f);   // nothing loading for it now: never asked, dropped, or its request stalled
      check(f); pump();
    };
    Q.drop = function (f) { if (f && f.queued) { unqueue(f); f.prio = Infinity; } };
    Q.on = function (f, cb) { if (!f) return; if (settled(f)) cb(f); else f.cbs.push(cb); };
    Q.waiting = function () { return waiting.length; };
    return Q;
  }
  function stateOrder(hs, h, n) {   // the states in the order the slideshow shows them from hour h, each once (then any no hour names)
    var out = [], seen = {}, k, i;
    for (k = 0; hs && k < 24; k++) { i = hs[(h + k) % 24]; if (!seen[i]) { seen[i] = true; out.push(i); } }
    for (i = 0; i < (n || 0); i++) if (!seen[i]) { seen[i] = true; out.push(i); }
    return out;
  }
  // makePlayer(o) - the slideshow's clock (A3): it never moves on to a state whose image has not loaded (the one on screen stays
  // until it has), passes over a state whose every source failed, and starts only once the first two states in order are ready
  // (the one on screen and the next). o: {hs (hour -> state), n (states), pos (hour), speed() -> '1'|'3'|'6'|'true', ready(i),
  // failed(i), wait(i, cb) (cb once state i has loaded or failed), go(hour), note('starting'|'waiting'|''), env {setTimeout, clearTimeout}}
  function makePlayer(o) {
    var P = { playing: false, pos: o.pos || 0, gen: 0, timer: null, holding: -1 };
    function settledState(i) { return o.ready(i) || o.failed(i); }
    function nextHour(h) {
      var cur = o.hs[h], k = 1;
      if (o.speed() === 'true') return (h + 1) % 24;
      while (k < 24 && o.hs[(h + k) % 24] === cur) k++;
      return (h + k) % 24;
    }
    function delay() { return o.speed() === 'true' ? 1000 : (+o.speed() || 3) * 1000; }
    function later(fn, ms) { o.env.clearTimeout(P.timer); P.timer = o.env.setTimeout(fn, ms); }
    function hold(i, g, then) {   // wait for state i's image; then() again once it has loaded or failed
      P.holding = i; o.note(then === begin ? 'starting' : 'waiting');
      o.wait(i, function () { if (P.gen === g && P.playing) { P.holding = -1; o.note(''); then(); } });
    }
    function step() {
      var g = P.gen, h = P.pos, h2 = h, i, k, passed = 0;
      P.timer = null;
      if (!P.playing) return;
      for (k = 0; k < 25; k++) {
        h2 = nextHour(h2); i = o.hs[h2];
        if (h2 === h) break;                                   // round the clock with nothing else to show
        if (o.ready(i) || (i === o.hs[h] && !passed)) {        // its image has loaded, or (true to time) the same state an hour on
          P.pos = h2; o.go(h2); later(step, delay()); return;
        }
        if (!o.failed(i)) { hold(i, g, step); return; }        // A3: not loaded yet - the state on screen stays until it is
        passed++;                                              // every source failed: passed over
      }
      later(step, delay());                                    // nothing loaded to move to: stay here
    }
    function begin() {   // A3: start once the first two states in order are ready
      var ord = stateOrder(o.hs, P.pos, o.n), g = P.gen, k;
      if (!P.playing) return;
      for (k = 0; k < Math.min(2, ord.length); k++) if (!settledState(ord[k])) { hold(ord[k], g, begin); return; }
      later(step, delay());
    }
    P.play = function () { if (P.playing) return; P.playing = true; P.gen++; begin(); };
    P.pause = function () { P.playing = false; P.gen++; P.holding = -1; o.env.clearTimeout(P.timer); P.timer = null; o.note(''); };
    P.seek = function (h) { P.pos = ((Math.floor(h) % 24) + 24) % 24; };
    return P;
  }
  /*</av-queue>*/
  /*<av-shuffle>*/
  // ---------------------------------------------------------------- Shuffle for a lever work (Chat's note of 24 Sep, B1-B4)
  // Pure code, like the queue above: patches/test_async_shuffle.js runs this very text in Node on a fake clock. A lever work's layers
  // are stacked in their order, as our composites of 22 Sep were (every layer on the whole canvas, transparent areas on white); every
  // ~5 s each lever layer takes a random value of its lever, the fixed layers stay. Every such picture carries SHUFFLE_CAPTION.
  var SHUFFLE_CAPTION = 'A possible combination — not the current on-chain state';
  var SHUFFLE_EVERY = 5000;
  function leverChoices(L) {   // the options a layer can show: a lever's range (min..max, our snapshot) within its options; a fixed layer its one
    var n = ((L && L.options) || []).length, lo = 0, hi = n - 1, out = [], k, sn = L && L.snapshot;
    if (!L || L.control !== 'lever') return n ? [0] : [];
    if (sn && isFinite(parseInt(sn.min, 10)) && isFinite(parseInt(sn.max, 10))) { lo = Math.max(0, parseInt(sn.min, 10)); hi = Math.min(n - 1, parseInt(sn.max, 10)); }
    for (k = lo; k <= hi; k++) out.push(k);
    return out;
  }
  function combinations(layers) {   // how many pictures the levers can make: the product of each lever layer's choices (a fixed layer counts 1)
    var n = 1;
    (layers || []).forEach(function (L) { if (L.control === 'lever') n *= leverChoices(L).length; });
    return n;
  }
  function fmtCount(n) {   // 68719476736 -> "68,719,476,736"
    var s = String(Math.round(n)), out = '';
    if (!/^\d+$/.test(s)) return s;
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    return s + out;
  }
  function shuffleVerdict(m) {   // '' when this work may be shuffled here; else the reason, shown on the page, and nothing is shuffled (B3)
    var ls = (m && m.layers) || [], sh = m && m.shuffle;
    if (!m) return 'its data did not load';
    if (!ls.some(function (L) { return L.control === 'lever'; })) return 'it has no lever layer';
    if (m.faithful === false || (sh && sh.ok === false)) return (sh && sh.why) || m.why || 'its layout is not reproduced faithfully here';
    if (!sh) return 'this site has no Shuffle data for it';
    if (ls.some(function (L) { return L.control !== 'lever' && L.control !== 'static'; })) return 'a layer is driven by something other than a lever';
    if (ls.some(function (L) { return !leverChoices(L).length; })) return 'a layer has no option to show';
    return '';
  }
  // one option per layer: a fixed layer keeps its own, each lever layer a random one of its choices. usable(j, k): false for an option
  // whose image failed from every source (never picked); avoid: the combination on screen (not shown twice in a row). null: some
  // layer has nothing usable left.
  function pickCombo(layers, rnd, usable, avoid) {
    var tries, out, j, cs, pick;
    function ok(j) { return function (k) { return !usable || usable(j, k); }; }
    for (tries = 0; tries < 20; tries++) {
      out = [];
      for (j = 0; j < layers.length; j++) {
        cs = leverChoices(layers[j]).filter(ok(j));
        if (!cs.length) return null;
        pick = layers[j].control === 'lever' ? cs[Math.min(cs.length - 1, Math.floor(rnd() * cs.length))] : cs[0];
        out.push(pick);
      }
      if (!avoid || out.join() !== avoid.join()) return out;
    }
    return out;
  }
  function comboList(layers, opts) {   // what the caption lists: each layer and the option it shows
    return layers.map(function (L, j) {
      var o = (L.options || [])[opts[j]] || {};
      return { layer: L.label || L.id || ('layer ' + (j + 1)), option: o.label || ('option ' + (opts[j] + 1)), fixed: L.control !== 'lever' };
    });
  }
  // makeShuffler(o) - the Shuffle's clock (B1, with A3's rule): it shows a combination only once every layer image of it has loaded
  // (the picture on screen stays until then), re-picks when one failed from every source, and runs its ~5 s clock only once the first
  // two combinations are ready. o: {layers, rnd(), every (ms), usable(j, k), ready(c), failedAny(c), wait(c, cb) (cb once each layer
  // image of c has loaded or failed; it also puts them first in the queue), show(c), note('starting'|'waiting'|'stopped'|''),
  // env {setTimeout, clearTimeout}}
  function makeShuffler(o) {
    var S = { playing: false, cur: null, next: null, gen: 0, timer: null, shown: 0, stopped: false };
    function later(fn, ms) { o.env.clearTimeout(S.timer); S.timer = o.env.setTimeout(fn, ms); }
    function roll() { return pickCombo(o.layers, o.rnd, o.usable, S.cur); }
    function settle(c, g, then, k) {   // then(c) once every layer image of c has loaded; one that failed: another combination
      if (S.gen !== g) return;
      if (!c) { S.stopped = true; S.playing = false; o.note('stopped'); return; }
      if (o.ready(c)) { then(c); return; }
      if (o.failedAny(c)) { settle((k || 0) < 50 ? roll() : null, g, then, (k || 0) + 1); return; }
      o.wait(c, function () { settle(c, g, then, k); });
    }
    function put(c) { S.cur = c; S.shown++; o.show(c); }
    function run(g) {   // the clock: the next combination is due every `every` ms; a ready one moves at once, else the picture holds
      later(function step() {
        var c;
        S.timer = null;
        if (!S.playing || S.gen !== g) return;
        c = S.next || roll(); S.next = null;
        if (c && o.ready(c)) { put(c); S.next = roll(); if (S.next) o.wait(S.next, function () {}); run(g); return; }
        o.note('waiting');
        settle(c, g, function (c2) { if (!S.playing) return; o.note(''); put(c2); S.next = roll(); if (S.next) o.wait(S.next, function () {}); run(g); });
      }, o.every);
    }
    function begin(g) {   // the first combination on screen as soon as it has loaded; the clock once the second is ready too
      o.note('starting');
      settle(S.cur ? S.cur : roll(), g, function (c) {
        if (c !== S.cur) put(c);
        S.next = S.next || roll();
        settle(S.next, g, function (c2) { S.next = c2; if (S.playing) { o.note(''); run(g); } });
      });
    }
    S.play = function () { if (S.playing || S.stopped) return; S.playing = true; S.gen++; begin(S.gen); };
    S.pause = function () { S.playing = false; S.gen++; o.env.clearTimeout(S.timer); S.timer = null; o.note(''); };
    S.another = function () {   // one more combination now (the visitor's button; while paused it stays paused)
      var g, was = S.playing;
      if (S.stopped) return;
      S.gen++; g = S.gen; o.env.clearTimeout(S.timer); S.timer = null;
      o.note('waiting');
      settle(S.next || roll(), g, function (c) { o.note(''); put(c); S.next = roll(); if (was && S.playing) run(g); });
    };
    return S;
  }
  /*</av-shuffle>*/

  // ---------------------------------------------------------------- the browser's side of the queue: one request for one file
  // XMLHttpRequest, as a blob: every chunk that arrives is progress (A4), and the picture then shows at once from the blob, with no
  // second download. (fetch with a stream reader was measured on 24 Sep: headless Edge reports some fully read responses as
  // cancelled - XMLHttpRequest reports none.) No timeout is set and nothing calls abort. A cross-origin answer this page may not read
  // (a gateway without CORS) is asked once more as a plain image, without progress.
  function sameOrigin(u) { return !/^https?:\/\//i.test(u) || u.indexOf(location.protocol + '//' + location.host + '/') === 0; }
  function revoke(u) { try { if (u) URL.revokeObjectURL(u); } catch (e) { /* ignore */ } }
  function requestFile(src, h) {
    var x, answered = false;
    function asImage(url, obj) {
      var im = new Image();
      im.onload = function () { h.done({ url: url, img: im, obj: obj }); };
      im.onerror = function () { revoke(obj); h.fail(new Error('not an image')); };
      im.src = url;
    }
    if (!(window.XMLHttpRequest && window.URL && URL.createObjectURL && window.Blob)) { asImage(src, null); return; }
    x = new XMLHttpRequest();
    x.open('GET', src, true);
    x.responseType = 'blob';
    x.onreadystatechange = function () { if (x.readyState >= 2 && x.status && !answered) { answered = true; h.progress(0); } };   // an answer is progress
    x.onprogress = function (e) { answered = true; h.progress(e.loaded || 0); };
    x.onload = function () {
      if (x.status !== 200 || !x.response) { h.fail(new Error('HTTP ' + x.status)); return; }
      var u = URL.createObjectURL(x.response);
      asImage(u, u);
    };
    x.onerror = function () {
      if (!answered && !sameOrigin(src)) asImage(src, null);
      else h.fail(new Error('network'));
    };
    x.send();
  }
  var QUEUE = makeQueue({
    now: function () { return Date.now(); },
    setTimeout: function (fn, ms) { return window.setTimeout(fn, ms); },
    clearTimeout: function (t) { window.clearTimeout(t); },
    request: requestFile,
    discard: function (res) { if (res) revoke(res.obj); }
  }, { max: MAX_PARALLEL, stall: STALL });
  var TIMERS = { setTimeout: function (fn, ms) { return window.setTimeout(fn, ms); }, clearTimeout: function (t) { window.clearTimeout(t); } };
  function gatewaySrcs(cid) { return cid ? GATEWAYS.map(function (g) { return g + cid; }) : []; }
  function fileImage(f) {   // -> a Promise of the loaded file's image
    return new Promise(function (ok, no) {
      QUEUE.want(f, 0);
      QUEUE.on(f, function () { if (f.ok) ok(f.result.img); else no(new Error('not reachable on this site or the public gateways')); });
    });
  }

  // ---------------------------------------------------------------- the data (inline on a detail page, else <base><id>.json)
  var DATA = {};
  function master(id) {
    if (!DATA[id]) {
      var inline = readJSON('av-master-' + id);
      DATA[id] = inline ? Promise.resolve(inline) : fetch(BASE + id + '.json', { credentials: 'omit' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    }
    return DATA[id];
  }

  // ---------------------------------------------------------------- lever values on-chain (read-only eth_call; our snapshot if every RPC fails)
  function hex64(n) { var h = Number(n).toString(16); while (h.length < 64) h = '0' + h; return h; }
  function word(hex, i) { return hex.slice(i * 64, i * 64 + 64); }
  function toInt(w) {   // int256, small values
    var neg = parseInt(w.charAt(0), 16) >= 8, low = parseInt(w.slice(-12), 16);
    return neg ? low - 281474976710656 : low;
  }
  function getControlToken(contract, token) {
    var body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: contract, data: GET_CONTROL_TOKEN + hex64(token) }, 'latest'] });
    var k = 0;
    function attempt() {
      if (k >= RPCS.length) return Promise.reject(new Error('no public RPC answered'));
      var url = RPCS[k++];
      return withTimeout(fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, credentials: 'omit' }), RPC_TIMEOUT)
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var res = j && j.result, hex, n, out = [], i;
          if (!res || res.length < 130) throw new Error('empty answer');
          hex = res.slice(2); n = parseInt(word(hex, 1), 16);
          if (!(n >= 0 && n < 300)) throw new Error('unexpected answer');
          for (i = 0; i < n; i++) out.push(toInt(word(hex, 2 + i)));
          return { vals: out, via: url.replace(/^https:\/\//, '').split('/')[0] };
        })
        .catch(function () { return attempt(); });
    }
    return attempt();
  }

  // ---------------------------------------------------------------- a stage: two images for the cross-fade, or a canvas
  function Stage() {
    this.box = el('div', { 'class': 'av-stage' });
    this.ph = el('div', { 'class': 'av-ph', hidden: '' });   // the state's tile of the strip while its image loads (or fails)
    this.imgs = [el('img', { alt: '', 'class': 'av-img' }), el('img', { alt: '', 'class': 'av-img' })];
    this.front = 0; this.key = null; this.tok = null; this.canvas = null; this.shownKey = null; this.onshow = null;
    this.msg = el('div', { 'class': 'av-msg', 'aria-live': 'polite' });
    this.box.appendChild(this.ph); this.box.appendChild(this.imgs[0]); this.box.appendChild(this.imgs[1]); this.box.appendChild(this.msg);
  }
  Stage.prototype.ratio = function (w, h) {
    if (!(w && h)) return;
    this.box.style.setProperty('--av-ar', String(w / h));
    this.box.style.setProperty('--av-ratio', (100 * h / w).toFixed(3) + '%');
  };
  Stage.prototype.placeholder = function (m, i) {
    var t = m.tiles && m.tiles[i], bw = this.box.clientWidth, bh = this.box.clientHeight, sw = 0, sh = 0, sc, dw, dh, s = this.ph.style;
    if (!t || !m.strip || !bw || !bh) { this.ph.hidden = true; return; }
    m.tiles.forEach(function (x) { sw += x[1]; sh = Math.max(sh, x[2]); });
    sc = Math.min(bw / t[1], bh / t[2]); dw = t[1] * sc; dh = t[2] * sc;   // the tile, contained in the stage like the image
    s.left = Math.round((bw - dw) / 2) + 'px'; s.top = Math.round((bh - dh) / 2) + 'px'; s.width = Math.round(dw) + 'px'; s.height = Math.round(dh) + 'px';
    s.backgroundImage = 'url("' + BASE + m.id + '/' + m.strip + '")';
    s.backgroundSize = Math.round(sw * sc) + 'px ' + Math.round(sh * sc) + 'px';
    s.backgroundPosition = '-' + Math.round(t[0] * sc) + 'px 0';
    this.ph.hidden = false;
  };
  // key: which state; f: its file in the queue; wait: the note while it loads ("loading current state…" in Live and Frame).
  // A file that has loaded shows at once (a cross-fade). One that has not: no stale image under the new caption - the state's
  // tile of the strip shows meanwhile (the caller's placeholder), with the note, and the image replaces it when it arrives.
  Stage.prototype.show = function (key, f, alt, wait) {
    var self = this, tok = {};
    if (this.canvas) this.hideCanvas();
    if (this.key === key) { if (this.shownKey === key) this.ph.hidden = true; return; }
    this.key = key; this.tok = tok;
    if (!f || !f.srcs.length) { this.imgs[this.front].className = 'av-img'; this.shownKey = null; this.msg.textContent = 'No image for this state.'; return; }
    if (f.ok) { this.put(f, alt, tok); return; }
    this.imgs[this.front].className = 'av-img'; this.shownKey = null;
    this.msg.textContent = wait || 'loading…';
    this.box.setAttribute('data-av-waiting', key);
    QUEUE.want(f, 0);   // needed on screen now: first in the queue
    QUEUE.on(f, function () {
      if (self.tok !== tok) return;
      self.box.setAttribute('data-av-tried', f.tried.join(' '));
      if (f.ok) { self.put(f, alt, tok); return; }
      self.box.removeAttribute('data-av-waiting');
      self.msg.textContent = 'This state’s image did not load from this site or the public IPFS gateways just now; the strip shows every state.';
    });
  };
  Stage.prototype.put = function (f, alt, tok) {   // a loaded file on screen (the blob it arrived as: no second download)
    var self = this, back = this.imgs[1 - this.front], key = this.key, url = f.result.url;
    function on() {
      if (self.tok !== tok) return;
      back.onload = back.onerror = null;
      back.alt = alt; back.className = 'av-img on'; self.imgs[self.front].className = 'av-img';
      self.front = 1 - self.front; self.msg.textContent = ''; self.ph.hidden = true; self.shownKey = key;
      self.box.removeAttribute('data-av-waiting');
      self.box.setAttribute('data-av-loaded', /^https?:\/\//i.test(f.from) ? src0(f.from) : 'site');   // which host served it (tests read it)
      self.box.setAttribute('data-av-copy', /^https?:\/\//i.test(f.from) ? 'original' : 'display');
      self.box.setAttribute('data-av-tried', f.tried.join(' '));
      if (self.onshow) self.onshow(f, key);
    }
    back.onload = on;
    back.onerror = function () { if (self.tok === tok) self.msg.textContent = 'This state’s image could not be shown; the strip shows every state.'; };
    if (back.getAttribute('src') === url && back.complete) { on(); return; }   // the back image holds it already (two states in turn)
    back.src = url;
  };
  function src0(u) { return (u || '').split('/').slice(0, 3).join('/'); }   // which host served it (tests read it)
  Stage.prototype.showCanvas = function (cv, fade) {   // fade (Shuffle): the new picture fades in over the old one, which then goes
    var old = this.canvas;
    if (old && old.parentNode && !fade) old.parentNode.removeChild(old);
    this.canvas = cv; cv.className = fade && old ? 'av-img' : 'av-img on'; this.box.insertBefore(cv, this.msg);
    if (fade && old) {
      void cv.offsetWidth;   // start from transparent, so the change of class is a transition
      cv.className = 'av-img on';
      setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); }, 1000);
    }
    this.imgs[this.front].className = 'av-img'; this.key = null;
  };
  Stage.prototype.hideCanvas = function () {   // every canvas off the stage (a Shuffle picture still fading out included)
    [].forEach.call(this.box.querySelectorAll('canvas'), function (c) { if (c.parentNode) c.parentNode.removeChild(c); });
    this.canvas = null;
    if (this.imgs[this.front].getAttribute('src')) this.imgs[this.front].className = 'av-img on';
  };
  function layersCanvas(ims, label) {   // the layers drawn in order on one canvas, as our composites of 22 Sep: each on the whole canvas,
    var ref = ims[0], sc, cw, ch, cv, cx, i, w, h;   // transparent areas on white; layer files of different shapes are refused
    for (i = 1; i < ims.length; i++) if (ims[i].naturalWidth > ref.naturalWidth) ref = ims[i];
    w = ref.naturalWidth; h = ref.naturalHeight;
    for (i = 0; i < ims.length; i++) if (Math.abs(ims[i].naturalWidth / ims[i].naturalHeight - w / h) > 0.01 * (w / h)) throw new Error('the layer files differ in shape');
    sc = Math.min(1, MAX_CANVAS / Math.max(w, h)); cw = Math.round(w * sc); ch = Math.round(h * sc);
    cv = el('canvas', { width: String(cw), height: String(ch), role: 'img', 'aria-label': label });
    cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, cw, ch);   // transparent areas on white, as async_masters.py flattens them
    ims.forEach(function (im) { cx.drawImage(im, 0, 0, cw, ch); });   // each layer on the whole canvas (the display copies of a work share one size)
    return { cv: cv, w: w, h: h };
  }

  // ---------------------------------------------------------------- one viewer per work
  var TIMED = /hourly|day\/night|four-phase|states/;
  function Viewer(t) {
    this.root = t.root; this.id = t.id; this.kind = t.kind || ''; this.still = t.still || null; this.detail = t.detail || null;
    this.keepStill = !!t.keepStill; this.m = null; this.mode = 'strip'; this.timer = null; this.playing = false; this.pos = 0;
    this.speed = sget('speed') || '3'; this.local = sget('local') === '1'; this.chain = null; this.chainState = 'unread';
    this.preview = {}; this.layered = false; this.lastLabel = null; this.stage = new Stage(); this.frameStage = null;
    this.timed = TIMED.test(this.kind); this.optLis = []; this.leverSpans = []; this.player = null; this.fprog = null; this.preloading = false;
    // B: a lever work (kind lever-controlled, or marked by the builder when its layout is not reproduced) gets Current state and Shuffle
    this.lever = !this.timed && (this.kind === 'lever-controlled' || !!t.lever); this.snap = t.snap || '';
    this.shuffler = null; this.shuffleFiles = null; this.shufflePreloading = false; this.badge = null; this.combo = null;
    this.build();
  }
  Viewer.prototype.build = function () {
    var self = this, modes = [];
    this.root.setAttribute('data-av-state', 'ready');
    this.bar = el('div', { 'class': 'av-bar', role: 'group', 'aria-label': 'Ways to show this work' });
    this.btn = {};
    if (this.timed) modes = [['strip', 'Strip', 'The distinct states side by side, with their hours (the default)'],
                             ['live', 'Live', 'The state for the current time; it changes on its own at each boundary'],
                             ['slideshow', 'Slideshow', 'The distinct states in time order'],
                             ['frame', 'Frame', 'Full screen, Live, no controls: for a TV or a digital frame (Esc or a click leaves)']];
    else if (this.lever) modes = [['strip', 'Current state', 'The levers as read on-chain' + (this.snap ? ' on ' + this.snap : '') + ': our composite (the default)'],
                                  ['shuffle', 'Shuffle', 'Random combinations of the lever layers, a new one about every 5 s; none of them is the current on-chain state']];
    modes.forEach(function (x) {
      var b = el('button', { type: 'button', 'data-mode': x[0], title: x[2], 'aria-pressed': x[0] === 'strip' ? 'true' : 'false', text: x[1] });
      b.addEventListener('click', function () { self.choose(x[0], true); });
      self.bar.appendChild(b); self.btn[x[0]] = b;
    });
    this.lbtn = el('button', { type: 'button', 'aria-expanded': 'false', title: 'Each layer, its states and what drives it', text: 'Layers' });
    this.lbtn.addEventListener('click', function () { self.toggleLayers(); });
    this.bar.appendChild(this.lbtn);
    if (this.detail) this.bar.appendChild(el('a', { href: this.detail, 'class': 'av-more', text: 'details' }));
    this.note = el('span', { 'class': 'av-note', 'aria-live': 'polite' });
    this.bar.appendChild(this.note);
    this.body = el('div', { 'class': 'av-body', hidden: '' });
    this.cap = el('div', { 'class': 'av-cap', 'aria-live': 'polite' });
    this.ctl = el('div', { 'class': 'av-ctl' });
    this.prog = el('div', { 'class': 'av-prog', hidden: '' });   // A2: the thin bar under the picture while the states load
    this.srcLine = el('div', { 'class': 'av-src', hidden: '' });   // A5: what the picture is - a display copy, or the original - and the original's link
    this.stage.onshow = function (f, key) { self.label(f, key); };
    this.body.appendChild(this.stage.box); this.body.appendChild(this.prog); this.body.appendChild(this.srcLine);
    this.body.appendChild(this.cap); this.body.appendChild(this.ctl);
    this.panel = el('div', { 'class': 'av-layers', hidden: '' });
    this.root.appendChild(this.bar); this.root.appendChild(this.body); this.root.appendChild(this.panel);
    if (this.lever) this.buildCur();
  };
  // B1: under a lever work's still (our composite), what it is: "Current state", the levers as read on-chain on the snapshot's date. On
  // a work's own page the still is the state's display copy: its label and the original's link too (the page's inline data, no request)
  Viewer.prototype.buildCur = function () {
    var inl, s0, src = this.still && this.still.getAttribute && (this.still.getAttribute('src') || '');
    this.curLine = el('div', { 'class': 'av-cur' });
    this.curLine.appendChild(el('b', { text: 'Current state' }));
    this.curLine.appendChild(document.createTextNode(': the levers as read on-chain' + (this.snap ? ' on ' + this.snap : '') + ' (our composite)'));
    if (CFG.page === 'detail' && /(^|\/)display\//.test(src || '')) {
      inl = readJSON('av-master-' + this.id); s0 = inl && inl.states && inl.states[0];
      this.curLine.appendChild(document.createTextNode(' · ' + DISPLAY_NOTE));
      if (s0 && s0.cid) { this.curLine.appendChild(document.createTextNode(' · ')); this.curLine.appendChild(el('a', { href: GATEWAYS[0] + s0.cid, rel: 'noopener', text: 'open the original' })); }
    }
    this.root.insertBefore(this.curLine, this.bar);
    this.syncCur();
  };
  Viewer.prototype.syncCur = function () { if (this.curLine) this.curLine.hidden = !this.still || !!this.still.hidden; };
  Viewer.prototype.ensure = function (cb) {
    var self = this;
    if (this.m) { cb(); return; }
    this.note.textContent = 'loading…';
    master(this.id).then(function (m) { self.m = m; self.note.textContent = ''; cb(); }, function () {
      self.note.textContent = 'The viewer’s data did not load; the strip stays.';
      self.choose('strip', false);
    });
  };
  Viewer.prototype.stop = function () { clearTimeout(this.timer); this.timer = null; this.playing = false; if (this.player) this.player.pause(); if (this.shuffler) this.shuffler.pause(); };
  Viewer.prototype.choose = function (mode, user) {
    var self = this, k;
    if (!this.btn[mode] && mode !== 'strip') mode = 'strip';
    if (mode === 'frame') { this.ensure(function () { self.openFrame(false); }); return; }
    if (this.mode === 'shuffle') this.leaveShuffle();
    if (mode === 'shuffle' && this.layered) { this.layered = false; this.preview = {}; this.composedKey = null; this.stage.hideCanvas(); if (!this.panel.hidden) this.renderPanel(); }
    this.stop(); this.mode = mode;
    if (user) sset('mode.' + this.id, mode);
    for (k in this.btn) if (Object.prototype.hasOwnProperty.call(this.btn, k)) this.btn[k].setAttribute('aria-pressed', String(k === mode));
    this.root.setAttribute('data-av-mode', mode);
    if (mode === 'strip') {
      if (this.layered) { this.layered = false; this.preview = {}; this.composedKey = null; this.stage.hideCanvas(); if (!this.panel.hidden) this.renderPanel(); }
      this.body.hidden = true; this.ctl.textContent = '';
      if (this.still) this.still.hidden = false;
      this.unload();
      this.syncPanel(); this.syncCur();
      return;
    }
    this.ensure(function () {
      if (self.mode !== mode) return;
      if (mode === 'shuffle') { self.startShuffle(); self.syncCur(); return; }
      if (!self.m.states || !self.m.states.length) { self.note.textContent = 'No state images for this layout.'; return; }
      self.body.hidden = false;
      if (self.still && !self.keepStill) self.still.hidden = true;
      self.stage.placeholder(self.m, 0);
      if (mode === 'live') self.startLive(); else self.startSlides(user);
    });
  };

  // ---- the image of a state: its sources in order (A5: the site's display copy first, then the original on the IPFS gateways, O15)
  Viewer.prototype.srcs = function (i) {
    var s = this.m.states[i], out = [];
    if (!s) return out;
    if (s.display) out.push(BASE + s.display);
    if (s.web) out.push(BASE + this.id + '/' + s.web);
    return out.concat(gatewaySrcs(s.cid));
  };
  Viewer.prototype.file = function (i) {   // state i's image in the page's queue (one entry per file, whoever asks for it)
    var s = this.srcs(i);
    return QUEUE.file(s[0] || ('none:' + this.id + ':' + i), s);
  };
  Viewer.prototype.showState = function (i) {
    var st = this.frameStage || this.stage, s = this.m.states[i], live = this.mode === 'live' || this.mode === 'frame';
    this.shown = i;
    this.root.setAttribute('data-av-shown', s ? s.label : '');
    if (this.layered) { this.compose(); this.syncPanel(); return; }
    if (!s) return;
    st.ratio(s.w, s.h);
    st.placeholder(this.m, i);   // the state's tile of the strip while its image loads - in Frame too (review of 25 Sep: black before)
    st.show(this.id + ':' + i, this.file(i), this.m.title + ' — ' + s.label, live ? 'loading current state…' : 'loading this state…');
    if (st === this.stage && !this.file(i).ok && this.srcLine) this.srcLine.hidden = true;   // still loading: the label comes back with the picture
    this.syncPanel();
  };
  // A1/A2: every state's image at once, in the order they will be shown from hour h (the queue sends at most 4 requests at a time,
  // page-wide); the bar under the picture counts them and goes when all have loaded
  Viewer.prototype.preloadAll = function (h) {
    var self = this, m = this.m;
    if (!m.states || !m.states.length) return;
    this.preloading = true;
    stateOrder(m.hour_state, h || 0, m.states.length).forEach(function (i, rank) {
      var f = self.file(i);
      QUEUE.want(f, rank + 1);
      QUEUE.on(f, function () { self.progress(); });
    });
    this.progress();
  };
  Viewer.prototype.unload = function () {   // back to the strip: the states not asked for yet leave the queue (a request once sent runs on)
    var self = this;
    if (!this.m || !this.preloading) return;
    this.preloading = false;
    (this.m.states || []).forEach(function (s, i) { QUEUE.drop(self.file(i)); });
  };
  Viewer.prototype.progress = function () {
    var self = this, n = 0, ok = 0, bad = 0;
    (this.m.states || []).forEach(function (s, i) { var f = self.file(i); n++; if (f.ok) ok++; else if (f.failed) bad++; });
    this.root.setAttribute('data-av-loaded-states', ok + '/' + n + (bad ? ' (' + bad + ' failed)' : ''));
    [this.prog, this.fprog].forEach(function (p) {
      if (!p) return;
      p.textContent = '';
      if (!self.preloading) { p.hidden = true; return; }   // the strip (or the layered view over it): no preload running
      if (ok === n || n < 2) { p.hidden = true; p.setAttribute('data-av-prog', 'all'); return; }   // all loaded: the bar goes
      p.hidden = false;
      if (ok + bad === n) {   // every state settled, some without an image
        p.setAttribute('data-av-prog', 'done');
        p.appendChild(el('span', { 'class': 'av-prog-t', text: bad + ' of ' + n + ' states did not load just now; the strip shows every state' }));
        return;
      }
      p.setAttribute('data-av-prog', ok + '/' + n);
      p.appendChild(el('div', { 'class': 'av-prog-bar', role: 'progressbar', 'aria-label': 'states loaded', 'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': String(ok) },
                       [el('i', { style: 'width:' + (100 * ok / n).toFixed(1) + '%' })]));
      p.appendChild(el('span', { 'class': 'av-prog-t', text: 'Loading states ' + ok + ' of ' + n }));
    });
  };
  Viewer.prototype.label = function (f, key) {   // A5: under the picture, what it is, and the original's link
    var i = +String(key || '').split(':')[1], s = this.m && this.m.states[i], orig = /^https?:\/\//i.test(f.from || ''), a = this.srcLine;
    if (!a) return;
    this.lastLabel = [f, key];
    a.textContent = '';
    a.appendChild(document.createTextNode(orig ? 'the original, from IPFS (' + srcHost(f.from) + ')' : DISPLAY_NOTE));
    if (s && s.cid) { a.appendChild(document.createTextNode(' · ')); a.appendChild(el('a', { href: GATEWAYS[0] + s.cid, rel: 'noopener', text: 'open the original' })); }
    a.setAttribute('data-av-copy', orig ? 'original' : 'display');
    a.hidden = false;
  };
  Viewer.prototype.curHour = function () {
    if (this.mode === 'slideshow') return Math.floor(this.pos) % 24;
    return clockOf(this.m, now(), this.local).h;
  };

  // ---- Live
  Viewer.prototype.startLive = function () {
    var self = this, row, cb, ab, up;
    this.ctl.textContent = '';
    row = el('label', { 'class': 'av-opt' });
    cb = el('input', { type: 'checkbox' }); cb.checked = this.local;
    cb.addEventListener('change', function () { self.local = cb.checked; sset('local', cb.checked ? '1' : '0'); self.live(); });
    row.appendChild(cb); row.appendChild(document.createTextNode(' follow my local time'));
    this.ctl.appendChild(row);
    if (REDUCE) {
      row = el('label', { 'class': 'av-opt' });
      ab = el('input', { type: 'checkbox' }); ab.checked = auto();
      ab.addEventListener('change', function () { sset('auto', ab.checked ? 'on' : 'off'); self.live(); });
      row.appendChild(ab); row.appendChild(document.createTextNode(' change on its own (your device asks for reduced motion)'));
      this.ctl.appendChild(row);
      up = el('button', { type: 'button', text: 'update now' });
      up.addEventListener('click', function () { self.live(); });
      this.ctl.appendChild(up);
    }
    this.live();
    this.preloadAll(clockOf(this.m, now(), this.local).h);   // A1: every state at once, from the current one
  };
  Viewer.prototype.live = function () {
    var self = this, m = this.m, c = clockOf(m, now(), this.local), i = m.hour_state ? m.hour_state[c.h] : 0, nc, s, toMin, wait;
    clearTimeout(this.timer); this.timer = null;
    if (this.mode !== 'live' && this.mode !== 'frame') return;
    this.showState(i);
    nc = nextChange(m, c); s = m.states[i];
    this.root.setAttribute('data-av-next', nc ? String(Math.round(nc.ms / 1000)) : '');
    if (!this.frameStage) {
      this.cap.textContent = '';
      this.cap.appendChild(el('b', { text: s.label }));
      this.cap.appendChild(document.createTextNode(' · ' + (m.hour_state ? ranges(s.hours) + ' ' + (this.local ? '(your time)' : '(' + c.zone + ')') : 'all day')));
      this.cap.appendChild(el('br'));
      this.cap.appendChild(document.createTextNode('now ' + pad(c.h) + ':' + pad(c.mi) + ' ' + (this.local ? 'your local time' : 'artwork time, ' + c.zone) + (nc ? ' · next change in ' + fmtIn(nc.ms) + ' (' + m.states[nc.to].label + ')' : '')));
      if (!auto()) this.cap.appendChild(el('span', { 'class': 'av-note', text: ' · changes on its own only if you turn it on' }));
    }
    if (auto() && m.hour_state) {
      toMin = 60000 - (c.s * 1000 + c.ms);
      wait = nc ? Math.min(nc.ms, toMin) : toMin;
      this.timer = setTimeout(function () { self.live(); }, Math.max(250, wait + 200));
    }
  };

  // ---- Slideshow
  Viewer.prototype.startSlides = function (user, hour) {
    var self = this, m = this.m, sel, pb, rng, out;
    this.ctl.textContent = '';
    pb = el('button', { type: 'button', 'class': 'av-play', 'aria-pressed': 'false', text: '▶ play' });
    pb.addEventListener('click', function () { if (self.playing) self.pause(); else self.play(); });
    sel = el('select', { 'aria-label': 'speed' });
    SPEEDS.forEach(function (x) { var o = el('option', { value: x[0], text: x[1] }); if (x[0] === self.speed) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', function () { self.speed = sel.value; sset('speed', sel.value); if (self.playing) { self.pause(); self.play(); } });
    rng = el('input', { type: 'range', min: '0', max: '23', step: '1', 'aria-label': 'hour of the day' });
    out = el('output', { 'class': 'av-hour' });
    rng.addEventListener('input', function () { self.pause(); self.slide(+rng.value); });
    this.smsg = el('span', { 'class': 'av-note av-smsg', 'aria-live': 'polite' });
    this.ctl.appendChild(pb); this.ctl.appendChild(sel); this.ctl.appendChild(rng); this.ctl.appendChild(out); this.ctl.appendChild(this.smsg);
    this.pbtn = pb; this.range = rng; this.hourOut = out;
    this.slide(hour !== undefined ? hour : clockOf(m, now(), this.local).h);
    this.preloadAll(this.pos);   // A1: every state at once, from the one on screen
    if (hour === undefined && auto()) this.play();
  };
  Viewer.prototype.slide = function (h) {
    var m = this.m, i, s;
    this.pos = ((Math.floor(h) % 24) + 24) % 24;
    if (this.player) this.player.seek(this.pos);
    i = m.hour_state ? m.hour_state[this.pos] : 0; s = m.states[i];
    this.showState(i);
    if (this.range) this.range.value = String(this.pos);
    if (this.hourOut) this.hourOut.textContent = pad(this.pos) + ':00';
    this.root.setAttribute('data-av-hour', String(this.pos));
    this.cap.textContent = '';
    this.cap.appendChild(el('b', { text: s.label }));
    this.cap.appendChild(document.createTextNode(' · ' + ranges(s.hours) + ' (' + (this.local ? 'your time' : (m.tz && m.tz.label) || 'UTC') + ') · state ' + (i + 1) + ' of ' + m.states.length));
  };
  // A3: the slideshow's clock (makePlayer) never moves to a state whose image has not loaded and starts once the first two are ready
  Viewer.prototype.play = function () {
    var self = this;
    clearTimeout(this.timer); this.playing = true;
    if (this.pbtn) { this.pbtn.textContent = '❚❚ pause'; this.pbtn.setAttribute('aria-pressed', 'true'); }
    this.root.setAttribute('data-av-playing', '1');
    if (!this.m.hour_state) return;
    if (!this.player) this.player = makePlayer({
      hs: this.m.hour_state, n: this.m.states.length, pos: this.pos, env: TIMERS,
      speed: function () { return self.speed; },
      ready: function (i) { return self.file(i).ok; },
      failed: function (i) { return self.file(i).failed; },
      wait: function (i, cb) { var f = self.file(i); QUEUE.want(f, 0); QUEUE.on(f, function () { cb(); }); },
      go: function (h) { if (self.mode === 'slideshow' && self.playing) self.slide(h); },
      note: function (k) { self.slideNote(k); }
    });
    this.player.seek(this.pos);
    this.player.play();
  };
  Viewer.prototype.pause = function () {
    clearTimeout(this.timer); this.timer = null; this.playing = false;
    if (this.player) this.player.pause();
    this.root.setAttribute('data-av-playing', '0');
    if (this.pbtn) { this.pbtn.textContent = '▶ play'; this.pbtn.setAttribute('aria-pressed', 'false'); }
  };
  Viewer.prototype.slideNote = function (k) {   // what the slideshow waits for, if anything
    this.root.setAttribute('data-av-hold', k || '');
    if (this.smsg) this.smsg.textContent = k === 'starting' ? 'starts once the first two states have loaded…' : k === 'waiting' ? 'waiting for the next state to load…' : '';
  };

  // ---- Frame
  Viewer.prototype.openFrame = function (fromLink) {
    var self = this, ov, st;
    if (this.frameStage) return;
    this.prevMode = this.mode === 'frame' ? 'strip' : this.mode; this.stop();
    ov = el('div', { 'class': 'av-frame', role: 'dialog', tabindex: '-1', 'aria-label': (this.m.title || '') + ' - frame (Esc or a click leaves)' });
    st = new Stage(); ov.appendChild(st.box);
    this.fprog = el('div', { 'class': 'av-prog av-fprog', hidden: '' }); ov.appendChild(this.fprog);   // A2: the bar, at the foot of the frame
    document.body.appendChild(ov);
    document.documentElement.classList.add('av-framed');
    this.frameStage = st; this.overlay = ov; this.mode = 'frame'; this.root.setAttribute('data-av-mode', 'frame');
    this.fsAsked = false;
    function enterFs() {
      try {
        if (ov.requestFullscreen) { self.fsAsked = true; var p = ov.requestFullscreen(); if (p && p.catch) p.catch(function () { self.fsAsked = false; }); }
      } catch (e) { self.fsAsked = false; }
    }
    ov.addEventListener('click', function () {
      if (fromLink && !document.fullscreenElement && ov.requestFullscreen && !self.fsTried) { self.fsTried = true; enterFs(); return; }   // a frame opened by a link: the first click goes full screen
      self.closeFrame();
    });
    this.onKey = function (e) { if (e.key === 'Escape' || e.key === 'Esc') self.closeFrame(); };
    this.onFs = function () { if (!document.fullscreenElement && self.fsAsked && self.frameStage) self.closeFrame(); };
    this.onResize = function () { if (self.frameStage && !self.frameStage.ph.hidden && self.m) self.frameStage.placeholder(self.m, self.shown); };   // the tile follows the frame's size (full screen)
    window.addEventListener('resize', this.onResize);
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('fullscreenchange', this.onFs);
    if (!fromLink) enterFs();
    try { ov.focus(); } catch (e) { /* ignore */ }
    this.live();
    this.preloadAll(clockOf(this.m, now(), this.local).h);   // A1: every state at once, from the current one
  };
  Viewer.prototype.closeFrame = function () {
    if (!this.frameStage) return;
    clearTimeout(this.timer);
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('fullscreenchange', this.onFs);
    window.removeEventListener('resize', this.onResize);
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) { /* ignore */ }
    this.frameStage.tok = null;   // a frame image still on its way is no longer shown (its request runs on: nothing is aborted)
    if (this.overlay && this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
    document.documentElement.classList.remove('av-framed');
    this.frameStage = null; this.overlay = null; this.fprog = null; this.mode = 'strip';
    this.choose(this.prevMode || 'strip', false);
  };

  // ---- Layers
  Viewer.prototype.toggleLayers = function () {
    var self = this, open = this.panel.hidden;
    this.lbtn.setAttribute('aria-expanded', String(open));
    if (!open) { this.panel.hidden = true; return; }
    this.ensure(function () { self.panel.hidden = false; self.renderPanel(); self.readChain(); });
  };
  Viewer.prototype.levers = function () { return (this.m.layers || []).filter(function (L) { return L.control === 'lever'; }); };
  Viewer.prototype.leverValue = function (L, j) {
    var v = null, c = this.chain && this.chain[L.token];
    if (this.preview[j] !== undefined) return this.preview[j];
    if (c && c.vals && c.vals.length >= 3 * L.lever + 3) v = c.vals[3 * L.lever + 2];
    if (v === null || v < 0 || v >= L.options.length) v = L.snapshot ? L.snapshot.value : 0;
    return v;
  };
  Viewer.prototype.activeOpts = function () {
    var self = this, h = this.curHour();
    return (this.m.layers || []).map(function (L, j) {
      if (L.control === 'time') return ruleOpt(L, h);
      if (L.control === 'lever') return self.leverValue(L, j);
      return 0;
    });
  };
  Viewer.prototype.readChain = function () {
    var self = this, ls = this.levers(), toks = {}, jobs = [];
    if (!ls.length || this.chainState !== 'unread') return;
    this.chainState = 'reading'; this.chain = {};
    ls.forEach(function (L) { toks[L.token] = true; });
    Object.keys(toks).forEach(function (t) {
      jobs.push(getControlToken(self.m.contract, t).then(function (r) { self.chain[t] = r; }, function (e) { self.chain[t] = { err: e.message }; }));
    });
    Promise.all(jobs).then(function () {
      var ok = Object.keys(self.chain).some(function (t) { return self.chain[t].vals; });
      self.chainState = ok ? 'read' : 'failed'; self.chainAt = new Date(now());
      self.root.setAttribute('data-av-chain', self.chainState);
      if (!self.panel.hidden) self.renderPanel();
      if (self.layered) self.compose();
    });
  };
  Viewer.prototype.driveText = function (L) {
    if (L.control === 'time') return 'time of day (' + (this.local ? 'your time' : (this.m.tz && this.m.tz.label) || 'UTC') + ')';
    if (L.control === 'lever') return 'lever ' + L.lever + ' of control token #' + L.token;
    return L.control === 'static' ? 'fixed' : (L.control || 'fixed');
  };
  Viewer.prototype.renderPanel = function () {
    var self = this, m = this.m, p = this.panel, act = this.activeOpts(), ul, hasLever = this.levers().length > 0, b, snapDate;
    p.textContent = ''; this.optLis = []; this.leverSpans = [];
    if (hasLever) p.appendChild(el('p', { 'class': 'av-context', text: CONTEXT }));
    if (!m.faithful) p.appendChild(el('p', { 'class': 'av-note', text: 'This layout is not reproduced here' + (m.why ? ' (' + m.why + ')' : '') + '; its layers are listed for information.' }));
    ul = el('ul', { 'class': 'av-ll' });
    (m.layers || []).forEach(function (L, j) {
      var li = el('li'), ol = el('ol'), lis = [];
      li.appendChild(el('b', { text: L.label || L.id }));
      li.appendChild(el('span', { 'class': 's', text: ' — ' + self.driveText(L) }));
      if (L.control === 'lever') li.appendChild(self.leverLine(L, j));
      (L.options || []).forEach(function (o, k) {
        var oli = el('li', k === act[j] ? { 'class': 'on', 'aria-current': 'true' } : null), hrs = [];
        oli.appendChild(document.createTextNode(o.label || ('option ' + (k + 1))));
        if (L.control === 'time') {
          for (var h = 0; h < 24; h++) if (ruleOpt(L, h) === k) hrs.push(h);
          if (hrs.length) oli.appendChild(el('span', { 'class': 's', text: ' ' + ranges(hrs) }));
        }
        ol.appendChild(oli); lis.push(oli);
      });
      self.optLis.push(lis);
      li.appendChild(ol); ul.appendChild(li);
    });
    p.appendChild(ul);
    if (m.faithful && m.layers && (m.layers.length > 1 || hasLever)) {
      b = el('button', { type: 'button', 'class': 'av-lv', 'aria-pressed': String(this.layered), text: this.layered ? 'Back to the state image' : 'Layered view: compose here from the ' + m.layers.length + ' layer files' });
      b.addEventListener('click', function () { self.setLayered(!self.layered); });
      p.appendChild(b);
      this.lvMsg = el('span', { 'class': 's av-lvmsg', 'aria-live': 'polite' });
      p.appendChild(this.lvMsg);
    }
    snapDate = m.snapshot_date || '';
    if (hasLever && this.chainState === 'failed') p.appendChild(el('p', { 'class': 'av-note', text: 'The public RPCs did not answer; the lever values shown are our snapshot of ' + snapDate + '.' }));
  };
  Viewer.prototype.leverLine = function (L, j) {
    var self = this, span = el('div', { 'class': 'av-lever' }), c = this.chain && this.chain[L.token], v, sel, lab;
    if (this.chainState === 'reading' || this.chainState === 'unread') span.appendChild(document.createTextNode('reading the lever on-chain… '));
    else if (c && c.vals && c.vals.length >= 3 * L.lever + 3) {
      v = c.vals[3 * L.lever + 2];
      span.appendChild(document.createTextNode('on-chain now: ' + ((L.options[v] || {}).label || ('value ' + v)) + ' (value ' + v + ' of ' + c.vals[3 * L.lever] + '–' + c.vals[3 * L.lever + 1] + '; read ' + pad(this.chainAt.getUTCHours()) + ':' + pad(this.chainAt.getUTCMinutes()) + ' UTC via ' + c.via + ') '));   // UTC, as every other time on the page
    } else if (L.snapshot) {
      span.appendChild(document.createTextNode('our snapshot of ' + (L.snapshot.date || this.m.snapshot_date || '') + ': ' + ((L.options[L.snapshot.value] || {}).label || ('value ' + L.snapshot.value)) + ' (value ' + L.snapshot.value + ' of ' + L.snapshot.min + '–' + L.snapshot.max + (L.snapshot.source ? '; ' + L.snapshot.source : '') + ') '));
    }
    lab = el('label', { 'class': 'av-try' }, ['try another value ']);
    sel = el('select', { 'aria-label': 'preview a value for ' + (L.label || L.id) });
    sel.appendChild(el('option', { value: '', text: 'on-chain value' }));
    L.options.forEach(function (o, k) { var op = el('option', { value: String(k), text: (o.label || ('value ' + k)) }); if (self.preview[j] === k) op.selected = true; sel.appendChild(op); });
    sel.addEventListener('change', function () {
      if (sel.value === '') delete self.preview[j]; else self.preview[j] = +sel.value;
      self.renderPanel();
      if (Object.keys(self.preview).length) self.setLayered(true); else if (self.layered) self.compose();
    });
    lab.appendChild(sel); span.appendChild(lab);
    if (this.preview[j] !== undefined) span.appendChild(el('span', { 'class': 'av-prev', text: ' preview — not on-chain' }));
    return span;
  };
  Viewer.prototype.syncPanel = function () {
    var act, self = this;
    if (!this.m || this.panel.hidden || !this.optLis.length) return;
    act = this.activeOpts();
    this.optLis.forEach(function (lis, j) {
      lis.forEach(function (li, k) {
        if (k === act[j]) { li.className = 'on'; li.setAttribute('aria-current', 'true'); } else { li.className = ''; li.removeAttribute('aria-current'); }
      });
    });
    return self;
  };
  Viewer.prototype.setLayered = function (on) {
    if (on && this.mode === 'shuffle') this.choose('strip', false);   // the layered view (on-chain values, or a preview) ends the Shuffle
    this.layered = !!on; this.composedKey = null;
    if (!on) {
      this.preview = {}; (this.frameStage || this.stage).hideCanvas();
      if (this.lastLabel) this.label(this.lastLabel[0], this.lastLabel[1]); else if (this.srcLine) this.srcLine.hidden = true;   // the state image's own label again
    }
    if (this.mode === 'strip') {
      if (on) {
        this.body.hidden = false;
        if (this.still && !this.keepStill) this.still.hidden = true;
        this.ctl.textContent = ''; this.cap.textContent = '';
        this.compose();
      } else {
        this.body.hidden = true;
        if (this.still) this.still.hidden = false;
      }
    } else if (this.m.states && this.m.states.length) this.showState(this.shown || 0);
    if (!this.panel.hidden) this.renderPanel();
    this.syncCur();
  };
  Viewer.prototype.layerFile = function (j, k) {   // layer j's option k: its display copy first (A5), then the original on the gateways (O15)
    var o = ((this.m.layers[j] || {}).options || [])[k] || {}, s = (o.display ? [BASE + o.display] : []).concat(gatewaySrcs(o.cid));
    return QUEUE.file(s[0] || ('none:' + this.id + ':l' + j + ':' + k), s);
  };
  Viewer.prototype.compose = function () {
    var self = this, m = this.m, st = this.frameStage || this.stage, act = this.activeOpts(), fs, key, pv = Object.keys(this.preview).length > 0;
    fs = m.layers.map(function (L, j) { return self.layerFile(j, L.options[act[j]] ? act[j] : 0); });
    key = fs.map(function (f) { return f.key; }).join(',');
    if (this.composedKey === key) return;
    this.composedKey = key;
    if (this.lvMsg) this.lvMsg.textContent = ' composing from ' + fs.length + ' layer files…';
    this.root.setAttribute('data-av-layered', 'loading');
    Promise.all(fs.map(fileImage)).then(function (ims) {
      var r, nd;
      if (self.composedKey !== key) return;
      r = layersCanvas(ims, (m.title || '') + ' — composed here from its layers');
      st.ratio(r.w, r.h); st.showCanvas(r.cv);
      nd = fs.filter(function (f) { return !/^https?:\/\//i.test(f.from); }).length;
      self.root.setAttribute('data-av-layered', pv ? 'preview' : 'on');
      self.root.setAttribute('data-av-layer-copies', nd + '/' + fs.length);
      if (self.lvMsg) self.lvMsg.textContent = ' composed here from ' + fs.length + ' layer files' + (nd ? ' (' + (nd === fs.length ? 'their' : nd) + ' display copies, resized; the originals are on IPFS)' : '')
        + (pv ? '' : (self.levers().length ? (self.chainState === 'read' ? ' · lever values on-chain now' : ' · lever values from our snapshot of ' + (m.snapshot_date || '')) : ''));
      if (pv && self.lvMsg) self.lvMsg.appendChild(el('span', { 'class': 'av-prev', text: ' · preview — not on-chain' }));
      if (st === self.stage && self.srcLine) {
        self.srcLine.textContent = nd ? 'composed here from ' + (nd === fs.length ? 'the layers’ ' : nd + ' ') + DISPLAY_NOTE.replace('display copy, resized', 'display copies, resized') : 'composed here from the layer files on IPFS';
        self.srcLine.hidden = false;
      }
    }).catch(function (e) {
      if (self.composedKey !== key) return;
      self.layered = false; self.composedKey = null; self.preview = {}; st.hideCanvas();
      self.root.setAttribute('data-av-layered', 'failed');
      if (!self.panel.hidden) self.renderPanel();
      if (self.lvMsg) self.lvMsg.textContent = ' A layer file did not load (' + e.message + '); showing the state image instead.';
      if (self.mode === 'strip') { self.body.hidden = true; if (self.still) self.still.hidden = false; self.syncCur(); } else if (m.states && m.states.length) self.showState(self.shown || 0);
    });
  };

  // ---- Shuffle (B1-B4): a lever work's layers in order, a random option per lever layer about every 5 s, the fixed layers kept
  Viewer.prototype.startShuffle = function () {
    var self = this, m = this.m, why = shuffleVerdict(m), pb, nb, n, per, cw;
    this.ctl.textContent = ''; this.cap.textContent = ''; this.srcLine.hidden = true; this.prog.hidden = true;
    this.body.hidden = false;
    this.root.setAttribute('data-av-shuffle', why ? 'off' : 'on');
    if (why) {   // B3: not reproduced faithfully (or not by our composites' rules): the reason, and nothing is shuffled
      this.stage.box.hidden = true;
      if (this.still) this.still.hidden = false;
      this.cap.appendChild(el('p', { 'class': 'av-note av-shoff', text: 'Not shuffled here: ' + why + '.' }));
      this.cap.appendChild(el('span', { 'class': 's', text: 'Shuffle stacks the layers by the rules of our composites; a work they do not reproduce faithfully is not shuffled. The work itself is on async.art.' }));
      return;
    }
    if (this.still) this.still.hidden = true;   // B1: Current state and Shuffle are two views - the Current state picture and its line give way, on the work's own page too (review of 25 Sep)
    this.stage.box.hidden = false; this.stage.ph.hidden = true;
    cw = (m.shuffle && m.shuffle.canvas) || [(m.states[0] || {}).w, (m.states[0] || {}).h];
    this.stage.ratio(cw[0], cw[1]);
    if (!this.badge) { this.badge = el('div', { 'class': 'av-badge', hidden: '', text: SHUFFLE_CAPTION }); this.stage.box.appendChild(this.badge); }
    this.stage.msg.textContent = 'loading layer images…';
    pb = el('button', { type: 'button', 'class': 'av-play', 'aria-pressed': 'false', text: '▶ shuffle' });
    pb.addEventListener('click', function () { if (self.shuffler && self.shuffler.playing) self.shufflePause(); else self.shufflePlay(); });
    nb = el('button', { type: 'button', 'class': 'av-another', text: 'another combination' });
    nb.addEventListener('click', function () { if (self.shuffler) self.shuffler.another(); });
    this.smsg = el('span', { 'class': 'av-note av-smsg', 'aria-live': 'polite' });
    this.ctl.appendChild(pb); this.ctl.appendChild(nb); this.ctl.appendChild(this.smsg);
    if (!auto()) this.ctl.appendChild(el('span', { 'class': 'av-note', text: 'it changes on its own only once you press ▶ shuffle (your device asks for reduced motion)' }));
    this.spb = pb;
    this.shCap = el('b', { 'class': 'av-shcap', hidden: '', text: SHUFFLE_CAPTION });   // B2: every shuffled picture carries it
    this.shList = el('ol', { 'class': 'av-shl', hidden: '', 'aria-label': 'the option each layer shows' });
    n = combinations(m.layers);
    per = m.layers.filter(function (L) { return L.control === 'lever'; }).map(function (L) { return leverChoices(L).length; });
    this.cap.appendChild(this.shCap); this.cap.appendChild(this.shList);
    this.cap.appendChild(el('div', { 'class': 'av-shn', text: fmtCount(n) + ' possible combinations (' + per.join(' × ') + ': the options of its ' + per.length + ' lever layer' + (per.length === 1 ? '' : 's') + ', multiplied)' }));
    this.root.setAttribute('data-av-combinations', String(n));
    this.shufflePreload();
    this.shuffler = makeShuffler({
      layers: m.layers, rnd: Math.random, every: SHUFFLE_EVERY, env: TIMERS,
      usable: function (j, k) { return !self.layerFile(j, k).failed; },
      ready: function (c) { return c.every(function (k, j) { return self.layerFile(j, k).ok; }); },
      failedAny: function (c) { return c.some(function (k, j) { return self.layerFile(j, k).failed; }); },
      wait: function (c, cb) {
        var fs = c.map(function (k, j) { return self.layerFile(j, k); }), left = fs.length;
        fs.forEach(function (f) { QUEUE.want(f, 0); QUEUE.on(f, function () { if (--left === 0) cb(); }); });
      },
      show: function (c) { self.showCombo(c); },
      note: function (k) { self.shuffleNote(k); }
    });
    if (auto()) this.shufflePlay(); else this.shuffler.another();   // reduced motion: one combination; it changes once the visitor presses play
  };
  Viewer.prototype.shufflePlay = function () {
    if (!this.shuffler) return;
    this.shuffler.play();
    this.root.setAttribute('data-av-playing', this.shuffler.playing ? '1' : '0');
    if (this.spb && this.shuffler.playing) { this.spb.textContent = '❚❚ pause'; this.spb.setAttribute('aria-pressed', 'true'); }
  };
  Viewer.prototype.shufflePause = function () {
    if (this.shuffler) this.shuffler.pause();
    this.root.setAttribute('data-av-playing', '0');
    if (this.spb) { this.spb.textContent = '▶ shuffle'; this.spb.setAttribute('aria-pressed', 'false'); }
  };
  Viewer.prototype.leaveShuffle = function () {   // back to Current state (or the layered view): the Shuffle stops; requests sent run on
    if (this.shuffler) this.shuffler.pause();
    this.shuffler = null; this.combo = null; this.shufflePreloading = false;
    if (this.badge && this.badge.parentNode) this.badge.parentNode.removeChild(this.badge);
    this.badge = null;
    this.stage.hideCanvas(); this.stage.box.hidden = false; this.stage.msg.textContent = '';
    ['data-av-shuffle', 'data-av-combo', 'data-av-combinations', 'data-av-hold', 'data-av-playing'].forEach(function (a) { this.root.removeAttribute(a); }, this);
    (this.shuffleFiles || []).forEach(function (f) { QUEUE.drop(f); });
    this.srcLine.hidden = true; this.prog.hidden = true; this.cap.textContent = ''; this.ctl.textContent = '';
  };
  // B4: every layer image the Shuffle can pick, preloaded at once with A's queue (at most 4 at a time, the display copies first) and
  // counted on A's bar; the images of the combination about to be shown jump the queue (wait, priority 0)
  Viewer.prototype.shufflePreload = function () {
    var self = this, m = this.m, files = [], seen = {}, most = 0, j, k, cs;
    m.layers.forEach(function (L) { most = Math.max(most, (L.options || []).length); });
    for (k = 0; k < most; k++) for (j = 0; j < m.layers.length; j++) {   // option by option across the layers: each layer's first ones early
      cs = leverChoices(m.layers[j]);
      if (cs.indexOf(k) < 0) continue;
      var f = this.layerFile(j, k);
      if (!seen[f.key]) { seen[f.key] = true; files.push(f); }
    }
    this.shuffleFiles = files; this.shufflePreloading = true;
    files.forEach(function (f, r) { QUEUE.want(f, r + 1); QUEUE.on(f, function () { self.shuffleProgress(); }); });
    this.shuffleProgress();
  };
  Viewer.prototype.shuffleProgress = function () {
    var p = this.prog, fs = this.shuffleFiles || [], n = fs.length, ok = 0, bad = 0;
    fs.forEach(function (f) { if (f.ok) ok++; else if (f.failed) bad++; });
    if (this.mode !== 'shuffle' || !this.shufflePreloading) return;
    this.root.setAttribute('data-av-loaded-layers', ok + '/' + n + (bad ? ' (' + bad + ' failed)' : ''));
    p.textContent = '';
    if (ok === n || n < 2) { p.hidden = true; p.setAttribute('data-av-prog', 'all'); return; }   // all loaded: the bar goes
    p.hidden = false;
    if (ok + bad === n) {
      p.setAttribute('data-av-prog', 'done');
      p.appendChild(el('span', { 'class': 'av-prog-t', text: bad + ' of ' + n + ' layer images did not load just now; Shuffle picks among the others' }));
      return;
    }
    p.setAttribute('data-av-prog', ok + '/' + n);
    p.appendChild(el('div', { 'class': 'av-prog-bar', role: 'progressbar', 'aria-label': 'layer images loaded', 'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': String(ok) },
                     [el('i', { style: 'width:' + (100 * ok / n).toFixed(1) + '%' })]));
    p.appendChild(el('span', { 'class': 'av-prog-t', text: 'Loading layer images ' + ok + ' of ' + n }));
  };
  Viewer.prototype.shuffleNote = function (k) {
    if (k === 'stopped') { this.shufflePause(); if (this.spb) this.spb.disabled = true; }   // (pausing clears the note: set it after)
    this.root.setAttribute('data-av-hold', k || '');
    if (this.smsg) this.smsg.textContent = k === 'starting' ? 'starts once the first two combinations have loaded…' : k === 'waiting' ? 'waiting for the next combination to load…'
      : k === 'stopped' ? 'Shuffle stopped: a layer’s images did not load from this site or the public IPFS gateways just now.' : '';
  };
  Viewer.prototype.showCombo = function (c) {   // a combination whose every layer image has loaded, on the stage, captioned and listed
    var self = this, m = this.m, list, r, nd, text;
    if (this.mode !== 'shuffle' || !this.shuffler) return;
    list = comboList(m.layers, c);
    text = list.map(function (x) { return x.layer + ': ' + x.option; }).join('; ');
    try {
      r = layersCanvas(c.map(function (k, j) { return self.layerFile(j, k).result.img; }), (m.title || '') + ' — ' + SHUFFLE_CAPTION + ': ' + text);
    } catch (e) { this.shuffleNote('stopped'); return; }
    this.stage.ratio(r.w, r.h); this.stage.showCanvas(r.cv, true); this.stage.msg.textContent = '';
    this.combo = c;
    this.shList.textContent = '';
    list.forEach(function (x) {
      var li = el('li', x.fixed ? { 'class': 'fixed' } : null);
      if (x.fixed && x.option === x.layer) li.appendChild(document.createTextNode(x.layer));
      else { li.appendChild(document.createTextNode(x.layer + ': ')); li.appendChild(el('b', { text: x.option })); }
      if (x.fixed) li.appendChild(el('span', { 'class': 's', text: ' (fixed)' }));
      self.shList.appendChild(li);
    });
    this.badge.hidden = false; this.shCap.hidden = false; this.shList.hidden = false;
    this.root.setAttribute('data-av-combo', c.join(','));
    this.root.setAttribute('data-av-shuffles', String(this.shuffler.shown));
    nd = c.filter(function (k, j) { return !/^https?:\/\//i.test(self.layerFile(j, k).from); }).length;
    this.root.setAttribute('data-av-layer-copies', nd + '/' + c.length);
    this.srcLine.textContent = nd ? 'composed here from ' + (nd === c.length ? 'the layers’ ' : nd + ' of the layers’ ') + DISPLAY_NOTE.replace('display copy, resized', 'display copies, resized')
      : 'composed here from the layer files on IPFS';
    this.srcLine.hidden = false;
  };
  Viewer.prototype.filesList = function () {   // Pinwatch: the site renders its list on the page itself
    var m = this.m, d = el('details', { 'class': 'av-files' }), ul = el('ul'), pin = m.pin || {};
    function a(cid, text, note) {
      var li = el('li', null, [text + ': ']);
      li.appendChild(el('code', { text: cid.slice(0, 14) + '…' }));
      GATEWAYS.forEach(function (g) { li.appendChild(document.createTextNode(' ')); li.appendChild(el('a', { href: g + cid, rel: 'noopener', text: g.split('/')[2] })); });   // O15: the three, in the order the viewer asks them
      if (note) li.appendChild(el('span', { 'class': 's', text: ' — ' + note }));   // what our own check found; never "pinned" without it
      ul.appendChild(li);
    }
    d.appendChild(el('summary', { text: 'Files on IPFS' }));
    (m.states || []).forEach(function (s) { if (s.cid) a(s.cid, 'state ' + s.label + ' (' + (s.file || 'image') + ')', s.pin); });
    if (m.mp4) a(m.mp4, 'day cycle (6 s MP4)', pin.mp4);
    if (m.meta) a(m.meta, 'metadata', pin.meta);
    if (m.image) a(m.image, 'the Master’s own image', pin.image);
    (m.layers || []).forEach(function (L) { (L.options || []).forEach(function (o) { if (o.cid) a(o.cid, 'layer ' + (L.label || L.id) + ': ' + o.label, o.pin); }); });
    d.appendChild(ul);
    return d;
  };

  // ---- start: remembered choice, deep links, and only once the work is on screen
  Viewer.prototype.start = function () {
    var self = this, target = CFG.page === 'detail' || Q.w === this.id, mode = null, hour;   // on a page with several works, ?w= names the one
    if (target && Q.mode) mode = Q.mode;
    if (target && (Q.t || Q.state) && this.timed && !mode) {
      this.ensure(function () {
        var m = self.m, i = -1, want, k, mm;
        if (Q.t) { mm = /^(\d{1,2})(?::(\d{2}))?/.exec(Q.t); if (mm) hour = Math.min(23, +mm[1]); }
        if (Q.state && hour === undefined) {
          want = Q.state.toLowerCase();
          if (/^\d+$/.test(want) && m.states[+want - 1]) i = +want - 1;
          for (k = 0; i < 0 && k < m.states.length; k++) if (m.states[k].label.toLowerCase() === want) i = k;
          for (k = 0; i < 0 && k < m.states.length; k++) if (m.states[k].label.toLowerCase().indexOf(want) === 0) i = k;
          for (k = 0; i < 0 && k < m.states.length; k++) if (m.states[k].label.toLowerCase().indexOf(want) >= 0) i = k;
          if (i >= 0) hour = m.states[i].hours[0];
        }
        if (hour === undefined) { self.reveal(); return; }
        self.mode = 'slideshow';
        for (k in self.btn) if (Object.prototype.hasOwnProperty.call(self.btn, k)) self.btn[k].setAttribute('aria-pressed', String(k === 'slideshow'));
        self.root.setAttribute('data-av-mode', 'slideshow');
        self.body.hidden = false;
        if (self.still && !self.keepStill) self.still.hidden = true;
        self.startSlides(false, hour);
        self.reveal();
      });
      return;
    }
    if (mode === 'frame' && this.timed) { this.ensure(function () { self.openFrame(true); }); this.reveal(); return; }
    if (mode) { this.choose(mode, false); this.reveal(); return; }
    this.reveal();
    mode = sget('mode.' + this.id);
    if (!mode || mode === 'strip' || !this.btn[mode]) return;
    if (mode === 'frame') mode = 'live';   // a remembered Frame reopens as Live: full screen only on the visitor's click
    if (!window.IntersectionObserver || onScreen(this.root)) { this.choose(mode, false); return; }
    var io = new window.IntersectionObserver(function (es) {   // further down the page: a remembered mode starts once the work is on screen
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); self.choose(mode, false); }
    }, { rootMargin: '200px' });
    io.observe(this.root);
  };
  // a shared link to one work on a page with many (?w=<id>, with or without &mode= / &t= / &state=): that work is brought into view,
  // its card's title included - before, only ?t= / ?state= scrolled, and ?mode= ran the work out of sight (review of 24 Sep)
  Viewer.prototype.reveal = function () {
    var n;
    if (Q.w !== this.id || CFG.page === 'detail') return;
    n = (this.root.closest && this.root.closest('.aw, tr')) || this.root;   // the card on async.html, the table row on c/async-art.html
    if (n.scrollIntoView) n.scrollIntoView();
  };
  function onScreen(n) {
    var r = n.getBoundingClientRect(), h = window.innerHeight || document.documentElement.clientHeight || 0;
    return r.bottom >= -200 && r.top <= h + 200;
  }

  // ---------------------------------------------------------------- find the works on this page
  var VIEWERS = [];
  function mount(t) { var v = new Viewer(t); VIEWERS.push(v); v.start(); return v; }
  function init() {
    var idx = CFG.index || {};
    [].forEach.call(document.querySelectorAll('.av[data-av-id]'), function (root) {
      var id = root.getAttribute('data-av-id'), kind = root.getAttribute('data-av-kind');
      if (kind === null) {   // Pinwatch: a work is shown only when the viewer's data has it
        master(id).then(function (m) {
          var still, v;
          if (m.strip) { still = el('img', { 'class': 'av-still', alt: (m.title || '') + (m.tiles ? ' — its states with their hours' : m.kind === 'lever-controlled' ? ' — as its levers stood on ' + (m.snapshot_date || '') + ' (our composite)' : ''), src: BASE + id + '/' + m.strip }); root.appendChild(still); }
          v = mount({ root: root, id: id, kind: m.kind || '', still: still, keepStill: true, snap: m.snapshot_date || '',
                      lever: (m.layers || []).some(function (L) { return L.control === 'lever'; }) && !(m.layers || []).some(function (L) { return L.control === 'time'; }) });
          v.m = m;
          if (CFG.files) root.appendChild(v.filesList());
        }, function () { if (root.parentNode) root.parentNode.removeChild(root); });
        return;
      }
      mount({ root: root, id: id, kind: kind, still: root.querySelector('.av-still'), detail: root.getAttribute('data-av-detail'), keepStill: CFG.page === 'detail',
              lever: root.getAttribute('data-av-lever') === '1', snap: root.getAttribute('data-av-snap') || '' });
    });
    // the strips build_site.py puts in the table of held works (../thumbs/async_<id>.jpg)
    [].forEach.call(document.querySelectorAll('img[src*="thumbs/async_"]'), function (img) {
      var mm = /async_(\d+)\.jpg/.exec(img.getAttribute('src') || ''), holder, after, root;
      if (!mm || !Object.prototype.hasOwnProperty.call(idx, mm[1]) || (img.closest && img.closest('.av'))) return;
      holder = img.parentNode; after = holder.nextSibling;
      if (!(after && after.nodeType === 1 && /(^|\s)s(\s|$)/.test(after.className))) after = holder;
      root = el('div', { 'class': 'av av-row', 'data-av-id': mm[1] });
      after.parentNode.insertBefore(root, after.nextSibling);
      mount({ root: root, id: mm[1], kind: idx[mm[1]], still: holder, detail: CFG.detail ? CFG.detail + mm[1] + '.html' : null });
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      VIEWERS.forEach(function (v) { if (v.m && (v.mode === 'live' || v.mode === 'frame') && auto()) v.live(); });
    });
    document.documentElement.setAttribute('data-av', 'ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
