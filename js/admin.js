/* Admin panel: username + password sign-in (Firebase Authentication) and saving to Firestore.
   Visitors can read the league data; only the accounts listed in the Firestore rules can change it. */
PAGES.push(['admin', 'Admin']);

const AUTH_URL = 'https://identitytoolkit.googleapis.com/v1/accounts';
const emailFor = u => u.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') + '@league.local';
const sess = {
  get() { try { return JSON.parse(sessionStorage.getItem('bhl_admin') || localStorage.getItem('bhl_admin') || 'null'); } catch { return null; } },
  set(v, keep) { try { sessionStorage.removeItem('bhl_admin'); localStorage.removeItem('bhl_admin'); if (v) (keep ? localStorage : sessionStorage).setItem('bhl_admin', JSON.stringify(v)); } catch { } },
};
let TOKEN = { id: '', exp: 0 };

const AUTH_ERRORS = {
  INVALID_LOGIN_CREDENTIALS: 'Incorrect username or password.', EMAIL_NOT_FOUND: 'Incorrect username or password.', INVALID_PASSWORD: 'Incorrect username or password.',
  INVALID_EMAIL: 'Incorrect username or password.', USER_DISABLED: 'This account has been disabled.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many tries. Wait a few minutes and try again.', WEAK_PASSWORD: 'Use at least 8 characters.',
  CREDENTIAL_TOO_OLD_LOGIN_AGAIN: 'For safety, sign out and sign in again before changing the password.',
};
async function authCall(path, body) {
  const r = await fetch(`${AUTH_URL}:${path}?key=${D.fb.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const code = (j.error?.message || '').split(' ')[0]; throw new Error(AUTH_ERRORS[code] || 'Sign-in failed (' + (code || r.status) + ').'); }
  return j;
}
function takeTokens(j, username, keep) {
  TOKEN = { id: j.idToken, exp: Date.now() + (+j.expiresIn || 3600) * 1000 };
  sess.set({ refreshToken: j.refreshToken, username }, keep);
}
async function idToken() {
  if (TOKEN.id && Date.now() < TOKEN.exp - 60000) return TOKEN.id;
  const s = sess.get(); if (!s) throw new Error('Please sign in again.');
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${D.fb.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(s.refreshToken)}` });
  if (!r.ok) { sess.set(null); TOKEN = { id: '', exp: 0 }; rerender(); throw new Error('Your session ended. Please sign in again.'); }
  const j = await r.json(); TOKEN = { id: j.id_token, exp: Date.now() + (+j.expires_in || 3600) * 1000 };
  sess.set({ refreshToken: j.refresh_token || s.refreshToken, username: s.username }, !!localStorage.getItem('bhl_admin'));
  return TOKEN.id;
}

/* Firestore: one document = one JSON string in the field "json". */
const docUrl = p => `${FS(D.fb)}/${p}`;
function fsErr(r) { return new Error(r.status === 401 || r.status === 403 ? 'Not allowed. This account is not on the admin list in the Firestore rules.' : 'Save failed (' + r.status + ').'); }
async function fsRead(p) {
  const r = await fetch(`${docUrl(p)}?key=${D.fb.apiKey}`, { cache: 'no-store', headers: { Authorization: 'Bearer ' + await idToken() } });
  if (r.status === 404) return { value: null, updateTime: null };
  if (!r.ok) throw fsErr(r);
  const j = await r.json(); return { value: JSON.parse(j.fields?.json?.stringValue || 'null'), updateTime: j.updateTime };
}
async function fsWrite(p, value, updateTime) {
  const q = new URLSearchParams({ 'updateMask.fieldPaths': 'json', key: D.fb.apiKey });
  updateTime ? q.set('currentDocument.updateTime', updateTime) : q.set('currentDocument.exists', 'false');
  return fetch(`${docUrl(p)}?${q}`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + await idToken(), 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { json: { stringValue: JSON.stringify(value) } } }) });
}
/* Read, change, save. Retries if someone else saved in between. */
async function fsUpdate(p, fn) {
  for (let i = 0; i < 3; i++) {
    const { value, updateTime } = await fsRead(p), next = fn(value), r = await fsWrite(p, next, updateTime);
    if (r.ok) return next;
    if (r.status !== 400 && r.status !== 409 && r.status !== 412) throw fsErr(r);
  }
  throw new Error('Someone else saved at the same moment. Please try again.');
}

