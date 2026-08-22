/* ===================================================================
   63-kontextleiste.js  --  Objektleiste unter der Kopfzeile
   -------------------------------------------------------------------
   Wie in Word: ein Klick auf eine Tabelle zeigt oben den
   Tabellenentwurf, ein Klick auf ein Bild das Bildformat. Die Leiste
   hängt an der Auswahl im Editor (Editor.waehle) und zeigt immer die
   Werkzeuge des gerade gewählten Bausteins -- Häufiges (Titel, Breite,
   Zeilen und Spalten) direkt zum Anfassen, Seltenes weiter im Dialog.

   Am Baustein selbst bleibt nur noch das Universelle: Griff,
   Verschieben, Löschen.
   =================================================================== */

const Kontextleiste = (() => {

  const dok = () => App.dok;
  const el = (tag, klasse, html) => {
    const n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (html != null) n.innerHTML = html;
    return n;
  };

  const NAMEN = {
    absatz: 'Text', ueberschrift: 'Überschrift', liste: 'Liste',
    blockzitat: 'Blockzitat', tabelle: 'Tabellenentwurf',
    abbildung: 'Bildformat', diagramm: 'Diagrammentwurf',
    formel: 'Formel', seitenumbruch: 'Seitenumbruch', anhangstart: 'Anhang'
  };

  /* ---------------- Bausteine der Leiste ---------------- */

  function knopf(html, titel, aktion, klasse) {
    const b = el('button', 'ktx' + (klasse ? ' ' + klasse : ''), html);
    b.type = 'button';
    b.title = titel;
    b.addEventListener('click', aktion);
    return b;
  }

  const trenner = () => el('span', 'ktx-trenner');
  const feldname = (text) => el('span', 'ktx-feldname', text);

  /* Fett und kursiv wirken auf das Textfeld, in dem die Schreibmarke
     steht. Die Leiste nimmt per mousedown-preventDefault keinen Fokus
     weg, die Auswahl bleibt also stehen. */
  function befehl(name) {
    const a = document.activeElement;
    const feld = a && a.closest ? a.closest('.tx') : null;
    if (!feld) { App.melde('Klick zuerst in den Text.', true); return; }
    Verlauf.merke(dok());
    document.execCommand(name);
    feld.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* Der Titel einer Karte lässt sich direkt in der Leiste tippen.
     Neu gezeichnet wird dabei NICHTS -- sonst verlöre die Eingabe bei
     jedem Zeichen den Fokus; nur die Titelzeile der Karte zieht mit. */
  function titelEingabe(block, leertext) {
    const eingabe = el('input', 'ktx-eingabe');
    eingabe.type = 'text';
    eingabe.dataset.feld = 'titel';
    eingabe.value = block.titel || '';
    eingabe.placeholder = leertext || 'Titel …';
    eingabe.addEventListener('input', () => {
      Verlauf.merke(dok(), 'titel:' + block.id);
      block.titel = eingabe.value;
      /* Der Titel an der Karte ist selbst editierbar -- nur nachziehen,
         wenn dort nicht gerade getippt wird. */
      const zeile = document.querySelector(
        `.block[data-id="${block.id}"] .karte-titel`);
      if (zeile && zeile !== document.activeElement) zeile.textContent = block.titel;
      App.aenderung({ nurVorschau: true });
    });
    eingabe.addEventListener('change', () => App.aenderung());
    return eingabe;
  }

  function schalter(text, titel, wert, aktion) {
    const huelle = el('label', 'ktx-schalter');
    huelle.title = titel;
    const kk = el('input');
    kk.type = 'checkbox';
    kk.checked = !!wert;
    kk.addEventListener('change', () => aktion(kk.checked));
    huelle.append(kk, document.createTextNode(' ' + text));
    return huelle;
  }

  /* Für alles, was nach der Änderung wirklich neu gezeichnet werden
     muss (Nummern, Kartentext) -- der Fokus liegt dann in der Leiste,
     keine Schreibmarke kann springen. */
  function aendere(arbeit) {
    Verlauf.merke(dok());
    arbeit();
    App.aenderung();
    Editor.zeichne(); Editor.zeichneGliederung();
  }

  async function einrichten(block) {
    const f = { tabelle: Dialoge.tabelle, abbildung: Dialoge.abbildung,
                formel: Dialoge.formel,
                diagramm: Diagrammdialog.einrichten }[block.typ];
    Verlauf.merke(dok());
    if (await f(block, dok())) { App.aenderung(); Editor.zeichne(); }
    else Verlauf.verwerfeLetzten();
  }

  /* ---------------- Werkzeuge je Bausteinart ---------------- */

  const textwerkzeuge = () => [
    knopf('<b>B</b>', 'Fett (Strg+B)', () => befehl('bold')),
    knopf('<i>I</i>', 'Kursiv (Strg+I)', () => befehl('italic')),
    trenner(),
    knopf('❝ Zitat', 'Quelle zitieren  (Strg+Umschalt+L)', () => App.zitatEinfuegen()),
    knopf('→ Verweis', 'Querverweis einfügen', () => App.verweisEinfuegen()),
    knopf('𝑀 Kennwert', 'Kennwert einfügen', () => App.kennwertEinfuegen()),
    knopf('¹ Fußnote', 'Fußnote einfügen', () => App.fussnoteEinfuegen()),
    knopf('∑ Formel', 'Formel im Satz einfügen', () => App.formelEinfuegen())
  ];

  function werkzeuge(block, info) {
    switch (block.typ) {

      case 'absatz':
        return textwerkzeuge();

      case 'ueberschrift':
        return [1, 2, 3].map(e => {
          const k = knopf('H' + e, `Ebene ${e}`, () => aendere(() => { block.ebene = e; }));
          if ((block.ebene || 1) === e) k.classList.add('aktiv');
          return k;
        });

      case 'liste':
        return [
          knopf(block.ordnung === 'nummern' ? '1. Nummern' : '• Punkte',
            'Zwischen Punkten und Nummern wechseln',
            () => aendere(() => {
              block.ordnung = block.ordnung === 'nummern' ? 'punkte' : 'nummern';
            })),
          trenner(),
          ...textwerkzeuge()
        ];

      case 'blockzitat':
        return [
          knopf('§ Quelle …', 'Quelle des Zitats festlegen', async () => {
            const z = await Dialoge.zitatEinfuegen(dok(), { einzeln: true });
            if (z) aendere(() => { block.quelle = z.zitat; block.seite = z.seite; });
          }),
          trenner(),
          ...textwerkzeuge()
        ];

      case 'tabelle':
        return [
          feldname('Titel'),
          titelEingabe(block, 'Titel der Tabelle …'),
          trenner(),
          knopf('+ Zeile', 'Zeile unten anfügen (oder Tabulator in der letzten Zelle)',
            () => aendere(() => block.zeilen.push(block.kopf.map(() => '')))),
          knopf('+ Spalte', 'Spalte rechts anfügen',
            () => aendere(() => {
              block.kopf.push('');
              block.zeilen.forEach(z => z.push(''));
              block.spaltenAusrichtung = block.spaltenAusrichtung || [];
              block.spaltenAusrichtung.push('c');
            })),
          trenner(),
          knopf('📊 Diagramm daraus',
            'Legt ein Diagramm an, das diese Tabelle darstellt — ' +
            'ändert sich die Tabelle, ändert sich das Diagramm mit',
            () => Editor.diagrammAusTabelle(block)),
          trenner(),
          knopf('⚙ Einrichten …', 'Anmerkung und Größe der Tabelle',
            () => einrichten(block))
        ];

      case 'abbildung': {
        const breite = el('input', 'ktx-eingabe ktx-zahl');
        breite.type = 'number';
        breite.min = 10; breite.max = 100; breite.step = 5;
        breite.value = block.breite || 80;
        breite.title = 'Anteil der Textbreite, üblich 60–90';
        /* Wer 65 tippt, ist bei der 6 kurz unter dem Minimum -- solange
           die Zahl unfertig ist, bleibt die Vorschau stehen, statt auf
           10 % zusammenzuschnurren. Erst das Verlassen des Felds rundet
           in den erlaubten Bereich. */
        const uebernimm = (wert) => {
          Verlauf.merke(dok(), 'breite:' + block.id);
          block.breite = wert;
          const bild = document.querySelector(
            `.block[data-id="${block.id}"] .abb-vorschau`);
          if (bild) bild.style.width = block.breite + '%';
          App.aenderung({ nurVorschau: true });
        };
        breite.addEventListener('input', () => {
          const wert = +breite.value;
          if (wert >= 10 && wert <= 100) uebernimm(wert);
        });
        breite.addEventListener('change', () => {
          const wert = Math.max(10, Math.min(100, +breite.value || block.breite || 80));
          breite.value = wert;
          if (wert !== block.breite) uebernimm(wert);
          App.aenderung();
        });
        return [
          feldname('Titel'),
          titelEingabe(block, 'Titel der Abbildung …'),
          trenner(),
          feldname('Breite %'),
          breite,
          trenner(),
          knopf('⚙ Einrichten …', 'Bild austauschen, Anmerkung',
            () => einrichten(block))
        ];
      }

      case 'diagramm':
        return [
          feldname('Titel'),
          titelEingabe(block, 'Titel des Diagramms …'),
          trenner(),
          schalter('Graustufen', 'Für den Schwarz-Weiß-Druck', block.graustufen,
            (an) => aendere(() => { block.graustufen = an; })),
          trenner(),
          knopf('⚙ Einrichten …', 'Art, Daten und Beschriftung des Diagramms',
            () => einrichten(block))
        ];

      case 'formel':
        return [
          knopf('✎ Bearbeiten …', 'Formel im Formeleditor bearbeiten',
            () => einrichten(block)),
          trenner(),
          schalter('Nummeriert', 'Bekommt eine (n) und lässt sich per Querverweis ansprechen',
            block.nummeriert, (an) => aendere(() => { block.nummeriert = an; }))
        ];

      default:
        return [];
    }
  }

  /* ---------------- Die Leiste zeichnen ---------------- */

  function nummerText(block, info) {
    const n = info.nummer || '?';
    if (block.typ === 'tabelle') return 'Tabelle ' + n;
    if (block.typ === 'abbildung' || block.typ === 'diagramm') return 'Abbildung ' + n;
    if (block.typ === 'formel' && block.nummeriert) return 'Formel (' + n + ')';
    if (block.typ === 'ueberschrift' && info.nummer) return 'Abschnitt ' + info.nummer;
    return '';
  }

  function zeichne() {
    const leiste = document.getElementById('kontextleiste');
    if (!leiste) return;
    if (!leiste.dataset.bereit) {
      leiste.dataset.bereit = '1';
      /* Ein Knopfdruck darf dem Textfeld weder Fokus noch Auswahl
         nehmen -- Eingabefelder der Leiste brauchen ihn dagegen. */
      leiste.addEventListener('mousedown', (ev) => {
        if (ev.target.closest('button')) ev.preventDefault();
      });
    }
    leiste.innerHTML = '';

    const block = dok().bloecke.find(b => b.id === Editor.gewaehlteId());
    if (!block) {
      leiste.append(el('span', 'ktx-hinweis',
        'Klick auf einen Baustein — seine Werkzeuge erscheinen hier.'));
      return;
    }

    const info = Modell.nummeriere(dok()).get(block.id) || {};
    leiste.append(el('span', 'ktx-art', escHtml(NAMEN[block.typ] || block.typ)));
    const nr = nummerText(block, info);
    if (nr) leiste.append(el('span', 'ktx-nr', escHtml(nr)));

    const teile = werkzeuge(block, info);
    if (teile.length) leiste.append(trenner(), ...teile);
  }

  return { zeichne };
})();
