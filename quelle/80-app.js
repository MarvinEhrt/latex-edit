/* ===================================================================
   80-app.js  --  Verdrahtung, Sichern, Übersetzen
   =================================================================== */

const App = (() => {

  let dok = Modell.neu('hausarbeit');
  let projektname = '';
  let letzterStand = null;        // mtime der Projektdatei beim letzten Laden/Sichern
  let konfliktOffen = false;      // Zwei-Fenster-Dialog nur einmal zeigen
  let konfliktVertagt = false;    // weggeklickt: nicht alle vier Sekunden erneut
  let letzteAuswahl = null;
  let bauTimer = null, sicherTimer = null;
  let baeuftGerade = false, nochmalBauen = false;
  let letzteZeilenkarte = [];
  let ungesichert = false;        // seit dem letzten Sichern verändert

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
    Verlauf.merke(dok);                 // fuegeAmCursorEin löst kein beforeinput aus
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
    ungesichert = true;
    if (!optionen.nurBau) aktualisiereKopf();
    aktualisiereWortzahl();
    PdfAnsicht.zustand('wartet', 'Änderung erkannt …');
  }

  /* Steht dauerhaft im Panelkopf der Textspalte. Die Zählung läuft
     über das ganze Dokument, ist aber billig genug für jeden
     Tastendruck. */
  function aktualisiereWortzahl() {
    const marke = document.getElementById('wortzahl');
    if (!marke) return;
    const n = Modell.woerter(dok).gesamt;
    marke.textContent = '· ' +
      String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F') +   // schmales Leerzeichen: 4 230
      (n === 1 ? ' Wort' : ' Wörter');
  }

  /* ---------------- Rückgängig ----------------
     Der Verlauf hält Schnappschüsse des ganzen Dokuments. Nach dem
     Zurücknehmen wird alles neu gezeichnet und die Schreibmarke landet
     wieder dort, wo sie vor der Änderung stand.                       */

  function aktualisiereVerlaufknoepfe() {
    const z = document.getElementById('knopf-zurueck');
    const v = document.getElementById('knopf-vor');
    if (z) z.disabled = !Verlauf.kannZurueck();
    if (v) v.disabled = !Verlauf.kannVor();
  }

  function springe(schritt, leerMeldung) {
    const e = schritt(dok);
    if (!e) { melde(leerMeldung); return; }
    neuZeichnen();
    if (e.ort) Editor.fokussiereAn(e.ort.blockId, e.ort.versatz, e.ort.feld);
    else if (Editor.gewaehlteId()) Editor.waehle(Editor.gewaehlteId());
  }

  const nimmZurueck = () => springe(Verlauf.zurueck, 'Nichts mehr zurückzunehmen.');
  const wiederhole  = () => springe(Verlauf.vor, 'Nichts zum Wiederholen da.');

  /* ---------------- Übersetzen ---------------- */

  async function baue() {
    if (!Begleiter.verbunden) return;
    if (baeuftGerade) { nochmalBauen = true; return; }
    baeuftGerade = true;
    PdfAnsicht.starteUhr();

    try {
      const projekt = Latex.erzeuge(dok);
      letzteZeilenkarte = projekt.zeilenkarte;
      const vorab = Latex.pruefe(dok);

      const ergebnis = await Begleiter.uebersetze(projekt);

      if (ergebnis.status === 'abgebrochen') return;

      /* Warnungen aus einem gescheiterten Lauf sind Lärm über dem echten
         Fehler -- und inhaltlich falsch, weil der Lauf nie bis zur
         Auflösung der Zitate kam. Also nur bei Erfolg zeigen. */
      const warnungen = ergebnis.status === 'ok' ? (ergebnis.warnungen || []) : [];
      PdfAnsicht.zeigeFehler(ergebnis.fehler, letzteZeilenkarte, vorab, warnungen, dok);

      if (ergebnis.status === 'ok') {
        PdfAnsicht.merkeSeite();
        PdfAnsicht.zeige(ergebnis.pdfFassung);
        const hinweise = warnungen.length + vorab.length;
        PdfAnsicht.zustand(hinweise ? 'hinweis' : 'ok',
          `Fertig in ${(ergebnis.dauerMs / 1000).toFixed(1)} s` +
          (hinweise ? ` · ${hinweise} zu prüfen` : ''));
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
      PdfAnsicht.stoppeUhr();
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

  /* Nach Laden oder Anlegen ist das Dokument genau der Stand auf der
     Platte -- der von neuZeichnen angestoßene Sicherungslauf schriebe
     nur dieselben Bytes zurück und legte dafür eine Sicherung an. */
  function giltAlsGesichert() {
    ungesichert = false;
    clearTimeout(sicherTimer);
  }

  async function sichere(still) {
    if (!Begleiter.verbunden) return;
    /* Der Zwei-Fenster-Dialog wurde weggeklickt. Die automatische
       Sicherung liefe sonst in dieselbe 409 und risse den Dialog alle
       vier Sekunden wieder auf. Wer selbst auf Sichern drückt, will es
       jetzt wissen -- dann wird erneut gefragt. */
    if (still && konfliktVertagt) return;
    if (!still) konfliktVertagt = false;
    const name = projektname || dok.meta.titel || 'Unbenannte Arbeit';
    const warNeu = !projektname;
    try {
      /* Der Änderungsstand wandert mit: liegt auf der Platte inzwischen
         ein neuerer (zweites Fenster!), antwortet der Begleiter mit 409
         statt wortlos zu überschreiben. */
      const e = await Begleiter.sichereProjekt(name, dok,
        projektname ? letzterStand : null, warNeu);
      projektname = e.name;
      letzterStand = e.stand;
      ungesichert = false;
      /* Der Name war belegt -- der Begleiter ist ausgewichen, statt die
         fremde Arbeit zu überschreiben. Das muss man erfahren. */
      if (e.ausgewichen)
        melde('Unter „' + name + '“ liegt schon eine Arbeit. Diese hier wurde '
              + 'als „' + e.name + '“ gesichert.', true);
      const marke = document.getElementById('speicherstand');
      if (marke) {
        const jetzt = new Date();
        marke.textContent = 'gesichert ' +
          String(jetzt.getHours()).padStart(2, '0') + ':' +
          String(jetzt.getMinutes()).padStart(2, '0');
      }
      if (!still) melde('Gesichert als „' + e.name + '“.');
    } catch (f) {
      if (f.status === 409) { behandleKonflikt(name); return; }
      melde('Sichern fehlgeschlagen: ' + f.message, true);
    }
  }

  /* Sichtbar bleiben, solange nichts geschrieben wird -- sonst sieht
     die Kopfzeile aus, als sei alles in Ordnung. */
  function zeigeVertagtenKonflikt() {
    const marke = document.getElementById('speicherstand');
    if (marke) marke.textContent = 'nicht gesichert — anderes Fenster';
  }

  /* ---------------- Zwei Fenster ---------------- */

  function konfliktDialog() {
    return new Promise((fertig) => {
      let wahl = null;
      const { koerper, fuss, schliessen } = Dialoge.basis({
        titel: 'In einem anderen Fenster geändert',
        beimSchliessen: () => fertig(wahl)
      });
      koerper.innerHTML = `<div style="font-size:13.5px;line-height:1.55">
        Diese Arbeit wurde in einem anderen Fenster geändert.<br><br>
        <b>Neu laden</b> holt den neueren Stand — was hier seither getippt
        wurde, geht verloren. <b>Trotzdem überschreiben</b> legt wie immer
        erst eine Sicherung des anderen Standes an.</div>`;
      fuss.append(
        Dialoge.knopf('Trotzdem überschreiben', 'knopf-gefahr links',
          () => { wahl = 'ueberschreiben'; schliessen(); }),
        Dialoge.knopf('Neu laden (empfohlen)', 'knopf-haupt',
          () => { wahl = 'laden'; schliessen(); })
      );
    });
  }

  async function behandleKonflikt(name) {
    if (konfliktOffen) return;
    konfliktOffen = true;
    try {
      const wahl = await konfliktDialog();
      if (wahl === 'laden') {
        const e = await Begleiter.ladeProjekt(name);
        dok = Modell.normalisiere(e.dokument);
        projektname = name;
        letzterStand = e.stand;
        Verlauf.leeren();
        neuZeichnen();
        giltAlsGesichert();
        konfliktVertagt = false;
        melde('Neu geladen — der Stand aus dem anderen Fenster.');
      } else if (wahl === 'ueberschreiben') {
        letzterStand = null;
        konfliktVertagt = false;
        await sichere(false);
      } else {
        /* Weggeklickt: weiterschreiben lassen, aber nicht heimlich
           weitersichern -- und das auch zeigen. */
        konfliktVertagt = true;
        zeigeVertagtenKonflikt();
        melde('Nicht gesichert. Über „Sichern“ entscheidest du später.', true);
      }
    } catch (f) {
      melde('Das hat nicht geklappt: ' + f.message, true);
    } finally {
      konfliktOffen = false;
    }
  }

  /* Vor jedem Dokumentwechsel: was noch nicht auf der Platte liegt,
     kommt zuerst dorthin. Fragen wäre der falsche Weg -- vier Sekunden
     später hätte die automatische Sicherung dasselbe getan. Nur ohne
     Begleiter bleibt das Fragen übrig, denn dann geht wirklich etwas
     verloren. */
  async function sichereVorWechsel() {
    if (!ungesichert) return true;
    if (Begleiter.verbunden) { await sichere(true); return !ungesichert; }
    return Dialoge.bestaetigen({
      titel: 'Ungesicherte Änderungen',
      text: 'Ohne Begleiter kann nichts gesichert werden — die Änderungen an '
          + 'dieser Arbeit gehen verloren.',
      okText: 'Trotzdem verwerfen'
    });
  }

  async function oeffne() {
    const wahl = await DialogeExtra.projektOeffnen();
    if (!wahl) return;
    if (wahl.fassung) return stelleFassungHer(wahl.fassung);
    const name = wahl;
    if (!await sichereVorWechsel()) return;
    try {
      const e = await Begleiter.ladeProjekt(name);
      dok = Modell.normalisiere(e.dokument);
      projektname = name;
      letzterStand = e.stand;
      Verlauf.leeren();
      neuZeichnen();
      giltAlsGesichert();
      melde('Geöffnet: ' + (dok.meta.titel || name));
    } catch (f) {
      melde('Konnte nicht geöffnet werden: ' + f.message, true);
    }
  }

  /* ---------------- Frühere Fassung wiederherstellen ---------------- */

  async function stelleFassungHer(f) {
    try {
      /* ERST den aktuellen Stand normal sichern (legt selbst eine
         Sicherung an -- nichts geht verloren), DANN die Fassung laden. */
      await sichere(true);
      const e = await Begleiter.ladeSicherung(f.name, f.datei);
      dok = Modell.normalisiere(e.dokument);
      projektname = f.name;
      /* Die Wiederherstellung ist eine bewusste Entscheidung -- das
         nächste Sichern überschreibt ohne Stand-Prüfung. */
      letzterStand = null;
      Verlauf.leeren();
      neuZeichnen();
      melde('Fassung vom ' + f.zeitText + ' wiederhergestellt.');
    } catch (fehler) {
      melde('Wiederherstellen fehlgeschlagen: ' + fehler.message, true);
    }
  }

  /* ---------------- Beispielarbeit ---------------- */

  /* Die Vorlage liegt beim Programm, nicht in Arbeiten/. Geladen wird
     eine Kopie ohne Projektnamen: das erste Sichern legt eine eigene
     Arbeit an, die Vorlage selbst bleibt unangetastet. */
  async function starteMitBeispiel() {
    try {
      const e = await Begleiter.beispiel();
      dok = Modell.normalisiere(e.dokument);
      projektname = '';
      letzterStand = null;
      Verlauf.leeren();
      neuZeichnen();
      melde('Beispielarbeit geöffnet — schreib ruhig hinein, es ist deine Kopie.');
    } catch (f) {
      melde('Die Beispielarbeit lässt sich nicht laden: ' + f.message, true);
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

  /* Zwei Wege, ein Knopf: "LaTeX ansehen" ist Nachschauen, "ZIP" ist
     Weitergeben -- beides ist Export, also stehen sie zusammen in
     einem kleinen Menü statt einzeln in der Kopfzeile. */
  function zeigeExportMenue() {
    const alt = document.getElementById('exportmenue');
    if (alt) { alt.remove(); return; }
    const anker = document.getElementById('knopf-export');
    const menue = document.createElement('div');
    menue.id = 'exportmenue';
    const eintrag = (text, hinweis, aktion) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<b>${escHtml(text)}</b><span>${escHtml(hinweis)}</span>`;
      b.addEventListener('click', () => { menue.remove(); aktion(); });
      menue.append(b);
    };
    eintrag('LaTeX ansehen', 'nur zum Nachschauen — nichts wird gespeichert',
            () => Dialoge.texAnsehen(dok));
    eintrag('ZIP herunterladen', 'LaTeX-Projekt für Overleaf oder zum Weitergeben',
            exportiere);
    const r = anker.getBoundingClientRect();
    menue.style.top = (r.bottom + 4) + 'px';
    menue.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    document.body.append(menue);
    setTimeout(() => document.addEventListener('click', (ev) => {
      if (!menue.contains(ev.target)) menue.remove();
    }, { once: true }));
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

    k('knopf-zurueck', nimmZurueck);
    k('knopf-vor', wiederhole);

    /* Ein Dialog, der das Dokument selbst umschreibt, braucht seinen
       Schnappschuss VOR dem Öffnen -- danach ist der alte Stand weg.
       Wer abbricht, soll dafür aber keinen leeren Schritt bekommen. */
    const mitVerlauf = async (arbeit) => {
      Verlauf.merke(dok);
      const geaendert = await arbeit();
      if (!geaendert) Verlauf.verwerfeLetzten();
      else neuZeichnen();
      return geaendert;
    };

    k('knopf-neu', async () => {
      const typ = await Dialoge.neuesDokument();
      if (!typ) return;
      if (!await sichereVorWechsel()) return;
      if (typ === 'beispiel') return starteMitBeispiel();
      dok = Modell.neu(typ);
      projektname = '';
      letzterStand = null;
      Verlauf.leeren();
      neuZeichnen();
      /* Noch ist nichts getippt -- eine unberührte Vorlage muss nicht
         als Arbeit auf der Platte landen. Das erste Wort tut es. */
      giltAlsGesichert();
      mitVerlauf(() => Dialoge.deckblatt(dok));
    });
    k('knopf-deckblatt', () => mitVerlauf(() => Dialoge.deckblatt(dok)));
    k('knopf-layout', () => mitVerlauf(async () => {
      const e = await Dialoge.layout(dok);
      if (e) dok.einstellungen = e;
      return !!e;
    }));
    k('knopf-quellen', () => mitVerlauf(async () => {
      const vorher = JSON.stringify(dok.quellen);
      await Dialoge.quellenverwaltung(dok);
      return JSON.stringify(dok.quellen) !== vorher;
    }));
    k('knopf-einstellungen', () => DialogeExtra.einstellungen());
    k('knopf-hilfe', () => Dialoge.hilfe());
    k('knopf-sichern', () => sichere(false));
    k('knopf-oeffnen', oeffne);
    k('knopf-export', zeigeExportMenue);
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
      /* Die Browsersuche fände nur, was gerade im DOM steht -- unsere
         durchsucht das Modell, samt Tabellen und Beschriftungen. */
      if (strg && ev.key.toLowerCase() === 'f') { ev.preventDefault(); Suche.oeffne(false); }
      if (strg && ev.key.toLowerCase() === 'h') { ev.preventDefault(); Suche.oeffne(true); }
      if (ev.key === 'Escape' && Suche.offen() &&
          !document.querySelector('.schleier')) { Suche.schliesse(); }
      if (strg && ev.key === 'Enter') { ev.preventDefault(); clearTimeout(bauTimer); baue(); }
      /* Der Browser hat für jedes Textfeld einen eigenen Rückgängig-Stapel,
         der von Baustein zu Baustein springt und Strukturänderungen nicht
         kennt. Deshalb übernimmt der Schreibtisch die Taste ganz. */
      const t = ev.key.toLowerCase();
      if (strg && t === 'z' && !ev.shiftKey) { ev.preventDefault(); nimmZurueck(); }
      else if (strg && (t === 'y' || (t === 'z' && ev.shiftKey))) {
        ev.preventDefault(); wiederhole();
      }
    });
  }

  /* Vier Sekunden ungesicherter Text sind wenig -- und trotzdem der
     halbe Absatz, an dem gerade gearbeitet wird. Eine eigene Meldung
     erlauben die Browser hier längst nicht mehr; dass überhaupt
     gefragt wird, ist der ganze Zweck. */
  window.addEventListener('beforeunload', (ev) => {
    if (!ungesichert) return;
    ev.preventDefault();
    ev.returnValue = '';
  });

  async function start() {
    try {
      const thema = localStorage.getItem('schreibtisch-thema');
      if (thema) document.documentElement.dataset.theme = thema;
    } catch {}

    verdrahteKopf();
    Verlauf.beiAenderung(aktualisiereVerlaufknoepfe);
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
      /* Kein Dialog. Wer LaTeX noch nicht hat, ist gerade zum ersten
         Mal hier -- ein Fenster, das man erst wegklicken muss, bevor
         man das Programm überhaupt sieht, ist der falsche Empfang.
         Der Hinweis bleibt stattdessen dort stehen, wo später das PDF
         erscheint, und führt von dort weiter. */
      if (!w.vollstaendig) {
        melde('pdflatex oder biber fehlt — Schreiben geht, Drucken nicht.', true);
        const leer = document.getElementById('pdfleer');
        if (leer) {
          leer.innerHTML = `<div style="max-width:340px;text-align:center">
             <div style="font-size:26px;margin-bottom:10px">⚠</div>
             <b>Hier fehlt noch LaTeX.</b>
             <p style="color:var(--tinte-2);line-height:1.5">Schreiben kannst du
             sofort — gesetzt wird die Arbeit erst, wenn <b>pdflatex</b> und
             <b>biber</b> installiert sind. Die Kurzanleitung sagt, wie.</p></div>`;
          const knopf = document.createElement('button');
          knopf.type = 'button';
          knopf.className = 'knopf knopf-haupt';
          knopf.textContent = 'Nachsehen, was fehlt';
          knopf.addEventListener('click', () => DialogeExtra.einstellungen());
          leer.firstElementChild.append(knopf);
        }
      }
    } catch { /* Begleiter meldet sich nicht -- die Meldung kommt beim Bauen */ }

    /* Zuletzt bearbeitete Arbeit fortsetzen */
    let fortgesetzt = false;
    try {
      const liste = (await Begleiter.projekte()).projekte;
      if (liste.length) {
        const e = await Begleiter.ladeProjekt(liste[0].name);
        dok = Modell.normalisiere(e.dokument);
        projektname = liste[0].name;
        letzterStand = e.stand;
        Verlauf.leeren();
        fortgesetzt = true;
        melde('Fortgesetzt: ' + (dok.meta.titel || liste[0].name));
      }
    } catch { /* nichts da, also frisches Dokument */ }

    neuZeichnen();
    if (fortgesetzt) giltAlsGesichert();

    /* Erst ganz am Ende und nur beim allerersten Start. Früher lief
       hier ein setTimeout gegen ein zweites -- Kurzanleitung und
       Einstellungen legten ihre Schleier übereinander, und der Knopf
       der Kurzanleitung war nicht mehr erreichbar. */
    if (!fortgesetzt) await Dialoge.hilfe();
  }

  return {
    get dok() { return dok; },
    set dok(d) { dok = d; },
    start, aenderung, melde, sichere, exportiere, baue,
    nimmZurueck, wiederhole,
    zitatEinfuegen, verweisEinfuegen, kennwertEinfuegen, fussnoteEinfuegen
  };
})();

document.addEventListener('DOMContentLoaded', App.start);
