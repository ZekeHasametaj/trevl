# Zekes trevl + unser Jev: Ergebnis vom 25.09.2026

Empfehlung: Zekes zusammenhängende Oberfläche und breiten Regelkern behalten.
Unser Original-Jev ergänzt die Inhaltsprüfung. Die stärkeren Mechanismen unserer
bisherigen Zahlungs-Wallet sollen den tatsächlichen Buchungsabschluss absichern.
Die Kombination ist ein überprüfter lokaler PoC, noch kein fertiges Zahlungssystem.

## Was eingebaut wurde

- This Originaldatei `jev-check.ts` unverändert übernommen, mit nachvollziehbarer
  Herkunft in [vendor/README](../server/leash/vendor/README.md). Kein neuer Ersatzprompt.
- Beide HTTP-Startwege nutzen Jev: eingebettete Leash und separater Leash-Dienst.
  Der Reiseagent bleibt Zekes Skript bzw. optional Claude; Jev ersetzt die zusätzliche
  Inhaltsprüfung, nicht den gesamten Reiseagenten oder dessen Auswahlwerkzeuge.
- Vertrag bleibt `{ auftrag, angebotstext }` → `{ passung, quelle }`.
  Nur bestätigte inhaltliche Regeln des konkreten Kaufs gehen an Jev.
  Geldrechnung, Händlerregister, Budget und andere Buchungen prüft der Regelkern.
  Bisher nicht in Regeln übersetzte Freitextwünsche sind damit **nicht** automatisch abgedeckt.
- Hartes Verbot gewinnt. `passt/jev` beseitigt keine andere offene Regel.
  Echter `unklar/jev` folgt der bestätigten Unsicherheitsregel. Ausfall/ungültige Antwort
  ist `unklar/ersatz`, führt zu Rückfrage bzw. Ablehnung und niemals zu stiller Freigabe.
  Frist für das Modell: 3 Sekunden, keine automatischen Modell-Retries.
- Nach dem Modellaufruf werden aktuelle Regeln, Status und Budget neu gelesen.
  Eine zwischenzeitliche Regeländerung entwertet das alte Modellresultat.
- Echte Start-/Ergebnisereignisse in der Timeline; „Warum?“ zeigt Quelle, Dauer,
  Mandatsversion und den Unterschied zwischen Inhaltsprüfung und Zahlungsfreigabe.

Zusätzlich behoben: gleiche ID mit geänderten Kaufdaten, gefälschter CHF-Abrechnungsbetrag,
Stop während Refresh/Prebook, Wiederverwendung einer Freigabe nach Preis-/Währungsänderung,
Freigabe von Budget nach unbekanntem Buchungsausgang, Voiden bereits gemeldeter Buchungen.
Der JSON-Zustand wird vor Antwort/Ereignis geschrieben; Schreibfehler blockieren auch
Retries/Reads bis zur erfolgreichen Speicherung. Beschädigte Dateien starten nicht mehr leer.

## Was tatsächlich geprüft wurde

| Prüfung | Ergebnis / Grenze |
|---|---|
| Zekes unveränderte Basis `7d4e8b0` | 42/42 automatische Tests bestanden |
| Kombinierter Stand | 72/72 automatische Tests bestanden, inklusive 30 neuer Fälle |
| Echte Jev-Evaluation | Letzter Lauf: 7/7 erwartete Ergebnisse, davon 5 echte Modellaufrufe, keine Ersatzantwort; Modellzeiten 227–659 ms |
| Szenarien | Passende Hotelbedingungen DE/EN/JA, widersprüchlicher Text, fehlende Bedingungen; Budgetverbot und Injection werden bereits ohne Modell blockiert |
| Browser + echte Jev-Aufrufe | Lissabon-Beispiel: Freigabe, Ablehnung, Rückfrage, Live-Spur, Stop, Warum-Ansicht und gespeicherte Ergebnisse nach Neustart geprüft |
| Nuitee/LiteAPI | Mit lokalem Sandbox-Key vier Hotelangebote gesucht, ca. 9,3 s; kein Prebook, keine Buchung, keine Zahlung |
| Offizielles öffentliches Datenpaket | 45 lokale Regelkern-Replays: 17 approve, 19 decline, 9 step_up; keine Musterlabels verfügbar, daher keine behauptete Trefferquote |

Rohbelege: [Jev](evidence/jev-integration-live.json), [Nuitee](evidence/nuitee-search.json).
Die Browser-Vorführung verwendet ausdrücklich synthetische Angebote und lokale
Demo-Buchungsreferenzen. Insgesamt keine Supplier-Buchung, Stripe-Zahlung oder gültiges Ticket.
Ein kleiner erfolgreicher Modelltest ist kein Nachweis, dass Jev alle Formulierungen versteht.
Die bekannten Überablehnungen der alten Evaluation sind nicht pauschal gelöst.

## Vergleich

