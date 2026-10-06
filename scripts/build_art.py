"""Build the game's art from the concept pictures in assets/.

Run from the project root (needs Pillow, numpy and opencv-python-headless):
  python3 scripts/build_art.py

The five concept pictures share the same night city, with the ninja, the fireball
and the platforms drawn in different places in each. This script:
  1. cuts the ninja poses, fireball frames and platforms out of the pictures,
  2. builds a clean background by taking each pixel from a picture that has no
     character there, then adds a water reflection below the skyline,
  3. measures where the ninja can stand on each platform,
and writes:
  src/assets/game/*.png   the sprites and background
  src/game/art.ts         sizes, anchor points and walkable surfaces for the code
"""

import os
from collections import deque

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONCEPTS = os.path.join(ROOT, "assets")
OUT_PNG = os.path.join(ROOT, "src", "assets", "game")
OUT_TS = os.path.join(ROOT, "src", "game", "art.ts")

FILES = {
    1: "concept-1-rope-bridge.webp",
    2: "concept-2-floating-platforms.webp",
    3: "concept-3-vine-bridge.webp",
    4: "concept-4-stepping-stones.webp",
    5: "concept-5-stone-path.webp",
    6: "concept-6-burning-vines.webp",
    8: "concept-8-journey-continues.webp",
}
PICS = {n: np.asarray(Image.open(os.path.join(CONCEPTS, f)).convert("RGB")) for n, f in FILES.items()}
ALIGNED = (1, 2, 3, 5)  # these four share exactly the same framing; picture 4 is framed differently


# --- cutting things out -------------------------------------------------------


def largest_piece(fg):
    num, lab, stats, _ = cv2.connectedComponentsWithStats(fg.astype(np.uint8), 8)
    if num <= 1:
        return fg.astype(bool)
    return lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])


def pieces_over(fg, min_area):
    num, lab, stats, _ = cv2.connectedComponentsWithStats(fg.astype(np.uint8), 8)
    keep = np.zeros(fg.shape, bool)
    for i in range(1, num):
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            keep |= lab == i
    return keep


def fill_holes(fg):
    h, w = fg.shape
    inv = (~fg).astype(np.uint8)
    num, lab, stats, _ = cv2.connectedComponentsWithStats(inv, 4)
    out = fg.copy()
    for i in range(1, num):
        x, y, ww, hh, _ = stats[i]
        if x > 0 and y > 0 and x + ww < w and y + hh < h:
            out[lab == i] = True
    return out


def differs_from_others(n, box):
    """Pixels where picture n differs from the other aligned pictures (its own characters)."""
    x0, y0, x1, y1 = box
    others = np.stack([PICS[m][y0:y1, x0:x1].astype(int) for m in ALIGNED if m != n])
    return np.abs(PICS[n][y0:y1, x0:x1].astype(int) - np.median(others, 0)).sum(2)


def grabcut(img, mask, iters=8):
    bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
    cv2.grabCut(cv2.cvtColor(img, cv2.COLOR_RGB2BGR), mask, None, bgd, fgd, iters, cv2.GC_INIT_WITH_MASK)
    return (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)


def character_colors(img, kind):
    r, g, b = [img[..., i].astype(int) for i in range(3)]
    if kind == "fire":
        return (r > 200) & (g > 90) & (b < 140)  # orange and yellow flame
    teal = (g > 110) & (b > 110) & (r < 90)  # scarf, mask, trim
    dark = r + g + b < 70  # outline and outfit
    skin = (r > 200) & (g > 150) & (b > 110) & (r - b > 40)
    return teal | skin | dark


def cut_character(n, box, kind):
    x0, y0, x1, y1 = box
    img = PICS[n][y0:y1, x0:x1].copy()
    h, w = img.shape[:2]
    mask = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    if n in ALIGNED:
        mask[differs_from_others(n, box) > 90] = cv2.GC_PR_FGD
    cy, cx = np.mgrid[0:h, 0:w]
    central = (np.abs(cy - h / 2) < h * 0.35) & (np.abs(cx - w / 2) < w * 0.35)
    mask[character_colors(img, kind) & central] = cv2.GC_FGD
    mask[:3, :] = mask[-3:, :] = cv2.GC_BGD
    mask[:, :3] = mask[:, -3:] = cv2.GC_BGD
    fg = fill_holes(largest_piece(grabcut(img, mask)))
    return np.dstack([img, fg * 255]).astype(np.uint8)


