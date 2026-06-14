/* NeKoFix – Rechenkern (Verteilung der Nebenkosten).
   Reine Funktionen ohne Seiteneffekte, damit sie sowohl im Browser (index.html)
   als auch in den Tests (Node) verwendet werden können. */

/* US-37: zentrale fachliche Konstanten (eine Quelle statt verstreuter Magic Numbers). */
const NK_UST_SATZ = 19;          // Umsatzsteuersatz in Prozent (gewerbliche Mieter)
const NK_LEERSTAND_EPS = 0.0001; // Schwelle, ab der Leerstand angezeigt/ausgewiesen wird

/* US-48: Geldbeträge in deutscher Schreibweise (Tausenderpunkt, Komma, 2 Nachkommastellen).
   nkFmtBetrag: Zahl → "1.000,10"; nkParseBetrag: Eingabe-String → Zahl (tolerant). Reine Funktionen. */
function nkFmtBetrag(n) {
  return (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function nkParseBetrag(s) {
  let t = String(s == null ? "" : s).trim();
  if (t === "") return 0;
  if (t.indexOf(",") >= 0) t = t.replace(/\./g, "").replace(",", "."); // dt. Format: Punkt = Tausender, Komma = Dezimal
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}

/* US-05: Energiearten mit typischem Heizwert Hi (kWh je Einheit) und Brennstoff-Einheit.
   fossil = relevant für die spätere CO2-Aufteilung (US-07). Werte sind Vorbelegungen, überschreibbar. */
/* faktorTyp: "hi" = Heizwert (kWh je Brennstoffeinheit) · "jaz" = Arbeitszahl der Wärmepumpe
   (kWh Wärme je kWh Strom) · "direkt" = Verbrauch ist bereits in kWh, kein Faktor nötig. */
const NK_ENERGIEARTEN = [
  { key: "erdgas_kwh",  label: "Erdgas (kWh)",        einheit: "kWh", hi: 1,    faktorTyp: "direkt", fossil: true },
  { key: "erdgas_m3",   label: "Erdgas (m³)",          einheit: "m³",  hi: 10.5, faktorTyp: "hi",     fossil: true },
  { key: "heizoel",     label: "Heizöl",               einheit: "l",   hi: 10,   faktorTyp: "hi",     fossil: true },
  { key: "fluessiggas", label: "Flüssiggas",           einheit: "l",   hi: 6.57, faktorTyp: "hi",     fossil: true },
  { key: "pellets",     label: "Pellets",              einheit: "kg",  hi: 5,    faktorTyp: "hi",     fossil: false },
  { key: "fernwaerme",  label: "Fernwärme",            einheit: "kWh", hi: 1,    faktorTyp: "direkt", fossil: false },
  { key: "waerme_kwh",  label: "Wärme (kWh)",          einheit: "kWh", hi: 1,    faktorTyp: "direkt", fossil: false },
  { key: "strom_wp",    label: "Strom (Wärmepumpe)",   einheit: "kWh", hi: 3.5,  faktorTyp: "jaz",    fossil: false }
];
function nkEnergieart(key) { return NK_ENERGIEARTEN.find(e => e.key === key) || NK_ENERGIEARTEN[0]; }
function nkMengeZuKwh(menge, heizwert) { return (+menge || 0) * (+heizwert || 0); }
function nkHeizkosten(menge, preis) { return (+menge || 0) * (+preis || 0); }

function nkTotals(einheiten) {
  return {
    flaeche: einheiten.reduce((s, e) => s + (+e.flaeche || 0), 0),
    personen: einheiten.reduce((s, e) => s + (+e.personen || 0), 0),
    einheiten: einheiten.length
  };
}

function nkFactor(e, schluessel, t) {
  if (schluessel === "flaeche") return t.flaeche ? (e.flaeche / t.flaeche) : 0;
  if (schluessel === "person")  return t.personen ? (e.personen / t.personen) : 0;
  return t.einheiten ? (1 / t.einheiten) : 0;
}

/* US-50: Einheiten-Teilnahme je Kostenart. Eine Einheit nimmt an Kostenart k teil, wenn ihre
   ID NICHT in k.ausgeschlossen steht (Default: alle nehmen teil). Der Verteilerfaktor wird
   über die Summe NUR der teilnehmenden Einheiten gebildet; Nicht-Teilnehmer erhalten 0. */
function nkTeilnahme(e, k) {
  const aus = (k && k.ausgeschlossen) || [];
  return aus.indexOf(e.id) < 0;
}
function nkFaktorFuer(e, k, einheiten) {
  if (k && k.schluessel === "direkt") return e.id === k.direktEinheit ? 1 : 0; // US-22: 100 % auf eine Einheit
  if (!nkTeilnahme(e, k)) return 0;
  const teil = (einheiten || []).filter(x => nkTeilnahme(x, k));
  return nkFactor(e, k.schluessel, nkTotals(teil));
}
function nkAusschlussNamen(k, einheiten) {
  const aus = (k && k.ausgeschlossen) || [];
  if (!aus.length) return [];
  return (einheiten || []).filter(e => aus.indexOf(e.id) >= 0).map(e => e.name);
}

function nkAnteilOf(e, kosten, einheiten) {
  return (kosten || []).reduce((s, k) => s + (+k.betrag || 0) * nkFaktorFuer(e, k, einheiten), 0);
}

function nkLineItemsFor(e, kosten, einheiten) {
  return (kosten || []).map(k => {
    const f = nkFaktorFuer(e, k, einheiten);
    return { bez: k.bez, gesamt: +k.betrag || 0, schluessel: k.schluessel, vorsteuer: +k.vorsteuer || 0, faktor: f, anteil: (+k.betrag || 0) * f };
  });
}

/* Umsatzsteuer (US-20). Reine Funktionen. Hinweis: steuerlich noch zu verifizieren. */
function nkNetto(brutto, satz) {
  return (+brutto || 0) / (1 + (+satz || 0) / 100);
}
function nkVorschlagVorsteuer(bez) {
  const b = String(bez || "").toLowerCase();
  if (b.includes("grundsteuer") || b.includes("versicherung")) return 0;
  if (b.includes("müll") || b.includes("mull") || b.includes("wasser") || b.includes("abwasser")) return 7;
  return 19;
}
/* Mieterbetrag je Typ: privat = brutto wie erfasst; gewerblich = Positionen netto stellen,
   summieren, am Ende einheitlich 19 % aufschlagen. items: [{anteil, vorsteuer}]. */
function nkMieterBetrag(items, gewerblich) {
  if (!gewerblich) {
    const b = (items || []).reduce((s, i) => s + (+i.anteil || 0), 0);
    return { netto: b, ust: 0, brutto: b, gewerblich: false };
  }
  const netto = (items || []).reduce((s, i) => s + nkNetto(i.anteil, i.vorsteuer), 0);
  const ust = netto * (NK_UST_SATZ / 100);
  return { netto: netto, ust: ust, brutto: netto + ust, gewerblich: true };
}

/* Eigentümer-Gesamtübersicht (US-18): je Mieter Anteil, Vorauszahlung, Saldo plus Summen. */
function nkOwnerOverview(einheiten, kosten) {
  const rows = einheiten.map(e => {
    const anteil = nkAnteilOf(e, kosten, einheiten);
    const voraus = +e.voraus || 0;
    return { name: e.name, mieter: e.mieter, anteil, voraus, saldo: anteil - voraus };
  });
  const totalAnteil = rows.reduce((s, r) => s + r.anteil, 0);
  const totalVoraus = rows.reduce((s, r) => s + r.voraus, 0);
  return { rows, totalAnteil, totalVoraus, totalSaldo: totalAnteil - totalVoraus };
}

/* Verteilerschlüssel-Vorschlag je Kostenart (US-03). Reine Funktion; in der UI überschreibbar.
   Reihenfolge beachten: spezifischere Begriffe (warmwasser, abwasser) vor allgemeineren (wasser). */
const NK_SCHLUESSEL_VORSCHLAG = [
  ["grundsteuer", "flaeche"],
  ["versicherung", "flaeche"],
  ["allgemeinstrom", "flaeche"],
  ["strom", "flaeche"],
  ["hauswart", "flaeche"],
  ["hausmeister", "flaeche"],
  ["garten", "flaeche"],
  ["reinigung", "flaeche"],
  ["schornstein", "flaeche"],
  ["aufzug", "flaeche"],
  ["heizung", "flaeche"],
  ["warmwasser", "flaeche"],
  ["abwasser", "person"],
  ["wasser", "person"],
  ["müll", "einheit"],
  ["mull", "einheit"]
];
function nkVorschlagSchluessel(bez) {
  const b = String(bez || "").toLowerCase();
  for (const [key, sch] of NK_SCHLUESSEL_VORSCHLAG) {
    if (b.includes(key)) return sch;
  }
  return "flaeche";
}

/* Notizen-System (US-19): Anzahl noch nicht geprüfter Kostenpositionen. */
function nkUngeprueftAnzahl(kosten) {
  return (kosten || []).filter(k => (k.status || "vorlaeufig") !== "geprueft").length;
}

/* Persistenz (US-27): State aus JSON laden und grob prüfen. Gibt Objekt oder null zurück. */
function nkParseState(json) {
  try {
    const o = JSON.parse(json);
    if (o && typeof o === "object" && Array.isArray(o.einheiten) && Array.isArray(o.kosten)) return o;
    return null;
  } catch (e) { return null; }
}

/* Mietanpassung (US-21): ist die nächste Anpassung in <= schwelleMonate ab heute fällig? */
function nkBaldFaellig(zielDatum, heuteDatum, schwelleMonate) {
  const ziel = nkDatum(zielDatum), heute = nkDatum(heuteDatum);
  if (!ziel || !heute) return false;
  const grenze = new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth() + (+schwelleMonate || 0), heute.getUTCDate()));
  return ziel >= heute && ziel <= grenze;
}

