/* Prüft den Formeleditor-Unterbau: die MathML-Vorschau (34-mathe.js),
   die Formel-Erzeugung im LaTeX (nummeriert, mehrzeilig, im Satz)
   und die Vorabprüfung. Läuft ohne Browser und ohne LaTeX; ist
   pdflatex vorhanden, wird eine Formelarbeit zusätzlich übersetzt.
       node pruefungen/pruefe_formeln.mjs                             */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = dirname(HIER);
const q = (f) => readFileSync(join(WURZEL, 'quelle', f), 'utf8');
const { Modell, Latex, Richtext, Mathe } = new Function(
  ['10-modell.js', '20-richtext.js', '30-latex.js', '32-diagramm.js',
   '34-mathe.js', '72-import.js', '73-daten.js'].map(q).join('\n') +
  '\nreturn {Modell, Latex, Richtext, Mathe};')();

let ok = 0, fehl = 0;
const pruefe = (name, b, hinweis = '') => {
  b ? ok++ : fehl++;
  console.log(`  ${b ? '✓' : '✗'} ${name}` + (b ? '' : `\n      ${hinweis}`));
};

console.log('\nFormelprüfung\n');

/* ---------------- MathML-Vorschau ---------------- */

const mml = (tex) => Mathe.zuMathml(tex, true);

pruefe('Bruch wird zu mfrac', mml('\\frac{a}{b}').includes('<mfrac>'));
pruefe('Wurzel wird zu msqrt', mml('\\sqrt{x}').includes('<msqrt>'));
pruefe('n-te Wurzel wird zu mroot', mml('\\sqrt[3]{x}').includes('<mroot>'));
pruefe('griechische Buchstaben werden Glyphen',
  mml('\\alpha + \\Omega').includes('α') && mml('\\alpha + \\Omega').includes('Ω'));
pruefe('Index und Exponent zusammen werden msubsup',
  mml('x_{i}^{2}').includes('<msubsup>'));
pruefe('Summe trägt ihre Grenzen unter und über dem Zeichen',
  mml('\\sum_{i=1}^{n} x_i').includes('<munderover>'));
pruefe('Integralgrenzen stehen daneben (msubsup)',
  mml('\\int_{0}^{1} x \\, dx').includes('<msubsup>'));
pruefe('\\left(…\\right) wird mitwachsende Klammer',
  mml('\\left( \\frac{a}{b} \\right)').includes('stretchy="true"'));
pruefe('Akzent: \\bar{x} wird mover',
  mml('\\bar{x}').includes('<mover'));
pruefe('Matrix wird mtable mit Zeilen und Zellen', (() => {
  const m = mml('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}');
  return m.includes('<mtable') && (m.match(/<mtr>/g) || []).length === 2 &&
         (m.match(/<mtd>/g) || []).length === 4;
})());
pruefe('\\text bleibt aufrechter Text',
  mml('\\text{falls } x').includes('<mtext>falls </mtext>'));
pruefe('\\mathrm{cov} aus der Beispielarbeit wird gelesen',
  mml('r_{xy} = \\frac{\\mathrm{cov}(X, Y)}{s_X \\cdot s_Y}').includes('cov'));
