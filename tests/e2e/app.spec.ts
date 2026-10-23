import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

const errorsOf = (page: Page) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource.*404/.test(m.text())) errs.push(m.text()); });
  return errs;
};
const toast = (p: Page) => p.getByTestId("toast");
const tab = (p: Page, name: string) => p.getByRole("tab", { name });
const openDemo = async (p: Page) => {
  await p.goto("/");
  await p.evaluate(() => localStorage.clear());
  await p.goto("/demo");
  await expect(p.getByTestId("summary")).toBeVisible({ timeout: 20_000 });
};

/** Archives groups a test made in the real database, using that browser's own session. */
async function archive(page: Page, groupId: string) {
  await page.evaluate(async (id) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))!;
    const token = JSON.parse(localStorage.getItem(key)!).access_token;
    const url = `https://fifddxxfgrdexedhuyao.supabase.co/rest/v1/groups?id=eq.${id}`;
    const apikey = (window as unknown as { __SS_KEY?: string }).__SS_KEY ?? "";
    await fetch(url, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, apikey, "Content-Type": "application/json", "Content-Profile": "split" }, body: JSON.stringify({ archived_at: new Date().toISOString() }) });
  }, groupId);
}

test("landing: the pitch, three ways in, no errors", async ({ page }) => {
  const errs = errorsOf(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Split the bill/ })).toBeVisible();
  for (const b of ["Start a group", "Try the demo", "Import from Splitwise"]) await expect(page.getByRole("button", { name: b })).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.json");
  expect(errs).toEqual([]);
});

