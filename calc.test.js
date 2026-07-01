/* Regressionstests für den Rechenkern (calc.js).
   Ausführen mit:  node --test
   Hinweis: Namespace-Import (calc.*) – so muss diese Zeile beim Hinzufügen neuer
   Funktionen nicht geändert werden (vermeidet wiederkehrende Merge-Konflikte). */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const calc = require("./calc.js");

const einheiten = [
  { flaeche: 70, personen: 2, voraus: 1800 },
  { flaeche: 85, personen: 3, voraus: 2100 },
  { flaeche: 60, personen: 1, voraus: 1500 }
];
const kosten = [
  { bez: "Grundsteuer", betrag: 1200, schluessel: "flaeche" },
  { bez: "Wasser",      betrag: 1600, schluessel: "person" },
  { bez: "Müll",        betrag: 900,  schluessel: "einheit" }
];

test("totals summiert Fläche, Personen und Einheiten", () => {
  const t = calc.nkTotals(einheiten);
  assert.equal(t.flaeche, 215);
  assert.equal(t.personen, 6);
  assert.equal(t.einheiten, 3);
});

test("factor verteilt nach Fläche", () => {
  const t = calc.nkTotals(einheiten);
  assert.ok(Math.abs(calc.nkFactor(einheiten[0], "flaeche", t) - 70 / 215) < 1e-9);
});

test("factor verteilt nach Personen", () => {
  const t = calc.nkTotals(einheiten);
  assert.ok(Math.abs(calc.nkFactor(einheiten[1], "person", t) - 3 / 6) < 1e-9);
});

test("factor verteilt nach Einheit", () => {
  const t = calc.nkTotals(einheiten);
  assert.ok(Math.abs(calc.nkFactor(einheiten[2], "einheit", t) - 1 / 3) < 1e-9);
});

test("jede Position wird vollständig (zu 100 %) verteilt", () => {
  const t = calc.nkTotals(einheiten);
  for (const k of kosten) {
    const summe = einheiten.reduce((s, e) => s + (+k.betrag) * calc.nkFactor(e, k.schluessel, t), 0);
    assert.ok(Math.abs(summe - k.betrag) < 1e-6, `Position ${k.bez} nicht vollständig verteilt`);
  }
});

test("Summe aller Mieteranteile entspricht der Summe aller Kosten", () => {
  const t = calc.nkTotals(einheiten);
  const gesamtKosten = kosten.reduce((s, k) => s + k.betrag, 0);
  const gesamtAnteile = einheiten.reduce((s, e) => s + calc.nkAnteilOf(e, kosten, einheiten), 0);
  assert.ok(Math.abs(gesamtAnteile - gesamtKosten) < 1e-6);
});

test("lineItemsFor liefert je Kostenart eine Zeile mit korrektem Anteil", () => {
  const t = calc.nkTotals(einheiten);
  const items = calc.nkLineItemsFor(einheiten[0], kosten, einheiten);
  assert.equal(items.length, kosten.length);
  const muell = items.find(i => i.schluessel === "einheit"); // 900 / 3 = 300
  assert.ok(Math.abs(muell.anteil - 300) < 1e-9);
});

test("Einheiten-Teilnahme je Kostenart (US-50)", () => {
  const einheiten = [
    { id:1, name:"EG",   flaeche:100, personen:2, mv:[] },
    { id:2, name:"1.OG", flaeche:100, personen:2, mv:[] }
  ];
  // Aufzug 1000 €, nach Fläche, EG (id 1) ausgeschlossen → vollständig auf 1.OG
  const aufzug = [{ bez:"Aufzug", betrag:1000, schluessel:"flaeche", ausgeschlossen:[1] }];
  assert.equal(calc.nkAnteilOf(einheiten[0], aufzug, einheiten), 0);
  assert.ok(Math.abs(calc.nkAnteilOf(einheiten[1], aufzug, einheiten) - 1000) < 1e-9);
  // Summe der Anteile = Kosten (voll auf Teilnehmer verteilt)
  const summe = einheiten.reduce((s,e)=>s+calc.nkAnteilOf(e,aufzug,einheiten),0);
  assert.ok(Math.abs(summe - 1000) < 1e-9);
  // Helfer
  assert.equal(calc.nkTeilnahme(einheiten[0], aufzug[0]), false);
  assert.equal(calc.nkTeilnahme(einheiten[1], aufzug[0]), true);
  assert.deepEqual(calc.nkAusschlussNamen(aufzug[0], einheiten), ["EG"]);
  // Ohne Ausschluss → normale Verteilung (je 500)
  const alle = [{ bez:"Grundsteuer", betrag:1000, schluessel:"flaeche" }];
  assert.ok(Math.abs(calc.nkAnteilOf(einheiten[0], alle, einheiten) - 500) < 1e-9);
  assert.deepEqual(calc.nkAusschlussNamen(alle[0], einheiten), []);
});

test("Direktkosten: 100 % auf eine Einheit (US-22)", () => {
  const einheiten = [
    { id:1, name:"EG",   flaeche:100, personen:2, mv:[] },
    { id:2, name:"1.OG", flaeche:100, personen:2, mv:[] }
  ];
  const k = [{ bez:"Reparatur EG-Fenster", betrag:300, schluessel:"direkt", direktEinheit:1 }];
  assert.equal(calc.nkAnteilOf(einheiten[0], k, einheiten), 300);
  assert.equal(calc.nkAnteilOf(einheiten[1], k, einheiten), 0);
  assert.equal(calc.nkFaktorFuer(einheiten[0], k[0], einheiten), 1);
  assert.equal(calc.nkFaktorFuer(einheiten[1], k[0], einheiten), 0);
  // Summe = Kosten (vollständig der Zieleinheit zugeordnet)
  const summe = einheiten.reduce((s,e)=>s+calc.nkAnteilOf(e,k,einheiten),0);
  assert.equal(summe, 300);
});

test("Heizung: Menge→kWh, Kosten und Energiearten (US-05)", () => {
  assert.equal(calc.nkMengeZuKwh(1000, 10), 10000);   // 1000 l Öl × 10 kWh/l
  assert.equal(calc.nkMengeZuKwh(0, 10), 0);
  assert.equal(calc.nkHeizkosten(1000, 0.9), 900);    // 1000 l × 0,90 €/l
  assert.equal(calc.nkHeizkosten(0, 0.9), 0);
  const oel = calc.nkEnergieart("heizoel");
  assert.equal(oel.einheit, "l"); assert.equal(oel.hi, 10); assert.equal(oel.fossil, true);
  assert.equal(calc.nkEnergieart("strom_wp").fossil, false);
  assert.equal(calc.nkEnergieart("strom_wp").faktorTyp, "jaz");   // Wärmepumpe → Arbeitszahl
  assert.equal(calc.nkEnergieart("erdgas_kwh").faktorTyp, "direkt"); // bereits kWh
  assert.equal(calc.nkEnergieart("heizoel").faktorTyp, "hi");
  assert.equal(calc.nkEnergieart("unbekannt").key, "erdgas_kwh"); // Fallback erstes Element
});

test("Heizblock mit Teilzeitraum: Verteilung über Blockperiode (US-06)", () => {
  const objekt={von:"2025-01-01",bis:"2025-12-31"};
  const einheiten=[{id:1,name:"EG",flaeche:100,personen:2,mv:[
    {mieter:"A",von:"2025-01-01",bis:"2025-06-30",voraus:0},
    {mieter:"B",von:"2025-07-01",bis:"2025-12-31",voraus:0}
  ]}];
  // Gas-Block lief nur Jan–Jun → vollständig vom Jan–Jun-Mieter zu tragen
  const kosten=[{bez:"Gas",betrag:600,schluessel:"flaeche",von:"2025-01-01",bis:"2025-06-30"}];
  const mvs=calc.nkObjektAbrechnung(einheiten,kosten,objekt).einheiten[0].mietverhaeltnisse;
  assert.ok(Math.abs(mvs[0].brutto - 600) < 1e-6); // A trägt den ganzen Block
  assert.ok(Math.abs(mvs[1].brutto - 0)   < 1e-6); // B nichts (kein Überlapp)
  // Ohne Teilzeitraum (normale Position) splittet es nach Mietzeit über das Jahr
  const ohne=[{bez:"Grundsteuer",betrag:1000,schluessel:"flaeche"}];
  const mv2=calc.nkObjektAbrechnung(einheiten,ohne,objekt).einheiten[0].mietverhaeltnisse;
  assert.ok(mv2[0].brutto > 400 && mv2[0].brutto < 600);
});

test("IBAN-Prüfung: Prüfziffer und Länge (US-51)", () => {
  assert.equal(calc.nkIbanGueltig("DE36 0000 0000 0000 0000 00"), true);  // gültige Beispiel-IBAN
  assert.equal(calc.nkIbanGueltig("DE36000000000000000000"), true);       // ohne Leerzeichen
  assert.equal(calc.nkIbanGueltig("DE37 0000 0000 0000 0000 00"), false); // falsche Prüfziffer
  assert.equal(calc.nkIbanGueltig("DE36 0000 0000"), false);              // zu kurz (< 15 Zeichen)
  assert.equal(calc.nkIbanGueltig(""), false);
  assert.equal(calc.nkIbanGueltig("XX12"), false);
});

test("GiroCode-Datensatz EPC069-12 (US-55)", () => {
  const s = calc.nkGiroCode({ empfaenger: "M. Vermieter", iban: "DE36 0000 0000 0000 0000 00", bic: "BICDUMMY", betrag: 1038.01, zweck: "NK EG 2024" });
  const lines = s.split("\n");
  assert.equal(lines[0], "BCD");
  assert.equal(lines[1], "002");
  assert.equal(lines[2], "1");
  assert.equal(lines[3], "SCT");
  assert.equal(lines[4], "BICDUMMY");
  assert.equal(lines[5], "M. Vermieter");
  assert.equal(lines[6], "DE36000000000000000000"); // ohne Leerzeichen
  assert.equal(lines[7], "EUR1038.01");              // Punkt, 2 Nachkommastellen
  assert.equal(lines[10], "NK EG 2024");
  // Kein QR ohne IBAN oder ohne positiven Betrag
  assert.equal(calc.nkGiroCode({ iban: "", betrag: 100 }), "");
  assert.equal(calc.nkGiroCode({ iban: "DE36000000000000000000", betrag: 0 }), "");
});

test("Briefanrede neutral/Herr/Frau (US-53)", () => {
  assert.equal(calc.nkAnrede({mieter:"Nachname_1", anrede:"frau"}), "Sehr geehrte Frau Nachname_1");
  assert.equal(calc.nkAnrede({mieter:"Frau Nachname_1", anrede:"frau"}), "Sehr geehrte Frau Nachname_1"); // kein „Frau Frau"
  assert.equal(calc.nkAnrede({mieter:"Nachname_2", anrede:"herr"}), "Sehr geehrter Herr Nachname_2");
  assert.equal(calc.nkAnrede({mieter:"Familie Nachname_3"}), "Guten Tag Familie Nachname_3"); // neutral
  assert.equal(calc.nkAnrede({mieter:"Herr Nachname_2"}), "Guten Tag Herr Nachname_2");         // neutral: Name unverändert
});

test("leere Einheitenliste führt nicht zu Division durch Null", () => {
  const t = calc.nkTotals([]);
  assert.equal(calc.nkFactor({ flaeche: 50 }, "flaeche", t), 0);
});

test("Eigentümerübersicht: Saldo je Zeile = Anteil minus Vorauszahlung (US-18)", () => {
  const ov = calc.nkOwnerOverview(einheiten, kosten);
  assert.equal(ov.rows.length, einheiten.length);
  ov.rows.forEach((r, i) => {
    assert.ok(Math.abs(r.saldo - (r.anteil - (+einheiten[i].voraus || 0))) < 1e-9);
  });
});

test("Eigentümerübersicht: Summe der Anteile = Summe der Kosten (US-18)", () => {
  const ov = calc.nkOwnerOverview(einheiten, kosten);
  const gesamtKosten = kosten.reduce((s, k) => s + k.betrag, 0);
  assert.ok(Math.abs(ov.totalAnteil - gesamtKosten) < 1e-6);
});

test("Verteilerschlüssel-Vorschlag je Kostenart (US-03)", () => {
  assert.equal(calc.nkVorschlagSchluessel("Grundsteuer"), "flaeche");
  assert.equal(calc.nkVorschlagSchluessel("Wasser / Abwasser"), "person");
  assert.equal(calc.nkVorschlagSchluessel("Müllabfuhr"), "einheit");
  assert.equal(calc.nkVorschlagSchluessel("Heizung & Warmwasser (Messdienst)"), "flaeche");
  assert.equal(calc.nkVorschlagSchluessel("Unbekannte Position"), "flaeche");
});

test("Gesamt-Vorauszahlung = Monatsbetrag × Monate + Einmalzahlung (US-09)", () => {
  assert.equal(calc.nkVorauszahlungGesamt(150, 12, 0), 1800);
  assert.equal(calc.nkVorauszahlungGesamt(150, 12, 200), 2000);
  assert.equal(calc.nkVorauszahlungGesamt(0, 0, 500), 500);
});

