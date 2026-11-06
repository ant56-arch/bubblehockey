/* Quick hide for the Resources page. The "Hide screen" button (or the Esc key) covers the whole window with a made-up desktop mail client:
   folders, an inbox, and a reading pane. Esc again (or a click on the round profile picture, top right) brings the page back.
   While it is showing, sounds are muted and the tab title and icon change. Everything in it is invented sample text; it uses no company names or logos. */

const BOSS = { on: false, title: '', icon: '', sel: 0, folder: 'inbox' };
const BX_PEOPLE = [['Priya Raman', 'PR', '#7b5ea7'], ['Marcus Hale', 'MH', '#2e7d6b'], ['Dana Whitfield', 'DW', '#c2561a'], ['Facilities', 'FA', '#4a6fa5'], ['Sam Okafor', 'SO', '#a63d6a'], ['Helen Park', 'HP', '#5b7f2a'], ['Accounts Payable', 'AP', '#6b5b95'], ['Jordan Lee', 'JL', '#b0702f']];
const BX_MAIL = {
  inbox: [
    [0, 'Q4 planning: agenda and pre-reads', 'Hi all, attached is the agenda for Thursday. Please skim the pre-reads and add any topics to the shared doc before then.', 0, 1],
    [1, 'Re: Vendor invoice 2231', 'Thanks for flagging this. I checked with purchasing and the PO number on the invoice needs to be corrected before we can approve it.', 0, 1],
    [2, 'Weekly sync: notes and action items', 'Notes from today are below. Action items are assigned in the table at the bottom. Let me know if I missed anything.', 0, 0],
    [3, 'Reminder: timesheets due Friday', 'This is a friendly reminder that timesheets for this period are due by end of day Friday. Late submissions roll into the next cycle.', 1, 0],
    [4, 'Slides for the Monday review', 'I tightened up the deck and moved the budget slide to the end. Take a look when you get a minute and send me any comments.', 0, 1],
    [5, 'Team lunch on the 18th?', 'Thinking of booking a table for the team. Does the 18th work for everyone? Reply with any dietary needs.', 0, 0],
    [6, 'Payment confirmation', 'Your payment has been processed. No further action is needed. A copy of the remittance advice is attached for your records.', 0, 0],
    [7, 'Re: Customer follow-up', 'I will call them tomorrow morning and send a short summary afterwards. Please hold off on the proposal until then.', 0, 0],
    [3, 'Parking lot resurfacing, building B', 'The east lot will be closed Saturday for resurfacing. Please use the west lot or the visitor garage. Thank you for your patience.', 1, 0],
    [0, 'Draft: onboarding checklist', 'First pass at the new onboarding checklist. Mostly consolidating what we already do. Comments welcome before I share it wider.', 0, 0],
    [1, 'Out of office next week', 'I will be out Monday through Wednesday with limited access to email. For anything urgent, please contact Dana.', 0, 0],
    [4, 'Fwd: Updated travel policy', 'Forwarding the updated policy for your reference. The main change is the booking window; see section 3.', 0, 0],
  ],
  sent: [
    [0, 'Re: Q4 planning: agenda and pre-reads', 'Thanks, I will add two items to the shared doc. See you Thursday.', 0, 0],
    [1, 'Re: Vendor invoice 2231', 'Understood. I have sent the corrected PO number to purchasing and copied you.', 0, 0],
    [2, 'Meeting follow-up', 'Great talking today. Summary and next steps are below; shout if I got anything wrong.', 0, 0],
  ],
  drafts: [[5, 'Re: Team lunch on the 18th?', 'That works for me. Could we try somewhere close to the office this time?', 0, 0]],
  deleted: [[6, 'Weekly newsletter', 'This week in the office: new coffee machine, quarterly all-hands, and a reminder about badge renewals.', 0, 0]],
};
const BX_FOLDERS = [['inbox', 'Inbox'], ['sent', 'Sent Items'], ['drafts', 'Drafts'], ['deleted', 'Deleted Items']];
const bxDay = i => { const d = new Date(); d.setDate(d.getDate() - i); return i === 0 ? '' : i === 1 ? 'Yesterday' : d.toLocaleDateString('en', { weekday: 'short', month: 'numeric', day: 'numeric' }); };
const bxWhen = k => { const hours = ['10:12 AM', '9:42 AM', '8:56 AM', '8:17 AM', 'Yesterday', 'Yesterday', 'Yesterday', bxDay(2), bxDay(2), bxDay(3), bxDay(4), bxDay(5)]; return hours[k % hours.length]; };
const bxBody = (m, name) => `<p>Hi,</p><p>${m[2]}</p><p>${['If you have questions, just reply to this message.', 'Let me know if anything looks off.', 'Happy to talk it through if that is easier.'][(m[1].length) % 3]}</p><p>Thanks,<br>${name.split(' ')[0]}</p>`;

