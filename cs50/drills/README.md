# Python Practice 1.0.0

Original companion coursework: 12 packs, each containing five Learn steps, 15 practical coding variations and three separate coding checks. Total: 180 drills, 36 checks, 665 explicit behavior cases. Networking-oriented synthetic examples reinforce core Python rather than teaching a vendor CLI by rote.

Entry: `/cs50/` is the guided course overview; `/cs50/practice.html` is the Python workspace. Existing Foundation and Project Studio deep links remain valid. Practice records reuse the approved-user, account-isolated Project Studio ledger and opt-in sync. No database migration or security-policy change was required.

## Files

- `index.json`: ordered topics, prerequisites, counts and project handoffs.
- `packs/*.json`: versioned task contracts, public case fixtures/assertions, starter code, targeted hints and five Learn steps.
- `core.js`: catalog/report validation, topic evidence and mixed-practice selection.
- `app.js`, `style.css`, `../practice.html`: interaction, accessible form labels, isolated account workspace and responsive navigation.
- `check_drill.py`: standard-library-only local execution harness. Read its warning before using it.
- `SETUP.md`: learner installation, execution, import, backup and safety instructions.

## Maintenance rules

Keep task IDs and versions stable. A change to behavior or expected cases requires a coordinated task version, test fingerprint, and migration/review plan. Do not reinterpret historical evidence as passing a different contract. Public test cases are deliberate; local results are unverified practice evidence, not protected exams.

Use the `py-*` task namespace. Shared ledger events retain schema 2 and supported event kinds. The drill report itself uses schema 1 and a distinct report kind. Project Studio filters its project counts/history to its own catalog so drill evidence does not manufacture project completion.

Do not put reference solutions or their source-containing reports into learner kits. Test output properties where possible, use self-review for technique/design claims that checks do not establish, and validate a reference implementation against every case before publishing.

The local harness is not a sandbox. Keep remote execution separate from production and never add production secrets to a learner execution environment. The site does not run Python in the browser or on its backend.
