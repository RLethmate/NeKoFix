/* view-init.js (US-118 AC-4) – Initialisierung. MUSS als letzte view-*-Datei geladen werden,
   da hier die Render-Funktionen aller Reiter aufgerufen werden. */

/* ---------- Init ---------- */
loadState();
if(!objekte.length){ objekte=[snapshot()]; aktivIdx=0; } /* Erststart: Demodaten als erstes Objekt */
if(state.objekt && !state.objekt.name) state.objekt.name=state.objekt.addr||""; /* US-65: Objektname (Header) aus Adresse vorbelegen, danach stabil */
ensureIds();
/* US-84: Nur wenn keine Speicherpunkte vorliegen (Erststart/Legacy), den Anfangsstand – nach
   Backfill/ensureIds – als gespeichert festlegen. Vorhandene Speicherpunkte bleiben unangetastet,
   damit „ungespeicherte Änderungen" einen Reload überstehen. */
if(savedSigs.length!==objekte.length){ objekte[aktivIdx]=snapshot(); savedSigs=objekte.map(d=>nkSig(d)); }
if(savedData.length!==objekte.length){ savedData=objekte.map(d=>nkClone(d)); } /* Speicher: gespeicherte Daten je Objekt baseline (fürs Verwerfen) */
renderObjTitle();
(function(){ const v=document.getElementById('app_version'); if(v) v.textContent=APP_VERSION+' · '+BUILD_DATE; })();
(function(){ if(new URLSearchParams(location.search).has('debug')){ const b=document.getElementById('btn_testdaten'); if(b) b.hidden=false; } })();
(function(){ const a=document.getElementById('abr_status'); if(a) a.value=state.abrechnungStatus; })();
fillObjektKopf();
initNav(); /* US-54: gespeicherten Klapp-Zustand der Lasche anwenden */
applyDokAnker(); /* US-80: gespeicherten Einklapp-Zustand der Dokument-Anker anwenden */
renderEinheiten(); renderVoraus(); renderKosten(); renderStepper(); go(0);
neuerVerlauf(); /* US-82: Verlauf-Baseline auf den geladenen Anfangszustand setzen */
saveState();
updateSaveStatus(); /* US-84: Anfangsstatus „✓ Gespeichert" anzeigen */
/* US-54: Versand-Ampel live aktualisieren, sobald sich Eingaben ändern. */
document.addEventListener('input', renderNavPlausi);
document.addEventListener('change', renderNavPlausi);
