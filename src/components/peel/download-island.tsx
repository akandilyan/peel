"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { fontWeights } from "@/lib/font-weight";
import { useTypeScale } from "@/lib/size-context";
import type { useBuild } from "./use-build";

export type ExportMode = "pdf" | "zip";

const SLOW_BUILD_MS = 600;

// CUSTOM: island row «label on the left — control on the right», as in the
// settings panel on fluidfunctionalism.com (text-body, muted-foreground).
export function IslandRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const type = useTypeScale();
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <span className="text-muted-foreground" style={{ fontSize: type.body }}>
        {label}
      </span>
      {children}
    </div>
  );
}

// CUSTOM: the island is an aside p-4 rounded-lg bg-muted card, as on
// fluidfunctionalism.com. Native Select and Button inside. «Label — control»
// rows aligned on one left edge: how many (numbers or cars), file format,
// the Download button and the build status line.
export function DownloadIsland({
  quantity,
  caption,
  items,
  mode,
  onModeChange,
  disabled,
  build,
  onDownload,
}: {
  quantity: ReactNode;
  /** Hint in small text under the quantity */
  caption?: string;
  items: number;
  mode: ExportMode;
  onModeChange: (m: ExportMode) => void;
  disabled: boolean;
  build: ReturnType<typeof useBuild>;
  onDownload: () => void;
}) {
  const type = useTypeScale();
  const { state } = build;
  // A short build (a fraction of a second) shows only the spinner on the button. Cancel
  // and progress appear if the build takes longer than SLOW_BUILD_MS, otherwise they flash.
  const building = state.status === "building";
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!building) return;
    const t = setTimeout(() => setSlow(true), SLOW_BUILD_MS);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [building]);

  const download = (
    <Button
      className="flex-1"
      leadingIcon={Download}
      disabled={disabled}
      onClick={onDownload}
    >
      Download
    </Button>
  );
  let status: ReactNode = null;
  let actions: ReactNode = download;
  if (state.status === "building") {
    status = slow ? `Building ${state.done} / ${state.total}…` : null;
    actions = (
      <>
        {slow && (
          <Button variant="ghost" onClick={build.cancel}>
            Cancel
          </Button>
        )}
        <Button className="flex-1" loading>
          Download
        </Button>
      </>
    );
  } else if (state.status === "failed") {
    status = (
      <span className="text-destructive">
        Couldn&apos;t build the file. Nothing was downloaded.
      </span>
    );
    actions = (
      <Button className="flex-1" leadingIcon={RotateCcw} onClick={build.retry}>
        Retry
      </Button>
    );
  } else if (state.status === "done") {
    status = `Downloaded ${state.fileName}`;
    // Parameters haven't changed (otherwise the state would have reset) — serve the
    // already built file, without rebuilding. A separate Save again isn't needed.
    actions = (
      <Button
        className="flex-1"
        leadingIcon={Download}
        disabled={disabled}
        onClick={build.saveAgain}
      >
        Download
      </Button>
    );
  }

  const caps = { fontSize: type.caption };
  return (
    <aside className="flex flex-col gap-3 rounded-lg bg-muted p-4">
      <h2
        className="pb-1"
        style={{
          fontSize: type.title,
          fontVariationSettings: fontWeights.semibold,
        }}
      >
        Download
      </h2>
      <div className="flex flex-col gap-1">
        {quantity}
        {caption && (
          <p className="text-muted-foreground" style={caps}>
            {caption}
          </p>
        )}
      </div>
      {/* The format is always visible. With a single decal there's nothing to pick —
          the value as text instead of Select (CUSTOM: padding as for the trigger text) */}
      <IslandRow label="File">
        {items > 1 ? (
          // Native borderless Select — like the selects in the fluidfunctionalism.com panel
          <Select
            value={mode}
            onValueChange={(v) => onModeChange(v as ExportMode)}
          >
            <SelectTrigger variant="borderless" className="min-w-0" />
            <SelectContent>
              <SelectItem index={0} value="pdf">
                One PDF
              </SelectItem>
              <SelectItem index={1} value="zip">
                Separate files (ZIP)
              </SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <span className="px-2.5" style={{ fontSize: type.body }}>
            One PDF
          </span>
        )}
      </IslandRow>
      <div className="flex flex-col gap-2 pt-1">
        <div className="flex gap-2">{actions}</div>
        {status && (
          <p className="text-muted-foreground" style={caps} aria-live="polite">
            {status}
          </p>
        )}
      </div>
    </aside>
  );
}
