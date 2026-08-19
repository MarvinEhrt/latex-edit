/* ===================================================================
   62-auswahlleiste.js  --  schwebende Leiste bei Textauswahl
   -------------------------------------------------------------------
   Fett und kursiv gab es bisher nur als Strg+B/I -- nichts in der
   Oberfläche verriet das. Sobald in einem Textfeld etwas ausgewählt
   ist, erscheint über der Auswahl eine kleine Leiste: B, I und die
   vier Einfüge-Wege. Sie verschwindet, wenn die Auswahl kollabiert,
   gescrollt oder woanders geklickt wird.
   =================================================================== */

const Auswahlleiste = (() => {

  let leiste = null;
  let timer = null;

  /* Das Textfeld, in dem die aktuelle (nicht kollabierte) Auswahl
     liegt -- oder null. */
  function feldMitAuswahl() {
    const auswahl = window.getSelection();
    if (!auswahl || !auswahl.rangeCount || auswahl.isCollapsed) return null;
    const knoten = auswahl.getRangeAt(0).commonAncestorContainer;
    return (knoten.nodeType === 1 ? knoten : knoten.parentElement)
      ?.closest?.('.tx') || null;
  }

  function befehl(name) {
    const feld = feldMitAuswahl();
    if (!feld) return;
    /* execCommand feuert KEIN beforeinput (nur echte Nutzereingaben
       tun das) -- der Schnappschuss muss also von Hand kommen. */
    Verlauf.merke(App.dok);
    document.execCommand(name);
    feld.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function baue() {
    leiste = document.createElement('div');
    leiste.id = 'auswahlleiste';
    /* mousedown würde die Auswahl kollabieren lassen, bevor der Klick
       ankommt -- dasselbe Muster wie bei den Werkzeugleisten-Knöpfen. */
    leiste.addEventListener('mousedown', (ev) => ev.preventDefault());
    const k = (html, titel, aktion) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = html;
      b.title = titel;
      b.addEventListener('click', aktion);
      leiste.append(b);
    };
    k('<b>B</b>', 'Fett (Strg+B)', () => befehl('bold'));
    k('<i>I</i>', 'Kursiv (Strg+I)', () => befehl('italic'));
    leiste.append(Object.assign(document.createElement('span'), { className: 'trenner' }));
    k('❝', 'Quelle zitieren (Strg+Umschalt+Z)', () => { verstecke(); App.zitatEinfuegen(); });
    k('→', 'Querverweis einfügen', () => { verstecke(); App.verweisEinfuegen(); });
    k('𝑀', 'Kennwert einfügen', () => { verstecke(); App.kennwertEinfuegen(); });
    k('¹', 'Fußnote einfügen', () => { verstecke(); App.fussnoteEinfuegen(); });
    document.body.append(leiste);
  }

  function zeige() {
    const feld = feldMitAuswahl();
    if (!feld) { verstecke(); return; }
    const r = window.getSelection().getRangeAt(0).getBoundingClientRect();
    if (!r || (!r.width && !r.height)) { verstecke(); return; }
    if (!leiste) baue();
    leiste.style.display = 'flex';
    const eigen = leiste.getBoundingClientRect();
    leiste.style.left = Math.max(8, Math.min(
      window.innerWidth - eigen.width - 8,
      r.left + r.width / 2 - eigen.width / 2)) + 'px';
    leiste.style.top = Math.max(8, r.top - eigen.height - 8) + 'px';
  }

  function verstecke() {
    if (leiste) leiste.style.display = 'none';
  }

  document.addEventListener('selectionchange', () => {
    clearTimeout(timer);
    timer = setTimeout(zeige, 120);
  });
  /* capture: auch das Scrollen der Spalten selbst versteckt die Leiste */
  document.addEventListener('scroll', verstecke, true);

  return { verstecke };
})();
