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

  /* Nur Felder, die Runs speichern, können Fett und Kursiv halten.
     Die Überschrift (`text`) und die Tabellenzellen sind im Modell
     schlichte Zeichenketten. */
  const traegtFormatierung = (feld) => !!feld && feld.dataset.feld !== 'text';

  /* Tabellenzellen liegen außerhalb der .tx-Felder und damit außerhalb
     von `tasten`. Ohne diesen Riegel führte der Browser Strg+B selbst
     aus: das Fett war kurz zu sehen und beim nächsten Zeichnen weg. */
  function sperreFormatierung(ev) {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    if (!['b', 'i', 'u'].includes(ev.key.toLowerCase())) return;
    ev.preventDefault();
    App.melde('In Tabellenzellen gibt es keine Formatierung — '
              + 'im Fließtext schon.', true);
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
      /* aenderung zeichnet die Gliederung gleich mit -- sie zeigt die
         Wortzahlen und hängt damit an jedem Tastendruck. Ein zweiter
         Aufruf von hier aus zählte das ganze Dokument ein zweites Mal. */
      App.aenderung({ nurVorschau: true });
      if (feldname !== 'text') atPruefe(feld, ev);
    });

    feld.addEventListener('focus', () => waehle(block.id, false));

    feld.addEventListener('blur', () => {
      if (atFeld === feld) atSchliesse();
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

    if (strg && ev.shiftKey && ev.key.toLowerCase() === 'z') {
      ev.preventDefault(); App.zitatEinfuegen(); return;
    }
    /* execCommand feuert kein beforeinput -- ohne eigenen Schnappschuss
       ließe sich das Fett nicht zurücknehmen. */
    if (strg && ['b', 'i'].includes(ev.key.toLowerCase())) {
      ev.preventDefault();
      /* Überschriften und Tabellenzellen sind schlichter Text im
         Modell. Das Fett war dort bisher kurz zu sehen und beim
         nächsten Zeichnen wieder weg -- lieber gleich sagen, dass es
         nicht geht, als es lautlos wegzuwerfen. */
      if (!traegtFormatierung(feld)) {
        App.melde('Fett und kursiv gehen im Fließtext, nicht in '
                  + 'Überschriften oder Tabellenzellen.', true);
        return;
      }
      Verlauf.merke(dok());
      document.execCommand(ev.key.toLowerCase() === 'b' ? 'bold' : 'italic');
      feld.dispatchEvent(new Event('input', { bubbles: true })); return;
    }

    /* Enter teilt an der Schreibmarke -- wie in Word. Steht sie am Ende,
       ist der abgeschnittene Teil leer und es entsteht schlicht ein
       neuer, leerer Absatz.                                          */
    if (ev.key === 'Enter' && !ev.shiftKey) {
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
      App.melde('Abbildung eingefügt — Titel über das Zahnrad nachtragen.');
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
    App.melde(`Tabelle mit ${gitter.zeilen.length} Zeilen eingefügt — ` +
              'Titel über das Zahnrad, ein Diagramm über „📊 Diagramm daraus“.');
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

    if (block.typ === 'ueberschrift') {
      for (const e of [1, 2, 3]) {
        const b = w('H' + e, `Ebene ${e}`, () => {
          Verlauf.merke(dok());
          block.ebene = e; App.aenderung(); zeichne(); zeichneGliederung();
        });
        if ((block.ebene || 1) === e) b.style.color = 'var(--akzent)';
        leiste.append(b);
      }
    }
    if (['absatz', 'blockzitat', 'liste'].includes(block.typ)) {
      leiste.append(
        w('❝', 'Quelle zitieren  (Strg+Umschalt+Z)', () => App.zitatEinfuegen()),
        w('→', 'Querverweis einfügen', () => App.verweisEinfuegen()),
        w('𝑀', 'Kennwert einfügen', () => App.kennwertEinfuegen()),
        w('¹', 'Fußnote einfügen', () => App.fussnoteEinfuegen())
      );
    }
    if (block.typ === 'liste') {
      leiste.append(w(block.ordnung === 'nummern' ? '1.' : '•',
        'Zwischen Punkten und Nummern wechseln', () => {
          Verlauf.merke(dok());
        block.ordnung = block.ordnung === 'nummern' ? 'punkte' : 'nummern';
          App.aenderung(); zeichne();
        }));
    }
    if (block.typ === 'tabelle') {
      leiste.append(w('📊', 'Diagramm aus dieser Tabelle', () =>
        legeDiagrammAnAusTabelle(block)));
    }
    if (['tabelle', 'abbildung', 'formel', 'diagramm'].includes(block.typ)) {
      leiste.append(w('⚙', 'Einstellungen', async () => {
        const f = { tabelle: Dialoge.tabelle, abbildung: Dialoge.abbildung,
                    formel: Dialoge.formel,
                    diagramm: Diagrammdialog.einrichten }[block.typ];
        Verlauf.merke(dok());
        if (await f(block, dok())) { App.aenderung(); zeichne(); }
        else Verlauf.verwerfeLetzten();
      }));
    }
    if (block.typ === 'blockzitat') {
      leiste.append(w('§', 'Quelle des Zitats festlegen', async () => {
        const z = await Dialoge.zitatEinfuegen(dok(), { einzeln: true });
        if (z) {
          Verlauf.merke(dok());
          block.quelle = z.zitat; block.seite = z.seite;
          App.aenderung(); zeichne();
        }
      }));
    }

    leiste.append(
      w('↑', 'Nach oben', () => verschiebe(block.id, -1)),
      w('↓', 'Nach unten', () => verschiebe(block.id, +1)),
      w('✕', 'Baustein löschen', () => loesche(block.id), 'gefahr')
    );
    return leiste;
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
            : '<i>Noch keine Quelle festgelegt — auf § in der Werkzeugleiste klicken.</i>'));
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
          feld.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey) {
              ev.preventDefault();
              Verlauf.merke(dok());
              block.punkte.splice(i + 1, 0, []);
              App.aenderung(); zeichne();
              setTimeout(() => {
                const felder = document.querySelectorAll(
                  `.block[data-id="${block.id}"] .tx`);
                if (felder[i + 1]) felder[i + 1].focus();
              }, 10);
            }
            if (ev.key === 'Backspace' && !feld.textContent.trim() && block.punkte.length > 1) {
              ev.preventDefault();
              Verlauf.merke(dok());
              block.punkte.splice(i, 1);
              App.aenderung(); zeichne();
            }
          });
          li.append(feld);
          liste.append(li);
        });
        return liste;
      }

      case 'tabelle': {
        const karte = el('div', 'tab-karte');
        karte.append(el('div', 'karte-kopf',
          `<span class="karte-nr">TABELLE ${escHtml(info.nummer || '?')}</span>
           <span class="karte-titel">${escHtml(block.titel || 'Ohne Titel — auf ⚙ klicken')}</span>`));

        const neuZeichnenTabelle = () => {
          App.aenderung(); zeichne(); waehle(block.id, false);
        };
        const merkeTabelle = () => Verlauf.merke(dok());

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
          th.addEventListener('keydown', sperreFormatierung);
          th.addEventListener('beforeinput', () => Verlauf.merke(dok(), 'kopf:' + block.id + ':' + s));
          th.addEventListener('input', () => { block.kopf[s] = th.textContent; App.aenderung({ nurVorschau: true }); });
          th.addEventListener('blur', () => App.aenderung());
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
            /* Tabulator am Ende der letzten Zelle hängt eine Zeile an --
               so tippt man eine Tabelle durch, ohne zur Maus zu greifen. */
            td.addEventListener('keydown', sperreFormatierung);
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

        const anbau = el('div', 'tabellenknoepfe');
        const knopf = (text, titel, aktion) => {
          const k = el('button', 'knopf knopf-klein', text);
          k.title = titel;
          k.addEventListener('click', aktion);
          return k;
        };
        anbau.append(
          knopf('+ Zeile', 'Zeile unten anfügen (oder Tabulator in der letzten Zelle)', () => {
            merkeTabelle();
            block.zeilen.push(block.kopf.map(() => ''));
            neuZeichnenTabelle();
          }),
          knopf('+ Spalte', 'Spalte rechts anfügen', () => {
            merkeTabelle();
            block.kopf.push('');
            block.zeilen.forEach(z => z.push(''));
            (block.spaltenAusrichtung || []).push('c');
            neuZeichnenTabelle();
          }),
          knopf('📊 Diagramm daraus',
            'Legt ein Diagramm an, das diese Tabelle darstellt — ' +
            'ändert sich die Tabelle, ändert sich das Diagramm mit',
            () => legeDiagrammAnAusTabelle(block)));
        karte.append(anbau);
        if (block.anmerkung)
          karte.append(el('div', 'karte-anm', `<i>Anmerkung.</i> ${Latex.textMitTokens(block.anmerkung, 'html')}`));
        return karte;
      }

      case 'abbildung': {
        const karte = el('div', 'abb-karte');
        karte.append(el('div', 'karte-kopf',
          `<span class="karte-nr">ABBILDUNG ${escHtml(info.nummer || '?')}</span>
           <span class="karte-titel">${escHtml(block.titel || 'Ohne Titel — auf ⚙ klicken')}</span>`));
        if (block.datenUrl) {
          const bild = el('img', 'abb-vorschau');
          bild.src = block.datenUrl;
          bild.alt = block.titel || '';
          bild.style.width = (block.breite || 80) + '%';
          karte.append(bild);
        } else {
          const leer = el('div', 'abb-leer',
            '<div style="font-size:20px">&#128247;</div><div>Noch kein Bild — auf &#9881; klicken</div>');
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
        karte.append(el('div', 'karte-kopf',
          `<span class="karte-nr">ABBILDUNG ${escHtml(info.nummer || '?')}</span>
           <span class="karte-titel">${escHtml(block.titel || 'Ohne Titel — auf ⚙ klicken')}</span>`));
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
        karte.innerHTML = block.tex
          ? `<code>${escHtml(block.tex)}</code>`
          : '<span style="color:var(--tinte-3)">Leere Formel — auf &#9881; klicken</span>';
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
      kasten.addEventListener('mousedown', () => { gewaehlteId = block.id; });
      behaelter.append(kasten);
    }
    verdrahteDateiablage();
    verdrahteChipKlick();
  }

  /* ---------------- Gliederung ---------------- */

  function zeichneGliederung(zaehlungVorab) {
    const behaelter = document.getElementById('gliederung');
    if (!behaelter) return;
    /* Die Liste wird bei jedem Tastendruck neu gebaut; das Leeren
       lässt den Rollbalken zusammenfallen. Ohne dieses Merken spränge
       die Gliederung einer Dissertation bei jedem Buchstaben zurück
       zu Kapitel 1, während man in Kapitel 8 schreibt. */
    const roller = behaelter.closest('.panelkoerper') || behaelter;
    const rollstand = roller.scrollTop;
    const nummern = Modell.nummeriere(dok());
    behaelter.innerHTML = '';

    const ueberschriften = dok().bloecke.filter(b => b.typ === 'ueberschrift');
    if (!ueberschriften.length) {
      behaelter.append(el('div', 'gl-leer',
        'Noch keine Überschriften. Füge unten im Text eine Überschrift ein — sie erscheint dann hier.'));
      return;
    }
    /* Die Zählung ist ein Durchlauf über das ganze Dokument. Wer sie
       schon hat, reicht sie herein -- sonst liefe sie zweimal je
       Tastendruck. */
    const zaehlung = zaehlungVorab || Modell.zaehlung(dok());
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
      /* Jede Ebene zeigt ihre Wortzahl, nicht nur die Kapitel: beim
         Schreiben interessiert der Abschnitt, an dem man gerade sitzt.
         Gezählt wird einschließlich der untergeordneten Abschnitte --
         "Kapitel 2 hat 1 200 Wörter" meint das ganze Kapitel. */
      const z = zaehlung.jeAbschnitt.get(b.id);
      eintrag.innerHTML = `<span class="gl-nr">${escHtml(info.nummer || '')}</span>
                           <span class="${e === 1 ? 'gl-e1' : ''}">${escHtml(b.text || '(ohne Titel)')}</span>` +
        (z ? `<span class="gl-woerter" title="${z.woerter} Wörter in diesem Abschnitt, ${
                 'Unterabschnitte eingerechnet'}">${Modell.zahl(z.woerter)}</span>` : '');
      eintrag.addEventListener('click', () => { waehle(b.id); fokussiere(b.id); });
      behaelter.append(eintrag);
    }
    roller.scrollTop = rollstand;
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
    for (const [typ, beschriftung] of eintraege) {
      const b = el('button', 'knopf knopf-klein', escHtml(beschriftung));
      b.addEventListener('click', () => fuegeBlockEin(typ));
      behaelter.append(b);
    }
  }

  async function fuegeBlockEin(typ) {
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
    const nach = block.typ === 'anhangstart'
      ? dok().bloecke.length
      : (gewaehlteId ? indexVon(gewaehlteId) + 1 : dok().bloecke.length);
    dok().bloecke.splice(nach, 0, block);
    App.aenderung(); zeichne(); zeichneGliederung();
    waehle(block.id);
    if (['absatz', 'ueberschrift', 'liste', 'blockzitat'].includes(typ)) fokussiere(block.id);
  }

  return { zeichne, zeichneGliederung, baueEinfuegeleiste, waehle, fokussiere,
           fokussiereAn, fuegeAmCursorEin, chipHtml, fuegeBlockEin,
           legeBildAn, legeTabelleAn,
           gewaehlteId: () => gewaehlteId };
})();
