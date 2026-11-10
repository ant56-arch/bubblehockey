/* Resources (#/resources, linked from the small text at the bottom of every page; the old #/games address still works). The first game is a penalty shootout: the shooter picks left,
   middle or right and the goalie does the same. Same pick = saved, different pick = goal. Five shots each, then sudden death.
   Play the computer, a friend on the same screen, or a friend on another computer with an invite code (browser to browser, using js/vendor/peerjs.min.js
   and the free public PeerJS matchmaking server, which only introduces the two browsers; the game itself goes straight between them).
   Nothing here is saved to the league data; only a win-loss record against the computer is kept in this browser. */
PAGES.push(['resources', 'Resources', true]);      // true = not in the top menu

const RES = { game: '' };                 // which game is open on the Resources page: '' = the list, 'shootout', 'faceoff'
const SG_DIRS = { L: 'Left', M: 'Middle', R: 'Right' }, SG_ROUNDS = 5, SG_CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SG = { screen: 'menu', mode: 'bot', names: ['', ''], score: [0, 0], log: [[], []], n: 0, phase: 'shooter', shot: null, res: null, winner: -1, done: true, mine: null, net: null, join: '', msg: '' };
const sgRandom = () => 'LMR'[Math.floor(Math.random() * 3)], sgDir = d => (['L', 'M', 'R'].includes(d) ? d : '');
const sgRecord = {
  get() { try { return JSON.parse(localStorage.getItem('bhl_shootout') || '{"w":0,"l":0}'); } catch { return { w: 0, l: 0 }; } },
  add(win) { const r = sgRecord.get(); win ? r.w++ : r.l++; try { localStorage.setItem('bhl_shootout', JSON.stringify(r)); } catch { } },
};
const sgShooter = () => SG.n % 2, sgGoalie = () => 1 - (SG.n % 2), sgName = i => SG.names[i] || (i ? 'Player 2' : 'Player 1');
const sgBotIs = i => SG.mode === 'bot' && i === 1;                       // in the computer game the computer is always player 2
const sgMe = () => (SG.mode === 'online' && SG.net ? SG.net.me : -1), sgOnline = () => SG.mode === 'online';

/* ---------- game flow ---------- */
function sgStart(mode) {
  const first = (D.members[0] || {}).short_name || 'You', second = (D.members[1] || {}).short_name || 'Player 2';
  Object.assign(SG, { screen: 'setup', mode, msg: '', names: [SG.names[0] || first, mode === 'bot' ? 'Computer' : (SG.names[1] && SG.names[1] !== 'Computer' ? SG.names[1] : second)] });
  sgRender();
}
function sgBegin() {
  Object.assign(SG, { screen: 'play', score: [0, 0], log: [[], []], n: 0, shot: null, res: null, winner: -1, done: true });
  sgNextPhase(); sgRender();
}
function sgNextPhase() {
  SG.shot = {}; SG.res = null; SG.mine = null;
  if (sgOnline()) { SG.phase = 'pick'; return; }
  if (sgBotIs(sgShooter())) { SG.shot.shoot = sgRandom(); SG.phase = 'goalie'; } else SG.phase = 'shooter';       // the computer shoots: its pick stays hidden and you dive first
}
function sgPick(dir) {
  const g = sgGoalie();
  if (sgOnline()) {
    if (SG.mine || SG.phase !== 'pick') return;
    const role = sgShooter() === sgMe() ? 'shoot' : 'dive'; SG.mine = dir;
    if (SG.net.host) { SG.shot[role] = dir; return sgHostCheck(); }
    sgSend({ t: 'pick', dir }); return sgRender();
  }
  if (SG.phase === 'shooter') {
    SG.shot.shoot = dir;
    if (sgBotIs(g)) { SG.shot.dive = sgRandom(); return sgReveal(); }
    SG.phase = 'pass';
  } else if (SG.phase === 'goalie') { SG.shot.dive = dir; return sgReveal(); }
  sgRender();
}
function sgHostCheck() {
  if (SG.shot.shoot && SG.shot.dive) { sgSend({ t: 'reveal', shoot: SG.shot.shoot, dive: SG.shot.dive }); sgReveal(); } else sgRender();
}
function sgReveal() {
  SG.done = false;
  const { shoot, dive } = SG.shot, goal = shoot !== dive, s = sgShooter();
  SG.res = { goal }; SG.phase = 'reveal'; SG.log[s].push(goal ? 'G' : 'S'); if (goal) SG.score[s]++;
  sgRender(true);
}
function sgOver() {
  const t = [SG.log[0].length, SG.log[1].length], [a, b] = SG.score;
  if (t[0] < SG_ROUNDS || t[1] < SG_ROUNDS) return a > b + Math.max(0, SG_ROUNDS - t[1]) ? 0 : b > a + Math.max(0, SG_ROUNDS - t[0]) ? 1 : -1;      // one side can no longer catch up
  return t[0] === t[1] && a !== b ? (a > b ? 0 : 1) : -1;                                                             // after five each, and then every pair in sudden death
}
function sgAdvance() {
  SG.pendingNext = false;
  const w = sgOver();
  if (w >= 0) { SG.winner = w; SG.screen = 'end'; if (SG.mode === 'bot') sgRecord.add(w === 0); return sgRender(); }
  SG.n++; sgNextPhase(); sgRender();
}
/* Called when the shot animation has finished. Online, the host decides when the next shot starts so both screens stay together. */
function sgShotDone() {
  SG.done = true; const r = document.getElementById('sg'); if (!r) return;
  const after = r.querySelector('.sg-after'), wait = r.querySelector('.sg-wait'), bd = r.querySelector('.sg-board');
  if (after) after.hidden = false; if (wait) wait.remove(); if (bd) bd.outerHTML = sgBoard();
  if (sgOnline()) { if (SG.net.host) setTimeout(() => { if (SG.screen === 'play' && SG.phase === 'reveal') { sgSend({ t: 'next' }); sgAdvance(); } }, 1100); else if (SG.pendingNext) sgAdvance(); }
}

