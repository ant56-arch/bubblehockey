/* Email recap (button on the Schedule page): pick two dates and get the games, the stats and some storylines for that stretch, ready to paste into an email.
   "Copy for email" copies a formatted version (tables included); "Copy plain text" copies a text version; "Open email draft" starts a message with the text.
   Everything is worked out from data/games.json, so the numbers always match the site. */

const RC = { open: false, from: '', to: '', upcoming: true };
const rcYmd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const rcAdd = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return rcYmd(d); };
const rcRec = r => `${r.w + r.otw}-${r.l}-${r.otl}`;
const rcSign = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
const rcN = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const rcOrd = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const rcRange = (a, b) => (a === b ? dateLabel(a) : `${parseYmd(a).toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${dateLabel(b)}`);

/* Defaults: the last 7 days, ending on the most recent day with a result (or today). */
function rcDefaults() {
  const today = todayStr(), last = D.games.filter(g => g.date && g.date <= today && (isCounted(g) || g.dnp)).map(g => g.date).sort().pop() || today;
  return { from: rcAdd(last, -6), to: last };
}
const rcGames = (from, to) => D.games.filter(g => g.date && g.date >= from && g.date <= to && isCounted(g)).sort(cmpOld);
const rcRank = (month, before) => standingsFor(monthGames(month).filter(g => g.date && g.date < before)).map((r, i) => ({ ...r, rank: i + 1 }));

