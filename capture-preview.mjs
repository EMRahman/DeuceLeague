import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1340, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(resolve("docs/for-coaches.html")).href);
  await page.addStyleTag({
    content: `
      main { max-width: 1220px !important; }
      .phones { overflow: visible !important; justify-content: center; scrollbar-width: none !important; }
    `,
  });
  await page.locator(".phone iframe").first().contentFrame().locator("body").waitFor();
  await page.waitForTimeout(750);
  await page.locator(".phones").screenshot({ path: "product-preview.png" });
} finally {
  await browser.close();
}
