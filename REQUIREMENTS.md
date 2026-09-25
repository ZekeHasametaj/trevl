# trevl – Reiseagent an der Leine

Checkliste für den 10-Minuten-Check. Quelle: Viseca `challenge.md` + `technical_details.md`
(Ordner `ref/`) und das mit dem User abgestimmte Konzept «trevl Reisekasse».

Legende: `[x]` fertig und getestet · `[~]` teilweise · `[ ]` offen

## Konzept in einem Satz

Der Kunde beschreibt seine Reise und seine Grenzen in eigenen Worten. trevl macht daraus
sichtbare Regeln (die Leine). Ein Reiseagent sucht und bucht Flug, Hotel und Transfer.
Jede Buchung geht zuerst durch die Leine: freigeben, ablehnen oder den Kunden fragen.
Der Kunde behält die Kontrolle: kürzen, lockern (nur mit Bestätigung), kappen.

## A. Viseca-Pflicht: Frontend (Regeln des Kunden)

- [x] A1 Eingabe in natürlicher Sprache (Text, optional Sprache) → ausführbare Regeln
- [x] A2 Regeltypen: Ausgabelimits (pro Buchung + Reisekasse gesamt = rollierend/Periode),
      Händler-Anforderungen (vertrauenswürdig, keine Lookalikes), Zeitfenster (Reisedaten,
      Gültigkeit der Leine), Regeln für Unsicherheit (fragen / ablehnen / erlauben)
- [x] A3 Reise-Regeln: Ziel, Reisende, stornierbares Hotel, keine Extras, Kategorien
- [x] A4 Vor Bestätigung sichtbar: jede Regel mit Herkunft aus dem Text, Annahmen, offene Fragen, Unsicherheit
- [x] A5 Leine gilt erst nach ausdrücklicher Bestätigung (Entwurf → aktiv)
- [x] A6 Verschärfen (Leine kürzen), ändern/lockern nur mit erneuter Bestätigung, widerrufen (Leine kappen)
- [x] A7 Agent und Händler können die Regeln nie ändern (eigene Rolle, kein Schreibzugriff)
- [x] A8 Jedes Ziel mit Flughafen erkennbar (eingebaute Liste + Duffel-Flughafensuche, Textfeld bei unbekanntem Ziel), geprüft mit Pristina, Ohrid, Tivat
- [x] A9 Gleichnamige Orte → Rückfrage (Kochi: Indien/Japan), Land im Text entscheidet; Orte ohne Flughafen → nächster Flughafen + Transfer (Zermatt, Positano, Hallstatt), geprüft mit Duffel-Buchung 4DLD5G
- [x] A10 Namen nur als ganzes Wort, nie als Anfang (Bali ≠ Balikpapan); Inseln/Regionen mit anders benanntem Flughafen (Bali → DPS, Kreta, Santorini …); passt ein genanntes Land nicht zum Ziel, sagt trevl es offen («Bali Thailand» → Hinweis Indonesien); Ende-zu-Ende geprüft: Duffel-Testflug ZRH–DPS YNBRGI + LiteAPI-Sandbox-Hotel The ONE Legian ufjSAS7Oq, nicht stornierbares Hotel und Transfer-Versicherung abgelehnt

## B. Viseca-Pflicht: Backend (Entscheidung)

- [x] B1 Jede Buchung → genau eine von `approve`, `decline`, `step_up`
- [x] B2 Begründung in einfacher Sprache + Unsicherheit klar markiert
- [x] B3 Evidenz pro Entscheidung (welche Fakten, welche Regeln ✓/✗/?)
- [x] B4 step_up: Kunde gibt frei oder lehnt ab; 120 s Zeitfenster, danach sicher ablehnen
- [x] B5 Ein Ja des Kunden überstimmt keine harte Regel (erneute Prüfung beim Freigeben)
- [x] B6 Zustand über Zeit: Reisekasse zählt nur endgültige Freigaben; Wartende separat (reserviert)
- [x] B7 Wiederholte Zustellung (gleiche ID) wird nur einmal gezählt (idempotent)
- [x] B8 Ähnliche Buchung mit anderer ID (Doppelbuchung) erkannt
- [x] B9 Preisänderung / Re-Quote erkannt und bewertet
- [x] B10 Händlertext ist nicht vertrauenswürdig: Prompt-Injection erkannt, ändert nie die Regeln
- [x] B11 Fehlende Fakten (`null`/`unknown`) nie als Erlaubnis behandelt
- [x] B12 Keine harten Kodierungen auf Szenarionamen, IDs oder Reihenfolge
- [x] B13 Schnell (Ziel < 100 ms ohne Modell) + vorhersagbar, wenn Modell/Duffel ausfällt
- [x] B14 Normale Buchungen nicht unnötig blockieren
- [x] B15 Fremdwährung → CHF mit festen Kursen, Kurs in der Evidenz
- [x] B16 Geschwindigkeit (viele Versuche in kurzer Zeit) → nachfragen
- [x] B17 Widerrufene/pausierte Leine → alles Weitere abgelehnt, wartende Anfragen abgebrochen

