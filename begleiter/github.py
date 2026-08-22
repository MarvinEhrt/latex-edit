"""Arbeiten in ein privates Repository auf GitHub sichern.

Zwei Wege in die Anmeldung, beide über den Begleiter und nie über den
Browser -- der Zugang liegt wie der Zotero-Schlüssel in einer Datei
neben dem Programm:

  * Gerätecode (Device Flow): der Schreibtisch zeigt einen kurzen Code,
    der auf github.com/login/device eingetippt wird. Braucht einmalig
    eine eigene, kostenlose OAuth-App, deren Client-ID hier eingetragen
    wird -- eine Geheimnummer braucht der Gerätecode-Fluss nicht, die
    Client-ID darf öffentlich sein.
  * Zugangsschlüssel (Personal Access Token) einfügen.

Gesichert wird je Arbeit ein privates Repository: jede Sicherung ist ein
Commit, dessen Baum den aktuellen Stand spiegelt. Gelöschte Bilder
verschwinden also aus der Ansicht, bleiben aber -- wie jede frühere
Fassung -- in der Historie.

Die reinen Funktionen (repo_name, Dateien einsammeln) sind vom Netz
getrennt, damit die Prüfungen sie ohne Verbindung füttern können.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.parse
import urllib.request
import re

# Überschreibbar wie SCHREIBTISCH_ARBEITEN: die Prüfungen stellen einen
# eigenen kleinen "GitHub"-Dienst auf 127.0.0.1 und reden mit dem.
API = os.environ.get("SCHREIBTISCH_GITHUB_API") or "https://api.github.com"
GITHUB = os.environ.get("SCHREIBTISCH_GITHUB") or "https://github.com"


class GithubFehler(Exception):
    pass


# ------------------------------------------------------------- rein

def repo_name(projektname: str) -> str:
    """Projektname -> zulässiger Repository-Name, z. B.
    "Bachelorarbeit Müller" -> "schreibtisch-bachelorarbeit-mueller"."""
    n = str(projektname or "").strip().lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        n = n.replace(a, b)
    n = re.sub(r"[^a-z0-9]+", "-", n).strip("-")
    return ("schreibtisch-" + (n or "arbeit"))[:90].rstrip("-")


def sammle_dateien(wurzel: str, name: str) -> dict[str, bytes]:
    """Projektdatei und Bilder als {pfad_im_repo: bytes}. Sicherungen
    (.sicherungen) bleiben draußen -- die Historie übernimmt GitHub."""
    from begleiter import ablage
    rein = ablage.sauberer_name(name)
    pfad = os.path.join(wurzel, rein + ".json")
    if not os.path.exists(pfad):
        raise GithubFehler("Diese Arbeit liegt noch nicht auf der Platte — "
                           "bitte zuerst sichern (Strg+S).")
    dateien: dict[str, bytes] = {}
    with open(pfad, "rb") as f:
        dateien[rein + ".json"] = f.read()
    ordner = os.path.join(wurzel, rein + ".bilder")
    if os.path.isdir(ordner):
        for d in sorted(os.listdir(ordner)):
            voll = os.path.join(ordner, d)
            if os.path.isfile(voll):
                with open(voll, "rb") as f:
                    dateien[rein + ".bilder/" + d] = f.read()
    dateien["LIESMICH.md"] = (
        "# " + rein + "\n\n"
        "Sicherung aus dem **Schreibtisch**. Jede Sicherung ist ein Commit;\n"
        "frühere Fassungen stehen in der Historie. Zum Weiterarbeiten die\n"
        "Datei `" + rein + ".json` (samt Ordner `" + rein + ".bilder`) in den\n"
        "Ordner `Arbeiten/` neben dem Programm legen.\n").encode("utf-8")
    return dateien


# ------------------------------------------------------------- Netz

def _lies_json(antwort) -> dict:
    try:
        daten = json.loads(antwort.read().decode("utf-8"))
        return daten if isinstance(daten, dict) else {}
    except ValueError:
        return {}


def _formular(url: str, felder: dict) -> dict:
    """POST als Formular an github.com (Anmeldefluss). Fehler kommen dort
    als 200 mit {"error": ...} -- die Antwort wird roh zurückgegeben."""
    anfrage = urllib.request.Request(
        url, data=urllib.parse.urlencode(felder).encode("ascii"),
        headers={"Accept": "application/json", "User-Agent": "Schreibtisch/1.0"})
    try:
        with urllib.request.urlopen(anfrage, timeout=30) as a:
            return _lies_json(a)
    except urllib.error.HTTPError as f:
        daten = _lies_json(f)
        if daten:
            return daten
        raise GithubFehler(f"GitHub antwortet mit Fehler {f.code}.") from f
    except urllib.error.URLError as f:
        raise GithubFehler(
            "Keine Verbindung zu GitHub. Besteht eine Internetverbindung?") from f


def _api(methode: str, pfad: str, token: str, daten: dict | None = None,
         darf_fehlen: bool = False) -> dict | None:
    anfrage = urllib.request.Request(
        API + pfad,
        data=json.dumps(daten).encode("utf-8") if daten is not None else None,
        method=methode,
        headers={"Accept": "application/vnd.github+json",
                 "Authorization": "Bearer " + token,
                 "X-GitHub-Api-Version": "2022-11-28",
                 "User-Agent": "Schreibtisch/1.0",
                 "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(anfrage, timeout=60) as a:
            return _lies_json(a)
    except urllib.error.HTTPError as f:
        if f.code == 404 and darf_fehlen:
            return None
        meldung = str(_lies_json(f).get("message") or "")
        if f.code == 401:
            raise GithubFehler("GitHub lehnt die Anmeldung ab — bitte in den "
                               "Einstellungen neu verbinden.") from f
        if f.code == 403 and "rate limit" in meldung.lower():
            raise GithubFehler("GitHub bremst gerade (Rate Limit) — bitte in "
                               "ein paar Minuten noch einmal.") from f
        if f.code == 403:
            raise GithubFehler("GitHub verweigert den Zugriff"
                               + (f": {meldung}" if meldung else ".")
                               + " Hat der Zugang das Recht „repo“?") from f
        if f.code == 409:
            raise GithubFehler("Das Repository ist leer und lässt sich so "
                               "nicht befüllen — bitte auf github.com löschen, "
                               "dann lege ich es selbst neu an.") from f
        raise GithubFehler(f"GitHub antwortet mit Fehler {f.code}"
                           + (f": {meldung}" if meldung else ".")) from f
    except urllib.error.URLError as f:
        raise GithubFehler(
            "Keine Verbindung zu GitHub. Besteht eine Internetverbindung?") from f


# ------------------------------------------------------- Anmeldung

def geraetecode(client_id: str) -> dict:
    """Gerätecode anfordern. Ergebnis fürs Anzeigen im Dialog."""
    client_id = str(client_id or "").strip()
    if not client_id:
        raise GithubFehler("Bitte zuerst die Client-ID der OAuth-App eintragen.")
    a = _formular(GITHUB + "/login/device/code",
                  {"client_id": client_id, "scope": "repo"})
    if not a.get("device_code"):
        raise GithubFehler(str(a.get("error_description")
                               or "GitHub kennt diese Client-ID nicht."))
    return {"code": a.get("user_code", ""),
            "geraetecode": a["device_code"],
            "adresse": a.get("verification_uri") or GITHUB + "/login/device",
            "pause": int(a.get("interval") or 5),
            "gueltig": int(a.get("expires_in") or 900)}


def geraetetoken(client_id: str, geraetecode_: str) -> dict:
    """Einmal nachfragen, ob die Anmeldung durch ist. Die Oberfläche ruft
    das im Abstand von `pause` Sekunden auf -- keine lange Anfrage, die
    den Begleiter blockiert."""
    a = _formular(GITHUB + "/login/oauth/access_token", {
        "client_id": str(client_id or "").strip(),
        "device_code": str(geraetecode_ or ""),
        "grant_type": "urn:ietf:params:oauth:grant-type:device_code"})
    if a.get("access_token"):
        return {"token": a["access_token"]}
    fehler = str(a.get("error") or "")
    if fehler == "authorization_pending":
        return {"wartet": True}
    if fehler == "slow_down":
        return {"wartet": True, "pause": int(a.get("interval") or 10)}
    if fehler == "expired_token":
        raise GithubFehler("Der Code ist abgelaufen — bitte noch einmal anmelden.")
    if fehler == "access_denied":
        raise GithubFehler("Die Anmeldung wurde auf github.com abgelehnt.")
    raise GithubFehler(str(a.get("error_description")
                           or f"GitHub meldet: {fehler or 'unbekannter Fehler'}."))


def wer(token: str) -> dict:
    """Zugang prüfen und den Anmeldenamen holen."""
    token = str(token or "").strip()
    if not token:
        raise GithubFehler("Bitte zuerst einen Zugangsschlüssel eintragen.")
    a = _api("GET", "/user", token)
    if not a.get("login"):
        raise GithubFehler("Das sieht nicht nach einem GitHub-Zugang aus.")
    return {"benutzer": a["login"], "name": a.get("name") or a["login"]}


# ------------------------------------------------------- Sichern

def sichere(token: str, besitzer: str, repo: str,
            dateien: dict[str, bytes], nachricht: str) -> dict:
    """Einen Commit mit genau diesen Dateien auf den Hauptzweig setzen.
    Fehlt das Repository, wird es privat angelegt."""
    if not dateien:
        raise GithubFehler("Nichts zu sichern.")
    voll = f"/repos/{urllib.parse.quote(besitzer)}/{urllib.parse.quote(repo)}"
    info = _api("GET", voll, token, darf_fehlen=True)
    if info is None:
        # auto_init: die Git-API kann ein völlig leeres Repository nicht
        # befüllen -- der Erst-Commit von GitHub schafft den Zweig, auf
        # den wir gleich unseren eigenen setzen.
        info = _api("POST", "/user/repos", token, {
            "name": repo, "private": True, "auto_init": True,
            "description": "Sicherung aus dem Schreibtisch"})
    if not info.get("private", True):
        raise GithubFehler(f"Das Repository {repo} ist öffentlich — eine "
                           "Arbeit sichere ich nur in ein privates.")
    zweig = info.get("default_branch") or "main"

    ref = _api("GET", voll + "/git/ref/heads/" + urllib.parse.quote(zweig),
               token, darf_fehlen=True)
    if not ref:
        raise GithubFehler("Das Repository ist leer und lässt sich so nicht "
                           "befüllen — bitte auf github.com löschen, dann "
                           "lege ich es selbst neu an.")
    eltern = ref["object"]["sha"]

    baum = []
    for pfad, inhalt in sorted(dateien.items()):
        blob = _api("POST", voll + "/git/blobs", token, {
            "content": base64.b64encode(inhalt).decode("ascii"),
            "encoding": "base64"})
        baum.append({"path": pfad, "mode": "100644",
                     "type": "blob", "sha": blob["sha"]})
    # Ohne base_tree: der Commit spiegelt genau den aktuellen Stand.
    baum_antwort = _api("POST", voll + "/git/trees", token, {"tree": baum})
    commit = _api("POST", voll + "/git/commits", token, {
        "message": nachricht, "tree": baum_antwort["sha"], "parents": [eltern]})
    _api("PATCH", voll + "/git/refs/heads/" + urllib.parse.quote(zweig),
         token, {"sha": commit["sha"], "force": False})
    return {"repo": f"{besitzer}/{repo}",
            "adresse": info.get("html_url") or f"{GITHUB}/{besitzer}/{repo}",
            "commit": commit["sha"][:7]}
