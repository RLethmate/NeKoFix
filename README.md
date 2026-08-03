# NeKoFix – Prototyp (Walking Skeleton)

Statischer Klick-Prototyp des End-to-End-Durchstichs der Nebenkostenabrechnung.
Läuft vollständig im Browser (kein Backend, keine Datenspeicherung, keine Datenübertragung).

## Auf GitHub Pages veröffentlichen

### Variante A – über die GitHub-Weboberfläche (ohne Kommandozeile)
1. Auf github.com einloggen, oben rechts „+" → **New repository**.
2. Namen vergeben, z. B. `nekofix-prototyp`. Sichtbarkeit: **Public** (für Pages im
   kostenlosen Tarif erforderlich). „Create repository".
3. Im neuen Repo: **Add file → Upload files**. Die Datei `index.html` (und optional diese
   `README.md`) hochladen, dann **Commit changes**.
4. **Settings → Pages**. Unter „Build and deployment" als Source **Deploy from a branch**
   wählen, Branch **main** und Ordner **/(root)**, **Save**.
5. Nach ein bis zwei Minuten erscheint oben die öffentliche URL, Form:
   `https://<dein-benutzername>.github.io/nekofix-prototyp/`
   Diese URL an die Test-Teilnehmer geben.

### Variante B – über die Kommandozeile (Git)
```bash
git init
git add index.html README.md
git commit -m "NeKoFix Prototyp – Walking Skeleton"
git branch -M main
git remote add origin https://github.com/<dein-benutzername>/nekofix-prototyp.git
git push -u origin main
```
Danach in den Repo-Einstellungen GitHub Pages wie in Variante A, Schritt 4, aktivieren.

## Hinweise
- Die Datei MUSS `index.html` heißen, damit sie unter der Wurzel-URL erscheint.
- Für einen geschlossenen Test genügt es, die URL nur an die Teilnehmer weiterzugeben
  (GitHub Pages bietet im kostenlosen Tarif keinen Passwortschutz).
- Updates: geänderte `index.html` erneut committen/hochladen – Pages aktualisiert automatisch.
