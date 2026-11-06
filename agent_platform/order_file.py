"""Order files: a client's CSV or .xlsx order, parsed into rows by code (ADR 0001).

Pure: bytes in, `Parsed` out. Matching rows against SoftOne is a separate step.
Spec: `.scratch/order-file/spec.md` → Decisions 4, 5, 6, 16.
"""

from __future__ import annotations

import csv
import io
import re
import unicodedata
import zipfile
from dataclasses import dataclass, field

import openpyxl

MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 500
HEADER_SEARCH_ROWS = 10
PREVIEW_ROWS = 10
REQUIRED = ("item", "qty")
NOT_AN_ORDER_FILE = "This isn't a CSV or .xlsx file. Save the order as CSV or .xlsx and attach it again."


class OrderFileError(ValueError):
    """The file can't be read as an order. The message says what's wrong and what to do."""


def _norm(text: object) -> str:
    """Lowercase, no accents, trimmed: how headers and total rows are compared."""
    decomposed = unicodedata.normalize("NFD", str(text or "").strip().lower())
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn")


def _norm_header(text: object) -> str:
    """A header cell without a "(...)" note or trailing colon: "Ποσότητα (τεμ.)" -> "ποσοτητα"."""
    return re.sub(r"\(.*?\)", "", _norm(text)).strip().rstrip(":").strip()


# Most specific first: when two columns match, the one with the earlier word wins
# ("Τιμή μονάδας" over "Τιμή", a code over a description).
KNOWN_HEADERS = {
    "item": tuple(map(_norm, ("code", "sku", "κωδικός", "item", "product", "είδος", "περιγραφή"))),
    "qty": tuple(map(_norm, ("qty", "quantity", "ποσότητα", "ποσ.", "τεμ.", "τεμάχια"))),
    "price": tuple(map(_norm, ("unit price", "τιμή μονάδας", "price", "τιμή"))),
}
_TOTAL_ROW = re.compile(r"(^|\W)(συνολο|total)(\W|$)")


@dataclass
class Row:
    number: int  # row number in the sheet, as the operator sees it
    item_text: str
    qty: int | None
    file_price: float | None
    error: str | None = None  # set when the row can't be used as read (bad quantity)


@dataclass
class Parsed:
    rows: list[Row]
    header_row: int | None  # sheet row number of the header, None if there isn't one
    sheets: list[str]  # all sheet names; only the first is read (empty for CSV)
    columns: dict[str, int]  # "item" / "qty" / "price" -> 0-based column
    missing: list[str] = field(default_factory=list)  # "item" / "qty" headers not found
    preview: list[list[str]] = field(default_factory=list)  # first rows, for the column pickers
    hints: list[str] = field(default_factory=list)  # customer code / ΑΦΜ candidates above the table


def parse(data: bytes, filename: str, columns: dict[str, int] | None = None) -> Parsed:
    """Read the first sheet of a CSV or .xlsx order. `columns` overrides header detection."""
    if len(data) > MAX_BYTES:
        raise OrderFileError("This file is over 2 MB. Attach a smaller order file.")
    name = filename.lower()
    if name.endswith(".xlsx"):
        sheets, table = _read_xlsx(data)
    elif name.endswith(".csv"):
        sheets, table = [], _read_csv(data)
    else:
        raise OrderFileError(NOT_AN_ORDER_FILE)

    if columns is not None:
        _check_columns(columns, table)
        data_start, found = _data_start(table, columns), dict(columns)
    else:
        header, found = _find_header(table)
        data_start = header + 1 if header is not None else 0
    header_row = data_start if data_start > 0 else None  # sheet number of the row above the data

    missing = [key for key in REQUIRED if key not in found]
    if missing:
        preview = [[_cell_text(c) for c in row] for row in table[:PREVIEW_ROWS]]
        return Parsed([], header_row if found else None, sheets, found, missing, preview)
    rows = _rows(table, data_start, found)
    return Parsed(rows, header_row, sheets, found, hints=_hints(table[: max(data_start - 1, 0)]))


def _read_csv(data: bytes) -> list[list]:
    text = _decode(data)
    lines = text.splitlines()  # handles \r\n, \n and old-Mac \r alike
    # The separator on the most of the first lines; csv.Sniffer gives up (or picks the decimal comma) when a
    # preamble line has fewer fields than the table. Ties go to ",".
    # ponytail: counts lines holding the character, not consistent field counts, so a ";" file whose first 20
    # lines all hold a comma too reads as comma-separated. Tie-break on equal field counts per line if that shows up.
    delimiter = max(",;\t", key=lambda d: sum(d in line for line in lines[:20]))
    try:
        return list(csv.reader(lines, delimiter=delimiter))
    except csv.Error as e:
        raise OrderFileError(NOT_AN_ORDER_FILE) from e


