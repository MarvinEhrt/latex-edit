#!/usr/bin/env python3
"""Prüft die Versionierung: Arbeitsbaum, Festschreiben, Verlauf.

Ohne Netz. Was GitHub selbst betrifft (Repository anlegen, Hochladen),
lässt sich hier nicht prüfen -- geprüft wird alles davor: dass ein
Arbeitsbaum entsteht, dass die richtigen Dateien darin landen, dass
nicht bei jeder automatischen Sicherung festgeschrieben wird und dass
das Zeichen nirgends auf der Platte landet.

    python3 pruefungen/pruefe_versionierung.py
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.dirname(HIER)
sys.path.insert(0, WURZEL)

from begleiter import versionierung as v            # noqa: E402

BESTANDEN, DURCHGEFALLEN = [], []


def pruefe(name, bedingung, hinweis=""):
    (BESTANDEN if bedingung else DURCHGEFALLEN).append(name)
    print(f"  {'OK' if bedingung else '!!'}  {name}"
          + (f"\n      {hinweis}" if not bedingung and hinweis else ""))


DOKUMENT = {
    "meta": {"titel": "Interessen und Zufriedenheit", "verfasser": "Anna Beispiel",
             "arbeitstyp": "bachelor", "hochschule": "Universität X"},
    "bloecke": [
        {"id": "b1", "typ": "ueberschrift", "text": "Einleitung", "ebene": 1},
        {"id": "b2", "typ": "absatz", "runs": [{"text": "Ein Satz mit fünf Wörtern."}]},
    ],
    "quellen": [],
}

DATEIEN = {
    "arbeit.tex": "\\documentclass{article}\n\\begin{document}\nEin Satz.\n\\end{document}\n",
    "literatur.bib": "% leer\n",
    "arbeit-stil.sty": "% Stil\n",
    "/etc/passwort": "darf nicht ankommen",       # Pfadausbruch
}


def main():
    print("\nVersionierungsprüfung\n")

    werkzeug = v.finde_git()
    pruefe("git gefunden", werkzeug["gefunden"], str(werkzeug))
    if not werkzeug["gefunden"]:
        sys.exit("Ohne git lässt sich hier nichts prüfen.")

    lager = tempfile.mkdtemp(prefix="schreibtisch-git-pruefung-")
    arbeiten = os.path.join(lager, "Arbeiten")
    os.makedirs(arbeiten)
    bilder = os.path.join(arbeiten, "Meine Arbeit.bilder")
    os.makedirs(bilder)
    with open(os.path.join(bilder, "aa11bb22cc33dd44ee55.png"), "wb") as f:
        f.write(b"\x89PNG-Platzhalter")

    ver = v.Versionierung(arbeiten)

    # ---------------------------------------------------- Verbinden
    schief = False
    try:
        ver.verbinde("Meine Arbeit", "kein-schraegstrich", "")
    except v.GitFehler:
        schief = True
    pruefe("ein unsinniger Repositoryname wird abgewiesen", schief)

    stand = ver.verbinde("Meine Arbeit", "nutzerin/abschlussarbeit", "")
    baum = os.path.join(arbeiten, ".git-arbeiten", "Meine Arbeit")
    pruefe("der Arbeitsbaum entsteht", os.path.isdir(os.path.join(baum, ".git")))
    pruefe("die Verbindung wird gemeldet",
           stand["verbunden"] and stand["repo"] == "nutzerin/abschlussarbeit",
           str(stand))
    pruefe("die Verbindung überlebt einen Neustart",
           v.Versionierung(arbeiten).verbindung("Meine Arbeit")["repo"]
           == "nutzerin/abschlussarbeit")
    pruefe("die Verbindungsdatei ist keine Arbeit",
           os.path.basename(ver._kartei).startswith("."),
           os.path.basename(ver._kartei))

    rc, aus = v._git(["remote", "get-url", "origin"], baum)
    pruefe("die Adresse zeigt auf GitHub",
           rc == 0 and "github.com/nutzerin/abschlussarbeit.git" in aus, aus)
    pruefe("in der Adresse steht kein Zeichen",
           "x-access-token@github.com" in aus and ":" not in aus.split("//")[1].split("@")[0],
           aus)

    # ---------------------------------------------------- Festschreiben
    e = ver.sichere("Meine Arbeit", DOKUMENT, DATEIEN, bilder, schiebe=False)
    pruefe("der erste Stand wird festgeschrieben", e.get("festgeschrieben"), str(e))
    pruefe("die Arbeit liegt als JSON im Baum",
           os.path.exists(os.path.join(baum, "arbeit.json")))
    pruefe("das erzeugte LaTeX liegt daneben",
           os.path.exists(os.path.join(baum, "arbeit.tex"))
           and os.path.exists(os.path.join(baum, "literatur.bib")))
    pruefe("die Bilder sind mitgekommen",
           os.path.exists(os.path.join(baum, "bilder", "aa11bb22cc33dd44ee55.png")))
    pruefe("eine LIESMICH erklärt das Repository",
           "Schreibtisch" in open(os.path.join(baum, "LIESMICH.md"),
                                  encoding="utf-8").read())
    pruefe("ein Dateiname mit vollem Pfad landet nicht im Baum",
           not os.path.exists("/etc/passwort")
           and not os.path.exists(os.path.join(baum, "etc")),
           str(sorted(os.listdir(baum))))

    verlauf = ver.verlauf("Meine Arbeit")
    pruefe("der Verlauf enthält den Commit", len(verlauf) == 1, str(verlauf))
    pruefe("die Meldung nennt Datum und Umfang",
           "Wörter" in verlauf[0]["betreff"] and "." in verlauf[0]["betreff"],
           str(verlauf[0]))
    pruefe("der Verfasser steht als Autor darin",
           "Anna Beispiel" in v._git(["log", "-1", "--pretty=%an"], baum)[1],
           v._git(["log", "-1", "--pretty=%an"], baum)[1])

    # ---------------------------------------------------- Nichts geändert
    e = ver.sichere("Meine Arbeit", DOKUMENT, DATEIEN, bilder, schiebe=False)
    pruefe("ohne Änderung entsteht kein zweiter Commit",
           e.get("uebersprungen") == "nichts geändert", str(e))

    # ---------------------------------------------------- Abstand halten
    geaendert = json.loads(json.dumps(DOKUMENT))
    geaendert["bloecke"][1]["runs"][0]["text"] = "Ein deutlich längerer Satz."
    e = ver.sichere("Meine Arbeit", geaendert, DATEIEN, bilder,
                    erzwinge=False, schiebe=False)
    pruefe("die automatische Sicherung schreibt nicht sofort wieder fest",
           e.get("uebersprungen") == "zu früh", str(e))
    e = ver.sichere("Meine Arbeit", geaendert, DATEIEN, bilder, schiebe=False)
    pruefe("von Hand gesichert wird dagegen sofort festgeschrieben",
           e.get("festgeschrieben"), str(e))
    pruefe("jetzt stehen zwei Commits im Verlauf",
           len(ver.verlauf("Meine Arbeit")) == 2)

    # ---------------------------------------------------- Der Diff zeigt Text
    rc, diff = v._git(["diff", "HEAD~1", "HEAD", "--", "arbeit.json"], baum)
    pruefe("der Verlauf zeigt die geänderte Stelle",
           rc == 0 and "längerer" in diff, diff[:200])

    # ---------------------------------------------------- Nicht verbunden
    e = ver.sichere("Andere Arbeit", DOKUMENT, DATEIEN, bilder, schiebe=False)
    pruefe("eine nicht verbundene Arbeit wird übergangen",
           e.get("uebersprungen") == "nicht verbunden", str(e))

    # ---------------------------------------------------- Zustand
    stand = ver.stand("Meine Arbeit")
    pruefe("der Zustand nennt den letzten Commit",
           stand["letzter"] and stand["letzter"]["zeit"] > 0, str(stand))
    pruefe("und keine offenen Änderungen", stand["offen"] == 0, str(stand))

    # ---------------------------------------------------- Trennen
    ver.trenne("Meine Arbeit")
    pruefe("nach dem Trennen ist die Arbeit nicht mehr verbunden",
           not ver.stand("Meine Arbeit")["verbunden"])
    pruefe("der Arbeitsbaum bleibt aber stehen",
           os.path.isdir(os.path.join(baum, ".git")))
    ver.trenne("Meine Arbeit", mitBaum=True)
    pruefe("auf Wunsch verschwindet auch er", not os.path.isdir(baum))

    # ---------------------------------------------------- Askpass
    ordner, skript = v._askpass_skript("geheimes-zeichen")
    inhalt = open(skript, encoding="ascii").read()
    pruefe("das Askpass-Skript enthält das Zeichen nicht im Klartext",
           "geheimes-zeichen" not in inhalt, inhalt)
    if sys.platform != "win32":
        e = subprocess.run([skript], capture_output=True, text=True,
                           env={**os.environ, "SCHREIBTISCH_GH": "geheimes-zeichen"})
        pruefe("es gibt das Zeichen aus der Umgebung aus",
               e.stdout.strip() == "geheimes-zeichen", repr(e.stdout))
    shutil.rmtree(ordner, ignore_errors=True)

    shutil.rmtree(lager, ignore_errors=True)

    print(f"\n  {len(BESTANDEN)} bestanden, {len(DURCHGEFALLEN)} durchgefallen")
    if DURCHGEFALLEN:
        print("  Durchgefallen: " + ", ".join(DURCHGEFALLEN))
        sys.exit(1)


if __name__ == "__main__":
    main()
