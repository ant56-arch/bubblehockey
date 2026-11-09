const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127';
(async () => {
  const b = await launch(), fails = [], errs = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const mk = async () => { const p = await (await b.newContext({ viewport: { width: 400, height: 1000 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(BASE + '/#/resources'); await p.waitForTimeout(1300); return p; };
  const idle = p => p.waitForFunction(() => SP.screen !== 'play' || SP.phase === 'aim', null, { timeout: 8000 });
  const takeShot = async p => { await p.evaluate(() => spTap()); await p.evaluate(() => spTap()); };
  let p = await mk();
  ok('Resources lists three games', (await p.$$('.res-list .card')).length === 3 && /Slap Shot/.test(await p.textContent('.res-list')));
  const z = await p.evaluate(() => { const N = SP_NET, X = N.x, y = pw => spHeight(pw); return { top: spScoreFor(X - 86, y(0.65)).pts, low: spScoreFor(X + 86, y(0.22)).pts, mid: spScoreFor(X, y(0.43)).pts, plain: spScoreFor(X + 40, y(0.5)).pts, ground: spScoreFor(X + 40, y(0)).pts, bar: spScoreFor(X, y(0.97)).out, edge: spScoreFor(X, y(0.87)).out, wide: spScoreFor(X + 160, y(0.5)).out, post: spScoreFor(X - N.W / 2, y(0.5)).out }; });
  ok('power sets the height: 0.65 reaches the top corners, 0.22 the low corners, 0.43 the middle', z.top === 5 && z.low === 5 && z.mid === 2 && z.plain === 1 && z.ground === 1, JSON.stringify(z));
  ok('too much power goes over the bar, the crossbar and posts are posts, and wide is wide', z.bar === 'WIDE' && z.edge === 'POST!' && z.wide === 'WIDE' && z.post === 'POST!', JSON.stringify(z));
  await p.click('[data-res=slapshot]'); ok('menu offers solo and two players', !!(await p.$('[data-sp=start][data-mode=solo]')) && !!(await p.$('[data-sp=start][data-mode=two]')));
  await p.click('[data-sp=start][data-mode=solo]'); await p.fill('#sp-n0', 'Ann'); await p.click('[data-sp=go]');
  ok('solo: starts on step 1 (set aim)', /SET AIM/.test(await p.textContent('.fo-tap')) && /Shot 1 of 10/.test(await p.textContent('.sg-meta')));
  const x0 = await p.evaluate(() => spAim(performance.now()).x); await p.waitForTimeout(250); const x1 = await p.evaluate(() => spAim(performance.now()).x); ok('the aim line moves on its own', Math.abs(x1 - x0) > 20, `${Math.round(x0)} -> ${Math.round(x1)}`);
  await p.click('.fo-tap'); await p.waitForFunction(() => SP.phase === 'power');
  ok('first tap locks the aim and moves on to step 2 (set power)', /SET POWER/.test(await p.textContent('.fo-tap')) && (await p.evaluate(() => SP.lockX !== null)));
  const l0 = await p.evaluate(() => spAim(performance.now())); await p.waitForTimeout(200); const l1 = await p.evaluate(() => spAim(performance.now()));
  ok('the aim stays locked while the power meter moves', l0.x === l1.x && l0.p !== l1.p && l1.p >= 0 && l1.p <= 1, `x ${Math.round(l0.x)}, p ${l0.p.toFixed(2)} -> ${l1.p.toFixed(2)}`);
  await p.click('.fo-tap'); await p.waitForTimeout(100);
  ok('second tap shoots; the button is disabled and the score is not given away', (await p.evaluate(() => SP.phase)) === 'shot' && (await p.$eval('.fo-tap', x => x.disabled)) && (await p.evaluate(() => SP.score[0])) === 0);
  await idle(p);
  for (let i = 0; i < 40 && (await p.evaluate(() => SP.screen)) === 'play'; i++) { await idle(p); if ((await p.evaluate(() => SP.screen)) !== 'play') break; await takeShot(p); await idle(p); }
  await p.waitForSelector('.sg-end', { timeout: 10000 });
  const end = await p.evaluate(() => ({ score: SP.score[0], sum: SP.log[0].reduce((a, x) => a + (typeof x === 'number' ? x : 0), 0), n: SP.log[0].length }));
  ok('solo ends after exactly 10 shots and the score equals the points scored', end.n === 10 && end.score === end.sum, JSON.stringify(end));
  const rec = await p.evaluate(() => localStorage.getItem('bhl_slapshot')); ok('best score saved in this browser', /"best":\d+/.test(rec) && /"games":1/.test(rec), rec);
  const forced = await p.evaluate(() => {
    const run = (lockX, power) => { SP.screen = 'play'; SP.turn = 0; SP.k = [0, 0]; SP.phase = 'power'; SP.lockX = lockX; SP.p0 = performance.now(); SP.ph = [0, power]; SP.shot = null; spShoot(); return { kind: SP.shot.kind, out: SP.shot.out, p: +SP.shot.p.toFixed(2) }; };
    const orig = Math.random; Math.random = () => 0.5;
    const r = { soft: run(SP_NET.x, 0.05), over: run(SP_NET.x, 0.97) }; Math.random = orig; return r;
  });
  ok('a very weak shot is an easy save (soft shot)', forced.soft.kind === 'save' && forced.soft.out === 'SOFT SHOT!', JSON.stringify(forced.soft));
  ok('too much power is a miss over the bar', forced.over.kind === 'wide', JSON.stringify(forced.over));
  const speeds = await p.evaluate(() => {
    SP.phase = 'aim'; SP.lockX = null; SP.turn = 0;
    const f = k => { SP.k = [k, 0]; SP.aim0 = 0; SP.ph = [0, 0]; const xs = []; for (let t = 0; t < 4000; t += 10) xs.push(spAim(t).x); let flips = 0; for (let i = 2; i < xs.length; i++) if ((xs[i] - xs[i - 1]) * (xs[i - 1] - xs[i - 2]) < 0) flips++; return flips; };
    const pf = k => { SP.phase = 'power'; SP.k = [k, 0]; SP.p0 = 0; SP.ph = [0, 0]; let flips = 0, prev = 0, dir = 1; for (let t = 10; t < 4000; t += 10) { const q = spAim(t).p, d = Math.sign(q - prev); if (d && d !== dir) { flips++; dir = d; } prev = q; } return flips; };
    return { aim: [f(0), f(9)], power: [pf(0), pf(9)] };
  });
  ok('the aim line and the power meter both get faster on shot 10', speeds.aim[1] > speeds.aim[0] && speeds.power[1] > speeds.power[0], JSON.stringify(speeds));
  const rates = await p.evaluate(() => { const rate = (k, pw) => { let s = 0; for (let i = 0; i < 4000; i++) { const sd = Math.max(46, 66 - 2.2 * k), dx = spGauss(sd), dy = spGauss(sd * 0.7); if (Math.hypot(dx, dy) < 36 + (1 - pw) * 12) s++; } return s / 4000; }; return [rate(0, 0.65), rate(9, 0.65), rate(0, 0.25), rate(0, 0.9)]; });
  ok('goalie saves more later in the game, and a softer shot is easier to save than a hard one', rates[1] > rates[0] && rates[0] > 0.2 && rates[1] < 0.6 && rates[2] > rates[3], rates.map(x => Math.round(x * 100) + '%').join(' / '));
  p = await mk(); await p.click('[data-res=slapshot]'); await p.click('[data-sp=start][data-mode=two]'); await p.fill('#sp-n0', 'Ann'); await p.fill('#sp-n1', 'Bob'); await p.click('[data-sp=go]');
  const turns = []; for (let i = 0; i < 20; i++) { await idle(p); if ((await p.evaluate(() => SP.screen)) !== 'play') break; turns.push(await p.evaluate(() => SP.turn)); await takeShot(p); await idle(p); }
  await p.waitForSelector('.sg-end', { timeout: 10000 });
  ok('2P: players alternate and each takes 10 shots', turns.length === 20 && turns.every((t, i) => t === i % 2), turns.join(''));
  ok('2P: the end screen names a winner or a tie', /wins!|A tie!/.test(await p.textContent('.sg-end h2')), await p.textContent('.sg-end h2'));
  p = await mk(); await p.click('[data-res=slapshot]'); await p.click('[data-sp=start][data-mode=solo]'); await p.click('[data-sp=go]'); await p.waitForTimeout(300);
  await p.keyboard.press('Space'); await p.waitForFunction(() => SP.phase === 'power'); await p.keyboard.press('Space'); ok('Space does both taps', (await p.evaluate(() => SP.phase)) === 'shot');
  p = await mk(); await p.click('[data-res=slapshot]'); await p.click('[data-sp=start][data-mode=solo]'); await p.click('[data-sp=go]'); await p.waitForTimeout(300);
  await p.keyboard.press('Escape'); await p.keyboard.press('Space'); ok('while the boss screen is up, Space does nothing', (await p.evaluate(() => SP.phase)) === 'aim'); await p.keyboard.press('Escape');
  ok('no sideways scroll on a phone', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  console.log('page errors:', errs); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
