/* view.js – Render-/View-Schicht und Init (US-33c).
   Geladen NACH calc.js und core.js, VOR pdf.js. Enthält UI-Konstanten, Render-
   Funktionen, Event-Handler und den Init-Block. Nutzt state/store/Persistenz aus core.js. */

/* State, Store, Persistenz: ausgelagert nach core.js (US-33b). `state`, `objekte`,
   `aktivIdx`, `store`, `commit`, `saveState/loadState` u. a. sind dort global definiert. */
/* US-81: „Mieter & Vertrag" als Index 7 angehängt (keine Umnummerierung der bestehenden
   data-step/go()-Indizes); die Anzeige-Reihenfolge steuert STEP_GROUPS. */
/* US-122: Index 0 hieß "Objekt", was in der neuen Gruppierung mit der Gruppenüberschrift "Objekt"
   kollidiert hätte; Index 5 "Abrechnung" kollidierte ebenso mit der Gruppe "Abrechnung" (entspricht
   jetzt der echten Panel-Überschrift "Fertige Abrechnung").
   US-123: "Vermieter & Zahlungsangaben" als eigener Reiter (Index 9) aus Index 0 herausgezogen;
   Index 0 heißt wieder "Gebäude & Einheiten" (entspricht seinem verbliebenen Inhalt), keine
   Umnummerierung bestehender data-step/go()-Indizes (wie bei Index 7 seinerzeit). */
/* Ralf-Vorgabe 2026-07-13: "Berechnung" war zu generisch (klang nach Gesamtmiete, dabei geht es hier
   ausschließlich um die Nebenkosten: Kostenanteil ./. Vorauszahlung = Saldo + Anpassungsvorschlag für
   die künftige Vorauszahlung). Umbenannt in "Nebenkosten-Saldo". */
/* Ralf-Vorgabe 2026-07-13: "Mietspiegel" als Index 10 angehängt (Muster US-81/US-123: kein
   Umnummerieren, Position über STEP_GROUPS). Bettet den RentMap-Prototyp per iframe ein.
   Ralf-Vorgabe 2026-07-15: nicht mehr Debug-only, für alle Nutzer sichtbar (s. DEBUG_ONLY_STEPS). */
/* Ralf-Vorgabe 2026-07-31: "Steuer & Belege" als Index 11 angehängt (gleiches Muster wie
   Mietspiegel oben – kein Umnummerieren, Position über STEP_GROUPS). Nimmt "Sonstige Ausgaben"
   und die reiterübergreifende Beleg-Übersicht aus dem Kosten-Reiter auf (US-135: NK-Abrechnung
   und steuerliche Beleg-Dokumentation sind zeitlich/thematisch getrennte Anwendungsfälle). */
const STEPS = ["Gebäude & Einheiten","Vorauszahlung (Soll)","Heizung","Kosten","Nebenkosten-Saldo","Fertige Abrechnung","Zahlungen (Ist)","Mieter & Vertrag","Termine & Wartung","Vermieter & Zahlungsangaben","Mietspiegel","Steuer & Belege"];
/* Ralf-Vorgabe 2026-07-14: "bis aktueller Monat" ist jetzt die Voreinstellung (US-83 – Monate
   sollen bis zum echten aktuellen Monat sichtbar sein, nicht nur bis zum Ende des
   Abrechnungszeitraums; passendes Markup dazu in index.html, s. #zv_faellig/#zahl_laeuft_hint). */
const ui = { current:0, activeMieter:0, vorausModus:"monatlich", zeigeVorjahr:false, nurUngeprueft:false, expandedKosten:new Set(), expandedHeizZeit:new Set(), expandedAutomatik:new Set(), expandedChronik:new Set(), navPlausiOpen:false, drag:null, zahlBisAktuell:true, csvImport:{ buchungen:[], dateiname:"", fehler:null }, csvAutoProtokoll:false, termineAnsicht:"faellig", ersterStart:false }; /* AC-3 (US-118): gebündelter UI-/Sitzungs-State. expandedMV entfaellt (Mieter&Vertrag-Layout-Story 2026-07-07): Kaltmiete/Anrede/E-Mail immer sichtbar, kein Vertrag-Aufklapper mehr; expandedChronik neu fuer die "┃ Chronik"-Leiste. */

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
  if(val==='verbrauch') ui.expandedKosten.add(k.id); /* US-57: Verbrauch-Eingabe gleich sichtbar */
  store.setKostenVorschlagFeld(idx,'schluessel', false); /* manuelle Wahl bestätigt einen offenen Techem-Vorschlag zugleich */
  renderKosten();
}
function kostenSchluesselVorschlagUebernehmen(idx){ store.setKostenVorschlagFeld(idx,'schluessel', false); renderKosten(); }
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
const STATUS_FARBE={geschaetzt:"var(--nachzahlung)",vorlaeufig:"#d99a2b",geprueft:"var(--accent)"}; /* US-100: geschätzt = rot (unsicher), vorläufig = gelb, geprüft = grün */
const VERFUEGBAR_FARBE={fehlt:"var(--nachzahlung)",kommt:"#d99a2b",vorhanden:"var(--accent)"};
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
function alleMV(){ const out=[]; state.einheiten.forEach((e,ei)=>{ (e.mv||[]).forEach((m,mi)=>{ out.push({e,m,ei,mi,za:nkZeitanteil(m.von,nkMvEnde(m,state.objekt.bis),state.objekt.von,state.objekt.bis)}); }); }); return out; }
function leerstandZa(e){ const s=(e.mv||[]).reduce((a,m)=>a+nkZeitanteil(m.von,nkMvEnde(m,state.objekt.bis),state.objekt.von,state.objekt.bis),0); return Math.max(0,1-s); }

/* ---------- Stepper (US-54: seitliche Lasche, Gruppen, Kürzel, Versand-Ampel) ---------- */
const STEP_ABBR = ["GE","VZ","HE","KO","NS","AB","ZA","MV","TW","VM","MS","SB"];
/* US-122: themenbasierte Bereiche statt "Abrechnung erstellen"/"Nachverfolgung" (erzwungene
   Assistenten-Reihenfolge) statt strikter Reihenfolge. Siehe UX-Review-Navigation-und-Workflow.md.
   "Vorauszahlung (Soll)" bleibt bewusst inhaltlich unverändert (weiterhin editierbar) - der Umbau
   zur reinen Übersicht hängt am noch nicht gebauten Mieterhöhungs-Konzept.
   US-123: Vermieter & Zahlungsangaben (Index 9) zwischen Gebäude und Mieter & Vertrag einsortiert -
   entspricht der Objekt-Reihenfolge aus dem Dummy (Gebäude → Vermieter → Mieter & Vertrag). */
/* Ralf-Vorgabe 2026-07-13: Kosten direkt vor Fertige Abrechnung (Drag&Drop-Reihenfolge dort wirkt
   sich unmittelbar, nur einen Reiter weiter, auf das fertige Dokument aus) - dafür Nebenkosten-Saldo
   aus der Abrechnungs-Gruppe herausgezogen (nutzt die VEREINBARTE Vorauszahlung, nicht die
   tatsächlichen Zahlungseingänge - s. Rechtshinweis im Reiter selbst - deshalb bewusst NICHT mit
   „Zahlungen (Ist)" verschmolzen, sondern nur thematisch gruppiert). „Laufende Verwaltung" entfällt
   als eigene Rubrik (Termine & Wartung wandert zu Objekt) - ein Ein-Reiter-Rest wäre unausgewogen. */
const STEP_GROUPS = [
  { titel:"Objekt",              steps:[0,10,9,7,8] },
  { titel:"Abrechnung",          steps:[2,3,5] },
  { titel:"Zahlungen & Saldo",   steps:[1,6,4] },
  /* US-135: eigene Gruppe ganz unten – bewusst NICHT Teil der Abrechnungs-Kette, sondern ein
     zeitlich/thematisch getrennter, laufender Anwendungsfall (Beleg-Sammlung fürs Finanzamt). */
  { titel:"Steuer & Belege",     steps:[11] }
];
/* Nur im Debug-Modus sichtbare Reiter. Gleiche Prüfung wie nkMvDebugAktiv (view-mieter.js):
   explizit ?debug=1, nicht bloß Anwesenheit von ?debug. Aktuell leer - Mietspiegel (Index 10)
   ist seit Ralf-Vorgabe 2026-07-15 für alle Nutzer sichtbar, kein Reiter mehr debug-only. */