test("Vorschlag neuer Monatsbetrag = Anteil ÷ 12, gerundet (US-09)", () => {
  assert.equal(calc.nkVorschlagVorauszahlung(480), 40);
  assert.equal(calc.nkVorschlagVorauszahlung(1800), 150);
  assert.equal(calc.nkVorschlagVorauszahlung(2000), 167);
  assert.equal(calc.nkVorschlagVorauszahlung(0), 0);
});

test("Netto aus Brutto (US-20)", () => {
  assert.ok(Math.abs(calc.nkNetto(119, 19) - 100) < 1e-9);
  assert.ok(Math.abs(calc.nkNetto(107, 7) - 100) < 1e-9);
  assert.equal(calc.nkNetto(100, 0), 100);
});

test("Vorsteuersatz-Vorschlag je Kostenart (US-20)", () => {
  assert.equal(calc.nkVorschlagVorsteuer("Grundsteuer"), 0);
  assert.equal(calc.nkVorschlagVorsteuer("Gebäudeversicherung"), 0);
  assert.equal(calc.nkVorschlagVorsteuer("Müllbeseitigung"), 7);
  assert.equal(calc.nkVorschlagVorsteuer("Hauswart"), 19);
});

test("Mieterbetrag privat vs. gewerblich (US-20)", () => {
  const privat = calc.nkMieterBetrag([{anteil:100},{anteil:50}], false);
  assert.equal(privat.brutto, 150);
  assert.equal(privat.ust, 0);
  // US-99/US-20: Nebenkosten teilen als Nebenleistung den Satz der Vermietung (19 %) – auch eine
  // 7 %-Position (Wasser): Netto herausrechnen, dann 19 % Output-USt aufschlagen.
  const gew = calc.nkMieterBetrag([{anteil:107, vorsteuer:7}], true);
  assert.ok(Math.abs(gew.netto - 100) < 1e-9);
  assert.ok(Math.abs(gew.ust - 19) < 1e-9);     // 19 % auf 100 netto (nicht 7 %)
  assert.ok(Math.abs(gew.brutto - 119) < 1e-9);
  // gemischte Vorsteuersätze: je Position Netto (Vorsteuer raus), dann einheitlich 19 % auf die Summe
  const mix = calc.nkMieterBetrag([{anteil:119, vorsteuer:19},{anteil:107, vorsteuer:7},{anteil:50, vorsteuer:0}], true);
  assert.ok(Math.abs(mix.netto - (100+100+50)) < 1e-9);   // 250 netto
  assert.ok(Math.abs(mix.ust - 250*0.19) < 1e-9);          // 47,50 USt
  assert.ok(Math.abs(mix.brutto - 250*1.19) < 1e-9);
});

test("Anzahl ungeprüfter Belege (US-19)", () => {
  assert.equal(calc.nkUngeprueftAnzahl([{status:"geprueft"},{status:"vorlaeufig"},{}]), 2);
  assert.equal(calc.nkUngeprueftAnzahl([{status:"geprueft"}]), 0);
  assert.equal(calc.nkUngeprueftAnzahl([]), 0);
});

test("State aus JSON laden und prüfen (US-27)", () => {
  assert.ok(calc.nkParseState(JSON.stringify({ objekt:{}, einheiten:[], kosten:[] })));
  assert.equal(calc.nkParseState("kein json"), null);
  assert.equal(calc.nkParseState(JSON.stringify({ foo:1 })), null);
});

test("Plausibilitätsprüfung: bereit / Lücken (US-14)", () => {
  const ok = {
    objekt:{von:"2025-01-01",bis:"2025-12-31"},
    einheiten:[{flaeche:70,personen:2,mv:[{mieter:"A",von:"2025-01-01",bis:"2025-12-31"}]}],
    kosten:[{bez:"Grundsteuer",betrag:1200,schluessel:"flaeche"}],
    zahlung:{iban:"DE36000000000000000000",empfaenger:"V"}
  };
  assert.equal(calc.nkPlausibilitaet(ok).bereit, true);
  const ohneIban = JSON.parse(JSON.stringify(ok)); ohneIban.zahlung.iban = "";
  assert.equal(calc.nkPlausibilitaet(ohneIban).bereit, false);
  const ohneFlaeche = JSON.parse(JSON.stringify(ok)); ohneFlaeche.einheiten[0].flaeche = 0;
  assert.equal(calc.nkPlausibilitaet(ohneFlaeche).bereit, false);
});

test("Überschneidungstage je Einheit (US-47)", () => {
  // 30.06. ist bei beiden enthalten → 1 Tag Überschneidung
  const e1 = { mv:[{von:"2025-01-01",bis:"2025-06-30"},{von:"2025-06-30",bis:"2025-12-31"}] };
  assert.equal(calc.nkUeberlappungTageEinheit(e1), 1);
  // Angrenzend (29.06. / 30.06.) → keine Überschneidung
  const e2 = { mv:[{von:"2025-01-01",bis:"2025-06-29"},{von:"2025-06-30",bis:"2025-12-31"}] };
  assert.equal(calc.nkUeberlappungTageEinheit(e2), 0);
  // Ein Mietverhältnis → 0
  assert.equal(calc.nkUeberlappungTageEinheit({ mv:[{von:"2025-01-01",bis:"2025-12-31"}] }), 0);
});

test("Plausibilität: überschneidende Mietzeiträume als Warnung (US-47)", () => {
  const base = {
    objekt:{von:"2025-01-01",bis:"2025-12-31"},
    einheiten:[{name:"EG",flaeche:70,personen:2,mv:[
      {mieter:"A",von:"2025-01-01",bis:"2025-06-30"},
      {mieter:"B",von:"2025-06-30",bis:"2025-12-31"}   // 1 Tag Überschneidung
    ]}],
    kosten:[{bez:"Grundsteuer",betrag:1200,schluessel:"flaeche"}],
    zahlung:{iban:"DE36000000000000000000",empfaenger:"V"}
  };
  const r = calc.nkPlausibilitaet(base);
  const treffer = r.punkte.find(p => /überschneidende Mietzeiträume/.test(p.text));
  assert.ok(treffer, "Überschneidungs-Warnung erwartet");
  assert.equal(treffer.level, "warn");
  assert.ok(/EG/.test(treffer.text) && /A/.test(treffer.text) && /B/.test(treffer.text) && /1 Tag/.test(treffer.text));
  assert.equal(r.bereit, true); // Warnung blockiert den Versand nicht
  // Angrenzend (kein gemeinsamer Tag) → keine Warnung
  const ohne = JSON.parse(JSON.stringify(base));
  ohne.einheiten[0].mv[0].bis = "2025-06-29";
  assert.ok(!calc.nkPlausibilitaet(ohne).punkte.some(p => /überschneidende Mietzeiträume/.test(p.text)));
});

test("Anpassung bald fällig (US-21)", () => {
  assert.equal(calc.nkBaldFaellig("2026-08-01", "2026-06-12", 3), true);
  assert.equal(calc.nkBaldFaellig("2026-12-01", "2026-06-12", 3), false);
  assert.equal(calc.nkBaldFaellig("2026-01-01", "2026-06-12", 3), false);
  assert.equal(calc.nkBaldFaellig("", "2026-06-12", 3), false);
});

test("Monatliche NK-Vorauszahlung: Monatsbetrag bzw. Jahr ÷ Monate (US-35)", () => {
  assert.equal(calc.nkMonatNK({ vmonat: 150 }), 150);
  assert.equal(calc.nkMonatNK({ voraus: 1800, vmonate: 12 }), 150);
  assert.equal(calc.nkMonatNK({ voraus: 525, vmonate: 3 }), 175);
  assert.equal(calc.nkMonatNK({}), 0);
});

test("Soll-Monatsbetrag = Grundmiete + NK + N×Stellplatz (US-28)", () => {
  assert.equal(calc.nkSollMonat(800, 150, 1, 40), 990);
  assert.equal(calc.nkSollMonat(650, 125, 0, 0), 775);
  assert.equal(calc.nkSollMonat(700, 100, 2, 35), 870);
});

test("Aktive Monate eines Mietverhältnisses (US-28)", () => {
  const a = calc.nkAktiveMonate("2025-01-01", "2025-08-31", "2025-01-01", "2025-12-31");
  assert.equal(a.length, 8);
  assert.equal(a[0], "2025-01");
  assert.equal(a[7], "2025-08");
  const b = calc.nkAktiveMonate("2025-10-01", "2025-12-31", "2025-01-01", "2025-12-31");
  assert.deepEqual(b, ["2025-10","2025-11","2025-12"]);
});

test("Standardname nächste Einheit hochzählen (US-26)", () => {
  assert.equal(calc.nkNaechsteEinheitName(["EG", "1. OG", "2. OG"]), "3. OG");
  assert.equal(calc.nkNaechsteEinheitName(["EG", "1. OG"]), "2. OG");
  assert.equal(calc.nkNaechsteEinheitName(["EG"]), "1. OG");
  assert.equal(calc.nkNaechsteEinheitName([]), "EG");
});

test("Überlappungstage tagesgenau (US-10)", () => {
  assert.equal(calc.nkUeberlappungsTage("2025-01-01", "2025-12-31", "2025-01-01", "2025-12-31"), 365);
  assert.equal(calc.nkUeberlappungsTage("2025-06-01", "2025-06-30", "2025-06-15", "2025-07-15"), 16);
  assert.equal(calc.nkUeberlappungsTage("2024-01-01", "2024-12-31", "2025-01-01", "2025-12-31"), 0);
});

test("Zeitanteil tagesgenau (US-10)", () => {
  assert.ok(Math.abs(calc.nkZeitanteil("2025-01-01", "2025-12-31", "2025-01-01", "2025-12-31") - 1) < 1e-9);
  assert.ok(Math.abs(calc.nkZeitanteil("2025-01-01", "2025-06-30", "2025-01-01", "2025-12-31") - 181 / 365) < 1e-9);
  assert.equal(calc.nkZeitanteil("2024-01-01", "2024-12-31", "2025-01-01", "2025-12-31"), 0);
});

test("Zentrale Konstanten und USt-Berechnung darüber (US-37)", () => {
  assert.equal(calc.NK_UST_SATZ, 19);
  assert.ok(calc.NK_LEERSTAND_EPS > 0 && calc.NK_LEERSTAND_EPS < 0.01);
  const g = calc.nkMieterBetrag([{ anteil: 119, vorsteuer: 19 }], true); // netto 100
  assert.ok(Math.abs(g.ust - 100 * calc.NK_UST_SATZ / 100) < 1e-9);
  assert.ok(Math.abs(g.brutto - (g.netto + g.ust)) < 1e-9);
});

test("Betrag formatieren und parsen, deutsche Schreibweise (US-48)", () => {
  assert.equal(calc.nkFmtBetrag(1000.1), "1.000,10");
  assert.equal(calc.nkFmtBetrag(12345.67), "12.345,67");
  assert.equal(calc.nkFmtBetrag(0), "0,00");
  // Parsen: deutsches Format, US-getipptes Format, leer
  assert.equal(calc.nkParseBetrag("1.000,10"), 1000.1);
  assert.equal(calc.nkParseBetrag("1000,10"), 1000.1);
  assert.equal(calc.nkParseBetrag("12.345,67"), 12345.67);
  assert.equal(calc.nkParseBetrag("70"), 70);
  assert.equal(calc.nkParseBetrag(""), 0);
  // Round-Trip: Anzeige → Parsen ergibt wieder die Zahl
  assert.equal(calc.nkParseBetrag(calc.nkFmtBetrag(1234.5)), 1234.5);
});

test("HTML-Escaping von Freitext (US-36)", () => {
  assert.equal(calc.nkEsc("A & B"), "A &amp; B");
  assert.equal(calc.nkEsc("<script>"), "&lt;script&gt;");
  assert.equal(calc.nkEsc('Mü"ller'), "Mü&quot;ller");
  assert.equal(calc.nkEsc("O'Neil"), "O&#39;Neil");
  assert.equal(calc.nkEsc(null), "");
  assert.equal(calc.nkEsc(42), "42");
});

test("Mieterabrechnung: Zeilen, Zeitanteil, gewerblich, Saldo (US-32)", () => {
  const objekt = { von: "2025-01-01", bis: "2025-12-31" };
  const eh = [{ name: "EG", flaeche: 100, personen: 2 }, { name: "OG", flaeche: 100, personen: 2 }];
  const k = [{ bez: "Grundsteuer", betrag: 1000, schluessel: "flaeche", vorsteuer: 0 }];
  const t = calc.nkTotals(eh);
  // Ganzjährig, privat: Anteil = 50 % von 1000 = 500
  const ab = calc.nkMieterAbrechnung(eh[0], { mieter: "A", von: "2025-01-01", bis: "2025-12-31", voraus: 400 }, k, objekt, eh);
  assert.ok(Math.abs(ab.zeitanteil - 1) < 1e-9);
  assert.ok(Math.abs(ab.zeilen[0].anteil - 500) < 1e-9);
  assert.ok(Math.abs(ab.brutto - 500) < 1e-9);
  assert.ok(Math.abs(ab.saldo - 100) < 1e-9);
  // Gewerblich (19 %): brutto = netto × 1,19
  const g = calc.nkMieterAbrechnung(eh[0], { mieter: "G", gewerblich: true, von: "2025-01-01", bis: "2025-12-31", voraus: 0 }, [{ bez: "Hauswart", betrag: 1190, schluessel: "flaeche", vorsteuer: 19 }], objekt, eh);
  assert.ok(Math.abs(g.netto - 500) < 1e-6);            // 50 % von (1190 netto=1000) = 500
  assert.ok(Math.abs(g.brutto - g.netto * 1.19) < 1e-6);
});

