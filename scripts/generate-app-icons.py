#!/usr/bin/env python3
"""Generate Axis native-app icon + splash sources from the Axis "A+X" mark.

Writes:
  resources/icon.png    1024x1024  full-bleed white tile + mark (iOS masks corners)
  resources/splash.png  2732x2732  dark background, centered white tile + mark

Feed these to `npx @capacitor/assets generate`. They reproduce the in-app mark
as a sensible default — drop in designer artwork at the same paths anytime.

Requires Pillow (already available in this environment): python3 scripts/generate-app-icons.py
"""
import math
import os
from PIL import Image, ImageDraw

NAVY = (15, 23, 42)      # #0f172a — the "A" and front of mark
XBACK = (30, 58, 138)    # #1e3a8a — back stroke of the "X"
GRAD0 = (188, 212, 255)  # #bcd4ff — gradient start (light)
GRAD1 = (47, 107, 255)   # #2f6bff — gradient end (brand blue)
WHITE = (255, 255, 255)
DARK = (8, 11, 20)       # #080b14 — app background


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def stroke(draw, p0, p1, width, color_fn):
    """Round-capped thick line by stamping filled circles along the segment."""
    (x0, y0), (x1, y1) = p0, p1
    n = max(2, int(math.hypot(x1 - x0, y1 - y0)))
    r = width / 2
    for i in range(n + 1):
        t = i / n
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color_fn(t))


def draw_mark(draw, scale, ox, oy):
    """Draw the mark in 0..32 design units, scaled by `scale` and offset (ox,oy)."""
    def P(x, y):
        return (ox + x * scale, oy + y * scale)

    solid = lambda c: (lambda _t: c)
    grad = lambda t: lerp(GRAD0, GRAD1, t)

    w = 2.15 * scale
    # "A"
    stroke(draw, P(8.5, 23.5), P(11.8, 8.5), w, solid(NAVY))
    stroke(draw, P(11.8, 8.5), P(15.1, 23.5), w, solid(NAVY))
    stroke(draw, P(10.2, 17), P(13.4, 17), w, solid(NAVY))
    # "X" — gradient front stroke over a navy back stroke
    stroke(draw, P(17.2, 8.5), P(25.5, 23.5), 2.25 * scale, grad)
    stroke(draw, P(25.5, 8.5), P(17.2, 23.5), 2.05 * scale, solid(XBACK))


def make_icon(path, ss=3):
    size = 1024 * ss
    img = Image.new("RGB", (size, size), WHITE)
    draw_mark(ImageDraw.Draw(img), size / 32, 0, 0)
    img.resize((1024, 1024), Image.LANCZOS).save(path)


def make_splash(path, ss=2):
    size = 2732 * ss
    img = Image.new("RGB", (size, size), DARK)
    d = ImageDraw.Draw(img)
    tile = int(820 * ss)
    ox = (size - tile) // 2
    oy = (size - tile) // 2
    d.rounded_rectangle([ox, oy, ox + tile, oy + tile], radius=int(9 / 32 * tile), fill=WHITE)
    draw_mark(d, tile / 32, ox, oy)
    img.resize((2732, 2732), Image.LANCZOS).save(path)


if __name__ == "__main__":
    os.makedirs("resources", exist_ok=True)
    make_icon("resources/icon.png")
    make_splash("resources/splash.png")
    print("Wrote resources/icon.png (1024) and resources/splash.png (2732)")
