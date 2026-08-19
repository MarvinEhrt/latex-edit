/* Prüft Eigenschaften des erzeugten Dokuments, die man erst im
   fertigen PDF bemerkt: verlorene Tabellenzeilen, leere Vorspannseiten.
       node pruefungen/pruefe_dokument.mjs                              */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = dirname(HIER);
const q = (f) => readFileSync(join(WURZEL, 'quelle', f), 'utf8');
const { Modell, Latex } = new Function(
  ['10-modell.js', '20-richtext.js', '30-latex.js', '32-diagramm.js',
   '72-import.js', '73-daten.js'].map(q).join('\n') +
  '\nreturn {Modell, Latex};')();

let ok = 0, fehl = 0;
const pruefe = (name, b, hinweis = '') => {
  b ? ok++ : fehl++;
  console.log(`  ${b ? '✓' : '✗'} ${name}` + (b ? '' : `\n      ${hinweis}`));
};

function uebersetze(dok, ordnername) {
  const ziel = join(tmpdir(), ordnername);
  rmSync(ziel, { recursive: true, force: true });
  mkdirSync(join(ziel, 'abbildungen'), { recursive: true });
  const p = Latex.erzeuge(dok);
  for (const [n, i] of Object.entries(p.dateien)) writeFileSync(join(ziel, n), i);
  try {
    execSync(`cd "${ziel}" && for i in 1 2; do pdflatex -interaction=nonstopmode arbeit.tex; done > /dev/null 2>&1;` +
             ` biber arbeit > /dev/null 2>&1; pdflatex -interaction=nonstopmode arbeit.tex > /dev/null 2>&1`,
             { shell: '/bin/bash' });
  } catch { /* Log entscheidet */ }
  const roh = execSync(`pdftotext "${join(ziel, 'arbeit.pdf')}" - 2>/dev/null || true`,
                       { shell: '/bin/bash', maxBuffer: 40e6 }).toString();
  return { ziel, tex: p.dateien['arbeit.tex'],
           log: readFileSync(join(ziel, 'arbeit.log'), 'utf8'),
           text: roh,
           // Für Textsuche: Umbrüche des Satzspiegels sind kein Inhalt.
           fliess: roh.replace(/\s+/g, ' ') };
}

console.log('\nDokumentprüfung\n');
const B = Modell.neuerBlock;

const lang = Modell.neu('hausarbeit');
lang.meta.titel = 'Tabellenprobe';
lang.bloecke = [
  B('ueberschrift', { ebene: 1, text: 'Ergebnisse' }),
  B('tabelle', { titel: 'Kurze Tabelle', kopf: ['A', 'B'],
    zeilen: [['1', '2'], ['3', '4']], spaltenAusrichtung: ['l', 'c'] }),
  B('tabelle', { titel: 'Alle Items', anmerkung: 'N = 124.', kopf: ['Item', 'M', 'SD'],
    zeilen: Array.from({ length: 45 }, (_, i) =>
      [`Item ${i + 1} mit erklärendem Text`, '3,4', '0,8']),
    spaltenAusrichtung: ['l', 'c', 'c'] }),
  B('tabelle', { titel: 'Wenige Zeilen, viel Text', kopf: ['Verfahren', 'Beschreibung'],
    zeilen: Array.from({ length: 9 }, (_, i) => [`Verfahren ${i + 1}`,
      'Eine ausführliche Beschreibung, die über mehrere Zeilen läuft. '.repeat(4)]),
    spaltenAusrichtung: ['l', 'l'] })
];
const a = uebersetze(lang, 'schreibtisch-tabellen');
pruefe('kurze Tabelle schwebt weiterhin',
  (a.tex.match(/\\begin\{table\}/g) || []).length === 1,
  String((a.tex.match(/\\begin\{table\}/g) || []).length));
pruefe('lange Tabellen brechen über Seiten um',
  (a.tex.match(/\\begin\{xltabular\}/g) || []).length === 2);
pruefe('LaTeX übersetzt fehlerfrei', !/^!/m.test(a.log),
  (a.log.match(/^!.*/gm) || []).slice(0, 3).join(' | '));

const items = new Set([...a.text.matchAll(/Item (\d+)/g)].map(m => +m[1]));
const fehlend = [...Array(45)].map((_, i) => i + 1).filter(n => !items.has(n));
pruefe('alle 45 Tabellenzeilen stehen im PDF', fehlend.length === 0,
  'fehlend: ' + fehlend.join(', '));

const verfahren = new Set([...a.text.matchAll(/Verfahren (\d+)/g)].map(m => +m[1]));
pruefe('auch die Tabelle mit viel Text ist vollständig', verfahren.size === 9,
  String(verfahren.size) + ' von 9');
