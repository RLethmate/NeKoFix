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
/* US-53: Abrechnung als amtliches PDF im DIN-Briefformat. */
function buildTenantPdf(sel){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'pt', format:'a4'});
  const e=sel.e, m=sel.m;
  const ab=nkMieterAbrechnung(e, m, state.kosten, state.objekt, state.einheiten);
  const z=state.zahlung||{};
  const gew=ab.gewerblich, anteil=ab.brutto, saldo=ab.saldo;
  const L=56, R=540, W=R-L;
  const nl=(t)=>{ if(y>780){ doc.addPage(); y=64; } doc.text(t,L,y); y+=14; };
  // Absenderzeile (klein)
  doc.setFontSize(8); doc.setTextColor(110);
  const abs=[z.empfaenger, z.anschrift].filter(Boolean).join(' · ');
  if(abs) doc.text(abs, L, 70);
  // Datum rechts
  doc.setFontSize(10); doc.setTextColor(0);
  doc.text(new Date().toLocaleDateString('de-DE'), R, 92, {align:'right'});
  // Empfänger-Anschriftfeld
  let y=110; doc.setFontSize(11);
  doc.text(String(m.mieter||''), L, y); y+=14;
  doc.text(String(e.name+' · '+state.objekt.addr), L, y);
  // Betreff
  y=180; doc.setFont(undefined,'bold'); doc.setFontSize(12);
  doc.splitTextToSize('Betriebs- und Heizkostenabrechnung '+zeitraumSatz(), W).forEach(l=>{ doc.text(l,L,y); y+=16; });
  doc.setFont(undefined,'normal'); doc.setFontSize(10);
  // Anrede + Einleitung
  y+=8; nl(nkAnrede(m)+','); y+=4;
  doc.splitTextToSize('anbei erhalten Sie die Betriebs- und Heizkostenabrechnung für '+zeitraumSatz()+'. Nachstehend finden Sie die Aufstellung der Kosten, Ihren Anteil und die Verrechnung mit den geleisteten Vorauszahlungen.', W).forEach(l=>nl(l));
  y+=10;
  // Tabellenkopf
  doc.setFont(undefined,'bold');
  doc.text('Kostenart',L,y); doc.text('Gesamtkosten',330,y,{align:'right'}); doc.text('Schlüssel',345,y); doc.text(gew?'Anteil netto':'Ihr Anteil',R,y,{align:'right'});
  doc.setFont(undefined,'normal'); y+=4; doc.line(L,y,R,y); y+=14;
  ab.zeilen.forEach((i,ix)=>{
    if(Math.round(i.anteil*100)===0) return; /* US-22/US-50: 0-€-Zeilen weglassen */
    if(y>770){ doc.addPage(); y=64; }
    doc.text(String(i.bez).substring(0,30),L,y);
    doc.text(eur(i.gesamt),330,y,{align:'right'});
    doc.setFontSize(8); doc.setTextColor(110);
    doc.text(String(schluesselAnzeige(state.kosten[ix])).substring(0,28),345,y);
    doc.setFontSize(10); doc.setTextColor(0);
    doc.text(eur(i.wert),R,y,{align:'right'}); y+=14;
  });
  y+=4; doc.line(L,y,R,y); y+=16;
  if(gew){
    doc.text('Zwischensumme netto',L,y); doc.text(eur(ab.netto),R,y,{align:'right'}); y+=14;
    doc.text('zzgl. '+NK_UST_SATZ+' % Umsatzsteuer',L,y); doc.text(eur(ab.ust),R,y,{align:'right'}); y+=16;
    doc.setFont(undefined,'bold'); doc.text('Ihr Anteil (brutto)',L,y); doc.text(eur(anteil),R,y,{align:'right'}); doc.setFont(undefined,'normal'); y+=16;
  } else {
    doc.setFont(undefined,'bold'); doc.text('Ihr Anteil an den Gesamtkosten',L,y); doc.text(eur(anteil),R,y,{align:'right'}); doc.setFont(undefined,'normal'); y+=16;
  }
  // US-07: CO2-Kostenaufteilung ausweisen (Anteil enthält den Abzug bereits).
  if(ab.co2 && ab.co2.aktiv){
    doc.setFontSize(9); doc.setTextColor(90);
    nl('CO2-Kostenaufteilung (CO2KostAufG):');
    doc.splitTextToSize('CO2-Kosten gesamt (Gebäude) '+eur(co2KostenGesamt())+', Ihr Anteil '+eur(ab.co2.kostenMieter)+'. '+nkCo2Erklaerung(ab.co2)+' Davon trägt der Vermieter – '+eur(ab.co2.abzug)+' (in Ihrem Anteil oben bereits abgezogen).', W).forEach(l=>nl(l));
    doc.setFontSize(10); doc.setTextColor(0); y+=6;
  }
  doc.text('abzüglich Vorauszahlungen',L,y); doc.text(eur(ab.vorauszahlung),R,y,{align:'right'}); y+=16;
  doc.setFont(undefined,'bold');
  doc.text(saldo>0?'Nachzahlung':'Guthaben',L,y); doc.text(eur(Math.abs(saldo)),R,y,{align:'right'});
  doc.setFont(undefined,'normal'); y+=26;
  // Zahlungsmodalitäten
  (saldo>0
    ? ['Bitte überweisen Sie den Betrag innerhalb von '+(z.frist||'14 Tage nach Zugang')+' auf folgendes Konto:',
       'Empfänger: '+(z.empfaenger||'')+'    IBAN: '+(z.iban||'')+'    BIC: '+(z.bic||''),
       'Verwendungszweck: NK '+e.name+' '+zeitraumText()]
    : ['Das Guthaben wird Ihnen innerhalb von '+((z.frist||'14 Tage').replace(/\s*nach Zugang/i,'').replace(/\bTage\b/,'Tagen'))+' erstattet.']
  ).forEach(l=>nl(l));
  y+=8; doc.setFontSize(8); doc.setTextColor(110);
  doc.splitTextToSize('Einwendungen gegen diese Abrechnung können Sie innerhalb von 12 Monaten nach Zugang geltend machen.', W).forEach(l=>{ if(y>790){doc.addPage();y=64;} doc.text(l,L,y); y+=11; });
  doc.setFontSize(10); doc.setTextColor(0); y+=20;
  nl('Mit freundlichen Grüßen'); y+=18; nl(String(z.empfaenger||''));
  return doc;
}
function exportTenantPdf(){ if(!ensurePdfLib())return; const sel=alleMV()[activeMieter]; if(sel) buildTenantPdf(sel).save("Abrechnung-"+pdfSafeName(sel.m.mieter)+".pdf"); }
/* US-52: Abrechnungs-PDF erzeugen und teilen (Web Share API mit Datei) – Anhang, wo unterstützt;
   sonst Fallback: herunterladen und manuell anhängen. */
