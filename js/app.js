/* Bubble Hockey League site. All data lives in /data (CSV + config.json). */
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

const D = {}; // loaded data
async function load() {
  const get = async (f, json) => { try { const r = await fetch('data/' + f); if (!r.ok) throw 0; return json ? r.json() : parseCSV(await r.text()); } catch { return json ? {} : []; } };
  const [config, members, games, playoffs] = await Promise.all([
    get('config.json', true), get('members.csv'), get('games.csv'), get('playoffs.csv')]);
  D.config = { leagueName: 'Bubble Hockey League', currentSeason: '', pointsForWin: 2, pointsForOvertimeLoss: 1, pointsForLoss: 0, ...config };
  D.members = members;
  D.games = games.map(g => ({ ...g, score1: +g.score1, score2: +g.score2, ot: /^(y|yes|true|1|ot)$/i.test(g.overtime || ''), month: (g.date || '').slice(0, 7) }))
    .filter(g => g.player1 && g.player2).sort((a, b) => b.date.localeCompare(a.date));
  D.playoffs = playoffs;
  if (!D.config.currentSeason) D.config.currentSeason = [...new Set(D.games.map(g => g.season))].sort().pop() || '';
}

/* ---------- helpers ---------- */
const monthLabel = m => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' }); };
const dateLabel = d => { const [y, m, dd] = d.split('-'); return new Date(+y, +m - 1, +dd).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }); };
const seasons = () => [...new Set([...D.games.map(g => g.season), ...D.playoffs.map(p => p.season)])].filter(Boolean).sort().reverse();
const pastSeasons = () => seasons().filter(s => s !== D.config.currentSeason);
const currentMonth = () => D.games.find(g => g.season === D.config.currentSeason)?.month || '';

function standingsFor(games) {
  const t = {}; const c = D.config;
  const row = n => t[n] ??= { name: n, gp: 0, w: 0, l: 0, otl: 0, gf: 0, ga: 0, pts: 0 };
  for (const g of games) {
    const a = row(g.player1), b = row(g.player2);
    a.gp++; b.gp++; a.gf += g.score1; a.ga += g.score2; b.gf += g.score2; b.ga += g.score1;
    if (g.score1 === g.score2) continue;
    const [win, lose] = g.score1 > g.score2 ? [a, b] : [b, a];
    win.w++; win.pts += +c.pointsForWin;
    if (g.ot) { lose.otl++; lose.pts += +c.pointsForOvertimeLoss; } else { lose.l++; lose.pts += +c.pointsForLoss; }
  }
  return Object.values(t).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.name.localeCompare(y.name));
}

