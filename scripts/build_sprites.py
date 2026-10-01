"""Draw every animated character frame in one pixel-art style.

Run from the project root:
  python3 scripts/build_sprites.py

Spider-Man starts from the side-view art (src/components/sprites/spidermanSideArt.ts,
generated from src/assets/sprites/spiderman-normal.png). For each pose his front arm
and legs are removed and redrawn at new joint positions in the same palette, with the
same black outline and dark/mid/light shading, so every frame matches that art.
Venom is drawn from shapes in the same style.

Outputs:
  src/components/sprites/generated/spidermanFrames.ts
  src/components/sprites/generated/venomFrames.ts
"""

import math
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(ROOT, "src", "components", "sprites")
OUT = os.path.join(SPRITES, "generated")

OUTLINE = "a"


def load_art(name):
    src = open(os.path.join(SPRITES, name + ".ts")).read()
    colors = dict(re.findall(r"(\w): '(#[0-9a-fA-F]{6})'", src))
    rows = re.findall(r"^\s+'([.A-Za-z]+)',?$", src, re.M)
    return colors, rows


# --- drawing primitives ------------------------------------------------------


def shade(s, keys):
    """Pick dark/mid/light by which side of the shape faces the light (up-left)."""
    dark, mid, light = keys
    if s > 0.35:
        return light
    if s > -0.35:
        return mid
    return dark


def capsule(points, radius, keys):
    """A limb: thick shaded line through the joint points, rounded at the joints."""
    cells = {}
    light = (-0.7071, -0.7071)  # (row, col) direction toward the light
    rmin = int(min(p[0] for p in points) - radius - 1)
    rmax = int(max(p[0] for p in points) + radius + 1)
    cmin = int(min(p[1] for p in points) - radius - 1)
    cmax = int(max(p[1] for p in points) + radius + 1)
    for r in range(rmin, rmax + 1):
        for c in range(cmin, cmax + 1):
            best = None
            for (r0, c0), (r1, c1) in zip(points, points[1:]):
                vr, vc = r1 - r0, c1 - c0
                length2 = vr * vr + vc * vc or 1e-9
                t = max(0.0, min(1.0, ((r - r0) * vr + (c - c0) * vc) / length2))
                pr, pc = r0 + t * vr, c0 + t * vc
                d = math.hypot(r - pr, c - pc)
                if best is None or d < best[0]:
                    best = (d, r - pr, c - pc)
            d, dr, dc = best
            if d <= radius:
                s = (dr * light[0] + dc * light[1]) / radius
                cells[(r, c)] = shade(s, keys)
    return cells


def ellipse(center, rr, rc, keys):
    cells = {}
    cr, cc = center
    for r in range(int(cr - rr - 1), int(cr + rr + 2)):
        for c in range(int(cc - rc - 1), int(cc + rc + 2)):
            nr, nc = (r - cr) / rr, (c - cc) / rc
            if nr * nr + nc * nc <= 1:
                cells[(r, c)] = shade(-(nr + nc) * 0.7071, keys)
    return cells


def grid_cells(rows, r0, c0):
    return {(r0 + r, c0 + c): ch for r, row in enumerate(rows) for c, ch in enumerate(row) if ch != "."}


def shifted(cells, dr, dc):
    return {(r + dr, c + dc): ch for (r, c), ch in cells.items()}


def compose(layers):
    """Paint layers back to front. Each (cells, outline) layer gets its own black outline."""
    out = {}
    for cells, outline in layers:
        if outline:
            for (r, c) in cells:
                for n in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                    if n not in cells:
                        out[n] = OUTLINE
        out.update(cells)
    return out


def close_outline(cells):
    """Outline any colored edge left open after cutting parts away."""
    out = dict(cells)
    for (r, c), ch in cells.items():
        if ch == OUTLINE:
            continue
        for n in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if n not in cells:
                out[n] = OUTLINE
    return out


def to_rows(cells, height, width):
    rows = []
    for r in range(height):
        rows.append("".join(cells.get((r, c), ".") for c in range(width)))
    return rows


# --- Spider-Man ---------------------------------------------------------------

SPIDEY_COLORS, SPIDEY_ART = load_art("spidermanSideArt")
RED = ("b", "c", "d")
BLUE = ("j", "h", "i")

