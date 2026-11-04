/* Mini games (#/games). The first game is a penalty shootout: the shooter picks left, middle or right and the goalie does the same.
   Same pick = saved, different pick = goal. Five shots each, then sudden death. Play against the computer or a friend on the same screen.
   Nothing here is saved to the league data; only a win-loss record against the computer is kept in this browser. */
PAGES.push(['games', 'Mini games']);

const SG_DIRS = { L: 'Left', M: 'Middle', R: 'Right' }, SG_X = { L: -92, M: 0, R: 92 }, SG_ROUNDS = 5;
const SG = { screen: 'menu', mode: 'bot', names: ['', ''], score: [0, 0], log: [[], []], n: 0, phase: 'shooter', shot: null, res: null, winner: -1 };
const sgRandom = () => 'LMR'[Math.floor(Math.random() * 3)];
const sgRecord = {
  get() { try { return JSON.parse(localStorage.getItem('bhl_shootout') || '{"w":0,"l":0}'); } catch { return { w: 0, l: 0 }; } },
  add(win) { const r = sgRecord.get(); win ? r.w++ : r.l++; try { localStorage.setItem('bhl_shootout', JSON.stringify(r)); } catch { } },
};
const sgShooter = () => SG.n % 2, sgGoalie = () => 1 - (SG.n % 2), sgName = i => SG.names[i] || (i ? 'Player 2' : 'Player 1');
const sgBotIs = i => SG.mode === 'bot' && i === 1;                       // in the computer game the computer is always player 2

function sgStart(mode) {
  const first = (D.members[0] || {}).short_name || 'You', second = (D.members[1] || {}).short_name || 'Player 2';
  Object.assign(SG, { screen: 'setup', mode, names: [SG.names[0] || first, mode === 'bot' ? 'Computer' : (SG.names[1] && SG.names[1] !== 'Computer' ? SG.names[1] : second)] });
  sgRender();
}
function sgBegin() {
  Object.assign(SG, { screen: 'play', score: [0, 0], log: [[], []], n: 0, shot: null, res: null, winner: -1 });
  sgNextPhase(); sgRender();
}
function sgNextPhase() {
  SG.shot = {}; SG.res = null;
  if (sgBotIs(sgShooter())) { SG.shot.shoot = sgRandom(); SG.phase = 'goalie'; } else SG.phase = 'shooter';       // the computer shoots: its pick stays hidden and you dive first
}
function sgPick(dir) {
  const s = sgShooter(), g = sgGoalie();
  if (SG.phase === 'shooter') {
    SG.shot.shoot = dir;
    if (sgBotIs(g)) { SG.shot.dive = sgRandom(); return sgReveal(); }
    SG.phase = 'pass';
  } else if (SG.phase === 'goalie') { SG.shot.dive = dir; return sgReveal(); }
  sgRender();
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
  const w = sgOver();
  if (w >= 0) { SG.winner = w; SG.screen = 'end'; if (SG.mode === 'bot') sgRecord.add(w === 0); return sgRender(); }
  SG.n++; sgNextPhase(); sgRender();
}

const sgHide = () => SG.screen === 'play' && SG.phase === 'reveal' && !SG.done;       // while the shot plays out, the board must not give the result away
const sgLog = i => (sgHide() && i === sgShooter() ? SG.log[i].slice(0, -1) : SG.log[i]);
function sgDots(i) {
  const total = Math.max(SG_ROUNDS, SG.log[0].length, SG.log[1].length), L = sgLog(i);
  return Array.from({ length: total }, (_, k) => { const r = L[k]; return `<span class="sg-dot ${r === 'G' ? 'g' : r === 'S' ? 's' : ''}">${r === 'G' ? '●' : r === 'S' ? '✕' : '○'}</span>`; }).join('');
}
function sgBoard() {
  const s = sgShooter(), live = SG.screen === 'play';
  return `<div class="sg-board">${[0, 1].map(i => `<div class="sg-side ${live && s === i ? 'on' : ''}"><b>${esc(sgName(i))}</b><span class="sg-num">${SG.score[i] - (sgHide() && i === s && SG.res && SG.res.goal ? 1 : 0)}</span><div class="sg-dots" aria-label="shots">${sgDots(i)}</div></div>`).join('')}</div>`;
}
const sgPicker = label => `<p class="sg-say">${label}</p><div class="sg-picks">${Object.entries(SG_DIRS).map(([k, v]) => `<button type="button" class="btn sg-pick" data-sg="pick" data-dir="${k}">${k === 'L' ? '◀ ' : ''}${v}${k === 'R' ? ' ▶' : ''}</button>`).join('')}</div>`;


