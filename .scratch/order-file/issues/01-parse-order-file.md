# 01: Parse an order file

Status: resolved
Blocked by: none
Implements: `.scratch/order-file/spec.md` → Decisions 4, 5, 6, 16

**What to build:** `agent_platform/order_file.py` with a pure `parse(data, filename, columns=None)` that turns CSV or .xlsx bytes into rows: the sheet's row numbers, item text, quantity, file price, plus the header row it used, the sheet names, the columns it found, and customer hints (codes and ΑΦΜ-looking values in the cells above the header). If `columns` is given, it overrides header detection. Add `openpyxl` to `pyproject.toml` and `uv.lock`.

- [x] CSV in UTF-8, UTF-8 BOM and cp1253 with Greek headers parses to the same rows
- [x] .xlsx with a logo/address block above the table finds the header within the first 10 rows
- [x] Only the first sheet is read; the result lists the other sheet names
- [x] Data stops at the first empty row; "Σύνολο" / "Total" rows are skipped
- [x] Formula cells come back as their saved values
- [x] No item or quantity header → the result says which are missing and returns the first rows for the column pickers
- [x] Passing `columns` parses a file with unknown headers
- [x] Refused with a clear message: over 2 MB, over 500 data rows, not CSV or .xlsx, a quantity that isn't a positive whole number (that row is flagged, not the whole file)
- [x] Test fixtures are built in the test (csv text, `openpyxl` workbook to bytes); no binary files committed
- [x] `pytest`, `ruff` pass

Done: `agent_platform/order_file.py` (`parse`, `Row`, `Parsed`, `OrderFileError`) and `tests/test_order_file.py` (37 tests; full suite 212 passed, ruff clean). `openpyxl` 3.1.5 added. Review fixes: most specific header wins ("Τιμή μονάδας" over "Τιμή", a code over a description), headers with a "(...)" note or a trailing colon match, total rows match the whole word, Greek "1.000" and mixed-separator numbers parse, CR-only CSVs and csv errors are refused with the message, binary-looking cp1253 text is refused, the 500-row limit no longer depends on where the header sits, and bad `columns` are refused. Skipped, with `ponytail:` notes: a lone comma is always a decimal comma; any token with a digit above the table is a customer hint; a first cell with "total"/"σύνολο" marks a total row; with picked columns, a bad quantity on the first data line is taken as preamble. Compound headers ("Κωδικός Είδους") aren't matched and fall back to the column pickers. Formulas: openpyxl can't write cached values, so the test checks the file is opened `data_only=True, read_only=True` and an uncached formula comes back flagged, never as formula text.
