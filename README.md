# Schreibtisch

Wissenschaftliche Arbeiten schreiben — LaTeX setzt sie, ohne dass man LaTeX
können muss. Für empirische Arbeiten: Hausarbeit, Bachelor-, Masterarbeit,
Dissertation, psychologisches Gutachten. APA 7 auf Deutsch.

## Starten

**Linux** `./start.sh` · **Windows** Doppelklick auf `start.bat`

Der Browser öffnet sich von selbst. Zum Beenden: Strg+C im Terminal.

### Voraussetzungen

| | |
|---|---|
| **LaTeX** | `pdflatex` und `biber` müssen installiert sein |
| **Python 3** | Linux: schon da. Windows: von python.org, dabei *Add Python to PATH* ankreuzen |

```
Linux    sudo apt install texlive-full biber
Windows  MiKTeX von miktex.org
```

> **MiKTeX-Nutzer:** **Der allererste Bau dauert einige Minuten** — MiKTeX
> lädt dabei die benötigten Pakete nach (babel-german, biblatex-apa, tgtermes
> und rund ein Dutzend mehr). Die Statusleiste zählt die Sekunden mit; bitte
> laufen lassen, nicht abbrechen. Jeder weitere Bau dauert dann Sekunden.
> MiKTeX Dauerhaft ruhig wird es über
> *MiKTeX Console → Einstellungen → „Pakete bei Bedarf installieren: Ja, ohne
> zu fragen"*. Sonst wartet der Bau auf einen Klick, den man leicht übersieht.

Klemmt etwas, hilft:

```
python schreibtisch.py --diagnose
```

Das zeigt System, Python-Fassung, Konsolen-Kodierung, gefundene
LaTeX-Programme und ob der Port belegt werden kann.

Beim Start prüft der Schreibtisch beides und sagt, was fehlt.

---

Beim allerersten Start ist nichts da — die **Kurzanleitung** geht auf, und
unter *Neu* steht neben den fünf Arbeitstypen **„Mit der Beispielarbeit
starten“**: eine fertige kleine Hausarbeit mit Tabelle, Diagramm, Zitaten und
Fußnote, zum Ausprobieren. Sie ist eine Vorlage neben dem Programm, keine
Arbeit in `Arbeiten/`; was man darin ändert, wird beim ersten Sichern zur
eigenen Kopie.

---

## Wie es sich anfühlt

Links die **Gliederung**, in der Mitte der **Text**, rechts das **PDF** — das
echte, nicht ein Nachbau. Zwei Sekunden nach der letzten Eingabe wird neu
gebaut; eiliger geht es mit **Strg+Enter**.

Jeder Abschnitt ist ein **Baustein**: Absatz, Überschrift, Tabelle, Abbildung,
Diagramm, Blockzitat, Liste, Formel. Maus darüber — links ein Griff zum
Verschieben, oben rechts die Werkzeuge.

**Schreiben wie gewohnt:** Enter teilt den Absatz an der Schreibmarke,
Rücktaste am Anfang führt ihn mit dem darüber zusammen, Umschalt+Enter setzt
einen Zeilenumbruch innerhalb des Absatzes. Die Pfeiltasten laufen über
Bausteingrenzen hinweg, Enter im leeren letzten Listenpunkt beendet die
Liste. Zitate und Querverweise werden dabei nie zerrissen. Den Titel einer
Tabelle oder Abbildung tippt man direkt an ihrer Karte.

**Struktur ohne Maus:** `## `, `- `, `1. ` oder `> ` am Absatzanfang machen
aus dem Absatz eine Überschrift, Liste oder ein Blockzitat; ein `/` öffnet
das Einfügen-Menü direkt an der Schreibmarke. *Umwandeln* in der
Objektleiste wechselt die Art eines Bausteins nachträglich, Strg+D
dupliziert ihn — eine fertig eingerichtete Tabelle wird so zur Vorlage für
die nächste.

