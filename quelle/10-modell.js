/* ===================================================================
   10-modell.js  --  Das Dokumentmodell
   -------------------------------------------------------------------
   Alles, was der Editor anzeigt, exportiert oder speichert, kommt aus
   EINEM JSON-Objekt. Kein HTML als Datenspeicher, nirgends.
   =================================================================== */

const Modell = (() => {

  let zaehler = 0;
  const neueId = () => `b${Date.now().toString(36)}${(zaehler++).toString(36)}`;

  /* ---------------- Arbeitstypen ---------------- */

  const ARBEITSTYPEN = {
    hausarbeit: {
      name: 'Hausarbeit',
      hinweis: 'Empirische Seminararbeit, meist 10–20 Seiten.',
      einstellungen: { abbildungsverzeichnis: false, tabellenverzeichnis: false,
                       eidesstattlich: false, abstract: false }
    },
    bachelorarbeit: {
      name: 'Bachelorarbeit',
      hinweis: 'Mit Abstract, Verzeichnissen und eidesstattlicher Erklärung.',
      einstellungen: { abbildungsverzeichnis: true, tabellenverzeichnis: true,
                       eidesstattlich: true, abstract: true }
    },
    masterarbeit: {
      name: 'Masterarbeit',
      hinweis: 'Wie Bachelorarbeit, mit Abkürzungsverzeichnis.',
      einstellungen: { abbildungsverzeichnis: true, tabellenverzeichnis: true,
                       abkuerzungsverzeichnis: true, eidesstattlich: true,
                       abstract: true }
    },
    dissertation: {
      name: 'Dissertation',
      hinweis: 'Mit Danksagung, deutscher und englischer Zusammenfassung.',
      einstellungen: { abbildungsverzeichnis: true, tabellenverzeichnis: true,
                       abkuerzungsverzeichnis: true, eidesstattlich: true,
                       abstract: true }
    },
    gutachten: {
      name: 'Psychologisches Gutachten',
      hinweis: 'Aufbau nach Westhoff & Kluck: Fragestellung bis Anhang.',
      einstellungen: { abbildungsverzeichnis: false, tabellenverzeichnis: false,
                       eidesstattlich: false, abstract: false }
    }
  };

  /* ---------------- Quelltypen ----------------
     Die Feldlisten steuern direkt den Quellen-Dialog.               */

  const QUELLTYPEN = {
    buch: {
      name: 'Buch',
      bibtex: 'book',
      felder: [
        { n: 'autoren',   l: 'Autor:innen', pflicht: true,
          h: 'Nachname, Vorname — mehrere mit Semikolon trennen' },
        { n: 'jahr',      l: 'Jahr', pflicht: true, kurz: true },
        { n: 'titel',     l: 'Titel', pflicht: true },
        { n: 'auflage',   l: 'Auflage', kurz: true, h: 'z. B. 6 oder „6., überarb. Aufl."' },
        { n: 'verlag',    l: 'Verlag', pflicht: true },
        { n: 'doi',       l: 'DOI', kurz: true }
      ]
    },
    artikel: {
      name: 'Zeitschriftenartikel',
      bibtex: 'article',
      felder: [
        { n: 'autoren',     l: 'Autor:innen', pflicht: true,
          h: 'Nachname, Vorname — mehrere mit Semikolon trennen' },
        { n: 'jahr',        l: 'Jahr', pflicht: true, kurz: true },
        { n: 'titel',       l: 'Titel des Aufsatzes', pflicht: true },
        { n: 'zeitschrift', l: 'Zeitschrift', pflicht: true },
        { n: 'jahrgang',    l: 'Jahrgang (Volume)', kurz: true },
        { n: 'heft',        l: 'Heft (Issue)', kurz: true },
        { n: 'seiten',      l: 'Seiten', kurz: true, h: 'z. B. 113–127' },
        { n: 'doi',         l: 'DOI', kurz: true }
      ]
    },
    kapitel: {
      name: 'Kapitel im Sammelband',
      bibtex: 'incollection',
      felder: [
        { n: 'autoren',     l: 'Autor:innen des Kapitels', pflicht: true },
        { n: 'jahr',        l: 'Jahr', pflicht: true, kurz: true },
        { n: 'titel',       l: 'Titel des Kapitels', pflicht: true },
        { n: 'herausgeber', l: 'Herausgeber:innen', pflicht: true },
        { n: 'buchtitel',   l: 'Titel des Sammelbandes', pflicht: true },
        { n: 'auflage',     l: 'Auflage', kurz: true },
        { n: 'seiten',      l: 'Seiten', kurz: true, h: 'z. B. 114–158' },
        { n: 'verlag',      l: 'Verlag', pflicht: true }
      ]
    },
    online: {
      name: 'Internetquelle',
      bibtex: 'online',
      felder: [
        { n: 'autoren',   l: 'Autor:in / Organisation', pflicht: true,
          h: 'Bei Organisationen den vollen Namen eintragen' },
        { n: 'jahr',      l: 'Jahr', pflicht: true, kurz: true },
        { n: 'titel',     l: 'Titel der Seite', pflicht: true },
        { n: 'webseite',  l: 'Name der Webseite' },
        { n: 'url',       l: 'URL', pflicht: true },
        { n: 'abgerufen', l: 'Abgerufen am', kurz: true, h: 'JJJJ-MM-TT' }
      ]
    },
    testverfahren: {
      name: 'Testverfahren',
      bibtex: 'book',
      felder: [
        { n: 'autoren',  l: 'Autor:innen', pflicht: true },
        { n: 'jahr',     l: 'Jahr', pflicht: true, kurz: true },
        { n: 'titel',    l: 'Name des Verfahrens', pflicht: true,
          h: 'z. B. Allgemeiner Interessen-Struktur-Test (AIST-R)' },
        { n: 'auflage',  l: 'Auflage / Revision', kurz: true },
        { n: 'verlag',   l: 'Testverlag', pflicht: true }
      ]
    },
    bericht: {
      name: 'Bericht / Graue Literatur',
      bibtex: 'report',
      felder: [
        { n: 'autoren',    l: 'Autor:in / Institution', pflicht: true },
        { n: 'jahr',       l: 'Jahr', pflicht: true, kurz: true },
        { n: 'titel',      l: 'Titel', pflicht: true },
        { n: 'institution',l: 'Herausgebende Institution' },
        { n: 'nummer',     l: 'Berichtsnummer', kurz: true },
        { n: 'url',        l: 'URL' }
      ]
    }
  };

  /* ---------------- Blockbaukasten ---------------- */

  const BLOCKTYPEN = {
    ueberschrift:  { name: 'Überschrift',    icon: 'H' },
    absatz:        { name: 'Absatz',         icon: '¶' },
    liste:         { name: 'Liste',          icon: '•' },
    blockzitat:    { name: 'Blockzitat',     icon: '❝' },
    tabelle:       { name: 'Tabelle',        icon: '▦' },
    abbildung:     { name: 'Abbildung',      icon: '🖼' },
    diagramm:      { name: 'Diagramm',       icon: '📊' },
    formel:        { name: 'Formel',         icon: '∑' },
    seitenumbruch: { name: 'Seitenumbruch',  icon: '⤓' },
    anhangstart:   { name: 'Anhang beginnt', icon: '§' }
  };

  const neuerBlock = (typ, daten = {}) => {
    const grund = { id: neueId(), typ };
    switch (typ) {
      case 'ueberschrift':  return { ...grund, ebene: 1, text: '', ...daten };
      case 'absatz':        return { ...grund, runs: [], ...daten };
      case 'blockzitat':    return { ...grund, runs: [], quelle: '', seite: '', ...daten };
      case 'liste':         return { ...grund, ordnung: 'punkte', punkte: [[]], ...daten };
      case 'tabelle':       return { ...grund, titel: '', anmerkung: '',
                                     kopf: ['', '', ''],
                                     zeilen: [['', '', ''], ['', '', '']],
                                     spaltenAusrichtung: ['l', 'c', 'c'], ...daten };
      case 'abbildung':     return { ...grund, titel: '', anmerkung: '', datenUrl: '',
                                     dateiname: '', breite: 80, ...daten };
      case 'diagramm':      return { ...grund, art: 'balken', titel: '', anmerkung: '',
                                     quelle: 'eigen', tabelleId: '',
                                     daten: { kopf: ['Gruppe', 'Mittelwert', 'SD'],
                                              zeilen: [['A', '3,4', '0,8'],
                                                       ['B', '4,1', '0,9']] },
                                     xSpalte: 0, wertSpalten: [1], fehlerSpalte: null,
                                     fehlerArt: 'sd', achseX: '', achseY: '',
                                     graustufen: false, regression: true,
                                     breite: 85, hoehe: 6.4, ...daten };
      case 'formel':        return { ...grund, tex: '', ...daten };
      default:              return { ...grund, ...daten };
    }
  };

  /* ---------------- Kurzschreibweisen für Vorlagen ---------------- */

  const H  = (ebene, text) => neuerBlock('ueberschrift', { ebene, text });
  const P  = (text = '')   => neuerBlock('absatz', { runs: text ? [{ text }] : [] });
  /* PH = leerer Absatz mit Schreibhilfe. Der Hinweis steht NICHT im
     Inhalt, sondern nur als grauer Text im leeren Feld -- sonst tippt
     man versehentlich mitten in die Anleitung hinein und sie landet
     im fertigen PDF.                                                 */
  const PH = (hinweis)     => neuerBlock('absatz', { runs: [], hinweis });

  /* ---------------- Gliederungsvorlagen ---------------- */

  const GERUESTE = {

    hausarbeit: () => [
      H(1, 'Einleitung'),
      PH('Hinführung zum Thema, Relevanz, Ziel der Arbeit. Zum Schluss ein Satz, ' +
         'der die Fragestellung ankündigt.'),

      H(1, 'Theoretischer Hintergrund'),
      H(2, 'Forschungsstand'),
      PH('Was ist zu diesem Thema bereits bekannt? Hier wird zitiert.'),
      H(2, 'Fragestellung und Hypothesen'),
      PH('Die Fragestellung ausformulieren und daraus die Hypothesen ableiten.'),

      H(1, 'Methode'),
      H(2, 'Stichprobe'),
      PH('Wer wurde untersucht? Anzahl, Alter, Geschlecht, Rekrutierung.'),
      H(2, 'Erhebungsinstrumente'),
      PH('Welche Verfahren wurden eingesetzt? Mit Gütekriterien und Quelle.'),
      H(2, 'Durchführung'),
      PH('Wie lief die Erhebung ab? Ort, Zeit, Reihenfolge, Ethik.'),
      H(2, 'Auswertungsstrategie'),
      PH('Welche Verfahren wurden zur Auswertung genutzt? Software, Signifikanzniveau.'),

      H(1, 'Ergebnisse'),
      PH('Zuerst deskriptiv, dann die Hypothesenprüfung. Keine Interpretation — ' +
         'die kommt in der Diskussion.'),

      H(1, 'Diskussion'),
      H(2, 'Interpretation der Befunde'),
      PH('Was bedeuten die Ergebnisse mit Blick auf die Fragestellung?'),
      H(2, 'Limitationen'),
      PH('Was schränkt die Aussagekraft ein?'),
      H(2, 'Fazit und Ausblick'),
      PH('Antwort auf die Fragestellung und was daraus folgt.')
    ],

    bachelorarbeit: () => [
      H(1, 'Einleitung'),
      PH('Hinführung, Relevanz, Aufbau der Arbeit.'),

      H(1, 'Theoretischer Hintergrund'),
      H(2, 'Begriffsbestimmung'),
      PH('Die zentralen Konstrukte definieren.'),
      H(2, 'Forschungsstand'),
      PH('Bisherige Befunde, geordnet nach Themen — nicht nach Studien.'),
      H(2, 'Forschungslücke'),
      PH('Was fehlt in der bisherigen Literatur?'),
      H(2, 'Fragestellung und Hypothesen'),
      PH('Fragestellung und daraus abgeleitete, prüfbare Hypothesen.'),

      H(1, 'Methode'),
      H(2, 'Studiendesign'),
      PH('Querschnitt, Längsschnitt, experimentell? Unabhängige und abhängige Variablen.'),
      H(2, 'Stichprobe'),
      PH('Rekrutierung, Ein- und Ausschlusskriterien, Stichprobenbeschreibung, ' +
         'Poweranalyse.'),
      H(2, 'Erhebungsinstrumente'),
      PH('Jedes Instrument mit Quelle, Itemanzahl, Antwortformat und Reliabilität.'),
      H(2, 'Durchführung'),
      PH('Ablauf der Erhebung, Ethikvotum, Datenschutz.'),
      H(2, 'Statistische Auswertung'),
      PH('Auswertungsverfahren, Voraussetzungsprüfungen, Software, Signifikanzniveau.'),

      H(1, 'Ergebnisse'),
      H(2, 'Deskriptive Statistik'),
      PH('Mittelwerte, Streuungen, Interkorrelationen — meist als Tabelle.'),
      H(2, 'Hypothesenprüfung'),
      PH('Pro Hypothese ein Absatz: Verfahren, Kennwert, Signifikanz, Effektstärke.'),

      H(1, 'Diskussion'),
      H(2, 'Zusammenfassung der Befunde'),
      PH('Die Ergebnisse in wenigen Sätzen, ohne Zahlen.'),
      H(2, 'Einordnung in den Forschungsstand'),
      PH('Passen die Befunde zur bisherigen Literatur? Wenn nicht: warum?'),
      H(2, 'Limitationen'),
      PH('Stichprobe, Design, Messinstrumente, Generalisierbarkeit.'),
      H(2, 'Implikationen und Ausblick'),
      PH('Was folgt daraus für Forschung und Praxis?'),
      H(2, 'Fazit'),
      PH('Die Antwort auf die Fragestellung, in drei bis fünf Sätzen.')
    ],

    dissertation: () => [
      H(1, 'Einleitung'),
      PH('Problemaufriss, Relevanz, Zielsetzung und Aufbau der Arbeit.'),

      H(1, 'Theoretischer Hintergrund'),
      H(2, 'Begriffliche Grundlagen'),
      PH(''),
      H(2, 'Theoretische Modelle'),
      PH(''),
      H(2, 'Empirischer Forschungsstand'),
      PH(''),
      H(2, 'Ableitung der Fragestellung'),
      PH(''),

      H(1, 'Studie 1'),
      H(2, 'Fragestellung und Hypothesen'), PH(''),
      H(2, 'Methode'),                      PH(''),
      H(2, 'Ergebnisse'),                   PH(''),
      H(2, 'Diskussion Studie 1'),          PH(''),

      H(1, 'Studie 2'),
      H(2, 'Fragestellung und Hypothesen'), PH(''),
      H(2, 'Methode'),                      PH(''),
      H(2, 'Ergebnisse'),                   PH(''),
      H(2, 'Diskussion Studie 2'),          PH(''),

      H(1, 'Gesamtdiskussion'),
      H(2, 'Integration der Befunde'), PH(''),
      H(2, 'Theoretische Implikationen'), PH(''),
      H(2, 'Praktische Implikationen'), PH(''),
      H(2, 'Limitationen'), PH(''),
      H(2, 'Ausblick'), PH('')
    ],

    gutachten: () => [
      H(1, 'Untersuchungsanlass und Fragestellung'),
      PH('Wer hat den Auftrag erteilt, mit welchem Anliegen? Die Fragestellung ' +
         'wörtlich so, wie sie vereinbart wurde.'),

      H(1, 'Vorliegende Informationen (Anknüpfungstatsachen)'),
      PH('Nur Fakten, die vor der Untersuchung feststanden. Keine Bewertung.'),

      H(1, 'Psychologische Fragen (Hypothesen)'),
      H(2, 'Motivationale Bedingungen'),
      PH(''),
      H(2, 'Soziale und emotionale Bedingungen'),
      PH(''),
      H(2, 'Umgebungsvariablen und Rahmenbedingungen'),
      PH(''),

      H(1, 'Untersuchungsplan und -ablauf'),
      H(2, 'Auswahl der Verfahren'),
      PH('Jedes Verfahren mit Begründung und Zuordnung zur psychologischen Frage — ' +
         'am besten als Tabelle.'),
      H(2, 'Durchführung der Untersuchung'),
      PH('Ort, Termin, Dauer, Aufklärung, Verhaltensbeobachtung.'),

      H(1, 'Ergebnisse'),
      PH('Pro Verfahren ein Unterkapitel. Rohbefunde ohne Deutung.'),

      H(1, 'Psychologischer Befund'),
      H(2, 'Beantwortung der psychologischen Fragen'),
      PH('Pro Frage: erst der Befund, dann die Interpretation.'),
      H(2, 'Diskussion von Widersprüchen'),
      PH('Widersprüche zwischen Verfahren offenlegen und auflösen.'),

      H(1, 'Zusammenfassung'),
      PH('Fragestellung, zentrale Befunde, Empfehlungen.')
    ]
  };

  GERUESTE.masterarbeit = GERUESTE.bachelorarbeit;

  /* ---------------- Standardeinstellungen ---------------- */

  const STANDARD_EINSTELLUNGEN = {
    sprache: 'de',                 // Sprache der ARBEIT, nicht der Oberfläche
    schrift: 'times',
    schriftgroesse: 12,
    zeilenabstand: 1.5,
    ausrichtung: 'blocksatz',
    absatzEinzug: true,
    seitenzahlPosition: 'unten',
    seitenzahlStil: 'roemisch-arabisch',
    deckblatt: true,
    inhaltsverzeichnis: true,
    abbildungsverzeichnis: false,
    tabellenverzeichnis: false,
    abkuerzungsverzeichnis: false,
    abstract: false,
    eidesstattlich: false,
    anhang: false
  };

  const STANDARD_META = {
    arbeitstyp: 'hausarbeit',
    titel: '', untertitel: '',
    verfasser: '', matrikelnummer: '', studiengang: '', semester: '', email: '',
    hochschule: '', fachbereich: '', institut: '',
    modul: '', betreuung: '', zweitgutachten: '',
    ort: '', abgabedatum: '',
    /* Inhalt der Vorspannseiten. Stand früher fest verdrahtet in der
       Stildatei -- dort war er unerreichbar und obendrein falsch. */
    abstract: '',
    schlagwoerter: '',        // APA 7: "Schlüsselwörter: a, b, c" unter dem Abstract
    abkuerzungen: []          // [{kurz, lang}]
  };

  /* ---------------- Dokument erzeugen ---------------- */

  function neu(arbeitstyp = 'hausarbeit') {
    const typ = ARBEITSTYPEN[arbeitstyp] || ARBEITSTYPEN.hausarbeit;
    return {
      version: 1,
      meta: { ...STANDARD_META, arbeitstyp },
      einstellungen: { ...STANDARD_EINSTELLUNGEN, ...typ.einstellungen },
      bloecke: (GERUESTE[arbeitstyp] || GERUESTE.hausarbeit)(),
      quellen: []
    };
  }

  /* Fehlende Felder ergänzen, damit ältere gespeicherte Dateien
     nach einem Update weiter funktionieren.                         */
  function normalisiere(dok) {
    if (!dok || typeof dok !== 'object') return neu();
    return {
      version: 1,
      meta:          { ...STANDARD_META, ...(dok.meta || {}),
                       abkuerzungen: Array.isArray((dok.meta || {}).abkuerzungen)
                         ? dok.meta.abkuerzungen : [] },
      einstellungen: { ...STANDARD_EINSTELLUNGEN, ...(dok.einstellungen || {}) },
      bloecke:       Array.isArray(dok.bloecke) ? dok.bloecke.map(b => ({
                       id: b.id || neueId(), ...b })) : [],
      quellen:       Array.isArray(dok.quellen) ? dok.quellen : []
    };
  }

  /* ---------------- Nummerierung ----------------
     Wird bei jedem Rendern neu berechnet. Dadurch stimmen Kapitel-,
     Tabellen- und Abbildungsnummern auch nach dem Umsortieren.      */

  function nummeriere(dok) {
    const zaehl = [0, 0, 0];
    let tab = 0, abb = 0, imAnhang = false, anhangBuchstabe = 0;
    /* Im Anhang zählen Tabellen und Abbildungen je Anhang von vorn und
       tragen dessen Buchstaben: A1, A2, B1. APA 7 verlangt das, und
       durchlaufende Nummern ("Tabelle 7" mitten in Anhang A) sind der
       Grund, aus dem Betreuende die Arbeit zurückgeben. */
    let anhangTab = 0, anhangAbb = 0;
    const karte = new Map();
    const buchstabeJetzt = () =>
      String.fromCharCode(64 + Math.max(1, anhangBuchstabe));

    for (const b of dok.bloecke) {
      if (b.typ === 'anhangstart') {
        imAnhang = true; zaehl[0] = zaehl[1] = zaehl[2] = 0;
        karte.set(b.id, { nummer: '', imAnhang });
        continue;
      }
      if (b.typ === 'ueberschrift') {
        const e = Math.min(3, Math.max(1, b.ebene || 1));
        zaehl[e - 1]++;
        for (let i = e; i < 3; i++) zaehl[i] = 0;
        let nummer;
        if (imAnhang) {
          if (e === 1) {
            anhangBuchstabe = zaehl[0];
            anhangTab = anhangAbb = 0;      // neuer Anhang, neue Zählung
          }
          const buchstabe = buchstabeJetzt();
          nummer = e === 1 ? buchstabe
                 : buchstabe + '.' + zaehl.slice(1, e).join('.');
        } else {
          nummer = zaehl.slice(0, e).join('.');
        }
        karte.set(b.id, { nummer, ebene: e, imAnhang });
        continue;
      }
      if (b.typ === 'tabelle')
        karte.set(b.id, { nummer: imAnhang
          ? buchstabeJetzt() + (++anhangTab) : String(++tab), imAnhang });
      if (b.typ === 'abbildung' || b.typ === 'diagramm')
        karte.set(b.id, { nummer: imAnhang
          ? buchstabeJetzt() + (++anhangAbb) : String(++abb), imAnhang });
    }
    return karte;
  }

  /* ---------------- Zählung ----------------
     Was zählt: der Text der Bausteine absatz, blockzitat, liste und
     ueberschrift über Richtext.zuText -- Chips zählen als ihr
     angezeigter Text, Fußnotentext zählt mit. Was NICHT zählt:
     Tabellen, Abbildungs-/Diagrammtitel und -anmerkungen, Formeln,
     Deckblatt, Abstract. Das entspricht dem, was Prüfungsordnungen
     unter "Fließtext" verstehen.

     Gezählt wird dreierlei, weil Prüfungsordnungen sich nicht einig
     sind: Wörter, Zeichen mit Leerzeichen und Zeichen ohne. Und zwar
     für jeden Abschnitt jeder Ebene, nicht nur für Kapitel --
     einschließlich seiner Unterabschnitte, denn "Kapitel 2 hat 1 200
     Wörter" meint das ganze Kapitel.                                */

  /* Zahl mit schmalem Leerzeichen: 4 230 */
  const zahl = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');

  const leeresMass = () => ({ woerter: 0, zeichen: 0, zeichenOhneLeer: 0 });

  function messe(mass, text) {
    const t = String(text || '');
    mass.woerter += (t.match(/\S+/g) || []).length;
    mass.zeichen += t.length;
    mass.zeichenOhneLeer += t.replace(/\s+/g, '').length;
    return mass;
  }

  function zaehlung(dok) {
    const nummern = nummeriere(dok);
    const sprache = (dok.einstellungen || {}).sprache;
    const w = Zitate.wort(sprache);
    const ctx = {
      quellen: dok.quellen,
      sprache,
      verweisText: (ziel) => {
        const b = dok.bloecke.find(x => x.id === ziel);
        if (!b) return w['gelöscht'];
        const info = nummern.get(ziel) || {};
        const n = info.nummer || '?';
        return b.typ === 'tabelle' ? `${w.tabelle} ${n}`
             : (b.typ === 'abbildung' || b.typ === 'diagramm') ? `${w.abbildung} ${n}`
             /* Ein Anhang heißt Anhang, nicht Abschnitt -- "siehe
                Abschnitt A" stimmt in keiner der beiden Sprachen. */
             : `${info.imAnhang && (info.ebene || 1) === 1 ? w.anhang : w.abschnitt} ${n}`;
      }
    };

    const gesamt = leeresMass();
    const jeAbschnitt = new Map();
    const bausteine = {};
    let fussnoten = 0;

    /* Offene Überschriften von außen nach innen. Ein Textstück zählt
       für jede davon -- so enthält Kapitel 2 auch 2.3.1. */
    const stapel = [];

    const trage = (text) => {
      messe(gesamt, text);
      for (const eintrag of stapel) messe(eintrag.mass, text);
      if (stapel.length) messe(stapel[stapel.length - 1].eigen, text);
    };
    const ausRuns = (runs) => {
      trage(Richtext.zuText(runs, ctx));
      for (const r of (runs || [])) {
        if (r.fussnote == null) continue;
        fussnoten += 1;
        trage(r.fussnote);
      }
    };

    for (const b of dok.bloecke) {
      bausteine[b.typ] = (bausteine[b.typ] || 0) + 1;
      switch (b.typ) {
        case 'ueberschrift': {
          const ebene = (nummern.get(b.id) || {}).ebene || b.ebene || 1;
          while (stapel.length && stapel[stapel.length - 1].ebene >= ebene) stapel.pop();
          const eintrag = { ebene, mass: leeresMass(), eigen: leeresMass() };
          jeAbschnitt.set(b.id, eintrag);
          stapel.push(eintrag);
          trage(b.text);
          break;
        }
        case 'absatz':
        case 'blockzitat':
          ausRuns(b.runs);
          break;
        case 'liste':
          (b.punkte || []).forEach(ausRuns);
          break;
        default:
          break;
      }
    }

    /* Nach außen die flachen Zahlen, nicht die Zwischenstruktur. */
    const abschnitte = new Map();
    for (const [id, e] of jeAbschnitt)
      abschnitte.set(id, { ...e.mass, ebene: e.ebene, eigen: e.eigen });

    return {
      gesamt,
      jeAbschnitt: abschnitte,
      bausteine,
      fussnoten,
      quellen: {
        angelegt: (dok.quellen || []).length,
        zitiert: zitierteSchluessel(dok).size
      }
    };
  }

  /* Welche Quellen werden tatsächlich zitiert?
     Nur die kommen ins Literaturverzeichnis (APA 7).                */
  function zitierteSchluessel(dok) {
    const menge = new Set();
    /* Ein Zitat kann mehrere Quellen zugleich belegen: "a,b" */
    const ausRuns = runs => (runs || []).forEach(
      r => { if (r.zitat) Zitate.schluesselliste(r.zitat).forEach(k => menge.add(k)); });
    for (const b of dok.bloecke) {
      if (b.runs) ausRuns(b.runs);
      /* Nur das Blockzitat nennt hier eine Quelle. Beim Diagramm steht
         in `quelle` die Herkunft der Zahlen ("eigen"/"tabelle") -- das
         ist kein Literaturschlüssel. */
      if (b.typ === 'blockzitat' && b.quelle) menge.add(b.quelle);
      if (b.punkte) b.punkte.forEach(ausRuns);
      /* Auch das Diagramm: sein Titel und seine Anmerkung laufen durch
         dieselbe Token-Ersetzung. Fehlte es hier, stand der Schlüssel
         zwar im LaTeX, aber die Quelle nie in literatur.bib -- im PDF
         der rohe Schlüssel, dazu eine PRÜFEN-Karte, gegen die sich
         nichts tun ließ, weil die Quelle ja angelegt war.
         `zitn` (narrativ) zählt genauso wie `zit`. */
      if (['tabelle', 'abbildung', 'diagramm'].includes(b.typ)) {
        [b.titel, b.anmerkung].forEach(t => {
          const treffer = String(t || '').match(/\{\{zitn?:([^}|]+)/g) || [];
          treffer.forEach(x => menge.add(x.replace(/^\{\{zitn?:/, '')));
        });
      }
    }
    return menge;
  }

  return { neu, normalisiere, neueId, neuerBlock, nummeriere, zaehlung, zahl,
           zitierteSchluessel,
           ARBEITSTYPEN, QUELLTYPEN, BLOCKTYPEN, GERUESTE,
           STANDARD_EINSTELLUNGEN, STANDARD_META };
})();
