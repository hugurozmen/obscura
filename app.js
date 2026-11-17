(() => {
'use strict';
const $ = id => document.getElementById(id);
const CAT_KEYS = ['movie', 'actor', 'achar', 'anime'];
const NEEDS_KEY = { movie: true, actor: true };
const SIZE = { easy: { achar: 50, anime: 50, movie: 60, actor: 40 }, normal: { achar: 100, anime: 100, movie: 120, actor: 80 }, hard: { achar: 200, anime: 200, movie: 200, actor: 150 } };
const PER = { achar: 50, anime: 50, movie: 60, actor: 40 };
const FX_KEYS = ['pixel', 'blur', 'zoom', 'tiles', 'shuffle'];
const KINDS = { classic: { dur: 30000, strikes: 3 }, sprint: { dur: 8000, strikes: 3, clock: 60000 }, survival: { dur: 20000, strikes: 99, lives: 3 } };
const ROUNDS = 5, MAXPTS = 1000, FLOOR = 100, WRONG = 100, HINT = 150;
const COVER = '#1d1916', TTL = 3 * 864e5;
const ACH = ['first', 'snap', 'blind', 'clean', 'purist', 'club4k', 'streak3', 'streak7', 'sprint8', 'surv15', 'allcats', 'century', 'comeback', 'rival'];
const SITE = location.origin + location.pathname;

let BYID = {}, game = null, round = null, raf = 0, diff = 'normal', kind = 'classic', lang = 'en', pending = null, homeNote = '';
const PACK = {};

/* ---------- storage, text, helpers ---------- */
const store = {
  get() { try { return JSON.parse(localStorage.getItem('obscura.live.v1')) || {}; } catch { return {}; } },
  set(patch) { try { localStorage.setItem('obscura.live.v1', JSON.stringify({ ...this.get(), ...patch })); } catch {} }
};
const cache = {
  get(k) { try { const v = JSON.parse(localStorage.getItem('obscura.c.' + k)); return v && Date.now() - v.t < TTL ? v.d : null; } catch { return null; } },
  set(k, d) { try { localStorage.setItem('obscura.c.' + k, JSON.stringify({ t: Date.now(), d })); } catch {} }
};
function t(key, ...a) { const s = (window.OBSCURA_TEXT[lang] || {})[key] ?? window.OBSCURA_TEXT.en[key] ?? key; return s.replace(/\{(\d)\}/g, (_, i) => a[i] ?? ''); }
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-t]').forEach(e => { e.textContent = t(e.dataset.t); });
  document.querySelectorAll('[data-t-html]').forEach(e => { e.innerHTML = t(e.dataset.tHtml); });   // our own dictionary text only
  $('langBtn').textContent = lang === 'en' ? 'TR' : 'EN';
  $('tmdbKey').placeholder = t('ab.keyPh'); $('quitBtn').title = t('quit');
  $('hintBtn').textContent = t('hint');
}
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
function shuffled(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const fmt = n => Math.round(n).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US');
const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
function el(tag, props, ...kids) { const e = Object.assign(document.createElement(tag), props || {}); e.append(...kids); return e; }
const builtInKey = () => (window.OBSCURA_CONFIG && window.OBSCURA_CONFIG.tmdbKey) || '';
const tmdbKey = () => builtInKey() || store.get().tmdb || '';
const available = () => CAT_KEYS.filter(c => !NEEDS_KEY[c] || tmdbKey());
function toast(title, body) { const n = el('div', { className: 'toast' }, el('b', { textContent: title }), body || ''); $('toasts').append(n); setTimeout(() => n.remove(), 4200); }
function subOf(d) {
  if (d.cat === 'achar') return d.from ? t('v.from', d.from) : '';
  if (d.cat === 'anime') return [t(d.film ? 'v.film' : 'v.series'), d.year].filter(Boolean).join(', ');
  if (d.cat === 'movie') return d.year || '';
  return d.movie ? t('v.seenIn', d.movie) : '';
}

/* ---------- picture sources ---------- */
async function anilist(query) {
  let r;
  try { r = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ query }) }); }
  catch { throw new Error(t('err.anilistNet')); }
  if (r.status === 429) throw new Error(t('err.anilistBusy'));
  if (!r.ok) throw new Error(t('err.anilist', r.status));
  return (await r.json()).data;
}
async function tmdb(path, key = tmdbKey()) {
  const bearer = key.length > 60, sep = path.includes('?') ? '&' : '?';
  let r;
  try { r = await fetch('https://api.themoviedb.org/3' + path + (bearer ? '' : sep + 'api_key=' + encodeURIComponent(key)), bearer ? { headers: { Authorization: 'Bearer ' + key } } : {}); }
  catch { throw new Error(t('err.tmdbNet')); }
  if (r.status === 401) throw new Error(t('err.tmdbKey'));
  if (!r.ok) throw new Error(t('err.tmdb', r.status));
  return r.json();
}
const CHAR_Q = 'id name{full alternative} image{large} siteUrl media(sort:POPULARITY_DESC, perPage:1){nodes{title{english romaji}}}';
const ANIME_Q = 'id title{english romaji} synonyms coverImage{extraLarge} seasonYear format siteUrl';
const MAP = {
  achar(c) {
    if (!c || !c.image || !c.image.large || !c.name.full) return null;
    const m = c.media.nodes[0], parts = c.name.full.split(' '), flipped = parts.length === 2 ? parts[1] + ' ' + parts[0] : '';
    return { id: 'c' + c.id, cat: 'achar', a: c.name.full, al: [flipped, ...(c.name.alternative || [])].filter(x => x && /[a-z]/i.test(x)).map(x => x.replace(/\s*\(.*?\)/g, '')), from: m ? (m.title.english || m.title.romaji) : '', f: c.image.large, via: 'AniList', src: c.siteUrl };
  },
  anime(m) {
    if (!m || !m.coverImage || !m.coverImage.extraLarge) return null;
    const a = m.title.english || m.title.romaji;
    return { id: 'a' + m.id, cat: 'anime', a, al: [m.title.romaji, ...(m.synonyms || [])].filter(x => x && x !== a && /^[\x20-\x7e]+$/.test(x)), film: m.format === 'MOVIE', year: m.seasonYear || '', f: m.coverImage.extraLarge, via: 'AniList', src: m.siteUrl, franchise: true };
  },
  movie(m) {
    if (!m || !m.backdrop_path) return null;
    return { id: 'm' + m.id, cat: 'movie', a: m.title, al: m.original_title && m.original_title !== m.title ? [m.original_title] : [], year: (m.release_date || '').slice(0, 4), f: 'https://image.tmdb.org/t/p/w1280' + m.backdrop_path, via: 'TMDB', src: 'https://www.themoviedb.org/movie/' + m.id };
  },
  actor(c, movieTitle) {
    if (!c || !c.profile_path) return null;
    return { id: 'p' + c.id, cat: 'actor', a: c.name, al: [], movie: movieTitle || '', f: 'https://image.tmdb.org/t/p/h632' + c.profile_path, via: 'TMDB', src: 'https://www.themoviedb.org/person/' + c.id };
  }
};
const LOADERS = {
  async achar(page) { return (await anilist(`{ Page(page:${page}, perPage:50){ characters(sort:FAVOURITES_DESC){ ${CHAR_Q} } } }`)).Page.characters.map(MAP.achar).filter(Boolean); },
  async anime(page) { return (await anilist(`{ Page(page:${page}, perPage:50){ media(type:ANIME, sort:POPULARITY_DESC, isAdult:false, format_in:[TV,MOVIE]){ ${ANIME_Q} } } }`)).Page.media.map(MAP.anime).filter(Boolean); },
  async movie(page) {
    const out = [];
    for (let p = (page - 1) * 3 + 1; p <= page * 3; p++) out.push(...(await tmdb(`/discover/movie?sort_by=vote_count.desc&include_adult=false&language=en-US&page=${p}`)).results.map(MAP.movie).filter(Boolean));
    return out;
  },
  async actor(page) {   // lead actors of the most voted movies: famous faces first
    const out = [], seen = new Set();
    for (let p = (page - 1) * 2 + 1; p <= page * 2; p++) {
      const d = await tmdb(`/discover/movie?sort_by=vote_count.desc&include_adult=false&language=en-US&page=${p}`);
      const credits = await Promise.all(d.results.map(m => tmdb(`/movie/${m.id}/credits?language=en-US`).then(c => [m, c]).catch(() => null)));
      for (const mc of credits) if (mc) for (const c of mc[1].cast.slice(0, 4)) {
        if (seen.has(c.id) || c.known_for_department !== 'Acting') continue;
        const item = MAP.actor(c, mc[0].title); if (item) { seen.add(c.id); out.push(item); }
      }
    }
    return out;
  }
};
async function fetchById(id) {   // used by challenge links, so both players get exactly the same pictures
  if (BYID[id]) return BYID[id];
  const n = +id.slice(1); let d = null;
  if (!Number.isInteger(n)) return null;
  if (id[0] === 'c') d = MAP.achar((await anilist(`{ Character(id:${n}){ ${CHAR_Q} } }`)).Character);
  else if (id[0] === 'a') d = MAP.anime((await anilist(`{ Media(id:${n}){ ${ANIME_Q} } }`)).Media);
  else if (id[0] === 'm') d = MAP.movie(await tmdb(`/movie/${n}?language=en-US`));
  else if (id[0] === 'p') d = MAP.actor(await tmdb(`/person/${n}?language=en-US`));
  if (d) { prep(d); d.rank = 9999; BYID[d.id] = d; }
  return d;
}
function franchiseKey(s) { const k = norm(s.split(/:| Season| Part| Movie| The Movie| \d+(st|nd|rd|th)| II\b| -/i)[0]); return k.length >= 4 ? k : norm(s); }
function prep(d) {
  d.fk = d.franchise ? franchiseKey(d.a) : norm(d.a);
  d.keys = [d.a, ...(d.al || [])].map(norm).filter(Boolean);
  const bare = (d.keys[0] || '').replace(/^(the|a) /, ''); if (bare && bare !== d.keys[0]) d.keys.push(bare);
}
async function ensure(cat, want) {
  PACK[cat] = PACK[cat] || []; PACK[cat].pages = PACK[cat].pages || 0;
  const maxPages = Math.ceil(SIZE.hard[cat] / PER[cat]) + 2;
  while (PACK[cat].length < want && PACK[cat].pages < maxPages) {
    const page = ++PACK[cat].pages, ck = cat + '.' + page;
    let items = cache.get(ck);
    if (!items) { try { items = await LOADERS[cat](page); } catch (e) { PACK[cat].pages--; throw e; } cache.set(ck, items); }
    const names = new Set(PACK[cat].map(d => d.fk));
    for (const d of items) {
      prep(d);
      if (!d.fk || names.has(d.fk)) continue;   // one entry per name, and one per anime franchise
      names.add(d.fk);
      d.rank = PACK[cat].length; BYID[d.id] = d; PACK[cat].push(d);
    }
  }
  return PACK[cat].slice(0, want);
}

