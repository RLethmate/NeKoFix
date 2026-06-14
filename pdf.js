/* NeKoFix – PDF-Export (US-18), ausgelagert aus index.html (US-33).
   Klassisches Script, nach calc.js und dem Haupt-Skript geladen. Nutzt die globalen
   Helfer/Daten (state, eur, fmtDatum, zeitraumText, alleMV, activeMieter) und den
   Rechenkern (nkMieterAbrechnung, nkObjektAbrechnung, nkTotals). Erfordert jsPDF. */

function pdfSafeName(s){ return String(s).replace(/[^\wäöüÄÖÜß .-]/g,'_').trim(); }
function ensurePdfLib(){
  if(!(window.jspdf && window.jspdf.jsPDF)){
    alert("Die PDF-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen, einen evtl. Adblocker deaktivieren und die Seite neu laden.");
    return false;
  }
  return true;
}
function buildTenantPdf(sel){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'pt', format:'a4'});
  const e=sel.e, m=sel.m;
  const ab=nkMieterAbrechnung(e, m, state.kosten, state.objekt, nkTotals(state.einheiten));
  const gew=ab.gewerblich, anteil=ab.brutto, saldo=ab.saldo;
  let y=56;
  doc.setFontSize(16); doc.text("Betriebs- und Heizkostenabrechnung",56,y); y+=24;
  doc.setFontSize(10);
  doc.text(state.objekt.addr+"  ·  Einheit "+e.name+(gew?"  ·  gewerblich":""),56,y); y+=14;
  doc.text("Mieter: "+m.mieter+"   ·   Mietzeit: "+fmtDatum(m.von)+"–"+fmtDatum(m.bis)+"   ·   Zeitraum: "+zeitraumText(),56,y); y+=22;
  doc.setFont(undefined,'bold');
  doc.text("Kostenart",56,y); doc.text("Gesamtkosten",380,y,{align:'right'}); doc.text(gew?"Anteil netto":"Ihr Anteil",540,y,{align:'right'});
  doc.setFont(undefined,'normal'); y+=6; doc.line(56,y,540,y); y+=14;
  ab.zeilen.forEach(i=>{ doc.text(String(i.bez).substring(0,42),56,y); doc.text(eur(i.gesamt),380,y,{align:'right'}); doc.text(eur(i.wert),540,y,{align:'right'}); y+=14; });
  y+=4; doc.line(56,y,540,y); y+=16;
  if(gew){
    doc.text("Zwischensumme netto",56,y); doc.text(eur(ab.netto),540,y,{align:'right'}); y+=14;
    doc.text("zzgl. "+NK_UST_SATZ+" % Umsatzsteuer",56,y); doc.text(eur(ab.ust),540,y,{align:'right'}); y+=16;
    doc.setFont(undefined,'bold'); doc.text("Ihr Anteil (brutto)",56,y); doc.text(eur(anteil),540,y,{align:'right'}); y+=18;
  } else {
    doc.setFont(undefined,'bold'); doc.text("Ihr Anteil an den Gesamtkosten",56,y); doc.text(eur(anteil),540,y,{align:'right'}); y+=18;
  }
  doc.text((saldo>0?"Nachzahlung":"Guthaben")+": "+eur(Math.abs(saldo)),56,y);
  doc.setFont(undefined,'normal'); y+=22;
  const lines = (saldo>0
    ? ["Bitte überweisen Sie den Betrag innerhalb von "+state.zahlung.frist+".",
       "Empfänger: "+state.zahlung.empfaenger+"   IBAN: "+state.zahlung.iban+"   BIC: "+state.zahlung.bic,
       "Verwendungszweck: NK "+e.name+" "+zeitraumText()]
    : ["Das Guthaben wird Ihnen innerhalb von "+state.zahlung.frist+" erstattet."]);
  lines.forEach(l=>{ doc.text(l,56,y); y+=14; });
  return doc;
}
function exportTenantPdf(){ if(!ensurePdfLib())return; const sel=alleMV()[activeMieter]; if(sel) buildTenantPdf(sel).save("Abrechnung-"+pdfSafeName(sel.m.mieter)+".pdf"); }
function exportAllTenantPdfs(){ if(!ensurePdfLib())return; alleMV().forEach(sel=> buildTenantPdf(sel).save("Abrechnung-"+pdfSafeName(sel.m.mieter)+"-"+pdfSafeName(sel.e.name)+".pdf")); }
function exportOwnerOverviewPdf(){
  if(!ensurePdfLib())return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'pt', format:'a4'});
  let y=56;
  doc.setFontSize(16); doc.text("Eigentümer-Gesamtübersicht",56,y); y+=22;
  doc.setFontSize(10); doc.text(state.objekt.addr+"  ·  Zeitraum: "+zeitraumText(),56,y); y+=22;
  doc.setFont(undefined,'bold');
  doc.text("Mieter / Einheit",56,y); doc.text("Anteil",330,y,{align:'right'}); doc.text("Vorauszahlung",440,y,{align:'right'}); doc.text("Saldo",540,y,{align:'right'});
  doc.setFont(undefined,'normal'); y+=6; doc.line(56,y,540,y); y+=14;
  const ab=nkObjektAbrechnung(state.einheiten, state.kosten, state.objekt);
  ab.einheiten.forEach(er=>{
    er.mietverhaeltnisse.forEach(mv=>{
      const a=mv.brutto, v=mv.vorauszahlung, s=mv.saldo;
      doc.text((mv.mieter+" / "+er.name+(mv.gewerblich?" (gewerbl.)":"")).substring(0,38),56,y); doc.text(eur(a),330,y,{align:'right'}); doc.text(eur(v),440,y,{align:'right'}); doc.text((s>0?"+":"")+eur(s),540,y,{align:'right'}); y+=14;
    });
    if(er.leerstandZeitanteil>NK_LEERSTAND_EPS){ doc.text(("Leerstand / "+er.name).substring(0,38),56,y); doc.text(eur(er.leerstandBetrag),330,y,{align:'right'}); doc.text("–",440,y,{align:'right'}); doc.text("Vermieter",540,y,{align:'right'}); y+=14; }
  });
  y+=4; doc.line(56,y,540,y); y+=16; doc.setFont(undefined,'bold');
  doc.text("Summe",56,y); doc.text(eur(ab.summeAnteil),330,y,{align:'right'}); doc.text(eur(ab.summeVoraus),440,y,{align:'right'}); doc.text(eur(ab.summeSaldo),540,y,{align:'right'});
  doc.save("Eigentuemer-Uebersicht.pdf");
}
