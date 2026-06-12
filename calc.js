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
    return { bez: k.bez, gesamt: +k.betrag || 0, schluessel: k.schluessel, anteil: (+k.betrag || 0) * f };
  });
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

/* Export nur in Node (für die Tests); im Browser wird dieser Block ignoriert,
   und die Funktionen stehen global zur Verfügung. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { nkTotals, nkFactor, nkAnteilOf, nkLineItemsFor, nkOwnerOverview };
}
