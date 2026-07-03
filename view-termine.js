/* view-termine.js (US-118 AC-4) – Reiter „Termine & Wartung" (US-111): Wartungen,
   Mieterhöhungen, Ampel/Tage-Badges, .ics-Export. Aus view.js herausgelöst. */
/* ================= US-111: Termine & Wartung ================= */
function setTermineAnsicht(v){ ui.termineAnsicht=v; renderTermine(); }
function terminArtSelect(id, art){ return '<select class="termin-sel" onchange="setTerminFeldUi('+id+',\'art\',this.value)">'+
  Object.keys(NK_TERMIN_ARTEN).map(k=>'<option value="'+k+'"'+(k===art?' selected':'')+'>'+esc(NK_TERMIN_ARTEN[k])+'</option>').join('')+'</select>'; }
function terminIntervallSelect(id, iv){ const opts=[[0,'einmalig'],[3,'vierteljährlich'],[6,'halbjährlich'],[12,'jährlich'],[24,'alle 2 Jahre']];
  return '<select class="termin-sel" onchange="setTerminIntervall('+id+',this.value)">'+opts.map(o=>'<option value="'+o[0]+'"'+((+iv||0)===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>'; }
/* Tage-Badge mit Farbcode (rot <=1 Tag, orange < 2 Monate, grün > 2 Monate); verschwindet bei erledigt. */
function terminTageBadge(t, titleOverride){
  if(t.erledigt) return '<span class="termin-tage done">erledigt</span>';
  if(t.tage==null) return '<span class="termin-tage"></span>';
  return '<span class="termin-tage '+(t.tageFarbe||'')+'" title="'+esc(titleOverride||'Zeit bis zum Termin')+'">'+nkTageLabel(t.tage)+'</span>';
}
/* US-119 AC-1: EINE gemeinsame Mieterhöhungs-Zeile (Index und Staffel identisch), genutzt vom
   Termine-Reiter UND eingebettet im Vertragsteil (view-mieter.js indexBlock). Quelle bleibt
   nkMieterhoehungTermine (AC-5). Zeile 1: Bezeichnung (editierbar) + Typ; Zeile 2 read-only: Datum,
   Rubrik, Fälligkeit (inkl. Vertragsende bei Staffel, US-119); „angekündigt"-Haken (mit dem
   Vertragsteil verbunden) + Vertrag öffnen.
   opts.imVertrag: unterdrückt „Vertrag öffnen" (ergibt dort keinen Sinn) und passt den
   Stichtag-Tooltip an, da man sich bereits im Vertrag befindet. */
function mhZeile(t, opts){
  opts=opts||{};
  const faellig=terminIntervallText(t.intervallMonate, t.ende);
  const stichtagTitle=opts.imVertrag?'Stichtag':'Stichtag – im Vertrag ändern';
  const badgeTitle=(t.typ==='Index')?'Zeit bis zum Termin – Mitteilungsfrist (Textform, § 557b): '+(t.datum?fmtDatum(nkMitteilungsfrist(t.datum)):'—'):'Zeit bis zum Termin';
  return '<div class="termin-row mh">'+
    '<div class="termin-l1">'+terminTageBadge(t, badgeTitle)+
      '<input type="text" class="termin-bez-in mh-bez" value="'+esc(t.bez)+'" title="Bezeichnung der Mieterhöhung anpassen" onchange="setMhTerminBez('+t.einheitId+','+t.mvId+',this.value)">'+
      '<span class="pill">'+esc(t.typ)+'</span></div>'+
    '<div class="termin-l2">'+
      '<input type="date" class="termin-datum-in" value="'+(t.datum||'')+'" disabled title="'+stichtagTitle+'">'+
      '<input type="text" class="termin-sel" value="Mieterhöhung" disabled title="Rubrik">'+
      '<input type="text" class="termin-sel" value="'+esc(faellig)+'" disabled title="Fälligkeit">'+
      '<label class="termin-verschickt" title="Ankündigung verschickt – verbunden mit dem Vertragsteil"><input type="checkbox" onchange="setMhAngekuendigtUi('+t.einheitId+','+t.mvId+',\''+t.datum+'\',\''+esc(t.typ)+'\',this.checked)"> angekündigt</label>'+
      (opts.imVertrag?'':'<span class="termin-akt"><button type="button" class="linklike" onclick="go(7)">Vertrag öffnen</button></span>')+'</div>'+
  '</div>';
}
function terminZeile(t){
  if(t.quelle==='mieterhoehung') return mhZeile(t);
  /* Zeile 1: Tage + Bezeichnung (breit); Zeile 2: Datum, Uhrzeit, Rubrik, Fälligkeit, angekündigt, erledigt, .ics, ×. */
  return '<div class="termin-row'+(t.erledigt?' erledigt':'')+'">'+
    '<div class="termin-l1">'+terminTageBadge(t)+
      '<textarea rows="1" class="termin-bez-in" title="Bezeichnung – Ecke unten rechts zum Verbreitern ziehen" placeholder="Was steht an?" onchange="setTerminFeldUi('+t.id+',\'bez\',this.value)">'+esc(t.bez)+'</textarea></div>'+
    '<div class="termin-l2">'+
      '<input type="date" class="termin-datum-in" value="'+(t.datum||'')+'" onchange="setTerminDatum('+t.id+',this.value)">'+
      '<input type="time" class="termin-zeit-in" value="'+(t.zeit||'')+'" title="Uhrzeit (optional)" onchange="setTerminFeldUi('+t.id+',\'zeit\',this.value)">'+
      terminArtSelect(t.id,t.art)+terminIntervallSelect(t.id,t.intervallMonate)+
      '<label class="termin-verschickt" title="Termin/Ankündigung bereits verschickt bzw. in den Kalender übernommen"><input type="checkbox" '+(t.icsVerschickt?'checked':'')+' onchange="setTerminFeldUi('+t.id+',\'icsVerschickt\',this.checked)"> angekündigt</label>'+
      '<span class="termin-akt">'+
        '<button type="button" class="linklike" onclick="toggleErledigtUi('+t.id+')" title="Status umschalten (geplant/erledigt) – löscht nicht">'+(t.erledigt?'als geplant':'als erledigt')+'</button>'+
        '<button type="button" class="linklike" onclick="exportTerminIcs('+t.id+')" title="Diesen Termin als Kalenderdatei (.ics)">.ics</button>'+
        '<button type="button" class="row-del" title="Termin löschen" onclick="delTermin('+t.id+')">×</button>'+
      '</span></div>'+
  '</div>';
}
/* US-111: Bezeichnung eines aggregierten Mieterhöhungs-Termins überschreiben (auf dem Mietverhältnis). */
function setMhTerminBez(einheitId, mvId, val){
  const ei=state.einheiten.findIndex(e=>e.id===einheitId); if(ei<0) return;
  const mi=state.einheiten[ei].mv.findIndex(m=>m.id===mvId); if(mi<0) return;
  store.setMvFeld(ei,mi,'terminBez',val); renderTermine();
}
/* Fälligkeits-Text aus Intervall in Monaten (für die read-only Mieterhöhungs-Zeile). US-119: optionales
   `ende` (nur Staffel – Index kennt kein Vertragsende) hängt „, bis <Datum>" an. */
function terminIntervallText(iv, ende){
  iv=+iv||0;
  const basis = iv<=0 ? 'einmalig' : (iv%12===0 ? (iv/12===1?'jährlich':'alle '+(iv/12)+' Jahre') : 'alle '+iv+' Monate');
  return basis + (ende ? (', bis '+fmtDatum(ende)) : '');
}
/* „angekündigt" im Reiter setzen – Staffel über stafAngekuendigt (identisch zum Vertragsteil),
   Index über die Vorab-Ankündigung; der nächste Stichtag rückt danach nach. */
function setMhAngekuendigtUi(einheitId, mvId, datum, typ, checked){
  const ei=state.einheiten.findIndex(e=>e.id===einheitId); if(ei<0) return;
  const mi=state.einheiten[ei].mv.findIndex(m=>m.id===mvId); if(mi<0) return;
  if(typ==='Staffel'){ staffelAnkuendigung(ei,mi,datum,checked); } else { store.setMhAngekuendigt(ei,mi,datum,checked); }
  renderTermine();
}
function renderTermine(){
  const box=document.getElementById('termine_box'); if(!box) return;
  const h=heute(); const liste=nkTermineGesamt(state.objekt, state.einheiten, h);
  const aktiv=liste.filter(t=>!t.erledigt);
  const nRot=aktiv.filter(t=>t.tageFarbe==='rot').length, nOrange=aktiv.filter(t=>t.tageFarbe==='orange').length;
  const banner=(nRot||nOrange)
    ? '<div class="termin-banner warn">'+WARN_ICON+' '+(nRot?('<b>'+nRot+' fällig/überfällig</b>'):'')+(nRot&&nOrange?' · ':'')+(nOrange?(nOrange+' bald fällig'):'')+'</div>'
    : '<div class="termin-banner ok">Aktuell nichts fällig.</div>';
  const vorlagen=NK_TERMIN_VORLAGEN.map(v=>'<button type="button" class="termin-add" onclick="addTerminVorlage(\''+v.key+'\')">+ '+esc(v.bez)+'</button>').join('');
  const addbar='<div class="termin-addbar">'+vorlagen+'<button type="button" class="termin-add" onclick="addTerminEigen()">+ Eigener Termin</button></div>';
  const toggle='<div class="termin-ansicht"><span class="termin-ansicht-lbl">Ansicht:</span>'+
    '<button type="button" class="'+(ui.termineAnsicht==='faellig'?'aktiv':'')+'" onclick="setTermineAnsicht(\'faellig\')">Nach Fälligkeit</button>'+
    '<button type="button" class="'+(ui.termineAnsicht==='rubrik'?'aktiv':'')+'" onclick="setTermineAnsicht(\'rubrik\')">Nach Rubrik</button>'+
    '<button type="button" class="termin-ics" onclick="exportTermineIcs()" title="Alle Termine als Kalenderdatei (.ics). Stabile UID: Re-Import aktualisiert statt zu duplizieren.">Kalender (.ics) exportieren</button></div>';
  let body;
  if(!liste.length){ body='<div class="leer-hint">Noch keine Termine. Lege oben eine Wartung an – anstehende Mieterhöhungen erscheinen hier automatisch.</div>'; }
  else if(ui.termineAnsicht==='rubrik'){
    body=Object.keys(NK_TERMIN_ARTEN_ALLE).map(art=>{ const items=liste.filter(t=>t.art===art); if(!items.length) return '';
      return '<div class="termin-rubrik">'+esc(NK_TERMIN_ARTEN_ALLE[art])+' ('+items.length+')</div>'+items.map(terminZeile).join(''); }).join('');
  } else { body=liste.map(terminZeile).join(''); }
  box.innerHTML=banner+addbar+toggle+'<div class="termin-liste">'+body+'</div>';
}
function addTerminVorlage(key){ const v=NK_TERMIN_VORLAGEN.find(x=>x.key===key); if(!v) return; store.addTermin({ bez:v.bez, art:v.art, intervallMonate:v.intervallMonate, naechster:heute() }); renderTermine(); }
function addTerminEigen(){ store.addTermin({ bez:'Neuer Termin', art:'sonstiges', intervallMonate:0, naechster:heute() }); renderTermine(); }
function setTerminFeldUi(id,f,v){ store.setTerminFeld(id,f,v); renderTermine(); }
function setTerminDatum(id,v){ store.setTerminFeld(id,'naechster',v); renderTermine(); }
function setTerminIntervall(id,v){ store.setTerminFeld(id,'intervallMonate',+v||0); renderTermine(); }
function toggleErledigtUi(id){ store.toggleTerminErledigt(id); renderTermine(); }
function delTermin(id){ if(!confirm('Diesen Termin löschen?')) return; store.removeTermin(id); renderTermine(); }
function terminIcsDownload(liste, base){ const ics=nkTerminIcs(liste); const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=base+'.ics'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),5000); }
/* Export markiert die exportierten eigenen Termine als „verschickt" (Häkchen). Erledigte werden nicht exportiert. */
function exportTermineIcs(){ const liste=nkTermineGesamt(state.objekt, state.einheiten, heute()).filter(t=>!t.erledigt);
  if(!liste.length){ alert('Keine offenen Termine zum Exportieren.'); return; }
  terminIcsDownload(liste,'NeKoFix-Termine');
  liste.forEach(t=>{ if(t.quelle==='wartung') store.setTerminFeld(t.id,'icsVerschickt',true); }); renderTermine(); }
function exportTerminIcs(id){ const liste=nkTermineGesamt(state.objekt, state.einheiten, heute()).filter(t=>t.quelle==='wartung'&&t.id===id);
  if(!liste.length) return; terminIcsDownload(liste,'NeKoFix-Termin'); store.setTerminFeld(id,'icsVerschickt',true); renderTermine(); }
