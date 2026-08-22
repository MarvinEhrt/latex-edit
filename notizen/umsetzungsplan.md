# Umsetzungsplan zur Bedienbarkeit

Setzt die Befunde aus `editor-bedienbarkeit.md` in Arbeitspakete um.
Jedes Paket ist für sich schlüssig, lässt sich einzeln prüfen und
hinterlässt keinen halben Zustand. Die Kennungen (A1, B3 …) verweisen
auf die Befunde.

| Paket | Befunde | Stand |
|---|---|---|
| 1 · Fehler beheben | A1, A2, dazu neu: Strg+Enter | **umgesetzt** |
| 2 · Pfeile und Listen | B1, B3 | **umgesetzt** |
| 3 · Direkt anfassen | D1 (Titel), F2, G1 | **umgesetzt** |
| 4 · Struktur per Tastatur | C2, C3, C4, B4 | **umgesetzt** |
| 5 · Suchen und Sichtbarkeit | E1, E2, H2, H3 | **umgesetzt** |
| 6 · Auswahl und Abschnitte | B2, C1, G2–G4 | offen |
| 7 · Fläche und Feinschliff | F1, D2–D4, H1, H4–H6 | offen |

---

## Paket 1 — Fehler beheben *(umgesetzt)*

**A1 · Rücktaste im leeren Listenpunkt löscht die ganze Liste.**
Der allgemeine Rücktaste-Zweig in `tasten()` steigt bei Listen jetzt
genauso früh aus wie der Enter-Zweig; die Punkt-Logik gehört dem
Listen-Handler (siehe Paket 2, der ihn vervollständigt).

**A2 · Strg+Umschalt+Z doppelt belegt.** Zwei Ursachen, zwei Mittel:

1. Der Dokument-Handler in `80-app.js` übergeht Tastendrücke, die ein
   Feld bereits behandelt hat (`ev.defaultPrevented`). Damit kann
   grundsätzlich keine Taste mehr zweimal wirken.
2. Das Zitieren zieht von Strg+Umschalt+Z auf **Strg+Umschalt+L**
   (Literatur) um; Strg+Umschalt+Z bedeutet wieder Wiederholen, wie
   überall. L ist in den gängigen Browsern unbelegt — C, I, J, K, E, Q
   scheiden aus, weil sie Entwicklerwerkzeuge oder Browserfunktionen
   öffnen, die eine Seite nicht abfangen kann. Hilfe, Tooltips und
   README ziehen mit.

**Neu entdeckt: Strg+Enter teilt den Absatz.** Der Enter-Zweig in
`tasten()` prüfte Strg nicht: Strg+Enter (PDF bauen) teilte nebenbei
den Absatz an der Schreibmarke. Der Zweig verlangt jetzt „ohne Strg“;
das Bauen übernimmt allein der Dokument-Handler.

*Abnahme:* Rücktaste im leeren Punkt einer gefüllten Liste entfernt
nur den Punkt. Strg+Umschalt+Z stellt einen zurückgenommenen Schritt
wieder her und öffnet nichts. Strg+Umschalt+L öffnet den Zitatdialog.
Strg+Enter baut und lässt den Text unverändert.

## Paket 2 — Pfeile und Listen *(umgesetzt)*

**B1 · Pfeiltasten über Blockgrenzen.** In `tasten()`: Steht die
Schreibmarke in der letzten Zeile (Pfeil-runter), am Feldende
(Pfeil-rechts), in der ersten Zeile (Pfeil-hoch) oder am Feldanfang
(Pfeil-links), wandert sie ins nächste bzw. vorige Textfeld —
Listenpunkte eingeschlossen. Ob die Marke am Rand steht, ermittelt
`randlage()` aus Textlänge vor/hinter der Marke und den
Cursor-Rechtecken (leere Felder: immer Rand). Bausteine ohne
Textfeld (Tabelle, Abbildung, Diagramm, Formel) werden übersprungen —
sie anzuwählen ist Sache des Auswahlmodus in Paket 6.

**B3 · Listen vervollständigen.** Im Listen-Handler:
- Enter im leeren letzten Punkt verlässt die Liste (Punkt weg, Absatz
  darunter); besteht die Liste nur aus diesem leeren Punkt, wird sie
  durch einen Absatz ersetzt.
- Rücktaste am Anfang eines gefüllten Punkts verschmilzt ihn mit dem
  vorigen (Marke an der Naht).
