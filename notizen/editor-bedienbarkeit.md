# Wie gut lässt sich der Editor bedienen?

Eine Untersuchung: Was macht einen guten Editor aus, wo steht der
Schreibtisch heute, und was sollte sich ändern. Stand August 2026,
Grundlage ist der vollständige Quellcode in `quelle/` sowie fünf
Verhaltensproben im echten Browser (Playwright, wie `pruefungen/`).

---

## 1. Was einen guten Editor ausmacht

Aus der Usability-Forschung und aus dem, woran sich Blockeditoren in
der Praxis messen lassen müssen, ergeben sich sechs Maßstäbe:

1. **Erlernte Konventionen gelten.** Pfeiltasten, Enter, Rücktaste,
   Strg+Z — wer aus Word oder Google Docs kommt, bringt Erwartungen
   mit. Jede Abweichung wird als Fehler des Programms erlebt, nicht
   als Eigenheit. Die Gutenberg-Entwicklung (WordPress) hat das
   schmerzhaft gelernt: Die beiden meistdiskutierten Mängel ihres
   Blockeditors waren **Pfeilnavigation über Blockgrenzen** und
   **blockübergreifende Auswahl** — beides Dinge, die „jeder Editor
   auf jedem Gerät kann“ und deren Fehlen sofort auffällt.
2. **Direkte Manipulation.** Was man sieht, kann man anfassen. Ein
   Titel wird dort getippt, wo er steht — nicht in einer Leiste
   anderswo. Dialoge sind für Seltenes; Häufiges gehört an das Objekt
   selbst.
3. **Tastatur für Geübte, Maus für Neue.** Moderne Editoren (Notion,
   Docs) bedienen beide: Markdown-Kürzel (`## `, `- `),
   Schrägstrich-Menüs und „Umwandeln in“ machen die Struktur ohne
   Maus erreichbar; Knöpfe und Menüs bleiben für alle anderen.
4. **Fehlertoleranz.** Nichts geht verloren, alles ist zurücknehmbar,
   destruktive Wege sind schwerer als konstruktive.
5. **Sichtbarer Systemzustand.** Gespeichert? Gebaut? Wo lande ich,
   wenn ich jetzt einfüge? Der Editor sagt es, bevor man es
   ausprobieren muss.
6. **Zugänglichkeit.** Screenreader, reine Tastaturbedienung,
   Berührgeräte.

Eine Randnotiz, die die Grundarchitektur des Schreibtischs bestätigt:
Die Studie von Knauff & Nejasmic (2014, PLOS ONE) ließ 40
Forschende Texte in Word und in LaTeX setzen — die LaTeX-Gruppe war
langsamer und machte **mehr** Format-, Rechtschreib- und
Satzfehler, selbst Profis schnitten schlechter ab als Word-Neulinge.
Struktur-Editor vorn, LaTeX unsichtbar hinten — genau die Wette, auf
die der Schreibtisch setzt — ist also die richtige. Die Messlatte für
das Textverhalten ist damit aber ausdrücklich **Word**, nicht Overleaf.

## 2. Was der Schreibtisch heute schon gut macht

Der Vergleich fällt in vielem zugunsten des Schreibtischs aus; das
gehört genauso ins Protokoll wie die Mängel:

- **Das echte PDF** statt eines Nachbaus, mit übersetzten
  Fehlermeldungen und Klick-zur-Stelle — das können weder Word noch
  Overleaf in dieser Form.
- **Chips** für Zitate, Verweise, Kennwerte, Fußnoten, Formeln:
  unzerreißbar, klickbar, mit vier Farben vier Bedeutungen.
- **@-Zitieren** beim Tippen, mit Pfeil-/Enter-Bedienung — das Muster
  der besten modernen Editoren, hier bereits eingebaut.
- **Dokumentweites Rückgängig** über Strukturänderungen hinweg, mit
  Rückkehr der Schreibmarke an den Ort der Änderung. Das ist besser
  als bei den meisten Blockeditoren.