/* ---------- playing across two computers ---------- */
const sgSend = m => { try { SG.net && SG.net.conn && SG.net.conn.open && SG.net.conn.send(m); } catch { } };
const sgClean = s => String(s || '').replace(/[<>]/g, '').trim().slice(0, 20);
function sgLoadPeer() {
  return window.Peer ? Promise.resolve() : new Promise((ok, bad) => { const s = document.createElement('script'); s.src = 'js/vendor/peerjs.min.js'; s.onload = ok; s.onerror = () => bad(new Error('Could not load online play. Check your connection.')); document.head.appendChild(s); });
}
function sgNetEnd(keepMsg) {
  const n = SG.net; SG.net = null; if (!n) return;
  clearTimeout(n.timer); try { n.conn && n.conn.close(); } catch { } try { n.peer && n.peer.destroy(); } catch { }
  if (!keepMsg) SG.msg = '';
}
function sgNetFail(msg) { sgNetEnd(true); SG.screen = 'setup'; SG.msg = msg; sgRender(); }
async function sgNetOpen(host, code) {
  sgNetEnd(); SG.mode = 'online';
  const name = sgClean(document.getElementById('sg-n0') && document.getElementById('sg-n0').value) || SG.names[0] || 'Player';
  SG.names[0] = name; SG.msg = '';
  try { await sgLoadPeer(); } catch (e) { return sgNetFail(e.message); }
  const opts = { debug: 0, ...(window.BHL_PEER || {}) };
  const net = SG.net = { host, me: host ? 0 : 1, code: host ? code : '', peer: null, conn: null, myName: name };
  const wire = conn => {
    net.conn = conn;
    conn.on('open', () => { if (!host) sgSend({ t: 'hello', name }); });
    conn.on('data', m => sgNetMsg(m));
    conn.on('close', () => { if (SG.net === net && SG.screen !== 'menu') { sgNetEnd(true); SG.screen = 'lost'; sgRender(); } });
    conn.on('error', () => { });
  };
  net.peer = new Peer(host ? 'bhl-' + code : undefined, opts);
  net.peer.on('error', e => {
    if (SG.net !== net) return;
    if (host && e.type === 'unavailable-id') return sgNetOpen(true, sgCode());                  // that code is taken: try another
    sgNetFail(e.type === 'peer-unavailable' ? 'No game found with that code. Check it and try again.' : e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' ? 'Could not reach the matchmaking server. Your network may be blocking online play.' : 'Could not connect (' + e.type + ').');
  });
  if (host) {
    net.peer.on('open', () => { if (SG.net === net) { SG.screen = 'lobby'; sgRender(); } });
    net.peer.on('connection', conn => { if (net.conn) { conn.close(); return; } wire(conn); });
  } else {
    SG.screen = 'lobby'; sgRender();
    net.peer.on('open', () => { if (SG.net === net) wire(net.peer.connect('bhl-' + code, { reliable: true })); });
    net.timer = setTimeout(() => { if (SG.net === net && !(net.conn && net.conn.open)) sgNetFail('Could not connect. Check the code, and that your friend is still waiting.'); }, 20000);
  }
}
const sgCode = () => Array.from({ length: 5 }, () => SG_CODE[Math.floor(Math.random() * SG_CODE.length)]).join('');
function sgNetMsg(m) {
  const net = SG.net; if (!net || !m || typeof m.t !== 'string') return;
  if (net.host && m.t === 'hello') { SG.names = [net.myName, sgClean(m.name) || 'Guest']; if (SG.names[0] === SG.names[1]) SG.names[1] += ' 2'; sgSend({ t: 'start', names: SG.names }); sgBegin(); }
  else if (net.host && m.t === 'again') { sgSend({ t: 'start', names: SG.names }); sgBegin(); }
  else if (!net.host && m.t === 'start' && Array.isArray(m.names)) { SG.names = [sgClean(m.names[0]) || 'Player 1', sgClean(m.names[1]) || 'Player 2']; sgBegin(); }
  else if (net.host && m.t === 'pick' && SG.screen === 'play' && SG.phase === 'pick' && sgDir(m.dir)) { const role = sgShooter() === 1 ? 'shoot' : 'dive'; if (!SG.shot[role]) { SG.shot[role] = m.dir; sgHostCheck(); } }
  else if (!net.host && m.t === 'reveal' && SG.screen === 'play' && SG.phase === 'pick' && sgDir(m.shoot) && sgDir(m.dive)) { SG.shot = { shoot: m.shoot, dive: m.dive }; sgReveal(); }
  else if (!net.host && m.t === 'next' && SG.screen === 'play') { if (SG.done) sgAdvance(); else SG.pendingNext = true; }
}

/* ---------- drawing helpers (the rink is a canvas animation: skate in, wind up, shoot, dive, goal or save) ---------- */
const SG_INK = '#0b1426', SG_TEAM = [{ main: '#2a63e8', dark: '#0b1f44', light: '#7aa7ff', trim: '#ffffff', sh: '#1a3da0', acc: '#f2c21b', pant: '#172a66', pantd: '#0c1842' }, { main: '#e02a33', dark: '#6b1111', light: '#ff8a80', trim: '#ffffff', sh: '#9a141c', acc: '#ffffff', pant: '#1d2c5c', pantd: '#101a3c' }];
const sgGrad = (c, x0, y0, x1, y1, ...stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; };
const sgRR = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
const SG_EDGE = 'rgba(8,14,30,.55)';
/* Fill a shape like molded, painted plastic: the color, a glossy highlight from the upper left, a soft shadow lower right, and a thin dark edge. */
const sgFS = (c, fill, lw = 2) => {
  c.fillStyle = fill; c.fill();
  c.save(); c.clip(); const g = c.createLinearGradient(-40, -150, 40, 20); g.addColorStop(0, 'rgba(255,255,255,.34)'); g.addColorStop(.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,20,.22)'); c.fillStyle = g; c.fillRect(-400, -400, 900, 900); c.restore();
  c.lineWidth = lw * 0.7; c.strokeStyle = SG_EDGE; c.lineJoin = 'round'; c.stroke();
};
const sgLimb = (c, x0, y0, x1, y1, w, col) => { c.lineCap = 'round'; c.strokeStyle = SG_EDGE; c.lineWidth = w + 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.strokeStyle = col; c.lineWidth = w; c.stroke(); c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = Math.max(1.2, w * 0.22); c.beginPath(); c.moveTo(x0 - w * 0.22, y0 - w * 0.1); c.lineTo(x1 - w * 0.22, y1 - w * 0.1); c.stroke(); };
const SG_LOGOS = {};
/* The league logo for the canvas scenes (boards and centre ice), once it has loaded. */
function sgLeagueLogo() {
  const src = D.config.logo || 'images/league-logo.webp';
  if (!SG_LOGOS[src]) { const i = new Image(); i.src = src; SG_LOGOS[src] = i; }
  const i = SG_LOGOS[src]; return i.complete && i.naturalWidth ? i : null;
}
function sgLogo(name) {
  const m = member(name); if (!m || !m.logo) return null;
  if (!SG_LOGOS[m.logo]) { const i = new Image(); i.src = m.logo; SG_LOGOS[m.logo] = i; }
  const i = SG_LOGOS[m.logo]; return i.complete && i.naturalWidth ? i : null;
}

const SGA = {
  W: 480, H: 340, cv: null, ctx: null, raf: 0, t0: 0, play: null, is: 0, k: 1, parts: [], audio: null,
  sound: (() => { try { return localStorage.getItem('bhl_sg_sound') === '1'; } catch { return false; } })(),
  crowd: Array.from({ length: 200 }, (_, i) => ({ x: (i % 50) * 9.8 + 5 + ((i % 3) - 1) * 1.5, r: Math.floor(i / 50), c: ['#c1272d', '#1d4ed8', '#f5b301', '#e5e7eb', '#13306b', '#8cc63f', '#f472b6'][(i * 5 + Math.floor(i / 50) * 3) % 7], ph: (i * 1.7) % 6.28, h: (i * 13) % 4 })),
};
const sgEase = t => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t)), sgOut = t => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3, sgClamp = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
function sgSound(kind) {
  if (!SGA.sound || (typeof BOSS !== 'undefined' && BOSS.on)) return;
  try {
    const A = SGA.audio ||= new (window.AudioContext || window.webkitAudioContext)(), t = A.currentTime;
    const tone = (type, f0, f1, dur, vol) => { const o = A.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); const g = A.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(A.destination); o.start(t); o.stop(t + dur); };
    if (kind === 'shot') tone('triangle', 420, 90, 0.18, 0.25);
    if (kind === 'goal') { tone('sawtooth', 240, 236, 0.7, 0.12); tone('square', 120, 118, 0.7, 0.06); }
    if (kind === 'save') { tone('sine', 150, 50, 0.22, 0.35); tone('triangle', 900, 300, 0.08, 0.12); }
    if (kind === 'skate') tone('sawtooth', 700, 200, 0.5, 0.025);
    if (kind === 'post') { tone('triangle', 1900, 1100, 0.25, 0.3); tone('sine', 700, 600, 0.3, 0.1); }
    if (kind === 'whistle') { tone('square', 2300, 2250, 0.18, 0.05); setTimeout(() => sgSound('whistle2'), 120); }
    if (kind === 'whistle2') tone('square', 2250, 2200, 0.25, 0.05);
  } catch { }
}
function sgAttach(cv) {
  SGA.cv = cv; const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth || 480;
  cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr * SGA.H / SGA.W); SGA.ctx = cv.getContext('2d'); SGA.k = cv.width / SGA.W;
  SGA.t0 = performance.now(); sgFrame(performance.now());
  if (!SGA.raf) SGA.raf = requestAnimationFrame(sgLoop);
}
function sgLoop(now) {
  if (!SGA.cv || !document.body.contains(SGA.cv)) { SGA.raf = 0; SGA.cv = null; return; }
  sgFrame(now); SGA.raf = requestAnimationFrame(sgLoop);
}
function sgRun(info, done) {        // info: { shoot, dive, goal, shooter, shooterName, goalieName } ; done() is called when the controls may appear
  const fast = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.35 : 1;
  SGA.play = { ...info, start: performance.now(), fast, done, finished: false, spoke: 0 }; SGA.parts = [];
  sgSound('skate');
}
function sgSkip() { const p = SGA.play; if (p && !p.finished) p.start -= 4000; }

