/* view-mieter.js (US-118 AC-4) – Reiter „Objekt/Einheiten", „Vorauszahlung (Soll)" und
   „Mieter & Vertrag": Einheiten, Mietverhältnisse, Vertrag, Mieterhöhung/Index/Staffel,
   Chronik, Vorauszahlungen. Aus view.js herausgelöst; nutzt state/store (core.js), ui (view-shell.js). */
function renderEinheiten(){
  ensureIds();
  const box = document.getElementById('einheiten_box'); box.innerHTML='';
  const vjSnap = ui.zeigeVorjahr ? nkFindVorjahr(objekte, aktivIdx) : null; /* US-59 */
  const vjOn = ui.zeigeVorjahr && !!vjSnap;
  state.einheiten.forEach((e,ei)=>{
    const vjE = vjSnap ? nkVorjahrEinheit(vjSnap, e.name) : null; /* US-59: Einheit über Namen matchen */
    const flaecheInp = vjOn
      ? vjFeld(vjE && vjE.flaeche!=null ? vjE.flaeche : null)
      : '<input class="short" type="number" value="'+e.flaeche+'" oninput="updEinheit('+ei+',\'flaeche\',this.value)">';
    const personenInp = vjOn
      ? vjFeld(vjE && vjE.personen!=null ? vjE.personen : null)
      : '<input class="short" type="number" value="'+e.personen+'" oninput="updEinheit('+ei+',\'personen\',this.value)">';
    /* US-96: unbeheizte Fläche (z. B. Terrasse) – wird bei den Heiz-Grundkosten von der Fläche abgezogen. */
    const unbeheiztInp = vjOn
      ? vjFeld(vjE && vjE.unbeheizt!=null ? vjE.unbeheizt : null)
      : '<input class="short" type="number" value="'+(e.unbeheizt||0)+'" oninput="updEinheit('+ei+',\'unbeheizt\',this.value)">';
    box.insertAdjacentHTML('beforeend',
      '<div class="unit-card einheit-card">'+
        '<div class="unit-head">'+
          '<input class="unit-name" value="'+esc(e.name)+'" oninput="updEinheit('+ei+',\'name\',this.value)"'+(vjOn?' readonly':'')+'>'+
          '<label class="unit-f">Fläche m² '+flaecheInp+'</label>'+
          '<label class="unit-f" title="Unbeheizte Fläche (z. B. Terrasse, Balkon). Wird nur bei den Heiz-Grundkosten von der Fläche abgezogen (US-96), sonst bleibt die volle Fläche maßgeblich.">unbeheizt m² '+unbeheiztInp+'</label>'+
          '<label class="unit-f">Personen '+personenInp+'</label>'+
          (vjOn?'':'<button class="row-del" title="Einheit entfernen" onclick="delEinheit('+ei+')" style="margin-left:auto;">×</button>')+
        '</div>'+
      '</div>');
  });
  setVjTitel('vjt_einh'); /* US-59 */
  renderMieterVertrag(); /* hält den Mieter-&-Vertrag-Reiter konsistent (gekoppelt) */
}
/* US-81: Mietverhältnis-Zeilen (Mieter, Zeitraum, Vertrag-Detail) einer Einheit. */
/* US-102: einheitliches beschriftetes Feld (wie im Heizung-Reiter) für das Vertrags-Detail. */
function hfFeld(cap, inp, cls){ return '<label class="hf'+(cls?' '+cls:'')+'"><span>'+cap+'</span>'+inp+'</label>'; }
function mvZeilen(e, ei){
  const vjSnap = ui.zeigeVorjahr ? nkFindVorjahr(objekte, aktivIdx) : null; /* US-59 */
  const vjOn = ui.zeigeVorjahr && !!vjSnap;
  return e.mv.map((m,mi)=>{
      if(vjOn){
        /* US-59: ohne Vertragsteil – nur Mieter + Zeitraum aus dem Vorjahr, read-only (Match je Einheit/Position). */
        const vm = vjSnap ? nkVorjahrMv(vjSnap, e.name, mi) : null;
        const inp=(v)=> '<input class="vj-field'+(vm?'':' vj-none')+'" type="text" readonly tabindex="-1" title="Vorjahreswert (zum Vergleich)" value="'+(vm?esc(String(v)):'–')+'" style="width:100%;box-sizing:border-box;">';
        const bisTxt = vm ? (vm.laeuft?'läuft':fmtDatum(vm.bis||'')) : '';
        return '<tr class="vj-mv-row">'+
          '<td>'+inp(vm?(vm.mieter||''):'')+'</td>'+
          '<td>'+inp(vm?fmtDatum(vm.von||''):'')+'</td>'+
          '<td>'+inp(bisTxt)+'</td>'+
          '<td colspan="3" class="hint">'+(vm?'aus Vorjahr':'kein Vorjahres-Mietverhältnis')+'</td>'+
          '<td></td>'+
        '</tr>';
      }
      const na=m.naechsteAnpassung||'';
      const badge = m.mhTyp
        ? (mhWarnung(m) ? ' <span class="warn" title="Mieterhöhung fällig – Ankündigung noch nicht verschickt">'+WARN_ICON+'</span>' : '')
        : (nkBaldFaellig(na, heute(), 3) ? ' <span class="warn" title="Mieterhöhung bald fällig ('+fmtDatum(na)+')">'+WARN_ICON+'</span>' : '');
      const open = ui.expandedMV.has(m.id);
      let row='<tr>'+
        '<td><span class="bez-cell"><input value="'+esc(m.mieter)+'" oninput="updMV('+ei+','+mi+',\'mieter\',this.value)">'+badge+'</span></td>'+
        '<td><input type="date" value="'+m.von+'" onchange="updMV('+ei+','+mi+',\'von\',this.value)" onblur="renderEinheiten()"></td>'+
        '<td>'+(m.laeuft
            ? '<span class="hint" title="laufendes Mietverhältnis – Ende = Abrechnungszeitraum">läuft</span>'
            : '<input type="date" value="'+(m.bis||'')+'" onchange="updMV('+ei+','+mi+',\'bis\',this.value)" onblur="renderEinheiten()">')+'</td>'+
        '<td title="läuft – offenes Ende (Ende = Abrechnungszeitraum)"><input type="checkbox" '+(m.laeuft?'checked':'')+' onchange="updMVLaeuft('+ei+','+mi+',this.checked)"></td>'+
        '<td title="gewerblich / umsatzsteuerpflichtig"><label class="gewerbl"><input type="checkbox" '+(m.gewerblich?'checked':'')+' onchange="updMV('+ei+','+mi+',\'gewerblich\',this.checked)"> ja</label></td>'+
        '<td><button class="status-toggle" onclick="toggleVertrag('+m.id+')">'+(open?'weniger ▴':'mehr ▾')+'</button></td>'+
        '<td>'+(e.mv.length>1?'<button class="row-del" title="Mietverhältnis entfernen" onclick="delMV('+ei+','+mi+')">×</button>':'')+'</td>'+ /* US: × erst ab 2 Mietverhältnissen (delMV wirkt erst dann) */
        '</tr>';
      if(open){
        const vg=(m.vertragGrundmiete!==undefined?m.vertragGrundmiete:(m.grundmiete||0));
        const vnk=(m.vertragNK!==undefined?m.vertragNK:(m.vmonat||0));
        const chronik=m.chronik||[];
        /* US-102-Schliff: Index-Anpassungen erzeugen bereits einen Chronik-Eintrag (gleiches Datum).
           Statt eines doppelten Textblocks blenden wir NUR die Aktionen (PDF + „verschickt") unter dem
           passenden Chronik-Eintrag ein; das × löscht dann Anpassung UND Chronik-Eintrag zusammen. */
        const idxByDatum={}; if(m.mhTyp==='index') (m.idxAnpassungen||[]).forEach((a,ii)=>{ if(a&&a.datum!=null) idxByDatum[a.datum]=ii; });
        /* US-109-Schliff: umgekehrte Reihenfolge – zuletzt hinzugefügter Eintrag oben (unabhängig vom
           Datum, damit ein neuer Eintrag immer ganz oben erscheint); ci bleibt der Original-Index. */
        const chronikRows=chronik.map((c,ci)=>({c,ci})).reverse().map(({c,ci})=>{
          const idxI=(m.mhTyp==='index' && c.datum!=null && idxByDatum[c.datum]!=null)?idxByDatum[c.datum]:null;
          const delCall=(idxI!=null)?'indexEintragLoeschen('+ei+','+mi+','+ci+','+idxI+')':'delChronik('+ei+','+mi+','+ci+')';
          /* Fälligkeits-Badge wie im Termine-Reiter (gleiches Colorcoding); erledigte Einträge neutral. */
          const cTage=nkTageBis(c.datum, heute());
          const cBadge = c.erledigt ? '<span class="termin-tage done">erledigt</span>'
            : (c.datum ? '<span class="termin-tage '+(nkTageFarbe(cTage)||'')+'" title="Zeit bis zum Termin">'+nkTageLabel(cTage)+'</span>' : '<span class="termin-tage"></span>');
          let out='<div class="chronik-row'+(c.erledigt?' erledigt':'')+'">'+cBadge+'<input type="date" value="'+(c.datum||'')+'" onchange="updChronik('+ei+','+mi+','+ci+',\'datum\',this.value)" onblur="renderEinheiten()"><textarea class="chronik-notiz" rows="1" oninput="updChronik('+ei+','+mi+','+ci+',\'text\',this.value); autoGrow(this)" placeholder="Was wurde angepasst?">'+esc(c.text)+'</textarea>'+
            '<label class="chronik-erledigt" title="Als erledigt markieren – Badge wird neutral"><input type="checkbox" '+(c.erledigt?'checked':'')+' onchange="setChronikErledigt('+ei+','+mi+','+ci+',this.checked)"> erledigt</label>'+
            '<button class="row-del" onclick="'+delCall+'">×</button></div>';
          if(idxI!=null){ const a=m.idxAnpassungen[idxI]; const ankM=m.ankuendigungen||{};
            const ang=nkIstAngekuendigt(ankM,a.datum); const va=nkAnkVerschicktAm(ankM,a.datum);
            out+='<div class="chronik-actions">'+
              '<button class="addrow" onclick="indexAnschreibenPdfRow('+ei+','+mi+','+idxI+')">Ankündigung als PDF</button>'+
              '<label class="staffel-ank"'+(ang&&va?' title="verschickt am '+fmtDatum(va)+'"':'')+'><input type="checkbox" '+(ang?'checked':'')+' onchange="indexAnkuendigung('+ei+','+mi+','+idxI+',this.checked)"> angekündigt</label>'+
            '</div>'; }
          /* US-109: Dateien an diesen Chronik-Eintrag anhängen (in den Mieter-Ordner) + Chips zum Öffnen. */
          if(typeof dokVerfuegbar==='function' && dokVerfuegbar()){
            const chips=(c.dateien||[]).map(nm=>'<span class="dok-chip">'+esc(nm)+' <button type="button" class="linklike" onclick="dokOeffnen('+ei+','+mi+',\''+encodeURIComponent(nm)+'\')">öffnen</button></span>').join('');
            out+='<div class="chronik-anh"><button type="button" class="linklike" onclick="dokChronikAnhang('+ei+','+mi+','+ci+')">📎 Datei anhängen</button> '+chips+'</div>';
          }
          return out;
        }).join('');
        const bald=nkBaldFaellig(na, heute(), 3);
        const hf=hfFeld;
        /* US-121 Phase 4: .hf-raster/.hf-Nu statt .heiz-felder. Eigene Zeile je Themengruppe statt
           einem gemeinsamen Flex-Container (gleiche Lehre wie bei den Heizungs-Gleichungen: sonst
           hängt der Umbruch vom verfügbaren Platz statt vom Inhalt ab). Anrede schmal, E-Mail breit
           statt "hf-wide" (galt nur im CSS-Grid-Kontext, hier .hf-raster ist Flexbox). Der Index-/
           Staffel-Block selbst (indexBlock) ist inhaltlich unverändert, nur hinter einer Lasche
           versteckt (mhAutomatikSection) – Konzept dafür folgt in einer eigenen Iteration. */
        const opPlus='<span class="hf-op">+</span>', opTimes='<span class="hf-op">×</span>', opEq='<span class="hf-op">=</span>';
        /* Dummy-Feinschliff 2026-07-05: Kaltmiete + Stellplätze × Preis = Gesamt als eine sichtbare
           Gleichungs-Zeile (vorher: "Aktuelle Grundmiete" separat, kein Gesamt-Ergebnis sichtbar). */
        const gesamtMiete=(+m.grundmiete||0)+(+m.stellAnzahl||0)*(+m.stellPreis||0);
        row+='<tr class="detail-row"><td colspan="7" class="detail-cell">'+
          /* US-72: Miete-Felder nur ohne aktiven Mieterhöhungstyp; bei Index/Staffel kommt die Miete aus dem Block. */
          (m.mhTyp?'':'<div class="hf-raster">'+
            hf('Miete bei Einzug','<input type="text" inputmode="decimal" value="'+nkFmtBetrag(vg)+'" oninput="updVertrag('+ei+','+mi+',\'vertragGrundmiete\',this.value,1)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))">','hf-2u')+
            hf('Urspr. NK/Monat','<input type="text" inputmode="decimal" value="'+nkFmtBetrag(vnk)+'" oninput="updVertrag('+ei+','+mi+',\'vertragNK\',this.value,1)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))">','hf-2u')+
          '</div>')+
          '<div class="hf-raster">'+
            (m.mhTyp
              ? hf('Kaltmiete','<input type="text" class="ro" readonly tabindex="-1" value="'+nkFmtBetrag(m.grundmiete||0)+'">','hf-2u')
              : hf('Aktuelle Grundmiete','<input type="text" inputmode="decimal" value="'+nkFmtBetrag(m.grundmiete||0)+'" oninput="updVertrag('+ei+','+mi+',\'grundmiete\',this.value,1)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))">','hf-2u'))+
            opPlus+
            hf('Stellplätze','<input type="number" min="0" value="'+(m.stellAnzahl||0)+'" oninput="updVertrag('+ei+','+mi+',\'stellAnzahl\',this.value,1)">','hf-1u')+
            opTimes+
            hf('Preis je Stellplatz','<input type="text" inputmode="decimal" value="'+nkFmtBetrag(m.stellPreis||0)+'" oninput="updVertrag('+ei+','+mi+',\'stellPreis\',this.value,1)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))">','hf-1u')+
            opEq+
            hf('Gesamt','<input type="text" class="ro" readonly tabindex="-1" value="'+nkFmtBetrag(gesamtMiete)+' €">','hf-1u')+
          '</div>'+
          (m.mhTyp?'':'<div class="hf-raster">'+
            hf('Letzte Anpassung','<input type="date" value="'+(m.letzteAnpassung||'')+'" onchange="updVertrag('+ei+','+mi+',\'letzteAnpassung\',this.value)" onblur="renderEinheiten()">','hf-2u')+
            hf('Nächste Anpassung','<input type="date" value="'+na+'" onchange="updVertrag('+ei+','+mi+',\'naechsteAnpassung\',this.value)" onblur="renderEinheiten()">','hf-2u')+
          '</div>')+
          '<div class="hf-raster">'+
            hf('Anrede','<select onchange="updVertrag('+ei+','+mi+',\'anrede\',this.value)"><option value="">neutral</option><option value="herr"'+(m.anrede==="herr"?" selected":"")+'>Herr</option><option value="frau"'+(m.anrede==="frau"?" selected":"")+'>Frau</option></select>','hf-1u')+
            hf('E-Mail','<input type="email" value="'+esc(m.email)+'" oninput="store.setMvFeld('+ei+','+mi+',\'email\',this.value)" placeholder="mieter@example.de">','hf-3u')+
          '</div>'+
          mhAutomatikSection(m,ei,mi)+ /* US-68/US-121: Index-/Staffelmiete hinter Lasche (Dummy 2026-07-05) */
          /* US-109-Schliff: kleiner „+ Chronik-Eintrag" oben neben der Überschrift; Einträge neueste zuerst. */
          '<div class="chronik-titel">Anpassungs-Chronik <button type="button" class="chronik-add" onclick="addChronik('+ei+','+mi+')">+ Chronik-Eintrag</button></div>'+
          chronikRows+
          ((bald && !m.mhTyp)?'<div class="leer-hint" style="margin-top:6px;">'+WARN_ICON+' Nächste Anpassung am '+fmtDatum(na)+' – in Kürze fällig.</div>':'')+ /* US-72: Relikt nur ohne aktiven Mieterhöhungstyp */
        '</td></tr>';
      }
      return row;
    }).join('');
}
/* US-81: Reiter "Mieter & Vertrag" - je Einheit die Mietverhaeltnisse samt Vertrag-Detail. */
function renderMieterVertrag(){
  ensureIds();
  const box = document.getElementById('mieter_vertrag_box'); if(!box) return; box.innerHTML='';
  state.einheiten.forEach((e,ei)=>{
    const lz = leerstandZa(e);
    const leerHint = lz>NK_LEERSTAND_EPS ? '<div class="leer-hint">'+WARN_ICON+' Leerstand: '+Math.round(lz*100)+' % des Zeitraums (trägt der Vermieter).</div>' : '';
    box.insertAdjacentHTML('beforeend',
      '<div class="unit-card einheit-card">'+
        '<div class="unit-head"><b>'+esc(e.name)+'</b> <span class="pill">'+(+e.flaeche||0)+' m² · '+(+e.personen||0)+' Pers.</span></div>'+
        '<table class="mv-table"><thead><tr><th>Mieter</th><th>von</th><th>bis</th><th>läuft</th><th>gewerbl.</th><th>Vertrag</th><th></th></tr></thead><tbody>'+mvZeilen(e,ei)+'</tbody></table>'+
        '<button class="addrow" onclick="addMV('+ei+')">+ Mietverhältnis</button>'+
        leerHint+
        (nkUeberlappungTageEinheit(e, state.objekt.bis)>0 ? '<div class="leer-hint" style="color:var(--nachzahlung);">'+WARN_ICON+' Überschneidende Mietzeiträume: '+nkUeberlappungTageEinheit(e, state.objekt.bis)+' Tag(e) doppelt belegt – bitte Zeiträume prüfen.</div>' : '')+
      '</div>');
  });
  /* US-66: Chronik-Textfelder initial an ihren Inhalt anpassen. */
  document.querySelectorAll('#mieter_vertrag_box .chronik-notiz').forEach(autoGrow);
  setVjTitel('vjt_mieter'); /* US-59 */
}
/* US-66: Textarea-Höhe an den Inhalt anpassen (auto-grow). */
function autoGrow(el){ if(!el) return; el.style.height='auto'; el.style.height=(el.scrollHeight)+'px'; }
document.getElementById('obj_addr').addEventListener('input',e=>{store.setObjektFeld('addr',e.target.value);}); /* US-65: Adresse ändert NICHT den Objektnamen im Header (ComboBox) – nur "Speichern unter" benennt um */
/* Datum nur in den Zustand schreiben; Neu-Zeichnen erst beim Verlassen (sonst wirft type=date beim Tippen der Jahreszahl raus). */
document.getElementById('obj_von').addEventListener('change',e=>{store.setObjektFeld('von',e.target.value); renderObjTitle();});
document.getElementById('obj_bis').addEventListener('change',e=>{store.setObjektFeld('bis',e.target.value); renderObjTitle();});
document.getElementById('obj_von').addEventListener('blur',renderEinheiten);
document.getElementById('obj_bis').addEventListener('blur',renderEinheiten);
/* US-51: Vermieter & Zahlungsangaben */
document.getElementById('z_empfaenger').addEventListener('input',e=>store.setZahlungFeld('empfaenger',e.target.value));
document.getElementById('z_anschrift').addEventListener('input',e=>store.setZahlungFeld('anschrift',e.target.value));
document.getElementById('z_iban').addEventListener('input',e=>{store.setZahlungFeld('iban',e.target.value); updateIbanHint();});
document.getElementById('z_bic').addEventListener('input',e=>store.setZahlungFeld('bic',e.target.value));
document.getElementById('z_frist').addEventListener('input',e=>store.setZahlungFeld('frist',e.target.value));
/* US-07: CO2-Einstellungen (Denkmal-Halbierung, manueller Vermieteranteil Wohnen) */
(function(){
  const dk=document.getElementById('co2_denkmal');
  if(dk) dk.addEventListener('change',e=>{ store.setObjektFeld('co2Denkmal', e.target.checked); renderCo2Settings(); });
  const ov=document.getElementById('co2_override');
  if(ov) ov.addEventListener('input',e=>{ const v=e.target.value; store.setObjektFeld('co2ProzentOverride', v===''?'':nkParseBetrag(v)); renderCo2Settings(); });
})();

