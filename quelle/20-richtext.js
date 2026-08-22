/* ===================================================================
   20-richtext.js  --  Runs  <->  contenteditable  <->  LaTeX
   -------------------------------------------------------------------
   Ein Absatz ist eine Liste von "Runs":
     {text:'...', b:true, i:true}      normaler Text
     {zitat:'key', form:'klammer'}     Quellenangabe
     {kennwert:'SW', wert:'104'}       statistischer Kennwert (kursiv)
     {verweis:'blockId'}               "Tabelle 3" / "Abbildung 1"
     {fussnote:'...'}                  Fußnote
   Diese Zwischenschicht ist der Grund, warum eingefügter Word-Text
   nie kaputte Formatierung einschleppen kann.
   =================================================================== */

const Zitate = (() => {

  /* "Westhoff, Karl; Kluck, Marie-Luise"  ->  ['Westhoff','Kluck'] */
  function nachnamen(quelle) {
    if (!quelle || !quelle.felder || !quelle.felder.autoren) return [];
    return String(quelle.felder.autoren)
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => (s.includes(',') ? s.split(',')[0] : s).trim());
  }

  /* Wörter, die sich mit der Sprache der Arbeit ändern. Die Oberfläche
     bleibt deutsch -- was hier steht, landet im PDF und muss deshalb der
     Sprache des Dokuments folgen.                                     */
  const WORT = {
    de: { und: 'und', hrsg: 'Hrsg.', seiten: 'S.', auflage: 'Aufl.',
          tabelle: 'Tabelle', abbildung: 'Abbildung', abschnitt: 'Abschnitt',
          anhang: 'Anhang',
          gelöscht: '?? gelöscht' },
    en: { und: 'and', hrsg: 'Eds.', seiten: 'pp.', auflage: 'ed.',
          tabelle: 'Table', abbildung: 'Figure', abschnitt: 'Section',
          anhang: 'Appendix',
          gelöscht: '?? deleted' }
  };
  const wort = (sprache) => WORT[sprache === 'en' ? 'en' : 'de'];

  /* Autor:innen im Fließtext nach APA 7 */
  function autorKurz(quelle, form, sprache) {
    const n = nachnamen(quelle);
    if (!n.length) return '???';
    if (n.length === 1) return n[0];
    if (n.length === 2) return form === 'narrativ'
      ? `${n[0]} ${wort(sprache).und} ${n[1]}`
      : `${n[0]} & ${n[1]}`;
    return `${n[0]} et al.`;
  }

  function jahr(quelle) {
    return (quelle && quelle.felder && quelle.felder.jahr) || 'o. J.';
  }

  /* Vollständige Angabe, so wie sie im Text erscheint.
     `quelle` darf eine Quelle sein oder mehrere: APA 7 fasst mehrere
     Belege in EINER Klammer zusammen, alphabetisch geordnet und mit
     Semikolon getrennt -- (Müller, 2020; Schmidt, 2021).             */
  function imText(quelle, form, seite, sprache) {
    const liste = Array.isArray(quelle) ? quelle : [quelle];
    if (!liste.length || (liste.length === 1 && !liste[0])) return '(Quelle fehlt)';
    const w = wort(sprache);
    const s = seite ? `, ${w.seiten} ${seite}` : '';

    if (liste.length === 1) {
      return form === 'narrativ'
        ? `${autorKurz(liste[0], 'narrativ', sprache)} (${jahr(liste[0])}${s})`
        : `(${autorKurz(liste[0], 'klammer', sprache)}, ${jahr(liste[0])}${s})`;
    }

    const geordnet = sortiert(liste);
    if (form === 'narrativ') {
      /* Im Satz bleiben mehrere Belege getrennt: "Müller (2020) und
         Schmidt (2021) zeigten ..." -- keine gemeinsame Klammer. */
      const teile = geordnet.map(q => `${autorKurz(q, 'narrativ', sprache)} (${jahr(q)})`);
      return teile.slice(0, -1).join(', ') + ` ${w.und} ` + teile[teile.length - 1];
    }
    return '(' + geordnet.map(
      q => `${autorKurz(q, 'klammer', sprache)}, ${jahr(q)}`).join('; ') + ')';
  }

  /* "a, b" -> die zugehörigen Quellen; Unbekanntes bleibt null und
     erscheint als "???" statt lautlos zu verschwinden.               */
  function schluesselliste(roh) {
    return String(roh || '').split(',').map(s => s.trim()).filter(Boolean);
  }
  function quellenZu(roh, quellen) {
    return schluesselliste(roh).map(k => (quellen || []).find(q => q.key === k) || null);
  }

  /* Autor:innen im Literaturverzeichnis: "Westhoff, K., & Kluck, M.-L." */
  function autorLang(quelle) {
    const roh = String((quelle.felder && quelle.felder.autoren) || '')
      .split(';').map(s => s.trim()).filter(Boolean);
    if (!roh.length) return '';
    const formatiert = roh.map(person => {
      if (!person.includes(',')) return person;          // Institution
      const [nach, vor] = person.split(',').map(s => s.trim());
      const initialen = vor.split(/[\s-]+/).filter(Boolean)
        .map(t => t[0].toUpperCase() + '.')
        .join(vor.includes('-') ? '-' : ' ');
      return `${nach}, ${initialen}`;
    });
    if (formatiert.length === 1) return formatiert[0];
    return formatiert.slice(0, -1).join(', ') + ', & ' + formatiert[formatiert.length - 1];
  }

  /* Herausgeber:innen stehen in APA 7 mit Vornamen zuerst:
     "In O. P. John & R. W. Robins (Hrsg.), ..." -- anders als bei
     Autor:innen, die mit dem Nachnamen beginnen.                    */
  function herausgeberLang(roh) {
    const liste = String(roh || '').split(';').map(s => s.trim()).filter(Boolean)
      .map(person => {
        if (!person.includes(',')) return person;
        const [nach, vor] = person.split(',').map(s => s.trim());
        const initialen = vor.split(/[\s-]+/).filter(Boolean)
          .map(t => t[0].toUpperCase() + '.').join(' ');
        return `${initialen} ${nach}`;
      });
    if (!liste.length) return '';
    if (liste.length === 1) return liste[0];
    return liste.slice(0, -1).join(', ') + ' & ' + liste[liste.length - 1];
  }

  /* Eintrag fürs Literaturverzeichnis -- nur für die VORSCHAU.
     Im Export macht biblatex-apa das, und zwar maßgeblich.          */
  function verzeichniseintrag(quelle, sprache) {
    const w = wort(sprache);
    const f = quelle.felder || {};
    const k = (x) => (x ? String(x).trim() : '');
    const teile = [];
    teile.push(`${autorLang(quelle)} (${jahr(quelle)}).`);

    const kursiv = (t) => `<i>${escHtml(t)}</i>`;
    const auflage = k(f.auflage)
      ? ` (${/^\d+$/.test(k(f.auflage))
              ? (sprache === 'en' ? k(f.auflage) + '. ed.' : k(f.auflage) + '. Aufl.')
              : k(f.auflage)})`
      : '';

    switch (quelle.typ) {
      case 'artikel':
        teile.push(`${escHtml(k(f.titel))}.`);
        teile.push(`${kursiv(k(f.zeitschrift))}${k(f.jahrgang) ? ', ' + kursiv(k(f.jahrgang)) : ''}` +
                   `${k(f.heft) ? '(' + escHtml(k(f.heft)) + ')' : ''}` +
                   `${k(f.seiten) ? ', ' + escHtml(k(f.seiten)) : ''}.`);
        break;
      case 'kapitel':
        teile.push(`${escHtml(k(f.titel))}.`);
        teile.push(`In ${escHtml(herausgeberLang(f.herausgeber))} (${w.hrsg}), ${kursiv(k(f.buchtitel))}${auflage}` +
                   `${k(f.seiten) ? ' (' + w.seiten + ' ' + escHtml(k(f.seiten)) + ')' : ''}.`);
        teile.push(`${escHtml(k(f.verlag))}.`);
        break;
      case 'online':
        teile.push(`${kursiv(k(f.titel))}.`);
        if (k(f.webseite)) teile.push(`${escHtml(k(f.webseite))}.`);
        teile.push(escHtml(k(f.url)));
        break;
      case 'bericht':
        teile.push(`${kursiv(k(f.titel))}${k(f.nummer) ? ' (Bericht Nr. ' + escHtml(k(f.nummer)) + ')' : ''}.`);
        if (k(f.institution)) teile.push(`${escHtml(k(f.institution))}.`);
        if (k(f.url)) teile.push(escHtml(k(f.url)));
        break;
      default:                                    // buch, testverfahren
        teile.push(`${kursiv(k(f.titel))}${auflage}.`);
        if (k(f.verlag)) teile.push(`${escHtml(k(f.verlag))}.`);
    }
    if (k(f.doi)) teile.push(`https://doi.org/${escHtml(k(f.doi))}`);
    return teile.filter(Boolean).join(' ');
  }

  /* Sortierung wie im Literaturverzeichnis */
  function sortiert(quellen) {
    return [...quellen].sort((a, b) => {
      const na = (nachnamen(a)[0] || '').toLowerCase();
      const nb = (nachnamen(b)[0] || '').toLowerCase();
      if (na !== nb) return na.localeCompare(nb, 'de');
      return String(jahr(a)).localeCompare(String(jahr(b)));
    });
  }

  return { nachnamen, autorKurz, autorLang, herausgeberLang, jahr, imText,
           verzeichniseintrag, sortiert, schluesselliste, quellenZu, wort };
})();


