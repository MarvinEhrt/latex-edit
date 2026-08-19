/* Prüft das Verhalten der Bausteine im Editor: Absätze teilen und
   zusammenführen, ohne Zitat-Chips zu zerreißen.
       node pruefungen/pruefe_bausteine.mjs                            */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pw = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const chromium = pw.chromium || pw.default?.chromium;   // je nach Fassung benannt oder default
const W = dirname(dirname(fileURLToPath(import.meta.url)));
const ABLAGE=mkdtempSync(join(tmpdir(),'schreibtisch-bausteine-'));   // eigener Ordner je Lauf
const d=spawn('python3',['-u',W+'/schreibtisch.py'],
  {cwd:W,env:{...process.env,SCHREIBTISCH_ARBEITEN:ABLAGE}});
let adr=''; d.stdout.on('data',x=>{const m=x.toString().match(/http:\S+/); if(m)adr=m[0];});
for(let i=0;i<80&&!adr;i++) await new Promise(r=>setTimeout(r,100));
const b=await chromium.launch({executablePath:process.env.CHROMIUM || undefined,
  args:['--no-sandbox','--disable-gpu']});
const s=await b.newPage(); s.on('pageerror',f=>console.log('PAGEERROR:',f.message));
await s.goto(adr); await s.waitForTimeout(1500);
await s.locator('.dialog .knopf-haupt').first().click().catch(()=>{});
await s.waitForTimeout(400);

let ok=0,fehl=0;
const p=(n,b2,h='')=>{(b2?ok++:fehl++);console.log(`  ${b2?'✓':'✗'} ${n}${b2?'':'\n      '+h}`);};
const txt = () => s.evaluate(() => App.dok.bloecke
  .filter(x=>x.typ==='absatz').map(x=>Richtext.zuText(x.runs,{quellen:App.dok.quellen,verweisText:()=>'[V]'})));

const setze = (js) => s.evaluate(js).then(()=>s.waitForTimeout(350));

console.log('\nAbsatzprüfung\n');

// A) Enter mitten im Satz
await setze(()=>{App.dok.bloecke=[Modell.neuerBlock('absatz',{runs:[{text:'ErsterTeil ZweiterTeil'}]})];Editor.zeichne();});
await s.locator('.block .tx').first().click();
await s.keyboard.press('Home');
for(let i=0;i<10;i++) await s.keyboard.press('ArrowRight');
await s.keyboard.press('Enter'); await s.waitForTimeout(450);
let t = await txt();
p('Enter teilt den Absatz an der Marke',
  t.length===2 && t[0]==='ErsterTeil' && t[1]===' ZweiterTeil', JSON.stringify(t));

// A2) danach weitertippen landet im neuen Absatz
await s.keyboard.type('X'); await s.waitForTimeout(400);
t = await txt();
p('Schreibmarke steht im neuen Absatz', t[1]==='X ZweiterTeil', JSON.stringify(t));

// B) Rücktaste am Anfang verschmilzt
await setze(()=>{App.dok.bloecke=[
  Modell.neuerBlock('absatz',{runs:[{text:'Absatz eins'}]}),
  Modell.neuerBlock('absatz',{runs:[{text:'Absatz zwei'}]})];Editor.zeichne();});
await s.locator('.block .tx').nth(1).click();
await s.keyboard.press('Home');
await s.keyboard.press('Backspace'); await s.waitForTimeout(450);
t = await txt();
p('Rücktaste am Anfang führt zusammen',
  t.length===1 && t[0]==='Absatz einsAbsatz zwei', JSON.stringify(t));

// B2) Marke steht an der Nahtstelle
await s.keyboard.type('|'); await s.waitForTimeout(400);
t = await txt();
p('Schreibmarke steht an der Nahtstelle', t[0]==='Absatz eins|Absatz zwei', JSON.stringify(t));

// C) Teilen mit Zitat im hinteren Stück
await setze(()=>{
  App.dok.quellen=[{key:'holland1997',typ:'buch',felder:{autoren:'Holland, John L.',jahr:'1997',titel:'T',verlag:'P'}}];
  App.dok.bloecke=[Modell.neuerBlock('absatz',{runs:[
    {text:'Vorne '},{zitat:'holland1997',form:'klammer'},{text:' hinten'}]})];
  Editor.zeichne();});
