# Bubble Hockey League

A small static website (no build step, no login, no backend, nothing to pay for) hosted on GitHub Pages. Tabs: Home, Rules, Members, Schedule, Game Log, Standings, Playoffs, Add Game. Game Log, Standings and Playoffs each have month buttons for the current and past months.

Everything is calculated from one file, **`data/games.json`**: standings, the game log, per-player records for every month, the schedule's results and the playoff brackets. The current month is simply today's month, so the game log and standings reset by themselves on the 1st.

## Adding, editing and deleting games

### From the website (the **Add / Edit** tab)
Connect once, then add, edit and delete games right on the site.
1. **Connect (once per device, about two minutes):** the tab has a "Connect once to save changes" card with the steps. Tap **Open GitHub** (it opens GitHub's new-token page with the name, owner, 1-year expiry and Contents permission already filled in), choose **Only select repositories** and pick this repo, tap **Generate token**, copy it, then come back, tap **Paste** and **Connect**. It is a *fine-grained* token limited to this one repository. It is kept only in that browser (**Disconnect** removes it), and you renew it once a year (the tab tells you when it stops working). A classic token set to never expire also works.
2. **Add:** fill in the form and tap **Save game**. Tick **Did not play (DNP)** for a game that was not played, or **Playoff game** for a playoff game.
3. **Edit or delete:** the games are listed on the tab by month (visible even before you connect). Tap **Edit** (the game loads into the form; change it and tap **Save changes**) or **Delete** (asks first). Saving before connecting just points you at the connect steps.

4. **Members & teams:** tap **Members & teams** at the top of the tab. Tap **Edit** on a member to change the full name, team name, established date or logos (the short name is locked because every game uses it), or fill in the form at the bottom to **add a member**. Logos are shrunk on your phone and saved into `images/teams/`; a new logo can take a minute longer than the text to show on the site. Only that member's line in `data/members.csv` changes. There is no delete for members (it would break their past games); to retire one, ask for help. A new player is scheduled from their **established** date on, so adding someone never changes past schedule days.

Each save is a commit to `data/games.json` (or `data/members.csv` / `images/teams/`), so the public site updates about a minute later (a connected phone reads the newest data straight from GitHub, so it shows your save immediately everywhere on the site while everyone else catches up) and GitHub's **History** keeps every earlier version. Saves change only the one line involved and leave the rest of the file untouched. If someone changed the file in between, the tab refuses and refreshes instead of hitting the wrong game. Without a token the form still works: it builds a line to copy (below).

### By hand (the same file)
Open `data/games.json` on GitHub, tap the pencil (Edit), copy the last game line, paste it below and change the values. Every game line ends with a comma except the very last one.

```json
{ "date": "2026-11-03", "home": "Tommy", "road": "Connor", "homeScore": 4, "roadScore": 2 }
```

| Field | Required | Notes |
|---|---|---|
| `date` | yes | `YYYY-MM-DD` |
| `home`, `road` | yes | the short names exactly as in `data/members.csv` (Tommy, Connor, Trotta, Boban) |
| `homeScore`, `roadScore` | yes | final score; games cannot end tied (include the overtime goal) |
| `overtime` | no | `true` if decided in overtime (changes points: 2 for an OT win, 1 for an OT loss) |
| `homeShots`, `roadShots` | no | used for the shot stats |
| `playoff` | no | `true` for a playoff game (see below) |
| `winner` | no | for a playoff game with no score |
| `dnp` | no | `true` for a scheduled game that was **not played** (no scores): it shows as DNP in the Game Log and Schedule and never changes the standings |

Without connecting, the Add / Edit tab builds the line for you: fill in the form, tap **Copy**, edit `data/games.json`, tap at the end of the last game line (right after its `}`), paste, and commit.

**To edit or delete by hand:** change the numbers on that game's line, or delete the whole line (if you delete the last game, remove the comma from the end of the new last line). On the file's page, **History** shows earlier versions.

### Games that were not played (DNP)
```json
{ "date": "2026-11-10", "home": "Connor", "road": "Boban", "dnp": true }
```
It appears in the Game Log and on the Schedule marked **DNP** (and in the player's "Did not play" count), and does not count in any record.

**Automatic DNP (from November 2026):** with `"autoDnpFrom": "2026-11-01"` in the `schedule` settings of `data/config.json`, any scheduled regular game on a *past* day that was never logged is shown as DNP automatically (shown on the Schedule, in the Game Log and in the "Did not play" count; never counted in the standings). It only applies on days where at least one game was logged (a day with nothing logged is simply left out), never to today or the future, and never before that date. Change the date, or remove the setting, to turn it off. It assumes the schedule is what you follow, so a game logged between the same two players on that day cancels the DNP whichever side was home.

### Playoffs (any number of teams, up to 20)
Every month all the teams (up to 20) are seeded by their regular-season standings into a **double-elimination bracket**, and the bracket sizes itself to the league: with 4 teams it is the 7-game format already in use, with 20 teams it is 38 games.
- **Seeds and byes:** seed 1 plays the lowest seed, 2 the next lowest, and so on. If the number of teams is not a power of two, the top seeds skip round 1 (20 teams: seeds 1 to 12 get a bye and 8 teams play round 1).
- **Losing once** drops you into the losers bracket; **losing twice** ends your run.
- **Grand final:** the winners-bracket champion plays the losers-bracket champion. If the losers-bracket champion wins, both teams have one loss, so there is one more game (game 2 of the grand final). Otherwise that game is "not needed".
- **Game numbers** follow the order games can be played (winners round 1, losers round 1, winners round 2, ...). Games whose teams are not known yet say where they come from ("Winner G25", "Loser G23").
- **Smaller field:** in `data/config.json`, `"playoffs": { "teams": 8 }` keeps only the top 8. Without it, every team (up to 20) plays. Teams that joined after a month ended are not in that month's field.
- **Days:** the playoffs take **2 game days, or 3 days when 15 or more teams play** (20 teams is about 13 games a day over 3 days), and the schedule spreads the games over them. To force a number, set `schedule.playoffDays` (0 to 5) in `data/config.json`; leave it out for the automatic rule.
- **Ties in the standings** (which decide the seeds) are broken by points, then goal difference, then goals for. If teams are still level after that, they are ordered alphabetically; to seed such teams differently, use `playoffSeeds` below.

Add playoff games to the same file with `"playoff": true`; they **still count in the standings and everyone's records** (the Game Log tags them "Playoff"):
```json
{ "date": "2026-11-25", "home": "Connor", "road": "Boban", "homeScore": 4, "roadScore": 1, "playoff": true }
```
The Playoffs tab matches each playoff game to the next open bracket game with the same two players, so enter them in the order they were played (the Add / Edit tab has a **Playoff game** box). A playoff game that does not fit the bracket (wrong players for the next open game, or a game that was not needed) shows up in the yellow warning box. Seeds come from the standings of the month's non-playoff games. To force the seeds for a month, add `"playoffSeeds": { "2026-10": ["Connor", "Trotta", "Tommy", "Boban"] }` (as October has; any number of teams from 2 to 20, in seed order). If you only know who won, a playoff game can use `"winner": "Name"` and a `date` (or just `"month": "2026-11"`) instead of scores; those do not count in the standings.

## Publishing the update
GitHub Pages republishes whenever `main` changes, about a minute after you commit.
- **On github.com:** edit the file, tap **Commit changes** (commit directly to `main`).
- **From a computer:** `git add -A && git commit -m "Add games" && git push`.

Reload the site (close and reopen the tab if your phone shows an old copy).

## If you change the site's code
Data edits (games, members, text) show up on their own. If you edit a `.js` or `.css` file, also change the number in `version.txt` (any new value, e.g. today's date plus a letter). The page reads that file on every visit and adds it to the script and stylesheet names, so phones that kept an old copy of the page still load the new code right away.

## Run it locally
```
python3 -m http.server 8000   # then open http://localhost:8000
```
Opening `index.html` directly won't work (browsers block loading the data files).

## Schedule
The **Schedule** tab builds the matchups from the date; there is nothing to enter. Every game day (Monday to Friday) is a full round robin: each player plays every other player once, and the home/road sides flip every game day, so after any two game days everyone has had the same number of games at home and on the road. Games already in the log are filled in with their scores.

The schedule gives these days off automatically: New Year's Day, Memorial Day, Independence Day, Labor Day, Thanksgiving and Christmas. A fixed-date holiday on a weekend is observed on the nearest weekday (Saturday becomes Friday, Sunday becomes Monday).

Playoffs take 2 game days (3 when 15 or more teams play), planned for just before the month's last game day, which is kept open as a makeup day. Once playoff games are logged, the days they were actually played become the playoff days (October's were all on Oct 28), and the days after are open. A planned playoff day is never placed on a day that already has regular games logged. Optional settings in `data/config.json`:
```
"schedule": { "roundsPerDay": 0, "skipDates": ["2026-12-24"], "holidays": true, "playoffDays": "auto", "minGamesPerDay": 6, "makeupDay": true,
              "playoffDates": { "2026-10": ["2026-10-29", "2026-10-30"] } }
```
`skipDates` are extra days with no games, `holidays: false` turns the holiday list off, `makeupDay: false` uses the last day for games, `roundsPerDay` limits a day to that many rounds (0 = the full round robin), and `playoffDates` pins a month's playoff dates.

## Standings: PTS%
PTS% (points earned out of points possible) was used to seed October's playoffs, so the column shows for October and earlier and is dropped from November on (once every team plays the same number of games). It is controlled by `"standings": { "ptsPercentThrough": "2026-10" }` in `data/config.json`: change the month to show it longer, or remove the setting to hide it everywhere.

## Members and logos
Each member gets a profile on the Members tab (titles, career record, playoff record, month by month, head to head), all calculated from the games. Members are in `data/members.csv` (`name, short_name, team_name, established, logo, alt_logo`). To add a player, add a row and upload a logo into `images/teams/`. The league logo is `images/league-logo.webp`. The Home and Rules text are in `data/home.txt` and `data/rules.txt`.

## Importing from the Excel workbook
```
pip install openpyxl
python3 tools/xlsx_to_csv.py BUBBLE_HOCKEY.xlsx
```
This rewrites the regular-season games in `data/games.json` (keeping any playoff games and seeds already there), plus `members.csv` and the page text. Skip it if you are adding games directly to the JSON.

## Resources (mini games)
The **Resources** page (`js/resources.js`, address `#/resources`, linked from small text in the footer) holds small games that have nothing to do with the standings. The first is a **Shootout**: the shooter picks left, middle or right and the goalie picks too; the same pick is a save, anything else is a goal. Five shots each, then sudden death. Play the computer, or two players on one screen (the goalie's turn is hidden behind a hand-over screen). Nothing is saved to the league data; only your win-loss record against the computer is kept in your own browser.

The tab is not in the top menu: it is the small **Resources** link at the bottom of every page. **Play a friend online** works across two computers: one player creates a game and sends the 5-character invite code (or the invite link), the other enters it. The two browsers connect directly (WebRTC) through the free public PeerJS matchmaking server, using the bundled `js/vendor/peerjs.min.js` (PeerJS 1.5.4, MIT). Some strict work networks block this kind of connection; if so the game says it could not connect.

## Games per day and editing the rules
- **Games per day:** `schedule.minGamesPerDay` in `data/config.json` (now `6`) gives every day just enough rounds to reach at least that many games. With 5 players that is exactly 6 games a day (each round has 2 games and one player rests); the rounds carry over to the next day, so everyone still plays everyone and home and road sides stay balanced. Set it to `0` (or remove it) to go back to a full round robin every day, or use `schedule.roundsPerDay` for a fixed number of rounds.
- **Rules and Home text:** on the Add / Edit tab, choose **Rules & text**. Edit the text, check the preview, and tap **Save changes** (needs the one-time GitHub connection). Lines starting with `#` are the page title, `##` a section heading, `•` a bullet; anything else is a paragraph.

## Editing the schedule from the site
On the Add / Edit tab, **Schedule** (needs the one-time GitHub connection) saves to **`data/schedule.json`**, which adds to the rules in `config.json`:
- **Games on a day:** pick a day, then **Swap sides** on a game (the other player is at home), **Edit** to change the home and road players or move the game to another game day, **Swap sides for every game this day**, or **Reset this day to automatic**. An edited game shows a small ✎ on the Schedule. A game you log with the same two players still pairs with its schedule row, either way round.
- **Days off:** add any extra day with no games, with an optional reason. Holidays are still automatic.
- **Playoff days:** tick 1 to 5 days for a month, or go back to automatic.
Edits are stored as `overrides` (`date`, the automatic pair `a`/`b`, and the new `toDate`/`home`/`road`). If a player joining later makes an old edit stop matching the automatic schedule, the editor offers to remove it.

**Removing a scheduled game:** in the Schedule section, **Remove** takes a game that will not be played off that day (it is not marked DNP); **put back** undoes it. Games that were already played cannot be removed.
**Test connection:** on Add / Edit, this checks the browser, the network (api.github.com), the token and its permissions, and says in plain words what is wrong when saving does not work on a device.

**Games played instead of the scheduled ones:** a game logged with a different matchup than scheduled takes the place of a scheduled game that was not played (preferring one that shares a player), so the day keeps its games count. Those rows show who actually played, with a small `*`. Scheduled games nobody replaced become DNP once the day has passed. Games beyond the day's scheduled count still appear under "Also played".

**Face-off (second game on Resources):** a reaction game. The referee holds the puck over the dot and drops it at a random moment; tap the instant it drops (the faster player wins the draw), but tap early and it is a false start. First to 3 draws. Play the computer (Easy, Medium or Hard) or two players on one screen (two big buttons, or the A and L keys). Code: `js/faceoff.js`, sharing the arena and drawing helpers with the Shootout in `js/resources.js`. Only your record and fastest reaction against the computer are kept, in your own browser.

**Quick hide:** on the Home and Resources pages, **Hide screen (Esc)** (or the Esc key) covers the window with a made-up desktop mail client (folders, inbox, reading pane; sample text only, no company names or logos), mutes sounds and changes the tab title and icon. Press Esc again, or click the round profile picture at the top right, to come back. Code: `js/boss.js`.

**Unpredictable puck drop:** the Face-off wait is a mix of quick (about 0.6 to 1.3 s), ordinary (1.3 to 3.3 s) and long (3.3 to 7.3 s) waits, the "get ready" pause varies too, and in about 3 of 10 rounds the referee fidgets (dips the puck and brings it back) before the real drop. Tapping during a fidget is a false start.
