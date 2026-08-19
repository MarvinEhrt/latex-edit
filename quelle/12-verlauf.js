/* ===================================================================
   12-verlauf.js  --  Rückgängig und Wiederholen
   -------------------------------------------------------------------
   Das Dokument ist JSON, also genügen Schnappschüsse -- kein Protokoll
   einzelner Vorgänge, das man für jede neue Bearbeitungsart pflegen
   müsste.

   Der Haken wäre der Speicher: eine Arbeit mit Bildschirmfotos wiegt
   Megabytes. Deshalb wird die STRUKTUR geklont, die Zeichenketten aber
   geteilt. In JavaScript sind Zeichenketten unveränderlich; eine
   Zuweisung kopiert sie nicht. Ein Schnappschuss kostet damit ein paar
   Kilobyte statt Megabyte -- anders als bei JSON.parse(JSON.stringify()),
   das jede Zeichenkette neu anlegt.
   =================================================================== */

const Verlauf = (() => {

  const GRENZE = 80;            // so viele Schritte lassen sich zurücknehmen
  const RUHE = 700;             // ms Tipppause, ab der ein neuer Schritt beginnt

  let zurueckStapel = [];
  let vorStapel = [];
  let letzteMarke = 0;
  let letzterOrt = '';
  let horcher = null;           // sagt Bescheid, wenn sich die Stapel ändern

  const gibBescheid = () => { if (horcher) horcher(); };

  function klone(wert) {
    if (Array.isArray(wert)) return wert.map(klone);
    if (wert && typeof wert === 'object') {
      const neu = {};
      for (const k of Object.keys(wert)) neu[k] = klone(wert[k]);
      return neu;
    }
    return wert;               // Zeichenketten werden geteilt, nicht kopiert
  }

  /* Wo steht die Schreibmarke? Damit landet man nach dem Zurücknehmen
     wieder dort, wo man war, statt am Dokumentanfang. */
  function ortMerken() {
    const auswahl = window.getSelection();
    if (!auswahl || !auswahl.rangeCount) return null;
    const knoten = auswahl.getRangeAt(0).startContainer;
    const feld = (knoten.nodeType === 1 ? knoten : knoten.parentElement)?.closest?.('.tx');
    if (!feld) return null;
    const bis = document.createRange();
    bis.selectNodeContents(feld);
    bis.setEnd(auswahl.getRangeAt(0).startContainer, auswahl.getRangeAt(0).startOffset);
    return { blockId: feld.dataset.blockId, feld: feld.dataset.feld || '',
             versatz: bis.toString().length };
  }

  function stand(dok) {
    return { meta: klone(dok.meta), einstellungen: klone(dok.einstellungen),
             bloecke: klone(dok.bloecke), quellen: klone(dok.quellen),
             ort: ortMerken() };
  }

  function einsetzen(dok, s) {
    dok.meta = klone(s.meta);
    dok.einstellungen = klone(s.einstellungen);
    dok.bloecke = klone(s.bloecke);
    dok.quellen = klone(s.quellen);
    return s.ort;
  }

  /* Vor einer Änderung aufrufen. `ort` benennt die Stelle, damit
     zusammengehörige Tastendrücke zu einem Schritt verschmelzen. */
  function merke(dok, ort = '') {
    const jetzt = Date.now();
    const gleicherFluss = ort && ort === letzterOrt && (jetzt - letzteMarke) < RUHE;
    letzteMarke = jetzt;
    letzterOrt = ort;
    if (gleicherFluss) return;          // gehört zum selben Schritt

    zurueckStapel.push(stand(dok));
    if (zurueckStapel.length > GRENZE) zurueckStapel.shift();
    vorStapel = [];                     // ein neuer Zweig verwirft die Zukunft
    gibBescheid();
  }

  /* Beendet den laufenden Schritt: der nächste Tastendruck beginnt einen
     neuen. Nötig, wenn zwischendurch etwas anderes passiert ist. */
  function schnitt() { letzterOrt = ''; letzteMarke = 0; }

  function zurueck(dok) {
    if (!zurueckStapel.length) return null;
    vorStapel.push(stand(dok));
    const ort = einsetzen(dok, zurueckStapel.pop());
    schnitt();
    gibBescheid();
    return { ort, rest: zurueckStapel.length };
  }

  function vor(dok) {
    if (!vorStapel.length) return null;
    zurueckStapel.push(stand(dok));
    const ort = einsetzen(dok, vorStapel.pop());
    schnitt();
    gibBescheid();
    return { ort, rest: vorStapel.length };
  }

  function leeren() { zurueckStapel = []; vorStapel = []; schnitt(); gibBescheid(); }

  /* Für Dialoge: vorher merken, und wenn abgebrochen wurde, den
     Schnappschuss wieder wegnehmen -- sonst sammelt sich für jedes
     geöffnete und weggeklickte Fenster ein leerer Schritt an. */
  function verwerfeLetzten() { zurueckStapel.pop(); schnitt(); gibBescheid(); }

  return { merke, schnitt, zurueck, vor, leeren, klone, verwerfeLetzten,
           beiAenderung: (fn) => { horcher = fn; fn(); },
           kannZurueck: () => zurueckStapel.length > 0,
           kannVor: () => vorStapel.length > 0,
           tiefe: () => zurueckStapel.length };
})();
