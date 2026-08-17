/* Erzeugt ein Projekt und gibt es als JSON aus, damit die Python-Prüfung
   mit echtem Generatorausstoß arbeiten kann.
   Aufruf:  node erzeuge_projekt.mjs [kaputt]                          */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const q = (f) => readFileSync(join(hier, '..', 'quelle', f), 'utf8');
const lade = new Function(
  ['10-modell.js', '20-richtext.js', '30-latex.js'].map(q).join('\n') +
  '\nreturn {Modell, Richtext, Latex, Zitate};');
const { Modell, Latex } = lade();

const kaputt = process.argv[2] === 'kaputt';

const dok = Modell.neu('bachelorarbeit');
Object.assign(dok.meta, {
  titel: 'Berufliche Interessen und Arbeitszufriedenheit',
  verfasser: 'Maya Lena Wegner', hochschule: 'Universität Musterstadt',
  abgabedatum: '17. August 2026', ort: 'Musterstadt'
});
dok.quellen = [
  { key: 'holland1997', typ: 'buch', felder: {
      autoren: 'Holland, John L.', jahr: '1997',
      titel: 'Making vocational choices', auflage: '3', verlag: 'PAR' } },
  { key: 'john2008', typ: 'kapitel', felder: {
      autoren: 'John, Oliver P.; Naumann, Laura P.; Soto, Christopher J.',
      jahr: '2008', titel: 'Paradigm shift to the integrative Big Five',
      herausgeber: 'John, Oliver P.; Robins, Richard W.',
      buchtitel: 'Handbook of personality', seiten: '114–158',
      verlag: 'The Guilford Press' } }
];

const B = Modell.neuerBlock;
const tab = B('tabelle', {
  titel: 'Deskriptive Kennwerte', anmerkung: 'N = 124. Nach {{zit:holland1997}}.',
  kopf: ['Skala', 'M', 'SD'], zeilen: [['Realistic', '89.4', '12.1']],
  spaltenAusrichtung: ['l', 'c', 'c']
});
// Genau dieser Baustein wird im Fehlerfall unbrauchbar gemacht.
const formel = B('formel', {
  tex: kaputt ? 'r_{xy} = \\gibtesnicht{a}' : 'r_{xy} = \\frac{a}{b}'
});

dok.bloecke.push(
  B('absatz', { runs: [
    { text: 'Nach ' }, { zitat: 'holland1997', form: 'narrativ' },
    { text: ' passt das Profil zur Umwelt ' },
    { zitat: 'john2008', form: 'klammer', seite: '120' },
    { text: '. Siehe ' }, { verweis: tab.id }, { text: '. χ²(2) = 7.4, α = .84.' }
  ]}),
  tab, formel,
  B('anhangstart'),
  B('ueberschrift', { ebene: 1, text: 'Fragebogen' }),
  B('absatz', { runs: [{ text: 'Der Fragebogen im Wortlaut.' }] })
);

const projekt = Latex.erzeuge(dok);
process.stdout.write(JSON.stringify({
  dateien: projekt.dateien,
  bilder: projekt.bilder.map(b => ({ datei: b.datei, daten: b.datenUrl.split(',')[1] })),
  zeilenkarte: projekt.zeilenkarte,
  formelBlockId: formel.id,
  tabelleBlockId: tab.id
}));
