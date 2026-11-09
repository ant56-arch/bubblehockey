/* Bubble Hockey League site. All data lives in /data (see README). */
const PAGES = [
  ['home', 'Home'], ['rules', 'Rules'], ['members', 'Members'], ['schedule', 'Schedule'],
  ['standings', 'Standings'], ['playoffs', 'Playoffs'],
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
async function freshText(path) {
  let token = ''; try { token = localStorage.getItem('bhl_token') || ''; } catch { }
  const { owner, repo, branch } = repoInfo(); if (!token || !owner || !repo) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token } });
    return r.ok ? b64dec((await r.json()).content) : null;      // expired or rejected token: quietly use the public copy
  } catch { return null; }
}
const toMembers = rows => rows.map(m => ({ ...m, short_name: m.short_name || m.name }));

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
    if (g.playoff) continue;                  // the same two teams can meet twice in a double-elimination bracket; a copied playoff game shows up as unmatched instead
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
  const [config, members, gamesText, home, rules, sched] = await Promise.all([
    get('config.json', 'json'), get('members.csv'), getGames(), get('home.txt', 'text'), get('rules.txt', 'text'), get('schedule.json', 'json')]);
  D.config = { leagueName: 'Bubble Hockey League', tagline: '', ...config, points: { win: 3, overtimeWin: 2, overtimeLoss: 1, loss: 0, ...config.points } };
  D.members = toMembers(members);
  D.home = home; D.rules = rules; D.schedRaw = sched;

  const [freshMembers, freshGames, freshRules, freshHome, freshSched] = await Promise.all([freshText('data/members.csv'), freshText('data/games.json'), freshText('data/rules.txt'), freshText('data/home.txt'), freshText('data/schedule.json')]);
  if (freshRules && freshRules.trim()) D.rules = freshRules; if (freshHome && freshHome.trim()) D.home = freshHome;      // a connected device sees its own page-text edits at once
  if (freshMembers && /^\s*name\s*,/i.test(freshMembers)) { const rows = toMembers(parseCSV(freshMembers)); if (rows.length) D.members = rows; }      // ignore anything that is not a members file
  try { D.schedRaw = freshSched ? JSON.parse(freshSched) : D.schedRaw; } catch { }
  D.sched = typeof normalizeSched === 'function' ? normalizeSched(D.schedRaw) : null;
  applyGamesText(freshGames ?? gamesText);
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
/* Small blue "C" next to the commissioner's name (matched against the commissioner contact in the settings). */
const isComm = n => { const c = ((D.config.commissioner || {}).name || '').trim().toLowerCase(), m = member(n); return !!c && !!m && [m.short_name, m.name].some(x => x && String(x).trim().toLowerCase() === c) || (!!c && !!m && c.endsWith(' ' + String(m.short_name).toLowerCase())); };
const cBadge = n => isComm(n) ? '<svg class="cpatch" viewBox="0 0 40 40" role="img" aria-label="Commissioner"><title>Commissioner</title><circle cx="20" cy="20" r="19" fill="#c8102e"/><path d="M12.4 9.7L14.8 7.2L25.1 7.2L27.6 9.6L27.8 15.0L22.8 15.0L22.8 12.0L17.3 12.0L17.1 27.1L22.8 27.1L22.8 23.7L28.2 23.7L28.2 30.0L26.0 32.8L13.9 32.8L11.8 30.1Z" fill="#fff"/></svg>' : '';
const nm = (n, extra) => esc(n) + cBadge(n) + (extra !== undefined ? extra : champMark(n, ''));
const who = (n, size = 26, extra) => { const m = member(n); return `<span class="who" data-tc="${esc(n)}">${m?.logo ? `<img class="tlogo" style="width:${size}px;height:${size}px" src="${esc(m.logo)}" alt="" loading="lazy">` : ''}<span>${esc(n)}${cBadge(n)}${extra !== undefined ? extra : champMark(n, '')}</span></span>`; };
const UI = {};
/* A short line up front and the longer explanation tucked behind "How this works". */
const howTo = html => `<details class="how"><summary>How this works</summary><div>${html}</div></details>`;
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

