# Python Practice 1.0.0 verification

## Implemented coursework

Twelve topic packs contain 60 numbered learning steps, 180 practice drills, and 36 independent coding checks. The 216 tasks contain 665 behavior cases. Topics cover variables and values, decisions, loops, collections, strings and parsing, functions, sorting, exceptions and tests, files, objects and iterators, IP addressing, and simulated APIs/telemetry.

Each topic follows Learn (five steps) -> Practice (15 variations) -> Check (three fresh requirements without built-in hints) -> Apply (an existing project handoff). Functions and sorting each have 15 deliberately different practice requirements. Mixed practice supports selected topics, unattempted tasks, latest failures, and passed work due for a 48-hour review. This is extensive practice, not every conceivable Python feature or a calibrated mastery score.

The default /cs50/ entrance is now My Course, with an explicit path between Foundations, Python practice and application projects. Old Foundation and project links remain usable. The application engines and Foundation storage are not falsely presented as a single merged history.

## Executed checks

- All 665 cases passed against private reference implementations across all 216 tasks, including a separate execution through the actual isolated-process local checker.
- All 106 Node repository regression tests passed locally and in staging CI.
- All 10 local-checker regression tests passed, including time/output bounds, environment filtering, report creation, exception handling and contract fingerprints.
- 27 new native Chromium integration assertions passed on GitHub Actions run 36283616222, using a local HTTP origin, the actual page CSP, actual IndexedDB, actual reloads and actual downloaded ZIPs. The downloaded checker was executed and its real report imported. Covered duplicate/tampered report handling, hints, a failure after a pass, independent checks, mixed-session persistence, cross-context sync, project-score separation, project handoff, unified course navigation, mobile overflow, signout and the unauthenticated gate.
- All 12 existing Project Studio native browser assertions passed in the same run, including preserved notes, explicit conflict merge and immutable-record rejection.
- Auth and cloud responses in browser tests were synthetic mocks. No production account, device, token, password or operational data was used. These checks do not constitute live-account end-to-end verification or Windows/macOS/iOS runtime verification.

A test-harness timing defect and CSP-incompatible polling were corrected without relaxing the application CSP or removing assertions. CI now explicitly enables pipefail so logging cannot mask a failed browser test. Earlier staging runs with failures are not counted as passing evidence.

## Data preservation and security

No Supabase tables, policies, approval lists, MFA controls or session-revocation settings were changed by this release. Drill records use the existing account-isolated append-only Project Studio ledger. Project completion and project skill views filter out drill records. Foundation records remain under their existing preserved storage keys.

Optional cloud synchronization includes selected source snapshots and notes; it must be enabled explicitly and is not end-to-end encryption. Existing approval/session/MFA enforcement remains in place. Browser-local source drafts are not a live connection to the learner's filesystem.

## Execution and grading boundaries

The website displays assignments and saves evidence. It does not execute learner Python or connect to network equipment. Downloadable kits contain starter stubs or deliberate defects, not the private reference solutions. Checks use synthetic records and disposable local files.

The standard-library checker filters inherited environment variables and bounds execution time/output. It is not a security sandbox. Run only your own or trusted code. Imported reports are unsigned, user-editable practice evidence; matching hashes detect mismatched bytes, not dishonest authorship. Algorithm choice, requested techniques, code quality and independent reasoning still need review.

This release does not implement Nautobot/Ansible labs, production router management, a trusted remote grader, or hidden/proctored examinations. See SETUP.md for the complete local workflow.
