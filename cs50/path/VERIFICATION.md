# Connected course map and notebook: verification

Release date: 2026-09-27. This release reorganizes existing coursework and adds linked notes. It does not claim a new network-automation curriculum or a proctored assessment system.

## Implemented

- One default entrance: /cs50/ opens /cs50/path.html. Old direct lesson, drill and project links continue to work.
- Thirty-nine connected objectives spanning all 12 Foundation sections, 12 Python practice packs and 15 project releases, organized into five phases.
- Focused and whole-course SVG dependency graphs with multiple prerequisite edges, zoom, fit and keyboard-operable topic cards. A searchable outline provides an equivalent text navigation route.
- Each objective exposes Foundation, Practice, Apply, and Review & evidence checklists, explicit soft prerequisites, and a next recommended activity. Browsing ahead never manufactures completion.
- Shared Course map / Progress / Tools navigation and a Notes panel across the Foundation, practice and project workspaces. Previous topic browsers remain available explicitly, rather than competing with the guided path.
- Account-isolated notebook with autosaved revisions, linked topics, [[note links]], backlinks, title aliases, limited safe Markdown preview, search, archive/recovery, conflict merging, JSON backup/import and Markdown export.
- Notes and reflections use the existing append-only Project Studio ledger and optional cloud synchronization. They do not award implementation credit. Foundation progress is read without overwriting its original storage keys.

## Tests actually executed

Staging Actions run 36342328031 applied the exact reviewed source patch and fixes and completed successfully:

- 131 Node repository regression tests, including 25 new course-map/notebook core tests.
- 10 local Python checker regression tests.
- 34 new native Chromium course-map/notebook assertions: redirects, prerequisite edges, soft navigation, graph controls, keyboard operation, actual IndexedDB storage, actual reloads, linked notes, rename aliases, safe preview, shared notebook access, explicit conflict merging, archives, downloads, cross-context synchronization, mobile overflow, account separation and signout clearing.
- 12 existing native Project Studio assertions and 27 existing Python practice assertions. Total native browser assertions: 73.

The browser runs used a real local HTTP origin, actual page CSP, actual browser storage and downloaded files. Authentication and cloud responses were synthetic mocks, not production-account end-to-end verification. No learner data, real network devices, passwords or production tokens were used. Native testing was Chromium on Linux, not a claim of Windows, macOS, Safari or iOS runtime coverage.

An editor-object alias bug was found in staging and fixed so a rename preserves the original note title. A test was corrected to expand a revision before clicking its merge control. Earlier failed runs are not counted as passing evidence. No assertions or CSP protections were removed to obtain a pass.

## Preservation and limitations

No Supabase schema, RLS policy, approved-account list, MFA requirement or session-revocation rule was changed. Existing course contracts, quiz answers, local checkers and source task IDs remain unchanged. The path overlays their real recorded evidence; it does not claim reading or notes are proof of coding competence.

Foundation results remain browser-local. Optional cloud synchronization includes notes, practice and project evidence and is not end-to-end encryption. Export backups before clearing site storage. Locally saved notes are not secure against someone with access to the same browser profile or device.

The notebook is a lightweight built-in tool, not an Obsidian vault integration or full Markdown implementation. It does not execute note code or load user-provided HTML/plugins. Its JSON backups retain revision history; exported Markdown is a portable single-note copy.

GitHub Pages still serves static course files publicly. Account authorization protects personal evidence and database access, not the public static repository. The learning platform does not execute learner Python or manage production network equipment.
