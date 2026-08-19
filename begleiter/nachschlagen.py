"""Quelle per DOI bei Crossref nachschlagen und auf unser Schema abbilden.

Wie bei Zotero läuft der Weg über den Begleiter, nicht über den
Browser -- kein CORS, ein Ort für Zeitgrenzen und Fehlertexte.

Die Abbildung (JSON -> felder) ist eine reine Funktion und vom
HTTP-Teil getrennt: die Prüfungen füttern sie mit einer eingecheckten
Crossref-Antwort, ohne Netz.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request

BASIS = "https://api.crossref.org/works/"


class NachschlagFehler(Exception):
    pass


# Crossref-Typ -> unser Quelltyp. Was wir nicht kennen, wird ein Buch --
# die Maske bleibt ohnehin editierbar.
_TYPEN = {
    "journal-article": "artikel",
    "proceedings-article": "kapitel",
    "book-chapter": "kapitel",
    "book": "buch",
    "monograph": "buch",
    "edited-book": "buch",
    "reference-book": "buch",
    "report": "bericht",
}


def _personen(liste: list | None) -> str:
    """author[]/editor[] -> "Nachname, Vorname; …". Institutionen kommen
    bei Crossref als {name}."""
    raus = []
    for p in liste or []:
        if p.get("name"):
            raus.append(str(p["name"]).strip())
            continue
        nach = str(p.get("family") or "").strip()
        vor = str(p.get("given") or "").strip()
        if not nach:
            continue
        raus.append(f"{nach}, {vor}" if vor else nach)
    return "; ".join(x for x in raus if x)


def _jahr(werk: dict) -> str:
    for feld in ("issued", "published-print", "published-online", "created"):
        teile = ((werk.get(feld) or {}).get("date-parts") or [[]])[0]
        if teile and teile[0]:
            return str(teile[0])
    return ""


def _erstes(wert) -> str:
    """Crossref liefert Titel als Liste mit einem Eintrag."""
    if isinstance(wert, list):
        return str(wert[0]).strip() if wert else ""
    return str(wert or "").strip()


def abbilden(antwort: dict) -> dict:
    """Crossref-Antwort -> {typ, felder} fürs Vorbefüllen der Maske.
    Reine Funktion, kein Netz."""
    werk = (antwort or {}).get("message")
    if not isinstance(werk, dict) or not (werk.get("title") or werk.get("DOI")):
        raise NachschlagFehler("Die Antwort von Crossref ist nicht lesbar.")

    typ = _TYPEN.get(str(werk.get("type") or ""), "buch")
    felder = {
        "autoren": _personen(werk.get("author")),
        "jahr": _jahr(werk),
        "titel": _erstes(werk.get("title")),
    }
    behaelter = _erstes(werk.get("container-title"))
    zusatz = {
        "artikel": {"zeitschrift": behaelter, "jahrgang": werk.get("volume"),
                    "heft": werk.get("issue"), "seiten": werk.get("page"),
                    "doi": werk.get("DOI")},
        "kapitel": {"herausgeber": _personen(werk.get("editor")),
                    "buchtitel": behaelter, "seiten": werk.get("page"),
                    "verlag": werk.get("publisher")},
        "buch":    {"verlag": werk.get("publisher"), "doi": werk.get("DOI")},
        "bericht": {"institution": werk.get("publisher"),
                    "url": werk.get("URL")},
    }[typ]
    for k, v in zusatz.items():
        if v:
            felder[k] = str(v).strip()
    return {"typ": typ, "felder": felder}


def per_doi(doi: str) -> dict:
    """DOI bei Crossref nachschlagen. Wirft NachschlagFehler mit einem
    Satz, der in den Dialog passt."""
    doi = str(doi or "").strip()
    # Wer den DOI als Link kopiert hat, meint denselben DOI.
    doi = re.sub(r"^(https?://)?(dx\.)?doi\.org/", "", doi, flags=re.I)
    if not doi:
        raise NachschlagFehler("Bitte zuerst einen DOI eintragen, "
                               "z. B. 10.1026/0932-4089/a000291.")
    anfrage = urllib.request.Request(
        BASIS + urllib.parse.quote(doi, safe=""),
        headers={"User-Agent": "Schreibtisch/1.0 "
                               "(LaTeX-Editor fuer Abschlussarbeiten)"})
    try:
        with urllib.request.urlopen(anfrage, timeout=10) as a:
            return abbilden(json.loads(a.read().decode("utf-8")))
    except urllib.error.HTTPError as f:
        if f.code == 404:
            raise NachschlagFehler(
                "Diesen DOI kennt Crossref nicht. Ist er richtig getippt?") from f
        raise NachschlagFehler(f"Crossref antwortet mit Fehler {f.code}.") from f
    except urllib.error.URLError as f:
        raise NachschlagFehler(
            "Keine Verbindung zu Crossref. Besteht eine Internetverbindung?") from f
    except ValueError as f:
        raise NachschlagFehler("Die Antwort von Crossref ist nicht lesbar.") from f