function standingsTable(rows) {
  if (!rows.length) return '<p class="muted">No games recorded yet.</p>';
  return `<div class="table-scroll"><table><thead><tr><th>#</th><th>Player</th><th class="n">GP</th><th class="n">W</th><th class="n">L</th><th class="n">OTL</th><th class="n">GF</th><th class="n">GA</th><th class="n">+/-</th><th class="n">PTS</th></tr></thead><tbody>${
    rows.map((r, i) => `<tr class="${i === 0 ? 'leader' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td class="n">${r.gp}</td><td class="n">${r.w}</td><td class="n">${r.l}</td><td class="n">${r.otl}</td><td class="n">${r.gf}</td><td class="n">${r.ga}</td><td class="n">${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td class="n"><b>${r.pts}</b></td></tr>`).join('')
  }</tbody></table></div>`;
}

function gamesTable(games, showSeason) {
  if (!games.length) return '<p class="muted">No games yet.</p>';
  return `<div class="table-scroll"><table><thead><tr><th>Date</th>${showSeason ? '<th>Season</th>' : ''}<th>Player</th><th class="n">Score</th><th>Player</th><th></th></tr></thead><tbody>${
    games.map(g => {
      const w1 = g.score1 > g.score2, w2 = g.score2 > g.score1;
      return `<tr><td>${dateLabel(g.date)}</td>${showSeason ? `<td>${esc(g.season)}</td>` : ''}<td class="${w1 ? 'win' : ''}">${esc(g.player1)}</td><td class="n">${g.score1} – ${g.score2}</td><td class="${w2 ? 'win' : ''}">${esc(g.player2)}</td><td>${g.ot ? '<span class="tag">OT</span>' : ''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function playoffSeasonData(season) {
  const rounds = {};
  for (const p of D.playoffs.filter(p => p.season === season)) (rounds[p.round] ??= { name: p.round_name || 'Round ' + p.round, matches: [] }).matches.push(p);
  return Object.keys(rounds).sort((a, b) => a - b).map(k => ({ ...rounds[k], matches: rounds[k].matches.sort((a, b) => a.match - b.match) }));
}
function championOf(season) {
  const rounds = playoffSeasonData(season); const last = rounds[rounds.length - 1]?.matches[0];
  if (!last || last.score1 === '' || last.score2 === '' || +last.score1 === +last.score2) return null;
  return +last.score1 > +last.score2 ? last.player1 : last.player2;
}
function bracket(season) {
  const rounds = playoffSeasonData(season);
  if (!rounds.length) return '<p class="muted">No playoff data for this season.</p>';
  const side = (n, seed, score, won) => `<div class="side ${won ? 'won' : ''}"><span>${seed ? `<span class="seed">${esc(seed)}</span>` : ''}${esc(n) || '<span class="muted">TBD</span>'}</span><span>${esc(score)}</span></div>`;
  return `<div class="bracket">${rounds.map(r => `<div class="round"><h3>${esc(r.name)}</h3><div class="matches">${r.matches.map(m => {
    const done = m.score1 !== '' && m.score2 !== '';
    return `<div class="match">${side(m.player1, m.seed1, m.score1, done && +m.score1 > +m.score2)}${side(m.player2, m.seed2, m.score2, done && +m.score2 > +m.score1)}</div>`;
  }).join('')}</div></div>`).join('')}</div>`;
}

/* ---------- pages ---------- */
const view = {
  home() {
    const cur = D.games.filter(g => g.season === D.config.currentSeason);
    const top = standingsFor(cur);
    const lastChamp = pastSeasons().map(championOf).find(Boolean);
    return `<h1>${esc(D.config.leagueName)}</h1><p class="lead">${esc(D.config.tagline || '')}</p>
      <div class="grid">
        <div class="card stat"><div class="num">${esc(top[0]?.name || '—')}</div><div class="label">Current leader</div></div>
        <div class="card stat"><div class="num">${cur.length}</div><div class="label">Games this season (${esc(D.config.currentSeason)})</div></div>
        <div class="card stat"><div class="num">${D.members.length}</div><div class="label">Members</div></div>
        <div class="card stat"><div class="num">${esc(lastChamp || '—')}</div><div class="label">Last champion</div></div>
      </div>
      <h2>Top 3</h2>${standingsTable(top.slice(0, 3))}
      <h2>Latest games</h2>${gamesTable(D.games.slice(0, 5))}`;
  },
  rules() {
    return `<h1>Rules</h1><p class="lead">The official house rules. Edit this list in <code>js/app.js</code> or ask the commissioner.</p>
      <div class="card rules"><ol>
        <li>Games are played to <b>7 goals</b> or the end of <b>3 periods</b>, whichever comes first. Most goals wins.</li>
        <li>Each win earns <b>${D.config.pointsForWin} points</b>. An overtime loss earns <b>${D.config.pointsForOvertimeLoss}</b>. A regulation loss earns ${D.config.pointsForLoss}.</li>
        <li>Ties after regulation go to sudden-death overtime — first goal wins.</li>
        <li>No spinning the rods 360°. Wrist action only.</li>
        <li>Both players must report the score to the commissioner the same day. Unreported games don't count.</li>
        <li>Standings tiebreakers: points, then goal differential, then goals for.</li>
        <li>The top 4 players qualify for the playoffs. Seeds are by regular-season standing.</li>
        <li>The game log resets monthly; the full history is always available.</li>
      </ol></div>`;
  },
  members() {
    const ini = n => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    return `<h1>Members</h1><p class="lead">${D.members.length} players in the league.</p><div class="grid">${D.members.map(m =>
      `<div class="card member"><div class="avatar">${esc(ini(m.name))}</div><div><b>${esc(m.name)}</b><div class="muted">${[m.department, m.favorite_team && 'Fan of ' + m.favorite_team].filter(Boolean).map(esc).join(' · ')}</div>${m.joined ? `<div class="muted">Joined ${esc(m.joined)}</div>` : ''}${m.bio ? `<div>${esc(m.bio)}</div>` : ''}</div></div>`).join('')}</div>`;
  },
  gamelog() {
    const m = currentMonth();
    const games = D.games.filter(g => g.season === D.config.currentSeason && g.month === m);
    return `<h1>Game Log</h1><p class="lead">${m ? monthLabel(m) : 'No games yet'} · ${games.length} games. Resets each month — see <a href="#/gamelog-history">history</a> for earlier months.</p>${gamesTable(games)}`;
  },
  'gamelog-history'() {
    const m = currentMonth();
    const older = D.games.filter(g => !(g.season === D.config.currentSeason && g.month === m));
    const ss = [...new Set(older.map(g => g.season))].sort().reverse();
    return `<h1>Game Log History</h1><p class="lead">Every month before the current one.</p>
      <div class="toolbar"><label>Season <select id="f-season"><option value="">All</option>${ss.map(s => `<option>${esc(s)}</option>`).join('')}</select></label></div><div id="hist"></div>`;
  },
  standings() {
    return `<h1>Current Standings</h1><p class="lead">Season ${esc(D.config.currentSeason)} · ${D.config.pointsForWin} pts for a win, ${D.config.pointsForOvertimeLoss} for an OT loss.</p>${standingsTable(standingsFor(D.games.filter(g => g.season === D.config.currentSeason)))}`;
  },
  'standings-history'() {
    const ps = pastSeasons();
    if (!ps.length) return '<h1>Standings History</h1><p class="muted">No completed seasons yet.</p>';
    return `<h1>Standings History</h1><p class="lead">Final standings from completed seasons.</p>${ps.map((s, i) => {
      const ch = championOf(s);
      return `<details ${i === 0 ? 'open' : ''}><summary>Season ${esc(s)}${ch ? ` — 🏆 ${esc(ch)}` : ''}</summary><div class="inner">${standingsTable(standingsFor(D.games.filter(g => g.season === s)))}</div></details>`;
    }).join('')}`;
  },
  playoffs() {
    return `<h1>Playoff Bracket</h1><p class="lead">Season ${esc(D.config.currentSeason)}</p>${bracket(D.config.currentSeason)}`;
  },
  'playoffs-history'() {
    const ps = pastSeasons().filter(s => D.playoffs.some(p => p.season === s));
    if (!ps.length) return '<h1>Playoff History</h1><p class="muted">No past playoffs yet.</p>';
    return `<h1>Playoff History</h1><p class="lead">Brackets and champions from past seasons.</p>${ps.map((s, i) => {
      const ch = championOf(s);
      return `<details ${i === 0 ? 'open' : ''}><summary>Season ${esc(s)}${ch ? ` — 🏆 ${esc(ch)}` : ''}</summary><div class="inner">${bracket(s)}</div></details>`;
    }).join('')}`;
  },
};

const after = {
  'gamelog-history'() {
    const m = currentMonth();
    const draw = () => {
      const f = document.getElementById('f-season').value;
      const older = D.games.filter(g => !(g.season === D.config.currentSeason && g.month === m) && (!f || g.season === f));
      const byMonth = {}; older.forEach(g => (byMonth[g.month] ??= []).push(g));
      const keys = Object.keys(byMonth).sort().reverse();
      document.getElementById('hist').innerHTML = keys.length
        ? keys.map((k, i) => `<details ${i === 0 ? 'open' : ''}><summary>${monthLabel(k)} <span class="muted">· ${byMonth[k].length} games</span></summary><div class="inner">${gamesTable(byMonth[k], true)}</div></details>`).join('')
        : '<p class="muted">No archived games.</p>';
    };
    document.getElementById('f-season').onchange = draw; draw();
  },
};

/* ---------- router ---------- */
function route() {
  const id = (location.hash.replace(/^#\/?/, '') || 'home');
  const page = view[id] ? id : 'home';
  document.getElementById('app').innerHTML = view[page]();
  after[page]?.();
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
