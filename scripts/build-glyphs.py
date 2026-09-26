"""Inter Variable outlines — a port of build_glyphs from ../fleet-decals/build.py with
axis selection. Digits for the number generators, Latin for the business card.

Run (requires fonttools and skia-pathops):
  python3 scripts/build-glyphs.py <wght> <opsz> <chars> <out.json>
  python3 scripts/build-glyphs.py 500 32 0123456789 src/data/glyphs-robot.json
  python3 scripts/build-glyphs.py 600 32 latin src/data/glyphs-card.json cv11

A static font instead of Inter (no axes): --font <file> <chars> <out.json>. The ID
badge name is Akzidenz-Grotesk BQ Extended Medium, a licensed brand font kept
outside the repo; only the characters the badge prints go into the JSON:
  python3 scripts/build-glyphs.py --font AkzidenzGrotesk-MediumExtended.otf "ABCDEFGHIJKLMNOPQRSTUVWXYZ -'." src/data/glyphs-badge.json
The visitor badge name is CHAOS16 (SIL OFL):
  python3 scripts/build-glyphs.py --font CHAOS16.otf "ABCDEFGHIJKLMNOPQRSTUVWXYZ -'." src/data/glyphs-visitor.json

An optional list of OpenType features (comma-separated) swaps glyphs for their
alternates: cv11 is Inter's single-storey a.

chars "latin" is printable ASCII, Latin-1 letters and typographic punctuation.

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


def single_substitutions(font, features):
    """Glyph → alternate from the single substitutions of the given GSUB features."""
    gsub = font["GSUB"].table
    mapping = {}
    for fr in gsub.FeatureList.FeatureRecord:
        if fr.FeatureTag not in features:
            continue
        for li in fr.Feature.LookupListIndex:
            lookup = gsub.LookupList.Lookup[li]
            for st in lookup.SubTable:
                kind = lookup.LookupType
                if kind == 7:
                    kind, st = st.ExtensionLookupType, st.ExtSubTable
                if kind == 1:
                    mapping.update(st.mapping)
    return mapping


def kerning(font, names):
    # As in build.py: kern pairs (XAdvance) in HarfBuzz subtable order
    if "GPOS" not in font:
        return {}
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


LATIN = (
    "".join(chr(c) for c in range(0x20, 0x7F))
    + "".join(chr(c) for c in range(0xC0, 0x100) if c not in (0xD7, 0xF7))
    + "\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u00B7"
)


def main():
    if sys.argv[1] == "--font":
        # A static font: no axes, no instancing
        source, chars, out = Path(sys.argv[2]), sys.argv[3], Path(sys.argv[4])
        features = [f for f in (sys.argv[5] if len(sys.argv) > 5 else "").split(",") if f]
        axes = {}
        font = TTFont(source)
    else:
        wght, opsz, chars, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], Path(sys.argv[4])
        features = [f for f in (sys.argv[5] if len(sys.argv) > 5 else "").split(",") if f]
        source = FONT
        axes = {"wght": wght, "opsz": opsz}
        font = instancer.instantiateVariableFont(TTFont(FONT), axes, overlap=instancer.OverlapMode.REMOVE)
    if chars == "latin":
        chars = LATIN
    cmap = font.getBestCmap()
    gs = font.getGlyphSet()
    # A font without a space (the visitor badge's CHAOS16) gets one: a quarter
    # em, as renderers fall back to
    missing_space = " " in chars and ord(" ") not in cmap
    names = {ch: cmap[ord(ch)] for ch in chars if not (ch == " " and missing_space)}
    alternates = single_substitutions(font, features) if features else {}
    names = {ch: alternates.get(name, name) for ch, name in names.items()}
    glyphs = {}
    for ch, name in names.items():
        pen = PathPen(gs)
        gs[name].draw(pen)
        bp = BoundsPen(gs)
        gs[name].draw(bp)
        # A space has no outline and no bounds
        bounds = list(bp.bounds) if bp.bounds else [0, 0, 0, 0]
        glyphs[ch] = {"name": name, "advance": font["hmtx"][name][0], "bounds": bounds, "d": " ".join(pen.out)}
    if missing_space:
        glyphs[" "] = {"name": "space", "advance": font["head"].unitsPerEm // 4, "bounds": [0, 0, 0, 0], "d": ""}
    data = {
        "source": {
            # File name only: a local path would put the user's folders in the repo
            "file": "fonts/InterVariable-4.1.ttf" if source == FONT else source.name,
            "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "axes": axes,
            "features": features,
            "version": font["name"].getDebugName(5),
        },
        "unitsPerEm": font["head"].unitsPerEm,
        "capHeight": font["OS/2"].sCapHeight,
        # Line box metrics: text in a line box is placed as in Figma and CSS
        "ascender": font["hhea"].ascent,
        "descender": font["hhea"].descent,
        "glyphs": glyphs,
        "kerning": kerning(font, names),
    }
    out.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    print("Wrote %s (%d glyphs, %d kerning pairs)" % (out, len(glyphs), len(data["kerning"])))


main()
