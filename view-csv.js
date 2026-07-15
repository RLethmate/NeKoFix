/* view-csv.js (US-118 AC-4) – Kontoumsatz-Import (Bank-CSV, US-85 ff.): Review-UI,
   Zuordnung, Übernahme, xlsx-Prüfprotokoll. Aus view.js herausgelöst. */
/* US-85: Kontoumsätze aus VR-/Volksbank-CSV einlesen und als read-only Vorschau zeigen.
   Geparst wird über die reine Funktion nkParseUmsatzCsv (calc.js). UTF-8 erzwungen (Umlaute).
   Zuordnung zu Mietern/Kostenarten und Übernahme folgen in US-86–88. */
function setCsvAutoProtokoll(v){ ui.csvAutoProtokoll=!!v; }
function importUmsaetze(ev){ const f=ev.target.files&&ev.target.files[0]; if(!f){ return; }
  const dateiname=f.name; const r=new FileReader();
  r.onload=function(){ try{ const res=nkParseUmsatzCsv(String(r.result||'')); ui.csvImport={ buchungen:res.buchungen||[], dateiname:dateiname, fehler:res.fehler, header:res.header||[], betragIdx:(res.betragIdx==null?-1:res.betragIdx) }; renderUmsatzReview(); }
    catch(e){ alert('CSV konnte nicht gelesen werden.'); } finally{ ev.target.value=''; } };
  r.readAsText(f,'utf-8'); }
/* US-85: Anzeige-Mapping der reinen Vorsortierung (calc.js: nkVorsortierung) auf Badge + Label. */
function umsatzKategorie(b){
  const key=nkVorsortierung(b);
  if(key==='eingang') return {key:'eingang', label:'Zahlungseingang'};
  if(key==='kosten')  return {key:'kosten',  label:'Kosten'};
  return {key:'ignor', label:'ggf. ignorieren'};
}
function closeUmsatzReview(){ const o=document.getElementById('csv_overlay'); if(o) o.style.display='none'; }
/* US-86: Ziel einer Buchung kodieren/dekodieren für das <select> (Wert <-> Regel-Ziel). */
function umsatzZielWert(ziel){ if(!ziel) return ''; if(ziel.art==='ignorieren') return 'ignorieren';
  if(ziel.art==='mieter') return 'mieter:'+ziel.einheitId+':'+ziel.mvId; if(ziel.art==='kosten') return 'kosten:'+ziel.bez; return ''; }
function umsatzWertZiel(val){ if(val==='ignorieren') return {art:'ignorieren'};
  if(val.indexOf('mieter:')===0){ const p=val.split(':'); return {art:'mieter', einheitId:+p[1], mvId:+p[2]}; }
  if(val.indexOf('kosten:')===0) return {art:'kosten', bez:val.slice(7)}; return null; }
/* US-86: Ziel-Dropdown – Mietverhältnisse + bestehende Kostenarten + „ignorieren". */
function umsatzZielSelect(b, i){
  const sel=umsatzZielWert(nkMatchRegel(b, state.objekt.importRegeln||[]));
  const opt=(v,t)=>'<option value="'+esc(v)+'"'+(sel===v?' selected':'')+'>'+esc(t)+'</option>';
  let h='<select class="csv-ziel" onchange="setUmsatzZiel('+i+',this.value)">'+opt('','— nicht zugeordnet —')+opt('ignorieren','Ignorieren');
  const mv=[]; (state.einheiten||[]).forEach(e=>(e.mv||[]).forEach(m=>mv.push(opt('mieter:'+e.id+':'+m.id, e.name+' · '+(m.mieter||'')))));
  if(mv.length) h+='<optgroup label="Mieter">'+mv.join('')+'</optgroup>';
  /* Kostenarten: bestehende + bereits per Regel angelegte Bezeichnungen (damit eine neue sichtbar bleibt) */
  const bez=[...new Set([].concat((state.kosten||[]).map(k=>k.bez), (state.objekt.importRegeln||[]).filter(r=>r.ziel&&r.ziel.art==='kosten').map(r=>r.ziel.bez)).map(x=>String(x||'').trim()).filter(Boolean))];
  h+='<optgroup label="Kostenart">'+opt('kosten_neu','+ neue Kostenart …')+bez.map(z=>opt('kosten:'+z, z)).join('')+'</optgroup>';
  return h+'</select>';
}
/* US-86: Zuordnung setzen -> als Regel am Objekt merken (IBAN/Name) -> auf gleiche Gegenkonten
   automatisch anwenden (Re-Render). Kein Schreiben in Kosten/Zahlungen (Übernahme: US-87/88). */
