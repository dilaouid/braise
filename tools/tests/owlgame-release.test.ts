import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { latestJson, owlManifest, OWL_UPDATE_URL } from '../owlgame-release';

describe('owlManifest', () => {
  it('ajoute build, builtAt et update sans changer le format', () => {
    const m = owlManifest({ version: '0.1.0', build: 'd7450e1+', builtAt: 1764348560 });
    expect(m).toMatchObject({
      format: 1, id: 'braise', title: 'Braise', version: '0.1.0', entry: 'index.html',
      orientation: 'landscape', saves: true, build: 'd7450e1+', builtAt: 1764348560, update: OWL_UPDATE_URL,
    });
    expect(OWL_UPDATE_URL).toBe('https://braise.dilaouid.fr/owl/latest.json');
  });
});

describe('latestJson', () => {
  it('donne la taille, l’empreinte et une adresse qui change à chaque build', () => {
    const bytes = new TextEncoder().encode('paquet');
    const l = latestJson({ build: 'd7450e1+', builtAt: 1764348560, bytes });
    expect(l).toEqual({
      format: 1, id: 'braise', build: 'd7450e1+', builtAt: 1764348560, size: 6,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      url: 'Braise.owlgame?b=d7450e1%2B',
    });
  });
});
