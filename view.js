/* view.js – Render-/View-Schicht und Init (US-33c).
   Geladen NACH calc.js und core.js, VOR pdf.js. Enthält UI-Konstanten, Render-
   Funktionen, Event-Handler und den Init-Block. Nutzt state/store/Persistenz aus core.js. */

/* State, Store, Persistenz: ausgelagert nach core.js (US-33b). `state`, `objekte`,
   `aktivIdx`, `store`, `commit`, `saveState/loadState` u. a. sind dort global definiert. */
const STEPS = ["Objekt","Vorauszahlung","Kosten","Heizung","Berechnung","Abrechnung","Zahlungen"];
let current = 0, activeMieter = 0;
let vorausModus = "monatlich";

const eur = n => n.toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const SCHLUESSEL = { flaeche:"nach Wohnfläche (m²)", person:"nach Personen", einheit:"nach Wohneinheit", verbrauch:"nach Verbrauch", direkt:"Direkt (eine Einheit)" };
/* US-22/US-50: Kurz-Restriktion und Schlüssel-Anzeige je Kostenposition. */
function restriktionText(k){
  if(k.schluessel==='direkt'){ const e=state.einheiten.find(x=>x.id===k.direktEinheit); return 'Direkt: '+(e?e.name:'—'); }
  const an=nkAusschlussNamen(k, state.einheiten); return an.length? 'ohne '+an.join(', ') : '';
}
function schluesselAnzeige(k){
  if(k.schluessel==='direkt') return restriktionText(k);
  const r=restriktionText(k); return SCHLUESSEL[k.schluessel]+(r?' ('+r+')':'');
}
function setSchluessel(idx,val){
  const k=store.kosten(idx); store.setKostenFeld(idx,'schluessel',val);
  if(val==='direkt' && !k.direktEinheit && state.einheiten[0]) store.setKostenFeld(idx,'direktEinheit',state.einheiten[0].id);
  if(val==='verbrauch') expandedKosten.add(k.id); /* US-57: Verbrauch-Eingabe gleich sichtbar */
  renderKosten();
}
/* US-57: Summe der erfassten Verbräuche (teilnehmende Einheiten) – für Anzeige. */
function verbrauchSumme(k){ return nkVerbrauchSumme(k, state.einheiten); }
function updKostenVerbrauch(idx,einheitId,val){ store.setKostenVerbrauch(idx,einheitId, nkParseBetrag(val)); renderKosten(); }
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
/* US-53: „das Jahr 2025" bei vollem Kalenderjahr, sonst „den Zeitraum …". */
function zeitraumSatz(){
  const v=String(state.objekt.von||''), b=String(state.objekt.bis||'');
  const mv=v.match(/^(\d{4})-01-01$/), mb=b.match(/^(\d{4})-12-31$/);
  if(mv && mb && mv[1]===mb[1]) return mv[1];
  return 'den Zeitraum '+fmtDatum(v)+' – '+fmtDatum(b);
}
function alleMV(){ const out=[]; state.einheiten.forEach((e,ei)=>{ (e.mv||[]).forEach((m,mi)=>{ out.push({e,m,ei,mi,za:nkZeitanteil(m.von,m.bis,state.objekt.von,state.objekt.bis)}); }); }); return out; }
function leerstandZa(e){ const s=(e.mv||[]).reduce((a,m)=>a+nkZeitanteil(m.von,m.bis,state.objekt.von,state.objekt.bis),0); return Math.max(0,1-s); }

