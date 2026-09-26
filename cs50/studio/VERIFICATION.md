# Project Studio 2.0.0 release verification

## Implemented scope

Three original project tracks, 15 versioned releases, 15 prediction questions, 45 targeted hints, 18 skill definitions and 13 automatically checked releases with 90 behavior cases. Multi-file starter packages contain learner stubs, not reference solutions. Flask integration and final packaging/maintenance are rubric-reviewed releases.

## Executed checks

- 90/90 behavior cases passed against private reference implementations using the local project runner. Untouched starter implementations were rejected. Reference implementations and their source-containing reports are not distributed in learner kits.
- 89/89 Node repository regression tests passed locally and in GitHub Actions, including 15 new Project Studio tests for preservation, immutable identity, draft conflicts, source/report validation and skill-evidence boundaries.
- 20 local Chromium DOM assertions passed with mocked storage/auth/network.
- 12 native Chromium integration assertions passed on GitHub Actions run 36270913977. These used a local HTTP server, actual IndexedDB, actual reloads, the page CSP and actual ZIP downloads. Covered push/pull between separate browser contexts against a mock cloud endpoint, explicit conflict merge, immutable collision rejection, mobile layout and sign-out cleanup. Auth and cloud responses remained mocked; no production account was used.
- 9 Supabase authorization assertions passed inside a rolled-back transaction: own insert/read, cross-account insert/read denial, immutable update/delete denial, server receipt timestamp protection, wrong-session ownership denial and anonymous privilege denial. SQL claims were simulated. No test learner records were retained.

## Deployment and trust boundaries

The new cs50_project_events table uses the existing security_private.is_allowed() predicate, including approved accounts, active session ownership/revocation and required MFA. It grants authenticated clients SELECT and column-limited INSERT only for their own rows. Cloud synchronization is opt-in. It includes selected source snapshots and notes and is not end-to-end encrypted.

No actual user's saved browser data was read or cleared. Legacy Foundation data remains under its original key; a separate safe key is used for compatible copies, and incompatible/malformed records remain recoverable. Project Studio does not silently import Foundation history into cloud storage.

This is not a production-account end-to-end authentication/sync test, exhaustive cross-browser test, penetration test, proof of independent authorship, or guarantee of learner application correctness. The local runner is not a sandbox. The optional fresh-install path requires dependency downloads and was not separately runtime-verified during this release. A hosted trusted grader, automatic learner-repository submissions and public hosting for learner Flask applications were not deployed.

See ../guides/PROJECT_STUDIO_SETUP.md for setup, recovery, cloud behavior and external infrastructure requirements.
