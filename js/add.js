/* Add / Edit games (#/add).
   Not connected: builds a line of JSON to paste into data/games.json.
   Connected (a GitHub token kept only in this browser): saves straight to data/games.json, with add, edit and delete.
   Edits change just the one line in the file, so the rest of the file is left exactly as it was. */
PAGES.push(['add', 'Add / Edit']);

const tok = {
  get() { try { return localStorage.getItem('bhl_token') || ''; } catch { return ''; } },
  set(v) { try { v ? localStorage.setItem('bhl_token', v) : localStorage.removeItem('bhl_token'); } catch { } },
};
const ADM = { text: '', sha: '', raw: [], loaded: false, loading: false, tried: false, error: '', layoutError: '', editing: null };

/* ---------- GitHub (data/games.json) ---------- */
async function ghContents(path, opts = {}) {
  const { owner, repo, branch } = repoInfo();
  let r;
  try { r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}${opts.method === 'PUT' ? '' : '?ref=' + branch}`, {
    ...opts, cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + tok.get(), ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  }); } catch { throw new Error('Could not reach GitHub. Check your connection and try again. Nothing was saved.'); }
  if (r.status === 401 || r.status === 403 || r.status === 404) throw new Error('GitHub did not accept the token. Check that it has "Contents: Read and write" for this repository and has not expired, then reconnect.');
  return r;
}
const ghGames = opts => ghContents('data/games.json', opts);
async function readFile(path = 'data/games.json') {
  const r = await ghContents(path); if (!r.ok) throw new Error('GitHub error ' + r.status);
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
  ADM.loading = true; ADM.tried = true; ADM.error = '';
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
function needConnect(noteId) {
  const card = document.getElementById('connect-card');
  note('To save, connect to GitHub first (one time). The steps are at the top of this page.', false, noteId);
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
const note = (msg, ok, id = 'a-note') => { const el = document.getElementById(id); if (el) { el.className = 'form-note ' + (ok ? 'ok' : 'err'); el.textContent = msg; } };
const gameLine = o => o.dnp ? `${o.home} vs ${o.road} (DNP)` : o.homeScore !== undefined ? `${o.home} ${o.homeScore}-${o.roadScore} ${o.road}` : `${o.home} vs ${o.road}`;


/* ---------- members & teams (data/members.csv) ---------- */
const MEM = { editing: null };                                  // short_name being edited, or null when adding
const csvField = v => { v = String(v ?? ''); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const MEM_KEYS = ['name', 'short_name', 'team_name', 'established', 'logo', 'alt_logo'];

function readMember() {
  const v = id => document.getElementById(id).value.trim(), problems = [];
  const rec = { name: v('m-name'), short_name: MEM.editing !== null ? MEM.editing : v('m-short'), team_name: v('m-team'), established: v('m-est') };
  if (!rec.name) problems.push('Enter the full name.');
  if (!rec.short_name) problems.push('Enter a short name.'); else if (!/^[\p{L}\p{N} .'-]{1,24}$/u.test(rec.short_name)) problems.push('The short name can use letters, numbers, spaces, dots, apostrophes and hyphens (up to 24 characters).');
  if (!rec.team_name) problems.push('Enter the team name.');
  for (const k of ['name', 'team_name']) if (/[<>\\\r\n]/.test(rec[k]) || rec[k].length > 60) problems.push('Names can be up to 60 characters and cannot contain < > or \\.');
  if (MEM.editing === null && rec.short_name && D.members.some(m => m.short_name.toLowerCase() === rec.short_name.toLowerCase())) problems.push('Someone already uses that short name.');
  if (rec.established && !/^\d{4}-\d{2}-\d{2}$/.test(rec.established)) problems.push('Pick a valid date.');
  return { rec, problems: [...new Set(problems)] };
}
function setMemberForm(m) {
  const set = (id, v) => { document.getElementById(id).value = v ?? ''; };
  set('m-name', m.name); set('m-short', m.short_name); set('m-team', m.team_name); set('m-est', m.established);
  document.getElementById('m-short').disabled = true;
}
/* Shrink a chosen picture to a 400px square (kept whole) and return it as bytes plus a preview. */
async function logoBlob(file) {
  const bmp = await createImageBitmap(file), size = 400, c = document.createElement('canvas'); c.width = c.height = size;
  const k = Math.min(size / bmp.width, size / bmp.height), w = bmp.width * k, h = bmp.height * k;
  c.getContext('2d').drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h);
  const blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.85)), bin = new Uint8Array(await blob.arrayBuffer()); let str = ''; bin.forEach(x => str += String.fromCharCode(x));
  return { b64: btoa(str), ext: blob.type === 'image/webp' ? 'webp' : 'png', preview: c.toDataURL(blob.type) };
}
async function uploadLogo(file, slug) {
  const { branch } = repoInfo(), { b64, ext, preview } = await logoBlob(file), path = `images/teams/${slug}.${ext}`;
  const r = await ghContents(path, { method: 'PUT', body: JSON.stringify({ message: 'Add logo ' + slug, content: b64, branch }) });
  if (!r.ok) throw new Error('Could not save the logo image (GitHub error ' + r.status + ').');
  return { path, preview };
}
/* Add or update one member row in members.csv. Only that row changes; the file's line endings are kept. */
async function saveMember(rec, files, isNew) {
  const { branch } = repoInfo(), stamp = Date.now().toString(36), base = rec.short_name.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'team', previews = {};
  if (files.logo) { const u = await uploadLogo(files.logo, `${base}-${stamp}`); rec.logo = u.path; previews.logo = u.preview; }
  if (files.alt_logo) { const u = await uploadLogo(files.alt_logo, `${base}-${stamp}-alt`); rec.alt_logo = u.path; previews.alt_logo = u.preview; }
  for (let attempt = 0; attempt < 3; attempt++) {
    const { text, sha } = await readFile('data/members.csv'), eol = text.includes('\r\n') ? '\r\n' : '\n';
    const head = text.split(/\r?\n/)[0].split(',').map(h => h.trim()), keys = head.map(h => h.toLowerCase().replace(/\s+/g, '_'));
    const rows = parseCSV(text); if (!keys.includes('short_name')) throw new Error('members.csv is not laid out the way this page expects. Edit it on GitHub instead.');
    const i = rows.findIndex(r => r.short_name === rec.short_name);
    if (isNew && i >= 0) throw new Error('Someone already uses that short name.');
    if (!isNew && i < 0) throw new Error('That member is no longer in the file. Reload the page.');
    const row = i >= 0 ? { ...rows[i] } : {}; for (const k of MEM_KEYS) if (rec[k] !== undefined && (k in rec)) row[k] = rec[k];
    if (i >= 0) rows[i] = row; else rows.push(row);
    const next = [head.join(','), ...rows.map(r => keys.map(k => csvField(r[k])).join(','))].join(eol) + eol;
    if (parseCSV(next).length !== rows.length) throw new Error('Something went wrong building the change, so nothing was saved.');      // never commit a broken file
    const r = await ghContents('data/members.csv', { method: 'PUT', body: JSON.stringify({ message: `${isNew ? 'Add' : 'Update'} member: ${rec.name} (${rec.team_name})`, content: b64enc(next), sha, branch }) });
    if (r.ok) { D.members = toMembers(parseCSV(next)); if (previews.logo || previews.alt_logo) D.members = D.members.map(m => m.short_name !== rec.short_name ? m : { ...m, logo: previews.logo || m.logo, alt_logo: previews.alt_logo || m.alt_logo }); return; }
    if (r.status !== 409 && r.status !== 422) throw new Error('GitHub error ' + r.status);
  }
  throw new Error('The file changed while saving. Please try again.');
}
function membersSection() {
  const editing = MEM.editing !== null ? D.members.find(m => m.short_name === MEM.editing) : null;
  setTimeout(() => { if (!document.getElementById('mem-form')) return; if (editing) setMemberForm(editing); }, 0);
  const thumb = m => m.logo ? `<img class="tlogo" style="width:38px;height:38px" src="${esc(m.logo)}" alt="" loading="lazy">` : '<span class="tlogo" style="width:38px;height:38px;background:var(--surface-2);display:inline-block"></span>';
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return `<h2>Members &amp; teams</h2><div class="glist">${D.members.map(m => `<div class="grow${MEM.editing === m.short_name ? ' editing' : ''}">
      <div class="ginfo" style="display:flex;gap:10px;align-items:center">${thumb(m)}<span><b>${esc(m.name)}</b> <span class="muted">· ${esc(m.short_name)}</span><br><span class="muted">${esc(m.team_name)}</span></span></div>
      <div class="gbtns"><button class="btn small" type="button" data-medit="${esc(m.short_name)}">Edit</button></div></div>`).join('')}</div>
    <h2 id="mem-h">${editing ? 'Edit this member' : 'Add a member'}</h2><div class="card"><form id="mem-form" class="form" onsubmit="return false">
      <label class="f">Full name<input id="m-name" autocomplete="off"></label>
      <label class="f">Short name <span class="muted">(how they show in the game log and standings${editing ? '; locked, because games use it' : ''})</span><input id="m-short" autocomplete="off"></label>
      <label class="f">Team name<input id="m-team" autocomplete="off"></label>
      <label class="f">Established <span class="muted">(the first day they are scheduled)</span><input id="m-est" type="date" value="${editing ? '' : today}"></label>
      <label class="f">Team logo <span class="muted">${editing ? '(leave empty to keep the current one)' : '(optional)'}</span><input id="m-logo" type="file" accept="image/*"></label>
      <label class="f">Alternate logo <span class="muted">${editing ? '(leave empty to keep the current one)' : '(optional)'}</span><input id="m-alt" type="file" accept="image/*"></label>
      <div class="btnrow"><button class="btn" id="m-save" type="button">${editing ? 'Save changes' : 'Add member'}</button>${editing ? '<button class="btn ghost" id="m-cancel" type="button">Cancel</button>' : ''}</div>
      <p id="m-note" class="form-note"></p>
    </form></div>
    ${editing ? '' : '<p class="muted">A new player joins the schedule on their established date. Days before that are not changed.</p>'}`;
}

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
  if (connected && !ADM.loaded && !ADM.loading && !ADM.tried) setTimeout(loadAdmin, 0);      // one attempt per visit, so a bad token cannot loop
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const pick = (id, label) => `<label class="f">${label}<select id="${id}"><option value=""></option>${D.members.map(m => `<option>${esc(m.short_name)}</option>`).join('')}</select></label>`;
  const num = (id, label) => `<label class="f">${label}<input id="${id}" type="number" inputmode="numeric" min="0" max="999"></label>`;
  const editing = ADM.editing !== null;
  const { owner, repo } = repoInfo();
  const connect = connected ? `<p class="muted" style="margin:0 0 14px">${ADM.loading ? 'Connecting to GitHub…' : ADM.error || ADM.layoutError ? '' : 'Connected to GitHub. Changes save straight to the site.'} <button class="link" id="a-disconnect" type="button">Disconnect</button></p>${ADM.error || ADM.layoutError ? `<p class="form-note err">${esc(ADM.error || ADM.layoutError)} ${ADM.error ? '<button class="link" id="a-retry" type="button">Try again</button>' : 'You can still use the form to copy a line.'}</p>` : ''}`
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
  const sec = UI['add-sec'] === 'members' ? 'members' : 'games';
  const secChips = `<div class="chips">${[['games', 'Games'], ['members', 'Members & teams']].map(([k, l]) => `<button type="button" class="chip ${sec === k ? 'on' : ''}" data-page="add-sec" data-m="${k}">${l}</button>`).join('')}</div>`;
  if (sec === 'members') return `<h1>Add / edit</h1>${connect}${secChips}${membersSection()}`;
  return `<h1>Add / edit games</h1>${connect}${secChips}
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
  try { await readFile(); ADM.loaded = false; ADM.tried = false; route(); }
  catch (err) { tok.set(prev); const n = document.getElementById('tok-note'); n.className = 'form-note err'; n.textContent = /did not accept/.test(err.message) ? err.message : 'Could not connect: ' + err.message; btn.disabled = false; }
});
document.addEventListener('click', async e => {
  const t = e.target;
  if (t.id === 'a-copy') {
    const text = document.getElementById('a-out').dataset.text, done = ok => { document.getElementById('a-copied').textContent = ok ? 'Copied.' : 'Select the text above and copy it.'; };
    try { await navigator.clipboard.writeText(text); done(true); } catch { done(false); } return;
  }
  if (t.id === 'a-disconnect') { tok.set(''); Object.assign(ADM, { loaded: false, tried: false, text: '', raw: [], editing: null, error: '' }); route(); return; }
  if (t.id === 'a-retry') { ADM.tried = false; ADM.error = ''; route(true); return; }
  if (t.id === 'a-copylink') { const n = document.getElementById('tok-note'); try { await navigator.clipboard.writeText(tokenLink()); n.className = 'form-note ok'; n.textContent = 'Link copied. Paste it into your browser\'s address bar.'; } catch { n.className = 'form-note err'; n.textContent = 'Could not copy. Long-press the Open GitHub button and choose Copy Link.'; } return; }
  if (t.id === 'a-paste') { try { const box = document.getElementById('a-token'); box.value = (await navigator.clipboard.readText()).trim(); box.dispatchEvent(new Event('input', { bubbles: true })); } catch { const n = document.getElementById('tok-note'); n.className = 'form-note err'; n.textContent = 'Could not read the clipboard. Long-press in the box and choose Paste.'; } return; }
  if (t.id === 'a-cancel') { ADM.editing = null; route(true); return; }
  if (t.id === 'm-cancel') { MEM.editing = null; route(true); return; }
  if (t.dataset && t.dataset.medit !== undefined) { MEM.editing = t.dataset.medit; route(true); setTimeout(() => document.getElementById('mem-h').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); return; }
  if (t.id === 'm-save') {
    const { rec, problems } = readMember();
    if (problems.length) { note(problems.join(' '), false, 'm-note'); return; }
    if (!tok.get()) return needConnect('m-note');
    t.disabled = true; note('Saving…', true, 'm-note');
    try {
      const isNew = MEM.editing === null, files = { logo: document.getElementById('m-logo').files[0], alt_logo: document.getElementById('m-alt').files[0] };
      if (isNew && !confirm(`Add ${rec.name} (${rec.team_name})? They join the schedule on ${rec.established || 'day one'}.`)) { t.disabled = false; note('', true, 'm-note'); return; }
      await saveMember(rec, files, isNew); MEM.editing = null; rerender();
      setTimeout(() => note(`${isNew ? 'Added' : 'Saved'} ${rec.name}. The public site updates in about a minute (new logos can take a little longer).`, true, 'm-note'), 20);
    } catch (err) { t.disabled = false; note(err.message, false, 'm-note'); }
    return;
  }
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
