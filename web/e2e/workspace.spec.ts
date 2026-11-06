// Flows 1, 2 and 4 from DESIGN.md → Testing → Flows covered. The fake blocks create_order until "yes",
// then inserts order 5006.
import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/reset"); // reseed and drop the chat, so 5006 can be created again
});

async function askForWrite(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("region", { name: /^Orders table/ })).toBeVisible();
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
