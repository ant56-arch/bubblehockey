/* Bubble Hockey League site. All data lives in /data (see README). */
const PAGES = [
  ['home', 'Home'], ['rules', 'Rules'], ['members', 'Members'], ['schedule', 'Schedule'],
  ['gamelog', 'Game Log'], ['standings', 'Standings'], ['playoffs', 'Playoffs'],
];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = ''; rows.push(row); row = [];
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(v => v.trim() !== ''));
  if (!head) return [];
  const keys = head.map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const D = { baseProblems: [], gameProblems: [] };
Object.defineProperty(D, 'problems', { get() { return [...this.baseProblems, ...this.gameProblems]; } });
/* A game counts in the standings and records when it has two different scores (playoff games count too). */
const isCounted = g => !isNaN(g.hg) && !isNaN(g.rg) && g.hg !== g.rg;

/* All the data is static files in /data: games.json (every game, including playoff games), members.csv, config.json and the page text. */
/* GitHub helpers shared by every page. The token (kept only in this browser by the Add / Edit tab) lets this device read games.json straight from GitHub,
   so it shows a save at once instead of waiting for the public copy to update. Everyone else just reads the public copy. */
function repoInfo() {
  const h = location.hostname, seg = location.pathname.split('/')[1];
  if (/\.github\.io$/.test(h) && seg) return { owner: h.split('.')[0], repo: seg, branch: D.config.branch || 'main' };
  const [owner, repo] = (D.config.repo || '').split('/'); return { owner, repo, branch: D.config.branch || 'main' };
}
const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)));
const b64enc = s => { let bin = ''; new TextEncoder().encode(s).forEach(x => bin += String.fromCharCode(x)); return btoa(bin); };
async function freshGamesText() {
  let token = ''; try { token = localStorage.getItem('bhl_token') || ''; } catch { }
  const { owner, repo, branch } = repoInfo(); if (!token || !owner || !repo) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/data/games.json?ref=${branch}`, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token } });
    return r.ok ? b64dec((await r.json()).content) : null;      // expired or rejected token: quietly use the public copy
  } catch { return null; }
}

/* Read the text of games.json into D.games (and the warnings). Also used after a save from the Add / Edit tab, so the site updates at once. */
function applyGamesText(gamesText) {
  D.gameProblems = [];
  let file = {};
  try { file = JSON.parse(gamesText || '{}'); }
  catch (e) { D.gameProblems.push(`data/games.json has a typo and could not be read (${e.message}). Check for a missing comma, bracket or quote near the last game you added.`); }
  D.seedsOverride = (!Array.isArray(file) && file.playoffSeeds) || {};
  D.rawGames = Array.isArray(file) ? file : file.games || [];
  const known = new Set(D.members.map(m => m.short_name));
  const num = v => (v === '' || v == null ? NaN : +v);
  D.games = [];
  (Array.isArray(file) ? file : file.games || []).forEach((g, i) => {
    const where = `Game ${i + 1} in games.json (${g.date || g.month || 'no date'}, ${g.home || '?'} vs ${g.road || '?'})`;
    const bad = msg => D.gameProblems.push(`${where} was skipped: ${msg}.`);
    const date = g.date || '', month = date ? date.slice(0, 7) : g.month || '';      // a playoff game may have just a month
    if (date ? !/^\d{4}-\d{2}-\d{2}$/.test(date) : !(g.playoff && /^\d{4}-\d{2}$/.test(month))) return bad(g.playoff ? 'it needs a date (2026-11-03) or a month (2026-11)' : 'the date must look like 2026-11-03');
    if (!g.home || !g.road || g.home === g.road) return bad('it needs two different players');
    const unknown = [g.home, g.road].find(n => !known.has(n));
    if (unknown) return bad(`"${unknown}" is not a member (names must match the short names in members.csv exactly)`);
    if (g.dnp) { D.games.push({ seq: i, date, home: g.home, road: g.road, hg: NaN, rg: NaN, hs: 0, rs: 0, ot: false, playoff: false, dnp: true, winner: '', month }); return; }   // did not play: shown, never counted
    const hg = num(g.homeScore), rg = num(g.roadScore), playoff = !!g.playoff, hasScores = !isNaN(hg) && !isNaN(rg);
    if (!playoff && (!hasScores || hg === rg)) return bad('it needs two different scores (homeScore and roadScore)');
    if (playoff && !(hasScores && hg !== rg) && ![g.home, g.road].includes(g.winner)) return bad('a playoff game needs two different scores or a "winner"');
    D.games.push({ seq: i, date, home: g.home, road: g.road, hg, rg, hs: +g.homeShots || 0, rs: +g.roadShots || 0, ot: !!g.overtime, playoff, winner: g.winner || '', month });
  });
  D.games.sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq);
  const count = {}; D.games.forEach(g => { if (isCounted(g)) g.id = count[g.month] = (count[g.month] || 0) + 1; });

  // Warnings for entries that are accepted but look wrong (so a typo does not go unnoticed).
  const d0 = new Date(), today = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
  const name = g => `Game ${g.seq + 1} in games.json (${g.date || g.month}, ${g.home} vs ${g.road})`, seen = {}, warn = [];
  for (const g of D.games) {
    if (g.date && g.date > today) warn.push(`${name(g)} is dated in the future. Check the year.`);
    const key = [g.date, g.month, g.home, g.road, g.hg, g.rg, g.hs, g.rs, g.ot, g.playoff, g.dnp, g.winner].join('|');
    if (seen[key] !== undefined) warn.push(`${name(g)} looks identical to game ${seen[key] + 1}. Is it a duplicate?`); else seen[key] = g.seq;
  }
  for (const m of [...new Set(D.games.filter(g => g.playoff).map(g => g.month))].sort())
    for (const g of buildBracket(m).unmatched) warn.push(`Playoff ${name(g)} does not fit the ${monthLabel(m)} bracket (wrong players for the next open game, or not needed). Playoff games must be entered in the order they were played.`);
  D.gameProblems.push(...warn.slice(0, 8), ...(warn.length > 8 ? [`...and ${warn.length - 8} more.`] : []));
}

async function load() {
  const get = async (f, kind) => {
    try { const r = await fetch('data/' + f, { cache: 'no-cache' }); if (!r.ok) throw 0; return kind === 'json' ? r.json() : kind === 'text' ? r.text() : parseCSV(await r.text()); }
    catch { return kind === 'json' ? {} : kind === 'text' ? '' : []; }
  };
  const getGames = async () => {
    try { const r = await fetch('data/games.json', { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
    catch (e) { D.baseProblems.push(`data/games.json could not be loaded (${e.message}). If you opened index.html straight from your computer, use the published site or run a local web server (see the README).`); return ''; }
  };
  const [config, members, gamesText, home, rules] = await Promise.all([
    get('config.json', 'json'), get('members.csv'), getGames(), get('home.txt', 'text'), get('rules.txt', 'text')]);
  D.config = { leagueName: 'Bubble Hockey League', tagline: '', ...config, points: { win: 3, overtimeWin: 2, overtimeLoss: 1, loss: 0, ...config.points } };
  D.members = members.map(m => ({ ...m, short_name: m.short_name || m.name }));
  D.home = home; D.rules = rules;

  applyGamesText((await freshGamesText()) ?? gamesText);
}

/* ---------- helpers ---------- */
const cmpOld = (a, b) => a.date.localeCompare(b.date) || a.seq - b.seq;
const cmpNew = (a, b) => cmpOld(b, a);
const monthLabel = m => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' }); };
/* Short date for tables: the year only when it is not the current year. */
const dateShort = d => { const [y, m, dd] = d.split('-'), t = new Date(+y, +m - 1, +dd); return t.toLocaleDateString('en', { month: 'short', day: 'numeric', ...(+y !== new Date().getFullYear() ? { year: 'numeric' } : {}) }); };
const dateLabel = d => { const [y, m, dd] = d.split('-'); return new Date(+y, +m - 1, +dd).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }); };
/* The current month is simply the month it is today (on the viewer's clock). */
const cur = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthGames = m => D.games.filter(g => g.month === m && isCounted(g));      // every game that counts, playoff games included
const monthLog = m => [...D.games.filter(g => g.month === m && (isCounted(g) || g.dnp)), ...(typeof derivedDnp === 'function' ? derivedDnp(m) : [])];      // what the Game Log lists (counted games + DNP games)
const hasPlayoffs = m => D.games.some(g => g.month === m && g.playoff);
const pastMonths = () => [...new Set(D.games.map(g => g.month))].filter(m => m !== cur()).sort().reverse();
const member = n => D.members.find(m => m.short_name === n);
const who = (n, size = 26) => { const m = member(n); return `<span class="who">${m?.logo ? `<img class="tlogo" style="width:${size}px;height:${size}px" src="${esc(m.logo)}" alt="" loading="lazy">` : ''}<span>${esc(n)}</span></span>`; };
const UI = {};
const chipsFor = (page, months, labelExtra) => {
  const sel = months.includes(UI[page]) ? UI[page] : months[0];
  return { sel, html: `<div class="chips" role="tablist">${months.map(m => `<button type="button" class="chip ${m === sel ? 'on' : ''}" data-page="${page}" data-m="${m}">${monthLabel(m)}${labelExtra ? `<small>${labelExtra(m)}</small>` : ''}</button>`).join('')}</div>` };
};
/* A score with the winning number (and the winning team elsewhere) in green. */
const scoreHTML = (a, b) => `<span class="${a > b ? 'win' : ''}">${a}</span> – <span class="${b > a ? 'win' : ''}">${b}</span>`;
const pct = x => (isFinite(x) ? (x * 100).toFixed(1) + '%' : '–');

function standingsFor(games) {
  const P = D.config.points, t = {};
  const row = n => t[n] ??= { name: n, gp: 0, w: 0, l: 0, otw: 0, otl: 0, gf: 0, ga: 0, sf: 0, sa: 0, so: 0, pts: 0, hw: 0, hl: 0, rw: 0, rl: 0, form: [] };
  D.members.forEach(m => row(m.short_name));
  for (const g of [...games].sort(cmpOld)) {
    const h = row(g.home), r = row(g.road), homeWon = g.hg > g.rg;
    h.gp++; r.gp++;
    h.gf += g.hg; h.ga += g.rg; r.gf += g.rg; r.ga += g.hg;
    h.sf += g.hs; h.sa += g.rs; r.sf += g.rs; r.sa += g.hs;
    const [win, lose] = homeWon ? [h, r] : [r, h];
    if (g.ot) { win.otw++; win.pts += P.overtimeWin; lose.otl++; lose.pts += P.overtimeLoss; }
    else { win.w++; win.pts += P.win; lose.l++; lose.pts += P.loss; }
    if ((homeWon ? g.rg : g.hg) === 0) win.so++;
    homeWon ? (h.hw++, r.rl++) : (r.rw++, h.hl++);
    win.form.push('W'); lose.form.push('L');
  }
  return Object.values(t).map(r => {
    const last = r.form[r.form.length - 1]; let n = 0;
    for (let i = r.form.length - 1; i >= 0 && r.form[i] === last; i--) n++;
    return { ...r, streak: last ? last + n : '–' };
  }).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.name.localeCompare(b.name));
}

/* Every player's record in every month: wins-losses-overtime losses, and points. */
function monthlyRecords() {
  const months = [...new Set(D.games.filter(isCounted).map(g => g.month))].sort().reverse();
  if (!months.length) return '';
  const by = Object.fromEntries(months.map(m => [m, Object.fromEntries(standingsFor(monthGames(m)).map(r => [r.name, r]))]));
  return `<h2>Record by month</h2><div class="table-scroll"><table><thead><tr><th>Player</th>${months.map(m => `<th class="n">${monthLabel(m)}</th>`).join('')}</tr></thead><tbody>${
    D.members.map(mb => `<tr><td>${who(mb.short_name)}</td>${months.map(m => { const r = by[m][mb.short_name]; return r && r.gp ? `<td class="n nowrap">${r.w + r.otw}-${r.l}-${r.otl}<br><span class="muted">${r.pts} pts</span></td>` : '<td class="n muted">–</td>'; }).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="muted" style="margin-top:10px">Wins-losses-overtime losses (overtime wins count as wins), with total points.</p>`;
}

/* PTS% (points earned out of points possible) was used for October's seeding, so it shows for months up to config.standings.ptsPercentThrough and not after. */
const showPtsPct = month => !!month && !!(D.config.standings || {}).ptsPercentThrough && month <= D.config.standings.ptsPercentThrough;
const statKey = month => `<details><summary>Stat key</summary><div class="inner"><ul class="key">
<li><b>GP</b> games played · <b>W</b> regulation wins · <b>L</b> regulation losses · <b>OTW</b> overtime wins · <b>OTL</b> overtime losses</li>
<li><b>PTS</b> points (3 win, 2 OT win, 1 OT loss, 0 loss)${showPtsPct(month) ? ' · <b>PTS%</b> points earned out of points possible' : ''}</li>
<li><b>GF/GA/GD</b> goals for, against, and difference · <b>SF/SA</b> shots for and against</li>
<li><b>Shot%</b> goals ÷ shots taken · <b>SV%</b> share of opponent shots stopped · <b>SO</b> shutouts</li>
<li><b>Home / Road</b> win–loss record at each table position · <b>Strk</b> current win or loss streak</li></ul></div></details>`;

function standingsTable(rows, limit, month) {
  rows = limit ? rows.slice(0, limit) : rows;
  const n = (x, opt) => `<td class="n${opt ? ' opt' : ''}">${x}</td>`;
  const heads = [['GP'], ['W'], ['L'], ['OTW'], ['OTL'], ['PTS'], ...(showPtsPct(month) ? [['PTS%', 1]] : []), ['GF', 1], ['GA', 1], ['GD'], ['SF', 1], ['SA', 1], ['Shot%', 1], ['SV%', 1], ['SO', 1], ['Home', 1], ['Road', 1], ['Strk']];
  return `<div class="stand"><div class="table-scroll"><table><thead><tr><th>#</th><th>Player</th>${heads.map(([h, o]) => `<th class="n${o ? ' opt' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r, i) => `<tr class="${i === 0 && r.gp ? 'leader' : ''}"><td>${i + 1}</td><td>${who(r.name)}</td>${n(r.gp)}${n(r.w)}${n(r.l)}${n(r.otw)}${n(r.otl)}<td class="n"><b>${r.pts}</b></td>${showPtsPct(month) ? n(r.gp ? pct(r.pts / (r.gp * D.config.points.win)) : '–', 1) : ''}${n(r.gf, 1)}${n(r.ga, 1)}${n((r.gf - r.ga > 0 ? '+' : '') + (r.gf - r.ga))}${n(r.sf, 1)}${n(r.sa, 1)}${n(r.sf ? pct(r.gf / r.sf) : '–', 1)}${n(r.sa ? pct(1 - r.ga / r.sa) : '–', 1)}${n(r.so, 1)}${n(r.hw + '-' + r.hl, 1)}${n(r.rw + '-' + r.rl, 1)}${n(r.streak)}</tr>`).join('')
  }</tbody></table></div><button class="more-stats" type="button">Show all stats</button></div>`;
}

function gamesTable(games) {
  if (!games.length) return '<p class="muted">No games played yet.</p>';
  const row = g => g.dnp
    ? `<tr class="dnp"><td class="n opt"></td><td class="nowrap">${dateShort(g.date)}</td><td>${who(g.home, 20)}</td><td class="n nowrap"><span class="tag dnp">DNP</span></td><td>${who(g.road, 20)}</td><td class="n opt"></td><td class="muted opt">${g.auto ? 'Did not play (not logged)' : 'Did not play'}</td></tr>`
    : `<tr><td class="n opt">${g.id}</td><td class="nowrap">${dateShort(g.date)}</td><td class="${g.hg > g.rg ? 'win' : ''}">${who(g.home, 20)}</td><td class="n nowrap">${scoreHTML(g.hg, g.rg)}</td><td class="${g.rg > g.hg ? 'win' : ''}">${who(g.road, 20)}</td><td class="n opt">${g.hs || g.rs ? `${g.hs} – ${g.rs}` : ''}</td><td>${g.playoff ? '<span class="tag">Playoff</span>' : ''}${g.ot ? '<span class="tag">OT</span>' : ''}${!g.hg || !g.rg ? '<span class="tag">SO</span>' : ''}</td></tr>`;
  return `<div class="table-scroll"><table class="games"><thead><tr><th class="n opt">#</th><th>Date</th><th>Home</th><th class="n">Score</th><th>Road</th><th class="n opt">Shots</th><th></th></tr></thead><tbody>${[...games].sort(cmpNew).map(row).join('')}</tbody></table></div>`;
}

/* Plain-text content: "# title", "## heading", "• bullet", anything else is a paragraph. */
function textBlocks(txt) {
  const out = { title: '', html: '' }; let list = false;
  const close = () => { if (list) { out.html += '</ul>'; list = false; } };
  for (const line of txt.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (line.startsWith('# ')) out.title = line.slice(2);
    else if (line.startsWith('## ')) { close(); out.html += `<h2>${esc(line.slice(3))}</h2>`; }
    else if (line.startsWith('•')) {
      if (!list) { out.html += '<ul>'; list = true; }
      const [, label, rest] = line.slice(1).trim().match(/^([^:]{1,40}:)?\s*(.*)$/);
      out.html += `<li>${label ? `<b>${esc(label)}</b> ` : ''}${esc(rest)}</li>`;
    } else { close(); out.html += `<p>${esc(line)}</p>`; }
  }
  close(); return out;
}

/* ---------- playoffs: 4 players, double elimination, 7 games ---------- */
/* Playoff games live in games.json with "playoff": true (they count in the standings like any game). Seeds come from the month's other games. Each one is matched to the next open bracket game with the same two players. */
function seedsFor(month, asOf) {
  const override = D.seedsOverride[month];
  const po = D.games.filter(g => g.playoff && g.month === month);
  const shown = po.filter(g => !asOf || (g.date && g.date <= asOf));
  if (override && override.length === 4) return { seeds: override, live: !shown.length };
  const top = standingsFor(monthGames(month).filter(g => !g.playoff)).filter(r => r.gp).slice(0, 4).map(r => r.name);
  return { seeds: [0, 1, 2, 3].map(i => top[i] || ''), live: !shown.length };
}
function bracketModel(seeds, data) {
  const G = {};
  const win = (n, a, b) => { const w = data['g' + n]; return w && (w === a || w === b) ? w : ''; };
  const mk = (n, a, b, extra = {}) => { const w = a && b ? win(n, a, b) : ''; G[n] = { n, a, b, w, l: w ? (w === a ? b : a) : '', ...extra }; };
  mk(1, seeds[0], seeds[3], { sa: 1, sb: 4 }); mk(2, seeds[1], seeds[2], { sa: 2, sb: 3 });
  mk(3, G[1].l, G[2].l); mk(4, G[1].w, G[2].w);
  mk(5, G[4].l, G[3].w); mk(6, G[4].w, G[5].w);
  const needG7 = !(G[6].w && G[6].w === G[4].w);
  mk(7, G[6].w, G[6].l); if (!needG7) G[7].skipped = true;
  const champion = G[6].w && !needG7 ? G[6].w : (G[7].w || '');
  return { G, champion, seeds };
}
/* With asOf (a date), only playoff games dated on or before it count, so a future playoff day does not show results. */
function buildBracket(month, asOf) {
  const { seeds, live } = seedsFor(month, asOf), data = {}, scores = {}, dates = {};
  let pending = D.games.filter(g => g.playoff && g.month === month && (!asOf || (g.date && g.date <= asOf)));
  // Match each playoff game to the next open bracket game with the same two players. A game whose slot is not open yet is retried after the others.
  for (let progress = true; pending.length && progress;) {
    progress = false; const next = [];
    for (const g of pending) {
      const m = bracketModel(seeds, data);
      const n = [1, 2, 3, 4, 5, 6, 7].find(k => { const x = m.G[k]; return x.a && x.b && !x.w && !x.skipped && [x.a, x.b].includes(g.home) && [x.a, x.b].includes(g.road); });
      if (!n) { next.push(g); continue; }
      const hasScores = !isNaN(g.hg) && !isNaN(g.rg) && g.hg !== g.rg;
      data['g' + n] = hasScores ? (g.hg > g.rg ? g.home : g.road) : g.winner;
      if (hasScores) scores[n] = { [g.home]: g.hg, [g.road]: g.rg };
      dates[n] = g.date; progress = true;
    }
    pending = next;
  }
  return { ...bracketModel(seeds, data), scores, dates, live, unmatched: pending };
}
function championOf(month) { return hasPlayoffs(month) ? buildBracket(month).champion : ''; }

function bracketHTML(month) {
  const { G, champion, live, scores } = buildBracket(month);
  const card = g => {
    const side = (p, seed, won, ph) => `<div class="side ${won ? 'won' : ''}"><span>${seed ? `<span class="seed">${seed}</span>` : ''}${p ? who(p, 22) : `<span class="muted">${ph}</span>`}</span>${scores[g.n]?.[p] != null ? `<span>${scores[g.n][p]}</span>` : won ? '<span>✔</span>' : ''}</div>`;
    return `<div class="match ${g.skipped ? 'skipped' : ''}"><div class="gname">Game ${g.n}${g.n === 7 ? ' · Championship' : ''}${g.skipped ? ' · not needed' : g.n === 7 ? ' · only if needed' : ''}</div>${side(g.a, g.sa, g.w && g.w === g.a, 'TBD')}${side(g.b, g.sb, g.w && g.w === g.b, 'TBD')}</div>`;
  };
  const col = (title, ns) => `<div class="round"><h3>${title}</h3><div class="matches">${ns.map(n => card(G[n])).join('')}</div></div>`;
  return `${champion ? `<p class="champ">🏆 Champion: <b>${esc(champion)}</b></p>` : ''}${live ? '<p class="muted">Seeded from the current standings. Updates as playoff games are added.</p>' : ''}
    <h2>Winners bracket</h2><div class="bracket">${col('Round 1', [1, 2])}${col('Round 2', [4])}${col('Round 3', [6])}</div>
    <h2>Losers bracket</h2><div class="bracket">${col('Round 1', [3])}${col('Round 2', [5])}</div>
    <h2>Championship</h2><div class="bracket">${col('Game 7', [7])}</div>`;
}

/* ---------- pages ---------- */
const view = {
  home() {
    const t = textBlocks(D.home), m = cur();
    const now = standingsFor(monthGames(m));
    const prev = pastMonths().find(x => monthGames(x).length);
    const useNow = now.some(r => r.gp), board = useNow ? now : standingsFor(monthGames(prev || ''));
    const lastChamp = [...new Set(D.games.filter(g => g.playoff).map(g => g.month))].sort().reverse().map(mm => ({ m: mm, c: championOf(mm) })).find(x => x.c);
    const [head, ...tail] = (t.title || D.config.leagueName).split(':');
    return `<div class="hero"><div class="hero-text"><span class="eyebrow">${m ? monthLabel(m) : 'Season'}</span><h1>${esc(head)}${tail.length ? `<span class="sub">${esc(tail.join(':').trim())}</span>` : ''}</h1>${t.html.split('<h2>')[0]}</div><img class="hero-logo" src="images/league-logo.webp" alt="${esc(D.config.leagueName)} logo"></div>
      <div class="grid">
        <div class="card stat"><div class="num">${esc(board[0]?.gp ? board[0].name : '—')}</div><div class="label">${useNow ? 'Current leader' : (prev ? monthLabel(prev) + ' leader' : 'Leader')}</div></div>
        <div class="card stat"><div class="num">${monthGames(m).length}</div><div class="label">Games in ${m ? monthLabel(m) : 'this month'}</div></div>
        <div class="card stat"><div class="num">${D.members.length}</div><div class="label">Players</div></div>
        <div class="card stat"><div class="num">${esc(lastChamp ? lastChamp.c : '—')}</div><div class="label">${lastChamp ? 'Last champion · ' + monthLabel(lastChamp.m) : 'Last champion'}</div></div>
      </div>
      ${typeof todayCard === 'function' ? todayCard() : ''}
      <h2>${useNow ? 'Standings' : (prev ? monthLabel(prev) + ' final standings' : 'Standings')}</h2>${standingsTable(board, 4, useNow ? m : prev)}
      <h2>Latest games</h2>${gamesTable(D.games.filter(isCounted).sort(cmpNew).slice(0, 5))}
      ${t.html.includes('<h2>') ? '<h2>' + t.html.split('<h2>').slice(1).join('<h2>') : ''}`;
  },
  rules() {
    const t = textBlocks(D.rules);
    return `<h1>${esc(t.title || 'Rules')}</h1><div class="card rules">${t.html}</div>`;
  },
  gamelog() {
    const months = [cur(), ...pastMonths().filter(m => monthGames(m).length)];
    const c = chipsFor('gamelog', months, m => m === cur() ? 'current' : monthGames(m).length + ' games'), games = monthLog(c.sel), dnp = games.filter(g => g.dnp).length, played = games.length - dnp;
    return `<h1>Game Log</h1><p class="lead">${c.sel === cur() ? `${monthLabel(c.sel)} · ${played} games${dnp ? ` (${dnp} DNP)` : ''}. Playoff games are included and tagged; DNP means a scheduled game that was not played, which does not change the standings. The log starts fresh each month; earlier months are in the buttons below.` : `${monthLabel(c.sel)} · ${played} games${dnp ? ` (${dnp} DNP)` : ''}.`}</p>${c.html}${gamesTable(games)}`;
  },
  standings() {
    const months = [cur(), ...pastMonths().filter(m => monthGames(m).length)];
    const c = chipsFor('standings', months, m => m === cur() ? 'current' : ''), ch = c.sel === cur() ? '' : championOf(c.sel);
    return `<h1>Standings</h1><p class="lead">${monthLabel(c.sel)}${c.sel === cur() ? ' · 3 pts for a win, 2 for an overtime win, 1 for an overtime loss. Playoff games count too.' : ' · final standings.'}</p>${c.html}${ch ? `<p class="champ">🏆 Playoff champion: <b>${esc(ch)}</b></p>` : ''}${standingsTable(standingsFor(monthGames(c.sel)), 0, c.sel)}${statKey(c.sel)}${monthlyRecords()}`;
  },
  playoffs() {
    const months = [cur(), ...pastMonths().filter(hasPlayoffs)];
    const c = chipsFor('playoffs', months, m => m === cur() ? 'current' : '');
    return `<h1>Playoffs</h1><p class="lead">${monthLabel(c.sel)}${c.sel === cur() ? ' · every month the players are seeded by standings into a double-elimination bracket.' : ' · final bracket.'}</p>${c.html}${bracketHTML(c.sel)}`;
  },
};

/* ---------- router ---------- */
function route(keepScroll) {
  const OLD = { 'gamelog-history': 'gamelog', 'standings-history': 'standings', 'playoffs-history': 'playoffs', enter: 'add', admin: 'add' };
  let id = location.hash.replace(/^#\/?/, '') || 'home'; id = OLD[id] || id;
  const page = view[id] ? id : 'home';
  document.getElementById('app').innerHTML = (D.problems.length ? `<div class="alert"><b>Heads up, the data file needs attention:</b><ul>${D.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : '') + view[page]();
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.id === page));
  document.getElementById('nav').classList.remove('open');
  document.title = `${PAGES.find(p => p[0] === page)[1]} · ${D.config.leagueName}`;
  if (keepScroll !== true) window.scrollTo(0, 0);
}

async function startApp() {
  await load();
  document.getElementById('league-name').textContent = D.config.leagueName;
  document.getElementById('nav').innerHTML = PAGES.filter(p => !p[2]).map(([id, label]) => `<a href="#/${id}" data-id="${id}">${label}</a>`).join('');
  document.querySelector('.menu-toggle').onclick = e => {
    const open = document.getElementById('nav').classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', open);
  };
  document.addEventListener('click', e => { const b = e.target.closest('.more-stats'); if (!b) return; const on = b.closest('.stand').classList.toggle('show-all'); b.textContent = on ? 'Show fewer stats' : 'Show all stats'; });
  document.addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; UI[c.dataset.page] = c.dataset.m; route(true); });
  document.getElementById('theme-toggle').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; try { localStorage.setItem('bhl_theme', next); } catch { }
  };
  window.addEventListener('hashchange', () => route());
  route();
}
