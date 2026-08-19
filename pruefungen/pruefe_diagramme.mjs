/* Baut ein Dokument mit allen vier Diagrammarten, übersetzt es und
   sieht nach, ob LaTeX zufrieden ist.
       node pruefungen/pruefe_diagramme.mjs                            */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = dirname(HIER);
const q = (f) => readFileSync(join(WURZEL, 'quelle', f), 'utf8');

const { Modell, Latex, Diagramm, Daten } = new Function(
  ['10-modell.js', '20-richtext.js', '30-latex.js', '32-diagramm.js',
   '72-import.js', '73-daten.js'].map(q).join('\n') +
  '\nreturn {Modell, Latex, Diagramm, Daten};')();

let ok = 0, fehl = 0;
const pruefe = (name, bedingung, hinweis = '') => {
  bedingung ? ok++ : fehl++;
  console.log(`  ${bedingung ? '✓' : '✗'} ${name}` + (bedingung ? '' : `\n      ${hinweis}`));
};

console.log('\nDiagrammprüfung\n');

const B = Modell.neuerBlock;
const dok = Modell.neu('hausarbeit');
dok.meta.titel = 'Diagrammprobe';
dok.bloecke = [B('ueberschrift', { ebene: 1, text: 'Ergebnisse' })];

/* --- Balken mit Fehlerbalken, eine Reihe --- */
const balken = B('diagramm', {
  art: 'balken', titel: 'Mittelwerte je Bedingung',
  achseX: 'Bedingung', achseY: 'Wert',
  daten: { kopf: ['Bedingung', 'M', 'SE'],
           zeilen: [['Kontrolle', '3,4', '0,21'], ['Training', '4,7', '0,25'],
                    ['Warteliste', '3,9', '0,19']] },
  xSpalte: 0, wertSpalten: [1], fehlerSpalte: 2, fehlerArt: 'se'
});

/* --- Balken, mehrere Gruppen --- */
const gruppen = B('diagramm', {
  art: 'balken', titel: 'Zwei Messzeitpunkte je Gruppe',
  daten: { kopf: ['Gruppe', 'Vorher', 'Nachher'],
           zeilen: [['A', '2,8', '4,1'], ['B', '3,1', '3,4'], ['C', '2,4', '4,6']] },
  xSpalte: 0, wertSpalten: [1, 2]
});

/* --- Profil, mehrere Linien, Sonderzeichen im Namen --- */
const profil = B('diagramm', {
  art: 'linie', titel: 'Interessenprofil im AIST-R',
  achseX: 'Dimension', achseY: 'Standardwert',
  daten: { kopf: ['Dimension', 'Herr U', 'Normgruppe & Co'],
           zeilen: [['R', '89', '100'], ['I', '97', '100'], ['A', '101', '100'],
                    ['S', '101', '100'], ['E', '95', '100'], ['C', '104', '100']] },
  xSpalte: 0, wertSpalten: [1, 2]
});

/* --- Lange Namen auf der x-Achse: umbrechbar --- */
const langUmbruch = B('diagramm', {
  art: 'balken', titel: 'Namen, die sich umbrechen lassen',
  daten: { kopf: ['Bedingung', 'M'],
           zeilen: [['Kontrollgruppe ohne Training', '2,8'],
                    ['Wartegruppe mit Nachtest', '3,1'],
                    ['Trainingsgruppe & Co', '4,2']] },
  xSpalte: 0, wertSpalten: [1]
});

/* --- Lange Namen, die kein Leerzeichen enthalten --- */
const langGedreht = B('diagramm', {
  art: 'balken', titel: 'Namen, die nur gedreht passen',
  daten: { kopf: ['Skala', 'M'],
           zeilen: [['Praktisch-technisch (R)', '2,8'],
                    ['Intellektuell-forschend (I)', '3,6'],
                    ['Künstlerisch-sprachlich (A)', '3,1'],
                    ['Sozial (S)', '3,9'],
                    ['Unternehmerisch (E)', '3,3'],
                    ['Konventionell (C)', '2,6']] },
  xSpalte: 0, wertSpalten: [1]
});

