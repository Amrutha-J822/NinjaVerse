// Landing crouch (facing the player), shown when he lands on a rooftop.
import { spidermanSideArt } from './spidermanSideArt';
import { Sprite } from './types';

export const spidermanCrouch: Sprite = {
  colors: spidermanSideArt.colors,
  rows: [
    '..........aaaaaaa..........',
    '........aacccccccaa........',
    '.......acccdddddccca.......',
    '......acccdddddddccca......',
    '......abccddcdcddccba......',
    '......abaacccccccaaba......',
    '......aakkacccccakkaa......',
    '......aakkkkacakkkkaa......',
    '......abaakkacakkaaba......',
    '......abccaaacaaaccba......',
    '......abcccccccccccba......',
    '......abbcccccccccbba......',
    '.......abbcccccccbba.......',
    '........abbcccccbba........',
    '.........aabbbbbaa.........',
    '......aaaaabbbbbaaaaa......',
    '.....aaacccccccccccaaa.....',
    '....ahccaddcccccddaccha....',
    '....ahccaddcacacddaccha....',
    '....ahccaccccaccccaccha....',
    '.aaaahccacccaaacccacchaaaa.',
    'ahhhahccaacccacccaacchahhha',
    'ajhhhaahccacacacacchaahhhja',
    'ajhhhhahccaaaaaaacchahhhhja',
    'abccahahccahhhhhacchahaccba',
    'abccaaahccajjjjjacchaaaccba',
    'abdca.ahccaaaaaaaccha.acdba',
    'abdca.ahcca.....accha.acdba',
    'abdca.aaaaaa...aaaaaa.acdba',
    'abccaaacdddca.acdddcaaaccba',
    'ccccccaccccca.acccccacccccc',
    'bbbbbbaccccca.acccccabbbbbb',
    'aaaaaa.aaaaa...aaaaa.aaaaaa'
  ]
};
