/* core.js – Zustand, Store und Persistenz (US-33b, US-38).
   Geladen NACH calc.js und VOR dem View-Skript in index.html. Kein DOM-Zugriff.
   Persistenz meldet Erfolg/Fehler über onPersist(listener); die Statusanzeige übernimmt das View. */

/* ---------- In-Memory-State ---------- */
const state = {
  objekt: { addr:"Musterstraße 12, 48155 Münster", von:"2025-01-01", bis:"2025-12-31" },
  einheiten: [
    { id:1, name:"EG links", flaeche:70, personen:2, mv:[
      { mieter:"Familie Becker", von:"2025-01-01", bis:"2025-12-31", vmonat:150, vmonate:12, vjahr:1800, einmal:0, voraus:1800, grundmiete:800, stellAnzahl:1, stellPreis:40, bezahlt:{}, vertragGrundmiete:760, vertragNK:140, letzteAnpassung:"2025-09-01", naechsteAnpassung:"2026-09-01", chronik:[{datum:"2025-09-01",text:"Indexmiete +5 % (Grundmiete 760 → 800 €)"}] }
    ]},
    { id:2, name:"1. OG", flaeche:85, personen:3, mv:[
      { mieter:"Frau Sahin", von:"2025-01-01", bis:"2025-08-31", vmonat:175, vmonate:8, vjahr:1400, einmal:0, voraus:1400, grundmiete:950, stellAnzahl:0, stellPreis:40, bezahlt:{} },
      { mieter:"Herr Neu",  von:"2025-10-01", bis:"2025-12-31", vmonat:175, vmonate:3, vjahr:525,  einmal:0, voraus:525, grundmiete:980, stellAnzahl:1, stellPreis:40, bezahlt:{} }
    ]},
    { id:3, name:"2. OG", flaeche:60, personen:1, mv:[
      { mieter:"Herr Klein", von:"2025-01-01", bis:"2025-12-31", vmonat:125, vmonate:12, vjahr:1500, einmal:0, voraus:1500, grundmiete:650, stellAnzahl:0, stellPreis:40, bezahlt:{} }
    ]}
  ],
  kosten: [
    { bez:"Grundsteuer",            betrag:1200, schluessel:"flaeche" },
    { bez:"Wasser / Abwasser",      betrag:1600, schluessel:"person"  },
    { bez:"Müllbeseitigung",        betrag:900,  schluessel:"einheit" },
    { bez:"Gebäudeversicherung",    betrag:600,  schluessel:"flaeche" },
    { bez:"Beleuchtung / Allgemeinstrom", betrag:300, schluessel:"flaeche" },
    { bez:"Hauswart",               betrag:1200, schluessel:"flaeche" },
    { bez:"Heizung & Warmwasser (Messdienst)", betrag:4800, schluessel:"flaeche" }
  ],
  zahlung:{ frist:"14 Tage nach Zugang", iban:"DE12 3456 7890 1234 5678 00", bic:"WELADED1MST", empfaenger:"M. Vermieter" },
  abrechnungStatus:"inArbeit"
};
/* US-30: mehrere Objekte im Speicher; `state` ist immer das aktive Objekt */
let objekte = [], aktivIdx = 0;
const STORAGE_KEY="nekofix-state-v1";

/* ---------- US-34: dünne Zustands-Schicht (Store) ----------
   Einziger Ort, der tief in `state` schreibt, und löst zentral über commit() das
   Speichern aus. Rendering bleibt in der UI-Schicht (Handler rufen renderX()). */
function neuesMv(){ return {mieter:"Neuer Mieter",von:state.objekt.von,bis:state.objekt.bis,vmonat:0,vmonate:12,vjahr:0,einmal:0,voraus:0,grundmiete:0,stellAnzahl:0,stellPreis:0,bezahlt:{}}; }
const store = {
  // Lesezugriffe
  mv(ei,mi){ return state.einheiten[ei].mv[mi]; },
  kosten(idx){ return state.kosten[idx]; },
  // Objekt
  setObjektFeld(field,val){ state.objekt[field]=val; commit(); },
  setAbrechnungStatus(val){ state.abrechnungStatus=val; commit(); },
  // Einheiten
  addEinheit(){ const name=nkNaechsteEinheitName(state.einheiten.map(e=>e.name)); const id=state.einheiten.reduce((m,e)=>Math.max(m,e.id||0),0)+1; state.einheiten.push({ id, name, flaeche:0, personen:1, mv:[neuesMv()] }); commit(); },
  removeEinheit(ei){ if(state.einheiten.length>1){ state.einheiten.splice(ei,1); commit(); } },
  setEinheitFeld(ei,field,val){ state.einheiten[ei][field] = field==='name'?val:(+val); commit(); },
  // Mietverhältnisse
  addMv(ei){ state.einheiten[ei].mv.push(neuesMv()); commit(); },
  removeMv(ei,mi){ const mv=state.einheiten[ei].mv; if(mv.length>1){ mv.splice(mi,1); commit(); } },
  setMvFeld(ei,mi,field,val){ state.einheiten[ei].mv[mi][field]=val; commit(); },
  setMvNum(ei,mi,field,val){ state.einheiten[ei].mv[mi][field]=+val; commit(); },
  setVertragFeld(ei,mi,field,val,num){ state.einheiten[ei].mv[mi][field]= num?(+val):val; commit(); },
  setBezahlt(ei,mi,key,checked){ const m=state.einheiten[ei].mv[mi]; if(!m.bezahlt)m.bezahlt={}; m.bezahlt[key]=checked; commit(); },
  // Chronik
  addChronik(ei,mi){ const m=state.einheiten[ei].mv[mi]; if(!m.chronik)m.chronik=[]; m.chronik.push({datum:state.objekt.von||'',text:''}); commit(); },
  removeChronik(ei,mi,ci){ state.einheiten[ei].mv[mi].chronik.splice(ci,1); commit(); },
  setChronikFeld(ei,mi,ci,field,val){ const m=state.einheiten[ei].mv[mi]; if(!m.chronik)m.chronik=[]; m.chronik[ci][field]=val; commit(); },
  // Kosten
  addKosten(bez){ if(!state.kosten.some(k=>k.bez===bez)) state.kosten.push({bez, betrag:0, schluessel:nkVorschlagSchluessel(bez)}); commit(); },
  addKostenPos(pos){ state.kosten.push(pos); commit(); }, /* US-05: vollständige Position (z. B. Heizblock) */
  removeKosten(idx){ state.kosten.splice(idx,1); commit(); },
  setKostenFeld(idx,field,val){ state.kosten[idx][field]=val; commit(); },
  setKostenBetrag(idx,val){ state.kosten[idx].betrag=+val; commit(); },
  setKostenart(idx,val){ const k=state.kosten[idx]; k.bez=val; k.schluessel=nkVorschlagSchluessel(val); k.vorsteuer=nkVorschlagVorsteuer(val); commit(); },
  resetKostenSchluessel(idx){ const k=state.kosten[idx]; k.schluessel=nkVorschlagSchluessel(k.bez); commit(); }
};

