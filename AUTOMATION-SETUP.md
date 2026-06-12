# Automatisierung – einmalige Einrichtung

Dieses Dokument beschreibt die einmalige Einrichtung der Automatisierung. Der laufende
Ablauf (Story → Deploy) steht in `Entwicklungsprozess.md`.

So funktioniert die Automatik im Überblick: Eine Story wird über das Label `next` zur Umsetzung
markiert; ein Workflow sammelt alle `next`-Stories in `auto/NEXT-QUEUE.md`. Die eigentliche
Umsetzung erfolgt in einer Cowork-Session (kein KI-Agent in der CI, kein API-Schlüssel nötig).
Das Ergebnis kommt als Pull Request; die CI führt die Tests aus, der Merge ist nur bei grünem
Test-Check möglich (Review-Tor). Nach dem Merge schließt sich das Issue, die Karte wandert auf
„Done" und das `next`-Label wird automatisch entfernt.

Aktive Workflows: `collect-next-queue.yml` (Queue), `tests.yml` (Regressionstests),
`done-cleanup.yml` (Label-Aufräumen).

## Einmalige Einrichtung

### 1. Label `next` anlegen
- Repo → Issues → Labels → **New label** → Name: `next`.
- Dieses Label ist der Auslöser für die Queue (`collect-next-queue.yml`).

### 2. Projekt-Automationen (im GitHub-Project)
- Project → ⋯ → **Workflows**.
- Integrierte Regel **„Item closed → Set Status: Done"** aktivieren, damit die Karte nach dem
  Merge automatisch auf „Done" landet (der PR schließt das Issue über „Closes #…").

### 3. Branch-Schutz / Quality Gate (Ruleset für `main`)
- Repo → Settings → Branches → Ruleset für `main`.
- **Require a pull request before merging** und **Require status checks to pass** (Check
  „Tests") aktivieren. Damit kann nichts Ungeprüftes oder mit roten Tests nach `main`.

## Sicherheits-/Qualitätshinweise (Review-Tor)
- Kein Auto-Merge. Grüne Tests bedeuten „vorhandene Tests erfüllt", nicht „fachlich/rechtlich
  korrekt" – die inhaltliche Prüfung gehört in den Review durch einen Menschen.

## Hinweis zur Repo-Struktur
Diese Dateien liegen unter `prototype-site/`, weil das GitHub-Repo aus diesem Ordner befüllt
wird. Nach dem Push erscheinen sie im Repo-Wurzelverzeichnis unter `.github/workflows/` –
nur dort werden GitHub Actions ausgeführt.