/* ---------- Stepper (US-54: seitliche Lasche, Gruppen, Kürzel, Versand-Ampel) ---------- */
const STEP_ABBR = ["OB","VZ","KO","HE","BE","AB","ZA"];
const STEP_GROUPS = [
  { titel:"Abrechnung erstellen", steps:[0,1,2,3,4,5] },
  { titel:"Nachverfolgung",        steps:[6] }
];
function renderStepper(){
  const el = document.getElementById('stepper'); if(!el) return; el.innerHTML='';
  STEP_GROUPS.forEach(g=>{
    const gt=document.createElement('div'); gt.className='nav-group'; gt.textContent=g.titel; el.appendChild(gt);
    g.steps.forEach(i=>{
      const d=document.createElement('div');
      d.className='step'+(i===current?' active':'')+(i<current?' done':'');
      d.title=STEPS[i];
      d.innerHTML='<span class="n">'+(i+1)+'</span><span class="lbl">'+STEPS[i]+'</span><span class="abbr">'+STEP_ABBR[i]+'</span>';
      d.onclick=()=>go(i);
      el.appendChild(d);
    });
  });
  renderNavPlausi();
}
const NAV_KEY="nekofix-nav-collapsed";
function updateNavToggleGlyph(){ const s=document.getElementById('sidenav'); const b=s&&s.querySelector('.nav-toggle'); if(b) b.textContent = s.classList.contains('collapsed')?'»':'«'; }
function toggleNav(){ const s=document.getElementById('sidenav'); if(!s) return; s.classList.toggle('collapsed'); try{ localStorage.setItem(NAV_KEY, s.classList.contains('collapsed')?'1':'0'); }catch(e){} updateNavToggleGlyph(); }
function initNav(){ const s=document.getElementById('sidenav'); if(!s) return; let c='0'; try{ c=localStorage.getItem(NAV_KEY)||'0'; }catch(e){} if(c==='1') s.classList.add('collapsed'); updateNavToggleGlyph(); }
/* US-54: dauerhaft sichtbare Versand-/Plausi-Ampel; bereit = keine blockierenden Fehler. */
let navPlausiOpen=false;
function renderNavPlausi(){
  const box=document.getElementById('nav_plausi'); if(!box) return;
  const r=nkPlausibilitaet(state);
  const fehler=r.punkte.filter(p=>p.level==='fehler').length;
  const warn=r.punkte.filter(p=>p.level==='warn').length;
  const kurz=r.bereit ? '✓ Versandfertig' : (fehler+' offene'+(fehler===1?'r Punkt':' Punkte'));
  const symMap={ok:'✓',warn:'!',fehler:'✗'};
  let html='<button class="nav-plausi-head '+(r.bereit?'ok':'bad')+'" onclick="toggleNavPlausi()" title="Plausibilitätsprüfung – klicken für Details">'+
    '<span class="dot"></span><span class="np-label">'+kurz+'</span><span class="np-caret">'+(navPlausiOpen?'▴':'▾')+'</span></button>';
  if(navPlausiOpen){
    html+='<div class="nav-plausi-list">'+r.punkte.map(p=>'<div class="plausi-item '+p.level+'">'+symMap[p.level]+' '+p.text+'</div>').join('')+'</div>';
  } else if(warn>0){
    html+='<div class="nav-plausi-sub">'+warn+' Hinweis'+(warn===1?'':'e')+'</div>';
  }
  box.innerHTML=html;
}
function toggleNavPlausi(){
  const s=document.getElementById('sidenav');
  if(s && s.classList.contains('collapsed')){ s.classList.remove('collapsed'); try{ localStorage.setItem(NAV_KEY,'0'); }catch(e){} }
  navPlausiOpen=!navPlausiOpen; renderNavPlausi();
}
function go(i){
  if(i===0) renderEinheiten();   /* US-49: Ziel-Reiter beim Wechsel aus aktuellem Zustand neu zeichnen */
  if(i===1) renderVoraus();
  if(i===2) renderKosten();
  if(i===3) renderHeizung();     /* US-05 */
  if(i===4) computeView();
  if(i===5) renderDoc();
  if(i===6) renderZahlungen();
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
  /* US-51: Vermieter & Zahlungsangaben */
  const z = state.zahlung || {};
  const set = (id,v)=>{ const el=document.getElementById(id); if(el) el.value = v||''; };
  set('z_empfaenger', z.empfaenger); set('z_anschrift', z.anschrift);
  set('z_iban', z.iban); set('z_bic', z.bic); set('z_frist', z.frist);
  updateIbanHint();
}
function updateIbanHint(){
  const el=document.getElementById('z_iban_hint'); if(!el) return;
  const iban=(state.zahlung&&state.zahlung.iban)||'';
  if(!iban.trim()){ el.textContent=''; el.className='iban-hint'; return; }
  if(nkIbanGueltig(iban)){ el.textContent='✓ IBAN gültig'; el.className='iban-hint ok'; }
  else { el.textContent='⚠ IBAN ungültig (Prüfziffer/Länge)'; el.className='iban-hint bad'; }
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
        '<td title="gewerblich / umsatzsteuerpflichtig"><label class="gewerbl"><input type="checkbox" '+(m.gewerblich?'checked':'')+' onchange="updMV('+ei+','+mi+',\'gewerblich\',this.checked)"> ja</label></td>'+
        '<td><button class="status-toggle" onclick="toggleVertrag('+m.id+')">'+(open?'weniger ▴':'mehr ▾')+'</button></td>'+
        '<td><button class="row-del" title="Mietverhältnis entfernen" onclick="delMV('+ei+','+mi+')">×</button></td>'+
        '</tr>';
      if(open){
        const vg=(m.vertragGrundmiete!==undefined?m.vertragGrundmiete:(m.grundmiete||0));
        const vnk=(m.vertragNK!==undefined?m.vertragNK:(m.vmonat||0));
        const chronik=m.chronik||[];
        const chronikRows=chronik.map((c,ci)=>'<div class="chronik-row"><input type="date" value="'+(c.datum||'')+'" onchange="updChronik('+ei+','+mi+','+ci+',\'datum\',this.value)" onblur="renderEinheiten()"><textarea class="chronik-notiz" rows="1" oninput="updChronik('+ei+','+mi+','+ci+',\'text\',this.value); autoGrow(this)" placeholder="Was wurde angepasst?">'+esc(c.text)+'</textarea><button class="row-del" onclick="delChronik('+ei+','+mi+','+ci+')">×</button></div>').join('');
        const bald=nkBaldFaellig(na, heute(), 3);
        row+='<tr class="detail-row"><td colspan="6">'+
          '<div class="detail-grid">'+
            '<label>Urspr. Grundmiete <input class="short" type="text" inputmode="decimal" value="'+nkFmtBetrag(vg)+'" oninput="updVertrag('+ei+','+mi+',\'vertragGrundmiete\',this.value,1)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))"></label>'+
            '<label>Urspr. NK/Monat <input class="short" type="text" inputmode="decimal" value="'+nkFmtBetrag(vnk)+'" oninput="updVertrag('+ei+','+mi+',\'vertragNK\',this.value,1)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))"></label>'+
            '<label>Letzte Anpassung <input type="date" value="'+(m.letzteAnpassung||'')+'" onchange="updVertrag('+ei+','+mi+',\'letzteAnpassung\',this.value)" onblur="renderEinheiten()"></label>'+
            '<label>Nächste Anpassung <input type="date" value="'+na+'" onchange="updVertrag('+ei+','+mi+',\'naechsteAnpassung\',this.value)" onblur="renderEinheiten()"></label>'+
            '<label>Anrede <select onchange="updVertrag('+ei+','+mi+',\'anrede\',this.value)"><option value="">neutral</option><option value="herr"'+(m.anrede==="herr"?" selected":"")+'>Herr</option><option value="frau"'+(m.anrede==="frau"?" selected":"")+'>Frau</option></select></label>'+
            '<label class="notiz-field">E-Mail <input type="email" value="'+esc(m.email)+'" oninput="store.setMvFeld('+ei+','+mi+',\'email\',this.value)" placeholder="mieter@example.de"></label>'+
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
      '<div class="unit-card einheit-card">'+
        '<div class="unit-head">'+
          '<input class="unit-name" value="'+esc(e.name)+'" oninput="updEinheit('+ei+',\'name\',this.value)">'+
          '<label class="unit-f">Fläche m² <input class="short" type="number" value="'+e.flaeche+'" oninput="updEinheit('+ei+',\'flaeche\',this.value)"></label>'+
          '<label class="unit-f">Personen <input class="short" type="number" value="'+e.personen+'" oninput="updEinheit('+ei+',\'personen\',this.value)"></label>'+
          '<button class="row-del" title="Einheit entfernen" onclick="delEinheit('+ei+')" style="margin-left:auto;">×</button>'+
        '</div>'+
        '<table class="mv-table"><thead><tr><th>Mieter</th><th>von</th><th>bis</th><th>gewerbl.</th><th>Vertrag</th><th></th></tr></thead><tbody>'+mvRows+'</tbody></table>'+
        '<button class="addrow" onclick="addMV('+ei+')">+ Mietverhältnis</button>'+
        leerHint+
        (nkUeberlappungTageEinheit(e)>0 ? '<div class="leer-hint" style="color:var(--nachzahlung);">'+WARN_ICON+' Überschneidende Mietzeiträume: '+nkUeberlappungTageEinheit(e)+' Tag(e) doppelt belegt – bitte Zeiträume prüfen.</div>' : '')+
      '</div>');
  });
  /* US-66: Chronik-Textfelder initial an ihren Inhalt anpassen. */
  document.querySelectorAll('#einheiten_box .chronik-notiz').forEach(autoGrow);
}
/* US-66: Textarea-Höhe an den Inhalt anpassen (auto-grow). */
function autoGrow(el){ if(!el) return; el.style.height='auto'; el.style.height=(el.scrollHeight)+'px'; }
document.getElementById('obj_addr').addEventListener('input',e=>{store.setObjektFeld('addr',e.target.value); renderObjektSelect();});
/* Datum nur in den Zustand schreiben; Neu-Zeichnen erst beim Verlassen (sonst wirft type=date beim Tippen der Jahreszahl raus). */
document.getElementById('obj_von').addEventListener('change',e=>{store.setObjektFeld('von',e.target.value); renderObjektSelect();});
document.getElementById('obj_bis').addEventListener('change',e=>{store.setObjektFeld('bis',e.target.value); renderObjektSelect();});
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
  /* US-58: eine Kostenzeile (+ Detail) anhängen. */
  function appendKostenRow(k, idx){
    const st=k.status||'vorlaeufig', vf=k.verfuegbar||'vorhanden';
    if(k.vorsteuer===undefined) k.vorsteuer=nkVorschlagVorsteuer(k.bez);
    let opts='';
    for(const key in SCHLUESSEL){ opts+='<option value="'+key+'"'+(k.schluessel===key?' selected':'')+'>'+SCHLUESSEL[key]+'</option>'; }
    const info = nkUmlageInfo(k.bez);
    const warn = info.umlagefaehig ? '' : ' <span class="warn" title="'+info.grund.replace(/"/g,'')+'">'+WARN_ICON+'</span>';
    const dots='<span class="dot" style="background:'+STATUS_FARBE[st]+'" title="Status: '+STATUS_BELEG[st]+'"></span>'+
               '<span class="dot" style="background:'+VERFUEGBAR_FARBE[vf]+'" title="Verfügbarkeit: '+VERFUEGBAR[vf]+'"></span>';
    const open=expandedKosten.has(k.id);
    const ausNamen=nkAusschlussNamen(k, state.einheiten);
    const tr=document.createElement('tr'); tr.id='krow-'+idx; if(k.vorjahr) tr.className='vorjahr';
    tr.innerHTML=
      '<td class="bez-col"><span class="bez-cell"><input value="'+esc(k.bez)+'" oninput="store.setKostenFeld('+idx+',\'bez\',this.value)" onchange="applyKostenart('+idx+',this.value)">'+warn+(k.vorjahr?' <span class="vorjahr-badge">aus Vorjahr</span>':'')+'</span></td>'+
      '<td class="num"><input class="short" type="text" inputmode="decimal" value="'+nkFmtBetrag(k.betrag)+'" oninput="updKostenBetrag('+idx+',this.value)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))"></td>'+
      '<td><span class="schluessel-cell"><select title="Vorschlag – überschreibbar. Üblich: Fläche (z. B. Grundsteuer, Versicherung, Heizung), Personen (z. B. Wasser/Abwasser), Wohneinheit (z. B. Müll, Aufzug). „Direkt" ordnet die Position einer einzelnen Einheit zu 100 % zu." onchange="setSchluessel('+idx+',this.value)">'+opts+'</select><button class="reset-btn" title="Verteilerschlüssel auf Vorschlag zurücksetzen" onclick="resetSchluessel('+idx+')">↺</button>'+
        (k.schluessel==='direkt'
          ? '<select class="direkt-select" title="Diese Kosten trägt eine Einheit zu 100 %" onchange="store.setKostenFeld('+idx+',\'direktEinheit\',+this.value)">'+state.einheiten.map(x=>'<option value="'+x.id+'"'+(k.direktEinheit===x.id?' selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select>'
          : '<button class="teilnahme-chip'+(ausNamen.length?' aktiv':'')+'" title="Teilnehmende Einheiten festlegen" onclick="toggleKostenDetail('+k.id+')">'+(ausNamen.length?'ohne '+ausNamen.map(esc).join(', '):'alle')+'</button>')+
        '</span></td>'+
      '<td><button class="status-toggle" onclick="toggleKostenDetail('+k.id+')" title="Status & Notiz">'+dots+'<span class="chev">'+(open?'▴':'▾')+'</span></button></td>'+
      '<td><button class="row-del" title="Position entfernen" onclick="deleteKostenRow('+idx+')">×</button></td>';
    tb.appendChild(tr);
    if(open){
      let so=''; for(const key in STATUS_BELEG){ so+='<option value="'+key+'"'+(st===key?' selected':'')+'>'+STATUS_BELEG[key]+'</option>'; }
      let vo=''; for(const key in VERFUEGBAR){ vo+='<option value="'+key+'"'+(vf===key?' selected':'')+'>'+VERFUEGBAR[key]+'</option>'; }
      let vsOpts=''; [0,7,19].forEach(s=>{ vsOpts+='<option value="'+s+'"'+((+k.vorsteuer||0)===s?' selected':'')+'>'+s+' %</option>'; });
      const ro=NK_RUBRIKEN.map(r=>'<option value="'+r+'"'+(nkRubrik(k)===r?' selected':'')+'>'+r+'</option>').join('');
      const d=document.createElement('tr'); d.className='detail-row';
      d.innerHTML='<td colspan="5"><div class="detail-grid">'+
        '<label>Rubrik <select onchange="updKosten('+idx+',\'rubrik\',this.value)">'+ro+'</select></label>'+
        '<label>Status <select onchange="updKosten('+idx+',\'status\',this.value)">'+so+'</select></label>'+
        '<label>Verfügbarkeit <select onchange="updKosten('+idx+',\'verfuegbar\',this.value)">'+vo+'</select></label>'+
        '<label title="Im Beleg enthaltene Vorsteuer">Vorsteuer <select onchange="updKosten('+idx+',\'vorsteuer\',+this.value)">'+vsOpts+'</select></label>'+
        /* US-32: §35a-Kategorie + begünstigter Arbeitskosten-Anteil */
        '<label title="Steuerlich begünstigt nach §35a EStG (haushaltsnahe Dienstleistung oder Handwerkerleistung)">§35a <select onchange="updKosten('+idx+',\'p35a\',this.value)">'+
          '<option value="keine"'+(nkP35aKategorie(k)===''?' selected':'')+'>keine</option>'+
          '<option value="dienstleistung"'+(nkP35aKategorie(k)==='dienstleistung'?' selected':'')+'>haushaltsnahe DL</option>'+
          '<option value="handwerker"'+(nkP35aKategorie(k)==='handwerker'?' selected':'')+'>Handwerker</option>'+
        '</select></label>'+
        '<label title="Begünstigter Arbeits-/Lohnanteil inkl. USt (ohne Material)">davon Arbeitskosten € <input class="short" type="text" inputmode="decimal" value="'+nkFmtBetrag(k.arbeitskosten||0)+'" onchange="updKostenArbeit('+idx+',this.value)" onblur="this.value=nkFmtBetrag(nkParseBetrag(this.value))"></label>'+
        '<label class="notiz-field">Notiz <input value="'+esc(k.notiz)+'" oninput="store.setKostenFeld('+idx+',\'notiz\',this.value)" placeholder="z. B. Zähler defekt"></label>'+
      '</div>'+
      (k.schluessel==='direkt' ? '' :
       '<div class="teilnahme"><span class="teilnahme-lbl">Teilnehmende Einheiten:</span> '+
        state.einheiten.map(x=>'<label class="teilnahme-item"><input type="checkbox" '+(nkTeilnahme(x,k)?'checked':'')+' onchange="toggleTeilnahme('+idx+','+x.id+',this.checked)"> '+esc(x.name)+'</label>').join('')+
       '</div>')+
      (k.schluessel==='verbrauch' ?  /* US-57/US-59: Verbrauch je Einheit + Einheit-Label (kWh/m³) */
       '<div class="teilnahme"><span class="teilnahme-lbl">Verbrauch je Einheit:</span> '+
        '<label class="teilnahme-item">Einheit <input class="short" type="text" value="'+esc(k.einheit||'')+'" placeholder="z. B. m³" onchange="updKosten('+idx+',\'einheit\',this.value)" style="max-width:64px"></label> '+
        state.einheiten.filter(x=>nkTeilnahme(x,k)).map(x=>'<label class="teilnahme-item">'+esc(x.name)+' <input class="short" type="number" step="any" value="'+((k.verbrauch&&k.verbrauch[x.id])||0)+'" onchange="updKostenVerbrauch('+idx+','+x.id+',this.value)"></label>').join('')+
        ' <span class="unit-f">Summe: '+nkFmtBetrag(verbrauchSumme(k))+' '+esc(k.einheit||'')+'</span></div>'
       : '')+
      '</td>';
      tb.appendChild(d);
    }
  }
  /* US-59: Heizblöcke ausgegraut (Pflege im Heizung-Reiter) statt komplett ausblenden. */
  function appendHeizHinweisRow(k){
    const tr=document.createElement('tr'); tr.className='heiz-ro'; tr.title='Heizkosten werden im Reiter „Heizung" gepflegt';
    tr.innerHTML='<td class="bez-col">'+esc(k.bez)+' <span class="pill">s. Heizung</span></td>'+
      '<td class="num">'+eur(k.betrag||0)+'</td><td>'+schluesselAnzeige(k)+'</td><td></td><td></td>';
    tb.appendChild(tr);
  }
  /* US-58: Positionen nach Rubrik (feste Reihenfolge) gruppieren, je Gruppe Zwischensumme. */
  const items=state.kosten.map((k,idx)=>({k,idx})).filter(o=>!(nurUngeprueft && (o.k.status||'vorlaeufig')==='geprueft'));
  NK_RUBRIKEN.forEach(rub=>{
    const grp=items.filter(o=>nkRubrik(o.k)===rub);
    if(!grp.length) return;
    const hr=document.createElement('tr'); hr.className='rubrik-head'; hr.innerHTML='<td colspan="5">'+esc(rub)+'</td>'; tb.appendChild(hr);
    grp.forEach(o=>{ if(o.k.typ==='heizung') appendHeizHinweisRow(o.k); else appendKostenRow(o.k,o.idx); });
    const sum=grp.reduce((s,o)=>s+(+o.k.betrag||0),0);
    const sr=document.createElement('tr'); sr.className='rubrik-sum'; sr.innerHTML='<td>Zwischensumme '+esc(rub)+'</td><td class="num">'+eur(sum)+'</td><td colspan="3"></td>'; tb.appendChild(sr);
  });
  const uc=document.getElementById('ungeprueft_count'); if(uc){ const n=nkUngeprueftAnzahl(state.kosten); uc.textContent = n? ' — '+n+' offen' : ' — alle geprüft'; }
  renderPicker();
}
function updKosten(idx,field,val){ store.setKostenFeld(idx,field,val); renderKosten(); }
/* US-32: begünstigten Arbeitskosten-Anteil (€) je Position setzen. */
function updKostenArbeit(idx,val){ store.setKostenFeld(idx,'arbeitskosten', nkParseBetrag(val)); renderKosten(); }
/* US-50: Teilnahme einer Einheit an einer Kostenart umschalten (ausgeschlossen = Liste von IDs). */
function toggleTeilnahme(idx, einheitId, checked){
  const k=store.kosten(idx); let aus=((k.ausgeschlossen)||[]).slice();
  if(checked) aus=aus.filter(id=>id!==einheitId);
  else if(aus.indexOf(einheitId)<0) aus.push(einheitId);
  store.setKostenFeld(idx,'ausgeschlossen',aus);
}
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

/* ---------- Step 4: Heizung (US-05) ---------- */
function heizListe(){ const out=[]; state.kosten.forEach((k,idx)=>{ if(k.typ==='heizung') out.push({k,idx}); }); return out; }
function renderHeizung(){
  const box=document.getElementById('heizung_box'); if(!box) return;
  const liste=heizListe();
  box.innerHTML = liste.length
    ? liste.map(({k,idx})=>heizKarte(k,idx)).join('')
    : '<p class="hint">Noch keine Heizkosten erfasst. Lege einen Heizblock an: Energieart wählen, Verbrauch (in kWh oder Menge) und Preis eintragen – die Heizkostensumme wird daraus errechnet und wie eine Kostenposition verteilt.</p>';
  renderCo2Settings();
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
  const eaOpts=NK_ENERGIEARTEN.map(e=>'<option value="'+e.key+'"'+(k.energieart===e.key?' selected':'')+'>'+esc(e.label)+'</option>').join('');
  const schlOpts=['flaeche','person','einheit','verbrauch'].map(s=>'<option value="'+s+'"'+(k.schluessel===s?' selected':'')+'>'+SCHLUESSEL[s]+'</option>').join('');
  const faktorFeld = fi.show
    ? '<label title="'+fi.tip.replace(/"/g,'&quot;')+'">'+fi.label+' <input class="short" type="number" step="any" value="'+(k.heizwert||0)+'" onchange="updHeiz('+idx+',\'heizwert\',this.value)"></label>'+
      '<span class="unit-f">= '+nkFmtBetrag(kwh)+' '+fi.kwhLabel+'</span>'
    : '';
  return '<div class="unit-card">'+
    '<div class="unit-head">'+
      '<input class="unit-name" value="'+esc(k.bez)+'" oninput="store.setKostenFeld('+idx+',\'bez\',this.value)">'+
      '<label class="unit-f">Energieart <select onchange="setEnergieart('+idx+',this.value)">'+eaOpts+'</select></label>'+
      '<button class="row-del" title="Heizblock entfernen" onclick="delHeizblock('+idx+')" style="margin-left:auto;">×</button>'+
    '</div>'+
    '<div class="detail-grid">'+
      '<label>'+fi.verbrauch+' <input class="short" type="number" step="any" value="'+(k.menge||0)+'" onchange="updHeiz('+idx+',\'menge\',this.value)"></label>'+
      faktorFeld+
      '<label>'+fi.preis+' <input class="short" type="number" step="any" value="'+(k.preis||0)+'" onchange="updHeiz('+idx+',\'preis\',this.value)"></label>'+
      '<label>Verteilerschlüssel <select onchange="setHeizSchluessel('+idx+',this.value)">'+schlOpts+'</select></label>'+
      '<span class="zahl-summe">Heizkosten: <b>'+eur(k.betrag||0)+'</b></span>'+
    '</div>'+
    (k.schluessel==='verbrauch' ?  /* US-57/US-58: Verbrauch je Einheit auch im Heizung-Reiter */
     '<div class="teilnahme"><span class="teilnahme-lbl">Verbrauch je Einheit:</span> '+
      state.einheiten.filter(x=>nkTeilnahme(x,k)).map(x=>'<label class="teilnahme-item">'+esc(x.name)+' <input class="short" type="number" step="any" value="'+((k.verbrauch&&k.verbrauch[x.id])||0)+'" onchange="updHeizVerbrauch('+idx+','+x.id+',this.value)"></label>').join('')+
      ' <span class="unit-f">Summe: '+nkFmtBetrag(verbrauchSumme(k))+'</span></div>'
     : '')+
    '<div class="detail-grid" title="US-06: Zeitraum, in dem dieser Heiztyp aktiv war. Leer = ganzer Abrechnungszeitraum. Bei Mieterwechsel wird der Block über diese Periode auf die anwesenden Mieter verteilt.">'+
      '<label>aktiv von <input type="date" value="'+(k.von||'')+'" onchange="store.setKostenFeld('+idx+',\'von\',this.value)"></label>'+
      '<label>aktiv bis <input type="date" value="'+(k.bis||'')+'" onchange="store.setKostenFeld('+idx+',\'bis\',this.value)"></label>'+
      '<span class="unit-f">leer = ganzer Abrechnungszeitraum</span>'+
    '</div>'+
    (ea.fossil
      ? '<div class="detail-grid" title="US-07 (CO2KostAufG): Werte von der Brennstoffrechnung übernehmen – seit 2023 Pflichtangabe des Lieferanten.">'+
          '<label>CO2-Emissionen (kg) <input class="short" type="number" step="any" value="'+(k.co2Kg||0)+'" onchange="updHeizNum('+idx+',\'co2Kg\',this.value)"></label>'+
          '<label>CO2-Kosten (€) <input class="short" type="number" step="any" value="'+(k.co2Kosten||0)+'" onchange="updHeizNum('+idx+',\'co2Kosten\',this.value)"></label>'+
          '<span class="unit-f">von der Brennstoffrechnung – Vermieteranteil wird automatisch ermittelt</span>'+
        '</div>'
      : '')+
  '</div>';
}
function addHeizblock(){
  const ea=NK_ENERGIEARTEN[0];
  store.addKostenPos({ typ:'heizung', bez:'Heizung ('+ea.label+')', energieart:ea.key, einheit:ea.einheit, heizwert:ea.hi, menge:0, preis:0, betrag:0, schluessel:'flaeche' });
  renderHeizung();
}
function setEnergieart(idx, key){
  const ea=nkEnergieart(key); const k=store.kosten(idx);
  store.setKostenFeld(idx,'energieart',key);
  store.setKostenFeld(idx,'einheit',ea.einheit);
  store.setKostenFeld(idx,'heizwert',ea.hi);
  if(!k.bez || /^Heizung \(/.test(k.bez)) store.setKostenFeld(idx,'bez','Heizung ('+ea.label+')');
  store.setKostenFeld(idx,'betrag', nkHeizkosten(k.menge, k.preis));
  renderHeizung();
}
function updHeiz(idx, field, val){
  store.setKostenFeld(idx, field, nkParseBetrag(val));
  const k=store.kosten(idx);
  store.setKostenFeld(idx,'betrag', nkHeizkosten(k.menge, k.preis));
  renderHeizung();
}
/* US-07: CO2-Felder (kg / €) numerisch setzen, ohne die Heizkostensumme neu zu rechnen. */
function updHeizNum(idx, field, val){ store.setKostenFeld(idx, field, nkParseBetrag(val)); renderHeizung(); }
/* US-58: Verteilerschlüssel und Verbrauch je Einheit auch im Heizung-Reiter setzen. */
function setHeizSchluessel(idx, val){ store.setKostenFeld(idx,'schluessel',val); renderHeizung(); }
function updHeizVerbrauch(idx, einheitId, val){ store.setKostenVerbrauch(idx, einheitId, nkParseBetrag(val)); renderHeizung(); }
function delHeizblock(idx){ store.removeKosten(idx); renderHeizung(); }

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

/* ---------- Step 5 ---------- */
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
  // US-07/AC9: kurz erläutern, welcher CO2-Fall greift.
  const ci=document.getElementById('co2_info');
  if(ci){ const t=co2GebaeudeText(); if(t){ ci.textContent='CO2-Kostenaufteilung (CO2KostAufG): '+t; ci.hidden=false; } else { ci.hidden=true; ci.textContent=''; } }
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
  const sel=list[activeMieter]; if(!sel){ document.getElementById('doc').innerHTML=''; const vb0=document.getElementById('versand_box'); if(vb0) vb0.innerHTML=''; return; }
  const e=sel.e, m=sel.m;
  const ab=nkMieterAbrechnung(e, m, state.kosten, state.objekt, state.einheiten);
  const gew=ab.gewerblich, za=ab.zeitanteil, anteil=ab.brutto, saldo=ab.saldo;
  /* US-59: Spaltenformat (Rechenweg) + US-58 Rubrik-Gruppierung mit Zwischensummen. */
  const fmtEinh=n=>(Number(n)||0).toLocaleString('de-DE',{maximumFractionDigits:2});
  const fmtPreis=n=>(Number(n)||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:4});
  const COLS=6, leer=c=>'<td colspan="'+c+'"></td>';
  let rows='';
  NK_RUBRIKEN.forEach(rub=>{
    const grp=ab.zeilen.map((i,ix)=>({i,ix}))
      .filter(o=>Math.round(o.i.anteil*100)!==0 && nkRubrik(state.kosten[o.ix])===rub); /* US-22/US-50 */
    if(!grp.length) return;
    rows+='<tr class="rubrik-row"><td colspan="'+COLS+'">'+esc(rub)+'</td></tr>';
    grp.forEach(({i})=>{
      const direkt=i.schluessel==='direkt';
      const basisC=direkt?'direkt':(fmtEinh(i.basis)+' '+i.einheitLabel);
      const preisC=direkt?'—':(fmtPreis(i.preisJeEinheit)+' €');
      const ihreC=direkt?'100 %':(fmtEinh(i.ihreEinheiten)+' '+i.einheitLabel);
      const zeitC=(i.zeitanteil<0.999)?' <span class="muted">(×'+Math.round(i.zeitanteil*100)+' %)</span>':'';
      rows+='<tr><td>'+esc(i.bez)+'</td><td class="num">'+eur(i.gesamt)+'</td><td class="num">'+basisC+'</td><td class="num">'+preisC+'</td><td class="num">'+ihreC+'</td><td class="num">'+eur(i.wert)+zeitC+'</td></tr>';
    });
    const sub=grp.reduce((s,o)=>s+o.i.wert,0);
    rows+='<tr class="rubrik-subtotal"><td>Zwischensumme '+esc(rub)+'</td>'+leer(4)+'<td class="num">'+eur(sub)+'</td></tr>';
  });
  const summen = gew
    ? '<tr class="total-row"><td>Zwischensumme netto</td>'+leer(4)+'<td class="num">'+eur(ab.netto)+'</td></tr>'+
      '<tr><td>zzgl. '+NK_UST_SATZ+' % Umsatzsteuer</td>'+leer(4)+'<td class="num">'+eur(ab.ust)+'</td></tr>'+
      '<tr class="total-row"><td>Ihr Anteil (brutto)</td>'+leer(4)+'<td class="num">'+eur(ab.brutto)+'</td></tr>'
    : '<tr class="total-row"><td>Ihr Anteil an den Gesamtkosten</td>'+leer(4)+'<td class="num">'+eur(ab.brutto)+'</td></tr>';
  document.getElementById('doc').innerHTML=
    '<h2>Betriebs- und Heizkostenabrechnung</h2>'+
    '<div class="meta">'+esc(state.objekt.addr)+' · Einheit '+esc(e.name)+' · Mieter: <b>'+esc(m.mieter)+'</b>'+(gew?' (gewerblich, umsatzsteuerpflichtig)':'')+'<br>Abrechnungszeitraum: '+zeitraumText()+' · Mietzeit: '+fmtDatum(m.von)+'–'+fmtDatum(m.bis)+' ('+Math.round(za*100)+' % des Zeitraums)</div>'+
    '<div class="headline-box">'+  /* US-62: kompakter Ergebnis-Block (Techem-Stil) */
      '<div class="hl-row"><span>Ihr Anteil an den Gesamtkosten</span><span>'+eur(anteil)+'</span></div>'+
      '<div class="hl-row"><span>Ihre Vorauszahlung</span><span>'+eur(+m.voraus||0)+'</span></div>'+
      '<div class="hl-row hl-result"><span>'+(saldo>0?'Ihre Nachzahlung':'Ihr Guthaben')+'</span><span>'+eur(Math.abs(saldo))+'</span></div>'+
    '</div>'+
    '<table><thead><tr><th>Kostenart</th><th class="num">Gesamtkosten</th><th class="num">Einheiten</th><th class="num">Preis/Einh.</th><th class="num">Ihre Einheiten</th><th class="num">'+(gew?'Ihr Anteil (netto)':'Ihr Anteil')+'</th></tr></thead><tbody>'+
    rows+
    summen+
    '</tbody></table>'+
    (ab.co2.aktiv
      ? '<div class="pay"><h3>CO2-Kostenaufteilung (CO2KostAufG)</h3>'+
        'CO2-Kosten gesamt (Gebäude): '+eur(co2KostenGesamt())+' · Ihr Anteil: '+eur(ab.co2.kostenMieter)+'<br>'+
        nkCo2Erklaerung(ab.co2)+'<br>'+
        'Davon trägt der Vermieter: <b>– '+eur(ab.co2.abzug)+'</b> (in Ihrem Anteil oben bereits abgezogen).</div>'
      : '')+
    p35aBlock(ab.p35a)+  /* US-62: zwei Volltabellen (Abs. 2 / Abs. 3), nur private MV */
    '<div class="pay"><h3>Zahlungsmodalitäten</h3>'+
    (saldo>0
      ? 'Bitte überweisen Sie den Nachzahlungsbetrag innerhalb von '+state.zahlung.frist+' auf folgendes Konto:<br>'
        +'Empfänger: '+state.zahlung.empfaenger+' · IBAN: '+state.zahlung.iban+' · BIC: '+state.zahlung.bic+'<br>'
        +'Verwendungszweck: '+esc('NK-Abr. '+(state.objekt.addr||'')+'-'+e.name+'-'+m.mieter+'-'+zeitraumText())
      : 'Das Guthaben wird Ihnen innerhalb von '+state.zahlung.frist+' auf Ihr hinterlegtes Konto erstattet.')
    +'<br><span class="hint">Hinweis: Einwendungen können Sie innerhalb von 12 Monaten nach Zugang geltend machen.</span></div>';
  /* US-52: Versand-Block – E-Mail (im Vertrag gepflegt) anzeigen, Senden via Web Share (Anhang). */
  const vb=document.getElementById('versand_box');
  if(vb){
    const mail=(m.email||'').trim();
    vb.innerHTML=
      '<span class="unit-f">E-Mail: '+(mail?esc(mail):'<span class="muted">– im Reiter „Objekt" beim Vertrag eintragen –</span>')+'</span>'+
      '<button class="btn-primary" onclick="sharePdfAktiv()">Per E-Mail senden</button>'+
      '<span class="hint">Erzeugt das PDF und öffnet die Teilen-Funktion (mit Anhang, wo unterstützt). Wo nicht möglich, wird das PDF heruntergeladen – dann manuell anhängen.</span>';
  }
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
/* Versionsschema v-x.y.z: nur x (Release) wird manuell gepflegt – bei Erstauslieferung APP_MAJOR
   auf "1" setzen. y = Gesamtzahl der Commits (vom Deploy automatisch gesetzt), z = 0.
   APP_VERSION und BUILD_DATE werden beim Deploy automatisch gestempelt (siehe pages.yml). */
const APP_MAJOR="0";
const APP_VERSION="v-0.0.0 (lokal)";
const BUILD_DATE="2026-06-15";
function toggleDateiMenu(forceClose){ const m=document.getElementById('datei_menu'); if(!m) return; m.hidden = forceClose ? true : !m.hidden; }
document.addEventListener('click', e=>{ const m=document.getElementById('datei_menu'); if(m && !m.hidden && !e.target.closest('.menu')) m.hidden=true; });

/* ---------- View: Objektwahl, Render-Orchestrierung, Header ---------- */
/* STORAGE_KEY, ensureIds, snapshot, ladeDaten, makeFreshDaten, objektLabel, objSignatur,
   objektJahr, saveState, loadState, resetState, commit: in core.js (US-33b). */
function setSaveStatus(t){ const el=document.getElementById('save_status'); if(el){ el.textContent=t; el.title='Automatische Speicherung im Browser (localStorage). „Aktuelles Objekt sichern …" speichert zusätzlich als Datei.'; } }
/* US-38: Persistenz-Rückmeldung aus core.js in die Statusanzeige übersetzen. */
onPersist(function(ok){ setSaveStatus(ok ? '✓ automatisch gespeichert' : '⚠ nicht gespeichert'); });
function renderObjektSelect(){ const sel=document.getElementById('obj_select'); if(!sel) return;
  sel.innerHTML=objekte.map((d,i)=>'<option value="'+i+'"'+(i===aktivIdx?' selected':'')+'>'+esc(objektLabel(d,i))+'</option>').join(''); }
function renderAll(){ renderObjektSelect(); renderVorjahrBanner(); fillObjektKopf();
  const a=document.getElementById('abr_status'); if(a) a.value=state.abrechnungStatus;
  renderEinheiten(); renderVoraus(); renderKosten();
  if(current===3) renderHeizung(); else if(current===4) computeView(); else if(current===5) renderDoc(); else if(current===6) renderZahlungen();
  renderStepper(); }
function switchObjekt(idx){ saveState(); aktivIdx=Math.max(0,Math.min(+idx,objekte.length-1)); ladeDaten(objekte[aktivIdx]); ensureIds(); renderAll(); saveState(); }
function neuesObjekt(){ saveState(); objekte.push(makeFreshDaten()); aktivIdx=objekte.length-1; ladeDaten(objekte[aktivIdx]); ensureIds(); current=0; renderAll(); go(0); saveState(); }
/* US-65: Objekt als Datei sichern – echter Speicherdialog (File System Access API), wo
   unterstützt; sonst Download-Fallback. Dateiname wird aus „Objekt/Adresse" vorgeschlagen. */
async function exportObjekt(){
  const d=snapshot(); const name=objektLabel(d,aktivIdx).replace(/[^\wäöüÄÖÜß.\- ]/g,'_').trim()||'Objekt'; const jahr=objektJahr(d);
  const dateiname='NeKoFix-'+name+(jahr?'-'+jahr:'')+'.json';
  const json=JSON.stringify(d,null,2);
  if(window.showSaveFilePicker){
    try{
      const handle=await window.showSaveFilePicker({ suggestedName:dateiname, types:[{description:'NeKoFix-Objekt (JSON)', accept:{'application/json':['.json']}}] });
      const w=await handle.createWritable(); await w.write(json); await w.close();
      /* US-65: „Speichern unter" benennt das Objekt nach dem gewählten Dateinamen um
         (NeKoFix-Präfix und angehängtes Jahr werden ignoriert). */
      const neuerName=String(handle.name||'').replace(/\.json$/i,'').replace(/^NeKoFix-/i,'').replace(/-\d{4}$/,'').trim();
      if(neuerName && neuerName!==state.objekt.addr){ store.setObjektFeld('addr', neuerName); renderObjektSelect(); fillObjektKopf(); }
      setSaveStatus('✓ Datei gespeichert: '+handle.name);
      return;
    }catch(e){ if(e && e.name==='AbortError') return; /* vom Nutzer abgebrochen */ }
  }
  /* Fallback (Firefox/Safari): Download in den Browser-Download-Ordner. */
  const blob=new Blob([json],{type:'application/json;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=dateiname;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
}
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
(function(){ const v=document.getElementById('app_version'); if(v) v.textContent=APP_VERSION+' · '+BUILD_DATE; })();
(function(){ if(new URLSearchParams(location.search).has('debug')){ const b=document.getElementById('btn_testdaten'); if(b) b.hidden=false; } })();
(function(){ const a=document.getElementById('abr_status'); if(a) a.value=state.abrechnungStatus; })();
fillObjektKopf();
initNav(); /* US-54: gespeicherten Klapp-Zustand der Lasche anwenden */
renderEinheiten(); renderVoraus(); renderKosten(); renderStepper(); go(0);
saveState();
/* US-54: Versand-Ampel live aktualisieren, sobald sich Eingaben ändern. */
document.addEventListener('input', renderNavPlausi);
document.addEventListener('change', renderNavPlausi);