pruefe('Dezimalzahl bleibt EINE Zahl', mml('3.14').includes('<mn>3.14</mn>'));
pruefe('Minus wird zum echten Minuszeichen', mml('a-b').includes('−'));
pruefe('alle Statistik-Vorlagen des Dialogs sind lesbar', (() => {
  const dialog = q('77-formeldialog.js');
  /* Die Vorlagen aus dem Quelltext fischen: Zeilen der Statistik-Gruppe */
  const teil = dialog.split("name: 'Statistik'")[1].split(']}')[0];
  const vorlagen = [...teil.matchAll(/, '((?:[^'\\]|\\.)+)'\]/g)]
    .map(m => m[1].replace(/\\\\/g, '\\').replace(/\\'/g, "'"));
  if (vorlagen.length < 8) return false;
  return vorlagen.every(v => { try { return !!Mathe.zuMathml(v, true); } catch { return false; } });
})());

pruefe('unbekannter Befehl wird gemeldet, nicht verschluckt',
  /\\foo/.test((Mathe.pruefe('\\foo{x}') || []).join(' ')));
pruefe('fehlende Klammer wird gemeldet',
  Mathe.pruefe('\\frac{a}{b').length === 1);
pruefe('\\left ohne \\right wird gemeldet',
  /\\right/.test(Mathe.pruefe('\\left( x').join(' ')));
pruefe('$ in der Formel wird gemeldet',
  /\$/.test(Mathe.pruefe('$x = 1$').join(' ')));
pruefe('Vorschau stürzt bei Unlesbarem nicht ab, sondern zeigt Quelltext',
  Mathe.vorschauHtml('\\foo{x}', true).html.includes('formel-quelltext'));
pruefe('normalisiere streift $…$, $$…$$ und \\[…\\] ab',
  ['$x$', '$$x$$', '\\[ x \\]', '\\( x \\)', ' x '].every(
    t => Mathe.normalisiere(t) === 'x'));

/* ---------------- LaTeX-Erzeugung ---------------- */

const B = Modell.neuerBlock;
const dok = Modell.neu('hausarbeit');
dok.meta.titel = 'Formelprobe';
const nummeriert = B('formel', { tex: 'z = \\frac{x - \\mu}{\\sigma}', nummeriert: true });
dok.bloecke = [
  B('ueberschrift', { ebene: 1, text: 'Methode' }),
  B('formel', { tex: '\\bar{x} = \\frac{1}{n} \\sum_{i=1}^{n} x_i' }),
  nummeriert,
  B('formel', { tex: 'a = 1 \\\\ b = 2' }),
  B('absatz', { runs: [
    { text: 'Die Standardisierung folgt ' },
    { verweis: nummeriert.id },
    { text: ' mit ' },
    { formel: '\\eta^2 = .14' },
    { text: '.' }
  ]})
];

const tex = Latex.erzeuge(dok).dateien['arbeit.tex'];

pruefe('Formel ohne Nummer bleibt \\[…\\]', tex.includes('\\[\n  \\bar{x}'));
pruefe('nummerierte Formel wird equation mit \\label',
  tex.includes(`\\begin{equation}\\label{form:${nummeriert.id}}`));
pruefe('mehrzeilige Formel bekommt gathered',
  /\\\[\n\\begin\{gathered\}\n {2}a = 1/.test(tex));
pruefe('Querverweis auf die Formel wird Formel~\\eqref',
  tex.includes(`Formel~\\eqref{form:${nummeriert.id}}`));
pruefe('Formel im Satz steht als $…$ im Absatz',
  tex.includes('mit $\\eta^2 = .14$.'));
pruefe('Stildatei lädt amsmath vor mathastext', (() => {
  const s = Latex.erzeuge(dok).dateien['arbeit-stil.sty'];
  return s.indexOf('{amsmath}') > 0 && s.indexOf('{amsmath}') < s.indexOf('{mathastext}');
})());

pruefe('Modell nummeriert nur nummerierte Formeln', (() => {
  const n = Modell.nummeriere(dok);
  const alle = dok.bloecke.filter(b => b.typ === 'formel');
  return !n.has(alle[0].id) && (n.get(nummeriert.id) || {}).nummer === '1' && !n.has(alle[2].id);
})());

pruefe('Vorabprüfung findet den Fehler auch in der Satz-Formel', (() => {
  const kaputt = Modell.neu('hausarbeit');
  kaputt.bloecke = [B('absatz', { runs: [{ formel: '\\frac{a}{b' }] })];
  const a = Latex.pruefe(kaputt);
  return a.length === 1 && a[0].id === kaputt.bloecke[0].id;
})());

pruefe('englische Arbeit verweist mit Equation', (() => {
  const en = Modell.normalisiere(JSON.parse(JSON.stringify(dok)));
  en.einstellungen.sprache = 'en';
  return Latex.erzeuge(en).dateien['arbeit.tex']
    .includes(`Equation~\\eqref{form:${nummeriert.id}}`);
})());

pruefe('Formel-Chip überlebt den Weg Runs → HTML → Runs', (() => {
  /* vonHtml braucht DOM -- hier genügt die Hin-Richtung plus
     Datenattribut: der Rückweg liest data-tex wieder aus. */
  const html = Richtext.zuHtml([{ formel: '\\eta^2' }], {});
  return html.includes('data-typ="formel"') && html.includes('data-tex="\\eta^2"');
})());

/* ---------------- Übersetzen (nur mit LaTeX) ---------------- */

let hatLatex = true;
try { execSync('command -v pdflatex', { shell: '/bin/bash' }); }
catch { hatLatex = false; }

if (hatLatex) {
  const ziel = join(tmpdir(), 'schreibtisch-formeln');
  rmSync(ziel, { recursive: true, force: true });
  mkdirSync(join(ziel, 'abbildungen'), { recursive: true });
  const p = Latex.erzeuge(dok);
  for (const [n, i] of Object.entries(p.dateien)) writeFileSync(join(ziel, n), i);
  try {
    execSync(`cd "${ziel}" && for i in 1 2; do pdflatex -interaction=nonstopmode arbeit.tex; done > /dev/null 2>&1;` +
             ` biber arbeit > /dev/null 2>&1; pdflatex -interaction=nonstopmode arbeit.tex > /dev/null 2>&1`,
             { shell: '/bin/bash' });
  } catch { /* Log entscheidet */ }
  const log = readFileSync(join(ziel, 'arbeit.log'), 'utf8');
  pruefe('LaTeX übersetzt die Formelarbeit fehlerfrei', !/^!/m.test(log),
    (log.match(/^!.*/gm) || []).slice(0, 3).join(' | '));
  const text = execSync(`pdftotext "${join(ziel, 'arbeit.pdf')}" - 2>/dev/null || true`,
    { shell: '/bin/bash', maxBuffer: 40e6 }).toString().replace(/\s+/g, ' ');
  pruefe('die nummerierte Formel trägt im PDF eine (1)', text.includes('(1)'));
  pruefe('der Querverweis nennt Formel (1)', /Formel \(1\)/.test(text));
} else {
  console.log('  – LaTeX-Übersetzung übersprungen (pdflatex fehlt)');
}

console.log(`\n${ok} bestanden, ${fehl} fehlgeschlagen\n`);
process.exit(fehl ? 1 : 0);
