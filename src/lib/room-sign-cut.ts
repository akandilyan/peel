// The meeting room sign's cut line for the letters, shared by the PDF and the
// preview: letters whose ink boxes overlap (ff, ft, tf, tt, T7 — the crossbars
// of f and t meet even at −1% tracking) are merged into one outline with
// paper.js, so the knife never cuts through a letter and the preview shows
// exactly what's cut. paper.js is loaded on demand (`paper/dist/paper-core`; its
// Node shims resolve to an empty module, see next.config.ts).
// Units: mm on the sheet, origin at the top left, y down.

import type { PlacedRoomGlyph, RoomSignLayout } from "./room-sign";

type Paper = typeof import("paper/dist/paper-core");
export type CutScope = InstanceType<Paper["PaperScope"]>;

export async function loadCutScope(): Promise<CutScope> {
  const { default: paper } = await import("paper/dist/paper-core");
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(1, 1));
  return scope;
}

const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

// Neighbors on a line whose ink boxes overlap go into one cluster
function clusters(glyphs: PlacedRoomGlyph[], scale: number): PlacedRoomGlyph[][] {
  const out: PlacedRoomGlyph[][] = [];
  glyphs.forEach((g, i) => {
    const prev = glyphs[i - 1];
    const touching =
      prev &&
      prev.y === g.y &&
      prev.x + prev.bounds[2] * scale > g.x + g.bounds[0] * scale;
    if (touching) out[out.length - 1].push(g);
    else out.push([g]);
  });
  return out;
}

/** The letters' cut line: one SVG path (absolute M, L, C, Z) per letter or
 *  per merged cluster, in sheet mm. */
export function letterOutlines(layout: RoomSignLayout, scope: CutScope): string[] {
  const k = layout.scale;
  return clusters(layout.glyphs, k).map((group) => {
    let merged: InstanceType<Paper["PathItem"]> | null = null;
    for (const g of group) {
      const p = new scope.CompoundPath({ pathData: g.d, insert: false });
      // Font units, y up → sheet mm, y down
      p.transform(new scope.Matrix(k, 0, 0, -k, g.x, g.y));
      merged = merged ? merged.unite(p, { insert: false }) : p;
    }
    const paths = (merged instanceof scope.CompoundPath ? merged.children : [merged]) as InstanceType<
      Paper["Path"]
    >[];
    const d: string[] = [];
    for (const path of paths) {
      const segs = path.segments;
      if (!segs.length) continue;
      d.push(`M${n(segs[0].point.x)} ${n(segs[0].point.y)}`);
      for (let i = 1; i <= segs.length; i++) {
        const a = segs[i - 1];
        const b = segs[i % segs.length];
        if (a.handleOut.isZero() && b.handleIn.isZero()) d.push(`L${n(b.point.x)} ${n(b.point.y)}`);
        else
          d.push(
            `C${n(a.point.x + a.handleOut.x)} ${n(a.point.y + a.handleOut.y)} ${n(
              b.point.x + b.handleIn.x,
            )} ${n(b.point.y + b.handleIn.y)} ${n(b.point.x)} ${n(b.point.y)}`,
          );
      }
      d.push("Z");
    }
    return d.join(" ");
  });
}
