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

## Reise bei fehlendem Flug/Hotel stoppen und Werte anpassen

Flug und Hotel sind jetzt Voraussetzungen für die nächsten angeforderten
Kategorien: Solange der Flug nicht gebucht ist, keine Hotelsuche; ohne Hotel
keine Transfers/Aktivitäten. Reine Hotelaufträge bleiben möglich. Eine offene
Kundenfreigabe wartet zuerst auf die Antwort; nach Ablehnung werden weitere
Angebote versucht. Erst wenn die erforderliche Kategorie keine Alternative
mehr hat, stoppt der Lauf mit `blocked.reason = no_matching_offer`.
Die gleichen Grenzen gelten für Skript- und KI-Agenten. Technische Anbieter-
fehler stoppen separat und werden nicht durch synthetische Ersatzangebote kaschiert.

Im Reisebildschirm erscheint „Werte anpassen“. Das öffnet den bisherigen
Suchtext; die neuen Regeln müssen wieder bestätigt werden. Eine Anpassung
aktualisiert dieselbe Leine und behält Verlauf, Buchungen und Budgetverbrauch.
Der Agent lädt tatsächlich gebuchte Kategorien aus der Leash-Zusammenfassung
und überspringt diese beim Fortsetzen. Nach einer Buchung bleiben Ziel,
Abflugort, Reisedaten und Reisende fest; unklare Buchungsausgänge erlauben im
laufenden Prozess keinen erneuten automatischen Versuch.

Validierung: 112/112 Offline-Tests grün; Syntax- und Diffprüfung grün.
Browserlauf isoliert auf 4332/4333 mit synthetischen Flügen: Fluglimit 0 CHF
→ 3 Ablehnungen → Stop → „Werte anpassen“ → auf 1 CHF geändert → erneut
bestätigt → dieselbe Leine v2 → Stop. Keine Hotelsuche, keine Buchung, kein
Jev-Aufruf, kein verbrauchtes Budget in diesem Test. Hotel-Fehlschlag mit
bereits gebuchtem Flug, fortgesetzte Hotelsuche ohne zweite Flugbuchung,
Freigaben/Timeouts, Requotes und KI-Umgehungsversuche sind offline getestet.

Testinstanz beendet. Die Hauptvorschau auf http://127.0.0.1:4330/ läuft mit dem
neuen Stand. Der Anpassungsknopf wird auch für den bestehenden, abgeschlossenen
Belgrad-Lauf angezeigt. Dessen historische Test-Transferbuchung und Ausgaben
wurden erhalten; der alte Verlauf wird nicht nachträglich umgeschrieben.

## Banja Luka / BNX erkennen

