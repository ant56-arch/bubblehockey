/* Face-off (part of the Resources page): a reaction game. The referee holds the puck over the dot, then drops it at a random moment. Tap the instant
   it drops: the faster player wins the draw. Tap early and it is a false start (the other player wins the draw). First to 3 draws wins.
   Play the computer (three speeds) or two players on one screen (two big buttons, or the A and L keys).
   Nothing here is saved to the league data; only your record and fastest reaction against the computer are kept in this browser.
   It shares the arena and drawing helpers of the Shootout in resources.js. */

const FO = { screen: 'menu', mode: 'bot', level: 'medium', names: ['', ''], score: [0, 0], phase: 'idle', drop: 0, dropPerf: 0, taps: [null, null], res: null, show: true, best: [null, null], timers: [], round: 1, hist: [] };
const FO_LEVELS = { easy: ['Easy', 340], medium: ['Medium', 285], hard: ['Hard', 240] }, FO_WIN = 3;
const foRec = {
  get() { try { return JSON.parse(localStorage.getItem('bhl_faceoff') || '{"w":0,"l":0,"best":0}'); } catch { return { w: 0, l: 0, best: 0 }; } },
  add(win, best) { const r = foRec.get(); win ? r.w++ : r.l++; if (best && (!r.best || best < r.best)) r.best = best; try { localStorage.setItem('bhl_faceoff', JSON.stringify(r)); } catch { } },
};
/* The sentence under the rink. It is built when shown so that a late tap (after the computer already won) can add the player's own time. */
function foText(R) {
  if (R.fs >= 0) return R.text;
  const w = R.winner, l = 1 - w, rw = R.rt[w], rl = R.rt[l];
  if (rl !== null && rl !== undefined) return `${foName(w)} wins the draw with ${rw} ms. ${foName(l)}: ${rl} ms (${rl - rw} ms too slow).`;
  return `${foName(w)} wins the draw with ${rw} ms. ${foName(l)} did not tap in time.`;
}
const foName = i => FO.names[i] || (i ? 'Player 2' : 'Player 1');
const foLater = (fn, ms) => { const t = setTimeout(fn, ms); FO.timers.push(t); return t; };
const foClear = () => { FO.timers.forEach(clearTimeout); FO.timers = []; };
/* How long the referee waits before dropping the puck: a mix of quick drops, ordinary waits and long ones, so there is no pattern to learn. */
function foWaitDelay() {
  const r = Math.random();
  return r < 0.28 ? 600 + Math.random() * 700 : r < 0.74 ? 1300 + Math.random() * 2000 : r < 0.92 ? 3300 + Math.random() * 1800 : 5100 + Math.random() * 2200;
}
/* Sometimes the referee fidgets: the hand dips with the puck and comes back up without letting go. Tapping then is still a false start. */
function foFeints(delay) {
  const out = []; if (Math.random() < 0.45 && delay > 1500) for (let i = 0, n = 1 + (Math.random() < 0.35 ? 1 : 0); i < n; i++) out.push({ at: 500 + Math.random() * (delay - 1100), dur: 260 + Math.random() * 200, amp: 7 + Math.random() * 9 });
  return out;
}
const foGauss = (mean, sd) => mean + sd * (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;      // a bell-shaped spread around the average

/* ---------- game flow ---------- */
function foStart(mode) {
  const first = (D.members[0] || {}).short_name || 'You', second = (D.members[1] || {}).short_name || 'Player 2';
  Object.assign(FO, { screen: 'setup', mode, names: [FO.names[0] || first, mode === 'bot' ? 'Computer' : (FO.names[1] && FO.names[1] !== 'Computer' ? FO.names[1] : second)] });
  foRender();
}
function foBegin() {
  foClear(); Object.assign(FO, { screen: 'play', score: [0, 0], round: 1, best: [null, null], hist: [], res: null, show: true });
  foReady(); foRender();
}
function foReady() {
  foClear(); Object.assign(FO, { phase: 'ready', drop: 0, taps: [null, null], res: null, show: true, feints: [] });
  sgSound('skate');
  foLater(() => { FO.phase = 'wait'; foRender(); const d = foWaitDelay(); FO.waitStart = performance.now(); FO.feints = foFeints(d); foLater(foDrop, d); }, 600 + Math.random() * 700);
}
function foDrop() {
  FO.phase = 'drop'; FO.drop = FO.dropPerf = performance.now();
  if (FO.mode === 'bot') { FO.botRT = Math.max(165, foGauss(FO_LEVELS[FO.level][1], 38)); foLater(() => foResolve(), FO.botRT + 2); }
  else foLater(() => foResolve(), 1500);                         // nobody tapped: the faster of the (missing) taps cannot be known, so the draw is simply replayed
  foRender();
}
function foLateTap(p, ts) {                // the draw is already decided, but the player's own time is still worth showing
  const R = FO.res; if (!R || R.fs >= 0 || R.rt[p] !== null || (FO.mode === 'bot' && p !== 0)) return;
  const rt = Math.round((ts || performance.now()) - FO.dropPerf); if (rt < 1 || rt > 1800) return;
  R.rt[p] = rt; if (FO.best[p] === null || rt < FO.best[p]) FO.best[p] = rt;
  const say = document.querySelector('.fo-after .sg-say'); if (say) say.textContent = foText(R);
}
function foTap(p, ts) {
  if (FO.screen !== 'play') return;
  if (FO.res) { foLateTap(p, ts); return; }
  if (FO.phase === 'wait') { foFalseStart(p, ts); return; }
  if (FO.phase !== 'drop' || FO.taps[p] !== null) return;
  FO.taps[p] = Math.max(1, Math.round((ts || performance.now()) - FO.dropPerf));
  if (FO.mode === 'bot') foResolve(); else if (FO.taps[1 - p] === null && !FO.closing) { FO.closing = true; foLater(() => { FO.closing = false; foResolve(); }, 210); } else if (FO.taps[1 - p] !== null) { FO.closing = false; foResolve(); }
}
function foFalseStart(p, ts) {
  foClear(); FO.phase = 'result'; const w = 1 - p, wr = 205;
  FO.drop = performance.now() + 900; FO.dropPerf = FO.drop;
  FO.res = { winner: w, rt: [null, null], fs: p, hit: 0, finished: false, text: `False start! ${foName(p)} jumped the puck, so ${foName(w)} wins the draw.` };
  FO.res.rt[p] = -900; FO.res.rt[w] = wr; FO.res.hit = Math.max(0.3, wr / 1000 + 0.14);
  FO.show = false; FO.score[w]++; sgSound('whistle'); foRender();
}
function foResolve() {
  if (FO.phase !== 'drop' || FO.res) return;
  foClear(); FO.closing = false;
  let rt = [FO.taps[0], FO.taps[1]], w;
  if (FO.mode === 'bot') { rt[1] = Math.round(FO.botRT); w = rt[0] !== null && rt[0] < rt[1] ? 0 : 1; if (rt[0] === null) rt[0] = null; }
  else if (rt[0] === null && rt[1] === null) { FO.phase = 'ready'; foReady(); foRender(); return; }          // nobody reacted: drop it again
  else w = rt[1] === null || (rt[0] !== null && rt[0] <= rt[1]) ? 0 : 1;
  FO.phase = 'result';
  const loserRt = rt[1 - w], t = rt.map(x => (x === null ? '–' : x + ' ms'));
  FO.res = { winner: w, rt, fs: -1, hit: Math.max(0.3, rt[w] / 1000 + 0.14), finished: false, text: '' };
  [0, 1].forEach(i => { if (rt[i] !== null && !(FO.mode === 'bot' && i === 1)) FO.best[i] = FO.best[i] === null ? rt[i] : Math.min(FO.best[i], rt[i]); });
  FO.score[w]++; FO.show = false; foRender();
}
function foShown() {            // the animation has finished: reveal the score and the next button
  FO.show = true; const r = document.getElementById('sg'); if (!r || FO.screen !== 'play') return;
  const after = r.querySelector('.fo-after'), wait = r.querySelector('.sg-wait'), bd = r.querySelector('.sg-board');
  const say = r.querySelector('.fo-after .sg-say'); if (say && FO.res) say.textContent = foText(FO.res);
  const zone = r.querySelector('.fo-tapzone'); if (zone) zone.remove();
  if (after) after.hidden = false; if (wait) wait.remove(); if (bd) bd.outerHTML = foBoard();
}
function foNext() {
  const w = FO.score.findIndex(s => s >= FO_WIN);
  if (w >= 0) { FO.screen = 'end'; FO.winner = w; if (FO.mode === 'bot') foRec.add(w === 0, FO.best[0]); foRender(); return; }
  FO.round++; foReady(); foRender();
}

/* ---------- drawing: a side view of the face-off circle, two players bent over their sticks, the referee behind with the puck ---------- */
const FOA = { cv: null, ctx: null, raf: 0, k: 1, t0: 0 }, FO_DOT = { x: 240, y: 270 }, FO_P = [{ x: 140, face: 1 }, { x: 340, face: -1 }], FO_FEET = 286;
function foAttach(cv) {
  FOA.cv = cv; const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth || 480;
  cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr * SGA.H / SGA.W); FOA.ctx = cv.getContext('2d'); FOA.k = cv.width / SGA.W; FOA.t0 = performance.now();
  foFrame(performance.now()); if (!FOA.raf) FOA.raf = requestAnimationFrame(foLoop);
}
function foLoop(now) { if (!FOA.cv || !document.body.contains(FOA.cv)) { FOA.raf = 0; FOA.cv = null; return; } foFrame(now); FOA.raf = requestAnimationFrame(foLoop); }

