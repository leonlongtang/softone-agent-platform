// Flows 1 to 6 from DESIGN.md → Testing → Flows covered. The fake blocks create_order until "yes",
// then inserts order 5006.
import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/reset"); // reseed and drop the chat, so 5006 can be created again
});

async function askForWrite(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("region", { name: /^Orders table/ })).toBeVisible();
  // Rows must be --row tall: the virtualizer's ROW assumes it, and rem sizes (h-8) come out 28px here.
  const heights = await page.locator("tbody tr[aria-rowindex]").first().evaluate((tr) =>
    [tr.getBoundingClientRect().height, parseFloat(getComputedStyle(tr).getPropertyValue("--row"))]);
  expect(heights[0]).toBe(heights[1]);
  const composer = page.getByRole("textbox", { name: "Ask the agent" });
  await composer.fill("Create an order for customer 47");
  await composer.press("Enter");
  await expect(page.getByRole("group", { name: "Pending write: needs your approval" })).toBeVisible();
  await expect(composer).toBeDisabled();
}

const order5006 = (page: Page) => page.getByRole("row").filter({ has: page.getByRole("cell", { name: "5006", exact: true }) });

test("approve: 5006 is marked added, the chat folds, the chip reads Orders +1", async ({ page }) => {
  await askForWrite(page);
  await page.getByRole("button", { name: "Approve" }).click();

  await expect(page.getByRole("status")).toHaveText(/^Written\. Orders: 1 added\./);
  await expect(order5006(page)).toHaveAttribute("data-change", "insert");
  await expect(order5006(page).getByRole("cell").first()).toHaveText("+added");
  await expect(page.getByRole("button", { name: "Chat (1)" })).toBeVisible(); // folded
  await expect(page.getByRole("list", { name: "Changes this turn" })).toHaveText("Orders +1");
  await expect(page.getByRole("navigation", { name: "Tables" }).getByRole("button", { name: /^Orders/ })).toContainText("1 changed");
});

// Flow 1 at phone size (DESIGN.md → Responsive → Phone): the chat is a sheet below the top bar while it's open,
// a bar docked to the bottom edge while it's folded.
test("phone approve: the sheet opens on the card, Approve folds it to the docked bar", { tag: "@phone" }, async ({ page }) => {
  await askForWrite(page);
  const chat = page.getByRole("region", { name: "Chat" });
  const vp = page.viewportSize()!;
  expect(await chat.boundingBox()).toEqual({ x: 0, y: 48, width: vp.width, height: vp.height - 48 });
  const approve = page.getByRole("button", { name: "Approve" });
  await expect(approve).toBeInViewport();
  expect((await approve.boundingBox())!.y).toBeGreaterThan(vp.height * 0.6); // at the bottom, by the composer
  await expect(page.getByRole("button", { name: "Reject" })).toBeInViewport();

  await approve.click();
  await expect(order5006(page)).toHaveAttribute("data-change", "insert");
  await expect(page.getByRole("button", { name: "Chat (1)" })).toBeVisible();
  const bar = (await chat.boundingBox())!;
  expect([bar.x, bar.width, bar.y + bar.height]).toEqual([0, vp.width, vp.height]);
  await expect(page.getByRole("list", { name: "Changes this turn" })).toHaveText("Orders +1");

  // The picker stands in for the sidebar: counts and change badges per table.
  await page.getByRole("button", { name: "Table: Orders" }).click();
  await expect(page.getByRole("menuitemradio", { name: /^Orders/ })).toContainText("1 changed");
  await page.getByRole("menuitemradio", { name: /^Items/ }).click();
  await expect(page.getByRole("region", { name: /^Items table/ })).toBeVisible();

  // A chip in the open sheet folds it, then jumps.
  await page.getByRole("button", { name: "Chat (1)" }).click();
  await page.getByRole("button", { name: "Orders +1" }).click();
  await expect(page.getByRole("button", { name: "Chat (1)" })).toBeVisible();
  await expect(page.getByRole("region", { name: /^Orders table/ })).toBeFocused();
  await expect(order5006(page)).toBeInViewport();
});

