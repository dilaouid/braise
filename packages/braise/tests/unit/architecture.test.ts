import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = join(__dirname, '..', '..', 'src');

function files(dir: string): string[] {
  return readdirSync(join(src, dir)).filter((f) => f.endsWith('.ts')).map((f) => join(src, dir, f));
}

/** Les chemins importés par un texte : `from '…'`, `import '…'` et `import('…')`, guillemets simples ou doubles. */
function importsOf(text: string): string[] {
  return Array.from(text.matchAll(/(?:\bfrom\s+|\bimport\s*\(?\s*)(['"])([^'"]+)\1/g)).map((m) => m[2]!);
}

function imports(file: string): string[] {
  return importsOf(readFileSync(file, 'utf8'));
}

/** Les fichiers .ts et .tsx d'un dossier et de ses sous-dossiers. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('le lecteur d\'imports des règles', () => {
  it('voit les imports nus, les imports dynamiques, les guillemets doubles et les sous-dossiers', () => {
    const text = [
      'import \'../editor/style.css\';',
      'const m = await import(\'../editor/model.ts\');',
      'import { a } from "../editor/state.ts";',
      'export { b } from \'./b.ts\';',
    ].join('\n');
    expect(importsOf(text)).toEqual(['../editor/style.css', '../editor/model.ts', '../editor/state.ts', './b.ts']);
    const root = mkdtempSync(join(tmpdir(), 'braise-archi-'));
    mkdirSync(join(root, 'ui', 'sous'), { recursive: true });
    writeFileSync(join(root, 'ui', 'a.tsx'), '');
    writeFileSync(join(root, 'ui', 'sous', 'b.ts'), '');
    writeFileSync(join(root, 'ui', 'c.css'), '');
    expect(sourceFiles(join(root, 'ui')).map((f) => f.slice(root.length + 1).replace(/\\/g, '/')).sort()).toEqual(['ui/a.tsx', 'ui/sous/b.ts']);
    rmSync(root, { recursive: true, force: true });
  });
});

/** Les règles de dépendance du document 08 §3, vérifiées ici plutôt que par une règle de lint. */
describe('règles de dépendance', () => {
  it('core n\'importe que core, content et le générateur du kit', () => {
    for (const file of files('core')) {
      for (const spec of imports(file)) {
        const ok = spec.startsWith('./') || spec.startsWith('../content/') || spec === '@owl/kit/rng';
        expect(ok, `${file} importe ${spec}`).toBe(true);
      }
    }
  });

  it('meta n\'importe que meta, core, content et le générateur du kit', () => {
    for (const file of files('meta')) {
      for (const spec of imports(file)) {
        const ok = spec.startsWith('./') || spec.startsWith('../content/') || spec.startsWith('../core/') || spec === '@owl/kit/rng';
        expect(ok, `${file} importe ${spec}`).toBe(true);
      }
    }
  });

  it('content n\'importe ni le rendu ni l\'interface', () => {
    for (const file of files('content')) {
      for (const spec of imports(file)) {
        expect(/pixi|preact|\.\.\/(render|ui|app|audio)\//.test(spec), `${file} importe ${spec}`).toBe(false);
      }
    }
  });

  it('aucun hasard ni temps réel hors du générateur dans core et meta', () => {
    for (const file of [...files('core'), ...files('meta')]) {
      const text = readFileSync(file, 'utf8');
      expect(/Math\.random|Date\.now|performance\.now|\bwindow\.|\bdocument\./.test(text), file).toBe(false);
    }
  });

  it('le jeu n\'importe jamais l\'éditeur de texte (outil de développement)', () => {
    for (const dir of ['core', 'meta', 'content', 'render', 'ui', 'audio', 'app']) {
      for (const file of sourceFiles(join(src, dir))) {
        for (const spec of imports(file)) expect(spec.includes('editor'), `${file} importe ${spec}`).toBe(false);
      }
    }
  });

  it('window.OwlHost n\'est lu que dans le kit', () => {
    for (const dir of ['core', 'meta', 'content', 'render', 'ui', 'audio', 'app']) {
      let list: string[] = [];
      try {
        list = readdirSync(join(src, dir)).filter((f) => /\.tsx?$/.test(f)).map((f) => join(src, dir, f));
      } catch {
        continue;
      }
      for (const file of list) expect(readFileSync(file, 'utf8').includes('OwlHost'), file).toBe(false);
    }
  });
});
