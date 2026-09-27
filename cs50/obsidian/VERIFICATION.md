# Obsidian bridge 1.0.0 verification

This release adds optional desktop Obsidian integration. Installation and the first real-account synchronization require user action on the user's computer.

## Executed locally

- 165 Node tests passed: 131 existing repository tests plus 30 new contract/merge/transport tests and four tests loading the actual built plugin through a mocked Obsidian host with actual disposable files.
- Ten existing Python local-checker regression tests passed.
- Plugin and modified notebook JavaScript syntax checks passed.
- Manual-install archive is deterministic and contains only main.js, manifest.json, styles.css and SETUP.md. No credentials, note contents or plugin data.json are packaged.

The new tests cover two-way edits, title aliases, Markdown links, immutable collisions, PostgreSQL timestamp formatting, incomplete ancestry, retained conflicts, explicit merges, concurrent local edits, archive handling, non-propagation of deletions, durable retry, metadata recovery, wrong-account data, symlink/path rejection, unmarked-file exclusion, MFA request sequence and token non-persistence.

The browser suite additionally checks the inline connection setup, actual plugin download, bundle fingerprint and explicit notebook cloud-sync control. Read the release's GitHub Actions outcome for native-browser completion; local browser navigation is blocked by this environment's administrator policy. No application CSP was relaxed.

## Not verified as a real installed application

Obsidian itself was not launched. Its host API and all authenticated cloud responses in tests are mocked. The live user's vault, password, MFA codes and account sessions were not accessed. A real Obsidian desktop plus production-account round trip remains a required acceptance test; SETUP.md provides it. Mobile is explicitly disabled in this release.

## Security/storage boundaries

Database RLS and approval/MFA/session enforcement were inspected read-only and not changed. No service-role key, persistent password or persisted auth token is included. The plugin sends credentials only to the fixed existing Supabase Auth host and uses the caller's own account for note records. In-memory tokens remain accessible to the local process; other Obsidian plugins are not isolated from this process.

Cloud notes are not end-to-end encrypted. Local Markdown and plugin history remain readable on disk after sign-out. Revocation cannot recall downloaded copies. No attachments or unrelated vault files are uploaded automatically. The plugin does not install itself, and it is not reviewed/published in Obsidian's plugin directory.
