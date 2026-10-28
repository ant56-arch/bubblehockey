/* UWM Bubble Hockey League site. All data lives in /data (see README). */
const PAGES = [
  ['home', 'Home'], ['rules', 'Rules'], ['members', 'Members'],
  ['gamelog', 'Game Log'], ['gamelog-history', 'Game Log History'],
  ['standings', 'Standings'], ['standings-history', 'Standings History'],
  ['playoffs', 'Playoff Bracket'], ['playoffs-history', 'Playoff History'],
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

const D = {};
async function load() {
  const get = async (f, kind) => {
    try { const r = await fetch('data/' + f); if (!r.ok) throw 0; return kind === 'json' ? r.json() : kind === 'text' ? r.text() : parseCSV(await r.text()); }
    catch { return kind === 'json' ? {} : kind === 'text' ? '' : []; }
  };
  const [config, members, games, playoffs, home, rules] = await Promise.all([
    get('config.json', 'json'), get('members.csv'), get('games.csv'), get('playoffs.csv'), get('home.txt', 'text'), get('rules.txt', 'text')]);
  D.config = { leagueName: 'Bubble Hockey League', tagline: '', currentMonth: '', ...config, points: { win: 3, overtimeWin: 2, overtimeLoss: 1, loss: 0, ...config.points } };
  D.members = members.map(m => ({ ...m, short_name: m.short_name || m.name }));
  D.games = games.map(g => ({ ...g, id: +g.game_id || 0, hg: +g.home_goals, rg: +g.road_goals, hs: +g.home_shots || 0, rs: +g.road_shots || 0, ot: /^(y|yes|true|1|overtime|ot)$/i.test(g.overtime || ''), month: (g.date || '').slice(0, 7) }))
    .filter(g => g.home && g.road && g.date && !isNaN(g.hg) && !isNaN(g.rg) && g.hg !== g.rg);
  D.playoffs = playoffs;
  D.home = home; D.rules = rules;
  if (!D.config.currentMonth) D.config.currentMonth = D.games.map(g => g.month).sort().pop() || '';
}

/* ---------- helpers ---------- */
const cmpOld = (a, b) => a.date.localeCompare(b.date) || a.id - b.id;
const cmpNew = (a, b) => cmpOld(b, a);
const monthLabel = m => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' }); };
const dateLabel = d => { const [y, m, dd] = d.split('-'); return new Date(+y, +m - 1, +dd).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }); };
const cur = () => D.config.currentMonth;
const monthGames = m => D.games.filter(g => g.month === m);
const pastMonths = () => [...new Set([...D.games.map(g => g.month), ...D.playoffs.map(p => p.month)])].filter(m => m && m !== cur()).sort().reverse();
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

const STAT_KEY = `<details><summary>Stat key</summary><div class="inner"><ul class="key">
<li><b>GP</b> games played · <b>W</b> regulation wins · <b>L</b> regulation losses · <b>OTW</b> overtime wins · <b>OTL</b> overtime losses</li>
<li><b>PTS</b> points (3 win, 2 OT win, 1 OT loss, 0 loss) · <b>PTS%</b> points earned out of points possible</li>
<li><b>GF/GA/GD</b> goals for, against, and difference · <b>SF/SA</b> shots for and against</li>
<li><b>Shot%</b> goals ÷ shots taken · <b>SV%</b> share of opponent shots stopped · <b>SO</b> shutouts</li>
<li><b>Home / Road</b> win–loss record at each table position · <b>Strk</b> current win or loss streak</li></ul></div></details>`;

