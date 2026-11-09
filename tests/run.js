/* Runs the browser tests in this folder against the site served from the repository root.
   Usage:  node tests/run.js            (all tests)
           node tests/run.js recap      (only test files whose name contains "recap")
   It needs the Playwright package and its Chromium browser:  npm install --no-save playwright && npx playwright install chromium
   The online-play test also needs the "peer" package and a local PeerJS server, so it only runs with ONLINE=1 (see tests/README.md). */
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.resolve(__dirname, '..'), types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.csv': 'text/csv', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(p).pipe(res);
});
const run = (file, base) => new Promise(resolve => {      // asynchronous, so this process can keep serving the pages while the test runs
  let out = ''; const c = spawn(process.execPath, [path.join(__dirname, file)], { cwd: root, env: { ...process.env, BASE_URL: base } }), kill = setTimeout(() => c.kill(), 600000);
  c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d); c.on('close', code => { clearTimeout(kill); resolve({ code, out }); });
});
server.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`, only = process.argv[2] || '';
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && f !== 'run.js' && f !== 'support.js' && f.includes(only) && (f !== 'online.js' || process.env.ONLINE === '1')).sort();
  const failed = [];
  for (const f of files) {
    const t0 = Date.now(), { code, out } = await run(f, base);
    const bad = code !== 0 || /^FAIL /m.test(out) || /FAILED/.test(out), lines = out.split('\n').filter(l => /^FAIL /.test(l) || /FAILED/.test(l) || /Error/.test(l)).slice(0, 6);
    console.log(`${bad ? '✖' : '✔'} ${f} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); lines.forEach(l => console.log('    ' + l.slice(0, 220)));
    if (bad) failed.push(f);
  }
  console.log(failed.length ? `\n${failed.length} of ${files.length} test files failed: ${failed.join(', ')}` : `\nAll ${files.length} test files passed.`);
  server.close(); process.exit(failed.length ? 1 : 0);
});
