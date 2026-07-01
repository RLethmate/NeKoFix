/* NeKoFix – Excel-Export (US-117), klassisches Script, nach calc.js/core.js/view.js geladen.
   Exportiert das aktive Objekt als .xlsx mit mehreren Reitern. Der Kern-Rechenweg (Verteilung nach
   Fläche/beheizter Fläche/Personen/Einheit) steht als LEBENDE FORMEL im Reiter „Verteilung", die
   Excel/LibreOffice selbst berechnet – so lässt sich die Tool-Rechnung unabhängig nachprüfen.
   Bewusst als WERTE (keine Formel): Verbrauchs-/Direktverteilung, Zeitanteil, USt-Gesamt, CO2 –
   diese stehen im Reiter „Ergebnis". Nutzt SheetJS (XLSX) per CDN. */
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
  /* Blatt aus einer Array-of-Arrays bauen und einzelne Zellen als Formel setzen. */
  const mkSheet=(aoa, formeln)=>{ const ws=XL.utils.aoa_to_sheet(aoa);
    (formeln||[]).forEach(f=>{ ws[XL.utils.encode_cell({r:f.r,c:f.c})]={t:'n', f:f.f}; }); return ws; };

  /* --- Reiter „Objekt": Kopf + Legende Formel/Wert --- */
  const infoAoa=[
    ["NeKoFix – Datenexport"],
    ["Objekt", String(O.name||O.addr||"")],
    ["Adresse", String(O.addr||"")],
    ["Abrechnungszeitraum", (O.von||"")+" – "+(O.bis||"")],
    [],
    ["Hinweis", "Reiter Verteilung: die Anteile sind als Formel hinterlegt und werden von Excel selbst berechnet (Prüfbarkeit)."],
    ["", "Verbrauchs-/Direktverteilung, Zeitanteil, Umsatzsteuer und CO2 stehen als Werte im Reiter Ergebnis."]
  ];
  XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(infoAoa), "Objekt");

  /* --- Reiter „Einheiten": Fläche, unbeheizt, beheizt (=Fläche−unbeheizt), Personen + Summen --- */
  const einAoa=[["Einheit","Fläche (m²)","unbeheizt (m²)","beheizt (m²)","Personen"]];
  E.forEach(e=>einAoa.push([String(e.name||""), +e.flaeche||0, +e.unbeheizt||0, null, +e.personen||0]));
  einAoa.push(["Summe", null, null, null, null]);
  const einForm=[]; const totR=n+1; /* 0-basiert: Header 0, Daten 1..n, Summe n+1 */
  for(let j=0;j<n;j++){ const rr=j+2; einForm.push({r:j+1,c:3,f:"B"+rr+"-C"+rr}); } /* beheizt */
  [1,2,3,4].forEach(c=>{ const L=nkColLetter(c+1); einForm.push({r:totR,c:c,f:"SUM("+L+"2:"+L+(n+1)+")"}); });
  XL.utils.book_append_sheet(wb, mkSheet(einAoa, einForm), "Einheiten");

  /* --- Reiter „Kosten": Rohliste --- */
  const kosAoa=[["Nr","Kostenart","Betrag (€)","Schlüssel","Vorsteuer %","Rubrik"]];
  K.forEach((k,i)=>kosAoa.push([i+1, String(k.bez||""), +k.betrag||0, String(k.schluessel||""), +k.vorsteuer||0, (typeof nkRubrik==="function"?nkRubrik(k):"")]));
  XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(kosAoa), "Kosten");

  /* --- Reiter „Verteilung": je (aufgeteilter) Kostenposition der Anteil je Einheit ---
     Formel für flaeche/beheizt/person/einheit (ohne Ausschluss), sonst Wert (Verbrauch/Direkt). */
  const exp=(typeof nkExpandHeizSplit==="function")?nkExpandHeizSplit(K,E):K;
  const header=["Kostenart","Schlüssel","Betrag (€)"].concat(E.map(e=>String(e.name||""))).concat(["Summe Anteile (Kontrolle)"]);
  const verAoa=[header];
  const verForm=[];
  const einTot={flaeche:"B"+(n+2), beheizt:"D"+(n+2), person:"E"+(n+2)};
  const einCol={flaeche:"B", beheizt:"D", person:"E"};
  const sumCol=3+n; /* 0-basiert: Kontroll-Spalte */
  exp.forEach((k,idx)=>{
    const rr=idx+2; /* 1-basierte Zeile im Blatt (Header=1) */
    const betrag=+k.betrag||0, schl=k.schluessel;
    const hatAus=Array.isArray(k.ausgeschlossen)&&k.ausgeschlossen.length>0;
    const formelBar=(!hatAus)&&(schl in einCol || schl==="einheit");
    const row=[String(k.bez||""), String(schl||""), betrag].concat(E.map(()=>null)).concat([null]);
    verAoa.push(row);
    for(let j=0;j<n;j++){ const c=3+j;
      if(formelBar){
        if(schl==="einheit") verForm.push({r:idx+1,c:c,f:"C"+rr+"/"+n});
        else verForm.push({r:idx+1,c:c,f:"C"+rr+"*Einheiten!"+einCol[schl]+(j+2)+"/Einheiten!"+einTot[schl]});
      } else {
        /* Wert: tatsächlicher Anteil dieser Einheit (Verbrauch/Direkt/mit Ausschluss). */
        const faktor=(typeof nkFaktorFuer==="function")?nkFaktorFuer(E[j],k,E):0;
        const ws_val=Math.round(betrag*faktor*100)/100;
        verAoa[verAoa.length-1][c]=ws_val;
      }
    }
    /* Kontroll-Summe der Einheit-Spalten (muss = Betrag sein). */
    verForm.push({r:idx+1,c:sumCol,f:"SUM("+nkColLetter(4)+rr+":"+nkColLetter(3+n)+rr+")"});
  });
  XL.utils.book_append_sheet(wb, mkSheet(verAoa, verForm), "Verteilung");

  /* --- Reiter „Ergebnis": je Mietverhältnis Netto/USt/Brutto/Vorauszahlung/Saldo (Werte) --- */
  const ergAoa=[["Einheit","Mieter","gewerblich","Netto (€)","USt (€)","Anteil brutto (€)","Vorauszahlung (€)","Saldo (€)"]];
  if(typeof nkObjektAbrechnung==="function"){
    const ab=nkObjektAbrechnung(E,K,O);
    const r2=x=>Math.round((+x||0)*100)/100;
    ab.einheiten.forEach(er=>{
      er.mietverhaeltnisse.forEach(m=>ergAoa.push([er.name, m.mieter, m.gewerblich?"ja":"nein", r2(m.netto), r2(m.ust), r2(m.brutto), r2(m.vorauszahlung), r2(m.saldo)]));
      if(er.leerstandZeitanteil>0.0001) ergAoa.push([er.name, "Leerstand (Vermieter)", "", "", "", r2(er.leerstandBetrag), "", ""]);
    });
    ergAoa.push(["Summe","","","","", r2(ab.summeAnteil), r2(ab.summeVoraus), r2(ab.summeSaldo)]);
    ergAoa.push([]);
    ergAoa.push(["Hinweis","Werte inkl. Zeitanteil (unterjährig), CO2-Abzug (US-07) und – bei gewerblich – 19 % USt auf den Netto-Gesamtbetrag."]);
  }
  XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(ergAoa), "Ergebnis");

  /* Dateiname aus dem Objekt (wie beim JSON-Export, aber .xlsx). */
  const name=(typeof nkObjektDateiname==="function"?nkObjektDateiname(snapshot()):"NeKoFix-Objekt.json").replace(/\.json$/i,".xlsx");
  XL.writeFile(wb, name);
}
