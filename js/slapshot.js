/* Slap Shot (part of the Resources page): a timing game. A crosshair sweeps back and forth across the net, faster with every shot. Tap to shoot
   where it is. Corner targets are worth 5, the middle 2, anywhere else in the net 1. The goalie reads your aim and lunges at it, and gets sharper as
   the shots go on, so a saved shot scores nothing. A miss, a post or a shot over the bar scores nothing either. 10 shots.
   Play alone (your best score is kept in this browser) or two players taking turns on one screen. It shares the arena, goalie and skater of the Shootout. */

const SP = { screen: 'menu', mode: 'solo', names: ['', ''], turn: 0, k: [0, 0], score: [0, 0], log: [[], []], phase: 'aim', aim0: 0, ph: [0, 0], shot: null, show: true, timers: [] };
const SP_SHOTS = 10, SP_NET = { x: 240, gy: 216, W: 200, H: 96 };
const SP_TARGETS = [[-74, 24, 5, 18], [74, 24, 5, 18], [-74, 74, 5, 18], [74, 74, 5, 18], [0, 48, 2, 18]];       // [dx from the middle, dy below the crossbar, points, radius]
const spRec = {
  get() { try { return JSON.parse(localStorage.getItem('bhl_slapshot') || '{"best":0,"games":0}'); } catch { return { best: 0, games: 0 }; } },
  add(score) { const r = spRec.get(); r.games++; if (score > r.best) r.best = score; try { localStorage.setItem('bhl_slapshot', JSON.stringify(r)); } catch { } return r; },
};
const spName = i => SP.names[i] || (i ? 'Player 2' : 'Player 1');
const spLater = (fn, ms) => { const t = setTimeout(fn, ms); SP.timers.push(t); return t; };
const spClear = () => { SP.timers.forEach(clearTimeout); SP.timers = []; };
const spGauss = sd => sd * (Math.random() + Math.random() + Math.random() - 1.5) * 1.6;

