const fs = require('fs'), vm = require('vm');
const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync('js/bracket.js', 'utf8') + '\nthis.bracketStructure = bracketStructure; this.bracketModel = bracketModel;', ctx);
const { bracketStructure, bracketModel } = ctx;
let fails = 0; const ok = (n, c, x = '') => { if (!c) { fails++; console.log('FAIL ' + n + (x ? ' — ' + x : '')); } };
let seedrng = 12345; const rnd = () => (seedrng = (seedrng * 1664525 + 1013904223) % 4294967296) / 4294967296;

// 1. N=4 must be exactly the format already in use
{
  const S = bracketStructure(4), g = n => S.games.find(x => x.n === n), L = r => r.t === 'seed' ? 'S' + r.n : r.t + r.g;
  const got = S.games.map(x => `${x.n}:${x.kind}:${L(x.a)}v${L(x.b)}`).join(' ');
  const want = '1:W:S1vS4 2:W:S2vS3 3:L:L1vL2 4:W:W1vW2 5:L:L4vW3 6:GF:W4vW5 7:RESET:W4vW5';
  ok('N=4 reproduces the existing 7-game bracket exactly', got === want, got);
}
// 2. structure for every size
for (let N = 2; N <= 32; N++) {
  const S = bracketStructure(N), real = S.games.filter(g => g.kind === 'W' || g.kind === 'L');
  ok(`N=${N}: ${2 * N - 3} games before the grand final (${2 * N - 2} with it)`, real.length === 2 * N - 3, `${real.length} games`);
  const seedsUsed = {}; for (const g of S.games) for (const s of [g.a, g.b]) { if (s.t === 'seed') seedsUsed[s.n] = (seedsUsed[s.n] || 0) + 1; else ok(`N=${N}: sources point at earlier games`, s.g < g.n, `game ${g.n} <- ${s.t}${s.g}`); }
  ok(`N=${N}: every seed enters exactly once`, Object.keys(seedsUsed).length === N && Object.values(seedsUsed).every(c => c === 1));
  ok(`N=${N}: nobody plays themselves`, S.games.every(g => !(g.a.t === g.b.t && (g.a.n ?? g.a.g) === (g.b.n ?? g.b.g))));
  // byes: top seeds skip round 1
  const r1 = S.games.filter(g => g.kind === 'W' && g.round === 1); const P = S.P; ok(`N=${N}: round-1 games = N - P/2`, r1.length === N - P / 2 || (P === N && r1.length === N / 2), `${r1.length}`);
  // each non-GF game's feeders: a W or L source is used at most once overall (a team goes one place)
  const used = {}; for (const g of S.games.filter(x => x.kind !== 'RESET')) for (const s of [g.a, g.b]) if (s.t !== 'seed') { const key = s.t + s.g; used[key] = (used[key] || 0) + 1; }
  ok(`N=${N}: no game result is used twice`, Object.values(used).every(c => c === 1), JSON.stringify(Object.entries(used).filter(e => e[1] > 1)));
}
// 3. play random brackets to the end
let sims = 0, resets = 0, rematchBeforeFinal = 0;
for (let N = 2; N <= 32; N++) for (let run = 0; run < 150; run++) {
  const seeds = Array.from({ length: N }, (_, i) => 'T' + (i + 1)), data = {}, losses = Object.fromEntries(seeds.map(s => [s, 0])), played = [];
  const upset = rnd() * 0.6;                                                                 // how often the lower seed wins
  for (let guard = 0; guard < 200; guard++) {
    const m = bracketModel(seeds, data);
    const open = m.list.map(n => m.G[n]).filter(g => g.a && g.b && !g.w && !g.skipped);
    if (!open.length) break;
    const g = open[0], ai = +g.a.slice(1), bi = +g.b.slice(1), strongA = ai < bi, aWins = rnd() < (strongA ? 1 - upset / 2 : upset / 2);
    data['g' + g.n] = aWins ? g.a : g.b; played.push([g.a, g.b, g.kind]);
  }
  const m = bracketModel(seeds, data); sims++;
  ok(`N=${N}: a champion is decided`, !!m.champion);
  const done = m.list.map(n => m.G[n]).filter(g => g.w);
  done.forEach(g => losses[g.l]++);
  const gf = m.G[m.S.gf], reset = gf.w === gf.b; if (reset) resets++;
  ok(`N=${N}: ${2 * N - 2} games, or ${2 * N - 1} with a reset`, done.length === 2 * N - 2 + (reset ? 1 : 0), `${done.length} played`);
  const others = seeds.filter(s => s !== m.champion);
  ok(`N=${N}: every other team lost exactly twice`, others.every(s => losses[s] === 2), JSON.stringify(losses));
  ok(`N=${N}: the champion lost at most once`, losses[m.champion] <= 1, `${losses[m.champion]}`);
  ok(`N=${N}: no skipped game was played`, m.list.every(n => !(m.G[n].skipped && m.G[n].w)));
  const seen = new Set(); for (const [a, b, kind] of played) { const key = [a, b].sort().join('|'); if (seen.has(key) && kind !== 'RESET' && kind !== 'GF') rematchBeforeFinal++; seen.add(key); }
}
console.log(`simulated ${sims} full brackets (2-32 teams); ${resets} needed the grand-final reset; rematches before the final: ${rematchBeforeFinal}`);
console.log(fails ? fails + ' FAILED CHECKS' : 'ALL BRACKET CHECKS PASSED');
