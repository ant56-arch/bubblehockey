#!/usr/bin/env python3
"""Convert the league workbook into the files the site reads from data/.

Usage: python3 tools/xlsx_to_csv.py BUBBLE_HOCKEY.xlsx
Needs: pip install openpyxl

Reads:  Home, Rules, Members, every "<Month> Game Log" sheet, "Game Log History",
Writes: home.txt, rules.txt, members.csv, games.json (regular-season games; any playoff games and
        playoffSeeds already in games.json are kept)
Standings are NOT imported; the site calculates them from the games.
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
            if not (home and road): continue
            if hg == "DNP" or rg == "DNP":                       # a scheduled game that was not played
                games.append([iso(date), home, road, "DNP", "DNP", "", "", "no"]); continue
            if hg is None or rg is None: continue
            games.append([iso(date), home, road, hg, rg, "" if hs is None else hs, "" if rs is None else rs, "yes" if r[9] == "Overtime" else "no"])
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

import json
old = json.loads((out / "games.json").read_text()) if (out / "games.json").exists() else {}
entries = []
for date, home, road, hg, rg, hs, rs, ot in games:
    if hg == "DNP":
        entries.append({"date": date, "home": home, "road": road, "dnp": True}); continue
    e = {"date": date, "home": home, "road": road, "homeScore": int(hg), "roadScore": int(rg)}
    if ot == "yes": e["overtime"] = True
    if hs != "" and rs != "": e["homeShots"], e["roadShots"] = int(hs), int(rs)      # 0 shots is a real value
    entries.append(e)
key = lambda g: (g.get("date"), g.get("home"), g.get("road"), g.get("homeScore"), g.get("roadScore"))
flagged = {key(g) for g in old.get("games", []) if g.get("playoff") and "homeScore" in g}
for e in entries:
    if key(e) in flagged: e["playoff"] = True                      # a logged game that was a playoff game
matched = {key(e) for e in entries}
entries += [g for g in old.get("games", []) if g.get("playoff") and key(g) not in matched]   # winner-only playoff entries
line = lambda g: "    { " + ", ".join('"%s": %s' % (k, json.dumps(v)) for k, v in g.items()) + " }"
(out / "games.json").write_text('{\n  "_how_to_add": %s,\n  "playoffSeeds": %s,\n  "games": [\n%s\n  ]\n}\n' % (
    json.dumps(old.get("_how_to_add", "See README.md, 'Adding a game'.")), json.dumps(old.get("playoffSeeds", {})), ",\n".join(line(g) for g in entries)))
print("done:", len(games), "regular games")