/* Store (Zustandsmutationen) ausgelagert nach core.js (US-33b/US-34). */

function updEinheit(ei,field,val){ store.setEinheitFeld(ei,field,val); }
function updMV(ei,mi,field,val){ store.setMvFeld(ei,mi,field,val); /* Datum: Neu-Zeichnen via onblur, nicht beim Tippen */ }
function updMVLaeuft(ei,mi,checked){ store.setMvFeld(ei,mi,'laeuft', !!checked); renderEinheiten(); } /* US-75: offenes Ende */
function addMV(ei){ store.addMv(ei); renderEinheiten(); }
function delMV(ei,mi){ store.removeMv(ei,mi); renderEinheiten(); }
/* US-21: Vertrag & Anpassungs-Chronik je Mietverhältnis */
function toggleVertrag(id){ if(ui.expandedMV.has(id)) ui.expandedMV.delete(id); else ui.expandedMV.add(id); renderEinheiten(); }
function updVertrag(ei,mi,field,val,num){ store.setVertragFeld(ei,mi,field, num? nkParseBetrag(val): val, num); /* Datum: Neu-Zeichnen via onblur */ }
/* US-68/US-70 (Redesign): Mieterhöhung als Stichtag-Modell. */
const NK_MONATSNAMEN=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
function updMhTyp(ei,mi,val){
  const m=store.mv(ei,mi);
  store.setMvFeld(ei,mi,'mhTyp',val);
  if(val==='index'){
    if(!m.idxEinzug) store.setMvFeld(ei,mi,'idxEinzug', m.von||state.objekt.von||'');
    if(m.idxAusgangsmiete===undefined||m.idxAusgangsmiete==='') store.setMvNum(ei,mi,'idxAusgangsmiete', +m.grundmiete||0);
    if(!m.idxFrequenz) store.setMvNum(ei,mi,'idxFrequenz',1);
  }
  if(val==='staffel'){
    if(!m.stafBeginn) store.setMvFeld(ei,mi,'stafBeginn', m.von||state.objekt.von||'');
    if(m.stafAusgangsmiete===undefined||m.stafAusgangsmiete==='') store.setMvNum(ei,mi,'stafAusgangsmiete', +m.grundmiete||0);
    if(!m.stafFrequenz) store.setMvNum(ei,mi,'stafFrequenz',1);
    staffelSync(ei,mi);
  }
  renderEinheiten();
}
function updIdx(ei,mi,field,val){ store.setMvFeld(ei,mi,field,val); renderEinheiten(); }
function updIdxNum(ei,mi,field,val){ store.setMvNum(ei,mi,field, nkParseBetrag(val)); renderEinheiten(); }
/* Indexstand-Monat in Monat/Jahr getrennt pflegen (behebt das „Jahr fest"-Problem von type=month). */
function updIdxMonatTeil(ei,mi,which,teil,val){
  const m=store.mv(ei,mi);
  const anz=(m.idxAnpassungen||[]).length;
  const field = which==='vor' ? 'idxVorMonat' : 'idxIndexMonat';
  const def = which==='vor'
    ? nkIndexBasisMonat(m.idxEinzug, m.idxAnpassungen)
    : nkIndexVerwendeterMonat(nkIndexNaechsteAnpassung(m.idxEinzug,m.idxFrequenz,anz));
  const cur=(m[field]||def||'').split('-'); let yy=cur[0]||'', mm=cur[1]||'';
  if(teil==='m') mm=String(val).padStart(2,'0'); else yy=String(val);
  store.setMvFeld(ei,mi,field, yy+'-'+mm);
  renderEinheiten();
}
/* US-68: nächste Index-Anpassung übernehmen – die Liste rückt eins weiter. */
function indexUebernehmen(ei,mi){
  const m=store.mv(ei,mi);
  const proz=+m.idxProzent||0;
  if(!proz){ alert('Bitte zuerst die Indexveränderung in % eintragen.'); return; }
  const anz=(m.idxAnpassungen||[]).length;
  const datum=nkIndexNaechsteAnpassung(m.idxEinzug, m.idxFrequenz, anz);
  const basis=nkIndexAktuelleMiete(m.idxAusgangsmiete, m.idxAnpassungen);
  const neue=nkIndexNeueMiete(basis, proz);
  const monat=m.idxIndexMonat||nkIndexVerwendeterMonat(datum);
  const basisMonat=m.idxVorMonat||nkIndexBasisMonat(m.idxEinzug, m.idxAnpassungen);
  const liste=(m.idxAnpassungen||[]).concat([{datum, prozent:proz, alteMiete:basis, neueMiete:neue, monat, basisMonat}]);
  store.setMvFeld(ei,mi,'idxAnpassungen', liste);
  store.setMvNum(ei,mi,'grundmiete', neue);
  store.setMvFeld(ei,mi,'idxProzent','');
  store.setMvFeld(ei,mi,'idxIndexMonat','');
  store.setMvFeld(ei,mi,'idxVorMonat','');
  store.addChronik(ei,mi);
  const ci=store.mv(ei,mi).chronik.length-1;
  store.setChronikFeld(ei,mi,ci,'datum',datum);
  store.setChronikFeld(ei,mi,ci,'text','Indexmiete +'+nkFmtBetrag(proz)+' % ('+nkFmtBetrag(basis)+' € → '+neue+' €, Index '+(basisMonat?basisMonat+'→':'')+(monat||'')+')');
  renderEinheiten();
}
function indexAnpassungLoeschen(ei,mi,idx){
  if(!confirm('Diese Anpassung wirklich löschen?')) return;
  const m=store.mv(ei,mi);
  const liste=nkIndexAnpassungLoeschen(m.idxAnpassungen, idx);
  store.setMvFeld(ei,mi,'idxAnpassungen', liste);
  store.setMvNum(ei,mi,'grundmiete', nkIndexAktuelleMiete(m.idxAusgangsmiete, liste));
  renderEinheiten();
}
/* US-72: offene Mieterhöhung? (fälliger/bald fälliger Stichtag ohne verschickte Ankündigung)
   – steuert das Warn-Dreieck hinter dem Mieternamen, auch bei zugeklapptem Vertrag. */