test.describe("demo group", () => {
  test.beforeEach(async ({ page }) => openDemo(page));

  test("shows your balance, the spend and the expense list", async ({ page }) => {
    await expect(page.getByTestId("summary")).toContainText("You get back");
    await expect(page.getByTestId("summary")).toContainText("₹82,960");
    await expect(page.getByRole("button", { name: /Parasailing, ₹4,500, paid by Kavya/ })).toBeVisible();
  });

  test("add an equal-split expense; it appears and the balance moves", async ({ page }) => {
    const before = await page.getByTestId("summary").innerText();
    await page.getByTestId("add-expense").click();
    await page.getByLabel("Amount in rupees").fill("1000");
    await page.getByLabel("What was it for?").fill("Sunset cruise");
    await expect(page.getByTestId("split-status")).toContainText("4 people · ₹250 each");
    await page.getByTestId("save-expense").click();
    await expect(toast(page)).toContainText("Expense added");
    await expect(page.getByRole("button", { name: /Sunset cruise, ₹1,000, paid by you/ })).toBeVisible();
    expect(await page.getByTestId("summary").innerText()).not.toBe(before);
  });

  test("₹100 split three ways is 33.34 + 33.33 + 33.33", async ({ page }) => {
    await page.getByTestId("add-expense").click();
    await page.getByLabel("Amount in rupees").fill("100");
    await page.getByLabel("Include Priya").click();
    await expect(page.getByTestId("split-status")).toContainText("3 people");
    await expect(page.getByLabel("Include Arjun")).toContainText("₹33.34");
    await expect(page.getByLabel("Include Kavya")).toContainText("₹33.33");
  });

  test("exact amounts and percentages must add up, with a clear message", async ({ page }) => {
    await page.getByTestId("add-expense").click();
    await page.getByLabel("Amount in rupees").fill("1000");
    await page.getByLabel("What was it for?").fill("Tickets");
    await tab(page, "Amounts").click();
    await page.getByLabel("Amount for Arjun").fill("600");
    await page.getByLabel("Amount for Kavya").fill("300");
    await expect(page.getByTestId("split-status")).toContainText("₹100 left to assign");
    await page.getByLabel("Amount for Rohan").fill("100");
    await expect(page.getByTestId("split-status")).toContainText("Adds up exactly");
    await tab(page, "%").click();
    await page.getByLabel("Percent for Arjun").fill("50");
    await page.getByLabel("Percent for Kavya").fill("40");
    await expect(page.getByTestId("split-status")).toContainText("Percentages add up to 90%, not 100%");
    await tab(page, "Shares").click();
    await page.getByLabel("Shares for Arjun").fill("2");
    await page.getByLabel("Shares for Kavya").fill("1");
    await page.getByLabel("Shares for Rohan").fill("1");
    await expect(page.getByTestId("split-status")).toContainText("Adds up exactly");
    await page.getByTestId("save-expense").click();
    await expect(page.getByRole("button", { name: /Tickets, ₹1,000/ })).toBeVisible();
  });

  test("edit, delete and restore an expense", async ({ page }) => {
    await page.getByRole("button", { name: /Breakfast at Artjuna/ }).click();
    await page.getByLabel("What was it for?").fill("Breakfast at Artjuna (edited)");
    await page.getByTestId("save-expense").click();
    await expect(page.getByRole("button", { name: /Breakfast at Artjuna \(edited\)/ })).toBeVisible();
    await page.getByRole("button", { name: /Breakfast at Artjuna \(edited\)/ }).click();
    await page.getByRole("button", { name: "Delete expense" }).click();
    await expect(page.getByRole("button", { name: /Breakfast at Artjuna/ })).toHaveCount(0);
    await page.getByRole("button", { name: /Show deleted expenses/ }).click();
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByRole("button", { name: /Breakfast at Artjuna \(edited\)/ })).toBeVisible();
    await tab(page, "Activity").click();
    await expect(page.getByText(/You restored “Breakfast at Artjuna \(edited\)”/)).toBeVisible();
    await expect(page.getByText(/You deleted/)).toBeVisible();
  });

  test("settle up: suggestions, pay sheet with UPI QR, record and undo", async ({ page, isMobile }) => {
    await tab(page, "Settle up").click();
    const sug = page.getByTestId("suggestion");
    const n = await sug.count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(3);
    const kavyaToMe = sug.filter({ hasText: "pays you" }).first();
    await kavyaToMe.getByRole("button", { name: "Record payment received" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Record UPI payment" }).click();
    await expect(toast(page)).toContainText("Recorded");
    await expect(page.getByText("Recorded payments")).toBeVisible();
    expect(await sug.count()).toBe(n - 1);
    await page.getByRole("button", { name: /Undo payment/ }).first().click();
    await expect(toast(page)).toContainText("Payment undone");
    expect(await sug.count()).toBe(n);
    if (!isMobile) {
      // "You pay" rows show a scannable UPI QR on a laptop
      await page.getByRole("button", { name: /Group settings/ }).click();
      await page.getByLabel("Your UPI ID").fill("not-a-upi");
      await expect(page.getByText(/doesn't look like a UPI ID/)).toBeVisible();
      await page.getByLabel("Your UPI ID").fill("arjun@okhdfcbank");
    }
  });

  test("balances add up to zero across the group", async ({ page }) => {
    await tab(page, "Balances").click();
    const text = await page.getByText(/^(gets|owes) ₹/).allInnerTexts();
    const sum = text.reduce((s, x) => s + (x.startsWith("gets") ? 1 : -1) * Number(x.replace(/[^\d.]/g, "")), 0);
    expect(Math.abs(sum)).toBeLessThan(0.005);
  });

  test("invite screen: a personal link for the person who hasn't joined, and a group QR", async ({ page }) => {
    await page.getByRole("button", { name: "Invite people" }).click();
    await expect(page.getByRole("button", { name: "Copy Rohan's link" })).toBeVisible();
    await expect(page.getByRole("img", { name: "QR code for the group invite link" })).toBeVisible();
  });

  test("demo reset goes back to the landing page", async ({ page }) => {
    await page.getByRole("button", { name: "Group settings" }).click();
    await page.getByRole("button", { name: "Reset the demo" }).click();
    await expect(page.getByRole("heading", { name: /Split the bill/ })).toBeVisible();
  });
});

test("an invalid invite link explains itself", async ({ page }) => {
  await page.goto("/join?t=deadbeefdeadbeef");
  await expect(page.getByText("This invite link doesn't work")).toBeVisible({ timeout: 20_000 });
});

test("Splitwise import: preview checks totals, then creates a real group", async ({ page, browserName }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough (creates real data)");
  await page.goto("/import");
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("pick").click();
  await (await chooser).setFiles("tests/fixtures/splitwise-goa.csv");
  await expect(page.getByTestId("totals-check")).toContainText("Matches Splitwise's own");
  await page.getByRole("radio", { name: "Bilal Khan" }).click();
  await page.getByLabel("Group name").fill("E2E · Goa from Splitwise");
  await page.getByTestId("do-import").click();
  await expect(page.getByTestId("summary")).toContainText("You get back", { timeout: 20_000 });
  await expect(page.getByTestId("summary")).toContainText("₹9,283.33");
  const id = new URL(page.url()).searchParams.get("id")!;
  await archive(page, id);
  void browserName;
});

test("two friends, live: create → personal invite → join → realtime expense → settle", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough (creates real data)");
  const [a, b] = await Promise.all([fresh(browser), fresh(browser)]);
  await a.goto("/new");
  await a.getByLabel("Group name").fill("E2E · Flat 4B");
  await a.getByLabel("Your name").fill("Asha");
  await a.getByRole("textbox", { name: "Friend 1" }).fill("Bilal");
  await a.getByTestId("create").click();
  await expect(a.getByTestId("summary")).toBeVisible({ timeout: 20_000 });
  const gid = new URL(a.url()).searchParams.get("id")!;

  await a.getByRole("button", { name: "Invite people" }).click();
  await a.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await a.getByRole("button", { name: "Copy Bilal's link" }).click();
  const link = await a.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/join\?t=[0-9a-f]{24}$/);

  await b.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await expect(b.getByText("This link was made for")).toBeVisible({ timeout: 20_000 });
  await b.getByTestId("join").click();
  await expect(b.getByTestId("summary")).toBeVisible({ timeout: 20_000 });

  // the personal link is single-use
  const c = await fresh(browser);
  await c.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await expect(c.getByText("This invite link doesn't work")).toBeVisible({ timeout: 20_000 });

  await a.goto(`/group?id=${gid}`);
  await expect(a.getByTestId("summary")).toBeVisible();
  await b.getByTestId("add-expense").click();
  await b.getByLabel("Amount in rupees").fill("2400");
  await b.getByLabel("What was it for?").fill("Electricity bill");
  await b.getByTestId("save-expense").click();
  await expect(b.getByRole("button", { name: /Electricity bill/ })).toBeVisible();
  // Asha sees it without reloading
  await expect(a.getByRole("button", { name: /Electricity bill, ₹2,400, paid by Bilal/ })).toBeVisible({ timeout: 20_000 });
  await expect(a.getByTestId("summary")).toContainText("You owe");
  await expect(a.getByTestId("summary")).toContainText("₹1,200");

  // Asha can't edit Bilal's expense
  await a.getByRole("button", { name: /Electricity bill/ }).click();
  await expect(a.getByText("Only the person who added this expense or the group admin can change it.")).toHaveCount(0); // Asha is the admin
  await a.goBack();

  await a.getByRole("tab", { name: "Settle up" }).click();
  await a.getByRole("button", { name: "Pay with UPI" }).click();
  await expect(a.getByText(/hasn't added a UPI ID yet/)).toBeVisible();
  await a.getByRole("button", { name: "Record UPI payment" }).click();
  await expect(a.getByText("Everyone is settled up")).toBeVisible({ timeout: 20_000 });
  await b.getByRole("tab", { name: "Activity" }).click();
  await expect(b.getByText(/Asha recorded Asha → Bilal · ₹1,200/)).toBeVisible({ timeout: 20_000 });

  await archive(a, gid);
  for (const p of [a, b, c]) await p.context().close();
});

async function fresh(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: process.env.BASE_URL ?? "http://localhost:3400", viewport: { width: 1280, height: 860 } });
  const p = await ctx.newPage();
  await p.addInitScript((k) => { (window as unknown as { __SS_KEY: string }).__SS_KEY = k; }, readFileSync(".env.local", "utf8").match(/EXPO_PUBLIC_SUPABASE_KEY=(.*)/)![1]!);
  return p;
}

test("with 'reduce motion' on, everything is visible without animation", async ({ browser }, info) => {
  const ctx = await browser.newContext({ ...info.project.use, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Split the bill/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a group" })).toBeVisible();
  expect(await page.evaluate(() => document.body.innerText)).toContain("Split the bill");
  await page.goto("/demo");
  await expect(page.getByRole("button", { name: /Parasailing/ })).toBeVisible({ timeout: 20_000 });
  await ctx.close();
});

test("saving an expense opened directly (after a refresh) returns to the group", async ({ page }) => {
  await openDemo(page);
  await page.goto("/expense?group=demo-goa");
  await page.getByLabel("Amount in rupees").fill("500");
  await page.getByLabel("What was it for?").fill("Chai and samosa");
  await page.getByTestId("save-expense").click();
  await expect(page.getByRole("button", { name: /Chai and samosa, ₹500/ })).toBeVisible();
});

test("desktop uses the width: summary beside the list, form beside the split", async ({ page, isMobile }) => {
  await openDemo(page);
  const summary = (await page.getByTestId("summary").boundingBox())!;
  const tabs = (await page.getByRole("tablist").first().boundingBox())!;
  if (isMobile) expect(tabs.y).toBeGreaterThan(summary.y + summary.height - 1);
  else { expect(tabs.x).toBeGreaterThan(summary.x + summary.width); expect(Math.abs(tabs.y - summary.y)).toBeLessThan(120); }
  await page.goto("/expense?group=demo-goa");
  const amount = (await page.getByLabel("Amount in rupees").boundingBox())!;
  const split = (await page.getByRole("tab", { name: "Equally" }).boundingBox())!;
  if (!isMobile) expect(split.x).toBeGreaterThan(amount.x + 300);
});

test("after trying the demo, the home page still explains the app", async ({ page }) => {
  await openDemo(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Split the bill/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue the demo" })).toBeVisible();
  await expect(page.getByText("Fair to the paisa")).toBeVisible();
});
