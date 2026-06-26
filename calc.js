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

/* US-07: CO2-Kostenaufteilung nach CO2KostAufG (seit 2023).
   Wohngebäude: 10-Stufen-Modell nach spez. Ausstoß (kg CO2/m²·a) → Vermieteranteil %.
   Nichtwohngebäude (gewerblich): pauschal 50/50. Denkmal-/Milieuschutz: Anteil halbiert.
   Datengrundlage sind CO2-Menge (kg) und CO2-Kosten (€) von der Brennstoffrechnung. */
const NK_CO2_STUFEN = [
  { bis: 12,       vermieter: 0  }, // < 12 kg/m²·a
  { bis: 17,       vermieter: 10 },
  { bis: 22,       vermieter: 20 },
  { bis: 27,       vermieter: 30 },
  { bis: 32,       vermieter: 40 },
  { bis: 37,       vermieter: 50 },
  { bis: 42,       vermieter: 60 },
  { bis: 47,       vermieter: 70 },
  { bis: 52,       vermieter: 80 },
  { bis: Infinity, vermieter: 95 }  // >= 52 kg/m²·a
];
function nkSpezCo2(kgSumme, flaecheSumme) {
  return (+flaecheSumme > 0) ? (+kgSumme || 0) / (+flaecheSumme) : 0;
}
function nkCo2Stufe(spez) {
  for (let i = 0; i < NK_CO2_STUFEN.length; i++) if ((+spez || 0) < NK_CO2_STUFEN[i].bis) return i + 1;
  return NK_CO2_STUFEN.length;
}
function nkCo2StufeProzent(spez) {
  for (const s of NK_CO2_STUFEN) if ((+spez || 0) < s.bis) return s.vermieter;
  return 95;
}
/* Effektiver Vermieteranteil in % für ein Mietverhältnis: gewerblich → 50 (statt Stufe);
   override (falls gesetzt) ersetzt den Stufenwert (nur Wohnen); denkmal → Ergebnis halbiert. */
function nkCo2Vermieterprozent(spez, opts) {
  const o = opts || {};
  let p = (o.override != null && o.override !== "") ? (+o.override || 0) : nkCo2StufeProzent(spez);
  if (o.gewerblich) p = 50;
  if (o.denkmal) p = p / 2;
  return p;
}
/* Summe der CO2-Emissionen (kg) über alle fossilen Heizblöcke. */
function nkCo2KgSumme(kosten) {
  return (kosten || []).reduce((s, k) =>
    s + ((k.typ === "heizung" && nkEnergieart(k.energieart).fossil) ? (+k.co2Kg || 0) : 0), 0);
}
/* AC7/AC9: Klartext-Erläuterung, welcher Fall greift. co2 = Teilobjekt aus nkMieterAbrechnung. */
function nkCo2Erklaerung(co2) {
  if (!co2 || !co2.aktiv) return "Keine CO2-Aufteilung (keine fossile Heizung in diesem Mietverhältnis).";
  let s = (co2.fall === "gewerbe")
    ? "Gewerbe (Nichtwohngebäude): pauschale 50/50-Aufteilung. Vermieteranteil " + co2.vermieterProzent + " %."
    : "Wohngebäude, Stufe " + co2.stufe + " von 10 (" + nkFmtBetrag(co2.spez) + " kg/m²·a). Vermieteranteil " + co2.vermieterProzent + " %.";
  if (co2.denkmal) s += " Anteil wegen Denkmal-/Milieuschutz halbiert.";
  return s;
}

/* US-53: Briefanrede aus Mietverhältnis (anrede: "herr"/"frau"/sonst neutral). Bei Herr/Frau wird
   eine bereits im Namen enthaltene Anrede entfernt (kein „Frau Frau …"). Reine Funktion. */
function nkAnrede(m) {
  const name = String((m && m.mieter) || "").trim();
  const a = (m && m.anrede) || "";
  const clean = name.replace(/^(Herrn?|Frau|Familie|Fam\.)\s+/i, "");
  if (a === "herr") return "Sehr geehrter Herr " + clean;
  if (a === "frau") return "Sehr geehrte Frau " + clean;
  return "Guten Tag " + name;
}