**Strg+Z nimmt alles zurück**, nicht nur Getipptes: ein gelöschter Baustein,
eine verschobene Überschrift, eine eingefügte Tabelle, ein Zahnrad-Dialog.
Strg+Y stellt es wieder her. Ein Tippfluss zählt als ein Schritt, nicht als
dreißig — achtzig Schritte werden vorgehalten.

**Einfügen statt Umweg:** Ein Bildschirmfoto in der Zwischenablage wird mit
Strg+V zur Abbildung. Ein aus Excel kopierter Bereich wird zur APA-7-Tabelle.
Eine Bilddatei lässt sich mitten in den Text ziehen — sie landet dort, wo man
loslässt.

**Deutsch oder Englisch:** Unter *Layout* stellt man die Sprache der
Arbeit um. Damit wechseln Trennung, Anführungszeichen und jedes feste
Wort im PDF — *Anmerkung./Note.*, *Literaturverzeichnis/References*,
*S./p.*, die Beschriftungen des Deckblatts, die eidesstattliche
Erklärung. Auch die Chips im Editor und die Rechtschreibprüfung des
Browsers ziehen mit. Die Oberfläche selbst bleibt deutsch.

**Mehrere Belege in einer Klammer:** Im Zitat-Fenster klickt man so viele
Quellen an, wie der Satz braucht — im Text steht dann
*(Müller & Weber, 2020; Schmidt, 2021)*, alphabetisch geordnet, wie APA 7 es
verlangt. Im Satz statt in Klammern bleiben sie getrennt.

**Vier Farben, vier Bedeutungen** im Fließtext:
Quellenangaben türkis, Querverweise blau, statistische Kennwerte ocker,
Formeln violett.

### Formeln

**Einfügen → ∑ Formel** öffnet den Formeleditor: links LaTeX, rechts die
**gesetzte Formel, die beim Tippen mitgeht** — ohne Bibliothek und ohne
Internet, der Browser setzt MathML von Haus aus. Wer kein LaTeX kann,
klickt sich die Formel zusammen: Brüche, Wurzeln, Summen, griechische
Buchstaben, Matrizen — markierter Text wandert dabei in die erste Lücke
der Vorlage. Unter **Statistik** liegen die Formeln, die in empirischen
Arbeiten ohnehin gebraucht werden: z-Wert, Standardabweichung, Cohens *d*,
Korrelation, χ², Konfidenzintervall, Cronbachs α.

Fehlende Klammern, ein verirrtes `$`, ein unbekannter Befehl — all das wird
**beim Tippen gemeldet**, nicht erst nach dem LaTeX-Lauf. Eingefügtes mit
`$…$` oder `\[…\]` drumherum wird automatisch ausgezogen, ein `\\` für
mehrzeilige Formeln automatisch in eine `gathered`-Umgebung gesetzt.

**Nummerierte Formeln** bekommen eine (1) am rechten Rand und lassen sich
per **Querverweis** ansprechen — „Formel (1)“ stimmt auch nach dem
Umsortieren, im Editor wie im PDF. Für ein η² mitten im Satz gibt es die
**Formel im Satz**: Werkzeugleiste (oder Auswahlleiste) → ∑, sie erscheint
als violetter Chip, gesetzt wie im PDF, ein Klick öffnet sie wieder.

### Diagramme

Vier Arten, direkt in LaTeX gesetzt (pgfplots) — Vektorgrafik in der Schrift
des Dokuments:

| Art | Spalten |
|---|---|
| **Balken** mit Fehlerbalken | Kategorie · Wert · Fehler (optional); mehrere Wertspalten ergeben Gruppen |
| **Linie / Profil** | x-Wert · je weitere Spalte eine Linie |
| **Streudiagramm** | x · y, mit Ausgleichsgerade; r und n kommen in die Anmerkung |
| **Boxplot** | je Spalte eine Gruppe, darunter die Rohwerte |

Die Zahlen tippt man ins Raster, fügt sie aus Excel oder SPSS ein (Strg+V),
zieht eine CSV-Datei darauf — oder verweist auf **eine Tabelle im Dokument**.
Der kürzeste Weg dahin: **„📊 Diagramm daraus"** direkt unter jeder Tabelle.
Beim Verweis wird nichts kopiert: ändert sich die Tabelle, ändert sich das
Diagramm mit.

