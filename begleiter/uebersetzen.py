"""LaTeX-Läufe steuern und ihr Protokoll in verständliche Fehler übersetzen.

Nur Standardbibliothek. Läuft unter Linux und Windows.
"""

from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
import sys
import threading
import time

# Unter Windows sonst ein aufblitzendes Konsolenfenster bei jedem Lauf.
_OHNE_FENSTER = {}
if sys.platform == "win32":
    _OHNE_FENSTER = {"creationflags": 0x08000000}  # CREATE_NO_WINDOW

HAUPTDATEI = "arbeit"
# Der allererste Lauf ist ein Sonderfall: MiKTeX lädt dabei die benötigten
# Pakete nach -- babel-german, biblatex-apa, tgtermes und ein Dutzend mehr.
# Das dauert je nach Leitung Minuten und darf nicht als Fehler gelten.
ZEITABLAUF_ERSTLAUF = 900
ZEITABLAUF = 180
# Vier, nicht drei: läuft biber mit, verbraucht dessen Lauf einen der
# Durchgänge, und ein Dokument, dessen Seitenzahlen sich durch das
# Inhaltsverzeichnis verschieben, braucht danach noch zwei.
MAX_DURCHLAEUFE = 4


# ---------------------------------------------------------------- Werkzeuge

def finde(programm: str) -> str | None:
    """pdflatex/biber im Pfad suchen; unter Windows auch mit .exe."""
    treffer = shutil.which(programm)
    if treffer:
        return treffer
    if sys.platform == "win32":
        return shutil.which(programm + ".exe")
    return None


def _fassung(pfad: str) -> str:
    try:
        e = subprocess.run([pfad, "--version"], capture_output=True, text=True,
                           timeout=20, errors="replace", **_OHNE_FENSTER)
        return (e.stdout or e.stderr).splitlines()[0].strip()
    except Exception:
        return "unbekannt"


def pruefe_werkzeuge() -> dict:
    """Was ist da, was fehlt — für die Startseite."""
    ergebnis = {"vollstaendig": True, "programme": {}}
    for name in ("pdflatex", "biber"):
        pfad = finde(name)
        ergebnis["programme"][name] = {
            "gefunden": bool(pfad),
            "pfad": pfad or "",
            "fassung": _fassung(pfad) if pfad else "",
        }
        if not pfad:
            ergebnis["vollstaendig"] = False
    ergebnis["system"] = sys.platform
    return ergebnis


# ------------------------------------------------------------ Logauswertung

# Aus dem Protokoll lesbare Meldungen. Reihenfolge zählt: die erste
# passende Regel gewinnt, deshalb stehen die genauen vor den allgemeinen.
_ERKLAERUNGEN: list[tuple[str, str, str]] = [
    (r"File [`'\"]([^'\"]+)[`'\"] not found",
     "Eine Datei fehlt: {0}",
     "Bei einem Bild: stimmt der Dateiname? Bei einem Paket: fehlt es in "
     "deiner TeX-Installation und muss nachinstalliert werden."),
    (r"Undefined control sequence",
     "Ein LaTeX-Befehl ist unbekannt.",
     "Meist ein Tippfehler in einer Formel. Prüfe die markierte Stelle."),
    (r"Missing \$ inserted",
     "Ein Sonderzeichen wurde als Formel gelesen.",
     "Zeichen wie & % $ # _ brauchen in LaTeX einen Schrägstrich davor. "
     "Der Editor macht das normalerweise selbst — melde das bitte, wenn es "
     "in normalem Text passiert."),
    (r"File ended while scanning use of \\(\w+)",
     "Bei \\{0} fehlt eine schließende geschweifte Klammer.",
     "Zu jeder öffnenden Klammer { gehört eine schließende }. "
     "Passiert fast nur in selbst getippten Formeln."),
    (r"Runaway argument|Paragraph ended before|ended by .end.\{|"
     r"Missing \} inserted|File ended while scanning",
     "Eine Klammer wurde nicht geschlossen.",
     "Passiert fast nur in selbst getippten Formeln. Zähle die "
     "geschweiften Klammern in der markierten Formel."),
    (r"Misplaced alignment tab|Extra alignment tab",
     "Eine Tabellenzeile hat zu viele Spalten.",
     "Öffne die Tabelle über das Zahnrad und prüfe die Spaltenzahl. "
     "Falls keine Tabelle in der Nähe ist: ein &-Zeichen im Text oder "
     "in einer Quelle."),
    (r"Dimension too large|Arithmetic overflow",
     "Ein Maß ist zu groß.",
     "Meist eine zu breit gesetzte Abbildung. Stelle die Breite kleiner."),
    (r"Emergency stop|Fatal error occurred",
     "LaTeX hat abgebrochen.",
     "Der eigentliche Grund steht in der Meldung darüber."),
    (r"Package (\w+) Error: (.+)",
     "Das Paket {0} meldet: {1}",
     ""),
    (r"LaTeX Error: (.+)",
     "LaTeX meldet: {0}",
     ""),
]


