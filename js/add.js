/* Add-a-game helper (#/add). It only builds a line of JSON for data/games.json; it saves nothing and needs no login. */
PAGES.push(['add', 'Add Game']);      // the last tab, at #/add

view.add = function () {
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const pick = (id, label) => `<label class="f">${label}<select id="${id}"><option value=""></option>${D.members.map(m => `<option>${esc(m.short_name)}</option>`).join('')}</select></label>`;
  const num = (id, label, min = 0) => `<label class="f">${label}<input id="${id}" type="number" inputmode="numeric" min="${min}" max="999"></label>`;
  return `<h1>Add a game</h1><p class="lead">Fill this in, copy the result, and paste it into <code>data/games.json</code>. Nothing is saved from this page.</p>
    <div class="card"><form id="add-form" class="form" onsubmit="return false">
      <label class="f">Date<input id="a-date" type="date" value="${today}"></label>
      <div class="row2">${pick('a-home', 'Home player')}${pick('a-road', 'Road player')}</div>
      <div class="row2">${num('a-hs', 'Home score')}${num('a-rs', 'Road score')}</div>
      <label class="check"><input id="a-ot" type="checkbox"> Decided in overtime</label>
      <div class="row2">${num('a-hsh', 'Home shots (optional)')}${num('a-rsh', 'Road shots (optional)')}</div>
      <label class="check"><input id="a-dnp" type="checkbox"> Did not play (DNP) <span class="muted">(shown as DNP, no effect on the standings)</span></label>
      <label class="check"><input id="a-po" type="checkbox"> Playoff game <span class="muted">(still counts in the standings)</span></label>
      <label class="f" id="a-win-wrap" hidden>Winner <span class="muted">(only if you are not entering scores)</span><select id="a-win"><option value=""></option></select></label>
    </form></div>
    <div id="a-out"></div>
    <h2>How to add it</h2><div class="card"><ol class="steps">
      <li>Fill in the form above, then tap <b>Copy</b>.</li>
      <li>On GitHub open <b>data/games.json</b> and tap the pencil (Edit).</li>
      <li>Tap at the very end of the last game line (right after its <code>}</code>) and paste. The copied text starts with a comma, so the list stays valid.</li>
      <li>Tap <b>Commit changes</b>. The site updates in about a minute.</li>
    </ol><p class="muted" style="margin:0">If you mistype something, the site shows a yellow box at the top naming the problem instead of breaking.</p></div>`;
};

function addSnippet() {
  const v = id => document.getElementById(id).value, ck = id => document.getElementById(id).checked;
  const o = { date: v('a-date'), home: v('a-home'), road: v('a-road') };
  const po = ck('a-po'), hs = v('a-hs'), rs = v('a-rs');
  document.getElementById('a-win-wrap').hidden = !po;
  const w = document.getElementById('a-win'); const want = [v('a-home'), v('a-road')].filter(Boolean);
  if (w.options.length !== want.length + 1 || [...w.options].slice(1).some((x, i) => x.value !== want[i])) { const keep = w.value; w.innerHTML = '<option value=""></option>' + want.map(n => `<option>${esc(n)}</option>`).join(''); if (want.includes(keep)) w.value = keep; }
  const problems = []; const dnp = ck('a-dnp');
  if (!o.date) problems.push('Pick the date.');
  if (!o.home || !o.road) problems.push('Pick both players.'); else if (o.home === o.road) problems.push('Pick two different players.');
  if (dnp) { /* no scores for a game that was not played */ }
  else if (hs !== '' && rs !== '') { o.homeScore = +hs; o.roadScore = +rs; if (+hs === +rs) problems.push('A game cannot end tied. Enter the final score, including the overtime goal.'); }
  else if (!po) problems.push('Enter both scores.');
  if (!dnp && ck('a-ot')) o.overtime = true;
  if (!dnp && v('a-hsh') !== '' && v('a-rsh') !== '') { o.homeShots = +v('a-hsh'); o.roadShots = +v('a-rsh'); }
  if (dnp) o.dnp = true;
  else if (po) { o.playoff = true; if (o.homeScore === undefined) { if (!w.value) problems.push('Enter the scores or pick the winner.'); else o.winner = w.value; } }
  const out = document.getElementById('a-out');
  if (problems.length) { out.innerHTML = `<p class="muted">${problems.map(esc).join(' ')}</p>`; return; }
  const line = '    { ' + Object.entries(o).map(([k, val]) => `"${k}": ${JSON.stringify(val)}`).join(', ') + ' }';
  const text = (D.games.length ? ',\n' : '\n') + line;      // the comma joins it to the game before it (not needed for the very first game)
  const preview = o.dnp ? `${o.home} vs ${o.road}: DNP` : o.homeScore !== undefined ? `${o.home} ${o.homeScore} – ${o.roadScore} ${o.road}${o.overtime ? ' (OT)' : ''}` : `${o.home} vs ${o.road}, ${o.winner} won`;
  out.innerHTML = `<h2>${esc(preview)}</h2><pre class="snip">${esc(text)}</pre><button class="btn" id="a-copy" type="button">Copy</button> <span id="a-copied" class="form-note ok"></span>`;
  out.dataset.text = text;
}
document.addEventListener('input', e => { if (e.target.closest('#add-form')) addSnippet(); });
document.addEventListener('change', e => { if (e.target.closest('#add-form')) addSnippet(); });
document.addEventListener('click', async e => {
  if (e.target.id !== 'a-copy') return;
  const text = document.getElementById('a-out').dataset.text, done = ok => { document.getElementById('a-copied').textContent = ok ? 'Copied.' : 'Select the text above and copy it.'; };
  try { await navigator.clipboard.writeText(text); done(true); } catch { done(false); }
});
