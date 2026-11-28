import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assertPublishable, latestJson, owlManifest, OWL_UPDATE_URL, packageBuiltAt } from '../owlgame-release';

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
  it('donne la taille, l’empreinte et une adresse qui change avec le contenu', () => {
    const bytes = new TextEncoder().encode('paquet');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const l = latestJson({ build: 'd7450e1+', builtAt: 1764348560, bytes });
    expect(l).toEqual({
      format: 1, id: 'braise', build: 'd7450e1+', builtAt: 1764348560, size: 6, sha256,
      url: `Braise.owlgame?h=${sha256.slice(0, 16)}`,
    });
  });

  it('change d’adresse quand un même commit est réemballé avec d’autres octets', () => {
    const a = latestJson({ build: 'd7450e1', builtAt: 1, bytes: new TextEncoder().encode('a') });
    const b = latestJson({ build: 'd7450e1', builtAt: 1, bytes: new TextEncoder().encode('b') });
    expect(a.url).not.toBe(b.url);
  });
});

describe('packageBuiltAt', () => {
  it('garde la date du commit pour le site', () => {
    expect(packageBuiltAt({ commitTime: 100, now: 500, site: true })).toBe(100);
  });

  it('date un paquet local de sa fabrication, pour qu’un push plus ancien ne l’écrase pas', () => {
    expect(packageBuiltAt({ commitTime: 100, now: 500, site: false })).toBe(500);
    expect(packageBuiltAt({ commitTime: 900, now: 500, site: false })).toBe(900);
  });
});

describe('assertPublishable', () => {
  it('refuse de publier un paquet sans commit ni date', () => {
    expect(() => assertPublishable({ build: '?', builtAt: 1764348560 })).toThrow();
    expect(() => assertPublishable({ build: 'd7450e1', builtAt: 0 })).toThrow();
    expect(() => assertPublishable({ build: 'd7450e1', builtAt: 1764348560 })).not.toThrow();
  });
});
