/* NeKoFix – Dokumentenablage je Mieter (US-109), klassisches Script (nach calc.js/core.js/view.js).
   Speichert Fotos/Belege in ECHTEN Ordnern (File System Access API, nur Chromium). Verzeichnis-
   Handles werden in IndexedDB persistiert. Kein Backend/Cloud. Anbindung an Chronik-Einträge über
   c.dateien (Dateinamen).

   Zwei Schemata nebeneinander (Ralf-Vorgabe 2026-07-08, "Datenablage v2"):
   - v1 (Bestand, kein objekt.dokAblageVersion oder Wert < 2): EIN global gewählter Stammordner
     (_dokBasis) für ALLE Objekte, Pfad "Objekt/Jahr/Einheit/Mieter" darunter (nkDokPfad). Die JSON
     ("Speichern unter") landet unabhängig davon an einem frei gewählten Ort (schreibeDatei).
   - v2 (neu angelegte Objekte ab jetzt, objekt.dokAblageVersion===2): JEDES Objekt bekommt seinen
     EIGENEN Stammordner (an selbst gewähltem Ort, benannt nach dem Objekt), Pfad "Jahr/Einheit/
     Mieter" darunter (nkDokPfadObjekt – kein Objekt-Segment mehr, das Objekt IST der Ordner). Die
     JSON liegt als Kind IN diesem Ordner (dokJsonSpeichern statt schreibeDatei).
   Umgesetzt nur für künftige Objekte (Bestandsschutz nicht nötig: noch niemand arbeitet mit realen
   Daten in der alten Struktur). Kann sich laut Ralf nach weiterem Feedback noch ändern – daher eine
   Versionsnummer statt eines simplen Flags. */
let _dokBasis = null; /* FileSystemDirectoryHandle, v1 (global) */
let _dokObjektRootCache = {}; /* {[objektId]: FileSystemDirectoryHandle}, v2 (pro Objekt) */
function dokVerfuegbar(){ return typeof window.showDirectoryPicker === 'function'; }
function dokBasisName(){ return _dokBasis ? _dokBasis.name : ''; }
function _dokIdb(){ return new Promise((res,rej)=>{ const r=indexedDB.open('nekofix-docs',1);
  r.onupgradeneeded=function(){ r.result.createObjectStore('h'); };
  r.onsuccess=function(){ res(r.result); }; r.onerror=function(){ rej(r.error); }; }); }
async function _dokIdbSet(k,v){ const db=await _dokIdb(); return new Promise((res,rej)=>{ const t=db.transaction('h','readwrite'); t.objectStore('h').put(v,k); t.oncomplete=function(){res();}; t.onerror=function(){rej(t.error);}; }); }
async function _dokIdbGet(k){ const db=await _dokIdb(); return new Promise((res,rej)=>{ const t=db.transaction('h','readonly'); const q=t.objectStore('h').get(k); q.onsuccess=function(){res(q.result);}; q.onerror=function(){rej(q.error);}; }); }
async function dokBasisLaden(){ try{ _dokBasis=(await _dokIdbGet('basis'))||null; }catch(e){ _dokBasis=null; } return _dokBasis; }
/* Ralf-Feedback 2026-07-08: "konnte Datei nicht speichern" beim allerersten Versuch (noch kein
   Ordner gewählt) – dokBasisWaehlen() öffnete zwar den Ordner-Dialog, brach die eigentliche Aktion
   (Datei anhängen/hochladen) danach aber ab; man musste ein zweites Mal klicken. Jetzt liefert
   dokBasisWaehlen() true/false zurück, die Aufrufer machen im selben Zug weiter. */
async function dokBasisWaehlen(){
  if(!dokVerfuegbar()){ alert('Die Ordner-Ablage benötigt Chrome, Edge oder Brave (File System Access API).'); return false; }
  try{ const h=await window.showDirectoryPicker({mode:'readwrite'}); _dokBasis=h; await _dokIdbSet('basis',h); if(typeof renderMieterVertrag==='function') renderMieterVertrag(); return true; }
  catch(e){ return false; /* vom Nutzer abgebrochen */ }
}
async function _dokPerm(h){ if(!h) return false; const o={mode:'readwrite'}; try{ if((await h.queryPermission(o))==='granted') return true; return (await h.requestPermission(o))==='granted'; }catch(e){ return false; } }
/* ---------- v2: eigener Stammordner je Objekt (Ralf-Vorgabe 2026-07-08) ---------- */
function _dokObjektRootKey(objektId){ return 'objroot:'+objektId; }
async function _dokObjektRootLaden(objektId){ try{ return (await _dokIdbGet(_dokObjektRootKey(objektId)))||null; }catch(e){ return null; } }
async function _dokObjektRootSetzen(objektId, handle){ await _dokIdbSet(_dokObjektRootKey(objektId), handle); }
/* Liefert den Stammordner des übergebenen Objekts; fragt beim allerersten Mal EINMALIG nach dem
   ÜBERGEORDNETEN Ordner und legt darin einen Unterordner mit dem Objektnamen an (das wird der
   Stammordner). Null bei Abbruch/fehlender Objekt-ID/fehlendem Browser-Support. */
