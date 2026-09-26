import type { Metadata, Viewport } from "next";
// Inter Variable with weight and optical size (opsz) axes: Fluid styles set
// both — "'wght' 700, 'opsz' 25" on headings. Without opsz the axis is silently ignored.
import "@fontsource-variable/inter/opsz.css";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Peel",
  description: "Print-ready decals, business cards, ID badges and lanyards for Avride",
};

// maximumScale 1: iOS zooms the page in when a field under 16 px gets the focus
// (the business card form, the badge name) and leaves it zoomed. Safari still
// pinch-zooms by hand — it ignores the limit for that.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
