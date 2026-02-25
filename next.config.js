/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@resvg/resvg-js"],
    outputFileTracingIncludes: {
      "/api/cloudprnt": [
        "node_modules/@fontsource/noto-sans-sc/files/**",
        "node_modules/@resvg/resvg-js/**"
      ],
      "/api/cloudprnt/route": [
        "node_modules/@fontsource/noto-sans-sc/files/**",
        "node_modules/@resvg/resvg-js/**"
      ],
      "/app/api/cloudprnt/route": [
        "node_modules/@fontsource/noto-sans-sc/files/**",
        "node_modules/@resvg/resvg-js/**"
      ]
    }
  }
};

module.exports = nextConfig;
