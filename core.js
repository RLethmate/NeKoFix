/* core.js – Zustand, Store und Persistenz (US-33b, US-38).
   Geladen NACH calc.js und VOR dem View-Skript in index.html. Kein DOM-Zugriff.
   Persistenz meldet Erfolg/Fehler über onPersist(listener); die Statusanzeige übernimmt das View. */

/* ---------- In-Memory-State ---------- */
const state = {
  objekt: { addr:"Musterstraße 12, 12345 Musterstadt", von:"2025-01-01", bis:"2025-12-31", co2Denkmal:false, co2ProzentOverride:"" },
  einheiten: [
    { id:1, name:"EG links", flaeche:70, personen:2, mv:[
      { mieter:"Mieter 1", von:"2025-01-01", bis:"2025-12-31", vmonat:150, vmonate:12, vjahr:1800, einmal:0, voraus:1800, grundmiete:800, stellAnzahl:1, stellPreis:40, bezahlt:{}, vertragGrundmiete:760, vertragNK:140, letzteAnpassung:"2025-09-01", naechsteAnpassung:"2026-09-01", chronik:[{datum:"2025-09-01",text:"Indexmiete +5 % (Grundmiete 760 → 800 €)"}] }
    ]},
    { id:2, name:"1. OG", flaeche:85, personen:3, mv:[
      { mieter:"Mieter 2", von:"2025-01-01", bis:"2025-08-31", vmonat:175, vmonate:8, vjahr:1400, einmal:0, voraus:1400, grundmiete:950, stellAnzahl:0, stellPreis:40, bezahlt:{} },
      { mieter:"Mieter 3",  von:"2025-10-01", bis:"2025-12-31", vmonat:175, vmonate:3, vjahr:525,  einmal:0, voraus:525, grundmiete:980, stellAnzahl:1, stellPreis:40, bezahlt:{} }
    ]},
    { id:3, name:"2. OG", flaeche:60, personen:1, mv:[
      { mieter:"Mieter 4", von:"2025-01-01", bis:"2025-12-31", vmonat:125, vmonate:12, vjahr:1500, einmal:0, voraus:1500, grundmiete:650, stellAnzahl:0, stellPreis:40, bezahlt:{} }
    ]}
  ],
  kosten: [
    { bez:"Grundsteuer",            betrag:1200, schluessel:"flaeche" },
    { bez:"Wasser / Abwasser",      betrag:1600, schluessel:"person"  },
    { bez:"Müllbeseitigung",        betrag:900,  schluessel:"einheit" },
    { bez:"Gebäudeversicherung",    betrag:600,  schluessel:"flaeche" },
    { bez:"Beleuchtung / Allgemeinstrom", betrag:300, schluessel:"flaeche" },
    { bez:"Hauswart",               betrag:1200, schluessel:"flaeche" },
    { bez:"Heizung & Warmwasser (Messdienst)", betrag:4800, schluessel:"flaeche" },
    /* US-05/06/07: fossiler Heizblock mit CO2-Angaben von der Brennstoffrechnung (Demo). */
    { bez:"Heizung (Erdgas)", typ:"heizung", energieart:"erdgas_kwh", einheit:"kWh", heizwert:1, menge:30000, preis:0.12, betrag:3600, schluessel:"flaeche", co2Kg:6030, co2Kosten:330 }
  ],
  zahlung:{ frist:"14 Tage nach Zugang", iban:"DE36 0000 0000 0000 0000 00", bic:"", empfaenger:"M. Vermieter", anschrift:"Musterstraße 12, 12345 Musterstadt" },
  abrechnungStatus:"inArbeit"
};
/* US-30: mehrere Objekte im Speicher; `state` ist immer das aktive Objekt */
let objekte = [], aktivIdx = 0;
const STORAGE_KEY="nekofix-state-v1";

/* ---------- US-34: dünne Zustands-Schicht (Store) ----------
   Einziger Ort, der tief in `state` schreibt, und löst zentral über commit() das
   Speichern aus. Rendering bleibt in der UI-Schicht (Handler rufen renderX()). */
