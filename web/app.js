// trevl – phone web app. Plain ES module, no build step.
// The app never decides anything itself: it shows the leash's decisions and sends the customer's answers.

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- icons
const svg = (d, s = 18, extra = '') => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const I = {
  plane: (s) => svg('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>', s),
  bed: (s) => svg('<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/>', s),
  car: (s) => svg('<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>', s),
  ticket: (s) => svg('<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>', s),
  shield: (s) => svg('<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/>', s),
  check: (s) => svg('<path d="M20 6 9 17l-5-5"/>', s, 'stroke-width="2.6"'),
  x: (s) => svg('<path d="M18 6 6 18M6 6l12 12"/>', s, 'stroke-width="2.6"'),
  q: (s) => svg('<path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>', s, 'stroke-width="2.6"'),
  leash: (s) => svg('<circle cx="6" cy="18" r="3"/><path d="M8.5 16.5c3-3 2-8 6-10.5 2.5-1.5 5.5-.5 6.5 1"/><circle cx="19" cy="7" r="1.5" fill="currentColor"/>', s),
  wallet: (s) => svg('<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>', s),
  list: (s) => svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', s),
  map: (s) => svg('<path d="M14.1 6 9.9 4 3 6.7v13.3l6.9-2.7 4.2 2L21 17.3V4z"/><path d="M9.9 4v13.3M14.1 6v13.3"/>', s),
  mic: (s) => svg('<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>', s),
  spark: (s) => svg('<path d="M12 3 13.9 8.1 19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M21 5h-4"/>', s),
  lock: (s) => svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', s),
  pause: (s) => svg('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>', s),
  play: (s) => svg('<path d="m6 3 14 9-14 9z"/>', s),
  scissors: (s) => svg('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>', s),
  minus: (s) => svg('<path d="M5 12h14"/>', s),
  unlock: (s) => svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>', s),
  warn: (s) => svg('<path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4M12 17h.01"/>', s),
  info: (s) => svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>', s),
  users: (s) => svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>', s),
  cal: (s) => svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', s),
  coin: (s) => svg('<circle cx="12" cy="12" r="9"/><path d="M14.8 9A2 2 0 0 0 13 8h-2a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-1.8-1M12 6v2m0 8v2"/>', s),
  pin: (s) => svg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>', s),
  store: (s) => svg('<path d="m2 7 4.4-4.4A2 2 0 0 1 7.8 2h8.4a2 2 0 0 1 1.4.6L22 7M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M2 7h20v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-2-1 2.7 2.7 0 0 1-2 1 2.7 2.7 0 0 1-2-1 2.7 2.7 0 0 1-2 1 2.7 2.7 0 0 1-2-1 2.7 2.7 0 0 1-2 1 2 2 0 0 1-2-2z"/>', s),
  plus: (s) => svg('<path d="M12 5v14M5 12h14"/>', s),
  back: (s) => svg('<path d="m15 18-6-6 6-6"/>', s),
  chev: (s) => svg('<path d="m9 18 6-6-6-6"/>', s),
  download: (s) => svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>', s),
  bolt: (s) => svg('<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>', s),
  eye: (s) => svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', s),
  refresh: (s) => svg('<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>', s),
};
const KIND_ICON = { flight: I.plane, hotel: I.bed, transfer: I.car, activity: I.ticket };
const KIND_LABEL = { flight: 'Flug', hotel: 'Hotel', transfer: 'Transfer', activity: 'Aktivität' };
const RULE_ICON = { budget_total: I.wallet, budget_purchase: I.coin, per_night: I.bed, destination: I.pin, dates_start: I.cal, dates_end: I.cal, travelers: I.users,
  cancellable: I.refresh, no_extras: I.minus, bags: I.ticket, direct: I.plane, stars: I.spark, cabin: I.plane, categories: I.list, merchant_trust: I.store, valid_until: I.lock };
const DEC_ICON = { approve: I.check, decline: I.x, step_up: I.q };
const UNC = { ask: 'Mich fragen', decline: 'Ablehnen', approve: 'Selbst entscheiden' };
const STRICT = { approve: 0, ask: 1, decline: 2 };
const FX = { CHF: 1, EUR: 0.95, GBP: 1.12, USD: 0.87 };

// ---------------------------------------------------------------- formatting
function money(n, cur = 'CHF', { cents = true } = {}) {
  if (n == null || !Number.isFinite(n)) return `${cur} ?`;
  const [w, f] = Math.abs(n).toFixed(2).split('.');
  const g = w.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${n < 0 ? '-' : ''}${cur} ${g}${cents && f !== '00' ? '.' + f : cents ? '.–' : ''}`;
}
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MO = ['Jan', 'Feb', 'März', 'Apr', 'Mai', 'Juni', 'Juli', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
function day(iso) { if (!iso) return '?'; const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`); return `${WD[d.getUTCDay()]}, ${d.getUTCDate()}. ${MO[d.getUTCMonth()]}`; }
function range(a, b) { if (!a) return '?'; if (!b || a === b) return day(a); const A = new Date(`${a}T12:00:00Z`), B = new Date(`${b}T12:00:00Z`); return A.getUTCMonth() === B.getUTCMonth() ? `${A.getUTCDate()}.–${B.getUTCDate()}. ${MO[B.getUTCMonth()]}` : `${day(a)} – ${day(b)}`; }
const hhmm = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// ---------------------------------------------------------------- state + api
const S = {
  config: {}, view: 'welcome', text: '', answers: {}, draft: null, unc: null, compiling: false,
  mandate: null, summary: null, auths: [], authMap: {}, agent: {}, feed: [], wire: [], seen: new Set(), attacks: [],
  pushId: null, sheet: null, busy: false,
};
async function api(method, path, body) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j?.error?.message ?? `Fehler ${r.status}`); e.status = r.status; e.body = j; throw e; }
  return j;
}
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms); }
function faceId() {
  return new Promise(res => {
    const f = $('#faceid'); f.hidden = false; f.classList.remove('done'); $('.faceid-text', f).textContent = 'Face ID';
    setTimeout(() => { f.classList.add('done'); $('.faceid-text', f).textContent = 'Bestätigt'; }, 750);
    setTimeout(() => { f.hidden = true; res(true); }, 1150);
  });
}

async function refresh() {
  try {
    const [{ mandate }, agent] = await Promise.all([api('GET', '/api/leash/mandates/active'), api('GET', '/api/agent/state')]);
    S.mandate = mandate; S.agent = agent;
    if (mandate) {
      const [auths, summary] = await Promise.all([api('GET', `/api/leash/authorizations?mandate_id=${mandate.mandate_id}`), api('GET', `/api/leash/mandates/${mandate.mandate_id}/summary`)]);
      S.auths = auths; S.summary = summary; S.authMap = Object.fromEntries(auths.map(a => [a.authorization_id, a]));
    } else { S.auths = []; S.summary = null; S.authMap = {}; }
  } catch (e) { console.warn(e); }
}
let refreshTimer = null;
function softRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(async () => { await refresh(); render(); }, 120); }

// ---------------------------------------------------------------- rendering
function render() {
  const screen = $('#screen');
  const nearBottom = screen.scrollHeight - screen.scrollTop - screen.clientHeight < 140;
  const prevTop = screen.scrollTop;
  const views = { welcome: vWelcome, compose: vCompose, draft: vDraft, trip: vTrip, wallet: vWallet, leash: vLeash, log: vLog };
  screen.innerHTML = (views[S.view] ?? vWelcome)();
  const tabs = ['trip', 'wallet', 'leash', 'log'];
  const tb = $('#tabbar');
  tb.hidden = !tabs.includes(S.view);
  const pending = S.auths.filter(a => a.status === 'pending').length;
  tb.innerHTML = [['trip', I.map, 'Reise'], ['wallet', I.wallet, 'Reisekasse'], ['leash', I.leash, 'Leine'], ['log', I.list, 'Protokoll']]
    .map(([v, ic, l]) => `<button class="tab ${S.view === v ? 'on' : ''}" data-action="tab" data-v="${v}">${ic(22)}${l}${v === 'trip' && pending ? `<span class="badge">${pending}</span>` : ''}</button>`).join('');
  const changed = render.lastView !== S.view;
  render.lastView = S.view;
  screen.style.scrollBehavior = 'auto';
  if (S.view === 'trip') { if (nearBottom || render.jump || changed) screen.scrollTop = screen.scrollHeight; else screen.scrollTop = prevTop; }
  else if (changed) screen.scrollTop = 0;
  else screen.scrollTop = prevTop;
  screen.style.scrollBehavior = '';
  render.jump = false; render.keepScroll = false;
  for (const e of S.feed) S.seen.add(e.id);
  tickCountdowns();
  renderSides();
}

