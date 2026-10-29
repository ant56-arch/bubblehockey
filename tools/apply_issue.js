#!/usr/bin/env node
/* Applies one game change (add, edit or delete) to data/games.json.
   Run by .github/workflows/games.yml when the commissioner submits a change from the site's Add / Edit tab.
   Input:  ISSUE_BODY (environment variable) containing   <!-- bhl-game-change -->  and a ```json block.
   Output: data/games.json changed in place; change-message.txt (the commit message) or change-error.txt (why it failed).
   Only the one line involved is touched, so the rest of the file stays exactly as it was. */
const fs = require('fs');
const FILE = 'data/games.json';
const fail = msg => { fs.writeFileSync('change-error.txt', msg + '\n'); console.error(msg); process.exit(1); };

const body = process.env.ISSUE_BODY || '';
const m = body.match(/<!--\s*bhl-game-change\s*-->[\s\S]*?```json\s*([\s\S]*?)```/);
if (!m) fail('This does not look like a change made from the Add / Edit tab.');
let req; try { req = JSON.parse(m[1]); } catch (e) { fail('The change data could not be read (' + e.message + ').'); }
if (!['add', 'edit', 'delete'].includes(req.action)) fail('Unknown action "' + req.action + '".');

/* ---- validate a game before it is written ---- */
const members = fs.readFileSync('data/members.csv', 'utf8').trim().split('\n').slice(1).map(l => l.split(',')[1]);
const ALLOWED = ['date', 'month', 'home', 'road', 'homeScore', 'roadScore', 'overtime', 'homeShots', 'roadShots', 'playoff', 'winner', 'dnp'];
function clean(g) {
  if (!g || typeof g !== 'object') fail('No game was included.');
  const o = {};
  for (const k of ALLOWED) if (g[k] !== undefined && g[k] !== null && g[k] !== '') o[k] = g[k];
  for (const k of Object.keys(g)) if (!ALLOWED.includes(k)) fail('Unexpected field "' + k + '".');
  if (o.date !== undefined ? !/^\d{4}-\d{2}-\d{2}$/.test(o.date) : !(o.playoff && /^\d{4}-\d{2}$/.test(o.month || ''))) fail('The date must look like 2026-11-03.');
  if (!members.includes(o.home) || !members.includes(o.road) || o.home === o.road) fail('Pick two different players from the member list.');
  for (const k of ['homeScore', 'roadScore', 'homeShots', 'roadShots']) if (o[k] !== undefined && !(Number.isInteger(o[k]) && o[k] >= 0 && o[k] <= 999)) fail(k + ' must be a whole number.');
  if (o.dnp) { if (o.homeScore !== undefined || o.playoff) fail('A DNP game has no scores.'); return o; }
  const scored = o.homeScore !== undefined && o.roadScore !== undefined;
  if (scored && o.homeScore === o.roadScore) fail('A game cannot end tied.');
  if (!o.playoff && !scored) fail('Both scores are needed.');
  if (o.playoff && !scored && ![o.home, o.road].includes(o.winner)) fail('A playoff game needs scores or a winner.');
  return o;
}
const serialize = (o, indent) => `${indent}{ ${Object.entries(o).map(([k, v]) => `"${k}": ${JSON.stringify(v)}`).join(', ')} }`;
const describe = g => g.dnp ? `${g.home} vs ${g.road} (DNP)` : g.homeScore !== undefined ? `${g.home} ${g.homeScore}-${g.roadScore} ${g.road}` : `${g.home} vs ${g.road}`;
const when = g => g.date || g.month;

/* ---- edit the file one line at a time ---- */
const text = fs.readFileSync(FILE, 'utf8');
const lines = text.split('\n'), start = lines.findIndex(l => /^\s*"games"\s*:\s*\[/.test(l));
if (start < 0) fail('games.json is not laid out the way the automatic editor expects. Edit it by hand.');
const idx = [];
for (let i = start + 1; i < lines.length; i++) {
  if (/^\s*\]/.test(lines[i])) break;
  if (/^\s*\{.*\}\s*,?\s*$/.test(lines[i])) idx.push(i); else if (lines[i].trim()) fail('games.json has a game that is not on one line. Edit it by hand.');
}
const before = JSON.parse(text).games || [];
if (before.length !== idx.length) fail('games.json is not one game per line. Edit it by hand.');

let message;
if (req.action === 'add') {
  const g = clean(req.game);
  if (idx.length) { const last = idx[idx.length - 1]; if (!/,\s*$/.test(lines[last])) lines[last] += ','; lines.splice(last + 1, 0, serialize(g, lines[last].match(/^\s*/)[0])); }
  else lines.splice(start + 1, 0, serialize(g, '    '));
  message = `Add game: ${describe(g)} (${when(g)})`;
} else {
  const i = req.index;
  if (!Number.isInteger(i) || i < 0 || i >= before.length) fail('That game is no longer in the file.');
  if (JSON.stringify(before[i]) !== JSON.stringify(req.seen)) fail('That game was changed by someone else since you opened it. Open the Add / Edit tab again and retry.');
  if (req.action === 'edit') {
    const g = clean(req.game), ln = idx[i];
    lines[ln] = serialize(g, lines[ln].match(/^\s*/)[0]) + (/,\s*$/.test(lines[ln]) ? ',' : '');
    message = `Edit game: ${describe(g)} (${when(g)})`;
  } else {
    lines.splice(idx[i], 1);
    if (i === idx.length - 1 && i > 0) lines[idx[i - 1]] = lines[idx[i - 1]].replace(/,\s*$/, '');      // the new last game takes no comma
    message = `Delete game: ${describe(before[i])} (${when(before[i])})`;
  }
}
const next = lines.join('\n');
let after; try { after = JSON.parse(next).games || []; } catch (e) { fail('The change would have broken the file, so nothing was saved.'); }
const want = before.length + (req.action === 'add' ? 1 : req.action === 'delete' ? -1 : 0);
if (after.length !== want) fail('The change would have damaged the file, so nothing was saved.');
fs.writeFileSync(FILE, next);
fs.writeFileSync('change-message.txt', message + '\n');
console.log(message);
