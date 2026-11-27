# Souvenir « Le mariage » : sources

Illustrations de la scène de souvenir `memory-wedding`, rendue par la Dame de Vase (région 2, le Marais des
Lanternes Noyées) : le mariage de Moon et d'Astrid, les lanternes posées sur un étang. Générées le
2026-11-27 avec `create_image_pro`, 640 × 360, fond opaque, les 32 couleurs de `assets/palette.png` passées
à l'outil (aucun pixel hors palette, vérifié sur les quatre fichiers), **une génération par plan**
(25 générations chacune, 100 en tout), aucune retouche. Même méthode que
`../cinematique-memory-meeting/README.md` : chaque image se récupère par
`node tools/fetch-illustration.mjs <nom> <job> memory-wedding`, puis
`node tools/build-cinematic.mjs memory-wedding` les sort dans `public/cinematics/memory-wedding/`.

Image de style de toutes les images : `cinematique-memory-meeting/ill-03.png` (l'ombre de lapin).

| Fichier | Plan | Job PixelLab | Références |
|---|---|---|---|
| `ill-01.png` | L'étang au crépuscule, les mariés sur le ponton | `80536c5a-cfbe-4644-8497-a3e0d86358bc` | `ill-03` de `memory-meeting` (les deux personnages) |
| `ill-02.png` | À genoux au bout du ponton, la lanterne tenue à deux | `3a95848e-e07c-44f2-a44f-53c65b3baa26` | `ill-03` de `memory-meeting` (les deux personnages) |
| `ill-03.png` | Les deux mains, les alliances, la lanterne lâchée | `14bd3798-3e3f-4720-ba83-a586225a4950` | aucune |
| `ill-04.png` | La nuit, l'étang couvert de lanternes, eux de dos | `194f756b-bc90-4573-b079-640cc3f6b4b1` | `ill-03` de `memory-meeting` (les deux personnages) |

`ancre/` contient les copies agrandies trois fois.

## Les personnages

Les deux mêmes que dans « La promenade » ; `cinematique-memory-meeting/ill-03.png` fixe leurs visages. La
note d'usage de la référence demandait de garder visages et cheveux et de changer les vêtements.

- **Moon, plus jeune** : `short dark hair, clean-shaven, a simple dark suit`.
- **Astrid** : `chestnut-brown hair tied up in a bun, a simple long cream-white dress`.

## Prompts

Chaque prompt finit par : `The bottom fifth of the image is calm dark <grass|water> with no detail. 16-bit
pixel art illustration, cinematic composition, three-tone shading, limited palette, tender and quiet mood,
warm, large calm shapes, no text`.

- `ill-01` : `A small countryside wedding at dusk, wide shot. A calm pond reflects an orange and pink dusk
  sky; tall grass and reeds on the banks; a big tree on the left with warm string lights hanging in its
  branches. A small wooden pontoon goes out over the water from the bank. Along the bank, a handful of
  wedding guests as small dark silhouettes, each holding a glowing paper lantern. The bride and groom walk
  onto the pontoon hand in hand, small in the frame, fully visible from head to feet: the same two people
  as in the reference image. The young man has short dark hair, clean-shaven, and wears a simple dark suit.
  The young woman has chestnut-brown hair tied up in a bun and wears a simple long cream-white dress. Warm
  golden light, soft deep blue shadows.`
- `ill-02` : `A small countryside wedding at dusk, medium shot, three-quarter side view. The same two people
  as in the reference image kneel side by side at the end of a small wooden pontoon over a calm pond.
  Together, with their hands joined around it, they hold one glowing paper lantern just above the dark
  water. The young woman […] laughs softly with her eyes half closed. The young man […] looks at her and
  smiles. The warm yellow-orange light of the lantern on their faces and hands and on the planks. Behind
  them the pond, the far bank with a few tiny warm lights, a deep blue dusk sky with a last orange band on
  the horizon.`
- `ill-03` : `A close-up at dusk, seen from slightly above. Two hands side by side, a man's hand coming from
  the left and a woman's hand coming from the right, each wearing a thin gold wedding ring on the ring
  finger, gently letting go of a small glowing paper lantern that floats on dark blue pond water in the
  centre of the image. The fingers are open, just leaving the lantern. The warm yellow-orange glow of the
  lantern lights the hands, and its long soft reflection ripples on the water. The cuff of a dark suit
  sleeve with a white shirt cuff on the man's wrist, the cuff of a cream-white dress sleeve on the woman's
  wrist. The edge of a few wooden pontoon planks in the top corner. Only hands and forearms, no faces.
  Simple clear hands with five fingers each.`
- `ill-04` : `A wide shot at night. A calm pond covered with dozens of floating paper lanterns, small warm
  yellow-orange points of light on deep blue water, each with its soft reflection, spreading far toward the
  dark tree line on the far bank. In the foreground at the centre, on a small wooden pontoon, a couple
  stands side by side, seen from behind, fully visible from head to feet, small in the frame: the same two
  people as in the reference image. The young man […]. The young woman […]; her head rests on his shoulder.
  Above them a deep blue night sky full of small stars.`

## Les sons

Les sons de la scène ne viennent pas de ce lot d'images et ne sont pas décrits ici : ils sont rangés à part
dans `assets/source/audio/` (`sfx-memory-wedding-rires.wav`).

## Points connus

- `ill-01` : les mariés sont arrêtés sur le ponton, face au spectateur, plus qu'ils n'y entrent ; le ponton
  longe la berge au lieu de s'avancer sur l'eau ; les invités sont cinq silhouettes à gauche.
- `ill-02` : Moon est agenouillé derrière Astrid plutôt qu'à côté d'elle ; sa peau est nettement plus hâlée
  que dans « La promenade ». Le couchant a une bande magenta (`#c2185b`, `#7a1048`) et son reflet sur
  l'eau : c'est la couleur des yeux des Éteints dans le reste du jeu.
- `ill-03` : le ponton, en haut à droite, flotte un peu au-dessus de l'eau, sa perspective est douteuse ;
  la main de Moon est hâlée comme au plan 2. Les deux mains ont bien cinq doigts et une alliance.
- `ill-04` : Moon tient Astrid par la taille ; la tête d'Astrid touche son épaule sans vraiment s'y poser.
  Les lanternes ressemblent à des bougies sur de petits radeaux, pas aux cubes de papier des plans 2 et 3.
- Les cheveux d'Astrid sont châtain clair aux plans 1 et 2, plus sombres au plan 4 (la nuit).