async function dokObjektRootSicherstellen(objekt){
  if(!dokVerfuegbar() || !objekt || !objekt.id) return null;
  let root=_dokObjektRootCache[objekt.id] || await _dokObjektRootLaden(objekt.id);
  if(root){ _dokObjektRootCache[objekt.id]=root; return root; }
  const ordnername=nkDokSegment(objekt.name||objekt.addr||'Objekt');
  if(!confirm('Für „'+(objekt.name||objekt.addr||'dieses Objekt')+'" wird jetzt ein eigener Ordner angelegt.\n\nIm nächsten Dialog bitte den ÜBERGEORDNETEN Ordner wählen (z. B. „Dokumente") – der Ordner „'+ordnername+'" wird darin neu erstellt.')) return null;
  let eltern;
  try{ eltern=await window.showDirectoryPicker({mode:'readwrite'}); }catch(e){ return null; /* abgebrochen */ }
  if(!(await _dokPerm(eltern))){ alert('Kein Schreibzugriff auf den gewählten Ordner.'); return null; }
  try{ root=await eltern.getDirectoryHandle(ordnername,{create:true}); }
  catch(e){ alert('Ordner „'+ordnername+'" konnte nicht angelegt werden: '+((e&&e.message)||e)); return null; }
  _dokObjektRootCache[objekt.id]=root; await _dokObjektRootSetzen(objekt.id, root);
  return root;
}
/* Liefert den fürs AKTUELLE Objekt zuständigen Stammordner (v2: pro Objekt, v1: global) –
   Einstiegspunkt, den alle übrigen Funktionen unten nutzen, damit sie nicht selbst zwischen den
   beiden Schemata unterscheiden müssen. promptWennFehlt=false: nie einen Dialog aufreißen (z. B.
   beim stillen Nachladen einer Dateiliste); true: bei Bedarf fragen (explizite Nutzeraktion). */
async function _dokBasisAktuell(promptWennFehlt){
  const v2 = state.objekt && (+state.objekt.dokAblageVersion||0)>=2;
  if(v2){
    if(!state.objekt.id) return null;
    let root=_dokObjektRootCache[state.objekt.id] || await _dokObjektRootLaden(state.objekt.id);
    if(root){ _dokObjektRootCache[state.objekt.id]=root; return root; }
    return promptWennFehlt ? await dokObjektRootSicherstellen(state.objekt) : null;
  }
  if(_dokBasis) return _dokBasis;
  if(!promptWennFehlt) return null;
  return (await dokBasisWaehlen()) ? _dokBasis : null;
}
function _dokCtx(ei,mi){ const e=state.einheiten[ei], m=e&&e.mv[mi]; if(!m) return null;
  const jahr=(typeof objektJahr==='function')?objektJahr(snapshot()):'';
  const v2 = state.objekt && (+state.objekt.dokAblageVersion||0)>=2;
  const segs = v2
    ? nkDokPfadObjekt(jahr, e.name, m.mieter)
    : nkDokPfad((state.objekt&&(state.objekt.name||state.objekt.addr))||'', jahr, e.name, m.mieter);
  return { segs:segs, e:e, m:m }; }
/* Wirft statt still null zurückzugeben – Aufrufer bekommen so eine konkrete, im Alert anzeigbare
   Fehlermeldung statt des immer gleichen "konnte nicht speichern" (Ralf-Feedback 2026-07-08). */
