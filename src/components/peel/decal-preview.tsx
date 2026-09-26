"use client";

import { useId, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import previewSvgs from "@/data/preview-svgs.json";
import { withBase } from "@/lib/base-path";
import type { NumberLayout } from "@/lib/glyph-layout";
import {
  Card,
  CardContent,
  CardFooter,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Decal preview: native CardGroup (outlined) and Card from Fluid.
// CUSTOM: the decal
// artwork (SVG in millimeters), size in small text next to the title,
// pager centered.

export type PreviewContent =
  | { type: "image"; src: string }
  | { type: "number"; layout: NumberLayout }
  | { type: "missing" };

export interface PreviewPage {
  label: string;
  widthMm: number;
  heightMm: number;
  content: PreviewContent;
  transparent?: boolean;
  /** Size label in the header (artwork, in the selected units). */
  sizeLabel: string;
  /** Cut line (x, y from the top-left corner, width, height), mm — as in the PDF. */
  cut?: [number, number, number, number];
  /** Shaped cut line, SVG path in mm. */
  cutPath?: string;
}

interface DecalPreviewProps {
  count: number;
  getPage: (index: number) => PreviewPage;
}

const CUT = "#EC008C";
// On-screen cut line: 0.5 px is one physical pixel on Retina, the thinnest
// crisp line. Same width in the SVG previews (scripts/regenerate-sources.mts).
const CUT_WIDTH = 0.5;

export function DecalPreview({ count, getPage }: DecalPreviewProps) {
  const [index, setIndex] = useState(0);
  const i = Math.min(index, Math.max(0, count - 1));
  const page = getPage(i);

  return (
    // Native outlined card, as the field groups on the business card page: the
    // page is surface-1 itself, so a surface card would show only a faint ring.
    // The 1 px border also puts the text where Details (px-[17px]) starts.
    <CardGroup fluidHover={false} border="outlined" className="rounded-xl">
      <Card>
        <CardHeader>
          <div className="flex items-baseline justify-between gap-4">
            <CardTitle>{page.label}</CardTitle>
            <span className="text-[13px] text-muted-foreground tabular-nums">
              {/* Artwork caption is the artwork size; the sheet is shown dashed */}
              {page.sizeLabel}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <Sticker page={page} />
        </CardContent>
        {/* The pager is always there: invisible for single pages, but keeps the card height */}
        <CardFooter
          aria-hidden={count <= 1 || undefined}
          className={`justify-center gap-2 text-[12px] text-muted-foreground tabular-nums ${count <= 1 ? "invisible" : ""}`}
        >
          <Button
            variant="ghost"
            size="icon-compact"
            aria-label="Previous"
            disabled={i === 0}
            onClick={() => setIndex(i - 1)}
          >
            <ChevronLeft />
          </Button>
          {i + 1} / {count}
          <Button
            variant="ghost"
            size="icon-compact"
            aria-label="Next"
            disabled={i === count - 1}
            onClick={() => setIndex(i + 1)}
          >
            <ChevronRight />
          </Button>
        </CardFooter>
      </Card>
    </CardGroup>
  );
}

// Previews are inlined into the markup from src/data/preview-svgs.json (built by
// scripts/regenerate-sources.mts): ready immediately, no loading or swapping.
const inlineSvgs = previewSvgs as Record<string, string>;

function scopeIds(svg: string, prefix: string) {
  return svg
    .replace(/\bid="([^"]+)"/g, `id="${prefix}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${prefix}$1"`);
}

function InlineSvg({ src, w, h }: { src: string; w: number; h: number }) {
  const prefix = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const markup = inlineSvgs[src];
  // File isn't in the preview bundle — use a plain image
  if (!markup)
    return (
      <image
        href={withBase(src)}
        width={w}
        height={h}
        preserveAspectRatio="xMidYMid meet"
      />
    );
  return (
    <svg
      width={w}
      height={h}
      overflow="visible"
      dangerouslySetInnerHTML={{ __html: scopeIds(markup, prefix) }}
    />
  );
}

// CUSTOM: decal artwork in the preset's proportions, without a white sheet.
function Sticker({ page }: { page: PreviewPage }) {
  const { widthMm: w, heightMm: h, content } = page;
  const patternId = useId();
  const cell = Math.min(w, h) / 16;
  // No white sheet. Checkerboard only for transparent artwork and missing previews.
  const checker = page.transparent || content.type === "missing";

  return (
    <div className="flex h-[260px] items-center justify-center px-10 py-8">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-full w-full"
        // The cut frame sits on the decal edge: without this the outer half of the line
        // is clipped by the SVG bounds and the frame looks thinner than the digit outlines
        overflow="visible"
        role="img"
        aria-label={`${page.label}, ${w} × ${h} mm`}
      >
        {checker && (
          <>
            <defs>
              <pattern
                id={patternId}
                width={cell * 2}
                height={cell * 2}
                patternUnits="userSpaceOnUse"
              >
                <rect width={cell * 2} height={cell * 2} fill="#fff" />
                <rect width={cell} height={cell} fill="#e5e5e5" />
                <rect
                  x={cell}
                  y={cell}
                  width={cell}
                  height={cell}
                  fill="#e5e5e5"
                />
              </pattern>
            </defs>
            <rect width={w} height={h} fill={`url(#${patternId})`} />
          </>
        )}
        {content.type === "image" && (
          <InlineSvg key={content.src} src={content.src} w={w} h={h} />
        )}
        {content.type === "number" && (
          // As in the PDF: digit outlines and the cut frame are one CutContour line
          <g
            fill="none"
            stroke={CUT}
            strokeWidth={CUT_WIDTH}
            vectorEffect="non-scaling-stroke"
          >
            {content.layout.glyphs.map((g, i) => (
              <path
                key={i}
                d={g.d}
                transform={g.transform}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <rect width={w} height={h} vectorEffect="non-scaling-stroke" />
          </g>
        )}
        {/* Sheet boundary (PDF page) — thin dashed line in the caption color */}
        <rect
          width={w}
          height={h}
          fill="none"
          className="stroke-muted-foreground/60"
          strokeWidth={1}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
        {page.cutPath && (
          <path
            d={page.cutPath}
            fill="none"
            stroke={CUT}
            strokeWidth={CUT_WIDTH}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {/* Cut line added when the PDF was rebuilt */}
        {page.cut && (
          <rect
            x={page.cut[0]}
            y={page.cut[1]}
            width={page.cut[2]}
            height={page.cut[3]}
            fill="none"
            stroke={CUT}
            strokeWidth={CUT_WIDTH}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
}