const SG_FEET = 322, SG_SIDE = { L: -1, M: 0, R: 1 };
function sgFrame(now) {
  const c = SGA.ctx; if (!c) return;
  const k = SGA.k, T = (now - SGA.t0) / 1000, P = SGA.play, pt = P ? (now - P.start) / 1000 / P.fast : 0;
  c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, SGA.W, SGA.H);
  const z = P ? sgEase(sgClamp(pt, 0, 1.0)) : 0, wind = P ? sgClamp(pt, 1.0, 1.3) : 0, shot = P ? sgClamp(pt, 1.3, 1.75) : 0, after = P ? pt - 1.75 : -1;
  const shootX = P ? SG_SIDE[P.shoot] : 0, diveX = P ? SG_SIDE[P.dive] : 0, sh = P ? P.shooter : SGA.is, shotPal = SG_TEAM[sh], goaliePal = SG_TEAM[1 - sh];
  if (P && !P.spoke && pt >= 1.3) { P.spoke = 1; sgSound('shot'); }
  if (P && P.spoke === 1 && pt >= 1.75) { P.spoke = 2; sgSound(P.goal ? 'goal' : 'save'); sgBurst(P, shootX); }
  if (P && !P.finished && pt >= 2.5) { P.finished = true; P.done && P.done(); }
  const gs = 0.55 + 0.45 * z, gy = 184 + 32 * z, W = 200 * gs, Hn = 96 * gs, gx = 240;
  const shake = P && after > 0 && after < 0.35 && P.goal ? Math.sin(after * 90) * 3 * (1 - after / 0.35) : 0;
  c.save(); c.translate(shake, 0);
  sgArena(c, T, P, after, gs, gy, pt);
  // net
  const bulge = P && P.goal && after > 0 ? Math.sin(after * 22) * 12 * gs * Math.max(0, 1 - after / 0.9) : 0, bx = shootX * 0.3 * W * 0.5;
  c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(gx - W / 2, gy - Hn, W, Hn);
  c.strokeStyle = 'rgba(60,80,110,.5)'; c.lineWidth = 1;
  for (let i = 0; i <= 16; i++) { const x = gx - W / 2 + i * W / 16, d = Math.max(0, 1 - Math.abs(x - (gx + bx)) / (W * 0.35)) * bulge; c.beginPath(); c.moveTo(x, gy - Hn); c.lineTo(x + d * 0.4, gy); c.stroke(); }
  for (let i = 0; i <= 8; i++) { const y = gy - Hn + i * Hn / 8; c.beginPath(); c.moveTo(gx - W / 2, y); for (let x = 0; x <= W; x += 8) { const d = Math.max(0, 1 - Math.abs(gx - W / 2 + x - (gx + bx)) / (W * 0.35)) * bulge; c.lineTo(gx - W / 2 + x, y + d * 0.6); } c.stroke(); }
  // goalie
  const dv = P ? sgEase(sgClamp(pt, 1.25, 1.7)) : 0, sway = P ? 0 : Math.sin(T * 1.6) * 9 * gs, gxp = gx + diveX * 46 * gs * dv + sway;
  sgDrawGoalie(c, gxp, gy - 2 * gs, gs * 0.64, diveX * 0.8 * dv, dv, diveX, goaliePal, sgLogo(sgName(1 - sh)), T);
  // posts and goal light
  c.lineCap = 'round'; c.lineJoin = 'round'; for (const [lw, col] of [[8 * gs + 2, 'rgba(8,14,30,.5)'], [8 * gs, '#d62828'], [2.2 * gs, 'rgba(255,255,255,.45)']]) { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(gx - W / 2, gy); c.lineTo(gx - W / 2, gy - Hn); c.lineTo(gx + W / 2, gy - Hn); c.lineTo(gx + W / 2, gy); c.stroke(); }
  const lit = P && P.goal && after > 0 && Math.floor(after * 6) % 2 === 0; if (lit) { c.fillStyle = '#ff2d2d'; c.beginPath(); c.arc(gx, gy - Hn - 14 * gs, 6 * gs, 0, 6.3); c.fill(); c.lineWidth = 1.5; c.strokeStyle = SG_INK; c.stroke(); c.fillStyle = 'rgba(255,45,45,.25)'; c.beginPath(); c.arc(gx, gy - Hn - 14 * gs, 18 * gs, 0, 6.3); c.fill(); }
  // skater, then puck on top
  const strideT = P ? (pt < 1.0 ? pt : 0) : 0, bob = 0;
  SGA.rigT = !P ? -1 : pt < 0.72 ? 0 : pt < 1.3 ? 0.56 * (pt - 0.72) / 0.58 : Math.min(1, 0.56 + (pt - 1.3) * 0.5);      // where the shooter is in the slap shot; the blade meets the puck at 0.56
  const skx = 204 + shootX * 12 * wind, SKS = 0.84, bl = { x: 50 + (P && pt < 1.0 ? Math.sin(pt * 14) * 9 : P ? 0 : Math.sin(T * 1.5) * 3) + shootX * 6 * wind - shot * 6, y: -3 + wind * 8 - shot * 22 };       // blade tip, in the skater's own coordinates
  const pk0 = sgRigPuck(skx, SG_FEET - bob, SKS), bladeX = pk0[0], bladeY = pk0[1];
  sgDrawSkater(c, skx, SG_FEET - bob, SKS, wind, shootX, shot, shotPal, sgName(sh), P ? pt : 0, bl, P ? pt < 0.72 : false, T);
  const tx = gx + shootX * W * 0.3, ty = gy - Hn * 0.3 - (P && P.shoot === 'M' ? Hn * 0.18 : 0);
  let px = bladeX, py = bladeY, pr = 7, vis = true;
  if (!P) { px = bladeX; py = bladeY; }
  else if (pt < 1.3) { px = bladeX; py = bladeY; }
  else if (pt < 1.75) {
    const u = sgOut(shot), sx0 = bladeX, sy0 = bladeY; px = sx0 + (tx - sx0) * u; py = sy0 + (ty - sy0) * u - Math.sin(u * Math.PI) * 18; pr = 7 - (7 - 4 * gs) * u;
    if (u > .12) { const u2 = Math.max(0, u - .28); c.strokeStyle = 'rgba(15,23,42,.28)'; c.lineWidth = pr * 1.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(sx0 + (tx - sx0) * u2, sy0 + (ty - sy0) * u2 - Math.sin(u2 * Math.PI) * 18); c.lineTo(px, py); c.stroke(); }
  } else if (P.goal) { px = tx; py = ty + Math.min(0.5, after) * 22 * gs; pr = 4 * gs; }
  else { const u = after; px = tx + (diveX === 0 ? (shootX || 1) : -diveX) * u * 90 * (shootX === 0 ? 0.7 : 1); py = ty + 120 * u * u - u * 60; pr = 4 * gs + u * 3; vis = u < 1.1; }
  if (vis) { c.fillStyle = '#0b1426'; c.beginPath(); c.ellipse(px, py, pr, pr * .6, 0, 0, 6.3); c.fill(); c.fillStyle = '#334155'; c.beginPath(); c.ellipse(px, py - pr * .25, pr, pr * .45, 0, 0, 6.3); c.fill(); }
  // ice spray and confetti
  if (false) SGA.parts.push({ x: skx + (Math.random() - .5) * 30, y: SG_FEET + 2, vx: (Math.random() - .5) * 70, vy: -20 - Math.random() * 45, life: .5, spray: 1 });
  for (let i = SGA.parts.length - 1; i >= 0; i--) {
    const q = SGA.parts[i]; q.life -= 1 / 60; if (q.life <= 0) { SGA.parts.splice(i, 1); continue; }
    q.x += q.vx / 60; q.y += q.vy / 60; q.vy += (q.spray ? 120 : 160) / 60; c.globalAlpha = Math.min(1, q.life * 2); c.fillStyle = q.c || '#fff';
    if (q.spray) c.fillRect(q.x, q.y, 2.2, 2.2); else { c.save(); c.translate(q.x, q.y); c.rotate(q.life * 9 + i); c.fillRect(-3, -2, 6, 4); c.restore(); } c.globalAlpha = 1;
  }
  // result banner
  if (P && after > 0) {
    const u = sgOut(after * 3), a = after < 1.4 ? 1 : Math.max(0, 1 - (after - 1.4) * 2), txt = P.goal ? 'GOAL!' : 'SAVED!';
    c.save(); c.globalAlpha = a; c.translate(240, 160); c.scale(.6 + .5 * u, .6 + .5 * u); c.rotate(-0.06);
    c.font = '58px Anton, Impact, "Arial Narrow", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 9; c.lineJoin = 'round'; c.strokeStyle = '#fff'; c.strokeText(txt, 0, 0);
    c.fillStyle = P.goal ? '#137a35' : '#c1272d'; c.fillText(txt, 0, 0); c.restore(); c.textAlign = 'start';
  }
  c.restore(); sgDome(c);
}
function sgBurst(P, shootX) {
  const gy = 212, tx = 240 + shootX * 57;
  if (P.goal) for (let i = 0; i < 80; i++) SGA.parts.push({ x: 240 + (Math.random() - .5) * 220, y: 30 + Math.random() * 50, vx: (Math.random() - .5) * 120, vy: Math.random() * 40, life: 1.6 + Math.random(), c: ['#c1272d', '#2563eb', '#f5b301', '#fff', '#8cc63f'][i % 5] });
  else for (let i = 0; i < 30; i++) SGA.parts.push({ x: tx, y: gy - 30, vx: (Math.random() - .5) * 240, vy: -Math.random() * 150, life: .5 + Math.random() * .3, spray: 1, c: '#fde68a' });
}

/* The table, seen through the dome from behind the shooter: the goal line, crease and face-off dots painted on the playfield, and the slots the players ride in. */
function sgArena(c, T, P, after, gs, gy, pt) {
  const cheer = P && P.goal && after > 0 ? Math.sin(after * 14) * 3 * Math.max(0, 1 - after / 1.2) : 0;
  sgBackdrop(c, T, !!P, cheer);
  c.strokeStyle = 'rgba(200,35,48,.8)'; c.lineWidth = 3 * gs; c.beginPath(); c.moveTo(-10, gy + 5 * gs); c.lineTo(490, gy + 5 * gs); c.stroke();                       // goal line
  c.beginPath(); c.ellipse(240, gy + 5 * gs, 82 * gs, 50 * gs, 0, 0, Math.PI); c.fillStyle = 'rgba(70,140,235,.26)'; c.fill(); c.strokeStyle = 'rgba(200,35,48,.85)'; c.lineWidth = 2.2; c.stroke();   // crease
  c.fillStyle = 'rgba(200,35,48,.9)'; c.beginPath(); c.arc(240 - 115 * gs, gy + 58 * gs, 6 * gs, 0, 6.3); c.arc(240 + 115 * gs, gy + 58 * gs, 6 * gs, 0, 6.3); c.fill();      // face-off dots
}
/* Everything behind the play: the game room beyond the glass, the far boards of the table with their printed crowd, and the glossy plastic ice. Shared by the three games. */
function sgBackdrop(c, T, fast, cheer) {
  // the room beyond the dome: dim, warm, out of focus
  c.fillStyle = sgGrad(c, 0, 0, 0, 70, '#120d0a', '#2a1d14'); c.fillRect(-10, 0, 500, 70);
  for (const [x, y, r, col] of [[70, 14, 46, 'rgba(255,190,110,.30)'], [236, 6, 60, 'rgba(255,214,150,.26)'], [400, 18, 44, 'rgba(255,170,90,.26)'], [150, 40, 22, 'rgba(120,180,255,.14)'], [330, 44, 26, 'rgba(255,90,90,.12)']]) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
  { const nums = [...document.querySelectorAll('#sg .sg-num')].map(e => e.textContent.trim()).slice(0, 2), two = nums.length === 2, bw = two ? 132 : 92, bx = 240 - bw / 2;
    c.fillStyle = '#05070b'; c.beginPath(); c.roundRect(bx, -4, bw, 44, 6); c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#59616f'; c.stroke(); c.fillStyle = '#8f1820'; c.fillRect(bx + 4, 36, bw - 8, 2);
    c.textBaseline = 'middle'; c.textAlign = 'center'; c.font = '700 6.5px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; c.fillStyle = '#c9d2df';
    if (two) { c.fillText('HOME', bx + 28, 6); c.fillText('VISITOR', bx + bw - 28, 6); } else c.fillText('SCORE', 240, 6);
    c.font = '20px Anton, Impact, "Arial Narrow", sans-serif'; c.fillStyle = '#ff4a3d'; c.shadowColor = 'rgba(255,60,40,.9)'; c.shadowBlur = 8;
    if (two) { c.fillText(nums[0], bx + 28, 23); c.fillText(nums[1], bx + bw - 28, 23); c.fillStyle = '#ffb000'; c.shadowColor = 'rgba(255,176,0,.9)'; c.fillText(':', 240, 21); } else c.fillText(nums[0] || '0', 240, 23);
    c.shadowBlur = 0; c.textAlign = 'start'; }
  // the far end of the cabinet: a printed crowd above the boards (flat ink, like the real artwork)
  c.fillStyle = sgGrad(c, 0, 52, 0, 98, '#101c38', '#1b2c55'); c.fillRect(-10, 52, 500, 46);
  for (const p of SGA.crowd) { if (p.r > 2) continue; const y = 62 + p.r * 12, tone = ['#33466f', '#3c5283', '#2a3a60', '#465d92'][p.h]; c.fillStyle = tone; c.beginPath(); c.roundRect(p.x - 4.4, y + 1.5, 8.8, 9, 2.5); c.fill(); c.fillStyle = ['#5a6f9f', '#6880b2', '#4d6292', '#7389bb'][p.h]; c.beginPath(); c.arc(p.x, y - 1, 3.4, 0, 6.3); c.fill(); }
  c.fillStyle = 'rgba(8,14,30,.35)'; c.fillRect(-10, 52, 500, 3);
  // the boards: white plastic, a red cap rail, a blue stripe with the league's name, the yellow kick plate
  c.fillStyle = sgGrad(c, 0, 96, 0, 118, '#ffffff', '#dfe7f0'); c.fillRect(-10, 96, 500, 22);
  c.fillStyle = '#c8202f'; c.fillRect(-10, 94, 500, 4); c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(-10, 94, 500, 1.2);
  c.fillStyle = '#1746c9'; c.fillRect(-10, 101.5, 500, 10.5);
  c.fillStyle = '#fff'; c.font = '700 8.5px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'start';
  for (let x = 8; x < 500; x += 158) { c.fillText('BUBBLE  HOCKEY  LEAGUE', x + 6, 107); const lg = sgLeagueLogo(); if (lg) c.drawImage(lg, x + 104, 99, 15, 15); }
  c.fillStyle = '#f2c21b'; c.fillRect(-10, 114.5, 500, 3.5); c.fillStyle = 'rgba(8,14,30,.4)'; c.fillRect(-10, 117.6, 500, 1.2);
  c.fillStyle = 'rgba(8,14,30,.28)'; for (let x = 30; x < 480; x += 105) { c.beginPath(); c.arc(x, 99.4, 1.1, 0, 6.3); c.fill(); }                              // screws
  // the playfield: glossy white plastic, with the boards mirrored faintly in it
  c.fillStyle = sgGrad(c, 0, 118, 0, 340, '#dbe9f6', '#f7fbff', '#e6f0fa'); c.fillRect(-10, 118, 500, 230);
  c.fillStyle = sgGrad(c, 0, 118, 0, 150, 'rgba(23,70,201,.16)', 'rgba(23,70,201,0)'); c.fillRect(-10, 118, 500, 32);
  c.fillStyle = sgGrad(c, 0, 118, 0, 128, 'rgba(242,194,27,.28)', 'rgba(242,194,27,0)'); c.fillRect(-10, 118, 500, 10);
  const sheen = c.createRadialGradient(240, 236, 10, 240, 236, 250); sheen.addColorStop(0, 'rgba(255,255,255,.8)'); sheen.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = sheen; c.fillRect(-10, 118, 500, 230);
  c.strokeStyle = 'rgba(70,100,140,.07)'; c.lineWidth = 1; for (let i = 0; i < 9; i++) { const x = (i * 131) % 480, y = 150 + i * 21; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 46, y + 3); c.stroke(); }      // light scuffs
  if (cheer) { c.fillStyle = `rgba(255,60,60,${Math.min(.16, Math.abs(cheer) * .05)})`; c.fillRect(-10, 0, 500, 340); }                            // the goal lamp washes the table red
}
/* The dome: drawn last, over everything. Soft reflections on the curved glass and darker corners where it bends away. */
function sgDome(c) {
  c.save(); const k = c.canvas.width / SGA.W; c.setTransform(k, 0, 0, k, 0, 0);
  const v = c.createRadialGradient(240, 190, 150, 240, 190, 340); v.addColorStop(0, 'rgba(6,12,28,0)'); v.addColorStop(1, 'rgba(6,12,28,.42)'); c.fillStyle = v; c.fillRect(0, 0, 480, 340);
  c.lineCap = 'round';
  for (const [cx, cy, rx, ry, a0, a1, lw, al] of [[250, 560, 430, 540, 3.62, 4.30, 16, .10], [250, 560, 400, 505, 3.70, 4.12, 5, .16], [230, 600, 470, 560, 5.02, 5.42, 10, .07]]) { c.strokeStyle = `rgba(255,255,255,${al})`; c.lineWidth = lw; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, a0, a1); c.stroke(); }
  const g = c.createLinearGradient(0, 0, 150, 120); g.addColorStop(0, 'rgba(255,255,255,.16)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.lineTo(170, 0); c.quadraticCurveTo(40, 30, 0, 150); c.closePath(); c.fill();
  c.restore();
}

