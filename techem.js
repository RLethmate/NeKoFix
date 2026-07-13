/* techem.js (Ralf-Vorgabe 2026-07-10) – Techem-Abrechnungsimport: liest eine Techem-Heiz-/
   Warmwasser-/Hausnebenkostenabrechnung (PDF) client-seitig mit pdf.js und leitet daraus
   NeKoFix-Kostenarten ab. Reine Text-/Zahlen-Verarbeitung steckt in calc.js
   (nkPdfZeilenAusItems/nkTechemAbrechnungParsen, getestet); hier nur Browser-Glue: PDF laden,
   Einheiten-Zuordnung, Review-Dialog, Übernahme in state.kosten.

   Eine einzelne PDF zeigt nur die Verbrauchsmenge DIESER Einheit – für eine vollständige
   Verteilung müssen alle Einheiten-PDFs nacheinander importiert werden: der erste Import legt
   die Positionen an (Abgleich über `bez`), jeder weitere ergänzt nur `k.verbrauch[einheitId]`
   der jeweiligen Einheit bzw. aktualisiert den (objektweit identischen) Gesamtbetrag.

   Datenschutz: nur die pdf.js-Bibliothek selbst kommt per CDN (wie jsPDF/xlsx) – der PDF-Inhalt
   wird ausschließlich lokal im Browser verarbeitet, nichts wird irgendwohin übertragen. */
let _techemBeleg = null; /* zuletzt geparster Beleg, bis "Übernehmen" oder "Abbrechen" */

function techemImportStarten() {
  if (typeof pdfjsLib === 'undefined') { alert('Die PDF-Bibliothek konnte nicht geladen werden – bitte Internetverbindung beim Laden der Seite prüfen und erneut versuchen.'); return; }
  const inp = document.getElementById('techem_import'); if (inp) inp.click();
}
async function techemDateiGewaehlt(ev) {
  const file = (ev.target.files || [])[0]; ev.target.value = '';
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    let zeilen = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0 }));
      zeilen = zeilen.concat(nkPdfZeilenAusItems(items));
    }
    const beleg = nkTechemAbrechnungParsen(zeilen);
    if (!beleg.positionen.length) { alert('In dieser PDF wurden keine Kostenpositionen im Techem-Tabellenformat erkannt. Ist es eine Heiz-/Warmwasser-/Hausnebenkostenabrechnung von Techem?'); return; }
    _techemBeleg = beleg;
    techemReviewOeffnen(beleg);
  } catch (e) { alert('PDF konnte nicht gelesen werden: ' + ((e && e.message) || e)); }
}
/* Einheiten-Zuordnung per Namensabgleich (Lage bevorzugt, sonst Ihre Nutzer-Nr.) – genau EIN
   Treffer wird vorbelegt, sonst bleibt die Auswahl leer (Ralf-Entscheidung 2026-07-10:
   Namensabgleich mit Rückfrage statt Raten bei Mehrdeutigkeit). */
