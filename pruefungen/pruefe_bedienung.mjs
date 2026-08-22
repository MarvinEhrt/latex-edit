/* Prüft das Grundverhalten der Bedienung: Pfeiltasten über
   Blockgrenzen, das Listenverhalten (Enter/Rücktaste), die
   Tastenkürzel und den direkt editierbaren Kartentitel.
       node pruefungen/pruefe_bedienung.mjs                           */

import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pw = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const chromium = pw.chromium || pw.default?.chromium;
const W = dirname(dirname(fileURLToPath(import.meta.url)));
const ABLAGE = mkdtempSync(join(tmpdir(), 'schreibtisch-bedienung-'));
const d = spawn('python3', ['-u', W + '/schreibtisch.py'],
  { cwd: W, env: { ...process.env, SCHREIBTISCH_ARBEITEN: ABLAGE } });
let adr = ''; d.stdout.on('data', x => { const m = x.toString().match(/http:\S+/); if (m) adr = m[0]; });
for (let i = 0; i < 80 && !adr; i++) await new Promise(r => setTimeout(r, 100));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
  args: ['--no-sandbox', '--disable-gpu'] });
const s = await b.newPage(); s.on('pageerror', f => console.log('PAGEERROR:', f.message));
await s.goto(adr); await s.waitForTimeout(1500);
await s.locator('.dialog .knopf-haupt').first().click().catch(() => {});
await s.waitForTimeout(400);

let ok = 0, fehl = 0;
const p = (n, gut, h = '') => { (gut ? ok++ : fehl++);
  console.log(`  ${gut ? '✓' : '✗'} ${n}${gut ? '' : '\n      ' + h}`); };
const setze = (js) => s.evaluate(js).then(() => s.waitForTimeout(350));
const fokusFeld = () => s.evaluate(() => {
  const f = document.activeElement?.closest?.('.tx');
  return f ? [...document.querySelectorAll('#blockliste .tx')].indexOf(f) : -1;
});

/* ---------------- Pfeiltasten über Blockgrenzen ---------------- */

console.log('\nPfeiltasten\n');
await setze(() => {
  App.dok.bloecke = [
    Modell.neuerBlock('absatz', { runs: [{ text: 'Absatz eins' }] }),
    Modell.neuerBlock('absatz', { runs: [{ text: 'Absatz zwei' }] })];
  Editor.zeichne();
});
await s.locator('.block .tx').first().click();
await s.keyboard.press('End');
await s.keyboard.press('ArrowDown'); await s.waitForTimeout(150);
p('Pfeil-runter am Ende wechselt in den nächsten Baustein',
  await fokusFeld() === 1, 'Feld ' + await fokusFeld());
await s.keyboard.press('ArrowUp'); await s.waitForTimeout(150);
p('Pfeil-hoch in der ersten Zeile wechselt zurück', await fokusFeld() === 0);
await s.keyboard.press('End');
await s.keyboard.press('ArrowRight'); await s.waitForTimeout(150);
p('Pfeil-rechts am Feldende wechselt vorwärts', await fokusFeld() === 1);
await s.keyboard.press('Home');
await s.keyboard.press('ArrowLeft'); await s.waitForTimeout(150);
p('Pfeil-links am Feldanfang wechselt rückwärts', await fokusFeld() === 0);
await s.keyboard.press('Home');
await s.keyboard.press('ArrowRight'); await s.waitForTimeout(150);
p('mitten im Text bleiben die Pfeile im Baustein', await fokusFeld() === 0);

/* ---------------- Listenverhalten ---------------- */