/* --- Streudiagramm mit Ausgleichsgerade --- */
const streu = B('diagramm', {
  art: 'streu', titel: 'Zusammenhang von Interesse und Zufriedenheit',
  achseX: 'Interesse', achseY: 'Zufriedenheit', regression: true,
  daten: { kopf: ['x', 'y'],
           zeilen: [['1', '2,1'], ['2', '2,4'], ['3', '3,6'], ['4', '3,9'],
                    ['5', '4,8'], ['6', '5,1'], ['7', '6,4'], ['8', '6,2']] },
  xSpalte: 0, wertSpalten: [1]
});

/* --- Boxplot aus Rohdaten, in Graustufen --- */
const boxplot = B('diagramm', {
  art: 'box', titel: 'Verteilung je Gruppe', graustufen: true,
  achseY: 'Punktwert',
  daten: { kopf: ['Gruppe A', 'Gruppe B'],
           zeilen: [['2', '5'], ['4', '6'], ['4', '7'], ['4', '7'], ['5', '8'],
                    ['5', '8'], ['7', '9'], ['9', '20']] },
  xSpalte: -1, wertSpalten: [0, 1]
});

/* --- Diagramm aus einer Tabelle im Dokument --- */
const tabelle = B('tabelle', {
  titel: 'Deskriptive Kennwerte', anmerkung: 'N = 124.',
  kopf: ['Skala', 'M', 'SD'],
  zeilen: [['Realistic', '89,4', '12,1'], ['Investigative', '97,2', '11,8'],
           ['Conventional', '104,3', '13,0']],
  spaltenAusrichtung: ['l', 'c', 'c']
});
const ausTabelle = B('diagramm', {
  art: 'balken', titel: 'Dieselben Zahlen als Diagramm',
  quelle: 'tabelle', tabelleId: tabelle.id,
  xSpalte: 0, wertSpalten: [1], fehlerSpalte: 2, fehlerArt: 'sd'
});

/* --- Boxplot mit langen Spaltennamen --- */
const boxLang = B('diagramm', {
  art: 'box', titel: 'Verteilung je Bedingung', achseY: 'Punktwert',
  daten: { kopf: ['Kontrollgruppe ohne Training', 'Interventionsgruppe mit Nachtest',
                  'Wartegruppe ohne Rückmeldung'],
           zeilen: [['2', '5', '4'], ['4', '6', '5'], ['4', '7', '5'],
                    ['5', '8', '6'], ['7', '9', '8']] },
  xSpalte: -1, wertSpalten: [0, 1, 2]
});

dok.bloecke.push(
  B('absatz', { runs: [{ text: 'Siehe ' }, { verweis: balken.id }, { text: '.' }] }),
  balken, gruppen, profil, langUmbruch, langGedreht, streu, boxplot, boxLang,
  tabelle, ausTabelle);

/* ---------------- Einzelprüfungen ---------------- */

