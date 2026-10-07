"use client";

import { useId, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import previewSvgs from "@/data/preview-svgs.json";
import { withBase } from "@/lib/base-path";
import type { NumberLayout } from "@/lib/glyph-layout";
import { ROOM_SIGN, type RoomSignLayout } from "@/lib/room-sign";
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
  | { type: "transfer"; transfer: TransferPreview }
  | { type: "room"; room: RoomPreview }
  | { type: "missing" };

/** Lidar ID transfer as it lies on the choker: cut contours (SVG paths, mm),
 *  the number stuck over each window, the top edge's middle for its label. */
export interface TransferPreview {
  contours: string[];
  windows: { x: number; y: number; angleDeg: number }[];
  number: NumberLayout;
  top: [number, number];
}

/** Meeting room sign: the ring and the name, large, without the sheet; no
 *  layout yet (the font is loading) — the ring only. */
export interface RoomPreview {
  layout: RoomSignLayout | null;
  film: "white" | "black";
}

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
  /** The shown page, when the screen drives it (the room sign: the focused
   *  room's field); none — the pager keeps its own */
  index?: number;
  onIndexChange?: (index: number) => void;
}

const CUT = "#EC008C";
// On-screen cut line: 0.5 px is one physical pixel on Retina, the thinnest
// crisp line. Same width in the SVG previews (scripts/regenerate-sources.mts).
const CUT_WIDTH = 0.5;

export function DecalPreview({
  count,
  getPage,
  index: shown,
  onIndexChange,
}: DecalPreviewProps) {
  const [own, setOwn] = useState(0);
  const index = shown ?? own;
  const setIndex = (i: number) => (onIndexChange ? onIndexChange(i) : setOwn(i));
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
  // The room sign fills a taller stage, cropped to its circle, with no sheet
  const room = content.type === "room" ? content.room : null;
  const crop = room ? (w - ROOM_SIGN.diameterMm) / 2 - 2 : 0;

  return (
    <div
      className={
        room
          ? "flex h-[400px] items-center justify-center p-8"
          : "flex h-[260px] items-center justify-center px-10 py-8"
      }
    >
      <svg
        viewBox={`${crop} ${crop} ${w - 2 * crop} ${h - 2 * crop}`}
        className="h-full w-full"
        // The sheet boundary sits on the decal edge: without this the outer half of the
        // line is clipped by the SVG bounds
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
        {content.type === "transfer" && <Transfer transfer={content.transfer} />}
        {room && <RoomSign room={room} size={w} />}
        {content.type === "number" && (
          // As in the PDF: only the digit outlines are cut, as a CutContour line
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
          </g>
        )}
        {/* Sheet boundary (PDF page) — thin dashed line in the caption color */}
        {!room && (
          <rect
            width={w}
            height={h}
            fill="none"
            className="stroke-muted-foreground/60"
            strokeWidth={1}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
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

// CUSTOM: the transfer — the cut line, and over each window the decal it carries
// (its film edge dashed, the digits in the text color, upright as on the robot);
// a caption over the top edge says which way is up.
function Transfer({ transfer: t }: { transfer: TransferPreview }) {
  const { number: nl } = t;
  return (
    <>
      {t.windows.map((w, i) => (
        <g
          key={i}
          transform={`translate(${w.x} ${w.y}) rotate(${w.angleDeg}) translate(${-nl.widthMm / 2} ${-nl.heightMm / 2})`}
        >
          <rect
            width={nl.widthMm}
            height={nl.heightMm}
            fill="none"
            className="stroke-muted-foreground/60"
            strokeWidth={1}
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
          />
          <g className="fill-foreground">
            {nl.glyphs.map((g, j) => (
              <path key={j} d={g.d} transform={g.transform} />
            ))}
          </g>
        </g>
      ))}
      <g fill="none" stroke={CUT} strokeWidth={CUT_WIDTH}>
        {t.contours.map((d, i) => (
          <path key={i} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      <text
        x={t.top[0]}
        y={t.top[1] - 5}
        textAnchor="middle"
        fontSize={8}
        className="fill-muted-foreground"
      >
        Top · toward the lidar
      </text>
    </>
  );
}

// CUSTOM: the meeting room sign on the card, as the other decals, in the film's
// own color; a thin outline in the text color keeps black film readable on a
// dark card and white film on a light one.
function RoomSign({ room, size }: { room: RoomPreview; size: number }) {
  const c = size / 2;
  const R = ROOM_SIGN.diameterMm / 2;
  const r = R - ROOM_SIGN.ringMm;
  const s = room.layout?.scale ?? 0;
  return (
    <>
      <g
        className="stroke-foreground/30"
        fill={room.film === "black" ? "#111111" : "#ffffff"}
        strokeWidth={1}
      >
        <path
          fillRule="evenodd"
          d={`M${c - R} ${c}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0Z M${c - r} ${c}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`}
          vectorEffect="non-scaling-stroke"
        />
        {room.layout?.glyphs.map((g, i) => (
          <path
            key={i}
            d={g.d}
            transform={`translate(${g.x} ${g.y}) scale(${s} ${-s})`}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </>
  );
}
