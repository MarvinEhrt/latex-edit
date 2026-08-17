#!/bin/sh
# Startet den Schreibtisch. Einfach ausführen:  ./start.sh
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then exec python3 schreibtisch.py "$@"; fi
if command -v python  >/dev/null 2>&1; then exec python  schreibtisch.py "$@"; fi
echo "Python 3 wurde nicht gefunden. Bitte installieren: sudo apt install python3"
exit 1
