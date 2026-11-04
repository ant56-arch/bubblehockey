/* Resources (#/resources, linked from the small text at the bottom of every page; the old #/games address still works). The first game is a penalty shootout: the shooter picks left,
   middle or right and the goalie does the same. Same pick = saved, different pick = goal. Five shots each, then sudden death.
   Play the computer, a friend on the same screen, or a friend on another computer with an invite code (browser to browser, using js/vendor/peerjs.min.js
   and the free public PeerJS matchmaking server, which only introduces the two browsers; the game itself goes straight between them).
   Nothing here is saved to the league data; only a win-loss record against the computer is kept in this browser. */
PAGES.push(['resources', 'Resources', true]);      // true = not in the top menu

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
const SG_INK = '#0b1426', SG_TEAM = [{ main: '#2563eb', dark: '#0b1f44', light: '#7aa7ff', trim: '#ffffff' }, { main: '#dc2626', dark: '#6b1111', light: '#ff8a80', trim: '#ffffff' }];
const sgGrad = (c, x0, y0, x1, y1, ...stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; };
const sgRR = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
const sgFS = (c, fill, lw = 2) => { c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = SG_INK; c.lineJoin = 'round'; c.stroke(); };
const sgLimb = (c, x0, y0, x1, y1, w, col) => { c.lineCap = 'round'; c.strokeStyle = SG_INK; c.lineWidth = w + 3.5; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.strokeStyle = col; c.lineWidth = w; c.stroke(); };
const SG_LOGOS = {};
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
  if (!SGA.sound) return;
  try {
    const A = SGA.audio ||= new (window.AudioContext || window.webkitAudioContext)(), t = A.currentTime;
    const tone = (type, f0, f1, dur, vol) => { const o = A.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); const g = A.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(A.destination); o.start(t); o.stop(t + dur); };
    if (kind === 'shot') tone('triangle', 420, 90, 0.18, 0.25);
    if (kind === 'goal') { tone('sawtooth', 240, 236, 0.7, 0.12); tone('square', 120, 118, 0.7, 0.06); }
    if (kind === 'save') { tone('sine', 150, 50, 0.22, 0.35); tone('triangle', 900, 300, 0.08, 0.12); }
    if (kind === 'skate') tone('sawtooth', 700, 200, 0.5, 0.025);
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
  const dv = P ? sgEase(sgClamp(pt, 1.25, 1.7)) : 0, sway = P ? 0 : Math.sin(T * 1.8) * 5 * gs, gxp = gx + diveX * 46 * gs * dv + sway;
  sgDrawGoalie(c, gxp, gy - 2 * gs, gs * 0.64, diveX * 0.8 * dv, dv, diveX, goaliePal, sgLogo(sgName(1 - sh)), T);
  // posts and goal light
  c.lineCap = 'round'; c.lineJoin = 'round'; for (const [lw, col] of [[8 * gs + 3, SG_INK], [8 * gs, '#d62828']]) { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(gx - W / 2, gy); c.lineTo(gx - W / 2, gy - Hn); c.lineTo(gx + W / 2, gy - Hn); c.lineTo(gx + W / 2, gy); c.stroke(); }
  const lit = P && P.goal && after > 0 && Math.floor(after * 6) % 2 === 0; if (lit) { c.fillStyle = '#ff2d2d'; c.beginPath(); c.arc(gx, gy - Hn - 14 * gs, 6 * gs, 0, 6.3); c.fill(); c.lineWidth = 1.5; c.strokeStyle = SG_INK; c.stroke(); c.fillStyle = 'rgba(255,45,45,.25)'; c.beginPath(); c.arc(gx, gy - Hn - 14 * gs, 18 * gs, 0, 6.3); c.fill(); }
  // skater, then puck on top
  const strideT = P ? (pt < 1.0 ? pt : 0) : 0, bob = P && pt < 1.0 ? Math.abs(Math.sin(pt * 10)) * 2 : Math.sin(T * 2) * 0.8;
  const skx = 240 + shootX * 24 * wind, SKS = 0.84, bl = { x: 50 + (P && pt < 1.0 ? Math.sin(pt * 14) * 9 : P ? 0 : Math.sin(T * 1.5) * 3) + shootX * 6 * wind - shot * 6, y: -3 + wind * 8 - shot * 22 };       // blade tip, in the skater's own coordinates
  const bladeX = skx + (bl.x + 12) * SKS, bladeY = SG_FEET + bl.y * SKS;
  sgDrawSkater(c, skx, SG_FEET - bob, SKS, wind, shootX, shot, shotPal, sgName(sh), P ? strideT : 0, bl, P ? pt < 1.0 : false, T);
  const tx = gx + shootX * W * 0.3, ty = gy - Hn * 0.3 - (P && P.shoot === 'M' ? Hn * 0.18 : 0);
  let px = bladeX, py = bladeY, pr = 7, vis = true;
  if (!P) { px = bladeX; py = bladeY; }
  else if (pt < 1.3) { px = bladeX + Math.sin(pt * 9) * 2 * (1 - wind); py = bladeY + Math.abs(Math.sin(pt * 9)) * 2; }
  else if (pt < 1.75) {
    const u = sgOut(shot), sx0 = bladeX, sy0 = bladeY; px = sx0 + (tx - sx0) * u; py = sy0 + (ty - sy0) * u - Math.sin(u * Math.PI) * 18; pr = 7 - (7 - 4 * gs) * u;
    if (u > .12) { const u2 = Math.max(0, u - .28); c.strokeStyle = 'rgba(15,23,42,.28)'; c.lineWidth = pr * 1.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(sx0 + (tx - sx0) * u2, sy0 + (ty - sy0) * u2 - Math.sin(u2 * Math.PI) * 18); c.lineTo(px, py); c.stroke(); }
  } else if (P.goal) { px = tx; py = ty + Math.min(0.5, after) * 22 * gs; pr = 4 * gs; }
  else { const u = after; px = tx + (diveX === 0 ? (shootX || 1) : -diveX) * u * 90 * (shootX === 0 ? 0.7 : 1); py = ty + 120 * u * u - u * 60; pr = 4 * gs + u * 3; vis = u < 1.1; }
  if (vis) { c.fillStyle = '#0b1426'; c.beginPath(); c.ellipse(px, py, pr, pr * .6, 0, 0, 6.3); c.fill(); c.fillStyle = '#334155'; c.beginPath(); c.ellipse(px, py - pr * .25, pr, pr * .45, 0, 0, 6.3); c.fill(); }
  // ice spray and confetti
  if (P && pt < 1.25 && Math.random() < .7) SGA.parts.push({ x: skx + (Math.random() - .5) * 30, y: SG_FEET + 2, vx: (Math.random() - .5) * 70, vy: -20 - Math.random() * 45, life: .5, spray: 1 });
  for (let i = SGA.parts.length - 1; i >= 0; i--) {
    const q = SGA.parts[i]; q.life -= 1 / 60; if (q.life <= 0) { SGA.parts.splice(i, 1); continue; }
    q.x += q.vx / 60; q.y += q.vy / 60; q.vy += (q.spray ? 120 : 160) / 60; c.globalAlpha = Math.min(1, q.life * 2); c.fillStyle = q.c || '#fff';
    if (q.spray) c.fillRect(q.x, q.y, 2.2, 2.2); else { c.save(); c.translate(q.x, q.y); c.rotate(q.life * 9 + i); c.fillRect(-3, -2, 6, 4); c.restore(); } c.globalAlpha = 1;
  }
  // result banner
  if (P && after > 0) {
    const u = sgOut(after * 3), a = after < 1.4 ? 1 : Math.max(0, 1 - (after - 1.4) * 2), txt = P.goal ? 'GOAL!' : 'SAVED!';
    c.save(); c.globalAlpha = a; c.translate(240, 160); c.scale(.6 + .5 * u, .6 + .5 * u); c.rotate(-0.06);
    c.font = '900 58px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 9; c.lineJoin = 'round'; c.strokeStyle = '#fff'; c.strokeText(txt, 0, 0);
    c.fillStyle = P.goal ? '#137a35' : '#c1272d'; c.fillText(txt, 0, 0); c.restore(); c.textAlign = 'start';
  }
  c.restore();
}
function sgBurst(P, shootX) {
  const gy = 212, tx = 240 + shootX * 57;
  if (P.goal) for (let i = 0; i < 80; i++) SGA.parts.push({ x: 240 + (Math.random() - .5) * 220, y: 30 + Math.random() * 50, vx: (Math.random() - .5) * 120, vy: Math.random() * 40, life: 1.6 + Math.random(), c: ['#c1272d', '#2563eb', '#f5b301', '#fff', '#8cc63f'][i % 5] });
  else for (let i = 0; i < 30; i++) SGA.parts.push({ x: tx, y: gy - 30, vx: (Math.random() - .5) * 240, vy: -Math.random() * 150, life: .5 + Math.random() * .3, spray: 1, c: '#fde68a' });
}