Was APA 7 zwingend in der Anmerkung verlangt — welche Streuung die
Fehlerbalken zeigen, was die Kästen eines Boxplots bedeuten — ergänzt der
Schreibtisch selbst.

**Lange Namen auf der x-Achse** legen sich nicht mehr übereinander: passt ein
Name nicht in sein Fach, wird er umbrochen; reichen zwei Zeilen nicht, stehen
alle Namen um 45 Grad gedreht. Kurze Namen bleiben waagerecht.

**Zu den Farben.** Die vier Reihenfarben sind mit einem Prüfskript auf
Farbfehlsichtigkeit gerechnet, nicht nach Gefühl gewählt (schlechtestes
Nachbarpaar ΔE 17,0 bei Deuteranopie, Kontrast überall über 3:1). Im
**Graustufendruck fallen sie trotzdem zusammen** — Ocker und Grün landen bei
fast derselben Helligkeit. Deshalb unterscheiden sich Reihen immer
zusätzlich in Symbol und Strichart, und der Schalter *Graustufen* stuft die
Helligkeit und legt Füllmuster darüber.

### Wenn etwas schiefgeht

LaTeX meldet `! Undefined control sequence. l.234`. Das siehst du nie.
Stattdessen: **eine deutsche Erklärung über dem PDF, und ein Klick springt zu
dem Baustein, der sie ausgelöst hat.** Möglich, weil der Schreibtisch die
`.tex` selbst erzeugt und deshalb weiß, welche Zeile woher kam.

Das **zuletzt gelungene PDF bleibt stehen** — die Ansicht wird nie leer.

**Auch das Stille wird gemeldet.** Manche Mängel lassen LaTeX anstandslos
durchlaufen und stehen trotzdem im abgegebenen Dokument:

| | |
|---|---|
| zitierte Quelle fehlt im Verzeichnis | im PDF steht der rohe Schlüssel |
| Querverweis geht ins Leere | im PDF steht `??` |
| Zusammenfassung eingeschaltet, aber leer | die Seite entfällt |

Diese erscheinen als **PRÜFEN** in Ocker (statt rot) und werden über den
Schlüssel unmittelbar dem richtigen Baustein zugeordnet — genauer als über
eine Zeilennummer. Routinemeldungen bleiben absichtlich stumm: eine Warnung,
die bei jedem Dokument leuchtet, wird nicht mehr gelesen.

Offene Klammern in Formeln werden schon vor dem Bau bemerkt, ohne auf LaTeX
zu warten.

### Lange Tabellen

Eine schwebende Tabelle, die nicht auf eine Seite passt, wird von LaTeX
**stillschweigend abgeschnitten** — ohne Fehlermeldung. Der Schreibtisch
schätzt deshalb die Höhe jeder Tabelle und setzt sie ab etwa einer Seite als
`longtable`: sie bricht über Seiten um, die Kopfzeile wiederholt sich, und ein
Hinweis „Fortsetzung auf der nächsten Seite" steht am Fuß. Kurze Tabellen
schweben weiterhin.

---

## Quellen

**Zotero** — einmal unter `zotero.org/settings/keys` einen Schlüssel anlegen
(*Create new private key*, Leserechte genügen) und eintragen. Der Schlüssel
liegt in `einstellungen.json` neben dem Programm, nicht im Browser. Die
Benutzernummer liest der Schreibtisch selbst aus dem Schlüssel.

**Citavi** — dort exportieren (*Datei → Exportieren → BibTeX* oder *RIS*) und
die Datei im Quellen-Dialog über **Aus Datei …** hineinziehen (Zotero direkt:
**Aus Zotero …**, eine Quelle einzeln: DOI einfügen und **Nachschlagen**).
Citavi hat keine offene
Programmierschnittstelle; der Umweg über die Exportdatei ist der einzige, den
es gibt. Derselbe Importer liest auch EndNote, Mendeley, JabRef und
Zotero-Exporte (BibTeX, RIS, CSL-JSON).

---

## Wo die Arbeit liegt