function rcData(from, to) {
  const games = rcGames(from, to), dnp = D.games.filter(g => g.date && g.date >= from && g.date <= to && g.dnp).length;
  const period = standingsFor(games).filter(r => r.gp > 0), names = D.members.map(m => m.short_name);
  const endMonth = to.slice(0, 7), startMonth = from.slice(0, 7);
  const monthNow = standingsFor(monthGames(endMonth).filter(g => g.date <= to)).map((r, i) => ({ ...r, rank: i + 1 }));
  const monthThen = startMonth === endMonth ? standingsFor(monthGames(endMonth).filter(g => g.date < from)) : null;
  const all = standingsFor(D.games.filter(g => isCounted(g) && g.date && g.date <= to));
  const story = [];
  const add = (score, text) => story.push({ score, text });
  const leaderNow = monthNow[0] && monthNow[0].gp ? monthNow[0] : null;
  if (leaderNow) {
    const prev = monthThen && monthThen[0] && monthThen[0].gp ? monthThen[0] : null;
    if (prev && prev.name !== leaderNow.name) add(10, `New leader: ${leaderNow.name} took over first place in ${monthLabel(endMonth)} from ${prev.name} and has ${leaderNow.pts} points.`);
    else add(6, `${leaderNow.name} leads ${monthLabel(endMonth)} with ${leaderNow.pts} points (${rcRec(leaderNow)}).`);
    const second = monthNow[1]; if (second && second.gp && leaderNow.pts - second.pts <= 3) add(5, `It is tight at the top: ${second.name} is only ${leaderNow.pts - second.pts} point${leaderNow.pts - second.pts === 1 ? '' : 's'} behind.`);
    if (monthThen) { const moved = monthNow.filter(r => r.gp).map(r => { const was = monthThen.findIndex(x => x.name === r.name) + 1; return { name: r.name, now: r.rank, was }; }).filter(x => x.was && x.was - x.now >= 2).sort((a, b) => (b.was - b.now) - (a.was - a.now))[0]; if (moved) add(7, `${moved.name} climbed from ${rcOrd(moved.was)} to ${rcOrd(moved.now)}.`); }
  }
  // best and worst stretches
  const ranked = [...period].sort((a, b) => (b.w + b.otw) - (a.w + a.otw) || b.pts - a.pts);
  if (ranked[0] && ranked[0].gp >= 3 && ranked[0].l + ranked[0].otl === 0) add(9, `${ranked[0].name} was perfect: ${rcN(ranked[0].w + ranked[0].otw, 'win')} in ${rcN(ranked[0].gp, 'game')}.`);
  else if (ranked[0] && ranked[0].gp >= 3) add(7, `${ranked[0].name} had the best stretch at ${rcRec(ranked[0])} (${rcN(ranked[0].pts, 'point')}).`);
  period.filter(r => r.gp >= 3 && r.w + r.otw === 0).forEach(r => add(8, `${r.name} is still looking for a win: ${rcRec(r)} in ${rcN(r.gp, 'game')} this stretch.`));
  // streaks at the end date
  all.filter(r => /^W\d+/.test(r.streak) && +r.streak.slice(1) >= 3).sort((a, b) => +b.streak.slice(1) - +a.streak.slice(1)).slice(0, 2).forEach(r => add(8, `${r.name} has won ${r.streak.slice(1)} straight.`));
  all.filter(r => /^L\d+/.test(r.streak) && +r.streak.slice(1) >= 3).sort((a, b) => +b.streak.slice(1) - +a.streak.slice(1)).slice(0, 1).forEach(r => add(6, `${r.name} has dropped ${r.streak.slice(1)} in a row and is due for a win.`));
  // single games
  const margin = g => Math.abs(g.hg - g.rg), win = g => (g.hg > g.rg ? g.home : g.road), lose = g => (g.hg > g.rg ? g.road : g.home), score = g => (g.hg > g.rg ? `${g.hg}–${g.rg}` : `${g.rg}–${g.hg}`);
  const blow = [...games].sort((a, b) => margin(b) - margin(a))[0]; if (blow && margin(blow) >= 4) add(7, `Blowout: ${win(blow)} beat ${lose(blow)} ${score(blow)}.`);
  games.filter(g => Math.min(g.hg, g.rg) === 0).slice(0, 2).forEach(g => add(6, `Shutout: ${win(g)} blanked ${lose(g)} ${score(g)}.`));
  const ot = games.filter(g => g.ot); if (ot.length) add(5, ot.length === 1 ? `${win(ot[0])} edged ${lose(ot[0])} ${score(ot[0])} in overtime.` : `${rcN(ot.length, 'game')} went to overtime.`);
  const high = [...games].sort((a, b) => (b.hg + b.rg) - (a.hg + a.rg))[0]; if (high && high.hg + high.rg >= 12) add(4, `Goal fest: ${high.home} ${high.hg}, ${high.road} ${high.rg} (${high.hg + high.rg} goals).`);
  // upsets: the winner was ranked well below the loser before the game
  for (const g of games) { if (g.playoff) continue; const rk = rcRank(g.month, g.date), w = rk.find(r => r.name === win(g)), l = rk.find(r => r.name === lose(g)); if (w && l && w.gp >= 3 && l.gp >= 3 && w.rank - l.rank >= 2) { add(7, `Upset: ${win(g)} (${rcOrd(w.rank)}) beat ${lose(g)} (${rcOrd(l.rank)}) ${score(g)} on ${dayLabel(g.date)}.`); break; } }
  // head to head
  const pairs = {}; games.forEach(g => { const k = [g.home, g.road].sort().join('|'); (pairs[k] ??= []).push(g); });
  Object.values(pairs).filter(a => a.length >= 2).sort((a, b) => b.length - a.length).slice(0, 1).forEach(a => { const n1 = a[0].home, n2 = a[0].road, w1 = a.filter(g => win(g) === n1).length, w2 = a.length - w1; add(5, w1 === 0 || w2 === 0 ? `${w1 ? n1 : n2} swept ${w1 ? n2 : n1} in ${a.length} meetings.` : `${n1} and ${n2} met ${a.length} times and split ${Math.max(w1, w2)}–${Math.min(w1, w2)}.`); });
  // titles and new faces
  [...new Set(games.filter(g => g.playoff).map(g => g.month))].forEach(m => { const c = championOf(m); if (c) add(10, `${c} won the ${monthLabel(m)} playoff title.`); });
  D.members.filter(m => m.established && m.established >= from && m.established <= to).forEach(m => add(8, `Welcome ${m.name}${m.team_name ? ` (${m.team_name})` : ''}, who joined the league.`));
  const topO = [...period].sort((a, b) => b.gf - a.gf)[0]; if (topO && topO.gp >= 3) add(3, `Most goals: ${topO.name} scored ${topO.gf} in ${rcN(topO.gp, 'game')}.`);
  const topD = [...period].filter(r => r.gp >= 3).sort((a, b) => a.ga / a.gp - b.ga / b.gp)[0]; if (topD) add(3, `Best defense: ${topD.name} allowed ${topD.ga} in ${rcN(topD.gp, 'game')} (${(topD.ga / topD.gp).toFixed(1)} a game).`);
  if (dnp) add(2, `${rcN(dnp, 'scheduled game')} went unplayed (DNP).`);
  story.sort((a, b) => b.score - a.score);
  const days = [...new Set(games.map(g => g.date))].map(d => ({ date: d, games: games.filter(g => g.date === d) }));
  const nd = RC.upcoming ? upcomingDays(1)[0] : null, next = nd && dayView(nd) && !dayView(nd).playoff && !dayView(nd).spare ? { date: nd, rows: dayView(nd).rows.filter(r => !r.result).map(r => `${r.home} vs ${r.road}`) } : null;
  const leaders = [];
  if (games.length) {
    const best = (f, label, fmt) => { const r = [...period].sort((a, b) => f(b) - f(a))[0]; if (r && f(r) > 0) leaders.push([label, `${r.name} (${fmt(r)})`]); };
    best(r => r.w + r.otw, 'Most wins', r => r.w + r.otw); best(r => r.gf - r.ga, 'Best goal difference', r => rcSign(r.gf - r.ga)); best(r => r.gf, 'Most goals', r => r.gf); best(r => r.so, 'Shutouts', r => r.so);
    if (blow) leaders.push(['Biggest win', `${win(blow)} ${score(blow)} over ${lose(blow)}`]);
  }
  return { from, to, games, days, dnp, period, monthNow, endMonth, story: story.slice(0, 8), leaders, next, total: games.length };
}

