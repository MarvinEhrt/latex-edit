/* ===================================================================
   80-app.js  --  Verdrahtung, Sichern, Übersetzen
   =================================================================== */

const App = (() => {

  let dok = Modell.neu('hausarbeit');
  let projektname = '';
  let letzteAuswahl = null;
  let bauTimer = null, sicherTimer = null;
  let baeuftGerade = false, nochmalBauen = false;
  let letzteZeilenkarte = [];
  let werkzeugeVollstaendig = true;

  const VERZOEGERUNG = 2000;      // Millisekunden nach der letzten Eingabe

  /* ---------------- Meldungen ---------------- */

  function melde(text, fehler) {
    const kasten = document.getElementById('meldungen');
    const m = document.createElement('div');
    m.className = 'meldung' + (fehler ? ' fehler' : '');
    m.textContent = text;
    kasten.append(m);
    setTimeout(() => m.remove(), fehler ? 6000 : 2800);
  }

  /* ---------------- Auswahl merken ----------------
     Ein Dialog nimmt dem Textfeld den Fokus. Damit ein Zitat trotzdem
     an der richtigen Stelle landet, wird die Schreibmarke vorher
     gemerkt und danach wiederhergestellt.                            */

  document.addEventListener('selectionchange', () => {
    const auswahl = window.getSelection();
    if (!auswahl || !auswahl.rangeCount) return;
    const bereich = auswahl.getRangeAt(0);
    const knoten = bereich.startContainer;
    const feld = (knoten.nodeType === 1 ? knoten : knoten.parentElement)?.closest?.('.tx');
    if (feld) letzteAuswahl = bereich.cloneRange();
  });

  function stelleAuswahlHer() {
    if (!letzteAuswahl) return false;
    const start = letzteAuswahl.startContainer;
    const feld = (start.nodeType === 1 ? start : start.parentElement)?.closest?.('.tx');
    if (!feld || !document.contains(feld)) return false;
    feld.focus();
    const auswahl = window.getSelection();
    auswahl.removeAllRanges();
    auswahl.addRange(letzteAuswahl);
    return true;
  }

  async function einfuegenMitDialog(dialogFn) {
    if (!stelleAuswahlHer()) {
      melde('Klick zuerst in den Text, an die Stelle, wo es hin soll.', true);
      return;
    }
    const run = await dialogFn();
    if (!run) return;
    if (!stelleAuswahlHer()) { melde('Die Textstelle ist nicht mehr da.', true); return; }
    Editor.fuegeAmCursorEin(Editor.chipHtml(run));
    aenderung();
  }

  const zitatEinfuegen    = () => einfuegenMitDialog(() => Dialoge.zitatEinfuegen(dok));
  const verweisEinfuegen  = () => einfuegenMitDialog(() => Dialoge.verweisEinfuegen(dok));
  const kennwertEinfuegen = () => einfuegenMitDialog(() => Dialoge.kennwert());
  const fussnoteEinfuegen = () => einfuegenMitDialog(async () => {
    const t = await Dialoge.fussnote();
    return t ? { fussnote: t } : null;
  });

  /* ---------------- Änderungen ---------------- */

  function aenderung(optionen = {}) {
    clearTimeout(bauTimer);
    bauTimer = setTimeout(baue, VERZOEGERUNG);
    clearTimeout(sicherTimer);
    sicherTimer = setTimeout(() => sichere(true), 4000);
    if (!optionen.nurBau) aktualisiereKopf();
    PdfAnsicht.zustand('wartet', 'Änderung erkannt …');
  }

  /* ---------------- Übersetzen ---------------- */

  async function baue() {
    if (!Begleiter.verbunden) return;
    if (baeuftGerade) { nochmalBauen = true; return; }
    baeuftGerade = true;
    PdfAnsicht.zustand('laeuft', 'PDF wird gebaut …');

    try {
      const projekt = Latex.erzeuge(dok);
      letzteZeilenkarte = projekt.zeilenkarte;
      const vorab = Latex.pruefe(dok);

      const ergebnis = await Begleiter.uebersetze(projekt);

      if (ergebnis.status === 'abgebrochen') return;

      PdfAnsicht.zeigeFehler(ergebnis.fehler, letzteZeilenkarte, vorab);

      if (ergebnis.status === 'ok') {
        PdfAnsicht.merkeSeite();
        PdfAnsicht.zeige(ergebnis.pdfFassung);
        PdfAnsicht.zustand('ok',
          `Fertig in ${(ergebnis.dauerMs / 1000).toFixed(1)} s` +
          (vorab.length ? ` · ${vorab.length} Hinweis${vorab.length > 1 ? 'e' : ''}` : ''));
      } else if (ergebnis.status === 'kein_latex') {
        PdfAnsicht.zustand('fehler', 'pdflatex fehlt');
      } else {
        const n = (ergebnis.fehler || []).length;
        PdfAnsicht.zustand('fehler',
          `${n} Fehler — das letzte gültige PDF bleibt stehen`);
      }
    } catch (f) {
      PdfAnsicht.zustand('fehler', 'Begleiter antwortet nicht');
      melde('Der lokale Begleiter antwortet nicht: ' + f.message, true);
    } finally {
      baeuftGerade = false;
      if (nochmalBauen) { nochmalBauen = false; baue(); }
    }
  }

  /* ---------------- Sichern und Öffnen ---------------- */

  function aktualisiereKopf() {
    const t = document.getElementById('kopf-titel');
    if (!t) return;
    const art = (Modell.ARBEITSTYPEN[dok.meta.arbeitstyp] || {}).name || '';
    t.innerHTML = `<b>${escHtml(dok.meta.titel || 'Ohne Titel')}</b> · ${escHtml(art)}`;
  }

  async function sichere(still) {
    if (!Begleiter.verbunden) return;
    const name = projektname || dok.meta.titel || 'Unbenannte Arbeit';
    try {
      const e = await Begleiter.sichereProjekt(name, dok);
      projektname = e.name;
      const marke = document.getElementById('speicherstand');
      if (marke) {
        const jetzt = new Date();
        marke.textContent = 'gesichert ' +
          String(jetzt.getHours()).padStart(2, '0') + ':' +
          String(jetzt.getMinutes()).padStart(2, '0');
      }
      if (!still) melde('Gesichert als „' + e.name + '“.');
    } catch (f) {
      melde('Sichern fehlgeschlagen: ' + f.message, true);
    }
  }

  async function oeffne() {
    const name = await DialogeExtra.projektOeffnen();
    if (!name) return;
    try {
      const e = await Begleiter.ladeProjekt(name);
      dok = Modell.normalisiere(e.dokument);
      projektname = name;
      neuZeichnen();
      melde('Geöffnet: ' + (dok.meta.titel || name));
    } catch (f) {
      melde('Konnte nicht geöffnet werden: ' + f.message, true);
    }
  }

  /* ---------------- Export ---------------- */

  function ladeHerunter(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  const dateiname = (endung) => {
    const roh = (dok.meta.titel || 'Arbeit').toLowerCase()
      .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue')
      .replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return (roh || 'arbeit').slice(0, 60) + endung;
  };

  function exportiere() {
    try {
      const projekt = Latex.erzeuge(dok);
      const eintraege = Object.entries(projekt.dateien)
        .map(([name, inhalt]) => ({ name, daten: inhalt }));
      for (const bild of projekt.bilder)
        eintraege.push({ name: 'abbildungen/' + bild.datei,
                         daten: Zip.base64ZuBytes(bild.datenUrl.split(',')[1]) });
      eintraege.push({ name: 'arbeit.json', daten: JSON.stringify(dok, null, 2) });
      ladeHerunter(Zip.erzeuge(eintraege, new Date()), dateiname('-latex.zip'));
      melde('ZIP heruntergeladen — für Overleaf oder zum Weitergeben.');
    } catch (f) {
      melde('Der Export ist fehlgeschlagen: ' + f.message, true);
    }
  }

  /* ---------------- Aufbau ---------------- */

  function neuZeichnen() {
    Editor.zeichne();
    Editor.zeichneGliederung();
    aktualisiereKopf();
    aenderung();
  }

  function verdrahteKopf() {
    const k = (id, aktion) => document.getElementById(id)?.addEventListener('click', aktion);

    k('knopf-neu', async () => {
      const typ = await Dialoge.neuesDokument();
      if (!typ) return;
      dok = Modell.neu(typ);
      projektname = '';
      neuZeichnen();
      Dialoge.deckblatt(dok).then(g => { if (g) neuZeichnen(); });
    });
    k('knopf-deckblatt', async () => { if (await Dialoge.deckblatt(dok)) neuZeichnen(); });
    k('knopf-layout', async () => {
      const e = await Dialoge.layout(dok);
      if (e) { dok.einstellungen = e; neuZeichnen(); }
    });
    k('knopf-quellen', async () => { await Dialoge.quellenverwaltung(dok); neuZeichnen(); });
    k('knopf-zotero', async () => {
      const b = await DialogeExtra.zoteroImport(dok);
      if (b) { melde(`${b.neu} übernommen, ${b.uebersprungen} schon vorhanden.`); neuZeichnen(); }
    });
    k('knopf-import', async () => {
      const b = await DialogeExtra.dateiImport(dok);
      if (b) { melde(`${b.neu} übernommen, ${b.uebersprungen} schon vorhanden.`); neuZeichnen(); }
    });
    k('knopf-einstellungen', () => DialogeExtra.einstellungen());
    k('knopf-tex', () => Dialoge.texAnsehen(dok));
    k('knopf-hilfe', () => Dialoge.hilfe());
    k('knopf-sichern', () => sichere(false));
    k('knopf-oeffnen', oeffne);
    k('knopf-export', exportiere);
    k('knopf-bauen', () => { clearTimeout(bauTimer); baue(); });

    k('knopf-thema', () => {
      const wurzel = document.documentElement;
      const dunkel = wurzel.dataset.theme
        ? wurzel.dataset.theme === 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches;
      wurzel.dataset.theme = dunkel ? 'light' : 'dark';
      try { localStorage.setItem('schreibtisch-thema', wurzel.dataset.theme); } catch {}
    });

    /* Ansichtsumschaltung nur auf den Knöpfen -- das Attribut tragen
       auch die Spalten, ein ungenauer Selektor würde sie einfärben. */
    const wahlknoepfe = document.querySelectorAll('.ansichtswahl [data-ansicht]');
    wahlknoepfe.forEach(b => b.addEventListener('click', () => {
      const ziel = b.dataset.ansicht;
      document.querySelectorAll('.raum > .spalte').forEach(s =>
        s.classList.toggle('sichtbar', s.dataset.ansicht === ziel));
      wahlknoepfe.forEach(x => x.classList.toggle('knopf-haupt', x === b));
    }));

    document.addEventListener('keydown', (ev) => {
      const strg = ev.ctrlKey || ev.metaKey;
      if (strg && ev.key.toLowerCase() === 's') { ev.preventDefault(); sichere(false); }
      if (strg && ev.key === 'Enter') { ev.preventDefault(); clearTimeout(bauTimer); baue(); }
    });
  }

  async function start() {
    try {
      const thema = localStorage.getItem('schreibtisch-thema');
      if (thema) document.documentElement.dataset.theme = thema;
    } catch {}

    verdrahteKopf();
    Editor.baueEinfuegeleiste();

    if (!Begleiter.verbunden) {
      document.getElementById('pdfleer').innerHTML =
        `<div style="max-width:340px;text-align:center">
           <div style="font-size:26px;margin-bottom:10px">⚠</div>
           <b>Diese Seite wurde direkt geöffnet.</b>
           <p style="color:var(--tinte-2);line-height:1.5">Der Schreibtisch braucht
           seinen Begleiter, um LaTeX aufzurufen. Schließe das Fenster und starte
           stattdessen <b>start.sh</b> (Linux) oder <b>start.bat</b> (Windows).</p>
         </div>`;
      PdfAnsicht.zustand('fehler', 'ohne Begleiter gestartet');
      Editor.zeichne();
      Editor.zeichneGliederung();
      return;
    }

    try {
      const w = await Begleiter.pruefung();
      werkzeugeVollstaendig = w.vollstaendig;
      if (!w.vollstaendig) {
        melde('pdflatex oder biber fehlt — Schreiben geht, Drucken nicht.', true);
        setTimeout(() => DialogeExtra.einstellungen(), 600);
      }
    } catch { /* Begleiter meldet sich nicht -- die Meldung kommt beim Bauen */ }

    /* Zuletzt bearbeitete Arbeit fortsetzen */
    try {
      const liste = (await Begleiter.projekte()).projekte;
      if (liste.length) {
        const e = await Begleiter.ladeProjekt(liste[0].name);
        dok = Modell.normalisiere(e.dokument);
        projektname = liste[0].name;
        melde('Fortgesetzt: ' + (dok.meta.titel || liste[0].name));
      } else {
        setTimeout(() => Dialoge.hilfe(), 400);
      }
    } catch { /* nichts da, also frisches Dokument */ }

    neuZeichnen();
  }

  return {
    get dok() { return dok; },
    set dok(d) { dok = d; },
    start, aenderung, melde, sichere, exportiere, baue,
    zitatEinfuegen, verweisEinfuegen, kennwertEinfuegen, fussnoteEinfuegen
  };
})();

document.addEventListener('DOMContentLoaded', App.start);
