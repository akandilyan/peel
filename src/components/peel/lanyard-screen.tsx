"use client";

import type { ReactNode } from "react";
import type { Decal } from "@/data/decals";
import {
  LANYARD_PRINT,
  STRAP_LENGTH_MM,
  STRAP_WIDTH_MM,
  defaultLanyardDesign,
  lanyardDesigns,
  type LanyardDesign,
} from "@/lib/lanyard";
import { exportLanyard } from "@/lib/lanyard-pdf";
import { formatLengthWithUnits } from "@/lib/units";
import { DetailsTable } from "./decal-details";
import { DownloadIsland } from "./download-island";
import { LanyardPreview } from "./lanyard-preview";
import { ScreenLayout } from "./screen-layout";
import { useBuild } from "./use-build";
import { useUnits } from "./units-menu";

// Lanyard: the strap in 3D, its design picked with swatches under it, as the
// business card's style. Download builds the sublimation PDF of that design.

export function LanyardBody({
  decal,
  design,
  onDesignChange,
  header,
}: {
  decal: Decal;
  /** Stored as the decal's variant; none — the default */
  design?: string;
  onDesignChange: (design: LanyardDesign) => void;
  header: ReactNode;
}) {
  const build = useBuild();
  const units = useUnits();
  const current =
    lanyardDesigns.find((d) => d.id === design)?.id ?? defaultLanyardDesign;
  const width = formatLengthWithUnits(STRAP_WIDTH_MM, units);
  const fileName = `${decal.id}-${current}.pdf`;

  return (
    <ScreenLayout
      header={header}
      preview={
        <LanyardPreview
          sizeLabel={`${width} strap`}
          design={current}
          onDesignChange={(d) => {
            build.reset();
            onDesignChange(d);
          }}
        />
      }
      details={
        <DetailsTable
          rows={[
            ["Size", `${width} × ${formatLengthWithUnits(STRAP_LENGTH_MM, units)}`],
            ["Sides", "Logo outside, pattern inside"],
            ["Hardware", "Swivel snap hook, the ends sewn into a loop"],
            ["Versions", lanyardDesigns.map((d) => d.name).join(", ")],
            ["Material", decal.material ?? "—"],
            ["Print", "Dye sublimation, both sides"],
            [
              "Print file",
              `Outside and inside at 1:1, ${formatLengthWithUnits(LANYARD_PRINT.bleedAcrossMm, units)} bleed, sewn ends ${formatLengthWithUnits(LANYARD_PRINT.sewMm, units)} free of logos`,
            ],
          ]}
        />
      }
      island={
        <DownloadIsland
          items={1}
          mode="pdf"
          onModeChange={() => {}}
          disabled={false}
          build={build}
          onDownload={() =>
            void build.start({
              kind: "generate",
              total: 1,
              run: () => exportLanyard(current, fileName),
            })
          }
        />
      }
    />
  );
}
