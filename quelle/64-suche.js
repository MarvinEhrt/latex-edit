/* ===================================================================
   64-suche.js  --  Suchen und Ersetzen
   -------------------------------------------------------------------
   Strg+F öffnet die Leiste oben in der Textspalte, Strg+H gleich mit
   Ersetzen. Gesucht wird im MODELL, nicht im DOM: Text-Runs von
   Absatz, Blockzitat, Liste und Überschrift, Tabellenzellen und
   -köpfe, Titel und Anmerkungen von Tabellen und Abbildungen. Chips
   werden nicht durchsucht -- ihr Text ist abgeleitet.

   Ersetzt wird in v1 nur INNERHALB eines Runs: ein Treffer, der über
   eine Formatgrenze läuft (etwa halb fett, halb normal), wird zwar
   gefunden und angesprungen, beim Ersetzen aber übersprungen und
   gemeldet. Die Alternative -- Runs aufspalten und neu zusammensetzen
   -- lohnt den Aufwand erst, wenn jemand sie vermisst.
   =================================================================== */

const Suche = (() => {

  const el = (tag, klasse, html) => {
    const n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const dok = () => App.dok;

  let leiste = null;
  let aktuell = 0;             // Index des angesprungenen Treffers

  /* ---------------- Suchraum ----------------
     Jede Stelle ist ein durchsuchbares Stück Text mit einer
     Beschreibung, wie man es im Editor wiederfindet (dom) und wie man
     es zurückschreibt.                                               */

  function alleStellen() {
    const raus = [];
    for (const b of dok().bloecke) {
      const einfach = (eigenschaft, dom) => raus.push({
        blockId: b.id, art: 'einfach', dom,
        lese: () => String(b[eigenschaft] || ''),
        schreibe: (t) => { b[eigenschaft] = t; }
      });
      /* Fußnotentext ist abgegebene Prosa wie jede andere -- er stand
         nur im Chip-Attribut und war deshalb weder zu finden noch zu
         ersetzen. Der Chip zeigt danach den neuen Anfang. */
      const fussnoten = (runs, dom) => (runs || []).forEach((r, i) => {
        if (r.fussnote == null) return;
        raus.push({
          blockId: b.id, art: 'einfach', dom,
          lese: () => String(runs[i].fussnote || ''),
          schreibe: (t) => { runs[i].fussnote = t; }
        });
      });
      switch (b.typ) {
        case 'ueberschrift':
          einfach('text', { art: 'tx', feld: 'text' });
          break;
        case 'absatz':
        case 'blockzitat':
          raus.push({ blockId: b.id, art: 'runs', runs: () => b.runs || [],
                      dom: { art: 'tx', feld: 'runs' } });
          fussnoten(b.runs, { art: 'tx', feld: 'runs' });
          break;
        case 'liste':
          (b.punkte || []).forEach((_, i) => {
            raus.push({
              blockId: b.id, art: 'runs', runs: () => b.punkte[i] || [],
              dom: { art: 'tx-index', index: i } });
            fussnoten(b.punkte[i], { art: 'tx-index', index: i });
          });
          break;
        case 'tabelle':
          einfach('titel', null);
          einfach('anmerkung', null);
          (b.kopf || []).forEach((_, s) => raus.push({
            blockId: b.id, art: 'einfach', dom: { art: 'kopf', spalte: s },
            lese: () => String(b.kopf[s] || ''),
            schreibe: (t) => { b.kopf[s] = t; } }));
          (b.zeilen || []).forEach((zeile, z) => zeile.forEach((_, s) => raus.push({
            blockId: b.id, art: 'einfach', dom: { art: 'zelle', zeile: z, spalte: s },
            lese: () => String(b.zeilen[z][s] || ''),
            schreibe: (t) => { b.zeilen[z][s] = t; } })));
          break;
        case 'abbildung':
        case 'diagramm':
          einfach('titel', null);
          einfach('anmerkung', null);
          break;
      }
    }
    return raus;
  }

  /* Text-Runs zu durchsuchbaren Segmenten: aufeinanderfolgende
     Text-Runs bilden EIN Segment (ein Treffer darf über eine
     Formatgrenze laufen), Chips trennen (über einen Chip hinweg gibt
     es nichts Sinnvolles zu finden).                                 */
  function segmenteAus(runs) {
    const segmente = [];
    let akt = null;
    runs.forEach((r, i) => {
      if (r.text != null) {
        if (!akt) { akt = { text: '', teile: [] }; segmente.push(akt); }
        akt.teile.push({ runIndex: i, von: akt.text.length, laenge: r.text.length });
        akt.text += r.text;
      } else {
        akt = null;
      }
    });
    return segmente;
  }

  function findeAlle(text, begriff, beachteGross) {
    const heu = beachteGross ? text : text.toLowerCase();
    const nadel = beachteGross ? begriff : begriff.toLowerCase();
    const raus = [];
    let i = 0;
    while (nadel && (i = heu.indexOf(nadel, i)) !== -1) {
      raus.push(i);
      i += nadel.length;
    }
    return raus;
  }

  /* Alle Treffer im Dokument. Bei Runs merkt sich der Treffer, in
     welchem Run er GANZ liegt (runIndex) -- oder null, wenn er eine
     Formatgrenze überspannt und darum nicht ersetzt werden kann.     */
  function alleTreffer(begriff, beachteGross) {
    const raus = [];
    for (const stelle of alleStellen()) {
      if (stelle.art === 'einfach') {
        for (const von of findeAlle(stelle.lese(), begriff, beachteGross))
          raus.push({ stelle, von, segment: null, runIndex: null, einfach: true });
        continue;
      }
      segmenteAus(stelle.runs()).forEach((segment) => {
        for (const von of findeAlle(segment.text, begriff, beachteGross)) {
          const teil = segment.teile.find(t =>
            t.von <= von && von + begriff.length <= t.von + t.laenge);
          raus.push({ stelle, von, segment,
                      runIndex: teil ? teil.runIndex : null,
                      teilVon: teil ? teil.von : 0, einfach: false });
        }
      });
    }
    return raus;
  }

  /* ---------------- Treffer im Editor zeigen ---------------- */

  function domFeld(treffer) {
    const wurzel = document.querySelector(`.block[data-id="${treffer.stelle.blockId}"]`);
    const dom = treffer.stelle.dom;
    if (!wurzel || !dom) return null;
    switch (dom.art) {
      case 'tx':       return wurzel.querySelector(`.tx[data-feld="${dom.feld}"]`);
      case 'tx-index': return wurzel.querySelectorAll('.tx')[dom.index] || null;
      case 'kopf':     return wurzel.querySelectorAll('thead th')[dom.spalte] || null;
      case 'zelle': {
        const zeile = wurzel.querySelectorAll('tbody tr')[dom.zeile];
        return zeile ? zeile.cells[dom.spalte] : null;
      }
      default: return null;
    }
  }

  /* Modellposition -> DOM-Auswahl. Zählt nur sichtbare Zeichen
     außerhalb von Chips; Nullbreiten-Zeichen stehen im DOM, aber
     nicht im Modell.                                                 */
  const UNSICHTBAR = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/;

  function waehleBereich(feld, von, laenge) {
    let zaehler = 0, start = null, ende = null;
    const lauf = (knoten) => {
      for (const k of knoten.childNodes) {
        if (k.nodeType === 1) {
          if (k.classList && k.classList.contains('chip')) continue;
          if (lauf(k)) return true;
          continue;
        }
        if (k.nodeType !== 3) continue;
        const s = k.nodeValue;
        for (let i = 0; i < s.length; i++) {
          if (UNSICHTBAR.test(s[i])) continue;
          if (zaehler === von) start = [k, i];
          zaehler++;
          if (zaehler === von + laenge) { ende = [k, i + 1]; return true; }
        }
      }
      return false;
    };
    lauf(feld);
    if (!start || !ende) return;
    const bereich = document.createRange();
    bereich.setStart(start[0], start[1]);
    bereich.setEnd(ende[0], ende[1]);
    const auswahl = window.getSelection();
    auswahl.removeAllRanges();
    auswahl.addRange(bereich);
  }

  function springeZu(treffer, laenge) {
    Editor.waehle(treffer.stelle.blockId);
    const feld = domFeld(treffer);
    if (!feld) return;
    feld.focus();
    /* Bei Runs zählt die Auswahl ab Segmentanfang: der Segmenttext ist
       genau der sichtbare Text zwischen den Chips davor und danach --
       aber Chips VOR dem Segment zählen im DOM nicht mit, also erst
       den Versatz früherer Segmente aufaddieren. */
    if (treffer.einfach) {
      waehleBereich(feld, treffer.von, laenge);
    } else {
      let davor = 0;
      for (const seg of segmenteAus(treffer.stelle.runs())) {
        if (seg === treffer.segment) break;
        davor += seg.text.length;
      }
      waehleBereich(feld, davor + treffer.von, laenge);
    }
  }

  /* ---------------- Ersetzen ---------------- */

  function ersetzeEinen(treffer, begriff, ersatz) {
    if (treffer.einfach) {
      const t = treffer.stelle.lese();
      treffer.stelle.schreibe(
        t.slice(0, treffer.von) + ersatz + t.slice(treffer.von + begriff.length));
      return true;
    }
    if (treffer.runIndex == null) return false;      // überspannt eine Formatgrenze
    const run = treffer.stelle.runs()[treffer.runIndex];
    const p = treffer.von - treffer.teilVon;
    run.text = run.text.slice(0, p) + ersatz + run.text.slice(p + begriff.length);
    return true;
  }

  /* ---------------- Leiste ---------------- */

  function baue() {
    leiste = el('div', 'suchleiste');
    leiste.id = 'suchleiste';
    leiste.innerHTML = `
      <div class="suchzeile">
        <input id="suche-feld" type="search" placeholder="Suchen …">
        <span id="suche-stand" class="suche-stand"></span>
        <button type="button" class="knopf knopf-klein knopf-still" id="suche-hoch" title="Voriger Treffer (Umschalt+Enter)">▲</button>
        <button type="button" class="knopf knopf-klein knopf-still" id="suche-runter" title="Nächster Treffer (Enter)">▼</button>
        <label class="suche-gross" title="Groß- und Kleinschreibung beachten">
          <input id="suche-gross" type="checkbox"> Groß-/Klein</label>
        <button type="button" class="knopf knopf-klein knopf-still" id="suche-aufklappen">Ersetzen …</button>
        <button type="button" class="knopf knopf-klein knopf-still" id="suche-zu" title="Schließen (Esc)">✕</button>
      </div>
      <div class="suchzeile" id="suche-ersetzen-zeile" style="display:none">
        <input id="ersetzen-feld" type="text" placeholder="Ersetzen durch …">
        <button type="button" class="knopf knopf-klein" id="knopf-ersetzen">Ersetzen</button>
        <button type="button" class="knopf knopf-klein" id="knopf-alle-ersetzen">Alle ersetzen</button>
      </div>`;
    const spalte = document.querySelector('.spalte-mitte');
    spalte.insertBefore(leiste, spalte.querySelector('.panelkoerper'));

    const feld = leiste.querySelector('#suche-feld');
    const stand = leiste.querySelector('#suche-stand');
    const gross = leiste.querySelector('#suche-gross');

    const treffer = () => alleTreffer(feld.value, gross.checked);

    const zeigeStand = (liste) => {
      stand.textContent = feld.value
        ? (liste.length ? `${aktuell + 1} von ${liste.length}` : 'kein Treffer')
        : '';
    };

    const neuSuchen = () => {
      aktuell = 0;
      zeigeStand(treffer());
    };

    const springe = (schritt) => {
      const liste = treffer();
      if (!liste.length) { zeigeStand(liste); return; }
      aktuell = ((aktuell + schritt) % liste.length + liste.length) % liste.length;
      zeigeStand(liste);
      springeZu(liste[aktuell], feld.value.length);
    };

    feld.addEventListener('input', neuSuchen);
    gross.addEventListener('change', neuSuchen);
    feld.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); springe(ev.shiftKey ? -1 : 1); }
    });
    leiste.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); schliesse(); }
    });
    leiste.querySelector('#suche-runter').addEventListener('click', () => springe(1));
    leiste.querySelector('#suche-hoch').addEventListener('click', () => springe(-1));
    leiste.querySelector('#suche-zu').addEventListener('click', schliesse);
    leiste.querySelector('#suche-aufklappen').addEventListener('click', () => {
      const zeile = leiste.querySelector('#suche-ersetzen-zeile');
      zeile.style.display = zeile.style.display === 'none' ? '' : 'none';
      if (zeile.style.display === '') leiste.querySelector('#ersetzen-feld').focus();
    });

    const nachErsetzen = () => {
      App.aenderung();
      Editor.zeichne();
      Editor.zeichneGliederung();
    };

    leiste.querySelector('#knopf-ersetzen').addEventListener('click', () => {
      const liste = treffer();
      if (!liste.length) { App.melde('Kein Treffer zum Ersetzen.', true); return; }
      if (aktuell >= liste.length) aktuell = 0;
      const t = liste[aktuell];
      if (!t.einfach && t.runIndex == null) {
        App.melde('Dieser Treffer läuft über eine Formatgrenze — bitte von Hand ändern.', true);
        springe(1);
        return;
      }
      Verlauf.merke(dok());
      ersetzeEinen(t, feld.value, leiste.querySelector('#ersetzen-feld').value);
      nachErsetzen();
      zeigeStand(treffer());
    });

    leiste.querySelector('#knopf-alle-ersetzen').addEventListener('click', () => {
      const liste = treffer();
      if (!liste.length) { App.melde('Kein Treffer zum Ersetzen.', true); return; }
      /* EIN Verlaufsschritt für alles. Rückwärts ersetzen, damit die
         Positionen der noch offenen Treffer gültig bleiben. */
      Verlauf.merke(dok());
      const ersatz = leiste.querySelector('#ersetzen-feld').value;
      let ersetzt = 0, uebersprungen = 0;
      for (const t of [...liste].reverse()) {
        if (ersetzeEinen(t, feld.value, ersatz)) ersetzt++;
        else uebersprungen++;
      }
      if (!ersetzt) Verlauf.verwerfeLetzten();
      nachErsetzen();
      aktuell = 0;
      zeigeStand(treffer());
      App.melde(`${ersetzt} ${ersetzt === 1 ? 'Stelle' : 'Stellen'} ersetzt` +
        (uebersprungen ? ` — ${uebersprungen} übersprungen (über eine Formatgrenze).` : '.'),
        !ersetzt);
    });
  }

  function oeffne(mitErsetzen) {
    if (!leiste) baue();
    leiste.style.display = '';
    if (mitErsetzen)
      leiste.querySelector('#suche-ersetzen-zeile').style.display = '';
    const feld = leiste.querySelector('#suche-feld');
    feld.focus();
    feld.select();
  }

  function schliesse() {
    if (!leiste) return;
    leiste.style.display = 'none';
    window.getSelection().removeAllRanges();
  }

  const offen = () => !!leiste && leiste.style.display !== 'none';

  return { oeffne, schliesse, offen };
})();
