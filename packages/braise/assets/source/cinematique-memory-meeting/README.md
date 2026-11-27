# Souvenir « La promenade » : sources

Illustrations de la scène de souvenir `memory-meeting` (design des Souvenirs §6), générées le 2026-11-24
avec `create_image_pro`, 640 × 360, fond opaque, les 32 couleurs de `assets/palette.png` (aucun pixel
hors palette, vérifié par `tests/unit/cinematic.test.ts`). Même méthode que le prologue
(`../cinematique-intro/README.md`) : chaque image se récupère par
`node tools/fetch-illustration.mjs <nom> <job> memory-meeting`, puis
`node tools/build-cinematic.mjs memory-meeting` les sort dans `public/cinematics/memory-meeting/`.

| Fichier | Plan | Job PixelLab | Références |
|---|---|---|---|
| `ill-01.png` | Le chemin, deux silhouettes de dos | `392cd876-0e68-42fc-88f9-4139e3e2ab8f` | `ill-01` du prologue (Moon, et image de style) |
| `ill-02.png` | Astrid arrêtée, Moon retourné vers elle | `1a4b272b-2054-4db3-8155-d02b639ab7c3` | `ill-03` (les deux personnages, et image de style), `ill-01` (la forêt) |
| `ill-03.png` | L'ombre de lapin, le rire | `361f2352-5b89-494c-9c8d-0659c1a387fa` | `ill-01` du prologue (Moon, et image de style) |
| `ill-04.png` | Le retour, elle lui tient le bras | `f3a9f874-6963-458e-aae0-4580ac2e23ce` | `ill-03` (les deux personnages, et image de style), `ill-01` (la forêt) |

`ill-01` et `ill-04` ont été remplacées le 2026-11-26 par des illustrations fournies par l'auteur (1672 × 941),
réduites en 640 × 360 par moyenne de zones puis ramenées au plus proche voisin dans la palette ; leurs jobs ci-dessus
ne correspondent plus aux fichiers.

Une génération par plan (25 générations PixelLab chacune), aucune retouche. `ancre/` contient les copies
agrandies trois fois.

## Les personnages

- **Moon, plus jeune** : `a young man in his mid-twenties, short dark hair, clean-shaven, brown casual
  jacket over a dark sweater, blue jeans`. C'est l'homme du plan 1 du prologue, passé en référence.
- **Astrid** : `a young woman in her mid-twenties, chestnut-brown hair tied up in a bun, a long
  cream-white knitted cardigan over a dark teal dress` (devenue bleu nuit dans les images). Le prologue ne
  la montre qu'en silhouette à la fenêtre, avec son chignon : `ill-03` fixe son visage et ses vêtements,
  et sert de référence aux scènes suivantes où elle paraît.

## Prompts

Chaque prompt finit par le suffixe : `16-bit pixel art illustration, cinematic composition, three-tone
shading, limited palette, tender and quiet mood, large calm shapes, no text`.

- `ill-01` : `A forest path at night, wide shot seen from behind. Two people walk away from the viewer
  side by side in the middle of a dirt path between tall trees, both fully visible from head to feet,
  small in the frame, in the upper two thirds of the image. On the left a young man […] holding a small
  flashlight in his hand that throws a small warm yellow-orange cone of light on the path ahead. On the
  right a young woman […]. A little distance between them, they barely know each other. Soft deep blue
  night, gentle moonlight through the leaves, blue tree trunks, not black, warm colours only where the
  flashlight shines. The bottom third of the image is calm dark path and grass with no detail.`
- `ill-02` : `A forest path at night, medium-wide shot, side view. The same two people as in the
  reference image. On the right, the young woman […] has stopped walking. She stands still, fully visible
  from head to feet, her arms crossed tightly against her chest hugging herself, shoulders raised, worried
  face, staring at the deep darkness between the trees on the right side. On the left, one step ahead of
  her on the path, the young man […] has turned around to look back at her with a kind, concerned face.
  He holds a small lit flashlight down at his side, it makes a small warm yellow-orange pool of light on
  the ground at his feet. […]`
- `ill-03` : `A forest path at night, medium-wide shot, side view. On the left, a young man […] stands
  fully visible from head to feet. He has put a small lit flashlight on a tree stump behind him and holds
  his two hands together in its beam to make a hand shadow puppet. On the big pale tree trunk in the
  centre of the image, inside a warm round yellow-orange circle of light, the clear dark shadow of a
  rabbit head with two long ears. On the right, a young woman […] stands fully visible from head to feet,
  laughing sincerely with one hand in front of her mouth, eyes closed with joy. […]`
- `ill-04` : `A forest path at night, medium-wide shot, three-quarter view. The same two people as in the
  reference image walk together side by side along the dirt path, going towards the right, both fully
  visible from head to feet. The young woman […] holds the man's arm with both hands, walking close
  against him, a small calm smile, reassured. The young man […] holds a small lit flashlight in his free
  hand, pointed forward. Its warm yellow-orange beam lights the dirt path ahead of them on the right. […]`

## Les sons

La scène reprend le thème A du prologue (`music-intro-a`). Son seul son propre est le rire du plan 3,
`sfx-memory-rire`, inscrit avec `sfx-memory` (la gemme ramassée) dans `assets/pixellab.json` ; leurs
adresses sont dans `.pixellab/audio-urls.json` (hors git).

## Points connus

- `ill-03` : l'ombre est un lapin entier, plus grand que ce que deux mains feraient ; les pieds des
  personnages descendent jusqu'à 20 px du bas, comme Moon au plan 1 du prologue.
- `ill-04` : le faisceau de la lampe est un grand aplat orange, plus appuyé que dans les trois autres.
- `ill-01` et `ill-04` : une forme sombre en haut au centre (un feuillage), sans gravité.
- Les cheveux de Moon sont bleu-noir de nuit ; ils étaient brun-noir au soleil couchant du prologue.
