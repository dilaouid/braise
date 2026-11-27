# Images du lanceur OwlLeaf

`pnpm pack:owl` agrandit ces deux images ×2 sans lissage et les écrit dans `release/covers/` (jaquette)
et `release/banners/` (bannière). Sans elles, le script retombe sur un montage de sprites.

| Fichier | Taille | Rôle dans OwlLeaf |
|---|---|---|
| `cover.png` | 345 × 460 (3:4) | Tuile de la grille, et fond flouté s'il n'y a pas de bannière |
| `banner.png` | 688 × 384 (16:9) | Fond plein écran de l'accueil ; titres et boutons à gauche, d'où la gauche sombre |

Faites avec PixelLab `create_image_pro`, avec comme références les sprites `boss-cerf` (image 0),
`camp-door`, `hero-lame-cendre-rot-0` et `rot-4`, et `ill-12` comme image de style.

Retouches à la main, **à refaire si une image est régénérée** :

- `cover.png` : la porte rouge (au fond, entre les pattes du Cerf) est redessinée pixel par pixel : six
  panneaux rouge sombre, cadre brun, givre aux coins, comme `camp-door`. La bande sombre et plate du
  haut est rognée.
- `cover.png` et `banner.png` : l'ombre portée de Cream est effacée et remplacée par le sol éclairé.
  **Cream n'a jamais d'ombre** (document 14 §6).