/* A trophy next to a month's champion; on the current month it marks the reigning champion (the latest finished month's winner). */
function champMark(n, month) {
  const past = month && month !== cur() ? month : (pastMonths().find(x => hasPlayoffs(x) && championOf(x)) || ''), c = past && championOf(past);
  return c && c === n ? `<span class="trophy-mark" title="${monthLabel(past)} champion" aria-label="${monthLabel(past)} champion">🏆</span>` : '';
}
function standingsTable(rows, limit, month) {
  rows = limit ? rows.slice(0, limit) : rows;
  const n = (x, opt) => `<td class="n${opt === 2 ? ' opt2' : opt ? ' opt' : ''}">${x}</td>`;
  const heads = [['Record', 0, 'mrec'], ['GP', 1], ['W', 1], ['L', 1], ['OTW', 2], ['OTL', 2], ['PTS'], ...(showPtsPct(month) ? [['PTS%', 2]] : []), ['GF', 2], ['GA', 2], ['GD'], ['SF', 2], ['SA', 2], ['Shot%', 2], ['SV%', 2], ['SO', 2], ['Home', 2], ['Road', 2], ['Strk', 2]];
  return `<div class="stand"><div class="table-scroll"><table><thead><tr><th>Rank</th><th>Player</th>${heads.map(([h, o, k]) => `<th class="n${o === 2 ? ' opt2' : o ? ' opt' : ''}${k ? ' ' + k : ''}">${h}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r, i) => `<tr class="${i === 0 && r.gp ? 'leader' : ''}"><td>${i + 1}</td><td>${who(r.name, 26, champMark(r.name, month))}</td><td class="n mrec nowrap">${r.w + r.otw}-${r.l}-${r.otl}</td>${n(r.gp, 1)}${n(r.w, 1)}${n(r.l, 1)}${n(r.otw, 2)}${n(r.otl, 2)}<td class="n"><b>${r.pts}</b></td>${showPtsPct(month) ? n(r.gp ? pct(r.pts / (r.gp * D.config.points.win)) : '–', 2) : ''}${n(r.gf, 2)}${n(r.ga, 2)}${n((r.gf - r.ga > 0 ? '+' : '') + (r.gf - r.ga))}${n(r.sf, 2)}${n(r.sa, 2)}${n(r.sf ? pct(r.gf / r.sf) : '–', 2)}${n(r.sa ? pct(1 - r.ga / r.sa) : '–', 2)}${n(r.so, 2)}${n(r.hw + '-' + r.hl, 2)}${n(r.rw + '-' + r.rl, 2)}${n(r.streak, 2)}</tr>`).join('')
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

/* ---------- playoffs: double elimination for the whole league (see js/bracket.js) ---------- */
/* Playoff games live in games.json with "playoff": true (they count in the standings like any game). Each one is matched to the next open bracket game with the same two players. */

/* Who is in a month's playoff field: every member who had joined by the end of that month, best standing first, up to 20
   (config.json "playoffs": { "teams": 8 } keeps only the top 8). Seeds come from the month's non-playoff games. */
