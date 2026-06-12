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

/* Sichtbare Einheiten je Rolle (US-16, Datenschutz):
   Mieter sieht ausschließlich die eigene Einheit, Eigentümer alle. */
function nkVisibleEinheiten(einheiten, role, ownIndex) {
  if (role === "mieter") {
    const own = einheiten[ownIndex];
    return own ? [own] : [];
  }
  return einheiten;
}

/* Export nur in Node (für die Tests); im Browser wird dieser Block ignoriert,
   und die Funktionen stehen global zur Verfügung. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { nkTotals, nkFactor, nkAnteilOf, nkLineItemsFor, nkVisibleEinheiten };
}