test("Objektabrechnung: Summe inkl. Leerstand, Leerstandanteil (US-32)", () => {
  const objekt = { von: "2025-01-01", bis: "2025-12-31" };
  const einheiten = [
    { name: "EG", flaeche: 100, personen: 2, mv: [{ mieter: "A", von: "2025-01-01", bis: "2025-12-31", voraus: 0 }] },
    { name: "OG", flaeche: 100, personen: 2, mv: [{ mieter: "B", von: "2025-07-02", bis: "2025-12-31", voraus: 0 }] } // ~ halbes Jahr
  ];
  const kosten = [{ bez: "Grundsteuer", betrag: 1000, schluessel: "flaeche", vorsteuer: 0 }];
  const ab = calc.nkObjektAbrechnung(einheiten, kosten, objekt);
  // Voll verteilt: Summe aller Anteile inkl. Leerstand = Gesamtkosten
  assert.ok(Math.abs(ab.summeAnteil - 1000) < 1e-6);
  // OG: ~halbes Jahr belegt → Leerstand ~0,5, Leerstandbetrag ~ 500 × 0,5
  const og = ab.einheiten[1];
  assert.ok(og.leerstandZeitanteil > 0.4 && og.leerstandZeitanteil < 0.6);
  assert.ok(Math.abs(og.leerstandBetrag - og.unitShare * og.leerstandZeitanteil) < 1e-9);
  assert.ok(Math.abs(ab.summeSaldo - (ab.summeAnteil - ab.summeVoraus)) < 1e-9);
});

test("Exakte Objekt-Duplikate entfernen, Reihenfolge bleibt (US-30)", () => {
  const a = { objekt: { addr: "X", von: "2025-01-01", bis: "2025-12-31" }, einheiten: [], kosten: [] };
  const a2 = JSON.parse(JSON.stringify(a));
  const b = { objekt: { addr: "X", von: "2026-01-01", bis: "2026-12-31" }, einheiten: [], kosten: [] };
  const res = calc.nkDedupeObjekte([a, a2, b]);
  assert.equal(res.length, 2);
  assert.equal(res[0].objekt.von, "2025-01-01");
  assert.equal(res[1].objekt.von, "2026-01-01");
  assert.equal(calc.nkDedupeObjekte([]).length, 0);
});

test("Datum um ein Jahr verschieben, Schalttag (US-11)", () => {
  assert.equal(calc.nkPlusJahr("2025-01-01"), "2026-01-01");
  assert.equal(calc.nkPlusJahr("2025-12-31"), "2026-12-31");
  assert.equal(calc.nkPlusJahr("2024-02-29"), "2025-02-28");
  assert.equal(calc.nkPlusJahr(""), "");
});

test("Vorjahr übernehmen: Zeitraum +1J, Beträge mit Vorjahreswert vorbelegt+markiert, ausgezogene MV weg (US-11/US-90)", () => {
  const src = {
    objekt: { addr: "Teststr. 1", von: "2025-01-01", bis: "2025-12-31" },
    einheiten: [
      { id: 1, name: "EG", flaeche: 70, personen: 2, mv: [
        { mieter: "Nachname_3", von: "2025-01-01", bis: "2025-12-31", vmonat: 150, vmonate: 12, voraus: 1800, bezahlt: { "2025-01": true } }
      ]},
      { id: 2, name: "1. OG", flaeche: 85, personen: 3, mv: [
        { mieter: "Nachname_1", von: "2025-01-01", bis: "2025-08-31", vmonat: 175, vmonate: 8, voraus: 1400 },
        { mieter: "Nachname_4", von: "2025-10-01", bis: "2025-12-31", vmonat: 175, vmonate: 3, voraus: 525 }
      ]}
    ],
    kosten: [{ bez: "Grundsteuer", betrag: 1200, schluessel: "flaeche" }],
    zahlung: { iban: "DE12", empfaenger: "V" }
  };
  const neu = calc.nkVorjahrUebernehmen(src);
  assert.equal(neu.objekt.von, "2026-01-01");
  assert.equal(neu.objekt.bis, "2026-12-31");
  assert.equal(neu.vorjahr, true);
  assert.equal(neu.kosten[0].betrag, 1200); // US-90: Vorjahreswert vorbelegt (nicht geleert)
  assert.equal(neu.kosten[0].schluessel, "flaeche");
  assert.equal(neu.kosten[0].vorjahr, true); // markiert: noch aktiv zu übernehmen
  assert.equal(neu.einheiten[0].mv.length, 1);
  assert.equal(neu.einheiten[1].mv.length, 1);
  assert.equal(neu.einheiten[1].mv[0].mieter, "Nachname_4");
  assert.equal(neu.einheiten[1].mv[0].von, "2026-01-01");
  assert.equal(neu.einheiten[1].mv[0].bis, "2026-12-31");
  assert.equal(neu.einheiten[1].mv[0].vmonate, 12);
  assert.equal(neu.einheiten[1].mv[0].voraus, 175 * 12);
  assert.deepEqual(neu.einheiten[0].mv[0].bezahlt, {});
  assert.equal(neu.zahlung.iban, "DE12");
  assert.equal(src.objekt.von, "2025-01-01");
  assert.equal(src.kosten[0].betrag, 1200);
});

test("nkOffeneVorjahrKosten: liefert nur noch markierte (unbestätigte) Vorjahr-Positionen (US-90)", () => {
  const kosten = [
    { bez: "Grundsteuer", betrag: 1200, vorjahr: true },
    { bez: "Wasser", betrag: 800, vorjahr: false },
    { bez: "Müll", betrag: 300 },
    { bez: "Versicherung", betrag: 500, vorjahr: true }
  ];
  const offen = calc.nkOffeneVorjahrKosten(kosten);
  assert.equal(offen.length, 2);
  assert.deepEqual(offen.map(k => k.bez), ["Grundsteuer", "Versicherung"]);
  assert.equal(calc.nkOffeneVorjahrKosten([]).length, 0);
  assert.equal(calc.nkOffeneVorjahrKosten(undefined).length, 0);
});

test("nkObjekteGruppieren: erst gruppieren bei >2 Objekten und einem mit >2 Jahren (US-91)", () => {
  assert.equal(calc.nkObjekteGruppieren([{name:"A",jahr:2025},{name:"A",jahr:2024}]), false);
  assert.equal(calc.nkObjekteGruppieren([{name:"A",jahr:2025},{name:"B",jahr:2025},{name:"C",jahr:2025}]), false);
  assert.equal(calc.nkObjekteGruppieren([{name:"A",jahr:2025},{name:"A",jahr:2024},{name:"A",jahr:2023}]), false);
  assert.equal(calc.nkObjekteGruppieren([
    {name:"A",jahr:2025},{name:"A",jahr:2024},{name:"A",jahr:2023},
    {name:"B",jahr:2025},{name:"C",jahr:2025}
  ]), true);
  assert.equal(calc.nkObjekteGruppieren([]), false);
});

test("Umlagefähigkeit je Kostenart (US-04)", () => {
  assert.equal(calc.nkUmlageInfo("Grundsteuer").umlagefaehig, true);
  assert.equal(calc.nkUmlageInfo("Wasser / Abwasser").umlagefaehig, true);
  assert.equal(calc.nkUmlageInfo("Verwaltungskosten").umlagefaehig, false);
  assert.equal(calc.nkUmlageInfo("Instandhaltung Dach").umlagefaehig, false);
  assert.equal(calc.nkUmlageInfo("Reparatur Heizung").umlagefaehig, false);
  assert.equal(calc.nkUmlageInfo("Kabel-/Fernsehsignal").umlagefaehig, false);
  assert.ok(calc.nkUmlageInfo("Kabel-/Fernsehsignal").grund.length > 0);
});

/* US-07: CO2-Kostenaufteilung (CO2KostAufG). */
test("CO2: spezifischer Ausstoß = kg / Fläche", () => {
  assert.equal(calc.nkSpezCo2(2400, 100), 24);
  assert.equal(calc.nkSpezCo2(2400, 0), 0); // Schutz vor Division durch 0
});

test("CO2: 10-Stufen-Modell – Grenzen und Vermieteranteil", () => {
  assert.equal(calc.nkCo2StufeProzent(11.9), 0);   // < 12
  assert.equal(calc.nkCo2StufeProzent(12), 10);    // 12 bis < 17
  assert.equal(calc.nkCo2StufeProzent(24), 30);    // 22 bis < 27
  assert.equal(calc.nkCo2StufeProzent(51.9), 80);  // 47 bis < 52
  assert.equal(calc.nkCo2StufeProzent(52), 95);    // >= 52
  assert.equal(calc.nkCo2Stufe(11.9), 1);
  assert.equal(calc.nkCo2Stufe(24), 4);
  assert.equal(calc.nkCo2Stufe(60), 10);
});

test("CO2: Vermieteranteil – Gewerbe 50/50, Override, Denkmal halbiert", () => {
  assert.equal(calc.nkCo2Vermieterprozent(24, {}), 30);                       // Wohnen, Stufe
  assert.equal(calc.nkCo2Vermieterprozent(24, { gewerblich: true }), 50);     // Gewerbe pauschal
  assert.equal(calc.nkCo2Vermieterprozent(24, { override: 40 }), 40);         // manuell überschrieben
  assert.equal(calc.nkCo2Vermieterprozent(24, { denkmal: true }), 15);        // 30 / 2
  assert.equal(calc.nkCo2Vermieterprozent(24, { gewerblich: true, denkmal: true }), 25); // 50 / 2
});

test("CO2: kg-Summe zählt nur fossile Heizblöcke", () => {
  const k = [
    { typ: "heizung", energieart: "erdgas_kwh", co2Kg: 2400 }, // fossil
    { typ: "heizung", energieart: "strom_wp",   co2Kg: 999 },  // WP – zählt nicht
    { bez: "Grundsteuer", betrag: 1200, schluessel: "flaeche" } // keine Heizung
  ];
  assert.equal(calc.nkCo2KgSumme(k), 2400);
});

test("CO2: Abzug reduziert den Mieterbetrag (Wohnen)", () => {
  const E = [{ id: 1, flaeche: 50, personen: 1 }, { id: 2, flaeche: 50, personen: 1 }];
  const K = [{ bez: "Heizung", betrag: 2000, schluessel: "flaeche", typ: "heizung", energieart: "erdgas_kwh", co2Kg: 2400, co2Kosten: 300 }];
  const o = { von: "2025-01-01", bis: "2025-12-31" };
  const m = { mieter: "A", von: "2025-01-01", bis: "2025-12-31", voraus: 0 };
  const ab = calc.nkMieterAbrechnung(E[0], m, K, o, E);
  assert.equal(ab.co2.stufe, 4);
  assert.equal(ab.co2.vermieterProzent, 30);
  assert.ok(Math.abs(ab.co2.kostenMieter - 150) < 1e-9); // 300 × 1000/2000
  assert.ok(Math.abs(ab.co2.abzug - 45) < 1e-9);         // 150 × 30 %
  assert.ok(Math.abs(ab.bruttoVorCo2 - 1000) < 1e-9);
  assert.ok(Math.abs(ab.brutto - 955) < 1e-9);           // 1000 − 45
  assert.equal(ab.co2.aktiv, true);
});

test("CO2: ohne fossile Heizung keine Aufteilung", () => {
  const E = [{ id: 1, flaeche: 100, personen: 1 }];
  const K = [{ bez: "Grundsteuer", betrag: 1200, schluessel: "flaeche" }];
  const o = { von: "2025-01-01", bis: "2025-12-31" };
  const m = { mieter: "A", von: "2025-01-01", bis: "2025-12-31", voraus: 0 };
  const ab = calc.nkMieterAbrechnung(E[0], m, K, o, E);
  assert.equal(ab.co2.aktiv, false);
  assert.equal(ab.co2.abzug, 0);
  assert.equal(ab.brutto, ab.bruttoVorCo2);
});

test("CO2: Erläuterungstext nennt den greifenden Fall", () => {
  assert.ok(/Wohngeb/.test(calc.nkCo2Erklaerung({ aktiv: true, fall: "wohnen", stufe: 4, spez: 24, vermieterProzent: 30, denkmal: false })));
  assert.ok(/Gewerbe/.test(calc.nkCo2Erklaerung({ aktiv: true, fall: "gewerbe", vermieterProzent: 50, denkmal: false })));
  assert.ok(/halbiert/.test(calc.nkCo2Erklaerung({ aktiv: true, fall: "wohnen", stufe: 4, spez: 24, vermieterProzent: 15, denkmal: true })));
  assert.ok(/Keine/.test(calc.nkCo2Erklaerung({ aktiv: false })));
});

