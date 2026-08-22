#!/usr/bin/env python3
"""Prüft die Absicherung des Begleiters.

Der Dienst horcht auf 127.0.0.1 und verlangt bei jeder Anfrage ein
Zeichen, das beim Start erzeugt wird. Diese Schicht hatte bisher keine
einzige Prüfung -- und genau dort steckte die größte Lücke: die Seite
unter "/" gab das Zeichen an jeden heraus, der danach fragte.

    python3 pruefungen/pruefe_absicherung.py
"""

from __future__ import annotations

import http.client
import os
import re
import subprocess
import sys
import tempfile
import time

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.dirname(HIER)

BESTANDEN, DURCHGEFALLEN = [], []


def pruefe(name, bedingung, hinweis=""):
    (BESTANDEN if bedingung else DURCHGEFALLEN).append(name)
    print(f"  {'OK' if bedingung else '!!'}  {name}"
          + (f"\n      {hinweis}" if not bedingung and hinweis else ""))


def anfrage(port, weg, art="GET", host=None, kopf=None, rumpf=None):
    """Gibt (status, text) zurück. `host` überschreibt die Host-Zeile --
    so sieht eine Anfrage aus, die über einen fremden Namen auf
    127.0.0.1 gelenkt wurde (DNS-Rebinding)."""
    v = http.client.HTTPConnection("127.0.0.1", port, timeout=20)
    kopfzeilen = dict(kopf or {})
    if host:
        kopfzeilen["Host"] = host
    try:
        v.request(art, weg, body=rumpf, headers=kopfzeilen)
        a = v.getresponse()
        return a.status, a.read().decode("utf-8", "replace")
    finally:
        v.close()


def main():
    print("\nAbsicherungsprüfung\n")

    if not os.path.exists(os.path.join(WURZEL, "oberflaeche.html")):
        sys.exit("oberflaeche.html fehlt — bitte zuerst python3 bauen.py")

    arbeiten = tempfile.mkdtemp(prefix="schreibtisch-absicherung-")
    dienst = subprocess.Popen(
        [sys.executable, "-u", os.path.join(WURZEL, "schreibtisch.py")],
        cwd=WURZEL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, errors="replace",
        env={**os.environ, "BROWSER": "true",
             "SCHREIBTISCH_ARBEITEN": arbeiten})

    port, zeichen = 0, ""
    beginn = time.time()
    while time.time() - beginn < 40:
        zeile = dienst.stdout.readline()
        if not zeile:
            break
        t = re.search(r"http://127\.0\.0\.1:(\d+)/\?t=([\w-]+)", zeile)
        if t:
            port, zeichen = int(t.group(1)), t.group(2)
            break
    if not port:
        dienst.kill()
        sys.exit("Dienst meldete keine Adresse")

    try:
        # ---------------------------------------------- Die Seite selbst
        # Sie trägt das Zeichen im Text: wer sie bekommt, bekommt alles.
        status, text = anfrage(port, "/")
        pruefe("die Seite ohne Zeichen wird abgewiesen", status == 403, str(status))
        pruefe("und gibt das Zeichen dabei nicht heraus",
               zeichen not in text, text[:200])
        pruefe("die Abweisung erklärt, wie es richtig geht",
               "start.sh" in text, text[:200])

        status, text = anfrage(port, "/?t=" + zeichen[:-1] + "x")
        pruefe("ein falsches Zeichen wird abgewiesen", status == 403, str(status))

        status, text = anfrage(port, "/?t=" + zeichen)
        pruefe("mit gültigem Zeichen kommt die Oberfläche",
               status == 200 and "<html" in text.lower(), str(status))
        pruefe("erst dann steht das Zeichen in der Seite",
               zeichen in text, "Zeichen fehlt in der Seite")

        # ---------------------------------------------- Fremder Rechnername
        status, _ = anfrage(port, "/projekte?t=" + zeichen,
                            host="angreifer.example")
        pruefe("ein fremder Hostname wird abgewiesen", status == 403, str(status))
        status, _ = anfrage(port, "/?t=" + zeichen, host="angreifer.example")
        pruefe("auch für die Seite selbst", status == 403, str(status))

        # ---------------------------------------------- Datenwege
        status, _ = anfrage(port, "/projekte")
        pruefe("Projektliste ohne Zeichen wird abgewiesen", status == 403, str(status))
        status, _ = anfrage(port, "/projekte?t=" + zeichen)
        pruefe("Projektliste mit Zeichen geht durch", status == 200, str(status))

        # ---------------------------------------------- POST-Riegel
        status, _ = anfrage(port, "/projekt?t=" + zeichen, "POST",
                            kopf={"Content-Type": "text/plain"},
                            rumpf='{"name":"X","dokument":{}}')
        pruefe("POST ohne JSON-Kopfzeile wird abgewiesen", status == 415, str(status))

        status, _ = anfrage(port, "/projekt?t=" + zeichen, "POST",
                            kopf={"Content-Type": "application/json",
                                  "Sec-Fetch-Site": "cross-site"},
                            rumpf='{"name":"X","dokument":{}}')
        pruefe("POST von einer fremden Seite wird abgewiesen", status == 403, str(status))

        status, _ = anfrage(port, "/projekt?t=" + zeichen, "POST",
                            kopf={"Content-Type": "application/json",
                                  "Sec-Fetch-Site": "same-origin"},
                            rumpf='{"name":"Echt","dokument":{"meta":{"titel":"T"}},'
                                  '"neu":true}')
        pruefe("POST von der eigenen Seite geht durch", status == 200, str(status))

        # ---------------------------------------------- Beenden nur per POST
        status, _ = anfrage(port, "/beenden?t=" + zeichen)
        pruefe("Beenden ist per GET nicht mehr erreichbar",
               status == 404, str(status))

        # ---------------------------------------------- Pfadausbruch
        ziel = os.path.join(tempfile.gettempdir(), "schreibtisch-ausbruch.tex")
        if os.path.exists(ziel):
            os.remove(ziel)
        anfrage(port, "/uebersetzen?t=" + zeichen, "POST",
                kopf={"Content-Type": "application/json"},
                rumpf='{"dateien": {"%s": "kaputt", "arbeit.tex": "x"}, "bilder": []}'
                      % ziel.replace("\\", "\\\\"))
        pruefe("ein Dateiname mit vollem Pfad schreibt nichts dorthin",
               not os.path.exists(ziel), ziel)

        # ---------------------------------------------- Aufräumen beim Ende
        arbeitsordner = ""
        anfrage(port, "/beenden?t=" + zeichen, "POST",
                kopf={"Content-Type": "application/json"}, rumpf="{}")
        for _ in range(40):
            if dienst.poll() is not None:
                break
            time.sleep(0.1)
        pruefe("Beenden per POST hält den Dienst an",
               dienst.poll() is not None, str(dienst.poll()))
    finally:
        if dienst.poll() is None:
            dienst.kill()
        dienst.wait(timeout=10)

    print(f"\n  {len(BESTANDEN)} bestanden, {len(DURCHGEFALLEN)} durchgefallen")
    if DURCHGEFALLEN:
        print("  Durchgefallen: " + ", ".join(DURCHGEFALLEN))
        sys.exit(1)


if __name__ == "__main__":
    main()
