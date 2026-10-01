import re
# Landing crouch, facing the player: knees wide, both hands planted between the feet.
W, H, CX = 27, 33, 13
g = [['.'] * W for _ in range(H)]

parts = []  # drawn back to front; each part gets its own black outline

def part(*fills):
    parts.append(fills)

# Left leg: thigh angled up to a wide knee, shin down to the boot
part((21, 21, 1, 3, 'h'), (22, 22, 1, 6, 'h'), (23, 23, 1, 9, 'h'), (24, 24, 5, 12, 'h'),
     (22, 23, 1, 1, 'j'), (24, 29, 1, 3, 'c'), (24, 29, 1, 1, 'b'), (26, 28, 2, 2, 'd'),
     (30, 31, 0, 5, 'c'), (31, 31, 0, 5, 'b'))
# Hips and shorts
part((23, 25, 8, 13, 'h'), (25, 25, 9, 13, 'j'))
# Torso leaning forward, with neck and chest spider
part((15, 15, 11, 13, 'b'), (16, 17, 6, 13, 'c'), (18, 22, 8, 13, 'c'), (17, 18, 9, 10, 'd'),
     (21, 22, 8, 9, 'b'),
     (18, 18, 12, 12, 'a'), (19, 19, 13, 13, 'a'), (20, 20, 12, 13, 'a'), (21, 21, 13, 13, 'a'), (22, 22, 12, 12, 'a'))
# Arm straight down to the roof, in front of the thigh
part((17, 21, 5, 7, 'c'), (17, 21, 5, 5, 'h'), (22, 28, 7, 9, 'c'), (22, 28, 7, 7, 'h'))
# Hand flat on the roof between the feet
part((29, 31, 7, 11, 'c'), (29, 29, 8, 10, 'd'))

def mirror(fills):
    out = []
    for r0, r1, c0, c1, ch in fills:
        out.append((r0, r1, c0, c1, ch))
        if c1 < CX:
            out.append((r0, r1, W - 1 - c1, W - 1 - c0, ch))
        elif c0 < CX:
            out.append((r0, r1, CX + 1, W - 1 - c0, ch))
    return out

for fills in parts:
    cells = {}
    for r0, r1, c0, c1, ch in mirror(fills):
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1):
                cells[(r, c)] = ch
    # outline this part over whatever is behind it
    for (r, c) in list(cells):
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (r + dr, c + dc)
            if n not in cells and 0 <= n[0] < H and 0 <= n[1] < W:
                g[n[0]][n[1]] = 'a'
    for (r, c), ch in cells.items():
        g[r][c] = ch

# Head from the front sprite, centered
front = open('src/components/sprites/spidermanFront.ts').read()
head = re.findall(r"^\s+'([.a-z]+)',?$", front, re.M)[:15]
pad = (W - len(head[0])) // 2
for r, row in enumerate(head):
    for c, ch in enumerate(row):
        if ch != '.':
            g[r][pad + c] = ch

rows = [''.join(r) for r in g]
while set(rows[-1]) == {'.'}:
    rows.pop()
print("// Landing crouch (facing the player), shown when he lands on a rooftop.")
print("import { Sprite } from './types';")
print("import { spidermanSideArt } from './spidermanSideArt';\n")
print("export const spidermanCrouch: Sprite = {")
print("  colors: spidermanSideArt.colors,")
print("  rows: [")
for r in rows:
    print(f"    '{r}',")
print("  ]")
print("};")
