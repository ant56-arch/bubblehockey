/* Double-elimination bracket for any number of teams (2 to 32; the league uses up to 20).
   - Seeds are placed in the standard order (1 plays the lowest seed, 2 the next lowest, ...), so the top seeds meet last.
   - When the field is not a power of two, the top seeds get byes in round 1. Byes never create a game.
   - Everyone starts in the winners bracket; a loss drops you into the losers bracket; a second loss ends your run.
   - The winners-bracket champion meets the losers-bracket champion in the grand final. If the losers-bracket champion wins it,
     both have one loss, so there is one more "reset" game. (With 4 teams this is exactly the 7-game format already in use.)
   - Games are numbered in the order they can be played: winners round 1, losers round 1, winners round 2, losers round 2, ...
   No page code is in here, so it can be tested on its own. */

const _bracketCache = {};

/* The shape of the bracket for N teams: its real games in play order, with where each side comes from
   (a seed, the winner of an earlier game, or the loser of one), and the rounds for display. */
function bracketStructure(N) {
  if (!(N >= 2)) return null;
  if (_bracketCache[N]) return _bracketCache[N];
  const P = 2 ** Math.ceil(Math.log2(N)), k = Math.log2(P);
  let order = [1, 2]; for (let size = 4; size <= P; size *= 2) order = order.flatMap(s => [s, size + 1 - s]);      // seed order: 1,P,.. so 1 and 2 are on opposite ends
  const seed = n => ({ t: 'seed', n }), win = id => ({ t: 'W', id }), lose = id => ({ t: 'L', id });
  const WB = (r, i) => `W${r}.${i}`, LB = (r, i) => `L${r}.${i}`, nodes = {};
  const lbRounds = 2 * (k - 1), lbSize = j => P / 2 ** (Math.ceil(j / 2) + 1);

  for (let r = 1; r <= k; r++) for (let i = 0; i < P / 2 ** r; i++)
    nodes[WB(r, i)] = r === 1 ? { a: seed(order[2 * i]), b: seed(order[2 * i + 1]) } : { a: win(WB(r - 1, 2 * i)), b: win(WB(r - 1, 2 * i + 1)) };
  for (let j = 1; j <= lbRounds; j++) for (let i = 0; i < lbSize(j); i++) {
    if (j === 1) nodes[LB(1, i)] = { a: lose(WB(1, 2 * i)), b: lose(WB(1, 2 * i + 1)) };
    else if (j % 2 === 0) {                                                     // losers-bracket winner meets a team dropping out of the winners bracket
      const wbRound = j / 2 + 1, size = lbSize(j), drop = wbRound % 2 === 0 ? size - 1 - i : i;       // alternate the order so rematches are put off
      nodes[LB(j, i)] = { a: lose(WB(wbRound, drop)), b: win(LB(j - 1, i)) };      // the dropped-down team is listed first, as in the 4-team bracket
    } else nodes[LB(j, i)] = { a: win(LB(j - 1, 2 * i)), b: win(LB(j - 1, 2 * i + 1)) };
  }

  /* Which games really exist: a side can only be filled if its source can produce a team, and a node with one fillable side is a bye. */
  const memo = {};
  const stat = id => memo[id] ??= (() => { const nd = nodes[id], ca = can(nd.a), cb = can(nd.b); return { real: ca && cb, pass: ca && cb ? null : ca ? nd.a : cb ? nd.b : null }; })();
  function can(src) { if (src.t === 'seed') return src.n <= N; const s = stat(src.id); return src.t === 'W' ? s.real || s.pass !== null : s.real; }
  const resolve = src => (src.t === 'W' && !stat(src.id).real ? resolve(stat(src.id).pass) : src);

  /* Play order: WB1, LB1, then for each later winners round: that round, then the losers rounds that become available. */
  const seq = [{ kind: 'W', r: 1 }]; if (k >= 2) seq.push({ kind: 'L', r: 1 });
  for (let r = 2; r <= k; r++) { seq.push({ kind: 'W', r }); if (2 * r - 2 <= lbRounds) seq.push({ kind: 'L', r: 2 * r - 2 }); if (2 * r - 1 <= lbRounds) seq.push({ kind: 'L', r: 2 * r - 1 }); }
  const numOf = {}, games = [], rounds = [];
  for (const { kind, r } of seq) {
    const count = kind === 'W' ? P / 2 ** r : lbSize(r), nums = [];
    for (let i = 0; i < count; i++) {
      const id = kind === 'W' ? WB(r, i) : LB(r, i); if (!stat(id).real) continue;
      const n = games.length + 1; numOf[id] = n; nums.push(n);
      const toRef = src => { src = resolve(src); return src.t === 'seed' ? src : { t: src.t, g: numOf[src.id] }; };
      games.push({ n, kind, round: r, a: toRef(nodes[id].a), b: toRef(nodes[id].b) });
    }
    if (nums.length) rounds.push({ kind, round: r, nums, label: kind === 'W' ? (r === k ? 'Winners final' : `Winners round ${r}`) : (r === lbRounds ? 'Losers final' : `Losers round ${r}`) });
  }
  const refTo = src => { src = resolve(src); return src.t === 'seed' ? src : { t: src.t, g: numOf[src.id] }; };
  const ga = refTo(win(WB(k, 0))), gb = refTo(k >= 2 ? win(LB(lbRounds, 0)) : lose(WB(1, 0)));
  const gf = { n: games.length + 1, kind: 'GF', round: 0, a: ga, b: gb }; games.push(gf);
  const reset = { n: games.length + 1, kind: 'RESET', round: 0, a: ga, b: gb }; games.push(reset);
  rounds.push({ kind: 'GF', round: 0, nums: [gf.n, reset.n], label: 'Grand final' });
  return (_bracketCache[N] = { N, P, games, rounds, gf: gf.n, reset: reset.n });
}