function topbar(right = '') {
  return `<div class="topbar"><div class="logo"><span class="logo-mark">${I.leash(18)}</span><span>trevl<b>.</b></span></div>${right}</div>`;
}
function statusPill() {
  const m = S.mandate;
  if (!m) return '';
  const st = m.status;
  return `<span class="pill ${st}"><span class="dot ${st === 'active' ? 'pulse' : ''}"></span>${st === 'active' ? `Leine aktiv · v${m.version}` : st === 'paused' ? 'Agent pausiert' : 'Leine gekappt'}</span>`;
}

// ----- Welcome
function vWelcome() {
  return `<div class="welcome">
    ${topbar()}
    <div class="hero-art">${heroArt()}</div>
    <div class="eyebrow">Dein Reiseagent an der Leine</div>
    <h1 class="h1">Der Agent bucht.<br><i>Du</i> hältst die Leine.</h1>
    <div class="bullets">
      <div class="bullet"><span class="ico">${I.spark(16)}</span><span>Beschreib deine Reise und deine Grenzen in eigenen Worten. trevl macht daraus klare Regeln.</span></div>
      <div class="bullet"><span class="ico">${I.shield(16)}</span><span>Jede Buchung wird geprüft: freigegeben, abgelehnt oder du wirst gefragt – immer mit Begründung.</span></div>
      <div class="bullet"><span class="ico">${I.scissors(16)}</span><span>Leine kürzen oder kappen, jederzeit. Der Agent kann sie nie selbst lockern.</span></div>
    </div>
    <div class="spacer"></div>
    <button class="btn btn-brand btn-block" data-action="go-compose">Reise planen</button>
    <p class="small" style="text-align:center;margin-top:10px">Prototyp · synthetische Daten · Flüge im Duffel-Testmodus, kein echtes Geld</p>
  </div>`;
}
function heroArt() {
  return `<svg viewBox="0 0 390 290" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD9C9"/><stop offset="1" stop-color="#F4F1EC"/></linearGradient></defs>
    <rect width="390" height="290" fill="url(#sky)"/>
    <circle cx="300" cy="92" r="46" fill="#FF7A5C" opacity=".85"/>
    <path d="M0 210 C60 180 110 196 160 186 C220 174 260 150 320 160 C350 165 372 176 390 182 V290 H0Z" fill="#E9DCCB"/>
    <path d="M0 236 C70 214 130 230 190 222 C250 214 300 200 390 214 V290 H0Z" fill="#DCCBB5"/>
    <g fill="#1C2640"><rect x="60" y="176" width="26" height="46" rx="2"/><rect x="92" y="160" width="20" height="62" rx="2"/><path d="M118 222 V150 l14-12 14 12 V222Z"/><rect x="152" y="182" width="30" height="40" rx="2"/><rect x="234" y="170" width="22" height="52" rx="2"/><rect x="262" y="186" width="34" height="36" rx="2"/></g>
    <g fill="#F4F1EC" opacity=".8"><rect x="66" y="184" width="5" height="6"/><rect x="76" y="184" width="5" height="6"/><rect x="97" y="170" width="4" height="6"/><rect x="104" y="170" width="4" height="6"/><rect x="126" y="162" width="5" height="7"/><rect x="158" y="190" width="5" height="6"/><rect x="168" y="190" width="5" height="6"/><rect x="240" y="180" width="4" height="6"/><rect x="268" y="194" width="5" height="6"/><rect x="280" y="194" width="5" height="6"/></g>
    <path d="M40 120 C120 70 200 140 270 60" fill="none" stroke="#1C2640" stroke-width="2" stroke-dasharray="3 7" stroke-linecap="round"/>
    <g transform="translate(262 50) rotate(-28)"><path d="M0 8 L28 0 L22 8 L28 16Z" fill="#1C2640"/><path d="M8 8 L2 -2 L6 -2 L16 8 L6 18 L2 18Z" fill="#FF5A36"/></g>
    <g transform="translate(40 120)"><circle r="9" fill="#1C2640"/><circle r="3.5" fill="#FF5A36"/></g>
  </svg>`;
}

// ----- Compose
const EXAMPLES = [
  "Lissabon vom 9. bis 12. Oktober zu zweit, alles zusammen max. CHF 1'500, Hotel kostenlos stornierbar, keine Extras, frag mich, wenn du unsicher bist.",
  'Barcelona im November mit meiner Freundin, Budget 1200 Franken, Hotel max 150 pro Nacht, mind. 4 Sterne, im Zweifel ablehnen.',
  'London 23.–26. Oktober, allein, bis CHF 1800, nur Direktflug mit Gepäck, keine Extras.',
];
function vCompose() {
  return `${topbar(S.mandate ? `<button class="pill" data-action="tab" data-v="trip">${I.back(14)} Zurück</button>` : '')}
    <div class="eyebrow">Neue Leine</div>
    <h1 class="h1">Wohin soll's gehen?</h1>
    <p class="lead">Beschreib Reise und Grenzen so, wie du es einer Freundin sagen würdest. trevl macht daraus Regeln, die der Agent nicht brechen kann.</p>
    <div class="composer">
      <textarea id="text" placeholder="z. B. Lissabon im Oktober, alles zusammen max. CHF 1'200, Hotel stornierbar, keine Extras, frag mich, wenn du unsicher bist." aria-label="Deine Reise in eigenen Worten">${esc(S.text)}</textarea>
      <div class="tools">
        <button class="mic ${S.listening ? 'on' : ''}" data-action="mic" title="Sprechen" aria-label="Sprechen">${I.mic(18)}</button>
        <span class="small">${S.listening ? 'Ich höre zu …' : 'Tippen oder sprechen'}</span>
        <span class="spacer"></span>
        <button class="btn btn-primary btn-sm" data-action="compile" ${S.compiling ? 'disabled' : ''}>${S.compiling ? 'Verstehe …' : `${I.spark(15)} Leine entwerfen`}</button>
      </div>
    </div>
    <div class="section-title"><span class="h3">Beispiele</span></div>
    <div class="chips">${EXAMPLES.map((e, i) => `<button class="chip example" data-action="example" data-i="${i}">${esc(e)}</button>`).join('')}</div>`;
}