/* ---------- the rink: a canvas animation (skate in, wind up, shoot, dive, goal or save) ---------- */
const SGA = {
  W: 480, H: 300, cv: null, ctx: null, raf: 0, t0: 0, play: null, idle: 0, sound: (() => { try { return localStorage.getItem('bhl_sg_sound') === '1'; } catch { return false; } })(),
  crowd: Array.from({ length: 150 }, (_, i) => ({ x: (i % 50) * 9.8 + 5 + ((i % 3) - 1) * 1.5, r: Math.floor(i / 50), c: ['#c1272d', '#1d4ed8', '#f5b301', '#e5e7eb', '#13306b', '#8cc63f'][(i * 7) % 6], ph: (i * 1.7) % 6.28 })),
  parts: [], audio: null,
};
const sgEase = t => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t)), sgOut = t => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3, sgClamp = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
function sgSound(kind) {
  if (!SGA.sound) return;
  try {
    const A = SGA.audio ||= new (window.AudioContext || window.webkitAudioContext)(), t = A.currentTime, g = A.createGain(); g.connect(A.destination);
    const tone = (type, f0, f1, dur, vol) => { const o = A.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); const gg = A.createGain(); gg.gain.setValueAtTime(vol, t); gg.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(gg); gg.connect(A.destination); o.start(t); o.stop(t + dur); };
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
function sgRun(info, done) {        // info: { shoot, dive, goal, shooter } ; done() is called when the controls may appear
  const fast = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.35 : 1;
  SGA.play = { ...info, t: 0, start: performance.now(), fast, done, finished: false, spoke: 0 }; SGA.parts = [];
  sgSound('skate');
}
function sgSkip() { const p = SGA.play; if (p && !p.finished) { p.start -= 4000; } }

function sgFrame(now) {
  const c = SGA.ctx; if (!c) return;
  const k = SGA.k, T = (now - SGA.t0) / 1000, P = SGA.play, pt = P ? (now - P.start) / 1000 / P.fast : 0;
  c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, SGA.W, SGA.H);
  // timeline
  const z = P ? sgEase(sgClamp(pt, 0, 1.0)) : 0, wind = P ? sgClamp(pt, 1.0, 1.3) : 0, shot = P ? sgClamp(pt, 1.3, 1.75) : 0, after = P ? pt - 1.75 : -1;
  const shootX = P ? { L: -1, M: 0, R: 1 }[P.shoot] : 0, diveX = P ? { L: -1, M: 0, R: 1 }[P.dive] : 0;
  if (P && !P.spoke && pt >= 1.3) { P.spoke = 1; sgSound('shot'); }
  if (P && P.spoke === 1 && pt >= 1.75) { P.spoke = 2; sgSound(P.goal ? 'goal' : 'save'); sgBurst(P, shootX, z); }
  if (P && !P.finished && pt >= 2.5) { P.finished = true; P.done && P.done(); }
  const gs = 0.55 + 0.45 * z, gy = 172 + 28 * z, W = 190 * gs, Hn = 80 * gs, gx = 240;
  const shake = P && after > 0 && after < 0.35 && P.goal ? Math.sin(after * 90) * 3 * (1 - after / 0.35) : 0;
  c.save(); c.translate(shake, 0);
  // arena: crowd and boards
  const g1 = c.createLinearGradient(0, 0, 0, 96); g1.addColorStop(0, '#0f172a'); g1.addColorStop(1, '#1e293b'); c.fillStyle = g1; c.fillRect(-10, 0, 500, 96);
  const cheer = P && P.goal && after > 0 ? Math.sin(after * 14) * 3 * Math.max(0, 1 - after / 1.2) : 0;
  for (const p of SGA.crowd) { const y = 22 + p.r * 22 + Math.sin(T * 2 + p.ph) * 1.2 - Math.abs(cheer) * (p.r + 1) * .5; c.fillStyle = p.c; c.beginPath(); c.arc(p.x, y, 5.5, 0, 6.3); c.fill(); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(p.x - 6, y + 4, 12, 8); }
  c.fillStyle = '#0b1f44'; c.fillRect(-10, 86, 500, 18); c.fillStyle = '#13306b'; c.fillRect(-10, 86, 500, 3);
  c.fillStyle = '#fff'; c.font = '700 9px Inter, system-ui, sans-serif'; c.textBaseline = 'middle'; for (let x = -((T * 14 * (P ? 1 : 0.3)) % 150); x < 500; x += 150) c.fillText('BUBBLE HOCKEY LEAGUE', x + 8, 96);
  // ice
  const ice = c.createLinearGradient(0, 104, 0, 300); ice.addColorStop(0, '#d8e8f7'); ice.addColorStop(1, '#f7fbff'); c.fillStyle = ice; c.fillRect(-10, 104, 500, 200);
  c.strokeStyle = 'rgba(29,78,216,.55)'; c.lineWidth = 3 * gs; c.beginPath(); c.moveTo(-10, gy + 6 * gs); c.lineTo(490, gy + 6 * gs); c.stroke();        // goal line
  c.strokeStyle = 'rgba(193,39,45,.5)'; c.lineWidth = 2; c.beginPath(); c.ellipse(gx, gy + 6 * gs, 78 * gs, 46 * gs, 0, 0, Math.PI); c.stroke(); c.fillStyle = 'rgba(147,197,253,.35)'; c.fill();       // crease
  c.strokeStyle = 'rgba(100,130,170,.18)'; c.lineWidth = 1; for (let i = 0; i < 14; i++) { const y = 125 + i * 14 + ((P ? pt * 40 : 0) % 14) * 0; c.beginPath(); c.moveTo(((i * 97) % 480), y); c.quadraticCurveTo(((i * 97) % 480) + 60, y + 6, ((i * 97) % 480) + 140, y + 1); c.stroke(); }       // skate scratches
  c.fillStyle = 'rgba(193,39,45,.7)'; c.beginPath(); c.arc(gx - 110 * gs, gy + 56 * gs, 5 * gs, 0, 6.3); c.arc(gx + 110 * gs, gy + 56 * gs, 5 * gs, 0, 6.3); c.fill();      // face-off dots
  // net (back, with a bulge when scored)
  const bulge = P && P.goal && after > 0 ? Math.sin(after * 22) * 12 * gs * Math.max(0, 1 - after / 0.9) : 0, bx = shootX * 0.3 * W * 0.5;
  c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(gx - W / 2, gy - Hn, W, Hn);
  c.strokeStyle = 'rgba(60,80,110,.45)'; c.lineWidth = 1;
  for (let i = 0; i <= 14; i++) { const x = gx - W / 2 + i * W / 14, d = Math.max(0, 1 - Math.abs(x - (gx + bx)) / (W * 0.35)) * bulge; c.beginPath(); c.moveTo(x, gy - Hn); c.lineTo(x + d * 0.4, gy); c.stroke(); }
  for (let i = 0; i <= 7; i++) { const y = gy - Hn + i * Hn / 7; c.beginPath(); c.moveTo(gx - W / 2, y); for (let x = 0; x <= W; x += 10) { const d = Math.max(0, 1 - Math.abs(gx - W / 2 + x - (gx + bx)) / (W * 0.35)) * bulge; c.lineTo(gx - W / 2 + x, y + d * 0.6); } c.stroke(); }
  // goalie
  const dv = P ? sgEase(sgClamp(pt, 1.25, 1.7)) : 0, sway = P ? 0 : Math.sin(T * 1.8) * 4 * gs, gxp = gx + diveX * 62 * gs * dv + sway, lean = diveX * 0.75 * dv, gcol = (P ? P.shooter : SGA.is) === 0 ? ['#c1272d', '#7f1d1d'] : ['#0b1f44', '#13306b'];
  sgDrawGoalie(c, gxp, gy - 4 * gs + (1 - dv) * 0 - dv * 6 * gs, gs, lean, dv, gcol, diveX);
  // posts
  c.strokeStyle = '#c1272d'; c.lineWidth = 6 * gs; c.lineCap = 'round'; c.beginPath(); c.moveTo(gx - W / 2, gy); c.lineTo(gx - W / 2, gy - Hn); c.lineTo(gx + W / 2, gy - Hn); c.lineTo(gx + W / 2, gy); c.stroke();
  // goal light
  const lit = P && P.goal && after > 0 ? (Math.floor(after * 6) % 2 === 0) : false; c.fillStyle = lit ? '#ff2d2d' : '#5b1010'; c.beginPath(); c.arc(gx, gy - Hn - 12 * gs, 6 * gs, 0, 6.3); c.fill(); if (lit) { c.fillStyle = 'rgba(255,45,45,.25)'; c.beginPath(); c.arc(gx, gy - Hn - 12 * gs, 16 * gs, 0, 6.3); c.fill(); }
  // puck
  const sx = 240 + shootX * 34 * wind, sy = 258, tx = gx + shootX * W * 0.3, ty = gy - Hn * 0.3 - (P && P.shoot === 'M' ? Hn * 0.18 : 0);
  let px = sx, py = sy, pr = 7, vis = true;
  if (!P) { px = 262; py = 266; }
  else if (pt < 1.3) { px = 240 + 22 + shootX * 34 * wind + Math.sin(pt * 9) * 3 * (1 - wind); py = 262 + Math.abs(Math.sin(pt * 9)) * 2; }
  else if (pt < 1.75) { const u = sgOut(shot); px = (240 + 22 + shootX * 34) + (tx - (240 + 22 + shootX * 34)) * u; py = 262 + (ty - 262) * u - Math.sin(u * Math.PI) * 18; pr = 7 - (7 - 4 * gs) * u; if (u > .15) { c.strokeStyle = 'rgba(17,24,39,.25)'; c.lineWidth = pr * 1.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(240 + 22 + shootX * 34 + (tx - (240 + 22 + shootX * 34)) * (u - .25), 262 + (ty - 262) * (u - .25)); c.lineTo(px, py); c.stroke(); } }
  else if (P.goal) { px = tx + (1 - Math.min(1, after * 2.2)) * 0; py = ty + Math.min(0.5, after) * 22 * gs; pr = 4 * gs; if (after > 0.15) vis = after < 0.2 ? true : true; }
  else { const u = after; px = tx - shootX * 0 + (diveX === 0 ? (shootX || 1) : -diveX) * u * 90 * (shootX === 0 ? 0.7 : 1) ; py = ty + 40 * u * u * 3 - u * 60; pr = 4 * gs + u * 3; if (u > 0.9) vis = u < 1.1; }
  if (vis) { c.fillStyle = '#111827'; c.beginPath(); c.ellipse(px, py, pr, pr * .55, 0, 0, 6.3); c.fill(); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(px - pr * .5, py - pr * .3, pr, pr * .2); }
  // skater (seen from behind) skating in, then shooting
  const bob = Math.sin((P ? pt * 11 : T * 2) * 1) * (P && pt < 1.0 ? 3 : 1), scol = (P ? P.shooter : SGA.is) === 0 ? ['#0b1f44', '#13306b'] : ['#c1272d', '#7f1d1d'];
  sgSkater(c, 240 + shootX * 34 * wind * 0.5, 262 + bob, 1.05, wind, shootX, scol, shot);
  // particles: ice spray and confetti
  if (P && pt < 1.25 && Math.random() < .6) SGA.parts.push({ x: 240 + (Math.random() - .5) * 26, y: 286, vx: (Math.random() - .5) * 60, vy: -20 - Math.random() * 40, life: .5, spray: 1 });
  for (let i = SGA.parts.length - 1; i >= 0; i--) { const q = SGA.parts[i]; q.life -= 1 / 60; if (q.life <= 0) { SGA.parts.splice(i, 1); continue; } q.x += q.vx / 60; q.y += q.vy / 60; q.vy += (q.spray ? 120 : 160) / 60;
    c.globalAlpha = Math.min(1, q.life * 2); c.fillStyle = q.c || '#fff'; if (q.spray) c.fillRect(q.x, q.y, 2.2, 2.2); else { c.save(); c.translate(q.x, q.y); c.rotate(q.life * 9 + i); c.fillRect(-3, -2, 6, 4); c.restore(); } c.globalAlpha = 1; }
  // result banner
  if (P && after > 0) { const u = sgOut(after * 3), a = after < 1.4 ? 1 : Math.max(0, 1 - (after - 1.4) * 2); c.save(); c.globalAlpha = a; c.translate(240, 150); c.scale(.6 + .5 * u, .6 + .5 * u); c.rotate(-0.06);
    c.font = '900 56px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 8; c.lineJoin = 'round'; c.strokeStyle = '#fff'; c.strokeText(P.goal ? 'GOAL!' : 'SAVED!', 0, 0); c.fillStyle = P.goal ? '#137a35' : '#c1272d'; c.fillText(P.goal ? 'GOAL!' : 'SAVED!', 0, 0); c.restore(); c.textAlign = 'start'; }
  c.restore();
}
function sgBurst(P, shootX, z) {
  const gs = 1, gx = 240, gy = 200, tx = gx + shootX * 190 * 0.3;
  if (P.goal) for (let i = 0; i < 70; i++) SGA.parts.push({ x: 240 + (Math.random() - .5) * 200, y: 40 + Math.random() * 40, vx: (Math.random() - .5) * 110, vy: Math.random() * 40, life: 1.6 + Math.random(), c: ['#c1272d', '#1d4ed8', '#f5b301', '#fff', '#8cc63f'][i % 5] });
  else for (let i = 0; i < 26; i++) SGA.parts.push({ x: tx, y: gy - 30, vx: (Math.random() - .5) * 220, vy: -Math.random() * 140, life: .5 + Math.random() * .3, spray: 1, c: '#fde68a' });
}
function sgDrawGoalie(c, x, y, s, lean, dv, col, dir) {
  c.save(); c.translate(x, y); c.rotate(lean * 0.55); c.scale(s, s);
  const arm = 22 + dv * 20;
  c.fillStyle = 'rgba(0,0,0,.12)'; c.beginPath(); c.ellipse(0, 4, 30, 6, 0, 0, 6.3); c.fill();
  c.fillStyle = '#f8fafc'; c.strokeStyle = '#64748b'; c.lineWidth = 1.5; for (const sx of [-1, 1]) { c.beginPath(); c.roundRect(sx * 12 - 8 + dv * dir * 4 * sx, -36, 16, 40, 5); c.fill(); c.stroke(); }          // pads
  c.fillStyle = col[0]; c.beginPath(); c.roundRect(-18, -64, 36, 34, 8); c.fill(); c.fillStyle = col[1]; c.fillRect(-18, -46, 36, 5);                                                                           // jersey
  c.fillStyle = col[0]; for (const sx of [-1, 1]) { c.beginPath(); c.roundRect(sx > 0 ? 14 : -14 - arm, -62 - dv * 8, arm, 10, 5); c.fill(); }                                                                       // arms
  c.fillStyle = '#e5e7eb'; c.beginPath(); c.arc(-14 - arm + 4, -57 - dv * 8, 9, 0, 6.3); c.fill(); c.fillStyle = '#f5b301'; c.beginPath(); c.roundRect(14 + arm - 12, -66 - dv * 8, 18, 18, 4); c.fill();       // glove and blocker
  c.fillStyle = '#e5e7eb'; c.strokeStyle = '#334155'; c.lineWidth = 2; c.beginPath(); c.arc(0, -74, 11, 0, 6.3); c.fill(); c.stroke(); c.fillStyle = col[1]; c.fillRect(-11, -78, 22, 6); c.strokeStyle = '#475569'; c.lineWidth = 1; c.beginPath(); c.moveTo(-6, -76); c.lineTo(-6, -64); c.moveTo(0, -76); c.lineTo(0, -64); c.moveTo(6, -76); c.lineTo(6, -64); c.stroke();                         // mask
  c.restore();
}
function sgSkater(c, x, y, s, wind, dir, col, shot) {
  c.save(); c.translate(x, y); c.scale(s, s); const rock = Math.sin(y * 0 + performance.now() / 140) * 0.04;
  c.rotate(rock + dir * wind * 0.1 - dir * shot * 0.12);
  c.fillStyle = 'rgba(0,0,0,.14)'; c.beginPath(); c.ellipse(0, 30, 26, 6, 0, 0, 6.3); c.fill();
  c.fillStyle = '#111827'; for (const sx of [-1, 1]) { c.beginPath(); c.roundRect(sx * 8 - 6, 6, 12, 26, 4); c.fill(); c.fillStyle = '#cbd5e1'; c.fillRect(sx * 8 - 8, 30, 16, 3); c.fillStyle = '#111827'; }            // legs and skates
  c.fillStyle = col[0]; c.beginPath(); c.roundRect(-18, -38, 36, 46, 10); c.fill(); c.fillStyle = col[1]; c.fillRect(-18, -4, 36, 5); c.fillRect(-18, -20, 36, 4);                          // jersey back
  c.fillStyle = '#fff'; c.font = '800 20px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('7', 0, -26); c.textAlign = 'start';
  c.fillStyle = col[0]; c.beginPath(); c.roundRect(-30, -34, 12, 28, 6); c.fill(); c.beginPath(); c.roundRect(18, -34, 12, 28, 6); c.fill();                                                    // arms
  c.fillStyle = '#e5e7eb'; c.beginPath(); c.arc(0, -50, 12, 0, 6.3); c.fill(); c.fillStyle = col[1]; c.beginPath(); c.arc(0, -52, 12, Math.PI, 0); c.fill();                                   // helmet
  const sw = -0.5 + wind * 0.5 - shot * 1.1 + dir * 0.1;                                                                                                                                      // stick
  c.save(); c.translate(24, -22); c.rotate(sw); c.strokeStyle = '#7c4a1d'; c.lineWidth = 3.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 46); c.stroke(); c.fillStyle = '#111827'; c.fillRect(-2, 44, 14, 4); c.restore();
  c.restore();
}

