# Obsidian bridge 1.0.0 verification

Release date: 2026-09-27. This release adds optional desktop Obsidian integration. Installation and the first real-account synchronization require user action on the user's computer.

## Executed verification

Staging Actions run 36344820939 applied the reviewed source patch, ran the tests successfully and committed the application sources to the staging branch.

- 165 Node tests passed: 131 existing repository tests plus 30 new contract/merge/transport tests and four tests loading the actual built plugin through a mocked Obsidian host with actual disposable files.
- Ten existing Python local-checker regression tests passed.
- Plugin and modified notebook JavaScript syntax checks passed.
- 78 native Chromium browser assertions passed: 39 connected-course/notebook assertions, 12 existing Project Studio assertions and 27 existing Python practice assertions.
- The five added notebook checks cover inline setup without another tab, no web password collection for Obsidian, a real plugin ZIP download, exact agreement with the tested bundle, and explicit notebook cloud-sync consent.
- The downloaded installable ZIP exactly matched the locally generated release: SHA-256 a42797aaa9d6a5bde36874cb35d1163002cd3e81e667747ebade85eae4577e43.
- Manual-install archive is deterministic and contains only main.js, manifest.json, styles.css and SETUP.md. No credentials, note contents or plugin data.json are packaged.

The new plugin tests cover two-way edits, title aliases, Markdown links, immutable collisions, PostgreSQL timestamp formatting, incomplete ancestry, retained conflicts, explicit merges, concurrent local edits, archive handling, non-propagation of deletions, durable retry, metadata recovery, wrong-account data, symlink/path rejection, unmarked-file exclusion, MFA request sequence and token non-persistence.

The browser tests use actual HTTP, CSP, IndexedDB, reloads and downloads with synthetic authentication/cloud responses. An existing notebook refresh was corrected to preserve the final cloud-sync status instead of immediately replacing it with a generic local-save message. Failed staging runs are not counted as successful verification. No application CSP or assertions were removed. The one-time source-transfer workflow is removed from the released tree; ongoing verification has read-only repository permissions.

## Not verified as a real installed application

Obsidian itself was not launched. Its host API and all authenticated cloud responses in tests are mocked. The live user's vault, password, MFA codes and account sessions were not accessed. A real Obsidian desktop plus production-account round trip remains a required acceptance test; SETUP.md provides it. Mobile is explicitly disabled in this release. Native browser verification was Chromium on Linux, not Windows, macOS, Safari or iOS coverage.

## Security/storage boundaries

Database RLS and approval/MFA/session enforcement were inspected read-only and not changed. No service-role key, persistent password or persisted auth token is included. The plugin sends credentials only to the fixed existing Supabase Auth host and uses the caller's own account for note records. In-memory tokens remain accessible to the local process; other Obsidian plugins are not isolated from this process.

Cloud notes are not end-to-end encrypted. Local Markdown and plugin history remain readable on disk after sign-out. Revocation cannot recall downloaded copies. No attachments or unrelated vault files are uploaded automatically. The plugin does not install itself, and it is not reviewed/published in Obsidian's plugin directory.