const srcLabel = src => (src.t === 'seed' ? `Seed ${src.n}` : `${src.t === 'W' ? 'Winner' : 'Loser'} G${src.g}`);

/* Fill the bracket in with real teams. seeds = team names in seed order; data = { g<number>: winner name }. */
function bracketModel(seeds, data) {
  const S = bracketStructure(seeds.length);
  if (!S) return { G: {}, list: [], rounds: [], champion: '', seeds, S: null };
  const G = {}, who = src => (src.t === 'seed' ? seeds[src.n - 1] || '' : src.t === 'W' ? G[src.g].w : G[src.g].l);
  for (const gm of S.games) {
    const a = who(gm.a), b = who(gm.b), pick = data['g' + gm.n];
    const w = a && b && pick && (pick === a || pick === b) ? pick : '';
    G[gm.n] = { n: gm.n, kind: gm.kind, round: gm.round, a, b, w, l: w ? (w === a ? b : a) : '', sa: gm.a.t === 'seed' ? gm.a.n : 0, sb: gm.b.t === 'seed' ? gm.b.n : 0, la: srcLabel(gm.a), lb: srcLabel(gm.b), skipped: false };
  }
  const gf = G[S.gf], rs = G[S.reset];
  rs.a = gf.a; rs.b = gf.b; rs.w = gf.w && gf.w === gf.b && data['g' + S.reset] && [rs.a, rs.b].includes(data['g' + S.reset]) ? data['g' + S.reset] : '';
  rs.l = rs.w ? (rs.w === rs.a ? rs.b : rs.a) : '';
  const needReset = !!gf.w && gf.w === gf.b;                                        // the team coming through the losers bracket won, so it takes one more game
  if (gf.w && !needReset) rs.skipped = true;
  const champion = gf.w && !needReset ? gf.w : (rs.w || '');
  return { G, list: S.games.map(g => g.n), rounds: S.rounds, champion, seeds, S };
}
