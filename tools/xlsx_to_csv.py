#!/usr/bin/env python3
"""Convert the league workbook into the files the site reads from data/.

Usage: python3 tools/xlsx_to_csv.py BUBBLE_HOCKEY.xlsx
Needs: pip install openpyxl

Reads:  Home, Rules, Members, every "<Month> Game Log" sheet, "Game Log History",
        and "Playoff History" (and "Playoffs" if it has been filled in).
Writes: home.txt, rules.txt, members.csv, games.csv, playoffs.csv
Standings are NOT imported; the site calculates them from games.csv.
"""
import csv, re, sys, pathlib, datetime
from openpyxl import load_workbook

wb = load_workbook(sys.argv[1], data_only=True)
out = pathlib.Path(__file__).resolve().parent.parent / "data"
iso = lambda d: d.date().isoformat() if isinstance(d, datetime.datetime) else str(d)

def scrub(t):
    """The league name is shown without the company prefix."""
    return re.sub(r"\bUWM\s+", "", t.replace("UWM's", "our"))

def text_cells(ws):
    return [scrub(str(c.value).strip()) for row in ws.iter_rows() for c in row if isinstance(c.value, str) and c.value.strip()]

# --- home / rules as simple text: "# title", "## heading", "• bullet", plain paragraphs
cells = text_cells(wb["Home"])
lines = [f"# {cells[0]}"]
for t in cells[1:]:
    if len(t) < 60 and "\n" not in t: lines.append(f"## {t}")
    elif "Form Your Team:" in t:
        head, _, rest = t.partition("Form Your Team:")
        ls = ("Form Your Team:" + rest).split("\n")
        lines.append(head.strip()); lines += ["• " + l.strip() for l in ls if l.strip()]
    else: lines.append(t)
(out / "home.txt").write_text("\n".join(lines) + "\n")
rules = [f"# {c}" if c.endswith("Rules") else re.sub(r"^([^\n•]+)\n", r"## \1\n", c, count=1) for c in text_cells(wb["Rules"])]
(out / "rules.txt").write_text("\n".join(rules) + "\n")

# --- games
games = []
for ws in wb.worksheets:
    if ws.title.endswith("Game Log") or ws.title == "Game Log History":
        for r in ws.iter_rows(min_row=2, values_only=True):
            gid, date, home, road, hg, rg, hs, rs = r[:8]
            if not (home and road) or hg in (None, "DNP") or rg in (None, "DNP"): continue
            games.append([iso(date), home, road, hg, rg, hs or "", rs or "", "yes" if r[9] == "Overtime" else "no"])
games.sort(key=lambda g: g[0])

# --- members (emails are intentionally left out; this is a public page). Logo paths are kept from the existing file.
# short_name = the name used in the game log: first name, or last name if that's what the log uses.
used = {n for g in games for n in (g[1], g[2])}
old = {r["short_name"]: r for r in csv.DictReader(open(out / "members.csv"))} if (out / "members.csv").exists() else {}
with open(out / "members.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["name", "short_name", "team_name", "established", "logo", "alt_logo"])
    for r in wb["Members"].iter_rows(min_row=2, values_only=True):
        if r[0]:
            parts = r[0].split()
            short = next((p for p in parts if p in used), parts[0])
            w.writerow([r[0], short, r[1] or "", iso(r[2]) if r[2] else "", old.get(short, {}).get("logo", ""), old.get(short, {}).get("alt_logo", "")])

with open(out / "games.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["game_id", "date", "home", "road", "home_goals", "road_goals", "home_shots", "road_shots", "overtime"])
    for i, g in enumerate(games, 1): w.writerow([i] + g)

# --- playoff history: seeds + winner of each game, read from the bracket layout
def bracket(ws, month):
    def above(label):
        for row in ws.iter_rows():
            for c in row:
                if c.value == label: return ws.cell(c.row - 1, c.column).value
    def winner(n):
        for row in ws.iter_rows():
            for c in row:
                if isinstance(c.value, str) and re.match(rf"Game {n}\b", c.value): return ws.cell(c.row, c.column + 1).value
    seeds = [above(l) for l in ("First Place Team", "Second Place Team", "Third Place Team", "Fourth Place Team")]
    g = [winner(n) for n in range(1, 7)]
    champ = above("Champion")
    g7 = champ if g[5] and g[5] != g[3] else ""
    return [month] + seeds + [x or "" for x in g] + [g7]

with open(out / "playoffs.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["month", "seed1", "seed2", "seed3", "seed4", "g1", "g2", "g3", "g4", "g5", "g6", "g7"])
    ws = wb["Playoff History"]
    m = re.search(r"for (\w+) (\d{4})", ws["A1"].value)
    month = datetime.datetime.strptime(f"{m.group(1)} {m.group(2)}", "%B %Y").strftime("%Y-%m")
    w.writerow(bracket(ws, month))
print("done:", len(games), "games")
