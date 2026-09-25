// Turns a Claude Code session transcript (JSONL, from the app's "Export") into readable Markdown for the repo.
// Secrets never leave: every value from .env, API-key patterns, e-mail addresses, UUIDs and local paths are removed.
// Usage: node scripts/export-chat.mjs <transcript.jsonl> <out-dir> <file-prefix> "<Titel>"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [input, outDir, prefix, title] = process.argv.slice(2);
if (!input || !outDir || !prefix) { console.error('Usage: node scripts/export-chat.mjs <transcript.jsonl> <out-dir> <file-prefix> "<Titel>"'); process.exit(1); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_IO = 2500;          // characters shown per tool input / tool result
const MAX_FILE = 450_000;     // split long chats so GitHub still renders each part

// 1. Redaction.
const secrets = [];
const replacements = []; // from the local, gitignored .redact: "text" (removed) or "text => replacement" (e.g. full names)
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const v = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
    if (line.includes('=') && v.length >= 8 && !/^(127\.0\.0\.1|0\.0\.0\.0|liteapi|on|off)$/.test(v)) secrets.push(v);
  }
}
const redactFile = path.join(ROOT, '.redact');
if (fs.existsSync(redactFile)) {
  for (const line of fs.readFileSync(redactFile, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [from, to] = line.split(' => ');
    if (to !== undefined) replacements.push([from.trim(), to.trim()]); else if (from.trim().length >= 3) secrets.push(from.trim());
  }
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = [
  // Also when only a few characters follow ("duffel_test_abcd…" in a summary).
  [/duffel_(test|live)_[A-Za-z0-9_-]+…?/g, 'duffel_$1_[ENTFERNT]'],
  [/\bsand_[A-Za-z0-9-]{3,}…?/g, 'sand_[ENTFERNT]'],
  [/\bprod_[A-Za-z0-9-]{3,}…?/g, 'prod_[ENTFERNT]'],
  [/sk-ant-[A-Za-z0-9_-]{3,}…?/g, 'sk-ant-[ENTFERNT]'],
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, '[GITHUB-TOKEN ENTFERNT]'],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[TOKEN ENTFERNT]'],
  [/(Bearer\s+)(?!\$\{)[A-Za-z0-9._~+/=-]{16,}/g, '$1[ENTFERNT]'],
  // Local paths: the session's working folder, the user's home folder.
  [/[A-Za-z]:(?:\\+|\/)Users(?:\\+|\/)[^\\/\s"'`]+(?:\\+|\/)AppData(?:\\+|\/)Roaming(?:\\+|\/)Claude(?:\\+|\/)scratch-workspaces(?:(?:\\+|\/)[^\\/\s"'`]+){1,3}/gi, '<arbeitsordner>'],
  [/[A-Za-z]:(?:\\+|\/)Users(?:\\+|\/)[^\\/\s"'`]+(?:\\+|\/)AppData(?:\\+|\/)Local(?:\\+|\/)Temp(?:\\+|\/)claude(?:\\+|\/)[^\\/\s"'`]+(?:(?:\\+|\/)[^\\/\s"'`]+){2}/gi, '<notizordner>'],
  [/C--Users-[A-Za-z0-9._-]*…?/g, '<projekt-id>'],
  [/(?:[A-Za-z]:|\/[a-z])(?:\\+|\/)Users(?:\\+|\/)[^\\/\s"'`]+/g, '~'],
  [/\\+Users\\+[^\\/\s"'`]+/g, '~'],
  // Shared chat links (they open someone's conversation) and Swiss mobile numbers.
  [/https?:\/\/(?:chatgpt\.com|chat\.openai\.com|claude\.ai)\/(?:s|share)\/[A-Za-z0-9_-]+/g, '[CHAT-LINK ENTFERNT]'],
  [/(?:chatgpt\.com|chat\.openai\.com)\/(?:s|share)\/[A-Za-z0-9_-]+/g, '[CHAT-LINK ENTFERNT]'],
  [/(?:\+41|\b0)[ -]?7[5-9][ -]?\d{3}[ -]?\d{2}[ -]?\d{2}\b/g, '[TELEFON]'],
  // IDs last, so folder names above are replaced as a whole. No \b: "local_<uuid>" must match too.
  [/(?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f])/gi, '[ID]'],
];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_OK = /@(example\.(com|org)|anthropic\.com)$/i;
function redact(s) {
  let out = String(s);
  for (const v of secrets) out = out.replace(new RegExp(esc(v), 'g'), '[ENTFERNT]');
  for (const [from, to] of replacements) out = out.replace(new RegExp(esc(from), 'g'), to);
  // App-internal markers, also when a shortened tool result cut off the closing tag.
  out = out.replace(/<artifact-content-authored-by-others\/>/g, '').replace(/<system-reminder>[\s\S]*?(<\/system-reminder>|(?=\n```))/g, '');
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out.replace(EMAIL, (m) => (EMAIL_OK.test(m) ? m : '[E-MAIL]'));
}

// 2. Cleaning: the app's hidden context blocks are not part of the conversation.
function clean(text) {
  let t = String(text ?? '');
  t = t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  t = t.replace(/<artifact-view-context[^>]*>[\s\S]*?<\/artifact-view-context>/g, '*(Das Pitch-Deck war dabei geöffnet.)*');
  const cmd = t.indexOf('<command-message>');
  if (cmd >= 0) { const name = t.match(/<command-name>([^<]*)<\/command-name>/)?.[1]; t = t.slice(0, cmd) + (name ? `\n\n*(Skill geladen: ${name.trim()})*` : ''); }
  t = t.replace(/<pasted_content[^>]*>/g, '\n> **Eingefügter Text:**\n').replace(/<\/pasted_content[^>]*>/g, '\n');
  t = t.replace(/<(task-notification|local-command-stdout|local-command-stderr)>[\s\S]*?<\/\1>/g, '');
  return t.trim();
}
const clip = (s, n = MAX_IO) => (s.length > n ? `${s.slice(0, n)}\n… (${s.length - n} Zeichen gekürzt)` : s);
const fence = (s) => { const ticks = s.includes('```') ? '````' : '```'; return `${ticks}\n${s}\n${ticks}`; };
function toolLabel(name, inp = {}) {
  const d = inp.description ?? inp.prompt?.slice?.(0, 80) ?? inp.file_path ?? inp.pattern ?? inp.url ?? inp.query ?? (inp.command ? String(inp.command).split('\n')[0].slice(0, 100) : '');
  return `${name}${d ? ` – ${String(d).replace(/\s+/g, ' ')}` : ''}`;
}
function resultText(c) {
  const strip = (x) => String(x).replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
  if (typeof c === 'string') return strip(c);
  if (!Array.isArray(c)) return JSON.stringify(c ?? '');
  return strip(c.map(b => (b.type === 'text' ? b.text : b.type === 'image' ? '[Bild]' : `[${b.type}]`)).join('\n'));
}

// 3. Walk the transcript.
const rows = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const imgDir = path.join(outDir, 'bilder');
const parts = [];
let cur = [];
let size = 0;
const tools = new Map();
let imgCount = 0, userCount = 0, claudeCount = 0, toolCount = 0, cronCount = 0;
const push = (s) => { cur.push(s); size += s.length; };
const newPart = () => { if (cur.length) parts.push(cur); cur = []; size = 0; };

for (const o of rows) {
  if (o.isSidechain) continue;
  if (o.type === 'system' && o.subtype === 'compact_boundary') { newPart(); continue; }
  // Messages the user sent while Claude was still working.
  if (o.type === 'attachment' && o.attachment?.type === 'queued_command' && o.attachment.prompt) {
    const p = o.attachment.prompt;
    const text = clean(typeof p === 'string' ? p : Array.isArray(p) ? p.filter(b => b.type === 'text').map(b => b.text).join('\n') : '');
    if (text) { userCount++; push(`\n---\n\n### 👤 User, während Claude arbeitete (${o.timestamp ? new Date(o.timestamp).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : ''})\n\n${text}\n`); }
    continue;
  }
  if (o.type !== 'user' && o.type !== 'assistant') continue;
  const content = o.message?.content;
  const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : [];
  // Hidden rows are app context (skill texts …), except the scheduled 10-minute checks the user asked for.
  if (o.isMeta && !blocks.some(b => b.type === 'text' && /^\s*10-Minuten-Check/.test(clean(b.text)))) continue;
  const time = o.timestamp ? new Date(o.timestamp).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '';

  if (o.type === 'user') {
    if (o.isCompactSummary) {
      const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n');
      push(`\n---\n\n## 🗜️ Kontext komprimiert (${time})\n\nDer Chat wurde hier für Claude zusammengefasst. Die Zusammenfassung, mit der es weiterging:\n\n<details><summary>Zusammenfassung anzeigen</summary>\n\n${fence(clip(text, 60_000))}\n\n</details>\n`);
      continue;
    }
    for (const b of blocks) {
      if (b.type === 'tool_result') {
        const t = tools.get(b.tool_use_id);
        if (t) t.result = resultText(b.content);
      }
    }
    const texts = blocks.filter(b => b.type === 'text').map(b => clean(b.text)).filter(Boolean);
    const images = blocks.filter(b => b.type === 'image' && b.source?.type === 'base64');
    if (!texts.length && !images.length) continue;
    const text = texts.join('\n\n');
    if (/^10-Minuten-Check/.test(text)) {
      cronCount++;
      push(`\n#### ⏰ Automatischer 10-Minuten-Check (${time})\n${cronCount === 1 ? `\n> ${text.replace(/\n/g, '\n> ')}\n` : ''}`);
      continue;
    }
    userCount++;
    let md = `\n---\n\n### 👤 User (${time})\n\n${text}\n`;
    for (const im of images) {
      fs.mkdirSync(imgDir, { recursive: true });
      const ext = (im.source.media_type ?? 'image/png').split('/')[1].replace('jpeg', 'jpg');
      const name = `${prefix}-${String(++imgCount).padStart(2, '0')}.${ext}`;
      fs.writeFileSync(path.join(imgDir, name), Buffer.from(im.source.data, 'base64'));
      md += `\n![Screenshot vom User](bilder/${name})\n`;
    }
    push(md);
    continue;
  }

  // assistant
  for (const b of blocks) {
    if (b.type === 'text' && b.text.trim()) { claudeCount++; push(`\n**🤖 Claude:**\n\n${clean(b.text)}\n`); }
    if (b.type === 'tool_use') {
      toolCount++;
      const entry = { name: b.name, input: b.input, result: null };
      tools.set(b.id, entry);
      // Rendered lazily so the result (next user row) is included.
      push({ toString() {
        const inp = JSON.stringify(entry.input ?? {}, null, 2);
        return `\n<details><summary>🔧 ${toolLabel(entry.name, entry.input).replace(/</g, '&lt;')}</summary>\n\n**Eingabe**\n\n${fence(clip(inp))}\n\n**Ergebnis**\n\n${fence(clip(entry.result ?? '(kein Ergebnis)'))}\n\n</details>\n`;
      }, length: 1500 });
    }
  }
  if (size > MAX_FILE) newPart();
}
newPart();

// 4. Write parts.
fs.mkdirSync(outDir, { recursive: true });
const files = [];
parts.forEach((p, i) => {
  const name = parts.length === 1 ? `${prefix}.md` : `${prefix}-teil-${i + 1}.md`;
  const head = `# ${title ?? prefix}${parts.length > 1 ? ` – Teil ${i + 1} von ${parts.length}` : ''}\n\n` +
    `*Aus dem Claude-Code-Verlauf exportiert. Schlüssel, E-Mail-Adressen, IDs und lokale Pfade sind entfernt. ` +
    `Werkzeugaufrufe sind eingeklappt und auf ${MAX_IO} Zeichen gekürzt; Claudes interne Denkschritte sind nicht enthalten.*\n` +
    (parts.length > 1 ? `\n${parts.map((_, j) => (j === i ? `**Teil ${j + 1}**` : `[Teil ${j + 1}](${prefix}-teil-${j + 1}.md)`)).join(' · ')}\n` : '');
  fs.writeFileSync(path.join(outDir, name), redact(head + p.map(String).join('')));
  files.push(name);
});
console.log(JSON.stringify({ files, user: userCount, claude: claudeCount, tools: toolCount, cron: cronCount, images: imgCount, redactedValuesFromEnv: secrets.length }));