function seedsFor(month, asOf) {
  const override = D.seedsOverride[month];
  const po = D.games.filter(g => g.playoff && g.month === month);
  const shown = po.filter(g => !asOf || (g.date && g.date <= asOf));
  if (override && override.length >= 2) return { seeds: override, live: !shown.length };
  const [y, m] = month.split('-'), end = `${y}-${m}-${String(new Date(+y, +m, 0).getDate()).padStart(2, '0')}`;
  const field = new Set(D.members.filter(x => !x.established || x.established <= end).map(x => x.short_name));
  const cap = Math.min(20, +(D.config.playoffs || {}).teams || 20);
  const ranked = standingsFor(monthGames(month).filter(g => !g.playoff)).map(r => r.name).filter(n => field.has(n)).slice(0, cap);
  return { seeds: ranked.length >= 2 ? ranked : [], live: !shown.length };
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
      const n = m.list.find(k => { const x = m.G[k]; return x.a && x.b && !x.w && !x.skipped && [x.a, x.b].includes(g.home) && [x.a, x.b].includes(g.road); });
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
  const B = buildBracket(month), { G, champion, live, scores } = B;
  if (!B.S) return '<p class="muted">The playoffs need at least two teams.</p>';
  const nextGame = !champion && live !== false ? (B.list.find(n => { const g = G[n]; return g.a && g.b && !g.w && !g.skipped; }) || 0) : 0;      // the first game ready to be played
  const card = g => {
    const side = (p, seed, won, ph) => `<div class="side ${won ? 'won' : ''}"><span>${seed ? `<span class="seed">${seed}</span>` : ''}${p ? who(p, 22) : `<span class="muted">${ph}</span>`}</span>${scores[g.n]?.[p] != null ? `<span>${scores[g.n][p]}</span>` : won ? '<span>✔</span>' : ''}</div>`;
    const title = g.kind === 'GF' ? ' · Grand final' : g.kind === 'RESET' ? ' · Grand final, game 2' : '';
    const src = [g.la, g.lb].map(x => /^(Winner|Loser) G(\d+)$/.exec(x || '')).filter(Boolean).map(m => `${m[1][0]}${m[2]}`).join(','), isNext = nextGame === g.n;
    return `<div class="match ${g.skipped ? 'skipped' : ''}${isNext ? ' next' : ''}" data-n="${g.n}" data-kind="${g.kind}" data-src="${src}"><div class="gname">Game ${g.n}${title}${g.skipped ? ' · not needed' : g.kind === 'RESET' ? ' · only if needed' : ''}${isNext ? ' <span class="tag">Up next</span>' : ''}</div>${side(g.a, g.sa, g.w && g.w === g.a, g.la)}${side(g.b, g.sb, g.w && g.w === g.b, g.lb)}</div>`;
  };
  const col = r => `<div class="round"><h3>${r.label}</h3><div class="matches">${r.nums.map(n => card(G[n])).join('')}</div></div>`;
  const rounds = k => B.rounds.filter(r => r.kind === k);
  return `${champion ? `<div class="champ-card">${member(champion) && member(champion).logo ? `<img src="${esc(member(champion).logo)}" alt="">` : '<span style="font-size:2rem">🏆</span>'}<div><small>${monthLabel(month)} champion</small><b>${nm(champion, '')}</b>${member(champion) && member(champion).team_name ? `<span>${esc(member(champion).team_name)}</span>` : ''}</div></div>` : ''}<p class="muted">${B.seeds.length} teams · ${B.list.length - 1} games${B.S.P > B.seeds.length ? ` · top ${B.S.P - B.seeds.length} seeds get a bye` : ''}${live ? ' · seeded from the current standings' : ''}.</p>${howTo(`Every month all the teams are seeded by the month's standings into a double-elimination bracket: lose once and you drop to the losers bracket, lose twice and you are out. The winners-bracket champion meets the losers-bracket champion in the grand final; if the losers-bracket champion wins it, there is one more game. ${B.seeds.length} teams make ${B.list.length - 1} games plus that possible extra one${B.S.P > B.seeds.length ? `, and the top ${B.S.P - B.seeds.length} seeds skip the first round` : ''}.${live ? ' The bracket is seeded from the current standings and updates as playoff games are added.' : ''}`)}
    <div class="bracket dbl"><div class="dbl-main">
      <div class="lane-wrap"><div class="lane-label">Winners bracket</div><div class="lane wb">${rounds('W').map(col).join('')}</div></div>
      ${rounds('L').length ? `<div class="lane-wrap"><div class="lane-label">Losers bracket</div><div class="lane lb">${rounds('L').map(col).join('')}</div></div>` : ''}
    </div><div class="dbl-gf"><div class="lane-label">Grand final</div>${rounds('GF').map(col).join('')}</div></div>`;
}

/* Lines joining each bracket game to the games that feed it (winners go on to the next round). Drawn over the bracket after it is on the page. */
function drawBracketLines() {
  document.querySelectorAll('.bracket').forEach(br => {
    let svg = br.querySelector('svg.bracket-lines'); if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'bracket-lines'); br.appendChild(svg); }
    svg.innerHTML = ''; if (window.matchMedia('(max-width: 640px)').matches) return;            // phones stack the rounds, so no lines there
    svg.setAttribute('width', br.scrollWidth); svg.setAttribute('height', br.scrollHeight);
    const byN = {}; br.querySelectorAll('.match[data-n]').forEach(m => { byN[m.dataset.n] = m; });
    br.querySelectorAll('.match[data-src]').forEach(to => { if (to.dataset.kind === 'RESET') return; (to.dataset.src || '').split(',').filter(Boolean).forEach(s => {
      const from = byN[s.slice(1)]; if (!from || s[0] !== 'W') return;
      const bb = br.getBoundingClientRect(), f = from.getBoundingClientRect(), t = to.getBoundingClientRect(), ox = bb.left - br.scrollLeft, oy = bb.top - br.scrollTop;      // positions inside the bracket, scroll included
      const x1 = f.right - ox, y1 = f.top + f.height / 2 - oy, x2 = t.left - ox, y2 = t.top + t.height / 2 - oy, xm = x1 + (x2 - x1) / 2;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', `M${x1} ${y1}H${xm}V${y2}H${x2}`); p.setAttribute('class', 'bl' + (from.querySelector('.side.won') ? ' done' : '')); svg.appendChild(p);
    }); });
  });
}
window.addEventListener('resize', () => { if (typeof drawBracketLines === 'function') drawBracketLines(); });

/* ---------- pages ---------- */
const view = {
  home() {
    const t = textBlocks(D.home), m = cur(), cfg = D.config.home || {};
    const now = standingsFor(monthGames(m));
    const prev = pastMonths().find(x => monthGames(x).length);
    const useNow = now.some(r => r.gp), board = useNow ? now : standingsFor(monthGames(prev || ''));
    const champs = [...new Set(D.games.filter(g => g.playoff).map(g => g.month))].sort().reverse().map(mm => ({ m: mm, c: championOf(mm) })).filter(x => x.c);
    const lastChamp = champs[0], counted = D.games.filter(isCounted), team = n => (member(n)?.team_name || '').replace(/^The /, '');
    const rec = n => { const r = standingsFor(counted).find(x => x.name === n); return r ? `${r.w + r.otw}–${r.l + r.otl}` : '0–0'; };
    const card = (title, link, body) => `<section class="card pc"><h2>${title}${link ? `<a href="${link[1]}">${link[0]}</a>` : ''}</h2>${body}</section>`;
    const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
    const stand = `<div class="table-scroll"><table class="ptable"><thead><tr><th>Rank</th><th>Player</th><th class="n">W</th><th class="n">L</th><th class="n">Diff</th><th class="n">Pts</th></tr></thead><tbody>${
      board.map((r, i) => `<tr data-tc="${esc(r.name)}"><td>${i + 1}</td><td><div class="pl">${member(r.name)?.logo ? `<img class="tlogo sq" src="${esc(member(r.name).logo)}" alt="" loading="lazy">` : ''}<span><b>${nm(r.name, champMark(r.name, useNow ? '' : prev))}</b><small>${esc(team(r.name))}</small></span></div></td><td class="n">${r.w + r.otw}</td><td class="n">${r.l + r.otl}</td><td class="n">${sign(r.gf - r.ga)}</td><td class="n"><b>${r.pts}</b></td></tr>`).join('')}</tbody></table></div>`;
    const recent = counted.sort(cmpNew).slice(0, 3).map(g => `<div class="rrow"><span class="d">${dateShort(g.date)}</span><span class="t ${g.hg > g.rg ? 'wint' : 'lost'}">${nm(g.home)}</span><span class="s">${g.hg > g.rg ? `<b class="win">${g.hg}</b> – ${g.rg}` : `${g.hg} – <b class="win">${g.rg}</b>`}</span><span class="t r ${g.hg > g.rg ? 'lost' : 'wint'}">${nm(g.road)}${g.playoff ? ' <span class="tag">Playoffs</span>' : ''}</span></div>`).join('');
    const days = typeof upcomingDays === 'function' && D.members.length > 1 ? upcomingDays(3).map(d => dayView(d)).filter(Boolean) : [];
    const games = days.flatMap(v => v.playoff ? [] : v.rows.filter(r => !r.result).map(r => ({ ...r, date: v.date })));
    const nx = games[0], h2h = nx ? counted.filter(g => [g.home, g.road].includes(nx.home) && [g.home, g.road].includes(nx.road)) : [], hw = nx ? h2h.filter(g => (g.hg > g.rg ? g.home : g.road) === nx.home).length : 0;
    const next = nx ? `<div class="feat"><div class="vs"><div>${nm(nx.home)}<small>${rec(nx.home)}</small></div><span>VS</span><div>${nm(nx.road)}<small>${rec(nx.road)}</small></div></div><hr>
      <div class="kv2"><span>Date</span><b>${dayLabel(nx.date)}</b></div><div class="kv2"><span>Home</span><b>${nm(nx.home)}</b></div><div class="kv2"><span>Head to head</span><b>${h2h.length ? `${hw}–${h2h.length - hw} ${esc(nx.home)}` : 'No games yet'}</b></div></div>`
      : '<div class="feat muted">No games scheduled right now.</div>';
    const sched = games.slice(0, 3).map(r => `<div class="rrow s3"><span class="d">${dateShort(r.date)}</span><span class="t">${nm(r.home)} v ${nm(r.road)}</span><span class="d r">Home: ${nm(r.home)}</span></div>`).join('') || '<div class="feat muted">Nothing scheduled.</div>';
    const champ = lastChamp ? `<div class="feat champ-feat"><span class="trophy" aria-hidden="true">🏆</span><div><b class="big">${nm(lastChamp.c, '')}</b><div class="muted">${monthLabel(lastChamp.m)} · ${esc(team(lastChamp.c))}</div></div></div>` : '<div class="feat muted">No champion yet.</div>';
    const [head] = (cfg.headline || 'Every game. Every standing. One league.').split('|');
    return `<div class="res-head" style="justify-content:flex-end;margin-top:6px"><button class="link res-hide" data-boss type="button" title="Shortcut: Esc">Hide screen (Esc)</button></div><section class="band hero-band"><div class="hero"><div class="hero-text"><span class="eyebrow">${esc(cfg.eyebrow || (m ? monthLabel(m) : 'Season'))}</span>
        <h1>${esc(head).replace(/\. /g, '.<br>')}</h1><p>${esc(cfg.text || (t.html.match(/^<p>(.*?)<\/p>/) || [])[1]?.replace(/&amp;/g, '&').replace(/&#39;/g, "'") || 'Live standings, daily matchups and a double-elimination playoff for the whole office. Join the table.')}</p>
        <a class="btn" href="#/rules?join">Join the League</a>
        <div class="hero-stats"><div><b>${counted.length}</b><span>Games played</span></div><div><b>${D.members.length}</b><span>Teams</span></div><div><b>${champs.length}</b><span>Champions crowned</span></div></div></div>
      <div class="hero-art"><img data-logo src="${esc(D.config.logo || 'images/league-logo.webp')}" alt="${esc(D.config.leagueName)} logo"></div></div></section>
      <div class="pgrid"><div class="pcol">${card(useNow ? 'Standings' : (prev ? monthLabel(prev) + ' standings' : 'Standings'), ['Full table →', '#/standings'], stand)}${card('Recent results', ['All results →', '#/schedule'], recent || '<div class="feat muted">No games yet.</div>')}</div>
        <div class="pcol">${card('Next matchup', null, next)}${card('Schedule', ['Full →', '#/schedule'], sched)}${card('Champion', null, champ)}</div></div>
      ${t.html.includes('<h2>') ? '<div class="more-text">' + '<h2>' + t.html.split('<h2>').slice(1).join('<h2>') + '</div>' : ''}`;
  },
  rules() {
    /* One card per section (## heading), a row of the points at the top, and quick links to each section. */
    const lines = String(D.rules || '').split('\n'), title = (lines.find(l => l.startsWith('# ')) || '').slice(2) || 'Rules', secs = []; let intro = [], cur_ = null;
    for (const l of lines) { if (l.startsWith('# ')) continue; if (l.startsWith('## ')) { cur_ = { name: l.slice(3).trim(), body: [] }; secs.push(cur_); } else if (cur_) cur_.body.push(l); else intro.push(l); }
    const P = D.config.points, tile = (v, l) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`;
    const glance = `<div class="rules-glance"><b>Points at a glance</b><div class="tiles">${tile(P.win, 'Win')}${tile(P.overtimeWin, 'OT win')}${tile(P.overtimeLoss, 'OT loss')}${tile(P.loss, 'Loss')}</div></div>`;
    const jump = `<div class="chips">${secs.map((s, i) => `<button type="button" class="chip" data-jump="rule-${i}">${esc(s.name)}</button>`).join('')}<button type="button" class="chip" data-jump="rule-join">How to join</button></div>`;
    if (/\?join/.test(location.hash)) setTimeout(() => { const el = document.getElementById('rule-join'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 120);
    const cm = D.config.commissioner || {}, who_ = esc(cm.name || 'the commissioner'), hi = 'Hi! I would like to join the ' + (D.config.leagueName || 'league') + '.';
    const joinCard = `<section class="card rule-card" id="rule-join"><h2>How to join</h2><p style="margin:0 0 12px">Want to play? Message ${who_} on Microsoft Teams or send an email, with your name and the team name you want. You will be added to the schedule on your start date.</p>${cm.email ? `<div class="btnrow"><a class="btn" href="https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(cm.email)}&message=${encodeURIComponent(hi)}" target="_blank" rel="noopener">Message on Teams</a><a class="btn ghost" href="mailto:${esc(cm.email)}?subject=${encodeURIComponent('Join the ' + (D.config.leagueName || 'league'))}&body=${encodeURIComponent(hi)}">Send an email</a></div>` : ''}</section>`;
    const cards = secs.length ? secs.map((s, i) => `<section class="card rule-card" id="rule-${i}"><h2>${esc(s.name)}</h2>${textBlocks(s.body.join('\n')).html}</section>`).join('') : `<div class="card rules">${textBlocks(D.rules).html}</div>`;
    return `<h1>${esc(title)}</h1>${intro.join('').trim() ? `<p class="lead">${esc(intro.join(' ').trim())}</p>` : ''}${glance}${jump}<div class="rule-cards">${cards}${joinCard}</div>`;
  },
  standings() {
    const months = [cur(), ...pastMonths().filter(m => monthGames(m).length)];
    const c = chipsFor('standings', months, m => m === cur() ? 'current' : ''), ch = c.sel === cur() ? '' : championOf(c.sel);
    return `<h1>Standings</h1><p class="lead">${monthLabel(c.sel)}${c.sel === cur() ? ' · 3 pts for a win, 2 for an OT win, 1 for an OT loss.' : ' · final standings.'}${c.sel === cur() ? howTo('Playoff games count in the standings too. Ties are broken by goal difference, then goals for. The standings start fresh every month; earlier months are in the buttons below.') : ''}</p>${c.html}${ch ? `<p class="champ">🏆 Playoff champion: <b>${esc(ch)}</b></p>` : ''}${standingsTable(standingsFor(monthGames(c.sel)), 0, c.sel)}${statKey(c.sel)}${monthlyRecords()}`;
  },
  playoffs() {
    const months = [cur(), ...pastMonths().filter(hasPlayoffs)];
    const c = chipsFor('playoffs', months, m => m === cur() ? 'current' : '');
    return `<h1>Playoffs</h1><p class="lead">${monthLabel(c.sel)}${c.sel === cur() ? ' · double elimination, everyone plays.' : ' · final bracket.'}</p>${c.html}${bracketHTML(c.sel)}`;
  },
};

/* ---------- router ---------- */

/* Team accent colors: taken from each team's logo (its most vivid color), used as a thin edge on standings rows, bracket cards and member cards. */
const TC = {}, TC_FALLBACK = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4d7c0f'];
function applyTeamColors() {
  document.querySelectorAll('[data-tc]').forEach(el => { const c = TC[el.dataset.tc]; if (!c) return; let t = el; if (el.classList.contains('who')) { const tr = el.closest('tr'); t = tr && tr.querySelectorAll('.who[data-tc]').length === 1 ? tr : el.closest('.match .side'); } if (t) t.style.setProperty('--tc', c); });
}
function loadTeamColors() {
  D.members.forEach((m, i) => { TC[m.short_name] = /^#[0-9a-f]{6}$/i.test(m.color || '') ? m.color : TC_FALLBACK[i % TC_FALLBACK.length]; });
  D.members.forEach(m => { if (!m.logo || /^#[0-9a-f]{6}$/i.test(m.color || '')) return; const img = new Image(); img.onload = () => { try {
    const cv = document.createElement('canvas'); cv.width = cv.height = 24; const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, 24, 24); const d = cx.getImageData(0, 0, 24, 24).data, hue = new Array(12).fill(0).map(() => ({ w: 0, r: 0, g: 0, b: 0 }));
    for (let k = 0; k < d.length; k += 4) { if (d[k + 3] < 200) continue; const r = d[k], g = d[k + 1], b = d[k + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510, s = mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255)); if (l < .22 || l > .85 || s < .35) continue;
      let h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; h = Math.floor(((h * 60 + 360) % 360) / 30); const w = s * (1 - Math.abs(l - .5)); const o = hue[h]; o.w += w; o.r += r * w; o.g += g * w; o.b += b * w; }
    const best = hue.reduce((x, y) => (y.w > x.w ? y : x)); if (best.w > 0) { TC[m.short_name] = `hsl(${hue.indexOf(best) * 30 + 15} 72% 46%)`; /* the logo's dominant hue, made vivid */ applyTeamColors(); }
  } catch (e) { } }; img.src = m.logo; });
  applyTeamColors();
}
function route(keepScroll) {
  const OLD = { gamelog: 'schedule', 'gamelog-history': 'schedule', 'standings-history': 'standings', 'playoffs-history': 'playoffs', enter: 'add', admin: 'add', games: 'resources' };
  let id = location.hash.replace(/^#\/?/, '') || 'home'; const old = id.split('?')[0]; id = OLD[old] || old; if (/^gamelog/.test(old) && !UI.schedule) UI.schedule = cur();      // the old Game Log address opens this month on the Schedule
  const page = view[id] ? id : 'home';
  document.getElementById('app').innerHTML = (D.problems.length ? `<div class="alert"><b>Heads up, the data file needs attention:</b><ul>${D.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : '') + view[page]();
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.id === page));
  document.getElementById('nav').classList.remove('open');
  document.title = `${PAGES.find(p => p[0] === page)[1]} · ${D.config.leagueName}`;
  applyTeamColors();
  if (typeof drawBracketLines === 'function') { drawBracketLines(); requestAnimationFrame(drawBracketLines); setTimeout(drawBracketLines, 400); }
  if (keepScroll !== true) window.scrollTo(0, 0);
}

/* The league logo: images/league-logo.webp unless data/config.json has a "logo" path (set from Add / Edit, Rules & text). */
function applyLogo() {
  const lg = D.config.logo || 'images/league-logo.webp', ic = document.querySelector('link[rel~=icon]');
  document.querySelectorAll('[data-logo]').forEach(img => { if (img.getAttribute('src') !== lg) img.src = lg; }); if (ic && ic.getAttribute('href') !== lg) ic.href = lg;
}
async function startApp() {
  await load();
  document.getElementById('league-name').textContent = D.config.leagueName;
  applyLogo();
  document.getElementById('nav').innerHTML = PAGES.filter(p => !p[2]).map(([id, label]) => `<a href="#/${id}" data-id="${id}">${label}</a>`).join('');
  document.querySelector('.menu-toggle').onclick = e => {
    const open = document.getElementById('nav').classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', open);
  };
  document.addEventListener('click', e => { const b = e.target.closest('.more-stats'); if (!b) return; const on = b.closest('.stand').classList.toggle('show-all'); b.textContent = on ? 'Show fewer stats' : 'Show all stats'; });
  document.addEventListener('click', e => { const j = e.target.closest('[data-jump]'); if (j) { const el = document.getElementById(j.dataset.jump); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; } const c = e.target.closest('.chip'); if (!c) return; UI[c.dataset.page] = c.dataset.m; route(true); });
  document.getElementById('theme-toggle').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; try { localStorage.setItem('bhl_theme', next); } catch { }
  };
  window.addEventListener('hashchange', () => route());
  route(); loadTeamColors();
}
