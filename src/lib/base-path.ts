// Site subfolder: on GitHub Pages the site lives at /peel (set at build time,
// see next.config.ts), locally at the root. Next.js adds it to its own
// links; we add it to paths of files from public (PDFs, previews, logo) and to URLs in
// history.pushState.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const withBase = (path: string) => `${BASE_PATH}${path}`;
