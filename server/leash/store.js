// Leash state over time: mandates, decisions (ledger), human answers, audit events.
// Persisted to a JSON file so a restart keeps approvals, pending questions and the audit trail.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { evaluate, KIND_LABEL } from './evaluate.js';
import { semanticInput, normalizeSemantic, withSemantic } from './semantic.js';
import { validateMandateInput, diffMandate, PolicyError, UNC_LABEL } from './policy.js';
import { DEFAULT_REGISTRY } from './merchants.js';
import { uid, nowIso, round2, fmtMoney, toChf } from './util.js';

const FINAL = new Set(['approved', 'declined', 'expired', 'cancelled', 'voided', 'superseded']);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
const fingerprint = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

function validateAuthorization(auth) {
  if (!auth || typeof auth.authorization_id !== 'string' || !auth.authorization_id) throw new PolicyError('authorization_id fehlt');
  if (typeof auth.amount !== 'number' || !Number.isFinite(auth.amount) || auth.amount < 0) throw new PolicyError('amount muss eine Zahl ≥ 0 sein');
  if (typeof auth.currency !== 'string') throw new PolicyError('currency fehlt');
  if (auth.billing_amount_chf != null && (typeof auth.billing_amount_chf !== 'number' || !Number.isFinite(auth.billing_amount_chf) || auth.billing_amount_chf < 0)) throw new PolicyError('billing_amount_chf ist ungültig');
  if (auth.items != null && (!Array.isArray(auth.items) || auth.items.some(i => !i || typeof i !== 'object'))) throw new PolicyError('items ist ungültig');
}

function emptyState() {
  return { drafts: {}, mandates: {}, ledger: [], auths: {}, events: [], seq: 0 };
}