- **Objektleiste** wie in Word (Tabellenentwurf, Bildformat) und die
  schwebende **Auswahlleiste** über markiertem Text.
- **Suche im Modell** statt im DOM (findet Tabellenzellen und
  Beschriftungen), Ersetzen mit ehrlicher Meldung bei Formatgrenzen.
- **Sichern ohne Nachdenken**: alle vier Sekunden, gestaffelte
  Sicherungen, Zweifenster-Erkennung mit klarem Dialog.
- **Einfügen statt Umweg**: Screenshot → Abbildung, Excel-Bereich →
  Tabelle, CSV → Tabelle, Bild in den Text ziehen.
- Formeleditor mit Sofortvorschau und Fehlermeldung **vor** dem Bau.
- Dunkelmodus, `prefers-reduced-motion`, sichtbare Fokusringe.

Die Befunde unten sind also kein Verriss, sondern die Lücke zwischen
„sehr gut durchdacht“ und „fühlt sich in jeder Einzelheit wie Word an“.

---

## 3. Befunde

Sortiert nach Schwere. Was mit **[Probe]** markiert ist, wurde im
echten Browser nachgestellt und ist belegt, nicht vermutet.

### A. Fehler (sofort beheben)

**A1 · Rücktaste im leeren Listenpunkt löscht die ganze Liste.**
[Probe] Eine Liste mit „Punkt eins“, „Punkt zwei“ und einem leeren
dritten Punkt steht hinter einem Absatz. Rücktaste im leeren Punkt →
die **gesamte Liste** verschwindet, samt der gefüllten Punkte.
Ursache: `textfeld()` hängt den allgemeinen `tasten()`-Handler auch an
Listenpunkte; dessen Rücktaste-Zweig prüft `feld.textContent` (den
einen Punkt), löscht aber `dok().bloecke[i]` (den ganzen Baustein) —
und läuft **vor** dem listen­eigenen Handler in `blockInhalt()`.
Enter hat die Ausnahme (`if (block.typ === 'liste') return`),
Rücktaste nicht. → In `tasten()` bei `liste` genauso früh aussteigen;
die Punkt-Logik regelt der Listen-Handler. (`quelle/60-editor.js`,
Rücktaste-Zweig um Zeile 345.)

**A2 · Strg+Umschalt+Z tut zwei Dinge gleichzeitig.**
[Probe] Im Textfeld öffnet Strg+Umschalt+Z den Zitatdialog **und**
führt zugleich „Wiederholen“ aus: Der Feld-Handler
(`tasten()`) fängt die Taste für das Zitieren ab, verhindert aber nur
das Standardverhalten — das Ereignis steigt weiter zum
Dokument-Handler in `80-app.js`, der dieselbe Kombination als
Wiederholen versteht. Ein zurückgenommener Schritt wird so beim
Zitieren unbemerkt wieder eingespielt. Dazu kommt: Strg+Umschalt+Z
**ist** in Word, Docs und im Browser die Konvention für Wiederholen —
die Belegung mit Zitieren bricht Maßstab 1. → Kürzel fürs Zitieren
verlegen (das @-Zitieren ist ohnehin der schnellere Weg; frei wäre
z. B. Strg+Umschalt+Q wie „Quelle“), Strg+Umschalt+Z dem Wiederholen
lassen. Unabhängig davon: wer die Taste im Feld behandelt, muss
`stopPropagation()` rufen.

### B. Grundverhalten im Text (größte Erwartungslücke)

