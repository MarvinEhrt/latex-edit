/* ===================================================================
   70-zip.js  --  Minimaler ZIP-Schreiber (ohne Kompression)
   -------------------------------------------------------------------
   Damit die ganze Anwendung eine einzige Datei ohne Fremdbibliothek
   bleibt. "Store"-Verfahren: die Dateien landen unkomprimiert im
   Archiv. Für ein paar Textdateien und Bilder völlig ausreichend --
   Bilder sind als PNG/JPEG ohnehin schon komprimiert.
   =================================================================== */

const Zip = (() => {

  const crcTabelle = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = crcTabelle[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  const textZuBytes = (s) => new TextEncoder().encode(s);

  function base64ZuBytes(b64) {
    const roh = atob(b64);
    const aus = new Uint8Array(roh.length);
    for (let i = 0; i < roh.length; i++) aus[i] = roh.charCodeAt(i);
    return aus;
  }

  /* DOS-Zeitstempel */
  function dosZeit(d) {
    const zeit = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5)
               | ((Math.floor(d.getSeconds() / 2)) & 31);
    const datum = (((d.getFullYear() - 1980) & 127) << 9)
                | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    return { zeit, datum };
  }

  /* eintraege: [{name, daten}]  -- daten = String oder Uint8Array */
  function erzeuge(eintraege, zeitstempel) {
    const { zeit, datum } = dosZeit(zeitstempel || new Date());
    const lokale = [];
    const zentrale = [];
    let versatz = 0;

    for (const e of eintraege) {
      const name = textZuBytes(e.name);
      const daten = typeof e.daten === 'string' ? textZuBytes(e.daten) : e.daten;
      const summe = crc32(daten);

      const lk = new Uint8Array(30 + name.length);
      const lv = new DataView(lk.buffer);
      lv.setUint32(0, 0x04034b50, true);   // Signatur
      lv.setUint16(4, 20, true);           // benötigte Version
      lv.setUint16(6, 0x0800, true);       // Bit 11: Name ist UTF-8
      lv.setUint16(8, 0, true);            // Verfahren: 0 = store
      lv.setUint16(10, zeit, true);
      lv.setUint16(12, datum, true);
      lv.setUint32(14, summe, true);
      lv.setUint32(18, daten.length, true);
      lv.setUint32(22, daten.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      lk.set(name, 30);
      lokale.push(lk, daten);

      const zk = new Uint8Array(46 + name.length);
      const zv = new DataView(zk.buffer);
      zv.setUint32(0, 0x02014b50, true);
      zv.setUint16(4, 20, true);
      zv.setUint16(6, 20, true);
      zv.setUint16(8, 0x0800, true);
      zv.setUint16(10, 0, true);
      zv.setUint16(12, zeit, true);
      zv.setUint16(14, datum, true);
      zv.setUint32(16, summe, true);
      zv.setUint32(20, daten.length, true);
      zv.setUint32(24, daten.length, true);
      zv.setUint16(28, name.length, true);
      zv.setUint32(42, versatz, true);
      zk.set(name, 46);
      zentrale.push(zk);

      versatz += lk.length + daten.length;
    }

    const zentralLaenge = zentrale.reduce((s, b) => s + b.length, 0);
    const ende = new Uint8Array(22);
    const ev = new DataView(ende.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, eintraege.length, true);
    ev.setUint16(10, eintraege.length, true);
    ev.setUint32(12, zentralLaenge, true);
    ev.setUint32(16, versatz, true);

    const alle = [...lokale, ...zentrale, ende];
    const gesamt = alle.reduce((s, b) => s + b.length, 0);
    const aus = new Uint8Array(gesamt);
    let p = 0;
    for (const b of alle) { aus.set(b, p); p += b.length; }
    return new Blob([aus], { type: 'application/zip' });
  }

  return { erzeuge, base64ZuBytes, crc32 };
})();
