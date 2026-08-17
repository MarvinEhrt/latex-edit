/* ===================================================================
   30-latex.js  --  Dokumentmodell  ->  fertiges LaTeX-Projekt
   -------------------------------------------------------------------
   Reine Funktion: gleiches Modell rein, gleiches Projekt raus.
   Die Stildatei ist die verallgemeinerte, bereits verifizierte
   Fassung aus der Gutachten-Vorlage (biblatex-apa + biber + ngerman).
   =================================================================== */

const Latex = (() => {

  const esc = Richtext.escLatex;

  /* ---------- Platzhalter {{zit:key}} in Beschriftungen ---------- */
  function textMitTokens(s, ziel) {
    const roh = String(s == null ? '' : s);
    const teile = roh.split(/(\{\{zitn?:[^}]+\}\})/g);
    return teile.map(t => {
      const m = t.match(/^\{\{(zitn?):([^}]+)\}\}$/);
      if (!m) return ziel === 'latex' ? esc(t) : escHtml(t);
      const befehl = m[1] === 'zitn' ? 'autorzit' : 'zit';
      if (ziel === 'latex') return `\\${befehl}{${m[2]}}`;
      return `<span class="chip chip-zitat">${escHtml(m[2])}</span>`;
    }).join('');
  }

  /* ---------- Literaturdatenbank ---------- */

  function bibAutoren(roh) {
    return String(roh || '').split(';').map(s => s.trim()).filter(Boolean)
      .map(p => (p.includes(',') ? p : `{${p}}`))   // ohne Komma = Institution
      .join(' and ');
  }

  function erzeugeBib(dok) {
    const genutzt = Modell.zitierteSchluessel(dok);
    const zeilen = [
      '% ==================================================================',
      '%  literatur.bib -- automatisch aus dem Editor erzeugt.',
      '%  Änderungen hier gehen beim nächsten Export verloren.',
      '% ==================================================================',
      ''
    ];
    for (const q of dok.quellen) {
      if (!genutzt.has(q.key)) continue;             // APA 7: nur Zitiertes
      const art = (Modell.QUELLTYPEN[q.typ] || {}).bibtex || 'misc';
      const f = q.felder || {};
      const feld = [];
      const setze = (name, wert) => {
        if (wert != null && String(wert).trim() !== '')
          feld.push(`  ${name.padEnd(12)} = {${String(wert).trim()}}`);
      };
      setze('author', bibAutoren(f.autoren));
      setze('year', f.jahr);
      setze('title', f.titel);
      setze('edition', f.auflage);
      setze('publisher', f.verlag);
      setze('journaltitle', f.zeitschrift);
      setze('volume', f.jahrgang);
      setze('number', f.heft || f.nummer);
      setze('pages', (f.seiten || '').replace(/\s*[–—-]\s*/, '--'));
      setze('booktitle', f.buchtitel);
      if (f.herausgeber) setze('editor', bibAutoren(f.herausgeber));
      setze('institution', f.institution);
      setze('organization', f.webseite);
      setze('doi', f.doi);
      setze('url', f.url);
      setze('urldate', f.abgerufen);
      zeilen.push(`@${art}{${q.key},`, feld.join(',\n'), '}', '');
    }
    if (!dok.quellen.some(q => genutzt.has(q.key))) {
      zeilen.push('% Noch keine Quelle im Text zitiert.');
      zeilen.push('@misc{platzhalter, title = {Platzhalter}, year = {2026}}');
    }
    return zeilen.join('\n');
  }

  /* ---------- Tabellen ---------- */

  function tabelleZuLatex(b, nummer) {
    const spalten = b.spaltenAusrichtung || b.kopf.map(() => 'l');
    const hatText = spalten.includes('l');
    const spec = spalten.map(a => (a === 'l' ? 'Z' : a)).join(' ');
    const umgebung = hatText ? 'tabularx' : 'tabular';
    const oeffnen = hatText ? `\\begin{tabularx}{\\textwidth}{@{}${spec}@{}}`
                            : `\\begin{tabular}{@{}${spalten.join(' ')}@{}}`;
    const zelle = (t) => textMitTokens(t, 'latex');

    const zeilen = [
      '\\begin{table}[htbp]',
      `\\caption{${textMitTokens(b.titel || 'Ohne Titel', 'latex')}}`,
      `\\label{tab:${b.id}}`,
      '\\small', '\\setstretch{1.05}',
      oeffnen,
      '\\toprule',
      b.kopf.map(h => `\\textbf{${zelle(h)}}`).join(' & ') + ' \\\\',
      '\\midrule',
      ...b.zeilen.map(r => r.map(zelle).join(' & ') + ' \\\\'),
      '\\bottomrule',
      hatText ? '\\end{tabularx}' : '\\end{tabular}'
    ];
    if (b.anmerkung && b.anmerkung.trim())
      zeilen.push(`\\anmerkung{${textMitTokens(b.anmerkung, 'latex')}}`);
    zeilen.push('\\end{table}');
    return zeilen.join('\n');
  }

  /* ---------- Abbildungen ---------- */

  function bilddateiname(b, index) {
    const roh = (b.dateiname || `abbildung-${index}`).replace(/\.[^.]+$/, '');
    const sauber = roh.toLowerCase()
      .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue')
      .replace(/ß/g, 'ss').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    const typ = (b.datenUrl.match(/^data:image\/(png|jpeg|jpg|gif)/) || [])[1] || 'png';
    return `${sauber || 'abbildung'}-${index}.${typ === 'jpeg' ? 'jpg' : typ}`;
  }

  function abbildungZuLatex(b, datei) {
    const zeilen = [
      '\\begin{figure}[htbp]',
      `\\caption{${textMitTokens(b.titel || 'Ohne Titel', 'latex')}}`,
      `\\label{abb:${b.id}}`,
      '\\centering',
      `\\includegraphics[width=${((b.breite || 80) / 100).toFixed(2)}\\textwidth]{abbildungen/${datei}}`
    ];
    if (b.anmerkung && b.anmerkung.trim())
      zeilen.push(`\\anmerkung{${textMitTokens(b.anmerkung, 'latex')}}`);
    zeilen.push('\\end{figure}');
    return zeilen.join('\n');
  }

  /* ---------- Hauptdokument ---------- */

  function erzeugeTex(dok, bilddateien, zeilenkarte) {
    const m = dok.meta, e = dok.einstellungen;
    const nummern = Modell.nummeriere(dok);
    const ctx = {
      quellen: dok.quellen,
      verweisLatex: (ziel) => {
        const b = dok.bloecke.find(x => x.id === ziel);
        if (!b) return '\\textbf{??}';
        return b.typ === 'tabelle' ? `Tabelle~\\ref{tab:${ziel}}`
             : (b.typ === 'abbildung' || b.typ === 'diagramm')
               ? `Abbildung~\\ref{abb:${ziel}}`
             : `Abschnitt~\\ref{sec:${ziel}}`;
      }
    };

    const K = [];   // Kopf
    K.push('%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%');
    K.push('%%  Erzeugt vom LaTeX-Editor für wissenschaftliche Arbeiten.');
    K.push('%%  Du kannst hier alles von Hand nachbessern -- beim nächsten');
    K.push('%%  Export aus dem Editor wird die Datei aber überschrieben.');
    K.push('%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%');
    K.push('');
    K.push(`\\documentclass[${e.schriftgroesse || 12}pt,a4paper]{article}`);
    K.push(`\\usepackage[${e.schrift === 'arial' ? 'arial' : 'times'}]{arbeit-stil}`);
    // pgfplots kostet Ladezeit und muss unter MiKTeX erst geholt werden --
    // also nur mitnehmen, wenn das Dokument wirklich ein Diagramm hat.
    if (dok.bloecke.some(b => b.typ === 'diagramm')) {
      K.push('');
      K.push(Diagramm.PRAEAMBEL);
      K.push('');
    }
    K.push('\\addbibresource{literatur.bib}');
    K.push('');
    K.push('% ---- Angaben fürs Deckblatt ----');
    const feld = (befehl, wert) => K.push(`\\${befehl}{${esc(wert || '')}}`);
    feld('Titel', m.titel);            feld('Untertitel', m.untertitel);
    feld('Hochschule', m.hochschule);  feld('Fachbereich', m.fachbereich);
    feld('Institut', m.institut);      feld('Modul', m.modul);
    feld('Betreuung', m.betreuung);    feld('Zweitgutachten', m.zweitgutachten);
    feld('Verfasser', m.verfasser);    feld('Matrikelnummer', m.matrikelnummer);
    feld('Studiengang', m.studiengang);feld('Semester', m.semester);
    feld('EMail', m.email);            feld('Ort', m.ort);
    feld('Abgabedatum', m.abgabedatum);
    feld('Arbeitsart', (Modell.ARBEITSTYPEN[m.arbeitstyp] || {}).name || '');
    K.push('');
    K.push('% ---- Aussehen ----');
    K.push(`\\Zeilenabstand{${e.zeilenabstand}}`);
    K.push(`\\Ausrichtung{${e.ausrichtung}}`);
    K.push(`\\Seitenzahl{${e.seitenzahlPosition}}`);
    K.push(`\\Absatzeinzug{${e.absatzEinzug ? 'an' : 'aus'}}`);
    K.push('');
    K.push('\\begin{document}');
    if (e.deckblatt) K.push('\\deckblatt');

    /* Vorspann: Verzeichnisse */
    const vorspann = [];
    if (e.seitenzahlStil === 'roemisch-arabisch')
      vorspann.push(`\\vorspannbeginn{${e.deckblatt ? 2 : 1}}`);
    if (e.abstract)                vorspann.push(`\\abstractseite{${esc(m.abstract || 'Hier steht die Zusammenfassung deiner Arbeit (150–250 Wörter).')}}`);
    if (e.inhaltsverzeichnis)      vorspann.push('\\inhaltsverzeichnis');
    if (e.abbildungsverzeichnis)   vorspann.push('\\abbildungsverzeichnis');
    if (e.tabellenverzeichnis)     vorspann.push('\\tabellenverzeichnis');
    if (e.abkuerzungsverzeichnis)  vorspann.push('\\abkuerzungsverzeichnis');
    K.push(...vorspann);
    K.push(e.seitenzahlStil === 'roemisch-arabisch' ? '\\textbeginn' : '\\textbeginndurchgehend');
    K.push('');

    /* Reihenfolge nach akademischer Konvention:
       Fließtext -> Literaturverzeichnis -> Anhang -> Erklärung.
       Der Anhang-Marker teilt das Dokument; die Literatur wird
       dazwischengeschoben, damit sie nicht in die Anhang-Nummerierung
       (A, B, C) rutscht.                                              */
    const trenner = dok.bloecke.findIndex(b => b.typ === 'anhangstart');
    const hatAnhang = trenner >= 0;
    const rumpf   = hatAnhang ? dok.bloecke.slice(0, trenner) : dok.bloecke;
    const anhang  = hatAnhang ? dok.bloecke.slice(trenner + 1) : [];

    /* Zeilenstand des bisher aufgebauten Dokuments.
       Achtung: K ist ein Array von Textstücken, und einige davon
       (Tabellen, Abbildungen) enthalten selbst Zeilenumbrüche.
       K.length wäre also die Zahl der Stücke, nicht der Zeilen --
       die Karte würde verrutschen. Deshalb wird gezählt, nicht
       geschätzt; der Zähler merkt sich, wie weit er schon war.      */
    let gezaehlt = 0, gelesen = 0;
    const zeilenstand = () => {
      while (gelesen < K.length)
        gezaehlt += String(K[gelesen++]).split('\n').length;
      return gezaehlt;
    };

    let bildIndex = 0;
    const schreibeBloecke = (liste) => {
    for (const b of liste) {
      // Zeilenbereich mitschreiben, damit eine LaTeX-Fehlermeldung
      // später auf genau den Baustein zurückgeführt werden kann, der
      // sie verursacht hat. Ohne diese Karte bliebe "l.234" nutzlos.
      const beginnZeile = zeilenstand() + 1;
      switch (b.typ) {
        case 'ueberschrift': {
          const befehl = ['section', 'subsection', 'subsubsection'][Math.min(2, (b.ebene || 1) - 1)];
          K.push('');
          K.push(`\\${befehl}{${esc(b.text || '')}}\\label{sec:${b.id}}`);
          break;
        }
        case 'absatz': {
          const t = Richtext.zuLatex(b.runs, ctx).trim();
          if (t) { K.push(''); K.push(t); }
          break;
        }
        case 'blockzitat': {
          const t = Richtext.zuLatex(b.runs, ctx).trim();
          const q = b.quelle
            ? ` ${b.seite ? `\\zitS{${b.quelle}}{${esc(b.seite)}}` : `\\zit{${b.quelle}}`}`
            : '';
          K.push('', '\\begin{zitat}', t + q, '\\end{zitat}');
          break;
        }
        case 'liste': {
          const umg = b.ordnung === 'nummern' ? 'enumerate' : 'itemize';
          K.push('', `\\begin{${umg}}[leftmargin=*, itemsep=0.25em]`);
          for (const p of (b.punkte || [])) {
            const t = Richtext.zuLatex(p, ctx).trim();
            if (t) K.push(`  \\item ${t}`);
          }
          K.push(`\\end{${umg}}`);
          break;
        }
        case 'tabelle':
          K.push('', tabelleZuLatex(b, (nummern.get(b.id) || {}).nummer));
          break;
        case 'abbildung':
          if (b.datenUrl) {
            const datei = bilddateiname(b, ++bildIndex);
            bilddateien.push({ datei, datenUrl: b.datenUrl });
            K.push('', abbildungZuLatex(b, datei));
          }
          break;
        case 'diagramm': {
          const gebaut = Diagramm.zuLatex(b, dok);
          if (!gebaut.tex) break;
          const pflicht = Diagramm.pflichtanmerkung(b, dok);
          const anm = [b.anmerkung, pflicht].filter(x => x && x.trim()).join(' ');
          K.push('', ['\\begin{figure}[htbp]',
            `\\caption{${textMitTokens(b.titel || 'Ohne Titel', 'latex')}}`,
            `\\label{abb:${b.id}}`,
            '\\centering',
            gebaut.tex,
            anm ? `\\anmerkung{${textMitTokens(anm, 'latex')}}` : '',
            '\\end{figure}'].filter(Boolean).join('\n'));
          break;
        }
        case 'formel':
          if (b.tex && b.tex.trim()) K.push('', '\\[', '  ' + b.tex.trim(), '\\]');
          break;
        case 'seitenumbruch': K.push('', '\\clearpage'); break;
        case 'anhangstart':   /* wird oben als Trenner behandelt */ break;
      }
      const endeZeile = zeilenstand();
      if (endeZeile >= beginnZeile)
        zeilenkarte.push({ id: b.id, typ: b.typ, von: beginnZeile, bis: endeZeile });
    }
    };

    schreibeBloecke(rumpf);

    K.push('', '% ---- Literaturverzeichnis (baut sich aus literatur.bib) ----');
    K.push('\\literaturverzeichnis');

    if (hatAnhang) {
      K.push('', '% ---- Anhang: ab hier A, B, C statt 1, 2, 3 ----');
      K.push('\\anhang');
      schreibeBloecke(anhang);
    }

    if (e.eidesstattlich) {
      K.push('', `\\eidesstattlich{${esc(m.ort || '')}}{${esc(m.abgabedatum || '')}}{${esc(m.verfasser || '')}}`);
    }
    K.push('', '\\end{document}');
    return K.join('\n');
  }

  /* ---------- Vorabprüfung ----------
     Formeln sind die einzige Stelle, an der rohes LaTeX getippt wird --
     und damit die einzige, an der eine Klammer fehlen kann. Das hier zu
     bemerken ist ungleich freundlicher, als LaTeX zehn Sekunden später
     mit "File ended while scanning" abbrechen zu lassen.              */
  function pruefe(dok) {
    const anmerkungen = [];
    for (const b of dok.bloecke) {
      if (b.typ !== 'formel' || !b.tex) continue;
      let tiefe = 0, dollar = 0;
      for (let i = 0; i < b.tex.length; i++) {
        const c = b.tex[i];
        if (c === '\\') { i++; continue; }        // \{ und \} überspringen
        if (c === '{') tiefe++;
        else if (c === '}') tiefe--;
        else if (c === '$') dollar++;
        if (tiefe < 0) break;
      }
      if (tiefe > 0) anmerkungen.push({ id: b.id, meldung:
        `In der Formel fehlt ${tiefe === 1 ? 'eine schließende Klammer }' :
         tiefe + ' schließende Klammern }'}.` });
      else if (tiefe < 0) anmerkungen.push({ id: b.id, meldung:
        'In der Formel steht eine schließende Klammer } zu viel.' });
      if (dollar % 2) anmerkungen.push({ id: b.id, meldung:
        'In der Formel steht ein einzelnes $. Sie stehen immer paarweise.' });
    }
    return anmerkungen;
  }

  /* ---------- Projekt zusammenstellen ---------- */

  function erzeuge(dok) {
    const bilddateien = [];
    const zeilenkarte = [];
    const tex = erzeugeTex(dok, bilddateien, zeilenkarte);
    return {
      zeilenkarte,
      dateien: {
        'arbeit.tex':      tex,
        'literatur.bib':   erzeugeBib(dok),
        'arbeit-stil.sty': STILDATEI,
        'bauen.sh':        BAUSKRIPT,
        'latexmkrc':       LATEXMKRC,
        'LIESMICH.md':     liesmich(dok)
      },
      bilder: bilddateien
    };
  }

  function liesmich(dok) {
    const name = (Modell.ARBEITSTYPEN[dok.meta.arbeitstyp] || {}).name || 'Arbeit';
    return `# ${dok.meta.titel || name}

Erzeugt vom LaTeX-Editor. So wird ein PDF daraus:

## Overleaf (nichts installieren)

1. Auf overleaf.com anmelden
2. **New Project → Upload Project** → dieses ZIP hochladen
3. **Menu**: Compiler auf *pdfLaTeX*, Main document auf \`arbeit.tex\`
4. Grüner Knopf **Recompile**

## Am eigenen Rechner

\`\`\`
./bauen.sh
\`\`\`

Braucht eine TeX-Installation (TeX Live oder MiKTeX) mit \`pdflatex\` und \`biber\`.

## Dateien

| Datei | |
|---|---|
| \`arbeit.tex\` | Dein Text |
| \`literatur.bib\` | Deine Quellen |
| \`arbeit-stil.sty\` | Layout und APA-7-Regeln |
| \`abbildungen/\` | Deine Bilder |

**Achtung:** Wenn du im Editor weiterarbeitest und erneut exportierst, werden
\`arbeit.tex\` und \`literatur.bib\` überschrieben. Handschriftliche Änderungen
gehen dann verloren.

Literatur: \`biblatex\` + \`biber\`, Stil \`apa\`, Sprache \`ngerman\` —
echtes deutsches APA 7.
`;
  }

  /* ---------- Beigelegte Dateien ---------- */

  const BAUSKRIPT = `#!/bin/sh
# Baut arbeit.pdf. Einfach ausführen:   ./bauen.sh
# Falls "Permission denied":            chmod +x bauen.sh
set -e
cd "$(dirname "$0")"
DOK=arbeit
echo ""
echo "  Baue $DOK.pdf ..."
if command -v latexmk >/dev/null 2>&1; then
    latexmk -pdf -interaction=nonstopmode -halt-on-error "$DOK.tex"
else
    echo "  [1/4] LaTeX ...";  pdflatex -interaction=nonstopmode -halt-on-error "$DOK.tex" > /dev/null
    echo "  [2/4] Literatur ..."; biber "$DOK" > /dev/null
    echo "  [3/4] LaTeX ...";  pdflatex -interaction=nonstopmode -halt-on-error "$DOK.tex" > /dev/null
    echo "  [4/4] LaTeX ...";  pdflatex -interaction=nonstopmode -halt-on-error "$DOK.tex" > /dev/null
fi
echo ""
if [ -f "$DOK.pdf" ]; then
    echo "  ==> Fertig: $(pwd)/$DOK.pdf"
else
    echo "  ==> Hat nicht geklappt. Schau in $DOK.log nach einer Zeile mit '!'."
    exit 1
fi
echo ""
rm -f "$DOK".aux "$DOK".bcf "$DOK".blg "$DOK".log "$DOK".out \\
      "$DOK".run.xml "$DOK".toc "$DOK".lof "$DOK".lot "$DOK".bbl \\
      "$DOK".fls "$DOK".fdb_latexmk
`;

  const LATEXMKRC = `# Sagt Overleaf und latexmk, wie gebaut wird.
$pdf_mode   = 1;
$bibtex_use = 2;
$biber      = 'biber %O %S';
$clean_ext  = 'bbl run.xml synctex.gz fdb_latexmk fls';
`;

  const STILDATEI = String.raw`%% ==================================================================
%%  arbeit-stil.sty  --  Layout und APA-7-Regeln
%%  Vom LaTeX-Editor erzeugt. Du musst hier nichts ändern.
%% ==================================================================
\NeedsTeXFormat{LaTeX2e}
\ProvidesPackage{arbeit-stil}[2026/08/16 v1.0 Wissenschaftliche Arbeit, APA 7 (deutsch)]

\newif\ifas@arial \as@arialfalse
\DeclareOption{times}{\as@arialfalse}
\DeclareOption{arial}{\as@arialtrue}
\DeclareOption*{\PackageWarning{arbeit-stil}{Unbekannte Option '\CurrentOption'.}}
\ExecuteOptions{times}
\ProcessOptions\relax

\RequirePackage[T1]{fontenc}
\RequirePackage[utf8]{inputenc}
\RequirePackage[ngerman]{babel}
\RequirePackage{textcomp}
\RequirePackage{microtype}

\ifas@arial
  \RequirePackage{tgheros}
  \renewcommand{\familydefault}{\sfdefault}
\else
  \RequirePackage{tgtermes}
  \RequirePackage{tgheros}
\fi
\RequirePackage[italic]{mathastext}

\RequirePackage[a4paper,top=2.54cm,bottom=2.54cm,left=2.54cm,right=2.54cm]{geometry}
\RequirePackage{setspace}
\RequirePackage{ragged2e}
\RequirePackage{graphicx}
\RequirePackage{xcolor}
\RequirePackage{booktabs}
\RequirePackage{tabularx}
\RequirePackage{array}
\RequirePackage{enumitem}
\RequirePackage{float}
\RequirePackage{caption}
\RequirePackage{titlesec}
\RequirePackage{tocloft}
\RequirePackage{fancyhdr}
\RequirePackage{csquotes}

\RequirePackage[style=apa,backend=biber,language=ngerman]{biblatex}
\DeclareLanguageMapping{ngerman}{ngerman-apa}

\RequirePackage[hidelinks,bookmarks=true]{hyperref}
\RequirePackage{bookmark}

\definecolor{asakzent}{RGB}{45,72,105}
\definecolor{asgrau}{RGB}{120,120,120}

%% ---------------- Deckblattfelder ----------------
\newcommand{\as@titel}{}       \newcommand{\Titel}[1]{\renewcommand{\as@titel}{#1}}
\newcommand{\as@untertitel}{}  \newcommand{\Untertitel}[1]{\renewcommand{\as@untertitel}{#1}}
\newcommand{\as@hochschule}{}  \newcommand{\Hochschule}[1]{\renewcommand{\as@hochschule}{#1}}
\newcommand{\as@fachbereich}{} \newcommand{\Fachbereich}[1]{\renewcommand{\as@fachbereich}{#1}}
\newcommand{\as@institut}{}    \newcommand{\Institut}[1]{\renewcommand{\as@institut}{#1}}
\newcommand{\as@modul}{}       \newcommand{\Modul}[1]{\renewcommand{\as@modul}{#1}}
\newcommand{\as@betreuung}{}   \newcommand{\Betreuung}[1]{\renewcommand{\as@betreuung}{#1}}
\newcommand{\as@zweit}{}       \newcommand{\Zweitgutachten}[1]{\renewcommand{\as@zweit}{#1}}
\newcommand{\as@verf}{}        \newcommand{\Verfasser}[1]{\renewcommand{\as@verf}{#1}}
\newcommand{\as@matrikel}{}    \newcommand{\Matrikelnummer}[1]{\renewcommand{\as@matrikel}{#1}}
\newcommand{\as@studiengang}{} \newcommand{\Studiengang}[1]{\renewcommand{\as@studiengang}{#1}}
\newcommand{\as@semester}{}    \newcommand{\Semester}[1]{\renewcommand{\as@semester}{#1}}
\newcommand{\as@email}{}       \newcommand{\EMail}[1]{\renewcommand{\as@email}{#1}}
\newcommand{\as@ort}{}         \newcommand{\Ort}[1]{\renewcommand{\as@ort}{#1}}
\newcommand{\as@datum}{}       \newcommand{\Abgabedatum}[1]{\renewcommand{\as@datum}{#1}}
\newcommand{\as@art}{}         \newcommand{\Arbeitsart}[1]{\renewcommand{\as@art}{#1}}

%% ---------------- Aussehen ----------------
\newcommand{\Zeilenabstand}[1]{%
  \def\as@za{#1}%
  \def\as@a{1}\def\as@b{1.5}\def\as@c{2}\def\as@d{2.0}%
  \ifx\as@za\as@a\singlespacing\else
  \ifx\as@za\as@b\onehalfspacing\else
  \ifx\as@za\as@c\doublespacing\else
  \ifx\as@za\as@d\doublespacing\else
  \setstretch{#1}\fi\fi\fi\fi}

\newcommand{\Ausrichtung}[1]{%
  \def\as@aus{#1}\def\as@links{linksbuendig}%
  \ifx\as@aus\as@links \RaggedRight \hyphenpenalty=10000 \exhyphenpenalty=10000 \relax\fi}

\newcommand{\Absatzeinzug}[1]{%
  \def\as@ez{#1}\def\as@aus{aus}%
  \ifx\as@ez\as@aus
    \setlength{\parindent}{0pt}\setlength{\parskip}{0.8em}%
  \else
    \setlength{\parindent}{1.27cm}\setlength{\parskip}{0pt}%
  \fi}
\Absatzeinzug{an}

\newcommand{\as@pos}{unten}
\newcommand{\Seitenzahl}[1]{\renewcommand{\as@pos}{#1}}

%% ---------------- Zitierbefehle ----------------
\newcommand{\zit}[1]{\parencite{#1}}
\newcommand{\autorzit}[1]{\textcite{#1}}
\newcommand{\zitS}[2]{\parencite[S.~#2]{#1}}
\newcommand{\autorzitS}[2]{\textcite[S.~#2]{#1}}
\newcommand{\kennwert}[2]{\textit{#1}~=~#2}

%% ---------------- Überschriften (APA 7, nummeriert) ----------------
\newcommand{\as@secprefix}{}
\titleformat{\section}[hang]
  {\normalfont\large\bfseries}{\as@secprefix\thesection}{0.7em}{}
\titlespacing*{\section}{0pt}{2.6ex plus 1ex minus .2ex}{1.3ex plus .2ex}
\titleformat{\subsection}[hang]
  {\normalfont\normalsize\bfseries}{\thesubsection}{0.7em}{}
\titlespacing*{\subsection}{0pt}{2.2ex plus 1ex minus .2ex}{1.0ex plus .2ex}
\titleformat{\subsubsection}[hang]
  {\normalfont\normalsize\bfseries\itshape}{\thesubsubsection}{0.7em}{}
\titlespacing*{\subsubsection}{0pt}{2.0ex plus 1ex minus .2ex}{0.8ex plus .2ex}
\setcounter{secnumdepth}{3}
\setcounter{tocdepth}{3}

%% ---------------- Tabellen und Abbildungen (APA 7) ----------------
\captionsetup{labelfont=bf, textfont=it, labelsep=newline,
  singlelinecheck=false, justification=raggedright,
  font={stretch=1.0}, skip=0.6em}
\captionsetup[table]{position=above}
\captionsetup[figure]{position=above}

\newcommand{\anmerkung}[1]{%
  \par\vspace{0.45em}%
  \begingroup\footnotesize\setstretch{1.0}\RaggedRight
  \noindent\textit{Anmerkung.} #1\par\endgroup}

\newcolumntype{L}[1]{>{\RaggedRight\arraybackslash}p{#1}}
\newcolumntype{Z}{>{\RaggedRight\arraybackslash}X}
\renewcommand{\arraystretch}{1.25}

%% ---------------- Textbausteine ----------------
\newenvironment{zitat}%
  {\par\vspace{0.5em}\begingroup\setstretch{1.0}\small
   \leftskip=1.27cm \noindent\ignorespaces}%
  {\par\endgroup\vspace{0.5em}\noindent\ignorespaces}

%% ---------------- Deckblatt ----------------
\newcommand{\as@zeile}[2]{\ifx\relax#2\relax\else\textbf{#1}\quad #2\par\fi}

\newcommand{\deckblatt}{%
  \begin{titlepage}
  \thispagestyle{empty}
  \setstretch{1.15}
  \centering
  {\large\as@hochschule\par}
  \ifx\as@fachbereich\empty\else{\as@fachbereich\par}\fi
  \ifx\as@institut\empty\else{\as@institut\par}\fi
  \vspace{2.0cm}
  \ifx\as@art\empty\else{\footnotesize\MakeUppercase{\as@art}\par}\fi
  \vspace{0.8cm}
  {\huge\bfseries\as@titel\par}
  \ifx\as@untertitel\empty\else\vspace{0.6cm}{\Large\as@untertitel\par}\fi
  \vspace{2.0cm}
  \begin{minipage}{0.85\textwidth}\centering
    \ifx\as@modul\empty\else{\as@modul\par}\fi
    \ifx\as@betreuung\empty\else{Betreuung: \as@betreuung\par}\fi
    \ifx\as@zweit\empty\else{Zweitgutachten: \as@zweit\par}\fi
  \end{minipage}
  \vfill
  \begin{minipage}{0.85\textwidth}
    \setstretch{1.2}\RaggedRight
    \as@zeile{Vorgelegt von:}{\as@verf}
    \as@zeile{Matrikelnummer:}{\as@matrikel}
    \as@zeile{Studiengang:}{\as@studiengang}
    \as@zeile{Fachsemester:}{\as@semester}
    \as@zeile{E-Mail:}{\as@email}
    \as@zeile{Ort:}{\as@ort}
    \as@zeile{Abgabedatum:}{\as@datum}
  \end{minipage}
  \vspace{1.2cm}
  \end{titlepage}%
  \setcounter{page}{2}}

%% ---------------- Vorspann und Verzeichnisse ----------------
% Argument = erste Seitenzahl des Vorspanns (2 mit Deckblatt, sonst 1)
\newcommand{\vorspannbeginn}[1]{\pagenumbering{roman}\setcounter{page}{#1}\pagestyle{plain}}

\newcommand{\abstractseite}[1]{%
  \clearpage\pagestyle{plain}%
  \section*{Zusammenfassung}\addcontentsline{toc}{section}{Zusammenfassung}%
  \begingroup\setstretch{1.15}#1\par\endgroup\clearpage}

\newcommand{\inhaltsverzeichnis}{%
  \clearpage\pagestyle{plain}%
  \begingroup\setstretch{1.0}\tableofcontents\endgroup\clearpage}
\newcommand{\abbildungsverzeichnis}{%
  \pagestyle{plain}\addcontentsline{toc}{section}{Abbildungsverzeichnis}%
  \begingroup\setstretch{1.0}\listoffigures\endgroup\clearpage}
\newcommand{\tabellenverzeichnis}{%
  \pagestyle{plain}\addcontentsline{toc}{section}{Tabellenverzeichnis}%
  \begingroup\setstretch{1.0}\listoftables\endgroup\clearpage}
\newcommand{\abkuerzungsverzeichnis}{%
  \pagestyle{plain}\section*{Abkürzungsverzeichnis}%
  \addcontentsline{toc}{section}{Abkürzungsverzeichnis}%
  \begin{description}[leftmargin=3cm, style=nextline, font=\normalfont\bfseries]
    \item[AIST-R] Allgemeiner Interessen-Struktur-Test, Revision
    \item[APA] American Psychological Association
  \end{description}\clearpage}

\newcommand{\as@kopffuss}{%
  \pagestyle{fancy}\fancyhf{}\renewcommand{\headrulewidth}{0pt}%
  \def\as@u{unten}%
  \ifx\as@pos\as@u \fancyfoot[C]{\thepage}\else \fancyhead[R]{\thepage}\fi}

\newcommand{\textbeginn}{\clearpage\pagenumbering{arabic}\setcounter{page}{1}\as@kopffuss}
\newcommand{\textbeginndurchgehend}{\clearpage\as@kopffuss}

\setlength{\cftbeforesecskip}{0.5em}
\setlength{\cftsecnumwidth}{2.6em}
\setlength{\cftsubsecnumwidth}{3.2em}
\setlength{\cftsubsubsecnumwidth}{4.0em}
\renewcommand{\cftsecfont}{\bfseries}
\renewcommand{\cftsecpagefont}{\bfseries}

%% ---------------- Literatur und Anhang ----------------
\setlength{\bibitemsep}{0.6\baselineskip}
\setlength{\bibhang}{1.27cm}
\defbibheading{arbeit}[Literaturverzeichnis]{\clearpage\section{#1}}
\newcommand{\literaturverzeichnis}{\printbibliography[heading=arbeit]}

\newcommand{\anhang}{%
  \clearpage
  \setcounter{section}{0}%
  \renewcommand{\thesection}{\Alph{section}}%
  \renewcommand{\as@secprefix}{Anhang~}%
  \renewcommand{\thesubsection}{\Alph{section}.\arabic{subsection}}%
  \renewcommand{\theHsection}{anhang.\Alph{section}}%
  \renewcommand{\theHsubsection}{anhang.\Alph{section}.\arabic{subsection}}%
  \addtocontents{toc}{\protect\vspace{0.8em}}%
  \addtocontents{toc}{\protect\noindent\textbf{Anhang}\protect\par}%
  \addtocontents{toc}{\protect\vspace{0.2em}}}

%% ---------------- Eidesstattliche Erklärung ----------------
\newcommand{\eidesstattlich}[3]{%
  \clearpage
  \section*{Eidesstattliche Erklärung}
  \addcontentsline{toc}{section}{Eidesstattliche Erklärung}
  Hiermit versichere ich an Eides statt, dass ich die vorliegende Arbeit
  selbstständig und ohne fremde Hilfe verfasst und keine anderen als die
  angegebenen Quellen und Hilfsmittel benutzt habe. Alle Stellen, die
  wörtlich oder sinngemäß aus Veröffentlichungen entnommen wurden, sind als
  solche kenntlich gemacht. Die Arbeit hat in gleicher oder ähnlicher Form
  noch keiner Prüfungsbehörde vorgelegen.
  \par\vspace{2.5cm}
  \noindent
  \begin{minipage}{0.45\textwidth}\centering
    \rule{\textwidth}{0.4pt}\\[0.3em]{\footnotesize #1, #2}
  \end{minipage}\hfill
  \begin{minipage}{0.45\textwidth}\centering
    \rule{\textwidth}{0.4pt}\\[0.3em]{\footnotesize #3}
  \end{minipage}}

\endinput
`;

  return { erzeuge, erzeugeTex, erzeugeBib, textMitTokens, pruefe, STILDATEI };
})();