function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


const Richtext = (() => {

  /* ---------- LaTeX-Maskierung ----------
     Diese Zeichen haben in LaTeX Sonderbedeutung.                    */
  const LATEX_ERSATZ = {
    '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$',
    '&': '\\&', '#': '\\#', '_': '\\_', '%': '\\%',
    '~': '\\textasciitilde{}', '^': '\\textasciicircum{}'
  };

  /* Zeichen, die Psycholog:innen ständig tippen, die pdflatex mit
     T1-Kodierung aber nicht kennt (α, χ², η² ...). Ohne diese Tabelle
     bricht die Kompilierung ab -- deshalb ist sie nicht optional.    */
  const MATHZEICHEN = {
    'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta',
    'ε': '\\varepsilon', 'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta',
    'ι': '\\iota', 'κ': '\\kappa', 'λ': '\\lambda', 'μ': '\\mu',
    'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi', 'ρ': '\\rho',
    'σ': '\\sigma', 'ς': '\\varsigma', 'τ': '\\tau', 'υ': '\\upsilon',
    'φ': '\\varphi', 'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
    'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda',
    'Ξ': '\\Xi', 'Π': '\\Pi', 'Σ': '\\Sigma', 'Φ': '\\Phi',
    'Ψ': '\\Psi', 'Ω': '\\Omega',
    /* Hoch- und Tiefstellung vollständig: die Tabelle hörte bei ⁴ und ₃
       auf, und ein ⁵ oder ₇ war damit ein harter Übersetzungsfehler --
       "Unicode character not set up for use with LaTeX", für den es
       nicht einmal eine deutsche Erklärung gab. */
    '⁰': '^{0}', '¹': '^{1}', '²': '^{2}', '³': '^{3}', '⁴': '^{4}',
    '⁵': '^{5}', '⁶': '^{6}', '⁷': '^{7}', '⁸': '^{8}', '⁹': '^{9}',
    '⁺': '^{+}', '⁻': '^{-}', '⁼': '^{=}', 'ⁿ': '^{n}',
    '₀': '_{0}', '₁': '_{1}', '₂': '_{2}', '₃': '_{3}', '₄': '_{4}',
    '₅': '_{5}', '₆': '_{6}', '₇': '_{7}', '₈': '_{8}', '₉': '_{9}',
    '₊': '_{+}', '₋': '_{-}',
    '±': '\\pm', '×': '\\times', '÷': '\\div', '·': '\\cdot',
    '≤': '\\leq', '≥': '\\geq', '≠': '\\neq', '≈': '\\approx',
    '≡': '\\equiv', '∝': '\\propto', '∼': '\\sim',
    '∞': '\\infty', '√': '\\surd', '∑': '\\sum', '∏': '\\prod',
    '∫': '\\int', '∂': '\\partial', '∇': '\\nabla',
    '∈': '\\in', '∉': '\\notin', '⊂': '\\subset', '⊆': '\\subseteq',
    '∪': '\\cup', '∩': '\\cap', '∅': '\\emptyset',
    '∀': '\\forall', '∃': '\\exists', '¬': '\\neg',
    '∧': '\\wedge', '∨': '\\vee',
    '′': '\\prime', '″': '\\prime\\prime',
    '→': '\\rightarrow', '←': '\\leftarrow', '↔': '\\leftrightarrow',
    '↑': '\\uparrow', '↓': '\\downarrow',
    '⇒': '\\Rightarrow', '⇐': '\\Leftarrow', '⇔': '\\Leftrightarrow',
    '∆': '\\Delta'
  };

  /* Zeichen, die im Textmodus bleiben */
  const TEXTZEICHEN = {
    '–': '--', '—': '---', '‑': '-', '…': '\\dots{}', '°': '\\textdegree{}',
    '‰': '\\textperthousand{}', '§': '\\S{}', '€': '\\texteuro{}',
    '½': '\\textonehalf{}', '¼': '\\textonequarter{}', '©': '\\textcopyright{}',
    '®': '\\textregistered{}', '™': '\\texttrademark{}',
    ' ': '~', ' ': '\\,', ' ': '\\,'
  };

  const mathMuster = new RegExp('[' + Object.keys(MATHZEICHEN).join('') + ']+', 'g');
  const textMuster = new RegExp('[' + Object.keys(TEXTZEICHEN).join('') + ']', 'g');

  /* Unsichtbare Zeichen. Der Editor setzt hinter jedem eingefügten
     Objekt ein Nullbreiten-Leerzeichen, damit die Schreibmarke
     dahinter landen kann. LaTeX kennt es nicht und bricht ab -- also
     hier raus, bevor irgendetwas anderes passiert.                  */
  const UNSICHTBAR = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g;

  /* Was nach allen Ersetzungen übrig bleibt und jenseits von Latin-1
     liegt. Zeilenumbruch und Tabulator bleiben ausgenommen. */
  const UNBEKANNT = /[^\u0000-\u00FF]/g;

  const escLatex = (s) =>
    String(s == null ? '' : s)
      .replace(UNSICHTBAR, '')
      .replace(/[\\{}$&#_%~^]/g, c => LATEX_ERSATZ[c])
      .replace(textMuster, c => TEXTZEICHEN[c])
      // zusammenhängende Mathe-Zeichen in EINE Formel packen: χ² -> $\chi^{2}$
      .replace(mathMuster, m => '$' + [...m].map(c => MATHZEICHEN[c]).join('') + '$')
      /* Auffangnetz. Jedes Zeichen, das weder Latin-1 noch in einer der
         Tabellen oben steht, ist für pdflatex mit T1-Kodierung ein
         harter Fehler ("Unicode character ... not set up"). Eine
         vollständige Tabelle gibt es nicht -- Emoji, seltene Symbole,
         fremde Schriften kommen über die Zwischenablage jederzeit
         herein. Lieber ein sichtbares Kästchen im PDF als ein Bau, der
         abbricht und dessen Meldung niemand versteht. */
      .replace(UNBEKANNT, '\\mbox{?}');

  /* ---------- Runs -> reiner Text (für Gliederung, Titel) ---------- */
  function zuText(runs, ctx = {}) {
    return (runs || []).map(r => {
      if (r.text != null) return r.text;
      if (r.zitat) {
        return Zitate.imText(Zitate.quellenZu(r.zitat, ctx.quellen),
                             r.form, r.seite, ctx.sprache);
      }
      if (r.kennwert) return `${r.kennwert} = ${r.wert}`;
      if (r.verweis) return ctx.verweisText ? ctx.verweisText(r.verweis) : '[Verweis]';
      return '';
    }).join('');
  }

  /* ---------- Runs -> HTML (Editor und Vorschau) ---------- */
  function zuHtml(runs, ctx = {}) {
    const bearbeitbar = !!ctx.bearbeitbar;
    return (runs || []).map(r => {
      if (r.text != null) {
        let h = escHtml(r.text).replace(/\n/g, '<br>');
        if (r.text === '') h = '';
        if (r.b) h = `<strong>${h}</strong>`;
        if (r.i) h = `<em>${h}</em>`;
        return h;
      }
      const chip = (typ, beschriftung, daten, titel) => {
        const attrs = Object.entries(daten)
          .map(([k, v]) => ` data-${k}="${escHtml(v)}"`).join('');
        return `<span class="chip chip-${typ}"${bearbeitbar ? ' contenteditable="false"' : ''}` +
               `${titel ? ` title="${escHtml(titel)}"` : ''}` +
               ` data-typ="${typ}"${attrs}>${beschriftung}</span>`;
      };
      if (r.zitat) {
        const txt = escHtml(Zitate.imText(Zitate.quellenZu(r.zitat, ctx.quellen),
                                          r.form, r.seite, ctx.sprache));
        return chip('zitat', txt, { key: r.zitat, form: r.form || 'klammer', seite: r.seite || '' });
      }
      if (r.kennwert) {
        return chip('kennwert', `<i>${escHtml(r.kennwert)}</i>&nbsp;=&nbsp;${escHtml(r.wert)}`,
                    { sym: r.kennwert, wert: r.wert });
      }
      if (r.verweis) {
        const txt = ctx.verweisText ? ctx.verweisText(r.verweis) : 'Verweis';
        return chip('verweis', escHtml(txt), { ziel: r.verweis });
      }
      if (r.fussnote != null) {
        /* Der Text steckt sonst unsichtbar im data-Attribut -- die
           ersten Worte zeigen, welche Fußnote das ist. */
        const voll = String(r.fussnote).trim();
        const kurz = voll.length > 24 ? voll.slice(0, 24).trimEnd() + '…' : voll;
        return chip('fussnote', '¹ ' + (escHtml(kurz) || 'Fußnote'),
                    { text: r.fussnote }, voll);
      }
      return '';
    }).join('') || '';
  }

  /* ---------- HTML (contenteditable) -> Runs ---------- */
  function vonHtml(wurzel) {
    const raus = [];
    const schiebe = (run) => {
      const letzter = raus[raus.length - 1];
      if (run.text != null && letzter && letzter.text != null &&
          !!letzter.b === !!run.b && !!letzter.i === !!run.i) {
        letzter.text += run.text;                        // gleiche Formatierung -> zusammenfassen
      } else if (run.text === '' ) {
        /* leere Textstücke verwerfen */
      } else {
        raus.push(run);
      }
    };

    const lauf = (knoten, stil) => {
      for (const k of knoten.childNodes) {
        if (k.nodeType === 3) {                          // Textknoten
          /* Steuerzeichen gar nicht erst ins Modell lassen */
          schiebe({ text: k.nodeValue.replace(UNSICHTBAR, ''), ...stil });
          continue;
        }
        if (k.nodeType !== 1) continue;
        const tag = k.tagName.toLowerCase();

        if (k.classList && k.classList.contains('chip')) {
          const d = k.dataset;
          if (d.typ === 'zitat')    raus.push({ zitat: d.key, form: d.form || 'klammer',
                                                seite: d.seite || '' });
          if (d.typ === 'kennwert') raus.push({ kennwert: d.sym, wert: d.wert });
          if (d.typ === 'verweis')  raus.push({ verweis: d.ziel });
          if (d.typ === 'fussnote') raus.push({ fussnote: d.text });
          continue;
        }
        if (tag === 'br') { schiebe({ text: '\n', ...stil }); continue; }

        const neuerStil = { ...stil };
        if (tag === 'b' || tag === 'strong') neuerStil.b = true;
        if (tag === 'i' || tag === 'em')     neuerStil.i = true;
        /* Word bringt gern <span style="font-weight:700"> mit */
        if (k.style) {
          const g = k.style.fontWeight;
          if (g === 'bold' || (+g >= 600)) neuerStil.b = true;
          if (k.style.fontStyle === 'italic') neuerStil.i = true;
        }
        lauf(k, neuerStil);
      }
    };

    lauf(wurzel, {});
    /* Aufräumen: Stilflaggen nur setzen, wenn true */
    return raus.map(r => {
      const c = { ...r };
      if (!c.b) delete c.b;
      if (!c.i) delete c.i;
      delete c.platzhalter;
      return c;
    }).filter(r => r.text !== '' || r.zitat || r.kennwert || r.verweis || r.fussnote != null);
  }

  /* Das Argument von \footnote verträgt keinen Absatz: eine Leerzeile
     im Fußnotentext beendete ihn mitten in der Klammer, LaTeX meldete
     das als nicht geschlossene Klammer, und die Übersetzung schickte
     die Nutzerin zum Zählen von Klammern in einer Formel, die es gar
     nicht gab. Das Eingabefeld ist mehrzeilig, der Fall also nicht
     ausgedacht. Mehrabsätzige Fußnoten kann der Schreibtisch noch
     nicht -- bis dahin wird aus jedem Absatzwechsel ein Zeilenumbruch,
     und leere Zeilen am Rand fallen weg (ein \\ am Anfang wäre der
     nächste Fehler). */
  function fussnoteLatex(text) {
    return escLatex(String(text || ''))
      .split(/\n+/).map(z => z.trim()).filter(Boolean).join('\\\\ ');
  }

  /* ---------- Runs -> LaTeX ---------- */
  function zuLatex(runs, ctx = {}) {
    return (runs || []).map(r => {
      if (r.text != null) {
        let t = escLatex(r.text).replace(/\n/g, '\\\\\n');
        if (r.b) t = `\\textbf{${t}}`;
        if (r.i) t = `\\textit{${t}}`;
        return t;
      }
      if (r.zitat) {
        /* Mehrere Schlüssel gibt man biblatex am Stück -- es ordnet und
           trennt sie selbst. Eine Seitenzahl gehört dann zu keiner der
           Quellen eindeutig, also bleibt sie weg. */
        const schluessel = Zitate.schluesselliste(r.zitat);
        if (!schluessel.length) return '';
        const key = schluessel.join(',');
        if (r.seite && schluessel.length === 1) {
          return r.form === 'narrativ'
            ? `\\autorzitS{${key}}{${escLatex(r.seite)}}`
            : `\\zitS{${key}}{${escLatex(r.seite)}}`;
        }
        return r.form === 'narrativ' ? `\\autorzit{${key}}` : `\\zit{${key}}`;
      }
      if (r.kennwert) return `\\kennwert{${escLatex(r.kennwert)}}{${escLatex(r.wert)}}`;
      if (r.verweis)  return ctx.verweisLatex ? ctx.verweisLatex(r.verweis) : '';
      if (r.fussnote != null) return `\\footnote{${fussnoteLatex(r.fussnote)}}`;
      return '';
    }).join('');
  }

  /* Aus einfachem Text Runs machen (z. B. beim Import) */
  const vonText = (t) => (t ? [{ text: String(t) }] : []);

  return { zuHtml, vonHtml, zuText, zuLatex, vonText, escLatex };
})();
