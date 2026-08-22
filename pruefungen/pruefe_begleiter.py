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

def pruefe_mit_latex():
    """Alles, was einen echten pdflatex/biber-Lauf braucht."""
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

    try:
        seiten = subprocess.run(["pdfinfo", uebersetzer.pdf_pfad()],
                                capture_output=True, text=True).stdout
    except FileNotFoundError:
        # poppler steht in keiner Voraussetzungsliste -- ohne pdfinfo
        # entfällt diese eine Prüfung, statt die ganze Suite zu killen.
        seiten = ""
        print("  – pdfinfo fehlt, Seitenzahl nicht geprüft")
    if seiten:
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

    for o in (ordner, ordner2):
        shutil.rmtree(o, ignore_errors=True)


def pruefe_ohne_latex():
    """Abbildungen, Ablage, Sicherungen, Zwei-Fenster-Schutz.

    Steht getrennt, weil nichts davon LaTeX braucht: auf einem Rechner
    ohne pdflatex soll wenigstens der Teil laufen, der die Arbeiten der
    Nutzerin auf der Platte betrifft.
    """
    # ------------------------------------------------ Biber-Meldungen
    # Scheiterte biber, war das bisher völlig unsichtbar: die Ausgabe
    # wurde eingesammelt und beim Überschreiben des Protokolls verworfen.
    b_syntax = uebersetzen_modul.werte_biber_aus(
        "INFO - This is Biber 2.19\n"
        "ERROR - BibTeX subsystem: /tmp/x.bib_1.utf8, line 7, syntax error\n"
        "INFO - ERRORS: 1")
    pruefe("ein kaputter Quelleneintrag wird als Fehler gemeldet",
           len(b_syntax) == 1 and b_syntax[0]["art"] == "fehler"
           and "fehlerhaft aufgebaut" in b_syntax[0]["meldung"], str(b_syntax))
    pruefe("die Biber-Meldung nennt einen Rat auf Deutsch",
           "Quellen-Dialog" in b_syntax[0]["rat"], str(b_syntax[0]["rat"]))
    b_doppelt = uebersetzen_modul.werte_biber_aus(
        "ERROR - Duplicate entry key 'mueller2020' in file")
    pruefe("ein doppelter Quellenschlüssel wird benannt",
           len(b_doppelt) == 1 and "mueller2020" in b_doppelt[0]["meldung"],
           str(b_doppelt))
    pruefe("unbekannte Biber-Fehler kommen trotzdem durch",
           len(uebersetzen_modul.werte_biber_aus(
               "ERROR - Etwas ganz Neues ging schief")) == 1)
    pruefe("dieselbe Biber-Meldung nur einmal",
           len(uebersetzen_modul.werte_biber_aus(
               "ERROR - Etwas ging schief\nERROR - Etwas ging schief")) == 1)
    pruefe("ohne ERROR-Zeile keine Fehlerkarte",
           uebersetzen_modul.werte_biber_aus(
               "INFO - This is Biber 2.19\nINFO - WARNINGS: 0") == [])
    pruefe("die Bitte um einen Biber-Lauf wird erkannt",
           uebersetzen_modul._braucht_biber(
               "Package biblatex Warning: Please (re)run Biber on the file"))

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

    # ------------------------------------------------ Crossref-Abbildung
    # Kein Netz in Prüfungen: die Abbildung wird mit einer eingecheckten
    # Crossref-Antwort gefüttert.
    from begleiter import nachschlagen as nachschlagen_modul
    with open(os.path.join(HIER, "daten", "crossref-probe.json"),
              encoding="utf-8") as f:
        probe = json.load(f)
    cr = nachschlagen_modul.abbilden(probe)
    pruefe("Crossref: Typ journal-article wird artikel", cr["typ"] == "artikel",
           str(cr))
    cf = cr["felder"]
    pruefe("Crossref: Autorenformat Nachname, Vorname; … samt Institution",
           cf["autoren"] == "Schmidt, Anna; Müller, Hans-Jürgen; "
                            "Institut für Testforschung", cf["autoren"])
    pruefe("Crossref: Jahr aus issued", cf["jahr"] == "2019", cf["jahr"])
    pruefe("Crossref: Zeitschriftenfelder übernommen",
           cf["zeitschrift"].startswith("Zeitschrift für Arbeits-")
           and cf["jahrgang"] == "63" and cf["heft"] == "2"
           and cf["seiten"] == "67-81"
           and cf["doi"] == "10.1026/0932-4089/a000291", str(cf))

    kap = nachschlagen_modul.abbilden({"message": {
        "type": "book-chapter", "title": ["Ein Kapitel"],
        "container-title": ["Handbuch der Persönlichkeit"],
        "author": [{"given": "O.", "family": "John"}],
        "editor": [{"given": "R.", "family": "Robins"}],
        "issued": {"date-parts": [[2008]]}, "page": "114-158",
        "publisher": "Guilford", "DOI": "10.1/abc"}})
    pruefe("Crossref: book-chapter wird kapitel mit Herausgeber und Buchtitel",
           kap["typ"] == "kapitel"
           and kap["felder"]["herausgeber"] == "Robins, R."
           and kap["felder"]["buchtitel"] == "Handbuch der Persönlichkeit"
           and kap["felder"]["verlag"] == "Guilford", str(kap))

    kaputt_ok = False
    try:
        nachschlagen_modul.abbilden({"voellig": "anderes JSON"})
    except nachschlagen_modul.NachschlagFehler as f:
        kaputt_ok = "Crossref" in str(f)
    pruefe("Crossref: kaputtes JSON gibt eine saubere Fehlermeldung", kaputt_ok)

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

    # ------------------------------------------------ Frühere Fassungen
    import time as _zeit
    f_lager = tempfile.mkdtemp(prefix="schreibtisch-fassungen-")
    fa = ablage_modul.Ablage(os.path.join(f_lager, "Arbeiten"))
    fa.sichere("Fassung", {"meta": {"titel": "Alt"}, "bloecke": [
        {"id": "b1", "typ": "abbildung", "titel": "Bild",
         "datenUrl": "data:image/png;base64," + PNG}]})
    _zeit.sleep(0.01)
    fa.sichere("Fassung", {"meta": {"titel": "Neu"}, "bloecke": []})
    fassungen = fa.sicherungen("Fassung")
    pruefe("Sicherungsliste enthält die angelegte Fassung",
           len(fassungen) == 1 and fassungen[0]["titel"] == "Alt"
           and fassungen[0]["zeit"] > 0 and fassungen[0]["bytes"] > 0,
           str(fassungen))
    alt = fa.lade_sicherung("Fassung", fassungen[0]["datei"])
    pruefe("Wiederherstellung liefert den alten Inhalt samt Bild",
           alt["meta"]["titel"] == "Alt"
           and alt["bloecke"][0]["datenUrl"].startswith("data:image/png;base64,"),
           str(alt)[:120])
    ausbruch = False
    try:
        fa.lade_sicherung("Fassung", "../Fassung.json")
    except (FileNotFoundError, ValueError):
        ausbruch = True
    pruefe("Pfadausbruch bei Sicherungen wird abgewiesen", ausbruch)

    # Zwei Sicherungen in derselben Sekunde überschreiben sich nicht
    fa.sichere("Fassung", {"meta": {"titel": "Drei"}, "bloecke": []})
    fa.sichere("Fassung", {"meta": {"titel": "Vier"}, "bloecke": []})
    pruefe("schnelle Folge-Sicherungen bleiben alle erhalten",
           len(fa.sicherungen("Fassung")) == 3,
           str([e["datei"] for e in fa.sicherungen("Fassung")]))

    # ---- Aufräumen greift nur die eigenen Fassungen an
    # "Bachelorarbeit" und "Bachelorarbeit-Entwurf" fangen gleich an; ein
    # startswith(name) räumte die Fassungen der zweiten mit weg.
    n_lager = tempfile.mkdtemp(prefix="schreibtisch-nachbarn-")
    na = ablage_modul.Ablage(os.path.join(n_lager, "Arbeiten"))
    for titel in ("eins", "zwei", "drei"):
        na.sichere("Bachelorarbeit-Entwurf", {"meta": {"titel": titel}, "bloecke": []})
        _zeit.sleep(0.002)
    entwurf_vorher = len(na.sicherungen("Bachelorarbeit-Entwurf"))
    for i in range(30):                    # weit über NEUESTE hinaus
        na.sichere("Bachelorarbeit", {"meta": {"titel": f"Lauf {i}"}, "bloecke": []})
    pruefe("Aufräumen lässt die Fassungen des Nachbarprojekts stehen",
           len(na.sicherungen("Bachelorarbeit-Entwurf")) == entwurf_vorher == 2,
           str(na.sicherungen("Bachelorarbeit-Entwurf")))
    pruefe("die eigenen Fassungen werden trotzdem ausgedünnt",
           len(na.sicherungen("Bachelorarbeit")) <= ablage_modul.Ablage.NEUESTE + 2,
           str(len(na.sicherungen("Bachelorarbeit"))))

    # ---- Gestaffeltes Ausdünnen: Tage überleben, nicht nur Minuten
    s_lager = tempfile.mkdtemp(prefix="schreibtisch-staffel-")
    st = ablage_modul.Ablage(os.path.join(s_lager, "Arbeiten"))
    sordner = os.path.join(s_lager, "Arbeiten", ".sicherungen")
    os.makedirs(sordner, exist_ok=True)
    jetzt = _zeit.time()

    def lege_fassung_an(alter_s):
        """Eine Sicherung mit vorgegebenem Alter. Über die Zeitmarke im
        Namen findet sie die Liste, über die mtime das Aufräumen."""
        marke = _zeit.strftime("%Y%m%d-%H%M%S", _zeit.localtime(jetzt - alter_s))
        pfad = os.path.join(sordner, f"Lang-{marke}.json")
        with open(pfad, "w", encoding="utf-8") as f:
            json.dump({"meta": {"titel": f"vor {alter_s} s"}}, f)
        os.utime(pfad, (jetzt - alter_s, jetzt - alter_s))
        return os.path.basename(pfad)

    frisch = [lege_fassung_an(i * 60) for i in range(20)]      # letzte 20 Minuten
    stunden = [lege_fassung_an(h * 3600) for h in (2, 3, 4, 5)]
    tage = [lege_fassung_an(t * 86400) for t in (2, 3, 10)]
    uralt = [lege_fassung_an(t * 86400) for t in (40, 60)]
    ablage_modul.Ablage._raeume_sicherungen(sordner, "Lang")
    da = set(os.listdir(sordner))
    pruefe("die jüngsten Fassungen bleiben vollständig",
           all(d in da for d in frisch[:ablage_modul.Ablage.NEUESTE]),
           str(sorted(da)))
    pruefe("je Stunde bleibt eine Fassung",
           all(d in da for d in stunden), str(sorted(da)))
    pruefe("die Fassung von vor zehn Tagen überlebt",
           all(d in da for d in tage), str(sorted(da)))
    pruefe("Fassungen jenseits des Monats werden weggeräumt",
           not any(d in da for d in uralt), str(sorted(da)))
    pruefe("das Ausdünnen begrenzt die Zahl der Fassungen",
           len(da) < 25, str(len(da)))

    # ---- Ein neuer Titel verdrängt keine bestehende Arbeit
    k_lager = tempfile.mkdtemp(prefix="schreibtisch-kollision-")
    ka = ablage_modul.Ablage(os.path.join(k_lager, "Arbeiten"))
    ka.sichere("Bachelorarbeit", {"meta": {"titel": "Die echte"}, "bloecke": []})
    e_neu = ka.sichere("Bachelorarbeit",
                       {"meta": {"titel": "Die neue"}, "bloecke": []}, neu=True)
    pruefe("eine neue Arbeit weicht dem belegten Namen aus",
           e_neu["name"] == "Bachelorarbeit 2" and e_neu["ausgewichen"], str(e_neu))
    pruefe("die bestehende Arbeit bleibt unberührt",
           ka.lade("Bachelorarbeit")["meta"]["titel"] == "Die echte",
           str(ka.lade("Bachelorarbeit")["meta"]))
    e_weiter = ka.sichere("Bachelorarbeit",
                          {"meta": {"titel": "Fortschritt"}, "bloecke": []})
    pruefe("Weiterschreiben überschreibt dieselbe Arbeit wie bisher",
           not e_weiter["ausgewichen"]
           and ka.lade("Bachelorarbeit")["meta"]["titel"] == "Fortschritt",
           str(e_weiter))

    # ------------------------------------------------ Zwei Fenster
    e1 = fa.sichere("Zwei", {"meta": {"titel": "eins"}, "bloecke": []})
    pruefe("Sichern gibt den Änderungsstand zurück", e1.get("stand", 0) > 0, str(e1))
    _zeit.sleep(0.01)
    e2 = fa.sichere("Zwei", {"meta": {"titel": "zwei"}, "bloecke": []},
                    stand=e1["stand"])
    pruefe("Sichern mit aktuellem Stand geht durch",
           e2["stand"] >= e1["stand"], str(e2))
    _zeit.sleep(0.01)
    veraltet = False
    try:
        fa.sichere("Zwei", {"meta": {"titel": "drei"}, "bloecke": []},
                   stand=e1["stand"])
    except ablage_modul.VeralteterStand:
        veraltet = True
    pruefe("Sichern mit veraltetem Stand wird abgewiesen (409)", veraltet)
    pruefe("der abgewiesene Stand hat nichts überschrieben",
           fa.lade("Zwei")["meta"]["titel"] == "zwei",
           fa.lade("Zwei")["meta"]["titel"])
    shutil.rmtree(f_lager, ignore_errors=True)

    # Kein Ausbruch aus dem Bildordner
    geheim = os.path.join(lager, "geheim.txt")
    open(geheim, "w").write("streng geheim")
    a.sichere("Boes", {"meta": {"titel": "B"}, "bloecke": [
        {"id": "x", "typ": "abbildung", "datenUrl": "bild:../../geheim.txt"}]})
    b = a.lade("Boes")
    pruefe("ein Pfad aus dem Ordner heraus wird abgewiesen",
           b["bloecke"][0]["datenUrl"] == "", b["bloecke"][0]["datenUrl"][:60])

    shutil.rmtree(lager, ignore_errors=True)

    # ------------------------------------------------ GitHub-Sicherung
    # Kein Netz in Prüfungen: die reinen Teile direkt, die Abläufe gegen
    # eine untergeschobene API.
    from begleiter import github as github_modul

    pruefe("GitHub: Repo-Name aus dem Projektnamen",
           github_modul.repo_name("Bachelorarbeit Müller (2. Fassung)")
           == "schreibtisch-bachelorarbeit-mueller-2-fassung",
           github_modul.repo_name("Bachelorarbeit Müller (2. Fassung)"))
    pruefe("GitHub: leerer Projektname fällt sauber zurück",
           github_modul.repo_name("!!!") == "schreibtisch-arbeit",
           github_modul.repo_name("!!!"))

    g_lager = tempfile.mkdtemp(prefix="schreibtisch-github-")
    ga = ablage_modul.Ablage(os.path.join(g_lager, "Arbeiten"))
    ga.sichere("Meine Arbeit", {"meta": {"titel": "T"}, "bloecke": [
        {"id": "b1", "typ": "abbildung", "titel": "S",
         "datenUrl": "data:image/png;base64," + PNG}]})
    ga.sichere("Meine Arbeit", {"meta": {"titel": "T2"}, "bloecke": [
        {"id": "b1", "typ": "abbildung", "titel": "S",
         "datenUrl": "data:image/png;base64," + PNG}]})
    dateien = github_modul.sammle_dateien(os.path.join(g_lager, "Arbeiten"),
                                          "Meine Arbeit")
    pruefe("GitHub: Projektdatei, Bild und LIESMICH eingesammelt",
           "Meine Arbeit.json" in dateien and "LIESMICH.md" in dateien
           and any(p.startswith("Meine Arbeit.bilder/") for p in dateien),
           str(sorted(dateien)))
    pruefe("GitHub: Sicherungen bleiben draußen",
           not any(".sicherungen" in p for p in dateien), str(sorted(dateien)))
    fehlt = False
    try:
        github_modul.sammle_dateien(os.path.join(g_lager, "Arbeiten"), "Gibtsnicht")
    except github_modul.GithubFehler as f:
        fehlt = "Strg+S" in str(f)
    pruefe("GitHub: unbekannte Arbeit gibt einen Rat statt Traceback", fehlt)
    shutil.rmtree(g_lager, ignore_errors=True)

    # ---- Gerätecode-Antworten
    echt_formular = github_modul._formular
    antworten = {}
    github_modul._formular = lambda url, felder: dict(antworten)
    try:
        antworten = {"error": "authorization_pending"}
        pruefe("GitHub: authorization_pending heißt warten",
               github_modul.geraetetoken("id", "code").get("wartet") is True)
        antworten = {"error": "slow_down", "interval": 12}
        pruefe("GitHub: slow_down bringt die neue Pause mit",
               github_modul.geraetetoken("id", "code").get("pause") == 12)
        antworten = {"access_token": "gho_x"}
        pruefe("GitHub: fertige Anmeldung liefert den Schlüssel",
               github_modul.geraetetoken("id", "code").get("token") == "gho_x")
        abgelaufen = False
        try:
            antworten = {"error": "expired_token"}
            github_modul.geraetetoken("id", "code")
        except github_modul.GithubFehler as f:
            abgelaufen = "abgelaufen" in str(f)
        pruefe("GitHub: abgelaufener Code sagt es auf Deutsch", abgelaufen)
    finally:
        github_modul._formular = echt_formular

    # ---- Sichern: Reihenfolge Blob -> Baum -> Commit -> Zweig
    echt_api = github_modul._api
    aufrufe = []

    def falsche_api(methode, pfad, token, daten=None, darf_fehlen=False):
        aufrufe.append((methode, pfad))
        if pfad == "/repos/wer/schreibtisch-x":
            return {"private": True, "default_branch": "main",
                    "html_url": "https://github.com/wer/schreibtisch-x"}
        if pfad.endswith("/git/ref/heads/main"):
            return {"object": {"sha": "alt"}}
        if pfad.endswith("/git/blobs"):
            return {"sha": "blob" + str(len(aufrufe))}
        if pfad.endswith("/git/trees"):
            falsche_api.baum = daten["tree"]
            return {"sha": "baum"}
        if pfad.endswith("/git/commits"):
            falsche_api.commit = daten
            return {"sha": "abcdef1234"}
        if pfad.endswith("/git/refs/heads/main"):
            falsche_api.ref = daten
            return {}
        raise AssertionError("unerwarteter Aufruf: " + methode + " " + pfad)

    github_modul._api = falsche_api
    try:
        e = github_modul.sichere("t", "wer", "schreibtisch-x",
                                 {"a.json": b"{}", "b.bilder/c.png": b"\x89"},
                                 "Sicherung")
        pruefe("GitHub: Sichern baut Blob, Baum, Commit und setzt den Zweig",
               e["repo"] == "wer/schreibtisch-x" and e["commit"] == "abcdef1"
               and falsche_api.commit["parents"] == ["alt"]
               and falsche_api.ref == {"sha": "abcdef1234", "force": False},
               str(aufrufe))
        pruefe("GitHub: der Baum spiegelt genau die Dateien",
               sorted(x["path"] for x in falsche_api.baum)
               == ["a.json", "b.bilder/c.png"], str(falsche_api.baum))

        def oeffentliche_api(methode, pfad, token, daten=None, darf_fehlen=False):
            return {"private": False, "default_branch": "main"}
        github_modul._api = oeffentliche_api
        verweigert = False
        try:
            github_modul.sichere("t", "wer", "x", {"a": b""}, "n")
        except github_modul.GithubFehler as f:
            verweigert = "öffentlich" in str(f)
        pruefe("GitHub: in ein öffentliches Repository wird nicht gesichert",
               verweigert)
    finally:
        github_modul._api = echt_api


def main():
    print("\nBegleiterprüfung\n")

    werkzeuge = uebersetzen_modul.pruefe_werkzeuge()
    if werkzeuge["vollstaendig"]:
        pruefe("pdflatex und biber gefunden", True)
        pruefe_mit_latex()
    else:
        print("  ⚠ pdflatex/biber fehlen — die Übersetzungsläufe entfallen.\n"
              f"    Gefunden: {werkzeuge['programme']}\n")
    pruefe_ohne_latex()


    print(f"\n  {len(BESTANDEN)} bestanden, {len(DURCHGEFALLEN)} durchgefallen")
    if DURCHGEFALLEN:
        print("  Durchgefallen: " + ", ".join(DURCHGEFALLEN))
        sys.exit(1)


if __name__ == "__main__":
    main()
