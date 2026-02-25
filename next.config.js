/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/cloudprnt": [
      "./node_modules/@sparticuz/chromium/bin/**"
    ],
    "/api/cloudprnt/route": [
      "./node_modules/@sparticuz/chromium/bin/**"
    ]
  }
};

module.exports = nextConfig;
