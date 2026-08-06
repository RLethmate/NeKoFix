/* view-init.js (US-118 AC-4) – Initialisierung. MUSS als letzte view-*-Datei geladen werden,
   da hier die Render-Funktionen aller Reiter aufgerufen werden. */

/* ---------- Init ---------- */
const _geladen=loadState();
loadBriefkopf(); /* US-136: Logo/Textvorlagen – global, unabhängig vom objektbezogenen Stand */
/* Website-Einstieg (Hero-Buttons "Kostenlos ausprobieren"/"Demodaten laden"): ?start=leer liefert
   beim ECHTEN Erststart (kein gespeicherter Stand) ein leeres Objekt statt der Demodaten; ohne
   Parameter oder ?start=demo bleibt das bisherige Verhalten (Demodaten) unverändert. Wirkt nur,
   solange noch nichts gespeichert ist – bestehende Daten eines wiederkehrenden Besuchs bleiben
   unberührt, egal welcher Parameter dabei ist. */
if(!objekte.length){
  if(new URLSearchParams(location.search).get('start')==='leer'){ ladeDaten(makeFreshDaten()); }
  objekte=[snapshot()]; aktivIdx=0; /* Erststart: Demodaten (Default) oder frisches Objekt als erstes Objekt */
}
ui.ersterStart=!_geladen; /* UX-Review 2026-07-15 (Kano): allererster Start (Beispieldaten) → Schnellstart-Hinweis zeigen */
if(state.objekt && !state.objekt.name) state.objekt.name=state.objekt.addr||""; /* US-65: Objektname (Header) aus Adresse vorbelegen, danach stabil */
ensureIds();
/* US-84: Nur wenn keine Speicherpunkte vorliegen (Erststart/Legacy), den Anfangsstand – nach
   Backfill/ensureIds – als gespeichert festlegen. Vorhandene Speicherpunkte bleiben unangetastet,
   damit „ungespeicherte Änderungen" einen Reload überstehen. */
if(savedSigs.length!==objekte.length){ objekte[aktivIdx]=snapshot(); savedSigs=objekte.map(d=>nkSig(d)); }
if(savedData.length!==objekte.length){ savedData=objekte.map(d=>nkClone(d)); } /* Speicher: gespeicherte Daten je Objekt baseline (fürs Verwerfen) */
renderObjTitle();
(function(){ const v=document.getElementById('app_version'); if(v) v.textContent=APP_VERSION+' · '+BUILD_DATE; })();
(function(){ const j=document.getElementById('copyright_jahr'); if(j) j.textContent=new Date().getFullYear(); })(); /* US-125 */
(function(){ if(new URLSearchParams(location.search).has('debug')){ const b=document.getElementById('btn_testdaten'); if(b) b.hidden=false;
  const t=document.getElementById('btn_techem_import'); if(t) t.hidden=false; /* Ralf-Vorgabe 2026-07-10: experimentell, s. index.html */ } })();
(function(){ const a=document.getElementById('abr_status'); if(a) a.value=state.abrechnungStatus; })();
fillObjektKopf();
/* US-136: renderBriefkopf() NICHT hier aufrufen – pdf.js (buildTenantPdf/buildMieterhoehungPdf
   für die Live-Vorschau) lädt laut Skriptliste in index.html ERST NACH view-init.js. RENDERERS[9]
   rendert den Bereich, sobald der Reiter tatsächlich aufgerufen wird (dann ist pdf.js längst da). */
initNav(); /* US-54: gespeicherten Klapp-Zustand der Lasche anwenden */
applyDokAnker(); /* US-80: gespeicherten Einklapp-Zustand der Dokument-Anker anwenden */
renderEinheiten(); renderVoraus(); renderKosten(); renderStepper(); go(0);
renderSchnellstart(); /* UX-Review 2026-07-15 (Kano): läuft auch in go(0), hier explizit fürs Erststart-Flag */
zeigeWillkommen(); /* Willkommens-Splash: bei jedem Start zeigen (Ralf-Vorgabe 2026-08-06), nicht mehr an ui.ersterStart gekoppelt */
neuerVerlauf(); /* US-82: Verlauf-Baseline auf den geladenen Anfangszustand setzen */
saveState();
updateSaveStatus(); /* US-84: Anfangsstatus „✓ Gespeichert" anzeigen */
/* US-54: Versand-Ampel live aktualisieren, sobald sich Eingaben ändern. */
document.addEventListener('input', renderNavPlausi);
document.addEventListener('change', renderNavPlausi);