/* ---------- the players: drawn cartoon figures (bold outline, round joints, flat shading) ----------
   The shooter is a jointed figure with depth: its joints are 3D points (x right, y up, z toward the net) seen by a camera behind and above,
   so the body really turns through a slap shot: glide in, set side-on, backswing, downswing, contact, follow-through.
   The goalie is seen from the front and blends between a ready stance, the butterfly, a glove save and a blocker save. */
const RG_INK = '#101a33', RG_W = '#ffffff', RG_WD = '#cdd6e4', RG_BOOT = '#27324f', RG_BOOTD = '#141c33', RG_WOOD = '#a9743f', RG_F = 520, RG_LS = 158;
const rgAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], rgSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], rgMul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const rgDot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], rgNorm = a => { const L = Math.sqrt(rgDot3(a, a)) || 1; return rgMul(a, 1 / L); };
const rgMix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t), rgSc = p => RG_F / (RG_F + p[2]), rgPj = p => { const s = rgSc(p); return [p[0] * s, -p[1] * s - p[2] * s * 0.42]; };
function rgIk3(S, H, l1, l2, pole) {
  const d = rgSub(H, S), L = Math.sqrt(rgDot3(d, d)) || 1, L2 = Math.min(L, l1 + l2 - 0.5), u = rgMul(d, 1 / L), a = (l1 * l1 - l2 * l2 + L2 * L2) / (2 * L2), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return rgAdd(S, rgAdd(rgMul(u, a), rgMul(rgNorm(rgSub(pole, rgMul(u, rgDot3(pole, u)))), h)));
}
const rgDir = (pitch, yaw) => { const p = pitch * Math.PI / 180, y = yaw * Math.PI / 180; return [Math.cos(p) * Math.sin(y), -Math.sin(p), Math.cos(p) * Math.cos(y)]; };
/* canvas helpers: a limb (one bent tube with round joints), a joint pad, a rounded shape with a shadow tone, a flat band */
function rgLine(c, pts, w, col, cap = 'round') { c.lineCap = cap; c.lineJoin = 'round'; c.lineWidth = w; c.strokeStyle = col; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.stroke(); }
function rgTube(c, pts, w, base, shade) { rgLine(c, pts, w + 7, RG_INK); rgLine(c, pts, w, shade); c.save(); c.translate(-2, -2.5); rgLine(c, pts, Math.max(1, w - 6), base); c.restore(); }
function rgPad(c, p, r, base, shade, lw = 3.4) { c.beginPath(); c.arc(p[0], p[1], r, 0, 6.3); c.fillStyle = shade; c.fill(); c.lineWidth = lw; c.strokeStyle = RG_INK; c.stroke(); c.beginPath(); c.arc(p[0] - r * .22, p[1] - r * .25, r * .68, 0, 6.3); c.fillStyle = base; c.fill(); }
function rgPath(c, pts, r) {
  c.beginPath(); const n = pts.length, tw = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = Math.min(r, L / 2) / L; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  for (let i = 0; i < n; i++) { const p1 = pts[i], a = tw(p1, pts[(i + n - 1) % n]), b = tw(p1, pts[(i + 1) % n]); if (i) c.lineTo(a[0], a[1]); else c.moveTo(a[0], a[1]); c.quadraticCurveTo(p1[0], p1[1], b[0], b[1]); }
  c.closePath();
}
function rgShape(c, pts, base, shade, r = 10, lw = 4) { rgPath(c, pts, r); c.fillStyle = shade; c.fill(); c.save(); c.clip(); c.translate(-5, -6); rgPath(c, pts, r); c.fillStyle = base; c.fill(); c.restore(); rgPath(c, pts, r); c.lineWidth = lw; c.strokeStyle = RG_INK; c.lineJoin = 'round'; c.stroke(); }
function rgBand(c, pts, fill, lw = 0, r = 3) { rgPath(c, pts, r); c.fillStyle = fill; c.fill(); if (lw) { c.lineWidth = lw; c.strokeStyle = RG_INK; c.lineJoin = 'round'; c.stroke(); } }
const rgRot = (p, o, deg) => { const a = deg * Math.PI / 180, x = p[0] - o[0], y = p[1] - o[1]; return [o[0] + x * Math.cos(a) - y * Math.sin(a), o[1] + x * Math.sin(a) + y * Math.cos(a)]; };
const rgMix2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/* The slap shot, right-handed, as key poses. phi = how far the chest is turned from the net (0 = back to the camera, 90 = side-on), lean = forward bend,
   C = hips, FL / FR = skates, T = top hand, pitch / yaw = where the stick points from the top hand, grip = where the lower hand holds it, flex = shaft bend. */