function neuesMv(){ return {mieter:"Neuer Mieter",von:state.objekt.von,bis:state.objekt.bis,laeuft:true,vmonat:0,vmonate:12,vjahr:0,einmal:0,voraus:0,grundmiete:0,stellAnzahl:0,stellPreis:0,bezahlt:{}}; }
const store = {
  // Lesezugriffe
  mv(ei,mi){ return state.einheiten[ei].mv[mi]; },
  kosten(idx){ return state.kosten[idx]; },
  // Objekt
  setObjektFeld(field,val){ state.objekt[field]=val; commit(); },
  setZahlungFeld(field,val){ if(!state.zahlung) state.zahlung={}; state.zahlung[field]=val; commit(); }, /* US-51 */
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
  setErhalten(ei,mi,key,val){ const m=state.einheiten[ei].mv[mi]; if(!m.erhalten)m.erhalten={}; m.erhalten[key]=+val||0; commit(); }, /* US-74 */
  setSollSnap(ei,mi,key,val){ const m=state.einheiten[ei].mv[mi]; if(!m.sollSnap)m.sollSnap={}; m.sollSnap[key]=+val||0; commit(); }, /* US-74: Soll bei bezahltem Monat einfrieren */
  clearSollSnap(ei,mi,key){ const m=state.einheiten[ei].mv[mi]; if(m.sollSnap&&key in m.sollSnap){ delete m.sollSnap[key]; commit(); } }, /* US-74: Einfrieren aufheben (z. B. beim Ent-Haken von „geprüft") */
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
  setKostenVerbrauch(idx,einheitId,val){ const k=state.kosten[idx]; if(!k.verbrauch) k.verbrauch={}; k.verbrauch[einheitId]=+val||0; commit(); }, /* US-57 */
  setKostenart(idx,val){ const k=state.kosten[idx]; k.bez=val; k.schluessel=nkVorschlagSchluessel(val); k.vorsteuer=nkVorschlagVorsteuer(val); commit(); },
  resetKostenSchluessel(idx){ const k=state.kosten[idx]; k.schluessel=nkVorschlagSchluessel(k.bez); commit(); },
  // Rubriken (US-89): objekt-eigene, geordnete Liste; Zuordnung über k.rubrik (Name)
  addRubrik(name){ name=String(name||'').trim(); if(!name) return; ensureRubrikenMaterialisiert(); if(state.objekt.rubriken.indexOf(name)<0){ state.objekt.rubriken.push(name); commit(); } },
  renameRubrik(alt,neu){ neu=String(neu||'').trim(); if(!neu||neu===alt) return; ensureRubrikenMaterialisiert(); const i=state.objekt.rubriken.indexOf(alt); if(i<0 || state.objekt.rubriken.indexOf(neu)>=0) return; state.objekt.rubriken[i]=neu; state.kosten.forEach(k=>{ if(k.rubrik===alt) k.rubrik=neu; }); commit(); },
  deleteRubrik(name){ ensureRubrikenMaterialisiert(); if(state.kosten.some(k=>k.rubrik===name)) return; /* nur leere Rubriken löschen */ state.objekt.rubriken=state.objekt.rubriken.filter(r=>r!==name); commit(); },
  moveRubrik(from,to){ ensureRubrikenMaterialisiert(); state.objekt.rubriken=nkArrMove(state.objekt.rubriken, from, to); commit(); },
  /* US-89 Phase 2: Kostenposition (per id) verschieben – Rubrik setzen und vor das Ziel (id)
     einsortieren; zielId null => ans Ende der Rubrik. Drag & Drop in der Kostenliste. */
  moveKosten(dragId,zielId,rubrik){ ensureRubrikenMaterialisiert(); if(rubrik!=null && rubrik!==''){ const d=state.kosten.find(k=>k.id===dragId); if(d) d.rubrik=rubrik; } state.kosten=nkListeEinsortieren(state.kosten, dragId, zielId); commit(); }
};
/* US-89: beim ersten Rubriken-Eingriff materialisieren – die effektive Liste am Objekt festschreiben
   und jede Position auf ihre aktuelle (vorgeschlagene) Rubrik festlegen, damit Umbenennen/Umordnen
   stabil bleibt (Positionen ohne explizite Rubrik würden sonst dem Vorschlag „weglaufen"). */
function ensureRubrikenMaterialisiert(){
  if(!state.objekt) return;
  if(!Array.isArray(state.objekt.rubriken) || !state.objekt.rubriken.length){
    state.objekt.rubriken = nkRubrikenListe(state.objekt, state.kosten);
  }
  state.kosten.forEach(k=>{ if(!k.rubrik) k.rubrik=nkRubrik(k); });
}

