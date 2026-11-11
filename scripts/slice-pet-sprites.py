"""
Builds the Player Pet images from the sprite strip in reference/pet-sprites.png.

Steps for each of the five poses:
  1. erase the jersey number (filled with the jersey red around it)
  2. clean the art into true pixel art: one art pixel per 5 x 5 block, so every
     edge is a clean step (the grid is shifted to fit each pose best); one
     small shared set of flat colors (no soft gradients or noise); stray
     specks removed; the two eyes made a matched pair
  3. cut every pose to the same box, feet on the same line

Writes into src/assets/pet:
  <state>.png    the cleaned pose (96 x 119, shown scaled up with crisp pixels)
  palette.json   the shared colors, marking which ones are uniform or skin and
                 how light each is, so the app can swap them for the athlete's
                 choices by exact color
and prints where the number was, for NUMBER_SPOTS in src/components/petArt.ts.

Run:  python scripts/slice-pet-sprites.py      (needs: pip install pillow numpy)
"""
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'reference' / 'pet-sprites.png'
OUT = ROOT / 'src' / 'assets' / 'pet'

# Left/right edge of each pose in the strip, in order.
POSES = [('idle', 61, 372), ('happy', 459, 834), ('training', 856, 1247), ('tired', 1370, 1642), ('celebrating', 1745, 2114)]
TOP, BASE, WIDTH = 38, 630, 480  # every frame: rows TOP..BASE, WIDTH wide, centered on the jersey
SCALE = 5                        # one art pixel per 5 x 5 block of the strip: frames are 96 x 119
TOP = BASE - -(-(BASE - TOP) // SCALE) * SCALE  # make the height a whole number of blocks
COLORS = 22                      # colors found before similar ones are merged
# The open mouth in the happy pose is jersey red; give it its own fixed color.
MOUTH = {'happy': (600, 290, 720, 362)}  # x0, y0, x1, y1 in the strip
MOUTH_COLOR = (205, 82, 78)
# The football's browns, kept separate so it never turns jersey-colored.
BALL_COLORS = [(146, 72, 38), (104, 50, 30)]

img = Image.open(SOURCE).convert('RGBA')
px = np.array(img).astype(float)


def hsv(rgb: np.ndarray):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    span = np.maximum(mx - mn, 1)
    hue = np.where(mx == r, (60 * (g - b) / span) % 360, np.where(mx == g, 60 * (b - r) / span + 120, 60 * (r - g) / span + 240))
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    return hue, sat, mx / 255


def is_uniform_red(rgb: np.ndarray) -> np.ndarray:
    """Jersey red is hue 0-10; the brown football is 14-25."""
    hue, sat, val = hsv(rgb)
    clearly_red = (rgb[..., 0] > 1.6 * rgb[..., 1]) & (rgb[..., 0] > 1.6 * rgb[..., 2])
    return ((hue <= 10.5) | (hue >= 340)) & (sat > 0.45) & (val > 0.2) & clearly_red


def is_skin(rgb: np.ndarray) -> np.ndarray:
    hue, sat, val = hsv(rgb)
    return (hue >= 20) & (hue <= 42) & (sat >= 0.15) & (sat <= 0.6) & (val > 0.6)


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


def box_sum(a: np.ndarray, radius: int) -> np.ndarray:
    """Sum over a (2r+1)-square around each pixel, for every channel."""
    pad = np.pad(a, ((radius + 1, radius), (radius + 1, radius), (0, 0)))
    c = pad.cumsum(0).cumsum(1)
    k = 2 * radius + 1
    return c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]


# ---------- 1. Cut each pose and erase its number ----------
frames, spots = {}, {}
for name, x0, x1 in POSES:
    cols = slice(x0 - 8, x1 + 9)
    rgba = px[:, cols].copy()
    red = (rgba[..., 3] > 128) & is_uniform_red(rgba[..., :3])
    white = (rgba[..., 3] > 128) & (rgba[..., :3] > 200).all(-1)

    digits = np.zeros_like(white)
    for group in components(white):
        if len(group) < 200:
            continue
        blob = np.zeros_like(white)
        ys, xs = zip(*group)
        blob[ys, xs] = True
        ring = dilate(blob, 4) & ~dilate(blob, 1)
        if red[ring].mean() > 0.8:  # a white blob surrounded by jersey red is a digit
            digits |= blob
    ys, xs = np.nonzero(digits)
    box = (xs.min() + x0 - 8, ys.min(), xs.max() + x0 - 8, ys.max())
    hole = dilate(digits, 4)
    ring = dilate(digits, 9) & ~hole & red
    _, sat, _ = hsv(rgba[..., :3])
    rgba[hole, :3] = np.median(rgba[ring & (sat > 0.6), :3], axis=0)
    rgba[hole, 3] = 255

    if name in MOUTH:
        mx0, my0, mx1, my1 = MOUTH[name]
        area = np.zeros_like(red)
        area[my0:my1, mx0 - (x0 - 8):mx1 - (x0 - 8)] = True
        rgba[area & red, :3] = MOUTH_COLOR

    # Same box for every pose, centered on the jersey.
    cx = int(round(np.nonzero(red)[1].mean())) + x0 - 8
    left = cx - WIDTH // 2
    canvas = np.zeros((px.shape[0], px.shape[1] + 2 * WIDTH, 4))
    canvas[:, x0 - 8 + WIDTH:x1 + 9 + WIDTH] = rgba
    frames[name] = canvas[TOP:BASE, left + WIDTH:left + 2 * WIDTH]
    spots[name] = (
        ((box[0] + box[2]) / 2 - left) / SCALE,
        ((box[1] + box[3]) / 2 - TOP) / SCALE,
        (box[3] - box[1]) / SCALE,
        (box[2] - box[0]) / SCALE,
    )

