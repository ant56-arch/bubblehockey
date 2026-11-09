const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127'; const fs = require('fs'), vm = require('vm');
const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync('js/bracket.js', 'utf8') + '\nthis.bracketModel = bracketModel;', ctx); const { bracketModel } = ctx;
let seedrng = 777; const rnd = () => (seedrng = (seedrng * 1664525 + 1013904223) % 4294967296) / 4294967296;
(async () => {
  const b = await launch(); const fails = [], errs = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const pad = i => 'P' + String(i).padStart(2, '0');
  const membersCsv = N => ['name,short_name,team_name,established,logo,alt_logo', ...Array.from({ length: N }, (_, i) => `Player ${i + 1},${pad(i + 1)},Team ${i + 1},2026-10-01,,`)].join('\n') + '\n';
  const simulate = N => { const seeds = Array.from({ length: N }, (_, i) => pad(i + 1)), data = {}, entries = [];
    for (let g = 0; g < 200; g++) { const m = bracketModel(seeds, data), open = m.list.map(n => m.G[n]).filter(x => x.a && x.b && !x.w && !x.skipped); if (!open.length) break; const x = open[0], aWins = rnd() < 0.6 === (+x.a.slice(1) < +x.b.slice(1)); data['g' + x.n] = aWins ? x.a : x.b; entries.push({ month: '2026-10', home: x.a, road: x.b, homeScore: aWins ? 5 : 3, roadScore: aWins ? 3 : 5, playoff: true }); }
    const m = bracketModel(seeds, data); return { seeds, entries, champion: m.champion, played: entries.length, m }; };
  const open = async (members, games, config, time = '2026-10-28T13:00:00', vp = { width: 390, height: 900 }) => {
    const p = await (await b.newContext({ viewport: vp })).newPage(); p.on('pageerror', e => errs.push(e.message)); await p.clock.install({ time: new Date(time) });
    if (members) await p.route('**/data/members.csv', r => r.fulfill({ status: 200, contentType: 'text/csv', body: members }));
    if (games) await p.route('**/data/games.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(games) }));
    if (config) await p.route('**/data/config.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) }));
    return p; };
  const go = async (p, h) => { await p.goto(BASE + '/#/' + h); await p.waitForTimeout(900); };
  const txt = (p, s) => p.textContent(s).then(x => x.replace(/\s+/g, ' ').trim());

  // ---- 1. October's real data is unchanged
  let p = await open(null, null, null); await go(p, 'playoffs');
  ok('OCTOBER: champion Connor, 6 scored games, bracket sections present', (await txt(p, '.champ')).includes('Connor') && (await p.$$eval('.match', m => m.filter(x => [...x.querySelectorAll('.side')].every(s => /^\d+$/.test(s.lastElementChild ? s.lastElementChild.textContent.trim() : ''))).length)) >= 6 && (await p.$$eval('h2', h => h.map(x => x.textContent).join('|'))).includes('Winners bracket') && (await p.$$eval('h2', h => h.map(x => x.textContent).join('|'))).includes('Grand final'));
  const octCards = await p.$$eval('.match .gname', g => g.map(x => x.textContent.replace(/\s+/g, ' ')));
  ok('OCTOBER: 7 cards in the 4-team shape (Game 6 = Grand final, Game 7 not needed)', octCards.length === 7 && octCards[5].includes('Grand final') && octCards[6].includes('not needed'), octCards.join(' | '));
  const names = await p.$$eval('.match', m => m.map(x => [...x.querySelectorAll('.side > span:first-child')].map(s => s.textContent.replace(/\s+/g, ' ').trim()).join(' v ')));
  ok('OCTOBER: same pairings as before (1 Connor v 4 Boban; 2 Trotta v 3 Tommy; ...)', names[0].includes('Connor') && names[0].includes('Boban') && names[1].includes('Trotta') && names[1].includes('Tommy') && names[4].includes('Trotta') && names[4].includes('Tommy'), names.join(' || '));
  await go(p, 'members'); await p.click('.mcard summary'); await p.waitForTimeout(200); await p.click('.mcard[open] .sub:nth-of-type(2) > summary').catch(() => {});
  const rec = await p.evaluate(() => ['Connor', 'Tommy', 'Trotta', 'Boban'].map(n => n + ' ' + (r => `${r.w}-${r.l} t${r.titles.length} f${r.finals} ru${r.runnerUps}`)(playoffRecord(n))).join(' | '));
  ok('OCTOBER: member playoff records unchanged', rec === 'Connor 3-0 t1 f1 ru0 | Tommy 2-2 t0 f1 ru1 | Trotta 1-2 t0 f0 ru0 | Boban 0-2 t0 f0 ru0', rec);
  await go(p, 'schedule'); const days = await p.$$eval('.day .dayhead', d => d.map(x => x.innerText.replace(/\s+/g, ' '))); ok('OCTOBER: schedule still shows Oct 28 as the 6-game playoff day', days[0].includes('Oct 28') && days[0].includes('Playoffs') && days[0].includes('6 games'), days[0]);

  // ---- 2. leagues of many sizes with a fully simulated playoff
  const base = JSON.parse(fs.readFileSync('data/games.json', 'utf8')), cfgBase = JSON.parse(fs.readFileSync('data/config.json', 'utf8'));
  for (const N of [2, 3, 5, 8, 13, 20]) {
    const sim = simulate(N), games = { _how: 'x', games: sim.entries };
    p = await open(membersCsv(N), games, cfgBase); await go(p, 'playoffs');
    const champ = (await p.textContent('.champ').catch(() => '')).replace(/\s+/g, ' '), cards = (await p.$$('.match')).length, banner = !!(await p.$('.alert'));
    ok(`N=${N}: champion shown (${sim.champion}) and all ${sim.m.list.length} game cards drawn, no warnings`, champ.includes(sim.champion) && cards === sim.m.list.length && !banner, `${champ.slice(0, 40)} | ${cards} cards | warnings=${banner}`);
    ok(`N=${N}: ${sim.played} playoff games all placed in the bracket (none unmatched)`, await p.evaluate(() => buildBracket('2026-10').unmatched.length) === 0);
    const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth); ok(`N=${N}: no sideways scroll on a phone`, !over);
    if (N === 20) await p.screenshot({ path: '.scratch/n20-phone.png', fullPage: false });
    // member records add up
    const tot = await p.evaluate(n => { let w = 0, l = 0; for (let i = 1; i <= n; i++) { const r = playoffRecord('P' + String(i).padStart(2, '0')); w += r.w; l += r.l; } return { w, l }; }, N);
    ok(`N=${N}: member playoff wins = losses = games played`, tot.w === tot.l && tot.w === sim.played, JSON.stringify(tot) + ' vs ' + sim.played);
  }
  // ---- 3. before any playoff game: projected bracket from the standings, byes, and the cap setting
  p = await open(membersCsv(20), { games: [] }, cfgBase); await go(p, 'playoffs');
  const s20 = await p.evaluate(() => { const B = buildBracket('2026-10'); return { teams: B.seeds.length, games: B.list.length, byes: B.S.P - B.seeds.length, round1: B.S.games.filter(g => g.kind === 'W' && g.round === 1).length }; });
  ok('20 teams (nothing played yet): 20-team bracket, 38 games + reset, 12 first-round byes, 4 first-round games', s20.teams === 20 && s20.games === 39 + 0 && s20.byes === 12 && s20.round1 === 4, JSON.stringify(s20));
  ok('projected-bracket note is shown and says how many byes', (await txt(p, '#app')).includes('top 12 seeds get a first-round bye') && (await txt(p, '#app')).includes('Seeded from the current standings'));
  p = await open(membersCsv(20), { games: [] }, { ...cfgBase, playoffs: { teams: 8 } }); await go(p, 'playoffs');
  ok('config "playoffs.teams": 8 keeps only the top 8 (14 games + reset)', await p.evaluate(() => { const B = buildBracket('2026-10'); return B.seeds.length === 8 && B.list.length === 15; }));
  p = await open(membersCsv(25), { games: [] }, cfgBase); await go(p, 'playoffs'); ok('a league bigger than 20 is capped at 20 teams', await p.evaluate(() => buildBracket('2026-10').seeds.length) === 20);
  // ---- 4. the schedule splits a big bracket over the playoff days
  p = await open(membersCsv(20), { games: [] }, { ...cfgBase, schedule: { playoffDays: 2 } }, '2026-11-02T10:00:00'); await go(p, 'schedule'); await p.click('.chip[data-m="2026-11"]').catch(() => {}); await p.waitForTimeout(400);
  const po = await p.$$eval('.day', d => d.filter(x => x.querySelector('.tag')?.textContent === 'Playoffs').map(x => ({ h: x.querySelector('.dayhead').innerText.replace(/\s+/g, ' '), rows: x.querySelectorAll('.mrow').length, labels: [...x.querySelectorAll('.mrow .muted')].slice(0, 3).map(e => e.textContent).join(',') })));
  ok('20 teams: two playoff days, 20 + 19 games between them (the reset game only if needed)', po.length === 2 && po[0].rows + po[1].rows === 39 && Math.abs(po[0].rows - po[1].rows) <= 1, JSON.stringify(po.map(x => x.rows)));
  ok('later games are labelled by where their teams come from (Winner G3, Loser G7...)', /Winner G\d+|Loser G\d+/.test(po[0].labels + po[1].labels), po[1].labels);
  ok('schedule page: no sideways scroll with a 20-team playoff day', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  console.log('page errors:', errs); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
