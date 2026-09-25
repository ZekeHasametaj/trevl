# trevl-Leine gegen Visecas öffentliche Szenarien

Erzeugt am 2026-09-25 02:57 mit `node scripts/viseca-replay.mjs`.
Dieselbe Engine wie in der App. Keine Antwortschlüssel (Viseca liefert keine), keine Sonderregeln pro Szenario.
Zeit = simulierte Kaufzeit; Rückfragen ohne Antwort laufen nach 120 s ab und zählen nicht als Ausgabe.

**Ergebnis:** 17 × approve · 19 × decline · 9 × step_up · langsamster Entscheid 8.49 ms (Viseca-Frist: 8 s).

## SCEN0000 · Connection check

> Buy one ordinary grocery item for CHF 20 or less from a shop I use regularly. Ask me when uncertain.

Bestätigte Regeln: Pro Bestellung höchstens CHF 20 · Nur groceries · Nur Shops, bei denen ich schon gekauft habe · bei Unsicherheit: fragen

Bekannte Shops aus dem Verlauf: 24 · bekannte Geräte: 3

| # | Zeit | Shop | Betrag | Entscheid | Gründe | Erklärung |
|---|---|---|---|---|---|---|
| 1 | 08-09 10:04 | Alpine Basket | CHF 20.00 | ✅ approve | within_policy | Passt zu deiner Leine: 3 Regeln erfüllt. |

## SCEN0001 · Household budget

> Order our household groceries for delivery. Keep each order at or below CHF 120 including delivery, and keep the total across any seven days at or below CHF 300. Ask me when uncertain.

Bestätigte Regeln: Pro Bestellung höchstens CHF 120 · Höchstens CHF 300 in 7 Tagen · Nur groceries, household · bei Unsicherheit: fragen

Bekannte Shops aus dem Verlauf: 24 · bekannte Geräte: 3

| # | Zeit | Shop | Betrag | Entscheid | Gründe | Erklärung |
|---|---|---|---|---|---|---|
| 1 | 08-10 09:12 | Alpine Basket | CHF 44.50 | ✅ approve | within_policy | Passt zu deiner Leine: 3 Regeln erfüllt, danach noch CHF 255.50 frei. |
| 2 | 08-11 18:35 | Alpine Basket | CHF 120.00 | ✅ approve | within_policy | Passt zu deiner Leine: 3 Regeln erfüllt, danach noch CHF 135.50 frei. |
| 3 | 08-12 10:05 | Alpine Basket | CHF 126.00 | ⛔ decline | per_booking_limit | Teurer als dein Limit pro Buchung (CHF 120.00). |
| 4 | 08-13 17:20 | Alpine Basket | CHF 70.00 | ✅ approve | within_policy | Passt zu deiner Leine: 3 Regeln erfüllt, danach noch CHF 65.50 frei. |
| 5 | 08-13 17:26 | Alpine Basket | CHF 65.00 | ❓ step_up | split_order, customer_confirmation | Zusammen mit der Bestellung von 6 Minuten zuvor (CHF 70.00) über deinem Limit pro Bestellung – aufgeteilte Bestellung? Deine Regel für Unsicherheit: mich fragen. |
| 6 | 08-14 11:40 | Alpine Basket | CHF 62.00 | ⛔ decline | addon_not_allowed | Im Warenkorb sind Extras, die du nicht wolltest: Fragrance and beauty gift (CHF 32.00). |
| 7 | 08-15 09:30 | Alpine Basket | CHF 65.50 | ✅ approve | within_policy | Passt zu deiner Leine: 3 Regeln erfüllt, danach noch CHF 0.00 frei. |
| 8 | 08-16 16:10 | Alpine Basket | CHF 24.00 | ⛔ decline | trip_budget_exceeded | Dein Limit für 7 Tage reicht nicht: Es sind nur noch CHF 0.00 frei, der Kauf kostet CHF 24.00. |
| 9 | 08-18 10:00 | Alpine Basket | CHF 138.00 | ⛔ decline | per_booking_limit, trip_budget_exceeded | Teurer als dein Limit pro Buchung (CHF 120.00). Ausserdem: Dein Limit für 7 Tage reicht nicht: Es sind nur noch CHF 44.50 frei, der Kauf kostet CHF 138.00. |
| 10 | 08-19 09:45 | Alpine Basket | CHF 88.00 | ✅ approve | within_policy | Passt zu deiner Leine: 3 Regeln erfüllt, danach noch CHF 76.50 frei. |

## SCEN0002 · Requested item and order terms

> Replace my worn road-running shoes in size 43. Buy only from a specialist sports retailer, only if the order can be returned within 14 days or more, and pay no more than CHF 200. Ask me when uncertain.

Bestätigte Regeln: Nur: Road-running shoes · Grösse 43 · Nur Sport-Fachhändler · Rückgabe möglich · Rückgabe mindestens 14 Tage · Pro Bestellung höchstens CHF 200 · bei Unsicherheit: fragen

Bekannte Shops aus dem Verlauf: 20 · bekannte Geräte: 3

