/* NeKoFix – Excel-Export (US-117), klassisches Script, nach calc.js/core.js/view.js geladen.
   Exportiert das aktive Objekt als .xlsx mit Reitern wie im Tool: „Objekt & Einheiten", „Kosten",
   „Berechnung", „Abrechnung". Der Kern-Rechenweg (Verteilung nach Fläche/beheizter Fläche/Personen/
   Einheit) steht als LEBENDE FORMEL im Reiter „Berechnung" und verweist über Blätter hinweg auf
   „Kosten" (Betrag) und „Objekt & Einheiten" (Flächen/Personen); „Abrechnung" verweist auf die
   Einheit-Namen und rechnet USt/Saldo per Formel. Bewusst als WERTE: Verbrauchs-/Direktverteilung,
   Zeitanteil und CO2. Formelzellen tragen zusätzlich den berechneten Wert (v). Nutzt SheetJS per CDN. */
function ensureXlsxLib(){
  if(!(window.XLSX && XLSX.utils)){
    alert("Die Excel-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen, einen evtl. Adblocker deaktivieren und die Seite neu laden.");
    return false;
  }
  return true;
}
function exportExcel(){
  if(!ensureXlsxLib()) return;
  const XL=window.XLSX;
  const E=state.einheiten||[], K=state.kosten||[], O=state.objekt||{};
  const n=E.length;
  const wb=XL.utils.book_new();
  /* Formelzelle MIT zwischengespeichertem Wert (v) schreiben: Excel/LibreOffice rechnen live,
     Viewer ohne Neuberechnung (z. B. macOS-Vorschau) zeigen trotzdem sofort die Zahl.
     t:'s' für Text-Formeln (z. B. Namensverweis), sonst Zahl. */
  const mkSheet=(aoa, formeln)=>{ const ws=XL.utils.aoa_to_sheet(aoa);
    (formeln||[]).forEach(f=>{ const cell={t:f.t||'n', f:f.f};
      if(f.v!==undefined) cell.v = (cell.t==='n' && isFinite(f.v)) ? Math.round(f.v*100)/100 : f.v;
      ws[XL.utils.encode_cell({r:f.r,c:f.c})]=cell; }); return ws; };
  const OE="'Objekt & Einheiten'"; /* Blattname für Formelverweise (mit Leerzeichen/&) */

  /* --- Reiter „Objekt & Einheiten": Einheiten-Tabelle (beheizt/Summen als Formel) + Objektkopf --- */
  const einAoa=[["Einheit","Fläche (m²)","unbeheizt (m²)","beheizt (m²)","Personen"]];
  E.forEach(e=>einAoa.push([String(e.name||""), +e.flaeche||0, +e.unbeheizt||0, null, +e.personen||0]));
  einAoa.push(["Summe", null, null, null, null]);
  einAoa.push([]);
  einAoa.push(["Objekt", String(O.name||O.addr||"")]);
  einAoa.push(["Adresse", String(O.addr||"")]);
  einAoa.push(["Abrechnungszeitraum", (O.von||"")+" – "+(O.bis||"")]);
  einAoa.push(["Hinweis", "Reiter Berechnung: Anteile als Formel; Verbrauch/Direkt/Zeitanteil/USt-Gesamt/CO2 als Werte."]);
  const einForm=[]; const totR=n+1; /* 0-basiert: Header 0, Daten 1..n, Summe n+1 */
  const sumSp=[0,0,0,0]; /* Fläche, unbeheizt, beheizt, Personen */
  for(let j=0;j<n;j++){ const rr=j+2, fl=+E[j].flaeche||0, ub=+E[j].unbeheizt||0, be=Math.max(0,fl-ub), pe=+E[j].personen||0;
    einForm.push({r:j+1,c:3,f:"B"+rr+"-C"+rr, v:be}); /* beheizt = Fläche−unbeheizt */
    sumSp[0]+=fl; sumSp[1]+=ub; sumSp[2]+=be; sumSp[3]+=pe; }
  [1,2,3,4].forEach(c=>{ const L=nkColLetter(c+1); einForm.push({r:totR,c:c,f:"SUM("+L+"2:"+L+(n+1)+")", v:sumSp[c-1]}); });
  XL.utils.book_append_sheet(wb, mkSheet(einAoa, einForm), "Objekt & Einheiten");

  /* --- Reiter „Kosten": Betrag ist die Quelle, auf die „Berechnung" verweist --- */
  const kosAoa=[["Nr","Kostenart","Betrag (€)","Schlüssel","Vorsteuer %","Rubrik"]];
  K.forEach((k,i)=>kosAoa.push([i+1, String(k.bez||""), +k.betrag||0, String(k.schluessel||""), +k.vorsteuer||0, (typeof nkRubrik==="function"?nkRubrik(k):"")]));
  XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(kosAoa), "Kosten");

  /* --- Reiter „Berechnung": Anteil je Einheit als Formel; Betrag verweist auf „Kosten" ---
     Heizblöcke werden aufgeteilt (Grund nach beheizter Fläche = Formel, Verbrauch = Wert). */
  const header=["Kostenart","Schlüssel","Betrag (€)"].concat(E.map(e=>String(e.name||""))).concat(["Summe (Kontrolle)"]);
  const verAoa=[header];
  const verForm=[];
  const einCol={flaeche:"B", beheizt:"D", person:"E"};
  const einTot={flaeche:"B"+(n+2), beheizt:"D"+(n+2), person:"E"+(n+2)};
  const sumCol=3+n; /* 0-basiert: Kontroll-Spalte */
  let vr=0; /* 0-basierte Datenzeile (nach Header) */
  K.forEach((k,ki)=>{
    const kr=ki+2; /* Quell-Zeile im Reiter „Kosten" (1-basiert) */
    const parts=(typeof nkExpandHeizSplit==="function")?nkExpandHeizSplit([k],E):[k];
    parts.forEach(part=>{
      vr++; const rr=vr+1; /* 1-basierte Blattzeile */
      const betrag=+part.betrag||0, schl=part.schluessel;
      const hatAus=Array.isArray(part.ausgeschlossen)&&part.ausgeschlossen.length>0;
      const formelBar=(!hatAus)&&(schl in einCol || schl==="einheit");
      let betragF="Kosten!C"+kr; /* Betrag verweist auf „Kosten" (Split anteilig) */
      if(part._split==="grund") betragF="Kosten!C"+kr+"*"+nkHeizGrundProzent(k)+"/100";
      else if(part._split==="verbrauch") betragF="Kosten!C"+kr+"*"+(100-nkHeizGrundProzent(k))+"/100";
      verAoa.push([String(part.bez||""), String(schl||""), null].concat(E.map(()=>null)).concat([null]));
      verForm.push({r:vr,c:2,f:betragF,v:betrag});
      let zsum=0;
      for(let j=0;j<n;j++){ const c=3+j;
        const faktor=(typeof nkFaktorFuer==="function")?nkFaktorFuer(E[j],part,E):0;
        const val=Math.round(betrag*faktor*100)/100; zsum+=val;
        if(formelBar){ const f=(schl==="einheit")?("C"+rr+"/"+n):("C"+rr+"*"+OE+"!"+einCol[schl]+(j+2)+"/"+OE+"!"+einTot[schl]); verForm.push({r:vr,c:c,f:f,v:val}); }
        else verAoa[verAoa.length-1][c]=val;
      }
      verForm.push({r:vr,c:sumCol,f:"SUM("+nkColLetter(4)+rr+":"+nkColLetter(3+n)+rr+")",v:Math.round(zsum*100)/100});
    });
  });
  XL.utils.book_append_sheet(wb, mkSheet(verAoa, verForm), "Berechnung");

  /* --- Reiter „Abrechnung": je Mietverhältnis; Einheit verweist auf „Objekt & Einheiten",
     USt = 19 % vom Netto (gewerblich) und Saldo = Brutto − Vorauszahlung als Formel. --- */
  const ergAoa=[["Einheit","Mieter","gewerblich","Netto (€)","USt (€)","Anteil brutto (€)","Vorauszahlung (€)","Saldo (€)"]];
  const ergForm=[];
  if(typeof nkObjektAbrechnung==="function"){
    const ab=nkObjektAbrechnung(E,K,O);
    const r2=x=>Math.round((+x||0)*100)/100;
    let er0=0; /* 0-basierte Datenzeile */
    ab.einheiten.forEach((er,ei)=>{
      const oeRow=ei+2; /* Zeile dieser Einheit im Reiter „Objekt & Einheiten" */
      er.mietverhaeltnisse.forEach(m=>{
        er0++; const rr=er0+1;
        ergAoa.push([null, String(m.mieter||""), m.gewerblich?"ja":"nein", r2(m.netto), r2(m.ust), r2(m.brutto), r2(m.vorauszahlung), null]);
        ergForm.push({r:er0,c:0,t:'s',f:OE+"!A"+oeRow,v:String(er.name||"")}); /* Einheit-Name aus „Objekt & Einheiten" */
        if(m.gewerblich) ergForm.push({r:er0,c:4,f:"D"+rr+"*0.19",v:r2(m.ust)}); /* USt = 19 % Netto */
        ergForm.push({r:er0,c:7,f:"F"+rr+"-G"+rr,v:r2(m.saldo)}); /* Saldo = Brutto − Vorauszahlung */
      });
      if(er.leerstandZeitanteil>0.0001){ er0++; ergAoa.push([String(er.name||""), "Leerstand (Vermieter)", "", "", "", r2(er.leerstandBetrag), "", ""]); }
    });
    er0++; const sr=er0+1;
    ergAoa.push(["Summe","","","","", r2(ab.summeAnteil), r2(ab.summeVoraus), null]);
    ergForm.push({r:er0,c:7,f:"F"+sr+"-G"+sr,v:r2(ab.summeSaldo)});
    ergAoa.push([]);
    ergAoa.push(["Hinweis","Netto/Brutto inkl. Zeitanteil und CO2-Abzug (US-07); USt-Spalte = 19 % vom Netto (nur gewerblich); Saldo = Brutto − Vorauszahlung."]);
  }
  XL.utils.book_append_sheet(wb, mkSheet(ergAoa, ergForm), "Abrechnung");

  /* Dateiname aus dem Objekt (wie beim JSON-Export, aber .xlsx). */
  const name=(typeof nkObjektDateiname==="function"?nkObjektDateiname(snapshot()):"NeKoFix-Objekt.json").replace(/\.json$/i,".xlsx");
  XL.writeFile(wb, name);
}
