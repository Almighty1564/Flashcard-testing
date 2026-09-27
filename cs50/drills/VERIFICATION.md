# Python Practice 1.0.0: scope and verification

## Release scope

12 topics, 60 learning steps, 180 varied coding drills, 36 separate knowledge checks and 665 behavior cases. Each practice drill has three progressive hints. The local checker uses Python's standard library. No complete reference-solution bank is shipped in learner kits.

The default CS50 entry now offers one guided path. The Python workspace has Learn → Practice → Check → Apply stages, mixed/failed/untried/review selection, source drafts, case-report import, attempt history, and project handoffs. Existing Foundation and application-project paths remain reachable. Project counts ignore drill IDs.

## Checks run before staging

- 665/665 cases passed reviewed private reference implementations through the evaluator.
- 106 Node repository regression tests passed, including 17 new drill tests.
- 10 local Python harness tests passed: case isolation, controlled print/time limits, filtered environment, exception reporting, type-aware equality, CLI report generation and case fingerprints.
- Local Chromium DOM smoke covered learning stages, editor, hints, mixed selection and narrow layout. Storage/network/auth were mocked and the test-only fixture omitted CSP; this does not establish native persistence or production authentication behavior.

Staging CI runs the existing Project Studio browser integration and the new drill browser integration using a local HTTP server, actual IndexedDB, page CSP and downloaded ZIPs. Authentication and cloud APIs remain mocked. Consult successful workflow runs for final native-browser verification.

## Preservation and security boundaries

No database migration, approval change, MFA change, session revocation, or existing learner record rewrite is part of this release. New events use the existing own-account append-only Project Studio table and approved-session predicate. Optional cloud sync includes source and notes and is not end-to-end encrypted. Foundation coursework retains its separate storage and recovery controls.

The website does not execute submitted Python. The local checker is not a security sandbox. Report hashes detect mismatches, not fabricated claims or independent authorship. Tests do not prove exhaustive correctness, prescribed implementation style, equipment compatibility, or operational readiness. Networking examples use synthetic data and injected dependencies; they do not connect to real routers, satellite terminals, or production services.

Native production-account sign-in/cloud sync and Windows/macOS execution were not tested end-to-end for this release. Public GitHub Pages course assets remain public; private evidence requires the existing account authorization.