const RG_ST = { FL: [-21, 0, 35], FR: [21, 0, -35] };
const RG_K = [
  [0.00, { phi: 12, lean: 16, C: [0, 104, -8], FL: [-25, 0, 8], FR: [23, 0, -22], T: [-10, 122, 22], pitch: 50, yaw: 62, grip: .42, bdir: [.9, 0, -.4], flex: 0 }],
  [0.15, { phi: 58, lean: 24, C: [0, 98, 0], ...RG_ST, T: [22, 126, 13], pitch: 53, yaw: 85, grip: .38, bdir: [1, 0, .05], flex: 0 }],
  [0.22, { phi: 58, lean: 24, C: [0, 98, 0], ...RG_ST, T: [22, 126, 13], pitch: 53, yaw: 85, grip: .38, bdir: [1, 0, .05], flex: 0 }],
  [0.44, { phi: 100, lean: 14, C: [8, 104, -13], ...RG_ST, T: [42, 136, -18], pitch: -50, yaw: 168, grip: .44, bdir: [.3, .9, -.3], flex: 0 }],
  [0.48, { phi: 100, lean: 14, C: [8, 104, -13], ...RG_ST, T: [42, 136, -18], pitch: -52, yaw: 168, grip: .44, bdir: [.3, .9, -.3], flex: 0 }],
  [0.56, { phi: 52, lean: 32, C: [-2, 90, 8], ...RG_ST, T: [24, 122, 10], pitch: 53, yaw: 84, grip: .38, bdir: [1, 0, .05], flex: 14 }],
  [0.60, { phi: 30, lean: 30, C: [-6, 92, 16], ...RG_ST, T: [6, 122, 30], pitch: 38, yaw: 36, grip: .40, bdir: [.8, .3, -.4], flex: 5 }],
  [0.70, { phi: -12, lean: 22, C: [-12, 104, 24], FL: [-21, 0, 35], FR: [24, 16, -54], T: [-34, 146, 58], pitch: -14, yaw: -42, grip: .45, bdir: [-.4, .9, .1], flex: 0 }],
  [1.00, { phi: -14, lean: 20, C: [-13, 106, 26], FL: [-21, 0, 35], FR: [26, 22, -60], T: [-36, 148, 60], pitch: -18, yaw: -44, grip: .45, bdir: [-.4, .9, .1], flex: 0 }],
];
function rgAt(keys, t) {
  const L = (a, b, u) => (Array.isArray(a) ? a.map((v, i) => L(v, b[i], u)) : a + (b - a) * u);
  for (let i = 0; i < keys.length - 1; i++) { const [t0, p0] = keys[i], [t1, p1] = keys[i + 1]; if (t <= t1) { let u = Math.max(0, (t - t0) / (t1 - t0)); u = t0 === 0.48 ? u * u : u * u * (3 - 2 * u); const o = {}; for (const q in p0) o[q] = L(p0[q], p1[q], u); return o; } }
  return JSON.parse(JSON.stringify(keys[keys.length - 1][1]));
}
/* The pose at shot time rt (0 to 1; below 0 = standing and waiting). stride = skating phase on the way in; dirX = which side the shot goes. */
function sgRigPose(rt, stride, dirX, T) {
  const k = rgAt(RG_K, Math.max(0, rt));
  if (rt < 0) k.C = [k.C[0], k.C[1] + Math.sin(T * 2) * 1.2, k.C[2]];
  if (stride) { const a = Math.sin(stride * 9), b = Math.cos(stride * 9); k.FL = [k.FL[0] - 6, Math.max(0, a) * 10, k.FL[2] + a * 20]; k.FR = [k.FR[0] + 6, Math.max(0, -a) * 10, k.FR[2] - a * 20]; k.C = [k.C[0] + a * 6, k.C[1] + Math.abs(b) * 3, k.C[2]]; k.phi += a * 6; k.lean += 4; }
  if (rt > 0.56) k.yaw += dirX * 20 * Math.min(1, (rt - 0.56) / 0.14);
  return k;
}
const rgStick = k => { const d = rgDir(k.pitch, k.yaw), B = rgAdd(k.T, rgMul(d, RG_LS)); B[1] = Math.max(1.5, B[1]); return { d, B }; };
/* Where the puck sits for the shooter standing at (x, y): carried on the blade while gliding in, then waiting on the ice where the blade will strike. */
function sgRigPuck(x, y, s) {
  const S = s * 0.72, rt = SGA.rigT == null ? -1 : SGA.rigT, B = rgStick(rgAt(RG_K, rt < 0.15 ? Math.max(0, rt) : 0.56)).B, p = rgPj([B[0] + 5, 0, B[2] + 11]);
  return [x + p[0] * S, y + p[1] * S];
}
function sgDrawSkater(c, x, y, s, wind, dir, shot, pal, name, stride, bl, skating, T) {
  const rt = SGA.rigT == null ? -1 : SGA.rigT, k = sgRigPose(rt, skating ? stride : 0, dir, T), S = s * 0.72;
  const J = pal.main, JD = pal.sh, Y = pal.acc, PN = pal.pant, PND = pal.pantd;
  const ph = k.phi * Math.PI / 180, chest = [Math.sin(ph), 0, Math.cos(ph)], axis = [Math.cos(ph), 0, -Math.sin(ph)], C = k.C, ln = k.lean * Math.PI / 180;
  const Sh = rgAdd(C, rgAdd(rgMul(chest, 66 * Math.sin(ln)), [0, 66 * Math.cos(ln), 0])), SL = rgSub(Sh, rgMul(axis, 27)), SR = rgAdd(Sh, rgMul(axis, 27)), HL = rgSub(C, rgMul(axis, 16)), HR = rgAdd(C, rgMul(axis, 16));
  const { d, B } = rgStick(k), hT = rgAdd(k.T, rgMul(d, 9)), hL = rgAdd(k.T, rgMul(d, RG_LS * k.grip)), head = rgAdd(Sh, rgAdd([0, 31, 0], rgMul(chest, 7))), parts = [];
  const tube = (pts, w, base, shade) => rgTube(c, pts.map(rgPj), w * rgSc(pts[pts.length >> 1]), base, shade);
  const leg = (hip, foot, side) => {
    const ank = rgAdd(foot, [0, 13, 0]), knee = rgIk3(hip, ank, 56, 54, rgAdd(chest, rgMul(axis, side * .35)));
    parts.push([Math.min(knee[2], foot[2]) + 2, () => {
      tube([knee, ank], 22, J, JD); const a = rgPj(knee), b = rgPj(ank), w = 22 * rgSc(ank); rgLine(c, [rgMix2(a, b, .38), rgMix2(a, b, .54)], w, RG_W, 'butt'); rgLine(c, [rgMix2(a, b, .6), rgMix2(a, b, .7)], w, Y, 'butt');
      const fd = rgNorm(rgAdd(chest, rgMul(axis, side * .25))), heel = rgAdd(foot, rgMul(fd, -14)), toe = rgAdd(foot, rgMul(fd, 21)), bl2 = [rgPj(rgAdd(rgAdd(foot, rgMul(fd, -18)), [0, 1, 0])), rgPj(rgAdd(rgAdd(foot, rgMul(fd, 25)), [0, 1, 0]))];
      rgLine(c, bl2, 6.5 * rgSc(foot), RG_INK); rgLine(c, bl2, 2.8 * rgSc(foot), '#c9d1de');                                      // the blade
      rgLine(c, [rgPj(rgAdd(heel, [0, 5, 0])), rgPj(rgAdd(toe, [0, 5, 0]))], 9 * rgSc(foot), RG_INK); rgLine(c, [rgPj(rgAdd(heel, [0, 5, 0])), rgPj(rgAdd(toe, [0, 5, 0]))], 5 * rgSc(foot), '#e9edf4');      // the holder
      tube([rgAdd(heel, [0, 12, 0]), rgAdd(toe, [0, 10, 0])], 17, RG_BOOT, RG_BOOTD); tube([rgAdd(foot, [0, 11, 0]), rgAdd(foot, [0, 22, 0])], 19, RG_BOOT, RG_BOOTD);
      const la = rgPj(rgAdd(foot, [0, 14, 0])), lb = rgPj(rgAdd(rgAdd(foot, rgMul(fd, 12)), [0, 12, 0])); rgLine(c, [la, lb], 2.4 * rgSc(foot), RG_W);                // laces
      tube([hip, knee], 31, PN, PND); rgPad(c, rgPj(knee), 13 * rgSc(knee), RG_W, RG_WD, 3.2);
    }]);
  };
  leg(HL, k.FL, -1); leg(HR, k.FR, 1);
  parts.push([C[2] + 1, () => {
    tube([HL, HR], 44, PN, PND);
    const WL = rgAdd(rgSub(C, rgMul(axis, 17)), [0, 12, 0]), WR = rgAdd(rgAdd(C, rgMul(axis, 17)), [0, 12, 0]), q = [SL, SR, WR, WL].map(rgPj), w = 46 * rgSc(Sh);
    const poly = (col, lw, dx = 0, dy = 0) => { c.save(); c.translate(dx, dy); c.beginPath(); c.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) c.lineTo(q[i][0], q[i][1]); c.closePath(); c.lineJoin = 'round'; c.fillStyle = col; c.fill(); c.lineWidth = lw; c.strokeStyle = col; c.stroke(); c.restore(); };
    poly(RG_INK, w + 7); poly(JD, w); poly(J, w - 8, -3, -3.5);
    const hy = 17 * rgSc(C), a = rgPj(WL), b = rgPj(WR); rgLine(c, [[a[0], a[1] + hy], [b[0], b[1] + hy]], 7 * rgSc(C), RG_W); rgLine(c, [[a[0], a[1] + hy], [b[0], b[1] + hy]], 3 * rgSc(C), Y);      // hem stripe
    const ya = rgPj(rgAdd(SL, [0, 4, 0])), yb = rgPj(rgAdd(SR, [0, 4, 0])); rgLine(c, [ya, yb], w * .66 + 6, RG_INK); rgLine(c, [ya, yb], w * .66, Y);                                           // shoulder yoke
    const cb = Math.cos(ph);
    if (cb > .3) { const m = rgPj(rgMix(rgMix(SL, SR, .5), C, .5)), z = rgSc(Sh); c.save(); c.translate(m[0], m[1]); c.scale(cb * z, z); c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = RG_W;
      c.font = '700 15px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; c.fillText(String(name || '').toUpperCase().slice(0, 9), 0, -12);
      c.font = '36px Anton, Impact, "Arial Narrow", sans-serif'; c.lineWidth = 5; c.strokeStyle = RG_INK; c.lineJoin = 'round'; c.strokeText('7', 0, 22); c.fillText('7', 0, 22); c.restore(); c.textAlign = 'start'; }
  }]);
  const arm = (sh, hand, side) => {
    const el = rgIk3(sh, hand, 41, 39, rgAdd([0, -1, 0], rgAdd(rgMul(axis, side * .7), rgMul(chest, -.25))));
    parts.push([Math.min(el[2], hand[2]) - 1, () => {
      tube([sh, el, hand], 22, J, JD); const a = rgPj(el), b = rgPj(hand), z = rgSc(hand); rgLine(c, [rgMix2(a, b, .5), rgMix2(a, b, .72)], 22 * z, RG_W, 'butt'); rgPad(c, rgPj(el), 12 * rgSc(el), RG_W, RG_WD, 3);
      // the glove: a padded mitt with a cuff and finger rolls, turned along the forearm
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, g = [[-12, -15], [12, -16], [22, -6], [21, 9], [10, 16], [-12, 15]].map(p => rgRot([b[0] + p[0] * z, b[1] + p[1] * z], b, ang));
      rgShape(c, g, PN, PND, 7 * z, 3.4); rgBand(c, [[-12, -15], [-3, -15.4], [-3, 15.4], [-12, 15]].map(p => rgRot([b[0] + p[0] * z, b[1] + p[1] * z], b, ang)), Y, 2.6, 2);
      for (const fy of [-5, 4]) rgLine(c, [[3, fy], [19, fy + 1]].map(p => rgRot([b[0] + p[0] * z, b[1] + p[1] * z], b, ang)), 1.6, PND);
    }]);
  };
  parts.push([B[2] > hL[2] ? Math.max(hT[2], hL[2]) + 3 : Math.min(hT[2], hL[2]) + 0.5, () => {
    const tip = rgAdd(B, rgMul(rgNorm(k.bdir), 30)), butt = rgPj(rgSub(k.T, rgMul(d, 4))), b = rgPj(B), t2 = rgPj(tip), m = rgPj(rgMix(k.T, B, .62)), L = Math.hypot(b[0] - butt[0], b[1] - butt[1]) || 1, nx = -(b[1] - butt[1]) / L, ny = (b[0] - butt[0]) / L, q = [m[0] + nx * k.flex, m[1] + ny * k.flex], z = rgSc(B);
    const shaft = (w, col) => { c.lineCap = 'round'; c.lineWidth = w; c.strokeStyle = col; c.beginPath(); c.moveTo(butt[0], butt[1]); c.quadraticCurveTo(q[0], q[1], b[0], b[1]); c.stroke(); };
    shaft(10 * z, RG_INK); shaft(5.5 * z, RG_WOOD); rgLine(c, [b, t2], 17 * z, RG_INK); rgLine(c, [b, t2], 11 * z, RG_BOOT); rgLine(c, [rgMix2(b, t2, .3), rgMix2(b, t2, .8)], 4.5 * z, RG_W);
    rgLine(c, [butt, rgMix2(butt, b, .05)], 7 * rgSc(k.T), RG_W);
  }]);
  arm(SL, hT, -1); arm(SR, hL, 1);
  parts.push([head[2] - 6, () => {
    const p = rgPj(head), r = 17 * rgSc(head), fx = chest[0], nk = rgPj(rgAdd(Sh, [0, 8, 0]));
    rgLine(c, [nk, p], r + 5, RG_INK); rgLine(c, [nk, p], r, '#cf9870');
    c.lineWidth = 3.2; c.strokeStyle = RG_INK;
    if (Math.abs(fx) > .3) { c.beginPath(); c.ellipse(p[0] + fx * r * .5, p[1] + r * .3, r * .72, r * .82, 0, 0, 6.3); c.fillStyle = '#f0c39c'; c.fill(); c.stroke(); }
    else { c.beginPath(); c.ellipse(p[0], p[1] + r * .62, r * .8, r * .5, 0, 0, 6.3); c.fillStyle = '#3b2616'; c.fill(); c.stroke(); }
    c.beginPath(); c.arc(p[0], p[1], r * 1.08, 0, 6.3); c.fillStyle = pal.sh; c.fill(); c.lineWidth = 3.8; c.stroke(); c.beginPath(); c.arc(p[0] - r * .2, p[1] - r * .22, r * .8, 0, 6.3); c.fillStyle = pal.main; c.fill();
    c.lineWidth = r * .3; c.strokeStyle = RG_W; c.lineCap = 'butt'; c.beginPath(); c.moveTo(p[0] - r * 1.05, p[1] + r * .2); c.quadraticCurveTo(p[0], p[1] + r * .62, p[0] + r * 1.05, p[1] + r * .2); c.stroke();
    if (Math.abs(fx) > .3) { const sg = fx > 0 ? 1 : -1, x0 = p[0] + sg * r * .25 * Math.abs(fx), x1 = p[0] + sg * r * 1.25 * Math.abs(fx) + sg * r * .1;
      c.beginPath(); c.moveTo(x0, p[1] + r * .42); c.lineTo(x1, p[1] + r * .36); c.lineTo(x1 - sg * r * .08, p[1] + r); c.lineTo(x0 + sg * r * .1, p[1] + r * 1.05); c.closePath(); c.fillStyle = 'rgba(160,210,255,.62)'; c.fill(); c.lineWidth = 2.8; c.strokeStyle = RG_INK; c.lineJoin = 'round'; c.stroke(); }
  }]);
  c.save(); c.translate(x, y); c.scale(S, S);
  c.fillStyle = 'rgba(16,26,51,.16)'; c.beginPath(); c.ellipse(4, 4, 92, 20, 0, 0, 6.3); c.fill();
  parts.sort((a, b) => b[0] - a[0]).forEach(p => p[1]());
  c.restore();
}

