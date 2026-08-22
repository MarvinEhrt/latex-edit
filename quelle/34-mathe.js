/* ===================================================================
   34-mathe.js  --  LaTeX-Formeln  ->  MathML (für die Vorschau)
   -------------------------------------------------------------------
   Die Formelvorschau im Editor und im Formeldialog. Browser setzen
   MathML von Haus aus (Chrome ab 109, Firefox, Safari) -- deshalb
   braucht es keine Bibliothek und kein Internet, und die Oberfläche
   bleibt eine einzige Datei.

   Gesetzt wird der Teil von LaTeX, den wissenschaftliche Arbeiten
   brauchen: Brüche, Wurzeln, Indizes, Summen, griechische Buchstaben,
   Akzente, Matrizen, Fallunterscheidungen. Was die Vorschau nicht
   kennt, zeigt sie als Quelltext -- LaTeX selbst kann mehr, und das
   PDF bleibt maßgeblich.
   =================================================================== */

const Mathe = (() => {

  /* ---------------- Zeichentabellen ---------------- */

  const GRIECHISCH = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ',
    varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ',
    iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ',
    pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ',
    varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ',
    chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ',
    Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω'
  };

  /* Symbole, die als Operator (mit Abstand drumherum) gesetzt werden */
  const OPERATOREN = {
    pm: '±', mp: '∓', times: '×', div: '÷', cdot: '·', ast: '∗',
    leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠',
    approx: '≈', sim: '∼', simeq: '≃', propto: '∝', equiv: '≡',
    ll: '≪', gg: '≫', in: '∈', notin: '∉', ni: '∋',
    subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
    cup: '∪', cap: '∩', setminus: '∖', mid: '∣', parallel: '∥',
    perp: '⊥', wedge: '∧', vee: '∨', land: '∧', lor: '∨', neg: '¬',
    oplus: '⊕', otimes: '⊗', circ: '∘', bullet: '∙', star: '⋆',
    rightarrow: '→', to: '→', leftarrow: '←', gets: '←',
    leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐',
    Leftrightarrow: '⇔', mapsto: '↦', uparrow: '↑', downarrow: '↓',
    forall: '∀', exists: '∃', cong: '≅', doteq: '≐'
  };

  /* Symbole ohne Operatorabstand */
  const ZEICHEN = {
    infty: '∞', partial: '∂', nabla: '∇', emptyset: '∅',
    varnothing: '∅', angle: '∠', prime: '′', hbar: 'ℏ', ell: 'ℓ',
    Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', wp: '℘', surd: '√', top: '⊤',
    bot: '⊥', degree: '°', percent: '%',
    ldots: '…', dots: '…', dotsc: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱'
  };

  /* Große Operatoren: Grenzen stehen im Blocksatz darunter/darüber */
  const GROSSE = {
    sum: '∑', prod: '∏', coprod: '∐',
    bigcup: '⋃', bigcap: '⋂', bigoplus: '⨁', bigotimes: '⨂'
  };
  /* Integrale: Grenzen stehen daneben, auch im Blocksatz */
  const INTEGRALE = { int: '∫', iint: '∬', iiint: '∭', oint: '∮' };

  /* Funktionsnamen: aufrecht, wie \sin in LaTeX */
  const FUNKTIONEN = [
    'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
    'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'coth',
    'exp', 'ln', 'log', 'lg', 'det', 'dim', 'ker', 'deg', 'arg',
    'gcd', 'hom', 'Pr'
  ];
  /* Wie Funktionen, aber die Grenze steht darunter (\lim_{n \to \infty}) */
  const GRENZWERTE = ['lim', 'liminf', 'limsup', 'inf', 'sup', 'max', 'min'];

  const AKZENTE = {
    bar: '¯', overline: '¯', hat: '^', widehat: '^', vec: '→',
    overrightarrow: '→', tilde: '~', widetilde: '~', dot: '˙',
    ddot: '¨', check: 'ˇ', breve: '˘', acute: '´', grave: '`'
  };
  const UNTERAKZENTE = { underline: '_' };

  const ABSTAENDE = { ',': '0.17em', ':': '0.22em', ';': '0.28em',
                      quad: '1em', qquad: '2em', ' ': '0.25em' };

  /* Befehle, die nur den Satz steuern und in der Vorschau entfallen */
  const IGNORIERT = new Set([
    'displaystyle', 'textstyle', 'scriptstyle', 'scriptscriptstyle',
    'limits', 'nolimits', 'left.', 'right.', 'mathstrut', 'strut',
    'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr',
    'biggl', 'biggr', 'Biggl', 'Biggr', 'bigm', 'Bigm',
    'thinspace', 'negthinspace', '!', 'noindent', 'allowbreak'
  ]);

  const SCHRIFTEN = {
    mathrm: 'normal', text: 'text', textrm: 'text', mbox: 'text',
    operatorname: 'normal', mathit: 'italic', textit: 'text-italic',
    mathbf: 'bold', textbf: 'text-bold', boldsymbol: 'bold-italic',
    mathsf: 'sans-serif', mathtt: 'monospace', mathcal: 'script',
    mathbb: 'double-struck', mathfrak: 'fraktur'
  };

  const KLAMMERN = {
    '(': '(', ')': ')', '[': '[', ']': ']',
    '\\{': '{', '\\}': '}', '|': '|', '\\|': '‖',
    'langle': '⟨', 'rangle': '⟩', 'lceil': '⌈', 'rceil': '⌉',
    'lfloor': '⌊', 'rfloor': '⌋', '.': ''
  };

  const UMGEBUNGEN = {
    matrix:  { auf: '',  zu: '',  ausrichtung: 'center' },
    pmatrix: { auf: '(', zu: ')', ausrichtung: 'center' },
    bmatrix: { auf: '[', zu: ']', ausrichtung: 'center' },
    Bmatrix: { auf: '{', zu: '}', ausrichtung: 'center' },
    vmatrix: { auf: '|', zu: '|', ausrichtung: 'center' },
    Vmatrix: { auf: '‖', zu: '‖', ausrichtung: 'center' },
    cases:   { auf: '{', zu: '',  ausrichtung: 'left' },
    aligned:  { auf: '', zu: '', ausrichtung: 'left' },
    gathered: { auf: '', zu: '', ausrichtung: 'center' },
    array:    { auf: '', zu: '', ausrichtung: 'center', spaltenangabe: true },
    smallmatrix: { auf: '', zu: '', ausrichtung: 'center' }
  };

  class FormelFehler extends Error {}

  const escXml = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ---------------- Zerteilen ---------------- */

  function zerteile(tex) {
    const t = [];
    const s = String(tex || '');
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '\\') {
        const rest = s.slice(i + 1);
        const wort = rest.match(/^[a-zA-Z]+/);
        if (wort) { t.push({ art: 'befehl', wert: wort[0] }); i += 1 + wort[0].length; continue; }
        const zeichen = rest[0];
        if (zeichen === '\\') { t.push({ art: 'umbruch' }); i += 2; continue; }
        if (zeichen == null) throw new FormelFehler(
          'Die Formel endet mitten in einem Befehl (einzelner \\ am Schluss).');
        /* \{ \} \, \; \: \! \| \% \_ \& \# \$ und \<Leerzeichen> */
        t.push({ art: 'befehl', wert: zeichen });
        i += 2;
        continue;
      }
      if (c === '{') { t.push({ art: 'auf' }); i++; continue; }
      if (c === '}') { t.push({ art: 'zu' }); i++; continue; }
      if (c === '^' || c === '_') { t.push({ art: c }); i++; continue; }
      if (c === '&') { t.push({ art: 'spalte' }); i++; continue; }
      /* Leerraum trennt in Mathe nichts -- aber in \text{…} zählt er.
         Deshalb bleibt er als eigenes Token erhalten; überall sonst
         überlesen ihn naechster()/nimm().                            */
      if (/\s/.test(c)) {
        while (i < s.length && /\s/.test(s[i])) i++;
        t.push({ art: 'raum' });
        continue;
      }
      if (/[0-9]/.test(c)) {
        const zahl = s.slice(i).match(/^[0-9]+(?:[.][0-9]+)*/)[0];
        t.push({ art: 'zahl', wert: zahl });
        i += zahl.length;
        continue;
      }
      t.push({ art: 'zeichen', wert: c });
      i++;
    }
    return t;
  }

  /* ---------------- Übersetzen ---------------- */

  function uebersetze(tex, block) {
    const token = zerteile(tex);
    let p = 0;

    const naechster = () => {
      while (token[p] && token[p].art === 'raum') p++;
      return token[p] || null;
    };
    const nimm = () => { const t = naechster(); if (t) p++; return t; };

    const m = (tag, inhalt, attr) => {
      const a = attr ? Object.entries(attr)
        .map(([k, v]) => ` ${k}="${escXml(v)}"`).join('') : '';
      return `<${tag}${a}>${inhalt}</${tag}>`;
    };
    const mrow = (teile) =>
      teile.length === 1 ? teile[0] : m('mrow', teile.join(''));

    /* Eine Gruppe {…} oder ein einzelnes Element -- das Argument eines
       Befehls wie \frac oder \sqrt. */
    function argument(wofuer) {
      const t = naechster();
      if (!t) throw new FormelFehler(`Nach \\${wofuer} fehlt etwas: der Befehl braucht noch eine Angabe in {…}.`);
      if (t.art === 'auf') { nimm(); return mrow(folge(['zu'], `{ nach \\${wofuer}`)); }
      return element();
    }

    /* Argument als reiner Text (für \text{…} und Verwandte) */
    function textArgument(wofuer) {
      const t = naechster();
      if (!t) throw new FormelFehler(`Nach \\${wofuer} fehlt der Text in {…}.`);
      if (t.art !== 'auf') { return elementRoh(); }
      nimm();
      let tiefe = 1, raus = '';
      while (p < token.length) {
        const k = token[p++];                    // roh: hier zählt der Leerraum
        if (k.art === 'raum') { raus += ' '; continue; }
        if (k.art === 'auf') { tiefe++; raus += '{'; continue; }
        if (k.art === 'zu') { tiefe--; if (!tiefe) return raus; raus += '}'; continue; }
        if (k.art === 'befehl') { raus += (ABSTAENDE[k.wert] || k.wert.length > 1) ? ' ' : k.wert; continue; }
        if (k.art === 'zahl' || k.art === 'zeichen') { raus += k.wert; continue; }
        if (k.art === '^') raus += '^';
        if (k.art === '_') raus += '_';
      }
      throw new FormelFehler(`Der Text nach \\${wofuer} wird nicht geschlossen (} fehlt).`);
    }

    function elementRoh() {
      const t = nimm();
      if (t.art === 'zahl' || t.art === 'zeichen') return t.wert;
      return '';
    }

    /* Klammername hinter \left oder \right */
    function klammer(wofuer) {
      const t = nimm();
      if (!t) throw new FormelFehler(`Nach \\${wofuer} fehlt die Klammer, z. B. \\${wofuer}(.`);
      if (t.art === 'zeichen' && KLAMMERN[t.wert] != null) return KLAMMERN[t.wert];
      if (t.art === 'zeichen' && t.wert === '.') return '';
      if (t.art === 'befehl') {
        if (KLAMMERN['\\' + t.wert] != null) return KLAMMERN['\\' + t.wert];
        if (KLAMMERN[t.wert] != null) return KLAMMERN[t.wert];
      }
      throw new FormelFehler(`Nach \\${wofuer} steht keine Klammer, die ich kenne.`);
    }

    /* Eine Folge von Elementen bis zu einem Endzeichen. `bis` nennt
       die Token-Arten, die die Folge beenden (und verzehrt werden). */
    function folge(bis, offenName) {
      const teile = [];
      const zeilen = [];      // bei \\ auf oberster Ebene
      const zellen = [];      // bei & auf oberster Ebene
      for (;;) {
        const t = naechster();
        if (!t) {
          if (bis.includes(null)) break;
          throw new FormelFehler(`Eine Klammer wird nicht geschlossen (${offenName || '{'} … ohne }).`);
        }
        if (bis.includes(t.art)) { nimm(); break; }
        if (t.art === 'zu') throw new FormelFehler('Da steht eine schließende Klammer } zu viel.');
        if (t.art === 'umbruch') { nimm(); zeilen.push(zellenZeile(zellen, teile)); continue; }
        if (t.art === 'spalte') { nimm(); zellen.push(teile.splice(0).join('')); continue; }
        teile.push(element());
      }
      if (zeilen.length || zellen.length) {
        zeilen.push(zellenZeile(zellen, teile));
        return [m('mtable', zeilen.join(''), { class: 'formel-zeilen' })];
      }
      return teile;
    }

    const zellenZeile = (zellen, teile) => {
      zellen.push(teile.splice(0).join(''));
      const zs = zellen.splice(0);
      return m('mtr', zs.map(z => m('mtd', z || m('mrow', ''))).join(''));
    };

    /* Umgebung \begin{…} … \end{…} */
    function umgebung() {
      const name = textArgument('begin').trim();
      const def = UMGEBUNGEN[name];
      if (!def) throw new FormelFehler(`Die Umgebung \\begin{${name}} kennt die Vorschau nicht.`);
      if (def.spaltenangabe && naechster() && naechster().art === 'auf') textArgument('begin');
      const zeilen = [];
      let zellen = [], teile = [];
      for (;;) {
        const t = naechster();
        if (!t) throw new FormelFehler(`\\begin{${name}} wird nie mit \\end{${name}} geschlossen.`);
        if (t.art === 'befehl' && t.wert === 'end') {
          nimm();
          const ende = textArgument('end').trim();
          if (ende !== name) throw new FormelFehler(
            `\\begin{${name}} wird mit \\end{${ende}} geschlossen — die Namen müssen gleich sein.`);
          break;
        }
        if (t.art === 'umbruch') { nimm(); zeilen.push(zellenZeile(zellen, teile)); continue; }
        if (t.art === 'spalte') { nimm(); zellen.push(teile.splice(0).join('')); continue; }
        teile.push(element());
      }
      if (teile.length || zellen.length) zeilen.push(zellenZeile(zellen, teile));
      const tabelle = m('mtable', zeilen.join(''),
        def.ausrichtung === 'left' ? { class: 'formel-links' } : {});
      const auf = def.auf ? m('mo', escXml(def.auf), { stretchy: 'true', fence: 'true' }) : '';
      const zu = def.zu ? m('mo', escXml(def.zu), { stretchy: 'true', fence: 'true' }) : '';
      return (auf || zu) ? m('mrow', auf + tabelle + zu) : tabelle;
    }

    /* Ein Element samt eventuellem ^ und _ */
    function element() {
      let basis = kern();
      let hoch = null, tief = null, untenOben = false;
      for (;;) {
        const t = naechster();
        if (t && t.art === '^') {
          nimm();
          if (hoch != null) throw new FormelFehler('Zweimal ^ hintereinander — Exponenten in {…} bündeln, z. B. x^{a+b}.');
          hoch = argument('^');
        } else if (t && t.art === '_') {
          nimm();
          if (tief != null) throw new FormelFehler('Zweimal _ hintereinander — Indizes in {…} bündeln, z. B. x_{i,j}.');
          tief = argument('_');
        } else break;
      }
      if (basis && basis.untenOben) { untenOben = true; basis = basis.mathml; }
      if (hoch == null && tief == null) return basis;
      if (untenOben && block) {
        if (hoch != null && tief != null) return m('munderover', basis + tief + hoch);
        if (tief != null) return m('munder', basis + tief);
        return m('mover', basis + hoch);
      }
      if (hoch != null && tief != null) return m('msubsup', basis + tief + hoch);
      if (tief != null) return m('msub', basis + tief);
      return m('msup', basis + hoch);
    }

    /* Der Kern eines Elements, ohne ^/_ */
    function kern() {
      const t = nimm();

      if (t.art === 'auf') return mrow(folge(['zu'], '{'));
      if (t.art === 'zahl') return m('mn', escXml(t.wert));
      if (t.art === 'zeichen') {
        const c = t.wert;
        if (/[a-zA-Z]/.test(c)) return m('mi', c);
        if (c === "'") return m('mo', '′', { lspace: '0', rspace: '0' });
        if ('+−-=<>*/!,;:.?%'.includes(c))
          return m('mo', escXml(c === '-' ? '−' : c));
        if ('()[]|'.includes(c)) return m('mo', escXml(c), { stretchy: 'false' });
        if (c === '$') return '';                 // $ hat im Formelmodus nichts verloren
        return m('mi', escXml(c));
      }

      if (t.art === '^' || t.art === '_') throw new FormelFehler(
        `Ein ${t.art} braucht etwas davor, z. B. x${t.art}{2}.`);
      if (t.art === 'zu') throw new FormelFehler('Da steht eine schließende Klammer } zu viel.');
      if (t.art === 'umbruch' || t.art === 'spalte') return '';

      /* ---- Befehle ---- */
      const b = t.wert;

      if (IGNORIERT.has(b)) return kernOderLeer();
      if (b === 'begin') return umgebung();
      if (b === 'end') throw new FormelFehler('\\end ohne zugehöriges \\begin.');

      if (GRIECHISCH[b]) return m('mi', GRIECHISCH[b]);
      if (OPERATOREN[b]) return m('mo', OPERATOREN[b]);
      if (ZEICHEN[b]) return m('mi', ZEICHEN[b], { mathvariant: 'normal' });
      if (GROSSE[b]) return { untenOben: true,
        mathml: m('mo', GROSSE[b], { largeop: 'true', movablelimits: 'false' }) };
      if (INTEGRALE[b]) return m('mo', INTEGRALE[b], { largeop: 'true' });
      if (FUNKTIONEN.includes(b)) return m('mi', b, { mathvariant: 'normal' });
      if (GRENZWERTE.includes(b)) return { untenOben: true,
        mathml: m('mo', b, { movablelimits: 'false' }) };
      if (ABSTAENDE[b]) return m('mspace', '', { width: ABSTAENDE[b] });

      if (b === 'frac' || b === 'dfrac' || b === 'tfrac') {
        const oben = argument(b), unten = argument(b);
        return m('mfrac', oben + unten);
      }
      if (b === 'binom') {
        const oben = argument(b), unten = argument(b);
        return m('mrow',
          m('mo', '(', { stretchy: 'true' }) +
          m('mfrac', oben + unten, { linethickness: '0' }) +
          m('mo', ')', { stretchy: 'true' }));
      }
      if (b === 'sqrt') {
        const nt = naechster();
        if (nt && nt.art === 'zeichen' && nt.wert === '[') {
          nimm();
          const grad = [];
          while (naechster() && !(naechster().art === 'zeichen' && naechster().wert === ']'))
            grad.push(element());
          if (!naechster()) throw new FormelFehler('Bei \\sqrt[…] fehlt die schließende eckige Klammer ].');
          nimm();
          return m('mroot', mrow([argument('sqrt')]) + mrow(grad));
        }
        return m('msqrt', argument('sqrt'));
      }
      if (AKZENTE[b]) return m('mover',
        argument(b) + m('mo', AKZENTE[b], { stretchy: b.startsWith('wide') || b.startsWith('over') ? 'true' : 'false' }),
        { accent: 'true' });
      if (UNTERAKZENTE[b]) return m('munder',
        argument(b) + m('mo', '‾', { stretchy: 'true' }), { accentunder: 'true' });

      if (b === 'left') {
        const auf = klammer('left');
        const innen = [];
        for (;;) {
          const nt = naechster();
          if (!nt) throw new FormelFehler('\\left ohne zugehöriges \\right.');
          if (nt.art === 'befehl' && nt.wert === 'right') { nimm(); break; }
          innen.push(element());
        }
        const zu = klammer('right');
        return m('mrow',
          (auf ? m('mo', escXml(auf), { stretchy: 'true', fence: 'true' }) : '') +
          innen.join('') +
          (zu ? m('mo', escXml(zu), { stretchy: 'true', fence: 'true' }) : ''));
      }
      if (b === 'right') throw new FormelFehler('\\right ohne zugehöriges \\left.');

      if (SCHRIFTEN[b]) {
        const art = SCHRIFTEN[b];
        if (art === 'text' || art === 'text-italic' || art === 'text-bold') {
          const stil = art === 'text-italic' ? { mathvariant: 'italic' }
                     : art === 'text-bold' ? { mathvariant: 'bold' } : {};
          return m('mtext', escXml(textArgument(b)), stil);
        }
        const inhalt = textArgument(b);
        return m('mi', escXml(inhalt), { mathvariant: art === 'normal' ? 'normal' : art });
      }

      if (b === 'operatorname') return m('mi', escXml(textArgument(b)), { mathvariant: 'normal' });

      /* \{  \}  \%  \_  \&  \#  \$  \|  \<Leerzeichen> */
      if ('{}%_&#$'.includes(b)) return m(b === '_' ? 'mi' : 'mo', escXml(b));
      if (b === '|') return m('mo', '‖');

      if (b === 'not') {
        const inner = kern();
        return String(inner).replace(/>([^<]*)<\/mo>$/, (x, w) => `>${w}̸</mo>`);
      }

      throw new FormelFehler(`Den Befehl \\${b} kennt die Vorschau nicht.`);
    }

    const kernOderLeer = () => (naechster() ? element() : '');

    const teile = folge([null]);
    return `<math xmlns="http://www.w3.org/1998/Math/MathML"` +
           ` display="${block ? 'block' : 'inline'}">${mrow(teile)}</math>`;
  }

  /* ---------------- Öffentliche Helfer ---------------- */

  /* MathML oder null (leere Formel). Wirft FormelFehler bei Unlesbarem. */
  function zuMathml(tex, block) {
    const t = String(tex || '').trim();
    if (!t) return null;
    return uebersetze(t, !!block);
  }

  /* Vorschau mit Rückfall: was nicht lesbar ist, erscheint als
     Quelltext -- die Formel kann trotzdem gültiges LaTeX sein.       */
  function vorschauHtml(tex, block) {
    try {
      const mathml = zuMathml(tex, block);
      if (!mathml) return { html: '', fehler: null };
      return { html: mathml, fehler: null };
    } catch (f) {
      return { html: `<code class="formel-quelltext">${escHtml(tex)}</code>`,
               fehler: f.message };
    }
  }

  /* Nimmt Formeln, wie Leute sie einfügen: mit $…$, $$…$$, \[…\]
     oder \(…\) drumherum. Der Rahmen kommt vom Schreibtisch selbst --
     doppelt gemoppelt bräche den Bau.                                */
  function normalisiere(tex) {
    let t = String(tex || '').trim();
    for (;;) {
      const vorher = t;
      if (t.startsWith('$$') && t.endsWith('$$') && t.length > 3) t = t.slice(2, -2).trim();
      else if (t.startsWith('$') && t.endsWith('$') && t.length > 1) t = t.slice(1, -1).trim();
      else if (t.startsWith('\\[') && t.endsWith('\\]')) t = t.slice(2, -2).trim();
      else if (t.startsWith('\\(') && t.endsWith('\\)')) t = t.slice(2, -2).trim();
      if (t === vorher) return t;
    }
  }

  /* Was stimmt an dieser Formel nicht? Deutsche Meldungen, ohne auf
     LaTeX zu warten. Erst die Klammerzählung (präzise Meldungen),
     dann der Übersetzer (unbekannte Befehle, kaputte Struktur).      */
  function pruefe(tex) {
    const t = String(tex || '');
    const meldungen = [];
    let tiefe = 0, dollar = 0, links = 0;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '\\') {
        const wort = (t.slice(i + 1).match(/^[a-zA-Z]+/) || [''])[0];
        if (wort === 'left') links++;
        if (wort === 'right') links--;
        i += Math.max(1, wort.length);
        continue;
      }
      if (c === '{') tiefe++;
      else if (c === '}') tiefe--;
      else if (c === '$') dollar++;
      if (tiefe < 0) break;
    }
    if (tiefe > 0) meldungen.push(tiefe === 1
      ? 'Eine schließende Klammer } fehlt.'
      : `${tiefe} schließende Klammern } fehlen.`);
    else if (tiefe < 0) meldungen.push('Eine schließende Klammer } steht zu viel da.');
    if (dollar) meldungen.push('Ein $ hat hier nichts verloren — die Formel ist schon Mathematik, LaTeX bräche ab.');
    if (links > 0) meldungen.push('Zu \\left fehlt das zugehörige \\right.');
    if (links < 0) meldungen.push('Zu \\right fehlt das zugehörige \\left.');

    if (!meldungen.length) {
      try { zuMathml(t, true); }
      catch (f) {
        if (f instanceof FormelFehler) meldungen.push(f.message);
      }
    }
    return meldungen;
  }

  /* Steht auf oberster Ebene (außerhalb von \begin…\end) ein \\ ?
     Dann braucht das LaTeX eine gathered-Umgebung -- ein rohes \\ in
     \[…\] bricht den Bau.                                            */
  function mehrzeilig(tex) {
    const ohne = String(tex || '').replace(/\\begin\{[^}]*\}[\s\S]*?\\end\{[^}]*\}/g, '');
    return /\\\\/.test(ohne);
  }

  return { zuMathml, vorschauHtml, normalisiere, pruefe, mehrzeilig };
})();
