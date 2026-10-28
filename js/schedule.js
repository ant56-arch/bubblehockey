/* Schedule: automatic daily matchups, worked out from the date alone (nothing to enter).
   - Every game day (Mon-Fri, minus data/config.json "schedule.skipDates") is a full round robin: each player plays each other player once.
   - Home/road sides alternate every game day, so over any two game days each player has played the same number of games on each side.
   - Games are ordered so a player rests between games when possible.
   - "schedule.roundsPerDay" (optional) limits a day to that many rounds (each round = everyone plays once); the rounds then continue on the next day. */

const SCHED = () => ({ roundsPerDay: 0, skipDates: [], ...(D.config.schedule || {}) });
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYmd = s => { const [y, m, d] = s.split('-'); return new Date(+y, +m - 1, +d); };
const isGameDay = s => { const wd = parseYmd(s).getDay(); return wd >= 1 && wd <= 5 && !SCHED().skipDates.includes(s); };
function gameDaysIn(month) {
  const [y, m] = month.split('-'), out = [];
  for (const d = new Date(+y, +m - 1, 1); d.getMonth() === +m - 1; d.setDate(d.getDate() + 1)) { const s = ymd(d); if (isGameDay(s)) out.push(s); }
  return out;
}

/* Who is home in the pairing of player indexes lo < hi (before the day-to-day flip). A cyclic tournament: each
   player is home against the next few players in the list, so home games are spread evenly (within one game). */
function loIsHome(lo, hi, N) {
  const diff = hi - lo;
  if (N % 2) return diff <= (N - 1) / 2;
  if (diff === N / 2) return lo % 2 === 0;
  return diff < N / 2;
}
/* Put the games in an order where players rest between games whenever possible. */
function orderGames(games) {
  const left = [...games], out = []; let last = new Set();
  while (left.length) {
    let best = 0, bestScore = Infinity;
    left.forEach((g, i) => { const s = (last.has(g.home) ? 1 : 0) + (last.has(g.road) ? 1 : 0); if (s < bestScore) { best = i; bestScore = s; } });
    const [g] = left.splice(best, 1); out.push(g); last = new Set([g.home, g.road]);
  }
  return out;
}
/* The matchups for one date, or null if it is not a game day. */
function slateFor(date) {
  const names = D.members.map(m => m.short_name), n = names.length;
  const k = gameDaysIn(date.slice(0, 7)).indexOf(date);
  if (k < 0) return null;
  if (n < 2) return [];
  const t = [...Array(n).keys()]; if (n % 2) t.push(-1);          // -1 = a bye when the player count is odd
  const M = t.length, rounds = M - 1, R = SCHED().roundsPerDay > 0 ? Math.min(+SCHED().roundsPerDay, rounds) : rounds;
  const games = [];
  for (let i = 0; i < R; i++) {
    const q = k * R + i, r = q % rounds, cycle = Math.floor(q / rounds);
    const arr = [t[0], ...Array.from({ length: M - 1 }, (_, p) => t[1 + ((p + r) % (M - 1))])];
    for (let x = 0; x < M / 2; x++) {
      const a = arr[x], b = arr[M - 1 - x]; if (a < 0 || b < 0) continue;
      const lo = Math.min(a, b), hi = Math.max(a, b), loHome = loIsHome(lo, hi, n) !== (cycle % 2 === 1);
      games.push(loHome ? { home: names[lo], road: names[hi] } : { home: names[hi], road: names[lo] });
    }
  }
  return orderGames(games);
}

/* Pair each scheduled game with a game already in the log (same day, same two players). */
function dayView(date) {
  const slate = slateFor(date); if (slate === null) return null;
  const played = D.games.filter(g => g.date === date), used = new Set();
  const rows = slate.map(s => {
    const i = played.findIndex((g, j) => !used.has(j) && ((g.home === s.home && g.road === s.road) || (g.home === s.road && g.road === s.home)));
    if (i >= 0) used.add(i);
    return { ...s, result: i >= 0 ? played[i] : null };
  });
  return { date, rows, extra: played.filter((_, j) => !used.has(j)) };
}