| Bereich | Zekes Ausgangsstand | Unsere bisherige Aktivitäten-Wallet | Sinnvolle Kombination |
|---|---|---|---|
| Oberfläche | Zusammenhängende Reise, Regeln, Regie und Warum-Ansicht | Mehrere gewachsene Testseiten | Zekes Oberfläche |
| Regeln | Viele strukturierte Regeln, Lookalikes, Geräte, Frequenz, Retouren | Engerer Reise-/Aktivitätenumfang | Zekes Regelbreite übernehmen |
| Bedeutung | Regex/strukturierte Daten, kein Jev im Entscheid | Original-Jev mit Laufzeitvalidierung und Tests | Original-Jev jetzt angeschlossen |
| Ausführung | Preis-Recheck vorhanden, aber Stop-/Retry-/Fehlerlücken | SQLite-Reservierung, Revision/Quote-Bindung, Stripe-Teststatus-Abgleich | Unsere Zahlungsgrenzen als nächsten Schritt übernehmen |
| Anbieter | Duffel TEST, Nuitee Sandbox, sonst Testmarkt | Echte Aktivitätenquelle + gesonderter Stripe-Test, kein Supplier-Ticket | Eine klar deklarierte End-to-End-Demo auswählen |

## Passt das zur Viseca-Challenge?

Die offizielle Aufgabenbeschreibung fordert unabhängige Walletkontrolle, bestätigte
Kundenregeln, drei Entscheidungen, verständliche Unsicherheit, echte Kundenantworten,
Zustand über Käufe und Schutz vor Händler-Manipulation. Reisen sind ein passender
Anwendungsfall; ein frei surfender Browseragent ist keine Voraussetzung.
[Offizieller Challenge-Brief](https://github.com/Swiss-ai-Weeks/viseca-2026/blob/main/challenge.md).
Die Veranstaltungsseite war beim Abruf nicht erreichbar; die Bewertung verwendet
die offiziellen GitHub-Unterlagen und das lokale `ref`-Submodul (`b1d52f3`).

Der PoC zeigt Regeln, Gründe, Intervention, Widerruf und Zustand bereits gut.
Die getrennte Engine ist dafür die richtige Grundlage. Die folgenden Lücken sind
für eine belastbare Abgabe wichtiger als weitere Reise-Funktionen:

1. **Kundenidentität absichern.** Die App reicht `/api/leash/*` mit dem Kundenschlüssel
   weiter, ohne echte Anmeldung. Face ID ist eine Simulation. Getrennte Engine-Keys
   schützen diese Kundenschnittstelle allein nicht. Bis dahin nur lokale Demo.
2. **Zahlung zentral durchsetzen.** Prüfung und Provider-Aufruf sind noch getrennte
   Schritte; der Shopping-Prozess besitzt Provider-Zugang. Ein vertrauenswürdiger
   Executor muss Freigabe, Quote, Revision, Budgetreservierung und genau eine
   Ausführung verbinden. Unbekannte Ergebnisse brauchen Statusabgleich statt neuer Buchung.
   Der neue Guard verbessert das Verhalten des vorhandenen Agenten, ist aber keine
   nicht umgehbare Zahlungssperre für einen beliebigen bösartigen Agenten.
3. **Offiziellen Simulator end-to-end anschliessen.** Der lokale Replay nutzt vorab
   erfasste Kundenregeln und ruft Jev nicht auf. Das ersetzt keinen neuen Live-Nachweis
   mit `/bootstrap`, Server-Frist, `step_up` und echter Nutzerantwort.
   Standard: 8 s Entscheidung ab Einreihung, 120 s Kundenantwort; Laufzeitwerte beachten.
   [Technische Vorgaben](https://github.com/Swiss-ai-Weeks/viseca-2026/blob/main/technical_details.md).
4. **Unnötige Ablehnungen systematisch messen.** Neue unbekannte Formulierungen,
   widersprüchliche Quellen und echte Angebotsvarianten testen. Nicht nur mehr approve
   zählen: harte Verstösse dürfen dadurch nie freigegeben werden. Die neue letzte
   Budgetprüfung nutzt konservative Summen und kann bei Zeitfenstern zu streng sein.

Das aktuelle öffentliche Paket enthält Lebensmittel, Haushalt, Schuhe, Kleidung
und Monitor/Manipulation, keine Hotelgeschichte. Frühere Hotel-Simulatorbelege unserer
alten App sind historische Belege, kein Test dieses heutigen Packs.
[Szenarien](https://github.com/Swiss-ai-Weeks/viseca-2026/blob/main/data/scenario_catalogue.csv).
JSON-Dateien, statische Demo-Wechselkurse und Händlerlisten bleiben PoC-Vereinfachungen.

## Selbst ausprobieren

```bash
cd /Users/pribat/trevl-zeke-review
npm test
# Keine Providerbuchung: synthetischer Markt, echte Jev-Inhaltsprüfung.
DUFFEL_ACCESS_TOKEN='' ANTHROPIC_API_KEY='' HOTELS_PROVIDER=synthetic node server/main.js --port=4330 --leash-port=4331 --data-dir=data/jev-review
```

Öffne <http://127.0.0.1:4330>, nutze das Lissabon-Beispiel, lies/bestätige den Entwurf.
„Warum?“ zeigt die Jev-Prüfung. Falls die Instanz schon läuft, genügt der Browserlink.
Der vorhandene Lauf bleibt gespeichert; ein neuer Start ist kein automatischer Reset.
`npm run test:jev:live` startet die begrenzte echte Modellprüfung ohne Buchungen.
Schlüssel liegen nur in der ignorierten `.env`, nicht im Repository.

Arbeitskopie: `trevl-zeke-review`, eigener Branch `aleksej/jev-leash-integration`.
Keine fremde Arbeitskopie umgeschaltet, kein fremder Branch gemergt.