async function sharePdfAktiv(){
  if(!ensurePdfLib()) return;
  const sel=alleMV()[activeMieter]; if(!sel) return;
  const doc=buildTenantPdf(sel);
  const fname="Abrechnung-"+pdfSafeName(sel.m.mieter)+".pdf";
  const email=(sel.m.email||"").trim();
  const titel="Betriebs- und Heizkostenabrechnung "+state.objekt.addr;
  const text=nkAnrede(sel.m)+",\n\nanbei erhalten Sie die Betriebs- und Heizkostenabrechnung für "+zeitraumSatz()+" als PDF. Bei Fragen stehe ich Ihnen gern zur Verfügung.\n\nMit freundlichen Grüßen\n"+((state.zahlung&&state.zahlung.empfaenger)||"");
  let file=null;
  try{ file=new File([doc.output("blob")], fname, {type:"application/pdf"}); }catch(e){ file=null; }
  if(file && navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:titel, text:text}); }
    catch(e){ /* vom Nutzer abgebrochen – nichts tun */ }
  } else {
    doc.save(fname);
    alert("Teilen mit Anhang wird hier nicht unterstützt. Das PDF wurde heruntergeladen – bitte manuell an eine E-Mail"+(email?" an "+email:"")+" anhängen.");
  }
}
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
