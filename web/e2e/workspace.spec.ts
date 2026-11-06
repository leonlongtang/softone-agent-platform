// Flows 1 to 4 from DESIGN.md → Testing → Flows covered. The fake blocks create_order until "yes",
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

test("backend down: Can't reach the API, with Retry", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByText("Can't reach the API")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});
