# 07: Real SoftOne backend (read-only SQL)

**What to build:** Pointed at a real SoftOne installation, the database pane reads SoftOne's SQL Server through `pyodbc` + Microsoft ODBC Driver 18, using a second SQL file whose six SELECTs read SoftOne's own tables (TRDR, MTRL, FINDOC/MTRLINES…) aliased to the mock's column names, so the UI and diff work unchanged. Credentials come from `.env` as `SOFTONE_SQL_*` and must be a read-only (db_datareader) login: the database pane refuses to start with any login that can write. Install-specific series/company filters are clearly marked for the consultant. The README states this path is untested (no instance available).

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Backend chosen by config; mock remains the default
- [ ] Refusal to start the DB pane with a non-read-only login, covered by a test (login check stubbed)
- [ ] SoftOne SQL file with marked install-specific filters
- [ ] `.env.example` documents `SOFTONE_SQL_*`; README says the real-SoftOne path is untested