/* US-59: Spaltenwerte für den Rechenweg (Gesamteinheiten, Preis je Einheit, Einheit-Label). */
test("Spaltenwerte: Fläche – Basis, Ihre Einheiten, Preis je Einheit", () => {
  const E = [{ id: 1, flaeche: 86.1, personen: 1 }, { id: 2, flaeche: 384.5, personen: 6 }];
  const k = [{ bez: "Grundsteuer", betrag: 1552.44, schluessel: "flaeche" }];
  const z = calc.nkLineItemsFor(E[0], k, E)[0];
  assert.ok(Math.abs(z.basis - 470.6) < 1e-9);
  assert.ok(Math.abs(z.ihreEinheiten - 86.1) < 1e-9);
  assert.ok(Math.abs(z.preisJeEinheit - 1552.44 / 470.6) < 1e-9);
  assert.equal(z.einheitLabel, "m²");
  // Preis × Ihre Einheiten = Anteil
  assert.ok(Math.abs(z.preisJeEinheit * z.ihreEinheiten - z.anteil) < 1e-6);
});

test("Spaltenwerte: Verbrauch nutzt Einheit-Label der Position", () => {
  const E = [{ id: 1 }, { id: 2 }];
  const k = [{ bez: "Wasser", betrag: 600, schluessel: "verbrauch", einheit: "m³", verbrauch: { 1: 40, 2: 60 } }];
  const z = calc.nkLineItemsFor(E[0], k, E)[0];
  assert.equal(z.basis, 100);
  assert.equal(z.ihreEinheiten, 40);
  assert.ok(Math.abs(z.preisJeEinheit - 6) < 1e-9);
  assert.equal(z.einheitLabel, "m³");
});

test("Spaltenwerte: Einheit-Labels je Schlüssel", () => {
  assert.equal(calc.nkSchluesselEinheit({ schluessel: "flaeche" }), "m²");
  assert.equal(calc.nkSchluesselEinheit({ schluessel: "person" }), "Pers.");
  assert.equal(calc.nkSchluesselEinheit({ schluessel: "einheit" }), "Whg.");
  assert.equal(calc.nkSchluesselEinheit({ schluessel: "verbrauch", einheit: "kWh" }), "kWh");
  assert.equal(calc.nkSchluesselEinheit({ schluessel: "direkt" }), "");
});

test("Spaltenwerte: Messdienst-Beispiel EG – Preis × Einheiten trifft", () => {
  const E = [{ id: 1, name: "EG", flaeche: 86.1 }, { id: 2, name: "Rest", flaeche: 384.5 }];
  // Grundsteuer nach Fläche: Preis/Einheit × 86,1 m² = 284,03
  const k = [{ bez: "Grundsteuer", betrag: 1552.44, schluessel: "flaeche" }];
  const z = calc.nkLineItemsFor(E[0], k, E)[0];
  assert.ok(Math.abs(z.preisJeEinheit * z.ihreEinheiten - 284.03) < 0.01);
});

/* US-32: §35a – Kategorie-Vorschlag und Mieteranteil je Kategorie. */
test("§35a: Kategorie-Vorschlag aus Bezeichnung, Override sticht", () => {
  assert.equal(calc.nkP35aKategorieVorschlag("Hausmeister"), "dienstleistung");
  assert.equal(calc.nkP35aKategorieVorschlag("Gartenpflege"), "dienstleistung");
  assert.equal(calc.nkP35aKategorieVorschlag("Schornsteinfeger"), "handwerker");
  assert.equal(calc.nkP35aKategorieVorschlag("Heizungswartung"), "handwerker");
  assert.equal(calc.nkP35aKategorieVorschlag("Grundsteuer"), "");
  assert.equal(calc.nkP35aKategorie({ bez: "Hausmeister", p35a: "keine" }), ""); // explizit keine
  assert.equal(calc.nkP35aKategorie({ bez: "Grundsteuer", p35a: "handwerker" }), "handwerker"); // Override
});

test("§35a: Mieteranteil je Kategorie, nur für private Mietverhältnisse", () => {
  const E = [{ id: 1, name: "EG", flaeche: 50, personen: 1 }, { id: 2, name: "OG", flaeche: 50, personen: 1 }];
  const K = [
    { bez: "Hausmeister", betrag: 1000, schluessel: "flaeche", arbeitskosten: 800 },          // Dienstleistung
    { bez: "Heizungswartung", betrag: 400, schluessel: "flaeche", arbeitskosten: 300 },        // Handwerker
    { bez: "Grundsteuer", betrag: 1200, schluessel: "flaeche" }                                 // nicht §35a
  ];
  const o = { von: "2025-01-01", bis: "2025-12-31" };
  const m = { mieter: "A", von: "2025-01-01", bis: "2025-12-31", voraus: 0 };
  const ab = calc.nkMieterAbrechnung(E[0], m, K, o, E);
  assert.ok(Math.abs(ab.p35a.dienstleistung - 400) < 1e-9); // 800 × 50/100
  assert.ok(Math.abs(ab.p35a.handwerker - 150) < 1e-9);     // 300 × 50/100
  assert.equal(ab.p35a.aktiv, true);
  // Gewerblich: kein §35a-Ausweis
  const abG = calc.nkMieterAbrechnung(E[0], { mieter: "B", gewerblich: true, von: o.von, bis: o.bis, voraus: 0 }, K, o, E);
  assert.equal(abG.p35a.aktiv, false);
});

test("§35a: Positionsliste je Kategorie (US-62) – Summe = Kategorie-Summe", () => {
  const E = [{ id: 1, name: "EG", flaeche: 50, personen: 1 }, { id: 2, name: "OG", flaeche: 50, personen: 1 }];
  const K = [
    { bez: "Hausmeister", betrag: 1000, schluessel: "flaeche", arbeitskosten: 800 },
    { bez: "Gartenpflege", betrag: 600, schluessel: "flaeche", arbeitskosten: 600 },
    { bez: "Heizungswartung", betrag: 400, schluessel: "flaeche", arbeitskosten: 300 },
    { bez: "Grundsteuer", betrag: 1200, schluessel: "flaeche" }
  ];
  const o = { von: "2025-01-01", bis: "2025-12-31" };
  const ab = calc.nkMieterAbrechnung(E[0], { mieter: "A", von: o.von, bis: o.bis, voraus: 0 }, K, o, E);
  const dl = ab.p35a.posten.filter(p => p.kategorie === "dienstleistung");
  const hw = ab.p35a.posten.filter(p => p.kategorie === "handwerker");
  assert.equal(dl.length, 2);   // Hausmeister + Gartenpflege
  assert.equal(hw.length, 1);   // Heizungswartung
  // Grundsteuer (kein arbeitskosten) erscheint nicht
  assert.ok(!ab.p35a.posten.some(p => p.bez === "Grundsteuer"));
  // Positionssummen = Kategorie-Summe
  assert.ok(Math.abs(dl.reduce((s, p) => s + p.anteil, 0) - ab.p35a.dienstleistung) < 1e-9);
  assert.ok(Math.abs(hw.reduce((s, p) => s + p.anteil, 0) - ab.p35a.handwerker) < 1e-9);
  // EG-Anteil Hausmeister: 800 × 50/100 = 400
  assert.ok(Math.abs(dl.find(p => p.bez === "Hausmeister").anteil - 400) < 1e-9);
});

/* US-58: Rubriken (Kostengruppen). */
test("Rubrik: Vorschlag aus Typ/Schlüssel/Bezeichnung, Override sticht", () => {
  assert.equal(calc.nkRubrik({ bez: "Grundsteuer" }), "Betriebskosten");
  assert.equal(calc.nkRubrik({ bez: "Heizung Verbrauch", typ: "heizung" }), "Heizkosten");
  assert.equal(calc.nkRubrik({ bez: "Warmwasser Grundkosten" }), "Warmwasserkosten");
  assert.equal(calc.nkRubrik({ bez: "Schmutzwasser / Abwasser" }), "Kaltwasserkosten");
  assert.equal(calc.nkRubrik({ bez: "Aufzug", schluessel: "direkt" }), "Direktkosten");
  assert.equal(calc.nkRubrik({ bez: "Grundsteuer", rubrik: "Sonstige" }), "Sonstige"); // Override
  assert.ok(calc.NK_RUBRIKEN.indexOf("Heizkosten") < calc.NK_RUBRIKEN.indexOf("Betriebskosten"));
});

/* US-57: verbrauchsabhängige Verteilung über erfasste Zählerstände. */
test("Verbrauch: Faktor = Einheit-Verbrauch ÷ Gesamtverbrauch", () => {
  const E = [{ id: 1, flaeche: 50 }, { id: 2, flaeche: 50 }];
  const k = { schluessel: "verbrauch", verbrauch: { 1: 30, 2: 70 } };
  assert.ok(Math.abs(calc.nkFaktorFuer(E[0], k, E) - 0.3) < 1e-9);
  assert.ok(Math.abs(calc.nkFaktorFuer(E[1], k, E) - 0.7) < 1e-9);
  assert.equal(calc.nkVerbrauchSumme(k, E), 100);
});

test("Verbrauch: ohne erfasste Werte Faktor 0 (nicht verteilbar)", () => {
  const E = [{ id: 1 }, { id: 2 }];
  const k = { schluessel: "verbrauch", verbrauch: {} };
  assert.equal(calc.nkFaktorFuer(E[0], k, E), 0);
  const r = calc.nkPlausibilitaet({ objekt: { von: "2025-01-01", bis: "2025-12-31" }, einheiten: E, kosten: [k], zahlung: { iban: "DE36000000000000000000", empfaenger: "X" } });
  assert.ok(r.punkte.some(p => p.level === "fehler" && /nicht verteilbar/.test(p.text)));
});

test("Verbrauch: ausgeschlossene Einheit zählt nicht zur Summe", () => {
  const E = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const k = { schluessel: "verbrauch", verbrauch: { 1: 10, 2: 10, 3: 10 }, ausgeschlossen: [3] };
  assert.equal(calc.nkVerbrauchSumme(k, E), 20);
  assert.ok(Math.abs(calc.nkFaktorFuer(E[0], k, E) - 0.5) < 1e-9);
  assert.equal(calc.nkFaktorFuer(E[2], k, E), 0);
});

test("Verbrauch: Messdienst-Abnahmebeispiel (Einheit EG) trifft centgenau", () => {
  const total = { heiz: 37595, ww: 60.0, kw: 206.1 };
  const eg = { heiz: 12732, ww: 6.6, kw: 46.8 };
  const E = [{ id: 1, name: "EG" }, { id: 2, name: "Rest" }];
  const vb = (egVal, tot) => ({ 1: egVal, 2: tot - egVal });
  const K = [
    { bez: "Heizung-Verbrauch", betrag: 5695.72, schluessel: "verbrauch", verbrauch: vb(eg.heiz, total.heiz) },
    { bez: "Warmwasser-Verbrauch", betrag: 1251.87, schluessel: "verbrauch", verbrauch: vb(eg.ww, total.ww) },
    { bez: "Kaltwasser", betrag: 704.38, schluessel: "verbrauch", verbrauch: vb(eg.kw, total.kw) },
    { bez: "Schmutzwasser", betrag: 684.65, schluessel: "verbrauch", verbrauch: vb(eg.kw, total.kw) },
    { bez: "Gerätewartung KW", betrag: 105.63, schluessel: "verbrauch", verbrauch: vb(eg.kw, total.kw) },
    { bez: "Verbrauchserfassung KW", betrag: 137.61, schluessel: "verbrauch", verbrauch: vb(eg.kw, total.kw) }
  ];
  const erwartet = [1928.92, 137.70, 159.95, 155.47, 23.99, 31.25];
  const o = { von: "2024-05-01", bis: "2025-04-30" };
  const m = { mieter: "EG", von: "2024-05-01", bis: "2025-04-30", voraus: 0 };
  const ab = calc.nkMieterAbrechnung(E[0], m, K, o, E);
  ab.zeilen.forEach((z, i) => assert.ok(Math.abs(z.anteil - erwartet[i]) < 0.01, z.bez + ": " + z.anteil.toFixed(2) + " ≠ " + erwartet[i]));
});

