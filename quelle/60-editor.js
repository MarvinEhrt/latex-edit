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
    return {
      bearbeitbar: true,
      quellen: dok().quellen,
      verweisText: (ziel) => {
        const b = findeBlock(ziel);
        if (!b) return '?? gelöscht';
        const n = (nummern.get(ziel) || {}).nummer || '?';
        return b.typ === 'tabelle' ? `Tabelle ${n}`
             : (b.typ === 'abbildung' || b.typ === 'diagramm') ? `Abbildung ${n}`
             : `Abschnitt ${n}`;
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

  /* ---------------- Textfeld ---------------- */

  function textfeld(block, feldname, klassen, leertext, runsAus) {
    const feld = el('div', 'tx ' + klassen);
    feld.contentEditable = 'true';
    feld.spellcheck = true;
    feld.lang = 'de';
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

    feld.addEventListener('input', () => {
      if (feldname === 'text') block.text = feld.textContent;
      else if (runsAus) runsAus(Richtext.vonHtml(feld));
      else block.runs = Richtext.vonHtml(feld);
      App.aenderung({ nurVorschau: true });
      if (feldname === 'text') zeichneGliederung();
    });

    feld.addEventListener('focus', () => waehle(block.id, false));

    feld.addEventListener('blur', () => {
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

    if (strg && ev.shiftKey && ev.key.toLowerCase() === 'z') {
      ev.preventDefault(); App.zitatEinfuegen(); return;
    }
    if (strg && ev.key.toLowerCase() === 'b') { ev.preventDefault(); document.execCommand('bold');
      feld.dispatchEvent(new Event('input', { bubbles: true })); return; }
    if (strg && ev.key.toLowerCase() === 'i') { ev.preventDefault(); document.execCommand('italic');
      feld.dispatchEvent(new Event('input', { bubbles: true })); return; }

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
              'Titel über das Zahnrad nachtragen.');
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
        const z = await Dialoge.zitatEinfuegen(dok());
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
          q ? `Quelle: ${escHtml(Zitate.imText(q, 'klammer', block.seite))}`
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
          }));
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
                           <span class="${e === 1 ? 'gl-e1' : ''}">${escHtml(b.text || '(ohne Titel)')}</span>`;
      eintrag.addEventListener('click', () => { waehle(b.id); fokussiere(b.id); });
      behaelter.append(eintrag);
    }
  }

  /* ---------------- Einfügeleiste ---------------- */

  function baueEinfuegeleiste() {
    const behaelter = document.getElementById('einfuegen-knoepfe');
    if (!behaelter) return;
    behaelter.innerHTML = '';
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
