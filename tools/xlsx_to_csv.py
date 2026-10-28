#!/usr/bin/env python3
"""Export each sheet of the league workbook to data/<sheet name>.csv.

Usage: python3 tools/xlsx_to_csv.py league.xlsx
Needs: pip install openpyxl
Sheets expected: members, games, playoffs (see README for columns).
"""
import csv, sys, pathlib
from openpyxl import load_workbook

wb = load_workbook(sys.argv[1], data_only=True)
out = pathlib.Path(__file__).resolve().parent.parent / "data"
for ws in wb.worksheets:
    name = ws.title.strip().lower().replace(" ", "_")
    with open(out / f"{name}.csv", "w", newline="") as f:
        w = csv.writer(f)
        for row in ws.iter_rows(values_only=True):
            if any(c is not None for c in row):
                w.writerow(["" if c is None else (c.date().isoformat() if hasattr(c, "date") else c) for c in row])
    print("wrote", name)
