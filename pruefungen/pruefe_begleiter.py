#!/usr/bin/env python3
"""Prüft den lokalen Begleiter: echter Generatorausstoß, echter
pdflatex/biber-Lauf, und ob ein Fehler auf den richtigen Baustein zeigt.

    python3 pruefungen/pruefe_begleiter.py
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.dirname(HIER)
sys.path.insert(0, WURZEL)

from begleiter import ablage as ablage_modul          # noqa: E402
from begleiter import uebersetzen as uebersetzen_modul  # noqa: E402

BESTANDEN, DURCHGEFALLEN = [], []


def pruefe(bezeichnung, bedingung, hinweis=""):
    (BESTANDEN if bedingung else DURCHGEFALLEN).append(bezeichnung)
    print(f"  {'✓' if bedingung else '✗'} {bezeichnung}"
          + (f"\n      {hinweis}" if not bedingung and hinweis else ""))


def projekt(kaputt=False) -> dict:
    aufruf = ["node", os.path.join(HIER, "erzeuge_projekt.mjs")]
    if kaputt:
        aufruf.append("kaputt")
    e = subprocess.run(aufruf, capture_output=True, text=True, timeout=120)
    if e.returncode != 0:
        sys.exit("Generator fehlgeschlagen:\n" + e.stderr)
    return json.loads(e.stdout)


def baustein_zu(zeile, karte):
    for e in karte:
        if e["von"] <= zeile <= e["bis"]:
            return e
    return None


def main():
    print("\nBegleiterprüfung\n")

    werkzeuge = uebersetzen_modul.pruefe_werkzeuge()
    pruefe("pdflatex und biber gefunden", werkzeuge["vollstaendig"],
           str(werkzeuge["programme"]))
    if not werkzeuge["vollstaendig"]:
        sys.exit("Ohne LaTeX lässt sich nichts prüfen.")

    ordner = tempfile.mkdtemp(prefix="schreibtisch-pruefung-")
    uebersetzer = uebersetzen_modul.Uebersetzer(ordner)

    # ------------------------------------------------ sauberer Durchlauf
    p = projekt()
    bilder = [{"datei": b["datei"], "bytes": b["daten"].encode()} for b in p["bilder"]]
    import base64
    bilder = [{"datei": b["datei"], "bytes": base64.b64decode(b["daten"])}
              for b in p["bilder"]]
    e1 = uebersetzer.uebersetze(p["dateien"], bilder)
    pruefe("sauberes Projekt übersetzt", e1["status"] == "ok",
           f"status={e1['status']} fehler={e1['fehler'][:2]}")
    pruefe("PDF liegt vor", os.path.exists(uebersetzer.pdf_pfad())
           and os.path.getsize(uebersetzer.pdf_pfad()) > 5000)
    pruefe("keine Fehler gemeldet", not e1["fehler"], str(e1["fehler"][:2]))

    seiten = subprocess.run(["pdfinfo", uebersetzer.pdf_pfad()],
                            capture_output=True, text=True).stdout
    pruefe("mehr als eine Seite", "Pages:" in seiten and
           int([z for z in seiten.splitlines() if z.startswith("Pages")][0].split()[-1]) > 1)

    # ------------------------------------------------ zweiter Lauf schneller
    e2 = uebersetzer.uebersetze(p["dateien"], bilder)
    pruefe("zweiter Lauf ohne Änderung ist schneller",
           e2["dauerMs"] <= e1["dauerMs"],
           f"erst {e1['dauerMs']} ms, dann {e2['dauerMs']} ms")

    # ------------------------------------------------ Literaturverzeichnis
    tex = p["dateien"]["arbeit.tex"]
    pruefe("Literaturverzeichnis vor dem Anhang",
           tex.index("\\literaturverzeichnis") < tex.index("\\anhang"))
    bib = p["dateien"]["literatur.bib"]
    pruefe("nur zitierte Quellen in der .bib",
           bib.count("@") >= 2 and "nichtzitiert" not in bib)

    # ------------------------------------------------ Zeilenkarte
    karte = p["zeilenkarte"]
    pruefe("Zeilenkarte ist gefüllt", len(karte) > 5, f"{len(karte)} Einträge")
    ueberlappung = any(a["bis"] >= b["von"] for a, b in zip(karte, karte[1:]))
    pruefe("Zeilenbereiche überlappen nicht", not ueberlappung)

    # ------------------------------------------------ Fehler -> Baustein
    pk = projekt(kaputt=True)
    ordner2 = tempfile.mkdtemp(prefix="schreibtisch-kaputt-")
    uebersetzer2 = uebersetzen_modul.Uebersetzer(ordner2)
    ek = uebersetzer2.uebersetze(pk["dateien"], [])
    pruefe("kaputtes Projekt wird als Fehler erkannt", ek["status"] == "fehler",
           f"status={ek['status']}")
    pruefe("Fehler kommt mit Zeilenangabe zurück",
           any(f["zeile"] for f in ek["fehler"]),
           str([(f["zeile"], f["meldung"]) for f in ek["fehler"]]))

    mit_zeile = [f for f in ek["fehler"] if f["zeile"]]
    if mit_zeile:
        treffer = baustein_zu(mit_zeile[0]["zeile"], pk["zeilenkarte"])
        pruefe("Fehler zeigt auf den kaputten Formel-Baustein",
               treffer is not None and treffer["id"] == pk["formelBlockId"],
               f"Zeile {mit_zeile[0]['zeile']} -> "
               f"{treffer['typ'] if treffer else 'nichts'} "
               f"(erwartet: formel {pk['formelBlockId']})")
        pruefe("Fehlermeldung ist auf Deutsch verständlich",
               any(w in mit_zeile[0]["meldung"] for w in
                   ("Klammer", "Befehl", "LaTeX", "Datei", "Formel", "meldet")),
               mit_zeile[0]["meldung"])

    # ------------------------------------------------ Vorabprüfung in JS
    vorab = subprocess.run(
        ["node", "-e", """