const DEBUG_ONLY_STEPS = new Set([]);
function nkStepDebugAktiv(){ return /[?&]debug=1(&|$)/i.test(location.search); }
function renderStepper(){
  const el = document.getElementById('stepper'); if(!el) return; el.innerHTML='';
  /* US-122/Ralf-Feedback 2026-07-06: kein Nummern-Kreis mehr (freie Navigation, keine erzwungene
     Reihenfolge) - .n ist ein reiner Punkt wie im Dummy-Vorschlag. Die „done"-Markierung (Position
     vor dem aktiven Schritt) implizierte trotzdem noch eine Reihenfolge/einen Fortschrittsbalken -
     entfernt; nur der jeweils aktive Punkt wird hervorgehoben, wie bei den anderen Menüpunkten. */
  STEP_GROUPS.forEach(g=>{
    const gt=document.createElement('div'); gt.className='nav-group'; gt.textContent=g.titel; el.appendChild(gt);
    g.steps.forEach(i=>{
      if(DEBUG_ONLY_STEPS.has(i) && !nkStepDebugAktiv()) return;
      const d=document.createElement('div');
      d.className='step'+(i===ui.current?' active':'');
      d.title=STEPS[i];
      d.innerHTML='<span class="n"></span><span class="lbl">'+STEPS[i]+'</span><span class="abbr">'+STEP_ABBR[i]+'</span>';
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
/* US-80: Dokument-Anker – Info-Lasche je Schritt, global gemerkter Einklapp-Zustand
   (eigener LS-Key, objektübergreifend). Einmal zugeklappt bleibt sie überall zu. */
const DOK_KEY="nekofix-dok-zu";
function dokZu(){ try{ return localStorage.getItem(DOK_KEY)==="1"; }catch(e){ return false; } }
function applyDokAnker(){ document.body.classList.toggle('dok-zu', dokZu()); }
function toggleDokAnker(){ const v=!dokZu(); try{ localStorage.setItem(DOK_KEY, v?"1":"0"); }catch(e){} applyDokAnker(); }
/* US-54: dauerhaft sichtbare Versand-/Plausi-Ampel; bereit = keine blockierenden Fehler. */
function renderNavPlausi(){
  const box=document.getElementById('nav_plausi'); if(!box) return;
  const r=nkPlausibilitaet(state);
  const fehler=r.punkte.filter(p=>p.level==='fehler').length;
  const warn=r.punkte.filter(p=>p.level==='warn').length;
  const kurz=r.bereit ? '✓ Versandfertig' : (fehler+' offene'+(fehler===1?'r Punkt':' Punkte'));
  const symMap={ok:'✓',warn:'!',fehler:'✗'};
  let html='<button class="nav-plausi-head'+(ui.navPlausiOpen?' open':'')+' '+(r.bereit?'ok':'bad')+'" onclick="toggleNavPlausi()" title="Plausibilitätsprüfung – klicken für Details">'+
    '<span class="dot"></span><span class="np-label">'+kurz+'</span><span class="np-caret">'+(ui.navPlausiOpen?'▴':'▾')+'</span></button>';
  if(ui.navPlausiOpen){
    html+='<div class="nav-plausi-list">'+r.punkte.map(p=>'<div class="plausi-item '+p.level+'">'+symMap[p.level]+' '+p.text+'</div>').join('')+'</div>';
  } else if(warn>0){
    html+='<div class="nav-plausi-sub">'+warn+' Hinweis'+(warn===1?'':'e')+'</div>';
  }
  box.innerHTML=html;
}
function toggleNavPlausi(){
  const s=document.getElementById('sidenav');
  if(s && s.classList.contains('collapsed')){ s.classList.remove('collapsed'); try{ localStorage.setItem(NAV_KEY,'0'); }catch(e){} }
  ui.navPlausiOpen=!ui.navPlausiOpen; renderNavPlausi();
}
/* AC-1 (US-118): EINE Schritt->Render-Zuordnung für go() und renderAll(), damit ein neuer Reiter
   nur an einer Stelle registriert wird (vorher doppelt und inkonsistent gepflegt).
   US-118 AC-4: Die Render-Funktionen liegen seit dem view.js-Split in eigenen Dateien
   (view-mieter/-kosten/-heizung/-abrechnung/-termine.js), die NACH view-shell.js geladen
   werden. Darum werden sie hier verzögert (Arrow) statt direkt referenziert – so ist die
   Tabelle unabhängig von der Lade-/Deklarationsreihenfolge und erst zur Aufrufzeit gebunden. */
const RENDERERS = {
  0: () => renderEinheiten(),     /* Objekt/Einheiten */
  7: () => renderMieterVertrag(), /* Mieter & Vertrag */
  1: () => renderVoraus(),        /* Vorauszahlung */
  2: () => renderHeizung(),       /* Heizung */
  3: () => renderKosten(),        /* Kosten */
  4: () => computeView(),         /* Berechnung */
  5: () => renderDoc(),           /* Abrechnung */
  6: () => renderZahlungen(),     /* Zahlungen */
  8: () => renderTermine(),       /* Termine & Wartung */
  /* Vermieter & Zahlungsangaben (Index 9) hat kein eigenes Render, ist statisches Markup –
     autoGrow(z_frist) muss aber erneut laufen, sobald das Panel sichtbar wird: beim initialen
     fillObjektKopf() (Panel noch display:none) liefert scrollHeight einen falschen (zu kleinen)
     Wert, das Feld wirkte dadurch wie leer/kollabiert (Ralf-Fund 2026-07-06). */
  9: () => { const el=document.getElementById('z_frist'); if(el) autoGrow(el); },
  /* Mietspiegel (Index 10): RentMap-iframe erst beim ersten Öffnen laden, damit der
     externe Prototyp nicht bei jedem App-Start angefragt wird.
     Quelle: bevorzugt das mit ausgelieferte statische Bundle unter mietspiegel/ (Produktiv-
     Einbettung; einmal per HEAD erkannt und in nkMsBase gemerkt), nur wenn es fehlt, der
     Dev-Server aus data-src (localhost:3001).
     Die Objektadresse (state.objekt.addr) wird als ?address=... mitgegeben - RentMap fliegt sie
     automatisch an; embed=1 startet dort mit eingeklappter Einstellungs-Lasche. Der src wird nur
     bei geänderten Parametern neu gesetzt, sonst würde das iframe bei jedem Reiterwechsel neu laden. */
  10: () => {
    const f=document.getElementById('ms_frame'); if(!f) return;
    const adr=((state.objekt&&state.objekt.addr)||'').trim();
    /* Wohnfläche + aktuelle Grundmiete der ersten Einheit mit gültigen Werten mitgeben
       (jüngstes Mietverhältnis = letzter mv-Eintrag) - RentMap belegt damit "Mein Objekt"
       vor und zeigt das Spannen-Urteil ohne weitere Eingaben. */
    let size=0, rent=0;
    for(const e of (state.einheiten||[])){
      const m=(e.mv||[])[ (e.mv||[]).length-1 ];
      if(e.flaeche>0 && m && m.grundmiete>0){ size=e.flaeche; rent=m.grundmiete; break; }
    }
    const params='?embed=1'
      +(adr?'&address='+encodeURIComponent(adr):'')
      +(size&&rent?'&size='+size+'&rent='+rent:'');
    const apply=(base)=>{ const src=base+params; if(f.getAttribute('src')!==src) f.src=src; };
    if(nkMsBase){ apply(nkMsBase); return; }
    /* Verzeichnis-URL mit Slash: nur so bleiben die relativen Pfade des Bundles intakt
       (z. B. redirectet "serve" .../index.html auf eine Extension-lose URL ohne Slash). */
    fetch('mietspiegel/',{method:'HEAD'})
      .then(r=>{ nkMsBase = r.ok ? 'mietspiegel/' : f.dataset.src; apply(nkMsBase); })
      .catch(()=>{ nkMsBase=f.dataset.src; apply(nkMsBase); });
  },
  11: () => renderSteuerBelege(), /* US-135: Sonstige Ausgaben + reiterübergreifende Beleg-Übersicht */
};
/* Erkannte RentMap-Quelle (eingebettetes Bundle oder Dev-Server), einmal pro Sitzung. */
let nkMsBase=null;
function go(i){
  /* Sichtbarkeit ZUERST umschalten, dann rendern: RENDERERS[9] misst scrollHeight (autoGrow für
     z_frist) – auf einem noch display:none-Panel liefert das einen falschen (zu kleinen) Wert
     (Ralf-Fund 2026-07-06, sichtbares Symptom: Zahlungsfrist-Feld wirkte leer/kollabiert). */
  ui.current=i;
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active', +p.dataset.step===i));
  /* US-135: der CSV-Import-Aktionsstreifen ist reiterunabhängig (dieselbe Übernahme betrifft
     Kostenarten, Sonstige Ausgaben UND Mieter-Zahlungen), aber nur sinnvoll sichtbar, solange
     einer der beiden Reiter aktiv ist, die ihn tatsächlich nutzen. */
  const streifen=document.getElementById('beleg_aktionsstreifen'); if(streifen) streifen.hidden = !(i===3 || i===11);
  const r=RENDERERS[i]; if(r) r();
  renderStepper();
  renderSchnellstart(); /* UX-Review 2026-07-15 (Kano): Sichtbarkeits-Bedingung (frisches Objekt) bei jedem Reiterwechsel neu prüfen */
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ---------- Step 1 ---------- */
function fillObjektKopf(){
  const set = (id,v)=>{ const el=document.getElementById(id); if(el) el.value = v||''; };
  /* Ralf-Feedback 2026-07-06: Straße/PLZ/Ort getrennte Felder statt einem Freitextfeld – Anzeige
     wird aus der weiterhin kombinierten Adresszeile abgeleitet (nkSplitAdresse), s. calc.js. */
  const objSpl = nkSplitAdresse(state.objekt.addr);
  set('obj_strasse', objSpl.strasse); set('obj_plz', objSpl.plz); set('obj_ort', objSpl.ort);
  set('obj_von', state.objekt.von); set('obj_bis', state.objekt.bis);
  /* US-51: Vermieter & Zahlungsangaben */
  const z = state.zahlung || {};
  const zSpl = nkSplitAdresse(z.anschrift);
  set('z_empfaenger', z.empfaenger);
  set('z_strasse', zSpl.strasse); set('z_plz', zSpl.plz); set('z_ort', zSpl.ort);
  set('z_iban', z.iban); set('z_bic', z.bic); set('z_frist', z.frist);
  const frist=document.getElementById('z_frist'); if(frist) autoGrow(frist);
  updateIbanHint();
  /* Techem-Import 2026-07-11: bereits vorhandene Vermieter-Angaben werden beim Import nicht still
     überschrieben, sondern als unbestätigter Vorschlag markiert (WISO-Stil blaues Eck, s. US-90 /
     .vorschlag-tri) – z.vorschlag wird von techemUebernehmen() gesetzt. */
  const zv = z.vorschlag || {};
  setFeldVorschlagUi('z_empfaenger_wrap', zv.empfaenger, 'Vermieter-Name aus Techem-Import übernehmen – bitte prüfen, dann anklicken (oder den Wert anpassen)', ()=>zVorschlagUebernehmen('empfaenger','z_empfaenger_wrap'));
  setFeldVorschlagUi('z_strasse_wrap', zv.anschrift, 'Vermieter-Anschrift aus Techem-Import übernehmen – bitte prüfen (Straße/PLZ/Ort), dann anklicken', ()=>zVorschlagUebernehmen('anschrift','z_strasse_wrap'));
  setFeldVorschlagUi('z_iban_wrap', zv.iban, 'IBAN aus Techem-Import übernehmen – bitte prüfen, dann anklicken (oder den Wert anpassen)', ()=>zVorschlagUebernehmen('iban','z_iban_wrap'));
}
/* Generisches WISO-Stil-Eck (US-90): zeigt/entfernt das blaue Dreieck oben rechts in `wrapId` und
   verdrahtet den Klick-Handler. Ursprünglich nur für Vorjahres-Kosten (view-kosten.js), seit
   2026-07-11 auch für Techem-Import-Vorschläge (Vermieter-Felder, Mieter-Name) genutzt. */
function setFeldVorschlagUi(wrapId, aktiv, titel, onAccept){
  const wrap=document.getElementById(wrapId); if(!wrap) return;
  wrap.classList.toggle('unbestaetigt', !!aktiv);
  let btn=wrap.querySelector('.vorschlag-tri');
  if(aktiv){
    if(!btn){ btn=document.createElement('button'); btn.type='button'; btn.className='vorschlag-tri'; wrap.appendChild(btn); }
    btn.title=titel; btn.onclick=onAccept;
  } else if(btn){ btn.remove(); }
}
function zVorschlagUebernehmen(field, wrapId){ store.setZahlungVorschlagFeld(field,false); setFeldVorschlagUi(wrapId,false); }
/* Bei manueller Eingabe gilt der Vorschlag als abgelehnt/übernommen – Dreieck verschwindet. */
function zVorschlagAbgelehnt(field, wrapId){ if(state.zahlung && state.zahlung.vorschlag && state.zahlung.vorschlag[field]) zVorschlagUebernehmen(field, wrapId); }
function updateIbanHint(){
  const el=document.getElementById('z_iban_hint'); if(!el) return;
  const iban=(state.zahlung&&state.zahlung.iban)||'';
  if(!iban.trim()){ el.textContent=''; el.className='iban-hint'; return; }
  if(nkIbanGueltig(iban)){ el.textContent='✓ IBAN gültig'; el.className='iban-hint ok'; }
  else { el.textContent='⚠ IBAN ungültig (Prüfziffer/Länge)'; el.className='iban-hint bad'; }
}
/* US-59: read-only Vorjahr-Feld (blau kursiv) für den Vergleich. val null/leer -> "–". */
function vjFeld(val){
  const has = val!=null && val!=='';
  return '<input class="short vj-field'+(has?'':' vj-none')+'" type="text" readonly tabindex="-1" title="Vorjahreswert (zum Vergleich)" value="'+(has?val:'–')+'">';
}
/* US-59: Titel-Zusatz „ aus Vorjahr JJJJ (Alt+v)" (blau kursiv), wenn der Vergleich aktiv ist und ein
   Vorjahr existiert; sonst leer. Wird in den Reiter-Titeln gesetzt (kein Layout-Sprung). */
function vjTitelSuffix(){
  if(!ui.zeigeVorjahr) return '';
  const vj=nkFindVorjahr(objekte, aktivIdx);
  return vj? ' aus Vorjahr '+(nkObjektJahr(vj)||'')+' (Alt+v)' : ''; /* führendes geschütztes Leerzeichen, sonst verschluckt das Rendering den Abstand */
}
function setVjTitel(id){ const el=document.getElementById(id); if(el) el.textContent=vjTitelSuffix(); }

/* US-81: Objekt-Reiter zeigt nur noch die physischen Einheiten (Name, m², Personen). */

/* ---------- App-Rahmen: Version, Datei-Menü, Speichern, Objektverwaltung (US-118 AC-4) ---------- */
/* PDF-Export (US-18) ausgelagert nach pdf.js (US-33). */

/* ---------- Version / Header (US-30) ---------- */
/* Bei jedem Release pflegen: APP_VERSION hochzählen, BUILD_DATE auf das Deploy-Datum setzen. */
/* Versionsschema v-x.y.z: nur x (Release) wird manuell gepflegt – bei Erstauslieferung APP_MAJOR
   auf "1" setzen. y = Gesamtzahl der Commits (vom Deploy automatisch gesetzt), z = 0.
   APP_VERSION und BUILD_DATE werden beim Deploy automatisch gestempelt (siehe pages.yml). */
const APP_MAJOR="0";
/* Lokaler Test-Stempel: pages.yml überschreibt beides beim Deploy (sed-Ersetzung), lokal (file://)
   läuft dieser Schritt nie. Damit sich beim lokalen Testen sofort erkennen lässt, welcher Branch/
   Stand gerade offen ist (statt eines immer gleichen Platzhalters), hier den Branch-/Story-Namen
   + heutiges Datum eintragen, sobald ein Stand zum lokalen Testen ansteht. */
const APP_VERSION="v-0.0.0 (lokal: us-135-steuer-belege-reiter)";
const BUILD_DATE="2026-07-31";
function toggleDateiMenu(forceClose){ const m=document.getElementById('datei_menu'); if(!m) return; m.hidden = forceClose ? true : !m.hidden; const s=document.getElementById('mru_sub'); if(s) s.hidden=true; /* US-91: Submenü „Zuletzt verwendet" beim Öffnen/Schließen zurücksetzen */ }
document.addEventListener('click', e=>{ const m=document.getElementById('datei_menu'); if(m && !m.hidden && !e.target.closest('.menu')){ m.hidden=true; const s=document.getElementById('mru_sub'); if(s) s.hidden=true; } });

/* ---------- View: Objektwahl, Render-Orchestrierung, Header ---------- */
/* STORAGE_KEY, ensureIds, snapshot, ladeDaten, makeFreshDaten, objektLabel, objSignatur,
   objektJahr, saveState, loadState, resetState, commit: in core.js (US-33b). */
function setSaveStatus(t){ const el=document.getElementById('save_status'); if(el){ el.textContent=t; } }
/* US-84: Dokument-Modell – Statusanzeige zeigt „gespeichert" vs. „ungespeicherte Änderungen".
   Der Arbeitsstand wird weiter laufend im Browser gehalten (Absturzschutz); „gespeichert" ist
   nur der zuletzt explizit bestätigte Stand. */
function updateSaveStatus(){
  const el=document.getElementById('save_status'); if(!el) return;
  if(istGespeichert()){ el.textContent='✓ Gespeichert'; el.classList.remove('dirty'); el.title='Der aktuelle Stand ist gespeichert.'; }
  else { el.textContent='● Ungespeicherte Änderungen'; el.classList.add('dirty'); el.title='Es gibt ungespeicherte Änderungen. Speichern mit Strg/Cmd+S oder über „Datei → Speichern". Der Arbeitsstand ist im Browser zwischengespeichert (Absturzschutz).'; }
}
onStateChange(updateSaveStatus);
onPersist(function(ok){ if(!ok){ setSaveStatus('⚠ nicht gespeichert'); } else { updateSaveStatus(); } });
/* US-84: expliziter Speicherbefehl – setzt den gespeicherten Stand (Dokument). „Speichern unter…"
   schreibt zusätzlich die Datei. (Phase 2: „Speichern" schreibt in Chromium direkt in die Datei.) */
function speichern(){ markGespeichert(); }
/* Speicher: „Speichern unter…" wie im Office – legt aus dem AKTUELLEN (ggf. geänderten) Stand ein
   NEUES Dokument an und schaltet darauf um. Das Ausgangsobjekt wird auf seinen zuletzt
   gespeicherten Stand zurückgesetzt (Änderungen dort verworfen). So bleiben Quelle und Kopie
   getrennt (z. B. Folgejahr aus einem bestehenden Jahr ableiten). */
async function speichernUnter(){
  /* Ralf-Vorgabe 2026-07-08 (Datenablage v2): bei Objekten mit eigenem Stammordner (dokAblageVersion
     2) landet die JSON als Kind DIESES Ordners statt an einem beliebigen, unabhängigen Ort – dafür
     wird hier (statt im freien Speichern-Dialog) explizit nach dem Namen gefragt, der zugleich den
     Ordnernamen bestimmt (nur beim allerersten Mal je Objekt, danach wiederverwendet). Ältere/
     importierte Objekte ohne dieses Feld bleiben beim bisherigen freien Speicherort.
     Namensabfrage läuft über den seitenintegrierten Dialog (nicht mehr prompt()) - siehe
     openNamensDialog weiter oben: dessen "Speichern"-Klick ruft dokJsonSpeichern()/
     showDirectoryPicker() direkt auf, ohne dass ein blockierender nativer Dialog vorher die
     Aktivierung verstreichen lässt. */
  const istV2 = (+state.objekt.dokAblageVersion||0)>=2 && typeof dokVerfuegbar==='function' && dokVerfuegbar();
  if(istV2){
    const vorschlag = state.objekt.name || state.objekt.addr || '';
    openNamensDialog('Speichern unter…', 'Name für dieses Objekt (bestimmt auch den Ordnernamen). Legt aus dem aktuellen Stand ein neues, eigenständiges Objekt an.', vorschlag, 'Speichern', _speichernUnterMitName);
    return;
  }
  const modSnap = nkClone(snapshot());            /* aktueller, evtl. geänderter Stand = die Kopie */
  modSnap.objekt = modSnap.objekt || {};
  const res = await schreibeDatei(JSON.stringify(modSnap,null,2), nkObjektDateiname(modSnap));
  if(!res.ok) return;                              /* vom Nutzer abgebrochen */
  const neuerName = nkNameAusDateiname(res.dateiname);
  if(neuerName) modSnap.objekt.name = neuerName;
  _speichernUnterUebernehmen(modSnap);
}
async function _speichernUnterMitName(neuerName){
  const modSnap = nkClone(snapshot());
  modSnap.objekt = modSnap.objekt || {};
  if(neuerName.trim()) modSnap.objekt.name = neuerName.trim();
  modSnap.objekt.id = naechsteObjektId(); /* "Speichern unter" = neue, eigenständige Identität (Fork) */
  const res = await dokJsonSpeichern(modSnap.objekt, nkObjektDateiname(modSnap), JSON.stringify(modSnap,null,2));
  if(!res.ok) return {ok:false}; /* Dialog bleibt offen, erneuter Klick = neue Aktivierung */
  _speichernUnterUebernehmen(modSnap);
  return {ok:true};
}
/* 1) Ausgangsobjekt auf den gespeicherten Stand zurücksetzen (Änderungen verwerfen).
   2) Neues Dokument aus dem geänderten Stand anlegen, benennen und aktiv schalten. */
function _speichernUnterUebernehmen(modSnap){
  if(savedData[aktivIdx]) verwerfeAenderungen();
  objekte.push(modSnap); aktivIdx=objekte.length-1; ladeDaten(modSnap); ensureIds();
  renderAll(); neuerVerlauf(); markGespeichert(); markDateiGesichert(); updateSaveStatus();
}
/* US-84: PDF/Abrechnung nur aus dem gespeicherten Stand. Bei Änderungen: erst speichern. */
function pdfStandOk(){
  // US-90: Plausi-Tor – kein PDF, solange aus dem Vorjahr vorbelegte Kostenbeträge nicht übernommen sind.
  const offen=nkOffeneVorjahrKosten(state.kosten);
  if(offen.length){ alert('Vor dem PDF bitte die aus dem Vorjahr vorbelegten Kostenbeträge prüfen und übernehmen.\n\nNoch offen ('+offen.length+'):\n'+offen.map(k=>'• '+(k.bez||'(ohne Bezeichnung)')).join('\n')+'\n\nÜbernehmen: blaues Dreieck ▲ anklicken oder den Wert anpassen (oder „Alle übernehmen").'); return false; }
  if(istGespeichert()) return true;
  if(confirm('Es gibt ungespeicherte Änderungen. Die Abrechnung soll auf dem gespeicherten Stand beruhen.\n\nJetzt speichern und fortfahren?')){ speichern(); return true; }
  return false;
}
/* US-91: Office-Stil – aktuelles Objekt als Titel im Header (kein Dauer-Dropdown mehr).
   markRecent() hält die „Zuletzt verwendet"-Liste aktuell (wird bei jedem Objektwechsel über renderAll erreicht). */
function markRecent(){ if(objekte[aktivIdx]) mruPush(objSignatur(objekte[aktivIdx])); }
/* Ralf-Vorgabe 2026-07-10: Header-Titel „Name · Jahr" war ein einziges, nicht editierbares Textfeld –
   jetzt zwei eigene Felder: links NUR der selbst vergebene Name, als Combobox der zuletzt verwendeten
   Objekte (wie „Datei → Zuletzt verwendet", aber direkt im Header wählbar, je Name nur einmal – die
   zuletzt genutzte Jahres-Instanz); rechts ein Jahr-Feld, das zwischen den Jahrgängen DESSELBEN
   Objekts springen kann (gruppiert wie im „Objekt öffnen"-Dialog: gleicher Name = dasselbe Objekt).
   Nur ein Jahrgang vorhanden -> Jahr-Feld deaktiviert (nichts zum Springen). */
function objNameMruListe(){
  const list=[]; const seen=new Set();
  mru.forEach(sig=>{ const i=objekte.findIndex(d=>objSignatur(d)===sig); if(i<0) return;
    const name=objName(objekte[i],i); if(seen.has(name)) return; seen.add(name); list.push({idx:i, name}); });
  return list;
}
function objJahrListe(idx){
  const name=objekte[idx]?objName(objekte[idx],idx):'';
  return objekte.map((d,i)=>({idx:i, name:objName(d,i), jahr:objektJahr(d)}))
    .filter(it=>it.name===name)
    .sort((a,b)=>String(a.jahr||'').localeCompare(String(b.jahr||'')));
}
function renderObjTitle(){
  markRecent();
  const nameSel=document.getElementById('obj_title_select'), jahrSel=document.getElementById('obj_jahr_select');
  if(!nameSel || !jahrSel) return;
  if(!objekte.length){ nameSel.innerHTML='<option>—</option>'; jahrSel.innerHTML=''; jahrSel.disabled=true; return; }
  const aktName=objName(objekte[aktivIdx],aktivIdx);
  const namen=objNameMruListe();
  if(!namen.some(n=>n.name===aktName)) namen.unshift({idx:aktivIdx, name:aktName}); /* aktives Objekt immer enthalten */
  nameSel.innerHTML=namen.map(n=>'<option value="'+n.idx+'"'+(n.name===aktName?' selected':'')+'>'+esc(n.name)+'</option>').join('');
  const jahre=objJahrListe(aktivIdx);
  jahrSel.disabled = jahre.length<=1;
  jahrSel.innerHTML=jahre.map(j=>'<option value="'+j.idx+'"'+(j.idx===aktivIdx?' selected':'')+'>'+esc(j.jahr||'—')+'</option>').join('');
}
function onObjTitelChange(sel){ waehleObjekt(+sel.value); }
function onObjJahrChange(sel){ waehleObjekt(+sel.value); }
/* US-91: „Öffnen"-Dialog – alle Objekte, Suche, progressive Gruppierung (nkObjekteGruppieren). */
function openObjektDialog(){ const s=document.getElementById('objekt_suche'); if(s) s.value=''; renderObjektDialog();
  const ov=document.getElementById('objekt_overlay'); if(ov) ov.hidden=false; if(s) s.focus(); }
function closeObjektDialog(){ const ov=document.getElementById('objekt_overlay'); if(ov) ov.hidden=true; }
function waehleObjekt(idx){ closeObjektDialog(); switchObjekt(idx); }
/* Ralf-Fund 2026-07-10: ein natives prompt()/confirm() VOR showDirectoryPicker() (docs.js) lässt
   Chromes kurze "User Activation" nach dem ursprünglichen Menü-Klick verstreichen - der Ordner-
   Dialog öffnet sich danach lautlos nicht mehr. Diese beiden seitenintegrierten Dialoge ersetzen
   die nativen prompt()/confirm()-Aufrufe VOR einer Ordnerauswahl: ihr eigener "Weiter"-Klick ist
   selbst ein frischer Klick, der showDirectoryPicker() direkt im selben Handler öffnen kann,
   unabhängig davon, wie lange der Dialog vorher offen stand. Callback-Vertrag: async, ohne Argument
   (Bestätigungs-Dialog) bzw. mit dem eingegebenen Namen (Namens-Dialog); liefert {ok:false} bei
   Abbruch/Fehler (Dialog bleibt offen, erneuter "Weiter"-Klick = neue frische Aktivierung) oder
   {ok:true, msg?} bei Erfolg (Dialog schließt, msg wird danach angezeigt). */
let _namensdialogCallback = null;
function openNamensDialog(titel, hint, vorschlag, weiterLabel, onWeiter){
  const t=document.getElementById('namensdlg_titel'); if(t) t.textContent=titel;
  const h=document.getElementById('namensdlg_hint'); if(h) h.textContent=hint||'';
  const inp=document.getElementById('namensdlg_input'); if(inp) inp.value=vorschlag||'';
  const b=document.getElementById('namensdlg_weiter'); if(b) b.textContent=weiterLabel||'Weiter';
  _namensdialogCallback=onWeiter;
  const ov=document.getElementById('namensdlg_overlay'); if(ov) ov.hidden=false;
  if(inp){ inp.focus(); inp.select(); }
}
function closeNamensDialog(){ const ov=document.getElementById('namensdlg_overlay'); if(ov) ov.hidden=true; _namensdialogCallback=null; }
async function _namensdialogWeiter(){
  const inp=document.getElementById('namensdlg_input');
  const name=(inp&&inp.value||'').trim();
  if(!name){ alert('Bitte einen Namen eingeben.'); if(inp) inp.focus(); return; }
  const cb=_namensdialogCallback; if(!cb) return;
  const erg=await cb(name);
  if(erg && erg.ok){ closeNamensDialog(); if(erg.msg) alert(erg.msg); }
}
let _bestaetigdialogCallback = null;
function openBestaetigDialog(titel, text, weiterLabel, onWeiter){
  const t=document.getElementById('bestaetigdlg_titel'); if(t) t.textContent=titel;
  const x=document.getElementById('bestaetigdlg_text'); if(x) x.textContent=text;
  const b=document.getElementById('bestaetigdlg_weiter'); if(b) b.textContent=weiterLabel||'Weiter';
  _bestaetigdialogCallback=onWeiter;
  const ov=document.getElementById('bestaetigdlg_overlay'); if(ov) ov.hidden=false;
}
function closeBestaetigDialog(){ const ov=document.getElementById('bestaetigdlg_overlay'); if(ov) ov.hidden=true; _bestaetigdialogCallback=null; }
async function _bestaetigdialogWeiter(){
  const cb=_bestaetigdialogCallback; if(!cb) return;
  const erg=await cb();
  if(erg && erg.ok){ closeBestaetigDialog(); if(erg.msg) alert(erg.msg); }
}
function renderObjektDialog(){
  const box=document.getElementById('objekt_liste'); if(!box) return;
  const q=(((document.getElementById('objekt_suche')||{}).value)||'').toLowerCase().trim();
  const items=objekte.map((d,i)=>({ idx:i, name:String((d.objekt&&(d.objekt.name||d.objekt.addr))||('Objekt '+(i+1))).trim(), jahr:objektJahr(d), label:objektLabel(d,i) }));
  const match=it=> !q || it.label.toLowerCase().includes(q);
  if(nkObjekteGruppieren(items.map(it=>({name:it.name, jahr:it.jahr})))){
    box.className='dlg-list';
    const order=[], map={};
    items.forEach(it=>{ if(!map[it.name]){ map[it.name]=[]; order.push(it.name); } map[it.name].push(it); });
    box.innerHTML=order.map(name=>{ const yrs=map[name].filter(match); if(!yrs.length) return '';
      return '<div class="dlg-grp-name">'+esc(name)+'</div><div class="dlg-years">'+
        yrs.map(it=>'<button class="dlg-yr'+(it.idx===aktivIdx?' dlg-cur':'')+'" onclick="waehleObjekt('+it.idx+')">'+esc(it.jahr||'—')+'</button>').join('')+'</div>'; }).join('')
      || '<div class="dlg-grp-name">Kein Treffer</div>';
  } else {
    box.className='dlg-list dlg-flat';
    const hits=items.filter(match);
    box.innerHTML=hits.map(it=>'<button class="'+(it.idx===aktivIdx?'dlg-cur':'')+'" onclick="waehleObjekt('+it.idx+')">'+esc(it.label)+'</button>').join('') || '<button disabled>Kein Treffer</button>';
  }
}
/* US-91: „Zuletzt verwendet" – MRU als Flyout im Datei-Menü. */
function toggleMruSub(ev){ ev.stopPropagation(); const s=document.getElementById('mru_sub'); if(!s) return; if(s.hidden){ renderMruSub(); s.hidden=false; } else s.hidden=true; }
function renderMruSub(){ const s=document.getElementById('mru_sub'); if(!s) return;
  const list=[]; mru.forEach(sig=>{ const i=objekte.findIndex(d=>objSignatur(d)===sig); if(i>=0 && !list.some(x=>x.idx===i)) list.push({idx:i, label:objektLabel(objekte[i],i)}); });
  if(!list.length){ s.innerHTML='<button disabled>– noch keine –</button>'; return; }
  s.innerHTML=list.map((x,n)=>'<button onclick="waehleObjekt('+x.idx+');toggleDateiMenu(true)"><span class="mru-num">'+(n+1)+'</span><span style="flex:1">'+esc(x.label)+'</span></button>').join('')
    +'<div class="menu-sep"></div><button onclick="openObjektDialog();toggleDateiMenu(true)">Alle Objekte öffnen…</button>'; }
function renderAll(){ renderObjTitle(); renderVorjahrBanner(); renderSchnellstart(); fillObjektKopf();
  const a=document.getElementById('abr_status'); if(a) a.value=state.abrechnungStatus;
  renderEinheiten(); renderVoraus(); renderKosten();
  const r=RENDERERS[ui.current]; if(r) r(); /* aktuellen Reiter über dieselbe Tabelle wie go() rendern */
  renderStepper(); }
/* Speicher: Objektwechsel mit Schutz vor stillem Mitschleppen ungespeicherter Änderungen.
   Bei ungespeichertem Stand: speichern / verwerfen / abbrechen (zwei native Dialoge =
   drei Ausgänge). „Verwerfen" setzt das Objekt auf den gespeicherten Stand zurück. Ein nie
   gespeichertes neues Objekt (kein savedData) behält seinen Arbeitsstand. */
function switchObjekt(idx){
  idx=Math.max(0,Math.min(+idx,objekte.length-1));
  if(idx===aktivIdx){ return; }
  if(!istGespeichert()){
    if(confirm('Es gibt ungespeicherte Änderungen an diesem Objekt.\n\nOK = jetzt speichern und wechseln\nAbbrechen = ohne Speichern fortfahren')){
      speichern();
    } else if(savedData[aktivIdx]){
      if(confirm('Ungespeicherte Änderungen verwerfen und wechseln?\n\nOK = verwerfen und wechseln\nAbbrechen = im Objekt bleiben')){
        verwerfeAenderungen();
      } else {
        renderObjTitle(); /* Wechsel abgebrochen – Dropdown zurück auf das aktive Objekt */
        return;
      }
    }
  }
  saveState(); aktivIdx=idx; ladeDaten(objekte[aktivIdx]); ensureIds(); renderAll(); neuerVerlauf(); saveState(); updateSaveStatus();
}
/* US-91: Anlegen bewusst bestätigen (Objekte entstehen sonst zu beiläufig). Das aktuelle Objekt
   bleibt erhalten und ist über „Öffnen"/„Zuletzt verwendet" wieder erreichbar. */
/* Ralf-Vorgabe 2026-07-09: "Neu" hieß bisher immer "Neues Objekt" (irreführend, sobald mehrere
   Objekte existieren) und fragte erst NACH dem Anlegen beiläufig nach einem Dokumentenordner.
   Jetzt: Name zuerst abfragen (mit Tipp zur verkürzten Anschrift, Ralf-Vorgabe 2026-07-10: Name vor
   Ordner - Vermieter haben den Objektnamen im Kopf, den Speicherort überlegen sie sich danach), Name
   direkt in Straße & Hausnummer übernehmen. Die Namensabfrage läuft über den seitenintegrierten
   Dialog (nicht mehr prompt()) - ein blockierender nativer Dialog VOR showDirectoryPicker() lässt
   die dafür nötige "User Activation" verstreichen, siehe openNamensDialog weiter oben. Ohne
   Datenablage-Unterstützung (kein Chromium) bleibt es beim einfachen Rückfrage-Confirm (kein Ordner
   involviert, daher unkritisch). */
async function neuesObjekt(){
  const v2moeglich = typeof dokVerfuegbar==='function' && dokVerfuegbar();
  if(v2moeglich){
    openNamensDialog('Neues Objekt anlegen', 'Tipp: eine kurze/verkürzte Anschrift eignet sich gut, z. B. „Lindenhof" oder „Musterstr. 12". Im nächsten Schritt wählst du den Ordner, in dem das Objekt angelegt wird.', '', 'Ordner wählen', _neuesObjektMitName);
    return;
  }
  if(!confirm('Neues, leeres Objekt anlegen?\n\nDas aktuelle Objekt bleibt erhalten und ist über „Datei → Öffnen" oder „Zuletzt verwendet" wieder erreichbar.')) return;
  saveState();
  const frisch = makeFreshDaten();
  objekte.push(frisch); aktivIdx=objekte.length-1; ladeDaten(frisch); ensureIds(); ui.current=0; renderAll(); go(0); neuerVerlauf(); saveState(); updateSaveStatus();
}
async function _neuesObjektMitName(name){
  const erg = await _dokOrdnerFuerNamenAnlegen(name); /* Picker + Unterordner, ohne Id-Cache (die Objekt-ID entsteht erst unten) */
  if(!erg) return {ok:false}; /* abgebrochen/fehlgeschlagen - Dialog bleibt offen, erneuter Klick = neue Aktivierung */
  saveState();
  const frisch = makeFreshDaten();
  frisch.objekt.name=name; frisch.objekt.addr=name;
  objekte.push(frisch); aktivIdx=objekte.length-1; ladeDaten(frisch); ensureIds();
  _dokObjektRootCache[state.objekt.id]=erg.root; await _dokObjektRootSetzen(state.objekt.id, erg.root);
  /* Ralf-Vorgabe 2026-07-09: bislang entstand beim Anlegen NUR der Ordner, keine Objektdatei –
     "Speichern" (Strg+S) schreibt nach wie vor nur ins localStorage, "Speichern unter…" hätte eine
     ZWEITE, eigenständige Objekt-ID angelegt. Daher hier direkt die erste JSON in den neuen Ordner
     schreiben (dokJsonSpeichern findet den Root schon im Cache, fragt also nicht erneut). */
  const dateiname = nkObjektDateiname(snapshot());
  const schreibRes = await dokJsonSpeichern(state.objekt, dateiname, JSON.stringify(snapshot(),null,2));
  if(schreibRes.ok) markDateiGesichert();
  ui.current=0; renderAll(); go(0); neuerVerlauf(); saveState(); updateSaveStatus();
  /* Der Browser liefert aus Sicherheitsgründen keinen absoluten Dateisystem-Pfad, nur Ordnernamen –
     daher als Orientierung die Namenskette statt eines echten Pfads. */
  return {ok:true, msg:'Ordner angelegt: „'+erg.eltern.name+'" / „'+erg.ordnername+'"\n\nDort liegen künftig die Belege und die Objektdatei ('+(schreibRes.ok?dateiname:'Fehler beim Schreiben')+') dieses Objekts.'};
}
/* US-91: aktuelles Objekt löschen (mit Bestätigung) – damit versehentlich angelegte Objekte
   wieder entfernt werden können.
   Ralf-Vorgabe 2026-07-13: der verknüpfte Dokumentenordner wird NIE angefasst (weder gelöscht noch
   verschoben) – die File System Access API kennt keinen Papierkorb, removeEntry() löscht endgültig.
   Stattdessen nennt der Warnhinweis den Ordnernamen, damit sichtbar bleibt, was ggf. manuell im
   Finder/Explorer aufzuräumen ist (dort gibt es einen echten Papierkorb). */
async function objektLoeschen(){
  if(!objekte.length) return;
  const name = objektLabel(objekte[aktivIdx], aktivIdx);
  const istV2 = (+state.objekt.dokAblageVersion||0)>=2;
  let ordnerHinweis = '';
  if(istV2 && state.objekt.id && typeof dokObjektOrdnerName==='function'){
    const on = await dokObjektOrdnerName(state.objekt.id);
    if(on) ordnerHinweis = '\n\nHinweis: der verknüpfte Dokumentenordner „'+on+'" bleibt davon unberührt auf der Festplatte erhalten – bei Bedarf dort manuell aufräumen.';
  } else if(typeof dokBasisName==='function' && dokBasisName()){
    ordnerHinweis = '\n\nHinweis: eventuell abgelegte Dokumente liegen im gemeinsamen Ordner „'+dokBasisName()+'" und bleiben davon unberührt.';
  }
  const msg = (objekte.length<=1
    ? 'Dies ist das einzige Objekt. „Löschen" leert es und lädt ein neues, leeres Objekt.\n\nFortfahren?'
    : 'Objekt „'+name+'" wirklich löschen? Das kann nicht rückgängig gemacht werden.') + ordnerHinweis;
  if(!confirm(msg)) return;
  deleteAktivesObjekt(); ui.current=0; renderAll(); go(0); neuerVerlauf(); updateSaveStatus();
}
/* US-76/US-84: Backup-Hinweis nach PDF-Export. „Gespeichert" (US-84) bedeutet nur localStorage,
   nicht „als Datei auf dem PC". Daher wird der Hinweis nur eingeblendet, wenn der aktuelle Stand
   NICHT als Datei gesichert ist (istDateiGesichert). Aufruf aus pdf.js; „×" blendet aus. */
function showBackupHinweis(){ const b=document.getElementById('backup_hinweis'); if(!b) return; b.style.display = istDateiGesichert() ? 'none' : 'flex'; }
function dismissBackupHinweis(){ const b=document.getElementById('backup_hinweis'); if(b) b.style.display='none'; }
/* US-65: Objekt als Datei sichern – echter Speicherdialog (File System Access API), wo
   unterstützt; sonst Download-Fallback. Dateiname wird aus „Objekt/Adresse" vorgeschlagen. */
/* Speicher: JSON unter einem Vorschlagsnamen als PC-Datei schreiben. File System Access API,
   wo unterstützt (echter Speicherdialog); sonst Download-Fallback. Liefert {ok, dateiname} –
   bei Abbruch {ok:false}. dateiname ist der tatsächlich gewählte Name (Picker) bzw. der Vorschlag. */
async function schreibeDatei(json, vorschlag){
  if(window.showSaveFilePicker){
    try{
      const handle=await window.showSaveFilePicker({ suggestedName:vorschlag, types:[{description:'NeKoFix-Objekt (JSON)', accept:{'application/json':['.json']}}] });
      const w=await handle.createWritable(); await w.write(json); await w.close();
      return { ok:true, dateiname:handle.name };
    }catch(e){ if(e && e.name==='AbortError') return { ok:false }; /* vom Nutzer abgebrochen */ }
  }
  /* Fallback (Firefox/Safari): Download in den Browser-Download-Ordner. */
  const blob=new Blob([json],{type:'application/json;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=vorschlag;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
  return { ok:true, dateiname:vorschlag };
}
/* US-65/US-76: aktuelles Objekt als Datei sichern (Backup-Hinweis-Button). Dateiname wird aus
   „Objekt/Adresse" + Jahr vorgeschlagen (nkObjektDateiname – kein doppeltes Jahr). Der Objektname
   (Header) folgt dem gewählten Dateinamen; das Adressfeld bleibt unberührt. */
async function exportObjekt(){
  const d=snapshot();
  const res=await schreibeDatei(JSON.stringify(d,null,2), nkObjektDateiname(d));
  if(!res.ok) return false;
  const neuerName=nkNameAusDateiname(res.dateiname);
  if(neuerName && neuerName!==state.objekt.name){ store.setObjektFeld('name', neuerName); renderObjTitle(); }
  markDateiGesichert(); /* US-76: aktueller Stand liegt jetzt als PC-Datei vor */
  return true;
}
/* US-11: Folgejahr aus dem aktiven Objekt anlegen */
function neuesJahrAusVorjahr(){
  const jahrAlt=objektJahr(snapshot()); const jahrNeu=jahrAlt?(+jahrAlt+1):'';
  if(!confirm('Neues Abrechnungsjahr'+(jahrNeu?' '+jahrNeu:'')+' aus „'+objektLabel(snapshot(),aktivIdx)+'" anlegen?\n\nStammdaten, Kostenarten und Verteilerschlüssel werden übernommen. Die Kostenbeträge werden mit den Vorjahreswerten vorbelegt und markiert; sie sind aktiv zu prüfen und zu übernehmen. Ausgezogene Mieter werden nicht übernommen, aktive auf das ganze Jahr gesetzt.')) return;
  saveState();
  const neu=nkVorjahrUebernehmen(snapshot());
  if(objekte.some(d=>objSignatur(d)===objSignatur(neu)) && !confirm('Für diese Adresse und diesen Zeitraum gibt es bereits ein Objekt. Trotzdem ein weiteres anlegen?')) return;
  objekte.push(neu); aktivIdx=objekte.length-1; ladeDaten(objekte[aktivIdx]); ensureIds(); ui.current=0; renderAll(); go(0); neuerVerlauf(); saveState(); updateSaveStatus();
  vorjahrHinweisEinmal();
}
/* US-90: Einmalige Erklärung des Vorbeleg-/Übernehmen-Musters (beim ersten Jahreswechsel). */
function vorjahrHinweisEinmal(){
  try{ if(localStorage.getItem('nk_vorjahr_hint')) return; localStorage.setItem('nk_vorjahr_hint','1'); }catch(e){}
  alert('So funktioniert der Jahreswechsel:\n\n• Die Kostenbeträge sind mit den Vorjahreswerten vorbelegt und mit einem blauen Dreieck ▲ (oben rechts im Feld) markiert.\n• Prüfen Sie jeden Wert und übernehmen Sie ihn: Klick auf das ▲ oder den Wert anpassen.\n• Solange noch Werte offen sind, lässt sich kein PDF erstellen.\n\nMit „Alle übernehmen" oben bestätigen Sie alle Werte auf einmal.');
}
function renderVorjahrBanner(){
  const box=document.getElementById('vorjahr_banner'); if(!box) return;
  if(!state.vorjahr){ box.innerHTML=''; return; }
  const offen=nkOffeneVorjahrKosten(state.kosten).length;
  if(!offen){ box.innerHTML=''; return; }
  box.innerHTML='<div class="vorjahr-banner"><span class="vb-text"><b>Aus dem Vorjahr vorbelegt.</b> '+offen+' Kostenbetr'+(offen===1?'ag ist':'äge sind')+' mit ▲ markiert und noch zu übernehmen: bitte prüfen und das blaue Dreieck anklicken (oder den Wert anpassen). Vor dem PDF müssen alle übernommen sein.</span><button onclick="confirmVorjahr()">Alle übernehmen</button></div>';
}
function confirmVorjahr(){
  state.vorjahr=false;
  (state.kosten||[]).forEach(k=>{ k.vorjahr=false; });
  (state.einheiten||[]).forEach(e=>{ e.vorjahr=false; (e.mv||[]).forEach(m=>{ m.vorjahr=false; }); });
  renderAll(); neuerVerlauf(); saveState(); updateSaveStatus();
}
/* UX-Review 2026-07-15 (Kano): optionaler Schnellstart-Hinweis – beantwortet "was mache ich
   zuerst?" beim allerersten Start (Beispieldaten) und bei jedem frischen, noch leeren Objekt
   (keine Kosten erfasst). Kein Zwangs-Wizard: nur klickbare Reiter-Links in der empfohlenen
   Reihenfolge; "×" blendet ihn dauerhaft aus (localStorage, objektübergreifend wie DOK_KEY). */
const SCHNELLSTART_KEY="nekofix-schnellstart-weg";
function schnellstartWeg(){ try{ return localStorage.getItem(SCHNELLSTART_KEY)==="1"; }catch(e){ return false; } }
function dismissSchnellstart(){ try{ localStorage.setItem(SCHNELLSTART_KEY,"1"); }catch(e){} renderSchnellstart(); }
function renderSchnellstart(){
  const box=document.getElementById('schnellstart_banner'); if(!box) return;
  const frisch=!(state.kosten||[]).length;
  const zeigen=!schnellstartWeg() && !(state.objekt&&state.objekt.freigeschaltet) && (frisch || ui.ersterStart);
  if(!zeigen){ box.innerHTML=''; return; }
  const step=(i,txt)=>'<button type="button" class="ss-step" onclick="go('+i+')">'+txt+'</button>';
  box.innerHTML='<div class="schnellstart-banner"><div class="ss-text"><b>Schnellstart – so entsteht die erste Abrechnung:</b> '+
    (ui.ersterStart&&!frisch?'<span class="ss-demo">Zum Ausprobieren sind Beispieldaten geladen; ein eigenes Objekt legen Sie über „Datei → Neu…" an.</span><br>':'')+
    '1. '+step(0,'Gebäude & Einheiten')+' (Adresse, Zeitraum, Flächen) · '+
    '2. '+step(7,'Mieter & Vertrag')+' (Mieter, Vorauszahlung) · '+
    '3. '+step(2,'Heizung')+' und '+step(3,'Kosten')+' erfassen · '+
    '4. '+step(5,'Fertige Abrechnung')+' prüfen und als PDF erzeugen. '+
    'Die Reihenfolge ist nur eine Empfehlung – alle Bereiche sind jederzeit frei erreichbar.</div>'+
    '<button class="ss-x" onclick="dismissSchnellstart()" title="Hinweis dauerhaft ausblenden" aria-label="Hinweis dauerhaft ausblenden">×</button></div>';
}
/* UX-Review 2026-07-15 (Kano): ruhiger "Fertig!"-Moment – einmal je Objekt+Jahr (gleicher Schlüssel
   wie die Freischaltung, nkFreischaltKey), nur wenn das PDF versandfertig (freigeschaltet, ohne
   Wasserzeichen) erzeugt wurde. Aufruf aus pdf.js nach erfolgreichem Mieter-PDF-Export/-Versand. */
const FERTIG_KEY="nekofix-fertig-gezeigt";
function zeigeFertigMoment(){
  if(!(state.objekt && state.objekt.freigeschaltet)) return;
  let gezeigt=[]; try{ gezeigt=JSON.parse(localStorage.getItem(FERTIG_KEY)||'[]'); }catch(e){ gezeigt=[]; }
  if(!Array.isArray(gezeigt)) gezeigt=[];
  const key=nkFreischaltKey(state.objekt);
  if(gezeigt.indexOf(key)>=0) return;
  try{ localStorage.setItem(FERTIG_KEY, JSON.stringify(gezeigt.concat(key))); }catch(e){}
  const f=nkFertigMoment(state.einheiten, state.kosten, state.objekt);
  const t=document.getElementById('fertigdlg_text');
  if(t) t.textContent='Die Abrechnung'+(f.jahr?' '+f.jahr:'')+' für „'+((state.objekt.name||state.objekt.addr)||'')+'" ist versandfertig: '+
    f.mieter+' Mietverhältnis'+(f.mieter===1?'':'se')+' in '+f.einheiten+' Einheit'+(f.einheiten===1?'':'en')+', '+eur(f.summe)+' Kosten verteilt.';
  const ov=document.getElementById('fertigdlg_overlay'); if(ov) ov.hidden=false;
}
function closeFertigDialog(){ const ov=document.getElementById('fertigdlg_overlay'); if(ov) ov.hidden=true; }
/* Willkommens-Splash: einmalig beim echten Erststart (ui.ersterStart, s. view-init.js), egal ob
   über app.nekofix.de/?start=leer oder ?start=demo eingestiegen wird. Kein eigener localStorage-
   Merker nötig – ui.ersterStart ist bereits genau dann true, wenn noch kein Stand gespeichert war
   (bzw. nach resetState()), das deckt "nur beim allerersten Start" ab. */
function zeigeWillkommen(){
  const frisch=!(state.kosten||[]).length;
  const t=document.getElementById('willkommen_text');
  if(t) t.textContent = (frisch
    ? 'Sie starten mit einem leeren Objekt – Sie können sofort Ihre eigenen Daten erfassen (Gebäude & Einheiten, Mieter, Kosten). '
    : 'Zum Ausprobieren sind Beispieldaten geladen; ein eigenes Objekt legen Sie über „Datei → Neu…" an. ')
    + 'Diese Version dient zum Testen.';
  const ov=document.getElementById('willkommen_overlay'); if(ov) ov.hidden=false;
}
function closeWillkommen(){ const ov=document.getElementById('willkommen_overlay'); if(ov) ov.hidden=true; }
function importObjekt(ev){ const f=ev.target.files&&ev.target.files[0]; if(!f){ return; }
  const dateiname=f.name; /* Speicher: Objektname (Header) folgt dem Dateinamen, nicht dem Adressfeld */
  const r=new FileReader();
  r.onload=function(){ try{ const d=JSON.parse(r.result);
      if(!d || !Array.isArray(d.einheiten)){ alert('Datei ist kein gültiges Objekt (es fehlen Einheiten).'); return; }
      const sig=JSON.stringify(d);
      if(objekte.some(x=>JSON.stringify(x)===sig) && !confirm('Dieses Objekt ist bereits vorhanden (identische Daten). Trotzdem importieren?')) return;
      const nameAusDatei=nkNameAusDateiname(dateiname); /* Speicher: Header-Name aus Dateiname (ohne .json/NeKoFix-/-JJJJ) */
      if(nameAusDatei){ d.objekt=d.objekt||{}; d.objekt.name=nameAusDatei; }
      saveState(); objekte.push(d); aktivIdx=objekte.length-1; ladeDaten(d); ensureIds(); ui.current=0; renderAll(); go(0); neuerVerlauf(); saveState(); updateSaveStatus();
    }catch(e){ alert('Datei konnte nicht gelesen werden.'); } finally{ ev.target.value=''; } };
  r.readAsText(f); }

/* ---------- App-Rahmen: Status, Verlauf (Undo/Redo), Vorjahr-Umschaltung (US-118 AC-4) ---------- */
function setAbrStatus(v){ store.setAbrechnungStatus(v); }
/* US-82: Undo/Redo – Bedienung. Datenlogik liegt in core.js (histUndo/histRedo/histReset). */
function undo(){ if(histUndo()) renderAll(); updateHistButtons(); }
function redo(){ if(histRedo()) renderAll(); updateHistButtons(); }
function neuerVerlauf(){ histReset(); updateHistButtons(); } /* an Objekt-Grenzen (Wechsel/Neu/Import/Vorjahr/Start) */
function updateHistButtons(){
  const u=document.getElementById('btn_undo'), r=document.getElementById('btn_redo');
  if(u) u.disabled=!histCanUndo();
  if(r) r.disabled=!histCanRedo();
}
/* saveState, loadState, resetState, commit/scheduleSave: in core.js (US-33b). */
document.addEventListener('input', commit);  /* Sicherheitsnetz für nicht über den Store laufende Eingaben */
document.addEventListener('change', commit);
window.addEventListener('beforeunload', function(e){ if(_resetInProgress) return; saveState(); if(!istGespeichert()){ e.preventDefault(); e.returnValue=''; } }); /* US-84: bei ungespeicherten Änderungen warnen (Arbeitsstand bleibt im Browser); _resetInProgress (core.js): resetState() lässt hier NICHT erneut den alten Stand zurückschreiben */
/* US-82: Button-Status nach jeder Eingabe aktualisieren (nach commit, daher hier registriert). */
document.addEventListener('input', updateHistButtons);
document.addEventListener('change', updateHistButtons);
/* US-82: Tastenkürzel – Strg/Cmd+Z = Undo, Strg/Cmd+Shift+Z bzw. Strg/Cmd+Y = Redo. */
document.addEventListener('keydown', function(e){
  if(!(e.metaKey||e.ctrlKey) || e.altKey) return;
  const k=(e.key||'').toLowerCase();
  if(k==='z'){ e.preventDefault(); if(e.shiftKey) redo(); else undo(); }
  else if(k==='y'){ e.preventDefault(); redo(); }
  else if(k==='s'){ e.preventDefault(); if(e.shiftKey) speichernUnter(); else speichern(); } /* US-84: Strg/Cmd+S speichern, +Shift = Speichern unter */
  else if(k==='o'){ e.preventDefault(); toggleDateiMenu(true); openObjektDialog(); } /* US-91: Strg+O = Öffnen-Dialog */
  else if(k==='n'){ e.preventDefault(); neuesObjekt(); } /* US-91: Strg+N = Neu (Browser fängt es ggf. ab) */
});

/* US-59: Vorjahres-Toggle per Alt+V (Microsoft-Entsprechung der Option-Taste auf dem Mac). Über
   e.code='KeyV', weil Alt+V auf dem Mac als Sonderzeichen ankommt; preventDefault verhindert das. */
document.addEventListener('keydown', function(e){
  if(e.metaKey||e.ctrlKey || !e.altKey) return;
  if(e.code!=='KeyV' && (e.key||'').toLowerCase()!=='v') return;
  e.preventDefault(); toggleVorjahr();
});

/* US-59: Vorjahreswerte ein-/ausblenden. Ohne auffindbares Vorjahr nur ein kurzer Hinweis im Titel. */
function toggleVorjahr(){
  const vj=nkFindVorjahr(objekte, aktivIdx);
  if(!ui.zeigeVorjahr && !vj){ flashKeinVorjahr(); return; }
  ui.zeigeVorjahr=!ui.zeigeVorjahr;
  renderAll(); /* alle Reiter (Einheiten, Vorauszahlung, Kosten …) + Titel mitziehen */
}

/* US-59: Kosten-Titel im Vorjahr-Modus ergänzen: "4 · Kosten" schwarz, " aus Vorjahr JJJJ (Alt+V)"
   blau kursiv. Kein eigenes Element/keine Extra-Zeile -> kein Layout-Sprung. */
function renderKostenTitel(){
  const base=document.getElementById('kosten_titel_base'), vjs=document.getElementById('kosten_titel_vj');
  if(!base||!vjs) return;
  if(vjs.classList.contains('vj-titel-hint')) return; /* laufenden „kein Vorjahr"-Hinweis nicht überschreiben */
  const vj = ui.zeigeVorjahr ? nkFindVorjahr(objekte, aktivIdx) : null;
  if(ui.zeigeVorjahr && vj){ base.textContent='4 · Kosten'; vjs.textContent=' aus Vorjahr '+(nkObjektJahr(vj)||'')+' (Alt+v)'; }
  else { base.textContent='4 · Kosten erfassen'; vjs.textContent=''; }
}

/* US-59: kurzer Hinweis im Titel, wenn es kein Vorjahr-Objekt gibt (2,5 s, dann zurück). */
function flashKeinVorjahr(){
  const vjs=document.getElementById('kosten_titel_vj'); if(!vjs) return;
  vjs.textContent=' kein Vorjahr gefunden'; vjs.classList.add('vj-titel-hint');
  clearTimeout(flashKeinVorjahr._t);
  flashKeinVorjahr._t=setTimeout(()=>{ vjs.classList.remove('vj-titel-hint'); vjs.textContent=''; }, 2500);
}
