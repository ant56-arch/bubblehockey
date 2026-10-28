# Bubble Hockey League

A small static website (no build step, no login, no backend, nothing to pay for) hosted on GitHub Pages. Tabs: Home, Rules, Members, Schedule, Game Log, Standings, Playoffs. Game Log, Standings and Playoffs each have month buttons for the current and past months.

Everything is calculated from one file, **`data/games.json`**: standings, the game log, per-player records for every month, the schedule's results and the playoff brackets. The current month is simply today's month, so the game log and standings reset by themselves on the 1st.

## Adding a game

Open `data/games.json` on GitHub, tap the pencil (Edit), copy the last game line, paste it below, and change the values. Every game line ends with a comma except the very last one.

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
| `winner` | no | for a playoff game with no scores |

Easier: open the site's **`#/add`** page (there is an "Add a game" link in the footer). Fill in the form and it builds the line for you. Tap **Copy**, edit `data/games.json`, tap at the end of the last game line (right after its `}`), paste, and commit. The page saves nothing itself.

If something is mistyped, the site shows a yellow box at the top saying what is wrong (a missing comma, a name that is not a member, a missing score) instead of breaking.

### Playoff games
Add them to the same file with `"playoff": true` and either the scores or `"winner"`:
```json
{ "date": "2026-11-26", "home": "Connor", "road": "Boban", "homeScore": 4, "roadScore": 1, "playoff": true }
```
The Playoffs tab matches each one to the next open game in the 7-game double-elimination bracket by its two players, so enter them in the order they were played. Seeds come from the regular-season standings before the first playoff game. To force the seeds for a month, add `"playoffSeeds": { "2026-10": ["Connor", "Trotta", "Tommy", "Boban"] }` (as October has). Playoff games do not count in standings.

## Publishing the update
GitHub Pages republishes whenever `main` changes, about a minute after you commit.
- **On github.com:** edit the file, tap **Commit changes** (commit directly to `main`).
- **From a computer:** `git add -A && git commit -m "Add games" && git push`.

Reload the site (close and reopen the tab if your phone shows an old copy).

## Run it locally
```
python3 -m http.server 8000   # then open http://localhost:8000
```
Opening `index.html` directly won't work (browsers block loading the data files).

## Schedule
The **Schedule** tab builds the matchups from the date; there is nothing to enter. Every game day (Monday to Friday) is a full round robin: each player plays every other player once, and the home/road sides flip every game day, so after any two game days everyone has had the same number of games at home and on the road. Games already in the log are filled in with their scores.

The schedule gives these days off automatically: New Year's Day, Memorial Day, Independence Day, Labor Day, Thanksgiving and Christmas. A fixed-date holiday on a weekend is observed on the nearest weekday (Saturday becomes Friday, Sunday becomes Monday).

Playoffs take 2 game days, placed just before the month's last game day, which is kept open as a makeup day. Optional settings in `data/config.json`:
```
"schedule": { "roundsPerDay": 0, "skipDates": ["2026-12-24"], "holidays": true, "playoffDays": 2, "makeupDay": true,
              "playoffDates": { "2026-10": ["2026-10-29", "2026-10-30"] } }
```
`skipDates` are extra days with no games, `holidays: false` turns the holiday list off, `makeupDay: false` uses the last day for games, `roundsPerDay` limits a day to that many rounds (0 = the full round robin), and `playoffDates` pins a month's playoff dates.

## Members and logos
Members are in `data/members.csv` (`name, short_name, team_name, established, logo, alt_logo`). To add a player, add a row and upload a logo into `images/teams/`. The league logo is `images/league-logo.webp`. The Home and Rules text are in `data/home.txt` and `data/rules.txt`.

## Importing from the Excel workbook
```
pip install openpyxl
python3 tools/xlsx_to_csv.py BUBBLE_HOCKEY.xlsx
```
This rewrites the regular-season games in `data/games.json` (keeping any playoff games and seeds already there), plus `members.csv` and the page text. Skip it if you are adding games directly to the JSON.
