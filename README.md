# Bubble Hockey League

Static website (no build step). Tabs: Home, Rules, Members, Game Log, Game Log History, Standings, Standings History, Playoff Bracket, Playoff History.

## Run locally
```
python3 -m http.server 8000   # then open http://localhost:8000
```
(Opening index.html directly won't work; browsers block loading the CSV files.) Any static host works, e.g. GitHub Pages.

## Importing from Excel
Either save each sheet as CSV into `data/`, or run `pip install openpyxl && python3 tools/xlsx_to_csv.py league.xlsx` (sheets named `members`, `games`, `playoffs`).

| File | Columns |
|---|---|
| `data/members.csv` | name, department, favorite_team, joined, bio |
| `data/games.csv` | date (YYYY-MM-DD), season, player1, score1, player2, score2, overtime (yes/no) |
| `data/playoffs.csv` | season, round (1,2,…), round_name, match, seed1, player1, score1, seed2, player2, score2 |
| `data/config.json` | league name, tagline, `currentSeason`, points per win / OT loss / loss |

Standings are calculated automatically from `games.csv`. The Game Log shows the latest month of the current season; earlier months move to Game Log History on their own. When a season ends, change `currentSeason` in `config.json` — the old season moves into the history tabs. Leave playoff scores blank for unplayed matches.

Sample data is included; replace it with your own. Colors and fonts are CSS variables at the top of `css/styles.css`.