function mhWarnung(m){
  if(!m || !m.mhTyp) return false;
  const h=heute(); const ank=m.ankuendigungen||{};
  if(m.mhTyp==='index'){
    const st=nkIndexNaechsteAnpassung(m.idxEinzug, m.idxFrequenz, (m.idxAnpassungen||[]).length);
    return (nkIndexFaellig(st,h) || nkBaldFaellig(st,h,3)) && !nkIstAngekuendigt(ank,st); /* AC-2a: angekündigte Anpassung warnt nicht mehr */
  }
  if(m.mhTyp==='staffel'){
    const plan=nkStaffelPlan(m.stafBeginn, m.stafEnde, m.stafFrequenz, m.stafAusgangsmiete, m.stafBetrag);
    return plan.some(s=> (nkIndexFaellig(s.datum,h)||nkBaldFaellig(s.datum,h,3)) && !nkIstAngekuendigt(ank,s.datum));
  }
  return false;
}
/* US-121 Phase 4 Teil 2 (Dummy-Feinschliff): kompakte "Nächste Erhöhung"-Zeile, sichtbar auch bei
   eingeklappten Automatik-Details – liefert Stichtag/Frequenz-Text/Ankündigen-Checkbox unabhängig
   vom Typ (Index/Staffel), ohne die bestehende indexBlock()-Logik anzufassen. */
