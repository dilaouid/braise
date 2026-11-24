# Braise

Un survivors-like très RPG, en pixel art vu de dessus. Tu portes la dernière braise à travers un monde
éteint : tes armes frappent seules, ton build grossit à chaque niveau, et ce que tu ramènes nourrit des
boosts permanents.

Le jeu est en cours de développement.

## Lancer le jeu

Il faut Node 22 ou plus récent, et pnpm 10.

```sh
pnpm install
pnpm dev
```

Puis ouvrir <http://localhost:5183>. L'éditeur de dialogues, réservé au développement, est sur
<http://localhost:5183/editor.html>.

## Commandes

| Commande | Ce qu'elle fait |
|---|---|
| `pnpm dev` | Serveur de développement |
| `pnpm test` | Tests unitaires et de simulation |
| `pnpm test:e2e` | Parcours Playwright (installer le navigateur : `pnpm --filter braise exec playwright install chromium`) |
| `pnpm typecheck` | Vérification des types |
| `pnpm validate` | Valide les données de `content/` |
| `pnpm build` | Le site statique dans `packages/braise/dist/` |

## Crédits

Les images, les sons et la musique sont générés avec PixelLab ; leur usage est régi par
<https://pixellab.ai/termsofservice>. Les polices Jersey 10 et Jersey 15 sont sous licence SIL OFL.
