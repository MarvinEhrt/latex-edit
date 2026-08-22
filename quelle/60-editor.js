/* ===================================================================
   60-editor.js  --  Blockeditor und Gliederung
   -------------------------------------------------------------------
   Wichtigste Regel: einen Block, in dem gerade der Cursor steht, NIE
   neu zeichnen. Sonst springt die Schreibmarke. Beim Tippen wandert
   der Inhalt nur ins Modell; neu gezeichnet wird erst bei
   Strukturänderungen oder wenn der Block den Fokus verliert.
   =================================================================== */

const Editor = (() => {

  let gewaehlteId = null;
  let ziehtId = null;

  const dok = () => App.dok;
  const el = (tag, klasse, html) => {
    const n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const findeBlock = (id) => dok().bloecke.find(b => b.id === id);
  const indexVon = (id) => dok().bloecke.findIndex(b => b.id === id);

  function ctx() {
    const nummern = Modell.nummeriere(dok());
    const sprache = (dok().einstellungen || {}).sprache;
    const w = Zitate.wort(sprache);
    return {
      bearbeitbar: true,
      quellen: dok().quellen,
      sprache,
      verweisText: (ziel) => {
        const b = findeBlock(ziel);
        if (!b) return w['gelöscht'];
        const n = (nummern.get(ziel) || {}).nummer || '?';
        return b.typ === 'tabelle' ? `${w.tabelle} ${n}`
             : (b.typ === 'abbildung' || b.typ === 'diagramm') ? `${w.abbildung} ${n}`
             : b.typ === 'formel' ? `${w.formel} (${n})`
             : `${w.abschnitt} ${n}`;
      }
    };
  }

  /* ---------------- Einfügen an der Schreibmarke ---------------- */

  function fuegeAmCursorEin(html) {
    const auswahl = window.getSelection();
    if (!auswahl || !auswahl.rangeCount) return false;
    const bereich = auswahl.getRangeAt(0);
    const feld = bereich.startContainer.parentElement?.closest('.tx');
    if (!feld) return false;

    bereich.deleteContents();
    const stueck = bereich.createContextualFragment(html + '\u200B');
    const letzter = stueck.lastChild;
    bereich.insertNode(stueck);
    if (letzter) {
      const neu = document.createRange();
      neu.setStartAfter(letzter);
      neu.collapse(true);
      auswahl.removeAllRanges();
      auswahl.addRange(neu);
    }
    feld.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  function chipHtml(run) {
    return Richtext.zuHtml([run], ctx());
  }

  /* ---------------- @-Zitieren ----------------
     Tippt man @ am Wortanfang und mindestens zwei weitere Zeichen,
     erscheint unter der Schreibmarke eine Liste passender Quellen.
     Enter/Tab fügt ein Klammerzitat ein und entfernt den getippten
     @…-Text; Seitenzahl und Form ändert man danach per Chip-Klick.  */

  let atListe = null;      // DOM der Vorschlagsliste (null = zu)
  let atTreffer = [];      // [{q}] oder [{neu:true}]
  let atIndex = 0;
  let atFeld = null;

  function atSchliesse() {
    if (atListe) atListe.remove();
    atListe = null; atTreffer = []; atFeld = null;
  }

  /* Steht vor der Schreibmarke ein @wort? Nur innerhalb EINES
     Textknotens gesucht -- ein Treffer über eine Chip-Grenze hinweg
     wäre ohnehin nicht löschbar. Das Nullbreiten-Leerzeichen (steht
     hinter jedem Chip) zählt als Wortanfang. */
  function atVorCursor(feld) {
    const auswahl = window.getSelection();
    if (!auswahl || !auswahl.rangeCount || !auswahl.isCollapsed) return null;
    const marke = auswahl.getRangeAt(0);
    const knoten = marke.startContainer;
    if (knoten.nodeType !== 3 || !feld.contains(knoten)) return null;
    const text = knoten.nodeValue.slice(0, marke.startOffset);
    const m = text.match(/(^|[\s\u200B])@(\S{2,})$/);
    return m ? { wort: m[2], knoten, offset: marke.startOffset } : null;
  }

  function atPassende(wort) {
    const w = wort.toLowerCase();
    return Zitate.sortiert(dok().quellen).filter(q => {
      const f = q.felder || {};
      return (Zitate.nachnamen(q).join(' ') + ' ' + (f.jahr || '') + ' ' +
              (f.titel || '') + ' ' + q.key).toLowerCase().includes(w);
    }).slice(0, 8);
  }

  function atZeichne() {
    atListe.innerHTML = '';
    atTreffer.forEach((t, i) => {
      const zeile = el('div', 'at-eintrag' + (i === atIndex ? ' aktiv' : ''));
      if (t.neu) {
        zeile.innerHTML = '<b>Neue Quelle anlegen …</b>';
      } else {
        const f = t.q.felder || {};
        zeile.innerHTML = `<b>${escHtml(Zitate.autorKurz(t.q, 'klammer'))} (${escHtml(Zitate.jahr(t.q))})</b>
          <div class="at-titel">${escHtml(f.titel || t.q.key)}</div>`;
      }
      zeile.addEventListener('mousedown', (ev) => ev.preventDefault());
      zeile.addEventListener('click', () => { atIndex = i; atUebernehmen(); });
      atListe.append(zeile);
    });
  }

  function atZeige(feld, fund) {
    atFeld = feld;
    const passend = atPassende(fund.wort);
    atTreffer = passend.length ? passend.map(q => ({ q })) : [{ neu: true }];
    if (atIndex >= atTreffer.length) atIndex = 0;
    if (!atListe) {
      atListe = el('div');
      atListe.id = 'atliste';
      document.body.append(atListe);
    }
    atZeichne();
    const r = window.getSelection().getRangeAt(0).getBoundingClientRect();
    const eigen = atListe.getBoundingClientRect();
    atListe.style.left = Math.max(8, Math.min(
      window.innerWidth - eigen.width - 8, r.left)) + 'px';
    atListe.style.top = Math.min(window.innerHeight - eigen.height - 8, r.bottom + 4) + 'px';
  }

  function atPruefe(feld, ev) {
    if (ev && ev.isComposing) return;            // IME nicht unterbrechen
    const fund = atVorCursor(feld);
    if (!fund) { atSchliesse(); return; }
    atIndex = 0;
    atZeige(feld, fund);
  }

  /* Markiert den getippten @…-Text, damit fuegeAmCursorEin ihn ersetzt. */
  function atMarkiereGetipptes() {
    const fund = atVorCursor(atFeld);
    if (!fund) return false;
    const bereich = document.createRange();
    bereich.setStart(fund.knoten, fund.offset - fund.wort.length - 1);
    bereich.setEnd(fund.knoten, fund.offset);
    const auswahl = window.getSelection();
    auswahl.removeAllRanges();
    auswahl.addRange(bereich);
    return true;
  }

  function atUebernehmen() {
    const feld = atFeld;
    const treffer = atTreffer[atIndex];
    if (!feld || !treffer) { atSchliesse(); return; }

    if (treffer.neu) {
      /* Position merken, Dialog öffnen; danach ersetzt die neue Quelle
         den getippten Text -- wenn das Feld noch da ist. */
      const fund = atVorCursor(feld);
      atSchliesse();
      (async () => {
        const q = await Dialoge.quelleBearbeiten(dok());
        if (!q) return;
        App.aenderung();
        if (!fund || !document.contains(fund.knoten)) return;
        feld.focus();
        const bereich = document.createRange();
        bereich.setStart(fund.knoten, fund.offset - fund.wort.length - 1);
        bereich.setEnd(fund.knoten, fund.offset);
        const auswahl = window.getSelection();
        auswahl.removeAllRanges();
        auswahl.addRange(bereich);
        Verlauf.merke(dok(), 'tx:' + feld.dataset.blockId + ':' + (feld.dataset.feld || ''));
        fuegeAmCursorEin(chipHtml({ zitat: q.key, form: 'klammer' }));
      })();
      return;
    }

    if (!atMarkiereGetipptes()) { atSchliesse(); return; }
    const key = treffer.q.key;
    atSchliesse();
    /* Derselbe ort wie beim Tippen: Tippfluss und Einfügen werden so
       zu EINEM Verlaufsschritt. */
    Verlauf.merke(dok(), 'tx:' + feld.dataset.blockId + ':' + (feld.dataset.feld || ''));
    fuegeAmCursorEin(chipHtml({ zitat: key, form: 'klammer' }));
  }

  /* ---------------- /-Menü ----------------
     Ein / am Wortanfang öffnet die Baustein-Auswahl: Weitertippen
     filtert, Pfeile wählen, Enter fügt ein -- dieselbe Mechanik wie
     das @-Zitieren, nur für die Einfügeleiste.                       */

  let slashListe = null;
  let slashTreffer = [];
  let slashIndex = 0;
  let slashFeld = null;

  const SLASH_EINTRAEGE = [
    ['absatz', '¶', 'Absatz'], ['ueberschrift', 'H', 'Überschrift'],
    ['liste', '•', 'Liste'], ['tabelle', '▦', 'Tabelle'],
    ['abbildung', '🖼', 'Abbildung'], ['diagramm', '📊', 'Diagramm'],
    ['blockzitat', '❝', 'Blockzitat'], ['formel', '∑', 'Formel'],
    ['seitenumbruch', '⤓', 'Seitenumbruch'], ['anhangstart', '§', 'Anhang beginnt']
  ];

  function slashSchliesse() {
    if (slashListe) slashListe.remove();
    slashListe = null; slashTreffer = []; slashFeld = null;
  }

  function slashVorCursor(feld) {
    const auswahl = window.getSelection();
    if (!auswahl || !auswahl.rangeCount || !auswahl.isCollapsed) return null;
    const marke = auswahl.getRangeAt(0);
    const knoten = marke.startContainer;
    if (knoten.nodeType !== 3 || !feld.contains(knoten)) return null;
    const text = knoten.nodeValue.slice(0, marke.startOffset);
    const m = text.match(/(^|[\s\u200B])\/([a-zäöüß]*)$/i);
    return m ? { wort: m[2], knoten, offset: marke.startOffset } : null;
  }

  function slashZeige(feld, fund) {
    slashFeld = feld;
    const w = fund.wort.toLowerCase();
    slashTreffer = SLASH_EINTRAEGE.filter(([typ, , name]) =>
      !w || name.toLowerCase().includes(w) || typ.includes(w));
    if (!slashTreffer.length) { slashSchliesse(); return; }
    if (slashIndex >= slashTreffer.length) slashIndex = 0;
    if (!slashListe) {
      slashListe = el('div');
      slashListe.id = 'slashliste';
      document.body.append(slashListe);
    }
    slashListe.innerHTML = '';
    slashTreffer.forEach(([typ, zeichen, name], i) => {
      const zeile = el('div', 'at-eintrag' + (i === slashIndex ? ' aktiv' : ''),
        `<b>${escHtml(zeichen)}&nbsp; ${escHtml(name)}</b>`);
      zeile.addEventListener('mousedown', (ev) => ev.preventDefault());
      zeile.addEventListener('click', () => { slashIndex = i; slashUebernehmen(); });
      slashListe.append(zeile);
    });
    const r = window.getSelection().getRangeAt(0).getBoundingClientRect();
    const eigen = slashListe.getBoundingClientRect();
    slashListe.style.left = Math.max(8, Math.min(
      window.innerWidth - eigen.width - 8, r.left)) + 'px';
    slashListe.style.top = Math.min(window.innerHeight - eigen.height - 8, r.bottom + 4) + 'px';
  }

  function slashPruefe(feld, ev) {
    if (ev && ev.isComposing) return;
    const fund = slashVorCursor(feld);
    if (!fund) { slashSchliesse(); return; }
    slashIndex = 0;
    slashZeige(feld, fund);
  }

  function slashUebernehmen() {
    const feld = slashFeld;
    const treffer = slashTreffer[slashIndex];
    if (!feld || !treffer) { slashSchliesse(); return; }
    const fund = slashVorCursor(feld);
    slashSchliesse();
    if (!fund) return;
    /* das getippte /wort entfernen, dann einfügen wie über die Leiste */
    Verlauf.merke(dok(), 'tx:' + feld.dataset.blockId + ':' + (feld.dataset.feld || ''));
    const bereich = document.createRange();
    bereich.setStart(fund.knoten, fund.offset - fund.wort.length - 1);
    bereich.setEnd(fund.knoten, fund.offset);
    bereich.deleteContents();
    feld.dispatchEvent(new Event('input', { bubbles: true }));
    fuegeBlockEin(treffer[0], feld.dataset.blockId);
  }

  /* ---------------- Textfeld ---------------- */

  function textfeld(block, feldname, klassen, leertext, runsAus) {
    const feld = el('div', 'tx ' + klassen);
    feld.contentEditable = 'true';
    feld.spellcheck = true;
    feld.lang = (dok().einstellungen || {}).sprache === 'en' ? 'en' : 'de';
    /* Schreibhilfe aus der Vorlage schlägt den allgemeinen Hinweis */
    feld.dataset.leer = (feldname === 'runs' && block.hinweis) ? block.hinweis : leertext;
    feld.dataset.blockId = block.id;
    feld.dataset.feld = feldname;

    if (feldname === 'text') {
      feld.textContent = block.text || '';
    } else {
      feld.innerHTML = Richtext.zuHtml(runsAus ? runsAus() : block.runs, ctx());
    }

    /* Vor der Änderung merken -- beforeinput feuert, solange das Modell
       noch den alten Stand hat. Aufeinanderfolgende Tastendrücke an
       derselben Stelle verschmelzen zu einem Schritt. */
    feld.addEventListener('beforeinput', () => {
      Verlauf.merke(dok(), 'tx:' + block.id + ':' + feldname);
    });

    feld.addEventListener('input', (ev) => {
      if (feldname === 'text') block.text = feld.textContent;
      else if (runsAus) runsAus(Richtext.vonHtml(feld));
      else block.runs = Richtext.vonHtml(feld);
      App.aenderung({ nurVorschau: true });
      /* Die Gliederung zeigt auch die Kapitel-Wortzahlen -- sie hängt
         also an jedem Tastendruck, nicht nur an Überschriften. */
      zeichneGliederung();
      if (feldname !== 'text') atPruefe(feld, ev);
      slashPruefe(feld, ev);
    });

    feld.addEventListener('focus', () => waehle(block.id, false));

    feld.addEventListener('blur', () => {
      if (atFeld === feld) atSchliesse();
      if (slashFeld === feld) slashSchliesse();
      /* Platzhaltertext verschwindet, sobald wirklich getippt wurde */
      const runs = feldname === 'text' ? null : (block.runs || []);
      if (runs && runs.length === 1 && runs[0].platzhalter) return;
      App.aenderung();
    });

    feld.addEventListener('paste', (ev) => {
      const ablage = ev.clipboardData || window.clipboardData;

      /* Bildschirmfoto in der Zwischenablage -- etwa aus SPSS oder JASP */
      const bild = [...(ablage.items || [])].find(e => e.type.startsWith('image/'));
      if (bild) {
        ev.preventDefault();
        legeBildAn(bild.getAsFile(), indexVon(block.id) + 1);
        return;
      }

      const rohtext = ablage.getData('text/plain');

      /* Ein aus Excel kopierter Bereich wird eine Tabelle, kein Textbrei */
      if (Daten.istTabellarisch(rohtext)) {
        ev.preventDefault();
        legeTabelleAn(rohtext, indexVon(block.id) + 1);
        return;
      }

      /* Sonst nur reiner Text -- so kann Word keine Formatierung einschleppen. */
      ev.preventDefault();
      const text = rohtext;
      const auswahl = window.getSelection();
      if (!auswahl.rangeCount) return;
      const bereich = auswahl.getRangeAt(0);
      bereich.deleteContents();
      const knoten = document.createTextNode(text.replace(/\r/g, ''));
      bereich.insertNode(knoten);
      bereich.setStartAfter(knoten); bereich.collapse(true);
      auswahl.removeAllRanges(); auswahl.addRange(bereich);
      feld.dispatchEvent(new Event('input', { bubbles: true }));
    });

    feld.addEventListener('keydown', (ev) => tasten(ev, block, feld, feldname));
    return feld;
  }

  function tasten(ev, block, feld, feldname) {
    const strg = ev.ctrlKey || ev.metaKey;

    /* Offenes /-Menü: Pfeile wählen, Enter/Tab übernimmt, Escape
       schließt -- alles andere läuft normal weiter. */
    if (slashListe && slashFeld === feld) {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        slashIndex = (slashIndex + (ev.key === 'ArrowDown' ? 1 : slashTreffer.length - 1))
                     % slashTreffer.length;
        const fund = slashVorCursor(feld);
        if (fund) slashZeige(feld, fund); else slashSchliesse();
        return;
      }
      if (ev.key === 'Enter' || ev.key === 'Tab') {
        ev.preventDefault();
        slashUebernehmen();
        return;
      }
      if (ev.key === 'Escape') { ev.preventDefault(); slashSchliesse(); return; }
    }

    /* Offene @-Vorschlagsliste: Pfeile wählen, Enter/Tab übernimmt,
       Escape schließt -- alles andere läuft normal weiter. */
    if (atListe && atFeld === feld) {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        atIndex = (atIndex + (ev.key === 'ArrowDown' ? 1 : atTreffer.length - 1))
                  % atTreffer.length;
        atZeichne();
        return;
      }
      if (ev.key === 'Enter' || ev.key === 'Tab') {
        ev.preventDefault();
        atUebernehmen();
        return;
      }
      if (ev.key === 'Escape') { ev.preventDefault(); atSchliesse(); return; }
    }

    /* Strg+Umschalt+L wie "Literatur". Das frühere Strg+Umschalt+Z
       kollidierte mit der Wiederholen-Konvention (Word, Docs,
       Browser) -- und löste beides zugleich aus. */
    if (strg && ev.shiftKey && ev.key.toLowerCase() === 'l') {
      ev.preventDefault(); App.zitatEinfuegen(); return;
    }
    /* execCommand feuert kein beforeinput -- ohne eigenen Schnappschuss
       ließe sich das Fett nicht zurücknehmen. */
    if (strg && ev.key.toLowerCase() === 'b') { ev.preventDefault(); Verlauf.merke(dok());
      document.execCommand('bold');
      feld.dispatchEvent(new Event('input', { bubbles: true })); return; }
    if (strg && ev.key.toLowerCase() === 'i') { ev.preventDefault(); Verlauf.merke(dok());
      document.execCommand('italic');
      feld.dispatchEvent(new Event('input', { bubbles: true })); return; }

    /* Markdown-Kürzel: "## " am Absatzanfang macht eine Überschrift,
       "- " eine Liste, "1. " eine nummerierte, "> " ein Blockzitat.
       Das Leerzeichen löst aus; ohne Treffer wird es normal getippt. */
    if (ev.key === ' ' && block.typ === 'absatz' && feldname === 'runs') {
      const KUERZEL = { '#': 'ueberschrift:1', '##': 'ueberschrift:2', '###': 'ueberschrift:3',
                        '-': 'liste:punkte', '*': 'liste:punkte', '1.': 'liste:nummern',
                        '>': 'blockzitat' };
      const auswahl = window.getSelection();
      if (auswahl && auswahl.isCollapsed && auswahl.rangeCount &&
          feld.contains(auswahl.getRangeAt(0).startContainer)) {
        const vor = document.createRange();
        vor.selectNodeContents(feld);
        vor.setEnd(auswahl.getRangeAt(0).startContainer, auswahl.getRangeAt(0).startOffset);
        const praefix = vor.toString().replace(UNSICHTBARE, '');
        const ziel = KUERZEL[praefix];
        if (ziel && !vor.cloneContents().querySelector('.chip')) {
          const alle = Richtext.vonHtml(feld);
          const rest = alle.length && alle[0].text != null
            ? [{ ...alle[0], text: alle[0].text.slice(praefix.length) }, ...alle.slice(1)]
                .filter(r => r.text !== '')
            : alle;
          /* Eine Überschrift verträgt keine Chips -- dann bleibt es
             ein normales Leerzeichen. */
          if (!(ziel.startsWith('ueberschrift') && rest.some(r => r.text == null))) {
            ev.preventDefault();
            Verlauf.merke(dok());
            block.runs = rest;
            wandleUm(block.id, ziel, true);
            return;
          }
        }
      }
    }

    /* Pfeile über die Blockgrenze: am Rand des Felds geht es im
       nächsten (oder vorigen) Textfeld weiter -- wie in Word.
       Bausteine ohne Textfeld (Tabelle, Diagramm) werden übersprungen. */
    if (!strg && !ev.shiftKey && !ev.altKey &&
        ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(ev.key)) {
      const lage = randlage(feld);
      if (lage) {
        const vorwaerts = ev.key === 'ArrowDown' ? lage.letzte
                        : ev.key === 'ArrowRight' ? lage.ende : false;
        const zurueck   = ev.key === 'ArrowUp'   ? lage.erste
                        : ev.key === 'ArrowLeft' ? lage.anfang : false;
        if (vorwaerts || zurueck) {
          const felder = alleFelder();
          const p = felder.indexOf(feld);
          const ziel = p >= 0 ? felder[p + (vorwaerts ? 1 : -1)] : null;
          if (ziel) {
            ev.preventDefault();
            fokusFeld(ziel, zurueck);        // rückwärts: ans Ende
          }
        }
      }
      return;
    }

    /* Enter teilt an der Schreibmarke -- wie in Word. Steht sie am Ende,
       ist der abgeschnittene Teil leer und es entsteht schlicht ein
       neuer, leerer Absatz. Mit Strg gehört die Taste dem Bauen
       (80-app.js) und darf hier nichts anrichten.                    */
    if (ev.key === 'Enter' && !ev.shiftKey && !strg) {
      ev.preventDefault();
      if (block.typ === 'liste') return;                 // Listen regeln das selbst

      Verlauf.merke(dok());
      const schwanz = schneideAbCursor(feld);
      if (feldname === 'text') block.text = feld.textContent;
      else block.runs = Richtext.vonHtml(feld);

      // Der Rumpf einer geteilten Überschrift wird zum Absatz -- eine
      // halbe Überschrift will niemand.
      const neu = Modell.neuerBlock('absatz', { runs: schwanz });
      dok().bloecke.splice(indexVon(block.id) + 1, 0, neu);
      App.aenderung();
      zeichne(); zeichneGliederung();
      fokussiereAn(neu.id, 0);
      return;
    }

    if (ev.key === 'Backspace') {
      if (block.typ === 'liste') return;               // Listen regeln das selbst
      const auswahl = window.getSelection();
      const amAnfang = auswahl.isCollapsed && auswahl.anchorOffset === 0 &&
                       (feld.firstChild === auswahl.anchorNode ||
                        feld === auswahl.anchorNode || !feld.textContent);
      if (!amAnfang) return;

      const i = indexVon(block.id);
      if (i <= 0) return;
      const vorher = dok().bloecke[i - 1];
      const leer = feldname === 'text' ? !(block.text || '').trim()
                                       : !feld.textContent.trim();

      /* Voller Absatz am Anfang: mit dem darüber verschmelzen. Nur unter
         Textbausteinen -- einen Absatz in eine Tabelle zu schieben ergibt
         keinen Sinn.                                                   */
      if (!leer && TEXTBLOECKE.includes(block.typ) && TEXTBLOECKE.includes(vorher.typ)) {
        ev.preventDefault();
        Verlauf.merke(dok());
        const kopf = vorher.runs || [];
        const naht = Richtext.zuText(kopf, ctx()).length;
        vorher.runs = [...kopf, ...(feldname === 'text'
          ? [{ text: block.text || '' }] : Richtext.vonHtml(feld))];
        dok().bloecke.splice(i, 1);
        App.aenderung();
        zeichne(); zeichneGliederung();
        fokussiereAn(vorher.id, naht);
        return;
      }

      if (leer && dok().bloecke.length > 1) {
        ev.preventDefault();
        Verlauf.merke(dok());
        dok().bloecke.splice(i, 1);
        App.aenderung();
        zeichne(); zeichneGliederung();
        fokussiere(vorher.id, true);
      }
    }
  }

  /* ---------------- Bilder und Tabellen anlegen ---------------- */

  const BILDARTEN = /^image\/(png|jpe?g|gif)$/;

  function legeBildAn(datei, stelle) {
    if (!datei) return;
    if (!BILDARTEN.test(datei.type)) {
      App.melde('LaTeX kann nur PNG, JPEG und GIF einbinden — dieses Format nicht.', true);
      return;
    }
    if (datei.size > 12 * 1024 * 1024) {
      App.melde('Das Bild ist größer als 12 MB. Bitte vorher verkleinern.', true);
      return;
    }
    const leser = new FileReader();
    leser.onload = () => {
      Verlauf.merke(dok());
      const block = Modell.neuerBlock('abbildung', {
        datenUrl: leser.result,
        dateiname: datei.name || 'bildschirmfoto.png',
        titel: '', breite: 80
      });
      dok().bloecke.splice(stelle, 0, block);
      App.aenderung();
      zeichne(); zeichneGliederung();
      waehle(block.id);
      App.melde('Abbildung eingefügt — den Titel tippst du direkt an der Karte.');
    };
    leser.onerror = () => App.melde('Das Bild ließ sich nicht lesen.', true);
    leser.readAsDataURL(datei);
  }

  function legeTabelleAn(text, stelle) {
    const gitter = Daten.lies(text);
    if (!gitter) { App.melde('Daraus konnte ich keine Tabelle machen.', true); return; }
    /* Erste Spalte ist fast immer die Beschriftung, der Rest Zahlen --
       also links ausrichten und den Rest zentrieren. */
    const ausrichtung = gitter.kopf.map((_, i) =>
      i === 0 || !gitter.zeilen.every(z => Daten.istZahl(z[i])) ? 'l' : 'c');
    Verlauf.merke(dok());
    const block = Modell.neuerBlock('tabelle', {
      titel: '', anmerkung: '',
      kopf: gitter.kopf, zeilen: gitter.zeilen, spaltenAusrichtung: ausrichtung
    });
    dok().bloecke.splice(stelle, 0, block);
    App.aenderung();
    zeichne(); zeichneGliederung();
    waehle(block.id);
    App.melde(`Tabelle mit ${gitter.zeilen.length} Zeilen eingefügt — Titel direkt ` +
              'an der Karte, „📊 Diagramm daraus“ oben in der Objektleiste.');
  }

  /* Der kurze Weg von den Zahlen zum Bild: ein Diagramm, das auf die
     Tabelle ZEIGT (kopiert wird nichts -- ändert sich die Tabelle,
     ändert sich das Diagramm mit). Reine Zahlenspalten sind vorgewählt,
     Art und Beschriftung klärt der Dialog. */
  async function legeDiagrammAnAusTabelle(tabelle) {
    const spalten = (tabelle.kopf || []).map((_, i) => i).filter(i => i !== 0);
    const zahlen = spalten.filter(i =>
      (tabelle.zeilen || []).every(z => Daten.istZahl(z[i])));
    const block = Modell.neuerBlock('diagramm', {
      quelle: 'tabelle', tabelleId: tabelle.id, xSpalte: 0,
      wertSpalten: (zahlen.length ? zahlen : spalten).slice(0, 4)
    });
    if (!await Diagrammdialog.einrichten(block, dok())) return;
    Verlauf.merke(dok());
    dok().bloecke.splice(indexVon(tabelle.id) + 1, 0, block);
    App.aenderung(); zeichne(); zeichneGliederung();
    waehle(block.id);
  }

  /* Wo zwischen den Bausteinen zeigt der Mauszeiger gerade hin? */
  function stelleAus(ev) {
    const kaesten = [...document.querySelectorAll('.block')];
    for (let i = 0; i < kaesten.length; i++) {
      const r = kaesten[i].getBoundingClientRect();
      if (ev.clientY < r.top + r.height / 2) return i;
    }
    return kaesten.length;
  }

  function verdrahteDateiablage() {
    const flaeche = document.getElementById('blockliste');
    if (!flaeche || flaeche.dataset.ablageBereit) return;
    flaeche.dataset.ablageBereit = '1';

    const marke = el('div', 'einfuegemarke');
    const zeigeMarke = (stelle) => {
      const kaesten = [...document.querySelectorAll('.block')];
      marke.remove();
      if (stelle >= kaesten.length) flaeche.append(marke);
      else kaesten[stelle].before(marke);
    };

    flaeche.addEventListener('dragover', (ev) => {
      if (ziehtId) return;                       // Baustein verschieben, kein Datei-Ablegen
      if (![...(ev.dataTransfer.types || [])].includes('Files')) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
      zeigeMarke(stelleAus(ev));
    });
    flaeche.addEventListener('dragleave', (ev) => {
      if (!flaeche.contains(ev.relatedTarget)) marke.remove();
    });
    flaeche.addEventListener('drop', (ev) => {
      if (ziehtId || !ev.dataTransfer.files.length) return;
      ev.preventDefault();
      const stelle = stelleAus(ev);
      marke.remove();
      for (const datei of ev.dataTransfer.files) {
        if (BILDARTEN.test(datei.type)) { legeBildAn(datei, stelle); break; }
        if (/\.(csv|tsv|txt)$/i.test(datei.name)) {
          datei.text().then(t => legeTabelleAn(t, stelle));
          break;
        }
        App.melde(`Mit „${datei.name}“ kann ich hier nichts anfangen.`, true);
        break;
      }
    });
  }

  /* ---------------- Chips bearbeiten ----------------
     Ein Klick auf einen eingefügten Chip öffnet den passenden Dialog,
     vorbelegt mit dem aktuellen Stand. Ersetzt (oder entfernt) wird
     direkt im DOM; das anschließende input-Ereignis lässt
     Richtext.vonHtml das Modell neu einlesen -- derselbe Weg, den
     fuegeAmCursorEin schon geht.                                     */

  function verdrahteChipKlick() {
    const flaeche = document.getElementById('blockliste');
    if (!flaeche || flaeche.dataset.chipsBereit) return;
    flaeche.dataset.chipsBereit = '1';
    flaeche.addEventListener('click', (ev) => {
      const chip = ev.target.closest('.tx .chip');
      if (!chip) return;
      ev.preventDefault();
      bearbeiteChip(chip);
    });
  }

  async function bearbeiteChip(chip) {
    const feld = chip.closest('.tx');
    const d = chip.dataset;
    let neu = null;
    if (d.typ === 'zitat') {
      neu = await Dialoge.zitatEinfuegen(dok(), { bearbeiten: true,
        vorbelegung: { zitat: d.key, form: d.form, seite: d.seite } });
    } else if (d.typ === 'fussnote') {
      neu = await Dialoge.fussnote(d.text, { bearbeiten: true });
      if (typeof neu === 'string') neu = { fussnote: neu };
    } else if (d.typ === 'kennwert') {
      neu = await Dialoge.kennwert({ kennwert: d.sym, wert: d.wert }, { bearbeiten: true });
    } else if (d.typ === 'verweis') {
      neu = await Dialoge.verweisEinfuegen(dok(), { bearbeiten: true, vorbelegung: d.ziel });
    } else if (d.typ === 'formel') {
      neu = await Formeldialog.inline({ formel: d.tex }, { bearbeiten: true });
    }
    if (!neu || !feld || !document.contains(chip)) return;

    Verlauf.merke(dok());
    if (neu.entfernen) {
      chip.remove();
    } else {
      const huelle = document.createElement('template');
      huelle.innerHTML = chipHtml(neu);
      chip.replaceWith(huelle.content);
    }
    feld.dispatchEvent(new Event('input', { bubbles: true }));
    App.aenderung();
  }

  /* ---------------- Teilen und Zusammenführen ----------------
     Beides über den DOM statt über Zeichenpositionen: ein Zitat oder ein
     Querverweis ist ein unteilbares Element, und der Cursor kann darin
     gar nicht stehen. Rechnete man mit Indizes, müsste man das eigens
     abfangen -- so ergibt es sich von selbst.                        */

  function schneideAbCursor(feld) {
    const auswahl = window.getSelection();
    if (!auswahl || !auswahl.rangeCount) return [];
    const marke = auswahl.getRangeAt(0);
    if (!feld.contains(marke.startContainer)) return [];
    const hinten = document.createRange();
    hinten.selectNodeContents(feld);
    hinten.setStart(marke.startContainer, marke.startOffset);
    const schwanz = hinten.extractContents();      // schneidet aus dem Feld
    return Richtext.vonHtml(schwanz);
  }

  /* Schreibmarke an eine Zeichenposition setzen. Chips zählen als ein
     Stück -- die Marke darf niemals in ihnen landen. */
  function setzeMarke(feld, position) {
    const bereich = document.createRange();
    let rest = position;
    const gehe = (knoten) => {
      for (const k of knoten.childNodes) {
        if (k.nodeType === 3) {
          if (rest <= k.nodeValue.length) { bereich.setStart(k, rest); return true; }
          rest -= k.nodeValue.length;
        } else if (k.nodeType === 1) {
          if (k.classList && k.classList.contains('chip')) {
            const l = (k.textContent || '').length;
            if (rest <= l) { bereich.setStartAfter(k); return true; }
            rest -= l;
          } else if (gehe(k)) { return true; }
        }
      }
      return false;
    };
    if (!gehe(feld)) { bereich.selectNodeContents(feld); bereich.collapse(false); }
    else bereich.collapse(true);
    const auswahl = window.getSelection();
    auswahl.removeAllRanges();
    auswahl.addRange(bereich);
  }

  /* ---------------- Schreibmarke am Feldrand ----------------
     Für die Pfeilnavigation über Blockgrenzen: Steht die Marke am
     Anfang/Ende bzw. in der ersten/letzten Zeile ihres Felds?      */

  const UNSICHTBARE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g;

  function randlage(feld) {
    const auswahl = window.getSelection();
    if (!auswahl || !auswahl.rangeCount || !auswahl.isCollapsed) return null;
    const marke = auswahl.getRangeAt(0);
    if (!feld.contains(marke.startContainer)) return null;

    const vor = document.createRange();
    vor.selectNodeContents(feld);
    vor.setEnd(marke.startContainer, marke.startOffset);
    const nach = document.createRange();
    nach.selectNodeContents(feld);
    nach.setStart(marke.startContainer, marke.startOffset);
    const anfang = !vor.toString().replace(UNSICHTBARE, '').length;
    const ende = !nach.toString().replace(UNSICHTBARE, '').length;

    /* Erste/letzte Zeile über die Cursor-Rechtecke; ein leeres Feld
       hat keine, dann zählt Anfang/Ende. */
    let erste = anfang, letzte = ende;
    const cr = marke.getClientRects()[0];
    if (cr && (cr.height || cr.width)) {
      const fr = feld.getBoundingClientRect();
      const zeile = parseFloat(getComputedStyle(feld).lineHeight) || 24;
      erste = cr.top - fr.top < zeile * 0.9;
      letzte = fr.bottom - cr.bottom < zeile * 0.9;
    }
    return { anfang, ende, erste, letzte };
  }

  /* Alle Textfelder in Leserichtung -- auch die einzelnen Punkte
     einer Liste. */
  const alleFelder = () => [...document.querySelectorAll('#blockliste .tx')];

  function fokusFeld(feld, ansEnde) {
    feld.focus();
    const bereich = document.createRange();
    bereich.selectNodeContents(feld);
    bereich.collapse(!ansEnde);
    const auswahl = window.getSelection();
    auswahl.removeAllRanges();
    auswahl.addRange(bereich);
  }

  const TEXTBLOECKE = ['absatz', 'blockzitat'];

  function fokussiereAn(id, position, feldname) {
    setTimeout(() => {
      /* Ein Baustein kann mehrere Felder haben (Titel und Anmerkung einer
         Tabelle etwa). Ohne Angabe nimmt man das erste. */
      const feld = (feldname && document.querySelector(
                      `.tx[data-block-id="${id}"][data-feld="${feldname}"]`))
                || document.querySelector(`.tx[data-block-id="${id}"]`);
      if (feld) { feld.focus(); setzeMarke(feld, position); }
    }, 10);
  }

  function fokussiere(id, ansEnde) {
    setTimeout(() => {
      const feld = document.querySelector(`.tx[data-block-id="${id}"]`);
      if (!feld) return;
      feld.focus();
      if (ansEnde) {
        const bereich = document.createRange();
        bereich.selectNodeContents(feld);
        bereich.collapse(false);
        const auswahl = window.getSelection();
        auswahl.removeAllRanges(); auswahl.addRange(bereich);
      }
    }, 10);
  }

  /* ---------------- Blockdarstellung ---------------- */

  /* Nur noch das Universelle -- alles Typspezifische wohnt oben in der
     Objektleiste (63-kontextleiste.js), die am gewählten Baustein hängt. */
  function werkzeugleiste(block) {
    const leiste = el('div', 'blockleiste');
    const w = (zeichen, titel, aktion, klasse) => {
      const b = el('button', klasse || null, zeichen);
      b.title = titel;
      b.type = 'button';
      b.addEventListener('mousedown', (ev) => ev.preventDefault());
      b.addEventListener('click', (ev) => { ev.stopPropagation(); aktion(); });
      return b;
    };
    leiste.append(
      w('↑', 'Nach oben', () => verschiebe(block.id, -1)),
      w('↓', 'Nach unten', () => verschiebe(block.id, +1)),
      w('⧉', 'Baustein duplizieren (Strg+D)', () => dupliziere(block.id)),
      w('✕', 'Baustein löschen', () => loesche(block.id), 'gefahr')
    );
    return leiste;
  }

  /* Der Titel einer Karte (Tabelle, Abbildung, Diagramm): direkt an
     der Karte tippbar. Die Objektleiste oben bleibt der Zweitweg;
     beide halten sich gegenseitig aktuell -- nie aber das Feld, in
     dem gerade getippt wird, sonst spränge die Schreibmarke. */
  function kartenTitel(block, leertext) {
    const t = el('span', 'karte-titel');
    t.contentEditable = 'true';
    t.spellcheck = true;
    t.dataset.leer = leertext;
    t.textContent = block.titel || '';
    t.addEventListener('beforeinput', () => Verlauf.merke(dok(), 'titel:' + block.id));
    t.addEventListener('input', () => {
      block.titel = t.textContent.replace(/\n/g, ' ');
      const eingabe = document.querySelector(
        '#kontextleiste .ktx-eingabe[data-feld="titel"]');
      if (eingabe && eingabe !== document.activeElement) eingabe.value = block.titel;
      App.aenderung({ nurVorschau: true });
    });
    t.addEventListener('blur', () => App.aenderung());
    t.addEventListener('keydown', (ev) => {
      /* Ein Titel ist einzeilig: Enter beendet die Eingabe. */
      if (ev.key === 'Enter') { ev.preventDefault(); t.blur(); }
    });
    t.addEventListener('paste', (ev) => {
      /* immer reiner Text, einzeilig */
      ev.preventDefault();
      const roh = (ev.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, roh.replace(/\s+/g, ' ').trim());
    });
    return t;
  }

  function blockInhalt(block, nummern) {
    const info = nummern.get(block.id) || {};
    switch (block.typ) {

      case 'ueberschrift': {
        const zeile = el('div', 'ueberschrift-zeile');
        const praefix = info.imAnhang && (block.ebene || 1) === 1 ? 'Anhang ' : '';
        zeile.append(el('span', 'ueberschrift-nr', escHtml(praefix + (info.nummer || ''))));
        zeile.append(textfeld(block, 'text', 'tx-h' + (block.ebene || 1), 'Überschrift …'));
        return zeile;
      }

      case 'absatz':
        return textfeld(block, 'runs', '', 'Hier schreiben …');

      case 'blockzitat': {
        const box = el('div');
        box.append(textfeld(block, 'runs', 'tx-zitat', 'Wörtliches Zitat ab etwa 40 Wörtern …'));
        const q = dok().quellen.find(x => x.key === block.quelle);
        box.append(el('div', 'karte-anm',
          q ? `Quelle: ${escHtml(Zitate.imText(q, 'klammer', block.seite,
                                              (dok().einstellungen || {}).sprache))}`
            : '<i>Noch keine Quelle festgelegt — oben in der Objektleiste auf „§ Quelle“ klicken.</i>'));
        return box;
      }

      case 'liste': {
        const tag = block.ordnung === 'nummern' ? 'ol' : 'ul';
        const liste = el(tag);
        liste.style.cssText = 'margin:0;padding-left:1.5em';
        (block.punkte || [[]]).forEach((punkt, i) => {
          const li = el('li');
          li.style.marginBottom = '2px';
          const feld = textfeld(block, 'runs',
            '', 'Listenpunkt …', (neu) => {
              if (neu === undefined) return block.punkte[i] || [];
              block.punkte[i] = neu;
            });
          /* Marke nach dem Neuzeichnen in einen bestimmten Punkt setzen. */
          const fokusPunkt = (nr, stelle) => setTimeout(() => {
            const felder = document.querySelectorAll(
              `.block[data-id="${block.id}"] .tx`);
            const ziel = felder[nr];
            if (!ziel) return;
            if (stelle == null) fokusFeld(ziel, true);
            else { ziel.focus(); setzeMarke(ziel, stelle); }
          }, 10);

          feld.addEventListener('keydown', (ev) => {
            const strg = ev.ctrlKey || ev.metaKey;
            const leerer = !feld.textContent.trim();

            if (ev.key === 'Enter' && !ev.shiftKey && !strg) {
              ev.preventDefault();
              /* Enter im leeren letzten Punkt verlässt die Liste --
                 der Punkt verschwindet, darunter beginnt ein Absatz.
                 War es der einzige, verschwindet die Liste ganz. */
              if (leerer && i === block.punkte.length - 1) {
                Verlauf.merke(dok());
                const stelle = indexVon(block.id);
                const neu = Modell.neuerBlock('absatz');
                if (block.punkte.length === 1) {
                  dok().bloecke.splice(stelle, 1, neu);
                } else {
                  block.punkte.splice(i, 1);
                  dok().bloecke.splice(stelle + 1, 0, neu);
                }
                App.aenderung(); zeichne(); zeichneGliederung();
                fokussiere(neu.id);
                return;
              }
              Verlauf.merke(dok());
              block.punkte.splice(i + 1, 0, []);
              App.aenderung(); zeichne();
              fokusPunkt(i + 1);
              return;
            }

            if (ev.key !== 'Backspace') return;
            const auswahl = window.getSelection();
            const amAnfang = auswahl && auswahl.isCollapsed && auswahl.anchorOffset === 0 &&
                             (feld.firstChild === auswahl.anchorNode ||
                              feld === auswahl.anchorNode || !feld.textContent);
            if (!amAnfang) return;

            if (leerer && block.punkte.length === 1) {
              /* der letzte leere Punkt: die Liste verschwindet wie ein
                 leerer Absatz */
              if (dok().bloecke.length <= 1) return;
              ev.preventDefault();
              Verlauf.merke(dok());
              const stelle = indexVon(block.id);
              dok().bloecke.splice(stelle, 1);
              App.aenderung(); zeichne(); zeichneGliederung();
              const vorher = dok().bloecke[Math.max(0, stelle - 1)];
              if (vorher) fokussiere(vorher.id, true);
              return;
            }
            if (leerer) {
              ev.preventDefault();
              Verlauf.merke(dok());
              block.punkte.splice(i, 1);
              App.aenderung(); zeichne();
              fokusPunkt(Math.max(0, i - 1));
              return;
            }
            if (i > 0) {
              /* voller Punkt am Anfang: mit dem darüber verschmelzen */
              ev.preventDefault();
              Verlauf.merke(dok());
              const kopf = block.punkte[i - 1] || [];
              const naht = Richtext.zuText(kopf, ctx()).length;
              block.punkte[i - 1] = [...kopf, ...Richtext.vonHtml(feld)];
              block.punkte.splice(i, 1);
              App.aenderung(); zeichne();
              fokusPunkt(i - 1, naht);
            }
          });
          li.append(feld);
          liste.append(li);
        });
        return liste;
      }

      case 'tabelle': {
        const karte = el('div', 'tab-karte');
        const kartenkopf = el('div', 'karte-kopf',
          `<span class="karte-nr">TABELLE ${escHtml(info.nummer || '?')}</span>`);
        kartenkopf.append(kartenTitel(block, 'Titel der Tabelle eintragen …'));
        karte.append(kartenkopf);

        const neuZeichnenTabelle = () => {
          App.aenderung(); zeichne(); waehle(block.id, false);
        };
        const merkeTabelle = () => Verlauf.merke(dok());

        /* Einfügen IN eine Zelle: ein aus Excel kopierter Bereich wird
           zellenweise ab der Zielzelle verteilt -- Zeilen und Spalten
           wachsen bei Bedarf mit. Einzelne Werte kommen als reiner
           Text, damit Word keine Formatierung einschleppt. */
        const sichereSpalte = (sp) => {
          while (block.kopf.length <= sp) {
            block.kopf.push('');
            (block.spaltenAusrichtung = block.spaltenAusrichtung || []).push('c');
            block.zeilen.forEach(r => { while (r.length < block.kopf.length) r.push(''); });
          }
        };
        const verteileAb = (z0, s0, gitter) => {
          merkeTabelle();
          gitter.forEach((zeile, i) => {
            const z = z0 + i;
            zeile.forEach((wert, j) => {
              const sp = s0 + j;
              sichereSpalte(sp);
              if (z < 0) { block.kopf[sp] = wert.trim(); return; }
              while (block.zeilen.length <= z) block.zeilen.push(block.kopf.map(() => ''));
              block.zeilen[z][sp] = wert.trim();
            });
          });
          neuZeichnenTabelle();
        };
        /* z0 = -1 heißt: die erste eingefügte Zeile landet im Kopf. */
        const zellenPaste = (ev, z0, s0) => {
          const ablage = ev.clipboardData || window.clipboardData;
          const roh = String((ablage && ablage.getData('text/plain')) || '');
          ev.preventDefault();
          const zeilenRoh = roh.replace(/\r\n?/g, '\n').split('\n');
          while (zeilenRoh.length && zeilenRoh[zeilenRoh.length - 1].trim() === '')
            zeilenRoh.pop();
          const gitter = zeilenRoh.map(z => z.split('\t'));
          if (gitter.length > 1 || (gitter[0] || []).length > 1) {
            verteileAb(z0, s0, gitter);
          } else {
            merkeTabelle();
            document.execCommand('insertText', false, roh.replace(/\s+/g, ' ').trim());
          }
        };

        const huelle = el('div', 'tabgitter');
        const tabelle = el('table');

        /* Spaltenleiste: Ausrichtung und Löschen. Erscheint erst beim
           Überfahren, damit die Karte ruhig bleibt. */
        const leiste = el('tr', 'spaltenleiste');
        (block.kopf || []).forEach((_, s) => {
          const zelle = el('th');
          const gruppe = el('div', 'spaltenwerkzeug');
          const aktuell = (block.spaltenAusrichtung || [])[s] || 'l';
          for (const [wert, zeichen, titel] of
               [['l', '⇤', 'linksbündig'], ['c', '↔', 'zentriert'], ['r', '⇥', 'rechtsbündig']]) {
            const k = el('button', aktuell === wert ? 'aktiv' : null, zeichen);
            k.title = 'Spalte ' + titel;
            k.addEventListener('click', () => {
              merkeTabelle();
              block.spaltenAusrichtung = block.kopf.map((_, i) =>
                (block.spaltenAusrichtung || [])[i] || 'l');
              block.spaltenAusrichtung[s] = wert;
              neuZeichnenTabelle();
            });
            gruppe.append(k);
          }
          const weg = el('button', 'gefahr', '✕');
          weg.title = 'Spalte löschen';
          weg.addEventListener('click', () => {
            if (block.kopf.length <= 1) { App.melde('Die letzte Spalte bleibt.', true); return; }
            merkeTabelle();
            block.kopf.splice(s, 1);
            block.zeilen.forEach(z => z.splice(s, 1));
            (block.spaltenAusrichtung || []).splice(s, 1);
            neuZeichnenTabelle();
          });
          gruppe.append(weg);
          zelle.append(gruppe);
          leiste.append(zelle);
        });
        leiste.append(el('th'));                 // Platz über der Zeilenspalte
        tabelle.append(leiste);

        const kopfzeile = el('tr');
        (block.kopf || []).forEach((h, s) => {
          const th = el('th');
          th.contentEditable = 'true';
          th.textContent = h;
          th.addEventListener('beforeinput', () => Verlauf.merke(dok(), 'kopf:' + block.id + ':' + s));
          th.addEventListener('input', () => { block.kopf[s] = th.textContent; App.aenderung({ nurVorschau: true }); });
          th.addEventListener('blur', () => App.aenderung());
          th.addEventListener('paste', (ev) => zellenPaste(ev, -1, s));
          kopfzeile.append(th);
        });
        kopfzeile.append(el('th', 'randspalte'));
        tabelle.append(el('thead').appendChild(kopfzeile).parentElement);

        const koerper = el('tbody');
        (block.zeilen || []).forEach((zeile, z) => {
          const tr = el('tr');
          zeile.forEach((wert, s) => {
            const td = el('td');
            td.contentEditable = 'true';
            td.textContent = wert;
            td.style.textAlign = { l: 'left', c: 'center', r: 'right' }[(block.spaltenAusrichtung || [])[s]] || 'left';
            td.addEventListener('beforeinput', () => Verlauf.merke(dok(), 'zelle:' + block.id + ':' + z + ':' + s));
            td.addEventListener('input', () => { block.zeilen[z][s] = td.textContent; App.aenderung({ nurVorschau: true }); });
            td.addEventListener('blur', () => App.aenderung());
            td.addEventListener('paste', (ev) => zellenPaste(ev, z, s));
            /* Tabulator am Ende der letzten Zelle hängt eine Zeile an --
               so tippt man eine Tabelle durch, ohne zur Maus zu greifen. */
            td.addEventListener('keydown', (ev) => {
              if (ev.key !== 'Tab' || ev.shiftKey) return;
              if (s !== zeile.length - 1 || z !== block.zeilen.length - 1) return;
              ev.preventDefault();
              merkeTabelle();
              block.zeilen.push(block.kopf.map(() => ''));
              neuZeichnenTabelle();
              setTimeout(() => {
                const zellen = document.querySelectorAll(
                  `.block[data-id="${block.id}"] tbody tr:last-child td`);
                if (zellen[0]) zellen[0].focus();
              }, 20);
            });
            tr.append(td);
          });
          const rand = el('td', 'randspalte');
          const weg = el('button', 'zeileweg', '✕');
          weg.title = 'Zeile löschen';
          weg.addEventListener('click', () => {
            if (block.zeilen.length <= 1) { App.melde('Die letzte Zeile bleibt.', true); return; }
            merkeTabelle();
            block.zeilen.splice(z, 1);
            neuZeichnenTabelle();
          });
          rand.append(weg);
          tr.append(rand);
          koerper.append(tr);
        });
        tabelle.append(koerper);
        huelle.append(tabelle);
        karte.append(huelle);
        if (block.anmerkung)
          karte.append(el('div', 'karte-anm', `<i>Anmerkung.</i> ${Latex.textMitTokens(block.anmerkung, 'html')}`));
        return karte;
      }

      case 'abbildung': {
        const karte = el('div', 'abb-karte');
        const kartenkopf = el('div', 'karte-kopf',
          `<span class="karte-nr">ABBILDUNG ${escHtml(info.nummer || '?')}</span>`);
        kartenkopf.append(kartenTitel(block, 'Titel der Abbildung eintragen …'));
        karte.append(kartenkopf);
        if (block.datenUrl) {
          const bild = el('img', 'abb-vorschau');
          bild.src = block.datenUrl;
          bild.alt = block.titel || '';
          bild.style.width = (block.breite || 80) + '%';
          karte.append(bild);
        } else {
          const leer = el('div', 'abb-leer',
            '<div style="font-size:20px">&#128247;</div><div>Noch kein Bild — hier klicken</div>');
          leer.addEventListener('click', async () => {
            if (await Dialoge.abbildung(block)) { App.aenderung(); zeichne(); }
          });
          karte.append(leer);
        }
        if (block.anmerkung)
          karte.append(el('div', 'karte-anm', `<i>Anmerkung.</i> ${Latex.textMitTokens(block.anmerkung, 'html')}`));
        return karte;
      }

      case 'diagramm': {
        const karte = el('div', 'abb-karte');
        const art = (Diagrammdialog.ARTEN[block.art] || {}).name || block.art;
        const kartenkopf = el('div', 'karte-kopf',
          `<span class="karte-nr">ABBILDUNG ${escHtml(info.nummer || '?')}</span>`);
        kartenkopf.append(kartenTitel(block, 'Titel des Diagramms eintragen …'));
        karte.append(kartenkopf);
        const gitter = Diagramm.gitterVon(block, dok());
        const reihen = gitter ? Diagramm.wertSpalten(block, gitter).length : 0;
        const quelle = block.quelle === 'tabelle'
          ? 'aus einer Tabelle im Dokument'
          : `${gitter ? gitter.zeilen.length : 0} Zeilen eigene Zahlen`;
        karte.append(el('div', 'diagrammkarte',
          `<span class="diagrammzeichen">${escHtml((Diagrammdialog.ARTEN[block.art] || {}).zeichen || '📊')}</span>
           <div><b>${escHtml(art)}</b>
             <div class="quelle-warn">${escHtml(quelle)} · ${reihen}
               ${reihen === 1 ? 'Reihe' : 'Reihen'}${block.graustufen ? ' · Graustufen' : ''}</div>
             <div class="quelle-warn">Wie es aussieht, steht rechts im PDF.</div>
           </div>`));
        if (block.anmerkung)
          karte.append(el('div', 'karte-anm',
            `<i>Anmerkung.</i> ${Latex.textMitTokens(block.anmerkung, 'html')}`));
        return karte;
      }

      case 'formel': {
        const karte = el('div', 'formel-karte');
        if (block.tex) {
          /* Gesetzt statt Quelltext. Was die Vorschau nicht lesen
             kann, bleibt als Quelltext stehen -- das PDF entscheidet. */
          const v = Mathe.vorschauHtml(block.tex, true);
          karte.innerHTML =
            `<div class="formel-satz">${v.html}</div>` +
            (block.nummeriert
              ? `<span class="formel-nr" title="Nummerierte Formel — per Querverweis ansprechbar">(${
                  escHtml(info.nummer || '?')})</span>`
              : '');
          karte.title = 'Doppelklick zum Bearbeiten';
        } else {
          karte.innerHTML = '<span style="color:var(--tinte-3)">Leere Formel — anklicken</span>';
        }
        const bearbeiten = async () => {
          Verlauf.merke(dok());
          if (await Dialoge.formel(block)) { App.aenderung(); zeichne(); }
          else Verlauf.verwerfeLetzten();
        };
        if (block.tex) karte.addEventListener('dblclick', bearbeiten);
        else karte.addEventListener('click', bearbeiten);
        return karte;
      }

      case 'seitenumbruch':
        return el('div', 'umbruch-marke', '<span>Neue Seite</span>');

      case 'anhangstart':
        return el('div', 'umbruch-marke anhang-marke',
          '<span>Ab hier Anhang &mdash; A, B, C statt 1, 2, 3</span>');

      default:
        return el('div', null, escHtml('Unbekannter Baustein: ' + block.typ));
    }
  }

  /* ---------------- Umsortieren und Löschen ---------------- */

  /* Eine einmal eingerichtete Tabelle als Vorlage für die nächste --
     der naheliegendste Weg. Bilddaten sind nur eine Zeichenkette und
     werden geteilt, nicht kopiert. */
  function dupliziere(id) {
    const b = findeBlock(id);
    if (!b) return;
    if (b.typ === 'anhangstart') { App.melde('Es gibt schon einen Anhangbeginn.', true); return; }
    Verlauf.merke(dok());
    const kopie = Verlauf.klone(b);
    kopie.id = Modell.neueId();
    dok().bloecke.splice(indexVon(id) + 1, 0, kopie);
    App.aenderung(); zeichne(); zeichneGliederung();
    waehle(kopie.id);
  }

  /* ---------------- Umwandeln ----------------
     Ein Textbaustein wechselt seine Art, der Inhalt bleibt: Absatz zu
     Überschrift, Liste zu Absätzen und so weiter. `still` sagt, dass
     der Aufrufer den Verlauf schon gemerkt hat (Markdown-Kürzel).   */

  const WANDELBAR = ['absatz', 'ueberschrift', 'liste', 'blockzitat'];

  function wandleUm(id, ziel, still) {
    const block = findeBlock(id);
    if (!block) return false;
    const [art, extra] = String(ziel).split(':');

    /* Gleiche Art: nur Ebene bzw. Ordnung stellen. */
    if (art === block.typ) {
      if (art === 'ueberschrift' && (block.ebene || 1) !== +extra) {
        if (!still) Verlauf.merke(dok());
        block.ebene = +extra;
      } else if (art === 'liste' && block.ordnung !== extra) {
        if (!still) Verlauf.merke(dok());
        block.ordnung = extra;
      } else return true;
      App.aenderung(); zeichne(); zeichneGliederung();
      waehle(id, false);
      return true;
    }

    if (!WANDELBAR.includes(block.typ) || !WANDELBAR.includes(art)) return false;

    /* Eine Liste wird zu Absätzen: je Punkt einer -- wie in Word. */
    if (block.typ === 'liste') {
      if (art !== 'absatz') {
        App.melde('Eine Liste lässt sich nur in Absätze umwandeln — je Punkt einer.', true);
        return false;
      }
      if (!still) Verlauf.merke(dok());
      const stelle = indexVon(id);
      const neue = (block.punkte || []).filter(p => p && p.length)
        .map(p => Modell.neuerBlock('absatz', { runs: p }));
      if (!neue.length) neue.push(Modell.neuerBlock('absatz'));
      dok().bloecke.splice(stelle, 1, ...neue);
      App.aenderung(); zeichne(); zeichneGliederung();
      waehle(neue[0].id, false);
      fokussiere(neue[0].id);
      return true;
    }

    const runs = block.typ === 'ueberschrift'
      ? (block.text ? [{ text: block.text }] : [])
      : (block.runs || []);

    /* Eine Überschrift ist reiner Text: ein Zitat darin würde zu
       totem Text -- also lieber gar nicht. */
    if (art === 'ueberschrift' && runs.some(r => r.text == null)) {
      App.melde('Zitate, Verweise und Formeln können nicht in einer Überschrift stehen.', true);
      return false;
    }

    if (!still) Verlauf.merke(dok());
    delete block.runs; delete block.text; delete block.ebene;
    delete block.quelle; delete block.seite;
    delete block.ordnung; delete block.punkte; delete block.hinweis;
    block.typ = art;
    if (art === 'ueberschrift') {
      block.ebene = +extra || 1;
      block.text = Richtext.zuText(runs, ctx());
    } else if (art === 'liste') {
      block.ordnung = extra === 'nummern' ? 'nummern' : 'punkte';
      block.punkte = [runs];
    } else if (art === 'blockzitat') {
      block.runs = runs; block.quelle = ''; block.seite = '';
    } else {
      block.runs = runs;
    }

    App.aenderung(); zeichne(); zeichneGliederung();
    waehle(id, false);
    fokussiere(id);
    return true;
  }

  function verschiebe(id, richtung) {
    const i = indexVon(id);
    const j = i + richtung;
    if (i < 0 || j < 0 || j >= dok().bloecke.length) return;
    Verlauf.merke(dok());
    const [b] = dok().bloecke.splice(i, 1);
    dok().bloecke.splice(j, 0, b);
    App.aenderung(); zeichne(); zeichneGliederung();
    document.querySelector(`.block[data-id="${id}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function loesche(id) {
    const b = findeBlock(id);
    if (!b) return;
    const schwer = ['tabelle', 'abbildung'].includes(b.typ) ||
                   (b.typ === 'ueberschrift' && (b.text || '').trim());
    if (schwer) {
      const name = Modell.BLOCKTYPEN[b.typ]?.name || 'Baustein';
      const ok = await Dialoge.bestaetigen({
        titel: name + ' löschen?',
        text: `<b>${escHtml(b.text || b.titel || name)}</b> wird entfernt. ` +
              `Querverweise darauf zeigen danach <i>?? gelöscht</i>.`
      });
      if (!ok) return;
    }
    Verlauf.merke(dok());
    dok().bloecke = dok().bloecke.filter(x => x.id !== id);
    if (!dok().bloecke.length) dok().bloecke.push(Modell.neuerBlock('absatz'));
    App.aenderung(); zeichne(); zeichneGliederung();
  }

  function waehle(id, scrollen = true) {
    gewaehlteId = id;
    document.querySelectorAll('.block').forEach(b =>
      b.classList.toggle('gewaehlt', b.dataset.id === id));
    document.querySelectorAll('.gl-eintrag').forEach(g =>
      g.classList.toggle('aktiv', g.dataset.id === id));
    Kontextleiste.zeichne();
    if (scrollen) document.querySelector(`.block[data-id="${id}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /* ---------------- Ganze Liste zeichnen ---------------- */

  function zeichne() {
    const behaelter = document.getElementById('blockliste');
    if (!behaelter) return;
    behaelter.innerHTML = '';
    const nummern = Modell.nummeriere(dok());

    for (const block of dok().bloecke) {
      const kasten = el('div', 'block' + (block.id === gewaehlteId ? ' gewaehlt' : ''));
      kasten.dataset.id = block.id;

      const griff = el('div', 'block-griff');
      const marke = el('div', 'block-marke', Modell.BLOCKTYPEN[block.typ]?.icon || '?');
      marke.title = (Modell.BLOCKTYPEN[block.typ]?.name || block.typ) + ' — ziehen zum Verschieben';
      marke.draggable = true;
      marke.addEventListener('dragstart', (ev) => {
        ziehtId = block.id; kasten.classList.add('zieht');
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', block.id);
      });
      marke.addEventListener('dragend', () => {
        ziehtId = null;
        document.querySelectorAll('.block').forEach(b =>
          b.classList.remove('zieht', 'zielmarke'));
      });
      griff.append(marke);

      kasten.addEventListener('dragover', (ev) => {
        if (!ziehtId || ziehtId === block.id) return;
        ev.preventDefault();
        document.querySelectorAll('.block').forEach(b => b.classList.remove('zielmarke'));
        kasten.classList.add('zielmarke');
      });
      kasten.addEventListener('drop', (ev) => {
        if (!ziehtId || ziehtId === block.id) return;
        ev.preventDefault();
        Verlauf.merke(dok());
        const von = indexVon(ziehtId);
        const [b] = dok().bloecke.splice(von, 1);
        dok().bloecke.splice(indexVon(block.id), 0, b);
        ziehtId = null;
        App.aenderung(); zeichne(); zeichneGliederung();
      });

      const inhalt = el('div', 'block-inhalt');
      inhalt.append(blockInhalt(block, nummern));
      kasten.append(griff, inhalt, werkzeugleiste(block));
      /* waehle statt bloßem Merken: so wechselt auch bei Bausteinen ohne
         Textfeld (Diagramm, Formel, Umbruch) die Objektleiste oben mit. */
      kasten.addEventListener('mousedown', () => waehle(block.id, false));
      behaelter.append(kasten);
    }
    verdrahteDateiablage();
    verdrahteChipKlick();
    Kontextleiste.zeichne();
  }

  /* ---------------- Gliederung ---------------- */

  function zeichneGliederung() {
    const behaelter = document.getElementById('gliederung');
    if (!behaelter) return;
    const nummern = Modell.nummeriere(dok());
    behaelter.innerHTML = '';

    const ueberschriften = dok().bloecke.filter(b => b.typ === 'ueberschrift');
    if (!ueberschriften.length) {
      behaelter.append(el('div', 'gl-leer',
        'Noch keine Überschriften. Füge unten im Text eine Überschrift ein — sie erscheint dann hier.'));
      return;
    }
    const zaehlung = Modell.woerter(dok());
    let anhangGesetzt = false;
    for (const b of dok().bloecke) {
      if (b.typ !== 'ueberschrift') continue;
      const info = nummern.get(b.id) || {};
      if (info.imAnhang && !anhangGesetzt) {
        behaelter.append(el('div', 'gl-trenner', 'Anhang'));
        anhangGesetzt = true;
      }
      const e = info.ebene || 1;
      const eintrag = el('div', `gl-eintrag gl-e${e}` + (b.id === gewaehlteId ? ' aktiv' : ''));
      eintrag.dataset.id = b.id;
      eintrag.innerHTML = `<span class="gl-nr">${escHtml(info.nummer || '')}</span>
                           <span class="${e === 1 ? 'gl-e1' : ''}">${escHtml(b.text || '(ohne Titel)')}</span>` +
        (e === 1 ? `<span class="gl-woerter" title="Wörter in diesem Kapitel">${
                     zaehlung.jeKapitel.get(b.id) || 0}</span>` : '');
      eintrag.addEventListener('click', () => { waehle(b.id); fokussiere(b.id); });
      behaelter.append(eintrag);
    }
  }

  /* ---------------- Einfügeleiste ---------------- */

  function baueEinfuegeleiste() {
    const behaelter = document.getElementById('einfuegen-knoepfe');
    if (!behaelter) return;
    behaelter.innerHTML = '';
    const wort = el('span', 'einfuegen-wort', 'Einfügen');
    wort.title = 'Neue Bausteine erscheinen nach dem gerade gewählten';
    behaelter.append(wort);
    const eintraege = [
      ['absatz', '¶ Absatz'], ['ueberschrift', 'H Überschrift'], ['liste', '• Liste'],
      ['tabelle', '▦ Tabelle'], ['abbildung', '🖼 Abbildung'],
      ['diagramm', '📊 Diagramm'], ['blockzitat', '❝ Blockzitat'],
      ['formel', '∑ Formel'], ['seitenumbruch', '⤓ Seitenumbruch'], ['anhangstart', '§ Anhang beginnt']
    ];
    /* Beim Überfahren zeigt eine Marke, wo der Baustein landen würde:
       nach dem gewählten -- der Anhangbeginn immer am Ende. Dieselbe
       Marke, die auch das Ablegen von Dateien benutzt. */
    const marke = el('div', 'einfuegemarke');
    for (const [typ, beschriftung] of eintraege) {
      const b = el('button', 'knopf knopf-klein', escHtml(beschriftung));
      b.addEventListener('click', () => fuegeBlockEin(typ));
      b.addEventListener('mouseenter', () => {
        const liste = document.getElementById('blockliste');
        if (!liste) return;
        marke.remove();
        const kasten = typ !== 'anhangstart' && gewaehlteId
          ? liste.querySelector(`.block[data-id="${gewaehlteId}"]`) : null;
        if (kasten) kasten.after(marke); else liste.append(marke);
      });
      b.addEventListener('mouseleave', () => marke.remove());
      behaelter.append(b);
    }
  }

  /* `ersetzeId` kommt vom /-Menü: War der Absatz, aus dem heraus es
     benutzt wurde, leer, wird er ersetzt statt leer stehen zu bleiben. */
  async function fuegeBlockEin(typ, ersetzeId) {
    if (typ === 'anhangstart' && dok().bloecke.some(b => b.typ === 'anhangstart')) {
      App.melde('Es gibt schon einen Anhangbeginn.', true);
      return;
    }
    const block = Modell.neuerBlock(typ);
    if (typ === 'tabelle')   { if (!await Dialoge.tabelle(block, dok())) return; }
    if (typ === 'abbildung') { if (!await Dialoge.abbildung(block)) return; }
    if (typ === 'formel')    { if (!await Dialoge.formel(block)) return; }
    if (typ === 'diagramm')  { if (!await Diagrammdialog.einrichten(block, dok())) return; }

    /* Der Anhangbeginn gehört ans Dokumentende. Würde er hinter dem
       gerade gewählten Block landen, würden alle folgenden Kapitel
       stillschweigend zu Anhang A, B, C -- ein Fehler, den man erst
       im fertigen PDF bemerkt.                                       */
    Verlauf.merke(dok());
    const alt = ersetzeId ? findeBlock(ersetzeId) : null;
    const leererAbsatz = alt && alt.typ === 'absatz' &&
      !Richtext.zuText(alt.runs || [], ctx()).trim();
    if (block.typ === 'anhangstart') {
      dok().bloecke.splice(dok().bloecke.length, 0, block);
    } else if (leererAbsatz) {
      dok().bloecke.splice(indexVon(ersetzeId), 1, block);
    } else {
      const anker = (alt && ersetzeId) || gewaehlteId;
      const nach = anker && indexVon(anker) >= 0
        ? indexVon(anker) + 1 : dok().bloecke.length;
      dok().bloecke.splice(nach, 0, block);
    }
    App.aenderung(); zeichne(); zeichneGliederung();
    waehle(block.id);
    if (['absatz', 'ueberschrift', 'liste', 'blockzitat'].includes(typ)) fokussiere(block.id);
  }

  return { zeichne, zeichneGliederung, baueEinfuegeleiste, waehle, fokussiere,
           fokussiereAn, fuegeAmCursorEin, chipHtml, fuegeBlockEin,
           legeBildAn, legeTabelleAn, wandleUm, dupliziere,
           diagrammAusTabelle: legeDiagrammAnAusTabelle,
           gewaehlteId: () => gewaehlteId };
})();
