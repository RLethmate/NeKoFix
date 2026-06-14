/* view.js – Render-/View-Schicht und Init (US-33c).
   Geladen NACH calc.js und core.js, VOR pdf.js. Enthält UI-Konstanten, Render-
   Funktionen, Event-Handler und den Init-Block. Nutzt state/store/Persistenz aus core.js. */

/* State, Store, Persistenz: ausgelagert nach core.js (US-33b). `state`, `objekte`,
   `aktivIdx`, `store`, `commit`, `saveState/loadState` u. a. sind dort global definiert. */
const STEPS = ["Objekt","Vorauszahlung","Kosten","Berechnung","Abrechnung","Zahlungen"];
let current = 0, activeMieter = 0;
let vorausModus = "monatlich";

const eur = n => n.toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const SCHLUESSEL = { flaeche:"nach Wohnfläche (m²)", person:"nach Personen", einheit:"nach Wohneinheit" };
const KOSTEN_KATALOG = [
  "Aufzug",
  "Beleuchtung / Allgemeinstrom",
  "Gartenpflege",
  "Gebäudereinigung",
  "Gebäudeversicherung",
  "Grundsteuer",
  "Hauswart",
  "Heizung & Warmwasser (Messdienst)",
  "Kabel-/Fernsehsignal",
  "Müllbeseitigung",
  "Schornsteinreinigung",
  "Straßenreinigung",
  "Ungezieferbekämpfung",
  "Wasser / Abwasser"
];
const WARN_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
const STATUS_BELEG={geschaetzt:"geschätzt",vorlaeufig:"vorläufig",geprueft:"geprüft"};
const VERFUEGBAR={fehlt:"fehlt",kommt:"kommt noch",vorhanden:"vorhanden"};
const STATUS_FARBE={geschaetzt:"var(--muted)",vorlaeufig:"#d99a2b",geprueft:"var(--accent)"};
const VERFUEGBAR_FARBE={fehlt:"var(--nachzahlung)",kommt:"#d99a2b",vorhanden:"var(--accent)"};
let nurUngeprueft=false;
let expandedKosten=new Set();
let expandedMV=new Set();
function heute(){ return new Date().toISOString().slice(0,10); }

/* Rechenkern ausgelagert nach calc.js (testbar): nkTotals, nkFactor, nkAnteilOf, nkLineItemsFor */
const esc = nkEsc; /* US-36: Freitext-Escaping (aus calc.js) */
function fmtDatum(s){ const p=String(s||'').split('-'); return p.length===3 ? p[2]+'.'+p[1]+'.'+p[0] : (s||''); }
function zeitraumText(){ return fmtDatum(state.objekt.von)+' – '+fmtDatum(state.objekt.bis); }
function alleMV(){ const out=[]; state.einheiten.forEach((e,ei)=>{ (e.mv||[]).forEach((m,mi)=>{ out.push({e,m,ei,mi,za:nkZeitanteil(m.von,m.bis,state.objekt.von,state.objekt.bis)}); }); }); return out; }
function leerstandZa(e){ const s=(e.mv||[]).reduce((a,m)=>a+nkZeitanteil(m.von,m.bis,state.objekt.von,state.objekt.bis),0); return Math.max(0,1-s); }

