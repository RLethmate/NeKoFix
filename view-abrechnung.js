/* view-abrechnung.js (US-118 AC-4) – Reiter „Berechnung", „Abrechnung" und „Zahlungen (Ist)":
   computeView, Plausibilität, Rechenweg, §35a, Freischaltung, Abrechnungsdokument, Zahlungen.
   Aus view.js herausgelöst. */
/* ---------- Step 5 ---------- */
function computeView(){
  const tb=document.querySelector('#tbl_ergebnis tbody'); tb.innerHTML='';
  /* US-59: im Vorjahr-Modus dieselbe Ergebnis-Tabelle aus den Vorjahresdaten berechnen (read-only, blau). */
  const vjSnap = ui.zeigeVorjahr ? nkFindVorjahr(objekte, aktivIdx) : null;
  const tbl=document.getElementById('tbl_ergebnis'); if(tbl) tbl.classList.toggle('vj-view', !!vjSnap);
  const ein = vjSnap ? (vjSnap.einheiten||[]) : state.einheiten;
  const kos = vjSnap ? (vjSnap.kosten||[]) : state.kosten;
  const obj = vjSnap ? (vjSnap.objekt||{}) : state.objekt;
  const ab=nkObjektAbrechnung(ein, kos, obj);
  ab.einheiten.forEach(er=>{
    er.mietverhaeltnisse.forEach(mv=>{
      const a=mv.brutto, v=mv.vorauszahlung, s=mv.saldo;
      const ustHint = mv.gewerblich ? ' <span class="pill" title="enthaltene Umsatzsteuer (je Kostenart 0/7/19 %)">inkl. USt '+eur(mv.ust)+'</span>' : '';
      const tr=document.createElement('tr');
      tr.innerHTML='<td>'+esc(mv.mieter)+' <span class="pill">'+esc(er.name)+'</span>'+ustHint+'</td>'+
        '<td class="num">'+eur(a)+'</td>'+
        '<td class="op-col">−</td>'+
        '<td class="num">'+eur(v)+'</td>'+
        '<td class="op-col">=</td>'+
        '<td class="num '+(s>0?'neg':'pos')+'">'+(s>0?'Nachzahlung ':'Guthaben ')+eur(Math.abs(s))+'</td>'+
        '<td class="num" title="Empfehlung: Anteil ÷ 12 Monate – statt der aktuellen NK-Vorauszahlung/Monat">'+eur(nkVorschlagVorauszahlung(a))+' statt '+eur(mv.nkMonat)+'</td>';
      tb.appendChild(tr);
    });
    if(er.leerstandZeitanteil>NK_LEERSTAND_EPS){
      const tr=document.createElement('tr');
      tr.innerHTML='<td class="muted">Leerstand (Vermieter) <span class="pill">'+esc(er.name)+'</span></td>'+
        '<td class="num">'+eur(er.leerstandBetrag)+'</td>'+
        '<td class="op-col">−</td>'+
        '<td class="num">–</td>'+
        '<td class="op-col">=</td>'+
        '<td class="num neg">trägt Vermieter</td>'+
        '<td class="num">–</td>';
      tb.appendChild(tr);
    }
  });
  const st=document.getElementById('sum_total'), sv=document.getElementById('sum_voraus');
  st.textContent=eur(ab.summeAnteil); sv.textContent=eur(ab.summeVoraus);
  st.classList.toggle('vj-betrag', !!vjSnap); sv.classList.toggle('vj-betrag', !!vjSnap);
  const saldo=ab.summeSaldo;
  const el=document.getElementById('sum_saldo');
  el.textContent=(saldo>=0?'+ ':'– ')+eur(Math.abs(saldo));
  el.className='val '+(vjSnap ? 'vj-betrag' : (saldo>0?'neg':'pos'));
  // US-07/AC9: kurz erläutern, welcher CO2-Fall greift (gilt fürs aktuelle Jahr).
  const ci=document.getElementById('co2_info');
  if(ci){ const t=co2GebaeudeText(); if(t && !vjSnap){ ci.textContent='CO2-Kostenaufteilung (CO2KostAufG): '+t; ci.hidden=false; } else { ci.hidden=true; ci.textContent=''; } }
  renderEurProQm(ein, kos); /* US-106: Nebenkosten je m² (Marktvergleich) */
  if(vjSnap){ const pb=document.getElementById('plausi_box'); if(pb) pb.innerHTML='<div class="plausi-item">Vorjahr-Ansicht – die Prüfung gilt für das aktuelle Jahr (Alt+v zum Zurückschalten).</div>'; }
  else renderPlausi();
  setVjTitel('vjt_berech'); /* US-59 */
}
/* US-106: Nebenkosten je m² (Marktvergleich) – ungedockter Klappbereich im Berechnung-Reiter. */
function renderEurProQm(ein, kos){
  const box=document.getElementById('eurqm_inhalt'); if(!box) return;
  const flaeche=nkTotals(ein||state.einheiten).flaeche;
  if(!(flaeche>0)){ box.innerHTML='<div class="hint">Für die €/m²-Kennzahl bitte Wohnflächen erfassen.</div>'; return; }
  const r=nkEurProQm(kos||state.kosten, flaeche);
  const eq=n=>nkFmtBetrag(n)+' €';
  const rows=r.zeilen.filter(z=>Math.round(z.betrag*100)!==0).map(z=>
    '<tr><td>'+esc(z.bez)+'</td><td class="num">'+eq(z.jahr)+'</td><td class="num">'+eq(z.monat)+'</td></tr>').join('');
  box.innerHTML='<p class="hint" style="margin:6px 0;">Zum Vergleich mit typischen Markt-Nebenkosten (Betriebskostenspiegel, meist €/m²·Monat). Bezogen auf '+nkFmtBetrag(flaeche)+' m² Gesamtfläche. Reine Kennzahl – ändert die Verteilung nicht.</p>'+
    '<table class="eurqm-tab"><thead><tr><th>Kostenart</th><th class="num">€/m²·Jahr</th><th class="num">€/m²·Monat</th></tr></thead><tbody>'+rows+
    '<tr class="eurqm-total"><td>Gesamt</td><td class="num">'+eq(r.gesamt.jahr)+'</td><td class="num">'+eq(r.gesamt.monat)+'</td></tr></tbody></table>';
}
/* US-14: Plausibilitätsprüfung + Rechenweg */
function renderPlausi(){
  const box=document.getElementById('plausi_box'); if(!box) return;
  const r=nkPlausibilitaet(state);
  const sym={ok:'✓',warn:'!',fehler:'✗'};
  const head = r.bereit ? '<div class="plausi-head ok">✓ Bereit zum Versand</div>' : '<div class="plausi-head warn">Bitte vor dem Versand prüfen</div>';
  box.innerHTML = head + r.punkte.map(p=>'<div class="plausi-item '+p.level+'">'+sym[p.level]+' '+p.text+'</div>').join('');
}
function nkRechenweg(){
  const t=nkTotals(state.einheiten);
  const L=[];
  L.push('# Rechenweg – '+state.objekt.addr);
  L.push('');
  L.push('Abrechnungszeitraum: '+zeitraumText()+'  ');
  L.push('Erstellt: '+new Date().toLocaleString('de-DE'));
  L.push('');
  L.push('## Verteilungsbasis');
  L.push('- Gesamtfläche: '+t.flaeche+' m²');
  L.push('- Personen gesamt: '+t.personen);
  L.push('- Wohneinheiten: '+t.einheiten);
  L.push('');
  L.push('## Rechenregeln');
  L.push('- Anteil je Position = Gesamtkosten × Verteilerschlüssel-Faktor.');
  L.push('  - nach Fläche: Faktor = m² der Einheit ÷ Gesamtfläche');
  L.push('  - nach Personen: Faktor = Personen der Einheit ÷ Personen gesamt');
  L.push('  - nach Wohneinheit: Faktor = 1 ÷ Anzahl Wohneinheiten');
  L.push('- Zeitanteil = belegte Tage ÷ Tage des Abrechnungszeitraums; Mieteranteil = Einheiten-Anteil × Zeitanteil.');
  L.push('- Leerstand (nicht belegte Tage) trägt der Vermieter.');
  L.push('- Gewerblich (USt-pflichtig): Positionen netto = Betrag ÷ (1 + Vorsteuersatz), Summe netto + '+NK_UST_SATZ+' % USt = brutto.');
  L.push('- CO2-Kostenaufteilung (CO2KostAufG): Vermieteranteil aus dem spez. Ausstoß (Summe kg CO2 fossiler Heizblöcke ÷ Gebäudefläche) nach 10-Stufen-Modell; gewerblich pauschal 50 %; Denkmal-/Milieuschutz halbiert. Der Vermieteranteil wird von den fossilen Heizkosten des Mieters abgezogen.');
  L.push('- Saldo = Anteil − geleistete Vorauszahlung.');
  const co2T=co2GebaeudeText();
  if(co2T){ L.push(''); L.push('## CO2-Kostenaufteilung (Gebäude)'); L.push('- '+co2T); }
  L.push('');
  L.push('## Kostenpositionen');
  state.kosten.forEach(k=>{ L.push('- '+k.bez+': '+eur(k.betrag)+' · '+schluesselAnzeige(k)+(nkUmlageInfo(k.bez).umlagefaehig?'':' · NICHT umlagefähig')); });
  L.push('');
  L.push('## Herleitung je Mietverhältnis');
  const ab=nkObjektAbrechnung(state.einheiten, state.kosten, state.objekt);
  ab.einheiten.forEach(er=>{
    er.mietverhaeltnisse.forEach(mv=>{
      const za=mv.zeitanteil;
      L.push('### '+mv.mieter+' – '+er.name+(mv.gewerblich?' (gewerblich)':''));
      L.push('Mietzeit '+fmtDatum(mv.von)+'–'+fmtDatum(mv.bis)+', Zeitanteil '+(za*100).toFixed(1)+' %');
      const fmtE=n=>(Number(n)||0).toLocaleString('de-DE',{maximumFractionDigits:2});
      const fmtP=n=>(Number(n)||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:4});
      mv.zeilen.forEach(i=>{  // US-59: Gesamtkosten ÷ Einheiten = Preis/Einh. × Ihre Einheiten (× Zeit) = Anteil
        const direkt=i.schluessel==='direkt';
        const zt=(i.zeitanteil!=null?i.zeitanteil:za);
        const zeitTxt=zt<0.999?' × Zeit '+(zt*100).toFixed(1)+' %':'';
        if(direkt){
          L.push('- '+i.bez+': '+eur(i.gesamt)+' direkt (100 %)'+zeitTxt+' = '+eur(i.anteil));
        } else {
          L.push('- '+i.bez+': '+eur(i.gesamt)+' ÷ '+fmtE(i.basis)+' '+i.einheitLabel+' = '+fmtP(i.preisJeEinheit)+' €/'+i.einheitLabel+' × '+fmtE(i.ihreEinheiten)+' '+i.einheitLabel+zeitTxt+' = '+eur(i.anteil));
        }
      });
      const hatCo2 = mv.co2 && mv.co2.aktiv;
      const bruttoVor = (mv.bruttoVorCo2!=null) ? mv.bruttoVorCo2 : mv.brutto;
      if(mv.gewerblich) L.push('- Zwischensumme netto '+eur(mv.netto)+' + '+NK_UST_SATZ+' % USt '+eur(mv.ust)+' = '+eur(bruttoVor));
      else L.push('- Summe Anteil'+(hatCo2?' (vor CO2)':'')+': '+eur(bruttoVor));
      if(hatCo2){
        L.push('- CO2-Aufteilung: '+nkCo2Erklaerung(mv.co2));
        L.push('- CO2-Kosten Ihr Anteil '+eur(mv.co2.kostenMieter)+' × Vermieteranteil '+mv.co2.vermieterProzent+' % = Abzug '+eur(mv.co2.abzug));
        L.push('- Summe Anteil nach CO2: '+eur(mv.brutto));
      }
      L.push('- Vorauszahlung '+eur(mv.vorauszahlung)+' → '+(mv.saldo>0?'Nachzahlung ':'Guthaben ')+eur(Math.abs(mv.saldo)));
      L.push('');
    });
    if(er.leerstandZeitanteil>NK_LEERSTAND_EPS){ L.push('### Leerstand '+er.name+': '+(er.leerstandZeitanteil*100).toFixed(1)+' % → '+eur(er.leerstandBetrag)+' (trägt Vermieter)'); L.push(''); }
  });
  return L.join('\n');
}
function downloadRechenweg(){
  const md=nkRechenweg();
  const blob=new Blob([md],{type:'text/markdown;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='Rechenweg-NeKoFix.md';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
}

/* US-62: §35a als zwei Volltabellen (Abs. 2 Dienstleistungen, Abs. 3 Handwerker). */
function p35aTabelle(p, kat, titel, elster){
  const rows=(p.posten||[]).filter(x=>x.kategorie===kat);
  if(!rows.length) return '';
  let sg=0,sa=0,sw=0,body='';
  rows.forEach(x=>{ sg+=x.gesamt; sa+=x.arbeitskosten; sw+=x.anteil;
    body+='<tr><td>'+esc(x.bez)+'</td><td>'+(SCHLUESSEL[x.schluessel]||esc(x.schluessel||''))+'</td><td class="num">'+eur(x.gesamt)+'</td><td class="num">'+eur(x.arbeitskosten)+'</td><td class="num">'+eur(x.anteil)+'</td></tr>'; });
  return '<h3 class="p35a-h">'+titel+'</h3>'+
    '<table class="p35a-tab"><thead><tr><th>Abrechnungsposten</th><th>Schlüssel</th><th class="num">Gesamtkosten</th><th class="num">dav. Arbeitskosten</th><th class="num">Ihr Anteil</th></tr></thead><tbody>'+
    body+
    '<tr class="total-row"><td>Gesamtsumme</td><td></td><td class="num">'+eur(sg)+'</td><td class="num">'+eur(sa)+'</td><td class="num">'+eur(sw)+'</td></tr>'+
    '</tbody></table>'+
    '<div class="hint">Eintrag in Elster: '+elster+'. Den Betrag „Ihr Anteil" können Sie geltend machen (20 % der Arbeitskosten, Höchstbeträge beachten).</div>';
}
function p35aBlock(p){
  if(!p || !p.aktiv) return '';
  return '<div class="pay p35a-block"><h3>Steuerlich absetzbar (§35a EStG)</h3>'+
    '<div class="hint">Nach bestem Wissen ermittelt – keine Steuerberatung. Einzelbeträge ggf. der beigefügten Rechnung entnehmen. Steuerjahr '+NK_P35A_STEUERJAHR+'.</div>'+
    p35aTabelle(p,'dienstleistung','§35a Abs. 2 · Haushaltsnahe Dienstleistungen',NK_P35A.dienstleistung.elster)+
    p35aTabelle(p,'handwerker','§35a Abs. 3 · Handwerkerleistungen',NK_P35A.handwerker.elster)+
    '</div>';
}
/* ---------- Step 5 ---------- */
/* US-40: Freischaltungs-Banner im Reiter „Fertige Abrechnung". Ohne Freischaltung ist das PDF
   eine Vorschau (Wasserzeichen, in pdf.js); ein gültiger, an Objekt+Jahr gebundener Code schaltet
   das versandfertige PDF frei. Status persistiert am Objekt (objekt.freigeschaltet). */
function renderFreischalt(){
  const box=document.getElementById('freischalt_box'); if(!box) return;
  if(state.objekt && state.objekt.freigeschaltet){
    box.className='freischalt-box frei';
    box.innerHTML='<span class="fs-text">✓ <b>Versandfertiges PDF freigeschaltet</b> – die PDFs werden ohne Wasserzeichen erzeugt.</span>';
  } else {
    box.className='freischalt-box';
    box.innerHTML='<span class="fs-text"><b>Vorschau:</b> Erstellen, Prüfen und PDF-Vorschau sind kostenlos. Das versandfertige PDF (ohne Wasserzeichen) gibt es nach Freischaltung für dieses Objekt und Abrechnungsjahr.</span>'+
      '<button class="fs-btn act-green" onclick="freischaltenEinloesen()">Versandfertiges PDF freischalten</button>';
  }
}
function freischaltenEinloesen(){
  const code=(prompt('Freischalt-Code für dieses Objekt und Abrechnungsjahr eingeben:','')||'').trim();
  if(!code) return;
  if(nkFreischaltGueltig(code, state.objekt)){
    store.setObjektFeld('freigeschaltet', true);
    renderDoc(); updateSaveStatus();
    alert('Freigeschaltet. Die PDFs werden jetzt ohne Wasserzeichen erzeugt.');
  } else {
    alert('Dieser Code ist für dieses Objekt / Abrechnungsjahr nicht gültig. Bitte prüfen.');
  }
}
function renderDoc(){
  renderFreischalt(); /* US-40: Freischaltungs-Status/Button (unabhängig vom gewählten Mieter) */
  const list=alleMV();
  const tabs=document.getElementById('mieter_tabs'); tabs.innerHTML='';
  if(ui.activeMieter>=list.length) ui.activeMieter=0;
  list.forEach((it,idx)=>{
    const b=document.createElement('div');
    b.className='mtab'+(idx===ui.activeMieter?' active':'');
    b.textContent=it.m.mieter+' · '+it.e.name; b.onclick=()=>{ui.activeMieter=idx;renderDoc();};
    tabs.appendChild(b);
  });
  const sel=list[ui.activeMieter]; if(!sel){ document.getElementById('doc').innerHTML=''; const vb0=document.getElementById('versand_box'); if(vb0) vb0.innerHTML=''; return; }
  const docEl=document.getElementById('doc');
  /* US-59: im Vorjahr-Modus das Dokument aus den Vorjahresdaten des passenden Mieters berechnen
     (read-only). Quelle „src" zeigt dann auf das Vorjahr-Snapshot; der PDF-/Versand-Export bleibt
     unangetastet (gilt fürs aktuelle Jahr) und wird in der VJ-Ansicht ausgeblendet. */
  const vjSnap = ui.zeigeVorjahr ? nkFindVorjahr(objekte, aktivIdx) : null;
  let e=sel.e, m=sel.m, src=state, vjDoc=false;
  if(docEl) docEl.classList.toggle('vj-view', !!vjSnap);
  setVjTitel('vjt_abr');
  if(vjSnap){
    const vjM=nkVorjahrMv(vjSnap, sel.e.name, sel.mi);
    const vjE=nkVorjahrEinheit(vjSnap, sel.e.name);
    if(vjM && vjE){ e=vjE; m=vjM; src=vjSnap; vjDoc=true; }
    else {
      if(docEl) docEl.innerHTML='<div class="vorjahr-banner"><span class="vb-text">Für „'+esc(sel.m.mieter)+' · '+esc(sel.e.name)+'" gibt es kein Vorjahres-Mietverhältnis.</span></div>';
      const vbx=document.getElementById('versand_box'); if(vbx) vbx.innerHTML='';
      return;
    }
  }
  const ab=nkMieterAbrechnung(e, m, src.kosten, src.objekt, src.einheiten);
  const gew=ab.gewerblich, za=ab.zeitanteil, anteil=ab.brutto, saldo=ab.saldo;
  const rueck=nkMietrueckstand(m, nkMvEnde(m,src.objekt.bis), src.objekt.von, src.objekt.bis); /* US-79: separater Mietrückstand */
  /* US-59: Spaltenformat (Rechenweg) + US-58 Rubrik-Gruppierung mit Zwischensummen. */
  const fmtEinh=n=>(Number(n)||0).toLocaleString('de-DE',{maximumFractionDigits:2});
  const fmtPreis=n=>(Number(n)||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:4});
  /* Ralf-Vorgabe 2026-07-11: Rechenweg als sichtbare Gleichung wie bei Techem – Gesamtkosten :
     Gesamteinheiten = Preis je Einheit × Ihre Einheiten = Ihr Anteil. Erleichtert den Abgleich
     gegen eine Techem-Abrechnung (gleicher Aufbau) und macht den Rechenweg für Mieter
     nachvollziehbar. Die vier op-col-Spalten (":"/"="/"×"/"=") kommen zu den bisherigen Spalten
     hinzu, deshalb COLS/leer() um 4 erhöht. */
  const COLS=gew?11:10, leer=c=>'<td colspan="'+c+'"></td>'; /* US-99: gewerblich = zusätzliche USt-Spalte */
  let rows='';
  nkRubrikenListe(src.objekt, src.kosten).forEach(rub=>{
    /* Fund im Code-Review 2026-07-10: nkRubrik(i) statt nkRubrik(src.kosten[ix]) – nach einem
       aktiven Heizkosten-Split (nkExpandHeizSplit) passt ein Index in ab.zeilen nicht mehr zum
       Original-Array src.kosten, das Zeilen-Objekt trägt seine Rubrik jetzt direkt mit. */
    const grp=ab.zeilen.filter(i=>Math.round(i.anteil*100)!==0 && nkRubrik(i)===rub); /* US-22/US-50 */
    if(!grp.length) return;
    rows+='<tr class="rubrik-row"><td colspan="'+COLS+'">'+esc(rub)+'</td></tr>';
    grp.forEach(i=>{
      const direkt=i.schluessel==='direkt';
      const basisC=direkt?'direkt':(fmtEinh(i.basis)+' '+i.einheitLabel);
      const preisC=direkt?'—':(fmtPreis(i.preisJeEinheit)+' €');
      const ihreC=direkt?'100 %':(fmtEinh(i.ihreEinheiten)+' '+i.einheitLabel);
      const zeitC=(i.zeitanteil<0.999)?' <span class="muted">(×'+Math.round(i.zeitanteil*100)+' %)</span>':'';
      const ustC = gew ? '<td class="num ust-col">'+(+i.vorsteuer||0)+'&nbsp;%</td>' : ''; /* US-99: Satz der Kostenart (0/7/19 %) */
      const op=s=>'<td class="op-col">'+(direkt?'':s)+'</td>'; /* Direktkosten sind keine Gleichung (100 % ohne Basis/Preis) */
      rows+='<tr><td>'+esc(i.bez)+'</td><td class="num">'+eur(i.gesamt)+'</td>'+op(':')+'<td class="num">'+basisC+'</td>'+op('=')+'<td class="num">'+preisC+'</td>'+op('×')+'<td class="num">'+ihreC+'</td>'+op('=')+ustC+'<td class="num">'+eur(i.wert)+zeitC+'</td></tr>';
    });
    const sub=grp.reduce((s,i)=>s+i.wert,0);
    rows+='<tr class="rubrik-subtotal"><td>Zwischensumme '+esc(rub)+'</td>'+leer(8)+(gew?'<td class="num"></td>':'')+'<td class="num">'+eur(sub)+'</td></tr>';
  });
  const summen = gew
    ? '<tr class="total-row"><td>Zwischensumme netto</td>'+leer(9)+'<td class="num">'+eur(ab.netto)+'</td></tr>'+
      '<tr><td>zzgl. '+NK_UST_SATZ+' % Umsatzsteuer</td>'+leer(9)+'<td class="num">'+eur(ab.ust)+'</td></tr>'+
      '<tr class="total-row"><td>Ihr Anteil (brutto)</td>'+leer(9)+'<td class="num">'+eur(ab.brutto)+'</td></tr>'
    : '<tr class="total-row"><td>Ihr Anteil an den Gesamtkosten</td>'+leer(8)+'<td class="num">'+eur(ab.brutto)+'</td></tr>';
  docEl.innerHTML=
    '<h2>Betriebs- und Heizkostenabrechnung</h2>'+
    '<div class="meta">'+esc(src.objekt.addr)+' · Einheit '+esc(e.name)+' · Mieter: <b>'+esc(m.mieter)+'</b>'+(gew?' (gewerblich, umsatzsteuerpflichtig)':'')+'<br>Abrechnungszeitraum: '+(vjDoc?(fmtDatum(src.objekt.von)+'–'+fmtDatum(src.objekt.bis)):zeitraumText())+' · Mietzeit: '+fmtDatum(m.von)+'–'+fmtDatum(nkMvEnde(m,src.objekt.bis))+(m.laeuft?' (läuft)':'')+' ('+Math.round(za*100)+' % des Zeitraums)</div>'+
    '<div class="headline-box">'+  /* US-62: kompakter Ergebnis-Block (Messdienst-Stil) */
      '<div class="hl-row"><span>Ihr Anteil an den Gesamtkosten</span><span>'+eur(anteil)+'</span></div>'+
      '<div class="hl-row"><span>Ihre Vorauszahlung</span><span>'+eur(+m.voraus||0)+'</span></div>'+
      '<div class="hl-row hl-result"><span>'+(saldo>0?'Ihre Nachzahlung':'Ihr Guthaben')+'</span><span>'+eur(Math.abs(saldo))+'</span></div>'+
    '</div>'+
    '<table><thead><tr><th>Kostenart</th><th class="num">Gesamtkosten</th><th class="op-col"></th><th class="num">Gesamteinheiten</th><th class="op-col"></th><th class="num">Preis/Einh.</th><th class="op-col"></th><th class="num">Ihre Einheiten</th><th class="op-col"></th>'+(gew?'<th class="num ust-col">USt.</th>':'')+'<th class="num">'+(gew?'Ihr Anteil (netto)':'Ihr Anteil')+'</th></tr></thead><tbody>'+
    rows+
    summen+
    '</tbody></table>'+
    '<p class="hint" style="margin:4px 0 10px;">Gesamtkosten : Gesamteinheiten = Preis je Einheit &times; Ihre Einheiten = Ihr Anteil (Rechenweg je Kostenart).</p>'+
    (ab.co2.aktiv && !vjDoc
      ? '<div class="pay"><h3>CO2-Kostenaufteilung (CO2KostAufG)</h3>'+
        'CO2-Kosten gesamt (Gebäude): '+eur(co2KostenGesamt())+' · Ihr Anteil: '+eur(ab.co2.kostenMieter)+'<br>'+
        nkCo2Erklaerung(ab.co2)+
        (nkCo2VermieterHinweis(ab.co2) ? '<br>Davon trägt der Vermieter: <b>– '+eur(ab.co2.abzugGesamt)+'</b> ('+nkCo2VermieterHinweis(ab.co2)+').' : '')+
        '</div>'
      : '')+
    p35aBlock(ab.p35a)+  /* US-62: zwei Volltabellen (Abs. 2 / Abs. 3), nur private MV */
    '<div class="pay"><h3>Zahlungsmodalitäten</h3>'+
    (saldo>0
      ? 'Bitte überweisen Sie den Nachzahlungsbetrag innerhalb von '+src.zahlung.frist+' auf folgendes Konto:<br>'
        +'Empfänger: '+src.zahlung.empfaenger+' · IBAN: '+src.zahlung.iban+' · BIC: '+src.zahlung.bic+'<br>'
        +'Verwendungszweck: '+esc('NK-Abr. '+(src.objekt.addr||'')+'-'+e.name+'-'+m.mieter+'-'+(vjDoc?(nkObjektJahr(src)||''):zeitraumText()))
      : 'Das Guthaben wird Ihnen innerhalb von '+src.zahlung.frist+' auf Ihr hinterlegtes Konto erstattet.')
    +'<br><span class="hint">Hinweis: Einwendungen können Sie innerhalb von 12 Monaten nach Zugang geltend machen.</span></div>'+
    (rueck>0
      ? '<div class="pay"><h3>Mietrückstand (separat)</h3>'+
        'Für den Abrechnungszeitraum besteht ein offener Mietbetrag, unabhängig von dieser Nebenkostenabrechnung:<br>'+
        'Abrechnungssaldo (Nebenkosten): '+(saldo>0?'Nachzahlung ':'Guthaben ')+eur(Math.abs(saldo))+'<br>'+
        'Mietrückstand aus dem Abrechnungszeitraum: '+eur(rueck)+
        (saldo>0?'<br><b>Gesamt offener Betrag: '+eur(saldo+rueck)+'</b>':'')+
        '<br><span class="hint">Der Mietrückstand ist nicht Teil der Nebenkostenabrechnung und wird separat geltend gemacht.</span></div>'
      : '');
  /* US-52: Versand-Block – E-Mail (im Vertrag gepflegt) anzeigen, Senden via Web Share (Anhang). */
  /* US-59: im Vorjahr-Modus den PDF-Export sperren (Export gilt fürs aktuelle Jahr) – klarer als ein Hinweistext. */
  const ea=document.getElementById('export_actions');
  if(ea) ea.querySelectorAll('button').forEach(b=>{ b.disabled=vjDoc; b.title=vjDoc?'Im Vorjahr-Vergleich deaktiviert (Alt+v zum Zurückschalten)':''; });
  const vb=document.getElementById('versand_box');
  if(vb && vjDoc){ vb.innerHTML='<button class="btn-primary act-green" disabled title="Im Vorjahr-Vergleich deaktiviert (Alt+v zum Zurückschalten)">Per E-Mail senden</button>'; }
  else if(vb){
    const mail=(m.email||'').trim();
    vb.innerHTML=
      '<span class="unit-f">E-Mail: '+(mail?esc(mail):'<span class="muted">– im Reiter „Objekt" beim Vertrag eintragen –</span>')+'</span>'+
      '<button class="btn-primary act-green" onclick="sharePdfAktiv()">Per E-Mail senden</button>'+
      '<span class="hint">Erzeugt das PDF und öffnet die Teilen-Funktion (mit Anhang, wo unterstützt). Wo nicht möglich, wird das PDF heruntergeladen – dann manuell anhängen.</span>';
  }
}

/* ---------- Step 6: Zahlungseingänge (US-28) ---------- */
function monatLabel(key){ const p=String(key).split('-'); const n=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']; return (n[(+p[1])-1]||'?')+' '+p[0]; }
/* nkMonatNK nach calc.js verschoben (US-35). */
/* US-74: Soll je Monat aus der in diesem Monat gültigen Miete; eingefrorenes Soll hat Vorrang. */
function monatSoll(m, key){
  const snap=m.sollSnap||{};
  if(key in snap) return +snap[key];
  return nkSollMonat(nkMieteAm(m, key+'-01'), nkMonatNK(m), m.stellAnzahl, m.stellPreis);
}
function monatErhalten(m, key, soll){
  const erh=m.erhalten||{}, bez=m.bezahlt||{};
  if(key in erh) return +erh[key];
  return bez[key] ? soll : 0; /* Migration: alte „bezahlt"-Haken gelten als voll bezahlt */
}
/* US-83: Ansicht im Zahlungen-Reiter – „bis aktueller Monat" (nur fällige Monate, Standard)
   oder „ganzes Abrechnungsjahr". */
function aktuellerMonatKey(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function setZahlBisAktuell(v){
  ui.zahlBisAktuell=v;
  const a=document.getElementById('zv_faellig'), b=document.getElementById('zv_jahr');
  if(a) a.classList.toggle('active', v); if(b) b.classList.toggle('active', !v);
  const h=document.getElementById('zahl_laeuft_hint'); if(h) h.style.display = v ? '' : 'none'; /* US-83: Hinweis nur in der Gegenwartssicht */
  renderZahlungen();
}
function renderZahlungen(){
  const box=document.getElementById('zahlungen_box'); box.innerHTML='';
  alleMV().forEach(({e,m,ei,mi})=>{
    let monate=nkAktiveMonate(m.von, nkMvEnde(m,state.objekt.bis), state.objekt.von, state.objekt.bis);
    if(ui.zahlBisAktuell){ /* US-83: offene (ungehakte) Monate von Mietbeginn bis zum aktuellen Monat –
        Gegenwartssicht, bewusst auch über den Abrechnungszeitraum hinaus (z. B. 2025-Objekt, heute 2026). */
      const curEnd=aktuellerMonatKey()+'-01';
      const mvEnde=m.laeuft? curEnd : (m.bis || curEnd);
      monate=nkAktiveMonate(m.von, mvEnde, m.von, curEnd)
        .filter(k=>{ const soll=monatSoll(m,k); return monatErhalten(m,k,soll)+0.005<soll; });
    }
    let sumSoll=0, sumErh=0, hatTeil=false;
    const rows=monate.map(k=>{
      const soll=monatSoll(m,k);
      const erhalten=monatErhalten(m,k,soll);
      const st=nkZahlStatus(erhalten, soll);
      if(st==='teilweise') hatTeil=true;
      sumSoll+=soll; sumErh+=erhalten;
      /* US-97: Differenz zum Soll – bei Unterzahlung rot („offener Betrag"), bei Überzahlung blau. */
      const diffBetrag=Math.round((soll-erhalten)*100)/100; /* >0 offen, <0 Überzahlung */
      /* US-77: Zusammensetzung des Solls als Tooltip (im jeweiligen Monat gültige Werte). */
      const teile=nkSollTeile(nkMieteAm(m, k+'-01'), nkMonatNK(m), m.stellAnzahl, m.stellPreis);
      const sollTitle=teile.length? eur(soll)+' = '+teile.map(t=>eur(t.betrag)+' '+t.label).join(' + ') : '';
      const geprueft=(st==='bezahlt'||st==='ueberzahlt');
      const diffHtml = st==='teilweise'
          ? '<span class="zm-diff neg" title="Differenz zum Soll – noch offener Betrag">offener Betrag '+eur(diffBetrag)+'</span>'
          : st==='ueberzahlt'
          ? '<span class="zm-diff pos" title="mehr als das Soll erhalten">Überzahlung '+eur(Math.abs(diffBetrag))+'</span>'
          : '';
      return '<div class="zahl-monat '+st+'">'+
        '<span class="zm-label">'+monatLabel(k)+'</span>'+
        '<span class="zm-soll"'+(sollTitle?' title="'+sollTitle+'"':'')+'>Soll '+eur(soll)+'</span>'+
        '<label class="zm-erh">erhalten <input class="short" type="text" inputmode="decimal" value="'+(erhalten?nkFmtBetrag(erhalten)+' €':'')+'" placeholder="'+nkFmtBetrag(soll)+' €" onchange="updErhalten('+ei+','+mi+',\''+k+'\',this.value)"></label>'+
        diffHtml+
        '<button class="zm-pruef'+(geprueft?' aktiv':'')+'" title="'+(geprueft?'Geprüft – erneut klicken hebt es auf':'Zahlungseingang als korrekt bestätigen (setzt erhalten = Soll)')+'" onclick="toggleGeprueft('+ei+','+mi+',\''+k+'\')">'+(geprueft?'geprüft':'zu prüfen')+'</button>'+
      '</div>';
    }).join('');
    const offenBetrag=Math.max(0, Math.round((sumSoll-sumErh)*100)/100);
    const summary='Soll gesamt '+eur(sumSoll)+' · erhalten '+eur(sumErh)+' · '+(offenBetrag>0?'<span style="color:var(--nachzahlung)">offen '+eur(offenBetrag)+' (Mietrückstand – bitte separat einfordern)</span>':'<span style="color:var(--accent)">vollständig</span>');
    box.insertAdjacentHTML('beforeend',
      '<div class="unit-card">'+
        '<div class="unit-head"><b>'+esc(m.mieter)+'</b> <span class="pill">'+esc(e.name)+'</span></div>'+
        '<div class="hint" style="margin:2px 0 6px;">Soll je Monat aus der jeweils gültigen Miete; „erhalten" frei erfassbar (auch Teilzahlungen). Voll bezahlte Monate frieren ihr Soll ein.</div>'+
        '<div class="zahl-monate">'+(rows||'<span class="hint">'+(ui.zahlBisAktuell?'Bis zum aktuellen Monat alles beglichen.':'keine aktiven Monate im Zeitraum')+'</span>')+'</div>'+
        '<div class="leer-hint" style="margin-top:8px;">'+summary+'</div>'+
        (hatTeil? '<div class="legal" style="margin-top:6px;">Bei Teilzahlung wird – sofern der Mieter nichts anderes bestimmt – die NK-Vorauszahlung vorrangig vor der Kaltmiete getilgt (§ 366 Abs. 2 BGB; BGH, 21.03.2018, VIII ZR 84/17). Der offene Rest ist daher i. d. R. ein Kaltmieten-Rückstand.</div>' : '')+
      '</div>');
  });
}
function updErhalten(ei,mi,key,val){
  const betrag=nkParseBetrag(val);
  store.setErhalten(ei,mi,key,betrag);
  const m=store.mv(ei,mi); const snap=m.sollSnap||{};
  if(!(key in snap)){ /* Soll einfrieren, sobald der Monat voll beglichen ist (bezahlt oder überzahlt) */
    const soll=nkSollMonat(nkMieteAm(m, key+'-01'), nkMonatNK(m), m.stellAnzahl, m.stellPreis);
    if(betrag+0.005>=soll && soll>0) store.setSollSnap(ei,mi,key, soll);
  }
  renderZahlungen();
}
/* US-74: „geprüft"-Toggle. Markiert den Monat als geprüft = voll beglichen (erhalten = Soll);
   erneuter Klick auf einen bereits beglichenen Monat hebt es wieder auf (erhalten leer, Soll
   wird wieder live berechnet). Beliebige Teilbeträge werden direkt im „erhalten"-Feld erfasst. */
function toggleGeprueft(ei,mi,key){
  const m=store.mv(ei,mi);
  const soll=monatSoll(m,key);
  const erh=monatErhalten(m,key,soll);
  if(soll>0 && erh+0.005>=soll){ /* bereits beglichen => Häkchen entfernen */
    store.clearSollSnap(ei,mi,key);
    updErhalten(ei,mi,key,'');
  } else { /* als geprüft/voll beglichen markieren */
    updErhalten(ei,mi,key, nkFmtBetrag(soll));
  }
}
/* US-67: updMVNum entfernt – Miete/Stellplätze werden jetzt im Vertrag (updVertrag) gepflegt. */

