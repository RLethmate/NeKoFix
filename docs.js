/* NeKoFix – Dokumentenablage je Mieter (US-109), klassisches Script (nach calc.js/core.js/view.js).
   Speichert Fotos/Belege in ECHTEN Ordnern Objekt/Jahr/Einheit/Mieter unter einem einmal gewählten
   Basisordner (File System Access API, nur Chromium). Der Verzeichnis-Handle wird in IndexedDB
   persistiert. Kein Backend/Cloud. Anbindung an Chronik-Einträge über c.dateien (Dateinamen). */
let _dokBasis = null; /* FileSystemDirectoryHandle */
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
   dokBasisWaehlen() true/false zurück, die Aufrufer machen im selben Zug weiter – die komplette
   Ordnerstruktur (Objekt/Jahr/Einheit/Mieter) entsteht dadurch beim ersten Speichern in einem Zug
   (create:true in _dokOrdner erzeugt fehlende Segmente ohnehin schon; das eigentliche Problem war
   der abgebrochene Ablauf, nicht die fehlende Struktur selbst). */
async function dokBasisWaehlen(){
  if(!dokVerfuegbar()){ alert('Die Ordner-Ablage benötigt Chrome, Edge oder Brave (File System Access API).'); return false; }
  try{ const h=await window.showDirectoryPicker({mode:'readwrite'}); _dokBasis=h; await _dokIdbSet('basis',h); if(typeof renderMieterVertrag==='function') renderMieterVertrag(); return true; }
  catch(e){ return false; /* vom Nutzer abgebrochen */ }
}
async function _dokPerm(h){ if(!h) return false; const o={mode:'readwrite'}; try{ if((await h.queryPermission(o))==='granted') return true; return (await h.requestPermission(o))==='granted'; }catch(e){ return false; } }
function _dokCtx(ei,mi){ const e=state.einheiten[ei], m=e&&e.mv[mi]; if(!m) return null;
  const objekt=(state.objekt&&(state.objekt.name||state.objekt.addr))||'';
  const jahr=(typeof objektJahr==='function')?objektJahr(snapshot()):'';
  return { segs:nkDokPfad(objekt,jahr,e.name,m.mieter), e:e, m:m }; }
/* Wirft statt still null zurückzugeben – Aufrufer bekommen so eine konkrete, im Alert anzeigbare
   Fehlermeldung statt des immer gleichen "konnte nicht speichern" (Ralf-Feedback 2026-07-08). */
async function _dokOrdner(segs, create){
  if(!_dokBasis) throw new Error('Kein Dokumentenordner gewählt.');
  if(!(await _dokPerm(_dokBasis))) throw new Error('Kein Schreibzugriff auf den Dokumentenordner – bitte im Datei-Menü erneut auswählen.');
  let d=_dokBasis; for(const s of segs){ d=await d.getDirectoryHandle(s,{create:!!create}); } return d;
}
/* Liste der Dateien im Mieter-Ordner in den zugehörigen Container rendern. */
async function dokListe(ei,mi){ const ctx=_dokCtx(ei,mi); if(!ctx) return;
  const box=document.querySelector('.dok-liste[data-mid="'+ctx.m.id+'"]'); if(!box) return;
  if(!dokVerfuegbar()){ box.innerHTML='<span class="hint">Nur in Chrome/Edge/Brave verfügbar.</span>'; return; }
  if(!_dokBasis){ box.innerHTML='<span class="hint">Noch kein Dokumentenordner gewählt.</span>'; return; }
  try{ const dir=await _dokOrdner(ctx.segs,false);
    const namen=[]; for await (const entry of dir.values()){ if(entry.kind==='file') namen.push(entry.name); } namen.sort();
    box.innerHTML = namen.length
      ? namen.map(nm=>'<div class="dok-item"><span>'+esc(nm)+'</span> <button type="button" class="linklike" onclick="dokOeffnen('+ei+','+mi+',\''+encodeURIComponent(nm)+'\')">öffnen</button> <button type="button" class="row-del" title="Datei löschen" onclick="dokLoeschen('+ei+','+mi+',\''+encodeURIComponent(nm)+'\')">×</button></div>').join('')
      : '<span class="hint">Noch keine Dateien in diesem Mieter-Ordner.</span>';
  }catch(e){ box.innerHTML='<span class="hint">Noch keine Dateien (Ordner wird beim ersten Upload angelegt).</span>'; }
}
/* Nach dem Render alle sichtbaren Dokument-Listen laden. */
function dokAutoLoad(){ if(!dokVerfuegbar()) return; document.querySelectorAll('.dok-liste[data-ei]').forEach(el=>{ dokListe(+el.dataset.ei, +el.dataset.mi); }); }
async function _dokSchreibe(ctx, file){ const dir=await _dokOrdner(ctx.segs,true);
  const fh=await dir.getFileHandle(file.name,{create:true}); const w=await fh.createWritable(); await w.write(file); await w.close(); return file.name; }
