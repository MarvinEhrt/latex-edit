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

console.log(`\n  ${ok} bestanden, ${fehl} durchgefallen`);
process.exit(fehl ? 1 : 0);
