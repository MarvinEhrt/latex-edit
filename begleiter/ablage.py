"""Projekte und Einstellungen auf der Festplatte.

Ein Projekt ist eine JSON-Datei. Bilder liegen daneben, in einem Ordner
"<Projekt>.bilder", und in der JSON steht nur "bild:<pruefsumme>.png".

Der Grund ist die Größe: ein Bildschirmfoto wiegt als Base64-Text rund
ein Drittel mehr als als Datei auf der Platte, eine Arbeit mit zwei Dutzend Abbildungen
kommt so auf zweistellige Megabytes. Da alle vier Sekunden gesichert und
vor jedem Überschreiben eine Sicherung angelegt wird, wären das schnell
Hunderte Megabytes für ein Dokument, dessen Text ein paar hundert
Kilobyte hat. Über die Prüfsumme teilen sich außerdem alle Sicherungen
dieselbe Bilddatei -- zwanzig Sicherungen kosten das Bild einmal.

Nach außen bleibt alles beim Alten: `lade` gibt dieselben Datenverweise
zurück, die `sichere` bekommen hat.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shutil
import time

_UNERLAUBT = re.compile(r'[<>:"/\\|?*\x00-\x1f]')

# "data:image/png;base64,iVBOR..."
_DATENVERWEIS = re.compile(r"^data:image/([a-zA-Z0-9.+-]+);base64,(.*)$", re.S)
# So heißt eine ausgelagerte Bilddatei -- streng, damit "bild:../../etc"
# nicht aus dem Ordner herausführen kann.
_BILDNAME = re.compile(r"^[0-9a-f]{20}\.[a-z0-9]{1,5}$")

_ENDUNGEN = {"jpeg": "jpg", "svg+xml": "svg"}

# Rest eines Sicherungsnamens hinter "<Projekt>-": Zeitmarke plus
# optionalem Buchstaben, falls zwei Sicherungen in dieselbe Sekunde
# fallen. Streng, damit nichts anderes als Sicherung durchgeht.
_SICHERUNGSREST = re.compile(r"^(\d{8})-(\d{6})([a-z]?)\.json$")


class VeralteterStand(Exception):
    """Auf der Platte liegt ein neuerer Stand als der, den das
    sichernde Fenster zuletzt gesehen hat -- ein zweites Fenster war
    schneller. Wer fängt, antwortet mit 409."""


def sauberer_name(roh: str, ersatz: str = "Arbeit") -> str:
    """Dateiname, der unter Windows und Linux gleichermaßen zulässig ist."""
    name = _UNERLAUBT.sub("-", (roh or "").strip())
    name = re.sub(r"\s+", " ", name).strip(" .")
    # Unter Windows belegte Gerätenamen
    if name.upper().split(".")[0] in {
            "CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)),
            *(f"LPT{i}" for i in range(1, 10))}:
        name = "_" + name
    return (name or ersatz)[:80]


class Ablage:
    def __init__(self, wurzel: str):
        self.wurzel = wurzel
        os.makedirs(self.wurzel, exist_ok=True)
        self.einstellungsdatei = os.path.join(
            os.path.dirname(self.wurzel), "einstellungen.json")

    # ------------------------------------------------------------- Projekte

    def _pfad(self, name: str) -> str:
        return os.path.join(self.wurzel, sauberer_name(name) + ".json")

    def _bildordner(self, name: str) -> str:
        return os.path.join(self.wurzel, sauberer_name(name) + ".bilder")

    # ------------------------------------------------------------- Bilder

    @staticmethod
    def _bloecke(dokument: dict) -> list:
        return [b for b in (dokument.get("bloecke") or []) if isinstance(b, dict)]

    def _lagere_bilder_aus(self, name: str, dokument: dict) -> dict:
        """Datenverweise raus, Dateien daneben. Gibt eine flache Kopie
        zurück; das übergebene Dokument bleibt unangetastet, denn es
        gehört der Oberfläche und wird dort weiterbenutzt."""
        bloecke = self._bloecke(dokument)
        if not any(_DATENVERWEIS.match(str(b.get("datenUrl") or "")) for b in bloecke):
            return dokument

        ordner = self._bildordner(name)
        os.makedirs(ordner, exist_ok=True)
        neue = []
        for b in dokument.get("bloecke") or []:
            treffer = _DATENVERWEIS.match(str(b.get("datenUrl") or "")) \
                if isinstance(b, dict) else None
            if not treffer:
                neue.append(b)
                continue
            art, roh = treffer.group(1).lower(), treffer.group(2)
            try:
                bytes_ = base64.b64decode(roh, validate=False)
            except Exception:
                neue.append(b)            # unlesbar -> lieber so lassen
                continue
            endung = _ENDUNGEN.get(art, art)
            if not re.fullmatch(r"[a-z0-9]{1,5}", endung):
                endung = "png"
            dateiname = hashlib.sha256(bytes_).hexdigest()[:20] + "." + endung
            ziel = os.path.join(ordner, dateiname)
            if not os.path.exists(ziel):
                vorlaeufig = ziel + ".neu"
                with open(vorlaeufig, "wb") as f:
                    f.write(bytes_)
                os.replace(vorlaeufig, ziel)
            kopie = dict(b)
            kopie["datenUrl"] = "bild:" + dateiname
            neue.append(kopie)

        schlank = dict(dokument)
        schlank["bloecke"] = neue
        return schlank

    def _hole_bilder_zurueck(self, name: str, dokument: dict) -> dict:
        ordner = self._bildordner(name)
        for b in self._bloecke(dokument):
            wert = str(b.get("datenUrl") or "")
            if not wert.startswith("bild:"):
                continue
            dateiname = wert[5:]
            if not _BILDNAME.match(dateiname):
                b["datenUrl"] = ""
                continue
            try:
                with open(os.path.join(ordner, dateiname), "rb") as f:
                    roh = f.read()
            except OSError:
                # Bilddatei weg -- der Baustein bleibt, damit die Bild-
                # unterschrift nicht verlorengeht, und die Oberfläche
                # meldet die leere Abbildung.
                b["datenUrl"] = ""
                continue
            endung = dateiname.rsplit(".", 1)[-1]
            art = "jpeg" if endung == "jpg" else endung
            b["datenUrl"] = ("data:image/" + art + ";base64,"
                             + base64.b64encode(roh).decode("ascii"))
        return dokument

    def _raeume_bilder(self, name: str):
        """Bilddateien wegwerfen, auf die weder das Projekt noch eine
        seiner Sicherungen zeigt. Sonst wächst der Ordner mit jedem
        ausgetauschten Bildschirmfoto weiter."""
        ordner = self._bildordner(name)
        if not os.path.isdir(ordner):
            return
        rein = sauberer_name(name)
        texte = [self._pfad(name)]
        sicherung = os.path.join(self.wurzel, ".sicherungen")
        if os.path.isdir(sicherung):
            texte += [os.path.join(sicherung, d) for d in os.listdir(sicherung)
                      if d.startswith(rein) and d.endswith(".json")]
        genutzt = set()
        for pfad in texte:
            try:
                with open(pfad, encoding="utf-8") as f:
                    genutzt.update(re.findall(r'"bild:([^"]+)"', f.read()))
            except OSError:
                pass
        for datei in os.listdir(ordner):
            if datei not in genutzt:
                try:
                    os.remove(os.path.join(ordner, datei))
                except OSError:
                    pass

    def liste(self) -> list[dict]:
        raus = []
        for eintrag in sorted(os.listdir(self.wurzel)):
            if not eintrag.endswith(".json"):
                continue
            voll = os.path.join(self.wurzel, eintrag)
            try:
                with open(voll, encoding="utf-8") as f:
                    dok = json.load(f)
                titel = (dok.get("meta") or {}).get("titel") or eintrag[:-5]
            except Exception:
                titel = eintrag[:-5] + "  (nicht lesbar)"
            raus.append({
                "name": eintrag[:-5],
                "titel": titel,
                "geaendert": os.path.getmtime(voll),
                # Die Bilder daneben gehören zum Gewicht des Projekts dazu.
                "bytes": os.path.getsize(voll) + self._bildergroesse(eintrag[:-5]),
            })
        raus.sort(key=lambda x: -x["geaendert"])
        return raus

    def _bildergroesse(self, name: str) -> int:
        ordner = self._bildordner(name)
        if not os.path.isdir(ordner):
            return 0
        return sum(os.path.getsize(os.path.join(ordner, d))
                   for d in os.listdir(ordner))

    def lade(self, name: str) -> dict:
        with open(self._pfad(name), encoding="utf-8") as f:
            return self._hole_bilder_zurueck(name, json.load(f))

    def stand(self, name: str) -> float:
        """Änderungsstand (mtime) der Projektdatei -- der Schlüssel des
        Zwei-Fenster-Schutzes: die Oberfläche merkt ihn sich beim Laden
        und schickt ihn beim Sichern zurück."""
        try:
            return os.path.getmtime(self._pfad(name))
        except OSError:
            return 0.0

    def sichere(self, name: str, dokument: dict,
                stand: float | None = None) -> dict:
        pfad = self._pfad(name)
        # Zwei-Fenster-Schutz: kennt das Fenster nur einen älteren Stand
        # als den auf der Platte, hat ein anderes Fenster dazwischen
        # gesichert -- wortlos überschreiben wäre Datenverlust.
        if (stand is not None and os.path.exists(pfad)
                and os.path.getmtime(pfad) - float(stand) > 0.0005):
            raise VeralteterStand(
                "Diese Arbeit wurde in einem anderen Fenster geändert.")
        # Vor dem Überschreiben eine Sicherung behalten -- eine Abschlussarbeit
        # ist nichts, was man wegen eines Absturzes verlieren möchte.
        if os.path.exists(pfad):
            sicherung = os.path.join(self.wurzel, ".sicherungen")
            os.makedirs(sicherung, exist_ok=True)
            basis = os.path.join(
                sicherung, f"{sauberer_name(name)}-{time.strftime('%Y%m%d-%H%M%S')}")
            # Zwei Sicherungen in derselben Sekunde: Buchstaben anhängen,
            # sonst überschriebe die zweite die erste und die Aufräumlogik
            # zählte falsch.
            ziel, buchstabe = basis + ".json", "b"
            while os.path.exists(ziel):
                ziel = basis + buchstabe + ".json"
                buchstabe = chr(ord(buchstabe) + 1)
            shutil.copy2(pfad, ziel)
            self._raeume_sicherungen(sicherung, sauberer_name(name))
        schlank = self._lagere_bilder_aus(name, dokument)
        vorlaeufig = pfad + ".neu"
        with open(vorlaeufig, "w", encoding="utf-8") as f:
            json.dump(schlank, f, ensure_ascii=False, indent=1)
        os.replace(vorlaeufig, pfad)     # atomar, kein halb geschriebenes Projekt
        self._raeume_bilder(name)
        return {"name": sauberer_name(name), "bytes": os.path.getsize(pfad),
                "stand": os.path.getmtime(pfad)}

    # ------------------------------------------------------- Sicherungen

    def sicherungen(self, name: str) -> list[dict]:
        """Frühere Fassungen eines Projekts, neueste zuerst."""
        rein = sauberer_name(name)
        ordner = os.path.join(self.wurzel, ".sicherungen")
        raus = []
        if not os.path.isdir(ordner):
            return raus
        # Neueste zuerst -- nach mtime, aus demselben Grund wie beim
        # Aufräumen: die Namensordnung kann täuschen.
        def mzeit(d):
            try:
                return os.path.getmtime(os.path.join(ordner, d))
            except OSError:
                return 0
        for datei in sorted(os.listdir(ordner), key=mzeit, reverse=True):
            if not datei.startswith(rein + "-"):
                continue
            t = _SICHERUNGSREST.match(datei[len(rein) + 1:])
            if not t:
                continue
            voll = os.path.join(ordner, datei)
            try:
                with open(voll, encoding="utf-8") as f:
                    titel = (json.load(f).get("meta") or {}).get("titel") or rein
            except Exception:
                titel = rein + "  (nicht lesbar)"
            try:
                zeit = time.mktime(time.strptime(
                    t.group(1) + t.group(2), "%Y%m%d%H%M%S"))
            except ValueError:
                zeit = 0
            raus.append({"datei": datei, "zeit": zeit, "titel": titel,
                         "bytes": os.path.getsize(voll)})
        return raus

    def lade_sicherung(self, name: str, datei: str) -> dict:
        """Eine frühere Fassung laden. `datei` wird strikt gegen das
        eigene Listing geprüft -- kein Pfadausbruch, so wie _BILDNAME
        es für Bilddateien hält."""
        if datei not in {e["datei"] for e in self.sicherungen(name)}:
            raise FileNotFoundError(datei)
        voll = os.path.join(self.wurzel, ".sicherungen", datei)
        with open(voll, encoding="utf-8") as f:
            # Die Sicherung nennt "bild:"-Dateien im Ordner des Projekts;
            # _raeume_bilder löscht nur, was KEINE Sicherung mehr nennt --
            # das Zurückholen funktioniert also unverändert.
            return self._hole_bilder_zurueck(name, json.load(f))

    @staticmethod
    def _raeume_sicherungen(ordner: str, praefix: str, behalten: int = 20):
        # Nach mtime, nicht nach Namen: copy2 übernimmt die Änderungszeit
        # der Projektdatei, und die wächst streng -- Dateinamen dagegen
        # können nach dem Aufräumen wieder frei werden und die
        # Namensordnung durcheinanderbringen.
        def mzeit(d):
            try:
                return os.path.getmtime(os.path.join(ordner, d))
            except OSError:
                return 0
        eigene = sorted((d for d in os.listdir(ordner) if d.startswith(praefix)),
                        key=mzeit)
        for alt in eigene[:-behalten]:
            try:
                os.remove(os.path.join(ordner, alt))
            except OSError:
                pass

    def loesche(self, name: str):
        pfad = self._pfad(name)
        if os.path.exists(pfad):
            os.remove(pfad)
        # Die Bilder bleiben, solange eine Sicherung sie noch braucht.
        self._raeume_bilder(name)
        ordner = self._bildordner(name)
        if os.path.isdir(ordner) and not os.listdir(ordner):
            os.rmdir(ordner)

    # -------------------------------------------------------- Einstellungen

    def einstellungen(self) -> dict:
        try:
            with open(self.einstellungsdatei, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return {}

    def setze_einstellungen(self, werte: dict) -> dict:
        alt = self.einstellungen()
        alt.update(werte)
        with open(self.einstellungsdatei, "w", encoding="utf-8") as f:
            json.dump(alt, f, ensure_ascii=False, indent=1)
        return alt