await s.locator('.block .tx').first().click();
await s.keyboard.press('Home');
for(let i=0;i<6;i++) await s.keyboard.press('ArrowRight');   // hinter "Vorne "
await s.keyboard.press('Enter'); await s.waitForTimeout(450);
const runs = await s.evaluate(()=>App.dok.bloecke.map(x=>x.runs));
p('Zitat bleibt beim Teilen unversehrt',
  JSON.stringify(runs).includes('"zitat":"holland1997"') &&
  runs.filter(r=>r&&r.some&&r.some(x=>x.zitat)).length===1, JSON.stringify(runs));
p('Chip landet im hinteren Absatz',
  runs[1] && runs[1][0] && runs[1][0].zitat==='holland1997', JSON.stringify(runs[1]));

// D) Zusammenführen, wenn vorne ein Chip steht -> Marke hinter dem Chip
await setze(()=>{
  App.dok.bloecke=[
    Modell.neuerBlock('absatz',{runs:[{text:'A '},{zitat:'holland1997',form:'klammer'}]}),
    Modell.neuerBlock('absatz',{runs:[{text:'B'}]})];
  Editor.zeichne();});
await s.locator('.block .tx').nth(1).click();
await s.keyboard.press('Home');
await s.keyboard.press('Backspace'); await s.waitForTimeout(450);
await s.keyboard.type('|'); await s.waitForTimeout(400);
const r2 = await s.evaluate(()=>App.dok.bloecke[0].runs);
p('Marke landet hinter dem Chip, nicht darin',
  JSON.stringify(r2).includes('"text":"|B"') && r2.some(x=>x.zitat), JSON.stringify(r2));

// E) Umschalt+Enter unverändert
await setze(()=>{App.dok.bloecke=[Modell.neuerBlock('absatz',{runs:[{text:'Zeile A'}]})];Editor.zeichne();});
await s.locator('.block .tx').first().click();
await s.keyboard.press('End');
await s.keyboard.down('Shift'); await s.keyboard.press('Enter'); await s.keyboard.up('Shift');
await s.keyboard.type('Zeile B'); await s.waitForTimeout(400);
const r3 = await s.evaluate(()=>App.dok.bloecke[0].runs);
p('Umschalt+Enter bleibt Zeilenumbruch',
  JSON.stringify(r3).includes('\\n'), JSON.stringify(r3));

// F) Rücktaste am Anfang des ersten Absatzes tut nichts
await setze(()=>{App.dok.bloecke=[Modell.neuerBlock('absatz',{runs:[{text:'Einziger'}]})];Editor.zeichne();});
await s.locator('.block .tx').first().click();
await s.keyboard.press('Home'); await s.keyboard.press('Backspace'); await s.waitForTimeout(400);
t = await txt();
p('erster Absatz bleibt bei Rücktaste unversehrt', t.length===1 && t[0]==='Einziger', JSON.stringify(t));


// ---------------------------------------------- Bilder und Tabellen

const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// G) Tabelle aus Excel einfügen
await setze(()=>{App.dok.bloecke=[Modell.neuerBlock('absatz',{runs:[{text:'Text'}]})];Editor.zeichne();});
await s.evaluate(() => {
  const feld = document.querySelector('.block .tx');
  feld.focus();
  const dt = new DataTransfer();
  dt.setData('text/plain', 'Skala\tM\tSD\nRealistic\t89,4\t12,1\nInvestigative\t97,2\t11,8');
  feld.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
});
await s.waitForTimeout(500);
let tab = await s.evaluate(()=>App.dok.bloecke.find(b=>b.typ==='tabelle'));
p('Excel-Bereich wird zur Tabelle',
  tab && tab.kopf.join('|')==='Skala|M|SD' && tab.zeilen.length===2, JSON.stringify(tab));
p('erste Spalte links, Zahlenspalten zentriert',
  tab && tab.spaltenAusrichtung.join('')==='lcc', JSON.stringify(tab&&tab.spaltenAusrichtung));

// H) Fließtext bleibt Fließtext
await setze(()=>{App.dok.bloecke=[Modell.neuerBlock('absatz',{runs:[]})];Editor.zeichne();});
await s.evaluate(() => {
  const feld = document.querySelector('.block .tx');
  feld.focus();
  const dt = new DataTransfer();
  dt.setData('text/plain', 'Erster Satz.\nZweiter Satz.');
  feld.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
});
await s.waitForTimeout(450);
p('mehrzeiliger Fließtext wird keine Tabelle',
  !(await s.evaluate(()=>App.dok.bloecke.some(b=>b.typ==='tabelle'))),
  JSON.stringify(await s.evaluate(()=>App.dok.bloecke.map(b=>b.typ))));

