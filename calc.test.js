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
  const gew = calc.nkMieterBetrag([{anteil:107, vorsteuer:7}], true);
  assert.ok(Math.abs(gew.netto - 100) < 1e-9);
  assert.ok(Math.abs(gew.ust - 19) < 1e-9);
  assert.ok(Math.abs(gew.brutto - 119) < 1e-9);
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
    zahlung:{iban:"DE12",empfaenger:"V"}
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
    zahlung:{iban:"DE12",empfaenger:"V"}
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

test("Vorjahr übernehmen: Zeitraum +1J, Beträge leer, ausgezogene MV weg (US-11)", () => {
  const src = {
    objekt: { addr: "Teststr. 1", von: "2025-01-01", bis: "2025-12-31" },
    einheiten: [
      { id: 1, name: "EG", flaeche: 70, personen: 2, mv: [
        { mieter: "Becker", von: "2025-01-01", bis: "2025-12-31", vmonat: 150, vmonate: 12, voraus: 1800, bezahlt: { "2025-01": true } }
      ]},
      { id: 2, name: "1. OG", flaeche: 85, personen: 3, mv: [
        { mieter: "Sahin", von: "2025-01-01", bis: "2025-08-31", vmonat: 175, vmonate: 8, voraus: 1400 },
        { mieter: "Neu",   von: "2025-10-01", bis: "2025-12-31", vmonat: 175, vmonate: 3, voraus: 525 }
      ]}
    ],
    kosten: [{ bez: "Grundsteuer", betrag: 1200, schluessel: "flaeche" }],
    zahlung: { iban: "DE12", empfaenger: "V" }
  };
  const neu = calc.nkVorjahrUebernehmen(src);
  assert.equal(neu.objekt.von, "2026-01-01");
  assert.equal(neu.objekt.bis, "2026-12-31");
  assert.equal(neu.vorjahr, true);
  assert.equal(neu.kosten[0].betrag, 0);
  assert.equal(neu.kosten[0].schluessel, "flaeche");
  assert.equal(neu.kosten[0].vorjahr, true);
  assert.equal(neu.einheiten[0].mv.length, 1);
  assert.equal(neu.einheiten[1].mv.length, 1);
  assert.equal(neu.einheiten[1].mv[0].mieter, "Neu");
  assert.equal(neu.einheiten[1].mv[0].von, "2026-01-01");
  assert.equal(neu.einheiten[1].mv[0].bis, "2026-12-31");
  assert.equal(neu.einheiten[1].mv[0].vmonate, 12);
  assert.equal(neu.einheiten[1].mv[0].voraus, 175 * 12);
  assert.deepEqual(neu.einheiten[0].mv[0].bezahlt, {});
  assert.equal(neu.zahlung.iban, "DE12");
  assert.equal(src.objekt.von, "2025-01-01");
  assert.equal(src.kosten[0].betrag, 1200);
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
