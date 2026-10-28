/* Commissioner-only data entry. Saves straight to the repo (data/*.csv) through the GitHub API,
   using a fine-grained token that is kept only in this browser. Nobody without the token can change anything. */
PAGES.push(['enter', 'Enter']);

const tokenStore = {
  get() { try { return localStorage.getItem('bhl_token') || ''; } catch { return ''; } },
  set(v) { try { v ? localStorage.setItem('bhl_token', v) : localStorage.removeItem('bhl_token'); } catch { } },
};
const b64enc = s => { let bin = ''; new TextEncoder().encode(s).forEach(x => bin += String.fromCharCode(x)); return btoa(bin); };
const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)));
const csvLine = vals => vals.map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v)).join(',');

async function gh(path, opts = {}) {
  const repo = D.config.repo || 'ant56-arch/bubblehockey';
  const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}${opts.method === 'PUT' ? '' : '?ref=' + (D.config.branch || 'main')}`, {
    ...opts, cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + tokenStore.get(), ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (r.status === 401 || r.status === 403 || r.status === 404) throw new Error('GitHub rejected the token. It needs "Contents: Read and write" access to this repository. Sign out and paste a new one.');
  if (!r.ok && r.status !== 409 && r.status !== 422) throw new Error('GitHub error ' + r.status);
  return r;
}
/* Read a file, let `transform` change its text, save it. Retries if someone else saved in between. */
async function updateFile(path, transform, message) {
  for (let i = 0; i < 3; i++) {
    const cur = await (await gh(path)).json();
    const next = transform(b64dec(cur.content));
    const r = await gh(path, {
      method: 'PUT', body: JSON.stringify({ message, content: b64enc(next), sha: cur.sha, branch: D.config.branch || 'main' }),
    });
    if (r.ok) return next;
  }
  throw new Error('The file changed while saving. Please try again.');
}

/* Shrink a chosen picture to a 400px square (kept whole, transparent padding) and save it under images/teams/. */
async function uploadLogo(file, slug) {
  const bmp = await createImageBitmap(file), size = 400, c = document.createElement('canvas');
  c.width = c.height = size;
  const k = Math.min(size / bmp.width, size / bmp.height), w = bmp.width * k, h = bmp.height * k;
  c.getContext('2d').drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h);
  const blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.85));
  const ext = blob.type === 'image/webp' ? 'webp' : 'png';
  const bin = new Uint8Array(await blob.arrayBuffer()); let str = ''; bin.forEach(x => str += String.fromCharCode(x));
  const path = `images/teams/${slug}.${ext}`;
  const r = await gh(path, { method: 'PUT', body: JSON.stringify({ message: 'Add logo ' + slug, content: btoa(str), branch: D.config.branch || 'main' }) });
  if (!r.ok) throw new Error('Could not save the logo image.');
  return path;
}

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const players = () => D.members.map(m => m.short_name);
const opts = (list, sel) => list.map(v => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
const note = (id, msg, ok) => { const el = document.getElementById(id); if (el) { el.className = 'form-note ' + (ok ? 'ok' : 'err'); el.textContent = msg; } };

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

view.enter = function () {
  if (!tokenStore.get()) {
    return `<h1>Enter</h1><p class="lead">Commissioner tools. Sign in once on this device to add games and playoff results.</p>
      <div class="card"><ol class="steps">
        <li>On GitHub open <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token</b>.</li>
        <li>Repository access: <b>Only select repositories</b> → ${esc(D.config.repo || 'ant56-arch/bubblehockey')}.</li>
        <li>Permissions → Repository permissions → <b>Contents: Read and write</b>. Pick a long expiry.</li>
        <li>Copy the token and paste it here. It stays on this device only and is never saved to the website.</li></ol>
        <form id="token-form" class="form"><label class="f">Token<input id="token" type="password" autocomplete="off" placeholder="github_pat_…" required></label>
        <button class="btn" type="submit">Sign in</button></form></div>`;
  }
  if (!PO.month) loadPlayoffDraft(cur());
  const recent = [...D.games].sort(cmpNew).slice(0, 5);
  return `<h1>Enter</h1><p class="lead">Saved straight to the site's data. Changes show up on the live site in about a minute. <button class="link" id="sign-out" type="button">Sign out</button></p>
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
    <h2>Latest entries</h2>${gamesTable(recent)}
    ${recent.length ? '<button class="btn ghost" id="undo-game" type="button">Delete the last game in the file</button><p id="undo-note" class="form-note"></p>' : ''}
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
      <button class="btn" type="submit">Save month</button><p id="month-note" class="form-note"></p></form></div>`;
};

const rerender = () => { if ((location.hash || '').includes('enter')) route(); };

document.addEventListener('submit', async e => {
  const id = e.target.id; if (!['token-form', 'game-form', 'po-form', 'month-form', 'member-form'].includes(id)) return;
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
  try {
    if (id === 'token-form') { tokenStore.set(document.getElementById('token').value.trim()); route(); return; }
    if (id === 'game-form') {
      const v = k => document.getElementById('g-' + k).value;
      const g = { date: v('date'), home: v('home'), road: v('road'), hg: +v('hg'), rg: +v('rg'), hs: v('hs') || 0, rs: v('rs') || 0, ot: document.getElementById('g-ot').checked };
      if (g.home === g.road) throw new Error('Pick two different players.');
      if (g.hg === g.rg) throw new Error('Games cannot end tied. Enter the final score, including the overtime goal.');
      if (g.ot && Math.abs(g.hg - g.rg) !== 1 && !confirm('That is not a one-goal game. Mark it overtime anyway?')) throw new Error('Not saved.');
      let newId = 0;
      await updateFile('data/games.csv', text => {
        const month = g.date.slice(0, 7);
        newId = Math.max(0, ...parseCSV(text).filter(r => (r.date || '').slice(0, 7) === month).map(r => +r.game_id || 0)) + 1;
        return text.replace(/\n*$/, '\n') + csvLine([newId, g.date, g.home, g.road, g.hg, g.rg, g.hs, g.rs, g.ot ? 'yes' : 'no']) + '\n';
      }, `Add game: ${g.home} ${g.hg}-${g.rg} ${g.road}`);
      D.games.push({ id: newId, date: g.date, home: g.home, road: g.road, hg: g.hg, rg: g.rg, hs: +g.hs, rs: +g.rs, ot: g.ot, month: g.date.slice(0, 7) });
      const keep = { date: g.date, home: g.home, road: g.road };
      rerender();
      document.getElementById('g-date').value = keep.date; document.getElementById('g-home').value = keep.home; document.getElementById('g-road').value = keep.road;
      note('game-note', `Saved: ${g.home} ${g.hg} – ${g.rg} ${g.road}. The live site updates in about a minute.`, true);
      return;
    }
    if (id === 'po-form') {
      const { G } = bracketModel(PO.seeds, Object.fromEntries(Object.entries(PO.g).map(([n, w]) => ['g' + n, w])));
      if (PO.seeds.some(s => !s) || new Set(PO.seeds).size < 4) throw new Error('Pick four different players for the seeds.');
      const row = [PO.month, ...PO.seeds, ...[1, 2, 3, 4, 5, 6, 7].map(n => G[n].skipped ? '' : G[n].w)];
      await updateFile('data/playoffs.csv', text => {
        const lines = text.split('\n').filter(l => l.trim());
        const kept = lines.filter((l, i) => i === 0 || !l.startsWith(PO.month + ','));
        return kept.concat(csvLine(row)).join('\n') + '\n';
      }, `Update ${PO.month} playoff results`);
      const rec = Object.fromEntries(['month', 'seed1', 'seed2', 'seed3', 'seed4', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'].map((k, i) => [k, row[i]]));
      D.playoffs = D.playoffs.filter(p => p.month !== PO.month).concat(rec);
      note('po-note', 'Saved. The live site updates in about a minute.', true);
      return;
    }
    if (id === 'member-form') {
      const v = k => document.getElementById('mb-' + k).value.trim();
      const old = D.members.find(m => m.short_name === document.getElementById('mb-pick').value);
      const m = { name: v('name'), short_name: old ? old.short_name : v('short'), team_name: v('team'), established: v('est'), logo: old?.logo || '', alt_logo: old?.alt_logo || '' };
      if (!old && D.members.some(x => x.short_name.toLowerCase() === m.short_name.toLowerCase())) throw new Error('Someone already uses that short name.');
      const slug = m.short_name.toLowerCase().replace(/[^a-z0-9]+/g, '') + '-' + Date.now().toString(36);
      const lf = document.getElementById('mb-logo').files[0], af = document.getElementById('mb-alt').files[0];
      if (lf) m.logo = await uploadLogo(lf, slug);
      if (af) m.alt_logo = await uploadLogo(af, slug + '-alt');
      const cols = ['name', 'short_name', 'team_name', 'established', 'logo', 'alt_logo'];
      await updateFile('data/members.csv', text => {
        const rows = parseCSV(text); const i = rows.findIndex(r => r.short_name === m.short_name);
        i >= 0 ? rows[i] = m : rows.push(m);
        return csvLine(cols) + '\n' + rows.map(r => csvLine(cols.map(c => r[c] ?? ''))).join('\n') + '\n';
      }, `${old ? 'Update' : 'Add'} member ${m.short_name}`);
      const i = D.members.findIndex(x => x.short_name === m.short_name); i >= 0 ? D.members[i] = m : D.members.push(m);
      rerender(); note('member-note', `${old ? 'Updated' : 'Added'} ${m.name}. ${old ? '' : 'They now appear in the game and playoff forms. '}The live site updates in about a minute.`, true);
      return;
    }
    if (id === 'month-form') {
      const m = document.getElementById('m-month').value;
      await updateFile('data/config.json', text => JSON.stringify({ ...JSON.parse(text), currentMonth: m }, null, 2) + '\n', `Set current month to ${m}`);
      D.config.currentMonth = m; PO.month = '';
      note('month-note', `Saved. The site now treats ${monthLabel(m)} as the current month.`, true);
    }
  } catch (err) {
    note({ 'game-form': 'game-note', 'po-form': 'po-note', 'month-form': 'month-note', 'member-form': 'member-note' }[id] || 'game-note', err.message, false);
  } finally { btn.disabled = false; }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'mb-pick') {
    const m = D.members.find(x => x.short_name === t.value) || { name: '', short_name: '', team_name: '', established: today() };
    document.getElementById('mb-name').value = m.name; document.getElementById('mb-short').value = m.short_name;
    document.getElementById('mb-short').disabled = !!t.value; document.getElementById('mb-team').value = m.team_name; document.getElementById('mb-est').value = m.established;
    return;
  }
  if (t.id === 'po-month') { loadPlayoffDraft(t.value); }
  else if (t.dataset.seed !== undefined) PO.seeds[+t.dataset.seed] = t.value;
  else if (t.dataset.g !== undefined) PO.g[+t.dataset.g] = t.value;
  else return;
  document.getElementById('po-wrap').innerHTML = playoffCard();
});

document.addEventListener('click', async e => {
  if (e.target.id === 'sign-out') { tokenStore.set(''); route(); }
  if (e.target.id === 'undo-game') {
    const last = D.games.length ? [...D.games].sort(cmpNew)[0] : null;
    if (!last || !confirm(`Delete the last line of games.csv?\n(Latest by date shown: ${last.home} ${last.hg}-${last.rg} ${last.road})`)) return;
    try {
      let removed = '';
      await updateFile('data/games.csv', text => { const l = text.replace(/\n+$/, '').split('\n'); removed = l.pop(); return l.join('\n') + '\n'; }, 'Remove last game entry');
      D.games = D.games.filter(g => csvLine([g.id, g.date, g.home, g.road, g.hg, g.rg, g.hs, g.rs, g.ot ? 'yes' : 'no']) !== removed);
      rerender(); note('undo-note', 'Removed: ' + removed, true);
    } catch (err) { note('undo-note', err.message, false); }
  }
});
