/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@sparticuz/chromium", "puppeteer-core"]
  },
  outputFileTracingIncludes: {
    "/api/cloudprnt": [
      "node_modules/@sparticuz/chromium/**",
      "node_modules/puppeteer-core/**",
      "./node_modules/@sparticuz/chromium/bin/**"
    ],
    "/api/cloudprnt/route": [
      "node_modules/@sparticuz/chromium/**",
      "node_modules/puppeteer-core/**",
      "./node_modules/@sparticuz/chromium/bin/**"
    ],
    "/app/api/cloudprnt/route": [
      "node_modules/@sparticuz/chromium/**",
      "node_modules/puppeteer-core/**",
      "./node_modules/@sparticuz/chromium/bin/**"
    ]
  }
};

module.exports = nextConfig;
