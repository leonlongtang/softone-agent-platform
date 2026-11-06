// Flow 7 (DESIGN.md → Testing → Flows covered, order-file#05): a client's .xlsx dropped on the chat, its open rows fixed,
// Propose, Approve, then the database. The sheet comes from tests/order_xlsx.py.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

type Rows = Record<string, Record<string, number | string>[]>;

test.beforeEach(async ({ request }) => {
  await request.post("/api/reset");
});

test("order file: drop, fix the open rows, propose, approve; one order with the file's lines; then invoice goes to finance", async ({ page, request }) => {
  const path = test.info().outputPath("papadopoulos_order_nov.xlsx");
  execFileSync("uv", ["run", "python", "-m", "tests.order_xlsx", path], { cwd: ".." });
  const before = (await (await request.get("/api/db")).json() as Rows).orders.length;

  await page.goto("/");
  await expect(page.getByRole("region", { name: /^Orders table/ })).toBeVisible();
  const transfer = await page.evaluateHandle((b64) => {
    const t = new DataTransfer();
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    t.items.add(new File([bytes], "papadopoulos_order_nov.xlsx"));
    return t;
  }, readFileSync(path).toString("base64"));
  await page.getByRole("region", { name: "Chat" }).dispatchEvent("drop", { dataTransfer: transfer });

  // Logo rows and ΑΦΜ above the table: the header is found under them and the ΑΦΜ fills in customer 47.
  const card = page.getByRole("group", { name: "Order file papadopoulos_order_nov.xlsx" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Soft One Technologies S.A.");
  const rows = card.getByRole("list", { name: "Rows" }).getByRole("listitem");
  await expect(rows).toHaveCount(4); // the Σύνολο row is not a line
  await expect(rows.nth(0)).toContainText(/Row 6\s*OK.*file €22,00/);
  await expect(rows.nth(1)).toContainText(/Row 7\s*PICK/);
  await expect(rows.nth(2)).toContainText(/Row 8\s*NO ITEM/);
  await expect(rows.nth(3)).toContainText(/Row 9\s*OK/);
  await expect(card.getByRole("button", { name: "Propose" })).toBeDisabled();
  await expect(card).toContainText("Fix or skip the open rows first.");
  await expect(page.getByRole("textbox", { name: "Ask the agent" })).toBeDisabled();

  await card.getByRole("button", { name: /DOCK-01 Docking Station 1 .* for row 7$/ }).click();
  await expect(rows.nth(1)).toContainText(/Row 7\s*OK/);
  await card.getByRole("button", { name: "Skip row 8" }).click();
  await expect(rows.nth(2)).toContainText(/Row 8\s*SKIPPED/);

  const proposed = page.waitForResponse((r) => r.url().endsWith("/api/order-file/propose"));
  await card.getByRole("button", { name: "Propose" }).click();
  const stored = await (await proposed).json();
  const pending = page.getByRole("group", { name: "Pending write: needs your approval" });
  await expect(pending.getByRole("row")).toHaveText([
    /Row.*Item.*Qty.*Price.*Line total/,
    /^6.*MOUSE-01 Wireless Mouse.*1.*€25,00.*file €22,00.*€25,00$/,
    /^7.*DOCK-01 Docking Station 1.*1.*€110,00.*€110,00$/,
    /^9.*KEYB-01 Mechanical Keyboard.*2.*€80,00.*€160,00$/,
    /Total.*€295,00/,
  ]);
  await expect(pending).toContainText("Skipped rows: 8");
  expect(stored.status).toBe("Confirmed"); // €295 is under AUTO_APPROVE_THRESHOLD (€1.000)
  await expect(pending).toContainText("Starts as Confirmed");

  const approved = page.waitForResponse((r) => r.url().endsWith("/api/turn"));
  await pending.getByRole("button", { name: "Approve" }).click();
  const { response } = await (await approved).json();
  const id = Number(/^Order (\d+) created for Soft One Technologies S\.A\. \(47\) from papadopoulos_order_nov\.xlsx: 3 lines, €295,00, Confirmed\.$/.exec(response)?.[1]);
  expect(id).toBeGreaterThan(0);

  // The database: exactly one new order, with the resolved lines at SoftOne's prices (not the file's 22).
  const db = await (await request.get("/api/db")).json() as Rows;
  expect(db.orders).toHaveLength(before + 1);
  expect(db.orders.find((o) => o.id === id)).toMatchObject({ customer_id: 47, total: 295, status: "Confirmed" });
  expect(db.order_items.filter((l) => l.order_id === id).map((l) => [l.product_id, l.quantity, l.price])).toEqual([
    [1002, 1, 25], [2003, 1, 110], [1003, 2, 80],
  ]);
  const again = await request.post("/api/turn", { data: { decision: "approve" } });
  expect(again.status()).toBe(409); // nothing left to run: no second write

  // Approve set the department to sales: a turn with no department words stays there (with none set, it'd be
  // clarify), and "invoice that order" goes on to finance.
  const composer = page.getByRole("textbox", { name: "Ask the agent" });
  const send = async (text: string) => {
    await expect(composer).toBeEnabled();
    const turn = page.waitForResponse((r) => r.url().endsWith("/api/turn"));
    await composer.fill(text);
    await composer.press("Enter");
    return (await (await turn).json()).route;
  };
  expect(await send("thanks")).toBe("sales");
  expect(await send("invoice that order")).toBe("finance");
});
