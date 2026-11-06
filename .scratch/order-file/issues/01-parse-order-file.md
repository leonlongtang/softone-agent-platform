# 01: Parse an order file

Status: needs-triage
Blocked by: none
Implements: `.scratch/order-file/spec.md` → Decisions 4, 5, 6, 16

**What to build:** `agent_platform/order_file.py` with a pure `parse(data, filename, columns=None)` that turns CSV or .xlsx bytes into rows: the sheet's row numbers, item text, quantity, file price, plus the header row it used, the sheet names, the columns it found, and customer hints (codes and ΑΦΜ-looking values in the cells above the header). If `columns` is given, it overrides header detection. Add `openpyxl` to `pyproject.toml` and `uv.lock`.

- [ ] CSV in UTF-8, UTF-8 BOM and cp1253 with Greek headers parses to the same rows
- [ ] .xlsx with a logo/address block above the table finds the header within the first 10 rows
- [ ] Only the first sheet is read; the result lists the other sheet names
- [ ] Data stops at the first empty row; "Σύνολο" / "Total" rows are skipped
- [ ] Formula cells come back as their saved values
- [ ] No item or quantity header → the result says which are missing and returns the first rows for the column pickers
- [ ] Passing `columns` parses a file with unknown headers
- [ ] Refused with a clear message: over 2 MB, over 500 data rows, not CSV or .xlsx, a quantity that isn't a positive whole number (that row is flagged, not the whole file)
- [ ] Test fixtures are built in the test (csv text, `openpyxl` workbook to bytes); no binary files committed
- [ ] `pytest`, `ruff` pass