function setUmsatzZiel(i, val){
  const tx=ui.csvImport.buchungen[i]; if(!tx) return;
  let ziel;
  if(val==='kosten_neu'){
    const name=(prompt('Name der neuen Kostenart (später im Reiter „Kosten" anpassbar):', tx.name||'')||'').trim();
    if(!name){ renderUmsatzReview(); return; } /* abgebrochen */
    ziel={art:'kosten', bez:name};
  } else { ziel=umsatzWertZiel(val); }
  store.setObjektFeld('importRegeln', nkRegelUpsert(state.objekt.importRegeln||[], tx, ziel));
  renderUmsatzReview();
}
/* US-87/88: zugeordnete Buchungen übernehmen – Kosten je Kostenart summiert (neue werden
   angelegt), Zahlungen als „erhalten" je Mietverhältnis/Monat. Bereits übernommene werden über
   den Fingerabdruck übersprungen (Dedupe). Schreibt über den Store; danach App neu zeichnen.
   UX-Review 2026-07-15 (Kano, blaue Ecke): der Sammel-confirm() vor der Übernahme ist entfallen –
   „Importieren" ist bereits die bewusste Aktion (Review-Dialog: „nichts wird gespeichert, bis …").
   Stattdessen gilt die Regel der übrigen Importe (Techem): war ein Feld vorher leer/0, wird direkt
   gesetzt; hatte es schon einen Wert, wird aufaddiert UND als unbestätigter Vorschlag markiert
   (blaues Dreieck ▲ am Feld – k.vorschlag.betrag bzw. m.erhaltenVorschlag[monat]). */
