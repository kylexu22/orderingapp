import { load } from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://hongfarcafe.ca";
const OUT_DIR = path.join(process.cwd(), "data");
const OUT_FILE = path.join(OUT_DIR, "hongfarcafe-menu-scrape.json");

type CategoryRecord = {
  slug: string;
  url: string;
  label: string;
};

type ProductRecord = {
  slug: string;
  url: string;
  categories: string[];
  listingTitle?: string;
  title?: string;
  priceText?: string;
  descriptionText?: string;
};

function normalizeText(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function absoluteUrl(href: string): string {
  if (href.startsWith("http")) return href;
  return `${BASE_URL}${href.startsWith("/") ? href : `/${href}`}`;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status}) for ${url}`);
  }
  const buffer = await res.arrayBuffer();
  return new TextDecoder("utf-8").decode(buffer);
}

function parseTotalPages(pageText: string): number {
  const m = pageText.match(/Total(\d+)\s*Page/i);
  if (!m) return 1;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

async function getCategories(): Promise<CategoryRecord[]> {
  const html = await fetchHtml(`${BASE_URL}/category`);
  const $ = load(html);

  const categories = new Map<string, CategoryRecord>();
  $('a[href^="/category/"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const slug = href.replace(/^\/category\//, "").trim();
    if (!slug) return;
    const label = normalizeText($(el).text());
    if (!label) return;
    if (!categories.has(slug)) {
      categories.set(slug, {
        slug,
        url: absoluteUrl(`/category/${slug}`),
        label
      });
    }
  });

  return [...categories.values()];
}

async function collectProductsByCategory(categories: CategoryRecord[]) {
  const bySlug = new Map<string, ProductRecord>();

  for (const category of categories) {
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const pageUrl = `${category.url}?page=${page}`;
      const html = await fetchHtml(pageUrl);
      const $ = load(html);

      const pageSummary = normalizeText($("ul.pagination").text());
      totalPages = parseTotalPages(pageSummary) || totalPages;

      const productLinks = $(".foodfly-product-list-title a[href^=\"/product/\"]").toArray();
      for (const anchor of productLinks) {
        const href = $(anchor).attr("href");
        if (!href) continue;
        const slug = href.replace(/^\/product\//, "").trim();
        if (!slug) continue;
        const listingTitle = normalizeText($(anchor).text());

        const existing = bySlug.get(slug);
        if (!existing) {
          bySlug.set(slug, {
            slug,
            url: absoluteUrl(href),
            categories: [category.label],
            listingTitle
          });
        } else {
          if (!existing.categories.includes(category.label)) {
            existing.categories.push(category.label);
          }
          if (!existing.listingTitle && listingTitle) {
            existing.listingTitle = listingTitle;
          }
        }
      }

      page += 1;
    }
  }

  return bySlug;
}

function parseProductDetails(html: string) {
  const $ = load(html);
  const title = normalizeText($("h1.product_title.entry-title").first().text());
  const priceText = normalizeText(
    $(".summary .price .woocommerce-Price-amount.amount")
      .first()
      .text()
  );

  const descriptionBlocks = $(".summary .woocommerce-variation-price.mb-1")
    .toArray()
    .map((node) => normalizeText($(node).text()))
    .filter((text) => text.length > 0);

  let descriptionText = "";
  if (descriptionBlocks.length > 0) {
    descriptionText = descriptionBlocks[0];
    if (priceText && descriptionText.includes(priceText) && descriptionBlocks[1]) {
      descriptionText = descriptionBlocks[1];
    }
  }

  return {
    title,
    priceText,
    descriptionText
  };
}

async function main() {
  const startedAt = new Date();
  const categories = await getCategories();
  const productsBySlug = await collectProductsByCategory(categories);
  const products = [...productsBySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));

  for (const product of products) {
    try {
      const html = await fetchHtml(product.url);
      const detail = parseProductDetails(html);
      product.title = detail.title || product.listingTitle;
      product.priceText = detail.priceText;
      product.descriptionText = detail.descriptionText;
    } catch (error) {
      product.title = product.title ?? product.listingTitle;
      product.descriptionText = `FAILED_TO_FETCH: ${(error as Error).message}`;
    }
  }

  const output = {
    source: BASE_URL,
    scrapedAt: new Date().toISOString(),
    durationSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
    categoryCount: categories.length,
    productCount: products.length,
    categories,
    products
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(output, null, 2), "utf8");

  console.log(`Scrape complete: ${output.productCount} products, ${output.categoryCount} categories`);
  console.log(`Output: ${path.relative(process.cwd(), OUT_FILE)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
