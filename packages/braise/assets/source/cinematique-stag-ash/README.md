# « La Cendre » : sources

Cinématique `stag-ash`, jouée avant chaque départ au Bois une fois le Cerf battu
(`docs/superpowers/specs/2026-11-24-cinematiques-cerf-design.md` §4). Générée le 2026-11-24 comme
`../cinematique-stag-call/README.md` : `create_image_pro`, 640 × 360, fond opaque, palette du jeu, une
génération par image (25 chacune), image de style `cinematique-memory-meeting/ill-01.png`.
`node tools/fetch-illustration.mjs <nom> <job> stag-ash`, puis `node tools/build-cinematic.mjs stag-ash`.

La musique et les sons sont ceux de `stag-call`.

| Fichier | Plan | Job PixelLab | Références |
|---|---|---|---|
| `ill-01.png` | Le tas de cendre et d'éclats | `03b8ef5f-10da-4ed6-a7ef-840e14a35b34` | sprite `boss-cerf` (bois et lanternes) |
| `ill-02.png` | Le tourbillon, le Cerf à moitié formé | `60c32ed8-309e-4960-ac83-0628a1fda19d` | sprite `boss-cerf` |
| `ill-03.png` | Le Cerf de Cendre debout | `e45d8a1d-8cc6-4c02-9ca5-a56a2d307fd0` | sprite `boss-cerf` |
| `ill-04.png` | Gros plan de sa tête | `42b92d98-80b8-44f2-adcb-e5a83b00355e` | `ill-03` |

## Prompts

Même suffixe que `stag-call`.

- `ill-01` : la clairière après le combat ; un tas de cendre grise et d'éclats de bois pâle, des petites
  lanternes de fer brisées à moitié enterrées, des morceaux de bois de cerf. Ambiance : `desolate, silent
  and uneasy mood`.
- `ill-02` : le tas se soulève en tourbillon de poussière et d'éclats ; dedans, la silhouette à moitié
  formée d'un grand cerf. Ambiance : `eerie and uneasy mood`.
- `ill-03` : le cerf refait de cendre, debout, de profil vers la droite ; creux, fissuré comme de l'argile
  sèche, des éclats qui tombent, des lanternes mortes, **orbites vides, sans aucune lueur**. Ambiance :
  `lifeless, ghostly and dangerous mood, not gory`.
- `ill-04` : gros plan de sa tête, mêmes traits. Ambiance : `lifeless, ghostly and menacing mood`.

## Le sprite du boss

`boss-cerf-cendre` (dossier `../boss-cerf-cendre/`) : `create_map_object` 128 × 128, vue « high top-down »,
pose en diagonale (trois quarts, tourné vers le bas-droite, tête vers la caméra), puis `animate_object` v3,
6 images. Objet `85c517de-8d30-47d3-bb7b-b0f0f52864f7`. Il remplace une première version de profil
(`77f53df9-16cc-4782-bb08-dc1fe9f70cd2`, « low top-down »), que l'auteur n'aimait pas. Une autre
proposition « low top-down » (`62c1e19d-8f2e-4ffe-94ab-6036b7455fe1`) restait de profil. Inscrit dans
`assets/pixellab.json` ; `pnpm assets:build` en fait `sprites/boss-cerf-cendre@6.png`.
`../boss-cerf-cendre/apercu-x3.png` montre la bande agrandie.

## Points connus

- `ill-01` : deux lanternes du tas brillent orange, alors qu'elles devraient être mortes.
- `ill-04` : les fissures du visage luisent d'un orange pâle, comme des braises dedans.
- Le sprite en diagonale a perdu les lanternes et les fissures : il ressemble à un cerf vivant, gris et
  sombre, aux yeux ambrés. À reprendre si l'auteur veut le look de cendre des illustrations.
  Le moteur le fait pâlir et se défaire pendant sa reformation.