| # | Zeit | Shop | Betrag | Entscheid | Gründe | Erklärung |
|---|---|---|---|---|---|---|
| 1 | 08-11 10:15 | TrailSpark | CHF 165.00 | ✅ approve | within_policy | Passt zu deiner Leine: 6 Regeln erfüllt. |
| 2 | 08-11 14:40 | TrailSpark | CHF 155.00 | ⛔ decline | wrong_size, duplicate_booking | Grösse 43: Road-running shoes (CHF 155.00) passt nicht (laut Händlertext). Ausserdem: Doppelte Bestellung: dieselben Artikel bei TrailSpark wurden am 11.8.2026 schon gekauft (CHF 165.00). |
| 3 | 08-12 09:05 | TrailSpark | CHF 145.00 | ⛔ decline | return_terms, duplicate_booking | Keine Rückgabe möglich – du wolltest zurückgeben können. Ausserdem: Rückgabe mindestens 14 Tage: Road-running shoes (CHF 145.00) passt nicht (laut Händlertext). |
| 4 | 08-12 16:30 | TrailSpark | CHF 158.00 | ⛔ decline | return_terms, duplicate_booking | Rückgabe mindestens 14 Tage: Road-running shoes (CHF 158.00) passt nicht (laut Händlertext). Ausserdem: Doppelte Bestellung: dieselben Artikel bei TrailSpark wurden am 11.8.2026 schon gekauft (CHF 165.00). |
| 5 | 08-13 11:20 | TrailSpark | CHF 175.00 | ❓ step_up | return_terms_unknown, customer_confirmation | Rückgabe möglich ist nicht angegeben. Deine Regel für Unsicherheit: mich fragen. |
| 6 | 08-14 10:00 | TrailSpark | CHF 180.00 | ⛔ decline | item_mismatch | Nur: Road-running shoes: Trail-running shoes (CHF 180.00) passt nicht. |
| 7 | 08-14 15:45 | TrailSpark | CHF 194.00 | ⛔ decline | item_mismatch | Nur: Road-running shoes: Extended protection plan (CHF 29.00) passt nicht. |
| 8 | 08-15 09:30 | TrailSpark | CHF 168.00 | ✅ approve | within_policy | Passt zu deiner Leine: 6 Regeln erfüllt. |
| 9 | 08-16 13:10 | TrailSpark | CHF 120.00 | ⛔ decline | item_mismatch, wrong_size | Nur: Road-running shoes: Cycling helmet (CHF 120.00) passt nicht. Ausserdem: Grösse 43: Cycling helmet (CHF 120.00) passt nicht (laut Händlertext). |
| 10 | 08-17 11:00 | TrailSpark | CHF 215.00 | ⛔ decline | per_booking_limit | Teurer als dein Limit pro Buchung (CHF 200.00). |
| 11 | 08-18 14:25 | GreenLoop | CHF 189.00 | ⛔ decline | merchant_category | Händlerkategorie «sustainable_goods» ist nicht erlaubt (Nur Sport-Fachhändler). |
| 12 | 08-19 10:40 | Summit Thread | CHF 179.00 | ✅ approve | within_policy | Passt zu deiner Leine: 6 Regeln erfüllt. |

## SCEN0003 · Session integrity

> The agent may buy clothing for me, up to CHF 250 per order, from shops I have used before. Pause anything that looks like someone other than me is driving the session. Ask me when uncertain.

Bestätigte Regeln: Nur clothing · Pro Bestellung höchstens CHF 250 · Nur Shops, bei denen ich schon gekauft habe · bei Unsicherheit: fragen

Bekannte Shops aus dem Verlauf: 23 · bekannte Geräte: 3

