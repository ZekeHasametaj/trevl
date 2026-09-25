// Writes docs/viseca-replay.md: Viseca's 5 public scenarios (45 purchases) through the trevl leash engine.
// Usage: node scripts/viseca-replay.mjs [path/to/viseca-2026/data]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runVisecaReplay, visecaDataAvailable } from '../server/app/viseca.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.argv[2] ?? process.env.VISECA_DATA ?? [path.join(ROOT, 'ref', 'data'), path.join(ROOT, '..', 'ref', 'data')].find(d => fs.existsSync(d)) ?? path.join(ROOT, 'ref', 'data');
if (!visecaDataAvailable(DATA)) {
  console.error(`Viseca-Daten nicht gefunden unter ${DATA}.\nHolen: git submodule update --init (oder git clone https://github.com/Swiss-ai-Weeks/viseca-2026 ref).`);
  process.exit(1);
}
const r = runVisecaReplay(DATA);
const LABEL = { approve: '✅ approve', decline: '⛔ decline', step_up: '❓ step_up' };
const out = ['# trevl-Leine gegen Visecas öffentliche Szenarien', '',
  `Erzeugt am ${new Date().toISOString().slice(0, 16).replace('T', ' ')} mit \`node scripts/viseca-replay.mjs\`.`,
  'Dieselbe Engine wie in der App. Keine Antwortschlüssel (Viseca liefert keine), keine Sonderregeln pro Szenario.',
  'Zeit = simulierte Kaufzeit; Rückfragen ohne Antwort laufen nach 120 s ab und zählen nicht als Ausgabe.', '',
  `**Ergebnis:** ${r.totals.approve} × approve · ${r.totals.decline} × decline · ${r.totals.step_up} × step_up · langsamster Entscheid ${r.max_latency_ms.toFixed(2)} ms (Viseca-Frist: 8 s).`, ''];
for (const sc of r.scenarios) {
  out.push(`## ${sc.id} · ${sc.name}`, '', `> ${sc.instruction}`, '', `Bestätigte Regeln: ${sc.rules.join(' · ')} · bei Unsicherheit: fragen`, '',
    `Bekannte Shops aus dem Verlauf: ${sc.familiar_shops} · bekannte Geräte: ${sc.familiar_devices}`, '',
    '| # | Zeit | Shop | Betrag | Entscheid | Gründe | Erklärung |', '|---|---|---|---|---|---|---|');
  for (const x of sc.rows) out.push(`| ${x.order} | ${x.timestamp.slice(5, 16).replace('T', ' ')} | ${x.merchant} | ${x.currency} ${x.amount.toFixed(2)} | ${LABEL[x.decision]} | ${x.reason_codes.join(', ')} | ${x.summary.replace(/\|/g, '/')} |`);
  out.push('');
}
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'viseca-replay.md'), out.join('\n'));
console.log(`${r.count} Käufe · ${r.totals.approve} approve · ${r.totals.decline} decline · ${r.totals.step_up} step_up · max ${r.max_latency_ms.toFixed(2)} ms → docs/viseca-replay.md`);
