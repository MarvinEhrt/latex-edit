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

console.log(`\n${ok} bestanden, ${fehl} durchgefallen`);
await b.close(); d.kill();
process.exit(fehl ? 1 : 0);