/* ---------- the distortions: clarity t runs 0..1, and t = 1 is the untouched picture ---------- */
const scratch = document.createElement('canvas');
function setup(fx, r, W, H) {
  const p = { fx };
  if (fx === 'zoom') { p.cx = .3 + r() * .4; p.cy = .22 + r() * .4; }
  if (fx === 'tiles' || fx === 'shuffle') {
    const cols = fx === 'tiles' ? 6 : 4;
    p.cols = cols; p.rows = clamp(Math.round(cols * H / W), 3, 9);
    const n = p.cols * p.rows, idx = [...Array(n).keys()];
    p.order = shuffled(idx, r);
    if (fx === 'shuffle') { const s = shuffled(idx, r), to = {}; s.forEach((v, i) => to[v] = s[(i + 1) % n]); p.from = idx.map(i => to[i]); }
  }
  return p;
}
function draw(ctx, img, p, tt) {
  const W = ctx.canvas.width, H = ctx.canvas.height, c = Math.max(0, tt);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.canvas.style.filter = ''; ctx.canvas.style.transform = '';
  if (c >= 1) { ctx.drawImage(img, 0, 0, W, H); return; }
  if (p.fx === 'pixel') {
    const n = Math.max(4, Math.round(5 * Math.pow(W / 5, Math.pow(c, 1.7)))), m = Math.max(3, Math.round(n * H / W));
    scratch.width = n; scratch.height = m;
    scratch.getContext('2d').drawImage(img, 0, 0, n, m);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scratch, 0, 0, n, m, 0, 0, W, H);
  } else if (p.fx === 'blur') {
    ctx.drawImage(img, 0, 0, W, H);
    const shown = ctx.canvas.clientWidth || W;
    ctx.canvas.style.filter = `blur(${(shown * .065 * Math.pow(1 - c, 1.5)).toFixed(2)}px)`;
    ctx.canvas.style.transform = 'scale(1.12)';
  } else if (p.fx === 'zoom') {
    const s = .08 * Math.pow(1 / .08, Math.pow(c, 1.35)), w = W * s, h = H * s;
    const x = clamp(p.cx * W - w / 2, 0, W - w), y = clamp(p.cy * H - h / 2, 0, H - h);
    ctx.drawImage(img, x * img.width / W, y * img.height / H, w * img.width / W, h * img.height / H, 0, 0, W, H);
  } else if (p.fx === 'tiles') {
    ctx.drawImage(img, 0, 0, W, H);
    const n = p.order.length, open = 2 + Math.floor((n - 2) * c), tw = W / p.cols, th = H / p.rows;
    ctx.fillStyle = COVER;
    for (let k = open; k < n; k++) { const i = p.order[k]; ctx.fillRect(Math.floor((i % p.cols) * tw), Math.floor(Math.floor(i / p.cols) * th), Math.ceil(tw), Math.ceil(th)); }
  } else if (p.fx === 'shuffle') {
    const n = p.order.length, fixed = new Set(p.order.slice(0, Math.floor(n * Math.pow(c, 1.15)))), tw = W / p.cols, th = H / p.rows;
    const sw = img.width / p.cols, sh = img.height / p.rows;
    for (let i = 0; i < n; i++) {
      const s = fixed.has(i) ? i : p.from[i];
      ctx.drawImage(img, (s % p.cols) * sw, Math.floor(s / p.cols) * sh, sw, sh, Math.floor((i % p.cols) * tw), Math.floor(Math.floor(i / p.cols) * th), Math.ceil(tw), Math.ceil(th));
    }
  }
}