- Rücktaste im leeren Punkt entfernt den Punkt (Marke ans Ende des
  vorigen); im letzten verbliebenen leeren Punkt verschwindet die
  Liste, wie bei einem leeren Absatz.

*Abnahme:* Mit den Pfeilen von der ersten Überschrift bis zum letzten
Absatz und zurück, ohne Maus. Eine Liste per Tastatur beginnen,
füllen, verlassen, zusammenführen, auflösen.

## Paket 3 — Direkt anfassen *(umgesetzt)*

**D1 · Kartentitel direkt tippbar.** Der Titel von Tabelle, Abbildung
und Diagramm ist an der Karte selbst editierbar; die Objektleiste
bleibt als Zweitweg und beide halten sich gegenseitig aktuell (nie
das Feld überschreiben, in dem gerade der Fokus liegt). Enter beendet
die Eingabe, Einfügen ist immer reiner Text. Die **Anmerkung** bleibt
vorerst im Dialog: sie enthält `{{zit:…}}`-Token, deren gerenderte
Form sich nicht verlustfrei zurücklesen lässt — das braucht erst die
Chip-Technik der Textfelder (Paket 7 prüft das).

**F2 · Werkzeuge ohne Maus-Hover.** Zeilen- und Spaltenwerkzeuge der
Tabelle erscheinen auch, wenn der Baustein gewählt ist — damit sind
sie auf Berührgeräten erreichbar.

**G1 · Meldungen hörbar.** `#meldungen` trägt `role="status"` und
`aria-live="polite"`; Screenreader lesen „Gesichert …“ und
Fehlermeldungen jetzt vor.

*Abnahme:* Titel an der Karte tippen → Leiste und PDF ziehen mit;
Titel in der Leiste tippen → Karte zieht mit. Tabelle antippen (ohne
Hover) → Spalten-/Zeilenwerkzeuge sichtbar.

## Paket 4 — Struktur per Tastatur *(umgesetzt)*

**C2 · Umwandeln.** In der Objektleiste ein „Umwandeln“-Auswahlfeld
für die Textbausteine (Absatz ↔ Überschrift 1–3 ↔ Liste ↔
Blockzitat); es ersetzt die früheren H1–H3-Knöpfe und den
Listen-Umschalter. Eine Liste wird zu Absätzen — je Punkt einer, wie
in Word. In eine Überschrift (reiner Text) wandelt der Editor nur,
wenn keine Chips im Absatz stehen — ein Zitat würde sonst zu totem
Text; stattdessen kommt eine Meldung. Dazu die Markdown-Kürzel am
Absatzanfang: `# `–`### ` → Überschrift, `- ` → Liste, `1. ` →
nummerierte Liste, `> ` → Blockzitat.

**C3 · Schrägstrich-Menü.** `/` am Wortanfang öffnet die Baustein-
Auswahl — dieselbe Mechanik wie die @-Liste, gleiche Tasten (Pfeile,
Enter, Escape), Weitertippen filtert. Eingefügt wird nach dem
aktuellen Baustein; ein leerer Absatz, aus dem heraus das Menü
benutzt wurde, wird ersetzt statt leer stehen zu bleiben.

**C4 · Einfügemarke.** Beim Überfahren der Einfügeleiste zeigt die
vorhandene Einfügemarke (aus der Dateiablage), wo der Baustein
landen würde — beim Anhangbeginn immer am Dokumentende.

**B4 · Duplizieren.** Vierter Knopf in der Blockleiste (⧉) und
Strg+D: Baustein klonen (`Verlauf.klone`, neue Id), darunter
einfügen. Bilddaten sind im Modell nur eine Zeichenkette und werden
geteilt, nicht kopiert.

*Abnahme:* Eine Hausarbeit-Gliederung komplett ohne Maus anlegen.

## Paket 5 — Suchen und Sichtbarkeit *(umgesetzt)*

**E1 · Suchraum vervollständigt.** Fußnotentexte (`run.fussnote`)
sind eigene Stellen in `alleStellen()`, Ersetzen eingeschlossen;
ebenso die Zusammenfassung (`meta.abstract`). Formel-Quelltext wird
gefunden, aber nicht ersetzt — geändert wird im Formeleditor, die
Meldung sagt das.

