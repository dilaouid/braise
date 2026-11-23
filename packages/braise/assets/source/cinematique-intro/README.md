# Cinématique d'intro : sources

Ancre de style du document `docs/15-cinematique-intro.md` §8, générée le 2026-11-23 avec
`create_image_pro`, en passant les 32 couleurs de `assets/palette.png` (aucun pixel hors palette, vérifié).
Ces images ne sont pas encore dans `assets/pixellab.json` : elles y entreront une fois choisies, avec le
lecteur de cinématique.

| Fichier | Job PixelLab | Taille | Propositions | Coût |
|---|---|---|---|---|
| `decor-facade.png` | `07e3b954-2f63-425b-97f5-b4c460911066` | 640 × 360, fond opaque | 1 | 25 |
| `moon-avant-0..3.png` | `f345b538-a9f2-496a-91a5-5ed3e6eacef8` | 96 × 96, transparent | 4 | 10 |
| `cream-0..15.png` | `ab53ee21-8f2f-4f8d-a5b3-b24821cb720b` | 64 × 64, transparent | 16 | 10 |

`ancre/` contient les assemblages pour juger : les planches de propositions à ×3, le plan 3 avec Cream
posé sur le rebord, et le test d'échelle de Moon devant la façade.

## Prompts

- Façade : `the stone front of a small French village house at golden sunset, seen from the street, side
  view. A red-painted wooden front door with a brass knocker in the center. One warm lit window with the
  dark silhouettes of a woman and a small boy behind the glass. A slim cream-coloured cat sitting on the
  outside windowsill. Wooden shutters, a few potted geraniums, old cobblestone pavement in front, warm
  orange light and long soft shadows.` + suffixe des décors.
- Moon avant : `a man in his thirties walking to the right, full body, side view. Short dark hair,
  clean-shaven, a casual brown jacket over a sweater, jeans, a French baguette under one arm, relaxed and
  tired after work.` + suffixe des sprites (vue de côté).
- Cream : `a slim cream-coloured cat with pale amber eyes sitting upright, side view facing right, tail
  curled around its paws, soft round shapes, calm and watchful.` + suffixe des sprites.

## Choix

- **Cream : proposition n°0** (choisie le 2026-11-23), copiée en `cream.png`.
- **Moon avant : proposition n°1** (choix par défaut, à confirmer), copiée en `moon-avant.png`.

## Thème A · La vie d'avant

`create_music`, 76 BPM, 30 s demandées, `exclude: "drums, synth lead"`, 10 générations pour deux prises.
Adresses dans `.pixellab/audio-urls.json` (hors git).

| Fichier | song_id | Durée |
|---|---|---|
| `theme-a-prise-1.mp3` | `57d93f9e-f786-413a-93f1-8258883e5cc3` | 29,0 s |
| `theme-a-prise-2.mp3` | `b45c9503-dc93-4e6f-bfb0-f5acefe88a76` | 29,6 s |

La prise gardée sert de source à `restyle_song_id` pour le thème C, les souvenirs et la fin.

**Prise gardée : la prise 2** (`b45c9503-dc93-4e6f-bfb0-f5acefe88a76`, choisie le 2026-11-23), copiée en
`theme-a.mp3`. C'est la source de toute la musique de la famille.

## Thème B · La fumée et l'année

`create_music`, 60 BPM (le minimum accepté ; le document 15 disait 50), 35 s demandées,
`exclude: "drums, melody, music box"`, 10 générations.

| Fichier | song_id | Durée |
|---|---|---|
| `theme-b-prise-1.mp3` | `81b260df-b481-4641-ab5f-7df0d648cf58` | 36,0 s |
| `theme-b-prise-2.mp3` | `032d046c-0762-43db-9b54-a2c65d39d870` | 38,0 s |

## Thème C · La lanterne

`create_music` avec `restyle_song_id` = la prise 2 du thème A (même mélodie), 20 s demandées,
`exclude: "drums"`, 10 générations.

| Fichier | song_id | Durée |
|---|---|---|
| `theme-c-prise-1.mp3` | `a15fde65-ec4b-44f7-a7de-80021301e195` | 21,6 s |
| `theme-c-prise-2.mp3` | `ac913b84-6b5d-4c8b-8cb0-f3dda4a21085` | 22,3 s |

**Prises gardées (choisies le 2026-11-23)** : thème B prise 1 (`81b260df-b481-4641-ab5f-7df0d648cf58`),
copiée en `theme-b.mp3` ; thème C prise 1 (`a15fde65-ec4b-44f7-a7de-80021301e195`), copiée en `theme-c.mp3`.
La musique de la cinématique est complète : `theme-a.mp3`, `theme-b.mp3`, `theme-c.mp3`.

## Le reste des images (2026-11-23, environ 295 générations avec les sons)