test("chip jump: from another table, Orders +1 selects Orders with 5006 in view", async ({ page }) => {
  await askForWrite(page);
  const card = page.getByRole("group", { name: "Pending write: needs your approval" });
  await expect(card.getByRole("button")).toHaveText(["Approve", "Reject"]); // a create names no existing row
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(order5006(page)).toHaveAttribute("data-change", "insert");

  await page.getByRole("navigation", { name: "Tables" }).getByRole("button", { name: /^Items/ }).click();
  await page.getByRole("searchbox", { name: "Filter Items" }).fill("zzz");
  const onlyChanged = page.getByRole("checkbox", { name: "Only rows changed this turn" });
  await onlyChanged.check();
  await page.getByRole("button", { name: "Orders +1" }).click();

  const table = page.getByRole("region", { name: /^Orders table/ });
  await expect(table).toBeFocused();
  await expect(order5006(page)).toBeInViewport();
  await expect(order5006(page)).toHaveAttribute("data-flash", "true");
  await expect(page.getByRole("status")).toHaveText(/^Orders, row \d+: added\. Change 1 of 1\.$/);
  await expect(page.getByRole("searchbox", { name: "Filter Orders" })).toHaveValue("");
  await expect(onlyChanged).not.toBeChecked();

  // Back to Orders by the sidebar: a fresh table, not a replay of the jump.
  const nav = page.getByRole("navigation", { name: "Tables" });
  await nav.getByRole("button", { name: /^Items/ }).click();
  await nav.getByRole("button", { name: /^Orders/ }).click();
  await expect(nav.getByRole("button", { name: /^Orders/ })).toBeFocused();
  await expect(page.locator("tr[data-flash]")).toHaveCount(0);
});

test("row link: an update naming an existing item jumps far down the table", async ({ page }) => {
  // The fake only creates orders, so this card comes from a canned reply: update the last of 305 items.
  await page.route("**/api/turn", (route) => route.fulfill({ json: {
    response: "", pending: true, diff: null,
    trace: [{ tool: "update_item", args: { name_or_id: "2300", price: 1 }, status: "blocked" }],
  } }));
  await page.goto("/");
  const composer = page.getByRole("textbox", { name: "Ask the agent" });
  await composer.fill("Set item 2300's price to 1");
  await composer.press("Enter");
  await page.getByRole("button", { name: "Items #2300" }).click();

  const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "2300", exact: true }) });
  await expect(page.getByRole("region", { name: /^Items table/ })).toBeFocused();
  await expect(row).toBeInViewport();
  await expect(page.getByRole("status")).toHaveText("Items, row 305.");
  await expect(page.getByRole("button", { name: "Chat (1)" })).toBeEnabled(); // folded mid-approval, can reopen
});

test("reject: nothing was written and no row is highlighted", async ({ page }) => {
  await askForWrite(page);
  await page.getByRole("button", { name: "Reject" }).click();

  await expect(page.getByText("Okay, nothing was written.")).toBeVisible();
  await expect(page.locator("tr[data-change]")).toHaveCount(0);
  await expect(order5006(page)).toHaveCount(0);
});

// DESIGN.md → Responsive → Check sizes: only the table area scrolls sideways. The root clips its overflow, so the
// top bar and table bar are checked too: they'd hide a control rather than scroll the page.
test("no sideways scroll at the check sizes", async ({ page }) => {
  for (const [width, height] of [[375, 667], [768, 1024], [1024, 768], [1280, 720], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.getByRole("region", { name: /^Orders table/ })).toBeVisible();
    const over = await page.evaluate(() =>
      [document.documentElement, document.querySelector("header"), document.querySelector("main > div")]
        .filter((el) => el && el.scrollWidth > (el === document.documentElement ? innerWidth : el.clientWidth))
        .map((el) => el!.tagName));
    expect(over, `${width}×${height}`).toEqual([]);
  }
});

test("backend down: Can't reach the API, with Retry", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByText("Can't reach the API")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

/** A keydown by physical key with a non-US `key`, as a Greek layout sends it; true if the page claimed it. */
const press = (page: Page, init: { code: string; key: string; shiftKey?: boolean; ctrlKey?: boolean }) =>
  page.evaluate((i) => !(document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...i })), init);

