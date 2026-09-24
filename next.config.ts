import path from "path";
import type { NextConfig } from "next";

// The site is static: pages are prebuilt, PDFs and ZIPs are generated in the
// browser, no server needed — deployed to GitHub Pages (.github/workflows).
// PAGES_BASE_PATH=/peel — the subfolder on github.io; empty locally.
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  // Pages as folders with index.html: the URL /peel/car-side-logo/ resolves
  // unambiguously on GitHub Pages (Next.js service folders sit alongside)
  trailingSlash: true,
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    // Short commit hash of the deployed build (GITHUB_SHA in GitHub Actions)
    NEXT_PUBLIC_COMMIT: (process.env.GITHUB_SHA ?? "").slice(0, 7),
  },
  // Static export: no server-side image optimization
  images: { unoptimized: true },
  // Explicit project root: otherwise Next.js finds an unrelated package-lock.json higher
  // up the tree (in the home folder) and uses that as the root
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