def strip_outside(rgba, is_junk):
    """Remove junk-colored pixels reachable from the outside (enclosed details stay)."""
    a = rgba.copy()
    h, w = a.shape[:2]
    rgb = a[..., :3].astype(int)
    opaque = a[..., 3] > 0
    junk = is_junk(rgb) & opaque
    seen = ~opaque
    q = deque(zip(*np.nonzero(seen)))
    while q:
        y, x = q.popleft()
        for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= yy < h and 0 <= xx < w and not seen[yy, xx] and junk[yy, xx]:
                seen[yy, xx] = True
                a[yy, xx, 3] = 0
                q.append((yy, xx))
    a[..., 3] = np.where(largest_piece(a[..., 3] > 0), a[..., 3], 0)
    return a


def city_blue(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    bluish = (b > r + 25) & (b > g + 20) & (r + g + b > 110)  # city blues and purples, not the dark outfit
    lit = (r > 150) & (g > 120) & (b < 120) & (r + g + b > 450)  # stray warm window lights
    return bluish | lit


def not_flame(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return ~((r > 150) & (r > b + 40)) & ((b > r - 10) | (rgb.sum(-1) < 200))


def crop(rgba):
    ys, xs = np.nonzero(rgba[..., 3])
    return rgba[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


def drop_bridge_post(rgba):
    """The running pose has a rope-bridge post behind its feet."""
    a = rgba.copy()
    h, w = a.shape[:2]
    r, g, b = [a[..., i].astype(int) for i in range(3)]
    ys, xs = np.mgrid[0:h, 0:w]
    brown = (r > g) & (g > b) & (r - b > 25) & (r < 200)
    a[..., 3] = np.where(brown & (ys > h * 0.55) & (xs > w * 0.62), 0, a[..., 3])
    a[..., 3] = np.where((ys > h * 0.80) & (xs > w * 0.70) & (xs < w * 0.98), 0, a[..., 3])
    return a


CHARACTERS = {
    # name: (picture, box)
    "ninja-run": (1, (320, 370, 570, 590)),
    "ninja-ready": (2, (380, 260, 640, 480)),
    "ninja-leap": (3, (600, 300, 900, 530)),
    "ninja-rise": (4, (900, 80, 1130, 280)),
    "ninja-fall": (5, (570, 280, 770, 500)),
    "fireball-1": (1, (530, 320, 660, 470)),
    "fireball-2": (2, (330, 180, 450, 310)),
    "fireball-3": (4, (760, 190, 880, 300)),
    "fireball-4": (5, (480, 260, 595, 400)),
}


def build_characters():
    out = {}
    for name, (n, box) in CHARACTERS.items():
        kind = "fire" if name.startswith("fireball") else "ninja"
        a = cut_character(n, box, kind)
        if name == "ninja-run":
            a = drop_bridge_post(a)
        a = crop(strip_outside(a, not_flame if kind == "fire" else city_blue))
        out[name] = a
    return out


def cut_platform(n, box, seeds=(), bg_boxes=(), diff_seed=True):
    x0, y0, x1, y1 = box
    img = PICS[n][y0:y1, x0:x1].copy()
    h, w = img.shape[:2]
    mask = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    if diff_seed and n in ALIGNED:
        mask[differs_from_others(n, box) > 90] = cv2.GC_PR_FGD
    for sx0, sy0, sx1, sy1 in seeds:
        mask[sy0:sy1, sx0:sx1] = cv2.GC_FGD
    for bx0, by0, bx1, by1 in bg_boxes:
        mask[by0:by1, bx0:bx1] = cv2.GC_BGD
    mask[:2, :] = cv2.GC_BGD
    if diff_seed:
        mask[:, :2] = mask[:, -2:] = cv2.GC_BGD
    fg = grabcut(img, mask)
    return img, fg


def finish_platform(img, fg, min_area=80):
    a = np.dstack([img, pieces_over(fg, 0.02 * fg.sum()) * 255]).astype(np.uint8)
    a = strip_outside(crop(a), city_blue)
    return crop(np.dstack([a[..., :3], pieces_over(a[..., 3] > 0, min_area) * 255]).astype(np.uint8))


# The bridge frame inside the vine bridge picture: a top rail you walk on, a lower rail,
# and crossbars between them (rows and spacing in image pixels)
BEAM_TOP, BEAM_BOTTOM = 60, 84
LOWER_TOP, LOWER_BOTTOM = 118, 136
CROSSBAR_EVERY = 78


def burnt(rgba):
    """The beam bridge after the vines burn: the original end posts, and the charred bridge
    frame drawn in pixel art where the vines used to cover it."""
    a = rgba.copy()
    h, w = a.shape[:2]
    r, g, b = [a[..., i].astype(int) for i in range(3)]
    green = (g > r + 8) & (g >= b - 12)
    keep = np.zeros((h, w), bool)
    keep[:, :45] = keep[:, -45:] = True  # end posts
    a[..., 3] = np.where(keep & (a[..., 3] > 0) & ~green, a[..., 3], 0)
    a[..., 3] = np.where(pieces_over(a[..., 3] > 0, 120), a[..., 3], 0)
    a[..., :3] = (a[..., :3].astype(float) * np.array([0.6, 0.52, 0.5])).astype(np.uint8)

    rng = np.random.default_rng(6)  # same bridge every time

    def wood(y0, y1, x0, x1):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if y in (y0, y1) or x in (x0, x1):
                    color = (18, 12, 10)  # outline
                elif y < y0 + 4:
                    color = (78, 56, 42)  # lit top edge
                else:
                    color = (52, 38, 30)
                    if rng.random() < 0.12:
                        color = (36, 26, 21)  # grain
                    if rng.random() < 0.012:
                        color = (255, 140, 40) if rng.random() < 0.7 else (255, 210, 90)  # embers
                a[y, x] = (*color, 255)

    for x in range(45 + CROSSBAR_EVERY // 2, w - 45, CROSSBAR_EVERY):
        wood(BEAM_BOTTOM, LOWER_TOP, x - 5, x + 5)
    wood(LOWER_TOP, LOWER_BOTTOM, 20, w - 21)
    wood(BEAM_TOP, BEAM_BOTTOM, 20, w - 21)
    # Same size as the unburnt bridge so they line up exactly
    return a


def overgrow(rgba):
    """Pile more of the picture's own vines onto the bridge, so it is properly overgrown:
    shifted copies of the vine layer, over the beam and hanging lower below it."""
    a = rgba.copy()
    r, g, b = [rgba[..., i].astype(int) for i in range(3)]
    vine = (rgba[..., 3] > 0) & (g > r + 8) & (g >= b - 12)
    # Shifts (right, down) in pixels; copies wrap around sideways along the bridge
    for dx, dy in [(-90, -4), (75, 6), (140, -8), (-150, 30), (110, 55), (-60, 70)]:
        layer = np.roll(np.roll(vine, dx, axis=1), dy, axis=0)
        colors = np.roll(np.roll(rgba, dx, axis=1), dy, axis=0)
        if dy > 0:
            layer[:dy] = False
        else:
            layer[dy:] = False
        a[layer] = colors[layer]
    # Keep the end posts readable
    a[:, :18] = rgba[:, :18]
    a[:, -18:] = rgba[:, -18:]
    return a


def build_platforms():
    out = {}
    simple = {
        "stone-big": (2, (570, 500, 910, 670), (40, 20, 300, 60)),
        "stone-wide": (2, (945, 410, 1295, 565), (40, 20, 300, 55)),
        "plank": (1, (1040, 395, 1175, 452), (15, 12, 115, 40)),
        "step-block": (4, (670, 500, 760, 580), (15, 15, 70, 45)),
        "vine-bridge": (3, (415, 480, 1530, 885), None),
        "roof-right": (2, (1405, 170, 1774, 887), (80, 420, 360, 860)),
    }
    for name, (n, box, seed) in simple.items():
        img, fg = cut_platform(n, box, seeds=[seed] if seed else [])
        out[name] = finish_platform(img, fg)

    # Swing: plank on chains with a lantern hanging underneath
    img, fg = cut_platform(4, (695, 555, 895, 845), seeds=[(20, 120, 180, 170), (80, 190, 110, 280)])
    out["swing"] = finish_platform(img, fg, min_area=40)

    # Start rooftop, taken from picture 3 where no ninja stands on it
    img, fg = cut_platform(
        3, (0, 0, 450, 887), seeds=[(0, 600, 430, 880), (0, 80, 250, 560), (150, 20, 215, 90)],
        bg_boxes=[(300, 0, 450, 430)], diff_seed=False,
    )
    out["roof-left"] = finish_platform(img, largest_piece(fg))

    # Vine-covered beam bridge (picture 6). Ember's fire is painted over its middle, so for the
    # unburnt bridge that part is covered with vines copied from the right half of the same bridge
    # (same rows, so the beam lines up). The burnt bridge is the same picture with the vines removed.
    vines = PICS[6][480:840, 690:1372].copy()
    vines[0:300, 80:330] = vines[0:300, 400:650]
    # Sparks from the painted fire float above the vines: drop bright pinks and whites up there
    vr, vg, vb = [vines[..., i].astype(int) for i in range(3)]
    sparks = ((vr > 170) & (vb > 140)) | (vr + vg + vb > 600)
    sparks[60:, :] = False
    mask = np.full(vines.shape[:2], cv2.GC_PR_BGD, np.uint8)
    mask[40:165, 10:670] = cv2.GC_FGD  # vines and beam
    mask[:8, :] = cv2.GC_BGD
    fg = grabcut(vines, mask) & ~sparks
    out["vine-beam"] = overgrow(finish_platform(vines, fg))
    out["vine-beam-burnt"] = burnt(out["vine-beam"])

    # Shrine rooftop on the right of picture 6, with its glowing lantern and water tower
    img, fg = cut_platform(
        6, (1345, 140, 1774, 887),
        seeds=[(40, 395, 425, 740), (190, 170, 370, 400), (260, 20, 360, 180)],
        diff_seed=False,
    )
    out["roof-shrine"] = finish_platform(img, largest_piece(fg))

    # Rope bridge: rope and planks are warm browns; everything blue behind them is city
    img = PICS[1][470:720, 665:1625].copy()
    r, g, b = [img[..., i].astype(int) for i in range(3)]
    wood = ((r > b + 15) & (g >= b - 8) & (r + g + b < 480) & (r + g + b > 60)) | ((r + g + b < 70) & (r >= b - 5))
    out["rope-bridge"] = crop(np.dstack([img, largest_piece(wood) * 255]).astype(np.uint8))
    return out


# --- the ending: the highest rooftop and its giant lantern ----------------------

# Picture 8, the ending: the lantern rooftop (left part), as boxes in picture pixels
LANTERN_BOX = (110, 20, 930, 770)
LANTERN_INSIDE = (100, 150, 350, 420)  # the lantern's glowing middle, in cut-out pixels
LANTERN_DECK = 589  # cut-out row of the rooftop's walkway (where the ninja stands in the picture)
LANTERN_BASE = 425  # cut-out row of the raised stone base the lantern stands on
ROOF_EXTRA = 240  # rows of roof tiles added at the bottom so the building reaches down out of view


def build_lantern_roof():
    """The highest rooftop with the giant lantern, flipped so the ninja arrives from the left.

    Ember (inside the lantern) and its trail are covered by mirroring the lantern's left half,
    the ninja and the speech bubbles are cut away with the sky, and a dormant copy is made
    with the lantern dark, for before Ember lights it."""
    pic = PICS[8].copy()
    for x in range(334, 565):
        pic[150:458, x] = pic[150:458, 668 - x]
    pic = cv2.inpaint(pic, _rect_mask(pic.shape, (310, 350, 358, 368)), 3, cv2.INPAINT_TELEA)  # mirrored smile
    X0, Y0, X1, Y1 = LANTERN_BOX
    img = pic[Y0:Y1, X0:X1].copy()
    h, w = img.shape[:2]
    mask = np.full((h, w), cv2.GC_PR_BGD, np.uint8)

    def box(m, x0, y0, x1, y1, v):  # picture coordinates
        m[y0 - Y0 : y1 - Y0, x0 - X0 : x1 - X0] = v

    box(mask, 210, 40, 450, 440, cv2.GC_FGD)  # lantern
    box(mask, 170, 440, 515, 600, cv2.GC_FGD)  # its stone base
    box(mask, 110, 610, 930, 770, cv2.GC_FGD)  # the rooftop
    box(mask, 600, 20, 930, 500, cv2.GC_BGD)  # sky
    box(mask, 545, 20, 930, 270, cv2.GC_BGD)  # sky and Ember's speech bubble
    box(mask, 552, 380, 728, 598, cv2.GC_BGD)  # where the ninja stands
    box(mask, 110, 20, 135, 200, cv2.GC_BGD)
    fg = largest_piece(grabcut(img, mask))
    a = np.dstack([img, fg * 255]).astype(np.uint8)
    box(a[..., 3], 805, 470, 930, 572, 0)  # a pagoda in the distance

    def sky_or_city(rgb):
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        return (b > r + 30) & (b > g + 30) & (rgb.sum(-1) > 60)

    a = strip_outside(a, sky_or_city)
    alpha = a[..., 3]
    # Bits of the city still showing between the lanterns and the stone base
    for y0, y1, x0, x1 in ((530, 573, 683, w), (573, 593, 690, w), (0, h, 700, w), (440, 483, 0, 25),
                           (385, 426, 62, 96), (380, 428, 350, 383), (436, 460, 360, 372)):
        alpha[y0:y1, x0:x1] = 0
    # Roof tiles continue down out of view
    tiles = a[-80:-20]
    a = np.vstack([a] + [tiles] * (ROOF_EXTRA // len(tiles)))

    dormant = a.copy()
    x0, y0, x1, y1 = LANTERN_INSIDE
    inside = dormant[y0:y1, x0:x1, :3].astype(float)
    lum = inside.mean(2, keepdims=True)
    glowing = (inside[..., :1] > 150) & (inside[..., :1] > inside[..., 2:3] + 40)
    unlit = lum * np.array([0.22, 0.22, 0.32]) + np.array([14, 14, 26])  # dark glass and cold stone
    dormant[y0:y1, x0:x1, :3] = np.where(glowing, unlit, inside * 0.55).clip(0, 255).astype(np.uint8)
    flip = lambda im: crop(im[:, ::-1].copy())
    return {"lantern-roof": flip(a), "lantern-roof-dormant": flip(dormant)}


def _rect_mask(shape, rect):
    x0, y0, x1, y1 = rect
    m = np.zeros(shape[:2], np.uint8)
    m[y0:y1, x0:x1] = 255
    return m


def build_dawn(night):
    """The same city at sunrise: the sky warms from violet to orange toward the skyline,
    the clouds catch the light, the moon becomes a rising sun and the windows glow brighter.
    Colors are stepped so it stays pixel art."""
    img = night.astype(float)
    h, w = img.shape[:2]
    lum = img.mean(2, keepdims=True)
    stops = [(0, (70, 45, 130)), (120, (180, 80, 130)), (230, (255, 140, 70)), (330, (255, 170, 90)), (h, (90, 60, 90))]
    ys = np.arange(h)
    grad = np.stack([np.interp(ys, [y for y, _ in stops], [c[i] for _, c in stops]) for i in range(3)], 1)[:, None, :]
    strength = np.interp(ys, [0, 300, 470, h], [0.85, 0.7, 0.35, 0.45])[:, None, None]
    warm = grad * (0.35 + lum / 255 * 1.7)
    out = img * (1 - strength) + warm * strength
    # The moon becomes the sun, with a stepped glow around it
    cy, cx = np.mgrid[0:h, 0:w]
    d = np.hypot(cx - 1035, cy - 105)
    disc = (d < 82) & (night.sum(2) > 450)
    out[disc] = np.array([255, 224, 120])
    ring = np.floor(np.clip(1 - (d - 80) / 150, 0, 1) * 3) / 3
    out += ring[..., None] * np.array([60, 35, 0]) * (~disc)[..., None]
    # Windows and lanterns glow brighter
    r, g, b = night[..., 0].astype(int), night[..., 1].astype(int), night[..., 2].astype(int)
    lit = (r > 150) & (g > 90) & (b < 140) & ~disc
    out[lit] = np.minimum(255, img[lit] * 1.25 + 20)
    out = np.floor(out.clip(0, 255) / 6) * 6  # fewer, stepped colors
    return out.astype(np.uint8)


# --- background ---------------------------------------------------------------

CHARACTER_BOXES = {
    1: [(320, 370, 570, 600), (530, 320, 660, 470), (1040, 395, 1175, 452), (1310, 478, 1440, 535)],
    2: [(380, 260, 640, 480), (330, 180, 450, 310)],
    3: [(600, 300, 900, 530), (505, 280, 625, 410)],
    5: [(570, 280, 770, 500), (480, 260, 595, 400)],
}


def build_background():
    stack = np.stack([PICS[n].astype(np.int16) for n in ALIGNED])
    h, w = stack.shape[1:3]
    dirty = np.zeros(stack.shape[:3], bool)
    for i, n in enumerate(ALIGNED):
        others = np.median(np.delete(stack, i, 0), 0)
        changed = np.abs(stack[i] - others).sum(2) > 70
        box = np.zeros((h, w), bool)
        for x0, y0, x1, y1 in CHARACTER_BOXES[n]:
            box[y0:y1, x0:x1] = True
        dirty[i] = cv2.dilate((changed & box).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    # Per pixel, among pictures with no character there, use the most typical one
    clean = np.where(dirty[..., None], np.nan, stack.astype(float))
    with np.errstate(all="ignore"):
        typical = np.nan_to_num(np.nanmedian(clean, 0))
    dist = np.abs(stack - typical).sum(3).astype(np.int64)
    dist[dirty] = 10**6
    pick = dist.argmin(0)
    full = np.take_along_axis(stack, pick[None, :, :, None].repeat(3, 3), 0)[0].astype(np.uint8)
    nowhere = dirty.all(0)
    if nowhere.any():
        full = cv2.inpaint(full, (nowhere * 255).astype(np.uint8), 3, cv2.INPAINT_TELEA)

    # Sky, moon, mountains and skyline, without the rooftops at the sides
    top = full[0:470, 285:1595].copy()
    top[290:445, 220:370] = top[290:445, 380:530]  # cover a smudge with the skyline next to it
    # Water below: the lower city reflected, darker and bluer, with pixel ripples
    src = top[-230:][::-1].astype(float)
    water = np.zeros_like(src)
    for y in range(src.shape[0]):
        shift = int(round(2 * np.sin(y * 0.9))) * (1 if y % 3 else 0)
        fade = 0.55 * (1 - y / src.shape[0]) + 0.12
        water[y] = np.roll(src[y], shift, axis=0) * fade + np.array([8, 14, 40]) * (1 - fade)
    return np.vstack([top, water.clip(0, 255).astype(np.uint8)])


# --- where the ninja can stand -------------------------------------------------

COLUMN = 10  # surface heights are measured every 10 pixels


def top_opaque(alpha, x):
    ys = np.nonzero(alpha[:, x])[0]
    return ys[0] if len(ys) else None


def flat_deck(alpha, deck_row):
    """Walkable everywhere along a flat deck at deck_row (rooftops, stone, planks)."""
    h, w = alpha.shape
    return [int(h - deck_row) if alpha[:, c : c + COLUMN].any() else None for c in range(0, w, COLUMN)]


def ledge_row(alpha):
    """Rooftops: the ledge is where the building first spans its full width and stays solid below."""
    h, w = alpha.shape
    rows = alpha.sum(1)
    full = rows >= 0.995 * w
    for y in range(h // 3, h - 10):
        solid_below = (rows[y:] >= 0.85 * w).mean() > 0.95  # not a thin railing
        if full[y : y + 10].all() and solid_below:
            return y
    raise ValueError("could not find the rooftop ledge")


def surfaces(name, a):
    alpha = a[..., 3] > 0
    h, w = alpha.shape
    if name == "vine-beam-burnt":
        return flat_deck(alpha, BEAM_TOP)  # the top of the charred beam
    if name == "vine-beam":
        return [None for _ in range(0, w, COLUMN)]  # nothing to stand on while it is overgrown
    if name.startswith("lantern-roof"):
        # The walkway, and the lantern's raised stone base (standing up from the walkway like a wall)
        base_from = w - 445  # the flipped cut-out: the base starts here
        return [int(h - (LANTERN_BASE if c >= base_from else LANTERN_DECK)) for c in range(0, w, COLUMN)]
    if name in ("roof-left", "roof-right", "roof-shrine"):
        return flat_deck(alpha, ledge_row(alpha))
    if name == "swing":
        rows = alpha.sum(1)
        deck = int(np.argmax(rows > 0.6 * w))  # first row as wide as the plank
        span = np.nonzero(alpha[deck])[0]
        return [int(h - deck) if span[0] <= c + COLUMN // 2 <= span[-1] else None for c in range(0, w, COLUMN)]
    if name == "rope-bridge":
        # Plank tops: the first spot below the handrail (top ~85 pixels) that is solid
        # 10 pixels down and wide across (so posts and rope knots don't count)
        out = []
        for c in range(0, w, COLUMN):
            x = min(c + COLUMN // 2, w - 1)
            top = None
            for y in range(85, h - 10):
                near = alpha[y + 3, max(0, x - 8) : x + 9].sum()
                deeper = alpha[y + 8, max(0, x - 8) : x + 9].sum()
                if alpha[y : y + 10, x].all() and near >= 14 and deeper >= 14:
                    top = y
                    break
            out.append(int(h - top) if top is not None else None)
        return out
    if name == "vine-bridge":
        tops = []
        for c in range(0, w, COLUMN):
            top = top_opaque(alpha, min(c + COLUMN // 2, w - 1))
            tops.append(h - top if top is not None and c < w - 70 else None)  # not the lantern post
        # Leaves make it bumpy: smooth it into a curve you can run along
        heights = np.array([t if t is not None else np.nan for t in tops], float)
        smooth = heights.copy()
        for i in range(len(heights)):
            window = heights[max(0, i - 4) : i + 5]
            if not np.isnan(heights[i]):
                smooth[i] = np.nanmedian(window)
        for _ in range(len(smooth)):  # no step steeper than 25 pixels between columns
            for i in range(1, len(smooth)):
                if not np.isnan(smooth[i]) and not np.isnan(smooth[i - 1]):
                    smooth[i] = np.clip(smooth[i], smooth[i - 1] - 25, smooth[i - 1] + 25)
        return [None if np.isnan(v) else int(v) for v in smooth]
    return flat_deck(alpha, int(top_opaque(alpha, w // 2)) + 2)


# --- output ---------------------------------------------------------------------


def body_center(name, a):
    """Horizontal anchor: middle of the body, ignoring the trailing scarf."""
    alpha = a[..., 3] > 0
    if not name.startswith("ninja"):
        return a.shape[1] / 2
    rgb = a[..., :3].astype(int)
    outfit = alpha & (rgb.sum(2) < 150)
    xs = np.nonzero(outfit)[1]
    return float(np.median(xs))


def camel(name):
    head, *rest = name.split("-")
    return head + "".join(p.title() for p in rest)


def main():
    os.makedirs(OUT_PNG, exist_ok=True)
    sprites = {**build_characters(), **build_platforms(), **build_lantern_roof()}
    night = build_background()
    Image.fromarray(night).save(os.path.join(OUT_PNG, "background.png"))
    Image.fromarray(build_dawn(night)).save(os.path.join(OUT_PNG, "background-dawn.png"))
    for name, a in sprites.items():
        Image.fromarray(a, "RGBA").save(os.path.join(OUT_PNG, f"{name}.png"))

    lines = [
        "// Generated by scripts/build_art.py. Do not edit by hand.",
        "// Sizes are in image pixels; surfaces are walkable heights (from the sprite's bottom)",
        f"// every {COLUMN} pixels across, or null where there is nothing to stand on.",
        "import background from '../assets/game/background.png';",
        "import backgroundDawn from '../assets/game/background-dawn.png';",
    ]
    for name in sprites:
        lines.append(f"import {camel(name)} from '../assets/game/{name}.png';")
    bg = Image.open(os.path.join(OUT_PNG, "background.png"))
    lines += [
        "",
        f"export const SURFACE_COLUMN = {COLUMN};",
        "",
        f"export const backgroundArt = {{ height: {bg.height}, src: background, width: {bg.width} }};",
        f"export const backgroundDawnArt = {{ height: {bg.height}, src: backgroundDawn, width: {bg.width} }};",
        "",
        "export const art = {",
    ]
    for name, a in sprites.items():
        h, w = a.shape[:2]
        entry = f"  {camel(name)}: {{ height: {h}, originX: {body_center(name, a):.1f}, src: {camel(name)}, width: {w}"
        if not name.startswith(("ninja", "fireball")):
            entry += f", surfaces: {[s if s is not None else 'null' for s in surfaces(name, a)]}".replace("'", "")
        lines.append(entry + " },")
    lines.append("};")
    with open(OUT_TS, "w") as f:
        f.write("\n".join(lines) + "\n")
    print("wrote", OUT_PNG, "and", OUT_TS)


if __name__ == "__main__":
    main()