console.log('\nListen\n');
await setze(() => {
  App.dok.bloecke = [
    Modell.neuerBlock('absatz', { runs: [{ text: 'Davor' }] }),
    Modell.neuerBlock('liste', { ordnung: 'punkte',
      punkte: [[{ text: 'Punkt eins' }], [{ text: 'Punkt zwei' }], []] })];
  Editor.zeichne();
});
await s.locator('.block').nth(1).locator('.tx').nth(2).click();
await s.keyboard.press('Backspace'); await s.waitForTimeout(400);
p('Rücktaste im leeren Punkt entfernt NUR den Punkt — nie die Liste',
  await s.evaluate(() => App.dok.bloecke.length === 2 &&
    App.dok.bloecke[1].typ === 'liste' && App.dok.bloecke[1].punkte.length === 2),
  await s.evaluate(() => JSON.stringify(App.dok.bloecke.map(x => x.typ))));
p('die Marke steht danach im vorigen Punkt', await fokusFeld() === 2);

await setze(() => {
  App.dok.bloecke = [Modell.neuerBlock('liste', { ordnung: 'punkte',
    punkte: [[{ text: 'eins' }], [{ text: 'zwei' }]] })];
  Editor.zeichne();
});
await s.locator('.block .tx').nth(1).click();
await s.keyboard.press('Home');
await s.keyboard.press('Backspace'); await s.waitForTimeout(400);
p('Rücktaste am Punktanfang verschmilzt mit dem Punkt darüber',
  await s.evaluate(() => App.dok.bloecke[0].punkte.length === 1 &&
    Richtext.zuText(App.dok.bloecke[0].punkte[0], {}) === 'einszwei'),
  await s.evaluate(() => JSON.stringify(App.dok.bloecke[0].punkte)));
await s.keyboard.type('|'); await s.waitForTimeout(300);
p('die Marke steht an der Naht',
  await s.evaluate(() => Richtext.zuText(App.dok.bloecke[0].punkte[0], {}) === 'eins|zwei'),
  await s.evaluate(() => Richtext.zuText(App.dok.bloecke[0].punkte[0], {})));

await setze(() => {
  App.dok.bloecke = [Modell.neuerBlock('liste', { ordnung: 'punkte',
    punkte: [[{ text: 'Punkt eins' }], []] })];
  Editor.zeichne();
});
await s.locator('.block .tx').nth(1).click();
await s.keyboard.press('Enter'); await s.waitForTimeout(400);
p('Enter im leeren letzten Punkt verlässt die Liste',
  await s.evaluate(() => App.dok.bloecke.length === 2 &&
    App.dok.bloecke[0].typ === 'liste' && App.dok.bloecke[0].punkte.length === 1 &&
    App.dok.bloecke[1].typ === 'absatz'),
  await s.evaluate(() => JSON.stringify(App.dok.bloecke.map(x => x.typ))));

await setze(() => {
  App.dok.bloecke = [
    Modell.neuerBlock('absatz', { runs: [{ text: 'Davor' }] }),
    Modell.neuerBlock('liste', { ordnung: 'punkte', punkte: [[]] })];
  Editor.zeichne();
});
await s.locator('.block').nth(1).locator('.tx').first().click();
await s.keyboard.press('Backspace'); await s.waitForTimeout(400);
p('Rücktaste im einzigen leeren Punkt löst die Liste auf',
  await s.evaluate(() => App.dok.bloecke.length === 1 && App.dok.bloecke[0].typ === 'absatz'));

/* ---------------- Tastenkürzel ---------------- */

console.log('\nTastenkürzel\n');
await setze(() => {
  App.dok.quellen = [{ key: 'holland1997', typ: 'buch',
    felder: { autoren: 'Holland, John L.', jahr: '1997', titel: 'T', verlag: 'P' } }];
  App.dok.bloecke = [Modell.neuerBlock('absatz', { runs: [{ text: 'Hallo Welt' }] })];
  Editor.zeichne();
});
await s.locator('.block .tx').first().click();
await s.keyboard.press('End');
await s.keyboard.type('A'); await s.waitForTimeout(900);
await s.keyboard.press('Control+z'); await s.waitForTimeout(300);
await s.keyboard.press('Control+Shift+z'); await s.waitForTimeout(500);
p('Strg+Umschalt+Z wiederholt nur — es öffnet keinen Dialog',
  await s.evaluate(() => !document.querySelector('.schleier') &&
    Richtext.zuText(App.dok.bloecke[0].runs, {}) === 'Hallo WeltA'),
  await s.evaluate(() => JSON.stringify({ dialog: !!document.querySelector('.schleier'),
    text: Richtext.zuText(App.dok.bloecke[0].runs, {}) })));
