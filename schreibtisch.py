#!/usr/bin/env python3
"""
Schreibtisch — wissenschaftliche Arbeiten schreiben, LaTeX setzt sie.

    python3 schreibtisch.py

Startet einen kleinen Dienst auf 127.0.0.1 und öffnet den Browser.
Braucht nur die Standardbibliothek — kein pip, kein venv, kein Internet
(außer für Zotero, wenn du es benutzt).
"""

from __future__ import annotations

import base64
import http.server
import json
import os
import secrets
import socket
import socketserver
import sys
import tempfile
import threading
import time
import urllib.parse
import webbrowser

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HIER)

from begleiter import ablage as ablage_modul          # noqa: E402
from begleiter import uebersetzen as uebersetzen_modul  # noqa: E402
from begleiter import zotero as zotero_modul          # noqa: E402

OBERFLAECHE = os.path.join(HIER, "oberflaeche.html")
ARBEITEN = os.path.join(HIER, "Arbeiten")

# Gegen fremde Seiten im selben Browser: jede Anfrage muss das Zeichen
# mitbringen, das beim Start erzeugt und nur an unsere Seite übergeben wird.
ZEICHEN = secrets.token_urlsafe(24)

ABLAGE = ablage_modul.Ablage(ARBEITEN)
ARBEITSORDNER = os.path.join(tempfile.gettempdir(),
                             f"schreibtisch-{os.getpid()}")
UEBERSETZER = uebersetzen_modul.Uebersetzer(ARBEITSORDNER)


