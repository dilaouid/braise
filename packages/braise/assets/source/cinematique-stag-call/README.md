# « L'appel du Cerf » : sources

Cinématique `stag-call`, jouée avant chaque départ au Bois tant que le Cerf n'a jamais été battu
(`docs/superpowers/specs/2026-11-24-cinematiques-cerf-design.md` §4). Générée le 2026-11-24 avec
`create_image_pro`, 640 × 360, fond opaque, les 32 couleurs de `assets/palette.png`, **une génération par
image** (25 générations chacune). Même méthode que `../cinematique-memory-meeting/README.md` :
`node tools/fetch-illustration.mjs <nom> <job> stag-call`, puis `node tools/build-cinematic.mjs stag-call`.

Image de style de toutes les images : `cinematique-memory-meeting/ill-01.png` (la forêt de nuit).

| Fichier | Plan | Job PixelLab | Références |
|---|---|---|---|
| `ill-01.png` | Le Bois large, le Cerf au loin | `49297e83-b9e4-4bad-a022-24fe590ad2b6` | sprite `boss-cerf` |
| `ill-02.png` | Gros plan de la tête | `2c10affe-4dcc-4ca1-9b8f-44598fa16f93` | sprite `boss-cerf` |
| `ill-03.png` | Il brame, la horde sort | `386a5435-21ed-4d63-b218-8b9b45c22be0` | sprites `boss-cerf`, `enemy-rampant`, `enemy-chauve-suie` |
| `ill-04.png` | Le Bois sans le Cerf | inpaint `f929f6ea-a2c3-473c-945d-761aa17a5a1d` (10 générations) | `ill-01` |

`ill-04` est `ill-01` dont le Cerf est effacé : l'inpaint ne prend pas plus de 512 px, donc le carré
256 × 256 posé en (200, 60) a été repeint (masque 100 × 96 en (82, 64) du carré, « empty misty forest
path… no animal »), puis recollé. Le carré rendu est `crop-sans-cerf.png` ; aucun pixel hors palette.

## Prompts

Chaque prompt finit par : `16-bit pixel art illustration, cinematic composition, three-tone shading,
limited palette, <ambiance>, large calm shapes, no text`.

- `ill-01` : une forêt de nuit très large, brume entre les troncs ; au loin, petit, un cerf de bois gris
  cendre marche lentement vers la droite, bois chargés de lanternes éteintes, deux petits yeux magenta.
  Ambiance : `eerie and ominous mood, quiet dread`.
- `ill-02` : gros plan de la tête, trois quarts, bois craquelé, lanternes de fer éteintes, orbites creuses
  avec deux petits yeux magenta froids qui fixent le spectateur. Ambiance : `unsettling and solemn mood,
  ominous, not gory`.
- `ill-03` : une clairière ; le cerf lève la tête et brame ; des créatures de racines sortent de terre, des
  chauves-souris de suie quittent les branches. Ambiance : `ominous mood, dread, not gory`.

## Les sons

`create_music`, 60 BPM, 30 s demandées, `exclude: "drums, percussion, upbeat melody, electric guitar,
choir"` : violoncelle et contrebasse tenus, nappe grave, quelques notes de célesta isolées. 10 générations
pour deux prises. Sert aussi à `stag-ash`.

| Fichier | song_id | Durée |
|---|---|---|
| `theme-a-prise-1.mp3` | `9998ead5-ffac-4630-976a-e0472e4e0c4b` | 29,6 s |
| `theme-a-prise-2.mp3` | `c3f40c40-6cbc-4536-9c5d-e45750737c2e` | 29,9 s |

**Prise gardée : la prise 1** (choix par défaut, à confirmer par l'auteur), copiée en `theme-a.mp3`, qui
devient `music-stag-call-a`.

`sons/` : quatre effets `create_sound_effect` (2 générations chacun), qui deviennent `sfx-stag-call-*`.

| Fichier | Prompt | Durée |
|---|---|---|
| `stag-call-brame.wav` | a huge stag bellowing a long, deep, mournful roar in a dark empty forest | 3 s |
| `stag-call-cendre.wav` | dry grey ash and dust pouring and trickling like sand | 3 s |
| `stag-call-craquement.wav` | old dry wood slowly creaking and cracking, splinters snapping | 2,5 s |
| `stag-call-souffle.wav` | a low, deep, slow breath of cold wind rising and falling | 3 s |

Adresses dans `.pixellab/audio-urls.json` (hors git). Le service des sons a eu une panne pendant la
génération : les premières demandes ont échoué sans rien coûter, ces fichiers sont les secondes.