await s.locator('.block .tx').first().click();
await s.keyboard.press('Control+Shift+l'); await s.waitForTimeout(500);
p('Strg+Umschalt+L öffnet den Zitatdialog',
  await s.evaluate(() => !!document.querySelector('.schleier')));
await s.keyboard.press('Escape'); await s.waitForTimeout(300);

await setze(() => {
  App.dok.bloecke = [Modell.neuerBlock('absatz', { runs: [{ text: 'Eins Zwei' }] })];
  Editor.zeichne();
});
await s.locator('.block .tx').first().click();
await s.keyboard.press('Home');
for (let i = 0; i < 4; i++) await s.keyboard.press('ArrowRight');
await s.keyboard.press('Control+Enter'); await s.waitForTimeout(400);
p('Strg+Enter (Bauen) teilt den Absatz nicht',
  await s.evaluate(() => App.dok.bloecke.length === 1 &&
    Richtext.zuText(App.dok.bloecke[0].runs, {}) === 'Eins Zwei'),
  await s.evaluate(() => JSON.stringify(App.dok.bloecke.map(x =>
    Richtext.zuText(x.runs || [], {})))));

/* ---------------- Kartentitel ---------------- */

console.log('\nKartentitel\n');
await setze(() => {
  App.dok.bloecke = [Modell.neuerBlock('tabelle')];
  Editor.zeichne();
});
await s.locator('.karte-titel').click();
await s.keyboard.type('Deskriptive Statistik'); await s.waitForTimeout(300);
p('an der Karte getippt landet der Titel im Modell',
  await s.evaluate(() => App.dok.bloecke[0].titel === 'Deskriptive Statistik'),
  await s.evaluate(() => App.dok.bloecke[0].titel));
p('die Objektleiste zieht mit',
  await s.evaluate(() => document.querySelector(
    '#kontextleiste .ktx-eingabe[data-feld="titel"]')?.value === 'Deskriptive Statistik'));
await s.evaluate(() => {
  const e = document.querySelector('#kontextleiste .ktx-eingabe[data-feld="titel"]');
  e.focus(); e.value = 'Aus der Leiste';
  e.dispatchEvent(new Event('input', { bubbles: true }));
});
await s.waitForTimeout(200);
p('in der Leiste getippt zieht die Karte mit',
  await s.evaluate(() => document.querySelector('.karte-titel').textContent === 'Aus der Leiste' &&
    App.dok.bloecke[0].titel === 'Aus der Leiste'));

p('Zeilen-/Spaltenwerkzeuge sind am gewählten Baustein sichtbar (ohne Hover)',
  await s.evaluate(() => {
    Editor.waehle(App.dok.bloecke[0].id, false);
    const w = document.querySelector('.block.gewaehlt .spaltenwerkzeug');
    return w && parseFloat(getComputedStyle(w).opacity) > 0.5;
  }));

p('Meldungen tragen role="status" für Screenreader',
  await s.evaluate(() => document.getElementById('meldungen').getAttribute('role') === 'status'));

/* ---------------- Markdown-Kürzel ---------------- */

