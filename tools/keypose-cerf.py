"""Compose les images clés de pose du Cerf à partir de l'image 0 de sa marche.

usage : python tools/keypose-cerf.py <source.png> <sortie_dir> [flip=1] [pivot=x,y] [cut=y] [eye=x,y] [feet=x,y] [xmax=n] [atop=n]
La tête (bois compris) tourne autour du garrot ; une pose 'cabre' fait basculer tout le corps autour des sabots arrière.
Les réglages par défaut sont ceux du Cerf sans lumière (tête à gauche). `flip=1` retourne l'image avant de composer
et la rend retournée à nouveau : pour un Cerf dont la tête est à droite, donner les repères de l'image retournée.
"""
import sys, os
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
opts = dict(a.split('=', 1) for a in sys.argv[3:])


def pair(key, default):
    return tuple(int(v) for v in opts[key].split(',')) if key in opts else default


os.makedirs(out, exist_ok=True)
FLIP = opts.get('flip') == '1'
base = Image.open(src).convert('RGBA')
if FLIP:
    base = base.transpose(Image.FLIP_LEFT_RIGHT)
W, H = base.size
PIVOT = pair('pivot', (52, 66))      # le garrot : la tête et les bois tournent autour
HEAD_CUT = int(opts.get('cut', 66))  # au-dessus de cette ligne : tête et bois
FEET = pair('feet', (90, 117))       # les sabots arrière
EYE = pair('eye', (44, 54))          # l'œil
XMAX = int(opts.get('xmax', 100))    # à droite de cette colonne, sous les bois : le corps
ATOP = int(opts.get('atop', 0))      # au-dessus de cette ligne, quelle que soit la colonne : les bois


def split(img):
    head = Image.new('RGBA', img.size, (0, 0, 0, 0))
    body = Image.new('RGBA', img.size, (0, 0, 0, 0))
    hp, bp, ip = head.load(), body.load(), img.load()
    for y in range(img.height):
        for x in range(img.width):
            p = ip[x, y]
            if p[3] == 0:
                continue
            if (y < HEAD_CUT and x < XMAX) or y < ATOP:
                hp[x, y] = p
            else:
                bp[x, y] = p
    return head, body


def rot(img, angle, center):
    # nearest : pas de lissage, les pixels restent nets (PIL tourne dans le sens inverse des aiguilles)
    return img.rotate(angle, resample=Image.NEAREST, center=center)


def shift(img, dx, dy):
    res = Image.new('RGBA', img.size, (0, 0, 0, 0))
    res.alpha_composite(img, (dx, dy)) if dx >= 0 and dy >= 0 else res.paste(img, (dx, dy))
    return res


def tint(img, region, color, amount):
    """Teinte vers `color` les pixels clairs d'une zone (x0,y0,x1,y1)."""
    px = img.load()
    x0, y0, x1, y1 = region
    for y in range(max(0, y0), min(img.height, y1)):
        for x in range(max(0, x0), min(img.width, x1)):
            p = px[x, y]
            if p[3] == 0:
                continue
            if sum(p[:3]) > 330:  # les bois clairs, pas les contours
                px[x, y] = tuple(int(p[i] * (1 - amount) + color[i] * amount) for i in range(3)) + (255,)
    return img


def compose(head_angle=0, head_dx=0, head_dy=0, body_angle=0, body_dy=0, glow=None, eyes=False):
    head, body = split(base)
    if glow in ('antlers', 'antlers_half'):
        tint(head, (0, 0, 128, 47), (255, 61, 129), 0.85 if glow == 'antlers' else 0.5)
    elif glow in ('eyes', 'eyes_small'):
        px = head.load()
        ex, ey = EYE
        core = tuple((ex + a, ey + b) for a, b in ((-1, 0), (0, 0), (1, 0), (0, -1), (0, 1)))
        halo = tuple((ex + a, ey + b) for a, b in ((-2, 0), (2, 0), (-1, -1), (1, -1), (-1, 1), (1, 1)))
        wide = tuple((ex + a, ey + b) for a, b in ((-3, 0), (3, 0), (-2, -1), (2, -1), (-2, 1), (2, 1), (-1, -2), (0, -2), (1, -2), (-1, 2), (0, 2), (1, 2)))
        for (x, y) in (core if glow == 'eyes_small' else core + halo):
            px[x, y] = (255, 61, 129, 255)
        if glow == 'eyes':
            for (x, y) in wide:
                px[x, y] = (255, 120, 170, 255)
            for (x, y) in halo:
                px[x, y] = (255, 190, 215, 255)
    head = rot(head, head_angle, PIVOT)
    head = shift(head, head_dx, head_dy)
    out_img = Image.new('RGBA', base.size, (0, 0, 0, 0))
    out_img.alpha_composite(body)
    out_img.alpha_composite(head)
    if body_angle or body_dy:
        out_img = rot(out_img, body_angle, FEET)
        out_img = shift(out_img, 0, body_dy)
    return out_img


# nom -> (pose finale, pose de départ déjà bien entamée)
POSES = {
    'charge': (dict(head_angle=38, head_dx=-4, head_dy=15, body_dy=3), dict(head_angle=20, head_dx=-2, head_dy=8, body_dy=1)),
    'roots':  (dict(head_angle=50, head_dx=-3, head_dy=30, body_dy=2, glow='antlers'), dict(head_angle=28, head_dx=-2, head_dy=15, body_dy=1)),
    'stomp':  (dict(head_angle=-12, head_dy=-2, body_angle=-26, body_dy=-2), dict(head_angle=-6, body_angle=-14)),
    'stalk':  (dict(head_angle=-20, head_dx=3, head_dy=-6, glow='eyes'), dict(head_angle=-10, head_dx=1, head_dy=-3, glow='eyes_small')),
    'volley': (dict(head_angle=-26, head_dx=5, head_dy=-4, glow='antlers'), dict(head_angle=-14, head_dx=3, head_dy=-2, glow='antlers_half')),
    'roar':   (dict(head_angle=-34, head_dx=6, head_dy=-8, body_angle=-8, body_dy=-1), dict(head_angle=-18, head_dx=3, head_dy=-4)),
}

names = list(POSES)
sheet = Image.new('RGBA', (W * 2, H * len(names)), (40, 44, 56, 255))
for r, name in enumerate(names):
    end_kw, start_kw = POSES[name]
    for c, (tag, kw) in enumerate((('start', start_kw), ('end', end_kw))):
        img = compose(**kw)
        if FLIP:
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
        img.save(os.path.join(out, f'{name}-{tag}.png'))
        sheet.alpha_composite(img, (c * W, r * H))
sheet.save(os.path.join(out, 'sheet.png'))
sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(os.path.join(out, 'sheet2x.png'))
print('ok', names)