async function _dokOrdner(basis, segs, create){
  if(!basis) throw new Error('Kein Dokumentenordner gewählt.');
  if(!(await _dokPerm(basis))) throw new Error('Kein Schreibzugriff auf den Dokumentenordner – bitte im Datei-Menü erneut auswählen.');
  let d=basis; for(const s of segs){ d=await d.getDirectoryHandle(s,{create:!!create}); } return d;
}
/* Liste der Dateien im Mieter-Ordner in den zugehörigen Container rendern. */
async function dokListe(ei,mi){ const ctx=_dokCtx(ei,mi); if(!ctx) return;
  const box=document.querySelector('.dok-liste[data-mid="'+ctx.m.id+'"]'); if(!box) return;
  if(!dokVerfuegbar()){ box.innerHTML='<span class="hint">Nur in Chrome/Edge/Brave verfügbar.</span>'; return; }
  const basis=await _dokBasisAktuell(false);
  if(!basis){ box.innerHTML='<span class="hint">Noch kein Dokumentenordner gewählt.</span>'; return; }
  try{ const dir=await _dokOrdner(basis,ctx.segs,false);
    const namen=[]; for await (const entry of dir.values()){ if(entry.kind==='file') namen.push(entry.name); } namen.sort();
    box.innerHTML = namen.length
      ? namen.map(nm=>'<div class="dok-item"><span>'+esc(nm)+'</span> <button type="button" class="linklike" onclick="dokOeffnen('+ei+','+mi+',\''+encodeURIComponent(nm)+'\')">öffnen</button> <button type="button" class="row-del" title="Datei löschen" onclick="dokLoeschen('+ei+','+mi+',\''+encodeURIComponent(nm)+'\')">×</button></div>').join('')
      : '<span class="hint">Noch keine Dateien in diesem Mieter-Ordner.</span>';
  }catch(e){ box.innerHTML='<span class="hint">Noch keine Dateien (Ordner wird beim ersten Upload angelegt).</span>'; }
}
/* Nach dem Render alle sichtbaren Dokument-Listen laden. */
function dokAutoLoad(){ if(!dokVerfuegbar()) return; document.querySelectorAll('.dok-liste[data-ei]').forEach(el=>{ dokListe(+el.dataset.ei, +el.dataset.mi); }); }
async function _dokSchreibe(ctx, file){
  const basis=await _dokBasisAktuell(true); if(!basis) throw new Error('Kein Dokumentenordner gewählt.');
  const dir=await _dokOrdner(basis,ctx.segs,true);
  const fh=await dir.getFileHandle(file.name,{create:true}); const w=await fh.createWritable(); await w.write(file); await w.close(); return file.name; }
async function dokUpload(ei,mi){
  const basis=await _dokBasisAktuell(true); if(!basis) return;
  const inp=document.createElement('input'); inp.type='file'; inp.multiple=true;
  inp.onchange=async function(){ const ctx=_dokCtx(ei,mi); const files=[...inp.files];
    for(const f of files){ try{ await _dokSchreibe(ctx,f); }catch(e){ alert('Konnte „'+f.name+'“ nicht speichern: '+((e&&e.message)||e)); } }
    dokListe(ei,mi); };
  inp.click(); }
async function dokOeffnen(ei,mi,encName){ const name=decodeURIComponent(encName); const ctx=_dokCtx(ei,mi);
  try{ const basis=await _dokBasisAktuell(false); const dir=await _dokOrdner(basis,ctx.segs,false); const fh=await dir.getFileHandle(name); const file=await fh.getFile();
    const url=URL.createObjectURL(file); window.open(url,'_blank'); setTimeout(()=>URL.revokeObjectURL(url),60000); }
  catch(e){ alert('Datei nicht gefunden – wurde sie evtl. außerhalb verschoben/gelöscht?'); } }
async function dokLoeschen(ei,mi,encName){ const name=decodeURIComponent(encName); if(!confirm('Datei „'+name+'“ wirklich löschen?')) return;
  const ctx=_dokCtx(ei,mi); try{ const basis=await _dokBasisAktuell(false); const dir=await _dokOrdner(basis,ctx.segs,false); await dir.removeEntry(name); }catch(e){}
  (ctx.m.chronik||[]).forEach(c=>{ if(c.dateien) c.dateien=c.dateien.filter(x=>x!==name); });
  if(typeof scheduleSave==='function') scheduleSave();
  dokListe(ei,mi); if(typeof renderMieterVertrag==='function') renderMieterVertrag(); }
/* US-109: Datei an einen Chronik-Eintrag anhängen (in den Mieter-Ordner schreiben + Namen merken). */
async function dokChronikAnhang(ei,mi,ci){
  const basis=await _dokBasisAktuell(true); if(!basis) return;
  const inp=document.createElement('input'); inp.type='file';
  inp.onchange=async function(){ const f=inp.files[0]; if(!f) return; const ctx=_dokCtx(ei,mi);
    try{ await _dokSchreibe(ctx,f); const c=(ctx.m.chronik||[])[ci]; if(c){ if(!c.dateien) c.dateien=[]; if(c.dateien.indexOf(f.name)<0) c.dateien.push(f.name); }
      if(typeof scheduleSave==='function') scheduleSave(); if(typeof renderMieterVertrag==='function') renderMieterVertrag(); }
    catch(e){ alert('Konnte „'+f.name+'“ nicht speichern: '+((e&&e.message)||e)); } };
  inp.click(); }
/* Ralf-Vorgabe 2026-07-08: JSON-Speicherstand ("Speichern unter") bei v2-Objekten als KIND des
   Objekt-Stammordners ablegen statt an einem beliebigen, unabhängigen Ort (showSaveFilePicker) –
   siehe speichernUnter() in view-shell.js. Legt den Stammordner bei Bedarf gleich mit an. */