/* ---------- Persistenz (US-27 / US-30) ---------- */
function ensureIds(){
  let max=0; const bump=o=>{ if(o.id&&o.id>max)max=o.id; };
  state.einheiten.forEach(e=>{bump(e);(e.mv||[]).forEach(bump);}); state.kosten.forEach(bump);
  const set=o=>{ if(!o.id) o.id=++max; };
  state.einheiten.forEach(e=>{set(e);(e.mv||[]).forEach(set);}); state.kosten.forEach(set);
}
/* aktives Objekt als reine Daten herausziehen / in `state` laden */
function snapshot(){ return { objekt:state.objekt, einheiten:state.einheiten, kosten:state.kosten, zahlung:state.zahlung, abrechnungStatus:state.abrechnungStatus, vorjahr:!!state.vorjahr }; }
function ladeDaten(d){ state.objekt=d.objekt; state.einheiten=d.einheiten||[]; state.kosten=d.kosten||[]; state.zahlung=d.zahlung||{}; state.abrechnungStatus=d.abrechnungStatus||"inArbeit"; state.vorjahr=!!d.vorjahr; if(state.objekt && !state.objekt.name) state.objekt.name=state.objekt.addr||""; /* US-65: Objektname aus Adresse vorbelegen, danach stabil */ }
function makeFreshDaten(){ const von="2025-01-01", bis="2025-12-31"; return {
  objekt:{ addr:"Neues Objekt", name:"Neues Objekt", von, bis },
  einheiten:[{ id:1, name:"EG", flaeche:0, personen:1, mv:[{ mieter:"Mieter 1", von, bis, vmonat:0, vmonate:12, vjahr:0, einmal:0, voraus:0, grundmiete:0, stellAnzahl:0, stellPreis:0, bezahlt:{} }] }],
  kosten:[],
  zahlung:{ frist:"14 Tage nach Zugang", iban:"", bic:"", empfaenger:"", anschrift:"" },
  abrechnungStatus:"inArbeit"
}; }
function objektJahr(d){ const v=d&&d.objekt&&(d.objekt.von||d.objekt.bis); const m=String(v||'').match(/^(\d{4})/); return m?m[1]:''; }
/* US-65: Combobox zeigt den Objekt-/Dateinamen (name), nicht das Live-Adressfeld. Fallback: Adresse. */
function objektLabel(d,i){ const nm=(d&&d.objekt&&String((d.objekt.name||d.objekt.addr)||"").trim())||("Objekt "+(i+1)); const j=objektJahr(d); return j?(nm+" · "+j):nm; }
function objSignatur(d){ const o=(d&&d.objekt)||{}; return [String(o.addr||"").trim(), o.von||"", o.bis||""].join("|"); }
/* US-38: Persistenz meldet Erfolg/Fehler über einen Listener; die DOM-Anzeige liegt im View. */
let _persistListener = null;
function onPersist(fn){ _persistListener = fn; }
/* US-84: Dokument-Modell – Signatur des zuletzt explizit gespeicherten Stands je Objekt
   (parallel zu `objekte`). Arbeitsstand wird weiter laufend in localStorage gehalten
   (Absturzschutz); „gespeichert" ist nur, was über markGespeichert() bestätigt wurde. */
let savedSigs = [];
/* Speicher: die zuletzt explizit gespeicherten Daten je Objekt (parallel zu savedSigs).
   Dient dem Verwerfen ungespeicherter Änderungen beim Objektwechsel (zurück auf den
   gespeicherten Stand). Wird mitpersistiert, damit „verwerfen" auch über einen Reload geht. */
let savedData = [];
/* US-91: Zuletzt verwendete Objekte (MRU) als Liste von Objekt-Signaturen, neueste zuerst, max 8.
   Persistiert, damit „Zuletzt verwendet" einen Reload übersteht. */
let mru = [];
function mruPush(sig){ if(!sig) return; mru = mru.filter(s => s !== sig); mru.unshift(sig); if(mru.length > 8) mru.length = 8; }
let _stateChangeListener = null;
function onStateChange(fn){ _stateChangeListener = fn; }
function notifyStateChange(){ if(_stateChangeListener) _stateChangeListener(); }
function aktSig(){ return nkSig(snapshot()); }
function istGespeichert(){ return savedSigs[aktivIdx] === aktSig(); }
/* US-76/US-84: Signatur des zuletzt als PC-Datei gesicherten Stands je Objekt (nur im Speicher,
   sitzungsbasiert). „Gespeichert" (US-84) heißt nur localStorage/In-App – NICHT „als Datei auf
   dem PC". markDateiGesichert() wird bei erfolgreichem exportObjekt() gesetzt; istDateiGesichert()
   ist die Bedingung für den Backup-Hinweis nach PDF-Export (US-76). */
let dateiSigs = [];
function markDateiGesichert(){ if(objekte.length) dateiSigs[aktivIdx]=aktSig(); }
function istDateiGesichert(){ return objekte.length ? dateiSigs[aktivIdx]===aktSig() : false; }
function markGespeichert(){ if(objekte.length){ objekte[aktivIdx]=snapshot(); savedSigs[aktivIdx]=aktSig(); savedData[aktivIdx]=nkClone(objekte[aktivIdx]); } saveState(); notifyStateChange(); }
/* Speicher: ungespeicherte Änderungen des aktiven Objekts verwerfen – zurück auf den zuletzt
   gespeicherten Stand (savedData). Ohne gespeicherten Stand (nie gespeichertes neues Objekt)
   bleibt der Arbeitsstand unverändert. */