function foFrame(now) {
  const c = FOA.ctx; if (!c) return; const T = (now - FOA.t0) / 1000, R = FO.res, u = FO.drop ? (now - FO.drop) / 1000 : -1;
  c.setTransform(FOA.k, 0, 0, FOA.k, 0, 0); c.clearRect(0, 0, SGA.W, SGA.H);
  const w = R ? R.winner : -1, cheer = R && R.finished ? Math.sin(T * 12) * 2 : 0;
  sgBackdrop(c, T, false, cheer);
  // the league logo painted on the ice at centre ice, squashed to match the view like the real thing
  { const lg = sgLeagueLogo(); if (lg) { c.save(); c.globalAlpha = 0.5; c.translate(FO_DOT.x, FO_DOT.y + 1); c.scale(1, 0.26); c.drawImage(lg, -62, -62, 124, 124); c.restore(); } }
  // face-off circle and dot
  c.strokeStyle = 'rgba(190,40,50,.8)'; c.lineWidth = 2.4; c.beginPath(); c.ellipse(FO_DOT.x, FO_DOT.y, 112, 30, 0, 0, 6.3); c.stroke();
  c.fillStyle = 'rgba(190,40,50,.12)'; c.fill(); c.lineWidth = 2; c.beginPath(); c.moveTo(FO_DOT.x - 112, FO_DOT.y); c.lineTo(FO_DOT.x - 124, FO_DOT.y); c.moveTo(FO_DOT.x + 112, FO_DOT.y); c.lineTo(FO_DOT.x + 124, FO_DOT.y); c.stroke();
  c.fillStyle = '#1d4ed8'; c.beginPath(); c.ellipse(FO_DOT.x, FO_DOT.y, 7, 3.2, 0, 0, 6.3); c.fill();
  // referee: holds the puck out over the dot
  let dip = 0; if (FO.phase === 'wait' && FO.feints) for (const f of FO.feints) { const q = (now - FO.waitStart - f.at) / f.dur; if (q > 0 && q < 1) dip += Math.sin(q * Math.PI) * f.amp; }
  foRef(c, 240, 246, 0.86, R && R.fs >= 0 && u < 0.6 ? 1 : 0, T, dip);
  // puck
  const hand = { x: 240, y: 212 + dip * 0.86 }, fall = u >= 0 ? Math.min(1, u / 0.3) : 0, hit = R ? R.hit : 99;
  let px = hand.x, py = hand.y, vis = true;
  if (u >= 0) {
    py = u < 0.3 ? hand.y + (FO_DOT.y - hand.y) * fall * fall : FO_DOT.y - Math.abs(Math.sin((u - 0.3) * 18)) * 5 * Math.exp(-(u - 0.3) * 9);
    if (R && u > hit) { const d = (w === 0 ? -1 : 1), s = u - hit; px = FO_DOT.x + d * 96 * (1 - Math.exp(-s * 4.2)); py = FO_DOT.y + 18 * (1 - Math.exp(-s * 3)); }
  }
  c.fillStyle = 'rgba(15,23,42,.22)'; c.beginPath(); c.ellipse(px, (u >= 0 ? py : FO_DOT.y) + (u >= 0 ? 4 : 0), 8, 3, 0, 0, 6.3); c.fill();
  // players
  for (const p of [0, 1]) {
    const tapAt = R ? R.rt[p] : null, isW = w === p;
    let start = R ? (isW ? R.hit - 0.14 : (tapAt !== null ? tapAt / 1000 : R.hit + 0.03)) : 9;
    if (R && R.fs === p) start = -0.9;
    const s = R ? Math.min(1, Math.max(0, (u - start) / 0.14)) : 0;
    foPlayer(c, FO_P[p].x, FO_FEET, FO_P[p].face, SG_TEAM[p], s, T + p, name2(p), R && R.finished && isW);
  }
  if (vis) { c.fillStyle = '#0b1426'; c.beginPath(); c.ellipse(px, py, 8, 4.4, 0, 0, 6.3); c.fill(); c.fillStyle = '#334155'; c.beginPath(); c.ellipse(px, py - 1.8, 8, 3.3, 0, 0, 6.3); c.fill(); }
  // ice spray when the sticks clash
  if (R && u > hit && u < hit + 0.35) { c.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 14; i++) { const a = i * 1.7, r = (u - hit) * 160 * (0.4 + (i % 4) / 4); c.fillRect(FO_DOT.x + Math.cos(a) * r, FO_DOT.y - Math.abs(Math.sin(a)) * r * 0.7 - 2, 2.2, 2.2); } }
  // false start banner
  if (R && R.fs >= 0 && u < 1.1) { c.save(); c.translate(240, 120); const pop = Math.min(1, (u + 0.9) * 5); c.scale(0.7 + 0.3 * pop, 0.7 + 0.3 * pop); c.font = '40px Anton, Impact, "Arial Narrow", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 8; c.lineJoin = 'round'; c.strokeStyle = '#fff'; c.strokeText('FALSE START!', 0, 0); c.fillStyle = '#c1272d'; c.fillText('FALSE START!', 0, 0); c.restore(); }
  sgDome(c);
  if (R && !R.finished && u >= hit + 1.1) { R.finished = true; foShown(); }
}
const name2 = p => String(foName(p)).toUpperCase().slice(0, 8);