function standingsTable(rows, limit) {
  rows = limit ? rows.slice(0, limit) : rows;
  const n = x => `<td class="n">${x}</td>`;
  return `<div class="table-scroll"><table><thead><tr><th>#</th><th>Player</th>${['GP', 'W', 'L', 'OTW', 'OTL', 'PTS', 'PTS%', 'GF', 'GA', 'GD', 'SF', 'SA', 'Shot%', 'SV%', 'SO', 'Home', 'Road', 'Strk'].map(h => `<th class="n">${h}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r, i) => `<tr class="${i === 0 && r.gp ? 'leader' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td>${n(r.gp)}${n(r.w)}${n(r.l)}${n(r.otw)}${n(r.otl)}<td class="n"><b>${r.pts}</b></td>${n(r.gp ? pct(r.pts / (r.gp * D.config.points.win)) : '–')}${n(r.gf)}${n(r.ga)}${n((r.gf - r.ga > 0 ? '+' : '') + (r.gf - r.ga))}${n(r.sf)}${n(r.sa)}${n(r.sf ? pct(r.gf / r.sf) : '–')}${n(r.sa ? pct(1 - r.ga / r.sa) : '–')}${n(r.so)}${n(r.hw + '-' + r.hl)}${n(r.rw + '-' + r.rl)}${n(r.streak)}</tr>`).join('')
  }</tbody></table></div>`;
}

function gamesTable(games) {
  if (!games.length) return '<p class="muted">No games played yet.</p>';
  return `<div class="table-scroll"><table><thead><tr><th class="n">#</th><th>Date</th><th>Home</th><th class="n">Score</th><th>Road</th><th class="n">Shots</th><th></th></tr></thead><tbody>${
    [...games].sort(cmpNew).map(g => `<tr><td class="n">${g.id}</td><td>${dateLabel(g.date)}</td><td class="${g.hg > g.rg ? 'win' : ''}">${esc(g.home)}</td><td class="n">${g.hg} – ${g.rg}</td><td class="${g.rg > g.hg ? 'win' : ''}">${esc(g.road)}</td><td class="n">${g.hs || g.rs ? `${g.hs} – ${g.rs}` : ''}</td><td>${g.ot ? '<span class="tag">OT</span>' : ''}${!g.hg || !g.rg ? '<span class="tag">SO</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`;
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
function seedsFor(month) {
  const row = D.playoffs.find(p => p.month === month);
  if (row) return { seeds: [row.seed1, row.seed2, row.seed3, row.seed4], data: row };
  const live = standingsFor(monthGames(month)).filter(r => r.gp).slice(0, 4).map(r => r.name);
  return { seeds: [0, 1, 2, 3].map(i => live[i] || ''), data: {}, live: true };
}
function buildBracket(month) {
  const { seeds, data, live } = seedsFor(month), G = {};
  const win = (n, a, b) => { const w = data['g' + n]; return w && (w === a || w === b) ? w : ''; };
  const mk = (n, a, b, extra = {}) => { const w = a && b ? win(n, a, b) : ''; G[n] = { n, a, b, w, l: w ? (w === a ? b : a) : '', ...extra }; };
  mk(1, seeds[0], seeds[3], { sa: 1, sb: 4 }); mk(2, seeds[1], seeds[2], { sa: 2, sb: 3 });
  mk(3, G[1].l, G[2].l); mk(4, G[1].w, G[2].w);
  mk(5, G[4].l, G[3].w); mk(6, G[4].w, G[5].w);
  const needG7 = !(G[6].w && G[6].w === G[4].w);
  mk(7, G[6].w, G[6].l); if (!needG7) G[7].skipped = true;
  const champion = G[6].w && !needG7 ? G[6].w : (G[7].w || '');
  return { G, champion, live, seeds };
}
function championOf(month) { return D.playoffs.some(p => p.month === month) ? buildBracket(month).champion : ''; }

function bracketHTML(month) {
  const { G, champion, live } = buildBracket(month);
  const card = g => {
    const side = (p, seed, won, ph) => `<div class="side ${won ? 'won' : ''}"><span>${seed ? `<span class="seed">${seed}</span>` : ''}${esc(p) || `<span class="muted">${ph}</span>`}</span>${won ? '<span>✔</span>' : ''}</div>`;
    return `<div class="match ${g.skipped ? 'skipped' : ''}"><div class="gname">Game ${g.n}${g.n === 7 ? ' · Championship' : ''}${g.skipped ? ' · not needed' : g.n === 7 ? ' · only if needed' : ''}</div>${side(g.a, g.sa, g.w && g.w === g.a, 'TBD')}${side(g.b, g.sb, g.w && g.w === g.b, 'TBD')}</div>`;
  };
  const col = (title, ns) => `<div class="round"><h3>${title}</h3><div class="matches">${ns.map(n => card(G[n])).join('')}</div></div>`;
  return `${champion ? `<p class="champ">🏆 Champion: <b>${esc(champion)}</b></p>` : ''}${live ? '<p class="muted">Seeded from the current standings. Updates as results come in.</p>' : ''}
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
    const lastChamp = pastMonths().map(championOf).find(Boolean);
    return `<h1>${esc(t.title || D.config.leagueName)}</h1>${t.html.split('<h2>')[0]}
      <div class="grid">
        <div class="card stat"><div class="num">${esc(board[0]?.gp ? board[0].name : '—')}</div><div class="label">${useNow ? 'Current leader' : (prev ? monthLabel(prev) + ' leader' : 'Leader')}</div></div>
        <div class="card stat"><div class="num">${monthGames(m).length}</div><div class="label">Games in ${m ? monthLabel(m) : 'this month'}</div></div>
        <div class="card stat"><div class="num">${D.members.length}</div><div class="label">Players</div></div>
        <div class="card stat"><div class="num">${esc(lastChamp || '—')}</div><div class="label">Last champion</div></div>
      </div>
      <h2>${useNow ? 'Standings' : (prev ? monthLabel(prev) + ' final standings' : 'Standings')}</h2>${standingsTable(board, 4)}
      <h2>Latest games</h2>${gamesTable([...D.games].sort(cmpNew).slice(0, 5))}
      ${t.html.includes('<h2>') ? '<h2>' + t.html.split('<h2>').slice(1).join('<h2>') : ''}`;
  },
  rules() {
    const t = textBlocks(D.rules);
    return `<h1>${esc(t.title || 'Rules')}</h1><div class="card rules">${t.html}</div>`;
  },
  members() {
    const ini = n => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    return `<h1>Members</h1><p class="lead">${D.members.length} players in the league.</p><div class="grid">${D.members.map(m =>
      `<div class="card member"><div class="avatar">${esc(ini(m.name))}</div><div><b>${esc(m.name)}</b><div class="team">${esc(m.team_name)}</div>${m.established ? `<div class="muted">Established ${dateLabel(m.established)}</div>` : ''}</div></div>`).join('')}</div>`;
  },
  gamelog() {
    const m = cur(), games = monthGames(m);
    return `<h1>Game Log</h1><p class="lead">${m ? monthLabel(m) : ''} · ${games.length} games. The log starts fresh each month; earlier months are in <a href="#/gamelog-history">Game Log History</a>.</p>${gamesTable(games)}`;
  },
  'gamelog-history'() {
    const ms = pastMonths().filter(m => monthGames(m).length);
    return `<h1>Game Log History</h1><p class="lead">Every game from past months.</p>${ms.length ? ms.map((m, i) =>
      `<details ${i === 0 ? 'open' : ''}><summary>${monthLabel(m)} <span class="muted">· ${monthGames(m).length} games</span></summary><div class="inner">${gamesTable(monthGames(m))}</div></details>`).join('') : '<p class="muted">No archived months yet.</p>'}`;
  },
  standings() {
    const m = cur();
    return `<h1>Current Standings</h1><p class="lead">${m ? monthLabel(m) : ''} · 3 pts for a win, 2 for an overtime win, 1 for an overtime loss.</p>${standingsTable(standingsFor(monthGames(m)))}${STAT_KEY}`;
  },
  'standings-history'() {
    const ms = pastMonths().filter(m => monthGames(m).length);
    return `<h1>Standings History</h1><p class="lead">Final standings from past months.</p>${ms.length ? ms.map((m, i) => {
      const ch = championOf(m);
      return `<details ${i === 0 ? 'open' : ''}><summary>${monthLabel(m)}${ch ? ` — 🏆 ${esc(ch)}` : ''}</summary><div class="inner">${standingsTable(standingsFor(monthGames(m)))}</div></details>`;
    }).join('') + STAT_KEY : '<p class="muted">No completed months yet.</p>'}`;
  },
  playoffs() {
    return `<h1>Playoff Bracket</h1><p class="lead">${monthLabel(cur())} · every month the players are seeded by standings into a double-elimination bracket.</p>${bracketHTML(cur())}`;
  },
  'playoffs-history'() {
    const ms = pastMonths().filter(m => D.playoffs.some(p => p.month === m));
    return `<h1>Playoff History</h1><p class="lead">Brackets and champions from past months.</p>${ms.length ? ms.map((m, i) => {
      const ch = championOf(m);
      return `<details ${i === 0 ? 'open' : ''}><summary>${monthLabel(m)}${ch ? ` — 🏆 ${esc(ch)}` : ''}</summary><div class="inner">${bracketHTML(m)}</div></details>`;
    }).join('') : '<p class="muted">No past playoffs yet.</p>'}`;
  },
};

/* ---------- router ---------- */
function route() {
  const id = location.hash.replace(/^#\/?/, '') || 'home';
  const page = view[id] ? id : 'home';
  document.getElementById('app').innerHTML = view[page]();
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.id === page));
  document.getElementById('nav').classList.remove('open');
  document.title = `${PAGES.find(p => p[0] === page)[1]} · ${D.config.leagueName}`;
  window.scrollTo(0, 0);
}

(async () => {
  await load();
  document.getElementById('league-name').textContent = D.config.leagueName;
  document.getElementById('nav').innerHTML = PAGES.map(([id, label]) => `<a href="#/${id}" data-id="${id}">${label}</a>`).join('');
  document.querySelector('.menu-toggle').onclick = e => {
    const open = document.getElementById('nav').classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', open);
  };
  window.addEventListener('hashchange', route);
  route();
})();
