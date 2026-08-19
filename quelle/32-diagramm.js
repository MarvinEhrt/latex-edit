/* ===================================================================
   32-diagramm.js  --  Diagramme als pgfplots-Code
   -------------------------------------------------------------------
   Vier Arten für empirische Arbeiten. Gesetzt wird direkt in LaTeX:
   Vektorgrafik, Dokumentschrift, keine Abweichung zwischen Ansicht und
   Druck.

   Zur Farbwahl: die vier Reihenfarben sind mit dem Prüfskript der
   dataviz-Anleitung geprüft (schlechtestes Nachbarpaar ΔE 17,0 bei
   Deuteranopie, Normalsicht 26,0, Kontrast überall über 3:1). Im
   GRAUSTUFENDRUCK fallen sie dennoch zusammen -- Ocker und Grün haben
   fast dieselbe Helligkeit. Deshalb unterscheiden sich Reihen immer
   ZUSÄTZLICH in Symbol und Strichart, und der Graustufenmodus stuft
   die Helligkeit und legt Füllmuster darüber.
   =================================================================== */

const Diagramm = (() => {

  /* Feste Reihenfolge, wird nie durchgereicht oder gewürfelt. */
  const FARBEN = ['3B6FB6', 'C77A18', '8055A8', '2F9E6E'];
  const GRAUSTUFEN = ['black!72', 'black!18', 'black!45', 'black!5'];
  const MUSTER = ['north east lines', 'crosshatch', 'dots', 'horizontal lines'];
  const SYMBOLE = ['*', 'square*', 'triangle*', 'diamond*'];
  const STRICHE = ['solid', 'dashed', 'dotted', 'dashdotted'];

  const z = (n, stellen = 4) =>
    (Number.isFinite(n) ? Number(n.toFixed(stellen)) : 0);

  const esc = (t) => Richtext.escLatex(String(t == null ? '' : t));

  /* ---------- Datenbeschaffung ---------- */

  /* Entweder eigene Zahlen im Baustein oder ein Verweis auf eine
     Tabelle im Dokument. Beim Verweis wird nichts kopiert -- ändert
     sich die Tabelle, ändert sich das Diagramm mit. */
  function gitterVon(block, dok) {
    if (block.quelle === 'tabelle' && block.tabelleId) {
      const t = (dok.bloecke || []).find(b => b.id === block.tabelleId);
      if (t && t.typ === 'tabelle')
        return { kopf: t.kopf || [], zeilen: t.zeilen || [] };
      return null;
    }
    const d = block.daten || {};
    return { kopf: d.kopf || [], zeilen: d.zeilen || [] };
  }

  function wertSpalten(block, gitter) {
    const alle = (gitter.kopf || []).map((_, i) => i);
    const gewaehlt = (block.wertSpalten || []).filter(i => alle.includes(i));
    if (gewaehlt.length) return gewaehlt;
    return alle.filter(i => i !== (block.xSpalte || 0)).slice(0, 4);
  }

  /* ---------- Reihenstil ---------- */

  /* art: 'flaeche' (Balken), 'linie', 'box'
     Wichtig: alles ausdrücklich setzen. \\addplot+ erbt sonst Farbe und
     Symbol aus dem Standardzyklus von pgfplots, und dann steht ein rotes
     Quadrat in einer Reihe, die ocker sein sollte. */
  function stil(block, nr, art) {
    const i = nr % 4;
    const grau = ['black!85', 'black!55', 'black!70', 'black!40'][i];
    const farbe = block.graustufen ? grau : `reihe${i}`;

    if (art === 'flaeche') {
      return block.graustufen
        ? `draw=black!70, fill=${GRAUSTUFEN[i]}, pattern=${MUSTER[i]}, ` +
          'pattern color=black!45, mark=none'
        : `draw=${farbe}!70!black, fill=${farbe}, mark=none`;
    }
    if (art === 'box') {
      /* Ausreißer immer schlicht und einheitlich -- sie sind Datenpunkte,
         keine eigene Reihe. */
      const fuellung = block.graustufen
        ? `fill=${GRAUSTUFEN[i]}, pattern=${MUSTER[i]}, pattern color=black!45`
        : `fill=${farbe}!30`;
      return `draw=${block.graustufen ? 'black!70' : farbe + '!70!black'}, ${fuellung}, ` +
             'mark=*, mark size=1.6pt, mark options={fill=black!60, draw=black!60}';
    }
    return `color=${farbe}, ${STRICHE[i]}, mark=${SYMBOLE[i]}, ` +
           `mark options={fill=${farbe}, draw=${farbe}}`;
  }

  /* ---------- Balken mit Fehlerbalken ---------- */

  function balken(block, gitter) {
    const spalten = wertSpalten(block, gitter);
    const x = block.xSpalte || 0;
    const namen = Daten.spalteRoh(gitter.zeilen, x);
    const zeilen = [];

    /* Zwischen zwei Flächen gehört ein Spalt, sonst verschmelzen sie
       beim Betrachten zu einer.                                        */
    zeilen.push(spalten.length > 1 ? '  ybar=2.5pt,' : '  ybar,');
    zeilen.push(`  bar width=${spalten.length > 1 ? '10pt' : '18pt'},`);
    zeilen.push(`  symbolic x coords={${namen.map(esc).join(', ')}},`);
    zeilen.push('  xtick=data,');
    zeilen.push('  enlarge x limits=0.15,');
    zeilen.push('  ymin=0,');

    const koerper = [];
    spalten.forEach((s, nr) => {
      const werte = gitter.zeilen.map(r => Daten.zahl(r[s]));
      const fehler = block.fehlerSpalte != null
        ? gitter.zeilen.map(r => Daten.zahl(r[block.fehlerSpalte])) : null;
      const punkte = namen.map((n, i) => {
        const w = werte[i];
        if (w == null) return null;
        const e = fehler && fehler[i] != null ? fehler[i] : null;
        return `(${esc(n)}, ${z(w)})` +
               (e != null ? ` +- (0, ${z(e)})` : '');
      }).filter(Boolean);
      const fehlerstil = fehler
        ? ', error bars/.cd, y dir=both, y explicit, ' +
          'error bar style={black!65, line width=0.4pt}, error mark options={mark size=2pt}'
        : '';
      koerper.push(`\\addplot+[${stil(block, nr, 'flaeche')}${fehlerstil}] coordinates {${punkte.join(' ')}};`);
      if (spalten.length > 1)
        koerper.push(`\\addlegendentry{${esc(gitter.kopf[s] || 'Reihe ' + (nr + 1))}}`);
    });
    return { achse: zeilen, koerper };
  }

  /* ---------- Linie und Profil ---------- */

  function linie(block, gitter) {
    const spalten = wertSpalten(block, gitter);
    const x = block.xSpalte || 0;
    const namen = Daten.spalteRoh(gitter.zeilen, x);
    const zahlenAchse = namen.every(n => Daten.istZahl(n));
    const zeilen = [];

    if (zahlenAchse) {
      zeilen.push('  xtick=data,');
    } else {
      zeilen.push(`  symbolic x coords={${namen.map(esc).join(', ')}},`);
      zeilen.push('  xtick=data,');
      zeilen.push('  enlarge x limits=0.08,');
    }

    const koerper = [];
    spalten.forEach((s, nr) => {
      const punkte = namen.map((n, i) => {
        const w = Daten.zahl(gitter.zeilen[i][s]);
        if (w == null) return null;
        return `(${zahlenAchse ? z(Daten.zahl(n)) : esc(n)}, ${z(w)})`;
      }).filter(Boolean);
      koerper.push(`\\addplot+[${stil(block, nr, 'linie')}, mark size=2.2pt] coordinates {${punkte.join(' ')}};`);
      if (spalten.length > 1)
        koerper.push(`\\addlegendentry{${esc(gitter.kopf[s] || 'Reihe ' + (nr + 1))}}`);
    });
    return { achse: zeilen, koerper };
  }

  /* ---------- Streudiagramm mit Ausgleichsgerade ---------- */

  function regression(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 3) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) ** 2;
      syy += (ys[i] - my) ** 2;
    }
    if (!sxx || !syy) return null;
    const steigung = sxy / sxx;
    return { steigung, achsenabschnitt: my - steigung * mx,
             r: sxy / Math.sqrt(sxx * syy), n };
  }

  function streu(block, gitter) {
    const x = block.xSpalte || 0;
    const y = wertSpalten(block, gitter)[0];
    const paare = gitter.zeilen
      .map(r => [Daten.zahl(r[x]), Daten.zahl(r[y])])
      .filter(([a, b]) => a != null && b != null);
    const xs = paare.map(p => p[0]), ys = paare.map(p => p[1]);

    const koerper = [`\\addplot+[only marks, ${stil(block, 0, 'linie')}, ` +
                     `mark size=2.2pt, forget plot] coordinates ` +
                     `{${paare.map(p => `(${z(p[0])}, ${z(p[1])})`).join(' ')}};`];

    const g = block.regression === false ? null : regression(xs, ys);
    if (g) {
      const von = Math.min(...xs), bis = Math.max(...xs);
      const bei = (v) => z(g.achsenabschnitt + g.steigung * v);
      koerper.push('\\addplot[black!62, thick, forget plot] coordinates ' +
                   `{(${z(von)}, ${bei(von)}) (${z(bis)}, ${bei(bis)})};`);
    }
    return { achse: ['  enlarge x limits=0.08,', '  enlarge y limits=0.08,'],
             koerper, kennwert: g };
  }

  /* ---------- Boxplot ---------- */

  function box(block, gitter) {
    const spalten = wertSpalten(block, gitter);
    const zeilen = [
      '  boxplot/draw direction=y,',
      /* Ohne diese beiden Maße füllt pgfplots die ganze Kategorienbreite
         aus -- die Kästen wirken dann wie Balken, nicht wie Boxplots. */
      '  boxplot/box extend=0.34,',
      '  boxplot/whisker extend=0.17,',
      `  xtick={${spalten.map((_, i) => i + 1).join(',')}},`,
      `  xticklabels={${spalten.map(s => esc(gitter.kopf[s] || '')).join(', ')}},`,
      '  enlarge x limits=0.35,',
      '  enlarge y limits=0.10,'
    ];
    const koerper = [];
    spalten.forEach((s, nr) => {
      const k = Daten.kennwerte(Daten.spalte(gitter.zeilen, s));
      if (!k) return;
      /* Whisker nach Tukey: höchstens 1,5 Quartilsabstände */
      const spanne = k.q3 - k.q1;
      const werte = Daten.spalte(gitter.zeilen, s);
      const unten = Math.min(...werte.filter(v => v >= k.q1 - 1.5 * spanne));
      const oben = Math.max(...werte.filter(v => v <= k.q3 + 1.5 * spanne));
      const ausreisser = werte.filter(v => v < unten || v > oben);
      koerper.push(
        `\\addplot+[${stil(block, nr, 'box')}, boxplot prepared={` +
        `lower whisker=${z(unten)}, lower quartile=${z(k.q1)}, ` +
        `median=${z(k.median)}, upper quartile=${z(k.q3)}, ` +
        `upper whisker=${z(oben)}}] ` +
        `coordinates {${ausreisser.map(v => `(0, ${z(v)})`).join(' ')}};`);
    });
    return { achse: zeilen, koerper };
  }

  /* ---------- Zusammensetzen ---------- */

  const BAUER = { balken, linie, streu, box };

  function zuLatex(block, dok) {
    const gitter = gitterVon(block, dok);
    if (!gitter || !gitter.zeilen.length)
      return { tex: '', hinweis: 'Diesem Diagramm fehlen die Zahlen.' };

    const bauer = BAUER[block.art] || balken;
    let teil;
    try {
      teil = bauer(block, gitter);
    } catch (f) {
      return { tex: '', hinweis: 'Die Zahlen passen nicht zur Diagrammart.' };
    }
    if (!teil.koerper.length)
      return { tex: '', hinweis: 'In den gewählten Spalten stehen keine Zahlen.' };

    const breite = ((block.breite || 85) / 100).toFixed(2);
    const kopf = [
      '\\begin{tikzpicture}',
      '\\begin{axis}[apadiagramm,',
      `  width=${breite}\\textwidth,`,
      `  height=${(block.hoehe || 6.4)}cm,`,
      block.achseX ? `  xlabel={${esc(block.achseX)}},` : '',
      block.achseY ? `  ylabel={${esc(block.achseY)}},` : '',
      ...teil.achse,
      ']'
    ].filter(Boolean);

    return {
      tex: [...kopf, ...teil.koerper, '\\end{axis}', '\\end{tikzpicture}'].join('\n'),
      kennwert: teil.kennwert
    };
  }

  /* Was nach APA 7 zwingend in die Anmerkung gehört, ergänze ich selbst --
     etwa welche Streuung die Fehlerbalken zeigen. Das vergisst man sonst. */
  /* Was APA 7 unter jeder Abbildung verlangt -- und was die Leserin
     ohnehin wissen muss, um die Grafik zu deuten. Steht im PDF, folgt
     also der Sprache der Arbeit.                                      */
  const ANMERKUNGSTEXTE = {
    de: {
      se: 'Fehlerbalken zeigen den Standardfehler des Mittelwerts.',
      sd: 'Fehlerbalken zeigen die Standardabweichung.',
      ci: 'Fehlerbalken zeigen das 95-%-Konfidenzintervall.',
      eigen: 'Fehlerbalken nach den Werten der gewählten Spalte.',
      box: 'Kästen zeigen das erste bis dritte Quartil mit dem Median; '
         + 'Antennen reichen bis höchstens dem 1,5-Fachen des '
         + 'Quartilsabstands, Punkte darüber hinaus sind Ausreißer.',
      gerade: (r, n) => `Die Gerade ist die lineare Ausgleichsgerade (r = ${r}, n = ${n}).`
    },
    en: {
      se: 'Error bars show the standard error of the mean.',
      sd: 'Error bars show the standard deviation.',
      ci: 'Error bars show the 95% confidence interval.',
      eigen: 'Error bars follow the values of the selected column.',
      box: 'Boxes show the first to third quartile with the median; '
         + 'whiskers extend to at most 1.5 times the interquartile range, '
         + 'points beyond are outliers.',
      gerade: (r, n) => `The line is the linear regression line (r = ${r}, n = ${n}).`
    }
  };

  function pflichtanmerkung(block, dok) {
    const en = ((dok && dok.einstellungen) || {}).sprache === 'en';
    const T = ANMERKUNGSTEXTE[en ? 'en' : 'de'];
    const teile = [];
    if (block.art === 'balken' && block.fehlerSpalte != null)
      teile.push(T[block.fehlerArt || 'se']);
    if (block.art === 'box') teile.push(T.box);
    if (block.art === 'streu' && block.regression !== false) {
      const g = zuLatex(block, dok).kennwert;
      if (g) {
        /* Im Deutschen das Komma, im Englischen der Punkt -- und die
           führende Null fällt bei r ohnehin weg. */
        const r = Daten.schreibe(g.r, 2).replace('0,', ',');
        teile.push(T.gerade(en ? r.replace(',', '.') : r, g.n));
      }
    }
    return teile.join(' ');
  }

  /* Wird für die Präambel gebraucht: nur laden, wenn es Diagramme gibt. */
  const PRAEAMBEL = `% ---- Diagramme (nur geladen, weil dieses Dokument welche enthält) ----
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\usepgfplotslibrary{statistics}
\\usetikzlibrary{patterns}
\\definecolor{reihe0}{HTML}{${FARBEN[0]}}
\\definecolor{reihe1}{HTML}{${FARBEN[1]}}
\\definecolor{reihe2}{HTML}{${FARBEN[2]}}
\\definecolor{reihe3}{HTML}{${FARBEN[3]}}
% Zurückhaltende Achsen nach APA 7: kein Rahmen, kein Farbverlauf,
% Gitter nur waagerecht und blass, Beschriftung in Textfarbe.
\\pgfplotsset{apadiagramm/.style={
  axis lines=left,
  axis line style={draw=black!55, line width=0.4pt},
  tick align=outside,
  tick style={draw=black!55},
  label style={font=\\small},
  tick label style={font=\\small},
  legend style={draw=none, fill=none, font=\\small,
                legend cell align=left, at={(0.5,-0.22)}, anchor=north,
                legend columns=-1, /tikz/every even column/.append style={column sep=10pt}},
  ymajorgrids=true,
  grid style={draw=black!12, line width=0.3pt},
  every axis plot/.append style={line width=0.9pt},
}}
% Dezimaltrennzeichen wie im Fließtext: im Deutschen das Komma.
\\asW{\\pgfkeys{/pgf/number format/.cd,use comma,1000 sep={}}}{}`;

  return { zuLatex, pflichtanmerkung, gitterVon, wertSpalten, regression,
           PRAEAMBEL, FARBEN };
})();