## C. Viseca-Empfehlungen

- [x] C1 UI und Entscheidungs-Engine entkoppelt (eigener HTTP-Dienst, eigener Port)
- [x] C2 Falls Modell im Entscheidungspfad: klein und schnell, mit Timeout und Fallback
- [x] C3 Entscheidungsformat nah an Visecas Event-Schema (`authorization`, `items`, `merchant`, …)

## D. Demo (Viseca «What to show»)

- [x] D1 Normale Buchung mit wenig Reibung (Flug via Duffel-Test → Buchungsnummer)
- [x] D2 Unsichere/manipulierte Buchung mit nützlichem Eingreifen (Fake-Seite + Injection)
- [x] D3 Mensch: Freigabe, Ablehnung und Widerruf
- [x] D4 Für jede Entscheidung sichtbar: was erlaubt war, welche Fakten, warum, Kontrolle beim Kunden
- [x] D5 Regie-Panel: Reset + Angriffe auf Knopfdruck (Doppelbuchung, Injection, Preissprung, Extra, falsche Stadt)
- [x] D6 Blick «Unter der Haube»: rohe Anfrage/Antwort der Engine für die Jury
- [x] D7 Jury-Knopf «Alle offiziellen Testkäufe prüfen»: Visecas 45 Käufe live durch dieselbe Engine (Overlay)

## E. Produkt: Handy-App im Browser

- [x] E1 Mobile-first, im Desktop als Handy-Rahmen; auf echtem Handy im Vollbild (PWA-Manifest)
- [x] E2 Screens: Start/Eingabe, Leine-Entwurf, Reise-Feed (Agent live), Reisekasse, Leine (aktiv), Protokoll
- [x] E3 Push-Banner + Bottom-Sheet für Nachfrage mit 120-s-Countdown
- [x] E4 Live-Updates (SSE), Zustand übersteht Neuladen und Server-Neustart
- [x] E5 Duffel-Testflüge: echte Suche (1303 Testangebote ZRH⇄LIS) + echte Testbuchung über Duffel Airways geprüft: ZVKH5Z, EUR 299.68, live_mode false, bezahlt aus Testguthaben
- [x] E6 Hotels: echte Sandbox-Hotels über LiteAPI (`npm run start:hotels`, Port 4320), sonst synthetischer Markt; Transfers und die bösen Anbieter (Fake-Seite, Injection) immer aus dem Testmarkt (fiktive Namen)
- [x] E7 Protokoll exportierbar (JSON)
- [x] E8 Keine Schlüssel im Code/Repo, nur `.env`

## F. Qualität

- [x] F1 Automatisierte Tests für die Engine (`node --test`)
- [x] F2 Ende-zu-Ende-Durchlauf im Browser geprüft (Desktop + 390 px)
- [x] F3 README mit Start in 1 Befehl + Demo-Skript für den Pitch

## Offen / nächste Schritte

- [x] Duffel-Testschlüssel in `.env` → echte Suche + Testbuchung durchgespielt (E5)
- [x] LiteAPI-Hotels (Sandbox): echte Suche (103 Hotels Lissabon, echte Stornobedingungen) + echte Sandbox-Buchungen (tSJ2k4vl0, LtoXx2l90), Leine lehnt echtes nicht stornierbares Hotel ab; aktiv nur mit HOTELS_PROVIDER=liteapi
- [~] KI-Agent (Claude, umschaltbar in der Regie, Fallback Skript): gebaut + Schleife mit nachgestellten Modellantworten getestet; echter Test wartet auf ANTHROPIC_API_KEY
- [x] Pitch-Deck trevl (9 Folien, Sprechernotizen): https://claude.ai/artifact/U2dkUfsoeSsaMqhuCWaiqt
- [x] Visecas 45 Offline-Käufe mit der Engine durchgespielt → docs/viseca-replay.md (17 approve · 19 decline · 9 step_up, < 10 ms)