Ursache des Nutzerfehlers: Banja Luka fehlte in der Ortsliste; die externe
Kandidatensuche verkürzte kleingeschriebenes „banja luka“ auf „banja“. In dieser
Vorschau ist Duffel zudem ausgeschaltet, sodass kein Flughafen-Fallback verfügbar
ist. Banja Luka (BNX, BA; Quelle: https://bnx.aero/?lang=de) ist jetzt lokal
hinterlegt, inklusive Banjaluka und BNX. Mehrere Leerzeichen und Bindestriche
funktionieren; getippte Antworten mit „Flughafen“/„Airport“ vor oder nach einem
bekannten Ort werden lokal aufgelöst. Das Originalzitat bleibt erhalten.

Validierung: 115/115 Offline-Tests grün, darunter Freitext, Flughafen-Rückfragen
ohne Provideraufruf, Abflug ab Banja Luka und Ausschluss ähnlicher Teilnamen.
Browserprüfung auf 4330: „Ab Zürich nach banja luka …“ zeigt im Regel-Dialog
„Banja Luka BNX · Bosnien und Herzegowina“ mit getrennten Preisgrenzen.
Nur Entwurf geprüft, keine Regeln aktiviert und keine Buchung ausgelöst.
Hauptvorschau neu gestartet, bestehende Daten erhalten. Flugangebote bleiben
synthetisch; Erkennung eines Flughafens belegt keine reale Flugverfügbarkeit.

## Weltweites Flughafenverzeichnis statt Einzelergänzungen

OurAirports ist als lokaler Public-Domain-Snapshot eingebunden: 9.054 nicht
geschlossene Einträge mit IATA-Code, davon 4.133 mit Linienverkehr, inklusive
kleiner Flugplätze, Wasserflugplätze und Heliports. Dazu 3.857 begrenzte exakte
Namensvarianten aus Quell-Keywords, zum Beispiel Izmir → ADB. Quelle, Hash,
Abrufdatum, Abdeckung und Updatebefehl stehen in `server/app/data/README.md`.
Die Erkennung braucht weder API-Schlüssel noch Internet. Das Update-Skript
validiert die Datei vor atomarem Ersatz; es gibt keine neue Paketabhängigkeit.

Mehrteilige Ortsnamen funktionieren auch kleingeschrieben. Der Server löst
Abflug und Ziel getrennt auf. Ein unbekannter oder mehrdeutiger Abflug wird
erfragt, statt still durch Zürich ersetzt zu werden. Bekannte Stadt-Aliasse
bleiben erhalten; ein explizites LGW bleibt LGW. Bei mehreren passenden
Flughäfen erscheinen benannte Optionen mit Land und IATA, und die Bestätigung
bleibt gesperrt, bis die Auswahl eindeutig ist. Die Herkunft einer ausgewählten
Flughafenregel ist als Kundenantwort gekennzeichnet.

Neue Flugregeln binden beide bestätigten IATA-Codes. Der Agent übermittelt den
tatsächlichen Abflughafen des Angebots; Stadtgleichheit erlaubt keinen Wechsel
von Gatwick zu Heathrow. Diese Regeln gelten nur für Flüge, nicht für Hotels.

Validierung: 136/136 Tests grün inkl. Jev-Buildcheck; gezielter Nachtest der
Quellenkennzeichnung grün. Zusätzlich alle 9.054 Codes durch die tatsächliche
Ortssuche geschickt: 9.054 korrekt, keine Provideraufrufe. Browserprüfung auf
4330: Banja Luka zeigt BNX/ZRH-Regeln; Rio de Janeiro fragt nach GIG/SDU,
nach SDU-Auswahl ist exakt SDU im Entwurf. Nur Entwürfe geprüft, keine neue
Leine aktiviert und keine Buchung/Zahlung ausgelöst. Temporären Testtab geschlossen.

Grenzen: Verzeichnisstand ohne Gewähr; keine Flugfelder ohne IATA oder geschlossene
Einträge. Nicht jede lokale Schreibweise ist enthalten. Quellgemeinde eines
Flughafens kann ein Vorort sein (z.B. Sepang statt Kuala Lumpur); Flughafenwahl
ersetzt noch keine präzise Hotelgebietsauswahl. In der laufenden Hauptvorschau
bleiben Angebote synthetisch, Jev ist weiterhin der echte Inhaltsprüfer.

## Abschlusskarte am Ende des Reiseverlaufs

Nach Ende oder Stopp des Agenten erscheint „Ergebnis deiner Reise“ unter dem
Verlauf. Die Ansicht springt einmal zum Anfang dieser Karte. Sie zeigt Route,
Datum, Status je Kategorie, Anbieter, bestätigte Buchungsreferenzen, Kosten,
Ablehnungsgrund mit Detailknopf und den nächsten Schritt. Nach einer erfolglosen
Flug-/Hotelsuche ist „Werte anpassen“ direkt hier verfügbar. Der gesamte Verlauf
bleibt erhalten; zum Verstehen des Endstands muss niemand mehr hochscrollen.

Die Darstellung verwendet gespeicherte Autorisierungen/Buchungen und die
Agentenereignisse. Nur vorhandene Buchungsbestätigungen zählen als gebucht.
Freigegeben, aber unbestätigt; offene Kundenfreigabe; unbekannter Buchungsausgang;
technischer Stopp; keine Angebote und Ablehnung sind getrennte Zustände.
Die Geldübersicht trennt bestätigte Buchungssumme, noch gebundene Beträge und
verfügbares Budget. Demo-/Sandbox-Buchungen bleiben ausdrücklich gekennzeichnet.
Alte bestätigte Buchungen derselben Reise bleiben bei Regelanpassungen sichtbar;
Ablehnungen alter Regelversionen und andere Reisen werden nicht hineingemischt.
Ein neuer Suchlauf blendet die vorige Abschlusskarte aus; später bestätigte
Buchungen ersetzen einen zuvor unbekannten Ausgang korrekt.

Validierung: 144/144 Tests inkl. Jev-Buildcheck grün, JS-Syntax und Diff geprüft.
Acht neue Tests zu vollständiger/teilweiser Buchung, Ablehnungen, Folgeschritten,
Freigabe ohne Buchung, Unsicherheit nach Neustart, verspäteter Bestätigung,
Regelversionen, Retry, offenen Freigaben und Beträgen. Im Browser den vorhandenen
Tokio-Lauf geprüft: drei Flugablehnungen, Hotel/Transfer nicht weitergesucht,
0 CHF bestätigt/gebunden, 100 CHF frei, „Werte anpassen“ am Ende. Screenshot
auf Lesbarkeit geprüft, Suchtext erhalten. Keine neue Buchung/Zahlung ausgelöst.
Frontend statisch neu geladen; laufenden Server und Backend-Daten beibehalten.

## Schwebender Anhalten-Knopf

Anhalten sitzt während des Laufs unten rechts über der Navigation, ausserhalb
des scrollenden Inhalts. Auch beim Ansichtswechsel bleibt der Knopf erreichbar.
Hover und Tastaturfokus sind sichtbar; auf kleinen Bildschirmen ist er fixiert.
Während der Stopp-Anfrage und noch laufender Abschlussarbeit erscheint gesperrt
„Wird angehalten …“. Fehler werden angezeigt; der Knopf ist danach erneut nutzbar.
Der vorhandene Backend-Stopp bleibt unverändert. Keine neue Buchung ausgelöst.

Validierung: JS-Syntax und Diff geprüft. Isolierte UI-Fixture mit den tatsächlichen
Frontend-Dateien (keine Provideraufrufe): Position beim Scrollen unverändert,
Screenshot geprüft, Klick sendet Stopp, zeigt gesperrten Zwischenstand und blendet
den Knopf nach Abschluss aus. Temporären Testserver und Testtab geschlossen.
