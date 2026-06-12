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
  const gesamtAnteile = einheiten.reduce((s, e) => s + calc.nkAnteilOf(e, kosten, t), 0);
  assert.ok(Math.abs(gesamtAnteile - gesamtKosten) < 1e-6);
});

test("lineItemsFor liefert je Kostenart eine Zeile mit korrektem Anteil", () => {
  const t = calc.nkTotals(einheiten);
  const items = calc.nkLineItemsFor(einheiten[0], kosten, t);
  assert.equal(items.length, kosten.length);
  const muell = items.find(i => i.schluessel === "einheit"); // 900 / 3 = 300
  assert.ok(Math.abs(muell.anteil - 300) < 1e-9);
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

test("Umlagefähigkeit je Kostenart (US-04)", () => {
  assert.equal(calc.nkUmlageInfo("Grundsteuer").umlagefaehig, true);
  assert.equal(calc.nkUmlageInfo("Wasser / Abwasser").umlagefaehig, true);
  assert.equal(calc.nkUmlageInfo("Verwaltungskosten").umlagefaehig, false);
  assert.equal(calc.nkUmlageInfo("Instandhaltung Dach").umlagefaehig, false);
  assert.equal(calc.nkUmlageInfo("Reparatur Heizung").umlagefaehig, false);
  assert.equal(calc.nkUmlageInfo("Kabel-/Fernsehsignal").umlagefaehig, false);
  assert.ok(calc.nkUmlageInfo("Kabel-/Fernsehsignal").grund.length > 0);
});
