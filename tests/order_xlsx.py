"""Writes the client order sheet the Playwright order-file test drops (web/e2e/order-file.spec.ts).

Run from the repo root: uv run python -m tests.order_xlsx <path.xlsx>
"""

from __future__ import annotations

import sys

from openpyxl import Workbook

# Sheet rows: 1-2 the client's logo lines, 3 ΑΦΜ (customer 47), 5 header, 6-9 data, 10 a total row.
# 6 mouse (file price 22, SoftOne 25), 7 "Docking Station" matches many, 8 no item, 9 two keyboards.
ROWS = [
    ["ΠΑΠΑΔΟΠΟΥΛΟΣ Α.Ε."],
    ["Εμπόριο ηλεκτρονικών · Αθήνα"],
    ["ΑΦΜ", "999863881"],
    [],
    ["Κωδικός", "Περιγραφή", "Ποσότητα", "Τιμή"],
    ["1002", "Ποντίκι", 1, 22],
    ["Docking Station", "", 1, None],
    ["nothing zz", "", 2, None],
    ["KEYB-01", "Πληκτρολόγιο", 2, 80],
    ["Σύνολο", "", 6, None],
]


def main(path: str) -> None:
    book = Workbook()
    sheet = book.active
    for row in ROWS:
        sheet.append(row)
    book.save(path)


if __name__ == "__main__":
    main(sys.argv[1])
