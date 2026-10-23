import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Layout audit across 17 screen sizes, on every screen and state (animations off so the final layout is
 * measured): no sideways overflow, no text off-screen or overlapping other text, no text under 11px, and
 * 44px touch targets on touch screens. Runs once (desktop project).
 */
const VIEWPORTS = [[320,568,1],[360,740,1],[390,844,1],[393,852,1],[430,932,1],[844,390,1],[768,1024,1],[820,1180,1],[1024,768,0],[1024,1366,1],[1280,600,0],[1280,800,0],[1366,768,0],[1440,900,0],[1536,864,0],[1920,1080,0],[2560,1440,0]] as const;

async function audit(page: Page, touch: number, scope?: string): Promise<string[]> {
  return page.evaluate(({ touch, scope }) => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    const root = scope ? document.querySelector(scope)! : document.body;
    if (document.documentElement.scrollWidth > vw + 1) out.push(`page overflow ${document.documentElement.scrollWidth}>${vw}`);
    for (const el of root.querySelectorAll<HTMLElement>("*")) {
      const cs = getComputedStyle(el);
      if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) out.push(`sideways scroll in ${el.tagName} ${el.scrollWidth}>${el.clientWidth}`);
    }
    const hidden = (el: Element) => { for (let e: Element | null = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return true; } return false; };
    const skip = (el: Element) => !scope && !!el.closest('[data-testid="floating"],[data-testid="toast"],[role="dialog"]');
    const leaves = [...root.querySelectorAll("*")].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim().length > 1));
    const boxes: { el: Element; txt: string; rs: { l: number; t: number; r: number; b: number }[] }[] = [];
    for (const el of leaves) {
      if (hidden(el) || skip(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) continue;
      const txt = el.textContent!.trim().slice(0, 40);
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 11) out.push(`tiny text ${fs}px "${txt}"`);
      if (r.right > vw + 1 || r.left < -1) out.push(`offscreen x ${Math.round(r.left)}..${Math.round(r.right)} "${txt}"`);
      const rg = document.createRange(); rg.selectNodeContents(el);
      boxes.push({ el, txt, rs: [...rg.getClientRects()].filter((x) => x.width > 1)
        .map((x) => ({ l: Math.max(x.left, r.left), r: Math.min(x.right, r.right), t: x.top + x.height * 0.3, b: x.bottom - x.height * 0.3 })).filter((x) => x.r - x.l > 1) });
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i]!, B = boxes[j]!;
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      if (A.rs.some((a) => B.rs.some((c) => Math.min(a.r, c.r) - Math.max(a.l, c.l) > 3 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 3))) out.push(`overlap "${A.txt}" × "${B.txt}"`);
    }
    if (touch) for (const el of root.querySelectorAll('[role="button"],[role="link"],[role="tab"],[role="radio"],[role="checkbox"],a,button,input,textarea')) {
      if (hidden(el) || skip(el)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      if (r.height < 43.5 && r.width < 200) out.push(`small target ${Math.round(r.width)}x${Math.round(r.height)} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}"`);
    }
    return [...new Set(out)];
  }, { touch, scope });
}

const settle = (p: Page) => p.waitForTimeout(350);

for (const [w, h, touch] of VIEWPORTS) {
  test(`layout ${w}x${h}: every screen`, async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "the matrix sets its own viewports");
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!touch, isMobile: !!touch && w < 1024, reducedMotion: "reduce", baseURL: info.project.use.baseURL });
    const page = await ctx.newPage();
    const issues: string[] = [];
    const check = async (tag: string, scope?: string) => { await settle(page); issues.push(...(await audit(page, touch, scope)).map((x) => `${tag}: ${x}`)); };

    await page.goto("/"); await check("landing");
    await page.goto("/new"); await check("new group");
    await page.goto("/join?t=nope"); await page.getByText("This invite link doesn't work").waitFor({ timeout: 20_000 }); await check("bad invite");
    await page.goto("/import");
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("pick").click();
    await (await chooser).setFiles("tests/fixtures/splitwise-goa.csv");
    await page.getByTestId("totals-check").waitFor(); await check("import preview");

    await page.goto("/demo"); await page.getByTestId("summary").waitFor({ timeout: 20_000 });
    for (const t of ["Expenses", "Balances", "Settle up", "Activity"]) { await page.getByRole("tab", { name: t }).click(); await check(`group/${t}`); }
    await page.getByRole("tab", { name: "Settle up" }).click();
    await page.getByRole("button", { name: /Record payment/ }).first().click();
    await page.getByRole("dialog").waitFor(); await check("pay sheet", '[role="dialog"]');
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Invite people" }).click(); await page.getByRole("heading", { name: "Group link" }).waitFor(); await check("invite");
    await page.goto("/settings?group=demo-goa"); await page.getByText("People").first().waitFor(); await check("settings");
    await page.goto("/expense?group=demo-goa"); await page.getByLabel("Amount in rupees").fill("1234.5"); await check("add expense/equal");
    await page.getByRole("tab", { name: "Amounts" }).click(); await check("add expense/amounts");
    await ctx.close();
    expect(issues).toEqual([]);
  });
}

for (const [w, h, touch] of VIEWPORTS) {
  test(`first screen ${w}x${h}: headline and the main action are visible`, async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "the matrix sets its own viewports");
    test.skip(h < 500, "landscape phone: too short for any hero; it scrolls");
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!touch, isMobile: !!touch && w < 1024, reducedMotion: "reduce", baseURL: info.project.use.baseURL });
    const page = await ctx.newPage();
    await page.goto("/");
    const h1 = (await page.getByRole("heading", { name: /Split the bill/ }).boundingBox())!;
    const cta = (await page.getByRole("button", { name: "Start a group" }).boundingBox())!;
    expect(h1.y).toBeGreaterThanOrEqual(0);
    expect(cta.y + cta.height, `Start a group at ${Math.round(cta.y)}`).toBeLessThanOrEqual(h);
    await ctx.close();
  });
}

for (const [w, h, touch] of [[390, 844, 1], [768, 1024, 1], [1280, 600, 0], [1440, 900, 0]] as const) {
  test(`scrolling with animations ${w}x${h}: nothing overlaps once settled`, async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "the matrix sets its own viewports");
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!touch, isMobile: !!touch && w < 1024, baseURL: info.project.use.baseURL });
    const page = await ctx.newPage();
    const walk = async (tag: string) => {
      const out: string[] = [];
      for (let k = 0; k < 8; k++) {
        await page.mouse.move(w / 2, h / 2);
        await page.mouse.wheel(0, k === 0 ? 0 : Math.round(h * 0.8));
        await page.waitForTimeout(900);
        out.push(...(await audit(page, 0)).filter((x) => !x.startsWith("small target")).map((x) => `${tag} #${k}: ${x}`));
      }
      return [...new Set(out)];
    };
    await page.goto("/"); await page.waitForTimeout(900);
    const issues = await walk("landing");
    await page.goto("/demo"); await page.getByTestId("summary").waitFor({ timeout: 20_000 }); await page.waitForTimeout(700);
    issues.push(...(await walk("group")));
    await ctx.close();
    expect(issues).toEqual([]);
  });
}

void readFileSync;