/* The goalie. dv = how far into the save (0 to 1); dir = -1 blocker side, 0 butterfly, 1 glove side. */
const RG_G = {
  ready: { H: [0, -128], lean: 0, padL: [-36, -62, 5], padR: [36, -62, -5], blocker: [-118, -118], glove: [120, -134], tip: [-108, -10], gloveang: -6, head: 0, bd: [1, .05] },
  fly: { H: [0, -66], lean: 0, padL: [-96, -28, 84], padR: [96, -28, -84], blocker: [-124, -66], glove: [128, -86], tip: [-112, -8], gloveang: 0, head: 0, bd: [1, .05] },
  glove: { H: [16, -76], lean: 11, padL: [-52, -44, 28], padR: [118, -26, -86], blocker: [-96, -74], glove: [154, -172], tip: [-92, -8], gloveang: -32, head: 6, bd: [1, .05] },
  block: { H: [-16, -76], lean: -11, padL: [-118, -26, 86], padR: [52, -44, -28], blocker: [-150, -148], glove: [108, -92], tip: [-166, -62], gloveang: 4, head: -6, bd: [-.5, .86] },
};
function sgDrawGoalie(c, x, y, s, lean, dv, dir, pal, logo, T) {
  const A = RG_G.ready, Bp = dir > 0 ? RG_G.glove : dir < 0 ? RG_G.block : RG_G.fly, L = (a, b, u) => (Array.isArray(a) ? a.map((v, i) => L(v, b[i], u)) : a + (b - a) * u), k = {}; for (const q in A) k[q] = L(A[q], Bp[q], dv);
  const R = pal.main, RD = pal.sh, Bc = pal.pant, BD = pal.pantd, AC = pal.acc === '#ffffff' ? pal.pant : pal.acc, S = s * 0.6, breathe = Math.sin(T * 2.2) * 1.4 * (1 - dv);
  const H = [k.H[0], k.H[1] - breathe], tr = p => rgRot([p[0] + H[0], p[1] + H[1]], H, k.lean), ik2 = (a, t, l1, l2, sign) => { const dx = t[0] - a[0], dy = t[1] - a[1], d = Math.max(1, Math.min(Math.hypot(dx, dy), l1 + l2 - .5)), an = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))), b = Math.atan2(dy, dx) + sign * an; return [a[0] + l1 * Math.cos(b), a[1] + l1 * Math.sin(b)]; };
  c.save(); c.translate(x, y - 26 * S); c.scale(S, S);
  c.fillStyle = 'rgba(16,26,51,.16)'; c.beginPath(); c.ellipse(0, 22, 150 + dv * 30, 12, 0, 0, 6.3); c.fill();
  const pad = p => { const o = [p[0], p[1]], pr = q => rgRot([o[0] + q[0], o[1] + q[1]], o, p[2]);
    rgShape(c, [[-22, 58], [22, 58], [25, 88], [-25, 88]].map(pr), RG_BOOT, RG_BOOTD, 8); rgShape(c, [[-27, -70], [27, -70], [30, 62], [-30, 62]].map(pr), R, RD, 14);
    rgBand(c, [[-26, -66], [26, -66], [27, -46], [-27, -46]].map(pr), Bc, 3.5, 8); for (const yy of [-18, 10]) rgBand(c, [[-28, yy], [28, yy], [28.5, yy + 12], [-28.5, yy + 12]].map(pr), RG_W, 0, 1); };
  rgShape(c, [[-70, -10], [70, -10], [62, 48], [0, 34], [-62, 48]].map(tr), Bc, BD, 14);
  pad(k.padL); pad(k.padR);
  rgShape(c, [[-60, -114], [60, -114], [98, -74], [80, 2], [-80, 2], [-98, -74]].map(tr), RG_W, RG_WD, 22);
  rgBand(c, [[-90, -62], [90, -62], [86, -46], [-86, -46]].map(tr), R, 3.5, 3); rgBand(c, [[-85, -42], [85, -42], [82, -32], [-82, -32]].map(tr), AC, 3.5, 3);
  rgBand(c, [[-79, -12], [79, -12], [79, 1], [-79, 1]].map(tr), Bc, 3.5, 5); rgBand(c, [[-26, -113], [26, -113], [0, -88]].map(tr), Bc, 3.5, 4);
  const bl = k.blocker, gl = k.glove, tip = k.tip, top = [bl[0] + 6, bl[1] - 74], bot = [bl[0] + 2, bl[1] + 8], bn = Math.hypot(k.bd[0], k.bd[1]) || 1, e = [tip[0] + k.bd[0] / bn * 56, tip[1] + k.bd[1] / bn * 56];
  rgLine(c, [top, bl], 10, RG_INK); rgLine(c, [top, bl], 5.5, RG_WOOD); rgLine(c, [bot, tip], 26, RG_INK); rgLine(c, [bot, tip], 19, RG_W); rgLine(c, [rgMix2(bl, tip, .5), rgMix2(bl, tip, .64)], 19, R, 'butt');
  rgLine(c, [tip, e], 23, RG_INK); rgLine(c, [tip, e], 16, RG_W); rgLine(c, [rgMix2(tip, e, .2), rgMix2(tip, e, .7)], 6, R);
  const arm = (side, t) => { const a = tr([side * 84, -92]), el = ik2(a, t, 50, 48, t[1] > a[1] - 20 ? -side : side); rgTube(c, [a, el, t], 30, RG_W, RG_WD); rgLine(c, [rgMix2(a, el, .55), rgMix2(a, el, .8)], 30, R, 'butt'); rgPad(c, el, 15, RG_W, RG_WD); };
  arm(-1, bl); arm(1, gl);
  rgShape(c, [[bl[0] - 30, bl[1] - 36], [bl[0] + 28, bl[1] - 40], [bl[0] + 32, bl[1] + 28], [bl[0] - 26, bl[1] + 32]], RG_W, RG_WD, 9);
  rgBand(c, [[bl[0] - 29, bl[1] - 17], [bl[0] + 29, bl[1] - 21], [bl[0] + 30, bl[1] - 10], [bl[0] - 28, bl[1] - 6]], R, 0, 1); rgBand(c, [[bl[0] - 28, bl[1] + 1], [bl[0] + 30, bl[1] - 3], [bl[0] + 31, bl[1] + 5], [bl[0] - 27, bl[1] + 9]], AC, 0, 1);
  const gp = p => rgRot([gl[0] + p[0], gl[1] + p[1]], gl, k.gloveang);
  rgBand(c, [[-30, 16], [22, 26], [18, 44], [-30, 34]].map(gp), Bc, 3.5, 6); rgShape(c, [[-30, -24], [-6, -42], [28, -36], [44, 4], [22, 38], [-26, 30]].map(gp), R, RD, 16); rgBand(c, [[-12, -18], [20, -26], [30, 2], [14, 22], [-12, 16]].map(gp), RD, 3.5, 10);
  rgLine(c, [gp([-6, -12]), gp([20, 12])], 2, RG_INK); rgLine(c, [gp([18, -18]), gp([-4, 10])], 2, RG_INK);
  const hc = tr([0, -112]), hr = p => rgRot(tr(p), hc, k.head);
  rgBand(c, [[-24, -126], [24, -126], [20, -100], [-20, -100]].map(hr), RG_WD, 3.5, 6); rgShape(c, [[-36, -176], [-20, -198], [20, -198], [36, -176], [40, -138], [22, -108], [-22, -108], [-40, -138]].map(hr), RG_W, RG_WD, 16);
  rgBand(c, [[-35, -176], [-20, -195], [0, -196], [-16, -170], [-35, -156]].map(hr), R, 3.5, 8); rgBand(c, [[35, -176], [20, -195], [0, -196], [16, -170], [35, -156]].map(hr), AC, 3.5, 8);
  rgBand(c, [[-24, -160], [24, -160], [20, -118], [-20, -118]].map(hr), '#1a2440', 3.5, 9);
  for (const xx of [-12, 0, 12]) rgLine(c, [hr([xx, -160]), hr([xx * .85, -118])], 2.2, '#e8edf5'); for (const yy of [-148, -134]) rgLine(c, [hr([-23, yy]), hr([23, yy])], 2.2, '#e8edf5');
  c.restore();
}

