/* ===================================================================
   50-dialoge.js  --  Alle Formulare
   -------------------------------------------------------------------
   Jeder Dialog gibt ein Promise zurück: das Ergebnis oder null,
   wenn abgebrochen wurde. Damit bleibt der Aufrufcode geradlinig.
   =================================================================== */

const Dialoge = (() => {

  const el = (tag, klasse, html) => {
    const n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (html != null) n.innerHTML = html;
    return n;
  };

  /* ---------------- Grundgerüst ---------------- */

  /* `beimSchliessen` wird bei JEDEM Schließweg gerufen (Knopf, Escape,
     Klick auf den Schleier) -- damit ein wartendes Promise auch dann
     auflöst, wenn der Dialog weggeklickt wird. */
  function basis({ titel, unter, breit, beimSchliessen }) {
    const schleier = el('div', 'schleier');
    const dialog = el('div', 'dialog' + (breit ? ' dialog-breit' : ''));
    const kopf = el('div', 'dialog-kopf',
      `<h2>${escHtml(titel)}</h2>${unter ? `<p>${unter}</p>` : ''}`);
    const koerper = el('div', 'dialog-koerper');
    const fuss = el('div', 'dialog-fuss');
    dialog.append(kopf, koerper, fuss);
    schleier.append(dialog);
    document.body.append(schleier);

    const schliessen = () => {
      schleier.remove();
      document.removeEventListener('keydown', taste);
      if (beimSchliessen) beimSchliessen();
    };
    const taste = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); schliessen(); } };
    document.addEventListener('keydown', taste);
    schleier.addEventListener('mousedown', (ev) => { if (ev.target === schleier) schliessen(); });

    return { schleier, dialog, koerper, fuss, schliessen };
  }

  const knopf = (text, art, aktion) => {
    const b = el('button', 'knopf' + (art ? ' ' + art : ''), escHtml(text));
    b.addEventListener('click', aktion);
    return b;
  };

  /* ---------------- Formularbaukasten ---------------- */

  function feldElement(f, wert) {
    const wrap = el('div', 'feld' + (f.breit || !f.kurz ? ' feld-breit' : ''));
    const id = 'f_' + f.n;
    wrap.innerHTML = `<label for="${id}">${escHtml(f.l)}` +
      `${f.pflicht ? ' <span class="pflicht" title="Pflichtfeld">*</span>' : ''}</label>`;
    let eingabe;
    if (f.typ === 'auswahl') {
      eingabe = el('select');
      for (const o of f.optionen) {
        const opt = el('option', null, escHtml(o.l));
        opt.value = o.w;
        eingabe.append(opt);
      }
    } else if (f.typ === 'text-mehrzeilig') {
      eingabe = el('textarea');
      if (f.zeilen) eingabe.rows = f.zeilen;
    } else {
      eingabe = el('input');
      eingabe.type = f.typ || 'text';
    }
    eingabe.id = id;
    eingabe.name = f.n;
    eingabe.value = wert == null ? '' : wert;
    if (f.platzhalter) eingabe.placeholder = f.platzhalter;
    wrap.append(eingabe);
    if (f.h) wrap.append(el('div', 'hilfe', escHtml(f.h)));
    return { wrap, eingabe };
  }

  /* Allgemeines Formular. felder = [{n,l,typ,h,pflicht,kurz,breit,optionen}]
     `entfernenText` blendet links einen roten Knopf ein, der mit
     {entfernen:true} auflöst -- für das Bearbeiten bestehender Chips. */
  function formular({ titel, unter, felder, werte = {}, breit, gruppen,
                      okText = 'Übernehmen', entfernenText }) {
    return new Promise((fertig) => {
      const { koerper, fuss, schliessen } = basis({ titel, unter, breit });
      const eingaben = {};

      const baueGitter = (liste) => {
        const gitter = el('div', 'feldgitter');
        for (const f of liste) {
          const { wrap, eingabe } = feldElement(f, werte[f.n]);
          eingaben[f.n] = { eingabe, wrap, f };
          gitter.append(wrap);
        }
        return gitter;
      };

      if (gruppen) {
        for (const g of gruppen) {
          const box = el('div', 'gruppe');
          if (g.titel) box.append(el('h3', null, escHtml(g.titel)));
          if (g.notiz) box.append(el('div', 'notiz', g.notiz));
          box.append(baueGitter(g.felder));
          koerper.append(box);
        }
      } else {
        koerper.append(baueGitter(felder));
      }

      const uebernehmen = () => {
        let fehlt = null;
        const aus = {};
        for (const [name, { eingabe, wrap, f }] of Object.entries(eingaben)) {
          const w = eingabe.value.trim();
          wrap.classList.toggle('fehlt', !!(f.pflicht && !w));
          if (f.pflicht && !w && !fehlt) fehlt = eingabe;
          aus[name] = w;
        }
        if (fehlt) { fehlt.focus(); App.melde('Bitte die rot markierten Pflichtfelder ausfüllen.', true); return; }
        schliessen(); fertig(aus);
      };

      if (entfernenText)
        fuss.append(knopf(entfernenText, 'knopf-gefahr links',
          () => { schliessen(); fertig({ entfernen: true }); }));
      fuss.append(
        knopf('Abbrechen', 'knopf-still', () => { schliessen(); fertig(null); }),
        knopf(okText, 'knopf-haupt', uebernehmen)
      );
      koerper.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && ev.target.tagName !== 'TEXTAREA') { ev.preventDefault(); uebernehmen(); }
      });
      setTimeout(() => { const e = koerper.querySelector('input,select,textarea'); if (e) e.focus(); }, 30);
    });
  }

  function bestaetigen({ titel, text, okText = 'Löschen', gefahr = true }) {
    return new Promise((fertig) => {
      const { koerper, fuss, schliessen } = basis({ titel });
      koerper.innerHTML = `<div style="font-size:13.5px;line-height:1.55">${text}</div>`;
      fuss.append(
        knopf('Abbrechen', 'knopf-still', () => { schliessen(); fertig(false); }),
        knopf(okText, gefahr ? '' : 'knopf-haupt', () => { schliessen(); fertig(true); })
      );
    });
  }

  /* ---------------- Neues Dokument ---------------- */

  function neuesDokument() {
    return new Promise((fertig) => {
      const { koerper, fuss, schliessen } = basis({
        titel: 'Neue Arbeit anlegen',
        unter: 'Die Gliederung wird passend zum Typ vorbereitet — du kannst sie danach frei ändern.'
      });
      let gewaehlt = 'hausarbeit';
      const liste = el('div', 'quellenliste');
      for (const [schluessel, typ] of Object.entries(Modell.ARBEITSTYPEN)) {
        const zeile = el('div', 'quelle-zeile' + (schluessel === gewaehlt ? ' gewaehlt' : ''));
        zeile.innerHTML = `<div class="quelle-txt"><b style="font-family:var(--schrift-ui);font-size:13.5px">
          ${escHtml(typ.name)}</b><div class="quelle-warn">${escHtml(typ.hinweis)}</div></div>`;
        zeile.addEventListener('click', () => {
          gewaehlt = schluessel;
          liste.querySelectorAll('.quelle-zeile').forEach(z => z.classList.remove('gewaehlt'));
          zeile.classList.add('gewaehlt');
        });
        liste.append(zeile);
      }
      koerper.append(
        el('div', 'notiz warnung', '<span>&#9888;</span><span>Die aktuelle Arbeit wird ersetzt. ' +
          'Sichere sie vorher über <b>Sichern</b>, wenn du sie behalten willst.</span>'),
        liste);
      fuss.append(
        knopf('Abbrechen', 'knopf-still', () => { schliessen(); fertig(null); }),
        knopf('Anlegen', 'knopf-haupt', () => { schliessen(); fertig(gewaehlt); })
      );
    });
  }

  /* ---------------- Deckblatt ---------------- */

  async function deckblatt(dok) {
    const aus = await formular({
      titel: 'Deckblatt',
      unter: 'Alles, was auf der Titelseite steht. Leere Felder werden einfach weggelassen.',
      breit: true,
      werte: dok.meta,
      gruppen: [
        { titel: 'Arbeit', felder: [
          { n: 'titel', l: 'Titel der Arbeit', pflicht: true },
          { n: 'untertitel', l: 'Untertitel', h: 'Leer lassen, wenn es keinen gibt' },
          { n: 'arbeitstyp', l: 'Art der Arbeit', typ: 'auswahl', kurz: true,
            optionen: Object.entries(Modell.ARBEITSTYPEN).map(([w, t]) => ({ w, l: t.name })) }
        ]},
        { titel: 'Hochschule', felder: [
          { n: 'hochschule', l: 'Hochschule', kurz: true },
          { n: 'fachbereich', l: 'Fachbereich', kurz: true },
          { n: 'institut', l: 'Institut', kurz: true },
          { n: 'modul', l: 'Modul oder Seminar', kurz: true },
          { n: 'betreuung', l: 'Betreuung', kurz: true },
          { n: 'zweitgutachten', l: 'Zweitgutachten', kurz: true }
        ]},
        { titel: 'Verfasserin oder Verfasser', felder: [
          { n: 'verfasser', l: 'Name', kurz: true },
          { n: 'matrikelnummer', l: 'Matrikelnummer', kurz: true },
          { n: 'studiengang', l: 'Studiengang', kurz: true },
          { n: 'semester', l: 'Fachsemester', kurz: true },
          { n: 'email', l: 'E-Mail', kurz: true },
          { n: 'ort', l: 'Ort', kurz: true },
          { n: 'abgabedatum', l: 'Abgabedatum', kurz: true, h: 'z. B. 16. August 2026' }
        ]}
      ]
    });
    if (!aus) return null;
    Object.assign(dok.meta, aus);
    return dok.meta;
  }

  /* ---------------- Layout, Seitenzahlen, Verzeichnisse ---------------- */

  function layout(dok) {
    return new Promise((fertig) => {
      const { koerper, fuss, schliessen } = basis({
        titel: 'Layout und Verzeichnisse',
        unter: 'Wirkt sofort auf die Vorschau und auf das exportierte PDF.',
        breit: true
      });
      const e = { ...dok.einstellungen };
      /* Inhalt der Vorspannseiten wird hier mitbearbeitet -- der Schalter
         allein nützt nichts, wenn man den Text nirgends eintragen kann.
         Auf Kopien, damit Abbrechen wirklich abbricht. */
      const abstract = { text: dok.meta.abstract || '' };
      const abk = (dok.meta.abkuerzungen || []).map(a => ({ ...a }));

      const auswahl = (name, beschriftung, optionen, hilfe) => {
        const { wrap, eingabe } = feldElement(
          { n: name, l: beschriftung, typ: 'auswahl', optionen, kurz: true, h: hilfe }, e[name]);
        eingabe.addEventListener('change', () => { e[name] = eingabe.value; });
        return wrap;
      };
      /* zusatz: Element, das nur sichtbar ist, solange der Schalter an ist. */
      const schalter = (name, beschriftung, erklaerung, zusatz) => {
        const huelle = el('div');
        const zeile = el('div', 'schalterzeile');
        const kasten = el('input'); kasten.type = 'checkbox'; kasten.checked = !!e[name];
        const zeigen = () => { if (zusatz) zusatz.style.display = kasten.checked ? '' : 'none'; };
        kasten.addEventListener('change', () => { e[name] = kasten.checked; zeigen(); });
        const txt = el('div', 'txt', `<b>${escHtml(beschriftung)}</b><span>${escHtml(erklaerung)}</span>`);
        zeile.append(kasten, txt);
        huelle.append(zeile);
        if (zusatz) { huelle.append(zusatz); zeigen(); }
        return huelle;
      };

      /* --- Zusammenfassung --- */
      const abstractfeld = el('div', 'schalterzusatz');
      const ta = el('textarea');
      ta.rows = 5;
      ta.placeholder = 'Fragestellung, Methode, zentrale Befunde, Schlussfolgerung — '
                     + 'meist 150 bis 250 Wörter.';
      ta.value = abstract.text;
      ta.addEventListener('input', () => { abstract.text = ta.value; zaehleWoerter(); });
      const zaehler = el('div', 'hilfe');
      const zaehleWoerter = () => {
        const n = ta.value.trim().split(/\s+/).filter(Boolean).length;
        zaehler.textContent = n
          ? `${n} Wörter` + (n > 300 ? ' — für einen Abstract meist zu lang.' : '')
          : 'Ohne Text wird die Seite nicht gesetzt.';
        zaehler.style.color = n ? '' : 'var(--kennwert)';
      };
      zaehleWoerter();
      abstractfeld.append(ta, zaehler);

      /* --- Abkürzungsverzeichnis --- */
      const abkfeld = el('div', 'schalterzusatz');
      const zeichneAbk = () => {
        abkfeld.innerHTML = '';
        const gitter = el('table', 'abkgitter');
        const kopf = el('tr', null,
          '<th>Abkürzung</th><th>Bedeutung</th><th></th>');
        gitter.append(kopf);
        abk.forEach((a, i) => {
          const tr = el('tr');
          for (const feld of ['kurz', 'lang']) {
            const td = el('td');
            const ein = el('input');
            ein.value = a[feld] || '';
            ein.placeholder = feld === 'kurz' ? 'z. B. AIST-R' : 'Allgemeiner Interessen-Struktur-Test';
            ein.addEventListener('input', () => { a[feld] = ein.value; });
            td.append(ein);
            tr.append(td);
          }
          const weg = el('td');
          const k = el('button', 'zeileweg', '✕');
          k.title = 'Zeile löschen';
          k.addEventListener('click', () => { abk.splice(i, 1); zeichneAbk(); });
          weg.append(k);
          tr.append(weg);
          gitter.append(tr);
        });
        abkfeld.append(gitter);
        const hinzu = el('button', 'knopf knopf-klein', '+ Abkürzung');
        hinzu.addEventListener('click', () => { abk.push({ kurz: '', lang: '' }); zeichneAbk(); });
        abkfeld.append(hinzu);
        if (!abk.length)
          abkfeld.append(el('div', 'hilfe',
            'Ohne Einträge wird die Seite nicht gesetzt.'));
      };
      zeichneAbk();

      const g1 = el('div', 'gruppe'); g1.append(el('h3', null, 'Schrift und Satz'));
      const gitter1 = el('div', 'feldgitter');
      gitter1.append(
        auswahl('sprache', 'Sprache der Arbeit',
          [{ w: 'de', l: 'Deutsch' }, { w: 'en', l: 'English' }],
          'Bestimmt Trennung, Anführungszeichen und alle festen Wörter im PDF '
          + '(Anmerkung./Note., Literaturverzeichnis/References). '
          + 'Die Oberfläche bleibt deutsch.'),
        auswahl('schrift', 'Schriftart',
          [{ w: 'times', l: 'Times (klassisch)' }, { w: 'arial', l: 'Arial (modern)' }],
          'Beide sind nach APA 7 zulässig.'),
        auswahl('schriftgroesse', 'Schriftgröße',
          [{ w: '11', l: '11 pt' }, { w: '12', l: '12 pt' }], 'APA 7 empfiehlt 12 pt bei Times.'),
        auswahl('zeilenabstand', 'Zeilenabstand',
          [{ w: '1', l: 'einfach' }, { w: '1.5', l: '1,5 Zeilen' }, { w: '2', l: 'doppelt' }],
          'Deutsche Hausarbeiten: 1,5. APA-7-Original: doppelt.'),
        auswahl('ausrichtung', 'Textausrichtung',
          [{ w: 'blocksatz', l: 'Blocksatz' }, { w: 'linksbuendig', l: 'Linksbündig' }],
          'APA 7 will linksbündig; deutsche Hochschulen meist Blocksatz.')
      );
      g1.append(gitter1);
      g1.append(schalter('absatzEinzug', 'Absätze einrücken',
        'APA 7: erste Zeile eingerückt, keine Leerzeile dazwischen.'));

      const g2 = el('div', 'gruppe'); g2.append(el('h3', null, 'Seitenzahlen'));
      const gitter2 = el('div', 'feldgitter');
      gitter2.append(
        auswahl('seitenzahlPosition', 'Position',
          [{ w: 'unten', l: 'Unten mittig' }, { w: 'obenrechts', l: 'Oben rechts' }],
          'APA 7: oben rechts. In Deutschland üblich: unten mittig.'),
        auswahl('seitenzahlStil', 'Zählweise',
          [{ w: 'roemisch-arabisch', l: 'Verzeichnisse römisch, Text ab 1' },
           { w: 'durchgehend', l: 'Durchgehend arabisch' }],
          'Römisch/arabisch ist an deutschen Hochschulen Standard.')
      );
      g2.append(gitter2);

      const g3 = el('div', 'gruppe'); g3.append(el('h3', null, 'Was das Dokument enthält'));
      g3.append(
        schalter('deckblatt', 'Deckblatt', 'Titelseite mit allen Angaben aus dem Deckblatt-Dialog.'),
        schalter('abstract', 'Zusammenfassung (Abstract)',
                 'Eigene Seite vor dem Inhaltsverzeichnis.', abstractfeld),
        schalter('inhaltsverzeichnis', 'Inhaltsverzeichnis', 'Baut sich automatisch aus deinen Überschriften.'),
        schalter('abbildungsverzeichnis', 'Abbildungsverzeichnis', 'Nur sinnvoll ab etwa drei Abbildungen.'),
        schalter('tabellenverzeichnis', 'Tabellenverzeichnis', 'Nur sinnvoll ab etwa drei Tabellen.'),
        schalter('abkuerzungsverzeichnis', 'Abkürzungsverzeichnis',
                 'Alphabetisch sortiert; du trägst die Einträge selbst ein.', abkfeld),
        schalter('eidesstattlich', 'Eidesstattliche Erklärung',
                 'Standardformulierung am Ende. Prüfe den Wortlaut deiner Hochschule.')
      );

      koerper.append(g1, g2, g3);
      fuss.append(
        knopf('Abbrechen', 'knopf-still', () => { schliessen(); fertig(null); }),
        knopf('Übernehmen', 'knopf-haupt', () => {
          e.schriftgroesse = +e.schriftgroesse;
          e.zeilenabstand = String(e.zeilenabstand);
          dok.meta.abstract = abstract.text.trim();
          dok.meta.abkuerzungen = abk
            .filter(a => (a.kurz || '').trim())
            .sort((x, y) => x.kurz.localeCompare(y.kurz, 'de'));
          schliessen(); fertig(e);
        })
      );
    });
  }

  /* ---------------- Quellen ---------------- */

  function schluesselVorschlag(dok, felder, bisher) {
    const nach = String(felder.autoren || 'quelle').split(';')[0].split(',')[0]
      .trim().toLowerCase()
      .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue')
      .replace(/ß/g, 'ss').replace(/[^a-z]/g, '') || 'quelle';
    const basis = nach + (felder.jahr || 'oj').replace(/[^0-9a-z]/gi, '');
    if (bisher === basis) return basis;
    let k = basis, i = 1;
    while (dok.quellen.some(q => q.key === k)) k = basis + String.fromCharCode(96 + ++i);
    return k;
  }

  async function quelleBearbeiten(dok, vorhanden) {
    let typ = vorhanden ? vorhanden.typ : null;
    if (!typ) {
      typ = await new Promise((fertig) => {
        const { koerper, fuss, schliessen } = basis({
          titel: 'Was für eine Quelle ist das?',
          unter: 'Danach werden nur die Felder abgefragt, die dieser Quellenart entsprechen.'
        });
        const liste = el('div', 'quellenliste');
        for (const [schluessel, t] of Object.entries(Modell.QUELLTYPEN)) {
          const zeile = el('div', 'quelle-zeile');
          zeile.innerHTML = `<div class="quelle-txt"><b style="font-family:var(--schrift-ui);font-size:13.5px">${escHtml(t.name)}</b></div>`;
          zeile.addEventListener('click', () => { schliessen(); fertig(schluessel); });
          liste.append(zeile);
        }
        koerper.append(liste);
        fuss.append(knopf('Abbrechen', 'knopf-still', () => { schliessen(); fertig(null); }));
      });
      if (!typ) return null;
    }

    const def = Modell.QUELLTYPEN[typ];
    const aus = await formular({
      titel: (vorhanden ? 'Quelle bearbeiten' : 'Neue Quelle') + ' — ' + def.name,
      unter: 'Namen als <b>Nachname, Vorname</b>, mehrere durch <b>Semikolon</b> getrennt. ' +
             'Institutionen ohne Komma schreiben.',
      breit: true,
      werte: vorhanden ? vorhanden.felder : {},
      felder: def.felder,
      okText: 'Speichern'
    });
    if (!aus) return null;

    if (vorhanden) {
      vorhanden.felder = aus;
      return vorhanden;
    }
    const neu = { key: schluesselVorschlag(dok, aus), typ, felder: aus };
    dok.quellen.push(neu);
    return neu;
  }

  function quellenverwaltung(dok) {
    return new Promise((fertig) => {
      const { koerper, fuss, schliessen } = basis({
        titel: 'Quellen',
        unter: 'Im Literaturverzeichnis erscheinen später nur die Quellen, die du auch zitierst — so will es APA 7.',
        breit: true
      });

      const zeichne = () => {
        koerper.innerHTML = '';
        const genutzt = Modell.zitierteSchluessel(dok);
        if (!dok.quellen.length) {
          koerper.append(el('div', 'leerhinweis',
            'Noch keine Quellen. Leg die erste an — danach fügst du sie mit einem Klick in den Text ein.'));
        } else {
          const liste = el('div', 'quellenliste');
          for (const q of Zitate.sortiert(dok.quellen)) {
            const zeile = el('div', 'quelle-zeile');
            const art = (Modell.QUELLTYPEN[q.typ] || {}).name || q.typ;
            zeile.innerHTML =
              `<span class="quelle-art">${escHtml(art)}</span>
               <div class="quelle-txt">${Zitate.verzeichniseintrag(q, dok.einstellungen.sprache)}
                 <div class="quelle-warn">${genutzt.has(q.key)
                   ? '&#10003; im Text zitiert'
                   : 'noch nicht zitiert — erscheint nicht im Literaturverzeichnis'}</div>
               </div>`;
            const werkzeuge = el('div', null);
            werkzeuge.style.cssText = 'display:flex;gap:4px;flex:none';
            werkzeuge.append(
              knopf('Bearbeiten', 'knopf-klein', async (ev) => {
                ev.stopPropagation();
                if (await quelleBearbeiten(dok, q)) { App.aenderung(); zeichne(); }
              }),
              knopf('Löschen', 'knopf-klein', async (ev) => {
                ev.stopPropagation();
                const drin = genutzt.has(q.key);
                const ok = await bestaetigen({
                  titel: 'Quelle löschen?',
                  text: drin
                    ? `<b>${escHtml(Zitate.autorKurz(q, 'klammer'))} (${escHtml(Zitate.jahr(q))})</b> wird
                       im Text zitiert. Beim Löschen bleiben diese Stellen als
                       <i>(Quelle fehlt)</i> stehen.`
                    : `<b>${escHtml(Zitate.autorKurz(q, 'klammer'))} (${escHtml(Zitate.jahr(q))})</b> wirklich löschen?`
                });
                if (ok) {
                  dok.quellen = dok.quellen.filter(x => x !== q);
                  App.aenderung(); zeichne();
                }
              })
            );
            zeile.append(werkzeuge);
            liste.append(zeile);
          }
          koerper.append(liste);
        }
      };
      zeichne();

      fuss.append(
        knopf('Neue Quelle', 'knopf-haupt', async () => {
          if (await quelleBearbeiten(dok)) { App.aenderung(); zeichne(); }
        }),
        knopf('Fertig', 'knopf-still', () => { schliessen(); fertig(true); })
      );
      fuss.firstChild.classList.add('links');
    });
  }

  /* ---------------- Zitat einfügen ---------------- */

  /* `einzeln` schaltet die Mehrfachauswahl ab -- ein Blockzitat gehört
     immer zu genau einer Quelle und braucht deren Seitenzahl.
     `vorbelegung` ({zitat, form, seite}) füllt den Dialog beim
     Bearbeiten eines bestehenden Chips; `bearbeiten` blendet den
     Entfernen-Knopf ein.                                             */
  function zitatEinfuegen(dok, optionen = {}) {
    return new Promise(async (fertig) => {
      if (!dok.quellen.length) {
        const neu = await quelleBearbeiten(dok);
        if (!neu) { fertig(null); return; }
        App.aenderung();
      }
      const einzeln = !!optionen.einzeln;
      const vor = optionen.vorbelegung || {};
      const { koerper, fuss, schliessen } = basis({
        titel: optionen.bearbeiten ? 'Zitat bearbeiten' : 'Quelle zitieren',
        unter: einzeln ? 'Klick auf eine Quelle, dann die Form wählen.'
                       : 'Klick auf eine Quelle. Mehrere gehen auch — sie landen in einer Klammer.',
        breit: true
      });
      /* Quellen in Anklickreihenfolge; beim Bearbeiten mit dem
         aktuellen Stand vorbelegt (der key kann mehrere enthalten). */
      const gewaehlt = Zitate.quellenZu(vor.zitat, dok.quellen).filter(Boolean);

      const liste = el('div', 'quellenliste');
      const geordnet = Zitate.sortiert(dok.quellen);
      for (const q of geordnet) {
        const zeile = el('div', 'quelle-zeile' + (gewaehlt.includes(q) ? ' gewaehlt' : ''));
        zeile.innerHTML = `<div class="quelle-txt">${
          Zitate.verzeichniseintrag(q, dok.einstellungen.sprache)}</div>`;
        zeile.addEventListener('click', () => {
          const drin = gewaehlt.indexOf(q);
          if (einzeln) {
            gewaehlt.length = 0;
            gewaehlt.push(q);
          } else if (drin >= 0) {
            gewaehlt.splice(drin, 1);            // nochmal klicken nimmt sie wieder raus
          } else {
            gewaehlt.push(q);
          }
          liste.querySelectorAll('.quelle-zeile').forEach((z, i) =>
            z.classList.toggle('gewaehlt', gewaehlt.includes(geordnet[i])));
          zeigeVorschau();
        });
        liste.append(zeile);
      }

      const einstellung = el('div', 'feldgitter');
      einstellung.style.marginTop = '14px';
      const { wrap: formWrap, eingabe: formEingabe } = feldElement(
        { n: 'form', l: 'Form', typ: 'auswahl', kurz: true,
          optionen: [{ w: 'klammer', l: 'In Klammern — (Holland, 1997)' },
                     { w: 'narrativ', l: 'Im Satz — Holland (1997) zeigte …' }] },
        vor.form || 'klammer');
      const { wrap: seiteWrap, eingabe: seiteEingabe } = feldElement(
        { n: 'seite', l: 'Seitenzahl', kurz: true, h: 'Bei wörtlichen Zitaten Pflicht. Sonst leer lassen.' },
        vor.seite || '');
      einstellung.append(formWrap, seiteWrap);
      const seiteHilfe = seiteWrap.querySelector('.hilfe');

      const vorschau = el('div', 'notiz');
      const zeigeVorschau = () => {
        /* Eine Seitenzahl kann sich nicht auf mehrere Quellen zugleich
           beziehen. Statt sie stillschweigend fallen zu lassen, wird
           das Feld sichtbar gesperrt. */
        const mehrere = gewaehlt.length > 1;
        seiteEingabe.disabled = mehrere;
        if (mehrere) seiteEingabe.value = '';
        seiteWrap.style.opacity = mehrere ? '.5' : '';
        if (seiteHilfe) seiteHilfe.textContent = mehrere
          ? 'Bei mehreren Quellen gibt es keine gemeinsame Seitenzahl.'
          : 'Bei wörtlichen Zitaten Pflicht. Sonst leer lassen.';

        vorschau.innerHTML = gewaehlt.length
          ? `<span>&#9432;</span><span>Im Text erscheint: <b style="font-family:var(--schrift-doc)">${
              escHtml(Zitate.imText(gewaehlt, formEingabe.value, seiteEingabe.value.trim(),
                                    dok.einstellungen.sprache))}</b></span>`
          : '<span>&#9432;</span><span>Wähle oben eine Quelle aus.</span>';
      };
      formEingabe.addEventListener('change', zeigeVorschau);
      seiteEingabe.addEventListener('input', zeigeVorschau);
      zeigeVorschau();

      koerper.append(liste, einstellung, vorschau);
      if (optionen.bearbeiten)
        fuss.append(knopf('Entfernen', 'knopf-gefahr links',
          () => { schliessen(); fertig({ entfernen: true }); }));
      fuss.append(
        knopf('Neue Quelle', 'knopf-still' + (optionen.bearbeiten ? '' : ' links'), async () => {
          const neu = await quelleBearbeiten(dok);
          if (neu) { App.aenderung(); schliessen(); fertig(await zitatEinfuegen(dok, optionen)); }
        }),
        knopf('Abbrechen', 'knopf-still', () => { schliessen(); fertig(null); }),
        knopf(optionen.bearbeiten ? 'Übernehmen' : 'Einfügen', 'knopf-haupt', () => {
          if (!gewaehlt.length) { App.melde('Bitte zuerst eine Quelle auswählen.', true); return; }
          schliessen();
          fertig({ zitat: gewaehlt.map(q => q.key).join(','),
                   form: formEingabe.value,
                   seite: gewaehlt.length > 1 ? '' : seiteEingabe.value.trim() });
        })
      );
    });
  }

  /* ---------------- Querverweis ---------------- */

  /* `vorbelegung` (Block-Id) markiert beim Bearbeiten das aktuelle Ziel;
     `bearbeiten` blendet den Entfernen-Knopf ein.                    */
  function verweisEinfuegen(dok, optionen = {}) {
    return new Promise((fertig) => {
      const nummern = Modell.nummeriere(dok);
      const ziele = dok.bloecke.filter(
        b => ['tabelle', 'abbildung', 'diagramm', 'ueberschrift'].includes(b.typ));
      const { koerper, fuss, schliessen } = basis({
        titel: optionen.bearbeiten ? 'Querverweis bearbeiten' : 'Querverweis einfügen',
        unter: 'Der Verweis passt sich automatisch an, wenn du Blöcke verschiebst oder ergänzt.'
      });
      if (!ziele.length) {
        koerper.append(el('div', 'leerhinweis', 'Es gibt noch nichts, worauf verwiesen werden könnte.'));
      } else {
        const liste = el('div', 'quellenliste');
        for (const b of ziele) {
          const n = (nummern.get(b.id) || {}).nummer || '?';
          const beschriftung = b.typ === 'tabelle' ? `Tabelle ${n}`
                             : (b.typ === 'abbildung' || b.typ === 'diagramm')
                               ? `Abbildung ${n}` : `Abschnitt ${n}`;
          const titel = b.typ === 'ueberschrift' ? b.text : b.titel;
          const zeile = el('div', 'quelle-zeile' +
            (optionen.vorbelegung === b.id ? ' gewaehlt' : ''));
          zeile.innerHTML = `<span class="quelle-art">${escHtml(b.typ)}</span>
            <div class="quelle-txt"><b style="font-family:var(--schrift-ui);font-size:13px">${escHtml(beschriftung)}</b>
            <div class="quelle-warn">${escHtml(titel || 'ohne Titel')}</div></div>`;
          zeile.addEventListener('click', () => { schliessen(); fertig({ verweis: b.id }); });
          liste.append(zeile);
        }
        koerper.append(liste);
      }
      if (optionen.bearbeiten)
        fuss.append(knopf('Entfernen', 'knopf-gefahr links',
          () => { schliessen(); fertig({ entfernen: true }); }));
      fuss.append(knopf('Abbrechen', 'knopf-still', () => { schliessen(); fertig(null); }));
    });
  }

  /* ---------------- Kennwert ---------------- */

  /* Beim Bearbeiten eines Chips (optionen.bearbeiten) kommen die Werte
     vorbelegt an, und {entfernen:true} bedeutet: Chip löschen, Text
     stehen lassen. */
  async function kennwert(vorhanden, optionen = {}) {
    const aus = await formular({
      titel: optionen.bearbeiten ? 'Kennwert bearbeiten' : 'Statistischen Kennwert einfügen',
      unter: 'Das Symbol wird kursiv gesetzt, die Zahl nicht — genau so verlangt es APA 7.',
      felder: [
        { n: 'kennwert', l: 'Symbol', pflicht: true, kurz: true,
          h: 'z. B. M, SD, N, r, p, t, F, SW, α' },
        { n: 'wert', l: 'Wert', pflicht: true, kurz: true, h: 'z. B. 104, .84, 12.3' }
      ],
      werte: vorhanden || {},
      okText: optionen.bearbeiten ? 'Übernehmen' : 'Einfügen',
      entfernenText: optionen.bearbeiten ? 'Entfernen' : undefined
    });
    if (!aus) return null;
    if (aus.entfernen) return aus;
    return { kennwert: aus.kennwert, wert: aus.wert };
  }

  async function fussnote(vorhanden, optionen = {}) {
    const aus = await formular({
      titel: 'Fußnote',
      unter: 'APA 7 rät zu sparsamem Gebrauch — an deutschen Hochschulen sind sie trotzdem verbreitet.',
      felder: [{ n: 'text', l: 'Text der Fußnote', typ: 'text-mehrzeilig', pflicht: true, breit: true }],
      werte: { text: vorhanden || '' },
      okText: optionen.bearbeiten ? 'Übernehmen' : 'Einfügen',
      entfernenText: optionen.bearbeiten ? 'Entfernen' : undefined
    });
    if (!aus) return null;
    if (aus.entfernen) return aus;
    return aus.text;
  }

  /* ---------------- Tabelle ---------------- */

  async function tabelle(block, dok) {
    const aus = await formular({
      titel: 'Tabelle einrichten',
      unter: 'Nummer, Titelformat und Linien setzt der Export automatisch nach APA 7.',
      breit: true,
      werte: {
        titel: block.titel, anmerkung: block.anmerkung,
        spalten: String((block.kopf || []).length),
        zeilen: String((block.zeilen || []).length)
      },
      gruppen: [
        { titel: 'Beschriftung', felder: [
          { n: 'titel', l: 'Titel der Tabelle', pflicht: true,
            h: 'Kurz und aussagekräftig, ohne den Zusatz „Tabelle 1" — die Nummer kommt automatisch.' },
          { n: 'anmerkung', l: 'Anmerkung', typ: 'text-mehrzeilig', zeilen: 3,
            h: 'Erscheint klein unter der Tabelle. Abkürzungen erklären, Stichprobengröße nennen. ' +
               'Quelle zitieren mit {{zit:schluessel}}.' }
        ]},
        { titel: 'Größe', notiz: '<span>&#9432;</span><span>Beim Verkleinern gehen die Inhalte der ' +
            'entfernten Zeilen und Spalten verloren.</span>',
          felder: [
            { n: 'spalten', l: 'Spalten', typ: 'number', kurz: true },
            { n: 'zeilen', l: 'Datenzeilen', typ: 'number', kurz: true }
          ]}
      ]
    });
    if (!aus) return null;

    const spalten = Math.max(1, Math.min(12, +aus.spalten || 1));
    const zeilen = Math.max(1, Math.min(60, +aus.zeilen || 1));
    const passe = (reihe, breite, fuell = '') => {
      const r = (reihe || []).slice(0, breite);
      while (r.length < breite) r.push(fuell);
      return r;
    };
    block.titel = aus.titel;
    block.anmerkung = aus.anmerkung;
    block.kopf = passe(block.kopf, spalten);
    block.spaltenAusrichtung = passe(block.spaltenAusrichtung, spalten, 'c');
    block.spaltenAusrichtung[0] = block.spaltenAusrichtung[0] || 'l';
    block.zeilen = Array.from({ length: zeilen },
      (_, i) => passe((block.zeilen || [])[i], spalten));
    return block;
  }

  /* ---------------- Abbildung ---------------- */

  function abbildung(block) {
    return new Promise((fertig) => {
      const { koerper, fuss, schliessen } = basis({
        titel: 'Abbildung einrichten',
        unter: 'Das Bild wird in die Datei eingebettet und beim Export mit ausgeliefert.',
        breit: true
      });
      const zustand = { datenUrl: block.datenUrl, dateiname: block.dateiname };

      const ablage = el('div', 'abb-leer');
      const zeichneAblage = () => {
        ablage.innerHTML = zustand.datenUrl
          ? `<img src="${zustand.datenUrl}" alt="" style="max-height:190px;max-width:100%">
             <div>${escHtml(zustand.dateiname || 'Bild')} &mdash; klicken zum Austauschen</div>`
          : `<div style="font-size:22px">&#128247;</div>
             <div><b>Bild hierher ziehen</b> oder klicken zum Auswählen</div>
             <div style="font-size:11.5px">PNG, JPEG oder GIF</div>`;
      };
      zeichneAblage();

      const dateiwahl = el('input');
      dateiwahl.type = 'file';
      dateiwahl.accept = 'image/png,image/jpeg,image/gif';
      dateiwahl.style.display = 'none';

      const lade = (datei) => {
        if (!datei) return;
        if (!/^image\/(png|jpeg|gif)$/.test(datei.type)) {
          App.melde('Nur PNG, JPEG oder GIF — dieses Format kann LaTeX nicht einbinden.', true);
          return;
        }
        if (datei.size > 12 * 1024 * 1024) {
          App.melde('Das Bild ist größer als 12 MB. Bitte vorher verkleinern.', true);
          return;
        }
        const leser = new FileReader();
        leser.onload = () => {
          zustand.datenUrl = leser.result;
          zustand.dateiname = datei.name;
          zeichneAblage();
        };
        leser.readAsDataURL(datei);
      };

      ablage.addEventListener('click', () => dateiwahl.click());
      dateiwahl.addEventListener('change', () => lade(dateiwahl.files[0]));
      ablage.addEventListener('dragover', (ev) => { ev.preventDefault(); ablage.classList.add('hover'); });
      ablage.addEventListener('dragleave', () => ablage.classList.remove('hover'));
      ablage.addEventListener('drop', (ev) => {
        ev.preventDefault(); ablage.classList.remove('hover');
        lade(ev.dataTransfer.files[0]);
      });

      const gitter = el('div', 'feldgitter');
      gitter.style.marginTop = '14px';
      const { wrap: tw, eingabe: te } = feldElement(
        { n: 'titel', l: 'Titel der Abbildung', pflicht: true,
          h: 'Ohne „Abbildung 1" — die Nummer setzt der Export.' }, block.titel);
      const { wrap: bw, eingabe: be } = feldElement(
        { n: 'breite', l: 'Breite in Prozent', typ: 'number', kurz: true,
          h: 'Anteil der Textbreite, üblich 60–90.' }, String(block.breite || 80));
      const { wrap: aw, eingabe: ae } = feldElement(
        { n: 'anmerkung', l: 'Anmerkung', typ: 'text-mehrzeilig', zeilen: 3,
          h: 'Erscheint klein unter der Abbildung. Quelle zitieren mit {{zit:schluessel}}.' },
        block.anmerkung);
      gitter.append(tw, bw, aw);

      koerper.append(ablage, dateiwahl, gitter);
      fuss.append(
        knopf('Abbrechen', 'knopf-still', () => { schliessen(); fertig(null); }),
        knopf('Übernehmen', 'knopf-haupt', () => {
          if (!te.value.trim()) { App.melde('Die Abbildung braucht einen Titel.', true); te.focus(); return; }
          block.datenUrl = zustand.datenUrl || '';
          block.dateiname = zustand.dateiname || '';
          block.titel = te.value.trim();
          block.anmerkung = ae.value.trim();
          block.breite = Math.max(10, Math.min(100, +be.value || 80));
          schliessen(); fertig(block);
        })
      );
    });
  }

  /* ---------------- Formel ---------------- */

  async function formel(block) {
    const aus = await formular({
      titel: 'Formel',
      unter: 'In LaTeX-Schreibweise. Beispiele: <code>\\frac{a}{b}</code>, <code>\\sum_{i=1}^{n} x_i</code>, ' +
             '<code>\\bar{x}</code>, <code>\\alpha</code>',
      felder: [{ n: 'tex', l: 'Formel', typ: 'text-mehrzeilig', pflicht: true, breit: true }],
      werte: { tex: block.tex }, okText: 'Übernehmen'
    });
    if (!aus) return null;
    block.tex = aus.tex;
    return block;
  }

  /* ---------------- LaTeX ansehen ---------------- */

  function texAnsehen(dok) {
    const { koerper, fuss, schliessen } = basis({
      titel: 'Das erzeugte LaTeX',
      unter: 'Nur zum Nachschauen. Du musst hiervon nichts verstehen — der Export macht daraus ein PDF.',
      breit: true
    });
    const projekt = Latex.erzeuge(dok);
    const namen = Object.keys(projekt.dateien);
    const reiter = el('div', 'reiter');
    const anzeige = el('pre', 'texblick');
    const zeige = (name) => {
      anzeige.textContent = projekt.dateien[name];
      reiter.querySelectorAll('button').forEach(b =>
        b.classList.toggle('aktiv', b.textContent === name));
    };
    for (const n of namen) {
      const b = el('button', null, escHtml(n));
      b.addEventListener('click', () => zeige(n));
      reiter.append(b);
    }
    koerper.append(reiter, anzeige);
    zeige('arbeit.tex');
    fuss.append(knopf('Schließen', 'knopf-haupt', schliessen));
  }

  /* ---------------- Hilfe ---------------- */

  function hilfe() {
    const { koerper, fuss, schliessen } = basis({ titel: 'Kurzanleitung', breit: true });
    koerper.innerHTML = `
      <div class="gruppe"><h3>So arbeitest du</h3>
        <p style="margin:0 0 8px;font-size:13.5px;line-height:1.6">
        Links steht deine <b>Gliederung</b> — ein Klick springt zur Stelle. In der Mitte
        schreibst du. Rechts siehst du, wie es aussehen wird.</p>
        <p style="margin:0;font-size:13.5px;line-height:1.6">
        Jeder Abschnitt ist ein <b>Baustein</b>. Fahr mit der Maus darüber: links erscheint
        ein Griff zum Verschieben, oben rechts die Werkzeuge. Unter dem Text legst du mit
        <b>+ Absatz</b>, <b>+ Tabelle</b> und so weiter neue Bausteine an.</p>
      </div>
      <div class="gruppe"><h3>Tastatur</h3>
        <div style="font-size:13.5px;line-height:1.9">
        <b>Strg</b>+<b>B</b> fett &nbsp;·&nbsp; <b>Strg</b>+<b>I</b> kursiv &nbsp;·&nbsp;
        <b>Strg</b>+<b>S</b> sichern<br>
        <b>Strg</b>+<b>Z</b> rückgängig &nbsp;·&nbsp; <b>Strg</b>+<b>Y</b> wiederholen —
        auch gelöschte Bausteine kommen damit zurück<br>
        <b>Strg</b>+<b>F</b> suchen &nbsp;·&nbsp; <b>Strg</b>+<b>H</b> suchen und ersetzen —
        auch in Tabellen und Beschriftungen<br>
        <b>Enter</b> im Absatz: neuer Absatz darunter &nbsp;·&nbsp;
        <b>Rücktaste</b> im leeren Absatz: löscht ihn<br>
        <b>Strg</b>+<b>Umschalt</b>+<b>Z</b> Quelle zitieren &nbsp;·&nbsp;
        <b>@</b>+Anfangsbuchstaben tippen zitiert direkt beim Schreiben<br>
        Text auswählen zeigt eine kleine Leiste: fett, kursiv, zitieren — ohne Umweg
        </div>
      </div>
      <div class="gruppe"><h3>Was farbig hinterlegt ist</h3>
        <div style="font-size:13.5px;line-height:2">
        <span class="chip chip-zitat">(Holland, 1997)</span> &nbsp;eine Quellenangabe — ändert sich mit,
        wenn du die Quelle bearbeitest. Im Zitat-Fenster lassen sich mehrere Quellen
        anklicken, dann stehen sie zusammen in einer Klammer<br>
        <span class="chip chip-verweis">Tabelle 3</span> &nbsp;ein Querverweis — die Nummer stimmt immer,
        auch nach dem Umsortieren<br>
        <span class="chip chip-kennwert"><i>SW</i>&nbsp;=&nbsp;104</span> &nbsp;ein statistischer Kennwert —
        Symbol kursiv, wie APA 7 es will<br>
        <b>Klick auf einen Chip</b> öffnet ihn zum Bearbeiten — dort lässt er
        sich auch entfernen, der Text drumherum bleibt stehen
        </div>
      </div>
      <div class="gruppe"><h3>Das PDF</h3>
        <p style="margin:0 0 8px;font-size:13.5px;line-height:1.6">
        Rechts steht <b>kein Nachbau, sondern das fertige PDF</b>. Zwei Sekunden
        nachdem du aufhörst zu tippen, wird es neu gebaut. Eiliger?
        <b>Strg</b>+<b>Enter</b> oder der Knopf <b>PDF bauen</b>.</p>
        <p style="margin:0;font-size:13.5px;line-height:1.6">
        Geht etwas schief, erscheint der Fehler über dem PDF — auf Deutsch und
        mit einem Klick zur betroffenen Stelle. Das <b>zuletzt gelungene PDF
        bleibt dabei stehen</b>, du verlierst also nie die Ansicht.</p>
      </div>
      <div class="gruppe"><h3>Quellen von anderswo</h3>
        <p style="margin:0;font-size:13.5px;line-height:1.6">
        <b>Zotero</b> holt deine Bibliothek direkt — einmal einen Schlüssel unter
        zotero.org/settings/keys anlegen, fertig.<br>
        <b>Citavi</b> (und EndNote, Mendeley, JabRef) über <b>Import</b>: dort
        exportieren als BibTeX oder RIS, Datei hier hineinziehen.</p>
      </div>
      <div class="gruppe"><h3>Wo liegt meine Arbeit?</h3>
        <p style="margin:0;font-size:13.5px;line-height:1.6">
        Als eine Datei im Ordner <b>Arbeiten</b> neben dem Programm. Beim
        Überschreiben wird die Vorfassung nach <b>.sicherungen</b> kopiert —
        unter <b>Öffnen &rarr; Frühere Fassungen</b> lässt sich jede davon
        mit einem Klick wiederherstellen.
        <b>ZIP</b> packt zusätzlich das reine LaTeX-Projekt — zum Weitergeben
        oder für Overleaf.</p>
      </div>`;
    fuss.append(knopf('Alles klar', 'knopf-haupt', schliessen));
  }

  return { basis, knopf, feldElement, formular, bestaetigen, neuesDokument, deckblatt, layout,
           quellenverwaltung, quelleBearbeiten, zitatEinfuegen, verweisEinfuegen,
           kennwert, fussnote, tabelle, abbildung, formel, texAnsehen, hilfe };
})();