def _json_antwort(handler, daten, code=200):
    roh = json.dumps(daten, ensure_ascii=False).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(roh)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(roh)


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "Schreibtisch"

    def log_message(self, *a):
        pass                                    # kein Zugriffsprotokoll

    # ------------------------------------------------------------ Absicherung

    def _erlaubt(self, teile) -> bool:
        """Nur von diesem Rechner, nur mit gültigem Zeichen."""
        host = (self.headers.get("Host") or "").split(":")[0]
        if host not in ("127.0.0.1", "localhost", "[::1]"):
            return False
        return teile.get("t", [""])[0] == ZEICHEN

    # ------------------------------------------------------------------- GET

    def do_GET(self):
        zerlegt = urllib.parse.urlparse(self.path)
        weg, teile = zerlegt.path, urllib.parse.parse_qs(zerlegt.query)

        if weg in ("/", "/index.html"):
            return self._sende_oberflaeche()

        if weg == "/favicon.ico":
            # Der Browser fragt ungefragt danach. Ohne diese Zeile
            # antwortet der Dienst mit 403 und die Konsole ist voller
            # Fehler, die keine sind.
            self.send_response(204)
            self.end_headers()
            return

        if not self._erlaubt(teile):
            return _json_antwort(self, {"fehler": "nicht erlaubt"}, 403)

        try:
            if weg == "/pruefung":
                return _json_antwort(self, uebersetzen_modul.pruefe_werkzeuge())

            if weg == "/pdf":
                return self._sende_pdf()

            if weg == "/projekte":
                return _json_antwort(self, {"projekte": ABLAGE.liste()})

            if weg == "/projekt":
                name = teile.get("name", [""])[0]
                return _json_antwort(self, {"dokument": ABLAGE.lade(name)})

            if weg == "/einstellungen":
                e = dict(ABLAGE.einstellungen())
                if e.get("zoteroSchluessel"):     # Schlüssel nie zurückgeben
                    e["zoteroSchluessel"] = "•" * 12
                    e["zoteroGesetzt"] = True
                return _json_antwort(self, e)

            if weg == "/zotero/pruefen":
                e = ABLAGE.einstellungen()
                s = teile.get("schluessel", [""])[0] or e.get("zoteroSchluessel", "")
                return _json_antwort(self, zotero_modul.pruefe_schluessel(s))

            if weg == "/zotero/sammlungen":
                e = ABLAGE.einstellungen()
                return _json_antwort(self, {"sammlungen": zotero_modul.sammlungen(
                    e.get("zoteroSchluessel", ""), e.get("zoteroBenutzer", ""),
                    teile.get("art", ["users"])[0])})

            if weg == "/zotero/bibliothek":
                e = ABLAGE.einstellungen()
                return _json_antwort(self, {"quellen": zotero_modul.bibliothek(
                    e.get("zoteroSchluessel", ""), e.get("zoteroBenutzer", ""),
                    teile.get("art", ["users"])[0],
                    teile.get("sammlung", [""])[0])})

            if weg == "/beenden":
                threading.Timer(0.4, lambda: os._exit(0)).start()
                return _json_antwort(self, {"gut": True})

        except zotero_modul.ZoteroFehler as f:
            return _json_antwort(self, {"fehler": str(f)}, 400)
        except FileNotFoundError:
            return _json_antwort(self, {"fehler": "nicht gefunden"}, 404)
        except Exception as f:                    # noqa: BLE001
            return _json_antwort(self, {"fehler": f"{type(f).__name__}: {f}"}, 500)

        return _json_antwort(self, {"fehler": "unbekannter Weg"}, 404)

    # ------------------------------------------------------------------ POST

    def do_POST(self):
        zerlegt = urllib.parse.urlparse(self.path)
        weg, teile = zerlegt.path, urllib.parse.parse_qs(zerlegt.query)
        if not self._erlaubt(teile):
            return _json_antwort(self, {"fehler": "nicht erlaubt"}, 403)

        laenge = int(self.headers.get("Content-Length") or 0)
        if laenge > 300 * 1024 * 1024:
            return _json_antwort(self, {"fehler": "Anfrage zu groß"}, 413)
        rumpf = self.rfile.read(laenge) if laenge else b"{}"
        try:
            daten = json.loads(rumpf.decode("utf-8"))
        except ValueError:
            return _json_antwort(self, {"fehler": "kein gültiges JSON"}, 400)

        try:
            if weg == "/uebersetzen":
                return self._uebersetze(daten)

            if weg == "/projekt":
                return _json_antwort(self, ABLAGE.sichere(
                    daten.get("name") or "Arbeit", daten.get("dokument") or {}))

            if weg == "/projekt/loeschen":
                ABLAGE.loesche(daten.get("name", ""))
                return _json_antwort(self, {"gut": True})

            if weg == "/einstellungen":
                if daten.get("zoteroSchluessel", "").startswith("•"):
                    daten.pop("zoteroSchluessel")   # unveränderte Maske ignorieren
                return _json_antwort(self, {"gut": True,
                                            "anzahl": len(ABLAGE.setze_einstellungen(daten))})

        except zotero_modul.ZoteroFehler as f:
            return _json_antwort(self, {"fehler": str(f)}, 400)
        except Exception as f:                    # noqa: BLE001
            return _json_antwort(self, {"fehler": f"{type(f).__name__}: {f}"}, 500)

        return _json_antwort(self, {"fehler": "unbekannter Weg"}, 404)

    # ------------------------------------------------------------- Bausteine

    def _sende_oberflaeche(self):
        try:
            with open(OBERFLAECHE, encoding="utf-8") as f:
                seite = f.read()
        except OSError:
            return _json_antwort(self, {"fehler": "oberflaeche.html fehlt — "
                                        "bitte zuerst python3 bauen.py"}, 500)
        # Zeichen in die Seite geben, damit sie den Dienst ansprechen darf
        seite = seite.replace("__ZEICHEN__", ZEICHEN)
        roh = seite.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(roh)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(roh)

    def _sende_pdf(self):
        pfad = UEBERSETZER.pdf_pfad()
        if not os.path.exists(pfad):
            return _json_antwort(self, {"fehler": "noch kein PDF"}, 404)
        with open(pfad, "rb") as f:
            roh = f.read()
        self.send_response(200)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Length", str(len(roh)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(roh)

    def _uebersetze(self, daten):
        bilder = []
        for b in daten.get("bilder") or []:
            try:
                bilder.append({"datei": os.path.basename(b["datei"]),
                               "bytes": base64.b64decode(b["daten"])})
            except Exception:
                pass
        UEBERSETZER.brich_ab()                  # eine neuere Fassung geht vor
        ergebnis = UEBERSETZER.uebersetze(daten.get("dateien") or {}, bilder)
        return _json_antwort(self, ergebnis)


