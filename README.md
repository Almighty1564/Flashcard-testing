# Tomato08 Atelier — integrated flashcard website

This is the original Flashcard-testing application with the Atelier design applied. It replaces the earlier sample-data personal-platform prototype in this folder. There are no fabricated modules, project lists, bills, or simulated progress in the application.

Open the local review at **http://127.0.0.1:5500/** while its preview server is running. Use your existing Tomato08 username and password. A learner opens the module collection; a developer can choose the learner workspace or question studio. The app uses the existing Supabase project, so actions you take after signing in can affect real account data.

## Included functionality

- Live weather with clothing advice, local/US/world news slides, and US/European sports headlines on the learning page. See [BRIEFING.md](BRIEFING.md) for sources, privacy, behavior, and validation.
- Existing sign-in, tester/developer routing, and sign-out.
- Published module collection with module search and recovery from loading errors.
- Original flashcard, multiple-choice, multiple-select, numeric, diagram/image-entry, and matching question engines.
- Original study scheduling, custom tests, card progress, test history, ranking, and question reporting.
- Original developer module/group/question editor, images, preview, imports/exports, report management, and learner activity.
- Original calculation practice and embedded visual tool, plus the legacy study page.
- AI wrong-answer generation through the deployed `distractors` function.

## Reliability and authorization hardening

The current application adds safeguards around the original engines rather than replacing the question bank or learner data:

- Numeric/type-in grading validates the complete value, including both endpoints of a range and the expected unit. A partial numeric prefix is no longer sufficient.
- Learner writes use a local per-account outbox, visible save state, automatic retries, and ordered/idempotent backend RPCs so a stale retry cannot overwrite a newer answer.
- The sidebar distinguishes reviewed questions from strong recall; ranking counts the latest `correct`/`confident` result instead of any repetition.
- Question Studio saves are atomic and revision checked. A stale browser tab is rejected instead of deleting or overwriting newer module work.
- Signed-out protected pages return through the single branded login page and then return to the requested Tomato08 route.
- Matching interactions support keyboard activation, and authoring Save/New controls retain normal keyboard operation.
- AI distractor generation validates developer authorization server-side, has a daily request limit, and times out failed provider calls.

The database changes are versioned under `supabase/migrations/`. The canonical deployed Edge Function source is `supabase/functions/distractors/index.ts`; the root `index.ts` is only a compatibility pointer so there is no second deployable copy to drift.

## What changed in the visual layer

`index.html` and `tester.html` are rebuilt around the Atelier design and the original `FC` APIs. `atelier-portal.js` connects those screens to the existing account and module workflows. `portal.css` styles the entry and collection screens.

`atelier.css` and `atelier-shell.js` apply the same design to the original inner pages. Existing study/developer controls and embedded export templates are preserved. Mobile navigation, keyboard focus, static form labels, error states, and reduced-motion support are included. The visual layer adds no continuous animation loop. Existing study/presence timers are retained; collection presence pauses when the tab is hidden.

`study-reliability.js` and `authoring-reliability.js` are deliberately small adapters around the existing study and authoring engines. They own recoverable progress writes, strict entry grading, keyboard matching, revision-aware authoring saves, and conflict messaging.

## Validation

The repository regression workflow runs the Node test suite and JavaScript syntax checks on pushes and pull requests. Current tests cover weather normalization, podcast media behavior, strict numeric/range grading, unit mismatches, partial-range rejection, and tolerance handling.

Read-only Supabase inspection confirms the core tables and private media bucket remain present. RLS is enabled on exposed application tables. The reliability migrations add revision tracking, idempotent save keys, ordered progress writes, AI quota tracking, policy cleanup, and missing foreign-key indexes without modifying question content.

Authenticated end-to-end browser flows still require an existing tester/developer account. Before a release that substantially changes study or authoring behavior, exercise: sign in, open a module, answer and reload a card, finish a test, report a question, edit and save a draft, upload an image, and generate AI distractors.

## GitHub Pages handoff

There is no frontend build step. Publish the **complete repository contents**, including the CSS/JavaScript files, at the same level as `index.html`. Keep `CNAME` and `supabase-config.js` with the site. The Supabase browser library is pinned to version 2.45.4 on jsDelivr. Never add a service-role key or secret key to browser files.

The local origin `http://127.0.0.1:5500` is allowed by the deployed AI function; arbitrary local ports are intentionally blocked by its CORS allowlist. Opening the HTML via `file://` is unsuitable for the complete connected experience.

The historical platform assessment and architecture illustration describe future options, not deployed services.