def _erklaere(rohtext: str) -> tuple[str, str]:
    for muster, vorlage, rat in _ERKLAERUNGEN:
        t = re.search(muster, rohtext)
        if t:
            gruppen = [g if g is not None else "" for g in t.groups()]
            try:
                return vorlage.format(*gruppen), rat
            except (IndexError, KeyError):
                return vorlage, rat
    return rohtext.strip().lstrip("!").strip() or "Unbekannter Fehler", ""


# Ab hier ist die Fehlermeldung zu Ende und es folgt Beiwerk, das
# niemand sehen will (Speicherstatistik, Dateilisten).
_SCHLUSS = re.compile(
    r"^(Here is how much|\s*$|<\*>|\)|\(|Transcript written|"
    r"Output written|No pages of output)")

# pdflatex mit -file-line-error: "./arbeit.tex:234: Undefined control sequence"
_DATEI_ZEILE = re.compile(r"^\.?/?([\w./\\-]+\.\w+):(\d+):\s*(.*)$")


def werte_log_aus(log: str) -> list[dict]:
    """Aus dem pdfTeX-Protokoll eine Liste verständlicher Fehler machen."""
    zeilen = log.splitlines()
    fehler: list[dict] = []
    gesehen: set[tuple] = set()
    i = 0
    while i < len(zeilen):
        z = zeilen[i]
        dz = _DATEI_ZEILE.match(z)
        if not (z.startswith("!") or dz):
            i += 1
            continue

        datei, zeilennummer = None, None
        if dz:
            datei, zeilennummer, rest = dz.group(1), int(dz.group(2)), dz.group(3)
            block = ["! " + rest if not rest.startswith("!") else rest]
        else:
            block = [z]

        j = i + 1
        # Höchstens acht Folgezeilen -- danach kommt erfahrungsgemäß Beiwerk.
        while j < len(zeilen) and j - i <= 8:
            folge = zeilen[j]
            treffer = re.match(r"^l\.(\d+)", folge)
            if treffer:
                if zeilennummer is None:
                    zeilennummer = int(treffer.group(1))
                block.append(folge)
                j += 1
                break
            if folge.startswith("!") or _DATEI_ZEILE.match(folge) or _SCHLUSS.match(folge):
                break
            block.append(folge)
            j += 1

        roh = "\n".join(block).strip()
        meldung, rat = _erklaere(roh)
        # Fehler in unserer eigenen Stildatei sind keine Nutzerfehler,
        # aber verschweigen wäre falsch -- nur nicht auf einen Baustein zeigen.
        if datei and not datei.endswith("arbeit.tex"):
            zeilennummer = None
        kennung = (zeilennummer, meldung)
        if kennung not in gesehen:
            gesehen.add(kennung)
            fehler.append({"art": "fehler", "sorte": "", "schluessel": "",
                           "zeile": zeilennummer, "meldung": meldung,
                           "rat": rat, "roh": roh[:1200]})
        i = max(j, i + 1)
    return fehler


