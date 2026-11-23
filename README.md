# Braise

Un survivors-like très RPG, en pixel art vu de dessus. Tu portes la dernière braise à travers un monde
éteint : tes armes frappent seules, ton build grossit à chaque niveau, et ce que tu ramènes nourrit des
boosts permanents.

La spécification complète est dans [docs/](docs/README.md). Ce repository contient le **jalon M1** : une
expédition complète dans le Bois des Cendres, et l'Autel du Foyer. L'état exact, les écarts et les mesures
sont dans [docs/decisions/2026-11-23-jalon-m1.md](docs/decisions/2026-11-23-jalon-m1.md).

## Lancer le jeu

Il faut Node 22 ou plus récent, et pnpm 10.

```sh
pnpm install
pnpm dev
```

Puis ouvrir <http://localhost:5183>.

## Jouer

| Action | Manette | Clavier |
|---|---|---|
| Se déplacer | Stick gauche, croix | ZQSD, WASD, flèches |
| Ruée | A ou RB | Espace |
| Compétence | X | E ou J |
| Ultime | Y | R ou K |
| Fiole | LB | F ou L |
| Pause | Start | Échap |
| Valider · Retour | A · B | Entrée · Échap |

« Partir en expédition » se maintient une demi-seconde. Dans les réglages, « Compétences automatiques »
déclenche la compétence et l'ultime dès qu'ils sont prêts : le jeu se joue alors d'un seul stick.

## Commandes

| Commande | Ce qu'elle fait |
|---|---|
| `pnpm dev` | Serveur de développement |
| `pnpm test` | Tous les tests (données, simulation, robots, kit). Environ trois minutes |
| `pnpm typecheck` | Vérification des types |
| `pnpm validate` | Valide les données de `content/` |
| `pnpm build` | Le site statique dans `packages/braise/dist/` |
| `pnpm pack:owl` | `release/Braise.owlgame` et sa jaquette, pour OwlLeaf (après `pnpm build`) |
| `pnpm sim -- --runs 50 --bot active --level 10` | Des parties sans affichage, pour l'équilibrage |
| `pnpm assets` | Retélécharge les générations PixelLab, les met à la palette, reconstruit l'atlas et les sons (demande ffmpeg) |
| `pnpm assets:build` | Remet à la palette et reconstruit l'atlas, sans rien télécharger |

Options de `pnpm sim` : `--runs`, `--bot active|flee`, `--level` (niveau du héros), `--altar` (rangs de
chaque boost), `--minutes`, `--seed`, `--verbose`.

## Structure

```text
docs/                    la spécification, et docs/decisions/
packages/owl-kit/        réutilisable : entrées, hôte, sauvegarde, focus, générateur, boucle
packages/braise/
  content/               les données du jeu (JSON) : aucune valeur de jeu dans le code
  src/core/              la simulation, en TypeScript pur
  src/meta/              compte, héros, Autel, sauvegarde (logique pure)
  src/render/            PixiJS
  src/ui/                Preact : HUD et écrans
  src/audio/             WebAudio
  src/app/               assemblage
  assets/                registre PixelLab, sources, sprites mis à la palette, provenance
  tests/unit/            Vitest
tools/                   assets, atlas, sons, validation, simulation, paquet .owlgame
```

Les images, les sons et la musique sont générés avec PixelLab ; leur usage est régi par
<https://pixellab.ai/termsofservice>, à relire avant toute publication. Les polices Jersey 10 et Jersey 15
sont sous licence SIL OFL.