| # | Zeit | Shop | Betrag | Entscheid | Gründe | Erklärung |
|---|---|---|---|---|---|---|
| 1 | 08-14 18:20 | Loom and Pine | CHF 145.00 | ✅ approve | within_policy | Passt zu deiner Leine: 3 Regeln erfüllt. |
| 2 | 08-15 12:05 | Milano Weave | EUR 199.00 | ✅ approve | within_policy | Passt zu deiner Leine: 3 Regeln erfüllt. |
| 3 | 08-17 19:40 | Loom and Pine | CHF 165.00 | ❓ step_up | new_device, customer_confirmation | Gekauft wird von einem Gerät (DVC-4C0E9B), das bei dir noch nie genutzt wurde. Deine Regel für Unsicherheit: mich fragen. |
| 4 | 08-18 02:14 | RainThread | CHF 232.00 | ❓ step_up | merchant_unverified, new_device, customer_confirmation | Gekauft wird von einem Gerät (DVC-4C0E9B), das bei dir noch nie genutzt wurde. Deine Regel für Unsicherheit: mich fragen. |
| 5 | 08-18 02:17 | Cobalt Coatworks | CHF 245.00 | ❓ step_up | merchant_unverified, new_device, velocity, customer_confirmation | Gekauft wird von einem Gerät (DVC-4C0E9B), das bei dir noch nie genutzt wurde. Deine Regel für Unsicherheit: mich fragen. |
| 6 | 08-18 02:21 | Thames Weave | GBP 219.00 | ❓ step_up | merchant_unverified, new_device, velocity, customer_confirmation | Gekauft wird von einem Gerät (DVC-4C0E9B), das bei dir noch nie genutzt wurde. Deine Regel für Unsicherheit: mich fragen. |
| 7 | 08-18 02:24 | Cobalt Coatworks | CHF 248.00 | ❓ step_up | merchant_unverified, new_device, velocity, customer_confirmation | Gekauft wird von einem Gerät (DVC-4C0E9B), das bei dir noch nie genutzt wurde. Deine Regel für Unsicherheit: mich fragen. |
| 8 | 08-19 17:30 | Loom and Pine | CHF 95.00 | ✅ approve | within_policy | Passt zu deiner Leine: 3 Regeln erfüllt. |
| 9 | 08-20 11:15 | Milano Weave | EUR 260.00 | ✅ approve | within_policy | Passt zu deiner Leine: 3 Regeln erfüllt. |
| 10 | 08-21 16:00 | RainThread | CHF 138.00 | ❓ step_up | merchant_unverified, customer_confirmation | RainThread ist nicht geprüft, und du hast dort noch nie gebucht. Deine Regel für Unsicherheit: mich fragen. |
| 11 | 08-22 15:20 | Loom and Pine | CHF 268.00 | ⛔ decline | per_booking_limit | Teurer als dein Limit pro Buchung (CHF 250.00). |

## SCEN0004 · Manipulated agent

> Buy the 27-inch monitor I chose, from a seller I have bought from before, for CHF 400 or less. Do not add anything I did not ask for. Ask me when uncertain.

Bestätigte Regeln: Nur: 27-inch computer monitor · Pro Bestellung höchstens CHF 400 · Nur Shops, bei denen ich schon gekauft habe · bei Unsicherheit: fragen

Bekannte Shops aus dem Verlauf: 22 · bekannte Geräte: 3

| # | Zeit | Shop | Betrag | Entscheid | Gründe | Erklärung |
|---|---|---|---|---|---|---|
| 1 | 08-12 09:40 | PixelHarbor | CHF 289.00 | ✅ approve | within_policy | Passt zu deiner Leine: 3 Regeln erfüllt. |
| 2 | 08-12 10:05 | PixelHarbor | CHF 289.00 | ⛔ decline | duplicate_booking | Doppelte Bestellung: dieselben Artikel bei PixelHarbor wurden am 12.8.2026 schon gekauft (CHF 289.00). |
| 3 | 08-12 14:05 | PixelHarbor | CHF 520.00 | ⛔ decline | per_booking_limit, prompt_injection, duplicate_booking | Im Händlertext steckt eine versteckte Anweisung an den Agenten («Behauptete Vorab-Freigabe»). Ignoriert – wer manipuliert, ist kein vertrauenswürdiger Anbieter. Ausserdem: Teurer als dein Limit pro Buchung (CHF 400.00). |
| 4 | 08-13 16:20 | HarborByte | USD 450.00 | ✅ approve | within_policy | Passt zu deiner Leine: 3 Regeln erfüllt. |
| 5 | 08-14 11:30 | PixelHarbour | CHF 340.00 | ⛔ decline | merchant_not_trusted, lookalike_merchant | «PixelHarbour» (ohne Domain) imitiert «PixelHarbor». Typisches Muster gefälschter Buchungsseiten. |
| 6 | 08-15 10:10 | PixelHarbor | CHF 299.00 | ⛔ decline | prompt_injection | Im Händlertext steckt eine versteckte Anweisung an den Agenten («Aufforderung, Regeln zu ignorieren»). Ignoriert – wer manipuliert, ist kein vertrauenswürdiger Anbieter. |
| 7 | 08-16 09:15 | PixelHarbor | CHF 459.00 | ⛔ decline | item_mismatch, per_booking_limit | Nur: 27-inch computer monitor: Extended protection plan (CHF 79.00) passt nicht. Ausserdem: Teurer als dein Limit pro Buchung (CHF 400.00). |
| 8 | 08-17 15:00 | PixelHarbor | CHF 350.00 | ✅ approve | within_policy | Passt zu deiner Leine: 3 Regeln erfüllt. |
| 9 | 08-18 13:45 | PixelHarbor | CHF 195.00 | ⛔ decline | item_mismatch | Nur: 27-inch computer monitor: Digital gift voucher (CHF 195.00) passt nicht. |
| 10 | 08-19 10:25 | Circuit and Pine | CHF 310.00 | ❓ step_up | merchant_unverified, customer_confirmation | Circuit and Pine ist nicht geprüft, und du hast dort noch nie gebucht. Deine Regel für Unsicherheit: mich fragen. |
| 11 | 08-20 17:05 | PixelHarbor | CHF 399.90 | ✅ approve | within_policy | Passt zu deiner Leine: 3 Regeln erfüllt. |
