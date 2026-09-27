# Tomato08 Notebook Sync

Custom desktop Obsidian plugin and website controls for two-way sync of managed Markdown notes. Manual installation is required. See SETUP.md before using it with an existing vault.

The plugin uses the existing `cs50_project_events` append-only table with `draft / course-note / note_schema=1` revisions. No database schema or authorization changes are needed. Source is deliberately small and dependency-free except for Obsidian's desktop API and bundled Node modules.

- `src/core.cjs`: contract validation, causal heads, Markdown metadata and reversible note links.
- `src/transport.cjs`: fixed-origin Supabase Auth, MFA, access checks and note-only requests. Tokens are in memory only.
- `src/engine.cjs`: durable outbox, guarded two-way merge, recovery and explicit conflicts.
- `src/plugin.cjs`: native Obsidian UI, Vault API, scoped file handling and symlink rejection.
- `build.py`: reproducible CommonJS bundle.
- `package.py`: deterministic ZIP and published checksums.

Run `python cs50/obsidian/build.py`, then `python cs50/obsidian/package.py`. Validate with `node --test tests/obsidian-*.test.cjs`. The website's existing notebook imports are compatible; notes do not become grading evidence.

The custom plugin is not published in Obsidian's community directory. It is not Obsidian Sync. Its app/server interactions are tested with adapters; see VERIFICATION.md for boundaries. Do not treat a successful mocked test as a real vault/account acceptance test.
