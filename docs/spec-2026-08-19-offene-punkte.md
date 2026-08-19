# Spec: Offene Punkte aus dem Produkt-Review vom 19.08.2026

Für wen dieses Dokument ist: eine Implementiererin, die das Projekt nicht
kennt. Es beschreibt jeden offenen Punkt so, dass er ohne Rückfragen
umsetzbar ist — mit Sollverhalten, Fundstellen im Code und
Abnahmekriterien. Die Reihenfolge ist die empfohlene Umsetzungsreihenfolge.

---

## Das Projekt in fünf Sätzen

Der **Schreibtisch** ist ein blockbasierter Editor für empirische
Abschlussarbeiten (Hausarbeit bis Doktorarbeit), der im Hintergrund echtes
LaTeX setzt (pdflatex + biber + biblatex-apa, APA 7, Deutsch/Englisch).
Zielgruppe sind erklärte **Nicht-Techniker** — jede Meldung, jeder Knopf
ist deutsch und LaTeX bleibt unsichtbar, bis man es sehen will. Das
Dokument ist **JSON, nicht HTML**: Absätze sind Listen von „Runs"
(`{text}`, `{zitat}`, `{kennwert}`, `{verweis}`, `{fussnote}`), die
Oberfläche und der LaTeX-Generator sind zwei Ansichten desselben Modells.
Ein Python-Begleiter (nur Standardbibliothek, `schreibtisch.py` +
`begleiter/`) liefert die Seite auf 127.0.0.1 aus, ruft LaTeX auf und
verwaltet Projekte in `Arbeiten/`. `python3 bauen.py` fügt `quelle/*` zu
einer einzigen `oberflaeche.html` zusammen — nach jeder Änderung an
`quelle/` nötig.

### Arbeitsregeln

- **Keine Abhängigkeiten.** Python: nur Standardbibliothek. JS: kein npm-Paket
  zur Laufzeit. Prüfungen dürfen playwright-core benutzen.
- **Alles Deutsch**: Bezeichner, Kommentare, Meldungen, Commits. Englisch ist
  nur die *Sprache der Arbeit* (Einstellung `sprache`), nie die Oberfläche.
- **Vor jeder Modelländerung** `Verlauf.merke(dok)` aufrufen (quelle/12-verlauf.js);
  bei abgebrochenen Dialogen `Verlauf.verwerfeLetzten()`. Muster stehen in
  quelle/60-editor.js und quelle/80-app.js.
- **Jeder Punkt bringt Prüfungen mit.** Bestehende Suiten:

  | Suite | Was |
  |---|---|
  | `python3 pruefungen/pruefe_begleiter.py` | Begleiter, Ablage, Zotero-Abbildung |
  | `python3 pruefungen/pruefe_abbruch.py` | abgerissene Verbindungen |
  | `node pruefungen/pruefe_dokument.mjs` | erzeugtes LaTeX, echtes PDF via pdftotext |
  | `node pruefungen/pruefe_diagramme.mjs` | pgfplots-Diagramme |
  | `node pruefungen/pruefe_bausteine.mjs` | Editor im Browser (playwright) |
  | `node pruefungen/pruefe_ganz.mjs` | Gesamtweg Browser→Begleiter→PDF |

  Browser-Suiten brauchen `PLAYWRIGHT_CORE` (Pfad zu
  `playwright-core/index.js`) und `CHROMIUM` (Chromium-Binary); die
  Begleiter-Suiten isolieren sich über `SCHREIBTISCH_ARBEITEN` selbst.
- **Abnahme insgesamt**: alle sechs Suiten grün, `python3 bauen.py` läuft.

---

## 1 · Quellenfelder maskieren (Bug, Priorität 1)

**Problem.** `erzeugeBib` (quelle/30-latex.js, Funktion `setze`) schreibt
Feldwerte **unmaskiert** in `literatur.bib`. Reale Eingaben zerstören den
Bau mit irreführenden Meldungen:

