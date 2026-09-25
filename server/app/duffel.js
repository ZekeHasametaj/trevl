// Duffel flights in test mode only (duffel_test_ keys, Duffel Airways, balance payment, no real money).
// Without a key trevl uses clearly labelled demo offers so the app stays predictable.

const API = 'https://api.duffel.com';

export function createDuffel({ token = process.env.DUFFEL_ACCESS_TOKEN, timeoutMs = 25000 } = {}) {
  const mode = token && token.startsWith('duffel_test_') ? 'test' : token ? 'refused_live_key' : 'off';

  async function request(path, data) {
    const res = await fetch(`${API}${path}`, {
      method: data === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Duffel-Version': 'v2', Accept: 'application/json', 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify({ data }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = json?.errors?.[0]?.message ?? `HTTP ${res.status}`;
      const err = new Error(`Duffel: ${msg}`);
      err.status = res.status; err.code = json?.errors?.[0]?.code;
      throw err;
    }
    return json;
  }

  return {
    mode,
    label: mode === 'test' ? 'Duffel Testmodus' : mode === 'refused_live_key' ? 'Duffel aus (nur Test-Schlüssel erlaubt)' : 'Demo-Flüge (kein Duffel-Schlüssel)',

    async searchRoundTrip({ origin, destination, departDate, returnDate, adults, cabin = 'economy', direct = false }) {
      if (mode !== 'test') return demoOffers({ origin, destination, departDate, returnDate, adults, cabin });
      const slices = [{ origin, destination, departure_date: departDate }];
      if (returnDate) slices.push({ origin: destination, destination: origin, departure_date: returnDate });
      const body = { slices, passengers: Array.from({ length: adults }, () => ({ type: 'adult' })), cabin_class: cabin };
      if (direct) body.max_connections = 0;
      const json = await request('/air/offer_requests?return_offers=true&supplier_timeout=10000', body);
      const offers = (json?.data?.offers ?? []).filter(o => o.live_mode === false && Date.parse(o.expires_at) > Date.now());
      // In test mode only Duffel Airways (ZZ), Duffel's official test airline, is reliably bookable.
      const bookable = offers.filter(o => o.owner?.iata_code === 'ZZ');
      return (bookable.length ? bookable : offers).map(normalize).sort((a, b) => a.amount_chf_hint - b.amount_chf_hint).slice(0, 12);
    },

    // Worldwide airports and cities by name (Duffel Places). Returns [] without a test key or on error.
    // With { lat, lng, radius } instead of a query: the airports around a point.
    async placeSuggestions(query, near) {
      if (mode !== 'test' || (!near && (!query || query.length < 3))) return [];
      const qs = near ? `lat=${near.lat}&lng=${near.lng}&rad=${near.radius ?? 150000}` : `query=${encodeURIComponent(query)}`;
      try {
        const res = await fetch(`${API}/places/suggestions?${qs}`, {
          headers: { Authorization: `Bearer ${token}`, 'Duffel-Version': 'v2', Accept: 'application/json' }, signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return [];
        const json = await res.json();
        return (json.data ?? []).map(p => ({ type: p.type, name: p.name, iata_code: p.iata_code, city_name: p.city_name ?? (p.type === 'city' ? p.name : null),
          iata_city_code: p.iata_city_code ?? null, country: p.iata_country_code ?? null, airports: (p.airports ?? []).map(a => a.iata_code),
          lat: p.latitude ?? null, lng: p.longitude ?? null }));
      } catch { return []; }
    },

    async refresh(offer) {
      if (mode !== 'test' || offer.demo) return offer;
      const json = await request(`/air/offers/${encodeURIComponent(offer.id)}`);
      return normalize(json.data);
    },

    async book(offer, attemptId) {
      if (mode !== 'test' || offer.demo) {
        return { provider: 'demo', booking_reference: `DEMO${Math.random().toString(36).slice(2, 6).toUpperCase()}`, order_id: null, live_mode: false, demo: true };
      }
      const names = ['Alex', 'Robin', 'Sascha', 'Luca', 'Noa', 'Kim', 'Andrea', 'Jo', 'Mika'];
      const passengers = offer.passenger_ids.map((id, i) => ({
        id, type: 'adult', given_name: names[i % names.length], family_name: 'Trevltest', born_on: '1990-01-0' + ((i % 9) + 1),
        title: i % 2 ? 'ms' : 'mr', gender: i % 2 ? 'f' : 'm', email: `trevl-test-${i + 1}@example.com`, phone_number: '+12025550101',
      }));
      const json = await request('/air/orders', {
        type: 'instant', selected_offers: [offer.id],
        payments: [{ type: 'balance', amount: offer.total_amount, currency: offer.total_currency }],
        passengers, metadata: { leash_attempt_id: attemptId },
      });
      const o = json.data;
      if (o.live_mode !== false) throw new Error('Duffel meldet Live-Modus – abgebrochen');
      return { provider: 'duffel', booking_reference: o.booking_reference, order_id: o.id, live_mode: false, total: `${o.total_currency} ${o.total_amount}` };
    },
  };
}

const RATE = { CHF: 1, EUR: 0.95, GBP: 1.12, USD: 0.87 };

function normalize(o) {
  const first = o.slices[0], last = o.slices[o.slices.length - 1];
  const seg0 = first.segments[0];
  const pax0 = seg0.passengers?.[0];
  const bags = Math.min(...o.slices.flatMap(s => s.segments.flatMap(g => (g.passengers ?? []).map(p => (p.baggages ?? []).filter(b => b.type === 'checked').reduce((n, b) => n + b.quantity, 0)))));
  const refund = o.conditions?.refund_before_departure;
  const total = Number(o.total_amount);
  return {
    id: o.id, demo: false, expires_at: o.expires_at,
    total_amount: o.total_amount, total_currency: o.total_currency, amount: total,
    amount_chf_hint: total * (RATE[o.total_currency] ?? 1.2),
    airline: { name: o.owner?.name ?? 'Airline', iata: o.owner?.iata_code ?? null },
    passenger_ids: o.passengers.map(p => p.id),
    origin: { iata: first.origin.iata_code, city: first.origin.city_name ?? first.origin.iata_city_code ?? first.origin.iata_code },
    destination: { iata: first.destination.iata_code, city: first.destination.city_name ?? first.destination.iata_city_code ?? first.destination.iata_code },
    depart_at: seg0.departing_at, return_at: o.slices.length > 1 ? last.segments[0].departing_at : null,
    arrive_at: first.segments[first.segments.length - 1].arriving_at,
    return_arrive_at: o.slices.length > 1 ? last.segments[last.segments.length - 1].arriving_at : null,
    flight_numbers: o.slices.map(s => s.segments.map(g => `${g.marketing_carrier?.iata_code ?? ''}${g.marketing_carrier_flight_number ?? ''}`).join('+')),
    stops: Math.max(...o.slices.map(s => s.segments.length - 1)),
    cabin: pax0?.cabin_class ?? null,
    checked_bags: Number.isFinite(bags) ? bags : null,
    refundable: refund == null ? 'unknown' : refund.allowed ? 'true' : 'false',
    travelers: o.passengers.length,
  };
}

// Labelled demo offers, shaped like Duffel's test offers (Duffel Airways, ZZ).
function demoOffers({ origin, destination, departDate, returnDate, adults, cabin }) {
  const mk = (id, perPax, bags, refundable, dep, depArr, ret, retArr, fn) => ({
    id: `demo_off_${id}`, demo: true, expires_at: new Date(Date.now() + 30 * 60e3).toISOString(),
    total_amount: (perPax * adults).toFixed(2), total_currency: 'EUR', amount: +(perPax * adults).toFixed(2), amount_chf_hint: perPax * adults * 0.95,
    airline: { name: 'Duffel Airways', iata: 'ZZ' }, passenger_ids: Array.from({ length: adults }, (_, i) => `pas_demo_${i}`),
    origin: { iata: origin, city: null }, destination: { iata: destination, city: null },
    depart_at: `${departDate}T${dep}:00`, arrive_at: `${departDate}T${depArr}:00`,
    return_at: returnDate ? `${returnDate}T${ret}:00` : null, return_arrive_at: returnDate ? `${returnDate}T${retArr}:00` : null,
    flight_numbers: [`ZZ${fn}`, `ZZ${fn + 1}`], stops: 0, cabin, checked_bags: bags, refundable, travelers: adults,
  });
  return [mk('basic', 149, 0, 'false', '07:10', '09:05', '19:40', '23:30', 1402), mk('standard', 184, 1, 'false', '09:25', '11:20', '18:10', '22:00', 1406), mk('flex', 239, 1, 'true', '12:40', '14:35', '20:50', '00:40', 1410)];
}