# ---------- 2. One shared set of flat colors (k-means) ----------
opaque = np.concatenate([f[f[..., 3] > 128][:, :3] for f in frames.values()])
rng = np.random.default_rng(1)
sample = opaque[rng.choice(len(opaque), 60000, replace=False)]
centers = sample[rng.choice(len(sample), COLORS, replace=False)]
for _ in range(30):
    nearest = ((sample[:, None, :] - centers[None]) ** 2).sum(-1).argmin(1)
    for k in range(COLORS):
        if (nearest == k).any():
            centers[k] = sample[nearest == k].mean(0)
# Merge colors that look the same (several near-blacks, near-whites).
merged = []
for c in sorted(centers.tolist(), key=sum):
    for group in merged:
        if np.abs(np.array(group[0]) - c).max() < 28:
            group.append(c)
            break
    else:
        merged.append([c])
centers = np.array([np.mean(g, 0) for g in merged])
# Outline: one pure dark color. Whites: one pure white (near-whites only made specks).
centers[centers.sum(1) < 120] = (20, 20, 28)
centers[centers.min(1) > 215] = (252, 250, 249)
centers = np.unique(np.round(centers), axis=0)
# Ball browns, then the mouth (last), keep their exact colors.
centers = np.vstack([centers, *BALL_COLORS, MOUTH_COLOR])
palette = np.round(centers).astype(int)
TRANSPARENT = len(palette)

# ---------- 3. Map pixels to the colors, line up the grid, shrink, tidy ----------
OUT.mkdir(parents=True, exist_ok=True)
for old in OUT.glob('*-jersey.png'):
    old.unlink()  # from the earlier version of this script
SKIN_INDEX = int(np.argmin(((palette - [247, 203, 148]) ** 2).sum(1)))
SHADING = {i for i, c in enumerate(palette) if c.min() > 150 or is_uniform_red(c.astype(float)[None])[0]}
DARK_INDEX = int(np.argmin(palette.sum(1)))


