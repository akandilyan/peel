"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { Tooltip } from "@/components/ui/tooltip";
import { decalFiles, decalsInOrder, type Decal } from "@/data/decals";
import type { CardDesign, CardFields } from "@/lib/business-card";
import {
  formatNumber,
  numberPresets,
  parseNumbers,
  sanitizeNumbersInput,
  sizeFor,
} from "@/lib/numbers";
import { exportDecals } from "@/lib/export-decals";
import { exportStatic } from "@/lib/export-static";
import { layoutNumber } from "@/lib/glyph-layout";
import { formatSize } from "@/lib/units";
import { withBase } from "@/lib/base-path";
import { fontWeights } from "@/lib/font-weight";
import { useTypeScale } from "@/lib/size-context";
import { BusinessCardBody } from "./business-card-screen";
import { IdBadgeBody, type BadgeState } from "./id-badge-screen";
import { LanyardBody } from "./lanyard-screen";
import { CopiesStepper } from "./copies-stepper";
import { CopyLinkButton } from "./copy-link-button";
import {
  DetailsTable,
  detailsRows,
  perVehicle,
  staticSize,
} from "./decal-details";
import { DecalPreview, type PreviewPage } from "./decal-preview";
import { DownloadIsland, IslandRow, type ExportMode } from "./download-island";
import { useUnits } from "./units-menu";
import { ScreenLayout } from "./screen-layout";
import { useBuild } from "./use-build";

export type { ExportMode };

// Number layer in the PDF: CAR_NAME for cars, as in the plugin and PRD.
// The plugin has no robot preset — the layer name is chosen by analogy.
const NUMBER_LAYERS = { car: "CAR_NAME", robot: "LIDAR_ID" } as const;

// Decal screen on native Fluid components: InputGroup, Card (in the preview),
// Select, Tooltip, Button. Customizations are marked with CUSTOM comments.
// Layout as on fluidfunctionalism.com: content in the center, an island on the right
// with parameters (how many cars or which numbers, file format) and download.

interface DecalScreenProps {
  decal: Decal;
  input: string;
  onInputChange: (value: string) => void;
  mode: ExportMode;
  onModeChange: (mode: ExportMode) => void;
  /** How many cars or robots (for static decals) */
  copies: number;
  onCopiesChange: (copies: number) => void;
  /** Version of a decal with versions (light / dark); none — the first */
  variant?: string;
  onVariantChange: (variant: string) => void;
  /** Business card details */
  card: CardFields;
  onCardChange: (card: CardFields) => void;
  cardDesign: CardDesign;
  onCardDesignChange: (design: CardDesign) => void;
  /** ID badge name and photo */
  badge: BadgeState;
  onBadgeChange: (badge: BadgeState) => void;
  /** Go to an adjacent decal (arrows next to the title) */
  onSelect: (id: string) => void;
}

/** Quantity unit for static decals: Cars, Robots. */
const vehiclesLabel = (d: Decal) =>
  `${d.platform[0].toUpperCase()}${d.platform.slice(1)}s`;

export function DecalScreen(props: DecalScreenProps) {
  const header = <ScreenHeader decal={props.decal} onSelect={props.onSelect} />;
  if (props.decal.kind === "business-card")
    return (
      <BusinessCardBody
        decal={props.decal}
        fields={props.card}
        onFieldsChange={props.onCardChange}
        design={props.cardDesign}
        onDesignChange={props.onCardDesignChange}
        header={header}
      />
    );
  if (props.decal.kind === "lanyard")
    return (
      <LanyardBody
        decal={props.decal}
        design={props.variant}
        onDesignChange={props.onVariantChange}
        header={header}
      />
    );
  if (props.decal.kind === "id-badge")
    return (
      <IdBadgeBody
        decal={props.decal}
        badge={props.badge}
        onBadgeChange={props.onBadgeChange}
        header={header}
      />
    );
  return props.decal.kind === "generator" ? (
    <GeneratorBody {...props} header={header} />
  ) : (
    <StaticBody {...props} header={header} />
  );
}

