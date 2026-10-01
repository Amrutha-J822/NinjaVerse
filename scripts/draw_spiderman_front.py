# Left half of the front-facing sprite (12 cols, col 11 is the center line); mirrored to 23 wide.
HALF = [
 # head
 '........aaaa',
 '......aacccc',
 '.....acccddd',
 '....acccdddd',
 '....abccddcd',
 '....abaacccc',
 '....aakkaccc',
 '....aakkkkac',
 '....abaakkac',
 '....abccaaac',
 '....abcccccc',
 '....abbccccc',
 '.....abbcccc',
 '......abbccc',
 '.......aabbb',
 # neck + shoulders
 '........abbc',
 '....aaaabccc',
 '...abccbbccc',
 '..abcddcbccc',
 # torso with arms at the sides (blue outer stripe) and chest spider
 '..ahccddcbcc',
 '.ahcacdccacc',
 '.ahcacccccaa',
 '.ahcacbccaaa',
 '.ahcacccccaa',
 '.ahcacbccaca',
 '.ahcabcccccc',
 '.ahcabbccccc',
 '.ahcaabbcccc',
 # hands + hips
 '.acdaaajhhhh',
 '.acdcaahhhii',
 '..aaa.ahhhhh',
 '......ahhhha',
 # legs (blue thighs, red shins and boots)
 '......ahhha.',
 '......ajhha.',
 '......ajhha.',
 '......abcca.',
 '......abcda.',
 '......abcda.',
 '......abcca.',
 '......abcca.',
 '......abcca.',
 '.....abccca.',
 '.....abcdca.',
 '.....abccca.',
 '.....aaaaaa.',
]
assert all(len(r) == 12 for r in HALF), [i for i, r in enumerate(HALF) if len(r) != 12]
rows = [r + r[:-1][::-1] for r in HALF]
print("// Front view (facing the player). Drawn as a left half and mirrored, so it is symmetric.")
print("import { Sprite } from './types';")
print("import { spidermanSideArt } from './spidermanSideArt';\n")
print("export const spidermanFront: Sprite = {")
print("  colors: spidermanSideArt.colors,")
print("  rows: [")
for r in rows: print(f"    '{r}',")
print("  ]")
print("};")