console.log('\nMarkdown-Kürzel\n');
await setze(() => {
  App.dok.bloecke = [Modell.neuerBlock('absatz', { runs: [{ text: 'Einleitung' }] })];
  Editor.zeichne();
});
await s.locator('.block .tx').first().click();
await s.keyboard.press('Home');
await s.keyboard.type('## '); await s.waitForTimeout(400);
p('"## " am Absatzanfang macht eine Überschrift der Ebene 2',
  await s.evaluate(() => App.dok.bloecke[0].typ === 'ueberschrift' &&
    App.dok.bloecke[0].ebene === 2 && App.dok.bloecke[0].text === 'Einleitung'),
  await s.evaluate(() => JSON.stringify(App.dok.bloecke[0])));
await s.keyboard.type('X'); await s.waitForTimeout(300);
p('die Marke steht am Anfang der neuen Überschrift',
  await s.evaluate(() => App.dok.bloecke[0].text === 'XEinleitung'),
  await s.evaluate(() => App.dok.bloecke[0].text));

await setze(() => {
  App.dok.bloecke = [Modell.neuerBlock('absatz', { runs: [{ text: 'Erster Punkt' }] })];
  Editor.zeichne();
});
await s.locator('.block .tx').first().click();
await s.keyboard.press('Home');
await s.keyboard.type('- '); await s.waitForTimeout(400);
p('"- " macht eine Liste, der Text wird ihr erster Punkt',
  await s.evaluate(() => App.dok.bloecke[0].typ === 'liste' &&
    App.dok.bloecke[0].ordnung === 'punkte' &&
    Richtext.zuText(App.dok.bloecke[0].punkte[0], {}) === 'Erster Punkt'));

await setze(() => {
  App.dok.bloecke = [Modell.neuerBlock('absatz')];
  Editor.zeichne();
});
await s.locator('.block .tx').first().click();
await s.keyboard.type('1. '); await s.waitForTimeout(400);
p('"1. " macht eine nummerierte Liste',
  await s.evaluate(() => App.dok.bloecke[0].typ === 'liste' &&
    App.dok.bloecke[0].ordnung === 'nummern'));

await setze(() => {
  App.dok.bloecke = [Modell.neuerBlock('absatz')];
  Editor.zeichne();
});
await s.locator('.block .tx').first().click();
await s.keyboard.type('> '); await s.waitForTimeout(400);
p('"> " macht ein Blockzitat',
  await s.evaluate(() => App.dok.bloecke[0].typ === 'blockzitat'));

await setze(() => {
  App.dok.quellen = [{ key: 'holland1997', typ: 'buch',
    felder: { autoren: 'Holland, John L.', jahr: '1997', titel: 'T', verlag: 'P' } }];
  App.dok.bloecke = [Modell.neuerBlock('absatz',
    { runs: [{ zitat: 'holland1997', form: 'klammer' }] })];
  Editor.zeichne();
});
await s.locator('.block .tx').first().click();
await s.keyboard.press('Home');
await s.keyboard.type('# '); await s.waitForTimeout(400);
p('mit einem Chip im Absatz wird KEINE Überschrift daraus',
  await s.evaluate(() => App.dok.bloecke[0].typ === 'absatz' &&
    App.dok.bloecke[0].runs.some(r => r.zitat)));

/* ---------------- Umwandeln über die Objektleiste ---------------- */

console.log('\nUmwandeln\n');
await setze(() => {
  App.dok.bloecke = [Modell.neuerBlock('ueberschrift', { ebene: 2, text: 'Methode' })];
  Editor.zeichne();
  Editor.waehle(App.dok.bloecke[0].id, false);
});
p('die Objektleiste bietet das Umwandeln-Feld an',
  await s.evaluate(() => {
    const w = document.querySelector('#kontextleiste .ktx-wandel');
    return w && w.value === 'ueberschrift:2';
  }));
await s.evaluate(() => {
  const w = document.querySelector('#kontextleiste .ktx-wandel');
  w.value = 'absatz';
  w.dispatchEvent(new Event('change'));
});
await s.waitForTimeout(300);
p('Überschrift → Absatz behält den Text',
  await s.evaluate(() => App.dok.bloecke[0].typ === 'absatz' &&
    Richtext.zuText(App.dok.bloecke[0].runs, {}) === 'Methode'),
  await s.evaluate(() => JSON.stringify(App.dok.bloecke[0])));