const todayStr = () => ymd(new Date());
const dayLabel = s => parseYmd(s).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });

function dayCard(v) {
  const today = v.date === todayStr(), past = v.date < todayStr();
  const row = (r, i) => {
    const g = r.result, hw = g && g.hg > g.rg, rw = g && g.rg > g.hg;
    return `<div class="mrow"><span class="gno">${i + 1}</span><span class="side ${hw ? 'win' : ''}">${who(r.home, 26)}</span>
      <span class="vs">${g ? `<b>${g.home === r.home ? `${g.hg} – ${g.rg}` : `${g.rg} – ${g.hg}`}</b>${g.ot ? ' <span class="tag">OT</span>' : ''}` : 'vs'}</span>
      <span class="side r ${rw ? 'win' : ''}">${who(r.road, 26)}</span></div>`;
  };
  const done = v.rows.filter(r => r.result).length;
  return `<div class="card day ${today ? 'today' : ''}"><div class="dayhead"><b>${dayLabel(v.date)}</b>${today ? '<span class="tag">Today</span>' : ''}<span class="muted">${v.rows.length} games${done ? ` · ${done} played` : (past ? ' · none played' : '')}</span></div>
    <div class="mhead"><span></span><span>Home</span><span></span><span class="r">Road</span></div>${v.rows.map(row).join('')}
    ${v.extra.length ? `<p class="muted" style="margin:10px 0 0">Also played: ${v.extra.map(g => `${esc(g.home)} ${g.hg}–${g.rg} ${esc(g.road)}`).join(', ')}</p>` : ''}</div>`;
}

function upcomingDays(count = 5) {
  const out = [], d = new Date();
  for (let i = 0; i < 60 && out.length < count; i++, d.setDate(d.getDate() + 1)) { const s = ymd(d); if (isGameDay(s)) out.push(s); }
  return out;
}
function balanceCard(month) {
  const t = {}; D.members.forEach(m => t[m.short_name] = { h: 0, r: 0 });
  monthGames(month).forEach(g => { (t[g.home] ??= { h: 0, r: 0 }).h++; (t[g.road] ??= { h: 0, r: 0 }).r++; });
  return `<h2>Home / road games in ${monthLabel(month)}</h2><div class="table-scroll"><table><thead><tr><th>Player</th><th class="n">Home</th><th class="n">Road</th><th class="n">Difference</th></tr></thead><tbody>${
    Object.entries(t).map(([n, v]) => `<tr><td>${who(n)}</td><td class="n">${v.h}</td><td class="n">${v.r}</td><td class="n">${v.h - v.r > 0 ? '+' : ''}${v.h - v.r}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted" style="margin-top:10px">Sides flip every game day, so after any two game days everyone has played the same number of games at home and on the road.</p>`;
}

/* Small card for the Home page. */
function todayCard() {
  if (D.members.length < 2) return '';
  const day = upcomingDays(1)[0]; if (!day) return '';
  return `<h2>${day === todayStr() ? "Today's matchups" : 'Next matchups'}</h2>${dayCard(dayView(day))}<p><a href="#/schedule">See the full schedule →</a></p>`;
}

view.schedule = function () {
  if (D.members.length < 2) return '<h1>Schedule</h1><p class="muted">Add at least two members to generate a schedule.</p>';
  const mode = UI.schedule === 'month' ? 'month' : 'upcoming';
  const chips = `<div class="chips">${[['upcoming', 'Upcoming'], ['month', monthLabel(cur())]].map(([k, l]) => `<button type="button" class="chip ${mode === k ? 'on' : ''}" data-page="schedule" data-m="${k}">${l}</button>`).join('')}</div>`;
  const days = mode === 'month' ? gameDaysIn(cur()) : upcomingDays(5);
  return `<h1>Schedule</h1><p class="lead">Matchups are generated automatically every game day (Monday to Friday). Everyone plays everyone, and home and road sides alternate each day.</p>${chips}
    <div class="days">${days.map(d => dayCard(dayView(d))).join('') || '<p class="muted">No game days found.</p>'}</div>${balanceCard(cur())}`;
};
