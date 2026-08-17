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

  function zustand(art, text) {
    const leiste = el('bauzustand');
    if (!leiste) return;
    leiste.className = 'bauzustand ' + art;
    leiste.innerHTML = {
      laeuft:  '<span class="dreher"></span>',
      ok:      '<span class="haken">✓</span>',
      fehler:  '<span class="kreuz">✕</span>',
      wartet:  '<span class="punkt">•</span>'
    }[art] + '<span>' + escHtml(text) + '</span>';
  }

  /* ---------------- Fehlerliste ---------------- */

  function zeigeFehler(fehler, zeilenkarte, vorab) {
    const kasten = el('fehlerliste');
    if (!kasten) return;

    document.querySelectorAll('.block.hatfehler').forEach(
      b => b.classList.remove('hatfehler'));

    const alle = [];
    for (const v of vorab || [])
      alle.push({ id: v.id, meldung: v.meldung, rat: '', vorab: true });
    for (const f of fehler || []) {
      const treffer = f.zeile && (zeilenkarte || []).find(
        e => e.von <= f.zeile && f.zeile <= e.bis);
      alle.push({ id: treffer ? treffer.id : null, meldung: f.meldung,
                  rat: f.rat, roh: f.roh });
    }

    if (!alle.length) {
      kasten.style.display = 'none';
      kasten.innerHTML = '';
      return;
    }

    kasten.style.display = 'block';
    kasten.innerHTML = alle.map((f, i) => `
      <div class="fehler${f.id ? ' anklickbar' : ''}" data-ziel="${f.id || ''}"
           data-nr="${i}">
        <div class="fehler-kopf">
          <span class="fehler-marke">${f.vorab ? 'VORAB' : 'LATEX'}</span>
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
      if (block) block.classList.add('hatfehler');
    }

    kasten.querySelectorAll('.fehler.anklickbar').forEach(k =>
      k.addEventListener('click', () => {
        const ziel = k.dataset.ziel;
        Editor.waehle(ziel);
        Editor.fokussiere(ziel);
      }));
  }

  return { zeige, zustand, zeigeFehler, merkeSeite,
           seite: () => letzteSeite };
})();
