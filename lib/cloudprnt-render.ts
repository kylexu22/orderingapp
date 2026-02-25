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
    await page.setViewport({ width: 576, height: 1200, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    const body = await page.$("body");
    if (!body) {
      throw new Error("Failed to render receipt body.");
    }

    const box = await body.boundingBox();
    const contentHeight = Math.max(200, Math.ceil(box?.height ?? 1200));
    const clipHeight = Math.min(contentHeight + 8, 8000);
    await page.setViewport({ width: 576, height: Math.min(Math.max(1200, clipHeight), 8000), deviceScaleFactor: 1 });

    const screenshot = await page.screenshot({
      type: "png",
      clip: {
        x: 0,
        y: 0,
        width: 576,
        height: clipHeight
      },
      omitBackground: false
    });

    return Buffer.from(screenshot);
  } finally {
    await page.close();
  }
}