function uebernehmeUmsaetze(){
  const plan=nkImportPlan(ui.csvImport.buchungen, state.objekt.importRegeln||[], { kostenBez:(state.kosten||[]).map(k=>k.bez), gesehen:state.objekt.importGesehen||[] });
  if(!plan.kosten.length && !plan.zahlungen.length){
    alert('Nichts zu übernehmen.'+(plan.offen?(' '+plan.offen+' Buchung(en) sind noch nicht zugeordnet.'):'')); return;
  }
  const teile=[];
  if(plan.kosten.length) teile.push(plan.kosten.length+' Kostenart(en)'+(plan.neueKosten.length?(' ('+plan.neueKosten.length+' neu)'):''));
  if(plan.zahlungen.length) teile.push(plan.zahlungen.length+' Zahlungseingang/-gänge');
  let markiert=0;
  plan.kosten.forEach(k=>{
    let idx=state.kosten.findIndex(x=>String(x.bez||'').trim()===k.bez);
    if(idx<0){ store.addKosten(k.bez); idx=state.kosten.findIndex(x=>String(x.bez||'').trim()===k.bez); }
    if(idx>=0){ const alt=+state.kosten[idx].betrag||0; store.setKostenBetrag(idx, alt+k.summe);
      if(alt>0){ store.setKostenVorschlagFeld(idx,'betrag',true); markiert++; } }
  });
  plan.zahlungen.forEach(z=>{
    const ei=state.einheiten.findIndex(e=>e.id===z.einheitId); if(ei<0) return;
    const mi=state.einheiten[ei].mv.findIndex(m=>m.id===z.mvId); if(mi<0) return;
    const cur=(state.einheiten[ei].mv[mi].erhalten&&state.einheiten[ei].mv[mi].erhalten[z.monat])||0;
    store.setErhalten(ei, mi, z.monat, cur+z.betrag);
    if(cur>0){ store.setErhaltenVorschlag(ei, mi, z.monat, true); markiert++; }
  });
  store.setObjektFeld('importGesehen', (state.objekt.importGesehen||[]).concat(plan.fingerprints));
  if(ui.csvAutoProtokoll) exportUmsatzProtokoll(); /* US-108: Prüfprotokoll auf Wunsch direkt öffnen (vor dem Schließen, solange die Daten noch da sind) */
  closeUmsatzReview(); renderAll();
  if(plan.kosten.length) go(3); else if(plan.zahlungen.length) go(6); /* US-87/88: nach der Übernahme zum betroffenen Reiter (Kosten=3 bzw. Zahlungen=6; go(2) war ein Altstand von vor dem Heizung/Kosten-Reitertausch aus US-91) */
  alert('Übernommen: '+teile.join(' und ')+'.'
    +(plan.offen?(' '+plan.offen+' nicht zugeordnete Buchung(en) wurden NICHT übernommen.'):'')
    +(markiert?('\n\n'+markiert+' Feld(er) hatten bereits einen Wert – dort wurde aufaddiert und mit einem blauen Dreieck ▲ markiert: bitte prüfen, dann ▲ anklicken (oder den Wert anpassen).'):'')
    +'\n\nKosten ggf. im Reiter „Kosten" benennen und einer Rubrik zuordnen.');
}
function renderUmsatzReview(){
  const o=document.getElementById('csv_overlay'), box=document.getElementById('csv_modal'); if(!o||!box) return;
  if(ui.csvImport.fehler){
    box.innerHTML='<h2>Kontoumsätze importieren</h2><div class="csv-err">'+esc(ui.csvImport.fehler)+'</div>'+
      '<div class="csv-foot"><span class="csv-note">Erwartet wird ein VR-/Volksbank-CSV-Export (mit der Spalte „Bezeichnung Auftragskonto"). Andere Bankformate folgen später.</span>'+
      '<button class="csv-close" onclick="closeUmsatzReview()">Schließen</button></div>';
    o.style.display='flex'; return;
  }
  const bs=ui.csvImport.buchungen, regeln=state.objekt.importRegeln||[];
  const pos=bs.filter(b=>b.betrag>0), neg=bs.filter(b=>b.betrag<0);
  const sumPos=pos.reduce((s,b)=>s+b.betrag,0), sumNeg=neg.reduce((s,b)=>s+b.betrag,0);
  const daten=bs.map(b=>b.datum).filter(Boolean).sort();
  const zeitraum=daten.length?(fmtDatum(daten[0])+' – '+fmtDatum(daten[daten.length-1])):'–';
  /* Zuordnungs-Status für die Summenzeile */
  let nMieter=0,sMieter=0,nKosten=0,sKosten=0,nIgnor=0,nOffen=0;
  bs.forEach(b=>{ const z=nkMatchRegel(b, regeln);
    if(!z){ nOffen++; } else if(z.art==='mieter'){ nMieter++; sMieter+=b.betrag; }
    else if(z.art==='kosten'){ nKosten++; sKosten+=Math.abs(b.betrag); } else { nIgnor++; } });
  /* US-86: Filter „nur nicht zugeordnete" – Originalindex i bleibt erhalten (für setUmsatzZiel). */
  const nurOffen=!!ui.csvImport.nurOffen, rowsArr=[];
  bs.forEach((b,i)=>{ if(nurOffen && nkMatchRegel(b, regeln)) return;
    const k=umsatzKategorie(b); const cls=b.betrag>0?'pos':(b.betrag<0?'neg':'');
    rowsArr.push('<tr><td>'+esc(b.buchungstag||'')+'</td><td>'+esc(b.name||'')+'</td><td class="zweck">'+esc(b.zweck||'')+'</td>'+
      '<td class="betrag '+cls+'">'+nkFmtBetrag(b.betrag)+' €</td><td><span class="csv-badge '+k.key+'">'+esc(k.label)+'</span></td>'+
      '<td>'+umsatzZielSelect(b,i)+'</td></tr>'); });
  const rows=rowsArr.join('');
  const filterZeile='<div class="csv-filterzeile"><label class="csv-filter"><input type="checkbox"'+(nurOffen?' checked':'')+' onchange="toggleNurOffen(this.checked)"> nur nicht zugeordnete</label></div>';
  /* US-107: Kontrollzeile – alle Buchungen berücksichtigt, Betragskontrolle, weiche Warnung, Vertrauens-Hinweis. */
  const netto=sumPos+sumNeg;
  const csvKontrolle = bs.length ? '<div class="csv-kontrolle"><b>Kontrolle:</b> alle '+bs.length+' Buchungen berücksichtigt · Eingänge '+nkFmtBetrag(sumPos)+' € − Kosten '+nkFmtBetrag(Math.abs(sumNeg))+' € = <b>'+nkFmtBetrag(netto)+' €</b> (Saldo der Datei) '+(nOffen?'<span class="csv-orange">⚠ '+nOffen+' Umsätze bitte noch zuordnen, falls relevant</span>':'<span class="csv-ok">✓ alle zugeordnet</span>')+'<br><span class="csv-hinweis">Es wird nichts gespeichert, bis Sie auf „Importieren" klicken. Prüfen Sie die Zuordnung und laden Sie bei Bedarf das Prüfprotokoll (.xlsx).</span></div>' : '';
  const wrap0=box.querySelector('.csv-tablewrap'); const scroll0=wrap0?wrap0.scrollTop:0; /* Scroll-Position über das Re-Rendern erhalten */
  box.innerHTML='<h2>Kontoumsätze importieren – Zuordnung</h2>'+
    '<div class="csv-meta">'+esc(ui.csvImport.dateiname)+' · '+bs.length+' Buchungen · '+pos.length+' Eingänge ('+nkFmtBetrag(sumPos)+' €) · '+neg.length+' Kosten ('+nkFmtBetrag(sumNeg)+' €) · Zeitraum '+esc(zeitraum)+'</div>'+
    (bs.length? '<div class="csv-summe">Zugeordnet: '+nMieter+' Mieter-Eingänge ('+nkFmtBetrag(sMieter)+' €) · '+nKosten+' Kosten ('+nkFmtBetrag(sKosten)+' €) · '+nIgnor+' ignoriert · <b'+(nOffen?' class="csv-offen"':'')+'>'+nOffen+' nicht zugeordnet</b></div>'+csvKontrolle+filterZeile+
      '<div class="csv-tablewrap"><table class="csv-table"><thead><tr><th>Datum</th><th>Name</th><th>Verwendungszweck</th><th>Betrag</th><th>Vorschlag</th><th>Ziel</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
              : '<div class="csv-err">Keine Buchungen gefunden (Kopfzeile erkannt, aber keine Datenzeilen).</div>')+
    '<div class="csv-foot"><span class="csv-note">Zuordnungen werden als Regel am Objekt gemerkt (IBAN bzw. Name) und beim nächsten Import automatisch vorgeschlagen. „Importieren" übernimmt: Kosten je Kostenart summiert (neue werden angelegt – Name/Rubrik später im Reiter „Kosten"), Zahlungseingänge als „erhalten" je Mieter/Monat. Bereits übernommene Buchungen werden beim erneuten Import übersprungen; eine gelöschte Kostenart wird durch erneuten Import wiederhergestellt.</span>'+
    (bs.length? '<label class="csv-autoprot"><input type="checkbox"'+(ui.csvAutoProtokoll?' checked':'')+' onchange="setCsvAutoProtokoll(this.checked)"> Prüfprotokoll nach Import öffnen</label>':'')+
    '<button class="csv-close csv-cancel" onclick="closeUmsatzReview()">Schließen</button>'+
    (bs.length? '<button class="csv-close csv-cancel" onclick="exportUmsatzProtokoll()" title="Exakte Original-Tabelle + Spalte „erfasst" + Kontrollsummen als Excel (selbstprüfend)">Prüfprotokoll (.xlsx)</button>':'')+
    '<button class="csv-close" onclick="uebernehmeUmsaetze()">Importieren</button></div>';
  const wrap1=box.querySelector('.csv-tablewrap'); if(wrap1) wrap1.scrollTop=scroll0;
  o.style.display='flex';
}
/* US-86: Filter „nur nicht zugeordnete" in der Review-Liste umschalten. */
function toggleNurOffen(v){ ui.csvImport.nurOffen=!!v; renderUmsatzReview(); }
/* US-108: Prüfprotokoll des Imports als .xlsx – Reiter „Umsätze" (Originalzeilen + Kategorie/Ziel/
   erfasst) und „Kontrollsummen" mit lebenden Formeln (selbstprüfend). Nutzt SheetJS (excel.js). */
