import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

let cachedBrowser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

async function getBrowser() {
  if (cachedBrowser) return cachedBrowser;

  const executablePath = await chromium.executablePath();
  cachedBrowser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true
  });
  return cachedBrowser;
}

export async function renderReceiptHtmlToPng(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 576, height: 1200, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "load" });
    const body = await page.$("body");
    if (!body) {
      throw new Error("Failed to render receipt body.");
    }

    const box = await body.boundingBox();
    const clipHeight = Math.max(1200, Math.ceil(box?.height ?? 1200));
    await page.setViewport({ width: 576, height: Math.min(clipHeight + 8, 16384), deviceScaleFactor: 2 });

    const screenshot = await page.screenshot({
      type: "png",
      fullPage: true
    });

    return Buffer.from(screenshot);
  } finally {
    await page.close();
  }
}