/* ---------- profile: statistics and achievements, kept in this browser ---------- */
function prof() { const p = store.get().prof || {}; return { name: '', games: {}, rounds: 0, correct: 0, timeSum: 0, points: 0, cat: {}, best: {}, ach: {}, bestStreak: 0, ...p }; }
function saveProf(p) { store.set({ prof: p }); }
function unlock(p, id) { if (p.ach[id]) return; p.ach[id] = Date.now(); const [name, how] = t('ach.' + id).split('|'); toast(t('ach.unlocked'), name + ' · ' + how); }
function recordRound(r, d) {
  const p = prof();
  p.rounds++; p.cat[d.cat] = p.cat[d.cat] || { r: 0, c: 0 }; p.cat[d.cat].r++;
  if (r.ok) {
    p.correct++; p.timeSum += r.secs; p.points += r.pts; p.cat[d.cat].c++;
    unlock(p, 'first');
    if (r.secs < 3) unlock(p, 'snap');
    if (r.pts >= 900) unlock(p, 'blind');
    if (r.wrong >= 2) unlock(p, 'comeback');
    if (p.correct >= 100) unlock(p, 'century');
    if (CAT_KEYS.every(c => p.cat[c] && p.cat[c].c > 0)) unlock(p, 'allcats');
  }
  saveProf(p);
}