test("keyboard approve: Enter on the card writes nothing; Tab, Enter approves; Esc, ] lands on 5006", async ({ page }) => {
  await page.goto("/");
  const table = page.getByRole("region", { name: /^Orders table/ });
  await expect(table).toBeVisible();

  // ? opens the shortcuts dialog (Shift + the Slash key, whatever the layout prints).
  await press(page, { code: "Slash", key: "΄", shiftKey: true });
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Ctrl+F focuses the filter; pressed again there, it's left to the browser's find. Esc on an empty filter: the table.
  const filter = page.getByRole("searchbox", { name: "Filter Orders" });
  expect(await press(page, { code: "KeyF", key: "φ", ctrlKey: true })).toBe(true);
  await expect(filter).toBeFocused();
  expect(await press(page, { code: "KeyF", key: "φ", ctrlKey: true })).toBe(false);
  await page.keyboard.press("Escape");
  await expect(table).toBeFocused();

  // / focuses the composer; ask for a write.
  await press(page, { code: "Slash", key: "." });
  const composer = page.getByRole("textbox", { name: "Ask the agent" });
  await expect(composer).toBeFocused();
  await page.keyboard.type("Create an order for customer 47");
  await page.keyboard.press("Enter");
  let turns = 0;
  page.on("request", (r) => { if (r.url().endsWith("/api/turn")) turns++; });
  const card = page.getByRole("group", { name: "Pending write: needs your approval" });
  await expect(card).toBeFocused();

  await page.keyboard.press("Enter"); // a stray Enter on the card
  await expect(card.getByRole("button", { name: "Approve" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(card.getByRole("button", { name: "Approve" })).toBeFocused();
  expect(turns).toBe(0); // the stray Enter sent nothing (a decision is a request, sent on the press)
  await expect(order5006(page)).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(order5006(page)).toHaveAttribute("data-change", "insert");
  await expect(composer).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(table).toBeFocused();
  await press(page, { code: "BracketRight", key: "ψ" });
  await expect(page.getByRole("navigation", { name: "Tables" }).getByRole("button", { name: /^Orders/ })).toHaveAttribute("aria-current", "true");
  await expect(table).toBeFocused();
  await expect(order5006(page)).toBeInViewport();
  await expect(order5006(page)).toHaveAttribute("data-flash", "static"); // keys don't animate
  await expect(page.getByRole("status")).toHaveText(/^Orders, row \d+: added\. Change 1 of 1\.$/);
});

test("runtime menu: confirms cancel cleanly, the switch starts a new chat, Reset reseeds, the theme flips", async ({ page }) => {
  await askForWrite(page);
  await page.getByRole("button", { name: "Approve" }).click();
  const changed = page.locator("tr[data-change]");
  await expect(changed).toHaveCount(1);

  const menu = page.getByRole("button", { name: /^(Ollama|Claude)/ });
  const open = async (item: string) => {
    await menu.click();
    await page.getByRole(item.includes("·") ? "menuitemradio" : "menuitem", { name: item }).click();
  };
  for (const item of ["New chat", "Claude · paid per turn", "Reset demo data…"]) {
    await open(item);
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(changed).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Chat (1)" })).toBeVisible();
    await expect(menu).toHaveText(/Ollama/);
  }

  await open("Claude · paid per turn");
  await expect(page.getByRole("dialog")).toContainText("billed");
  await page.getByRole("button", { name: "Switch to Claude" }).click();
  await expect(menu).toHaveText(/Claude/);
  await expect(page.getByText("Ask the sales, inventory or finance agent.")).toBeVisible(); // a new, empty chat
  await expect(changed).toHaveCount(0);
  await expect(order5006(page)).toHaveCount(1); // the database is not touched

  await open("Reset demo data…");
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await expect(order5006(page)).toHaveCount(0);

  const meta = page.locator('meta[name="theme-color"]');
  await expect(meta).toHaveAttribute("content", "#171513");
  await open("Light theme");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(meta).toHaveAttribute("content", "#f6f4f0");
});
