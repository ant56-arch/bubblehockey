# Bubble Hockey League

A small static website (no build step, no login, no backend, nothing to pay for) hosted on GitHub Pages. Tabs: Home, Rules, Members, Schedule, Game Log, Standings, Playoffs, Add Game. Game Log, Standings and Playoffs each have month buttons for the current and past months.

Everything is calculated from one file, **`data/games.json`**: standings, the game log, per-player records for every month, the schedule's results and the playoff brackets. The current month is simply today's month, so the game log and standings reset by themselves on the 1st.

## Adding, editing and deleting games

### From the website (the **Add / Edit** tab)
Connect once, then add, edit and delete games right on the site.
1. **Connect (once per device, about two minutes):** the tab has a "Connect once to save changes" card with the steps. Tap **Open GitHub** (it opens GitHub's new-token page with the name, owner, 1-year expiry and Contents permission already filled in), choose **Only select repositories** and pick this repo, tap **Generate token**, copy it, then come back, tap **Paste** and **Connect**. It is a *fine-grained* token limited to this one repository. It is kept only in that browser (**Disconnect** removes it), and you renew it once a year (the tab tells you when it stops working). A classic token set to never expire also works.
2. **Add:** fill in the form and tap **Save game**. Tick **Did not play (DNP)** for a game that was not played, or **Playoff game** for a playoff game.
3. **Edit or delete:** the games are listed on the tab by month (visible even before you connect). Tap **Edit** (the game loads into the form; change it and tap **Save changes**) or **Delete** (asks first). Saving before connecting just points you at the connect steps.

Each save is a commit to `data/games.json`, so the public site updates about a minute later (a connected phone reads the newest data straight from GitHub, so it shows your save immediately everywhere on the site while everyone else catches up) and GitHub's **History** keeps every earlier version. Saves change only the one line involved and leave the rest of the file untouched. If someone changed the file in between, the tab refuses and refreshes instead of hitting the wrong game. Without a token the form still works: it builds a line to copy (below).

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

### Playoff games
A playoff game is a normal game with `"playoff": true`. **It still counts in the standings and everyone's records** (the Game Log tags it "Playoff"):
```json
{ "date": "2026-11-25", "home": "Connor", "road": "Boban", "homeScore": 4, "roadScore": 1, "playoff": true }
```
The Playoffs tab matches each playoff game to the next open game in the 7-game double-elimination bracket by its two players, so enter them in the order they were played. Seeds come from the standings of the month's non-playoff games. To force the seeds for a month, add `"playoffSeeds": { "2026-10": ["Connor", "Trotta", "Tommy", "Boban"] }` (as October has). If you only know who won, a playoff game can use `"winner": "Name"` and a `date` (or just `"month": "2026-11"`) instead of scores; those do not count in the standings.

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

Playoffs take up to 2 game days, planned for just before the month's last game day, which is kept open as a makeup day. Once playoff games are logged, the days they were actually played become the playoff days (October's were all on Oct 28), and the days after are open. A planned playoff day is never placed on a day that already has regular games logged. Optional settings in `data/config.json`:
```
"schedule": { "roundsPerDay": 0, "skipDates": ["2026-12-24"], "holidays": true, "playoffDays": 2, "makeupDay": true,
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