/* ---------- routing and home ---------- */
const PAGES = ['home', 'play', 'end', 'how', 'profile', 'about'];
function show(id) {
  for (const s of PAGES) $(s).hidden = s !== id;
  $('site').hidden = id === 'play';
  document.querySelectorAll('.site nav a').forEach(a => a.getAttribute('href') === '#' + id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  window.scrollTo(0, 0);
}
function stopGame() { cancelAnimationFrame(raf); clearTimeout(flashTimer); round = null; game = null; }
function route() {
  const h = location.hash;
  stopGame(); heroRun++;
  if (h.startsWith('#c=')) { pending = readChallenge(h.slice(3)); if (!pending) homeNote = t('ch.bad'); history.replaceState(null, '', location.pathname); }
  if (h === '#how') return show('how');
  if (h === '#profile') { renderProfile(); return show('profile'); }
  if (h === '#about') { renderAbout(); return show('about'); }
  renderHome(); show('home'); hero();
}
function goHome() { if (location.hash && !location.hash.startsWith('#c=')) location.hash = ''; else route(); }

function renderHome() {
  const s = store.get(), p = prof(), box = $('cats'), hasKey = !!tmdbKey();
  box.innerHTML = '';
  const add = (key, wide) => {
    const locked = NEEDS_KEY[key] && !hasKey, best = p.best[kind + '.' + key + '.' + diff];
    const note = locked ? t('cat.locked') : best ? t('cat.best', fmt(best)) : key === 'mix' ? t(hasKey ? 'cat.mixAll' : 'cat.mixAnime') : t('cat.top', SIZE[diff][key]);
    const b = el('button', { className: 'btn' + (wide ? ' wide' : '') + (locked ? ' locked' : '') }, el('span', { textContent: t('cat.' + key) }), el('small', { textContent: note }));
    b.onclick = () => locked ? (location.hash = '#about') : newGame(kind, 'free', key);
    box.append(b);
  };
  add('mix', true); CAT_KEYS.forEach(k => add(k));
  for (const b of $('diff').children) b.setAttribute('aria-pressed', b.dataset.d === diff);
  for (const b of $('kind').children) b.setAttribute('aria-pressed', b.dataset.k === kind);
  $('kindNote').textContent = t('note.' + kind);
  const d = s.daily && s.daily.date === today() ? s.daily : null;
  $('dailyBtn').disabled = false;
  $('dailyTitle').textContent = d ? t('daily.done', fmt(d.score)) : t('daily.play');
  $('dailyMeta').textContent = homeNote || (d ? t('daily.again') + (s.streak > 1 ? ' · ' + t('daily.streak', s.streak) : '') : (s.streak > 0 && s.lastDaily === yesterday() ? t('daily.keep', s.streak) : t('daily.new')));
  homeNote = '';
  $('challenge').hidden = !pending;
  if (pending) { $('chTitle').textContent = t('ch.title', pending.n || t('friend'), fmt(pending.s)); $('chSub').textContent = t('ch.sub'); }
}
for (const b of $('diff').children) b.onclick = () => { diff = b.dataset.d; store.set({ diff }); renderHome(); };
for (const b of $('kind').children) b.onclick = () => { kind = b.dataset.k; store.set({ kind }); renderHome(); };
$('langBtn').onclick = () => { lang = lang === 'en' ? 'tr' : 'en'; store.set({ lang }); applyLang(); if (!$('home').hidden) renderHome(); if (!$('profile').hidden) renderProfile(); if (!$('about').hidden) renderAbout(); };
$('dailyBtn').onclick = () => newGame('classic', 'daily', 'mix');
$('chBtn').onclick = () => newGame('classic', 'challenge', 'mix');

let heroTimer = 0, heroRun = 0;
function hero() {
  const cv = $('heroCanvas'), ctx = cv.getContext('2d'), run = ++heroRun;
  const src = [...(PACK.movie || []).slice(0, 40), ...(PACK.actor || []).slice(0, 30), ...(PACK.achar || []).slice(0, 40), ...(PACK.anime || []).slice(0, 30)];
  if (!src.length) return;
  const picks = shuffled(src, Math.random), still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let k = 0;
  const one = async () => {
    if (run !== heroRun) return;
    const d = picks[k++ % picks.length], fx = ['pixel', 'tiles', 'shuffle', 'zoom'][k % 4];
    let img; try { img = await loadImg(d.f); } catch { if (k < 8) one(); return; }
    if (run !== heroRun) return;
    const crop = el('canvas', { width: cv.width, height: cv.height }), sc = Math.max(cv.width / img.width, cv.height / img.height);
    crop.getContext('2d').drawImage(img, (cv.width - img.width * sc) / 2, (cv.height - img.height * sc) / 2, img.width * sc, img.height * sc);
    const p = setup(fx, rng(hash(d.id)), cv.width, cv.height), t0 = performance.now(), LEN = 7000;
    $('heroFx').textContent = t('fx.' + fx); $('heroName').textContent = '?';
    if (still) { draw(ctx, crop, p, .55); return; }
    const tick = now => {
      if (run !== heroRun || $('home').hidden) return;
      const c = (now - t0) / LEN;
      draw(ctx, crop, p, Math.min(1, c));
      if (c >= 1) $('heroName').textContent = d.a;
      if (c < 1.45) heroTimer = requestAnimationFrame(tick); else one();
    };
    heroTimer = requestAnimationFrame(tick);
  };
  one();
}

/* ---------- challenge links ---------- */
const b64 = { enc: s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), dec: s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))) };
function makeChallenge() { return SITE + '#c=' + b64.enc(JSON.stringify({ v: 1, n: prof().name || '', s: totalOf(game), l: game.level, p: game.picks.map(p => [p.id, FX_KEYS.indexOf(p.fx), p.seed]) })); }
function readChallenge(code) {
  try {
    const c = JSON.parse(b64.dec(code));
    if (c.v !== 1 || !Array.isArray(c.p) || c.p.length !== ROUNDS) return null;
    const picks = c.p.map(([id, fx, seed]) => ({ id: String(id), fx: FX_KEYS[fx], seed: seed >>> 0 }));
    if (picks.some(p => !/^[camp]\d+$/.test(p.id) || !p.fx)) return null;
    return { n: String(c.n || '').slice(0, 16), s: Math.max(0, Math.min(5000, +c.s || 0)), l: SIZE[c.l] ? c.l : 'normal', picks };
  } catch { return null; }
}