/* ---------- Indexmiete (US-68, § 557b) ---------- */
test("nkIndexErhoehungsbetrag: roher Betrag aus Prozent", () => {
  assert.equal(calc.nkIndexErhoehungsbetrag(800, 2.3).toFixed(2), "18.40");
  assert.equal(calc.nkIndexErhoehungsbetrag(0, 5), 0);
  assert.equal(calc.nkIndexErhoehungsbetrag(800, 0), 0);
});
test("nkIndexNeueMiete: erhöht und auf volle Euro ABGERUNDET", () => {
  assert.equal(calc.nkIndexNeueMiete(800, 2.3), 818);   // 818,40 -> 818
  assert.equal(calc.nkIndexNeueMiete(835, 5), 876);     // 876,75 -> 876
  assert.equal(calc.nkIndexNeueMiete(818, 3), 842);     // 842,54 -> 842 (Verkettung)
  assert.equal(calc.nkIndexNeueMiete(1000, 2), 1020);   // exakt 1020,00
  assert.equal(calc.nkIndexNeueMiete(1000, 1.999), 1019); // 1019,99 -> 1019
  assert.equal(calc.nkIndexNeueMiete(836, 0), 836);     // kein Float-Artefakt
});
test("nkIndexAktuelleMiete: letzte festgesetzte Miete bzw. Ausgangsmiete", () => {
  assert.equal(calc.nkIndexAktuelleMiete(800, []), 800);
  assert.equal(calc.nkIndexAktuelleMiete(800, [{ neueMiete: 818 }, { neueMiete: 842 }]), 842);
  assert.equal(calc.nkIndexAktuelleMiete(800, null), 800);
});
test("nkPlusJahre: Jahre addieren inkl. Schaltjahr-Korrektur", () => {
  assert.equal(calc.nkPlusJahre("2025-01-01", 2), "2027-01-01");
  assert.equal(calc.nkPlusJahre("2024-02-29", 1), "2025-02-28");
  assert.equal(calc.nkPlusJahre("2025-05-15", 0), "2025-05-15");
});
test("nkIndexNaechsteAnpassung: ab Einzug in N-Jahres-Schritten", () => {
  assert.equal(calc.nkIndexNaechsteAnpassung("2025-01-01", 1, 0), "2026-01-01");
  assert.equal(calc.nkIndexNaechsteAnpassung("2025-01-01", 1, 2), "2028-01-01");
  assert.equal(calc.nkIndexNaechsteAnpassung("2025-01-01", 2, 0), "2027-01-01");
  assert.equal(calc.nkIndexNaechsteAnpassung("2025-01-01", 2, 1), "2029-01-01");
});
test("nkIndexFaellig: heute >= nächster Anpassungstermin", () => {
  assert.equal(calc.nkIndexFaellig("2026-01-01", "2026-05-01"), true);
  assert.equal(calc.nkIndexFaellig("2026-01-01", "2026-01-01"), true);
  assert.equal(calc.nkIndexFaellig("2026-01-01", "2025-12-31"), false);
});
test("nkIndexVerwendeterMonat: aktuellster verfügbarer (Fälligkeit minus 2 Monate)", () => {
  assert.equal(calc.nkIndexVerwendeterMonat("2026-05-01"), "2026-03");
  assert.equal(calc.nkIndexVerwendeterMonat("2026-01-15"), "2025-11");
  assert.equal(calc.nkIndexVerwendeterMonat(""), "");
});
test("nkIndexFrequenzGueltig: ganze Jahre >= 1", () => {
  assert.equal(calc.nkIndexFrequenzGueltig(1), true);
  assert.equal(calc.nkIndexFrequenzGueltig(2), true);
  assert.equal(calc.nkIndexFrequenzGueltig(0), false);
  assert.equal(calc.nkIndexFrequenzGueltig(1.5), false);
  assert.equal(calc.nkIndexFrequenzGueltig(-1), false);
});

test("nkIndexAnpassungLoeschen: Eintrag entfernen, Original unverändert", () => {
  const orig = [
    { datum: "2026-05-01", prozent: 2, alteMiete: 1000, neueMiete: 1020 },
    { datum: "2027-05-01", prozent: 2, alteMiete: 1020, neueMiete: 1040 },
  ];
  const ohneLetzten = calc.nkIndexAnpassungLoeschen(orig, 1);
  assert.equal(ohneLetzten.length, 1);
  assert.equal(orig.length, 2);                       // Original bleibt unangetastet
  assert.equal(calc.nkIndexAktuelleMiete(1000, ohneLetzten), 1020);
  const leer = calc.nkIndexAnpassungLoeschen(ohneLetzten, 0);
  assert.equal(leer.length, 0);
  assert.equal(calc.nkIndexAktuelleMiete(1000, leer), 1000); // zurück zur Ausgangsmiete
});
test("nkIndexAnpassungLoeschen: ungültiger Index ändert nichts", () => {
  const arr = [{ neueMiete: 1020 }];
  assert.equal(calc.nkIndexAnpassungLoeschen(arr, 5).length, 1);
  assert.equal(calc.nkIndexAnpassungLoeschen(arr, -1).length, 1);
  assert.equal(calc.nkIndexAnpassungLoeschen(null, 0).length, 0);
});
test("nkIndexNaechsteAnpassung: nach Löschen aller Anpassungen wieder erster Termin", () => {
  // zwei festgesetzt -> nächster Termin einzug+3J; nach Löschen (0) wieder einzug+1J
  assert.equal(calc.nkIndexNaechsteAnpassung("2026-06-17", 1, 2), "2029-06-17");
  assert.equal(calc.nkIndexNaechsteAnpassung("2026-06-17", 1, 0), "2027-06-17");
});

test("nkIndexBasisMonat: Einzugsmonat bzw. letzter verwendeter Monat", () => {
  assert.equal(calc.nkIndexBasisMonat("2025-05-01", []), "2025-05");
  assert.equal(calc.nkIndexBasisMonat("2025-05-01", [{ monat: "2026-03" }]), "2026-03");
  assert.equal(calc.nkIndexBasisMonat("2025-05-01", [{ monat: "2026-03" }, { monat: "2027-02" }]), "2027-02");
  assert.equal(calc.nkIndexBasisMonat("", []), "");
});

/* ---------- Staffelmiete (US-70, § 557a) ---------- */
test("nkStaffelNeueMiete: feste Erhöhung um Eurobetrag (Cent-genau)", () => {
  assert.equal(calc.nkStaffelNeueMiete(1000, 25), 1025);
  assert.equal(calc.nkStaffelNeueMiete(1020.5, 25), 1045.5);
  assert.equal(calc.nkStaffelNeueMiete(1000, 0), 1000);
  assert.equal(calc.nkStaffelNeueMiete(0, 30), 30);
});
test("Staffelmiete: Verkettung über nkIndexAktuelleMiete + Terminierung", () => {
  // Beginn 2025-01-01, alle 2 Jahre, +25 €
  const s1 = calc.nkStaffelNeueMiete(1000, 25);                 // 1025
  const anp = [{ datum: "2027-01-01", betrag: 25, alteMiete: 1000, neueMiete: s1 }];
  assert.equal(calc.nkIndexAktuelleMiete(1000, anp), 1025);
  assert.equal(calc.nkStaffelNeueMiete(calc.nkIndexAktuelleMiete(1000, anp), 25), 1050);
  assert.equal(calc.nkIndexNaechsteAnpassung("2025-01-01", 2, anp.length), "2029-01-01");
});

/* ---------- Stichtag-Modell (US-68/US-70 Redesign) ---------- */
test("nkStichtage: alle Termine Beginn+k×N bis Enddatum", () => {
  assert.deepEqual(calc.nkStichtage("2020-01-01", "2026-01-01", 1),
    ["2021-01-01","2022-01-01","2023-01-01","2024-01-01","2025-01-01","2026-01-01"]);
  assert.deepEqual(calc.nkStichtage("2020-01-01", "2026-01-01", 2),
    ["2022-01-01","2024-01-01","2026-01-01"]);
  assert.deepEqual(calc.nkStichtage("2020-01-01", "", 1), []); // ohne Enddatum keine Liste
});
test("nkStaffelPlan: Zeilen mit alter/neuer Miete je Stichtag", () => {
  const p = calc.nkStaffelPlan("2020-01-01", "2023-01-01", 1, 1000, 10);
  assert.equal(p.length, 3);
  assert.deepEqual(p[0], { nr:1, datum:"2021-01-01", alteMiete:1000, neueMiete:1010 });
  assert.deepEqual(p[2], { nr:3, datum:"2023-01-01", alteMiete:1020, neueMiete:1030 });
});
test("nkStaffelMieteAm: gültige Miete zum Datum", () => {
  const p = calc.nkStaffelPlan("2020-01-01", "2026-01-01", 1, 1000, 10);
  assert.equal(calc.nkStaffelMieteAm(p, 1000, "2019-06-01"), 1000); // vor erstem Stichtag
  assert.equal(calc.nkStaffelMieteAm(p, 1000, "2021-06-01"), 1010);
  assert.equal(calc.nkStaffelMieteAm(p, 1000, "2026-06-17"), 1060); // alle 6 erreicht
});
test("nkMitteilungsfrist: letzter Tag zwei Monate vor Stichtag", () => {
  assert.equal(calc.nkMitteilungsfrist("2027-05-01"), "2027-03-31");
  assert.equal(calc.nkMitteilungsfrist("2027-01-01"), "2026-11-30");
  assert.equal(calc.nkMitteilungsfrist(""), "");
});

test("nkMonatDE: YYYY-MM in deutsche Reihenfolge MM-YYYY", () => {
  assert.equal(calc.nkMonatDE("2022-03"), "03-2022");
  assert.equal(calc.nkMonatDE("2020-11"), "11-2020");
  assert.equal(calc.nkMonatDE(""), "");
  assert.equal(calc.nkMonatDE("kaputt"), "");
});