/* ---------- the two formats ---------- */
const rcLine = g => `${g.home} ${g.hg}, ${g.road} ${g.rg}${g.ot ? ' (OT)' : ''}${g.playoff ? ' (playoff)' : ''}`;
function rcText(d) {
  const L = [], pad = (s, n) => String(s).padEnd(n), num = (s, n) => String(s).padStart(n);
  L.push(`${(D.config.leagueName || 'League').toUpperCase()} RECAP`, rcRange(d.from, d.to), '');
  if (!d.total) { L.push('No games were played in these dates.'); return L.join('\n'); }
  L.push('STORYLINES', ...d.story.map(s => `• ${s.text}`), '');
  L.push(`RESULTS (${rcN(d.total, 'game')})`);
  d.days.forEach(day => { L.push(dayLabel(day.date)); day.games.forEach(g => L.push(`  ${rcLine(g)}`)); });
  L.push('', 'STANDINGS FOR THESE DATES', `${pad('#', 3)}${pad('Player', 12)}${pad('Record', 8)}${num('Pts', 4)}${num('GF', 4)}${num('GA', 4)}${num('Diff', 5)}`);
  d.period.forEach((r, i) => L.push(`${pad(i + 1, 3)}${pad(r.name, 12)}${pad(rcRec(r), 8)}${num(r.pts, 4)}${num(r.gf, 4)}${num(r.ga, 4)}${num(rcSign(r.gf - r.ga), 5)}`));
  L.push('', `${monthLabel(d.endMonth).toUpperCase()} STANDINGS (through ${dateLabel(d.to)})`, `${pad('#', 3)}${pad('Player', 12)}${pad('Record', 8)}${num('Pts', 4)}`);
  d.monthNow.filter(r => r.gp).forEach(r => L.push(`${pad(r.rank, 3)}${pad(r.name, 12)}${pad(rcRec(r), 8)}${num(r.pts, 4)}`));
  if (d.leaders.length) L.push('', 'LEADERS', ...d.leaders.map(([k, v]) => `${k}: ${v}`));
  if (d.next && d.next.rows.length) L.push('', `NEXT UP (${dayLabel(d.next.date)})`, ...d.next.rows.map(x => `  ${x}`));
  return L.join('\n');
}
function rcHTML(d) {
  const f = 'font-family:Arial,Helvetica,sans-serif', th = 'padding:6px 10px;background:#0b1f44;color:#ffffff;text-align:left;font-size:12px', td = 'padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px', tdn = td + ';text-align:right';
  const h2 = t => `<h2 style="${f};font-size:15px;color:#0b1f44;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.04em">${t}</h2>`;
  if (!d.total) return `<div style="${f};font-size:14px;color:#111827">${h2(esc(D.config.leagueName || 'League') + ' recap')}<p>${esc(rcRange(d.from, d.to))}</p><p>No games were played in these dates.</p></div>`;
  const table = (heads, rows) => `<table style="border-collapse:collapse;width:100%;max-width:560px;${f}"><thead><tr>${heads.map(([h, r]) => `<th style="${th}${r ? ';text-align:right' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr style="background:${i % 2 ? '#f3f4f6' : '#ffffff'}">${r.map(([v, rt, b]) => `<td style="${rt ? tdn : td}${b ? ';font-weight:700' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return `<div style="${f};font-size:14px;color:#111827;max-width:640px;background:#ffffff">
    <h1 style="${f};font-size:20px;color:#0b1f44;margin:0 0 2px">${esc(D.config.leagueName || 'League')} recap</h1><div style="color:#4b5563;margin-bottom:6px">${esc(rcRange(d.from, d.to))}</div>
    ${h2('Storylines')}<ul style="margin:0;padding-left:20px">${d.story.map(s => `<li style="margin:4px 0">${esc(s.text)}</li>`).join('')}</ul>
    ${h2(`Results (${rcN(d.total, 'game')})`)}${d.days.map(day => `<div style="margin:8px 0 2px;font-weight:700">${esc(dayLabel(day.date))}</div>${day.games.map(g => { const w = g.hg > g.rg; return `<div style="margin:2px 0 2px 12px"><span style="${w ? 'font-weight:700' : ''}">${esc(g.home)} ${g.hg}</span>, <span style="${w ? '' : 'font-weight:700'}">${esc(g.road)} ${g.rg}</span>${g.ot ? ' (OT)' : ''}${g.playoff ? ' (playoff)' : ''}</div>`; }).join('')}`).join('')}
    ${h2('Standings for these dates')}${table([['#'], ['Player'], ['Record'], ['Pts', 1], ['GF', 1], ['GA', 1], ['Diff', 1]], d.period.map((r, i) => [[i + 1], [esc(r.name), 0, 1], [rcRec(r)], [r.pts, 1, 1], [r.gf, 1], [r.ga, 1], [rcSign(r.gf - r.ga), 1]]))}
    ${h2(`${esc(monthLabel(d.endMonth))} standings (through ${esc(dateLabel(d.to))})`)}${table([['#'], ['Player'], ['Record'], ['Pts', 1]], d.monthNow.filter(r => r.gp).map(r => [[r.rank], [esc(r.name), 0, 1], [rcRec(r)], [r.pts, 1, 1]]))}
    ${d.leaders.length ? `${h2('Leaders')}<ul style="margin:0;padding-left:20px">${d.leaders.map(([k, v]) => `<li style="margin:4px 0"><b>${esc(k)}:</b> ${esc(v)}</li>`).join('')}</ul>` : ''}
    ${d.next && d.next.rows.length ? `${h2(`Next up (${esc(dayLabel(d.next.date))})`)}<ul style="margin:0;padding-left:20px">${d.next.rows.map(x => `<li style="margin:4px 0">${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
}

/* ---------- the panel on the Schedule page ---------- */
function recapSection() {
  if (!RC.open) return `<div class="recap-bar"><button class="btn small" type="button" data-recap="open">✉ Email recap</button></div>`;
  if (!RC.from) Object.assign(RC, rcDefaults());
  const d = rcData(RC.from, RC.to), today = todayStr(), first = rcDefaults();
  const quick = [['Last 7 days', rcAdd(today, -6), today], ['Yesterday', rcAdd(today, -1), rcAdd(today, -1)], ['This week', rcAdd(today, -((parseYmd(today).getDay() + 6) % 7)), today], ['This month', today.slice(0, 7) + '-01', today]];
  return `<div class="card recap" id="recap"><div class="recap-head"><b>Email recap</b><button class="link" type="button" data-recap="close">Close</button></div>
    <p class="muted" style="margin:4px 0 12px">Pick two dates to get the games, stats and storylines for that stretch, ready to paste into an email.</p>
    <div class="row2"><label class="f">From<input id="rc-from" type="date" value="${esc(RC.from)}"></label><label class="f">To<input id="rc-to" type="date" value="${esc(RC.to)}"></label></div>
    <div class="chips" style="margin:10px 0 6px">${quick.map(([l, a, b]) => `<button type="button" class="chip" data-recap="range" data-from="${a}" data-to="${b}">${l}</button>`).join('')}</div>
    <label class="check"><input id="rc-up" type="checkbox" ${RC.upcoming ? 'checked' : ''}><span>Include what is coming up next</span></label>
    <div class="btnrow" style="margin:12px 0"><button class="btn" type="button" data-recap="copy-rich">Copy for email</button><button class="btn ghost" type="button" data-recap="copy-text">Copy plain text</button><a class="btn ghost" data-recap="mail" href="#" target="_blank" rel="noopener">Open email draft</a></div>
    <p class="muted recap-note" style="margin:0 0 10px;min-height:1.2em"></p>
    <div class="recap-preview" id="recap-preview">${rcHTML(d)}</div></div>`;
}
const rcRefresh = () => { const el = document.getElementById('recap-preview'); if (el) el.innerHTML = rcHTML(rcData(RC.from, RC.to)); };
const rcNote = msg => { const n = document.querySelector('.recap-note'); if (n) n.textContent = msg; };
async function rcCopy(rich) {
  const d = rcData(RC.from, RC.to), text = rcText(d), html = rcHTML(d);
  try {
    if (rich && window.ClipboardItem && navigator.clipboard.write) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    else if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
    else throw new Error('no clipboard');
    rcNote(rich ? 'Copied. Paste it into your email.' : 'Plain text copied.');
  } catch {
    const box = document.getElementById('recap-preview'), sel = getSelection(), r = document.createRange();           // fall back to selecting the preview so it can be copied by hand
    if (box) { r.selectNodeContents(box); sel.removeAllRanges(); sel.addRange(r); try { document.execCommand('copy'); rcNote('Copied. Paste it into your email.'); } catch { rcNote('Select the recap below and copy it.'); } }
  }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-recap]'); if (!b) return; const a = b.dataset.recap;
  if (a === 'open') { RC.open = true; route(true); setTimeout(() => { const el = document.getElementById('recap'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30); }
  else if (a === 'close') { RC.open = false; route(true); }
  else if (a === 'range') { RC.from = b.dataset.from; RC.to = b.dataset.to; route(true); }
  else if (a === 'copy-rich') rcCopy(true);
  else if (a === 'copy-text') rcCopy(false);
  else if (a === 'mail') { const d = rcData(RC.from, RC.to); let body = rcText(d); const cut = body.length > 1700; if (cut) body = body.slice(0, 1700).replace(/\n[^\n]*$/, '') + '\n…(use "Copy for email" for the full recap)'; b.href = `mailto:?subject=${encodeURIComponent(`${D.config.leagueName || 'League'} recap: ${rcRange(RC.from, RC.to)}`)}&body=${encodeURIComponent(body)}`; if (cut) rcNote('The draft holds the first part (long drafts are cut off). For the full recap with tables, use Copy for email.'); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'rc-from' || e.target.id === 'rc-to') {
    const fi = document.getElementById('rc-from'), ti = document.getElementById('rc-to'); let a = fi.value, b = ti.value; if (!a || !b) return;
    if (a > b) { if (e.target.id === 'rc-from') b = a; else a = b; }          // moving one date past the other drags the other along
    RC.from = a; RC.to = b; fi.value = a; ti.value = b; rcRefresh();
  } else if (e.target.id === 'rc-up') { RC.upcoming = e.target.checked; rcRefresh(); }
});
