import type { ReactNode } from "react";

// CUSTOM: page layout — Fluid has no page component. Mirrors
// fluidfunctionalism.com: a centered 680px content column (px-6, pb-20 sm:pb-28 —
// the top tightened to pt-10 sm:pt-13 so the preview sits higher and the title's
// capitals line up with the top of the sidebar's active tab —
// mt-12 lg:mt-0 — same breakpoints), a 256px island at the right edge of the window
// (sticky top-4, mt-4). Below xl (1280) the island moves into the content under the
// preview — like «Playground variant» on the site.
export function ScreenLayout({
  header,
  children,
  preview,
  controls,
  details,
  island,
}: {
  header: ReactNode;
  /** Arbitrary content under the header (home) */
  children?: ReactNode;
  preview?: ReactNode;
  /** Form under the preview (business card) */
  controls?: ReactNode;
  details?: ReactNode;
  /** No island (home) — empty space of the same width on the right, so the content
   *  column sits where it does on decal pages */
  island?: ReactNode;
}) {
  return (
    <div className="flex w-full items-start">
      <div className="min-w-0 flex-1">
        <div className="mx-auto flex w-full max-w-[680px] flex-col gap-8 px-6 pt-10 pb-20 sm:pt-13 sm:pb-28 mt-12 lg:mt-0">
          {header}
          {children}
          {preview}
          {controls}
          {island && <div className="xl:hidden">{island}</div>}
          {details}
        </div>
      </div>
      <div className="sticky top-4 mt-4 mr-4 hidden w-64 shrink-0 xl:block">
        {island}
      </div>
    </div>
  );
}
