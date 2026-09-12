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
- AI wrong-answer generation through the existing deployed `distractors` function.

## What changed

`index.html` and `tester.html` are rebuilt around the Atelier design and the original `FC` APIs. `atelier-portal.js` connects those screens to the existing account and module workflows. `portal.css` styles the entry and collection screens.

`atelier.css` and `atelier-shell.js` apply the same design to the original inner pages. Existing study/developer controls and embedded export templates are preserved. Mobile navigation, keyboard focus, static form labels, error states, and reduced-motion support are included. The visual layer adds no continuous animation loop. Existing study/presence timers are retained; collection presence pauses when the tab is hidden.

Two compatibility repairs are included: the legacy study page shares `FC.client` and its session; AI generation uses the signed-in user's session instead of falling back to a publishable key. Failed or stale AI requests leave drafted answers and images intact. The original Supabase configuration and shared cloud API are preserved.

## Validation and limits

Checked all seven page entrypoints, local asset references, duplicate IDs, external JavaScript syntax, and 11 inline script blocks. Confirmed 253 original inner-page control IDs remain present and the main study/developer engines and export templates are unchanged. Fifteen account/module scenarios and five AI helper scenarios pass using local service stubs. These tests made no calls to real accounts or paid models.

Read-only Supabase inspection confirms the core tables, columns, role constraints, reporting/ranking RPCs, and private image bucket match the application. See [backend-verification.md](backend-verification.md) for the precise scope and pre-existing limitations.

Authenticated browser flows, visual rendering on physical iPhone/iPad devices, real progress writes, image uploads, and model responses have **not** been exercised. Before publication, review with existing tester/developer accounts: sign in, open a module, study a card, reload progress, take a test, report a question, edit a draft, upload an image, and generate wrong answers. These actions use the real backend.

Stud-number editing is present in the original UI but its database column/RPC is not installed; the existing application reports that missing capability. AI server authorization and other pre-existing backend review items remain described in the verification report. No database migrations, live function changes, GitHub pushes, or public deployment were made.

## GitHub Pages handoff

There is no build step or new frontend dependency. Publish the **complete folder contents**, including the new CSS/JavaScript and `assets` directory, at the same level as the repository's current `index.html`. Keep `CNAME` and `supabase-config.js` with the site. The existing Supabase library remains pinned to version 2.45.4 on jsDelivr. Never add a service-role key or secret key to these browser files.

The local origin `http://127.0.0.1:5500` is already allowed by the deployed AI function; arbitrary local ports may be blocked by its CORS policy. Opening the HTML via `file://` is unsuitable for the complete connected experience.

`index.ts` is retained from the user's repository as supplied. It is not a synchronized copy of the currently deployed Edge Function and should not be redeployed as part of this visual update. The historical platform assessment and architecture illustration describe future options, not deployed services.

The earlier interactive design prototype was preserved separately in the workspace's `work/atelier-reference` folder before replacement.
