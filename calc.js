/* NeKoFix – Rechenkern (Verteilung der Nebenkosten).
   Reine Funktionen ohne Seiteneffekte, damit sie sowohl im Browser (index.html)
   als auch in den Tests (Node) verwendet werden können. */

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

function nkAnteilOf(e, kosten, t) {
  return kosten.reduce((s, k) => s + (+k.betrag || 0) * nkFactor(e, k.schluessel, t), 0);
}

function nkLineItemsFor(e, kosten, t) {
  return kosten.map(k => {
    const f = nkFactor(e, k.schluessel, t);
    return { bez: k.bez, gesamt: +k.betrag || 0, schluessel: k.schluessel, vorsteuer: +k.vorsteuer || 0, anteil: (+k.betrag || 0) * f };
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
  const ust = netto * 0.19;
  return { netto: netto, ust: ust, brutto: netto + ust, gewerblich: true };
}

/* Eigentümer-Gesamtübersicht (US-18): je Mieter Anteil, Vorauszahlung, Saldo plus Summen. */
function nkOwnerOverview(einheiten, kosten) {
  const t = nkTotals(einheiten);
  const rows = einheiten.map(e => {
    const anteil = nkAnteilOf(e, kosten, t);
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
  return { bereit: !punkte.some(p => p.level === "fehler"), punkte };
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
    nkZeitanteil,
    nkNaechsteEinheitName,
    nkParseState,
    nkUngeprueftAnzahl,
    nkNetto,
    nkVorschlagVorsteuer,
    nkMieterBetrag,
    nkSollMonat,
    nkAktiveMonate,
    nkBaldFaellig,
    nkPlausibilitaet,
  };
}
