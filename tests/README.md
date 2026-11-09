# Browser tests

These tests drive the real site in a headless Chromium browser (Playwright) and check the behavior the league relies on: the schedule and playoff bracket, the editors in Add / Edit (against a pretend GitHub), standings and records, the Schedule page and Email recap, the mini games, and the quick-hide screen.

## Running them
```
npm install --no-save playwright
npx playwright install chromium
node tests/run.js            # every test file
node tests/run.js recap      # only files whose name contains "recap"
```
`run.js` serves the site from the repository root on a free port and runs each file; a test prints `PASS`/`FAIL` lines and the runner exits non-zero if anything failed. A file can also be run by hand with the site already served: `BASE_URL=http://localhost:8000 node tests/recap.js`.

The online-play test needs a local PeerJS server (`npm install --no-save peer peerjs`, then run a `PeerServer` on port 9000) and only runs with `ONLINE=1`.

## Notes
- Every browser context gets an empty `data/schedule.json` (see `support.js`), so saved days off or playoff dates do not change the results.
- Most tests build their own members, games and settings and serve them to the page, so they do not depend on the league's real data. A few (`regression.js`, `schedule-editor.js`, `rules-editor.js`, `connection-test.js`) read the real files in `data/` and use dates relative to the newest game; if the league changes a lot (for example many more members), a count in one of them may need updating.
- Run them before publishing a change. Nothing here changes the site or its data.