function mhNaechsteInfo(m,ei,mi){
  if(!m || !m.mhTyp) return null;
  const h=heute(); const ank=m.ankuendigungen||{};
  const freqLabel=(f)=> (+f===1?'jährlich':'alle '+(+f||1)+' Jahre');
  if(m.mhTyp==='index'){
    const anz=(m.idxAnpassungen||[]).length;
    const datum=nkIndexNaechsteAnpassung(m.idxEinzug, m.idxFrequenz, anz);
    if(!datum) return null;
    return { datum, freqLabel: freqLabel(m.idxFrequenz||1), checked: nkIstAngekuendigt(ank,datum),
      onToggle:'idxVorabAnkuendigung('+ei+','+mi+',\''+datum+'\',this.checked)' };
  }
  if(m.mhTyp==='staffel'){
    const plan=nkStaffelPlan(m.stafBeginn, m.stafEnde, m.stafFrequenz, m.stafAusgangsmiete, m.stafBetrag);
    if(!plan.length) return null;
    const next = plan.find(s=> (nkIndexFaellig(s.datum,h)||nkBaldFaellig(s.datum,h,3)) && !nkIstAngekuendigt(ank,s.datum))
              || plan.find(s=> nkDatum(s.datum) > nkDatum(h))
              || plan[plan.length-1];
    return { datum: next.datum, freqLabel: freqLabel(m.stafFrequenz||1), checked: nkIstAngekuendigt(ank,next.datum),
      onToggle:'staffelAnkuendigung('+ei+','+mi+',\''+next.datum+'\',this.checked)' };
  }
  return null;
}
/* Automatik-Details hinter einer Lasche verstecken (Dummy 2026-07-05): die bestehende indexBlock()-
   Ausgabe bleibt inhaltlich unverändert (Konzept dafür folgt in einer eigenen Iteration), sie wird nur
   ein-/ausklappbar gemacht; die Zusammenfassungszeile bleibt auch eingeklappt sichtbar. */
