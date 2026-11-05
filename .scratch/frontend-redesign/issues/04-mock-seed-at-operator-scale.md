# 04: Mock seed at operator scale

Type: grilling
Status: resolved
Blocked by: none

## Question

How big and how realistic should the mock database seed be so the operator layout can be judged? Decide rows per table (customers, items, orders, order lines, invoices, payments), whether names include Greek text, and whether the larger seed replaces the current one or sits beside it (the README transcript and tests use today's ids, e.g. customer 47, items 1001/1002, order 5005).

Output: a "Demo data" section in `DESIGN.md`. HITL.

## Answer

See `DESIGN.md` → "Demo data". Extend today's seed instead of replacing it: original rows stay put, and bulk rows never touch them. Sizes are about 200 customers, 300 items, 1,000 orders, 3,000 lines, 800 invoices and 1,000 payments, with about half the customers Greek and a skewed spread. Statuses are consistent and dates span 12 months, generated from a fixed seed with no new dependency. Found while grilling: there's no cancelled order state (cancel deletes a Draft order), now in `GLOSSARY.md`.
