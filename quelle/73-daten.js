/* ===================================================================
   73-daten.js  --  Zahlenmaterial aus Excel, SPSS, CSV verstehen
   -------------------------------------------------------------------
   Wird von Tabellen und Diagrammen gleichermaßen benutzt. Deutsches
   Excel schreibt Semikolon als Trenner und Komma als Dezimalzeichen,
   englisches Komma und Punkt — beides muss ankommen, ohne dass jemand
   etwas einstellen muss.
   =================================================================== */

const Daten = (() => {

  /* ---------- Trennzeichen erkennen ---------- */

  function trennzeichen(zeilen) {
    const kandidaten = ['\t', ';', ',', '|'];
    let bester = '\t', bestwert = -1;
    for (const t of kandidaten) {
      const zahlen = zeilen.slice(0, 12).map(z => z.split(t).length);
      if (zahlen.some(n => n < 2)) continue;
      // Gleichmäßig viele Spalten in allen Zeilen spricht für dieses Zeichen
      const schnitt = zahlen.reduce((a, b) => a + b, 0) / zahlen.length;
      const streuung = zahlen.reduce((a, b) => a + Math.abs(b - schnitt), 0) / zahlen.length;
      const wert = schnitt - streuung * 4;
      if (wert > bestwert) { bestwert = wert; bester = t; }
    }
    return bestwert < 0 ? null : bester;
  }

  /* ---------- Zahlen ---------- */

  /* "1.234,56" (deutsch), "1,234.56" (englisch), "12,3", "12.3", "-,5" */
  function zahl(roh) {
    if (roh == null) return null;
    let s = String(roh).trim().replace(/\s|%/g, '');
    if (!s || !/[0-9]/.test(s)) return null;
    const kommas = (s.match(/,/g) || []).length;
    const punkte = (s.match(/\./g) || []).length;
    if (kommas && punkte) {
      // Das weiter hinten stehende Zeichen ist das Dezimalzeichen
      const dezimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
      const tausend = dezimal === ',' ? '.' : ',';
      s = s.split(tausend).join('').replace(dezimal, '.');
    } else if (kommas === 1) {
      s = s.replace(',', '.');            // deutsches Dezimalkomma
    } else if (kommas > 1) {
      s = s.split(',').join('');          // Tausenderpunkte
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  const istZahl = (s) => zahl(s) !== null;

  /* Fürs Setzen: deutsche Schreibweise mit Komma */
  function schreibe(n, stellen) {
    if (n == null || !Number.isFinite(n)) return '';
    const s = stellen == null ? String(n) : n.toFixed(stellen);
    return s.replace('.', ',');
  }

  /* ---------- Tabellarischen Text einlesen ---------- */

  function lies(text) {
    const zeilen = String(text || '')
      .replace(/\r\n?/g, '\n').split('\n').filter(z => z.trim() !== '');
    if (zeilen.length < 2) return null;
    const t = trennzeichen(zeilen);
    if (!t) return null;

    const gitter = zeilen.map(z => z.split(t).map(zelle =>
      zelle.trim().replace(/^"(.*)"$/, '$1').trim()));
    const breite = Math.max(...gitter.map(r => r.length));
    if (breite < 2) return null;
    for (const r of gitter) while (r.length < breite) r.push('');

    /* Erste Zeile ist Kopfzeile, wenn sie im Gegensatz zu den folgenden
       keine Zahlen enthält -- so macht Excel es fast immer. */
    const zahlenAnteil = (r) => r.filter(istZahl).length / r.length;
    const kopfzeile = gitter.length > 1 &&
                      zahlenAnteil(gitter[0]) < 0.5 &&
                      zahlenAnteil(gitter[1]) >= 0.5;

    return {
      trenner: t,
      kopf: kopfzeile ? gitter[0] : gitter[0].map((_, i) => `Spalte ${i + 1}`),
      zeilen: kopfzeile ? gitter.slice(1) : gitter
    };
  }

  /* Sieht der Text nach einer eingefügten Tabelle aus?
     Bewusst streng: lieber als Text einfügen, als eine Tabelle zu
     erzeugen, die niemand wollte. */
  function istTabellarisch(text) {
    const zeilen = String(text || '')
      .replace(/\r\n?/g, '\n').split('\n').filter(z => z.trim() !== '');
    if (zeilen.length < 2) return false;
    const t = trennzeichen(zeilen);
    if (!t) return false;
    const breiten = zeilen.map(z => z.split(t).length);
    return breiten[0] >= 2 && breiten.every(b => b === breiten[0]);
  }

  /* ---------- Spalten für Diagramme ---------- */

  /* Gibt eine Spalte als Zahlenreihe zurück; nicht lesbare Werte fallen
     heraus, damit ein einzelner Tippfehler nicht alles unbrauchbar macht. */
  function spalte(gitter, index) {
    return (gitter || []).map(r => zahl(r[index]))
      .filter(n => n !== null);
  }

  function spalteRoh(gitter, index) {
    return (gitter || []).map(r => (r[index] == null ? '' : String(r[index]).trim()));
  }

  /* Kennwerte für Fehlerbalken und Boxplots */
  function kennwerte(werte) {
    const w = werte.filter(n => Number.isFinite(n)).slice().sort((a, b) => a - b);
    const n = w.length;
    if (!n) return null;
    const m = w.reduce((a, b) => a + b, 0) / n;
    const varianz = n > 1
      ? w.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1) : 0;
    const sd = Math.sqrt(varianz);
    const quantil = (p) => {
      const pos = (n - 1) * p, u = Math.floor(pos), rest = pos - u;
      return u + 1 < n ? w[u] + rest * (w[u + 1] - w[u]) : w[u];
    };
    return {
      n, m, sd,
      se: n > 1 ? sd / Math.sqrt(n) : 0,
      ci: n > 1 ? 1.96 * (sd / Math.sqrt(n)) : 0,
      min: w[0], max: w[n - 1],
      q1: quantil(0.25), median: quantil(0.5), q3: quantil(0.75)
    };
  }

  return { lies, istTabellarisch, zahl, istZahl, schreibe,
           spalte, spalteRoh, kennwerte, trennzeichen };
})();
