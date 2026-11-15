# vendor/ — selbst gehostete Fremdbibliotheken

Seit 2026-11-15 lädt die App keine Skripte mehr von einem CDN (vorher `cdn.jsdelivr.net`).
Gründe: keine IP-Übertragung an Dritte, keine fremde Skriptquelle mit Zugriff auf Mieterdaten,
PDF-Export auch ohne Internet. Die Dateien sind unverändert aus den offiziellen npm-Paketen
übernommen (npm prüft dabei die Paket-Integrität) und wurden zusätzlich byte-genau mit der
bisherigen jsDelivr-Fassung abgeglichen.

Laden: `jspdf.umd.min.js` und `qrcode.js` direkt in `index.html`; `xlsx.full.min.js` und
`pdf.min.js` (+ Worker) erst bei Bedarf über `nkLadeXlsx()` / `nkLadePdfJs()` in `view-shell.js`.

| Datei | Paket | Lizenz | SHA-256 |
| --- | --- | --- | --- |
| `jspdf.umd.min.js` | jspdf@2.5.1 (`dist/`) | MIT (`LICENSE-jspdf`) | `98ccf17aa10c20bb1301762618fcc9b6ab3a4e7f26b6071d64d0b41154df3875` |
| `qrcode.js` | qrcode-generator@1.4.4 | MIT (Hinweis im Dateikopf) | `18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780` |
| `xlsx.full.min.js` | xlsx@0.18.5 (`dist/`) | Apache-2.0 (`LICENSE-xlsx`) | `c9506197caf809a075b6dee1da0d36fb19da7158ffe8a88e7b0c96c5d8623c99` |
| `pdf.min.js` | pdfjs-dist@3.11.174 (`build/`) | Apache-2.0 (`LICENSE-pdfjs-dist`) | `5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946` |
| `pdf.worker.min.js` | pdfjs-dist@3.11.174 (`build/`) | Apache-2.0 (`LICENSE-pdfjs-dist`) | `feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b` |

Prüfen: `shasum -a 256 vendor/*.js`

## Bekannte Punkte / offene Updates

- **pdf.js 3.11.174** ist von CVE-2024-4367 betroffen (Codeausführung über präparierte PDFs).
  Gegenmaßnahme aktiv: `isEvalSupported: false` beim Laden (`techem.js`). Update auf ≥ 4.2.67 als
  eigener Schritt (API-Änderungen, ES-Module).
- **xlsx 0.18.5** ist der letzte Stand auf npm; bekannte Lücken betreffen das *Einlesen* fremder
  Excel-Dateien. Die App *schreibt* nur.
- **jsPDF 2.5.1**: 3.x enthält Sicherheitskorrekturen; Update als eigener Schritt, weil sich die
  PDF-Ausgabe ändern kann (PDFs sind bisher nicht automatisch getestet).

Beim Aktualisieren: neue Datei hier ablegen, Tabelle (Version, SHA-256) nachziehen, Funktionstest
PDF-Export, Excel-Export, Techem-Import.