/* ---------- game flow ---------- */
function spStart(mode) {
  const first = (D.members[0] || {}).short_name || 'You', second = (D.members[1] || {}).short_name || 'Player 2';
  Object.assign(SP, { screen: 'setup', mode, names: [SP.names[0] || first, mode === 'solo' ? '' : (SP.names[1] || second)] }); spRender();
}
function spBegin() {
  spClear(); Object.assign(SP, { screen: 'play', turn: 0, k: [0, 0], score: [0, 0], log: [[], []], shot: null, show: true });
  spNewAim(); spRender();
}
function spNewAim() { SP.phase = 'aim'; SP.shot = null; SP.show = true; SP.aim0 = performance.now(); SP.ph = [Math.random() * 6.28, Math.random() * 6.28]; }
/* Where the crosshair is, in canvas coordinates. It speeds up with every shot of the current player. */
function spAimAt(now) {
  const sp = 1 + 0.09 * SP.k[SP.turn], t = (now - SP.aim0) / 1000;
  return { x: SP_NET.x + 112 * Math.sin(1.45 * sp * t + SP.ph[0]), y: SP_NET.gy - 48 + 60 * Math.sin(1.9 * sp * t + SP.ph[1]) };
}
function spScoreFor(x, y) {
  const L = SP_NET.x - SP_NET.W / 2, R = SP_NET.x + SP_NET.W / 2, top = SP_NET.gy - SP_NET.H;
  if (y < top - 8 || x < L - 14 || x > R + 14) return { out: 'WIDE', pts: 0, goal: false };
  const post = Math.abs(x - L) < 7 || Math.abs(x - R) < 7 || Math.abs(y - top) < 6; if (post) return { out: 'POST!', pts: 0, goal: false };
  if (x < L || x > R || y < top) return { out: 'WIDE', pts: 0, goal: false };
  for (const [dx, dy, pts, r] of SP_TARGETS) if (Math.hypot(x - (SP_NET.x + dx), y - (top + dy)) <= r) return { out: `GOAL! +${pts}`, pts, goal: true, bonus: pts };
  return { out: 'GOAL! +1', pts: 1, goal: true };
}
function spShoot() {
  if (SP.screen !== 'play' || SP.phase !== 'aim') return;
  const now = performance.now(), a = spAimAt(now), res = spScoreFor(a.x, Math.min(a.y, SP_NET.gy - 3)), k = SP.k[SP.turn];
  const sd = Math.max(52, 76 - 2.7 * k), tx = a.x + spGauss(sd), ty = Math.min(a.y, SP_NET.gy - 3) + spGauss(sd * 0.7);       // the goalie reads the aim, with an error that shrinks as the shots go on
  const saved = res.goal && Math.hypot(a.x - tx, Math.min(a.y, SP_NET.gy - 3) - ty) < 27;
  SP.shot = { t0: now, x: a.x, y: Math.min(a.y, SP_NET.gy - 3), tx, ty, saved, out: saved ? 'SAVED!' : res.out, pts: saved ? 0 : res.pts, goal: res.goal && !saved, kind: saved ? 'save' : res.goal ? 'goal' : res.out === 'POST!' ? 'post' : 'wide', player: SP.turn, done: false };
  SP.phase = 'shot'; SP.show = false; sgSound('shot'); spRender();
}
function spDone() {                                   // the animation has played: add the points and move on
  const s = SP.shot; if (!s || s.done) return; s.done = true;
  SP.score[s.player] += s.pts; SP.log[s.player].push(s.pts > 0 ? s.pts : s.kind === 'save' ? 's' : 'x'); SP.k[s.player]++; SP.show = true;
  const r = document.getElementById('sg'); const bd = r && r.querySelector('.sg-board'); if (bd) bd.outerHTML = spBoard();
  spLater(spNext, 500);
}
function spNext() {
  if (SP.screen !== 'play') return;
  if (SP.mode === 'two') SP.turn = 1 - SP.turn;
  if (SP.k[0] >= SP_SHOTS && (SP.mode === 'solo' || SP.k[1] >= SP_SHOTS)) { SP.screen = 'end'; if (SP.mode === 'solo') SP.rec = spRec.add(SP.score[0]); spRender(); return; }
  spNewAim(); spRender();
}

/* ---------- drawing ---------- */
const SPA = { cv: null, ctx: null, raf: 0, k: 1, t0: 0 };
function spAttach(cv) {
  SPA.cv = cv; const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth || 480;
  cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr * SGA.H / SGA.W); SPA.ctx = cv.getContext('2d'); SPA.k = cv.width / SGA.W; SPA.t0 = performance.now();
  spFrame(performance.now()); if (!SPA.raf) SPA.raf = requestAnimationFrame(spLoop);
}
function spLoop(now) { if (!SPA.cv || !document.body.contains(SPA.cv)) { SPA.raf = 0; SPA.cv = null; return; } spFrame(now); SPA.raf = requestAnimationFrame(spLoop); }