// CUSTOM: page header as on fluidfunctionalism.com: display + bold,
// text-body description, on the right a link and arrows to adjacent decals (native Button).
function ScreenHeader({
  decal,
  onSelect,
}: {
  decal: Decal;
  onSelect: (id: string) => void;
}) {
  const type = useTypeScale();
  const list = decalsInOrder(decal.platform);
  const i = list.findIndex((d) => d.id === decal.id);
  const prev = list[i - 1];
  const next = list[i + 1];
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <h1
          className="leading-none"
          style={{
            fontSize: type.display,
            fontVariationSettings: fontWeights.bold,
          }}
        >
          {decal.name}
        </h1>
        <p className="text-muted-foreground" style={{ fontSize: type.body }}>
          {decal.description}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        <CopyLinkButton />
        <Tooltip content={prev ? prev.name : "First decal"} side="top">
          <Button
            variant="ghost"
            size="icon-compact"
            aria-label="Previous decal"
            disabled={!prev}
            onClick={() => prev && onSelect(prev.id)}
          >
            <ChevronLeft />
          </Button>
        </Tooltip>
        <Tooltip content={next ? next.name : "Last decal"} side="top">
          <Button
            variant="ghost"
            size="icon-compact"
            aria-label="Next decal"
            disabled={!next}
            onClick={() => next && onSelect(next.id)}
          >
            <ChevronRight />
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}

// ─── Generator (car and robot ID) ──────────────────────────────────────────

function GeneratorBody({
  decal,
  input,
  onInputChange,
  mode,
  onModeChange,
  header,
}: DecalScreenProps & { header: ReactNode }) {
  // Generators exist only for cars and robots
  const platform = decal.platform as "car" | "robot";
  const preset = numberPresets[platform];
  const build = useBuild();
  const per = perVehicle(decal);

  // An unfinished range at the end ("100-") isn't an error
  const { numbers, errors } = parseNumbers(input, { partial: true });
  const strict = parseNumbers(input);
  const count = numbers.length;
  const canDownload = count > 0 && strict.errors.length === 0;

  // One number is one car or robot; decals per number is per (2 for robots)
  const items = count * per;
  const effectiveMode: ExportMode = items > 1 ? mode : "pdf";

  const widths = [
    ...new Set(numbers.map((n) => sizeFor(n, preset).width)),
  ].sort((a, b) => a - b);
  const units = useUnits();
  const sheetW = widths.length ? widths : [decal.widthMm];
  const sizeLabel = formatSize(
    [sheetW[0], sheetW[sheetW.length - 1]],
    preset.heightMm,
    units,
  );

  // No numbers yet — show a regular example: the preset's first number (V001, 0001)
  const exampleNumber = 1;
  const getPage = (i: number): PreviewPage => {
    const n = numbers[i] ?? exampleNumber;
    const text = formatNumber(n, preset);
    const layout = layoutNumber(text, n, preset);
    return {
      label: count ? text : "Example",
      widthMm: layout.widthMm,
      heightMm: layout.heightMm,
      sizeLabel: formatSize(layout.inkMm.width, layout.inkMm.height, units),
      content: { type: "number", layout },
    };
  };

  // Actual digit size from the outline layout: for a range, from and to
  const inks = (count ? numbers : [exampleNumber]).map(
    (n) => layoutNumber(formatNumber(n, preset), n, preset).inkMm,
  );
  const inkLabel = formatSize(
    [
      Math.min(...inks.map((k) => k.width)),
      Math.max(...inks.map((k) => k.width)),
    ],
    Math.max(...inks.map((k) => k.height)),
    units,
  );

  return (
    <ScreenLayout
      header={header}
      preview={<DecalPreview count={count} getPage={getPage} />}
      details={
        <DetailsTable
          rows={detailsRows(decal, {
            main: inkLabel,
            // The digits themselves are cut; the cut frame follows the sheet edge
            sub: `Cut along digits · Sheet ${sizeLabel}`,
          })}
        />
      }
      island={
        <DownloadIsland
          quantity={
            <IslandRow label="Numbers">
              {/* CUSTOM: a Fluid field's border is transparent at rest — here it's
                  visible (border token) so the field reads as a field. Hover and focus
                  are as in the native InputField. */}
              <InputGroup className="min-w-0 flex-1 [&_.ring-transparent]:ring-border">
                <InputField
                  index={0}
                  label="Numbers"
                  labelHidden
                  placeholder={preset.prefix ? "100-199, 205" : "100-199, 1000"}
                  value={input}
                  onChange={(v) => {
                    build.reset();
                    onInputChange(sanitizeNumbersInput(v));
                  }}
                  error={errors.length ? errors.join(". ") : undefined}
                  spellCheck={false}
                  autoComplete="off"
                />
              </InputGroup>
            </IslandRow>
          }
          items={items}
          mode={mode}
          onModeChange={(m) => {
            build.reset();
            onModeChange(m);
          }}
          disabled={!canDownload}
          build={build}
          onDownload={() =>
            void build.start({
              kind: "generate",
              total: items,
              // Real PDF / ZIP build in the browser, as in the Fleet Decals plugin
              run: (onProgress, isCancelled) =>
                exportDecals({
                  numbers,
                  preset,
                  layer: NUMBER_LAYERS[platform],
                  mode: effectiveMode,
                  copies: per,
                  prefix: decal.id,
                  onProgress,
                  isCancelled,
                }),
            })
          }
        />
      }
    />
  );
}

