/* Members tab: a profile for each team with titles, career record, playoff record, month by month, and head to head.
   Everything is calculated from data/games.json. */

const signed = n => (n > 0 ? '+' : '') + n;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* Playoff history for one player across all months that have playoff games. */
function playoffRecord(name) {
  const out = { w: 0, l: 0, titles: [], finals: 0, runnerUps: 0 };
  for (const m of [...new Set(D.games.filter(g => g.playoff).map(g => g.month))].sort()) {
    const { G, champion } = buildBracket(m);
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      const g = G[n]; if (g.skipped || !g.w || ![g.a, g.b].includes(name)) continue;
      g.w === name ? out.w++ : out.l++;
    }
    if ([G[6].a, G[6].b].includes(name) && G[6].a && G[6].b) { out.finals++; if (champion === name) out.titles.push(m); else if (champion) out.runnerUps++; }
  }
  return out;
}

/* Career numbers that the standings table does not have: best win, longest win streak, head to head, month by month. */
function playerProfile(name) {
  const mine = D.games.filter(g => isCounted(g) && (g.home === name || g.road === name)).sort(cmpOld);
  const won = g => (g.home === name) === (g.hg > g.rg), opp = g => (g.home === name ? g.road : g.home);
  let best = null, run = 0, longest = 0; const h2h = {};
  for (const g of mine) {
    const o = opp(g), mf = g.home === name ? g.hg : g.rg, oa = g.home === name ? g.rg : g.hg, h = h2h[o] ??= { w: 0, l: 0, gf: 0, ga: 0 };
    h.gf += mf; h.ga += oa;
    if (won(g)) { h.w++; run++; longest = Math.max(longest, run); if (!best || mf - oa > best.margin) best = { margin: mf - oa, score: `${mf}–${oa}`, o, date: g.date }; }
    else { h.l++; run = 0; }
  }
  const months = [...new Set(mine.map(g => g.month))].sort().reverse().map(m => {
    const table = standingsFor(monthGames(m)), i = table.findIndex(r => r.name === name), r = table[i];
    return { m, rank: i + 1, of: table.filter(x => x.gp).length, r, champ: championOf(m) === name };
  });
  return { best, longest, h2h, months, po: playoffRecord(name) };
}