function toggleAutomatik(id){ if(ui.expandedAutomatik.has(id)) ui.expandedAutomatik.delete(id); else ui.expandedAutomatik.add(id); renderEinheiten(); }
function mhAutomatikSection(m,ei,mi){
  const info=mhNaechsteInfo(m,ei,mi);
  const open=ui.expandedAutomatik.has(m.id);
  return '<button type="button" class="heiz-zeit-toggle" onclick="toggleAutomatik('+m.id+')">'+(open?'▾':'▸')+' Automatik-Details (Beginn, Häufigkeit)</button>'+
    (open
      ? indexBlock(m,ei,mi) /* Details bereits vollständig sichtbar (inkl. eigener "Nächste Erhöhung"-Zeile) – keine doppelte Zusammenfassung. */
      : (info ? '<div class="mh-titel">Nächste Erhöhung: <b>'+fmtDatum(info.datum)+'</b>, '+info.freqLabel+' · <label class="staffel-ank"><input type="checkbox" '+(info.checked?'checked':'')+' onchange="'+info.onToggle+'"> angekündigt</label></div>' : ''));
}
/* US-69: vollständiges, self-contained Anschreiben-Datenobjekt (für PDF + Einfrieren). */
function mhDatenBasis(ei,mi){
  const m=store.mv(ei,mi), e=state.einheiten[ei], z=state.zahlung||{};
  return {
    anredeText: nkAnrede(m), mieter:String(m.mieter||''),
    empfZeile2: (e.name||'')+' · '+(state.objekt.addr||''),
    objektAddr:String(state.objekt.addr||''), einheitName:String(e.name||''),
    vermieter:String(z.empfaenger||''), vermieterAnschrift:String(z.anschrift||''),
    iban:String(z.iban||''), bic:String(z.bic||''),
    stellAnzahl:+m.stellAnzahl||0, stellPreis:+m.stellPreis||0, nk:nkMonatNK(m)
  };
}
function mhDatenIndex(ei,mi,idx){ /* idx==null => offene (pending) Anpassung */
  const m=store.mv(ei,mi);
  let datum,stichtag1,alteMiete,prozent,monatVon,monatBis,neueMiete;
  if(idx==null){
    const anz=(m.idxAnpassungen||[]).length;
    datum=nkIndexNaechsteAnpassung(m.idxEinzug,m.idxFrequenz,anz);
    stichtag1=anz?m.idxAnpassungen[anz-1].datum:(m.idxEinzug||'');
    alteMiete=nkIndexAktuelleMiete(m.idxAusgangsmiete,m.idxAnpassungen);
    prozent=+m.idxProzent||0;
    monatVon=m.idxVorMonat||nkIndexBasisMonat(m.idxEinzug,m.idxAnpassungen);
    monatBis=m.idxIndexMonat||nkIndexVerwendeterMonat(datum);
    neueMiete=nkIndexNeueMiete(alteMiete,prozent);
  } else {
    const a=m.idxAnpassungen[idx];
    datum=a.datum; stichtag1=idx>0?m.idxAnpassungen[idx-1].datum:(m.idxEinzug||'');
    alteMiete=a.alteMiete; prozent=a.prozent; monatVon=a.basisMonat; monatBis=a.monat; neueMiete=a.neueMiete;
  }
  return Object.assign(mhDatenBasis(ei,mi), {typ:'index', stichtag:datum, stichtag1,
    alteMiete, prozent, monatVon, monatBis, rohNeu:alteMiete+nkIndexErhoehungsbetrag(alteMiete,prozent),
    neueMiete, frist:nkMitteilungsfrist(datum)});
}
function mhDatenStaffel(ei,mi,datum,alteMiete,neueMiete,betrag){
  return Object.assign(mhDatenBasis(ei,mi), {typ:'staffel', stichtag:datum,
    alteMiete:+alteMiete, neueMiete:+neueMiete, betrag:+betrag});
}
/* Unterschiede zwischen eingefrorenem Schnappschuss und aktuellem Stand (für die Warnung). */
function mhDiff(snap, live){
  const o=[];
  if((+snap.stellAnzahl||0)!==(+live.stellAnzahl||0)) o.push('Stellplätze: '+(+snap.stellAnzahl||0)+' → '+(+live.stellAnzahl||0));
  if((+snap.stellPreis||0)!==(+live.stellPreis||0)) o.push('Preis je Stellplatz: '+eur(snap.stellPreis||0)+' → '+eur(live.stellPreis||0));
  if((+snap.nk||0)!==(+live.nk||0)) o.push('NK-Vorauszahlung: '+eur(snap.nk||0)+' → '+eur(live.nk||0));
  if((snap.mieter||'')!==(live.mieter||'')) o.push('Mieter: '+(snap.mieter||'')+' → '+(live.mieter||''));
  if((snap.vermieter||'')!==(live.vermieter||'')) o.push('Vermieter: '+(snap.vermieter||'')+' → '+(live.vermieter||''));
  if((snap.vermieterAnschrift||'')!==(live.vermieterAnschrift||'')) o.push('Vermieter-Anschrift geändert');
  if((snap.empfZeile2||'')!==(live.empfZeile2||'')) o.push('Mieter-/Objektanschrift geändert');
  return o;
}
function mhEntfernenBestaetigt(datumVerschickt, snap, live){
  const diff=mhDiff(snap, live);
  const txt='Das Anschreiben wurde am '+(datumVerschickt?fmtDatum(datumVerschickt):'—')+' als verschickt markiert und eingefroren.\n\n'+
    (diff.length?('Seither geändert:\n- '+diff.join('\n- ')+'\n\n'):'')+
    'Wenn du den Haken entfernst, wird der eingefrorene Stand verworfen; ein neu erzeugtes PDF entspricht dann nicht mehr dem versendeten Schreiben. Fortfahren?';
  return confirm(txt);
}
function indexAnkuendigung(ei,mi,idx,checked){
  const m=store.mv(ei,mi); const a=(m.idxAnpassungen||[])[idx]; if(!a) return;
  const datum=a.datum; const ankM=m.ankuendigungen||{};
  if(checked){
    store.setAnk(ei,mi,datum,{verschicktAm:heute(), snapshot:mhDatenIndex(ei,mi,idx), typ:'Index'});
  } else {
    const snap=nkAnkSnapshot(ankM,datum);
    if(snap && !mhEntfernenBestaetigt(nkAnkVerschicktAm(ankM,datum), snap, mhDatenIndex(ei,mi,idx))){ renderEinheiten(); return; }
    store.setAnk(ei,mi,datum,null);
  }
  renderEinheiten();
}
/* AC-2a (US-118): Ankündigung der kommenden (noch nicht übernommenen) Index-Anpassung.
   Nutzt dieselbe mhAngekuendigt-Map wie der Termine-Reiter (Stichtag-keyed) -> beidseitig verknüpft. */
function idxVorabAnkuendigung(ei,mi,stichtag,checked){ store.setMhAngekuendigt(ei,mi,stichtag,checked); renderEinheiten(); }
/* US-70: Staffel – gültige Miete automatisch aus dem Plan ableiten und als Soll setzen. */
function staffelSync(ei,mi){
  const m=store.mv(ei,mi);
  const plan=nkStaffelPlan(m.stafBeginn, m.stafEnde, m.stafFrequenz, m.stafAusgangsmiete, m.stafBetrag);
  store.setMvNum(ei,mi,'grundmiete', nkStaffelMieteAm(plan, m.stafAusgangsmiete, heute()));
}
/* Staffel-Parameter ändern – schützt eingefrorene Ankündigungen, deren Stichtag durch die
   Änderung aus dem Plan fiele: Rückfrage mit 3 Ausgängen (Verwerfen / Löschen / Behalten). */
