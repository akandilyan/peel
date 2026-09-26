"use client";

import { Button } from "@/components/ui/button";
import { changelog, latest } from "@/data/changelog";
import { decals, platforms } from "@/data/decals";
import { fontWeights } from "@/lib/font-weight";
import { useSize, useTypeScale } from "@/lib/size-context";
import { ScreenLayout } from "./screen-layout";

// Home is What's new: version history from src/data/changelog.ts. A version's decals
// are native Button (ghost, compact) linking to the decal page.
// CUSTOM: headings and lists use typography on scale tokens (useTypeScale,
// fontWeights); Fluid has no component for a text page.

// Short hash of the deployed build (GitHub Actions), empty locally
const COMMIT = process.env.NEXT_PUBLIC_COMMIT;

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export function HomeScreen({ onSelect }: { onSelect: (id: string) => void }) {
  const type = useTypeScale();
  const size = useSize();
  return (
    <ScreenLayout
      header={
        <header className="flex flex-col gap-2">
          <h1
            className="leading-none"
            style={{
              fontSize: type.display,
              fontVariationSettings: fontWeights.bold,
            }}
          >
            What&apos;s new
          </h1>
          <p className="text-muted-foreground" style={{ fontSize: type.body }}>
            Everything that carries the Avride logo, ready to print.
          </p>
          <p
            className="text-muted-foreground tabular-nums"
            style={{ fontSize: type.caption }}
          >
            Version {latest.version}
            {COMMIT && ` · ${COMMIT}`}
          </p>
        </header>
      }
    >
      {changelog.map((release) => {
        const items = (release.decals ?? [])
          .map((id) => decals.find((d) => d.id === id))
          .filter((d) => d !== undefined);
        return (
          <section key={release.version} className="flex flex-col gap-3">
            {/* «Version — date» row, like the «label — value» rows */}
            <div className="flex items-baseline justify-between gap-4 px-1">
              <h2
                style={{
                  fontSize: type.title,
                  fontVariationSettings: fontWeights.semibold,
                }}
              >
                {release.version}
              </h2>
              <span
                className="text-muted-foreground tabular-nums"
                style={{ fontSize: type.body }}
              >
                {formatDate(release.date)}
              </span>
            </div>
            <ul
              className={`flex list-disc flex-col gap-1.5 pl-5 marker:text-muted-foreground ${size.text}`}
            >
              {release.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            {items.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {items.map((d) => (
                  <Button
                    key={d.id}
                    variant="ghost"
                    size="compact"
                    onClick={() => onSelect(d.id)}
                  >
                    {`${d.name} · ${platforms.find((p) => p.id === d.platform)?.name}${d.group === "uber" ? " · Uber" : ""}`}
                  </Button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </ScreenLayout>
  );
}
