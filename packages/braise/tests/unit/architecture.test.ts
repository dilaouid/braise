import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = join(__dirname, '..', '..', 'src');

function files(dir: string): string[] {
  return readdirSync(join(src, dir)).filter((f) => f.endsWith('.ts')).map((f) => join(src, dir, f));
}

function imports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return Array.from(text.matchAll(/from\s+'([^']+)'/g)).map((m) => m[1]!);
}

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
      const list = readdirSync(join(src, dir)).filter((f) => /\.tsx?$/.test(f)).map((f) => join(src, dir, f));
      for (const file of list) {
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
