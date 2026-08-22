#!/usr/bin/env python3
"""
bauen.py -- fügt die Quelldateien zu EINER HTML-Datei zusammen.

    python3 bauen.py

Ergebnis: oberflaeche.html -- eine Datei, ohne Installation und ohne
Internet. Doppelklicken genügt allerdings nicht: das Zeichen für den
Begleiter setzt erst der Dienst beim Ausliefern ein. Gestartet wird
über start.sh bzw. start.bat.
"""

from pathlib import Path
import re
import sys

HIER = Path(__file__).parent
QUELLE = HIER / "quelle"
ZIEL = HIER / "oberflaeche.html"

JS_DATEIEN = [
    "10-modell.js",
    "12-verlauf.js",
    "20-richtext.js",
    "30-latex.js",
    "32-diagramm.js",
    "40-pdfansicht.js",
    "50-dialoge.js",
    "60-editor.js",
    "62-auswahlleiste.js",
    "64-suche.js",
    "70-zip.js",
    "72-import.js",
    "73-daten.js",
    "74-begleiter.js",
    "76-dialoge-extra.js",
    "78-diagrammdialog.js",
    "80-app.js",
]


def lies(name: str) -> str:
    pfad = QUELLE / name
    if not pfad.exists():
        sys.exit(f"Fehlt: {pfad}")
    return pfad.read_text(encoding="utf-8")


def main() -> None:
    geruest = lies("index.html")
    css = lies("00-stil.css")

    teile = []
    for name in JS_DATEIEN:
        teile.append(f"\n/* ==== {name} {'=' * (56 - len(name))} */\n")
        teile.append(lies(name))
    js = "".join(teile)

    # </script> im Quelltext würde das umschließende <script> beenden.
    if "</script" in js.lower():
        js = re.sub(r"</script", r"<\\/script", js, flags=re.I)

    seite = geruest.replace("/*<<<CSS>>>*/", css).replace("/*<<<JS>>>*/", js)

    if "<<<CSS>>>" in seite or "<<<JS>>>" in seite:
        sys.exit("Platzhalter in index.html nicht ersetzt.")

    ZIEL.write_text(seite, encoding="utf-8")
    groesse = ZIEL.stat().st_size / 1024
    print(f"  {ZIEL.name} gebaut  ({groesse:.0f} KB)")
    print(f"  CSS {len(css) / 1024:.0f} KB, JS {len(js) / 1024:.0f} KB, "
          f"{len(JS_DATEIEN)} Module")
    if __name__ == "__main__":     # beim Start aus schreibtisch.py unnötig
        oeffner = "start" if sys.platform == "win32" else "xdg-open"
        print(f"  Öffnen mit:  {oeffner} {ZIEL}")



if __name__ == "__main__":
    main()
