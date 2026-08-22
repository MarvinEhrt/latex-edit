/* ===================================================================
   78-diagrammdialog.js  --  Diagramm einrichten
   -------------------------------------------------------------------
   Ein Dialog für alle vier Arten. Welche Spalten wofür stehen, hängt
   von der Art ab -- das steht als Satz über dem Datenraster, damit man
   nicht raten muss.
   =================================================================== */

const Diagrammdialog = (() => {

  const el = (tag, klasse, html) => {
    const n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (html != null) n.innerHTML = html;
    return n;
  };

  const ARTEN = {
    balken: { name: 'Balken', zeichen: '▮',
      hilfe: 'Erste Spalte: Beschriftung der Balken. Eine Wertspalte ergibt ' +
             'einzelne Balken, mehrere ergeben Gruppen. Eine weitere Spalte ' +
             'kann die Fehlerbalken liefern.' },
    linie: { name: 'Linie / Profil', zeichen: '📈',
      hilfe: 'Erste Spalte: die x-Achse (Messzeitpunkte, Skalen, Zahlen). ' +
             'Jede weitere gewählte Spalte wird eine Linie.' },
    streu: { name: 'Streudiagramm', zeichen: '⁛',
      hilfe: 'Erste Spalte: x-Werte, zweite: y-Werte. Je Zeile ein Punkt. ' +
             'Die Ausgleichsgerade wird berechnet, r und n kommen in die Anmerkung.' },
    box: { name: 'Boxplot', zeichen: '⌷',
      hilfe: 'Je gewählter Spalte ein Kasten; darunter stehen die Rohwerte, ' +
             'nicht die Kennwerte. Quartile, Median und Ausreißer rechne ich aus.' }
  };

  function einrichten(block, dok) {
    return new Promise((fertig) => {
      const { koerper, fuss, schliessen } = Dialoge.basis({
        titel: 'Diagramm einrichten',
        beimSchliessen: () => fertig(null),
        unter: 'Gesetzt wird es in LaTeX — das PDF rechts zeigt das Ergebnis, ' +
               'nicht eine Nachbildung.',
        breit: true
      });

      /* Auf einer Kopie arbeiten, damit Abbrechen wirklich abbricht. */
      const e = JSON.parse(JSON.stringify(block));
      e.daten = e.daten || { kopf: ['Gruppe', 'Wert'], zeilen: [['A', '1']] };

      const tabellen = dok.bloecke.filter(b => b.typ === 'tabelle');
      const nummern = Modell.nummeriere(dok);

      /* -------- Art -------- */
      const artwahl = el('div', 'artwahl');
      const zeichneArt = () => {
        artwahl.innerHTML = '';
        for (const [schluessel, a] of Object.entries(ARTEN)) {
          const k = el('button', 'artknopf' + (e.art === schluessel ? ' aktiv' : ''),
            `<span class="artzeichen">${a.zeichen}</span><span>${escHtml(a.name)}</span>`);
          k.addEventListener('click', () => { e.art = schluessel; zeichneAlles(); });
          artwahl.append(k);
        }
      };

      /* -------- Datenraster -------- */
      const rasterkasten = el('div');

      const zeichneRaster = () => {
        rasterkasten.innerHTML = '';
        rasterkasten.append(el('div', 'hilfe', escHtml(ARTEN[e.art].hilfe)));

        if (e.quelle === 'tabelle') {
          const t = tabellen.find(b => b.id === e.tabelleId);
          rasterkasten.append(el('div', 'notiz', t
            ? `<span>&#9432;</span><span>Die Zahlen kommen aus <b>Tabelle
               ${escHtml((nummern.get(t.id) || {}).nummer || '?')}</b>. Änderst du
               die Tabelle, ändert sich das Diagramm mit.</span>`
            : '<span>&#9888;</span><span>Bitte oben eine Tabelle auswählen.</span>'));
          if (t) e.daten = { kopf: t.kopf.slice(), zeilen: t.zeilen.map(z => z.slice()) };
          zeichneRollen();
          return;
        }

        const ablage = el('div', 'rasterablage');
        const gitter = el('table', 'datengitter');
        const kopfzeile = el('tr');
        e.daten.kopf.forEach((h, s) => {
          const th = el('th');
          th.contentEditable = 'true';
          th.textContent = h;
          th.addEventListener('input', () => { e.daten.kopf[s] = th.textContent; });
          th.addEventListener('blur', zeichneRollen);
          kopfzeile.append(th);
        });
        gitter.append(kopfzeile);
        e.daten.zeilen.forEach((zeile, z) => {
          const tr = el('tr');
          e.daten.kopf.forEach((_, s) => {
            const td = el('td');
            td.contentEditable = 'true';
            td.textContent = zeile[s] == null ? '' : zeile[s];
            if (s > 0 && zeile[s] && !Daten.istZahl(zeile[s])) td.classList.add('keinezahl');
            td.addEventListener('input', () => {
              e.daten.zeilen[z][s] = td.textContent;
              td.classList.toggle('keinezahl',
                s > 0 && !!td.textContent.trim() && !Daten.istZahl(td.textContent));
            });
            tr.append(td);
          });
          gitter.append(tr);
        });
        ablage.append(gitter);

        /* Einfügen aus Excel und Ablegen einer CSV ersetzen das Raster */
        const uebernimm = (text) => {
          const neu = Daten.lies(text);
          if (!neu) { App.melde('Daraus konnte ich keine Zahlen lesen.', true); return; }
          e.daten = { kopf: neu.kopf, zeilen: neu.zeilen };
          e.xSpalte = 0;
          e.wertSpalten = neu.kopf.map((_, i) => i).filter(i => i !== 0).slice(0, 4);
          e.fehlerSpalte = null;
          zeichneAlles();
          App.melde(`${neu.zeilen.length} Zeilen übernommen.`);
        };
        ablage.addEventListener('paste', (ev) => {
          const t = (ev.clipboardData || window.clipboardData).getData('text/plain');
          if (Daten.istTabellarisch(t)) { ev.preventDefault(); uebernimm(t); }
        });
        ablage.addEventListener('dragover', (ev) => {
          ev.preventDefault(); ablage.classList.add('hover');
        });
        ablage.addEventListener('dragleave', () => ablage.classList.remove('hover'));
        ablage.addEventListener('drop', (ev) => {
          ev.preventDefault(); ablage.classList.remove('hover');
          const datei = ev.dataTransfer.files[0];
          if (datei) datei.text().then(uebernimm);
        });
        rasterkasten.append(ablage);

        const knoepfe = el('div', 'tabellenknoepfe');
        const k = (text, aktion) => {
          const b = el('button', 'knopf knopf-klein', text);
          b.addEventListener('click', aktion);
          return b;
        };
        knoepfe.append(
          k('+ Zeile', () => { e.daten.zeilen.push(e.daten.kopf.map(() => '')); zeichneRaster(); }),
          k('− Zeile', () => {
            if (e.daten.zeilen.length > 1) e.daten.zeilen.pop();
            zeichneRaster();
          }),
          k('+ Spalte', () => {
            e.daten.kopf.push('Spalte ' + (e.daten.kopf.length + 1));
            e.daten.zeilen.forEach(z => z.push(''));
            zeichneAlles();
          }),
          k('− Spalte', () => {
            if (e.daten.kopf.length > 2) {
              e.daten.kopf.pop();
              e.daten.zeilen.forEach(z => z.pop());
            }
            zeichneAlles();
          }));
        rasterkasten.append(knoepfe);
        rasterkasten.append(el('div', 'hilfe',
          'Aus Excel oder SPSS kopieren und mit Strg+V hier einfügen, oder ' +
          'eine CSV-Datei auf das Raster ziehen. Deutsches Dezimalkomma ist in Ordnung.'));
        zeichneRollen();
      };

      /* -------- Spaltenrollen -------- */
      const rollenkasten = el('div', 'gruppe');

      function zeichneRollen() {
        rollenkasten.innerHTML = '<h3>Welche Spalte wofür</h3>';
        const kopf = e.daten.kopf;
        const gitter = el('div', 'feldgitter');

        if (e.art !== 'box') {
          const { wrap, eingabe } = Dialoge.feldElement({
            n: 'xspalte', l: e.art === 'streu' ? 'x-Werte' : 'Beschriftung / x-Achse',
            typ: 'auswahl', kurz: true,
            optionen: kopf.map((h, i) => ({ w: String(i), l: h || `Spalte ${i + 1}` }))
          }, String(e.xSpalte || 0));
          eingabe.addEventListener('change', () => { e.xSpalte = +eingabe.value; zeichneRollen(); });
          gitter.append(wrap);
        }

        if (e.art === 'balken') {
          const { wrap, eingabe } = Dialoge.feldElement({
            n: 'fehler', l: 'Fehlerbalken aus Spalte', typ: 'auswahl', kurz: true,
            optionen: [{ w: '', l: 'keine' }].concat(
              kopf.map((h, i) => ({ w: String(i), l: h || `Spalte ${i + 1}` })))
          }, e.fehlerSpalte == null ? '' : String(e.fehlerSpalte));
          eingabe.addEventListener('change', () => {
            e.fehlerSpalte = eingabe.value === '' ? null : +eingabe.value;
            zeichneRollen();
          });
          gitter.append(wrap);

          if (e.fehlerSpalte != null) {
            const { wrap: w2, eingabe: e2 } = Dialoge.feldElement({
              n: 'fehlerart', l: 'Was zeigen sie?', typ: 'auswahl', kurz: true,
              h: 'Kommt automatisch in die Anmerkung — APA 7 verlangt die Angabe.',
              optionen: [{ w: 'se', l: 'Standardfehler' }, { w: 'sd', l: 'Standardabweichung' },
                         { w: 'ci', l: '95-%-Konfidenzintervall' }]
            }, e.fehlerArt || 'se');
            e2.addEventListener('change', () => { e.fehlerArt = e2.value; });
            gitter.append(w2);
          }
        }
        rollenkasten.append(gitter);

        /* Wertspalten als Kästchen -- mehrere sind der Normalfall */
        const wahl = el('div', 'spaltenwahl');
        kopf.forEach((h, i) => {
          if (e.art !== 'box' && i === (e.xSpalte || 0)) return;
          if (e.art === 'balken' && i === e.fehlerSpalte) return;
          const marke = el('label', 'spaltenmarke');
          const kaesten = el('input');
          kaesten.type = e.art === 'streu' ? 'radio' : 'checkbox';
          kaesten.name = 'wertspalte';
          kaesten.checked = (e.wertSpalten || []).includes(i);
          kaesten.addEventListener('change', () => {
            if (e.art === 'streu') e.wertSpalten = [i];
            else if (kaesten.checked) e.wertSpalten = [...(e.wertSpalten || []), i].sort((a, b) => a - b);
            else e.wertSpalten = (e.wertSpalten || []).filter(x => x !== i);
            zeigeWarnung();
          });
          marke.append(kaesten, document.createTextNode(' ' + (h || `Spalte ${i + 1}`)));
          wahl.append(marke);
        });
        rollenkasten.append(el('label', null,
          e.art === 'streu' ? 'y-Werte' : 'Diese Spalten darstellen'), wahl);
        const warnung = el('div', 'hilfe');
        rollenkasten.append(warnung);

        function zeigeWarnung() {
          const n = (e.wertSpalten || []).length;
          warnung.textContent = n === 0
            ? 'Ohne gewählte Spalte bleibt das Diagramm leer.'
            : n > 4 ? 'Mehr als vier Reihen werden unübersichtlich — ' +
                      'die fünfte bekommt wieder die erste Farbe.'
                    : `${n} ${n === 1 ? 'Reihe' : 'Reihen'}.`;
          warnung.style.color = n === 0 ? 'var(--warn)' : '';
        }
        zeigeWarnung();
      }

      /* -------- Beschriftung und Aussehen -------- */
      const restkasten = el('div', 'gruppe');

      function zeichneRest() {
        restkasten.innerHTML = '<h3>Beschriftung und Aussehen</h3>';
        const gitter = el('div', 'feldgitter');
        const feld = (name, beschriftung, wert, hilfe, kurz, typ, optionen) => {
          const { wrap, eingabe } = Dialoge.feldElement(
            { n: name, l: beschriftung, h: hilfe, kurz, typ, optionen }, wert);
          eingabe.addEventListener('input', () => { e[name] = eingabe.value; });
          eingabe.addEventListener('change', () => { e[name] = eingabe.value; });
          return wrap;
        };
        gitter.append(
          feld('titel', 'Titel der Abbildung', e.titel,
               'Ohne „Abbildung 1“ — die Nummer setzt der Export.', false),
          feld('achseX', 'Beschriftung x-Achse', e.achseX, '', true),
          feld('achseY', 'Beschriftung y-Achse', e.achseY, '', true));

        const { wrap: bw, eingabe: be } = Dialoge.feldElement(
          { n: 'breite', l: 'Breite in Prozent', typ: 'number', kurz: true,
            h: 'Anteil der Textbreite, üblich 70–95.' }, String(e.breite || 85));
        be.addEventListener('input', () => { e.breite = Math.max(30, Math.min(100, +be.value || 85)); });
        gitter.append(bw);

        const { wrap: aw, eingabe: ae } = Dialoge.feldElement(
          { n: 'anmerkung', l: 'Anmerkung', typ: 'text-mehrzeilig', zeilen: 2,
            h: 'Erscheint klein unter der Abbildung. Was die Fehlerbalken oder ' +
               'die Kästen zeigen, ergänze ich selbst.' }, e.anmerkung);
        ae.addEventListener('input', () => { e.anmerkung = ae.value; });
        gitter.append(aw);
        restkasten.append(gitter);

        const schalter = (name, beschriftung, erklaerung) => {
          const zeile = el('div', 'schalterzeile');
          const kaesten = el('input');
          kaesten.type = 'checkbox';
          kaesten.checked = !!e[name];
          kaesten.addEventListener('change', () => { e[name] = kaesten.checked; });
          zeile.append(kaesten, el('div', 'txt',
            `<b>${escHtml(beschriftung)}</b><span>${escHtml(erklaerung)}</span>`));
          return zeile;
        };
        restkasten.append(schalter('graustufen', 'Graustufen statt Farbe',
          'Für Schwarzweißdruck. Die Reihen bekommen zusätzlich Füllmuster — ' +
          'Farbe allein ist im Graustufendruck nicht unterscheidbar.'));
        if (e.art === 'streu')
          restkasten.append(schalter('regression', 'Ausgleichsgerade zeichnen',
            'Lineare Regression; r und n kommen in die Anmerkung.'));
      }

      /* -------- Datenquelle -------- */
      const quellkasten = el('div', 'gruppe');

      function zeichneQuelle() {
        quellkasten.innerHTML = '<h3>Woher die Zahlen kommen</h3>';
        const gitter = el('div', 'feldgitter');
        const { wrap, eingabe } = Dialoge.feldElement({
          n: 'quelle', l: 'Quelle', typ: 'auswahl', kurz: true,
          optionen: [{ w: 'eigen', l: 'Eigene Zahlen' }].concat(
            tabellen.length ? [{ w: 'tabelle', l: 'Aus einer Tabelle im Dokument' }] : [])
        }, e.quelle || 'eigen');
        eingabe.addEventListener('change', () => { e.quelle = eingabe.value; zeichneAlles(); });
        gitter.append(wrap);

        if (e.quelle === 'tabelle') {
          const { wrap: tw, eingabe: te } = Dialoge.feldElement({
            n: 'tabelleId', l: 'Welche Tabelle', typ: 'auswahl', kurz: true,
            optionen: tabellen.map(t => ({
              w: t.id,
              l: `Tabelle ${(nummern.get(t.id) || {}).nummer || '?'} — ${t.titel || 'ohne Titel'}`
            }))
          }, e.tabelleId || (tabellen[0] && tabellen[0].id));
          if (!e.tabelleId && tabellen[0]) e.tabelleId = tabellen[0].id;
          te.addEventListener('change', () => { e.tabelleId = te.value; zeichneAlles(); });
          gitter.append(tw);
        }
        quellkasten.append(gitter);
      }

      /* -------- alles zeichnen -------- */
      function zeichneAlles() {
        zeichneArt(); zeichneQuelle(); zeichneRaster(); zeichneRest();
      }

      koerper.append(artwahl, quellkasten, el('div', 'gruppe').appendChild(
        rasterkasten).parentElement, rollenkasten, restkasten);
      zeichneAlles();

      fuss.append(
        Dialoge.knopf('Abbrechen', 'knopf-still', () => { schliessen(); fertig(null); }),
        Dialoge.knopf('Übernehmen', 'knopf-haupt', () => {
          if (!(e.wertSpalten || []).length) {
            App.melde('Bitte mindestens eine Spalte zum Darstellen wählen.', true);
            return;
          }
          Object.assign(block, e);
          schliessen(); fertig(block);
        }));
    });
  }

  return { einrichten, ARTEN };
})();