view.members = function () {
  const ini = n => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const career = Object.fromEntries(standingsFor(D.games.filter(isCounted)).map(r => [r.name, r]));
  const now = standingsFor(monthGames(cur()));
  const titleCount = m => playoffRecord(m.short_name).titles.length;
  const cards = D.members.map(m => {
    const n = m.short_name, c = career[n], p = playerProfile(n), po = p.po, wins = c.w + c.otw, pos = now.findIndex(r => r.name === n) + 1, played = c.gp > 0;
    const trophy = po.titles.length
      ? `🏆 <b>${plural(po.titles.length, 'championship')}</b> <span class="muted">· ${po.titles.map(monthLabel).join(', ')}</span>`
      : '<span class="muted">🏆 No championships yet</span>';
    const kv = rows => `<div class="kv">${rows.map(([k, v]) => `<div class="kvr"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
    /* A drop-down section: closed until tapped, with a one-line hint of what is inside. */
    const sub = (title, hint, body) => `<details class="sub"><summary><span>${title}</span><span class="hint">${hint}</span></summary><div class="inner">${body}</div></details>`;
    const logos = [[m.logo, 'Primary'], [m.alt_logo, 'Alternate']].filter(x => x[0]);
    const showcase = logos.length ? `<div class="showcase ${logos.length === 1 ? 'one' : ''}">${logos.map(([src, cap]) => `<figure><img src="${esc(src)}" alt="${esc(m.team_name)} ${cap.toLowerCase()} logo" loading="lazy"><figcaption>${cap}</figcaption></figure>`).join('')}</div>` : '';
    return `<details class="card mcard"><summary>
      <div class="mtop">${m.logo ? `<img class="mlogo" src="${esc(m.logo)}" alt="${esc(m.team_name)} logo" loading="lazy">` : `<div class="avatar">${esc(ini(m.name))}</div>`}
        <div class="minfo"><b class="mname">${esc(m.name)}</b><div class="team">${esc(m.team_name)}</div>
          <div class="muted nowline">${po.titles.length ? `🏆 ${plural(po.titles.length, 'championship')} · ${po.titles.map(monthLabel).join(', ')}` : 'No championships yet'}</div></div></div>
      <div class="tiles">
        <div class="tile"><b>${wins}-${c.l}-${c.otl}</b><span>Record</span></div>
        <div class="tile"><b>${played ? pct(wins / c.gp) : '–'}</b><span>Win %</span></div>
        <div class="tile"><b>${c.pts}</b><span>Points</span></div>
        <div class="tile"><b>${signed(c.gf - c.ga)}</b><span>Goal diff</span></div>
      </div>
      <span class="more">${cur() && now[pos - 1]?.gp ? `#${pos} in ${monthLabel(cur())} · ` : ''}Tap for the full profile</span></summary>
      <div class="inner">
        ${showcase}
        <p class="muted" style="margin:10px 0 2px">${esc(m.team_name)}${m.established ? ` · established ${dateLabel(m.established)}` : ''}${played ? ` · ${(c.pts / c.gp).toFixed(2)} points per game` : ''}</p>
        ${sub('Career stats', played ? `${c.gp} games` : 'no games yet', kv([
          ['Games played', c.gp], ['Wins (overtime wins)', `${wins} (${c.otw})`], ['Losses (overtime losses)', `${c.l + c.otl} (${c.otl})`],
          ['Goals for / against', `${c.gf} / ${c.ga}`], ['Shots for / against', c.sf || c.sa ? `${c.sf} / ${c.sa}` : '–'],
          ['Shooting %', c.sf ? pct(c.gf / c.sf) : '–'], ['Save %', c.sa ? pct(1 - c.ga / c.sa) : '–'], ['Shutouts', c.so],
          ['Home record', `${c.hw}-${c.hl}`], ['Road record', `${c.rw}-${c.rl}`], ['Current streak', c.streak], ['Longest win streak', p.longest || '–'],
          ['Biggest win', p.best ? `${p.best.score} vs ${esc(p.best.o)} (${dateLabel(p.best.date)})` : '–'],
          ['Did not play (DNP)', allDnp().filter(g => g.home === n || g.road === n).length]]))}
        ${sub('Playoffs', po.titles.length ? plural(po.titles.length, 'title') : po.w + po.l ? `${po.w}-${po.l}` : 'none yet', kv([['Championships', po.titles.length ? `${po.titles.length} (${po.titles.map(monthLabel).join(', ')})` : '0'], ['Finals', po.finals ? `${po.finals} (${plural(po.titles.length, 'title')}, ${plural(po.runnerUps, 'runner-up')})` : '–'], ['Playoff games', po.w + po.l ? `${po.w}-${po.l}` : '–']]))}
        ${sub('Month by month', plural(p.months.length, 'month'), p.months.length ? `<div class="table-scroll"><table><thead><tr><th>Month</th><th class="n">Finish</th><th class="n">Record</th><th class="n">Pts</th></tr></thead><tbody>${
          p.months.map(x => `<tr><td>${monthLabel(x.m)}${x.champ ? ' 🏆' : ''}</td><td class="n">${x.rank ? '#' + x.rank + ' of ' + x.of : '–'}</td><td class="n nowrap">${x.r.w + x.r.otw}-${x.r.l}-${x.r.otl}</td><td class="n">${x.r.pts}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No games yet.</p>')}
        ${sub('Head to head', plural(Object.keys(p.h2h).length, 'opponent'), Object.keys(p.h2h).length ? `<div class="table-scroll"><table><thead><tr><th>Opponent</th><th class="n">W-L</th><th class="n">Goals</th></tr></thead><tbody>${
          Object.entries(p.h2h).sort((x, y) => x[0].localeCompare(y[0])).map(([o, h]) => `<tr><td>${who(o, 22)}</td><td class="n nowrap">${h.w}-${h.l}</td><td class="n nowrap">${h.gf}–${h.ga}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No games yet.</p>')}
      </div></details>`;
  });
  const champs = D.members.map(m => [m.short_name, titleCount(m)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
  return `<h1>Members</h1><p class="lead">${D.members.length} players${champs.length ? ` · most championships: ${champs.filter(x => x[1] === champs[0][1]).map(x => esc(x[0])).join(', ')} (${champs[0][1]})` : ''}. Tap a card for the full profile.</p><div class="grid members">${cards.join('')}</div>`;
};