/* A face-off player in profile (facing right when face = 1), drawn like the other players: crouched over the dot, both hands on the stick. s = the swing at the puck (0 to 1). */
function foPlayer(c, x, y, face, pal, s, T, name, happy) {
  c.save(); c.translate(x, y); c.scale(face * 0.5, 0.5);
  const J = pal.main, JD = pal.sh, Y = pal.acc, PN = pal.pant, PND = pal.pantd, lean = 0.62 + s * 0.08, hip = [-12, -100 + Math.sin(T * 2.4) * 2], dir = [Math.sin(lean), -Math.cos(lean)];
  const ik = (a, t, l1, l2, sign) => { const dx = t[0] - a[0], dy = t[1] - a[1], d = Math.max(1, Math.min(Math.hypot(dx, dy), l1 + l2 - .5)), an = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))), b = Math.atan2(dy, dx) + sign * an; return [a[0] + l1 * Math.cos(b), a[1] + l1 * Math.sin(b)]; };
  c.fillStyle = 'rgba(16,26,51,.16)'; c.beginPath(); c.ellipse(8, 8, 100, 15, 0, 0, 6.3); c.fill();
  const leg = (k, a) => {
    rgTube(c, [k, a], 22, J, JD); rgLine(c, [rgMix2(k, a, .4), rgMix2(k, a, .58)], 22, RG_W, 'butt'); rgLine(c, [rgMix2(k, a, .64), rgMix2(k, a, .76)], 22, Y, 'butt');
    rgBand(c, [[a[0] - 14, a[1] + 18], [a[0] + 26, a[1] + 18], [a[0] + 20, a[1] + 28], [a[0] - 10, a[1] + 28]], '#e9edf4', 3, 3); rgLine(c, [[a[0] - 20, a[1] + 30], [a[0] + 34, a[1] + 30]], 6, RG_INK); rgLine(c, [[a[0] - 20, a[1] + 30], [a[0] + 34, a[1] + 30]], 2.6, '#c9d1de');
    rgShape(c, [[a[0] - 15, a[1] - 10], [a[0] + 13, a[1] - 10], [a[0] + 32, a[1] + 8], [a[0] + 30, a[1] + 19], [a[0] - 17, a[1] + 19]], RG_BOOT, RG_BOOTD, 8); rgLine(c, [[a[0] + 2, a[1] - 2], [a[0] + 14, a[1] + 2]], 2.4, RG_W);
    rgTube(c, [hip, k], 31, PN, PND); rgPad(c, k, 13, RG_W, RG_WD, 3.2);
  };
  leg([-46, -56], [-60, -30]); leg([32, -60], [46, -30]);
  rgTube(c, [[hip[0] - 8, hip[1] + 2], [hip[0] + 10, hip[1] + 2]], 42, PN, PND);
  const sh = [hip[0] + dir[0] * 86, hip[1] + dir[1] * 86], w0 = [hip[0] + dir[0] * 16, hip[1] + dir[1] * 16];
  rgTube(c, [w0, sh], 52, J, JD); rgLine(c, [rgMix2(w0, sh, .0), rgMix2(w0, sh, .1)], 52, RG_W, 'butt'); rgLine(c, [rgMix2(w0, sh, .03), rgMix2(w0, sh, .07)], 52, Y, 'butt');
  // head: helmet, visor, the face looking down at the dot
  const hd = [sh[0] + dir[0] * 34 + 4, sh[1] + dir[1] * 34 - 4], r = 22;
  rgLine(c, [sh, hd], 24, RG_INK); rgLine(c, [sh, hd], 18, '#cf9870');
  c.beginPath(); c.ellipse(hd[0] + 12, hd[1] + 7, 16, 18, 0, 0, 6.3); c.fillStyle = '#f0c39c'; c.fill(); c.lineWidth = 3.2; c.strokeStyle = RG_INK; c.stroke();
  c.beginPath(); c.arc(hd[0], hd[1], r * 1.08, 0, 6.3); c.fillStyle = pal.sh; c.fill(); c.lineWidth = 3.8; c.stroke(); c.beginPath(); c.arc(hd[0] - 4, hd[1] - 5, r * .8, 0, 6.3); c.fillStyle = pal.main; c.fill();
  c.lineWidth = 6.5; c.strokeStyle = RG_W; c.lineCap = 'butt'; c.beginPath(); c.moveTo(hd[0] - r, hd[1] + 6); c.quadraticCurveTo(hd[0], hd[1] + 14, hd[0] + r, hd[1] + 5); c.stroke();
  rgBand(c, [[hd[0] + 8, hd[1] + 10], [hd[0] + 30, hd[1] + 8], [hd[0] + 28, hd[1] + 24], [hd[0] + 10, hd[1] + 26]], 'rgba(160,210,255,.62)', 2.8, 3);
  c.fillStyle = RG_INK; c.beginPath(); c.arc(hd[0] + 19, hd[1] + 16, 2.6, 0, 6.3); c.fill();
  if (happy) { c.lineWidth = 2.6; c.strokeStyle = RG_INK; c.lineCap = 'round'; c.beginPath(); c.arc(hd[0] + 18, hd[1] + 27, 5, 0.2, Math.PI - 0.2); c.stroke(); }
  // the stick and both arms; the blade slides from beside the dot onto it as s goes from 0 to 1
  const e = 1 - (1 - s) ** 3, B = [112 + 72 * e, -24 - Math.sin(s * Math.PI) * 14], H1 = [84 + 52 * e, -118 + 12 * e], butt = [H1[0] - 12, H1[1] - 26], H2 = rgMix2(H1, B, .5);
  const arm = (t, sign) => { const el = ik(sh, t, 46, 44, sign); rgTube(c, [sh, el, t], 22, J, JD); rgLine(c, [rgMix2(el, t, .5), rgMix2(el, t, .72)], 22, RG_W, 'butt'); rgPad(c, el, 12, RG_W, RG_WD, 3);
    const ang = Math.atan2(t[1] - el[1], t[0] - el[0]) * 180 / Math.PI, g = [[-12, -15], [12, -16], [22, -6], [21, 9], [10, 16], [-12, 15]].map(p => rgRot([t[0] + p[0], t[1] + p[1]], t, ang));
    rgShape(c, g, PN, PND, 7, 3.4); rgBand(c, [[-12, -15], [-3, -15.4], [-3, 15.4], [-12, 15]].map(p => rgRot([t[0] + p[0], t[1] + p[1]], t, ang)), Y, 2.6, 2); };
  arm(H1, 1);
  rgLine(c, [butt, B], 10, RG_INK); rgLine(c, [butt, B], 5.5, RG_WOOD); rgLine(c, [B, [B[0] + 34, B[1] + 1]], 17, RG_INK); rgLine(c, [B, [B[0] + 34, B[1] + 1]], 11, RG_BOOT); rgLine(c, [[B[0] + 10, B[1]], [B[0] + 28, B[1] + 1]], 4.5, RG_W);
  arm(H2, 1); rgPad(c, sh, 17, Y, Y, 3.4);
  c.restore();
}
/* The referee, facing us: striped jersey, white helmet, orange armbands, one arm out holding the puck over the dot (the other goes up for a false start). */
function foRef(c, x, y, s, raiseOther, T, dip = 0) {
  c.save(); c.translate(x, y); c.scale(s * 0.5, s * 0.5);
  c.fillStyle = 'rgba(16,26,51,.16)'; c.beginPath(); c.ellipse(0, 8, 70, 12, 0, 0, 6.3); c.fill();
  for (const sx of [-1, 1]) { rgTube(c, [[sx * 20, -104], [sx * 20, -24]], 28, '#27324f', '#141c33'); rgShape(c, [[sx * 20 - 19, -22], [sx * 20 + 19, -22], [sx * 20 + 21, 2], [sx * 20 - 21, 2]], RG_BOOT, RG_BOOTD, 8); rgLine(c, [[sx * 20 - 24, 8], [sx * 20 + 24, 8]], 6, RG_INK); rgLine(c, [[sx * 20 - 24, 8], [sx * 20 + 24, 8]], 2.6, '#c9d1de'); }
  const body = [[-42, -100], [-50, -194], [-22, -216], [22, -216], [50, -194], [42, -100]];
  rgShape(c, body, RG_W, RG_WD, 18); c.save(); rgPath(c, body, 18); c.clip(); c.fillStyle = '#1b2233'; for (let i = -50; i < 50; i += 19) c.fillRect(i, -220, 9.5, 124); c.restore(); rgPath(c, body, 18); c.lineWidth = 4; c.strokeStyle = RG_INK; c.stroke();
  const wave = raiseOther ? Math.sin(T * 14) * 6 : 0, up = raiseOther ? 1 : 0, d2 = dip * 2;
  const armF = [[-46, -188], [-70, -142 - up * 72], [-74 + wave, -104 - up * 96]], armP = [[46, -188], [62, -134 + d2 * .5], [16, -96 + d2]];
  for (const a of [armF, armP]) { rgTube(c, a, 21, RG_W, RG_WD); rgLine(c, [rgMix2(a[0], a[1], .55), rgMix2(a[0], a[1], .85)], 21, '#f97316', 'butt'); rgPad(c, a[2], 11.5, '#27324f', '#141c33', 3.2); }
  rgLine(c, [[0, -214], [0, -232]], 24, RG_INK); rgLine(c, [[0, -214], [0, -232]], 18, '#cf9870');
  c.beginPath(); c.arc(0, -242, 27, 0, 6.3); c.fillStyle = '#f0c39c'; c.fill(); c.lineWidth = 3.6; c.strokeStyle = RG_INK; c.stroke();
  c.beginPath(); c.arc(0, -248, 29, Math.PI, 0); c.closePath(); c.fillStyle = RG_W; c.fill(); c.stroke(); rgLine(c, [[-29, -248], [29, -248]], 4, RG_INK);
  c.fillStyle = RG_INK; for (const ex of [-9, 9]) { c.beginPath(); c.arc(ex, -238, 3, 0, 6.3); c.fill(); } c.lineWidth = 2.8; c.lineCap = 'round'; c.beginPath(); c.arc(0, -228, 8, 0.25, Math.PI - 0.25); c.stroke();
  rgBand(c, [[-7, -216], [7, -216], [7, -206], [-7, -206]], '#e5e7eb', 2.4, 3);
  c.restore();
}