- `&` im Zeitschriftennamen („Zeitschrift für A&O") → LaTeX-Fehler
  *„Misplaced alignment tab"*, den `begleiter/uebersetzen.py` als „Eine
  Tabellenzeile hat zu viele Spalten" übersetzt — die Nutzerin sucht den
  Fehler in ihrer (fehlerfreien) Tabelle.
- `%` im Titel („100% geklärt") → *„File ended while scanning use of
  \field"*, Bau bricht ab, Meldung ist unverständlich.
- Ebenso gefährdet: `#`, `_` (häufig in DOIs/URLs, dort aber s. u.), `$`, `\`.

Repro: `pruefungen/`-Stil-Skript, Quelle mit obigen Feldern, ein Zitat,
übersetzen — Log enthält `!`-Zeilen.

**Sollverhalten.**

1. Textfelder (`titel`, `zeitschrift`, `verlag`, `buchtitel`,
   `institution`, `webseite`, `auflage`, `heft`, `nummer`, `seiten`,
   `autoren`, `herausgeber`) werden mit `Richtext.escLatex` maskiert —
   dieselbe Funktion, die den Fließtext schützt (sie behandelt auch α, ², –).
2. **Ausnahmen:** `doi`, `url`, `urldate`, `jahr` bleiben unverändert —
   sie werden von biblatex verbatim gesetzt (`\url`-Kontext); ein `\%` in
   einer URL würde den Link zerstören.
3. Geschweifte Klammern: `escLatex` maskiert sie mit. Das nimmt
   Power-Usern die Möglichkeit der Groß-/Kleinschreibungs-Schützung
   (`{AIST-R}`) — bewusste Entscheidung zugunsten der Zielgruppe, im
   Kommentar begründen.
4. Die Fehlerübersetzung für „Misplaced/Extra alignment tab" in
   `begleiter/uebersetzen.py` um einen zweiten Satz ergänzen: „Falls keine
   Tabelle in der Nähe ist: ein &-Zeichen im Text oder in einer Quelle."
   (Nach 1. sollte der Fall nicht mehr auftreten; die Meldung bleibt für
   handbearbeitete Exporte ehrlich.)

**Abnahme** (in `pruefungen/pruefe_dokument.mjs`):
- Quelle mit `&` und `%` in Titel/Zeitschrift, `_` im DOI: übersetzt ohne
  `!`-Zeile; `&`, `%` erscheinen im PDF-Text (pdftotext).
- `literatur.bib` enthält `\&` bzw. `\%` in den Textfeldern, aber der DOI
  steht unverändert darin.
- α im Quellentitel übersetzt fehlerfrei.

---

## 2 · Warnungen aus abgebrochenen Läufen unterdrücken (klein, gehört zu 1)

**Problem.** Scheitert der Bau, zeigt das Fehlerpanel zusätzlich
PRÜFEN-Warnungen („Quelle steht nicht im Literaturverzeichnis") aus dem
abgebrochenen Lauf — Lärm über dem echten Fehler, und inhaltlich falsch,
weil der Lauf nie bis zur Auflösung der Zitate kam.

**Sollverhalten.** Bei `ergebnis.status !== 'ok'` keine `warnungen`
anzeigen. Fundstelle: `quelle/80-app.js`, `baue()` — dort wird
`PdfAnsicht.zeigeFehler(ergebnis.fehler, …, warnungen, dok)` in beiden
Fällen mit Warnungen aufgerufen; im Fehlerfall `[]` übergeben.
Zusätzlich: die Karte „LaTeX hat abgebrochen" nicht als eigenständige
Karte zeigen, sondern als graue Unterzeile der ersten Fehlerkarte
(`quelle/40-pdfansicht.js`, `zeigeFehler`) — sie trägt keine eigene
Information.

**Abnahme** (pruefe_ganz.mjs): Dokument mit Fehler UND fehlender Quelle →
Fehlerliste enthält keine PRÜFEN-Karte; nach Reparatur erscheint sie.

---

## 3 · Chips bearbeiten (Priorität 2)

**Problem.** Eingefügte Chips (Zitat, Fußnote, Kennwert, Querverweis)
haben **keinen Klick-Handler** — sie lassen sich nur löschen und neu
anlegen. Am schlimmsten bei Fußnoten: Der Text steckt im
`data-text`-Attribut und ist nach dem Einfügen **unsichtbar und
unlesbar**.

**Sollverhalten.**

1. Klick auf einen Chip im Editor öffnet den passenden Dialog,
   **vorbelegt** mit dem aktuellen Stand:
   - Zitat → `Dialoge.zitatEinfuegen` mit vorgewählten Quellen (der
     `key` kann komma-getrennt mehrere enthalten!), Form und Seitenzahl.
   - Fußnote → Fußnoten-Dialog mit dem Text.
   - Kennwert → Kennwert-Dialog mit Symbol und Wert.
   - Querverweis → Verweis-Dialog mit markiertem Ziel.
2. Jeder dieser Dialoge bekommt im Bearbeiten-Modus einen Knopf
   **„Entfernen"** (rot, links im Fuß), der den Chip löscht und den
   umgebenden Text stehen lässt.
3. Fußnoten-Chip zeigt künftig die ersten Worte statt nur „Fußnote":
   `¹ Vgl. dazu auch…` (auf ~24 Zeichen gekürzt, `title`-Attribut trägt
   den vollen Text). Fundstelle: `Richtext.zuHtml` (quelle/20-richtext.js).

**Umsetzungshinweise.**
- Delegierter Klick-Handler auf der Blockliste (`quelle/60-editor.js`),
  Ziel `.tx .chip`. Vor der Änderung `Verlauf.merke(dok())`.
- Ersetzen im DOM: Chip-Element durch `Editor.chipHtml(neuerRun)`
  ersetzen bzw. entfernen, danach am Feld ein `input`-Event auslösen —
  `Richtext.vonHtml` liest dann das Modell neu ein (so macht es
  `fuegeAmCursorEin` schon).
- Die Dialoge (quelle/50-dialoge.js) brauchen einen optionalen
  `vorbelegung`-Parameter; `zitatEinfuegen` hat bereits `optionen`
  (`einzeln`) — erweitern statt duplizieren.

**Abnahme** (pruefe_bausteine.mjs):
- Klick auf Zitat-Chip → Dialog zeigt die Quelle als gewählt und die
  Seitenzahl; Seitenzahl ändern → Modell hat genau EINEN Zitat-Run mit
  neuem Wert; Strg+Z stellt den alten her.
- Klick auf Fußnoten-Chip → Text ist im Dialog sichtbar und änderbar.
- „Entfernen" auf einem Kennwert-Chip → Run weg, umgebender Text intakt.
- Fußnoten-Chip zeigt den Textanfang.

---

## 4 · Auswahl-Werkzeugleiste + @-Zitieren (Priorität 3)

Zwei Teile, ein Ziel: Formatieren und Zitieren, ohne den Schreibfluss zu
verlassen.

### 4a · Schwebende Leiste bei Textauswahl

**Problem.** Fett/kursiv existieren nur als Strg+B/I — nichts in der
Oberfläche verrät das. Zitat/Verweis/Kennwert/Fußnote erfordern den Weg
über die Block-Hover-Leiste.

**Sollverhalten.** Bei nicht-leerer Textauswahl innerhalb eines
`.tx`-Feldes erscheint über der Auswahl eine kleine Leiste:
**B** · *I* · ❝ Zitat · → Verweis · 𝑀 Kennwert · ¹ Fußnote.
Sie verschwindet bei Kollaps der Auswahl, Scroll oder Klick woanders.
B/I wirken auf die Auswahl (`document.execCommand('bold'/'italic')` ist
akzeptabel — der Editor lebt ohnehin von contenteditable; Chromium feuert
dabei `beforeinput`, sodass der bestehende `Verlauf.merke`-Hook greift).
Die vier Chip-Knöpfe rufen die bestehenden `App.*Einfuegen`-Wege auf.

**Umsetzungshinweise.** Neues Modul `quelle/62-auswahlleiste.js` (in
`bauen.py` registrieren), Positionierung über
`getSelection().getRangeAt(0).getBoundingClientRect()`. `mousedown` auf
der Leiste mit `preventDefault`, damit die Auswahl nicht kollabiert
(Muster: Werkzeugleisten-Knöpfe in 60-editor.js).

### 4b · @-Autovervollständigung für Zitate

**Sollverhalten.** Tippt man in einem Textfeld `@` (am Wortanfang) und
mindestens zwei weitere Zeichen, erscheint unter der Schreibmarke eine
Liste passender Quellen (Treffer in Nachname, Jahr, Titel, Schlüssel —
`Zitate.nachnamen`/`sortiert` nutzen). Pfeiltasten wählen, Enter/Tab
fügt ein `{zitat, form:'klammer'}` ein und entfernt den getippten
`@…`-Text; Escape schließt. Kein Treffer → einziger Eintrag „Neue Quelle
anlegen …" (öffnet `quelleBearbeiten`). Seitenzahl/Form ändert man danach
per Chip-Klick (Punkt 3) — der Dialogweg bleibt für Mehrfachbelege.

**Umsetzungshinweise.** Erkennung im `input`-Handler des Textfelds
(60-editor.js): Text vor der Schreibmarke per Range lesen, Muster
`(^|\s)@(\S{2,})$`. Composition-Events (IME) nicht unterbrechen. Einfügen
über die vorhandene `fuegeAmCursorEin`/`chipHtml`-Maschinerie, vorher den
`@…`-Text aus der Range löschen. Ein Tippfluss + Einfügen soll EIN
Verlaufsschritt sein (`Verlauf.merke` mit demselben `ort` wie das Tippen
reicht dafür aus).

**Abnahme** (pruefe_bausteine.mjs):
- Auswahl über zwei Wörter → Leiste erscheint; Klick auf B → Modell
  enthält `{text:…, b:true}`; Strg+Z macht es rückgängig.
- `@holl` tippen → Liste zeigt Holland-Quelle; Enter → Modell enthält
  Zitat-Run, der getippte `@holl`-Text ist weg.
- `@xyz` ohne Treffer → Eintrag „Neue Quelle anlegen …" vorhanden.

---

## 5 · Wortzahl (Priorität 4)

**Sollverhalten.**

1. Im Panelkopf der Textspalte steht dauerhaft die Wortzahl des
   Fließtexts („4 230 Wörter"), aktualisiert bei jeder Änderung
   (Zählung ist billig; an `aenderung()` in 80-app.js hängen).
2. In der Gliederung steht rechts neben jedem Ebene-1-Kapitel dessen
   Wortzahl, gedämpft (`--tinte-2`).
3. **Was zählt:** Text der Bausteine `absatz`, `blockzitat`, `liste`,
   `ueberschrift` über `Richtext.zuText` (Chips zählen als ihr
   angezeigter Text, Fußnotentext zählt mit). **Nicht** zählen: Tabellen,
   Abbildungs-/Diagrammtitel und -anmerkungen, Formeln, Deckblatt,
   Abstract. Diese Konvention als Kommentar an die Zählfunktion.

**Umsetzungshinweise.** Zählfunktion nach `quelle/10-modell.js`
(`woerter(dok)` → `{gesamt, jeKapitel: Map<blockId, n>}`), Anzeige in
60-editor.js (`zeichneGliederung`) und 80-app.js. Zielwortzahl o. Ä.
bewusst **nicht** bauen (YAGNI).

**Abnahme** (pruefe_bausteine.mjs): bekanntes Dokument → angezeigte
Gesamtzahl stimmt exakt; Kapitelzahlen stehen in der Gliederung; nach
Tippen von drei Wörtern erhöht sich die Zahl um 3.

---

## 6 · Suchen und Ersetzen (Priorität 5)

**Sollverhalten.**

1. **Strg+F** öffnet eine Leiste oben in der Textspalte: Suchfeld,
   Treffer „3 von 12", ▲▼-Navigation, aufklappbar „Ersetzen durch …" mit
   „Ersetzen" und „Alle ersetzen", Kästchen „Groß-/Kleinschreibung".
   Escape schließt. (Strg+H zusätzlich für direkt-mit-Ersetzen.)
2. **Suchraum:** Text-Runs von Absatz/Blockzitat/Liste/Überschrift,
   Tabellenzellen und -köpfe, Titel/Anmerkungen von Tabellen und
   Abbildungen. Chips werden nicht durchsucht (ihr Text ist abgeleitet).
3. Treffer-Navigation springt zum Baustein (`Editor.fokussiereAn`) und
   markiert den Treffer (Range-Auswahl).
4. **Ersetzen** arbeitet auf dem Modell, v1 nur innerhalb eines Runs
   (ein über eine Fett-Grenze laufender Treffer wird gefunden, aber beim
   Ersetzen übersprungen und gemeldet — Einschränkung im Code
   kommentieren). Vor jedem Ersetzen `Verlauf.merke`; „Alle ersetzen"
   ist EIN Verlaufsschritt.

**Abnahme** (pruefe_bausteine.mjs): „Proband"→„Teilnehmende" über drei
Bausteine und eine Tabellenzelle per „Alle ersetzen" → Modell überall
geändert, Meldung nennt die Anzahl, EIN Strg+Z stellt alles zurück;
Groß-/Kleinschreibungs-Kästchen wirkt.

---

## 7 · Sicherungen-Oberfläche + Zwei-Fenster-Schutz (Priorität 6)

### 7a · Frühere Fassungen öffnen

**Problem.** `Arbeiten/.sicherungen/` hält 20 Fassungen je Projekt —
erreichbar nur per Dateimanager. Im Panikmoment („Kapitel gestern
zerschossen") nützt das niemandem.

**Sollverhalten.** Im Öffnen-Dialog (`DialogeExtra.projektOeffnen`,
quelle/76-dialoge-extra.js) je Projekt ein Link „Frühere Fassungen …" →
Liste der Sicherungen (Datum/Uhrzeit aus dem Dateinamen, Titel, Größe).
Klick: **erst** wird der aktuelle Stand normal gesichert (legt selbst
eine Sicherung an — nichts geht verloren), **dann** die gewählte Fassung
geladen; `Verlauf.leeren()`; Meldung „Fassung vom 18.08., 14:32
wiederhergestellt".

**Umsetzungshinweise.** `begleiter/ablage.py`: `sicherungen(name)`
(Liste) und `lade_sicherung(name, datei)`; `datei` strikt gegen das
eigene Listing validieren (kein Pfadausbruch — Muster: `_BILDNAME` in
ablage.py). Bilder: Sicherungen referenzieren `bild:`-Dateien, die
`_raeume_bilder` nur löscht, wenn keine Sicherung sie mehr nennt — beim
Laden einer Sicherung funktioniert `_hole_bilder_zurueck` daher
unverändert. Routen in `schreibtisch.py`, Client in
`quelle/74-begleiter.js`.

### 7b · Zwei Fenster

**Problem.** Zweimal geöffnet gewinnt beim Sichern wortlos der Letzte.

**Sollverhalten.** `lade`/`liste` geben den Änderungsstand (mtime) mit;
die Oberfläche merkt ihn sich und schickt ihn beim Sichern zurück. Liegt
auf der Platte ein neuerer Stand, antwortet der Begleiter mit 409 und die
Oberfläche fragt: „Diese Arbeit wurde in einem anderen Fenster geändert.
**Neu laden** (empfohlen) / **Trotzdem überschreiben**" — Überschreiben
legt wie immer erst eine Sicherung an.

**Abnahme** (pruefe_begleiter.py): Sicherungsliste enthält angelegte
Fassungen; Wiederherstellung liefert den alten Inhalt samt Bild;
Pfadausbruch wird abgewiesen; Sichern mit veraltetem Stand → 409, mit
aktuellem → ok.

---

## 8 · Quelle per DOI anlegen (Priorität 7)

**Sollverhalten.** Im Dialog „Neue Quelle" (`quelleBearbeiten`,
quelle/50-dialoge.js) oben ein Feld „DOI einfügen" + Knopf „Nachschlagen".
Der Begleiter fragt `https://api.crossref.org/works/<doi>` ab (urllib,
Timeout 10 s, sprechender User-Agent) und die Maske wird **vorbefüllt**,
bleibt aber editierbar — nichts wird ungefragt gespeichert. Abbildung
der Crossref-Felder auf das eigene Schema (Muster: die Zotero-Abbildung
in `begleiter/zotero.py`): `author[]` → „Nachname, Vorname; …",
`issued` → Jahr, `container-title` → Zeitschrift/Buchtitel, `type`
(journal-article/book/book-chapter) → artikel/buch/kapitel, `volume`,
`issue`, `page` (Bindestrich → wie gehabt), `publisher`, `DOI`.
Fehlschlag (offline, unbekannter DOI) → verständliche Meldung im Dialog,
kein Abbruch. ISBN-Suche bewusst **nicht** in v1.

**Umsetzungshinweise.** Neues Modul `begleiter/nachschlagen.py` mit
reiner Abbildungsfunktion (JSON→felder) getrennt vom HTTP-Teil — die
Prüfungen testen die Abbildung mit einer eingecheckten
Crossref-Antwort als Fixture (`pruefungen/daten/crossref-probe.json`),
**kein Netz in Prüfungen**. Route in `schreibtisch.py` (Token-geschützt
wie alle), Client in 74-begleiter.js.

**Abnahme** (pruefe_begleiter.py): Fixture-JSON → korrekte Felder
inkl. Autorenformat und Typ; kaputtes JSON → saubere Fehlermeldung.

---

## 9 · Kopfzeile aufräumen (Priorität 7, mit 8 zusammen sinnvoll)

**Problem.** Der Panelkopf der Textspalte mischt zwei Vokabulare:
„Neu Öffnen Sichern" neben „Zotero Import LaTeX ZIP".

**Sollverhalten.**

1. **Zotero** und **Import** wandern als Knöpfe „Aus Zotero …" / „Aus
   Datei …" in den Quellen-Dialog (`Dialoge.quellenverwaltung`) — es
   sind Wege, an Quellen zu kommen, keine eigenständigen Ziele.
2. **LaTeX** und **ZIP** wandern hinter einen Knopf **„Export"** mit
   kleinem Menü: „LaTeX ansehen", „ZIP herunterladen (Overleaf)".
3. Übrig bleiben: ↶ ↷ · Neu · Öffnen · Sichern · Export · ⚙ · ◐.
4. Hilfe-Dialog (50-dialoge.js) und README an die neuen Wege anpassen.

**Abnahme** (pruefe_ganz.mjs anpassen — der BibTeX-Import-Schritt läuft
dann über den Quellen-Dialog): alle bisherigen Wege funktionieren an
ihrem neuen Ort.

---

## 10 · Nachrangig (nur nach Rücksprache)

Der Vollständigkeit halber — bewusst hinten, jeweils mit dem Grund:

- **Text→PDF-Sprung (SyncTeX).** `-synctex=1` beim Bau, Begleiter-Route
  fragt das `synctex`-Werkzeug (Zeile→Seite, die Zeilenkarte existiert
  schon), Klick auf Baustein blättert das PDF. Rückrichtung (PDF→Text)
  deutlich aufwendiger, nicht in v1. *Grund für Aufschub: Nutzen klar,
  aber Aufwand/Fehlerfläche höher als alles oben.*
- **Gliederung: Kapitel per Drag umsortieren** — verschiebt die
  Überschrift **samt aller Folgeblöcke** bis zur nächsten gleich- oder
  höherrangigen Überschrift. Mit `Verlauf.merke`. *Aufschub: heute geht
  es Block für Block; lästig, aber möglich.*
- **„Mit Beispielarbeit starten"** im Neu-Dialog: halbe Seite mit
  Überschrift, Absatz samt Zitat/Kennwert/Verweis, Tabelle, Diagramm aus
  der Tabelle, Blockzitat, zwei Quellen — zeigt alle Konzepte zum
  Anfassen. Inhalt fachlich plausibel (Psychologie), erfundene Autoren.
- **Word-Export** (.docx): nur wenn `pandoc` installiert ist, mit klarer
  Ansage „Einbahnstraße — Änderungen in Word kommen nicht zurück".
- **Verschachtelte Listen, mehrabsätzige Fußnoten**: echte Lücken,
  selten auf dem kritischen Pfad.

---

## Definition of Done je Punkt

1. Verhalten wie beschrieben, auf Deutsch, ohne neue Abhängigkeiten.
2. `Verlauf` korrekt angebunden (Rückgängig-Prüfung je Punkt vorhanden).
3. Prüfungen des Punkts geschrieben, **alle sechs Suiten grün**.
4. `python3 bauen.py` läuft; README/Hilfe-Dialog angepasst, wo sich
   Bedienwege ändern.
5. Ein Commit je Punkt, Commit-Text erklärt das *Warum* (Stil siehe
   `git log`).
