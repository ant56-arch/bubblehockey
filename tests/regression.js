const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127'; const fs = require('fs');
(async () => {
  const b = await launch(); const fails = [], issues = new Map(); let views = 0;
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const note = (k, v) => { if (!issues.has(k)) issues.set(k, new Set()); issues.get(k).add(v); };
  const pad = i => 'P' + String(i).padStart(2, '0');
  const csv20 = ['name,short_name,team_name,established,logo,alt_logo', ...Array.from({ length: 20 }, (_, i) => `Player ${i + 1},${pad(i + 1)},Team ${i + 1},2026-10-01,,`)].join('\n') + '\n';
  const pages = ['home', 'rules', 'members', 'schedule', 'standings', 'playoffs', 'resources', 'add'];
  // dates are chosen relative to the newest game in data/games.json, so a game is never "from the future" on the pretend clock
  const lastDate = JSON.parse(fs.readFileSync('data/games.json', 'utf8')).games.map(g => g.date).filter(Boolean).sort().pop(), at = (days, hour = 12) => { const d = new Date(lastDate + 'T12:00:00'); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10) + `T${String(hour).padStart(2, '0')}:00:00`; };
  const dates = [at(0, 13), at(3), at(25), '2027-01-04T09:00:00', '2027-03-15T20:00:00'];
  // 1. every page, real data
  for (const theme of ['light', 'dark']) for (const [vn, vp] of [['phone', { width: 360, height: 800 }], ['desk', { width: 1280, height: 800 }]]) for (const d of dates) {
    const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(t => { try { localStorage.setItem('bhl_theme', t); } catch (e) {} }, theme); await p.clock.install({ time: new Date(d) });
    for (const pg of pages) { await p.goto(BASE + '/#/' + pg); await p.waitForTimeout(300); views++;
      const r = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, empty: (document.getElementById('app').innerText || '').trim().length < 20, nan: /NaN|undefined|\[object/.test(document.getElementById('app').innerText), alert: !!document.querySelector('.alert') }));
      const tag = `${theme}/${vn}/${d.slice(0, 10)}/${pg}`; if (r.over > 1) note('sideways scroll', tag); if (r.empty) note('empty page', tag); if (r.nan) note('NaN/undefined text', tag); if (r.alert) note('warning banner', tag); if (errs.length) { note('JS error: ' + errs[0].slice(0, 100), tag); errs.length = 0; } }
    await ctx.close(); }
  ok(`real data: ${views} page views (phone/desktop, light/dark, 5 dates) with no errors, overflow, empty pages or warnings`, !issues.size, [...issues].map(([k, v]) => k + ' e.g. ' + [...v][0]).join(' | '));
  // 2. a 20-team league on every page, with a finished month-long season of games
  const games20 = { games: [] }; let seed = 5; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let d = 5; d <= 9; d++) for (let i = 1; i <= 20; i += 2) games20.games.push({ date: `2026-10-0${d}`, home: pad(i), road: pad(i + 1), homeScore: 2 + Math.floor(rnd() * 5), roadScore: 7 - Math.floor(rnd() * 4) === 2 ? 3 : 1 + Math.floor(rnd() * 3), homeShots: 10, roadShots: 11 });
  const bad20 = []; const p20 = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage(); const e20 = []; p20.on('pageerror', e => e20.push(e.message)); await p20.clock.install({ time: new Date('2026-10-12T12:00:00') });
  await p20.route('**/data/members.csv', r => r.fulfill({ status: 200, contentType: 'text/csv', body: csv20 })); await p20.route('**/data/games.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(games20) }));
  for (const pg of pages) { const t0 = Date.now(); await p20.goto(BASE + '/#/' + pg); await p20.waitForTimeout(500); const r = await p20.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, nan: /NaN|undefined|\[object/.test(document.getElementById('app').innerText), t: 0 })); if (r.over > 1 || r.nan) bad20.push(pg + JSON.stringify(r)); }
  ok('20-team league: every page loads (no errors, NaN or sideways scroll)', !bad20.length && !e20.length, bad20.join(' ') + e20.join(' '));
  const timing = await p20.evaluate(() => { const t = {}; for (const [name, fn] of [['schedule', () => view.schedule()], ['members', () => view.members()], ['standings', () => view.standings()], ['playoffs', () => view.playoffs()], ['home', () => view.home()]]) { const s = performance.now(); fn(); t[name] = Math.round(performance.now() - s); } return t; });
  ok('20-team league: every page renders fast (under 400ms each)', Object.values(timing).every(x => x < 400), JSON.stringify(timing));
  // 3. schedule fairness for 2..20 players (every pair once a day; equal home/road over two days)
  const fair = await p20.evaluate(() => { const saved = D.members, savedCfg = D.config.schedule, out = []; D.config.schedule = { ...(D.config.schedule || {}), minGamesPerDay: 0, roundsPerDay: 0 }; for (let n = 2; n <= 20; n++) { D.members = Array.from({ length: n }, (_, i) => ({ short_name: 'X' + i, established: '2026-01-01' })); const days = monthPlan('2026-11').reg; const h = {}, r = {}; let pairsOk = true;
    for (const d of days.slice(0, 2)) { const s = slateFor(d), seen = new Set(); s.forEach(g => { const k = [g.home, g.road].sort().join('|'); if (seen.has(k)) pairsOk = false; seen.add(k); h[g.home] = (h[g.home] || 0) + 1; r[g.road] = (r[g.road] || 0) + 1; }); if (s.length !== n * (n - 1) / 2) pairsOk = false; }
    const diffs = new Set(D.members.map(m => (h[m.short_name] || 0) - (r[m.short_name] || 0))); out.push(pairsOk && diffs.size === 1 && diffs.has(0) ? null : `n=${n} pairs=${pairsOk} diffs=${[...diffs]}`); } D.members = saved; D.config.schedule = savedCfg; return out.filter(Boolean); });
  ok('schedule (full round robin): for 2 to 20 players every pair plays once a day and home/road is equal over two days', !fair.length, fair.join('; '));
  // 4. data warnings: playoff rematches are fine; a game that does not fit is reported
  const base = JSON.parse(fs.readFileSync('data/games.json', 'utf8'));
  const rem = { ...base, games: [...base.games, { date: '2026-10-29', home: 'Connor', road: 'Tommy', homeScore: 6, roadScore: 4, playoff: true }] };   // an extra Connor v Tommy that no longer fits (Game 6 is done)
  const pw = await (await b.newContext()).newPage(); await pw.clock.install({ time: new Date(at(30)) }); await pw.route('**/data/games.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rem) }));
  await pw.goto(BASE + '/#/home'); await pw.waitForTimeout(800); const banner = (await pw.textContent('.alert').catch(() => '')) || '';
  ok('a playoff game that does not fit the bracket is reported, with no false "duplicate" warning', /does not fit the October 2026 bracket/.test(banner) && !/identical/.test(banner), banner.replace(/\s+/g, ' ').slice(0, 130));
  // 5. October's real standings and Home still correct
  const po = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage(); await po.clock.install({ time: new Date('2026-10-28T13:00:00') }); await po.goto(BASE + '/#/standings'); await po.waitForTimeout(800);
  ok('October standings unchanged (Connor 33 GP / 72 pts)', (await po.$$eval('.stand tbody tr', r => r.map(x => [...x.cells].filter(c => !c.classList.contains('mrec')).slice(1, 8).map(c => c.textContent.trim()).join(' ')).join(' / '))).startsWith('Connor 33 23 8 1 1 72'));
  await po.goto(BASE + '/#/home'); await po.waitForTimeout(600); ok('Home still shows Connor as the champion card · October 2026', await po.evaluate(() => { const c = [...document.querySelectorAll('.pc')].find(x => /Champion/.test(x.querySelector('h2').textContent)); return !!c && c.textContent.includes('Connor') && c.textContent.includes('October 2026'); }));
  console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