export function createLeashStore({ file = null, registry = DEFAULT_REGISTRY, familiarSeed = [], familiarMerchantsSeed = [], familiarDevicesSeed = [], clock = () => Date.now(), stepUpSeconds = 120, velocityMax = 12, textCheck = null } = {}) {
  let state = emptyState();
  if (file && fs.existsSync(file)) {
    // Never erase spend/approvals by silently starting clean after corrupted state.
    state = { ...emptyState(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  }
  const inFlight = new Map();
  const listeners = new Set();
  let persistenceFailed = false;
  function flush() {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(state));
      fs.renameSync(file + '.tmp', file);
      persistenceFailed = false;
    } catch (error) { persistenceFailed = true; throw error; }
  }
  function ensureDurable() { if (persistenceFailed) flush(); }
  function emit(type, data = {}) {
    const ev = { seq: ++state.seq, type, at: nowIso(), ...data };
    state.events.push(ev);
    if (state.events.length > 3000) state.events.splice(0, state.events.length - 3000);
    // Persist before publishing events or returning an approval. On write failure
    // reads/retries stay blocked until the complete state can be saved again.
    flush();
    for (const l of listeners) { try { l(ev); } catch { /* listener errors never break the engine */ } }
    return ev;
  }
  const familiar = () => new Set([...familiarSeed, ...familiarMerchantsSeed.map(f => f.merchant_id), ...state.ledger.filter(e => e.status === 'approved').map(e => e.merchant_id)]);
  const knownShops = () => [...familiarMerchantsSeed, ...state.ledger.filter(e => e.status === 'approved' && e.merchant_name).map(e => ({ merchant_id: e.merchant_id, merchant_name: e.merchant_name }))];
  const knownDevices = () => new Set([...familiarDevicesSeed, ...state.ledger.filter(e => e.status === 'approved' && e.device).map(e => e.device)]);
  const context = () => ({ registry, familiar: familiar(), familiarMerchants: knownShops(), familiarDevices: knownDevices(), config: { velocityMax } });
  const entryOf = (id) => state.ledger.find(e => e.authorization_id === id);

  function mustMandate(id) {
    const m = state.mandates[id];
    if (!m) throw new PolicyError('Leine nicht gefunden', 404);
    return m;
  }

  function publicAuth(id) {
    ensureDurable();
    const a = state.auths[id];
    if (!a) return null;
    return { authorization_id: id, status: a.status, decision: a.decision, resolution: a.resolution, booking: a.booking, authorization: a.auth, created_at: a.created_at };
  }

  const api = {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    events(since = 0) { return state.events.filter(e => e.seq > since); },
    flush,
    ensureDurable,

    createDraft(body) {
      const input = validateMandateInput(body);
      const draft = { draft_id: uid('DR'), status: 'draft', created_at: nowIso(), ...input };
      state.drafts[draft.draft_id] = draft;
      emit('mandate.drafted', { draft_id: draft.draft_id, rules: input.hard_rules.length });
      return draft;
    },

    confirmDraft(draftId, body) {
      const d = state.drafts[draftId];
      if (!d) throw new PolicyError('Entwurf nicht gefunden', 404);
      if (body?.confirmed !== true) throw new PolicyError('Bestätigung fehlt: confirmed muss true sein', 400);
      // Only one active leash per customer in this prototype: a new one replaces the old.
      for (const m of Object.values(state.mandates)) if (m.status === 'active' || m.status === 'paused') { m.status = 'revoked'; m.revoked_at = nowIso(); cancelPending(m.mandate_id, 'Durch neue Leine ersetzt.'); }
      const { draft_id, status, ...rest } = d;
      const m = { ...rest, mandate_id: uid('TM'), version: 1, status: 'active', confirmed_at: nowIso(), draft_id,
        history: [{ version: 1, at: nowIso(), by: 'customer', text: 'Leine bestätigt', changes: [] }] };
      state.mandates[m.mandate_id] = m;
      delete state.drafts[draftId];
      emit('mandate.confirmed', { mandate_id: m.mandate_id, version: 1 });
      return m;
    },

    getMandate(id) { return mustMandate(id); },
    activeMandate() { return Object.values(state.mandates).find(m => m.status === 'active' || m.status === 'paused') ?? null; },
    latestMandate() { return Object.values(state.mandates).sort((a, b) => (b.confirmed_at ?? '').localeCompare(a.confirmed_at ?? ''))[0] ?? null; },

    updateMandate(id, update, { customerConfirmed = false } = {}) {
      const m = mustMandate(id);
      if (m.status === 'revoked') throw new PolicyError('Die Leine ist gekappt. Lege eine neue an.', 409);
      if (!update || typeof update !== 'object') throw new PolicyError('Änderung fehlt');
      // Validate the whole proposed mandate before mutating anything. Recovery
      // changes the existing mandate so previous bookings still consume its budget.
      const next = structuredClone(validateMandateInput({ ...m, ...update }));
      const fields = ['instruction', 'trip', 'guidance', 'open_questions'];
      const metadata = fields.filter(key => Object.hasOwn(update, key) && fingerprint(m[key] ?? null) !== fingerprint(next[key] ?? null));
      const changes = diffMandate(m, Object.fromEntries(Object.keys(update).filter(key => Object.hasOwn(next, key)).map(key => [key, next[key]])));
      for (const key of metadata) changes.push({ type: 'changed', rule_id: key, text: ({ instruction: 'Suchwunsch geändert', trip: 'Reisedaten geändert', guidance: 'Präferenzen geändert', open_questions: 'Offene Angaben geändert' })[key] });
      if (!changes.length) return { mandate: m, changes };
      const hasBookings = Object.values(state.auths).some(a => a.auth.mandate_id === id && a.booking);
      const itineraryChanged = ['origin', 'destination', 'start_date', 'end_date', 'travelers'].some(key => fingerprint(m.trip?.[key] ?? null) !== fingerprint(next.trip?.[key] ?? null));
      if (hasBookings && itineraryChanged) {
        throw new PolicyError('Für diese Reise gibt es bereits eine Buchung. Ort, Reisedaten und Reisende können hier nicht geändert werden; passe nur Budget, Preisgrenzen oder Wünsche an.', 409, { booked_itinerary: true });
      }
      const looser = changes.filter(c => c.type === 'looser');
      if (metadata.length && !customerConfirmed) {
        throw new PolicyError('Geänderte Suchwünsche und Reisedaten brauchen deine ausdrückliche Bestätigung', 409, { requires_confirmation: true, changes });
      }
      if (looser.length && !customerConfirmed) {
        throw new PolicyError('Lockern braucht deine ausdrückliche Bestätigung', 409, { requires_confirmation: true, changes });
      }
      for (const key of ['hard_rules', 'uncertainty_policy', 'valid_until', ...fields]) {
        if (Object.hasOwn(update, key)) m[key] = next[key];
      }
      m.version += 1;
      m.history.push({ version: m.version, at: nowIso(), by: 'customer', text: looser.length || metadata.length ? 'Leine geändert (bestätigt)' : 'Leine gekürzt', changes });
      emit('mandate.updated', { mandate_id: id, version: m.version, changes, loosened: looser.length > 0 });
      return { mandate: m, changes };
    },

    setStatus(id, status) {
      const m = mustMandate(id);
      if (m.status === 'revoked') throw new PolicyError('Die Leine ist schon gekappt.', 409);
      if (!['active', 'paused', 'revoked'].includes(status)) throw new PolicyError('Status ungültig');
      const before = m.status;
      m.status = status;
      if (status === 'revoked') {
        m.revoked_at = nowIso();
        cancelPending(id, 'Du hast die Leine gekappt.');
      }
      const text = { active: 'Agent fortgesetzt', paused: 'Agent pausiert', revoked: 'Leine gekappt' }[status];
      m.history.push({ version: m.version, at: nowIso(), by: 'customer', text, changes: [] });
      emit(`mandate.${status === 'active' ? 'resumed' : status}`, { mandate_id: id, before });
      return m;
    },

    // HTTP requests enter here. Synchronous authorize remains available for the
    // explicitly deterministic offline replay; it is never an HTTP bypass.
    async authorizeChecked(input) {
      validateAuthorization(input);
      // Agent-provided conversion is not issuer evidence. The public agent API
      // may only use the engine's configured rate; local issuer CSV replay uses
      // authorize() directly with its separately sourced billing context.
      if (input.billing_amount_chf != null) {
        const expected = toChf(input.amount, input.currency);
        if (expected == null || Math.abs(expected - input.billing_amount_chf) > 1e-9) {
          throw new PolicyError('billing_amount_chf widerspricht dem Betrag und dem hinterlegten Wechselkurs. Der Agent darf den Abrechnungsbetrag nicht selbst festlegen.', 400);
        }
      }
      const auth = structuredClone(input);
      const hash = fingerprint(auth);
      const existing = state.auths[auth.authorization_id];
      if (existing) return api.authorize(auth);
      const pending = inFlight.get(auth.authorization_id);
      if (pending) {
        if (pending.hash !== hash) throw new PolicyError('Diese ID gehört zu anderen Kaufdaten. Neue Anfrage-ID erforderlich.', 409);
        return pending.promise;
      }
      const promise = (async () => {
        const mandate = state.mandates[auth.mandate_id] ?? null;
        const precheck = evaluate({ auth, mandate, ledger: state.ledger, ...context(), now: clock() });
        if (!textCheck || precheck.decision === 'decline') return api.authorize(auth);
        const input = semanticInput(mandate, auth);
        if (!input) return api.authorize(auth);
        const version = mandate.version;
        emit('authorization.semantic.started', { authorization_id: auth.authorization_id, mandate_id: auth.mandate_id });
        const start = performance.now();
        let result;
        try { result = normalizeSemantic(await textCheck(input)); }
        catch { result = { passung: 'unklar', quelle: 'ersatz' }; }
        const current = state.mandates[auth.mandate_id];
        // A response for an older policy cannot approve a newly changed policy.
        if (!current || current.version !== version) result = { passung: 'unklar', quelle: 'ersatz' };
        const assessment = { ...result, latency_ms: Math.round((performance.now() - start) * 100) / 100,
          mandate_version: version, input_hash: fingerprint(input) };
        emit('authorization.semantic.completed', { authorization_id: auth.authorization_id, ...assessment });
        // Fresh budget, status and rule evaluation occurs synchronously at commit,
        // after Jev. Concurrent purchases cannot spend the same available budget.
        return api.authorize(auth, assessment);
      })();
      inFlight.set(auth.authorization_id, { hash, promise });
      try { return await promise; } finally { inFlight.delete(auth.authorization_id); }
    },

    authorize(input, assessment = null) {
      validateAuthorization(input);
      const auth = structuredClone(input);
      // Repeated delivery: answer with the stored result, never count twice.
      const existing = state.auths[auth.authorization_id];
      if (existing) {
        if (fingerprint(existing.auth) !== fingerprint(auth)) throw new PolicyError('Diese ID gehört zu anderen Kaufdaten. Neue Anfrage-ID erforderlich.', 409);
        emit('authorization.replayed', { authorization_id: auth.authorization_id, status: existing.status });
        return { ...existing.decision, status: existing.status, replay: true, resolution: existing.resolution };
      }
      const mandate = state.mandates[auth.mandate_id] ?? null;
      const decision = withSemantic(evaluate({ auth, mandate, ledger: state.ledger, ...context(), now: clock() }), assessment, mandate);
      const status = decision.decision === 'approve' ? 'approved' : decision.decision === 'decline' ? 'declined' : 'pending';
      const t = auth.travel ?? {};
      if (decision.decision === 'step_up') decision.step_up = { expires_at: new Date(clock() + stepUpSeconds * 1000).toISOString(), window_seconds: stepUpSeconds };
      state.auths[auth.authorization_id] = { auth, decision, status, created_at: nowIso(), resolution: null, booking: null };
      state.ledger.push({
        authorization_id: auth.authorization_id, mandate_id: auth.mandate_id ?? null, kind: t.kind ?? null,
        amount_chf: decision.facts.amount_chf ?? 0, status, start_date: t.start_date ?? null, end_date: t.end_date ?? null,
        destination_city: t.destination_city ?? null, origin_city: t.origin_city ?? null,
        merchant_id: auth.merchant?.merchant_id ?? null, merchant_name: auth.merchant?.merchant_name ?? null,
        items_key: Array.isArray(auth.items) ? auth.items.map(i => i.item_name).sort().join('|') : null, device: auth.customer_device_id ?? null,
        title: t.title ?? auth.purchase_description ?? KIND_LABEL[t.kind] ?? 'Kauf', timestamp: auth.timestamp ?? nowIso(), received_at: new Date(clock()).toISOString(),
      });
      // A new quote replaces a still-open older one, so the older one no longer reserves budget.
      const rel = auth.related_authorization_id && state.auths[auth.related_authorization_id];
      if (rel && rel.status === 'pending') { setFinal(auth.related_authorization_id, 'superseded', { by: 'leash', text: 'Durch neues Angebot ersetzt.', superseded_by: auth.authorization_id }); }
      emit('authorization.decided', { authorization_id: auth.authorization_id, mandate_id: auth.mandate_id ?? null, decision: decision.decision, status, headline: decision.headline, summary: decision.summary, amount_chf: decision.facts.amount_chf, kind: t.kind ?? null, latency_ms: decision.latency_ms });
      return { ...decision, status };
    },

    resolve(id, body) {
      const a = state.auths[id];
      if (!a) throw new PolicyError('Anfrage nicht gefunden', 404);
      if (a.status !== 'pending') throw new PolicyError(`Diese Anfrage ist schon abgeschlossen (${a.status}).`, 409, { status: a.status, resolution: a.resolution });
      if (!['approve', 'decline'].includes(body?.decision)) throw new PolicyError('decision muss approve oder decline sein');
      if (Date.parse(a.decision.step_up?.expires_at) < clock()) { api.sweep(); throw new PolicyError('Zeit abgelaufen – sicherheitshalber abgelehnt.', 409); }
      const mandate = state.mandates[a.auth.mandate_id];
      if (body.decision === 'decline') {
        setFinal(id, 'declined', { by: 'customer', decision: 'decline', text: body.customer_message || 'Du hast abgelehnt.' });
        return publicAuth(id);
      }
      // A "yes" cannot override a hard rule: check again with the current leash and budget.
      const recheck = evaluate({ auth: a.auth, mandate, ledger: state.ledger, ...context(), now: clock() });
      const hard = recheck.checks.some(c => c.status === 'fail') || recheck.signals.some(s => s.severity === 'block');
      if (hard) {
        setFinal(id, 'declined', { by: 'leash', decision: 'decline', text: `Dein Ja kann keine harte Regel überstimmen: ${recheck.summary}`, recheck });
      } else {
        if (a.decision.mandate_version !== mandate.version || (a.decision.semantic_check && a.decision.semantic_check.mandate_version !== mandate.version)) {
          throw new PolicyError('Die Regeln wurden geändert. Bitte das Angebot unter den neuen Regeln erneut prüfen.', 409);
        }
        setFinal(id, 'approved', { by: 'customer', decision: 'approve', text: body.customer_message || 'Du hast freigegeben.' });
      }
      return publicAuth(id);
    },

    // Agent reports that an approved purchase could not be executed: release the budget.
    voidAuthorization(id, reason) {
      const a = state.auths[id];
      if (!a) throw new PolicyError('Anfrage nicht gefunden', 404);
      if (a.status !== 'approved') throw new PolicyError('Nur freigegebene Käufe können storniert werden', 409);
      if (a.booking) throw new PolicyError('Eine gemeldete Buchung braucht einen bestätigten Storno-/Erstattungsnachweis. Budget bleibt gebunden.', 409);
      setFinal(id, 'voided', { by: 'agent', text: reason || 'Buchung nicht ausgeführt.' });
      return publicAuth(id);
    },

    markBooked(id, booking) {
      const a = state.auths[id];
      if (!a) throw new PolicyError('Anfrage nicht gefunden', 404);
      if (a.status !== 'approved') throw new PolicyError('Nur freigegebene Käufe dürfen gebucht werden', 409);
      a.booking = { ...booking, at: nowIso() };
      emit('booking.confirmed', { authorization_id: id, booking: a.booking, title: a.auth.travel?.title ?? a.auth.purchase_description });
      return publicAuth(id);
    },

    sweep() {
      const now = clock();
      for (const [id, a] of Object.entries(state.auths)) {
        if (a.status === 'pending' && Date.parse(a.decision.step_up?.expires_at) < now) {
          setFinal(id, 'expired', { by: 'leash', decision: 'decline', text: `Keine Antwort in ${stepUpSeconds} Sekunden – sicherheitshalber abgelehnt.` });
        }
      }
    },

    get(id) { return publicAuth(id); },
    list(mandateId) {
      return Object.keys(state.auths).map(publicAuth).filter(a => !mandateId || a.authorization.mandate_id === mandateId)
        .sort((x, y) => x.created_at.localeCompare(y.created_at));
    },

    summary(mandateId) {
      ensureDurable();
      const m = state.mandates[mandateId];
      if (!m) throw new PolicyError('Leine nicht gefunden', 404);
      const budgetRule = m.hard_rules.find(r => r.kind === 'budget_total') ?? m.hard_rules.find(r => r.field === 'authorization.billing_amount_chf' && r.scope === 'period');
      const entries = state.ledger.filter(e => e.mandate_id === mandateId);
      const approved = round2(entries.filter(e => e.status === 'approved').reduce((s, e) => s + e.amount_chf, 0));
      const pending = round2(entries.filter(e => e.status === 'pending').reduce((s, e) => s + e.amount_chf, 0));
      const limit = budgetRule?.value ?? null;
      const counts = {};
      for (const e of entries) counts[e.status] = (counts[e.status] ?? 0) + 1;
      const bookings = Object.entries(state.auths).filter(([, a]) => a.auth.mandate_id === mandateId && a.booking)
        .map(([authorization_id, a]) => ({ authorization_id, kind: a.auth.travel?.kind ?? null, booking: structuredClone(a.booking) }));
      return { mandate_id: mandateId, status: m.status, version: m.version, limit, approved, pending,
        free: limit == null ? null : round2(limit - approved), free_after_pending: limit == null ? null : round2(limit - approved - pending), counts, bookings };
    },

    reset() {
      state = { ...emptyState(), seq: state.seq }; // event numbers keep counting so followers never miss events
      flush();
      emit('system.reset');
    },
  };

  function setFinal(id, status, resolution) {
    const a = state.auths[id];
    a.status = status;
    a.resolution = { ...resolution, at: nowIso() };
    const e = entryOf(id);
    if (e) e.status = status;
    emit('authorization.resolved', { authorization_id: id, mandate_id: a.auth.mandate_id ?? null, status, by: resolution.by, text: resolution.text, amount_chf: a.decision.facts.amount_chf, kind: a.auth.travel?.kind ?? null });
  }
  function cancelPending(mandateId, text) {
    for (const [id, a] of Object.entries(state.auths)) {
      if (a.status === 'pending' && a.auth.mandate_id === mandateId) setFinal(id, 'cancelled', { by: 'customer', decision: 'decline', text });
    }
  }
  api.UNC_LABEL = UNC_LABEL;
  api.FINAL = FINAL;
  api.fmtMoney = fmtMoney;
  return api;
}
