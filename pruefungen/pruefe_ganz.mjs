/* Startet den echten Begleiter, fährt die Oberfläche in Chromium hoch
   und prüft den ganzen Weg bis zum fertigen PDF.
       node pruefungen/pruefe_ganz.mjs                                 */

import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = dirname(HIER);
// playwright-core liegt je nach Installation woanders. Ohne Angabe wird
// der übliche Paketname aufgelöst (npm i -D playwright-core).
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');

// Wo die Bildschirmfotos landen, und welcher Chromium benutzt wird.
const BILDER = process.env.SCHREIBTISCH_BILDER || tmpdir();
const BROWSERPFAD = process.env.CHROMIUM || undefined;

const probleme = [];
const schritt = async (name, fn) => {
  const vorher = probleme.length;
  try { await fn(); } catch (f) { probleme.push(`"${name}": ${f.message}`); }
  const neu = probleme.slice(vorher);
  console.log(`  ${neu.length ? '✗' : '✓'} ${name}` +
              (neu.length ? '\n      ' + neu.join('\n      ') : ''));
};

/* ---------------- Begleiter starten ---------------- */

const dienst = spawn('python3', ['-u', join(WURZEL, 'schreibtisch.py')],
                     { cwd: WURZEL, env: { ...process.env, BROWSER: 'true' } });
let adresse = '';
dienst.stdout.on('data', (d) => {
  const t = d.toString();
  const m = t.match(/http:\/\/127\.0\.0\.1:\d+\/\?t=[\w-]+/);
  if (m) adresse = m[0];
});
dienst.stderr.on('data', (d) => probleme.push('Dienst: ' + d.toString().slice(0, 300)));

for (let i = 0; i < 100 && !adresse; i++) await new Promise(r => setTimeout(r, 100));
if (!adresse) { console.log('Begleiter meldet keine Adresse'); dienst.kill(); process.exit(1); }

console.log('\nGesamtprüfung\n');
console.log('  Begleiter läuft auf', adresse.replace(/t=[\w-]+/, 't=…'));

const browser = await chromium.launch({
  executablePath: BROWSERPFAD,     // ohne Angabe nimmt playwright seinen eigenen
  args: ['--no-sandbox', '--disable-gpu']
});
const seite = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
seite.on('console', m => { if (m.type() === 'error') probleme.push('console: ' + m.text().slice(0, 200)); });
seite.on('pageerror', f => probleme.push('pageerror: ' + f.message));

await seite.goto(adresse);
await seite.waitForTimeout(1200);

await schritt('Begleiter ist verbunden', async () => {
  if (!await seite.evaluate(() => Begleiter.verbunden))
    throw new Error('Zeichen kam nicht an');
});

await schritt('pdflatex und biber gefunden', async () => {
  const w = await seite.evaluate(() => Begleiter.pruefung());
  if (!w.vollstaendig) throw new Error(JSON.stringify(w.programme));
});

await seite.locator('.dialog .knopf-haupt').first().click().catch(() => {});
await seite.waitForTimeout(300);

await schritt('Gliederung und Bausteine gezeichnet', async () => {
  if (await seite.locator('.gl-eintrag').count() < 5) throw new Error('zu wenig Gliederung');
  if (await seite.locator('.block').count() < 8) throw new Error('zu wenig Bausteine');
});

await schritt('erstes PDF entsteht von selbst', async () => {
  await seite.waitForFunction(
    () => document.querySelector('#bauzustand')?.className.includes('ok'),
    { timeout: 90000 });
  const quelle = await seite.getAttribute('#pdfrahmen', 'src');
  if (!quelle || !quelle.includes('/pdf')) throw new Error('kein PDF im Rahmen: ' + quelle);
});

await schritt('PDF ist über den Begleiter abrufbar', async () => {
  const laenge = await seite.evaluate(async () => {
    const a = await fetch(Begleiter.pdfAdresse(1));
    const b = await a.arrayBuffer();
    return b.byteLength;
  });
  if (laenge < 8000) throw new Error('PDF zu klein: ' + laenge);
});

await schritt('Tippen löst einen neuen Bau aus', async () => {
  await seite.locator('.block .tx').nth(1).click();
  await seite.keyboard.press('Control+a');
  await seite.keyboard.type('Diese Arbeit untersucht den Zusammenhang zwischen Interesse und Zufriedenheit.');
  await seite.waitForFunction(
    () => document.querySelector('#bauzustand')?.className.includes('laeuft')
       || document.querySelector('#bauzustand')?.className.includes('wartet'),
    { timeout: 8000 });
  await seite.waitForFunction(
    () => document.querySelector('#bauzustand')?.className.includes('ok'),
    { timeout: 90000 });
});