function techemEinheitVorschlag(beleg) {
  const kandidaten = [beleg && beleg.lage, beleg && beleg.nutzerNr].filter(Boolean);
  for (const k of kandidaten) {
    const kl = k.trim().toLowerCase();
    const treffer = state.einheiten.filter(e => String(e.name || '').trim().toLowerCase() === kl);
    if (treffer.length === 1) return { id: treffer[0].id, kennung: k }; // Fund 2026-07-10: welche Kennung traf, nicht nur DASS eine traf – sonst zeigt der Hinweis fälschlich immer "lage" an, auch wenn erst der Nutzer-Nr.-Fallback griff.
  }
  return null;
}
function techemReviewOeffnen(beleg) {
  const treffer = techemEinheitVorschlag(beleg);
  const vorschlag = treffer && treffer.id;
  const kennung = beleg.lage || beleg.nutzerNr || '';
  const sel = document.getElementById('techem_einheit');
  /* Ralf-Vorgabe 2026-07-10: ohne Treffer nicht nur zur manuellen Auswahl unter den BESTEHENDEN
     Einheiten auffordern, sondern das Anlegen einer neuen Einheit mit der erkannten Techem-Kennung
     aktiv VORSCHLAGEN (als Default vorbelegt) – die bestehenden Einheiten bleiben als Alternative
     wählbar, falls die Kennung eigentlich zu einer schon vorhandenen Einheit gehört. Ohne jede
     Kennung (kein Lage/Nutzer-Nr. erkannt) bleibt der reine Auswahl-Platzhalter, da nichts zum
     Vorbenennen einer neuen Einheit da wäre.
     Fund 2026-07-10: ohne "selected" auf irgendeiner Option wählte der Browser sonst still die
     ERSTE Einheit der Liste vor – sah wie ein bewusster Vorschlag aus, obwohl keine Zuordnung
     erkannt wurde. Jetzt ist bei fehlendem Treffer immer eine Option explizit "selected". */
  const neuOption = (!vorschlag && kennung) ? '<option value="__neu__" selected>+ Neue Einheit „' + esc(kennung) + '" anlegen</option>' : '';
  const platzhalter = (!vorschlag && !kennung) ? '<option value="" selected disabled>— bitte Einheit wählen —</option>' : '';
  sel.innerHTML = neuOption + platzhalter + state.einheiten.map(e => '<option value="' + e.id + '"' + (e.id === vorschlag ? ' selected' : '') + '>' + esc(e.name) + '</option>').join('');
  const hinweis = document.getElementById('techem_hinweis');
  hinweis.textContent = treffer
    ? 'Einheit erkannt über Techem-Kennung „' + treffer.kennung + '" – bitte prüfen.'
    : (kennung ? 'Keine Einheit automatisch erkannt (Techem-Kennung „' + esc(kennung) + '") – neue Einheit vorgeschlagen, oder bestehende Einheit auswählen.' : 'Keine Einheit automatisch erkannt – bitte manuell wählen.');
  document.getElementById('techem_zeitraum').textContent = (beleg.von && beleg.bis) ? (fmtDatum(beleg.von) + ' – ' + fmtDatum(beleg.bis)) : '(nicht erkannt)';
  const body = document.getElementById('techem_positionen');
  /* Ralf-Vorgabe 2026-07-11: die Techem-Zeile ist eine Gleichung (Gesamtkosten : Gesamteinheiten =
     Preis je Einheit x Ihre Einheiten = Ihre Kosten) – das muss die Tabelle auch so zeigen, für
     jeden Verteilerschlüssel (nicht nur „verbrauch"), sonst wirkt die übernommene Zahl unbegründet
     und lässt sich nicht gegen die Abrechnung prüfen. */
  body.innerHTML = beleg.positionen.map(p => {
    const bereitsVorhanden = techemPositionFinden(p) >= 0;
    return '<tr>' +
      '<td style="padding:3px 8px;">' + esc(p.rubrik) + '</td>' +
      '<td style="padding:3px 8px;">' + esc(p.bez) + '<br><span style="font-size:11px;color:var(--muted);">' + esc(SCHLUESSEL[p.schluessel] || p.schluessel) + '</span></td>' +
      '<td class="num" style="padding:3px 8px;">' + eur(p.gesamtbetrag) + '</td>' +
      '<td class="num" style="padding:3px 8px;">' + nkFmtZahl(p.gesamtmenge) + ' ' + esc(p.einheit) + '</td>' +
      '<td class="num" style="padding:3px 8px;">' + nkFmtZahl(p.preisJeEinheit) + ' EUR/' + esc(p.einheit) + '</td>' +
      '<td class="num" style="padding:3px 8px;">' + nkFmtZahl(p.ihreMenge) + ' ' + esc(p.einheit) + '</td>' +
      '<td class="num" style="padding:3px 8px;">' + eur(p.ihreKosten) + '</td>' +
      '<td style="padding:3px 8px;">' + (bereitsVorhanden ? 'vorhanden – wird ergänzt' : 'neu') + '</td>' +
      '</tr>';
  }).join('');
  techemFlaecheHinweisAktualisieren();
  techemGebaeudeHinweisAktualisieren(beleg);
  document.getElementById('techem_overlay').hidden = false;
}
/* Ralf-Vorgabe 2026-07-13: Plausi-Hinweis, solange nicht alle Einheiten der Liegenschaft importiert
   sind – jede Techem-PDF nennt die Gesamtfläche/Nutzeinheiten-Anzahl des GANZEN Gebäudes bereits auf
   dem ersten Import (nkTechemGebaeudeAbweichung), unabhängig davon, wie viele Einheiten aktuell im
   Objekt erfasst sind. Rein informativ, blockiert das Übernehmen nicht (Ralf-Entscheidung: Plausi-
   Warnung statt Sperre/Override). */
