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

> **MiKTeX-Nutzer:** In den MiKTeX-Einstellungen **„Pakete immer installieren"**
> wählen. Sonst öffnet MiKTeX beim ersten Bau einen Dialog, der auf einen Klick
> wartet — im Hintergrund, unsichtbar — und der Bau bleibt bis zum Zeitablauf
> hängen.

Beim Start prüft der Schreibtisch beides und sagt, was fehlt.

---

## Wie es sich anfühlt

Links die **Gliederung**, in der Mitte der **Text**, rechts das **PDF** — das
echte, nicht ein Nachbau. Zwei Sekunden nach der letzten Eingabe wird neu
gebaut; eiliger geht es mit **Strg+Enter**.

Jeder Abschnitt ist ein **Baustein**: Absatz, Überschrift, Tabelle, Abbildung,
Blockzitat, Liste, Formel. Maus darüber — links ein Griff zum Verschieben,
oben rechts die Werkzeuge.

**Drei Farben, drei Bedeutungen** im Fließtext:
Quellenangaben türkis, Querverweise blau, statistische Kennwerte ocker.

### Wenn etwas schiefgeht

LaTeX meldet `! Undefined control sequence. l.234`. Das siehst du nie.
Stattdessen: **eine deutsche Erklärung über dem PDF, und ein Klick springt zu
dem Baustein, der sie ausgelöst hat.** Möglich, weil der Schreibtisch die
`.tex` selbst erzeugt und deshalb weiß, welche Zeile woher kam.

Das **zuletzt gelungene PDF bleibt stehen** — die Ansicht wird nie leer.

Offene Klammern in Formeln werden schon vor dem Bau bemerkt, ohne auf LaTeX
zu warten.

---

## Quellen

**Zotero** — einmal unter `zotero.org/settings/keys` einen Schlüssel anlegen
(*Create new private key*, Leserechte genügen) und eintragen. Der Schlüssel
liegt in `einstellungen.json` neben dem Programm, nicht im Browser. Die
Benutzernummer liest der Schreibtisch selbst aus dem Schlüssel.

**Citavi** — dort exportieren (*Datei → Exportieren → BibTeX* oder *RIS*) und
die Datei über **Import** hineinziehen. Citavi hat keine offene
Programmierschnittstelle; der Umweg über die Exportdatei ist der einzige, den
es gibt. Derselbe Importer liest auch EndNote, Mendeley, JabRef und
Zotero-Exporte (BibTeX, RIS, CSL-JSON).

---

## Wo die Arbeit liegt

Eine JSON-Datei je Arbeit im Ordner **Arbeiten** — leicht zu sichern, zu
kopieren, zu verschicken. Beim Überschreiben wandert die Vorfassung nach
`Arbeiten/.sicherungen` (die letzten 20 bleiben).

**ZIP** packt zusätzlich das reine LaTeX-Projekt (`arbeit.tex`,
`literatur.bib`, Stildatei, Bilder, Bauskript) — zum Weitergeben oder für
Overleaf.

---

## Aufbau

```
Schreibtisch/
├── schreibtisch.py      Start: HTTP auf 127.0.0.1, öffnet den Browser
├── start.sh · start.bat
├── begleiter/           nur Standardbibliothek — kein pip, kein venv
│   ├── uebersetzen.py   pdflatex/biber-Läufe, Logauswertung
│   ├── zotero.py        Web-API von Zotero
│   └── ablage.py        Projekte und Einstellungen
├── quelle/              Oberfläche (11 Module)
├── bauen.py             quelle/* → oberflaeche.html
├── pruefungen/
└── Arbeiten/            deine Arbeiten
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
python3 pruefungen/pruefe_begleiter.py   # 29 Prüfungen: LaTeX-Läufe, Logauswertung,
                                         #   Zeilenkarte, Zotero-Abbildung, Ablage
npm install                              # einmalig, holt playwright-core
node pruefungen/pruefe_ganz.mjs          # 12 Schritte: Browser bis fertiges PDF
```

Die Browserprüfung nimmt den von playwright mitgelieferten Chromium. Wer einen
vorhandenen benutzen will, setzt Umgebungsvariablen:

```
CHROMIUM=/pfad/zu/chrome \
PLAYWRIGHT_CORE=/pfad/zu/playwright-core/index.mjs \
SCHREIBTISCH_BILDER=/pfad/fuer/screenshots \
node pruefungen/pruefe_ganz.mjs
```

Die erste Prüfung braucht ein installiertes LaTeX, die zweite zusätzlich einen
Browser. Stand: beide vollständig grün, keine Konsolenfehler.

---

## Bekannte Grenzen

- **Windows ist ungetestet.** Entwickelt und geprüft wurde unter Linux.
  Abgefangen ist, was bekannt ist (Pfade mit Leerzeichen, `CREATE_NO_WINDOW`,
  Protokolle als `cp1252` lesbar, `subprocess` ohne Shell) — der erste echte
  Windows-Lauf steht aber noch aus.
- Citavi-Projektdateien (`.ctv6`) werden nicht direkt gelesen, nur Exporte.
- Kein gleichzeitiges Bearbeiten zu zweit, keine Änderungsverfolgung.
- Bilder liegen in der Projektdatei; sehr große Scans lassen sie wachsen.