await schritt('Quellen aus einer BibTeX-Datei übernehmen', async () => {
  const bib = join(tmpdir(), 'pruefung-quellen.bib');
  writeFileSync(bib, `@book{holland1997,
  author={Holland, John L.}, title={Making vocational choices},
  year={1997}, publisher={PAR}, edition={3}}
@article{mueller2020,
  author={M{\\"u}ller, Hans and Wei{\\ss}, Anna},
  title={Arbeitszufriedenheit}, journal={Zeitschrift},
  volume={45}, pages={113--127}, year={2020}}`);
  await seite.click('#knopf-import');
  await seite.waitForSelector('.dialog', { timeout: 5000 });
  await seite.setInputFiles('.dialog input[type=file]', bib);
  await seite.waitForTimeout(600);
  if (!(await seite.locator('.dialog .quelle-zeile').count()))
    throw new Error('keine Vorschau der Quellen');
  await seite.locator('.dialog-fuss .knopf-haupt').click();
  await seite.waitForTimeout(400);
  const anzahl = await seite.evaluate(() => App.dok.quellen.length);
  if (anzahl !== 2) throw new Error('erwartet 2 Quellen, sind ' + anzahl);
  const umlaut = await seite.evaluate(() => App.dok.quellen[1].felder.autoren);
  if (!umlaut.includes('Müller')) throw new Error('Umlaut nicht entschlüsselt: ' + umlaut);
});

await schritt('kaputte Formel wird auf den Baustein zurückgeführt', async () => {
  await seite.evaluate(() => {
    const b = Modell.neuerBlock('formel', { tex: 'r = \\gibtesnicht{a}' });
    App.dok.bloecke.push(b);
    window.__kaputt = b.id;
    Editor.zeichne();
    App.baue();
  });
  await seite.waitForFunction(
    () => document.querySelector('#bauzustand')?.className.includes('fehler'),
    { timeout: 90000 });
  if (!(await seite.locator('.fehlerliste .fehler').count()))
    throw new Error('keine Fehlerliste');
  const markiert = await seite.evaluate(
    () => !!document.querySelector(`.block[data-id="${window.__kaputt}"].hatfehler`));
  if (!markiert) throw new Error('Baustein nicht markiert');
  const text = await seite.locator('.fehlerliste').innerText();
  if (!/Befehl|LaTeX/i.test(text)) throw new Error('Meldung unverständlich: ' + text.slice(0, 120));
});

await schritt('Vorabprüfung meldet offene Klammer ohne LaTeX-Lauf', async () => {
  await seite.evaluate(() => {
    App.dok.bloecke = App.dok.bloecke.filter(b => b.id !== window.__kaputt);
    const b = Modell.neuerBlock('formel', { tex: '\\frac{a}{b' });
    App.dok.bloecke.push(b);
    window.__offen = b.id;
    Editor.zeichne(); App.baue();
  });
  await seite.waitForTimeout(2500);
  const text = await seite.locator('.fehlerliste').innerText();
  if (!/VORAB/.test(text) || !/Klammer/.test(text))
    throw new Error('Vorabhinweis fehlt: ' + text.slice(0, 160));
});

await schritt('nach Reparatur wird wieder gebaut', async () => {
  await seite.evaluate(() => {
    App.dok.bloecke = App.dok.bloecke.filter(b => b.id !== window.__offen);
    Editor.zeichne(); App.baue();
  });
  await seite.waitForFunction(
    () => document.querySelector('#bauzustand')?.className.includes('ok'),
    { timeout: 90000 });
});

await schritt('Sichern und wieder öffnen', async () => {
  await seite.evaluate(() => { App.dok.meta.titel = 'Prüfarbeit Interessen'; });
  await seite.click('#knopf-sichern');
  await seite.waitForTimeout(900);
  const liste = await seite.evaluate(() => Begleiter.projekte());
  if (!liste.projekte.length) throw new Error('nichts gesichert');
  await seite.click('#knopf-oeffnen');
  // Der Dialog erscheint sofort, die Liste kommt erst nach der Anfrage
  // an den Begleiter -- also auf die Zeilen warten, nicht auf den Rahmen.
  await seite.waitForSelector('.dialog .quelle-zeile', { timeout: 8000 });
  await seite.locator('.dialog .quelle-zeile').first().click();
  await seite.waitForTimeout(900);
  const titel = await seite.evaluate(() => App.dok.meta.titel);
  if (titel !== 'Prüfarbeit Interessen') throw new Error('Titel nach Öffnen: ' + titel);
});

await schritt('erzeugtes LaTeX enthält, was es soll', async () => {
  await seite.click('#knopf-tex');
  await seite.waitForSelector('.texblick', { timeout: 5000 });
  const tex = await seite.locator('.texblick').innerText();
  for (const muss of ['\\documentclass', '\\literaturverzeichnis', '\\deckblatt'])
    if (!tex.includes(muss)) throw new Error('fehlt: ' + muss);
  await seite.click('.dialog-fuss .knopf-haupt');
});

// Falls ein Schritt einen Dialog offen gelassen hat: wegräumen,
// sonst blockiert der Schleier die folgenden Klicks.
await seite.keyboard.press('Escape').catch(() => {});
await seite.waitForTimeout(400);
await seite.evaluate(() => window.getSelection().removeAllRanges());
await seite.waitForTimeout(300);
await seite.screenshot({ path: join(BILDER, 'st-hell.png') });
await seite.click('#knopf-thema');
await seite.waitForTimeout(600);
await seite.evaluate(() => window.getSelection().removeAllRanges());
await seite.waitForTimeout(300);
await seite.screenshot({ path: join(BILDER, 'st-dunkel.png') });

console.log('\n--- Zusammenfassung ---');
console.log(probleme.length ? `${probleme.length} Problem(e):\n  ` + probleme.join('\n  ')
                            : 'Alle Schritte durchgelaufen, keine Konsolenfehler.');

await browser.close();
dienst.kill('SIGTERM');
process.exit(probleme.length ? 1 : 0);
