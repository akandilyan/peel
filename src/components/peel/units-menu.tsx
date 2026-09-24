"use client";

import { useSyncExternalStore } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  DropdownContent,
  DropdownMenu,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { MenuItem } from "@/components/ui/menu-item";
import type { Units } from "@/lib/units";

// Size units in the UI (mm or inches) — the only setting, stored
// in this browser. Data is always in mm. The menu is native Dropdown and MenuItem.

const KEY = "peel:units";
const listeners = new Set<() => void>();
let memory: Units | null = null;

function read(): Units {
  if (memory) return memory;
  try {
    return localStorage.getItem(KEY) === "in" ? "in" : "mm";
  } catch {
    return "mm";
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function setUnits(units: Units) {
  memory = units;
  try {
    localStorage.setItem(KEY, units);
  } catch {}
  listeners.forEach((cb) => cb());
}

export function useUnits(): Units {
  return useSyncExternalStore(subscribe, read, () => "mm");
}

const options = [
  { value: "mm", label: "Millimeters" },
  { value: "in", label: "Inches" },
] as const;

export function UnitsMenu({
  size = "icon",
}: {
  size?: "icon" | "icon-compact";
}) {
  const units = useUnits();
  const checkedIndex = options.findIndex((o) => o.value === units);
  return (
    <DropdownMenu>
      <Tooltip content="Units" side="bottom">
        <DropdownTrigger
          render={
            <Button variant="ghost" size={size} aria-label="Units">
              <Settings />
            </Button>
          }
        />
      </Tooltip>
      <DropdownContent align="end" checkedIndex={checkedIndex} className="w-40">
        {options.map((o, i) => (
          <MenuItem
            key={o.value}
            index={i}
            label={o.label}
            checked={checkedIndex === i}
            onSelect={() => setUnits(o.value)}
          />
        ))}
      </DropdownContent>
    </DropdownMenu>
  );
}
