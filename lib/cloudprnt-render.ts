import chromium from "@sparticuz/chromium";
import playwright from "playwright-core";

let cachedBrowser: Awaited<ReturnType<typeof playwright.chromium.launch>> | null = null;

async function getBrowser() {
  if (cachedBrowser) return cachedBrowser;

  const executablePath = await chromium.executablePath();
  cachedBrowser = await playwright.chromium.launch({
    args: chromium.args,
    executablePath,
    headless: true
  });
  return cachedBrowser;
}

export async function renderReceiptHtmlToPng(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: { width: 576, height: 1200 },
    deviceScaleFactor: 2
  });

  try {
    await page.setContent(html, { waitUntil: "load" });
    const body = await page.$("body");
    if (!body) {
      throw new Error("Failed to render receipt body.");
    }

    const box = await body.boundingBox();
    const clipHeight = Math.max(1200, Math.ceil(box?.height ?? 1200));
    await page.setViewportSize({ width: 576, height: Math.min(clipHeight + 8, 16384) });

    const screenshot = await page.screenshot({
      type: "png",
      fullPage: true
    });

    return Buffer.from(screenshot);
  } finally {
    await page.close();
  }
}