// ----- Draft
function ruleRow(r) {
  const src = r.source?.quote ? `<span class="src quote">«${esc(r.source.quote)}»</span>` : r.source?.type === 'default' ? `<span class="src default">trevl-Schutz · Standard</span>` : r.source?.type === 'answer' ? `<span class="src default">deine Antwort</span>` : '';
  return `<div class="rule"><span class="ico">${(RULE_ICON[r.kind] ?? I.shield)(17)}</span><div class="txt"><div class="label">${esc(r.label)}</div>${src}</div></div>`;
}
function vDraft() {
  const d = S.draft;
  if (!d) return vCompose();
  const t = d.trip;
  const unc = S.unc ?? d.uncertainty_policy;
  const qs = d.open_questions ?? [];
  return `${topbar(`<button class="pill" data-action="go-compose">${I.back(14)} Text ändern</button>`)}
    <div class="eyebrow">Entwurf · noch nicht aktiv</div>
    <h1 class="h1">Deine Leine</h1>
    <p class="lead">So hat trevl dich verstanden${d.understood_by === 'model' ? ' (mit KI, von Regeln geprüft)' : ''}. Nichts gilt, bevor du bestätigst.</p>
    <div class="trip-card">
      <div class="deco">${I.plane(120)}</div>
      <div class="eyebrow">${esc(t.origin?.name ?? 'Zürich')} → </div>
      <div class="dest">${esc(t.destination?.name ?? 'Ziel offen')}</div>
      <div class="meta">${t.destination?.airport ? `<span>${esc(t.destination.country_name ?? '')} · ✈ ${esc(t.destination.airport.iata)}, ${t.destination.airport.distance_km} km</span>` : t.destination?.iata ? `<span>${esc(t.destination.iata)}${t.destination.country_name ? ` · ${esc(t.destination.country_name)}` : ''}</span>` : ''}<span>${t.start_date ? range(t.start_date, t.end_date) : 'Daten offen'}</span><span>${t.travelers} ${t.travelers === 1 ? 'Person' : 'Personen'}</span><span>${(t.kinds ?? []).map(k => KIND_LABEL[k]).join(' · ')}</span></div>
    </div>
    ${qs.length ? `<div class="section-title"><span class="h3">Kurz nachgefragt</span></div>` : ''}
    ${qs.map(q => `<div class="card question"><div class="h3">${esc(q.text)}${q.required ? '<span class="req">nötig</span>' : ''}</div><div class="small">${esc(q.why ?? '')}</div>
      ${q.input ? `<form class="qinput" data-action="answer-text" data-q="${q.id}"><input name="v" placeholder="${esc(q.input)}" autocomplete="off" aria-label="${esc(q.input)}"><button class="btn btn-primary btn-sm" type="submit">Suchen</button></form>` : ''}
      <div class="chips">${q.options.map(o => `<button class="chip ${String(S.answers[q.id] ?? q.default) === String(o.value) ? 'selected' : ''}" data-action="answer" data-q="${q.id}" data-v="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</div></div>`).join('')}
    <div class="section-title"><span class="h3">${d.hard_rules.length} Regeln für den Agenten</span></div>
    <div class="card">${d.hard_rules.map(ruleRow).join('')}</div>
    <div class="section-title"><span class="h3">Wenn etwas unklar ist</span></div>
    <div class="card"><div class="seg">${['ask', 'decline', 'approve'].map(u => `<button class="${unc === u ? 'on' : ''}" data-action="unc" data-v="${u}">${UNC[u]}</button>`).join('')}</div>
      <p class="small" style="margin:10px 2px 0">${unc === 'ask' ? 'Bei fehlenden Angaben oder Warnsignalen bekommst du eine Nachricht und hast 120 Sekunden Zeit. Ohne Antwort wird abgelehnt.' : unc === 'decline' ? 'Alles Unklare wird abgelehnt. Maximal sicher, aber der Agent findet vielleicht weniger.' : 'Achtung: Unklare Buchungen gehen ohne Rückfrage durch. Gefälschte Seiten und Regelverstösse werden trotzdem blockiert.'}</p></div>
    ${(d.notes ?? []).map(n => `<div class="note">${esc(n)}</div>`).join('')}
    <div class="section-title"><span class="h3">Was der Agent nie darf</span></div>
    <div class="card never">
      <div>${I.x(16)} Die Leine ändern oder lockern – das kannst nur du, mit Face ID.</div>
      <div>${I.x(16)} Anweisungen aus Händlertexten befolgen.</div>
      <div>${I.x(16)} Etwas bezahlen, das die Leine nicht freigegeben hat.</div>
    </div>
    <div class="card" style="margin-top:10px"><details class="assume"><summary>Annahmen von trevl <span class="small">${(d.guidance ?? []).length}</span></summary><ul>${(d.guidance ?? []).map(g => `<li>${esc(g)}</li>`).join('')}</ul></details></div>
    <div class="sticky-cta">
      <button class="btn btn-primary btn-block" data-action="confirm-draft" ${d.ready ? '' : 'disabled'}>${I.lock(17)} ${d.ready ? 'Leine anlegen und Agent starten' : 'Bitte offene Fragen beantworten'}</button>
    </div>`;
}

// ----- Trip (feed)
function kasseMini() {
  const s = S.summary;
  if (!s?.limit) return '';
  const spent = Math.min(100, (s.approved / s.limit) * 100), res = Math.min(100 - spent, (s.pending / s.limit) * 100);
  return `<div class="card" style="padding:12px 14px"><div class="row" style="justify-content:space-between;margin-bottom:8px"><span class="small">Reisekasse</span><span class="num" style="font-weight:700;font-size:14px">${money(s.free, 'CHF')} <span class="small">frei von ${money(s.limit, 'CHF', { cents: false })}</span></span></div>
    <div class="bar"><i class="spent" style="width:${spent}%"></i><i class="res" style="left:${spent}%;width:${res}%"></i></div></div>`;
}
function agentBar() {
  const m = S.mandate, a = S.agent;
  if (!m) return '';
  const waiting = S.auths.filter(x => x.status === 'pending').length;
  let label, btn = '';
  if (m.status === 'revoked') label = 'Gestoppt – Leine gekappt';
  else if (m.status === 'paused') { label = 'Pausiert'; btn = `<button class="btn btn-ghost btn-sm" data-action="resume">${I.play(14)} Fortsetzen</button>`; }
  else if (a.running) { label = waiting ? `Wartet auf dich (${waiting})` : 'Arbeitet …'; btn = `<button class="btn btn-ghost btn-sm" data-action="agent-stop">${I.pause(14)} Anhalten</button>`; }
  else { label = a.done ? 'Fertig' : 'Bereit'; btn = `<button class="btn btn-primary btn-sm" data-action="agent-start">${I.play(14)} ${a.done ? 'Nochmals suchen' : 'Agent starten'}</button>`; }
  return `<div class="agent-bar"><div class="who"><span class="avatar">${I.spark(15)}</span><div>Reiseagent<div class="small">${esc(label)}</div></div></div><span class="spacer"></span>${btn}</div>`;
}
function vTrip() {
  const m = S.mandate;
  if (!m) return vCompose();
  const t = m.trip ?? {};
  const items = S.feed.map(feedItem).filter(Boolean).join('');
  return `${topbar(statusPill())}
    <div class="trip-card" style="padding:14px 16px">
      <div class="deco">${I.plane(96)}</div>
      <div class="eyebrow">${esc(t.origin?.name)} → ${range(t.start_date, t.end_date)} · ${t.travelers} ${t.travelers === 1 ? 'Person' : 'Pers.'}</div>
      <div class="dest" style="font-size:32px;margin:4px 0 0">${esc(t.destination?.name ?? '')}</div>
    </div>
    <div style="margin-top:10px">${kasseMini()}</div>
    ${m.status === 'revoked' ? `<div class="card" style="margin-top:10px;background:var(--no-bg)"><b>Leine gekappt.</b><p class="small" style="margin:4px 0 10px">Der Agent kann nichts mehr kaufen. Bereits Gebuchtes bleibt bestehen.</p><button class="btn btn-primary btn-sm" data-action="go-compose">${I.plus(14)} Neue Leine</button></div>` : ''}
    ${agentBar()}
    <div class="feed">${items || `<div class="empty">Sobald der Agent sucht, siehst du hier jede Anfrage und jede Entscheidung der Leine.</div>`}</div>`;
}

function feedItem(e) {
  const anim = S.seen.has(e.id) ? ' style="animation:none"' : '';
  if (e.src === 'agent' && e.type === 'agent.say') {
    if (e.kind === 'propose') return `<div class="say k-propose"${anim}>${I.spark(12)} ${esc(e.text)}</div>`;
    if (e.kind === 'ai') return `<div class="say k-ai"${anim}><span class="ai-tag">${I.spark(11)} KI</span> ${esc(e.text)}</div>`;
    return `<div class="say k-${esc(e.kind)}"${anim}>${esc(e.text)}</div>`;
  }
  if (e.src === 'leash') {
    if (e.type === 'authorization.decided') return decisionCard(e.authorization_id, e, anim);
    if (e.type === 'booking.confirmed') {
      const a = S.authMap[e.authorization_id];
      const k = a?.authorization?.travel?.kind;
      return `<div class="ticket"${anim}><span class="ico">${(KIND_ICON[k] ?? I.ticket)(18)}</span><div class="t">${esc(a?.authorization?.travel?.title ?? e.title ?? 'Gebucht')}<small>${e.booking?.provider === 'duffel' ? 'Duffel Testbuchung · kein echtes Ticket' : e.booking?.provider === 'liteapi' ? 'LiteAPI Sandbox-Buchung · kein echter Aufenthalt' : 'Demo-Buchung'}</small></div><span class="ref">${esc(e.booking?.booking_reference ?? '')}</span></div>`;
    }
    if (e.type === 'authorization.replayed') return `<div class="sysline good"${anim}>${I.refresh(12)} Gleiche Anfrage nochmals erhalten (${esc(e.authorization_id)}) – erkannt, nicht doppelt gezählt</div>`;
    if (e.type === 'mandate.confirmed') return `<div class="sysline"${anim}>${I.lock(12)} Leine bestätigt · v1</div>`;
    if (e.type === 'mandate.updated') return `<div class="sysline ${e.loosened ? '' : 'good'}"${anim}>${I.scissors(12)} Leine ${e.loosened ? 'geändert (mit Face ID)' : 'gekürzt'} · v${e.version}: ${esc((e.changes ?? []).map(c => c.text).join(' · '))}</div>`;
    if (e.type === 'mandate.paused') return `<div class="sysline"${anim}>${I.pause(12)} Agent pausiert</div>`;
    if (e.type === 'mandate.resumed') return `<div class="sysline"${anim}>${I.play(12)} Agent fortgesetzt</div>`;
    if (e.type === 'mandate.revoked') return `<div class="sysline attack"${anim}>${I.scissors(12)} Leine gekappt – offene Anfragen abgebrochen</div>`;
    if (e.type === 'authorization.resolved' && e.by === 'leash' && e.status === 'expired') return `<div class="sysline"${anim}>${I.warn(12)} ${esc(e.text)}</div>`;
    return '';
  }
  if (e.src === 'regie') {
    if (e.type === 'regie.attack') return `<div class="sysline attack"${anim}>${I.bolt(12)} Test: ${esc(e.label)}</div>`;
    if (e.type === 'regie.blocked') return `<div class="sysline ${e.ok ? 'good' : 'attack'}"${anim}>${I.shield(12)} ${esc(e.label)}</div>`;
  }
  return '';
}

function amountLine(auth) {
  const a = auth.authorization ?? {};
  const chf = auth.decision?.facts?.amount_chf;
  if (a.currency && a.currency !== 'CHF') return `<div class="damount num">${money(chf)}<small>${money(a.amount, a.currency)}</small></div>`;
  return `<div class="damount num">${money(chf ?? a.amount)}</div>`;
}
function tagsFor(d) {
  const T = {
    prompt_injection: ['bad', 'Manipulation erkannt'], lookalike_merchant: ['bad', 'Gefälschte Seite'], duplicate_booking: ['bad', 'Doppelbuchung'],
    trip_budget_exceeded: ['bad', 'Kasse reicht nicht'], per_booking_limit: ['bad', 'Über Limit'], not_cancellable: ['bad', 'Nicht stornierbar'],
    addon_not_allowed: ['bad', 'Ungewollte Extras'], wrong_destination: ['bad', 'Falsches Ziel'], dates_outside_window: ['bad', 'Falsche Daten'],
    travelers_mismatch: ['bad', 'Falsche Personenzahl'], mandate_revoked: ['bad', 'Leine gekappt'], mandate_paused: ['warn', 'Pausiert'], merchant_not_trusted: ['bad', 'Anbieter nicht vertrauenswürdig'],
    cancellation_unknown: ['warn', 'Storno unklar'], merchant_unverified: ['warn', 'Unbekannter Anbieter'], budget_reserved: ['warn', 'Kasse knapp'],
    price_increase: ['warn', 'Preis gestiegen'], amount_mismatch: ['warn', 'Betrag passt nicht'], velocity: ['warn', 'Ungewöhnlich schnell'], currency_unknown: ['warn', 'Währung unklar'],
    within_policy: ['good', 'Alle Regeln erfüllt'], not_direct: ['bad', 'Nicht direkt'], baggage_missing: ['bad', 'Ohne Gepäck'], hotel_price_per_night: ['bad', 'Zu teuer pro Nacht'], hotel_stars: ['bad', 'Zu wenig Sterne'],
  };
  return (d.reason_codes ?? []).map(c => T[c]).filter(Boolean).map(([k, l]) => `<span class="tag ${k}">${l}</span>`).join('');
}
function decisionCard(id, ev, anim = '') {
  const a = S.authMap[id];
  if (!a) return `<div class="dcard ${esc(ev.decision)}"${anim}><div class="dhead"><span class="dicon">${(DEC_ICON[ev.decision] ?? I.q)(15)}</span><span class="dtitle">${esc(ev.headline)}</span></div><div class="dsum">${esc(ev.summary)}</div></div>`;
  const d = a.decision, au = a.authorization, t = au.travel ?? {};
  const pending = a.status === 'pending';
  const res = a.resolution;
  let resolved = '';
  if (d.decision === 'step_up' && !pending && res) {
    const ok = a.status === 'approved';
    resolved = `<div class="resolved ${ok ? 'ok' : 'no'}">${ok ? I.check(13) : I.x(13)} ${esc(res.by === 'customer' ? (ok ? 'Von dir freigegeben' : 'Von dir abgelehnt') : res.text)}</div>`;
  } else if (a.status === 'voided') resolved = `<div class="resolved no">${I.x(13)} ${esc(res?.text ?? 'Nicht ausgeführt')}</div>`;
  else if (a.status === 'superseded') resolved = `<div class="resolved no">${I.refresh(13)} Durch neues Angebot ersetzt</div>`;
  return `<div class="dcard ${d.decision}"${anim} data-id="${esc(id)}">
    <div class="dhead"><span class="dicon">${DEC_ICON[d.decision](15)}</span><span class="dtitle">${esc(d.headline)}</span>${amountLine(a)}</div>
    <div class="dsub">${(KIND_ICON[t.kind] ?? I.store)(12)} ${esc(t.title ?? au.purchase_description)} · ${esc(au.merchant?.merchant_name ?? '')}</div>
    <div class="dsum">${esc(d.summary)}</div>
    <div class="tags">${tagsFor(d)}</div>
    ${pending ? `<div class="actions"><button class="btn btn-no" data-action="decline" data-id="${esc(id)}">Ablehnen</button><button class="btn btn-ok" data-action="approve" data-id="${esc(id)}">Freigeben</button></div>` : resolved}
    <div class="dfoot"><button class="why" data-action="why" data-id="${esc(id)}">Warum? ${I.chev(13)}</button>${pending ? countdownSvg(d.step_up?.expires_at) : `<span class="lat">${d.latency_ms} ms · v${d.mandate_version}</span>`}</div>
  </div>`;
}
function countdownSvg(exp) {
  const C = 2 * Math.PI * 14;
  return `<span class="countdown" data-exp="${esc(exp)}"><svg width="34" height="34"><circle cx="17" cy="17" r="14" stroke="#F1DDB8" stroke-width="3" fill="none"/><circle class="cd-ring" cx="17" cy="17" r="14" stroke="#A86A12" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg><span class="cd-n">120</span></span>`;
}
function tickCountdowns() {
  const C = 2 * Math.PI * 14, win = (S.config.step_up_seconds ?? 120) * 1000;
  for (const el of document.querySelectorAll('.countdown[data-exp]')) {
    const left = Math.max(0, Date.parse(el.dataset.exp) - Date.now());
    $('.cd-n', el).textContent = Math.ceil(left / 1000);
    $('.cd-ring', el).setAttribute('stroke-dashoffset', String(C * (1 - left / win)));
  }
}

// ----- Wallet
function vWallet() {
  const s = S.summary, m = S.mandate;
  if (!m) return vCompose();
  const booked = S.auths.filter(a => a.status === 'approved');
  const pending = S.auths.filter(a => a.status === 'pending');
  const spent = s?.limit ? Math.min(100, (s.approved / s.limit) * 100) : 0;
  const res = s?.limit ? Math.min(100 - spent, (s.pending / s.limit) * 100) : 0;
  const row = (a, extra) => { const t = a.authorization.travel ?? {}; return `<div class="booking"><span class="ico">${(KIND_ICON[t.kind] ?? I.store)(18)}</span><div class="t"><b>${esc(t.title ?? a.authorization.purchase_description)}</b><small>${esc(a.authorization.merchant?.merchant_name)} · ${range(t.start_date, t.end_date)}</small></div><div class="a num">${money(a.decision.facts.amount_chf)}<small>${extra}</small></div></div>`; };
  return `${topbar(statusPill())}
    <div class="eyebrow">Reisekasse</div>
    <div class="kasse-hero">
      <div class="small">Noch frei</div>
      <div class="big num">${money(s?.free ?? 0, 'CHF')}</div>
      <div class="small">von ${money(s?.limit ?? 0)} für ${esc(m.trip?.destination?.name ?? 'die Reise')}</div>
      <div class="bar"><i class="spent" style="width:${spent}%"></i><i class="res" style="left:${spent}%;width:${res}%"></i></div>
      <div class="legend"><div><i style="background:var(--leash)"></i>Gebucht<b class="num">${money(s?.approved ?? 0)}</b></div><div><i style="background:#E3B25F"></i>Reserviert<b class="num">${money(s?.pending ?? 0)}</b></div><div><i style="background:var(--bg-2)"></i>Frei<b class="num">${money(s?.free_after_pending ?? 0)}</b></div></div>
    </div>
    <p class="small" style="margin:10px 4px 0">Gezählt wird nur, was endgültig freigegeben ist. Anfragen, die auf dich warten, sind reserviert. Fremdwährungen zum festen Kurs (EUR 0.95 · GBP 1.12 · USD 0.87).</p>
    ${pending.length ? `<div class="section-title"><span class="h3">Wartet auf dich</span></div><div class="card">${pending.map(a => row(a, 'reserviert')).join('')}</div>` : ''}
    <div class="section-title"><span class="h3">Gebucht</span><span class="small">${booked.length}</span></div>
    <div class="card">${booked.length ? booked.map(a => row(a, esc(a.booking?.booking_reference ?? 'wird gebucht …'))).join('') : '<div class="empty" style="padding:14px">Noch nichts gebucht.</div>'}</div>
    <div class="section-title"><span class="h3">Von der Leine gestoppt</span><span class="small">${S.auths.filter(a => ['declined', 'expired', 'cancelled'].includes(a.status)).length}</span></div>
    <div class="card"><button class="row link" data-action="tab" data-v="log" style="width:100%;justify-content:space-between">Alle Entscheidungen im Protokoll ansehen ${I.chev(14)}</button></div>`;
}

// ----- Leash (active)
function vLeash() {
  const m = S.mandate;
  if (!m) return vCompose();
  const active = m.status !== 'revoked';
  return `${topbar(statusPill())}
    <div class="eyebrow">Deine Leine · <span class="version">${esc(m.mandate_id)} · v${m.version}</span></div>
    <h1 class="h1" style="font-size:34px">${m.status === 'revoked' ? 'Gekappt' : m.status === 'paused' ? 'Pausiert' : 'Aktiv'}</h1>
    <div class="card"><div class="small" style="margin-bottom:6px">Dein Originaltext</div><div style="font-size:14.5px;line-height:1.45">«${esc(m.instruction)}»</div></div>
    ${active ? `<div class="leash-actions">
      <button class="btn btn-primary" data-action="tighten">${I.scissors(17)}<span>Leine kürzen</span><small>sofort wirksam</small></button>
      <button class="btn btn-ghost" data-action="loosen">${I.unlock(17)}<span>Lockern</span><small>nur mit Face ID</small></button>
      ${m.status === 'paused' ? `<button class="btn btn-ghost" data-action="resume">${I.play(17)}<span>Fortsetzen</span></button>` : `<button class="btn btn-ghost" data-action="pause">${I.pause(17)}<span>Pausieren</span></button>`}
      <button class="btn btn-danger" data-action="revoke">${I.x(17)}<span>Leine kappen</span></button>
    </div>` : `<button class="btn btn-primary btn-block" style="margin-top:12px" data-action="go-compose">${I.plus(16)} Neue Leine anlegen</button>`}
    <div class="section-title"><span class="h3">${m.hard_rules.length} Regeln</span><span class="small">Bei Unsicherheit: ${UNC[m.uncertainty_policy]}</span></div>
    <div class="card">${m.hard_rules.map(ruleRow).join('')}</div>
    <div class="section-title"><span class="h3">Verlauf der Leine</span></div>
    <div class="card">${[...m.history].reverse().map(h => `<div class="hist"><b>v${h.version} · ${esc(h.text)}</b>${(h.changes ?? []).map(c => `<div>${c.type === 'tighter' ? '↓' : '↑'} ${esc(c.text)}</div>`).join('')}<small>${new Date(h.at).toLocaleString('de-CH')} · durch dich</small></div>`).join('')}</div>`;
}

// ----- Log
function vLog() {
  const m = S.mandate;
  if (!m) return vCompose();
  const items = [...S.auths].reverse();
  const st = { approved: 'freigegeben', declined: 'abgelehnt', pending: 'wartet auf dich', expired: 'abgelaufen → abgelehnt', cancelled: 'abgebrochen', voided: 'nicht ausgeführt', superseded: 'ersetzt' };
  return `${topbar(`<button class="pill" data-action="export">${I.download(14)} Export</button>`)}
    <div class="eyebrow">Protokoll</div>
    <h1 class="h1" style="font-size:34px">Jede Entscheidung, nachvollziehbar</h1>
    <p class="lead">Was erlaubt war, welche Fakten zählten, warum – und wer entschieden hat.</p>
    <div class="card">${items.length ? items.map(a => { const d = a.decision, t = a.authorization.travel ?? {}; return `<div class="logitem"><span class="d ${a.status}"></span><div><b>${esc(t.title ?? a.authorization.purchase_description)}</b> <span class="small">· ${money(d.facts.amount_chf)} · ${st[a.status] ?? a.status}</span>
      <p>${esc(a.resolution?.text && a.status !== d.decision ? `${d.summary} → ${a.resolution.text}` : d.summary)}</p>
      <small>${hhmm(a.created_at)} · ${esc(a.authorization_id)} · Leine v${d.mandate_version} · ${d.latency_ms} ms · ${esc(d.engine_version)}${a.booking ? ` · Buchung ${esc(a.booking.booking_reference)}` : ''}</small>
      <div><button class="why" data-action="why" data-id="${esc(a.authorization_id)}" style="margin-top:4px">Details ${I.chev(12)}</button></div></div></div>`; }).join('') : '<div class="empty">Noch keine Entscheidungen.</div>'}</div>`;
}

// ---------------------------------------------------------------- sheets
function openSheet(html, key) { S.sheet = key; $('#sheet').innerHTML = `<div class="grabber"></div>${html}`; $('#sheetWrap').hidden = false; tickCountdowns(); }
function closeSheet() { S.sheet = null; $('#sheetWrap').hidden = true; }

function whySheet(id) {
  const a = S.authMap[id];
  if (!a) return;
  const d = a.decision, au = a.authorization, t = au.travel ?? {};
  const pending = a.status === 'pending';
  const checks = d.checks.map(c => `<div class="check"><span class="s ${c.status}">${(c.status === 'pass' ? I.check : c.status === 'fail' ? I.x : I.q)(12)}</span><div><b>${esc(c.label)}</b><p>${esc(c.detail)}</p>${c.source?.quote ? `<span class="src quote">aus deinem Text: «${esc(c.source.quote)}»</span>` : c.source?.type === 'default' ? '<span class="src default">trevl-Standard</span>' : ''}</div></div>`).join('');
  const signals = d.signals.filter(s => s.severity !== 'info').map(s => `<div class="signal ${s.severity}">${(s.severity === 'block' ? I.shield : I.warn)(16)}<div>${esc(s.text)}${(s.findings ?? []).slice(0, 1).map(f => `<span class="excerpt">${esc(f.excerpt)}</span>`).join('')}</div></div>`).join('');
  const res = a.resolution ? `<div class="note" style="margin-top:12px">${esc(a.resolution.by === 'customer' ? 'Deine Antwort' : 'Leine')}: ${esc(a.resolution.text)} · ${new Date(a.resolution.at).toLocaleTimeString('de-CH')}</div>` : '';
  openSheet(`
    <div class="dcard ${d.decision}" style="box-shadow:none;animation:none"><div class="dhead"><span class="dicon">${DEC_ICON[d.decision](15)}</span><span class="dtitle">${esc(d.headline)}</span>${amountLine(a)}</div>
      <div class="dsub">${(KIND_ICON[t.kind] ?? I.store)(12)} ${esc(t.title ?? au.purchase_description)} · ${esc(au.merchant?.merchant_name)}</div><div class="dsum">${esc(d.summary)}</div></div>
    ${pending ? `<div class="row" style="margin-top:12px">${countdownSvg(d.step_up?.expires_at)}<button class="btn btn-no" data-action="decline" data-id="${esc(id)}">Ablehnen</button><button class="btn btn-ok" data-action="approve" data-id="${esc(id)}">Freigeben</button></div>` : ''}
    ${res}
    ${d.uncertainty.length ? `<div class="section-title"><span class="h3">Was unklar ist</span></div><div class="uncertain"><ul>${d.uncertainty.map(u => `<li>${esc(u)}</li>`).join('')}</ul></div>` : ''}
    ${signals ? `<div class="section-title"><span class="h3">Warnsignale</span></div>${signals}` : ''}
    <div class="section-title"><span class="h3">Was erlaubt war</span><span class="small">${d.checks.filter(c => c.status === 'pass').length}/${d.checks.length} erfüllt</span></div>
    <div class="card">${checks}</div>
    <div class="section-title"><span class="h3">Fakten, die zählten</span></div>
    <div class="card">${d.evidence.map(e => `<dl class="evi"><dt>${esc(e.fact)}</dt><dd>${esc(e.value)}<small>${esc(e.source)}</small></dd></dl>`).join('')}</div>
    <div class="section-title"><span class="h3">Kontrolle</span></div>
    <div class="meta-line">Entschieden von der Leine (${esc(d.engine_version)}), nicht vom Agenten<br>Leine ${esc(d.mandate_id)} · Version ${d.mandate_version} · ${d.latency_ms} ms<br>Anfrage ${esc(id)} · ${new Date(a.created_at).toLocaleString('de-CH')}<br>Codes: ${esc(d.reason_codes.join(', '))}${a.booking ? `<br>Buchung ${esc(a.booking.booking_reference)} (${esc(a.booking.provider)})` : ''}</div>
  `, `why:${id}`);
}

function tightenSheet() {
  const m = S.mandate;
  const b = m.hard_rules.find(r => r.kind === 'budget_total');
  const minB = Math.ceil((S.summary?.approved ?? 0) / 10) * 10;
  const has = (k) => m.hard_rules.some(r => r.kind === k);
  S.edit = { budget: b?.value ?? null, unc: m.uncertainty_policy, add: {} };
  const opt = (k, label, sub) => has(k) ? '' : `<div class="toggle"><div>${label}<div class="small">${sub}</div></div><button class="switch" data-action="edit-toggle" data-k="${k}" aria-label="${label}"></button></div>`;
  openSheet(`<div class="h2">Leine kürzen</div><p class="small">Verschärfen geht sofort und ohne Face ID. Lockern geht nur mit ausdrücklicher Bestätigung.</p>
    ${b ? `<div class="card" style="margin-top:12px"><div class="row" style="justify-content:space-between"><b>Reisekasse</b><b class="num" id="bval">${money(b.value, b.currency ?? 'CHF', { cents: false })}</b></div>
      <input class="slider" type="range" min="${minB}" max="${b.value}" step="10" value="${b.value}" data-input="budget" aria-label="Reisekasse">
      <div class="row small" style="justify-content:space-between"><span>mind. ${money(minB, 'CHF', { cents: false })} (schon gebucht)</span><span>aktuell</span></div></div>` : ''}
    <div class="card" style="margin-top:10px"><b>Wenn etwas unklar ist</b><div class="seg" style="margin-top:10px">${['ask', 'decline', 'approve'].map(u => `<button class="${m.uncertainty_policy === u ? 'on' : ''}" ${STRICT[u] < STRICT[m.uncertainty_policy] ? 'disabled style="opacity:.35"' : ''} data-action="edit-unc" data-v="${u}">${UNC[u]}</button>`).join('')}</div></div>
    <div class="card" style="margin-top:10px">${opt('direct', 'Nur Direktflüge', 'Keine Umstiege') + opt('cancellable', 'Hotel kostenlos stornierbar', 'Nicht stornierbare Hotels werden abgelehnt') + opt('no_extras', 'Keine Extras', 'Sitzplatz, Versicherung, Upgrades …') + opt('budget_purchase', 'Pro Buchung max. CHF 500', 'Einzelne grosse Buchungen stoppen') || '<div class="small">Alle zusätzlichen Schutzregeln sind schon aktiv.</div>'}</div>
    <button class="btn btn-primary btn-block" style="margin-top:14px" data-action="apply-tighten">${I.scissors(16)} Kürzen</button>`, 'tighten');
}
function loosenSheet() {
  const m = S.mandate;
  const b = m.hard_rules.find(r => r.kind === 'budget_total');
  S.edit = { budget: b?.value ?? null, unc: m.uncertainty_policy, remove: {} };
  const removable = m.hard_rules.filter(r => !['budget_total', 'destination', 'dates_start', 'dates_end', 'travelers', 'categories'].includes(r.kind));
  openSheet(`<div class="h2">Leine lockern</div><p class="small">Mehr Spielraum für den Agenten. Das braucht deine Bestätigung mit Face ID und wird im Verlauf festgehalten.</p>
    ${b ? `<div class="card" style="margin-top:12px"><div class="row" style="justify-content:space-between"><b>Reisekasse</b><b class="num" id="bval">${money(b.value, b.currency ?? 'CHF', { cents: false })}</b></div>
      <input class="slider" type="range" min="${b.value}" max="${Math.round(b.value * 2 / 10) * 10}" step="10" value="${b.value}" data-input="budget" aria-label="Reisekasse"></div>` : ''}
    <div class="card" style="margin-top:10px"><b>Wenn etwas unklar ist</b><div class="seg" style="margin-top:10px">${['ask', 'decline', 'approve'].map(u => `<button class="${m.uncertainty_policy === u ? 'on' : ''}" data-action="edit-unc" data-v="${u}">${UNC[u]}</button>`).join('')}</div></div>
    ${removable.length ? `<div class="card" style="margin-top:10px">${removable.map(r => `<div class="toggle"><div>${esc(r.label)}<div class="small">Regel aktiv</div></div><button class="switch on" data-action="edit-remove" data-k="${esc(r.id)}" aria-label="${esc(r.label)}"></button></div>`).join('')}</div>` : ''}
    <button class="btn btn-brand btn-block" style="margin-top:14px" data-action="apply-loosen">${I.lock(16)} Mit Face ID bestätigen</button>`, 'loosen');
}
function revokeSheet() {
  openSheet(`<div class="h2">Leine kappen?</div>
    <p class="lead" style="margin-top:8px">Der Agent kann ab sofort nichts mehr kaufen. Anfragen, die noch auf dich warten, werden abgebrochen.</p>
    <div class="note">Schon gebuchte Reisen bleiben bestehen. Stornieren geht separat beim Anbieter.</div>
    <div class="row" style="margin-top:16px"><button class="btn btn-ghost" data-action="close-sheet">Abbrechen</button><button class="btn btn-danger" data-action="apply-revoke">${I.scissors(16)} Kappen</button></div>`, 'revoke');
}

// ---------------------------------------------------------------- push banner
function showPush(id) {
  const a = S.authMap[id];
  const p = $('#push');
  const t = a?.authorization?.travel ?? {};
  p.innerHTML = `<span class="app">${I.leash(20)}</span><div class="t"><b>trevl <span>jetzt</span></b>Darf der Agent «${esc(t.title ?? 'Buchung')}» für ${money(a?.decision?.facts?.amount_chf)} buchen? ${esc(a?.decision?.uncertainty?.[0] ?? '')}</div>`;
  p.dataset.id = id; p.hidden = false;
  navigator.vibrate?.([30, 40, 30]);
  clearTimeout(showPush.t); showPush.t = setTimeout(() => (p.hidden = true), 9000);
}

// ---------------------------------------------------------------- side panels (jury)
const REQS = [
  ['Regeln in eigenen Worten', 'Text oder Sprache → Regelkarten mit Zitat'],
  ['Limits, Händler, Zeitfenster, Unsicherheit', 'Reisekasse, geprüfte Anbieter, Reisedaten, «frag mich»'],
  ['Verschärfen, ändern, widerrufen', 'Kürzen sofort · Lockern nur mit Face ID · Kappen'],
  ['approve · decline · step_up', 'Jede Buchung, mit Begründung und «Warum?»'],
  ['Unsicherheit sichtbar', 'Gelbe Box + Rückfrage mit 120 s, danach sicher ablehnen'],
  ['Zustand über Zeit', 'Reisekasse, Retries, Doppelbuchungen, Re-Quotes'],
  ['Händlertext nicht vertrauenswürdig', 'Injection erkannt, Regeln unverändert'],
  ['Entkoppelt, schnell, vorhersagbar', 'Eigene Engine, < 10 ms, keine KI im Entscheid'],
];
function renderSides() {
  const left = $('#regie'), right = $('#wire');
  if (getComputedStyle(left).display === 'none') return;
  const c = S.config;
  left.innerHTML = `<h3>Regie · Jury-Modus</h3><p class="sub">Greife die Leine an wie ein manipulierter Agent oder eine böse Buchungsseite. Die Leine weiss nicht, dass es ein Test ist.</p>
    ${S.mandate?.status === 'active' || S.mandate?.status === 'paused' ? S.attacks.map((a, i) => `<button class="attack" data-action="attack" data-type="${a.id}"><span class="n">${String(i + 1).padStart(2, '0')}</span>${esc(a.label)}</button>`).join('') : '<p class="sub">Erst eine Leine anlegen.</p>'}
    ${c.agent_mode ? `<div class="blk"><h3>Reiseagent</h3><p class="sub">Skript = immer gleich, demosicher. KI = Claude entscheidet selbst; fällt sie aus, übernimmt das Skript. Die Leine ist für beide dieselbe.</p>
      <div class="row" style="gap:8px"><button class="sbtn ${c.agent_mode === 'script' ? 'on' : ''}" data-action="agent-mode" data-v="script">Skript-Agent</button><button class="sbtn ${c.agent_mode === 'ai' ? 'on' : ''}" data-action="agent-mode" data-v="ai" ${c.ai_ready ? '' : 'title="Anthropic-Schlüssel fehlt"'}>${I.spark(12)} KI-Agent (Claude)</button></div>${c.ai_ready ? '' : '<p class="sub" style="margin-top:8px">KI braucht ANTHROPIC_API_KEY in .env.</p>'}</div>` : ''}
    <div class="blk"><div class="range">Tempo Agent <input type="range" min="0.2" max="2" step="0.1" value="${c.pace ?? 1}" data-input="pace"> <span class="kbd">${(c.pace ?? 1).toFixed(1)}×</span></div>
    <div class="row" style="margin-top:10px;gap:8px"><button class="sbtn red" data-action="reset">${I.refresh(13)} Alles zurücksetzen</button></div></div>
    ${c.viseca ? `<div class="blk"><h3>Viseca-Testfälle</h3><p class="sub">Dieselbe Leine auf Visecas 5 öffentlichen Szenarien (45 Käufe, Originaldaten). Keine Sonderregeln.</p><button class="attack" data-action="viseca"><span class="n">45</span>Alle offiziellen Testkäufe prüfen</button></div>` : ''}
    <div class="blk"><h3>Viseca-Challenge → trevl</h3><div class="req-list" style="margin-top:10px">${REQS.map(([a, b]) => `<div>${I.check(14)}<span><b>${a}</b><br>${b}</span></div>`).join('')}</div></div>`;
  const calls = S.wire.filter(w => w.method !== 'GET').slice(-40).reverse();
  right.innerHTML = `<h3>Unter der Haube</h3><p class="sub">Die App entscheidet nichts. Sie fragt die Leine über HTTP – wie später die Viseca-one-App.</p>
    <div class="arch"><div class="box"><b>trevl App</b><span>Handy-UI · Übersetzer${c.llm ? ' + Claude' : ' (Regel-Parser)'}</span></div><div class="arrow">↓ HTTP · Kunden-Schlüssel</div>
    <div class="box" style="border-color:#FF8F74"><b>Leine · Entscheidungs-Engine</b><span>${esc(c.engine_version ?? '')} · eigener Dienst ${esc((c.engine ?? '').replace('http://', ''))}</span><span>Regeln + Zustand · keine KI im Entscheid</span></div><div class="arrow">↑ HTTP · Agent-Schlüssel (nur anfragen)</div>
    <div class="box"><b>Reiseagent</b><span>${esc(c.duffel_label ?? '')} · ${esc(c.hotels_label ?? 'Hotels/Transfers: Testmarkt')}</span></div></div>
    <div class="blk"><h3>Live-Aufrufe</h3><p class="sub">Klick zeigt Anfrage und Antwort im Rohformat (Viseca-ähnliches Schema).</p>
    ${calls.map(w => { const dec = typeof w.response?.decision === 'string' ? w.response.decision : null; return `<details class="call"><summary><span class="m">${esc(w.method)}</span><span>${esc(w.path.replace('/v1', ''))}<span class="role ${w.role === 'customer' ? '' : 'agent'}">${w.role === 'customer' ? 'App' : 'Agent'}</span></span><span>${dec ? `<span class="dec ${dec}">${dec}</span> ` : ''}<span class="st ${w.status >= 400 ? 'err' : ''}">${w.status}</span></span></summary><pre>${esc(JSON.stringify({ request: w.request, response: w.response }, null, 2).slice(0, 6000))}</pre></details>`; }).join('') || '<p class="sub">Noch keine Aufrufe.</p>'}</div>`;
}

// ---------------------------------------------------------------- actions
const A = {
  'go-compose': () => { S.view = 'compose'; render(); setTimeout(() => $('#text')?.focus(), 50); },
  example: (el) => { S.text = EXAMPLES[Number(el.dataset.i)]; render(); },
  tab: (el) => { S.view = el.dataset.v; closeSheet(); render.jump = S.view === 'trip'; render(); },
  mic: () => toggleMic(),
  compile: async () => {
    S.text = $('#text')?.value ?? S.text;
    if (!S.text.trim()) return toast('Beschreib kurz deine Reise.');
    S.answers = {}; S.unc = null; S.compiling = true; render();
    try { S.draft = await api('POST', '/api/compile', { text: S.text, answers: S.answers }); S.view = 'draft'; }
    catch (e) { toast(e.message); }
    S.compiling = false; render(); $('#screen').scrollTop = 0;
  },
  answer: async (el) => {
    S.answers[el.dataset.q] = el.dataset.v;
    try { S.draft = await api('POST', '/api/compile', { text: S.text, answers: S.answers }); } catch (e) { toast(e.message); }
    render.keepScroll = true; render();
  },
  unc: (el) => { S.unc = el.dataset.v; render.keepScroll = true; render(); },
  'confirm-draft': async () => {
    const d = S.draft;
    if (!d?.ready) return;
    await faceId();
    try {
      const draft = await api('POST', '/api/leash/mandates', { instruction: d.instruction, trip: d.trip, hard_rules: d.hard_rules, uncertainty_policy: S.unc ?? d.uncertainty_policy, guidance: d.guidance, open_questions: d.open_questions, valid_until: d.trip.start_date });
      const m = await api('POST', `/api/leash/mandates/${draft.draft_id}/confirm`, { confirmed: true });
      S.feed = []; S.seen.clear();
      await refresh();
      S.view = 'trip'; render.jump = true; render();
      toast('Leine aktiv. Der Agent legt los.');
      setTimeout(() => api('POST', '/api/agent/start', { mandate_id: m.mandate_id }).then(softRefresh).catch(e => toast(e.message)), 900);
    } catch (e) { toast(e.message); }
  },
  'agent-start': async () => { try { await api('POST', '/api/agent/start', { mandate_id: S.mandate.mandate_id }); softRefresh(); } catch (e) { toast(e.message); } },
  'agent-stop': async () => { await api('POST', '/api/agent/stop'); softRefresh(); },
  why: (el) => whySheet(el.dataset.id),
  approve: async (el) => {
    await faceId();
    try { const r = await api('POST', `/api/leash/authorizations/${el.dataset.id}/resolve`, { decision: 'approve', customer_message: 'Vom Kunden in der App freigegeben (Face ID).' }); toast(r.status === 'approved' ? 'Freigegeben.' : r.resolution?.text ?? 'Abgelehnt.'); }
    catch (e) { toast(e.message); }
    closeSheet(); $('#push').hidden = true; softRefresh();
  },
  decline: async (el) => {
    try { await api('POST', `/api/leash/authorizations/${el.dataset.id}/resolve`, { decision: 'decline', customer_message: 'Vom Kunden in der App abgelehnt.' }); toast('Abgelehnt. Der Agent sucht weiter.'); }
    catch (e) { toast(e.message); }
    closeSheet(); $('#push').hidden = true; softRefresh();
  },
  'close-sheet': () => closeSheet(),
  tighten: () => tightenSheet(),
  loosen: () => loosenSheet(),
  revoke: () => revokeSheet(),
  pause: async () => { await api('POST', `/api/leash/mandates/${S.mandate.mandate_id}/pause`); toast('Agent pausiert. Er kann nichts kaufen.'); softRefresh(); },
  resume: async () => { await api('POST', `/api/leash/mandates/${S.mandate.mandate_id}/resume`); toast('Weiter geht’s.'); softRefresh(); },
  'edit-unc': (el) => { S.edit.unc = el.dataset.v; for (const b of el.parentElement.children) b.classList.toggle('on', b === el); },
  'edit-toggle': (el) => { const k = el.dataset.k; S.edit.add[k] = !S.edit.add[k]; el.classList.toggle('on', S.edit.add[k]); },
  'edit-remove': (el) => { const k = el.dataset.k; S.edit.remove[k] = !S.edit.remove[k]; el.classList.toggle('on', !S.edit.remove[k]); },
  'apply-tighten': async () => {
    const m = S.mandate, e = S.edit;
    const rules = m.hard_rules.map(r => r.kind === 'budget_total' && e.budget != null ? { ...r, value: Number(e.budget), label: `Reisekasse ${money(Number(e.budget), r.currency ?? 'CHF', { cents: false })} gesamt`, source: { type: 'answer', quote: null } } : r);
    const ADD = {
      direct: { id: 'direct', kind: 'direct', label: 'Nur Direktflüge', field: 'travel.stops', operator: '<=', value: 0, applies_to: ['flight'] },
      cancellable: { id: 'cancellable', kind: 'cancellable', label: 'Hotel kostenlos stornierbar', field: 'authorization.order_cancellable', operator: '=', value: 'true', applies_to: ['hotel'] },
      no_extras: { id: 'no_extras', kind: 'no_extras', label: 'Keine Extras', field: 'items.item_category', operator: 'not_in', value: ['insurance', 'seat', 'priority', 'upgrade', 'lounge', 'meal', 'baggage'] },
      budget_purchase: { id: 'budget_purchase', kind: 'budget_purchase', label: 'Pro Buchung höchstens CHF 500', field: 'authorization.billing_amount_chf', operator: '<=', value: 500, currency: 'CHF', scope: 'purchase' },
    };
    for (const [k, on] of Object.entries(e.add)) if (on) rules.push({ ...ADD[k], source: { type: 'answer', quote: null } });
    try { const r = await api('PATCH', `/api/leash/mandates/${m.mandate_id}`, { hard_rules: rules, uncertainty_policy: e.unc }); toast(r.changes.length ? `Leine gekürzt · v${r.mandate.version}` : 'Nichts geändert.'); closeSheet(); softRefresh(); }
    catch (err) { toast(err.message); }
  },
  'apply-loosen': async () => {
    const m = S.mandate, e = S.edit;
    const rules = m.hard_rules.filter(r => !e.remove[r.id]).map(r => r.kind === 'budget_total' && e.budget != null ? { ...r, value: Number(e.budget), label: `Reisekasse ${money(Number(e.budget), r.currency ?? 'CHF', { cents: false })} gesamt`, source: { type: 'answer', quote: null } } : r);
    await faceId();
    try { const r = await api('PATCH', `/api/leash/mandates/${m.mandate_id}`, { hard_rules: rules, uncertainty_policy: e.unc, customer_confirmed: true }); toast(r.changes.length ? `Leine geändert · v${r.mandate.version}` : 'Nichts geändert.'); closeSheet(); softRefresh(); }
    catch (err) { toast(err.message); }
  },
  'apply-revoke': async () => { try { await api('DELETE', `/api/leash/mandates/${S.mandate.mandate_id}`); toast('Leine gekappt. Der Agent ist gestoppt.'); } catch (e) { toast(e.message); } closeSheet(); softRefresh(); },
  export: () => {
    const data = { exported_at: new Date().toISOString(), mandate: S.mandate, summary: S.summary, authorizations: S.auths };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `trevl-protokoll-${S.mandate?.mandate_id ?? 'leer'}.json`; a.click(); URL.revokeObjectURL(url);
  },
  attack: async (el) => {
    el.classList.add('busy');
    try { await api('POST', '/api/regie/attack', { type: el.dataset.type }); if (S.view !== 'trip') { S.view = 'trip'; render.jump = true; } }
    catch (e) { toast(e.message); }
    el.classList.remove('busy'); softRefresh();
  },
  viseca: async (el) => {
    el.classList.add('busy');
    try { showViseca(await api('GET', '/api/viseca/replay')); } catch (e) { toast(e.message); }
    el.classList.remove('busy');
  },
  'close-overlay': () => { $('#overlay')?.remove(); },
  'agent-mode': async (el) => {
    try { const r = await api('POST', '/api/regie/agent-mode', { mode: el.dataset.v }); S.config.agent_mode = r.agent_mode; toast(r.agent_mode === 'ai' ? 'KI-Agent aktiv – gilt für den nächsten Start.' : 'Skript-Agent aktiv.'); }
    catch (e) { toast(e.message); }
    renderSides();
  },
  reset: async () => {
    if (!confirm('Alles zurücksetzen? Leine, Entscheidungen und Protokoll werden gelöscht.')) return;
    await api('POST', '/api/regie/reset');
    Object.assign(S, { draft: null, answers: {}, unc: null, feed: [], text: '', view: 'welcome' }); S.seen.clear();
    await refresh(); render();
  },
};
document.addEventListener('click', (e) => {
  const push = e.target.closest('#push');
  if (push) { push.hidden = true; whySheet(push.dataset.id); return; }
  const t = e.target.closest('[data-action]');
  if (!t || t.disabled) return;
  const fn = A[t.dataset.action];
  if (fn) { e.preventDefault(); fn(t, e); }
});
// Typed answer to a question (e.g. a destination trevl did not recognise).
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-action="answer-text"]');
  if (!f) return;
  e.preventDefault();
  const v = f.elements.v.value.trim();
  if (!v) return toast('Bitte ein Ziel eingeben.');
  S.answers[f.dataset.q] = v;
  f.querySelector('button').textContent = 'Suche …';
  try { S.draft = await api('POST', '/api/compile', { text: S.text, answers: S.answers }); } catch (err) { toast(err.message); }
  render.keepScroll = true; render();
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'text') S.text = t.value;
  if (t.dataset.input === 'budget') { S.edit.budget = Number(t.value); const b = $('#bval'); if (b) b.textContent = money(Number(t.value), 'CHF', { cents: false }); }
  if (t.dataset.input === 'pace') { api('POST', '/api/regie/pace', { pace: Number(t.value) }).then(r => { S.config.pace = r.pace; }); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && S.view === 'compose') A.compile(); });

// ---------------------------------------------------------------- Viseca replay (jury)
function showViseca(r) {
  $('#overlay')?.remove();
  const D = { approve: 'ok', decline: 'no', step_up: 'ask' };
  const el = document.createElement('div');
  el.id = 'overlay';
  el.className = 'overlay';
  const table = (sc) => sc.rows.map(x => `<tr><td class="num">${x.order}</td><td>${esc(x.merchant)}<small>${esc(x.items)}</small></td><td class="num">${money(x.amount, x.currency)}</td><td><span class="dec-chip ${D[x.decision]}">${x.decision}</span></td><td>${esc(x.summary)}</td></tr>`).join('');
  el.innerHTML = `<div class="ov-box"><div class="ov-head"><div><div class="eyebrow">Viseca · öffentliche Szenarien · Originaldaten</div>
      <div class="h2">${r.count} Testkäufe durch dieselbe Leine</div>
      <p class="small">${r.totals.approve} × approve · ${r.totals.decline} × decline · ${r.totals.step_up} × step_up · langsamster Entscheid ${r.max_latency_ms.toFixed(1)} ms · alle zusammen ${r.total_ms} ms. Viseca liefert keine Musterlösung – jede Zeile ist begründet.</p></div>
      <button class="btn btn-ghost btn-sm" data-action="close-overlay">Schliessen</button></div>
    ${r.scenarios.map(sc => `<section class="ov-sc"><div class="h3">${esc(sc.id)} · ${esc(sc.name)}</div><div class="ov-instr">«${esc(sc.instruction)}»</div>
      <div class="small">Regeln: ${sc.rules.map(esc).join(' · ')} · bei Unsicherheit fragen · ${sc.familiar_shops} bekannte Shops, ${sc.familiar_devices} bekannte Geräte aus dem Verlauf</div>
      <table class="ov-t"><tbody>${table(sc)}</tbody></table></section>`).join('')}</div>`;
  el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
  document.body.appendChild(el);
}

// ---------------------------------------------------------------- speech input
function toggleMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return toast('Spracheingabe geht in diesem Browser nicht – bitte tippen.');
  if (S.rec) { S.rec.stop(); return; }
  const rec = new SR(); rec.lang = 'de-CH'; rec.interimResults = true; rec.continuous = true;
  const base = ($('#text')?.value ?? S.text).trim();
  rec.onresult = (ev) => { let txt = ''; for (const r of ev.results) txt += r[0].transcript; S.text = (base ? base + ' ' : '') + txt; const ta = $('#text'); if (ta) ta.value = S.text; };
  rec.onend = () => { S.rec = null; S.listening = false; render(); };
  rec.onerror = () => toast('Mikrofon nicht verfügbar.');
  S.rec = rec; S.listening = true; rec.start(); render();
}

// ---------------------------------------------------------------- live updates
function connect() {
  const es = new EventSource('/api/stream');
  es.onmessage = (m) => {
    const e = JSON.parse(m.data);
    if (e.src === 'wire') { S.wire.push(e); if (S.wire.length > 80) S.wire.shift(); renderSides(); return; }
    if (e.src === 'regie' && e.type === 'regie.reset') return;
    if (e.type === 'system.reset') { S.feed = []; S.seen.clear(); softRefresh(); return; }
    S.feed.push(e);
    if (e.src === 'leash') {
      softRefresh();
      if (e.type === 'authorization.decided' && e.decision === 'step_up') setTimeout(() => showPush(e.authorization_id), 350);
      if (e.type === 'authorization.resolved' && S.sheet === `why:${e.authorization_id}`) setTimeout(() => whySheet(e.authorization_id), 200);
    } else if (e.src === 'agent') {
      if (e.type === 'agent.started' || e.type === 'agent.finished') softRefresh();
      else if (S.view === 'trip') render();
    } else render();
  };
  es.onerror = () => { es.close(); setTimeout(() => { connect(); softRefresh(); }, 1500); };
}

setInterval(() => {
  tickCountdowns();
  const now = new Date(); $('#clock').textContent = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
}, 1000);

(async function boot() {
  S.config = await api('GET', '/api/config').catch(() => ({}));
  S.attacks = (await api('GET', '/api/regie/attacks').catch(() => ({ attacks: [] }))).attacks;
  const f = await api('GET', '/api/feed').catch(() => ({ events: [] }));
  S.feed = f.events; for (const e of S.feed) S.seen.add(e.id);
  await refresh();
  S.view = S.mandate ? 'trip' : 'welcome';
  render.jump = true;
  render();
  connect();
})();