function spFrame(now) {
  const c = SPA.ctx; if (!c) return; const T = (now - SPA.t0) / 1000, S = SP.shot, u = S ? (now - S.t0) / 1000 : -1, N = SP_NET, gx = N.x, gy = N.gy, W = N.W, Hn = N.H;
  c.setTransform(SPA.k, 0, 0, SPA.k, 0, 0); c.clearRect(0, 0, SGA.W, SGA.H);
  const arrive = 0.62, after = S ? u - arrive : -1, goal = S && S.goal, shake = goal && after > 0 && after < 0.3 ? Math.sin(after * 90) * 3 * (1 - after / 0.3) : 0;
  c.save(); c.translate(shake, 0);
  sgArena(c, T, S ? { goal: !!goal } : null, goal ? after : -1, 1, gy, 0);
  // net, with a bulge where a goal went in
  const bulge = goal && after > 0 ? Math.sin(after * 22) * 12 * Math.max(0, 1 - after / 0.9) : 0, bx = S ? S.x : gx;
  c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(gx - W / 2, gy - Hn, W, Hn); c.strokeStyle = 'rgba(60,80,110,.5)'; c.lineWidth = 1;
  for (let i = 0; i <= 16; i++) { const x = gx - W / 2 + i * W / 16, d = Math.max(0, 1 - Math.abs(x - bx) / (W * 0.35)) * bulge; c.beginPath(); c.moveTo(x, gy - Hn); c.lineTo(x + d * 0.4, gy); c.stroke(); }
  for (let i = 0; i <= 8; i++) { const y = gy - Hn + i * Hn / 8; c.beginPath(); c.moveTo(gx - W / 2, y); for (let x = 0; x <= W; x += 8) { const d = Math.max(0, 1 - Math.abs(gx - W / 2 + x - bx) / (W * 0.35)) * bulge; c.lineTo(gx - W / 2 + x, y + d * 0.6); } c.stroke(); }
  // goalie: waits, then lunges at where he read the aim
  const dv = S ? sgEase(sgClamp(u, 0.1, 0.62)) : 0, tgx = S ? Math.max(gx - 62, Math.min(gx + 62, S.tx)) : gx, dirX = !S ? 0 : Math.abs(tgx - gx) < 24 ? 0 : tgx > gx ? 1 : -1;
  sgDrawGoalie(c, gx + (tgx - gx) * dv + (S ? 0 : Math.sin(T * 1.8) * 5), gy - 2, 0.7, dirX * 0.8 * dv, dv, dirX, SG_TEAM[1 - SP.turn], null, T);
  // targets
  const top = gy - Hn; for (const [dx, dy, pts, r] of SP_TARGETS) { const hit = S && S.goal && after > 0 && Math.hypot(S.x - (gx + dx), S.y - (top + dy)) <= r; c.fillStyle = hit ? 'rgba(19,122,53,.55)' : pts === 5 ? 'rgba(245,179,1,.35)' : 'rgba(37,99,235,.2)'; c.beginPath(); c.arc(gx + dx, top + dy, r, 0, 6.3); c.fill(); c.lineWidth = 2; c.strokeStyle = pts === 5 ? '#d99a00' : '#2563eb'; c.stroke(); c.fillStyle = '#0b1f44'; c.font = '800 12px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(pts), gx + dx, top + dy + 0.5); c.textAlign = 'start'; }
  c.lineCap = 'round'; c.lineJoin = 'round'; for (const [lw, col] of [[11, SG_INK], [8, '#d62828']]) { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(gx - W / 2, gy); c.lineTo(gx - W / 2, gy - Hn); c.lineTo(gx + W / 2, gy - Hn); c.lineTo(gx + W / 2, gy); c.stroke(); }
  const lit = goal && after > 0 && Math.floor(after * 6) % 2 === 0; if (lit) { c.fillStyle = '#ff2d2d'; c.beginPath(); c.arc(gx, gy - Hn - 14, 6, 0, 6.3); c.fill(); c.lineWidth = 1.5; c.strokeStyle = SG_INK; c.stroke(); c.fillStyle = 'rgba(255,45,45,.25)'; c.beginPath(); c.arc(gx, gy - Hn - 14, 18, 0, 6.3); c.fill(); }
  // shooter
  const wind = S ? sgClamp(u, 0, 0.18) : 0, swing = S ? sgClamp(u, 0.18, 0.42) : 0, bl = { x: 50 + (S ? 0 : Math.sin(T * 1.5) * 3) - swing * 6, y: -3 + wind * 8 - swing * 22 };
  const pal = SG_TEAM[SP.turn], skx = 240, bladeX = skx + (bl.x + 12) * 0.84, bladeY = SG_FEET + bl.y * 0.84;
  sgDrawSkater(c, skx, SG_FEET - Math.sin(T * 2) * 0.8, 0.84, wind, 0, swing, pal, String(spName(SP.turn)).toUpperCase().slice(0, 8), 0, bl, false, T);
  // puck
  let px = bladeX, py = bladeY, pr = 7, vis = true;
  if (S && u > 0.3) {
    const q = sgOut(sgClamp(u, 0.3, arrive)), sx = bladeX, sy = SG_FEET - 6; px = sx + (S.x - sx) * q; py = sy + (S.y - sy) * q - Math.sin(q * Math.PI) * 14; pr = 7 - 3 * q;
    if (q > .1 && u < arrive + 0.05) { c.strokeStyle = 'rgba(15,23,42,.25)'; c.lineWidth = pr * 1.4; c.lineCap = 'round'; const q2 = Math.max(0, q - .25); c.beginPath(); c.moveTo(sx + (S.x - sx) * q2, sy + (S.y - sy) * q2 - Math.sin(q2 * Math.PI) * 14); c.lineTo(px, py); c.stroke(); }
    if (u > arrive) { if (S.kind === 'goal') { px = S.x; py = S.y + Math.min(0.5, after) * 22; pr = 4; } else if (S.kind === 'save') { const d = (S.x >= gx ? 1 : -1); px = S.x + d * after * 90; py = S.y + 120 * after * after - after * 50; pr = 4 + after * 3; vis = after < 0.9; } else if (S.kind === 'post') { const d = (S.x >= gx ? 1 : -1); px = S.x + d * after * 70; py = S.y + 140 * after * after - after * 70; vis = after < 0.8; } else { px = S.x + (S.x >= gx ? 1 : -1) * after * 50; py = S.y - after * 30; pr = 4 - Math.min(2, after * 3); vis = after < 0.7; } }
  } else if (S) { px = bladeX; py = bladeY; }
  else { px = bladeX; py = bladeY; }
  if (vis) { c.fillStyle = '#0b1426'; c.beginPath(); c.ellipse(px, py, pr, pr * .6, 0, 0, 6.3); c.fill(); c.fillStyle = '#334155'; c.beginPath(); c.ellipse(px, py - pr * .25, pr, pr * .45, 0, 0, 6.3); c.fill(); }
  // crosshair while aiming
  if (!S && SP.screen === 'play') { const a = spAimAt(now); c.strokeStyle = '#c1272d'; c.lineWidth = 2.4; c.beginPath(); c.arc(a.x, a.y, 11, 0, 6.3); c.moveTo(a.x - 18, a.y); c.lineTo(a.x - 5, a.y); c.moveTo(a.x + 5, a.y); c.lineTo(a.x + 18, a.y); c.moveTo(a.x, a.y - 18); c.lineTo(a.x, a.y - 5); c.moveTo(a.x, a.y + 5); c.lineTo(a.x, a.y + 18); c.stroke(); c.fillStyle = 'rgba(193,39,45,.2)'; c.beginPath(); c.arc(a.x, a.y, 11, 0, 6.3); c.fill(); }
  // ice spray and confetti
  if (S && !S.sprayed && u > arrive) { S.sprayed = true; sgBurst({ goal: S.goal }, S.x >= gx ? 1 : -1); }
  for (let i = SGA.parts.length - 1; i >= 0; i--) { const q = SGA.parts[i]; q.life -= 1 / 60; if (q.life <= 0) { SGA.parts.splice(i, 1); continue; } q.x += q.vx / 60; q.y += q.vy / 60; q.vy += (q.spray ? 120 : 160) / 60; c.globalAlpha = Math.min(1, q.life * 2); c.fillStyle = q.c || '#fff'; if (q.spray) c.fillRect(q.x, q.y, 2.2, 2.2); else { c.save(); c.translate(q.x, q.y); c.rotate(q.life * 9 + i); c.fillRect(-3, -2, 6, 4); c.restore(); } c.globalAlpha = 1; }
  // result banner
  if (S && after > 0) {
    const a = sgOut(after * 3), fade = after < 1.0 ? 1 : Math.max(0, 1 - (after - 1.0) * 3), good = S.goal;
    c.save(); c.globalAlpha = fade; c.translate(240, 150); c.scale(.6 + .5 * a, .6 + .5 * a); c.rotate(-0.05); c.font = '900 46px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 8; c.lineJoin = 'round'; c.strokeStyle = '#fff'; c.strokeText(S.out, 0, 0); c.fillStyle = good ? '#137a35' : '#c1272d'; c.fillText(S.out, 0, 0); c.restore(); c.textAlign = 'start';
    if (!S.sounded) { S.sounded = true; sgSound(S.kind === 'save' ? 'save' : S.kind === 'goal' ? 'goal' : 'post'); }
    if (!S.done && after > 0.75) spDone();
  }
  c.restore();
}

/* ---------- screens ---------- */
function spBoard() {
  const sides = SP.mode === 'solo' ? [0] : [0, 1], hide = SP.phase === 'shot' && !SP.show;
  return `<div class="sg-board" ${SP.mode === 'solo' ? 'style="grid-template-columns:1fr"' : ''}>${sides.map(i => `<div class="sg-side ${SP.screen === 'play' && SP.turn === i ? 'on' : ''}"><b>${esc(spName(i))}</b><span class="sg-num">${SP.score[i]}</span><div class="sg-dots" aria-label="shots">${Array.from({ length: SP_SHOTS }, (_, k) => { const r = SP.log[i][k]; return `<span class="sg-dot ${typeof r === 'number' ? 'g' : r === 's' ? 's' : ''}">${typeof r === 'number' ? r : r === 's' ? '✕' : r === 'x' ? '–' : '○'}</span>`; }).join('')}</div></div>`).join('')}</div>`;
}
function spRender() {
  const root = document.getElementById('sg'); if (!root) return;
  const rec = spRec.get(), nameBox = (id, label, val) => `<label class="f">${label}<input id="${id}" list="sg-names" value="${esc(val)}" maxlength="20" autocomplete="off"></label>`;
  const dl = `<datalist id="sg-names">${D.members.map(m => `<option value="${esc(m.short_name)}">`).join('')}</datalist>`;
  if (SP.screen === 'menu') {
    root.innerHTML = `<section class="card"><button class="link" data-res="list" type="button">← All games</button><h2 style="margin-top:8px">Slap Shot</h2><p class="muted">A crosshair sweeps across the net and speeds up with every shot. <b>Tap to shoot where it is.</b> Corner targets are worth 5, the middle 2, anywhere else in the net 1. The goalie reads your aim and gets sharper as you go, so he can still save it. ${SP_SHOTS} shots.</p>
      <div class="btnrow"><button class="btn" data-sp="start" data-mode="solo">Play solo</button><button class="btn ghost" data-sp="start" data-mode="two">Two players, one screen</button></div>
      ${rec.games ? `<p class="muted" style="margin:12px 0 0">Your best score: <b>${rec.best}</b> · games played ${rec.games}</p>` : ''}</section>`;
    return;
  }
  if (SP.screen === 'setup') {
    root.innerHTML = `<section class="card"><h2 style="margin-top:4px">${SP.mode === 'solo' ? 'Slap Shot' : 'Slap Shot: two players'}</h2><form class="form" onsubmit="return false">${nameBox('sp-n0', SP.mode === 'solo' ? 'Your name' : 'Player 1', SP.names[0])}${SP.mode === 'solo' ? '' : `${nameBox('sp-n1', 'Player 2', SP.names[1])}<p class="muted" style="margin:0">You take turns, ${SP_SHOTS} shots each. Highest score wins.</p>`}${dl}
      <div class="btnrow"><button class="btn" data-sp="go" type="button">Shoot</button><button class="btn ghost" data-sp="menu" type="button">Back</button></div></form></section>`;
    return;
  }
  if (SP.screen === 'end') {
    const solo = SP.mode === 'solo', w = SP.score[0] === SP.score[1] ? -1 : SP.score[0] > SP.score[1] ? 0 : 1, accu = i => SP.log[i].filter(x => typeof x === 'number').length;
    const head = solo ? `${SP.score[0]} points` : w < 0 ? 'A tie!' : `${spName(w)} wins!`;
    root.innerHTML = `${spBoard()}<section class="card sg-end"><h2 style="margin-top:4px">${esc(head)}</h2><p class="muted">${solo ? `${accu(0)} goals from ${SP_SHOTS} shots, out of a possible ${SP_SHOTS * 5}. ${SP.score[0] >= (SP.rec ? SP.rec.best : 0) ? 'That is your best score!' : `Your best is ${SP.rec ? SP.rec.best : 0}.`}` : `${esc(spName(0))} ${SP.score[0]} (${accu(0)} goals), ${esc(spName(1))} ${SP.score[1]} (${accu(1)} goals).`}</p>
      <div class="btnrow"><button class="btn" data-sp="go">Play again</button><button class="btn ghost" data-sp="menu">Back to games</button></div></section>`;
    return;
  }
  const shotNo = SP.k[SP.turn] + (SP.phase === 'shot' && !SP.shot.done ? 1 : 1);
  root.innerHTML = `${spBoard()}<div class="sg-scene"><canvas id="sg-cv" class="sg-cv" data-sp="shoot" aria-label="Net with a moving crosshair" role="img"></canvas></div><div class="sg-ctl"><p class="muted sg-meta">Shot ${Math.min(SP_SHOTS, SP.k[SP.turn] + 1)} of ${SP_SHOTS}${SP.mode === 'two' ? ` · ${esc(spName(SP.turn))}` : ''}</p>
    <button type="button" class="btn fo-tap" data-sp="shoot" ${SP.phase === 'aim' ? '' : 'disabled'}>SHOOT!</button><p class="muted sg-wait" style="margin-top:8px">Tap the button, the rink, or press Space when the crosshair is on a target.</p>
    <button type="button" class="link sg-snd" data-sp="sound">Sound: ${SGA.sound ? 'on' : 'off'}</button></div>`;
  spAttach(document.getElementById('sg-cv'));
}

function spReset() { spClear(); Object.assign(SP, { screen: 'menu', phase: 'aim', shot: null, show: true }); }
window.addEventListener('hashchange', () => { if (!/^#\/(resources|games)/.test(location.hash) && SP.screen !== 'menu') spReset(); });
document.addEventListener('keydown', e => {
  if (RES.game !== 'slapshot' || SP.screen !== 'play' || e.repeat || (typeof BOSS !== 'undefined' && BOSS.on) || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); spShoot(); }
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-sp]'); if (!b || !document.getElementById('sg') || RES.game !== 'slapshot') return;
  const a = b.dataset.sp;
  if (a === 'start') spStart(b.dataset.mode);
  else if (a === 'menu') { spReset(); spRender(); }
  else if (a === 'go') { if (SP.screen === 'setup') { const clean = v => String(v || '').replace(/[<>]/g, '').trim().slice(0, 20), n0 = clean(document.getElementById('sp-n0').value), n1 = document.getElementById('sp-n1'); SP.names = [n0 || 'Player 1', SP.mode === 'solo' ? '' : (clean(n1 && n1.value) || 'Player 2')]; if (SP.mode === 'two' && SP.names[0] === SP.names[1]) SP.names[1] += ' 2'; } spBegin(); }
  else if (a === 'shoot') spShoot();
  else if (a === 'sound') { SGA.sound = !SGA.sound; try { localStorage.setItem('bhl_sg_sound', SGA.sound ? '1' : '0'); } catch { } b.textContent = SGA.sound ? 'Sound: on' : 'Sound: off'; if (SGA.sound) sgSound('save'); }
});