// I) Bildschirmfoto einfügen
await setze(()=>{App.dok.bloecke=[Modell.neuerBlock('absatz',{runs:[{text:'Text'}]})];Editor.zeichne();});
await s.evaluate((b64) => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const datei = new File([bytes], 'bildschirmfoto.png', {type:'image/png'});
  const dt = new DataTransfer();
  dt.items.add(datei);
  const feld = document.querySelector('.block .tx');
  feld.focus();
  feld.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
}, PNG);
await s.waitForTimeout(700);
let abb = await s.evaluate(()=>App.dok.bloecke.find(b=>b.typ==='abbildung'));
p('Bild aus der Zwischenablage wird zur Abbildung',
  abb && abb.datenUrl.startsWith('data:image/png'), JSON.stringify(abb && abb.dateiname));

// J) Bild in den Text ziehen
await setze(()=>{App.dok.bloecke=[
  Modell.neuerBlock('absatz',{runs:[{text:'Eins'}]}),
  Modell.neuerBlock('absatz',{runs:[{text:'Zwei'}]})];Editor.zeichne();});
await s.evaluate((b64) => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], 'gezogen.png', {type:'image/png'}));
  const liste = document.getElementById('blockliste');
  const zweiter = document.querySelectorAll('.block')[1].getBoundingClientRect();
  const opt = {dataTransfer: dt, bubbles: true, cancelable: true,
               clientX: zweiter.left + 10, clientY: zweiter.top + 2};
  liste.dispatchEvent(new DragEvent('dragover', opt));
  liste.dispatchEvent(new DragEvent('drop', opt));
}, PNG);
await s.waitForTimeout(700);
const typen = await s.evaluate(()=>App.dok.bloecke.map(b=>b.typ));
p('gezogenes Bild landet an der Ablagestelle',
  typen.join(',')==='absatz,abbildung,absatz', typen.join(','));

// K) Tabellenwerkzeuge
await setze(()=>{App.dok.bloecke=[Modell.neuerBlock('tabelle',
  {kopf:['A','B'],zeilen:[['1','2']],spaltenAusrichtung:['l','c']})];Editor.zeichne();});
await s.locator('.tabellenknoepfe .knopf', {hasText:'+ Zeile'}).click();
await s.waitForTimeout(350);
await s.locator('.tabellenknoepfe .knopf', {hasText:'+ Spalte'}).click();
await s.waitForTimeout(350);
const t2 = await s.evaluate(()=>App.dok.bloecke[0]);
p('Zeile und Spalte lassen sich anfügen',
  t2.zeilen.length===2 && t2.kopf.length===3 && t2.zeilen[0].length===3,
  JSON.stringify({z:t2.zeilen.length,s:t2.kopf.length}));

await s.locator('.block .zeileweg').first().click();
await s.waitForTimeout(350);
p('Zeile lässt sich löschen',
  (await s.evaluate(()=>App.dok.bloecke[0].zeilen.length))===1);


// ---------------------------------------------- Rückgängig

const frisch = async (js) => { await setze(js); await s.evaluate(()=>Verlauf.leeren()); };
const zurueck = async () => { await s.keyboard.press('Control+z'); await s.waitForTimeout(400); };
const vor     = async () => { await s.keyboard.press('Control+y'); await s.waitForTimeout(400); };

// L) gelöschter Baustein kommt zurück
await frisch(()=>{App.dok.bloecke=[
  Modell.neuerBlock('absatz',{runs:[{text:'Bleibt'}]}),
  Modell.neuerBlock('absatz',{runs:[{text:'Verschwindet'}]})];Editor.zeichne();});
await s.locator('.block').nth(1).click();
await s.locator('.block').nth(1).locator('.gefahr').click();
await s.waitForTimeout(400);
p('Löschen entfernt den Baustein', (await txt()).length===1, JSON.stringify(await txt()));
await zurueck();
t = await txt();
p('Strg+Z holt den gelöschten Baustein zurück',
  t.length===2 && t[1]==='Verschwindet', JSON.stringify(t));

// L2) und Strg+Y löscht ihn wieder
await vor();
p('Strg+Y löscht ihn erneut', (await txt()).length===1, JSON.stringify(await txt()));

// M) Zusammenführen zurücknehmen
await frisch(()=>{App.dok.bloecke=[
  Modell.neuerBlock('absatz',{runs:[{text:'Absatz eins'}]}),
  Modell.neuerBlock('absatz',{runs:[{text:'Absatz zwei'}]})];Editor.zeichne();});
