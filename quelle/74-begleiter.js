/* ===================================================================
   74-begleiter.js  --  Draht zum lokalen Begleitprozess
   -------------------------------------------------------------------
   Der Browser darf keine Programme starten. Alles, was pdflatex, biber,
   die Festplatte oder Zotero betrifft, läuft über den Python-Dienst auf
   127.0.0.1. Das Zeichen wird beim Ausliefern der Seite eingesetzt --
   fehlt es, wurde die Datei direkt geöffnet statt über start.sh.
   =================================================================== */

const Begleiter = (() => {

  const ZEICHEN = (window.__schreibtischZeichen || '').trim();
  const verbunden = ZEICHEN && !ZEICHEN.startsWith('__');

  const netz = (weg, felder = {}) =>
    weg + '?' + new URLSearchParams({ t: ZEICHEN, ...felder }).toString();

  async function antwort(a) {
    let daten;
    try { daten = await a.json(); } catch { daten = {}; }
    if (!a.ok) throw new Error(daten.fehler || `Fehler ${a.status}`);
    return daten;
  }

  const hole = async (weg, felder) => antwort(await fetch(netz(weg, felder)));

  const sende = async (weg, koerper, felder) => antwort(await fetch(
    netz(weg, felder), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(koerper)
    }));

  /* Bilder, die in dieser Sitzung schon übertragen wurden. Ein Scan mit
     mehreren Megabyte muss nicht bei jedem Tastendruck erneut über die
     Leitung -- der Begleiter hat ihn längst auf der Platte.            */
  const uebertragen = new Set();
  const bildmarke = (b) => b.datei + '|' + b.datenUrl.length + '|' +
                           b.datenUrl.slice(-48);

  async function uebersetze(projekt) {
    const bilder = [];
    for (const b of projekt.bilder) {
      const marke = bildmarke(b);
      if (uebertragen.has(marke)) continue;
      uebertragen.add(marke);
      bilder.push({ datei: b.datei, daten: b.datenUrl.split(',')[1] });
    }
    return sende('/uebersetzen', { dateien: projekt.dateien, bilder });
  }

  /* Der Browser soll das PDF nicht aus dem Zwischenspeicher zeigen,
     deshalb wandert die Fassungsnummer in die Adresse. */
  const pdfAdresse = (fassung, seite) =>
    netz('/pdf', { v: fassung }) + (seite ? `#page=${seite}` : '');

  return {
    verbunden,
    pruefung:        () => hole('/pruefung'),
    uebersetze,
    pdfAdresse,
    projekte:        () => hole('/projekte'),
    ladeProjekt:     (name) => hole('/projekt', { name }),
    sichereProjekt:  (name, dokument) => sende('/projekt', { name, dokument }),
    loescheProjekt:  (name) => sende('/projekt/loeschen', { name }),
    einstellungen:   () => hole('/einstellungen'),
    setzeEinstellungen: (werte) => sende('/einstellungen', werte),
    zoteroPruefen:   (schluessel) => hole('/zotero/pruefen', { schluessel }),
    zoteroSammlungen: (art) => hole('/zotero/sammlungen', { art: art || 'users' }),
    zoteroBibliothek: (art, sammlung) =>
      hole('/zotero/bibliothek', { art: art || 'users', sammlung: sammlung || '' }),
    beenden:         () => hole('/beenden')
  };
})();
