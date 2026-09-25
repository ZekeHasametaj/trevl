// Hotels from Nuitée / LiteAPI in sandbox mode: search → prebook → book (no real stay, no real money).
// Sandbox payment uses the account's own test setup (ACC_CREDIT_CARD); trevl never handles card data.
// Without a working key, or on any error, the agent falls back to the synthetic market.

const API = 'https://api.liteapi.travel/v3.0';
const BOOK = 'https://book.liteapi.travel/v3.0';
export const LITEAPI_MERCHANT = { merchant_id: 'ME-LITEAPI', merchant_name: 'Nuitée (LiteAPI)', domain: 'liteapi.travel', merchant_category: 'lodging', merchant_mcc: '7011', merchant_country: 'FR' };

export function createLiteApi({ key = process.env.LITEAPI_KEY, enabled = process.env.HOTELS_PROVIDER === 'liteapi', timeoutMs = 15000 } = {}) {
  // Only sandbox keys (sand_…): a production key would book real rooms with real money.
  const sandbox = /^sand_/.test(key ?? '');
  const on = !!(enabled && key && sandbox);

  async function call(base, path, { method = 'GET', body } = {}) {
    const res = await fetch(`${base}${path}`, {
      method, headers: { 'X-API-Key': key, accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(`LiteAPI: ${json?.error?.message ?? json?.message ?? `HTTP ${res.status}`}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  return {
    on,
    label: on ? 'LiteAPI Sandbox' : enabled && key && !sandbox ? 'Testmarkt (LiteAPI: nur Sandbox-Schlüssel sand_… erlaubt)' : 'Testmarkt',

    // Real hotel offers for the trip, mapped to trevl's offer format (same shape as the synthetic market).
    async searchHotels(trip, { max = 4 } = {}) {
      if (!on) return [];
      // Hotels in the city itself, not around its airport: coordinates for towns, else city + country; airport code last.
      const d = trip.destination ?? {};
      const where = d.lat != null && d.airport ? { latitude: d.lat, longitude: d.lng, radius: 10000 }
        : d.en && d.country && !d.is_region ? { cityName: d.en, countryCode: d.country } : { iataCode: d.iata };
      const json = await call(API, '/hotels/rates', { method: 'POST', body: {
        ...where, checkin: trip.start_date, checkout: trip.end_date, occupancies: [{ adults: trip.travelers ?? 1 }],
        currency: 'EUR', guestNationality: 'CH', maxRatesPerHotel: 1, includeHotelData: true, timeout: 8,
      } });
      const info = new Map([...(json.hotels ?? []), ...(json.data ?? []).map(h => h.hotel).filter(Boolean)].map(h => [h.id ?? h.hotelId, h]));
      const nights = Math.max(1, Math.round((Date.parse(trip.end_date) - Date.parse(trip.start_date)) / 864e5));
      const offers = [];
      for (const h of json.data ?? []) {
        const rt = h.roomTypes?.[0];
        const rate = rt?.rates?.[0];
        if (!rt?.offerId || !rate) continue;
        const total = rt.offerRetailRate?.amount ?? rate.retailRate?.total?.[0]?.amount;
        const currency = rt.offerRetailRate?.currency ?? rate.retailRate?.total?.[0]?.currency ?? 'EUR';
        if (typeof total !== 'number') continue;
        const meta = info.get(h.hotelId) ?? {};
        const tag = rate.cancellationPolicies?.refundableTag;
        const name = meta.name ?? `Hotel ${h.hotelId}`;
        const board = rate.boardName ? `, ${rate.boardName}` : '';
        offers.push({
          id: `lite_${rt.offerId}`, offer_id: rt.offerId, provider: 'liteapi', kind: 'hotel', key: `lite_${h.hotelId}`, title: name, stars: meta.stars ?? null, nights,
          city: trip.destination?.name, iata: trip.destination?.iata ?? null, amount: Math.round(total * 100) / 100, currency,
          cancellable: tag === 'RFN' ? 'true' : tag === 'NRFN' ? 'false' : 'unknown', merchant: LITEAPI_MERCHANT,
          items: [{ item_name: `${rate.name ?? 'Zimmer'}${board}, ${nights} ${nights === 1 ? 'Nacht' : 'Nächte'}`, item_category: 'hotel_room', quantity: 1, unit_price: Math.round(total * 100) / 100, currency,
            item_details: [meta.address, meta.city_name ?? meta.city].filter(Boolean).join(', ') || name }],
          start_date: trip.start_date, end_date: trip.end_date, travelers: trip.travelers ?? 1,
        });
      }
      // A few honest options: cheapest refundable ones first, then the cheapest overall.
      offers.sort((a, b) => a.amount - b.amount);
      const refundable = offers.filter(o => o.cancellable === 'true').slice(0, max - 1);
      const rest = offers.filter(o => !refundable.includes(o)).slice(0, 1);
      return [...refundable, ...rest];
    },

    // Locks the price. Returns the checked price so the leash can be asked again if it moved.
    async prebook(offer) {
      const json = await call(BOOK, '/rates/prebook', { method: 'POST', body: { offerId: offer.offer_id, usePaymentSdk: false } });
      const d = json.data ?? {};
      const tag = d.roomTypes?.[0]?.rates?.[0]?.cancellationPolicies?.refundableTag;
      return { prebookId: d.prebookId, amount: typeof d.price === 'number' ? d.price : offer.amount, currency: d.currency ?? offer.currency,
        cancellable: tag === 'RFN' ? 'true' : tag === 'NRFN' ? 'false' : offer.cancellable, cancellationChanged: !!d.cancellationChanged };
    },

    // One lead guest per room (LiteAPI rejects a guest entry per person). Synthetic test names only.
    async book(prebookId, travelers = 1, reference) {
      const person = { firstName: 'Alex', lastName: 'Trevltest', email: 'trevl-test-1@example.com' };
      const json = await call(BOOK, '/rates/book', { method: 'POST', body: {
        prebookId, clientReference: reference, holder: person, guests: [{ occupancyNumber: 1, ...person }], payment: { method: 'ACC_CREDIT_CARD' },
      } });
      const d = json.data ?? {};
      if (d.status && d.status !== 'CONFIRMED') throw new Error(`LiteAPI: Buchung nicht bestätigt (${d.status})`);
      // In the sandbox the hotel code is always "test", so the LiteAPI booking ID is the reference.
      const code = d.hotelConfirmationCode && d.hotelConfirmationCode !== 'test' ? d.hotelConfirmationCode : null;
      return { provider: 'liteapi', booking_reference: code ?? d.bookingId, booking_id: d.bookingId, hotel_code: d.hotelConfirmationCode ?? null, status: d.status,
        total: `${d.currency ?? ''} ${d.price ?? ''}`.trim(), sandbox: true };
    },
  };
}