**E2 · Treffer markiert.** Alle Fundstellen leuchten über die CSS
Custom Highlight API (`CSS.highlights`) auf — kein DOM-Umbau, die
Treffer liegen als (Feld, Position, Länge) vor. Beim Schließen der
Suche verschwindet die Markierung; Browser ohne die API zeigen wie
bisher nur den angesprungenen Treffer.

Dabei kam ein Altfehler ans Licht: Das Anspringen eines Treffers im
Fließtext wählte nie etwas aus. `springeZu` verglich das Segment des
Treffers per Objektidentität mit einer NEU berechneten Segmentliste
— der Vergleich traf nie, der Versatz war immer um die eigene
Segmentlänge zu groß. Jetzt zählt der Segment-Index; eine eigene
Prüfung sichert das Springen ab.

**H2 · B/I-Zustand.** Fett-/Kursiv-Knöpfe in Auswahl- und
Objektleiste spiegeln `document.queryCommandState`.

**H3 · Einfügen in Tabellenzellen.** Eigener Paste-Handler auf den
Zellen: tabulatorgetrennte Bereiche werden zellenweise ab der
Zielzelle verteilt, Zeilen und Spalten wachsen bei Bedarf mit; in
der Kopfzeile beginnt die erste eingefügte Zeile im Kopf. Einzelne
Werte kommen immer als reiner Text an.

## Paket 6 — Auswahl und Abschnitte *(offen, größtes Paket)*

**B2 · Auswahlmodus.** Escape im Text wählt den Baustein als Ganzes
(sichtbarer Rahmen, Fokus auf dem Kasten), Umschalt+↑/↓ erweitert die
Auswahl auf Nachbarn, Entf löscht (ein Verlaufsschritt), Strg+C legt
die Bausteine als JSON in die Zwischenablage (Strg+V fügt sie wieder
ein), ↑/↓ wandert, Enter kehrt in den Text zurück. Damit werden auch
Diagramm, Formel und Umbruch per Tastatur erreichbar (G4).

**C1 · Abschnitte verschieben.** Bei Überschriften bedeuten ↑/↓ und
Ziehen: der Abschnitt bis zur nächsten Überschrift gleicher oder
höherer Ebene wandert mit. Dieselbe Funktion macht die Gliederung
links zum Ziehziel (bekannte Grenze aus der README).

**G2/G3 · Dialog- und Listensemantik.** Zentral in `Dialoge.basis()`:
`role="dialog"`, `aria-modal`, Fokusfalle, Fokusrückgabe an den
Auslöser. @-Liste und /-Menü bekommen `role="listbox"` mit
`aria-activedescendant`.

## Paket 7 — Fläche und Feinschliff *(offen)*

- **F1** Ziehbare Trennlinien zwischen den Spalten, Breite gemerkt;
  Zuklapp-Knopf für die PDF-Spalte (symmetrisch zur Gliederung).
- **D3** Tabellen: „+ davor/danach“ und Verschieben je Zeile und
  Spalte, an den vorhandenen Randwerkzeugen.
- **D2** Formel-Karte: sichtbarer ✎-Knopf, Enter öffnet.
- **D4** Ziehgriff für die Bildbreite (Zahlenfeld bleibt).
- **H1** Überschriftenebenen 4–5 (APA 7), Nummerierung und
  Gliederung ziehen mit.
- **H4** Wortziel je Arbeit einstellbar, dezente Anzeige neben der
  Wortzahl.
- **H5** Fett/Kursiv ohne `execCommand` (eigene Run-Umschaltung) —
  zusammen mit der Chip-Technik Voraussetzung, um auch Anmerkungen
  direkt editierbar zu machen (Rest von D1).
- **H6** Erst messen (vervielfachte Beispielarbeit), dann bei Bedarf
  nur den betroffenen Ausschnitt neu zeichnen.
- **SyncTeX** bleibt beobachtet; mit der Zeilenkarte ließe sich
  vorher schon „zur PDF-Seite des Bausteins springen“ schätzen.

---

## Arbeitsweise

Je Paket: umsetzen → Verhaltensproben im Browser (Muster
`pruefungen/pruefe_bausteine.mjs`) → bestehende Prüfungen laufen
lassen → README/Hilfe nachziehen, wo sich Verhalten ändert. Neue
Verhaltensregeln (Listen, Pfeile) wandern als Prüfungen in
`pruefungen/`, damit sie nicht wieder kaputtgehen.