async function dokUpload(ei,mi){
  if(!_dokBasis){ const ok=await dokBasisWaehlen(); if(!ok) return; }
  const inp=document.createElement('input'); inp.type='file'; inp.multiple=true;
  inp.onchange=async function(){ const ctx=_dokCtx(ei,mi); const files=[...inp.files];
    for(const f of files){ try{ await _dokSchreibe(ctx,f); }catch(e){ alert('Konnte „'+f.name+'“ nicht speichern: '+((e&&e.message)||e)); } }
    dokListe(ei,mi); };
  inp.click(); }
async function dokOeffnen(ei,mi,encName){ const name=decodeURIComponent(encName); const ctx=_dokCtx(ei,mi);
  try{ const dir=await _dokOrdner(ctx.segs,false); const fh=await dir.getFileHandle(name); const file=await fh.getFile();
    const url=URL.createObjectURL(file); window.open(url,'_blank'); setTimeout(()=>URL.revokeObjectURL(url),60000); }
  catch(e){ alert('Datei nicht gefunden – wurde sie evtl. außerhalb verschoben/gelöscht?'); } }
async function dokLoeschen(ei,mi,encName){ const name=decodeURIComponent(encName); if(!confirm('Datei „'+name+'“ wirklich löschen?')) return;
  const ctx=_dokCtx(ei,mi); try{ const dir=await _dokOrdner(ctx.segs,false); await dir.removeEntry(name); }catch(e){}
  (ctx.m.chronik||[]).forEach(c=>{ if(c.dateien) c.dateien=c.dateien.filter(x=>x!==name); });
  if(typeof scheduleSave==='function') scheduleSave();
  dokListe(ei,mi); if(typeof renderMieterVertrag==='function') renderMieterVertrag(); }
/* US-109: Datei an einen Chronik-Eintrag anhängen (in den Mieter-Ordner schreiben + Namen merken). */
async function dokChronikAnhang(ei,mi,ci){
  if(!_dokBasis){ const ok=await dokBasisWaehlen(); if(!ok) return; }
  const inp=document.createElement('input'); inp.type='file';
  inp.onchange=async function(){ const f=inp.files[0]; if(!f) return; const ctx=_dokCtx(ei,mi);
    try{ await _dokSchreibe(ctx,f); const c=(ctx.m.chronik||[])[ci]; if(c){ if(!c.dateien) c.dateien=[]; if(c.dateien.indexOf(f.name)<0) c.dateien.push(f.name); }
      if(typeof scheduleSave==='function') scheduleSave(); if(typeof renderMieterVertrag==='function') renderMieterVertrag(); }
    catch(e){ alert('Konnte „'+f.name+'“ nicht speichern: '+((e&&e.message)||e)); } };
  inp.click(); }
/* Ralf-Vorgabe 2026-07-08: kompletten Dokumentenordner in einen neuen Stammordner umziehen
   (verschieben, nicht nur kopieren – Original wird nach vollständig erfolgreichem Kopieren
   geleert, damit nicht zwei Stände parallel existieren). Bricht der Kopiervorgang irgendwo ab,
   bleibt der bisherige Ordner unangetastet aktiv – es wird NIE gelöscht, bevor nicht alles
   vollständig kopiert ist. */
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
  if(!_dokBasis){ alert('Es ist noch kein Dokumentenordner gewählt – nichts zum Umziehen.'); await dokBasisWaehlen(); return; }
  if(!confirm('Alle Dateien aus „'+_dokBasis.name+'" in einen neuen Ordner verschieben?\n\nDanach ist der neue Ordner der aktive Dokumentenordner; der bisherige wird geleert.')) return;
  let ziel;
  try{ ziel=await window.showDirectoryPicker({mode:'readwrite'}); }catch(e){ return; /* vom Nutzer abgebrochen */ }
  if(!(await _dokPerm(_dokBasis))){ alert('Kein Schreibzugriff auf den bisherigen Ordner „'+_dokBasis.name+'" – Umzug abgebrochen, nichts wurde verändert.'); return; }
  if(!(await _dokPerm(ziel))){ alert('Kein Schreibzugriff auf den neuen Ordner „'+ziel.name+'" – Umzug abgebrochen, nichts wurde verändert.'); return; }
  try{
    await _dokKopiereRekursiv(_dokBasis, ziel);
    await _dokLoescheInhalt(_dokBasis);
    const alterName=_dokBasis.name;
    _dokBasis=ziel; await _dokIdbSet('basis', ziel);
    alert('Umzug abgeschlossen: „'+alterName+'" → „'+ziel.name+'".');
    if(typeof renderMieterVertrag==='function') renderMieterVertrag();
  }catch(e){
    alert('Umzug fehlgeschlagen: '+((e&&e.message)||e)+'\n\nDer bisherige Ordner „'+_dokBasis.name+'" bleibt unverändert aktiv, es sind keine Daten verloren gegangen.');
  }
}
/* Basisordner-Handle beim Laden wiederherstellen (persistiert). */
dokBasisLaden();
