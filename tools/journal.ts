/**
 * Résume le journal des parties, joueur et robots côte à côte.
 * Usage : pnpm journal                       (docs/journal/parties.jsonl et docs/journal/robot.jsonl s'ils existent)
 *         pnpm journal -- a.jsonl b.jsonl    (d'autres fichiers)
 * Filtres : --region marsh (morceau de l'identifiant) · --level 10-14 (niveau du héros) · --since 2026-11-28
 *           · --build bf50d34 · --assisted (garde aussi les parties où un outil a joué).
 * Une ligne par source et par région : parties, boss atteint, victoires, mort médiane, tueurs, dégâts subis
 * par source, coups reçus et ruées par minute, et ce qui restait au boss quand le héros est tombé devant lui.
 */
import { existsSync, readFileSync } from 'node:fs';
import type { JournalEntry } from '../packages/braise/src/core/journal.ts';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const VALUED = new Set(['--region', '--level', '--since', '--build']);
const named = process.argv.slice(2).filter((a, i, all) => a.endsWith('.jsonl') && !VALUED.has(all[i - 1] ?? ''));
const files = named.length > 0 ? named : ['docs/journal/parties.jsonl', 'docs/journal/robot.jsonl'].filter((f) => existsSync(f));
if (files.length === 0) {
  console.log('Aucun journal : jouez une partie avec `pnpm dev`, ou lancez `pnpm sim -- --journal docs/journal/robot.jsonl`.');
  process.exit(0);
}

const region = arg('region', '');
const [lo, hi] = arg('level', '1-999').split('-').map(Number);
const since = arg('since', '');
const build = arg('build', '');
const withAssisted = process.argv.includes('--assisted');

const all: JournalEntry[] = [];
for (const file of files) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.trim() === '') continue;
    try {
      all.push(JSON.parse(line) as JournalEntry);
    } catch {
      console.warn(`${file} : une ligne illisible ignorée`);
    }
  }
}
const kept = all.filter((e) => (withAssisted || !e.assisted)
  && (region === '' || e.region.includes(region))
  && e.heroLevel >= (lo ?? 1) && e.heroLevel <= (hi ?? lo ?? 999)
  && (since === '' || e.date >= since)
  && (build === '' || e.build.startsWith(build)));

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pct = (n: number, d: number): string => (d === 0 ? '-' : `${Math.round((100 * n) / d)} %`);
const median = (xs: number[]): number => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.floor(s.length / 2)]!;
};
const short = (id: string): string => id.split('.').slice(1).join('.') || id;
function top(counts: Map<string, number>, total: number, n: number): string {
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${short(k)} ${pct(v, total)}`).join(' · ') || '-';
}

const groups = new Map<string, JournalEntry[]>();
for (const e of kept) {
  const key = `${e.source} · ${short(e.region)}`;
  groups.set(key, [...(groups.get(key) ?? []), e]);
}

console.log(`${kept.length} parties retenues sur ${all.length} (${files.join(', ')})${withAssisted ? '' : ', sans les parties assistées'}\n`);
for (const [key, list] of Array.from(groups.entries()).sort()) {
  const n = list.length;
  const levels = list.map((e) => e.heroLevel);
  const boss = list.filter((e) => e.boss !== null);
  const wins = list.filter((e) => e.outcome === 'victory');
  const deaths = list.filter((e) => e.outcome !== 'victory');
  const killers = new Map<string, number>();
  for (const e of deaths) killers.set(e.killer ?? (e.outcome === 'abandon' ? '(abandon)' : '(autre)'), (killers.get(e.killer ?? (e.outcome === 'abandon' ? '(abandon)' : '(autre)')) ?? 0) + 1);
  const hurtBy = new Map<string, number>();
  let hurt = 0;
  let minutes = 0;
  let hits = 0;
  let dashes = 0;
  for (const e of list) {
    for (const [k, v] of Object.entries(e.hurtBy)) hurtBy.set(k, (hurtBy.get(k) ?? 0) + v);
    hurt += e.hurt;
    minutes += e.seconds / 60;
    hits += e.hits;
    dashes += e.actions.dashes;
  }
  const lost = boss.filter((e) => e.outcome !== 'victory' && e.boss!.hpMax > 0).map((e) => e.boss!.hpLeft / e.boss!.hpMax);
  const bossHurt = new Map<string, number>();
  let bossHurtTotal = 0;
  for (const e of boss) for (const [k, v] of Object.entries(e.boss!.hurtBy)) {
    bossHurt.set(k, (bossHurt.get(k) ?? 0) + v);
    bossHurtTotal += v;
  }
  console.log(`${key} — ${n} parties, héros niveau ${Math.min(...levels)}${Math.max(...levels) > Math.min(...levels) ? `-${Math.max(...levels)}` : ''}`);
  console.log(`  boss atteint ${pct(boss.length, n)} · victoires ${pct(wins.length, n)} · fin médiane ${fmt(median(list.map((e) => e.seconds)))}`
    + (deaths.length ? ` · mort médiane ${fmt(median(deaths.map((e) => e.seconds)))}` : ''));
  console.log(`  tué par : ${top(killers, deaths.length, 4)}`);
  console.log(`  dégâts subis : ${top(hurtBy, hurt, 5)}`);
  console.log(`  par minute : ${(hits / minutes).toFixed(1)} coups reçus · ${Math.round(hurt / minutes)} dégâts · ${(dashes / minutes).toFixed(1)} ruées`);
  if (boss.length) {
    console.log(`  boss : combat gagné en ${wins.length ? fmt(median(wins.map((e) => e.boss!.seconds))) : '-'}`
      + ` · PV du héros à l'arrivée ${Math.round(median(boss.map((e) => e.boss!.heroHpStart)))}`
      + (lost.length ? ` · perdu avec ${Math.round(100 * median(lost))} % de PV au boss (médiane)` : '')
      + ` · dégâts : ${top(bossHurt, bossHurtTotal, 4)}`);
  }
  console.log('');
}
