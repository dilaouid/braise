# « L'arrivée au Marais » : sources

Cinématique `marsh-arrival`, l'entrée de la région 2, le Marais des Lanternes Noyées : Moon et Cream
quittent les dunes de cendre, trouvent les lanternes sous l'eau, les silhouettes dans le brouillard, puis
la Dame de Vase. Générée le 2026-11-27 avec `create_image_pro`, 640 × 360, fond opaque, les 32 couleurs de
`assets/palette.png` passées à l'outil (aucun pixel hors palette, vérifié sur les quatre fichiers), **une
génération par plan** (25 générations chacune, 100 en tout). Même méthode que
`../cinematique-stag-call/README.md` : `node tools/fetch-illustration.mjs <nom> <job> marsh-arrival`, puis
`node tools/build-cinematic.mjs marsh-arrival`.

Image de style de toutes les images : `cinematique-memory-meeting/ill-01.png` (la forêt de nuit), comme
pour `stag-call`.

| Fichier | Plan | Job PixelLab | Références |
|---|---|---|---|
| `ill-01.png` | Les dernières dunes, le marais, le ponton ; Moon et Cream de dos | `de6fa707-41d6-40cb-9fe2-774df8d50189` | `ill-12` du prologue (Moon, sa lanterne, Cream), `ill-08` du prologue (leur échelle dans la cendre) |
| `ill-02.png` | L'eau noire vue d'en haut, les lanternes noyées | `98ff0217-3569-43dd-b105-13f6a37fe196` | `ill-10` du prologue (les bottes, les pattes de Cream) |
| `ill-03.png` | Cream hérissée, les silhouettes aux yeux magenta | `1f7fad06-6dce-4be3-b8f5-b370a7b9b58c` | `ill-10` du prologue (Cream) |
| `ill-04.png` | La Dame de Vase dans le brouillard, Moon devant | `bb0c853f-f845-481d-9cfe-d85ff6304d9e` | `ill-01` de cette scène (le marais, le ponton, Moon de dos), `ill-12` du prologue (Moon) |

`ancre/` contient les copies agrandies trois fois.

## Retouche

- `ill-03` : l'ombre portée de Cream a été effacée (693 pixels `#131c2e` sous le chat, lignes 278 à 297,
  colonnes 283 à 370, remplacés par la couleur dominante de la même ligne de planche). **Cream n'a jamais
  d'ombre** (document 14 §6) : à refaire si l'image est régénérée. L'image telle que PixelLab l'a rendue
  est gardée dans `ill-03-avant-retouche.png` ; aucun pixel hors palette après la retouche.

Les trois autres images n'ont aucune retouche.

## La Dame de Vase

Le sprite du boss n'était pas encore choisi quand `ill-04` a été générée (plusieurs propositions très
différentes étaient en cours) : elle est faite d'après la description seule, en silhouette grise dans le
brouillard. À comparer au sprite retenu, et à régénérer avec lui en référence si l'écart gêne.

## Prompts

Chaque prompt finit par : `The bottom fifth of the image is calm <dark ash|black water|dark planks and
water> with no detail. 16-bit pixel art illustration, cinematic composition, three-tone shading, limited
palette, <ambiance>, large calm shapes, no text`.

- `ill-01` : `A wide shot seen from behind, at night. In the foreground, the last low dunes of pale grey
  ash. Beyond them, a flat black marsh stretches to the horizon under thick pale fog: still black water, a
  few dead reeds, the faint silhouettes of dead willows lost in the fog. A broken wooden pontoon with
  crooked posts and missing planks starts at the edge of the ash and leads straight into the marsh,
  vanishing in the fog. At the start of the pontoon, small in the frame and seen from behind, stands the
  same man as in the reference images: bearded, ash-grey hooded cloak, a curved blade on his back, holding
  a small lit lantern in his hand. Beside him sits the same slim cream-coloured cat, seen from behind. The
  lantern is a small warm orange point of light, the only warm colour in the whole image. Everything else
  is blue-black, dark green and grey-turquoise.` Ambiance : `eerie mood, quiet dread`.
