import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pglite ships wasm resolved via import.meta.url - must not be bundled
  serverExternalPackages: ["@electric-sql/pglite", "@resvg/resvg-js", "sharp"],
  // Keep this list in step with LOCAL in src/lib/fonts.ts.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/@fontsource/inter/files/inter-latin-400-normal.woff",
      "./node_modules/@fontsource/inter/files/inter-latin-700-normal.woff",
      "./node_modules/@fontsource/inter/files/inter-latin-800-normal.woff",
      "./node_modules/@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff",
      "./node_modules/@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff",
      "./node_modules/@fontsource/playfair-display/files/playfair-display-latin-800-normal.woff",
    ],
  },
  experimental: {
    serverActions: {
      // Server action bodies are capped at 1MB by default, and this app posts
      // images through actions: uploadImages sends the library files, and the
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