function sgRender(animate) {
  const root = document.getElementById('sg'); if (!root) return;
  const rec = sgRecord.get();
  if (SG.screen === 'menu') {
    root.innerHTML = `<div class="grid sg-menu"><section class="card"><h2 style="margin-top:4px">Shootout</h2><p class="muted">A penalty shot duel. The shooter picks <b>left</b>, <b>middle</b> or <b>right</b>. The goalie picks too. Same pick is a save, anything else is a goal. Five shots each, then sudden death.</p>
      <div class="btnrow"><button class="btn" data-sg="start" data-mode="bot">Play the computer</button><button class="btn ghost" data-sg="start" data-mode="two">Two players</button></div>
      ${rec.w + rec.l ? `<p class="muted" style="margin:12px 0 0">Your record against the computer: <b>${rec.w}–${rec.l}</b></p>` : ''}</section></div>`;
    return;
  }
  if (SG.screen === 'setup') {
    const dl = `<datalist id="sg-names">${D.members.map(m => `<option value="${esc(m.short_name)}">`).join('')}</datalist>`;
    root.innerHTML = `<section class="card"><h2 style="margin-top:4px">${SG.mode === 'bot' ? 'Shootout vs the computer' : 'Shootout: two players'}</h2>
      <form class="form" onsubmit="return false"><label class="f">${SG.mode === 'bot' ? 'Your name' : 'Player 1'}<input id="sg-n0" list="sg-names" value="${esc(SG.names[0])}" maxlength="20" autocomplete="off"></label>
      ${SG.mode === 'bot' ? '' : `<label class="f">Player 2<input id="sg-n1" list="sg-names" value="${esc(SG.names[1])}" maxlength="20" autocomplete="off"></label><p class="muted" style="margin:0">Play on one screen. After the shooter picks, hand the device to the goalie so the pick stays secret.</p>`}${dl}
      <div class="btnrow"><button class="btn" data-sg="go" type="button">Face off</button><button class="btn ghost" data-sg="menu" type="button">Back</button></div></form></section>`;
    return;
  }
  const s = sgShooter(), g = sgGoalie(), reveal = SG.phase === 'reveal';
  if (SG.screen === 'end') {
    const w = SG.winner, you = SG.mode === 'bot' ? (w === 0 ? 'You win!' : 'The computer wins.') : `${sgName(w)} wins!`;
    root.innerHTML = `${sgBoard()}<section class="card sg-end"><h2 style="margin-top:4px">${esc(you)}</h2><p class="muted">Final score ${SG.score[0]}–${SG.score[1]}${SG.log[0].length > SG_ROUNDS ? ' after sudden death' : ''}.${SG.mode === 'bot' ? ` Your record against the computer: <b>${rec.w}–${rec.l}</b>.` : ''}</p>
      <div class="btnrow"><button class="btn" data-sg="go">Play again</button><button class="btn ghost" data-sg="menu">Back to games</button></div></section>`;
    return;
  }
  let body;
  if (reveal) {
    const goal = SG.res.goal, who = esc(sgName(s));
    body = `<div class="sg-after" hidden><p class="sg-say"><span class="sg-result ${goal ? 'goal' : 'save'}">${goal ? 'GOAL!' : 'SAVED!'}</span> ${who} shot ${SG_DIRS[SG.shot.shoot].toLowerCase()}, ${esc(sgName(g))} went ${SG_DIRS[SG.shot.dive].toLowerCase()}.</p><div class="btnrow"><button class="btn" data-sg="next">${sgOver() >= 0 ? 'See result' : 'Next shot'}</button></div></div><p class="muted sg-wait">Tap the rink to skip the animation.</p>`;
  } else if (SG.phase === 'shooter') {
    body = sgPicker(`<b>${esc(sgName(s))}</b>, where do you shoot?${SG.mode === 'two' ? ` <span class="muted">(${esc(sgName(g))}, look away)</span>` : ''}`);
  } else if (SG.phase === 'pass') {
    body = `<p class="sg-say">Shot locked in. Pass the device to <b>${esc(sgName(g))}</b>.</p><div class="btnrow"><button class="btn" data-sg="ready">I'm ${esc(sgName(g))}, ready</button></div>`;
  } else {
    body = sgPicker(`<b>${esc(sgName(g))}</b>, which way do you dive?${SG.mode === 'bot' ? ' <span class="muted">(the computer is shooting)</span>' : ''}`);
  }
  root.innerHTML = `${sgBoard()}<div class="sg-scene"><canvas id="sg-cv" class="sg-cv" data-sg="skip" aria-label="Shootout rink" role="img"></canvas></div><div class="sg-ctl"><p class="muted sg-meta">${SG.log[0].length >= SG_ROUNDS && SG.log[0].length === SG.log[1].length ? 'Sudden death' : `Shot ${Math.floor(SG.n / 2) + 1}${SG.log[0].length > SG_ROUNDS - 1 ? ' · sudden death' : ` of ${SG_ROUNDS}`}`} · ${esc(sgName(s))} shooting</p>${body}<button type="button" class="link sg-snd" data-sg="sound">Sound: ${SGA.sound ? 'on' : 'off'}</button></div>`;
  SGA.is = s; SGA.play = null; sgAttach(document.getElementById('sg-cv'));
  if (reveal) {
    SG.done = false;
    sgRun({ shoot: SG.shot.shoot, dive: SG.shot.dive, goal: SG.res.goal, shooter: s }, () => {
      SG.done = true; const r = document.getElementById('sg'); if (!r) return;
      const after = r.querySelector('.sg-after'), wait = r.querySelector('.sg-wait'), bd = r.querySelector('.sg-board');
      if (after) after.hidden = false; if (wait) wait.remove(); if (bd) bd.outerHTML = sgBoard();
    });
  }
}