function techemGebaeudeHinweisAktualisieren(beleg) {
  const el = document.getElementById('techem_gebaeude_hinweis');
  if (!el) return;
  const abw = nkTechemGebaeudeAbweichung(beleg.positionen, state.einheiten);
  if (!abw.flaeche && !abw.einheiten) { el.innerHTML = ''; return; }
  const teile = [];
  if (abw.flaeche) teile.push('Fläche: ' + nkFmtZahl(abw.flaeche.erfasst) + ' von ' + nkFmtZahl(abw.flaeche.gesamt) + ' m² erfasst (es fehlen ca. ' + nkFmtZahl(Math.abs(abw.flaeche.fehlt)) + ' m²)');
  if (abw.einheiten) teile.push(abw.einheiten.erfasst + ' von ' + abw.einheiten.gesamt + ' Einheiten erfasst (es fehlen ' + Math.round(Math.abs(abw.einheiten.fehlt)) + ')');
  el.innerHTML = '<div class="warn-box" style="margin:0 18px 10px;"><b>⚠ Noch nicht alle Einheiten der Liegenschaft erfasst</b><br>' + teile.map(esc).join('<br>') + '<span class="warn-note">Die Techem-Abrechnung nennt Gesamtfläche/Nutzeinheiten-Anzahl der ganzen Liegenschaft – solange im Objekt „Objekt &amp; Einheiten" nicht alle Einheiten mit ihrer Fläche hinterlegt sind, weicht der Verteilerschlüssel von Techems Berechnung ab.</span></div>';
}
/* Fund 2026-07-11 (Ralf): eine schluessel="flaeche"-Position berechnet NeKoFix selbst aus der in
   „Objekt & Einheiten" hinterlegten Fläche der Ziel-Einheit (nkFactor/nkFaktorFuer), NICHT aus dem
   PDF-Wert „Ihre Einheiten" – nur wenn beide übereinstimmen, reproduziert NeKoFix Techems „Ihre
   Kosten". Dieser Hinweis zeigt VOR dem Übernehmen, ob/wie die Fläche der gewählten Einheit dadurch
   verändert würde (die eigentliche Synchronisierung passiert in techemUebernehmen). */
function techemAufEinheitWechsel() { techemFlaecheHinweisAktualisieren(); }
function techemFlaecheHinweisAktualisieren() {
  const beleg = _techemBeleg;
  const hinweisEl = document.getElementById('techem_flaeche_hinweis');
  if (!beleg || !hinweisEl) return;
  const flaechenPos = beleg.positionen.filter(p => p.schluessel === 'flaeche');
  const sel = document.getElementById('techem_einheit');
  if (!flaechenPos.length || !sel) { hinweisEl.textContent = ''; return; }
  const pdfFlaeche = flaechenPos[0].ihreMenge;
  if (!sel.value || sel.value === '__neu__') {
    hinweisEl.textContent = 'Fläche der neuen Einheit wird aus der Abrechnung übernommen: ' + nkFmtZahl(pdfFlaeche) + ' m².';
    return;
  }
  const e = state.einheiten.find(x => x.id === +sel.value);
  const aktuell = e ? (+e.flaeche || 0) : 0;
  if (!e) { hinweisEl.textContent = ''; }
  else if (!aktuell) hinweisEl.textContent = 'Fläche „' + esc(e.name) + '" ist noch nicht erfasst – wird beim Übernehmen auf ' + nkFmtZahl(pdfFlaeche) + ' m² gesetzt.';
  else if (Math.abs(aktuell - pdfFlaeche) > 0.05) hinweisEl.textContent = 'Achtung: „' + esc(e.name) + '" ist aktuell mit ' + nkFmtZahl(aktuell) + ' m² erfasst, die Abrechnung nennt ' + nkFmtZahl(pdfFlaeche) + ' m² für diese Einheit – wird beim Übernehmen aktualisiert und als unbestätigter Vorschlag markiert (blaues Eck bei „Objekt & Einheiten").';
  else hinweisEl.textContent = '';
}
function techemReviewSchliessen() { const ov = document.getElementById('techem_overlay'); if (ov) ov.hidden = true; _techemBeleg = null; }
/* Übernahme in state.kosten: bestehende Position (Abgleich über `bez` + Rubrik – Techem nutzt
   dieselbe Bezeichnung wie „30% Grundkosten"/„70% Verbrauchskosten" sowohl bei Heizung als auch
   bei Warmwasser, `bez` allein wäre also mehrdeutig und würde die falsche Position überschreiben,
   s. Fund beim Testen mit der echten Vorlage) wird aktualisiert (Gesamtbetrag/Schlüssel objektweit
   identisch, egal welche Einheiten-PDF gerade importiert wird), fehlende Position wird neu
   angelegt. Bei schluessel="verbrauch" wird zusätzlich NUR die Verbrauchsmenge DIESER Einheit
   gesetzt (k.verbrauch bleibt für andere Einheiten unangetastet – die werden über weitere Importe
   ergänzt). */