/* Shrink a chosen picture to 256px (kept whole) and keep it inside the member record as a small image. */
async function logoData(file) {
  const bmp = await createImageBitmap(file), size = 256, c = document.createElement('canvas');
  c.width = c.height = size;
  const k = Math.min(size / bmp.width, size / bmp.height), w = bmp.width * k, h = bmp.height * k;
  c.getContext('2d').drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h);
  return c.toDataURL('image/webp', 0.82);
}

const csvRows = async f => { try { const r = await fetch('data/' + f, { cache: 'no-cache' }); return r.ok ? parseCSV(await r.text()) : []; } catch { return []; } };
async function importFromFiles() {
  const [cfg, members, games, playoffs] = await Promise.all([fetch('data/config.json', { cache: 'no-cache' }).then(r => r.json()), csvRows('members.csv'), csvRows('games.csv'), csvRows('playoffs.csv')]);
  const byMonth = {}; games.forEach(g => (byMonth[g.date.slice(0, 7)] ??= []).push(g));
  const put = async (p, v) => { const r = await fsWrite(p, v, null); if (!r.ok && r.status !== 409 && r.status !== 400) throw fsErr(r); if (!r.ok) await fsUpdate(p, () => v); };
  await put('league/config', cfg); await put('league/members', members); await put('league/playoffs', playoffs);
  for (const [m, rows] of Object.entries(byMonth)) await put('games/' + m, rows);
}

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const players = () => D.members.map(m => m.short_name);
const opts = (list, sel) => list.map(v => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
const note = (id, msg, ok) => { const el = document.getElementById(id); if (el) { el.className = 'form-note ' + (ok ? 'ok' : 'err'); el.textContent = msg; } };
const rerender = () => { if ((location.hash || '').includes('admin')) route(true); };

const PO = { month: '', seeds: ['', '', '', ''], g: {} };
function loadPlayoffDraft(month) {
  const row = D.playoffs.find(p => p.month === month);
  PO.month = month;
  PO.seeds = row ? [row.seed1, row.seed2, row.seed3, row.seed4] : [0, 1, 2, 3].map(i => standingsFor(monthGames(month)).filter(r => r.gp).map(r => r.name)[i] || '');
  PO.g = row ? Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(n => [n, row['g' + n] || ''])) : {};
}
function playoffCard() {
  const months = [...new Set([cur(), ...D.games.map(g => g.month), ...D.playoffs.map(p => p.month)])].filter(Boolean).sort().reverse();
  const { G, champion } = bracketModel(PO.seeds, Object.fromEntries(Object.entries(PO.g).map(([n, w]) => ['g' + n, w])));
  const rows = [1, 2, 3, 4, 5, 6, 7].map(n => {
    const g = G[n];
    if (g.skipped) return `<label class="f">Game 7 <span class="muted">not needed</span></label>`;
    if (!g.a || !g.b) return `<label class="f">Game ${n}<select disabled><option>Waiting on earlier games</option></select></label>`;
    return `<label class="f">Game ${n}: winner<select data-g="${n}"><option value="">Not played yet</option>${opts([g.a, g.b], g.w)}</select></label>`;
  }).join('');
  return `<h2>Playoff results</h2><div class="card"><form id="po-form" class="form">
    <label class="f">Month<select id="po-month">${months.map(m => `<option value="${m}" ${m === PO.month ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select></label>
    <div class="row4">${[0, 1, 2, 3].map(i => `<label class="f">Seed ${i + 1}<select data-seed="${i}"><option value=""></option>${opts(players(), PO.seeds[i])}</select></label>`).join('')}</div>
    ${rows}${champion ? `<p class="champ">🏆 Champion: <b>${esc(champion)}</b></p>` : ''}
    <button class="btn" type="submit">Save playoff results</button><p id="po-note" class="form-note"></p></form></div>`;
}

view.admin = function () {
  if (!D.fb) return `<h1>Admin</h1><p class="lead">The admin login isn't connected yet. See the README (“Admin login setup”) for the one-time steps.</p>`;
  const s = sess.get();
  if (!s) return `<h1>Admin</h1><p class="lead">Sign in to add games, members and playoff results.</p>
    <div class="card"><form id="login-form" class="form">
      <label class="f">Username<input id="u" autocomplete="username" autocapitalize="none" required></label>
      <label class="f">Password<input id="pw" type="password" autocomplete="current-password" required></label>
      <label class="check"><input id="keep" type="checkbox"> Keep me signed in on this device</label>
      <button class="btn" type="submit">Sign in</button><p id="login-note" class="form-note"></p></form></div>`;
  if (D.source !== 'firestore') return `<h1>Admin</h1><div class="sess"><p class="lead" style="margin:0">Signed in as <b>${esc(s.username)}</b>.</p><button class="link" id="sign-out" type="button">Sign out</button></div>
    <h2>One more step</h2><div class="card"><p>Your league data is still in the website's files. Move it into the admin database once. After this, everything you enter here is what the site shows.</p>
    <button class="btn" id="import" type="button">Move my data in</button><p id="import-note" class="form-note"></p></div>`;
  if (!PO.month) loadPlayoffDraft(cur());
  const recent = [...D.games].sort(cmpNew).slice(0, 8);
  return `<h1>Admin</h1><div class="sess"><p class="lead" style="margin:0">Signed in as <b>${esc(s.username)}</b>. Changes show on the site right away.</p><button class="link" id="sign-out" type="button">Sign out</button></div>
    <h2>Add a game</h2><div class="card"><form id="game-form" class="form">
      <label class="f">Date<input id="g-date" type="date" value="${today()}" required></label>
      <div class="row2"><label class="f">Home player<select id="g-home" required><option value=""></option>${opts(players())}</select></label>
      <label class="f">Road player<select id="g-road" required><option value=""></option>${opts(players())}</select></label></div>
      <div class="row2"><label class="f">Home goals<input id="g-hg" type="number" inputmode="numeric" min="0" max="99" required></label>
      <label class="f">Road goals<input id="g-rg" type="number" inputmode="numeric" min="0" max="99" required></label></div>
      <div class="row2"><label class="f">Home shots<input id="g-hs" type="number" inputmode="numeric" min="0" max="999"></label>
      <label class="f">Road shots<input id="g-rs" type="number" inputmode="numeric" min="0" max="999"></label></div>
      <label class="check"><input id="g-ot" type="checkbox"> Decided in overtime</label>
      <button class="btn" type="submit">Save game</button><p id="game-note" class="form-note"></p></form></div>
    <h2>Latest games</h2><div class="glist">${recent.length ? recent.map(g => `<div class="grow"><span>${dateLabel(g.date)} · ${esc(g.home)} ${g.hg}–${g.rg} ${esc(g.road)}${g.ot ? ' (OT)' : ''}</span><button class="btn ghost" type="button" data-del="${g.month}|${g.id}" style="margin:0">Delete</button></div>`).join('') : '<p class="muted">No games yet.</p>'}</div><p id="del-note" class="form-note"></p>
    <h2>Members &amp; teams</h2><div class="card"><form id="member-form" class="form">
      <label class="f">Member<select id="mb-pick"><option value="">Add a new member</option>${D.members.map(m => `<option value="${esc(m.short_name)}">${esc(m.name)}</option>`).join('')}</select></label>
      <label class="f">Full name<input id="mb-name" required autocomplete="off"></label>
      <label class="f">Short name <span class="muted">(how they appear in the game log and standings)</span><input id="mb-short" required autocomplete="off"></label>
      <label class="f">Team name<input id="mb-team" required autocomplete="off"></label>
      <label class="f">Established<input id="mb-est" type="date" value="${today()}"></label>
      <label class="f">Team logo <span class="muted">(optional)</span><input id="mb-logo" type="file" accept="image/*"></label>
      <label class="f">Alternate logo <span class="muted">(optional)</span><input id="mb-alt" type="file" accept="image/*"></label>
      <button class="btn" type="submit">Save member</button><p id="member-note" class="form-note"></p></form></div>
    <div id="po-wrap">${playoffCard()}</div>
    <h2>Start a new month</h2><div class="card"><form id="month-form" class="form">
      <p class="muted">The Game Log and Standings show this month. The previous month moves into the history tabs.</p>
      <label class="f">Current month<input id="m-month" type="month" value="${esc(cur())}" required></label>
      <button class="btn" type="submit">Save month</button><p id="month-note" class="form-note"></p></form></div>
    <h2>Change my password</h2><div class="card"><form id="pw-form" class="form">
      <label class="f">New password<input id="npw1" type="password" autocomplete="new-password" minlength="8" required></label>
      <label class="f">Repeat new password<input id="npw2" type="password" autocomplete="new-password" minlength="8" required></label>
      <button class="btn" type="submit">Change password</button><p id="pw-note" class="form-note"></p></form></div>`;
};

const FORMS = { 'login-form': 'login-note', 'game-form': 'game-note', 'member-form': 'member-note', 'po-form': 'po-note', 'month-form': 'month-note', 'pw-form': 'pw-note' };
document.addEventListener('submit', async e => {
  const id = e.target.id; if (!FORMS[id]) return;
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
  try {
    if (id === 'login-form') {
      const u = document.getElementById('u').value.trim();
      const j = await authCall('signInWithPassword', { email: emailFor(u), password: document.getElementById('pw').value, returnSecureToken: true });
      takeTokens(j, u, document.getElementById('keep').checked); route(); return;
    }
    if (id === 'game-form') {
      const v = k => document.getElementById('g-' + k).value;
      const g = { date: v('date'), home: v('home'), road: v('road'), hg: +v('hg'), rg: +v('rg'), hs: +v('hs') || 0, rs: +v('rs') || 0, ot: document.getElementById('g-ot').checked };
      if (g.home === g.road) throw new Error('Pick two different players.');
      if (g.hg === g.rg) throw new Error('Games cannot end tied. Enter the final score, including the overtime goal.');
      if (g.ot && Math.abs(g.hg - g.rg) !== 1 && !confirm('That is not a one-goal game. Mark it overtime anyway?')) throw new Error('Not saved.');
      const month = g.date.slice(0, 7); let newId = 0;
      await fsUpdate('games/' + month, list => {
        list = list || []; newId = Math.max(0, ...list.map(r => +r.game_id || 0)) + 1;
        return [...list, { game_id: String(newId), date: g.date, home: g.home, road: g.road, home_goals: String(g.hg), road_goals: String(g.rg), home_shots: String(g.hs), road_shots: String(g.rs), overtime: g.ot ? 'yes' : 'no' }];
      });
      D.games.push({ id: newId, date: g.date, home: g.home, road: g.road, hg: g.hg, rg: g.rg, hs: g.hs, rs: g.rs, ot: g.ot, month });
      const keep = { date: g.date, home: g.home, road: g.road };
      rerender();
      document.getElementById('g-date').value = keep.date; document.getElementById('g-home').value = keep.home; document.getElementById('g-road').value = keep.road;
      note('game-note', `Saved: ${g.home} ${g.hg} – ${g.rg} ${g.road}.`, true); return;
    }
    if (id === 'member-form') {
      const v = k => document.getElementById('mb-' + k).value.trim();
      const old = D.members.find(m => m.short_name === document.getElementById('mb-pick').value);
      const m = { name: v('name'), short_name: old ? old.short_name : v('short'), team_name: v('team'), established: v('est'), logo: old?.logo || '', alt_logo: old?.alt_logo || '' };
      if (!old && D.members.some(x => x.short_name.toLowerCase() === m.short_name.toLowerCase())) throw new Error('Someone already uses that short name.');
      const lf = document.getElementById('mb-logo').files[0], af = document.getElementById('mb-alt').files[0];
      if (lf) m.logo = await logoData(lf);
      if (af) m.alt_logo = await logoData(af);
      await fsUpdate('league/members', list => { list = list || []; const i = list.findIndex(r => r.short_name === m.short_name); i >= 0 ? list[i] = m : list.push(m); return list; });
      const i = D.members.findIndex(x => x.short_name === m.short_name); i >= 0 ? D.members[i] = m : D.members.push(m);
      rerender(); note('member-note', `${old ? 'Updated' : 'Added'} ${m.name}.`, true); return;
    }
    if (id === 'po-form') {
      const { G } = bracketModel(PO.seeds, Object.fromEntries(Object.entries(PO.g).map(([n, w]) => ['g' + n, w])));
      if (PO.seeds.some(s => !s) || new Set(PO.seeds).size < 4) throw new Error('Pick four different players for the seeds.');
      const row = { month: PO.month, seed1: PO.seeds[0], seed2: PO.seeds[1], seed3: PO.seeds[2], seed4: PO.seeds[3] };
      [1, 2, 3, 4, 5, 6, 7].forEach(n => row['g' + n] = G[n].skipped ? '' : G[n].w);
      await fsUpdate('league/playoffs', list => (list || []).filter(r => r.month !== PO.month).concat(row));
      D.playoffs = D.playoffs.filter(p => p.month !== PO.month).concat(row);
      note('po-note', 'Saved.', true); return;
    }
    if (id === 'month-form') {
      const m = document.getElementById('m-month').value;
      await fsUpdate('league/config', c => ({ ...(c || {}), currentMonth: m }));
      D.config.currentMonth = m; PO.month = '';
      note('month-note', `Saved. The site now treats ${monthLabel(m)} as the current month.`, true); return;
    }
    if (id === 'pw-form') {
      const pw = document.getElementById('npw1').value;
      if (pw !== document.getElementById('npw2').value) throw new Error('The two passwords do not match.');
      const j = await authCall('update', { idToken: await idToken(), password: pw, returnSecureToken: true });
      takeTokens(j, sess.get().username, !!localStorage.getItem('bhl_admin'));
      note('pw-note', 'Password changed. Use the new one next time you sign in.', true);
    }
  } catch (err) { note(FORMS[id], err.message, false); } finally { btn.disabled = false; }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'mb-pick') {
    const m = D.members.find(x => x.short_name === t.value) || { name: '', short_name: '', team_name: '', established: today() };
    document.getElementById('mb-name').value = m.name; document.getElementById('mb-short').value = m.short_name;
    document.getElementById('mb-short').disabled = !!t.value; document.getElementById('mb-team').value = m.team_name; document.getElementById('mb-est').value = m.established;
    return;
  }
  if (t.id === 'po-month') loadPlayoffDraft(t.value);
  else if (t.dataset.seed !== undefined) PO.seeds[+t.dataset.seed] = t.value;
  else if (t.dataset.g !== undefined) PO.g[+t.dataset.g] = t.value;
  else return;
  document.getElementById('po-wrap').innerHTML = playoffCard();
});

document.addEventListener('click', async e => {
  const t = e.target;
  if (t.id === 'sign-out') { sess.set(null); TOKEN = { id: '', exp: 0 }; route(); }
  if (t.id === 'import') {
    t.disabled = true;
    try { await importFromFiles(); note('import-note', 'Done. Reloading…', true); setTimeout(() => location.reload(), 600); }
    catch (err) { note('import-note', err.message, false); t.disabled = false; }
  }
  if (t.dataset?.del) {
    const [month, gid] = t.dataset.del.split('|'), g = D.games.find(x => x.month === month && String(x.id) === gid);
    if (!g || !confirm(`Delete ${g.home} ${g.hg}–${g.rg} ${g.road} on ${dateLabel(g.date)}?`)) return;
    try {
      await fsUpdate('games/' + month, list => (list || []).filter(r => String(r.game_id) !== gid));
      D.games = D.games.filter(x => x !== g); rerender();
    } catch (err) { note('del-note', err.message, false); }
  }
});