# Warnungen, die im fertigen Dokument sichtbar werden. LaTeX bricht
# deswegen nicht ab -- das PDF entsteht, und im Text steht dann der rohe
# Schlüssel oder ein "??". Genau die Sorte Fehler, die man bei der Abgabe
# übersieht. Deshalb werden sie eigens gemeldet.
_WARNUNGEN: list[tuple[str, str, str, str]] = [
    (r"Citation '([^']+)' on page \d+ undefined",
     "zitat",
     "Die Quelle „{0}“ steht nicht im Literaturverzeichnis.",
     "Im Text ist sie zitiert, aber es gibt keinen passenden Eintrag. "
     "Im PDF erscheint an dieser Stelle der rohe Schlüssel."),
    (r"Reference '([^']+)' on page \d+ undefined",
     "verweis",
     "Ein Querverweis geht ins Leere.",
     "Das Ziel wurde vermutlich gelöscht. Im PDF steht dort „??“."),
    # "Please (re)run Biber" ist ein Zwischenstand, kein Problem --
    # nach dem nächsten Durchlauf ist er weg.
    (r"Package biblatex Warning: "
     r"(?!Please \(re\)run|The following entry could not|Empty bibliography)(.+)",
     "", "Das Literaturverzeichnis meldet: {0}", ""),
    # Bewusst NICHT gemeldet: "Empty bibliography". Das trifft auf jedes
    # frische Dokument zu und wäre damit Dauerrauschen -- Warnungen, die
    # immer leuchten, werden nicht mehr gelesen. Dass eine angelegte
    # Quelle nicht zitiert ist, steht ohnehin in der Quellenliste.
]


def werte_warnungen_aus(log: str) -> list[dict]:
    """Warnungen einsammeln, die im fertigen PDF sichtbar werden."""
    raus: list[dict] = []
    gesehen: set[tuple] = set()
    for zeile in log.splitlines():
        for muster, sorte, vorlage, rat in _WARNUNGEN:
            t = re.search(muster, zeile)
            if not t:
                continue
            gruppen = [g if g is not None else "" for g in t.groups()]
            try:
                meldung = vorlage.format(*gruppen)
            except (IndexError, KeyError):
                meldung = vorlage
            schluessel = gruppen[0] if (sorte and gruppen) else ""
            kennung = (sorte, schluessel, meldung)
            if kennung in gesehen:
                break
            gesehen.add(kennung)
            raus.append({"art": "warnung", "sorte": sorte, "schluessel": schluessel,
                         "zeile": None, "meldung": meldung, "rat": rat,
                         "roh": zeile.strip()[:400]})
            break
    return raus


def _braucht_neuen_lauf(log: str) -> bool:
    return bool(re.search(
        r"Rerun to get|Label\(s\) may have changed|"
        r"Please \(re\)run Biber|Rerun LaTeX", log))


def _braucht_biber(log: str) -> bool:
    """biblatex verlangt ausdrücklich nach biber. Ein weiterer
    pdflatex-Lauf hilft dann nicht -- vorher muss biber laufen, sonst
    dreht sich die Schleife dreimal um nichts und das
    Literaturverzeichnis bleibt auf dem alten Stand."""
    return bool(re.search(r"Please \(re\)run Biber", log))


# Biber schreibt seine Fehler in eigener Sprache und in eine eigene
# Datei (.blg). Diese Zeilen sind der einzige Ort, an dem ein kaputtes
# Literaturverzeichnis überhaupt auftaucht.
_BIBER_FEHLER = re.compile(r"\bERROR\s*[-–]\s*(.+)")

_BIBER_ERKLAERUNGEN = [
    (r"Cannot find '?([^' ]+)'?",
     "Die Quellendatei „{0}“ wurde nicht gefunden.",
     "Das ist ein Fehler im Schreibtisch selbst — bitte melden."),
    (r"syntax error|BibTeX subsystem",
     "Eine Quelle ist fehlerhaft aufgebaut und konnte nicht gelesen werden.",
     "Meist ein ungewöhnliches Zeichen in einem Quellenfeld. "
     "Prüfe die zuletzt geänderte Quelle im Quellen-Dialog."),
    (r"Duplicate entry key '?([^' ]+)'?",
     "Der Quellenschlüssel „{0}“ kommt zweimal vor.",
     "Zwei Quellen teilen sich denselben Schlüssel — eine umbenennen."),
]


