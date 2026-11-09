const { launch } = require('./support');
const BASE = process.env.BASE_URL || 'http://localhost:8127';
(async () => {
  const b = await launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] }), fails = [], errs = [];
  const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails.push(n); };
  const mk = async () => { const p = await (await b.newContext({ viewport: { width: 400, height: 900 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); await p.addInitScript(() => { window.BHL_PEER = { host: '127.0.0.1', port: 9000, path: '/', secure: false }; }); await p.goto(BASE + '/#/resources'); await p.waitForTimeout(800); return p; };
  const A = await mk(), B = await mk();
  ok('Mini games is not in the top menu', !(await A.$$eval('#nav a', a => a.some(x => /Resources/.test(x.textContent)))));
  ok('small Mini games link at the bottom of the page', await A.isVisible('footer a.tiny'));
  await A.click('[data-res=shootout]'); await A.click('[data-sg=start][data-mode=online]'); await A.fill('#sg-n0', 'Ann'); await A.click('[data-sg=create]');
  await A.waitForSelector('.sg-code', { timeout: 15000 }); const code = (await A.textContent('.sg-code')).trim(); ok('host gets a 5-character invite code', /^[A-Z2-9]{5}$/.test(code), code);
  await B.click('[data-res=shootout]'); await B.click('[data-sg=start][data-mode=online]'); await B.fill('#sg-n0', 'Bob'); await B.fill('#sg-code', code.toLowerCase()); await B.click('[data-sg=joingame]');
  await A.waitForSelector('#sg-cv', { timeout: 20000 }); await B.waitForSelector('#sg-cv', { timeout: 20000 });
  ok('both computers reach the rink', true);
  ok('names shared', (await A.textContent('.sg-board')).includes('Bob') && (await B.textContent('.sg-board')).includes('Ann'));
  // shot 1: Ann (host) shoots, Bob dives
  ok('host is asked to shoot, guest to dive', /where do you shoot/.test(await A.textContent('.sg-say')) && /which way do you dive/.test(await B.textContent('.sg-say')));
  await A.click('[data-sg=pick][data-dir=L]'); await A.waitForSelector('.sg-say'); ok('host sees a waiting message after picking', /Waiting for/.test(await A.textContent('.sg-say')));
  ok('guest has not been told the pick', !/shot left|shoot left/i.test(await B.textContent('.sg-ctl')));
  await B.click('[data-sg=pick][data-dir=R]');   // different = goal
  await A.waitForSelector('.sg-after', { state: 'attached', timeout: 8000 }); await B.waitForSelector('.sg-after', { state: 'attached', timeout: 8000 });
  await A.click('#sg-cv'); await B.click('#sg-cv'); await A.waitForSelector('.sg-after', { state: 'visible' }); await B.waitForSelector('.sg-after', { state: 'visible' });
  ok('both see GOAL', /GOAL/.test(await A.textContent('.sg-say')) && /GOAL/.test(await B.textContent('.sg-say')));
  ok('both boards say Ann 1', /Ann.*1/.test(await A.textContent('.sg-board')) && /Ann.*1/.test(await B.textContent('.sg-board')));
  // next shot starts by itself, roles swap
  await A.waitForFunction(() => /which way do you dive/.test((document.querySelector('.sg-say') || {}).textContent || ''), null, { timeout: 8000 }); await B.waitForFunction(() => /where do you shoot/.test((document.querySelector('.sg-say') || {}).textContent || ''), null, { timeout: 8000 });
  ok('next shot starts on both screens with roles swapped', true);
  // play the rest with all saves (both pick L) until sudden death, then finish
  let rounds = 0;
  for (let i = 0; i < 30 && !(await A.$('.sg-end')); i++) {
    await A.waitForSelector('[data-sg=pick]', { timeout: 8000 }).catch(() => { }); await B.waitForSelector('[data-sg=pick]', { timeout: 8000 }).catch(() => { });
    if (await A.$('.sg-end')) break;
    // Ann always shoots M when shooting; Bob dives M => save. When Bob shoots L and Ann dives R => goal for Bob
    const aShoots = /where do you shoot/.test(await A.textContent('.sg-say'));
    await A.click(`[data-sg=pick][data-dir=${aShoots ? 'M' : 'R'}]`); await B.click(`[data-sg=pick][data-dir=${aShoots ? 'M' : 'L'}]`);
    await A.click('#sg-cv').catch(() => { }); await B.click('#sg-cv').catch(() => { }); rounds++;
    await A.waitForFunction(() => document.querySelector('.sg-end') || document.querySelector('[data-sg=pick]'), null, { timeout: 12000 }).catch(() => { });
  }
  await A.waitForSelector('.sg-end', { timeout: 10000 }); await B.waitForSelector('.sg-end', { timeout: 10000 });
  ok('game ends on both computers with the same winner', (await A.textContent('.sg-end h2')).includes('Bob') && /You win/.test(await B.textContent('.sg-end h2')), `${await A.textContent('.sg-end h2')} | ${await B.textContent('.sg-end h2')} after ${rounds + 1} shots`);
  // rematch
  await B.click('[data-sg=again]'); await A.waitForSelector('#sg-cv', { timeout: 8000 }); await B.waitForSelector('#sg-cv', { timeout: 8000 }); ok('guest can ask for a rematch and both restart', /0/.test(await A.textContent('.sg-board')));
  // opponent leaves
  await B.goto(BASE + '/#/home'); await A.waitForSelector('text=Your opponent left', { timeout: 8000 }); ok('host is told when the guest leaves', true);
  // bad code
  const C = await mk(); await C.click('[data-res=shootout]'); await C.click('[data-sg=start][data-mode=online]'); await C.fill('#sg-code', 'ZZZZZ'); await C.click('[data-sg=joingame]'); await C.waitForSelector('.form-note.err:not(:empty)', { timeout: 15000 }); ok('wrong code gives a clear message', /No game found/.test(await C.textContent('.form-note.err')), await C.textContent('.form-note.err'));
  // invite link prefill
  const D = await mk(); await D.goto(BASE + '/#/resources?join=ABCDE'); await D.waitForTimeout(600); await D.reload(); await D.waitForTimeout(900); ok('invite link opens the join screen with the code filled in', (await D.inputValue('#sg-code').catch(() => '')) === 'ABCDE');
  console.log('page errors:', errs); console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL PASSED'); await b.close();
})();
