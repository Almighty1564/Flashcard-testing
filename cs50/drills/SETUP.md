# Tomato08 Python Practice: start here

## Your course order

Open My Course at https://tomato08.com/cs50/ . New programmers begin Foundations at Scratch and complete the related exercises as they learn. After the Python introduction, enter Python Practice. Each of its twelve topics follows the same sequence:

1. **Learn:** five numbered explanations and worked examples. Reviewed does not mean tested.
2. **Practice:** fifteen coding tasks with meaningfully different requirements and techniques.
3. **Check understanding:** three fresh coding problems without built-in hints. Documentation is allowed; tailored help is declared.
4. **Apply:** follow the handoff into an existing application project. Project prerequisites still apply. A link is not an instruction to skip missing prerequisites.

You can browse ahead. The path recommends an order instead of locking experienced learners out. Complete a fresh check independently after assisted practice. None of these records is a Harvard credential or a proctored exam.

## What you install

Use a personal training computer or an approved development environment. Python **3.10 or later** is required. Install a supported Python release from https://www.python.org/downloads/ and an editor such as VS Code. The drill checker uses only Python's standard library: no pip packages, API account, router, or paid service is required.

Windows: check `py --version`. macOS/Linux: check `python3 --version`. A system with `python` pointing to the appropriate interpreter can use that command instead.

The website records your work. **It does not execute Python**, access your local folders, or connect to network equipment. Browser drafts and disk files are not automatically linked.

## Download and extract a kit

Choose one drill, a topic, or all 216 assignments. Extract the ZIP before running anything. Open the extracted directory in your editor. It contains:

```
check_drill.py
drills.json
ASSIGNMENTS.md
START_HERE.txt
solutions/
    py-values-01.py
    ...
```

Starter files contain TODOs or deliberately broken implementations. Completed reference solutions are not included. A failed initial check is expected.

## Run your first assignment

Read `py-values-01` in ASSIGNMENTS.md. Edit `solutions/py-values-01.py`, save it, and run the command from the extracted kit directory:

Windows:
```
py check_drill.py --task py-values-01
```

macOS/Linux:
```
python3 check_drill.py --task py-values-01
```

List tasks:
```
python3 check_drill.py --list
```

To use a file exported from the browser editor:
```
python3 check_drill.py --task py-values-01 --source path/to/py-values-01.py
```

Early exercises receive an injected `data` value and must assign `result`. Do not replace `data` with a hardcoded sample. Later exercises define the functions or classes named in the contract. Filesystem exercises receive a disposable `root` Path. The example fixture and expected assertions are visible on the website.

Run these exercises through the checker. Executing an early file directly may raise `NameError: data is not defined` because the exercise depends on the supplied test input. For standalone experimentation you can use a separate scratch file; do not change the assessed contract.

## Import the result

The checker writes `reports/<task-id>.json`, including pass/fail for each case and the exact tested source. Review it, return to the matching website exercise, declare your assistance, and click **Import checker result**. A failure is also saved as useful evidence. Re-running generates a new attempt ID; importing the same report twice does not create a new achievement.

Fingerprints detect an accidental mismatch between source, task version, and test set. They are not signatures. Local reports are editable and cannot establish independent authorship, exhaustive correctness, prescribed technique, code quality, or production readiness.

Where a task specifies a technique, explain it in your notes. Several tests inspect in-place versus copy behavior, parameter calling rules, lazy iteration, or seeded defects, but no test set proves all aspects of understanding.

## Mixed practice and reviews

Use Mixed practice to select topics and choose mixed, untried, latest-failed, or due-for-review tasks. A saved mixed session resumes its selected task list. Fresh knowledge checks are deliberately separate from the practice pool. Revisited tasks are not claimed to be newly generated questions.

The displayed counts mean activities with evidence. They are not a percentage of Python knowledge. A recent failed attempt stays visible even after an earlier pass. Review intervals are training rules rather than scientific claims about when knowledge expires.

## Saving, cloud sync, and recovery

Python Practice and Project Studio share the existing account-separated IndexedDB ledger. Code drafts, notes, and attempts are append-only records. Concurrent edits create separate branches until explicitly merged. Foundation coursework remains in its existing separate storage; this release does not migrate or erase it.

Cloud sync is optional in Account. It uses the existing approved-account, session, and required-MFA checks. Enabling it shares the ledger across your approved sessions/devices and uploads source snapshots and notes. It is **not end-to-end encryption**. Only use synthetic or non-sensitive training data. A disconnected device retains saved local work; unsynced work is lost if its browser storage is cleared.

Export a learning backup before clearing browser data. It contains both drills and Project Studio records. Import your own trusted backup only. Conflicting immutable IDs are rejected, and divergent note versions require an explicit merge. The old Foundation backup is different and remains available through Foundation Account controls.

## Safety and limits

The checker runs code on your computer with bounded case runtime/output, a temporary working directory, and a filtered inherited environment. **It is not a security sandbox.** Use your own or trusted code only, not unreviewed submissions from strangers. Do not run as administrator, on operational equipment, or from a directory containing sensitive data. Python can still access resources outside the temporary directory.

Tasks use synthetic observations and injected fake collectors. No real SSH/HTTP device execution, configuration changes, SATCOM equipment control, or customer integration is introduced by these drills. Those are later supervised/lab application work.

## Coverage and next steps

The twelve topics are values, conditions, loops, collections, parsing, functions, sorting, exceptions/testing, files, objects/iterators, IP addressing, and API/telemetry integration. This is a substantial practice foundation, **not every possible use of Python syntax**.

Use the Apply stage to integrate skills in File Guardian, Equipment Manager, or Log Analyzer. Keep your existing project repository, tests, and documentation. Do not replace completed project code with a new blank starter.

Official references:
- https://docs.python.org/3/tutorial/
- https://docs.python.org/3/howto/sorting.html
- https://docs.python.org/3/library/ipaddress.html
- https://cs50.harvard.edu/python/
- https://code.visualstudio.com/docs/python/python-tutorial
