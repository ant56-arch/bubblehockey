/* Add / Edit games (#/add).
   Not connected: builds a line of JSON to paste into data/games.json.
   Connected (a GitHub token kept only in this browser): saves straight to data/games.json, with add, edit and delete.
   Edits change just the one line in the file, so the rest of the file is left exactly as it was. */
PAGES.push(['add', 'Add / Edit']);

const tok = {
  get() { try { return localStorage.getItem('bhl_token') || ''; } catch { return ''; } },
  set(v) { try { v ? localStorage.setItem('bhl_token', v) : localStorage.removeItem('bhl_token'); } catch { } },
};
const ADM = { text: '', sha: '', raw: [], loaded: false, loading: false, error: '', layoutError: '', editing: null };

/* ---------- GitHub (data/games.json) ---------- */
async function ghGames(opts = {}) {
  const { owner, repo, branch } = repoInfo();
  let r;
  try { r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/data/games.json${opts.method === 'PUT' ? '' : '?ref=' + branch}`, {
    ...opts, cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + tok.get(), ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  }); } catch { throw new Error('Could not reach GitHub. Check your connection and try again. Nothing was saved.'); }
  if (r.status === 401 || r.status === 403 || r.status === 404) throw new Error('GitHub did not accept the token. Check that it has "Contents: Read and write" for this repository and has not expired, then reconnect.');
  return r;
}
async function readFile() {
  const r = await ghGames(); if (!r.ok) throw new Error('GitHub error ' + r.status);
  const j = await r.json(); return { text: b64dec(j.content), sha: j.sha };
}
function adopt(text, sha) {
  ADM.text = text; ADM.sha = sha; ADM.raw = JSON.parse(text).games || []; ADM.loaded = true; applyGamesText(text);
  try { splitGames(text); ADM.layoutError = ''; } catch (e) { ADM.layoutError = e.message; }      // saving needs one game per line; say so up front
}

/* ---------- editing the file one line at a time ---------- */
function splitGames(text) {
  const lines = text.split('\n'), start = lines.findIndex(l => /^\s*"games"\s*:\s*\[/.test(l));
  if (start < 0) throw new Error('games.json is not laid out the way this page expects. Edit it on GitHub instead.');
  const idx = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\]/.test(lines[i])) break;
    if (/^\s*\{.*\}\s*,?\s*$/.test(lines[i])) idx.push(i);
    else if (lines[i].trim()) throw new Error('games.json has a game that is not on a single line. Edit it on GitHub instead.');
  }
  const raw = JSON.parse(text).games || [];
  if (raw.length !== idx.length) throw new Error('games.json is not one game per line. Edit it on GitHub instead.');
  return { lines, start, idx, raw };
}
const serialize = (o, indent = '    ') => `${indent}{ ${Object.entries(o).map(([k, v]) => `"${k}": ${JSON.stringify(v)}`).join(', ')} }`;

/* kind: 'add' | 'edit' | 'delete'. For edit and delete, `i` is the game's position and `seen` is the game as the page showed it. */
async function saveChange(kind, i, obj, seen, message) {
  const { branch } = repoInfo();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { text, sha } = await readFile();
    const { lines, start, idx, raw } = splitGames(text), before = raw.length;
    if (kind !== 'add' && JSON.stringify(raw[i]) !== JSON.stringify(seen)) { adopt(text, sha); throw new Error('That game changed since you opened it. The list has been refreshed; please try again.'); }
    if (kind === 'add') {
      if (idx.length) { const last = idx[idx.length - 1]; if (!/,\s*$/.test(lines[last])) lines[last] += ','; lines.splice(last + 1, 0, serialize(obj, lines[last].match(/^\s*/)[0])); }
      else lines.splice(start + 1, 0, serialize(obj));
    } else if (kind === 'edit') {
      const ln = idx[i]; lines[ln] = serialize(obj, lines[ln].match(/^\s*/)[0]) + (/,\s*$/.test(lines[ln]) ? ',' : '');
    } else {
      lines.splice(idx[i], 1);
      if (i === idx.length - 1 && i > 0) lines[idx[i - 1]] = lines[idx[i - 1]].replace(/,\s*$/, '');        // the new last game takes no comma
    }
    const next = lines.join('\n'), want = before + (kind === 'add' ? 1 : kind === 'delete' ? -1 : 0);
    if ((JSON.parse(next).games || []).length !== want) throw new Error('Something went wrong building the change, so nothing was saved.');      // never commit a broken file
    const r = await ghGames({ method: 'PUT', body: JSON.stringify({ message, content: b64enc(next), sha, branch }) });
    if (r.ok) { const j = await r.json(); adopt(next, (j.content && j.content.sha) || ''); return; }
    if (r.status !== 409 && r.status !== 422) throw new Error('GitHub error ' + r.status);
  }
  throw new Error('The file changed while saving. Please try again.');
}
async function loadAdmin() {
  if (!tok.get() || ADM.loading) return;
  ADM.loading = true; ADM.error = '';
  try { const { text, sha } = await readFile(); adopt(text, sha); } catch (e) { ADM.error = e.message; }
  ADM.loading = false; rerender();
}
const rerender = () => { if ((location.hash || '').includes('add')) route(true); };

const rawList = () => (ADM.loaded ? ADM.raw : D.rawGames || []);
const tokenLink = () => {
  const { owner } = repoInfo();
  return 'https://github.com/settings/personal-access-tokens/new?' + new URLSearchParams({ name: 'Bubble Hockey League site', description: 'Lets the league site save games', target_name: owner || '', expires_in: '365', contents: 'write' });
};
/* Saving needs the one-time connection: point at the steps instead of failing quietly. */
function needConnect() {
  const card = document.getElementById('connect-card');
  note('To save, connect to GitHub first (one time). The steps are at the top of this page.', false);
  if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 1600); }
}

/* ---------- the form ---------- */
const val = id => document.getElementById(id).value, chk = id => document.getElementById(id).checked;
function readForm() {
  const o = { date: val('a-date'), home: val('a-home'), road: val('a-road') }, problems = [];
  const dnp = chk('a-dnp'), po = chk('a-po'), hs = val('a-hs'), rs = val('a-rs');
  const orig = ADM.editing !== null ? rawList()[ADM.editing] : null;
  document.getElementById('a-win-wrap').hidden = !po || dnp;
  const w = document.getElementById('a-win'), want = [o.home, o.road].filter(Boolean);
  if (w.options.length !== want.length + 1 || [...w.options].slice(1).some((x, i) => x.value !== want[i])) { const keep = w.value; w.innerHTML = '<option value=""></option>' + want.map(n => `<option>${esc(n)}</option>`).join(''); if (want.includes(keep)) w.value = keep; }
  if (!o.date) { if (orig && orig.month && !orig.date) { delete o.date; o.month = orig.month; } else problems.push('Pick the date.'); }
  if (!o.home || !o.road) problems.push('Pick both players.'); else if (o.home === o.road) problems.push('Pick two different players.');
  if (dnp) o.dnp = true;
  else {
    if (hs !== '' && rs !== '') { o.homeScore = +hs; o.roadScore = +rs; if (+hs === +rs) problems.push('A game cannot end tied. Enter the final score, including the overtime goal.'); }
    else if (!po) problems.push('Enter both scores.');
    if (chk('a-ot')) o.overtime = true;
    if (val('a-hsh') !== '' && val('a-rsh') !== '') { o.homeShots = +val('a-hsh'); o.roadShots = +val('a-rsh'); }
    if (po) { o.playoff = true; if (o.homeScore === undefined) { if (!w.value) problems.push('Enter the scores or pick the winner.'); else o.winner = w.value; } }
  }
  const preview = o.dnp ? `${o.home} vs ${o.road}: DNP` : o.homeScore !== undefined ? `${o.home} ${o.homeScore} – ${o.roadScore} ${o.road}${o.overtime ? ' (OT)' : ''}${o.playoff ? ' (playoff)' : ''}` : `${o.home} vs ${o.road}, ${o.winner} won`;
  return { obj: o, problems, preview };
}
function setForm(o) {
  const set = (id, v) => { document.getElementById(id).value = v ?? ''; };
  set('a-date', o.date || ''); set('a-home', o.home); set('a-road', o.road); set('a-hs', o.homeScore); set('a-rs', o.roadScore); set('a-hsh', o.homeShots); set('a-rsh', o.roadShots);
  document.getElementById('a-ot').checked = !!o.overtime; document.getElementById('a-po').checked = !!o.playoff; document.getElementById('a-dnp').checked = !!o.dnp;
  readForm(); set('a-win', o.winner);
}
function showOut() {
  const { obj, problems, preview } = readForm(), out = document.getElementById('a-out'), connected = !!tok.get() && ADM.loaded && !ADM.layoutError;
  const save = document.getElementById('a-save'); if (save) save.disabled = problems.length > 0;
  if (problems.length) { out.innerHTML = `<p class="muted">${problems.map(esc).join(' ')}</p>`; return; }
  if (connected) { out.innerHTML = `<p class="muted">Ready to save: ${esc(preview)}</p>`; return; }
  const text = (D.games.length ? ',\n' : '\n') + serialize(obj);
  out.innerHTML = `<h2>${esc(preview)}</h2><pre class="snip">${esc(text)}</pre><button class="btn" id="a-copy" type="button">Copy</button> <span id="a-copied" class="form-note ok"></span>`;
  out.dataset.text = text;
}
const note = (msg, ok) => { const el = document.getElementById('a-note'); if (el) { el.className = 'form-note ' + (ok ? 'ok' : 'err'); el.textContent = msg; } };
const gameLine = o => o.dnp ? `${o.home} vs ${o.road} (DNP)` : o.homeScore !== undefined ? `${o.home} ${o.homeScore}-${o.roadScore} ${o.road}` : `${o.home} vs ${o.road}`;

/* ---------- the page ---------- */
const entryMonth = e => (e.date || e.month || '').slice(0, 7);
function gamesList() {
  const list = rawList();
  if (!list.length) return '<p class="muted">No games in the file yet.</p>';
  const months = [...new Set(list.map(entryMonth))].filter(Boolean).sort().reverse();
  const c = chipsFor('add', months, m => list.filter(e => entryMonth(e) === m).length);
  const valid = new Set(D.games.map(g => g.seq));
  const rows = list.map((e, i) => ({ e, i })).filter(x => entryMonth(x.e) === c.sel).sort((a, b) => (b.e.date || '').localeCompare(a.e.date || '') || b.i - a.i);
  return `<h2>Edit or delete a game</h2>${c.html}<div class="glist">${rows.map(({ e, i }) => `<div class="grow${ADM.editing === i ? ' editing' : ''}">
      <div class="ginfo"><span class="muted">${e.date ? dateShort(e.date) : esc(e.month || '')}</span> <b>${esc(gameLine(e))}</b>${e.playoff ? ' <span class="tag">Playoff</span>' : ''}${e.overtime ? ' <span class="tag">OT</span>' : ''}${e.dnp ? ' <span class="tag dnp">DNP</span>' : ''}${valid.has(i) ? '' : ' <span class="tag warn">Needs fixing</span>'}</div>
      <div class="gbtns"><button class="btn small" type="button" data-edit="${i}">Edit</button><button class="btn small ghost" type="button" data-del="${i}">Delete</button></div></div>`).join('')}</div>`;
}
view.add = function () {
  const connected = !!tok.get();
  if (connected && !ADM.loaded && !ADM.loading) setTimeout(loadAdmin, 0);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const pick = (id, label) => `<label class="f">${label}<select id="${id}"><option value=""></option>${D.members.map(m => `<option>${esc(m.short_name)}</option>`).join('')}</select></label>`;
  const num = (id, label) => `<label class="f">${label}<input id="${id}" type="number" inputmode="numeric" min="0" max="999"></label>`;
  const editing = ADM.editing !== null;
  const { owner, repo } = repoInfo();
  const connect = connected ? `<p class="muted" style="margin:0 0 14px">${ADM.loading ? 'Connecting to GitHub…' : ADM.error || ADM.layoutError ? '' : 'Connected to GitHub. Changes save straight to the site.'} <button class="link" id="a-disconnect" type="button">Disconnect</button></p>${ADM.error || ADM.layoutError ? `<p class="form-note err">${esc(ADM.error || ADM.layoutError)} You can still use the form to copy a line.</p>` : ''}`
    : `<div class="card" id="connect-card"><b>Connect once to save changes</b>
        <p class="muted" style="margin:6px 0 12px">You can look around and fill things in now. To actually save, GitHub has to give this site permission once. It takes about two minutes.</p>
        <p class="stepno">Step 1 · Get a token from GitHub</p>
        <a class="btn wide" href="${esc(tokenLink())}" target="_blank" rel="noopener noreferrer">Open GitHub</a>
        <p class="muted" style="margin:8px 0 0">Sign in if it asks. Then, on that page: under <b>Repository access</b> pick <b>Only select repositories</b> and choose <b>${esc(owner || '')}/${esc(repo || '')}</b>. Tap <b>Generate token</b> at the bottom and <b>copy</b> the token (it starts with <code>github_pat_</code>). <button class="link" id="a-copylink" type="button">Link not opening? Copy it instead.</button></p>
        <p class="stepno" style="margin-top:18px">Step 2 · Come back here and paste it</p>
        <form id="tok-form" class="form" novalidate><label class="f">Token<input id="a-token" type="password" autocomplete="off" placeholder="github_pat_…"></label>
        <div class="btnrow"><button class="btn ghost" id="a-paste" type="button">Paste</button><button class="btn" id="a-connect" type="submit" disabled>Connect</button></div><p id="tok-note" class="form-note">Paste the token above, then tap Connect.</p></form>
        <p class="muted" style="margin:10px 0 0">The token stays only in this browser. You renew it once a year.</p></div>`;
  const live = connected && ADM.loaded && !ADM.layoutError;
  setTimeout(() => { if (!document.getElementById('add-form')) return; if (editing && rawList()[ADM.editing]) setForm(rawList()[ADM.editing]); else showOut(); }, 0);
  return `<h1>Add / edit games</h1>${connect}
    <h2 id="form-h">${editing ? 'Edit this game' : 'Add a game'}</h2><div class="card"><form id="add-form" class="form" onsubmit="return false">
      <label class="f">Date<input id="a-date" type="date" value="${today}"></label>
      <div class="row2">${pick('a-home', 'Home player')}${pick('a-road', 'Road player')}</div>
      <div class="row2">${num('a-hs', 'Home score')}${num('a-rs', 'Road score')}</div>
      <label class="check"><input id="a-ot" type="checkbox"><span>Decided in overtime</span></label>
      <div class="row2">${num('a-hsh', 'Home shots (optional)')}${num('a-rsh', 'Road shots (optional)')}</div>
      <label class="check"><input id="a-dnp" type="checkbox"><span>Did not play (DNP) <span class="muted">· no effect on the standings</span></span></label>
      <label class="check"><input id="a-po" type="checkbox"><span>Playoff game <span class="muted">· still counts in the standings</span></span></label>
      <label class="f" id="a-win-wrap" hidden>Winner <span class="muted">(only if you are not entering scores)</span><select id="a-win"><option value=""></option></select></label>
      ${live || !connected ? `<div class="btnrow"><button class="btn" id="a-save" type="button">${editing ? 'Save changes' : 'Save game'}</button>${editing ? '<button class="btn ghost" id="a-cancel" type="button">Cancel</button>' : ''}</div>` : ''}
      <p id="a-note" class="form-note"></p>
    </form></div>
    <div id="a-out"></div>
    ${connected && !live ? '' : gamesList()}
    ${connected ? '' : `<h2>How to add it</h2><div class="card"><ol class="steps">
      <li>Fill in the form above, then tap <b>Copy</b>.</li>
      <li>On GitHub open <b>data/games.json</b> and tap the pencil (Edit).</li>
      <li>Tap at the very end of the last game line (right after its <code>}</code>) and paste. The copied text starts with a comma, so the list stays valid.</li>
      <li>Tap <b>Commit changes</b>. The site updates in about a minute.</li></ol></div>`}`;
};

/* ---------- events ---------- */
document.addEventListener('input', e => {
  if (e.target.closest('#add-form')) showOut();
  if (e.target.id === 'a-token') { const has = e.target.value.trim().length > 0; document.getElementById('a-connect').disabled = !has; const n = document.getElementById('tok-note'); n.className = 'form-note'; n.textContent = has ? 'Now tap Connect.' : 'Paste the token above, then tap Connect.'; }
});
document.addEventListener('change', e => { if (e.target.closest('#add-form')) showOut(); });
document.addEventListener('submit', async e => {
  if (e.target.id !== 'tok-form') return;
  e.preventDefault(); const btn = e.target.querySelector('button[type=submit]');
  const typed = document.getElementById('a-token').value.trim();
  if (!typed) { const n = document.getElementById('tok-note'); n.className = 'form-note err'; n.textContent = 'Paste the token first. Step 1 above gets you one.'; return; }
  btn.disabled = true; const prev = tok.get(); tok.set(typed);
  try { await readFile(); ADM.loaded = false; route(); }
  catch (err) { tok.set(prev); const n = document.getElementById('tok-note'); n.className = 'form-note err'; n.textContent = /did not accept/.test(err.message) ? err.message : 'Could not connect: ' + err.message; btn.disabled = false; }
});
document.addEventListener('click', async e => {
  const t = e.target;
  if (t.id === 'a-copy') {
    const text = document.getElementById('a-out').dataset.text, done = ok => { document.getElementById('a-copied').textContent = ok ? 'Copied.' : 'Select the text above and copy it.'; };
    try { await navigator.clipboard.writeText(text); done(true); } catch { done(false); } return;
  }
  if (t.id === 'a-disconnect') { tok.set(''); Object.assign(ADM, { loaded: false, text: '', raw: [], editing: null, error: '' }); route(); return; }
  if (t.id === 'a-copylink') { const n = document.getElementById('tok-note'); try { await navigator.clipboard.writeText(tokenLink()); n.className = 'form-note ok'; n.textContent = 'Link copied. Paste it into your browser\'s address bar.'; } catch { n.className = 'form-note err'; n.textContent = 'Could not copy. Long-press the Open GitHub button and choose Copy Link.'; } return; }
  if (t.id === 'a-paste') { try { const box = document.getElementById('a-token'); box.value = (await navigator.clipboard.readText()).trim(); box.dispatchEvent(new Event('input', { bubbles: true })); } catch { const n = document.getElementById('tok-note'); n.className = 'form-note err'; n.textContent = 'Could not read the clipboard. Long-press in the box and choose Paste.'; } return; }
  if (t.id === 'a-cancel') { ADM.editing = null; route(true); return; }
  if (t.id === 'a-save') {
    const { obj, problems, preview } = readForm();
    if (problems.length) { note(problems.join(' '), false); return; }
    if (!tok.get()) return needConnect();
    if (!ADM.loaded) { note('Still connecting to GitHub. Try again in a moment.', false); return; }
    t.disabled = true; note('Saving…', true);
    try {
      const editing = ADM.editing, seen = editing !== null ? ADM.raw[editing] : null;
      await saveChange(editing !== null ? 'edit' : 'add', editing, obj, seen, `${editing !== null ? 'Edit' : 'Add'} game: ${gameLine(obj)}${obj.date ? ' (' + obj.date + ')' : ''}`);
      const keep = { date: val('a-date'), home: val('a-home'), road: val('a-road') }; ADM.editing = null; rerender();
      if (editing === null) setTimeout(() => { ['a-date', 'a-home', 'a-road'].forEach(id => document.getElementById(id).value = keep[id.slice(2)]); showOut(); note(`Saved: ${preview}. The public site updates in about a minute.`, true); }, 20);
      else setTimeout(() => note(`Saved changes: ${preview}.`, true), 20);
    } catch (err) { t.disabled = false; note(err.message, false); }
    return;
  }
  if (t.dataset && t.dataset.edit !== undefined) { ADM.editing = +t.dataset.edit; route(true); setTimeout(() => document.getElementById('form-h').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); return; }
  if (t.dataset && t.dataset.del !== undefined) {
    const i = +t.dataset.del, e0 = rawList()[i];
    if (!tok.get()) return needConnect();
    if (!e0 || !confirm(`Delete this game?\n${e0.date || e0.month}: ${gameLine(e0)}`)) return;
    t.disabled = true;
    try { await saveChange('delete', i, null, e0, `Delete game: ${gameLine(e0)} (${e0.date || e0.month})`); if (ADM.editing === i) ADM.editing = null; rerender(); setTimeout(() => note(`Deleted: ${gameLine(e0)}. The public site updates in about a minute.`, true), 20); }
    catch (err) { t.disabled = false; note(err.message, false); }
  }
});
