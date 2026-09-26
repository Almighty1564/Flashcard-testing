# Tomato08 Project Studio: start, run, and verify

Open **https://tomato08.com/cs50/projects.html** with your approved Tomato08 account. Complete your existing MFA challenge when required. The original CS50 Foundation course remains available at `/cs50/`.

## What is implemented

Three original project tracks contain 15 releases: File Guardian (5), Equipment Manager (6), and Log Analyzer (4). Thirteen releases have 90 executable reference cases. The Flask interface and final packaging/maintenance release use explicit artifact-review criteria rather than automatic certification.

Each release provides a specification, prerequisites, short explanations, a prediction check, progressive hints, acceptance criteria and a changed requirement. Download a starter once and keep the same working repository as you advance. Functions deliberately raise `NotImplementedError`: the implementation is the learner's work.

Project reports record multi-file source, reference-check fingerprint, environment, Git revision when available, case results and learner-test results. Failed attempts remain visible. Project skill evidence is narrower than course completion. Passing outputs does not establish authorship, algorithm choice, code quality, security or production readiness.

## 1. First session: File Guardian, release fg-01

On the website, open **Projects → File Guardian → 01 / Inventory without touching originals**. Read the contract and prediction question. Download and extract the starter ZIP. Open the extracted directory in VS Code. Do not work inside the ZIP preview.

Use Python **3.11 or newer**. Python 3.12 or 3.13 is a practical choice for these supplied projects. The tested active environment used Python 3.13.5 and pytest 9.0.2. Package metadata pins pytest 9.0.2 and setuptools 82.0.1. Update pins intentionally, then rerun the tests.

### Windows PowerShell

From the extracted project folder:

```powershell
py -3 --version
py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[test]"
.venv\Scripts\python.exe tools/check_project.py --release fg-01
```

Directly invoking the virtual environment's interpreter avoids activation-policy changes. Do not run as administrator. If `py` is missing but `python` resolves to the intended installation, use `python` for the first two commands.

### macOS / Linux

```bash
python3 --version
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[test]'
.venv/bin/python tools/check_project.py --release fg-01
```

If your system lacks the venv module, install the Python/venv package appropriate to your OS, or use Harvard's browser development environment at https://cs50.dev/.

### What to edit

```text
src/file_guardian/core.py     Your implementation
tests/test_my_cases.py        Your own regression tests
.tomato08/checks/             Public reference checks; do not change to obtain a pass
releases/                    Versioned specifications
reports/                     New result file for every run; excluded from Git by default
```

The first failing run is expected. Replace the `inventory` stub with your own implementation. Make one case work, investigate the next failure, then add an original regression case under `tests/`. The supplied learner-test placeholder is skipped; it does not count as a test you wrote.

Run again and import the newly created JSON from `reports/` into **Work & evidence → Import project report**. Declare any hints, AI-written implementation or solution use accurately. The website stores your result and source snapshot; it never executes the uploaded source.

## 2. Continue without losing your work

Stay in the same project folder for fg-02 through fg-05. Change `--release` to the release identifier you are implementing. Do not extract a fresh starter over your implementation. Use the current release's exact contract.

File Guardian is intentionally conservative. Releases 1–3 are read-only. Release 4 copies approved files while leaving originals intact. Release 5 removes only unchanged copies listed in a validated manifest. These are learning exercises, not audited backup software. Test with disposable folders before using personal files. Permission failures, race conditions and partial filesystem operations require review beyond passing the reference cases.

On Windows hosts that cannot create symlinks, a relevant reference case may be skipped. The website will not call a skipped case passed. Review it in an environment that supports the operation, such as a Linux development environment, rather than disabling the check.

## 3. Test installation, not just your checkout

After a release works:

```powershell
# Windows
.venv\Scripts\python.exe tools/check_project.py --release fg-01 --fresh
```

```bash
# macOS / Linux
.venv/bin/python tools/check_project.py --release fg-01 --fresh
```

The `--fresh` option creates a fresh venv, installs `.[test]` and runs the reference checks away from the source directory without a `PYTHONPATH` shortcut. Dependency installation may need network access. A failed installation is a setup failure, not a passing report. This option executes your trusted package build configuration.

The default run uses the active environment and a temporary project copy. Reports distinguish both modes. Neither mode is an OS security sandbox.

## 4. Record a Git history

```bash
git init
git add .
git commit -m "Add project scaffold"
# After completing a release:
git add src tests docs
git commit -m "Implement inventory and regression tests"
```

Set your Git identity normally if Git requests it. Git is optional for the first run, but valuable for later evidence. The checker includes the current commit ID and whether your working tree is dirty; it does not record remote credentials or a repository token.

Uploading the project to your own private GitHub repository is optional. A repository URL in the notebook is an artifact reference, not automatic grading or permission for the website to access it.

## 5. Equipment Manager and Flask

The first four releases cover validation, CSV imports, SQLite replacement transactions, and one-pass streaming summaries. All four include behavior checks.

For the Flask release, install the optional dependencies in your project environment:

```powershell
.venv\Scripts\python.exe -m pip install -e ".[test,web]"
.venv\Scripts\python.exe -m pytest tests/
```

```bash
.venv/bin/python -m pip install -e '.[test,web]'
.venv/bin/python -m pytest tests/
```