/* ---------- screens ---------- */
function foBoard() {
  const hide = FO.screen === 'play' && !FO.show, shown = i => FO.score[i] - (hide && FO.res && FO.res.winner === i ? 1 : 0);
  return `<div class="sg-board">${[0, 1].map(i => `<div class="sg-side ${FO.phase === 'drop' ? '' : ''}"><b>${esc(foName(i))}</b><span class="sg-num">${shown(i)}</span><div class="sg-dots" aria-label="draws won">${Array.from({ length: FO_WIN }, (_, k) => `<span class="sg-dot ${k < shown(i) ? 'g' : ''}">${k < shown(i) ? '●' : '○'}</span>`).join('')}</div></div>`).join('')}</div>`;
}
const foTapBtns = () => FO.mode === 'bot'
  ? `<button type="button" class="btn fo-tap" data-fo-tap="0">TAP!</button>`
  : `<div class="fo-two"><button type="button" class="btn fo-tap" data-fo-tap="0" style="background:${SG_TEAM[0].main}">${esc(foName(0))}<small>key A</small></button><button type="button" class="btn fo-tap" data-fo-tap="1" style="background:${SG_TEAM[1].main}">${esc(foName(1))}<small>key L</small></button></div>`;

function foRender() {
  const root = document.getElementById('sg'); if (typeof resChrome === 'function') resChrome(); if (!root) return;
  const rec = foRec.get(), nameBox = (id, label, val) => `<label class="f">${label}<input id="${id}" list="sg-names" value="${esc(val)}" maxlength="20" autocomplete="off"></label>`;
  const dl = `<datalist id="sg-names">${D.members.map(m => `<option value="${esc(m.short_name)}">`).join('')}</datalist>`;
  if (FO.screen === 'menu') {
    root.innerHTML = `<section class="card sg-menu"><h2 style="margin-top:4px">Face-off</h2><p class="muted">The referee holds the puck over the dot and drops it when he feels like it. <b>Tap the moment it drops.</b> Fastest hand wins the draw, but tap early and it is a false start. First to ${FO_WIN} draws wins.</p>
      <div class="btnrow"><button class="btn" data-fo="start" data-mode="bot">Play the computer</button><button class="btn ghost" data-fo="start" data-mode="two">Two players, one screen</button></div>
      ${rec.w + rec.l ? `<p class="muted" style="margin:12px 0 0">Your record against the computer: <b>${rec.w}–${rec.l}</b>${rec.best ? ` · fastest reaction <b>${rec.best} ms</b>` : ''}</p>` : ''}</section>`;
    return;
  }
  if (FO.screen === 'setup') {
    root.innerHTML = `<section class="card"><h2 style="margin-top:4px">${FO.mode === 'bot' ? 'Face-off vs the computer' : 'Face-off: two players'}</h2><form class="form" onsubmit="return false">${nameBox('fo-n0', FO.mode === 'bot' ? 'Your name' : 'Player 1', FO.names[0])}
      ${FO.mode === 'bot' ? `<div class="f">Computer speed<div class="chips" style="margin:6px 0 0">${Object.entries(FO_LEVELS).map(([k, v]) => `<button type="button" class="chip ${FO.level === k ? 'on' : ''}" data-fo="level" data-level="${k}">${v[0]}</button>`).join('')}</div></div>` : `${nameBox('fo-n1', 'Player 2', FO.names[1])}<p class="muted" style="margin:0">Both of you play on one screen. Player 1 taps the left button (or the A key) and Player 2 the right one (or the L key).</p>`}${dl}
      <div class="btnrow"><button class="btn" data-fo="go" type="button">Face off</button><button class="btn ghost" data-fo="menu" type="button">Back</button></div></form></section>`;
    return;
  }
  if (FO.screen === 'end') {
    const w = FO.winner, bot = FO.mode === 'bot', you = bot ? (w === 0 ? 'You win!' : 'The computer wins.') : `${foName(w)} wins!`;
    root.innerHTML = `${foBoard()}<section class="card sg-end"><h2 style="margin-top:4px">${esc(you)}</h2><p class="muted">Final score ${FO.score[0]}–${FO.score[1]}.${FO.best[0] !== null ? ` Fastest reaction: ${esc(foName(0))} ${FO.best[0]} ms${!bot && FO.best[1] !== null ? `, ${esc(foName(1))} ${FO.best[1]} ms` : ''}.` : ''}${bot ? ` Record against the computer: <b>${rec.w}–${rec.l}</b>${rec.best ? ` · best ${rec.best} ms` : ''}.` : ''}</p>
      <div class="btnrow"><button class="btn" data-fo="go">Play again</button><button class="btn ghost" data-fo="menu">Back to games</button></div></section>`;
    return;
  }
  const ph = FO.phase, R = FO.res;
  const say = ph === 'ready' ? 'Get ready…' : ph === 'wait' ? 'Wait for the drop…' : '<b>NOW!</b>';
  const body = ph === 'result' ? `${R.fs >= 0 ? '' : `<div class="fo-tapzone">${foTapBtns()}</div>`}<div class="fo-after" hidden><p class="sg-say">${esc(foText(R))}</p><div class="btnrow"><button class="btn" data-fo="next" type="button">${FO.score.some(s => s >= FO_WIN) ? 'See result' : 'Next face-off'}</button></div></div><p class="muted sg-wait">Tap the rink to skip the animation.</p>`
    : `<p class="sg-say fo-say">${say}</p>${foTapBtns()}`;
  root.innerHTML = `${foBoard()}<div class="sg-scene"><canvas id="sg-cv" class="sg-cv" data-fo="skip" aria-label="Face-off" role="img"></canvas></div><div class="sg-ctl"><p class="muted sg-meta">Face-off ${FO.round}${FO.mode === 'bot' ? ` · ${FO_LEVELS[FO.level][0]}` : ''}</p>${body}<button type="button" class="link sg-snd" data-fo="sound">Sound: ${SGA.sound ? 'on' : 'off'}</button></div>`;
  foAttach(document.getElementById('sg-cv'));
}

