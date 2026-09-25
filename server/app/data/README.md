# Weltweites Flughafenverzeichnis

`airports.json` ist ein lokal mitgelieferter Ausschnitt aus [OurAirports](https://ourairports.com/data/).
Die Daten stehen laut Anbieter unter **Public Domain**. OurAirports übernimmt keine Garantie für Richtigkeit oder Eignung.
Originalquelle: <https://davidmegginson.github.io/ourairports-data/airports.csv>.

Enthalten sind alle im Quellstand **nicht als geschlossen markierten Einträge mit gültigem dreistelligem IATA-Code**,
einschliesslich kleiner Flugplätze, Wasserflugplätze und Hubschrauberlandeplätze. Das ursprüngliche Feld `airport_type`
und der Hinweis auf Linienverkehr bleiben erhalten. Nicht enthalten: geschlossene Anlagen und Anlagen ohne IATA-Code.
Das ist ein weltweites Verzeichnis mit IATA-Code, keine Behauptung, dass jedes Flugfeld oder jede Verbindung buchbar ist.

Die Metadaten `info` im JSON enthalten Abrufdatum, SHA-256 der exakten CSV-Quelldatei, Anzahl, Typverteilung und Lizenzquelle.
Die Datenzeilen sind kompakte Arrays; ihre Feldreihenfolge steht einmalig in `fields`.
Die ursprüngliche `municipality` wird als `city_name` gespeichert; sie kann den Vorort statt der bekannten Reisestadt nennen
(zum Beispiel Mahovljani für BNX). Die kleine kuratierte Ortsliste ergänzt weiterhin deutsche Ortsnamen und Reise-Aliasse.
Zusätzlich übernehmen wir alternative Namen aus dem `keywords`-Feld der Quelle: zum Beispiel `İzmir` für ADB,
dessen Gemeinde als Gaziemir angegeben ist. Nur begrenzte, ausgeschriebene Namen werden übernommen; kurze Kennungen,
Zahlenfolgen und erkennbare historische Kommentare werden verworfen. Die Suche nutzt diese Aliasse ausschliesslich exakt.
Diese Quelle ist kein vollständiges weltweites Städte- oder Übersetzungsverzeichnis; unbekannte Schreibweisen können
weiterhin eine Rückfrage erfordern. Die Gemeinde bleibt unverändert und ist nicht automatisch das passende Hotel-Suchgebiet.

Aktualisieren, vom Repository-Verzeichnis aus:

```sh
node scripts/update-airports.mjs
```

Eine zuvor heruntergeladene Quelldatei reproduziert den Dateninhalt mit:

```sh
node scripts/update-airports.mjs --csv /pfad/airports.csv
```

Der Import prüft CSV-Struktur, Mindestabdeckung, bekannte Kontrollcodes, eindeutige IATA-Codes, Koordinaten und Typen.
Er ersetzt die Datei erst nach erfolgreicher Prüfung atomar. Ein Fehler lässt das vorhandene Verzeichnis stehen.
Anschliessend `node --test test/airport-catalog.test.js` ausführen und Datenänderung prüfen.

Die Laufzeitsuche braucht **keinen Schlüssel und kein Netzwerk**. Sie erkennt isolierte IATA-Codes, exakte Flughafennamen
und Gemeinden, unabhängig von Grossschreibung, Akzenten und Satzzeichen. Generische Zusätze wie Flughafen, Airport und
International sind optional. Mehrere passende Flughäfen bleiben mehrere Ergebnisse; Linienverkehr und normale Flughäfen
stehen vor anderen Anlagen. Kein Präfix-Raten: `Bali` wird nicht zu `Balikpapan`.

Ein IATA-Code kann wie ein normales Wort aussehen (`FOR` = Fortaleza). Deshalb muss der Aufrufer Füllwörter aus Freitext
entfernen und Mehrdeutigkeiten bestätigen lassen. Ein gefundener Flughafen belegt weder verfügbare Flüge noch Preise.
Das prüfen weiterhin die Angebotsanbieter und die Leash.