class Dienst(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def freier_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _kann_sonderzeichen() -> bool:
    """Ältere Windows-Konsolen laufen auf cp850 und werfen bei ✓ einen
    UnicodeEncodeError — der Start bräche ab, bevor irgendetwas passiert."""
    try:
        "✓".encode(sys.stdout.encoding or "ascii")
        return True
    except (UnicodeEncodeError, LookupError, TypeError):
        return False


def diagnose():
    """python schreibtisch.py --diagnose

    Sammelt alles, was man zur Fehlersuche braucht — vor allem, wenn der
    Rechner nicht der eigene ist."""
    import platform
    print()
    print("  Schreibtisch — Diagnose")
    print("  " + "-" * 52)
    print(f"  System        {platform.platform()}")
    print(f"  Python        {sys.version.split()[0]}  ({sys.executable})")
    print(f"  Konsole       {sys.stdout.encoding}  "
          f"Dateisystem: {sys.getfilesystemencoding()}")
    print(f"  Ordner        {HIER}")
    print(f"  Oberfläche    {'da' if os.path.exists(OBERFLAECHE) else 'FEHLT'}")
    print(f"  Arbeitsordner {ARBEITSORDNER}")
    print()
    for name in ("pdflatex", "biber"):
        pfad = uebersetzen_modul.finde(name)
        print(f"  {name:<13} {pfad or 'NICHT GEFUNDEN'}")
        if pfad:
            print(f"  {'':<13} {uebersetzen_modul._fassung(pfad)}")
    print()
    try:
        import bauen                                    # noqa: F401
        print("  bauen.py      importierbar")
    except Exception as f:
        print(f"  bauen.py      NICHT importierbar: {f}")
    try:
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            print(f"  Netzwerk      127.0.0.1 belegbar (Port {s.getsockname()[1]})")
    except Exception as f:
        print(f"  Netzwerk      FEHLER: {f}")
    print()


def _konsole_vorbereiten():
    """Nicht die Kodierung erzwingen — das erzeugt auf einer cp850-Konsole
    nur Buchstabensalat. Stattdessen: unter Windows die Konsole nach
    Möglichkeit auf UTF-8 stellen, und in jedem Fall dafür sorgen, dass ein
    nicht darstellbares Zeichen den Start nicht abbricht."""
    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.kernel32.SetConsoleOutputCP(65001)
        except Exception:
            pass
    try:
        sys.stdout.reconfigure(errors="replace")
    except Exception:
        pass


def main():
    _konsole_vorbereiten()

    if "--diagnose" in sys.argv:
        diagnose()
        return

    ja, nein = ("✓", "✗") if _kann_sonderzeichen() else ("[ok]", "[--]")

    if not os.path.exists(OBERFLAECHE):
        print("  oberflaeche.html fehlt — wird gebaut ...")
        # Bewusst kein os.system: unter Windows geht das durch cmd, und
        # cmd zerlegt eine Befehlszeile, die mit einem Anführungszeichen
        # beginnt. Direkt aufrufen umgeht Zitierregeln, PATH und die
        # Frage, ob das Programm py oder python heißt.
        try:
            import bauen
            bauen.main()
        except SystemExit:
            raise
        except Exception as f:
            sys.exit(f"\n  Die Oberfläche konnte nicht gebaut werden: {f}\n"
                     f"  Bitte einmal von Hand: {sys.executable} bauen.py\n")

    werkzeuge = uebersetzen_modul.pruefe_werkzeuge()
    port = freier_port()
    adresse = f"http://127.0.0.1:{port}/?t={ZEICHEN}"

    print()
    print("  Schreibtisch")
    print("  " + "-" * 52)
    for name, angabe in werkzeuge["programme"].items():
        zeichen = ja if angabe["gefunden"] else nein
        print(f"  {zeichen} {name:<9} {angabe['fassung'] or 'NICHT GEFUNDEN'}")
    if not werkzeuge["vollstaendig"]:
        print()
        print("  Ohne pdflatex und biber kann kein PDF entstehen.")
        print("  Linux:   sudo apt install texlive-full biber")
        print("  Windows: MiKTeX von miktex.org installieren")
        print("  Der Editor startet trotzdem - schreiben geht, drucken nicht.")
    elif sys.platform == "win32":
        print()
        print("  MiKTeX-Hinweis: beim ersten Bau werden Pakete nachgeladen.")
        print("  Erscheint ein Installationsfenster, bitte zustimmen. Dauerhaft")
        print("  ruhig wird es unter MiKTeX Console > Einstellungen >")
        print("  \"Pakete bei Bedarf installieren: Ja, ohne zu fragen\".")
    print()
    print(f"  Läuft auf {adresse}")
    print("  Zum Beenden: Strg+C")
    print()

    dienst = Dienst(("127.0.0.1", port), Handler)
    threading.Timer(0.6, lambda: webbrowser.open(adresse)).start()
    try:
        dienst.serve_forever()
    except KeyboardInterrupt:
        print("\n  Beendet.")
    finally:
        dienst.server_close()


if __name__ == "__main__":
    main()
