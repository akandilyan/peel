"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownContent,
  DropdownMenu,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { MenuItem } from "@/components/ui/menu-item";

// Theme picker as a menu, like in native apps: Light / Dark / System.
const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

const noopSubscribe = () => () => {};

export function ThemeToggle({
  size = "icon",
}: {
  size?: "icon" | "icon-compact";
}) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  // true only on the client after hydration
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  // Before hydration the theme is unknown — show a neutral icon.
  const checkedIndex = mounted
    ? options.findIndex((o) => o.value === (theme ?? "system"))
    : -1;
  const TriggerIcon = !mounted
    ? Monitor
    : resolvedTheme === "dark"
      ? Moon
      : Sun;

  return (
    <DropdownMenu>
      <DropdownTrigger
        render={
          <Button variant="ghost" size={size} aria-label="Theme">
            <TriggerIcon />
          </Button>
        }
      />
      <DropdownContent
        align="end"
        className="w-40"
        checkedIndex={checkedIndex >= 0 ? checkedIndex : undefined}
      >
        {options.map((o, i) => (
          <MenuItem
            key={o.value}
            index={i}
            icon={o.icon}
            label={o.label}
            checked={checkedIndex === i}
            onSelect={() => setTheme(o.value)}
          />
        ))}
      </DropdownContent>
    </DropdownMenu>
  );
}
