import { findPlace, placeQuery } from './geo.js';
import { byCity } from './places.js';

// Resolve the customer's route independently of the flight provider. A named but
// unresolved airport remains a required question; it never falls back to Zurich.
export async function resolvePlaces(text, intent, answers, duffel, lookupOptions = {}) {
  const I = { ...intent };
  const apply = (role, found, query, answered = false) => {
    Object.assign(I, { [role]: null, [`${role}_place`]: null, [`${role}_choices`]: null,
      [`${role}_not_found`]: null, [`${role}_quote`]: answered ? null : (found?.quote ?? query), [`${role}_answered`]: answered });
    if (found?.choices?.length) I[`${role}_choices`] = found.choices;
    else if (found?.place) {
      I[`${role}_place`] = found.place;
      I[`${role}_alternatives`] = found.alternatives;
      if (role === 'origin') I.origin_text = null;
    } else {
      I[`${role}_not_found`] = query;
      if (role === 'origin') I.origin_text = query;
    }
  };
  const answerQuery = value => byCity(value)?.name ?? String(value).replace(/^iata:/, '');

  const originAnswer = answers.origin ? answerQuery(answers.origin) : null;
  const originQuery = originAnswer ?? I.origin_query ?? I.origin_text ?? placeQuery(text, 'origin');
  if (originQuery) {
    apply('origin', await findPlace(originQuery, duffel, { ...lookupOptions, context: text }), originQuery, !!originAnswer);
    // Prevent buildDraft from overwriting a resolved airport with a city shortcut.
    delete answers.origin;
  }
  const origin = I.origin_place ?? byCity(I.origin);
  const exclude = [originQuery, I.origin_text, origin?.name, origin?.en, origin?.iata, ...(origin?.aliases ?? [])].filter(Boolean);

  const destinationAnswer = answers.destination ? answerQuery(answers.destination) : null;
  const destinationQuery = destinationAnswer ?? placeQuery(text, 'destination') ?? byCity(I.destination)?.name;
  const query = destinationQuery ?? text;
  const found = await findPlace(query, duffel, { ...lookupOptions, exclude, context: text });
  apply('destination', found, destinationQuery, !!destinationAnswer);
  delete answers.destination;

  // Town without airport: the customer may select another nearby airport.
  const p = I.destination_place;
  if (p?.airport && answers.airport && answers.airport !== p.airport.iata) {
    const alt = p.airport_alternatives?.find(a => a.iata === answers.airport);
    if (alt) {
      const others = [p.airport, ...p.airport_alternatives].filter(a => a.iata !== alt.iata);
      I.destination_place = { ...p, iata: alt.iata, airport: alt, airport_alternatives: others,
        aliases: [...new Set([p.name, alt.iata, alt.city])] };
    }
  }
  return I;
}
