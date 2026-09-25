# Aleksej · Original-Jev in Zekes trevl

25.09.2026 · eigener Clone/Branch `aleksej/jev-leash-integration`, Basis `main@7d4e8b0`.

Ziel erledigt: Original-Jev eingebaut, echte Inhaltsprüfung/Live-Spur gezeigt,
Zekes und unseren Ansatz anhand offizieller Challenge verglichen.
72 Offline-Tests grün, letzter Live-Lauf 7/7 Fälle bei 5 Modellaufrufen ohne Fallback.
Nuitee Sandbox-Key lokal verifiziert: vier Suchangebote, keine Providerbuchung/Zahlung.

Geändert: Leash-Store/Service, Jev-Vendor+Adapter, Ausführungsprüfung in agent.js,
UI-Ereignisse/Warum, Paketabhängigkeit, Tests, Reproduktionsskripte und Review-Dokument.
Die vereinbarte Jev-Ein-/Ausgabe und dessen Originalprompt bleiben unverändert.
Keine alte gemeinsame Arbeitskopie verändert; deren unfertiger Requirements-Editor bleibt lokal erhalten.

Nächste Schritte und ehrliche Grenzen: [Review](../../docs/JEV-INTEGRATION-REVIEW.md).
Insbesondere Kunden-Auth, atomarer zentraler Executor und neuer offizieller Simulatorlauf
bleiben offen. Reiseagent weiterhin Skript/optional Claude, Jev ergänzt die Leash.
Kein behaupteter Produktionsschutz und keine Anbieter-Tickets.

## Eigene Suche im Interface

Der dauerhaft sichtbare Tab „Suche“ und der Knopf „Eigene Suche eingeben“
öffnen einen freien Suchwunsch. Ablauf: Wunsch eingeben → Wunsch prüfen →
erkannte Regeln bestätigen → Suche starten. Eingaben bleiben bei Live-Updates
erhalten. Erst die bestätigte neue Suche hält den bisherigen Agenten an und
ersetzt dessen Auftrag; das Interface erklärt den separaten neuen Budgetrahmen.
Alte Buchungen bleiben erhalten.

Browserprüfung: Paris, 16.–18. Oktober, zwei Personen, 900 CHF und kostenlos
stornierbares Hotel werden korrekt übernommen. Ausgeschriebene Personenzahlen
werden jetzt erkannt; „12 Personen“ wird nicht mehr als zwei gelesen.
73/73 Offline-Tests grün. Eingabe und Regelvorschau im Browser geprüft;
dabei keine neue Buchung oder Zahlung ausgelöst.

Lokale Vorschau: http://127.0.0.1:4330/ – Suchfeld geöffnet. Aktuell sind die
Angebote synthetisch, die angeschlossene Jev-Inhaltsprüfung ist echt.

## Preisgrenzen aus Freitext und Bestätigungs-Popup

„200 CHF Flug maximum, Hotel maximal 150 CHF pro Nacht, Gesamtbudget 900 CHF“
erzeugt getrennte ausführbare Leash-Regeln. Unterstützt sind Flug-, Hotel-,
Transfer- und Aktivitätenlimits pro Buchung; ein Hotel kann zusätzlich einen
Nachtpreis oder einen Höchstpreis für den gesamten Aufenthalt erhalten.
Explizite Preise pro Person werden mit der bestätigten Personenzahl verrechnet.
Ein fehlendes Gesamtbudget wird erfragt und nicht aus einem Kategoriepreis geraten.
„Hotel 150 CHF“ verlangt die Auswahl „Pro Nacht“ oder „Ganzer Aufenthalt“.
Ein gemeinsames Aktivitäten-/Transferbudget über mehrere Buchungen ist noch
nicht unterstützt und blockiert die Bestätigung mit einer Erklärung.

„Wunsch prüfen“ öffnet einen Dialog mit Regeln und Originalzitaten; erst der
Bestätigungsknopf aktiviert den neuen Auftrag und startet die Suche. Rückfragen
bleiben im Dialog beantwortbar. Abbrechen erhält den Text und verändert die
aktuelle Leine nicht. Während einer Antwortprüfung bleibt Bestätigen gesperrt.
Live-Ereignisse überschreiben weiterhin keine Entwürfe.

Monetäre Zuordnung bleibt auch bei optionaler KI-Übersetzung im Regel-Parser,
damit eine Modellantwort Kategoriepreise nicht zu Gesamtbudgets umdeutet.
Die Leash berücksichtigt nur passende Kategoriegrenzen; fehlende Kategorien
führen zur Rückfrage, klare andere Verstösse bleiben abgelehnt. Nachtpreis-
Vergleiche runden kleine Überschreitungen nicht mehr weg.

Validierung: 92/92 Offline-Tests grün, JS-Syntax und Diff geprüft. Unter anderem
Freitext → Leash-Entscheidung, Grenzbetrag, ein Rappen zu viel, Hotel-Nachtpreis,
mehrere Caps, negative/fehlende Angaben, Personenpreis und Modell-Umdeutung.
Im Browser Popup, Hotel-Rückfrage, anschliessend aktivierter Bestätigungsknopf
und Abbruch ohne Textverlust geprüft. Die bestehende Belgrad-Leine unverändert
gelassen; keine neue Buchung/Zahlung und kein zusätzlicher Jev-Modelltest.