pruefe('Kopfzeile wiederholt sich auf Folgeseiten',
  (a.text.match(/Fortsetzung/g) || []).length >= 1);
pruefe('Anmerkung der langen Tabelle bleibt erhalten', a.fliess.includes('N = 124'));

const leer = Modell.neu('bachelorarbeit');
leer.einstellungen.abstract = true;
leer.einstellungen.abkuerzungsverzeichnis = true;
const texLeer = Latex.erzeuge(leer).dateien['arbeit.tex'];
pruefe('leere Zusammenfassung erzeugt keine Platzhalterseite',
  !/Hier steht die Zusammenfassung/.test(texLeer) && !/abstractseite/.test(texLeer));
pruefe('leeres Abkürzungsverzeichnis erzeugt keine Seite',
  !/abkuerzungsverzeichnis\{/.test(texLeer));
pruefe('keine fremden Abkürzungen mehr im Dokument',
  !/AIST-R|American Psychological Association/.test(texLeer));
const hinweise = Latex.pruefe(leer);
pruefe('stattdessen wird darauf hingewiesen', hinweise.length === 2,
  JSON.stringify(hinweise.map(h => h.meldung.slice(0, 40))));

const voll = Modell.neu('bachelorarbeit');
voll.meta.titel = 'Vorspannprobe';
voll.einstellungen.abstract = true;
voll.einstellungen.abkuerzungsverzeichnis = true;
voll.meta.abstract = 'Die Arbeit untersucht den Zusammenhang zwischen Interessen '
                   + 'und Zufriedenheit bei 124 Berufstätigen.';
voll.meta.abkuerzungen = [{ kurz: 'BFI', lang: 'Big Five Inventory' },
                          { kurz: 'SD', lang: 'Standardabweichung' }];
voll.bloecke = [B('ueberschrift', { ebene: 1, text: 'Einleitung' }),
                B('absatz', { runs: [{ text: 'Text.' }] })];
const v = uebersetze(voll, 'schreibtisch-vorspann');
pruefe('eigene Zusammenfassung steht im PDF', v.fliess.includes('124 Berufstätigen'),
  v.fliess.slice(v.fliess.indexOf('Zusammenfassung'), 200));
pruefe('eigene Abkürzungen stehen im PDF',
  v.fliess.includes('Big Five Inventory') && v.fliess.includes('Standardabweichung'));
pruefe('Vorspann erzeugt keine Hinweise mehr', Latex.pruefe(voll).length === 0);

const kaputt = Modell.neu('hausarbeit');
kaputt.bloecke = [B('absatz', { runs: [
  { text: 'Belegt durch ' }, { zitat: 'gibtesnicht2020', form: 'klammer' }, { text: '.' }] })];
const k = uebersetze(kaputt, 'schreibtisch-quelle');
pruefe('LaTeX bricht wegen einer fehlenden Quelle nicht ab', !/^!/m.test(k.log));
pruefe('das Protokoll enthält die Warnung',
  /Citation 'gibtesnicht2020'.*undefined/.test(k.log));


/* ---------------- Mehrere Quellen in einer Klammer ---------------- */

const mehr = Modell.neu('hausarbeit');
mehr.meta.titel = 'Mehrfachbeleg';
mehr.quellen = [
  { key: 'schmidt2021', typ: 'artikel', felder: { autoren: 'Schmidt, Anna', jahr: '2021',
    titel: 'Interessen und Zufriedenheit', zeitschrift: 'Zeitschrift für Arbeitspsychologie',
    jahrgang: '65', seiten: '12-30' } },
  { key: 'mueller2020', typ: 'buch', felder: { autoren: 'Müller, Bernd; Weber, Clara',
    jahr: '2020', titel: 'Berufliche Interessen', verlag: 'Hogrefe' } },
  { key: 'holland1997', typ: 'buch', felder: { autoren: 'Holland, John L.', jahr: '1997',
    titel: 'Making vocational choices', verlag: 'PAR' } }
];
mehr.bloecke = [
  B('ueberschrift', { ebene: 1, text: 'Theorie' }),
  B('absatz', { runs: [{ text: 'Mehrfach belegt ' },
    { zitat: 'schmidt2021,mueller2020', form: 'klammer' }, { text: '.' }] }),
  B('absatz', { runs: [{ zitat: 'mueller2020,holland1997', form: 'narrativ' },
    { text: ' berichten dasselbe.' }] })
];

const texMehr = Latex.erzeuge(mehr).dateien['arbeit.tex'];
pruefe('mehrere Schlüssel gehen als einer an biblatex',
  texMehr.includes('\\zit{schmidt2021,mueller2020}'), texMehr.slice(0, 0) ||
  (texMehr.match(/\\zit\{[^}]*\}/g) || []).join(' '));