Implement `create_app(database_path)` in `kit_manager/web.py` and use Flask's test client. Write your own valid/invalid-request tests. Run any interactive development server on `127.0.0.1` with fictional data. Do not expose it publicly just because a local test passes.

Record a repository/commit, tests, screenshots or observations, run instructions and known security gaps in the notebook. Check each review criterion. The website labels this **self-reviewed**, not automatically verified.

## 6. APIs and Log Analyzer

The pagination release injects a deterministic fake `fetch_page(cursor)` callable. It needs no live API or credential. This makes timeouts, malformed payloads, repeated cursors and partial failures reproducible.

Only after those cases work, write a separate adapter for a documented **read-only HTTPS API**. Set an explicit timeout, bounded retry policy, page limit and payload-size limit. Keep API credentials out of source and reports. Use local environment variables or a secret store; never put service-role credentials in browser JavaScript.

The source snapshot intentionally includes selected `src/`, `tests/`, `templates/`, `static/` files and root README/pyproject/requirements. It excludes `.git`, `.env` files, environments and generated reports. This is not a secret scanner. Inspect source comments, test fixtures and report contents before importing or enabling cloud sync.

## 7. Cloud sync, backups, and conflicts

**Account & backups → Enable cloud sync** is opt-in. It sends your imported code reports and notebook revisions to your own Supabase workspace, under the existing approved-account, active-session and MFA rules. Records are not visible to other learner accounts through the API. Source is not end-to-end encrypted; project administrators retain database-level authority.

Attempts and note revisions are append-only. No client UPDATE or DELETE permission is granted on the new event table. Server receipt time is generated by the database, not supplied by the browser. It is receipt time, not proof of when code was written or who wrote it.

Offline changes remain in IndexedDB and synchronize when you reopen/use the connected site and sync. Authentication and initial asset loading still require a connection. This is not a fully offline-installed PWA.

On another device, sign in with the same account and enable sync there. Concurrent note revisions remain visible as separate heads. Select a merge starting point, review the combined text and save a new revision. Older branches remain in history. Backups merge by immutable event ID; conflicting event IDs are rejected rather than silently overwritten.

Disabling sync stops further synchronization; it does not delete previously stored cloud records. Export backups before clearing browser data. Cloud administrators can implement account-data deletion through a controlled administrative process; no deletion UI is added by this release.

### Foundation-course recovery

The previous CS50 Foundation state remains in its original `tomato08_cs50_v1_<account>` key. Compatible state is copied into a separate safe key. Incompatible or malformed data is preserved and saving is paused, rather than replacing it with an empty record.

Use **Foundation course → Account → Export recovery data** to export the preserved raw record. Use **Export backup** for current in-memory work. Multiple-tab stale writes are refused. Project Studio cloud sync does not retroactively migrate or upload Foundation-course history.

## 8. What is not deployed, and what it would require

### A hosted, independently executed grader

This release runs checks locally. Reports are unsigned and editable; hashes detect mismatches, not dishonest authorship. Do not relabel a local report as server-verified merely because it was uploaded to Supabase.

A future remote grader needs a separate disposable execution service, isolated from production. Provision a dedicated nonprivileged worker or stronger isolation for untrusted submissions, resource/time/output limits, restricted networking, no production secrets, artifact-size limits and authenticated job submission. The worker should pin the assignment and check-suite version, fetch a particular source commit or upload snapshot, execute it and return a signed result through a service identity unavailable to the learner. Validate the result and signature on the server before issuing any verified-grader label.

Do not run learner code inside the production database, on a privileged self-hosted GitHub runner or on a service-role-enabled worker. A container alone is not a complete adversarial isolation design. Infrastructure accounts, budgets and credentials must be configured separately; none were provisioned or charged here.

### Automatic GitHub submission

A repository link is recorded but not fetched or graded by the site. Automatic integration would require a narrowly scoped GitHub App, authenticated webhook verification, explicit repository installation, commit-bound jobs, and the isolated grader above. Start with manual local reports and a private repository rather than granting broad personal tokens to browser code.

### A public deployment of the learner's Flask app

A local tutorial app is not production-ready. Before exposure, choose an authenticated host, review application access control and CSRF/session behavior, configure secret handling, production serving, database backups, TLS, monitoring and dependency updates, then test actual authorized and unauthorized requests. This release does not reconfigure your domain, make public GitHub Pages files private or deploy a learner Flask server.

### Actual independent competence

You must implement, test, use and maintain the project. A reviewer or another person can follow the README and request an unfamiliar modification. The platform records evidence; it cannot prove that no outside help was used.

## Official resource library

- Harvard CS50P: https://cs50.harvard.edu/python/
- Automate the Boring Stuff, 3rd edition: https://automatetheboringstuff.com/3e/
- MIT Missing Semester: https://missing.csail.mit.edu/2026/
- pytest: https://docs.pytest.org/en/stable/
- Python packaging: https://packaging.python.org/en/latest/tutorials/packaging-projects/
- Flask tutorial: https://flask.palletsprojects.com/en/stable/tutorial/
- Helsinki Python MOOC: https://programming-26.mooc.fi/
- Hypothesis: https://hypothesis.readthedocs.io/en/latest/quickstart.html
- Supabase row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security

Read the material needed for the current release, then apply it. There is no requirement to watch every resource before starting.