def werte_biber_aus(text: str) -> list[dict]:
    """Fehler von biber als Karten, wie die von pdflatex.

    Ohne das bleibt ein kaputtes Literaturverzeichnis völlig stumm: der
    Rückgabewert wurde bisher nur zum Überspringen des Zwischenspeichers
    benutzt, die Ausgabe verworfen. Sichtbar wurde daraus nur „Quelle
    steht nicht im Literaturverzeichnis“ -- eine Erklärung, die in die
    Irre führt, weil die Quelle sehr wohl angelegt ist.
    """
    raus, gesehen = [], set()
    for zeile in (text or "").splitlines():
        t = _BIBER_FEHLER.search(zeile)
        if not t:
            continue
        roh = t.group(1).strip()
        meldung = "Das Literaturprogramm meldet: " + roh
        rat = ("Die vollständige Meldung steht unten im Protokoll.")
        for muster, vorlage, hinweis in _BIBER_ERKLAERUNGEN:
            g = re.search(muster, roh)
            if g:
                gruppen = [x if x is not None else "" for x in g.groups()]
                meldung = vorlage.format(*gruppen) if gruppen else vorlage
                rat = hinweis
                break
        if meldung in gesehen:
            continue
        gesehen.add(meldung)
        raus.append({"art": "fehler", "sorte": "literatur", "schluessel": "",
                     "zeile": None, "meldung": meldung, "rat": rat,
                     "roh": zeile.strip()[:400]})
    return raus


# ---------------------------------------------------------------- Übersetzer