await s.locator('.block .tx').nth(1).click();
await s.keyboard.press('Home');
await s.keyboard.press('Backspace'); await s.waitForTimeout(450);
p('Rücktaste führt zusammen', (await txt()).length===1, JSON.stringify(await txt()));
await zurueck();
t = await txt();
p('Strg+Z trennt die zusammengeführten Absätze wieder',
  t.length===2 && t[0]==='Absatz eins' && t[1]==='Absatz zwei', JSON.stringify(t));

// N) Tippen wird zu EINEM Schritt zusammengefasst
await frisch(()=>{App.dok.bloecke=[Modell.neuerBlock('absatz',{runs:[{text:'Start'}]})];Editor.zeichne();});
await s.locator('.block .tx').first().click();
await s.keyboard.press('End');
await s.keyboard.type('abcdef'); await s.waitForTimeout(400);
p('Getipptes steht im Modell', (await txt())[0]==='Startabcdef', JSON.stringify(await txt()));
await zurueck();
t = await txt();
p('ein Strg+Z nimmt den ganzen Tippfluss zurück', t[0]==='Start', JSON.stringify(t));

// N2) Schreibmarke steht wieder an der Tippstelle
await s.keyboard.type('!'); await s.waitForTimeout(400);
t = await txt();
p('Schreibmarke landet wieder an der alten Stelle', t[0]==='Start!', JSON.stringify(t));

// O) Verschieben zurücknehmen
await frisch(()=>{App.dok.bloecke=[
  Modell.neuerBlock('absatz',{runs:[{text:'Eins'}]}),
  Modell.neuerBlock('absatz',{runs:[{text:'Zwei'}]})];Editor.zeichne();});
await s.locator('.block').first().click();
await s.locator('.block').first().locator('.blockleiste button', {hasText:'↓'}).click();
await s.waitForTimeout(400);
p('Baustein wandert nach unten', (await txt()).join(',')==='Zwei,Eins', (await txt()).join(','));
await zurueck();
p('Strg+Z stellt die Reihenfolge wieder her',
  (await txt()).join(',')==='Eins,Zwei', (await txt()).join(','));

// P) eingefügte Tabelle zurücknehmen
await frisch(()=>{App.dok.bloecke=[Modell.neuerBlock('absatz',{runs:[{text:'Text'}]})];Editor.zeichne();});
await s.evaluate(() => {
  const feld = document.querySelector('.block .tx');
  feld.focus();
  const dt = new DataTransfer();
  dt.setData('text/plain', 'A\tB\n1\t2');
  feld.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
});
await s.waitForTimeout(500);
p('eingefügte Tabelle ist da',
  await s.evaluate(()=>App.dok.bloecke.some(b=>b.typ==='tabelle')));
await zurueck();
p('Strg+Z nimmt die eingefügte Tabelle zurück',
  !(await s.evaluate(()=>App.dok.bloecke.some(b=>b.typ==='tabelle'))),
  JSON.stringify(await s.evaluate(()=>App.dok.bloecke.map(b=>b.typ))));

// Q) leerer Verlauf schadet nicht
await frisch(()=>{App.dok.bloecke=[Modell.neuerBlock('absatz',{runs:[{text:'Unberührt'}]})];Editor.zeichne();});
await zurueck(); await zurueck();
p('Strg+Z ohne Verlauf lässt alles stehen',
  (await txt()).join(',')==='Unberührt', (await txt()).join(','));
p('die Knöpfe sind dann ausgeschaltet',
  await s.evaluate(()=>document.getElementById('knopf-zurueck').disabled &&
                       document.getElementById('knopf-vor').disabled));

// R) Schnappschüsse teilen die Bilddaten, statt sie zu kopieren
const speicher = await s.evaluate(() => {
  const gross = 'x'.repeat(2 * 1024 * 1024);          // 2 MB wie ein Bildschirmfoto
  App.dok.bloecke = [Modell.neuerBlock('abbildung', {datenUrl: 'data:image/png;base64,' + gross})];
  Verlauf.leeren();
  for (let i = 0; i < 40; i++) { Verlauf.merke(App.dok); Verlauf.schnitt(); }
  return Verlauf.tiefe();
});
p('40 Schnappschüsse mit 2-MB-Bild kosten keine 80 MB', speicher===40, String(speicher));

// ---------------------------------------------- Mehrere Quellen zitieren