function techemPositionFinden(p) { return state.kosten.findIndex(k => k.bez === p.bez && nkRubrik(k) === p.rubrik); }
/* Ralf-Vorgabe 2026-07-11: bereits vorhandene Werte (Mieter-Name/Vermieter/Anschrift/IBAN) NICHT
   stumm überschreiben, sondern – wie beim Vorjahres-Kosten-Übernehmen (US-90) – direkt mit dem
   neuen Wert überschreiben, aber als unbestätigten Vorschlag markieren (blaues Eck), solange der
   alte Wert nicht leer und nicht bereits identisch war. */
function techemIstAbweichenderVorschlag(alt, neu) {
  const a = String(alt || '').trim(), n = String(neu || '').trim();
  return !!a && a !== n;
}
/* Zahlen-Variante von techemIstAbweichenderVorschlag (z. B. Gesamtmenge) – mit Tolerenz statt
   exaktem String-Vergleich, da Rundungen/Formatierung sonst fälschlich als Abweichung zählen. */
function techemIstAbweichendeZahl(alt, neu, tol) {
  const a = +alt || 0, n = +neu || 0;
  return a > 0 && Math.abs(a - n) > (tol == null ? 0.05 : tol);
}
/* Welches Mietverhältnis der Einheit ist "das aktuelle" (für Mieter-Name-Vorschlag)? Bevorzugt das
   laufende (m.laeuft), sonst das mit dem größten Zeitanteil im Abrechnungszeitraum, sonst das
   letzte in der Liste. */