/* The arena: lit ceiling, crowd behind glass, boards with team ads, and shiny ice with the goal line, crease and face-off dots. */
function sgArena(c, T, P, after, gs, gy, pt) {
  const bg = sgGrad(c, 0, 0, 0, 100, '#060b18', '#16233d'); c.fillStyle = bg; c.fillRect(-10, 0, 500, 100);
  for (let i = 0; i < 6; i++) { const x = 40 + i * 80, g = c.createRadialGradient(x, 0, 0, x, 0, 60); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x - 60, 0, 120, 70); c.fillStyle = '#e2e8f0'; c.fillRect(x - 18, 0, 36, 3); }
  const cheer = P && P.goal && after > 0 ? Math.sin(after * 14) * 3 * Math.max(0, 1 - after / 1.2) : 0;
  for (const p of SGA.crowd) {
    const y = 26 + p.r * 17 + Math.sin(T * 2 + p.ph) * 1 - Math.abs(cheer) * (p.r + 1) * .45, r = 4.6;
    c.fillStyle = p.c; c.beginPath(); c.roundRect(p.x - 5, y + 2, 10, 9, 3); c.fill();                       // shoulders
    c.fillStyle = ['#f1c9a5', '#d9a273', '#8d5a3b', '#f6d7b8'][p.h]; c.beginPath(); c.arc(p.x, y - 1, r * .85, 0, 6.3); c.fill();      // head
  }
  const gl = sgGrad(c, 0, 80, 0, 98, 'rgba(147,197,253,.0)', 'rgba(147,197,253,.28)'); c.fillStyle = gl; c.fillRect(-10, 80, 500, 18);                       // glass shine
  c.fillStyle = 'rgba(255,255,255,.07)'; for (let x = 20; x < 480; x += 90) { c.beginPath(); c.moveTo(x, 70); c.lineTo(x + 22, 70); c.lineTo(x + 10, 98); c.lineTo(x - 12, 98); c.fill(); }
  const bd = sgGrad(c, 0, 96, 0, 118, '#13306b', '#0b1f44'); c.fillStyle = bd; c.fillRect(-10, 96, 500, 22); c.fillStyle = '#f5b301'; c.fillRect(-10, 96, 500, 2.5); c.fillStyle = '#050b18'; c.fillRect(-10, 116, 500, 2);
  c.fillStyle = '#fff'; c.font = '800 10px Inter, system-ui, sans-serif'; c.textBaseline = 'middle'; const sc = (T * 16 * (P ? 1 : 0.3)) % 170; for (let x = -sc; x < 500; x += 170) { c.fillText('BUBBLE HOCKEY LEAGUE', x + 6, 107); c.fillStyle = '#8cc63f'; c.fillRect(x + 148, 102, 6, 10); c.fillStyle = '#fff'; }
  const ice = sgGrad(c, 0, 118, 0, 340, '#cfe3f6', '#f4faff', '#e8f2fc'); c.fillStyle = ice; c.fillRect(-10, 118, 500, 230);
  const sheen = c.createRadialGradient(240, 250, 10, 240, 250, 260); sheen.addColorStop(0, 'rgba(255,255,255,.7)'); sheen.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = sheen; c.fillRect(-10, 118, 500, 230);
  c.strokeStyle = 'rgba(190,40,50,.75)'; c.lineWidth = 3 * gs; c.beginPath(); c.moveTo(-10, gy + 5 * gs); c.lineTo(490, gy + 5 * gs); c.stroke();                       // goal line
  c.beginPath(); c.ellipse(240, gy + 5 * gs, 82 * gs, 50 * gs, 0, 0, Math.PI); c.fillStyle = 'rgba(96,165,250,.28)'; c.fill(); c.strokeStyle = 'rgba(190,40,50,.8)'; c.lineWidth = 2.2; c.stroke();   // crease
  c.strokeStyle = 'rgba(80,110,150,.16)'; c.lineWidth = 1; for (let i = 0; i < 16; i++) { const x = (i * 97) % 480, y = 140 + i * 13; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 60, y + 7, x + 150, y + 1); c.stroke(); }          // skate marks
  c.fillStyle = 'rgba(190,40,50,.85)'; c.beginPath(); c.arc(240 - 115 * gs, gy + 58 * gs, 6 * gs, 0, 6.3); c.arc(240 + 115 * gs, gy + 58 * gs, 6 * gs, 0, 6.3); c.fill();      // face-off dots
}

