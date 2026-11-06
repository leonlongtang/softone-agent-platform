"""Order-file parsing (`agent_platform/order_file.py`). Fixtures are built here, no binary files."""

import io

import openpyxl
import pytest

from agent_platform import order_file
from agent_platform.order_file import OrderFileError, parse

GREEK_CSV = "Κωδικός;Περιγραφή;Ποσότητα;Τιμή\n2001;Βίδα;3;1,50\n2002;Παξιμάδι;10;0,20\n"


def xlsx(*sheets: tuple[str, list[list]]) -> bytes:
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for title, rows in sheets:
        ws = wb.create_sheet(title)
        for row in rows:
            ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def summary(parsed):
    return [(r.number, r.item_text, r.qty, r.file_price, r.error) for r in parsed.rows]


@pytest.mark.parametrize("encoding", ["utf-8", "utf-8-sig", "cp1253"])
def test_csv_encodings_parse_the_same(encoding):
    parsed = parse(GREEK_CSV.encode(encoding), "order.csv")
    assert parsed.header_row == 1
    assert parsed.columns == {"item": 0, "qty": 2, "price": 3}
    assert summary(parsed) == [(2, "2001", 3, 1.5, None), (3, "2002", 10, 0.2, None)]


def test_csv_semicolons_with_a_short_preamble_line_and_decimal_commas():
    parsed = parse("Πελάτης;999863881\nΚωδικός;Ποσότητα;Τιμή\n1002;1;22,00\nKEYB-01;3;\n".encode(), "o.csv")
    assert summary(parsed) == [(3, "1002", 1, 22.0, None), (4, "KEYB-01", 3, None, None)]
    assert parsed.hints == ["999863881"]


def test_csv_comma_delimited_english_headers():
    parsed = parse(b"SKU,Qty,Unit Price\nA-1,2,22.00\n", "o.csv")
    assert summary(parsed) == [(2, "A-1", 2, 22.0, None)]


def test_xlsx_header_below_logo_block_and_customer_hints():
    data = xlsx(
        (
            "Order",
            [
                ["ACME Logo"],
                ["Papadopoulos SA", None, "ΑΦΜ: 123456789"],
                ["Κωδ. πελάτη", "47"],
                [],
                ["Είδος", "Ποσ.", "Τιμή μονάδας"],
                ["2001", 4, 22],
            ],
        ),
        ("Notes", [["ignore me"]]),
    )
    parsed = parse(data, "order.xlsx")
    assert parsed.header_row == 5
    assert parsed.sheets == ["Order", "Notes"]
    assert summary(parsed) == [(6, "2001", 4, 22.0, None)]
    assert "123456789" in parsed.hints and "47" in parsed.hints


def test_header_must_be_within_first_ten_rows():
    rows = [[f"line {i}"] for i in range(10)] + [["Item", "Qty"], ["2001", 1]]
    parsed = parse(xlsx(("S", rows)), "o.xlsx")
    assert parsed.header_row is None
    assert parsed.missing == ["item", "qty"]


def test_stops_at_empty_row_and_skips_total_rows():
    csv = "Item,Qty\n2001,1\nΣύνολο,1\nTOTAL,9\n2002,2\n,\n2003,3\n"
    parsed = parse(csv.encode(), "o.csv")
    assert [r.item_text for r in parsed.rows] == ["2001", "2002"]


def test_formula_cells_come_back_as_saved_values(monkeypatch):
    # openpyxl can't compute formulas, so a workbook it writes has no cached values.
    # Check that the file is opened with data_only (saved values), not formula text.
    seen = {}
    real = openpyxl.load_workbook

    def spy(*args, **kwargs):
        seen.update(kwargs)
        return real(*args, **kwargs)

    monkeypatch.setattr(order_file.openpyxl, "load_workbook", spy)
    parsed = parse(xlsx(("S", [["Item", "Qty"], ["2001", "=1+1"]])), "o.xlsx")
    assert seen["data_only"] is True and seen["read_only"] is True
    assert parsed.rows[0].qty is None  # no saved value: flagged, never the formula text


def test_missing_headers_returns_preview():
    parsed = parse(b"foo,bar\nx,1\ny,2\n", "o.csv")
    assert parsed.missing == ["item", "qty"]
    assert parsed.rows == []
    assert parsed.preview[:3] == [["foo", "bar"], ["x", "1"], ["y", "2"]]