**B1 · Pfeiltasten enden an der Blockgrenze.** [Probe] Am Ende eines
Absatzes führt weder Pfeil-runter noch Pfeil-rechts in den nächsten
Baustein — die Schreibmarke sitzt fest, weiter geht es nur mit der
Maus. Word, Docs, Notion und inzwischen auch Gutenberg laufen mit den
Pfeilen durchs ganze Dokument. Das ist die am häufigsten getroffene
Erwartung überhaupt: Sie greift bei jedem Lesen und Korrigieren.
→ In `tasten()`: Pfeil-runter in der letzten Zeile (bzw. Pfeil-rechts
am Ende) fokussiert den nächsten Baustein an dessen Anfang,
Pfeil-hoch/-links entsprechend rückwärts. `fokussiereAn()` existiert
schon; ob die Marke in der letzten Zeile steht, verrät ein Vergleich
der Cursor-Rechtecke (`getBoundingClientRect` der kollabierten
Range gegen das Feld).

**B2 · Es gibt keine Auswahl über Baustein-Grenzen.** Zwei Absätze
zugleich markieren, kopieren, löschen — geht nicht; auch mehrere
Bausteine lassen sich nicht gemeinsam anfassen (verschieben, löschen,
duplizieren). Das ist die zweite Kernerwartung aus Maßstab 1, und
zugleich die technisch härteste: Getrennte
`contenteditable`-Felder können browserbedingt keine gemeinsame
Textauswahl tragen. Gutenberg hat darum den **Auswahlmodus**
eingeführt, und der passt auch hier: **Escape** im Text wählt den
Baustein als Ganzes (sichtbarer Rahmen), Umschalt+Pfeil erweitert auf
Nachbarn, Entf/Strg+C/Ziehen wirken auf die Auswahl, Enter kehrt in
den Text zurück. Das deckt die häufigen Fälle (ganze Absätze
umstellen, ein Kapitel roh kopieren) ohne den unlösbaren Teil
(halber Absatz A + halber Absatz B).

**B3 · Listen lassen einen nicht heraus.** [Probe] Enter im leeren
letzten Punkt erzeugt einen weiteren leeren Punkt — überall sonst
beendet es die Liste und stellt einen Absatz darunter. Ebenso fehlt:
Rücktaste am Anfang eines gefüllten Punktes verschmilzt ihn mit dem
vorigen. → Beides im Listen-Handler von `blockInhalt()` ergänzen;
zusammen mit A1 wird das Listenverhalten damit vollständig.

**B4 · Bausteine lassen sich nicht duplizieren oder kopieren.** Eine
einmal eingerichtete Tabelle als Vorlage für die nächste nehmen — der
naheliegendste Weg, und es gibt ihn nicht. → „Duplizieren“ in der
Blockleiste (neben ↑ ↓ ✕) und als Strg+D; das Modell macht es
trivial (`Verlauf.klone` auf den Baustein, neue Id, einfügen).

### C. Struktur und Gliederung

**C1 · Eine Überschrift verschieben verschiebt ihr Kapitel nicht
mit.** [Probe] ↑ auf „Kapitel B“ schiebt nur die Überschriftszeile
über den Text von Kapitel A — Ergebnis: Kapitel A | **Kapitel B** |
Text zu A | Text zu B. Kaum je gewollt und im PDF erst spät sichtbar.
In Word (Gliederungsansicht) und Docs wandert der Abschnitt mit.
→ Bei Überschriften bedeuten ↑/↓ (und Ziehen am Griff) „Abschnitt
verschieben“: alle Bausteine bis zur nächsten Überschrift gleicher
oder höherer Ebene wandern mit. Wer wirklich nur die Zeile meint,
hat weiter Rücktaste/Enter. Das erledigt nebenbei den größten Teil
der bekannten Grenze „Kapitel in der Gliederung per Ziehen
umsortieren“ — die Gliederung braucht dann nur noch dieselbe
Verschiebe-Funktion als Ziehziel.