/* US-51: IBAN-Prüfung – Länge (15–34) und ISO-7064-Prüfziffer (mod 97 == 1). Reine Funktion. */
function nkIbanGueltig(iban) {
  const s = String(iban || "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9A-Z]+$/.test(s)) return false;
  if (s.length < 15 || s.length > 34) return false;
  const rearr = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (let i = 0; i < rearr.length; i++) {
    const c = rearr[i];
    const code = (c >= "0" && c <= "9") ? c : String(c.charCodeAt(0) - 55); // A=10 … Z=35
    for (let j = 0; j < code.length; j++) rem = (rem * 10 + (code.charCodeAt(j) - 48)) % 97;
  }
  return rem === 1;
}

/* US-55: GiroCode-Datensatz (EPC069-12, Version 002, UTF-8). Reine Funktion; gibt den
   QR-Text zurück oder "" wenn IBAN fehlt/Betrag <= 0 (dann kein QR). Beträge mit Punkt. */
function nkGiroCode(o) {
  o = o || {};
  const iban = String(o.iban || "").replace(/\s+/g, "").toUpperCase();
  const betrag = +o.betrag || 0;
  if (!iban || !(betrag > 0)) return "";
  return [
    "BCD", "002", "1", "SCT",
    String(o.bic || "").replace(/\s+/g, "").toUpperCase(),
    String(o.empfaenger || "").substring(0, 70),
    iban,
    "EUR" + betrag.toFixed(2),
    "", "",
    String(o.zweck || "").substring(0, 140)
  ].join("\n");
}

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
/* US-57: Summe der erfassten Verbräuche über die teilnehmenden Einheiten. */
function nkVerbrauchSumme(k, einheiten) {
  const vb = (k && k.verbrauch) || {};
  return (einheiten || []).filter(x => nkTeilnahme(x, k)).reduce((s, x) => s + (+vb[x.id] || 0), 0);
}
function nkFaktorFuer(e, k, einheiten) {
  if (k && k.schluessel === "direkt") return e.id === k.direktEinheit ? 1 : 0; // US-22: 100 % auf eine Einheit
  if (!nkTeilnahme(e, k)) return 0;
  if (k && k.schluessel === "verbrauch") { // US-57: Anteil = Einheit-Verbrauch ÷ Gesamtverbrauch
    const total = nkVerbrauchSumme(k, einheiten);
    return total > 0 ? ((+(k.verbrauch || {})[e.id] || 0) / total) : 0;
  }
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

/* US-59: Anzeige-Einheit je Verteilerschlüssel (kurz, ohne Zusatztext). Bei Verbrauch aus der
   Position (k.einheit), z. B. „kWh" oder „m³". */
function nkSchluesselEinheit(k) {
  const s = k && k.schluessel;
  if (s === "flaeche") return "m²";
  if (s === "person") return "Pers.";
  if (s === "einheit") return "Whg.";
  if (s === "verbrauch") return (k && k.einheit) || "Einh.";
  return ""; // direkt
}
function nkLineItemsFor(e, kosten, einheiten) {
  return (kosten || []).map(k => {
    const f = nkFaktorFuer(e, k, einheiten);
    const gesamt = +k.betrag || 0;
    const teil = (einheiten || []).filter(x => nkTeilnahme(x, k));
    // US-59: Spaltenwerte für den Rechenweg (Gesamteinheiten, Ihre Einheiten, Preis je Einheit).
    let basis = 0, ihre = 0;
    if (k.schluessel === "flaeche") { basis = nkTotals(teil).flaeche; ihre = nkTeilnahme(e, k) ? (+e.flaeche || 0) : 0; }
    else if (k.schluessel === "person") { basis = nkTotals(teil).personen; ihre = nkTeilnahme(e, k) ? (+e.personen || 0) : 0; }
    else if (k.schluessel === "einheit") { basis = nkTotals(teil).einheiten; ihre = nkTeilnahme(e, k) ? 1 : 0; }
    else if (k.schluessel === "verbrauch") { basis = nkVerbrauchSumme(k, einheiten); ihre = nkTeilnahme(e, k) ? (+(k.verbrauch || {})[e.id] || 0) : 0; }
    else if (k.schluessel === "direkt") { basis = 0; ihre = (e.id === k.direktEinheit) ? 1 : 0; }
    const preisJeEinheit = basis > 0 ? gesamt / basis : 0;
    return {
      bez: k.bez, gesamt: gesamt, schluessel: k.schluessel, vorsteuer: +k.vorsteuer || 0,
      faktor: f, anteil: gesamt * f, von: k.von, bis: k.bis,
      basis: basis, ihreEinheiten: ihre, preisJeEinheit: preisJeEinheit, einheitLabel: nkSchluesselEinheit(k)
    };
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

/* US-58: Rubriken (Kostengruppen) in fester Reihenfolge wie bei Messdienst-Abrechnungen.
   nkRubrik liefert die explizit gesetzte Rubrik (k.rubrik) oder einen Vorschlag aus Typ,
   Schlüssel und Bezeichnung. Reine Funktion. */
const NK_RUBRIKEN = ["Heizkosten", "Warmwasserkosten", "Kaltwasserkosten", "Betriebskosten", "Direktkosten", "Sonstige"];
function nkRubrik(k) {
  if (k && k.rubrik) return k.rubrik;
  if (k && k.typ === "heizung") return "Heizkosten";
  if (k && k.schluessel === "direkt") return "Direktkosten";
  const b = String((k && k.bez) || "").toLowerCase();
  if (b.includes("heiz")) return "Heizkosten";
  if (b.includes("warmwasser")) return "Warmwasserkosten";
  if (b.includes("kaltwasser") || b.includes("schmutzwasser") || b.includes("abwasser") || b.includes("wasser")) return "Kaltwasserkosten";
  return "Betriebskosten";
}
/* US-89: effektive, geordnete Rubriken-Liste eines Objekts. objekt.rubriken (falls gesetzt),
   sonst die typischen NK_RUBRIKEN. Tatsächlich verwendete Rubriken, die in der Liste fehlen,
   werden hinten ergänzt – so verliert keine Position ihre Gruppe. Reine Funktion. */
function nkRubrikenListe(objekt, kosten) {
  const basis = (objekt && Array.isArray(objekt.rubriken) && objekt.rubriken.length) ? objekt.rubriken.slice() : NK_RUBRIKEN.slice();
  (kosten || []).forEach(k => { const r = nkRubrik(k); if (r && basis.indexOf(r) < 0) basis.push(r); });
  return basis;
}
/* US-89: Element in einem Array von Index `from` nach `to` verschieben (neue Kopie, keine
   Mutation). Ungültiges `from` lässt das Array unverändert; `to` wird in die Grenzen geklemmt. */
function nkArrMove(arr, from, to) {
  const a = (arr || []).slice();
  if (from < 0 || from >= a.length) return a;
  to = Math.max(0, Math.min(to, a.length - 1));
  const el = a.splice(from, 1)[0];
  a.splice(to, 0, el);
  return a;
}
/* US-89 (Phase 2): Element (per id) vor das Ziel-Element (per id) einsortieren – Grundlage des
   Drag & Drop in der Kostenliste. zielId null/unbekannt => ans Ende. Erwartet Objekte mit `id`.
   Neue Array-Kopie (keine Mutation). Reine Funktion. */
function nkListeEinsortieren(items, dragId, zielId) {
  const a = (items || []).slice();
  const di = a.findIndex(x => x && x.id === dragId);
  if (di < 0) return a;
  const el = a.splice(di, 1)[0];
  const zi = (zielId == null) ? -1 : a.findIndex(x => x && x.id === zielId);
  if (zi < 0) a.push(el); else a.splice(zi, 0, el);
  return a;
}

/* US-32: §35a EStG – begünstigter Arbeitskosten-Anteil je Position, getrennt nach
   haushaltsnahen Dienstleistungen und Handwerkerleistungen. Elster-Zeilen als pflegbarer
   Referenztext (Steuerjahr), da sich die Formularzeilen jährlich ändern können.
   Hinweis: keine Steuerberatung; gilt nur für private (nicht gewerbliche) Mietverhältnisse. */
const NK_P35A_STEUERJAHR = "2024";
const NK_P35A = {
  dienstleistung: { label: "Haushaltsnahe Dienstleistungen", elster: "Anlage Haushaltsnahe Aufwendungen, Zeile 5", satz: 20, maxErmaessigung: 4000 },
  handwerker:     { label: "Handwerkerleistungen", elster: "Anlage Haushaltsnahe Aufwendungen, Zeilen 6–9 (Summe in Zeile 9)", satz: 20, maxErmaessigung: 1200 }
};
function nkP35aKategorieVorschlag(bez) {
  const b = String(bez || "").toLowerCase();
  if (/(wartung|reparatur|schornstein|instandhalt|instandsetz)/.test(b)) return "handwerker";
  if (/(hauswart|hausmeister|garten|reinig|winterdienst|treppen)/.test(b)) return "dienstleistung";
  return "";
}
/* Effektive Kategorie: explizit gesetzt (k.p35a) sticht; "keine" = nicht begünstigt; sonst Vorschlag. */
function nkP35aKategorie(k) {
  if (k && k.p35a) return k.p35a === "keine" ? "" : k.p35a;
  return nkP35aKategorieVorschlag(k && k.bez);
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
/* US-77: Zusammensetzung des Monats-Solls als Teile (Nettokaltmiete + NK-Vorauszahlung +
   Stellplatz). Komponenten mit 0 € werden weggelassen. Reine Funktion (Formatierung im View). */
function nkSollTeile(grundmiete, nkMonat, stellAnzahl, stellPreis) {
  const teile = [];
  const g = +grundmiete || 0, nk = +nkMonat || 0, st = (+stellAnzahl || 0) * (+stellPreis || 0);
  if (g) teile.push({ label: "Nettokaltmiete", betrag: g });
  if (nk) teile.push({ label: "NK-Vorauszahlung", betrag: nk });
  if (st) teile.push({ label: "Stellplatz", betrag: st });
  return teile;
}
/* US-79: Mietrückstand des Abrechnungszeitraums = offene Soll-Miete (Summe Soll − Summe
   erhalten über die aktiven Monate, >= 0). Identisch zur Summe im Zahlungen-Reiter; mvBis ist
   das effektive Mietende (nkMvEnde). Reine Funktion. */
function nkMietrueckstand(m, mvBis, pVon, pBis) {
  const monate = nkAktiveMonate(m.von, mvBis, pVon, pBis);
  const snap = m.sollSnap || {}, erh = m.erhalten || {}, bez = m.bezahlt || {};
  let sumSoll = 0, sumErh = 0;
  for (const k of monate) {
    const soll = (k in snap) ? +snap[k] : nkSollMonat(nkMieteAm(m, k + "-01"), nkMonatNK(m), m.stellAnzahl, m.stellPreis);
    sumSoll += soll;
    sumErh += (k in erh) ? +erh[k] : (bez[k] ? soll : 0);
  }
  return Math.max(0, Math.round((sumSoll - sumErh) * 100) / 100);
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
/* US-75: effektives Ende eines Mietverhältnisses. „läuft" (offenes Ende) → Ende des
   Abrechnungszeitraums; sonst das eingetragene Bis-Datum. Reine Funktion. */
function nkMvEnde(m, periodeBis) {
  return (m && m.laeuft) ? (periodeBis || "") : ((m && m.bis) || "");
}
/* US-47: Gesamtzahl der Tage, an denen sich Mietverhältnisse derselben Einheit überschneiden
   (Summe über alle Paare). 0 = keine Überschneidung. periodeBis löst „läuft" auf. */
function nkUeberlappungTageEinheit(e, periodeBis) {
  const mv = (e && e.mv) || [];
  let tage = 0;
  for (let i = 0; i < mv.length; i++)
    for (let j = i + 1; j < mv.length; j++)
      tage += nkUeberlappungsTage(mv[i].von, nkMvEnde(mv[i], periodeBis), mv[j].von, nkMvEnde(mv[j], periodeBis));
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

/* ---------- Indexmiete (US-68, § 557b BGB). Reine Funktionen. ----------
   Die Indexveränderung wird als PROZENTSATZ angegeben (Eingabe in %): die prozentuale
   Veränderung des Verbraucherpreisindex zwischen dem Basismonat (letzte Festsetzung bzw.
   Einzug) und dem verwendeten Monat. Für den Regelfall jährlicher Anpassung entspricht das
   der Veränderung zum Vorjahr; der Destatis-Wertsicherungsrechner liefert genau diesen Wert.
   Neue Miete = Basismiete erhöht um den Prozentsatz, danach auf VOLLE EURO ABGERUNDET
   (kein Cent-Betrag, Wunsch Vermieter). Mehrere Anpassungen verketten über die jeweils
   zuletzt festgesetzte Miete (rechtlicher Normalfall). */
const NK_INDEX_MIN_JAHRE = 1; /* § 557b Abs. 2: Miete muss mind. ein Jahr unverändert bleiben */
function nkPlusJahre(d, n) {
  const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  const y = (+m[1]) + (Math.floor(+n) || 0);
  let day = +m[3];
  if (m[2] === "02" && day === 29) day = 28; /* Schaltjahr-Korrektur */
  return y + "-" + m[2] + "-" + String(day).padStart(2, "0");
}
function nkIndexFrequenzGueltig(n) {
  const x = +n;
  return Number.isFinite(x) && x >= NK_INDEX_MIN_JAHRE && Math.floor(x) === x;
}
function nkIndexErhoehungsbetrag(basisMiete, prozent) {
  return (+basisMiete || 0) * ((+prozent || 0) / 100);
}
function nkIndexNeueMiete(basisMiete, prozent) {
  const roh = (+basisMiete || 0) + nkIndexErhoehungsbetrag(basisMiete, prozent);
  const cent = Math.round(roh * 100) / 100; /* Float-Artefakte vor dem Abrunden glätten */
  return Math.floor(cent);
}
function nkIndexAktuelleMiete(ausgangsmiete, anpassungen) {
  const arr = Array.isArray(anpassungen) ? anpassungen : [];
  if (arr.length) return +arr[arr.length - 1].neueMiete || 0;
  return +ausgangsmiete || 0;
}
function nkIndexNaechsteAnpassung(einzug, frequenzJahre, anzahlFestgesetzt) {
  const n = Math.max(NK_INDEX_MIN_JAHRE, Math.floor(+frequenzJahre) || NK_INDEX_MIN_JAHRE);
  const k = Math.max(0, Math.floor(+anzahlFestgesetzt) || 0) + 1;
  return nkPlusJahre(einzug, n * k);
}
function nkIndexFaellig(naechsteAnpassung, heute) {
  const ziel = nkDatum(naechsteAnpassung), h = nkDatum(heute);
  if (!ziel || !h) return false;
  return h >= ziel;
}
/* Aktuellster verfügbarer Indexmonat zum Fälligkeitstermin: der Monatswert wird erst Mitte
   des Folgemonats veröffentlicht, daher zwei Monate zurück (z. B. Fälligkeit Mai → März).
   Rückgabe als "YYYY-MM". */
function nkIndexVerwendeterMonat(faelligkeit) {
  const d = nkDatum(faelligkeit);
  if (!d) return "";
  const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 1));
  return dd.getUTCFullYear() + "-" + String(dd.getUTCMonth() + 1).padStart(2, "0");
}
/* Eine festgesetzte Anpassung entfernen (z. B. Fehleingabe). Gibt eine NEUE Liste zurück. */
function nkIndexAnpassungLoeschen(anpassungen, idx) {
  const arr = Array.isArray(anpassungen) ? anpassungen.slice() : [];
  if (idx >= 0 && idx < arr.length) arr.splice(idx, 1);
  return arr;
}
/* Basis-Indexmonat für die nächste Anpassung: der bei der letzten Festsetzung verwendete
   Monat, sonst der Einzugsmonat. Rückgabe "YYYY-MM". */
function nkIndexBasisMonat(einzug, anpassungen) {
  const arr = Array.isArray(anpassungen) ? anpassungen : [];
  if (arr.length && arr[arr.length - 1].monat) return arr[arr.length - 1].monat;
  const m = String(einzug || "").match(/^(\d{4})-(\d{2})/);
  return m ? (m[1] + "-" + m[2]) : "";
}

/* ---------- Staffelmiete (US-70, § 557a BGB). Reine Funktion. ----------
   Feste Erhöhung um einen Eurobetrag: neue Miete = bisherige Miete + Betrag (Cent-genau).
   Terminierung, „aktuelle Miete" und Löschen nutzen dieselben Funktionen wie die Indexmiete
   (nkIndexNaechsteAnpassung, nkIndexAktuelleMiete, nkIndexFaellig, nkIndexAnpassungLoeschen). */
function nkStaffelNeueMiete(basisMiete, betrag) {
  return Math.round(((+basisMiete || 0) + (+betrag || 0)) * 100) / 100;
}

/* ---------- Stichtag-Modell (US-68/US-70 Redesign 2026-06-16). Reine Funktionen. ----------
   Stichtage einer Vereinbarung: Beginn + k × N Jahre (k = 1,2,…) bis einschließlich Enddatum.
   Ohne gültiges Enddatum leere Liste (die Indexmiete rückt stattdessen einzeln weiter). */
function nkStichtage(beginn, ende, frequenzJahre) {
  const n = Math.max(1, Math.floor(+frequenzJahre) || 1);
  const out = [];
  const b = nkDatum(beginn), e = nkDatum(ende);
  if (!b || !e) return out;
  for (let k = 1; k <= 400; k++) {
    const d = nkPlusJahre(beginn, n * k);
    if (nkDatum(d) > e) break;
    out.push(d);
  }
  return out;
}
/* Vollständiger Staffelplan: je Stichtag eine Zeile mit Datum, bisheriger und neuer Miete
   (Miete zu Staffel k = Ausgangsmiete + k × Betrag). */
function nkStaffelPlan(beginn, ende, frequenzJahre, ausgangsmiete, betrag) {
  const a = +ausgangsmiete || 0, bt = +betrag || 0;
  return nkStichtage(beginn, ende, frequenzJahre).map((d, i) => ({
    nr: i + 1, datum: d,
    alteMiete: nkStaffelNeueMiete(a, bt * i),
    neueMiete: nkStaffelNeueMiete(a, bt * (i + 1))
  }));
}
/* Aktuell gültige Staffelmiete zum Datum: neue Miete des letzten erreichten Stichtags,
   sonst die Ausgangsmiete. */
function nkStaffelMieteAm(plan, ausgangsmiete, heute) {
  const h = nkDatum(heute);
  let cur = +ausgangsmiete || 0;
  (Array.isArray(plan) ? plan : []).forEach(s => {
    const sd = nkDatum(s.datum);
    if (h && sd && sd <= h) cur = s.neueMiete;
  });
  return cur;
}
/* Mitteilungsfrist (§ 557b Abs. 3): letzter Tag des Monats zwei Monate vor dem Stichtag
   (z. B. Stichtag 2027-05-01 → 2027-03-31). Rückgabe "YYYY-MM-DD". */
function nkMitteilungsfrist(stichtag) {
  const d = nkDatum(stichtag);
  if (!d) return "";
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 0));
  return last.toISOString().slice(0, 10);
}
/* Indexmonat "YYYY-MM" in deutscher Reihenfolge "MM-YYYY". Leer bleibt leer. */
function nkMonatDE(ym) {
  const m = String(ym || "").match(/^(\d{4})-(\d{2})$/);
  return m ? (m[2] + "-" + m[1]) : "";
}

/* ---------- Zahlungen unterjährig (US-74). Reine Funktionen. ----------
   Gültige Nettokaltmiete eines Mietverhältnisses zu einem Datum (Index/Staffel/keine). */
function nkIndexMieteAm(ausgangsmiete, anpassungen, datum) {
  const arr = Array.isArray(anpassungen) ? anpassungen : [];
  const d = nkDatum(datum);
  let miete = +ausgangsmiete || 0;
  if (!d) return miete;
  arr.forEach(a => { const ad = nkDatum(a.datum); if (ad && ad <= d) miete = +a.neueMiete || miete; });
  return miete;
}
function nkMieteAm(m, datum) {
  if (!m) return 0;
  if (m.mhTyp === "staffel") return nkStaffelMieteAm(nkStaffelPlan(m.stafBeginn, m.stafEnde, m.stafFrequenz, m.stafAusgangsmiete, m.stafBetrag), m.stafAusgangsmiete, datum);
  if (m.mhTyp === "index") return nkIndexMieteAm(m.idxAusgangsmiete, m.idxAnpassungen, datum);
  return +m.grundmiete || 0;
}
/* Zahlstatus eines Monats aus erhaltenem Betrag und Soll. */
function nkZahlStatus(erhalten, soll) {
  const e = +erhalten || 0, s = +soll || 0;
  if (e <= 0) return "offen";
  if (e > s + 0.005) return "ueberzahlt";
  if (e + 0.005 >= s) return "bezahlt";
  return "teilweise";
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
    const basis = k.schluessel === "flaeche" ? t.flaeche
      : k.schluessel === "person" ? t.personen
      : k.schluessel === "verbrauch" ? nkVerbrauchSumme(k, E) // US-57
      : t.einheiten;
    if (!(basis > 0)) punkte.push({ level: "fehler", text: "Position „" + k.bez + "“ ist nicht verteilbar (Basis für „" + k.schluessel + "“ ist 0)." });
  });
  if (K.length) punkte.push({ level: "ok", text: K.length + " Kostenposition(en), alle verteilbar." });
  if (!(Z.iban && String(Z.iban).trim())) punkte.push({ level: "fehler", text: "IBAN fehlt (Zahlungsangaben)." });
  else if (!nkIbanGueltig(Z.iban)) punkte.push({ level: "fehler", text: "IBAN ungültig (Prüfziffer/Länge prüfen)." });
  else punkte.push({ level: "ok", text: "IBAN vorhanden und gültig." });
  if (!(Z.empfaenger && String(Z.empfaenger).trim())) punkte.push({ level: "fehler", text: "Empfänger der Zahlung fehlt." });
  let ohneName = 0;
  E.forEach(e => (e.mv || []).forEach(m => { if (!(m.mieter && String(m.mieter).trim())) ohneName++; }));
  if (ohneName) punkte.push({ level: "fehler", text: ohneName + " Mietverhältnis(se) ohne Mieternamen." });
  const nu = K.filter(k => !nkUmlageInfo(k.bez).umlagefaehig);
  if (nu.length) punkte.push({ level: "warn", text: nu.length + " nicht umlagefähige Position(en) enthalten (z. B. „" + nu[0].bez + "“)." });
  let leer = false;
  E.forEach(e => { const z = (e.mv || []).reduce((a, m) => a + nkZeitanteil(m.von, nkMvEnde(m, O.bis), O.von, O.bis), 0); if (z < 0.999) leer = true; });
  if (leer) punkte.push({ level: "warn", text: "Leerstand vorhanden – dieser Anteil trägt der Vermieter." });
  // US-47: Spiegelbild der Leerstand-Prüfung – Summe der Zeitanteile einer Einheit über 100 %
  // deutet auf überschneidende Mietzeiträume (Doppelerfassung) hin.
  E.forEach(e => {
    const tage = nkUeberlappungTageEinheit(e, O.bis);
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
  const mvBis = nkMvEnde(m, o.bis); // US-75: „läuft" → Ende des Abrechnungszeitraums
  const za = nkZeitanteil(m.von, mvBis, o.von, o.bis);
  const gewerblich = !!m.gewerblich;
  const K = kosten || [];
  // US-07: gebäudeweite CO2-Grundgrößen und effektiver Vermieteranteil dieses Mietverhältnisses.
  const flaecheSumme = nkTotals(einheiten || []).flaeche;
  const spezCo2 = nkSpezCo2(nkCo2KgSumme(K), flaecheSumme);
  const co2Prozent = nkCo2Vermieterprozent(spezCo2, { override: o.co2ProzentOverride, gewerblich: gewerblich, denkmal: o.co2Denkmal });
  let co2KostenMieter = 0, co2Abzug = 0;
  let p35aDienst = 0, p35aHandw = 0; // US-32: begünstigte Arbeitskosten je Kategorie (Mieteranteil)
  const p35aPosten = []; // US-62: je Position eine Zeile (für die Volltabellen)
  const zeilen = nkLineItemsFor(e, K, einheiten).map((i, ix) => {
    const k = K[ix] || {};
    // US-06: hat die Position einen eigenen Zeitraum (Heizblock), Zeitanteil über DIESE Periode,
    // sonst über den Abrechnungszeitraum.
    const zaL = (i.von && i.bis) ? nkZeitanteil(m.von, mvBis, i.von, i.bis) : za;
    const anteil = i.anteil * zaL;
    const wert = gewerblich ? nkNetto(anteil, i.vorsteuer) : anteil; // Anzeige je Zeile
    // US-07: Mieteranteil an den CO2-Kosten dieses fossilen Heizblocks und der vom Vermieter
    // getragene (= dem Mieter erlassene) Betrag. Nur fossile Heizblöcke mit CO2-Kosten zählen.
    const istFossilCo2 = k.typ === "heizung" && nkEnergieart(k.energieart).fossil && (+k.co2Kosten || 0) > 0;
    const co2Anteil = (istFossilCo2 && i.gesamt > 0) ? (+k.co2Kosten) * (anteil / i.gesamt) : 0;
    co2KostenMieter += co2Anteil;
    co2Abzug += co2Anteil * co2Prozent / 100;
    // US-32: Mieteranteil am begünstigten Arbeitskosten-Anteil dieser Position (gleiche Verteilung).
    const p35aKat = nkP35aKategorie(k);
    const p35aMieter = ((+k.arbeitskosten || 0) > 0 && p35aKat && i.gesamt > 0) ? (+k.arbeitskosten) * (anteil / i.gesamt) : 0;
    if (p35aKat === "dienstleistung") p35aDienst += p35aMieter;
    else if (p35aKat === "handwerker") p35aHandw += p35aMieter;
    if (p35aMieter > 0) p35aPosten.push({ bez: i.bez, schluessel: i.schluessel, kategorie: p35aKat, gesamt: i.gesamt, arbeitskosten: +k.arbeitskosten || 0, anteil: p35aMieter }); // US-62
    return {
      bez: i.bez, gesamt: i.gesamt, schluessel: i.schluessel, vorsteuer: i.vorsteuer,
      faktor: i.faktor, anteilVoll: i.anteil, anteil: anteil, wert: wert, zeitanteil: zaL,
      basis: i.basis, ihreEinheiten: i.ihreEinheiten, preisJeEinheit: i.preisJeEinheit, einheitLabel: i.einheitLabel // US-59
    };
  });
  const betrag = nkMieterBetrag(zeilen, gewerblich); // liest .anteil und .vorsteuer
  const bruttoNachCo2 = betrag.brutto - co2Abzug;    // US-07: Vermieteranteil entlastet den Mieter
  const vorauszahlung = +m.voraus || 0;
  return {
    einheit: e.name, mieter: m.mieter, gewerblich: gewerblich,
    von: m.von, bis: mvBis, zeitanteil: za, zeilen: zeilen,
    netto: betrag.netto, ust: betrag.ust, bruttoVorCo2: betrag.brutto, brutto: bruttoNachCo2,
    co2: {
      spez: spezCo2, stufe: nkCo2Stufe(spezCo2), vermieterProzent: co2Prozent,
      kostenMieter: co2KostenMieter, abzug: co2Abzug,
      fall: gewerblich ? "gewerbe" : "wohnen", denkmal: !!o.co2Denkmal,
      aktiv: co2KostenMieter > 0
    },
    p35a: { // US-32/US-62: nur für private Haushalte relevant
      dienstleistung: p35aDienst, handwerker: p35aHandw, posten: p35aPosten,
      gewerblich: gewerblich, aktiv: !gewerblich && (p35aDienst + p35aHandw) > 0
    },
    vorauszahlung: vorauszahlung, nkMonat: nkMonatNK(m), saldo: bruttoNachCo2 - vorauszahlung
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
  const objekt = Object.assign({}, o, { von: nkPlusJahr(o.von), bis: nkPlusJahr(o.bis), freigeschaltet: false }); /* US-40: Folgejahr ist eine eigene Abrechnung -> nicht mitfreigeschaltet */
  const einheiten = (s.einheiten || []).map(e => {
    const aktive = (e.mv || []).filter(m => m.laeuft || !altBis || !m.bis || m.bis >= altBis);
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
  /* US-90: Betrag mit dem Vorjahreswert VORBELEGEN (nicht leeren). `vorjahr:true` markiert das Feld als
     „vorbelegt, noch nicht aktiv übernommen" (WISO-Muster). Bestätigt wird feldgenau (Klick/Bearbeiten). */
  const kosten = (s.kosten || []).map(k => Object.assign({}, k, { status: "vorlaeufig", vorjahr: true }));
  return { objekt, einheiten, kosten, zahlung: Object.assign({}, s.zahlung), abrechnungStatus: "inArbeit", vorjahr: true };
}

/* US-90: aus dem Vorjahr vorbelegte, noch NICHT übernommene Kostenpositionen (Plausi-Tor vor PDF + „alle übernehmen"). */
function nkOffeneVorjahrKosten(kosten) {
  return (kosten || []).filter(k => k && k.vorjahr);
}

/* US-91: Soll der „Öffnen"-Dialog nach Objekt gruppiert werden? Erst wenn es sich lohnt:
   mehr als 2 verschiedene Objekte UND mindestens eines mit mehr als 2 Jahren. items=[{name,jahr}]. */
function nkObjekteGruppieren(items) {
  const map = {};
  (items || []).forEach(it => {
    const n = String((it && it.name) || "").trim() || "(ohne Name)";
    (map[n] = map[n] || new Set()).add(String((it && it.jahr) != null ? it.jahr : ""));
  });
  const namen = Object.keys(map);
  return namen.length > 2 && namen.some(n => map[n].size > 2);
}

/* US-30/US-11: exakte Objekt-Duplikate entfernen (gleicher Inhalt), Reihenfolge bleibt. */
function nkDedupeObjekte(arr) {
  const out = [], seen = new Set();
  (arr || []).forEach(d => { const sig = JSON.stringify(d); if (!seen.has(sig)) { seen.add(sig); out.push(d); } });
  return out;
}

/* US-82: Tiefkopie eines reinen Datenobjekts (für den Undo/Redo-Verlauf – Snapshots dürfen
   nicht über geteilte Referenzen mitmutieren). */
function nkClone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
/* US-84: stabile Signatur eines Datenobjekts (djb2-Hash über die JSON-Form) – für die
   Dirty-Erkennung: Arbeitsstand ↔ zuletzt gespeicherter Stand. Reine Funktion. */
function nkSig(obj) {
  const s = JSON.stringify(obj);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return String(h);
}
/* US-82: Entscheidet, ob zwei aufeinanderfolgende Commits zu EINEM Undo-Schritt verschmelzen
   (schnelles Tippen). True, wenn der vorige Commit < windowMs zurückliegt. */
function nkHistCoalesce(prevTs, nowTs, windowMs) {
  return prevTs != null && (nowTs - prevTs) < windowMs;
}
/* US-65/Speicher: Objektname aus dem Dateinamen ableiten – „.json"-Suffix, ein „NeKoFix-"-
   Präfix und ein angehängtes Jahr „-YYYY" werden entfernt. Reine Funktion, genutzt von
   „Speichern unter" und vom Import, damit der Header-Name dem Dateinamen folgt (nicht dem
   Adressfeld). */
function nkNameAusDateiname(dateiname) {
  return String(dateiname || "").replace(/\.json$/i, "").replace(/^NeKoFix-/i, "").replace(/-\d{4}$/, "").trim();
}

/* US-86: Namens-Normalisierung für das Matching (Zahlungsbeteiligter -> Regel). Faltet Umlaute
   (ä/ö/ü/ß <-> ae/oe/ue/ss), schreibt klein und vereinheitlicht Whitespace/Satzzeichen, damit
   "Grün" und "Gruen" denselben Schlüssel ergeben. Reine Funktion. */
function nkNormName(s) {
  let t = String(s == null ? "" : s).toLowerCase();
  t = t.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  return t.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/* US-85: Vorzeichen-Vorsortierung einer Buchung fürs Review. Positiv = Zahlungseingang
   (meist Miete), negativ = Kosten; offensichtlich interne Umbuchungen (Termingeld/Geldanlage)
   werden als "ignorieren" vorgeschlagen. Default, in US-86 überschreibbar. Reine Funktion. */
function nkVorsortierung(b) {
  const bt = String((b && b.buchungstext) || "").toLowerCase();
  const betrag = (b && +b.betrag) || 0;
  if (betrag > 0 && /termingeld|umbuchung|geldanlage|sparen/.test(bt)) return "ignorieren";
  if (betrag > 0) return "eingang";
  if (betrag < 0) return "kosten";
  return "ignorieren";
}

/* US-85: deutsches Datum "TT.MM.JJJJ" -> ISO "JJJJ-MM-TT"; "" bei ungültiger Eingabe. */
function nkParseDatumDE(s) {
  const m = String(s == null ? "" : s).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return "";
  return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
}

/* US-85: VR-/Volksbank-Umsatz-CSV parsen. Erkennt die Kopfzeile (überspringt eine optionale
   Titelzeile davor), liest Spalten per Namen (robust gegen Reihenfolge/Zusatzspalten),
   parst deutsche Beträge/Daten. Trennzeichen ';', kein Quoting im Zielformat. UTF-8-Eingabe.
   Rückgabe: { konto:{iban,bic,bez}, buchungen:[{datum, buchungstag, name, iban, bic,
   buchungstext, zweck, betrag:Number, waehrung}], fehler:String|null }. Reine Funktion. */
function nkParseUmsatzCsv(text) {
  const res = { konto: { iban: "", bic: "", bez: "" }, buchungen: [], fehler: null };
  const raw = String(text == null ? "" : text).replace(/^\uFEFF/, "");
  const lines = raw.split(/\r\n|\r|\n/);
  let hi = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/(^|;)\s*Bezeichnung Auftragskonto\s*(;|$)/i.test(lines[i]) ||
        (/Buchungstag/i.test(lines[i]) && /Betrag/i.test(lines[i]))) { hi = i; break; }
  }
  if (hi < 0) { res.fehler = "Keine Kopfzeile gefunden (erwartet Spalte 'Bezeichnung Auftragskonto')."; return res; }
  const header = lines[hi].split(";").map(h => h.trim());
  const low = header.map(h => h.toLowerCase());
  /* Spalten per Name (Alias-tolerant). Banken benennen Spalten leicht unterschiedlich. */
  const colAny = names => { for (let k = 0; k < names.length; k++) { const i = low.indexOf(names[k].toLowerCase()); if (i >= 0) return i; } return -1; };
  const idx = {
    bez:   colAny(["Bezeichnung Auftragskonto"]),
    kiban: colAny(["IBAN Auftragskonto"]),
    kbic:  colAny(["BIC Auftragskonto"]),
    tag:   colAny(["Buchungstag", "Buchungsdatum"]),
    valuta: colAny(["Valutadatum", "Wertstellung", "Valuta"]),
    name:  colAny(["Name Zahlungsbeteiligter", "Beguenstigter/Zahlungspflichtiger", "Begünstigter/Zahlungspflichtiger", "Zahlungsempfaenger", "Zahlungsempfänger", "Empfaenger/Zahlungspflichtiger", "Name"]),
    iban:  colAny(["IBAN Zahlungsbeteiligter", "Kontonummer/IBAN"]),
    bic:   colAny(["BIC (SWIFT-Code) Zahlungsbeteiligter", "BIC Zahlungsbeteiligter"]),
    btext: colAny(["Buchungstext"]),
    zweck: colAny(["Verwendungszweck", "Verwendungszwecke"]),
    betrag: colAny(["Betrag", "Betrag (EUR)", "Umsatz", "Umsatz in EUR"]),
    waehrung: colAny(["Waehrung", "Währung"]),
  };
  /* Positions-Fallback für das feste VR-/Volksbank-Layout (18 Spalten), falls eine Spalte per
     Name nicht erkannt wurde (z. B. abweichende Überschrift). Nur bei erkanntem VR-Export. */
  if (low.some(h => h.indexOf("auftragskonto") >= 0) && header.length >= 12) {
    const fb = { bez: 0, kiban: 1, kbic: 2, tag: 4, valuta: 5, name: 6, iban: 7, bic: 8, btext: 9, zweck: 10, betrag: 11, waehrung: 12 };
    Object.keys(fb).forEach(k => { if (idx[k] < 0) idx[k] = fb[k]; });
  }
  if ((idx.tag < 0 && idx.valuta < 0) || idx.betrag < 0) { res.fehler = "Pflichtspalten fehlen (Buchungstag/Betrag)."; return res; }
  const get = (cells, i) => (i >= 0 && i < cells.length) ? String(cells[i]).trim() : "";
  for (let i = hi + 1; i < lines.length; i++) {
    if (lines[i] == null || lines[i].trim() === "") continue;
    const cells = lines[i].split(";");
    const tagStr = get(cells, idx.tag) || get(cells, idx.valuta); /* Datum: Buchungstag, sonst Valutadatum */
    const datum = nkParseDatumDE(tagStr);
    const betragStr = get(cells, idx.betrag);
    if (!datum && betragStr === "") continue; /* Leer-/Restzeile überspringen */
    res.buchungen.push({
      datum: datum,
      buchungstag: tagStr,
      name: get(cells, idx.name),
      iban: get(cells, idx.iban),
      bic: get(cells, idx.bic),
      buchungstext: get(cells, idx.btext),
      zweck: get(cells, idx.zweck),
      betrag: nkParseBetrag(betragStr),
      waehrung: get(cells, idx.waehrung) || "EUR",
    });
    if (!res.konto.iban) { res.konto = { iban: get(cells, idx.kiban), bic: get(cells, idx.kbic), bez: get(cells, idx.bez) }; }
  }
  return res;
}

/* US-86: IBAN normalisieren (ohne Leerzeichen, Großschreibung) – Matching-Schlüssel. */
function nkNormIban(s) { return String(s == null ? "" : s).replace(/\s+/g, "").toUpperCase(); }
/* US-86: Bevorzugter Regel-Schlüssel für eine Buchung: IBAN (stabil), sonst normalisierter Name.
   Rückgabe { schluessel, typ:'iban'|'name' }. Reine Funktion. */
function nkRegelSchluessel(tx) {
  const iban = nkNormIban(tx && tx.iban);
  if (iban) return { schluessel: iban, typ: "iban" };
  return { schluessel: nkNormName(tx && tx.name), typ: "name" };
}
/* US-86: Buchung gegen gelernte Regeln matchen. IBAN zuerst, dann normalisierter Name.
   Regel = { schluessel, typ, ziel }. Rückgabe: ziel oder null. Reine Funktion. */
function nkMatchRegel(tx, regeln) {
  if (!Array.isArray(regeln) || !regeln.length) return null;
  const iban = nkNormIban(tx && tx.iban);
  if (iban) { const r = regeln.find(x => x.typ === "iban" && x.schluessel === iban); if (r) return r.ziel; }
  const name = nkNormName(tx && tx.name);
  if (name) { const r = regeln.find(x => x.typ === "name" && x.schluessel === name); if (r) return r.ziel; }
  return null;
}
/* US-86: Regel für die Buchung setzen/ersetzen (gleicher Schlüssel überschreibt). ziel=null
   entfernt die Regel. Gibt eine NEUE Regelliste zurück (keine Mutation). Reine Funktion. */
function nkRegelUpsert(regeln, tx, ziel) {
  const k = nkRegelSchluessel(tx);
  const list = (Array.isArray(regeln) ? regeln : []).filter(r => !(r.typ === k.typ && r.schluessel === k.schluessel));
  if (ziel) list.push({ schluessel: k.schluessel, typ: k.typ, ziel: ziel });
  return list;
}
/* US-86: stabiler Fingerabdruck einer Buchung (für Dedupe beim Re-Import, US-87/88).
   Buchungstag + Betrag + IBAN + normalisierter Verwendungszweck. Reine Funktion. */
function nkUmsatzFingerprint(tx) {
  tx = tx || {};
  return [String(tx.buchungstag || ""), String(tx.betrag || 0), nkNormIban(tx.iban), nkNormName(tx.zweck)].join("|");
}

/* US-87: Abrechnungsmonat einer Buchung bestimmen: Monatsname oder MM.JJJJ im Verwendungszweck,
   sonst Monat des Buchungstags (ISO-Datum). Rückgabe "JJJJ-MM". Reine Funktion. */
const NK_MONATSNAMEN_NORM = ["januar", "februar", "maerz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];
function nkMonatAusZweck(zweck, fallbackDatum) {
  const z = " " + nkNormName(zweck) + " ";
  const jahrM = String(zweck || "").match(/(20\d{2})/);
  const fy = String(fallbackDatum || "").slice(0, 4);
  for (let i = 0; i < 12; i++) { if (z.indexOf(" " + NK_MONATSNAMEN_NORM[i] + " ") >= 0) return (jahrM ? jahrM[1] : fy) + "-" + String(i + 1).padStart(2, "0"); }
  const mm = String(zweck || "").match(/\b(0?[1-9]|1[0-2])[.\/](20\d{2})\b/);
  if (mm) return mm[2] + "-" + String(+mm[1]).padStart(2, "0");
  return String(fallbackDatum || "").slice(0, 7);
}
/* US-87/88: Übernahme-Plan aus den zugeordneten Buchungen. Nutzt die gelernten Regeln
   (nkMatchRegel), überspringt bereits übernommene (Fingerprint in opts.gesehen), summiert Kosten
   je Kostenart und sammelt Zahlungen je Mietverhältnis/Monat. Rein & testbar.
   Rückgabe: { kosten:[{bez,summe,anzahl}], zahlungen:[{einheitId,mvId,monat,betrag}],
   neueKosten:[bez], ignoriert, offen, fingerprints:[fp] }. */
function nkImportPlan(buchungen, regeln, opts) {
  opts = opts || {};
  const gesehen = new Set(opts.gesehen || []);
  const vorhanden = new Set(opts.kostenBez || []);
  const kostenMap = {}, zahlungen = [], neueKosten = new Set(), fps = [];
  let ignoriert = 0, offen = 0;
  (buchungen || []).forEach(b => {
    const ziel = nkMatchRegel(b, regeln);
    if (!ziel) { offen++; return; }
    if (ziel.art === "ignorieren") { ignoriert++; return; }
    const fp = nkUmsatzFingerprint(b);
    const schon = gesehen.has(fp);
    if (ziel.art === "kosten") {
      const bez = ziel.bez;
      /* Dedupe: schon übernommene Buchung überspringen – ABER nur, wenn die Kostenart noch
         existiert. Wurde sie gelöscht, stellt der Re-Import sie wieder her (und nur diese). */
      if (schon && vorhanden.has(bez)) return;
      if (!kostenMap[bez]) kostenMap[bez] = { bez: bez, summe: 0, anzahl: 0 };
      kostenMap[bez].summe = Math.round((kostenMap[bez].summe + Math.abs(+b.betrag || 0)) * 100) / 100;
      kostenMap[bez].anzahl++;
      if (!vorhanden.has(bez)) neueKosten.add(bez);
      fps.push(fp);
    } else if (ziel.art === "mieter") {
      if (schon) return;
      zahlungen.push({ einheitId: ziel.einheitId, mvId: ziel.mvId, monat: nkMonatAusZweck(b.zweck, b.datum), betrag: +b.betrag || 0 });
      fps.push(fp);
    }
  });
  return { kosten: Object.values(kostenMap), zahlungen: zahlungen, neueKosten: [...neueKosten], ignoriert: ignoriert, offen: offen, fingerprints: fps };
}

/* US-40: Freischaltung des versandfertigen PDFs – Stufe 1 (serverlos). Der Code ist deterministisch
   an Objekt + Abrechnungsjahr gebunden: der Verkäufer (Concierge, US-43) erzeugt ihn mit
   nkFreischaltCode aus Objektname/-adresse und Jahr; das Tool prüft offline mit nkFreischaltGueltig.
   Sicherheit ist bewusst gering (Salt clientseitig); die serverseitige Bindung folgt in US-45.
   Reine Funktionen. */
const NK_FREISCHALT_SALT = "NeKoFix-Stufe1-2026";
function nkFreischaltKey(objekt) {
  objekt = objekt || {};
  const name = nkNormName(objekt.name || objekt.addr || "");
  const jahr = (String(objekt.von || objekt.bis || "").match(/^(\d{4})/) || [])[1] || "";
  return name + "|" + jahr;
}
function nkFreischaltCode(objekt) {
  const s = nkFreischaltKey(objekt) + "|" + NK_FREISCHALT_SALT;
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = ((h1 * 33) ^ c) >>> 0; h2 = ((h2 * 31) + c) >>> 0; }
  const raw = (h1.toString(36) + h2.toString(36)).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const code = (raw + "00000000").slice(0, 8);
  return code.slice(0, 4) + "-" + code.slice(4, 8);
}
function nkFreischaltGueltig(code, objekt) {
  const norm = s => String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return !!String(code || "").trim() && norm(code) === norm(nkFreischaltCode(objekt));
}

/* Export nur in Node (für die Tests); im Browser wird dieser Block ignoriert,
   und die Funktionen stehen global zur Verfügung.
   Eine Funktion pro Zeile (mit Komma am Ende) – das entschärft Merge-Konflikte beim
   Hinzufügen neuer Funktionen. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    nkFreischaltKey,
    nkFreischaltCode,
    nkFreischaltGueltig,
    nkTotals,
    nkFactor,
    nkAnteilOf,
    nkLineItemsFor,
    nkOwnerOverview,
    nkVorschlagSchluessel,
    NK_RUBRIKEN,
    nkRubrikenListe,
    nkArrMove,
    nkListeEinsortieren,
    nkRubrik,
    nkSchluesselEinheit,
    NK_P35A,
    NK_P35A_STEUERJAHR,
    nkP35aKategorieVorschlag,
    nkP35aKategorie,
    nkUmlageInfo,
    nkVorauszahlungGesamt,
    nkVorschlagVorauszahlung,
    nkTageInklusive,
    nkUeberlappungsTage,
    nkUeberlappungTageEinheit,
    nkMvEnde,
    nkZeitanteil,
    nkNaechsteEinheitName,
    nkParseState,
    nkUngeprueftAnzahl,
    nkNetto,
    nkVorschlagVorsteuer,
    nkMieterBetrag,
    nkSollMonat,
    nkSollTeile,
    nkMietrueckstand,
    nkMonatNK,
    nkAktiveMonate,
    nkBaldFaellig,
    nkPlausibilitaet,
    nkPlusJahr,
    nkVorjahrUebernehmen,
    nkOffeneVorjahrKosten,
    nkObjekteGruppieren,
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
    nkVerbrauchSumme,
    nkAusschlussNamen,
    NK_ENERGIEARTEN,
    nkEnergieart,
    nkMengeZuKwh,
    nkHeizkosten,
    nkIbanGueltig,
    nkGiroCode,
    nkAnrede,
    NK_CO2_STUFEN,
    nkSpezCo2,
    nkCo2Stufe,
    nkCo2StufeProzent,
    nkCo2Vermieterprozent,
    nkCo2KgSumme,
    nkCo2Erklaerung,
    NK_INDEX_MIN_JAHRE,
    nkPlusJahre,
    nkIndexFrequenzGueltig,
    nkIndexErhoehungsbetrag,
    nkIndexNeueMiete,
    nkIndexAktuelleMiete,
    nkIndexNaechsteAnpassung,
    nkIndexFaellig,
    nkIndexVerwendeterMonat,
    nkIndexAnpassungLoeschen,
    nkIndexBasisMonat,
    nkStaffelNeueMiete,
    nkStichtage,
    nkStaffelPlan,
    nkStaffelMieteAm,
    nkMitteilungsfrist,
    nkMonatDE,
    nkIndexMieteAm,
    nkMieteAm,
    nkZahlStatus,
    nkClone,
    nkSig,
    nkHistCoalesce,
    nkNameAusDateiname,
    nkNormName,
    nkParseDatumDE,
    nkParseUmsatzCsv,
    nkVorsortierung,
    nkNormIban,
    nkRegelSchluessel,
    nkMatchRegel,
    nkRegelUpsert,
    nkUmsatzFingerprint,
    nkMonatAusZweck,
    nkImportPlan,
  };
}
