// Leash engine as its own HTTP service (decoupled from the app, as Viseca recommends).
// Two roles with separate keys: the customer (app) may change the leash, the agent may only ask.
import http from 'node:http';
import { PolicyError } from './policy.js';
import { ENGINE_VERSION } from './evaluate.js';

const CUSTOMER_ONLY = 'Nur der Kunde darf die Leine ändern. Der Agent kann nur anfragen.';

export function createLeashService({ store, customerKey, agentKey }) {
  const roleOf = (req) => {
    const h = req.headers.authorization ?? '';
    const key = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (key && key === customerKey) return 'customer';
    if (key && key === agentKey) return 'agent';
    return null;
  };

  async function body(req) {
    const chunks = [];
    let size = 0;
    for await (const c of req) { size += c.length; if (size > 256_000) throw new PolicyError('Anfrage zu gross', 413); chunks.push(c); }
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new PolicyError('Ungültiges JSON'); }
  }
  const send = (res, status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };

  // [method, regex, roles, handler]
  const routes = [
    ['GET', /^\/healthz$/, null, () => ({ ok: true, engine: ENGINE_VERSION })],
    ['POST', /^\/v1\/mandates$/, ['customer'], (m, b) => store.createDraft(b)],
    ['POST', /^\/v1\/mandates\/([^/]+)\/confirm$/, ['customer'], ([id], b) => store.confirmDraft(id, b)],
    ['GET', /^\/v1\/mandates\/active$/, ['customer', 'agent'], () => ({ mandate: store.activeMandate() ?? store.latestMandate() })],
    ['GET', /^\/v1\/mandates\/([^/]+)$/, ['customer', 'agent'], ([id]) => store.getMandate(id)],
    ['PATCH', /^\/v1\/mandates\/([^/]+)$/, ['customer'], ([id], b) => store.updateMandate(id, b, { customerConfirmed: b?.customer_confirmed === true })],
    ['POST', /^\/v1\/mandates\/([^/]+)\/pause$/, ['customer'], ([id]) => store.setStatus(id, 'paused')],
    ['POST', /^\/v1\/mandates\/([^/]+)\/resume$/, ['customer'], ([id]) => store.setStatus(id, 'active')],
    ['DELETE', /^\/v1\/mandates\/([^/]+)$/, ['customer'], ([id]) => store.setStatus(id, 'revoked')],
    ['GET', /^\/v1\/mandates\/([^/]+)\/summary$/, ['customer', 'agent'], ([id]) => store.summary(id)],
    ['POST', /^\/v1\/authorizations$/, ['agent'], (m, b) => store.authorize(b)],
    ['GET', /^\/v1\/authorizations$/, ['customer'], (m, b, url) => store.list(url.searchParams.get('mandate_id'))],
    ['GET', /^\/v1\/authorizations\/([^/]+)$/, ['customer', 'agent'], ([id]) => store.get(id) ?? (() => { throw new PolicyError('Nicht gefunden', 404); })()],
    ['POST', /^\/v1\/authorizations\/([^/]+)\/resolve$/, ['customer'], ([id], b) => store.resolve(id, b)],
    ['POST', /^\/v1\/authorizations\/([^/]+)\/void$/, ['agent'], ([id], b) => store.voidAuthorization(id, b?.reason)],
    ['POST', /^\/v1\/authorizations\/([^/]+)\/booked$/, ['agent'], ([id], b) => store.markBooked(id, b)],
    ['GET', /^\/v1\/events$/, ['customer'], (m, b, url) => ({ events: store.events(Number(url.searchParams.get('since') ?? 0)) })],
    ['POST', /^\/v1\/reset$/, ['customer'], () => { store.reset(); return { ok: true }; }],
  ];

  async function handle(req, res) {
    const url = new URL(req.url, 'http://leash.local');
    try {
      if (req.method === 'GET' && url.pathname === '/v1/stream') {
        if (roleOf(req) !== 'customer') throw new PolicyError('Nicht berechtigt', 401);
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        const since = Number(url.searchParams.get('since') ?? 0);
        for (const ev of store.events(since)) res.write(`data: ${JSON.stringify(ev)}\n\n`);
        const off = store.subscribe(ev => res.write(`data: ${JSON.stringify(ev)}\n\n`));
        const ping = setInterval(() => res.write(': ping\n\n'), 15000);
        req.on('close', () => { off(); clearInterval(ping); });
        return;
      }
      for (const [method, re, roles, fn] of routes) {
        if (req.method !== method) continue;
        const match = url.pathname.match(re);
        if (!match) continue;
        if (roles) {
          const role = roleOf(req);
          if (!role) throw new PolicyError('Nicht berechtigt', 401);
          if (!roles.includes(role)) throw new PolicyError(role === 'agent' ? CUSTOMER_ONLY : 'Rolle nicht erlaubt', 403);
        }
        const b = ['POST', 'PATCH', 'PUT'].includes(method) ? await body(req) : {};
        const out = await fn(match.slice(1).map(decodeURIComponent), b, url);
        return send(res, 200, out);
      }
      throw new PolicyError('Unbekannter Pfad', 404);
    } catch (e) {
      const status = e instanceof PolicyError ? e.status : 500;
      if (status === 500) console.error('[leash]', e);
      send(res, status, { error: { message: e.message, ...(e.details ?? {}) } });
    }
  }

  return { handle, server: () => http.createServer(handle) };
}
