#!/usr/bin/env python3
"""Union of filled paths: the outline a plotter should cut.

Used by regenerate-sources.mts for outline-cut decals: text converted to outlines
often builds a letter from overlapping contours (the crossbar of a t over its
stem), and cutting each contour would cut through the letter.

stdin: {"fills": [{"evenOdd": bool, "segs": [{"op": "m|l|c|h", "p": [x, y, ...]}]}]}
stdout: {"segs": [...]} — the merged contours, same format.

Requires skia-pathops (python3 -m venv .venv && .venv/bin/pip install skia-pathops).
"""

import json
import sys

from pathops import FillType, Path, PathOp, op


def to_path(fill):
    path = Path(fillType=FillType.EVEN_ODD if fill["evenOdd"] else FillType.WINDING)
    pen = path.getPen()
    open_ = False
    for sg in fill["segs"]:
        p = sg["p"]
        if sg["op"] == "m":
            if open_:
                pen.closePath()
            pen.moveTo((p[0], p[1]))
            open_ = True
        elif sg["op"] == "l":
            pen.lineTo((p[0], p[1]))
        elif sg["op"] == "c":
            pen.curveTo((p[0], p[1]), (p[2], p[3]), (p[4], p[5]))
        elif sg["op"] == "h" and open_:
            pen.closePath()
            open_ = False
    if open_:
        pen.closePath()
    return path


class SegPen:
    def __init__(self):
        self.segs = []
        self.cur = (0.0, 0.0)

    def moveTo(self, pt):
        self.segs.append({"op": "m", "p": [*pt]})
        self.cur = pt

    def lineTo(self, pt):
        self.segs.append({"op": "l", "p": [*pt]})
        self.cur = pt

    def curveTo(self, *pts):
        self.segs.append({"op": "c", "p": [v for pt in pts for v in pt]})
        self.cur = pts[-1]

    def qCurveTo(self, *pts):
        # Skia keeps cubics as cubics; a quadratic (one control point) becomes one
        (x0, y0), (qx, qy), (x, y) = self.cur, pts[0], pts[-1]
        self.curveTo(
            (x0 + 2 / 3 * (qx - x0), y0 + 2 / 3 * (qy - y0)),
            (x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y)),
            (x, y),
        )

    def closePath(self):
        self.segs.append({"op": "h", "p": []})

    endPath = closePath


fills = json.load(sys.stdin)["fills"]
result = Path()
for fill in fills:
    result = op(result, to_path(fill), PathOp.UNION, fix_winding=True)
pen = SegPen()
result.draw(pen)
json.dump({"segs": pen.segs}, sys.stdout)
