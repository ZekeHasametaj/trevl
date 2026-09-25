# Demo-Drehbuch (ca. 4 Minuten)

**Vorbereitung:** `npm run start:hotels`, Browser auf <http://localhost:4320> (mit echten LiteAPI-Hotels; Hotelnamen weichen dann von den
Beispielen unten ab), oder `npm start` auf <http://localhost:4310> (nur Testmarkt). Fenster breit genug für beide Jury-Panels.
In der Regie links **«Alles zurücksetzen»**. Tempo 1.0×.

Viseca will drei Dinge sehen. Sie sind unten mit ① ② ③ markiert.

---

### 0:00 – Problem (15 s)
> «Ein KI-Agent mit Kreditkarte ist praktisch, aber gefährlich. Er soll bezahlen dürfen, aber nie mehr, als ich will.
> trevl ist ein Reiseagent an der Leine. Und die Leine ist das eigentliche Produkt.»

### 0:15 – Leine in eigenen Worten (45 s)
- **Reise planen** → erstes Beispiel antippen (Lissabon, 9.–12. Oktober, zu zweit, CHF 1'500, Hotel stornierbar, keine Extras, frag mich) → **Leine entwerfen**.
- Zeigen: Jede Regel hat ein **gelbes Zitat** aus dem eigenen Text. Blaue Regeln sind trevl-Standards (nur geprüfte Anbieter, nur bis Abreise).
- «Wenn etwas unklar ist: Mich fragen.» Unten: **Was der Agent nie darf**.
- **Leine anlegen** → Face ID.
> «Nichts gilt, bevor ich bestätige. Und der Agent kann diese Regeln nie ändern.»

### 1:00 – ① Normale Buchung, ohne Reibung (20 s)
- Der Agent sucht Flüge bei Duffel (Testmodus, dauert ~10 s – dabei erzählen) → **Flug freigegeben** → echte Duffel-Testbuchung mit Buchungsnummer (Duffel Airways, kein echtes Geld).
- Rechts «Unter der Haube»: `POST /authorizations` → `approve` mit tatsächlicher Prüfdauer; Jev-Start und Ergebnis erscheinen in der Timeline.

### 1:20 – ② Manipulation und Unklarheit (60 s)
- **Casa do Tejo** über «Stayf1nder Deals» → **abgelehnt**: versteckte Anweisung im Händlertext + gefälschte Seite. **Warum?** öffnen: durchgestrichener Händlertext, «ignoriert».
- **Pensão Rossio** → abgelehnt: nicht stornierbar (deine Regel).
- **Casa Alfama Boutique** → **trevl fragt dich**: Storno unklar, Anbieter unbekannt. Push-Meldung, 120-s-Countdown.

### 2:20 – ③ Mensch entscheidet (40 s)
- Während die Rückfrage offen ist: Regie **04 «Während du überlegst: Preis +28 %»** → die Leine ersetzt die alte Anfrage und fragt neu, mit Preissprung.
- **Ablehnen** → der Agent sucht weiter → **Hotel Miradouro** (Stayfinder, stornierbar) → freigegeben.
- Transfer: Versicherung heimlich im Warenkorb → abgelehnt → der Agent entfernt sie → freigegeben.

### 3:00 – Angriffe live (30 s, Regie)
- **11 «Agent versucht, das Limit zu erhöhen»** → HTTP 403: nur der Kunde darf die Leine ändern.
- **03 «Dieselbe Anfrage nochmals»** → erkannt, nicht doppelt gezählt. **02 Doppelbuchung** → abgelehnt.

### 3:30 – Kontrolle behalten (30 s)
- Tab **Reisekasse**: gebucht, reserviert, frei. Tab **Leine**: **Leine kürzen** (Budget runter, «bei Unsicherheit ablehnen») → Version 2 im Verlauf.
- **Leine kappen** → der Agent ist sofort gestoppt, offene Fragen werden abgebrochen.
- Tab **Protokoll** → Export: jede Entscheidung mit Regeln, Fakten, Version, Latenz.

### Optional (20 s): Beweis mit Visecas Daten
- Regie links: **«Alle offiziellen Testkäufe prüfen»** → 45 Käufe aus Visecas Datenpaket in unter 0,2 s durch dieselbe Leine: 7-Tage-Limit, aufgeteilte Bestellung, falsche Grösse, neues Gerät um 2 Uhr, «PixelHarbour», zwei Prompt-Injections.
> «Das ist nicht nur eine Reise-App. Die Leine entscheidet jeden Kauf – auch Visecas eigene Testfälle, ohne Sonderregeln.»

### Schlusssatz
> «Der Agent darf laufen. Die Leine hält der Kunde. Für Viseca heisst das: feste Regeln mit einer begrenzten Jev-Inhaltsprüfung,
> jede Entscheidung erklärt und die in die one-App passt.»

---

## Fragen der Jury – kurze Antworten

| Frage | Antwort |
|---|---|
| Was war erlaubt? | Regelkarten mit Zitat aus dem Kundentext; in «Warum?» jede Regel mit ✓ / ✗ / ?. |
| Welche Evidenz? | «Fakten, die zählten»: Betrag inkl. Kurs, Anbieter aus dem Register, Reisedaten, Storno, Warenkorb. Händlertext nur als «nicht vertrauenswürdig». |
| Warum so gehandelt? | Ein Satz auf der Karte, Codes und Details im Blatt. Unsicheres gelb markiert. |
| Kontrolle behalten? | Bestätigen, Rückfrage, kürzen, lockern nur mit Face ID, pausieren, kappen. Der Agent hat keinen Schreibzugriff (403). |
| Hart kodiert? | Nein. Die Engine kennt keine Szenarien. Knopf «Alle offiziellen Testkäufe prüfen»: Visecas 45 Käufe durch denselben Code (docs/viseca-replay.md). |
| Rollierende Limits? | Reisekasse über die ganze Reise; echte rollierende Fenster mit `period_days` – z. B. Visecas «CHF 300 in 7 Tagen» (SCEN0001: Kauf 8 abgelehnt, Kauf 10 wieder frei). |
| Was, wenn Jev ausfällt? | Nach spätestens 3 Sekunden kommt eine Ersatzantwort: Rückfrage oder Ablehnung, keine stillschweigende Freigabe. Harte Regeln bleiben verbindlich. |
| Latenz? | Unter 10 ms pro Entscheid (sichtbar auf jeder Karte). Viseca verlangt 8 s. |
