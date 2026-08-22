/* ===================================================================
   77-formeldialog.js  --  Der Formeleditor
   -------------------------------------------------------------------
   Bisher war die Formel ein leeres Textfeld: LaTeX blind tippen,
   PDF abwarten, Fehler suchen. Jetzt steht daneben eine Vorschau,
   die beim Tippen mitgeht (MathML, siehe 34-mathe.js), darunter
   eine Symbolleiste, aus der sich Brüche, Wurzeln, griechische
   Buchstaben und die gängigen Statistik-Formeln zusammenklicken
   lassen. Probleme (fehlende Klammer, unbekannter Befehl) werden
   sofort gemeldet, nicht erst nach dem LaTeX-Lauf.

   Zwei Aufrufe:
     block(block)              Formel-Baustein (mit Nummerierung)
     inline(vorbelegung, opt)  Formel im Fließtext (als Chip)
   =================================================================== */

const Formeldialog = (() => {

  const el = (tag, klasse, html) => {
    const n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (html != null) n.innerHTML = html;
    return n;
  };

  /* ---------------- Symbolleiste ----------------
     □ markiert die Lücken einer Vorlage: die erste bekommt den gerade
     markierten Text, in die nächste springt die Schreibmarke.        */

  const GRUPPEN = [
    { name: 'Aufbau', knoepfe: [
      ['⁄', '\\frac{□}{□}', 'Bruch'],
      ['√', '\\sqrt{□}', 'Wurzel'],
      ['ⁿ√', '\\sqrt[□]{□}', 'n-te Wurzel'],
      ['x²', '□^{□}', 'Hochgestellt (Exponent)'],
      ['x₂', '□_{□}', 'Tiefgestellt (Index)'],
      ['∑', '\\sum_{i=1}^{n} □', 'Summe'],
      ['∏', '\\prod_{i=1}^{n} □', 'Produkt'],
      ['∫', '\\int_{□}^{□} □ \\, dx', 'Integral'],
      ['lim', '\\lim_{n \\to \\infty} □', 'Grenzwert'],
      ['x̄', '\\bar{□}', 'Querstrich (Mittelwert)'],
      ['x̂', '\\hat{□}', 'Dach (Schätzwert)'],
      ['x⃗', '\\vec{□}', 'Vektorpfeil'],
      ['( )', '\\left( □ \\right)', 'Mitwachsende Klammern'],
      ['| |', '\\left| □ \\right|', 'Betrag'],
      ['(ⁿₖ)', '\\binom{n}{k}', 'Binomialkoeffizient'],
      ['⠿', '\\begin{pmatrix} □ & □ \\\\ □ & □ \\end{pmatrix}', 'Matrix (2×2)'],
      ['{', '\\begin{cases} □ & \\text{falls } □ \\\\ □ & \\text{sonst} \\end{cases}', 'Fallunterscheidung'],
      ['Tt', '\\text{□}', 'Normaler Text in der Formel']
    ]},
    { name: 'Griechisch', knoepfe: [
      ['α', '\\alpha'], ['β', '\\beta'], ['γ', '\\gamma'], ['δ', '\\delta'],
      ['ε', '\\varepsilon'], ['η', '\\eta'], ['θ', '\\theta'], ['κ', '\\kappa'],
      ['λ', '\\lambda'], ['μ', '\\mu'], ['ν', '\\nu'], ['ξ', '\\xi'],
      ['π', '\\pi'], ['ρ', '\\rho'], ['σ', '\\sigma'], ['τ', '\\tau'],
      ['φ', '\\varphi'], ['χ', '\\chi'], ['ψ', '\\psi'], ['ω', '\\omega'],
      ['Γ', '\\Gamma'], ['Δ', '\\Delta'], ['Θ', '\\Theta'], ['Λ', '\\Lambda'],
      ['Π', '\\Pi'], ['Σ', '\\Sigma'], ['Φ', '\\Phi'], ['Ψ', '\\Psi'],
      ['Ω', '\\Omega']
    ]},
    { name: 'Zeichen', knoepfe: [
      ['±', '\\pm'], ['×', '\\times'], ['·', '\\cdot'], ['÷', '\\div'],
      ['≤', '\\leq'], ['≥', '\\geq'], ['≠', '\\neq'], ['≈', '\\approx'],
      ['∼', '\\sim'], ['∝', '\\propto'], ['≡', '\\equiv'], ['∞', '\\infty'],
      ['→', '\\rightarrow'], ['⇒', '\\Rightarrow'], ['↔', '\\leftrightarrow'],
      ['∈', '\\in'], ['∉', '\\notin'], ['⊂', '\\subset'], ['∪', '\\cup'],
      ['∩', '\\cap'], ['∅', '\\emptyset'], ['∀', '\\forall'], ['∃', '\\exists'],
      ['∂', '\\partial'], ['′', "'"], ['…', '\\ldots'], ['⋯', '\\cdots'],
      ['%', '\\%']
    ]},
    { name: 'Statistik', beschriftet: true, knoepfe: [
      ['Mittelwert', '\\bar{x} = \\frac{1}{n} \\sum_{i=1}^{n} x_i'],
      ['Standardabweichung', 's = \\sqrt{\\frac{1}{n-1} \\sum_{i=1}^{n} (x_i - \\bar{x})^2}'],
      ['z-Wert', 'z = \\frac{x - \\mu}{\\sigma}'],
      ['t-Test', 't = \\frac{\\bar{x}_1 - \\bar{x}_2}{s_p \\cdot \\sqrt{\\frac{1}{n_1} + \\frac{1}{n_2}}}'],
      ['Cohens d', 'd = \\frac{\\bar{x}_1 - \\bar{x}_2}{s_p}'],
      ['Korrelation r', 'r_{xy} = \\frac{\\mathrm{cov}(X, Y)}{s_X \\cdot s_Y}'],
      ['Chi-Quadrat', '\\chi^2 = \\sum_{i=1}^{k} \\frac{(O_i - E_i)^2}{E_i}'],
      ['Konfidenzintervall', '\\mathrm{KI}_{95\\,\\%} = \\bar{x} \\pm 1{,}96 \\cdot \\frac{s}{\\sqrt{n}}'],
      ['Regression', '\\hat{y} = b_0 + b_1 \\cdot x'],
      ['Alpha (Reliabilität)', '\\alpha = \\frac{k}{k-1} \\left( 1 - \\frac{\\sum s_i^2}{s_t^2} \\right)']
    ]}
  ];

  /* Vorlage an der Schreibmarke einsetzen. Markierter Text wandert in
     die erste Lücke; die Schreibmarke landet in der nächsten.        */
  function einsetzen(feld, vorlage) {
    const von = feld.selectionStart, bis = feld.selectionEnd;
    const auswahl = feld.value.slice(von, bis);
    const ersteLuecke = vorlage.indexOf('□');
    let stueck = vorlage.replace('□', auswahl);
    /* Wohin mit der Schreibmarke? In die erste LEERE Lücke: ohne
       Auswahl ist das die erste, sonst die nächste dahinter. */
    let marke = auswahl || ersteLuecke < 0 ? stueck.indexOf('□') : ersteLuecke;
    if (marke < 0) marke = auswahl && ersteLuecke >= 0
      ? ersteLuecke + auswahl.length : stueck.length;
    stueck = stueck.replace(/□/g, '');
    /* Wo nötig, mit Leerzeichen vom Wort davor absetzen -- \alphax
       wäre ein anderer (unbekannter) Befehl. */
    const davor = feld.value.slice(0, von);
    const abstand = /[a-zA-Z]$/.test(davor) && /^\\[a-zA-Z]/.test(stueck) ? ' ' : '';
    feld.value = davor + abstand + stueck + feld.value.slice(bis);
    const p = von + abstand.length + marke;
    feld.focus();
    feld.setSelectionRange(p, p);
    feld.dispatchEvent(new Event('input'));
  }

  /* ---------------- Der Dialog ---------------- */

  /* optionen: { titel, unter, tex, nummeriert (undefined = Schalter
     ausblenden), bearbeiten, okText }.
     Löst auf mit { tex, nummeriert } | { entfernen: true } | null.   */
  function oeffne(optionen) {
    return new Promise((fertig) => {
      const { koerper, fuss, schliessen } = Dialoge.basis({
        titel: optionen.titel,
        unter: optionen.unter,
        breit: true,
        beimSchliessen: () => fertig(null)
      });

      /* --- Eingabe und Vorschau nebeneinander --- */
      const zeile = el('div', 'formel-editor');
      const eingabe = el('textarea', 'formel-eingabe');
      eingabe.rows = 4;
      eingabe.spellcheck = false;
      eingabe.placeholder = 'z. B.  \\frac{a}{b}  oder unten zusammenklicken';
      eingabe.value = optionen.tex || '';
      const vorschau = el('div', 'formel-vorschau');
      zeile.append(eingabe, vorschau);

      const warnung = el('div', 'formel-warnung');

      const zeichneVorschau = () => {
        const tex = Mathe.normalisiere(eingabe.value);
        const v = Mathe.vorschauHtml(tex, true);
        vorschau.innerHTML = v.html ||
          '<span class="formel-leer">Die Vorschau erscheint beim Tippen.</span>';
        const meldungen = tex ? Mathe.pruefe(tex) : [];
        warnung.innerHTML = '';
        if (meldungen.length) {
          warnung.append(el('div', 'notiz warnung',
            '<span>&#9888;</span><span>' + escHtml(meldungen[0]) + '</span>'));
        } else if (v.fehler) {
          /* Lesbar für LaTeX, nur nicht für die Vorschau -- kein
             Grund zur Sorge, aber sagen, warum nichts zu sehen ist. */
          warnung.append(el('div', 'notiz',
            '<span>&#9432;</span><span>' + escHtml(v.fehler) +
            ' Das PDF rechts zeigt, wie LaTeX sie setzt.</span>'));
        }
      };
      eingabe.addEventListener('input', zeichneVorschau);

      /* --- Symbolleiste mit Reitern --- */
      const reiter = el('div', 'reiter formel-reiter');
      const flaeche = el('div', 'symbolflaeche');
      const zeigeGruppe = (gruppe) => {
        reiter.querySelectorAll('button').forEach(b =>
          b.classList.toggle('aktiv', b.textContent === gruppe.name));
        flaeche.innerHTML = '';
        flaeche.classList.toggle('symbolflaeche-beschriftet', !!gruppe.beschriftet);
        for (const [anzeige, vorlage, titel] of gruppe.knoepfe) {
          const k = el('button', 'symbolknopf', escHtml(anzeige));
          k.type = 'button';
          k.title = titel || vorlage;
          /* mousedown würde der Eingabe den Fokus (und die Auswahl)
             nehmen, bevor der Klick ankommt. */
          k.addEventListener('mousedown', (ev) => ev.preventDefault());
          k.addEventListener('click', () => einsetzen(eingabe, vorlage));
          flaeche.append(k);
        }
      };
      for (const gruppe of GRUPPEN) {
        const b = el('button', null, escHtml(gruppe.name));
        b.type = 'button';
        b.addEventListener('click', () => zeigeGruppe(gruppe));
        reiter.append(b);
      }
      zeigeGruppe(GRUPPEN[0]);

      koerper.append(zeile, warnung, reiter, flaeche);

      /* --- Nummerierung (nur beim Formel-Baustein) --- */
      let nummeriertKasten = null;
      if (optionen.nummeriert !== undefined) {
        const schalter = el('div', 'schalterzeile');
        nummeriertKasten = el('input');
        nummeriertKasten.type = 'checkbox';
        nummeriertKasten.checked = !!optionen.nummeriert;
        schalter.append(nummeriertKasten,
          el('div', 'txt', '<b>Formel nummerieren</b><span>Bekommt eine Nummer wie (1) ' +
            'am rechten Rand und lässt sich per Querverweis ansprechen.</span>'));
        koerper.append(schalter);
      }

      const uebernehmen = () => {
        const tex = Mathe.normalisiere(eingabe.value);
        if (!tex) { App.melde('Die Formel ist noch leer.', true); eingabe.focus(); return; }
        schliessen();
        fertig({ tex, nummeriert: nummeriertKasten ? nummeriertKasten.checked : undefined });
      };

      eingabe.addEventListener('keydown', (ev) => {
        if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
          ev.preventDefault(); uebernehmen();
        }
      });

      if (optionen.bearbeiten)
        fuss.append(Dialoge.knopf('Entfernen', 'knopf-gefahr links',
          () => { schliessen(); fertig({ entfernen: true }); }));
      fuss.append(
        Dialoge.knopf('Abbrechen', 'knopf-still', () => { schliessen(); fertig(null); }),
        Dialoge.knopf(optionen.okText || 'Übernehmen', 'knopf-haupt', uebernehmen)
      );

      zeichneVorschau();
      setTimeout(() => eingabe.focus(), 30);
    });
  }

  /* ---------------- Formel-Baustein ---------------- */

  async function block(b) {
    const aus = await oeffne({
      titel: 'Formel',
      unter: 'Abgesetzte Formel mit eigener Zeile. Markieren und klicken baut ineinander: ' +
             'erst <code>a+b</code> markieren, dann auf den Bruch.',
      tex: b.tex,
      nummeriert: !!b.nummeriert
    });
    if (!aus) return null;
    b.tex = aus.tex;
    b.nummeriert = !!aus.nummeriert;
    return b;
  }

  /* ---------------- Formel im Fließtext ---------------- */

  /* Löst mit { formel: tex } auf -- oder { entfernen: true } beim
     Bearbeiten eines bestehenden Chips.                              */
  async function inline(vorbelegung, optionen = {}) {
    const aus = await oeffne({
      titel: optionen.bearbeiten ? 'Formel bearbeiten' : 'Formel im Satz',
      unter: 'Steht mitten im Text, z. B. für Symbole wie <code>\\eta^2</code> — ' +
             'längere Formeln besser als eigener Baustein (Einfügen → Formel).',
      tex: (vorbelegung || {}).formel || '',
      bearbeiten: optionen.bearbeiten,
      okText: optionen.bearbeiten ? 'Übernehmen' : 'Einfügen'
    });
    if (!aus) return null;
    if (aus.entfernen) return aus;
    return { formel: aus.tex };
  }

  return { block, inline };
})();
