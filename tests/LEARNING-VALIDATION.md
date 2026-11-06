# Source-backed learning validation

Run from the repository root with Node 22 or newer:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
node --check learning-capture.js
node --check supabase/functions/learning-api/domain.mjs
node --check supabase/functions/learning-api/backend.mjs
```

The regression command includes both CommonJS and ES-module tests, including the provider-free pipeline and isolated SQL suite. CI installs the pinned development-only PGlite dependency before running `npm test`. The generic fictional course fixtures are test data only. They are never seeded into a real course or uploaded to a model.

`learning-capture.test.cjs` exercises optional-feature failure isolation, actual response capture before feedback, unchanged legacy result/SRS calls, stable attempt IDs, persistence acknowledgments, and account-scoped outbox behavior. `learning-domain.test.cjs` independently exercises source/objective validation, unreadable evidence rejection, exact-hash review validation, full-lesson gating, answer-key redaction, complete-retest feedback, optional confidence, and the limits of multiple-choice evidence.

Evidence saves are batched at 100 attempts. Oversized response/snapshot values become explicitly marked partial previews rather than silently complete records; the revision hash is calculated from the original snapshot. `learning-plan-evidence.test.cjs` checks that a plan resolves saved event IDs only within the caller's module/session/questions, retains provenance and partial markers, and records unavailable legacy responses as missing instead of inventing them. The author receives that evidence separately from trusted instructions.

The schema assertion in `learning-domain.test.cjs` is only a static guard. Separately, `learning-sql.test.mjs` executes the actual staged SQL in isolated PostgreSQL through PGlite, with explicit local Auth/Storage fixtures and a PostgreSQL SHA-256 compatibility function. Its 12 checks exercise migration syntax, row permissions and ownership, anonymous/unapproved denials, immutable evidence, leases, publication hashes/review roles, and queue limits. This verifies the SQL against that local engine; it does not reproduce hosted Supabase Auth, Storage, Edge Functions, or production schema compatibility. A missing PGlite dependency skips that SQL test, so check the skipped count; CI installs it explicitly.

`learning-endpoint.test.cjs` invokes the real request handler with in-memory request/response objects and a fake database. It checks origin/authentication denial, unavailable-schema/default-off behavior, bounded requests, privileged-action denial, server-selected attempt owner, and plan ownership checks. It never opens a socket or calls a model. `learning-workspace-security.test.cjs` checks original-source link protocol/origin restrictions and separation from legacy progress APIs.

Before deployment, use a disposable Supabase project or local Supabase stack. Apply the existing base schema and approval gate, then the staged learning migration. Use two separate approved test accounts, an unapproved account, and anonymous access. Verify:

1. Each approved account can access only its own plans, acknowledgments, results, and original sources through the authenticated API. Unapproved/anonymous access fails. A mismatched owner/plan/source ID fails.
2. Direct client reads cannot expose artifact answer keys, review records, job payloads, or source storage. Direct client writes and worker RPC calls fail.
3. Publication fails for a missing review role, REVISE, stale content hash, modified content, expired lease, or another job's lease. Only all required PASS reviews on identical bytes can publish.
4. Retest questions remain unavailable until every lesson in the current published artifact is acknowledged. Old-artifact acknowledgments cannot unlock revised content. Partial submissions reveal no answers.
5. Existing flashcards, quiz types, retest buttons, due reviews, progress saving and account switching work with the feature off, on, offline, and with the learning service failing. Existing SRS/progress rows are not rewritten by lesson reading or the new retest.
6. Failed or interrupted workers retry within limits, stale workers cannot publish, and exhausted jobs show a recoverable error. Model secrets stay server-side. Uploaded text is treated as evidence, never as executable instructions.

These remain deployment acceptance checks against a disposable Supabase environment, even where their local SQL/API equivalents already pass. No deployment, production migration, provider call, or real-account sign-in is required by the offline suite.

## Recorded local verification

The complete command passed **221 tests, zero failures and zero skips**, including the 12 isolated PostgreSQL checks (engine reported PostgreSQL 18.6). This is a local result, not a hosted Supabase result.

The browser walkthrough used `node scripts/preview-learning.mjs`, which serves the actual `mod1.html` and learning scripts with clearly labelled fictional fixtures, blocks the live cloud scripts, and restricts network connections to the local origin. The observed path was: existing quiz answers (wrong and guessed), completed-test summary with all four existing buttons plus the optional learning button, plan, original plaintext source fetch, two lesson acknowledgments, two-question fresh retest, results with Unknown confidence, disabled completed-retest button, and return to the original summary. The original save-call counter stayed at four through the new learning flow. This checks the local UI integration and legacy-save isolation; it does not validate live accounts, provider output, or deployed Edge hosting.
