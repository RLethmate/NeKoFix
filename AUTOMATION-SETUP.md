# Automatisierung mit Review-Tor – Einrichtung

Ziel: Sobald eine Story-Karte im GitHub-Project nach „Next" wandert, implementiert ein
Claude-Agent die Story in der CI, schreibt Tests und öffnet einen **Pull Request**. Ein Mensch
reviewt und mergt; nach dem Merge wandert die Karte automatisch auf „Done".

Der Mechanismus läuft vollständig in GitHub (Actions), nicht in der Chat-Umgebung.

## Einmalige Einrichtung

### 1. Anthropic-API-Schlüssel als Repo-Secret
- Ein Anthropic-API-Konto mit Guthaben wird benötigt (die Agenten-Läufe verursachen Kosten
  je nach Story-Umfang).
- Repo → Settings → Secrets and variables → Actions → **New repository secret**.
- Name: `ANTHROPIC_API_KEY`, Wert: dein API-Schlüssel.

### 2. Claude-GitHub-App installieren
- Die offizielle Claude-Integration für GitHub im Repo `RLethmate/NeKoFix` installieren
  und ihr Zugriff auf das Repo geben. Den aktuellen Installationsweg und die genauen
  Action-Parameter bitte der offiziellen README der Action `anthropics/claude-code-action`
  entnehmen (Versionsstand kann sich geändert haben).

### 3. Label `next` anlegen
- Repo → Issues → Labels → **New label** → Name: `next`.
- Dieses Label ist der Auslöser des Workflows (siehe
  `.github/workflows/claude-auto-implement.yml`).

### 4. Projekt-Automationen (im GitHub-Project)
- Project → ⋯ → **Workflows**.
- „Auto-add"/Status-Regeln nach Bedarf aktivieren.
- Empfohlen: integrierte Regel **„When issue/PR closed → Set Status: Done"** einschalten,
  damit die Karte nach dem Merge automatisch auf „Done" landet (der PR schließt das Issue
  über „Closes #…").
- Optional: eine Regel, die beim Statuswechsel auf „Next" das Label `next` setzt – so genügt
  das Verschieben der Karte. Falls das in deinem Projekt nicht verfügbar ist, vergibst du das
  Label `next` einfach manuell an der Story.

## Täglicher Ablauf
1. Story-Karte nach „Next" ziehen (bzw. Label `next` setzen).
2. Workflow startet, Claude öffnet einen Pull Request mit Code und Tests.
3. CI führt die Tests aus – Ergebnis im PR sichtbar.
4. Review durch einen Menschen, dann Merge.
5. Issue schließt sich, Karte wandert automatisch auf „Done".

## Sicherheits-/Qualitätshinweise (Review-Tor)
- Aktiviere KEIN Auto-Merge. Grüne Tests bedeuten „vorhandene Tests erfüllt", nicht
  „rechtlich korrekt" – die fachliche Prüfung gehört in den Review.
- Beschränke den API-Schlüssel auf das Nötige und rotiere ihn bei Bedarf.
- Voll-Automatik (Auto-Merge) ließe sich später gezielt nur für unkritische Routine-Stories
  freischalten.

## Hinweis zur Repo-Struktur
Diese Dateien liegen unter `prototype-site/`, weil dein GitHub-Repo aktuell aus diesem Ordner
befüllt wird. Nach dem Push erscheinen sie im Repo-Wurzelverzeichnis unter
`.github/workflows/` – nur dort werden GitHub Actions ausgeführt.