await setze(() => {
  App.dok.bloecke = [Modell.neuerBlock('liste', { ordnung: 'punkte',
    punkte: [[{ text: 'eins' }], [{ text: 'zwei' }]] })];
  Editor.zeichne();
});
p('Liste → Absätze: je Punkt einer',
  await s.evaluate(() => {
    Editor.wandleUm(App.dok.bloecke[0].id, 'absatz');
    return App.dok.bloecke.length === 2 &&
      App.dok.bloecke.every(b => b.typ === 'absatz') &&
      Richtext.zuText(App.dok.bloecke[1].runs, {}) === 'zwei';
  }));

/* ---------------- /-Menü ---------------- */

console.log('\n/-Menü\n');
await setze(() => {
  App.dok.bloecke = [Modell.neuerBlock('absatz')];
  Editor.zeichne();
});
await s.locator('.block .tx').first().click();
await s.keyboard.type('/seit'); await s.waitForTimeout(300);
p('das /-Menü erscheint und filtert beim Tippen',
  await s.evaluate(() => {
    const l = document.getElementById('slashliste');
    return l && l.textContent.includes('Seitenumbruch') &&
      !l.textContent.includes('Tabelle');
  }));
await s.keyboard.press('Enter'); await s.waitForTimeout(400);
p('Enter fügt ein — der leere Absatz wird ersetzt',
  await s.evaluate(() => App.dok.bloecke.length === 1 &&
    App.dok.bloecke[0].typ === 'seitenumbruch'),
  await s.evaluate(() => JSON.stringify(App.dok.bloecke.map(x => x.typ))));

await setze(() => {
  App.dok.bloecke = [Modell.neuerBlock('absatz', { runs: [{ text: 'Text davor' }] })];
  Editor.zeichne();
});
await s.locator('.block .tx').first().click();
await s.keyboard.press('End');
await s.keyboard.type(' /abs'); await s.waitForTimeout(300);
await s.keyboard.press('Enter'); await s.waitForTimeout(400);
p('im vollen Absatz: das /wort verschwindet, der neue Baustein folgt',
  await s.evaluate(() => App.dok.bloecke.length === 2 &&
    Richtext.zuText(App.dok.bloecke[0].runs, {}).trim() === 'Text davor' &&
    App.dok.bloecke[1].typ === 'absatz'),
  await s.evaluate(() => JSON.stringify(App.dok.bloecke.map(x =>
    Richtext.zuText(x.runs || [], {})))));

/* ---------------- Duplizieren ---------------- */

console.log('\nDuplizieren\n');
await setze(() => {
  App.dok.bloecke = [Modell.neuerBlock('tabelle', { titel: 'Vorlage' })];
  Editor.zeichne();
  Editor.waehle(App.dok.bloecke[0].id, false);
});
await s.keyboard.press('Control+d'); await s.waitForTimeout(400);
p('Strg+D dupliziert den gewählten Baustein',
  await s.evaluate(() => App.dok.bloecke.length === 2 &&
    App.dok.bloecke[1].typ === 'tabelle' && App.dok.bloecke[1].titel === 'Vorlage'),
  await s.evaluate(() => JSON.stringify(App.dok.bloecke.map(x => x.typ))));
p('die Kopie hat eine eigene Id',
  await s.evaluate(() => App.dok.bloecke[0].id !== App.dok.bloecke[1].id));

/* ---------------- Einfügemarke ---------------- */

await s.evaluate(() => Editor.waehle(App.dok.bloecke[0].id, false));
await s.locator('.einfuegen-knoepfe button', { hasText: 'Abbildung' }).hover();
await s.waitForTimeout(200);
p('die Einfügeleiste zeigt beim Überfahren, wo es hinginge',
  await s.evaluate(() => {
    const m = document.querySelector('#blockliste .einfuegemarke');
    return m && m.previousElementSibling ===
      document.querySelector(`.block[data-id="${App.dok.bloecke[0].id}"]`);
  }));

