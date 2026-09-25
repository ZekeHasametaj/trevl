# Original-Jev-Baustein

`jev-check.ts` ist unverändert aus Team7-AgentOnALeash übernommen:
`packages/flight-api/src/vendor/jev-check.ts`, Stand `63d6b98`.
Ursprung: This `packages/jev-check/src/index.ts`, Commit
`7bec1f833ee9b349fb4efb2201a32411a7ccabfe`.

Vertrag bleibt `{ auftrag, angebotstext }` → `{ passung, quelle }`.
Jev prüft Bedeutung, keine Geldrechnung oder Buchungsfreigabe.
Frist maximal 3 Sekunden, keine automatischen Wiederholungen;
fehlerhafte Antworten/Ausfälle werden `unklar/ersatz`.

`npm run build:jev` erzeugt das eingecheckte JavaScript für Zekes Node-App.
`npm test` prüft auch, dass JavaScript und TypeScript übereinstimmen.
Der verworfene alternative Jev-Prompt aus unserer alten Evaluation wurde **nicht** übernommen.