class Uebersetzer:
    """Hält einen Arbeitsordner je Sitzung, damit Hilfsdateien erhalten
    bleiben — der zweite Lauf ist dadurch deutlich schneller."""

    def __init__(self, arbeitsordner: str):
        self.ordner = arbeitsordner
        os.makedirs(os.path.join(self.ordner, "abbildungen"), exist_ok=True)
        self._hashes: dict[str, str] = {}
        self._letzte_bib = ""
        self._letzte_zitate = ""
        self._letzte_bcf = ""
        self.pdf_fassung = 0
        self._erstlauf = True
        self._sperre = threading.Lock()
        self._laufender: subprocess.Popen | None = None
        self._abbruch = False

    # -------------------------------------------------- Dateien vorbereiten

    def _schreibe_wenn_neu(self, name: str, inhalt: bytes) -> bool:
        # Der Name kommt von außen. Er darf nur in diesen Ordner zeigen
        # -- der Aufrufer prüft schon, hier steht der Riegel am Ziel.
        pfad = os.path.abspath(os.path.join(self.ordner, name))
        if os.path.commonpath([os.path.abspath(self.ordner), pfad]) \
                != os.path.abspath(self.ordner):
            raise ValueError(f"Dateiname zeigt aus dem Arbeitsordner: {name}")
        h = hashlib.sha1(inhalt).hexdigest()
        if self._hashes.get(name) == h:
            return False
        os.makedirs(os.path.dirname(pfad) or self.ordner, exist_ok=True)
        with open(pfad, "wb") as f:
            f.write(inhalt)
        self._hashes[name] = h
        return True

    def _dateihash(self, name: str) -> str:
        """Prüfsumme einer Datei im Arbeitsordner, leer wenn es sie
        nicht gibt."""
        try:
            with open(os.path.join(self.ordner, name), "rb") as f:
                return hashlib.sha1(f.read()).hexdigest()
        except OSError:
            return ""

    # ------------------------------------------------------------- Ausführen

    def _lauf(self, befehl: list[str], grenze: int = ZEITABLAUF) -> tuple[int, str]:
        if self._abbruch:
            return -1, ""
        try:
            p = subprocess.Popen(
                befehl, cwd=self.ordner,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, errors="replace", **_OHNE_FENSTER)
        except FileNotFoundError:
            return -2, f"Programm nicht gefunden: {befehl[0]}"
        self._laufender = p
        try:
            ausgabe, _ = p.communicate(timeout=grenze)
            return p.returncode, ausgabe or ""
        except subprocess.TimeoutExpired:
            p.kill()
            p.communicate()
            return -3, (f"Zeitablauf nach {grenze} Sekunden. Unter MiKTeX "
                        "wartet der Lauf womöglich auf einen "
                        "Installationsdialog, der im Hintergrund steht.")
        finally:
            self._laufender = None

    def brich_ab(self):
        """Laufenden Übersetzungsvorgang beenden, weil eine neuere Fassung ansteht."""
        self._abbruch = True
        p = self._laufender
        if p and p.poll() is None:
            try:
                p.kill()
            except Exception:
                pass

    # ---------------------------------------------------------- Hauptaufgabe

    def uebersetze(self, dateien: dict[str, str],
                   bilder: list[dict] | None = None) -> dict:
        """dateien: {name: text}. bilder: [{datei, bytes}].
        Gibt Status, Fehlerliste und Protokoll zurück."""
        with self._sperre:
            self._abbruch = False
            beginn = time.time()

            pdflatex = finde("pdflatex")
            biber = finde("biber")
            if not pdflatex:
                return {"status": "kein_latex", "warnungen": [], "fehler": [{
                    "art": "fehler", "sorte": "", "schluessel": "", "zeile": None,
                    "meldung": "pdflatex wurde nicht gefunden.",
                    "rat": "Installiere TeX Live (Linux) oder MiKTeX (Windows) "
                           "und starte den Schreibtisch neu.", "roh": ""}],
                    "log": "", "dauerMs": 0}

            for name, text in dateien.items():
                self._schreibe_wenn_neu(name, text.encode("utf-8"))
            for bild in (bilder or []):
                self._schreibe_wenn_neu(
                    os.path.join("abbildungen", bild["datei"]), bild["bytes"])

            bib = dateien.get("literatur.bib", "")
            zitate = "|".join(sorted(set(re.findall(
                r"\\(?:zit|autorzit|zitS|autorzitS)\{([^}]*)\}",
                dateien.get(HAUPTDATEI + ".tex", "")))))
            bbl = os.path.join(self.ordner, HAUPTDATEI + ".bbl")
            biber_noetig = (bib != self._letzte_bib
                            or zitate != self._letzte_zitate
                            or not os.path.exists(bbl))

            # -no-shell-escape: der Formel-Baustein reicht getipptes
            # LaTeX unverändert durch. Bei einer weitergegebenen oder
            # heruntergeladenen .json-Arbeit liefe darin sonst fremder
            # Code, sobald man sie das erste Mal baut.
            grundbefehl = [pdflatex, "-interaction=nonstopmode",
                           "-no-shell-escape",
                           "-halt-on-error", "-file-line-error",
                           HAUPTDATEI + ".tex"]

            grenze = ZEITABLAUF_ERSTLAUF if self._erstlauf else ZEITABLAUF
            protokoll = []
            rc, ausgabe = self._lauf(grundbefehl, grenze)
            protokoll.append(ausgabe)

            if self._abbruch:
                return {"status": "abgebrochen", "fehler": [], "warnungen": [],
                        "log": "", "dauerMs": 0}

            # Der .bcf ist das, was biber liest. Ändert er sich, muss
            # biber neu laufen -- beim Umschalten der Sprache etwa
            # bleiben .bib und Zitatschlüssel gleich, das
            # Literaturverzeichnis wäre sonst weiter deutsch sortiert
            # und deutsch beschriftet.
            if self._dateihash(HAUPTDATEI + ".bcf") != self._letzte_bcf:
                biber_noetig = True

            biber_fehler: list[dict] = []

            def lauf_biber():
                """Gibt True zurück, wenn biber durchlief."""
                rcb, ausgabeb = self._lauf([biber, HAUPTDATEI], grenze)
                protokoll.append(ausgabeb)
                if rcb == 0:
                    self._letzte_bib = bib
                    self._letzte_zitate = zitate
                    self._letzte_bcf = self._dateihash(HAUPTDATEI + ".bcf")
                    return True
                # Biber legt sein eigenes Protokoll daneben; die
                # eigentliche Ursache steht meistens dort.
                blg = os.path.join(self.ordner, HAUPTDATEI + ".blg")
                text = ausgabeb
                try:
                    with open(blg, encoding="utf-8", errors="replace") as f:
                        text += "\n" + f.read()
                except OSError:
                    pass
                protokoll.append(text)
                biber_fehler.extend(werte_biber_aus(text) or [{
                    "art": "fehler", "sorte": "literatur", "schluessel": "",
                    "zeile": None,
                    "meldung": "Das Literaturverzeichnis konnte nicht "
                               "erzeugt werden.",
                    "rat": "Das vollständige Protokoll steht unten.",
                    "roh": text.strip()[-400:]}])
                return False

            if biber_noetig and biber and rc == 0:
                lauf_biber()

            durchlauf = 1
            while (rc == 0 and durchlauf < MAX_DURCHLAEUFE
                   and (_braucht_neuen_lauf(ausgabe) or biber_noetig)
                   and not self._abbruch):
                # Verlangt biblatex nach biber, hilft ein weiterer
                # pdflatex-Lauf nicht -- er würde die Bitte nur
                # wiederholen, bis das Kontingent aufgebraucht ist.
                if biber and not biber_fehler and _braucht_biber(ausgabe):
                    lauf_biber()
                rc, ausgabe = self._lauf(grundbefehl, grenze)
                protokoll.append(ausgabe)
                biber_noetig = False
                durchlauf += 1

            log = "\n".join(protokoll)
            logdatei = os.path.join(self.ordner, HAUPTDATEI + ".log")
            # Nur, wenn dieser Lauf überhaupt stattgefunden hat. Sonst
            # überschrieb das Protokoll des VORIGEN Laufs die
            # eigentliche Meldung -- bei "Programm nicht gefunden" sah
            # die Nutzerin die Fehler von vorhin statt der Ursache.
            if rc >= 0 and os.path.exists(logdatei):
                try:
                    with open(logdatei, encoding="utf-8", errors="replace") as f:
                        log = f.read()
                except OSError:
                    pass

            fehler = werte_log_aus(log)
            warnungen = werte_warnungen_aus(log)
            # Biber-Fehler zuerst: sie sind die Ursache, alles andere
            # ist Folge.
            fehler = biber_fehler + fehler

            # Reicht das Kontingent nicht, stimmen Inhaltsverzeichnis und
            # Seitenzahlen womöglich nicht -- das darf nicht stumm bleiben.
            if rc == 0 and durchlauf >= MAX_DURCHLAEUFE and _braucht_neuen_lauf(ausgabe):
                warnungen.append({
                    "art": "warnung", "sorte": "", "schluessel": "", "zeile": None,
                    "meldung": "Inhaltsverzeichnis und Seitenzahlen sind "
                               "vielleicht noch nicht auf dem letzten Stand.",
                    "rat": "Noch einmal „PDF bauen“ drücken, dann stimmt es.",
                    "roh": ""})
            pdf = os.path.join(self.ordner, HAUPTDATEI + ".pdf")
            pdf_da = os.path.exists(pdf) and os.path.getsize(pdf) > 0

            if rc == 0 and pdf_da:
                self.pdf_fassung += 1
                self._erstlauf = False        # ab jetzt sind Pakete da
                status = "ok"
            elif rc == -3:
                status = "zeitablauf"
                fehler.insert(0, {
                    "art": "fehler", "sorte": "", "schluessel": "",
                    "zeile": None, "meldung": ausgabe,
                    "rat": "In MiKTeX unter Einstellungen die Option "
                           "„Pakete immer installieren“ wählen.", "roh": ""})
            else:
                status = "fehler"
                if rc == -2 and not fehler:
                    # "Programm nicht gefunden" ging bisher unter.
                    fehler.append({
                        "art": "fehler", "sorte": "", "schluessel": "", "zeile": None,
                        "meldung": ausgabe or "LaTeX wurde nicht gefunden.",
                        "rat": "Installiere TeX Live (Linux) oder MiKTeX "
                               "(Windows) und starte den Schreibtisch neu.",
                        "roh": ""})
                if not fehler:
                    fehler.append({
                        "art": "fehler", "sorte": "", "schluessel": "", "zeile": None,
                        "meldung": "LaTeX ist ohne verwertbare Meldung abgebrochen.",
                        "rat": "Das vollständige Protokoll steht unten.", "roh": ""})

            return {
                "status": status,
                "fehler": fehler,
                "warnungen": warnungen,
                "pdfFassung": self.pdf_fassung,
                "pdfVorhanden": pdf_da,
                "log": log[-40000:],
                "dauerMs": int((time.time() - beginn) * 1000),
                "durchlaeufe": durchlauf,
            }

    def pdf_pfad(self) -> str:
        return os.path.join(self.ordner, HAUPTDATEI + ".pdf")
