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

function sgScene(reveal) {
  
  return `<svg class="sg-svg" viewBox="0 0 360 230" role="img" aria-label="Goal with goalie and puck">
    <rect width="360" height="230" fill="#eaf2fb"/><path d="M40 230 Q180 130 320 230Z" fill="#d6e6f7"/><circle cx="180" cy="196" r="4" fill="#c1272d"/>
    <rect x="68" y="52" width="224" height="96" rx="3" fill="#fff" stroke="#0b1f44" stroke-width="6"/>
    <g stroke="#c9d5e4" stroke-width="1.5">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => `<line x1="${68 + i * 25}" y1="52" x2="${68 + i * 25}" y2="148"/>`).join('')}${[0, 1, 2, 3].map(i => `<line x1="68" y1="${52 + i * 24}" x2="292" y2="${52 + i * 24}"/>`).join('')}</g>
    <g stroke="#9db3cf" stroke-width="1.5" stroke-dasharray="4 4"><line x1="143" y1="52" x2="143" y2="148"/><line x1="217" y1="52" x2="217" y2="148"/></g>
    <g id="sg-goalie" style="transform:translate(0,0);transition:transform .55s cubic-bezier(.3,.9,.3,1)"><g transform="translate(180 102)"><rect x="-17" y="-8" width="34" height="46" rx="6" fill="#0b1f44"/><circle cx="0" cy="-20" r="12" fill="#13306b"/><rect x="-30" y="-2" width="13" height="30" rx="4" fill="#c1272d"/><rect x="17" y="-2" width="13" height="30" rx="4" fill="#c1272d"/><rect x="-14" y="38" width="28" height="9" rx="3" fill="#13306b"/></g></g>
    <g id="sg-puck" style="transform:translate(0,0);transition:transform .45s ease-in"><ellipse cx="180" cy="205" rx="11" ry="5" fill="#111827"/></g></svg>`;
}
function sgDots(i) {
  const total = Math.max(SG_ROUNDS, SG.log[0].length, SG.log[1].length);
  return Array.from({ length: total }, (_, k) => { const r = SG.log[i][k]; return `<span class="sg-dot ${r === 'G' ? 'g' : r === 'S' ? 's' : ''}">${r === 'G' ? '●' : r === 'S' ? '✕' : '○'}</span>`; }).join('');
}
function sgBoard() {
  const s = sgShooter(), live = SG.screen === 'play';
  return `<div class="sg-board">${[0, 1].map(i => `<div class="sg-side ${live && s === i ? 'on' : ''}"><b>${esc(sgName(i))}</b><span class="sg-num">${SG.score[i]}</span><div class="sg-dots" aria-label="shots">${sgDots(i)}</div></div>`).join('')}</div>`;
}
const sgPicker = label => `<p class="sg-say">${label}</p><div class="sg-picks">${Object.entries(SG_DIRS).map(([k, v]) => `<button type="button" class="btn sg-pick" data-sg="pick" data-dir="${k}">${k === 'L' ? '◀ ' : ''}${v}${k === 'R' ? ' ▶' : ''}</button>`).join('')}</div>`;

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
    body = `<p class="sg-say"><span class="sg-result ${goal ? 'goal' : 'save'}">${goal ? 'GOAL!' : 'SAVED!'}</span> ${who} shot ${SG_DIRS[SG.shot.shoot].toLowerCase()}, ${esc(sgName(g))} went ${SG_DIRS[SG.shot.dive].toLowerCase()}.</p><div class="btnrow"><button class="btn" data-sg="next">${sgOver() >= 0 ? 'See result' : 'Next shot'}</button></div>`;
  } else if (SG.phase === 'shooter') {
    body = sgPicker(`<b>${esc(sgName(s))}</b>, where do you shoot?${SG.mode === 'two' ? ` <span class="muted">(${esc(sgName(g))}, look away)</span>` : ''}`);
  } else if (SG.phase === 'pass') {
    body = `<p class="sg-say">Shot locked in. Pass the device to <b>${esc(sgName(g))}</b>.</p><div class="btnrow"><button class="btn" data-sg="ready">I'm ${esc(sgName(g))}, ready</button></div>`;
  } else {
    body = sgPicker(`<b>${esc(sgName(g))}</b>, which way do you dive?${SG.mode === 'bot' ? ' <span class="muted">(the computer is shooting)</span>' : ''}`);
  }
  root.innerHTML = `${sgBoard()}<div class="sg-scene">${sgScene(reveal)}</div><div class="sg-ctl"><p class="muted sg-meta">${SG.log[0].length >= SG_ROUNDS && SG.log[0].length === SG.log[1].length ? 'Sudden death' : `Shot ${Math.floor(SG.n / 2) + 1}${SG.log[0].length > SG_ROUNDS - 1 ? ' · sudden death' : ` of ${SG_ROUNDS}`}`} · ${esc(sgName(s))} shooting</p>${body}</div>`;
  if (reveal) {
    const goalie = document.getElementById('sg-goalie'), puck = document.getElementById('sg-puck'), px = { L: -86, M: 0, R: 86 }[SG.shot.shoot];
    setTimeout(() => { goalie.style.transform = `translate(${SG_X[SG.shot.dive]}px,0)`; puck.style.transform = `translate(${px}px,-98px)`; }, 40);
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
});