pruefe('alle beteiligten Quellen landen in der bib-Datei',
  ['schmidt2021', 'mueller2020', 'holland1997']
    .every(k => Latex.erzeuge(mehr).dateien['literatur.bib'].includes('{' + k + ',')));

const m = uebersetze(mehr, 'schreibtisch-mehrfach');
pruefe('LaTeX übersetzt den Mehrfachbeleg fehlerfrei', !/^!/m.test(m.log),
  (m.log.match(/^!.*/m) || []).join(' '));
pruefe('keine offene Quelle', !/Citation '.*' on page \d+ undefined/.test(m.log),
  (m.log.match(/Citation '[^']*' on page \d+ undefined/g) || []).join(' '));
pruefe('beide Quellen stehen in EINER Klammer, alphabetisch geordnet',
  /\(Müller & Weber, 2020; Schmidt, 2021\)/.test(m.fliess),
  m.fliess.slice(m.fliess.indexOf('Mehrfach belegt'), m.fliess.indexOf('Mehrfach belegt') + 120));
pruefe('im Satz bleiben sie getrennt, nicht in einer Klammer',
  m.fliess.includes('Holland (1997) und Müller und Weber (2020) berichten'),
  m.fliess.slice(m.fliess.indexOf('berichten') - 90, m.fliess.indexOf('berichten') + 30));

/* Die Vorschau im Editor muss zeigen, was hinterher im PDF steht --
   sonst schreibt man gegen ein Bild an, das nicht stimmt. */
const alsText = (runs) => new Function(
  ['10-modell.js', '20-richtext.js'].map(q).join('\n') +
  `\nreturn Richtext.zuText(${JSON.stringify(runs)},` +
  ` {quellen: ${JSON.stringify(mehr.quellen)}});`)();
pruefe('die Vorschau zeigt dieselbe Klammer wie das PDF',
  alsText(mehr.bloecke[1].runs).includes('(Müller & Weber, 2020; Schmidt, 2021)'),
  alsText(mehr.bloecke[1].runs));
pruefe('die Vorschau zeigt auch den Satzfall wie das PDF',
  alsText(mehr.bloecke[2].runs).startsWith('Holland (1997) und Müller und Weber (2020)'),
  alsText(mehr.bloecke[2].runs));


/* ---------------- Dieselbe Arbeit auf Englisch ---------------- */

function probearbeit(sprache) {
  const d = Modell.neu('bachelorarbeit');
  d.einstellungen.sprache = sprache;
  d.einstellungen.abstract = true;
  d.einstellungen.abbildungsverzeichnis = true;
  d.einstellungen.tabellenverzeichnis = true;
  d.einstellungen.abkuerzungsverzeichnis = true;
  d.einstellungen.eidesstattlich = true;
  d.einstellungen.anhang = true;
  d.meta.titel = 'Interests and satisfaction';
  d.meta.verfasser = 'A. Beispiel';
  d.meta.matrikelnummer = '1234567';
  d.meta.abstract = 'This thesis examines the relation between interests and satisfaction.';
  d.meta.abkuerzungen = [{ kurz: 'SD', lang: 'standard deviation' }];
  d.quellen = [
    { key: 'schmidt2021', typ: 'buch', felder: { autoren: 'Schmidt, Anna', jahr: '2021',
      titel: 'Interests', verlag: 'Hogrefe' } },
    { key: 'mueller2020', typ: 'buch', felder: { autoren: 'Müller, Bernd; Weber, Clara',
      jahr: '2020', titel: 'Occupational interests', verlag: 'Hogrefe' } }
  ];
  const tab = B('tabelle', { titel: 'Descriptives', anmerkung: 'N = 124.',
    kopf: ['Scale', 'M', 'SD'], zeilen: [['A', '3.4', '0.8'], ['B', '4.1', '0.9']],
    spaltenAusrichtung: ['l', 'c', 'c'] });
  d.bloecke = [
    B('ueberschrift', { ebene: 1, text: 'Introduction' }),
    B('absatz', { runs: [
      { text: 'As shown ' }, { zitat: 'mueller2020', form: 'klammer', seite: '17' },
      { text: ', and also ' }, { zitat: 'mueller2020,schmidt2021', form: 'narrativ' },
      { text: '. See ' }, { verweis: tab.id }, { text: '.' }] }),
    tab,
    B('anhangstart', {}),
    B('ueberschrift', { ebene: 1, text: 'Materials' })
  ];
  return d;
}

const en = probearbeit('en');
const texEn = Latex.erzeuge(en).dateien['arbeit.tex'];
pruefe('die Stildatei bekommt die Sprachoption',
  texEn.includes(',englisch]{arbeit-stil}'),
  (texEn.match(/\\usepackage\[[^\]]*\]\{arbeit-stil\}/) || [])[0]);
pruefe('Querverweise nehmen den Namen von babel',
  texEn.includes('\\tablename~\\ref{tab:'), (texEn.match(/.{0,20}\\ref\{tab:.{0,10}/) || [])[0]);

const e = uebersetze(en, 'schreibtisch-englisch');
pruefe('die englische Arbeit übersetzt fehlerfrei', !/^!/m.test(e.log),
  (e.log.match(/^!.*/m) || []).join(' '));
pruefe('feste Wörter stehen auf Englisch im PDF',
  ['Abstract', 'Contents', 'List of Figures', 'List of Tables',
   'List of Abbreviations', 'References', 'Appendix',
   'Declaration of Authorship'].every(w => e.fliess.includes(w)),
  ['Abstract', 'Contents', 'List of Figures', 'List of Tables',
   'List of Abbreviations', 'References', 'Appendix', 'Declaration of Authorship']
    .filter(w => !e.fliess.includes(w)).join(' | '));
pruefe('kein deutsches Wort ist stehengeblieben',
  !/Literaturverzeichnis|Inhaltsverzeichnis|Abbildungsverzeichnis|Tabellenverzeichnis|Anmerkung\.|Eidesstattliche|Vorgelegt von|Matrikelnummer/
    .test(e.fliess),
  (e.fliess.match(/Literaturverzeichnis|Inhaltsverzeichnis|Abbildungsverzeichnis|Tabellenverzeichnis|Anmerkung\.|Eidesstattliche|Vorgelegt von|Matrikelnummer/g) || []).join(' '));
pruefe('die Tabellenanmerkung heißt Note.', e.fliess.includes('Note. N = 124.'),
  e.fliess.slice(e.fliess.indexOf('Descriptives'), e.fliess.indexOf('Descriptives') + 140));
pruefe('die Seitenangabe im Zitat heißt p.',
  /\(Müller & Weber, 2020, p\. 17\)/.test(e.fliess),
  e.fliess.slice(e.fliess.indexOf('As shown'), e.fliess.indexOf('As shown') + 150));
pruefe('im Satz verbindet "and", nicht "und"',
  /Müller and Weber \(2020\)/.test(e.fliess),
  e.fliess.slice(e.fliess.indexOf('and also') - 10, e.fliess.indexOf('and also') + 120));
pruefe('der Querverweis heißt Table',
  /See Table 1\./.test(e.fliess), e.fliess.slice(e.fliess.indexOf('See '), e.fliess.indexOf('See ') + 40));

/* Und dieselbe Arbeit auf Deutsch, damit nichts abgewandert ist */
const de = probearbeit('de');
const dt = uebersetze(de, 'schreibtisch-deutsch');
pruefe('die deutsche Arbeit übersetzt weiterhin fehlerfrei', !/^!/m.test(dt.log),
  (dt.log.match(/^!.*/m) || []).join(' '));
pruefe('feste Wörter stehen auf Deutsch im PDF',
  ['Zusammenfassung', 'Inhaltsverzeichnis', 'Abbildungsverzeichnis',
   'Tabellenverzeichnis', 'Abkürzungsverzeichnis', 'Literaturverzeichnis',
   'Anhang', 'Eidesstattliche Erklärung', 'Anmerkung.'].every(w => dt.fliess.includes(w)),
  ['Zusammenfassung', 'Inhaltsverzeichnis', 'Abbildungsverzeichnis',
   'Tabellenverzeichnis', 'Abkürzungsverzeichnis', 'Literaturverzeichnis',
   'Anhang', 'Eidesstattliche Erklärung', 'Anmerkung.']
    .filter(w => !dt.fliess.includes(w)).join(' | '));
pruefe('deutsch bleibt bei "S." und "und"',
  /\(Müller & Weber, 2020, S\. 17\)/.test(dt.fliess) &&
  /Müller und Weber \(2020\)/.test(dt.fliess),
  dt.fliess.slice(dt.fliess.indexOf('As shown'), dt.fliess.indexOf('As shown') + 150));
pruefe('der Querverweis heißt Tabelle', /See Tabelle 1\./.test(dt.fliess),
  dt.fliess.slice(dt.fliess.indexOf('See '), dt.fliess.indexOf('See ') + 40));

console.log(`\n  ${ok} bestanden, ${fehl} durchgefallen`);
process.exit(fehl ? 1 : 0);