/* ---------------- Suche: Fußnoten, Formeln, Markierung ---------------- */

console.log('\nSuche\n');
await setze(() => {
  App.dok.bloecke = [
    Modell.neuerBlock('absatz', { runs: [
      { text: 'Im Text steht Alpha. ' },
      { fussnote: 'In der Fussnote steht Beta.' }] }),
    Modell.neuerBlock('formel', { tex: '\\beta = 1' })];
  Editor.zeichne();
});
await s.keyboard.press('Control+f'); await s.waitForTimeout(300);
await s.locator('#suche-feld').fill('Beta'); await s.waitForTimeout(250);
p('die Suche findet Fußnotentext und Formel-Quelltext',
  await s.evaluate(() => document.getElementById('suche-stand').textContent === '1 von 2'),
  await s.evaluate(() => document.getElementById('suche-stand').textContent));
await s.locator('#suche-aufklappen').click();
await s.locator('#ersetzen-feld').fill('Gamma');
await s.locator('#knopf-alle-ersetzen').click(); await s.waitForTimeout(400);
p('Ersetzen wirkt in der Fußnote',
  await s.evaluate(() => App.dok.bloecke[0].runs[1].fussnote.includes('Gamma')),
  await s.evaluate(() => App.dok.bloecke[0].runs[1].fussnote));
p('die Formel bleibt beim Ersetzen unangetastet',
  await s.evaluate(() => App.dok.bloecke[1].tex === '\\beta = 1'));
await s.locator('#suche-feld').fill('Alpha'); await s.waitForTimeout(250);
p('alle Treffer sind markiert (CSS Highlight API)',
  await s.evaluate(() => {
    const h = CSS.highlights.get('suchtreffer');
    return !!h && h.size === 1;
  }),
  await s.evaluate(() => String(CSS.highlights.get('suchtreffer')?.size)));
await s.locator('#suche-feld').focus();
await s.keyboard.press('Enter'); await s.waitForTimeout(250);
p('Enter springt zum Treffer und wählt ihn wirklich aus',
  await s.evaluate(() => window.getSelection().toString() === 'Alpha'),
  await s.evaluate(() => JSON.stringify(window.getSelection().toString())));
await s.locator('#suche-feld').focus();
await s.keyboard.press('Escape'); await s.waitForTimeout(250);
p('Schließen nimmt die Markierung weg',
  await s.evaluate(() => !CSS.highlights.get('suchtreffer')));

/* ---------------- B/I zeigen ihren Zustand ---------------- */

console.log('\nFett und kursiv\n');
await setze(() => {
  App.dok.bloecke = [Modell.neuerBlock('absatz', { runs: [{ text: 'fett', b: true }] })];
  Editor.zeichne();
});
await s.locator('.block .tx').first().click();
await s.keyboard.press('Control+a'); await s.waitForTimeout(400);
p('die Auswahlleiste zeigt Fett als aktiv',
  await s.evaluate(() => {
    const b = document.querySelector('#auswahlleiste [data-befehl="bold"]');
    return b && b.classList.contains('aktiv');
  }));
p('die Objektleiste zeigt den Zustand ebenfalls',
  await s.evaluate(() => {
    const b = document.querySelector('#kontextleiste [data-befehl="bold"]');
    return b && b.classList.contains('aktiv');
  }));

/* ---------------- Einfügen in Tabellenzellen ---------------- */