def _decode(data: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1253"):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise OrderFileError(NOT_AN_ORDER_FILE)
    # ponytail: cp1253 decodes almost any byte, so a control character is the only sign of binary;
    # a Latin-1 file decodes as Greek-looking text. Encoding detection (charset-normalizer) if that shows up.
    if any(unicodedata.category(c) == "Cc" and c not in "\t\r\n" for c in text):
        raise OrderFileError(NOT_AN_ORDER_FILE)
    return text


def _read_xlsx(data: bytes) -> tuple[list[str], list[list]]:
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except (zipfile.BadZipFile, KeyError, OSError, ValueError) as e:
        raise OrderFileError(NOT_AN_ORDER_FILE) from e
    try:
        sheets = wb.sheetnames
        return sheets, [list(row) for row in wb[sheets[0]].iter_rows(values_only=True)]
    finally:
        wb.close()


def _check_columns(columns: dict[str, int], table: list[list]) -> None:
    width = max((len(row) for row in table), default=0)
    for key, col in columns.items():
        if key not in KNOWN_HEADERS or not isinstance(col, int) or not 0 <= col < width:
            raise OrderFileError(f"Column {key!r} isn't in this file. Pick the columns again.")


def _cell_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _find_header(table: list[list]) -> tuple[int | None, dict[str, int]]:
    """First row within the first 10 holding a known item or quantity header, and its columns."""
    for index, row in enumerate(table[:HEADER_SEARCH_ROWS]):
        texts = [_norm_header(cell) for cell in row]
        found = {}
        for key, words in KNOWN_HEADERS.items():
            ranked = [(words.index(t), col) for col, t in enumerate(texts) if t in words]
            if ranked:
                found[key] = min(ranked)[1]
        if "item" in found or "qty" in found:
            return index, found
    return None, {}


def _data_start(table: list[list], columns: dict[str, int]) -> int:
    """With picked columns: data starts at the first row whose item is set and quantity is a number."""
    # ponytail: rows above the first numeric quantity count as header/preamble, so a bad quantity on the
    # very first data line is taken as preamble, not flagged. Let the picker choose the start row if that bites.
    for index, row in enumerate(table):
        if _get(row, columns.get("item")) and _number(_get(row, columns.get("qty"))) is not None:
            return index
    return len(table)


def _get(row: list, col: int | None) -> object:
    if col is None or col >= len(row):
        return None
    value = row[col]
    return None if _cell_text(value) == "" else value


def _number(value: object) -> float | None:
    """A cell as a number: ints/floats as-is, text in Greek ("1.815,00") or English ("1,815.00") style."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = re.sub(r"[€\s]", "", str(value))
    if "," in text and "." in text:  # the last separator is the decimal one
        decimal = "," if text.rfind(",") > text.rfind(".") else "."
        text = text.replace("." if decimal == "," else ",", "").replace(",", ".")
    elif "," in text:
        # ponytail: a lone comma is a Greek decimal comma, so English "1,815" reads as 1.815.
        text = text.replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+", text):  # Greek thousands: "1.000"
        text = text.replace(".", "")
    try:
        return float(text)
    except ValueError:
        return None


def _rows(table: list[list], start: int, columns: dict[str, int]) -> list[Row]:
    rows: list[Row] = []
    for index in range(start, len(table)):
        cells = [_cell_text(c) for c in table[index]]
        if not any(cells):
            break
        # ponytail: a first cell holding the word "total"/"σύνολο" marks a total row, so an item named
        # "Total Care" is skipped too. Check the quantity against the rows above if that happens.
        if _TOTAL_ROW.search(_norm(next(c for c in cells if c))):
            continue
        if len(rows) >= MAX_ROWS:
            raise OrderFileError(f"This file has over {MAX_ROWS} rows. Split the order into smaller files.")
        row = table[index]
        qty = _number(_get(row, columns["qty"]))
        whole = qty is not None and qty.is_integer() and qty > 0
        rows.append(
            Row(
                number=index + 1,
                item_text=_cell_text(_get(row, columns["item"])),
                qty=int(qty) if whole else None,
                file_price=_number(_get(row, columns.get("price"))),
                error=None if whole else "Quantity must be a positive whole number.",
            )
        )
    return rows


def _hints(preamble: list[list]) -> list[str]:
    """Customer code / ΑΦΜ candidates: digit-bearing tokens in the cells above the table."""
    # ponytail: any token with a digit is a hint (phones and dates too); matching keeps only exact
    # customer code / ΑΦΜ hits. Label-aware extraction if false hits start to matter.
    hints: list[str] = []
    for row in preamble:
        for cell in row:
            for token in re.split(r"[\s:;,]+", _cell_text(cell)):
                token = token.strip(".()#")
                if re.search(r"\d", token) and token not in hints:
                    hints.append(token)
    return hints