function foReset() { foClear(); Object.assign(FO, { screen: 'menu', phase: 'idle', res: null, drop: 0, closing: false }); }
window.addEventListener('hashchange', () => { if (!/^#\/(resources|games)/.test(location.hash) && FO.screen !== 'menu') foReset(); });
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-fo-tap]'); if (!b || FO.screen !== 'play') return;
  e.preventDefault(); foTap(+b.dataset.foTap, e.timeStamp);
});
document.addEventListener('keydown', e => {
  if (RES.game !== 'faceoff' || FO.screen !== 'play' || e.repeat || (typeof BOSS !== 'undefined' && BOSS.on) || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) return;
  const k = e.key.toLowerCase();
  if (FO.phase === 'result') { if ((k === ' ' || k === 'enter') && FO.show) { e.preventDefault(); foNext(); } else if (!FO.show) { if (FO.mode === 'bot' ? [' ', 'enter', 'a', 'l'].includes(k) : k === 'a' || k === 'l') foLateTap(FO.mode === 'bot' || k === 'a' ? 0 : 1, e.timeStamp); } return; }
  if (FO.mode === 'bot') { if ([' ', 'enter', 'a', 'l'].includes(k)) { e.preventDefault(); foTap(0, e.timeStamp); } }
  else if (k === 'a') foTap(0, e.timeStamp); else if (k === 'l') foTap(1, e.timeStamp);
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-fo]'); if (!b || !document.getElementById('sg') || RES.game !== 'faceoff') return;
  const a = b.dataset.fo;
  if (a === 'start') foStart(b.dataset.mode);
  else if (a === 'level') { const n0 = document.getElementById('fo-n0'); if (n0) FO.names[0] = String(n0.value || '').replace(/[<>]/g, '').trim().slice(0, 20) || FO.names[0]; FO.level = b.dataset.level; foRender(); }
  else if (a === 'menu') { foReset(); foRender(); }
  else if (a === 'go') { if (FO.screen === 'setup') { const n0 = String(document.getElementById('fo-n0').value || '').replace(/[<>]/g, '').trim().slice(0, 20), n1 = document.getElementById('fo-n1'); FO.names = [n0 || 'Player 1', FO.mode === 'bot' ? 'Computer' : (String(n1.value || '').replace(/[<>]/g, '').trim().slice(0, 20) || 'Player 2')]; if (FO.mode === 'two' && FO.names[0] === FO.names[1]) FO.names[1] += ' 2'; } foBegin(); }
  else if (a === 'next') foNext();
  else if (a === 'skip') { if (FO.res && !FO.res.finished) FO.drop -= 6000; }
  else if (a === 'sound') { SGA.sound = !SGA.sound; try { localStorage.setItem('bhl_sg_sound', SGA.sound ? '1' : '0'); } catch { } b.textContent = SGA.sound ? 'Sound: on' : 'Sound: off'; if (SGA.sound) sgSound('save'); }
});
