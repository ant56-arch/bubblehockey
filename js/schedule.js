/* Schedule: automatic daily matchups, worked out from the date alone (nothing to enter).
   - Playoffs take up to 2 game days ("schedule.playoffDays", default 2, max 2) and are placed just before the month's last game day,
     which is left open as a makeup day ("schedule.makeupDay": false turns that off). "schedule.playoffDates" can pin exact dates for a month. The regular round robin runs on the days before.
   - Every game day (Mon-Fri, minus the holidays below and any data/config.json "schedule.skipDates") is a full round robin: each player plays each other player once.
   - A player is only scheduled from their "established" date on (data/members.csv), so adding a player never rewrites past days.
   - Home/road sides alternate every game day, so over any two game days each player has played the same number of games on each side.
   - Games are ordered so a player rests between games when possible.
   - "schedule.autoDnpFrom" (a date, optional): from that date on, a scheduled regular game on a past day that was never logged is shown as DNP
     (only on days where at least one game or DNP was logged; never counted in any record).
   - "schedule.roundsPerDay" (optional) limits a day to that many rounds (each round = everyone plays once); the rounds then continue on the next day. */

const SCHED = () => ({ roundsPerDay: 0, skipDates: [], holidays: true, playoffDays: 2, playoffDates: {}, makeupDay: true, autoDnpFrom: '', ...(D.config.schedule || {}) });
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYmd = s => { const [y, m, d] = s.split('-'); return new Date(+y, +m - 1, +d); };
/* Days off: New Year's Day, Memorial Day, Independence Day, Labor Day, Thanksgiving and Christmas. A fixed-date holiday that
   lands on a weekend is observed on the nearest weekday (Saturday -> Friday, Sunday -> Monday). */
const holidayCache = {};
function holidaysOf(year) {
  if (holidayCache[year]) return holidayCache[year];
  const nth = (m, wd, n) => { const d = new Date(year, m, 1); d.setDate(1 + ((wd - d.getDay() + 7) % 7) + 7 * (n - 1)); return d; };
  const last = (m, wd) => { const d = new Date(year, m + 1, 0); d.setDate(d.getDate() - ((d.getDay() - wd + 7) % 7)); return d; };
  const fixed = (m, day) => { const d = new Date(year, m, day), wd = d.getDay(); if (wd === 6) d.setDate(d.getDate() - 1); if (wd === 0) d.setDate(d.getDate() + 1); return d; };
  const list = [["New Year's Day", fixed(0, 1), new Date(year, 0, 1)], ['Memorial Day', last(4, 1)], ['Independence Day', fixed(6, 4), new Date(year, 6, 4)],
    ['Labor Day', nth(8, 1, 1)], ['Thanksgiving', nth(10, 4, 4)], ['Christmas Day', fixed(11, 25), new Date(year, 11, 25)]];
  return holidayCache[year] = list.map(([name, d, actual]) => ({ name, date: ymd(d), observed: actual && ymd(actual) !== ymd(d) }));
}
const holidayOn = s => { if (SCHED().holidays === false) return null; const y = +s.slice(0, 4); return [...holidaysOf(y), ...holidaysOf(y + 1)].find(h => h.date === s) || null; };
const isGameDay = s => { const wd = parseYmd(s).getDay(); return wd >= 1 && wd <= 5 && !SCHED().skipDates.includes(s) && !holidayOn(s); };
/* Days off in a month (holidays that fall on a weekday after observing, plus any skipDates), for display. */
function daysOffIn(month) {
  const [y, m] = month.split('-'), out = [];
  for (const d = new Date(+y, +m - 1, 1); d.getMonth() === +m - 1; d.setDate(d.getDate() + 1)) {
    const s = ymd(d), h = holidayOn(s), wd = d.getDay();
    if (h) out.push({ date: s, name: h.name + (h.observed ? ' (observed)' : '') }); else if (wd >= 1 && wd <= 5 && SCHED().skipDates.includes(s)) out.push({ date: s, name: 'No games' });
  }
  return out;
}
function gameDaysIn(month) {
  const [y, m] = month.split('-'), out = [];
  for (const d = new Date(+y, +m - 1, 1); d.getMonth() === +m - 1; d.setDate(d.getDate() + 1)) { const s = ymd(d); if (isGameDay(s)) out.push(s); }
  return out;
}