/* Zahlungseingänge (US-28): monatlicher Soll-Betrag und aktive Monate. */
function nkSollMonat(grundmiete, nkMonat, stellAnzahl, stellPreis) {
  return (+grundmiete || 0) + (+nkMonat || 0) + (+stellAnzahl || 0) * (+stellPreis || 0);
}
/* US-35: monatliche NK-Vorauszahlung eines Mietverhältnisses – Monatsbetrag, sonst aus
   Jahressumme ÷ Monate gerundet. Reine Funktion (aus view.js nach calc.js verschoben). */
function nkMonatNK(m) {
  return (+m.vmonat) || Math.round((+m.voraus || 0) / (m.vmonate || 12));
}
function nkAktiveMonate(mvVon, mvBis, pVon, pBis) {
  const a1 = nkDatum(mvVon), e1 = nkDatum(mvBis), a2 = nkDatum(pVon), e2 = nkDatum(pBis);
  if (!a1 || !e1 || !a2 || !e2) return [];
  const start = a1 > a2 ? a1 : a2, end = e1 < e2 ? e1 : e2;
  if (end < start) return [];
  const out = []; let y = start.getUTCFullYear(), mo = start.getUTCMonth();
  const ey = end.getUTCFullYear(), em = end.getUTCMonth();
  while (y < ey || (y === ey && mo <= em)) {
    out.push(y + "-" + String(mo + 1).padStart(2, "0"));
    mo++; if (mo > 11) { mo = 0; y++; }
  }
  return out;
}

