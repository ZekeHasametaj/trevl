import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiteApi } from '../server/app/liteapi.js';

const trip = { destination: { name: 'Lissabon', en: 'Lisbon', iata: 'LIS', country: 'PT' }, start_date: '2026-10-09', end_date: '2026-10-12', travelers: 2 };

// Responses shaped as in LiteAPI's reference (POST /hotels/rates, /rates/prebook, /rates/book).
function stubFetch(routes) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null, headers: init?.headers });
    const key = Object.keys(routes).find(k => url.endsWith(k));
    return new Response(JSON.stringify(routes[key]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test('LiteAPI: rates are mapped to trevl offers with real refund terms; prebook and book use the documented fields', async () => {
  const f = stubFetch({
    '/hotels/rates': {
      data: [
        { hotelId: 'lp1', roomTypes: [{ offerId: 'OFF-1', offerRetailRate: { amount: 402.5, currency: 'EUR' }, rates: [{ name: 'Double Room', boardName: 'Room Only', retailRate: { total: [{ amount: 402.5, currency: 'EUR' }] }, cancellationPolicies: { refundableTag: 'RFN' } }] }] },
        { hotelId: 'lp2', roomTypes: [{ offerId: 'OFF-2', rates: [{ name: 'Budget Twin', retailRate: { total: [{ amount: 250, currency: 'EUR' }] }, cancellationPolicies: { refundableTag: 'NRFN' } }] }] },
      ],
      hotels: [{ id: 'lp1', name: 'Real Hotel Alfama', stars: 4, address: 'Rua 1', city: 'Lisbon' }, { id: 'lp2', name: 'Real Hostel', stars: 2 }],
    },
    '/rates/prebook': { data: { prebookId: 'PB-9', price: 402.5, currency: 'EUR', roomTypes: [{ rates: [{ cancellationPolicies: { refundableTag: 'RFN' } }] }] } },
    '/rates/book': { data: { bookingId: 'BK-7', status: 'CONFIRMED', hotelConfirmationCode: 'HC-123', price: 402.5, currency: 'EUR' } },
  });
  try {
    const api = createLiteApi({ key: 'sand_test', enabled: true });
    const offers = await api.searchHotels(trip);
    assert.equal(offers.length, 2);
    const good = offers.find(o => o.title === 'Real Hotel Alfama');
    assert.equal(good.cancellable, 'true');
    assert.equal(good.amount, 402.5);
    assert.equal(good.merchant.merchant_id, 'ME-LITEAPI');
    assert.equal(offers.find(o => o.title === 'Real Hostel').cancellable, 'false');
    assert.equal(f.calls[0].body.cityName, 'Lisbon');
    assert.equal(f.calls[0].body.countryCode, 'PT');
    assert.deepEqual(f.calls[0].body.occupancies, [{ adults: 2 }]);
    assert.equal(f.calls[0].headers['X-API-Key'], 'sand_test');

    const pre = await api.prebook(good);
    assert.equal(pre.prebookId, 'PB-9');
    assert.equal(f.calls[1].body.offerId, 'OFF-1');
    const b = await api.book(pre.prebookId, 2, 'AZ-1');
    assert.equal(b.booking_reference, 'HC-123');
    assert.equal(f.calls[2].body.guests.length, 1);
    assert.equal(f.calls[2].body.holder.phone, undefined);
    assert.equal(f.calls[2].body.payment.method, 'ACC_CREDIT_CARD');
    assert.equal(f.calls[2].body.prebookId, 'PB-9');
  } finally { f.restore(); }
});

test('LiteAPI stays off without a key or without the switch', () => {
  assert.equal(createLiteApi({ key: '', enabled: true }).on, false);
  assert.equal(createLiteApi({ key: 'sand_x', enabled: false }).on, false);
});
