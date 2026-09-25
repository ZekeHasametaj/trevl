// The leash engine on its own, e.g. on another machine. The app then points LEASH_URL, LEASH_CUSTOMER_KEY
// and LEASH_AGENT_KEY at it. Usage: npm run leash (reads .env; port LEASH_PORT, default 4311).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createLeashStore } from './store.js';
import { createLeashService } from './service.js';
import { ENGINE_VERSION } from './evaluate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.LEASH_PORT || 4311);
const HOST = process.env.LEASH_HOST || '127.0.0.1';
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');
const customerKey = process.env.LEASH_CUSTOMER_KEY || crypto.randomBytes(18).toString('hex');
const agentKey = process.env.LEASH_AGENT_KEY || crypto.randomBytes(18).toString('hex');

const store = createLeashStore({ file: path.join(DATA_DIR, 'leash-state.json'), familiarSeed: ['ME-HOTEL-MIRADOURO-DIRECT'] });
const service = createLeashService({ store, customerKey, agentKey });
service.server().listen(PORT, HOST, () => {
  console.log(`Leine (Engine) http://${HOST}:${PORT}  ${ENGINE_VERSION}`);
  // Generated keys only live as long as this process: print them so the app can be configured.
  if (!process.env.LEASH_CUSTOMER_KEY) console.log(`  LEASH_CUSTOMER_KEY=${customerKey}`);
  if (!process.env.LEASH_AGENT_KEY) console.log(`  LEASH_AGENT_KEY=${agentKey}`);
});
setInterval(() => store.sweep(), 1000).unref();
const flush = () => { try { store.flush(); } catch { /* ignore */ } process.exit(0); };
process.on('SIGINT', flush);
process.on('SIGTERM', flush);
