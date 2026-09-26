import type { Metadata } from "next";
// Inter Variable with weight and optical size (opsz) axes: Fluid styles set
// both — "'wght' 700, 'opsz' 25" on headings. Without opsz the axis is silently ignored.
import "@fontsource-variable/inter/opsz.css";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Peel",
  description: "Print-ready decals, business cards, ID badges and lanyards for Avride",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