/* ---------- Zahlungen unterjährig (US-74) ---------- */
test("nkIndexMieteAm: gültige Miete je Datum (letzte Anpassung <= Datum)", () => {
  const anp=[{datum:"2025-05-01",neueMiete:1020},{datum:"2026-05-01",neueMiete:1040}];
  assert.equal(calc.nkIndexMieteAm(1000, anp, "2025-01-15"), 1000);
  assert.equal(calc.nkIndexMieteAm(1000, anp, "2025-05-01"), 1020);
  assert.equal(calc.nkIndexMieteAm(1000, anp, "2026-06-01"), 1040);
});
test("nkMieteAm: Staffel/Index/keine", () => {
  const staf={mhTyp:"staffel",stafBeginn:"2020-01-01",stafEnde:"2026-01-01",stafFrequenz:1,stafAusgangsmiete:1000,stafBetrag:10};
  assert.equal(calc.nkMieteAm(staf,"2019-06-01"),1000);
  assert.equal(calc.nkMieteAm(staf,"2021-06-01"),1010);
  const idx={mhTyp:"index",idxAusgangsmiete:1000,idxAnpassungen:[{datum:"2025-05-01",neueMiete:1020}]};
  assert.equal(calc.nkMieteAm(idx,"2025-06-01"),1020);
  assert.equal(calc.nkMieteAm({grundmiete:800},"2025-06-01"),800);
});
test("nkZahlStatus: offen/teilweise/bezahlt/ueberzahlt", () => {
  assert.equal(calc.nkZahlStatus(0,1190),"offen");
  assert.equal(calc.nkZahlStatus(-5,1190),"offen");        // leer/negativ => offen (rot)
  assert.equal(calc.nkZahlStatus(500,1190),"teilweise");    // < Soll => rot
  assert.equal(calc.nkZahlStatus(1190,1190),"bezahlt");     // = Soll => grün
  assert.equal(calc.nkZahlStatus(1190.004,1190),"bezahlt"); // Cent-Toleranz bleibt bezahlt
  assert.equal(calc.nkZahlStatus(1200,1190),"ueberzahlt");  // > Soll => blau
  assert.equal(calc.nkZahlStatus(1190.02,1190),"ueberzahlt");// knapp über Toleranz => überzahlt
});
test("nkClone: tiefe Kopie, unabhängig vom Original (US-82)", () => {
  const orig = { a:1, liste:[{x:1}], obj:{tief:{y:2}} };
  const kopie = calc.nkClone(orig);
  assert.deepEqual(kopie, orig);
  assert.notEqual(kopie, orig);
  assert.notEqual(kopie.liste, orig.liste);          // eigene Array-Referenz
  kopie.liste[0].x = 99; kopie.obj.tief.y = 99;
  assert.equal(orig.liste[0].x, 1);                  // Original bleibt unberührt
  assert.equal(orig.obj.tief.y, 2);
  assert.equal(calc.nkClone(null), null);
});
test("nkHistCoalesce: schnelles Tippen verschmilzt, sonst neuer Schritt (US-82)", () => {
  assert.equal(calc.nkHistCoalesce(1000, 1200, 500), true);   // 200ms < 500 => ein Schritt
  assert.equal(calc.nkHistCoalesce(1000, 1600, 500), false);  // 600ms >= 500 => neuer Schritt
  assert.equal(calc.nkHistCoalesce(1000, 1500, 500), false);  // genau Fenster => neuer Schritt
  assert.equal(calc.nkHistCoalesce(null, 1200, 500), false);  // kein vorheriger Commit
  assert.equal(calc.nkHistCoalesce(0, 1.7e12, 500), false);   // nach Reset (ts=0) nie verschmelzen
});
test("nkSig: gleiche Daten gleiche Signatur, Änderung ändert sie (US-84)", () => {
  const a = { x:1, liste:[1,2], obj:{ y:2 } };
  assert.equal(calc.nkSig(a), calc.nkSig({ x:1, liste:[1,2], obj:{ y:2 } }));
  assert.notEqual(calc.nkSig(a), calc.nkSig({ x:1, liste:[1,3], obj:{ y:2 } }));
  assert.equal(typeof calc.nkSig(a), "string");
});
test("nkNameAusDateiname: Objektname aus Dateiname (Speicher)", () => {
  // .json-Suffix wird entfernt
  assert.equal(calc.nkNameAusDateiname("Hauptstrasse 5.json"), "Hauptstrasse 5");
  // NeKoFix-Präfix und angehängtes Jahr werden entfernt
  assert.equal(calc.nkNameAusDateiname("NeKoFix-Hauptstrasse 5-2025.json"), "Hauptstrasse 5");
  // nur Präfix
  assert.equal(calc.nkNameAusDateiname("NeKoFix-Mein Objekt.json"), "Mein Objekt");
  // ohne Suffix bleibt unverändert (getrimmt)
  assert.equal(calc.nkNameAusDateiname("  Mein Objekt  "), "Mein Objekt");
  // Jahr nur am Ende, vierstellig
  assert.equal(calc.nkNameAusDateiname("Objekt-2024"), "Objekt");
  assert.equal(calc.nkNameAusDateiname("Objekt-99"), "Objekt-99");
  // leere/fehlende Eingabe
  assert.equal(calc.nkNameAusDateiname(""), "");
  assert.equal(calc.nkNameAusDateiname(null), "");
  assert.equal(calc.nkNameAusDateiname(undefined), "");
  // Speicher: Jahr in anderer Trennform (· / _ ) – aus früherem doppelten Anhängen – wird entfernt
  assert.equal(calc.nkNameAusDateiname("NeKoFix-Lindenhof · 2025.json"), "Lindenhof");
  assert.equal(calc.nkNameAusDateiname("NeKoFix-Lindenhof _ 2025.json"), "Lindenhof");
});
test("nkObjektDateiname: Vorschlag mit genau EINEM Jahr (kein doppeltes Anhängen)", () => {
  // Basisfall: Name + Jahr aus von/bis
  assert.equal(
    calc.nkObjektDateiname({ objekt:{ name:"Lindenhof", von:"2025-01-01", bis:"2025-12-31" } }),
    "NeKoFix-Lindenhof-2025.json");
  // Name enthält bereits ein Jahr (frühere Korruption) -> wird NICHT verdoppelt
  assert.equal(
    calc.nkObjektDateiname({ objekt:{ name:"Lindenhof _ 2025", von:"2025-01-01", bis:"2025-12-31" } }),
    "NeKoFix-Lindenhof-2025.json");
  assert.equal(
    calc.nkObjektDateiname({ objekt:{ name:"Lindenhof · 2024", von:"2024-01-01", bis:"2024-12-31" } }),
    "NeKoFix-Lindenhof-2024.json");
  // Round-Trip stabil: Dateiname -> Name -> Dateiname
  const dn = calc.nkObjektDateiname({ objekt:{ name:"Lindenhof", von:"2025-01-01", bis:"2025-12-31" } });
  const nm = calc.nkNameAusDateiname(dn);
  assert.equal(nm, "Lindenhof");
  assert.equal(
    calc.nkObjektDateiname({ objekt:{ name:nm, von:"2025-01-01", bis:"2025-12-31" } }), dn);
  // ohne Jahr: nur Name
  assert.equal(calc.nkObjektDateiname({ objekt:{ name:"Mein Objekt" } }), "NeKoFix-Mein Objekt.json");
  // Fallback Adresse, dann "Objekt"
  assert.equal(
    calc.nkObjektDateiname({ objekt:{ addr:"Hauptstrasse 5", von:"2023-01-01" } }),
    "NeKoFix-Hauptstrasse 5-2023.json");
  assert.equal(calc.nkObjektDateiname({}), "NeKoFix-Objekt.json");
});
test("nkProzentDelta: prozentuale Veränderung ggü. Vorjahr (US-104)", () => {
  assert.equal(calc.nkProzentDelta(110, 100), 10);
  assert.equal(calc.nkProzentDelta(90, 100), -10);
  assert.equal(calc.nkProzentDelta(1640, 1200), 36.7); // gerundet auf 1 NK
  assert.equal(calc.nkProzentDelta(100, 100), 0);
  assert.equal(calc.nkProzentDelta(100, 0), null);     // kein Bezug (Division durch 0)
  assert.equal(calc.nkProzentDelta(100, ""), null);    // Vorjahr leer -> kein Bezug
  assert.equal(calc.nkProzentDelta("", 100), -100);    // aktuell leer -> 0 -> -100 %
  assert.equal(calc.nkProzentDelta(undefined, 100), null); // NaN -> null
});
test("nkEurProKwh: Ø Energiepreis als Kennzahl (US-95)", () => {
  assert.equal(calc.nkEurProKwh(4620, 42000), 0.11);
  assert.equal(calc.nkEurProKwh(1000, 8000), 0.125);
  assert.equal(calc.nkEurProKwh(1000, 0), null);   // keine Menge -> keine Kennzahl
  assert.equal(calc.nkEurProKwh(1000, ""), null);
  assert.equal(calc.nkEurProKwh("", 8000), 0);     // 0 € / Menge = 0
});
test("nkHeizGrundProzent: Default 30, geklemmt auf 30–50 % (US-94)", () => {
  assert.equal(calc.nkHeizGrundProzent({}), 30);
  assert.equal(calc.nkHeizGrundProzent({ grundProzent: 40 }), 40);
  assert.equal(calc.nkHeizGrundProzent({ grundProzent: 20 }), 30); // Verbrauch max 70 %
  assert.equal(calc.nkHeizGrundProzent({ grundProzent: 60 }), 50); // Verbrauch min 50 %
});
test("nkExpandHeizSplit: Heizblock in Grund (Fläche) + Verbrauch aufteilen (US-94)", () => {
  const E = [{ id:1, name:"A", flaeche:60 }, { id:2, name:"B", flaeche:40 }];
  const heiz = { typ:"heizung", energieart:"erdgas_kwh", bez:"Heizung", betrag:1000, grundProzent:30,
                 schluessel:"flaeche", verbrauch:{ 1:30, 2:70 }, co2Kg:1000, co2Kosten:200 };
  const ex = calc.nkExpandHeizSplit([heiz], E);
  assert.equal(ex.length, 2);
  assert.equal(ex[0]._split, "grund"); assert.equal(ex[0].schluessel, "beheizt"); assert.equal(ex[0].betrag, 300); // US-96: Grundkosten nach beheizter Fläche
  assert.equal(ex[1]._split, "verbrauch"); assert.equal(ex[1].schluessel, "verbrauch"); assert.equal(ex[1].betrag, 700);
  // Betrag- und CO2-Summe bleiben erhalten
  assert.equal(ex[0].betrag + ex[1].betrag, 1000);
  assert.equal(Math.round((ex[0].co2Kg + ex[1].co2Kg)*1e6)/1e6, 1000);
  assert.equal(Math.round((ex[0].co2Kosten + ex[1].co2Kosten)*1e6)/1e6, 200);
  // Anteile je Einheit: A = 300*0,6 + 700*0,3 = 390 ; B = 300*0,4 + 700*0,7 = 610
  assert.equal(Math.round(calc.nkAnteilOf(E[0], [heiz], E)*100)/100, 390);
  assert.equal(Math.round(calc.nkAnteilOf(E[1], [heiz], E)*100)/100, 610);
  // Idempotent: erneutes Expandieren ändert nichts (Teilpositionen tragen _split)
  assert.equal(calc.nkExpandHeizSplit(ex, E).length, 2);
});
test("nkExpandHeizSplit: ohne erfassten Verbrauch -> kein Split (Fallback), Warnung möglich (US-94)", () => {
  const E = [{ id:1, name:"A", flaeche:60 }, { id:2, name:"B", flaeche:40 }];
  const heiz = { typ:"heizung", bez:"Heizung", betrag:1000, schluessel:"flaeche", verbrauch:{} };
  const ex = calc.nkExpandHeizSplit([heiz], E);
  assert.equal(ex.length, 1);                 // nicht aufgeteilt
  assert.equal(calc.nkAnteilOf(E[0], [heiz], E), 600); // reine Flächenverteilung
  assert.equal(calc.nkHeizOhneVerbrauch([heiz], E).length, 1);
  assert.equal(calc.nkHeizSplitAktiv(heiz, E), false);
});
test("US-96: Heiz-Grundkosten nach beheizter Fläche (unbeheizt abgezogen)", () => {
  assert.equal(calc.nkBeheizteFlaeche({ flaeche:100, unbeheizt:20 }), 80);
  assert.equal(calc.nkBeheizteFlaeche({ flaeche:50 }), 50); // ohne unbeheizt = volle Fläche
  assert.equal(calc.nkTotals([{ flaeche:100, unbeheizt:20 }, { flaeche:100 }]).beheizt, 180);
  const E = [{ id:1, name:"A", flaeche:100, unbeheizt:20 }, { id:2, name:"B", flaeche:100 }];
  const heiz = { typ:"heizung", bez:"Heizung", betrag:1000, grundProzent:30, verbrauch:{ 1:50, 2:50 } };
  const a = calc.nkAnteilOf(E[0], [heiz], E), b = calc.nkAnteilOf(E[1], [heiz], E);
  // Grund 300 nach beheizt (80/180,100/180) + Verbrauch 700 je 50% -> A 483,33 ; B 516,67
  assert.equal(Math.round(a*100)/100, 483.33);
  assert.equal(Math.round(b*100)/100, 516.67);
  assert.equal(Math.round((a+b)*100)/100, 1000);
});
test("nkKleinrepWarnungen: Direktkosten je Einheit gegen Schwellen prüfen (US-103)", () => {
  const objekt = { von:"2025-01-01", bis:"2025-12-31" };
  const E = [{ id:1, name:"EG", mv:[{ von:"2025-01-01", bis:"2025-12-31", grundmiete:800 }] }];
  // 5000 € Direktkosten: über Einzelgrenze (100 €) UND über Jahresdeckel (8 % von 9600 = 768 €)
  const w = calc.nkKleinrepWarnungen(E, [{ schluessel:"direkt", direktEinheit:1, bez:"Reparatur", betrag:5000 }], objekt);
  assert.equal(w.length, 2);
  assert.ok(w.some(x => x.art === "jahr" && x.grenze === 768 && x.summe === 5000));
  assert.ok(w.some(x => x.art === "einzel" && x.einzel === 100));
  // kleiner Betrag unter beiden Grenzen -> keine Warnung
  assert.equal(calc.nkKleinrepWarnungen(E, [{ schluessel:"direkt", direktEinheit:1, bez:"Kleinkram", betrag:50 }], objekt).length, 0);
  // ohne Direktkosten -> keine Warnung
  assert.equal(calc.nkKleinrepWarnungen(E, [{ schluessel:"flaeche", betrag:9999 }], objekt).length, 0);
});
test("nkNormName: Umlaut-Faltung und Normalisierung fürs Matching (US-86)", () => {
  // Faltung ä/ö/ü/ß <-> ae/oe/ue/ss an generischen Wörtern (keine echten Namen/Firmen/IBANs).
  assert.equal(calc.nkNormName("Grün"), "gruen");
  assert.equal(calc.nkNormName("Gruen"), "gruen");
  assert.equal(calc.nkNormName("Grün"), calc.nkNormName("Gruen"));
  assert.equal(calc.nkNormName("Grün Test GmbH"), calc.nkNormName("Gruen Test GmbH"));
  assert.equal(calc.nkNormName("Öl & Übung"), "oel uebung");
  assert.equal(calc.nkNormName("groß"), "gross");
  assert.equal(calc.nkNormName("AAA  BBB"), "aaa bbb");
  assert.equal(calc.nkNormName("Straße"), "strasse");
  assert.equal(calc.nkNormName(""), "");
  assert.equal(calc.nkNormName(null), "");
});
test("nkParseDatumDE: deutsches Datum -> ISO (US-85)", () => {
  assert.equal(calc.nkParseDatumDE("29.05.2026"), "2026-05-29");
  assert.equal(calc.nkParseDatumDE("1.1.2025"), "2025-01-01");
  assert.equal(calc.nkParseDatumDE("31.12.2025"), "2025-12-31");
  assert.equal(calc.nkParseDatumDE("foo"), "");
  assert.equal(calc.nkParseDatumDE(""), "");
  assert.equal(calc.nkParseDatumDE("2025-01-01"), "");
});
test("nkParseUmsatzCsv: Kopfzeile/Spalten/Beträge/Umlaute (US-85)", () => {
  const H = "Bezeichnung Auftragskonto;IBAN Auftragskonto;BIC Auftragskonto;Bankname Auftragskonto;" +
    "Buchungstag;Valutadatum;Name Zahlungsbeteiligter;IBAN Zahlungsbeteiligter;" +
    "BIC (SWIFT-Code) Zahlungsbeteiligter;Buchungstext;Verwendungszweck;Betrag;Waehrung;" +
    "Saldo nach Buchung;Bemerkung;Gekennzeichneter Umsatz;Glaeubiger ID;Mandatsreferenz";
  // Dummy-Daten: IBANs aus Nullen, generische Dummy-Namen.
  const z1 = "Konto;DE00000000000000000000;BIC0;Bank;05.05.2025;05.05.2025;Vorname_2 Nachname_2;DE00000000000000000002;BIC2;" +
    "Dauerauftragsgutschr;Miete und Nebenkosten;1075;EUR;26427,37;;;;";
  const z2 = "Konto;DE00000000000000000000;BIC0;Bank;28.11.2025;28.11.2025;Lieferant Zwei GmbH;DE00000000000000000003;BIC3;" +
    "Überweisungsauftrag;Wärmemessdienst Heizkostenabrechnung;-1.281,93;EUR;100,00;;;;";
  // mit optionaler Titelzeile davor + Leerzeile
  const csv = "VB Umsaetze_KontoDummy_2025\r\n" + H + "\r\n" + z1 + "\r\n\r\n" + z2 + "\r\n";
  const r = calc.nkParseUmsatzCsv(csv);
  assert.equal(r.fehler, null);
  assert.equal(r.buchungen.length, 2);                 // Leerzeile übersprungen, Titelzeile ignoriert
  assert.equal(r.konto.iban, "DE00000000000000000000");
  const a = r.buchungen[0], b = r.buchungen[1];
  assert.equal(a.datum, "2025-05-05");
  assert.equal(a.betrag, 1075);                          // positiv -> Zahlungseingang
  assert.equal(a.name, "Vorname_2 Nachname_2");
  assert.equal(b.datum, "2025-11-28");
  assert.equal(b.betrag, -1281.93);                      // negativ, Tausenderpunkt korrekt geparst
  assert.ok(b.zweck.indexOf("Wärmemessdienst") === 0);   // Umlaut erhalten (UTF-8)
  assert.equal(b.buchungstext, "Überweisungsauftrag");
});
test("nkParseUmsatzCsv: ohne Titelzeile und Fehlerfälle (US-85)", () => {
  const H = "Bezeichnung Auftragskonto;IBAN Auftragskonto;BIC Auftragskonto;Bankname Auftragskonto;" +
    "Buchungstag;Valutadatum;Name Zahlungsbeteiligter;IBAN Zahlungsbeteiligter;" +
    "BIC (SWIFT-Code) Zahlungsbeteiligter;Buchungstext;Verwendungszweck;Betrag;Waehrung;" +
    "Saldo nach Buchung;Bemerkung;Gekennzeichneter Umsatz;Glaeubiger ID;Mandatsreferenz";
  const z = "Konto;DE00000000000000000000;BIC0;Bank;15.05.2025;15.05.2025;Amt Musterstadt;DE00000000000000000004;BIC4;Basislastschrift;Grundsteuer Q2;-439,08;EUR;1,0;;;;";
  const ok = calc.nkParseUmsatzCsv(H + "\n" + z);        // ohne Titelzeile, LF
  assert.equal(ok.buchungen.length, 1);
  assert.equal(ok.buchungen[0].betrag, -439.08);
  assert.equal(ok.buchungen[0].name, "Amt Musterstadt");
  const leer = calc.nkParseUmsatzCsv("nur irgendein Text\nohne Kopfzeile");
  assert.ok(leer.fehler);                                // keine Kopfzeile -> Fehler
  assert.equal(leer.buchungen.length, 0);
});
test("nkVorsortierung: Vorzeichen + interne Umbuchung (US-85)", () => {
  assert.equal(calc.nkVorsortierung({ betrag: 1075, buchungstext: "Dauerauftragsgutschr" }), "eingang");
  assert.equal(calc.nkVorsortierung({ betrag: -439.08, buchungstext: "Basislastschrift" }), "kosten");
  // positiver Betrag, aber interne Umbuchung -> ignorieren
  assert.equal(calc.nkVorsortierung({ betrag: 15000, buchungstext: "Spar/Fest/Termingeld" }), "ignorieren");
  assert.equal(calc.nkVorsortierung({ betrag: 0, buchungstext: "" }), "ignorieren");
  // negativer Betrag bleibt Kosten, auch wenn "Termingeld" im Text (Bedingung nur bei >0)
  assert.equal(calc.nkVorsortierung({ betrag: -10, buchungstext: "Termingeld" }), "kosten");
});
test("nkRegelSchluessel: IBAN bevorzugt, sonst normalisierter Name (US-86)", () => {
  assert.deepEqual(calc.nkRegelSchluessel({ iban: "DE00 0000 0000 0000 0000 01", name: "X" }), { schluessel: "DE00000000000000000001", typ: "iban" });
  assert.deepEqual(calc.nkRegelSchluessel({ iban: "", name: "Grün Test" }), { schluessel: "gruen test", typ: "name" });
});
test("nkMatchRegel: IBAN zuerst, dann Name; Umlaut-tolerant (US-86)", () => {
  const regeln = [
    { schluessel: "DE00000000000000000002", typ: "iban", ziel: { art: "mieter", einheitId: 2, mvId: 5 } },
    { schluessel: "gruen test gmbh", typ: "name", ziel: { art: "kosten", bez: "Gartenpflege" } },
  ];
  assert.deepEqual(calc.nkMatchRegel({ iban: "DE00 0000 0000 0000 0000 02", name: "egal" }, regeln), { art: "mieter", einheitId: 2, mvId: 5 });
  // kein IBAN-Treffer -> Name-Fallback, transliteriert matcht Umlaut-Regel
  assert.deepEqual(calc.nkMatchRegel({ iban: "", name: "Grün Test GmbH" }, regeln), { art: "kosten", bez: "Gartenpflege" });
  assert.equal(calc.nkMatchRegel({ iban: "DE00000000000000000009", name: "Unbekannt" }, regeln), null);
  assert.equal(calc.nkMatchRegel({ name: "x" }, []), null);
});
test("nkRegelUpsert: setzen/ersetzen/entfernen ohne Mutation (US-86)", () => {
  const tx = { iban: "DE00000000000000000001", name: "A" };
  let regeln = calc.nkRegelUpsert([], tx, { art: "ignorieren" });
  assert.equal(regeln.length, 1);
  assert.deepEqual(regeln[0].ziel, { art: "ignorieren" });
  // gleicher Schlüssel überschreibt (kein Duplikat)
  const regeln2 = calc.nkRegelUpsert(regeln, tx, { art: "kosten", bez: "Müll" });
  assert.equal(regeln2.length, 1);
  assert.deepEqual(regeln2[0].ziel, { art: "kosten", bez: "Müll" });
  assert.equal(regeln.length, 1); // Original unverändert (keine Mutation)
  // ziel=null entfernt
  assert.equal(calc.nkRegelUpsert(regeln2, tx, null).length, 0);
});
test("nkUmsatzFingerprint: stabil je Buchung, sensibel für Unterschiede (US-86)", () => {
  const a = { buchungstag: "05.05.2025", betrag: 1075, iban: "DE00 0001", zweck: "Miete Mai" };
  assert.equal(calc.nkUmsatzFingerprint(a), calc.nkUmsatzFingerprint({ buchungstag: "05.05.2025", betrag: 1075, iban: "DE000001", zweck: "miete  mai" }));
  assert.notEqual(calc.nkUmsatzFingerprint(a), calc.nkUmsatzFingerprint({ ...a, betrag: 1076 }));
});
test("nkMonatAusZweck: Monat aus Zweck, sonst Buchungstag (US-87)", () => {
  assert.equal(calc.nkMonatAusZweck("Miete Mai 2025", "2025-06-01"), "2025-05");
  assert.equal(calc.nkMonatAusZweck("Miete Mai", "2025-06-15"), "2025-05");       // Jahr aus Datum
  assert.equal(calc.nkMonatAusZweck("Dauerauftrag 03.2025", "2025-06-01"), "2025-03");
  assert.equal(calc.nkMonatAusZweck("Miete und Nebenkosten", "2025-04-05"), "2025-04"); // Fallback Datum
  assert.equal(calc.nkMonatAusZweck("März-Miete", "2025-01-01"), "2025-03");        // Umlaut
  assert.equal(calc.nkMonatAusZweck("Email-Gebuehr", "2025-07-09"), "2025-07");     // kein Fehltreffer auf "mai"
});
test("nkImportPlan: Kosten summiert, Zahlungen je MV/Monat, Dedupe (US-87/88)", () => {
  const regeln = [
    { schluessel: "DE00000000000000000002", typ: "iban", ziel: { art: "mieter", einheitId: 2, mvId: 5 } },
    { schluessel: "DE00000000000000000010", typ: "iban", ziel: { art: "kosten", bez: "Wasser" } },
    { schluessel: "DE00000000000000000099", typ: "iban", ziel: { art: "ignorieren" } },
  ];
  const bs = [
    { buchungstag: "05.05.2025", datum: "2025-05-05", iban: "DE00000000000000000002", betrag: 800, zweck: "Miete Mai" },
    { buchungstag: "26.01.2025", datum: "2025-01-26", iban: "DE00000000000000000010", betrag: -34.5, zweck: "Abschlag Wasser Q1" },
    { buchungstag: "14.04.2025", datum: "2025-04-14", iban: "DE00000000000000000010", betrag: -34.5, zweck: "Abschlag Wasser Q2" },
    { buchungstag: "29.05.2025", datum: "2025-05-29", iban: "DE00000000000000000099", betrag: 15000, zweck: "Termingeld" },
    { buchungstag: "01.01.2025", datum: "2025-01-01", iban: "DE00000000000000000077", betrag: -10, zweck: "Unbekannt" },
  ];
  const plan = calc.nkImportPlan(bs, regeln, { kostenBez: [], gesehen: [] });
  assert.equal(plan.kosten.length, 1);
  assert.equal(plan.kosten[0].bez, "Wasser");
  assert.equal(plan.kosten[0].summe, 69);          // 34,50 + 34,50, abs, summiert
  assert.equal(plan.kosten[0].anzahl, 2);
  assert.deepEqual(plan.neueKosten, ["Wasser"]);   // existiert noch nicht
  assert.equal(plan.zahlungen.length, 1);
  assert.deepEqual(plan.zahlungen[0], { einheitId: 2, mvId: 5, monat: "2025-05", betrag: 800 });
  assert.equal(plan.ignoriert, 1);                 // Termingeld
  assert.equal(plan.offen, 1);                     // Unbekannt (keine Regel)
  assert.equal(plan.fingerprints.length, 3);       // 2 Kosten + 1 Zahlung
  // Dedupe: bereits gesehene Fingerprints werden übersprungen
  const plan2 = calc.nkImportPlan(bs, regeln, { kostenBez: ["Wasser"], gesehen: plan.fingerprints });
  assert.equal(plan2.kosten.length, 0);
  assert.equal(plan2.zahlungen.length, 0);
  assert.deepEqual(plan2.neueKosten, []);
});
test("nkParseUmsatzCsv: Valutadatum-Ersatz + abweichende/unbekannte Namensspalte (US-85)", () => {
  const HEAD = "Bezeichnung Auftragskonto;IBAN Auftragskonto;BIC Auftragskonto;Bankname Auftragskonto;" +
    "Buchungstag;Valutadatum;COLNAME;IBAN Zahlungsbeteiligter;BIC (SWIFT-Code) Zahlungsbeteiligter;" +
    "Buchungstext;Verwendungszweck;Betrag;Waehrung;Saldo nach Buchung;Bemerkung;Gekennzeichneter Umsatz;Glaeubiger ID;Mandatsreferenz";
  // Buchungstag leer -> Datum aus Valutadatum; Namensspalte heißt "COLNAME" (unbekannt) -> Positions-Fallback (Spalte 6)
  const z = "Konto;DE00000000000000000000;BIC0;Bank;;15.05.2025;Amt Musterstadt;DE00000000000000000004;BIC4;Basislastschrift;Grundsteuer Q2;-439,08;EUR;1,0;;;;";
  const r = calc.nkParseUmsatzCsv(HEAD.replace("COLNAME","Beguenstigter/Zahlungspflichtiger") + "\n" + z);
  assert.equal(r.fehler, null);
  assert.equal(r.buchungen.length, 1);
  assert.equal(r.buchungen[0].datum, "2025-05-15");        // aus Valutadatum
  assert.equal(r.buchungen[0].buchungstag, "15.05.2025");
  assert.equal(r.buchungen[0].name, "Amt Musterstadt");    // Alias erkannt
  assert.equal(r.buchungen[0].betrag, -439.08);
  // völlig unbekannte Namensüberschrift -> Positions-Fallback greift (Spalte 6)
  const r2 = calc.nkParseUmsatzCsv(HEAD + "\n" + z);
  assert.equal(r2.buchungen[0].name, "Amt Musterstadt");
});
test("nkImportPlan: gelöschte Kostenart wird per Re-Import wiederhergestellt (US-88)", () => {
  const regeln = [
    { schluessel: "DE00000000000000000010", typ: "iban", ziel: { art: "kosten", bez: "Wasser" } },
    { schluessel: "DE00000000000000000002", typ: "iban", ziel: { art: "mieter", einheitId: 2, mvId: 5 } },
  ];
  const bs = [
    { buchungstag: "26.01.2025", datum: "2025-01-26", iban: "DE00000000000000000010", betrag: -34.5, zweck: "Abschlag Wasser Q1" },
    { buchungstag: "05.05.2025", datum: "2025-05-05", iban: "DE00000000000000000002", betrag: 800, zweck: "Miete Mai" },
  ];
  const erst = calc.nkImportPlan(bs, regeln, { kostenBez: [], gesehen: [] });
  // Re-Import, Kostenart "Wasser" existiert noch -> übersprungen (kein Doppel)
  const wiederVorhanden = calc.nkImportPlan(bs, regeln, { kostenBez: ["Wasser"], gesehen: erst.fingerprints });
  assert.equal(wiederVorhanden.kosten.length, 0);
  assert.equal(wiederVorhanden.zahlungen.length, 0);
  // Re-Import, "Wasser" wurde gelöscht (nicht in kostenBez) -> wird wiederhergestellt; Zahlung bleibt übersprungen
  const nachLoeschen = calc.nkImportPlan(bs, regeln, { kostenBez: [], gesehen: erst.fingerprints });
  assert.equal(nachLoeschen.kosten.length, 1);
  assert.equal(nachLoeschen.kosten[0].bez, "Wasser");
  assert.equal(nachLoeschen.kosten[0].summe, 34.5);
  assert.deepEqual(nachLoeschen.neueKosten, ["Wasser"]);
  assert.equal(nachLoeschen.zahlungen.length, 0);
});
test("nkArrMove: Element verschieben ohne Mutation (US-89)", () => {
  const a = ["A", "B", "C", "D"];
  assert.deepEqual(calc.nkArrMove(a, 0, 2), ["B", "C", "A", "D"]);
  assert.deepEqual(calc.nkArrMove(a, 3, 0), ["D", "A", "B", "C"]);
  assert.deepEqual(a, ["A", "B", "C", "D"]);            // Original unverändert
  assert.deepEqual(calc.nkArrMove(a, 1, 99), ["A", "C", "D", "B"]); // to geklemmt
  assert.deepEqual(calc.nkArrMove(a, 9, 0), ["A", "B", "C", "D"]);  // ungültiges from
});
test("nkRubrikenListe: objekt-eigene Liste, sonst Default; benutzte ergänzt (US-89)", () => {
  // Default, wenn objekt.rubriken fehlt
  assert.deepEqual(calc.nkRubrikenListe({}, []), calc.NK_RUBRIKEN);
  // objekt-eigene Reihenfolge wird genutzt
  const obj = { rubriken: ["Betriebskosten", "Heizkosten"] };
  assert.deepEqual(calc.nkRubrikenListe(obj, []), ["Betriebskosten", "Heizkosten"]);
  // eine benutzte, aber nicht gelistete Rubrik wird hinten ergänzt
  const k = [{ bez: "X", rubrik: "Garten" }];
  assert.deepEqual(calc.nkRubrikenListe(obj, k), ["Betriebskosten", "Heizkosten", "Garten"]);
});
test("nkListeEinsortieren: per id vor Ziel einsortieren, sonst ans Ende (US-89 Phase 2)", () => {
  const items = [{id:1},{id:2},{id:3},{id:4}];
  // 4 vor 2 einsortieren
  assert.deepEqual(calc.nkListeEinsortieren(items, 4, 2).map(x=>x.id), [1,4,2,3]);
  // 1 vor 4
  assert.deepEqual(calc.nkListeEinsortieren(items, 1, 4).map(x=>x.id), [2,3,1,4]);
  // zielId null -> ans Ende
  assert.deepEqual(calc.nkListeEinsortieren(items, 2, null).map(x=>x.id), [1,3,4,2]);
  // unbekanntes Ziel -> ans Ende
  assert.deepEqual(calc.nkListeEinsortieren(items, 2, 99).map(x=>x.id), [1,3,4,2]);
  // unbekanntes drag -> unverändert; Original nicht mutiert
  assert.deepEqual(calc.nkListeEinsortieren(items, 99, 1).map(x=>x.id), [1,2,3,4]);
  assert.deepEqual(items.map(x=>x.id), [1,2,3,4]);
});
test("nkFreischaltCode/Gueltig: an Objekt+Jahr gebunden, offline prüfbar (US-40)", () => {
  const obj = { name: "Vorname_1 Nachname_1", von: "2025-01-01", bis: "2025-12-31" };
  const code = calc.nkFreischaltCode(obj);
  assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);            // Format XXXX-XXXX
  assert.equal(calc.nkFreischaltGueltig(code, obj), true);    // korrekter Code
  assert.equal(calc.nkFreischaltGueltig(code.toLowerCase().replace('-',' '), obj), true); // tolerant (Klein/Trenner)
  assert.equal(calc.nkFreischaltGueltig("XXXX-YYYY", obj), false); // falscher Code
  assert.equal(calc.nkFreischaltGueltig("", obj), false);     // leer
  // anderes Jahr -> anderer Code (Bindung an Jahr)
  assert.notEqual(calc.nkFreischaltCode(obj), calc.nkFreischaltCode({ ...obj, von: "2026-01-01", bis: "2026-12-31" }));
  // anderes Objekt -> anderer Code
  assert.notEqual(calc.nkFreischaltCode(obj), calc.nkFreischaltCode({ ...obj, name: "Anderes Objekt" }));
});
test("nkVorjahrUebernehmen: Freischaltung wird NICHT ins Folgejahr übernommen (US-40)", () => {
  const src = { objekt: { addr: "Teststr. 1", name: "Obj", von: "2025-01-01", bis: "2025-12-31", freigeschaltet: true },
    einheiten: [{ id: 1, name: "EG", flaeche: 70, personen: 2, mv: [{ mieter: "M", von: "2025-01-01", bis: "2025-12-31", vmonat: 0, vmonate: 12, voraus: 0 }] }], kosten: [] };
  const neu = calc.nkVorjahrUebernehmen(src);
  assert.equal(neu.objekt.freigeschaltet, false);   // Folgejahr eigenständig zu bezahlen
  assert.equal(neu.objekt.von, "2026-01-01");
});