function bxHTML() {
  const list = BX_MAIL[BOSS.folder] || BX_MAIL.inbox, unread = BX_MAIL.inbox.filter((m, i) => m[4]).length;
  const sel = Math.min(BOSS.sel, list.length - 1), cur = list[sel], who = BX_PEOPLE[cur[0]];
  return `<div class="bx" role="application" aria-label="Mail">
    <div class="bx-top"><span class="bx-app">Mail</span><div class="bx-search">Search</div><span class="bx-grow"></span><span class="bx-ic">⚙</span><button class="bx-me" data-bx-exit type="button" aria-label="Account">AB</button></div>
    <div class="bx-body">
      <nav class="bx-rail"><b class="bx-on">✉</b><b>▦</b><b>☺</b><b>✓</b></nav>
      <aside class="bx-folders"><div class="bx-fh">Favorites</div>${BX_FOLDERS.map(([k, l]) => `<div class="bx-f ${BOSS.folder === k ? 'on' : ''}" data-bx-folder="${k}"><span>${l}</span>${k === 'inbox' && unread ? `<em>${unread}</em>` : ''}${k === 'drafts' ? `<em>${BX_MAIL.drafts.length}</em>` : ''}</div>`).join('')}<div class="bx-fh" style="margin-top:14px">Folders</div><div class="bx-f"><span>Archive</span></div><div class="bx-f"><span>Projects</span></div><div class="bx-f"><span>Junk Email</span></div></aside>
      <section class="bx-list"><div class="bx-ribbon"><span class="bx-btn bx-new">✉ New mail</span><span class="bx-btn">🗑 Delete</span><span class="bx-btn">▣ Archive</span><span class="bx-btn">↩ Reply</span></div>
        <div class="bx-lh"><b>${BX_FOLDERS.find(f => f[0] === BOSS.folder)[1]}</b><span>Filter ▾</span></div>
        <div class="bx-items">${list.map((m, i) => { const p = BX_PEOPLE[m[0]]; return `<div class="bx-item ${i === sel ? 'on' : ''} ${m[4] && BOSS.folder === 'inbox' && !(BOSS.read || {})[i] ? 'unread' : ''}" data-bx-msg="${i}"><span class="bx-av" style="background:${p[2]}">${p[1]}</span><div class="bx-it"><div class="bx-r1"><b>${p[0]}</b><small>${bxWhen(i)}</small></div><div class="bx-sub">${m[1]}</div><div class="bx-pre">${m[2]}</div></div></div>`; }).join('')}</div></section>
      <section class="bx-read"><h2>${cur[1]}</h2><div class="bx-from"><span class="bx-av big" style="background:${who[2]}">${who[1]}</span><div><b>${who[0]}</b><div class="bx-to">To: You</div></div><small>${bxWhen(sel)}</small></div><div class="bx-text">${bxBody(cur, who[0])}${cur[3] ? '<div class="bx-attach">📎 Attachment.pdf</div>' : ''}</div></section>
    </div><div class="bx-status">Connected to server<span class="bx-grow"></span>${list.length} items</div></div>`;
}
function bossToggle(force) {
  const on = typeof force === 'boolean' ? force : !BOSS.on; if (on === BOSS.on) return; BOSS.on = on;
  let el = document.getElementById('bx-root');
  if (on) {
    BOSS.title = document.title; const ic = document.querySelector('link[rel~=icon]'); BOSS.icon = ic ? ic.href : '';
    if (!el) { el = document.createElement('div'); el.id = 'bx-root'; document.body.appendChild(el); }
    BOSS.folder = 'inbox'; BOSS.sel = 0; BOSS.read = {}; el.innerHTML = bxHTML(); el.hidden = false; document.documentElement.classList.add('bx-lock');
    document.title = `Inbox (${BX_MAIL.inbox.filter(m => m[4]).length}) - Mail`;
    if (ic) ic.href = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0f6cbd"/><rect x="6" y="9" width="20" height="14" rx="2" fill="#fff"/><path d="M6 11l10 7 10-7" fill="none" stroke="#0f6cbd" stroke-width="2"/></svg>');
    try { SGA.audio && SGA.audio.suspend && SGA.audio.suspend(); } catch { }
  } else {
    if (el) el.hidden = true; document.documentElement.classList.remove('bx-lock'); document.title = BOSS.title;
    const ic = document.querySelector('link[rel~=icon]'); if (ic && BOSS.icon) ic.href = BOSS.icon;
    try { SGA.audio && SGA.audio.resume && SGA.audio.resume(); } catch { }
  }
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.repeat) return;
  if (BOSS.on) { e.preventDefault(); bossToggle(false); } else if (document.getElementById('sg')) { e.preventDefault(); bossToggle(true); }       // Esc hides, but only on the Resources page
});
document.addEventListener('click', e => {
  if (e.target.closest('[data-boss]')) { bossToggle(true); return; }
  const root = document.getElementById('bx-root'); if (!BOSS.on || !root || !root.contains(e.target)) return;
  if (e.target.closest('[data-bx-exit]')) { bossToggle(false); return; }
  const f = e.target.closest('[data-bx-folder]'); if (f) { BOSS.folder = f.dataset.bxFolder; BOSS.sel = 0; root.innerHTML = bxHTML(); return; }
  const m = e.target.closest('[data-bx-msg]'); if (m) { BOSS.sel = +m.dataset.bxMsg; BOSS.read = { ...(BOSS.read || {}), [BOSS.sel]: 1 }; root.innerHTML = bxHTML(); }
});
window.addEventListener('hashchange', () => { if (BOSS.on && !/^#\/(resources|games)/.test(location.hash)) bossToggle(false); });
