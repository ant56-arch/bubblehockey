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

## Admin login setup (one time, about 10 minutes)
The **Admin** tab signs in with a username and password and saves to a free Firebase project (Google). Nothing expires and there are no tokens.

1. Go to https://console.firebase.google.com, **Create a project** (any name; turn off Google Analytics).
2. **Build → Authentication → Get started → Email/Password → Enable → Save.**
3. Authentication → **Users → Add user.** For the email enter `yourusername@league.local` (the part before `@` is your login username; it does not need to be a real email) and choose a password.
4. **Build → Firestore Database → Create database** → production mode → pick the closest location → Enable. Stay on the free (Spark) plan.
5. Firestore → **Rules** tab → paste the contents of `firestore.rules` (with your username filled in) → **Publish.**
6. **Project settings (gear) → General → Your apps → Web (`</>`)** → register an app (no hosting). Copy `apiKey` and `projectId`.
7. Put them in `data/firebase.json`: `{"apiKey": "...", "projectId": "..."}` (the API key is not a secret). Commit it.
8. Open the site → **Admin**, sign in, and click **Move my data in** once. After that the site reads from the database and everything you enter shows up right away.

To add another admin, create another user in Authentication and add their `@league.local` address to the list in the rules. To change a password, use the Admin page (or reset it in the Firebase console).

Without `data/firebase.json` the site simply reads the CSV files in `data/` and the Admin tab says it isn't connected. Those files can also be edited directly on github.com.

## Logos
Team logos live in `images/teams/` and are referenced by the `logo` and `alt_logo` columns of `data/members.csv`. The league logo is `images/league-logo.webp`.

## Monthly routine
1. Add the month's games (re-run the converter, or append rows to `games.csv`).
2. At month end, set `currentMonth` in `config.json` to the new month (e.g. `2026-12`). The finished month moves into Game Log History and Standings History automatically.
3. Add the finished month's playoff row to `playoffs.csv` (seeds + game winners) so it appears in Playoff History. The current month's bracket seeds itself from live standings.

Colors and fonts are CSS variables at the top of `css/styles.css`.