test("nkObjektJahr: Jahr aus von/bis", () => {
  assert.equal(calc.nkObjektJahr({ objekt: { von: "2025-01-01", bis: "2025-12-31" } }), "2025");
  assert.equal(calc.nkObjektJahr({ objekt: { bis: "2024-12-31" } }), "2024");
  assert.equal(calc.nkObjektJahr({ objekt: {} }), "");
  assert.equal(calc.nkObjektJahr(null), "");
});

test("nkFindVorjahr: gleiche Adresse, Jahr-1", () => {
  const objekte = [
    { objekt: { addr: "Musterstr. 1", von: "2024-01-01", bis: "2024-12-31" }, kosten: [] }, // Vorjahr
    { objekt: { addr: "Musterstr. 1", von: "2025-01-01", bis: "2025-12-31" }, kosten: [] }, // aktiv
    { objekt: { addr: "Andere Str. 9", von: "2024-01-01", bis: "2024-12-31" }, kosten: [] }, // anderes Objekt
  ];
  const vj = calc.nkFindVorjahr(objekte, 1);
  assert.equal(vj && vj.objekt.von, "2024-01-01");
  // Umlaut-Toleranz in der Adresse (nkNormName)
  const o2 = [
    { objekt: { addr: "Grüner Weg 2", von: "2024-01-01" }, kosten: [] },
    { objekt: { addr: "Gruener Weg 2", von: "2025-01-01" }, kosten: [] },
  ];
  assert.ok(calc.nkFindVorjahr(o2, 1));
  // kein Vorjahr vorhanden
  assert.equal(calc.nkFindVorjahr([objekte[1]], 0), null);
});