async function dokJsonSpeichern(objekt, dateiname, jsonText){
  const root=await dokObjektRootSicherstellen(objekt);
  if(!root) return { ok:false };
  try{
    const fh=await root.getFileHandle(dateiname,{create:true}); const w=await fh.createWritable(); await w.write(jsonText); await w.close();
    return { ok:true, dateiname:dateiname };
  }catch(e){ alert('Konnte „'+dateiname+'" nicht speichern: '+((e&&e.message)||e)); return { ok:false }; }
}
/* Ralf-Vorgabe 2026-07-08: kompletten Dokumentenordner in einen neuen Stammordner umziehen
   (verschieben, nicht nur kopieren – Original wird nach vollständig erfolgreichem Kopieren
   geleert, damit nicht zwei Stände parallel existieren). Bricht der Kopiervorgang irgendwo ab,
   bleibt der bisherige Ordner unangetastet aktiv – es wird NIE gelöscht, bevor nicht alles
   vollständig kopiert ist. v2: zieht NUR den Ordner des aktuellen Objekts um (eigener Ort, gleicher
   Name im neuen Elternordner); v1: weiterhin der EINE globale Stammordner für alle Objekte. */
async function _dokKopiereRekursiv(quelle, ziel){
  for await (const [name, handle] of quelle.entries()){
    if(handle.kind==='directory'){
      const unterZiel=await ziel.getDirectoryHandle(name,{create:true});
      await _dokKopiereRekursiv(handle, unterZiel);
    } else {
      const datei=await handle.getFile();
      const zielHandle=await ziel.getFileHandle(name,{create:true});
      const w=await zielHandle.createWritable(); await w.write(datei); await w.close();
    }
  }
}
async function _dokLoescheInhalt(dir){
  const namen=[]; for await (const name of dir.keys()){ namen.push(name); }
  for(const name of namen){ await dir.removeEntry(name,{recursive:true}); }
}
async function dokOrdnerUmziehen(){
  if(!dokVerfuegbar()){ alert('Die Ordner-Ablage benötigt Chrome, Edge oder Brave (File System Access API).'); return; }
  const v2 = state.objekt && (+state.objekt.dokAblageVersion||0)>=2;
  const quelle = await _dokBasisAktuell(false);
  if(!quelle){ alert('Es ist noch kein Dokumentenordner gewählt – nichts zum Umziehen.'); await _dokBasisAktuell(true); return; }
  const bezeichnung = v2 ? ('„'+quelle.name+'" (Objekt „'+(state.objekt.name||state.objekt.addr)+'")') : ('„'+quelle.name+'"');
  if(!confirm('Alle Dateien aus '+bezeichnung+' in einen neuen Ordner verschieben?\n\nDanach ist der neue Ordner aktiv; der bisherige wird geleert.')) return;
  let elternOderZiel;
  try{ elternOderZiel=await window.showDirectoryPicker({mode:'readwrite'}); }catch(e){ return; /* vom Nutzer abgebrochen */ }
  if(!(await _dokPerm(quelle))){ alert('Kein Schreibzugriff auf den bisherigen Ordner '+bezeichnung+' – Umzug abgebrochen, nichts wurde verändert.'); return; }
  if(!(await _dokPerm(elternOderZiel))){ alert('Kein Schreibzugriff auf den neu gewählten Ordner „'+elternOderZiel.name+'" – Umzug abgebrochen, nichts wurde verändert.'); return; }
  try{
    let ziel=elternOderZiel;
    if(v2){
      /* v2: der gewählte Ordner ist der neue ELTERNORDNER, der Objektordner (gleicher Name wie
         bisher) wird darin neu angelegt – konsistent mit dokObjektRootSicherstellen(). */
      ziel=await elternOderZiel.getDirectoryHandle(quelle.name,{create:true});
    }
    await _dokKopiereRekursiv(quelle, ziel);
    await _dokLoescheInhalt(quelle);
    const alterName=quelle.name;
    if(v2){ _dokObjektRootCache[state.objekt.id]=ziel; await _dokObjektRootSetzen(state.objekt.id, ziel); }
    else { _dokBasis=ziel; await _dokIdbSet('basis', ziel); }
    alert('Umzug abgeschlossen: „'+alterName+'" → „'+ziel.name+'".');
    if(typeof renderMieterVertrag==='function') renderMieterVertrag();
  }catch(e){
    alert('Umzug fehlgeschlagen: '+((e&&e.message)||e)+'\n\nDer bisherige Ordner '+bezeichnung+' bleibt unverändert aktiv, es sind keine Daten verloren gegangen.');
  }
}
/* Basisordner-Handle beim Laden wiederherstellen (persistiert). */
dokBasisLaden();