/* Standardname für eine neue Einheit (US-26): nächstes Geschoss hochzählen. */
function nkNaechsteEinheitName(namen) {
  let max = 0;
  (namen || []).forEach(n => {
    const m = String(n).match(/(\d+)\.\s*OG/i);
    if (m && +m[1] > max) max = +m[1];
  });
  if (max > 0) return (max + 1) + ". OG";
  return (namen || []).some(n => /EG/i.test(n)) ? "1. OG" : "EG";
}

/* Zeitanteilige Aufteilung (US-10). Datumsformat "YYYY-MM-DD". Reine Funktionen. */
function nkDatum(s) {
  if (!s) return null;
  const p = String(s).split("-");
  if (p.length !== 3) return null;
  const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  return isNaN(d.getTime()) ? null : d;
}
function nkTageInklusive(von, bis) {
  const a = nkDatum(von), b = nkDatum(bis);
  if (!a || !b || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}
function nkUeberlappungsTage(von1, bis1, von2, bis2) {
  const a1 = nkDatum(von1), e1 = nkDatum(bis1), a2 = nkDatum(von2), e2 = nkDatum(bis2);
  if (!a1 || !e1 || !a2 || !e2) return 0;
  const start = a1 > a2 ? a1 : a2;
  const end = e1 < e2 ? e1 : e2;
  if (end < start) return 0;
  return Math.round((end - start) / 86400000) + 1;
}
/* US-47: Gesamtzahl der Tage, an denen sich Mietverhältnisse derselben Einheit überschneiden
   (Summe über alle Paare). 0 = keine Überschneidung. */
function nkUeberlappungTageEinheit(e) {
  const mv = (e && e.mv) || [];
  let tage = 0;
  for (let i = 0; i < mv.length; i++)
    for (let j = i + 1; j < mv.length; j++)
      tage += nkUeberlappungsTage(mv[i].von, mv[i].bis, mv[j].von, mv[j].bis);
  return tage;
}
function nkZeitanteil(mvVon, mvBis, pVon, pBis) {
  const tage = nkTageInklusive(pVon, pBis);
  if (tage <= 0) return 0;
  return nkUeberlappungsTage(mvVon, mvBis, pVon, pBis) / tage;
}

/* Vorauszahlung (US-09): Gesamt = Monatsbetrag × Monate + Einmalzahlung. Reine Funktionen. */
function nkVorauszahlungGesamt(monatsbetrag, monate, einmal) {
  return (+monatsbetrag || 0) * (+monate || 0) + (+einmal || 0);
}
function nkVorschlagVorauszahlung(anteil) {
  return Math.round((+anteil || 0) / 12);
}

/* Umlagefähigkeit je Kostenart (US-04). Reine Funktion; gibt Vorschlag + Begründung zurück.
   Nicht umlagefähig: Verwaltung, Instandhaltung/Reparatur, Rücklagen sowie das
   Kabel-/Fernsehsignal (seit 01.07.2024). Unbekanntes gilt vorsichtshalber als umlagefähig. */
function nkUmlageInfo(bez) {
  const b = String(bez || "").toLowerCase();
  if (b.includes("verwaltung")) return { umlagefaehig: false, grund: "Verwaltungskosten sind nicht umlagefähig." };
  if (b.includes("instandhalt") || b.includes("instandsetz") || b.includes("reparatur"))
    return { umlagefaehig: false, grund: "Instandhaltung/Reparaturen sind nicht umlagefähig." };
  if (b.includes("rücklage") || b.includes("ruecklage"))
    return { umlagefaehig: false, grund: "Rücklagen sind nicht umlagefähig." };
  if (b.includes("kabel") || b.includes("fernseh") || b.includes("breitband"))
    return { umlagefaehig: false, grund: "Kabel-/Fernsehsignal ist seit 01.07.2024 nicht mehr umlagefähig." };
  return { umlagefaehig: true, grund: "" };
}

/* Plausibilitätsprüfung (US-14): liefert Prüfpunkte und ob die Abrechnung „bereit" ist. */
function nkPlausibilitaet(s) {
  const punkte = [];
  const E = s.einheiten || [], K = s.kosten || [], Z = s.zahlung || {}, O = s.objekt || {};
  if (nkTageInklusive(O.von, O.bis) > 0) punkte.push({ level: "ok", text: "Abrechnungszeitraum gültig." });
  else punkte.push({ level: "fehler", text: "Abrechnungszeitraum ungültig (von/bis prüfen)." });
  const t = nkTotals(E);
  K.forEach(k => {
    const basis = k.schluessel === "flaeche" ? t.flaeche : k.schluessel === "person" ? t.personen : t.einheiten;
    if (!(basis > 0)) punkte.push({ level: "fehler", text: "Position „" + k.bez + "“ ist nicht verteilbar (Basis für „" + k.schluessel + "“ ist 0)." });
  });
  if (K.length) punkte.push({ level: "ok", text: K.length + " Kostenposition(en), alle verteilbar." });
  if (Z.iban && String(Z.iban).trim()) punkte.push({ level: "ok", text: "IBAN vorhanden." });
  else punkte.push({ level: "fehler", text: "IBAN fehlt (Zahlungsangaben)." });
  if (!(Z.empfaenger && String(Z.empfaenger).trim())) punkte.push({ level: "fehler", text: "Empfänger der Zahlung fehlt." });
  let ohneName = 0;
  E.forEach(e => (e.mv || []).forEach(m => { if (!(m.mieter && String(m.mieter).trim())) ohneName++; }));
  if (ohneName) punkte.push({ level: "fehler", text: ohneName + " Mietverhältnis(se) ohne Mieternamen." });
  const nu = K.filter(k => !nkUmlageInfo(k.bez).umlagefaehig);
  if (nu.length) punkte.push({ level: "warn", text: nu.length + " nicht umlagefähige Position(en) enthalten (z. B. „" + nu[0].bez + "“)." });
  let leer = false;
  E.forEach(e => { const z = (e.mv || []).reduce((a, m) => a + nkZeitanteil(m.von, m.bis, O.von, O.bis), 0); if (z < 0.999) leer = true; });
  if (leer) punkte.push({ level: "warn", text: "Leerstand vorhanden – dieser Anteil trägt der Vermieter." });
  // US-47: Spiegelbild der Leerstand-Prüfung – Summe der Zeitanteile einer Einheit über 100 %
  // deutet auf überschneidende Mietzeiträume (Doppelerfassung) hin.
  E.forEach(e => {
    const tage = nkUeberlappungTageEinheit(e);
    if (tage > 0) {
      const namen = (e.mv || []).map(m => (m.mieter && String(m.mieter).trim()) || "(ohne Name)").join(", ");
      punkte.push({ level: "warn", text: "Einheit „" + e.name + "“: überschneidende Mietzeiträume – " + tage + " Tag(e) doppelt belegt; Mietverhältnisse prüfen: " + namen + "." });
    }
  });
  return { bereit: !punkte.some(p => p.level === "fehler"), punkte };
}

/* US-36: HTML-Escaping für Freitext (Namen, Notizen, Adresse), bevor er ins innerHTML
   eingefügt wird. Reine Funktion, deshalb hier und getestet. */
function nkEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* US-32: zentrale, getestete Abrechnung eines einzelnen Mietverhältnisses.
   `t` sind die Objekt-Totals (nkTotals über ALLE Einheiten). Liefert alles, was
   Bildschirm, PDF und Rechenweg brauchen – eine Quelle der Wahrheit. */
function nkMieterAbrechnung(e, m, kosten, objekt, einheiten) {
  const o = objekt || {};
  const za = nkZeitanteil(m.von, m.bis, o.von, o.bis);
  const gewerblich = !!m.gewerblich;
  const zeilen = nkLineItemsFor(e, kosten || [], einheiten).map(i => {
    const anteil = i.anteil * za;                 // zeitanteilig
    const wert = gewerblich ? nkNetto(anteil, i.vorsteuer) : anteil; // Anzeige je Zeile
    return {
      bez: i.bez, gesamt: i.gesamt, schluessel: i.schluessel, vorsteuer: i.vorsteuer,
      faktor: i.faktor, anteilVoll: i.anteil, anteil: anteil, wert: wert
    };
  });
  const betrag = nkMieterBetrag(zeilen, gewerblich); // liest .anteil und .vorsteuer
  const vorauszahlung = +m.voraus || 0;
  return {
    einheit: e.name, mieter: m.mieter, gewerblich: gewerblich,
    von: m.von, bis: m.bis, zeitanteil: za, zeilen: zeilen,
    netto: betrag.netto, ust: betrag.ust, brutto: betrag.brutto,
    vorauszahlung: vorauszahlung, saldo: betrag.brutto - vorauszahlung
  };
}

/* US-32: Abrechnung des gesamten Objekts – je Einheit die Mietverhältnisse und der
   Leerstand (trägt der Vermieter) plus Objekt-Summen. */
function nkObjektAbrechnung(einheiten, kosten, objekt) {
  const E = einheiten || [], K = kosten || [];
  let summeAnteil = 0, summeVoraus = 0;
  const eRows = E.map(e => {
    const unitShare = nkAnteilOf(e, K, E);
    let sumZa = 0;
    const mietverhaeltnisse = (e.mv || []).map(m => {
      const ab = nkMieterAbrechnung(e, m, K, objekt, E);
      sumZa += ab.zeitanteil; summeAnteil += ab.brutto; summeVoraus += ab.vorauszahlung;
      return ab;
    });
    const leerstandZeitanteil = Math.max(0, 1 - sumZa);
    const leerstandBetrag = unitShare * leerstandZeitanteil;
    summeAnteil += leerstandBetrag;
    return { name: e.name, unitShare: unitShare, mietverhaeltnisse: mietverhaeltnisse, leerstandZeitanteil: leerstandZeitanteil, leerstandBetrag: leerstandBetrag };
  });
  return { totals: nkTotals(E), einheiten: eRows, summeAnteil: summeAnteil, summeVoraus: summeVoraus, summeSaldo: summeAnteil - summeVoraus };
}

/* US-11: ISO-Datum um ein Jahr verschieben (29.02. → 28.02. im Folgejahr). */
function nkPlusJahr(d) {
  const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  const y = (+m[1]) + 1;
  let day = +m[3];
  if (m[2] === "02" && day === 29) day = 28;
  return y + "-" + m[2] + "-" + String(day).padStart(2, "0");
}

/* US-11: Vorjahr als Vorlage für die Folgeperiode übernehmen (reine Funktion).
   - Abrechnungszeitraum +1 Jahr (AC3)
   - Stammdaten, Kostenarten und Verteilerschlüssel bleiben; Kostenbeträge werden geleert (AC1/AC2)
   - Mietverhältnisse, die vor Periodenende endeten (ausgezogen), werden weggelassen;
     aktive werden auf den vollen Folgezeitraum gesetzt, Zahlungseingänge zurückgesetzt
   - Vorauszahlung: Monatsbetrag bleibt, Jahreswert auf 12 Monate gesetzt
   - alle übernommenen Daten tragen die Markierung `vorjahr:true` (AC5) */
function nkVorjahrUebernehmen(src) {
  const s = JSON.parse(JSON.stringify(src || {}));
  const o = s.objekt || {};
  const altBis = o.bis;
  const objekt = Object.assign({}, o, { von: nkPlusJahr(o.von), bis: nkPlusJahr(o.bis) });
  const einheiten = (s.einheiten || []).map(e => {
    const aktive = (e.mv || []).filter(m => !altBis || !m.bis || m.bis >= altBis);
    const mv = aktive.map(m => {
      const monat = +m.vmonat || 0;
      return Object.assign({}, m, {
        von: objekt.von, bis: objekt.bis,
        vmonate: 12, vjahr: monat * 12, voraus: monat * 12,
        bezahlt: {}, vorjahr: true
      });
    });
    return Object.assign({}, e, { mv, vorjahr: true });
  });
  const kosten = (s.kosten || []).map(k => Object.assign({}, k, { betrag: 0, status: "vorlaeufig", vorjahr: true }));
  return { objekt, einheiten, kosten, zahlung: Object.assign({}, s.zahlung), abrechnungStatus: "inArbeit", vorjahr: true };
}

/* US-30/US-11: exakte Objekt-Duplikate entfernen (gleicher Inhalt), Reihenfolge bleibt. */
function nkDedupeObjekte(arr) {
  const out = [], seen = new Set();
  (arr || []).forEach(d => { const sig = JSON.stringify(d); if (!seen.has(sig)) { seen.add(sig); out.push(d); } });
  return out;
}

/* Export nur in Node (für die Tests); im Browser wird dieser Block ignoriert,
   und die Funktionen stehen global zur Verfügung.
   Eine Funktion pro Zeile (mit Komma am Ende) – das entschärft Merge-Konflikte beim
   Hinzufügen neuer Funktionen. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    nkTotals,
    nkFactor,
    nkAnteilOf,
    nkLineItemsFor,
    nkOwnerOverview,
    nkVorschlagSchluessel,
    nkUmlageInfo,
    nkVorauszahlungGesamt,
    nkVorschlagVorauszahlung,
    nkTageInklusive,
    nkUeberlappungsTage,
    nkUeberlappungTageEinheit,
    nkZeitanteil,
    nkNaechsteEinheitName,
    nkParseState,
    nkUngeprueftAnzahl,
    nkNetto,
    nkVorschlagVorsteuer,
    nkMieterBetrag,
    nkSollMonat,
    nkMonatNK,
    nkAktiveMonate,
    nkBaldFaellig,
    nkPlausibilitaet,
    nkPlusJahr,
    nkVorjahrUebernehmen,
    nkDedupeObjekte,
    nkMieterAbrechnung,
    nkObjektAbrechnung,
    nkEsc,
    NK_UST_SATZ,
    NK_LEERSTAND_EPS,
    nkFmtBetrag,
    nkParseBetrag,
    nkTeilnahme,
    nkFaktorFuer,
    nkAusschlussNamen,
    NK_ENERGIEARTEN,
    nkEnergieart,
    nkMengeZuKwh,
    nkHeizkosten,
  };
}