# Canvas: the art (21 x 45) plus room for arms and legs to reach out. Same for every frame,
# so the body never jumps between frames. Row 44 of the art (the feet) stays the bottom row.
PAD_L, PAD_R, PAD_T = 14, 5, 2
S_W = len(SPIDEY_ART[0]) + PAD_L + PAD_R
S_H = len(SPIDEY_ART) + PAD_T
S_ORIGIN = PAD_L + len(SPIDEY_ART[0]) / 2  # body center, in pixels from the left

ART = grid_cells(SPIDEY_ART, 0, 0)


def spidey_core(cut_arm, shift=0):
    """The art with its legs (and optionally the front arm) cut away."""
    core = {}
    for (r, c), ch in ART.items():
        if r >= 35:
            continue  # legs
        if cut_arm and ((19 <= r <= 31 and c <= 7) or (r == 32 and c <= 5)):
            continue  # front arm
        core[(r, c)] = ch
    return shifted(close_outline(core), shift, 0)


def leg(hip, knee, foot):
    limb = capsule([hip, knee, foot], 2.0, RED)
    toe = capsule([foot, (foot[0], foot[1] - 2.5)], 1.6, RED)  # foot points forward (left)
    return {**limb, **toe}


def arm(shoulder, elbow, hand, fist=2.2, thwip=False):
    sleeve = capsule([shoulder, elbow, hand], 1.8, BLUE)
    glove = capsule([hand, hand], fist, RED)
    if thwip:  # web-shooting hand: index and pinky out
        glove.update(capsule([hand, (hand[0] - 2.5, hand[1] - 2)], 0.8, RED))
        glove.update(capsule([hand, (hand[0] + 1.5, hand[1] - 2.5)], 0.8, RED))
    return {**sleeve, **glove}


STANCE = dict(front=((33, 8), (38, 4), (42.5, 1.5)), back=((33, 15), (38, 17), (42.5, 19)))


def spidey_pose(arm_joints=None, front=None, back=None, shift=0, thwip=False):
    front = front or STANCE["front"]
    back = back or STANCE["back"]
    layers = [(leg(*back), True), (spidey_core(arm_joints is not None, shift), False), (leg(*front), True)]
    if arm_joints:
        layers.append((arm(*arm_joints, thwip=thwip), True))
    return compose(layers)


def spidey_frames():
    frames = {}
    frames["idle"] = dict(ART)  # the art exactly as drawn
    walk = [
        (((33, 8), (38, 5), (42.5, 2.5)), ((33, 15), (38, 17), (42.5, 19))),
        (((33, 8), (38, 8), (42.5, 7.5)), ((33, 15), (37.5, 14), (41, 13))),
        (((33, 8), (38, 10), (42.5, 12)), ((33, 15), (38, 12), (42.5, 10))),
        (((33, 8), (37.5, 7), (41, 6)), ((33, 15), (38, 15), (42.5, 15))),
    ]
    for i, (front, back) in enumerate(walk):
        frames[f"walk{i}"] = spidey_pose(front=front, back=back)
    frames["punch"] = spidey_pose(arm_joints=((20, 6), (21, 0), (21, -6)))
    frames["highKick"] = spidey_pose(
        arm_joints=((20, 6), (25, 6), (23, 2)),
        front=((33, 8), (29, 2), (26, -5)),
        back=((33, 15), (38, 15), (42.5, 14)),
    )
    frames["slideKick"] = spidey_pose(
        arm_joints=((28, 6), (33, 2), (38.5, -1)),
        front=((41, 8), (42.5, 2), (42.5, -6)),
        back=((41, 15), (39.5, 19), (42.5, 20)),
        shift=8,
    )
    frames["webShoot"] = spidey_pose(arm_joints=((20, 6), (17, 1), (14, -4)), thwip=True)
    frames["jump"] = spidey_pose(
        arm_joints=((20, 6), (14, 4), (9, 2)),
        front=((33, 8), (30, 3), (36, 0)),
        back=((33, 15), (36, 19), (41, 16)),
    )
    frames["fight"] = spidey_pose(
        arm_joints=((20, 6), (26, 3), (21, 0)),
        front=((33, 8), (38, 5), (42.5, 3)),
        back=((33, 15), (38, 16), (42.5, 18)),
    )
    return {name: to_rows(shifted(cells, PAD_T, PAD_L), S_H, S_W) for name, cells in frames.items()}