const fs=require('fs');
const q=f=>fs.readFileSync('quelle/'+f,'utf8');
const lade=new Function(['10-modell.js','20-richtext.js','30-latex.js'].map(q).join('\\n')
  +'\\nreturn {Modell,Latex};');
const {Modell,Latex}=lade();
const d=Modell.neu('hausarbeit');
d.bloecke=[Modell.neuerBlock('formel',{tex:'\\\\frac{a}{b'}),
           Modell.neuerBlock('formel',{tex:'x = $y'}),
           Modell.neuerBlock('formel',{tex:'\\\\frac{a}{b}'})];
console.log(JSON.stringify(Latex.pruefe(d)));
"""], capture_output=True, text=True, cwd=WURZEL, timeout=60)
    try:
        anmerkungen = json.loads(vorab.stdout.strip().splitlines()[-1])
    except Exception:
        anmerkungen = []
    pruefe("Vorabprüfung findet fehlende Klammer und einzelnes $",
           len(anmerkungen) == 2
           and "Klammer" in anmerkungen[0]["meldung"]
           and "$" in anmerkungen[1]["meldung"],
           vorab.stdout + vorab.stderr)

    # ------------------------------------------------ Logauswertung einzeln
    beispiel = ("! Undefined control sequence.\n"
                "l.42 \\nichtgibtes\n")
    f = uebersetzen_modul.werte_log_aus(beispiel)
    pruefe("Logauswertung erkennt unbekannten Befehl",
           len(f) == 1 and f[0]["zeile"] == 42 and "Befehl" in f[0]["meldung"],
           str(f))

    beispiel2 = "! LaTeX Error: File `fehlt.sty' not found.\nl.7 \\usepackage{fehlt}\n"
    f2 = uebersetzen_modul.werte_log_aus(beispiel2)
    pruefe("Logauswertung erkennt fehlende Datei",
           len(f2) == 1 and "fehlt.sty" in f2[0]["meldung"], str(f2))

    # ------------------------------------------------ Warnungen
    # Warnungen brechen den Lauf nicht ab -- das PDF entsteht, und darin
    # steht dann der rohe Schlüssel. Genau die Sorte Fehler, die man bei
    # der Abgabe übersieht.
    w = uebersetzen_modul.werte_warnungen_aus(
        "LaTeX Warning: Citation 'holland1997' on page 3 undefined on input line 42.\n"
        "LaTeX Warning: Reference 'tab:abc123' on page 5 undefined on input line 88.\n"
        "LaTeX Warning: There were undefined references.\n")
    pruefe("Warnung: fehlende Quelle wird erkannt",
           any(x["sorte"] == "zitat" and x["schluessel"] == "holland1997" for x in w), str(w))
    pruefe("Warnung: ins Leere gehender Querverweis wird erkannt",
           any(x["sorte"] == "verweis" and x["schluessel"] == "tab:abc123" for x in w), str(w))
    pruefe("Warnung nennt den Schlüssel für die Zuordnung",
           all(x["art"] == "warnung" for x in w), str(w))

    # Warnungen, die bei jedem Dokument auftreten, dürfen nicht gemeldet
    # werden -- Dauerrauschen erzieht dazu, Warnungen zu übersehen.
    for text, was in [("Package biblatex Warning: Please (re)run Biber on the file:",
                       "Zwischenstand von Biber"),
                      ("Package biblatex Warning: Empty bibliography on input line 5.",
                       "leere Bibliografie eines frischen Dokuments")]:
        pruefe(f"{was} gilt nicht als Warnung",
               not uebersetzen_modul.werte_warnungen_aus(text + "\n"),
               str(uebersetzen_modul.werte_warnungen_aus(text + "\n")))

    doppelt = uebersetzen_modul.werte_warnungen_aus(
        "LaTeX Warning: Citation 'x' on page 1 undefined on input line 1.\n"
        "LaTeX Warning: Citation 'x' on page 9 undefined on input line 9.\n")
    pruefe("dieselbe Quelle wird nur einmal gemeldet", len(doppelt) == 1, str(doppelt))

    pruefe("Fehler sind als solche gekennzeichnet",
           all(x["art"] == "fehler" for x in
               uebersetzen_modul.werte_log_aus("! Undefined control sequence.\nl.5 \\x\n")))

    # ------------------------------------------------ Zotero-Abbildung
    from begleiter import zotero as zotero_modul
    roh = [
      {"key": "AAA", "data": {"itemType": "journalArticle",
        "title": "Interessen und Zufriedenheit",
        "creators": [{"creatorType": "author", "firstName": "Hans-Jürgen",
                      "lastName": "Müller"},
                     {"creatorType": "author", "name": "Institut für Testung"}],
        "date": "2020-05-13", "publicationTitle": "Zeitschrift für Psychologie",
        "volume": "45", "issue": "2", "pages": "113-127", "DOI": "10.1037/x"}},
      {"key": "BBB", "data": {"itemType": "bookSection", "title": "Ein Kapitel",
        "creators": [{"creatorType": "author", "firstName": "O.", "lastName": "John"},
                     {"creatorType": "editor", "firstName": "R.", "lastName": "Robins"}],
        "date": "2008", "bookTitle": "Handbuch", "pages": "114-158",
        "publisher": "Guilford"}},
      {"key": "CCC", "data": {"itemType": "attachment", "title": "PDF"}},
      {"key": "DDD", "data": {"itemType": "webpage", "title": "Eine Seite",
        "creators": [{"creatorType": "author", "name": "Agentur für Arbeit"}],
        "date": "2024", "url": "https://x.de", "accessDate": "2026-08-17T10:00:00Z"}},
    ]
    vergeben = set()
    umgebaut = [q for q in (zotero_modul._umbauen(e, vergeben) for e in roh) if q]
    pruefe("Zotero: Anhänge werden übersprungen", len(umgebaut) == 3,
           str([q["typ"] for q in umgebaut]))
    pruefe("Zotero: Typen richtig abgebildet",
           [q["typ"] for q in umgebaut] == ["artikel", "kapitel", "online"],
           str([q["typ"] for q in umgebaut]))
    a = umgebaut[0]["felder"]
    pruefe("Zotero: Personen und Institution im Autorenfeld",
           a["autoren"] == "Müller, Hans-Jürgen; Institut für Testung", a["autoren"])
    pruefe("Zotero: Jahr aus vollem Datum", a["jahr"] == "2020", a["jahr"])
    pruefe("Zotero: Zeitschriftenfelder übernommen",
           a["zeitschrift"] == "Zeitschrift für Psychologie" and a["jahrgang"] == "45"
           and a["heft"] == "2" and a["seiten"] == "113-127" and a["doi"] == "10.1037/x",
           str(a))
    k = umgebaut[1]["felder"]
    pruefe("Zotero: Herausgeber getrennt von Autoren",
           k["herausgeber"] == "Robins, R." and k["autoren"] == "John, O.", str(k))
    w = umgebaut[2]["felder"]
    pruefe("Zotero: Abrufdatum gekürzt", w["abgerufen"] == "2026-08-17", str(w))
    pruefe("Zotero: Schlüssel eindeutig und sprechend",
           [q["key"] for q in umgebaut] == ["mueller2020", "john2008", "agenturfuerarbeit2024"],
           str([q["key"] for q in umgebaut]))

    # ------------------------------------------------ Ablage
    lager = tempfile.mkdtemp(prefix="schreibtisch-ablage-")
    a = ablage_modul.Ablage(os.path.join(lager, "Arbeiten"))
    a.sichere("Meine Arbeit", {"meta": {"titel": "Test"}, "bloecke": []})
    a.sichere("Meine Arbeit", {"meta": {"titel": "Test 2"}, "bloecke": []})
    liste = a.liste()
    pruefe("Projekt gesichert und wiedergefunden",
           len(liste) == 1 and liste[0]["titel"] == "Test 2", str(liste))
    pruefe("Sicherung der Vorfassung angelegt",
           os.path.isdir(os.path.join(lager, "Arbeiten", ".sicherungen")))
    pruefe("gefährliche Dateinamen entschärft",
           ablage_modul.sauberer_name('a/b\\c:d*?"<>|') == "a-b-c-d------",
           ablage_modul.sauberer_name('a/b\\c:d*?"<>|'))
    pruefe("Windows-Gerätename entschärft",
           ablage_modul.sauberer_name("CON").startswith("_"))

    # ------------------------------------------------ Bilder daneben
    import base64 as _b64
    PNG = ("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8"
           "z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    gross = _b64.b64encode(b"\x89PNG" + b"x" * 300_000).decode()
    mit_bild = {"meta": {"titel": "Mit Bild"}, "bloecke": [
        {"id": "b1", "typ": "absatz", "runs": [{"text": "Text"}]},
        {"id": "b2", "typ": "abbildung", "titel": "Screenshot",
         "datenUrl": "data:image/png;base64," + PNG},
        {"id": "b3", "typ": "abbildung", "titel": "Groß",
         "datenUrl": "data:image/png;base64," + gross},
    ]}
    a.sichere("Bildarbeit", mit_bild)
    json_pfad = os.path.join(lager, "Arbeiten", "Bildarbeit.json")
    bildordner = os.path.join(lager, "Arbeiten", "Bildarbeit.bilder")
    roh = open(json_pfad, encoding="utf-8").read()
    pruefe("Bilddaten stehen nicht mehr in der Projektdatei",
           "base64," not in roh and '"bild:' in roh, roh[:200])
    pruefe("die Projektdatei bleibt klein",
           os.path.getsize(json_pfad) < 2000, str(os.path.getsize(json_pfad)))
    pruefe("die Bilder liegen daneben",
           os.path.isdir(bildordner) and len(os.listdir(bildordner)) == 2,
           str(os.listdir(bildordner) if os.path.isdir(bildordner) else None))
    pruefe("das übergebene Dokument bleibt unverändert",
           mit_bild["bloecke"][1]["datenUrl"].startswith("data:image/png;base64,"),
           mit_bild["bloecke"][1]["datenUrl"][:40])

    zurueck = a.lade("Bildarbeit")
    pruefe("Laden stellt die Bilder wieder her",
           zurueck["bloecke"][1]["datenUrl"] == mit_bild["bloecke"][1]["datenUrl"] and
           zurueck["bloecke"][2]["datenUrl"] == mit_bild["bloecke"][2]["datenUrl"],
           zurueck["bloecke"][1]["datenUrl"][:60])

    # Dasselbe Bild zweimal -> eine Datei
    doppelt = json.loads(json.dumps(mit_bild))
    doppelt["bloecke"].append({"id": "b4", "typ": "abbildung", "titel": "Nochmal",
                               "datenUrl": "data:image/png;base64," + PNG})
    a.sichere("Bildarbeit", doppelt)
    pruefe("dasselbe Bild wird nur einmal abgelegt",
           len(os.listdir(bildordner)) == 2, str(os.listdir(bildordner)))

    # Zwanzig Sicherungen kosten das Bild nicht zwanzigmal
    for i in range(20):
        doppelt["meta"]["titel"] = f"Lauf {i}"
        a.sichere("Bildarbeit", doppelt)
    gesamt = sum(os.path.getsize(os.path.join(w, d))
                 for w, _, ds in os.walk(os.path.join(lager, "Arbeiten")) for d in ds)
    pruefe("21 Sicherungen wiegen nicht 21 Bilder",
           gesamt < 1_500_000, f"{gesamt} Bytes")

    # Ein ausgetauschtes Bild lässt keinen Müll zurück
    ohne = json.loads(json.dumps(mit_bild))
    ohne["bloecke"] = [ohne["bloecke"][0]]
    for i in range(21):                       # alle Sicherungen durchreichen
        a.sichere("Bildarbeit", ohne)
    pruefe("nicht mehr benutzte Bilder werden aufgeräumt",
           not os.path.isdir(bildordner) or not os.listdir(bildordner),
           str(os.listdir(bildordner) if os.path.isdir(bildordner) else None))

    # Fehlt die Bilddatei, bleibt der Baustein trotzdem lesbar
    a.sichere("Kaputt", mit_bild)
    for d in os.listdir(os.path.join(lager, "Arbeiten", "Kaputt.bilder")):
        os.remove(os.path.join(lager, "Arbeiten", "Kaputt.bilder", d))
    k = a.lade("Kaputt")
    pruefe("fehlende Bilddatei löscht nicht den Baustein",
           len(k["bloecke"]) == 3 and k["bloecke"][1]["datenUrl"] == ""
           and k["bloecke"][1]["titel"] == "Screenshot", str(k["bloecke"][1])[:120])

    # Kein Ausbruch aus dem Bildordner
    geheim = os.path.join(lager, "geheim.txt")
    open(geheim, "w").write("streng geheim")
    a.sichere("Boes", {"meta": {"titel": "B"}, "bloecke": [
        {"id": "x", "typ": "abbildung", "datenUrl": "bild:../../geheim.txt"}]})
    b = a.lade("Boes")
    pruefe("ein Pfad aus dem Ordner heraus wird abgewiesen",
           b["bloecke"][0]["datenUrl"] == "", b["bloecke"][0]["datenUrl"][:60])

    for o in (ordner, ordner2, lager):
        shutil.rmtree(o, ignore_errors=True)

    print(f"\n  {len(BESTANDEN)} bestanden, {len(DURCHGEFALLEN)} durchgefallen")
    if DURCHGEFALLEN:
        print("  Durchgefallen: " + ", ".join(DURCHGEFALLEN))
        sys.exit(1)


if __name__ == "__main__":
    main()