function staffelParamAendern(ei,mi,field,val,isNum,render){
  const m=store.mv(ei,mi);
  const neuVal = isNum ? nkParseBetrag(val) : val;
  const altSet = new Set(nkStaffelPlan(m.stafBeginn,m.stafEnde,m.stafFrequenz,m.stafAusgangsmiete,m.stafBetrag).map(s=>s.datum));
  const probe = Object.assign({}, m, {[field]: isNum?+neuVal:neuVal});
  const neuSet = new Set(nkStaffelPlan(probe.stafBeginn,probe.stafEnde,probe.stafFrequenz,probe.stafAusgangsmiete,probe.stafBetrag).map(s=>s.datum));
  const ank = m.ankuendigungen||{};
  const verwaist = Object.keys(ank).filter(d=> ank[d]&&ank[d].snapshot && altSet.has(d) && !neuSet.has(d));
  if(verwaist.length){
    if(!confirm(verwaist.length+' versendete (eingefrorene) Ankündigung(en) liegen nach dieser Änderung nicht mehr im Staffelplan.\n\nOK = Änderung durchführen\nAbbrechen = Änderung verwerfen')){
      renderEinheiten(); return; /* Verwerfen – Feld zurücksetzen */
    }
    if(!confirm('Versendete Ankündigungen behalten?\n\nOK = behalten (werden separat als Beleg gelistet)\nAbbrechen = löschen')){
      const map=Object.assign({},ank); verwaist.forEach(d=>delete map[d]); store.setMvFeld(ei,mi,'ankuendigungen',map); /* Löschen */
    } /* sonst: behalten */
  }
  if(isNum) store.setMvNum(ei,mi,field,+neuVal); else store.setMvFeld(ei,mi,field,neuVal);
  staffelSync(ei,mi);
  if(render) renderEinheiten(); /* Datumsfelder zeichnen erst via onblur neu (sonst kein Tippen der Jahreszahl) */
}
function updStaf(ei,mi,field,val){ staffelParamAendern(ei,mi,field,val,true,true); }
function updStafDatum(ei,mi,field,val){ staffelParamAendern(ei,mi,field,val,false,false); }
function staffelOrphanPdf(ei,mi,datum){
  if(typeof ensurePdfLib==='function' && !ensurePdfLib()) return;
  const m=store.mv(ei,mi); const snap=nkAnkSnapshot(m.ankuendigungen||{}, datum);
  if(snap) buildMieterhoehungPdf(snap).save('Mieterhoehung-'+pdfSafeName(m.mieter)+'.pdf');
}
function staffelOrphanLoeschen(ei,mi,datum){
  if(!confirm('Diesen versendeten Ankündigungs-Beleg wirklich löschen?')) return;
  store.setAnk(ei,mi,datum,null); renderEinheiten();
}
function staffelPlanRow(m,datum){
  const plan=nkStaffelPlan(m.stafBeginn, m.stafEnde, m.stafFrequenz, m.stafAusgangsmiete, m.stafBetrag);
  return plan.find(s=>s.datum===datum)||{datum, alteMiete:0, neueMiete:0};
}
function staffelAnkuendigung(ei,mi,datum,checked){
  const m=store.mv(ei,mi); const ankM=m.ankuendigungen||{};
  const r=staffelPlanRow(m,datum);
  const live=mhDatenStaffel(ei,mi,datum,r.alteMiete,r.neueMiete,(r.neueMiete-r.alteMiete));
  if(checked){
    store.setAnk(ei,mi,datum,{verschicktAm:heute(), snapshot:live, typ:'Staffel'});
  } else {
    const snap=nkAnkSnapshot(ankM,datum);
    if(snap && !mhEntfernenBestaetigt(nkAnkVerschicktAm(ankM,datum), snap, live)){ renderEinheiten(); return; }
    store.setAnk(ei,mi,datum,null);
  }
  renderEinheiten();
}
/* US-69: Mieterhöhungs-Anschreiben als PDF (eingefrorener Schnappschuss, sonst Live-Daten). */
function indexAnschreibenPdf(ei,mi){
  if(typeof ensurePdfLib==='function' && !ensurePdfLib()) return;
  const m=store.mv(ei,mi);
  if(!(+m.idxProzent||0)){ alert('Bitte zuerst die Indexveränderung in % eintragen.'); return; }
  buildMieterhoehungPdf(mhDatenIndex(ei,mi,null)).save('Mieterhoehung-'+pdfSafeName(m.mieter)+'.pdf');
}
function indexAnschreibenPdfRow(ei,mi,idx){
  if(typeof ensurePdfLib==='function' && !ensurePdfLib()) return;
  const m=store.mv(ei,mi); const a=(m.idxAnpassungen||[])[idx]; if(!a) return;
  const snap=nkAnkSnapshot(m.ankuendigungen||{}, a.datum);
  buildMieterhoehungPdf(snap || mhDatenIndex(ei,mi,idx)).save('Mieterhoehung-'+pdfSafeName(m.mieter)+'.pdf');
}
function staffelAnschreibenPdf(ei,mi,datum,alteMiete,neueMiete,betrag){
  if(typeof ensurePdfLib==='function' && !ensurePdfLib()) return;
  const m=store.mv(ei,mi); const snap=nkAnkSnapshot(m.ankuendigungen||{}, datum);
  const daten=snap || mhDatenStaffel(ei,mi,datum,alteMiete,neueMiete,betrag);
  buildMieterhoehungPdf(daten).save('Mieterhoehung-'+pdfSafeName(m.mieter)+'.pdf');
}
/* US-102-Schliff: Index-Anpassung samt zugehörigem Chronik-Eintrag löschen (gleiches Datum) und die
   Miete neu berechnen – aufgerufen vom × der Chronik-Zeile, wenn sie zu einer Index-Anpassung gehört. */