/* The goalie, facing the shooter, drawn like real gear: big curved leg pads with knee rolls, bulky pants, a baggy jersey over a puffy chest protector,
   a catching glove (trapper) on the right and the blocker plus stick on the left, and a painted mask with a cage. dv = how far into the save (0 to 1):
   a shot down the middle gets a butterfly (drop to the knees, pads flared out), a shot to either side gets a sideways push with the lead pad stretched out. */
function sgDrawGoalie(c, x, y, s, lean, dv, dir, pal, logo, T) {
  c.save(); c.translate(x, y); c.scale(s, s);
  const fly = dir === 0, drop = (fly ? 44 : 38) * dv, breathe = Math.sin(T * 2.2) * 1.3 * (1 - dv);
  c.fillStyle = 'rgba(15,23,42,.2)'; c.beginPath(); c.ellipse(0, 3, 54 + dv * 24, 9, 0, 0, 6.3); c.fill();
  c.rotate(lean * 0.45); c.translate(0, drop - breathe);
  const iceY = 2 - drop + breathe;
  sgRR(c, -29, -88, 58, 40, 16); sgFS(c, sgGrad(c, -29, 0, 29, 0, pal.dark, pal.main, pal.dark));                          // pants
  const pad = (sx, th) => {                                                                        // leg pad, hanging from the hip
    c.save(); c.translate(sx * 15, -60); c.rotate(th);
    c.beginPath(); c.moveTo(-9, 60); c.bezierCurveTo(-15, 48, -16, 30, -14, 16); c.lineTo(-13, -2); c.quadraticCurveTo(0, -9, 13, -2); c.lineTo(14, 16); c.bezierCurveTo(16, 30, 15, 48, 9, 60); c.closePath();
    sgFS(c, sgGrad(c, -15, 0, 15, 0, '#c9d1de', '#ffffff', '#b9c4d4'));
    c.beginPath(); c.moveTo(-14.4, 13); c.quadraticCurveTo(0, 20, 14.4, 13); c.lineTo(15, 25); c.quadraticCurveTo(0, 32, -15, 25); c.closePath(); sgFS(c, pal.main, 1.6);      // knee roll
    c.strokeStyle = 'rgba(11,20,38,.32)'; c.lineWidth = 1.2; for (const o of [-5, 5]) { c.beginPath(); c.moveTo(o, 32); c.quadraticCurveTo(o * 1.1, 46, o * .8, 57); c.stroke(); }
    for (const yy of [38, 50]) { c.fillStyle = pal.dark; c.beginPath(); c.roundRect(-14, yy, 28, 4.5, 2); c.fill(); c.fillStyle = '#e2e8f0'; c.fillRect(-2, yy, 4, 4.5); }
    c.beginPath(); c.ellipse(0, 61, 11, 5.5, 0, 0, 6.3); sgFS(c, '#111827', 1.6);                    // skate toe
    c.restore();
  };
  pad(-1, fly ? dv * 1.2 : (dir === -1 ? 1.45 * dv : 0.45 * dv * (dir === 1 ? -1 : 1)));
  pad(1, fly ? -dv * 1.2 : (dir === 1 ? -1.45 * dv : -0.45 * dv * (dir === -1 ? -1 : 1)));
  // jersey: baggy, wider at the hem
  c.beginPath(); c.moveTo(-24, -116); c.bezierCurveTo(-33, -104, -36, -86, -33, -66); c.lineTo(-31, -57); c.quadraticCurveTo(0, -50, 31, -57); c.lineTo(33, -66); c.bezierCurveTo(36, -86, 33, -104, 24, -116); c.quadraticCurveTo(0, -125, -24, -116); c.closePath();
  sgFS(c, sgGrad(c, -34, -120, 34, -56, pal.light, pal.main, pal.dark));
  c.fillStyle = pal.trim; c.beginPath(); c.moveTo(-32, -68); c.quadraticCurveTo(0, -61, 32, -68); c.lineTo(32.5, -63); c.quadraticCurveTo(0, -56, -32.5, -63); c.closePath(); c.fill();
  c.fillStyle = pal.dark; c.beginPath(); c.moveTo(-31.5, -62); c.quadraticCurveTo(0, -55, 31.5, -62); c.lineTo(31, -58); c.quadraticCurveTo(0, -51, -31, -58); c.closePath(); c.fill();
  if (logo) { c.save(); c.beginPath(); c.arc(0, -94, 11, 0, 6.3); c.clip(); c.drawImage(logo, -11, -105, 22, 22); c.restore(); c.beginPath(); c.arc(0, -94, 11, 0, 6.3); c.lineWidth = 1.6; c.strokeStyle = SG_INK; c.stroke(); }
  // arms and hands
  const hand = sx => {
    let hx = sx * (58 + dv * 4), hy = -86 - dv * (fly ? 14 : 4);
    if (!fly && sx === dir) { hx = dir * (60 + dv * 46); hy = -92 - dv * 30; }
    return { x: hx, y: hy };
  };
  for (const sx of [-1, 1]) {
    const h = hand(sx), ex = (sx * 27 + h.x) / 2 + sx * 4, ey = (-106 + h.y) / 2 + 12;
    sgLimb(c, sx * 27, -106, ex, ey, 16, pal.main); sgLimb(c, ex, ey, h.x, h.y, 13, pal.main);
    c.beginPath(); c.arc(ex, ey, 8, 0, 6.3); sgFS(c, pal.dark, 1.6);                                  // elbow pad
    c.beginPath(); c.arc(sx * 27, -107, 11.5, 0, 6.3); sgFS(c, sgGrad(c, sx * 27 - 8, -118, sx * 27 + 8, -98, pal.light, pal.main), 1.8);        // shoulder cap
    c.strokeStyle = pal.trim; c.lineWidth = 2.2; c.beginPath(); c.arc(sx * 27, -107, 8, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  }
  const bh = hand(-1), ch = hand(1);
  // stick: in the blocker hand, shaft down to the ice, wide paddle, blade flat on the ice in front
  const tipX = bh.x - 4, tipY = iceY;
  c.lineCap = 'butt'; c.strokeStyle = SG_INK; c.lineWidth = 6.5; c.beginPath(); c.moveTo(bh.x, bh.y + 6); c.lineTo(tipX, tipY); c.stroke(); c.strokeStyle = '#a16a2e'; c.lineWidth = 3.4; c.stroke();
  const mx = bh.x + (tipX - bh.x) * 0.5, my = bh.y + 6 + (tipY - bh.y - 6) * 0.5;
  c.strokeStyle = SG_INK; c.lineWidth = 13; c.beginPath(); c.moveTo(mx, my); c.lineTo(tipX, tipY); c.stroke(); c.strokeStyle = '#c58b3d'; c.lineWidth = 9.5; c.stroke();         // paddle
  sgRR(c, tipX - 6, tipY - 5, 44, 8, 3); sgFS(c, '#1f2937', 1.8); c.fillStyle = '#f8fafc'; c.fillRect(tipX + 4, tipY - 3.5, 20, 3);
  sgRR(c, bh.x - 11, bh.y - 20, 22, 38, 5); sgFS(c, sgGrad(c, bh.x - 11, 0, bh.x + 11, 0, '#f1f5f9', '#cfd8e5'));           // blocker
  c.strokeStyle = 'rgba(11,20,38,.4)'; c.lineWidth = 1.3; for (const o of [-10, -4, 2, 8]) { c.beginPath(); c.moveTo(bh.x - 9, bh.y + o); c.lineTo(bh.x + 9, bh.y + o); c.stroke(); }
  sgRR(c, bh.x - 8, bh.y + 14, 16, 9, 3); sgFS(c, '#111827', 1.4);
  // catching glove: rounded mitt with webbing and a cuff
  c.beginPath(); c.moveTo(ch.x - 15, ch.y + 10); c.bezierCurveTo(ch.x - 19, ch.y - 12, ch.x - 14, ch.y - 30, ch.x + 2, ch.y - 31); c.bezierCurveTo(ch.x + 18, ch.y - 31, ch.x + 20, ch.y - 10, ch.x + 15, ch.y + 12); c.quadraticCurveTo(ch.x, ch.y + 19, ch.x - 15, ch.y + 10); c.closePath();
  sgFS(c, sgGrad(c, ch.x, ch.y - 30, ch.x, ch.y + 16, '#fff3c8', '#e0a62b'));
  c.save(); c.clip(); c.strokeStyle = 'rgba(11,20,38,.38)'; c.lineWidth = 1.1; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(ch.x + i * 6 - 12, ch.y - 30); c.lineTo(ch.x + i * 6 + 12, ch.y + 14); c.stroke(); c.beginPath(); c.moveTo(ch.x + i * 6 + 12, ch.y - 30); c.lineTo(ch.x + i * 6 - 12, ch.y + 14); c.stroke(); } c.restore();
  c.beginPath(); c.ellipse(ch.x - 14, ch.y - 10, 5, 10, -0.2, 0, 6.3); sgFS(c, '#e0a62b', 1.6);                         // thumb
  sgRR(c, ch.x - 13, ch.y + 10, 27, 9, 4); sgFS(c, '#111827', 1.4);
  // head: painted mask with a cage, a hanging throat guard
  sgRR(c, -8, -126, 16, 12, 4); sgFS(c, '#eef2f7', 1.8);
  c.beginPath(); c.ellipse(0, -136, 18, 20, 0, 0, 6.3); sgFS(c, sgGrad(c, -18, -150, 18, -118, '#ffffff', '#c9d1de'));
  c.save(); c.beginPath(); c.ellipse(0, -136, 18, 20, 0, 0, 6.3); c.clip();
  c.fillStyle = pal.main; c.beginPath(); c.moveTo(-20, -142); c.quadraticCurveTo(0, -166, 20, -142); c.lineTo(20, -156); c.lineTo(-20, -156); c.closePath(); c.fill();
  c.fillStyle = pal.dark; c.beginPath(); c.moveTo(-20, -134); c.quadraticCurveTo(-12, -150, -2, -148); c.quadraticCurveTo(-12, -140, -14, -126); c.closePath(); c.fill(); c.beginPath(); c.moveTo(20, -134); c.quadraticCurveTo(12, -150, 2, -148); c.quadraticCurveTo(12, -140, 14, -126); c.closePath(); c.fill();
  c.fillStyle = pal.trim; c.fillRect(-20, -143, 40, 2.2); c.restore();
  c.beginPath(); c.ellipse(0, -136, 18, 20, 0, 0, 6.3); c.lineWidth = 2; c.strokeStyle = SG_INK; c.stroke();
  sgRR(c, -11.5, -141, 23, 26, 9); c.fillStyle = 'rgba(10,18,32,.82)'; c.fill();
  c.fillStyle = '#fff'; for (const ex of [-4.8, 4.8]) { c.beginPath(); c.ellipse(ex, -132, 2.6, 2.1, 0, 0, 6.3); c.fill(); } c.fillStyle = '#0b1426'; for (const ex of [-4.2, 5.4]) { c.beginPath(); c.arc(ex + (dir * 0.8), -132, 1.2, 0, 6.3); c.fill(); }
  c.strokeStyle = '#d7dde7'; c.lineWidth = 1.4; for (const o of [-7, -3.5, 0, 3.5, 7]) { c.beginPath(); c.moveTo(o, -141); c.lineTo(o * .8, -115); c.stroke(); } for (const yy of [-134, -124]) { c.beginPath(); c.moveTo(-11, yy); c.lineTo(11, yy); c.stroke(); }
  sgRR(c, -11.5, -141, 23, 26, 9); c.lineWidth = 2.2; c.strokeStyle = '#c3ccd9'; c.stroke();
  c.restore();
}

