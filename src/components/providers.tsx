"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { ShapeProvider } from "@/lib/shape-context";
import { SizeProvider } from "@/lib/size-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {/* Fluid component radius and size — default values */}
      <ShapeProvider>
        <SizeProvider>{children}</SizeProvider>
      </ShapeProvider>
    </ThemeProvider>
  );
}