function indexEintragLoeschen(ei,mi,ci,idxAnp){
  if(!confirm('Diese Index-Anpassung und den zugehörigen Chronik-Eintrag wirklich löschen?')) return;
  const m=store.mv(ei,mi);
  const liste=nkIndexAnpassungLoeschen(m.idxAnpassungen, idxAnp);
  store.setMvFeld(ei,mi,'idxAnpassungen', liste);
  store.setMvNum(ei,mi,'grundmiete', nkIndexAktuelleMiete(m.idxAusgangsmiete, liste));
  store.removeChronik(ei,mi,ci);
  renderEinheiten();
}
function indexBlock(m,ei,mi){
  const typ=m.mhTyp||'';
  let h='<div class="index-block">'+
    '<div class="hf-raster">'+hfFeld('Mieterhöhung',
      '<select onchange="updMhTyp('+ei+','+mi+',this.value)">'+
      '<option value=""'+(typ===''?' selected':'')+'>— keine —</option>'+
      '<option value="index"'+(typ==='index'?' selected':'')+'>Index (§ 557b)</option>'+
      '<option value="staffel"'+(typ==='staffel'?' selected':'')+'>Staffel (§ 557a)</option>'+
      '</select>','hf-2u')+'</div>';
  if(typ==='index'){
    const anz=(m.idxAnpassungen||[]).length;
    const stichtag2=nkIndexNaechsteAnpassung(m.idxEinzug, m.idxFrequenz, anz);
    const stichtag1=anz ? m.idxAnpassungen[anz-1].datum : (m.idxEinzug||'');
    const faellig=nkIndexFaellig(stichtag2, heute());
    const bald=nkBaldFaellig(stichtag2, heute(), 3);
    const frist=nkMitteilungsfrist(stichtag2);
    const basis=nkIndexAktuelleMiete(m.idxAusgangsmiete, m.idxAnpassungen);
    const proz=+m.idxProzent||0;
    const erh=nkIndexErhoehungsbetrag(basis, proz);
    const neue=nkIndexNeueMiete(basis, proz);
    const monatGewaehlt=m.idxIndexMonat||nkIndexVerwendeterMonat(stichtag2);
    const basisMonat=nkIndexBasisMonat(m.idxEinzug, m.idxAnpassungen);
    const mg=monatGewaehlt.split('-'); const my=mg[0]||'', mm=mg[1]||'';
    h+='<div class="heiz-felder">'+
      hfFeld('Beginn / Einzug','<input type="date" value="'+(m.idxEinzug||'')+'" onchange="store.setMvFeld('+ei+','+mi+',\'idxEinzug\',this.value)" onblur="renderEinheiten()">')+
      hfFeld('Miete bei Einzug','<input type="text" inputmode="decimal" value="'+nkFmtBetrag(m.idxAusgangsmiete||0)+'" onchange="updIdxNum('+ei+','+mi+',\'idxAusgangsmiete\',this.value)">')+
      hfFeld('Anpassung alle … Jahre','<input type="number" min="1" step="1" value="'+(m.idxFrequenz||1)+'" onchange="updIdxNum('+ei+','+mi+',\'idxFrequenz\',this.value)">')+
    '</div>';
    if(!nkIndexFrequenzGueltig(m.idxFrequenz||1)) h+='<div class="leer-hint" style="color:var(--nachzahlung);">'+WARN_ICON+' Frequenz muss eine ganze Zahl ab 1 Jahr sein (§ 557b).</div>';
    h+='<div class="mh-aktuell">Aktuell gültige Miete: <b>'+eur(basis)+'</b></div>';
    /* US-102-Schliff: „Bisherige Anpassungen" wandern nach unten in die Anpassungs-Chronik (indexHistRows),
       damit sie sich nicht zwischen die oberen Eingabefelder quetschen. */
    /* Fälligkeits-Warnung – außerhalb der Box */
    h+='<div class="mh-titel" style="color:'+(faellig?'var(--nachzahlung)':'inherit')+';">Nächste Erhöhung zum <b>'+fmtDatum(stichtag2)+'</b>'+
      (faellig?' <span style="color:var(--nachzahlung);">'+WARN_ICON+' fällig</span>':(bald?' <span>'+WARN_ICON+' bald fällig</span>':''))+
      ' <span class="info" title="Mitteilungsfrist in Textform (§ 557b): '+(frist?fmtDatum(frist):'—')+'">ⓘ</span></div>';
    /* Box „Neue Anpassung": vorheriger Index → Folge-Index → % → Formel */
    const vorMonat=m.idxVorMonat||basisMonat; const vp=vorMonat.split('-'); const vmy=vp[0]||'', vmm=vp[1]||'';
    const rohNeu=basis+erh;
    h+='<div class="index-naechste">'+
      '<div class="chronik-titel">Neue Anpassung</div>'+
      '<div class="mh-input-row">'+
        '<label>Vorheriger Index<span class="mh-monyear">'+
          '<select class="mh-month" onchange="updIdxMonatTeil('+ei+','+mi+',\'vor\',\'m\',this.value)">'+NK_MONATSNAMEN.map((nm,idx)=>{const v=String(idx+1).padStart(2,'0');return '<option value="'+v+'"'+(vmm===v?' selected':'')+'>'+nm+'</option>';}).join('')+'</select>'+
          '<input class="mh-year" type="number" min="2000" max="2100" value="'+vmy+'" onchange="updIdxMonatTeil('+ei+','+mi+',\'vor\',\'y\',this.value)">'+
        '</span></label>'+
        '<label>Folge-Index vom<span class="mh-monyear">'+
          '<select class="mh-month" onchange="updIdxMonatTeil('+ei+','+mi+',\'folge\',\'m\',this.value)">'+NK_MONATSNAMEN.map((nm,idx)=>{const v=String(idx+1).padStart(2,'0');return '<option value="'+v+'"'+(mm===v?' selected':'')+'>'+nm+'</option>';}).join('')+'</select>'+
          '<input class="mh-year" type="number" min="2000" max="2100" value="'+my+'" onchange="updIdxMonatTeil('+ei+','+mi+',\'folge\',\'y\',this.value)">'+
        '</span></label>'+
        '<label>Veränderung %<input class="short" type="text" inputmode="decimal" value="'+(proz?nkFmtBetrag(proz):'')+'" placeholder="z. B. 2,0" onchange="updIdxNum('+ei+','+mi+',\'idxProzent\',this.value)"></label>'+
      '</div>'+
      '<div class="mh-formel">'+eur(basis)+' × (1 + '+nkFmtBetrag(proz)+' %) = '+eur(rohNeu)+' → <b title="abgerundet auf volle Euro">'+eur(neue)+'</b> <span class="hint">(abgerundet)</span>'+
        ' <button class="addrow" onclick="indexUebernehmen('+ei+','+mi+')">Anpassung übernehmen</button>'+
        ' <button class="addrow" onclick="indexAnschreibenPdf('+ei+','+mi+')">Ankündigung als PDF</button>'+
        /* AC-2a (US-118): Ankündigung der KOMMENDEN Index-Anpassung – verbunden mit dem Termine-Reiter
           (mhAngekuendigt, Stichtag-keyed). Setzen rückt dort den nächsten Termin nach. */
        ' <label class="staffel-ank"><input type="checkbox" '+(nkIstAngekuendigt(m.ankuendigungen||{}, stichtag2)?'checked':'')+' onchange="idxVorabAnkuendigung('+ei+','+mi+',\''+stichtag2+'\',this.checked)"> angekündigt</label></div>'+
    '</div>';
  }
  if(typ==='staffel'){
    const plan=nkStaffelPlan(m.stafBeginn, m.stafEnde, m.stafFrequenz, m.stafAusgangsmiete, m.stafBetrag);
    const aktuell=nkStaffelMieteAm(plan, m.stafAusgangsmiete, heute());
    const ank=m.ankuendigungen||{};
    /* Beginn/Enddatum koppeln: Zeitraum max. 15 Jahre, sonst kein (riesiger) Plan + Hinweis. */
    const spanZuGross = (function(){ const e=nkDatum(m.stafEnde); return !!(e && nkDatum(m.stafBeginn) && e > nkDatum(nkPlusJahre(m.stafBeginn,15))); })();
    h+='<div class="heiz-felder">'+
      hfFeld('Beginn','<input type="date" value="'+(m.stafBeginn||'')+'" onchange="updStafDatum('+ei+','+mi+',\'stafBeginn\',this.value)" onblur="renderEinheiten()">')+
      hfFeld('Enddatum','<input type="date" value="'+(m.stafEnde||'')+'" onchange="updStafDatum('+ei+','+mi+',\'stafEnde\',this.value)" onblur="renderEinheiten()">')+
      hfFeld('Miete bei Beginn','<input type="text" inputmode="decimal" value="'+nkFmtBetrag(m.stafAusgangsmiete||0)+'" onchange="updStaf('+ei+','+mi+',\'stafAusgangsmiete\',this.value)">')+
      hfFeld('Erhöhung je Staffel €','<input type="text" inputmode="decimal" value="'+((+m.stafBetrag||0)?nkFmtBetrag(m.stafBetrag):'')+'" placeholder="z. B. 25,00" onchange="updStaf('+ei+','+mi+',\'stafBetrag\',this.value)">')+
      hfFeld('Anpassung alle … Jahre','<input type="number" min="1" step="1" value="'+(m.stafFrequenz||1)+'" onchange="updStaf('+ei+','+mi+',\'stafFrequenz\',this.value)">')+
    '</div>';
    if(!m.stafEnde) h+='<div class="leer-hint" style="color:var(--nachzahlung);">'+WARN_ICON+' Bitte ein Enddatum der Staffelvereinbarung angeben.</div>';
    if(!nkIndexFrequenzGueltig(m.stafFrequenz||1)) h+='<div class="leer-hint" style="color:var(--nachzahlung);">'+WARN_ICON+' Frequenz muss eine ganze Zahl ab 1 Jahr sein (§ 557a).</div>';
    h+='<div class="mh-aktuell">Aktuell gültige Miete: <b>'+(spanZuGross?'—':eur(aktuell))+'</b></div>';
    if(spanZuGross){
      h+='<div class="leer-hint" style="color:var(--nachzahlung);">'+WARN_ICON+' Der Zeitraum zwischen Beginn und Enddatum darf höchstens 15 Jahre betragen. Bitte Beginn und Enddatum prüfen.</div>';
    } else if(plan.length){
      h+='<div class="chronik-titel">Staffelplan</div>';
      h+=plan.map(s=>{
        const erreicht=nkIndexFaellig(s.datum, heute());
        const istAng=nkIstAngekuendigt(ank,s.datum); const angDatum=nkAnkVerschicktAm(ank,s.datum);
        const warn=erreicht && !istAng;
        return '<div class="index-hist'+(warn?' staffel-warn':'')+'">'+
          '<div class="ih-text">'+fmtDatum(s.datum)+': '+eur(s.alteMiete)+' + '+eur(s.neueMiete-s.alteMiete)+' = <b>'+eur(s.neueMiete)+'</b>'+
          (warn?' <span style="color:var(--nachzahlung);">'+WARN_ICON+' fällig</span>':'')+'</div>'+
          '<div class="ih-actions"><label class="staffel-ank"'+(istAng&&angDatum?' title="verschickt am '+fmtDatum(angDatum)+'"':'')+'><input type="checkbox" '+(istAng?'checked':'')+' onchange="staffelAnkuendigung('+ei+','+mi+',\''+s.datum+'\',this.checked)"> angekündigt</label>'+
          ' <button class="addrow" onclick="staffelAnschreibenPdf('+ei+','+mi+',\''+s.datum+'\','+s.alteMiete+','+s.neueMiete+','+(s.neueMiete-s.alteMiete)+')">Ankündigung als PDF</button></div>'+
        '</div>';
      }).join('');
    } else if(m.stafEnde){
      h+='<div class="hint">Keine Stichtage im Zeitraum.</div>';
    }
    /* Behaltene versendete Ankündigungen, deren Stichtag nicht (mehr) im Plan liegt. */
    const planSet=new Set(plan.map(s=>s.datum));
    const orphans=Object.keys(ank).filter(d=> ank[d]&&ank[d].snapshot&&ank[d].typ==='Staffel' && !planSet.has(d)).sort();
    if(orphans.length){
      h+='<div class="chronik-titel">Versendete Ankündigungen außerhalb des aktuellen Plans</div>';
      h+=orphans.map(d=>{ const snap=ank[d].snapshot; return '<div class="index-hist">'+
        '<div class="ih-text">'+fmtDatum(d)+': → <b>'+eur(snap.neueMiete)+'</b> <span class="hint">(verschickt am '+fmtDatum(ank[d].verschicktAm)+')</span></div>'+
        '<div class="ih-actions"><button class="addrow" onclick="staffelOrphanPdf('+ei+','+mi+',\''+d+'\')">Ankündigung als PDF</button>'+
        ' <button class="row-del" title="Beleg löschen" onclick="staffelOrphanLoeschen('+ei+','+mi+',\''+d+'\')">×</button></div>'+
      '</div>'; }).join('');
    }
  }
  h+='</div>';
  return h;
}
function addChronik(ei,mi){ store.addChronik(ei,mi); const m=store.mv(ei,mi); const ci=(m.chronik||[]).length-1; if(ci>=0) store.setChronikFeld(ei,mi,ci,'datum',heute()); renderEinheiten(); } /* US-109-Schliff: neuer Eintrag mit heutigem Datum -> steht bei „neueste zuerst" oben */
function delChronik(ei,mi,ci){ if(!confirm('Diesen Chronik-Eintrag wirklich löschen?')) return; store.removeChronik(ei,mi,ci); renderEinheiten(); }
function updChronik(ei,mi,ci,field,val){ store.setChronikFeld(ei,mi,ci,field,val); /* Datum: Neu-Zeichnen via onblur */ }
function setChronikErledigt(ei,mi,ci,checked){ store.setChronikFeld(ei,mi,ci,'erledigt',checked); renderEinheiten(); }
function addEinheit(){ store.addEinheit(); renderEinheiten(); }
function delEinheit(ei){ store.removeEinheit(ei); renderEinheiten(); }

