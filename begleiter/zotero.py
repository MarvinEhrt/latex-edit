"""Zotero-Bibliothek über die Web-API holen und auf unsere Quelltypen abbilden.

Der Weg führt bewusst über den Begleiter und nicht über den Browser: so
bleibt der API-Schlüssel in einer Datei auf der Festplatte statt im
Browserspeicher, und CORS ist kein Thema.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request

BASIS = "https://api.zotero.org"
SEITENGROESSE = 100
OBERGRENZE = 5000          # Schutz vor endlosem Blättern


class ZoteroFehler(Exception):
    pass


def _hole(pfad: str, schluessel: str, felder: dict | None = None) -> tuple[list, dict]:
    url = BASIS + pfad
    if felder:
        url += "?" + urllib.parse.urlencode(felder)
    anfrage = urllib.request.Request(url, headers={
        "Zotero-API-Key": schluessel,
        "Zotero-API-Version": "3",
        "User-Agent": "Schreibtisch/1.0",
    })
    try:
        with urllib.request.urlopen(anfrage, timeout=30) as antwort:
            roh = antwort.read().decode("utf-8")
            return json.loads(roh), dict(antwort.headers)
    except urllib.error.HTTPError as f:
        if f.code == 403:
            raise ZoteroFehler(
                "Zotero lehnt den Schlüssel ab. Prüfe ihn in den Einstellungen "
                "— und ob er Leserechte auf die Bibliothek hat.") from f
        if f.code == 404:
            raise ZoteroFehler(
                "Diese Bibliothek gibt es nicht. Stimmt die Benutzer- oder "
                "Gruppennummer?") from f
        raise ZoteroFehler(f"Zotero antwortet mit Fehler {f.code}.") from f
    except urllib.error.URLError as f:
        raise ZoteroFehler(
            "Keine Verbindung zu Zotero. Besteht eine Internetverbindung?") from f


def pruefe_schluessel(schluessel: str) -> dict:
    """Aus dem Schlüssel die Benutzernummer ableiten — dann muss sie nur
    den Schlüssel eintragen und nichts weiter nachschlagen."""
    daten, _ = _hole(f"/keys/{urllib.parse.quote(schluessel)}", schluessel)
    if not isinstance(daten, dict) or "userID" not in daten:
        raise ZoteroFehler("Der Schlüssel sieht nicht wie ein Zotero-Schlüssel aus.")
    zugriff = daten.get("access", {}) or {}
    gruppen = []
    for nummer, rechte in (zugriff.get("groups") or {}).items():
        if rechte.get("library"):
            gruppen.append(str(nummer))
    return {
        "benutzer": str(daten["userID"]),
        "name": daten.get("username", ""),
        "gruppen": gruppen,
    }


def _jahr(text: str) -> str:
    t = re.search(r"(1[5-9]\d{2}|20\d{2}|21\d{2})", str(text or ""))
    return t.group(1) if t else ""


def _personen(schoepfer: list, art: str) -> str:
    raus = []
    for p in schoepfer or []:
        if p.get("creatorType") != art:
            continue
        if p.get("name"):                      # Institution, einteilig
            raus.append(p["name"].strip())
        else:
            nach = (p.get("lastName") or "").strip()
            vor = (p.get("firstName") or "").strip()
            raus.append(f"{nach}, {vor}" if vor else nach)
    return "; ".join(x for x in raus if x)


# Zotero-Typ -> unser Quelltyp
_TYPEN = {
    "book": "buch",
    "journalArticle": "artikel",
    "magazineArticle": "artikel",
    "newspaperArticle": "artikel",
    "bookSection": "kapitel",
    "conferencePaper": "kapitel",
    "webpage": "online",
    "blogPost": "online",
    "report": "bericht",
    "thesis": "bericht",
    "manuscript": "bericht",
    "document": "bericht",
}


def _schluesselvorschlag(felder: dict, vergeben: set) -> str:
    nach = (felder.get("autoren", "").split(";")[0].split(",")[0]).strip().lower()
    nach = (nach.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")
                .replace("ß", "ss"))
    nach = re.sub(r"[^a-z]", "", nach) or "quelle"
    grund = nach + (felder.get("jahr") or "oj")
    k, i = grund, 1
    while k in vergeben:
        i += 1
        k = grund + chr(96 + i)
    vergeben.add(k)
    return k


def _umbauen(eintrag: dict, vergeben: set) -> dict | None:
    d = eintrag.get("data") or {}
    typ_roh = d.get("itemType", "")
    if typ_roh in ("attachment", "note", "annotation"):
        return None
    typ = _TYPEN.get(typ_roh, "buch")
    schoepfer = d.get("creators") or []

    felder = {
        "autoren": _personen(schoepfer, "author") or _personen(schoepfer, "editor"),
        "jahr": _jahr(d.get("date", "")),
        "titel": (d.get("title") or "").strip(),
    }
    zusatz = {
        "artikel": {"zeitschrift": d.get("publicationTitle"),
                    "jahrgang": d.get("volume"), "heft": d.get("issue"),
                    "seiten": d.get("pages"), "doi": d.get("DOI")},
        "kapitel": {"herausgeber": _personen(schoepfer, "editor"),
                    "buchtitel": d.get("bookTitle") or d.get("proceedingsTitle"),
                    "seiten": d.get("pages"), "verlag": d.get("publisher"),
                    "auflage": d.get("edition")},
        "online": {"webseite": d.get("websiteTitle") or d.get("blogTitle"),
                   "url": d.get("url"), "abgerufen": (d.get("accessDate") or "")[:10]},
        "bericht": {"institution": d.get("institution") or d.get("university")
                    or d.get("publisher"), "nummer": d.get("reportNumber"),
                    "url": d.get("url")},
        "buch": {"verlag": d.get("publisher"), "auflage": d.get("edition"),
                 "doi": d.get("DOI")},
    }.get(typ, {})
    for k, v in zusatz.items():
        if v:
            felder[k] = str(v).strip()

    if not felder["titel"]:
        return None
    return {
        "key": _schluesselvorschlag(felder, vergeben),
        "typ": typ,
        "felder": felder,
        "zoteroKey": eintrag.get("key", ""),
        "zoteroTyp": typ_roh,
    }


def bibliothek(schluessel: str, besitzer: str, art: str = "users",
               sammlung: str = "") -> list[dict]:
    """Alle Titel einer Bibliothek holen und umbauen."""
    pfad = f"/{art}/{urllib.parse.quote(besitzer)}"
    pfad += f"/collections/{urllib.parse.quote(sammlung)}/items" if sammlung else "/items"

    quellen, vergeben, start = [], set(), 0
    while start < OBERGRENZE:
        seite, _ = _hole(pfad, schluessel, {
            "format": "json", "limit": SEITENGROESSE, "start": start,
            "itemType": "-attachment || note"})
        if not seite:
            break
        for eintrag in seite:
            q = _umbauen(eintrag, vergeben)
            if q:
                quellen.append(q)
        if len(seite) < SEITENGROESSE:
            break
        start += SEITENGROESSE
    return quellen


def sammlungen(schluessel: str, besitzer: str, art: str = "users") -> list[dict]:
    daten, _ = _hole(f"/{art}/{urllib.parse.quote(besitzer)}/collections",
                     schluessel, {"format": "json", "limit": 100})
    return [{"key": e.get("key", ""),
             "name": (e.get("data") or {}).get("name", "")}
            for e in daten or []]
