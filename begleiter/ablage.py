"""Projekte und Einstellungen auf der Festplatte.

Ein Projekt ist eine einzige JSON-Datei — leicht zu sichern, zu kopieren
und zu verschicken. Bilder stecken als Datenverweis darin, damit ein
Projekt in einem Stück bleibt.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import time

_UNERLAUBT = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


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
                "bytes": os.path.getsize(voll),
            })
        raus.sort(key=lambda x: -x["geaendert"])
        return raus

    def lade(self, name: str) -> dict:
        with open(self._pfad(name), encoding="utf-8") as f:
            return json.load(f)

    def sichere(self, name: str, dokument: dict) -> dict:
        pfad = self._pfad(name)
        # Vor dem Überschreiben eine Sicherung behalten -- eine Abschlussarbeit
        # ist nichts, was man wegen eines Absturzes verlieren möchte.
        if os.path.exists(pfad):
            sicherung = os.path.join(self.wurzel, ".sicherungen")
            os.makedirs(sicherung, exist_ok=True)
            marke = time.strftime("%Y%m%d-%H%M%S")
            shutil.copy2(pfad, os.path.join(
                sicherung, f"{sauberer_name(name)}-{marke}.json"))
            self._raeume_sicherungen(sicherung, sauberer_name(name))
        vorlaeufig = pfad + ".neu"
        with open(vorlaeufig, "w", encoding="utf-8") as f:
            json.dump(dokument, f, ensure_ascii=False, indent=1)
        os.replace(vorlaeufig, pfad)     # atomar, kein halb geschriebenes Projekt
        return {"name": sauberer_name(name), "bytes": os.path.getsize(pfad)}

    @staticmethod
    def _raeume_sicherungen(ordner: str, praefix: str, behalten: int = 20):
        eigene = sorted(d for d in os.listdir(ordner) if d.startswith(praefix))
        for alt in eigene[:-behalten]:
            try:
                os.remove(os.path.join(ordner, alt))
            except OSError:
                pass

    def loesche(self, name: str):
        pfad = self._pfad(name)
        if os.path.exists(pfad):
            os.remove(pfad)

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