await frisch(()=>{
  App.dok.quellen=[
    {key:'schmidt2021',typ:'buch',felder:{autoren:'Schmidt, Anna',jahr:'2021',titel:'A',verlag:'V'}},
    {key:'mueller2020',typ:'buch',felder:{autoren:'Müller, Bernd; Weber, Clara',jahr:'2020',titel:'B',verlag:'V'}}];
  App.dok.bloecke=[Modell.neuerBlock('absatz',{runs:[{text:'Belegt '}]})];
  Editor.zeichne();});
await s.locator('.block .tx').first().click();
await s.keyboard.press('End');
await s.locator('.blockleiste button[title^="Quelle zitieren"]').first().click();
await s.waitForSelector('.dialog', {timeout:5000});
await s.locator('.dialog .quelle-zeile').nth(0).click();
await s.waitForTimeout(150);
p('eine Quelle: Seitenfeld bleibt benutzbar',
  !(await s.evaluate(()=>document.getElementById('f_seite').disabled)));
await s.locator('.dialog .quelle-zeile').nth(1).click();
await s.waitForTimeout(150);
p('zwei Quellen: Seitenfeld wird gesperrt',
  await s.evaluate(()=>document.getElementById('f_seite').disabled));
const schau = await s.locator('.dialog .notiz').innerText();
p('die Vorschau zeigt eine Klammer mit Semikolon',
  /\(Müller & Weber, 2020; Schmidt, 2021\)/.test(schau), schau);
await s.locator('.dialog .knopf-haupt', {hasText:'Einfügen'}).click();
await s.waitForTimeout(500);
const zit = await s.evaluate(()=>App.dok.bloecke[0].runs.find(r=>r.zitat));
p('beide Schlüssel stehen in EINEM Zitat',
  zit && zit.zitat.split(',').sort().join(',')==='mueller2020,schmidt2021', JSON.stringify(zit));
p('keine Seitenzahl bei mehreren Quellen', zit && !zit.seite, JSON.stringify(zit));
p('der Chip im Text zeigt beide Quellen',
  /Müller & Weber, 2020; Schmidt, 2021/.test(await s.locator('.block .chip-zitat').innerText()),
  await s.locator('.block .chip-zitat').innerText());
await zurueck();
p('Strg+Z nimmt auch das Mehrfachzitat zurück',
  !(await s.evaluate(()=>App.dok.bloecke[0].runs.some(r=>r.zitat))),
  JSON.stringify(await s.evaluate(()=>App.dok.bloecke[0].runs)));

// ---------------------------------------------- Chips bearbeiten

// S) Zitat-Chip anklicken: Dialog vorbelegt, Änderung ersetzt den Run
await frisch(()=>{
  App.dok.quellen=[{key:'holland1997',typ:'buch',felder:{autoren:'Holland, John L.',jahr:'1997',titel:'T',verlag:'P'}}];
  App.dok.bloecke=[Modell.neuerBlock('absatz',{runs:[
    {text:'Vorne '},{zitat:'holland1997',form:'klammer',seite:'12'},{text:' hinten'}]})];
  Editor.zeichne();});
await s.locator('.block .chip-zitat').click();
await s.waitForSelector('.dialog', {timeout:5000});
p('Zitat-Dialog zeigt die Quelle als gewählt',
  await s.evaluate(()=>document.querySelector('.dialog .quelle-zeile').classList.contains('gewaehlt')));
p('die Seitenzahl ist vorbelegt',
  (await s.evaluate(()=>document.getElementById('f_seite').value))==='12',
  await s.evaluate(()=>document.getElementById('f_seite').value));
await s.fill('#f_seite','99');
await s.locator('.dialog .knopf-haupt', {hasText:'Übernehmen'}).click();
await s.waitForTimeout(500);
let zr = await s.evaluate(()=>App.dok.bloecke[0].runs.filter(r=>r.zitat));
p('genau EIN Zitat-Run mit neuer Seitenzahl',
  zr.length===1 && zr[0].seite==='99', JSON.stringify(await s.evaluate(()=>App.dok.bloecke[0].runs)));
await zurueck();
zr = await s.evaluate(()=>App.dok.bloecke[0].runs.filter(r=>r.zitat));
p('Strg+Z stellt die alte Seitenzahl her',
  zr.length===1 && zr[0].seite==='12', JSON.stringify(zr));

// T) Fußnoten-Chip: Textanfang sichtbar, Text im Dialog änderbar
await frisch(()=>{
  App.dok.bloecke=[Modell.neuerBlock('absatz',{runs:[
    {text:'Text'},{fussnote:'Vgl. dazu auch die ältere Literatur.'}]})];
  Editor.zeichne();});