Eine JSON-Datei je Arbeit im Ordner **Arbeiten**. Beim Überschreiben
wandert die Vorfassung nach `Arbeiten/.sicherungen`. Aufgehoben wird
gestaffelt: die letzten zwölf Fassungen immer, davor je Stunde eine für
einen Tag, davor je Tag eine für einen Monat. Gesichert wird vier
Sekunden nach der letzten Eingabe — zwanzig Fassungen am Stück deckten
sonst keine zwei Minuten ab, und „gestern stand das Kapitel noch da“
wäre nicht mehr zu retten. Über den Öffnen-Dialog kommt man an jede
davon heran (**Frühere Fassungen …**).

Bilder liegen daneben in `Arbeiten/<Name>.bilder`, benannt nach ihrer
Prüfsumme; in der JSON steht nur der Verweis. Ein Bildschirmfoto wiegt
als Text im Dokument rund ein Drittel mehr als als Datei — bei einer
Sicherung alle vier Sekunden und zwanzig aufbewahrten Vorfassungen wären
das schnell Hunderte Megabytes. Über die Prüfsumme teilen sich alle
Sicherungen dieselbe Bilddatei. Wer eine Arbeit weitergibt, nimmt den
Bilderordner mit — oder gleich das ZIP.

**Export → PDF herunterladen** gibt das fertige Dokument heraus — das,
was abgegeben wird. Ist seit dem letzten Bau noch etwas getippt worden,
wird vorher gebaut; heruntergeladen wird also nie ein alter Stand.

**Export → ZIP herunterladen** packt das reine LaTeX-Projekt (`arbeit.tex`,
`literatur.bib`, Stildatei, Bilder, Bauskript) **und** die Arbeit als JSON in
einem Stück — zum Weitergeben oder für Overleaf. **Export → LaTeX ansehen**
zeigt vorher, was erzeugt wird.

---

## Aufbau

```
Schreibtisch/
├── schreibtisch.py      Start: HTTP auf 127.0.0.1, öffnet den Browser
├── start.sh · start.bat
├── begleiter/           nur Standardbibliothek — kein pip, kein venv
│   ├── uebersetzen.py   pdflatex/biber-Läufe, Logauswertung
│   ├── zotero.py        Web-API von Zotero
│   ├── nachschlagen.py  Quelle per DOI bei Crossref
│   └── ablage.py        Projekte und Einstellungen
├── quelle/              Oberfläche (19 Module)
├── beispiel/            die Beispielarbeit — Vorlage, keine Arbeit
├── bauen.py             quelle/* → oberflaeche.html
├── pruefungen/
└── Arbeiten/            deine Arbeiten (+ <Name>.bilder daneben)
```

Nach Änderungen in `quelle/`: `python3 bauen.py`.

### Die tragende Entscheidung

Das Dokument ist **JSON, nicht HTML**. Ein Absatz ist eine Liste von *Runs*:

```js
[ {text:"Wie bereits "}, {zitat:"holland1997", form:"narrativ"},
  {text:" zeigte, "},    {kennwert:"SW", wert:"104"} ]
```

Eingefügter Word-Text kann darum keine Formatierung einschleppen, und der
LaTeX-Generator muss nie raten. Er liefert zusätzlich eine **Zeilenkarte**
(Baustein → Zeilenbereich), aus der die Fehlerzuordnung entsteht.

### Warum ein Begleitprozess?

Ein Browser darf keine Programme starten. Der Python-Dienst ruft `pdflatex`
und `biber` auf, liest und schreibt Dateien und spricht mit Zotero. Er horcht
nur auf `127.0.0.1` und verlangt bei jeder Anfrage ein Zeichen, das beim Start
erzeugt und nur an die eigene Seite gegeben wird — damit keine fremde Seite im
selben Browser mitreden kann.

---

## Prüfungen

