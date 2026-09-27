# Tomato08 ↔ Obsidian: desktop setup

This is an actual two-way notebook integration, not just Markdown export. It connects the Obsidian desktop app to your existing Tomato08 course cloud notebook. It is a custom plugin, not an official Obsidian product or a listing in the community directory. No Obsidian Sync subscription, API token, Node.js or Python installation is needed.

## 1. Back up and install

Start with a separate test vault or a backup of your vault.

1. Download `tomato08-notebook-sync.zip` from **Tomato08 → Notes → Connect Obsidian**.
2. Extract it. The folder `tomato08-notebook-sync` contains `main.js`, `manifest.json` and `styles.css`.
3. In Obsidian, open **Settings → Community plugins** and use the folder icon to open the plugins directory. If it is absent, open the vault folder and create `.obsidian/plugins` (or use your vault's custom configuration-folder name).
4. Copy the entire `tomato08-notebook-sync` folder into that plugins directory. Do not overwrite your whole `.obsidian` folder.
5. Restart/reload Obsidian. Enable community plugins for this vault, then enable **Tomato08 Notebook Sync** under Installed plugins. It will not appear under Browse because it is not submitted to the community directory.

The default layout is:

```text
YourVault/
  .obsidian/
    plugins/
      tomato08-notebook-sync/
        main.js
        manifest.json
        styles.css
```

This release is for desktop Obsidian 1.6 or newer (Windows, macOS or Linux). Mobile support is not enabled. The plugin uses the native Obsidian Vault API; it does not run an executable installer or require administrator rights.

## 2. Enable the website side

Open your course, sign in, and open **Notes → Connect Obsidian → Enable / sync course cloud**. Read and confirm the storage notice. Wait for **Cloud sync complete** before the first Obsidian sync.

This is the existing account-isolated course sync. Enabling it can also upload previously unsynced practice/project evidence, source snapshots and notes. It is not end-to-end encryption. Foundation history remains browser-local and is not sent to Obsidian.

While the notebook panel is open and visible, it checks for cloud changes approximately once per minute when cloud sync is enabled. The explicit sync button runs immediately. A dirty website draft is not replaced by an incoming edit.

## 3. Connect the Obsidian side

1. Open **Settings → Tomato08 Notebook Sync → Sign in**.
2. Enter your **Tomato08** username and password, not an Obsidian account.
3. Select your authenticator and enter its current six-digit code when required. Complete initial MFA enrollment on Tomato08 itself if you have not enrolled yet.
4. Press **Sync now**.

Your course notes will appear as real Markdown files under `Tomato08/Notes`. Open, edit and link them using normal Obsidian features. File names include a stable ID suffix so two similarly titled notes do not overwrite each other. The title, aliases and topic IDs are stored in properties above the body. Do not remove or change the `tomato08_id`, `tomato08_account`, or `tomato08_heads` properties.

The plugin binds to one Tomato08 account per vault. Use a separate vault for a different account. Passwords, access tokens, refresh tokens and MFA codes are not persisted in plugin settings. Sign in again after restarting/reloading Obsidian. Tokens remain in memory while the plugin is running. Other installed plugins execute in the same application; this is not an isolation boundary against a malicious local plugin.

## 4. Test both directions before relying on it

1. Create a website note titled `Sync test` with the text `From the website`.
2. Sync the website, then Obsidian. Confirm that text is in a managed Markdown file.
3. Edit its body in Obsidian to add `From Obsidian`, then run the plugin's Sync now command.
4. Return to the website and sync. Confirm both lines are present.
5. Make an offline edit on each side. Sync both. Confirm that the website presents conflicting revisions and Obsidian preserves conflict copies instead of choosing a winner.

Manual sync is the default. You can enable **Automatic sync while Obsidian is open** for 60-second checks while authenticated. Both the website and the plugin must sync for a change to reach the other side. This is not instantaneous background synchronization when the apps are closed.

## 5. Add notes from your existing vault

Nothing outside the managed folder is uploaded automatically.

Open the specific Markdown note, then use the command palette (Ctrl+P / Cmd+P): **Tomato08 Notebook Sync: Publish a copy of the active note**. Review the prompt. A copy is queued under `Tomato08/Notes`; the original remains unchanged. Use Sync now to upload the copy. Edit the managed copy going forward; the original and copy are not linked.

You can also use **Create a synced course note**. Rename its `tomato08_title` property and edit its body. Existing title aliases are retained on synchronization.

## Links and formatting

Ordinary `[[Note title]]` links and `[[note-id|Display label]]` links become explicit vault-path links when the destination is known uniquely. They map back to stable note IDs for the website. Links inside code and attachment embeds are not rewritten. Duplicate titles remain unresolved rather than choosing an arbitrary note.

Markdown body, supported note title, aliases, archived status and course-topic IDs synchronize. Extra YAML properties on managed files are preserved locally but are not synchronized. The website retains Markdown source but only renders its supported subset. Images, PDFs, audio, Canvas, attachments, plugins, block/heading link behavior and full Obsidian formatting are not synchronized. Keep important attachments backed up independently.

Website → **Notes → Connect Obsidian → Open current note in Obsidian** uses an `obsidian://` deep link containing only the note/account IDs, never login tokens. It opens the copy in the currently running, connected vault. The browser may ask permission to open Obsidian. Run Sync now first if it says the note is missing.

## Conflicts, recovery and deletion

Edits carry their parent revision IDs. If both sides edit the same earlier revision, both new branches are retained. No last-write-wins selection is applied to your local file.

Conflicting remote versions are copied to `Tomato08/Conflicts`. These are recovery files, not automatically synced notes. The main local file remains unchanged. You can resolve the conflict in the website's existing merge UI. Alternatively, review the copies, edit the managed original to combine the content, then run **Resolve conflict using the active note** and explicitly confirm the merge. Original history remains intact.

The bridge never propagates a file deletion. Removing/moving a managed file outside `Tomato08/Notes` pauses that file; it does not delete cloud history. **Restore missing copies** recreates missing local files from the last synchronized single-head revision without replacing existing files. A cloud archive updates `tomato08_archived`; it does not delete the Markdown file.

Back up your vault, the plugin's `data.json`, and the website's notebook JSON. Plugin state contains mappings, revision history and a durable outbox, but no login tokens. Do not reset unsupported or corrupt state: preserve it for recovery. If the plugin state is lost, existing managed files with known parent metadata can be recovered against cloud history; unknown ancestry is stopped rather than guessed.

Do not run two sync engines over the same managed folder. Exclude `Tomato08/Notes`, `Tomato08/Conflicts` and this plugin's `data.json` from other synchronization systems while testing this bridge. Each device needs its own state; use this bridge to exchange note revisions, not a copied `data.json` shared between running clients.

## Security and limits

Only the configured Tomato08 Supabase endpoint receives credentials and notebook records. No service-role key or database password is included. Existing account approval, session revocation, MFA and Row Level Security are checked; no policies were loosened. The plugin cannot revoke downloaded plaintext copies, and local files remain readable after sign-out. Protect your device and vault.

Only explicitly managed Markdown notes are uploaded. Unmarked files are ignored, even in the managed folder. Symlink paths, path traversal, conflicting IDs, incomplete ancestry and malformed metadata stop affected operations. Files changed during an incoming write are deferred instead of overwritten. The plugin's native requests have a response timeout; a timed-out insert may already have reached the server, so its durable outbox retries the same immutable ID.

Limits mirror the website's notebook: 140-character titles and 50,000-character bodies. The bridge additionally stops at 15,000 revisions or approximately 32 MB of cloud note history. No user content or secrets belong in bug reports.

## Troubleshooting

- **No notes appear:** enable website cloud sync and sync it first. Confirm both clients use the same Tomato08 account.
- **Access denied:** check approved-account status and MFA in the website. Do not disable RLS or paste privileged keys into the plugin.
- **Not connected after restart:** intentional; sign in again. Auth secrets are session-only.
- **Changes not visible yet:** run Sync now on each side. The browser notebook also checks periodically while open.
- **Conflicting revisions:** use the explicit merge workflow above. Do not delete the losing copy until you have verified the merged result.
- **Invalid properties:** restore the managed note's original `tomato08_*` metadata or restore a backup. The plugin will not guess the identity or ancestry.
- **Files missing:** use Restore missing copies or your vault backup.

## Implementation references

Obsidian's sample plugin documents manual installation and the plugin files:
https://github.com/obsidianmd/obsidian-sample-plugin

Obsidian's Vault API documents guarded file updates with `Vault.process`:
https://docs.obsidian.md/Plugins/Vault

Supabase's authenticator MFA flow:
https://supabase.com/docs/guides/auth/auth-mfa/totp

Source is in `cs50/obsidian/src`. `build.py` creates the bundle without downloading dependencies. This custom integration has not been reviewed by Obsidian's community-plugin directory. See VERIFICATION.md for tests and remaining validation boundaries.