/* ---------- Stepper ---------- */
function renderStepper(){
  const el = document.getElementById('stepper'); el.innerHTML='';
  STEPS.forEach((label,i)=>{
    const d=document.createElement('div');
    d.className='step'+(i===current?' active':'')+(i<current?' done':'');
    d.innerHTML='<span class="n">'+(i+1)+'</span>'+label;
    d.onclick=()=>go(i);
    el.appendChild(d);
  });
}
function go(i){
  if(i===3) computeView();
  if(i===4) renderDoc();
  if(i===5) renderZahlungen();
  current=i;
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active', +p.dataset.step===i));
  renderStepper();
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ---------- Step 1 ---------- */
function fillObjektKopf(){
  document.getElementById('obj_addr').value = state.objekt.addr;
  document.getElementById('obj_von').value = state.objekt.von;
  document.getElementById('obj_bis').value = state.objekt.bis;
}
function renderEinheiten(){
  ensureIds();
  const box = document.getElementById('einheiten_box'); box.innerHTML='';
  state.einheiten.forEach((e,ei)=>{
    const lz = leerstandZa(e);
    const mvRows = e.mv.map((m,mi)=>{
      const na=m.naechsteAnpassung||'';
      const badge = nkBaldFaellig(na, heute(), 3) ? ' <span class="warn" title="Mieterhöhung bald fällig ('+fmtDatum(na)+')">'+WARN_ICON+'</span>' : '';
      const open = expandedMV.has(m.id);
      let row='<tr>'+
        '<td><span class="bez-cell"><input value="'+esc(m.mieter)+'" oninput="updMV('+ei+','+mi+',\'mieter\',this.value)">'+badge+'</span></td>'+
        '<td><input type="date" value="'+m.von+'" onchange="updMV('+ei+','+mi+',\'von\',this.value)" onblur="renderEinheiten()"></td>'+
        '<td><input type="date" value="'+m.bis+'" onchange="updMV('+ei+','+mi+',\'bis\',this.value)" onblur="renderEinheiten()"></td>'+
        '<td title="gewerblich / umsatzsteuerpflichtig"><label class="gewerbl"><input type="checkbox" '+(m.gewerblich?'checked':'')+' onchange="updMV('+ei+','+mi+',\'gewerblich\',this.checked)"> gewerbl.</label></td>'+
        '<td><button class="status-toggle" onclick="toggleVertrag('+m.id+')">Vertrag '+(open?'▴':'▾')+'</button></td>'+
        '<td><button class="row-del" title="Mietverhältnis entfernen" onclick="delMV('+ei+','+mi+')">×</button></td>'+
        '</tr>';
      if(open){
        const vg=(m.vertragGrundmiete!==undefined?m.vertragGrundmiete:(m.grundmiete||0));
        const vnk=(m.vertragNK!==undefined?m.vertragNK:(m.vmonat||0));
        const chronik=m.chronik||[];
        const chronikRows=chronik.map((c,ci)=>'<div class="chronik-row"><input type="date" value="'+(c.datum||'')+'" onchange="updChronik('+ei+','+mi+','+ci+',\'datum\',this.value)" onblur="renderEinheiten()"><input value="'+esc(c.text)+'" oninput="updChronik('+ei+','+mi+','+ci+',\'text\',this.value)" placeholder="Was wurde angepasst?"><button class="row-del" onclick="delChronik('+ei+','+mi+','+ci+')">×</button></div>').join('');
        const bald=nkBaldFaellig(na, heute(), 3);
        row+='<tr class="detail-row"><td colspan="6">'+
          '<div class="detail-grid">'+
            '<label>Urspr. Grundmiete <input class="short" type="text" inputmode="decimal" value="'+nkFmtBetrag(vg)+'" oninput="updVertrag('+ei+','+mi+',\'vertragGrundmiete\',this.value,1)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))"></label>'+
            '<label>Urspr. NK/Monat <input class="short" type="text" inputmode="decimal" value="'+nkFmtBetrag(vnk)+'" oninput="updVertrag('+ei+','+mi+',\'vertragNK\',this.value,1)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))"></label>'+
            '<label>Letzte Anpassung <input type="date" value="'+(m.letzteAnpassung||'')+'" onchange="updVertrag('+ei+','+mi+',\'letzteAnpassung\',this.value)" onblur="renderEinheiten()"></label>'+
            '<label>Nächste Anpassung <input type="date" value="'+na+'" onchange="updVertrag('+ei+','+mi+',\'naechsteAnpassung\',this.value)" onblur="renderEinheiten()"></label>'+
          '</div>'+
          '<div class="chronik-titel">Anpassungs-Chronik</div>'+chronikRows+
          '<button class="addrow" onclick="addChronik('+ei+','+mi+')">+ Eintrag</button>'+
          (bald?'<div class="leer-hint" style="margin-top:6px;">'+WARN_ICON+' Nächste Anpassung am '+fmtDatum(na)+' – in Kürze fällig.</div>':'')+
        '</td></tr>';
      }
      return row;
    }).join('');
    const leerHint = lz>NK_LEERSTAND_EPS ? '<div class="leer-hint">'+WARN_ICON+' Leerstand: '+Math.round(lz*100)+' % des Zeitraums (trägt der Vermieter).</div>' : '';
    box.insertAdjacentHTML('beforeend',
      '<div class="unit-card">'+
        '<div class="unit-head">'+
          '<input class="unit-name" value="'+esc(e.name)+'" oninput="updEinheit('+ei+',\'name\',this.value)">'+
          '<label class="unit-f">Fläche m² <input class="short" type="number" value="'+e.flaeche+'" oninput="updEinheit('+ei+',\'flaeche\',this.value)"></label>'+
          '<label class="unit-f">Personen <input class="short" type="number" value="'+e.personen+'" oninput="updEinheit('+ei+',\'personen\',this.value)"></label>'+
          '<button class="row-del" title="Einheit entfernen" onclick="delEinheit('+ei+')" style="margin-left:auto;">×</button>'+
        '</div>'+
        '<table class="mv-table"><thead><tr><th>Mieter</th><th>von</th><th>bis</th><th>gewerbl.</th><th>Vertrag</th><th></th></tr></thead><tbody>'+mvRows+'</tbody></table>'+
        '<button class="addrow" onclick="addMV('+ei+')">+ Mietverhältnis</button>'+
        leerHint+
      '</div>');
  });
}
document.getElementById('obj_addr').addEventListener('input',e=>{store.setObjektFeld('addr',e.target.value); renderObjektSelect();});
/* Datum nur in den Zustand schreiben; Neu-Zeichnen erst beim Verlassen (sonst wirft type=date beim Tippen der Jahreszahl raus). */
document.getElementById('obj_von').addEventListener('change',e=>{store.setObjektFeld('von',e.target.value); renderObjektSelect();});
document.getElementById('obj_bis').addEventListener('change',e=>{store.setObjektFeld('bis',e.target.value); renderObjektSelect();});
document.getElementById('obj_von').addEventListener('blur',renderEinheiten);
document.getElementById('obj_bis').addEventListener('blur',renderEinheiten);

/* Store (Zustandsmutationen) ausgelagert nach core.js (US-33b/US-34). */

function updEinheit(ei,field,val){ store.setEinheitFeld(ei,field,val); }
function updMV(ei,mi,field,val){ store.setMvFeld(ei,mi,field,val); /* Datum: Neu-Zeichnen via onblur, nicht beim Tippen */ }
function addMV(ei){ store.addMv(ei); renderEinheiten(); }
function delMV(ei,mi){ store.removeMv(ei,mi); renderEinheiten(); }
/* US-21: Vertrag & Anpassungs-Chronik je Mietverhältnis */
function toggleVertrag(id){ if(expandedMV.has(id)) expandedMV.delete(id); else expandedMV.add(id); renderEinheiten(); }
function updVertrag(ei,mi,field,val,num){ store.setVertragFeld(ei,mi,field, num? nkParseBetrag(val): val, num); /* Datum: Neu-Zeichnen via onblur */ }
function addChronik(ei,mi){ store.addChronik(ei,mi); renderEinheiten(); }
function delChronik(ei,mi,ci){ store.removeChronik(ei,mi,ci); renderEinheiten(); }
function updChronik(ei,mi,ci,field,val){ store.setChronikFeld(ei,mi,ci,field,val); /* Datum: Neu-Zeichnen via onblur */ }
function addEinheit(){ store.addEinheit(); renderEinheiten(); }
function delEinheit(ei){ store.removeEinheit(ei); renderEinheiten(); }

/* ---------- Step 2 ---------- */
function recomputeVoraus(m){
  m.voraus = vorausModus==='monatlich'
    ? nkVorauszahlungGesamt(m.vmonat, m.vmonate, m.einmal)
    : nkVorauszahlungGesamt(m.vjahr, 1, m.einmal);
}
function setVorausModus(x){ vorausModus=x; renderVoraus(); }
function updVorausMV(ei, mi, field, val){
  store.setMvNum(ei,mi,field, nkParseBetrag(val));
  const m=store.mv(ei,mi); recomputeVoraus(m);
  const c=document.getElementById('gesamt-'+ei+'-'+mi); if(c) c.textContent=eur(m.voraus);
}
function renderVoraus(){
  const head=document.getElementById('voraus_head');
  const tb=document.querySelector('#tbl_voraus tbody'); tb.innerHTML='';
  const monat = vorausModus==='monatlich';
  head.innerHTML = monat
    ? '<tr><th>Mieter</th><th>Einheit</th><th class="num">Monatsbetrag (€)</th><th class="num">Monate</th><th class="num">Einmalzahlung (€)</th><th class="num">Gesamt (€)</th><th>Notiz</th></tr>'
    : '<tr><th>Mieter</th><th>Einheit</th><th class="num">Jahressumme (€)</th><th class="num">Einmalzahlung (€)</th><th class="num">Gesamt (€)</th><th>Notiz</th></tr>';
  alleMV().forEach(({e,m,ei,mi})=>{
    recomputeVoraus(m);
    const tr=document.createElement('tr');
    const kopf='<td>'+esc(m.mieter)+'</td><td><span class="pill">'+esc(e.name)+'</span></td>';
    const gesamt='<td class="num" id="gesamt-'+ei+'-'+mi+'">'+eur(m.voraus)+'</td>';
    const notizCell='<td><input value="'+esc(m.notiz)+'" oninput="store.setMvFeld('+ei+','+mi+',\'notiz\',this.value)" placeholder="Notiz"></td>';
    if(monat){
      tr.innerHTML=kopf+
        '<td class="num"><input class="short" type="text" inputmode="decimal" value="'+nkFmtBetrag(m.vmonat)+'" oninput="updVorausMV('+ei+','+mi+',\'vmonat\',this.value)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))"></td>'+
        '<td class="num"><input class="short" type="number" value="'+m.vmonate+'" oninput="updVorausMV('+ei+','+mi+',\'vmonate\',this.value)"></td>'+
        '<td class="num"><input class="short" type="text" inputmode="decimal" value="'+nkFmtBetrag(m.einmal)+'" oninput="updVorausMV('+ei+','+mi+',\'einmal\',this.value)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))"></td>'+gesamt+notizCell;
    } else {
      tr.innerHTML=kopf+
        '<td class="num"><input class="short" type="text" inputmode="decimal" value="'+nkFmtBetrag(m.vjahr)+'" oninput="updVorausMV('+ei+','+mi+',\'vjahr\',this.value)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))"></td>'+
        '<td class="num"><input class="short" type="text" inputmode="decimal" value="'+nkFmtBetrag(m.einmal)+'" oninput="updVorausMV('+ei+','+mi+',\'einmal\',this.value)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))"></td>'+gesamt+notizCell;
    }
    tb.appendChild(tr);
  });
}

/* ---------- Step 3 ---------- */
function renderKosten(){
  ensureIds();
  const tb=document.querySelector('#tbl_kosten tbody'); tb.innerHTML='';
  state.kosten.forEach((k,idx)=>{
    const st=k.status||'vorlaeufig', vf=k.verfuegbar||'vorhanden';
    if(k.vorsteuer===undefined) k.vorsteuer=nkVorschlagVorsteuer(k.bez);
    if(nurUngeprueft && st==='geprueft') return;
    let opts='';
    for(const key in SCHLUESSEL){ opts+='<option value="'+key+'"'+(k.schluessel===key?' selected':'')+'>'+SCHLUESSEL[key]+'</option>'; }
    const info = nkUmlageInfo(k.bez);
    const warn = info.umlagefaehig ? '' : ' <span class="warn" title="'+info.grund.replace(/"/g,'')+'">'+WARN_ICON+'</span>';
    const dots='<span class="dot" style="background:'+STATUS_FARBE[st]+'" title="Status: '+STATUS_BELEG[st]+'"></span>'+
               '<span class="dot" style="background:'+VERFUEGBAR_FARBE[vf]+'" title="Verfügbarkeit: '+VERFUEGBAR[vf]+'"></span>';
    const open=expandedKosten.has(k.id);
    const tr=document.createElement('tr'); tr.id='krow-'+idx; if(k.vorjahr) tr.className='vorjahr';
    tr.innerHTML=
      '<td><span class="bez-cell"><input value="'+esc(k.bez)+'" oninput="store.setKostenFeld('+idx+',\'bez\',this.value)" onchange="applyKostenart('+idx+',this.value)">'+warn+(k.vorjahr?' <span class="vorjahr-badge">aus Vorjahr</span>':'')+'</span></td>'+
      '<td class="num"><input class="short" type="text" inputmode="decimal" value="'+nkFmtBetrag(k.betrag)+'" oninput="updKostenBetrag('+idx+',this.value)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))"></td>'+
      '<td><span class="schluessel-cell"><select title="Vorschlag – überschreibbar. Üblich: Fläche (z. B. Grundsteuer, Versicherung, Heizung), Personen (z. B. Wasser/Abwasser), Wohneinheit (z. B. Müll, Aufzug)." onchange="store.setKostenFeld('+idx+',\'schluessel\',this.value)">'+opts+'</select><button class="reset-btn" title="Verteilerschlüssel auf Vorschlag zurücksetzen" onclick="resetSchluessel('+idx+')">↺</button></span></td>'+
      '<td><button class="status-toggle" onclick="toggleKostenDetail('+k.id+')" title="Status & Notiz">'+dots+'<span class="chev">'+(open?'▴':'▾')+'</span></button></td>'+
      '<td><button class="row-del" title="Position entfernen" onclick="deleteKostenRow('+idx+')">×</button></td>';
    tb.appendChild(tr);
    if(open){
      let so=''; for(const key in STATUS_BELEG){ so+='<option value="'+key+'"'+(st===key?' selected':'')+'>'+STATUS_BELEG[key]+'</option>'; }
      let vo=''; for(const key in VERFUEGBAR){ vo+='<option value="'+key+'"'+(vf===key?' selected':'')+'>'+VERFUEGBAR[key]+'</option>'; }
      let vsOpts=''; [0,7,19].forEach(s=>{ vsOpts+='<option value="'+s+'"'+((+k.vorsteuer||0)===s?' selected':'')+'>'+s+' %</option>'; });
      const d=document.createElement('tr'); d.className='detail-row';
      d.innerHTML='<td colspan="5"><div class="detail-grid">'+
        '<label>Status <select onchange="updKosten('+idx+',\'status\',this.value)">'+so+'</select></label>'+
        '<label>Verfügbarkeit <select onchange="updKosten('+idx+',\'verfuegbar\',this.value)">'+vo+'</select></label>'+
        '<label title="Im Beleg enthaltene Vorsteuer">Vorsteuer <select onchange="updKosten('+idx+',\'vorsteuer\',+this.value)">'+vsOpts+'</select></label>'+
        '<label class="notiz-field">Notiz <input value="'+esc(k.notiz)+'" oninput="store.setKostenFeld('+idx+',\'notiz\',this.value)" placeholder="z. B. Zähler defekt"></label>'+
      '</div></td>';
      tb.appendChild(d);
    }
  });
  const uc=document.getElementById('ungeprueft_count'); if(uc){ const n=nkUngeprueftAnzahl(state.kosten); uc.textContent = n? ' — '+n+' offen' : ' — alle geprüft'; }
  renderPicker();
}
function updKosten(idx,field,val){ store.setKostenFeld(idx,field,val); renderKosten(); }
/* US-11: Betrag erfassen hebt die Vorjahr-Markierung der Zeile auf */
function updKostenBetrag(idx,val){ store.setKostenBetrag(idx, nkParseBetrag(val)); const k=store.kosten(idx); if(k.vorjahr){ store.setKostenFeld(idx,'vorjahr',false); const r=document.getElementById('krow-'+idx); if(r) r.classList.remove('vorjahr'); const b=r&&r.querySelector('.vorjahr-badge'); if(b) b.remove(); } }
function toggleKostenDetail(id){ if(expandedKosten.has(id)) expandedKosten.delete(id); else expandedKosten.add(id); renderKosten(); }
function setNurUngeprueft(v){ nurUngeprueft=v; renderKosten(); }
/* US-04: Auswahl-Liste der Kostenarten; bereits übernommene ausgegraut, nicht umlagefähige mit ! */
function renderPicker(){
  const box = document.getElementById('kosten_auswahl'); if(!box) return;
  const vorhanden = new Set(state.kosten.map(k=>k.bez));
  const sorted = KOSTEN_KATALOG.slice().sort((a,b)=>a.localeCompare(b,'de'));
  box.innerHTML = sorted.map(name=>{
    const used = vorhanden.has(name);
    const info = nkUmlageInfo(name);
    const warn = info.umlagefaehig ? '' : ' <span class="warn" title="'+info.grund.replace(/"/g,'')+'">'+WARN_ICON+'</span>';
    return '<label class="'+(used?'used':'')+'"><input type="checkbox" value="'+esc(name)+'"'+(used?' disabled':'')+'>'+esc(name)+warn+'</label>';
  }).join('');
}
function toggleKostenDropdown(ev){ if(ev) ev.stopPropagation(); const dd=document.getElementById('kosten_dd'); dd.style.display = dd.style.display==='none' ? 'block' : 'none'; }
document.addEventListener('click', e=>{ const add=document.getElementById('kosten_add'); const dd=document.getElementById('kosten_dd'); if(dd && add && !add.contains(e.target)) dd.style.display='none'; });
function addAusgewaehlteKosten(){
  document.querySelectorAll('#kosten_auswahl input[type=checkbox]:checked').forEach(c=> store.addKosten(c.value));
  renderKosten();
  document.getElementById('kosten_dd').style.display='none';
}
function addSonstigeKosten(){
  const inp = document.getElementById('sonstige_bez');
  const bez = (inp.value||'').trim();
  if(!bez) return;
  store.addKosten(bez);
  inp.value=''; renderKosten();
}
function deleteKostenRow(idx){ store.removeKosten(idx); renderKosten(); }
/* US-03: Kostenart setzen und passenden Verteilerschlüssel vorschlagen (überschreibbar). */
function applyKostenart(idx, val){ store.setKostenart(idx,val); renderKosten(); }
function resetSchluessel(idx){ store.resetKostenSchluessel(idx); renderKosten(); }

/* ---------- Step 4 ---------- */
function computeView(){
  const tb=document.querySelector('#tbl_ergebnis tbody'); tb.innerHTML='';
  const ab=nkObjektAbrechnung(state.einheiten, state.kosten, state.objekt);
  ab.einheiten.forEach(er=>{
    er.mietverhaeltnisse.forEach(mv=>{
      const a=mv.brutto, v=mv.vorauszahlung, s=mv.saldo;
      const ustHint = mv.gewerblich ? ' <span class="pill">inkl. '+NK_UST_SATZ+'% USt</span>' : '';
      const tr=document.createElement('tr');
      tr.innerHTML='<td>'+esc(mv.mieter)+' <span class="pill">'+esc(er.name)+'</span>'+ustHint+'</td><td class="num">'+eur(a)+'</td><td class="num">'+eur(v)+
        '</td><td class="num '+(s>0?'neg':'pos')+'">'+(s>0?'Nachzahlung ':'Guthaben ')+eur(Math.abs(s))+'</td>'+
        '<td class="num" title="Empfehlung: Anteil ÷ 12 Monate">'+eur(nkVorschlagVorauszahlung(a))+'</td>';
      tb.appendChild(tr);
    });
    if(er.leerstandZeitanteil>NK_LEERSTAND_EPS){
      const tr=document.createElement('tr');
      tr.innerHTML='<td class="muted">Leerstand (Vermieter) <span class="pill">'+esc(er.name)+'</span></td><td class="num">'+eur(er.leerstandBetrag)+'</td><td class="num">–</td><td class="num neg">trägt Vermieter</td><td class="num">–</td>';
      tb.appendChild(tr);
    }
  });
  document.getElementById('sum_total').textContent=eur(ab.summeAnteil);
  document.getElementById('sum_voraus').textContent=eur(ab.summeVoraus);
  const saldo=ab.summeSaldo;
  const el=document.getElementById('sum_saldo');
  el.textContent=(saldo>=0?'+ ':'– ')+eur(Math.abs(saldo));
  el.className='val '+(saldo>0?'neg':'pos');
  renderPlausi();
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
  L.push('- Saldo = Anteil − geleistete Vorauszahlung.');
  L.push('');
  L.push('## Kostenpositionen');
  state.kosten.forEach(k=>{ L.push('- '+k.bez+': '+eur(k.betrag)+' · '+SCHLUESSEL[k.schluessel]+(nkUmlageInfo(k.bez).umlagefaehig?'':' · NICHT umlagefähig')); });
  L.push('');
  L.push('## Herleitung je Mietverhältnis');
  const ab=nkObjektAbrechnung(state.einheiten, state.kosten, state.objekt);
  ab.einheiten.forEach(er=>{
    er.mietverhaeltnisse.forEach(mv=>{
      const za=mv.zeitanteil;
      L.push('### '+mv.mieter+' – '+er.name+(mv.gewerblich?' (gewerblich)':''));
      L.push('Mietzeit '+fmtDatum(mv.von)+'–'+fmtDatum(mv.bis)+', Zeitanteil '+(za*100).toFixed(1)+' %');
      mv.zeilen.forEach(i=>{
        L.push('- '+i.bez+': '+eur(i.gesamt)+' × '+(i.faktor*100).toFixed(2)+' % = '+eur(i.anteilVoll)+' × Zeit '+(za*100).toFixed(1)+' % = '+eur(i.anteil));
      });
      if(mv.gewerblich) L.push('- Zwischensumme netto '+eur(mv.netto)+' + '+NK_UST_SATZ+' % USt '+eur(mv.ust)+' = '+eur(mv.brutto));
      else L.push('- Summe Anteil: '+eur(mv.brutto));
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

/* ---------- Step 5 ---------- */
function renderDoc(){
  const list=alleMV();
  const tabs=document.getElementById('mieter_tabs'); tabs.innerHTML='';
  if(activeMieter>=list.length) activeMieter=0;
  list.forEach((it,idx)=>{
    const b=document.createElement('div');
    b.className='mtab'+(idx===activeMieter?' active':'');
    b.textContent=it.m.mieter+' · '+it.e.name; b.onclick=()=>{activeMieter=idx;renderDoc();};
    tabs.appendChild(b);
  });
  const sel=list[activeMieter]; if(!sel){ document.getElementById('doc').innerHTML=''; return; }
  const e=sel.e, m=sel.m;
  const ab=nkMieterAbrechnung(e, m, state.kosten, state.objekt, nkTotals(state.einheiten));
  const gew=ab.gewerblich, za=ab.zeitanteil, anteil=ab.brutto, saldo=ab.saldo;
  let rows=ab.zeilen.map(i=>
    '<tr><td>'+i.bez+'</td><td class="num">'+eur(i.gesamt)+'</td><td>'+SCHLUESSEL[i.schluessel]+'</td><td class="num">'+eur(i.wert)+'</td></tr>'
  ).join('');
  const summen = gew
    ? '<tr class="total-row"><td>Zwischensumme netto</td><td></td><td></td><td class="num">'+eur(ab.netto)+'</td></tr>'+
      '<tr><td>zzgl. '+NK_UST_SATZ+' % Umsatzsteuer</td><td></td><td></td><td class="num">'+eur(ab.ust)+'</td></tr>'+
      '<tr class="total-row"><td>Ihr Anteil (brutto)</td><td></td><td></td><td class="num">'+eur(ab.brutto)+'</td></tr>'
    : '<tr class="total-row"><td>Ihr Anteil an den Gesamtkosten</td><td></td><td></td><td class="num">'+eur(ab.brutto)+'</td></tr>';
  document.getElementById('doc').innerHTML=
    '<h2>Betriebs- und Heizkostenabrechnung</h2>'+
    '<div class="meta">'+esc(state.objekt.addr)+' · Einheit '+esc(e.name)+' · Mieter: <b>'+esc(m.mieter)+'</b>'+(gew?' (gewerblich, umsatzsteuerpflichtig)':'')+'<br>Abrechnungszeitraum: '+zeitraumText()+' · Mietzeit: '+fmtDatum(m.von)+'–'+fmtDatum(m.bis)+' ('+Math.round(za*100)+' % des Zeitraums)</div>'+
    '<table><thead><tr><th>Kostenart</th><th class="num">Gesamtkosten</th><th>Verteilerschlüssel</th><th class="num">'+(gew?'Ihr Anteil (netto)':'Ihr Anteil')+'</th></tr></thead><tbody>'+
    rows+
    summen+
    '</tbody></table>'+
    '<div class="saldo-box"><span>'+(saldo>0?'Nachzahlung':'Guthaben')+' (Anteil '+eur(anteil)+' – Vorauszahlung '+eur(+m.voraus||0)+')</span>'+
    '<span class="'+(saldo>0?'neg':'pos')+'">'+eur(Math.abs(saldo))+'</span></div>'+
    '<div class="pay"><h3>Zahlungsmodalitäten</h3>'+
    (saldo>0
      ? 'Bitte überweisen Sie den Nachzahlungsbetrag innerhalb von '+state.zahlung.frist+' auf folgendes Konto:<br>'
        +'Empfänger: '+state.zahlung.empfaenger+' · IBAN: '+state.zahlung.iban+' · BIC: '+state.zahlung.bic+'<br>'
        +'Verwendungszweck: NK '+esc(e.name)+' '+zeitraumText()
      : 'Das Guthaben wird Ihnen innerhalb von '+state.zahlung.frist+' auf Ihr hinterlegtes Konto erstattet.')
    +'<br><span class="hint">Hinweis: Einwendungen können Sie innerhalb von 12 Monaten nach Zugang geltend machen.</span></div>';
}

/* ---------- Step 6: Zahlungseingänge (US-28) ---------- */
function monatLabel(key){ const p=String(key).split('-'); const n=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']; return (n[(+p[1])-1]||'?')+' '+p[0]; }
/* nkMonatNK nach calc.js verschoben (US-35). */
function renderZahlungen(){
  const box=document.getElementById('zahlungen_box'); box.innerHTML='';
  alleMV().forEach(({e,m,ei,mi})=>{
    if(!m.bezahlt) m.bezahlt={};
    const nk=nkMonatNK(m);
    const soll=nkSollMonat(m.grundmiete, nk, m.stellAnzahl, m.stellPreis);
    const monate=nkAktiveMonate(m.von, m.bis, state.objekt.von, state.objekt.bis);
    const offen=monate.filter(k=>!m.bezahlt[k]);
    const chips=monate.map(k=>{
      const paid=!!m.bezahlt[k];
      return '<label class="zahl-monat'+(paid?' paid':'')+'"><input type="checkbox" '+(paid?'checked':'')+' onchange="updZahlung('+ei+','+mi+',\''+k+'\',this.checked)"> '+monatLabel(k)+' · '+eur(soll)+'</label>';
    }).join('');
    const status = offen.length
      ? '<span style="color:var(--nachzahlung)">'+offen.length+' von '+monate.length+' Monaten offen · '+eur(offen.length*soll)+' ausstehend</span>'
      : '<span style="color:var(--accent)">alle '+monate.length+' Monate eingegangen</span>';
    box.insertAdjacentHTML('beforeend',
      '<div class="unit-card">'+
        '<div class="unit-head"><b>'+esc(m.mieter)+'</b> <span class="pill">'+esc(e.name)+'</span></div>'+
        '<div class="zahl-soll">'+
          '<label class="unit-f">Grundmiete <input class="short" type="text" inputmode="decimal" value="'+nkFmtBetrag(m.grundmiete||0)+'" onchange="updMVNum('+ei+','+mi+',\'grundmiete\',this.value)"></label>'+
          '<span class="unit-f">+ NK-Vorauszahlung '+eur(nk)+'</span>'+
          '<label class="unit-f">+ Stellplätze <input class="short" type="number" value="'+(m.stellAnzahl||0)+'" onchange="updMVNum('+ei+','+mi+',\'stellAnzahl\',this.value)"></label>'+
          '<label class="unit-f">× <input class="short" type="text" inputmode="decimal" value="'+nkFmtBetrag(m.stellPreis||0)+'" onchange="updMVNum('+ei+','+mi+',\'stellPreis\',this.value)"> €</label>'+
          '<span class="zahl-summe">Soll/Monat: <b>'+eur(soll)+'</b></span>'+
        '</div>'+
        '<div class="zahl-monate">'+(chips||'<span class="hint">keine aktiven Monate im Zeitraum</span>')+'</div>'+
        '<div class="leer-hint" style="margin-top:8px;">'+status+'</div>'+
      '</div>');
  });
}
function updZahlung(ei,mi,key,checked){ store.setBezahlt(ei,mi,key,checked); renderZahlungen(); }
function updMVNum(ei,mi,field,val){ store.setMvNum(ei,mi,field, nkParseBetrag(val)); renderZahlungen(); }

/* PDF-Export (US-18) ausgelagert nach pdf.js (US-33). */

/* ---------- Version / Header (US-30) ---------- */
/* Bei jedem Release pflegen: APP_VERSION hochzählen, BUILD_DATE auf das Deploy-Datum setzen. */
const APP_VERSION="v0.3";
const BUILD_DATE="2026-06-13";
function toggleDateiMenu(forceClose){ const m=document.getElementById('datei_menu'); if(!m) return; m.hidden = forceClose ? true : !m.hidden; }
document.addEventListener('click', e=>{ const m=document.getElementById('datei_menu'); if(m && !m.hidden && !e.target.closest('.menu')) m.hidden=true; });

/* ---------- View: Objektwahl, Render-Orchestrierung, Header ---------- */
/* STORAGE_KEY, ensureIds, snapshot, ladeDaten, makeFreshDaten, objektLabel, objSignatur,
   objektJahr, saveState, loadState, resetState, commit: in core.js (US-33b). */
function setSaveStatus(t){ const el=document.getElementById('save_status'); if(el) el.textContent=t; }
/* US-38: Persistenz-Rückmeldung aus core.js in die Statusanzeige übersetzen. */
onPersist(function(ok){ setSaveStatus(ok ? '✓ gespeichert' : '⚠ nicht gespeichert'); });
function renderObjektSelect(){ const sel=document.getElementById('obj_select'); if(!sel) return;
  sel.innerHTML=objekte.map((d,i)=>'<option value="'+i+'"'+(i===aktivIdx?' selected':'')+'>'+esc(objektLabel(d,i))+'</option>').join(''); }
function renderAll(){ renderObjektSelect(); renderVorjahrBanner(); fillObjektKopf();
  const a=document.getElementById('abr_status'); if(a) a.value=state.abrechnungStatus;
  renderEinheiten(); renderVoraus(); renderKosten();
  if(current===3) computeView(); else if(current===4) renderDoc(); else if(current===5) renderZahlungen();
  renderStepper(); }
function switchObjekt(idx){ saveState(); aktivIdx=Math.max(0,Math.min(+idx,objekte.length-1)); ladeDaten(objekte[aktivIdx]); ensureIds(); renderAll(); saveState(); }
function neuesObjekt(){ saveState(); objekte.push(makeFreshDaten()); aktivIdx=objekte.length-1; ladeDaten(objekte[aktivIdx]); ensureIds(); current=0; renderAll(); go(0); saveState(); }
function exportObjekt(){ const d=snapshot(); const name=objektLabel(d,aktivIdx).replace(/[^\wäöüÄÖÜß.\- ]/g,'_').trim()||'Objekt'; const jahr=objektJahr(d);
  const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='NeKoFix-'+name+(jahr?'-'+jahr:'')+'.json'; /* AC4: Jahr im Dateinamen */
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href); }
/* US-11: Folgejahr aus dem aktiven Objekt anlegen */
function neuesJahrAusVorjahr(){
  const jahrAlt=objektJahr(snapshot()); const jahrNeu=jahrAlt?(+jahrAlt+1):'';
  if(!confirm('Neues Abrechnungsjahr'+(jahrNeu?' '+jahrNeu:'')+' aus „'+objektLabel(snapshot(),aktivIdx)+'" anlegen?\n\nStammdaten, Kostenarten und Verteilerschlüssel werden übernommen. Die Kostenbeträge bleiben leer und sind zu prüfen; ausgezogene Mieter werden nicht übernommen, aktive auf das ganze Jahr gesetzt.')) return;
  saveState();
  const neu=nkVorjahrUebernehmen(snapshot());
  if(objekte.some(d=>objSignatur(d)===objSignatur(neu)) && !confirm('Für diese Adresse und diesen Zeitraum gibt es bereits ein Objekt. Trotzdem ein weiteres anlegen?')) return;
  objekte.push(neu); aktivIdx=objekte.length-1; ladeDaten(objekte[aktivIdx]); ensureIds(); current=0; renderAll(); go(0); saveState();
}
function renderVorjahrBanner(){
  const box=document.getElementById('vorjahr_banner'); if(!box) return;
  if(!state.vorjahr){ box.innerHTML=''; return; }
  box.innerHTML='<div class="vorjahr-banner"><span class="vb-text"><b>Aus Vorjahr übernommen.</b> Bitte Kostenbeträge erfassen und Mietzeiten prüfen. Übernommene Felder sind markiert.</span><button onclick="confirmVorjahr()">Übernahme bestätigen</button></div>';
}
function confirmVorjahr(){
  state.vorjahr=false;
  (state.kosten||[]).forEach(k=>{ k.vorjahr=false; });
  (state.einheiten||[]).forEach(e=>{ e.vorjahr=false; (e.mv||[]).forEach(m=>{ m.vorjahr=false; }); });
  renderAll(); saveState();
}
function importObjekt(ev){ const f=ev.target.files&&ev.target.files[0]; if(!f){ return; }
  const r=new FileReader();
  r.onload=function(){ try{ const d=JSON.parse(r.result);
      if(!d || !Array.isArray(d.einheiten)){ alert('Datei ist kein gültiges Objekt (es fehlen Einheiten).'); return; }
      const sig=JSON.stringify(d);
      if(objekte.some(x=>JSON.stringify(x)===sig) && !confirm('Dieses Objekt ist bereits vorhanden (identische Daten). Trotzdem importieren?')) return;
      saveState(); objekte.push(d); aktivIdx=objekte.length-1; ladeDaten(d); ensureIds(); current=0; renderAll(); go(0); saveState();
    }catch(e){ alert('Datei konnte nicht gelesen werden.'); } finally{ ev.target.value=''; } };
  r.readAsText(f); }
function setAbrStatus(v){ store.setAbrechnungStatus(v); }
/* saveState, loadState, resetState, commit/scheduleSave: in core.js (US-33b). */
document.addEventListener('input', commit);  /* Sicherheitsnetz für nicht über den Store laufende Eingaben */
document.addEventListener('change', commit);
window.addEventListener('beforeunload', saveState);

/* ---------- Init ---------- */
loadState();
if(!objekte.length){ objekte=[snapshot()]; aktivIdx=0; } /* Erststart: Demodaten als erstes Objekt */
ensureIds();
renderObjektSelect();
(function(){ const v=document.getElementById('app_version'); if(v) v.textContent=APP_VERSION+' · Build '+BUILD_DATE; })();
(function(){ if(new URLSearchParams(location.search).has('debug')){ const b=document.getElementById('btn_testdaten'); if(b) b.hidden=false; } })();
(function(){ const a=document.getElementById('abr_status'); if(a) a.value=state.abrechnungStatus; })();
fillObjektKopf();
renderEinheiten(); renderVoraus(); renderKosten(); renderStepper(); go(0);
saveState();
