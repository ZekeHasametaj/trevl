# Verlauf mit Claude Code

trevl ist am Swiss {ai} Weeks Hackathon (Zürich, 24./25. September 2026) zusammen mit Claude Code entstanden.
Hier liegt der ganze Chat, lesbar als Markdown: was gewünscht war, was entschieden wurde, welche Fehler auftraten
und wie sie gelöst wurden.

| Datei | Inhalt |
|---|---|
| [01-vorbereitung.md](01-vorbereitung.md) | **Session 1** «Agent on the Leash Hackathon» (24.9. tagsüber): Team-Repo, erste Richtung «reise.», Duffel-Sandbox, Team-Plan. Diese Arbeit lief im Team-Repo, nicht hier. |
| [02-trevl-teil-1.md](02-trevl-teil-1.md) | **Session 2** «trevl» (ab 24.9. abends): Neustart nach 12 verlorenen Stunden, Ideen, Entscheid für die «trevl Reisekasse», Bau des MVP (Engine, Übersetzer, Agent, Handy-App), Duffel-Testbuchungen, Regie, Viseca-Replay, Pitch-Deck, was ist Test und was echt, Aufwand für eine Hotel-API, Architektur-Diagramme, Pristina wird nicht erkannt |
| [02-trevl-teil-2.md](02-trevl-teil-2.md) | Kochi (gleicher Name in zwei Ländern; Orte ohne Flughafen → nächster Flughafen + Transfer), LiteAPI-Hotels als eigene Instanz auf Port 4320, Izmir-Daten über den Monatswechsel, «Ist der Übersetzer ein Agent oder ein Skript?», umschaltbarer Claude-Agent, «Bali wird zu Balikpapan» |
| [02-trevl-teil-3.md](02-trevl-teil-3.md) | Nach der Kontext-Zusammenfassung: Bali-Fix, Bali Ende-zu-Ende (Duffel-Flug + LiteAPI-Hotel), 10-Minuten-Checks, Version 4320, dieses Repo |
| [bilder/](bilder/) | Screenshots, die der User im Chat geschickt hat |

## Lesehilfe

- **👤 User** sind die Nachrichten des Teams, **🤖 Claude** die Antworten. Werkzeugaufrufe (Dateien lesen und schreiben,
  Befehle, Tests) sind als 🔧 eingeklappt und gekürzt – der aktuelle Code liegt ohnehin im Repo.
- **⏰ Automatischer 10-Minuten-Check**: Der User hat Claude gebeten, alle 10 Minuten zu prüfen, ob der Stand noch den
  Anforderungen entspricht ([REQUIREMENTS.md](../../REQUIREMENTS.md)). Diese Prüfungen erscheinen im Verlauf.
- **🗜️ Kontext komprimiert**: Bei langen Sessions fasst Claude Code den bisherigen Verlauf zusammen. Die Zusammenfassung
  steht an dieser Stelle und ist selbst ein guter Überblick über den Stand bis dahin.
- Nicht enthalten sind Claudes interne Denkschritte und die versteckten Systemhinweise der App.

## Was entfernt wurde

Alle API-Schlüssel (Duffel, LiteAPI, Anthropic), E-Mail-Adressen, interne IDs und lokale Ordnerpfade sind ersetzt,
z. B. durch `duffel_test_[ENTFERNT]`, `[E-MAIL]`, `[ID]` oder `<arbeitsordner>`. Buchungsnummern aus den Tests
(Duffel-Testmodus, LiteAPI-Sandbox) sind geblieben: Sie sind kein Geld wert und belegen die Tests.

Neu erzeugen, nach einem Export aus der Claude-App (Session-Menü → Export, `transcript.jsonl` aus dem Zip):

```bash
node scripts/export-chat.mjs <transcript.jsonl> docs/session 02-trevl "Session 2: trevl – Reiseagent an der Leine (MVP)"
```

Das Skript entfernt jeden Wert aus der lokalen `.env` und bekannte Schlüsselmuster.

## Team

Team 7 «Agent on a Leash»: Zeke (Integration/Backend, hat diese Sessions geführt), Din (UI), Aleksej (Leash-Regeln),
Thi (Prüfung). Challenge von Viseca, Aufgabe im Submodul [`ref/`](https://github.com/Swiss-ai-Weeks/viseca-2026).