```
python3 pruefungen/pruefe_begleiter.py   # LaTeX-Läufe, Logauswertung, Zeilenkarte,
                                         #   Zotero- und Crossref-Abbildung, Ablage,
                                         #   Sicherungen. Ohne LaTeX läuft der Teil,
                                         #   der die Arbeiten auf der Platte betrifft.
python3 pruefungen/pruefe_absicherung.py # 16 Prüfungen: Zeichen, fremder Hostname,
                                         #   POST-Riegel, Pfadausbruch
python3 pruefungen/pruefe_abbruch.py     #  4 Prüfungen: Dienst übersteht Abbrüche
node     pruefungen/pruefe_dokument.mjs  # 16 Prüfungen: lange Tabellen verlieren
                                         #   keine Zeilen, Vorspann ohne Platzhalter
node     pruefungen/pruefe_diagramme.mjs # 16 Prüfungen: alle vier Diagrammarten,
                                         #   erzeugt und wirklich übersetzt
node     pruefungen/pruefe_formeln.mjs   # 31 Prüfungen: MathML-Vorschau,
                                         #   nummerierte und mehrzeilige Formeln,
                                         #   Formeln im Satz; mit LaTeX auch übersetzt
npm install                              # einmalig, holt playwright-core
node     pruefungen/pruefe_bausteine.mjs # Absätze, Einfügen, Tabellen, Dialoge,
                                         #   Literaturschlüssel, Export
node     pruefungen/pruefe_bedienung.mjs # 34 Prüfungen: Pfeile über Blockgrenzen,
                                         #   Listenverhalten, Tastenkürzel, Kartentitel,
                                         #   Markdown-Kürzel, /-Menü, Umwandeln, Duplizieren
node     pruefungen/pruefe_ganz.mjs      # 16 Schritte: Browser bis fertiges PDF
```

Die Browserprüfung nimmt den von playwright mitgelieferten Chromium. Wer einen
vorhandenen benutzen will, setzt Umgebungsvariablen:

```
CHROMIUM=/pfad/zu/chrome \
PLAYWRIGHT_CORE=/pfad/zu/playwright-core/index.mjs \
SCHREIBTISCH_BILDER=/pfad/fuer/screenshots \
node pruefungen/pruefe_ganz.mjs
```

Die LaTeX-Läufe brauchen ein installiertes LaTeX, die Browserprüfungen
zusätzlich einen Browser. Ohne LaTeX überspringt `pruefe_begleiter.py` die
Läufe und prüft den Rest weiter — was mit den Arbeiten auf der Platte
passiert, muss überall nachprüfbar sein.

---

## Bekannte Grenzen

- **Windows ist nur teilweise erprobt.** Entwickelt und automatisch geprüft
  wird unter Linux. Auf Windows 11 gemeldete und behobene Stolpersteine:
  der Selbstbau der Oberfläche lief über `os.system` und scheiterte an
  cmd-Zitierregeln (jetzt direkter Aufruf), Sonderzeichen im Startbericht
  konnten auf Konsolen ohne UTF-8 abbrechen (jetzt mit Rückfall auf ASCII),
  und ein abbrechender Browser erzeugte eine Traceback-Wand (jetzt still
  behandelt, mit eigener Prüfung abgesichert).
  Weitere Meldungen sind willkommen — `--diagnose` liefert das Nötige.
- Citavi-Projektdateien (`.ctv6`) werden nicht direkt gelesen, nur Exporte.
- Diagramme brauchen `pgfplots`; unter MiKTeX wird es beim ersten Diagramm
  nachgeladen, das dauert einmalig länger.
- Boxplots speichern die Rohwerte im Projekt — bei sehr großen Datensätzen
  wächst die Datei entsprechend.
- Kein gleichzeitiges Bearbeiten zu zweit, keine Änderungsverfolgung. Zwei
  Fenster auf derselben Arbeit merken einander aber: wer den älteren Stand
  sichern will, wird gefragt statt wortlos überschrieben.
- Noch nicht da: Kapitel in der Gliederung per Ziehen umsortieren,
  verschachtelte Listen, mehrabsätzige Fußnoten, Word-Export, der Sprung
  vom Text an die passende PDF-Stelle (SyncTeX). Ein Absatzwechsel in
  einer Fußnote wird zum Zeilenumbruch, statt den Bau abzubrechen.
