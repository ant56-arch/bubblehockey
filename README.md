# Bubble Hockey League

Static website (no build step). Tabs: Home, Rules, Members, Game Log, Game Log History, Standings, Standings History, Playoff Bracket, Playoff History.

## Run locally
```
python3 -m http.server 8000   # then open http://localhost:8000
```
Opening index.html directly won't work (browsers block loading the data files). Any static host works, e.g. GitHub Pages.

## Updating from the Excel workbook
```
pip install openpyxl
python3 tools/xlsx_to_csv.py BUBBLE_HOCKEY.xlsx
```
This rewrites everything in `data/` from the workbook's Home, Rules, Members, `<Month> Game Log`, Game Log History and Playoff History sheets. DNP games are skipped. Member emails and logos are not exported. Standings are not imported; the site calculates them from the games so they always match the game log.

| File | Contents |
|---|---|
| `data/games.csv` | game_id, date, home, road, home_goals, road_goals, home_shots, road_shots, overtime (yes/no) |
| `data/members.csv` | name, short_name (as written in the game log), team_name, established |
| `data/playoffs.csv` | month, seed1–seed4, g1–g7 (the winner of each game) |
| `data/home.txt`, `data/rules.txt` | page text: `# title`, `## heading`, `• bullet`, otherwise a paragraph |
| `data/config.json` | league name, tagline, `currentMonth`, points per result |

## Entering data from the website (password protected)
Open the **Enter** tab. The first time, you do a one-time setup: create a GitHub fine-grained token limited to this repository with **Contents: Read and write**, paste it in, and choose a league password (8+ characters). The token is locked with the password (AES-256, key derived with PBKDF2) and saved as `data/auth.json`; the password itself is never stored. After that, anyone who knows the password can unlock the page, add games, add or edit members and teams (with logo uploads), save playoff results, and set the current month. Each save commits to `data/` and the live site updates in about a minute.

Notes: use a reasonably long password, because the locked file is public and could be guessed at offline. The token only has access to this repository, and every change is in the git history so it can be undone. If the token expires, use **Set up a new one** on the Enter page. **Change the password** is at the bottom of the Enter page once you are signed in.

Pick one source of truth: if you enter games on the website, don't re-run `xlsx_to_csv.py` from an older spreadsheet, or it will overwrite them.

## Logos
Team logos live in `images/teams/` and are referenced by the `logo` and `alt_logo` columns of `data/members.csv`. The league logo is `images/league-logo.webp`.

## Monthly routine
1. Add the month's games (re-run the converter, or append rows to `games.csv`).
2. At month end, set `currentMonth` in `config.json` to the new month (e.g. `2026-12`). The finished month moves into Game Log History and Standings History automatically.
3. Add the finished month's playoff row to `playoffs.csv` (seeds + game winners) so it appears in Playoff History. The current month's bracket seeds itself from live standings.

Colors and fonts are CSS variables at the top of `css/styles.css`.