console.log('\nEinfügen in Zellen\n');
await setze(() => {
  App.dok.bloecke = [Modell.neuerBlock('tabelle', {
    kopf: ['A', 'B'], zeilen: [['1', '2'], ['3', '4']],
    spaltenAusrichtung: ['l', 'c'] })];
  Editor.zeichne();
});
p('ein Excel-Bereich verteilt sich zellenweise ab der Zielzelle',
  await s.evaluate(() => {
    const td = document.querySelectorAll('.block tbody tr')[1].cells[1];
    td.focus();
    const dt = new DataTransfer();
    dt.setData('text/plain', 'x\ty\nz\tw');
    td.dispatchEvent(new ClipboardEvent('paste',
      { clipboardData: dt, bubbles: true, cancelable: true }));
    const b = App.dok.bloecke[0];
    return b.kopf.length === 3 && b.zeilen.length === 3 &&
      b.zeilen[1][1] === 'x' && b.zeilen[1][2] === 'y' &&
      b.zeilen[2][1] === 'z' && b.zeilen[2][2] === 'w' &&
      b.zeilen[0].length === 3;
  }),
  await s.evaluate(() => JSON.stringify(App.dok.bloecke[0].zeilen)));

/* ---------------- Abschnitte wandern mit ---------------- */

console.log('\nAbschnitte\n');
const reihenfolge = () => s.evaluate(() => App.dok.bloecke.map(x => x.text ||
  Richtext.zuText(x.runs || [], {})).join(' | '));
await setze(() => {
  App.dok.bloecke = [
    Modell.neuerBlock('ueberschrift', { ebene: 1, text: 'Kapitel A' }),
    Modell.neuerBlock('absatz', { runs: [{ text: 'Text zu A' }] }),
    Modell.neuerBlock('ueberschrift', { ebene: 1, text: 'Kapitel B' }),
    Modell.neuerBlock('absatz', { runs: [{ text: 'Text zu B' }] })];
  Editor.zeichne();
});
await s.evaluate(() => {
  const id = App.dok.bloecke[2].id;
  document.querySelector(`.block[data-id="${id}"] .blockleiste button`).click();
});
await s.waitForTimeout(300);
p('↑ auf einer Überschrift verschiebt ihr ganzes Kapitel',
  await reihenfolge() === 'Kapitel B | Text zu B | Kapitel A | Text zu A',
  await reihenfolge());
await s.evaluate(() => {
  const id = App.dok.bloecke[0].id;
  document.querySelectorAll(`.block[data-id="${id}"] .blockleiste button`)[1].click();
});
await s.waitForTimeout(300);
p('↓ stellt die Reihenfolge wieder her',
  await reihenfolge() === 'Kapitel A | Text zu A | Kapitel B | Text zu B',
  await reihenfolge());
p('Ziehen in der Gliederung ordnet Kapitel samt Inhalt um',
  await s.evaluate(() => {
    const eintraege = document.querySelectorAll('.gl-eintrag');
    const dt = new DataTransfer();
    eintraege[1].dispatchEvent(new DragEvent('dragstart',
      { dataTransfer: dt, bubbles: true }));
    eintraege[0].dispatchEvent(new DragEvent('dragover',
      { dataTransfer: dt, bubbles: true, cancelable: true }));
    eintraege[0].dispatchEvent(new DragEvent('drop',
      { dataTransfer: dt, bubbles: true, cancelable: true }));
    return App.dok.bloecke.map(x => x.text ||
      Richtext.zuText(x.runs || [], {})).join(' | ');
  }) === 'Kapitel B | Text zu B | Kapitel A | Text zu A');

/* ---------------- Auswahlmodus ---------------- */

console.log('\nAuswahlmodus\n');
await setze(() => {
  App.dok.bloecke = [
    Modell.neuerBlock('absatz', { runs: [{ text: 'eins' }] }),
    Modell.neuerBlock('absatz', { runs: [{ text: 'zwei' }] }),
    Modell.neuerBlock('absatz', { runs: [{ text: 'drei' }] })];
  Editor.zeichne();
});
await s.locator('.block .tx').first().click();
await s.keyboard.press('Escape'); await s.waitForTimeout(200);
p('Escape wählt den Baustein als Ganzes',
  await s.evaluate(() => document.querySelectorAll('.block.markiert').length === 1));
