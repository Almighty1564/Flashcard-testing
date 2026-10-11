# Inline Communicator study workspace

The approved output-2 layout lives on `tester.html`. Selecting a published MOD opens its study workspace without replacing the top-level page. MOD 1–3 remain visible; DEV, utilities, account and Appearance move into Workspace menu. Communicator restores the module catalog and full navigation.

## Existing behavior retained

- `mod1.html` remains the source of truth for questions, randomization, grading, sessions, progress, calculators, reporting and backup formats. It runs in one same-origin iframe rather than a duplicated engine.
- `communicator-study-embed.js` forwards a small, whitelisted set of original UI actions and snapshots. The parent does not receive credentials, complete question banks or a second writable progress store.
- The iframe receives the existing `study-reliability.js` and `study-presentation.js` safeguards because the legacy shell intentionally skips embedded layouts. These engines are unchanged.
- Returning to Communicator keeps the current module frame mounted. Reopening that module resumes its current question. Choosing another module prompts before leaving an incomplete session; recorded answers remain managed by the original engine. Refreshing the whole page does not promise session-queue restoration.
- Pending cloud saves block direct module-switch clicks. The existing engine retains its account-scoped outbox and error messages. Browser Back/Forward use normal navigation, not a separate grading operation.
- Existing server authorization runs before published modules become available. Logout/account change clears embedded content. Restored cached pages conceal and discard embedded study content until the existing account gate revalidates.
- Group selection starts the original single-group session. Multi-group selection remains in Build Custom Test. Export/import use the original module-specific progress format.
- Original standalone module URLs still work. A failed embed offers retry and the standalone route; unknown module requests stay on the catalog.

## Files and scope

`communicator-study.js` is the parent UI adapter; `communicator-study-embed.js` is the same-origin study bridge; `communicator-study.css` scopes the new layout to those two surfaces. `tester.html` loads the adapters. The small `atelier-portal.js` change dispatches account identity and resolves published modules into the same-page interface, retaining the previous fallback.

No authentication engine, Supabase configuration/schema, question bank, encryption, grading or progress-storage engine is modified.

## Verification

```
node --test tests/*.test.cjs podcast-media.test.mjs
python tests/communicator-study-browser.py
python tests/communicator-lifecycle-browser.py
python tests/workspace-browser.py
python tests/study-presentation-browser.py
```

Browser tests run actual application source with synthetic account/question/API fixtures. They never sign into a production account or write to production services. Checks cover navigation/history, original grade handlers, numeric validation, custom tests, groups, export/import, failed-load retry, role visibility, pending saves, cached-page revalidation and mobile controls. The read-only Actions workflow uploads screenshots for visual inspection.
