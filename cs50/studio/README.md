# Project Studio 2.0.0

Additive upgrade to Tomato08 CS50 Applied. Entry: `/cs50/projects.html`.

## Scope

15 release briefs; 15 prediction checks; 45 progressive hints; 3 starter repositories; 13 automatically checked releases with 90 reference cases. Equipment Manager's Flask and final packaging/maintenance releases use explicit artifact review. `--fresh` on any automatically checked release tests clean installation separately.

Files: `catalog.json` holds the versioned curriculum, expected case names and check fingerprints. `templates.json` holds the starter files used to create ZIPs in the browser. `check_project.py` is the multi-file local runner. `core.js` validates reports and classifies evidence; `store.js` provides append-only IndexedDB and optional cloud synchronization; `app.js` renders the UI. No learner solutions are included in starter kits.

## Storage

New table: `public.cs50_project_events`. Approved users may SELECT and INSERT only their own rows. INSERT grants exclude server receipt time. Existing `security_private.is_allowed()` enforces approval, current-session ownership/revocation and required MFA. No client UPDATE/DELETE. Payload size is bounded. Cloud sync is opt-in and contains source snapshots/notes; no end-to-end encryption is claimed.

A full paged pull avoids a timestamp-watermark race. Immutable event IDs support retry deduplication. Drafts have parent revision IDs; concurrent branches are visible and resolved by creating a new revision. This is intentionally small-cohort synchronization, not a high-volume event streaming service. The UI caps pulls at 20,000 events and preserves data if that ceiling is reached.

Foundation coursework retains its original keys. The patch uses a separate safe key, never overwrites unsupported raw data, pauses writes on storage conflicts and provides recovery export. Foundation history is not automatically uploaded to the new Project Studio ledger. Its section indicators now count coursework rather than granting broad competency levels.

## Trust

Local reports and self-reviews remain unverified. A hash binds a result to bytes but is not a signature or authorship proof. Only a future isolated grader with server-authenticated results should create a verified-grader evidence level. Uploaded code is displayed/archived, never executed by the website or production backend.

The starter runner filters inherited environment variables, snapshots only selected source paths and limits wall time/output. It is not a security sandbox and still runs with the user's OS permissions. Symlinks in submitted source are refused. Reviewed projects, filesystem races, permission failures and production security still need independent review beyond provided cases.

See `../guides/PROJECT_STUDIO_SETUP.md` for exact learner commands, cloud behavior, recovery and externally provisioned capabilities.
