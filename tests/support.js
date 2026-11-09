/* Shared by the tests: launches the browser and gives every browser context a clean data/schedule.json (no saved schedule edits), so the tests do not
   depend on whatever days off or playoff dates the league has saved. A test that needs a different schedule.json routes it on its page, which wins. */
const { chromium } = require('playwright');
exports.launch = async opts => {
  const b = await chromium.launch(opts), make = b.newContext.bind(b);
  b.newContext = async o => { const c = await make(o); await c.route('**/data/schedule.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ daysOff: [], playoffDates: {}, overrides: [] }) })); return c; };
  return b;
};