/* ---------- screens ---------- */
const sgHide = () => SG.screen === 'play' && SG.phase === 'reveal' && !SG.done;       // while the shot plays out, the board must not give the result away
const sgLog = i => (sgHide() && i === sgShooter() ? SG.log[i].slice(0, -1) : SG.log[i]);
function sgDots(i) {
  const total = Math.max(SG_ROUNDS, SG.log[0].length, SG.log[1].length), L = sgLog(i);
  return Array.from({ length: total }, (_, k) => { const r = L[k]; return `<span class="sg-dot ${r === 'G' ? 'g' : r === 'S' ? 's' : ''}">${r === 'G' ? '●' : r === 'S' ? '✕' : '○'}</span>`; }).join('');
}
function sgBoard() {
  const s = sgShooter(), live = SG.screen === 'play';
  return `<div class="sg-board">${[0, 1].map(i => `<div class="sg-side ${live && s === i ? 'on' : ''}"><b>${esc(sgName(i))}${sgMe() === i ? ' <span class="muted">(you)</span>' : ''}</b><span class="sg-num">${SG.score[i] - (sgHide() && i === s && SG.res && SG.res.goal ? 1 : 0)}</span><div class="sg-dots" aria-label="shots">${sgDots(i)}</div></div>`).join('')}</div>`;
}
const sgPicker = label => `<p class="sg-say">${label}</p><div class="sg-picks">${Object.entries(SG_DIRS).map(([k, v]) => `<button type="button" class="btn sg-pick" data-sg="pick" data-dir="${k}">${k === 'L' ? '◀ ' : ''}${v}${k === 'R' ? ' ▶' : ''}</button>`).join('')}</div><p class="key-hint">Keyboard: ← ↓ → or A S D to pick · Enter for the next shot</p>`;
const sgInviteLink = () => location.href.split('#')[0] + '#/resources?join=' + (SG.net ? SG.net.code : '');

function resList() {
  const rec = sgRecord.get(), fr = typeof foRec === 'object' ? foRec.get() : { w: 0, l: 0 }, sp = typeof spRec === 'object' ? spRec.get() : { best: 0, games: 0 };
  return `<div class="grid res-list"><section class="card"><h2 style="margin-top:4px">Shootout</h2><p class="muted">A penalty shot duel. Pick left, middle or right, and so does the goalie. Play the computer, a friend on this screen, or a friend on another computer with an invite code.</p>
    <div class="btnrow"><button class="btn" data-res="shootout" type="button">Play</button></div>${rec.w + rec.l ? `<p class="muted" style="margin:10px 0 0">Record vs computer ${rec.w}–${rec.l}</p>` : ''}</section>
    <section class="card"><h2 style="margin-top:4px">Face-off</h2><p class="muted">A reaction game at the dot. The referee drops the puck at a random moment: tap the instant it drops, but tap early and it is a false start. Play the computer or a friend on this screen.</p>
    <div class="btnrow"><button class="btn" data-res="faceoff" type="button">Play</button></div>${fr.w + fr.l ? `<p class="muted" style="margin:10px 0 0">Record vs computer ${fr.w}–${fr.l}${fr.best ? ` · best ${fr.best} ms` : ''}</p>` : ''}</section>
    <section class="card"><h2 style="margin-top:4px">Slap Shot</h2><p class="muted">A timing game with two taps per shot, like a kicking meter: stop the aim line, then stop the power meter. Corners score 5, but the goalie reads your shot. Play solo for a high score, or take turns with a friend on this screen.</p>
    <div class="btnrow"><button class="btn" data-res="slapshot" type="button">Play</button></div>${sp.games ? `<p class="muted" style="margin:10px 0 0">Best score ${sp.best}</p>` : ''}</section></div>`;
}
function resChrome() { document.documentElement.dataset.game = document.getElementById('sg') ? (RES.game || '') : ''; }
function sgRender() {
  const root = document.getElementById('sg'); resChrome(); if (!root) return;
  if (!RES.game) { root.innerHTML = resList(); return; }
  if (RES.game === 'faceoff') return foRender();
  if (RES.game === 'slapshot') return spRender();
  const rec = sgRecord.get(), nameBox = (id, label, val) => `<label class="f">${label}<input id="${id}" list="sg-names" value="${esc(val)}" maxlength="20" autocomplete="off"></label>`;
  const dl = `<datalist id="sg-names">${D.members.map(m => `<option value="${esc(m.short_name)}">`).join('')}</datalist>`;
  if (SG.screen === 'menu') {
    root.innerHTML = `<section class="card sg-menu"><h2 style="margin-top:4px">Shootout</h2><p class="muted">A penalty shot duel. The shooter picks <b>left</b>, <b>middle</b> or <b>right</b>. The goalie picks too. Same pick is a save, anything else is a goal. Five shots each, then sudden death.</p>
      <div class="btnrow"><button class="btn" data-sg="start" data-mode="bot">Play the computer</button><button class="btn ghost" data-sg="start" data-mode="two">Two players, one screen</button><button class="btn ghost" data-sg="start" data-mode="online">Play a friend online</button></div>
      ${rec.w + rec.l ? `<p class="muted" style="margin:12px 0 0">Your record against the computer: <b>${rec.w}–${rec.l}</b></p>` : ''}</section>`;
    return;
  }
  if (SG.screen === 'setup') {
    if (SG.mode === 'online') {
      root.innerHTML = `<section class="card"><h2 style="margin-top:4px">Play a friend online</h2><p class="muted">One of you creates a game and sends the other the invite code. Each of you plays on your own computer or phone.</p>
        <form class="form" onsubmit="return false">${nameBox('sg-n0', 'Your name', SG.names[0])}${dl}
        <div class="btnrow"><button class="btn" data-sg="create" type="button">Create a game</button></div>
        <label class="f">Have a code? <input id="sg-code" value="${esc(SG.join)}" maxlength="5" autocomplete="off" autocapitalize="characters" placeholder="ABCDE" style="text-transform:uppercase;letter-spacing:.2em"></label>
        <div class="btnrow"><button class="btn ghost" data-sg="joingame" type="button">Join with code</button><button class="btn ghost" data-sg="menu" type="button">Back</button></div>
        <p class="form-note err">${esc(SG.msg)}</p></form></section>`;
      return;
    }
    root.innerHTML = `<section class="card"><h2 style="margin-top:4px">${SG.mode === 'bot' ? 'Shootout vs the computer' : 'Shootout: two players'}</h2>
      <form class="form" onsubmit="return false">${nameBox('sg-n0', SG.mode === 'bot' ? 'Your name' : 'Player 1', SG.names[0])}
      ${SG.mode === 'bot' ? '' : `${nameBox('sg-n1', 'Player 2', SG.names[1])}<p class="muted" style="margin:0">Play on one screen. After the shooter picks, hand the device to the goalie so the pick stays secret.</p>`}${dl}
      <div class="btnrow"><button class="btn" data-sg="go" type="button">Face off</button><button class="btn ghost" data-sg="menu" type="button">Back</button></div></form></section>`;
    return;
  }
  if (SG.screen === 'lobby') {
    const hosting = SG.net && SG.net.host;
    root.innerHTML = hosting ? `<section class="card"><h2 style="margin-top:4px">Waiting for your friend</h2><p class="muted">Send them this code. They open the site, go to <b>Resources</b> (small link at the bottom of any page), choose <b>Play a friend online</b>, and enter it. Keep this page open.</p>
        <div class="sg-code" aria-label="Invite code">${esc(SG.net.code)}</div>
        <div class="btnrow"><button class="btn" data-sg="copycode" type="button">Copy code</button><button class="btn ghost" data-sg="copylink" type="button">Copy invite link</button><button class="btn ghost" data-sg="cancel" type="button">Cancel</button></div><p class="muted sg-copied" style="margin:10px 0 0"></p></section>`
      : `<section class="card"><h2 style="margin-top:4px">Connecting…</h2><p class="muted">Joining the game. This takes a few seconds.</p><div class="btnrow"><button class="btn ghost" data-sg="cancel" type="button">Cancel</button></div></section>`;
    return;
  }
  if (SG.screen === 'lost') {
    root.innerHTML = `<section class="card"><h2 style="margin-top:4px">Your opponent left</h2><p class="muted">The connection closed. You can start another game.</p><div class="btnrow"><button class="btn" data-sg="menu">Back to games</button></div></section>`;
    return;
  }
  const s = sgShooter(), g = sgGoalie(), reveal = SG.phase === 'reveal', me = sgMe();
  if (SG.screen === 'end') {
    const w = SG.winner, you = SG.mode === 'bot' ? (w === 0 ? 'You win!' : 'The computer wins.') : me >= 0 ? (w === me ? 'You win!' : `${sgName(w)} wins.`) : `${sgName(w)} wins!`;
    const again = !sgOnline() || SG.net ? `<button class="btn" data-sg="${sgOnline() && !SG.net.host ? 'again' : 'go'}">${sgOnline() && !SG.net.host ? 'Ask for a rematch' : 'Play again'}</button>` : '';
    root.innerHTML = `${sgBoard()}<section class="card sg-end"><h2 style="margin-top:4px">${esc(you)}</h2><p class="muted">Final score ${SG.score[0]}–${SG.score[1]}${SG.log[0].length > SG_ROUNDS ? ' after sudden death' : ''}.${SG.mode === 'bot' ? ` Your record against the computer: <b>${rec.w}–${rec.l}</b>.` : ''}</p>
      <div class="btnrow">${again}<button class="btn ghost" data-sg="menu">Back to games</button></div></section>`;
    return;
  }
  let body;
  if (reveal) {
    const goal = SG.res.goal, who = esc(sgName(s));
    body = `<div class="sg-after" hidden><p class="sg-say"><span class="sg-result ${goal ? 'goal' : 'save'}">${goal ? 'GOAL!' : 'SAVED!'}</span> ${who} shot ${SG_DIRS[SG.shot.shoot].toLowerCase()}, ${esc(sgName(g))} went ${SG_DIRS[SG.shot.dive].toLowerCase()}.</p>${sgOnline() ? `<p class="muted">${sgOver() >= 0 ? 'Final result coming up…' : 'Next shot starting…'}</p>` : `<div class="btnrow"><button class="btn" data-sg="next">${sgOver() >= 0 ? 'See result' : 'Next shot'}</button></div>`}</div><p class="muted sg-wait">Tap the rink to skip the animation.</p>`;
  } else if (SG.phase === 'pick') {
    const shooting = s === me;
    body = SG.mine ? `<p class="sg-say">Locked in. Waiting for <b>${esc(sgName(1 - me))}</b>…</p>` : sgPicker(shooting ? `<b>${esc(sgName(me))}</b>, where do you shoot?` : `<b>${esc(sgName(me))}</b>, which way do you dive?`);
  } else if (SG.phase === 'shooter') {
    body = sgPicker(`<b>${esc(sgName(s))}</b>, where do you shoot?${SG.mode === 'two' ? ` <span class="muted">(${esc(sgName(g))}, look away)</span>` : ''}`);
  } else if (SG.phase === 'pass') {
    body = `<p class="sg-say">Shot locked in. Pass the device to <b>${esc(sgName(g))}</b>.</p><div class="btnrow"><button class="btn" data-sg="ready">I'm ${esc(sgName(g))}, ready</button></div>`;
  } else {
    body = sgPicker(`<b>${esc(sgName(g))}</b>, which way do you dive?${SG.mode === 'bot' ? ' <span class="muted">(the computer is shooting)</span>' : ''}`);
  }
  root.innerHTML = `${sgBoard()}<div class="sg-scene"><canvas id="sg-cv" class="sg-cv" data-sg="skip" aria-label="Shootout rink" role="img"></canvas></div><div class="sg-ctl"><p class="muted sg-meta">${SG.log[0].length >= SG_ROUNDS && SG.log[0].length === SG.log[1].length ? 'Sudden death' : `Shot ${Math.floor(SG.n / 2) + 1}${SG.log[0].length > SG_ROUNDS - 1 ? ' · sudden death' : ` of ${SG_ROUNDS}`}`} · ${esc(sgName(s))} shooting</p>${body}<button type="button" class="link sg-snd" data-sg="sound">Sound: ${SGA.sound ? 'on' : 'off'}</button></div>`;
  SGA.is = s; SGA.play = null; sgAttach(document.getElementById('sg-cv'));
  if (reveal) sgRun({ shoot: SG.shot.shoot, dive: SG.shot.dive, goal: SG.res.goal, shooter: s }, sgShotDone);
}