**C2 · Bausteine können ihre Art nicht wechseln.** Ein Absatz, der
eine Überschrift werden soll (oder umgekehrt), muss gelöscht und neu
angelegt werden — mitsamt Abtippen. Word hat Formatvorlagen, Notion
„Turn into“. → In der Objektleiste ein „Umwandeln in …“ für die
Textbausteine (Absatz ↔ Überschrift ↔ Listenpunkt ↔ Blockzitat); die
Runs bleiben dabei erhalten. Dazu die Markdown-Kürzel am
Zeilenanfang: `## ` + Leertaste → Überschrift Ebene 2, `- ` → Liste,
`1. ` → nummerierte Liste. Beides zusammen kostet wenig — die
Umwandlung ist im Modell nur ein Typwechsel.

**C3 · Einfügen braucht die Maus.** Die Einfügeleiste unten ist gut
auffindbar, aber der einzige Weg. Das @-Zitieren zeigt schon, wie gut
ein Tipp-Menü hier funktioniert. → Dasselbe Muster für `/` am
Zeilenanfang: Menü mit den zehn Bausteinarten, Pfeile + Enter,
Weitertippen filtert („/tab“ → Tabelle). Die vorhandene
@-Mechanik (`atZeige`, `atListe`) lässt sich fast unverändert
wiederverwenden.

**C4 · Wo Neues landet, sieht man erst hinterher.** „Nach dem gerade
gewählten Baustein“ steht nur im Tooltip; die Datei-Ablage zeigt
dagegen längst eine Einfügemarke. → Beim Überfahren der
Einfügeleiste dieselbe Marke an der Zielstelle zeigen; alternativ
(oder zusätzlich) ein kleines + zwischen zwei Bausteinen beim
Überfahren, wie Notion und Medium es etabliert haben.

### D. Direkte Manipulation statt Fernbedienung

**D1 · Titel und Anmerkung sind am Objekt nicht anfassbar.** Die
Karte einer Tabelle sagt wörtlich „Ohne Titel — oben in der Leiste
eintragen“. Der Text steht vor einem, getippt wird woanders — genau
die Fernbedienung, die Maßstab 2 verbietet. Die Objektleiste ist als
Zweitweg richtig (Word macht es genauso), aber der Erstweg gehört an
die Karte. → `karte-titel` und `karte-anm` direkt editierbar machen
(dieselbe `contenteditable`-Technik wie Tabellenzellen), Leiste und
Karte halten sich gegenseitig aktuell — die Synchronisierung
existiert für die Richtung Leiste→Karte bereits.

**D2 · Formel-Baustein: Einfachklick vs. Doppelklick.** Chips öffnen
sich mit einem Klick, der Formel-Baustein erst mit Doppelklick (der
Hinweis dazu steckt nur im Tooltip). → Einheitlich: ein Klick wählt,
Enter oder Doppelklick öffnet — und ein sichtbarer ✎-Knopf auf der
Karte für alle, die Tooltips nicht lesen. (Die Objektleiste hat den
Knopf schon; auf der Karte fehlt er.)

**D3 · Tabellen wachsen nur nach unten und nach rechts.** Zeilen
lassen sich nicht dazwischen einfügen, Spalten nicht umordnen oder an
anderer Stelle ergänzen. Für echte Ergebnistabellen (Zeile
„Gesamt“ nachträglich über die letzte, Spalte „SD“ neben „M“) heißt
das: Inhalte von Hand umschaufeln. → Die vorhandene Spaltenleiste um
„+ davor / + danach“ und ⇄ erweitern; je Zeile dasselbe am linken
Rand. Kein Dialog nötig.

**D4 · Bildbreite nur als Zahl.** Der übliche Ziehgriff an der
Bildecke fehlt; 10–100 % über ein Zahlenfeld ist präzise, aber
indirekt. Nachrangig — als Ergänzung, nicht Ersatz.

### E. Suchen und Finden

