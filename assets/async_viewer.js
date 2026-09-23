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
   IPFS files (the collector's decision O15, 23 Sep): gateway.pinata.cloud first (our files are pinned there), then ipfs.io, then
   dweb.link - never the dedicated gateway. A gateway that has not answered in about 3 s is joined by the next one (it keeps
   loading; the first image to arrive is shown); an error moves on at once. The file links list the three in that order.
   No wallet, no transaction, no cookie. localStorage (every access inside try/catch) keeps only this visitor's choices.
   prefers-reduced-motion: nothing changes on its own unless the visitor turns it on.
   Page parameters: ?mode=strip|live|slideshow|frame  ?state=<label or number>  ?t=HH:MM  ?w=<token id> (which work, on a page
   with several)  ?now=<ISO time or epoch ms> (test clock: starts at that moment and runs on). */
(function () {
  'use strict';
  if (!window.fetch || !window.JSON || !window.Promise || !document.querySelector || !document.addEventListener) return;   // an old browser keeps the static strip

  var GATEWAYS = ['https://gateway.pinata.cloud/ipfs/', 'https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/'];   // O15: in this order
  var RPCS = ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org', 'https://eth-mainnet.public.blastapi.io', 'https://cloudflare-eth.com'];
  var GET_CONTROL_TOKEN = '0x96bc50b0';   // getControlToken(uint256) -> int256[]: min, max, current for each lever
  var CONTEXT = 'Each layer is its own token; whoever holds it sets its lever. The Master shows what they choose.';
  var SPEEDS = [['1', '1 s each'], ['3', '3 s each'], ['6', '6 s each'], ['true', 'true to time (1 s per hour)']];
  var LOAD_TIMEOUT = 45000, NEXT_AFTER = 3000, RPC_TIMEOUT = 9000, MAX_CANVAS = 2048;   // LOAD_TIMEOUT per source (?loadtimeout=<ms> for tests on a virtual clock); NEXT_AFTER: the next gateway joins

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
  if (+Q.loadtimeout > 0) LOAD_TIMEOUT = +Q.loadtimeout;
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
  // One image from its sources in order (O15). The first is asked at once; the next joins when the last one asked has not
  // answered within NEXT_AFTER, or at once when it fails; each source has LOAD_TIMEOUT. The first image to arrive wins and the
  // others are dropped. done(img or null, tried) - null when every source failed; asked(tried, n) after each source is asked.
  // tried: "host@ms" per source asked, ms after the start (the stage keeps it in data-av-tried; tests read it). -> cancel()
  function firstImage(srcs, done, asked) {
    var t0 = Date.now(), k = 0, live = 0, over = false, join = null, tried = [], all = [];
    function quiet(a) { clearTimeout(a.t); a.im.onload = a.im.onerror = null; }
    function end(im) {
      if (over) return;
      over = true; clearTimeout(join);
      all.forEach(function (a) { quiet(a); if (a.im !== im) a.im.removeAttribute('src'); });
      done(im, tried.join(' '));
    }
    function ask() {
      clearTimeout(join); join = null;
      if (over) return;
      if (k >= srcs.length) { if (!live) end(null); return; }
      var src = srcs[k++], a = { im: new Image(), t: null, settled: false };
      function gone() {   // this source failed or ran out of time: the next one now
        if (a.settled || over) return;
        a.settled = true; live--; quiet(a); a.im.removeAttribute('src');
        ask();
      }
      all.push(a); live++; tried.push(hostOf(src) + '@' + (Date.now() - t0));
      a.im.onload = function () { if (a.settled || over) return; a.settled = true; live--; end(a.im); };
      a.im.onerror = gone;
      a.t = setTimeout(gone, LOAD_TIMEOUT);
      if (k < srcs.length) join = setTimeout(ask, NEXT_AFTER);
      if (asked) asked(tried.join(' '), k);
      a.im.src = src;
    }
    ask();
    return function cancel() {
      if (over) return;
      over = true; clearTimeout(join);
      all.forEach(function (a) { quiet(a); a.im.removeAttribute('src'); });
    };
  }
  function loadImage(cid) {   // a layer file, from the public gateways in order
    return new Promise(function (ok, no) {
      firstImage(GATEWAYS.map(function (g) { return g + cid; }), function (im) { if (im) ok(im); else no(new Error('not reachable on the public gateways')); });
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
    this.front = 0; this.key = null; this.tok = null; this.canvas = null; this.cancel = null;
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
  Stage.prototype.show = function (key, srcs, alt) {
    var self = this, back, tok = {};
    if (this.canvas) this.hideCanvas();
    if (this.key === key) { this.ph.hidden = true; return; }
    if (this.cancel) { this.cancel(); this.cancel = null; }   // a state asked for earlier and not arrived yet is dropped
    this.key = key; this.tok = tok; back = this.imgs[1 - this.front];
    if (!srcs.length) { this.imgs[this.front].className = 'av-img'; this.msg.textContent = 'No image for this state.'; return; }
    this.msg.textContent = this.imgs[this.front].getAttribute('src') ? '' : 'loading…';
    function failed() {   // no stale image under the new caption: the state's tile stays, with a note
      self.imgs[self.front].className = 'av-img';
      self.msg.textContent = 'The full image did not load from the public IPFS gateways just now; the strip shows every state.';
    }
    this.cancel = firstImage(srcs, function (im, tried) {
      if (self.tok !== tok) return;
      self.cancel = null; self.box.setAttribute('data-av-tried', tried);
      if (!im) { failed(); return; }
      back.onload = function () {
        if (self.tok !== tok) return;
        back.alt = alt; back.className = 'av-img on'; self.imgs[self.front].className = 'av-img';
        self.front = 1 - self.front; self.msg.textContent = ''; self.ph.hidden = true;
        self.box.setAttribute('data-av-loaded', src0(back.src));
      };
      back.onerror = function () { if (self.tok === tok) failed(); };
      back.src = im.src;   // the image that arrived first: already this page's, no second download
    }, function (tried, n) {
      if (self.tok !== tok) return;
      self.box.setAttribute('data-av-tried', tried);
      if (n > 1) self.msg.textContent = 'loading (another gateway)…';
    });
  };
  function src0(u) { return (u || '').split('/').slice(0, 3).join('/'); }   // which host served it (tests read it)
  Stage.prototype.showCanvas = function (cv) {
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.canvas = cv; cv.className = 'av-img on'; this.box.insertBefore(cv, this.msg);
    this.imgs[this.front].className = 'av-img'; this.key = null;
  };
  Stage.prototype.hideCanvas = function () {
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.canvas = null;
    if (this.imgs[this.front].getAttribute('src')) this.imgs[this.front].className = 'av-img on';
  };

  // ---------------------------------------------------------------- one viewer per work
  var TIMED = /hourly|day\/night|four-phase|states/;
  function Viewer(t) {
    this.root = t.root; this.id = t.id; this.kind = t.kind || ''; this.still = t.still || null; this.detail = t.detail || null;
    this.keepStill = !!t.keepStill; this.m = null; this.mode = 'strip'; this.timer = null; this.playing = false; this.pos = 0;
    this.speed = sget('speed') || '3'; this.local = sget('local') === '1'; this.chain = null; this.chainState = 'unread';
    this.preview = {}; this.layered = false; this.imgc = {}; this.stage = new Stage(); this.frameStage = null;
    this.timed = TIMED.test(this.kind); this.optLis = []; this.leverSpans = [];
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
    this.body.appendChild(this.stage.box); this.body.appendChild(this.cap); this.body.appendChild(this.ctl);
    this.panel = el('div', { 'class': 'av-layers', hidden: '' });
    this.root.appendChild(this.bar); this.root.appendChild(this.body); this.root.appendChild(this.panel);
  };
  Viewer.prototype.ensure = function (cb) {
    var self = this;
    if (this.m) { cb(); return; }
    this.note.textContent = 'loading…';
    master(this.id).then(function (m) { self.m = m; self.note.textContent = ''; cb(); }, function () {
      self.note.textContent = 'The viewer’s data did not load; the strip stays.';
      self.choose('strip', false);
    });
  };
  Viewer.prototype.stop = function () { clearTimeout(this.timer); this.timer = null; this.playing = false; };
  Viewer.prototype.choose = function (mode, user) {
    var self = this, k;
    if (!this.btn[mode] && mode !== 'strip') mode = 'strip';
    if (mode === 'frame') { this.ensure(function () { self.openFrame(false); }); return; }
    this.stop(); this.mode = mode;
    if (user) sset('mode.' + this.id, mode);
    for (k in this.btn) if (Object.prototype.hasOwnProperty.call(this.btn, k)) this.btn[k].setAttribute('aria-pressed', String(k === mode));
    this.root.setAttribute('data-av-mode', mode);
    if (mode === 'strip') {
      if (this.layered) { this.layered = false; this.preview = {}; this.composedKey = null; this.stage.hideCanvas(); if (!this.panel.hidden) this.renderPanel(); }
      this.body.hidden = true; this.ctl.textContent = '';
      if (this.still) this.still.hidden = false;
      this.syncPanel();
      return;
    }
    this.ensure(function () {
      if (self.mode !== mode) return;
      if (!self.m.states || !self.m.states.length) { self.note.textContent = 'No state images for this layout.'; return; }
      self.body.hidden = false;
      if (self.still && !self.keepStill) self.still.hidden = true;
      self.stage.placeholder(self.m, 0);
      if (mode === 'live') self.startLive(); else self.startSlides(user);
    });
  };

  // ---- the image of a state
  Viewer.prototype.srcs = function (i) {
    var s = this.m.states[i], out = [];
    if (s.web) out.push(BASE + this.id + '/' + s.web);
    if (s.cid) GATEWAYS.forEach(function (g) { out.push(g + s.cid); });
    return out;
  };
  Viewer.prototype.showState = function (i) {
    var st = this.frameStage || this.stage, s = this.m.states[i];
    this.shown = i;
    this.root.setAttribute('data-av-shown', s ? s.label : '');
    if (this.layered) { this.compose(); this.syncPanel(); return; }
    if (!s) return;
    st.ratio(s.w, s.h);
    if (st === this.stage) st.placeholder(this.m, i);
    st.show(this.id + ':' + i, this.srcs(i), this.m.title + ' — ' + s.label);
    this.syncPanel();
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
    this.ctl.appendChild(pb); this.ctl.appendChild(sel); this.ctl.appendChild(rng); this.ctl.appendChild(out);
    this.pbtn = pb; this.range = rng; this.hourOut = out;
    this.slide(hour !== undefined ? hour : clockOf(m, now(), this.local).h);
    if (hour === undefined && auto()) this.play();
  };
  Viewer.prototype.slide = function (h) {
    var m = this.m, i, s;
    this.pos = ((Math.floor(h) % 24) + 24) % 24;
    i = m.hour_state ? m.hour_state[this.pos] : 0; s = m.states[i];
    this.showState(i);
    if (this.range) this.range.value = String(this.pos);
    if (this.hourOut) this.hourOut.textContent = pad(this.pos) + ':00';
    this.root.setAttribute('data-av-hour', String(this.pos));
    this.cap.textContent = '';
    this.cap.appendChild(el('b', { text: s.label }));
    this.cap.appendChild(document.createTextNode(' · ' + ranges(s.hours) + ' (' + (this.local ? 'your time' : (m.tz && m.tz.label) || 'UTC') + ') · state ' + (i + 1) + ' of ' + m.states.length));
  };
  Viewer.prototype.play = function () {
    var self = this;
    clearTimeout(this.timer); this.playing = true;
    if (this.pbtn) { this.pbtn.textContent = '❚❚ pause'; this.pbtn.setAttribute('aria-pressed', 'true'); }
    this.root.setAttribute('data-av-playing', '1');
    function step() {
      var m = self.m, h = self.pos, cur, k;
      if (!self.playing || self.mode !== 'slideshow') return;
      if (self.speed === 'true') { self.slide(h + 1); self.timer = setTimeout(step, 1000); return; }
      cur = m.hour_state[h]; k = 1;
      while (k < 24 && m.hour_state[(h + k) % 24] === cur) k++;
      self.slide(h + k);
      self.preload();
      self.timer = setTimeout(step, (+self.speed || 3) * 1000);
    }
    this.preload();
    this.timer = setTimeout(step, this.speed === 'true' ? 1000 : (+this.speed || 3) * 1000);
  };
  Viewer.prototype.pause = function () {
    clearTimeout(this.timer); this.timer = null; this.playing = false;
    this.root.setAttribute('data-av-playing', '0');
    if (this.pbtn) { this.pbtn.textContent = '▶ play'; this.pbtn.setAttribute('aria-pressed', 'false'); }
  };
  Viewer.prototype.preload = function () {   // the next state's image, so the cross-fade does not wait
    var m = this.m, h = this.pos, cur = m.hour_state[h], k = 1, s;
    while (k < 24 && m.hour_state[(h + k) % 24] === cur) k++;
    s = this.srcs(m.hour_state[(h + k) % 24]);
    if (s.length) { var im = new Image(); im.src = s[0]; }
  };

  // ---- Frame
  Viewer.prototype.openFrame = function (fromLink) {
    var self = this, ov, st;
    if (this.frameStage) return;
    this.prevMode = this.mode === 'frame' ? 'strip' : this.mode; this.stop();
    ov = el('div', { 'class': 'av-frame', role: 'dialog', tabindex: '-1', 'aria-label': (this.m.title || '') + ' - frame (Esc or a click leaves)' });
    st = new Stage(); ov.appendChild(st.box);
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
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('fullscreenchange', this.onFs);
    if (!fromLink) enterFs();
    try { ov.focus(); } catch (e) { /* ignore */ }
    this.live();
  };
  Viewer.prototype.closeFrame = function () {
    if (!this.frameStage) return;
    clearTimeout(this.timer);
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('fullscreenchange', this.onFs);
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) { /* ignore */ }
    if (this.frameStage.cancel) { this.frameStage.cancel(); this.frameStage.cancel = null; }   // a frame image still on its way is dropped
    if (this.overlay && this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
    document.documentElement.classList.remove('av-framed');
    this.frameStage = null; this.overlay = null; this.mode = 'strip';
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
      span.appendChild(document.createTextNode('on-chain now: ' + ((L.options[v] || {}).label || ('value ' + v)) + ' (value ' + v + ' of ' + c.vals[3 * L.lever] + '–' + c.vals[3 * L.lever + 1] + '; read ' + pad(this.chainAt.getHours()) + ':' + pad(this.chainAt.getMinutes()) + ' via ' + c.via + ') '));
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
    this.layered = !!on; this.composedKey = null;
    if (!on) { this.preview = {}; (this.frameStage || this.stage).hideCanvas(); }
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
  };
  Viewer.prototype.layerImg = function (cid) {
    if (!this.imgc[cid]) this.imgc[cid] = loadImage(cid);
    return this.imgc[cid];
  };
  Viewer.prototype.compose = function () {
    var self = this, m = this.m, st = this.frameStage || this.stage, act = this.activeOpts(), cids, key, pv = Object.keys(this.preview).length > 0;
    cids = m.layers.map(function (L, j) { var o = L.options[act[j]] || L.options[0]; return o && o.cid; });
    key = cids.join(',');
    if (this.composedKey === key) return;
    this.composedKey = key;
    if (this.lvMsg) this.lvMsg.textContent = ' composing from ' + cids.length + ' layer files…';
    this.root.setAttribute('data-av-layered', 'loading');
    Promise.all(cids.map(function (c) { return self.layerImg(c); })).then(function (ims) {
      var w = ims[0].naturalWidth, h = ims[0].naturalHeight, sc, cw, ch, cv, cx, i;
      if (self.composedKey !== key) return;
      for (i = 1; i < ims.length; i++) if (ims[i].naturalWidth !== w || ims[i].naturalHeight !== h) throw new Error('the layer files differ in size');
      sc = Math.min(1, MAX_CANVAS / Math.max(w, h)); cw = Math.round(w * sc); ch = Math.round(h * sc);
      cv = el('canvas', { width: String(cw), height: String(ch), role: 'img', 'aria-label': (m.title || '') + ' — composed here from its layers' });
      cx = cv.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, cw, ch);   // transparent areas on white, as async_masters.py flattens them
      ims.forEach(function (im) { cx.drawImage(im, 0, 0, cw, ch); });
      st.ratio(w, h); st.showCanvas(cv);
      self.root.setAttribute('data-av-layered', pv ? 'preview' : 'on');
      if (self.lvMsg) self.lvMsg.textContent = ' composed here from ' + cids.length + ' layer files' + (pv ? '' : (self.levers().length ? (self.chainState === 'read' ? ' · lever values on-chain now' : ' · lever values from our snapshot of ' + (m.snapshot_date || '')) : ''));
      if (pv && self.lvMsg) self.lvMsg.appendChild(el('span', { 'class': 'av-prev', text: ' · preview — not on-chain' }));
    }).catch(function (e) {
      if (self.composedKey !== key) return;
      self.layered = false; self.composedKey = null; self.preview = {}; st.hideCanvas();
      self.root.setAttribute('data-av-layered', 'failed');
      if (!self.panel.hidden) self.renderPanel();
      if (self.lvMsg) self.lvMsg.textContent = ' A layer file did not load (' + e.message + '); showing the state image instead.';
      if (self.mode === 'strip') { self.body.hidden = true; if (self.still) self.still.hidden = false; } else if (m.states && m.states.length) self.showState(self.shown || 0);
    });
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
        if (hour === undefined) return;
        self.mode = 'slideshow';
        for (k in self.btn) if (Object.prototype.hasOwnProperty.call(self.btn, k)) self.btn[k].setAttribute('aria-pressed', String(k === 'slideshow'));
        self.root.setAttribute('data-av-mode', 'slideshow');
        self.body.hidden = false;
        if (self.still && !self.keepStill) self.still.hidden = true;
        self.startSlides(false, hour);
        if (Q.w === self.id && self.root.scrollIntoView) self.root.scrollIntoView();
      });
      return;
    }
    if (mode === 'frame' && this.timed) { this.ensure(function () { self.openFrame(true); }); return; }
    if (mode) { this.choose(mode, false); return; }
    mode = sget('mode.' + this.id);
    if (!mode || mode === 'strip' || !this.btn[mode]) return;
    if (mode === 'frame') mode = 'live';   // a remembered Frame reopens as Live: full screen only on the visitor's click
    if (!window.IntersectionObserver || onScreen(this.root)) { this.choose(mode, false); return; }
    var io = new window.IntersectionObserver(function (es) {   // further down the page: a remembered mode starts once the work is on screen
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); self.choose(mode, false); }
    }, { rootMargin: '200px' });
    io.observe(this.root);
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
          v = mount({ root: root, id: id, kind: m.kind || '', still: still, keepStill: true });
          v.m = m;
          if (CFG.files) root.appendChild(v.filesList());
        }, function () { if (root.parentNode) root.parentNode.removeChild(root); });
        return;
      }
      mount({ root: root, id: id, kind: kind, still: root.querySelector('.av-still'), detail: root.getAttribute('data-av-detail'), keepStill: CFG.page === 'detail' });
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