def shrink(idx: np.ndarray, dx: int, dy: int):
    """Majority color of each SCALE x SCALE block, with the grid shifted by (dx, dy). Also returns how well it fit."""
    shifted = np.full_like(idx, TRANSPARENT)
    shifted[dy:, dx:] = idx[:idx.shape[0] - dy, :idx.shape[1] - dx]
    h, w = shifted.shape
    blocks = np.eye(TRANSPARENT + 1)[shifted].reshape(h // SCALE, SCALE, w // SCALE, SCALE, -1).sum((1, 3))
    # A block that's mostly empty but has a real line through it keeps the line.
    counts = blocks.copy()
    counts[..., TRANSPARENT] *= 0.75
    small = counts.argmax(-1)
    fit = np.take_along_axis(blocks, small[..., None], -1).sum()
    return small, fit


def neighbors4(a: np.ndarray, y: int, x: int):
    h, w = a.shape
    for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
        if 0 <= ny < h and 0 <= nx < w:
            yield ny, nx


def color_groups(a: np.ndarray):
    """Groups of touching pixels of the same color: (color, [(y, x), ...])."""
    seen = np.zeros(a.shape, dtype=bool)
    for y0 in range(a.shape[0]):
        for x0 in range(a.shape[1]):
            if seen[y0, x0]:
                continue
            color, group, queue = a[y0, x0], [], deque([(y0, x0)])
            seen[y0, x0] = True
            while queue:
                y, x = queue.popleft()
                group.append((y, x))
                for ny, nx in neighbors4(a, y, x):
                    if not seen[ny, nx] and a[ny, nx] == color:
                        seen[ny, nx] = True
                        queue.append((ny, nx))
            yield color, group


def despeckle(a: np.ndarray, max_size: int = 2, only=None) -> np.ndarray:
    """
    Specks of up to max_size pixels mostly surrounded by one other color take
    that color. `only` limits it to specks of those colors.
    """
    a = a.copy()
    for color, group in list(color_groups(a)):
        if len(group) > max_size or (only is not None and color not in only):
            continue
        inside = set(group)
        around = [a[n] for p in group for n in neighbors4(a, *p) if n not in inside]
        if not around:
            continue
        values, counts = np.unique(around, return_counts=True)
        if counts.max() / len(around) >= 0.6 and values[counts.argmax()] != color:
            for p in group:
                a[p] = values[counts.argmax()]
    return a


def matching_eyes(a: np.ndarray) -> np.ndarray:
    """
    The eyes are the two dark shapes inside the face. Make them a matched
    pair: the right eye becomes a mirror image of the left one.
    """
    a = a.copy()
    candidates = []
    for color, group in color_groups(a):
        if color != DARK_INDEX or len(group) > 12:
            continue
        inside = set(group)
        around = [a[n] for p in group for n in neighbors4(a, *p) if n not in inside]
        if around and np.mean(np.array(around) == SKIN_INDEX) > 0.6:
            ys, xs = zip(*group)
            candidates.append({'cells': group, 'y': np.mean(ys), 'x': np.mean(xs), 'w': max(xs) - min(xs) + 1})
    # Two shapes side by side at about the same height.
    pairs = [(l, r) for l in candidates for r in candidates
             if l['x'] < r['x'] - 3 and abs(l['y'] - r['y']) <= 1.5 and r['x'] - l['x'] < 16]
    if not pairs:
        return a
    left, right = max(pairs, key=lambda p: len(p[0]['cells']) + len(p[1]['cells']))
    for p in right['cells']:
        a[p] = SKIN_INDEX
    lxs = [x for _, x in left['cells']]
    lys = [y for y, _ in left['cells']]
    # Keep the right eye's position, but use the left eye's shape, flipped.
    shift_x = int(round(right['x'] - left['x']))
    shift_y = int(round(right['y'] - left['y']))
    for y, x in left['cells']:
        mirrored = min(lxs) + max(lxs) - x
        a[y + shift_y, mirrored + shift_x] = DARK_INDEX
    return a


used = np.zeros(len(palette), dtype=int)  # how many pixels use each color
for name, frame in frames.items():
    idx = ((frame[..., None, :3] - palette[None, None]) ** 2).sum(-1).argmin(-1)
    idx[frame[..., 3] <= 128] = TRANSPARENT
    onehot = np.eye(TRANSPARENT + 1)[idx]
    # Each pixel takes the most common color around it: clears noise, keeps shapes.
    idx = box_sum(onehot, 1).argmax(-1)
    # Try every way of laying the grid over the art and keep the one that fits best.
    (small, _), dx, dy = max(
        ((shrink(idx, dx, dy), dx, dy) for dx in range(SCALE) for dy in range(SCALE)),
        key=lambda t: t[0][1],
    )
    small = despeckle(despeckle(small))
    # Bigger blotches of shading (grays on the white, the darker jersey red) left
    # over from the original art's soft shading. Never the dark lines: eyes are small.
    small = despeckle(small, max_size=8, only=SHADING)
    small = matching_eyes(small)
    x, y, hgt, wid = spots[name]
    spots[name] = (x + dx / SCALE, y + dy / SCALE, hgt, wid)
    used += np.bincount(small.ravel(), minlength=TRANSPARENT + 1)[:TRANSPARENT]
    out = np.zeros(small.shape + (4,), dtype=np.uint8)
    solid = small != TRANSPARENT
    out[solid, :3] = palette[small[solid]]
    out[solid, 3] = 255
    Image.fromarray(out, 'RGBA').save(OUT / f'{name}.png', optimize=True)

# ---------- 4. Which colors can be swapped ----------
rgb = palette.astype(float)
fixed = np.zeros(len(palette), dtype=bool)
fixed[-1 - len(BALL_COLORS):] = True  # ball browns and the mouth never change
common = used >= 20                    # ignore colors left on just a few stray pixels
uniform = is_uniform_red(rgb) & ~fixed & common
skin = is_skin(rgb) & ~uniform & ~fixed & common
entries = []
for role, mask in (('uniform', uniform), ('skin', skin)):
    # The most-used color of the group is "normal" (128); others are lighter or darker.
    members = np.nonzero(mask)[0]
    reference = rgb[members[np.argmax(used[members])]].max()
    for i in members:
        entries.append({'rgb': '#%02x%02x%02x' % tuple(palette[i]), 'role': role, 'shade': round(float(rgb[i].max() / reference * 128))})
(OUT / 'palette.json').write_text(json.dumps(entries, indent=2) + '\n')
print('palette:', ['#%02x%02x%02x' % tuple(c) for c in palette])
print('swappable colors:', [(e['role'], e['rgb'], e['shade']) for e in entries])
for name, (x, y, hgt, wid) in spots.items():
    print(f'{name}: {{ x: {x:.1f}, y: {y:.1f}, height: {hgt:.1f}, width: {wid:.1f} }}')
