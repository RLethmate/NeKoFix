/* view-heizung.js (US-118 AC-4) – Reiter „Heizung": Heizblöcke, Energiearten,
   CO2-Einstellungen. Aus view.js herausgelöst. */
/* ---------- Step 4: Heizung (US-05) ---------- */
function heizListe(){ const out=[]; state.kosten.forEach((k,idx)=>{ if(k.typ==='heizung') out.push({k,idx}); }); return out; }
function renderHeizung(){
  const box=document.getElementById('heizung_box'); if(!box) return;
  ensureIds(); /* Heizkarten brauchen stabile k.id (Zeitraum-Aufklapp-Status) */
  const liste=heizListe();
  const vjSnap = ui.zeigeVorjahr ? nkFindVorjahr(objekte, aktivIdx) : null;
  if(ui.zeigeVorjahr && vjSnap){ /* US-59: kompakte read-only Vorjahr-Karten (Match je Heizblock über die Bezeichnung) */
    box.innerHTML = liste.length
      ? liste.map(({k})=>heizKarteVj(k, nkVorjahrHeizblock(vjSnap,k.bez))).join('')
      : '<p class="hint">Keine Heizblöcke vorhanden.</p>';
    setVjTitel('vjt_heiz');
    return;
  }
  box.innerHTML = liste.length
    ? liste.map(({k,idx})=>heizKarte(k,idx)).join('')
    : '<p class="hint">Noch keine Heizkosten erfasst. Lege einen Heizblock an: Energieart wählen, Verbrauch (in kWh oder Menge) und Preis eintragen – die Heizkostensumme wird daraus errechnet und wie eine Kostenposition verteilt.</p>';
  renderCo2Settings();
  setVjTitel('vjt_heiz'); /* US-59 */
}
/* US-59: kompakte Vorjahr-Vergleichskarte für einen Heizblock (read-only, blau kursiv). */
function heizKarteVj(k, vb){
  const ea = vb ? nkEnergieart(vb.energieart) : null;
  return '<div class="unit-card einheit-card">'+
    '<div class="unit-head"><b>'+esc(k.bez)+'</b>'+(vb?' <span class="vj-only-badge">aus Vorjahr</span>':' <span class="hint">kein Vorjahres-Heizblock</span>')+'</div>'+
    (vb? '<div class="detail-grid">'+
      '<label>Energieart '+vjFeld(ea?ea.label:null)+'</label>'+
      '<label>Verbrauch '+vjFeld(vb.menge!=null?nkFmtBetrag(vb.menge):null)+'</label>'+
      '<label>Preis '+vjFeld(vb.preis!=null?nkFmtBetrag(vb.preis):null)+'</label>'+
      '<span class="zahl-summe">Heizkosten: <b class="vj-betrag">'+eur(vb.betrag||0)+'</b></span>'+
    '</div>' : '')+
  '</div>';
}
/* US-05: Faktor-Beschriftung je Energieart (Heizwert vs. Arbeitszahl vs. keiner). */
function heizFaktorInfo(ea){
  if(ea.faktorTyp==='jaz') return { show:true, verbrauch:'Verbrauch (kWh Strom)', preis:'Preis (€/kWh Strom)',
    label:'Arbeitszahl (kWh<sub>Wärme</sub>/kWh<sub>Strom</sub>)',
    tip:'Jahresarbeitszahl (JAZ/COP) der Wärmepumpe: erzeugte kWh Wärme je 1 kWh Strom (typisch 3–4). Wirkt nur auf die angezeigte Wärmemenge, nicht auf die Kosten.',
    kwhLabel:'kWh Wärme' };
  if(ea.faktorTyp==='direkt') return { show:false, verbrauch:'Verbrauch (kWh)', preis:'Preis (€/kWh)', kwhLabel:'kWh' };
  return { show:true, verbrauch:'Verbrauch ('+ea.einheit+')', preis:'Preis (€/'+ea.einheit+')',
    label:'Heizwert (kWh/'+ea.einheit+')',
    tip:'Heizwert Hi: Energiegehalt je '+ea.einheit+' Brennstoff in kWh. Aus der Energieart vorbelegt, bei Bedarf laut Lieferantenrechnung überschreiben.',
    kwhLabel:'kWh' };
}
function heizKarte(k,idx){
  const ea=nkEnergieart(k.energieart);
  const fi=heizFaktorInfo(ea);
  const kwh=nkMengeZuKwh(k.menge, k.heizwert);
  const eurKwh=nkEurProKwh(k.betrag, kwh); /* US-95: Ø €/kWh nur als Kennzahl */
  const grund=nkHeizGrundProzent(k), verbr=100-grund, vsum=verbrauchSumme(k); /* US-94: Grund-/Verbrauchsaufteilung */
  const eaOpts=NK_ENERGIEARTEN.map(e=>'<option value="'+e.key+'"'+(k.energieart===e.key?' selected':'')+'>'+esc(e.label)+'</option>').join('');
  const schlOpts=['flaeche','person','einheit','verbrauch'].map(s=>'<option value="'+s+'"'+(k.schluessel===s?' selected':'')+'>'+SCHLUESSEL[s]+'</option>').join('');
  const mehrereHeiz=heizListe().length>=2; /* mehrere Heizblöcke: Zeitraum bei allen einblenden, damit die Perioden klar abgegrenzt sind */
  /* UX-Schliff: alle Werte als gleichartige Feld-Boxen (Anzeigen = ausgegraute, nicht editierbare Inputs),
     damit sie sauber in einem Raster aligned sind. hf() = beschriftetes Feld, ro() = Readonly-Anzeigefeld. */
  const ro = (v)=>'<input type="text" class="ro" readonly tabindex="-1" value="'+v+'">';
  /* US-121 Phase 1: hf() bekommt eine optionale Breiten-Klasse (hf-1u/hf-2u), damit Feldbreiten sich
     nach Inhalt richten statt gleichverteilt (auto-fill) zu sein – siehe .hf-raster in index.html. */
  const hf = (cap, inp, title, cls)=>'<label class="hf'+(cls?' '+cls:'')+'"'+(title?' title="'+String(title).replace(/"/g,'&quot;')+'"':'')+'><span>'+cap+'</span>'+inp+'</label>';
  /* US-121: Verbindungszeichen zwischen Feldern einer Gleichungs-Zeile (Heizkosten/Verbrauch=
     Mittelwert, EG+1.OG=Summe) – macht den Rechenzusammenhang sichtbar, wie in den eq-Tabellen
     (Vorauszahlungen/Kontrolle) an anderer Stelle der App bereits üblich. */
  const op = (sym)=>'<span class="hf-op">'+sym+'</span>';
  const verbrauchFeld = hf(fi.verbrauch, '<input type="number" step="any" value="'+(k.menge||0)+'" onchange="updHeiz('+idx+',\'menge\',this.value)">', 'Optional – nur für die Kennzahl Ø €/kWh (Energieträger-/Heizungsvergleich), keine Rechengrundlage.', 'hf-2u');
  const heizwertFeld = fi.show ? hf(fi.label, '<input type="number" step="any" value="'+(k.heizwert||0)+'" onchange="updHeiz('+idx+',\'heizwert\',this.value)">', fi.tip, 'hf-2u') : '';
  const waermemengeFeld = hf('Wärmemenge', ro(nkFmtBetrag(kwh)+' '+fi.kwhLabel), null, 'hf-2u');
  /* Nenner der Mittelwert-Gleichung: bei Faktor-Energiearten (Heizöl/Flüssiggas/Pellets/Erdgas m³/
     Wärmepumpe) ist das die umgerechnete Wärmemenge (kWh), nicht der roh eingetragene Verbrauch
     (Liter/m³/kWh Strom) – so wird tatsächlich gerechnet (nkEurProKwh(betrag, kwh)). Bei direkten
     kWh-Energiearten (Erdgas kWh, Fernwärme, Wärme kWh) ist der Verbrauch bereits die kWh-Menge,
     beides ist identisch, eine eigene Umrechnungs-Zeile entfällt dort. */
  const nennerFeld = fi.show ? waermemengeFeld : verbrauchFeld;
  /* US-121 (Nachbesserung nach Feedback): jede Gleichung bekommt ihre eigene .hf-raster-Zeile statt
     alle Felder in einem gemeinsamen Flex-Container fließen zu lassen – sonst hängt der Zeilenumbruch
     vom verfügbaren Platz ab und Grundkosten %/Verbrauch % landen je nach Energieart (unterschiedliche
     Feldanzahl davor) mal in derselben, mal in einer neuen Zeile. Geprüft für alle 8 Energiearten
     (NK_ENERGIEARTEN): 3× direkt (kein Umrechnungs-Schritt), 4× hi (Verbrauch×Heizwert=Wärmemenge),
     1× jaz/Wärmepumpe (Verbrauch×Arbeitszahl=Wärmemenge) – dieselbe Struktur in allen drei Fällen. */
  const umrechnungZeile = fi.show ? (verbrauchFeld+op('×')+heizwertFeld+op('=')+waermemengeFeld) : '';
  const mittelwertZeile =
    hf('Heizkosten gesamt (€)', '<input type="text" inputmode="decimal" value="'+nkFmtBetrag(k.betrag||0)+'" onchange="updHeizBetrag('+idx+',this.value)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))">', null, 'hf-2u')+
    op('/')+
    nennerFeld+
    op('=')+
    hf('Mittelwert (Ø €/kWh)', ro(eurKwh!=null ? nkFmtBetrag(eurKwh)+' €/kWh' : '– €/kWh'), 'Mittlerer Energiepreis – nur Kennzahl zum Vergleich (z. B. vor/nach Heizungswechsel).', 'hf-2u');
  const grundVerbrauchZeile =
    hf('Grundkosten %', '<input type="number" min="30" max="50" step="5" value="'+grund+'" onchange="updHeizGrund('+idx+',this.value)">', 'Grundkosten nach (beheizter) Fläche, Rest nach erfasstem Verbrauch (§ 7/§ 8 HeizkostenV). Zulässig: 30–50 % Grund (= 50–70 % Verbrauch).', 'hf-1u')+
    hf('Verbrauch %', ro(verbr+' %'), null, 'hf-1u');
  /* US-121 (Nachbesserung): Grundkosten %/Verbrauch % sind das Breitenmaß für alles, was
     inhaltlich darunter/danach kommt (CO2-Felder, Verbrauch je Einheit, Zeitraum) – hf-1u statt
     hf-2u, damit die Spalten senkrecht exakt übereinanderstehen. Die ersten Gleichungs-Zeilen
     (Verbrauch/Heizwert/Wärmemenge/Heizkosten/Mittelwert) dürfen breiter bleiben (hf-2u). */
  const co2Felder = ea.fossil ? hf('CO₂-Emissionen (kg)', '<input type="number" step="any" value="'+(k.co2Kg||0)+'" onchange="updHeizNum('+idx+',\'co2Kg\',this.value)">', 'CO2KostAufG: von der Brennstoffrechnung übernehmen.', 'hf-1u')+hf('CO₂-Kosten (€)', '<input type="number" step="any" value="'+(k.co2Kosten||0)+'" onchange="updHeizNum('+idx+',\'co2Kosten\',this.value)">', 'CO2KostAufG: von der Brennstoffrechnung übernehmen.', 'hf-1u') : '';
  const vbEinheitenFelder = state.einheiten.filter(x=>nkTeilnahme(x,k)).map(x=>hf(esc(x.name), '<input type="number" step="any" value="'+((k.verbrauch&&k.verbrauch[x.id])||0)+'" onchange="updHeizVerbrauch('+idx+','+x.id+',this.value)">', null, 'hf-1u'));
  const vbFelder = vbEinheitenFelder.join(op('+'))+op('=')+hf('Summe', ro(nkFmtBetrag(vsum)+' '+esc(k.einheit||'kWh')), null, 'hf-1u');
  return '<div class="unit-card einheit-card'+(k.vorjahr?' vorjahr':'')+'">'+
    (k.vorjahr ? '<div class="heiz-vorjahr"><span><b>Aus dem Vorjahr vorbelegt.</b> Bitte Verbrauch und Preis prüfen.</span><button type="button" onclick="uebernehmeHeizVorjahr('+idx+')">Übernehmen</button></div>' : '')+
    '<div class="unit-head">'+
      '<input class="unit-name" value="'+esc(k.bez)+'" oninput="store.setKostenFeld('+idx+',\'bez\',this.value)">'+
      '<label class="unit-f">Energieart <select onchange="setEnergieart('+idx+',this.value)">'+eaOpts+'</select></label>'+
      '<button class="row-del" title="Heizblock entfernen" onclick="delHeizblock('+idx+')" style="margin-left:auto;">×</button>'+
    '</div>'+
    /* US-121 Phase 1: .hf-raster statt .heiz-felder – Feldbreite richtet sich nach Inhalt (hf-1u/
       hf-2u) statt gleichverteiltem auto-fill-Grid; dadurch decken sich z. B. die Boxen unter
       „Verbrauch je Einheit" exakt mit den 1-Einheit-Feldern oben (Grundkosten %, Verbrauch %).
       Jede Gleichung/Gruppe eine eigene Zeile (siehe Kommentar bei umrechnungZeile oben). */
    (umrechnungZeile ? '<div class="hf-raster">'+umrechnungZeile+'</div>' : '')+
    '<div class="hf-raster">'+mittelwertZeile+'</div>'+
    '<div class="hf-raster">'+grundVerbrauchZeile+'</div>'+
    '<div class="hint" style="margin:2px 0 8px;">30 % Grund / 70 % Verbrauch ist Standard; bei älteren Öl-/Gas-Gebäuden sind 70 % Verbrauch ggf. verpflichtend (§ 7 Abs. 1 HeizkostenV). Wartungs-/Betriebskosten der Anlage gehören in diesen Block.'+(ea.fossil?' CO₂-Werte von der Brennstoffrechnung – Vermieteranteil wird automatisch ermittelt.':'')+'</div>'+
    (co2Felder ? '<div class="hf-raster">'+co2Felder+'</div>' : '')+
    '<div class="heiz-vb"><div class="heiz-vb-lbl">Verbrauch je Einheit ('+esc(k.einheit||'kWh')+'):</div>'+
      '<div class="hf-raster">'+vbFelder+'</div>'+
      (vsum>0 ? '' : '<div class="leer-hint" style="margin-top:6px;width:100%;">⚠ Ohne erfassten Verbrauch wird '+verbr+' % nicht verbrauchsgerecht verteilt – der Block wird vorerst nach Fläche abgerechnet. Bitte Verbrauch je Einheit eintragen.</div>')+
    '</div>'+
    // Aufräumen: Zeitraum (aktiv von/bis) standardmäßig eingeklappt; offen, wenn gesetzt, neu hinzugefügt oder aufgeklappt.
    ((mehrereHeiz || ui.expandedHeizZeit.has(k.id) || k.von || k.bis)
      ? '<div class="hf-raster" title="US-06: Zeitraum, in dem dieser Heiztyp aktiv war. Leer = ganzer Abrechnungszeitraum. Bei Mieterwechsel wird der Block über diese Periode auf die anwesenden Mieter verteilt.">'+
          hf('aktiv von', '<input type="date" value="'+(k.von||'')+'" onchange="store.setKostenFeld('+idx+',\'von\',this.value)">', null, 'hf-1u')+
          hf('aktiv bis', '<input type="date" value="'+(k.bis||'')+'" onchange="store.setKostenFeld('+idx+',\'bis\',this.value)">', null, 'hf-1u')+
          ((k.von||k.bis||mehrereHeiz) ? '' : '<label class="hf hf-1u"><span>&nbsp;</span><button type="button" class="heiz-zeit-toggle" onclick="toggleHeizZeit('+k.id+')">ausblenden</button></label>')+
        '</div>'
      : '<button type="button" class="heiz-zeit-toggle" onclick="toggleHeizZeit('+k.id+')">+ Zeitraum eingrenzen (Standard: ganzer Abrechnungszeitraum)</button>')+
  '</div>';
}
function addHeizblock(){
  const ea=NK_ENERGIEARTEN[0];
  store.addKostenPos({ typ:'heizung', bez:'Heizung ('+ea.label+')', energieart:ea.key, einheit:ea.einheit, heizwert:ea.hi, menge:0, preis:0, betrag:0, schluessel:'flaeche' });
  ensureIds();
  const neu=state.kosten[state.kosten.length-1]; if(neu && neu.id) ui.expandedHeizZeit.add(neu.id); // neuer Block: Zeitraum gleich aufgeklappt
  renderHeizung();
}
/* US-06/Aufräumen: Zeitraum-Eingrenzung eines Heizblocks ein-/ausklappen. */
function toggleHeizZeit(id){ if(ui.expandedHeizZeit.has(id)) ui.expandedHeizZeit.delete(id); else ui.expandedHeizZeit.add(id); renderHeizung(); }
function setEnergieart(idx, key){
  const ea=nkEnergieart(key); const k=store.kosten(idx);
  store.setKostenFeld(idx,'energieart',key);
  store.setKostenFeld(idx,'einheit',ea.einheit);
  store.setKostenFeld(idx,'heizwert',ea.hi);
  if(!k.bez || /^Heizung \(/.test(k.bez)) store.setKostenFeld(idx,'bez','Heizung ('+ea.label+')');
  store.setKostenFeld(idx,'betrag', nkHeizkosten(k.menge, k.preis));
  heizVorjahrBestaetigt(idx);
  renderHeizung();
}
function updHeiz(idx, field, val){
  /* US-95: Menge/Heizwert wirken nur noch auf die Kennzahl Ø €/kWh, NICHT mehr auf den Betrag. */
  store.setKostenFeld(idx, field, nkParseBetrag(val));
  heizVorjahrBestaetigt(idx);
  renderHeizung();
}
/* US-95: Heizkostensumme direkt setzen (führender Wert; früher aus Menge×Preis errechnet). */
function updHeizBetrag(idx, val){
  store.setKostenFeld(idx,'betrag', nkParseBetrag(val));
  heizVorjahrBestaetigt(idx);
  renderHeizung();
}
/* US-94: Grundkostenanteil (%) eines Heizblocks setzen (Klemmung auf 30–50 % erfolgt beim Lesen via nkHeizGrundProzent). */
function updHeizGrund(idx, val){
  store.setKostenFeld(idx,'grundProzent', nkParseBetrag(val));
  heizVorjahrBestaetigt(idx);
  renderHeizung();
}
/* US-07: CO2-Felder (kg / €) numerisch setzen, ohne die Heizkostensumme neu zu rechnen. */
function updHeizNum(idx, field, val){ store.setKostenFeld(idx, field, nkParseBetrag(val)); heizVorjahrBestaetigt(idx); renderHeizung(); }
/* US-58: Verteilerschlüssel und Verbrauch je Einheit auch im Heizung-Reiter setzen. */
function setHeizSchluessel(idx, val){ store.setKostenFeld(idx,'schluessel',val); heizVorjahrBestaetigt(idx); renderHeizung(); }
function updHeizVerbrauch(idx, einheitId, val){ store.setKostenVerbrauch(idx, einheitId, nkParseBetrag(val)); heizVorjahrBestaetigt(idx); renderHeizung(); }
function delHeizblock(idx){ store.removeKosten(idx); renderHeizung(); }
/* US-90: Heizblock aus dem Vorjahr aktiv übernehmen (Button auf der Heizkarte). */
function uebernehmeHeizVorjahr(idx){ const k=store.kosten(idx); if(!(k&&k.vorjahr)) return; store.setKostenFeld(idx,'vorjahr',false); finalizeVorjahrWennFertig(); renderHeizung(); renderVorjahrBanner(); saveState(); updateSaveStatus(); }
/* US-90: jede Bearbeitung eines Heizblocks bestätigt dessen Vorjahr-Vorbelegung (wie das Betragsfeld in „Kosten"). */
function heizVorjahrBestaetigt(idx){ const k=store.kosten(idx); if(k&&k.vorjahr){ store.setKostenFeld(idx,'vorjahr',false); finalizeVorjahrWennFertig(); renderVorjahrBanner(); } }

/* US-07: gebäudeweite CO2-Summe der fossilen Heizkosten (€). */
function co2KostenGesamt(){
  return (state.kosten||[]).reduce((s,k)=> s+((k.typ==='heizung'&&nkEnergieart(k.energieart).fossil)?(+k.co2Kosten||0):0),0);
}
/* US-07/AC7/AC9: kurze Erläuterung des greifenden Falls auf Gebäudeebene. Null, wenn keine
   fossilen CO2-Kosten erfasst sind. */
function co2GebaeudeText(){
  const kg=nkCo2KgSumme(state.kosten), fl=nkTotals(state.einheiten).flaeche;
  if(!(kg>0) || !(co2KostenGesamt()>0)) return null;
  const o=state.objekt||{};
  const spez=nkSpezCo2(kg, fl), stufe=nkCo2Stufe(spez), stufenP=nkCo2StufeProzent(spez);
  const ovGesetzt=(o.co2ProzentOverride!=null && o.co2ProzentOverride!=='');
  const wohnBasis=ovGesetzt? (+o.co2ProzentOverride||0) : stufenP;
  const pct=n=>String(Math.round((+n||0)*100)/100);
  let t='spez. Ausstoß '+nkFmtBetrag(spez)+' kg/m²·a → Stufe '+stufe+' von 10. '+
        'Vermieteranteil Wohnen '+pct(o.co2Denkmal?wohnBasis/2:wohnBasis)+' %'+(ovGesetzt?' (manuell)':'')+'.';
  if(alleMV().some(x=>x.m.gewerblich)) t+=' Gewerbe '+pct(o.co2Denkmal?25:50)+' % (pauschal 50/50).';
  if(o.co2Denkmal) t+=' Denkmal-/Milieuschutz: Anteil halbiert.';
  t+=' CO2-Kosten gesamt: '+eur(co2KostenGesamt())+'.';
  return t;
}
/* US-07: Denkmal-Checkbox + Override-Feld + Info auf der Heizung-Seite aktualisieren. */
function renderCo2Settings(){
  const o=state.objekt||{};
  const dk=document.getElementById('co2_denkmal'); if(dk) dk.checked=!!o.co2Denkmal;
  const ov=document.getElementById('co2_override'); if(ov && document.activeElement!==ov) ov.value=(o.co2ProzentOverride!=null?o.co2ProzentOverride:'');
  const info=document.getElementById('co2_settings_info');
  if(info){ const t=co2GebaeudeText(); info.textContent = t ? ('CO2KostAufG: '+t) : 'Noch keine fossilen CO2-Kosten erfasst – sobald CO2-Menge (kg) und CO2-Kosten (€) in einem fossilen Heizblock stehen, wird hier die Stufe ermittelt.'; }
}

