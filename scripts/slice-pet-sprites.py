"""
Builds the Player Pet images from the sprite strip in reference/pet-sprites.png.

For each of the five poses it writes, into src/assets/pet:
  <state>.png         the pose with the jersey number erased (filled with jersey red)
  <state>-jersey.png  a "uniform map": which pixels are the red uniform (alpha)
                      and how light or dark each one is (gray, 128 = normal red)
and prints where the erased number was, for NUMBER_SPOTS in src/components/petArt.ts.

The app recolors the uniform with the map and draws the number back on, so the
athlete can pick any jersey color and number.

Run:  python scripts/slice-pet-sprites.py      (needs: pip install pillow numpy)
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'reference' / 'pet-sprites.png'
OUT = ROOT / 'src' / 'assets' / 'pet'

# Left/right edge of each pose in the strip, in order.
POSES = [('idle', 61, 372), ('happy', 459, 834), ('training', 856, 1247), ('tired', 1370, 1642), ('celebrating', 1745, 2114)]
# Every frame is the same box so the feet line up: rows TOP..BASE, WIDTH wide, centered on the jersey.
TOP, BASE, WIDTH = 40, 630, 480
SCALE = 2  # frames are saved at half size (240 x 295)
# The open mouth in the happy pose is the same red as the jersey; leave it alone.
KEEP_OUT = {'happy': (600, 290, 720, 362)}  # x0, y0, x1, y1 in the strip

img = Image.open(SOURCE).convert('RGBA')
px = np.array(img).astype(float)
r, g, b, alpha = (px[..., i] for i in range(4))
mx = np.maximum(np.maximum(r, g), b)
mn = np.minimum(np.minimum(r, g), b)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
val = mx / 255
span = np.maximum(mx - mn, 1)
hue = np.where(mx == r, (60 * (g - b) / span) % 360, np.where(mx == g, 60 * (b - r) / span + 120, 60 * (r - g) / span + 240))

# Jersey red is hue 0-10; the brown football is 14-25.
is_red = (alpha > 128) & ((hue <= 10.5) | (hue >= 340)) & (sat > 0.45) & (val > 0.2)
is_white = (alpha > 128) & (r > 200) & (g > 200) & (b > 200)


def dilate(mask: np.ndarray, steps: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(steps):
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]
        grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def components(mask: np.ndarray):
    """Groups of touching pixels, as lists of (y, x)."""
    seen = np.zeros_like(mask, dtype=bool)
    h, w = mask.shape
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        group, queue = [], deque([(y0, x0)])
        seen[y0, x0] = True
        while queue:
            y, x = queue.popleft()
            group.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    queue.append((ny, nx))
        yield group


OUT.mkdir(parents=True, exist_ok=True)
for name, x0, x1 in POSES:
    cols = slice(x0 - 8, x1 + 9)
    red, white = is_red[:, cols], is_white[:, cols]
    rgba = px[:, cols].copy()

    # 1. Find the number: white blobs almost completely surrounded by jersey red.
    digits = np.zeros_like(white)
    for group in components(white):
        if len(group) < 200:
            continue
        blob = np.zeros_like(white)
        ys, xs = zip(*group)
        blob[ys, xs] = True
        ring = dilate(blob, 4) & ~dilate(blob, 1)
        if red[ring].mean() > 0.8:
            digits |= blob
    ys, xs = np.nonzero(digits)
    box = (xs.min() + x0 - 8, ys.min(), xs.max() + x0 - 8, ys.max())

    # 2. Erase it: paint the number (and its soft edge) with the jersey red right around it.
    hole = dilate(digits, 4)
    ring = dilate(digits, 9) & ~hole & red
    sat_here = sat[:, cols]
    solid = ring & (sat_here > 0.6)
    rgba[hole, :3] = np.median(rgba[solid, :3], axis=0)
    rgba[hole, 3] = 253

    # 3. Uniform map: red pixels (now including the erased number), shade relative to the usual red.
    sub = rgba[..., :3]
    smx, smn = sub.max(-1), sub.min(-1)
    ssat = np.where(smx > 0, (smx - smn) / np.maximum(smx, 1), 0)
    sspan = np.maximum(smx - smn, 1)
    shue = np.where(smx == sub[..., 0], (60 * (sub[..., 1] - sub[..., 2]) / sspan) % 360, 999)
    clearly_red = (sub[..., 0] > 1.6 * sub[..., 1]) & (sub[..., 0] > 1.6 * sub[..., 2])
    uniform = (rgba[..., 3] > 0) & ((shue <= 10.5) | (shue >= 340)) & (smx > 50) & clearly_red
    if name in KEEP_OUT:
        kx0, ky0, kx1, ky1 = KEEP_OUT[name]
        uniform[ky0:ky1, kx0 - (x0 - 8):kx1 - (x0 - 8)] = False
    weight = np.clip((ssat - 0.3) / 0.3, 0, 1) * uniform
    ref = np.median(smx[uniform & (ssat > 0.6)])
    shade = np.clip(smx / ref * 128, 0, 255)
    jersey = np.zeros_like(rgba)
    jersey[..., 0] = jersey[..., 1] = jersey[..., 2] = shade
    jersey[..., 3] = weight * rgba[..., 3]

    # 4. Cut every pose to the same box, centered on the jersey, and shrink.
    cx = int(round(np.nonzero(red)[1].mean())) + x0 - 8
    left = cx - WIDTH // 2

    def frame(arr: np.ndarray) -> Image.Image:
        # Padding so a frame near the strip's edge can still be cut out.
        pad = WIDTH
        canvas = np.zeros((px.shape[0], px.shape[1] + 2 * pad, 4))
        canvas[:, x0 - 8 + pad:x1 + 9 + pad] = arr
        im = Image.fromarray(canvas[TOP:BASE, left + pad:left + pad + WIDTH].astype(np.uint8), 'RGBA')
        return im.convert('RGBa').resize((WIDTH // SCALE, (BASE - TOP) // SCALE), Image.LANCZOS).convert('RGBA')

    frame(rgba).save(OUT / f'{name}.png', optimize=True)
    frame(jersey).save(OUT / f'{name}-jersey.png', optimize=True)

    # Where the number was, in frame pixels: center x, center y, height.
    nx = ((box[0] + box[2]) / 2 - left) / SCALE
    ny = ((box[1] + box[3]) / 2 - TOP) / SCALE
    nh = (box[3] - box[1]) / SCALE
    nw = (box[2] - box[0]) / SCALE
    print(f'{name}: {{ x: {nx:.1f}, y: {ny:.1f}, height: {nh:.1f} }},  // width {nw:.1f}')