**E1 · Die Suche kennt Fußnoten, Formeln und Abstract nicht.**
`alleStellen()` in `quelle/64-suche.js` sammelt Text-Runs, Zellen und
Beschriftungen — der Text **in** Fußnoten-Chips (`run.fussnote`), der
Formel-Quelltext und `meta.abstract` fehlen. Ein Tippfehler in einer
Fußnote ist damit unauffindbar, obwohl er im PDF steht. → Mindestens
die Fußnoten in den Suchraum aufnehmen (eigene Stellenart, Ersetzen
inklusive); Abstract dahinter.

**E2 · Treffer sind unsichtbar.** Die Suche springt Treffer einzeln
an; „21 von 34“ sagt nicht, **wo** die anderen liegen. Word und
Browser markieren alle Treffer gelb. → Mit der CSS Custom Highlight
API (`CSS.highlights`, in allen aktuellen Browsern) lassen sich alle
Fundstellen markieren, ohne das DOM anzufassen — das passt gut zur
bestehenden Architektur, die Treffer bereits als
(Feld, Position, Länge) kennt.

### F. Arbeitsfläche

**F1 · Die Spalten sind festgenagelt.** Gliederung 248 px, PDF
470 px, dazwischen der Text — nichts lässt sich ziehen, und die
PDF-Spalte lässt sich (anders als die Gliederung) im breiten Fenster
nicht zuklappen. Auf einem 13-Zoll-Laptop bleiben dem Text ~640 px,
während man vielleicht gerade nur schreiben will. → Ziehbare
Trennlinien mit gemerkter Breite; ein Zuklapp-Knopf für die
PDF-Spalte symmetrisch zur Gliederung.

**F2 · Berührgeräte erreichen die Werkzeuge nicht.** Blockleiste und
Tabellen-Spaltenwerkzeuge erscheinen bei `:hover` — auf dem Tablet
gibt es das nicht. Die Blockleiste rettet sich über den
Gewählt-Zustand; die Spalten- und Zeilenwerkzeuge der Tabelle hängen
allein an `:hover` (`.tab-karte:hover .spaltenwerkzeug`). → Bei
gewählter Tabelle (`.block.gewaehlt`) die Werkzeuge ebenfalls
einblenden — eine CSS-Zeile.

### G. Zugänglichkeit

Die Grundlagen stimmen (Fokusringe, reduzierte Bewegung, echte
`<button>`), aber für Screenreader-Nutzer ist der Editor derzeit
praktisch nicht bedienbar:

- **G1** Meldungen (`#meldungen`) haben kein `aria-live` — „Gesichert
  als …“, Fehlermeldungen und alle Rückmeldungen sind lautlos.
  → `role="status"` auf den Behälter, eine Zeile.
- **G2** Dialoge haben kein `role="dialog"`, kein `aria-modal`,
  keine Fokusfalle, und der Fokus kehrt nach dem Schließen nicht
  zum Auslöser zurück. → In `Dialoge.basis()` einmal zentral
  nachrüsten — es erbt jeder Dialog.
- **G3** Die @-Liste und das künftige /-Menü brauchen
  Combobox-Semantik (`role="listbox"`, `aria-activedescendant`),
  sonst hört ein Screenreader-Nutzer die Vorschläge nicht.
- **G4** Bausteine ohne Textfeld (Diagramm, Formel, Umbruch) sind nur
  per Mausklick wählbar — der Auswahlmodus aus B2 löst das mit.

### H. Kleineres

- **H1** Überschriften enden bei Ebene 3; APA 7 kennt fünf. Für
  Dissertationen wird Ebene 4 real gebraucht.
- **H2** Die B/I-Knöpfe zeigen nicht an, ob die Auswahl schon fett
  oder kursiv ist (`document.queryCommandState` liefert das).
- **H3** Einfügen **in** Tabellenzellen hat keinen eigenen Weg: Ein
  mehrzelliger Excel-Bereich landet komplett in einer Zelle. → Im
  Zellen-Paste tabulatorgetrennte Daten erkennen und zellenweise ab
  der Zielzelle verteilen.
