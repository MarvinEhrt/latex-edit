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

## Wie es sich anfühlt

Links die **Gliederung**, in der Mitte der **Text**, rechts das **PDF** — das
echte, nicht ein Nachbau. Zwei Sekunden nach der letzten Eingabe wird neu
gebaut; eiliger geht es mit **Strg+Enter**.

Jeder Abschnitt ist ein **Baustein**: Absatz, Überschrift, Tabelle, Abbildung,
Diagramm, Blockzitat, Liste, Formel. Maus darüber — links ein Griff zum
Verschieben, oben rechts die Werkzeuge.

**Schreiben wie gewohnt:** Enter teilt den Absatz an der Schreibmarke,
Rücktaste am Anfang führt ihn mit dem darüber zusammen, Umschalt+Enter setzt
einen Zeilenumbruch innerhalb des Absatzes. Zitate und Querverweise werden
dabei nie zerrissen.

**Strg+Z nimmt alles zurück**, nicht nur Getipptes: ein gelöschter Baustein,
eine verschobene Überschrift, eine eingefügte Tabelle, ein Zahnrad-Dialog.
Strg+Y stellt es wieder her. Ein Tippfluss zählt als ein Schritt, nicht als
dreißig — achtzig Schritte werden vorgehalten.

**Einfügen statt Umweg:** Ein Bildschirmfoto in der Zwischenablage wird mit
Strg+V zur Abbildung. Ein aus Excel kopierter Bereich wird zur APA-7-Tabelle.
Eine Bilddatei lässt sich mitten in den Text ziehen — sie landet dort, wo man
loslässt.

**Mehrere Belege in einer Klammer:** Im Zitat-Fenster klickt man so viele
Quellen an, wie der Satz braucht — im Text steht dann
*(Müller & Weber, 2020; Schmidt, 2021)*, alphabetisch geordnet, wie APA 7 es
verlangt. Im Satz statt in Klammern bleiben sie getrennt.

**Drei Farben, drei Bedeutungen** im Fließtext:
Quellenangaben türkis, Querverweise blau, statistische Kennwerte ocker.

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
Beim Verweis wird nichts kopiert: ändert sich die Tabelle, ändert sich das
Diagramm mit.

Was APA 7 zwingend in der Anmerkung verlangt — welche Streuung die
Fehlerbalken zeigen, was die Kästen eines Boxplots bedeuten — ergänzt der
Schreibtisch selbst.

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
├── quelle/              Oberfläche (14 Module)
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
python3 pruefungen/pruefe_begleiter.py   # 36 Prüfungen: LaTeX-Läufe, Logauswertung,
                                         #   Zeilenkarte, Zotero-Abbildung, Ablage
python3 pruefungen/pruefe_abbruch.py     #  4 Prüfungen: Dienst übersteht Abbrüche
node     pruefungen/pruefe_dokument.mjs  # 16 Prüfungen: lange Tabellen verlieren
                                         #   keine Zeilen, Vorspann ohne Platzhalter
node     pruefungen/pruefe_diagramme.mjs # 16 Prüfungen: alle vier Diagrammarten,
                                         #   erzeugt und wirklich übersetzt
npm install                              # einmalig, holt playwright-core
node     pruefungen/pruefe_bausteine.mjs # 16 Prüfungen: Absätze, Einfügen, Tabellen
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

Die erste Prüfung braucht ein installiertes LaTeX, die zweite zusätzlich einen
Browser. Stand: beide vollständig grün, keine Konsolenfehler.

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
- Kein gleichzeitiges Bearbeiten zu zweit, keine Änderungsverfolgung.
- Bilder liegen in der Projektdatei; sehr große Scans lassen sie wachsen.
