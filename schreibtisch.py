#!/usr/bin/env python3
"""
Schreibtisch — wissenschaftliche Arbeiten schreiben, LaTeX setzt sie.

    python3 schreibtisch.py

Startet einen kleinen Dienst auf 127.0.0.1 und öffnet den Browser.
Braucht nur die Standardbibliothek — kein pip, kein venv, kein Internet
(außer für Zotero, wenn du es benutzt).
"""

from __future__ import annotations

import atexit
import base64
import http.server
import json
import os
import secrets
import shutil
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
from begleiter import nachschlagen as nachschlagen_modul  # noqa: E402
from begleiter import uebersetzen as uebersetzen_modul  # noqa: E402
from begleiter import versionierung as versionierung_modul  # noqa: E402
from begleiter import zotero as zotero_modul          # noqa: E402

OBERFLAECHE = os.path.join(HIER, "oberflaeche.html")
# Die Beispielarbeit ist eine Vorlage, keine Arbeit: sie liegt neben dem
# Programm, nicht in Arbeiten/. Sonst wäre sie beim ersten Start die
# "zuletzt bearbeitete" Arbeit -- und vier Sekunden später überschrieben.
BEISPIEL = os.path.join(HIER, "beispiel", "Beispielarbeit.json")
# Wo die Arbeiten liegen. Wer sie lieber in der Cloud-Ablage hätte,
# setzt SCHREIBTISCH_ARBEITEN -- die Prüfungen tun genau das, damit sie
# nicht in den echten Arbeiten herumschreiben.
ARBEITEN = os.environ.get("SCHREIBTISCH_ARBEITEN") or os.path.join(HIER, "Arbeiten")

# Gegen fremde Seiten im selben Browser: jede Anfrage muss das Zeichen
# mitbringen, das beim Start erzeugt und nur an unsere Seite übergeben wird.
ZEICHEN = secrets.token_urlsafe(24)

ABLAGE = ablage_modul.Ablage(ARBEITEN)
VERSION = versionierung_modul.Versionierung(ARBEITEN)
# mkdtemp legt mit 0700 an: im Arbeitsordner liegen der ganze Text der
# Arbeit, das Literaturverzeichnis und die Bilder. Unter /tmp mit den
# üblichen 0755 könnte jeder andere Benutzer des Rechners mitlesen.
# Und er verschwindet zum Schluss wieder, statt sich je Start zu häufen.
ARBEITSORDNER = tempfile.mkdtemp(prefix="schreibtisch-")
atexit.register(shutil.rmtree, ARBEITSORDNER, True)
UEBERSETZER = uebersetzen_modul.Uebersetzer(ARBEITSORDNER)


# Der Browser darf jederzeit auflegen: Tab zu, Seite neu geladen, Warten
# abgebrochen. Das ist kein Fehler, sondern Alltag -- es darf nur nicht in
# einer Traceback-Wand enden, die aussieht, als sei alles kaputt.
VERBINDUNG_WEG = (ConnectionAbortedError, ConnectionResetError,
                  BrokenPipeError, TimeoutError)


