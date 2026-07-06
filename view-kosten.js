/* view-kosten.js (US-118 AC-4) – Reiter „Kosten": Kostenzeilen, Rubriken, Drag&Drop,
   Status-/Verfügbarkeits-Dropdowns, Kostenart-Auswahl. Aus view.js herausgelöst. */
function renderKosten(){
  ensureIds();
  renderKleinrepWarn(); /* US-103 */
  const tb=document.querySelector('#tbl_kosten tbody'); tb.innerHTML='';
  /* US-59: Vorjahreswerte je Kostenart (über die Bezeichnung) einblenden, wenn der Toggle an ist.
     Dargestellt IM selben Betragsfeld (read-only, blau) – kein Layout-Sprung. */
  const vjSnap = ui.zeigeVorjahr ? nkFindVorjahr(objekte, aktivIdx) : null;
  const vjOn = ui.zeigeVorjahr && !!vjSnap; /* nur einblenden, wenn wirklich ein Vorjahr existiert */
  const vjMap = vjSnap ? nkVorjahrKostenMap(vjSnap) : null;
  /* Betragszelle: im Vorjahr-Modus den Vorjahreswert read-only/blau zeigen, sonst das normale,
     editierbare Feld (mit US-90-Übernahme-Dreieck). */
  function betragCellHtml(k, idx){
    if(vjOn){
      const key=nkNormName(k.bez), hit=vjMap&&(key in vjMap);
      /* US-104: prozentuale Veränderung aktueller Betrag ggü. Vorjahr – farbig, im selben Feld (kein Layout-Sprung). */
      const pct = hit ? nkProzentDelta(k.betrag, vjMap[key]) : null;
      const delta = (pct!=null)
        ? '<span class="vj-delta '+(pct>0?'up':pct<0?'down':'flat')+'" title="Veränderung gegenüber Vorjahr (aktuell '+nkFmtBetrag(k.betrag||0)+' €)">'+(pct>0?'+':'')+String(pct).replace('.',',')+' %</span>'
        : '';
      return '<td class="num"><span class="betrag-wrap"><input class="short vj-field'+(hit?'':' vj-none')+'" type="text" readonly tabindex="-1" title="Vorjahreswert (zum Vergleich)" value="'+(hit?nkFmtBetrag(vjMap[key])+' €':'–')+'">'+delta+'</span></td>';
    }
    return '<td class="num"><span class="betrag-wrap'+(k.vorjahr?' unbestaetigt':'')+'"><input class="short" type="text" inputmode="decimal" value="'+nkFmtBetrag(k.betrag)+' €" oninput="updKostenBetrag('+idx+',this.value)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))+\' €\'">'+(k.vorjahr?'<button type="button" class="vorjahr-tri" title="Vorjahreswert übernehmen – bitte prüfen, dann anklicken (oder den Wert anpassen)" onclick="uebernehmeKostenVorjahr('+idx+')"></button>':'')+'</span></td>';
  }
  /* US-58: eine Kostenzeile (+ Detail) anhängen. */
  function appendKostenRow(k, idx){
    const st=k.status||'vorlaeufig', vf=k.verfuegbar||'vorhanden';
    if(k.vorsteuer===undefined) k.vorsteuer=nkVorschlagVorsteuer(k.bez);
    let opts='';
    for(const key in SCHLUESSEL){ opts+='<option value="'+key+'"'+(k.schluessel===key?' selected':'')+'>'+SCHLUESSEL[key]+'</option>'; }
    const info = nkUmlageInfo(k.bez);
    const warn = info.umlagefaehig ? '' : ' <span class="warn" title="'+info.grund.replace(/"/g,'')+'">'+WARN_ICON+'</span>';
    const dots='<span class="dot" style="background:'+STATUS_FARBE[st]+'" title="Status: '+STATUS_BELEG[st]+'"></span>'+
               '<span class="dot" style="background:'+VERFUEGBAR_FARBE[vf]+'" title="Beleg: '+VERFUEGBAR[vf]+'"></span>';
    const open=ui.expandedKosten.has(k.id);
    const ausNamen=nkAusschlussNamen(k, state.einheiten);
    const tr=document.createElement('tr'); tr.id='krow-'+idx; if(k.vorjahr) tr.className='vorjahr';
    tr.innerHTML=
      '<td class="bez-col"><div class="bez-wrap"><span class="drag-grip" draggable="true" ondragstart="kostenDragStart(event,'+k.id+')" title="Ziehen zum Verschieben (Rubrik &amp; Reihenfolge)">⠿</span><span class="bez-cell"><input value="'+esc(k.bez)+'" oninput="store.setKostenFeld('+idx+',\'bez\',this.value)" onchange="applyKostenart('+idx+',this.value)">'+warn+(k.vorjahr?' <span class="vorjahr-badge">aus Vorjahr</span>':'')+'</span></div></td>'+
      betragCellHtml(k,idx)+
      '<td><span class="schluessel-cell"><select title="Vorschlag – überschreibbar. Üblich: Fläche (z. B. Grundsteuer, Versicherung, Heizung), Personen (z. B. Wasser/Abwasser), Wohneinheit (z. B. Müll, Aufzug). „Direkt" ordnet die Position einer einzelnen Einheit zu 100 % zu." onchange="setSchluessel('+idx+',this.value)">'+opts+'</select><button class="reset-btn" title="Verteilerschlüssel auf Vorschlag zurücksetzen" onclick="resetSchluessel('+idx+')">↺</button>'+
        (k.schluessel==='direkt'
          ? '<select class="direkt-select" title="Diese Kosten trägt eine Einheit zu 100 %" onchange="store.setKostenFeld('+idx+',\'direktEinheit\',+this.value)">'+state.einheiten.map(x=>'<option value="'+x.id+'"'+(k.direktEinheit===x.id?' selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select>'
          : '<button class="teilnahme-chip'+(ausNamen.length?' aktiv':'')+'" title="Teilnehmende Einheiten festlegen" onclick="toggleKostenDetail('+k.id+')">'+(ausNamen.length?'ohne '+ausNamen.map(esc).join(', '):'alle')+'</button>')+
        '</span></td>'+
      '<td><button class="status-toggle" onclick="toggleKostenDetail('+k.id+')" title="Status & Notiz">'+dots+'<span class="chev">'+(open?'▴':'▾')+'</span></button></td>'+
      '<td class="act-col"><button class="row-del" title="Position entfernen" onclick="deleteKostenRow('+idx+')">×</button></td>';
    tb.appendChild(tr);
    const rub=nkRubrik(k); /* US-89 Phase 2: Drop auf diese Zeile = davor einsortieren, deren Rubrik übernehmen */
    tr.ondragover=dndOver; tr.ondragleave=dndLeave; tr.ondrop=function(e){ rowDrop(e, k.id, rub); };
    if(open){
      /* US-100: farbiger Punkt VOR dem Text in jeder Option (z. B. „● geschätzt"); Option-Farbe = Status-Farbe. */
      let so=''; for(const key in STATUS_BELEG){ so+='<option value="'+key+'"'+(st===key?' selected':'')+' style="color:'+STATUS_FARBE[key]+'">●&nbsp;'+STATUS_BELEG[key]+'</option>'; }
      let vo=''; for(const key in VERFUEGBAR){ vo+='<option value="'+key+'"'+(vf===key?' selected':'')+' style="color:'+VERFUEGBAR_FARBE[key]+'">●&nbsp;'+VERFUEGBAR[key]+'</option>'; }
      let vsOpts=''; [0,7,19].forEach(s=>{ vsOpts+='<option value="'+s+'"'+((+k.vorsteuer||0)===s?' selected':'')+'>'+s+' %</option>'; });
      const ro=nkRubrikenListe(state.objekt, state.kosten).map(r=>'<option value="'+esc(r)+'"'+(nkRubrik(k)===r?' selected':'')+'>'+esc(r)+'</option>').join('');
      const d=document.createElement('tr'); d.className='detail-row';
      d.innerHTML='<td colspan="5"><div class="detail-grid">'+
        '<label>Rubrik <select onchange="updKosten('+idx+',\'rubrik\',this.value)">'+ro+'</select></label>'+
        /* US-100: eigenes Dropdown – Punkt + Text farbig, sowohl zugeklappt als auch in der geöffneten Liste (native Selects färben die Liste auf macOS nicht ein). */
        '<label>Status '+cddHtml('status', idx, st, STATUS_BELEG, STATUS_FARBE)+'</label>'+
        '<label>Beleg '+cddHtml('verfuegbar', idx, vf, VERFUEGBAR, VERFUEGBAR_FARBE)+'</label>'+
        '<label title="Im Beleg enthaltene Vorsteuer">Vorsteuer <select onchange="updKosten('+idx+',\'vorsteuer\',+this.value)">'+vsOpts+'</select></label>'+
        /* US-32: §35a-Kategorie + begünstigter Arbeitskosten-Anteil */
        '<label title="Steuerlich begünstigt nach §35a EStG (haushaltsnahe Dienstleistung oder Handwerkerleistung)">§35a <select onchange="updKosten('+idx+',\'p35a\',this.value)">'+
          '<option value="keine"'+(nkP35aKategorie(k)===''?' selected':'')+'>keine</option>'+
          '<option value="dienstleistung"'+(nkP35aKategorie(k)==='dienstleistung'?' selected':'')+'>haushaltsnahe DL</option>'+
          '<option value="handwerker"'+(nkP35aKategorie(k)==='handwerker'?' selected':'')+'>Handwerker</option>'+
        '</select></label>'+
        '<label title="Begünstigter Arbeits-/Lohnanteil inkl. USt (ohne Material)">davon Arbeitskosten <input class="short" type="text" inputmode="decimal" value="'+nkFmtBetrag(k.arbeitskosten||0)+' €" onchange="updKostenArbeit('+idx+',this.value)"></label>'+
        '<label class="notiz-field">Notiz <input value="'+esc(k.notiz)+'" oninput="store.setKostenFeld('+idx+',\'notiz\',this.value)" placeholder="z. B. Zähler defekt, Belegquelle, …"></label>'+
      '</div>'+
      (k.schluessel==='direkt' ? '' :
       '<div class="teilnahme"><span class="teilnahme-lbl">Teilnehmende Einheiten:</span> '+
        state.einheiten.map(x=>'<label class="teilnahme-item"><input type="checkbox" '+(nkTeilnahme(x,k)?'checked':'')+' onchange="toggleTeilnahme('+idx+','+x.id+',this.checked)"> '+esc(x.name)+'</label>').join('')+
       '</div>')+
      (k.schluessel==='verbrauch' ?  /* US-57/US-59: Verbrauch je Einheit + Einheit-Label (kWh/m³) */
       '<div class="teilnahme"><span class="teilnahme-lbl">Verbrauch je Einheit:</span> '+
        '<label class="teilnahme-item">Einheit <input class="short" type="text" value="'+esc(k.einheit||'')+'" placeholder="z. B. m³" onchange="updKosten('+idx+',\'einheit\',this.value)" style="max-width:64px"></label> '+
        state.einheiten.filter(x=>nkTeilnahme(x,k)).map(x=>'<label class="teilnahme-item">'+esc(x.name)+' <input class="short" type="text" inputmode="decimal" value="'+nkFmtZahl((k.verbrauch&&k.verbrauch[x.id])||0)+' '+esc(k.einheit||'')+'" onchange="updKostenVerbrauch('+idx+','+x.id+',this.value)"></label>').join('')+
        ' <span class="unit-f">Summe: '+nkFmtBetrag(verbrauchSumme(k))+' '+esc(k.einheit||'')+'</span></div>'
       : '')+
      '</td>';
      tb.appendChild(d);
    }
  }
  /* US-59: Heizblöcke ausgegraut (Pflege im Heizung-Reiter) statt komplett ausblenden. */
  function appendHeizHinweisRow(k){
    const tr=document.createElement('tr'); tr.className='heiz-ro'; tr.title='Heizkosten werden im Reiter „Heizung" gepflegt';
    tr.innerHTML='<td class="bez-col">'+esc(k.bez)+' <span class="pill">s. Heizung</span>'+(k.vorjahr?' <span class="vorjahr-badge">aus Vorjahr – im Reiter „Heizung" übernehmen</span>':'')+'</td>'+
      '<td class="num">'+eur(k.betrag||0)+'</td><td>'+schluesselAnzeige(k)+'</td><td></td><td></td>';
    tb.appendChild(tr);
  }
  /* US-59: nur im Vorjahr vorhandene Kostenart – temporäre, read-only Zeile (blau); verschwindet,
     sobald der Vorjahr-Modus wieder aus ist (sie wird nie in den State geschrieben). */
  function appendVjOnlyRow(vk){
    const tr=document.createElement('tr'); tr.className='vj-only-row';
    tr.innerHTML='<td class="bez-col">'+esc(vk.bez)+' <span class="vj-only-badge">nur Vorjahr</span></td>'+
      '<td class="num"><span class="betrag-wrap"><input class="short vj-field" type="text" readonly tabindex="-1" title="Vorjahreswert (nur im Vorjahr vorhanden)" value="'+nkFmtBetrag(vk.betrag)+' €"></span></td>'+
      '<td>'+schluesselAnzeige(vk)+'</td><td></td><td></td>';
    tb.appendChild(tr);
  }
  /* US-58/US-89: Positionen nach Rubrik (objekt-eigene Reihenfolge) gruppieren. Die Rubrik-
     Überschrift ist die Struktur-Fläche: ziehbar (umsortieren), ↑/↓/✎/× und Drop-Ziel. Leere
     Rubriken werden als Drop-Zone gezeigt, damit man Positionen per Drag hineinziehen kann. */
  const items=state.kosten.map((k,idx)=>({k,idx})).filter(o=>!(ui.nurUngeprueft && (o.k.status||'vorlaeufig')==='geprueft'));
  const liste=nkRubrikenListe(state.objekt, state.kosten);
  /* US-59: Kostenarten, die es nur im Vorjahr gab, im Vorjahr-Modus zusätzlich einblenden. */
  const curBez=new Set(state.kosten.map(k=>nkNormName(k.bez)).filter(Boolean));
  const vjOnly=(ui.zeigeVorjahr && vjSnap) ? (vjSnap.kosten||[]).filter(vk=>{ const key=nkNormName(vk.bez); return key && !curBez.has(key); }) : [];
  const extraRub=[]; vjOnly.forEach(vk=>{ const r=nkRubrik(vk); if(liste.indexOf(r)<0 && extraRub.indexOf(r)<0) extraRub.push(r); });
  const rubriken=liste.concat(extraRub);
  rubriken.forEach((rub,ri)=>{
    const transient = ri>=liste.length; /* nur-Vorjahr-Rubrik ohne Pendant im aktuellen Jahr */
    const grp=items.filter(o=>nkRubrik(o.k)===rub);
    const vjHere=vjOnly.filter(vk=>nkRubrik(vk)===rub);
    const hr=document.createElement('tr'); hr.className='rubrik-head'+(transient?' rubrik-head-vj':'');
    if(transient){
      hr.innerHTML='<td colspan="5"><div class="rh-inner"><span class="rh-name">'+esc(rub)+'</span> <span class="vj-only-badge">nur Vorjahr</span></div></td>';
    } else {
      hr.innerHTML='<td colspan="5"><div class="rh-inner">'+
        '<span class="rh-grip" draggable="true" ondragstart="rubrikHeadDragStart(event,'+ri+')" title="Rubrik ziehen, um sie umzusortieren">⠿</span>'+
        '<span class="rh-name">'+esc(rub)+'</span>'+
        '<span class="rh-tools">'+
        '<button class="rh-btn" title="nach oben" onclick="rubrikHoch('+ri+')"'+(ri===0?' disabled':'')+'>↑</button>'+
        '<button class="rh-btn" title="nach unten" onclick="rubrikRunter('+ri+')"'+(ri===liste.length-1?' disabled':'')+'>↓</button>'+
        '<button class="rh-btn" title="umbenennen" onclick="rubrikUmbenennen('+ri+')">✎</button>'+
        ((grp.length||vjHere.length)?'':'<button class="rh-btn rh-del" title="leere Rubrik löschen" onclick="rubrikLoeschen('+ri+')">×</button>')+
        '</span>'+
        '</div></td>';
      hr.ondragover=dndOver; hr.ondragleave=dndLeave; hr.ondrop=(function(r){ return function(e){ headDrop(e, r); }; })(rub);
    }
    tb.appendChild(hr);
    if(grp.length || vjHere.length){
      grp.forEach(o=>{ if(o.k.typ==='heizung') appendHeizHinweisRow(o.k); else appendKostenRow(o.k,o.idx); });
      vjHere.forEach(vk=>appendVjOnlyRow(vk));
      const sum = vjOn
        ? grp.reduce((s,o)=>{ const key=nkNormName(o.k.bez); return s+((vjMap&&key in vjMap)?vjMap[key]:0); },0)+vjHere.reduce((s,vk)=>s+(+vk.betrag||0),0)
        : grp.reduce((s,o)=>s+(+o.k.betrag||0),0);
      const sr=document.createElement('tr'); sr.className='rubrik-sum'+(vjOn?' vj-sum':''); sr.dataset.rub=rub;
      sr.innerHTML='<td>Zwischensumme '+esc(rub)+'</td><td class="num">'+eur(sum)+'</td><td colspan="3"></td>'; tb.appendChild(sr);
    } else {
      const er=document.createElement('tr'); er.className='rubrik-empty'; er.innerHTML='<td colspan="5">leer – Positionen hierher ziehen</td>';
      er.ondragover=dndOver; er.ondragleave=dndLeave; er.ondrop=(function(r){ return function(e){ headDrop(e, r); }; })(rub);
      tb.appendChild(er);
    }
  });
  const uc=document.getElementById('ungeprueft_count'); if(uc){ const n=nkUngeprueftAnzahl(state.kosten); uc.textContent = n? ' — '+n+' offen' : ' — alle geprüft'; }
  renderRubrikPicker();
  renderPicker();
  renderKostenTitel(); /* US-59: Titel-Suffix „aus Vorjahr …" konsistent mitführen */
}
/* US-89-Schliff: Rubrik-Auswahl als Combobox (analog „Kostenart wählen …"). Das Dropdown listet die
   typischen, noch nicht angelegten Rubriken (Klick legt an); im Fuß eine „Eigene …". Sortieren/
   Umbenennen/Löschen passiert an den Rubrik-Überschriften in der Tabelle. */
function renderRubrikPicker(){
  const box=document.getElementById('rubrik_auswahl'); if(!box) return;
  const liste=nkRubrikenListe(state.objekt, state.kosten);
  const typisch=NK_RUBRIKEN.filter(r=>liste.indexOf(r)<0);
  box.innerHTML = typisch.length
    ? typisch.map(r=>'<button type="button" class="picker-item" data-r="'+esc(r)+'" onclick="addRubrikSofort(this.dataset.r)">'+esc(r)+'</button>').join('')
    : '<div class="pick-empty">Alle typischen Rubriken sind angelegt – eigene unten hinzufügen.</div>';
}
function toggleRubrikDropdown(ev){ if(ev) ev.stopPropagation(); const dd=document.getElementById('rubrik_dd'); dd.style.display = dd.style.display==='none' ? 'block' : 'none'; }
document.addEventListener('click', e=>{ const add=document.getElementById('rubrik_add'); const dd=document.getElementById('rubrik_dd'); if(dd && add && !add.contains(e.target)) dd.style.display='none'; });
function addRubrikSofort(name){ name=String(name||'').trim(); if(!name) return; store.addRubrik(name); const dd=document.getElementById('rubrik_dd'); if(dd) dd.style.display='none'; renderKosten(); }
function addEigeneRubrik(){ const inp=document.getElementById('rubrik_eigen'); const name=((inp&&inp.value)||'').trim(); if(!name) return; if(inp) inp.value=''; addRubrikSofort(name); }
function rubrikUmbenennen(i){ const liste=nkRubrikenListe(state.objekt, state.kosten); const alt=liste[i]; const neu=(prompt('Rubrik umbenennen:', alt)||'').trim(); if(!neu||neu===alt) return;
  if(liste.indexOf(neu)>=0){ alert('Diese Rubrik gibt es schon.'); return; } store.renameRubrik(alt, neu); renderKosten(); }
function rubrikLoeschen(i){ const liste=nkRubrikenListe(state.objekt, state.kosten); store.deleteRubrik(liste[i]); renderKosten(); }
function rubrikHoch(i){ store.moveRubrik(i, i-1); renderKosten(); }
function rubrikRunter(i){ store.moveRubrik(i, i+1); renderKosten(); }
/* US-89: Drag & Drop im Kosten-Reiter – einheitliches Modell für Positionen UND Rubriken.
   Gezogen wird nur über die jeweilige Griff-Lasche (⠿). Drop-Ziele:
   - Kostenzeile: Position davor einsortieren und deren Rubrik übernehmen.
   - Rubrik-Überschrift / leere Drop-Zone: Position in diese Rubrik (ans Ende) ODER, wenn eine
     Rubrik gezogen wird, diese vor die Ziel-Rubrik einsortieren.
   Reihenfolge/Rubrik/Rubriken-Reihenfolge persistieren über den Store. */
function dndStart(ev){ if(ev.dataTransfer){ ev.dataTransfer.effectAllowed='move'; try{ ev.dataTransfer.setData('text/plain','x'); }catch(e){} } }
function kostenDragStart(ev, id){ ui.drag={kind:'kosten', id:id}; dndStart(ev); }
function rubrikHeadDragStart(ev, ri){ const liste=nkRubrikenListe(state.objekt, state.kosten); ui.drag={kind:'rubrik', name:liste[ri]}; dndStart(ev); }
function dndOver(ev){ if(!ui.drag) return; ev.preventDefault(); if(ev.dataTransfer) ev.dataTransfer.dropEffect='move'; const el=ev.currentTarget; if(el&&el.classList) el.classList.add('drag-over'); }
function dndLeave(ev){ const el=ev.currentTarget; if(el&&el.classList) el.classList.remove('drag-over'); }
function rowDrop(ev, zielId, rubrik){ ev.preventDefault(); const el=ev.currentTarget; if(el&&el.classList) el.classList.remove('drag-over'); const d=ui.drag; ui.drag=null;
  if(!d || d.kind!=='kosten' || d.id===zielId) return; store.moveKosten(d.id, zielId, rubrik); renderKosten(); }
function headDrop(ev, rubrik){ ev.preventDefault(); const el=ev.currentTarget; if(el&&el.classList) el.classList.remove('drag-over'); const d=ui.drag; ui.drag=null; if(!d) return;
  if(d.kind==='kosten'){ store.moveKosten(d.id, null, rubrik); renderKosten(); }
  else if(d.kind==='rubrik' && d.name!==rubrik){ const liste=nkRubrikenListe(state.objekt, state.kosten); store.moveRubrik(liste.indexOf(d.name), liste.indexOf(rubrik)); renderKosten(); } }
function updKosten(idx,field,val){ store.setKostenFeld(idx,field,val); renderKosten(); }
/* US-100: kleines Custom-Dropdown für Status/Verfügbarkeit – farbiger Punkt + Text, auch in der
   geöffneten Liste (native <option>-Farben werden auf macOS nicht gerendert). */
function cddHtml(kind, idx, cur, map, farbe){
  const id='cdd-'+kind+'-'+idx;
  const opts=Object.keys(map).map(key=>
    '<button type="button" class="cdd-opt'+(key===cur?' sel':'')+'" style="color:'+farbe[key]+'" onclick="cddPick(\''+kind+'\','+idx+',\''+key+'\')">●&nbsp;'+esc(map[key])+'</button>').join('');
  return '<span class="cdd" id="'+id+'">'+
    '<button type="button" class="cdd-btn" style="color:'+farbe[cur]+'" onclick="cddToggle(\''+id+'\',event)">●&nbsp;'+esc(map[cur])+' <span class="cdd-caret" aria-hidden="true">▾</span></button>'+
    '<div class="cdd-list" hidden>'+opts+'</div></span>';
}
function cddToggle(id, ev){ ev.stopPropagation();
  const box=document.getElementById(id); if(!box) return; const list=box.querySelector('.cdd-list'); const willOpen=list.hidden;
  document.querySelectorAll('.cdd-list').forEach(l=>l.hidden=true);
  list.hidden=!willOpen;
}
function cddPick(kind, idx, key){ updKosten(idx, kind==='status'?'status':'verfuegbar', key); /* renderKosten schließt die Liste */ }
document.addEventListener('click', function(){ document.querySelectorAll('.cdd-list').forEach(l=>l.hidden=true); });
/* US-32: begünstigten Arbeitskosten-Anteil (€) je Position setzen. */
function updKostenArbeit(idx,val){ store.setKostenFeld(idx,'arbeitskosten', nkParseBetrag(val)); renderKosten(); }
/* US-50: Teilnahme einer Einheit an einer Kostenart umschalten (ausgeschlossen = Liste von IDs). */
function toggleTeilnahme(idx, einheitId, checked){
  const k=store.kosten(idx); let aus=((k.ausgeschlossen)||[]).slice();
  if(checked) aus=aus.filter(id=>id!==einheitId);
  else if(aus.indexOf(einheitId)<0) aus.push(einheitId);
  store.setKostenFeld(idx,'ausgeschlossen',aus);
}
/* US-11/US-90: Betrag bearbeiten = Vorjahreswert aktiv übernehmen → Markierung (Dreieck/Zeile) aufheben. */
function updKostenBetrag(idx,val){ store.setKostenBetrag(idx, nkParseBetrag(val)); const k=store.kosten(idx); if(k.vorjahr){ store.setKostenFeld(idx,'vorjahr',false); const r=document.getElementById('krow-'+idx); if(r){ r.classList.remove('vorjahr'); const b=r.querySelector('.vorjahr-badge'); if(b) b.remove(); const w=r.querySelector('.betrag-wrap'); if(w) w.classList.remove('unbestaetigt'); const t=r.querySelector('.vorjahr-tri'); if(t) t.remove(); } finalizeVorjahrWennFertig(); renderVorjahrBanner(); } refreshZwischensummen(); }
/* US-59-Begleitfix: Zwischensummen je Rubrik live nachziehen (beim Tippen im Betragsfeld), ohne die
   Tabelle neu aufzubauen – sonst würde der Fokus im Eingabefeld verloren gehen. */
function refreshZwischensummen(){
  document.querySelectorAll('#tbl_kosten tr.rubrik-sum').forEach(sr=>{
    const rub=sr.dataset.rub; if(rub==null) return;
    const sum=state.kosten.filter(k=>nkRubrik(k)===rub).reduce((s,k)=>s+(+k.betrag||0),0);
    const cell=sr.querySelector('td.num'); if(cell) cell.textContent=eur(sum);
  });
}
/* US-90: Vorjahreswert per Klick auf das blaue Dreieck übernehmen (Wert bleibt, Markierung weg). */
function uebernehmeKostenVorjahr(idx){ const k=store.kosten(idx); if(!(k&&k.vorjahr)) return; store.setKostenFeld(idx,'vorjahr',false); finalizeVorjahrWennFertig(); renderKosten(); renderVorjahrBanner(); saveState(); updateSaveStatus(); }
/* US-90: keine offenen Vorjahr-Kostenbeträge mehr → Vorjahr-Modus abschließen (auch MV-Marken lösen). */
function finalizeVorjahrWennFertig(){ if(state.vorjahr && !nkOffeneVorjahrKosten(state.kosten).length){ state.vorjahr=false; (state.einheiten||[]).forEach(e=>{ e.vorjahr=false; (e.mv||[]).forEach(m=>{ m.vorjahr=false; }); }); saveState(); updateSaveStatus(); } }
function toggleKostenDetail(id){ if(ui.expandedKosten.has(id)) ui.expandedKosten.delete(id); else ui.expandedKosten.add(id); renderKosten(); }
function setNurUngeprueft(v){ ui.nurUngeprueft=v; renderKosten(); }
/* US-04: Auswahl-Liste der Kostenarten; bereits übernommene ausgegraut, nicht umlagefähige mit ! */
function renderPicker(){
  const box = document.getElementById('kosten_auswahl'); if(!box) return;
  const vorhanden = new Set(state.kosten.map(k=>k.bez));
  const sorted = KOSTEN_KATALOG.slice().sort((a,b)=>a.localeCompare(b,'de')).filter(name=>!vorhanden.has(name));
  box.innerHTML = sorted.length ? sorted.map(name=>{
    const info = nkUmlageInfo(name);
    const warn = info.umlagefaehig ? '' : ' <span class="warn" title="'+info.grund.replace(/"/g,'')+'">'+WARN_ICON+'</span>';
    return '<button type="button" class="picker-item" data-n="'+esc(name)+'" onclick="addKostenSofort(this.dataset.n)">'+esc(name)+warn+'</button>';
  }).join('') : '<div class="pick-empty">Alle typischen Kostenarten sind angelegt – eigene unten hinzufügen.</div>';
}
function toggleKostenDropdown(ev){ if(ev) ev.stopPropagation(); const dd=document.getElementById('kosten_dd'); dd.style.display = dd.style.display==='none' ? 'block' : 'none'; }
document.addEventListener('click', e=>{ const add=document.getElementById('kosten_add'); const dd=document.getElementById('kosten_dd'); if(dd && add && !add.contains(e.target)) dd.style.display='none'; });
/* Kostenart aus der Liste mit einem Klick übernehmen (oben in „Betriebskosten"); Dropdown bleibt
   offen, damit mehrere nacheinander hinzugefügt werden können (die übernommene verschwindet aus der Liste). */
function addKostenSofort(name){ name=String(name||'').trim(); if(!name) return; store.addKostenOben(name); renderKosten(); }
function addSonstigeKosten(){
  const inp = document.getElementById('sonstige_bez');
  const bez = (inp.value||'').trim();
  if(!bez) return;
  store.addKostenOben(bez);
  inp.value=''; renderKosten();
}
function deleteKostenRow(idx){ store.removeKosten(idx); renderKosten(); }
/* US-03: Kostenart setzen und passenden Verteilerschlüssel vorschlagen (überschreibbar). */
function applyKostenart(idx, val){ store.setKostenart(idx,val); renderKosten(); }
function resetSchluessel(idx){ store.resetKostenSchluessel(idx); renderKosten(); }

