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
ZEITABLAUF = 120          # Sekunden je Einzellauf
MAX_DURCHLAEUFE = 3


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
     "Öffne die Tabelle über das Zahnrad und prüfe die Spaltenzahl."),
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
            fehler.append({"zeile": zeilennummer, "meldung": meldung,
                           "rat": rat, "roh": roh[:1200]})
        i = max(j, i + 1)
    return fehler


def _braucht_neuen_lauf(log: str) -> bool:
    return bool(re.search(
        r"Rerun to get|Label\(s\) may have changed|"
        r"Please \(re\)run Biber|Rerun LaTeX", log))


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
        self.pdf_fassung = 0
        self._sperre = threading.Lock()
        self._laufender: subprocess.Popen | None = None
        self._abbruch = False

    # -------------------------------------------------- Dateien vorbereiten

    def _schreibe_wenn_neu(self, name: str, inhalt: bytes) -> bool:
        h = hashlib.sha1(inhalt).hexdigest()
        if self._hashes.get(name) == h:
            return False
        pfad = os.path.join(self.ordner, name)
        os.makedirs(os.path.dirname(pfad) or self.ordner, exist_ok=True)
        with open(pfad, "wb") as f:
            f.write(inhalt)
        self._hashes[name] = h
        return True

    # ------------------------------------------------------------- Ausführen

    def _lauf(self, befehl: list[str]) -> tuple[int, str]:
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
            ausgabe, _ = p.communicate(timeout=ZEITABLAUF)
            return p.returncode, ausgabe or ""
        except subprocess.TimeoutExpired:
            p.kill()
            p.communicate()
            return -3, (f"Zeitablauf nach {ZEITABLAUF} Sekunden. Unter MiKTeX "
                        "wartet der Lauf womöglich auf einen Installationsdialog.")
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
                return {"status": "kein_latex", "fehler": [{
                    "zeile": None,
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

            grundbefehl = [pdflatex, "-interaction=nonstopmode",
                           "-halt-on-error", "-file-line-error",
                           HAUPTDATEI + ".tex"]

            protokoll = []
            rc, ausgabe = self._lauf(grundbefehl)
            protokoll.append(ausgabe)

            if self._abbruch:
                return {"status": "abgebrochen", "fehler": [], "log": "", "dauerMs": 0}

            if biber_noetig and biber and rc == 0:
                rcb, ausgabeb = self._lauf([biber, HAUPTDATEI])
                protokoll.append(ausgabeb)
                if rcb == 0:
                    self._letzte_bib = bib
                    self._letzte_zitate = zitate

            durchlauf = 1
            while (rc == 0 and durchlauf < MAX_DURCHLAEUFE
                   and (_braucht_neuen_lauf(ausgabe) or biber_noetig)
                   and not self._abbruch):
                rc, ausgabe = self._lauf(grundbefehl)
                protokoll.append(ausgabe)
                biber_noetig = False
                durchlauf += 1

            log = "\n".join(protokoll)
            logdatei = os.path.join(self.ordner, HAUPTDATEI + ".log")
            if os.path.exists(logdatei):
                try:
                    with open(logdatei, encoding="utf-8", errors="replace") as f:
                        log = f.read()
                except OSError:
                    pass

            fehler = werte_log_aus(log)
            pdf = os.path.join(self.ordner, HAUPTDATEI + ".pdf")
            pdf_da = os.path.exists(pdf) and os.path.getsize(pdf) > 0

            if rc == 0 and pdf_da:
                self.pdf_fassung += 1
                status = "ok"
            elif rc == -3:
                status = "zeitablauf"
                fehler.insert(0, {
                    "zeile": None, "meldung": ausgabe,
                    "rat": "In MiKTeX unter Einstellungen die Option "
                           "„Pakete immer installieren“ wählen.", "roh": ""})
            else:
                status = "fehler"
                if not fehler:
                    fehler.append({
                        "zeile": None,
                        "meldung": "LaTeX ist ohne verwertbare Meldung abgebrochen.",
                        "rat": "Das vollständige Protokoll steht unten.", "roh": ""})

            return {
                "status": status,
                "fehler": fehler,
                "pdfFassung": self.pdf_fassung,
                "pdfVorhanden": pdf_da,
                "log": log[-40000:],
                "dauerMs": int((time.time() - beginn) * 1000),
                "durchlaeufe": durchlauf,
            }

    def pdf_pfad(self) -> str:
        return os.path.join(self.ordner, HAUPTDATEI + ".pdf")
