# Sauvegardes d'exemple

Une sauvegarde par version passée du format (document 08 §7.2). Chaque fichier a été écrit par le jeu de
son époque. **Aucun n'est jamais réécrit** : `tests/unit/save-fixtures.test.ts` vérifie que la version
courante du jeu les charge toutes, sans rien perdre de ce que le joueur avait gagné.

| Fichier | Écrit par | Contenu |
|---|---|---|
| `v1-m1-new.json` | Jalon M1 (`7179fef`) | Une partie tout juste commencée : un héros de niveau 1, rien d'acheté |
| `v1-m1-played.json` | Jalon M1 (`7179fef`) | 24 expéditions jouées par le robot, 2 victoires, héros niveau 21, Autel rempli, un boost désactivé, des réglages changés |

Quand le format change, la version qui s'en va laisse ici une sauvegarde d'exemple **avant** le changement,
nommée `v<version>-<jalon>-<cas>.json`.