function exportUmsatzProtokoll(){
  if(typeof ensureXlsxLib!=='function' || !ensureXlsxLib()) return;
  const XL=window.XLSX; const bs=ui.csvImport.buchungen||[]; if(!bs.length) return;
  const regeln=state.objekt.importRegeln||[];
  const header=ui.csvImport.header||[]; const nCols=header.length;
  const bIdx=(ui.csvImport.betragIdx==null?-1:ui.csvImport.betragIdx);
  const erfasstVon=b=>{ const z=nkMatchRegel(b,regeln); return !!(z&&(z.art==='mieter'||z.art==='kosten')); };
  /* Blatt „Umsätze" = exakte Kopie der Original-Tabelle, „erfasst" (x) als erste Spalte A. */
  const erklaerung='Alle importierten (erfassten) Umsätze sind in Spalte „erfasst" mit „x" gekennzeichnet.';
  const aoa=[[erklaerung], ['erfasst'].concat(header)];
  bs.forEach(b=>{ const roh=b.roh||[]; const row=[erfasstVon(b)?'x':''];
    for(let j=0;j<nCols;j++){ row.push(j===bIdx ? (+b.betrag||0) : String(roh[j]==null?'':roh[j])); }
    aoa.push(row); });
  const wb=XL.utils.book_new();
  XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(aoa), 'Umsätze');
  /* Kontrollsummen – Formeln über „Umsätze": A=erfasst; Betrag-Spalte dynamisch (Original + 1 für erfasst). */
  const n=bs.length, first=3, last=n+2, q="'Umsätze'"; /* Datenzeilen: Zeile 3..(n+2) */
  const bCol=(bIdx>=0)?nkColLetter(bIdx+2):null; /* +1 für erfasst-Spalte, +1 für 1-basiert */
  const sumPos=bs.filter(b=>b.betrag>0).reduce((s,b)=>s+b.betrag,0);
  const sumNeg=bs.filter(b=>b.betrag<0).reduce((s,b)=>s+b.betrag,0);
  const erf=bs.filter(erfasstVon).length;
  const kAoa=[['Kontrolle','Wert'],['Buchungen gesamt',null],['Summe Eingänge (Betrag > 0)',null],['Summe Kosten (Betrag < 0)',null],['Netto (Datei-Saldo)',null],['davon erfasst (x)',null],['nicht erfasst',null]];
  const kws=XL.utils.aoa_to_sheet(kAoa);
  const setF=(r,f,v)=>{ const c={t:'n',f:f}; if(isFinite(v)) c.v=Math.round(v*100)/100; kws[XL.utils.encode_cell({r:r,c:1})]=c; };
  setF(1,'COUNTA('+q+'!A'+first+':A'+last+')', n);
  if(bCol){ setF(2,'SUMIF('+q+'!'+bCol+first+':'+bCol+last+',">0")', sumPos);
    setF(3,'SUMIF('+q+'!'+bCol+first+':'+bCol+last+',"<0")', sumNeg);
    setF(4,'SUM('+q+'!'+bCol+first+':'+bCol+last+')', sumPos+sumNeg); }
  setF(5,'COUNTIF('+q+'!A'+first+':A'+last+',"x")', erf);
  setF(6,'B2-B6', n-erf);
  XL.utils.book_append_sheet(wb, kws, 'Kontrollsummen');
  const base=(ui.csvImport.dateiname||'Umsaetze').replace(/\.[^.]+$/,'');
  XL.writeFile(wb, base+'_importiert.xlsx');
}
