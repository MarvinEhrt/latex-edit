#!/usr/bin/env python3
"""Prüft, dass ein abbrechender Browser den Dienst weder zum Absturz
bringt noch eine Traceback-Wand erzeugt.

Hintergrund: unter Windows 11 gemeldet als WinError 10053 — der Browser
legt auf, während der Dienst noch antwortet. Das ist Alltag (Tab zu,
Seite neu geladen, Warten abgebrochen) und darf nicht wie ein Defekt
aussehen.

    python3 pruefungen/pruefe_abbruch.py
"""

from __future__ import annotations

import json
import os
import re
import socket
import subprocess
import sys
import time

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.dirname(HIER)

BESTANDEN, DURCHGEFALLEN = [], []


def pruefe(name, bedingung, hinweis=""):
    (BESTANDEN if bedingung else DURCHGEFALLEN).append(name)
    print(f"  {'OK' if bedingung else '!!'}  {name}"
          + (f"\n      {hinweis}" if not bedingung and hinweis else ""))


def main():
    print("\nAbbruchprüfung\n")

    dienst = subprocess.Popen(
        [sys.executable, "-u", os.path.join(WURZEL, "schreibtisch.py")],
        cwd=WURZEL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, errors="replace",
        env={**os.environ, "BROWSER": "true"})

    adresse, port, zeichen = "", 0, ""
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
        sys.exit("Dienst meldete keine Adresse")
    print(f"  Dienst auf Port {port}\n")

    rumpf = json.dumps({"dateien": {
        "arbeit.tex": "\\documentclass{article}\\begin{document}"
                      "Abbruchprobe\\end{document}"}}).encode()

    # --- Anfrage stellen und mittendrin auflegen ---
    for versuch in range(3):
        s = socket.create_connection(("127.0.0.1", port), timeout=10)
        s.sendall(
            f"POST /uebersetzen?t={zeichen} HTTP/1.1\r\n"
            f"Host: 127.0.0.1:{port}\r\n"
            f"Content-Type: application/json\r\n"
            f"Content-Length: {len(rumpf)}\r\n\r\n".encode() + rumpf)
        time.sleep(0.35)
        # Hart schließen -> beim Gegenüber ein Verbindungsabbruch
        s.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER,
                     b"\x01\x00\x00\x00\x00\x00\x00\x00")
        s.close()
    time.sleep(3.0)

    # --- Lebt der Dienst noch? ---
    lebt = dienst.poll() is None
    pruefe("Dienst läuft nach drei Abbrüchen weiter", lebt,
           f"Rückgabe: {dienst.poll()}")

    antwort = b""
    if lebt:
        try:
            s = socket.create_connection(("127.0.0.1", port), timeout=15)
            s.sendall(f"GET /pruefung?t={zeichen} HTTP/1.1\r\n"
                      f"Host: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n".encode())
            while True:
                teil = s.recv(65536)
                if not teil:
                    break
                antwort += teil
            s.close()
        except OSError as f:
            antwort = str(f).encode()
    pruefe("beantwortet danach wieder Anfragen",
           b"200" in antwort and b"pdflatex" in antwort,
           antwort[:200].decode(errors="replace"))

    # --- Was stand auf der Konsole? ---
    dienst.terminate()
    try:
        rest = dienst.communicate(timeout=10)[0] or ""
    except subprocess.TimeoutExpired:
        dienst.kill()
        rest = dienst.communicate()[0] or ""

    pruefe("kein Traceback auf der Konsole",
           "Traceback (most recent call last)" not in rest,
           rest[-700:])
    pruefe("keine Verbindungsfehler gemeldet",
           not re.search(r"ConnectionAbortedError|ConnectionResetError|"
                         r"BrokenPipeError|WinError 10053", rest),
           rest[-500:])

    print(f"\n  {len(BESTANDEN)} bestanden, {len(DURCHGEFALLEN)} durchgefallen")
    if DURCHGEFALLEN:
        sys.exit(1)


if __name__ == "__main__":
    main()