// ─── Static decal ────────────────────────────────────────────────────────────

function StaticBody({
  decal,
  mode,
  onModeChange,
  copies: vehicles,
  onCopiesChange,
  variant,
  onVariantChange,
  header,
}: DecalScreenProps & { header: ReactNode }) {
  const build = useBuild();
  const units = useUnits();
  const files = decalFiles(decal, variant);
  const { source, preview } = files;
  const missing = !preview || !source;
  const per = perVehicle(decal);
  // Decals: cars × decals per car (side logo is 2 per car)
  const items = vehicles * per;
  const effectiveMode: ExportMode = items > 1 ? mode : "pdf";
  const base = `${files.id}${vehicles > 1 ? `_${vehicles}-${decal.platform}s` : ""}`;
  const fileName = `${base}.${effectiveMode}`;

  const getPage = (): PreviewPage => ({
    // The name is already in the page header — use a neutral section label here
    label: "Preview",
    widthMm: decal.widthMm,
    heightMm: decal.heightMm,
    sizeLabel: decal.artMm
      ? formatSize(decal.artMm[0], decal.artMm[1], units)
      : formatSize(decal.widthMm, decal.heightMm, units),
    content: missing ? { type: "missing" } : { type: "image", src: preview },
    transparent: decal.transparentPreview,
    cut: decal.cutMm,
    cutPath: decal.cutPath,
  });

  return (
    <ScreenLayout
      header={header}
      preview={<DecalPreview count={1} getPage={getPage} />}
      details={
        <DetailsTable rows={detailsRows(decal, staticSize(decal, units))} />
      }
      island={
        <DownloadIsland
          variant={
            decal.variants && (
              <IslandRow label="Version">
                {/* Native borderless Select, as for the file format */}
                <Select
                  value={
                    decal.variants.find((v) => v.id === variant)?.id ??
                    decal.variants[0].id
                  }
                  onValueChange={(v) => {
                    build.reset();
                    onVariantChange(v as string);
                  }}
                >
                  <SelectTrigger variant="borderless" className="min-w-0" />
                  <SelectContent>
                    {decal.variants.map((v, i) => (
                      <SelectItem key={v.id} index={i} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </IslandRow>
            )
          }
          quantity={
            <IslandRow label={vehiclesLabel(decal)}>
              <CopiesStepper
                label={vehiclesLabel(decal)}
                value={vehicles}
                onChange={(n) => {
                  build.reset();
                  onCopiesChange(n);
                }}
              />
            </IslandRow>
          }
          items={items}
          caption={missing ? "The print file isn't ready yet" : undefined}
          mode={mode}
          onModeChange={(m) => {
            build.reset();
            onModeChange(m);
          }}
          disabled={missing}
          build={build}
          onDownload={() =>
            void build.start(
              // A single decal — the source file as is
              items === 1
                ? { kind: "file", href: withBase(source!), fileName }
                : {
                    kind: "generate",
                    total: items,
                    run: (onProgress, isCancelled) =>
                      exportStatic({
                        src: withBase(source!),
                        copies: items,
                        fileBase: base,
                        mode: effectiveMode,
                        onProgress,
                        isCancelled,
                      }),
                  },
            )
          }
        />
      }
    />
  );
}
