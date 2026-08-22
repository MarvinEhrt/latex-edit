"""Jede Arbeit als eigenes Git-Repository, wahlweise mit GitHub verbunden.

Warum überhaupt: die Sicherungen in .sicherungen sind ein Sicherheitsnetz
gegen Abstürze, kein Verlauf. Sie liegen auf derselben Platte, tragen
keine Begründung und lassen sich nicht vergleichen. Wer eine
Abschlussarbeit über Monate schreibt, will beides: eine Kopie außer
Haus und die Frage "was habe ich letzte Woche geändert?" beantworten
können.

Wie: neben den Arbeiten liegt je Arbeit ein Arbeitsbaum unter
Arbeiten/.git-arbeiten/<Name>/. Darin steht die Arbeit als JSON --
und zusätzlich das erzeugte LaTeX, denn nur das ist zeilenweise
vergleichbar. Ein JSON-Diff sagt niemandem etwas, ein .tex-Diff zeigt
den geänderten Satz.

Abhängigkeiten: keine. `git` wird wie pdflatex als vorhandenes Programm
aufgerufen, die GitHub-API über urllib.

Das Zeichen (Token) steht nie in einer Datei des Repositories, nie in
.git/config und nie in der Prozessliste: es geht als Umgebungsvariable
an ein kleines GIT_ASKPASS-Skript, das nur git selbst aufruft.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

_OHNE_FENSTER = {}
if sys.platform == "win32":                      # kein Konsolenblitzen
    _OHNE_FENSTER = {"creationflags": 0x08000000}

ZEITABLAUF = 20          # Sekunden für örtliche git-Aufrufe
ZEITABLAUF_NETZ = 90     # Sekunden für Aufrufe, die ins Netz gehen

# Wie oft eine automatische Sicherung einen Commit auslöst. Gesichert
# wird vier Sekunden nach der letzten Eingabe -- daraus je einen Commit
# zu machen ergäbe neunhundert Commits pro Stunde und einen Verlauf,
# in dem nichts mehr zu finden ist. Beim Sichern von Hand wird immer
# festgeschrieben, dazwischen höchstens alle zehn Minuten.
ABSTAND = 600

_ORDNER = ".git-arbeiten"
_VERBINDUNGEN = ".verbindungen.json"

# "owner/repo", beides so, wie GitHub es zulässt
_VOLLNAME = re.compile(r"^[A-Za-z0-9._-]{1,39}/[A-Za-z0-9._-]{1,100}$")


class GitFehler(Exception):
    """Etwas an der Versionierung ging schief. Die Meldung ist deutsch
    und für die Nutzerin gedacht."""


# ---------------------------------------------------------------- Werkzeug

def finde_git() -> dict:
    pfad = shutil.which("git")
    if not pfad:
        return {"gefunden": False, "pfad": "", "fassung": ""}
    try:
        e = subprocess.run([pfad, "--version"], capture_output=True, text=True,
                           timeout=10, **_OHNE_FENSTER)
        fassung = (e.stdout or "").strip()
    except (OSError, subprocess.SubprocessError):
        fassung = ""
    return {"gefunden": True, "pfad": pfad, "fassung": fassung}


def _git(befehl: list[str], ordner: str, zeichen: str = "",
         grenze: int = ZEITABLAUF) -> tuple[int, str]:
    """Ein git-Aufruf. Mit `zeichen` bekommt git ein Askpass-Skript
    untergeschoben, sonst fragt es auf einer Konsole nach, die niemand
    sieht, und läuft in den Zeitablauf."""
    werkzeug = finde_git()
    if not werkzeug["gefunden"]:
        raise GitFehler("git ist nicht installiert. Unter Linux: "
                        "sudo apt install git — unter Windows: git-scm.com")
    umgebung = dict(os.environ)
    # Niemals nach etwas fragen, worauf niemand antworten kann.
    umgebung["GIT_TERMINAL_PROMPT"] = "0"
    umgebung["GIT_CONFIG_NOSYSTEM"] = "1"
    umgebung["HOME"] = umgebung.get("HOME", ordner)
    hilfsordner = None
    if zeichen:
        hilfsordner, askpass = _askpass_skript(zeichen)
        umgebung["GIT_ASKPASS"] = askpass
        umgebung["SCHREIBTISCH_GH"] = zeichen
    try:
        e = subprocess.run([werkzeug["pfad"]] + befehl, cwd=ordner,
                           capture_output=True, text=True, errors="replace",
                           timeout=grenze, env=umgebung, **_OHNE_FENSTER)
        return e.returncode, ((e.stdout or "") + (e.stderr or "")).strip()
    except subprocess.TimeoutExpired:
        return -1, ("git hat zu lange gebraucht und wurde abgebrochen "
                    f"({grenze} Sekunden).")
    finally:
        if hilfsordner:
            shutil.rmtree(hilfsordner, ignore_errors=True)


def _askpass_skript(zeichen: str) -> tuple[str, str]:
    """Ein Wegwerf-Skript, das das Zeichen ausgibt. Es steht damit
    weder in der Prozessliste (wie bei einer Adresse mit Token) noch
    dauerhaft auf der Platte (wie in .git/config)."""
    ordner = tempfile.mkdtemp(prefix="schreibtisch-git-")
    if sys.platform == "win32":
        pfad = os.path.join(ordner, "askpass.bat")
        with open(pfad, "w", encoding="ascii") as f:
            f.write("@echo off\r\necho %SCHREIBTISCH_GH%\r\n")
    else:
        pfad = os.path.join(ordner, "askpass.sh")
        with open(pfad, "w", encoding="ascii") as f:
            f.write('#!/bin/sh\nprintf "%s\\n" "$SCHREIBTISCH_GH"\n')
        os.chmod(pfad, stat.S_IRWXU)
    return ordner, pfad


# ---------------------------------------------------------------- GitHub

def _api(weg: str, zeichen: str, daten: dict | None = None) -> dict:
    if not zeichen:
        raise GitFehler("Es ist kein GitHub-Zeichen hinterlegt. "
                        "Unter ⚙ Einstellungen eintragen.")
    rumpf = json.dumps(daten).encode("utf-8") if daten is not None else None
    anfrage = urllib.request.Request(
        "https://api.github.com" + weg, data=rumpf,
        headers={"Authorization": "Bearer " + zeichen,
                 "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28",
                 "Content-Type": "application/json",
                 "User-Agent": "Schreibtisch/1.0"})
    try:
        with urllib.request.urlopen(anfrage, timeout=30) as a:
            roh = a.read().decode("utf-8")
        return json.loads(roh) if roh else {}
    except urllib.error.HTTPError as f:
        text = ""
        try:
            text = json.loads(f.read().decode("utf-8")).get("message", "")
        except Exception:                              # noqa: BLE001
            pass
        if f.code == 401:
            raise GitFehler("GitHub nimmt das Zeichen nicht an. Ist es "
                            "abgelaufen? Ein neues gibt es unter "
                            "github.com/settings/tokens.") from f
        if f.code == 403:
            raise GitFehler("GitHub verweigert den Zugriff. Fehlt dem "
                            "Zeichen das Recht „repo“?") from f
        if f.code == 422:
            raise GitFehler("GitHub lehnt ab: " + (text or "Name schon vergeben?")) from f
        raise GitFehler(f"GitHub antwortet mit Fehler {f.code}. {text}") from f
    except (urllib.error.URLError, TimeoutError, OSError) as f:
        raise GitFehler("GitHub ist nicht erreichbar. Besteht eine "
                        f"Internetverbindung? ({f})") from f
    except ValueError as f:
        raise GitFehler("GitHub hat unverständlich geantwortet.") from f


def pruefe_zeichen(zeichen: str) -> dict:
    e = _api("/user", zeichen)
    return {"benutzer": e.get("login", ""), "name": e.get("name") or "",
            "email": e.get("email") or ""}


def lege_repo_an(zeichen: str, name: str, privat: bool = True,
                 beschreibung: str = "") -> dict:
    e = _api("/user/repos", zeichen, {
        "name": name, "private": bool(privat),
        "description": beschreibung[:350],
        "auto_init": False})
    return {"vollname": e.get("full_name", ""), "adresse": e.get("html_url", "")}


# ---------------------------------------------------------------- Ablage

class Versionierung:
    """Verwaltet die Arbeitsbäume und die Zuordnung Arbeit -> Repository."""

    def __init__(self, wurzel: str):
        self.wurzel = wurzel                    # der Arbeiten-Ordner
        self.stamm = os.path.join(wurzel, _ORDNER)

    # ------------------------------------------------------ Verbindungen

    @property
    def _kartei(self) -> str:
        return os.path.join(self.wurzel, _VERBINDUNGEN)

    def verbindungen(self) -> dict:
        try:
            with open(self._kartei, encoding="utf-8") as f:
                e = json.load(f)
            return e if isinstance(e, dict) else {}
        except (OSError, ValueError):
            return {}

    def _schreibe_verbindungen(self, alle: dict):
        vorlaeufig = self._kartei + ".neu"
        os.makedirs(self.wurzel, exist_ok=True)
        with open(vorlaeufig, "w", encoding="utf-8") as f:
            json.dump(alle, f, ensure_ascii=False, indent=1)
        os.replace(vorlaeufig, self._kartei)

    def verbindung(self, name: str) -> dict:
        return self.verbindungen().get(name) or {}

    def _baum(self, name: str) -> str:
        from begleiter.ablage import sauberer_name
        return os.path.join(self.stamm, sauberer_name(name))

    # ------------------------------------------------------ Zustand

    def stand(self, name: str) -> dict:
        werkzeug = finde_git()
        v = self.verbindung(name)
        antwort = {"gitDa": werkzeug["gefunden"], "gitFassung": werkzeug["fassung"],
                   "verbunden": bool(v), "repo": v.get("repo", ""),
                   "zweig": v.get("zweig", "main"),
                   "adresse": v.get("adresse", ""),
                   "letzter": None, "offen": 0}
        baum = self._baum(name)
        if not (v and werkzeug["gefunden"] and os.path.isdir(os.path.join(baum, ".git"))):
            return antwort
        rc, aus = _git(["log", "-1", "--pretty=%h|%at|%s"], baum)
        if rc == 0 and "|" in aus:
            kurz, wann, betreff = aus.split("|", 2)
            antwort["letzter"] = {"kurz": kurz, "zeit": float(wann or 0),
                                  "betreff": betreff}
        rc, aus = _git(["status", "--porcelain"], baum)
        if rc == 0:
            antwort["offen"] = len([z for z in aus.splitlines() if z.strip()])
        return antwort

    def verlauf(self, name: str, anzahl: int = 30) -> list[dict]:
        baum = self._baum(name)
        if not os.path.isdir(os.path.join(baum, ".git")):
            return []
        rc, aus = _git(["log", f"-{int(anzahl)}", "--pretty=%h|%at|%s"], baum)
        if rc != 0:
            return []
        raus = []
        for zeile in aus.splitlines():
            if zeile.count("|") < 2:
                continue
            kurz, wann, betreff = zeile.split("|", 2)
            raus.append({"kurz": kurz, "zeit": float(wann or 0), "betreff": betreff})
        return raus

    # ------------------------------------------------------ Verbinden

    def verbinde(self, name: str, repo: str, zeichen: str,
                 zweig: str = "main", adresse: str = "") -> dict:
        """Arbeitsbaum anlegen (falls nötig) und mit dem Repository
        verknüpfen. Ein vorhandenes Repository wird NICHT geleert --
        beim ersten Sichern kommen die Dateien der Arbeit dazu."""
        if not _VOLLNAME.match(repo or ""):
            raise GitFehler("Der Name muss die Form „benutzer/repository“ haben.")
        baum = self._baum(name)
        os.makedirs(baum, exist_ok=True)
        if not os.path.isdir(os.path.join(baum, ".git")):
            rc, aus = _git(["init", "-q", "-b", zweig], baum)
            if rc != 0:
                # Ältere git-Fassungen kennen -b beim init noch nicht.
                rc, aus = _git(["init", "-q"], baum)
                if rc != 0:
                    raise GitFehler("git init ist fehlgeschlagen: " + aus)
                _git(["checkout", "-q", "-B", zweig], baum)

        # Das Zeichen steht NICHT in der Adresse -- es kommt beim Schieben
        # aus dem Askpass-Skript. In .git/config landet nur der Benutzer.
        url = f"https://x-access-token@github.com/{repo}.git"
        rc, _ = _git(["remote", "get-url", "origin"], baum)
        rc2, aus = _git(["remote", "set-url" if rc == 0 else "add", "origin", url], baum)
        if rc2 != 0:
            raise GitFehler("Die Adresse ließ sich nicht setzen: " + aus)

        alle = self.verbindungen()
        alle[name] = {"repo": repo, "zweig": zweig, "adresse":
                      adresse or f"https://github.com/{repo}"}
        self._schreibe_verbindungen(alle)
        return self.stand(name)

    def trenne(self, name: str, mitBaum: bool = False):
        alle = self.verbindungen()
        alle.pop(name, None)
        self._schreibe_verbindungen(alle)
        if mitBaum:
            shutil.rmtree(self._baum(name), ignore_errors=True)

    # ------------------------------------------------------ Festschreiben

    def sichere(self, name: str, dokument: dict, dateien: dict,
                bilderordner: str, zeichen: str = "", meldung: str = "",
                erzwinge: bool = True, schiebe: bool = True) -> dict:
        """Stand der Arbeit in den Arbeitsbaum schreiben und
        festschreiben. `erzwinge=False` hält den Abstand ein und tut
        sonst nichts."""
        v = self.verbindung(name)
        if not v:
            return {"uebersprungen": "nicht verbunden"}
        baum = self._baum(name)
        if not os.path.isdir(os.path.join(baum, ".git")):
            raise GitFehler("Der Arbeitsbaum fehlt. Bitte die Arbeit neu "
                            "verbinden.")
        if not erzwinge:
            letzter = (self.stand(name).get("letzter") or {}).get("zeit", 0)
            if letzter and time.time() - letzter < ABSTAND:
                return {"uebersprungen": "zu früh"}

        self._schreibe_baum(baum, name, dokument, dateien, bilderordner)

        rc, aus = _git(["add", "-A"], baum)
        if rc != 0:
            raise GitFehler("git add ist fehlgeschlagen: " + aus)
        rc, aus = _git(["status", "--porcelain"], baum)
        if rc == 0 and not aus.strip():
            return {"uebersprungen": "nichts geändert"}

        wer = self._identitaet(dokument)
        rc, aus = _git(["-c", "user.name=" + wer[0], "-c", "user.email=" + wer[1],
                        "commit", "-q", "-m", meldung or self._meldung(dokument)], baum)
        if rc != 0:
            raise GitFehler("Das Festschreiben ist fehlgeschlagen: " + aus)

        ergebnis = {"festgeschrieben": True}
        if schiebe:
            ergebnis.update(self.schiebe(name, zeichen))
        return ergebnis

    def schiebe(self, name: str, zeichen: str) -> dict:
        """Zu GitHub hochladen. Scheitert das, ist der Commit trotzdem
        gemacht -- gemeldet wird es, aber es ist kein Datenverlust."""
        v = self.verbindung(name)
        if not v:
            return {}
        baum = self._baum(name)
        zweig = v.get("zweig", "main")
        rc, aus = _git(["push", "-u", "origin", zweig], baum, zeichen,
                       ZEITABLAUF_NETZ)
        if rc == 0:
            return {"geschoben": True}
        return {"geschoben": False, "fehler": self._pushfehler(aus)}

    @staticmethod
    def _pushfehler(aus: str) -> str:
        text = (aus or "").lower()
        if "could not resolve host" in text or "network" in text:
            return ("Hochladen ging nicht: keine Verbindung zu GitHub. "
                    "Der Stand ist örtlich festgeschrieben und geht beim "
                    "nächsten Mal mit.")
        if "authentication failed" in text or "403" in text:
            return ("GitHub nimmt das Zeichen nicht an. Der Stand ist "
                    "örtlich festgeschrieben.")
        if "non-fast-forward" in text or "rejected" in text:
            return ("GitHub hat neuere Änderungen, die hier fehlen. "
                    "Der Stand ist örtlich festgeschrieben; das Zusammen"
                    "führen muss von Hand geschehen.")
        return "Hochladen ging nicht: " + (aus or "")[-300:]

    # ------------------------------------------------------ Baum füllen

    def _schreibe_baum(self, baum: str, name: str, dokument: dict,
                       dateien: dict, bilderordner: str):
        """Die Arbeit als JSON, das erzeugte LaTeX daneben, die Bilder
        dazu. Das LaTeX ist der Grund, aus dem sich ein Verlauf lohnt:
        ein JSON-Diff sagt niemandem etwas, ein .tex-Diff zeigt den
        geänderten Satz."""
        with open(os.path.join(baum, "arbeit.json"), "w", encoding="utf-8") as f:
            json.dump(dokument, f, ensure_ascii=False, indent=1, sort_keys=True)

        erlaubt = {"arbeit.tex", "literatur.bib", "arbeit-stil.sty",
                   "bauen.sh", "latexmkrc"}
        for datei, inhalt in (dateien or {}).items():
            if datei not in erlaubt:
                continue
            with open(os.path.join(baum, datei), "w", encoding="utf-8") as f:
                f.write(inhalt)

        ziel = os.path.join(baum, "bilder")
        if os.path.isdir(bilderordner):
            os.makedirs(ziel, exist_ok=True)
            vorhanden = set(os.listdir(ziel))
            for d in os.listdir(bilderordner):
                shutil.copy2(os.path.join(bilderordner, d), os.path.join(ziel, d))
                vorhanden.discard(d)
            for weg in vorhanden:          # im Dokument nicht mehr benutzt
                try:
                    os.remove(os.path.join(ziel, weg))
                except OSError:
                    pass
        elif os.path.isdir(ziel):
            shutil.rmtree(ziel, ignore_errors=True)

        with open(os.path.join(baum, "LIESMICH.md"), "w", encoding="utf-8") as f:
            f.write(self._liesmich(name, dokument))

    @staticmethod
    def _identitaet(dokument: dict) -> tuple[str, str]:
        m = dokument.get("meta") or {}
        wer = (m.get("verfasser") or "").strip() or "Schreibtisch"
        return wer, "schreibtisch@localhost"

    @staticmethod
    def _meldung(dokument: dict) -> str:
        """Was in einem Verlauf hilft, ist der Umfang: daran erkennt
        man den Stand wieder."""
        m = dokument.get("meta") or {}
        woerter = 0
        for b in dokument.get("bloecke") or []:
            if not isinstance(b, dict):
                continue
            if b.get("typ") in ("absatz", "blockzitat"):
                for r in b.get("runs") or []:
                    woerter += len(str(r.get("text") or "").split())
            elif b.get("typ") == "ueberschrift":
                woerter += len(str(b.get("text") or "").split())
        return (f"Stand vom {time.strftime('%d.%m.%Y, %H:%M')} — "
                f"rund {woerter} Wörter"
                + (f" ({m.get('titel')})" if m.get("titel") else ""))

    @staticmethod
    def _liesmich(name: str, dokument: dict) -> str:
        m = dokument.get("meta") or {}
        zeilen = [f"# {m.get('titel') or name}", ""]
        if m.get("untertitel"):
            zeilen += [str(m["untertitel"]), ""]
        zeilen += [
            "Geschrieben mit dem **Schreibtisch** — wissenschaftliche Arbeiten "
            "schreiben, LaTeX setzt sie.", "",
            "| | |", "|---|---|",
            f"| Art | {m.get('arbeitstyp') or '—'} |",
            f"| Verfasst von | {m.get('verfasser') or '—'} |",
            f"| Hochschule | {m.get('hochschule') or '—'} |",
            f"| Zuletzt geändert | {time.strftime('%d.%m.%Y, %H:%M')} |", "",
            "## Was hier liegt", "",
            "- `arbeit.json` — die Arbeit selbst. Diese Datei gehört in den "
            "Ordner `Arbeiten/` des Schreibtischs.",
            "- `arbeit.tex`, `literatur.bib`, `arbeit-stil.sty` — das daraus "
            "erzeugte LaTeX. Nur zum Ansehen und Vergleichen; geändert wird "
            "im Schreibtisch.",
            "- `bilder/` — die Abbildungen, benannt nach ihrer Prüfsumme.", "",
            "Das LaTeX liegt mit im Repository, weil sich nur daran ablesen "
            "lässt, was sich geändert hat: ein Diff der JSON sagt niemandem "
            "etwas, ein Diff des Fließtexts zeigt den geänderten Satz.", ""]
        return "\n".join(zeilen)