p('Fußnoten-Chip zeigt den Textanfang',
  (await s.locator('.block .chip-fussnote').innerText()).includes('Vgl. dazu auch'),
  await s.locator('.block .chip-fussnote').innerText());
await s.locator('.block .chip-fussnote').click();
await s.waitForSelector('.dialog', {timeout:5000});
p('Fußnoten-Dialog zeigt den Text',
  (await s.evaluate(()=>document.getElementById('f_text').value))==='Vgl. dazu auch die ältere Literatur.',
  await s.evaluate(()=>document.getElementById('f_text').value));
await s.fill('#f_text','Neuer Fußnotentext.');
await s.locator('.dialog .knopf-haupt').click();
await s.waitForTimeout(500);
p('geänderter Fußnotentext steht im Modell',
  (await s.evaluate(()=>App.dok.bloecke[0].runs.find(r=>r.fussnote!=null).fussnote))==='Neuer Fußnotentext.',
  JSON.stringify(await s.evaluate(()=>App.dok.bloecke[0].runs)));

// U) Kennwert-Chip entfernen: Run weg, umgebender Text intakt
await frisch(()=>{
  App.dok.bloecke=[Modell.neuerBlock('absatz',{runs:[
    {text:'Wert '},{kennwert:'SW',wert:'104'},{text:' Ende'}]})];
  Editor.zeichne();});
await s.locator('.block .chip-kennwert').click();
await s.waitForSelector('.dialog', {timeout:5000});
await s.locator('.dialog .knopf-gefahr', {hasText:'Entfernen'}).click();
await s.waitForTimeout(500);
const kr = await s.evaluate(()=>App.dok.bloecke[0].runs);
p('Entfernen löscht den Kennwert-Run, der Text bleibt',
  !kr.some(r=>r.kennwert) && (await txt())[0]==='Wert  Ende', JSON.stringify(kr));

// ---------------------------------------------- Sprache der Arbeit

await frisch(()=>{
  App.dok.quellen=[{key:'mueller2020',typ:'buch',
    felder:{autoren:'Müller, Bernd; Weber, Clara',jahr:'2020',titel:'B',verlag:'V'}}];
  const tab=Modell.neuerBlock('tabelle',{titel:'T',kopf:['A'],zeilen:[['1']],spaltenAusrichtung:['l']});
  App.dok.bloecke=[tab, Modell.neuerBlock('absatz',{runs:[
    {zitat:'mueller2020',form:'narrativ'},{text:' — '},{verweis:tab.id}]})];
  App.dok.einstellungen.sprache='de';
  Editor.zeichne();});
let chips = await s.evaluate(()=>[...document.querySelectorAll('.block .chip')].map(c=>c.textContent));
p('auf Deutsch: „und“ und „Tabelle“',
  chips.join(' ').includes('und Weber (2020)') && chips.join(' ').includes('Tabelle 1'),
  chips.join(' | '));
p('das Textfeld ist als deutsch ausgezeichnet',
  await s.evaluate(()=>document.querySelector('.block .tx').lang)==='de');

/* Über den Layout-Dialog umstellen, nicht am Modell vorbei */
await s.click('#knopf-layout');
await s.waitForSelector('.dialog', {timeout:5000});
await s.selectOption('#f_sprache','en');
await s.locator('.dialog .knopf-haupt', {hasText:'Übernehmen'}).click();
await s.waitForTimeout(500);
chips = await s.evaluate(()=>[...document.querySelectorAll('.block .chip')].map(c=>c.textContent));
p('auf Englisch: „and“ und „Table“',
  chips.join(' ').includes('and Weber (2020)') && chips.join(' ').includes('Table 1'),
  chips.join(' | '));
p('das Textfeld ist jetzt als englisch ausgezeichnet',
  await s.evaluate(()=>document.querySelector('.block .tx').lang)==='en');
p('das erzeugte LaTeX bekommt die Sprachoption',
  await s.evaluate(()=>Latex.erzeuge(App.dok).dateien['arbeit.tex'].includes(',englisch]{arbeit-stil}')));
await zurueck();
p('Strg+Z nimmt auch den Sprachwechsel zurück',
  await s.evaluate(()=>App.dok.einstellungen.sprache)==='de',
  await s.evaluate(()=>App.dok.einstellungen.sprache));

console.log(`\n  ${ok} bestanden, ${fehl} durchgefallen`);
await b.close(); d.kill();
rmSync(ABLAGE,{recursive:true,force:true});
process.exit(fehl?1:0);
