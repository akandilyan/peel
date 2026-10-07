"use client";

import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { Decal } from "@/data/decals";
import { layoutNumber } from "@/lib/glyph-layout";
import {
  ARROW,
  chokerModels,
  layoutTransfer,
  toSvgPath,
  transferFileName,
  windowSize,
  WINDOW_OVERLAP_MM,
  type RobotModel,
  type TransferDesign,
} from "@/lib/lidar-transfer";
import { exportTransfer } from "@/lib/lidar-transfer-pdf";
import { numberPresets } from "@/lib/numbers";
import { formatLengthWithUnits, formatSize } from "@/lib/units";
import { SizeValue, DetailsTable } from "./decal-details";
import { DecalPreview, type PreviewPage } from "./decal-preview";
import { DownloadIsland, IslandRow } from "./download-island";
import { ScreenLayout } from "./screen-layout";
import { useBuild } from "./use-build";
import { useUnits } from "./units-menu";

// Lidar ID transfer: the plastic strip that carries both lidar IDs onto the
// choker, built for the robot model and the number length. A tool, made once
// and reused — downloaded on its own, not with the numbers.

/** Numbers shown over the windows */
const EXAMPLE = { 3: 123, 4: 1234 } as const;

export function LidarTransferBody({
  decal,
  transfer,
  onTransferChange,
  header,
}: {
  decal: Decal;
  transfer: TransferDesign;
  onTransferChange: (t: TransferDesign) => void;
  header: ReactNode;
}) {
  const build = useBuild();
  const units = useUnits();
  const { model, digits } = transfer;
  const t = layoutTransfer(model, digits);
  const strip = formatSize(t.stripMm.width, t.stripMm.height, units);
  const preset = numberPresets.robot;
  const win = windowSize(digits);
  const fileName = transferFileName(decal.id, transfer);
  const set = (next: Partial<TransferDesign>) => {
    build.reset();
    onTransferChange({ ...transfer, ...next });
  };

  const getPage = (): PreviewPage => ({
    // The name is already in the page header
    label: "Preview",
    widthMm: t.widthMm,
    heightMm: t.heightMm,
    sizeLabel: strip,
    content: {
      type: "transfer",
      transfer: {
        contours: t.layout.contours.map(toSvgPath),
        windows: t.layout.window.centers.map(([x, y], k) => ({
          x,
          y,
          angleDeg: (-t.layout.window.anglesRad[k] * 180) / Math.PI,
        })),
        number: layoutNumber(String(EXAMPLE[digits]), EXAMPLE[digits], preset),
        top: t.layout.topMid,
      },
    },
  });

  const mm = (v: number) => formatLengthWithUnits(v, units);
  return (
    <ScreenLayout
      header={header}
      preview={<DecalPreview count={1} getPage={getPage} />}
      details={
        <DetailsTable
          rows={[
            [
              "Size",
              <SizeValue
                key="size"
                main={strip}
                sub={`Sheet ${formatSize(t.widthMm, t.heightMm, units)}`}
              />,
            ],
            [
              "Windows",
              `${formatSize(win.widthMm, win.heightMm, units)} · the decal overlaps by ${mm(WINDOW_OVERLAP_MM)}`,
            ],
            [
              "Cut",
              `Outline with center markers, windows, an arrow ${mm(ARROW.headWidthMm)} wide pointing to the top edge`,
            ],
            ["Production", "Cut from plastic, nothing printed"],
            ["Material", decal.material ?? "—"],
            ["Placement", "Markers at the center of the choker’s front"],
          ]}
        />
      }
      island={
        <DownloadIsland
          variant={
            <>
              <IslandRow label="Robot">
                {/* Native borderless Selects, as for the file format */}
                <Select
                  value={model}
                  onValueChange={(v) => set({ model: v as RobotModel })}
                >
                  <SelectTrigger variant="borderless" className="min-w-0" />
                  <SelectContent>
                    {Object.values(chokerModels).map((m, i) => (
                      <SelectItem key={m.id} index={i} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </IslandRow>
              <IslandRow label="Digits">
                <Select
                  value={String(digits)}
                  onValueChange={(v) => set({ digits: Number(v) as 3 | 4 })}
                >
                  <SelectTrigger variant="borderless" className="min-w-0" />
                  <SelectContent>
                    <SelectItem index={0} value="3">
                      3 · up to 999
                    </SelectItem>
                    <SelectItem index={1} value="4">
                      4 · 1000 and up
                    </SelectItem>
                  </SelectContent>
                </Select>
              </IslandRow>
            </>
          }
          items={1}
          mode="pdf"
          onModeChange={() => {}}
          disabled={false}
          build={build}
          onDownload={() =>
            void build.start({
              kind: "generate",
              total: 1,
              run: () => exportTransfer(transfer, fileName),
            })
          }
        />
      }
    />
  );
}
