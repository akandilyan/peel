import { notFound } from "next/navigation";
import { PeelApp } from "@/components/peel/peel-app";
import { decals, renamedDecals } from "@/data/decals";

// One page for all decals: `/` and `/car-side-logo` open the app,
// the selected decal comes from the URL. URLs of known decals are generated at build time.
export function generateStaticParams() {
  return [
    { decal: [] },
    ...decals.map((d) => ({ decal: [d.id] })),
    // Old URLs — pages that immediately switch to the new ones (see PeelApp)
    ...Object.keys(renamedDecals).map((id) => ({ decal: [id] })),
  ];
}

export default async function Page({ params }: PageProps<"/[[...decal]]">) {
  const { decal } = await params;
  const raw = decal?.[0];
  const id = raw && (renamedDecals[raw] ?? raw);
  if (decal && (decal.length > 1 || !decals.some((d) => d.id === id)))
    notFound();
  return <PeelApp />;
}
