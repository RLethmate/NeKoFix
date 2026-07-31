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

/* Mutationstest-Fund (2026-07-14) + Spec-Konformität (US-06 AC: "leer = ganzer
   Abrechnungszeitraum"): ist nur EINES der beiden Zeitraumfelder gesetzt, muss die Position wie
   eine normale (nicht teilzeitraum-begrenzte) Position über den vollen Mietzeitraum verteilt
   werden, statt mit einem undefinierten Ende zu rechnen. */
test("Position mit nur EINEM gesetzten Zeitraumfeld (von ohne bis) fällt auf die volle Mietzeit zurück", () => {
  const objekt = { von: "2025-01-01", bis: "2025-12-31" };
  const einheiten = [{ id: 1, name: "EG", flaeche: 100, personen: 1, mv: [{ mieter: "A", von: "2025-01-01", bis: "2025-12-31", voraus: 0 }] }];
  const kosten = [{ bez: "Gas", betrag: 600, schluessel: "flaeche", von: "2025-01-01" }]; // bis fehlt
  const mvs = calc.nkObjektAbrechnung(einheiten, kosten, objekt).einheiten[0].mietverhaeltnisse;
  assert.ok(Math.abs(mvs[0].brutto - 600) < 1e-6); // volles Jahr, volle Fläche -> voller Betrag, kein Bruch
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

test("nkFmtZahl: Tausenderpunkt ohne erzwungene Nachkommastellen (US-121-Nachschliff)", () => {
  assert.equal(calc.nkFmtZahl(1234), "1.234");
  assert.equal(calc.nkFmtZahl(70), "70");
  assert.equal(calc.nkFmtZahl(0), "0");
  assert.equal(calc.nkFmtZahl(1234.5), "1.234,5");
  // Rundtrip mit dem generischen Parser (kein eigener Zahl-Parser nötig)
  assert.equal(calc.nkParseBetrag(calc.nkFmtZahl(12345)), 12345);
});

test("nkFmtIban: 4er-Gruppierung unabhängig von Groß-/Kleinschreibung und Leerzeichen (US-121-Nachschliff)", () => {
  assert.equal(calc.nkFmtIban("DE36000000000000000000"), "DE36 0000 0000 0000 0000 00");
  assert.equal(calc.nkFmtIban("de36 0000 0000 0000 0000 00"), "DE36 0000 0000 0000 0000 00");
  assert.equal(calc.nkFmtIban(""), "");
});

test("nkSplitAdresse/nkJoinAdresse: Straße/PLZ/Ort getrennt eingeben, kombinierte Zeile bleibt gleich (Ralf-Feedback 2026-07-06)", () => {
  assert.deepEqual(calc.nkSplitAdresse("Musterstraße 12, 12345 Musterstadt"), { strasse: "Musterstraße 12", plz: "12345", ort: "Musterstadt" });
  assert.deepEqual(calc.nkSplitAdresse(""), { strasse: "", plz: "", ort: "" });
  assert.deepEqual(calc.nkSplitAdresse("Nur eine Straße ohne Rest"), { strasse: "Nur eine Straße ohne Rest", plz: "", ort: "" });
  assert.equal(calc.nkJoinAdresse("Musterstraße 12", "12345", "Musterstadt"), "Musterstraße 12, 12345 Musterstadt");
  assert.equal(calc.nkJoinAdresse("Musterstraße 12", "", ""), "Musterstraße 12");
  assert.equal(calc.nkJoinAdresse("", "", ""), "");
  // Rundtrip: bestehende kombinierte Adressen (z. B. Altdaten) zerlegen und wieder zusammensetzen ergibt dieselbe Zeile
  const addr = "Musterstraße 12, 12345 Musterstadt";
  const s = calc.nkSplitAdresse(addr);
  assert.equal(calc.nkJoinAdresse(s.strasse, s.plz, s.ort), addr);
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

/* Ralf-Vorgabe 2026-07-14: "bis aktueller Monat" (US-83) lässt schon VOR dem Anlegen des
   Folgejahres Zahlungen für Monate des neuen Kalenderjahres im ALTEN Objekt erfassen (z. B. Objekt
   2025, aber es ist schon Mitte 2026) - diese Erfassung darf beim "Neues Jahr aus Objekt…" nicht
   verloren gehen, weil es dabei um hohe Summen gehen kann. Alte Monate (2025) werden bewusst NICHT
   übernommen (die bleiben im alten Objekt korrekt stehen). */
test("nkVorjahrUebernehmen: bereits erfasste Zahlungen für Monate des NEUEN Jahres bleiben erhalten (US-83/US-74)", () => {
  const src = {
    objekt: { addr: "Teststr. 1", von: "2025-01-01", bis: "2025-12-31" },
    einheiten: [
      { id: 1, name: "EG", flaeche: 70, personen: 2, mv: [
        {
          mieter: "Nachname_3", von: "2025-01-01", bis: "2025-12-31", laeuft: true, vmonat: 150, vmonate: 12, voraus: 1800,
          bezahlt: { "2025-12": true, "2026-01": true, "2026-02": true },
          erhalten: { "2025-12": 150, "2026-01": 150, "2026-02": 150 },
          sollSnap: { "2025-12": 150, "2026-01": 150, "2026-02": 150 }
        }
      ]}
    ],
    kosten: [],
    zahlung: { iban: "DE12", empfaenger: "V" }
  };
  const neu = calc.nkVorjahrUebernehmen(src);
  const m = neu.einheiten[0].mv[0];
  assert.deepEqual(m.bezahlt, { "2026-01": true, "2026-02": true });
  assert.deepEqual(m.erhalten, { "2026-01": 150, "2026-02": 150 });
  assert.deepEqual(m.sollSnap, { "2026-01": 150, "2026-02": 150 });
  // altes Objekt (Quelle) bleibt unverändert – kein Verlust dort
  assert.deepEqual(src.einheiten[0].mv[0].bezahlt, { "2025-12": true, "2026-01": true, "2026-02": true });
});
test("nkMonatMapFuerZeitraum: filtert Monatsschlüssel (YYYY-MM) auf den angegebenen Zeitraum", () => {
  const map = { "2025-11": 1, "2025-12": 2, "2026-01": 3, "2026-06": 4, "2026-12": 5, "2027-01": 6 };
  assert.deepEqual(calc.nkMonatMapFuerZeitraum(map, "2026-01-01", "2026-12-31"), { "2026-01": 3, "2026-06": 4, "2026-12": 5 });
  assert.deepEqual(calc.nkMonatMapFuerZeitraum(null, "2026-01-01", "2026-12-31"), {});
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
  assert.equal(ab.co2.informativ, false);
});

/* Ralf-Fund 2026-07-13 (Rechenkette einer echten Techem-Abrechnung): "Anlieferung Brennstoff ./.
   CO2-Kosten Vermieter = Verbrauch" – der Vermieteranteil ist beim Techem-Import bereits VOR der
   Heizung/Warmwasser-Aufteilung vom Brennstoffpreis abgezogen, "Ihre Heizkosten" (und damit der
   importierte Betrag) sind schon netto davon. co2Informativ=true (von techem.js gesetzt) darf den
   Mieterbetrag deshalb NICHT nochmal mindern – nur informativ in kostenMieter/abzugGesamt zeigen. */
test("CO2: co2Informativ (Techem-Import) mindert den Betrag NICHT – nur zur Anzeige", () => {
  const E = [{ id: 1, flaeche: 50, personen: 1 }, { id: 2, flaeche: 50, personen: 1 }];
  const K = [{ bez: "Heizung", betrag: 2000, schluessel: "flaeche", typ: "heizung", energieart: "erdgas_kwh", co2Kg: 2400, co2Kosten: 300, co2Informativ: true }];
  const o = { von: "2025-01-01", bis: "2025-12-31" };
  const m = { mieter: "A", von: "2025-01-01", bis: "2025-12-31", voraus: 0 };
  const ab = calc.nkMieterAbrechnung(E[0], m, K, o, E);
  assert.ok(Math.abs(ab.co2.kostenMieter - 150) < 1e-9);   // weiterhin berechnet (Anzeige)
  assert.ok(Math.abs(ab.co2.abzugGesamt - 45) < 1e-9);     // informativer Gesamtwert
  assert.equal(ab.co2.abzug, 0);                            // aber NICHT tatsächlich abgezogen
  assert.equal(ab.brutto, ab.bruttoVorCo2);                 // Betrag unverändert
  assert.equal(ab.co2.informativ, true);
});

/* US-07 Fix 2026-07-13 (Ralf-Fund anhand einer echten Techem-Abrechnung): der CO2-Mieteranteil
   einer Heizungs-Position folgt "Ihr Anteil an den Gesamtkosten" DIESER Position (Fläche- UND
   Verbrauchs-Anteil gewichtet nach Grundkosten-%), NICHT dem Fläche- oder Verbrauchs-Anteil allein –
   sonst würde er bei sehr unterschiedlichen Fläche-/Verbrauchsanteilen falsch. */
test("nkHeizBlockMieterProzent: Grund-/Verbrauchs-gewichteter Anteil, nicht Fläche oder Verbrauch allein", () => {
  const E = [{ id: 1, flaeche: 80 }, { id: 2, flaeche: 20 }]; // E1 hat 80% der Fläche
  const k = { betrag: 1000, typ: "heizung", grundProzent: 30, verbrauch: { 1: 10, 2: 90 } }; // E1 nur 10% des Verbrauchs
  const p1 = calc.nkHeizBlockMieterProzent(k, E[0], E);
  // 30 % Grund nach Fläche (80 %) + 70 % Verbrauch nach Zähler (10 %) = 0,3*0,8 + 0,7*0,1 = 0,31
  assert.ok(Math.abs(p1 - 0.31) < 1e-9);
  const p2 = calc.nkHeizBlockMieterProzent(k, E[1], E);
  assert.ok(Math.abs(p2 - 0.69) < 1e-9);
  assert.ok(Math.abs(p1 + p2 - 1) < 1e-9); // beide Anteile ergeben zusammen 100 %
});
/* Der eigentliche Ralf-Fund: Warmwasser bekam beim Techem-Import bislang GAR KEIN CO2 zugeordnet
   (nur der Heizungs-Block), obwohl Techem die Gebäude-CO2-Abgabe auf beide Positionen aufteilt (s.
   techem.js techemHeizBlockUebernehmen). Hier rein rechnerisch: zwei unabhängige fossile
   Heizblöcke müssen sich zum CO2-Mieteranteil addieren. */
test("CO2: Mieteranteil summiert sich über MEHRERE fossile Heizblöcke (Heizung + Warmwasser)", () => {
  const E = [{ id: 1, flaeche: 50, personen: 1 }, { id: 2, flaeche: 50, personen: 1 }];
  const K = [
    { bez: "Heizung", betrag: 2000, schluessel: "flaeche", typ: "heizung", energieart: "erdgas_kwh", co2Kg: 2000, co2Kosten: 250 },
    { bez: "Warmwasser", betrag: 500, schluessel: "flaeche", typ: "heizung", energieart: "erdgas_kwh", co2Kg: 400, co2Kosten: 50 }
  ];
  const o = { von: "2025-01-01", bis: "2025-12-31" };
  const m = { mieter: "A", von: "2025-01-01", bis: "2025-12-31", voraus: 0 };
  const ab = calc.nkMieterAbrechnung(E[0], m, K, o, E);
  // je 50 % Fläche -> 50 % von (250+50) = 150; Abzug 30 % davon = 45
  assert.ok(Math.abs(ab.co2.kostenMieter - 150) < 1e-9);
  assert.ok(Math.abs(ab.co2.abzug - 45) < 1e-9);
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

/* Mutationstest-Fund (2026-07-14, Stryker): typ==="heizung" und die Fossil-Prüfung wurden bisher
   nicht einzeln abgesichert – co2Kosten auf einer NICHT-Heizungs-Kostenart (z. B. versehentlich
   gesetztes Feld) durfte nicht in die CO2-Aufteilung einfließen. */
test("CO2: co2Kosten/Energieart auf einer Nicht-Heizungs-Kostenart zählen NICHT (nur typ==='heizung')", () => {
  const E = [{ id: 1, flaeche: 100, personen: 1 }];
  const K = [{ bez: "Sonstiges", betrag: 500, schluessel: "flaeche", typ: "sonstige", energieart: "erdgas_kwh", co2Kosten: 80 }];
  const o = { von: "2025-01-01", bis: "2025-12-31" };
  const m = { mieter: "A", von: "2025-01-01", bis: "2025-12-31", voraus: 0 };
  const ab = calc.nkMieterAbrechnung(E[0], m, K, o, E);
  assert.equal(ab.co2.aktiv, false);
  assert.equal(ab.co2.kostenMieter, 0);
  assert.equal(ab.co2.abzug, 0);
});

/* Mutationstest-Fund (2026-07-14): fehlendes co2Kosten an einem fossilen Heizblock (z. B.
   unvollständiger Import) darf nicht zu NaN im Mieteranteil führen – der Eligibilitäts-Check
   (+k.co2Kosten||0)>0 muss VOR der Verwendung von +k.co2Kosten in der Berechnung greifen. */
test("CO2: fossiler Heizblock ohne co2Kosten ergibt 0, nicht NaN", () => {
  const E = [{ id: 1, flaeche: 100, personen: 1 }];
  const K = [{ bez: "Heizung", betrag: 2000, schluessel: "flaeche", typ: "heizung", energieart: "erdgas_kwh", co2Kg: 2400 }]; // kein co2Kosten
  const o = { von: "2025-01-01", bis: "2025-12-31" };
  const m = { mieter: "A", von: "2025-01-01", bis: "2025-12-31", voraus: 0 };
  const ab = calc.nkMieterAbrechnung(E[0], m, K, o, E);
  assert.equal(ab.co2.kostenMieter, 0);
  assert.equal(ab.co2.abzug, 0);
  assert.ok(!Number.isNaN(ab.brutto));
});

/* Mutationstest-Fund (2026-07-14): die CO2-Umlage eines Heizblocks mit EIGENEM Teilzeitraum
   (US-06) muss über DIESEN Zeitraum anteilig berechnet werden, nicht über den vollen
   Mietverhältnis-Zeitraum – sonst bekäme ein Mieter CO2-Kosten für eine Heizperiode angerechnet,
   in der er noch gar nicht eingezogen war. */
test("CO2: Heizblock mit eigenem Teilzeitraum – kein CO2-Anteil, wenn der Mieter erst NACH dessen Ende einzieht", () => {
  const E = [{ id: 1, flaeche: 100, personen: 1 }];
  const K = [{ bez: "Heizung (Gas, 1. Halbjahr)", betrag: 1000, schluessel: "flaeche", typ: "heizung", energieart: "erdgas_kwh", co2Kg: 1000, co2Kosten: 200, von: "2025-01-01", bis: "2025-06-30" }];
  const o = { von: "2025-01-01", bis: "2025-12-31" };
  const m = { mieter: "A", von: "2025-07-01", bis: "2025-12-31", voraus: 0 }; // Einzug NACH Ende des Heizblocks
  const ab = calc.nkMieterAbrechnung(E[0], m, K, o, E);
  assert.equal(ab.co2.kostenMieter, 0);
  assert.equal(ab.co2.abzug, 0);
});

/* Spec-Konformität (US-06 AC: "leer = ganzer Abrechnungszeitraum") + Mutationstest-Fund: ist NUR
   von ODER NUR bis eines Heizblocks gesetzt (unvollständiger Teilzeitraum), muss die CO2-Umlage
   auf den vollen Zeitanteil zurückfallen statt mit einem undefinierten Ende zu rechnen. */
test("CO2: Heizblock mit nur EINEM gesetzten Zeitraumfeld (von ohne bis) fällt auf den vollen Zeitanteil zurück", () => {
  const E = [{ id: 1, flaeche: 100, personen: 1 }];
  const K = [{ bez: "Heizung (Gas, seit Umstellung)", betrag: 1000, schluessel: "flaeche", typ: "heizung", energieart: "erdgas_kwh", co2Kg: 1000, co2Kosten: 200, von: "2025-01-01" }]; // bis fehlt
  const o = { von: "2025-01-01", bis: "2025-12-31" };
  const m = { mieter: "A", von: "2025-01-01", bis: "2025-12-31", voraus: 0 };
  const ab = calc.nkMieterAbrechnung(E[0], m, K, o, E);
  // volles Jahr, ganze Fläche -> voller CO2-Mieteranteil, kein Bruch durch das fehlende "bis"
  assert.ok(Math.abs(ab.co2.kostenMieter - 200) < 1e-9);
});

test("CO2: Erläuterungstext nennt den greifenden Fall", () => {
  assert.ok(/Wohngeb/.test(calc.nkCo2Erklaerung({ aktiv: true, fall: "wohnen", stufe: 4, spez: 24, vermieterProzent: 30, denkmal: false })));
  assert.ok(/Gewerbe/.test(calc.nkCo2Erklaerung({ aktiv: true, fall: "gewerbe", vermieterProzent: 50, denkmal: false })));
  assert.ok(/halbiert/.test(calc.nkCo2Erklaerung({ aktiv: true, fall: "wohnen", stufe: 4, spez: 24, vermieterProzent: 15, denkmal: true })));
  assert.ok(/Keine/.test(calc.nkCo2Erklaerung({ aktiv: false })));
});
/* Ralf-Vorgabe 2026-07-13: "Davon trägt der Vermieter: 0,00 €" ist bei 0 % Vermieteranteil (Stufe 1)
   kein sinnvoller Hinweis und muss entfallen. */
test("nkCo2VermieterHinweis: null bei 0 % Vermieteranteil, sonst passender Erläuterungstext", () => {
  assert.equal(calc.nkCo2VermieterHinweis({ abzugGesamt: 0 }), null);
  assert.equal(calc.nkCo2VermieterHinweis(null), null);
  assert.ok(/abgezogen/.test(calc.nkCo2VermieterHinweis({ abzugGesamt: 45, informativ: false })));
  assert.ok(/enthalten/.test(calc.nkCo2VermieterHinweis({ abzugGesamt: 45, informativ: true })));
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
  // Mutationstest-Fund (2026-07-14): das arbeitskosten-Feld JE POSITION (Anzeige in der
  // Volltabelle, US-62) muss den tatsächlichen Positionsbetrag zeigen, nicht nur die Summe stimmen.
  assert.equal(dl.find(p => p.bez === "Hausmeister").arbeitskosten, 800);
  assert.equal(hw.find(p => p.bez === "Heizungswartung").arbeitskosten, 300);
});

/* Mutationstest-Fund (2026-07-14): "aktiv" muss auf JEDER positiven Summe beruhen (Dienstleistung
   + Handwerker), nicht auf einer Differenz – sonst kippt das Flag fälschlich auf false, sobald der
   Handwerkeranteil größer als der Dienstleistungsanteil ist. */
test("§35a: aktiv bleibt true, auch wenn Handwerkeranteil größer als Dienstleistungsanteil", () => {
  const E = [{ id: 1, flaeche: 100, personen: 1 }];
  const K = [
    { bez: "Hausmeister", betrag: 200, schluessel: "flaeche", arbeitskosten: 100 },       // Dienstleistung, klein
    { bez: "Heizungswartung", betrag: 800, schluessel: "flaeche", arbeitskosten: 600 }    // Handwerker, groß
  ];
  const o = { von: "2025-01-01", bis: "2025-12-31" };
  const m = { mieter: "A", von: o.von, bis: o.bis, voraus: 0 };
  const ab = calc.nkMieterAbrechnung(E[0], m, K, o, E);
  assert.equal(ab.p35a.aktiv, true);
});

/* Mutationstest-Fund (2026-07-14, Stryker): arbeitskosten darf nur zählen, wenn die Kostenart
   TATSÄCHLICH als Dienstleistung/Handwerker kategorisiert ist – ein arbeitskosten-Feld auf einer
   nicht kategorisierten Position (z. B. versehentlich befüllt) darf nicht in den §35a-Bonus
   einfließen. */
test("§35a: arbeitskosten auf nicht kategorisierter Kostenart zählt nicht", () => {
  const E = [{ id: 1, flaeche: 100, personen: 1 }];
  const K = [{ bez: "Allgemeinstrom", betrag: 600, schluessel: "flaeche", arbeitskosten: 400 }]; // kein Kategorie-Treffer
  const o = { von: "2025-01-01", bis: "2025-12-31" };
  const m = { mieter: "A", von: o.von, bis: o.bis, voraus: 0 };
  const ab = calc.nkMieterAbrechnung(E[0], m, K, o, E);
  assert.equal(ab.p35a.dienstleistung, 0);
  assert.equal(ab.p35a.handwerker, 0);
  assert.equal(ab.p35a.posten.length, 0);
  assert.equal(ab.p35a.aktiv, false);
});

/* Mutationstest-Fund (2026-07-14): negative arbeitskosten (Dateneingabefehler) dürfen den
   §35a-Bonus nicht ins Negative ziehen – die Prüfung (+k.arbeitskosten||0)>0 muss auch bei einer
   an sich kategorisierten Position greifen. */
test("§35a: negative arbeitskosten werden nicht angerechnet", () => {
  const E = [{ id: 1, flaeche: 100, personen: 1 }];
  const K = [{ bez: "Heizungswartung", betrag: 400, schluessel: "flaeche", arbeitskosten: -50 }]; // Handwerker-Kategorie, aber unplausibler Wert
  const o = { von: "2025-01-01", bis: "2025-12-31" };
  const m = { mieter: "A", von: o.von, bis: o.bis, voraus: 0 };
  const ab = calc.nkMieterAbrechnung(E[0], m, K, o, E);
  assert.equal(ab.p35a.handwerker, 0);
  assert.equal(ab.p35a.posten.length, 0);
});

/* Mutationstest-Fund (2026-07-14): eine Kostenart mit Gesamtbetrag 0 (z. B. Platzhalter-Position)
   darf bei der §35a-Berechnung keine Division durch 0 auslösen (anteil / i.gesamt). */
test("§35a: Kostenart mit Gesamtbetrag 0 verursacht keine Division durch 0", () => {
  const E = [{ id: 1, flaeche: 100, personen: 1 }];
  const K = [{ bez: "Heizungswartung", betrag: 0, schluessel: "flaeche", arbeitskosten: 100 }];
  const o = { von: "2025-01-01", bis: "2025-12-31" };
  const m = { mieter: "A", von: o.von, bis: o.bis, voraus: 0 };
  const ab = calc.nkMieterAbrechnung(E[0], m, K, o, E);
  assert.equal(ab.p35a.handwerker, 0);
  assert.ok(!Number.isNaN(ab.p35a.handwerker));
  assert.equal(ab.p35a.posten.length, 0);
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

/* Ralf-Fund 2026-07-13 (echte Buick-Techem-PDF): eine einzelne Techem-Abrechnung importiert immer
   nur DIESE Einheit, die anderen Einheiten des Gebäudes kommen sukzessive über weitere Importe
   dazu. Bis dahin ist die Live-Summe der bislang erfassten Einzelverbräuche zu niedrig – Techem
   selbst nennt die Gebäude-Gesamtmenge aber schon auf dem ERSTEN Mieter-PDF (hier 37.595 kWh),
   NeKoFix muss diese als Nenner nutzen statt die (noch unvollständige) Live-Summe. */
test("nkVerbrauchGesamt: bevorzugt gespeicherte Gesamtmenge (Techem-Import) vor der Live-Summe", () => {
  const E = [{ id: 1, name: "2 OG S" }, { id: 2, name: "Rest" }];
  const k = { schluessel: "verbrauch", verbrauch: { 1: 1617 }, gesamtmenge: 37595 };
  assert.equal(calc.nkVerbrauchGesamt(k, E), 37595);
  assert.ok(Math.abs(calc.nkFaktorFuer(E[0], k, E) - 1617 / 37595) < 1e-9);
});
test("nkVerbrauchGesamt: ohne gespeicherte Gesamtmenge (manuell gepflegte Kostenart) Live-Summe wie bisher", () => {
  const E = [{ id: 1 }, { id: 2 }];
  const k = { schluessel: "verbrauch", verbrauch: { 1: 30, 2: 70 } };
  assert.equal(calc.nkVerbrauchGesamt(k, E), 100);
});
test("nkLineItemsFor: Gesamtmenge aus Import als Basis der Gleichung (statt Live-Summe) – reproduziert Techems Preis je Einheit", () => {
  const E = [{ id: 1, name: "2 OG S" }, { id: 2, name: "Rest" }];
  const k = [{ bez: "Heizung – Verbrauch (70 %)", betrag: 5695.72, schluessel: "verbrauch", einheit: "kWh", verbrauch: { 1: 1617 }, gesamtmenge: 37595 }];
  const z = calc.nkLineItemsFor(E[0], k, E)[0];
  assert.equal(z.basis, 37595);
  assert.ok(Math.abs(z.preisJeEinheit - 0.151502) < 1e-6); // lt. Techem-PDF
  assert.ok(Math.abs(z.anteil - 244.98) < 0.02); // lt. Techem-PDF "Ihre Kosten"
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
test("Code-Review-Fund 2026-07-10: Rubrik-Zuordnung bleibt nach Heizsplit korrekt (Regressionstest)", () => {
  // Vorher wurde die Rubrik über den Index im ORIGINAL-kosten-Array nachgeschlagen
  // (state.kosten[ix]); nkExpandHeizSplit macht aus dem einen Heizblock zwei Zeilen, wodurch
  // der Index der NACHFOLGENDEN Kostenart in ab.zeilen nicht mehr zu ihrem Original-Index passt.
  // Aufbau: [Heizblock (splittet in 2 Zeilen), Grundsteuer danach] -> ab.zeilen hat 3 Einträge,
  // aber nur 2 kosten-Einträge; Grundsteuer landet beim alten (Index-basierten) Code fälschlich
  // gar nicht in state.kosten (Index 2 existiert dort nicht) bzw. bei mehr Folge-Positionen auf
  // der jeweils falschen Kostenart.
  const E = [{ id: 1, name: "A", flaeche: 100 }];
  const heiz = { typ: "heizung", energieart: "erdgas_kwh", bez: "Heizung", betrag: 1000, grundProzent: 30,
                 schluessel: "flaeche", verbrauch: { 1: 50 } };
  const grundsteuer = { bez: "Grundsteuer", betrag: 500, schluessel: "flaeche" };
  const K = [heiz, grundsteuer];
  const objekt = { von: "2025-01-01", bis: "2025-12-31" };
  const ab = calc.nkMieterAbrechnung(E[0], { mieter: "A", von: "2025-01-01", bis: "2025-12-31", voraus: 0 }, K, objekt, E);
  assert.equal(ab.zeilen.length, 3); // Heizblock -> 2 Zeilen + Grundsteuer -> insgesamt 3
  const heizZeilen = ab.zeilen.filter(z => calc.nkRubrik(z) === "Heizkosten");
  const betriebZeilen = ab.zeilen.filter(z => calc.nkRubrik(z) === "Betriebskosten");
  assert.equal(heizZeilen.length, 2); // Grund- und Verbrauchskosten des Heizblocks
  assert.equal(betriebZeilen.length, 1); // Grundsteuer bleibt Betriebskosten, nicht fälschlich Heizkosten
  assert.equal(betriebZeilen[0].bez, "Grundsteuer");
  assert.equal(Math.round(betriebZeilen[0].anteil), 500); // volle Grundsteuer, nicht mit dem Heizblock vertauscht
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
test("nkImportPlan: Sonstige Ausgaben (nicht umlagefähig) einzeln übernommen, Zurechnungsjahr aus Belegdatum (US-130)", () => {
  const regeln = [
    { schluessel: "DE00000000000000000030", typ: "iban", ziel: { art: "ausgabe" } },
  ];
  const bs = [
    { buchungstag: "03.12.2025", datum: "2025-12-03", iban: "DE00000000000000000030", betrag: -8500, name: "Heiztechnik Müller GmbH", zweck: "Abschlagsrechnung Wärmepumpe" },
    { buchungstag: "14.01.2026", datum: "2026-01-14", iban: "DE00000000000000000030", betrag: -2500, name: "Heiztechnik Müller GmbH", zweck: "Schlussrechnung Wärmepumpe" },
  ];
  const plan = calc.nkImportPlan(bs, regeln, { kostenBez: [], gesehen: [], objektJahr: "2025" });
  assert.equal(plan.kosten.length, 0);
  assert.equal(plan.ausgaben.length, 2);
  assert.deepEqual(plan.ausgaben[0], { bez: "Abschlagsrechnung Wärmepumpe", dienstleister: "Heiztechnik Müller GmbH", betrag: 8500, datum: "2025-12-03", zurechnungsjahr: "2025", herkunft: "csv", csvSchluessel: { schluessel: "DE00000000000000000030", typ: "iban" } });
  // Zurechnungsjahr folgt dem Belegdatum, nicht dem übergebenen objektJahr-Fallback
  assert.equal(plan.ausgaben[1].zurechnungsjahr, "2026");
  assert.equal(plan.fingerprints.length, 2);
  // Dedupe beim Re-Import
  const plan2 = calc.nkImportPlan(bs, regeln, { kostenBez: [], gesehen: plan.fingerprints, objektJahr: "2025" });
  assert.equal(plan2.ausgaben.length, 0);
});
test("nkImportPlan: von der Regel gemerkter (korrigierter) Dienstleister hat Vorrang vor dem rohen Bankdaten-Namen (US-131-Feedback)", () => {
  const regeln = [
    { schluessel: "DE00000000000000000030", typ: "iban", ziel: { art: "ausgabe", dienstleister: "Heiztechnik Sonnenberg GmbH (korrigiert)" } },
  ];
  const bs = [{ buchungstag: "20.11.2025", datum: "2025-11-20", iban: "DE00000000000000000030", betrag: -10000, name: "HEIZTECHNIK SONNENBG GMBH", zweck: "Abschlag 2" }];
  const plan = calc.nkImportPlan(bs, regeln, { kostenBez: [], gesehen: [], objektJahr: "2025" });
  assert.equal(plan.ausgaben[0].dienstleister, "Heiztechnik Sonnenberg GmbH (korrigiert)");
});
test("nkRegelSetDienstleister: aktualisiert nur die passende Ausgabe-Regel, ohne Mutation (US-131-Feedback)", () => {
  const regeln = [
    { schluessel: "X", typ: "iban", ziel: { art: "ausgabe" } },
    { schluessel: "Y", typ: "iban", ziel: { art: "kosten", bez: "Wasser" } },
  ];
  const neu = calc.nkRegelSetDienstleister(regeln, "X", "iban", "Heiztechnik Sonnenberg GmbH");
  assert.deepEqual(neu[0], { schluessel: "X", typ: "iban", ziel: { art: "ausgabe", dienstleister: "Heiztechnik Sonnenberg GmbH" } });
  assert.deepEqual(neu[1], regeln[1]); // Kosten-Regel unangetastet
  assert.deepEqual(regeln[0].ziel, { art: "ausgabe" }); // Original unverändert
  // Kein Treffer (falscher Schlüssel oder falsche Art) -> Liste bleibt inhaltlich gleich
  assert.deepEqual(calc.nkRegelSetDienstleister(regeln, "Z", "iban", "Foo"), regeln);
  assert.deepEqual(calc.nkRegelSetDienstleister(regeln, "Y", "iban", "Foo")[1].ziel, { art: "kosten", bez: "Wasser" });
});
test("nkDatumAusDateiname: erkennt ISO- und deutsches Datum im Dateinamen, sonst leer (US-131-Feedback)", () => {
  assert.equal(calc.nkDatumAusDateiname("Rechnung_2025-12-03_Heiztechnik.pdf"), "2025-12-03");
  assert.equal(calc.nkDatumAusDateiname("Rechnung vom 03.12.2025.pdf"), "2025-12-03");
  assert.equal(calc.nkDatumAusDateiname("Rechnung vom 3.12.2025.pdf"), "2025-12-03"); // einstellig toleriert
  assert.equal(calc.nkDatumAusDateiname("scan001.pdf"), "");
  assert.equal(calc.nkDatumAusDateiname("Vertrag_2025-13-40.pdf"), ""); // ungueltiges Datum -> kein Fund
  assert.equal(calc.nkDatumAusDateiname(""), "");
});
test("nkDateiVorschlagAusName: Titel + Belegdatum/Zurechnungsjahr aus dem Dateinamen (US-131-Feedback)", () => {
  const mitDatum = calc.nkDateiVorschlagAusName("Rechnung_2025-12-03_Waermepumpe.pdf", "2026");
  assert.equal(mitDatum.datum, "2025-12-03");
  assert.equal(mitDatum.zurechnungsjahr, "2025"); // aus dem erkannten Datum, nicht dem Fallback
  assert.equal(mitDatum.bez.indexOf("2025-12-03"), -1); // Datum aus dem Titel entfernt
  assert.equal(mitDatum.bez, "Rechnung Waermepumpe");
  const ohneDatum = calc.nkDateiVorschlagAusName("Testbeleg-Waermepumpe-Schlussrechnung.pdf", "2026");
  assert.equal(ohneDatum.bez, "Testbeleg Waermepumpe Schlussrechnung");
  assert.equal(ohneDatum.datum, undefined); // kein Fund -> Feld fehlt, statt einen falschen Wert zu erzwingen
  assert.equal(ohneDatum.zurechnungsjahr, undefined);
});
test("nkAusgabeNeu / nkAusgabeJahrVorschlag: Vorbelegung Sonstige Ausgaben (US-130)", () => {
  assert.deepEqual(calc.nkAusgabeNeu("2025"), { bez: "", dienstleister: "", betrag: 0, datum: "", zurechnungsjahr: "2025" });
  assert.deepEqual(calc.nkAusgabeNeu(""), { bez: "", dienstleister: "", betrag: 0, datum: "", zurechnungsjahr: "" });
  assert.equal(calc.nkAusgabeJahrVorschlag("2026-01-14", "2025"), "2026"); // Belegdatum hat Vorrang
  assert.equal(calc.nkAusgabeJahrVorschlag("", "2025"), "2025");          // kein Datum -> Fallback
  assert.equal(calc.nkAusgabeJahrVorschlag("", ""), "");
});
test("nkBelegPfad / nkBelegDateiname: Ordnerzweig und Kürzel-Umbenennung (US-131)", () => {
  assert.deepEqual(calc.nkBelegPfad("2025"), ["Belege", "2025"]);
  assert.deepEqual(calc.nkBelegPfad(""), ["Belege", "ohne Jahr"]);
  assert.equal(calc.nkBelegDateiname({ zurechnungsjahr: "2025", laufendeNummer: 14, belegNr: 1, bez: "Heizung", dienstleister: "Viessmann", betrag: 1200, originalName: "Rechnung.pdf" }), "25-14_Heizung_Viessmann_1.200,00.pdf");
  assert.equal(calc.nkBelegDateiname({ zurechnungsjahr: "2025", laufendeNummer: 14, belegNr: 1, bez: "Heizung", dienstleister: "Viessmann", betrag: 1200, originalName: "Rechnung.PDF" }), "25-14_Heizung_Viessmann_1.200,00.pdf"); // Endung klein
  // kein Dienstleister -> ersatzweise der bereinigte Original-Dateiname als Vorbelegung (Ralf-Feedback 2026-07-30)
  assert.equal(calc.nkBelegDateiname({ zurechnungsjahr: "2025", laufendeNummer: 14, belegNr: 1, bez: "Wärmepumpe", dienstleister: "", betrag: 0, originalName: "Rechnung_Elektro_Hansen.jpg" }), "25-14_Wärmepumpe_Rechnung Elektro Hansen_0,00.jpg");
  // weder Bezeichnung noch Dienstleister noch Originalname -> nur Jahr-Nummer(+Betrag)
  assert.equal(calc.nkBelegDateiname({ zurechnungsjahr: "2025", laufendeNummer: 14, belegNr: 1, bez: "", dienstleister: "", betrag: 0, originalName: "" }), "25-14_0,00");
  // Bezeichnung ohne Dienstleister/Originalname -> nur Bezeichnung dran (keine Endung ohne originalName)
  assert.equal(calc.nkBelegDateiname({ zurechnungsjahr: "2025", laufendeNummer: 14, belegNr: 1, bez: "Grundsteuer", dienstleister: "", betrag: 500, originalName: "" }), "25-14_Grundsteuer_500,00");
  assert.equal(calc.nkBelegDateiname({ zurechnungsjahr: "2026", laufendeNummer: 3, belegNr: 1, bez: "Wasser", dienstleister: "Heiztechnik/Müller GmbH", betrag: 500, originalName: "x.pdf" }), "26-3_Wasser_Heiztechnik_Müller GmbH_500,00.pdf"); // Schrägstrich ersetzt (nkDokSegment)
  // Mehrere Belege an derselben Position: ab der zweiten Belegnummer eindeutige Namen (Kollisions-Fix)
  assert.equal(calc.nkBelegDateiname({ zurechnungsjahr: "2025", laufendeNummer: 16, belegNr: 1, bez: "Wärmepumpe", dienstleister: "Müller GmbH", betrag: 12000, originalName: "abschlag.pdf" }), "25-16_Wärmepumpe_Müller GmbH_12.000,00.pdf");
  assert.equal(calc.nkBelegDateiname({ zurechnungsjahr: "2025", laufendeNummer: 16, belegNr: 2, bez: "Wärmepumpe", dienstleister: "Müller GmbH", betrag: 10000, originalName: "schluss.pdf" }), "25-16-2_Wärmepumpe_Müller GmbH_10.000,00.pdf");
  assert.notEqual(
    calc.nkBelegDateiname({ zurechnungsjahr: "2025", laufendeNummer: 16, belegNr: 1, bez: "Wärmepumpe", dienstleister: "Müller GmbH", betrag: 12000, originalName: "abschlag.pdf" }),
    calc.nkBelegDateiname({ zurechnungsjahr: "2025", laufendeNummer: 16, belegNr: 2, bez: "Wärmepumpe", dienstleister: "Müller GmbH", betrag: 10000, originalName: "schluss.pdf" })
  );
});
test("nkBelegStatus: kein Beleg / ein Beleg reicht / mehrere brauchen die Schlussrechnung (US-131)", () => {
  assert.equal(calc.nkBelegStatus([]), "kein_beleg");
  assert.equal(calc.nkBelegStatus(undefined), "kein_beleg");
  assert.equal(calc.nkBelegStatus([{ dateiname: "25-1_Foo.pdf" }]), "vollstaendig"); // ein Beleg genügt
  assert.equal(calc.nkBelegStatus([{ dateiname: "a.pdf" }, { dateiname: "b.pdf" }]), "unvollstaendig"); // Teilzahlungen ohne Schlussrechnung
  assert.equal(calc.nkBelegStatus([{ dateiname: "a.pdf" }, { dateiname: "b.pdf", schlussrechnung: true }]), "vollstaendig");
});
test("nkBelegChecklist / nkBelegFortschritt: Kosten + Ausgaben zusammengeführt, Heizblöcke ausgeschlossen, Index bleibt trotz Filter erhalten (US-131 + Reiter-Split 2026-07-31)", () => {
  const kosten = [
    { id: 1, bez: "Grundsteuer", betrag: 1200, belege: [{ dateiname: "x" }], verfuegbar: "vorhanden" },
    { id: 2, bez: "Heizung (Erdgas)", typ: "heizung", betrag: 3600, belege: [{ dateiname: "x" }] }, // ausgeschlossen, mitten im Array
    { id: 3, bez: "Wasser", betrag: 800 }, // kein Beleg, Ampel-Default "fehlt"
  ];
  const ausgaben = [
    { id: 10, bez: "Wärmepumpe", betrag: 8500, herkunft: "csv", belege: [{ dateiname: "a" }, { dateiname: "b" }], verfuegbar: "vorhanden" },
  ];
  const items = calc.nkBelegChecklist(kosten, ausgaben);
  assert.equal(items.length, 3); // Heizblock nicht dabei
  assert.deepEqual(items.map(i => i.art), ["kosten", "kosten", "ausgabe"]);
  assert.equal(items[0].idx, 0); // Grundsteuer bleibt Original-Index 0
  assert.equal(items[1].idx, 2); // Wasser ist im ORIGINAL-Array Index 2, nicht 1 - der Heizung-Filter darf das nicht verschieben
  assert.equal(items[0].status, "vollstaendig");
  assert.equal(items[0].verfuegbar, "vorhanden");
  assert.equal(items[0].herkunft, "manuell"); // kein Feld gesetzt -> Default
  assert.equal(items[1].status, "kein_beleg");
  assert.equal(items[1].verfuegbar, "fehlt"); // Ampel-Default, vereinheitlicht mit Ausgaben
  assert.equal(items[2].status, "unvollstaendig"); // 2 Belege, keine Schlussrechnung markiert
  assert.equal(items[2].verfuegbar, "vorhanden");
  assert.equal(items[2].herkunft, "csv");
  assert.deepEqual(calc.nkBelegFortschritt(items), { gesamt: 3, fertig: 2 }); // zählt "vorhanden", nicht "vollstaendig"
});
test("nkBelegDuplikat: findet inhaltsgleiche Datei über Kosten und Ausgaben hinweg (US-131-Feedback)", () => {
  const kosten = [{ id: 1, bez: "Grundsteuer", belege: [{ dateiname: "25-1.pdf", hash: "abc" }] }];
  const ausgaben = [{ id: 10, bez: "Wärmepumpe", belege: [{ dateiname: "25-10.pdf", hash: "def" }] }];
  assert.deepEqual(calc.nkBelegDuplikat(kosten, ausgaben, "abc"), { art: "kosten", bez: "Grundsteuer", dateiname: "25-1.pdf" });
  assert.deepEqual(calc.nkBelegDuplikat(kosten, ausgaben, "def"), { art: "ausgabe", bez: "Wärmepumpe", dateiname: "25-10.pdf" });
  assert.equal(calc.nkBelegDuplikat(kosten, ausgaben, "xyz"), null);
  assert.equal(calc.nkBelegDuplikat(kosten, ausgaben, ""), null);
  assert.equal(calc.nkBelegDuplikat([], [], "abc"), null);
});
test("nkDateiTitelVorschlag: Bezeichnungs-Vorschlag aus Dateiname (US-131-Feedback)", () => {
  assert.equal(calc.nkDateiTitelVorschlag("Testbeleg-Waermepumpe-Schlussrechnung.pdf"), "Testbeleg Waermepumpe Schlussrechnung");
  assert.equal(calc.nkDateiTitelVorschlag("Rechnung_2025_12_03.PDF"), "Rechnung 2025 12 03");
  assert.equal(calc.nkDateiTitelVorschlag("scan.jpg"), "scan");
  assert.equal(calc.nkDateiTitelVorschlag(""), "");
  assert.equal(calc.nkDateiTitelVorschlag(null), "");
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
   bewusst, wird `erwartet` mit Begründung aktualisiert (nicht stillschweigend).
   2026-07-13: Heizblock "Heizung (Erdgas)" bekam zusätzlich `gesamtmenge:48000` (Techem-Import-
   Pfad, s. nkVerbrauchGesamt) – bewusst höher als die Summe der vier erfassten Einzelverbräuche
   (46000), wie es bei einem Hauptzähler ggü. den Wohnungszählern real vorkommt. Dadurch verteilt
   der Verbrauchs-Split nur noch 46000/48000 statt 100 % des Blocks – die neuen `erwartet`-Werte
   sind niedriger als zuvor. */
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
    summeAnteil: 14064.36, summeVoraus: 6820, summeSaldo: 7244.36,
    einheiten: [
      { name: "EG links", unitShare: 3508.86, leerstandBetrag: 0, mv: [
        { mieter: "Familie Brandt", gewerblich: false, netto: 3508.86, ust: 0, brutto: 3443.11, saldo: 1643.11 } ] },
      { name: "EG rechts", unitShare: 2679.44, leerstandBetrag: 0, mv: [
        { mieter: "Frau Yilmaz", gewerblich: false, netto: 2679.44, ust: 0, brutto: 2629.47, saldo: 1189.47 } ] },
      { name: "1. OG", unitShare: 4337.2, leerstandBetrag: 356.48, mv: [
        { mieter: "Herr Novak", gewerblich: false, netto: 2887.51, ust: 0, brutto: 2834.01, saldo: 1474.01 },
        { mieter: "Familie Schäfer", gewerblich: false, netto: 1093.21, ust: 0, brutto: 1072.96, saldo: 532.96 } ] },
      { name: "DG", unitShare: 3569.74, leerstandBetrag: 0, mv: [
        { mieter: "Herr Petersen", gewerblich: true, netto: 3185.28, ust: 605.2, brutto: 3728.33, saldo: 2048.33 } ] }
    ]
  };
  assert.deepEqual(snap, erwartet);
});

/* US-115 (letztes AC): Abdeckungs-Wächter – stellt sicher, dass die Lindenhof-Fixture die
   abrechnungsrelevanten Pfade weiterhin enthält, damit die Abdeckung nicht unbemerkt erodiert.
   Definition of Done: Wer ein neues abrechnungsrelevantes Feature baut, erweitert die Fixture um
   den neuen Pfad UND diese Liste (siehe CLAUDE.md). */
test("US-115: Lindenhof-Fixture deckt die abrechnungsrelevanten Pfade ab", () => {
  const d = require("./lindenhof-2025.fixture.json");
  const mvs = d.einheiten.reduce((a, e) => a.concat(e.mv || []), []);
  assert.ok(d.einheiten.length >= 3, "mehrere Einheiten");
  assert.ok(mvs.some(m => m.gewerblich), "mindestens ein gewerblicher Mieter (USt-Pfad)");
  assert.ok(d.einheiten.some(e => (e.mv || []).length > 1), "Mieterwechsel/unterjähriges Mietverhältnis");
  const heiz = d.kosten.filter(k => k.typ === "heizung");
  assert.ok(heiz.some(k => calc.nkHeizSplitAktiv(k, d.einheiten)), "Heizblock mit aktivem Grund-/Verbrauchs-Split");
  assert.ok(heiz.some(k => (+k.gesamtmenge || 0) > 0), "Verbrauchsposition mit Techem-Import-Gesamtmenge (nkVerbrauchGesamt-Pfad)");
  const saetze = new Set(d.kosten.map(k => +k.vorsteuer || 0));
  [0, 7, 19].forEach(s => assert.ok(saetze.has(s), "Vorsteuersatz " + s + " % in den Kosten vertreten"));
});

test("nkColLetter: Spaltenbuchstabe für Excel-Formeln (US-117)", () => {
  assert.equal(calc.nkColLetter(1), "A");
  assert.equal(calc.nkColLetter(26), "Z");
  assert.equal(calc.nkColLetter(27), "AA");
  assert.equal(calc.nkColLetter(52), "AZ");
  assert.equal(calc.nkColLetter(53), "BA");
  assert.equal(calc.nkColLetter(702), "ZZ");
  assert.equal(calc.nkColLetter(703), "AAA");
});

test("nkEurProQm: EUR/m² je Kostenart und gesamt (US-106)", () => {
  const r = calc.nkEurProQm([{bez:"A",betrag:1200},{bez:"B",betrag:600}], 100);
  assert.equal(r.flaeche, 100);
  assert.equal(r.zeilen[0].jahr, 12); assert.equal(r.zeilen[0].monat, 1);
  assert.equal(r.zeilen[1].jahr, 6);  assert.equal(r.zeilen[1].monat, 0.5);
  assert.equal(r.gesamt.betrag, 1800); assert.equal(r.gesamt.jahr, 18); assert.equal(r.gesamt.monat, 1.5);
  // ohne Fläche: 0 statt Division durch null
  assert.equal(calc.nkEurProQm([{betrag:100}], 0).gesamt.jahr, 0);
});

test("nkVerbrauchAusreisser: auffällig niedriger Verbrauch je Einheit (US-105)", () => {
  const E=[{id:1,name:"A",flaeche:100},{id:2,name:"B",flaeche:100},{id:3,name:"C",flaeche:100},{id:4,name:"D",flaeche:100}];
  const k={bez:"Heizung",schluessel:"verbrauch",verbrauch:{1:1000,2:1050,3:950,4:50}}; // D extrem niedrig
  const r=calc.nkVerbrauchAusreisser(E,[k]);
  assert.equal(r.length,1); assert.equal(r[0].einheit,"D");
  // gleichmäßig -> keine Meldung
  assert.equal(calc.nkVerbrauchAusreisser(E,[{bez:"H",schluessel:"verbrauch",verbrauch:{1:1000,2:1000,3:1000,4:1000}}]).length,0);
  // zu wenige Einheiten -> keine Meldung
  assert.equal(calc.nkVerbrauchAusreisser(E.slice(0,2),[k]).length,0);
  // ohne Verbrauchsdaten -> keine Meldung
  assert.equal(calc.nkVerbrauchAusreisser(E,[{bez:"Grundsteuer",schluessel:"flaeche"}]).length,0);
});

test("nkDokSegment / nkDokPfad: dateisystem-sichere Ordnernamen (US-109)", () => {
  assert.equal(calc.nkDokSegment("EG links"), "EG links");
  assert.ok(!/[\/\\:*?"<>|]/.test(calc.nkDokSegment('A/B:C*?"<>|'))); // keine verbotenen Zeichen mehr
  assert.equal(calc.nkDokSegment("A/B"), "A_B");
  assert.equal(calc.nkDokSegment("  x   y  "), "x y");
  assert.equal(calc.nkDokSegment(""), "_");
  assert.equal(calc.nkDokSegment(null), "_");
  // Ralf-Vorgabe 2026-07-10: Jahr ans Ende (Objekt/Einheit/Mieter/Jahr) – Mieter bleiben oft mehrere
  // Jahre, ein Jahresordner ganz oben hätte ihren Beleg-Ordner sonst jedes Jahr neu aufgespalten.
  assert.deepEqual(calc.nkDokPfad("Lindenhof","2025","EG links","Familie Brandt"), ["Lindenhof","EG links","Familie Brandt","2025"]);
  assert.deepEqual(calc.nkDokPfad("Haus/1","","E1","M1"), ["Haus_1","E1","M1","ohne Jahr"]); // leeres Jahr -> Platzhalter
});
test("nkDokPfadObjekt: wie nkDokPfad ohne Objekt-Segment (Datenablage v2, US-109)", () => {
  assert.deepEqual(calc.nkDokPfadObjekt("2025","EG links","Familie Brandt"), ["EG links","Familie Brandt","2025"]);
  assert.deepEqual(calc.nkDokPfadObjekt("","E1","M1"), ["E1","M1","ohne Jahr"]);
});

/* ---- US-111: Termine & Wartung ---- */
test("nkPlusMonate: Monate addieren mit Tag-Klammerung", () => {
  assert.equal(calc.nkPlusMonate("2025-01-15", 12), "2026-01-15");
  assert.equal(calc.nkPlusMonate("2025-01-31", 1), "2025-02-28"); // Februar klammert
  assert.equal(calc.nkPlusMonate("2025-03-10", 24), "2027-03-10");
});
test("nkTerminAmpel: überfällig/bald/ok", () => {
  assert.equal(calc.nkTerminAmpel("2025-01-01", "2026-01-01"), "faellig"); // Vergangenheit
  assert.equal(calc.nkTerminAmpel("2026-02-01", "2026-01-01"), "bald");    // < 3 Monate
  assert.equal(calc.nkTerminAmpel("2027-01-01", "2026-01-01"), "ok");      // fern
  assert.equal(calc.nkTerminAmpel("", "2026-01-01"), "ok");
});
test("nkTermineGesamt: eigene Termine + Mieterhöhungen, sortiert mit Ampel", () => {
  const objekt = { termine: [
    { id: 1, bez: "Feuerlöscher", art: "vorort", intervallMonate: 24, naechster: "2027-05-01" },
    { id: 2, bez: "Frist X", art: "verwaltung", intervallMonate: 0, naechster: "2026-01-10" },
  ] };
  const einh = [{ id: 9, name: "EG", mv: [
    { id: 3, mieter: "Meier", mhTyp: "index", idxEinzug: "2024-01-01", idxFrequenz: 1, idxAnpassungen: [] },
  ] }];
  const liste = calc.nkTermineGesamt(objekt, einh, "2026-01-01");
  assert.equal(liste.length, 3);
  assert.deepEqual(liste.map(t => t.datum), ["2025-01-01", "2026-01-10", "2027-05-01"]); // aufsteigend
  const mh = liste.find(t => t.quelle === "mieterhoehung");
  assert.ok(mh && /Mieterhöhung: Meier/.test(mh.bez) && mh.art === "mieterhoehung");
  assert.equal(liste[0].ampel, "faellig"); // 2025-01-01 liegt in der Vergangenheit -> überfällig
  assert.equal(liste[1].ampel, "bald");    // 2026-01-10 < 3 Monate
});
test("nkTerminIcs: VEVENT mit stabiler UID, RRULE bei Intervall, VALARM", () => {
  const ics = calc.nkTerminIcs([
    { quelle: "wartung", id: 7, bez: "Rauchmelder", datum: "2026-03-01", intervallMonate: 12, notiz: "Alle Wohnungen" },
    { quelle: "mieterhoehung", einheitId: 9, mvId: 3, bez: "Mieterhöhung: Meier", datum: "2026-05-01", intervallMonate: 0 },
  ]);
  assert.ok(/BEGIN:VCALENDAR/.test(ics) && /END:VCALENDAR/.test(ics));
  assert.ok(/UID:wartung-7@nekofix/.test(ics));
  assert.ok(/UID:mh-9-3@nekofix/.test(ics));
  assert.ok(/RRULE:FREQ=YEARLY;INTERVAL=1/.test(ics)); // 12 Monate -> jährlich
  assert.ok(/DTSTART;VALUE=DATE:20260301/.test(ics));
  assert.ok(/BEGIN:VALARM[\s\S]*TRIGGER:-P14D/.test(ics));
});

/* ---- US-111 Schliff: Staffel ohne Ende, Tage-Spalte, Uhrzeit ---- */
test("nkMieterhoehungTermine: Staffel ohne Enddatum liefert nächste Stufe", () => {
  const einh = [{ id: 9, name: "EG", mv: [
    { id: 3, mieter: "Staf", mhTyp: "staffel", stafBeginn: "2024-01-01", stafEnde: "", stafFrequenz: 1, stafAusgangsmiete: 800, stafBetrag: 20, stafAngekuendigt: {} },
  ] }];
  const t = calc.nkMieterhoehungTermine(einh, "2026-06-01");
  assert.equal(t.length, 1);
  assert.equal(t[0].datum, "2025-01-01"); // erste noch nicht angekündigte Stufe (überfällig)
  const einh2 = [{ id: 9, name: "EG", mv: [
    Object.assign({}, einh[0].mv[0], { stafAngekuendigt: { "2025-01-01": true, "2026-01-01": true } }) ] }];
  assert.equal(calc.nkMieterhoehungTermine(einh2, "2026-06-01")[0].datum, "2027-01-01"); // nächste offene
});
test("nkTageBis / nkTageFarbe: Tage bis Termin + Farbcode", () => {
  assert.equal(calc.nkTageBis("2026-01-11", "2026-01-01"), 10);
  assert.equal(calc.nkTageBis("2025-12-31", "2026-01-01"), -1); // überfällig
  assert.equal(calc.nkTageFarbe(0), "rot");
  assert.equal(calc.nkTageFarbe(1), "rot");
  assert.equal(calc.nkTageFarbe(20), "orange");  // < 2 Monate
  assert.equal(calc.nkTageFarbe(100), "gruen");  // > 2 Monate
});
test("nkTerminIcs: optionale Uhrzeit erzeugt zeitgebundenen Termin", () => {
  const ics = calc.nkTerminIcs([{ quelle: "wartung", id: 5, bez: "Termin vor Ort", datum: "2026-03-10", zeit: "09:30", intervallMonate: 0 }]);
  assert.ok(/DTSTART:20260310T093000/.test(ics));
  assert.ok(/DTEND:20260310T103000/.test(ics)); // +1 Stunde
  assert.ok(!/VALUE=DATE/.test(ics)); // kein Ganztagestermin
});

/* ---- US-111 Schliff 2: editierbarer Mieterhöhungs-Titel + private Kalendereinträge ---- */
test("nkMieterhoehungTermine: eigener terminBez überschreibt Default", () => {
  const einh = [{ id: 9, name: "EG", mv: [
    { id: 3, mieter: "Meier", mhTyp: "index", idxEinzug: "2024-01-01", idxFrequenz: 1, idxAnpassungen: [], terminBez: "Meine Indexmiete Meier" },
  ] }];
  assert.equal(calc.nkMieterhoehungTermine(einh, "2026-01-01")[0].bez, "Meine Indexmiete Meier");
});
test("nkTerminIcs: Termine sind als privat gekennzeichnet (CLASS:PRIVATE)", () => {
  const ics = calc.nkTerminIcs([{ quelle: "wartung", id: 1, bez: "X", datum: "2026-03-01", intervallMonate: 0 }]);
  assert.ok(/CLASS:PRIVATE/.test(ics));
});

test("nkTageLabel: Tage/Monate/Jahre abgekürzt", () => {
  assert.equal(calc.nkTageLabel(0), "heute");
  assert.equal(calc.nkTageLabel(-3), "überfällig");
  assert.equal(calc.nkTageLabel(20), "20 T");
  assert.equal(calc.nkTageLabel(31), "31 T");
  assert.equal(calc.nkTageLabel(45), "1M 15T");
  assert.equal(calc.nkTageLabel(366), "1J 1T"); // wie im Wunsch
  assert.equal(calc.nkTageLabel(400), "1J 1M 5T");
});

/* ---- US-111 Schliff 4: jährliche Wiederkehr + Vorrücken beim Ankündigen ---- */
test("nkMieterhoehungTermine: intervallMonate = Frequenz*12 (jährliche .ics-Serie)", () => {
  const einh = [{ id: 1, name: "E", mv: [{ id: 1, mieter: "M", mhTyp: "index", idxEinzug: "2024-01-01", idxFrequenz: 1, idxAnpassungen: [] }] }];
  const t = calc.nkMieterhoehungTermine(einh, "2026-01-01")[0];
  assert.equal(t.intervallMonate, 12);
  const ics = calc.nkTerminIcs([t]);
  assert.ok(/RRULE:FREQ=YEARLY;INTERVAL=1/.test(ics));
});
test("nkMieterhoehungTermine: Index rückt nach, wenn Stichtag vorab angekündigt (mhAngekuendigt)", () => {
  const base = { id: 1, name: "E", mv: [{ id: 1, mieter: "M", mhTyp: "index", idxEinzug: "2024-01-01", idxFrequenz: 1, idxAnpassungen: [] }] };
  assert.equal(calc.nkMieterhoehungTermine([base], "2026-01-01")[0].datum, "2025-01-01");
  base.mv[0].mhAngekuendigt = { "2025-01-01": true };
  assert.equal(calc.nkMieterhoehungTermine([base], "2026-01-01")[0].datum, "2026-01-01"); // Folgejahr rückt nach
});

test("nkRwmTermine: ohne Anzahl kein Termin", () => {
  assert.deepEqual(calc.nkRwmTermine([{ id: 1, name: "E", rwmAnzahl: 0 }], "2026-01-01"), []);
  assert.deepEqual(calc.nkRwmTermine([{ id: 1, name: "E" }], "2026-01-01"), []);
});
test("nkRwmTermine: mit Anzahl zwei Termine (Wartung jährlich, Austausch alle 10 Jahre)", () => {
  const einh = [{ id: 1, name: "EG links", rwmAnzahl: 3 }];
  const t = calc.nkRwmTermine(einh, "2026-01-15");
  assert.equal(t.length, 2);
  const wartung = t.find(x => x.typ === "Wartung"), austausch = t.find(x => x.typ === "Austausch");
  assert.equal(wartung.datum, "2027-01-15"); // Bootstrap ohne rwmWartungLetzte: heute + 12 Monate
  assert.equal(wartung.intervallMonate, 12);
  assert.ok(/EG links/.test(wartung.bez) && /3 Stück/.test(wartung.bez));
  assert.equal(austausch.datum, "2036-01-15"); // Bootstrap ohne rwmAustauschLetzter: heute + 120 Monate
  assert.equal(austausch.intervallMonate, 120);
  // stabile, je Einheit+Typ eindeutige id (fürs .ics – keine UID-Kollision zwischen Einheiten)
  assert.equal(wartung.id, "rwm-1-wartung");
  assert.equal(austausch.id, "rwm-1-austausch");
});
test("nkRwmTermine: vorhandenes letztes Datum wird als Basis genutzt statt heute", () => {
  const einh = [{ id: 2, name: "OG rechts", rwmAnzahl: 2, rwmWartungLetzte: "2025-05-01", rwmAustauschLetzter: "2020-05-01" }];
  const t = calc.nkRwmTermine(einh, "2026-01-01");
  assert.equal(t.find(x => x.typ === "Wartung").datum, "2026-05-01");
  assert.equal(t.find(x => x.typ === "Austausch").datum, "2030-05-01");
});
test("nkRwmTermine: geht in nkTermineGesamt ein", () => {
  const objekt = {}; const einh = [{ id: 1, name: "E", rwmAnzahl: 1 }];
  const liste = calc.nkTermineGesamt(objekt, einh, "2026-01-01");
  assert.equal(liste.filter(t => t.quelle === "rwm").length, 2);
});

/* ---- US-118 AC-2b: einheitlicher Ankündigungs-Speicher (Migration + Helfer) ---- */
test("nkMigrateAnkuendigungen: kommende Index-Vorab-Ankündigung (mhAngekuendigt) -> {verschicktAm:''}", () => {
  const m = { mhAngekuendigt: { "2026-01-01": true, "2027-01-01": false } };
  const ank = calc.nkMigrateAnkuendigungen(m);
  assert.deepEqual(ank, { "2026-01-01": { verschicktAm: "", typ: "Index" } }); // false-Eintrag wird nicht übernommen
  assert.equal(calc.nkIstAngekuendigt(ank, "2026-01-01"), true);
  assert.equal(calc.nkIstAngekuendigt(ank, "2027-01-01"), false);
});
test("nkMigrateAnkuendigungen: Staffel (stafAngekuendigt) -> verschicktAm + Snapshot bleiben erhalten", () => {
  const snap = { neueMiete: 850 };
  const m = { stafAngekuendigt: { "2026-06-01": { datum: "2026-04-01", snapshot: snap } } };
  const ank = calc.nkMigrateAnkuendigungen(m);
  assert.equal(calc.nkAnkVerschicktAm(ank, "2026-06-01"), "2026-04-01");
  assert.deepEqual(calc.nkAnkSnapshot(ank, "2026-06-01"), snap);
});
test("nkMigrateAnkuendigungen: übernommene Index-Anpassung -> Key=datum, verschicktAm/Snapshot erhalten", () => {
  const snap = { neueMiete: 800 };
  const m = { idxAnpassungen: [{ datum: "2025-09-01", angekuendigt: "2025-07-01", ankSnapshot: snap }, { datum: "2024-09-01" }] };
  const ank = calc.nkMigrateAnkuendigungen(m);
  assert.equal(calc.nkIstAngekuendigt(ank, "2025-09-01"), true);
  assert.equal(calc.nkAnkVerschicktAm(ank, "2025-09-01"), "2025-07-01");
  assert.deepEqual(calc.nkAnkSnapshot(ank, "2025-09-01"), snap);
  assert.equal(calc.nkIstAngekuendigt(ank, "2024-09-01"), false); // ohne angekuendigt kein Eintrag
});
test("nkMigrateAnkuendigungen: idempotent und bestehende ankuendigungen haben Vorrang", () => {
  const m = { ankuendigungen: { "2026-01-01": { verschicktAm: "2025-11-01" } }, mhAngekuendigt: { "2026-01-01": true } };
  const ank1 = calc.nkMigrateAnkuendigungen(m);
  assert.equal(calc.nkAnkVerschicktAm(ank1, "2026-01-01"), "2025-11-01"); // bestehender Eintrag gewinnt, nicht überschrieben
  const ank2 = calc.nkMigrateAnkuendigungen({ ankuendigungen: ank1 });
  assert.deepEqual(ank2, ank1); // idempotent
});
test("nkMigrateAnkuendigungen: alle drei Quellen zusammen, ohne Verlust", () => {
  const m = {
    mhAngekuendigt: { "2027-01-01": true },
    stafAngekuendigt: { "2026-06-01": { datum: "2026-04-01", snapshot: { neueMiete: 850 } } },
    idxAnpassungen: [{ datum: "2025-09-01", angekuendigt: "2025-07-01", ankSnapshot: { neueMiete: 800 } }],
  };
  const ank = calc.nkMigrateAnkuendigungen(m);
  assert.equal(Object.keys(ank).length, 3);
  assert.equal(calc.nkIstAngekuendigt(ank, "2027-01-01"), true);
  assert.equal(calc.nkIstAngekuendigt(ank, "2026-06-01"), true);
  assert.equal(calc.nkIstAngekuendigt(ank, "2025-09-01"), true);
});

test("nkChronikNaechsteOffene: liefert den nächstgelegenen künftigen offenen Eintrag", () => {
  const chronik = [
    { datum: "2026-01-01", text: "erledigt", erledigt: true },
    { datum: "2026-09-01", text: "künftig, spät" },
    { datum: "2026-06-01", text: "künftig, früher" },
  ];
  assert.equal(calc.nkChronikNaechsteOffene(chronik, "2026-05-01"), "2026-06-01");
});
test("nkChronikNaechsteOffene: ohne künftigen Eintrag der jüngste überfällige", () => {
  const chronik = [
    { datum: "2026-01-01", text: "überfällig, älter" },
    { datum: "2026-03-01", text: "überfällig, jünger" },
  ];
  assert.equal(calc.nkChronikNaechsteOffene(chronik, "2026-05-01"), "2026-03-01");
});
test("nkChronikNaechsteOffene: erledigte und bereits angekündigte Einträge zählen nicht", () => {
  const chronik = [
    { datum: "2026-01-01", erledigt: true },
    { datum: "2026-02-01", angekuendigt: true },
  ];
  assert.equal(calc.nkChronikNaechsteOffene(chronik, "2026-05-01"), null);
});
test("nkChronikNaechsteOffene: keine Chronik-Einträge -> null", () => {
  assert.equal(calc.nkChronikNaechsteOffene([], "2026-05-01"), null);
  assert.equal(calc.nkChronikNaechsteOffene(undefined, "2026-05-01"), null);
});

/* ================= Techem-Abrechnungsimport (2026-07-10) =================
   Fixture-Zeilen sind mit pdf.js (Node, gleiche Bibliothek wie im Browser) aus der von Ralf
   anonymisierten Testvorlage "Techem anonym Test2.pdf" extrahiert (Seite 1 + Seite-2-Kopfzeile).
   Namen/Bankdaten sind in der Vorlage bereits geschwärzt; die hier verwendeten Zahlen sind reine
   Objekt-Kostendaten (keine Personendaten), s. [[keine-echten-daten-im-code]]. */
test("nkPdfZeilenAusItems: gruppiert nach y (Toleranz), sortiert je Zeile nach x", () => {
  const items = [
    { str: "B", x: 50, y: 100.2, w: 10 },
    { str: "A", x: 10, y: 100.0, w: 10 },
    { str: "Zeile2", x: 10, y: 80, w: 30 },
  ];
  const zeilen = calc.nkPdfZeilenAusItems(items);
  assert.equal(zeilen.length, 2);
  assert.ok(zeilen[0].indexOf("A") < zeilen[0].indexOf("B")); // x-Reihenfolge trotz vertauschter Eingabe
  assert.equal(zeilen[1], "Zeile2");
});
test("nkPdfZeilenAusItems: leicht versetzte Baselines (Toleranz 3pt) verschmelzen zu einer Zeile", () => {
  const items = [
    { str: "Grundkosten", x: 10, y: 500.0, w: 60 },
    { str: "446,61", x: 400, y: 501.4, w: 30 }, // 1.4pt Versatz - wie bei Techem üblich
  ];
  const zeilen = calc.nkPdfZeilenAusItems(items);
  assert.equal(zeilen.length, 1);
});
test("nkTechemZeileParsen: einzelne Tabellenzeile (Fläche)", () => {
  const p = calc.nkTechemZeileParsen("30% Grundkosten  2.441,03 :  470,600 m²Nutzfläche  =  5,187059 x  86,100  =  446,61");
  assert.equal(p.bez, "30% Grundkosten");
  assert.equal(p.gesamtbetrag, 2441.03);
  assert.equal(p.gesamtmenge, 470.6);
  assert.equal(p.schluessel, "flaeche");
  assert.equal(p.einheit, "m²");
  assert.equal(p.preisJeEinheit, 5.187059);
  assert.equal(p.ihreMenge, 86.1);
  assert.equal(p.ihreKosten, 446.61);
});
test("nkTechemZeileParsen: Verbrauchszeile (kWh) und (m³)", () => {
  const kwh = calc.nkTechemZeileParsen("70% Verbrauchskosten  5.695,72 :  37.595,000 Kilowatt-Stunden  =  0,151502 x 12.732,000  =  1.928,92");
  assert.equal(kwh.schluessel, "verbrauch");
  assert.equal(kwh.einheit, "kWh");
  assert.equal(kwh.ihreMenge, 12732);
  const m3 = calc.nkTechemZeileParsen("Kaltwasser Gesamt  704,38 :  206,100 Kubikmeter  =  3,417661 x  46,800  =  159,95");
  assert.equal(m3.schluessel, "verbrauch");
  assert.equal(m3.einheit, "m³");
  assert.equal(m3.ihreMenge, 46.8);
});
test("nkTechemZeileParsen: Nutzeinheiten-Zeile (schluessel einheit)", () => {
  const p = calc.nkTechemZeileParsen("Abrechnungsservice  148,62 :  7,000 Nutzeinheiten  =  21,231429 x  1,000  =  21,23");
  assert.equal(p.schluessel, "einheit");
  assert.equal(p.gesamtmenge, 7);
});
test("nkTechemZeileParsen: Zwischensummen ohne Verteilerschlüssel -> null (bewusst kein Import)", () => {
  assert.equal(calc.nkTechemZeileParsen("zu verteilende Kosten  1.210,71"), null);
  assert.equal(calc.nkTechemZeileParsen("70% Verbrauchskosten  847,50"), null);
  assert.equal(calc.nkTechemZeileParsen("Ihre Heizkosten  2.375,53"), null);
});

const TECHEM_SEITE1_ZEILEN = [
  "Auftraggeber", ".....", "D-5000 ...", "Heiz-, Warmwasser- und Haus-",
  "nebenkostenabrechnung 2024/2025", "Erstellt am", "18.07.2025",
  "Techem Energy Services GmbH · Zentrale Poststelle · 22780 Hamburg",
  "Ihre Nutzer-Nr.", "Frau  EG", "...", "Techem Nutzer-Nr.  Lage",
  "...str. 13  00../053...0001/0-12  EG", "D-5000 ,...", "Abrechnungseinheit",
  "C...str. 13D-48147", "M...",
  "Abrechnungszeitraum  Ihre Heizkosten  2.375,53 EUR",
  "01.05.2024 - 30.04.2025  Ihre Warmwasserkosten  204,16 EUR",
  "Ihre Kaltwasserkosten  370,66 EUR", "Ihre Betriebskosten  1.447,66 EUR",
  "Ihr Anteil an den Gesamtkosten  4.398,01 EUR", "Ihre Vorauszahlung  -3.360,00 EUR",
  "Ihre Nachzahlung  1.038,01 EUR", "Ihr Anteil an den Gesamtkosten (1)",
  "Gesamtkosten :  Gesamteinheiten (2)  =  Preis je Einheit x  Ihre Einheiten  =  Ihre Kosten",
  "in EUR  in EUR", "Heizkosten  8.136,75",
  "30% Grundkosten  2.441,03 :  470,600 m²Nutzfläche  =  5,187059 x  86,100  =  446,61",
  "70% Verbrauchskosten  5.695,72 :  37.595,000 Kilowatt-Stunden  =  0,151502 x 12.732,000  =  1.928,92",
  "Ihre Heizkosten  2.375,53", "Warmwasserkosten  1.615,08",
  "Kaltwasser für Warmwasser  -205,06", "Abwasser aus Warmwasser  -199,31",
  "zu verteilende Kosten  1.210,71",
  "30% Grundkosten  363,21 :  470,600 m²Nutzfläche  =  0,771802 x  86,100  =  66,46",
  "70% Verbrauchskosten  847,50", "Kaltwasser für Warmwasser  205,06",
  "Abwasser aus Warmwasser  199,31",
  "Verbrauchskosten  1.251,87 :  60,000 Kubikmeter  =  20,864500 x  6,600  =  137,70",
  "Ihre Warmwasserkosten  204,16", "Kaltwasserkosten  1.632,27",
  "Kaltwasser Gesamt  704,38 :  206,100 Kubikmeter  =  3,417661 x  46,800  =  159,95",
  "Schmutzwasser  684,65 :  206,100 Kubikmeter  =  3,321931 x  46,800  =  155,47",
  "Gerätewartung Kaltwasser  105,63 :  206,100 Kubikmeter  =  0,512518 x  46,800  =  23,99",
  "Verbrauchserfassung KW  137,61 :  206,100 Kubikmeter  =  0,667686 x  46,800  =  31,25",
  "Ihre Kaltwasserkosten  370,66", "Betriebskosten  8.333,07",
  "Niederschlag+Gewässergeb  129,37 :  470,600 m²Nutzfläche  =  0,274904 x  86,100  =  23,67",
  "THrg-Feulöwart.-Leuchtmit  1.730,80 :  7,000 Nutzeinheiten  =  247,257143 x  1,000  =  247,25",
  "Grundsteuer  1.552,44 :  470,600 m²Nutzfläche  =  3,298853 x  86,100  =  284,03",
  "Müllabfuhr  1.417,20 :  470,600 m²Nutzfläche  =  3,011475 x  86,100  =  259,28",
  "Straßenreinigung  48,48 :  470,600 m²Nutzfläche  =  0,103017 x  86,100  =  8,87",
  "Gebäudeversicherung  2.714,75 :  470,600 m²Nutzfläche  =  5,768700 x  86,100  =  496,69",
  "Allgemeinstrom  582,90 :  470,600 m²Nutzfläche  =  1,238632 x  86,100  =  106,64",
  "Auslaufv. matt chr 1/2", "Direktkostenanteil  8,51  davon entfallen direkt auf Sie  0,00",
  "Abrechnungsservice  148,62 :  7,000 Nutzeinheiten  =  21,231429 x  1,000  =  21,23",
  "Ihre Betriebskosten  1.447,66", "Direktkosten", "Ihre Direktkosten  0,00",
  "Ihr Anteil an den Gesamtkosten  4.398,01",
  "(1) Die Gesamtkosten können Sie der nachfolgenden Kostenaufstellung des gesamten Objektes entnehmen",
  "(2) Gesamteinheiten des Objektes", "Seite 1/4",
  "Name  Abrechnungszeitraum  Ihre Nutzer-Nr.  Techem Nutzer-Nr.",
  "r  01.05.2024 - 30.04.2025  EG  0069/05365 0001/0-12",
];

test("nkTechemAbrechnungParsen: vollständiger Beleg (echte anonymisierte Testvorlage) - 16 Positionen", () => {
  const beleg = calc.nkTechemAbrechnungParsen(TECHEM_SEITE1_ZEILEN);
  assert.equal(beleg.positionen.length, 16);
  assert.equal(beleg.von, "2024-05-01");
  assert.equal(beleg.bis, "2025-04-30");
  assert.equal(beleg.lage, "EG");
});
test("nkTechemAbrechnungParsen: spätere, anders aufgebaute Seite (z. B. Techems 'Verbrauchsanalyse') überschreibt die korrekte Lage-Erkennung von Seite 1 NICHT", () => {
  // Regressionstest für einen beim Testen mit der echten Vorlage gefundenen Bug: eine zweite,
  // per Namensabgleich unpassend gelayoutete Kopfzeile hätte "lage" mit einem Adressfragment
  // überschrieben ("sstr. 13" statt "EG"), weil zunächst der LETZTE statt der ERSTE Treffer galt.
  const verunreinigt = TECHEM_SEITE1_ZEILEN.concat([
    "Ihre Nutzer-Nr.  Frau EG r  Techem Nutzer-Nr.  Lage",
    "sstr. 13  0069/05365 0001/0-12  EG",
  ]);
  const beleg = calc.nkTechemAbrechnungParsen(verunreinigt);
  assert.equal(beleg.lage, "EG");
});
test("nkTechemAbrechnungParsen: Rubriken korrekt zugeordnet", () => {
  const beleg = calc.nkTechemAbrechnungParsen(TECHEM_SEITE1_ZEILEN);
  const nach = bez => beleg.positionen.find(p => p.bez === bez);
  assert.equal(nach("30% Grundkosten").rubrik, "Heizkosten"); // erste Fundstelle (Heizung)
  assert.equal(nach("Verbrauchskosten").rubrik, "Warmwasserkosten");
  assert.equal(nach("Kaltwasser Gesamt").rubrik, "Kaltwasserkosten");
  assert.equal(nach("Gerätewartung Kaltwasser").rubrik, "Kaltwasserkosten");
  assert.equal(nach("Grundsteuer").rubrik, "Betriebskosten");
  assert.equal(nach("Abrechnungsservice").rubrik, "Betriebskosten");
});
test("nkTechemAbrechnungParsen: Gesamtsumme der Positionen (ohne Direktkosten, die nicht über einen Verteilerschlüssel laufen)", () => {
  const beleg = calc.nkTechemAbrechnungParsen(TECHEM_SEITE1_ZEILEN);
  const summe = beleg.positionen.reduce((s, p) => s + p.gesamtbetrag, 0);
  // "Zu verteilende Gesamtkosten" (Seite 2) ist 19.778,55; Differenz von 69,89 = die bewusst NICHT
  // importierten Direktkosten (Gesamtkosten Direktkosten 61,38 + Direktkostenanteil 8,51) - beide
  // laufen über keinen Verteilerschlüssel und passen daher nicht in dieses Kostenarten-Modell.
  assert.equal(Math.round(summe * 100) / 100, 19708.66);
});

/* Ralf-Vorgabe 2026-07-13: Plausi-Hinweis beim Techem-Import – die Liegenschaft hat laut Techem
   470,6 m² über 7 Einheiten, im Objekt sind aber (noch) nicht alle Einheiten mit ihrer Fläche
   erfasst (nur eine importierte Einheit + ggf. Platzhalter). */
test("nkTechemGebaeudeAbweichung: meldet fehlende Fläche/Einheiten, solange nicht alle importiert sind", () => {
  const positionen = [
    { schluessel: "flaeche", gesamtmenge: 470.6 },
    { schluessel: "einheit", gesamtmenge: 7 }
  ];
  const E = [{ id: 1, flaeche: 47.9 }]; // nur die gerade importierte Einheit
  const r = calc.nkTechemGebaeudeAbweichung(positionen, E);
  assert.ok(Math.abs(r.flaeche.fehlt - (470.6 - 47.9)) < 1e-9);
  assert.equal(r.flaeche.gesamt, 470.6);
  assert.equal(r.einheiten.fehlt, 6);
});
test("nkTechemGebaeudeAbweichung: kein Hinweis, sobald Fläche/Einheiten-Summe passt (innerhalb Toleranz)", () => {
  const positionen = [
    { schluessel: "flaeche", gesamtmenge: 470.6 },
    { schluessel: "einheit", gesamtmenge: 7 }
  ];
  const E = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, flaeche: 470.6 / 7 }));
  const r = calc.nkTechemGebaeudeAbweichung(positionen, E);
  assert.equal(r.flaeche, undefined);
  assert.equal(r.einheiten, undefined);
});
test("nkTechemGebaeudeAbweichung: ohne Gesamtmenge in der Abrechnung kein Hinweis (nichts zu vergleichen)", () => {
  const r = calc.nkTechemGebaeudeAbweichung([{ schluessel: "verbrauch", gesamtmenge: 0 }], [{ id: 1, flaeche: 47.9 }]);
  assert.deepEqual(r, {});
});

// Ralf-Vorgabe 2026-07-11: Kopfzeilen einer zweiten, unredigierten echten Testvorlage
// ("Buick, Nathalie - 2OG-Techem2.pdf") - anders als TECHEM_SEITE1_ZEILEN oben (deren
// Absender/Name/IBAN Ralf beim Anonymisieren durch Platzhalter wie "Auftraggeber"/"....." ersetzt
// hat) zeigt diese Vorlage die echte Feldstruktur unverändert, nur mit erfundenen Dummy-Werten
// (Name "Nathalie Buick", IBAN "DE00...", Bank "Volksbank Musterstadt Nord" - keine echten Daten).
const TECHEM_KOPF_ZEILEN = [
  "Hans Lohmann", "Essener Str. 11", "D-50000 Bonn", "Heiz-, Warmwasser- und Haus-",
  "nebenkostenabrechnung 2024/2025", "Erstellt am", "18.07.2025",
  "Techem Energy Services GmbH · Zentrale Poststelle · 22780 Hamburg",
  "Ihre Nutzer-Nr.", "Frau  2 OG S", "Buick, Nathalie", "Dammstr. 11  Techem Nutzer-Nr.  Lage",
  "0069/05365 1005/0-16  2G", "D-50000 Bonn  STR", "Abrechnungseinheit", "Dammstr. 11",
  "D-50000Musterstadt",
  "Abrechnungszeitraum  Ihre Heizkosten  493,44 EUR",
  "01.05.2024 - 30.04.2025  Ihre Warmwasserkosten  243,53 EUR",
  "Menge Erdgas in kWh  Datum  Kosten  Zwischensumme  Gesamtsumme",
  "Die CO2-Abgabe beträgt  733,59 EUR",
  "Die Liegenschaft liegt mit einem CO2 -Ausstoß von 26,2 kg pro Quadratmeter und Jahr (12.332,0 kg CO2 : 470,600 m²) in",
  "Bankverbindung", "Kontoinhaber  : Hans Lohmann", "Kreditinstitut  : Volksbank Musterstadt Nord",
  "Int. Bankbezeichnung (IBAN)  : DE0000000000000000",
  // Ralf-Vorgabe 2026-07-13: Seite "Verteilung des Anteils an der CO2-Abgabe" (echte Vorlage) –
  // gebäudeweite Aufteilung der CO2-Abgabe auf Heizung/Warmwasser (unabhängig vom Mieteranteil).
  "87,75% für Heizung  =  450,61 EUR x  6,0643%  = 27,33 EUR",
  "12,25% für Warmwasser  =  62,91 EUR x  15,0785%  = 9,49 EUR",
];

test("nkTechemKopfParsen: Mieter-Name+Anrede aus 'Frau'/'Herr'-Zeile (Nachname, Vorname -> Vorname Nachname)", () => {
  const kopf = calc.nkTechemKopfParsen(TECHEM_KOPF_ZEILEN);
  assert.equal(kopf.mieterName, "Nathalie Buick");
  assert.equal(kopf.anrede, "frau");
});
test("nkTechemKopfParsen: Absender (Vermieter/Hausverwaltung) aus den ersten Zeilen vor dem Techem-Kopf", () => {
  const kopf = calc.nkTechemKopfParsen(TECHEM_KOPF_ZEILEN);
  assert.equal(kopf.absenderName, "Hans Lohmann");
  assert.equal(kopf.absenderAnschrift, "Essener Str. 11, D-50000 Bonn");
});
test("nkTechemKopfParsen: Bankverbindung (Kontoinhaber + IBAN)", () => {
  const kopf = calc.nkTechemKopfParsen(TECHEM_KOPF_ZEILEN);
  assert.equal(kopf.kontoinhaber, "Hans Lohmann");
  assert.equal(kopf.iban, "DE0000000000000000");
});
test("nkTechemKopfParsen: Energieträger aus der Verbrauchsanalyse-Zeile 'Menge X in Y'", () => {
  const kopf = calc.nkTechemKopfParsen(TECHEM_KOPF_ZEILEN);
  assert.equal(kopf.energietraeger, "Erdgas");
});
test("nkTechemKopfParsen: Gebäude-CO2 (Gesamt-kg + Gesamt-Kosten der CO2-Abgabe)", () => {
  const kopf = calc.nkTechemKopfParsen(TECHEM_KOPF_ZEILEN);
  assert.equal(kopf.co2KgGebaeude, 12332);
  assert.equal(kopf.co2KostenGebaeude, 733.59);
});
test("nkTechemKopfParsen: CO2-Aufteilung Heizung/Warmwasser (Seite 'Verteilung des Anteils an der CO2-Abgabe')", () => {
  const kopf = calc.nkTechemKopfParsen(TECHEM_KOPF_ZEILEN);
  assert.equal(kopf.co2AnteilHeizungProzent, 87.75);
  assert.equal(kopf.co2AnteilWarmwasserProzent, 12.25);
});
test("nkTechemEnergieartKey: Erdgas+kWh -> erdgas_kwh; unbekannter Text -> null (kein Raten)", () => {
  assert.equal(calc.nkTechemEnergieartKey("Erdgas", "kWh"), "erdgas_kwh");
  assert.equal(calc.nkTechemEnergieartKey("Heizöl", "l"), "heizoel");
  assert.equal(calc.nkTechemEnergieartKey("Fernwärme", "kWh"), "fernwaerme");
  assert.equal(calc.nkTechemEnergieartKey("Sonstwas", "x"), null);
});
test("nkTechemKopfParsen: unvollständige/anonymisierte Vorlage liefert leere Strings statt Fehler", () => {
  const kopf = calc.nkTechemKopfParsen(TECHEM_SEITE1_ZEILEN);
  // TECHEM_SEITE1_ZEILEN hat echte Platzhalter ("Auftraggeber"/"...") statt echter Werte -
  // die Felder werden trotzdem gefüllt (kein Crash), liefern hier nur eben die Platzhalter selbst.
  assert.equal(kopf.absenderName, "Auftraggeber");
  assert.equal(kopf.mieterName, "...");
});

/* UX-Review 2026-07-15 (Kano): Kennzahlen für den "Fertig!"-Moment nach dem ersten
   versandfertigen PDF – Jahr, Anzahl Mietverhältnisse/Einheiten, verteilte Gesamtsumme. */
test("nkFertigMoment: Jahr, Zählungen und Summe stimmen mit nkObjektAbrechnung überein", () => {
  const objekt = { von: "2025-01-01", bis: "2025-12-31" };
  const ein = [
    { name: "EG", flaeche: 70, personen: 2, mv: [{ mieter: "A", von: "2025-01-01", bis: "2025-12-31", voraus: 1800 }] },
    { name: "OG", flaeche: 30, personen: 1, mv: [
      { mieter: "B", von: "2025-01-01", bis: "2025-06-30", voraus: 600 },
      { mieter: "C", von: "2025-07-01", bis: "2025-12-31", voraus: 600 }
    ] }
  ];
  const kos = [{ bez: "Grundsteuer", betrag: 1000, schluessel: "flaeche" }];
  const f = calc.nkFertigMoment(ein, kos, objekt);
  assert.equal(f.jahr, "2025");
  assert.equal(f.mieter, 3);
  assert.equal(f.einheiten, 2);
  const ab = calc.nkObjektAbrechnung(ein, kos, objekt);
  assert.equal(f.summe, ab.summeAnteil);
});

/* UX-Review 2026-07-15 (Kano): sichtbarer Jahresvergleich – €/m²·Monat über die Jahrgänge
   desselben Objekts (Namens-Match wie nkFindVorjahr), aufsteigend sortiert. */
test("nkJahresverlauf: sortiert die Jahrgänge desselben Objekts, markiert das aktive Jahr", () => {
  const mk = (addr, jahr, betrag, flaeche) => ({
    objekt: { addr: addr, von: jahr + "-01-01", bis: jahr + "-12-31" },
    einheiten: [{ name: "EG", flaeche: flaeche }],
    kosten: [{ bez: "Grundsteuer", betrag: betrag }]
  });
  const objekte = [
    mk("Lindenhof 1", "2025", 2400, 100), /* aktiv */
    mk("Lindenhof 1", "2024", 1200, 100),
    mk("Andere Straße 9", "2024", 9999, 100) /* anderes Objekt – darf nicht auftauchen */
  ];
  const v = calc.nkJahresverlauf(objekte, 0);
  assert.equal(v.length, 2);
  assert.deepEqual(v.map(x => x.jahr), ["2024", "2025"]);
  assert.deepEqual(v.map(x => x.aktiv), [false, true]);
  assert.equal(v[0].eurQmMonat, 1);  /* 1200 € / 100 m² / 12 */
  assert.equal(v[1].eurQmMonat, 2);  /* 2400 € / 100 m² / 12 */
  assert.equal(v[1].gesamt, 2400);
});
test("nkJahresverlauf: Jahrgänge ohne Fläche werden übersprungen; doppeltes Jahr – aktives Objekt gewinnt", () => {
  const mk = (jahr, betrag, flaeche) => ({
    objekt: { addr: "Lindenhof 1", von: jahr + "-01-01", bis: jahr + "-12-31" },
    einheiten: [{ name: "EG", flaeche: flaeche }],
    kosten: [{ bez: "Grundsteuer", betrag: betrag }]
  });
  const objekte = [
    mk("2024", 1200, 0),    /* keine Fläche -> übersprungen */
    mk("2025", 2400, 100),  /* Dublette, nicht aktiv -> unterliegt */
    mk("2025", 3600, 100)   /* aktiv -> gewinnt */
  ];
  const v = calc.nkJahresverlauf(objekte, 2);
  assert.equal(v.length, 1);
  assert.equal(v[0].jahr, "2025");
  assert.equal(v[0].gesamt, 3600);
  assert.equal(v[0].aktiv, true);
});
test("nkJahresverlauf: ohne aktives Objekt oder ohne Namen leeres Ergebnis", () => {
  assert.deepEqual(calc.nkJahresverlauf([], 0), []);
  assert.deepEqual(calc.nkJahresverlauf([{ objekt: { addr: "" }, einheiten: [], kosten: [] }], 0), []);
});
