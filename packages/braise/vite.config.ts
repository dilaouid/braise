import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import braiseEditor from './tools/vite-editor.ts';
import braiseJournal, { buildId } from './tools/vite-journal.ts';

export default defineConfig({
  // Chemins relatifs : le même dist/ marche à la racine d'un site, dans un sous-dossier et dans le lecteur OwlLeaf.
  base: './',
  // L'éditeur de texte (editor.html) n'existe qu'en développement : son greffon ne s'applique qu'à `vite` (apply: 'serve').
  // Le journal des parties aussi : en développement, chaque fiche est écrite dans docs/journal/parties.jsonl.
  plugins: [preact(), braiseEditor(), braiseJournal()],
  // Le commit du jeu, noté dans chaque fiche du journal.
  define: { __BRAISE_BUILD__: JSON.stringify(buildId()) },
  server: { port: 5183, strictPort: true },
  preview: { port: 5184, strictPort: true },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
});