/* ---------- Step 2 ---------- */
function recomputeVoraus(m){
  m.voraus = ui.vorausModus==='monatlich'
    ? nkVorauszahlungGesamt(m.vmonat, m.vmonate, m.einmal)
    : nkVorauszahlungGesamt(m.vjahr, 1, m.einmal);
}
function updVorausMV(ei, mi, field, val){
  store.setMvNum(ei,mi,field, nkParseBetrag(val));
  const m=store.mv(ei,mi); recomputeVoraus(m);
  const c=document.getElementById('gesamt-'+ei+'-'+mi); if(c) c.textContent=eur(nkSollMonat(m.grundmiete, m.vmonat, m.stellAnzahl, m.stellPreis));
}
function renderVoraus(){
  const head=document.getElementById('voraus_head');
  const tb=document.querySelector('#tbl_voraus tbody'); tb.innerHTML='';
  // Aufgeräumt: monatliches Soll als Gleichung. Grundmiete/Stellplätze stammen aus dem Vertrag (read-only);
  // nur die Nebenkosten (NK-Vorauszahlung) werden hier erfasst. Gesamt = monatliche Warmmiete.
  // Operatoren als eigene Spalten: jede Zeile liest sich als Gleichung
  // Grundmiete + Anzahl × Stellplatz + Nebenkosten = Gesamt.
  head.innerHTML =
    '<tr>'+
      '<th>Mieter</th><th>Einheit</th>'+
      '<th class="num">Grundmiete (€)</th><th class="op-col">+</th>'+
      '<th class="num">Anzahl Stellplätze</th><th class="op-col">×</th>'+
      '<th class="num">Stellplatz (€)</th><th class="op-col">+</th>'+
      '<th class="num">Nebenkosten (€)</th><th class="op-col">=</th>'+
      '<th class="num">Gesamt (€)</th><th>Notiz</th>'+
    '</tr>';
  const vjSnap = ui.zeigeVorjahr ? nkFindVorjahr(objekte, aktivIdx) : null; /* US-59 */
  const vjOn = ui.zeigeVorjahr && !!vjSnap;
  alleMV().forEach(({e,m,ei,mi})=>{
    recomputeVoraus(m);
    const gesamtMonat=nkSollMonat(m.grundmiete, m.vmonat, m.stellAnzahl, m.stellPreis);
    /* US-59: im Vorjahr-Modus die NK-Vorauszahlung (vmonat) read-only aus dem Vorjahr zeigen. */
    const vjV = vjSnap ? nkVorjahrVmonat(vjSnap, e.name, m.mieter) : null;
    const vmonatInp = vjOn
      ? vjFeld(vjV!=null ? nkFmtBetrag(vjV) : null)
      : '<input class="short" type="text" inputmode="decimal" value="'+nkFmtBetrag(m.vmonat)+'" oninput="updVorausMV('+ei+','+mi+',\'vmonat\',this.value)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))">';
    const tr=document.createElement('tr');
    tr.innerHTML=
      '<td>'+esc(m.mieter)+'</td>'+
      '<td><span class="pill">'+esc(e.name)+'</span></td>'+
      '<td class="num">'+eur(m.grundmiete||0)+'</td>'+
      '<td class="op-col">+</td>'+
      '<td class="num">'+(+m.stellAnzahl||0)+'</td>'+
      '<td class="op-col">×</td>'+
      '<td class="num">'+eur(m.stellPreis||0)+'</td>'+
      '<td class="op-col">+</td>'+
      '<td class="num">'+vmonatInp+'</td>'+
      '<td class="op-col">=</td>'+
      '<td class="num" id="gesamt-'+ei+'-'+mi+'">'+eur(gesamtMonat)+'</td>'+
      '<td><textarea class="notiz-cell" rows="1" oninput="store.setMvFeld('+ei+','+mi+',\'notiz\',this.value)" placeholder="Notiz">'+esc(m.notiz)+'</textarea></td>';
    tb.appendChild(tr);
  });
  setVjTitel('vjt_voraus'); /* US-59 */
}

/* ---------- Step 3 ---------- */
/* US-103: Warnung, wenn Direktkosten/Kleinreparaturen je Einheit die zulässigen Grenzen
   überschreiten (Einzelgrenze ~100 €, Jahresdeckel ~8 % der Jahreskaltmiete). */
function renderKleinrepWarn(){
  const box=document.getElementById('kleinrep_warn'); if(!box) return;
  const w=nkKleinrepWarnungen(state.einheiten, state.kosten, state.objekt);
  if(!w.length){ box.innerHTML=''; return; }
  const items=w.map(x=> x.art==='jahr'
    ? '<li>Einheit „'+esc(x.einheit)+'": Direktkosten '+eur(x.summe)+' überschreiten den Kleinreparatur-Jahresdeckel von '+eur(x.grenze)+' ('+x.prozent+' % der Jahreskaltmiete '+eur(x.jahresKalt)+').</li>'
    : '<li>Einheit „'+esc(x.einheit)+'": Einzelposition über '+eur(x.einzel)+' ('+x.positionen.map(esc).join(', ')+').</li>'
  ).join('');
  box.innerHTML='<div class="warn-box"><b>⚠ Kleinreparaturen/Direktkosten prüfen</b><ul>'+items+'</ul>'+
    '<span class="warn-note">Kleinreparaturen sind nur bis zu diesen Grenzen auf den Mieter abwälzbar (Kleinreparaturklausel) und <b>nicht</b> über die Betriebskosten umlagefähig. Grenzen als Orientierung – Einzelfall prüfen.</span></div>';
}
