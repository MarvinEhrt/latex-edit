/* ===================================================================
   72-import.js  --  Quellen aus anderen Programmen übernehmen
   -------------------------------------------------------------------
   Liest BibTeX (.bib), RIS (.ris) und CSL-JSON (.json). Damit sind
   Citavi, Zotero-Export, EndNote, Mendeley und JabRef abgedeckt --
   alle können mindestens eines dieser Formate ausgeben.
   =================================================================== */

const Import = (() => {

  /* ---------- LaTeX-Reste aus BibTeX-Werten entfernen ---------- */
  const UMSCHRIFT = [
    [/\{\\"a\}|\\"a|\{\\ä\}/g, 'ä'], [/\{\\"o\}|\\"o/g, 'ö'],
    [/\{\\"u\}|\\"u/g, 'ü'], [/\{\\"A\}|\\"A/g, 'Ä'],
    [/\{\\"O\}|\\"O/g, 'Ö'], [/\{\\"U\}|\\"U/g, 'Ü'],
    [/\{\\ss\}|\\ss\b/g, 'ß'], [/\{\\'e\}|\\'e/g, 'é'],
    [/\{\\`e\}|\\`e/g, 'è'], [/\{\\'a\}|\\'a/g, 'á'],
    [/\{\\^o\}|\\\^o/g, 'ô'], [/\{\\~n\}|\\~n/g, 'ñ'],
    [/\{\\c\{c\}\}/g, 'ç'], [/\\&/g, '&'], [/\\%/g, '%'],
    [/\\\$/g, '$'], [/\\#/g, '#'], [/\\_/g, '_'],
    [/\\textendash\b|--/g, '–'], [/\\textemdash\b|---/g, '—'],
    [/\\['"`^~=.]/g, ''], [/[{}]/g, ''], [/\s+/g, ' ']
  ];

  const saeubere = (t) => {
    let s = String(t == null ? '' : t);
    for (const [muster, ersatz] of UMSCHRIFT) s = s.replace(muster, ersatz);
    return s.trim();
  };

  /* "Holland, John L. and Smith, Jane" -> "Holland, John L.; Smith, Jane" */
  const bibPersonen = (roh) => saeubere(roh)
    .split(/\s+and\s+/i).map(p => p.trim()).filter(Boolean).join('; ');

  /* ---------- BibTeX ---------- */

  const BIB_TYPEN = {
    book: 'buch', booklet: 'buch', inbook: 'kapitel',
    incollection: 'kapitel', inproceedings: 'kapitel',
    conference: 'kapitel', article: 'artikel',
    online: 'online', electronic: 'online', misc: 'online',
    techreport: 'bericht', report: 'bericht',
    phdthesis: 'bericht', mastersthesis: 'bericht', thesis: 'bericht',
    manual: 'bericht', unpublished: 'bericht'
  };

  function liesBibtex(text) {
    const eintraege = [];
    let i = 0;
    while (i < text.length) {
      const at = text.indexOf('@', i);
      if (at < 0) break;
      const klammer = text.indexOf('{', at);
      if (klammer < 0) break;
      const art = text.slice(at + 1, klammer).trim().toLowerCase();
      if (art === 'comment' || art === 'string' || art === 'preamble') {
        i = klammer + 1;
        continue;
      }
      // Zusammengehörigen Block über Klammertiefe finden
      let tiefe = 1, j = klammer + 1;
      while (j < text.length && tiefe > 0) {
        if (text[j] === '{') tiefe++;
        else if (text[j] === '}') tiefe--;
        j++;
      }
      eintraege.push({ art, roh: text.slice(klammer + 1, j - 1) });
      i = j;
    }

    return eintraege.map(({ art, roh }) => {
      const komma = roh.indexOf(',');
      const key = (komma < 0 ? roh : roh.slice(0, komma)).trim();
      const rest = komma < 0 ? '' : roh.slice(komma + 1);
      const felder = {};
      // feld = {wert} | "wert" | zahl
      const muster = /(\w[\w-]*)\s*=\s*/g;
      let t;
      while ((t = muster.exec(rest))) {
        const name = t[1].toLowerCase();
        let p = muster.lastIndex, wert = '';
        if (rest[p] === '{' || rest[p] === '"') {
          const auf = rest[p], zu = auf === '{' ? '}' : '"';
          let tiefe2 = 1;
          p++;
          const beginn = p;
          while (p < rest.length && tiefe2 > 0) {
            if (auf === '{' && rest[p] === '{') tiefe2++;
            else if (rest[p] === zu) tiefe2--;
            if (tiefe2 > 0) p++;
          }
          wert = rest.slice(beginn, p);
        } else {
          const ende = rest.indexOf(',', p);
          wert = rest.slice(p, ende < 0 ? rest.length : ende);
          p = ende < 0 ? rest.length : ende;
        }
        felder[name] = wert;
        muster.lastIndex = p;
      }
      return { art, key, felder };
    }).map(e => {
      const f = e.felder;
      const typ = BIB_TYPEN[e.art] || 'buch';
      const jahr = saeubere(f.year || f.date || '').match(/\d{4}/);
      const neu = {
        autoren: bibPersonen(f.author || f.editor || ''),
        jahr: jahr ? jahr[0] : '',
        titel: saeubere(f.title || '')
      };
      const uebernimm = (ziel, quelle) => {
        const w = saeubere(quelle || '');
        if (w) neu[ziel] = w;
      };
      uebernimm('verlag', f.publisher);
      uebernimm('auflage', f.edition);
      uebernimm('zeitschrift', f.journal || f.journaltitle);
      uebernimm('jahrgang', f.volume);
      uebernimm('heft', f.number || f.issue);
      uebernimm('seiten', (f.pages || '').replace(/--/g, '–'));
      uebernimm('doi', f.doi);
      uebernimm('url', f.url);
      uebernimm('abgerufen', f.urldate);
      uebernimm('buchtitel', f.booktitle);
      uebernimm('institution', f.institution || f.school || f.organization);
      uebernimm('nummer', f.number);
      if (f.editor && f.author) neu.herausgeber = bibPersonen(f.editor);
      return { key: e.key, typ, felder: neu };
    }).filter(q => q.felder.titel);
  }

  /* ---------- RIS ---------- */

  const RIS_TYPEN = {
    BOOK: 'buch', EBOOK: 'buch', JOUR: 'artikel', EJOUR: 'artikel',
    MGZN: 'artikel', NEWS: 'artikel', CHAP: 'kapitel', CONF: 'kapitel',
    CPAPER: 'kapitel', ELEC: 'online', ICOMM: 'online', WEB: 'online',
    RPRT: 'bericht', THES: 'bericht', UNPB: 'bericht', GEN: 'buch'
  };

  function liesRis(text) {
    const quellen = [];
    let aktuell = null;
    let letztesFeld = null;
    for (const roh of text.split(/\r?\n/)) {
      const t = roh.match(/^([A-Z][A-Z0-9])\s+-\s?(.*)$/);
      if (!t) {                                    // Fortsetzungszeile
        if (aktuell && letztesFeld && roh.trim())
          aktuell[letztesFeld] = (aktuell[letztesFeld] || '') + ' ' + roh.trim();
        continue;
      }
      const [, marke, wert] = t;
      if (marke === 'TY') { aktuell = { TY: wert.trim(), _autoren: [], _hrsg: [] }; letztesFeld = null; continue; }
      if (!aktuell) continue;
      if (marke === 'ER') { quellen.push(aktuell); aktuell = null; continue; }
      if (marke === 'AU' || marke === 'A1') { aktuell._autoren.push(wert.trim()); continue; }
      if (marke === 'ED' || marke === 'A2') { aktuell._hrsg.push(wert.trim()); continue; }
      aktuell[marke] = (aktuell[marke] ? aktuell[marke] + ' ' : '') + wert.trim();
      letztesFeld = marke;
    }

    return quellen.map((r, i) => {
      const typ = RIS_TYPEN[(r.TY || '').toUpperCase()] || 'buch';
      const jahr = (r.PY || r.Y1 || r.DA || '').match(/\d{4}/);
      const felder = {
        autoren: r._autoren.join('; '),
        jahr: jahr ? jahr[0] : '',
        titel: (r.TI || r.T1 || r.CT || '').trim()
      };
      const setze = (z, w) => { if (w && String(w).trim()) felder[z] = String(w).trim(); };
      const seiten = r.SP && r.EP ? `${r.SP}–${r.EP}` : (r.SP || '');
      if (typ === 'artikel') { setze('zeitschrift', r.JO || r.T2 || r.JF); setze('jahrgang', r.VL); setze('heft', r.IS); }
      if (typ === 'kapitel') { setze('buchtitel', r.T2 || r.BT); setze('herausgeber', r._hrsg.join('; ')); }
      if (typ === 'online') { setze('url', r.UR); setze('webseite', r.T2); }
      if (typ === 'bericht') { setze('institution', r.PB || r.PP); setze('url', r.UR); }
      setze('seiten', seiten);
      setze('verlag', r.PB);
      setze('auflage', r.ET);
      setze('doi', r.DO);
      return { key: '', typ, felder, _i: i };
    }).filter(q => q.felder.titel);
  }

  /* ---------- CSL-JSON (Zotero, Mendeley, Pandoc) ---------- */

  const CSL_TYPEN = {
    book: 'buch', chapter: 'kapitel', 'paper-conference': 'kapitel',
    'article-journal': 'artikel', 'article-magazine': 'artikel',
    'article-newspaper': 'artikel', webpage: 'online', post: 'online',
    'post-weblog': 'online', report: 'bericht', thesis: 'bericht',
    manuscript: 'bericht', dataset: 'bericht'
  };

  const cslPersonen = (liste) => (liste || []).map(p =>
    p.literal ? p.literal
              : [p.family, p.given].filter(Boolean).join(', ')).join('; ');

  function liesCsl(text) {
    let daten;
    try { daten = JSON.parse(text); } catch { return []; }
    if (!Array.isArray(daten)) daten = daten.items || [daten];
    return daten.map(e => {
      const typ = CSL_TYPEN[e.type] || 'buch';
      const teile = e.issued && e.issued['date-parts'] && e.issued['date-parts'][0];
      const felder = {
        autoren: cslPersonen(e.author) || cslPersonen(e.editor),
        jahr: teile ? String(teile[0]) : (String(e.issued && e.issued.raw || '').match(/\d{4}/) || [''])[0],
        titel: (e.title || '').trim()
      };
      const setze = (z, w) => { if (w && String(w).trim()) felder[z] = String(w).trim(); };
      if (typ === 'artikel') { setze('zeitschrift', e['container-title']); setze('jahrgang', e.volume); setze('heft', e.issue); }
      if (typ === 'kapitel') { setze('buchtitel', e['container-title']); setze('herausgeber', cslPersonen(e.editor)); }
      if (typ === 'online') { setze('url', e.URL); setze('webseite', e['container-title']); }
      if (typ === 'bericht') { setze('institution', e.publisher); setze('url', e.URL); }
      setze('seiten', (e.page || '').replace(/-/g, '–'));
      setze('verlag', e.publisher);
      setze('auflage', e.edition);
      setze('doi', e.DOI);
      return { key: (e.id || '').toString().replace(/[^A-Za-z0-9]/g, ''), typ, felder };
    }).filter(q => q.felder.titel);
  }

  /* ---------- Erkennen und einlesen ---------- */

  function erkenne(text, dateiname = '') {
    const anfang = text.slice(0, 4000);
    if (/^\s*[[{]/.test(anfang) && /"(type|id|title)"/.test(anfang)) return 'csl';
    if (/^\s*@\w+\s*\{/m.test(anfang)) return 'bibtex';
    if (/^TY\s+-\s+/m.test(anfang)) return 'ris';
    const endung = dateiname.toLowerCase().split('.').pop();
    return { bib: 'bibtex', bibtex: 'bibtex', ris: 'ris', json: 'csl' }[endung] || '';
  }

  function lies(text, dateiname = '') {
    const art = erkenne(text, dateiname);
    const quellen = art === 'bibtex' ? liesBibtex(text)
                  : art === 'ris' ? liesRis(text)
                  : art === 'csl' ? liesCsl(text) : [];
    return { art, quellen };
  }

  /* Schlüssel vergeben und Doppelte gegen den Bestand abgleichen */
  function einfuegen(dok, neue) {
    const vorhanden = new Set(dok.quellen.map(q => q.key));
    const bekannt = new Set(dok.quellen.map(
      q => (Zitate.nachnamen(q)[0] || '').toLowerCase() + '|' + Zitate.jahr(q) +
           '|' + (q.felder.titel || '').slice(0, 40).toLowerCase()));
    const bericht = { neu: 0, uebersprungen: 0 };

    for (const q of neue) {
      const marke = (Zitate.nachnamen(q)[0] || '').toLowerCase() + '|' +
                    (q.felder.jahr || '') + '|' +
                    (q.felder.titel || '').slice(0, 40).toLowerCase();
      if (bekannt.has(marke)) { bericht.uebersprungen++; continue; }
      bekannt.add(marke);

      let grund = (q.key || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
      if (!grund) {
        const nach = (Zitate.nachnamen(q)[0] || 'quelle').toLowerCase()
          .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue')
          .replace(/ß/g, 'ss').replace(/[^a-z]/g, '') || 'quelle';
        grund = nach + (q.felder.jahr || 'oj');
      }
      let k = grund, i = 1;
      while (vorhanden.has(k)) k = grund + String.fromCharCode(96 + ++i);
      vorhanden.add(k);
      dok.quellen.push({ key: k, typ: q.typ, felder: q.felder });
      bericht.neu++;
    }
    return bericht;
  }

  return { lies, erkenne, einfuegen, liesBibtex, liesRis, liesCsl, saeubere };
})();