/* ---------- Persistenz (US-27 / US-30) ---------- */
function ensureIds(){
  let max=0; const bump=o=>{ if(o.id&&o.id>max)max=o.id; };
  state.einheiten.forEach(e=>{bump(e);(e.mv||[]).forEach(bump);}); state.kosten.forEach(bump);
  const set=o=>{ if(!o.id) o.id=++max; };
  state.einheiten.forEach(e=>{set(e);(e.mv||[]).forEach(set);}); state.kosten.forEach(set);
}
/* aktives Objekt als reine Daten herausziehen / in `state` laden */
function snapshot(){ return { objekt:state.objekt, einheiten:state.einheiten, kosten:state.kosten, zahlung:state.zahlung, abrechnungStatus:state.abrechnungStatus, vorjahr:!!state.vorjahr }; }
function ladeDaten(d){ state.objekt=d.objekt; state.einheiten=d.einheiten||[]; state.kosten=d.kosten||[]; state.zahlung=d.zahlung||{}; state.abrechnungStatus=d.abrechnungStatus||"inArbeit"; state.vorjahr=!!d.vorjahr; }
function makeFreshDaten(){ const von="2025-01-01", bis="2025-12-31"; return {
  objekt:{ addr:"Neues Objekt", von, bis },
  einheiten:[{ id:1, name:"EG", flaeche:0, personen:1, mv:[{ mieter:"Mieter 1", von, bis, vmonat:0, vmonate:12, vjahr:0, einmal:0, voraus:0, grundmiete:0, stellAnzahl:0, stellPreis:0, bezahlt:{} }] }],
  kosten:[],
  zahlung:{ frist:"14 Tage nach Zugang", iban:"", bic:"", empfaenger:"" },
  abrechnungStatus:"inArbeit"
}; }
function objektJahr(d){ const v=d&&d.objekt&&(d.objekt.von||d.objekt.bis); const m=String(v||'').match(/^(\d{4})/); return m?m[1]:''; }
function objektLabel(d,i){ const addr=(d&&d.objekt&&String(d.objekt.addr||"").trim())||("Objekt "+(i+1)); const j=objektJahr(d); return j?(addr+" · "+j):addr; }
function objSignatur(d){ const o=(d&&d.objekt)||{}; return [String(o.addr||"").trim(), o.von||"", o.bis||""].join("|"); }
/* US-38: Persistenz meldet Erfolg/Fehler über einen Listener; die DOM-Anzeige liegt im View. */
let _persistListener = null;
function onPersist(fn){ _persistListener = fn; }
function saveState(){ let ok=true; try{ if(objekte.length) objekte[aktivIdx]=snapshot(); localStorage.setItem(STORAGE_KEY, JSON.stringify({ objekte, aktivIdx })); }catch(e){ ok=false; } if(_persistListener) _persistListener(ok); return ok; }
function loadState(){ try{ const raw=localStorage.getItem(STORAGE_KEY); if(!raw) return false; const o=JSON.parse(raw);
    if(o && Array.isArray(o.objekte) && o.objekte.length){ objekte=nkDedupeObjekte(o.objekte); aktivIdx=Math.max(0,Math.min(o.aktivIdx||0, objekte.length-1)); ladeDaten(objekte[aktivIdx]); return true; }
    if(o && Array.isArray(o.einheiten)){ objekte=[o]; aktivIdx=0; ladeDaten(o); return true; } /* Migration: altes Einzelformat */
    return false; }catch(e){ return false; } }
function resetState(){ if(confirm('Aktuelle Eingaben verwerfen und die Beispiel-/Testdaten laden? Alle gespeicherten Daten (auch weitere Objekte) gehen dabei verloren.')){ try{ localStorage.removeItem(STORAGE_KEY); }catch(e){} location.reload(); } }
/* US-34: einzelner Auslöser fürs (entprellte) Speichern. Der Store ruft ausschließlich commit(). */
let _saveTimer; function commit(){ clearTimeout(_saveTimer); _saveTimer=setTimeout(saveState,600); }
function scheduleSave(){ commit(); } /* Rückwärtskompatibel */