- `ill-02` : `Looking straight down from above at black marsh water beside an old wooden pontoon, at night.
  Under the dark surface, dozens of drowned fishermen's iron lanterns rest at different depths, each one
  still glowing faint turquoise, the deeper ones smaller and dimmer, fading away into the black depth. On
  the surface near the top, the warm orange reflection of one lit lantern, gently rippling. Along the top
  edge of the image, the rotten planks of the pontoon seen from above, with only the tips of a man's worn
  leather boots and the two front paws of a cream-coloured cat at the edge of the planks. No faces, no full
  bodies. Colours: black, dark green and turquoise; the orange reflection is the only warm colour.`
  Ambiance : `eerie and solemn mood, quiet dread`.
- `ill-03` : `Night, a flat black marsh under thick pale fog, view along an old wooden pontoon. In the
  foreground on the pontoon planks, large, the same slim cream-coloured cat as in the reference image, seen
  from behind in three-quarter view: it has stopped dead, back arched high, fur raised, tail bristling,
  staring ahead into the fog. Ahead of it in the fog, a dozen still human silhouettes stand waist-deep in
  the black water, spread out in a loose line, dark grey shapes half lost in the fog. Each silhouette holds
  a dead unlit lantern in its hand, and each has two small glowing magenta eyes. They stand perfectly
  still. Colours: blue-black water, dark green, grey fog; the cat keeps its pale cream colour; the eyes are
  small bright magenta points.` Ambiance : `ominous mood, dread, not gory`.
- `ill-04` : `Night, a flat black marsh under thick pale fog, very wide shot. Far away in the fog stands an
  immense drowned bride, a giant woman waist-deep in the black water, towering high above the dead leafless
  willows around her, which only reach her waist. She is a tall dark grey silhouette half lost in the fog:
  a long wet veil hangs over her face and shoulders, a soaked tattered wedding dress, long thin arms
  hanging at her sides. In her hair, a crown of small drowned iron lanterns glowing faint turquoise. Her
  head is slowly turning toward the viewer, and behind the veil, where her face is, a faint magenta glow.
  In the foreground at the bottom, tiny, seen from behind, the same man as in the reference images, in his
  ash-grey hooded cloak with a curved blade on his back, stands at the end of a broken wooden pontoon
  holding a small lit lantern: a tiny warm orange light, the only warm colour in the image. Colours:
  blue-black water, dark green, grey fog, turquoise and a little magenta.` Ambiance : `eerie and ominous
  mood, dread, not gory`.

## Les sons

Les sons de la scène ne viennent pas de ce lot d'images et ne sont pas décrits ici : ils sont rangés à part
dans `assets/source/audio/` (`music-marsh-arrival-a.mp3`, `sfx-marsh-arrival-eau.wav`).

## Points connus

- **Les couleurs** : le brouillard est gris-bleu clair (`#c9d1dc`, `#dff6ff`) aux plans 1, 3 et 4, sans
  vert ; seul le plan 2 a le turquoise et un peu de vert. Le marais du jeu (tuiles et décors) est vert
  sombre et turquoise : les plans larges tiennent plus du Bois dans la brume que de cette teinte.
- `ill-01` : une petite flaque de lumière chaude au sol sous Moon et Cream ; la queue de Cream fait une
  boucle douteuse. Un saule a des feuilles pâles en haut à droite, dans le brouillard.
- `ill-02` : la lanterne orange est dessinée entière, posée sur l'eau, et non comme un reflet : on peut
  croire que Moon l'a lâchée. Une vingtaine de lanternes noyées, grosses et proches, plutôt que des
  dizaines qui se perdent ; celles du bas s'éteignent bien dans le noir.
- `ill-03` : les silhouettes ont de l'eau jusqu'aux genoux, pas jusqu'à la taille ; deux petites, au fond,
  sont brouillées ; une bande de trame dans le brouillard, derrière elles.
- `ill-04` : Moon est petit mais pas minuscule, et Cream n'y est pas (le plan demandé ne la citait pas). La
  Dame semble debout au bout du ponton, l'ourlet de sa robe visible, et non enfoncée jusqu'à la taille. Sa
  couronne de lanternes est bleu pâle (`#7fd4ff`, `#b8fff0`) plutôt que turquoise, et elle a deux yeux
  magenta nets au lieu d'une lueur derrière le voile. Le ponton et les pieds de Moon descendent jusqu'au
  bord bas de l'image, là où passe la ligne de récit.