- **H4** Die Wortzählung je Kapitel ist da — ein einstellbares
  Wortziel (Prüfungsordnungen!) mit dezenter Anzeige wäre ein kleiner
  Aufsatz darauf.
- **H5** Fett/Kursiv laufen über das veraltete `document.execCommand`.
  Es funktioniert noch überall; langfristig gehört die Umschaltung in
  eigene Run-Logik, dann verschwindet auch die
  `beforeinput`-Sonderbehandlung.
- **H6** `Editor.zeichne()` zeichnet bei jeder Strukturänderung die
  ganze Liste neu, samt aller Bilder (Daten-URLs). Bei einer
  Dissertation mit vielen Abbildungen kann Enter spürbar haken. Erst
  messen (Beispielarbeit vervielfacht), dann gegebenenfalls nur den
  betroffenen Ausschnitt neu zeichnen.

---

## 4. Reihenfolge

| Stufe | Befunde | Begründung |
|---|---|---|
| **Sofort** | A1, A2 | Echte Fehler; A1 vernichtet Inhalt, A2 verfälscht den Verlauf. |
| **Als Nächstes** | B1, B3, D1, F2, G1 | Größte Wirkung je Zeile Code: Pfeilnavigation und Listenverhalten treffen jede Schreibminute; D1/F2/G1 sind klein und beheben klare Verstöße. |
| **Danach** | C2, C3, B4, E1, C4, H2, H3 | Tastatur-Struktur (Umwandeln, /-Menü) und die Suchlücken; alles überschaubar, weil Modell und @-Mechanik die Arbeit schon machen. |
| **Größere Vorhaben** | B2, C1, D3, E2, F1, G2–G4 | Auswahlmodus, Abschnitts-Verschieben, Tabellenwerkzeuge, Treffermarkierung, ziehbare Spalten, Dialog-Semantik. |
| **Beobachten** | D4, H1, H4, H5, H6, SyncTeX | Nachrangig oder erst bei Bedarf (Messung, Nutzerwunsch). |

Ein roter Faden für die Stufen 2–4: Fast alles davon ist **eine
Erwartung aus Word erfüllen, ohne einen Dialog zu bauen** — die
Architektur (Modell als JSON, Fokus-Helfer, @-Menü, Objektleiste)
trägt jede dieser Änderungen bereits.

---

## 5. Belege und Quellen

Die fünf Proben liefen gegen den laufenden Schreibtisch im
Playwright-Chromium (Muster wie `pruefungen/pruefe_bausteine.mjs`):
Pfeiltasten an Blockgrenzen, Rücktaste im leeren Listenpunkt, Enter
im letzten leeren Listenpunkt, Strg+Umschalt+Z im Textfeld,
↑ auf einer Überschrift mit folgendem Absatz.

- Gutenberg zu blockübergreifender Auswahl: [Issue #3629](https://github.com/WordPress/gutenberg/issues/3629) — „absolutely necessary … every editor has this capability“
- Gutenberg zu Pfeilnavigation zwischen Blöcken: [Issue #1091](https://github.com/WordPress/gutenberg/issues/1091), [Discussion #38311](https://github.com/WordPress/gutenberg/discussions/38311)
- Gutenberg Auswahl-/Navigationsmodus per Escape: [Issue #4382](https://github.com/WordPress/gutenberg/issues/4382)
- Knauff & Nejasmic (2014): [An Efficiency Comparison of Document Preparation Systems Used in Academic Research and Development](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0115069) (PLOS ONE)
- Notion: [Using slash commands](https://www.notion.com/help/guides/using-slash-commands); Markdown-Kürzel und „Turn into“: [Notion Fundamentals](https://thomasjfrank.com/a-guide-to-editing-and-formatting-text-in-notion-notion-fundamentals/)
- Nielsen-Heuristiken im Überblick: [10 Usability Heuristics](https://myuxacademy.com/blog/nielsens-10-usability-heuristics/)