view.resources = function () {
  const q = (location.hash.split('?')[1] || '').match(/join=([A-Za-z0-9]{5})/);
  if (!document.getElementById('sg') && SG.screen !== 'menu' && SG.screen !== 'end') { sgNetEnd(); Object.assign(SG, { screen: 'menu' }); }      // leaving mid-game and coming back starts fresh
  if (!document.getElementById('sg')) RES.game = '';
  if (q && SG.screen === 'menu') { RES.game = 'shootout'; SG.join = q[1].toUpperCase(); setTimeout(() => sgStart('online'), 0); } else setTimeout(sgRender, 0);
  return `<h1>Resources</h1><div class="res-head"><p class="lead">Extras for the league.</p><button class="link res-hide" data-boss type="button" title="Shortcut: Esc">Hide screen (Esc)</button></div><div class="res-bar"><button class="res-back" data-res="list" type="button">◀ All games</button><b class="res-title" aria-hidden="true"></b></div><div id="sg" class="sg"></div>`;
};
window.addEventListener('hashchange', () => { if (!/^#\/(resources|games)/.test(location.hash)) { RES.game = ''; document.documentElement.dataset.game = ''; if (SG.net || SG.screen !== 'menu') { sgNetEnd(); Object.assign(SG, { screen: 'menu', msg: '' }); } } });
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-sg]'); if (!b || !document.getElementById('sg')) return;
  const a = b.dataset.sg, flash = t => { const el = document.querySelector('.sg-copied'); if (el) el.textContent = t; };
  if (a === 'start') sgStart(b.dataset.mode);
  else if (a === 'menu' || a === 'cancel') { sgNetEnd(); SG.screen = 'menu'; sgRender(); }
  else if (a === 'go') {
    if (SG.screen === 'setup') { const n0 = sgClean(document.getElementById('sg-n0').value), n1 = document.getElementById('sg-n1'); SG.names = [n0 || 'Player 1', SG.mode === 'bot' ? 'Computer' : (sgClean(n1.value) || 'Player 2')]; if (SG.mode === 'two' && SG.names[0] === SG.names[1]) SG.names[1] += ' 2'; }
    if (sgOnline() && SG.net && SG.net.host) sgSend({ t: 'start', names: SG.names });
    sgBegin();
  }
  else if (a === 'create') sgNetOpen(true, sgCode());
  else if (a === 'joingame') { const code = (document.getElementById('sg-code').value || '').trim().toUpperCase(); SG.join = code; if (!/^[A-Z0-9]{5}$/.test(code)) { SG.msg = 'Enter the 5-character code your friend sent you.'; return sgRender(); } sgNetOpen(false, code); }
  else if (a === 'copycode') { try { await navigator.clipboard.writeText(SG.net.code); flash('Code copied.'); } catch { flash('Select the code and copy it.'); } }
  else if (a === 'copylink') { try { await navigator.clipboard.writeText(sgInviteLink()); flash('Invite link copied. Your friend opens it and taps Join.'); } catch { flash(sgInviteLink()); } }
  else if (a === 'again') { sgSend({ t: 'again' }); b.disabled = true; b.textContent = 'Waiting for the host…'; }
  else if (a === 'pick') sgPick(b.dataset.dir);
  else if (a === 'ready') { SG.phase = 'goalie'; sgRender(); }
  else if (a === 'next') sgAdvance();
  else if (a === 'sound') { SGA.sound = !SGA.sound; try { localStorage.setItem('bhl_sg_sound', SGA.sound ? '1' : '0'); } catch { } b.textContent = SGA.sound ? 'Sound: on' : 'Sound: off'; if (SGA.sound) sgSound('save'); }
  else if (a === 'skip') sgSkip();
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-res]'); if (!b || !document.getElementById('sg')) return;
  const g = b.dataset.res; if (g === 'list') { if (typeof foReset === 'function') foReset(); if (typeof spReset === 'function') spReset(); sgNetEnd(); Object.assign(SG, { screen: 'menu', msg: '' }); RES.game = ''; } else { RES.game = g; if (g === 'shootout') SG.screen = 'menu'; else { if (g === 'faceoff' && typeof foReset === 'function') foReset(); if (g === 'slapshot' && typeof spReset === 'function') spReset(); } }
  sgRender(); window.scrollTo(0, 0);
});
/* Shootout on a keyboard: arrows or A / S / D pick left, middle, right; Enter or Space moves on. */
document.addEventListener('keydown', e => {
  if (RES.game !== 'shootout' || SG.screen !== 'play' || e.repeat || (typeof BOSS !== 'undefined' && BOSS.on) || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) return;
  const k = e.key.toLowerCase(), dir = { arrowleft: 'L', a: 'L', arrowdown: 'M', arrowup: 'M', s: 'M', w: 'M', arrowright: 'R', d: 'R' }[k];
  if (dir && document.querySelector('[data-sg=pick]')) { e.preventDefault(); sgPick(dir); }
  else if (k === ' ' || k === 'enter') { const b = document.querySelector('.sg-after:not([hidden]) [data-sg=next], [data-sg=ready]'); if (b) { e.preventDefault(); b.click(); } else if (SG.phase === 'reveal') { e.preventDefault(); sgSkip(); } }
});

