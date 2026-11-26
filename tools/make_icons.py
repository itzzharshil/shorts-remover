"""Render the extension icons into icons/.

The icon is a portrait video card behind a red "prohibited" sign on a dark
rounded square. It's drawn with signed shapes and supersampling, using only
the Python standard library, so no image tools are needed:

    python3 tools/make_icons.py
"""
import math
import struct
import zlib
from pathlib import Path

SIZES = (16, 32, 48, 128)
SUPERSAMPLE = 6  # samples per pixel along each axis


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def vertical_gradient(top, bottom):
    return lambda x, y: lerp(top, bottom, min(max(y, 0.0), 1.0))


def rounded_box(cx, cy, hw, hh, r):
    def inside(x, y):
        qx = abs(x - cx) - (hw - r)
        qy = abs(y - cy) - (hh - r)
        return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) <= r
    return inside


def ring(cx, cy, outer, inner):
    return lambda x, y: inner <= math.hypot(x - cx, y - cy) <= outer


def capsule(ax, ay, bx, by, r):
    def inside(x, y):
        pax, pay, bax, bay = x - ax, y - ay, bx - ax, by - ay
        h = max(0.0, min(1.0, (pax * bax + pay * bay) / (bax * bax + bay * bay)))
        return math.hypot(pax - bax * h, pay - bay * h) <= r
    return inside


def layers_for(size):
    # Small toolbar sizes get a heavier sign so it survives at 16 px.
    small = size <= 32
    ring_outer, ring_inner = (0.43, 0.31) if small else (0.40, 0.32)
    slash_r = 0.06 if small else 0.042
    card_hw, card_hh = (0.14, 0.21) if small else (0.15, 0.225)
    d = (ring_outer + ring_inner) / 2 / math.sqrt(2)

    red = vertical_gradient((255, 92, 80), (214, 32, 26))
    background = vertical_gradient((52, 52, 56), (14, 14, 16))
    layers = [
        (rounded_box(0.5, 0.5, 0.5, 0.5, 0.225), background),
        (rounded_box(0.5, 0.5, card_hw, card_hh, card_hw * 0.36), vertical_gradient((255, 255, 255), (226, 226, 230))),
    ]
    if not small:
        # A background-coloured gap that separates the slash from the card.
        # It's too fine to read at toolbar sizes.
        layers.append((capsule(0.5 - d, 0.5 - d, 0.5 + d, 0.5 + d, slash_r + 0.03), background))
    layers += [
        (ring(0.5, 0.5, ring_outer, ring_inner), red),
        (capsule(0.5 - d, 0.5 - d, 0.5 + d, 0.5 + d, slash_r), red),
    ]
    return layers


def render(size):
    layers = layers_for(size)
    n = SUPERSAMPLE
    rows = []
    for py in range(size):
        row = bytearray([0])  # PNG filter type: none
        for px in range(size):
            r = g = b = covered = 0
            for sy in range(n):
                for sx in range(n):
                    x = (px + (sx + 0.5) / n) / size
                    y = (py + (sy + 0.5) / n) / size
                    colour = None
                    for inside, paint in layers:
                        if inside(x, y):
                            colour = paint(x, y)
                    if colour:
                        r += colour[0]; g += colour[1]; b += colour[2]; covered += 1
            if covered:
                row += bytes((round(r / covered), round(g / covered), round(b / covered), round(255 * covered / (n * n))))
            else:
                row += bytes(4)
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path, size, raw):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
                     + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    for size in SIZES:
        write_png(out / f"icon{size}.png", size, render(size))
        print(f"wrote icons/icon{size}.png")
