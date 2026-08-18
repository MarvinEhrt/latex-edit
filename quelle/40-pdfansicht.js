/* ===================================================================
   40-pdfansicht.js  --  das echte PDF anzeigen
   -------------------------------------------------------------------
   Kein Nachbau des Layouts mehr: hier steht, was auch beim Drucken
   herauskommt. Angezeigt wird es im eingebauten PDF-Betrachter des
   Browsers -- der kann Zoom, Suche und Blättern von Haus aus.
   =================================================================== */

const PdfAnsicht = (() => {

  let letzteSeite = 1;
  let letzteFassung = 0;

  const el = (id) => document.getElementById(id);

  /* Der eingebettete Betrachter lädt bei jeder neuen Fassung neu und
     springt dabei an den Anfang. Deshalb merken wir uns die Seite und
     hängen sie wieder an die Adresse.                                */
  function merkeSeite() {
    const rahmen = el('pdfrahmen');
    try {
      const marke = rahmen.contentWindow.location.hash.match(/page=(\d+)/);
      if (marke) letzteSeite = +marke[1];
    } catch { /* anderer Ursprung -- dann eben nicht */ }
  }

  function zeige(fassung) {
    const rahmen = el('pdfrahmen');
    if (!rahmen || !fassung || fassung === letzteFassung) return;
    letzteFassung = fassung;
    rahmen.src = Begleiter.pdfAdresse(fassung, letzteSeite);
    el('pdfleer').style.display = 'none';
    rahmen.style.display = 'block';
  }

  /* Beim ersten Bau lädt MiKTeX die benötigten Pakete nach; das dauert
     Minuten. Ohne mitlaufende Uhr sieht das aus, als hinge das Programm --
     und man bricht ab, kurz bevor es fertig wäre. */
  let uhr = null;

  function starteUhr() {
    stoppeUhr();
    const beginn = Date.now();
    const schlag = () => {
      const s = Math.round((Date.now() - beginn) / 1000);
      let text = `PDF wird gebaut … ${s} s`;
      if (s >= 20) text += ' · beim ersten Mal lädt MiKTeX Pakete nach';
      zustand('laeuft', text);
    };
    schlag();
    uhr = setInterval(schlag, 1000);
  }

  function stoppeUhr() {
    if (uhr) clearInterval(uhr);
    uhr = null;
  }

  function zustand(art, text) {
    const leiste = el('bauzustand');
    if (!leiste) return;
    leiste.className = 'bauzustand ' + art;
    leiste.innerHTML = {
      laeuft:  '<span class="dreher"></span>',
      ok:      '<span class="haken">✓</span>',
      hinweis: '<span class="haken">✓</span>',
      fehler:  '<span class="kreuz">✕</span>',
      wartet:  '<span class="punkt">•</span>'
    }[art] + '<span>' + escHtml(text) + '</span>';
  }

  /* ---------------- Fehlerliste ---------------- */

  /* Warnungen lassen sich genauer zuordnen als Fehler: LaTeX nennt den
     Schlüssel, nicht bloß eine Zeile. Damit finden wir den Baustein
     unmittelbar -- auch dann, wenn die Stelle über mehrere Seiten
     verteilt ist.                                                    */
  function bausteinZuSchluessel(warnung, dok) {
    if (warnung.sorte === 'verweis') {
      const id = String(warnung.schluessel || '').split(':')[1];
      return (dok.bloecke || []).some(b => b.id === id) ? id : null;
    }
    if (warnung.sorte !== 'zitat') return null;
    const k = warnung.schluessel;
    const inRuns = (runs) => (runs || []).some(r => r.zitat === k);
    for (const b of dok.bloecke || []) {
      if (inRuns(b.runs)) return b.id;
      if (b.quelle === k) return b.id;
      if ((b.punkte || []).some(inRuns)) return b.id;
      if ([b.titel, b.anmerkung].some(t => String(t || '').includes(`{{zit:${k}}}`)
                                         || String(t || '').includes(`{{zitn:${k}}}`)))
        return b.id;
    }
    return null;
  }

  function zeigeFehler(fehler, zeilenkarte, vorab, warnungen, dok) {
    const kasten = el('fehlerliste');
    if (!kasten) return;

    document.querySelectorAll('.block.hatfehler, .block.hathinweis').forEach(
      b => b.classList.remove('hatfehler', 'hathinweis'));

    const alle = [];
    for (const v of vorab || [])
      alle.push({ id: v.id, meldung: v.meldung, rat: '', vorab: true });
    for (const f of fehler || []) {
      const treffer = f.zeile && (zeilenkarte || []).find(
        e => e.von <= f.zeile && f.zeile <= e.bis);
      alle.push({ id: treffer ? treffer.id : null, meldung: f.meldung,
                  rat: f.rat, roh: f.roh, art: 'fehler' });
    }
    for (const w of warnungen || []) {
      alle.push({ id: dok ? bausteinZuSchluessel(w, dok) : null,
                  meldung: w.meldung, rat: w.rat, roh: w.roh, art: 'warnung' });
    }

    if (!alle.length) {
      kasten.style.display = 'none';
      kasten.innerHTML = '';
      return;
    }

    kasten.style.display = 'block';
    kasten.innerHTML = alle.map((f, i) => `
      <div class="fehler ${f.art === 'warnung' ? 'hinweis' : ''}${f.id ? ' anklickbar' : ''}"
           data-ziel="${f.id || ''}" data-nr="${i}">
        <div class="fehler-kopf">
          <span class="fehler-marke">${
            f.vorab ? 'VORAB' : f.art === 'warnung' ? 'PRÜFEN' : 'LATEX'}</span>
          <span>${escHtml(f.meldung)}</span>
        </div>
        ${f.rat ? `<div class="fehler-rat">${escHtml(f.rat)}</div>` : ''}
        ${f.id ? '<div class="fehler-rat">Klicken, um zur Stelle zu springen.</div>'
               : (f.roh ? `<details class="fehler-roh"><summary>Originalmeldung</summary>
                           <pre>${escHtml(f.roh)}</pre></details>` : '')}
      </div>`).join('');

    for (const f of alle) {
      if (!f.id) continue;
      const block = document.querySelector(`.block[data-id="${f.id}"]`);
      if (block) block.classList.add(f.art === 'warnung' ? 'hathinweis' : 'hatfehler');
    }

    kasten.querySelectorAll('.fehler.anklickbar').forEach(k =>
      k.addEventListener('click', () => {
        const ziel = k.dataset.ziel;
        Editor.waehle(ziel);
        Editor.fokussiere(ziel);
      }));
  }

  return { zeige, zustand, zeigeFehler, merkeSeite, starteUhr, stoppeUhr,
           seite: () => letzteSeite };
})();