view.games = function () {
  if (!document.getElementById('sg') && SG.screen !== 'menu' && SG.screen !== 'end') Object.assign(SG, { screen: 'menu' });      // leaving mid-game and coming back starts fresh
  setTimeout(sgRender, 0);
  return `<h1>Mini games</h1><p class="lead">Take a break between matchups.</p><div id="sg" class="sg"></div>`;
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-sg]'); if (!b || !document.getElementById('sg')) return;
  const a = b.dataset.sg;
  if (a === 'start') sgStart(b.dataset.mode);
  else if (a === 'menu') { SG.screen = 'menu'; sgRender(); }
  else if (a === 'go') { if (SG.screen === 'setup') { const n0 = document.getElementById('sg-n0').value.trim(), n1 = document.getElementById('sg-n1'); SG.names = [n0 || 'Player 1', SG.mode === 'bot' ? 'Computer' : (n1.value.trim() || 'Player 2')]; if (SG.mode === 'two' && SG.names[0] === SG.names[1]) SG.names[1] += ' 2'; } sgBegin(); }
  else if (a === 'pick') sgPick(b.dataset.dir);
  else if (a === 'ready') { SG.phase = 'goalie'; sgRender(); }
  else if (a === 'next') sgAdvance();
  else if (a === 'sound') { SGA.sound = !SGA.sound; try { localStorage.setItem('bhl_sg_sound', SGA.sound ? '1' : '0'); } catch { } b.textContent = SGA.sound ? 'Sound: on' : 'Sound: off'; if (SGA.sound) sgSound('save'); }
  else if (a === 'skip') sgSkip();
});