/* ---------- game flow ---------- */
const totalOf = g => g.results.reduce((s, r) => s + r.pts, 0);
function fail(msg) { homeNote = msg; stopGame(); renderHome(); show('home'); hero(); }
async function newGame(k, mode, cat) {
  const rules = KINDS[k];
  let cats = cat === 'mix' ? available() : [cat], level = mode === 'daily' ? 'normal' : diff, picks = [], poolItems = [];
  $('dailyMeta').textContent = t('loading');
  try {
    if (mode === 'challenge') {
      if (pending.picks.some(p => NEEDS_KEY[{ m: 'movie', p: 'actor' }[p.id[0]]]) && !tmdbKey()) return fail(t('ch.needKey'));
      level = pending.l;
      const items = []; for (const p of pending.picks) items.push(await fetchById(p.id));
      if (items.some(d => !d)) return fail(t('ch.bad'));
      cats = [...new Set(items.map(d => d.cat))];
      picks = pending.picks;
    }
    for (const c of cats) poolItems = poolItems.concat(await ensure(c, SIZE[level][c]));
  } catch (e) { return fail(e.message); }
  if (poolItems.length < ROUNDS) return fail(t('err.few'));
  if (k === 'classic' && mode !== 'challenge') {
    let r = Math.random, items;
    if (mode === 'daily') { r = rng(hash('obscura-' + today())); items = shuffled(poolItems.slice().sort((a, b) => a.id < b.id ? -1 : 1), r).slice(0, ROUNDS); }
    else {
      const seen = new Set(store.get().seen || []);
      let fresh = poolItems.filter(d => !seen.has(d.id));
      if (fresh.length < ROUNDS) { store.set({ seen: [...seen].filter(id => !poolItems.some(d => d.id === id)) }); fresh = poolItems; }
      items = shuffled(fresh, r).slice(0, ROUNDS);
    }
    const f = shuffled(FX_KEYS, r);
    picks = items.map((d, i) => ({ id: d.id, fx: f[i % f.length], seed: Math.floor(r() * 1e9) }));
  }
  game = { kind: k, rules, mode, cat, cats, level, date: today(), picks, pool: poolItems, used: new Set(), i: 0, results: [], lives: rules.lives || 0, clock: rules.clock || 0, target: mode === 'challenge' ? pending : null };
  heroRun++; show('play'); startRound();
}
function nextPick() {
  if (game.kind === 'classic') return game.picks[game.i];
  // sprint and survival draw pictures as they go; survival starts with the most famous and widens
  let from = game.pool.filter(d => !game.used.has(d.id));
  if (game.kind === 'survival') { const windowSize = 24 + game.i * 8, byRank = from.slice().sort((a, b) => a.rank - b.rank); from = byRank.slice(0, Math.max(6, Math.round(windowSize * game.cats.length / 2))); }
  if (!from.length) { game.used.clear(); from = game.pool; }
  const d = from[Math.floor(Math.random() * from.length)];
  game.used.add(d.id);
  const pk = { id: d.id, fx: FX_KEYS[Math.floor(Math.random() * FX_KEYS.length)], seed: Math.floor(Math.random() * 1e9) };
  game.picks[game.i] = pk; return pk;
}
function fit() {
  if (!round || !round.img) return;
  const st = $('stage').getBoundingClientRect(), ar = round.img.width / round.img.height;
  let w = st.width, h = w / ar;
  if (h > st.height) { h = st.height; w = h * ar; }
  $('frame').style.width = Math.floor(w) + 'px'; $('frame').style.height = Math.floor(h) + 'px';
}
new ResizeObserver(() => { fit(); if (round && round.img) draw(round.ctx, round.img, round.p, round.done ? 1 : round.t); }).observe($('stage'));
function hud() {
  const h = $('hud'), quick = game.kind !== 'classic';
  h.hidden = !quick; $('pips').hidden = quick;
  if (game.kind === 'classic') $('pips').innerHTML = game.picks.map((_, i) => `<i class="${i < game.i ? 'done' : i === game.i ? 'now' : ''}"></i>`).join('');
  else if (game.kind === 'survival') h.innerHTML = [0, 1, 2].map(i => `<i class="${i < game.lives ? '' : 'off'}"></i>`).join('');
  else { const s = Math.max(0, Math.ceil(game.clock / 1000)); h.textContent = `0:${String(s).padStart(2, '0')}`; h.classList.toggle('low', s <= 10); }
  $('total').textContent = fmt(totalOf(game));
}
async function startRound() {
  cancelAnimationFrame(raf);
  const pk = nextPick(), d = BYID[pk.id], rules = game.rules;
  round = { d, pk, wrong: 0, hint: false, done: false, t: 0, elapsed: 0, img: null, tried: new Set() };
  hud();
  $('roundLabel').textContent = (game.kind === 'classic' ? t('round', game.i + 1, ROUNDS) : game.kind === 'survival' ? t('roundN', game.i + 1) : t('mode.sprint')) + ' · ' + t('cat.' + d.cat);
  $('fxLabel').textContent = t('fx.' + pk.fx);
  $('guess').value = ''; $('guess').placeholder = t('ask.' + d.cat) + ' ' + t('ask.type');
  $('hintText').textContent = ''; $('hintBtn').disabled = false; $('hintBtn').hidden = game.kind === 'sprint';
  $('giveUpBtn').textContent = t(game.kind === 'classic' ? 'giveUp' : 'skip');
  $('opts').hidden = true; $('flash').hidden = true;
  $('strikes').parentElement.hidden = game.kind === 'survival';
  [...$('strikes').children].forEach(i => i.className = '');
  $('guessing').hidden = false; $('verdict').hidden = true;
  $('fill').style.width = '100%'; $('avail').textContent = MAXPTS;
  const cv = $('cv'); round.ctx = cv.getContext('2d');
  round.ctx.clearRect(0, 0, cv.width, cv.height);
  const mine = round;
  let img; try { img = await loadImg(d.f); } catch { img = null; }
  if (round !== mine) return;
  if (!img) { finish(false, true); return; }
  round.img = img;
  const sc = Math.min(1, 1100 / Math.max(img.width, img.height));
  cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
  round.p = setup(pk.fx, rng(pk.seed), cv.width, cv.height);
  fit();
  let last = performance.now();
  if (matchMedia('(hover: hover)').matches) $('guess').focus();
  if (game.kind === 'classic') { const nx = game.picks[game.i + 1]; if (nx) loadImg(BYID[nx.id].f).catch(() => {}); }
  const tick = now => {
    if (round !== mine || round.done) return;
    const dt = Math.max(0, Math.min(250, now - last)); last = now;   // a hidden tab does not burn the clock in one jump
    round.elapsed += dt; round.t = Math.min(1, round.elapsed / rules.dur);
    draw(round.ctx, round.img, round.p, round.t);
    const a = avail();
    $('avail').textContent = a; $('fill').style.width = (a / MAXPTS * 100) + '%';
    if (game.kind === 'sprint') { game.clock -= dt; hud(); if (game.clock <= 0) { round.done = true; endGame(); return; } }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
function avail() {
  const base = Math.round(MAXPTS - (MAXPTS - FLOOR) * round.t);
  return Math.max(0, base - WRONG * round.wrong - (round.hint ? HINT : 0));
}
let flashTimer = 0;
function finish(ok, broken) {
  if (!round || round.done) return;
  round.done = true; cancelAnimationFrame(raf);
  const d = round.d, pts = ok ? Math.max(50, avail()) : 0, secs = +(round.elapsed / 1000).toFixed(1);
  const res = { id: d.id, pts, ok, secs, wrong: round.wrong, hint: round.hint, fx: round.pk.fx };
  game.results.push(res);
  if (!broken) recordRound(res, d);
  if (game.kind === 'survival' && !ok && !broken && !round.lifeTaken) game.lives--;
  if (round.img) draw(round.ctx, round.img, round.p, 1);
  const seen = new Set(store.get().seen || []); seen.add(d.id); store.set({ seen: [...seen].slice(-600) });
  hud(); $('opts').hidden = true;
  if (game.kind !== 'classic') {   // quick modes: show the answer briefly on the picture, then move on
    $('guessing').hidden = false;
    const f = $('flash'); f.hidden = false; f.className = ok ? 'ok' : 'no';
    $('flashName').textContent = d.a; $('flashPts').textContent = ok ? '+' + fmt(pts) : '0';
    const over = game.kind === 'survival' && game.lives <= 0;
    flashTimer = setTimeout(() => { if (!game) return; game.i++; over ? endGame() : startRound(); }, over ? 1600 : game.kind === 'sprint' ? 750 : 1300);
    return;
  }
  $('guessing').hidden = true; $('verdict').hidden = false;
  const tag = $('vTag');
  tag.className = 'mono tag ' + (ok ? 'ok' : 'no');
  tag.textContent = broken ? t('v.broken') : ok ? t('v.correct', secs.toFixed(1)) : round.wrong >= game.rules.strikes ? t('v.three') : t('v.gaveUp');
  $('vTitle').textContent = d.a; $('vSub').textContent = subOf(d);
  $('vPts').textContent = (ok ? '+' : '') + fmt(pts);
  $('vCredit').innerHTML = '';
  $('vCredit').append(t('v.credit') + ' ', el('a', { href: d.src, textContent: d.via, target: '_blank', rel: 'noopener' }));
  $('nextBtn').textContent = game.i + 1 < ROUNDS ? t('next') : t('seeResult');
  requestAnimationFrame(() => { fit(); if (round && round.img) draw(round.ctx, round.img, round.p, 1); $('nextBtn').focus(); });
}
$('nextBtn').onclick = () => { game.i++; if (game.i < ROUNDS) startRound(); else endGame(); };
$('giveUpBtn').onclick = () => finish(false);
$('hintBtn').onclick = () => {
  if (!round || round.hint || round.done) return;
  round.hint = true; $('hintBtn').disabled = true;
  $('hintText').textContent = round.d.a.split(' ').map(w => { let first = true; return [...w].map(ch => /[\p{L}\p{N}]/u.test(ch) ? (first ? (first = false, ch) : '·') : ch).join(''); }).join('  ');
  $('guess').focus();
};

/* ---------- guessing: type, then choose from the list ---------- */
let matches = [], sel = 0;
function pool() { const all = game.cats.flatMap(c => PACK[c] || []); for (const p of game.picks) if (p && !all.includes(BYID[p.id])) all.push(BYID[p.id]); return all; }
function refresh() {
  const q = norm($('guess').value), ul = $('opts');
  if (!q || !round || round.done) { ul.hidden = true; $('guess').setAttribute('aria-expanded', 'false'); matches = []; return; }
  const score = d => d.keys.includes(q) ? 0 : d.keys.some(k => k.startsWith(q)) ? 1 : d.keys.some(k => k.includes(' ' + q)) ? 2 : 3;
  matches = pool().filter(d => !round.tried.has(d.id) && d.keys.some(k => k.includes(q))).sort((a, b) => (score(a) - score(b)) || (a.rank - b.rank)).slice(0, 7);
  sel = 0; ul.innerHTML = '';
  if (!matches.length) ul.append(el('li', { className: 'none', textContent: t('noMatch') }));
  matches.forEach((d, i) => {
    const li = el('li', { id: 'opt' + i }, el('span', { textContent: d.a }), el('small', { textContent: d.cat === 'achar' ? (d.from || '').slice(0, 28) : d.cat === 'movie' ? d.year : t('cat.' + d.cat) }));
    li.setAttribute('role', 'option'); li.setAttribute('aria-selected', i === 0);
    li.onmousedown = e => { e.preventDefault(); submit(d); };
    ul.append(li);
  });
  ul.hidden = false; $('guess').setAttribute('aria-expanded', 'true');
}
function move(dir) {
  if (!matches.length) return;
  sel = (sel + dir + matches.length) % matches.length;
  [...$('opts').children].forEach((li, i) => li.setAttribute('aria-selected', i === sel));
  $('guess').setAttribute('aria-activedescendant', 'opt' + sel);
}
function submit(d) {
  if (!d || !round || round.done || !round.img) return;
  if (d.id === round.d.id) return finish(true);
  round.wrong++; round.tried.add(d.id);
  [...$('strikes').children].forEach((i, k) => i.className = k < round.wrong ? 'on' : '');
  const f = $('frame'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
  $('guess').value = ''; refresh();
  if (game.kind === 'survival') { game.lives--; hud(); if (game.lives <= 0) { round.lifeTaken = true; finish(false); } return; }
  if (round.wrong >= game.rules.strikes) finish(false);
}
$('guess').addEventListener('input', refresh);
$('guess').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
  else if (e.key === 'Escape') { $('opts').hidden = true; }
});
$('guess').addEventListener('blur', () => { $('opts').hidden = true; });
$('guess').addEventListener('focus', refresh);
$('askForm').addEventListener('submit', e => { e.preventDefault(); submit(matches[sel]); });
$('quitBtn').onclick = goHome;

/* ---------- end of game ---------- */
function rankFor(s) { return t('rank.' + (s >= 4200 ? 5 : s >= 3200 ? 4 : s >= 2000 ? 3 : s >= 800 ? 2 : 1)); }
function gameName() {
  const where = game.cat === 'mix' ? t('cat.mix') : t('cat.' + game.cat);
  if (game.mode === 'daily') return t('end.daily', game.date);
  if (game.mode === 'challenge') return t('end.challengeLabel');
  return `${t('mode.' + game.kind)} · ${where} · ${t('diff.' + game.level)}`;
}
function shareLine() {
  const total = totalOf(game);
  if (game.kind !== 'classic') return `Obscura · ${gameName()}\n${fmt(total)} · ${t('end.correctN', game.results.filter(r => r.ok).length)}\n${SITE}`;
  const sq = game.results.map(r => r.pts >= 800 ? '🟩' : r.pts >= 500 ? '🟨' : r.pts > 0 ? '🟧' : '⬛').join('');
  return `Obscura · ${gameName()}\n${fmt(total)} / ${fmt(5000)}\n${sq}\n${SITE}`;
}
function endGame() {
  cancelAnimationFrame(raf);
  const score = totalOf(game), s = store.get(), p = prof(), ok = game.results.filter(r => r.ok).length;
  const gk = game.mode === 'free' ? game.kind : game.mode;
  p.games[gk] = (p.games[gk] || 0) + 1;
  let note = '';
  if (game.mode === 'daily') {
    if (!(s.daily && s.daily.date === game.date)) {
      const streak = s.lastDaily === yesterday() ? (s.streak || 0) + 1 : 1;
      store.set({ daily: { date: game.date, score }, lastDaily: game.date, streak });
      p.bestStreak = Math.max(p.bestStreak || 0, streak); p.best.daily = Math.max(p.best.daily || 0, score);
      if (streak >= 3) unlock(p, 'streak3'); if (streak >= 7) unlock(p, 'streak7');
      note = streak > 1 ? t('daily.streak', streak) : t('end.tomorrow');
    } else note = t('end.practice', fmt(s.daily.score));
  } else if (game.mode === 'challenge') {
    const who = game.target.n || t('friend'), gap = score - game.target.s;
    note = gap > 0 ? t('end.beat', who, fmt(gap)) : gap < 0 ? t('end.lost', who, fmt(-gap)) : t('end.tie', who);
    if (gap > 0) unlock(p, 'rival');
    pending = null;
  } else {
    const k = game.kind + '.' + game.cat + '.' + game.level, prev = p.best[k] || 0;
    if (score > prev) { p.best[k] = score; note = prev ? t('end.newPb') : ''; } else note = t('end.pb', fmt(prev));
    p.best[game.kind] = Math.max(p.best[game.kind] || 0, score);
  }
  if (game.kind === 'classic') {
    if (ok === ROUNDS) unlock(p, 'clean');
    if (ok === ROUNDS && game.results.every(r => !r.hint && !r.wrong)) unlock(p, 'purist');
    if (score >= 4000) unlock(p, 'club4k');
  }
  if (game.kind === 'sprint' && ok >= 8) unlock(p, 'sprint8');
  if (game.kind === 'survival' && game.results.length >= 15) unlock(p, 'surv15');
  saveProf({ ...prof(), games: p.games, best: p.best, ach: p.ach, bestStreak: p.bestStreak });
  $('endLabel').textContent = gameName();
  $('endScore').textContent = fmt(score);
  $('endOutOf').textContent = game.kind === 'classic' ? '/ ' + fmt(5000) : game.kind === 'sprint' ? t('end.correctN', ok) : t('end.roundsN', Math.max(0, game.results.length - (game.lives <= 0 ? 1 : 0)));
  $('endRank').textContent = game.mode === 'challenge' ? note : game.kind === 'classic' ? rankFor(score) : '';
  $('endRank').hidden = !$('endRank').textContent;
  $('endBest').textContent = game.mode === 'challenge' ? '' : note;
  $('againBtn').textContent = game.mode === 'free' ? t('end.again') : t('end.freeplay');
  $('challengeBtn').hidden = game.kind !== 'classic'; $('challengeBtn').textContent = t('end.challenge');
  const rows = $('endRows'); rows.innerHTML = '';
  for (const r of game.results.slice(-40)) {
    const d = BYID[r.id];
    const meta = [t('fx.' + r.fx), r.ok ? t('secs', r.secs.toFixed(1)) : t('end.missed'), r.wrong ? t('end.wrongN', r.wrong) : '', r.hint ? t('end.hint') : ''].filter(Boolean).join(' · ');
    rows.append(el('div', { className: 'row' }, el('img', { src: d.f, alt: '', loading: 'lazy' }), el('div', null, el('strong', { textContent: d.a }), el('span', { className: 'mono', textContent: meta })), el('span', { className: 'pts' + (r.pts ? '' : ' zero'), textContent: fmt(r.pts) })));
  }
  $('shareText').hidden = true; $('copyBtn').textContent = t('end.copy');
  $('site').hidden = false;
  for (const sct of PAGES) $(sct).hidden = sct !== 'end';
  window.scrollTo(0, 0);
}
async function copyOut(text, btn, done) {
  try { await navigator.clipboard.writeText(text); btn.textContent = t(done); }
  catch { const ta = $('shareText'); ta.value = text; ta.hidden = false; ta.select(); btn.textContent = t('end.select'); }
}
$('againBtn').onclick = () => { const k = game.kind, c = game.mode === 'free' ? game.cat : 'mix'; newGame(k, 'free', c); };
$('homeBtn').onclick = goHome;
$('copyBtn').onclick = () => copyOut(shareLine(), $('copyBtn'), 'end.copied');
$('challengeBtn').onclick = () => copyOut(makeChallenge(), $('challengeBtn'), 'end.linkCopied');

/* ---------- profile and about pages ---------- */
function renderProfile() {
  const p = prof(), s = store.get(), games = Object.values(p.games).reduce((a, b) => a + b, 0);
  $('nick').value = p.name || '';
  const cells = [[t('pf.games'), fmt(games)], [t('pf.rounds'), fmt(p.rounds)], [t('pf.correct'), fmt(p.correct)], [t('pf.acc'), p.rounds ? Math.round(p.correct / p.rounds * 100) + '%' : '–'],
    [t('pf.avg'), p.correct ? t('secs', (p.timeSum / p.correct).toFixed(1)) : '–'], [t('pf.points'), fmt(p.points)], [t('pf.streak'), t('days', s.lastDaily === today() || s.lastDaily === yesterday() ? (s.streak || 0) : 0)], [t('pf.bestStreak'), t('days', p.bestStreak || 0)]];
  $('pfStats').replaceChildren(...cells.map(([k, v]) => el('div', null, el('b', { textContent: v }), el('span', { className: 'mono', textContent: k }))));
  $('pfCats').replaceChildren(...CAT_KEYS.map(c => { const x = p.cat[c] || { r: 0, c: 0 }, pct = x.r ? Math.round(x.c / x.r * 100) : 0; const bar = el('i'); bar.style.width = pct + '%';
    return el('div', { className: 'b' }, el('span', { textContent: t('cat.' + c) }), el('div', { className: 't' }, bar), el('span', { className: 'mono', textContent: x.r ? `${pct}% · ${x.c}/${x.r}` : '–' })); }));
  const bests = [['mode.classic', p.best.classic, 5000], ['pf.dailyBest', p.best.daily, 5000], ['mode.sprint', p.best.sprint, Math.max(5000, p.best.sprint || 0)], ['mode.survival', p.best.survival, Math.max(5000, p.best.survival || 0)]];
  $('pfBests').replaceChildren(...bests.map(([k, v, max]) => { const bar = el('i'); bar.style.width = (v ? v / max * 100 : 0) + '%';
    return el('div', { className: 'b' }, el('span', { textContent: t(k) }), el('div', { className: 't' }, bar), el('span', { className: 'mono', textContent: v ? fmt(v) : '–' })); }));
  $('pfAchTitle').textContent = t('pf.ach', ACH.filter(a => p.ach[a]).length, ACH.length);
  $('pfAch').replaceChildren(...ACH.map(a => { const [name, how] = t('ach.' + a).split('|'); return el('div', { className: p.ach[a] ? 'on' : '' }, el('strong', { textContent: name }), el('span', { textContent: how })); }));
  $('resetMsg').textContent = ''; resetArmed = false; $('resetBtn').textContent = t('pf.reset');
}
$('nick').addEventListener('input', () => { const p = prof(); p.name = $('nick').value.trim().slice(0, 16); saveProf(p); });
let resetArmed = false;
$('resetBtn').onclick = () => {
  if (!resetArmed) { resetArmed = true; $('resetBtn').textContent = t('pf.resetSure'); return; }
  store.set({ prof: { name: prof().name }, daily: null, streak: 0, lastDaily: '', seen: [] }); renderProfile(); $('resetMsg').textContent = t('pf.resetDone');
};
function renderAbout() { $('keyBox').hidden = !!builtInKey(); $('tmdbKey').value = store.get().tmdb || ''; $('keyMsg').textContent = store.get().tmdb ? t('ab.keySaved') : ''; }
$('keySave').onclick = async () => {
  const key = $('tmdbKey').value.trim();
  if (!key) { $('keyMsg').textContent = t('ab.keyEmpty'); return; }
  $('keyMsg').textContent = t('ab.keyTesting');
  try { await tmdb('/configuration', key); store.set({ tmdb: key }); $('keyMsg').textContent = t('ab.keyOk'); }
  catch (e) { $('keyMsg').textContent = e.message; }
};
$('keyClear').onclick = () => { store.set({ tmdb: '' }); $('tmdbKey').value = ''; $('keyMsg').textContent = t('ab.keyGone'); };
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('installBtn').hidden = false; });
$('installBtn').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; $('installBtn').hidden = true; };

/* ---------- boot ---------- */
(async () => {
  const s = store.get();
  diff = SIZE[s.diff] ? s.diff : 'normal'; kind = KINDS[s.kind] ? s.kind : 'classic';
  lang = s.lang || ((navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en');
  applyLang();
  $('dailyTitle').textContent = t('daily.play'); $('dailyMeta').textContent = t('loadingLists');
  addEventListener('hashchange', route);
  route();
  try {
    await ensure('achar', 50); await ensure('anime', 50);
    if (tmdbKey()) await ensure('movie', 60).catch(() => {});
  } catch (e) { homeNote = e.message; }
  if (!$('home').hidden) { renderHome(); hero(); }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
})();
