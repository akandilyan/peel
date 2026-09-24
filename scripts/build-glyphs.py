"""Inter Variable digit outlines for the number generator — a port of build_glyphs from
../fleet-decals/build.py with axis selection.

Run (requires fonttools and skia-pathops):
  python3 scripts/build-glyphs.py <wght> <opsz> <chars> <out.json>
  python3 scripts/build-glyphs.py 500 32 0123456789 src/data/glyphs-robot.json

Overlapping contours are merged (OverlapMode.REMOVE): the cut line must not
intersect itself.
"""
import hashlib
import json
import sys
from pathlib import Path

from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FONT = Path(__file__).resolve().parent.parent.parent / "fleet-decals" / "fonts" / "InterVariable-4.1.ttf"


class PathPen(BasePen):
    def __init__(self, glyphSet):
        super().__init__(glyphSet)
        self.out = []

    def _moveTo(self, p): self.out.append("M%g %g" % p)
    def _lineTo(self, p): self.out.append("L%g %g" % p)
    def _qCurveToOne(self, p1, p2): self.out.append("Q%g %g %g %g" % (*p1, *p2))
    def _curveToOne(self, p1, p2, p3): self.out.append("C%g %g %g %g %g %g" % (*p1, *p2, *p3))
    def _closePath(self): self.out.append("Z")
    def _endPath(self): pass


def kerning(font, names):
    # As in build.py: kern pairs (XAdvance) in HarfBuzz subtable order
    gpos = font["GPOS"].table
    lookups = sorted({i for fr in gpos.FeatureList.FeatureRecord if fr.FeatureTag == "kern" for i in fr.Feature.LookupListIndex})
    by_name = {name: ch for ch, name in names.items()}
    total = {}
    for li in lookups:
        lookup = gpos.LookupList.Lookup[li]
        found = {}
        for st in lookup.SubTable:
            kind = lookup.LookupType
            if kind == 9:
                kind, st = st.ExtensionLookupType, st.ExtSubTable
            if kind != 2:
                continue
            for i, g1 in enumerate(st.Coverage.glyphs):
                if g1 not in by_name:
                    continue
                if st.Format == 1:
                    for rec in st.PairSet[i].PairValueRecord:
                        if rec.SecondGlyph in by_name:
                            key = by_name[g1] + by_name[rec.SecondGlyph]
                            if key not in found:
                                found[key] = (getattr(rec.Value1, "XAdvance", 0) or 0) if rec.Value1 else 0
                else:
                    c1 = st.ClassDef1.classDefs.get(g1, 0)
                    for g2, ch2 in by_name.items():
                        key = by_name[g1] + ch2
                        if key in found:
                            continue
                        rec = st.Class1Record[c1].Class2Record[st.ClassDef2.classDefs.get(g2, 0)]
                        found[key] = (getattr(rec.Value1, "XAdvance", 0) or 0) if rec.Value1 else 0
        for key, value in found.items():
            total[key] = total.get(key, 0) + value
    return {k: v for k, v in sorted(total.items()) if v}


def main():
    wght, opsz, chars, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], Path(sys.argv[4])
    axes = {"wght": wght, "opsz": opsz}
    font = instancer.instantiateVariableFont(TTFont(FONT), axes, overlap=instancer.OverlapMode.REMOVE)
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()
    names = {ch: cmap[ord(ch)] for ch in chars}
    glyphs = {}
    for ch, name in names.items():
        pen = PathPen(gs)
        gs[name].draw(pen)
        bp = BoundsPen(gs)
        gs[name].draw(bp)
        glyphs[ch] = {"name": name, "advance": font["hmtx"][name][0], "bounds": list(bp.bounds), "d": " ".join(pen.out)}
    data = {
        "source": {
            "file": "fonts/InterVariable-4.1.ttf",
            "sha256": hashlib.sha256(FONT.read_bytes()).hexdigest(),
            "axes": axes,
            "version": font["name"].getDebugName(5),
        },
        "unitsPerEm": font["head"].unitsPerEm,
        "capHeight": font["OS/2"].sCapHeight,
        "glyphs": glyphs,
        "kerning": kerning(font, names),
    }
    out.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    print("Wrote %s (%d glyphs, %d kerning pairs)" % (out, len(glyphs), len(data["kerning"])))


main()