# --- Venom -------------------------------------------------------------------

VENOM_COLORS = {
    "a": "#000000",  # outline
    "b": "#0e0e16",  # dark
    "c": "#22223a",  # mid
    "d": "#40405e",  # light
    "e": "#b4b4c4",  # claws
    "k": "#ffffff",  # eyes, teeth, emblem
    "p": "#e0457b",  # tongue
    "q": "#8e2250",  # tongue shadow
}
SUIT = ("b", "c", "d")
V_PAD_L = 10
V_W, V_H = 52 + V_PAD_L, 62
V_ORIGIN = V_PAD_L + 22

VENOM_EYE = [
    "kk.........",
    "kkkk.......",
    "kkkkkkk....",
    ".kkkkkkkkk.",
    "..kkkkkkkkk",
    "....kkkkkk.",
]


def venom_head(dr=0, dc=0):
    head = ellipse((13 + dr, 19 + dc), 11, 12, SUIT)
    head.update(grid_cells(VENOM_EYE, 5 + dr, 7 + dc))
    # Huge grin that curves up toward the back of the head, with fangs top and bottom
    for c in range(7, 28):
        lift = max(0, (c - 20) // 2)  # grin rises at the back
        top, bottom = 15 - lift, 21 - lift
        for r in range(top, bottom + 1):
            head[(r + dr, c + dc)] = OUTLINE
        fang = c % 3 != 2
        head[(top + dr, c + dc)] = "k"
        if fang:
            head[(top + 1 + dr, c + dc)] = "k"
        head[(bottom + dr, c + dc)] = "k"
        if not fang:
            head[(bottom - 1 + dr, c + dc)] = "k"
    return head


def venom_tongue(dr=0, dc=0):
    return capsule([(18 + dr, 9 + dc), (22 + dr, 4 + dc), (27 + dr, 6 + dc), (31 + dr, 2 + dc)], 1.3, ("q", "p", "p"))


def venom_torso(dr=0, dc=0):
    torso = ellipse((35 + dr, 22 + dc), 12, 13, SUIT)
    # White spider emblem: fat body, legs curving up over the shoulders and down the sides
    white = ("k", "k", "k")
    emblem = ellipse((32 + dr, 21 + dc), 3.2, 2.4, white)
    legs = [
        [(31, 20), (26, 15), (25, 11)],
        [(31, 22), (26, 27), (25, 32)],
        [(33, 20), (37, 14), (42, 12)],
        [(33, 22), (37, 28), (42, 31)],
    ]
    for points in legs:
        emblem.update(capsule([(r + dr, c + dc) for r, c in points], 1.0, white))
    torso.update(emblem)
    return torso


def venom_arm(shoulder, elbow, hand):
    limb = capsule([shoulder, elbow, hand], 3.0, SUIT)
    # Three claws pointing on from the hand
    vr, vc = hand[0] - elbow[0], hand[1] - elbow[1]
    length = math.hypot(vr, vc) or 1
    ur, uc = vr / length, vc / length
    for spread in (-1.6, 0, 1.6):
        tip = (hand[0] + ur * 4.5 - uc * spread, hand[1] + uc * 4.5 + ur * spread)
        limb.update(capsule([hand, tip], 0.7, ("e", "e", "k")))
    return limb


def venom_leg(hip, knee, foot):
    limb = capsule([hip, knee, foot], 3.4, SUIT)
    limb.update(capsule([foot, (foot[0], foot[1] - 3.5)], 2.6, SUIT))
    return limb


def venom_pose(front_arm, back_arm, front_leg, back_leg, body=(0, 0), tongue=True):
    dr, dc = body
    layers = [
        (venom_arm(*back_arm), True),
        (venom_leg(*back_leg), True),
        (venom_torso(dr, dc), True),
        (venom_leg(*front_leg), True),
        (venom_head(dr, dc), True),
    ]
    if tongue:
        layers.append((venom_tongue(dr, dc), True))
    layers.append((venom_arm(*front_arm), True))
    return compose(layers)


V_FRONT_ARM = ((28, 14), (36, 9), (42, 11))
V_BACK_ARM = ((28, 31), (36, 35), (42, 32))
V_FRONT_LEG = ((44, 17), (51, 14), (57.5, 15))
V_BACK_LEG = ((44, 28), (51, 31), (57.5, 29))


def venom_frames():
    frames = {
        "idle0": venom_pose(V_FRONT_ARM, V_BACK_ARM, V_FRONT_LEG, V_BACK_LEG),
        # Breathing: shoulders, head and arms rise a pixel
        "idle1": venom_pose(
            ((27, 14), (35, 9), (41, 11)), ((27, 31), (35, 35), (41, 32)), V_FRONT_LEG, V_BACK_LEG, body=(-1, 0)
        ),
    }
    walk = [
        (((44, 17), (50, 11), (57.5, 9)), ((44, 28), (51, 32), (57.5, 34)), ((28, 14), (35, 13), (41, 16))),
        (((44, 17), (51, 16), (57.5, 17)), ((44, 28), (50, 28), (55, 26)), ((28, 14), (36, 10), (42, 12))),
        (((44, 17), (51, 20), (57.5, 23)), ((44, 28), (50, 24), (57.5, 21)), ((28, 14), (36, 7), (41, 5))),
        (((44, 17), (50, 15), (55, 13)), ((44, 28), (51, 29), (57.5, 29)), ((28, 14), (36, 10), (42, 12))),
    ]
    for i, (front_leg, back_leg, front_arm) in enumerate(walk):
        frames[f"walk{i}"] = venom_pose(front_arm, V_BACK_ARM, front_leg, back_leg, body=(-(i % 2), 0))
    # Claw attack: wind up overhead, then swipe down and forward
    frames["attack0"] = venom_pose(((28, 14), (20, 19), (12, 15)), V_BACK_ARM, V_FRONT_LEG, V_BACK_LEG, body=(0, 1))
    frames["attack1"] = venom_pose(
        ((28, 14), (31, 5), (34, -3)), V_BACK_ARM, ((44, 17), (50, 10), (57.5, 7)), V_BACK_LEG, body=(1, -2)
    )
    # Knocked back: leaning away, arms thrown up
    frames["hurt"] = venom_pose(
        ((28, 16), (22, 12), (16, 14)), ((28, 33), (22, 37), (17, 35)), V_FRONT_LEG, V_BACK_LEG, body=(1, 3)
    )
    # Blinded: both hands clawing at the web on his face, no tongue
    frames["blinded"] = venom_pose(
        ((28, 14), (30, 7), (16, 9)), ((28, 31), (30, 27), (18, 22)), V_FRONT_LEG, V_BACK_LEG, tongue=False
    )
    return {name: to_rows(shifted(cells, 0, V_PAD_L), V_H, V_W) for name, cells in frames.items()}


# --- output --------------------------------------------------------------------


def write_module(path, export, colors_expr, frames, origin, extra=""):
    lines = [
        "// Generated by scripts/build_sprites.py. Do not edit by hand.",
        "import { Sprite } from '../types';",
    ]
    if colors_expr.startswith("spidermanSideArt"):
        lines.append("import { spidermanSideArt } from '../spidermanSideArt';")
    lines.append("")
    if not colors_expr.startswith("spidermanSideArt"):
        lines.append(f"const colors = {colors_expr};")
        colors_expr = "colors"
        lines.append("")
    lines.append(f"export const {export}: Record<string, Sprite> = {{")
    for name, rows in frames.items():
        lines.append(f"  {name}: {{")
        lines.append(f"    colors: {colors_expr},")
        lines.append("    faces: -1,")
        lines.append(f"    originX: {origin},")
        lines.append("    rows: [")
        lines += [f"      '{r}'," for r in rows]
        lines.append("    ]")
        lines.append("  },")
    lines.append("};")
    if extra:
        lines += ["", extra]
    os.makedirs(OUT, exist_ok=True)
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


def main():
    write_module(
        os.path.join(OUT, "spidermanFrames.ts"), "spidermanFrames", "spidermanSideArt.colors", spidey_frames(), S_ORIGIN
    )
    colors = "{ " + ", ".join(f"{k}: '{v}'" for k, v in VENOM_COLORS.items()) + " }"
    # Face (eye) position relative to his feet and body center, in pixels, facing left
    face = f"export const VENOM_FACE_PX = {{ x: {V_PAD_L + 13 - V_ORIGIN}, y: {V_H - 1 - 10} }};"
    write_module(os.path.join(OUT, "venomFrames.ts"), "venomFrames", colors, venom_frames(), V_ORIGIN, face)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
