"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { SurfaceProvider } from "@/lib/surface-context";
import { decals, renamedDecals, type Decal } from "@/data/decals";
import { withBase } from "@/lib/base-path";
import { AppSidebar } from "./app-sidebar";
import { DecalScreen, type ExportMode } from "./decal-screen";
import { HomeScreen } from "./home-screen";

// Per-decal export parameters live in an external in-memory store: switching to
// another decal keeps what was entered, and after a page reload everything
// returns to defaults (not saved to the URL or the browser).
// input — numbers (for generators), mode — file format, copies — how many cars
// or robots (for static decals), variant — version of a decal with versions.
type Params = {
  input: Record<string, string>;
  mode: Record<string, ExportMode>;
  copies: Record<string, number>;
  variant: Record<string, string>;
};
const empty: Params = { input: {}, mode: {}, copies: {}, variant: {} };
let params = empty;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function setParam<K extends keyof Params>(
  key: K,
  id: string,
  value: Params[K][string],
) {
  params = { ...params, [key]: { ...params[key], [id]: value } };
  listeners.forEach((cb) => cb());
}

/** App: sidebar and decal screen. The screen comes only from the URL: `/car-side-logo/`
 *  is a decal, `/` is home, What's new. */
export function PeelApp() {
  const pathname = usePathname();
  // The current decal comes from the URL: after pushState Next.js updates usePathname,
  // and the page isn't recreated
  const rawId = pathname.split("/")[1] || undefined;
  const pathId = rawId && (renamedDecals[rawId] ?? rawId);
  const decal = pathId ? decals.find((d) => d.id === pathId) : undefined;
  const { input, mode, copies, variant } = useSyncExternalStore(
    subscribe,
    () => params,
    () => empty,
  );

  // Old URLs (renamed decals, ?numbers=… params) are replaced
  // with the current decal URL
  useEffect(() => {
    if (decal && (rawId !== pathId || window.location.search))
      window.history.replaceState(null, "", withBase(`/${decal.id}/`));
  }, [rawId, pathId, decal]);

  const select = (d: Decal) => {
    // Not router.push: route navigation recreates the page along with the sidebar,
    // and the screen flashes. All decals are already in the client bundle, no server needed.
    window.history.pushState(null, "", withBase(`/${d.id}/`));
  };
  const selectById = (id: string) => {
    const d = decals.find((x) => x.id === id);
    if (d) select(d);
  };
  const goHome = () => window.history.pushState(null, "", withBase("/"));

  return (
    // Page surface level: Fluid popups compute their elevation from it
    <SurfaceProvider value={1}>
      <SidebarProvider
        // On wide screens the sidebar is always open, with no collapse button —
        // as on fluidfunctionalism.com. Below xl (1280) it's a slide-out panel
        // (Sidebar's own logic, independent of open).
        open
        onOpenChange={() => {}}
        persist={false}
        mobileBreakpoint={1280}
        className="bg-background"
      >
        <AppSidebar
          selectedId={decal?.id ?? null}
          onSelect={selectById}
          onHome={goHome}
        />
        {/* CUSTOM: screen height with scrolling inside — the island on the right
            stays put on scroll (sticky), the sidebar doesn't scroll with the content */}
        <SidebarInset className="h-svh overflow-hidden bg-background">
          {/* Sidebar button only below xl, when the sidebar hides itself. As on
              fluidfunctionalism.com: pinned to the window corner and outside the
              layout, so the content doesn't shift. */}
          <SidebarTrigger className="fixed top-4 left-4 z-50 xl:hidden" />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {decal ? (
              <DecalScreen
                key={decal.id}
                decal={decal}
                input={input[decal.id] ?? ""}
                onInputChange={(v) => setParam("input", decal.id, v)}
                mode={mode[decal.id] ?? "pdf"}
                onModeChange={(m) => setParam("mode", decal.id, m)}
                copies={copies[decal.id] ?? 1}
                onCopiesChange={(n) => setParam("copies", decal.id, n)}
                variant={variant[decal.id]}
                onVariantChange={(v) => setParam("variant", decal.id, v)}
                onSelect={selectById}
              />
            ) : (
              <HomeScreen onSelect={selectById} />
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </SurfaceProvider>
  );
}
