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
