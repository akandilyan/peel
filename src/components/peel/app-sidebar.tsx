"use client";

import { useState } from "react";
import Image from "next/image";
// Static import: the URL carries a content hash, so a new logo is never stale in cache
import logo from "@/assets/logo.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { TabsSubtle, TabsSubtleItem } from "@/components/ui/tabs-subtle";
import { SidebarWorkspaceHeader } from "@/components/sidebar-app/workspace-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { latest, newDecalIds } from "@/data/changelog";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { UnitsMenu } from "./units-menu";
import {
  decals,
  decalsInOrder,
  groups,
  platforms,
  type Decal,
  type Platform,
} from "@/data/decals";

interface AppSidebarProps {
  /** The open decal; null is home (What's new) */
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHome: () => void;
}

// Sidebar from native Fluid parts: logo header, on the right the version (button to
// home, What's new), units and theme; platform switcher (TabsSubtle);
// Base / Uber groups with decals at a single level.
export function AppSidebar({ selectedId, onSelect, onHome }: AppSidebarProps) {
  // Until a platform is picked manually, show the open decal's platform
  const [platformOverride, setPlatformOverride] = useState<Platform | null>(
    null,
  );
  const selected = decals.find((d) => d.id === selectedId);
  const platform = platformOverride ?? selected?.platform ?? platforms[0].id;

  const select = (d: Decal) => {
    setPlatformOverride(d.platform);
    onSelect(d.id);
  };

  return (
    // As on fluidfunctionalism.com: no border, no divider strip at the edge
    // and no drag-to-resize (rail={false})
    <Sidebar variant="sidebar" bordered={false} rail={false}>
      <SidebarHeader>
        {/* CUSTOM: «logo — version, units, theme» row; mb-2 gives 16px to the
            tabs: TabsSubtle has its own room for the highlight, and with only the
            header's gap-2 the tabs stick to the logo */}
        <div className="mb-2 flex items-center gap-0.5">
          <div className="min-w-0 flex-1">
            <SidebarWorkspaceHeader
              name="Peel"
              // Logo in the tile slot: the Fluid header accepts any 20px mark
              tile={
                <Image
                  src={logo}
                  alt=""
                  width={20}
                  height={20}
                  // Above the fold: load right away, not lazily (no blank tile)
                  priority
                  className="block"
                />
              }
            />
          </div>
          {/* Version is a button to home (What's new) */}
          <Tooltip content="What's new" side="bottom">
            <Button
              variant="ghost"
              size="compact"
              className="tabular-nums"
              aria-label={`What's new, version ${latest.version}`}
              aria-current={selectedId === null ? "page" : undefined}
              onClick={onHome}
            >
              {latest.version}
            </Button>
          </Tooltip>
          <UnitsMenu size="icon-compact" />
          <ThemeToggle size="icon-compact" />
        </div>
        <TabsSubtle
          selectedIndex={platforms.findIndex((p) => p.id === platform)}
          onSelect={(i) => setPlatformOverride(platforms[i].id)}
        >
          {platforms.map((p, i) => (
            <TabsSubtleItem key={p.id} index={i} label={p.name} />
          ))}
        </TabsSubtle>
      </SidebarHeader>

      <SidebarContent>
        {/* Groups (Base, Uber) with SidebarGroupLabel labels; inside, the selected
            platform's decals at a single level, in category order. */}
        {groups.map((g) => {
          const items = decalsInOrder(platform).filter((d) => d.group === g.id);
          if (!items.length) return null;
          return (
            <SidebarGroup key={g.id}>
              {/* Count next to the label — like «Components 26» on
                  fluidfunctionalism.com; SidebarGroupLabel supports it natively */}
              <SidebarGroupLabel>
                {g.name}
                <span className="text-[11px]">{items.length}</span>
              </SidebarGroupLabel>
              <SidebarMenu>
                {items.map((d) => (
                  <SidebarMenuItem key={d.id}>
                    <SidebarMenuButton
                      isActive={d.id === selectedId}
                      onClick={() => select(d)}
                    >
                      {d.name}
                      {/* New in the latest version — a dot after the name, like
                          new components on fluidfunctionalism.com (CUSTOM:
                          bg-blue-500 color as on the site, there's no token) */}
                      {newDecalIds.has(d.id) && (
                        <span
                          className="inline-block size-1.5 shrink-0 rounded-full bg-blue-500"
                          aria-label="New"
                        />
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
