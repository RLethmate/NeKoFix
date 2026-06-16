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
  y+=8;
  // US-62: kompakter Ergebnis-Block oben (Techem-Stil, 3 Zeilen) – dezenter Kasten mit Rahmen.
  const boxB=R-260; // schmaler Kasten links
  doc.setDrawColor(0); doc.setLineWidth(0.8); doc.rect(L, y, boxB-L, 52, 'S');
  let yy=y+15; doc.setTextColor(0); doc.setFont(undefined,'normal'); doc.setFontSize(10);
  doc.text('Ihr Anteil an den Gesamtkosten', L+8, yy); doc.text(eur(anteil), boxB-8, yy, {align:'right'}); yy+=14;
  doc.text('Ihre Vorauszahlung', L+8, yy); doc.text(eur(ab.vorauszahlung), boxB-8, yy, {align:'right'}); yy+=16;
  doc.setFont(undefined,'bold'); doc.setFontSize(11);
  doc.text(saldo>0?'Ihre Nachzahlung':'Ihr Guthaben', L+8, yy); doc.text(eur(Math.abs(saldo)), boxB-8, yy, {align:'right'});
  doc.setFont(undefined,'normal'); doc.setFontSize(10); y+=52+12;
  // Tabellenkopf
  // US-59: Spaltenformat (Gesamt · Einheiten · Preis/Einh. · Ihre Einheiten · Anteil), je Rubrik gruppiert.
  const cG=250, cB=330, cP=400, cI=470; // rechte Kanten der Zahlenspalten
  const fmtE=n=>(Number(n)||0).toLocaleString('de-DE',{maximumFractionDigits:2});
  const fmtP=n=>(Number(n)||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:4});
  doc.setFont(undefined,'bold'); doc.setFontSize(8);
  doc.text('Kostenart',L,y); doc.text('Gesamt',cG,y,{align:'right'}); doc.text('Einh.',cB,y,{align:'right'}); doc.text('Preis',cP,y,{align:'right'}); doc.text('Ihre Einh.',cI,y,{align:'right'}); doc.text(gew?'Anteil netto':'Anteil',R,y,{align:'right'});
  doc.setFont(undefined,'normal'); doc.setFontSize(10); y+=4; doc.line(L,y,R,y); y+=13;
  NK_RUBRIKEN.forEach(rub=>{
    const grp=ab.zeilen.map((i,ix)=>({i,ix})).filter(o=>Math.round(o.i.anteil*100)!==0 && nkRubrik(state.kosten[o.ix])===rub);
    if(!grp.length) return;
    if(y>755){ doc.addPage(); y=64; }
    doc.setFont(undefined,'bold'); doc.setFontSize(9); doc.text(rub,L,y); doc.setFont(undefined,'normal'); doc.setFontSize(8); y+=13;
    let sub=0;
    grp.forEach(({i})=>{
      if(y>772){ doc.addPage(); y=64; }
      const direkt=i.schluessel==='direkt';
      doc.text(String(i.bez).substring(0,26),L+10,y);
      doc.text(eur(i.gesamt),cG,y,{align:'right'});
      doc.text(direkt?'direkt':(fmtE(i.basis)+' '+i.einheitLabel),cB,y,{align:'right'});
      doc.text(direkt?'—':fmtP(i.preisJeEinheit),cP,y,{align:'right'});
      doc.text(direkt?'100 %':(fmtE(i.ihreEinheiten)+' '+i.einheitLabel),cI,y,{align:'right'});
      doc.text(eur(i.wert)+(i.zeitanteil<0.999?' (×'+Math.round(i.zeitanteil*100)+'%)':''),R,y,{align:'right'}); y+=12; sub+=i.wert;
    });
    doc.setFont(undefined,'bold'); doc.text('Zwischensumme '+rub,L+10,y); doc.text(eur(sub),R,y,{align:'right'}); doc.setFont(undefined,'normal'); y+=15;
  });
  doc.setFontSize(10); y+=2; doc.line(L,y,R,y); y+=16;
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
  // Vorauszahlung/Saldo stehen bereits im Ergebnis-Block oben (US-62) – hier nicht wiederholen.
  y+=4;
  // US-62: §35a als zwei Volltabellen (nur private Mietverhältnisse)
  function p35aTab(kat, titel, elster){
    const rows=(ab.p35a.posten||[]).filter(x=>x.kategorie===kat);
    if(!rows.length) return;
    if(y>735){ doc.addPage(); y=64; }
    doc.setFont(undefined,'bold'); doc.setFontSize(9); doc.text(titel,L,y); doc.setFont(undefined,'normal'); doc.setFontSize(8);
    doc.text('Gesamtkosten',360,y,{align:'right'}); doc.text('dav. Arbeitsk.',450,y,{align:'right'}); doc.text('Ihr Anteil',R,y,{align:'right'}); y+=4; doc.line(L,y,R,y); y+=12;
    let sg=0,sa=0,sw=0;
    rows.forEach(x=>{ if(y>775){doc.addPage();y=64;} sg+=x.gesamt;sa+=x.arbeitskosten;sw+=x.anteil;
      doc.text(String(x.bez).substring(0,34),L,y); doc.text(eur(x.gesamt),360,y,{align:'right'}); doc.text(eur(x.arbeitskosten),450,y,{align:'right'}); doc.text(eur(x.anteil),R,y,{align:'right'}); y+=12; });
    doc.setFont(undefined,'bold'); doc.text('Gesamtsumme',L,y); doc.text(eur(sg),360,y,{align:'right'}); doc.text(eur(sa),450,y,{align:'right'}); doc.text(eur(sw),R,y,{align:'right'}); doc.setFont(undefined,'normal'); y+=12;
    doc.setFontSize(8); doc.setTextColor(110); doc.splitTextToSize('Eintrag in Elster: '+elster+'.', W).forEach(l=>nl(l)); doc.setTextColor(0); doc.setFontSize(10); y+=4;
  }
  if(ab.p35a && ab.p35a.aktiv){
    if(y>700){ doc.addPage(); y=64; }
    doc.setFont(undefined,'bold'); doc.setFontSize(10); nl('Steuerlich absetzbar (§35a EStG)'); doc.setFont(undefined,'normal');
    doc.setFontSize(8); doc.setTextColor(110); doc.splitTextToSize('Nach bestem Wissen ermittelt – keine Steuerberatung. Einzelbeträge ggf. der beigefügten Rechnung entnehmen. Steuerjahr '+NK_P35A_STEUERJAHR+'.', W).forEach(l=>nl(l)); doc.setTextColor(0); doc.setFontSize(10); y+=4;
    p35aTab('dienstleistung','§35a Abs. 2 · Haushaltsnahe Dienstleistungen', NK_P35A.dienstleistung.elster);
    p35aTab('handwerker','§35a Abs. 3 · Handwerkerleistungen', NK_P35A.handwerker.elster);
  }
  // Zahlungsmodalitäten
  const vzweck='NK-Abr. '+(state.objekt.addr||'')+'-'+e.name+'-'+m.mieter+'-'+zeitraumText(); // US-55: Verwendungszweck
  (saldo>0
    ? ['Bitte überweisen Sie den Betrag innerhalb von '+(z.frist||'14 Tage nach Zugang')+' auf folgendes Konto:',
       'Empfänger: '+(z.empfaenger||'')+'    IBAN: '+(z.iban||'')+'    BIC: '+(z.bic||''),
       'Verwendungszweck: '+vzweck]
    : ['Das Guthaben wird Ihnen innerhalb von '+((z.frist||'14 Tage').replace(/\s*nach Zugang/i,'').replace(/\bTage\b/,'Tagen'))+' erstattet.']
  ).forEach(l=>nl(l));
  // US-55: GiroCode (EPC-QR) bei Nachzahlung – Überweisung per Banking-App ohne Abtippen.
  if(saldo>0 && nkIbanGueltig(z.iban)){
    const giro=nkGiroCode({ empfaenger:z.empfaenger, iban:z.iban, bic:z.bic, betrag:saldo, zweck:vzweck });
    let url=null;
    if(giro && typeof qrcode!=='undefined'){
      try{ if(qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) qrcode.stringToBytes=qrcode.stringToBytesFuncs['UTF-8'];
        const qr=qrcode(0,'M'); qr.addData(giro); qr.make(); url=qr.createDataURL(4,8); }catch(e){ url=null; }
    }
    if(url){ y+=6; const qs=80; if(y+qs>800){ doc.addPage(); y=64; }
      doc.addImage(url,'GIF',L,y,qs,qs);
      doc.setFontSize(9); doc.setFont(undefined,'bold'); doc.text('GiroCode',L+qs+12,y+14); doc.setFont(undefined,'normal'); doc.setFontSize(8); doc.setTextColor(110);
      doc.splitTextToSize('In Ihrer Banking-App scannen – Betrag, IBAN und Verwendungszweck sind hinterlegt. Bitte vor dem Absenden prüfen.', W-qs-12).forEach((l,i)=>doc.text(l,L+qs+12,y+28+i*11));
      doc.setTextColor(0); doc.setFontSize(10); y+=qs+10; }
  }
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