def test_only_qty_header_missing():
    parsed = parse(b"Item,Amount\nx,1\n", "o.csv")
    assert parsed.missing == ["qty"]


def test_columns_override_unknown_headers():
    parsed = parse(b"Shop order\nfoo,bar,baz\nx,ignored,2\ny,ignored,3\n", "o.csv", columns={"item": 0, "qty": 2})
    assert parsed.missing == []
    assert summary(parsed) == [(3, "x", 2, None, None), (4, "y", 3, None, None)]


@pytest.mark.parametrize("bad", ["0", "-1", '"1,5"', "abc", ""])
def test_bad_quantity_flags_the_row_only(bad):
    parsed = parse(f"Item,Qty\nx,{bad}\ny,2\n".encode(), "o.csv")
    assert parsed.rows[0].qty is None
    assert "positive whole number" in parsed.rows[0].error
    assert summary(parsed)[1] == (3, "y", 2, None, None)


def test_refused_over_2_mb():
    with pytest.raises(OrderFileError, match="2 MB"):
        parse(b"x" * (2 * 1024 * 1024 + 1), "o.csv")


def test_refused_over_500_rows():
    csv = "Item,Qty\n" + "x,1\n" * 501
    with pytest.raises(OrderFileError, match="500"):
        parse(csv.encode(), "o.csv")


@pytest.mark.parametrize(
    ("data", "name"),
    [(b"%PDF-1.4", "o.pdf"), (b"not a zip", "o.xlsx"), (b"\x00\x01\xff\xfe\x00", "o.csv")],
)
def test_refused_when_not_csv_or_xlsx(data, name):
    with pytest.raises(OrderFileError, match="CSV or .xlsx"):
        parse(data, name)


# Review follow-ups


def test_most_specific_header_wins():
    parsed = parse("Περιγραφή;Κωδικός;Ποσότητα;Τιμή;Τιμή μονάδας\nΒίδα;2001;3;66;22\n".encode(), "o.csv")
    assert parsed.columns == {"item": 1, "qty": 2, "price": 4}
    assert summary(parsed) == [(2, "2001", 3, 22.0, None)]


@pytest.mark.parametrize("qty_header", ["ΠΟΣΟΤΗΤΑ", "Ποσοτητα", "Ποσότητα:", "Ποσότητα (τεμ.)"])
def test_header_variants(qty_header):
    parsed = parse(f"Item;{qty_header}\nx;2\n".encode(), "o.csv")
    assert parsed.columns["qty"] == 1


def test_total_rows_are_whole_words():
    csv = "Item,Qty\nTotally Tea,1\nΓενικό Σύνολο,3\nTotal:,4\n"
    assert [r.item_text for r in parse(csv.encode(), "o.csv").rows] == ["Totally Tea"]


@pytest.mark.parametrize(
    ("text", "value"), [("1.000", 1000), ("1.815,00", 1815.0), ("1,815.00", 1815.0), ("22,5", 22.5)]
)
def test_number_formats(text, value):
    parsed = parse(f'Item;Qty;Price\nx;1;"{text}"\n'.encode(), "o.csv")
    assert parsed.rows[0].file_price == value


def test_greek_thousands_quantity():
    assert parse(b"Item;Qty\nx;1.000\n", "o.csv").rows[0].qty == 1000


def test_cr_only_line_endings():
    assert summary(parse("Κωδικός,Ποσότητα\rA1,3\r".encode(), "o.csv")) == [(2, "A1", 3, None, None)]


def test_row_limit_counts_rows_after_a_long_preamble():
    rows = [[f"line {i}"] for i in range(20)] + [["x", 1]] * 501
    with pytest.raises(OrderFileError, match="500"):
        parse(xlsx(("S", rows)), "o.xlsx", columns={"item": 0, "qty": 1})


@pytest.mark.parametrize("columns", [{"item": 0, "qty": 9}, {"item": 0, "qty": -1}, {"item": 0, "bogus": 1}])
def test_bad_columns_are_refused(columns):
    with pytest.raises(OrderFileError, match="Pick the columns again"):
        parse(b"a,b\nx,1\n", "o.csv", columns=columns)


def test_columns_without_qty_reports_missing():
    assert parse(b"a,b\nx,1\n", "o.csv", columns={"item": 0}).missing == ["qty"]