function techemAktiveMvIndex(einheitIdx) {
  const mvArr = (state.einheiten[einheitIdx] && state.einheiten[einheitIdx].mv) || [];
  const laeuft = mvArr.findIndex(m => m.laeuft);
  if (laeuft >= 0) return laeuft;
  let best = -1, bestZa = -1;
  mvArr.forEach((m, idx) => {
    const za = nkZeitanteil(m.von, nkMvEnde(m, state.objekt.bis), state.objekt.von, state.objekt.bis);
    if (za > bestZa) { bestZa = za; best = idx; }
  });
  return best >= 0 ? best : (mvArr.length - 1);
}
function techemUebernehmen() {
  const beleg = _techemBeleg; if (!beleg) return;
  const sel = document.getElementById('techem_einheit');
  let einheitId, einheitIdx, neuAngelegteEinheit = null;
  if (sel.value === '__neu__') {
    /* Ralf-Vorgabe 2026-07-10: vorgeschlagene neue Einheit jetzt tatsächlich anlegen, statt nur zur
       Auswahl unter bestehenden Einheiten zu zwingen. addEinheit() vergibt selbst einen generischen
       Namen (z. B. "Einheit 4") – hier direkt auf die erkannte Techem-Kennung umbenennen. */
    const kennung = beleg.lage || beleg.nutzerNr || '';
    store.addEinheit();
    einheitIdx = state.einheiten.length - 1;
    store.setEinheitFeld(einheitIdx, 'name', kennung);
    neuAngelegteEinheit = state.einheiten[einheitIdx];
    einheitId = neuAngelegteEinheit.id;
  } else {
    einheitId = +sel.value;
    einheitIdx = state.einheiten.findIndex(e => e.id === einheitId);
  }
  if (!einheitId) { alert('Bitte eine Einheit auswählen.'); return; }
  /* Fund 2026-07-11 (Ralf): "Ihre Kosten" einer schluessel="flaeche"-Position ergibt sich bei Techem
     aus Gesamtkosten : Gesamtfläche x Ihre Fläche. NeKoFix berechnet den Anteil dagegen selbst aus
     der in "Objekt & Einheiten" hinterlegten Fläche (nkFactor/nkFaktorFuer liest e.flaeche) – ohne
     Abgleich würde NeKoFix bei abweichender/fehlender Fläche einen anderen Betrag als die Techem-
     Abrechnung errechnen. Deshalb hier synchronisieren: leer/0 wird direkt übernommen (keine
     Markierung nötig, nichts überschrieben).
     Ralf-Vorgabe 2026-07-13: eine bereits gesetzte ABWEICHENDE Fläche wird NICHT mehr per confirm()
     abgefragt, sondern wie alle anderen Importwerte direkt gesetzt und als unbestätigter Vorschlag
     markiert (blaues Eck) – passiv statt unterbrechend, konsistent mit Mieter-Name/Vermieter-Feldern/
     Gesamtmenge. */
  const flaechenPos = beleg.positionen.filter(p => p.schluessel === 'flaeche');
  if (flaechenPos.length && einheitIdx >= 0) {
    const pdfFlaeche = flaechenPos[0].ihreMenge;
    const aktuell = +state.einheiten[einheitIdx].flaeche || 0;
    /* setEinheitFeld() erwartet für Nicht-"name"-Felder deutsches Zahlenformat (Punkt =
       Tausendertrennzeichen, Komma = Dezimal, s. nkParseBetrag) – ein roher JS-Float wie 86.1 würde
       sonst als "861" fehlinterpretiert (Punkt fälschlich als Tausendertrennzeichen entfernt).
       nkFmtZahl() erzeugt genau dieses Format und rundtripped korrekt zurück. */
    if (!aktuell) {
      store.setEinheitFeld(einheitIdx, 'flaeche', nkFmtZahl(pdfFlaeche));
    } else if (Math.abs(aktuell - pdfFlaeche) > 0.05) {
      store.setEinheitFeld(einheitIdx, 'flaeche', nkFmtZahl(pdfFlaeche));
      store.setEinheitVorschlagFeld(einheitIdx, 'flaeche', true);
    }
  }
  /* Ralf-Vorgabe 2026-07-11: Mieter-Name (+ Anrede) und Vermieter-Name/Anschrift/IBAN ebenfalls
     übernehmen – mit unbestätigtem Vorschlag (blaues Eck), falls dort schon etwas ANDERES stand. */
  if (beleg.mieterName && einheitIdx >= 0) {
    const mi = techemAktiveMvIndex(einheitIdx);
    if (mi >= 0) {
      const m = state.einheiten[einheitIdx].mv[mi];
      const vorschlag = techemIstAbweichenderVorschlag(m.mieter, beleg.mieterName);
      store.setMvFeld(einheitIdx, mi, 'mieter', beleg.mieterName);
      if (beleg.anrede) store.setMvFeld(einheitIdx, mi, 'anrede', beleg.anrede);
      store.setMvFeld(einheitIdx, mi, 'mieterVorschlag', vorschlag);
    }
  }
  const z = state.zahlung || {};
  const vermieterName = beleg.kontoinhaber || beleg.absenderName;
  if (vermieterName) {
    store.setZahlungVorschlagFeld('empfaenger', techemIstAbweichenderVorschlag(z.empfaenger, vermieterName));
    store.setZahlungFeld('empfaenger', vermieterName);
  }
  if (beleg.absenderAnschrift) {
    store.setZahlungVorschlagFeld('anschrift', techemIstAbweichenderVorschlag(z.anschrift, beleg.absenderAnschrift));
    store.setZahlungFeld('anschrift', beleg.absenderAnschrift);
  }
  if (beleg.iban) {
    store.setZahlungVorschlagFeld('iban', techemIstAbweichenderVorschlag(z.iban, beleg.iban));
    store.setZahlungFeld('iban', nkFmtIban(beleg.iban));
  }
  /* Ralf-Vorgabe 2026-07-11: die Heizkosten-Rubrik ist bei Techem in "Grundkosten"(Fläche)/
     "Verbrauchskosten"(kWh) aufgeteilt – NeKoFix bildet diese 30/70-Aufteilung dagegen INNERHALB
     eines einzelnen Heizblocks ab (typ:"heizung", nkExpandHeizSplit errechnet Grund-/
     Verbrauchsanteil selbst aus einem Prozentsatz). Die beiden Techem-Zeilen würden als generische
     Kostenarten sonst am Heizungs-Reiter (Energieart/CO2/Verbrauch-je-kWh) vorbeilaufen. Deshalb
     Sonderbehandlung NUR für Heizkosten: aus beiden Zeilen EINEN Block (Gesamtbetrag = Summe beider)
     ableiten/aktualisieren, die Grundkosten-Zeile NICHT zusätzlich als eigene Kostenart anlegen (ihre
     Fläche ist oben bereits synchronisiert).
     Ralf-Fund 2026-07-13 (Warmwasser-Umbuchung): bei Warmwasser bucht Techem "Kaltwasser für
     Warmwasser"/"Abwasser aus Warmwasser" vor dem 30/70-Split ab und rechnet sie NUR in den
     Verbrauchsanteil zurück (belegt mit Warmwasserrechnung.xlsx: 363,21 € Grundkosten + 1.251,87 €
     Verbrauchskosten = 1.615,08 € Gesamt, aber NICHT 30/70 von 1.615,08). Ein gemeinsamer Heizblock
     würde intern erneut (falsch) 30/70 vom ZUSAMMENGEFASSTEN Betrag ableiten (nkHeizGrundProzent ist
     zudem gesetzlich auf 30–50 % geklemmt, der tatsächliche Anteil hier liegt mit ~22,5 % darunter).
     Deshalb bewusst NUR Heizkosten zusammenführen – Warmwasser bleibt wie vor 2026-07-13 als zwei
     getrennte generische Kostenarten (übernimmt Techems exakte Beträge unverändert, s. Verifikation
     in der Session: 363,21×47,9/470,6 + 1.251,87×9,9/60 = 243,53 € = exakt "Ihre Warmwasserkosten").
     Kaltwasser/Betriebskosten bleiben ebenfalls unverändert generische Kostenarten. */
  function techemHeizBlockUebernehmen(rubrik, bez, co2AnteilProzent) {
    const flaeche = beleg.positionen.find(p => p.rubrik === rubrik && p.schluessel === 'flaeche');
    const verbrauch = beleg.positionen.find(p => p.rubrik === rubrik && p.schluessel === 'verbrauch');
    if (!verbrauch) return { flaeche: null, verbrauch: null };
    let hidx = state.kosten.findIndex(k => k.typ === 'heizung' && k.bez === bez);
    const gesamt = (flaeche ? flaeche.gesamtbetrag : 0) + verbrauch.gesamtbetrag;
    if (hidx < 0) {
      store.addKostenPos({ bez: bez, betrag: gesamt, typ: 'heizung', schluessel: 'verbrauch', einheit: verbrauch.einheit, verbrauch: {}, gesamtmenge: verbrauch.gesamtmenge });
      hidx = state.kosten.length - 1;
    } else {
      /* Ralf-Vorgabe 2026-07-13: leer/gleich (z. B. zweiter Mieter derselben Abrechnungsperiode,
         s. gesamtmenge unten) -> direkt, kein Raten nötig; abweichend (z. B. andere Periode versehentlich
         importiert) -> setzen UND als unbestätigten Vorschlag markieren, statt stillschweigend zu
         überschreiben – konsistent mit allen anderen Importwerten. */
      const altBetrag = +store.kosten(hidx).betrag || 0;
      store.setKostenFeld(hidx, 'betrag', gesamt);
      if (altBetrag && techemIstAbweichendeZahl(altBetrag, gesamt)) store.setKostenVorschlagFeld(hidx, 'betrag', true);
      /* Ralf-Vorgabe 2026-07-13: Gesamtmenge der Liegenschaft steht schon auf dem ERSTEN
         importierten Mieter-PDF (s. calc.js nkVerbrauchGesamt) – leer/0 direkt übernehmen, eine
         bereits gesetzte abweichende Gesamtmenge NICHT stumm überschreiben, sondern wie die
         Mieter-/Vermieter-Felder als unbestätigten Vorschlag markieren (blaues Eck). */
      const altGesamt = store.kosten(hidx).gesamtmenge;
      if (!altGesamt) {
        store.setKostenFeld(hidx, 'gesamtmenge', verbrauch.gesamtmenge);
      } else if (techemIstAbweichendeZahl(altGesamt, verbrauch.gesamtmenge)) {
        store.setKostenFeld(hidx, 'gesamtmenge', verbrauch.gesamtmenge);
        store.setKostenVorschlagFeld(hidx, 'gesamtmenge', true);
      }
    }
    store.setKostenVerbrauch(hidx, einheitId, verbrauch.ihreMenge);
    /* Energieart: Ralfs Vorgabe "herausfinden, welcher Typ Heizung das ist" – aus der
       Verbrauchsanalyse-Zeile "Menge <Energieträger> in <Einheit>" abgeleitet (s. calc.js
       nkTechemEnergieartKey). Unbekannt -> nichts setzen, die bestehende Energieart-Auswahl im
       Heizung-Reiter bleibt die Abfrage (kein Raten).
       Ralf-Vorgabe 2026-07-13: abweichend von einer bereits gesetzten Energieart NICHT mehr per
       confirm() nachfragen, sondern direkt setzen und als unbestätigten Vorschlag markieren (blaues
       Eck), konsistent mit allen anderen Importwerten. */
    const key = nkTechemEnergieartKey(beleg.energietraeger, verbrauch.einheit);
    if (key) {
      const hk = store.kosten(hidx);
      if (!hk.energieart) {
        store.setKostenFeld(hidx, 'energieart', key);
      } else if (hk.energieart !== key) {
        store.setKostenFeld(hidx, 'energieart', key);
        store.setKostenVorschlagFeld(hidx, 'energieart', true);
      }
    }
    /* Gebäude-CO2 (Gesamt-kg/-Kosten), auf diesen Block entfallender Anteil: Techems eigene
       "CO2-Abgabe"-Werte als Vorschlag für die Felder, die laut Hinweistext sonst "von der
       Brennstoffrechnung" übernommen werden – leer/0 direkt setzen, abweichend bereits gepflegte
       Werte erst nach Rückfrage überschreiben. Nur fossile Brennstoffe verursachen eine CO2-Abgabe
       (nkEnergieart(...).fossil-Prüfung greift ohnehin beim Abzug selbst, s. calc.js
       nkMieterAbrechnung/nkHeizBlockMieterProzent) – hier zusätzlich: ohne Anteil (0 %) nichts setzen.
       Ralf-Fund 2026-07-13 (Rechenkette auf S.2 nachvollzogen: "Anlieferung Brennstoff 7.947,75 ./.
       CO2-Kosten Vermieter -220,08 = Verbrauch 7.727,67" – exakt der Vermieteranteil aus S.4/4):
       Techem verrechnet den Vermieteranteil an der CO2-Abgabe bereits VOR der Heizung/Warmwasser-
       Aufteilung mit dem rohen Brennstoffpreis. "Ihre Heizkosten" (und damit auch NeKoFix' importierte
       Beträge) sind also schon NETTO des Vermieteranteils. co2Informativ=true markiert das für
       nkMieterAbrechnung: CO2 wird weiterhin angezeigt/erläutert, aber NICHT zusätzlich vom
       Mieterbetrag abgezogen (sonst Doppelzählung). Gilt nur für den Techem-Import – bei manuell
       erfassten Heizkosten (ohne diese Vorverrechnung) bleibt der Abzug wie bisher aktiv.
       Ralf-Vorgabe 2026-07-13: abweichend bereits gepflegte Werte NICHT mehr per confirm()
       nachfragen, sondern direkt setzen und als unbestätigten Vorschlag markieren (blaues Eck). */
    if ((beleg.co2KgGebaeude || beleg.co2KostenGebaeude) && co2AnteilProzent > 0) {
      const hk = store.kosten(hidx);
      const aktKg = +hk.co2Kg || 0, aktKosten = +hk.co2Kosten || 0;
      const neuKg = (+beleg.co2KgGebaeude || 0) * co2AnteilProzent / 100, neuKosten = (+beleg.co2KostenGebaeude || 0) * co2AnteilProzent / 100;
      store.setKostenFeld(hidx, 'co2Kg', neuKg);
      store.setKostenFeld(hidx, 'co2Kosten', neuKosten);
      store.setKostenFeld(hidx, 'co2Informativ', true);
      if ((aktKg || aktKosten) && (Math.abs(aktKg - neuKg) > 0.5 || Math.abs(aktKosten - neuKosten) > 0.5)) {
        store.setKostenVorschlagFeld(hidx, 'co2', true);
      }
    }
    return { flaeche: flaeche, verbrauch: verbrauch };
  }
  const co2AnteilHeizung = (beleg.co2AnteilHeizungProzent !== "" && beleg.co2AnteilHeizungProzent != null) ? +beleg.co2AnteilHeizungProzent : 100;
  const heiz = techemHeizBlockUebernehmen('Heizkosten', 'Heizung', co2AnteilHeizung);
  const sonstigePositionen = beleg.positionen.filter(p => p !== heiz.flaeche && p !== heiz.verbrauch);
  sonstigePositionen.forEach(p => {
    let idx = techemPositionFinden(p);
    if (idx < 0) {
      store.addKostenPos({ bez: p.bez, betrag: p.gesamtbetrag, schluessel: p.schluessel, rubrik: p.rubrik, einheit: p.einheit, verbrauch: p.schluessel === 'verbrauch' ? {} : undefined, gesamtmenge: p.schluessel === 'verbrauch' ? p.gesamtmenge : undefined });
      idx = state.kosten.length - 1;
    } else {
      /* Ralf-Vorgabe 2026-07-13: Betrag/Schlüssel/Einheit einer bereits vorhandenen Kostenart wurden
         hier bislang stillschweigend überschrieben (keine Markierung) – jetzt wie alle anderen
         Importwerte: leer/gleich -> direkt (keine Markierung nötig), abweichend -> setzen UND als
         unbestätigten Vorschlag markieren (blaues Eck). */
      const alt = store.kosten(idx);
      const altBetrag = +alt.betrag || 0, altSchluessel = alt.schluessel, altEinheit = alt.einheit;
      store.setKostenFeld(idx, 'betrag', p.gesamtbetrag);
      if (altBetrag && Math.abs(altBetrag - p.gesamtbetrag) > 0.01) store.setKostenVorschlagFeld(idx, 'betrag', true);
      store.setKostenFeld(idx, 'schluessel', p.schluessel);
      if (altSchluessel && altSchluessel !== p.schluessel) store.setKostenVorschlagFeld(idx, 'schluessel', true);
      if (p.einheit) {
        store.setKostenFeld(idx, 'einheit', p.einheit);
        if (altEinheit && altEinheit !== p.einheit) store.setKostenVorschlagFeld(idx, 'einheit', true);
      }
      /* s. Kommentar bei der Heizblock-Übernahme oben: gleiches Muster für Kaltwasser-/
         Warmwasser-Positionen (Kubikmeter), die ebenfalls schluessel="verbrauch" mit Techem-
         Gesamtmenge liefern. */
      if (p.schluessel === 'verbrauch') {
        const alt = store.kosten(idx).gesamtmenge;
        if (!alt) {
          store.setKostenFeld(idx, 'gesamtmenge', p.gesamtmenge);
        } else if (techemIstAbweichendeZahl(alt, p.gesamtmenge)) {
          store.setKostenFeld(idx, 'gesamtmenge', p.gesamtmenge);
          store.setKostenVorschlagFeld(idx, 'gesamtmenge', true);
        }
      }
    }
    if (p.schluessel === 'verbrauch') store.setKostenVerbrauch(idx, einheitId, p.ihreMenge);
  });
  const einheitName = (state.einheiten.find(e => e.id === einheitId) || {}).name || '?';
  const anzahl = sonstigePositionen.length + (heiz.verbrauch ? 1 : 0);
  techemReviewSchliessen();
  /* renderEinheiten() rendert auch Mieter & Vertrag mit (macht eine evtl. neu angelegte Einheit
     dort sofort sichtbar); renderKosten()/renderHeizung() separat, da renderEinheiten() diese Reiter
     nicht mitzieht; fillObjektKopf() aktualisiert Vermieter & Zahlungsangaben (inkl. Vorschlag-Eck). */
  if (typeof renderEinheiten === 'function') renderEinheiten();
  if (typeof renderKosten === 'function') renderKosten();
  if (typeof renderHeizung === 'function') renderHeizung();
  if (typeof fillObjektKopf === 'function') fillObjektKopf();
  if (typeof updateSaveStatus === 'function') updateSaveStatus();
  const neuHinweis = neuAngelegteEinheit ? ('Neue Einheit „' + einheitName + '" wurde angelegt – Fläche/Mieter bitte in „Objekt & Einheiten" ergänzen. ') : '';
  alert(neuHinweis + anzahl + ' Kostenposition(en) aus der Techem-Abrechnung übernommen (Einheit „' + einheitName + '"). Mieter-Name sowie Vermieter/Anschrift/IBAN wurden, soweit erkannt, ebenfalls übernommen – bitte anhand des blauen Ecks in den jeweiligen Feldern prüfen. Betriebskosten-Posten bitte gegen bereits vorhandene Positionen prüfen, falls diese auch manuell gepflegt werden.');
}