def _json_antwort(handler, daten, code=200):
    roh = json.dumps(daten, ensure_ascii=False).encode("utf-8")
    try:
        handler.send_response(code)
        handler.send_header("Content-Type", "application/json; charset=utf-8")
        handler.send_header("Content-Length", str(len(roh)))
        handler.send_header("Cache-Control", "no-store")
        handler.end_headers()
        handler.wfile.write(roh)
    except VERBINDUNG_WEG:
        pass                       # Gegenstelle ist weg -- nichts zu tun


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "Schreibtisch"

    def log_message(self, *a):
        pass                                    # kein Zugriffsprotokoll

    # ------------------------------------------------------------ Absicherung

    def _erlaubt(self, teile) -> bool:
        """Nur von diesem Rechner, nur mit gültigem Zeichen."""
        if not self._eigener_host():
            return False
        return secrets.compare_digest(teile.get("t", [""])[0], ZEICHEN)

    def _eigener_host(self) -> bool:
        host = (self.headers.get("Host") or "").split(":")[0]
        return host in ("127.0.0.1", "localhost", "[::1]")

    def _fremde_seite(self) -> bool:
        """Eine Anfrage, die eine andere Seite im Browser ausgelöst hat.

        Der Browser sagt es selbst. Fehlt die Angabe (alte Browser,
        curl), wird nicht abgewiesen -- das Zeichen bleibt die
        eigentliche Sperre, das hier ist der Riegel davor."""
        woher = self.headers.get("Sec-Fetch-Site")
        return woher is not None and woher not in ("same-origin", "none")

    # ------------------------------------------------------------------- GET

    def do_GET(self):
        zerlegt = urllib.parse.urlparse(self.path)
        weg, teile = zerlegt.path, urllib.parse.parse_qs(zerlegt.query)

        if weg in ("/", "/index.html"):
            # Die Seite trägt das Zeichen im Text -- wer sie bekommt,
            # bekommt vollen Zugriff auf alle Arbeiten. Sie ist deshalb
            # genauso geschützt wie jede andere Antwort. Die Adresse,
            # die start.sh öffnet, bringt das Zeichen mit.
            if not self._erlaubt(teile):
                return self._sende_hinweis_statt_seite()
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
                e = dict(uebersetzen_modul.pruefe_werkzeuge())
                # git ist keine Voraussetzung -- ohne git fehlt nur die
                # Versionierung, nicht das Schreiben. Deshalb steht es
                # neben den Programmen, nicht in "vollstaendig".
                e["git"] = versionierung_modul.finde_git()
                return _json_antwort(self, e)

            if weg == "/pdf":
                return self._sende_pdf()

            if weg == "/projekte":
                return _json_antwort(self, {"projekte": ABLAGE.liste()})

            if weg == "/beispiel":
                with open(BEISPIEL, encoding="utf-8") as f:
                    return _json_antwort(self, {"dokument": json.load(f)})

            if weg == "/projekt":
                name = teile.get("name", [""])[0]
                return _json_antwort(self, {"dokument": ABLAGE.lade(name),
                                            "stand": ABLAGE.stand(name)})

            if weg == "/sicherungen":
                name = teile.get("name", [""])[0]
                return _json_antwort(self, {"sicherungen": ABLAGE.sicherungen(name)})

            if weg == "/sicherung":
                name = teile.get("name", [""])[0]
                datei = teile.get("datei", [""])[0]
                return _json_antwort(self, {"dokument":
                                            ABLAGE.lade_sicherung(name, datei)})

            if weg == "/einstellungen":
                e = dict(ABLAGE.einstellungen())
                if e.get("zoteroSchluessel"):     # Schlüssel nie zurückgeben
                    e["zoteroSchluessel"] = "•" * 12
                    e["zoteroGesetzt"] = True
                if e.get("githubZeichen"):
                    e["githubZeichen"] = "•" * 12
                    e["githubGesetzt"] = True
                return _json_antwort(self, e)

            if weg == "/nachschlagen":
                return _json_antwort(self, nachschlagen_modul.per_doi(
                    teile.get("doi", [""])[0]))

            if weg == "/git/stand":
                return _json_antwort(self, VERSION.stand(teile.get("name", [""])[0]))

            if weg == "/git/verlauf":
                return _json_antwort(self, {"verlauf": VERSION.verlauf(
                    teile.get("name", [""])[0])})

            if weg == "/github/pruefen":
                e = ABLAGE.einstellungen()
                z = teile.get("zeichen", [""])[0] or e.get("githubZeichen", "")
                return _json_antwort(self, versionierung_modul.pruefe_zeichen(z))

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

        except VERBINDUNG_WEG:
            return                                # Browser ist weg
        except zotero_modul.ZoteroFehler as f:
            return _json_antwort(self, {"fehler": str(f)}, 400)
        except versionierung_modul.GitFehler as f:
            return _json_antwort(self, {"fehler": str(f)}, 400)
        except nachschlagen_modul.NachschlagFehler as f:
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
        if not self._erlaubt(teile) or self._fremde_seite():
            return _json_antwort(self, {"fehler": "nicht erlaubt"}, 403)

        # Ein <form> einer fremden Seite kann zwar POSTen, aber keinen
        # eigenen Content-Type setzen -- text/plain reichte sonst aus,
        # um gültiges JSON zu schmuggeln.
        if not (self.headers.get("Content-Type") or "").startswith("application/json"):
            return _json_antwort(self, {"fehler": "nur application/json"}, 415)

        try:
            laenge = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return _json_antwort(self, {"fehler": "kaputte Längenangabe"}, 400)
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
                try:
                    return _json_antwort(self, ABLAGE.sichere(
                        daten.get("name") or "Arbeit",
                        daten.get("dokument") or {},
                        daten.get("stand"),
                        bool(daten.get("neu"))))
                except ablage_modul.VeralteterStand as f:
                    return _json_antwort(self, {"fehler": str(f)}, 409)

            if weg == "/beenden":
                # Kein GET: eine Adresse, die den Dienst mitten im
                # Sichern abschießt, hat im Browserverlauf nichts zu
                # suchen.
                threading.Timer(0.4, lambda: os._exit(0)).start()
                return _json_antwort(self, {"gut": True})

            if weg == "/projekt/loeschen":
                ABLAGE.loesche(daten.get("name", ""))
                return _json_antwort(self, {"gut": True})

            if weg == "/git/verbinden":
                e = ABLAGE.einstellungen()
                zeichen = e.get("githubZeichen", "")
                repo = (daten.get("repo") or "").strip()
                if daten.get("anlegen"):
                    # Erst bei GitHub anlegen, dann örtlich verknüpfen --
                    # andersherum bliebe eine Verbindung ins Leere stehen.
                    wer = versionierung_modul.pruefe_zeichen(zeichen)
                    angelegt = versionierung_modul.lege_repo_an(
                        zeichen, repo, bool(daten.get("privat", True)),
                        daten.get("beschreibung") or "")
                    repo = angelegt["vollname"] or f"{wer['benutzer']}/{repo}"
                return _json_antwort(self, VERSION.verbinde(
                    daten.get("name") or "", repo, zeichen,
                    daten.get("zweig") or "main"))

            if weg == "/git/trennen":
                VERSION.trenne(daten.get("name") or "",
                               bool(daten.get("mitBaum")))
                return _json_antwort(self, {"gut": True})

            if weg == "/git/sichern":
                e = ABLAGE.einstellungen()
                name = daten.get("name") or ""
                return _json_antwort(self, VERSION.sichere(
                    name, daten.get("dokument") or {},
                    daten.get("dateien") or {},
                    ABLAGE.bildordner(name),
                    e.get("githubZeichen", ""),
                    daten.get("meldung") or "",
                    bool(daten.get("erzwinge", True)),
                    bool(daten.get("schiebe", True))))

            if weg == "/einstellungen":
                if daten.get("zoteroSchluessel", "").startswith("•"):
                    daten.pop("zoteroSchluessel")   # unveränderte Maske ignorieren
                if daten.get("githubZeichen", "").startswith("•"):
                    daten.pop("githubZeichen")
                return _json_antwort(self, {"gut": True,
                                            "anzahl": len(ABLAGE.setze_einstellungen(daten))})

        except VERBINDUNG_WEG:
            return                                # Browser ist weg
        except zotero_modul.ZoteroFehler as f:
            return _json_antwort(self, {"fehler": str(f)}, 400)
        except versionierung_modul.GitFehler as f:
            return _json_antwort(self, {"fehler": str(f)}, 400)
        except Exception as f:                    # noqa: BLE001
            return _json_antwort(self, {"fehler": f"{type(f).__name__}: {f}"}, 500)

        return _json_antwort(self, {"fehler": "unbekannter Weg"}, 404)

    # ------------------------------------------------------------- Bausteine

    def _sende_hinweis_statt_seite(self):
        """Wer die Adresse ohne Zeichen aufruft, ist kein Angreifer,
        sondern hat ein Lesezeichen gesetzt. Also eine Erklärung statt
        eines nackten 403."""
        seite = ("<!doctype html><meta charset=utf-8>"
                 "<title>Schreibtisch</title>"
                 "<style>body{font-family:system-ui,sans-serif;max-width:34em;"
                 "margin:14vh auto;padding:0 1.5em;line-height:1.6;color:#242830}"
                 "code{background:#eee;padding:.1em .35em;border-radius:3px}</style>"
                 "<h1>Fast.</h1><p>Diese Adresse allein genügt nicht — der "
                 "Schreibtisch verlangt bei jeder Anfrage ein Zeichen, das beim "
                 "Start erzeugt wird. Damit kann keine fremde Seite im selben "
                 "Browser an deine Arbeiten.</p>"
                 "<p>Öffne den Schreibtisch über <code>start.sh</code> "
                 "(Linux) oder <code>start.bat</code> (Windows). Das Fenster, "
                 "das dabei aufgeht, bringt das Zeichen mit; ein Lesezeichen "
                 "auf diese Adresse tut es nicht.</p>").encode("utf-8")
        self.send_response(403)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(seite)))
        self.send_header("X-Frame-Options", "DENY")
        self.end_headers()
        try:
            self.wfile.write(seite)
        except VERBINDUNG_WEG:
            pass

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
        # Niemand rahmt diese Seite ein: ein unsichtbarer Rahmen über
        # einem fremden Knopf ließe sich sonst auf "Löschen" legen.
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "frame-ancestors 'none'")
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
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Length", str(len(roh)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(roh)
        except VERBINDUNG_WEG:
            pass

    # Genau die Dateien, die quelle/30-latex.js erzeugt. Der Name wurde
    # bisher ungeprüft in os.path.join gegeben -- ein "../" oder ein
    # absoluter Pfad schrieb damit irgendwohin ins Dateisystem.
    ERLAUBTE_DATEIEN = frozenset({
        "arbeit.tex", "literatur.bib", "arbeit-stil.sty",
        "bauen.sh", "latexmkrc", "LIESMICH.md"})

    def _uebersetze(self, daten):
        dateien = {name: inhalt
                   for name, inhalt in (daten.get("dateien") or {}).items()
                   if name in self.ERLAUBTE_DATEIEN}
        bilder = []
        for b in daten.get("bilder") or []:
            try:
                bilder.append({"datei": os.path.basename(b["datei"]),
                               "bytes": base64.b64decode(b["daten"])})
            except Exception:
                pass
        UEBERSETZER.brich_ab()                  # eine neuere Fassung geht vor
        ergebnis = UEBERSETZER.uebersetze(dateien, bilder)
        return _json_antwort(self, ergebnis)


class Dienst(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def handle_error(self, request, client_address):
        """Standardmäßig druckt socketserver einen vollständigen Traceback.
        Für jemanden, der nur schreiben will, sieht das aus, als sei das
        Programm zerstört -- dabei ist meistens nur ein Tab zugegangen."""
        art = sys.exc_info()[0]
        if art is not None and issubclass(art, VERBINDUNG_WEG):
            return
        fehler = sys.exc_info()[1]
        print(f"  [Hinweis] {art.__name__ if art else 'Fehler'}: {fehler}")
        print("  Der Schreibtisch läuft weiter. Bitte melden, wenn es "
              "wiederholt auftritt.")


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
