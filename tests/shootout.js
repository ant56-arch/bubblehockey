const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127';
(async () => {
  const b = await launch(), fails = [], errs = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const mk = async (w = 390) => { const p = await (await b.newContext({ viewport: { width: w, height: 800 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(BASE + '/#/resources'); await p.waitForTimeout(800); return p; };
  let p = await mk();
  ok('Resources is not in the top nav', !(await p.$$eval('#nav a', a => a.some(x => /Resources/.test(x.textContent)))));
  // vs computer: always shoot Left, always dive Left => human never scores while computer random; just play to the end
  await p.click('[data-res=shootout]'); await p.click('[data-sg=start][data-mode=bot]'); await p.fill('#sg-n0', 'Connor'); await p.click('[data-sg=go]');
  let shots = 0, sawShooter = false, sawGoalie = false;
  for (let i = 0; i < 80; i++) {
    if (await p.$('.sg-end')) break;
    if (await p.$('[data-sg=pick]')) { const t = await p.textContent('.sg-say'); if (/where do you shoot/.test(t)) sawShooter = true; if (/which way do you dive/.test(t)) sawGoalie = true; await p.click('[data-sg=pick][data-dir=L]'); await p.waitForTimeout(60); }
    else if (await p.$('[data-sg=next]')) { shots++; await p.click('#sg-cv'); await p.waitForSelector('[data-sg=next]', { state: 'visible' }); await p.click('[data-sg=next]'); }
  }
  ok('bot game reaches a result screen', !!(await p.$('.sg-end')), `${shots} shots`);
  ok('human both shot and dived in the bot game', sawShooter && sawGoalie);
  ok('shots are at least 5 each unless decided early (>=6 total)', shots >= 6, String(shots));
  const rec = await p.evaluate(() => localStorage.getItem('bhl_shootout')); ok('record vs computer saved', /"w":|"l":/.test(rec), rec);
  // rules via forced randomness: computer always picks L, human shoots R and dives R => human scores every shot? human shoots R vs goalie L = goal; computer shoots L vs dive R = goal. tie -> sudden death forever; instead dive L: saves
  p = await mk(); await p.evaluate(() => { Math.random = () => 0; });   // computer always picks Left
  await p.click('[data-res=shootout]'); await p.click('[data-sg=start][data-mode=bot]'); await p.click('[data-sg=go]');
  for (let i = 0; i < 40 && !(await p.$('.sg-end')); i++) {
    if (await p.$('[data-sg=pick]')) { const shoot = /where do you shoot/.test(await p.textContent('.sg-say')); await p.click(`[data-sg=pick][data-dir=${shoot ? 'R' : 'L'}]`); }
    else if (await p.$('[data-sg=next]')) { await p.click('#sg-cv'); await p.waitForSelector('[data-sg=next]', { state: 'visible' }); await p.click('[data-sg=next]'); }
  }
  ok('shoot away from a Left goalie and always dive Left = human wins 3-0 (decided early)', /You win/.test(await p.textContent('.sg-end h2')) && (await p.textContent('.sg-board')).includes('3'), await p.textContent('.sg-board'));
  // two players hot-seat
  p = await mk(); await p.click('[data-res=shootout]'); await p.click('[data-sg=start][data-mode=two]'); await p.fill('#sg-n0', 'Ann'); await p.fill('#sg-n1', 'Bob'); await p.click('[data-sg=go]');
  ok('2P: shooter asked first', /Ann.*where do you shoot/.test(await p.textContent('.sg-say')));
  await p.click('[data-sg=pick][data-dir=M]');
  ok('2P: pass screen hides the pick', /Pass the device to Bob/.test(await p.textContent('.sg-say')) && !(await p.textContent('.sg-ctl')).includes('Middle'));
  await p.click('[data-sg=ready]'); ok('2P: goalie dives', /Bob.*dive/.test(await p.textContent('.sg-say')));
  await p.click('[data-sg=pick][data-dir=M]'); await p.click('#sg-cv'); await p.waitForSelector('[data-sg=next]', { state: 'visible' }); ok('2P: same pick is a save', /SAVED/.test(await p.textContent('.sg-say')));
  await p.click('[data-sg=next]'); ok('2P: Bob shoots next', /Bob.*where do you shoot/.test(await p.textContent('.sg-say')));
  await p.click('[data-sg=pick][data-dir=L]'); await p.click('[data-sg=ready]'); await p.click('[data-sg=pick][data-dir=R]'); await p.click('#sg-cv'); await p.waitForSelector('[data-sg=next]', { state: 'visible' }); ok('2P: different pick is a goal', /GOAL/.test(await p.textContent('.sg-say')));
  ok('no sideways scroll on a phone', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  // tied after 5 -> sudden death: all saves
  p = await mk(); await p.click('[data-res=shootout]'); await p.click('[data-sg=start][data-mode=two]'); await p.click('[data-sg=go]');
  for (let i = 0; i < 12; i++) { await p.click('[data-sg=pick][data-dir=L]'); await p.click('[data-sg=ready]'); await p.click('[data-sg=pick][data-dir=L]'); await p.click('#sg-cv'); await p.waitForSelector('[data-sg=next]', { state: 'visible' }); await p.click('[data-sg=next]'); }
  ok('all saves keeps going into sudden death (no winner after 12 shots)', !(await p.$('.sg-end')) && /sudden death/i.test(await p.textContent('.sg-meta')), await p.textContent('.sg-meta'));
  // sudden death resolves: Player1 scores (R vs L), Player2 saved
  await p.click('[data-sg=pick][data-dir=R]'); await p.click('[data-sg=ready]'); await p.click('[data-sg=pick][data-dir=L]'); await p.click('#sg-cv'); await p.waitForSelector('[data-sg=next]', { state: 'visible' }); await p.click('[data-sg=next]');
  ok('sudden death: the second shooter still gets a turn', !(await p.$('.sg-end')) && /sudden death/i.test(await p.textContent('.sg-meta')));
  await p.click('[data-sg=pick][data-dir=L]'); await p.click('[data-sg=ready]'); await p.click('[data-sg=pick][data-dir=L]'); await p.click('#sg-cv'); await p.waitForSelector('[data-sg=next]', { state: 'visible' }); await p.click('[data-sg=next]');
  ok('sudden death ends once one side leads after a full pair', !!(await p.$('.sg-end')) && /Trotta wins/.test(await p.textContent('.sg-end h2')), await p.textContent('.sg-end h2'));
  console.log('page errors:', errs); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
