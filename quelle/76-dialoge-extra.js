/* ===================================================================
   76-dialoge-extra.js  --  Projekte, Zotero, Datei-Import, Einstellungen
   -------------------------------------------------------------------
   Alles, was den lokalen Begleiter braucht. Getrennt von 50-dialoge.js,
   damit jede Datei überschaubar bleibt.
   =================================================================== */

const DialogeExtra = (() => {

  const el = (tag, klasse, html) => {
    const n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const knopf = Dialoge.knopf;

  const zeitpunkt = (sekunden) => {
    const d = new Date(sekunden * 1000);
    return d.toLocaleDateString('de-DE') + ', ' +
           d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  /* ================================================ Projekte öffnen */

  function projektOeffnen() {
    return new Promise(async (fertig) => {
      const { koerper, fuss, schliessen } = Dialoge.basis({
        titel: 'Arbeit öffnen',
        unter: 'Alles im Ordner <b>Arbeiten</b> neben dem Programm.',
        breit: true
      });

      let liste = [];
      try {
        liste = (await Begleiter.projekte()).projekte;
      } catch (f) {
        koerper.append(el('div', 'notiz warnung',
          '<span>&#9888;</span><span>' + escHtml(f.message) + '</span>'));
      }

      const zeichne = () => {
        koerper.innerHTML = '';
        if (!liste.length) {
          koerper.append(el('div', 'leerhinweis',
            'Noch keine gesicherte Arbeit. Schreib etwas und drücke Strg+S.'));
          return;
        }
        const box = el('div', 'quellenliste');
        for (const p of liste) {
          const zeile = el('div', 'quelle-zeile');
          zeile.innerHTML =
            `<div class="quelle-txt">
               <b style="font-family:var(--schrift-ui);font-size:13.5px">${escHtml(p.titel)}</b>
               <div class="quelle-warn">${escHtml(p.name)} · ${zeitpunkt(p.geaendert)}
                 · ${(p.bytes / 1024).toFixed(0)} KB</div>
             </div>`;
          const werkzeug = el('div');
          werkzeug.style.cssText = 'display:flex;gap:4px;flex:none';
          werkzeug.append(knopf('Löschen', 'knopf-klein', async (ev) => {
            ev.stopPropagation();
            const ok = await Dialoge.bestaetigen({
              titel: 'Arbeit löschen?',
              text: `<b>${escHtml(p.titel)}</b> wird entfernt. Die Sicherungen ` +
                    `im Unterordner <b>.sicherungen</b> bleiben erhalten.`
            });
            if (ok) {
              await Begleiter.loescheProjekt(p.name);
              liste = liste.filter(x => x !== p);
              zeichne();
            }
          }));
          zeile.append(werkzeug);
          zeile.addEventListener('click', () => { schliessen(); fertig(p.name); });
          box.append(zeile);
        }
        koerper.append(box);
      };
      zeichne();

      fuss.append(knopf('Abbrechen', 'knopf-still', () => { schliessen(); fertig(null); }));
    });
  }

  /* ================================================ Datei-Import */

  function dateiImport(dok) {
    return new Promise((fertig) => {
      const { koerper, fuss, schliessen } = Dialoge.basis({
        titel: 'Quellen aus einer Datei übernehmen',
        unter: 'Aus Citavi, Zotero, EndNote, Mendeley oder JabRef exportieren — ' +
               'als <b>BibTeX</b>, <b>RIS</b> oder <b>CSL-JSON</b>.',
        breit: true
      });

      koerper.append(el('div', 'notiz', `<span>&#9432;</span><span>
        <b>In Citavi:</b> Sammlung anklicken &rarr; <b>Datei</b> &rarr;
        <b>Exportieren</b> &rarr; BibTeX oder RIS wählen.<br>
        <b>In Zotero:</b> Rechtsklick auf die Sammlung &rarr;
        <b>Export Collection</b> &rarr; BibTeX oder CSL JSON.</span>`));

      const ablage = el('div', 'abb-leer');
      ablage.innerHTML = `<div style="font-size:22px">&#128196;</div>
        <div><b>Datei hierher ziehen</b> oder klicken zum Auswählen</div>
        <div style="font-size:11.5px">.bib · .ris · .json</div>`;
      const wahl = el('input');
      wahl.type = 'file';
      wahl.accept = '.bib,.bibtex,.ris,.json,text/plain,application/json';
      wahl.style.display = 'none';

      const vorschau = el('div');
      let gefunden = [];

      const lies = (datei) => {
        if (!datei) return;
        const leser = new FileReader();
        leser.onload = () => {
          const { art, quellen } = Import.lies(String(leser.result), datei.name);
          gefunden = quellen;
          if (!art) {
            vorschau.innerHTML = '';
            vorschau.append(el('div', 'notiz warnung',
              '<span>&#9888;</span><span>Das Format erkenne ich nicht. ' +
              'Erwartet werden BibTeX (.bib), RIS (.ris) oder CSL-JSON (.json).</span>'));
            return;
          }
          const name = { bibtex: 'BibTeX', ris: 'RIS', csl: 'CSL-JSON' }[art];
          vorschau.innerHTML = `<div class="gruppe"><h3>${name} · ${quellen.length}
            ${quellen.length === 1 ? 'Titel' : 'Titel'} gefunden</h3></div>`;
          const box = el('div', 'quellenliste');
          for (const q of quellen.slice(0, 60)) {
            const zeile = el('div', 'quelle-zeile');
            zeile.innerHTML =
              `<span class="quelle-art">${escHtml((Modell.QUELLTYPEN[q.typ] || {}).name || q.typ)}</span>
               <div class="quelle-txt">${
                 Zitate.verzeichniseintrag(q, dok.einstellungen.sprache)}</div>`;
            box.append(zeile);
          }
          vorschau.append(box);
          if (quellen.length > 60)
            vorschau.append(el('div', 'quelle-warn',
              `… und ${quellen.length - 60} weitere.`));
        };
        leser.readAsText(datei, 'utf-8');
      };

      ablage.addEventListener('click', () => wahl.click());
      wahl.addEventListener('change', () => lies(wahl.files[0]));
      ablage.addEventListener('dragover', (ev) => {
        ev.preventDefault(); ablage.classList.add('hover');
      });
      ablage.addEventListener('dragleave', () => ablage.classList.remove('hover'));
      ablage.addEventListener('drop', (ev) => {
        ev.preventDefault(); ablage.classList.remove('hover');
        lies(ev.dataTransfer.files[0]);
      });

      koerper.append(ablage, wahl, vorschau);
      fuss.append(
        knopf('Abbrechen', 'knopf-still', () => { schliessen(); fertig(null); }),
        knopf('Übernehmen', 'knopf-haupt', () => {
          if (!gefunden.length) { App.melde('Noch keine Datei eingelesen.', true); return; }
          const bericht = Import.einfuegen(dok, gefunden);
          schliessen();
          fertig(bericht);
        }));
    });
  }

  /* ================================================ Zotero */

  async function zoteroEinrichten() {
    const stand = await Begleiter.einstellungen().catch(() => ({}));
    const aus = await Dialoge.formular({
      titel: 'Zotero verbinden',
      unter: 'Den Schlüssel legst du unter <b>zotero.org/settings/keys</b> an — ' +
             '<b>Create new private key</b>, Leserechte genügen. ' +
             'Er wird neben dem Programm gespeichert, nicht im Browser.',
      breit: true,
      werte: { zoteroSchluessel: stand.zoteroGesetzt ? '••••••••••••' : '' },
      felder: [
        { n: 'zoteroSchluessel', l: 'API-Schlüssel', pflicht: true, breit: true,
          h: '24 Zeichen aus Buchstaben und Ziffern. Die Benutzernummer ' +
             'lese ich selbst aus dem Schlüssel.' }
      ],
      okText: 'Verbinden'
    });
    if (!aus) return null;

    try {
      const geprueft = await Begleiter.zoteroPruefen(
        aus.zoteroSchluessel.startsWith('•') ? '' : aus.zoteroSchluessel);
      const werte = { zoteroBenutzer: geprueft.benutzer, zoteroName: geprueft.name };
      if (!aus.zoteroSchluessel.startsWith('•'))
        werte.zoteroSchluessel = aus.zoteroSchluessel;
      await Begleiter.setzeEinstellungen(werte);
      App.melde('Mit Zotero verbunden' + (geprueft.name ? ' als ' + geprueft.name : '') + '.');
      return geprueft;
    } catch (f) {
      App.melde(f.message, true);
      return null;
    }
  }

  function zoteroImport(dok) {
    return new Promise(async (fertig) => {
      const stand = await Begleiter.einstellungen().catch(() => ({}));
      if (!stand.zoteroGesetzt || !stand.zoteroBenutzer) {
        const g = await zoteroEinrichten();
        if (!g) { fertig(null); return; }
      }

      const { koerper, fuss, schliessen } = Dialoge.basis({
        titel: 'Aus Zotero übernehmen',
        unter: 'Auswählen, was in die Quellenliste soll. Doppelte erkenne ich.',
        breit: true
      });
      koerper.innerHTML = '<div class="leerhinweis">Bibliothek wird geladen …</div>';
      fuss.append(knopf('Abbrechen', 'knopf-still', () => { schliessen(); fertig(null); }));

      let quellen = [];
      try {
        quellen = (await Begleiter.zoteroBibliothek()).quellen;
      } catch (f) {
        koerper.innerHTML = '';
        koerper.append(el('div', 'notiz warnung',
          '<span>&#9888;</span><span>' + escHtml(f.message) + '</span>'));
        return;
      }

      const gewaehlt = new Set();
      const suche = el('input');
      suche.type = 'search';
      suche.placeholder = 'Suchen nach Titel, Autor oder Jahr …';
      suche.style.cssText = 'width:100%;padding:8px 10px;margin-bottom:10px;' +
        'border:1px solid var(--linie-stark);border-radius:var(--r);' +
        'background:var(--flaeche-2)';

      const liste = el('div', 'quellenliste');
      const zeichne = () => {
        const wort = suche.value.trim().toLowerCase();
        liste.innerHTML = '';
        const passend = quellen.filter(q => !wort ||
          (q.felder.titel + ' ' + q.felder.autoren + ' ' + q.felder.jahr)
            .toLowerCase().includes(wort));
        if (!passend.length) {
          liste.append(el('div', 'leerhinweis', 'Nichts gefunden.'));
          return;
        }
        for (const q of passend.slice(0, 300)) {
          const zeile = el('div', 'quelle-zeile' +
            (gewaehlt.has(q) ? ' gewaehlt' : ''));
          zeile.innerHTML =
            `<span class="quelle-art">${escHtml((Modell.QUELLTYPEN[q.typ] || {}).name || q.typ)}</span>
             <div class="quelle-txt">${
               Zitate.verzeichniseintrag(q, dok.einstellungen.sprache)}</div>`;
          zeile.addEventListener('click', () => {
            if (gewaehlt.has(q)) gewaehlt.delete(q); else gewaehlt.add(q);
            zeile.classList.toggle('gewaehlt');
            zaehler.textContent = gewaehlt.size
              ? `${gewaehlt.size} ausgewählt` : 'nichts ausgewählt';
          });
          liste.append(zeile);
        }
        if (passend.length > 300)
          liste.append(el('div', 'quelle-warn',
            `… ${passend.length - 300} weitere. Grenze die Suche ein.`));
      };
      suche.addEventListener('input', zeichne);

      const zaehler = el('span', 'quelle-warn', 'nichts ausgewählt');
      koerper.innerHTML = '';
      koerper.append(el('div', 'gruppe',
        `<h3>${quellen.length} Titel in deiner Bibliothek</h3>`), suche, liste);
      zeichne();

      fuss.innerHTML = '';
      fuss.append(zaehler,
        knopf('Alle auswählen', 'knopf-still', () => {
          quellen.forEach(q => gewaehlt.add(q));
          zeichne();
          zaehler.textContent = `${gewaehlt.size} ausgewählt`;
        }),
        knopf('Abbrechen', 'knopf-still', () => { schliessen(); fertig(null); }),
        knopf('Übernehmen', 'knopf-haupt', () => {
          if (!gewaehlt.size) { App.melde('Nichts ausgewählt.', true); return; }
          const bericht = Import.einfuegen(dok, [...gewaehlt]);
          schliessen();
          fertig(bericht);
        }));
      zaehler.classList.add('links');
      zaehler.style.marginRight = 'auto';
    });
  }

  /* ================================================ Einstellungen */

  async function einstellungen() {
    const [stand, werkzeuge] = await Promise.all([
      Begleiter.einstellungen().catch(() => ({})),
      Begleiter.pruefung().catch(() => ({ programme: {} }))
    ]);

    const { koerper, fuss, schliessen } = Dialoge.basis({
      titel: 'Einstellungen', breit: true
    });

    const werkzeugliste = Object.entries(werkzeuge.programme || {})
      .map(([name, a]) => `<div class="schalterzeile">
         <span style="font-size:16px">${a.gefunden ? '✓' : '✕'}</span>
         <div class="txt"><b>${escHtml(name)}</b>
           <span>${escHtml(a.gefunden ? a.fassung : 'nicht gefunden')}</span>
           ${a.pfad ? `<span style="font-family:var(--schrift-ma);font-size:10.5px">${escHtml(a.pfad)}</span>` : ''}
         </div></div>`).join('');

    koerper.innerHTML = `
      <div class="gruppe"><h3>LaTeX auf diesem Rechner</h3>${werkzeugliste}
      ${werkzeuge.vollstaendig ? '' :
        `<div class="notiz warnung"><span>&#9888;</span><span>
         Ohne diese Programme entsteht kein PDF.<br>
         <b>Linux:</b> <code>sudo apt install texlive-full biber</code><br>
         <b>Windows:</b> MiKTeX von miktex.org — dort unter Einstellungen
         „Pakete immer installieren“ wählen, sonst wartet ein Dialog im
         Hintergrund und der Bau bleibt hängen.</span></div>`}
      </div>
      <div class="gruppe"><h3>Zotero</h3>
        <div class="schalterzeile"><span style="font-size:16px">${stand.zoteroGesetzt ? '✓' : '–'}</span>
          <div class="txt"><b>${stand.zoteroGesetzt ? 'verbunden' : 'nicht verbunden'}</b>
          <span>${escHtml(stand.zoteroName ? 'als ' + stand.zoteroName : 'Schlüssel unter zotero.org/settings/keys anlegen')}</span>
        </div></div>
      </div>`;

    fuss.append(
      knopf(stand.zoteroGesetzt ? 'Zotero neu verbinden' : 'Zotero verbinden',
            'knopf-still links', async () => { schliessen(); await zoteroEinrichten(); }),
      knopf('Schließen', 'knopf-haupt', schliessen));
    fuss.firstChild.style.marginRight = 'auto';
  }

  return { projektOeffnen, dateiImport, zoteroImport, zoteroEinrichten, einstellungen };
})();