test("nkVorjahrKostenMap: Beträge je normalisierter Bezeichnung summiert", () => {
  const snap = { kosten: [
    { bez: "Heizkosten", betrag: 1180 },
    { bez: "Wasser", betrag: 410 },
    { bez: "heizkosten", betrag: 20 }, // gleiche Bezeichnung (Groß/Klein) -> summiert
    { bez: "", betrag: 99 },           // ohne Bezeichnung -> ignoriert
  ] };
  const m = calc.nkVorjahrKostenMap(snap);
  assert.equal(m[calc.nkNormName("Heizkosten")], 1200);
  assert.equal(m[calc.nkNormName("Wasser")], 410);
  assert.equal(Object.keys(m).length, 2);
});

test("nkVorjahrEinheit / nkVorjahrVmonat: Match über Einheit-/Mieternamen", () => {
  const snap = { einheiten: [
    { name: "EG links", flaeche: 70, personen: 2, mv: [{ mieter: "Müller", vmonat: 150 }] },
    { name: "OG", flaeche: 55, personen: 1, mv: [{ mieter: "Schmidt", vmonat: 120 }, { mieter: "Klein", vmonat: 90 }] },
  ] };
  assert.equal(calc.nkVorjahrEinheit(snap, "eg links").flaeche, 70);   // normalisiert
  assert.equal(calc.nkVorjahrEinheit(snap, "Gibtsnicht"), null);
  assert.equal(calc.nkVorjahrVmonat(snap, "EG links", "Mueller"), 150); // Umlaut-Toleranz im Mieter
  assert.equal(calc.nkVorjahrVmonat(snap, "OG", "Klein"), 90);          // zweites MV per Mieter
  assert.equal(calc.nkVorjahrVmonat(snap, "OG", "Unbekannt"), 120);     // Fallback: erstes MV
  assert.equal(calc.nkVorjahrVmonat(snap, "weg", "x"), null);           // Einheit fehlt
});

test("nkVorjahrMv: Mietverhältnis je Einheit über Position", () => {
  const snap = { einheiten: [
    { name: "EG", mv: [{ mieter: "Alt-Mieter", von: "2024-01-01", bis: "2024-12-31" }] },
    { name: "OG", mv: [{ mieter: "A" }, { mieter: "B" }] },
  ] };
  assert.equal(calc.nkVorjahrMv(snap, "eg", 0).mieter, "Alt-Mieter");
  assert.equal(calc.nkVorjahrMv(snap, "OG", 1).mieter, "B");
  assert.equal(calc.nkVorjahrMv(snap, "OG", 2), null); // Position fehlt
  assert.equal(calc.nkVorjahrMv(snap, "weg", 0), null); // Einheit fehlt
});

test("nkVorjahrHeizblock: Heizblock über Bezeichnung", () => {
  const snap = { kosten: [
    { typ: "heizung", bez: "Heizung (Erdgas)", menge: 1200, preis: 0.09, betrag: 108 },
    { bez: "Grundsteuer", betrag: 300 },
  ] };
  assert.equal(calc.nkVorjahrHeizblock(snap, "Heizung (Erdgas)").menge, 1200);
  assert.equal(calc.nkVorjahrHeizblock(snap, "Grundsteuer"), null); // keine Heizung
  assert.equal(calc.nkVorjahrHeizblock(snap, "gibtsnicht"), null);
});

/* US-115: Golden-Master über den realitätsnahen Lindenhof-Datensatz. Sichert ab, dass sich die
   Abrechnung (Verteilung, Heizungs-Grund/Verbrauch-Split, USt, CO2, Summen, Saldo) nicht unbemerkt
   ändert. Die Fixture (lindenhof-2025.fixture.json) enthält gemischte Vorsteuersätze, einen
   Heizblock mit Verbrauch je Einheit und einen gewerblichen Mieter. Ändert sich die Rechenlogik
   bewusst, wird `erwartet` mit Begründung aktualisiert (nicht stillschweigend). */
test("Golden-Master: Lindenhof-Abrechnung bleibt stabil (US-115)", () => {
  const d = require("./lindenhof-2025.fixture.json");
  const r2 = n => Math.round((+n || 0) * 100) / 100;
  const ab = calc.nkObjektAbrechnung(d.einheiten, d.kosten, d.objekt);
  const snap = {
    summeAnteil: r2(ab.summeAnteil), summeVoraus: r2(ab.summeVoraus), summeSaldo: r2(ab.summeSaldo),
    einheiten: ab.einheiten.map(e => ({
      name: e.name, unitShare: r2(e.unitShare), leerstandBetrag: r2(e.leerstandBetrag),
      mv: e.mietverhaeltnisse.map(m => ({ mieter: m.mieter, gewerblich: !!m.gewerblich, netto: r2(m.netto), ust: r2(m.ust), brutto: r2(m.brutto), saldo: r2(m.saldo) }))
    }))
  };
  const erwartet = {
    summeAnteil: 14192.51, summeVoraus: 6820, summeSaldo: 7372.51,
    einheiten: [
      { name: "EG links", unitShare: 3544.02, leerstandBetrag: 0, mv: [
        { mieter: "Familie Brandt", gewerblich: false, netto: 3544.02, ust: 0, brutto: 3476.5, saldo: 1676.5 } ] },
      { name: "EG rechts", unitShare: 2705.81, leerstandBetrag: 0, mv: [
        { mieter: "Frau Yilmaz", gewerblich: false, netto: 2705.81, ust: 0, brutto: 2654.51, saldo: 1214.51 } ] },
      { name: "1. OG", unitShare: 4378.21, leerstandBetrag: 359.85, mv: [
        { mieter: "Herr Novak", gewerblich: false, netto: 2914.81, ust: 0, brutto: 2859.94, saldo: 1499.94 },
        { mieter: "Familie Schäfer", gewerblich: false, netto: 1103.55, ust: 0, brutto: 1082.78, saldo: 542.78 } ] },
      { name: "DG", unitShare: 3601.96, leerstandBetrag: 0, mv: [
        { mieter: "Herr Petersen", gewerblich: true, netto: 3212.35, ust: 610.35, brutto: 3758.93, saldo: 2078.93 } ] }
    ]
  };
  assert.deepEqual(snap, erwartet);
});