function verwerfeAenderungen(){ if(savedData[aktivIdx]){ const d=nkClone(savedData[aktivIdx]); objekte[aktivIdx]=d; ladeDaten(d); ensureIds(); saveState(); notifyStateChange(); } }
function saveState(){ let ok=true; try{ if(objekte.length) objekte[aktivIdx]=snapshot(); localStorage.setItem(STORAGE_KEY, JSON.stringify({ objekte, aktivIdx, savedSigs, savedData, mru })); }catch(e){ ok=false; } if(_persistListener) _persistListener(ok); return ok; }
function loadState(){ try{ const raw=localStorage.getItem(STORAGE_KEY); if(!raw) return false; const o=JSON.parse(raw);
    if(o && Array.isArray(o.objekte) && o.objekte.length){ objekte=nkDedupeObjekte(o.objekte); aktivIdx=Math.max(0,Math.min(o.aktivIdx||0, objekte.length-1));
      savedSigs = (Array.isArray(o.savedSigs) && o.savedSigs.length===objekte.length) ? o.savedSigs : []; /* US-84: vorhandene Speicherpunkte behalten (dirty übersteht Reload); sonst Baseline im Init */
      savedData = (Array.isArray(o.savedData) && o.savedData.length===objekte.length) ? o.savedData : []; /* Speicher: gespeicherte Daten je Objekt fürs Verwerfen; sonst Baseline im Init */
      mru = Array.isArray(o.mru) ? o.mru : []; /* US-91: Zuletzt verwendet */
      ladeDaten(objekte[aktivIdx]); return true; }
    if(o && Array.isArray(o.einheiten)){ objekte=[o]; aktivIdx=0; savedSigs=[]; savedData=[]; ladeDaten(o); return true; } /* Migration: altes Einzelformat */
    return false; }catch(e){ return false; } }
function resetState(){ if(confirm('Aktuelle Eingaben verwerfen und die Beispiel-/Testdaten laden? Alle gespeicherten Daten (auch weitere Objekte) gehen dabei verloren.')){ try{ localStorage.removeItem(STORAGE_KEY); }catch(e){} location.reload(); } }
/* ---------- US-82: Undo/Redo-Verlauf (aktives Objekt) ----------
   Jede granulare Bearbeitung läuft durch commit(); dort wird der vorige Stand erfasst.
   Objekt-Operationen (Wechsel/Neu/Import/Vorjahr/Reset) setzen den Verlauf über histReset()
   zurück. Rein im Arbeitsspeicher (nicht über Reload hinweg). */
const HIST_MAX=60, HIST_COALESCE_MS=500;
let histPast=[], histFuture=[], histBase=null, histTs=0;
function histReset(){ histPast=[]; histFuture=[]; histBase=nkClone(snapshot()); histTs=0; }
function histCanUndo(){ return histPast.length>0; }
function histCanRedo(){ return histFuture.length>0; }
/* Wird bei jedem commit() aufgerufen – der Stand ist hier bereits der NEUE; histBase hält den
   vorigen. Schnell aufeinanderfolgende Commits verschmelzen zu einem Schritt. */
function histCapture(){
  const curJson=JSON.stringify(snapshot());
  if(histBase!=null && curJson===JSON.stringify(histBase)) return; /* nichts geändert (auch Doppel-Events) */
  const now=Date.now(), cur=JSON.parse(curJson);
  if(histBase==null){ histBase=cur; histTs=now; return; }
  if(nkHistCoalesce(histTs, now, HIST_COALESCE_MS)){ histBase=cur; histTs=now; return; } /* schnelles Tippen => ein Schritt */
  histPast.push(histBase); if(histPast.length>HIST_MAX) histPast.shift();
  histFuture=[]; histBase=cur; histTs=now;
}
function histLoad(d){ ladeDaten(nkClone(d)); ensureIds(); histBase=nkClone(snapshot()); histTs=0; saveState(); }
function histUndo(){ if(!histPast.length) return false; histFuture.push(nkClone(snapshot())); histLoad(histPast.pop()); return true; }
function histRedo(){ if(!histFuture.length) return false; histPast.push(nkClone(snapshot())); histLoad(histFuture.pop()); return true; }

/* US-34: einzelner Auslöser fürs (entprellte) Speichern. Der Store ruft ausschließlich commit(). */
let _saveTimer; function commit(){ histCapture(); notifyStateChange(); clearTimeout(_saveTimer); _saveTimer=setTimeout(saveState,600); }
function scheduleSave(){ commit(); } /* Rückwärtskompatibel */
