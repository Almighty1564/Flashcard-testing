# CS50 Applied / Tomato08

An original, unofficial hands-on companion to the Harvard CS50 video selected by the learner. It does not copy official assignment solutions or award Harvard credentials.

## Included

- 12 sections with original lesson notes and official lesson links.
- 72 shuffled multiple-choice/prediction questions, graded in the browser.
- 60 assignments: builds, repairs, change requests, delayed rebuilds, and projects.
- 30 single-file coding labs with 112 behavior cases across C, Python, SQLite, JavaScript, and Flask.
- Source drafts, downloadable lab ZIPs, progressive hints, result imports, self-review rubrics, and evidence history.
- HTML preview in a sandboxed iframe, without parent-origin or network access.
- Browser-local account-separated progress and explicit backup export/import.

## Start

Open `/cs50/`, select Setup, then begin the section corresponding to your lecture. The Learning page has a CS50 Applied entry.

For an automatic lab: download and extract its ZIP, implement the source, then run `python check.py` in that folder. Windows may use `py`; other systems may use `python3`. Import `result.json` into the same assignment. C needs GCC/Clang, JavaScript needs Node.js, and Flask uses the included requirements file. Python and SQLite labs otherwise use Python 3.10+ and its standard library. Only run code you trust; the checker is not a security sandbox.

Scratch and larger projects use explicit self-review rubrics and artifact locations. Their completion is not automatically verified. HTML can be previewed here, but C/Python/SQL/Flask execute in your development environment, not in the course page.

## Storage and accounts

The page reuses the existing public Supabase configuration and `flashcard_portal_session` authentication storage. No database changes or course-table writes were made. Course progress is stored in `tomato08_cs50_v1_<account>` in this browser only. Guest progress is separate. Sign-in is not cross-device synchronization. Export a backup before clearing data or switching devices. Backups contain code and notes and should remain private.

## Progress interpretation

Quiz completion and implementation evidence are separate. Documentation-only work may be independently reported; hints, tailored AI help, and solutions are assisted. A later rebuild requires at least 48 hours after an independent build to contribute delayed evidence. This is a practice rule, not a validated mastery threshold. Reports and backups are unsigned and editable; no claim of secure grading, proctoring, or verified independence is made. Required techniques and design criteria still need review beyond output checks.

## Maintainer notes

`manifest.json` lists the JSON section files under `units/`. `app.js` is plain JavaScript; no build system is required. `check.py` implements the local runners. Keep task IDs stable. Coordinate changes to curriculum, checker, and state versions rather than silently changing historical test expectations.

Serve the repository root over HTTP for local development, for example `python -m http.server 8000 --bind 127.0.0.1`, then open `/cs50/`. Opening the multi-file index directly as `file://` will not load its JSON. The supplied standalone HTML in the downloadable package instead bundles the course and runs without account integration.

## Verification for release 1.0.0

104/104 C, Python, SQLite, and JavaScript reference cases passed across 28 automatic labs. Deliberately broken implementations were rejected; a nonterminating-loop timeout was tested. The 8 Flask cases in 2 labs were written but not runtime-verified because Flask was unavailable in the build environment. Optional sanitizer support was not comprehensively verified.

A real Chromium DOM harness exercised all sections and assignments, quiz grading, drafts, simulated reload persistence, ZIP export, real checker report import, tampered-hash rejection, self-review, backups, HTML preview isolation, and mobile layout. Browser network navigation was restricted; this is not a claim of live end-to-end account or cross-browser verification.