await s.keyboard.press('Shift+ArrowDown'); await s.waitForTimeout(200);
p('Umschalt+Pfeil erweitert die Auswahl',
  await s.evaluate(() => document.querySelectorAll('.block.markiert').length === 2));
await s.keyboard.press('Delete'); await s.waitForTimeout(300);
p('Entf löscht die markierten Bausteine',
  await s.evaluate(() => App.dok.bloecke.length === 1 &&
    Richtext.zuText(App.dok.bloecke[0].runs, {}) === 'drei'),
  await reihenfolge());
await s.keyboard.press('Control+z'); await s.waitForTimeout(300);
p('EIN Strg+Z holt beide zurück',
  await s.evaluate(() => App.dok.bloecke.length === 3));
p('Strg+V fügt kopierte Bausteine ein (JSON aus der Zwischenablage)',
  await s.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', JSON.stringify({ schreibtisch: 'bausteine',
      bloecke: [{ typ: 'absatz', runs: [{ text: 'vier' }] }] }));
    document.dispatchEvent(new ClipboardEvent('paste',
      { clipboardData: dt, bubbles: true, cancelable: true }));
    return App.dok.bloecke.length === 4 &&
      App.dok.bloecke.some(b => Richtext.zuText(b.runs || [], {}) === 'vier');
  }),
  await reihenfolge());
await s.keyboard.press('Escape'); await s.waitForTimeout(200);
p('Escape verlässt den Auswahlmodus wieder',
  await s.evaluate(() => document.querySelectorAll('.block.markiert').length === 0));

await setze(() => {
  App.dok.bloecke = [Modell.neuerBlock('tabelle', { titel: 'T' })];
  Editor.zeichne();
  Editor.waehle(App.dok.bloecke[0].id, false);
});
await s.keyboard.press('Escape'); await s.waitForTimeout(200);
await s.keyboard.press('Enter'); await s.waitForTimeout(400);
p('Enter auf einer Tabelle im Auswahlmodus öffnet ihren Dialog',
  await s.evaluate(() => !!document.querySelector('.schleier')));

/* ---------------- Dialog- und Listensemantik ---------------- */

console.log('\nZugänglichkeit\n');
p('der Dialog trägt role="dialog" samt Titelverweis',
  await s.evaluate(() => {
    const d = document.querySelector('.dialog');
    return d && d.getAttribute('role') === 'dialog' &&
      d.getAttribute('aria-modal') === 'true' &&
      !!d.getAttribute('aria-labelledby');
  }));
await s.keyboard.press('Escape'); await s.waitForTimeout(300);
p('Escape schließt den Dialog weiterhin',
  await s.evaluate(() => !document.querySelector('.schleier')));

await setze(() => {
  App.dok.quellen = [{ key: 'holland1997', typ: 'buch',
    felder: { autoren: 'Holland, John L.', jahr: '1997', titel: 'T', verlag: 'P' } }];
  App.dok.bloecke = [Modell.neuerBlock('absatz')];
  Editor.zeichne();
});
await s.locator('.block .tx').first().click();
await s.keyboard.type('@hol'); await s.waitForTimeout(300);
p('die @-Liste ist eine Listbox, das Feld nennt die aktive Option',
  await s.evaluate(() => {
    const l = document.getElementById('atliste');
    const feld = document.activeElement.closest('.tx');
    return !!l && l.getAttribute('role') === 'listbox' &&
      !!l.querySelector('[role="option"][aria-selected="true"]') &&
      feld.getAttribute('aria-activedescendant') === 'at-wahl-0';
  }));
await s.keyboard.press('Escape'); await s.waitForTimeout(200);

console.log(`\n${ok} bestanden, ${fehl} durchgefallen`);
await b.close(); d.kill();
process.exit(fehl ? 1 : 0);
