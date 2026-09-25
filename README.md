# trevl – Reiseagent an der Leine

*Agent on a Leash · Swiss {ai} Weeks 2026 · Challenge von Viseca*

Ein Reiseagent sucht und bucht Flug, Hotel und Transfer. Bezahlen darf er nur, was die **Leine** erlaubt.
Die Leine ist eine eigenständige Entscheidungs-Engine: Jede Buchung wird **freigegeben**, **abgelehnt**
oder der Kunde wird **gefragt** (`approve` / `decline` / `step_up`), immer mit Begründung, Evidenz und
sichtbarer Unsicherheit.

## Starten

**Integrationsbranch vom 25.09.:** Euer Original-Jev-Check ist jetzt in der Leash,
inklusive Live-Spur und Warum-Ansicht. Vergleich, echte Testresultate, Start auf
Port 4330 und offene Grenzen: [Jev-Integration und Review](docs/JEV-INTEGRATION-REVIEW.md).

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20 und Git.

```bash
git clone --recurse-submodules https://github.com/ZekeHasametaj/trevl.git
cd trevl
npm install
cp .env.example .env        # Windows: copy .env.example .env – dann Schlüssel eintragen (siehe unten)
npm run start:hotels
```

Dann im Browser: <http://localhost:4320>. Das ist die volle Version: Flüge über Duffel (Testmodus) und echte Hotels
über die Nuitée/LiteAPI-Sandbox. Ohne Schlüssel läuft sie auch, dann mit klar markierten Demo-Flügen und Hotels aus dem Testmarkt.

| Befehl | Adresse | Was läuft |
|---|---|---|
| `npm run start:hotels` | <http://localhost:4320> (Leine: 4321) | Duffel-Flüge + **LiteAPI-Hotels** (Sandbox), Daten in `data-hotels/` |
| `npm start` | <http://localhost:4310> (Leine: 4311) | Duffel-Flüge + Hotels/Transfers aus dem Testmarkt, Daten in `data/` |
| `npm test` | – | 136 automatische Tests + Prüfung des generierten Jev-Bausteins |
| `npm run test:jev:live` | – | begrenzte echte Jev-Prüfung, synthetische Käufe, keine Buchungen |
| `npm run smoke -- http://localhost:4320` | – | ganze Reise Ende-zu-Ende gegen einen laufenden Server (**setzt diese Instanz zurück**, bucht mit Schlüsseln echte Testbuchungen) |
| `npm run viseca-replay` | – | Visecas 45 offizielle Testkäufe durch die Engine → `docs/viseca-replay.md` |
| `npm run leash` | Port 4311 | nur die Leine (Engine), z. B. auf einem anderen Rechner |

Beide Versionen können gleichzeitig laufen, sie teilen keine Daten. Auf dem Laptop erscheint die App als Handy mit
zwei Jury-Panels (links Regie, rechts «Unter der Haube»). Auf einem echten Handy läuft sie im Vollbild:
dafür `HOST=0.0.0.0` in `.env` setzen und `http://<Laptop-IP>:4320` öffnen.