/* Regular-season days, playoff days and the makeup day for a month. */
function monthPlan(month) {
  const all = gameDaysIn(month), fixed = (SCHED().playoffDates || {})[month];       // optional: pin a month's playoff dates in config.json
  if (Array.isArray(fixed) && fixed.length) return { reg: all.filter(d => d < fixed[0]), po: fixed, spare: all.filter(d => d > fixed[fixed.length - 1]) };
  const n = Math.min(2, Math.max(0, +SCHED().playoffDays || 0), all.length);
  // Once playoff games are logged, the days they were played on are the playoff days (plus the next planned day if the final is still to come).
  const played = [...new Set(D.games.filter(g => g.playoff && g.month === month && g.date).map(g => g.date))].sort();
  if (played.length) {
    const extra = buildBracket(month).champion ? [] : all.filter(d => d > played[played.length - 1]).slice(0, Math.max(0, n - played.length));
    const po = [...played, ...extra];
    return { reg: all.filter(d => d < po[0]), po, spare: all.filter(d => d > po[po.length - 1]) };
  }
  // Playoffs never land on a day that already has regular games logged: they start after the last logged regular game.
  const lastReg = D.games.filter(g => !g.playoff && g.month === month).reduce((m, g) => (g.date > m ? g.date : m), '');
  const idx = lastReg ? all.findIndex(d => d > lastReg) : 0, firstOpen = idx === -1 ? all.length : idx;
  let spare = SCHED().makeupDay !== false && all.length - n - 1 >= 1 ? 1 : 0;
  const start = Math.max(all.length - spare - n, firstOpen);
  if (all.length - start < n + spare) spare = 0;                                // not enough days left for a makeup day too
  const end = all.length - spare;
  return { reg: all.slice(0, start), po: all.slice(start, end), spare: all.slice(end) };
}
const dayKind = date => { const p = monthPlan(date.slice(0, 7)); return p.reg.includes(date) ? 'regular' : p.po.includes(date) ? 'playoff' : p.spare.includes(date) ? 'spare' : null; };

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
/* The regular-season matchups for one date, or null if it is not a regular game day. */
function slateFor(date) {
  const names = D.members.filter(m => !m.established || m.established <= date).map(m => m.short_name), n = names.length;      // a new player joins the schedule on their established date
  const k = monthPlan(date.slice(0, 7)).reg.indexOf(date);
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
const PO_LABELS = { 1: ['Seed 1', 'Seed 4'], 2: ['Seed 2', 'Seed 3'], 3: ['Loser G1', 'Loser G2'], 4: ['Winner G1', 'Winner G2'], 5: ['Loser G4', 'Winner G3'], 6: ['Winner G4', 'Winner G5'], 7: ['Winner G6', 'Loser G6'] };
const PO_SPLITS = { 1: [[1, 2, 3, 4, 5, 6, 7]], 2: [[1, 2, 3, 4], [5, 6, 7]], 3: [[1, 2], [3, 4], [5, 6, 7]], 4: [[1, 2], [3, 4], [5], [6, 7]], 5: [[1, 2], [3, 4], [5], [6], [7]] };
function playoffView(date) {
  const month = date.slice(0, 7), { po } = monthPlan(month), B = buildBracket(month), { G } = B;
  const mk = n => ({ n, a: G[n].a, b: G[n].b, sa: G[n].sa, sb: G[n].sb, w: G[n].w, skipped: G[n].skipped, la: PO_LABELS[n]?.[0], lb: PO_LABELS[n]?.[1], score: B.scores[n] });
  const nums = [1, 2, 3, 4, 5, 6, 7];
  let rows = nums.filter(n => B.dates[n] === date).map(mk);                          // games played on this day
  const lastPlayed = Object.values(B.dates).sort().pop() || '', open = po.filter(d => d > lastPlayed);
  if (open.includes(date)) {                                                         // games still to play, split over the days left
    const pending = nums.filter(n => !G[n].w && !G[n].skipped), split = PO_SPLITS[Math.min(open.length, 5)];
    rows = rows.concat(split[open.indexOf(date)].filter(n => pending.includes(n)).map(mk));
  }
  return { date, playoff: true, rows, projected: B.live && date >= todayStr() };
}
function dayView(date) {
  const kind = dayKind(date); if (!kind) return null;
  if (kind === 'playoff') return playoffView(date);
  if (kind === 'spare') return { date, spare: true, rows: [], extra: D.games.filter(g => g.date === date && isCounted(g)) };
  const slate = slateFor(date);
  const played = D.games.filter(g => g.date === date && !g.playoff), used = new Set();
  const rows = slate.map(s => {
    const i = played.findIndex((g, j) => !used.has(j) && ((g.home === s.home && g.road === s.road) || (g.home === s.road && g.road === s.home)));
    if (i >= 0) used.add(i);
    return { ...s, result: i >= 0 ? played[i] : null };
  });
  // Automatic DNP: on a past day that had any game or DNP logged, scheduled games that never appeared are DNP.
  if (played.length && autoDnpDay(date)) rows.forEach(r => { if (!r.result) r.result = { dnp: true, auto: true, home: r.home, road: r.road, date }; });
  return { date, rows, extra: played.filter((g, j) => !used.has(j) && !g.dnp) };
}

const todayStr = () => ymd(new Date());
const autoDnpDay = date => { const from = SCHED().autoDnpFrom; return !!from && date >= from && date < todayStr(); };
/* The automatic DNP games of a month, shaped like logged DNP games (they are never counted in the standings). */
function derivedDnp(month) {
  if (!SCHED().autoDnpFrom) return [];
  const out = [];
  for (const d of monthPlan(month).reg) {
    if (!autoDnpDay(d)) continue;
    const v = dayView(d); if (!v) continue;
    v.rows.forEach(r => { if (r.result && r.result.auto) out.push({ seq: 1e6 + out.length, date: d, home: r.home, road: r.road, hg: NaN, rg: NaN, hs: 0, rs: 0, ot: false, playoff: false, dnp: true, auto: true, month }); });
  }
  return out;
}
/* Every DNP game: the logged ones plus the automatic ones. */
const allDnp = () => [...D.games.filter(g => g.dnp), ...[...new Set([...D.games.map(g => g.month), cur()])].flatMap(derivedDnp)];
const dayLabel = s => parseYmd(s).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });

function playoffDayCard(v) {
  const today = v.date === todayStr();
  const row = r => {
    const side = (p, seed, label, won) => `<span class="side ${won ? 'win' : ''}">${p ? who(p, 26) + (seed ? ` <span class="seed">#${seed}</span>` : '') : `<span class="muted">${label || 'TBD'}</span>`}</span>`;
    return `<div class="mrow ${r.skipped ? 'skipped' : ''}"><span class="gno">${r.n}</span>${side(r.a, r.sa, r.la, r.w && r.w === r.a)}<span class="vs">${r.skipped ? 'not needed' : r.score ? `<b>${scoreHTML(r.score[r.a], r.score[r.b])}</b>` : r.w ? '✔' : (r.n === 7 ? 'if needed' : 'vs')}</span>${side(r.b, r.sb, r.lb, r.w && r.w === r.b).replace('class="side', 'class="side r')}</div>`;
  };
  return `<div class="card day ${today ? 'today' : ''}"><div class="dayhead"><b>${dayLabel(v.date)}</b><span class="tag">Playoffs</span>${today ? '<span class="tag">Today</span>' : ''}<span class="muted">${v.rows.length} games</span></div>
    ${v.rows.length ? `<div class="mhead"><span></span><span>Matchup</span><span></span><span class="r"></span></div>${v.rows.map(row).join('')}` : '<p class="muted" style="margin:0">All playoff games are done.</p>'}
    ${v.projected ? '<p class="muted" style="margin:10px 0 0">Seeds are projected from the current standings until the regular season ends.</p>' : ''}</div>`;
}
function spareDayCard(v) {
  const today = v.date === todayStr();
  return `<div class="card day ${today ? 'today' : ''}"><div class="dayhead"><b>${dayLabel(v.date)}</b><span class="tag">Makeup day</span>${today ? '<span class="tag">Today</span>' : ''}</div>
    <p class="muted" style="margin:0">No scheduled games. This day is kept open for any games that were missed or postponed, including playoff games.</p>
    ${v.extra.length ? `<p style="margin:10px 0 0">Played: ${v.extra.map(g => `${esc(g.home)} ${g.hg}–${g.rg} ${esc(g.road)}`).join(', ')}</p>` : ''}</div>`;
}
function dayCard(v) {
  if (v.playoff) return playoffDayCard(v);
  if (v.spare) return spareDayCard(v);
  const today = v.date === todayStr(), past = v.date < todayStr();
  const row = (r, i) => {
    const g = r.result, winner = g && !g.dnp ? (g.hg > g.rg ? g.home : g.road) : '', hw = winner === r.home, rw = winner === r.road;      // the logged game may have the sides the other way round
    if (g && g.dnp) return `<div class="mrow dnp"><span class="gno">${i + 1}</span><span class="side">${who(r.home, 26)}</span><span class="vs"><span class="tag dnp">DNP</span></span><span class="side r">${who(r.road, 26)}</span></div>`;
    return `<div class="mrow"><span class="gno">${i + 1}</span><span class="side ${hw ? 'win' : ''}">${who(r.home, 26)}</span>
      <span class="vs">${g ? `<b>${g.home === r.home ? scoreHTML(g.hg, g.rg) : scoreHTML(g.rg, g.hg)}</b>${g.ot ? ' <span class="tag">OT</span>' : ''}` : 'vs'}</span>
      <span class="side r ${rw ? 'win' : ''}">${who(r.road, 26)}</span></div>`;
  };
  const done = v.rows.filter(r => r.result && !r.result.dnp).length, dnpCount = v.rows.filter(r => r.result && r.result.dnp).length;
  return `<div class="card day ${today ? 'today' : ''}"><div class="dayhead"><b>${dayLabel(v.date)}</b>${today ? '<span class="tag">Today</span>' : ''}<span class="muted">${v.rows.length} games${done ? ` · ${done} played` : (past && !dnpCount ? ' · none played' : '')}${dnpCount ? ` · ${dnpCount} DNP` : ''}</span></div>
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
  // Past days with no games logged (e.g. before the league started) are left out; today and future days always show.
  const hadGames = d => D.games.some(g => g.date === d && (isCounted(g) || g.dnp));
  const days = mode === 'month' ? gameDaysIn(cur()).filter(d => d >= todayStr() || hadGames(d)) : upcomingDays(5);
  return `<h1>Schedule</h1><p class="lead">Matchups are generated automatically every game day (Monday to Friday). Everyone plays everyone, and home and road sides alternate each day. Playoffs are held near the end of each month, and the last game day is kept open as a makeup day.</p>${chips}
    ${(() => { const off = daysOffIn(cur()); return off.length ? `<p class="muted">No games: ${off.map(o => `${esc(o.name)}, ${dayLabel(o.date)}`).join(' · ')}</p>` : ''; })()}
    <div class="days">${days.map(d => dayCard(dayView(d))).join('') || '<p class="muted">No game days found.</p>'}</div>${balanceCard(cur())}`;
};