const kennwert = Diagramm.regression([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
pruefe('Regression: vollständiger Zusammenhang ergibt r = 1',
  Math.abs(kennwert.r - 1) < 1e-9, String(kennwert && kennwert.r));

const codeBalken = Diagramm.zuLatex(balken, dok).tex;
pruefe('Balken: Fehlerbalken im Code', codeBalken.includes('error bars'), codeBalken.slice(0, 200));
pruefe('Balken: einzelne Reihe ohne Legende', !codeBalken.includes('addlegendentry'));

const codeGruppen = Diagramm.zuLatex(gruppen, dok).tex;
pruefe('Balken: mehrere Reihen bekommen eine Legende',
  (codeGruppen.match(/addlegendentry/g) || []).length === 2);

const codeProfil = Diagramm.zuLatex(profil, dok).tex;
pruefe('Reihen unterscheiden sich auch in Symbol und Strichart',
  codeProfil.includes('mark=*') && codeProfil.includes('mark=square*') &&
  codeProfil.includes('dashed'), codeProfil.slice(0, 300));
pruefe('Sonderzeichen in Reihennamen maskiert',
  codeProfil.includes('Normgruppe \\& Co'), codeProfil.slice(0, 400));

/* Lange Namen auf der x-Achse schoben sich früher übereinander:
   pgfplots setzt sie waagerecht und kürzt nichts. */
const codeUmbruch = Diagramm.zuLatex(langUmbruch, dok).tex;
pruefe('lange Namen werden umbrochen statt übereinandergelegt',
  codeUmbruch.includes('Kontrollgruppe ohne\\\\Training') &&
  codeUmbruch.includes('align=center'), codeUmbruch.slice(0, 400));
pruefe('kurze Namen bleiben unangetastet',
  !codeBalken.includes('xticklabels') && !codeBalken.includes('rotate='),
  codeBalken.slice(0, 300));

const codeGedreht = Diagramm.zuLatex(langGedreht, dok).tex;
pruefe('unumbrechbare Namen werden gedreht',
  codeGedreht.includes('rotate=45') && !codeGedreht.includes('xticklabels'),
  codeGedreht.slice(0, 400));

const codeBox = Diagramm.zuLatex(boxplot, dok).tex;
pruefe('Boxplot: Quartile vorberechnet', codeBox.includes('boxplot prepared'), codeBox.slice(0, 200));
pruefe('Boxplot in Graustufen nutzt Muster statt Farbe',
  codeBox.includes('pattern=') && !codeBox.includes('reihe0'), codeBox.slice(0, 300));

const codeBoxLang = Diagramm.zuLatex(boxLang, dok).tex;
pruefe('Boxplot: lange Spaltennamen legen sich nicht übereinander',
  codeBoxLang.includes('rotate=45') || codeBoxLang.includes('align=center'),
  codeBoxLang.slice(0, 500));
pruefe('Boxplot: Beschriftung bleibt bei den richtigen Kästen',
  /xtick=\{1, 2, 3\}/.test(codeBoxLang), codeBoxLang.slice(0, 500));

const codeTab = Diagramm.zuLatex(ausTabelle, dok).tex;
pruefe('Diagramm aus einer Tabelle liest deren Zahlen',
  codeTab.includes('Realistic') && codeTab.includes('89.4'), codeTab.slice(0, 250));

const anmerkung = Diagramm.pflichtanmerkung(streu, dok);
pruefe('Streudiagramm ergänzt r und n in der Anmerkung',
  /r = ,\d+/.test(anmerkung) && anmerkung.includes('n = 8'), anmerkung);
pruefe('Balken ergänzt die Art der Fehlerbalken',
  Diagramm.pflichtanmerkung(balken, dok).includes('Standardfehler'),
  Diagramm.pflichtanmerkung(balken, dok));

/* ---------------- Wirklich übersetzen ---------------- */

const projekt = Latex.erzeuge(dok);
pruefe('pgfplots wird in die Präambel aufgenommen',
  projekt.dateien['arbeit.tex'].includes('\\usepackage{pgfplots}'));

const ohne = Modell.neu('hausarbeit');
pruefe('ohne Diagramm bleibt die Präambel schlank',
  !Latex.erzeuge(ohne).dateien['arbeit.tex'].includes('pgfplots'));

const ziel = join(tmpdir(), 'schreibtisch-diagramme');
rmSync(ziel, { recursive: true, force: true });
mkdirSync(join(ziel, 'abbildungen'), { recursive: true });
for (const [name, inhalt] of Object.entries(projekt.dateien))
  writeFileSync(join(ziel, name), inhalt);

try {
  execSync(`cd "${ziel}" && pdflatex -interaction=nonstopmode arbeit.tex > /dev/null 2>&1;` +
           ` biber arbeit > /dev/null 2>&1;` +
           ` pdflatex -interaction=nonstopmode arbeit.tex > /dev/null 2>&1;` +
           ` pdflatex -interaction=nonstopmode arbeit.tex > /dev/null 2>&1`,
           { shell: '/bin/bash' });
} catch { /* Rückgabewert egal, das Log entscheidet */ }

const log = readFileSync(join(ziel, 'arbeit.log'), 'utf8');
const fehler = log.split('\n').filter(z => z.startsWith('!'));
pruefe('LaTeX übersetzt alle Diagramme fehlerfrei',
  fehler.length === 0, fehler.slice(0, 6).join('\n      '));
pruefe('keine offenen Verweise',
  !/Warning: (Citation|Reference)/.test(log),
  (log.match(/Warning: (Citation|Reference).*/g) || []).slice(0, 3).join(' | '));

let seiten = 0;
try {
  seiten = +execSync(`pdfinfo "${join(ziel, 'arbeit.pdf')}" | grep Pages | awk '{print $2}'`,
                     { shell: '/bin/bash' }).toString().trim();
} catch { /* kein PDF */ }
pruefe('PDF ist entstanden', seiten > 0, String(seiten));

console.log(`\n  ${ok} bestanden, ${fehl} durchgefallen`);
console.log('  PDF:', join(ziel, 'arbeit.pdf'));
process.exit(fehl ? 1 : 0);