Die Viseca-Challenge (Aufgabe, technische Details, Testdaten) ist als Git-Submodul unter `ref/` eingebunden
([Swiss-ai-Weeks/viseca-2026](https://github.com/Swiss-ai-Weeks/viseca-2026)). Ohne `--recurse-submodules` geklont:
`git submodule update --init`. Ohne diese Daten läuft alles ausser dem Jury-Knopf «Alle offiziellen Testkäufe prüfen».

Optionale Schlüssel in `.env` (Vorlage: `.env.example`, wird nie committet):

| Variable | Wirkung | Ohne Schlüssel |
|---|---|---|
| `DUFFEL_ACCESS_TOKEN` | Echte Flugsuche und Testbuchung im **Duffel-Testmodus** (nur `duffel_test_…`, Live-Schlüssel werden abgewiesen; gebucht wird Duffel Airways, Duffels Testairline) – geprüft: Buchung ZVKH5Z | Klar markierte Demo-Flüge |
| `LITEAPI_KEY` (+ `npm run start:hotels` oder `HOTELS_PROVIDER=liteapi`) | Echte Hotels und Sandbox-Buchungen über Nuitée/LiteAPI (nur Sandbox-Schlüssel `sand_…`, andere werden abgewiesen; Angriffe bleiben im Testmarkt) | Hotels aus dem Testmarkt |
| `ANTHROPIC_API_KEY` | **KI-Agent** (Claude entscheidet, was gesucht und vorgeschlagen wird), umschaltbar in der Regie; fällt er aus, übernimmt der Skript-Agent. Mit `TREVL_LLM=on` hilft Claude zusätzlich dem Übersetzer | Skript-Agent + Regel-Parser |

Schlüssel bekommst du kostenlos: Duffel unter [app.duffel.com](https://app.duffel.com) (Testmodus, «Access tokens»),
LiteAPI unter [dashboard.liteapi.travel](https://dashboard.liteapi.travel) (Sandbox-Key `sand_…`), Anthropic unter
[console.anthropic.com](https://console.anthropic.com).

## Flughäfen weltweit

Die Ortserkennung nutzt ein mitgeliefertes [OurAirports-Verzeichnis](server/app/data/README.md)
mit 9.054 nicht geschlossenen IATA-Einträgen und 3.857 Namensvarianten (Stand 25.09.2026).
Sie braucht keinen Duffel-Schlüssel. Flughafenname, Stadt oder Code eingeben; bei mehreren
Treffern den Flughafen im Regel-Dialog wählen. Abflug und Ziel werden anschliessend als
konkrete Flugregeln geprüft. Die Erkennung belegt keine verfügbaren Flüge; ohne Duffel-Testzugang
bleiben die Flugangebote Demo-Daten. Aktualisieren: `node scripts/update-airports.mjs`.

## Kontext: wie das Projekt entstanden ist

| Datei | Inhalt |
|---|---|
| [REQUIREMENTS.md](REQUIREMENTS.md) | Checkliste: Viseca-Pflichten, Demo, Produkt, Qualität – mit Stand und Belegen (Buchungsnummern) |
| [DEMO.md](DEMO.md) | 4-Minuten-Demo-Skript für den Pitch + Antworten auf Jury-Fragen |
| [docs/session/](docs/session/README.md) | Der ganze Chat mit Claude Code, lesbar: Idee, Entscheide, Fehler und Fixes, Tests |
| [docs/viseca-replay.md](docs/viseca-replay.md) | Visecas 45 Testkäufe mit Entscheid und Begründung |
| `ref/` | Die Challenge von Viseca (`challenge.md`, `technical_details.md`, `data/`) |

## Aufbau

```
Handy-App (web/)  ──HTTP, Kunden-Schlüssel──►  Leine / Entscheidungs-Engine (server/leash/, Port 4311)
      ▲                                               ▲
      │ Live-Updates (SSE)                            │ HTTP, Agent-Schlüssel (nur anfragen)
App-Server (server/main.js, Port 4310/4320) ── Reiseagent (server/app/agent.js) ── Duffel-Test / LiteAPI-Sandbox / Testmarkt
```

- **Leine (Backend)** – `server/leash/`: eigener HTTP-Dienst, feste Regeln + Zustand + **Original-Jev-Inhaltsprüfung**.
  Das Modell ist auf 3 Sekunden begrenzt; harte Regeln bleiben verbindlich. Die konkrete Dauer steht am Ergebnis.
  Speichert Leinen, Entscheidungen, Antworten und das Protokoll in `data/`.
- **Übersetzer (Frontend)** – `server/app/compile.js`: macht aus dem Kundentext Regeln im Viseca-Regelformat
  (`field`, `operator`, `value`, `currency`, `scope`, `period_days`). Optional hilft Claude; jede Zahl und jedes
  Zitat der KI muss im Originaltext stehen, sonst wird es verworfen.
- **Reiseagent** – `server/app/agent.js`: ein «normaler» Agent, der günstige Angebote mag. Er hat nur den
  Agent-Schlüssel: Er kann anfragen, aber weder Regeln ändern noch Rückfragen beantworten.
- **Markt** – Flüge via Duffel (Testmodus), Hotels via Nuitée/LiteAPI (Sandbox, mit `start:hotels`), dazu ein synthetischer
  Markt mit ehrlichen Angeboten, einer gefälschten Buchungsseite mit versteckter Anweisung, unklaren Stornobedingungen und
  heimlich hinzugefügten Extras. Alle Namen sind fiktiv.

## Wie die Leine entscheidet

1. **Leine gültig?** Gekappt, pausiert oder abgelaufen → `decline`.
2. **Regeln des Kunden** – jede Regel ergibt ✓ erfüllt, ✗ verletzt oder ? unklar (fehlende Fakten gelten nie als Erlaubnis).
3. **Zustand über Zeit** – Reisekasse zählt nur endgültige Freigaben, Wartendes ist reserviert; gleiche ID = Wiederholung
   (nicht doppelt gezählt); andere ID, gleiche Nächte = Doppelbuchung; Re-Quote mit Preissprung; viele Versuche in kurzer Zeit.
4. **Händlertext ist nicht vertrauenswürdig** – Anweisungen an den Agenten werden erkannt und ignoriert; Behauptungen im Text
   zählen nie als Beweis. Anbieter werden über das Register geprüft, Imitationen («Stayf1nder Deals») erkannt.
5. **Entscheid** – Verstoss oder Manipulation → `decline`. Nur Unklares → Regel des Kunden für Unsicherheit
   (fragen → `step_up`, ablehnen, selbst entscheiden). Sonst `approve`.
6. **Rückfrage** – 120 Sekunden, danach sicher abgelehnt. Ein Ja des Kunden überstimmt keine harte Regel:
   Beim Freigeben wird mit der aktuellen Leine und Kasse neu geprüft.

Kunde: **kürzen** (sofort), **lockern** (nur mit Bestätigung/Face ID, sonst HTTP 409), **pausieren**, **kappen**
(offene Rückfragen werden abgebrochen). Der Agent-Schlüssel bekommt auf all das HTTP 403.

Die Engine ist nicht reise-spezifisch. `node scripts/viseca-replay.mjs <pfad/zu/viseca-2026/data>` schickt Visecas 5 öffentliche
Szenarien (45 Käufe) in Originalreihenfolge durch dieselbe Engine und schreibt [docs/viseca-replay.md](docs/viseca-replay.md):
17 × approve, 19 × decline, 9 × step_up, langsamster Entscheid unter 10 ms. Darin u. a.: rollierendes 7-Tage-Limit, aufgeteilte
Bestellung, Grösse und Rückgabefrist aus dem Händlertext (nur wenn der Text keine Anweisung enthält), neues Gerät + Burst um 2 Uhr,
Imitation «PixelHarbour», doppelte Bestellung, zwei Prompt-Injections, Re-Quote. Viseca liefert keine Antwortschlüssel;
die Tabelle zeigt Entscheid und Begründung zur Prüfung.

## API der Leine (Auszug)

| Methode | Pfad | Rolle |
|---|---|---|
| POST | `/v1/mandates` → `/v1/mandates/{draft}/confirm` | Kunde |
| PATCH / DELETE | `/v1/mandates/{id}` | Kunde |
| POST | `/v1/mandates/{id}/pause` · `/resume` | Kunde |
| POST | `/v1/authorizations` | Agent |
| POST | `/v1/authorizations/{id}/resolve` | Kunde |
| POST | `/v1/authorizations/{id}/booked` · `/void` | Agent |
| GET | `/v1/mandates/{id}/summary` · `/v1/authorizations` · `/v1/events` · `/v1/stream` | Kunde |

Das Anfrageformat folgt Visecas `authorization.request` (`merchant`, `amount`, `currency`, `items[]` mit
`item_details`, `order_cancellable`, `related_authorization_id` …) plus einem Block `travel` mit Reisefakten.

## Grenzen des Prototyps

- Flüge (Duffel-Testmodus) und Hotels (LiteAPI-Sandbox) sind echte Testbuchungen ohne echtes Geld; Transfers und Aktivitäten
  sind synthetisch. Der KI-Agent (Claude) ist gebaut und mit nachgestellten Antworten getestet, ein Live-Lauf mit Schlüssel steht aus.
- Eine aktive Leine pro Person, keine Benutzerkonten. Face ID ist simuliert.
- Feste Wechselkurse aus Visecas Datenpaket (EUR 0.95, GBP 1.12, USD 0.87).