Tout est passé par la palette : `create_image_pro` reçoit les 32 couleurs ; les animations et les
retouches, qui n'en prennent pas, ont été ramenées à la palette ensuite (couleur la plus proche, alpha à
0 ou 255). Aucun pixel hors palette dans ce dossier (vérifié).

### Ce qui est retenu, par plan

| Plan | Décor | Personnages et objets | Animation |
|---|---|---|---|
| 2 | `decor-rue.png` (688 × 384, pour le panoramique) | `moon-avant.png` | `anim-moon-marche-*` |
| 3 | `decor-facade-sans-chat.png` (le chat peint effacé) | `cream.png` | `anim-elio-signe-*` (la fenêtre, 150 × 200, à poser en 370, 30) |
| 4, 5 | `decor-rue.png` (désaturé par le moteur) | `moon-avant.png` | `anim-moon-course2-*` |
| 7 | `decor-desert.png` (orange de l'horizon passé en gris) | `porte2-1.png`, `moon-cendre-1.png` | `anim-moon-cendre-*` |
| 9a | `decor-annee-a.png` | `moon-assis-1.png`, `cream.png`, `eteint-0.png` | — |
| 9b | `decor-annee-b.png` | `moon-cape-3.png`, `cream-marche-2.png` | `anim-moon-cape-*`, `anim-cream-marche-*` |
| 9c | `decor-annee-c.png` | `moon-lame-1.png` | — |
| 10 | `decor-cendre-lanterne.png` (lanterne à demi enterrée) | `cream-marche-2.png`, `mains-lanterne.png` (256 × 256) | `anim-cream-gratte-*` |

Les autres propositions (`*-0..3`, `cream-0..15`, `cream-marche-0..15`, `porte-*`, `anim-moon-course-*`)
restent là pour changer d'avis. `anim-*-0.png` est l'image de départ, inchangée.

### Les jobs PixelLab

| Fichier(s) | Job |
|---|---|
| `decor-rue` | `c45fcf69-6f6d-46c3-8f41-b2a9e5431635` |
| `decor-desert` | `3e1949f2-89cd-4475-b303-5ac25007359c` |
| `decor-annee-a`, `-b`, `-c` | `51a01181-…`, `844654d3-…`, `a1e9e4e1-…` |
| `decor-cendre` | `687b782a-823f-4811-8f18-192c320705d4` |
| `facade-crop-sans-chat` (inpaint) | `8d1bd622-ba6a-4b35-9738-b1e68808e4b9` |
| `cendre-crop-lanterne` (inpaint) | `97524bc4-8ec0-4cc3-af1a-d7f59337c332` |
| `moon-cendre-*`, `moon-assis-*`, `moon-cape-*`, `moon-lame-*` | `cccaa971-…`, `fc00b6bd-…`, `6c672c70-…`, `d69733ac-…` |
| `cream-marche-*` | `e097142f-bb71-409e-aa92-578fc475f713` |
| `porte-*`, `porte2-*` | `c8ea0036-…`, `a8ac2365-1c96-40f9-84bb-908455a9f542` |
| `mains-lanterne` | `87c7ce6b-c2d1-4702-bce2-12f2aeb2ce53` |
| `eteint-*` | `da2c05da-6ed4-4390-8997-7bbe5d216344` |
| `anim-moon-marche`, `-course`, `-course2`, `-cendre`, `-cape` | `6bc0c9f9-…`, `cfe147a2-…`, `1191fdae-…`, `117a946c-…`, `a4166e66-…` |
| `anim-elio-signe`, `anim-cream-marche`, `anim-cream-gratte` | `a2ed412d-…`, `6560756a-…`, `349a1b98-…` |

### Les sons (`sons/`)

13 fichiers WAV, `create_sound_effect`. Adresses dans `.pixellab/audio-urls.json` (hors git), clés
`sfx-intro-*` : cloche (3 s), pas sur les pavés, miaou, grondement de la fumée (3 s), souffle de course,
toux, pas dans la cendre, porte qui grince (2 s), vent (6 s, à boucler), grognement, patte qui gratte,
verre qui tinte, flamme.

### Points connus

- **La porte (plan 7)** fait environ 77 px de haut, Moon environ 78 : elle paraît un peu petite. À
  corriger au placement (la porte plus près de la caméra, Moon derrière) ou en la régénérant plus grande.
- **La course (plan 5)** reste proche d'une marche rapide ; le moteur la fera paraître plus rapide en
  déplaçant Moon plus vite.
- **Après la fumée**, le moteur passe Moon en couleurs froides (désaturation d'environ 65 %).
  **Cream garde sa couleur crème** : c'est voulu, et c'est un indice de plus (document 14 §6).
- `ancre/apercu-plans.png` montre les plans 2, 3, 5, 7, 9a, 9b, 9c et 10 assemblés.
