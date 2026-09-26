"use client";

import type { ReactNode } from "react";
import { productionLabels, type Decal } from "@/data/decals";
import { formatSize, type Units } from "@/lib/units";
import { fontWeights } from "@/lib/font-weight";
import { useSize, useTypeScale } from "@/lib/size-context";

/** How many decals per car or robot. */
export const perVehicle = (d: Decal) => d.perVehicle ?? 1;
const perVehicleLabel = (d: Decal) =>
  [perVehicle(d), d.perVehicleNote].filter(Boolean).join(" · ");

// The same set of details for all decals. Missing data shows «—» so gaps
// in the templates are visible.
// Size is the decal itself (artwork, as in the designer's spec). Below it, in small
// text, the cut line and the PDF sheet, so all three sizes are in one place.
interface SizeInfo {
  main: string;
  sub?: string;
}

export function detailsRows(
  decal: Decal,
  size: SizeInfo,
): [string, ReactNode][] {
  return [
    ["Size", <SizeValue key="size" {...size} />],
    ["Production", productionLabels[decal.production]],
    ["Material", decal.material ?? "—"],
    // Print color only for printed decals; vinyl-cut ones have no such row
    ...(decal.production !== "cut"
      ? ([["Print", decal.print ?? "—"]] as [string, ReactNode][])
      : []),
    ["Placement", decal.placement ?? "—"],
    ["Mounting", decal.mounting ?? "—"],
    [`Per ${decal.platform}`, perVehicleLabel(decal)],
  ];
}

// CUSTOM: two-line value — main text and a small caption (Fluid scale, caption)
export function SizeValue({ main, sub }: SizeInfo) {
  const type = useTypeScale();
  return (
    <div className="flex flex-col gap-0.5">
      <span>{main}</span>
      {sub && (
        <span
          className="text-muted-foreground"
          style={{ fontSize: type.caption }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

/** Static decal sizes: artwork, cut line, sheet. */
export function staticSize(decal: Decal, units: Units): SizeInfo {
  const mmPair = (w: number, h: number) => formatSize(w, h, units);
  const sheet = `Sheet ${mmPair(decal.widthMm, decal.heightMm)}`;
  if (!decal.artMm)
    return {
      main: mmPair(decal.widthMm, decal.heightMm),
      sub: "Sheet · layout of separate pieces",
    };
  const cut = decal.cutPath
    ? "Cut along card outline"
    : decal.category === "wrap"
      ? "Separate pieces"
      : decal.cutMm && `Cut ${mmPair(decal.cutMm[2], decal.cutMm[3])}`;
  return {
    main: mmPair(decal.artMm[0], decal.artMm[1]),
    sub: [cut, sheet].filter(Boolean).join(" · "),
  };
}

// CUSTOM: section heading — Fluid has no component; size and weight from the
// scale. Shared by Details and the business card's field groups.
export function SectionHeading({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const type = useTypeScale();
  return (
    <h2
      className={className}
      style={{
        fontSize: type.title,
        fontVariationSettings: fontWeights.semibold,
      }}
    >
      {children}
    </h2>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      {/* The card padding and border (16 + 1 px): the text lines up with the
          text inside the cards above */}
      <SectionHeading className="px-[17px]">{title}</SectionHeading>
      {children}
    </section>
  );
}

// Details is a «label — value» list without Table (Table's hover can't be turned off).
// Styles come from Fluid only: row and text sizes from the scale (useSize), the
// divider is the border token at 60% (TableRow's border-accent/40 is meant for hover rows
// and nearly vanishes on white), colors are muted-foreground/foreground tokens.
export function DetailsTable({ rows }: { rows: [string, ReactNode][] }) {
  const size = useSize();
  return (
    <Section title="Details">
      <dl
        className={size.text}
        style={{ fontVariationSettings: fontWeights.normal }}
      >
        {rows.map(([k, v]) => (
          <div
            key={k}
            // Row padding as in TableCell: the height lands on the 36/28px scale.
            // Sides as the section heading (card padding + border): labels start
            // under the heading, in line with the text inside the cards above.
            className={`grid grid-cols-[minmax(0,10rem)_1fr] items-baseline border-b border-border/60 px-[17px] ${size.gap} ${size.variant === "compact" ? "py-[5px]" : "py-2"}`}
          >
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