/* The shooter, seen from behind: skate stride on the way in, wind-up, then the swing. */
function sgDrawSkater(c, x, y, s, wind, dir, shot, pal, name, stride, bl, skating, T) {
  c.save(); c.translate(x, y); c.scale(s, s); c.rotate(dir * wind * 0.05 - dir * shot * 0.06 + (skating ? Math.sin(stride * 11) * 0.03 : 0));
  c.fillStyle = 'rgba(15,23,42,.22)'; c.beginPath(); c.ellipse(0, 3, 38, 8, 0, 0, 6.3); c.fill();
  const ph = skating ? stride * 11 : 0;
  for (const sx of [-1, 1]) {                                                                   // legs: knees bent, feet apart, skates with blades
    const sw = skating ? Math.sin(ph + (sx > 0 ? 0 : Math.PI)) : 0, lift = Math.max(0, sw) * 6, ax = sx * 17 + sw * 4, ay = -9 - lift;
    sgLimb(c, sx * 9, -58, sx * 22 + sw * 2, -34 - lift * .4, 17, pal.dark);          // thigh
    sgLimb(c, sx * 22 + sw * 2, -34 - lift * .4, ax, ay - 3, 13, '#e8edf5');          // shin and sock
    sgRR(c, ax - 10, ay - 6, 21, 12, 5); sgFS(c, '#111827');                          // boot
    c.fillStyle = '#d5dde8'; c.beginPath(); c.roundRect(ax - 14, ay + 6, 29, 3.5, 2); c.fill(); c.lineWidth = 1.3; c.strokeStyle = SG_INK; c.stroke();      // blade
  }
  c.beginPath(); c.moveTo(-21, -52); c.lineTo(-27, -96); c.quadraticCurveTo(0, -108, 27, -96); c.lineTo(21, -52); c.closePath(); sgFS(c, sgGrad(c, -27, -100, 27, -52, pal.light, pal.main, pal.dark));       // jersey back
  c.fillStyle = pal.trim; c.fillRect(-21, -58, 42, 4); c.fillStyle = pal.dark; c.fillRect(-22, -64, 44, 3);
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '800 9px Inter, system-ui, sans-serif'; c.fillText(String(name || '').toUpperCase().slice(0, 9), 0, -90);
  c.font = '900 28px Inter, system-ui, sans-serif'; c.lineWidth = 3; c.strokeStyle = pal.dark; c.strokeText('7', 0, -73); c.fillText('7', 0, -73); c.textAlign = 'start';
  const H = { x: 12, y: -62 }, B = bl, L = { x: H.x + (B.x - H.x) * 0.45, y: H.y + (B.y - H.y) * 0.45 }, ex = H.x + (H.x - B.x) * 0.1, ey = H.y + (H.y - B.y) * 0.1;
  sgLimb(c, -25, -94, -32, -72, 11, pal.main); sgLimb(c, -32, -72, H.x, H.y, 10, pal.main);       // top hand arm
  c.lineCap = 'round'; c.strokeStyle = SG_INK; c.lineWidth = 7; c.beginPath(); c.moveTo(ex, ey); c.lineTo(B.x, B.y); c.stroke(); c.strokeStyle = '#2b3445'; c.lineWidth = 4.2; c.stroke(); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(ex - 1, ey); c.lineTo(B.x - 1, B.y); c.stroke();      // shaft
  c.strokeStyle = '#f8fafc'; c.lineWidth = 5; c.beginPath(); c.moveTo(ex, ey); c.lineTo(H.x, H.y); c.stroke();      // tape on the butt end
  c.beginPath(); c.moveTo(B.x - 6, B.y - 3); c.lineTo(B.x + 14, B.y - 9); c.quadraticCurveTo(B.x + 20, B.y - 9, B.x + 19, B.y - 3); c.lineTo(B.x - 1, B.y + 4); c.closePath(); sgFS(c, '#1f2937', 1.8);        // curved blade
  c.fillStyle = '#f8fafc'; c.beginPath(); c.moveTo(B.x + 2, B.y - 3); c.lineTo(B.x + 14, B.y - 7); c.lineTo(B.x + 15, B.y - 4.5); c.lineTo(B.x + 4, B.y - 0.5); c.closePath(); c.fill();
  sgLimb(c, 26, -94, 42, -76, 11, pal.main); sgLimb(c, 42, -76, L.x, L.y, 10, pal.main);           // lower hand arm
  for (const g of [H, L]) { c.beginPath(); c.arc(g.x, g.y, 6.2, 0, 6.3); sgFS(c, '#1f2937', 1.6); }      // gloves
  sgRR(c, -7, -108, 14, 12, 4); sgFS(c, '#e2c9a8');                                             // neck
  c.fillStyle = '#4a2f1a'; c.beginPath(); c.ellipse(0, -107, 13, 7, 0, 0, 6.3); c.fill();      // hair at the back of the neck
  c.beginPath(); c.arc(0, -118, 14, 0, 6.3); sgFS(c, sgGrad(c, -12, -132, 12, -104, '#f8fafc', '#aeb9c9'));      // helmet
  c.beginPath(); c.arc(0, -118, 14, Math.PI * 1.1, Math.PI * 1.9); c.closePath(); c.fillStyle = pal.main; c.fill();
  c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(-5, -124, 4, 2.2, -.5, 0, 6.3); c.fill();
  sgRR(c, -15, -118, 5, 11, 2); sgFS(c, '#94a3b8', 1.4); sgRR(c, 10, -118, 5, 11, 2); sgFS(c, '#94a3b8', 1.4);   // ear guards
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
const sgPicker = label => `<p class="sg-say">${label}</p><div class="sg-picks">${Object.entries(SG_DIRS).map(([k, v]) => `<button type="button" class="btn sg-pick" data-sg="pick" data-dir="${k}">${k === 'L' ? '◀ ' : ''}${v}${k === 'R' ? ' ▶' : ''}</button>`).join('')}</div>`;
const sgInviteLink = () => location.href.split('#')[0] + '#/resources?join=' + (SG.net ? SG.net.code : '');

function sgRender() {
  const root = document.getElementById('sg'); if (!root) return;
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
  if (q && SG.screen === 'menu') { SG.join = q[1].toUpperCase(); setTimeout(() => sgStart('online'), 0); } else setTimeout(sgRender, 0);
  return `<h1>Resources</h1><p class="lead">Extras for the league.</p><div id="sg" class="sg"></div>`;
};
window.addEventListener('hashchange', () => { if (!/^#\/(resources|games)/.test(location.hash) && (SG.net || SG.screen !== 'menu')) { sgNetEnd(); Object.assign(SG, { screen: 'menu', msg: '' }); } });
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
